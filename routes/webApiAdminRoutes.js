const express = require('express');
const LoggerHelper = require('../utils/logger');
const { authenticateJWT } = require('./webApiAuthRoutes');

function createWebApiAdminRoutes(db) {
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

  // Admin authorization middleware
  const requireAdmin = async (req, res, next) => {
    try {
      const userId = req.user.userId;
      const user = await jmonUser.findById(userId);

      // Admin kontrolü - permissions içinde 'admin' var mı veya domain '*' mi
      if (!user || (!user.permissions.includes('admin') && user.domain !== '*')) {
        return res.status(403).json({
          success: false,
          error: 'Admin yetkisi gereklidir'
        });
      }

      req.adminUser = user;
      next();
    } catch (error) {
      LoggerHelper.logError('webapi-admin', error, 'Admin auth error');
      res.status(500).json({
        success: false,
        error: 'Yetki kontrolü başarısız'
      });
    }
  };

  // Apply admin authorization to all routes
  router.use(requireAdmin);

  // =================== USER MANAGEMENT ROUTES ===================

  // Get all users
  router.get('/users', async (req, res) => {
    try {
      const options = {
        skip: parseInt(req.query.skip) || 0,
        limit: parseInt(req.query.limit) || 50,
        isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : null
      };

      const users = await jmonUser.list(options);

      res.json({
        success: true,
        data: users
      });

    } catch (error) {
      LoggerHelper.logError('webapi-admin', error, 'Get all users error');
      
      res.status(500).json({
        success: false,
        error: 'Kullanıcı listesi alınamadı'
      });
    }
  });

  // Get specific user
  router.get('/users/:id', async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await jmonUser.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Kullanıcı bulunamadı'
        });
      }

      // Get user statistics
      const [dashboards, widgets, products, media] = await Promise.all([
        jmonDashboard.findByUserId(userId, { includeInactive: true }),
        jmonWidget.findByUserId(userId, { includeInactive: true }),
        jmonUserProduct.findByUserId(userId, { includeInactive: true }),
        jmonUserMedia.findByUserId(userId, { includeInactive: true })
      ]);

      const userWithStats = {
        ...user,
        stats: {
          dashboards: {
            total: dashboards.length,
            active: dashboards.filter(d => d.isActive).length
          },
          widgets: {
            total: widgets.length,
            active: widgets.filter(w => w.isActive).length
          },
          products: {
            total: products.length,
            active: products.filter(p => p.isActive).length
          },
          media: {
            total: media.length,
            active: media.filter(m => m.isActive).length,
            totalSize: media.reduce((sum, m) => sum + (m.fileSize || 0), 0)
          }
        }
      };

      res.json({
        success: true,
        data: userWithStats
      });

    } catch (error) {
      LoggerHelper.logError('webapi-admin', error, 'Get user error');
      
      res.status(500).json({
        success: false,
        error: 'Kullanıcı bilgisi alınamadı'
      });
    }
  });

  // Create new user
  router.post('/users', async (req, res) => {
    try {
      const {
        username,
        password,
        email,
        domain,
        permissions,
        allowedChannels,
        rateLimit,
        dashboardPreferences,
        metadata
      } = req.body;

      // Validation
      if (!username || !password || !email || !domain) {
        return res.status(400).json({
          success: false,
          error: 'Kullanıcı adı, şifre, email ve domain gereklidir'
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Şifre en az 6 karakter olmalıdır'
        });
      }

      const userData = {
        username,
        password,
        email,
        domain,
        permissions: permissions || ['read'],
        allowedChannels: allowedChannels || ['*'],
        rateLimit: rateLimit || { requests: 1000, window: 60 },
        dashboardPreferences: dashboardPreferences || {
          theme: 'light',
          language: 'tr',
          timezone: 'Europe/Istanbul'
        },
        metadata: metadata || {}
      };

      const user = await jmonUser.create(userData);

      res.json({
        success: true,
        data: user
      });

      LoggerHelper.logInfo('webapi-admin', `JmonUser created: ${username} by admin ${req.adminUser.username}`);

    } catch (error) {
      LoggerHelper.logError('webapi-admin', error, 'Create user error');
      
      res.status(500).json({
        success: false,
        error: error.message || 'Kullanıcı oluşturulamadı'
      });
    }
  });

  // Update user
  router.put('/users/:id', async (req, res) => {
    try {
      const userId = req.params.id;
      
      // Check if user exists
      const existingUser = await jmonUser.findById(userId);
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          error: 'Kullanıcı bulunamadı'
        });
      }

      const {
        username,
        password,
        email,
        domain,
        permissions,
        allowedChannels,
        rateLimit,
        isActive,
        dashboardPreferences,
        metadata
      } = req.body;

      const updates = {};
      if (username !== undefined) updates.username = username;
      if (password !== undefined) updates.password = password;
      if (email !== undefined) updates.email = email;
      if (domain !== undefined) updates.domain = domain;
      if (permissions !== undefined) updates.permissions = permissions;
      if (allowedChannels !== undefined) updates.allowedChannels = allowedChannels;
      if (rateLimit !== undefined) updates.rateLimit = rateLimit;
      if (isActive !== undefined) updates.isActive = isActive;
      if (dashboardPreferences !== undefined) updates.dashboardPreferences = dashboardPreferences;
      if (metadata !== undefined) updates.metadata = metadata;

      // Password validation
      if (password && password.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Şifre en az 6 karakter olmalıdır'
        });
      }

      const success = await jmonUser.update(userId, updates);

      if (success) {
        const updatedUser = await jmonUser.findById(userId);
        
        res.json({
          success: true,
          data: updatedUser
        });

        LoggerHelper.logInfo('webapi-admin', `JmonUser updated: ${userId} by admin ${req.adminUser.username}`);
      } else {
        res.status(400).json({
          success: false,
          error: 'Kullanıcı güncellenemedi'
        });
      }

    } catch (error) {
      LoggerHelper.logError('webapi-admin', error, 'Update user error');
      
      res.status(500).json({
        success: false,
        error: error.message || 'Kullanıcı güncellenirken hata oluştu'
      });
    }
  });

  // Toggle user active status
  router.post('/users/:id/toggle', async (req, res) => {
    try {
      const userId = req.params.id;
      
      const user = await jmonUser.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Kullanıcı bulunamadı'
        });
      }

      const newStatus = !user.isActive;
      const success = await jmonUser.update(userId, { isActive: newStatus });

      if (success) {
        res.json({
          success: true,
          data: {
            userId: userId,
            isActive: newStatus,
            message: newStatus ? 'Kullanıcı aktif edildi' : 'Kullanıcı pasif edildi'
          }
        });

        LoggerHelper.logInfo('webapi-admin', `JmonUser status toggled: ${userId} -> ${newStatus} by admin ${req.adminUser.username}`);
      } else {
        res.status(400).json({
          success: false,
          error: 'Kullanıcı durumu değiştirilemedi'
        });
      }

    } catch (error) {
      LoggerHelper.logError('webapi-admin', error, 'Toggle user status error');
      
      res.status(500).json({
        success: false,
        error: 'Kullanıcı durumu değiştirilirken hata oluştu'
      });
    }
  });

  // Delete user (and all related data)
  router.delete('/users/:id', async (req, res) => {
    try {
      const userId = req.params.id;
      
      const user = await jmonUser.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Kullanıcı bulunamadı'
        });
      }

      // Delete all user data
      const [dashboardsDeleted, productsDeleted, mediaDeleted] = await Promise.all([
        jmonDashboard.deleteByUserId(userId), // This also deletes widgets
        jmonUserProduct.deleteByUserId(userId),
        jmonUserMedia.deleteByUserId(userId) // This also deletes files
      ]);

      // Delete user
      const userDeleted = await jmonUser.delete(userId);

      if (userDeleted) {
        res.json({
          success: true,
          data: {
            userId: userId,
            username: user.username,
            deletedData: {
              dashboards: dashboardsDeleted,
              products: productsDeleted,
              mediaFiles: mediaDeleted
            },
            message: 'Kullanıcı ve tüm verileri başarıyla silindi'
          }
        });

        LoggerHelper.logInfo('webapi-admin', `JmonUser deleted: ${userId} (${user.username}) with all data by admin ${req.adminUser.username}`);
      } else {
        res.status(400).json({
          success: false,
          error: 'Kullanıcı silinemedi'
        });
      }

    } catch (error) {
      LoggerHelper.logError('webapi-admin', error, 'Delete user error');
      
      res.status(500).json({
        success: false,
        error: 'Kullanıcı silinirken hata oluştu'
      });
    }
  });

  // Reset user password
  router.post('/users/:id/reset-password', async (req, res) => {
    try {
      const userId = req.params.id;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Yeni şifre en az 6 karakter olmalıdır'
        });
      }

      const user = await jmonUser.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Kullanıcı bulunamadı'
        });
      }

      const success = await jmonUser.changePassword(userId, newPassword);

      if (success) {
        res.json({
          success: true,
          message: 'Kullanıcı şifresi başarıyla sıfırlandı'
        });

        LoggerHelper.logInfo('webapi-admin', `Password reset for user: ${userId} by admin ${req.adminUser.username}`);
      } else {
        res.status(400).json({
          success: false,
          error: 'Şifre sıfırlanamadı'
        });
      }

    } catch (error) {
      LoggerHelper.logError('webapi-admin', error, 'Reset password error');
      
      res.status(500).json({
        success: false,
        error: 'Şifre sıfırlanırken hata oluştu'
      });
    }
  });

  // =================== SYSTEM STATISTICS ===================

  // Get system statistics
  router.get('/stats', async (req, res) => {
    try {
      const [userStats, dashboardStats, widgetStats, productStats, mediaStats] = await Promise.all([
        jmonUser.getStats(),
        jmonDashboard.getStats(),
        jmonWidget.getStats(),
        jmonUserProduct.getStats(),
        jmonUserMedia.getStats()
      ]);

      res.json({
        success: true,
        data: {
          users: userStats,
          dashboards: dashboardStats,
          widgets: widgetStats,
          products: productStats,
          media: mediaStats,
          generatedAt: new Date()
        }
      });

    } catch (error) {
      LoggerHelper.logError('webapi-admin', error, 'Get system stats error');
      
      res.status(500).json({
        success: false,
        error: 'Sistem istatistikleri alınamadı'
      });
    }
  });

  // Get recent activity
  router.get('/activity', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 20;

      const [recentUsers, recentDashboards, mostUsedProducts, mostUsedMedia] = await Promise.all([
        jmonUser.list({ limit: 10, sortBy: 'lastLoginAt', sortOrder: -1 }),
        jmonDashboard.getRecentlyAccessed(10),
        jmonUserProduct.getMostUsed(10),
        jmonUserMedia.getMostUsed(10)
      ]);

      res.json({
        success: true,
        data: {
          recentUsers: recentUsers,
          recentDashboards: recentDashboards,
          mostUsedProducts: mostUsedProducts,
          mostUsedMedia: mostUsedMedia
        }
      });

    } catch (error) {
      LoggerHelper.logError('webapi-admin', error, 'Get activity error');
      
      res.status(500).json({
        success: false,
        error: 'Aktivite verileri alınamadı'
      });
    }
  });

  // =================== BULK OPERATIONS ===================

  // Bulk user operations
  router.post('/users/bulk', async (req, res) => {
    try {
      const { operation, userIds, data } = req.body;

      if (!operation || !userIds || !Array.isArray(userIds)) {
        return res.status(400).json({
          success: false,
          error: 'İşlem tipi ve kullanıcı ID listesi gereklidir'
        });
      }

      const results = {
        successful: [],
        failed: []
      };

      for (const userId of userIds) {
        try {
          let success = false;

          switch (operation) {
            case 'activate':
              success = await jmonUser.update(userId, { isActive: true });
              break;
            
            case 'deactivate':
              success = await jmonUser.update(userId, { isActive: false });
              break;
            
            case 'update-permissions':
              if (data && data.permissions) {
                success = await jmonUser.update(userId, { permissions: data.permissions });
              }
              break;
            
            case 'update-rate-limit':
              if (data && data.rateLimit) {
                success = await jmonUser.update(userId, { rateLimit: data.rateLimit });
              }
              break;
            
            case 'delete':
              // Delete user data first
              await Promise.all([
                jmonDashboard.deleteByUserId(userId),
                jmonUserProduct.deleteByUserId(userId),
                jmonUserMedia.deleteByUserId(userId)
              ]);
              success = await jmonUser.delete(userId);
              break;
            
            default:
              throw new Error('Geçersiz işlem tipi');
          }

          if (success) {
            results.successful.push(userId);
          } else {
            results.failed.push({ userId, error: 'İşlem başarısız' });
          }

        } catch (userError) {
          results.failed.push({ userId, error: userError.message });
        }
      }

      res.json({
        success: true,
        data: {
          operation: operation,
          results: results,
          summary: {
            total: userIds.length,
            successful: results.successful.length,
            failed: results.failed.length
          }
        }
      });

      LoggerHelper.logInfo('webapi-admin', `Bulk operation ${operation} completed: ${results.successful.length}/${userIds.length} successful by admin ${req.adminUser.username}`);

    } catch (error) {
      LoggerHelper.logError('webapi-admin', error, 'Bulk operations error');
      
      res.status(500).json({
        success: false,
        error: 'Toplu işlem başarısız'
      });
    }
  });

  // =================== SYSTEM MAINTENANCE ===================

  // Cleanup expired users
  router.post('/maintenance/cleanup-expired', async (req, res) => {
    try {
      const deletedCount = await jmonUser.cleanupExpired();

      res.json({
        success: true,
        data: {
          deletedUsers: deletedCount,
          message: `${deletedCount} süresi dolmuş kullanıcı temizlendi`
        }
      });

      LoggerHelper.logInfo('webapi-admin', `Expired users cleanup: ${deletedCount} users deleted by admin ${req.adminUser.username}`);

    } catch (error) {
      LoggerHelper.logError('webapi-admin', error, 'Cleanup expired users error');
      
      res.status(500).json({
        success: false,
        error: 'Süresi dolmuş kullanıcı temizleme başarısız'
      });
    }
  });

  // System health check
  router.get('/health', async (req, res) => {
    try {
      const [userCount, activeUserCount] = await Promise.all([
        jmonUser.list({ limit: 1 }).then(users => users.length > 0),
        jmonUser.list({ limit: 1, isActive: true }).then(users => users.length > 0)
      ]);

      const health = {
        database: {
          connected: true,
          users: userCount,
          activeUsers: activeUserCount
        },
        services: {
          authentication: true,
          fileUpload: true,
          formulaCalculator: true
        },
        timestamp: new Date()
      };

      res.json({
        success: true,
        data: health
      });

    } catch (error) {
      LoggerHelper.logError('webapi-admin', error, 'Health check error');
      
      res.status(500).json({
        success: false,
        error: 'Sistem sağlık kontrolü başarısız',
        data: {
          database: { connected: false },
          services: { authentication: false },
          timestamp: new Date()
        }
      });
    }
  });

  return router;
}

module.exports = createWebApiAdminRoutes;