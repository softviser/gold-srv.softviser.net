require('dotenv').config({ path: '../.env' });
const { MongoClient } = require('mongodb');

async function addSampleData() {
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
    
    const Source = require('../models/Source');
    const PriceMapping = require('../models/PriceMapping');
    const CurrencyRate = require('../models/CurrencyRate');
    
    const sourceModel = new Source(db);
    const mappingModel = new PriceMapping(db);
    const currencyModel = new CurrencyRate(db);
    
    console.log('Örnek veriler ekleniyor...\n');
    
    // 1. Veri kaynakları ekle
    console.log('📊 Veri kaynakları ekleniyor...');
    
    const sources = [
      {
        name: 'harem_altin',
        displayName: 'Harem Altın',
        type: 'api',
        category: 'gold_dealer',
        url: 'https://haremaltin.com',
        apiUrl: 'https://api.haremaltin.com/prices',
        updateInterval: 60,
        priority: 1,
        dataFormat: 'json',
        currency: 'TRY',
        metadata: {
          description: 'Harem Altın mağazalarının fiyat API\'si',
          location: 'İstanbul'
        }
      },
      {
        name: 'hakan_altin',
        displayName: 'Hakan Altın',
        type: 'webscraping',
        category: 'gold_dealer',
        url: 'https://hakanaltin.com',
        updateInterval: 300,
        priority: 2,
        dataFormat: 'html',
        currency: 'TRY',
        scrapingConfig: {
          goldSelector: '.gold-price',
          usdSelector: '.usd-rate'
        },
        metadata: {
          description: 'Hakan Altın web sitesi scraping',
          location: 'Ankara'
        }
      },
      {
        name: 'altin_kaynak',
        displayName: 'Altın Kaynak',
        type: 'api',
        category: 'gold_dealer',
        url: 'https://altinkaynak.com',
        apiUrl: 'https://api.altinkaynak.com/v1/rates',
        updateInterval: 120,
        priority: 3,
        dataFormat: 'json',
        currency: 'TRY',
        metadata: {
          description: 'Altın Kaynak fiyat servisi',
          location: 'İzmir'
        }
      },
      {
        name: 'tcmb',
        displayName: 'TCMB',
        type: 'api',
        category: 'government',
        url: 'https://www.tcmb.gov.tr',
        apiUrl: 'https://www.tcmb.gov.tr/kurlar/today.xml',
        updateInterval: 3600,
        priority: 1,
        dataFormat: 'xml',
        currency: 'TRY',
        metadata: {
          description: 'Türkiye Cumhuriyet Merkez Bankası resmi kurları',
          reliability: 'high'
        }
      },
      {
        name: 'investing_com',
        displayName: 'Investing.com',
        type: 'webscraping',
        category: 'exchange',
        url: 'https://tr.investing.com',
        updateInterval: 300,
        priority: 2,
        dataFormat: 'html',
        currency: 'USD',
        scrapingConfig: {
          goldSelector: '#gold-price',
          forexSelector: '.currency-rate'
        },
        metadata: {
          description: 'Investing.com finansal veriler',
          international: true
        }
      }
    ];
    
    const sourceResult = await sourceModel.bulkCreate(sources);
    console.log(`✅ ${sourceResult.insertedCount} veri kaynağı eklendi\n`);
    
    // Eklenen kaynakları al
    const addedSources = await sourceModel.getActiveSources();
    
    // 2. Para birimlerini ekle
    console.log('💱 Para birimleri ekleniyor...');
    
    const currencies = [
      {
        symbol: 'USD/TRY',
        baseCurrency: 'USD',
        quoteCurrency: 'TRY',
        rate: 34.25,
        bid: 34.20,
        ask: 34.30,
        source: 'tcmb',
        metadata: { type: 'forex', priority: 1 }
      },
      {
        symbol: 'EUR/TRY',
        baseCurrency: 'EUR',
        quoteCurrency: 'TRY',
        rate: 37.15,
        bid: 37.10,
        ask: 37.20,
        source: 'tcmb',
        metadata: { type: 'forex', priority: 1 }
      },
      {
        symbol: 'HAS/TRY',
        baseCurrency: 'HAS',
        quoteCurrency: 'TRY',
        rate: 2850.50,
        bid: 2845.00,
        ask: 2855.00,
        source: 'harem_altin',
        metadata: { type: 'gold', unit: 'gram', purity: '24K', priority: 1 }
      },
      {
        symbol: 'QUARTER_GOLD/TRY',
        baseCurrency: 'QUARTER_GOLD',
        quoteCurrency: 'TRY',
        rate: 4650.00,
        bid: 4640.00,
        ask: 4660.00,
        source: 'hakan_altin',
        metadata: { type: 'gold', unit: 'piece', description: 'Çeyrek Altın', priority: 1 }
      }
    ];
    
    const currencyResult = await currencyModel.bulkCreate(currencies);
    console.log(`✅ ${currencyResult.insertedCount} para birimi eklendi\n`);
    
    // 3. Fiyat eşleştirmelerini ekle
    console.log('🔗 Fiyat eşleştirmeleri ekleniyor...');
    
    const mappings = [];
    
    // Harem Altın eşleştirmeleri
    const haremSource = addedSources.find(s => s.name === 'harem_altin');
    if (haremSource) {
      mappings.push(
        {
          sourceId: haremSource._id,
          sourceField: 'usd',
          sourceDescription: 'USD kuru',
          targetSymbol: 'USD/TRY',
          targetType: 'forex',
          priority: 1
        },
        {
          sourceId: haremSource._id,
          sourceField: 'gold_gram',
          sourceDescription: 'Gram altın fiyatı',
          targetSymbol: 'HAS/TRY',
          targetType: 'gold',
          priority: 1
        },
        {
          sourceId: haremSource._id,
          sourceField: 'quarter_gold',
          sourceDescription: 'Çeyrek altın fiyatı',
          targetSymbol: 'QUARTER_GOLD/TRY',
          targetType: 'gold',
          priority: 1
        }
      );
    }
    
    // Hakan Altın eşleştirmeleri
    const hakanSource = addedSources.find(s => s.name === 'hakan_altin');
    if (hakanSource) {
      mappings.push(
        {
          sourceId: hakanSource._id,
          sourceField: '114',
          sourceDescription: 'USD kuru (field 114)',
          targetSymbol: 'USD/TRY',
          targetType: 'forex',
          priority: 2
        },
        {
          sourceId: hakanSource._id,
          sourceField: 'gold_price',
          sourceDescription: 'Altın fiyatı',
          targetSymbol: 'HAS/TRY',
          targetType: 'gold',
          priority: 2
        }
      );
    }
    
    // TCMB eşleştirmeleri
    const tcmbSource = addedSources.find(s => s.name === 'tcmb');
    if (tcmbSource) {
      mappings.push(
        {
          sourceId: tcmbSource._id,
          sourceField: 'USD',
          sourceDescription: 'USD resmi kuru',
          targetSymbol: 'USD/TRY',
          targetType: 'forex',
          priority: 1
        },
        {
          sourceId: tcmbSource._id,
          sourceField: 'EUR',
          sourceDescription: 'EUR resmi kuru',
          targetSymbol: 'EUR/TRY',
          targetType: 'forex',
          priority: 1
        }
      );
    }
    
    if (mappings.length > 0) {
      const mappingResult = await mappingModel.bulkCreate(mappings);
      console.log(`✅ ${mappingResult.insertedCount} fiyat eşleştirmesi eklendi\n`);
    }
    
    // İstatistikleri göster
    console.log('📊 Sistem İstatistikleri:');
    const [sourceStats, mappingStats, currencyStats] = await Promise.all([
      sourceModel.getStats(),
      mappingModel.getStats(),
      currencyModel.getStats()
    ]);
    
    console.log('   Veri Kaynakları:');
    console.log(`     Toplam: ${sourceStats.totalSources}`);
    console.log(`     Aktif: ${sourceStats.activeSources}`);
    console.log(`     API: ${sourceStats.apiSources}`);
    console.log(`     Web Scraping: ${sourceStats.scrapingSources}`);
    
    console.log('   Fiyat Eşleştirmeleri:');
    console.log(`     Toplam: ${mappingStats.totalMappings}`);
    console.log(`     Aktif: ${mappingStats.activeMappings}`);
    console.log(`     Forex: ${mappingStats.forexMappings}`);
    console.log(`     Altın: ${mappingStats.goldMappings}`);
    
    console.log('   Para Birimleri:');
    console.log(`     Toplam kayıt: ${currencyStats.totalRecords}`);
    console.log(`     Benzersiz sembol: ${currencyStats.symbolCount}`);
    console.log(`     Kaynaklar: ${currencyStats.sources.join(', ')}`);
    
    console.log('\n🎉 Örnek veriler başarıyla eklendi!');
    console.log('🌐 Yönetim panelinden kontrol edebilirsiniz: http://localhost:6701/admin');
    
  } catch (error) {
    console.error('Hata:', error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
    }
  }
}

addSampleData();