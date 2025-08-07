// Script to update all products with rounding method 'none'
require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGODB_URI;
const mongoOptions = {
  auth: {
    username: process.env.MONGODB_USERNAME,
    password: process.env.MONGODB_PASSWORD
  }
};

async function updateProductRounding() {
  let client;
  
  try {
    // MongoDB'ye bağlan
    client = new MongoClient(mongoUri, mongoOptions);
    await client.connect();
    console.log('MongoDB bağlantısı başarılı');
    
    const db = client.db();
    const collection = db.collection('jmon_user_products');
    
    // Önce mevcut ürünlerin sayısını al
    const totalProducts = await collection.countDocuments({});
    console.log(`Toplam ürün sayısı: ${totalProducts}`);
    
    // Yuvarlama ayarlarını güncelle
    const roundingConfig = {
      method: 'none',
      precision: 0,
      decimalPlaces: 3
    };
    
    // Tüm ürünleri güncelle
    const updateResult = await collection.updateMany(
      {}, // Tüm ürünler
      {
        $set: {
          buyingRoundingConfig: roundingConfig,
          sellingRoundingConfig: roundingConfig,
          roundingConfig: roundingConfig, // Geriye uyumluluk için
          updatedAt: new Date()
        }
      }
    );
    
    console.log(`\nGüncelleme tamamlandı:`);
    console.log(`- Eşleşen kayıt: ${updateResult.matchedCount}`);
    console.log(`- Güncellenen kayıt: ${updateResult.modifiedCount}`);
    
    // Güncellenen bir örnek ürünü göster
    const sampleProduct = await collection.findOne({});
    if (sampleProduct) {
      console.log('\nÖrnek güncellenen ürün:');
      console.log(`- Ürün adı: ${sampleProduct.name}`);
      console.log(`- Alış yuvarlama: ${JSON.stringify(sampleProduct.buyingRoundingConfig)}`);
      console.log(`- Satış yuvarlama: ${JSON.stringify(sampleProduct.sellingRoundingConfig)}`);
    }
    
    // İstatistikleri göster
    const stats = await collection.aggregate([
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          withBuyingRounding: {
            $sum: {
              $cond: [{ $ifNull: ['$buyingRoundingConfig', false] }, 1, 0]
            }
          },
          withSellingRounding: {
            $sum: {
              $cond: [{ $ifNull: ['$sellingRoundingConfig', false] }, 1, 0]
            }
          },
          noneMethodCount: {
            $sum: {
              $cond: [
                { $eq: ['$buyingRoundingConfig.method', 'none'] },
                1,
                0
              ]
            }
          }
        }
      }
    ]).toArray();
    
    if (stats.length > 0) {
      console.log('\nGüncel istatistikler:');
      console.log(`- Toplam ürün: ${stats[0].totalProducts}`);
      console.log(`- Alış yuvarlama tanımlı: ${stats[0].withBuyingRounding}`);
      console.log(`- Satış yuvarlama tanımlı: ${stats[0].withSellingRounding}`);
      console.log(`- "none" metodlu ürün sayısı: ${stats[0].noneMethodCount}`);
    }
    
    console.log('\n✅ Tüm ürünler başarıyla güncellendi!');
    
  } catch (error) {
    console.error('Hata oluştu:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('MongoDB bağlantısı kapatıldı');
    }
  }
}

// Script'i çalıştır
updateProductRounding()
  .then(() => {
    console.log('\nİşlem tamamlandı');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script hatası:', error);
    process.exit(1);
  });