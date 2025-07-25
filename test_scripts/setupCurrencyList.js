require('dotenv').config();
const { MongoClient } = require('mongodb');

async function setupCurrencyList() {
  let mongoClient;
  
  try {
    console.log('MongoDB bağlantısı kuruluyor...');
    
    const mongoUri = process.env.MONGODB_URI;
    const mongoOptions = {
      auth: {
        username: process.env.MONGODB_USERNAME,
        password: process.env.MONGODB_PASSWORD
      }
    };

    mongoClient = new MongoClient(mongoUri, mongoOptions);
    await mongoClient.connect();
    const db = mongoClient.db();
    
    console.log('✓ MongoDB bağlantısı başarılı');

    // CurrencyRate modelini kullanarak currency listesini oluştur
    const CurrencyRate = require('../models/CurrencyRate');
    const currencyModel = new CurrencyRate(db);

    // Önce mevcut currency'leri temizle
    await db.collection('currency_rates').deleteMany({});
    console.log('🗑️ Mevcut currency verileri temizlendi');

    // İstenen currency listesi
    const requiredCurrencies = [
      {
        symbol: 'USD/TRY',
        code: 'USD',
        name: 'Amerikan Doları',
        type: 'forex',
        isActive: true,
        priority: 1
      },
      {
        symbol: 'EUR/TRY', 
        code: 'EUR',
        name: 'Avrupa Para Birimi',
        type: 'forex',
        isActive: true,
        priority: 1
      },
      {
        symbol: 'GBP/TRY',
        code: 'GBP', 
        name: 'İngiliz Sterlini',
        type: 'forex',
        isActive: true,
        priority: 1
      },
      {
        symbol: 'HAS/TRY',
        code: 'HAS',
        name: 'Has Altın',
        type: 'gold',
        isActive: true,
        priority: 1
      },
      {
        symbol: 'SAR/TRY',
        code: 'SAR',
        name: 'Suudi Riyal',
        type: 'forex',
        isActive: true,
        priority: 2
      },
      {
        symbol: 'RUB/TRY',
        code: 'RUB',
        name: 'Rus Rublesi',
        type: 'forex',
        isActive: true,
        priority: 2
      },
      {
        symbol: 'CNY/TRY',
        code: 'CNY',
        name: 'Çin Yuanı',
        type: 'forex',
        isActive: true,
        priority: 2
      },
      {
        symbol: 'AED/TRY',
        code: 'AED',
        name: 'BAE Dirhemi',
        type: 'forex',
        isActive: true,
        priority: 2
      }
    ];

    console.log('\n📝 Currency listesi oluşturuluyor...');
    
    for (const currency of requiredCurrencies) {
      try {
        await currencyModel.addRate({
          symbol: currency.symbol,
          buyPrice: 0, // Başlangıç değeri
          sellPrice: 0,
          source: 'system',
          metadata: {
            code: currency.code,
            name: currency.name,
            type: currency.type,
            isActive: currency.isActive,
            priority: currency.priority,
            isSystemDefined: true
          }
        });
        console.log(`  ✓ ${currency.symbol} - ${currency.name} eklendi`);
      } catch (error) {
        console.error(`  ❌ ${currency.symbol} eklenirken hata:`, error.message);
      }
    }

    // Oluşturulan currency listesini göster
    const allCurrencies = await currencyModel.getLatestRates();
    console.log(`\n📋 Sistem currency listesi (${allCurrencies.length} adet):`);
    
    allCurrencies.forEach(currency => {
      const meta = currency.metadata;
      const status = meta?.isActive ? '✓' : '✗';
      const priority = meta?.priority || 'N/A';
      console.log(`  ${status} ${currency.symbol} - ${meta?.name} (öncelik: ${priority})`);
    });

    // Öncelik 1 (mevcut kaynaklar) ve öncelik 2 (eksik kaynaklar) ayırımı
    const priority1 = allCurrencies.filter(c => c.metadata?.priority === 1);
    const priority2 = allCurrencies.filter(c => c.metadata?.priority === 2);

    console.log(`\n🎯 Öncelik 1 (Mevcut kaynaklardan alınabilir): ${priority1.length} adet`);
    priority1.forEach(c => console.log(`  • ${c.symbol} - ${c.metadata?.name}`));

    console.log(`\n⏳ Öncelik 2 (Yeni kaynak gerekli): ${priority2.length} adet`);
    priority2.forEach(c => console.log(`  • ${c.symbol} - ${c.metadata?.name}`));

    console.log('\n✅ Currency listesi sistem tablosunda hazır!');
    console.log('🔗 Artık price mappingler bu listeye göre yapılabilir.');

  } catch (error) {
    console.error('❌ Hata:', error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
      console.log('\nMongoDB bağlantısı kapatıldı');
    }
  }
}

// Script'i çalıştır
setupCurrencyList();