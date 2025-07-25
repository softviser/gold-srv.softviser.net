require('dotenv').config({ path: '../.env' });
const { MongoClient } = require('mongodb');
const ApiToken = require('../models/ApiToken');

async function testTokenValidation() {
  let mongoClient;
  
  try {
    console.log('MongoDB bağlantı testi başlıyor...');
    
    // MongoDB'ye bağlan
    mongoClient = new MongoClient(process.env.MONGODB_URI, {
      auth: {
        username: process.env.MONGODB_USERNAME,
        password: process.env.MONGODB_PASSWORD
      }
    });
    
    await mongoClient.connect();
    const db = mongoClient.db();
    const apiToken = new ApiToken(db);
    
    console.log('MongoDB bağlantısı başarılı!\n');
    
    // Test edilecek token
    const testToken = 'sk_12db8a09f2b6e807e0992c8dc3e9c23d648b7cab63a489f2550f422a248d60d7';
    const testDomain = 'localhost';
    
    console.log('Token Test Bilgileri:');
    console.log('Token:', testToken);
    console.log('Domain:', testDomain);
    console.log('\n========================================\n');
    
    // Önce bu token'ın veritabanında olup olmadığını kontrol et
    console.log('1. Veritabanında token arama...');
    const tokenInDb = await apiToken.collection.findOne({ token: testToken });
    
    if (tokenInDb) {
      console.log('✅ Token veritabanında bulundu:');
      console.log('   Domain:', tokenInDb.domain);
      console.log('   Is Active:', tokenInDb.isActive);
      console.log('   Expires At:', tokenInDb.expiresAt);
      console.log('   Permissions:', tokenInDb.permissions);
      console.log('   Allowed Channels:', tokenInDb.allowedChannels);
    } else {
      console.log('❌ Token veritabanında bulunamadı!');
      
      // Token oluştur
      console.log('\n2. Test token oluşturuluyor...');
      const newToken = await apiToken.create({
        token: testToken,
        domain: testDomain,
        name: 'Manual Test Token',
        description: 'Debug için manuel oluşturulan token',
        permissions: ['read', 'subscribe'],
        allowedChannels: ['*']
      });
      
      console.log('✅ Token oluşturuldu:', newToken.token);
    }
    
    console.log('\n3. Token doğrulama testi...');
    
    // Domain ile doğrula
    const validTokenWithDomain = await apiToken.validate(testToken, testDomain);
    console.log('Domain ile doğrulama:', validTokenWithDomain ? '✅ Başarılı' : '❌ Başarısız');
    
    // Domain olmadan doğrula
    const validTokenWithoutDomain = await apiToken.validate(testToken);
    console.log('Domain olmadan doğrulama:', validTokenWithoutDomain ? '✅ Başarılı' : '❌ Başarısız');
    
    if (validTokenWithDomain) {
      console.log('\nToken Detayları:');
      console.log('- ID:', validTokenWithDomain._id);
      console.log('- Domain:', validTokenWithDomain.domain);
      console.log('- Permissions:', validTokenWithDomain.permissions);
      console.log('- Allowed Channels:', validTokenWithDomain.allowedChannels);
      console.log('- Usage Count:', validTokenWithDomain.usageCount);
    }
    
    console.log('\n4. Tüm aktif tokenları listeleme...');
    const activeTokens = await apiToken.listActive({ limit: 10 });
    console.log(`Toplam ${activeTokens.length} aktif token:`);
    
    activeTokens.forEach((token, index) => {
      console.log(`${index + 1}. ${token.domain} - ${token.token.substring(0, 20)}...`);
    });
    
  } catch (error) {
    console.error('Hata:', error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
      console.log('\nMongoDB bağlantısı kapatıldı.');
    }
  }
}

// Script'i çalıştır
testTokenValidation();