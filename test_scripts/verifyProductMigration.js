require('dotenv').config({ path: '../.env' });
const { MongoClient } = require('mongodb');

async function verifyProductMigration() {
  let mongoClient;
  
  try {
    console.log('🔍 Ürün migrasyonu doğrulaması başlatılıyor...\n');
    
    // MongoDB'ye bağlan
    mongoClient = new MongoClient(process.env.MONGODB_URI, {
      auth: {
        username: process.env.MONGODB_USERNAME,
        password: process.env.MONGODB_PASSWORD
      }
    });
    
    await mongoClient.connect();
    const db = mongoClient.db();
    
    console.log('✅ MongoDB bağlantısı kuruldu\n');
    
    const collection = db.collection('jmon_user_products');
    
    // Yeni format ürünleri say
    const newFormatCount = await collection.countDocuments({
      buyingFormula: { $exists: true },
      sellingFormula: { $exists: true }
    });
    
    // Eski format ürünleri say
    const oldFormatCount = await collection.countDocuments({
      formula: { $exists: true }
    });
    
    // Toplam ürün sayısı
    const totalCount = await collection.countDocuments({});
    
    console.log('📊 Migrasyon Durumu:');
    console.log(`   📦 Toplam ürün sayısı: ${totalCount}`);
    console.log(`   ✅ Yeni format (buyingFormula/sellingFormula): ${newFormatCount}`);
    console.log(`   ⚠️ Eski format (formula): ${oldFormatCount}`);
    
    if (oldFormatCount > 0) {
      console.log('\n⚠️ Hala eski formatta ürünler var:');
      const oldProducts = await collection.find({
        formula: { $exists: true }
      }).toArray();
      
      oldProducts.forEach(product => {
        console.log(`   - ${product.name} (${product.productCode || 'Kod yok'}): ${product.formula}`);
      });
    } else {
      console.log('\n🎉 Tüm ürünler başarıyla yeni formata dönüştürüldü!');
    }
    
    // Yeni formattaki ürünlerin detaylarını göster
    if (newFormatCount > 0) {
      console.log('\n📝 Yeni format ürün örnekleri:');
      const newProducts = await collection.find({
        buyingFormula: { $exists: true },
        sellingFormula: { $exists: true }
      }).limit(5).toArray();
      
      newProducts.forEach(product => {
        console.log(`\n   🏷️ ${product.name} (${product.productCode || 'Kod yok'})`);
        console.log(`      📥 Alış: ${product.buyingFormula}`);
        console.log(`      📤 Satış: ${product.sellingFormula}`);
        console.log(`      🎯 Ana Sembol: ${product.baseSymbol}`);
        
        if (product.lastCalculatedValues) {
          console.log(`      💰 Son Hesaplanan: Alış ${product.lastCalculatedValues.buying}, Satış ${product.lastCalculatedValues.selling}`);
        }
      });
    }
    
    console.log('\n✅ Doğrulama tamamlandı');
    
  } catch (error) {
    console.error('❌ Hata:', error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
      console.log('\n🔐 MongoDB bağlantısı kapatıldı');
    }
  }
}

// Script'i çalıştır
if (require.main === module) {
  verifyProductMigration()
    .then(() => {
      console.log('\n🎉 Doğrulama tamamlandı!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Doğrulama hatası:', error);
      process.exit(1);
    });
}

module.exports = verifyProductMigration;