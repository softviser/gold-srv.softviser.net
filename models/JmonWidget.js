// models/JmonWidget.js
const DateHelper = require('../utils/dateHelper');

class JmonWidget {
  constructor(db) {
    this.collection = db.collection('jmon_widgets');
    
    // Index oluştur
    this.collection.createIndex({ dashboardId: 1 });
    this.collection.createIndex({ userId: 1 });
    this.collection.createIndex({ widgetType: 1 });
    this.collection.createIndex({ sortOrder: 1 });
    this.collection.createIndex({ isActive: 1 });
  }

  // Yeni widget oluştur
  async create(data) {
    const { ObjectId } = require('mongodb');
    
    let dashboardObjectId, userObjectId;
    
    if (typeof data.dashboardId === 'string') {
      dashboardObjectId = new ObjectId(data.dashboardId);
    } else {
      dashboardObjectId = data.dashboardId;
    }

    if (typeof data.userId === 'string') {
      userObjectId = new ObjectId(data.userId);
    } else {
      userObjectId = data.userId;
    }

    // Eğer sortOrder belirtilmemişse, en son sırayı al
    let sortOrder = data.sortOrder;
    if (sortOrder === undefined) {
      const lastWidget = await this.collection.findOne(
        { dashboardId: dashboardObjectId },
        { sort: { sortOrder: -1 } }
      );
      sortOrder = lastWidget ? lastWidget.sortOrder + 1 : 0;
    }

    const widget = {
      dashboardId: dashboardObjectId,
      userId: userObjectId,
      widgetType: data.widgetType, // 'price-list', 'calculator', 'image', 'text', 'chart', 'custom-product'
      isActive: true,
      
      // Pozisyon konfigürasyonu (React-Grid-Layout için)
      positionConfig: {
        x: data.positionConfig?.x || 0,
        y: data.positionConfig?.y || 0,
        w: data.positionConfig?.w || 4,
        h: data.positionConfig?.h || 2,
        minW: data.positionConfig?.minW || 2,
        minH: data.positionConfig?.minH || 1,
        maxW: data.positionConfig?.maxW || null,
        maxH: data.positionConfig?.maxH || null,
        static: data.positionConfig?.static || false,
        isDraggable: data.positionConfig?.isDraggable !== false, // default true
        isResizable: data.positionConfig?.isResizable !== false  // default true
      },
      
      // Widget konfigürasyonu
      widgetConfig: this.getDefaultWidgetConfig(data.widgetType, data.widgetConfig),
      
      // Görsel ayarları
      styleConfig: {
        backgroundColor: data.styleConfig?.backgroundColor || '#ffffff',
        borderColor: data.styleConfig?.borderColor || '#e0e0e0',
        borderWidth: data.styleConfig?.borderWidth || 1,
        borderRadius: data.styleConfig?.borderRadius || 4,
        padding: data.styleConfig?.padding || 16,
        margin: data.styleConfig?.margin || 8,
        shadow: data.styleConfig?.shadow || 'none', // 'none', 'small', 'medium', 'large'
        opacity: data.styleConfig?.opacity || 1
      },
      
      sortOrder: sortOrder,
      createdAt: DateHelper.createDate(),
      updatedAt: DateHelper.createDate(),
      lastRefreshedAt: null
    };

    const result = await this.collection.insertOne(widget);
    return { ...widget, _id: result.insertedId };
  }

  // Widget tipine göre default konfigürasyon
  getDefaultWidgetConfig(widgetType, customConfig = {}) {
    const defaultConfigs = {
      'price-list': {
        title: 'Fiyat Listesi',
        showTitle: true,
        refreshInterval: 5000,
        symbols: ['HAS/TRY', 'USD/TRY', 'EUR/TRY'], // Gösterilecek semboller
        showBuyingSelling: true,
        showChangePercentage: true,
        showLastUpdate: true,
        priceFormat: {
          decimalPlaces: 2,
          prefix: '',
          suffix: ' ₺'
        },
        colorConfig: {
          positiveColor: '#4caf50',
          negativeColor: '#f44336',
          neutralColor: '#666666'
        }
      },
      
      'calculator': {
        title: 'Fiyat Hesaplayıcı',
        showTitle: true,
        calculationType: 'gold', // 'gold', 'currency', 'custom'
        baseSymbol: 'HAS/TRY',
        multiplier: 1,
        showFormula: true,
        resultFormat: {
          decimalPlaces: 2,
          prefix: '',
          suffix: ' ₺'
        }
      },
      
      'image': {
        title: 'Resim',
        showTitle: true,
        imageUrl: '',
        altText: '',
        fit: 'contain', // 'cover', 'contain', 'fill', 'scale-down'
        alignment: 'center', // 'left', 'center', 'right'
        clickAction: 'none', // 'none', 'link', 'modal'
        clickUrl: ''
      },
      
      'text': {
        title: 'Metin',
        showTitle: true,
        content: '<p>Metin içeriği buraya yazılacak</p>',
        textAlign: 'left', // 'left', 'center', 'right', 'justify'
        fontSize: 14,
        fontWeight: 'normal', // 'normal', 'bold'
        color: '#333333',
        allowHtml: true
      },
      
      'chart': {
        title: 'Grafik',
        showTitle: true,
        chartType: 'line', // 'line', 'bar', 'pie', 'area'
        dataSource: 'price-history', // 'price-history', 'custom'
        symbol: 'HAS/TRY',
        timeRange: '1d', // '1h', '1d', '1w', '1m'
        showGrid: true,
        showLegend: true,
        colors: ['#1976d2', '#dc004e', '#388e3c']
      },
      
      'custom-product': {
        title: 'Özel Ürün',
        showTitle: true,
        productIds: [], // JmonUserProduct ID'leri
        refreshInterval: 5000,
        showFormula: false,
        showLastUpdate: true,
        layout: 'list', // 'list', 'grid', 'table'
        priceFormat: {
          decimalPlaces: 2,
          prefix: '',
          suffix: ' ₺'
        }
      }
    };

    const defaultConfig = defaultConfigs[widgetType] || {};
    return { ...defaultConfig, ...customConfig };
  }

  // Widget bul
  async findById(widgetId) {
    const { ObjectId } = require('mongodb');
    
    let widgetObjectId;
    if (typeof widgetId === 'string') {
      widgetObjectId = new ObjectId(widgetId);
    } else {
      widgetObjectId = widgetId;
    }
    
    return await this.collection.findOne({ 
      _id: widgetObjectId,
      isActive: true 
    });
  }

  // Dashboard'a ait widget'ları listele
  async findByDashboardId(dashboardId, options = {}) {
    const { ObjectId } = require('mongodb');
    
    let dashboardObjectId;
    if (typeof dashboardId === 'string') {
      dashboardObjectId = new ObjectId(dashboardId);
    } else {
      dashboardObjectId = dashboardId;
    }

    const { includeInactive = false, widgetType = null } = options;
    
    const query = { dashboardId: dashboardObjectId };
    if (!includeInactive) {
      query.isActive = true;
    }
    if (widgetType) {
      query.widgetType = widgetType;
    }

    return await this.collection.find(query)
      .sort({ sortOrder: 1 })
      .toArray();
  }

  // Kullanıcının tüm widget'larını listele
  async findByUserId(userId, options = {}) {
    const { ObjectId } = require('mongodb');
    
    let userObjectId;
    if (typeof userId === 'string') {
      userObjectId = new ObjectId(userId);
    } else {
      userObjectId = userId;
    }

    const { includeInactive = false, widgetType = null } = options;
    
    const query = { userId: userObjectId };
    if (!includeInactive) {
      query.isActive = true;
    }
    if (widgetType) {
      query.widgetType = widgetType;
    }

    return await this.collection.find(query)
      .sort({ updatedAt: -1 })
      .toArray();
  }

  // Widget güncelle
  async update(widgetId, updates) {
    const { ObjectId } = require('mongodb');
    
    let widgetObjectId;
    if (typeof widgetId === 'string') {
      widgetObjectId = new ObjectId(widgetId);
    } else {
      widgetObjectId = widgetId;
    }

    const allowedUpdates = [
      'widgetType', 'isActive', 'positionConfig', 'widgetConfig', 
      'styleConfig', 'sortOrder', 'lastRefreshedAt'
    ];

    const updateData = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        updateData[key] = updates[key];
      }
    }

    updateData.updatedAt = DateHelper.createDate();

    const result = await this.collection.updateOne(
      { _id: widgetObjectId },
      { $set: updateData }
    );

    return result.modifiedCount > 0;
  }

  // Widget pozisyonlarını toplu güncelle
  async updatePositions(dashboardId, positions) {
    const { ObjectId } = require('mongodb');
    
    let dashboardObjectId;
    if (typeof dashboardId === 'string') {
      dashboardObjectId = new ObjectId(dashboardId);
    } else {
      dashboardObjectId = dashboardId;
    }

    const bulkOps = positions.map(pos => ({
      updateOne: {
        filter: { 
          _id: typeof pos.id === 'string' ? new ObjectId(pos.id) : pos.id,
          dashboardId: dashboardObjectId
        },
        update: {
          $set: {
            'positionConfig.x': pos.x,
            'positionConfig.y': pos.y,
            'positionConfig.w': pos.w,
            'positionConfig.h': pos.h,
            updatedAt: DateHelper.createDate()
          }
        }
      }
    }));

    if (bulkOps.length > 0) {
      const result = await this.collection.bulkWrite(bulkOps);
      return result.modifiedCount;
    }

    return 0;
  }

  // Widget klonla
  async clone(widgetId, targetDashboardId = null) {
    const originalWidget = await this.findById(widgetId);
    
    if (!originalWidget) {
      throw new Error('Widget bulunamadı');
    }

    const cloneData = {
      dashboardId: targetDashboardId || originalWidget.dashboardId,
      userId: originalWidget.userId,
      widgetType: originalWidget.widgetType,
      positionConfig: {
        ...originalWidget.positionConfig,
        x: originalWidget.positionConfig.x + 1, // Yanına yerleştir
        y: originalWidget.positionConfig.y + 1
      },
      widgetConfig: {
        ...originalWidget.widgetConfig,
        title: `${originalWidget.widgetConfig.title} - Kopya`
      },
      styleConfig: originalWidget.styleConfig
    };

    return await this.create(cloneData);
  }

  // Widget sil (soft delete)
  async deactivate(widgetId) {
    return await this.update(widgetId, { isActive: false });
  }

  // Widget tamamen sil
  async delete(widgetId) {
    const { ObjectId } = require('mongodb');
    
    let widgetObjectId;
    if (typeof widgetId === 'string') {
      widgetObjectId = new ObjectId(widgetId);
    } else {
      widgetObjectId = widgetId;
    }

    const result = await this.collection.deleteOne({ _id: widgetObjectId });
    return result.deletedCount > 0;
  }

  // Dashboard'a ait tüm widget'ları sil
  async deleteByDashboard(dashboardId) {
    const { ObjectId } = require('mongodb');
    
    let dashboardObjectId;
    if (typeof dashboardId === 'string') {
      dashboardObjectId = new ObjectId(dashboardId);
    } else {
      dashboardObjectId = dashboardId;
    }

    const result = await this.collection.deleteMany({ dashboardId: dashboardObjectId });
    return result.deletedCount;
  }

  // Kullanıcının tüm widget'larını sil
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

  // Widget istatistikleri
  async getStats() {
    const stats = await this.collection.aggregate([
      {
        $group: {
          _id: null,
          totalWidgets: { $sum: 1 },
          activeWidgets: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          widgetsByType: {
            $push: '$widgetType'
          }
        }
      }
    ]).toArray();

    if (stats.length === 0) {
      return {
        totalWidgets: 0,
        activeWidgets: 0,
        widgetTypeStats: {}
      };
    }

    // Widget tip istatistikleri
    const widgetTypeStats = stats[0].widgetsByType.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    return {
      totalWidgets: stats[0].totalWidgets,
      activeWidgets: stats[0].activeWidgets,
      widgetTypeStats: widgetTypeStats
    };
  }

  // En çok kullanılan widget tipleri
  async getMostUsedTypes(limit = 10) {
    return await this.collection.aggregate([
      { $match: { isActive: true } },
      { 
        $group: {
          _id: '$widgetType',
          count: { $sum: 1 },
          lastUsed: { $max: '$updatedAt' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: limit }
    ]).toArray();
  }
}

module.exports = JmonWidget;