require('dotenv').config();
const { MongoClient } = require('mongodb');

async function updateCorrectMappings() {
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

    // Source ve model'leri başlat
    const Source = require('../models/Source');
    const sourceModel = new Source(db);

    // AltinKaynak source'unu bul
    const source = await sourceModel.findByName('altinkaynak');
    if (!source) {
      console.error('❌ AltinKaynak kaynağı bulunamadı');
      return;
    }

    console.log('✓ AltinKaynak kaynağı bulundu');

    // Mevcut eşleştirmeleri sil
    await db.collection('price_mappings').deleteMany({ sourceId: source._id });
    console.log('🗑️ Mevcut eşleştirmeler silindi');

    // Doğru eşleştirmeler - Sadece istenen currency'ler
    const mappings = [
      // Currency mappings (Forex)
      {
        sourceId: source._id,
        sourceField: 'USD',
        sourceDescription: 'Amerikan Doları',
        targetSymbol: 'USD/TRY',
        targetType: 'forex',
        priority: 1,
        multiplier: 1,
        offset: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        sourceId: source._id,
        sourceField: 'EUR',
        sourceDescription: 'Avrupa Para Birimi',
        targetSymbol: 'EUR/TRY',
        targetType: 'forex',
        priority: 1,
        multiplier: 1,
        offset: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        sourceId: source._id,
        sourceField: 'GBP',
        sourceDescription: 'İngiliz Sterlini',
        targetSymbol: 'GBP/TRY',
        targetType: 'forex',
        priority: 1,
        multiplier: 1,
        offset: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      // HAS Altın - Gold API'den geliyor
      {
        sourceId: source._id,
        sourceField: 'HH',
        sourceDescription: 'Has Altın (0,9999)',
        targetSymbol: 'HAS/TRY',
        targetType: 'forex', // Currency değeri olarak tanımlandı
        priority: 1,
        multiplier: 1,
        offset: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      // SAR/TRY, RUB/TRY, CNY/TRY, AED/TRY şimdilik AltinKaynak API'sinde yok
      // İleride başka kaynaklardan eklenebilir
    ];

    console.log('\n📝 Doğru eşleştirmeler oluşturuluyor...');
    
    const result = await db.collection('price_mappings').insertMany(mappings);
    console.log(`✓ ${result.insertedCount} yeni eşleştirme oluşturuldu`);

    // Oluşturulan eşleştirmeleri listele
    const allMappings = await db.collection('price_mappings')
      .find({ sourceId: source._id })
      .sort({ targetSymbol: 1 })
      .toArray();
      
    console.log(`\n📋 AltinKaynak için toplam ${allMappings.length} eşleştirme:`);
    allMappings.forEach(mapping => {
      console.log(`  • ${mapping.sourceField} -> ${mapping.targetSymbol} (${mapping.targetType})`);
    });

    console.log('\n📌 Eksik currency\'ler (şimdilik AltinKaynak API\'sinde yok):');
    console.log('  • SAR/TRY - Suudi Riyal');
    console.log('  • RUB/TRY - Rus Rublesi');
    console.log('  • CNY/TRY - Çin Yuanı');
    console.log('  • AED/TRY - BAE Dirhemi');
    console.log('  Bu currency\'ler için başka veri kaynakları eklenebilir.');

    console.log('\n✅ AltinKaynak eşleştirmeleri doğru şekilde güncellendi!');

  } catch (error) {
    console.error('❌ Hata:', error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
      console.log('MongoDB bağlantısı kapatıldı');
    }
  }
}

// Script'i çalıştır
updateCorrectMappings();