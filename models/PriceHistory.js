const LoggerHelper = require('../utils/logger');
const DateHelper = require('../utils/dateHelper');
const { ObjectId } = require('mongodb');

class PriceHistory {
  constructor(db) {
    this.db = db;
    this.collection = db.collection('price_history');
    
    // Index oluştur
    this.createIndexes();
  }

  // Index oluşturma
  async createIndexes() {
    try {
      await this.collection.createIndexes([
        { key: { symbol: 1, timestamp: -1 } },
        { key: { source: 1, timestamp: -1 } },
        { key: { timestamp: -1 } },
        { key: { symbol: 1, source: 1, timestamp: -1 } }
      ]);
    } catch (error) {
      LoggerHelper.logError('system', error, 'PriceHistory index creation');
    }
  }

  // Fiyat geçmişi kaydetme
  async savePrice(priceData) {
    try {
      const historyEntry = {
        symbol: priceData.symbol,
        source: priceData.source,
        sourceId: priceData.sourceId || priceData.source,
        buyPrice: parseFloat(priceData.buyPrice || 0),
        sellPrice: parseFloat(priceData.sellPrice || 0),
        midPrice: (parseFloat(priceData.buyPrice || 0) + parseFloat(priceData.sellPrice || 0)) / 2,
        currency: priceData.currency || 'TRY',
        category: priceData.category,
        timestamp: priceData.timestamp || DateHelper.createDate(),
        metadata: {
          sourceUrl: priceData.sourceUrl,
          priority: priceData.priority,
          changePercent: priceData.changePercent || 0,
          trend: priceData.trend || 'stable'
        },
        createdAt: DateHelper.createDate()
      };

      const result = await this.collection.insertOne(historyEntry);
      return result.insertedId;

    } catch (error) {
      LoggerHelper.logError('system', error, 'Price history save failed');
      throw error;
    }
  }

  // Fiyat geçmişi getirme
  async getHistory(symbol, options = {}) {
    try {
      const {
        source = null,
        startDate = null,
        endDate = null,
        limit = 100,
        interval = 'hour'
      } = options;

      // Filter oluştur
      const filter = { symbol: symbol.toUpperCase() };
      
      if (source) {
        // Source'u ObjectId'ye çevir (eğer string ise)
        try {
          filter.source = typeof source === 'string' && ObjectId.isValid(source) 
            ? new ObjectId(source) 
            : source;
        } catch (error) {
          LoggerHelper.logError('system', error, 'PriceHistory source ObjectId conversion');
          filter.source = source; // Fallback to original
        }
      }

      // Tarih filtresi
      if (startDate || endDate) {
        filter.timestamp = {};
        if (startDate) filter.timestamp.$gte = new Date(startDate);
        if (endDate) filter.timestamp.$lte = new Date(endDate);
      }

      let aggregationPipeline = [];

      // Match stage
      aggregationPipeline.push({ $match: filter });

      // Interval bazlı gruplama
      if (interval && interval !== 'none') {
        const groupStage = this.createIntervalGroup(interval);
        aggregationPipeline.push(groupStage);
      }

      // Sort stage
      aggregationPipeline.push({ $sort: { timestamp: -1 } });

      // Limit stage
      if (limit) {
        aggregationPipeline.push({ $limit: parseInt(limit) });
      }

      const results = await this.collection.aggregate(aggregationPipeline).toArray();
      
      // Sonuçlara currentDate alanını ekle (YYYY-MM-DD formatında)
      const processedResults = results.map(record => {
        if (record.timestamp) {
          const date = new Date(record.timestamp);
          record.currentDate = date.toISOString().split('T')[0]; // 2025-07-21 formatında
        }
        return record;
      });
      
      return processedResults.reverse(); // Kronolojik sıra için ters çevir

    } catch (error) {
      LoggerHelper.logError('system', error, 'Price history retrieval failed');
      return [];
    }
  }

  // Interval gruplamasi
  createIntervalGroup(interval) {
    let dateGrouping;
    
    switch (interval) {
      case 'minute':
        dateGrouping = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' },
          hour: { $hour: '$timestamp' },
          minute: { $minute: '$timestamp' }
        };
        break;
      case 'hour':
        dateGrouping = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' },
          hour: { $hour: '$timestamp' }
        };
        break;
      case 'day':
        dateGrouping = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' }
        };
        break;
      case 'week':
        dateGrouping = {
          year: { $year: '$timestamp' },
          week: { $week: '$timestamp' }
        };
        break;
      case 'month':
        dateGrouping = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' }
        };
        break;
      default:
        return { $sort: { timestamp: -1 } };
    }

    return {
      $group: {
        _id: dateGrouping,
        symbol: { $first: '$symbol' },
        source: { $first: '$source' },
        buyPrice: { $avg: '$buyPrice' },
        sellPrice: { $avg: '$sellPrice' },
        midPrice: { $avg: '$midPrice' },
        currency: { $first: '$currency' },
        minPrice: { $min: '$midPrice' },
        maxPrice: { $max: '$midPrice' },
        openPrice: { $first: '$midPrice' },
        closePrice: { $last: '$midPrice' },
        count: { $sum: 1 },
        timestamp: { $first: '$timestamp' } // Sort için gerekli, sonra currentDate'e çevrilecek
      }
    };
  }

  // Son fiyatları getir
  async getLatestPrices(symbol, source = null, limit = 10) {
    try {
      const filter = { symbol: symbol.toUpperCase() };
      if (source) filter.source = source;

      const results = await this.collection
        .find(filter)
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();

      return results;

    } catch (error) {
      LoggerHelper.logError('system', error, 'Latest prices retrieval failed');
      return [];
    }
  }

  // Fiyat istatistikleri
  async getPriceStats(symbol, source = null, days = 30) {
    try {
      const startDate = DateHelper.createDate();
      startDate.setDate(startDate.getDate() - days);

      const filter = { 
        symbol: symbol.toUpperCase(),
        timestamp: { $gte: startDate }
      };
      if (source) filter.source = source;

      const stats = await this.collection.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            avgBuyPrice: { $avg: '$buyPrice' },
            avgSellPrice: { $avg: '$sellPrice' },
            minBuyPrice: { $min: '$buyPrice' },
            maxBuyPrice: { $max: '$buyPrice' },
            minSellPrice: { $min: '$sellPrice' },
            maxSellPrice: { $max: '$sellPrice' },
            count: { $sum: 1 },
            firstPrice: { $first: '$midPrice' },
            lastPrice: { $last: '$midPrice' }
          }
        }
      ]).toArray();

      if (stats.length === 0) {
        return null;
      }

      const stat = stats[0];
      const changePercent = stat.firstPrice ? 
        ((stat.lastPrice - stat.firstPrice) / stat.firstPrice) * 100 : 0;

      return {
        symbol: symbol,
        source: source,
        period: `${days} days`,
        avgBuyPrice: stat.avgBuyPrice,
        avgSellPrice: stat.avgSellPrice,
        minBuyPrice: stat.minBuyPrice,
        maxBuyPrice: stat.maxBuyPrice,
        minSellPrice: stat.minSellPrice,
        maxSellPrice: stat.maxSellPrice,
        changePercent: changePercent,
        volatility: stat.maxBuyPrice - stat.minBuyPrice,
        dataPoints: stat.count,
        calculatedAt: DateHelper.createDate()
      };

    } catch (error) {
      LoggerHelper.logError('system', error, 'Price stats calculation failed');
      return null;
    }
  }

  // Eski kayıtları temizleme
  async cleanup(daysToKeep = 365) {
    try {
      const cutoffDate = DateHelper.createDate();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await this.collection.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      LoggerHelper.logSuccess('system', 
        `Price history cleanup completed: ${result.deletedCount} old records removed`
      );

      return result.deletedCount;

    } catch (error) {
      LoggerHelper.logError('system', error, 'Price history cleanup failed');
      return 0;
    }
  }

  // Kaynak bazlı temizlik
  async cleanupBySource(source, daysToKeep = 90) {
    try {
      const cutoffDate = DateHelper.createDate();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await this.collection.deleteMany({
        source: source,
        timestamp: { $lt: cutoffDate }
      });

      LoggerHelper.logSuccess('system', 
        `Price history cleanup for ${source}: ${result.deletedCount} records removed`
      );

      return result.deletedCount;

    } catch (error) {
      LoggerHelper.logError('system', error, `Price history cleanup failed for ${source}`);
      return 0;
    }
  }

  // Toplam kayıt sayısı
  async getRecordCount(filters = {}) {
    try {
      return await this.collection.countDocuments(filters);
    } catch (error) {
      LoggerHelper.logError('system', error, 'Record count failed');
      return 0;
    }
  }

  // Kaynak listesi
  async getAvailableSources() {
    try {
      return await this.collection.distinct('source');
    } catch (error) {
      LoggerHelper.logError('system', error, 'Available sources retrieval failed');
      return [];
    }
  }

  // Sembol listesi
  async getAvailableSymbols(source = null) {
    try {
      const filter = source ? { source: source } : {};
      return await this.collection.distinct('symbol', filter);
    } catch (error) {
      LoggerHelper.logError('system', error, 'Available symbols retrieval failed');
      return [];
    }
  }
}

module.exports = PriceHistory;