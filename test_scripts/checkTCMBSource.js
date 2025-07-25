require('dotenv').config({ path: '../.env' });
const { MongoClient } = require('mongodb');

async function checkTCMBSource() {
  let mongoClient;
  
  try {
    // MongoDB'ye bağlan
    mongoClient = new MongoClient(process.env.MONGODB_URI, {
      auth: {
        username: process.env.MONGODB_USERNAME,
        password: process.env.MONGODB_PASSWORD
      }
    });
    
    await mongoClient.connect();
    const db = mongoClient.db();
    
    console.log('MongoDB bağlantısı başarılı\n');
    
    // Sources collection'ını kontrol et
    const sourcesCollection = db.collection('sources');
    
    // Tüm kaynakları listele
    console.log('=== TÜM KAYNAKLAR ===');
    const allSources = await sourcesCollection.find({}).toArray();
    
    if (allSources.length === 0) {
      console.log('❌ Hiç kaynak bulunamadı!');
    } else {
      console.log(`Toplam ${allSources.length} kaynak bulundu:\n`);
      
      allSources.forEach(source => {
        console.log(`📌 ${source.displayName || source.name}`);
        console.log(`   - İsim: ${source.name}`);
        console.log(`   - Tip: ${source.type}`);
        console.log(`   - Kategori: ${source.category}`);
        console.log(`   - Aktif: ${source.isActive ? '✅' : '❌'}`);
        console.log(`   - Son Güncelleme: ${source.lastUpdate || 'Henüz güncellenmemiş'}`);
        console.log(`   - URL: ${source.apiUrl || source.url || 'URL yok'}`);
        console.log(`   - Güncelleme Aralığı: ${source.updateInterval} saniye`);
        console.log('');
      });
    }
    
    // TCMB kaynağını özel olarak kontrol et
    console.log('\n=== TCMB KAYNAĞI KONTROLÜ ===');
    const tcmbSource = await sourcesCollection.findOne({ name: 'tcmb' });
    
    if (tcmbSource) {
      console.log('✅ TCMB kaynağı bulundu!');
      console.log(JSON.stringify(tcmbSource, null, 2));
      
      // TCMB verilerini kontrol et
      console.log('\n=== TCMB VERİLERİ KONTROLÜ ===');
      const currencyRatesCollection = db.collection('currencyrates');
      const tcmbRates = await currencyRatesCollection.find({ source: 'tcmb' }).limit(10).toArray();
      
      if (tcmbRates.length > 0) {
        console.log(`✅ ${tcmbRates.length} TCMB verisi bulundu:`);
        tcmbRates.forEach(rate => {
          console.log(`   - ${rate.symbol}: ${rate.rate} (${rate.lastUpdate || rate.createdAt})`);
        });
      } else {
        console.log('❌ TCMB verisi bulunamadı!');
      }
      
    } else {
      console.log('❌ TCMB kaynağı bulunamadı!');
      console.log('\nTCMB kaynağını eklemek için addSampleData.js dosyasını çalıştırabilirsiniz.');
    }
    
    // Aktif olmayan kaynakları kontrol et
    console.log('\n=== AKTİF OLMAYAN KAYNAKLAR ===');
    const inactiveSources = await sourcesCollection.find({ isActive: false }).toArray();
    
    if (inactiveSources.length > 0) {
      console.log(`❌ ${inactiveSources.length} aktif olmayan kaynak var:`);
      inactiveSources.forEach(source => {
        console.log(`   - ${source.displayName || source.name} (Son hata: ${source.lastError || 'Bilinmiyor'})`);
      });
    } else {
      console.log('✅ Tüm kaynaklar aktif');
    }
    
    // Son güncelleme zamanlarını kontrol et
    console.log('\n=== SON GÜNCELLEME ZAMANLARI ===');
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const outdatedSources = await sourcesCollection.find({
      isActive: true,
      $or: [
        { lastUpdate: { $lt: oneHourAgo } },
        { lastUpdate: null }
      ]
    }).toArray();
    
    if (outdatedSources.length > 0) {
      console.log(`⚠️  ${outdatedSources.length} kaynak 1 saatten fazla süredir güncellenmemiş:`);
      outdatedSources.forEach(source => {
        const lastUpdateStr = source.lastUpdate ? 
          new Date(source.lastUpdate).toLocaleString('tr-TR') : 
          'Hiç güncellenmemiş';
        console.log(`   - ${source.displayName || source.name}: ${lastUpdateStr}`);
      });
    } else {
      console.log('✅ Tüm aktif kaynaklar son 1 saat içinde güncellenmiş');
    }
    
  } catch (error) {
    console.error('Hata:', error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
      console.log('\nMongoDB bağlantısı kapatıldı');
    }
  }
}

checkTCMBSource();