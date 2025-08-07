// models/JmonSection.js
const DateHelper = require('../utils/dateHelper');

class JmonSection {
  constructor(db) {
    this.collection = db.collection('jmon_sections');
    
    // Index oluştur
    this.collection.createIndex({ userId: 1 });
    this.collection.createIndex({ sectionCode: 1 });
    this.collection.createIndex({ isActive: 1 });
    this.collection.createIndex({ displayOrder: 1 });
  }

  // Yeni section oluştur
  async create(data) {
    const { ObjectId } = require('mongodb');
    
    let userObjectId;
    if (typeof data.userId === 'string') {
      userObjectId = new ObjectId(data.userId);
    } else {
      userObjectId = data.userId;
    }

    // Aynı kullanıcıda aynı section kodu kontrolü
    if (data.sectionCode) {
      const existingSection = await this.collection.findOne({
        userId: userObjectId,
        sectionCode: data.sectionCode,
        isActive: true
      });
      
      if (existingSection) {
        throw new Error('Bu section kodu zaten kullanımda');
      }
    }

    const section = {
      userId: userObjectId,
      name: data.name,
      description: data.description || '',
      sectionCode: data.sectionCode || this.generateSectionCode(),
      
      // Görünüm ayarları
      displayConfig: {
        icon: data.displayConfig?.icon || 'folder',
        color: data.displayConfig?.color || '#3B82F6',
        backgroundColor: data.displayConfig?.backgroundColor || '#EFF6FF',
        showProductCount: data.displayConfig?.showProductCount !== false, // default true
        showLastUpdate: data.displayConfig?.showLastUpdate !== false // default true
      },
      
      // Sıralama
      displayOrder: data.displayOrder || 0,
      
      // Kategori bilgisi (fiyat kategorileri için)
      category: data.category || 'general', // 'general', 'gold', 'currency', 'crypto', 'custom'
      
      // Durum bilgileri
      isActive: true,
      isDefault: data.isDefault || false, // Varsayılan section mi
      
      // İstatistikler
      productCount: 0,
      lastProductAddedAt: null,
      
      createdAt: DateHelper.createDate(),
      updatedAt: DateHelper.createDate()
    };

    const result = await this.collection.insertOne(section);
    return { ...section, _id: result.insertedId };
  }

  // Section kodu üret
  generateSectionCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'SEC_';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Section bul
  async findById(sectionId) {
    const { ObjectId } = require('mongodb');
    
    let sectionObjectId;
    if (typeof sectionId === 'string') {
      sectionObjectId = new ObjectId(sectionId);
    } else {
      sectionObjectId = sectionId;
    }
    
    return await this.collection.findOne({ 
      _id: sectionObjectId,
      isActive: true 
    });
  }

  // Section kodu ile bul
  async findBySectionCode(sectionCode, userId = null) {
    const { ObjectId } = require('mongodb');
    
    const query = { 
      sectionCode: sectionCode,
      isActive: true 
    };
    
    if (userId) {
      let userObjectId;
      if (typeof userId === 'string') {
        userObjectId = new ObjectId(userId);
      } else {
        userObjectId = userId;
      }
      query.userId = userObjectId;
    }
    
    return await this.collection.findOne(query);
  }

  // Kullanıcının section'larını listele
  async findByUserId(userId, options = {}) {
    const { ObjectId } = require('mongodb');
    
    let userObjectId;
    if (typeof userId === 'string') {
      userObjectId = new ObjectId(userId);
    } else {
      userObjectId = userId;
    }

    const { 
      includeInactive = false, 
      category = null,
      sortBy = 'displayOrder', 
      sortOrder = 1,
      limit = null,
      skip = 0
    } = options;
    
    const query = { userId: userObjectId };
    if (!includeInactive) {
      query.isActive = true;
    }
    if (category) {
      query.category = category;
    }

    const sort = {};
    sort[sortBy] = sortOrder;

    let queryBuilder = this.collection.find(query).sort(sort);
    
    if (skip > 0) {
      queryBuilder = queryBuilder.skip(skip);
    }
    
    if (limit) {
      queryBuilder = queryBuilder.limit(limit);
    }

    return await queryBuilder.toArray();
  }

  // Section güncelle
  async update(sectionId, updates) {
    const { ObjectId } = require('mongodb');
    
    let sectionObjectId;
    if (typeof sectionId === 'string') {
      sectionObjectId = new ObjectId(sectionId);
    } else {
      sectionObjectId = sectionId;
    }

    const allowedUpdates = [
      'name', 'description', 'sectionCode', 'displayConfig', 'displayOrder',
      'category', 'isActive', 'isDefault'
    ];

    const updateData = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        updateData[key] = updates[key];
      }
    }

    updateData.updatedAt = DateHelper.createDate();

    const result = await this.collection.updateOne(
      { _id: sectionObjectId },
      { $set: updateData }
    );

    return result.modifiedCount > 0;
  }

  // Section'daki ürün sayısını güncelle
  async updateProductCount(sectionId, increment = true) {
    const { ObjectId } = require('mongodb');
    
    let sectionObjectId;
    if (typeof sectionId === 'string') {
      sectionObjectId = new ObjectId(sectionId);
    } else {
      sectionObjectId = sectionId;
    }

    const updateData = {
      updatedAt: DateHelper.createDate()
    };

    if (increment) {
      updateData.lastProductAddedAt = DateHelper.createDate();
    }

    const result = await this.collection.updateOne(
      { _id: sectionObjectId },
      { 
        $set: updateData,
        $inc: { productCount: increment ? 1 : -1 }
      }
    );

    return result.modifiedCount > 0;
  }

  // Section sil (soft delete)
  async deactivate(sectionId) {
    return await this.update(sectionId, { isActive: false });
  }

  // Section tamamen sil
  async delete(sectionId) {
    const { ObjectId } = require('mongodb');
    
    let sectionObjectId;
    if (typeof sectionId === 'string') {
      sectionObjectId = new ObjectId(sectionId);
    } else {
      sectionObjectId = sectionId;
    }

    const result = await this.collection.deleteOne({ _id: sectionObjectId });
    return result.deletedCount > 0;
  }

  // Kullanıcının tüm section'larını sil
  async deleteByUserId(userId) {
    const { ObjectId } = require('mongodb');
    
    let userObjectId;
    if (typeof userId === 'string') {
      userObjectId = new ObjectId(userId);
    } else {
      userObjectId = userId;
    }

    const result = await this.collection.deleteMany({ userId: userObjectId });
    return result.deletedCount;
  }

  // Kategorileri listele
  async getCategories(userId = null) {
    const { ObjectId } = require('mongodb');
    
    const matchQuery = { isActive: true };
    if (userId) {
      let userObjectId;
      if (typeof userId === 'string') {
        userObjectId = new ObjectId(userId);
      } else {
        userObjectId = userId;
      }
      matchQuery.userId = userObjectId;
    }

    const categories = await this.collection.aggregate([
      { $match: matchQuery },
      { 
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalProducts: { $sum: '$productCount' },
          lastUpdated: { $max: '$updatedAt' }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    return categories.map(cat => ({
      category: cat._id,
      sectionCount: cat.count,
      totalProducts: cat.totalProducts,
      lastUpdated: cat.lastUpdated
    }));
  }

  // Section istatistikleri
  async getStats(userId = null) {
    const { ObjectId } = require('mongodb');
    
    const matchQuery = {};
    if (userId) {
      let userObjectId;
      if (typeof userId === 'string') {
        userObjectId = new ObjectId(userId);
      } else {
        userObjectId = userId;
      }
      matchQuery.userId = userObjectId;
    }

    const stats = await this.collection.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalSections: { $sum: 1 },
          activeSections: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          totalProducts: { $sum: '$productCount' },
          avgProductsPerSection: { $avg: '$productCount' }
        }
      }
    ]).toArray();

    if (stats.length === 0) {
      return {
        totalSections: 0,
        activeSections: 0,
        totalProducts: 0,
        avgProductsPerSection: 0
      };
    }

    return {
      ...stats[0],
      avgProductsPerSection: Math.round(stats[0].avgProductsPerSection || 0)
    };
  }

  // Varsayılan section'ı belirle
  async setDefault(sectionId, userId) {
    const { ObjectId } = require('mongodb');
    
    let userObjectId;
    if (typeof userId === 'string') {
      userObjectId = new ObjectId(userId);
    } else {
      userObjectId = userId;
    }

    let sectionObjectId;
    if (typeof sectionId === 'string') {
      sectionObjectId = new ObjectId(sectionId);
    } else {
      sectionObjectId = sectionId;
    }

    // Önce tüm section'ların default'unu kaldır
    await this.collection.updateMany(
      { userId: userObjectId },
      { $set: { isDefault: false, updatedAt: DateHelper.createDate() } }
    );

    // Seçilen section'ı default yap
    const result = await this.collection.updateOne(
      { _id: sectionObjectId, userId: userObjectId },
      { $set: { isDefault: true, updatedAt: DateHelper.createDate() } }
    );

    return result.modifiedCount > 0;
  }

  // Varsayılan section'ı al
  async getDefault(userId) {
    const { ObjectId } = require('mongodb');
    
    let userObjectId;
    if (typeof userId === 'string') {
      userObjectId = new ObjectId(userId);
    } else {
      userObjectId = userId;
    }

    return await this.collection.findOne({
      userId: userObjectId,
      isDefault: true,
      isActive: true
    });
  }
}

module.exports = JmonSection;