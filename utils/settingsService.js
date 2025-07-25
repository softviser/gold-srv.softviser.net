class SettingsService {
  constructor() {
    this.cache = new Map();
    this.initialized = false;
    this.db = null;
    this.settingsModel = null;
  }

  async initialize(db) {
    this.db = db;
    const Settings = require('../models/Settings');
    this.settingsModel = new Settings(db);
    
    await this.settingsModel.initializeDefaults();
    await this.refreshCache();
    this.initialized = true;
    
    console.log('SettingsService initialized with cache');
  }

  async refreshCache() {
    if (!this.settingsModel) {
      throw new Error('SettingsService not initialized');
    }

    const allSettings = await this.settingsModel.getAll();
    this.cache.clear();
    
    for (const [category, settings] of Object.entries(allSettings)) {
      for (const [key, value] of Object.entries(settings)) {
        this.cache.set(`${category}.${key}`, value);
      }
    }
  }

  get(key, defaultValue = null) {
    if (!this.initialized) {
      // Return default value silently during initialization phase
      return defaultValue;
    }
    
    return this.cache.get(key) || defaultValue;
  }

  async set(key, value, category = 'general', description = '') {
    if (!this.settingsModel) {
      throw new Error('SettingsService not initialized');
    }

    await this.settingsModel.set(key, value, category, description);
    this.cache.set(`${category}.${key}`, value);
  }

  async updateCategory(category, settings) {
    if (!this.settingsModel) {
      throw new Error('SettingsService not initialized');
    }

    await this.settingsModel.updateCategory(category, settings);
    
    for (const [key, value] of Object.entries(settings)) {
      this.cache.set(`${category}.${key}`, value);
    }
  }

  getLogRetentionFormat(days) {
    const dayMap = {
      7: '7d',
      14: '14d', 
      15: '15d',
      30: '30d',
      90: '3m',
      180: '6m',
      365: '1y'
    };
    
    return dayMap[days] || `${days}d`;
  }

  getLogFileSize() {
    const size = this.get('logging.maxLogFileSize', '20m');
    return size;
  }

  getLogRetentionDays() {
    const days = this.get('logging.logRetentionDays', 30);
    return this.getLogRetentionFormat(days);
  }

  shouldCompressLogs() {
    return this.get('logging.compressOldLogs', true);
  }

  getLogLevel() {
    return this.get('logging.logLevel', 'info');
  }

  shouldLogPriceUpdates() {
    return this.get('logging.logPriceUpdates', true);
  }

  shouldLogApiRequests() {
    return this.get('logging.logApiRequests', true);
  }

  getSessionTimeout() {
    return this.get('security.sessionTimeout', 3600) * 1000;
  }

  getMaxLoginAttempts() {
    return this.get('security.maxLoginAttempts', 5);
  }

  getLockoutDuration() {
    return this.get('security.lockoutDuration', 900) * 1000;
  }

  getPasswordMinLength() {
    return this.get('security.passwordMinLength', 8);
  }

  requireStrongPassword() {
    return this.get('security.requireStrongPassword', true);
  }

  isTwoFactorEnabled() {
    return this.get('security.enableTwoFactor', false);
  }

  getTokenExpiration() {
    return this.get('security.tokenExpiration', 86400);
  }

  getSocketPort() {
    return this.get('socket.socketPort', 3001);
  }

  getMaxConnections() {
    return this.get('socket.maxConnections', 1000);
  }

  getHeartbeatInterval() {
    return this.get('socket.heartbeatInterval', 30000);
  }

  getReconnectAttempts() {
    return this.get('socket.reconnectAttempts', 5);
  }

  getReconnectDelay() {
    return this.get('socket.reconnectDelay', 5000);
  }

  getMaxReconnectDelay() {
    return this.get('socket.maxReconnectDelay', 10000);
  }

  getMessageTimeout() {
    return this.get('socket.messageTimeout', 30000);
  }

  isCompressionEnabled() {
    return this.get('socket.enableCompression', true);
  }

  isCorsEnabled() {
    return this.get('socket.enableCors', true);
  }

  getDefaultUpdateInterval() {
    return this.get('data.defaultUpdateInterval', 60) * 1000;
  }

  getRealtimeUpdateInterval() {
    return this.get('data.realtimeUpdateInterval', 30) * 1000;
  }

  getFrequentUpdateInterval() {
    return this.get('data.frequentUpdateInterval', 300) * 1000;
  }

  getDailyUpdateInterval() {
    return this.get('data.dailyUpdateInterval', 3600) * 1000;
  }

  getPriceHistoryDays() {
    return this.get('data.priceHistoryDays', 90);
  }

  getConnectionLogDays() {
    return this.get('data.connectionLogDays', 30);
  }

  isAutoCleanupEnabled() {
    return this.get('data.autoCleanup', true);
  }

  getCleanupTime() {
    return this.get('data.cleanupTime', '03:00');
  }

  getMaxPriceChangePercent() {
    return this.get('data.maxPriceChangePercent', 10);
  }

  isAnomalyDetectionEnabled() {
    return this.get('data.anomalyDetection', true);
  }

  getTimezone() {
    return this.get('general.timezone', 'Europe/Istanbul');
  }

  getLanguage() {
    return this.get('general.language', 'tr');
  }

  getDateFormat() {
    return this.get('general.dateFormat', 'DD/MM/YYYY');
  }

  getTimeFormat() {
    return this.get('general.timeFormat', 'HH:mm:ss');
  }

  // API için gerekli settings
  getName() {
    return this.get('general.name', 'Gold Server');
  }

  getSiteDescription() {
    return this.get('general.siteDescription', 'Real-time gold and currency price data API');
  }

  getApiVersion() {
    return this.get('general.apiVersion', '1.0.0').toString();
  }

  getSiteName() {
    return this.get('general.siteName', 'Gold Server');
  }

  getSiteDescription() {
    return this.get('general.siteDescription', 'Altın ve Döviz Takip Sistemi');
  }

  getAdminEmail() {
    return this.get('general.adminEmail', 'admin@goldserver.com');
  }

  // Cron services için gerekli settings
  getPriceHistoryRetentionDays() {
    return this.get('data.priceHistoryRetentionDays', 90);
  }

  getAutoCleanupHour() {
    return this.get('data.autoCleanupHour', 3);
  }

  getLogRetentionDays() {
    return this.get('data.logRetentionDays', 30);
  }

  // Price change threshold settings
  getPriceChangeValue() {
    return this.get('data.priceChangeValue', 0.25);
  }

  getPriceChangeType() {
    return this.get('data.priceChangeType', 'amount');
  }

  // Check if price change meets minimum threshold
  isSignificantChange(changeAmount, changePercent) {
    const threshold = this.getPriceChangeValue();
    const type = this.getPriceChangeType();
    
    if (type === 'amount') {
      return Math.abs(changeAmount) >= threshold;
    } else if (type === 'percent') {
      return Math.abs(changePercent) >= threshold;
    }
    
    return false;
  }

  // Developer mode settings
  isDevModeEnabled() {
    return this.get('devmode.enabled', false);
  }

  shouldShowConsoleDebug() {
    return this.isDevModeEnabled() && this.get('devmode.showConsoleDebug', true);
  }

  shouldShowDatabaseOperations() {
    return this.isDevModeEnabled() && this.get('devmode.showDatabaseOperations', true);
  }

  shouldShowPriceChangeNotifications() {
    return this.isDevModeEnabled() && this.get('devmode.showPriceChangeNotifications', true);
  }
}

module.exports = new SettingsService();