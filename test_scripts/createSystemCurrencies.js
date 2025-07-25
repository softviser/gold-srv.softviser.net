require('dotenv').config();
const { MongoClient } = require('mongodb');

async function createSystemCurrencies() {
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

    // System currencies collection oluştur
    const systemCurrenciesCollection = db.collection('system_currencies');
    
    // Önce mevcut system currencies'leri temizle
    await systemCurrenciesCollection.deleteMany({});
    console.log('🗑️ Mevcut system currency verileri temizlendi');

    // İstenen currency listesi
    const systemCurrencies = [
      {
        symbol: 'USD/TRY',
        code: 'USD',
        name: 'Amerikan Doları',
        type: 'forex',
        baseCurrency: 'USD',
        quoteCurrency: 'TRY',
        isActive: true,
        priority: 1,
        hasSource: true, // AltinKaynak'ta mevcut
        sources: ['altinkaynak'],
        description: 'Amerikan Doları / Türk Lirası',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        symbol: 'EUR/TRY',
        code: 'EUR',
        name: 'Avrupa Para Birimi',
        type: 'forex',
        baseCurrency: 'EUR',
        quoteCurrency: 'TRY',
        isActive: true,
        priority: 1,
        hasSource: true, // AltinKaynak'ta mevcut
        sources: ['altinkaynak'],
        description: 'Euro / Türk Lirası',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        symbol: 'GBP/TRY',
        code: 'GBP',
        name: 'İngiliz Sterlini',
        type: 'forex',
        baseCurrency: 'GBP',
        quoteCurrency: 'TRY',
        isActive: true,
        priority: 1,
        hasSource: true, // AltinKaynak'ta mevcut
        sources: ['altinkaynak'],
        description: 'İngiliz Sterlini / Türk Lirası',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        symbol: 'HAS/TRY',
        code: 'HAS',
        name: 'Has Altın',
        type: 'gold',
        baseCurrency: 'HAS',
        quoteCurrency: 'TRY',
        isActive: true,
        priority: 1,
        hasSource: true, // AltinKaynak Gold API'de HH olarak mevcut
        sources: ['altinkaynak'],
        sourceMapping: { altinkaynak: 'HH' }, // AltinKaynak'ta HH kodu kullanılıyor
        description: 'Has Altın / Türk Lirası',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        symbol: 'SAR/TRY',
        code: 'SAR',
        name: 'Suudi Riyal',
        type: 'forex',
        baseCurrency: 'SAR',
        quoteCurrency: 'TRY',
        isActive: true,
        priority: 2,
        hasSource: false, // Henüz kaynak yok
        sources: [],
        description: 'Suudi Riyal / Türk Lirası',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        symbol: 'RUB/TRY',
        code: 'RUB',
        name: 'Rus Rublesi',
        type: 'forex',
        baseCurrency: 'RUB',
        quoteCurrency: 'TRY',
        isActive: true,
        priority: 2,
        hasSource: false, // Henüz kaynak yok
        sources: [],
        description: 'Rus Rublesi / Türk Lirası',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        symbol: 'CNY/TRY',
        code: 'CNY',
        name: 'Çin Yuanı',
        type: 'forex',
        baseCurrency: 'CNY',
        quoteCurrency: 'TRY',
        isActive: true,
        priority: 2,
        hasSource: false, // Henüz kaynak yok
        sources: [],
        description: 'Çin Yuanı / Türk Lirası',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        symbol: 'AED/TRY',
        code: 'AED',
        name: 'BAE Dirhemi',
        type: 'forex',
        baseCurrency: 'AED',
        quoteCurrency: 'TRY',
        isActive: true,
        priority: 2,
        hasSource: false, // Henüz kaynak yok
        sources: [],
        description: 'BAE Dirhemi / Türk Lirası',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    console.log('\n📝 System currencies oluşturuluyor...');
    
    const result = await systemCurrenciesCollection.insertMany(systemCurrencies);
    console.log(`✓ ${result.insertedCount} system currency oluşturuldu`);

    // Oluşturulan currency listesini göster
    const allCurrencies = await systemCurrenciesCollection.find({}).sort({ priority: 1, symbol: 1 }).toArray();
    console.log(`\n📋 System Currency Listesi (${allCurrencies.length} adet):`);
    
    allCurrencies.forEach(currency => {
      const status = currency.isActive ? '✓' : '✗';
      const sourceStatus = currency.hasSource ? '🟢' : '🔴';
      const sourceList = currency.sources.length > 0 ? currency.sources.join(', ') : 'Yok';
      console.log(`  ${status} ${sourceStatus} ${currency.symbol} - ${currency.name} (öncelik: ${currency.priority}, kaynak: ${sourceList})`);
    });

    // Öncelik 1 (mevcut kaynaklar) ve öncelik 2 (eksik kaynaklar) ayırımı
    const priority1 = allCurrencies.filter(c => c.priority === 1);
    const priority2 = allCurrencies.filter(c => c.priority === 2);

    console.log(`\n🎯 Öncelik 1 (Mevcut kaynaklardan alınabilir): ${priority1.length} adet`);
    priority1.forEach(c => {
      const mapping = c.sourceMapping?.altinkaynak ? ` (${c.sourceMapping.altinkaynak})` : '';
      console.log(`  • ${c.symbol} - ${c.name}${mapping}`);
    });

    console.log(`\n⏳ Öncelik 2 (Yeni kaynak gerekli): ${priority2.length} adet`);
    priority2.forEach(c => console.log(`  • ${c.symbol} - ${c.name}`));

    console.log('\n✅ System currencies tablosu hazır!');
    console.log('🔗 Artık price mappingler bu listeye göre otomatik yapılabilir.');

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
createSystemCurrencies();