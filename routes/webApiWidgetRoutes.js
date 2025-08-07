const express = require('express');
const LoggerHelper = require('../utils/logger');
const { authenticateJWT } = require('./webApiAuthRoutes');

function createWebApiWidgetRoutes(db) {
  const router = express.Router();

  // Models
  const JmonDashboard = require('../models/JmonDashboard');
  const JmonWidget = require('../models/JmonWidget');

  const jmonDashboard = new JmonDashboard(db);
  const jmonWidget = new JmonWidget(db);

  // Apply JWT authentication to all routes
  router.use(authenticateJWT);

  // Helper function to check dashboard ownership
  async function checkDashboardAccess(dashboardId, userId) {
    const dashboard = await jmonDashboard.findById(dashboardId);
    return dashboard && dashboard.userId.toString() === userId;
  }

  // Helper function to check widget ownership
  async function checkWidgetAccess(widgetId, userId) {
    const widget = await jmonWidget.findById(widgetId);
    return widget && widget.userId.toString() === userId;
  }

  // =================== WIDGET ROUTES ===================

  // Get widgets for a dashboard
  router.get('/dashboards/:dashboardId/widgets', async (req, res) => {
    try {
      const dashboardId = req.params.dashboardId;
      const userId = req.user.userId;

      // Check dashboard access
      if (!(await checkDashboardAccess(dashboardId, userId))) {
        return res.status(403).json({
          success: false,
          error: 'Bu dashboard\'a erişim yetkiniz yok'
        });
      }

      const options = {
        includeInactive: req.query.includeInactive === 'true',
        widgetType: req.query.widgetType || null
      };

      const widgets = await jmonWidget.findByDashboardId(dashboardId, options);

      res.json({
        success: true,
        data: widgets
      });

    } catch (error) {
      LoggerHelper.logError('webapi-widget', error, 'Get widgets error');
      
      res.status(500).json({
        success: false,
        error: 'Widget listesi alınamadı'
      });
    }
  });

  // Get specific widget
  router.get('//:id', async (req, res) => {
    try {
      const widgetId = req.params.id;
      const userId = req.user.userId;

      const widget = await jmonWidget.findById(widgetId);

      if (!widget) {
        return res.status(404).json({
          success: false,
          error: 'Widget bulunamadı'
        });
      }

      // Check widget ownership
      if (widget.userId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Bu widget\'a erişim yetkiniz yok'
        });
      }

      res.json({
        success: true,
        data: widget
      });

    } catch (error) {
      LoggerHelper.logError('webapi-widget', error, 'Get widget error');
      
      res.status(500).json({
        success: false,
        error: 'Widget bilgisi alınamadı'
      });
    }
  });

  // Create new widget
  router.post('/', async (req, res) => {
    try {
      const userId = req.user.userId;
      const {
        dashboardId,
        widgetType,
        positionConfig,
        widgetConfig,
        styleConfig,
        sortOrder
      } = req.body;

      if (!dashboardId || !widgetType) {
        return res.status(400).json({
          success: false,
          error: 'Dashboard ID ve widget tipi gereklidir'
        });
      }

      // Check dashboard access
      if (!(await checkDashboardAccess(dashboardId, userId))) {
        return res.status(403).json({
          success: false,
          error: 'Bu dashboard\'a widget eklemek için yetkiniz yok'
        });
      }

      // Validate widget type
      const validTypes = ['price-list', 'calculator', 'image', 'text', 'chart', 'custom-product'];
      if (!validTypes.includes(widgetType)) {
        return res.status(400).json({
          success: false,
          error: 'Geçersiz widget tipi'
        });
      }

      const widgetData = {
        dashboardId,
        userId,
        widgetType,
        positionConfig,
        widgetConfig,
        styleConfig,
        sortOrder
      };

      const widget = await jmonWidget.create(widgetData);

      res.json({
        success: true,
        data: widget
      });

      LoggerHelper.logInfo('webapi-widget', `Widget created: ${widgetType} on dashboard ${dashboardId} by user ${req.user.username}`);

    } catch (error) {
      LoggerHelper.logError('webapi-widget', error, 'Create widget error');
      
      res.status(500).json({
        success: false,
        error: 'Widget oluşturulamadı'
      });
    }
  });

  // Update widget
  router.put('//:id', async (req, res) => {
    try {
      const widgetId = req.params.id;
      const userId = req.user.userId;

      // Check widget ownership
      if (!(await checkWidgetAccess(widgetId, userId))) {
        return res.status(403).json({
          success: false,
          error: 'Bu widget\'ı güncellemek için yetkiniz yok'
        });
      }

      const {
        widgetType,
        positionConfig,
        widgetConfig,
        styleConfig,
        sortOrder,
        isActive
      } = req.body;

      const updates = {};
      if (widgetType !== undefined) updates.widgetType = widgetType;
      if (positionConfig !== undefined) updates.positionConfig = positionConfig;
      if (widgetConfig !== undefined) updates.widgetConfig = widgetConfig;
      if (styleConfig !== undefined) updates.styleConfig = styleConfig;
      if (sortOrder !== undefined) updates.sortOrder = sortOrder;
      if (isActive !== undefined) updates.isActive = isActive;

      const success = await jmonWidget.update(widgetId, updates);

      if (success) {
        const updatedWidget = await jmonWidget.findById(widgetId);
        
        res.json({
          success: true,
          data: updatedWidget
        });

        LoggerHelper.logInfo('webapi-widget', `Widget updated: ${widgetId} by user ${req.user.username}`);
      } else {
        res.status(400).json({
          success: false,
          error: 'Widget güncellenemedi'
        });
      }

    } catch (error) {
      LoggerHelper.logError('webapi-widget', error, 'Update widget error');
      
      res.status(500).json({
        success: false,
        error: 'Widget güncellenirken hata oluştu'
      });
    }
  });

  // Update widget positions (bulk update)
  router.put('/dashboards/:dashboardId/widgets/positions', async (req, res) => {
    try {
      const dashboardId = req.params.dashboardId;
      const userId = req.user.userId;
      const { positions } = req.body;

      // Check dashboard access
      if (!(await checkDashboardAccess(dashboardId, userId))) {
        return res.status(403).json({
          success: false,
          error: 'Bu dashboard\'daki widget pozisyonlarını güncellemek için yetkiniz yok'
        });
      }

      if (!positions || !Array.isArray(positions)) {
        return res.status(400).json({
          success: false,
          error: 'Pozisyon bilgileri gereklidir'
        });
      }

      const modifiedCount = await jmonWidget.updatePositions(dashboardId, positions);

      res.json({
        success: true,
        data: {
          modifiedCount,
          message: `${modifiedCount} widget pozisyonu güncellendi`
        }
      });

      LoggerHelper.logInfo('webapi-widget', `Widget positions updated on dashboard ${dashboardId} by user ${req.user.username}`);

    } catch (error) {
      LoggerHelper.logError('webapi-widget', error, 'Update widget positions error');
      
      res.status(500).json({
        success: false,
        error: 'Widget pozisyonları güncellenirken hata oluştu'
      });
    }
  });

  // Clone widget
  router.post('//:id/clone', async (req, res) => {
    try {
      const widgetId = req.params.id;
      const userId = req.user.userId;
      const { targetDashboardId } = req.body;

      // Check widget ownership
      if (!(await checkWidgetAccess(widgetId, userId))) {
        return res.status(403).json({
          success: false,
          error: 'Bu widget\'ı klonlamak için yetkiniz yok'
        });
      }

      // If target dashboard specified, check access
      if (targetDashboardId && !(await checkDashboardAccess(targetDashboardId, userId))) {
        return res.status(403).json({
          success: false,
          error: 'Hedef dashboard\'a erişim yetkiniz yok'
        });
      }

      const clonedWidget = await jmonWidget.clone(widgetId, targetDashboardId);

      res.json({
        success: true,
        data: clonedWidget
      });

      LoggerHelper.logInfo('webapi-widget', `Widget cloned: ${widgetId} -> ${clonedWidget._id} by user ${req.user.username}`);

    } catch (error) {
      LoggerHelper.logError('webapi-widget', error, 'Clone widget error');
      
      res.status(500).json({
        success: false,
        error: 'Widget klonlanırken hata oluştu'
      });
    }
  });

  // Delete widget
  router.delete('//:id', async (req, res) => {
    try {
      const widgetId = req.params.id;
      const userId = req.user.userId;

      // Check widget ownership
      if (!(await checkWidgetAccess(widgetId, userId))) {
        return res.status(403).json({
          success: false,
          error: 'Bu widget\'ı silmek için yetkiniz yok'
        });
      }

      const success = await jmonWidget.delete(widgetId);

      if (success) {
        res.json({
          success: true,
          message: 'Widget başarıyla silindi'
        });

        LoggerHelper.logInfo('webapi-widget', `Widget deleted: ${widgetId} by user ${req.user.username}`);
      } else {
        res.status(400).json({
          success: false,
          error: 'Widget silinemedi'
        });
      }

    } catch (error) {
      LoggerHelper.logError('webapi-widget', error, 'Delete widget error');
      
      res.status(500).json({
        success: false,
        error: 'Widget silinirken hata oluştu'
      });
    }
  });

  // =================== WIDGET TEMPLATES ===================

  // Get widget templates
  router.get('/widget-templates', async (req, res) => {
    try {
      const templates = {
        'price-list': {
          name: 'Fiyat Listesi',
          description: 'Altın ve döviz fiyatlarını listeler',
          category: 'pricing',
          defaultConfig: {
            title: 'Fiyat Listesi',
            showTitle: true,
            refreshInterval: 5000,
            symbols: ['HAS/TRY', 'USD/TRY', 'EUR/TRY'],
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
          defaultPosition: { x: 0, y: 0, w: 6, h: 4 }
        },
        
        'calculator': {
          name: 'Fiyat Hesaplayıcı',
          description: 'Altın ve döviz hesaplamaları yapar',
          category: 'tools',
          defaultConfig: {
            title: 'Fiyat Hesaplayıcı',
            showTitle: true,
            calculationType: 'gold',
            baseSymbol: 'HAS/TRY',
            multiplier: 1,
            showFormula: true,
            resultFormat: {
              decimalPlaces: 2,
              prefix: '',
              suffix: ' ₺'
            }
          },
          defaultPosition: { x: 6, y: 0, w: 4, h: 3 }
        },
        
        'chart': {
          name: 'Grafik',
          description: 'Fiyat geçmişi grafiği gösterir',
          category: 'analytics',
          defaultConfig: {
            title: 'Fiyat Grafiği',
            showTitle: true,
            chartType: 'line',
            dataSource: 'price-history',
            symbol: 'HAS/TRY',
            timeRange: '1d',
            showGrid: true,
            showLegend: true,
            colors: ['#1976d2', '#dc004e', '#388e3c']
          },
          defaultPosition: { x: 0, y: 4, w: 8, h: 4 }
        },
        
        'custom-product': {
          name: 'Özel Ürün',
          description: 'Kullanıcı tanımlı özel ürünleri gösterir',
          category: 'custom',
          defaultConfig: {
            title: 'Özel Ürünler',
            showTitle: true,
            productIds: [],
            refreshInterval: 5000,
            showFormula: false,
            showLastUpdate: true,
            layout: 'list',
            priceFormat: {
              decimalPlaces: 2,
              prefix: '',
              suffix: ' ₺'
            }
          },
          defaultPosition: { x: 8, y: 4, w: 4, h: 4 }
        },
        
        'text': {
          name: 'Metin',
          description: 'Özel metin içeriği gösterir',
          category: 'content',
          defaultConfig: {
            title: 'Metin',
            showTitle: true,
            content: '<p>Buraya metin içeriğinizi yazabilirsiniz</p>',
            textAlign: 'left',
            fontSize: 14,
            fontWeight: 'normal',
            color: '#333333',
            allowHtml: true
          },
          defaultPosition: { x: 0, y: 8, w: 6, h: 2 }
        },
        
        'image': {
          name: 'Resim',
          description: 'Resim dosyası gösterir',
          category: 'media',
          defaultConfig: {
            title: 'Resim',
            showTitle: true,
            imageUrl: '',
            altText: '',
            fit: 'contain',
            alignment: 'center',
            clickAction: 'none',
            clickUrl: ''
          },
          defaultPosition: { x: 6, y: 8, w: 6, h: 3 }
        }
      };

      res.json({
        success: true,
        data: templates
      });

    } catch (error) {
      LoggerHelper.logError('webapi-widget', error, 'Get widget templates error');
      
      res.status(500).json({
        success: false,
        error: 'Widget şablonları alınamadı'
      });
    }
  });

  // Create widget from template
  router.post('/from-template', async (req, res) => {
    try {
      const userId = req.user.userId;
      const { dashboardId, templateType, customConfig, customPosition } = req.body;

      if (!dashboardId || !templateType) {
        return res.status(400).json({
          success: false,
          error: 'Dashboard ID ve şablon tipi gereklidir'
        });
      }

      // Check dashboard access
      if (!(await checkDashboardAccess(dashboardId, userId))) {
        return res.status(403).json({
          success: false,
          error: 'Bu dashboard\'a widget eklemek için yetkiniz yok'
        });
      }

      // Get template (this would be from a separate endpoint in real app)
      const templates = {
        'price-list': {
          widgetType: 'price-list',
          defaultConfig: {
            title: 'Fiyat Listesi',
            showTitle: true,
            refreshInterval: 5000,
            symbols: ['HAS/TRY', 'USD/TRY', 'EUR/TRY'],
            showBuyingSelling: true,
            showChangePercentage: true
          },
          defaultPosition: { x: 0, y: 0, w: 6, h: 4 }
        }
        // Other templates...
      };

      const template = templates[templateType];
      if (!template) {
        return res.status(400).json({
          success: false,
          error: 'Geçersiz şablon tipi'
        });
      }

      const widgetData = {
        dashboardId,
        userId,
        widgetType: template.widgetType,
        positionConfig: customPosition || template.defaultPosition,
        widgetConfig: { ...template.defaultConfig, ...customConfig }
      };

      const widget = await jmonWidget.create(widgetData);

      res.json({
        success: true,
        data: widget
      });

      LoggerHelper.logInfo('webapi-widget', `Widget created from template: ${templateType} on dashboard ${dashboardId} by user ${req.user.username}`);

    } catch (error) {
      LoggerHelper.logError('webapi-widget', error, 'Create widget from template error');
      
      res.status(500).json({
        success: false,
        error: 'Şablondan widget oluşturulamadı'
      });
    }
  });

  // =================== WIDGET STATS ===================

  // Get widget statistics
  router.get('//stats', async (req, res) => {
    try {
      const userId = req.user.userId;

      const [userStats, globalStats] = await Promise.all([
        jmonWidget.findByUserId(userId).then(widgets => ({
          total: widgets.length,
          active: widgets.filter(w => w.isActive).length,
          byType: widgets.reduce((acc, w) => {
            acc[w.widgetType] = (acc[w.widgetType] || 0) + 1;
            return acc;
          }, {}),
          byDashboard: widgets.reduce((acc, w) => {
            const dashboardId = w.dashboardId.toString();
            acc[dashboardId] = (acc[dashboardId] || 0) + 1;
            return acc;
          }, {})
        })),
        jmonWidget.getStats()
      ]);

      res.json({
        success: true,
        data: {
          user: userStats,
          global: globalStats
        }
      });

    } catch (error) {
      LoggerHelper.logError('webapi-widget', error, 'Get widget stats error');
      
      res.status(500).json({
        success: false,
        error: 'Widget istatistikleri alınamadı'
      });
    }
  });

  return router;
}

module.exports = createWebApiWidgetRoutes;