require('dotenv').config({ path: '../.env' });
const { MongoClient } = require('mongodb');
const User = require('../models/User');

async function createAdminUser() {
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
    const userModel = new User(db);
    
    console.log('Admin kullanıcısı oluşturuluyor...\n');
    
    // Admin kullanıcı verisi
    const adminData = {
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@goldserver.com',
      password: 'admin123',
      phone: '+90 555 000 0000',
      role: 'admin',
      permissions: ['read', 'write', 'delete', 'manage_users', 'manage_sources', 'manage_mappings'],
      department: 'IT',
      title: 'Sistem Yöneticisi',
      preferences: {
        language: 'tr',
        timezone: 'Europe/Istanbul',
        theme: 'light',
        notifications: {
          email: true,
          browser: true,
          sms: false
        }
      }
    };
    
    // Manager kullanıcı verisi
    const managerData = {
      firstName: 'Manager',
      lastName: 'User',
      email: 'manager@goldserver.com',
      password: 'manager123',
      phone: '+90 555 000 0001',
      role: 'manager',
      permissions: ['read', 'write', 'manage_sources', 'manage_mappings'],
      department: 'Operations',
      title: 'Operasyon Müdürü',
      preferences: {
        language: 'tr',
        timezone: 'Europe/Istanbul',
        theme: 'light',
        notifications: {
          email: true,
          browser: true,
          sms: false
        }
      }
    };
    
    // Normal kullanıcı verisi
    const userData = {
      firstName: 'Test',
      lastName: 'User',
      email: 'user@goldserver.com',
      password: 'user123',
      phone: '+90 555 000 0002',
      role: 'user',
      permissions: ['read'],
      department: 'Finance',
      title: 'Finans Analisti',
      preferences: {
        language: 'tr',
        timezone: 'Europe/Istanbul',
        theme: 'light',
        notifications: {
          email: true,
          browser: false,
          sms: false
        }
      }
    };
    
    try {
      const admin = await userModel.create(adminData);
      console.log('✅ Admin kullanıcısı oluşturuldu:');
      console.log(`   Email: ${admin.email}`);
      console.log(`   Şifre: admin123`);
      console.log(`   Rol: ${admin.role}\n`);
    } catch (error) {
      if (error.message.includes('zaten kullanımda')) {
        console.log('ℹ️  Admin kullanıcısı zaten mevcut\n');
      } else {
        throw error;
      }
    }
    
    try {
      const manager = await userModel.create(managerData);
      console.log('✅ Manager kullanıcısı oluşturuldu:');
      console.log(`   Email: ${manager.email}`);
      console.log(`   Şifre: manager123`);
      console.log(`   Rol: ${manager.role}\n`);
    } catch (error) {
      if (error.message.includes('zaten kullanımda')) {
        console.log('ℹ️  Manager kullanıcısı zaten mevcut\n');
      } else {
        throw error;
      }
    }
    
    try {
      const user = await userModel.create(userData);
      console.log('✅ Test kullanıcısı oluşturuldu:');
      console.log(`   Email: ${user.email}`);
      console.log(`   Şifre: user123`);
      console.log(`   Rol: ${user.role}\n`);
    } catch (error) {
      if (error.message.includes('zaten kullanımda')) {
        console.log('ℹ️  Test kullanıcısı zaten mevcut\n');
      } else {
        throw error;
      }
    }
    
    // İstatistikleri göster
    const stats = await userModel.getStats();
    console.log('📊 Kullanıcı İstatistikleri:');
    console.log(`   Toplam kullanıcı: ${stats.totalUsers}`);
    console.log(`   Aktif kullanıcı: ${stats.activeUsers}`);
    console.log(`   Admin sayısı: ${stats.adminUsers}`);
    console.log(`   Manager sayısı: ${stats.managerUsers}`);
    console.log(`   Normal kullanıcı: ${stats.regularUsers}`);
    
    console.log('\n🌐 Yönetim paneline giriş:');
    console.log('   URL: http://localhost:6701/admin/login');
    console.log('   Admin - Email: admin@goldserver.com | Şifre: admin123');
    console.log('   Manager - Email: manager@goldserver.com | Şifre: manager123');
    
  } catch (error) {
    console.error('Hata:', error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
    }
  }
}

createAdminUser();