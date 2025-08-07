require('dotenv').config();
const { MongoClient } = require('mongodb');

async function migrateFormulasToNewFormat() {
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

    // Sistem para birimlerini al
    const systemCurrenciesCollection = db.collection('system_currencies');
    const systemCurrencies = await systemCurrenciesCollection.find({}).toArray();
    
    console.log(`📋 ${systemCurrencies.length} system currency bulundu`);

    // Symbol'dan currency code'a mapping oluştur
    const symbolToCode = {};
    systemCurrencies.forEach(currency => {
      symbolToCode[currency.symbol] = currency.code;
    });
    
    console.log('🔄 Symbol-to-Code mapping oluşturuldu:', symbolToCode);

    // JmonUserProduct koleksiyonundaki formülleri güncelle
    const userProductsCollection = db.collection('jmon_user_products');
    
    // Tüm aktif ürünleri al
    const products = await userProductsCollection.find({
      isActive: true,
      $or: [
        { buyingFormula: { $exists: true, $ne: null, $ne: '' } },
        { sellingFormula: { $exists: true, $ne: null, $ne: '' } }
      ]
    }).toArray();

    console.log(`\n🔍 ${products.length} ürün bulundu, formüller kontrol ediliyor...`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const product of products) {
      let needsUpdate = false;
      let newBuyingFormula = product.buyingFormula;
      let newSellingFormula = product.sellingFormula;

      // Buying formula'yı güncelle
      if (product.buyingFormula) {
        newBuyingFormula = convertFormula(product.buyingFormula, symbolToCode);
        if (newBuyingFormula !== product.buyingFormula) {
          needsUpdate = true;
        }
      }

      // Selling formula'yı güncelle
      if (product.sellingFormula) {
        newSellingFormula = convertFormula(product.sellingFormula, symbolToCode);
        if (newSellingFormula !== product.sellingFormula) {
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        console.log(`\n🔄 Ürün güncelleniyor: ${product.name} (${product.productCode})`);
        
        if (product.buyingFormula && newBuyingFormula !== product.buyingFormula) {
          console.log(`  📥 Alış: ${product.buyingFormula} → ${newBuyingFormula}`);
        }
        
        if (product.sellingFormula && newSellingFormula !== product.sellingFormula) {
          console.log(`  📤 Satış: ${product.sellingFormula} → ${newSellingFormula}`);
        }

        // Güncelleme işlemi
        const updateData = {
          updatedAt: new Date()
        };

        if (newBuyingFormula) {
          updateData.buyingFormula = newBuyingFormula;
          updateData.buyingFormulaVariables = extractVariables(newBuyingFormula);
        }

        if (newSellingFormula) {
          updateData.sellingFormula = newSellingFormula;
          updateData.sellingFormulaVariables = extractVariables(newSellingFormula);
        }

        await userProductsCollection.updateOne(
          { _id: product._id },
          { $set: updateData }
        );

        updatedCount++;
      } else {
        skippedCount++;
        console.log(`⏭️  Ürün atlandı (güncel): ${product.name}`);
      }
    }

    console.log('\n✅ Migration tamamlandı!');
    console.log(`📊 İstatistikler:`);
    console.log(`  • Toplam ürün: ${products.length}`);
    console.log(`  • Güncellenen: ${updatedCount}`);
    console.log(`  • Atlanan: ${skippedCount}`);

  } catch (error) {
    console.error('❌ Hata:', error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
      console.log('\nMongoDB bağlantısı kapatıldı');
    }
  }
}

// Formülü eski formattan yeni formata dönüştür
function convertFormula(formula, symbolToCode) {
  if (!formula) return formula;

  let convertedFormula = formula;

  // HAS/TRY_buying → HAS_alis
  // USD/TRY_selling → USD_satis
  // EUR/TRY_last → EUR_last
  // etc.

  for (const [symbol, code] of Object.entries(symbolToCode)) {
    // buying → alis
    convertedFormula = convertedFormula.replace(
      new RegExp(`${escapeRegex(symbol)}_buying`, 'g'),
      `${code}_alis`
    );
    
    // selling → satis
    convertedFormula = convertedFormula.replace(
      new RegExp(`${escapeRegex(symbol)}_selling`, 'g'),
      `${code}_satis`
    );
    
    // last ve avg artık desteklenmiyor, bunları kaldır veya alis/satis'e dönüştür
    // last → alis (varsayılan olarak)
    convertedFormula = convertedFormula.replace(
      new RegExp(`${escapeRegex(symbol)}_last`, 'g'),
      `${code}_alis`
    );
    
    // avg → ortalama formülü ile değiştir
    convertedFormula = convertedFormula.replace(
      new RegExp(`${escapeRegex(symbol)}_avg`, 'g'),
      `(${code}_alis + ${code}_satis) / 2`
    );
  }

  return convertedFormula;
}

// Yeni formattan değişkenleri çıkar (FormulaCalculator ile uyumlu)
function extractVariables(formula) {
  if (!formula) return [];
  
  const variableRegex = /(\w+)_(alis|satis)/g;
  const variables = [];
  let match;
  
  while ((match = variableRegex.exec(formula)) !== null) {
    const currencyCode = match[1]; // HAS, USD, EUR
    const originalPriceType = match[2]; // alis, satis
    
    // _alis ve _satis'i buying ve selling'e çevir
    let priceType;
    if (originalPriceType === 'alis') {
      priceType = 'buying';
    } else if (originalPriceType === 'satis') {
      priceType = 'selling';
    }
    
    const symbol = `${currencyCode}/TRY`; // Symbol formatına çevir
    const variable = `${currencyCode}_${originalPriceType}`; // Orijinal formatı koru
    
    variables.push({
      symbol: symbol,
      priceType: priceType,
      variable: variable,
      currencyCode: currencyCode,
      originalPriceType: originalPriceType
    });
  }
  
  return variables;
}

// Regex için string'i escape et
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Script'i çalıştır
migrateFormulasToNewFormat();