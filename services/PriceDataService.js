const axios = require('axios');
const cheerio = require('cheerio');

class PriceDataService {
  constructor(db, dataEmitter) {
    this.db = db;
    this.dataEmitter = dataEmitter;
    
    // Model instances
    const CurrencyRate = require('../models/CurrencyRate');
    const GoldPrice = require('../models/GoldPrice');
    
    this.currencyRate = new CurrencyRate(db);
    this.goldPrice = new GoldPrice(db);
    
    // API keys (environment variables'dan alınacak)
    this.apiKeys = {
      exchangeRateApi: process.env.EXCHANGE_RATE_API_KEY,
      fixerApi: process.env.FIXER_API_KEY,
      goldApi: process.env.GOLD_API_KEY
    };
    
    // Request intervals (ms)
    this.intervals = {
      realtime: 30000,    // 30 saniye
      frequent: 300000,   // 5 dakika
      daily: 3600000      // 1 saat
    };
    
    // Target currencies
    this.currencies = ['USD', 'EUR', 'GBP', 'CHF', 'RUB', 'SAR'];
    this.baseCurrency = 'TRY';
  }

  // Ana başlatma fonksiyonu
  start() {
    console.log('[PriceDataService] Veri toplama servisi başlatılıyor...');
    
    // İlk veri çekimi
    this.fetchAllData();
    
    // Periyodik güncellemeler
    this.startPeriodicUpdates();
  }

  // Tüm veriyi çek
  async fetchAllData() {
    try {
      await Promise.all([
        this.fetchCurrencyRates(),
        this.fetchGoldPrices()
      ]);
    } catch (error) {
      console.error('[PriceDataService] Veri çekme hatası:', error);
    }
  }

  // Periyodik güncellemeleri başlat
  startPeriodicUpdates() {
    // Gerçek zamanlı güncellemeler (30 saniye)
    setInterval(() => {
      this.fetchCurrencyRates('realtime');
      this.fetchGoldPrices('realtime');
    }, this.intervals.realtime);

    // Sık güncellemeler (5 dakika)
    setInterval(() => {
      this.fetchCurrencyRates('frequent');
      this.fetchGoldPrices('frequent');
    }, this.intervals.frequent);

    // Günlük güncellemeler (1 saat)
    setInterval(() => {
      this.fetchTCMBRates();
    }, this.intervals.daily);
  }

  // DÖVİZ KURLARI

  // Döviz kurlarını çek
  async fetchCurrencyRates(priority = 'frequent') {
    const sources = [
      { name: 'exchangerate-api', func: this.fetchExchangeRateAPI.bind(this) },
      { name: 'fixer', func: this.fetchFixerAPI.bind(this) },
      { name: 'tcmb', func: this.fetchTCMBRates.bind(this) }
    ];

    for (const source of sources) {
      try {
        await source.func();
        break; // İlk başarılı kaynak yeterli
      } catch (error) {
        console.error(`[PriceDataService] ${source.name} hatası:`, error.message);
        continue;
      }
    }
  }

  // ExchangeRate-API
  async fetchExchangeRateAPI() {
    if (!this.apiKeys.exchangeRateApi) {
      throw new Error('ExchangeRate-API key bulunamadı');
    }

    const url = `https://v6.exchangerate-api.com/v6/${this.apiKeys.exchangeRateApi}/latest/TRY`;
    const response = await axios.get(url);
    
    if (response.data.result !== 'success') {
      throw new Error('ExchangeRate-API yanıt hatası');
    }

    const rates = response.data.conversion_rates;
    const rateData = [];

    for (const currency of this.currencies) {
      if (rates[currency]) {
        const rate = 1 / rates[currency]; // TRY bazlı kur
        
        rateData.push({
          symbol: `${currency}/${this.baseCurrency}`,
          baseCurrency: currency,
          quoteCurrency: this.baseCurrency,
          rate: rate,
          source: 'exchangerate-api',
          sourceUrl: url
        });
      }
    }

    if (rateData.length > 0) {
      const result = await this.currencyRate.bulkCreate(rateData);
      console.log(`[PriceDataService] ExchangeRate-API: ${result.insertedCount} kur güncellendi`);
      
      // Socket broadcast
      this.broadcastCurrencyRates(rateData);
    }
  }

  // Fixer.io API
  async fetchFixerAPI() {
    if (!this.apiKeys.fixerApi) {
      throw new Error('Fixer API key bulunamadı');
    }

    const symbols = this.currencies.join(',');
    const url = `http://data.fixer.io/api/latest?access_key=${this.apiKeys.fixerApi}&base=EUR&symbols=TRY,${symbols}`;
    
    const response = await axios.get(url);
    
    if (!response.data.success) {
      throw new Error('Fixer API yanıt hatası');
    }

    const rates = response.data.rates;
    const rateData = [];

    // EUR/TRY
    if (rates.TRY) {
      rateData.push({
        symbol: 'EUR/TRY',
        baseCurrency: 'EUR',
        quoteCurrency: 'TRY',
        rate: rates.TRY,
        source: 'fixer',
        sourceUrl: url
      });
    }

    // Diğer kurlar (EUR üzerinden hesaplama)
    for (const currency of this.currencies) {
      if (currency !== 'EUR' && rates[currency] && rates.TRY) {
        const rate = rates.TRY / rates[currency];
        
        rateData.push({
          symbol: `${currency}/TRY`,
          baseCurrency: currency,
          quoteCurrency: 'TRY',
          rate: rate,
          source: 'fixer',
          sourceUrl: url
        });
      }
    }

    if (rateData.length > 0) {
      const result = await this.currencyRate.bulkCreate(rateData);
      console.log(`[PriceDataService] Fixer: ${result.insertedCount} kur güncellendi`);
      
      // Socket broadcast
      this.broadcastCurrencyRates(rateData);
    }
  }

  // TCMB kurları
  async fetchTCMBRates() {
    const url = 'https://www.tcmb.gov.tr/kurlar/today.xml';
    
    try {
      const response = await axios.get(url);
      const xml = response.data;
      
      // XML parsing burada yapılacak (xml2js kullanılabilir)
      console.log('[PriceDataService] TCMB verileri alındı');
      
    } catch (error) {
      console.error('[PriceDataService] TCMB hatası:', error.message);
    }
  }

  // ALTIN FİYATLARI

  // Altın fiyatlarını çek
  async fetchGoldPrices(priority = 'frequent') {
    const sources = [
      { name: 'has', func: this.fetchHASPrices.bind(this) },
      { name: 'goldprice', func: this.fetchGoldPriceOrg.bind(this) },
      { name: 'investing', func: this.fetchInvestingGold.bind(this) }
    ];

    for (const source of sources) {
      try {
        await source.func();
      } catch (error) {
        console.error(`[PriceDataService] ${source.name} altın hatası:`, error.message);
      }
    }
  }

  // HAS altın fiyatları (web scraping)
  async fetchHASPrices() {
    const url = 'https://has.org.tr/';
    
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const $ = cheerio.load(response.data);
      
      // HAS web sitesinden fiyat çekme logic'i burada olacak
      console.log('[PriceDataService] HAS fiyatları kontrol edildi');
      
    } catch (error) {
      console.error('[PriceDataService] HAS web scraping hatası:', error.message);
    }
  }

  // GoldPrice.org API
  async fetchGoldPriceOrg() {
    try {
      const url = 'https://api.goldprice.org/v1/XAU/USD,EUR,TRY';
      const response = await axios.get(url);
      
      if (response.data && response.data.price) {
        const priceData = [];
        
        Object.keys(response.data.price).forEach(currency => {
          priceData.push({
            type: 'XAU',
            unit: 'ounce',
            currency: currency,
            price: response.data.price[currency],
            source: 'goldprice',
            sourceUrl: url
          });
        });

        if (priceData.length > 0) {
          const result = await this.goldPrice.bulkCreate(priceData);
          console.log(`[PriceDataService] GoldPrice.org: ${result.insertedCount} altın fiyatı güncellendi`);
          
          // Socket broadcast
          this.broadcastGoldPrices(priceData);
        }
      }
    } catch (error) {
      console.error('[PriceDataService] GoldPrice.org hatası:', error.message);
    }
  }

  // Investing.com altın (web scraping)
  async fetchInvestingGold() {
    // Web scraping logic burada olacak
    console.log('[PriceDataService] Investing.com altın fiyatları kontrol edildi');
  }

  // SOCKET BROADCAST

  // Döviz kurlarını yayınla
  broadcastCurrencyRates(rates) {
    rates.forEach(rate => {
      // Genel kanal
      this.dataEmitter.broadcastToChannel('currency-rates', 'rate-update', rate);
      
      // Spesifik kur kanalı
      const channelName = rate.symbol.toLowerCase().replace('/', '-');
      this.dataEmitter.broadcastToChannel(channelName, 'rate-update', rate);
    });
  }

  // Altın fiyatlarını yayınla
  broadcastGoldPrices(prices) {
    prices.forEach(price => {
      // Genel kanal
      this.dataEmitter.broadcastToChannel('gold-prices', 'price-update', price);
      
      // Tip bazlı kanal
      if (price.type === 'HAS') {
        this.dataEmitter.broadcastToChannel('has-gold', 'price-update', price);
      } else if (price.type === 'XAU') {
        this.dataEmitter.broadcastToChannel('international-gold', 'price-update', price);
      }
    });
  }

  // Servis durdur
  stop() {
    console.log('[PriceDataService] Veri toplama servisi durduruluyor...');
    // Interval'ları temizle
  }
}

module.exports = PriceDataService;