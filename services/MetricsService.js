const LoggerHelper = require('../utils/logger');
const cronLogger = require('../utils/cronLogger');
const DateHelper = require('../utils/dateHelper');

class MetricsService {
  constructor(db) {
    this.db = db;
    this.collection = db.collection('system_metrics');
    this.interval = null;
    this.collectionInterval = 60000; // 1 minute
    this.maxDataPoints = 20; // Keep last 20 data points
    
    this.initializeService();
  }

  async initializeService() {
    try {
      // Create indexes
      await this.collection.createIndexes([
        { key: { timestamp: -1 } },
        { key: { createdAt: 1 }, expireAfterSeconds: 3600 } // Auto-delete after 1 hour
      ]);
      
      LoggerHelper.logSuccess('metrics', 'Metrics Service initialized');
    } catch (error) {
      LoggerHelper.logError('metrics', error, 'Metrics Service initialization');
    }
  }

  async collectMetrics() {
    try {
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      // Count active services
      let activeServices = 0;
      if (global.altinKaynakService?.getStatus().isActive) activeServices++;
      if (global.hakanAltinService?.isRunning) activeServices++;
      if (global.haremAltinService?.isRunning) activeServices++;
      if (global.haremAltinWebService?.getStatus().isRunning) activeServices++;
      if (global.priceArchiveService?.getServiceStatus().scheduleActive) activeServices++;
      if (global.cleanupService?.getServiceStatus().scheduleActive) activeServices++;
      
      const metrics = {
        timestamp: DateHelper.createDate(),
        memoryUsageMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        activeServices,
        uptime,
        cpuUsage: process.cpuUsage().user / 1000000,
        createdAt: DateHelper.createDate()
      };
      
      await this.collection.insertOne(metrics);
      
      // Clean up old metrics
      const cutoffTime = new Date(Date.now() - (this.maxDataPoints * this.collectionInterval));
      await this.collection.deleteMany({ timestamp: { $lt: cutoffTime } });
      
    } catch (error) {
      LoggerHelper.logError('metrics', error, 'Metrics collection');
    }
  }

  async getRecentMetrics(limit = 20) {
    try {
      const metrics = await this.collection
        .find({})
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
      
      return metrics.reverse(); // Return in chronological order
    } catch (error) {
      LoggerHelper.logError('metrics', error, 'Get recent metrics');
      return [];
    }
  }

  start() {
    if (this.interval) {
      LoggerHelper.logWarning('metrics', 'Metrics Service already running');
      return;
    }
    
    // Collect first metric immediately
    this.collectMetrics();
    
    // Start periodic collection
    this.interval = setInterval(() => {
      cronLogger.startJob('Metrics-Collection');
      try {
        this.collectMetrics();
        cronLogger.endJob('Metrics-Collection', 'success', { message: 'Metrics collected' });
      } catch (error) {
        cronLogger.endJob('Metrics-Collection', 'error', { error: error.message });
      }
    }, this.collectionInterval);
    
    LoggerHelper.logSuccess('metrics', 'Metrics Service started');
    cronLogger.startJob('MetricsService', 'Periodic metrics collection');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      LoggerHelper.logSuccess('metrics', 'Metrics Service stopped');
      cronLogger.endJob('MetricsService', 'success', { message: 'Service stopped' });
    }
  }

  getStatus() {
    return {
      isRunning: !!this.interval,
      collectionInterval: this.collectionInterval,
      maxDataPoints: this.maxDataPoints
    };
  }
}

module.exports = MetricsService;