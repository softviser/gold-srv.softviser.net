const express = require('express');
const cors = require('cors');
const LoggerHelper = require('../utils/logger');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('../config/swaggerConfig');

// Import route modules
const { createWebApiAuthRoutes } = require('./webApiAuthRoutes');
const createWebApiUserRoutes = require('./webApiUserRoutes');
const createWebApiWidgetRoutes = require('./webApiWidgetRoutes');
const createWebApiProductRoutes = require('./webApiProductRoutes');
const createWebApiMediaRoutes = require('./webApiMediaRoutes');
const createWebApiSettingsRoutes = require('./webApiSettingsRoutes');
const webApiSystemRoutes = require('./webApiSystemRoutes');
const webApiSectionRoutes = require('./webApiSectionRoutes');
const webApiPricesRoutes = require('./webApiPricesRoutes');

function createWebApiRoutes(db) {
  const router = express.Router();

  // CORS configuration for dashboard applications
  const corsOptions = {
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      // Check if origin is allowed (you can customize this logic)
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:8080',
        'https://dashboard.softviser.net',
        /\.softviser\.net$/,
        /localhost:\d+$/
      ];
      
      const isAllowed = allowedOrigins.some(allowed => {
        if (typeof allowed === 'string') {
          return origin === allowed;
        } else if (allowed instanceof RegExp) {
          return allowed.test(origin);
        }
        return false;
      });
      
      callback(null, isAllowed);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['Content-Length', 'Content-Type']
  };

  // Apply CORS
  router.use(cors(corsOptions));

  // Parse JSON bodies
  router.use(express.json({ limit: '10mb' }));
  router.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging middleware
  router.use((req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const logData = {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration: duration,
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress
      };
      
      if (req.user) {
        logData.userId = req.user.userId;
        logData.username = req.user.username;
      }
      
      if (res.statusCode >= 400) {
        LoggerHelper.logWarning('webapi', `${logData.method} ${logData.url} - ${logData.status} (${logData.duration}ms)`);
      } else {
        LoggerHelper.logInfo('webapi', `${logData.method} ${logData.url} - ${logData.status} (${logData.duration}ms)`);
      }
    });
    
    next();
  });

  // API Health check
  router.get('/health', (req, res) => {
    res.json({
      success: true,
      data: {
        service: 'Gold Dashboard Web API',
        version: '1.0.0',
        status: 'healthy',
        timestamp: new Date(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
      }
    });
  });

  // API Information
  router.get('/info', (req, res) => {
    res.json({
      success: true,
      data: {
        service: 'Gold Dashboard Web API',
        version: '1.0.0',
        description: 'Multi-user dashboard system with custom product calculations',
        features: [
          'User Authentication & Management',
          'Dashboard Design & Configuration',
          'Widget System (Price Lists, Charts, Calculators)',
          'Custom Product Formula System with Rounding',
          'Section Management (Price Categories)',
          'System Currency Management',
          'Advanced Settings System (key=value, arrays, objects)',
          'File Upload & Media Management',
          'Admin Panel & User Management',
          'Real-time Price Integration'
        ],
        endpoints: {
          auth: '/web-api/auth/*',
          user: '/web-api/user/*',
          widgets: '/web-api/widgets/*',
          products: '/web-api/products/*',
          media: '/web-api/media/*',
          settings: '/web-api/settings/*',
          system: '/web-api/system/*',
          sections: '/web-api/sections/*'
        },
        documentation: '/web-api/swagger',
        github: 'https://github.com/softviser/gold-srv.softviser.net',
        support: 'support@softviser.net'
      }
    });
  });

  // Swagger UI Documentation
  const swaggerOptions = {
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info { margin-bottom: 40px; }
      .swagger-ui .scheme-container { background: #f7f7f7; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    `,
    customSiteTitle: 'Gold Dashboard API Documentation',
    customfavIcon: '/favicon.ico',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
      docExpansion: 'none',
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
      displayOperationId: false,
      showExtensions: true,
      showCommonExtensions: true,
      validatorUrl: null
    }
  };
  
  router.use('/swagger', swaggerUi.serve);
  router.get('/swagger', swaggerUi.setup(swaggerDocument, swaggerOptions));

  // JSON API Documentation endpoint (for backward compatibility)
  router.get('/docs', (req, res) => {
    const documentation = {
      title: 'Gold Dashboard Web API Documentation',
      version: '1.0.0',
      baseUrl: '/web-api',
      authentication: {
        type: 'JWT Bearer Token',
        loginEndpoint: '/web-api/auth/login',
        headers: {
          'Authorization': 'Bearer <jwt_token>'
        }
      },
      endpoints: {
        authentication: {
          'POST /auth/login': 'User login with username/password',
          'GET /auth/validate': 'Validate JWT token',
          'POST /auth/refresh': 'Refresh JWT token',
          'POST /auth/logout': 'User logout',
          'POST /auth/change-password': 'Change user password'
        },
        user: {
          'GET /user/dashboards': 'Get user dashboards',
          'POST /user/dashboards': 'Create new dashboard',
          'GET /user/dashboards/:id': 'Get specific dashboard',
          'PUT /user/dashboards/:id': 'Update dashboard',
          'DELETE /user/dashboards/:id': 'Delete dashboard',
          'POST /user/dashboards/:id/clone': 'Clone dashboard',
          'GET /user/preferences': 'Get user preferences',
          'PUT /user/preferences': 'Update user preferences',
          'GET /user/profile': 'Get user profile',
          'PUT /user/profile': 'Update user profile',
          'GET /user/stats': 'Get user statistics'
        },
        settings: {
          'GET /settings': 'Get all user settings',
          'GET /settings/:settingKey': 'Get specific setting',
          'PUT /settings/:settingKey': 'Update or create a setting',
          'POST /settings/bulk': 'Bulk update settings',
          'DELETE /settings/:settingKey': 'Delete a setting',
          'POST /settings/reset': 'Reset settings to defaults',
          'GET /settings/meta/categories': 'Get available setting categories'
        },
        system: {
          'GET /system/currencies': 'Get all system currencies',
          'GET /system/currencies/:code': 'Get currency by code',
          'GET /system/currencies/types': 'Get available currency types',
          'GET /system/rounding-options': 'Get available rounding options'
        },
        sections: {
          'GET /sections': 'Get user sections (price categories)',
          'POST /sections': 'Create new section',
          'GET /sections/:id': 'Get section by ID',
          'PUT /sections/:id': 'Update section',
          'DELETE /sections/:id': 'Delete section',
          'POST /sections/:id/set-default': 'Set section as default',
          'GET /sections/stats': 'Get section statistics'
        },
        widgets: {
          'GET /widgets/dashboards/:dashboardId/widgets': 'Get dashboard widgets',
          'POST /widgets': 'Create new widget',
          'GET /widgets/:id': 'Get specific widget',
          'PUT /widgets/:id': 'Update widget',
          'DELETE /widgets/:id': 'Delete widget',
          'POST /widgets/:id/clone': 'Clone widget',
          'PUT /widgets/dashboards/:dashboardId/widgets/positions': 'Update widget positions',
          'GET /widgets/widget-templates': 'Get widget templates',
          'POST /widgets/from-template': 'Create widget from template',
          'GET /widgets/stats': 'Get widget statistics'
        },
        products: {
          'GET /products': 'Get user products',
          'POST /products': 'Create new product',
          'GET /products/:id': 'Get specific product',
          'PUT /products/:id': 'Update product',
          'DELETE /products/:id': 'Delete product',
          'POST /products/:id/clone': 'Clone product',
          'POST /products/:id/calculate': 'Calculate product value',
          'POST /products/calculate-batch': 'Calculate multiple products',
          'GET /products/categories': 'Get product categories',
          'GET /products/tags': 'Get product tags',
          'GET /products/public': 'Get public products',
          'GET /products/stats': 'Get product statistics',
          'POST /products/validate-formula': 'Validate product formula'
        },
        media: {
          'POST /media/upload': 'Upload single file',
          'POST /media/upload-multiple': 'Upload multiple files',
          'GET /media/files': 'Get user media files',
          'GET /media/files/:id': 'Get specific media file',
          'PUT /media/files/:id': 'Update media file info',
          'DELETE /media/files/:id': 'Delete media file',
          'GET /media/serve/:userId/:fileName': 'Serve media file',
          'GET /media/download/:id': 'Download media file',
          'GET /media/file-types': 'Get supported file types',
          'GET /media/tags': 'Get media tags',
          'GET /media/stats': 'Get media statistics',
          'POST /media/cleanup': 'Cleanup unused files'
        },
      },
      models: {
        user: {
          id: 'string',
          username: 'string',
          email: 'string',
          domain: 'string',
          permissions: 'array',
          allowedChannels: 'array',
          token: 'string (API token)',
          isActive: 'boolean',
          dashboardPreferences: 'object',
          createdAt: 'date',
          lastLoginAt: 'date',
          loginCount: 'number'
        },
        dashboard: {
          id: 'string',
          userId: 'string',
          name: 'string',
          description: 'string',
          isDefault: 'boolean',
          gridConfig: 'object',
          themeConfig: 'object',
          settings: 'object',
          createdAt: 'date',
          lastAccessedAt: 'date'
        },
        widget: {
          id: 'string',
          dashboardId: 'string',
          userId: 'string',
          widgetType: 'string',
          positionConfig: 'object',
          widgetConfig: 'object',
          styleConfig: 'object',
          sortOrder: 'number',
          createdAt: 'date'
        },
        product: {
          id: 'string',
          userId: 'string',
          sectionId: 'string (optional)',
          name: 'string',
          productCode: 'string',
          buyingFormula: 'string (e.g., "HAS_alis * 0.995")',
          sellingFormula: 'string (e.g., "HAS_satis * 1.005")',
          baseSymbol: 'string',
          displayConfig: 'object',
          calculationConfig: 'object',
          roundingConfig: 'object (method: none/up/down/nearest, precision: 0/1/5/10/25/50/100)',
          category: 'string',
          tags: 'array',
          isPublic: 'boolean',
          lastCalculatedValues: 'object (buying and selling values)',
          usageCount: 'number'
        },
        section: {
          id: 'string',
          userId: 'string',
          name: 'string',
          description: 'string',
          sectionCode: 'string',
          displayConfig: 'object (icon, color, backgroundColor)',
          displayOrder: 'integer',
          category: 'string (general/gold/currency/crypto/custom)',
          isActive: 'boolean',
          isDefault: 'boolean',
          productCount: 'integer'
        },
        systemCurrency: {
          id: 'string',
          symbol: 'string (e.g., HAS/TRY)',
          code: 'string (e.g., HAS)',
          name: 'string',
          type: 'string (forex/gold/crypto)',
          baseCurrency: 'string',
          quoteCurrency: 'string',
          isActive: 'boolean',
          priority: 'integer',
          hasSource: 'boolean',
          sources: 'array'
        },
        media: {
          id: 'string',
          userId: 'string',
          fileName: 'string',
          originalFileName: 'string',
          fileUrl: 'string',
          fileSize: 'number',
          fileType: 'string',
          mimeType: 'string',
          title: 'string',
          description: 'string',
          tags: 'array',
          isPublic: 'boolean',
          usageCount: 'number'
        }
      },
      examples: {
        login: {
          request: {
            method: 'POST',
            url: '/web-api/auth/login',
            body: {
              username: 'demo_user',
              password: 'password123'
            }
          },
          response: {
            success: true,
            data: {
              user: { username: 'demo_user', email: 'user@domain.com' },
              token: 'jwt_token_here'
            }
          }
        },
        createDashboard: {
          request: {
            method: 'POST',
            url: '/web-api/user/dashboards',
            headers: { 'Authorization': 'Bearer jwt_token_here' },
            body: {
              name: 'Ana Dashboard',
              description: 'Birincil dashboard',
              isDefault: true,
              themeConfig: { darkMode: false, primaryColor: '#1976d2' }
            }
          }
        },
        createProduct: {
          request: {
            method: 'POST',
            url: '/web-api/products',
            headers: { 'Authorization': 'Bearer jwt_token_here' },
            body: {
              name: '22 Ayar Altın',
              sectionId: 'section_id_here',
              buyingFormula: 'HAS_alis * 0.916',
              sellingFormula: 'HAS_satis * 0.916',
              baseSymbol: 'HAS/TRY',
              displayConfig: { decimalPlaces: 2, suffix: ' ₺' },
              roundingConfig: { method: 'nearest', precision: 5, decimalPlaces: 2 }
            }
          }
        },
        createSection: {
          request: {
            method: 'POST',
            url: '/web-api/sections',
            headers: { 'Authorization': 'Bearer jwt_token_here' },
            body: {
              name: 'Altın Ürünleri',
              description: 'Altın fiyatları ve hesaplamaları',
              category: 'gold',
              displayConfig: { icon: 'gold', color: '#FFD700' }
            }
          }
        },
        updateSettings: {
          request: {
            method: 'POST',
            url: '/web-api/settings/bulk',
            headers: { 'Authorization': 'Bearer jwt_token_here' },
            body: {
              settings: {
                general: {
                  theme: 'dark',
                  language: 'tr'
                },
                notifications: {
                  email: true,
                  push: false
                }
              }
            }
          }
        }
      },
      errorCodes: {
        400: 'Bad Request - Invalid input parameters',
        401: 'Unauthorized - Authentication required',
        403: 'Forbidden - Insufficient permissions',
        404: 'Not Found - Resource not found',
        500: 'Internal Server Error - Server error'
      }
    };

    res.json({
      success: true,
      data: documentation
    });
  });

  // Mount route modules
  router.use('/auth', createWebApiAuthRoutes(db));
  router.use('/user', createWebApiUserRoutes(db));
  router.use('/widgets', createWebApiWidgetRoutes(db));
  router.use('/products', createWebApiProductRoutes(db));
  router.use('/media', createWebApiMediaRoutes(db));
  router.use('/settings', createWebApiSettingsRoutes(db));
  router.use('/system', webApiSystemRoutes);
  
  // Section routes need authentication middleware
  const { authenticateJWT } = require('./webApiAuthRoutes');
  router.use('/sections', authenticateJWT, webApiSectionRoutes);
  
  // Prices routes (API token authenticated)
  router.use('/prices', webApiPricesRoutes);

  // Error handling middleware
  router.use((error, req, res, next) => {
    // Prevent double response
    if (res.headersSent) {
      return next(error);
    }

    LoggerHelper.logError('webapi', error, `${req.method} ${req.originalUrl} - User: ${req.user ? req.user.username : 'anonymous'}`);

    // Don't expose internal errors in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.status(error.status || 500).json({
      success: false,
      error: isDevelopment ? error.message : 'İşlem sırasında hata oluştu',
      ...(isDevelopment && { stack: error.stack })
    });
  });

  // 404 handler for unmatched routes
  router.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'API endpoint bulunamadı',
      availableEndpoints: [
        'GET /web-api/health',
        'GET /web-api/info',
        'GET /web-api/docs',
        'POST /web-api/auth/login',
        'GET /web-api/user/dashboards',
        'GET /web-api/widgets/templates',
        'GET /web-api/products',
        'POST /web-api/media/upload',
        'GET /web-api/settings',
        'GET /web-api/system/currencies',
        'GET /web-api/sections',
        'GET /web-api/prices/live',
        'GET /web-api/prices/summary'
      ]
    });
  });

  return router;
}

module.exports = createWebApiRoutes;