const crypto = require('crypto');
const DateHelper = require('../utils/dateHelper');

class ApiToken {
  constructor(db) {
    this.collection = db.collection('api_tokens');
    
    // Index oluştur
    this.collection.createIndex({ token: 1 }, { unique: true });
    this.collection.createIndex({ domain: 1 });
    this.collection.createIndex({ isActive: 1 });
    this.collection.createIndex({ expiresAt: 1 });
  }

  // Yeni token oluştur
  async create(data) {
    const token = {
      token: data.token || this.generateToken(),
      domain: data.domain,
      name: data.name || data.domain,
      description: data.description || '',
      permissions: data.permissions || ['read'], // ['read', 'write', 'subscribe']
      allowedChannels: data.allowedChannels || ['*'], // ['*'] tüm kanallar, ['prices', 'market'] belirli kanallar
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
      metadata: data.metadata || {}
    };

    const result = await this.collection.insertOne(token);
    return { ...token, _id: result.insertedId };
  }

  // Token üret
  generateToken() {
    return 'sk_' + crypto.randomBytes(32).toString('hex');
  }

  // Token doğrula
  async validate(token, domain = null) {
    const query = {
      token: token,
      isActive: true,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: DateHelper.createDate() } }
      ]
    };

    // Önce domain kontrolü olmadan dene
    let apiToken = await this.collection.findOne(query);

    // Eğer domain belirtilmişse ve token bulunmuşsa, domain uyumluluğunu kontrol et
    if (apiToken && domain) {
      // Eğer token'ın domain'i '*' ise veya aynıysa kabul et
      if (apiToken.domain !== '*' && apiToken.domain !== domain && 
          !domain.includes(apiToken.domain) && !apiToken.domain.includes('localhost')) {
        console.log(`[ApiToken] Domain uyumsuzluğu: token=${apiToken.domain}, istek=${domain}`);
        return null;
      }
    }

    if (apiToken) {
      // Kullanım bilgilerini güncelle
      await this.collection.updateOne(
        { _id: apiToken._id },
        {
          $set: { lastUsedAt: DateHelper.createDate() },
          $inc: { usageCount: 1 }
        }
      );
    }

    return apiToken;
  }

  // Domain'e göre token listele
  async findByDomain(domain) {
    return await this.collection.find({
      domain: domain,
      isActive: true
    }).toArray();
  }

  // Token güncelle
  async update(tokenId, updates) {
    const allowedUpdates = [
      'name', 'description', 'permissions', 'allowedChannels',
      'rateLimit', 'isActive', 'expiresAt', 'metadata'
    ];

    const updateData = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        updateData[key] = updates[key];
      }
    }

    updateData.updatedAt = DateHelper.createDate();

    const result = await this.collection.updateOne(
      { _id: tokenId },
      { $set: updateData }
    );

    return result.modifiedCount > 0;
  }

  // Token sil (soft delete)
  async deactivate(tokenId) {
    return await this.update(tokenId, { isActive: false });
  }

  // Token'ı tamamen sil
  async delete(tokenId) {
    const result = await this.collection.deleteOne({ _id: tokenId });
    return result.deletedCount > 0;
  }

  // Tüm aktif tokenları listele
  async listActive(options = {}) {
    const { skip = 0, limit = 50, sort = { createdAt: -1 } } = options;
    
    return await this.collection.find({
      isActive: true
    })
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .toArray();
  }

  // Token istatistikleri
  async getStats(tokenId) {
    const token = await this.collection.findOne({ _id: tokenId });
    
    if (!token) return null;

    return {
      token: token.token.substring(0, 10) + '...',
      domain: token.domain,
      createdAt: token.createdAt,
      lastUsedAt: token.lastUsedAt,
      usageCount: token.usageCount,
      isActive: token.isActive,
      expiresAt: token.expiresAt,
      permissions: token.permissions,
      allowedChannels: token.allowedChannels
    };
  }

  // Rate limit kontrolü
  async checkRateLimit(tokenId, redisClient) {
    const token = await this.collection.findOne({ _id: tokenId });
    
    if (!token || !token.rateLimit) return true;

    const key = `rate_limit:${tokenId}`;
    const current = await redisClient.incr(key);
    
    if (current === 1) {
      await redisClient.expire(key, token.rateLimit.window);
    }

    return current <= token.rateLimit.requests;
  }

  // Süresi dolmuş tokenları temizle
  async cleanupExpired() {
    const result = await this.collection.deleteMany({
      expiresAt: { $lt: DateHelper.createDate() }
    });

    return result.deletedCount;
  }
}

module.exports = ApiToken;