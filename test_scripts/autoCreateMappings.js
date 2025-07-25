require('dotenv').config();
const { MongoClient } = require('mongodb');

async function autoCreateMappings() {
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

    // System currencies'leri al
    const systemCurrencies = await db.collection('system_currencies')
      .find({ hasSource: true, isActive: true })
      .toArray();
    
    console.log(`📋 ${systemCurrencies.length} currency için kaynak mevcut`);

    // Source'ları al
    const Source = require('../models/Source');
    const sourceModel = new Source(db);
    
    const sources = await sourceModel.getActiveSources();
    console.log(`📊 ${sources.length} aktif kaynak bulundu`);

    console.log('\n🔄 Otomatik mapping oluşturuluyor...');

    let createdCount = 0;
    let skippedCount = 0;

    for (const currency of systemCurrencies) {
      console.log(`\n📝 ${currency.symbol} için mapping'ler oluşturuluyor...`);
      
      for (const sourceName of currency.sources) {
        const source = sources.find(s => s.name === sourceName);
        if (!source) {
          console.log(`  ⚠️  Kaynak bulunamadı: ${sourceName}`);
          continue;
        }

        // Source field'ını belirle
        let sourceField;
        if (currency.sourceMapping && currency.sourceMapping[sourceName]) {
          // Özel mapping varsa onu kullan (örn: HAS -> HH)
          sourceField = currency.sourceMapping[sourceName];
        } else {
          // Normal kod kullan (örn: USD, EUR, GBP)
          sourceField = currency.code;
        }

        // Mevcut mapping'i kontrol et
        const existingMapping = await db.collection('price_mappings').findOne({
          sourceId: source._id,
          sourceField: sourceField
        });

        if (existingMapping) {
          console.log(`    ⚠️  ${sourceField} -> ${currency.symbol} zaten mevcut, atlanıyor`);
          skippedCount++;
          continue;
        }

        // Yeni mapping oluştur
        const mappingData = {
          sourceId: source._id,
          sourceField: sourceField,
          sourceDescription: currency.name,
          targetSymbol: currency.symbol,
          targetType: currency.type === 'gold' ? 'forex' : currency.type, // Tüm değerler forex olarak
          priority: currency.priority,
          multiplier: 1,
          offset: 0,
          formula: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: {
            autoCreated: true,
            systemCurrencyId: currency._id
          }
        };

        try {
          await db.collection('price_mappings').insertOne(mappingData);
          console.log(`    ✓ ${sourceField} -> ${currency.symbol} oluşturuldu (${source.name})`);
          createdCount++;
        } catch (error) {
          console.log(`    ❌ ${sourceField} -> ${currency.symbol} oluşturulamadı: ${error.message}`);
        }
      }
    }

    console.log(`\n📊 Özet: ${createdCount} yeni mapping oluşturuldu, ${skippedCount} mevcut mapping atlandı`);

    // Oluşturulan mapping'leri göster
    const allMappings = await db.collection('price_mappings')
      .find({})
      .sort({ targetSymbol: 1 })
      .toArray();

    console.log(`\n📋 Toplam ${allMappings.length} price mapping:`);
    for (const mapping of allMappings) {
      const source = sources.find(s => s._id.equals(mapping.sourceId));
      const sourceName = source ? source.name : 'Unknown';
      console.log(`  • ${mapping.sourceField} -> ${mapping.targetSymbol} (${sourceName})`);
    }

    // Eksik currency'leri göster
    const missingCurrencies = await db.collection('system_currencies')
      .find({ hasSource: false, isActive: true })
      .toArray();

    if (missingCurrencies.length > 0) {
      console.log(`\n⏳ Kaynak bekleyen currency'ler (${missingCurrencies.length} adet):`);
      missingCurrencies.forEach(currency => {
        console.log(`  • ${currency.symbol} - ${currency.name}`);
      });
    }

    console.log('\n✅ Otomatik mapping oluşturma tamamlandı!');

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
autoCreateMappings();