require('dotenv').config();
const { MongoClient } = require('mongodb');
const AltinKaynakService = require('../services/AltinKaynakService');

async function testAltinKaynak() {
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

    // AltinKaynak servisini başlat
    console.log('\nAltinKaynak servisi başlatılıyor...');
    const altinKaynakService = new AltinKaynakService(db);
    
    // Servisi başlat
    await altinKaynakService.initialize();
    console.log('✓ AltinKaynak servisi başlatıldı');

    // Servis durumunu kontrol et
    const status = altinKaynakService.getStatus();
    console.log('\n📊 Servis Durumu:', status);

    // Test güncelleme yap
    console.log('\n🔄 Test güncellemesi yapılıyor...');
    const result = await altinKaynakService.forceUpdate();
    console.log('✓ Güncelleme tamamlandı:', result);

    // Current prices'ı kontrol et
    console.log('\n💰 Güncel fiyatlar kontrol ediliyor...');
    const CurrentPrices = require('../models/CurrentPrices');
    const currentPricesModel = new CurrentPrices(db);
    
    const prices = await currentPricesModel.getCurrentPrices({ limit: 10 });
    console.log(`✓ ${prices.length} güncel fiyat bulundu`);
    
    if (prices.length > 0) {
      console.log('\n📈 Örnek fiyatlar:');
      prices.slice(0, 5).forEach(price => {
        console.log(`  ${price.symbol}: Alış=${price.buyPrice} Satış=${price.sellPrice} (${price.sourceData?.originalCode})`);
      });
    }

    // İstatistikleri göster
    const stats = await currentPricesModel.getStats();
    console.log('\n📊 Fiyat İstatistikleri:', stats);

    console.log('\n✅ Test başarıyla tamamlandı!');

  } catch (error) {
    console.error('❌ Test hatası:', error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
      console.log('MongoDB bağlantısı kapatıldı');
    }
  }
}

// Test'i çalıştır
testAltinKaynak();