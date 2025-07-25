const { MongoClient } = require('mongodb');
const DateHelper = require('../utils/dateHelper');
require('dotenv').config();

const mongoUri = process.env.MONGODB_URI;
const mongoOptions = {
  auth: {
    username: process.env.MONGODB_USERNAME,
    password: process.env.MONGODB_PASSWORD
  }
};

async function updateSystemCurrencies() {
  let client;
  
  try {
    client = new MongoClient(mongoUri, mongoOptions);
    await client.connect();
    const db = client.db();
    
    // TCMB'nin desteklediği para birimleri
    const tcmbSupportedCurrencies = [
      'USD/TRY', 'EUR/TRY', 'GBP/TRY', 'CHF/TRY', 'JPY/TRY',
      'CAD/TRY', 'AUD/TRY', 'NZD/TRY', 'SEK/TRY', 'NOK/TRY', 'DKK/TRY',
      'SAR/TRY', 'AED/TRY', 'QAR/TRY', 'KWD/TRY', 'BHD/TRY', 'JOD/TRY',
      'EGP/TRY', 'LBP/TRY', 'CNY/TRY', 'RUB/TRY', 'INR/TRY', 'KRW/TRY',
      'SGD/TRY', 'HKD/TRY', 'MYR/TRY', 'THB/TRY', 'IDR/TRY', 'PHP/TRY',
      'TWD/TRY', 'PLN/TRY', 'CZK/TRY', 'HUF/TRY', 'RON/TRY', 'BGN/TRY',
      'RSD/TRY', 'HRK/TRY', 'UAH/TRY', 'ZAR/TRY', 'ILS/TRY', 'BRL/TRY',
      'MXN/TRY', 'ARS/TRY', 'CLP/TRY', 'COP/TRY', 'PEN/TRY', 'UYU/TRY',
      'MAD/TRY', 'TND/TRY', 'DZD/TRY', 'LYD/TRY', 'IRR/TRY', 'IQD/TRY',
      'SYP/TRY', 'PKR/TRY', 'LKR/TRY', 'KZT/TRY', 'AZN/TRY', 'GEL/TRY',
      'ALL/TRY', 'BAM/TRY', 'MKD/TRY', 'MDL/TRY', 'OMR/TRY', 'CRC/TRY',
      'ISK/TRY'
    ];
    
    console.log('System currencies güncelleniyor...');
    
    // Mevcut system currencies'leri kontrol et
    const systemCurrencies = await db.collection('system_currencies').find({}).toArray();
    console.log(`Toplam ${systemCurrencies.length} adet system currency bulundu`);
    
    let updatedCount = 0;
    let alreadyHadTcmb = 0;
    
    for (const currency of systemCurrencies) {
      if (tcmbSupportedCurrencies.includes(currency.symbol)) {
        // Zaten TCMB sources'ta var mı kontrol et
        if (currency.sources && currency.sources.includes('tcmb')) {
          alreadyHadTcmb++;
          console.log(`✓ ${currency.symbol} zaten TCMB'ye sahip`);
        } else {
          // TCMB'yi sources array'ine ekle
          await db.collection('system_currencies').updateOne(
            { _id: currency._id },
            { 
              $addToSet: { sources: 'tcmb' },
              $set: { 
                hasSource: true,
                updatedAt: DateHelper.createDate() 
              }
            }
          );
          updatedCount++;
          console.log(`✅ ${currency.symbol} - TCMB eklendi`);
        }
      }
    }
    
    // TCMB source'un aktif olduğunu kontrol et
    const tcmbSource = await db.collection('sources').findOne({ name: 'tcmb' });
    if (!tcmbSource) {
      console.log('⚠️  TCMB source bulunamadı, oluşturuluyor...');
      await db.collection('sources').insertOne({
        name: 'tcmb',
        displayName: 'TCMB',
        url: 'https://www.tcmb.gov.tr',
        type: 'api',
        category: 'central_bank',
        isActive: true,
        createdAt: DateHelper.createDate(),
        updatedAt: DateHelper.createDate()
      });
      console.log('✅ TCMB source oluşturuldu');
    } else {
      console.log(`✓ TCMB source mevcut (${tcmbSource.isActive ? 'aktif' : 'pasif'})`);
      if (!tcmbSource.isActive) {
        await db.collection('sources').updateOne(
          { name: 'tcmb' },
          { $set: { isActive: true, updatedAt: DateHelper.createDate() } }
        );
        console.log('✅ TCMB source aktif edildi');
      }
    }
    
    console.log('\n📊 Güncelleme Özeti:');
    console.log(`- Güncellenen currencies: ${updatedCount}`);
    console.log(`- Zaten TCMB'li currencies: ${alreadyHadTcmb}`);
    console.log(`- TCMB destekli toplam currencies: ${tcmbSupportedCurrencies.length}`);
    
    // Mapping durumunu kontrol et
    const mappings = await db.collection('price_mappings').countDocuments({
      isActive: true,
      sourceId: tcmbSource._id
    });
    console.log(`- Mevcut TCMB mappings: ${mappings}`);
    
    console.log('\n✅ System currencies başarıyla güncellendi!');
    console.log('Artık bulk-update ve auto-create işlemleri TCMB için çalışacak.');
    
  } catch (error) {
    console.error('❌ Hata:', error);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

updateSystemCurrencies();