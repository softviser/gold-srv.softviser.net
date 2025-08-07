// models/JmonUser.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const DateHelper = require('../utils/dateHelper');

class JmonUser {
  constructor(db) {
    this.collection = db.collection('jmon_users');
    
    // Index oluştur
    this.collection.createIndex({ token: 1 }, { unique: true });
    this.collection.createIndex({ tokenId: 1 }); // API Token ID referansı
    this.collection.createIndex({ username: 1 }, { unique: true });
    this.collection.createIndex({ email: 1 }, { unique: true });
    this.collection.createIndex({ domain: 1 });
    this.collection.createIndex({ isActive: 1 });
    this.collection.createIndex({ expiresAt: 1 });
  }

  // Yeni dashboard kullanıcısı oluştur
  async create(data) {
    // Kullanıcı adı kontrolü
    const existingUser = await this.collection.findOne({ 
      $or: [
        { username: data.username },
        { email: data.email }
      ]
    });
    
    if (existingUser) {
      throw new Error('Bu kullanıcı adı veya email adresi zaten kullanımda');
    }

    // Şifre hashle
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = {
      // ApiToken referansı
      tokenId: data.tokenId || null, // API Token ID referansı
      
      // ApiToken özellikleri
      token: data.token || this.generateToken(),
      domain: data.domain,
      permissions: data.permissions || ['read'], // ['read', 'write', 'subscribe']
      allowedChannels: data.allowedChannels || ['*'],
      rateLimit: data.rateLimit || {
        requests: 1000,
        window: 60 // saniye
      },
      isActive: true,
      createdAt: DateHelper.createDate(),
      updatedAt: DateHelper.createDate(),
      expiresAt: data.expiresAt || null,
      lastUsedAt: null,
      usageCount: 0,
      metadata: data.metadata || {},

      // Dashboard kullanıcı özellikleri
      username: data.username,
      password: hashedPassword,
      email: data.email,
      lastLoginAt: null,
      loginCount: 0,
      
/*       // Dashboard ayarları
      dashboardPreferences: {
        theme: data.theme || 'light',
        language: data.language || 'tr',
        timezone: data.timezone || 'Europe/Istanbul'
      } */
    };

    const result = await this.collection.insertOne(user);
    
    // Şifreyi response'dan çıkar
    const { password, ...userWithoutPassword } = user;
    return { ...userWithoutPassword, _id: result.insertedId };
  }

  // Token üret
  generateToken() {
    return 'jmon_' + crypto.randomBytes(32).toString('hex');
  }

  // Token ile doğrulama (API erişimi için)
  async validateByToken(token, domain = null) {
    const query = {
      token: token,
      isActive: true,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: DateHelper.createDate() } }
      ]
    };

    let user = await this.collection.findOne(query);

    // Domain kontrolü
    if (user && domain) {
      if (user.domain !== '*' && user.domain !== domain && 
          !domain.includes(user.domain) && !user.domain.includes('localhost')) {
        console.log(`[JmonUser] Domain uyumsuzluğu: token=${user.domain}, istek=${domain}`);
        return null;
      }
    }

    if (user) {
      // Kullanım bilgilerini güncelle
      await this.collection.updateOne(
        { _id: user._id },
        {
          $set: { lastUsedAt: DateHelper.createDate() },
          $inc: { usageCount: 1 }
        }
      );
      
      // Şifreyi response'dan çıkar
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    }

    return null;
  }

  // Kullanıcı adı ve şifre ile giriş (Dashboard erişimi için)
  async login(username, password) {
    const user = await this.collection.findOne({ 
      username: username,
      isActive: true,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: DateHelper.createDate() } }
      ]
    });

    if (!user) {
      throw new Error('Kullanıcı bulunamadı veya hesap pasif');
    }

    // Şifre kontrolü
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      throw new Error('Geçersiz şifre');
    }

    // Giriş bilgilerini güncelle
    await this.collection.updateOne(
      { _id: user._id },
      { 
        $set: { 
          lastLoginAt: DateHelper.createDate(),
          updatedAt: DateHelper.createDate()
        },
        $inc: { loginCount: 1 }
      }
    );

    // Şifreyi response'dan çıkar
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // ID ile kullanıcı bul
  async findById(userId) {
    const { ObjectId } = require('mongodb');
    
    let query;
    if (typeof userId === 'string') {
      query = { _id: new ObjectId(userId) };
    } else {
      query = { _id: userId };
    }
    
    const user = await this.collection.findOne(query);
    if (user) {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    }
    return null;
  }

  // Token ile kullanıcı bul
  async findByToken(token) {
    const user = await this.collection.findOne({ token: token });
    if (user) {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    }
    return null;
  }

  // TokenId ile kullanıcıları bul
  async findByTokenId(tokenId) {
    const { ObjectId } = require('mongodb');
    
    let query;
    if (typeof tokenId === 'string') {
      query = { tokenId: new ObjectId(tokenId) };
    } else {
      query = { tokenId: tokenId };
    }
    
    const users = await this.collection.find(query).toArray();
    return users.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
  }

  // Kullanıcı güncelle
  async update(userId, updates) {
    const { ObjectId } = require('mongodb');
    
    let userObjectId;
    if (typeof userId === 'string') {
      userObjectId = new ObjectId(userId);
    } else {
      userObjectId = userId;
    }

    const allowedUpdates = [
      'username', 'email', 'domain', 'permissions', 'allowedChannels',
      'rateLimit', 'isActive', 'expiresAt', 'metadata', 'dashboardPreferences', 'tokenId'
    ];

    const updateData = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        updateData[key] = updates[key];
      }
    }

    // Şifre güncelleme
    if (updates.password) {
      updateData.password = await bcrypt.hash(updates.password, 10);
    }

    updateData.updatedAt = DateHelper.createDate();

    const result = await this.collection.updateOne(
      { _id: userObjectId },
      { $set: updateData }
    );

    return result.modifiedCount > 0;
  }

  // Şifre değiştir
  async changePassword(userId, newPassword) {
    const { ObjectId } = require('mongodb');
    
    let userObjectId;
    if (typeof userId === 'string') {
      userObjectId = new ObjectId(userId);
    } else {
      userObjectId = userId;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const result = await this.collection.updateOne(
      { _id: userObjectId },
      { 
        $set: { 
          password: hashedPassword,
          updatedAt: DateHelper.createDate()
        }
      }
    );

    return result.modifiedCount > 0;
  }

  // Kullanıcı listele
  async list(options = {}) {
    const { skip = 0, limit = 50, isActive = null } = options;
    
    const query = {};
    if (isActive !== null) query.isActive = isActive;

    const users = await this.collection.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Şifreleri çıkar
    return users.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
  }

  // Kullanıcı deaktif et
  async deactivate(userId) {
    return await this.update(userId, { isActive: false });
  }

  // Kullanıcı sil
  async delete(userId) {
    const { ObjectId } = require('mongodb');
    
    let userObjectId;
    if (typeof userId === 'string') {
      userObjectId = new ObjectId(userId);
    } else {
      userObjectId = userId;
    }

    const result = await this.collection.deleteOne({ _id: userObjectId });
    return result.deletedCount > 0;
  }

  // İstatistikler
  async getStats() {
    const stats = await this.collection.aggregate([
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          activeUsers: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          recentLogins: {
            $sum: { 
              $cond: [
                { $gte: ['$lastLoginAt', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] }, 
                1, 
                0
              ] 
            }
          },
          totalUsage: { $sum: '$usageCount' }
        }
      }
    ]).toArray();

    if (stats.length === 0) {
      return {
        totalUsers: 0,
        activeUsers: 0,
        recentLogins: 0,
        totalUsage: 0
      };
    }

    return stats[0];
  }

  // Süresi dolmuş kullanıcıları temizle
  async cleanupExpired() {
    const result = await this.collection.deleteMany({
      expiresAt: { $lt: DateHelper.createDate() }
    });

    return result.deletedCount;
  }

  // Rate limit kontrolü
  async checkRateLimit(userId, redisClient) {
    const user = await this.findById(userId);
    
    if (!user || !user.rateLimit) return true;

    const key = `jmon_rate_limit:${userId}`;
    const current = await redisClient.incr(key);
    
    if (current === 1) {
      await redisClient.expire(key, user.rateLimit.window);
    }

    return current <= user.rateLimit.requests;
  }
}

module.exports = JmonUser;