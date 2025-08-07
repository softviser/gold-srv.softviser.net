// models/JmonUserMedia.js
const DateHelper = require('../utils/dateHelper');
const path = require('path');
const fs = require('fs');

class JmonUserMedia {
  constructor(db) {
    this.collection = db.collection('jmon_user_media');
    
    // Index oluştur
    this.collection.createIndex({ userId: 1 });
    this.collection.createIndex({ fileType: 1 });
    this.collection.createIndex({ mimeType: 1 });
    this.collection.createIndex({ isActive: 1 });
    this.collection.createIndex({ fileName: 1 });
  }

  // Yeni medya dosyası kaydet
  async create(data) {
    const { ObjectId } = require('mongodb');
    
    let userObjectId;
    if (typeof data.userId === 'string') {
      userObjectId = new ObjectId(data.userId);
    } else {
      userObjectId = data.userId;
    }

    const media = {
      userId: userObjectId,
      
      // Dosya bilgileri
      fileName: data.fileName,
      originalFileName: data.originalFileName || data.fileName,
      filePath: data.filePath,
      fileUrl: data.fileUrl || `/uploads/user${userObjectId}/${data.fileName}`,
      
      // Dosya meta verileri
      fileSize: data.fileSize || 0,
      mimeType: data.mimeType,
      fileType: this.getFileType(data.mimeType),
      fileExtension: path.extname(data.fileName).toLowerCase(),
      
      // Resim meta verileri (eğer resim ise)
      imageMetadata: data.imageMetadata || null, // { width, height, colorDepth, etc. }
      
      // Açıklama ve etiketler
      title: data.title || data.originalFileName,
      description: data.description || '',
      altText: data.altText || '',
      tags: data.tags || [],
      
      // Kullanım bilgileri
      isActive: true,
      isPublic: data.isPublic || false,
      allowedUses: data.allowedUses || ['widget', 'dashboard', 'profile'], // Hangi alanlarda kullanılabilir
      
      // İstatistikler
      usageCount: 0,
      downloadCount: 0,
      lastUsedAt: null,
      
      createdAt: DateHelper.createDate(),
      updatedAt: DateHelper.createDate()
    };

    const result = await this.collection.insertOne(media);
    return { ...media, _id: result.insertedId };
  }

  // MIME type'tan dosya tipini belirle
  getFileType(mimeType) {
    if (!mimeType) return 'unknown';
    
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('document') || mimeType.includes('word')) return 'document';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'spreadsheet';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'presentation';
    if (mimeType.includes('text/')) return 'text';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return 'archive';
    
    return 'file';
  }

  // Medya bul
  async findById(mediaId) {
    const { ObjectId } = require('mongodb');
    
    let mediaObjectId;
    if (typeof mediaId === 'string') {
      mediaObjectId = new ObjectId(mediaId);
    } else {
      mediaObjectId = mediaId;
    }
    
    return await this.collection.findOne({ 
      _id: mediaObjectId,
      isActive: true 
    });
  }

  // Dosya adı ile bul
  async findByFileName(fileName, userId) {
    const { ObjectId } = require('mongodb');
    
    let userObjectId;
    if (typeof userId === 'string') {
      userObjectId = new ObjectId(userId);
    } else {
      userObjectId = userId;
    }
    
    return await this.collection.findOne({
      fileName: fileName,
      userId: userObjectId,
      isActive: true
    });
  }

  // Kullanıcının medya dosyalarını listele
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
      fileType = null,
      tags = null,
      sortBy = 'updatedAt', 
      sortOrder = -1,
      limit = null,
      skip = 0,
      search = null
    } = options;
    
    const query = { userId: userObjectId };
    if (!includeInactive) {
      query.isActive = true;
    }
    if (fileType) {
      query.fileType = fileType;
    }
    if (tags && tags.length > 0) {
      query.tags = { $in: tags };
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { originalFileName: { $regex: search, $options: 'i' } }
      ];
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

  // Public medya dosyalarını listele
  async findPublicMedia(options = {}) {
    const { 
      fileType = null,
      tags = null,
      sortBy = 'usageCount', 
      sortOrder = -1,
      limit = 50,
      skip = 0
    } = options;
    
    const query = { 
      isActive: true,
      isPublic: true 
    };
    
    if (fileType) {
      query.fileType = fileType;
    }
    if (tags && tags.length > 0) {
      query.tags = { $in: tags };
    }

    const sort = {};
    sort[sortBy] = sortOrder;

    return await this.collection.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  // Medya güncelle
  async update(mediaId, updates) {
    const { ObjectId } = require('mongodb');
    
    let mediaObjectId;
    if (typeof mediaId === 'string') {
      mediaObjectId = new ObjectId(mediaId);
    } else {
      mediaObjectId = mediaId;
    }

    const allowedUpdates = [
      'title', 'description', 'altText', 'tags', 'isActive', 'isPublic',
      'allowedUses', 'imageMetadata', 'lastUsedAt'
    ];

    const updateData = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        updateData[key] = updates[key];
      }
    }

    updateData.updatedAt = DateHelper.createDate();

    const result = await this.collection.updateOne(
      { _id: mediaObjectId },
      { $set: updateData }
    );

    return result.modifiedCount > 0;
  }

  // Medya kullanımını kaydet
  async recordUsage(mediaId, usageType = 'view') {
    const { ObjectId } = require('mongodb');
    
    let mediaObjectId;
    if (typeof mediaId === 'string') {
      mediaObjectId = new ObjectId(mediaId);
    } else {
      mediaObjectId = mediaId;
    }

    const updateData = {
      lastUsedAt: DateHelper.createDate(),
      updatedAt: DateHelper.createDate()
    };

    const incData = { usageCount: 1 };
    if (usageType === 'download') {
      incData.downloadCount = 1;
    }

    const result = await this.collection.updateOne(
      { _id: mediaObjectId },
      { 
        $set: updateData,
        $inc: incData
      }
    );

    return result.modifiedCount > 0;
  }

  // Medya sil (soft delete)
  async deactivate(mediaId) {
    return await this.update(mediaId, { isActive: false });
  }

  // Medya tamamen sil (dosya sisteminden de sil)
  async delete(mediaId) {
    const { ObjectId } = require('mongodb');
    
    let mediaObjectId;
    if (typeof mediaId === 'string') {
      mediaObjectId = new ObjectId(mediaId);
    } else {
      mediaObjectId = mediaId;
    }

    // Önce medya bilgisini al
    const media = await this.findById(mediaId);
    if (!media) {
      return false;
    }

    // Dosyayı sil
    try {
      if (fs.existsSync(media.filePath)) {
        fs.unlinkSync(media.filePath);
      }
    } catch (error) {
      console.error('Dosya silinirken hata:', error);
      // Dosya silinmese bile veritabanından kaydı sil
    }

    const result = await this.collection.deleteOne({ _id: mediaObjectId });
    return result.deletedCount > 0;
  }

  // Kullanıcının tüm medya dosyalarını sil
  async deleteByUserId(userId) {
    const { ObjectId } = require('mongodb');
    
    let userObjectId;
    if (typeof userId === 'string') {
      userObjectId = new ObjectId(userId);
    } else {
      userObjectId = userId;
    }

    // Önce tüm dosyaları al
    const mediaFiles = await this.findByUserId(userId, { includeInactive: true });
    
    // Dosyaları sil
    for (const media of mediaFiles) {
      try {
        if (fs.existsSync(media.filePath)) {
          fs.unlinkSync(media.filePath);
        }
      } catch (error) {
        console.error('Dosya silinirken hata:', error);
      }
    }

    // Kullanıcı klasörünü sil (boşsa)
    try {
      const userDir = path.dirname(mediaFiles[0]?.filePath);
      if (userDir && fs.existsSync(userDir)) {
        const files = fs.readdirSync(userDir);
        if (files.length === 0) {
          fs.rmdirSync(userDir);
        }
      }
    } catch (error) {
      console.error('Kullanıcı klasörü silinirken hata:', error);
    }

    const result = await this.collection.deleteMany({ userId: userObjectId });
    return result.deletedCount;
  }

  // Dosya tiplerini listele
  async getFileTypes(userId = null) {
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

    const fileTypes = await this.collection.aggregate([
      { $match: matchQuery },
      { 
        $group: {
          _id: '$fileType',
          count: { $sum: 1 },
          totalSize: { $sum: '$fileSize' },
          lastUpdated: { $max: '$updatedAt' }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    return fileTypes.map(type => ({
      fileType: type._id,
      count: type.count,
      totalSize: type.totalSize,
      lastUpdated: type.lastUpdated
    }));
  }

  // Etiketleri listele
  async getTags(userId = null) {
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

    const tags = await this.collection.aggregate([
      { $match: matchQuery },
      { $unwind: '$tags' },
      { 
        $group: {
          _id: '$tags',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    return tags.map(tag => ({
      tag: tag._id,
      count: tag.count
    }));
  }

  // Medya istatistikleri
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
          totalFiles: { $sum: 1 },
          activeFiles: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          publicFiles: {
            $sum: { $cond: ['$isPublic', 1, 0] }
          },
          totalSize: { $sum: '$fileSize' },
          totalUsage: { $sum: '$usageCount' },
          totalDownloads: { $sum: '$downloadCount' },
          avgSizePerFile: { $avg: '$fileSize' }
        }
      }
    ]).toArray();

    if (stats.length === 0) {
      return {
        totalFiles: 0,
        activeFiles: 0,
        publicFiles: 0,
        totalSize: 0,
        totalUsage: 0,
        totalDownloads: 0,
        avgSizePerFile: 0
      };
    }

    return {
      ...stats[0],
      avgSizePerFile: Math.round(stats[0].avgSizePerFile || 0)
    };
  }

  // En çok kullanılan medya dosyaları
  async getMostUsed(limit = 10, userId = null) {
    const { ObjectId } = require('mongodb');
    
    const query = { isActive: true };
    if (userId) {
      let userObjectId;
      if (typeof userId === 'string') {
        userObjectId = new ObjectId(userId);
      } else {
        userObjectId = userId;
      }
      query.userId = userObjectId;
    }

    return await this.collection.find(query)
      .sort({ usageCount: -1 })
      .limit(limit)
      .toArray();
  }

  // Büyük dosyaları bul
  async findLargeFiles(sizeThreshold = 10 * 1024 * 1024, userId = null) { // 10MB
    const { ObjectId } = require('mongodb');
    
    const query = { 
      isActive: true,
      fileSize: { $gte: sizeThreshold }
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

    return await this.collection.find(query)
      .sort({ fileSize: -1 })
      .toArray();
  }

  // Kullanılmayan dosyaları bul
  async findUnusedFiles(daysSinceLastUse = 30, userId = null) {
    const { ObjectId } = require('mongodb');
    
    const cutoffDate = new Date(Date.now() - daysSinceLastUse * 24 * 60 * 60 * 1000);
    
    const query = { 
      isActive: true,
      $or: [
        { lastUsedAt: null },
        { lastUsedAt: { $lt: cutoffDate } }
      ]
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

    return await this.collection.find(query)
      .sort({ createdAt: 1 })
      .toArray();
  }
}

module.exports = JmonUserMedia;