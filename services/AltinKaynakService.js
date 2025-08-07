const axios = require('axios');
const { ObjectId } = require('mongodb');
const LoggerHelper = require('../utils/logger');
const settingsService = require('../utils/settingsService');
const devLogger = require('../utils/devLogger');
const DateHelper = require('../utils/dateHelper');

class AltinKaynakService {
  constructor(db) {
    this.db = db;
    this.baseUrl = 'https://rest.altinkaynak.com';
    this.endpoints = {
      currency: '/Currency.json',
      gold: '/Gold.json'
    };
    
    // Model instances
    this.CurrentPrices = require('../models/CurrentPrices');
    this.PriceMapping = require('../models/PriceMapping');
    this.Source = require('../models/Source');
    
    this.currentPricesModel = new this.CurrentPrices(db);
    this.mappingModel = new this.PriceMapping(db);
    this.sourceModel = new this.Source(db);
    
    this.sourceId = null;
    this.mappings = new Map();
    this.isRunning = false;
    this.lastUpdate = null;
    this.updateInterval = settingsService.getDefaultUpdateInterval();
    this.intervalId = null;
    
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
        source: 'altinkaynak',
        data: priceData
      };
      
      // Send to main price channel
      this.socketServer.to('price').emit('price_update', payload);
      
      // Send to source-specific channel
      this.socketServer.to('altinkaynak').emit('price_update', payload);
    } catch (error) {
      devLogger.error('AltinKaynakService', 'Socket emission error', error);
    }
  }
  
  // Send data disruption alert
  sendDataDisruptionAlert(message) {
    if (!this.socketServer) return;
    
    try {
      const alert = {
        timestamp: new Date().toISOString(),
        service: 'altinkaynak',
        type: 'data_disruption',
        message: message,
        severity: 'warning'
      };
      
      // Send to alerts channel
      this.socketServer.to('alerts').emit('anomaly_alert', alert);
      
      // Send to system channel
      this.socketServer.to('system').emit('service_alert', alert);
    } catch (error) {
      devLogger.error('AltinKaynakService', 'Alert emission error', error);
    }
  }

  async initialize() {
    try {
      // AltinKaynak source'unu bul veya oluştur
      let source = await this.sourceModel.findByName('altinkaynak');
      
      if (!source) {
        source = await this.sourceModel.create({
          name: 'altinkaynak',
          displayName: 'Altın Kaynak',
          type: 'api',
          category: 'gold_dealer',
          url: 'https://altinkaynak.com',
          apiUrl: this.baseUrl,
          dataFormat: 'json',
          updateInterval: 60,
          currency: 'TRY',
          priority: 2,
          isActive: true,
          metadata: {
            description: 'Altın Kaynak resmi API servisi'
          }
        });
      }
      
      this.sourceId = source._id;
      await this.loadMappings();
      
      if (settingsService.shouldShowConsoleDebug()) {
        devLogger.info('AltinKaynakService', 'Servis başlatıldı', {
          sourceId: this.sourceId,
          mappingCount: this.mappings.size
        });
      }
      
      return true;
    } catch (error) {
      devLogger.error('AltinKaynakService', 'AltinKaynak servisi başlatma hatası', error);
      throw error;
    }
  }

  async loadMappings() {
    try {
      const mappings = await this.mappingModel.getBySourceId(this.sourceId);
      this.mappings.clear();
      
      mappings.forEach(mapping => {
        this.mappings.set(mapping.sourceField, mapping);
      });
      
      if (settingsService.shouldShowConsoleDebug()) {
        devLogger.debug('AltinKaynakService', `${mappings.length} eşleştirme yüklendi`);
      }
    } catch (error) {
      devLogger.error('AltinKaynakService', 'AltinKaynak eşleştirme yükleme hatası:', error);
    }
  }

  async fetchCurrencyData() {
    try {
      const response = await axios.get(this.baseUrl + this.endpoints.currency, {
        timeout: 10000,
        headers: {
          'User-Agent': 'GoldServer/1.0'
        }
      });

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Geçersiz currency veri formatı');
      }

      if (settingsService.shouldShowConsoleDebug()) {
        devLogger.debug('AltinKaynakService', `AltinKaynak Currency API'den ${response.data.length} kayıt alındı`);
      }
      return response.data;
    } catch (error) {
      devLogger.error('AltinKaynakService', 'AltinKaynak Currency API hatası:', error);
      throw error;
    }
  }

  async fetchGoldData() {
    try {
      const response = await axios.get(this.baseUrl + this.endpoints.gold, {
        timeout: 10000,
        headers: {
          'User-Agent': 'GoldServer/1.0'
        }
      });

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Geçersiz gold veri formatı');
      }

      if (settingsService.shouldShowConsoleDebug()) {
        devLogger.debug('AltinKaynakService', `AltinKaynak Gold API'den ${response.data.length} kayıt alındı`);
      }
      return response.data;
    } catch (error) {
      devLogger.error('AltinKaynakService', 'AltinKaynak Gold API hatası:', error);
      throw error;
    }
  }

  async processCurrencyData(data) {
    let processedCount = 0;
    let errorCount = 0;

    for (const item of data) {
      try {
        // Eşleştirme bul (AltinKaynak API'sinde 'Kod' alanı kullanılıyor)
        const mapping = this.mappings.get(item.Kod);
        if (!mapping || !mapping.isActive) {
          continue;
        }

        // Fiyatları çıkar ve dönüştür (AltinKaynak API'sinde 'Alis' ve 'Satis' alanları kullanılıyor)
        let buyPrice = this.extractPrice(item.Alis);
        let sellPrice = this.extractPrice(item.Satis);

        // Formül veya çarpan uygula
        if (mapping.formula) {
          buyPrice = this.applyFormula(buyPrice, mapping.formula);
          sellPrice = this.applyFormula(sellPrice, mapping.formula);
        } else if (mapping.multiplier && mapping.multiplier !== 1) {
          buyPrice = buyPrice * mapping.multiplier;
          sellPrice = sellPrice * mapping.multiplier;
        }

        // Ofset uygula
        if (mapping.offset && mapping.offset !== 0) {
          buyPrice += mapping.offset;
          sellPrice += mapping.offset;
        }

        // Fiyatı güncelle
        const result = await this.currentPricesModel.updatePrice({
          symbol: mapping.targetSymbol,
          sourceId: this.sourceId,
          buyPrice,
          sellPrice,
          sourceData: {
            originalCode: item.Kod,
            originalBuy: item.Alis,
            originalSell: item.Satis,
            name: item.Aciklama,
            mappingId: mapping._id,
            lastUpdate: item.GuncellenmeZamani || DateHelper.formatDateTime(DateHelper.createDate())
          }
        });

        // Fiyat güncelleme logu ve socket emission
        if (result.updated) {
          const changePercent = result.changePercent || 0;
          LoggerHelper.logPriceUpdate('altinkaynak', mapping.targetSymbol, buyPrice, sellPrice, changePercent);
          
          // Emit price update to socket channels
          this.emitPriceUpdate({
            symbol: mapping.targetSymbol,
            buyPrice: buyPrice,
            sellPrice: sellPrice,
            currency: 'TRY',
            change: changePercent,
            originalData: {
              code: item.Kod,
              name: item.Aciklama,
              originalBuy: item.Alis,
              originalSell: item.Satis
            }
          });
        }

        processedCount++;
      } catch (error) {
        devLogger.error('AltinKaynakService', `Currency item işleme hatası (${item.Kod})`, error);
        errorCount++;
      }
    }

    if (settingsService.shouldShowConsoleDebug()) {
      devLogger.debug('AltinKaynakService', `Currency verileri işlendi: ${processedCount} başarılı, ${errorCount} hata`);
    }
    return { processedCount, errorCount };
  }

  async processGoldData(data) {
    let processedCount = 0;
    let errorCount = 0;

    for (const item of data) {
      try {
        // Eşleştirme bul (AltinKaynak API'sinde 'Kod' alanı kullanılıyor)
        const mapping = this.mappings.get(item.Kod);
        if (!mapping || !mapping.isActive) {
          continue;
        }

        // Fiyatları çıkar ve dönüştür (AltinKaynak API'sinde 'Alis' ve 'Satis' alanları kullanılıyor)
        let buyPrice = this.extractPrice(item.Alis);
        let sellPrice = this.extractPrice(item.Satis);

        // Formül veya çarpan uygula
        if (mapping.formula) {
          buyPrice = this.applyFormula(buyPrice, mapping.formula);
          sellPrice = this.applyFormula(sellPrice, mapping.formula);
        } else if (mapping.multiplier && mapping.multiplier !== 1) {
          buyPrice = buyPrice * mapping.multiplier;
          sellPrice = sellPrice * mapping.multiplier;
        }

        // Ofset uygula
        if (mapping.offset && mapping.offset !== 0) {
          buyPrice += mapping.offset;
          sellPrice += mapping.offset;
        }

        // Fiyatı güncelle
        const result = await this.currentPricesModel.updatePrice({
          symbol: mapping.targetSymbol,
          sourceId: this.sourceId,
          buyPrice,
          sellPrice,
          sourceData: {
            originalCode: item.Kod,
            originalBuy: item.Alis,
            originalSell: item.Satis,
            name: item.Aciklama,
            mappingId: mapping._id,
            lastUpdate: item.GuncellenmeZamani || DateHelper.formatDateTime(DateHelper.createDate())
          }
        });

        // Fiyat güncelleme logu ve socket emission
        if (result.updated) {
          const changePercent = result.changePercent || 0;
          LoggerHelper.logPriceUpdate('altinkaynak', mapping.targetSymbol, buyPrice, sellPrice, changePercent);
          
          // Emit price update to socket channels
          this.emitPriceUpdate({
            symbol: mapping.targetSymbol,
            buyPrice: buyPrice,
            sellPrice: sellPrice,
            currency: 'TRY',
            change: changePercent,
            originalData: {
              code: item.Kod,
              name: item.Aciklama,
              originalBuy: item.Alis,
              originalSell: item.Satis
            }
          });
        }

        processedCount++;
      } catch (error) {
        devLogger.error('AltinKaynakService', `Gold item işleme hatası (${item.Kod})`, error);
        errorCount++;
      }
    }

    if (settingsService.shouldShowConsoleDebug()) {
      devLogger.debug('AltinKaynakService', `Gold verileri işlendi: ${processedCount} başarılı, ${errorCount} hata`);
    }
    return { processedCount, errorCount };
  }

  extractPrice(priceString) {
    if (typeof priceString === 'number') {
      return priceString;
    }
    
    if (typeof priceString === 'string') {
      // Türk formatında binlik ayırıcı nokta, ondalık ayırıcı virgül kullanılır
      // Örnek: "4.340,23" -> 4340.23
      
      // Önce tüm noktaları kaldır (binlik ayırıcılar)
      const withoutThousandSeparators = priceString.replace(/\./g, '');
      
      // Sonra virgülü noktaya çevir (ondalık ayırıcı)
      const normalized = withoutThousandSeparators.replace(',', '.');
      
      // Sayısal olmayan karakterleri temizle
      const cleaned = normalized.replace(/[^\d.]/g, '');
      
      const price = parseFloat(cleaned);
      return isNaN(price) ? 0 : price;
    }
    
    return 0;
  }

  applyFormula(value, formula) {
    try {
      // Güvenlik için sadece matematik operasyonlarına izin ver
      const sanitizedFormula = formula.replace(/[^0-9+\-*/.() ]/g, '');
      const result = eval(sanitizedFormula.replace(/value/g, value));
      return isNaN(result) ? value : result;
    } catch (error) {
      devLogger.error('AltinKaynakService', 'Formül uygulama hatası', { error: error.message, formula, value });
      return value;
    }
  }

  async updateData() {
    if (this.isRunning) {
      if (settingsService.shouldShowConsoleDebug()) {
        devLogger.debug('AltinKaynakService', 'AltinKaynak güncelleme zaten çalışıyor, atlaniyor');
      }
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      if (settingsService.shouldShowConsoleDebug()) {
        devLogger.debug('AltinKaynakService', 'AltinKaynak veri güncelleme başladı');
      }
      
      // Eşleştirmeleri yeniden yükle
      await this.loadMappings();

      // Paralel olarak her iki API'yi çağır
      const [currencyData, goldData] = await Promise.all([
        this.fetchCurrencyData().catch(error => {
          devLogger.error('AltinKaynakService', 'Currency API hatası:', error);
          return [];
        }),
        this.fetchGoldData().catch(error => {
          devLogger.error('AltinKaynakService', 'Gold API hatası:', error);
          return [];
        })
      ]);

      // Verileri işle
      const [currencyResult, goldResult] = await Promise.all([
        this.processCurrencyData(currencyData),
        this.processGoldData(goldData)
      ]);

      const totalProcessed = currencyResult.processedCount + goldResult.processedCount;
      const totalErrors = currencyResult.errorCount + goldResult.errorCount;
      const duration = Date.now() - startTime;

      this.lastUpdate = DateHelper.createDate();

      // Source'un son kontrol zamanını güncelle
      await this.sourceModel.update(this.sourceId, {
        lastChecked: this.lastUpdate
      });

      LoggerHelper.logDataProcessing('altinkaynak', totalProcessed, totalErrors, duration);

      // Data disruption control
      if (totalProcessed > 0) {
        this.lastSuccessTime = Date.now();
        if (this.dataDisruption) {
          this.dataDisruption = false;
          LoggerHelper.logSuccess('altinkaynak', 'Veri akışı normale döndü');
          this.sendDataDisruptionAlert('AltınKaynak veri akışı normale döndü');
        }
      } else if (totalProcessed === 0 && totalErrors > 0) {
        // Check if data disruption should be triggered
        const timeSinceLastSuccess = this.lastSuccessTime ? Date.now() - this.lastSuccessTime : 0;
        if (timeSinceLastSuccess > 300000 && !this.dataDisruption) { // 5 minutes
          this.dataDisruption = true;
          const message = 'AltınKaynak veri kesintisi algılandı - 5 dakikadır başarılı veri alınamıyor';
          LoggerHelper.logWarning('altinkaynak', message);
          this.sendDataDisruptionAlert(message);
        }
      }

      return {
        success: true,
        processedCount: totalProcessed,
        errorCount: totalErrors,
        duration,
        lastUpdate: this.lastUpdate
      };

    } catch (error) {
      LoggerHelper.logError('altinkaynak', error, 'Veri güncelleme hatası');
      
      // Data disruption for critical errors
      const timeSinceLastSuccess = this.lastSuccessTime ? Date.now() - this.lastSuccessTime : 0;
      if (timeSinceLastSuccess > 600000 && !this.dataDisruption) { // 10 minutes for critical errors
        this.dataDisruption = true;
        const message = 'AltınKaynak kritik hata - 10 dakikadır servis çalışmıyor';
        LoggerHelper.logWarning('altinkaynak', message);
        this.sendDataDisruptionAlert(message);
      }
      
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  async start() {
    if (this.intervalId) {
      if (settingsService.shouldShowConsoleDebug()) {
        devLogger.debug('AltinKaynakService', 'AltinKaynak servisi zaten çalışıyor');
      }
      return;
    }

    await this.initialize();
    
    // Settings'ten güncel interval'i al
    this.updateInterval = settingsService.getDefaultUpdateInterval();

    // İlk güncellemeyi hemen yap
    await this.updateData();

    // Periyodik güncellemeyi başlat
    this.intervalId = setInterval(async () => {
      try {
        await this.updateData();
      } catch (error) {
        devLogger.error('AltinKaynakService', 'AltinKaynak periyodik güncelleme hatası:', error);
      }
    }, this.updateInterval);

    LoggerHelper.logSuccess('altinkaynak', `Servis başlatıldı (${this.updateInterval}ms aralıklarla)`);
  }

  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      if (settingsService.shouldShowConsoleDebug()) {
        devLogger.debug('AltinKaynakService', 'AltinKaynak servisi durduruldu');
      }
    }
  }

  getStatus() {
    return {
      isRunning: !!this.intervalId,  // Service is running if interval is active
      isActive: !!this.intervalId,
      lastUpdate: this.lastUpdate,
      updateInterval: this.updateInterval,
      sourceId: this.sourceId,
      mappingCount: this.mappings.size,
      isUpdating: this.isRunning  // True only during data update
    };
  }

  async forceUpdate() {
    return await this.updateData();
  }
}

module.exports = AltinKaynakService;