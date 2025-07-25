require('dotenv').config({ path: '../.env' });
const { MongoClient } = require('mongodb');

async function testLogin() {
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
    
    const User = require('../models/User');
    const userModel = new User(db);
    
    console.log('🔐 Login testi başlıyor...\n');
    
    // Admin login testi
    try {
      console.log('👤 Admin login testi:');
      const result = await userModel.login('admin@goldserver.com', 'admin123');
      console.log('✅ Admin login başarılı');
      console.log(`   Kullanıcı: ${result.user.firstName} ${result.user.lastName}`);
      console.log(`   Email: ${result.user.email}`);
      console.log(`   Rol: ${result.user.role}`);
      console.log(`   Token: ${result.token.substring(0, 20)}...`);
    } catch (error) {
      console.log('❌ Admin login başarısız:', error.message);
    }
    
    console.log('\n────────────────────────\n');
    
    // Manager login testi
    try {
      console.log('👤 Manager login testi:');
      const result = await userModel.login('manager@goldserver.com', 'manager123');
      console.log('✅ Manager login başarılı');
      console.log(`   Kullanıcı: ${result.user.firstName} ${result.user.lastName}`);
      console.log(`   Email: ${result.user.email}`);
      console.log(`   Rol: ${result.user.role}`);
      console.log(`   Token: ${result.token.substring(0, 20)}...`);
    } catch (error) {
      console.log('❌ Manager login başarısız:', error.message);
    }
    
    console.log('\n────────────────────────\n');
    
    // Yanlış şifre testi
    try {
      console.log('🚫 Yanlış şifre testi:');
      await userModel.login('admin@goldserver.com', 'yanlis123');
      console.log('❌ Bu başarılı olmamalıydı!');
    } catch (error) {
      console.log('✅ Yanlış şifre doğru şekilde reddedildi:', error.message);
    }
    
    console.log('\n────────────────────────\n');
    
    // User role testi (admin paneline girmemeli)
    try {
      console.log('👤 Normal user login testi:');
      const result = await userModel.login('user@goldserver.com', 'user123');
      console.log('ℹ️ Normal user login başarılı (ama admin paneline girmemeli)');
      console.log(`   Kullanıcı: ${result.user.firstName} ${result.user.lastName}`);
      console.log(`   Rol: ${result.user.role}`);
    } catch (error) {
      console.log('❌ Normal user login başarısız:', error.message);
    }
    
  } catch (error) {
    console.error('Test hatası:', error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
    }
  }
}

testLogin();