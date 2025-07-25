const { MongoClient, ObjectId } = require('mongodb');
const DateHelper = require('../utils/dateHelper');
require('dotenv').config();

const mongoUri = process.env.MONGODB_URI;
const mongoOptions = {
  auth: {
    username: process.env.MONGODB_USERNAME,
    password: process.env.MONGODB_PASSWORD
  }
};

async function createTCMBMappings() {
  let client;
  
  try {
    client = new MongoClient(mongoUri, mongoOptions);
    await client.connect();
    const db = client.db();
    
    // TCMB source'u bul
    const tcmbSource = await db.collection('sources').findOne({ name: 'tcmb' });
    if (!tcmbSource) {
      throw new Error('TCMB source bulunamadı');
    }
    console.log('✓ TCMB source bulundu:', tcmbSource._id);
    
    // TCMB mapping'i - para birimi kodları ile symbol'ler arasındaki eşleştirme
    const tcmbMapping = {
      'USD': 'USD/TRY', 'EUR': 'EUR/TRY', 'GBP': 'GBP/TRY', 'CHF': 'CHF/TRY', 'JPY': 'JPY/TRY',
      'CAD': 'CAD/TRY', 'AUD': 'AUD/TRY', 'NZD': 'NZD/TRY', 'SEK': 'SEK/TRY', 'NOK': 'NOK/TRY', 'DKK': 'DKK/TRY',
      'SAR': 'SAR/TRY', 'AED': 'AED/TRY', 'QAR': 'QAR/TRY', 'KWD': 'KWD/TRY', 'BHD': 'BHD/TRY', 'JOD': 'JOD/TRY',
      'EGP': 'EGP/TRY', 'LBP': 'LBP/TRY', 'CNY': 'CNY/TRY', 'RUB': 'RUB/TRY', 'INR': 'INR/TRY', 'KRW': 'KRW/TRY',
      'SGD': 'SGD/TRY', 'HKD': 'HKD/TRY', 'MYR': 'MYR/TRY', 'THB': 'THB/TRY', 'IDR': 'IDR/TRY', 'PHP': 'PHP/TRY',
      'TWD': 'TWD/TRY', 'PLN': 'PLN/TRY', 'CZK': 'CZK/TRY', 'HUF': 'HUF/TRY', 'RON': 'RON/TRY', 'BGN': 'BGN/TRY',
      'RSD': 'RSD/TRY', 'HRK': 'HRK/TRY', 'UAH': 'UAH/TRY', 'ZAR': 'ZAR/TRY', 'ILS': 'ILS/TRY', 'BRL': 'BRL/TRY',
      'MXN': 'MXN/TRY', 'ARS': 'ARS/TRY', 'CLP': 'CLP/TRY', 'COP': 'COP/TRY', 'PEN': 'PEN/TRY', 'UYU': 'UYU/TRY',
      'MAD': 'MAD/TRY', 'TND': 'TND/TRY', 'DZD': 'DZD/TRY', 'LYD': 'LYD/TRY', 'IRR': 'IRR/TRY', 'IQD': 'IQD/TRY',
      'SYP': 'SYP/TRY', 'PKR': 'PKR/TRY', 'LKR': 'LKR/TRY', 'KZT': 'KZT/TRY', 'AZN': 'AZN/TRY', 'GEL': 'GEL/TRY',
      'ALL': 'ALL/TRY', 'BAM': 'BAM/TRY', 'MKD': 'MKD/TRY', 'MDL': 'MDL/TRY', 'OMR': 'OMR/TRY', 'CRC': 'CRC/TRY',
      'ISK': 'ISK/TRY'
    };
    
    // System currencies'leri al
    const systemCurrencies = await db.collection('system_currencies').find({
      isActive: true,
      sources: 'tcmb'
    }).toArray();
    
    console.log(`✓ TCMB destekli ${systemCurrencies.length} adet system currency bulundu`);
    
    let createdCount = 0;
    let skippedCount = 0;
    
    for (const [tcmbCode, symbol] of Object.entries(tcmbMapping)) {
      // System currency var mı kontrol et
      const systemCurrency = systemCurrencies.find(c => c.symbol === symbol);
      if (!systemCurrency) {
        console.log(`⚠️  ${symbol} system currency'de bulunamadı, atlanıyor`);
        skippedCount++;
        continue;
      }
      
      // Mevcut mapping var mı kontrol et
      const existingMapping = await db.collection('price_mappings').findOne({
        sourceId: tcmbSource._id,
        sourceField: tcmbCode
      });
      
      if (existingMapping) {
        console.log(`✓ ${symbol} (${tcmbCode}) mapping zaten mevcut`);
        skippedCount++;
        continue;
      }
      
      // Yeni mapping oluştur
      const mappingData = {
        sourceId: tcmbSource._id,
        sourceField: tcmbCode,
        sourceDescription: `${symbol} - TCMB Resmi Kurları`,
        targetSymbol: symbol,
        targetType: 'forex',
        priority: systemCurrency.priority || 1,
        multiplier: 1,
        offset: 0,
        formula: null,
        isActive: true,
        createdAt: DateHelper.createDate(),
        updatedAt: DateHelper.createDate(),
        metadata: {
          autoCreated: true,
          systemCurrencyId: systemCurrency._id,
          tcmbCode: tcmbCode,
          currencyName: systemCurrency.name
        }
      };
      
      await db.collection('price_mappings').insertOne(mappingData);
      console.log(`✅ ${symbol} (${tcmbCode}) mapping oluşturuldu`);
      createdCount++;
    }
    
    // Mapping durumunu kontrol et
    const totalMappings = await db.collection('price_mappings').countDocuments({
      sourceId: tcmbSource._id,
      isActive: true
    });
    
    console.log('\n📊 Mapping Oluşturma Özeti:');
    console.log(`- Yeni oluşturulan mappings: ${createdCount}`);
    console.log(`- Atlanan mappings (zaten mevcut): ${skippedCount}`);
    console.log(`- Toplam aktif TCMB mappings: ${totalMappings}`);
    
    console.log('\n✅ TCMB mappings başarıyla oluşturuldu!');
    console.log('Artık admin panelinde TCMB mappings görünecek.');
    
  } catch (error) {
    console.error('❌ Hata:', error);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

createTCMBMappings();