require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { engine } = require('express-handlebars');
const path = require('path');
const DataEmitter = require('./dataEmitter');
const LoggerHelper = require('./utils/logger');
const DateHelper = require('./utils/dateHelper');
const settingsService = require('./utils/settingsService');
const devLogger = require('./utils/devLogger');

const app = express();
const httpServer = createServer(app);
// Socket.IO server (settings dinamik olarak yüklenecek)
let io;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Handlebars view engine
app.engine('hbs', engine({
  extname: 'hbs',
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  partialsDir: path.join(__dirname, 'views/partials'),
  helpers: {
    eq: (a, b) => {
      // Handle MongoDB ObjectId comparison
      if (a && b) {
        const aStr = a.toString ? a.toString() : String(a);
        const bStr = b.toString ? b.toString() : String(b);
        return aStr === bStr;
      }
      return a === b;
    },
    or: (a, b) => a || b,
    gt: (a, b) => a > b,
    lt: (a, b) => a < b,
    typeof: (value) => typeof value,
    json: (obj) => JSON.stringify(obj),
    jsonP: (obj) => JSON.stringify(obj, null, 2),
    len: (array) => Array.isArray(array) ? array.length : 0,
    formatBytes: (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    math: (a, operator, b) => {
      switch (operator) {
        case '+': return Number(a) + Number(b);
        case '-': return Number(a) - Number(b);
        case '*': return Number(a) * Number(b);
        case '/': return Number(a) / Number(b);
        case '%': return Number(a) % Number(b);
        default: return 0;
      }
    },
    inc: (value) => parseInt(value) + 1,
    includes: (array, value) => {
      if (!Array.isArray(array)) return false;
      return array.includes(value);
    },
    formatDateTR: (date) => {
      if (!date) return '-';
      const dateObj = new Date(date);
      return dateObj.toLocaleString('tr-TR', {
        timeZone: 'Europe/Istanbul',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    },
    formatTimeTR: (date) => {
      if (!date) return '-';
      const dateObj = new Date(date);
      return dateObj.toLocaleTimeString('tr-TR', {
        timeZone: 'Europe/Istanbul'
      });
    },
    countActive: (items) => {
      if (!Array.isArray(items)) return 0;
      return items.filter(item => item.isActive).length;
    },
    countByType: (items, type, field) => {
      try {
        if (!Array.isArray(items)) return 0;
        if (!field || typeof field !== 'string') field = 'type';
        
        return items.filter(item => {
          if (!item) return false;
          
          if (field.includes('.')) {
            const keys = field.split('.');
            let value = item;
            for (const key of keys) {
              value = value && value[key];
            }
            return value === type;
          }
          return item[field] === type;
        }).length;
      } catch (error) {
        console.error('countByType error:', error, 'params:', items, type, field);
        return 0;
      }
    },
    countMappedCurrencies: (currencies) => {
      try {
        if (!Array.isArray(currencies)) return 0;
        return currencies.filter(currency => {
          if (!currency) return false;
          // activeSources array'i varsa onu kullan (gerçekten eşleştirme olan)
          if (currency.activeSources && currency.activeSources.length > 0) {
            return true;
          }
          // Fallback: sources array'i veya priceMappings objesine sahip olanları say
          const hasSources = currency.sources && currency.sources.length > 0;
          const hasPriceMappings = currency.priceMappings && Object.keys(currency.priceMappings).length > 0;
          return hasSources || hasPriceMappings;
        }).length;
      } catch (error) {
        console.error('countMappedCurrencies error:', error);
        return 0;
      }
    },
    countWithLogin: (users) => {
      if (!Array.isArray(users)) return 0;
      return users.filter(user => user.lastLogin).length;
    },
    countAdminUsers: (users) => {
      if (!Array.isArray(users)) return 0;
      return users.filter(user => user.role === 'admin').length;
    },
    countManagerUsers: (users) => {
      if (!Array.isArray(users)) return 0;
      return users.filter(user => user.role === 'manager').length;
    },
    countRegularUsers: (users) => {
      if (!Array.isArray(users)) return 0;
      return users.filter(user => user.role === 'user').length;
    },
    countApiSources: (sources) => {
      if (!Array.isArray(sources)) return 0;
      return sources.filter(source => source.type === 'api').length;
    },
    countForexMappings: (mappings) => {
      if (!Array.isArray(mappings)) return 0;
      return mappings.filter(mapping => mapping.targetType === 'forex').length;
    },
    countGoldMappings: (mappings) => {
      if (!Array.isArray(mappings)) return 0;
      return mappings.filter(mapping => mapping.targetType === 'gold').length;
    },
    contains: (array, value) => {
      if (!Array.isArray(array)) return false;
      return array.includes(value);
    },
    formatDate: (date) => DateHelper.formatDate(date),
    formatDateShort: (date) => DateHelper.formatDate(date),
    formatDateTime: (date, format) => DateHelper.formatDateTime(date, format),
    formatDateTimeLong: (date) => DateHelper.formatDateTimeLong(date),
    formatRelative: (date) => DateHelper.formatRelative(date),
    formatTime: (date) => DateHelper.formatDateTime(date, 'HH:mm:ss'),
    fromNow: (date) => DateHelper.formatRelative(date),
    getCurrentTimezone: () => DateHelper.getCurrentTimezone(),
    now: () => DateHelper.createDate(),
    formatNumber: (num, decimals) => {
      if (typeof num !== 'number') return num || '-';
      // decimals parametresi geçerli bir sayı mı kontrol et (0-20 arası olmalı)
      let dec = 2; // varsayılan
      if (typeof decimals === 'number' && decimals >= 0 && decimals <= 20) {
        dec = Math.floor(decimals);
      }
      return Number(num).toLocaleString('tr-TR', { 
        minimumFractionDigits: dec,
        maximumFractionDigits: dec 
      });
    },
    formatDecimal: (num, decimals) => {
      if (typeof num !== 'number') return num || '-';
      return Number(num).toFixed(decimals || 2);
    },
    json: (context) => {
      return JSON.stringify(context);
    },
    buildQuery: (filters, page) => {
      const params = new URLSearchParams();
      if (filters.source) params.set('source', filters.source);
      if (filters.symbol) params.set('symbol', filters.symbol);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.limit) params.set('limit', filters.limit);
      if (page) params.set('page', page);
      return params.toString();
    },
    add: (a, b) => a + b,
    sub: (a, b) => a - b,
    and: (...args) => {
      // Son argument options objesi olduğu için çıkar
      const values = args.slice(0, -1);
      return values.every(v => v);
    }
  }
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/downloads', express.static(path.join(__dirname, 'public/downloads')));

// Global res.locals middleware - timezone-aware client functions
app.use((req, res, next) => {
  // Server timezone bilgisini client-side'da kullanılabilir hale getir
  const currentTimezone = DateHelper.getCurrentTimezone();
  
  // Client-side DateHelper JavaScript kodu
  res.locals.clientDateHelperScript = `
<script>
// Global Client-side DateHelper - timezone-aware tarih fonksiyonları
window.ClientDateHelper = {
    timezone: '${currentTimezone}',
    
    // Timezone-aware şimdiki zaman
    now() {
        return new Date().toLocaleString('tr-TR', { 
            timeZone: this.timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    },
    
    // Timezone-aware time string
    toTimeString() {
        return new Date().toLocaleTimeString('tr-TR', { 
            timeZone: this.timezone 
        });
    },
    
    // Timezone-aware locale string
    toLocaleString(date) {
        const d = date ? new Date(date) : new Date();
        return d.toLocaleString('tr-TR', { 
            timeZone: this.timezone 
        });
    },
    
    // Timezone-aware ISO string
    toISOString(date) {
        const d = date ? new Date(date) : new Date();
        return d.toLocaleString('tr-TR', { 
            timeZone: this.timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).replace(/(\\d+)\\.(\\d+)\\.(\\d+) (\\d+):(\\d+):(\\d+)/, '$3-$2-$1T$4:$5:$6');
    },
    
    // Timezone-aware date for file names (YYYY-MM-DD)
    toISODate() {
        return new Date().toLocaleDateString('sv-SE', { 
            timeZone: this.timezone 
        });
    },
    
    // Tarih formatting için
    formatDate(dateStr) {
        return this.toLocaleString(dateStr);
    }
};
</script>`;
  
  next();
});

// Session configuration (settings yüklendikten sonra dinamik olarak ayarlanacak)
let sessionMiddleware;

let db;
let mongoClient;
let apiToken;
let apiConnectionLog;
let dataEmitter;
const clients = new Map();

const mongoUri = process.env.MONGODB_URI;
const mongoOptions = {
  auth: {
    username: process.env.MONGODB_USERNAME,
    password: process.env.MONGODB_PASSWORD
  }
};

async function connectToDatabase() {
  try {
    mongoClient = new MongoClient(mongoUri, mongoOptions);
    await mongoClient.connect();
    db = mongoClient.db();
    
    // API Token modeli başlat
    const ApiToken = require('./models/ApiToken');
    apiToken = new ApiToken(db);
    
    // API Connection Log modeli başlat
    const ApiConnectionLog = require('./models/ApiConnectionLog');
    apiConnectionLog = new ApiConnectionLog(db);
    
    LoggerHelper.logSuccess('system', 'MongoDB bağlantısı başarılı');
  } catch (error) {
    console.error('MongoDB bağlantı hatası:', error);
    process.exit(1);
  }
}

app.get('/', (req, res) => {
  res.json({ message: 'Server çalışıyor!' });
});

// Socket middleware ve event handler'ları startServer fonksiyonuna taşındı

function setupSocketHandlers() {
  // Token doğrulama middleware'i
  io.use(async (socket, next) => {
    let connectionLogId = null;
    
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      const domain = socket.handshake.headers.origin || socket.handshake.headers.referer;
      const ip = socket.handshake.address;
      const userAgent = socket.handshake.headers['user-agent'];
      
      devLogger.debug('SocketServer', '[Socket] Token doğrulama başladı:', {
        token: token ? token.substring(0, 20) + '...' : 'YOK',
        domain: domain,
        extractedDomain: extractDomain(domain),
        ip: ip
      });

      // Eğer token yoksa, normal bağlantıya izin ver (ana sunucu için)
      if (!token) {
        devLogger.debug('SocketServer', '[Socket] Token olmadan bağlantı (ana sunucu modu)');
        socket.isTokenAuth = false;
        
        // Token olmadan bağlantı logu
        if (apiConnectionLog) {
          const logEntry = await apiConnectionLog.logConnection({
            domain: extractDomain(domain),
            ip: ip,
            userAgent: userAgent,
            connectionType: 'socket_no_token',
            success: true,
            metadata: { socketId: socket.id }
          });
          connectionLogId = logEntry._id;
          socket.connectionLogId = connectionLogId;
        }
        
        return next();
      }

      // Token varsa doğrula
      if (apiToken && apiConnectionLog) {
        const validToken = await apiToken.validate(token, extractDomain(domain));
        
        devLogger.debug('SocketServer', '[Socket] Token doğrulama sonucu:', {
          valid: !!validToken,
          tokenDomain: validToken?.domain,
          permissions: validToken?.permissions
        });
        
        if (!validToken) {
          devLogger.debug('SocketServer', '[Socket] Token geçersiz');
          
          // Başarısız bağlantı logu
          await apiConnectionLog.logConnection({
            domain: extractDomain(domain),
            ip: ip,
            userAgent: userAgent,
            connectionType: 'socket',
            success: false,
            errorMessage: 'Geçersiz veya süresi dolmuş token',
            metadata: { socketId: socket.id, token: token.substring(0, 8) + '...' }
          });
          
          return next(new Error('Geçersiz veya süresi dolmuş token'));
        }

        // Token bilgilerini socket'e ekle
        socket.tokenInfo = {
          tokenId: validToken._id,
          tokenName: validToken.name,
          domain: validToken.domain,
          permissions: validToken.permissions,
          allowedChannels: validToken.allowedChannels,
          rateLimit: validToken.rateLimit
        };
        socket.isTokenAuth = true;
        
        // Başarılı bağlantı logu
        const logEntry = await apiConnectionLog.logConnection({
          tokenId: validToken._id,
          tokenName: validToken.name,
          domain: extractDomain(domain),
          ip: ip,
          userAgent: userAgent,
          connectionType: 'socket',
          success: true,
          metadata: { 
            socketId: socket.id,
            permissions: validToken.permissions,
            allowedChannels: validToken.allowedChannels 
          }
        });
        connectionLogId = logEntry._id;
        socket.connectionLogId = connectionLogId;
        
        devLogger.debug('SocketServer', '[Socket] Token doğrulama başarılı:', socket.tokenInfo);
      }

      next();
    } catch (error) {
      console.error('[Socket] Token doğrulama hatası:', error);
      
      // Hata logu
      if (apiConnectionLog) {
        await apiConnectionLog.logConnection({
          ip: socket.handshake.address,
          userAgent: socket.handshake.headers['user-agent'],
          connectionType: 'socket',
          success: false,
          errorMessage: error.message,
          metadata: { socketId: socket.id }
        });
      }
      
      next(new Error('Token doğrulanamadı: ' + error.message));
    }
  });

  io.on('connection', (socket) => {
  const authType = socket.isTokenAuth ? 'Token' : 'Normal';
  const domain = socket.tokenInfo?.domain || 'N/A';
  devLogger.debug('SocketServer', `[Socket] Yeni bağlantı: ${socket.id} - ${authType} - Domain: ${domain}`);
  
  // Client bilgilerini kaydet
  clients.set(socket.id, {
    id: socket.id,
    connectedAt: DateHelper.createDate(),
    socket: socket,
    tokenInfo: socket.tokenInfo,
    isTokenAuth: socket.isTokenAuth
  });
  
  // Hoş geldiniz mesajı
  socket.emit('welcome', {
    message: socket.isTokenAuth ? 'Token ile sunucuya hoş geldiniz!' : 'Ana sunucuya hoş geldiniz!',
    serverId: 'main-server',
    authType: authType,
    port: PORT,
    timestamp: DateHelper.createDate()
  });

  // Kanal aboneliği (hem string hem object formatını destekle)
  socket.on('subscribe', (data) => {
    // Both formats: 'subscribe', 'price' and 'subscribe', { channel: 'price' }
    const channel = typeof data === 'string' ? data : data.channel;
    
    if (!channel) {
      socket.emit('subscription_error', { error: 'Kanal adı gerekli', channel: null });
      return;
    }
    
    if (socket.isTokenAuth && socket.tokenInfo && !canAccessChannel(socket.tokenInfo, channel)) {
      socket.emit('subscription_error', { 
        error: `Bu kanala erişim izniniz yok: ${channel}`, 
        channel: channel 
      });
      return;
    }
    
    socket.join(channel);
    socket.emit('subscription_success', { channel: channel });
    devLogger.debug('SocketServer', `[Socket] ${socket.id} ${channel} kanalına abone oldu`);
  });

  socket.on('unsubscribe', (data) => {
    // Both formats: 'unsubscribe', 'price' and 'unsubscribe', { channel: 'price' }
    const channel = typeof data === 'string' ? data : data.channel;
    
    if (!channel) {
      socket.emit('subscription_error', { error: 'Kanal adı gerekli', channel: null });
      return;
    }
    
    socket.leave(channel);
    socket.emit('subscription_success', { channel: channel, action: 'unsubscribed' });
    devLogger.debug('SocketServer', `[Socket] ${socket.id} ${channel} kanalından ayrıldı`);
  });

  // Client mesajlarını dinle
  socket.on('client-message', (data) => {
    devLogger.debug('SocketServer', 'Client mesajı alındı', data);
    // Mesajı tüm bağlı clientlara yayınla
    io.emit('broadcast', {
      from: socket.id,
      authType: authType,
      ...data
    });
  });

  // Console connection handler
  socket.on('console-connected', (data) => {
    devLogger.debug('SocketServer', 'Konsol bağlandı:', { socketId: socket.id, data });
    socket.isConsole = true;
    socket.consoleData = data;
    
    // Send welcome message to console
    socket.emit('welcome', {
      message: 'Konsol başarıyla bağlandı',
      socketId: socket.id,
      serverTime: DateHelper.createDate(),
      features: ['price_updates', 'source_filtering', 'real_time_data']
    });
  });

  // Ping test handler
  socket.on('ping-test', (data) => {
    devLogger.debug('SocketServer', 'Ping test alındı:', data);
    socket.emit('test-message', {
      type: 'pong',
      originalData: data,
      serverTime: DateHelper.createDate(),
      message: 'Pong! Socket bağlantısı çalışıyor'
    });
  });

  // Sunucu bilgisi isteği
  socket.on('request-server-info', () => {
    socket.emit('server-info', {
      serverType: 'Ana Sunucu',
      port: PORT,
      connectedClients: io.engine.clientsCount,
      tokenAuthClients: Array.from(clients.values()).filter(c => c.isTokenAuth).length,
      mongodbConnected: !!db,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: DateHelper.createDate()
    });
  });

  socket.on('disconnect', async () => {
    const client = clients.get(socket.id);
    const connectionDuration = client ? Date.now() - client.connectedAt.getTime() : null;
    
    // Bağlantı sonlandırma logu
    if (socket.connectionLogId && apiConnectionLog) {
      await apiConnectionLog.logDisconnection(socket.connectionLogId, connectionDuration);
    }
    
    clients.delete(socket.id);
    devLogger.debug('SocketServer', `[Socket] Kullanıcı ayrıldı: ${socket.id} (Süre: ${connectionDuration ? Math.round(connectionDuration / 1000) + 's' : 'bilinmiyor'})`);
  });
  });
}

// Yardımcı fonksiyonlar
function extractDomain(url) {
  if (!url) return null;
  
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

function canAccessChannel(tokenInfo, channel) {
  if (!tokenInfo.allowedChannels) return false;
  if (tokenInfo.allowedChannels.includes('*')) return true;
  return tokenInfo.allowedChannels.includes(channel);
}

const PORT = process.env.PORT || 3000;

async function startServer() {
  await connectToDatabase();
  
  // Settings servisini başlat
  await settingsService.initialize(db);
  
  // DevLogger'ı başlat
  devLogger.initialize();
  
  // Logger'lara socket server'ı bağla
  const LoggerHelper = require('./utils/logger');
  LoggerHelper.setSocketServer(io);
  devLogger.setSocketServer(io);
  
  // Session middleware'ini ayarla
  sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'gold-server-session-secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      mongoOptions: {
        auth: {
          username: process.env.MONGODB_USERNAME,
          password: process.env.MONGODB_PASSWORD
        }
      }
    }),
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: settingsService.getSessionTimeout()
    }
  });
  
  app.use(sessionMiddleware);
  
  // Socket.IO'yu settings ile başlat
  io = new Server(httpServer, {
    cors: {
      origin: settingsService.isCorsEnabled() ? "*" : false,
      methods: ["GET", "POST"]
    },
    compression: settingsService.isCompressionEnabled(),
    maxHttpBufferSize: 1e6,
    pingTimeout: settingsService.getHeartbeatInterval(),
    pingInterval: settingsService.getHeartbeatInterval() / 2
  });
  
  // Veritabanını middleware'e ekle
  app.use((req, res, next) => {
    req.db = db;
    next();
  });
  
  // Public routes (no authentication required)
  app.get('/docs', async (req, res) => {
    try {
      // Dynamic data for docs page
      const Source = require('./models/Source');
      const CurrentPrices = require('./models/CurrentPrices');
      
      const sourceModel = new Source(db);
      const currentPrices = new CurrentPrices(db);
      
      // Get active sources from database to build dynamic sourceMapping
      const activeSources = await sourceModel.list({ isActive: true });
      
      // Build dynamic sourceMapping from database
      const sourceMapping = {};
      activeSources.forEach(source => {
        if (source.name && source._id) {
          sourceMapping[source.name] = source._id.toString();
        }
      });
      
      // Get dynamic data in parallel
      const [symbols, currencies, sourceCurrencies] = await Promise.all([
        currentPrices.collection.distinct('symbol', { isActive: true }),
        currentPrices.collection.distinct('currency', { isActive: true }),
        currentPrices.collection.aggregate([
          { $match: { isActive: true } },
          {
            $group: {
              _id: '$sourceId',
              currencies: { $addToSet: '$currency' },
              symbols: { $addToSet: '$symbol' }
            }
          }
        ]).toArray()
      ]);
      
      // Process source-currency mappings
      const reverseMapping = {};
      Object.keys(sourceMapping).forEach(name => {
        reverseMapping[sourceMapping[name]] = name;
      });
      
      const processedSourceCurrencies = sourceCurrencies.map(item => ({
        source: reverseMapping[item._id.toString()] || item._id.toString(),
        sourceId: item._id,
        currencies: item.currencies.sort(),
        symbols: item.symbols.sort(),
        currency_count: item.currencies.length,
        symbol_count: item.symbols.length
      }));
      
      // Build dynamic websocket channels
      // Standard channels + active source channels
      const standardChannels = ['price', 'alerts', 'system'];
      const sourceChannels = activeSources.map(s => s.name).filter(name => name);
      const websocketChannels = [...standardChannels, ...sourceChannels];
      
      res.render('docs', {
        layout: false,
        title: 'API Documentation & Test Center',
        // Dynamic data for tests
        sources: activeSources.map(s => ({
          name: s.name,
          displayName: s.displayName,
          description: s.description || s.metadata?.description || `${s.displayName} veri kaynağı`,
          category: s.category,
          type: s.type,
          isActive: s.isActive
        })),
        symbols: symbols.sort(),
        currencies: currencies.sort(),
        sourceCurrencies: processedSourceCurrencies,
        // Source names for selects
        sourceNames: Object.keys(sourceMapping),
        websocketChannels: websocketChannels
      });
    } catch (error) {
      console.error('Docs page error:', error);
      res.render('docs', {
        layout: false,
        title: 'API Documentation & Test Center',
        sources: [],
        symbols: [],
        currencies: [],
        sourceCurrencies: [],
        sourceNames: [],
        websocketChannels: ['price', 'alerts', 'system'],
        error: 'Veriler yüklenirken hata oluştu'
      });
    }
  });

  app.use('/api', require('./routes/apiRoutes')(db));
  
  // Debug endpoint for socket testing (remove in production)
  app.get('/api/debug/socket-test', (req, res) => {
    try {
      const LoggerHelper = require('./utils/logger');
      const devLogger = require('./utils/devLogger');
      
      // Test messages to all channels
      LoggerHelper.logInfo('system', 'Socket test mesajı - logger');
      devLogger.info('SocketTest', 'Socket test mesajı - devLogger');
      
      // Test price updates from all services
      if (global.altinKaynakService && global.altinKaynakService.socketServer) {
        global.altinKaynakService.emitPriceUpdate({
          symbol: 'TEST-ALT/TRY',
          buyPrice: 100.50,
          sellPrice: 101.50,
          currency: 'TRY',
          change: 1.25,
          originalData: { code: 'TEST-ALT', name: 'AltınKaynak Test' }
        });
      }
      
      if (global.hakanAltinService && global.hakanAltinService.socketServer) {
        global.hakanAltinService.emitPriceUpdate({
          symbol: 'TEST-HKN/TRY',
          buyPrice: 200.75,
          sellPrice: 201.25,
          currency: 'TRY',
          change: -0.5,
          originalData: { code: 'TEST-HKN', name: 'HakanGold Test' }
        });
      }
      
      if (global.tcmbService && global.tcmbService.socketServer) {
        global.tcmbService.emitPriceUpdate({
          symbol: 'TEST-TCMB/TRY',
          buyPrice: 32.15,
          sellPrice: 32.25,
          currency: 'TRY',
          change: 0.8,
          originalData: { code: 'TEST-TCMB', name: 'TCMB Test' }
        });
      }
      
      if (global.haremAltinService && global.haremAltinService.socketServer) {
        global.haremAltinService.emitPriceUpdate({
          symbol: 'TEST-HRM/TRY',
          buyPrice: 150.25,
          sellPrice: 151.75,
          currency: 'TRY',
          change: 2.1,
          originalData: { code: 'TEST-HRM', name: 'HaremGold Test' }
        });
      }
      
      // Test alerts
      if (io) {
        io.to('alerts').emit('anomaly_alert', {
          timestamp: new Date().toISOString(),
          service: 'test',
          type: 'test_alert',
          message: 'Test uyarı mesajı',
          severity: 'info'
        });
        
        io.to('system').emit('system_command', {
          timestamp: new Date().toISOString(),
          type: 'test',
          message: 'Test sistem mesajı'
        });
        
        // Test price updates to 'price' channel
        io.to('price').emit('price_update', {
          timestamp: DateHelper.createDate(),
          channel: 'price',
          data: {
            symbol: 'TEST/TRY',
            buyPrice: 999.99,
            sellPrice: 1000.01,
            currency: 'TRY',
            change: 0.01,
            source: 'test-server'
          }
        });
        
        // Send test message to all console connections
        const consoleSockets = Array.from(io.sockets.sockets.values()).filter(s => s.isConsole);
        consoleSockets.forEach(socket => {
          socket.emit('test-message', {
            type: 'server-test',
            message: 'Test mesajı sunucudan konsola',
            socketId: socket.id,
            timestamp: DateHelper.createDate()
          });
        });
      }
      
      res.json({
        success: true,
        message: 'Socket test mesajları gönderildi',
        timestamp: new Date().toISOString(),
        socketServer: !!io,
        connectedSockets: io ? io.engine.clientsCount : 0,
        consoleSockets: io ? Array.from(io.sockets.sockets.values()).filter(s => s.isConsole).length : 0,
        serviceSocketStatus: {
          altinKaynak: !!(global.altinKaynakService && global.altinKaynakService.socketServer),
          hakanAltin: !!(global.hakanAltinService && global.hakanAltinService.socketServer),
          tcmb: !!(global.tcmbService && global.tcmbService.socketServer),
          haremAltin: !!(global.haremAltinService && global.haremAltinService.socketServer)
        },
        testMessages: [
          'price_update sent to price channel',
          'test-message sent to console connections',
          'anomaly_alert sent to alerts channel',
          'system_command sent to system channel'
        ]
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // Routes
  app.use('/api', require('./routes/tokenRoutes')(db));
  app.use('/admin', require('./routes/authRoutes')(db));
  app.use('/admin', require('./routes/adminRoutes')(db));
  
  // Konsol Routes (User Dashboard)
  app.use('/konsol', require('./routes/konsolRoutes'));
  
  // Web API Routes (Dashboard System)
  app.use('/web-api', require('./routes/webApiRoutes')(db));
  
  // API model'lerini başlat
  const ApiToken = require('./models/ApiToken');
  const ApiConnectionLog = require('./models/ApiConnectionLog');
  apiToken = new ApiToken(db);
  apiConnectionLog = new ApiConnectionLog(db);
  
  // Socket handlers'ı kur
  setupSocketHandlers();
  
  // Socket Channel Manager'ı başlat
  global.socketChannels = {
    broadcastPriceUpdate: (data) => {
      // Fiyat güncellemesini 'price' kanalına gönder
      io.to('price').emit('price_update', {
        timestamp: DateHelper.createDate(),
        channel: 'price',
        data: data
      });
      
      // Kaynak bazlı fiyat güncellemesi
      if (data.source) {
        io.to(data.source).emit('source_price_update', {
          timestamp: DateHelper.createDate(),
          channel: data.source,
          source: data.source,
          data: data
        });
      }
    },
    broadcastToChannel: (channel, event, data) => {
      io.to(channel).emit(event, {
        timestamp: DateHelper.createDate(),
        channel: channel,
        data: data
      });
    },
    broadcastToAll: (event, data) => {
      io.emit(event, {
        timestamp: DateHelper.createDate(),
        data: data
      });
    },
    getConnectedTokensCount: () => {
      return io.engine.clientsCount || 0;
    }
  };

  // Data emitter'ı başlat
  dataEmitter = new DataEmitter({
    broadcastToChannel: global.socketChannels.broadcastToChannel,
    broadcastToAll: global.socketChannels.broadcastToAll
  });
  
  // AltinKaynak servisini başlat
  const AltinKaynakService = require('./services/AltinKaynakService');
  global.altinKaynakService = new AltinKaynakService(db);
  global.altinKaynakService.setSocketServer(io);
  
  try {
    await global.altinKaynakService.start();
    LoggerHelper.logSuccess('altinkaynak', 'Servis başlatıldı');
  } catch (error) {
    LoggerHelper.logError('altinkaynak', error, 'Servis başlatma hatası');
  }

  // Hakan Altın servisini başlat
  const HakanAltinService = require('./services/HakanAltinService');
  global.hakanAltinService = new HakanAltinService(db);
  global.hakanAltinService.setSocketServer(io);
  
  try {
    await global.hakanAltinService.start();
    LoggerHelper.logSuccess('hakangold', 'Servis başlatıldı');
  } catch (error) {
    LoggerHelper.logError('hakangold', error, 'Servis başlatma hatası');
  }

  // Harem Altın servisini başlat
  const HaremAltinService = require('./services/HaremAltinService');
  global.haremAltinService = new HaremAltinService(db);
  global.haremAltinService.setSocketServer(io);
  
  try {
    await global.haremAltinService.start();
    LoggerHelper.logSuccess('haremgold', 'Servis başlatıldı');
  } catch (error) {
    LoggerHelper.logError('haremgold', error, 'Servis başlatma hatası');
  }

  // Harem Altın Web servisini başlat
  const HaremAltinWebService = require('./services/HaremAltinWebService');
  global.haremAltinWebService = new HaremAltinWebService(db);
  
  try {
    await global.haremAltinWebService.start();
    LoggerHelper.logSuccess('haremgoldweb', 'Servis başlatıldı');
  } catch (error) {
    LoggerHelper.logError('haremgoldweb', error, 'Servis başlatma hatası');
  }

  // TCMB servisini başlat
  const TCMBService = require('./services/TCMBService');
  global.tcmbService = new TCMBService(db);
  global.tcmbService.setSocketServer(io);
  
  try {
    await global.tcmbService.start();
    LoggerHelper.logSuccess('tcmb', 'Servis başlatıldı');
  } catch (error) {
    LoggerHelper.logError('tcmb', error, 'Servis başlatma hatası');
  }

  // Price Archive Service'i başlat (cron)
  const PriceArchiveService = require('./services/PriceArchiveService');
  global.priceArchiveService = new PriceArchiveService(db);
  
  try {
    LoggerHelper.logSuccess('system', 'Price Archive Service başlatıldı');
  } catch (error) {
    LoggerHelper.logError('system', error, 'Price Archive Service başlatma hatası');
  }

  // Cleanup Service'i başlat (cron)
  const CleanupService = require('./services/CleanupService');
  global.cleanupService = new CleanupService(db);
  
  try {
    LoggerHelper.logSuccess('system', 'Cleanup Service başlatıldı');
  } catch (error) {
    LoggerHelper.logError('system', error, 'Cleanup Service başlatma hatası');
  }

  // Metrics Service'i başlat
  const MetricsService = require('./services/MetricsService');
  global.metricsService = new MetricsService(db);
  global.metricsService.start();
  
  try {
    LoggerHelper.logSuccess('system', 'Metrics Service başlatıldı');
  } catch (error) {
    LoggerHelper.logError('system', error, 'Metrics Service başlatma hatası');
  }

  // Price Watcher'ı başlat (MongoDB change streams ile fiyat değişikliklerini izler)
  const PriceWatcher = require('./priceWatcher');
  global.priceWatcher = new PriceWatcher(db, global.socketChannels);
  
  try {
    LoggerHelper.logSuccess('system', 'Price Watcher başlatıldı - Fiyat değişiklikleri izleniyor');
  } catch (error) {
    LoggerHelper.logError('system', error, 'Price Watcher başlatma hatası');
  }
  
  // Periyodik veri yayını başlat
  startPeriodicBroadcast();
  
  httpServer.listen(PORT, () => {
    LoggerHelper.logSuccess('system', `Ana server ${PORT} portunda çalışıyor`);
    LoggerHelper.system.info('Socket.io token desteği aktif');
  });
}

// Periyodik veri yayını
function startPeriodicBroadcast() {
  setInterval(() => {
    const systemData = {
      activeClients: clients.size,
      tokenAuthClients: Array.from(clients.values()).filter(c => c.isTokenAuth).length,
      serverTime: DateHelper.createDate(),
      uptime: process.uptime(),
      //memoryUsage: process.memoryUsage()
    };
    
    io.emit('system-status', {
      timestamp: DateHelper.createDate(),
      data: systemData
    });
  }, 5000);

}

startServer();

process.on('SIGINT', async () => {
  // AltinKaynak servisini durdur
  if (global.altinKaynakService) {
    await global.altinKaynakService.stop();
    console.log('AltinKaynak servisi durduruldu');
  }
  
  // Hakan Altın servisini durdur
  if (global.hakanAltinService) {
    await global.hakanAltinService.stop();
    console.log('Hakan Altın servisi durduruldu');
  }
  
  // Harem Altın servisini durdur
  if (global.haremAltinService) {
    await global.haremAltinService.stop();
    console.log('Harem Altın servisi durduruldu');
  }
  
  // Harem Altın Web servisini durdur
  if (global.haremAltinWebService) {
    await global.haremAltinWebService.stop();
    console.log('Harem Altın Web servisi durduruldu');
  }
  
  // TCMB servisini durdur
  if (global.tcmbService) {
    await global.tcmbService.stop();
    console.log('TCMB servisi durduruldu');
  }
  
  // Price Archive Service'i durdur
  if (global.priceArchiveService) {
    global.priceArchiveService.stopService();
    console.log('Price Archive Service durduruldu');
  }
  
  // Cleanup Service'i durdur
  if (global.cleanupService) {
    global.cleanupService.stopService();
    console.log('Cleanup Service durduruldu');
  }
  
  if (mongoClient) {
    await mongoClient.close();
    console.log('MongoDB bağlantısı kapatıldı');
  }
  process.exit(0);
});