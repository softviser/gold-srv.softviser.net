require('dotenv').config();
const { MongoClient } = require('mongodb');

async function cleanAndTestCurrentPrices() {
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

    // Current prices tablosunu temizle
    const result = await db.collection('current_prices').deleteMany({});
    console.log(`🗑️ ${result.deletedCount} mevcut fiyat kaydı silindi`);

    // AltinKaynak servisini test et
    const AltinKaynakService = require('../services/AltinKaynakService');
    const altinKaynakService = new AltinKaynakService(db);
    
    await altinKaynakService.initialize();
    console.log('✓ AltinKaynak servisi başlatıldı');

    // Zorla güncelleme yap
    console.log('\n🔄 Temiz güncelleme yapılıyor...');
    const updateResult = await altinKaynakService.forceUpdate();
    console.log('✓ Güncelleme tamamlandı:', updateResult);

    // Current prices'ı kontrol et
    console.log('\n💰 Güncel fiyatlar kontrol ediliyor...');
    const CurrentPrices = require('../models/CurrentPrices');
    const currentPricesModel = new CurrentPrices(db);
    
    const prices = await currentPricesModel.getCurrentPrices({ limit: 20 });
    console.log(`✓ ${prices.length} güncel fiyat bulundu`);
    
    if (prices.length > 0) {
      console.log('\n📈 Tüm fiyatlar:');
      prices.forEach(price => {
        console.log(`  ${price.symbol}: Alış=${price.buyPrice} Satış=${price.sellPrice} (${price.sourceData?.originalCode})`);
      });
    }

    // İstatistikleri göster
    const stats = await currentPricesModel.getStats();
    console.log('\n📊 Fiyat İstatistikleri:', stats);

    // Beklenen currency'leri kontrol et
    const expectedCurrencies = ['USD/TRY', 'EUR/TRY', 'GBP/TRY', 'HAS/TRY'];
    console.log('\n✅ Beklenen currency kontrolleri:');
    
    for (const currency of expectedCurrencies) {
      const found = prices.find(p => p.symbol === currency);
      if (found) {
        console.log(`  ✓ ${currency}: Alış=${found.buyPrice}, Satış=${found.sellPrice}`);
      } else {
        console.log(`  ❌ ${currency}: Bulunamadı`);
      }
    }

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
cleanAndTestCurrentPrices();