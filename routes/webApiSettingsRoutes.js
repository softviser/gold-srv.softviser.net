const express = require('express');
const JmonSettings = require('../models/JmonSettings');
const { authenticateJWT } = require('./webApiAuthRoutes');
const LoggerHelper = require('../utils/logger');

function createWebApiSettingsRoutes(db) {
  const router = express.Router();
  const jmonSettings = new JmonSettings(db);

  // All routes require authentication
  router.use(authenticateJWT);

  /**
   * @swagger
   * /settings:
   *   get:
   *     summary: Get User Settings
   *     description: |
   *       Get all settings for the authenticated user, optionally filtered by category.
   *       
   *       **Detailed Mode**: Add `?detailed=true` to get full setting objects with description, isActive, and timestamp fields.
   *       
   *       **Categories**: general, dashboard, notifications, api, widgets, products
   *     tags: [Settings]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: category
   *         schema:
   *           type: string
   *           enum: [general, dashboard, notifications, api, widgets, products]
   *         description: Filter by specific category
   *         example: general
   *       - in: query
   *         name: detailed
   *         schema:
   *           type: boolean
   *           default: false
   *         description: Return full setting objects with description, isActive, and timestamps
   *         example: true
   *     responses:
   *       200:
   *         description: User settings
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   additionalProperties:
   *                     oneOf:
   *                       - type: object
   *                         description: Simple format (detailed=false)
   *                         additionalProperties:
   *                           type: any
   *                       - type: object
   *                         description: Detailed format (detailed=true)
   *                         additionalProperties:
   *                           type: object
   *                           properties:
   *                             value:
   *                               type: any
   *                             description:
   *                               type: string
   *                               nullable: true
   *                             isActive:
   *                               type: boolean
   *                             updatedAt:
   *                               type: string
   *                               format: date-time
   *                             createdAt:
   *                               type: string
   *                               format: date-time
   *             examples:
   *               simple:
   *                 summary: Simple format (default)
   *                 value:
   *                   success: true
   *                   data:
   *                     general:
   *                       theme: "light"
   *                       language: "tr"
   *                     api:
   *                       source: "687d7bd957854b08834b744a"
   *               detailed:
   *                 summary: Detailed format (detailed=true)
   *                 value:
   *                   success: true
   *                   data:
   *                     general:
   *                       theme:
   *                         value: "light"
   *                         description: "UI theme preference"
   *                         isActive: true
   *                         updatedAt: "2024-01-01T12:00:00Z"
   *                         createdAt: "2024-01-01T10:00:00Z"
   *                       language:
   *                         value: "tr"
   *                         description: null
   *                         isActive: true
   *                         updatedAt: "2024-01-01T11:00:00Z"
   *                         createdAt: "2024-01-01T10:30:00Z"
   *                     api:
   *                       source:
   *                         value: "687d7bd957854b08834b744a"
   *                         description: "Selected price source ID"
   *                         isActive: true
   *                         updatedAt: "2024-01-01T13:00:00Z"
   *                         createdAt: "2024-01-01T12:00:00Z"
   *       401:
   *         description: Unauthorized
   */

  // Get all settings for the authenticated user
  router.get('/', async (req, res) => {
    try {
      const category = req.query.category || null;
      const detailed = req.query.detailed === 'true';
      
      const settings = detailed 
        ? await jmonSettings.getUserSettingsDetailed(req.user.userId, category)
        : await jmonSettings.getUserSettings(req.user.userId, category);
      
      res.json({
        success: true,
        data: settings
      });
    } catch (error) {
      LoggerHelper.logError('webapi-settings', error, 'Get user settings error');
      res.status(500).json({
        success: false,
        error: 'Ayarlar alınırken hata oluştu'
      });
    }
  });

  // Get a specific setting
  router.get('/:settingKey', async (req, res) => {
    try {
      const { settingKey } = req.params;
      const setting = await jmonSettings.findOne({
        userId: req.user.userId,
        settingKey,
        isActive: true
      });
      
      if (!setting) {
        return res.status(404).json({
          success: false,
          error: 'Ayar bulunamadı'
        });
      }
      
      res.json({
        success: true,
        data: {
          key: setting.settingKey,
          value: setting.settingValue,
          category: setting.category,
          description: setting.description,
          isActive: setting.isActive,
          metadata: setting.metadata,
          updatedAt: setting.updatedAt,
          createdAt: setting.createdAt
        }
      });
    } catch (error) {
      LoggerHelper.logError('webapi-settings', error, 'Get specific setting error');
      res.status(500).json({
        success: false,
        error: 'Ayar alınırken hata oluştu'
      });
    }
  });

  // Update or create a single setting
  router.put('/:settingKey', async (req, res) => {
    try {
      const { settingKey } = req.params;
      const { value, category = 'general', description } = req.body;
      
      if (value === undefined || value === null) {
        return res.status(400).json({
          success: false,
          error: 'Ayar değeri gereklidir'
        });
      }
      
      const setting = await jmonSettings.upsertSetting(
        req.user.userId,
        settingKey,
        value,
        category,
        description
      );
      
      res.json({
        success: true,
        data: {
          key: setting.settingKey,
          value: setting.settingValue,
          category: setting.category,
          description: setting.description,
          isActive: setting.isActive,
          updatedAt: setting.updatedAt,
          createdAt: setting.createdAt
        }
      });
    } catch (error) {
      LoggerHelper.logError('webapi-settings', error, 'Update setting error');
      res.status(500).json({
        success: false,
        error: 'Ayar güncellenirken hata oluştu'
      });
    }
  });

  // Bulk update settings
  router.post('/bulk', async (req, res) => {
    try {
      const { settings } = req.body;
      
      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'Geçerli ayarlar objesi gereklidir'
        });
      }
      
      const result = await jmonSettings.bulkUpdateSettings(req.user.userId, settings);
      
      // Get updated settings
      const updatedSettings = await jmonSettings.getUserSettings(req.user.userId);
      
      res.json({
        success: true,
        data: {
          updated: result ? result.modifiedCount + result.upsertedCount : 0,
          settings: updatedSettings
        }
      });
    } catch (error) {
      LoggerHelper.logError('webapi-settings', error, 'Bulk update settings error');
      res.status(500).json({
        success: false,
        error: 'Ayarlar güncellenirken hata oluştu'
      });
    }
  });

  // Delete a setting
  router.delete('/:settingKey', async (req, res) => {
    try {
      const { settingKey } = req.params;
      
      const result = await jmonSettings.findOneAndUpdate(
        {
          userId: req.user.userId,
          settingKey
        },
        {
          isActive: false
        },
        {
          new: true
        }
      );
      
      if (!result) {
        return res.status(404).json({
          success: false,
          error: 'Ayar bulunamadı'
        });
      }
      
      res.json({
        success: true,
        message: 'Ayar silindi'
      });
    } catch (error) {
      LoggerHelper.logError('webapi-settings', error, 'Delete setting error');
      res.status(500).json({
        success: false,
        error: 'Ayar silinirken hata oluştu'
      });
    }
  });

  // Reset all settings to defaults
  router.post('/reset', async (req, res) => {
    try {
      const { category } = req.body;
      
      const query = { userId: req.user.userId };
      if (category) {
        query.category = category;
      }
      
      await jmonSettings.updateMany(query, { isActive: false });
      
      // Define default settings
      const defaultSettings = {
        general: {
          theme: 'light',
          language: 'tr',
          timezone: 'Europe/Istanbul',
          dateFormat: 'DD/MM/YYYY',
          timeFormat: '24h',
          numberFormat: 'tr-TR'
        },
        dashboard: {
          autoRefresh: true,
          refreshInterval: 30000,
          gridSize: 12,
          snapToGrid: true,
          showGrid: false,
          compactMode: false
        },
        notifications: {
          enabled: true,
          sound: false,
          email: true,
          priceAlerts: true,
          systemUpdates: false
        },
        api: {
          requestTimeout: 30000,
          retryAttempts: 3,
          cacheEnabled: true,
          cacheDuration: 300000
        }
      };
      
      // Apply category filter if specified
      const settingsToReset = category ? { [category]: defaultSettings[category] || {} } : defaultSettings;
      
      await jmonSettings.bulkUpdateSettings(req.user.userId, settingsToReset);
      
      const updatedSettings = await jmonSettings.getUserSettings(req.user.userId);
      
      res.json({
        success: true,
        data: updatedSettings
      });
    } catch (error) {
      LoggerHelper.logError('webapi-settings', error, 'Reset settings error');
      res.status(500).json({
        success: false,
        error: 'Ayarlar sıfırlanırken hata oluştu'
      });
    }
  });

  // Get available setting categories
  router.get('/meta/categories', async (req, res) => {
    try {
      const categories = await jmonSettings.distinct('category', {
        userId: req.user.userId,
        isActive: true
      });
      
      const categoryInfo = {
        general: {
          name: 'Genel Ayarlar',
          description: 'Tema, dil, tarih formatı gibi genel ayarlar',
          icon: 'settings'
        },
        dashboard: {
          name: 'Dashboard Ayarları',
          description: 'Dashboard görünüm ve davranış ayarları',
          icon: 'dashboard'
        },
        notifications: {
          name: 'Bildirim Ayarları',
          description: 'Bildirim tercihleri ve uyarılar',
          icon: 'notifications'
        },
        api: {
          name: 'API Ayarları',
          description: 'API bağlantı ve performans ayarları',
          icon: 'api'
        },
        widgets: {
          name: 'Widget Ayarları',
          description: 'Widget varsayılan ayarları',
          icon: 'widgets'
        },
        products: {
          name: 'Ürün Ayarları',
          description: 'Ürün hesaplama ve görüntüleme ayarları',
          icon: 'inventory'
        }
      };
      
      const result = categories.map(cat => ({
        key: cat,
        ...categoryInfo[cat] || {
          name: cat.charAt(0).toUpperCase() + cat.slice(1),
          description: `${cat} ile ilgili ayarlar`,
          icon: 'folder'
        }
      }));
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      LoggerHelper.logError('webapi-settings', error, 'Get categories error');
      res.status(500).json({
        success: false,
        error: 'Kategoriler alınırken hata oluştu'
      });
    }
  });

  return router;
}

module.exports = createWebApiSettingsRoutes;