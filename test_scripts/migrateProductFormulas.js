require('dotenv').config({ path: '../.env' });
const { MongoClient } = require('mongodb');

async function migrateProductFormulas() {
  let mongoClient;
  
  try {
    console.log('🔄 Ürün formüllerini güncelleme işlemi başlatılıyor...\n');
    
    // MongoDB'ye bağlan
    mongoClient = new MongoClient(process.env.MONGODB_URI, {
      auth: {
        username: process.env.MONGODB_USERNAME,
        password: process.env.MONGODB_PASSWORD
      }
    });
    
    await mongoClient.connect();
    const db = mongoClient.db();
    
    console.log('✅ MongoDB bağlantısı kuruldu');
    
    // Mevcut ürünleri bul
    const collection = db.collection('jmon_user_products');
    
    // Eski format ürünleri bul (formula alanı olan)
    const productsWithOldFormat = await collection.find({
      formula: { $exists: true },
      buyingFormula: { $exists: false }
    }).toArray();
    
    console.log(`📦 ${productsWithOldFormat.length} adet güncellenecek ürün bulundu\n`);
    
    if (productsWithOldFormat.length === 0) {
      console.log('ℹ️ Güncellenecek ürün bulunamadı. Tüm ürünler yeni format ile uyumlu.');
      return;
    }
    
    let updatedCount = 0;
    let errorCount = 0;
    
    for (const product of productsWithOldFormat) {
      try {
        console.log(`🔄 Güncelleniyor: ${product.name} (${product.productCode || 'Kod yok'})`);
        
        // Eski formülü hem buying hem selling için kullan
        const oldFormula = product.formula;
        
        // Buying formülü: Orijinal formül (genelde _buying içerir)
        let buyingFormula = oldFormula;
        
        // Selling formülü: _buying'i _selling ile değiştir
        let sellingFormula = oldFormula.replace(/_buying/g, '_selling');
        
        // Eğer orijinal formülde _buying yoksa, varsayılan olarak aynı formülü kullan
        if (!oldFormula.includes('_buying')) {
          // Eğer formülde sadece sembol varsa (ör: "HAS/TRY"), buying ve selling versiyonları oluştur
          if (product.baseSymbol && oldFormula.includes(product.baseSymbol)) {
            buyingFormula = oldFormula.replace(new RegExp(product.baseSymbol, 'g'), `${product.baseSymbol}_buying`);
            sellingFormula = oldFormula.replace(new RegExp(product.baseSymbol, 'g'), `${product.baseSymbol}_selling`);
          }
        }
        
        // Formül değişkenlerini güncelle
        const buyingFormulaVariables = extractVariables(buyingFormula);
        const sellingFormulaVariables = extractVariables(sellingFormula);
        
        // Güncelleme verisi
        const updateData = {
          buyingFormula: buyingFormula,
          sellingFormula: sellingFormula,
          buyingFormulaVariables: buyingFormulaVariables,
          sellingFormulaVariables: sellingFormulaVariables,
          updatedAt: new Date()
        };
        
        // Eski formula alanını kaldır
        const unsetData = {
          formula: 1,
          formulaVariables: 1
        };
        
        // lastCalculatedValue'yu lastCalculatedValues'a dönüştür
        if (product.lastCalculatedValue !== null && product.lastCalculatedValue !== undefined) {
          updateData.lastCalculatedValues = {
            buying: product.lastCalculatedValue,
            selling: product.lastCalculatedValue
          };
          unsetData.lastCalculatedValue = 1;
        }
        
        // Veritabanında güncelle
        const result = await collection.updateOne(
          { _id: product._id },
          { 
            $set: updateData,
            $unset: unsetData
          }
        );
        
        if (result.modifiedCount > 0) {
          console.log(`   ✅ Başarıyla güncellendi`);
          console.log(`      📥 Alış Formülü: ${buyingFormula}`);
          console.log(`      📤 Satış Formülü: ${sellingFormula}`);
          updatedCount++;
        } else {
          console.log(`   ⚠️ Güncelleme yapılmadı (zaten güncel olabilir)`);
        }
        
      } catch (error) {
        console.error(`   ❌ Hata: ${error.message}`);
        errorCount++;
      }
      
      console.log(''); // Boş satır
    }
    
    console.log('📊 Güncelleme Özeti:');
    console.log(`   ✅ Başarıyla güncellenen: ${updatedCount}`);
    console.log(`   ❌ Hata ile karşılaşılan: ${errorCount}`);
    console.log(`   📦 Toplam işlenen: ${productsWithOldFormat.length}`);
    
    // Güncellenmiş ürünleri kontrol et
    const updatedProducts = await collection.find({
      buyingFormula: { $exists: true },
      sellingFormula: { $exists: true }
    }).count();
    
    console.log(`\n✅ Şu anda ${updatedProducts} adet ürün yeni format ile uyumlu`);
    
  } catch (error) {
    console.error('❌ Hata:', error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
      console.log('\n🔐 MongoDB bağlantısı kapatıldı');
    }
  }
}

// Formülden değişkenleri çıkar (JmonUserProduct.js'deki fonksiyonun kopyası)
function extractVariables(formula) {
  if (!formula) return [];
  
  const variableRegex = /(\w+\/(TRY|USD|EUR))_?(buying|selling|last)?/g;
  const variables = [];
  let match;
  
  while ((match = variableRegex.exec(formula)) !== null) {
    const symbol = match[1];
    const priceType = match[3] || 'last';
    variables.push({
      symbol: symbol,
      priceType: priceType,
      variable: `${symbol}_${priceType}`
    });
  }
  
  return variables;
}

// Script'i çalıştır
if (require.main === module) {
  migrateProductFormulas()
    .then(() => {
      console.log('\n🎉 Migrasyon tamamlandı!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Migrasyon hatası:', error);
      process.exit(1);
    });
}

module.exports = migrateProductFormulas;