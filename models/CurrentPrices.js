const DateHelper = require('../utils/dateHelper');

class CurrentPrices {
  constructor(db) {
    this.db = db;
    this.collection = db.collection('current_prices');
    this.initIndexes();
  }

  async initIndexes() {
    try {
      await this.collection.createIndex({ symbol: 1, sourceId: 1 }, { unique: true });
      await this.collection.createIndex({ symbol: 1 });
      await this.collection.createIndex({ sourceId: 1 });
      await this.collection.createIndex({ updatedAt: -1 });
      await this.collection.createIndex({ "dailyStats.date": 1 });
    } catch (error) {
      console.error('CurrentPrices indeks hatası:', error);
    }
  }

  async updatePrice(priceData) {
    const { symbol, sourceId, buyPrice, sellPrice, sourceData } = priceData;
    const now = DateHelper.createDate();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    try {
      const existing = await this.collection.findOne({ symbol, sourceId });

      if (!existing) {
        // İlk kayıt
        const newPrice = {
          symbol,
          sourceId,
          buyPrice: buyPrice || null,
          sellPrice: sellPrice || null,
          previousBuyPrice: null,
          previousSellPrice: null,
          dailyStats: {
            date: today,
            openingBuyPrice: buyPrice || null,
            openingSellPrice: sellPrice || null,
            closingBuyPrice: null,
            closingSellPrice: null,
            highBuyPrice: buyPrice || null,
            highSellPrice: sellPrice || null,
            lowBuyPrice: buyPrice || null,
            lowSellPrice: sellPrice || null
          },
          changePercent: {
            buy: 0,
            sell: 0
          },
          sourceData: sourceData || {},
          isActive: true,
          createdAt: now,
          updatedAt: now
        };

        const result = await this.collection.insertOne(newPrice);
        return {
          ...result,
          updated: true,
          changePercent: 0
        };
      }

      // Fiyat değişikliği kontrolü
      const buyChanged = buyPrice !== null && existing.buyPrice !== buyPrice;
      const sellChanged = sellPrice !== null && existing.sellPrice !== sellPrice;

      if (!buyChanged && !sellChanged) {
        // Fiyat değişmemiş, sadece son kontrol zamanını güncelle
        await this.collection.updateOne(
          { _id: existing._id },
          { 
            $set: { 
              lastCheckedAt: now,
              sourceData: sourceData || existing.sourceData
            } 
          }
        );
        return { 
          acknowledged: true, 
          matchedCount: 1, 
          modifiedCount: 0,
          updated: false,
          changePercent: 0
        };
      }

      // Günlük istatistikleri kontrol et
      const isNewDay = existing.dailyStats.date.getTime() !== today.getTime();

      let dailyStats = existing.dailyStats;
      if (isNewDay) {
        // Yeni gün başladı
        dailyStats = {
          date: today,
          openingBuyPrice: buyPrice || existing.buyPrice,
          openingSellPrice: sellPrice || existing.sellPrice,
          closingBuyPrice: null,
          closingSellPrice: null,
          highBuyPrice: buyPrice || existing.buyPrice,
          highSellPrice: sellPrice || existing.sellPrice,
          lowBuyPrice: buyPrice || existing.buyPrice,
          lowSellPrice: sellPrice || existing.sellPrice
        };

        // Önceki günün kapanış fiyatlarını kaydet
        await this.collection.updateOne(
          { _id: existing._id },
          {
            $set: {
              "dailyStats.closingBuyPrice": existing.buyPrice,
              "dailyStats.closingSellPrice": existing.sellPrice
            }
          }
        );
      } else {
        // Aynı gün içinde güncelleme
        if (buyPrice !== null) {
          dailyStats.highBuyPrice = Math.max(dailyStats.highBuyPrice || 0, buyPrice);
          dailyStats.lowBuyPrice = Math.min(dailyStats.lowBuyPrice || buyPrice, buyPrice);
        }
        if (sellPrice !== null) {
          dailyStats.highSellPrice = Math.max(dailyStats.highSellPrice || 0, sellPrice);
          dailyStats.lowSellPrice = Math.min(dailyStats.lowSellPrice || sellPrice, sellPrice);
        }
      }

      // Değişim yüzdesini hesapla
      const changePercent = {
        buy: existing.buyPrice && buyPrice ? 
          ((buyPrice - existing.buyPrice) / existing.buyPrice * 100) : 0,
        sell: existing.sellPrice && sellPrice ? 
          ((sellPrice - existing.sellPrice) / existing.sellPrice * 100) : 0
      };

      const updateData = {
        previousBuyPrice: existing.buyPrice,
        previousSellPrice: existing.sellPrice,
        buyPrice: buyPrice !== null ? buyPrice : existing.buyPrice,
        sellPrice: sellPrice !== null ? sellPrice : existing.sellPrice,
        dailyStats,
        changePercent,
        sourceData: sourceData || existing.sourceData,
        updatedAt: now,
        lastCheckedAt: now
      };

      const result = await this.collection.updateOne(
        { _id: existing._id },
        { $set: updateData }
      );

      // Socket'e fiyat güncellemesini gönder - sadece önemli değişimleri
      const SettingsService = require('../utils/settingsService');
      const changeAmount = Math.max(
        Math.abs((buyPrice || existing.buyPrice) - existing.buyPrice),
        Math.abs((sellPrice || existing.sellPrice) - existing.sellPrice)
      );
      const avgChangePercent = Math.abs((changePercent.buy + changePercent.sell) / 2);
      
      if (result.modifiedCount > 0 && global.socketChannels && global.socketChannels.broadcastPriceUpdate && 
          SettingsService.isSignificantChange(changeAmount, avgChangePercent)) {
        // Get source information from database
        const sourceDoc = await this.db.collection('sources').findOne({ _id: sourceId });
        const sourceInfo = sourceDoc || { displayName: 'Unknown', name: 'unknown' };
        
        const socketData = {
          symbol: symbol,
          buyPrice: buyPrice || existing.buyPrice,
          sellPrice: sellPrice || existing.sellPrice,
          source: sourceInfo.displayName || 'Unknown',
          sourceId: sourceInfo.name || 'unknown',
          change: {
            buy: changePercent.buy || 0,
            sell: changePercent.sell || 0,
            trend: Math.abs(changePercent.buy) > Math.abs(changePercent.sell) 
              ? (changePercent.buy > 0 ? 'up' : 'down')
              : (changePercent.sell > 0 ? 'up' : changePercent.sell < 0 ? 'down' : 'stable')
          },
          previousBuyPrice: existing.buyPrice,
          previousSellPrice: existing.sellPrice,
          timestamp: DateHelper.createDate()
        };
        global.socketChannels.broadcastPriceUpdate(socketData);
      }
      
      // Return update info for logging
      return {
        ...result,
        updated: result.modifiedCount > 0,
        changePercent: (changePercent.buy + changePercent.sell) / 2
      };

    } catch (error) {
      console.error('Fiyat güncelleme hatası:', error);
      throw error;
    }
  }

  async getCurrentPrices(filters = {}) {
    const query = { isActive: true };
    
    if (filters.symbol) {
      if (typeof filters.symbol === 'object' && filters.symbol.constructor.name === 'RegExp') {
        query.symbol = filters.symbol;
      } else {
        query.symbol = filters.symbol;
      }
    }
    
    if (filters.sourceId) {
      // String sourceId'yi ObjectId'ye çevir
      const { ObjectId } = require('mongodb');
      if (typeof filters.sourceId === 'string') {
        try {
          query.sourceId = new ObjectId(filters.sourceId);
        } catch (error) {
          // Geçersiz ObjectId formatı ise string olarak bırak
          query.sourceId = filters.sourceId;
        }
      } else {
        query.sourceId = filters.sourceId;
      }
    }

    if (filters.category) {
      query.category = filters.category;
    }

    if (filters.currency) {
      query.currency = filters.currency;
    }

    try {
      return await this.collection
        .find(query)
        .sort({ updatedAt: -1 })
        .limit(filters.limit || 100)
        .toArray();
    } catch (error) {
      console.error('Güncel fiyatlar listeleme hatası:', error);
      throw error;
    }
  }

  // API routes için alias
  async getAll(filters = {}) {
    return this.getCurrentPrices(filters);
  }

  // Tek sembol getir
  async getBySymbol(symbol, source = null) {
    try {
      const query = { 
        symbol: symbol.toUpperCase(), 
        isActive: true 
      };
      
      if (source) {
        query.sourceId = source;
      }

      return await this.collection.findOne(query);
    } catch (error) {
      console.error('Symbol bazlı fiyat getirme hatası:', error);
      throw error;
    }
  }

  async getPriceHistory(symbol, sourceId, days = 7) {
    const startDate = DateHelper.createDate();
    startDate.setDate(startDate.getDate() - days);

    try {
      const pipeline = [
        {
          $match: {
            symbol,
            sourceId,
            updatedAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$updatedAt"
              }
            },
            prices: {
              $push: {
                buyPrice: "$buyPrice",
                sellPrice: "$sellPrice",
                updatedAt: "$updatedAt"
              }
            },
            openingBuy: { $first: "$buyPrice" },
            openingSell: { $first: "$sellPrice" },
            closingBuy: { $last: "$buyPrice" },
            closingSell: { $last: "$sellPrice" },
            highBuy: { $max: "$buyPrice" },
            highSell: { $max: "$sellPrice" },
            lowBuy: { $min: "$buyPrice" },
            lowSell: { $min: "$sellPrice" }
          }
        },
        { $sort: { _id: 1 } }
      ];

      return await this.collection.aggregate(pipeline).toArray();
    } catch (error) {
      console.error('Fiyat geçmişi hatası:', error);
      throw error;
    }
  }

  async getLatestPricesBySymbol(symbols = []) {
    const query = { isActive: true };
    if (symbols.length > 0) {
      query.symbol = { $in: symbols };
    }

    try {
      const pipeline = [
        { $match: query },
        {
          $group: {
            _id: "$symbol",
            latestPrice: { $first: "$$ROOT" }
          }
        },
        {
          $replaceRoot: { newRoot: "$latestPrice" }
        },
        { $sort: { symbol: 1 } }
      ];

      return await this.collection.aggregate(pipeline).toArray();
    } catch (error) {
      console.error('Sembollere göre fiyat listesi hatası:', error);
      throw error;
    }
  }

  async getStats() {
    try {
      const stats = await this.collection.aggregate([
        {
          $facet: {
            totalPrices: [{ $count: "count" }],
            activePrices: [{ $match: { isActive: true } }, { $count: "count" }],
            symbolCount: [{ $group: { _id: "$symbol" } }, { $count: "count" }],
            sourceCount: [{ $group: { _id: "$sourceId" } }, { $count: "count" }],
            lastUpdated: [{ $sort: { updatedAt: -1 } }, { $limit: 1 }, { $project: { updatedAt: 1 } }]
          }
        }
      ]).toArray();

      const result = stats[0];
      return {
        totalPrices: result.totalPrices[0]?.count || 0,
        activePrices: result.activePrices[0]?.count || 0,
        symbolCount: result.symbolCount[0]?.count || 0,
        sourceCount: result.sourceCount[0]?.count || 0,
        lastUpdated: result.lastUpdated[0]?.updatedAt || null
      };
    } catch (error) {
      console.error('CurrentPrices istatistik hatası:', error);
      throw error;
    }
  }

  async deactivatePrice(symbol, sourceId) {
    try {
      return await this.collection.updateOne(
        { symbol, sourceId },
        {
          $set: {
            isActive: false,
            deactivatedAt: DateHelper.createDate()
          }
        }
      );
    } catch (error) {
      console.error('Fiyat deaktif etme hatası:', error);
      throw error;
    }
  }

  async cleanOldPrices(daysToKeep = 30) {
    const cutoffDate = DateHelper.createDate();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    try {
      return await this.collection.deleteMany({
        isActive: false,
        deactivatedAt: { $lt: cutoffDate }
      });
    } catch (error) {
      console.error('Eski fiyat temizleme hatası:', error);
      throw error;
    }
  }
}

module.exports = CurrentPrices;