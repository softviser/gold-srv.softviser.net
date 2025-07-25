require('dotenv').config({ path: '../.env' });
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function checkUsers() {
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
    const usersCollection = db.collection('users');
    
    console.log('🔍 Kullanıcı kontrolü başlıyor...\n');
    
    // Tüm kullanıcıları al
    const users = await usersCollection.find({}).toArray();
    
    console.log(`📊 Toplam kullanıcı sayısı: ${users.length}\n`);
    
    for (const user of users) {
      console.log(`👤 Kullanıcı: ${user.firstName} ${user.lastName}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Rol: ${user.role}`);
      console.log(`   Aktif: ${user.isActive ? 'Evet' : 'Hayır'}`);
      console.log(`   Şifre Hash: ${user.password.substring(0, 20)}...`);
      
      // Test şifresi kontrolü
      try {
        let testPassword;
        if (user.role === 'admin') testPassword = 'admin123';
        else if (user.role === 'manager') testPassword = 'manager123';
        else testPassword = 'user123';
        
        const isPasswordValid = await bcrypt.compare(testPassword, user.password);
        console.log(`   Şifre testi (${testPassword}): ${isPasswordValid ? '✅ Geçerli' : '❌ Geçersiz'}`);
      } catch (error) {
        console.log(`   Şifre testi: ❌ Hata - ${error.message}`);
      }
      
      console.log('   ────────────────────────');
    }
    
    // Admin kullanıcısına özel test
    console.log('\n🔐 Admin kullanıcısı özel test:');
    const adminUser = await usersCollection.findOne({ email: 'admin@goldserver.com' });
    
    if (adminUser) {
      console.log('✅ Admin kullanıcısı bulundu');
      console.log(`   ID: ${adminUser._id}`);
      console.log(`   Email: ${adminUser.email}`);
      console.log(`   Aktif: ${adminUser.isActive}`);
      console.log(`   Rol: ${adminUser.role}`);
      console.log(`   Oluşturulma: ${adminUser.createdAt}`);
      
      // Şifre hash kontrolü
      const isValidPassword = await bcrypt.compare('admin123', adminUser.password);
      console.log(`   Şifre kontrolü: ${isValidPassword ? '✅' : '❌'}`);
      
      // Kilit kontrolü
      if (adminUser.lockoutUntil) {
        console.log(`   ⚠️ Hesap kilitli: ${adminUser.lockoutUntil}`);
        console.log(`   Başarısız giriş: ${adminUser.failedLoginAttempts || 0}`);
      } else {
        console.log('   🔓 Hesap açık');
      }
    } else {
      console.log('❌ Admin kullanıcısı bulunamadı');
    }
    
  } catch (error) {
    console.error('Hata:', error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
    }
  }
}

checkUsers();