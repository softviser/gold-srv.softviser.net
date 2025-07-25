const LoggerHelper = require('./utils/logger');
const settingsService = require('./utils/settingsService');
const DateHelper = require('./utils/dateHelper');

class PriceWatcher {
  constructor(db, socketChannelManager) {
    this.db = db;
    this.socketManager = socketChannelManager;
    this.collection = db.collection('current_prices');
    this.isWatching = false;
    this.changeStream = null;
    this.priceHistory = new Map(); // Symbol -> last known prices
    
    this.setupWatcher();
  }

  // MongoDB Change Stream kurulumu - Deaktif (Replica set gerektiriyor)
  async setupWatcher() {
    try {
      // Change stream replica set gerektirir, bu durumda deaktif
      // Fiyat broadcasting artık doğrudan servisler tarafından yapılıyor
      console.log('ℹ️ PriceWatcher disabled - MongoDB Change Streams require replica set');
      console.log('ℹ️ Price broadcasting is handled directly by price services');
      
      this.isWatching = false;
      LoggerHelper.logSuccess('system', 'Price watcher initialized (disabled - using direct service broadcasting)');

    } catch (error) {
      LoggerHelper.logError('system', error, 'Failed to setup price watcher');
    }
  }

  // Fiyat değişikliği işleme
  handlePriceChange(change) {
    try {
      const { operationType, fullDocument, documentKey } = change;
      
      if (!fullDocument) return;

      const priceData = this.formatPriceData(fullDocument);
      const anomalyCheck = this.checkPriceAnomaly(priceData);

      // Real-time broadcast
      this.broadcastPriceUpdate(priceData, operationType);

      // Anomali varsa uyarı gönder
      if (anomalyCheck.isAnomaly) {
        this.broadcastAnomalyAlert(priceData, anomalyCheck);
      }

      // Fiyat geçmişini güncelle
      this.updatePriceHistory(priceData);

      LoggerHelper.logSuccess('system', 
        `Price update broadcasted: ${priceData.symbol} ${priceData.buyPrice}/${priceData.sellPrice}`
      );

    } catch (error) {
      LoggerHelper.logError('system', error, 'Error handling price change');
    }
  }

  // Fiyat verisi formatlama
  formatPriceData(document) {
    const now = DateHelper.createDate();
    
    return {
      symbol: document.symbol,
      source: document.source,
      sourceId: document.sourceId,
      buyPrice: parseFloat(document.buyPrice || 0),
      sellPrice: parseFloat(document.sellPrice || 0),
      midPrice: (parseFloat(document.buyPrice || 0) + parseFloat(document.sellPrice || 0)) / 2,
      currency: document.currency || 'TRY',
      timestamp: document.lastUpdated || now,
      broadcastTime: now,
      metadata: {
        sourceUrl: document.sourceUrl,
        category: document.category,
        priority: document.priority,
        isActive: document.isActive
      }
    };
  }

  // Anomali kontrolü
  checkPriceAnomaly(currentPrice) {
    const result = {
      isAnomaly: false,
      changePercent: 0,
      reason: null,
      severity: 'normal'
    };

    // Anomali tespiti aktif mi?
    if (!settingsService.isAnomalyDetectionEnabled()) {
      return result;
    }

    const maxChange = settingsService.getMaxPriceChangePercent();
    const lastPrice = this.priceHistory.get(currentPrice.symbol);

    if (!lastPrice) {
      // İlk fiyat verisi, anomali değil
      return result;
    }

    // Ortalama fiyat değişim yüzdesini hesapla
    const buyChange = ((currentPrice.buyPrice - lastPrice.buyPrice) / lastPrice.buyPrice) * 100;
    const sellChange = ((currentPrice.sellPrice - lastPrice.sellPrice) / lastPrice.sellPrice) * 100;
    const avgChange = (Math.abs(buyChange) + Math.abs(sellChange)) / 2;

    result.changePercent = avgChange;

    if (avgChange > maxChange) {
      result.isAnomaly = true;
      result.reason = `Fiyat değişimi limiti aşıldı: %${avgChange.toFixed(2)} (Limit: %${maxChange})`;
      
      // Şiddet seviyesi belirleme
      if (avgChange > maxChange * 2) {
        result.severity = 'critical';
      } else if (avgChange > maxChange * 1.5) {
        result.severity = 'high';
      } else {
        result.severity = 'medium';
      }
    }

    return result;
  }

  // Fiyat güncellemesi broadcast
  broadcastPriceUpdate(priceData, operationType) {
    const broadcastData = {
      ...priceData,
      operation: operationType,
      change: this.calculatePriceChange(priceData)
    };

    // Ana price kanalına gönder
    this.socketManager.broadcastPriceUpdate(broadcastData);

    // Kaynak bazlı kanallara da gönder (socketManager üzerinden)
    if (priceData.source && this.socketManager.broadcastToChannel) {
      this.socketManager.broadcastToChannel(priceData.source, 'source_price_update', {
        source: priceData.source,
        data: broadcastData
      });
    }
  }

  // Anomali uyarısı broadcast
  broadcastAnomalyAlert(priceData, anomalyCheck) {
    const alertData = {
      symbol: priceData.symbol,
      source: priceData.source,
      currentPrice: {
        buy: priceData.buyPrice,
        sell: priceData.sellPrice
      },
      anomaly: anomalyCheck,
      timestamp: DateHelper.createDate()
    };

    this.socketManager.broadcastAnomalyAlert(alertData);

    LoggerHelper.logWarning('system', 
      `PRICE ANOMALY DETECTED: ${priceData.symbol} - ${anomalyCheck.reason}`
    );
  }

  // Fiyat değişimi hesaplama
  calculatePriceChange(currentPrice) {
    const lastPrice = this.priceHistory.get(currentPrice.symbol);
    
    if (!lastPrice) {
      return {
        buyChange: 0,
        sellChange: 0,
        buyPercent: 0,
        sellPercent: 0,
        trend: 'none'
      };
    }

    const buyChange = currentPrice.buyPrice - lastPrice.buyPrice;
    const sellChange = currentPrice.sellPrice - lastPrice.sellPrice;
    const buyPercent = (buyChange / lastPrice.buyPrice) * 100;
    const sellPercent = (sellChange / lastPrice.sellPrice) * 100;
    
    let trend = 'stable';
    const avgPercent = (buyPercent + sellPercent) / 2;
    
    if (avgPercent > 0.01) trend = 'up';
    else if (avgPercent < -0.01) trend = 'down';

    return {
      buyChange: buyChange,
      sellChange: sellChange,
      buyPercent: buyPercent,
      sellPercent: sellPercent,
      avgPercent: avgPercent,
      trend: trend
    };
  }

  // Fiyat geçmişini güncelle
  updatePriceHistory(priceData) {
    this.priceHistory.set(priceData.symbol, {
      buyPrice: priceData.buyPrice,
      sellPrice: priceData.sellPrice,
      timestamp: priceData.timestamp
    });

    // Eski verileri temizle (100 sembol sınırı)
    if (this.priceHistory.size > 100) {
      const oldestKey = this.priceHistory.keys().next().value;
      this.priceHistory.delete(oldestKey);
    }
  }

  // Watcher'ı yeniden başlat
  async restartWatcher() {
    LoggerHelper.logWarning('system', 'Restarting price watcher...');
    
    await this.stopWatcher();
    
    setTimeout(() => {
      this.setupWatcher();
    }, 5000); // 5 saniye bekle
  }

  // Watcher'ı durdur
  async stopWatcher() {
    if (this.changeStream) {
      try {
        await this.changeStream.close();
        this.isWatching = false;
        LoggerHelper.logSuccess('system', 'Price watcher stopped');
      } catch (error) {
        LoggerHelper.logError('system', error, 'Error stopping price watcher');
      }
    }
  }

  // Manuel fiyat broadcast (servislerden çağrılabilir)
  async broadcastLatestPrices(source = null) {
    try {
      const query = source ? { source: source, isActive: true } : { isActive: true };
      const prices = await this.collection.find(query).toArray();

      for (const price of prices) {
        const priceData = this.formatPriceData(price);
        this.broadcastPriceUpdate(priceData, 'manual');
      }

      LoggerHelper.logSuccess('system', 
        `Manual price broadcast completed: ${prices.length} prices ${source ? `from ${source}` : 'from all sources'}`
      );

    } catch (error) {
      LoggerHelper.logError('system', error, 'Manual price broadcast failed');
    }
  }

  // Aktif semboller listesi
  async getActiveSymbols() {
    try {
      const symbols = await this.collection.distinct('symbol', { isActive: true });
      return symbols.sort();
    } catch (error) {
      LoggerHelper.logError('system', error, 'Failed to get active symbols');
      return [];
    }
  }

  // Kaynak bazlı semboller
  async getSymbolsBySource(source) {
    try {
      const symbols = await this.collection.distinct('symbol', { 
        source: source, 
        isActive: true 
      });
      return symbols.sort();
    } catch (error) {
      LoggerHelper.logError('system', error, `Failed to get symbols for source: ${source}`);
      return [];
    }
  }

  // Watcher durumu
  getStatus() {
    return {
      isWatching: this.isWatching,
      priceHistorySize: this.priceHistory.size,
      anomalyDetection: settingsService.isAnomalyDetectionEnabled(),
      maxChangePercent: settingsService.getMaxPriceChangePercent(),
      timestamp: DateHelper.createDate()
    };
  }
}

module.exports = PriceWatcher;