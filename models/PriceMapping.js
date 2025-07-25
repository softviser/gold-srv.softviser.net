const DateHelper = require('../utils/dateHelper');

class PriceMapping {
  constructor(db) {
    this.collection = db.collection('price_mappings');
    
    // Index oluştur
    this.collection.createIndex({ sourceId: 1, sourceField: 1 }, { unique: true });
    this.collection.createIndex({ targetSymbol: 1 });
    this.collection.createIndex({ isActive: 1 });
  }

  // Yeni eşleştirme kaydı ekle
  async create(data) {
    const mapping = {
      sourceId: data.sourceId,           // ObjectId - sources tablosuna referans
      sourceField: data.sourceField,     // Kaynaktaki alan adı (örn: "usd", "114", "gold_price")
      sourceDescription: data.sourceDescription || '',
      targetSymbol: data.targetSymbol,   // Bizim sistemdeki sembol (USD/TRY, HAS/TRY)
      targetType: data.targetType,       // 'forex' veya 'gold'
      multiplier: data.multiplier || 1,  // Çarpan değer (gerekirse)
      formula: data.formula || null,     // Hesaplama formülü (JSON)
      isActive: true,
      priority: data.priority || 1,      // Öncelik (1 = yüksek)
      createdAt: DateHelper.createDate(),
      updatedAt: DateHelper.createDate(),
      metadata: data.metadata || {}
    };

    const result = await this.collection.insertOne(mapping);
    return { ...mapping, _id: result.insertedId };
  }

  // Kaynak ID'ye göre eşleştirmeleri getir
  async getMappingsBySource(sourceId) {
    return await this.collection.find({
      sourceId: sourceId,
      isActive: true
    }).sort({ priority: 1 }).toArray();
  }

  // Alias for AltinKaynak service compatibility
  async getBySourceId(sourceId) {
    return await this.getMappingsBySource(sourceId);
  }

  // ID'ye göre eşleştirme getir
  async getById(mappingId) {
    return await this.collection.findOne({ _id: mappingId });
  }

  // Target sembol için eşleştirmeleri getir
  async getMappingsByTarget(targetSymbol) {
    return await this.collection.find({
      targetSymbol: targetSymbol,
      isActive: true
    }).sort({ priority: 1 }).toArray();
  }

  // Tüm aktif eşleştirmeleri getir
  async getAllMappings() {
    return await this.collection.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $lookup: {
          from: 'sources',
          localField: 'sourceId',
          foreignField: '_id',
          as: 'source'
        }
      },
      {
        $unwind: '$source'
      },
      {
        $sort: { 'source.name': 1, priority: 1 }
      }
    ]).toArray();
  }

  // Eşleştirme güncelle
  async update(mappingId, updates) {
    const allowedUpdates = [
      'sourceField', 'sourceDescription', 'targetSymbol', 'targetType',
      'multiplier', 'formula', 'isActive', 'priority', 'metadata'
    ];

    const updateData = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        updateData[key] = updates[key];
      }
    }

    updateData.updatedAt = DateHelper.createDate();

    const result = await this.collection.updateOne(
      { _id: mappingId },
      { $set: updateData }
    );

    return result.modifiedCount > 0;
  }

  // Eşleştirme sil (soft delete)
  async deactivate(mappingId) {
    return await this.update(mappingId, { isActive: false });
  }

  // Eşleştirmeyi tamamen sil
  async delete(mappingId) {
    const result = await this.collection.deleteOne({ _id: mappingId });
    return result.deletedCount > 0;
  }

  // Kaynak field'ına göre target symbol bul
  async findTargetSymbol(sourceId, sourceField) {
    const mapping = await this.collection.findOne({
      sourceId: sourceId,
      sourceField: sourceField,
      isActive: true
    });

    return mapping ? mapping.targetSymbol : null;
  }

  // Veri dönüştürme fonksiyonu
  async transformValue(mappingId, value) {
    const mapping = await this.collection.findOne({ _id: mappingId });
    
    if (!mapping) return value;

    let transformedValue = parseFloat(value);

    // Çarpan uygula
    if (mapping.multiplier && mapping.multiplier !== 1) {
      transformedValue *= mapping.multiplier;
    }

    // Formül uygula (gelişmiş hesaplamalar için)
    if (mapping.formula) {
      try {
        // Formula örneği: {"operation": "divide", "value": 100}
        const formula = mapping.formula;
        
        switch (formula.operation) {
          case 'multiply':
            transformedValue *= formula.value;
            break;
          case 'divide':
            transformedValue /= formula.value;
            break;
          case 'add':
            transformedValue += formula.value;
            break;
          case 'subtract':
            transformedValue -= formula.value;
            break;
        }
      } catch (error) {
        console.error('Formül uygulanırken hata:', error);
      }
    }

    return transformedValue;
  }

  // Toplu eşleştirme oluştur
  async bulkCreate(mappings) {
    if (!mappings || mappings.length === 0) return { insertedCount: 0 };
    
    const operations = mappings.map(mapping => ({
      insertOne: {
        document: {
          sourceId: mapping.sourceId,
          sourceField: mapping.sourceField,
          sourceDescription: mapping.sourceDescription || '',
          targetSymbol: mapping.targetSymbol,
          targetType: mapping.targetType,
          multiplier: mapping.multiplier || 1,
          formula: mapping.formula || null,
          isActive: true,
          priority: mapping.priority || 1,
          createdAt: DateHelper.createDate(),
          updatedAt: DateHelper.createDate(),
          metadata: mapping.metadata || {}
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
          totalMappings: { $sum: 1 },
          activeMappings: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          inactiveMappings: {
            $sum: { $cond: ['$isActive', 0, 1] }
          },
          forexMappings: {
            $sum: { $cond: [{ $eq: ['$targetType', 'forex'] }, 1, 0] }
          },
          goldMappings: {
            $sum: { $cond: [{ $eq: ['$targetType', 'gold'] }, 1, 0] }
          },
          uniqueSources: { $addToSet: '$sourceId' },
          uniqueTargets: { $addToSet: '$targetSymbol' }
        }
      }
    ]).toArray();

    if (stats.length === 0) {
      return {
        totalMappings: 0,
        activeMappings: 0,
        inactiveMappings: 0,
        forexMappings: 0,
        goldMappings: 0,
        uniqueSourceCount: 0,
        uniqueTargetCount: 0
      };
    }

    return {
      totalMappings: stats[0].totalMappings,
      activeMappings: stats[0].activeMappings,
      inactiveMappings: stats[0].inactiveMappings,
      forexMappings: stats[0].forexMappings,
      goldMappings: stats[0].goldMappings,
      uniqueSourceCount: stats[0].uniqueSources.length,
      uniqueTargetCount: stats[0].uniqueTargets.length
    };
  }
}

module.exports = PriceMapping;