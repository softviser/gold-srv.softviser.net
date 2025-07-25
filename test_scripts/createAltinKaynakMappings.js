require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

async function createAltinKaynakMappings() {
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
    const PriceMapping = require('../models/PriceMapping');
    
    const sourceModel = new Source(db);
    const mappingModel = new PriceMapping(db);

    // AltinKaynak source'unu bul veya oluştur
    let source = await sourceModel.findByName('altinkaynak');
    
    if (!source) {
      console.log('AltinKaynak kaynağı oluşturuluyor...');
      source = await sourceModel.create({
        name: 'altinkaynak',
        displayName: 'Altın Kaynak',
        type: 'api',
        category: 'gold_dealer',
        url: 'https://altinkaynak.com',
        apiUrl: 'https://rest.altinkaynak.com',
        dataFormat: 'json',
        updateInterval: 60,
        currency: 'TRY',
        priority: 2,
        isActive: true,
        metadata: {
          description: 'Altın Kaynak resmi API servisi'
        }
      });
      console.log('✓ AltinKaynak kaynağı oluşturuldu');
    } else {
      console.log('✓ AltinKaynak kaynağı bulundu');
    }

    // Örnek eşleştirmeler (AltinKaynak API'sinden gelen veriler için)
    const mappings = [
      // Currency mappings
      {
        sourceId: source._id,
        sourceField: 'USD',
        sourceDescription: 'US Dollar',
        targetSymbol: 'USD/TRY',
        targetType: 'forex',
        priority: 1,
        multiplier: 1,
        offset: 0
      },
      {
        sourceId: source._id,
        sourceField: 'EUR',
        sourceDescription: 'Euro',
        targetSymbol: 'EUR/TRY',
        targetType: 'forex',
        priority: 1,
        multiplier: 1,
        offset: 0
      },
      {
        sourceId: source._id,
        sourceField: 'GBP',
        sourceDescription: 'British Pound',
        targetSymbol: 'GBP/TRY',
        targetType: 'forex',
        priority: 1,
        multiplier: 1,
        offset: 0
      },
      // Gold mappings
      {
        sourceId: source._id,
        sourceField: 'HAS',
        sourceDescription: 'Gram Altın',
        targetSymbol: 'HAS/TRY',
        targetType: 'gold',
        priority: 1,
        multiplier: 1,
        offset: 0
      },
      {
        sourceId: source._id,
        sourceField: 'QUARTER_GOLD',
        sourceDescription: 'Çeyrek Altın',
        targetSymbol: 'QUARTER_GOLD/TRY',
        targetType: 'gold',
        priority: 2,
        multiplier: 1,
        offset: 0
      },
      {
        sourceId: source._id,
        sourceField: 'HALF_GOLD',
        sourceDescription: 'Yarım Altın',
        targetSymbol: 'HALF_GOLD/TRY',
        targetType: 'gold',
        priority: 2,
        multiplier: 1,
        offset: 0
      },
      {
        sourceId: source._id,
        sourceField: 'FULL_GOLD',
        sourceDescription: 'Tam Altın',
        targetSymbol: 'FULL_GOLD/TRY',
        targetType: 'gold',
        priority: 2,
        multiplier: 1,
        offset: 0
      }
    ];

    console.log('\n📝 Eşleştirmeler oluşturuluyor...');
    
    let createdCount = 0;
    let skippedCount = 0;

    for (const mappingData of mappings) {
      try {
        // Önce var mı kontrol et
        const existing = await db.collection('price_mappings').findOne({
          sourceId: mappingData.sourceId,
          sourceField: mappingData.sourceField
        });

        if (existing) {
          console.log(`  ⚠️  ${mappingData.sourceField} -> ${mappingData.targetSymbol} zaten mevcut, atlanıyor`);
          skippedCount++;
          continue;
        }

        await mappingModel.create(mappingData);
        console.log(`  ✓ ${mappingData.sourceField} -> ${mappingData.targetSymbol} oluşturuldu`);
        createdCount++;
      } catch (error) {
        console.error(`  ❌ ${mappingData.sourceField} eşleştirmesi oluşturulamadı:`, error.message);
      }
    }

    console.log(`\n📊 Özet: ${createdCount} yeni eşleştirme oluşturuldu, ${skippedCount} mevcut eşleştirme atlandı`);

    // Oluşturulan eşleştirmeleri listele
    const allMappings = await mappingModel.getBySourceId(source._id);
    console.log(`\n📋 AltinKaynak için toplam ${allMappings.length} eşleştirme:`);
    allMappings.forEach(mapping => {
      console.log(`  • ${mapping.sourceField} -> ${mapping.targetSymbol} (${mapping.targetType}, öncelik: ${mapping.priority})`);
    });

    console.log('\n✅ AltinKaynak eşleştirmeleri hazır!');

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
createAltinKaynakMappings();