const express = require('express');
const router = express.Router();
const { versionRoute, generateVersionDocs } = require('../middleware/apiVersioning');
const { asyncHandler } = require('../middleware/errorHandler');

// Get API version information
router.get('/versions', asyncHandler(async (req, res) => {
  const versions = generateVersionDocs();
  
  res.json({
    success: true,
    data: {
      current: req.apiVersion,
      available: versions,
      deprecation: versions.filter(v => v.status === 'deprecated').map(v => ({
        version: v.version,
        endDate: v.endDate,
        message: `Version ${v.version} is deprecated and will be removed after ${v.endDate}`
      }))
    }
  });
}));

// Version-specific health check
router.get('/health', versionRoute({
  v1: asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        version: 'v1',
        features: ['basic', 'dashboard', 'widgets', 'products', 'media'],
        timestamp: new Date().toISOString()
      }
    });
  }),
  v2: asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        version: 'v2',
        features: ['basic', 'dashboard', 'widgets', 'products', 'media', 'webhooks', 'analytics'],
        services: {
          database: 'connected',
          cache: 'connected',
          webhooks: 'active'
        },
        timestamp: new Date().toISOString()
      }
    });
  })
}));

// Version migration guide
router.get('/migration-guide', asyncHandler(async (req, res) => {
  const fromVersion = req.query.from || 'v1';
  const toVersion = req.query.to || 'v2';
  
  const guides = {
    'v1-v2': {
      breaking_changes: [
        {
          endpoint: '/user/dashboards',
          change: 'Response field "dashboardPreferences" renamed to "dashboardConfig"',
          migration: 'Update client code to use the new field name'
        },
        {
          endpoint: '/user/profile',
          change: 'Field "notificationPreferences" moved to "settings.notifications"',
          migration: 'Update data access path in client code'
        }
      ],
      new_features: [
        'Webhook support for real-time updates',
        'Advanced analytics endpoints',
        'Batch operations for better performance',
        'Enhanced error responses with detailed codes'
      ],
      deprecated: [
        {
          feature: 'Legacy authentication',
          alternative: 'Use JWT-based authentication',
          removal_date: '2025-06-01'
        }
      ]
    }
  };
  
  const guide = guides[`${fromVersion}-${toVersion}`];
  
  if (!guide) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'MIGRATION_GUIDE_NOT_FOUND',
        message: `No migration guide available from ${fromVersion} to ${toVersion}`
      }
    });
  }
  
  res.json({
    success: true,
    data: {
      from: fromVersion,
      to: toVersion,
      ...guide
    }
  });
}));

module.exports = router;