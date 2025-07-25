require('dotenv').config({ path: '../.env' });
const { MongoClient } = require('mongodb');
const CurrencyRate = require('../models/CurrencyRate');

async function addCurrencies() {
  let mongoClient;
  
  try {
    // MongoDB'ye bağlan
    mongoClient = new MongoClient(process.env.MONGODB_URI, {
      auth: {
        username: process.env.MONGODB_USERNAME,
        password: process.env.MONGODB_PASSWORD
      }
    });
    
    await mongoClient.connect();
    const db = mongoClient.db();
    const currencyRate = new CurrencyRate(db);
    
    console.log('Para birimleri ekleniyor...\n');
    
    // Döviz kurları
    const currencies = [
      {
        symbol: 'USD/TRY',
        baseCurrency: 'USD',
        quoteCurrency: 'TRY',
        rate: 34.25,
        bid: 34.20,
        ask: 34.30,
        source: 'manual',
        metadata: { type: 'forex', priority: 1 }
      },
      {
        symbol: 'EUR/TRY',
        baseCurrency: 'EUR',
        quoteCurrency: 'TRY',
        rate: 37.15,
        bid: 37.10,
        ask: 37.20,
        source: 'manual',
        metadata: { type: 'forex', priority: 1 }
      },
      {
        symbol: 'GBP/TRY',
        baseCurrency: 'GBP',
        quoteCurrency: 'TRY',
        rate: 42.85,
        bid: 42.80,
        ask: 42.90,
        source: 'manual',
        metadata: { type: 'forex', priority: 2 }
      },
      {
        symbol: 'CHF/TRY',
        baseCurrency: 'CHF',
        quoteCurrency: 'TRY',
        rate: 38.75,
        bid: 38.70,
        ask: 38.80,
        source: 'manual',
        metadata: { type: 'forex', priority: 3 }
      },
      {
        symbol: 'RUB/TRY',
        baseCurrency: 'RUB',
        quoteCurrency: 'TRY',
        rate: 0.34,
        bid: 0.33,
        ask: 0.35,
        source: 'manual',
        metadata: { type: 'forex', priority: 3 }
      },
      {
        symbol: 'SAR/TRY',
        baseCurrency: 'SAR',
        quoteCurrency: 'TRY',
        rate: 9.15,
        bid: 9.10,
        ask: 9.20,
        source: 'manual',
        metadata: { type: 'forex', priority: 3 }
      },
      
      // Altın fiyatları
      {
        symbol: 'HAS/TRY',
        baseCurrency: 'HAS',
        quoteCurrency: 'TRY',
        rate: 2850.50,
        bid: 2845.00,
        ask: 2855.00,
        source: 'manual',
        metadata: { type: 'gold', unit: 'gram', purity: '24K', priority: 1 }
      },
      {
        symbol: 'QUARTER_GOLD/TRY',
        baseCurrency: 'QUARTER_GOLD',
        quoteCurrency: 'TRY',
        rate: 4650.00,
        bid: 4640.00,
        ask: 4660.00,
        source: 'manual',
        metadata: { type: 'gold', unit: 'piece', description: 'Çeyrek Altın', priority: 1 }
      },
      {
        symbol: 'HALF_GOLD/TRY',
        baseCurrency: 'HALF_GOLD',
        quoteCurrency: 'TRY',
        rate: 9300.00,
        bid: 9280.00,
        ask: 9320.00,
        source: 'manual',
        metadata: { type: 'gold', unit: 'piece', description: 'Yarım Altın', priority: 1 }
      },
      {
        symbol: 'FULL_GOLD/TRY',
        baseCurrency: 'FULL_GOLD',
        quoteCurrency: 'TRY',
        rate: 18600.00,
        bid: 18560.00,
        ask: 18640.00,
        source: 'manual',
        metadata: { type: 'gold', unit: 'piece', description: 'Tam Altın', priority: 1 }
      },
      {
        symbol: 'XAU/USD',
        baseCurrency: 'XAU',
        quoteCurrency: 'USD',
        rate: 2680.50,
        bid: 2679.00,
        ask: 2682.00,
        source: 'manual',
        metadata: { type: 'gold', unit: 'ounce', description: 'Uluslararası Altın', priority: 1 }
      },
      {
        symbol: 'XAU/EUR',
        baseCurrency: 'XAU',
        quoteCurrency: 'EUR',
        rate: 2485.30,
        bid: 2483.50,
        ask: 2487.10,
        source: 'manual',
        metadata: { type: 'gold', unit: 'ounce', description: 'Altın/Euro', priority: 2 }
      }
    ];
    
    // Toplu ekleme
    const result = await currencyRate.bulkCreate(currencies);
    console.log(`✅ ${result.insertedCount} adet para birimi eklendi\n`);
    
    // Eklenen verileri listele
    console.log('Eklenen para birimleri:');
    currencies.forEach((currency, index) => {
      const type = currency.metadata.type === 'forex' ? '💱' : '🥇';
      console.log(`${index + 1}. ${type} ${currency.symbol} - ${currency.rate} ${currency.quoteCurrency}`);
    });
    
    console.log('\n📊 Özet:');
    const forexCount = currencies.filter(c => c.metadata.type === 'forex').length;
    const goldCount = currencies.filter(c => c.metadata.type === 'gold').length;
    console.log(`💱 Döviz kurları: ${forexCount} adet`);
    console.log(`🥇 Altın fiyatları: ${goldCount} adet`);
    
  } catch (error) {
    console.error('Hata:', error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
    }
  }
}

addCurrencies();