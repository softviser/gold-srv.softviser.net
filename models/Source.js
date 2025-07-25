const DateHelper = require('../utils/dateHelper');

class Source {
  constructor(db) {
    this.collection = db.collection('sources');
    
    // Index oluştur
    this.collection.createIndex({ name: 1 }, { unique: true });
    this.collection.createIndex({ type: 1 });
    this.collection.createIndex({ isActive: 1 });
  }

  // Yeni kaynak ekle
  async create(data) {
    const source = {
      name: data.name,                    // Harem Altın, Hakan Altın, TCMB, vb.
      displayName: data.displayName || data.name,
      description: data.description || data.metadata?.description || null, // Kaynak açıklaması
      type: data.type,                    // 'api', 'webscraping', 'manual'
      category: data.category,            // 'gold_dealer', 'bank', 'government', 'exchange'
      url: data.url || null,              // Ana URL
      apiUrl: data.apiUrl || null,        // API endpoint
      apiKey: data.apiKey || null,        // API anahtarı (şifrelenecek)
      apiHeaders: data.apiHeaders || {},   // Ek header'lar
      scrapingConfig: data.scrapingConfig || {}, // Scraping ayarları
      updateInterval: data.updateInterval || 300, // Güncelleme aralığı (saniye)
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true, // Boolean olarak sakla
      priority: data.priority || 5,        // 1-10 arası öncelik
      lastUpdate: null,
      lastError: null,
      successCount: 0,
      errorCount: 0,
      avgResponseTime: 0,
      reliability: 100,                    // Güvenilirlik skoru (0-100)
      dataFormat: data.dataFormat || 'json', // 'json', 'xml', 'html', 'csv'
      timezone: data.timezone || 'Europe/Istanbul',
      currency: data.currency || 'TRY',    // Ana para birimi
      language: data.language || 'tr',
      contactInfo: data.contactInfo || {},
      metadata: data.metadata || {},
      createdAt: DateHelper.createDate(),
      updatedAt: DateHelper.createDate()
    };

    const result = await this.collection.insertOne(source);
    return { ...source, _id: result.insertedId };
  }

  // Tüm aktif kaynakları getir
  async getActiveSources() {
    return await this.collection.find({
      isActive: true
    }).sort({ priority: 1, name: 1 }).toArray();
  }

  // Filtrelere göre kaynak listesi - API routes için
  async list(filters = {}) {
    return await this.collection.find(filters)
      .sort({ priority: 1, name: 1 })
      .toArray();
  }

  // İsme göre kaynak bul
  async findByName(name) {
    return await this.collection.findOne({ name: name });
  }

  // Tip'e göre kaynakları getir
  async getSourcesByType(type) {
    return await this.collection.find({
      type: type,
      isActive: true
    }).sort({ priority: 1 }).toArray();
  }

  // Kategori'ye göre kaynakları getir
  async getSourcesByCategory(category) {
    return await this.collection.find({
      category: category,
      isActive: true
    }).sort({ priority: 1 }).toArray();
  }

  // ID ile kaynak getir
  async getById(sourceId) {
    return await this.collection.findOne({ _id: sourceId });
  }

  // İsim ile kaynak getir
  async getByName(name) {
    return await this.collection.findOne({ name: name });
  }

  // Kaynak güncelle
  async update(sourceId, updates) {
    const allowedUpdates = [
      'displayName', 'description', 'type', 'category', 'url', 'apiUrl', 'apiKey',
      'apiHeaders', 'scrapingConfig', 'updateInterval', 'isActive',
      'priority', 'dataFormat', 'timezone', 'currency', 'language',
      'contactInfo', 'metadata'
    ];

    const updateData = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        // isActive alanını Boolean olarak sakla
        if (key === 'isActive') {
          updateData[key] = Boolean(updates[key]);
        } else {
          updateData[key] = updates[key];
        }
      }
    }

    updateData.updatedAt = DateHelper.createDate();

    const result = await this.collection.updateOne(
      { _id: sourceId },
      { $set: updateData }
    );

    return result.modifiedCount > 0;
  }

  // Son güncelleme zamanını kaydet
  async updateLastCheck(sourceId, success = true, responseTime = 0, error = null) {
    const updateData = {
      lastUpdate: DateHelper.createDate(),
      lastError: error,
      avgResponseTime: responseTime,
      updatedAt: DateHelper.createDate()
    };

    if (success) {
      updateData.$inc = { successCount: 1 };
    } else {
      updateData.$inc = { errorCount: 1 };
    }

    const result = await this.collection.updateOne(
      { _id: sourceId },
      { 
        $set: updateData,
        $inc: updateData.$inc || {}
      }
    );

    // Güvenilirlik skorunu güncelle
    if (result.modifiedCount > 0) {
      await this.updateReliabilityScore(sourceId);
    }

    return result.modifiedCount > 0;
  }

  // Güvenilirlik skorunu hesapla
  async updateReliabilityScore(sourceId) {
    const source = await this.getById(sourceId);
    if (!source) return;

    const totalRequests = source.successCount + source.errorCount;
    if (totalRequests === 0) return;

    const reliability = Math.round((source.successCount / totalRequests) * 100);
    
    await this.collection.updateOne(
      { _id: sourceId },
      { $set: { reliability: reliability } }
    );
  }

  // Kaynak deaktif et
  async deactivate(sourceId) {
    return await this.update(sourceId, { isActive: false });
  }

  // Kaynak sil
  async delete(sourceId) {
    const result = await this.collection.deleteOne({ _id: sourceId });
    return result.deletedCount > 0;
  }

  // Toplu kaynak oluştur
  async bulkCreate(sources) {
    if (!sources || sources.length === 0) return { insertedCount: 0 };
    
    const operations = sources.map(source => ({
      insertOne: {
        document: {
          name: source.name,
          displayName: source.displayName || source.name,
          description: source.description || source.metadata?.description || null,
          type: source.type,
          category: source.category,
          url: source.url || null,
          apiUrl: source.apiUrl || null,
          apiKey: source.apiKey || null,
          apiHeaders: source.apiHeaders || {},
          scrapingConfig: source.scrapingConfig || {},
          updateInterval: source.updateInterval || 300,
          isActive: source.isActive !== undefined ? Boolean(source.isActive) : true,
          priority: source.priority || 5,
          lastUpdate: null,
          lastError: null,
          successCount: 0,
          errorCount: 0,
          avgResponseTime: 0,
          reliability: 100,
          dataFormat: source.dataFormat || 'json',
          timezone: source.timezone || 'Europe/Istanbul',
          currency: source.currency || 'TRY',
          language: source.language || 'tr',
          contactInfo: source.contactInfo || {},
          metadata: source.metadata || {},
          createdAt: DateHelper.createDate(),
          updatedAt: DateHelper.createDate()
        }
      }
    }));

    const result = await this.collection.bulkWrite(operations);
    return result;
  }

  // İstatistikler
  async getStats() {
    const stats = await this.collection.aggregate([
      {
        $group: {
          _id: null,
          totalSources: { $sum: 1 },
          activeSources: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          inactiveSources: {
            $sum: { $cond: ['$isActive', 0, 1] }
          },
          apiSources: {
            $sum: { $cond: [{ $eq: ['$type', 'api'] }, 1, 0] }
          },
          scrapingSources: {
            $sum: { $cond: [{ $eq: ['$type', 'webscraping'] }, 1, 0] }
          },
          manualSources: {
            $sum: { $cond: [{ $eq: ['$type', 'manual'] }, 1, 0] }
          },
          avgReliability: { $avg: '$reliability' },
          totalSuccessCount: { $sum: '$successCount' },
          totalErrorCount: { $sum: '$errorCount' },
          categories: { $addToSet: '$category' }
        }
      }
    ]).toArray();

    if (stats.length === 0) {
      return {
        totalSources: 0,
        activeSources: 0,
        inactiveSources: 0,
        apiSources: 0,
        scrapingSources: 0,
        manualSources: 0,
        avgReliability: 100,
        totalSuccessCount: 0,
        totalErrorCount: 0,
        categories: []
      };
    }

    return {
      totalSources: stats[0].totalSources,
      activeSources: stats[0].activeSources,
      inactiveSources: stats[0].inactiveSources,
      apiSources: stats[0].apiSources,
      scrapingSources: stats[0].scrapingSources,
      manualSources: stats[0].manualSources,
      avgReliability: Math.round(stats[0].avgReliability || 100),
      totalSuccessCount: stats[0].totalSuccessCount,
      totalErrorCount: stats[0].totalErrorCount,
      categories: stats[0].categories.sort()
    };
  }

  // Kaynak performans raporu
  async getPerformanceReport(days = 7) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    return await this.collection.find({
      lastUpdate: { $gte: startDate }
    })
    .sort({ reliability: -1, avgResponseTime: 1 })
    .toArray();
  }
}

module.exports = Source;