require('dotenv').config({ path: '../.env' });
const { MongoClient } = require('mongodb');
const ApiToken = require('../models/ApiToken');

async function updateTokenDomain() {
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
    const apiToken = new ApiToken(db);
    
    const testToken = 'sk_12db8a09f2b6e807e0992c8dc3e9c23d648b7cab63a489f2550f422a248d60d7';
    
    console.log('Token domain güncelleniyor...');
    
    // Token'ı bul ve domain'ini '*' yap (universal access)
    const result = await apiToken.collection.updateOne(
      { token: testToken },
      { 
        $set: { 
          domain: '*',
          name: 'Universal Test Token',
          description: 'Tüm domain\'lerden erişim için test token',
          updatedAt: new Date()
        }
      }
    );
    
    if (result.modifiedCount > 0) {
      console.log('✅ Token domain\'i * (universal) olarak güncellendi');
      
      // Güncel token bilgilerini göster
      const updatedToken = await apiToken.collection.findOne({ token: testToken });
      console.log('\nGüncel token bilgileri:');
      console.log('Domain:', updatedToken.domain);
      console.log('Name:', updatedToken.name);
      console.log('Permissions:', updatedToken.permissions);
      console.log('Allowed Channels:', updatedToken.allowedChannels);
    } else {
      console.log('❌ Token güncellenemedi');
    }
    
  } catch (error) {
    console.error('Hata:', error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
    }
  }
}

updateTokenDomain();