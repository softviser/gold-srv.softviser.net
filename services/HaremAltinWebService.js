const axios = require('axios');
const { ObjectId } = require('mongodb');
const LoggerHelper = require('../utils/logger');
const devLogger = require('../utils/devLogger');
const cronLogger = require('../utils/cronLogger');
const DateHelper = require('../utils/dateHelper');
const settingsService = require('../utils/settingsService');

class HaremAltinWebService {
  constructor(db) {
    this.db = db;
    this.isRunning = false;
    this.updateInterval = null;
    this.lastUpdateTimes = {};
    this.priceData = new Map();
    this.broadcastDebounceTimer = null;
    
    // API endpoints
    this.endpoints = {
      altin: 'https://canlipiyasalar.haremaltin.com/tmp/altin.json?dil_kodu=tr',
      doviz: 'https://canlipiyasalar.haremaltin.com/tmp/doviz.json?dil_kodu=tr'
    };
    
    // Currency mapping - Sistem currencies ile eşleştirme
    // Harem Altın Web API'sinde para birimleri '/' işareti olmadan gelir
    this.currencyMapping = {
      'ALTIN': 'HAS/TRY',     // Has Altın
      'ONS': 'ONS',     // Has Altın
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
      'KWDTRY': 'KWD/TRY',    // KWD
      'QAEDTRY': 'QAR/TRY',   // QAR
      'BHDTRY': 'BHD/TRY',    // BHD
      'JORDTRY': 'JOD/TRY',   // JOD
      'EGPTRY': 'EGP/TRY',    // EGP
      'ILSTRY': 'ILS/TRY',    // ILS
      'INRTRY': 'INR/TRY',    // INR
      'ZARTRY': 'ZAR/TRY',    // ZAR
      'NZDTRY': 'NZD/TRY',    // NZD
      'SEKTRY': 'SEK/TRY',    // SEK
      'NOKTRY': 'NOK/TRY',    // NOK
      'DKKTRY': 'DKK/TRY',    // DKK
      'PLNTRY': 'PLN/TRY',    // PLN
      'CZKTRY': 'CZK/TRY',    // CZK
      'HUFTRY': 'HUF/TRY',    // HUF
      'RONTRY': 'RON/TRY',    // RON
      'BGNTRY': 'BGN/TRY',    // BGN
      'HKDTRY': 'HKD/TRY',    // HKD
      'SGDTRY': 'SGD/TRY',    // SGD
      'KRWTRY': 'KRW/TRY',    // KRW
      'MYRTRY': 'MYR/TRY',    // MYR
      'THBTRY': 'THB/TRY',    // THB
      'IDRTRY': 'IDR/TRY',    // IDR
      'PHPTRY': 'PHP/TRY'     // PHP
    };
    
    this.sourceInfo = {
      name: 'haremgoldweb',
      displayName: 'Harem Altın Web',
      url: 'https://haremaltin.com',
      type: 'api',
      category: 'gold_dealer',
      isActive: true
    };

    // Update interval (30 saniye)
    this.updateIntervalMs = 30000;
  }

  async start() {
    if (this.isRunning) {
      if (settingsService.shouldShowConsoleDebug()) {
        devLogger.info('HaremAltinWebService', '🟡 Harem Altın Web servisi zaten çalışıyor');
      }
      return;
    }

    try {
      await this.ensureSourceExists();
      await this.loadSystemCurrencies();
      await this.loadDatabaseMappings(); // Veritabanından mapping'leri yükle
      
      // İlk güncellemeyi hemen yap
      await this.updatePrices();
      
      // Periyodik güncellemeyi başlat
      this.updateInterval = setInterval(() => {
        cronLogger.startJob('HaremAltinWeb-Update');
        this.updatePrices().then(() => {
          cronLogger.endJob('HaremAltinWeb-Update', 'success', { message: 'Price update completed' });
        }).catch(error => {
          devLogger.error('HaremAltinWebService', '❌ Harem Altın Web periyodik güncelleme hatası:', error);
          cronLogger.endJob('HaremAltinWeb-Update', 'error', { error: error.message });
        });
      }, this.updateIntervalMs);
      
      cronLogger.startJob('HaremAltinWebService', 'Periodic price updates');
      
      this.isRunning = true;
      LoggerHelper.logSuccess('haremgoldweb', 'Servis başlatıldı');
    } catch (error) {
      devLogger.error('HaremAltinWebService', '❌ Harem Altın Web servisi başlatma hatası:', error);
      throw error;
    }
  }

  async stop() {
    this.isRunning = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    if (settingsService.shouldShowConsoleDebug()) {
      devLogger.info('HaremAltinWebService', '🛑 Harem Altın Web servisi durduruldu');
    }
    cronLogger.endJob('HaremAltinWebService', 'success', { message: 'Service stopped' });
  }

  async loadSystemCurrencies() {
    try {
      const systemCurrencies = await this.db.collection('system_currencies').find({ 
        isActive: true 
      }).toArray();
      
      this.allowedSymbols = new Set(systemCurrencies.map(curr => curr.symbol));
      if (settingsService.shouldShowConsoleDebug()) {
        devLogger.info('HaremAltinWebService', `✅ ${this.allowedSymbols.size} adet sistem currency yüklendi`);
      }
    } catch (error) {
      devLogger.error('HaremAltinWebService', '❌ Sistem currencies yükleme hatası:', error);
      this.allowedSymbols = new Set();
    }
  }

  async loadDatabaseMappings() {
    try {
      const source = await this.db.collection('sources').findOne({ 
        name: this.sourceInfo.name 
      });
      
      if (!source) {
        devLogger.error('HaremAltinWebService', '❌ Harem Altın Web kaynağı bulunamadı');
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

      if (settingsService.shouldShowConsoleDebug()) {
        devLogger.info('HaremAltinWebService', `✅ ${mappings.length} adet mapping veritabanından yüklendi:`, this.currencyMapping);
      }
    } catch (error) {
      devLogger.error('HaremAltinWebService', '❌ Database mappings yükleme hatası:', error);
      // Hata durumunda varsayılan mapping'leri kullan
      if (settingsService.shouldShowConsoleDebug()) {
        devLogger.info('HaremAltinWebService', '⚠️ Varsayılan mapping\'ler kullanılacak');
      }
    }
  }

  async updatePrices() {
    const startTime = Date.now();
    if (settingsService.shouldShowConsoleDebug()) {
      devLogger.info('HaremAltinWebService', '🔄 Harem Altın Web veri güncellemesi başladı...');
    }

    try {
      // Her iki endpoint'ten veri çek
      const [altinResponse, dovizResponse] = await Promise.all([
        axios.get(this.endpoints.altin, { timeout: 10000 }),
        axios.get(this.endpoints.doviz, { timeout: 10000 })
      ]);

      const altinData = altinResponse.data;
      const dovizData = dovizResponse.data;

      // Verileri birleştir (doviz.json öncelikli)
      const combinedData = { ...altinData.data, ...dovizData.data };
      const timestamp = dovizData.meta?.time || altinData.meta?.time || Date.now();

      let processedCount = 0;
      let skippedCount = 0;

      // Tanımlı currency'leri işle
      for (const [haremCode, systemSymbol] of Object.entries(this.currencyMapping)) {
        if (combinedData[haremCode]) {
          // Sistem currency'de tanımlı olup olmadığını kontrol et
          if (!this.allowedSymbols || !this.allowedSymbols.has(systemSymbol)) {
            if (settingsService.shouldShowConsoleDebug()) {
              devLogger.info('HaremAltinWebService', `⚠️ ${systemSymbol} sistem currency'de tanımlı değil, atlanıyor`);
            }
            skippedCount++;
            continue;
          }
          
          await this.processPriceData(haremCode, systemSymbol, combinedData[haremCode], timestamp);
          processedCount++;
        }
      }

      const duration = Date.now() - startTime;
      LoggerHelper.logDataProcessing('haremgoldweb', processedCount, skippedCount, duration);

    } catch (error) {
      LoggerHelper.logError('haremgoldweb', error, 'Veri çekme hatası');
      
      // Hataları alerts kanalına gönder
      if (global.socketChannels && global.socketChannels.broadcastToChannel) {
        global.socketChannels.broadcastToChannel('alerts', 'anomaly_alert', {
          source: 'haremgoldweb',
          type: 'service_error',
          severity: 'error',
          message: 'Harem Altın Web veri çekme hatası',
          error: error.message,
          data: {
            service: 'HaremAltinWebService',
            action: 'updatePrices',
            timestamp: DateHelper.createDate()
          }
        });
      }
      
      throw error;
    }
  }

  async processPriceData(haremCode, systemSymbol, data, timestamp) {
    try {
      // Önceki verileri al
      const oldData = this.priceData.get(haremCode) || {};
      const oldBid = parseFloat(oldData.alis) || 0;
      const oldAsk = parseFloat(oldData.satis) || 0;

      // Fiyatları parse et
      const buyPrice = this.parsePrice(data.alis);
      const sellPrice = this.parsePrice(data.satis);

      // Geçersiz fiyatları kontrol et
      if (buyPrice === 0 || sellPrice === 0) {
        if (settingsService.shouldShowConsoleDebug()) {
          devLogger.info('HaremAltinWebService', `⚠️ ${systemSymbol} için geçersiz fiyat, atlanıyor`);
        }
        return;
      }

      // Yeni verileri kaydet
      this.priceData.set(haremCode, data);
      this.lastUpdateTimes[haremCode] = timestamp;

      // Değişim yüzdesini hesapla
      const bidChangePercent = oldBid > 0 ? ((buyPrice - oldBid) / oldBid) * 100 : 0;
      const askChangePercent = oldAsk > 0 ? ((sellPrice - oldAsk) / oldAsk) * 100 : 0;

      // Direction bilgisini kullan
      const direction = {
        buy: data.dir?.alis_dir || (bidChangePercent > 0 ? 'up' : bidChangePercent < 0 ? 'down' : ''),
        sell: data.dir?.satis_dir || (askChangePercent > 0 ? 'up' : askChangePercent < 0 ? 'down' : '')
      };

      LoggerHelper.logPriceUpdate('haremgoldweb', systemSymbol, buyPrice, sellPrice, bidChangePercent);

      // Veritabanına kaydet
      await this.savePriceData({
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
      devLogger.error('HaremAltinWebService', `❌ Harem Altın Web ${systemSymbol} fiyat işleme hatası`, error);
      
      // Fiyat işleme hatalarını alerts kanalına gönder
      if (global.socketChannels && global.socketChannels.broadcastToChannel) {
        global.socketChannels.broadcastToChannel('alerts', 'anomaly_alert', {
          source: 'haremgoldweb',
          type: 'price_processing_error',
          severity: 'warning',
          message: `${systemSymbol} fiyat işleme hatası`,
          error: error.message,
          data: {
            service: 'HaremAltinWebService',
            action: 'processPriceData',
            symbol: systemSymbol,
            haremCode: haremCode,
            timestamp: DateHelper.createDate()
          }
        });
      }
    }
  }

  parsePrice(priceValue) {
    if (typeof priceValue === 'number') {
      return priceValue;
    }
    
    if (typeof priceValue === 'string') {
      // Harem Altın Web API'sinde formatlar:
      // 1. "46.8320" -> 46.8320 (nokta ondalık ayırıcı)
      // 2. "4.340,23" -> 4340.23 (nokta binlik, virgül ondalık)
      
      // Virgül varsa Türk formatı (nokta=binlik, virgül=ondalık)
      if (priceValue.includes(',')) {
        // Noktaları kaldır (binlik ayırıcılar)
        const withoutThousandSeparators = priceValue.replace(/\./g, '');
        // Virgülü noktaya çevir (ondalık ayırıcı)
        const normalized = withoutThousandSeparators.replace(',', '.');
        // Sayısal olmayan karakterleri temizle
        const cleaned = normalized.replace(/[^\d.]/g, '');
        const price = parseFloat(cleaned);
        return isNaN(price) ? 0 : price;
      } else {
        // Virgül yoksa Amerikan formatı (nokta=ondalık ayırıcı)
        // Sayısal olmayan karakterleri temizle
        const cleaned = priceValue.replace(/[^\d.]/g, '');
        const price = parseFloat(cleaned);
        return isNaN(price) ? 0 : price;
      }
    }
    
    return 0;
  }

  async savePriceData(priceData) {
    try {
      const source = await this.db.collection('sources').findOne({ 
        name: this.sourceInfo.name 
      });
      
      if (!source) {
        devLogger.error('HaremAltinWebService', '❌ Harem Altın Web kaynağı bulunamadı');
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
      
      if (global.socketChannels && SettingsService.isSignificantChange(changeAmount, avgChangePercent)) {
        const socketData = {
          symbol: priceData.symbol,
          buyPrice: priceData.buyPrice,
          sellPrice: priceData.sellPrice,
          source: this.sourceInfo.name,
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
        
        // Price kanalına gönder
        if (global.socketChannels.broadcastPriceUpdate) {
          global.socketChannels.broadcastPriceUpdate(socketData);
        }
        
        // HaremGoldWeb kanalına da gönder
        if (global.socketChannels.broadcastToChannel) {
          global.socketChannels.broadcastToChannel('haremgoldweb', 'price_update', socketData);
        }
        
        // Kullanıcı özel fiyat güncellemelerini gönder (debounced)
        if (global.socketChannels && global.socketChannels.broadcastUserSpecificPrices) {
          // Önceki timer'ı iptal et
          if (this.broadcastDebounceTimer) {
            clearTimeout(this.broadcastDebounceTimer);
          }
          
          // 500ms sonra broadcast yap (tüm güncellemeler tamamlandıktan sonra)
          this.broadcastDebounceTimer = setTimeout(() => {
            global.socketChannels.broadcastUserSpecificPrices(this.sourceInfo.name);
            this.broadcastDebounceTimer = null;
          }, 500);
        }
      }

      // Price history is now handled by PriceArchiveService (scheduled every 15 minutes)

    } catch (error) {
      devLogger.error('HaremAltinWebService', '❌ Harem Altın Web veri kaydetme hatası:', error);
      
      // Veri kaydetme hatalarını alerts kanalına gönder
      if (global.socketChannels && global.socketChannels.broadcastToChannel) {
        global.socketChannels.broadcastToChannel('alerts', 'anomaly_alert', {
          source: 'haremgoldweb',
          type: 'database_error',
          severity: 'error',
          message: 'Veri kaydetme hatası',
          error: error.message,
          data: {
            service: 'HaremAltinWebService',
            action: 'savePriceData',
            symbol: priceData.symbol,
            timestamp: DateHelper.createDate()
          }
        });
      }
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
        if (settingsService.shouldShowConsoleDebug()) {
          devLogger.info('HaremAltinWebService', `✅ Harem Altın Web kaynağı oluşturuldu: ${result.insertedId}`);
        }
      } else {
        if (settingsService.shouldShowConsoleDebug()) {
          devLogger.info('HaremAltinWebService', '✅ Harem Altın Web kaynağı mevcut');
        }
      }
    } catch (error) {
      devLogger.error('HaremAltinWebService', '❌ Harem Altın Web kaynağı oluşturma hatası:', error);
      throw error;
    }
  }

  // Test için manuel veri çekme
  async fetchSampleData() {
    try {
      const [altinResponse, dovizResponse] = await Promise.all([
        axios.get(this.endpoints.altin, { timeout: 10000 }),
        axios.get(this.endpoints.doviz, { timeout: 10000 })
      ]);

      const combinedData = { ...altinResponse.data.data, ...dovizResponse.data.data };
      
      // Tüm verileri eski formatta göster
      const allCurrencies = Object.entries(combinedData).map(([code, data]) => ({
        kod: code,
        aciklama: this.currencyMapping[code] ? `${this.currencyMapping[code]} - Harem Altın Web API` : `${code} - Mapping yok`,
        symbol: this.currencyMapping[code] || code,
        currentData: data
      }));
      
      return {
        success: true,
        sampleData: {
          currency: allCurrencies
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
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
      lastUpdateTimes: this.lastUpdateTimes,
      lastUpdate: lastUpdate,
      activeSymbols: this.priceData.size,
      sourceName: this.sourceInfo.name,
      updateIntervalMs: this.updateIntervalMs
    };
  }
}

module.exports = HaremAltinWebService;