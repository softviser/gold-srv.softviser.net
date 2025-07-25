const LoggerHelper = require('../utils/logger');
const settingsService = require('../utils/settingsService');
const cronLogger = require('../utils/cronLogger');
const DateHelper = require('../utils/dateHelper');

class CleanupService {
  constructor(db) {
    this.db = db;
    this.isRunning = false;
    this.cleanupInterval = null;
    
    // Collections
    this.priceHistoryCollection = db.collection('price_history');
    this.archiveLogCollection = db.collection('price_archive_logs');
    this.apiConnectionLogCollection = db.collection('api_connection_logs');
    this.cleanupLogCollection = db.collection('cleanup_logs');
    
    this.initializeService();
  }

  // Servisi başlat
  async initializeService() {
    try {
      // Cleanup logs koleksiyonu için index
      await this.cleanupLogCollection.createIndexes([
        { key: { timestamp: -1 } },
        { key: { success: 1 } },
        { key: { cleanupType: 1 } }
      ]);

      LoggerHelper.logSuccess('cleanup', 'Cleanup Service initialized');
      
      // Cron schedule'ı başlat
      this.startSchedule();
      
    } catch (error) {
      LoggerHelper.logError('cleanup', error, 'Cleanup Service initialization');
    }
  }

  // Cron schedule başlat
  startSchedule() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Her saat kontrol et
    const intervalMs = 60 * 60 * 1000; // 1 saat
    
    this.cleanupInterval = setInterval(async () => {
      await this.checkAndRunCleanup();
    }, intervalMs);

    LoggerHelper.logSuccess('cleanup', 'Cleanup Service cron started (hourly check)');
    cronLogger.startJob('CleanupService', 'Hourly check');
  }

  // Temizleme zamanını kontrol et ve çalıştır
  async checkAndRunCleanup() {
    try {
      const cleanupHour = settingsService.getAutoCleanupHour();
      const now = DateHelper.createDate();
      const currentHour = now.getHours();
      
      // Belirtilen saatte çalışsın
      if (currentHour === cleanupHour) {
        cronLogger.logCheck('CleanupDaily', true, `Current hour ${currentHour} matches cleanup hour ${cleanupHour}`);
        await this.runDailyCleanup();
      } else {
        cronLogger.logCheck('CleanupDaily', false, `Current hour ${currentHour} does not match cleanup hour ${cleanupHour}`);
        LoggerHelper.logInfo('cleanup', 
          `Cleanup scheduled for ${cleanupHour}:00, current time: ${currentHour}:${now.getMinutes()}`
        );
      }
      
    } catch (error) {
      LoggerHelper.logError('cleanup', error, 'Cleanup schedule check');
      cronLogger.endJob('CleanupScheduleCheck', 'error', { error: error.message });
    }
  }

  // Günlük temizleme işlemi
  async runDailyCleanup() {
    if (this.isRunning) {
      LoggerHelper.logWarning('cleanup', 'Cleanup already running, skipping...');
      cronLogger.endJob('CleanupDaily', 'skipped', { reason: 'Already running' });
      return;
    }

    this.isRunning = true;
    const startTime = DateHelper.createDate();
    const results = [];
    
    cronLogger.startJob('CleanupDaily');

    try {
      LoggerHelper.logInfo('cleanup', 'Starting daily cleanup process...');

      // 1. Fiyat geçmişi temizliği
      const priceHistoryResult = await this.cleanupPriceHistory();
      results.push(priceHistoryResult);

      // 2. Arşiv log temizliği
      const archiveLogResult = await this.cleanupArchiveLogs();
      results.push(archiveLogResult);

      // 3. API connection log temizliği
      const apiLogResult = await this.cleanupApiConnectionLogs();
      results.push(apiLogResult);

      // 4. Cleanup log temizliği (kendini temizle)
      const cleanupLogResult = await this.cleanupCleanupLogs();
      results.push(cleanupLogResult);

      // 5. Genel temizlik (orphaned records, etc.)
      const generalResult = await this.generalCleanup();
      results.push(generalResult);

      // Sonuçları logla
      await this.logCleanupResult(startTime, results);
      
      const totalDeleted = results.reduce((sum, r) => sum + r.deletedCount, 0);
      LoggerHelper.logSuccess('cleanup', 
        `Daily cleanup completed: ${totalDeleted} records cleaned`
      );
      
      cronLogger.endJob('CleanupDaily', 'success', {
        totalDeleted,
        tasksCompleted: results.length,
        duration: DateHelper.createDate() - startTime
      });

    } catch (error) {
      LoggerHelper.logError('cleanup', error, 'Daily cleanup process');
      await this.logCleanupResult(startTime, results, error);
      
      cronLogger.endJob('CleanupDaily', 'error', {
        error: error.message,
        tasksCompleted: results.length
      });
    } finally {
      this.isRunning = false;
    }
  }

  // Fiyat geçmişi temizliği
  async cleanupPriceHistory() {
    try {
      const retentionDays = settingsService.getPriceHistoryRetentionDays();
      const cutoffDate = DateHelper.createDate();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await this.priceHistoryCollection.deleteMany({
        archivedAt: { $lt: cutoffDate }
      });

      LoggerHelper.logInfo('cleanup', 
        `Price history cleanup: ${result.deletedCount} records older than ${retentionDays} days deleted`
      );

      return {
        type: 'price_history',
        deletedCount: result.deletedCount,
        retentionDays: retentionDays,
        cutoffDate: cutoffDate,
        success: true
      };

    } catch (error) {
      LoggerHelper.logError('cleanup', error, 'Price history cleanup');
      return {
        type: 'price_history',
        deletedCount: 0,
        success: false,
        error: error.message
      };
    }
  }

  // Arşiv log temizliği
  async cleanupArchiveLogs() {
    try {
      const retentionDays = settingsService.getLogRetentionDays();
      const cutoffDate = DateHelper.createDate();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await this.archiveLogCollection.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      LoggerHelper.logInfo('cleanup', 
        `Archive logs cleanup: ${result.deletedCount} records older than ${retentionDays} days deleted`
      );

      return {
        type: 'archive_logs',
        deletedCount: result.deletedCount,
        retentionDays: retentionDays,
        cutoffDate: cutoffDate,
        success: true
      };

    } catch (error) {
      LoggerHelper.logError('cleanup', error, 'Archive logs cleanup');
      return {
        type: 'archive_logs',
        deletedCount: 0,
        success: false,
        error: error.message
      };
    }
  }

  // API connection log temizliği
  async cleanupApiConnectionLogs() {
    try {
      const retentionDays = settingsService.getLogRetentionDays();
      const cutoffDate = DateHelper.createDate();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await this.apiConnectionLogCollection.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      LoggerHelper.logInfo('cleanup', 
        `API connection logs cleanup: ${result.deletedCount} records older than ${retentionDays} days deleted`
      );

      return {
        type: 'api_connection_logs',
        deletedCount: result.deletedCount,
        retentionDays: retentionDays,
        cutoffDate: cutoffDate,
        success: true
      };

    } catch (error) {
      LoggerHelper.logError('cleanup', error, 'API connection logs cleanup');
      return {
        type: 'api_connection_logs',
        deletedCount: 0,
        success: false,
        error: error.message
      };
    }
  }

  // Cleanup log temizliği
  async cleanupCleanupLogs() {
    try {
      const retentionDays = settingsService.getLogRetentionDays();
      const cutoffDate = DateHelper.createDate();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await this.cleanupLogCollection.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      LoggerHelper.logInfo('cleanup', 
        `Cleanup logs cleanup: ${result.deletedCount} records older than ${retentionDays} days deleted`
      );

      return {
        type: 'cleanup_logs',
        deletedCount: result.deletedCount,
        retentionDays: retentionDays,
        cutoffDate: cutoffDate,
        success: true
      };

    } catch (error) {
      LoggerHelper.logError('cleanup', error, 'Cleanup logs cleanup');
      return {
        type: 'cleanup_logs',
        deletedCount: 0,
        success: false,
        error: error.message
      };
    }
  }

  // Genel temizlik
  async generalCleanup() {
    try {
      let totalDeleted = 0;
      const tasks = [];

      // Inactive sources'ların eski current_prices kayıtları
      const inactiveSourcesResult = await this.db.collection('current_prices').deleteMany({
        isActive: false,
        updatedAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // 7 gün
      });
      
      totalDeleted += inactiveSourcesResult.deletedCount;
      tasks.push(`Inactive current prices: ${inactiveSourcesResult.deletedCount}`);

      // Orphaned API tokens (çok eski kullanılmamış)
      const oldTokensResult = await this.db.collection('api_tokens').deleteMany({
        lastUsedAt: { 
          $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // 90 gün
        },
        isActive: false
      });
      
      totalDeleted += oldTokensResult.deletedCount;
      tasks.push(`Old inactive API tokens: ${oldTokensResult.deletedCount}`);

      LoggerHelper.logInfo('cleanup', `General cleanup: ${totalDeleted} total records deleted`);

      return {
        type: 'general_cleanup',
        deletedCount: totalDeleted,
        tasks: tasks,
        success: true
      };

    } catch (error) {
      LoggerHelper.logError('cleanup', error, 'General cleanup');
      return {
        type: 'general_cleanup',
        deletedCount: 0,
        success: false,
        error: error.message
      };
    }
  }

  // Temizlik sonucunu logla
  async logCleanupResult(startTime, results, error = null) {
    try {
      const endTime = DateHelper.createDate();
      const duration = endTime.getTime() - startTime.getTime();
      
      const logEntry = {
        timestamp: startTime,
        endTime: endTime,
        duration: duration,
        results: results,
        totalDeleted: results.reduce((sum, r) => sum + (r.deletedCount || 0), 0),
        success: !error && results.every(r => r.success),
        error: error ? error.message : null,
        metadata: {
          timezone: settingsService.getTimezone(),
          cleanupHour: settingsService.getAutoCleanupHour(),
          settings: {
            priceHistoryRetentionDays: settingsService.getPriceHistoryRetentionDays(),
            logRetentionDays: settingsService.getLogRetentionDays()
          }
        }
      };

      await this.cleanupLogCollection.insertOne(logEntry);
      
    } catch (logError) {
      LoggerHelper.logError('cleanup', logError, 'Cleanup log creation');
    }
  }

  // Manuel temizleme
  async manualCleanup() {
    LoggerHelper.logInfo('cleanup', 'Manual cleanup requested');
    await this.runDailyCleanup();
  }

  // Temizleme geçmişini getir
  async getCleanupHistory(limit = 30) {
    try {
      return await this.cleanupLogCollection
        .find({})
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
    } catch (error) {
      LoggerHelper.logError('cleanup', error, 'Cleanup history retrieval');
      return [];
    }
  }

  // Temizleme istatistikleri
  async getCleanupStats(days = 30) {
    try {
      const startDate = DateHelper.createDate();
      startDate.setDate(startDate.getDate() - days);

      const stats = await this.cleanupLogCollection.aggregate([
        { $match: { timestamp: { $gte: startDate } } },
        {
          $group: {
            _id: null,
            totalRuns: { $sum: 1 },
            successfulRuns: { $sum: { $cond: ['$success', 1, 0] } },
            totalDeleted: { $sum: '$totalDeleted' },
            avgDuration: { $avg: '$duration' },
            lastRun: { $max: '$timestamp' }
          }
        }
      ]).toArray();

      if (stats.length === 0) {
        return {
          totalRuns: 0,
          successfulRuns: 0,
          totalDeleted: 0,
          avgDuration: 0,
          lastRun: null,
          successRate: 0
        };
      }

      const result = stats[0];
      return {
        ...result,
        successRate: result.totalRuns > 0 ? (result.successfulRuns / result.totalRuns) * 100 : 0,
        avgDuration: Math.round(result.avgDuration || 0)
      };

    } catch (error) {
      LoggerHelper.logError('cleanup', error, 'Cleanup stats calculation');
      return null;
    }
  }

  // Servisi başlat
  async start() {
    LoggerHelper.logInfo('cleanup', 'Starting Cleanup Service...');
    this.startSchedule();
  }

  // Servisi durdur
  async stop() {
    this.stopService();
  }

  // Servisi durdur (eski method uyumluluğu için)
  stopService() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    LoggerHelper.logSuccess('cleanup', 'Cleanup Service stopped');
    cronLogger.endJob('CleanupService', 'success', { message: 'Service stopped' });
  }

  // Servisi yeniden başlat
  async restart() {
    LoggerHelper.logInfo('cleanup', 'Restarting Cleanup Service...');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.start();
    LoggerHelper.logSuccess('cleanup', 'Cleanup Service restarted');
  }

  // Servis durumu
  getServiceStatus() {
    return {
      isRunning: this.isRunning,
      scheduleActive: this.cleanupInterval !== null,
      nextCleanup: this.getNextCleanupTime(),
      settings: {
        cleanupHour: settingsService.getAutoCleanupHour(),
        priceHistoryRetentionDays: settingsService.getPriceHistoryRetentionDays(),
        logRetentionDays: settingsService.getLogRetentionDays(),
        timezone: settingsService.getTimezone()
      }
    };
  }

  // Sonraki temizleme zamanını hesapla
  getNextCleanupTime() {
    const now = DateHelper.createDate();
    const cleanupHour = settingsService.getAutoCleanupHour();
    const next = new Date(now);
    
    next.setHours(cleanupHour, 0, 0, 0);
    
    // Eğer bugünkü temizlik saati geçtiyse, yarına ayarla
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    
    return next;
  }
}

module.exports = CleanupService;