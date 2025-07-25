require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

async function createHaremAltinWebMappings() {
  let mongoClient;
  
  try {
    console.log('🚀 Harem Altın Web eşleştirmeleri oluşturuluyor...');
    
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

    // Harem Altın Web kaynağını kontrol et
    const existingSource = await db.collection('sources').findOne({ name: 'haremgoldweb' });
    let source;

    if (!existingSource) {
      // Kaynak yoksa oluştur
      const sourceInfo = {
        name: 'haremgoldweb',
        displayName: 'Harem Altın Web',
        url: 'https://haremaltin.com',
        type: 'api',
        category: 'gold_dealer',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const result = await db.collection('sources').insertOne(sourceInfo);
      source = { _id: result.insertedId, ...sourceInfo };
      console.log('✓ Harem Altın Web kaynağı oluşturuldu');
    } else {
      source = existingSource;
      console.log('✓ Harem Altın Web kaynağı mevcut');
    }

    // Harem Altın Web eşleştirmelerini oluştur
    const mappings = [
      {
        sourceId: source._id,
        sourceField: 'ALTIN',
        sourceDescription: 'Has Altın',
        targetSymbol: 'HAS/TRY',
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
        sourceField: 'USDTRY',
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
        sourceField: 'EURTRY',
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
        sourceField: 'GBPTRY',
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
        sourceField: 'SARTRY',
        sourceDescription: 'Suudi Riyal',
        targetSymbol: 'SAR/TRY',
        targetType: 'forex',
        priority: 1,
        multiplier: 1,
        offset: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    console.log(`\\n📝 ${mappings.length} eşleştirme oluşturuluyor...`);

    // Mevcut eşleştirmeleri sil
    const deleteResult = await db.collection('price_mappings').deleteMany({ 
      sourceId: source._id 
    });
    console.log(`✓ ${deleteResult.deletedCount} eski eşleştirme silindi`);

    // Yeni eşleştirmeleri ekle
    const insertResult = await db.collection('price_mappings').insertMany(mappings);
    console.log(`✓ ${insertResult.insertedCount} yeni eşleştirme oluşturuldu`);

    // Mevcut verileri kontrol et
    const allMappings = await db.collection('price_mappings').find({ 
      sourceId: source._id 
    }).toArray();

    console.log('\\n📊 Oluşturulan eşleştirmeler:');
    allMappings.forEach(mapping => {
      console.log(`  • ${mapping.sourceField} (${mapping.sourceDescription}) → ${mapping.targetSymbol}`);
    });

    // System currencies'e Harem Altın Web'i ekle
    const currenciesToUpdate = ['USD/TRY', 'EUR/TRY', 'GBP/TRY', 'HAS/TRY', 'SAR/TRY'];
    let updateCount = 0;

    for (const symbol of currenciesToUpdate) {
      const currency = await db.collection('system_currencies').findOne({ symbol });
      
      if (currency) {
        const updatedSources = currency.sources || [];
        if (!updatedSources.includes('haremgoldweb')) {
          updatedSources.push('haremgoldweb');
        }

        const updatedSourceMapping = currency.sourceMapping || {};
        const haremWebMappings = {
          'USD/TRY': 'USDTRY',
          'EUR/TRY': 'EURTRY', 
          'GBP/TRY': 'GBPTRY',
          'SAR/TRY': 'SARTRY',
          'HAS/TRY': 'ALTIN'
        };

        if (haremWebMappings[symbol]) {
          updatedSourceMapping.haremgoldweb = haremWebMappings[symbol];
        }

        await db.collection('system_currencies').updateOne(
          { symbol },
          {
            $set: {
              hasSource: true,
              sources: updatedSources,
              sourceMapping: updatedSourceMapping,
              updatedAt: new Date()
            }
          }
        );

        console.log(`✓ ${symbol} güncellendi - Kaynak: haremgoldweb (${haremWebMappings[symbol]})`);
        updateCount++;
      }
    }

    console.log(`\\n✅ Harem Altın Web eşleştirmeleri ve ${updateCount} currency güncellemesi tamamlandı!`);
    console.log('\\n🔗 Harem Altın Web API:');
    console.log('  • Altın: https://canlipiyasalar.haremaltin.com/tmp/altin.json?dil_kodu=tr');
    console.log('  • Döviz: https://canlipiyasalar.haremaltin.com/tmp/doviz.json?dil_kodu=tr');
    console.log('📍 Takip edilen kodlar: ALTIN, USDTRY, EURTRY, GBPTRY, SARTRY');

  } catch (error) {
    console.error('❌ Hata:', error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
      console.log('\\nMongoDB bağlantısı kapatıldı');
    }
  }
}

// Script'i çalıştır
createHaremAltinWebMappings();