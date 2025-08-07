const { ApiError } = require('./errorHandler');

// API version configuration
const API_VERSIONS = {
  v1: {
    startDate: new Date('2024-01-01'),
    endDate: null, // Current version
    deprecated: false,
    features: ['basic', 'dashboard', 'widgets', 'products', 'media']
  },
  v2: {
    startDate: new Date('2025-01-01'),
    endDate: null,
    deprecated: false,
    features: ['basic', 'dashboard', 'widgets', 'products', 'media', 'webhooks', 'analytics']
  }
};

// Default version if not specified
const DEFAULT_VERSION = 'v1';

// Version extraction strategies
const extractVersion = (req) => {
  // 1. URL path versioning: /api/v1/resource
  const pathMatch = req.path.match(/\/v(\d+)\//);
  if (pathMatch) {
    return `v${pathMatch[1]}`;
  }

  // 2. Header versioning: X-API-Version: v1
  const headerVersion = req.headers['x-api-version'];
  if (headerVersion) {
    return headerVersion.startsWith('v') ? headerVersion : `v${headerVersion}`;
  }

  // 3. Query parameter versioning: ?version=v1
  const queryVersion = req.query.version;
  if (queryVersion) {
    return queryVersion.startsWith('v') ? queryVersion : `v${queryVersion}`;
  }

  // 4. Accept header versioning: Accept: application/vnd.api+json;version=1
  const acceptHeader = req.headers.accept;
  if (acceptHeader) {
    const versionMatch = acceptHeader.match(/version=(\d+)/);
    if (versionMatch) {
      return `v${versionMatch[1]}`;
    }
  }

  return DEFAULT_VERSION;
};

// Version validation middleware
const validateVersion = (req, res, next) => {
  const version = extractVersion(req);
  
  if (!API_VERSIONS[version]) {
    return next(ApiError.badRequest(`API version ${version} is not supported. Supported versions: ${Object.keys(API_VERSIONS).join(', ')}`));
  }

  const versionConfig = API_VERSIONS[version];
  
  // Check if version is deprecated
  if (versionConfig.deprecated) {
    res.set('X-API-Deprecation', 'true');
    res.set('X-API-Deprecation-Date', versionConfig.endDate?.toISOString());
    res.set('X-API-Deprecation-Info', `This API version is deprecated. Please migrate to a newer version.`);
  }

  // Store version in request for later use
  req.apiVersion = version;
  req.apiVersionConfig = versionConfig;
  
  // Add version to response headers
  res.set('X-API-Version', version);
  
  next();
};

// Version-specific route handler
const versionRoute = (versions) => {
  return (req, res, next) => {
    const currentVersion = req.apiVersion || DEFAULT_VERSION;
    
    if (!versions[currentVersion]) {
      return next(ApiError.notFound(`This endpoint is not available in API version ${currentVersion}`));
    }
    
    // Execute version-specific handler
    versions[currentVersion](req, res, next);
  };
};

// Feature availability checker
const checkFeature = (feature) => {
  return (req, res, next) => {
    const versionConfig = req.apiVersionConfig || API_VERSIONS[DEFAULT_VERSION];
    
    if (!versionConfig.features.includes(feature)) {
      return next(ApiError.notFound(`Feature '${feature}' is not available in API version ${req.apiVersion}`));
    }
    
    next();
  };
};

// Version migration helper
const versionMigration = {
  // Transform request data from old version to new version
  migrateRequest: (fromVersion, toVersion, data) => {
    const migrations = {
      'v1-v2': {
        // Example: Rename fields, restructure data
        user: (userData) => ({
          ...userData,
          dashboardConfig: userData.dashboardPreferences, // Renamed field
          settings: {
            ...userData.settings,
            notifications: userData.notificationPreferences // Moved field
          }
        })
      }
    };

    const migrationKey = `${fromVersion}-${toVersion}`;
    const migration = migrations[migrationKey];
    
    if (!migration) {
      return data;
    }

    // Apply migrations
    return Object.keys(migration).reduce((acc, key) => {
      if (data[key]) {
        acc[key] = migration[key](data[key]);
      }
      return acc;
    }, { ...data });
  },

  // Transform response data for backward compatibility
  migrateResponse: (targetVersion, currentVersion, data) => {
    const migrations = {
      'v2-v1': {
        // Example: Transform v2 response to v1 format
        user: (userData) => ({
          ...userData,
          dashboardPreferences: userData.dashboardConfig, // Restore old field name
          notificationPreferences: userData.settings?.notifications // Restore old location
        })
      }
    };

    const migrationKey = `${currentVersion}-${targetVersion}`;
    const migration = migrations[migrationKey];
    
    if (!migration) {
      return data;
    }

    // Apply migrations
    return Object.keys(migration).reduce((acc, key) => {
      if (data[key]) {
        acc[key] = migration[key](data[key]);
      }
      return acc;
    }, { ...data });
  }
};

// API version documentation generator
const generateVersionDocs = () => {
  return Object.entries(API_VERSIONS).map(([version, config]) => ({
    version,
    status: config.deprecated ? 'deprecated' : 'active',
    startDate: config.startDate,
    endDate: config.endDate,
    features: config.features,
    endpoints: {
      base: `/web-api/${version}`,
      documentation: `/web-api/${version}/docs`,
      health: `/web-api/${version}/health`
    }
  }));
};

// Middleware to handle version-specific responses
const versionResponse = (req, res, next) => {
  const originalJson = res.json;
  
  res.json = function(data) {
    // Add version metadata to successful responses
    if (data && data.success !== false) {
      data._metadata = {
        ...(data._metadata || {}),
        version: req.apiVersion,
        timestamp: new Date().toISOString()
      };
    }
    
    return originalJson.call(this, data);
  };
  
  next();
};

module.exports = {
  API_VERSIONS,
  DEFAULT_VERSION,
  extractVersion,
  validateVersion,
  versionRoute,
  checkFeature,
  versionMigration,
  generateVersionDocs,
  versionResponse
};