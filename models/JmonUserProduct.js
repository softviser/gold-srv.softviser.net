// models/JmonUserProduct.js
const DateHelper = require('../utils/dateHelper');

class JmonUserProduct {
  constructor(db) {
    this.collection = db.collection('jmon_user_products');
    
    // Index oluştur
    this.collection.createIndex({ userId: 1 });
    this.collection.createIndex({ baseSymbol: 1 });
    this.collection.createIndex({ isActive: 1 });
    this.collection.createIndex({ productCode: 1 });
  }

  // Yeni özel ürün oluştur
  async create(data) {
    const { ObjectId } = require('mongodb');
    
    let userObjectId;
    if (typeof data.userId === 'string') {
      userObjectId = new ObjectId(data.userId);
    } else {
      userObjectId = data.userId;
    }

    // Aynı kullanıcıda aynı ürün kodu kontrolü
    if (data.productCode) {
      const existingProduct = await this.collection.findOne({
        userId: userObjectId,
        productCode: data.productCode,
        isActive: true
      });
      
      if (existingProduct) {
        throw new Error('Bu ürün kodu zaten kullanımda');
      }
    }

    // Eğer displayOrder belirtilmemişse, section içindeki en büyük sıralamaya 1 ekle
    let displayOrder = data.displayOrder;
    if (displayOrder === undefined || displayOrder === null) {
      const sectionId = data.sectionId ? (typeof data.sectionId === 'string' ? new ObjectId(data.sectionId) : data.sectionId) : null;
      
      const lastProduct = await this.collection.findOne({
        userId: userObjectId,
        sectionId: sectionId,
        isActive: true
      }, { sort: { displayOrder: -1 } });
      
      displayOrder = lastProduct ? (lastProduct.displayOrder || 0) + 1 : 1;
    }

    const product = {
      userId: userObjectId,
      sectionId: data.sectionId ? (typeof data.sectionId === 'string' ? new ObjectId(data.sectionId) : data.sectionId) : null,
      name: data.name,
      description: data.description || '',
      productCode: data.productCode || this.generateProductCode(),
      displayOrder: displayOrder,
      
      // Formül bilgileri
      buyingFormula: data.buyingFormula, // Örnek: "HAS/TRY_buying * 0.995"
      sellingFormula: data.sellingFormula, // Örnek: "HAS/TRY_selling * 1.005"
      baseSymbol: data.baseSymbol, // Ana sembol: HAS/TRY, USD/TRY, EUR/TRY
      buyingFormulaVariables: this.extractVariables(data.buyingFormula), // _buying, _selling, _last
      sellingFormulaVariables: this.extractVariables(data.sellingFormula), // _buying, _selling, _last
      
      // Görüntülenme ayarları
      displayConfig: {
        type: data.displayConfig?.type || 'currency', // 'currency', 'number', 'percentage'
        decimalPlaces: data.displayConfig?.decimalPlaces || 2,
        prefix: data.displayConfig?.prefix || '',
        suffix: data.displayConfig?.suffix || ' ₺',
        thousandSeparator: data.displayConfig?.thousandSeparator !== false, // default true
        showSign: data.displayConfig?.showSign || false // +/- işareti göster
      },
      
      // Hesaplama ayarları
      calculationConfig: {
        refreshInterval: data.calculationConfig?.refreshInterval || 5000, // 5 saniye
        minValue: data.calculationConfig?.minValue || null,
        maxValue: data.calculationConfig?.maxValue || null,
        useCache: data.calculationConfig?.useCache !== false // default true
      },
      
      // Yuvarlama ayarları - Alış ve satış için ayrı
      buyingRoundingConfig: {
        method: data.buyingRoundingConfig?.method || data.roundingConfig?.method || 'none', // 'none', 'up', 'down', 'nearest'
        precision: data.buyingRoundingConfig?.precision || data.roundingConfig?.precision || 0, // 0, 1, 5, 10, 25, 50, 100
        decimalPlaces: data.buyingRoundingConfig?.decimalPlaces || data.roundingConfig?.decimalPlaces || 2 // Ondalık basamak sayısı
      },
      sellingRoundingConfig: {
        method: data.sellingRoundingConfig?.method || data.roundingConfig?.method || 'none', // 'none', 'up', 'down', 'nearest'
        precision: data.sellingRoundingConfig?.precision || data.roundingConfig?.precision || 0, // 0, 1, 5, 10, 25, 50, 100
        decimalPlaces: data.sellingRoundingConfig?.decimalPlaces || data.roundingConfig?.decimalPlaces || 2 // Ondalık basamak sayısı
      },
      // Eski format uyumluluğu için roundingConfig'i de sakla
      roundingConfig: data.roundingConfig || null,
      
      // Kategori ve etiketler
      category: data.category || 'custom',
      tags: data.tags || [],
      
      // Durum bilgileri
      isActive: true,
      isPublic: data.isPublic || false, // Diğer kullanıcılarla paylaşılabilir mi
      
      // İstatistikler
      usageCount: 0,
      lastCalculatedAt: null,
      lastCalculatedValues: null,
      calculationErrors: 0,
      
      createdAt: DateHelper.createDate(),
      updatedAt: DateHelper.createDate()
    };

    const result = await this.collection.insertOne(product);
    return { ...product, _id: result.insertedId };
  }

  // Ürün kodu üret
  generateProductCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'UP_'; // UserProduct prefix
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Formülden değişkenleri çıkar
  extractVariables(formula) {
    if (!formula) return [];
    
    // Yeni format: currency_code + _alis/_satis
    const variableRegex = /(\w+)_(alis|satis)/g;
    const variables = [];
    let match;
    
    while ((match = variableRegex.exec(formula)) !== null) {
      const currencyCode = match[1]; // HAS, USD, EUR
      const originalPriceType = match[2]; // alis, satis
      
      // _alis ve _satis'i buying ve selling'e çevir
      let priceType;
      if (originalPriceType === 'alis') {
        priceType = 'buying';
      } else if (originalPriceType === 'satis') {
        priceType = 'selling';
      }
      
      const symbol = `${currencyCode}/TRY`; // Symbol formatına çevir
      const variable = `${currencyCode}_${originalPriceType}`; // Orijinal formatı koru
      
      variables.push({
        symbol: symbol,
        priceType: priceType,
        variable: variable,
        currencyCode: currencyCode,
        originalPriceType: originalPriceType
      });
    }
    
    return variables;
  }

  // Ürün bul
  async findById(productId) {
    const { ObjectId } = require('mongodb');
    
    let productObjectId;
    if (typeof productId === 'string') {
      productObjectId = new ObjectId(productId);
    } else {
      productObjectId = productId;
    }
    
    return await this.collection.findOne({ 
      _id: productObjectId,
      isActive: true 
    });
  }

  // Ürün kodu ile bul
  async findByProductCode(productCode, userId = null) {
    const { ObjectId } = require('mongodb');
    
    const query = { 
      productCode: productCode,
      isActive: true 
    };
    
    if (userId) {
      let userObjectId;
      if (typeof userId === 'string') {
        userObjectId = new ObjectId(userId);
      } else {
        userObjectId = userId;
      }
      query.userId = userObjectId;
    }
    
    return await this.collection.findOne(query);
  }

  // Kullanıcının ürünlerini listele
  async findByUserId(userId, options = {}) {
    const { ObjectId } = require('mongodb');
    
    let userObjectId;
    if (typeof userId === 'string') {
      userObjectId = new ObjectId(userId);
    } else {
      userObjectId = userId;
    }

    const { 
      includeInactive = false, 
      category = null, 
      tags = null,
      sectionId = null,
      sortBy = 'displayOrder', 
      sortOrder = 1,
      limit = null,
      skip = 0
    } = options;
    
    const query = { userId: userObjectId };
    if (!includeInactive) {
      query.isActive = true;
    }
    if (category) {
      query.category = category;
    }
    if (tags && tags.length > 0) {
      query.tags = { $in: tags };
    }
    if (sectionId) {
      query.sectionId = typeof sectionId === 'string' ? new ObjectId(sectionId) : sectionId;
    }

    const sort = {};
    sort[sortBy] = sortOrder;

    let queryBuilder = this.collection.find(query).sort(sort);
    
    if (skip > 0) {
      queryBuilder = queryBuilder.skip(skip);
    }
    
    if (limit) {
      queryBuilder = queryBuilder.limit(limit);
    }

    return await queryBuilder.toArray();
  }

  // Public ürünleri listele
  async findPublicProducts(options = {}) {
    const { 
      category = null, 
      tags = null,
      sortBy = 'usageCount', 
      sortOrder = -1,
      limit = 50,
      skip = 0
    } = options;
    
    const query = { 
      isActive: true,
      isPublic: true 
    };
    
    if (category) {
      query.category = category;
    }
    if (tags && tags.length > 0) {
      query.tags = { $in: tags };
    }

    const sort = {};
    sort[sortBy] = sortOrder;

    return await this.collection.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  // Ürün güncelle
  async update(productId, updates) {
    const { ObjectId } = require('mongodb');
    
    let productObjectId;
    if (typeof productId === 'string') {
      productObjectId = new ObjectId(productId);
    } else {
      productObjectId = productId;
    }

    const allowedUpdates = [
      'sectionId', 'name', 'description', 'productCode', 'buyingFormula', 'sellingFormula', 'baseSymbol',
      'displayConfig', 'calculationConfig', 'roundingConfig', 'buyingRoundingConfig', 'sellingRoundingConfig', 
      'category', 'tags', 'isActive', 'isPublic', 'lastCalculatedAt', 'lastCalculatedValues', 'displayOrder'
    ];

    const updateData = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        if (key === 'sectionId' && updates[key]) {
          updateData[key] = typeof updates[key] === 'string' ? new ObjectId(updates[key]) : updates[key];
        } else {
          updateData[key] = updates[key];
        }
      }
    }

    // Formüller güncellenirse değişkenleri yeniden çıkar
    if (updates.buyingFormula) {
      updateData.buyingFormulaVariables = this.extractVariables(updates.buyingFormula);
    }
    if (updates.sellingFormula) {
      updateData.sellingFormulaVariables = this.extractVariables(updates.sellingFormula);
    }

    updateData.updatedAt = DateHelper.createDate();

    const result = await this.collection.updateOne(
      { _id: productObjectId },
      { $set: updateData }
    );

    return result.modifiedCount > 0;
  }

  // Ürün hesaplama sonucunu güncelle
  async updateCalculation(productId, calculatedValues, hasError = false) {
    const { ObjectId } = require('mongodb');
    
    let productObjectId;
    if (typeof productId === 'string') {
      productObjectId = new ObjectId(productId);
    } else {
      productObjectId = productId;
    }

    const updateData = {
      lastCalculatedAt: DateHelper.createDate(),
      updatedAt: DateHelper.createDate()
    };

    if (hasError) {
      updateData.$inc = { calculationErrors: 1 };
    } else {
      updateData.lastCalculatedValues = calculatedValues;
      updateData.$inc = { usageCount: 1 };
    }

    const result = await this.collection.updateOne(
      { _id: productObjectId },
      { $set: updateData, ...updateData.$inc ? { $inc: updateData.$inc } : {} }
    );

    return result.modifiedCount > 0;
  }

  // Ürün klonla
  async clone(productId, targetUserId = null) {
    const originalProduct = await this.findById(productId);
    
    if (!originalProduct) {
      throw new Error('Ürün bulunamadı');
    }

    const cloneData = {
      userId: targetUserId || originalProduct.userId,
      name: `${originalProduct.name} - Kopya`,
      description: originalProduct.description,
      buyingFormula: originalProduct.buyingFormula,
      sellingFormula: originalProduct.sellingFormula,
      baseSymbol: originalProduct.baseSymbol,
      displayConfig: originalProduct.displayConfig,
      calculationConfig: originalProduct.calculationConfig,
      category: originalProduct.category,
      tags: originalProduct.tags,
      isPublic: false // Klonlanan ürün public olmaz
    };

    return await this.create(cloneData);
  }

  // Ürün sil (soft delete)
  async deactivate(productId) {
    return await this.update(productId, { isActive: false });
  }

  // Ürün tamamen sil
  async delete(productId) {
    const { ObjectId } = require('mongodb');
    
    let productObjectId;
    if (typeof productId === 'string') {
      productObjectId = new ObjectId(productId);
    } else {
      productObjectId = productId;
    }

    const result = await this.collection.deleteOne({ _id: productObjectId });
    return result.deletedCount > 0;
  }

  // Kullanıcının tüm ürünlerini sil
  async deleteByUserId(userId) {
    const { ObjectId } = require('mongodb');
    
    let userObjectId;
    if (typeof userId === 'string') {
      userObjectId = new ObjectId(userId);
    } else {
      userObjectId = userId;
    }

    const result = await this.collection.deleteMany({ userId: userObjectId });
    return result.deletedCount;
  }

  // Kategorileri listele
  async getCategories(userId = null) {
    const { ObjectId } = require('mongodb');
    
    const matchQuery = { isActive: true };
    if (userId) {
      let userObjectId;
      if (typeof userId === 'string') {
        userObjectId = new ObjectId(userId);
      } else {
        userObjectId = userId;
      }
      matchQuery.userId = userObjectId;
    }

    const categories = await this.collection.aggregate([
      { $match: matchQuery },
      { 
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          lastUpdated: { $max: '$updatedAt' }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    return categories.map(cat => ({
      category: cat._id,
      count: cat.count,
      lastUpdated: cat.lastUpdated
    }));
  }

  // Etiketleri listele
  async getTags(userId = null) {
    const { ObjectId } = require('mongodb');
    
    const matchQuery = { isActive: true };
    if (userId) {
      let userObjectId;
      if (typeof userId === 'string') {
        userObjectId = new ObjectId(userId);
      } else {
        userObjectId = userId;
      }
      matchQuery.userId = userObjectId;
    }

    const tags = await this.collection.aggregate([
      { $match: matchQuery },
      { $unwind: '$tags' },
      { 
        $group: {
          _id: '$tags',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    return tags.map(tag => ({
      tag: tag._id,
      count: tag.count
    }));
  }

  // Ürün istatistikleri
  async getStats(userId = null) {
    const { ObjectId } = require('mongodb');
    
    const matchQuery = {};
    if (userId) {
      let userObjectId;
      if (typeof userId === 'string') {
        userObjectId = new ObjectId(userId);
      } else {
        userObjectId = userId;
      }
      matchQuery.userId = userObjectId;
    }

    const stats = await this.collection.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          activeProducts: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          publicProducts: {
            $sum: { $cond: ['$isPublic', 1, 0] }
          },
          totalUsage: { $sum: '$usageCount' },
          totalErrors: { $sum: '$calculationErrors' },
          avgUsagePerProduct: { $avg: '$usageCount' }
        }
      }
    ]).toArray();

    if (stats.length === 0) {
      return {
        totalProducts: 0,
        activeProducts: 0,
        publicProducts: 0,
        totalUsage: 0,
        totalErrors: 0,
        avgUsagePerProduct: 0
      };
    }

    return {
      ...stats[0],
      avgUsagePerProduct: Math.round(stats[0].avgUsagePerProduct || 0)
    };
  }

  // En çok kullanılan ürünler
  async getMostUsed(limit = 10, userId = null) {
    const { ObjectId } = require('mongodb');
    
    const query = { isActive: true };
    if (userId) {
      let userObjectId;
      if (typeof userId === 'string') {
        userObjectId = new ObjectId(userId);
      } else {
        userObjectId = userId;
      }
      query.userId = userObjectId;
    }

    return await this.collection.find(query)
      .sort({ usageCount: -1 })
      .limit(limit)
      .toArray();
  }

  // Belirli sembolleri kullanan ürünleri bul
  async findBySymbol(symbol) {
    return await this.collection.find({
      isActive: true,
      baseSymbol: symbol
    }).toArray();
  }

  // Ürün sıralamasını güncelle
  async updateOrder(productId, newOrder, sectionId = null) {
    const { ObjectId } = require('mongodb');
    
    let productObjectId;
    if (typeof productId === 'string') {
      productObjectId = new ObjectId(productId);
    } else {
      productObjectId = productId;
    }

    const result = await this.collection.updateOne(
      { _id: productObjectId },
      { 
        $set: { 
          displayOrder: newOrder,
          updatedAt: DateHelper.createDate()
        }
      }
    );

    return result.modifiedCount > 0;
  }

  // Section içindeki ürünleri sıralamasını yeniden düzenle
  async reorderProductsInSection(userId, sectionId, productIds) {
    const { ObjectId } = require('mongodb');
    
    let userObjectId;
    if (typeof userId === 'string') {
      userObjectId = new ObjectId(userId);
    } else {
      userObjectId = userId;
    }

    // SectionId'yi düzgün handle et
    let sectionObjectId = null;
    if (sectionId && sectionId !== '' && sectionId !== 'null' && sectionId !== null) {
      try {
        sectionObjectId = typeof sectionId === 'string' ? new ObjectId(sectionId) : sectionId;
      } catch (error) {
        console.error('Invalid sectionId:', sectionId);
        // Geçersiz sectionId'yi null olarak kabul et
        sectionObjectId = null;
      }
    }

    console.log('Reordering products:', {
      userId: userObjectId,
      sectionId: sectionObjectId,
      productIds: productIds
    });

    const operations = [];
    
    for (let i = 0; i < productIds.length; i++) {
      const productObjectId = typeof productIds[i] === 'string' ? 
        new ObjectId(productIds[i]) : productIds[i];
      
      // Filter'ı düzgün hazırla
      const filter = { 
        _id: productObjectId, 
        userId: userObjectId
      };

      // SectionId kontrolü - null değerler için özel handling
      if (sectionObjectId) {
        filter.sectionId = sectionObjectId;
      } else {
        // SectionId null olanlar için
        filter.$or = [
          { sectionId: null },
          { sectionId: { $exists: false } }
        ];
      }
      
      operations.push({
        updateOne: {
          filter: filter,
          update: { 
            $set: { 
              displayOrder: i + 1,
              updatedAt: DateHelper.createDate()
            }
          }
        }
      });
    }

    if (operations.length > 0) {
      console.log('Executing bulk write with operations:', operations.length);
      const result = await this.collection.bulkWrite(operations);
      console.log('Bulk write result:', result);
      return result.modifiedCount;
    }

    return 0;
  }
}

module.exports = JmonUserProduct;