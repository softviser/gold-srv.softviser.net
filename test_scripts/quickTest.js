require('dotenv').config();
const { MongoClient } = require('mongodb');

async function quickTest() {
  let mongoClient;
  
  try {
    console.log('🚀 Hızlı test başlatılıyor...');
    
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

    // Mevcut verileri kontrol et
    const systemCurrencies = await db.collection('system_currencies').find({}).toArray();
    const currentPrices = await db.collection('current_prices').find({}).toArray();
    const priceMappings = await db.collection('price_mappings').find({}).toArray();
    const sources = await db.collection('sources').find({}).toArray();

    console.log('\n📊 Mevcut veriler:');
    console.log(`  • System currencies: ${systemCurrencies.length} adet`);
    console.log(`  • Current prices: ${currentPrices.length} adet`);
    console.log(`  • Price mappings: ${priceMappings.length} adet`);
    console.log(`  • Sources: ${sources.length} adet`);

    if (systemCurrencies.length > 0) {
      console.log('\n💰 System currencies:');
      systemCurrencies.forEach(curr => {
        const statusIcon = curr.hasSource ? '🟢' : '🔴';
        console.log(`  ${statusIcon} ${curr.symbol} - ${curr.name} (${curr.sources?.join(', ') || 'Kaynak yok'})`);
      });
    }

    if (currentPrices.length > 0) {
      console.log('\n📈 Current prices (son 5):');
      currentPrices.slice(-5).forEach(price => {
        console.log(`  • ${price.symbol}: ₺${price.buyPrice} / ₺${price.sellPrice} (${price.sourceData?.originalCode})`);
      });
    }

    console.log('\n🌐 Yönetim paneli URL\'leri:');
    console.log('  • Ana Sayfa: http://localhost:6701/admin');
    console.log('  • Güncel Fiyatlar: http://localhost:6701/admin/prices');
    console.log('  • Sistem Currency\'leri: http://localhost:6701/admin/currencies');
    console.log('  • Veri Kaynakları: http://localhost:6701/admin/sources');
    console.log('  • Fiyat Eşleştirmeleri: http://localhost:6701/admin/mappings');

    console.log('\n✅ Test tamamlandı! Server\'ı başlatabilirsiniz.');

  } catch (error) {
    console.error('❌ Test hatası:', error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
      console.log('\nMongoDB bağlantısı kapatıldı');
    }
  }
}

// Test'i çalıştır
quickTest();