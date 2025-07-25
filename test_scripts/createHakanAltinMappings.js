require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

async function createHakanAltinMappings() {
  let mongoClient;
  
  try {
    console.log('🚀 Hakan Altın eşleştirmeleri oluşturuluyor...');
    
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

    // Hakan Altın kaynağını oluştur veya kontrol et
    const sourceInfo = {
      name: 'hakangold',
      displayName: 'Hakan Altın',
      url: 'https://hakanaltin.com',
      type: 'websocket',
      category: 'gold_dealer',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const existingSource = await db.collection('sources').findOne({ name: 'hakangold' });
    let source;

    if (!existingSource) {
      const result = await db.collection('sources').insertOne(sourceInfo);
      source = { _id: result.insertedId, ...sourceInfo };
      console.log('✓ Hakan Altın kaynağı oluşturuldu');
    } else {
      source = existingSource;
      console.log('✓ Hakan Altın kaynağı mevcut');
    }

    // Hakan Altın eşleştirmelerini oluştur
    const mappings = [
      {
        sourceId: source._id,
        sourceField: '126',
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
        sourceField: '113',
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
        sourceField: '115',
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
        sourceField: '121',
        sourceDescription: 'Suudi Riyal',
        targetSymbol: 'SAR/TRY',
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
        sourceField: '235',
        sourceDescription: 'BAE Dirhemi',
        targetSymbol: 'AED/TRY',
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
        sourceField: '628',
        sourceDescription: 'Çin Yuanı',
        targetSymbol: 'CNY/TRY',
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

    console.log('\\n✅ Hakan Altın eşleştirmeleri başarıyla oluşturuldu!');
    console.log('\\n🔗 Hakan Altın WebSocket: wss://websocket.hakanaltin.com/');
    console.log('📍 Takip edilen kodlar: 126, 113, 115, 121, 235, 628');

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
createHakanAltinMappings();