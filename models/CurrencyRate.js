const DateHelper = require('../utils/dateHelper');

class CurrencyRate {
  constructor(db) {
    this.collection = db.collection('currency_rates');
    
    // Index oluştur
    this.collection.createIndex({ symbol: 1, timestamp: -1 });
    this.collection.createIndex({ symbol: 1, source: 1, timestamp: -1 });
    this.collection.createIndex({ timestamp: -1 });
  }

  // Yeni kur kaydı ekle
  async create(data) {
    const rate = {
      symbol: data.symbol, // USD/TRY, EUR/TRY, GBP/TRY vb.
      baseCurrency: data.baseCurrency, // USD, EUR, GBP
      quoteCurrency: data.quoteCurrency, // TRY
      rate: parseFloat(data.rate),
      bid: data.bid ? parseFloat(data.bid) : null,
      ask: data.ask ? parseFloat(data.ask) : null,
      spread: data.spread ? parseFloat(data.spread) : null,
      change: data.change ? parseFloat(data.change) : null,
      changePercent: data.changePercent ? parseFloat(data.changePercent) : null,
      high: data.high ? parseFloat(data.high) : null,
      low: data.low ? parseFloat(data.low) : null,
      open: data.open ? parseFloat(data.open) : null,
      close: data.close ? parseFloat(data.close) : null,
      volume: data.volume ? parseFloat(data.volume) : null,
      source: data.source, // 'tcmb', 'exchangerate-api', 'fixer', 'investing'
      sourceUrl: data.sourceUrl || null,
      timestamp: DateHelper.createDate(),
      createdAt: DateHelper.createDate(),
      metadata: data.metadata || {}
    };

    const result = await this.collection.insertOne(rate);
    return { ...rate, _id: result.insertedId };
  }

  // En son kurları getir
  async getLatestRates(symbols = null) {
    const pipeline = [
      {
        $sort: { symbol: 1, timestamp: -1 }
      },
      {
        $group: {
          _id: "$symbol",
          latestRate: { $first: "$$ROOT" }
        }
      },
      {
        $replaceRoot: { newRoot: "$latestRate" }
      },
      {
        $sort: { symbol: 1 }
      }
    ];

    if (symbols && symbols.length > 0) {
      pipeline.unshift({
        $match: { symbol: { $in: symbols } }
      });
    }

    return await this.collection.aggregate(pipeline).toArray();
  }

  // Belirli bir sembol için geçmiş veriler
  async getHistoricalRates(symbol, hours = 24) {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return await this.collection.find({
      symbol: symbol,
      timestamp: { $gte: startTime }
    })
    .sort({ timestamp: -1 })
    .limit(1000)
    .toArray();
  }

  // Kaynak bazlı en son kurlar
  async getLatestRatesBySource(source) {
    return await this.collection.find({
      source: source
    })
    .sort({ timestamp: -1 })
    .limit(50)
    .toArray();
  }

  // Bulk insert
  async bulkCreate(rates) {
    if (!rates || rates.length === 0) return { insertedCount: 0 };
    
    const operations = rates.map(rate => ({
      insertOne: {
        document: {
          symbol: rate.symbol,
          baseCurrency: rate.baseCurrency,
          quoteCurrency: rate.quoteCurrency,
          rate: parseFloat(rate.rate),
          bid: rate.bid ? parseFloat(rate.bid) : null,
          ask: rate.ask ? parseFloat(rate.ask) : null,
          spread: rate.spread ? parseFloat(rate.spread) : null,
          change: rate.change ? parseFloat(rate.change) : null,
          changePercent: rate.changePercent ? parseFloat(rate.changePercent) : null,
          high: rate.high ? parseFloat(rate.high) : null,
          low: rate.low ? parseFloat(rate.low) : null,
          open: rate.open ? parseFloat(rate.open) : null,
          close: rate.close ? parseFloat(rate.close) : null,
          volume: rate.volume ? parseFloat(rate.volume) : null,
          source: rate.source,
          sourceUrl: rate.sourceUrl || null,
          timestamp: DateHelper.createDate(),
          createdAt: DateHelper.createDate(),
          metadata: rate.metadata || {}
        }
      }
    }));

    const result = await this.collection.bulkWrite(operations);
    return result;
  }

  // Eski verileri temizle
  async cleanupOldData(daysToKeep = 30) {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    
    const result = await this.collection.deleteMany({
      timestamp: { $lt: cutoffDate }
    });

    return result.deletedCount;
  }

  // İstatistikler
  async getStats() {
    const stats = await this.collection.aggregate([
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          uniqueSymbols: { $addToSet: "$symbol" },
          sources: { $addToSet: "$source" },
          latestTimestamp: { $max: "$timestamp" },
          oldestTimestamp: { $min: "$timestamp" }
        }
      }
    ]).toArray();

    if (stats.length === 0) {
      return {
        totalRecords: 0,
        uniqueSymbols: [],
        sources: [],
        latestTimestamp: null,
        oldestTimestamp: null
      };
    }

    return {
      totalRecords: stats[0].totalRecords,
      symbolCount: stats[0].uniqueSymbols.length,
      symbols: stats[0].uniqueSymbols.sort(),
      sources: stats[0].sources.sort(),
      latestTimestamp: stats[0].latestTimestamp,
      oldestTimestamp: stats[0].oldestTimestamp
    };
  }
}

module.exports = CurrencyRate;