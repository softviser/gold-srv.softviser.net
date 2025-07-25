const { io } = require('socket.io-client');
const { ObjectId } = require('mongodb');
const LoggerHelper = require('../utils/logger');
const devLogger = require('../utils/devLogger');
const DateHelper = require('../utils/dateHelper');

class HaremAltinService {
  constructor(db) {
    this.db = db;
    this.isRunning = false;
    this.socket = null;
    this.reconnectTimer = null;
    this.lastUpdateTimes = {};
    this.priceData = new Map();
    
    // Harem Altın currency mapping - Bizim sistemdeki karşılıkları
    // Socket'ten gelen veriler de '/' işareti olmadan gelir
    this.currencyMapping = {
      'ALTIN': 'HAS/TRY',     // Has Altın (Harem'de ALTIN olarak geçiyor)
      'USDTRY': 'USD/TRY',    // USD
      'EURTRY': 'EUR/TRY',    // EUR
      'GBPTRY': 'GBP/TRY',    // GBP
      'SARTRY': 'SAR/TRY',    // SAR
      'AUDTRY': 'AUD/TRY',    // AUD
      'CADTRY': 'CAD/TRY',    // CAD
      'CHFTRY': 'CHF/TRY',    // CHF
      'JPYTRY': 'JPY/TRY',    // JPY
      'RUBTRY': 'RUB/TRY',    // RUB
      'CNYTRY': 'CNY/TRY',    // CNY
      'AEDTRY': 'AED/TRY',    // AED
      'AZNTRY': 'AZN/TRY',    // AZN
    };
    
    this.sourceInfo = {
      name: 'haremgold',
      displayName: 'Harem Altın',
      url: 'https://haremaltin.com',
      type: 'socketio',
      category: 'gold_dealer',
      isActive: true
    };
    
    // Socket server reference
    this.socketServer = null;
    this.dataDisruption = false;
    this.lastSuccessTime = null;
  }

  // Set socket server instance
  setSocketServer(io) {
    this.socketServer = io;
  }
  
  // Emit price to multiple channels
  emitPriceUpdate(priceData) {
    if (!this.socketServer) return;
    
    try {
      const payload = {
        timestamp: new Date().toISOString(),
        source: 'haremgold',
        data: priceData
      };
      
      // Send to main price channel
      this.socketServer.to('price').emit('price_update', payload);
      
      // Send to source-specific channel  
      this.socketServer.to('haremgold').emit('price_update', payload);
    } catch (error) {
      devLogger.error('HaremAltinService', 'Socket emission error', error);
    }
  }
  
  // Send data disruption alert
  sendDataDisruptionAlert(message) {
    if (!this.socketServer) return;
    
    try {
      const alert = {
        timestamp: new Date().toISOString(),
        service: 'haremgold',
        type: 'data_disruption',
        message: message,
        severity: 'warning'
      };
      
      // Send to alerts channel
      this.socketServer.to('alerts').emit('anomaly_alert', alert);
      
      // Send to system channel
      this.socketServer.to('system').emit('service_alert', alert);
    } catch (error) {
      devLogger.error('HaremAltinService', 'Alert emission error', error);
    }
  }

  async start() {
    if (this.isRunning) {
      devLogger.info('HaremAltinService', '🟡 Harem Altın servisi zaten çalışıyor');
      return;
    }

    try {
      await this.ensureSourceExists();
      await this.loadSystemCurrencies();
      await this.loadDatabaseMappings(); // Veritabanından mapping'leri yükle
      this.connect();
      this.isRunning = true;
      LoggerHelper.logSuccess('haremgold', 'Socket.io servisi başlatıldı');
    } catch (error) {
      devLogger.error('HaremAltinService', '❌ Harem Altın servisi başlatma hatası:', error);
      throw error;
    }
  }

  async loadSystemCurrencies() {
    try {
      const systemCurrencies = await this.db.collection('system_currencies').find({ 
        isActive: true 
      }).toArray();
      
      this.allowedSymbols = new Set(systemCurrencies.map(curr => curr.symbol));
      devLogger.info('HaremAltinService', `✅ ${this.allowedSymbols.size} adet sistem currency yüklendi`);
    } catch (error) {
      devLogger.error('HaremAltinService', '❌ Sistem currencies yükleme hatası:', error);
      this.allowedSymbols = new Set();
    }
  }

  async loadDatabaseMappings() {
    try {
      const source = await this.db.collection('sources').findOne({ 
        name: this.sourceInfo.name 
      });
      
      if (!source) {
        devLogger.error('HaremAltinService', '❌ Harem Altın kaynağı bulunamadı');
        return;
      }

      // Veritabanından aktif mapping'leri yükle
      const mappings = await this.db.collection('price_mappings').find({
        sourceId: source._id,
        isActive: true
      }).toArray();

      // Mapping'leri currencyMapping'e dönüştür
      this.currencyMapping = {};
      mappings.forEach(mapping => {
        this.currencyMapping[mapping.sourceField] = mapping.targetSymbol;
      });

      devLogger.info('HaremAltinService', `✅ ${mappings.length} adet mapping veritabanından yüklendi:`, this.currencyMapping);
    } catch (error) {
      devLogger.error('HaremAltinService', '❌ Database mappings yükleme hatası:', error);
      // Hata durumunda varsayılan mapping'leri kullan
      devLogger.info('HaremAltinService', '⚠️ Varsayılan mapping\'ler kullanılacak');
    }
  }

  async stop() {
    this.isRunning = false;
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.clearTimers();
    devLogger.info('HaremAltinService', '🛑 Harem Altın servisi durduruldu');
  }

  connect() {
    try {
      devLogger.info('HaremAltinService', '🔌 Harem Altın Socket.io\'ya bağlanıyor...');
      
      this.socket = io('wss://socketweb.haremaltin.com', {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 5000,
        reconnectionDelayMax: 10000
      });
      
      this.socket.on('connect', () => {
        LoggerHelper.logConnection('haremgold', 'connected', `Socket ID: ${this.socket.id}`);
        
        // Reset data disruption on successful connection
        this.lastSuccessTime = Date.now();
        if (this.dataDisruption) {
          this.dataDisruption = false;
          LoggerHelper.logSuccess('haremgold', 'Veri akışı normale döndü');
          this.sendDataDisruptionAlert('HaremGold veri akışı normale döndü');
        }
      });

      this.socket.on('price_changed', (data) => {
        this.handlePriceChanged(data);
        
        // Update success time on data received
        this.lastSuccessTime = Date.now();
        if (this.dataDisruption) {
          this.dataDisruption = false;
          LoggerHelper.logSuccess('haremgold', 'Veri akışı normale döndü');
          this.sendDataDisruptionAlert('HaremGold veri akışı normale döndü');
        }
      });

      this.socket.on('disconnect', (reason) => {
        LoggerHelper.logConnection('haremgold', 'disconnected', `Reason: ${reason}`);
        
        // Start checking for data disruption after disconnect
        setTimeout(() => {
          if (!this.socket || !this.socket.connected) {
            const timeSinceLastSuccess = this.lastSuccessTime ? Date.now() - this.lastSuccessTime : 0;
            if (timeSinceLastSuccess > 60000 && !this.dataDisruption) { // 1 minute
              this.dataDisruption = true;
              const message = 'HaremGold veri kesintisi - 1 dakikadır bağlantı kurulamıyor';
              LoggerHelper.logWarning('haremgold', message);
              this.sendDataDisruptionAlert(message);
            }
          }
        }, 60000);
      });

      this.socket.on('connect_error', (error) => {
        LoggerHelper.logError('haremgold', error, 'Socket.io bağlantı hatası');
      });

      this.socket.on('error', (error) => {
        devLogger.error('HaremAltinService', '❌ Harem Altın Socket.io hatası:', error);
      });

    } catch (error) {
      devLogger.error('HaremAltinService', '❌ Harem Altın Socket.io bağlantı hatası:', error);
      if (this.isRunning) {
        setTimeout(() => this.connect(), 5000);
      }
    }
  }

  handlePriceChanged(eventData) {
    try {
      // Event data formatı: [event_name, data]
      let priceData;
      if (Array.isArray(eventData) && eventData.length >= 2) {
        priceData = eventData[1];
      } else if (eventData && eventData.data) {
        priceData = eventData;
      } else {
        console.warn('⚠️ Beklenmeyen veri formatı:', eventData);
        return;
      }

      if (!priceData || !priceData.data) {
        console.warn('⚠️ Veri bulunamadı');
        return;
      }

      const prices = priceData.data;
      const timestamp = priceData.meta?.time || Date.now();

      // Sadece tanımlı currency'leri işle
      Object.entries(this.currencyMapping).forEach(([haremCode, systemSymbol]) => {
        if (prices[haremCode]) {
          // Sistem currency'de tanımlı olup olmadığını kontrol et
          if (!this.allowedSymbols || !this.allowedSymbols.has(systemSymbol)) {
            devLogger.info('HaremAltinService', `⚠️ ${systemSymbol} sistem currency'de tanımlı değil, atlanıyor`);
            return;
          }
          this.processPriceData(haremCode, systemSymbol, prices[haremCode], timestamp);
        }
      });

    } catch (error) {
      devLogger.error('HaremAltinService', '❌ Harem Altın veri işleme hatası:', error);
    }
  }

  processPriceData(haremCode, systemSymbol, data, timestamp) {
    try {
      // Önceki verileri al
      const oldData = this.priceData.get(haremCode) || {};
      const oldBid = oldData.alis || 0;
      const oldAsk = oldData.satis || 0;

      // Fiyatları parse et
      const buyPrice = parseFloat(data.alis) || 0;
      const sellPrice = parseFloat(data.satis) || 0;

      // Geçersiz fiyatları kontrol et
      if (buyPrice === 0 || sellPrice === 0) {
        devLogger.info('HaremAltinService', `⚠️ ${systemSymbol} için geçersiz fiyat, atlanıyor`);
        return;
      }

      // Yeni verileri kaydet
      this.priceData.set(haremCode, data);
      this.lastUpdateTimes[haremCode] = timestamp;

      // Değişim yüzdesini hesapla
      const bidChangePercent = oldBid > 0 ? ((buyPrice - oldBid) / oldBid) * 100 : 0;
      const askChangePercent = oldAsk > 0 ? ((sellPrice - oldAsk) / oldAsk) * 100 : 0;

      // Direction bilgisini de kullan
      const direction = {
        buy: data.dir?.alis_dir || (bidChangePercent > 0 ? 'up' : bidChangePercent < 0 ? 'down' : ''),
        sell: data.dir?.satis_dir || (askChangePercent > 0 ? 'up' : askChangePercent < 0 ? 'down' : '')
      };

      // Fiyat güncelleme logu
      const avgChangePercent = (bidChangePercent + askChangePercent) / 2;
      LoggerHelper.logPriceUpdate('haremgold', systemSymbol, buyPrice, sellPrice, avgChangePercent);

      // Emit price update to socket channels
      this.emitPriceUpdate({
        symbol: systemSymbol,
        buyPrice: buyPrice,
        sellPrice: sellPrice,
        currency: 'TRY',
        change: avgChangePercent,
        originalData: {
          code: haremCode,
          name: systemSymbol,
          direction: direction,
          dailyLow: parseFloat(data.dusuk) || buyPrice,
          dailyHigh: parseFloat(data.yuksek) || buyPrice
        }
      });

      // Veritabanına kaydet
      this.savePriceData({
        symbol: systemSymbol,
        buyPrice: buyPrice,
        sellPrice: sellPrice,
        previousBuyPrice: oldBid > 0 ? oldBid : null,
        previousSellPrice: oldAsk > 0 ? oldAsk : null,
        changePercent: {
          buy: bidChangePercent,
          sell: askChangePercent
        },
        dailyStats: {
          lowBuyPrice: parseFloat(data.dusuk) || buyPrice,
          highBuyPrice: parseFloat(data.yuksek) || buyPrice,
          lowSellPrice: parseFloat(data.dusuk) || sellPrice,
          highSellPrice: parseFloat(data.yuksek) || sellPrice,
          closingPrice: parseFloat(data.kapanis) || buyPrice
        },
        sourceData: {
          originalCode: haremCode,
          name: systemSymbol,
          direction: direction,
          updateTime: data.tarih,
          rawData: data
        }
      });

    } catch (error) {
      devLogger.error('HaremAltinService', '❌ Harem Altın fiyat işleme hatası:', error);
    }
  }

  async savePriceData(priceData) {
    try {
      const source = await this.db.collection('sources').findOne({ 
        name: this.sourceInfo.name 
      });
      
      if (!source) {
        devLogger.error('HaremAltinService', '❌ Harem Altın kaynağı bulunamadı');
        return;
      }

      const currentPriceDoc = {
        sourceId: source._id,
        symbol: priceData.symbol,
        buyPrice: priceData.buyPrice,
        sellPrice: priceData.sellPrice,
        previousBuyPrice: priceData.previousBuyPrice,
        previousSellPrice: priceData.previousSellPrice,
        changePercent: priceData.changePercent,
        dailyStats: priceData.dailyStats,
        sourceData: priceData.sourceData,
        isActive: true,
        updatedAt: DateHelper.createDate(),
        createdAt: DateHelper.createDate()
      };

      // Mevcut kaydı güncelle veya yeni kayıt oluştur
      await this.db.collection('current_prices').replaceOne(
        { 
          sourceId: source._id,
          symbol: priceData.symbol
        },
        currentPriceDoc,
        { upsert: true }
      );

      // Socket'e fiyat güncellemesini gönder - sadece önemli değişimleri
      const SettingsService = require('../utils/settingsService');
      const changeAmount = Math.max(
        Math.abs(priceData.buyPrice - (priceData.previousBuyPrice || 0)),
        Math.abs(priceData.sellPrice - (priceData.previousSellPrice || 0))
      );
      const avgChangePercent = Math.abs((priceData.changePercent.buy + priceData.changePercent.sell) / 2);
      
      if (global.socketChannels && global.socketChannels.broadcastPriceUpdate && 
          SettingsService.isSignificantChange(changeAmount, avgChangePercent)) {
        const socketData = {
          symbol: priceData.symbol,
          buyPrice: priceData.buyPrice,
          sellPrice: priceData.sellPrice,
          source: this.sourceInfo.displayName,
          sourceId: this.sourceInfo.name,
          change: {
            buy: priceData.changePercent.buy || 0,
            sell: priceData.changePercent.sell || 0,
            trend: Math.abs(priceData.changePercent.buy) > Math.abs(priceData.changePercent.sell) 
              ? (priceData.changePercent.buy > 0 ? 'up' : 'down')
              : (priceData.changePercent.sell > 0 ? 'up' : priceData.changePercent.sell < 0 ? 'down' : 'stable')
          },
          previousBuyPrice: priceData.previousBuyPrice,
          previousSellPrice: priceData.previousSellPrice,
          timestamp: DateHelper.createDate()
        };
        global.socketChannels.broadcastPriceUpdate(socketData);
      }

      // Price history is now handled by PriceArchiveService (scheduled every 15 minutes)

    } catch (error) {
      devLogger.error('HaremAltinService', '❌ Harem Altın veri kaydetme hatası:', error);
    }
  }

  async ensureSourceExists() {
    try {
      const existingSource = await this.db.collection('sources').findOne({ 
        name: this.sourceInfo.name 
      });

      if (!existingSource) {
        const sourceDoc = {
          ...this.sourceInfo,
          createdAt: DateHelper.createDate(),
          updatedAt: DateHelper.createDate()
        };

        const result = await this.db.collection('sources').insertOne(sourceDoc);
        devLogger.info('HaremAltinService', `✅ Harem Altın kaynağı oluşturuldu: ${result.insertedId}`);
      } else {
        devLogger.info('HaremAltinService', '✅ Harem Altın kaynağı mevcut');
      }
    } catch (error) {
      devLogger.error('HaremAltinService', '❌ Harem Altın kaynağı oluşturma hatası:', error);
      throw error;
    }
  }

  clearTimers() {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // Test için manuel veri çekme
  async fetchSampleData() {
    return {
      success: true,
      sampleData: {
        currency: Object.entries(this.currencyMapping).map(([code, symbol]) => ({
          kod: code,
          aciklama: `${symbol} - Harem Altın Socket.io`,
          symbol: symbol
        }))
      }
    };
  }

  // Servis durumu
  getStatus() {
    // En son güncelleme zamanını bul
    let lastUpdate = null;
    if (Object.keys(this.lastUpdateTimes).length > 0) {
      const times = Object.values(this.lastUpdateTimes);
      lastUpdate = new Date(Math.max(...times.map(t => new Date(t).getTime())));
    }
    
    return {
      isRunning: this.isRunning,
      isConnected: this.socket && this.socket.connected,
      socketId: this.socket?.id || null,
      lastUpdateTimes: this.lastUpdateTimes,
      lastUpdate: lastUpdate,
      activeSymbols: this.priceData.size,
      sourceName: this.sourceInfo.name
    };
  }
}

module.exports = HaremAltinService;