const LoggerHelper = require('../utils/logger');
const settingsService = require('../utils/settingsService');
const cronLogger = require('../utils/cronLogger');
const DateHelper = require('../utils/dateHelper');

class PriceArchiveService {
  constructor(db) {
    this.db = db;
    this.isRunning = false;
    this.archiveInterval = null;
    
    // Models
    this.currentPricesCollection = db.collection('current_prices');
    this.priceHistoryCollection = db.collection('price_history');
    this.archiveLogCollection = db.collection('price_archive_logs');
    
    this.initializeService();
  }

  // Servisi başlat
  async initializeService() {
    try {
      // Archive logs koleksiyonu için index
      await this.archiveLogCollection.createIndexes([
        { key: { timestamp: -1 } },
        { key: { success: 1 } },
        { key: { symbolsArchived: 1 } }
      ]);

      LoggerHelper.logSuccess('pricearchive', 'Price Archive Service initialized');
      
      // Cron schedule'ı başlat
      this.startSchedule();
      
    } catch (error) {
      LoggerHelper.logError('pricearchive', error, 'Price Archive Service initialization');
    }
  }

  // Cron schedule başlat
  startSchedule() {
    if (this.archiveInterval) {
      clearInterval(this.archiveInterval);
    }

    // Sonraki 30 dakikalık dilime kadar bekle (örn: 09:00:00, 09:30:00, 10:00:00, 10:30:00)
    const now = DateHelper.createDate();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const milliseconds = now.getMilliseconds();
    
    // Sonraki 30'un katı dakikayı hesapla (00 veya 30)
    const nextInterval = minutes < 30 ? 30 : 60;
    const nextMinute = nextInterval === 60 ? 0 : nextInterval;
    const nextHour = nextInterval === 60 ? now.getHours() + 1 : now.getHours();
    
    // Sonraki çalışma zamanına kadar geçen süreyi hesapla
    const nextRun = new Date(now);
    nextRun.setHours(nextHour, nextMinute, 0, 0);
    const timeUntilNext = nextRun.getTime() - now.getTime();
    
    LoggerHelper.logInfo('pricearchive', 
      `Price archive will start at ${nextRun.toLocaleTimeString()} (in ${Math.round(timeUntilNext/1000)} seconds)`
    );

    // İlk çalışmayı bekle, sonra 15 dakikada bir çalıştır
    setTimeout(() => {
      // İlk çalışma
      this.archiveCurrentPrices();
      
      // Sonrasında her 30 dakikada bir
      const intervalMs = 30 * 60 * 1000;
      this.archiveInterval = setInterval(async () => {
        await this.archiveCurrentPrices();
      }, intervalMs);
      
    }, timeUntilNext);

    LoggerHelper.logSuccess('pricearchive', 'Price Archive Service cron scheduled (every 30 minutes at exact times: XX:00:00 and XX:30:00)');
    cronLogger.startJob('PriceArchive', 'Every 30 minutes at exact times (XX:00:00 and XX:30:00)');
  }

  // Arşivleme zamanını kontrol et ve çalıştır (DEPRECATED - Direkt archiveCurrentPrices kullanılıyor)
  async checkAndArchive() {
    // Bu metod artık kullanılmıyor, geriye dönük uyumluluk için bırakıldı
    await this.archiveCurrentPrices();
  }

  // Anlık fiyatları arşivle
  async archiveCurrentPrices() {
    if (this.isRunning) {
      LoggerHelper.logWarning('pricearchive', 'Price archive already running, skipping...');
      cronLogger.endJob('PriceArchive-Run', 'skipped', { reason: 'Already running' });
      return;
    }

    this.isRunning = true;
    const startTime = DateHelper.createDateForDatabase(); // Database için timezone-aware başlangıç zamanı
    let archivedCount = 0;
    let errorCount = 0;
    const errors = [];
    
    cronLogger.startJob('PriceArchive-Run');

    try {
      LoggerHelper.logInfo('pricearchive', 'Starting price archive process...');
      
      // Aktif fiyatları al
      const currentPrices = await this.currentPricesCollection.find({
        isActive: true
      }).toArray();

      if (currentPrices.length === 0) {
        LoggerHelper.logWarning('pricearchive', 'No active prices found to archive');
        await this.logArchiveResult(startTime, 0, 0, ['No active prices found']);
        cronLogger.endJob('PriceArchive-Run', 'success', { 
          archivedCount: 0, 
          message: 'No active prices found' 
        });
        return;
      }

      // Her fiyat için arşiv kaydı oluştur
      const archiveEntries = [];
      
      for (const price of currentPrices) {
        try {
          const archiveEntry = {
            symbol: price.symbol,
            source: price.sourceId || price.source || 'unknown',
            sourceId: price.sourceId,
            buyPrice: parseFloat(price.buyPrice || 0),
            sellPrice: parseFloat(price.sellPrice || 0),
            midPrice: (parseFloat(price.buyPrice || 0) + parseFloat(price.sellPrice || 0)) / 2,
            currency: price.currency || 'TRY',
            category: price.category || 'currency',
            
            // Değişim bilgileri
            previousBuyPrice: parseFloat(price.previousBuyPrice || price.buyPrice || 0),
            previousSellPrice: parseFloat(price.previousSellPrice || price.sellPrice || 0),
            changePercent: price.changePercent || { buy: 0, sell: 0 },
            
            // Günlük istatistikler
            dailyStats: price.dailyStats || {},
            
            // Zaman bilgileri (timezone-aware database storage)
            originalTimestamp: DateHelper.createDateForDatabase(),
            archivedAt: DateHelper.createDateForDatabase(), // Database için timezone-aware zaman
            
            // Metadata
            metadata: {
              originalId: price._id,
              isActive: price.isActive,
              archiveReason: 'scheduled',
              archiveVersion: '1.0'
            }
          };

          archiveEntries.push(archiveEntry);
          archivedCount++;
          
        } catch (entryError) {
          errorCount++;
          const errorMsg = `Error processing ${price.symbol}: ${entryError.message}`;
          errors.push(errorMsg);
          LoggerHelper.logError('pricearchive', entryError, `Price archive entry creation for ${price.symbol}`);
        }
      }

      // Toplu insert
      if (archiveEntries.length > 0) {
        await this.priceHistoryCollection.insertMany(archiveEntries);
        LoggerHelper.logSuccess('pricearchive', 
          `Price archive completed: ${archivedCount} prices archived`
        );
      }

      // Log kaydı oluştur
      await this.logArchiveResult(startTime, archivedCount, errorCount, errors);
      
      cronLogger.endJob('PriceArchive-Run', 'success', {
        archivedCount,
        errorCount,
        duration: DateHelper.createDate() - startTime
      });

    } catch (error) {
      LoggerHelper.logError('pricearchive', error, 'Price archive process');
      await this.logArchiveResult(startTime, archivedCount, errorCount + 1, 
        [...errors, error.message]);
      
      cronLogger.endJob('PriceArchive-Run', 'error', {
        error: error.message,
        archivedCount,
        errorCount: errorCount + 1
      });
    } finally {
      this.isRunning = false;
    }
  }

  // Arşiv sonucunu logla
  async logArchiveResult(startTime, archivedCount, errorCount, errors) {
    try {
      const endTime = DateHelper.createDateForDatabase(); // Database için timezone-aware bitiş zamanı
      const duration = endTime.getTime() - startTime.getTime();
      
      const logEntry = {
        timestamp: startTime, // Database için timezone-aware başlangıç zamanı
        endTime: endTime, // Database için timezone-aware bitiş zamanı
        duration: duration,
        symbolsArchived: archivedCount,
        errorCount: errorCount,
        success: errorCount === 0,
        errors: errors.slice(0, 100), // İlk 100 hatayı sakla
        metadata: {
          timezone: settingsService.getTimezone(),
          archiveType: 'scheduled',
          totalProcessed: archivedCount + errorCount
        }
      };

      await this.archiveLogCollection.insertOne(logEntry);
      
      if (errorCount > 0) {
        LoggerHelper.logWarning('pricearchive', 
          `Price archive completed with ${errorCount} errors: ${archivedCount} archived`
        );
      }
      
    } catch (logError) {
      LoggerHelper.logError('pricearchive', logError, 'Archive log creation');
    }
  }

  // Manuel arşivleme
  async manualArchive() {
    LoggerHelper.logInfo('pricearchive', 'Manual price archive requested');
    await this.archiveCurrentPrices();
  }

  // Arşiv geçmişini getir
  async getArchiveHistory(limit = 50) {
    try {
      return await this.archiveLogCollection
        .find({})
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
    } catch (error) {
      LoggerHelper.logError('pricearchive', error, 'Archive history retrieval');
      return [];
    }
  }

  // Arşiv istatistikleri
  async getArchiveStats(days = 7) {
    try {
      const startDate = DateHelper.createDateForDatabase(); // Database için timezone-aware şu anki zaman
      startDate.setDate(startDate.getDate() - days);

      const stats = await this.archiveLogCollection.aggregate([
        { $match: { timestamp: { $gte: startDate } } },
        {
          $group: {
            _id: null,
            totalRuns: { $sum: 1 },
            successfulRuns: { $sum: { $cond: ['$success', 1, 0] } },
            totalArchived: { $sum: '$symbolsArchived' },
            totalErrors: { $sum: '$errorCount' },
            avgDuration: { $avg: '$duration' },
            lastRun: { $max: '$timestamp' }
          }
        }
      ]).toArray();

      if (stats.length === 0) {
        return {
          totalRuns: 0,
          successfulRuns: 0,
          totalArchived: 0,
          totalErrors: 0,
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
      LoggerHelper.logError('pricearchive', error, 'Archive stats calculation');
      return null;
    }
  }

  // Servisi başlat
  async start() {
    LoggerHelper.logInfo('pricearchive', 'Starting Price Archive Service...');
    this.startSchedule();
  }

  // Servisi durdur
  async stop() {
    this.stopService();
  }

  // Servisi durdur (eski method uyumluluğu için)
  stopService() {
    if (this.archiveInterval) {
      clearInterval(this.archiveInterval);
      this.archiveInterval = null;
    }
    
    LoggerHelper.logSuccess('pricearchive', 'Price Archive Service stopped');
    cronLogger.endJob('PriceArchive', 'success', { message: 'Service stopped' });
  }

  // Servisi yeniden başlat
  async restart() {
    LoggerHelper.logInfo('pricearchive', 'Restarting Price Archive Service...');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.start();
    LoggerHelper.logSuccess('pricearchive', 'Price Archive Service restarted');
  }

  // Servis durumu
  getServiceStatus() {
    return {
      isRunning: this.isRunning,
      scheduleActive: this.archiveInterval !== null,
      nextArchiveWindow: this.getNextArchiveWindow(),
      settings: {
        archiveRetentionDays: settingsService.getPriceHistoryRetentionDays(),
        timezone: settingsService.getTimezone()
      }
    };
  }

  // Sonraki arşiv zamanını hesapla
  getNextArchiveWindow() {
    const now = DateHelper.createDate();
    const next = new Date(now);
    
    // Sonraki 30 dakikalık dilimi bul (XX:00:00 veya XX:30:00)
    if (next.getMinutes() < 30) {
      next.setMinutes(30, 0, 0);
    } else {
      next.setHours(next.getHours() + 1, 0, 0, 0);
    }
    
    // Artık 7/24 çalışacak - mesai saati kısıtlaması kaldırıldı
    return next;
  }
}

module.exports = PriceArchiveService;