// models/JmonDashboard.js
const DateHelper = require('../utils/dateHelper');

class JmonDashboard {
  constructor(db) {
    this.collection = db.collection('jmon_dashboards');
    
    // Index oluştur
    this.collection.createIndex({ userId: 1 });
    this.collection.createIndex({ userId: 1, isDefault: 1 });
    this.collection.createIndex({ isActive: 1 });
  }

  // Yeni dashboard oluştur
  async create(data) {
    const { ObjectId } = require('mongodb');
    
    let userObjectId;
    if (typeof data.userId === 'string') {
      userObjectId = new ObjectId(data.userId);
    } else {
      userObjectId = data.userId;
    }

    // Eğer bu default dashboard ise, diğer default'ları kaldır
    if (data.isDefault) {
      await this.collection.updateMany(
        { userId: userObjectId, isDefault: true },
        { $set: { isDefault: false, updatedAt: DateHelper.createDate() } }
      );
    }

    const dashboard = {
      userId: userObjectId,
      name: data.name || 'Yeni Dashboard',
      description: data.description || '',
      isDefault: data.isDefault || false,
      isActive: true,
      
      // Grid konfigürasyonu
      gridConfig: {
        cols: data.gridConfig?.cols || 12,
        breakpoints: data.gridConfig?.breakpoints || {
          lg: 1200,
          md: 996,
          sm: 768,
          xs: 480,
          xxs: 0
        },
        rowHeight: data.gridConfig?.rowHeight || 60,
        margin: data.gridConfig?.margin || [10, 10],
        containerPadding: data.gridConfig?.containerPadding || [10, 10],
        compactType: data.gridConfig?.compactType || 'vertical',
        preventCollision: data.gridConfig?.preventCollision || false
      },
      
      // Tema konfigürasyonu
      themeConfig: {
        darkMode: data.themeConfig?.darkMode || false,
        primaryColor: data.themeConfig?.primaryColor || '#1976d2',
        secondaryColor: data.themeConfig?.secondaryColor || '#dc004e',
        backgroundColor: data.themeConfig?.backgroundColor || '#ffffff',
        surfaceColor: data.themeConfig?.surfaceColor || '#f5f5f5',
        fontFamily: data.themeConfig?.fontFamily || 'Roboto, Arial, sans-serif',
        fontSize: data.themeConfig?.fontSize || 14
      },
      
      // Dashboard ayarları
      settings: {
        autoRefresh: data.settings?.autoRefresh || false,
        refreshInterval: data.settings?.refreshInterval || 30000, // 30 saniye
        showGrid: data.settings?.showGrid || false,
        allowEdit: data.settings?.allowEdit !== false, // default true
        fullScreen: data.settings?.fullScreen || false
      },
      
      createdAt: DateHelper.createDate(),
      updatedAt: DateHelper.createDate(),
      lastAccessedAt: null,
      accessCount: 0
    };

    const result = await this.collection.insertOne(dashboard);
    return { ...dashboard, _id: result.insertedId };
  }

  // Dashboard bul
  async findById(dashboardId) {
    const { ObjectId } = require('mongodb');
    
    let dashboardObjectId;
    if (typeof dashboardId === 'string') {
      dashboardObjectId = new ObjectId(dashboardId);
    } else {
      dashboardObjectId = dashboardId;
    }
    
    return await this.collection.findOne({ 
      _id: dashboardObjectId,
      isActive: true 
    });
  }

  // Kullanıcının dashboardlarını listele
  async findByUserId(userId, options = {}) {
    const { ObjectId } = require('mongodb');
    
    let userObjectId;
    if (typeof userId === 'string') {
      userObjectId = new ObjectId(userId);
    } else {
      userObjectId = userId;
    }

    const { includeInactive = false, sortBy = 'updatedAt', sortOrder = -1 } = options;
    
    const query = { userId: userObjectId };
    if (!includeInactive) {
      query.isActive = true;
    }

    const sort = {};
    sort[sortBy] = sortOrder;

    return await this.collection.find(query)
      .sort(sort)
      .toArray();
  }

  // Kullanıcının default dashboardunu bul
  async findDefaultByUserId(userId) {
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

  // Dashboard güncelle
  async update(dashboardId, updates) {
    const { ObjectId } = require('mongodb');
    
    let dashboardObjectId;
    if (typeof dashboardId === 'string') {
      dashboardObjectId = new ObjectId(dashboardId);
    } else {
      dashboardObjectId = dashboardId;
    }

    const allowedUpdates = [
      'name', 'description', 'isDefault', 'isActive',
      'gridConfig', 'themeConfig', 'settings'
    ];

    const updateData = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        updateData[key] = updates[key];
      }
    }

    updateData.updatedAt = DateHelper.createDate();

    // Eğer bu dashboard default yapılıyorsa, diğer default'ları kaldır
    if (updates.isDefault === true) {
      const dashboard = await this.findById(dashboardId);
      if (dashboard) {
        await this.collection.updateMany(
          { userId: dashboard.userId, isDefault: true, _id: { $ne: dashboardObjectId } },
          { $set: { isDefault: false, updatedAt: DateHelper.createDate() } }
        );
      }
    }

    const result = await this.collection.updateOne(
      { _id: dashboardObjectId },
      { $set: updateData }
    );

    return result.modifiedCount > 0;
  }

  // Dashboard klonla
  async clone(dashboardId, newName) {
    const originalDashboard = await this.findById(dashboardId);
    
    if (!originalDashboard) {
      throw new Error('Dashboard bulunamadı');
    }

    const cloneData = {
      userId: originalDashboard.userId,
      name: newName || `${originalDashboard.name} - Kopya`,
      description: originalDashboard.description,
      isDefault: false, // Klonlanan dashboard default olamaz
      gridConfig: originalDashboard.gridConfig,
      themeConfig: originalDashboard.themeConfig,
      settings: originalDashboard.settings
    };

    return await this.create(cloneData);
  }

  // Dashboard erişimini kaydet
  async recordAccess(dashboardId) {
    const { ObjectId } = require('mongodb');
    
    let dashboardObjectId;
    if (typeof dashboardId === 'string') {
      dashboardObjectId = new ObjectId(dashboardId);
    } else {
      dashboardObjectId = dashboardId;
    }

    await this.collection.updateOne(
      { _id: dashboardObjectId },
      {
        $set: { lastAccessedAt: DateHelper.createDate() },
        $inc: { accessCount: 1 }
      }
    );
  }

  // Dashboard sil (soft delete)
  async deactivate(dashboardId) {
    return await this.update(dashboardId, { isActive: false });
  }

  // Dashboard tamamen sil
  async delete(dashboardId) {
    const { ObjectId } = require('mongodb');
    
    let dashboardObjectId;
    if (typeof dashboardId === 'string') {
      dashboardObjectId = new ObjectId(dashboardId);
    } else {
      dashboardObjectId = dashboardId;
    }

    // Önce bu dashboard'a ait widget'ları sil
    const JmonWidget = require('./JmonWidget');
    const widgetModel = new JmonWidget(this.collection.s.db);
    await widgetModel.deleteByDashboard(dashboardId);

    const result = await this.collection.deleteOne({ _id: dashboardObjectId });
    return result.deletedCount > 0;
  }

  // Kullanıcının tüm dashboardlarını sil
  async deleteByUserId(userId) {
    const { ObjectId } = require('mongodb');
    
    let userObjectId;
    if (typeof userId === 'string') {
      userObjectId = new ObjectId(userId);
    } else {
      userObjectId = userId;
    }

    // Önce bu kullanıcının tüm widget'ları sil
    const JmonWidget = require('./JmonWidget');
    const widgetModel = new JmonWidget(this.collection.s.db);
    
    const dashboards = await this.findByUserId(userId, { includeInactive: true });
    for (const dashboard of dashboards) {
      await widgetModel.deleteByDashboard(dashboard._id);
    }

    const result = await this.collection.deleteMany({ userId: userObjectId });
    return result.deletedCount;
  }

  // Dashboard istatistikleri
  async getStats() {
    const stats = await this.collection.aggregate([
      {
        $group: {
          _id: null,
          totalDashboards: { $sum: 1 },
          activeDashboards: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          totalAccess: { $sum: '$accessCount' },
          avgAccessPerDashboard: { $avg: '$accessCount' }
        }
      }
    ]).toArray();

    if (stats.length === 0) {
      return {
        totalDashboards: 0,
        activeDashboards: 0,
        totalAccess: 0,
        avgAccessPerDashboard: 0
      };
    }

    return {
      ...stats[0],
      avgAccessPerDashboard: Math.round(stats[0].avgAccessPerDashboard || 0)
    };
  }

  // En çok kullanılan dashboardlar
  async getMostUsed(limit = 10) {
    return await this.collection.find({ isActive: true })
      .sort({ accessCount: -1 })
      .limit(limit)
      .toArray();
  }

  // Son erişilen dashboardlar
  async getRecentlyAccessed(limit = 10) {
    return await this.collection.find({ 
      isActive: true,
      lastAccessedAt: { $ne: null }
    })
      .sort({ lastAccessedAt: -1 })
      .limit(limit)
      .toArray();
  }
}

module.exports = JmonDashboard;