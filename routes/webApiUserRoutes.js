const express = require('express');
const LoggerHelper = require('../utils/logger');
const { authenticateJWT } = require('./webApiAuthRoutes');

function createWebApiUserRoutes(db) {
  const router = express.Router();

  // Models
  const JmonUser = require('../models/JmonUser');
  const JmonDashboard = require('../models/JmonDashboard');
  const JmonWidget = require('../models/JmonWidget');
  const JmonUserProduct = require('../models/JmonUserProduct');
  const JmonUserMedia = require('../models/JmonUserMedia');

  const jmonUser = new JmonUser(db);
  const jmonDashboard = new JmonDashboard(db);
  const jmonWidget = new JmonWidget(db);
  const jmonUserProduct = new JmonUserProduct(db);
  const jmonUserMedia = new JmonUserMedia(db);

  // Apply JWT authentication to all routes
  router.use(authenticateJWT);

  // =================== DASHBOARD ROUTES ===================

  // Get user's dashboards
  router.get('/dashboards', async (req, res) => {
    try {
      const userId = req.user.userId;
      const options = {
        includeInactive: req.query.includeInactive === 'true',
        sortBy: req.query.sortBy || 'updatedAt',
        sortOrder: parseInt(req.query.sortOrder) || -1
      };

      const dashboards = await jmonDashboard.findByUserId(userId, options);

      res.json({
        success: true,
        data: dashboards
      });

    } catch (error) {
      LoggerHelper.logError('webapi-user', error, 'Get dashboards error');
      
      res.status(500).json({
        success: false,
        error: 'Dashboard listesi alınamadı'
      });
    }
  });

  // Get default dashboard
  router.get('/dashboards/default', async (req, res) => {
    try {
      const userId = req.user.userId;

      let defaultDashboard = await jmonDashboard.findDefaultByUserId(userId);

      // If no default dashboard, get the first one
      if (!defaultDashboard) {
        const dashboards = await jmonDashboard.findByUserId(userId, { sortBy: 'createdAt', sortOrder: 1 });
        if (dashboards.length > 0) {
          defaultDashboard = dashboards[0];
          // Set it as default
          await jmonDashboard.update(defaultDashboard._id, { isDefault: true });
        }
      }

      if (defaultDashboard) {
        // Record access
        await jmonDashboard.recordAccess(defaultDashboard._id);

        res.json({
          success: true,
          data: defaultDashboard
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Varsayılan dashboard bulunamadı'
        });
      }

    } catch (error) {
      LoggerHelper.logError('webapi-user', error, 'Get default dashboard error');
      
      res.status(500).json({
        success: false,
        error: 'Varsayılan dashboard alınamadı'
      });
    }
  });

  // Get specific dashboard
  router.get('/dashboards/:id', async (req, res) => {
    try {
      const dashboardId = req.params.id;
      const userId = req.user.userId;

      const dashboard = await jmonDashboard.findById(dashboardId);

      if (!dashboard) {
        return res.status(404).json({
          success: false,
          error: 'Dashboard bulunamadı'
        });
      }

      // Check if user owns this dashboard
      if (dashboard.userId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Bu dashboard\'a erişim yetkiniz yok'
        });
      }

      // Record access
      await jmonDashboard.recordAccess(dashboardId);

      res.json({
        success: true,
        data: dashboard
      });

    } catch (error) {
      LoggerHelper.logError('webapi-user', error, 'Get dashboard error');
      
      res.status(500).json({
        success: false,
        error: 'Dashboard bilgisi alınamadı'
      });
    }
  });

  // Create new dashboard
  router.post('/dashboards', async (req, res) => {
    try {
      const userId = req.user.userId;
      const {
        name,
        description,
        isDefault,
        gridConfig,
        themeConfig,
        settings
      } = req.body;

      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Dashboard adı gereklidir'
        });
      }

      const dashboardData = {
        userId,
        name,
        description,
        isDefault,
        gridConfig,
        themeConfig,
        settings
      };

      const dashboard = await jmonDashboard.create(dashboardData);

      res.json({
        success: true,
        data: dashboard
      });

      LoggerHelper.logInfo('webapi-user', `Dashboard created: ${name} by user ${req.user.username}`);

    } catch (error) {
      LoggerHelper.logError('webapi-user', error, 'Create dashboard error');
      
      res.status(500).json({
        success: false,
        error: 'Dashboard oluşturulamadı'
      });
    }
  });

  // Update dashboard
  router.put('/dashboards/:id', async (req, res) => {
    try {
      const dashboardId = req.params.id;
      const userId = req.user.userId;

      // Check ownership
      const dashboard = await jmonDashboard.findById(dashboardId);
      if (!dashboard || dashboard.userId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Bu dashboard\'ı güncellemek için yetkiniz yok'
        });
      }

      const {
        name,
        description,
        isDefault,
        gridConfig,
        themeConfig,
        settings
      } = req.body;

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (isDefault !== undefined) updates.isDefault = isDefault;
      if (gridConfig !== undefined) updates.gridConfig = gridConfig;
      if (themeConfig !== undefined) updates.themeConfig = themeConfig;
      if (settings !== undefined) updates.settings = settings;

      const success = await jmonDashboard.update(dashboardId, updates);

      if (success) {
        const updatedDashboard = await jmonDashboard.findById(dashboardId);
        
        res.json({
          success: true,
          data: updatedDashboard
        });

        LoggerHelper.logInfo('webapi-user', `Dashboard updated: ${dashboardId} by user ${req.user.username}`);
      } else {
        res.status(400).json({
          success: false,
          error: 'Dashboard güncellenemedi'
        });
      }

    } catch (error) {
      LoggerHelper.logError('webapi-user', error, 'Update dashboard error');
      
      res.status(500).json({
        success: false,
        error: 'Dashboard güncellenirken hata oluştu'
      });
    }
  });

  // Clone dashboard
  router.post('/dashboards/:id/clone', async (req, res) => {
    try {
      const dashboardId = req.params.id;
      const userId = req.user.userId;
      const { newName } = req.body;

      // Check ownership
      const dashboard = await jmonDashboard.findById(dashboardId);
      if (!dashboard || dashboard.userId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Bu dashboard\'ı klonlamak için yetkiniz yok'
        });
      }

      const clonedDashboard = await jmonDashboard.clone(dashboardId, newName);

      // Also clone widgets
      const widgets = await jmonWidget.findByDashboardId(dashboardId);
      for (const widget of widgets) {
        await jmonWidget.clone(widget._id, clonedDashboard._id);
      }

      res.json({
        success: true,
        data: clonedDashboard
      });

      LoggerHelper.logInfo('webapi-user', `Dashboard cloned: ${dashboardId} -> ${clonedDashboard._id} by user ${req.user.username}`);

    } catch (error) {
      LoggerHelper.logError('webapi-user', error, 'Clone dashboard error');
      
      res.status(500).json({
        success: false,
        error: 'Dashboard klonlanırken hata oluştu'
      });
    }
  });

  // Delete dashboard
  router.delete('/dashboards/:id', async (req, res) => {
    try {
      const dashboardId = req.params.id;
      const userId = req.user.userId;

      // Check ownership
      const dashboard = await jmonDashboard.findById(dashboardId);
      if (!dashboard || dashboard.userId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Bu dashboard\'ı silmek için yetkiniz yok'
        });
      }

      const success = await jmonDashboard.delete(dashboardId);

      if (success) {
        res.json({
          success: true,
          message: 'Dashboard başarıyla silindi'
        });

        LoggerHelper.logInfo('webapi-user', `Dashboard deleted: ${dashboardId} by user ${req.user.username}`);
      } else {
        res.status(400).json({
          success: false,
          error: 'Dashboard silinemedi'
        });
      }

    } catch (error) {
      LoggerHelper.logError('webapi-user', error, 'Delete dashboard error');
      
      res.status(500).json({
        success: false,
        error: 'Dashboard silinirken hata oluştu'
      });
    }
  });


  // =================== USER PREFERENCES ROUTES ===================

  // Get user preferences
  router.get('/preferences', async (req, res) => {
    try {
      const userId = req.user.userId;
      const user = await jmonUser.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Kullanıcı bulunamadı'
        });
      }

      res.json({
        success: true,
        data: {
          dashboardPreferences: user.dashboardPreferences,
          permissions: user.permissions,
          allowedChannels: user.allowedChannels
        }
      });

    } catch (error) {
      LoggerHelper.logError('webapi-user', error, 'Get preferences error');
      
      res.status(500).json({
        success: false,
        error: 'Kullanıcı tercihleri alınamadı'
      });
    }
  });

  // Update user preferences
  router.put('/preferences', async (req, res) => {
    try {
      const userId = req.user.userId;
      const { dashboardPreferences } = req.body;

      if (!dashboardPreferences) {
        return res.status(400).json({
          success: false,
          error: 'Dashboard tercihleri gereklidir'
        });
      }

      const success = await jmonUser.update(userId, { dashboardPreferences });

      if (success) {
        res.json({
          success: true,
          message: 'Kullanıcı tercihleri güncellendi'
        });

        LoggerHelper.logInfo('webapi-user', `User preferences updated for user ${req.user.username}`);
      } else {
        res.status(400).json({
          success: false,
          error: 'Tercihler güncellenemedi'
        });
      }

    } catch (error) {
      LoggerHelper.logError('webapi-user', error, 'Update preferences error');
      
      res.status(500).json({
        success: false,
        error: 'Tercihler güncellenirken hata oluştu'
      });
    }
  });

  // =================== USER PROFILE ROUTES ===================

  // Get user profile
  router.get('/profile', async (req, res) => {
    try {
      const userId = req.user.userId;
      const user = await jmonUser.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Kullanıcı bulunamadı'
        });
      }

      res.json({
        success: true,
        data: {
          id: user._id,
          username: user.username,
          email: user.email,
          domain: user.domain,
          permissions: user.permissions,
          allowedChannels: user.allowedChannels,
          isActive: user.isActive,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
          loginCount: user.loginCount,
          usageCount: user.usageCount,
          dashboardPreferences: user.dashboardPreferences
        }
      });

    } catch (error) {
      LoggerHelper.logError('webapi-user', error, 'Get profile error');
      
      res.status(500).json({
        success: false,
        error: 'Kullanıcı profili alınamadı'
      });
    }
  });

  // Update user profile
  router.put('/profile', async (req, res) => {
    try {
      const userId = req.user.userId;
      const { email, dashboardPreferences } = req.body;

      const updates = {};
      if (email !== undefined) updates.email = email;
      if (dashboardPreferences !== undefined) updates.dashboardPreferences = dashboardPreferences;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Güncellenecek alan bulunamadı'
        });
      }

      const success = await jmonUser.update(userId, updates);

      if (success) {
        const updatedUser = await jmonUser.findById(userId);
        
        res.json({
          success: true,
          data: {
            id: updatedUser._id,
            username: updatedUser.username,
            email: updatedUser.email,
            domain: updatedUser.domain,
            dashboardPreferences: updatedUser.dashboardPreferences
          }
        });

        LoggerHelper.logInfo('webapi-user', `User profile updated for user ${req.user.username}`);
      } else {
        res.status(400).json({
          success: false,
          error: 'Profil güncellenemedi'
        });
      }

    } catch (error) {
      LoggerHelper.logError('webapi-user', error, 'Update profile error');
      
      res.status(500).json({
        success: false,
        error: 'Profil güncellenirken hata oluştu'
      });
    }
  });

  // =================== STATS ROUTES ===================

  // Get user stats
  router.get('/stats', async (req, res) => {
    try {
      const userId = req.user.userId;

      const [dashboardStats, widgetStats, productStats, mediaStats] = await Promise.all([
        jmonDashboard.findByUserId(userId).then(dashboards => ({
          total: dashboards.length,
          active: dashboards.filter(d => d.isActive).length,
          default: dashboards.filter(d => d.isDefault).length
        })),
        jmonWidget.findByUserId(userId).then(widgets => ({
          total: widgets.length,
          active: widgets.filter(w => w.isActive).length,
          byType: widgets.reduce((acc, w) => {
            acc[w.widgetType] = (acc[w.widgetType] || 0) + 1;
            return acc;
          }, {})
        })),
        jmonUserProduct.getStats(userId),
        jmonUserMedia.getStats(userId)
      ]);

      res.json({
        success: true,
        data: {
          dashboards: dashboardStats,
          widgets: widgetStats,
          products: productStats,
          media: mediaStats
        }
      });

    } catch (error) {
      LoggerHelper.logError('webapi-user', error, 'Get user stats error');
      
      res.status(500).json({
        success: false,
        error: 'Kullanıcı istatistikleri alınamadı'
      });
    }
  });

  return router;
}

module.exports = createWebApiUserRoutes;