const DateHelper = require('../utils/dateHelper');

class ApiConnectionLog {
  constructor(db) {
    this.collection = db.collection('api_connection_logs');
    
    // Index oluştur
    this.collection.createIndex({ tokenId: 1, createdAt: -1 });
    this.collection.createIndex({ domain: 1, createdAt: -1 });
    this.collection.createIndex({ createdAt: -1 });
    this.collection.createIndex({ ip: 1, createdAt: -1 });
  }

  // Yeni bağlantı kaydı
  async logConnection(data) {
    const logEntry = {
      tokenId: data.tokenId || null,
      tokenName: data.tokenName || null,
      domain: data.domain || null,
      ip: data.ip || null,
      userAgent: data.userAgent || null,
      connectionType: data.connectionType || 'socket', // 'socket', 'http', 'websocket'
      success: data.success !== false,
      errorMessage: data.errorMessage || null,
      createdAt: DateHelper.createDate(),
      disconnectedAt: null,
      duration: null,
      metadata: data.metadata || {}
    };

    const result = await this.collection.insertOne(logEntry);
    return { ...logEntry, _id: result.insertedId };
  }

  // Bağlantı sonlandırma kaydı
  async logDisconnection(connectionId, duration = null) {
    const updateData = {
      disconnectedAt: DateHelper.createDate(),
      duration: duration
    };

    const result = await this.collection.updateOne(
      { _id: connectionId },
      { $set: updateData }
    );

    return result.modifiedCount > 0;
  }

  // Token bazında bağlantı istatistikleri
  async getTokenStats(tokenId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const stats = await this.collection.aggregate([
      {
        $match: {
          tokenId: tokenId,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalConnections: { $sum: 1 },
          successfulConnections: { $sum: { $cond: ['$success', 1, 0] } },
          failedConnections: { $sum: { $cond: ['$success', 0, 1] } },
          uniqueIPs: { $addToSet: '$ip' },
          avgDuration: { $avg: '$duration' },
          lastConnection: { $max: '$createdAt' },
          firstConnection: { $min: '$createdAt' }
        }
      }
    ]).toArray();

    if (stats.length === 0) {
      return {
        totalConnections: 0,
        successfulConnections: 0,
        failedConnections: 0,
        uniqueIPCount: 0,
        avgDuration: 0,
        lastConnection: null,
        firstConnection: null
      };
    }

    return {
      totalConnections: stats[0].totalConnections,
      successfulConnections: stats[0].successfulConnections,
      failedConnections: stats[0].failedConnections,
      uniqueIPCount: stats[0].uniqueIPs.length,
      avgDuration: Math.round(stats[0].avgDuration || 0),
      lastConnection: stats[0].lastConnection,
      firstConnection: stats[0].firstConnection
    };
  }

  // Domain bazında bağlantı istatistikleri
  async getDomainStats(domain, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const stats = await this.collection.aggregate([
      {
        $match: {
          domain: domain,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalConnections: { $sum: 1 },
          successfulConnections: { $sum: { $cond: ['$success', 1, 0] } },
          failedConnections: { $sum: { $cond: ['$success', 0, 1] } },
          uniqueIPs: { $addToSet: '$ip' },
          avgDuration: { $avg: '$duration' },
          lastConnection: { $max: '$createdAt' },
          tokens: { $addToSet: '$tokenName' }
        }
      }
    ]).toArray();

    if (stats.length === 0) {
      return {
        totalConnections: 0,
        successfulConnections: 0,
        failedConnections: 0,
        uniqueIPCount: 0,
        tokenCount: 0,
        avgDuration: 0,
        lastConnection: null
      };
    }

    return {
      totalConnections: stats[0].totalConnections,
      successfulConnections: stats[0].successfulConnections,
      failedConnections: stats[0].failedConnections,
      uniqueIPCount: stats[0].uniqueIPs.length,
      tokenCount: stats[0].tokens.filter(t => t).length,
      avgDuration: Math.round(stats[0].avgDuration || 0),
      lastConnection: stats[0].lastConnection
    };
  }

  // Genel bağlantı istatistikleri
  async getOverallStats(days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const stats = await this.collection.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalConnections: { $sum: 1 },
          successfulConnections: { $sum: { $cond: ['$success', 1, 0] } },
          failedConnections: { $sum: { $cond: ['$success', 0, 1] } },
          uniqueIPs: { $addToSet: '$ip' },
          uniqueDomains: { $addToSet: '$domain' },
          uniqueTokens: { $addToSet: '$tokenId' },
          avgDuration: { $avg: '$duration' },
          lastConnection: { $max: '$createdAt' }
        }
      }
    ]).toArray();

    if (stats.length === 0) {
      return {
        totalConnections: 0,
        successfulConnections: 0,
        failedConnections: 0,
        uniqueIPCount: 0,
        uniqueDomainCount: 0,
        uniqueTokenCount: 0,
        avgDuration: 0,
        lastConnection: null
      };
    }

    return {
      totalConnections: stats[0].totalConnections,
      successfulConnections: stats[0].successfulConnections,
      failedConnections: stats[0].failedConnections,
      uniqueIPCount: stats[0].uniqueIPs.length,
      uniqueDomainCount: stats[0].uniqueDomains.filter(d => d).length,
      uniqueTokenCount: stats[0].uniqueTokens.filter(t => t).length,
      avgDuration: Math.round(stats[0].avgDuration || 0),
      lastConnection: stats[0].lastConnection
    };
  }

  // Son bağlantıları listele
  async getRecentConnections(limit = 50, skip = 0) {
    return await this.collection.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  // Token'a göre son bağlantıları listele
  async getConnectionsByToken(tokenId, limit = 50, skip = 0) {
    return await this.collection.find({ tokenId: tokenId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  // Domain'e göre son bağlantıları listele
  async getConnectionsByDomain(domain, limit = 50, skip = 0) {
    return await this.collection.find({ domain: domain })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  // Günlük bağlantı grafiği verisi
  async getDailyConnectionChart(days = 7) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const chartData = await this.collection.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          totalConnections: { $sum: 1 },
          successfulConnections: { $sum: { $cond: ['$success', 1, 0] } },
          failedConnections: { $sum: { $cond: ['$success', 0, 1] } }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]).toArray();

    return chartData.map(item => ({
      date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
      total: item.totalConnections,
      successful: item.successfulConnections,
      failed: item.failedConnections
    }));
  }

  // Eski logları temizle
  async cleanupOldLogs(days = 90) {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const result = await this.collection.deleteMany({
      createdAt: { $lt: cutoffDate }
    });

    return result.deletedCount;
  }
}

module.exports = ApiConnectionLog;