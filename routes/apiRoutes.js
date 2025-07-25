const express = require('express');
const LoggerHelper = require('../utils/logger');
const settingsService = require('../utils/settingsService');
const DateHelper = require('../utils/dateHelper');

function createApiRoutes(db) {
  const router = express.Router();

  // Source name'den ObjectId'ye mapping
  const sourceMapping = {
    'haremgold': '687d7bd957854b08834b744a',
    'altinkaynak': '687d679c8e03c87509d3edd6', 
    'hakangold': '687d7630bbd14de85a114ae8',
    'tcmb': '687d537c88abf1273ecaf39f',
    'haremgoldweb': '687d8a6e94075260a2698098'
  };

  // Models
  const ApiToken = require('../models/ApiToken');
  const ApiConnectionLog = require('../models/ApiConnectionLog');
  const CurrentPrices = require('../models/CurrentPrices');
  const PriceHistory = require('../models/PriceHistory');
  const Source = require('../models/Source');

  const apiToken = new ApiToken(db);
  const apiConnectionLog = new ApiConnectionLog(db);
  const currentPrices = new CurrentPrices(db);
  const priceHistory = new PriceHistory(db);
  const sourceModel = new Source(db);

  // Token doğrulama middleware
  const authenticateApiToken = async (req, res, next) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
      
      if (!token) {
        return res.status(401).json({
          error: 'API token required',
          message: 'Authorization header with Bearer token or token query parameter required'
        });
      }

      const domain = req.headers.origin || req.headers.referer || 'unknown';
      const extractedDomain = extractDomain(domain);
      
      // Önce token'ın varlığını kontrol et
      const rawToken = await apiToken.collection.findOne({ token: token });
      
      if (!rawToken) {
        await apiConnectionLog.logConnection({
          domain: extractedDomain,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          connectionType: 'api_request_failed',
          success: false,
          errorMessage: 'Token not found',
          metadata: { 
            endpoint: req.originalUrl,
            method: req.method,
            token: token.substring(0, 8) + '...'
          }
        });

        return res.status(401).json({
          error: 'Invalid token',
          message: 'Token not found or does not exist'
        });
      }

      // Token durumunu kontrol et
      if (!rawToken.isActive) {
        await apiConnectionLog.logConnection({
          domain: extractedDomain,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          connectionType: 'api_request_failed',
          success: false,
          errorMessage: 'Token is disabled',
          metadata: { 
            endpoint: req.originalUrl,
            method: req.method,
            token: token.substring(0, 8) + '...',
            tokenName: rawToken.name
          }
        });

        return res.status(401).json({
          error: 'Token disabled',
          message: 'This API token has been disabled by administrator'
        });
      }

      // Expiry date kontrolü
      if (rawToken.expiresAt && rawToken.expiresAt <= DateHelper.createDate()) {
        await apiConnectionLog.logConnection({
          domain: extractedDomain,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          connectionType: 'api_request_failed',
          success: false,
          errorMessage: 'Token expired',
          metadata: { 
            endpoint: req.originalUrl,
            method: req.method,
            token: token.substring(0, 8) + '...',
            tokenName: rawToken.name,
            expiresAt: rawToken.expiresAt
          }
        });

        return res.status(401).json({
          error: 'Token expired',
          message: `This token expired on ${rawToken.expiresAt.toISOString()}`,
          expiredAt: rawToken.expiresAt
        });
      }

      // Domain kontrolü
      if (rawToken.domain && rawToken.domain !== '*') {
        if (rawToken.domain !== extractedDomain && 
            !extractedDomain.includes(rawToken.domain) && 
            !rawToken.domain.includes('localhost')) {
          await apiConnectionLog.logConnection({
            domain: extractedDomain,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            connectionType: 'api_request_failed',
            success: false,
            errorMessage: 'Domain mismatch',
            metadata: { 
              endpoint: req.originalUrl,
              method: req.method,
              token: token.substring(0, 8) + '...',
              tokenName: rawToken.name,
              allowedDomain: rawToken.domain,
              requestDomain: extractedDomain
            }
          });

          return res.status(403).json({
            error: 'Domain not allowed',
            message: `This token is restricted to domain: ${rawToken.domain}`,
            allowedDomain: rawToken.domain,
            yourDomain: extractedDomain
          });
        }
      }

      // Validation başarılı - token'ı işle
      const tokenInfo = await apiToken.validate(token, extractedDomain);

      if (!tokenInfo) {
        await apiConnectionLog.logConnection({
          domain: extractedDomain,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          connectionType: 'api_request_failed',
          success: false,
          errorMessage: 'Token validation failed',
          metadata: { 
            endpoint: req.originalUrl,
            method: req.method,
            token: token.substring(0, 8) + '...'
          }
        });

        return res.status(401).json({
          error: 'Token validation failed',
          message: 'Token validation failed for unknown reason'
        });
      }

      // Log başarılı token - IP ve user agent bilgileriyle
      const logEntry = await apiConnectionLog.logConnection({
        tokenId: tokenInfo._id,
        tokenName: tokenInfo.name,
        domain: extractDomain(domain),
        ip: req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        connectionType: 'api_request',
        success: true,
        metadata: { 
          endpoint: req.originalUrl,
          method: req.method,
          permissions: tokenInfo.permissions,
          headers: {
            'x-forwarded-for': req.headers['x-forwarded-for'],
            'x-real-ip': req.headers['x-real-ip'],
            'user-agent': req.headers['user-agent'],
            'accept': req.headers['accept'],
            'accept-language': req.headers['accept-language']
          }
        }
      });

      req.tokenInfo = tokenInfo;
      req.connectionLogId = logEntry._id;
      
      next();
    } catch (error) {
      LoggerHelper.logError('system', error, 'API token authentication');
      res.status(500).json({
        error: 'Authentication error',
        message: 'Internal server error during authentication'
      });
    }
  };

  // İzin kontrolü middleware
  const requirePermission = (permission) => {
    return (req, res, next) => {
      if (!req.tokenInfo.permissions.includes(permission) && 
          !req.tokenInfo.permissions.includes('*')) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          message: `This endpoint requires '${permission}' permission`,
          requiredPermission: permission,
          yourPermissions: req.tokenInfo.permissions
        });
      }
      next();
    };
  };

  // Rate limiting middleware
  const rateLimiter = () => {
    const requests = new Map();
    
    return (req, res, next) => {
      const tokenId = req.tokenInfo._id.toString();
      const now = DateHelper.createDate().getTime();
      
      // Token'dan rate limit ayarlarını al
      const rateLimit = req.tokenInfo.rateLimit || { requests: 100, window: 60 };
      const maxRequests = rateLimit.requests || 100;
      const windowMs = (rateLimit.window || 60) * 1000; // saniyeyi milisaniyeye çevir

      if (!requests.has(tokenId)) {
        requests.set(tokenId, []);
      }

      const tokenRequests = requests.get(tokenId);
      const recentRequests = tokenRequests.filter(time => now - time < windowMs);

      if (recentRequests.length >= maxRequests) {
        const oldestRequest = Math.min(...tokenRequests);
        const retryAfter = Math.ceil((oldestRequest + windowMs - now) / 1000);
        
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: `Maximum ${maxRequests} requests per ${rateLimit.window} seconds allowed`,
          rateLimit: {
            requests: maxRequests,
            window: rateLimit.window,
            remaining: 0,
            resetTime: DateHelper.formatDateTime(new Date(oldestRequest + windowMs))
          },
          retryAfter: Math.max(retryAfter, 1)
        });
      }

      recentRequests.push(now);
      requests.set(tokenId, recentRequests);
      
      // Response header'larına rate limit bilgilerini ekle
      res.set({
        'X-RateLimit-Limit': maxRequests,
        'X-RateLimit-Window': rateLimit.window,
        'X-RateLimit-Remaining': Math.max(0, maxRequests - recentRequests.length),
        'X-RateLimit-Reset': DateHelper.formatDateTime(new Date(now + windowMs))
      });
      
      next();
    };
  };

  // API Info endpoint
  router.get('/info', (req, res) => {
    res.json({
      name: settingsService.getName() + ' API',
      version: settingsService.getApiVersion(),
      description: settingsService.getSiteDescription(),
      documentation: '/docs',
      endpoints: {
        prices: {
          current: '/api/prices/current',
          current_by_symbol: '/api/prices/current/:symbol',
          current_by_source: '/api/prices/source/:source',
          current_by_source_currency: '/api/prices/current/:source/:currency',
          history: '/api/prices/history',
          history_by_symbol: '/api/prices/history/:symbol',
          symbols: '/api/prices/symbols'
        },
        sources: {
          list: '/api/sources',
          currencies: '/api/currencies',
          source_currencies: '/api/sources/currencies'
        },
        system: {
          ping: '/api/ping',
          token_validation: '/api/token/validate'
        }
      },
      authentication: 'Bearer token required',
      server_info: {
        timezone: settingsService.getTimezone(),
        language: settingsService.getLanguage(),
        date_format: settingsService.getDateFormat(),
        time_format: settingsService.getTimeFormat()
      },
      timezone: {
        name: settingsService.getTimezone(),
        offset: DateHelper.getTimezoneOffset(),
        current_time: DateHelper.toLocalISOString(DateHelper.createDate())
      },
      timestamp: DateHelper.toLocalISOString(DateHelper.createDate())
    });
  });

  // Ping endpoint for health checks
  router.get('/ping', (req, res) => {
    res.json({
      success: true,
      message: 'pong',
      server_time: DateHelper.toLocalISOString(DateHelper.createDate()),
      timezone: {
        name: settingsService.getTimezone(),
        offset: DateHelper.getTimezoneOffset(),
        current_time: DateHelper.toLocalISOString(DateHelper.createDate())
      }
    });
  });

  // Token validation endpoint
  router.get('/token/validate', authenticateApiToken, (req, res) => {
    res.json({
      success: true,
      valid: true,
      token_info: {
        name: req.tokenInfo.name,
        permissions: req.tokenInfo.permissions,
        domain: req.tokenInfo.domain,
        rate_limit: req.tokenInfo.rateLimit
      },
      timezone: {
        name: settingsService.getTimezone(),
        offset: DateHelper.getTimezoneOffset(),
        current_time: DateHelper.toLocalISOString(DateHelper.createDate())
      },
      timestamp: DateHelper.toLocalISOString(DateHelper.createDate())
    });
  });

  // === CURRENT PRICES ENDPOINTS ===

  // Tüm kaynaklardan güncel fiyatlar - query parameter filtreleme ile
  router.get('/prices/current', authenticateApiToken, rateLimiter(), requirePermission('read'), async (req, res) => {
    try {
      const { source, symbol } = req.query;
      
      LoggerHelper.logInfo('api', 'Current prices endpoint called', {
        queryParams: { source, symbol },
        endpoint: '/prices/current',
        tokenName: req.tokenInfo?.name,
        timestamp: DateHelper.formatDateTime(DateHelper.createDate())
      });
      
      const filters = { isActive: true };
      
      // Source filtresi
      if (source) {
        const actualSource = sourceMapping[source] || source;
        filters.sourceId = actualSource;
        
        // Debug için log ekle
        LoggerHelper.logInfo('api', 'Source filter applied', {
          originalSource: source,
          mappedSource: actualSource,
          filterApplied: filters.sourceId
        });
      }
      
      // Symbol filtresi - tam eşleşme kullan
      if (symbol) {
        filters.symbol = symbol.toUpperCase();
        
        // Debug için log ekle
        LoggerHelper.logInfo('api', 'Symbol filter applied', {
          originalSymbol: symbol,
          filterApplied: filters.symbol
        });
      }
      
      // Debug için final filters'ı logla
      LoggerHelper.logInfo('api', 'Final query filters', {
        filters: JSON.stringify(filters, null, 2)
      });
      
      const prices = await currentPrices.getAll(filters);
      
      // Debug için sonuç sayısını logla
      LoggerHelper.logInfo('api', 'Query results', {
        resultCount: prices.length,
        hasResults: prices.length > 0
      });
      
      // sourceId'yi source name'ine çevir ve sourceId'yi kaldır
      const reverseMapping = {};
      Object.keys(sourceMapping).forEach(name => {
        reverseMapping[sourceMapping[name]] = name;
      });
      
      const processedPrices = prices.map(price => {
        const { sourceId, ...priceWithoutSourceId } = price;
        return {
          ...priceWithoutSourceId,
          source: reverseMapping[sourceId.toString()] || sourceId.toString()
        };
      });
      
      const formattedResponse = formatResponseWithTimezone(processedPrices, true);
      
      // Response filters için serialize et
      const responseFilters = { ...filters };
      if (responseFilters.sourceId) {
        responseFilters.source = source;
        delete responseFilters.sourceId;
      }
      
      res.json({
        success: true,
        data: formattedResponse.data,
        count: prices.length,
        filters: responseFilters,
        message: source || symbol ? 'Filtered current prices' : 'All current prices from all sources',
        timezone: formattedResponse.timezone,
        timestamp: formattedResponse.timezone.current_time
      });

    } catch (error) {
      LoggerHelper.logError('system', error, 'API current prices endpoint');
      res.status(500).json({
        error: 'Data retrieval failed',
        message: 'Unable to fetch current prices'
      });
    }
  });

  // Belirli sembolün güncel fiyatı - tüm kaynaklardan
  router.get('/prices/current/:symbol', authenticateApiToken, rateLimiter(), requirePermission('read'), async (req, res) => {
    try {
      const { symbol } = req.params;
      const { source } = req.query;
      
      // Eğer parametre bir source name ise, source endpoint'ine yönlendir
      if (sourceMapping[symbol] || ['altinkaynak', 'haremgold', 'hakangold', 'tcmb', 'haremgoldweb'].includes(symbol.toLowerCase())) {
        // Bu bir source name, source endpoint mantığını kullan
        const actualSource = sourceMapping[symbol] || symbol;
        
        LoggerHelper.logInfo('api', 'Source current prices endpoint (via symbol route)', {
          source: symbol,
          actualSource: actualSource,
          endpoint: '/prices/current/:symbol (redirected to source logic)',
          tokenName: req.tokenInfo?.name,
          timestamp: DateHelper.formatDateTime(DateHelper.createDate())
        });
        
        const filters = { sourceId: actualSource, isActive: true };
        const prices = await currentPrices.getAll(filters);
        
        if (prices.length === 0) {
          return res.status(404).json({
            error: 'Source not found or no data',
            message: `No active price data found for source: ${symbol}`,
            source: symbol
          });
        }
        
        // sourceId'yi source name'ine çevir ve sourceId'yi kaldır - reverse mapping
        const reverseMapping = {};
        Object.keys(sourceMapping).forEach(name => {
          reverseMapping[sourceMapping[name]] = name;
        });
        
        const processedPrices = prices.map(price => {
          const { sourceId, ...priceWithoutSourceId } = price;
          return {
            ...priceWithoutSourceId,
            source: reverseMapping[sourceId.toString()] || sourceId.toString()
          };
        });
        
        const formattedResponse = formatResponseWithTimezone(processedPrices, true);
        
        return res.json({
          success: true,
          data: formattedResponse.data,
          count: prices.length,
          source: symbol,
          message: `Current prices from ${symbol}`,
          timezone: formattedResponse.timezone,
          timestamp: formattedResponse.timezone.current_time
        });
      }
      
      // Bu bir symbol, normal symbol mantığını kullan
      LoggerHelper.logInfo('api', 'Symbol current price endpoint called', {
        symbol: symbol,
        source: source,
        endpoint: '/prices/current/:symbol',
        tokenName: req.tokenInfo?.name,
        timestamp: DateHelper.formatDateTime(DateHelper.createDate())
      });
      
      const filters = { symbol: symbol.toUpperCase(), isActive: true };
      
      // Source filtresi varsa ekle
      if (source) {
        const actualSource = sourceMapping[source] || source;
        filters.sourceId = actualSource;
      }
      
      const prices = await currentPrices.getAll(filters);
      
      if (prices.length === 0) {
        return res.status(404).json({
          error: 'Symbol not found',
          message: `No active price data found for symbol: ${symbol}`,
          symbol: symbol,
          source: source || 'any'
        });
      }
      
      // sourceId'yi source name'ine çevir ve sourceId'yi kaldır - reverse mapping
      const reverseMapping = {};
      Object.keys(sourceMapping).forEach(name => {
        reverseMapping[sourceMapping[name]] = name;
      });
      
      const processedPrices = prices.map(price => {
        const { sourceId, ...priceWithoutSourceId } = price;
        return {
          ...priceWithoutSourceId,
          source: reverseMapping[sourceId.toString()] || sourceId.toString()
        };
      });
      
      const formattedResponse = formatResponseWithTimezone(processedPrices, true);
      
      res.json({
        success: true,
        data: formattedResponse.data,
        count: prices.length,
        symbol: symbol,
        source: source || 'all',
        message: `Current prices for ${symbol} from ${source || 'all sources'}`,
        timezone: formattedResponse.timezone,
        timestamp: formattedResponse.timezone.current_time
      });

    } catch (error) {
      LoggerHelper.logError('system', error, 'API symbol current price endpoint');
      res.status(500).json({
        error: 'Data retrieval failed',
        message: 'Unable to fetch symbol price'
      });
    }
  });

  // Belirli kaynaktan güncel fiyatlar (yalnızca /source/ path ile erişilebilir)
  router.get('/prices/source/:source', authenticateApiToken, rateLimiter(), requirePermission('read'), async (req, res) => {
    try {
      const { source } = req.params;
      
      // Source name'i ObjectId'ye çevir
      const actualSource = sourceMapping[source] || source;
      
      LoggerHelper.logInfo('api', 'Source current prices endpoint called', {
        source: source,
        actualSource: actualSource,
        endpoint: '/prices/source/:source',
        tokenName: req.tokenInfo?.name,
        timestamp: DateHelper.formatDateTime(DateHelper.createDate())
      });
      
      const filters = { sourceId: actualSource, isActive: true };
      const prices = await currentPrices.getAll(filters);
      
      if (prices.length === 0) {
        return res.status(404).json({
          error: 'Source not found or no data',
          message: `No active price data found for source: ${source}`,
          source: source
        });
      }
      
      // sourceId'yi source name'ine çevir ve sourceId'yi kaldır - reverse mapping
      const reverseMapping = {};
      Object.keys(sourceMapping).forEach(name => {
        reverseMapping[sourceMapping[name]] = name;
      });
      
      const processedPrices = prices.map(price => {
        const { sourceId, ...priceWithoutSourceId } = price;
        return {
          ...priceWithoutSourceId,
          source: reverseMapping[sourceId.toString()] || sourceId.toString()
        };
      });
      
      const formattedResponse = formatResponseWithTimezone(processedPrices, true);
      
      res.json({
        success: true,
        data: formattedResponse.data,
        count: prices.length,
        source: source,
        message: `Current prices from ${source}`,
        timezone: formattedResponse.timezone,
        timestamp: formattedResponse.timezone.current_time
      });

    } catch (error) {
      LoggerHelper.logError('system', error, 'API source current prices endpoint');
      res.status(500).json({
        error: 'Data retrieval failed',
        message: 'Unable to fetch source prices'
      });
    }
  });

  // Belirli kaynak ve para biriminden güncel fiyat
  router.get('/prices/current/:source/:currency', authenticateApiToken, rateLimiter(), requirePermission('read'), async (req, res) => {
    try {
      const { source, currency } = req.params;
      
      // Source name'i ObjectId'ye çevir
      const actualSource = sourceMapping[source] || source;
      
      LoggerHelper.logInfo('api', 'Source currency current price endpoint called', {
        source: source,
        currency: currency,
        actualSource: actualSource,
        endpoint: '/prices/current/:source/:currency',
        tokenName: req.tokenInfo?.name,
        timestamp: DateHelper.formatDateTime(DateHelper.createDate())
      });
      
      const filters = { 
        sourceId: actualSource, 
        currency: currency.toUpperCase(), 
        isActive: true 
      };
      const prices = await currentPrices.getAll(filters);
      
      if (prices.length === 0) {
        return res.status(404).json({
          error: 'Data not found',
          message: `No active price data found for source: ${source} and currency: ${currency}`,
          source: source,
          currency: currency
        });
      }
      
      // sourceId'yi kaldır ve source olarak map et
      const processedPrices = prices.map(price => {
        const { sourceId, ...priceWithoutSourceId } = price;
        return {
          ...priceWithoutSourceId,
          source: source
        };
      });
      
      const formattedResponse = formatResponseWithTimezone(processedPrices, true);
      
      res.json({
        success: true,
        data: formattedResponse.data,
        count: prices.length,
        source: source,
        currency: currency,
        message: `Current prices from ${source} for ${currency}`,
        timezone: formattedResponse.timezone,
        timestamp: formattedResponse.timezone.current_time
      });

    } catch (error) {
      LoggerHelper.logError('system', error, 'API source currency current price endpoint');
      res.status(500).json({
        error: 'Data retrieval failed',
        message: 'Unable to fetch source currency price'
      });
    }
  });

  // Aktif semboller listesi
  router.get('/prices/symbols', authenticateApiToken, rateLimiter(), requirePermission('read'), async (req, res) => {
    try {
      const { source } = req.query;
      
      LoggerHelper.logInfo('api', 'Symbols endpoint called', {
        queryParams: { source },
        endpoint: '/prices/symbols',
        tokenName: req.tokenInfo?.name,
        timestamp: DateHelper.formatDateTime(DateHelper.createDate())
      });
      
      const filters = { isActive: true };
      
      // Source filtresi - ObjectId çevirimi
      if (source) {
        const actualSource = sourceMapping[source] || source;
        
        // MongoDB ObjectId tipine çevir
        const { ObjectId } = require('mongodb');
        if (typeof actualSource === 'string') {
          try {
            filters.sourceId = new ObjectId(actualSource);
          } catch (error) {
            filters.sourceId = actualSource;
          }
        } else {
          filters.sourceId = actualSource;
        }
        
        // Debug için log ekle
        LoggerHelper.logInfo('api', 'Symbols source filter applied', {
          originalSource: source,
          mappedSource: actualSource,
          filterApplied: filters.sourceId,
          filterType: typeof filters.sourceId
        });
      }
      
      // Debug için final filters'ı logla
      LoggerHelper.logInfo('api', 'Symbols final query filters', {
        filters: JSON.stringify(filters, null, 2)
      });

      const symbols = await currentPrices.collection.distinct('symbol', filters);
      
      // Debug için sonuç sayısını logla
      LoggerHelper.logInfo('api', 'Symbols query results', {
        symbolCount: symbols.length,
        symbols: symbols.sort()
      });
      
      // Response filters'ı temizle
      const responseFilters = {};
      if (source) responseFilters.source = source;
      
      res.json({
        success: true,
        data: symbols.sort(),
        count: symbols.length,
        filters: responseFilters,
        message: source ? `Available symbols from ${source}` : 'Available symbols from all sources',
        timezone: {
          name: settingsService.getTimezone(),
          offset: DateHelper.getTimezoneOffset(),
          current_time: DateHelper.toLocalISOString(DateHelper.createDate())
        },
        timestamp: DateHelper.toLocalISOString(DateHelper.createDate())
      });

    } catch (error) {
      LoggerHelper.logError('system', error, 'API symbols endpoint');
      res.status(500).json({
        error: 'Data retrieval failed',
        message: 'Unable to fetch symbols'
      });
    }
  });

  // === PRICE HISTORY ENDPOINTS ===

  // Symbol-based price history route - Enhanced with grouping and smart date limits
  router.get('/prices/history/:symbol', authenticateApiToken, rateLimiter(), requirePermission('read'), async (req, res) => {
    try {
      const { symbol } = req.params;
      const { 
        source,
        startDate, 
        endDate, 
        limit = 100,
        groupBy = 'hour' // hour, day, none
      } = req.query;

      LoggerHelper.logInfo('api', 'Symbol price history endpoint called', {
        symbol: symbol,
        source: source,
        startDate: startDate,
        endDate: endDate,
        groupBy: groupBy,
        limit: limit,
        endpoint: '/prices/history/:symbol',
        tokenName: req.tokenInfo?.name,
        timestamp: DateHelper.formatDateTime(DateHelper.createDate())
      });

      // groupBy validasyonu
      const validGroupBy = ['hour', 'day', 'none'];
      if (!validGroupBy.includes(groupBy)) {
        return res.status(400).json({
          error: 'Invalid groupBy parameter',
          message: `groupBy must be one of: ${validGroupBy.join(', ')}`,
          provided: groupBy,
          valid_options: validGroupBy
        });
      }

      // Tarih validasyonu
      let start, end;
      if (startDate || endDate) {
        start = startDate ? new Date(startDate) : null;
        end = endDate ? new Date(endDate) : null;

        if ((startDate && isNaN(start.getTime())) || (endDate && isNaN(end.getTime()))) {
          return res.status(400).json({
            error: 'Invalid date format',
            message: 'Date format must be YYYY-MM-DD',
            provided: { startDate, endDate }
          });
        }

        if (start && end && start >= end) {
          return res.status(400).json({
            error: 'Invalid date range',
            message: 'startDate must be before endDate',
            provided: { startDate, endDate }
          });
        }

        // Akıllı süre sınırı - gruplama tipine göre
        if (start && end) {
          let maxDays;
          let description;
          
          if (groupBy === 'day') {
            maxDays = 365; // Günlük gruplama için 1 yıl
            description = 'daily grouping';
          } else {
            maxDays = 30; // Saatlik/none için 1 ay
            description = 'hourly/raw data';
          }
          
          const daysDifference = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
          
          if (daysDifference > maxDays) {
            return res.status(400).json({
              error: 'Date range too large',
              message: `Maximum ${maxDays} days allowed for ${description}`,
              provided_days: daysDifference,
              max_days: maxDays,
              groupBy: groupBy,
              suggestion: groupBy === 'day' 
                ? `Daily grouping allows up to 1 year (${maxDays} days)`
                : `For longer periods, use groupBy=day (up to 1 year)`
            });
          }
        }
      }

      // Varsayılan tarih aralığı - gruplama tipine göre
      if (!startDate && !endDate) {
        end = DateHelper.createDate();
        if (groupBy === 'day') {
          start = new Date(end.getTime() - (7 * 24 * 60 * 60 * 1000)); // 7 gün önce (günlük için)
        } else {
          start = new Date(end.getTime() - (24 * 60 * 60 * 1000)); // 24 saat önce (saatlik/raw için)
        }
      }

      // Source mapping - string'i ObjectId'ye çevir
      let actualSource = null;
      if (source) {
        actualSource = sourceMapping[source] || source;
        LoggerHelper.logInfo('api', 'Source mapping', {
          originalSource: source,
          mappedSource: actualSource,
          endpoint: '/prices/history/:symbol'
        });
      }

      // PriceHistory model ile veri getir
      const options = {
        source: actualSource,
        startDate: start,
        endDate: end,
        limit: parseInt(limit),
        interval: groupBy === 'none' ? 'none' : groupBy
      };

      const history = await priceHistory.getHistory(symbol, options);

      if (history.length === 0) {
        return res.status(404).json({
          error: 'No data found',
          message: `No price history found for symbol: ${symbol}`,
          symbol: symbol,
          source: source || 'all sources',
          filters: {
            symbol: symbol,
            source: source,
            startDate: start ? start.toISOString().split('T')[0] : null,
            endDate: end ? end.toISOString().split('T')[0] : null,
            groupBy: groupBy,
            limit: parseInt(limit)
          }
        });
      }

      // Source mapping ve data cleaning
      const reverseMapping = {};
      Object.keys(sourceMapping).forEach(name => {
        reverseMapping[sourceMapping[name]] = name;
      });
      
      const cleanedHistory = history.map(record => {
        const { timestamp, metadata, ...cleanRecord } = record;
        
        // source ObjectId'sini sourceId yap, source'a human-readable name koy
        const sourceObjectId = cleanRecord.source;
        const sourceName = reverseMapping[sourceObjectId?.toString()] || (source || 'unknown');
        
        return {
          ...cleanRecord,
          source: sourceName,           // Human-readable name (altinkaynak)
          sourceId: sourceObjectId      // ObjectId
        };
      });
      
      const formattedResponse = formatResponseWithTimezone(cleanedHistory, true);
      
      res.json({
        success: true,
        data: formattedResponse.data,
        count: cleanedHistory.length,
        symbol: symbol,
        source: source || 'all sources',
        grouping: {
          type: groupBy,
          description: groupBy === 'day' ? 'Daily averages' 
                     : groupBy === 'hour' ? 'Hourly averages' 
                     : 'Raw data points'
        },
        date_range: {
          start: start ? start.toISOString().split('T')[0] : null,
          end: end ? end.toISOString().split('T')[0] : null,
          days: start && end ? Math.ceil((end - start) / (1000 * 60 * 60 * 24)) : null
        },
        filters: {
          symbol: symbol,
          source: source,
          startDate: start ? start.toISOString().split('T')[0] : null,
          endDate: end ? end.toISOString().split('T')[0] : null,
          groupBy: groupBy,
          limit: parseInt(limit)
        },
        message: `${groupBy === 'day' ? 'Daily' : groupBy === 'hour' ? 'Hourly' : 'Raw'} price history for ${symbol} from ${source || 'all sources'}`,
        timezone: formattedResponse.timezone,
        timestamp: formattedResponse.timezone.current_time
      });

    } catch (error) {
      LoggerHelper.logError('system', error, 'API symbol price history endpoint');
      res.status(500).json({
        error: 'Data retrieval failed',
        message: 'Unable to fetch price history'
      });
    }
  });

  // Fiyat geçmişi - kaynak ve para birimi zorunlu, max 30 gün
  router.get('/prices/history', authenticateApiToken, rateLimiter(), requirePermission('read'), async (req, res) => {
    try {
      const { 
        source, 
        currency,
        startDate, 
        endDate, 
        limit = 1000
      } = req.query;

      // Zorunlu parametreleri kontrol et
      if (!source) {
        return res.status(400).json({
          error: 'Missing required parameter',
          message: 'Source parameter is required',
          required_parameters: ['source', 'currency']
        });
      }

      if (!currency) {
        return res.status(400).json({
          error: 'Missing required parameter',
          message: 'Currency parameter is required',
          required_parameters: ['source', 'currency']
        });
      }

      if (!startDate || !endDate) {
        return res.status(400).json({
          error: 'Missing required parameters',
          message: 'Both startDate and endDate are required',
          required_parameters: ['source', 'currency', 'startDate', 'endDate'],
          format: 'YYYY-MM-DD'
        });
      }

      // Tarih validasyonu
      const start = new Date(startDate);
      const end = new Date(endDate);
      const now = DateHelper.createDate();

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          error: 'Invalid date format',
          message: 'Date format must be YYYY-MM-DD',
          provided: { startDate, endDate }
        });
      }

      if (start >= end) {
        return res.status(400).json({
          error: 'Invalid date range',
          message: 'startDate must be before endDate',
          provided: { startDate, endDate }
        });
      }

      // 30 günlük sınır kontrolü
      const maxDays = 30;
      const daysDifference = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      
      if (daysDifference > maxDays) {
        return res.status(400).json({
          error: 'Date range too large',
          message: `Maximum ${maxDays} days allowed`,
          provided_days: daysDifference,
          max_days: maxDays,
          suggestion: `Please reduce the date range to ${maxDays} days or less`
        });
      }

      // Source name'i ObjectId'ye çevir
      const actualSource = sourceMapping[source] || source;
      
      LoggerHelper.logInfo('api', 'Price history endpoint called', {
        source: source,
        currency: currency,
        actualSource: actualSource,
        startDate: startDate,
        endDate: endDate,
        daysDifference: daysDifference,
        endpoint: '/prices/history',
        tokenName: req.tokenInfo?.name,
        timestamp: DateHelper.formatDateTime(DateHelper.createDate())
      });

      const filters = {
        sourceId: actualSource,
        currency: currency.toUpperCase(),
        timestamp: {
          $gte: start,
          $lte: end
        }
      };

      // Debug logging
      LoggerHelper.logInfo('api', 'Price history filters and query', {
        filters: filters,
        filtersStringified: JSON.stringify(filters),
        collectionName: 'priceHistory',
        endpoint: '/prices/history'
      });

      const history = await priceHistory.collection.find(filters)
        .sort({ timestamp: -1 })
        .limit(parseInt(limit))
        .toArray();

      // Debug result count
      LoggerHelper.logInfo('api', 'Price history query results', {
        resultCount: history.length,
        hasResults: history.length > 0,
        endpoint: '/prices/history'
      });

      if (history.length === 0) {
        return res.status(404).json({
          error: 'No data found',
          message: `No price history found for source: ${source}, currency: ${currency} in the specified date range`,
          filters: {
            source: source,
            currency: currency,
            startDate: startDate,
            endDate: endDate
          }
        });
      }

      // sourceId'yi source olarak map et, timestamp ve metadata'yı kaldır
      const processedHistory = history.map(item => {
        const { timestamp, metadata, ...cleanItem } = item;
        
        // Eğer sourceId alanı varsa onu sourceId olarak tut, source'a human-readable name koy
        const sourceObjectId = cleanItem.sourceId || cleanItem.source;
        
        return {
          ...cleanItem,
          source: source,              // Human-readable name
          sourceId: sourceObjectId     // ObjectId (eğer varsa)
        };
      });

      const formattedResponse = formatResponseWithTimezone(processedHistory, true);
      
      res.json({
        success: true,
        data: formattedResponse.data,
        count: processedHistory.length,
        filters: {
          source: source,
          currency: currency,
          startDate: startDate,
          endDate: endDate,
          days_requested: daysDifference,
          limit: parseInt(limit)
        },
        message: `Price history for ${source} - ${currency} (${daysDifference} days)`,
        timezone: formattedResponse.timezone,
        timestamp: formattedResponse.timezone.current_time
      });

    } catch (error) {
      LoggerHelper.logError('system', error, 'API price history endpoint');
      res.status(500).json({
        error: 'Data retrieval failed',
        message: 'Unable to fetch price history'
      });
    }
  });

  // === SOURCES ENDPOINTS ===

  // Kaynak listesi
  router.get('/sources', authenticateApiToken, rateLimiter(), requirePermission('read'), async (req, res) => {
    try {
      const { isActive, category, type } = req.query;
      
      const filters = {};
      if (isActive !== undefined) {
        filters.isActive = isActive === 'true';
      } else {
        filters.isActive = true;
      }
      if (category) filters.category = category;
      if (type) filters.type = type;

      const sources = await sourceModel.list(filters);
      const filteredSources = sources.map(source => DateHelper.filterSourceForApi(source));
      
      res.json({
        success: true,
        data: filteredSources,
        count: sources.length,
        filters: filters,
        message: 'Available data sources',
        timezone: {
          name: settingsService.getTimezone(),
          offset: DateHelper.getTimezoneOffset(),
          current_time: DateHelper.toLocalISOString(DateHelper.createDate())
        },
        timestamp: DateHelper.toLocalISOString(DateHelper.createDate())
      });

    } catch (error) {
      LoggerHelper.logError('system', error, 'API sources endpoint');
      res.status(500).json({
        error: 'Data retrieval failed', 
        message: 'Unable to fetch sources'
      });
    }
  });


  // Para birimleri listesi
  router.get('/currencies', authenticateApiToken, rateLimiter(), requirePermission('read'), async (req, res) => {
    try {
      LoggerHelper.logInfo('api', 'Currencies endpoint called', {
        endpoint: '/currencies',
        tokenName: req.tokenInfo?.name,
        timestamp: DateHelper.formatDateTime(DateHelper.createDate())
      });
      
      const currencies = await currentPrices.collection.distinct('currency', { isActive: true });
      
      res.json({
        success: true,
        data: currencies.sort(),
        count: currencies.length,
        message: 'Available currencies',
        timezone: {
          name: settingsService.getTimezone(),
          offset: DateHelper.getTimezoneOffset(),
          current_time: DateHelper.toLocalISOString(DateHelper.createDate())
        },
        timestamp: DateHelper.toLocalISOString(DateHelper.createDate())
      });

    } catch (error) {
      LoggerHelper.logError('system', error, 'API currencies endpoint');
      res.status(500).json({
        error: 'Data retrieval failed',
        message: 'Unable to fetch currencies'
      });
    }
  });

  // Kaynak-para birimi kombinasyonları
  router.get('/sources/currencies', authenticateApiToken, rateLimiter(), requirePermission('read'), async (req, res) => {
    try {
      LoggerHelper.logInfo('api', 'Source currencies endpoint called', {
        endpoint: '/sources/currencies',
        tokenName: req.tokenInfo?.name,
        timestamp: DateHelper.formatDateTime(DateHelper.createDate())
      });
      
      // Her kaynak için mevcut para birimlerini getir
      const sourceCurrencies = await currentPrices.collection.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: '$sourceId',
            currencies: { $addToSet: '$currency' }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]).toArray();

      // sourceId'leri source name'lere çevir
      const reverseMapping = {};
      Object.keys(sourceMapping).forEach(name => {
        reverseMapping[sourceMapping[name]] = name;
      });

      const processedData = sourceCurrencies.map(item => ({
        source: reverseMapping[item._id.toString()] || item._id.toString(),
        sourceId: item._id,
        currencies: item.currencies.sort(),
        currency_count: item.currencies.length
      }));
      
      res.json({
        success: true,
        data: processedData,
        count: processedData.length,
        message: 'Available currencies by source',
        timezone: {
          name: settingsService.getTimezone(),
          offset: DateHelper.getTimezoneOffset(),
          current_time: DateHelper.toLocalISOString(DateHelper.createDate())
        },
        timestamp: DateHelper.toLocalISOString(DateHelper.createDate())
      });

    } catch (error) {
      LoggerHelper.logError('system', error, 'API source currencies endpoint');
      res.status(500).json({
        error: 'Data retrieval failed',
        message: 'Unable to fetch source currencies'
      });
    }
  });

  // Spesifik kaynak verisi
  router.get('/sources/:sourceId/data', authenticateApiToken, rateLimiter(), requirePermission('read'), async (req, res) => {
    try {
      const { sourceId } = req.params;
      const { limit = 50 } = req.query;
      
      // Source name'i ObjectId'ye çevir
      const actualSourceId = sourceMapping[sourceId] || sourceId;
      
      LoggerHelper.logInfo('api', 'Source data endpoint called', {
        sourceId: sourceId,
        actualSourceId: actualSourceId,
        limit: limit,
        endpoint: '/sources/:sourceId/data',
        tokenName: req.tokenInfo?.name,
        timestamp: DateHelper.formatDateTime(DateHelper.createDate())
      });
      
      // Kaynak bazlı güncel fiyatlar
      const prices = await currentPrices.getAll({ 
        sourceId: actualSourceId, 
        isActive: true 
      });

      if (prices.length === 0) {
        return res.status(404).json({
          error: 'Source not found or no data',
          message: `No active data found for source: ${sourceId}`,
          sourceId: sourceId
        });
      }

      // sourceId'yi kaldır ve source olarak map et
      const processedPrices = prices.map(price => {
        const { sourceId: priceSourceId, ...priceWithoutSourceId } = price;
        return {
          ...priceWithoutSourceId,
          source: sourceId
        };
      });

      const formattedResponse = formatResponseWithTimezone(processedPrices, true);

      res.json({
        success: true,
        data: formattedResponse.data,
        count: processedPrices.length,
        sourceId: sourceId,
        message: `Data from ${sourceId}`,
        timezone: formattedResponse.timezone,
        timestamp: formattedResponse.timezone.current_time
      });

    } catch (error) {
      LoggerHelper.logError('system', error, 'API source data endpoint');
      res.status(500).json({
        error: 'Data retrieval failed',
        message: 'Unable to fetch source data'
      });
    }
  });

  // === REAL-TIME ENDPOINTS ===

  // WebSocket bağlantı bilgisi
  router.get('/websocket/info', authenticateApiToken, rateLimiter(), requirePermission('read'), (req, res) => {
    res.json({
      success: true,
      websocket: {
        url: `ws://${req.headers.host}`,
        authentication: 'Token required in auth parameter',
        channels: [
          'price',      // Fiyat güncellemeleri
          'system',     // Sistem komutları
          'alerts',     // Anomali uyarıları
          'altinkaynak',// AltınKaynak verileri (687d679c8e03c87509d3edd6)
          'hakangold',  // Hakan Altın verileri (687d7630bbd14de85a114ae8)
          'haremgold',  // Harem Altın verileri (687d7bd957854b08834b744a)
          'haremgoldweb', // Harem Altın Web verileri (687d8a6e94075260a2698098)
          'tcmb'        // TCMB verileri (687d537c88abf1273ecaf39f)
        ],
        events: {
          subscribe: 'Kanala abone ol',
          unsubscribe: 'Kanaldan ayrıl',
          price_update: 'Fiyat güncellemesi',
          anomaly_alert: 'Anomali uyarısı',
          system_command: 'Sistem komutu'
        }
      },
      timezone: {
        name: settingsService.getTimezone(),
        offset: DateHelper.getTimezoneOffset(),
        current_time: DateHelper.toLocalISOString(DateHelper.createDate())
      },
      timestamp: DateHelper.toLocalISOString(DateHelper.createDate())
    });
  });


  // === STATISTICS ENDPOINTS ===

  // API istatistikleri
  router.get('/stats', authenticateApiToken, rateLimiter(), requirePermission('admin'), async (req, res) => {
    try {
      const stats = {
        prices: {
          total: await currentPrices.collection.countDocuments(),
          active: await currentPrices.collection.countDocuments({ isActive: true }),
          bySources: await currentPrices.collection.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: '$source', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ]).toArray()
        },
        sources: {
          total: await sourceModel.collection.countDocuments(),
          active: await sourceModel.collection.countDocuments({ isActive: true })
        },
        history: {
          total: await priceHistory.collection.countDocuments(),
          last24h: await priceHistory.collection.countDocuments({
            timestamp: { $gte: new Date(DateHelper.createDate().getTime() - 24 * 60 * 60 * 1000) }
          })
        },
        timezone: {
        name: settingsService.getTimezone(),
        offset: DateHelper.getTimezoneOffset(),
        current_time: DateHelper.toLocalISOString(DateHelper.createDate())
      },
      timestamp: DateHelper.toLocalISOString(DateHelper.createDate())
      };

      res.json({
        success: true,
        data: stats,
        timezone: {
        name: settingsService.getTimezone(),
        offset: DateHelper.getTimezoneOffset(),
        current_time: DateHelper.toLocalISOString(DateHelper.createDate())
      },
      timestamp: DateHelper.toLocalISOString(DateHelper.createDate())
      });

    } catch (error) {
      LoggerHelper.logError('system', error, 'API stats endpoint');
      res.status(500).json({
        error: 'Stats retrieval failed',
        message: 'Unable to fetch statistics'
      });
    }
  });

  // Yardımcı fonksiyonlar
  function extractDomain(url) {
    if (!url) return 'unknown';
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        return 'localhost';
      }
      return url;
    }
  }

  // API Response tarihlerini local timezone'a dönüştür
  function formatResponseWithTimezone(data, isArray = false) {
    const timezone = settingsService.getTimezone();
    const timezoneOffset = DateHelper.getTimezoneOffset();
    
    let convertedData;
    
    if (isArray && Array.isArray(data)) {
      convertedData = DateHelper.convertArrayDates(data);
    } else if (data && typeof data === 'object') {
      convertedData = DateHelper.convertObjectDates(data);
    } else {
      convertedData = data;
    }
    
    return {
      data: convertedData,
      timezone: {
        name: timezone,
        offset: timezoneOffset,
        current_time: DateHelper.toLocalISOString(DateHelper.createDate())
      }
    };
  }

  return router;
}

module.exports = createApiRoutes;