require('dotenv').config();
const { MongoClient } = require('mongodb');
const ApiToken = require('./models/ApiToken');

async function createTestToken() {
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
    
    // Test tokenları oluştur
    const testTokens = [
      {
        domain: 'localhost',
        name: 'Localhost Test Token',
        description: 'Geliştirme ortamı için test token',
        permissions: ['read', 'subscribe'],
        allowedChannels: ['*'],
        rateLimit: {
          requests: 10000,
          window: 60
        }
      },
      {
        domain: 'example.com',
        name: 'Example.com Production Token',
        description: 'Production için sınırlı token',
        permissions: ['read', 'subscribe'],
        allowedChannels: ['prices', 'market'],
        rateLimit: {
          requests: 1000,
          window: 60
        },
        expiresIn: 86400 * 30 // 30 gün
      },
      {
        domain: 'api.partner.com',
        name: 'Partner API Token',
        description: 'İş ortağı API erişimi',
        permissions: ['read', 'write', 'subscribe'],
        allowedChannels: ['prices', 'market', 'trades', 'statistics'],
        rateLimit: {
          requests: 5000,
          window: 60
        }
      }
    ];
    
    console.log('Token oluşturma başlıyor...\n');
    
    for (const tokenData of testTokens) {
      const token = await apiToken.create(tokenData);
      
      console.log('===============================================');
      console.log(`Domain: ${token.domain}`);
      console.log(`Name: ${token.name}`);
      console.log(`Token: ${token.token}`);
      console.log(`Permissions: ${token.permissions.join(', ')}`);
      console.log(`Allowed Channels: ${token.allowedChannels.join(', ')}`);
      console.log(`Rate Limit: ${token.rateLimit.requests} requests per ${token.rateLimit.window} seconds`);
      if (token.expiresAt) {
        console.log(`Expires At: ${token.expiresAt}`);
      }
      console.log('===============================================\n');
    }
    
    // Tüm aktif tokenları listele
    console.log('\nAktif Token Listesi:');
    const activeTokens = await apiToken.listActive();
    
    console.log(`Toplam ${activeTokens.length} aktif token bulundu.\n`);
    
    activeTokens.forEach((token, index) => {
      console.log(`${index + 1}. ${token.domain} - ${token.name}`);
      console.log(`   Token: ${token.token.substring(0, 20)}...`);
      console.log(`   Created: ${token.createdAt}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('Hata:', error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
    }
  }
}

// Script'i çalıştır
createTestToken();