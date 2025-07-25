require('dotenv').config();
const { MongoClient } = require('mongodb');

async function updateAltinKaynakMappings() {
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

    // Yeni eşleştirmeler (API'den gelen gerçek kod değerleri ile)
    const mappings = [
      // Currency mappings (API'den gelen gerçek kodlar)
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
      {
        sourceId: source._id,
        sourceField: 'CHF',
        sourceDescription: 'İsviçre Frangı',
        targetSymbol: 'CHF/TRY',
        targetType: 'forex',
        priority: 2,
        multiplier: 1,
        offset: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      // Gold mappings (API'den gelen gerçek kodlar)
      {
        sourceId: source._id,
        sourceField: 'HH',
        sourceDescription: 'Has Altın (0,9999)',
        targetSymbol: 'HAS/TRY',
        targetType: 'gold',
        priority: 1,
        multiplier: 1,
        offset: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        sourceId: source._id,
        sourceField: 'CH',
        sourceDescription: 'Külçe Altın (0,995)',
        targetSymbol: 'QUARTER_GOLD/TRY',
        targetType: 'gold',
        priority: 2,
        multiplier: 1,
        offset: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        sourceId: source._id,
        sourceField: 'GA',
        sourceDescription: 'Gram Altın (24 Ayar)',
        targetSymbol: 'HALF_GOLD/TRY',
        targetType: 'gold',
        priority: 2,
        multiplier: 1,
        offset: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    console.log('\n📝 Yeni eşleştirmeler oluşturuluyor...');
    
    const result = await db.collection('price_mappings').insertMany(mappings);
    console.log(`✓ ${result.insertedCount} yeni eşleştirme oluşturuldu`);

    // Oluşturulan eşleştirmeleri listele
    const allMappings = await db.collection('price_mappings')
      .find({ sourceId: source._id })
      .sort({ targetType: 1, priority: 1 })
      .toArray();
      
    console.log(`\n📋 AltinKaynak için toplam ${allMappings.length} eşleştirme:`);
    allMappings.forEach(mapping => {
      console.log(`  • ${mapping.sourceField} -> ${mapping.targetSymbol} (${mapping.targetType}, öncelik: ${mapping.priority})`);
    });

    console.log('\n✅ AltinKaynak eşleştirmeleri güncellendi!');

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
updateAltinKaynakMappings();