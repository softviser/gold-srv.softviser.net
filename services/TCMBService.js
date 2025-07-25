const axios = require('axios');
const xml2js = require('xml2js');
const { ObjectId } = require('mongodb');
const LoggerHelper = require('../utils/logger');
const devLogger = require('../utils/devLogger');
const cronLogger = require('../utils/cronLogger');
const DateHelper = require('../utils/dateHelper');

class TCMBService {
  constructor(db) {
    this.db = db;
    this.isRunning = false;
    this.updateInterval = null;
    this.lastUpdateTime = null;
    this.priceData = new Map();
    
    // TCMB currency mapping - Sadece TCMB XML'inde bulunan kurlar
    // TCMB günlük XML'inde genelde ana para birimleri bulunur
    this.currencyMapping = {
      // Ana rezerv para birimleri - her zaman TCMB'de bulunur
      'USD': 'USD/TRY',    // ABD Doları
      'EUR': 'EUR/TRY',    // Euro
      'GBP': 'GBP/TRY',    // İngiliz Sterlini
      'CHF': 'CHF/TRY',    // İsviçre Frangı
      'JPY': 'JPY/TRY',    // Japon Yeni
      
      // Diğer gelişmiş ülke para birimleri
      'CAD': 'CAD/TRY',    // Kanada Doları
      'AUD': 'AUD/TRY',    // Avustralya Doları
      'NZD': 'NZD/TRY',    // Yeni Zelanda Doları
      'SEK': 'SEK/TRY',    // İsveç Kronu
      'NOK': 'NOK/TRY',    // Norveç Kronu
      'DKK': 'DKK/TRY',    // Danimarka Kronu
      
      // Bölgesel önemli para birimleri
      'SAR': 'SAR/TRY',    // Suudi Arabistan Riyali
      'AED': 'AED/TRY',    // BAE Dirhemi
      'QAR': 'QAR/TRY',    // Katar Riyali
      'KWD': 'KWD/TRY',    // Kuveyt Dinarı
      'BHD': 'BHD/TRY',    // Bahreyn Dinarı
      'JOD': 'JOD/TRY',    // Ürdün Dinarı
      'EGP': 'EGP/TRY',    // Mısır Lirası
      'LBP': 'LBP/TRY',    // Lübnan Lirası
      
      // Büyük ekonomiler
      'CNY': 'CNY/TRY',    // Çin Yuanı
      'RUB': 'RUB/TRY',    // Rus Rublesi
      'INR': 'INR/TRY',    // Hindistan Rupisi
      'KRW': 'KRW/TRY',    // Güney Kore Wonu
      'SGD': 'SGD/TRY',    // Singapur Doları
      'HKD': 'HKD/TRY',    // Hong Kong Doları
      'MYR': 'MYR/TRY',    // Malezya Ringgiti
      'THB': 'THB/TRY',    // Tayland Bahtı
      'IDR': 'IDR/TRY',    // Endonezya Rupisi
      'PHP': 'PHP/TRY',    // Filipin Pesosu
      'TWD': 'TWD/TRY',    // Tayvan Doları
      
      // Avrupa para birimleri
      'PLN': 'PLN/TRY',    // Polonya Zlotisi
      'CZK': 'CZK/TRY',    // Çek Korunası
      'HUF': 'HUF/TRY',    // Macar Forinti
      'RON': 'RON/TRY',    // Romen Leyi
      'BGN': 'BGN/TRY',    // Bulgar Levası
      'RSD': 'RSD/TRY',    // Sırbistan Dinarı
      'HRK': 'HRK/TRY',    // Hırvatistan Kunası
      'UAH': 'UAH/TRY',    // Ukrayna Grivnası
      
      // Diğer önemli para birimleri
      'ZAR': 'ZAR/TRY',    // Güney Afrika Randı
      'ILS': 'ILS/TRY',    // İsrail Şekeli
      'BRL': 'BRL/TRY',    // Brezilya Reali
      'MXN': 'MXN/TRY',    // Meksika Pesosu
      'ARS': 'ARS/TRY',    // Arjantin Pesosu
      'CLP': 'CLP/TRY',    // Şili Pesosu
      'COP': 'COP/TRY',    // Kolombiya Pesosu
      'PEN': 'PEN/TRY',    // Peru Solu
      'UYU': 'UYU/TRY',    // Uruguay Pesosu
      
      // Afrika ve Orta Doğu
      'MAD': 'MAD/TRY',    // Fas Dirhemi
      'TND': 'TND/TRY',    // Tunus Dinarı
      'DZD': 'DZD/TRY',    // Cezayir Dinarı
      'LYD': 'LYD/TRY',    // Libya Dinarı
      'IRR': 'IRR/TRY',    // İran Riyali
      'IQD': 'IQD/TRY',    // Irak Dinarı
      'SYP': 'SYP/TRY',    // Suriye Lirası
      'PKR': 'PKR/TRY',    // Pakistan Rupisi
      'LKR': 'LKR/TRY',    // Sri Lanka Rupisi
      
      // Diğer
      'KZT': 'KZT/TRY',    // Kazakistan Tengesi
      'AZN': 'AZN/TRY',    // Azerbaycan Manatı
      'GEL': 'GEL/TRY',    // Gürcistan Larisi
      'ALL': 'ALL/TRY',    // Arnavutluk Leki
      'BAM': 'BAM/TRY',    // Bosna Hersek Markı
      'MKD': 'MKD/TRY',    // Makedonya Dinarı
      'MDL': 'MDL/TRY',    // Moldova Leyi
      'OMR': 'OMR/TRY',    // Umman Riyali
      'CRC': 'CRC/TRY',    // Kosta Rika Kolonu
      'ISK': 'ISK/TRY'     // İzlanda Kronu
    };
    
    this.sourceInfo = {
      name: 'tcmb',
      displayName: 'TCMB',
      url: 'https://www.tcmb.gov.tr',
      type: 'api',
      category: 'central_bank',
      isActive: true
    };

    // Update interval (1 saat)
    this.updateIntervalMs = 3600000; // 1 hour
    
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
        source: 'tcmb',
        data: priceData
      };
      
      // Send to main price channel
      this.socketServer.to('price').emit('price_update', payload);
      
      // Send to source-specific channel  
      this.socketServer.to('tcmb').emit('price_update', payload);
    } catch (error) {
      devLogger.error('TCMBService', 'Socket emission error', error);
    }
  }
  
  // Send data disruption alert
  sendDataDisruptionAlert(message) {
    if (!this.socketServer) return;
    
    try {
      const alert = {
        timestamp: new Date().toISOString(),
        service: 'tcmb',
        type: 'data_disruption',
        message: message,
        severity: 'warning'
      };
      
      // Send to alerts channel
      this.socketServer.to('alerts').emit('anomaly_alert', alert);
      
      // Send to system channel
      this.socketServer.to('system').emit('service_alert', alert);
    } catch (error) {
      devLogger.error('TCMBService', 'Alert emission error', error);
    }
  }

  async start() {
    if (this.isRunning) {
      devLogger.info('TCMBService', '🟡 TCMB servisi zaten çalışıyor');
      return;
    }

    try {
      await this.ensureSourceExists();
      await this.loadSystemCurrencies();
      await this.loadDatabaseMappings(); // Veritabanından mapping'leri yükle
      
      // İlk güncellemeyi hemen yap
      await this.updatePrices();
      
      // Periyodik güncellemeyi başlat (her saat başı)
      const now = DateHelper.createDate();
      const nextHour = new Date(now);
      nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
      const timeUntilNextHour = nextHour - now;
      
      // İlk saat başına kadar bekle
      setTimeout(() => {
        this.updatePrices().catch(error => {
          devLogger.error('TCMBService', '❌ TCMB ilk saat başı güncelleme hatası:', error);
        });
        
        // Sonra her saat başı güncelle
        this.updateInterval = setInterval(() => {
          cronLogger.startJob('TCMB-Update');
          this.updatePrices().then(() => {
            cronLogger.endJob('TCMB-Update', 'success', { message: 'Price update completed' });
          }).catch(error => {
            devLogger.error('TCMBService', '❌ TCMB periyodik güncelleme hatası:', error);
            cronLogger.endJob('TCMB-Update', 'error', { error: error.message });
          });
        }, this.updateIntervalMs);
        
        cronLogger.startJob('TCMBService', 'Hourly update');
      }, timeUntilNextHour);
      
      this.isRunning = true;
      LoggerHelper.logSuccess('tcmb', 'Servis başlatıldı');
    } catch (error) {
      devLogger.error('TCMBService', '❌ TCMB servisi başlatma hatası:', error);
      throw error;
    }
  }

  async stop() {
    this.isRunning = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    devLogger.info('TCMBService', '🛑 TCMB servisi durduruldu');
  }

  async loadSystemCurrencies() {
    try {
      const systemCurrencies = await this.db.collection('system_currencies').find({ 
        isActive: true 
      }).toArray();
      
      this.allowedSymbols = new Set(systemCurrencies.map(curr => curr.symbol));
      devLogger.info('TCMBService', `✅ ${this.allowedSymbols.size} adet sistem currency yüklendi`);
    } catch (error) {
      devLogger.error('TCMBService', '❌ Sistem currencies yükleme hatası:', error);
      this.allowedSymbols = new Set();
    }
  }

  async loadDatabaseMappings() {
    try {
      const source = await this.db.collection('sources').findOne({ 
        name: this.sourceInfo.name 
      });
      
      if (!source) {
        devLogger.error('TCMBService', '❌ TCMB kaynağı bulunamadı');
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

      devLogger.info('TCMBService', `✅ ${mappings.length} adet mapping veritabanından yüklendi:`, this.currencyMapping);
    } catch (error) {
      devLogger.error('TCMBService', '❌ Database mappings yükleme hatası:', error);
      // Hata durumunda varsayılan mapping'leri kullan
      devLogger.info('TCMBService', '⚠️ Varsayılan mapping\'ler kullanılacak');
    }
  }

  async updatePrices() {
    const startTime = Date.now();
    devLogger.info('TCMBService', '🔄 TCMB veri güncellemesi başladı...');

    try {
      // TCMB XML'i çek
      const url = 'https://www.tcmb.gov.tr/kurlar/today.xml';
      const response = await axios.get(url, { 
        timeout: 10000,
        headers: {
          'Accept': 'application/xml',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      // XML'i parse et
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(response.data);
      
      if (!result || !result.Tarih_Date || !result.Tarih_Date.Currency) {
        throw new Error('TCMB XML verisi geçersiz format');
      }

      const currencies = Array.isArray(result.Tarih_Date.Currency) 
        ? result.Tarih_Date.Currency 
        : [result.Tarih_Date.Currency];
      
      const date = result.Tarih_Date.$.Date;
      const bultenNo = result.Tarih_Date.$.Bulten_No;
      
      devLogger.info('TCMBService', `📅 TCMB Kurları - Tarih: ${date}, Bülten: ${bultenNo}`);

      let processedCount = 0;
      let skippedCount = 0;

      // Her bir para birimi için
      for (const currency of currencies) {
        const code = currency.$.Kod;
        const systemSymbol = this.currencyMapping[code];
        
        if (!systemSymbol) {
          continue; // Mapping'de yoksa atla
        }

        // Sistem currency'de tanımlı olup olmadığını kontrol et
        if (!this.allowedSymbols || !this.allowedSymbols.has(systemSymbol)) {
          devLogger.info('TCMBService', `⚠️ ${systemSymbol} sistem currency'de tanımlı değil, atlanıyor`);
          skippedCount++;
          continue;
        }
        
        await this.processPriceData(code, systemSymbol, currency);
        processedCount++;
      }

      const duration = Date.now() - startTime;
      LoggerHelper.logDataProcessing('tcmb', processedCount, skippedCount, duration);
      
      this.lastUpdateTime = DateHelper.createDate();

      // Data disruption control
      if (processedCount > 0) {
        this.lastSuccessTime = Date.now();
        if (this.dataDisruption) {
          this.dataDisruption = false;
          LoggerHelper.logSuccess('tcmb', 'Veri akışı normale döndü');
          this.sendDataDisruptionAlert('TCMB veri akışı normale döndü');
        }
      } else if (processedCount === 0) {
        // Check if data disruption should be triggered
        const timeSinceLastSuccess = this.lastSuccessTime ? Date.now() - this.lastSuccessTime : 0;
        if (timeSinceLastSuccess > 7200000 && !this.dataDisruption) { // 2 hours for TCMB
          this.dataDisruption = true;
          const message = 'TCMB veri kesintisi algılandı - 2 saattir başarılı veri alınamıyor';
          LoggerHelper.logWarning('tcmb', message);
          this.sendDataDisruptionAlert(message);
        }
      }

    } catch (error) {
      LoggerHelper.logError('tcmb', error, 'Veri çekme hatası');
      
      // Data disruption for critical errors
      const timeSinceLastSuccess = this.lastSuccessTime ? Date.now() - this.lastSuccessTime : 0;
      if (timeSinceLastSuccess > 14400000 && !this.dataDisruption) { // 4 hours for critical errors
        this.dataDisruption = true;
        const message = 'TCMB kritik hata - 4 saattir servis çalışmıyor';
        LoggerHelper.logWarning('tcmb', message);
        this.sendDataDisruptionAlert(message);
      }
      
      throw error;
    }
  }

  async processPriceData(tcmbCode, systemSymbol, data) {
    try {
      // Önceki verileri al
      const oldData = this.priceData.get(tcmbCode) || {};
      const oldBuyPrice = oldData.buyPrice || 0;
      const oldSellPrice = oldData.sellPrice || 0;

      // Fiyatları parse et
      const forexBuying = this.parsePrice(data.ForexBuying);
      const forexSelling = this.parsePrice(data.ForexSelling);
      const banknoteBuying = data.BanknoteBuying ? this.parsePrice(data.BanknoteBuying) : forexBuying;
      const banknoteSelling = data.BanknoteSelling ? this.parsePrice(data.BanknoteSelling) : forexSelling;
      
      // Alış ve satış fiyatlarını belirle (Forex kurlarını kullan)
      const buyPrice = forexBuying;
      const sellPrice = forexSelling;

      // Geçersiz fiyatları kontrol et
      if (buyPrice === 0 || sellPrice === 0) {
        devLogger.info('TCMBService', `⚠️ ${systemSymbol} için geçersiz fiyat, atlanıyor`);
        return;
      }

      // Yeni verileri kaydet
      this.priceData.set(tcmbCode, {
        buyPrice,
        sellPrice,
        forexBuying,
        forexSelling,
        banknoteBuying,
        banknoteSelling
      });

      // Değişim yüzdesini hesapla
      const bidChangePercent = oldBuyPrice > 0 ? ((buyPrice - oldBuyPrice) / oldBuyPrice) * 100 : 0;
      const askChangePercent = oldSellPrice > 0 ? ((sellPrice - oldSellPrice) / oldSellPrice) * 100 : 0;

      LoggerHelper.logPriceUpdate('tcmb', systemSymbol, buyPrice, sellPrice, bidChangePercent);

      // Emit price update to socket channels
      this.emitPriceUpdate({
        symbol: systemSymbol,
        buyPrice: buyPrice,
        sellPrice: sellPrice,
        currency: 'TRY',
        change: bidChangePercent,
        originalData: {
          code: tcmbCode,
          name: data.Isim || systemSymbol,
          unit: data.Unit || 1,
          forexBuying,
          forexSelling,
          banknoteBuying,
          banknoteSelling
        }
      });

      // Veritabanına kaydet
      await this.savePriceData({
        symbol: systemSymbol,
        buyPrice: buyPrice,
        sellPrice: sellPrice,
        previousBuyPrice: oldBuyPrice > 0 ? oldBuyPrice : null,
        previousSellPrice: oldSellPrice > 0 ? oldSellPrice : null,
        changePercent: {
          buy: bidChangePercent,
          sell: askChangePercent
        },
        sourceData: {
          originalCode: tcmbCode,
          name: data.Isim || systemSymbol,
          unit: data.Unit || 1,
          currencyName: data.CurrencyName,
          forexBuying,
          forexSelling,
          banknoteBuying,
          banknoteSelling,
          crossRateUSD: data.CrossRateUSD ? parseFloat(data.CrossRateUSD) : null,
          crossRateOther: data.CrossRateOther ? parseFloat(data.CrossRateOther) : null,
          rawData: data
        }
      });

    } catch (error) {
      devLogger.error('TCMBService', `❌ TCMB ${systemSymbol} fiyat işleme hatası`, error);
    }
  }

  parsePrice(priceValue) {
    if (!priceValue) return 0;
    
    // String ise parse et
    if (typeof priceValue === 'string') {
      const price = parseFloat(priceValue);
      return isNaN(price) ? 0 : price;
    }
    
    // Number ise direkt döndür
    if (typeof priceValue === 'number') {
      return priceValue;
    }
    
    return 0;
  }

  async savePriceData(priceData) {
    try {
      const source = await this.db.collection('sources').findOne({ 
        name: this.sourceInfo.name 
      });
      
      if (!source) {
        devLogger.error('TCMBService', '❌ TCMB kaynağı bulunamadı');
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

    } catch (error) {
      devLogger.error('TCMBService', '❌ TCMB veri kaydetme hatası:', error);
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
        devLogger.info('TCMBService', `✅ TCMB kaynağı oluşturuldu: ${result.insertedId}`);
      } else {
        // Source'u aktif et
        await this.db.collection('sources').updateOne(
          { name: this.sourceInfo.name },
          { 
            $set: { 
              isActive: true,
              updatedAt: DateHelper.createDate()
            } 
          }
        );
        devLogger.info('TCMBService', '✅ TCMB kaynağı mevcut ve aktif edildi');
      }
    } catch (error) {
      devLogger.error('TCMBService', '❌ TCMB kaynağı oluşturma hatası:', error);
      throw error;
    }
  }

  // Test için manuel veri çekme
  async fetchSampleData() {
    try {
      const url = 'https://www.tcmb.gov.tr/kurlar/today.xml';
      const response = await axios.get(url, { 
        timeout: 10000,
        headers: {
          'Accept': 'application/xml',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(response.data);
      
      const currencies = Array.isArray(result.Tarih_Date.Currency) 
        ? result.Tarih_Date.Currency 
        : [result.Tarih_Date.Currency];
      
      // Debug: Tüm TCMB kurlarını logla
      const availableCodes = currencies.map(curr => curr.$.Kod);
      const mappedCodes = Object.keys(this.currencyMapping);
      const foundCodes = availableCodes.filter(code => this.currencyMapping[code]);
      const missingCodes = mappedCodes.filter(code => !availableCodes.includes(code));
      const unmappedCodes = availableCodes.filter(code => !this.currencyMapping[code]);
      
      devLogger.debug('TCMBService', 'TCMB Sample Data Debug:', {
        xmlCurrencyCount: availableCodes.length,
        mappingCount: mappedCodes.length,
        matchedCount: foundCodes.length,
        missingInXML: missingCodes,
        unmappedInXML: unmappedCodes,
        availableCodes: availableCodes
      });
      
      const sampleData = currencies
        .filter(curr => this.currencyMapping[curr.$.Kod])
        .map(curr => ({
          kod: curr.$.Kod,
          aciklama: curr.Isim,
          symbol: this.currencyMapping[curr.$.Kod],
          forexBuying: curr.ForexBuying,
          forexSelling: curr.ForexSelling,
          banknoteBuying: curr.BanknoteBuying,
          banknoteSelling: curr.BanknoteSelling,
          crossRateUSD: curr.CrossRateUSD,
          unit: curr.Unit || 1,
          currencyName: curr.CurrencyName
        }));
      
      return {
        success: true,
        date: result.Tarih_Date.$.Date,
        bultenNo: result.Tarih_Date.$.Bulten_No,
        sampleData: {
          currency: sampleData
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
    return {
      isRunning: this.isRunning,
      lastUpdate: this.lastUpdateTime,
      activeSymbols: this.priceData.size,
      sourceName: this.sourceInfo.name,
      updateIntervalMs: this.updateIntervalMs
    };
  }
}

module.exports = TCMBService;