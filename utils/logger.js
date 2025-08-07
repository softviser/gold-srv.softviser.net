const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');
const settingsService = require('./settingsService');

// Log dizinini oluştur
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Kaynak bazlı log dizinleri
const sourceDirs = {
  altinkaynak: path.join(logDir, 'altinkaynak'),
  hakangold: path.join(logDir, 'hakangold'),
  haremgold: path.join(logDir, 'haremgold'),
  haremgoldweb: path.join(logDir, 'haremgoldweb'),
  tcmb: path.join(logDir, 'tcmb'),
  system: path.join(logDir, 'system')
};

// Kaynak dizinlerini oluştur
Object.values(sourceDirs).forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Winston formatı
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss DD/MM/YYYY' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, source, stack }) => {
    const sourcePrefix = source ? `[${source.toUpperCase()}]` : '[SYSTEM]';
    const logMessage = `${timestamp} ${sourcePrefix} ${level.toUpperCase()}: ${message}`;
    return stack ? `${logMessage}\n${stack}` : logMessage;
  })
);

// Console formatı (renkli)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, source }) => {
    const sourcePrefix = source ? `[${source.toUpperCase()}]` : '[SYSTEM]';
    return `${timestamp} ${sourcePrefix} ${level}: ${message}`;
  })
);

// Daily rotate file transport factory
function createDailyRotateTransport(source, level = 'info') {
  const sourceDir = sourceDirs[source] || sourceDirs.system;
  
  return new DailyRotateFile({
    filename: path.join(sourceDir, `${source}-%DATE%.log`),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: settingsService.shouldCompressLogs(),
    maxSize: settingsService.getLogFileSize(),
    maxFiles: settingsService.getLogRetentionDays(),
    level: level,
    format: logFormat
  });
}

// Ana logger
const logger = winston.createLogger({
  level: settingsService.getLogLevel(),
  format: logFormat,
  transports: [
    // Console output
    new winston.transports.Console({
      format: consoleFormat,
      level: 'debug'
    }),
    
    // Genel sistem logu
    createDailyRotateTransport('system', 'info'),
    
    // Error logu (tüm sistemden)
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: settingsService.shouldCompressLogs(),
      maxSize: settingsService.getLogFileSize(),
      maxFiles: settingsService.getLogRetentionDays(),
      level: 'error',
      format: logFormat
    })
  ],
  
  // Uncaught exception handling
  exceptionHandlers: [
    new winston.transports.Console({
      format: consoleFormat
    }),
    new DailyRotateFile({
      filename: path.join(logDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: settingsService.shouldCompressLogs(),
      maxSize: settingsService.getLogFileSize(),
      maxFiles: settingsService.getLogRetentionDays(),
      format: logFormat
    })
  ],
  
  // Unhandled rejection handling
  rejectionHandlers: [
    new winston.transports.Console({
      format: consoleFormat
    }),
    new DailyRotateFile({
      filename: path.join(logDir, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: settingsService.shouldCompressLogs(),
      maxSize: settingsService.getLogFileSize(),
      maxFiles: settingsService.getLogRetentionDays(),
      format: logFormat
    })
  ]
});

// Kaynak bazlı loggerlar
const sourceLoggers = {};

// Kaynak logger factory
function createSourceLogger(source) {
  if (sourceLoggers[source]) {
    return sourceLoggers[source];
  }
  
  const sourceLogger = winston.createLogger({
    level: settingsService.getLogLevel(),
    format: logFormat,
    defaultMeta: { source },
    transports: [
      // Console (ana logger ile aynı)
      new winston.transports.Console({
        format: consoleFormat,
        level: 'debug'
      }),
      
      // Kaynak özel dosya
      createDailyRotateTransport(source, 'info'),
      
      // Debug seviyesi için ayrı dosya
      createDailyRotateTransport(`${source}-debug`, 'debug')
    ]
  });
  
  sourceLoggers[source] = sourceLogger;
  return sourceLogger;
}

// Logger helper fonksiyonları
const LoggerHelper = {
  // Ana sistem logu
  system: logger,
  
  // Socket server reference (will be set from main app)
  socketServer: null,
  
  // Set socket server instance
  setSocketServer(io) {
    this.socketServer = io;
  },
  
  // Send message to socket channel
  sendToSocket(channel, event, data) {
    if (this.socketServer) {
      try {
        this.socketServer.to(channel).emit(event, {
          timestamp: new Date().toISOString(),
          channel: channel,
          event: event,
          data: data
        });
      } catch (error) {
        // Silent fail - don't create log loops
      }
    }
  },
  
  // Kaynak bazlı logger al
  getSourceLogger(source) {
    return createSourceLogger(source);
  },
  
  // Price update logu
  logPriceUpdate(source, symbol, buyPrice, sellPrice, changePercent) {
    // Check if logging is enabled globally
    if (!settingsService.shouldLogPriceUpdates()) {
      return;
    }
    
    // If developer mode is enabled, respect the price change notification setting
    if (settingsService.isDevModeEnabled() && !settingsService.shouldShowPriceChangeNotifications()) {
      return;
    }
    
    const sourceLogger = this.getSourceLogger(source);
    const changeIcon = changePercent > 0 ? '↗️' : changePercent < 0 ? '↘️' : '→';
    const message = `${changeIcon} ${symbol}: Alış ₺${buyPrice} / Satış ₺${sellPrice} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%)`;
    
    sourceLogger.info(message);
    
    // Send to management channel
    this.sendToSocket('management', 'price_update_log', {
      source: source,
      symbol: symbol,
      buyPrice: buyPrice,
      sellPrice: sellPrice,
      changePercent: changePercent,
      message: message
    });
  },
  
  // Connection logu
  logConnection(source, status, message = '') {
    // If developer mode is enabled, respect the console debug setting
    if (settingsService.isDevModeEnabled() && !settingsService.shouldShowConsoleDebug()) {
      return;
    }
    
    const sourceLogger = this.getSourceLogger(source);
    const statusIcon = status === 'connected' ? '🟢' : status === 'disconnected' ? '🔴' : '🟡';
    const logMessage = `${statusIcon} ${status.toUpperCase()} ${message}`;
    
    sourceLogger.info(logMessage);
    
    // Send to management channel
    this.sendToSocket('management', 'connection_log', {
      source: source,
      status: status,
      message: logMessage
    });
    
    // Send to system channel for connection changes
    if (status === 'connected' || status === 'disconnected') {
      this.sendToSocket('system', 'service_status', {
        service: source,
        status: status,
        message: logMessage
      });
    }
  },
  
  // Error logu
  logError(source, error, context = '') {
    const sourceLogger = this.getSourceLogger(source);
    const contextMsg = context ? ` (${context})` : '';
    const message = `❌ ${error.message}${contextMsg}`;
    
    sourceLogger.error(message, { error: error.stack });
    
    // Send to management channel
    this.sendToSocket('management', 'error_log', {
      source: source,
      error: error.message,
      context: context,
      stack: error.stack,
      message: message
    });
    
    // Send to alerts channel for critical errors
    this.sendToSocket('alerts', 'service_error', {
      service: source,
      error: error.message,
      context: context,
      timestamp: new Date().toISOString(),
      severity: 'error'
    });
  },
  
  // Warning logu
  logWarning(source, message) {
    const sourceLogger = this.getSourceLogger(source);
    const logMessage = `⚠️ ${message}`;
    sourceLogger.warn(logMessage);
    
    // Send to management channel
    this.sendToSocket('management', 'warning_log', {
      source: source,
      message: logMessage
    });
    
    // Send to alerts channel for warnings
    this.sendToSocket('alerts', 'service_warning', {
      service: source,
      message: message,
      timestamp: new Date().toISOString(),
      severity: 'warning'
    });
  },
  
  // Success logu
  logSuccess(source, message) {
    // If developer mode is enabled, respect the console debug setting
    if (settingsService.isDevModeEnabled() && !settingsService.shouldShowConsoleDebug()) {
      return;
    }
    
    const sourceLogger = this.getSourceLogger(source);
    const logMessage = `✅ ${message}`;
    sourceLogger.info(logMessage);
    
    // Send to management channel
    this.sendToSocket('management', 'success_log', {
      source: source,
      message: logMessage
    });
  },
  
  // Data processing logu
  logDataProcessing(source, processedCount, errorCount, duration) {
    // If developer mode is enabled, respect the console debug setting
    if (settingsService.isDevModeEnabled() && !settingsService.shouldShowConsoleDebug()) {
      return;
    }
    
    const sourceLogger = this.getSourceLogger(source);
    const logMessage = `📊 Veri işleme tamamlandı: ${processedCount} başarılı, ${errorCount} hata (${duration}ms)`;
    sourceLogger.info(logMessage);
    
    // Send to management channel
    this.sendToSocket('management', 'data_processing_log', {
      source: source,
      processedCount: processedCount,
      errorCount: errorCount,
      duration: duration,
      message: logMessage
    });
    
    // Send to system channel for monitoring
    this.sendToSocket('system', 'data_processing', {
      service: source,
      processed: processedCount,
      errors: errorCount,
      duration: duration,
      timestamp: new Date().toISOString()
    });
  },

  // Info logu
  logInfo(source, message) {
    const sourceLogger = this.getSourceLogger(source);
    const logMessage = `ℹ️ ${message}`;
    sourceLogger.info(logMessage);
    
    // Send to management channel
    this.sendToSocket('management', 'info_log', {
      source: source,
      message: logMessage
    });
  },
  
  // Log dosyalarını listele
  async getLogFiles(source = null, date = null) {
    const fs = require('fs').promises;
    const searchDir = source ? sourceDirs[source] : logDir;
    
    try {
      await fs.access(searchDir);
    } catch (error) {
      console.log(`Log dizini bulunamadı: ${searchDir}`);
      return [];
    }
    
    try {
      const files = await fs.readdir(searchDir);
      let logFiles = files.filter(file => file.endsWith('.log'));
      
      if (date) {
        logFiles = logFiles.filter(file => file.includes(date));
      }
      
      // Dosya detayları ile birlikte döndür
      const fileDetails = await Promise.all(
        logFiles.map(async (file) => {
          const filePath = path.join(searchDir, file);
          const stats = await fs.stat(filePath);
          
          return {
            name: file,
            path: filePath,
            size: stats.size,
            modified: stats.mtime,
            source: source || 'system'
          };
        })
      );
      
      // Son değiştirilme tarihine göre sırala
      return fileDetails.sort((a, b) => b.modified - a.modified);
      
    } catch (error) {
      logger.error('Log dosyaları listelenemedi:', error);
      return [];
    }
  },
  
  // Log dosyası oku
  async readLogFile(filePath, lines = 100) {
    const fs = require('fs');
    const readline = require('readline');
    
    if (!fs.existsSync(filePath)) {
      throw new Error('Log dosyası bulunamadı');
    }
    
    const logLines = [];
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    const allLines = [];
    for await (const line of rl) {
      allLines.push(line);
    }
    
    // Son N satırı al
    return allLines.slice(-lines);
  },
  
  // Basit error metodu (geriye uyumluluk için)
  error(message, errorObj = null) {
    if (errorObj) {
      this.logError('system', errorObj, message);
    } else {
      const sourceLogger = this.getSourceLogger('system');
      sourceLogger.error(`❌ ${message}`);
    }
  }
};

module.exports = LoggerHelper;