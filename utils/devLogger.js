const settingsService = require('./settingsService');
const DateHelper = require('./dateHelper');

class DevLogger {
  constructor() {
    this.initialized = false;
    this.socketServer = null;
  }

  // Initialize logger after settings service is ready
  initialize() {
    this.initialized = true;
  }
  
  // Set socket server instance
  setSocketServer(io) {
    this.socketServer = io;
  }
  
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
  }

  // Helper to refresh settings cache
  async refreshSettings() {
    try {
      await settingsService.refreshCache();
    } catch (error) {
      // Ignore cache refresh errors
    }
  }

  // Console debug messages - general debug info
  async debug(service, message, data = null) {
    if (!this.initialized) return;
    
    await this.refreshSettings();
    if (settingsService.shouldShowConsoleDebug()) {
      const timestamp = DateHelper.formatDateTime(DateHelper.createDate());
      const logMessage = `[${timestamp}] [DEBUG] [${service}] ${message}`;
      console.log(logMessage);
      if (data) {
        console.log(JSON.stringify(data, null, 2));
      }
      
      // Send to management channel
      this.sendToSocket('management', 'debug_log', {
        service: service,
        message: message,
        data: data,
        timestamp: timestamp
      });
    }
  }

  // Database operations logging
  async database(operation, collection, data = null) {
    if (!this.initialized) return;
    
    await this.refreshSettings();
    if (settingsService.shouldShowDatabaseOperations()) {
      const timestamp = DateHelper.formatDateTime(DateHelper.createDate());
      const logMessage = `[${timestamp}] [DB] [${operation.toUpperCase()}] ${collection}`;
      console.log(logMessage);
      if (data) {
        console.log(JSON.stringify(data, null, 2));
      }
      
      // Send to management channel
      this.sendToSocket('management', 'database_log', {
        operation: operation,
        collection: collection,
        data: data,
        timestamp: timestamp
      });
    }
  }

  // Price change notifications
  async priceChange(symbol, oldPrice, newPrice, change) {
    if (!this.initialized) return;
    
    await this.refreshSettings();
    if (settingsService.shouldShowPriceChangeNotifications()) {
      const timestamp = DateHelper.formatDateTime(DateHelper.createDate());
      const trend = change > 0 ? '↑' : change < 0 ? '↓' : '→';
      const logMessage = `[${timestamp}] [PRICE] ${symbol}: ${oldPrice} → ${newPrice} (${change.toFixed(2)}%) ${trend}`;
      console.log(logMessage);
      
      // Send to management channel
      this.sendToSocket('management', 'price_change_log', {
        symbol: symbol,
        oldPrice: oldPrice,
        newPrice: newPrice,
        change: change,
        trend: trend,
        timestamp: timestamp
      });
    }
  }

  // Info level logging - always shown if devmode is enabled
  async info(service, message, data = null) {
    if (!this.initialized) return;
    
    await this.refreshSettings();
    if (settingsService.isDevModeEnabled()) {
      const timestamp = DateHelper.formatDateTime(DateHelper.createDate());
      const logMessage = `[${timestamp}] [INFO] [${service}] ${message}`;
      console.log(logMessage);
      if (data) {
        console.log(JSON.stringify(data, null, 2));
      }
      
      // Send to management channel
      this.sendToSocket('management', 'dev_info_log', {
        service: service,
        message: message,
        data: data,
        timestamp: timestamp
      });
    }
  }

  // Warning level - always shown if devmode is enabled
  async warn(service, message, data = null) {
    if (!this.initialized) return;
    
    await this.refreshSettings();
    if (settingsService.isDevModeEnabled()) {
      const timestamp = DateHelper.formatDateTime(DateHelper.createDate());
      const logMessage = `[${timestamp}] [WARN] [${service}] ${message}`;
      console.warn(logMessage);
      if (data) {
        console.warn(JSON.stringify(data, null, 2));
      }
      
      // Send to management channel
      this.sendToSocket('management', 'dev_warn_log', {
        service: service,
        message: message,
        data: data,
        timestamp: timestamp
      });
    }
  }

  // Error level - always shown regardless of devmode
  error(service, message, error = null) {
    const timestamp = DateHelper.formatDateTime(DateHelper.createDate());
    const logMessage = `[${timestamp}] [ERROR] [${service}] ${message}`;
    console.error(logMessage);
    if (error) {
      console.error(error.stack || error);
    }
    
    // Send to management channel
    this.sendToSocket('management', 'dev_error_log', {
      service: service,
      message: message,
      error: error ? (error.stack || error) : null,
      timestamp: timestamp
    });
  }
}

module.exports = new DevLogger();