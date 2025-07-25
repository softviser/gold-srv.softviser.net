const WebSocket = require('ws');
const { ObjectId } = require('mongodb');
const LoggerHelper = require('../utils/logger');
const DateHelper = require('../utils/dateHelper');

class HakanAltinService {
  constructor(db) {
    this.db = db;
    this.isRunning = false;
    this.ws = null;
    this.reconnectTimer = null;
    this.messageTimeout = null;
    this.lastUpdateTimes = {};
    this.symbolData = new Map();
    
    // Hakan Altın currency mapping
    this.currencyMapping = {
      126: 'HAS/TRY',    // Has Altın
      113: 'USD/TRY',    // USD
      115: 'GBP/TRY',    // GBP
      121: 'SAR/TRY',    // SAR
      235: 'AED/TRY',    // AED
      114: 'EUR/TRY',    // EUR
      118: 'CHF/TRY',    // CHF
      628: 'CNH/TRY',     // CNH
      116: 'AUD/TRY',    // AUD
      117: 'CAD/TRY',    // CAD
      127: 'GUMUS/TRY',  // GUMUS
    };
    
    this.sourceInfo = {
      name: 'hakangold',
      displayName: 'Hakan Altın',
      url: 'https://hakanaltin.com',
      type: 'websocket',
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
        source: 'hakangold',
        data: priceData
      };
      
      // Send to main price channel
      this.socketServer.to('price').emit('price_update', payload);
      
      // Send to source-specific channel  
      this.socketServer.to('hakangold').emit('price_update', payload);
    } catch (error) {
      console.error('HakanAltinService socket emission error:', error);
    }
  }
  
  // Send data disruption alert
  sendDataDisruptionAlert(message) {
    if (!this.socketServer) return;
    
    try {
      const alert = {
        timestamp: new Date().toISOString(),
        service: 'hakangold',
        type: 'data_disruption',
        message: message,
        severity: 'warning'
      };
      
      // Send to alerts channel
      this.socketServer.to('alerts').emit('anomaly_alert', alert);
      
      // Send to system channel
      this.socketServer.to('system').emit('service_alert', alert);
    } catch (error) {
      console.error('HakanAltinService alert emission error:', error);
    }
  }

  async start() {
    if (this.isRunning) {
      console.log('🟡 Hakan Altın servisi zaten çalışıyor');
      return;
    }

    try {
      await this.ensureSourceExists();
      await this.loadSystemCurrencies();
      await this.loadDatabaseMappings(); // Veritabanından mapping'leri yükle
      this.connect();
      this.isRunning = true;
      console.log('✅ Hakan Altın WebSocket servisi başlatıldı');
    } catch (error) {
      console.error('❌ Hakan Altın servisi başlatma hatası:', error);
      throw error;
    }
  }

  async loadSystemCurrencies() {
    try {
      const systemCurrencies = await this.db.collection('system_currencies').find({ 
        isActive: true 
      }).toArray();
      
      this.allowedSymbols = new Set(systemCurrencies.map(curr => curr.symbol));
      console.log(`✅ ${this.allowedSymbols.size} adet sistem currency yüklendi`);
    } catch (error) {
      console.error('❌ Sistem currencies yükleme hatası:', error);
      this.allowedSymbols = new Set();
    }
  }

  async loadDatabaseMappings() {
    try {
      const source = await this.db.collection('sources').findOne({ 
        name: this.sourceInfo.name 
      });
      
      if (!source) {
        console.error('❌ Hakan Altın kaynağı bulunamadı');
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

      console.log(`✅ ${mappings.length} adet mapping veritabanından yüklendi:`, this.currencyMapping);
    } catch (error) {
      console.error('❌ Database mappings yükleme hatası:', error);
      // Hata durumunda varsayılan mapping'leri kullan
      console.log('⚠️ Varsayılan mapping\'ler kullanılacak');
    }
  }

  async stop() {
    this.isRunning = false;
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.clearTimers();
    console.log('🛑 Hakan Altın servisi durduruldu');
  }

  connect() {
    try {
      console.log('🔌 Hakan Altın WebSocket\'e bağlanıyor...');
      
      this.ws = new WebSocket('wss://websocket.hakanaltin.com/');
      
      this.ws.on('open', () => {
        LoggerHelper.logConnection('hakangold', 'connected', 'WebSocket bağlantısı kuruldu');
        this.clearTimers();
        this.startMessageTimeout();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('close', () => {
        LoggerHelper.logConnection('hakangold', 'disconnected', 'WebSocket bağlantısı kapandı');
        this.clearTimers();
        
        if (this.isRunning) {
          console.log('🔄 5 saniye sonra yeniden bağlanılacak...');
          setTimeout(() => {
            if (this.isRunning) {
              this.connect();
            }
          }, 5000);
        }
      });

      this.ws.on('error', (error) => {
        LoggerHelper.logError('hakangold', error, 'WebSocket hatası');
        if (this.ws) {
          this.ws.close();
        }
      });

    } catch (error) {
      LoggerHelper.logError('hakangold', error, 'WebSocket bağlantı hatası');
      if (this.isRunning) {
        setTimeout(() => this.connect(), 5000);
      }
    }
  }

  handleMessage(data) {
    try {
      // Reset message timeout
      this.clearMessageTimeout();
      this.startMessageTimeout();
      
      // Update success time and reset data disruption
      this.lastSuccessTime = Date.now();
      if (this.dataDisruption) {
        this.dataDisruption = false;
        LoggerHelper.logSuccess('hakangold', 'Veri akışı normale döndü');
        this.sendDataDisruptionAlert('HakanGold veri akışı normale döndü');
      }

      const jsonData = JSON.parse(data.toString());
      
      // Sadece bildiğimiz currency'leri işle
      if (!this.currencyMapping[jsonData.i]) {
        // Mapping'de yoksa logla
        //console.log(`⚠️ HakanGold'dan gelen ${jsonData.i} kodu mapping'de yok, atlanıyor`);
        return;
      }

      const symbol = this.currencyMapping[jsonData.i];
      
      // Sistem currency'de tanımlı olup olmadığını kontrol et
      if (!this.allowedSymbols || !this.allowedSymbols.has(symbol)) {
        //console.log(`⚠️ ${symbol} sistem currency'de tanımlı değil, atlanıyor`);
        return;
      }
      
      const currentTime = Date.now();
      
      // Önceki verileri al
      const oldData = this.symbolData.get(jsonData.i) || {};
      const oldBid = oldData.b || 0;
      const oldAsk = oldData.a || 0;

      // Yeni verileri kaydet
      this.symbolData.set(jsonData.i, {
        i: jsonData.i,
        b: jsonData.b,
        a: jsonData.a,
        symbol: symbol,
        timestamp: currentTime
      });

      this.lastUpdateTimes[jsonData.i] = currentTime;

      // Değişim yüzdesini hesapla
      const bidChangePercent = oldBid > 0 ? ((jsonData.b - oldBid) / oldBid) * 100 : 0;
      const askChangePercent = oldAsk > 0 ? ((jsonData.a - oldAsk) / oldAsk) * 100 : 0;

      LoggerHelper.logPriceUpdate('hakangold', symbol, jsonData.b, jsonData.a, bidChangePercent);

      // Emit price update to socket channels
      this.emitPriceUpdate({
        symbol: symbol,
        buyPrice: jsonData.b,
        sellPrice: jsonData.a,
        currency: 'TRY',
        change: bidChangePercent,
        originalData: {
          code: jsonData.i.toString(),
          name: symbol,
          rawData: jsonData
        }
      });

      // Veritabanına kaydet
      this.savePriceData({
        symbol: symbol,
        buyPrice: jsonData.b,
        sellPrice: jsonData.a,
        previousBuyPrice: oldBid > 0 ? oldBid : null,
        previousSellPrice: oldAsk > 0 ? oldAsk : null,
        changePercent: {
          buy: bidChangePercent,
          sell: askChangePercent
        },
        sourceData: {
          originalCode: jsonData.i.toString(),
          name: symbol,
          rawData: jsonData
        }
      });

    } catch (error) {
      console.error('❌ Hakan Altın mesaj işleme hatası:', error);
    }
  }

  async savePriceData(priceData) {
    try {
      const source = await this.db.collection('sources').findOne({ 
        name: this.sourceInfo.name 
      });
      
      if (!source) {
        console.error('❌ Hakan Altın kaynağı bulunamadı');
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
      console.error('❌ Hakan Altın veri kaydetme hatası:', error);
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
        console.log(`✅ Hakan Altın kaynağı oluşturuldu: ${result.insertedId}`);
      } else {
        console.log('✅ Hakan Altın kaynağı mevcut');
      }
    } catch (error) {
      console.error('❌ Hakan Altın kaynağı oluşturma hatası:', error);
      throw error;
    }
  }

  startMessageTimeout() {
    this.messageTimeout = setTimeout(() => {
      console.log('⚠️ 30 saniyedir mesaj alınmadı, yeniden bağlanılıyor...');
      
      // Data disruption alert
      if (!this.dataDisruption) {
        this.dataDisruption = true;
        const message = 'HakanGold veri kesintisi - 30 saniyedir mesaj alınamıyor';
        LoggerHelper.logWarning('hakangold', message);
        this.sendDataDisruptionAlert(message);
      }
      
      if (this.ws) {
        this.ws.close();
      }
    }, 30000);
  }

  clearMessageTimeout() {
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
      this.messageTimeout = null;
    }
  }

  clearTimers() {
    this.clearMessageTimeout();
    
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
          aciklama: `${symbol} - Hakan Altın WebSocket`,
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
      isConnected: this.ws && this.ws.readyState === WebSocket.OPEN,
      lastUpdateTimes: this.lastUpdateTimes,
      lastUpdate: lastUpdate,
      activeSymbols: this.symbolData.size,
      sourceName: this.sourceInfo.name
    };
  }
}

module.exports = HakanAltinService;