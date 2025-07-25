require('dotenv').config();
const { MongoClient } = require('mongodb');

async function updateSystemCurrenciesWithHakan() {
  let mongoClient;
  
  try {
    console.log('🚀 System currencies Hakan Altın ile güncelleniyor...');
    
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

    // Güncellenecek currency'ler - Hakan Altın'dan gelenler
    const currenciesToUpdate = [
      'USD/TRY',
      'GBP/TRY', 
      'SAR/TRY',
      'AED/TRY',
      'CNY/TRY',
      'HAS/TRY'
    ];

    let updateCount = 0;

    for (const symbol of currenciesToUpdate) {
      const currency = await db.collection('system_currencies').findOne({ symbol });
      
      if (currency) {
        // Mevcut sources array'ine hakangold ekle
        const updatedSources = currency.sources || [];
        if (!updatedSources.includes('hakangold')) {
          updatedSources.push('hakangold');
        }

        // Source mapping'e hakangold için mapping ekle
        const updatedSourceMapping = currency.sourceMapping || {};
        
        // Hakan Altın mapping'lerini ekle
        const hakanMappings = {
          'USD/TRY': '113',
          'GBP/TRY': '115', 
          'SAR/TRY': '121',
          'AED/TRY': '235',
          'CNY/TRY': '628',
          'HAS/TRY': '126'
        };

        if (hakanMappings[symbol]) {
          updatedSourceMapping.hakangold = hakanMappings[symbol];
        }

        // Currency'yi güncelle
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

        console.log(`✓ ${symbol} güncellendi - Kaynak: hakangold (${hakanMappings[symbol]})`);
        updateCount++;
      } else {
        console.log(`⚠️ ${symbol} system currencies'de bulunamadı`);
      }
    }

    // Özet bilgileri
    const totalCurrencies = await db.collection('system_currencies').countDocuments();
    const activeCurrencies = await db.collection('system_currencies').countDocuments({ hasSource: true });

    console.log(`\\n📊 Güncelleme özeti:`);
    console.log(`  • Güncellenen currency: ${updateCount} adet`);
    console.log(`  • Toplam currency: ${totalCurrencies} adet`);
    console.log(`  • Kaynaklı currency: ${activeCurrencies} adet`);

    // Güncel currency listesi
    const currencies = await db.collection('system_currencies').find({}).sort({ symbol: 1 }).toArray();
    
    console.log(`\\n💰 Güncel System Currencies:`);
    currencies.forEach(curr => {
      const statusIcon = curr.hasSource ? '🟢' : '🔴';
      const sources = curr.sources?.join(', ') || 'Kaynak yok';
      console.log(`  ${statusIcon} ${curr.symbol} - ${curr.name} (${sources})`);
    });

    console.log('\\n✅ System currencies başarıyla güncellendi!');

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
updateSystemCurrenciesWithHakan();