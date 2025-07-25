const express = require('express');
const router = express.Router();
const { authenticateSession, requireAdmin, requireManagerOrAdmin } = require('../middleware/auth');
const { ObjectId } = require('mongodb');
const LoggerHelper = require('../utils/logger');
const DateHelper = require('../utils/dateHelper');

module.exports = (db) => {
  const User = require('../models/User');
  const Source = require('../models/Source');
  const PriceMapping = require('../models/PriceMapping');
  const CurrencyRate = require('../models/CurrencyRate');
  const CurrentPrices = require('../models/CurrentPrices');
  const Settings = require('../models/Settings');
  
  const userModel = new User(db);
  const sourceModel = new Source(db);
  const mappingModel = new PriceMapping(db);
  const currencyModel = new CurrencyRate(db);
  const currentPricesModel = new CurrentPrices(db);
  const settingsModel = new Settings(db);

  // System Currencies Collection Helper
  const systemCurrenciesCollection = db.collection('system_currencies');

  // Ana sayfa - Dashboard
  router.get('/', authenticateSession, async (req, res) => {
    try {
      const [userStats, sourceStats, mappingStats, currencyStats] = await Promise.all([
        userModel.getStats().catch(() => ({ totalUsers: 0, activeUsers: 0, adminUsers: 0, managerUsers: 0 })),
        sourceModel.getStats().catch(() => ({ totalSources: 0, activeSources: 0, apiSources: 0, scrapingSources: 0 })),
        mappingModel.getStats().catch(() => ({ totalMappings: 0, activeMappings: 0, forexMappings: 0, goldMappings: 0 })),
        currencyModel.getStats().catch(() => ({ totalRecords: 0, symbolCount: 0, sources: [] }))
      ]);

      res.render('admin/dashboard', {
        title: 'Yönetim Paneli',
        page: 'dashboard',
        userStats,
        sourceStats,
        mappingStats,
        currencyStats
      });
    } catch (error) {
      console.error('Dashboard hatası:', error);
      res.render('admin/dashboard', {
        title: 'Yönetim Paneli',
        page: 'dashboard',
        error: 'Veriler yüklenirken hata oluştu',
        userStats: { totalUsers: 0, activeUsers: 0, adminUsers: 0, managerUsers: 0 },
        sourceStats: { totalSources: 0, activeSources: 0, apiSources: 0, scrapingSources: 0 },
        mappingStats: { totalMappings: 0, activeMappings: 0, forexMappings: 0, goldMappings: 0 },
        currencyStats: { totalRecords: 0, symbolCount: 0, sources: [] }
      });
    }
  });

  // === USER MANAGEMENT ===
  
  // Kullanıcı listesi
  router.get('/users', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const users = await userModel.list({ limit: 100 });
      res.render('admin/users/list', {
        title: 'Kullanıcı Yönetimi',
        page: 'users',
        users
      });
    } catch (error) {
      console.error('Kullanıcı listesi hatası:', error);
      res.render('admin/users/list', {
        title: 'Kullanıcı Yönetimi',
        page: 'users',
        users: [],
        error: 'Kullanıcılar yüklenirken hata oluştu'
      });
    }
  });

  // Yeni kullanıcı formu
  router.get('/users/new', authenticateSession, requireAdmin, (req, res) => {
    res.render('admin/users/new', {
      title: 'Yeni Kullanıcı Ekle'
    });
  });

  // Yeni kullanıcı oluştur
  router.post('/users', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const userData = {
        ...req.body,
        createdBy: req.user._id
      };
      
      const user = await userModel.create(userData);
      res.redirect('/admin/users?success=Kullanıcı başarıyla oluşturuldu');
    } catch (error) {
      console.error('Kullanıcı oluşturma hatası:', error);
      res.render('admin/users/new', {
        title: 'Yeni Kullanıcı Ekle',
        error: error.message,
        formData: req.body
      });
    }
  });

  // Kullanıcı düzenleme formu
  router.get('/users/:id/edit', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const { ObjectId } = require('mongodb');
      const user = await userModel.findById(new ObjectId(req.params.id));
      
      if (!user) {
        return res.redirect('/admin/users?error=Kullanıcı bulunamadı');
      }
      
      res.render('admin/users/edit', {
        title: 'Kullanıcı Düzenle',
        page: 'users',
        editUser: user
      });
    } catch (error) {
      console.error('Kullanıcı düzenleme formu hatası:', error);
      res.redirect('/admin/users?error=Kullanıcı yüklenirken hata oluştu');
    }
  });

  // Kullanıcı güncelle
  router.post('/users/:id', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const { ObjectId } = require('mongodb');
      const userId = new ObjectId(req.params.id);
      
      const updateData = { ...req.body };
      delete updateData.password; // Şifre ayrı güncellenecek
      
      await userModel.update(userId, updateData);
      res.redirect('/admin/users?success=Kullanıcı başarıyla güncellendi');
    } catch (error) {
      console.error('Kullanıcı güncelleme hatası:', error);
      res.redirect(`/admin/users/${req.params.id}/edit?error=${error.message}`);
    }
  });

  // Kullanıcı sil
  router.post('/users/:id/delete', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const { ObjectId } = require('mongodb');
      const userId = new ObjectId(req.params.id);
      
      // Kendi hesabını silmesin
      if (userId.equals(req.user._id)) {
        return res.redirect('/admin/users?error=Kendi hesabınızı silemezsiniz');
      }
      
      await userModel.delete(userId);
      res.redirect('/admin/users?success=Kullanıcı başarıyla silindi');
    } catch (error) {
      console.error('Kullanıcı silme hatası:', error);
      res.redirect('/admin/users?error=Kullanıcı silinirken hata oluştu');
    }
  });

  // === SOURCE MANAGEMENT ===
  
  // Kaynak listesi
  router.get('/sources', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      const sources = await sourceModel.getActiveSources();
      res.render('admin/sources/list', {
        title: 'Veri Kaynakları',
        page: 'sources',
        sources
      });
    } catch (error) {
      console.error('Kaynak listesi hatası:', error);
      res.render('admin/sources/list', {
        title: 'Veri Kaynakları',
        page: 'sources',
        sources: [],
        error: 'Kaynaklar yüklenirken hata oluştu'
      });
    }
  });

  // Yeni kaynak formu
  router.get('/sources/new', authenticateSession, requireManagerOrAdmin, (req, res) => {
    res.render('admin/sources/new', {
      title: 'Yeni Veri Kaynağı Ekle'
    });
  });

  // Yeni kaynak oluştur
  router.post('/sources', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      const source = await sourceModel.create(req.body);
      res.redirect('/admin/sources?success=Veri kaynağı başarıyla oluşturuldu');
    } catch (error) {
      console.error('Kaynak oluşturma hatası:', error);
      res.render('admin/sources/new', {
        title: 'Yeni Veri Kaynağı Ekle',
        error: error.message,
        formData: req.body
      });
    }
  });

  // Kaynak düzenleme formu
  router.get('/sources/:id/edit', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      const { ObjectId } = require('mongodb');
      const source = await sourceModel.getById(new ObjectId(req.params.id));
      
      if (!source) {
        return res.redirect('/admin/sources?error=Veri kaynağı bulunamadı');
      }
      
      res.render('admin/sources/edit', {
        title: 'Veri Kaynağı Düzenle',
        page: 'sources',
        editSource: source
      });
    } catch (error) {
      console.error('Kaynak düzenleme formu hatası:', error);
      res.redirect('/admin/sources?error=Veri kaynağı yüklenirken hata oluştu');
    }
  });

  // Kaynak güncelle
  router.post('/sources/:id', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      const { ObjectId } = require('mongodb');
      const sourceId = new ObjectId(req.params.id);
      
      await sourceModel.update(sourceId, req.body);
      res.redirect('/admin/sources?success=Veri kaynağı başarıyla güncellendi');
    } catch (error) {
      console.error('Kaynak güncelleme hatası:', error);
      res.redirect(`/admin/sources/${req.params.id}/edit?error=${error.message}`);
    }
  });

  // Kaynak sil
  router.post('/sources/:id/delete', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      const { ObjectId } = require('mongodb');
      const sourceId = new ObjectId(req.params.id);
      
      await sourceModel.delete(sourceId);
      res.redirect('/admin/sources?success=Veri kaynağı başarıyla silindi');
    } catch (error) {
      console.error('Kaynak silme hatası:', error);
      res.redirect('/admin/sources?error=Veri kaynağı silinirken hata oluştu');
    }
  });

  // === PRICE MAPPING MANAGEMENT ===
  
  // Eşleştirme listesi
  router.get('/mappings', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      const [mappings, sources] = await Promise.all([
        mappingModel.getAllMappings(),
        db.collection('sources').find({}).toArray()
      ]);
      
      res.render('admin/mappings/list', {
        title: 'Fiyat Eşleştirmeleri',
        page: 'mappings',
        user: req.user,
        mappings,
        sources
      });
    } catch (error) {
      console.error('Eşleştirme listesi hatası:', error);
      res.render('admin/mappings/list', {
        title: 'Fiyat Eşleştirmeleri',
        page: 'mappings',
        user: req.user,
        mappings: [],
        sources: [],
        error: 'Eşleştirmeler yüklenirken hata oluştu'
      });
    }
  });

  // Yeni eşleştirme formu
  router.get('/mappings/new', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      const sources = await sourceModel.getActiveSources();
      const latestRates = await currencyModel.getLatestRates();
      
      res.render('admin/mappings/new', {
        title: 'Yeni Fiyat Eşleştirmesi',
        sources,
        latestRates
      });
    } catch (error) {
      console.error('Eşleştirme formu hatası:', error);
      res.render('admin/mappings/new', {
        title: 'Yeni Fiyat Eşleştirmesi',
        sources: [],
        latestRates: [],
        error: 'Form verileri yüklenirken hata oluştu'
      });
    }
  });

  // Yeni eşleştirme oluştur
  router.post('/mappings', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      const mappingData = {
        ...req.body,
        sourceId: new ObjectId(req.body.sourceId)
      };
      
      const mapping = await mappingModel.create(mappingData);
      res.redirect('/admin/mappings?success=Fiyat eşleştirmesi başarıyla oluşturuldu');
    } catch (error) {
      console.error('Eşleştirme oluşturma hatası:', error);
      
      const sources = await sourceModel.getActiveSources();
      const latestRates = await currencyModel.getLatestRates();
      
      res.render('admin/mappings/new', {
        title: 'Yeni Fiyat Eşleştirmesi',
        sources,
        latestRates,
        error: error.message,
        formData: req.body
      });
    }
  });

  // Eşleştirme düzenleme formu
  router.get('/mappings/:id/edit', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      const { ObjectId } = require('mongodb');
      const mapping = await mappingModel.getById(new ObjectId(req.params.id));
      
      if (!mapping) {
        return res.redirect('/admin/mappings?error=Fiyat eşleştirmesi bulunamadı');
      }
      
      const sources = await sourceModel.getActiveSources();
      const latestRates = await currencyModel.getLatestRates();
      
      res.render('admin/mappings/edit', {
        title: 'Fiyat Eşleştirmesi Düzenle',
        page: 'mappings',
        editMapping: mapping,
        sources,
        latestRates
      });
    } catch (error) {
      console.error('Eşleştirme düzenleme formu hatası:', error);
      res.redirect('/admin/mappings?error=Fiyat eşleştirmesi yüklenirken hata oluştu');
    }
  });

  // Eşleştirme güncelle
  router.post('/mappings/:id', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      const { ObjectId } = require('mongodb');
      const mappingId = new ObjectId(req.params.id);
      
      const updateData = {
        ...req.body,
        sourceId: new ObjectId(req.body.sourceId)
      };
      
      await mappingModel.update(mappingId, updateData);
      res.redirect('/admin/mappings?success=Fiyat eşleştirmesi başarıyla güncellendi');
    } catch (error) {
      console.error('Eşleştirme güncelleme hatası:', error);
      res.redirect(`/admin/mappings/${req.params.id}/edit?error=${error.message}`);
    }
  });

  // Eşleştirme sil
  router.post('/mappings/:id/delete', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      const { ObjectId } = require('mongodb');
      const mappingId = new ObjectId(req.params.id);
      
      await mappingModel.delete(mappingId);
      res.redirect('/admin/mappings?success=Fiyat eşleştirmesi başarıyla silindi');
    } catch (error) {
      console.error('Eşleştirme silme hatası:', error);
      res.redirect('/admin/mappings?error=Fiyat eşleştirmesi silinirken hata oluştu');
    }
  });

  // === CURRENCY RATES ===
  
  // Eski Kurlar (Historical Rates) - From price_history collection
  // Bu route'u duplıkat olduğu için siliyoruz - aşağıdaki yeni rates route'u kullanacağız

  // === SYSTEM CURRENCIES ===
  
  // System currencies listesi
  router.get('/currencies', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const currencies = await systemCurrenciesCollection.find({}).sort({ order: 1, priority: 1, symbol: 1 }).toArray();
      const sources = await sourceModel.getActiveSources();
      
      // Her currency için price mappings bilgisini de ekle
      const currenciesWithMappings = await Promise.all(currencies.map(async (currency) => {
        try {
          // Bu currency için aktif price mappings'leri getir
          const mappings = await mappingModel.getMappingsByTarget(currency.symbol);
          
          // Mappings'leri source name'lere göre grupla
          const mappingsBySource = {};
          const activeSources = []; // Gerçekten eşleştirme olan kaynaklar
          
          for (const mapping of mappings) {
            // Source bilgisini al
            const source = await sourceModel.getById(mapping.sourceId);
            if (source && mapping.isActive) {
              mappingsBySource[source.name] = mapping.sourceField;
              activeSources.push(source.name);
            }
          }
          
          // Currency nesnesini genişlet
          return {
            ...currency,
            priceMappings: mappingsBySource,
            hasPriceMappings: Object.keys(mappingsBySource).length > 0,
            activeSources: activeSources, // Price mappings'de aktif olan kaynaklar
            configuredSources: currency.sources || [], // Currency'de tanımlı kaynaklar
            hasActiveSources: activeSources.length > 0
          };
        } catch (error) {
          console.error(`Currency ${currency.symbol} için mappings alınırken hata:`, error);
          return currency;
        }
      }));
      
      res.render('admin/currencies/list', {
        title: 'Sistem Currency\'leri',
        page: 'currencies',
        currencies: currenciesWithMappings,
        sources
      });
    } catch (error) {
      console.error('System currencies listesi hatası:', error);
      res.render('admin/currencies/list', {
        title: 'Sistem Currency\'leri',
        page: 'currencies',
        currencies: [],
        sources: [],
        error: 'Currency\'ler yüklenirken hata oluştu'
      });
    }
  });

  // Yeni system currency formu
  router.get('/currencies/new', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const sources = await sourceModel.getActiveSources();
      res.render('admin/currencies/new', {
        title: 'Yeni Currency Ekle',
        page: 'currencies',
        sources
      });
    } catch (error) {
      console.error('Currency formu hatası:', error);
      res.render('admin/currencies/new', {
        title: 'Yeni Currency Ekle',
        page: 'currencies',
        sources: [],
        error: 'Form yüklenirken hata oluştu'
      });
    }
  });

  // Yeni system currency oluştur
  router.post('/currencies', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const currencyData = {
        symbol: req.body.symbol,
        code: req.body.code,
        name: req.body.name,
        type: req.body.type,
        baseCurrency: req.body.baseCurrency,
        quoteCurrency: req.body.quoteCurrency || 'TRY',
        isActive: req.body.isActive === 'on',
        priority: parseInt(req.body.priority) || 1,
        hasSource: req.body.sources && req.body.sources.length > 0,
        sources: req.body.sources || [],
        sourceMapping: {},
        description: req.body.description,
        createdAt: DateHelper.createDate(),
        updatedAt: DateHelper.createDate()
      };

      // Source mapping'lerini ekle
      if (req.body.sources) {
        req.body.sources.forEach(sourceName => {
          const mappingField = req.body[`sourceMapping_${sourceName}`];
          if (mappingField) {
            currencyData.sourceMapping[sourceName] = mappingField;
          }
        });
      }

      await systemCurrenciesCollection.insertOne(currencyData);
      res.redirect('/admin/currencies?success=Currency başarıyla oluşturuldu');
    } catch (error) {
      console.error('Currency oluşturma hatası:', error);
      const sources = await sourceModel.getActiveSources();
      res.render('admin/currencies/new', {
        title: 'Yeni Currency Ekle',
        page: 'currencies',
        sources,
        error: error.message,
        formData: req.body
      });
    }
  });

  // System currency düzenleme formu
  router.get('/currencies/:id/edit', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const currency = await systemCurrenciesCollection.findOne({ _id: new ObjectId(req.params.id) });
      if (!currency) {
        return res.redirect('/admin/currencies?error=Currency bulunamadı');
      }

      const sources = await sourceModel.getActiveSources();
      res.render('admin/currencies/edit', {
        title: 'Currency Düzenle',
        page: 'currencies',
        editCurrency: currency,
        sources
      });
    } catch (error) {
      console.error('Currency düzenleme formu hatası:', error);
      res.redirect('/admin/currencies?error=Currency yüklenirken hata oluştu');
    }
  });

  // System currency güncelle
  router.post('/currencies/:id', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const updateData = {
        symbol: req.body.symbol,
        code: req.body.code,
        name: req.body.name,
        type: req.body.type,
        baseCurrency: req.body.baseCurrency,
        quoteCurrency: req.body.quoteCurrency || 'TRY',
        isActive: req.body.isActive === 'on',
        priority: parseInt(req.body.priority) || 1,
        hasSource: req.body.sources && req.body.sources.length > 0,
        sources: req.body.sources || [],
        sourceMapping: {},
        description: req.body.description,
        updatedAt: DateHelper.createDate()
      };

      // Source mapping'lerini güncelle
      if (req.body.sources) {
        req.body.sources.forEach(sourceName => {
          const mappingField = req.body[`sourceMapping_${sourceName}`];
          if (mappingField) {
            updateData.sourceMapping[sourceName] = mappingField;
          }
        });
      }

      // Güncellemeden önce mevcut currency'i al
      const currentCurrency = await systemCurrenciesCollection.findOne({ _id: new ObjectId(req.params.id) });
      
      await systemCurrenciesCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: updateData }
      );
      
      // Price mapping'lerini oluştur veya güncelle
      if (currentCurrency) {
        await updatePriceMappingsForCurrency(
          currentCurrency.symbol,
          updateData.symbol, 
          currentCurrency.sources || [], 
          req.body.sources || [], 
          updateData.sourceMapping, 
          updateData.type
        );
      }
      
      res.redirect('/admin/currencies?success=Currency başarıyla güncellendi');
    } catch (error) {
      console.error('Currency güncelleme hatası:', error);
      res.redirect(`/admin/currencies/${req.params.id}/edit?error=${error.message}`);
    }
  });

  // Price mapping'lerini otomatik güncelle fonksiyonu
  async function updatePriceMappingsForCurrency(oldSymbol, newSymbol, oldSources, newSources, sourceMapping, targetType) {
    try {
      // Kaldırılan kaynakları deaktive et
      const removedSources = oldSources.filter(source => !newSources.includes(source));
      for (const sourceName of removedSources) {
        const source = await sourceModel.getByName(sourceName);
        if (source) {
          await mappingModel.collection.updateMany(
            { sourceId: source._id, targetSymbol: oldSymbol, isActive: true },
            { $set: { isActive: false, updatedAt: DateHelper.createDate() } }
          );
          console.log(`Price mapping deaktive edildi: ${sourceName} -> ${oldSymbol}`);
        }
      }

      // Yeni veya güncellenmiş kaynakları işle
      for (const sourceName of newSources) {
        const source = await sourceModel.getByName(sourceName);
        if (!source) {
          console.warn(`Source bulunamadı: ${sourceName}`);
          continue;
        }

        // Source mapping'den field adını al, yoksa default kullan
        const sourceField = sourceMapping[sourceName] || newSymbol.split('/')[0]; // USD/TRY -> USD
        
        // Mevcut mapping'i kontrol et (hem eski hem yeni symbol için)
        const existingMapping = await mappingModel.collection.findOne({
          sourceId: source._id,
          $or: [
            { targetSymbol: oldSymbol },
            { targetSymbol: newSymbol }
          ]
        });

        if (existingMapping) {
          // Varsa güncelle
          await mappingModel.update(existingMapping._id, {
            sourceField: sourceField,
            targetSymbol: newSymbol,
            targetType: targetType,
            isActive: true,
            updatedAt: DateHelper.createDate()
          });
          console.log(`Price mapping güncellendi: ${sourceName} -> ${newSymbol} (${sourceField})`);
        } else {
          // Yoksa yeni oluştur
          await mappingModel.create({
            sourceId: source._id,
            sourceField: sourceField,
            targetSymbol: newSymbol,
            targetType: targetType,
            priority: 1,
            sourceDescription: `${sourceName} - ${newSymbol} mapping`
          });
          console.log(`Price mapping oluşturuldu: ${sourceName} -> ${newSymbol} (${sourceField})`);
        }
      }
    } catch (error) {
      console.error('Price mapping güncelleme hatası:', error);
    }
  }

  // System currency sil
  router.post('/currencies/:id/delete', authenticateSession, requireAdmin, async (req, res) => {
    try {
      await systemCurrenciesCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.redirect('/admin/currencies?success=Currency başarıyla silindi');
    } catch (error) {
      console.error('Currency silme hatası:', error);
      res.redirect('/admin/currencies?error=Currency silinirken hata oluştu');
    }
  });

  // Currency order güncelle
  router.post('/api/currencies/:id/order', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const { order } = req.body;
      
      if (!order || order < 1) {
        return res.status(400).json({
          success: false,
          error: 'Geçerli bir sıra değeri girin (1 veya daha büyük)'
        });
      }
      
      await systemCurrenciesCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { order: parseInt(order) } }
      );
      
      res.json({
        success: true,
        message: 'Sıra başarıyla güncellendi'
      });
    } catch (error) {
      console.error('Currency order güncelleme hatası:', error);
      res.status(500).json({
        success: false,
        error: 'Sıra güncellenirken hata oluştu'
      });
    }
  });

  // Admin API - Currencies listesi (JSON)
  router.get('/api/currencies', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const currencies = await systemCurrenciesCollection.find({}).sort({ order: 1, priority: 1, symbol: 1 }).toArray();
      res.json(currencies);
    } catch (error) {
      console.error('Admin currencies API hatası:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // === CURRENT PRICES ===
  
  // Güncel fiyatlar listesi
  router.get('/prices', authenticateSession, async (req, res) => {
    try {
      // Current prices'ı source bilgileriyle birlikte al
      const pricesWithSources = await db.collection('current_prices').aggregate([
        { $match: { isActive: true } },
        {
          $lookup: {
            from: 'sources',
            localField: 'sourceId',
            foreignField: '_id',
            as: 'source'
          }
        },
        { $unwind: '$source' },
        {
          $lookup: {
            from: 'system_currencies',
            localField: 'symbol',
            foreignField: 'symbol',
            as: 'currency'
          }
        },
        { $unwind: { path: '$currency', preserveNullAndEmptyArrays: true } },
        { $sort: { 'currency.order': 1, 'source.displayName': 1, symbol: 1 } },
        { $limit: 50 }
      ]).toArray();

      const stats = await currentPricesModel.getStats();
      
      res.render('admin/prices/list', {
        title: 'Güncel Fiyatlar',
        page: 'prices',
        prices: pricesWithSources,
        stats
      });
    } catch (error) {
      console.error('Güncel fiyatlar listesi hatası:', error);
      res.render('admin/prices/list', {
        title: 'Güncel Fiyatlar',
        page: 'prices',
        prices: [],
        stats: null,
        error: 'Fiyatlar yüklenirken hata oluştu'
      });
    }
  });

  // Karşılaştırmalı kurlar tablosu
  router.get('/prices-comparison', authenticateSession, async (req, res) => {
    try {
      // Tüm aktif kaynakları al
      const activeSources = await db.collection('sources').find({ isActive: true }).toArray();
      
      // Tüm aktif birimleri sıraya göre al
      const currencies = await db.collection('system_currencies').find({ isActive: true }).sort({ order: 1, symbol: 1 }).toArray();
      
      // Her birim için tüm kaynaklardan fiyatları al
      const comparisonData = [];
      
      for (const currency of currencies) {
        const row = {
          symbol: currency.symbol,
          name: currency.name,
          order: currency.order,
          sources: {}
        };
        
        // Her kaynak için bu birimin fiyatını bul
        for (const source of activeSources) {
          const price = await db.collection('current_prices').findOne({
            symbol: currency.symbol,
            sourceId: source._id,
            isActive: true
          });
          
          if (price) {
            row.sources[source.name] = {
              displayName: source.displayName,
              buyPrice: price.buyPrice,
              sellPrice: price.sellPrice,
              updatedAt: price.updatedAt,
              changePercent: price.changePercent
            };
          }
        }
        
        // En az bir kaynaktan veri varsa tabloya ekle
        if (Object.keys(row.sources).length > 0) {
          comparisonData.push(row);
        }
      }
      
      res.render('admin/prices/comparison', {
        title: 'Kurlar Karşılaştırması',
        page: 'prices-comparison',
        comparisonData,
        activeSources,
        currencies
      });
    } catch (error) {
      console.error('Kurlar karşılaştırma hatası:', error);
      res.render('admin/prices/comparison', {
        title: 'Kurlar Karşılaştırması',
        page: 'prices-comparison',
        comparisonData: [],
        activeSources: [],
        currencies: [],
        error: 'Karşılaştırma verileri yüklenirken hata oluştu'
      });
    }
  });

  // Fiyat geçmişi
  router.get('/prices/:symbol/:sourceId/history', authenticateSession, async (req, res) => {
    try {
      const { symbol, sourceId } = req.params;
      const days = parseInt(req.query.days) || 7;
      
      const history = await currentPricesModel.getPriceHistory(symbol, new ObjectId(sourceId), days);
      
      res.json({
        success: true,
        symbol,
        sourceId,
        days,
        history
      });
    } catch (error) {
      console.error('Fiyat geçmişi hatası:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // === SETTINGS ===
  
  // Initialize default settings on startup
  settingsModel.initializeDefaults().catch(error => {
    console.error('Settings initialization error:', error);
  });
  
  // Ayarlar sayfası
  router.get('/settings', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const settings = await settingsModel.getAll();
      
      res.render('admin/settings', {
        title: 'Sistem Ayarları',
        page: 'settings',
        settings,
        success: req.query.success,
        error: req.query.error
      });
    } catch (error) {
      console.error('Settings loading error:', error);
      res.render('admin/settings', {
        title: 'Sistem Ayarları',
        page: 'settings',
        settings: settingsModel.getDefaultSettings(),
        error: 'Ayarlar yüklenirken hata oluştu'
      });
    }
  });

  // Genel ayarları kaydet
  router.post('/settings/general', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const settings = {
        siteName: req.body.siteName,
        siteDescription: req.body.siteDescription,
        adminEmail: req.body.adminEmail,
        timezone: req.body.timezone,
        language: req.body.language,
        dateFormat: req.body.dateFormat,
        timeFormat: req.body.timeFormat
      };
      
      await settingsModel.updateCategory('general', settings);
      
      // SettingsService cache'ini yenile
      const settingsService = require('../utils/settingsService');
      await settingsService.refreshCache();
      
      LoggerHelper.logSuccess('system', `Genel ayarlar güncellendi - Admin: ${req.user.username}`);
      
      res.redirect('/admin/settings?success=Genel ayarlar başarıyla kaydedildi');
    } catch (error) {
      console.error('Genel ayarlar kaydetme hatası:', error);
      res.redirect('/admin/settings?error=Ayarlar kaydedilirken hata oluştu');
    }
  });

  // Veri ayarlarını kaydet
  router.post('/settings/data', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const settings = {
        defaultUpdateInterval: parseInt(req.body.defaultUpdateInterval) || 60,
        realtimeUpdateInterval: parseInt(req.body.realtimeUpdateInterval) || 30,
        frequentUpdateInterval: parseInt(req.body.frequentUpdateInterval) || 300,
        dailyUpdateInterval: parseInt(req.body.dailyUpdateInterval) || 3600,
        priceHistoryDays: parseInt(req.body.priceHistoryDays) || 90,
        connectionLogDays: parseInt(req.body.connectionLogDays) || 30,
        priceHistoryRetentionDays: parseInt(req.body.priceHistoryRetentionDays) || 90,
        autoCleanupHour: parseInt(req.body.autoCleanupHour) || 3,
        logRetentionDays: parseInt(req.body.logRetentionDays) || 30,
        autoCleanup: req.body.autoCleanup === 'on',
        cleanupTime: req.body.cleanupTime,
        maxPriceChangePercent: parseFloat(req.body.maxPriceChangePercent) || 10,
        anomalyDetection: req.body.anomalyDetection === 'on'
      };
      
      await settingsModel.updateCategory('data', settings);
      
      // SettingsService cache'ini yenile
      const settingsService = require('../utils/settingsService');
      await settingsService.refreshCache();
      
      LoggerHelper.logSuccess('system', `Veri ayarları güncellendi - Admin: ${req.user.username}`);
      
      res.redirect('/admin/settings?success=Veri ayarları başarıyla kaydedildi');
    } catch (error) {
      console.error('Veri ayarları kaydetme hatası:', error);
      res.redirect('/admin/settings?error=Ayarlar kaydedilirken hata oluştu');
    }
  });

  // Socket ayarlarını kaydet
  router.post('/settings/socket', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const settings = {
        socketPort: parseInt(req.body.socketPort) || 3001,
        maxConnections: parseInt(req.body.maxConnections) || 1000,
        heartbeatInterval: parseInt(req.body.heartbeatInterval) || 30000,
        reconnectAttempts: parseInt(req.body.reconnectAttempts) || 5,
        reconnectDelay: parseInt(req.body.reconnectDelay) || 5000,
        maxReconnectDelay: parseInt(req.body.maxReconnectDelay) || 10000,
        messageTimeout: parseInt(req.body.messageTimeout) || 30000,
        enableCompression: req.body.enableCompression === 'on',
        enableCors: req.body.enableCors === 'on'
      };
      
      await settingsModel.updateCategory('socket', settings);
      
      // SettingsService cache'ini yenile
      const settingsService = require('../utils/settingsService');
      await settingsService.refreshCache();
      
      LoggerHelper.logSuccess('system', `Socket ayarları güncellendi - Admin: ${req.user.username}`);
      
      res.redirect('/admin/settings?success=Socket ayarları başarıyla kaydedildi');
    } catch (error) {
      console.error('Socket ayarları kaydetme hatası:', error);
      res.redirect('/admin/settings?error=Ayarlar kaydedilirken hata oluştu');
    }
  });

  // Güvenlik ayarlarını kaydet
  router.post('/settings/security', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const settings = {
        sessionTimeout: parseInt(req.body.sessionTimeout) || 3600,
        maxLoginAttempts: parseInt(req.body.maxLoginAttempts) || 5,
        lockoutDuration: parseInt(req.body.lockoutDuration) || 900,
        passwordMinLength: parseInt(req.body.passwordMinLength) || 8,
        requireStrongPassword: req.body.requireStrongPassword === 'on',
        enableTwoFactor: req.body.enableTwoFactor === 'on',
        tokenExpiration: parseInt(req.body.tokenExpiration) || 86400
      };
      
      await settingsModel.updateCategory('security', settings);
      
      // SettingsService cache'ini yenile
      const settingsService = require('../utils/settingsService');
      await settingsService.refreshCache();
      
      LoggerHelper.logSuccess('system', `Güvenlik ayarları güncellendi - Admin: ${req.user.username}`);
      
      res.redirect('/admin/settings?success=Güvenlik ayarları başarıyla kaydedildi');
    } catch (error) {
      console.error('Güvenlik ayarları kaydetme hatası:', error);
      res.redirect('/admin/settings?error=Ayarlar kaydedilirken hata oluştu');
    }
  });

  // Loglama ayarlarını kaydet
  router.post('/settings/logging', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const settings = {
        logLevel: req.body.logLevel || 'info',
        enableFileLogging: req.body.enableFileLogging === 'on',
        enableConsoleLogging: req.body.enableConsoleLogging === 'on',
        logRetentionDays: parseInt(req.body.logRetentionDays) || 30,
        maxLogFileSize: req.body.maxLogFileSize || '20m',
        compressOldLogs: req.body.compressOldLogs === 'on',
        logPriceUpdates: req.body.logPriceUpdates === 'on',
        logApiRequests: req.body.logApiRequests === 'on'
      };
      
      await settingsModel.updateCategory('logging', settings);
      
      // SettingsService cache'ini yenile
      const settingsService = require('../utils/settingsService');
      await settingsService.refreshCache();
      
      LoggerHelper.logSuccess('system', `Loglama ayarları güncellendi - Admin: ${req.user.username}`);
      
      res.redirect('/admin/settings?success=Loglama ayarları başarıyla kaydedildi');
    } catch (error) {
      console.error('Loglama ayarları kaydetme hatası:', error);
      res.redirect('/admin/settings?error=Ayarlar kaydedilirken hata oluştu');
    }
  });

  // Developer mode settings
  router.post('/settings/devmode', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const settings = {
        enabled: req.body.enabled === 'on',
        showConsoleDebug: req.body.showConsoleDebug === 'on',
        showDatabaseOperations: req.body.showDatabaseOperations === 'on',
        showPriceChangeNotifications: req.body.showPriceChangeNotifications === 'on'
      };

      await settingsModel.updateCategory('devmode', settings);

      // SettingsService cache'ini yenile
      const settingsService = require('../utils/settingsService');
      await settingsService.refreshCache();

      LoggerHelper.logSuccess('admin', `Developer mode ayarları güncellendi - Admin: ${req.user.username}`);

      res.redirect('/admin/settings?success=Geliştirici modu ayarları başarıyla kaydedildi');
    } catch (error) {
      console.error('Developer mode ayarları kaydetme hatası:', error);
      res.redirect('/admin/settings?error=Ayarlar kaydedilirken hata oluştu');
    }
  });

  // Settings reset API endpoint
  router.post('/api/settings/reset', authenticateSession, requireAdmin, async (req, res) => {
    try {
      // Mevcut tüm ayarları sil
      await settingsModel.collection.deleteMany({});
      
      // Varsayılan ayarları yeniden başlat
      await settingsModel.initializeDefaults();
      
      // SettingsService cache'ini yenile
      const settingsService = require('../utils/settingsService');
      await settingsService.refreshCache();
      
      LoggerHelper.logSuccess('system', `Tüm ayarlar varsayılan değerlere sıfırlandı - Admin: ${req.user.username}`);
      
      res.json({ success: true, message: 'Ayarlar varsayılan değerlere sıfırlandı' });
    } catch (error) {
      console.error('Settings reset hatası:', error);
      res.status(500).json({ success: false, error: 'Ayarlar sıfırlanamadı' });
    }
  });

  // === API ENDPOINTS ===
  
  // Servislerden örnek veri çek
  router.post('/api/sources/:sourceName/fetch-sample', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const { sourceName } = req.params;
      let service = null;
      let sampleData = null;
      
      switch (sourceName) {
        case 'altinkaynak':
          if (global.altinKaynakService) {
            const AltinKaynakService = require('../services/AltinKaynakService');
            service = new AltinKaynakService(db);
            
            const [currencyData, goldData] = await Promise.all([
              service.fetchCurrencyData().catch(() => []),
              service.fetchGoldData().catch(() => [])
            ]);
            
            sampleData = {
              currency: currencyData.map(item => ({
                kod: item.Kod,
                aciklama: item.Aciklama,
                alis: item.Alis,
                satis: item.Satis
              })),
              gold: goldData.map(item => ({
                kod: item.Kod,
                aciklama: item.Aciklama,
                alis: item.Alis,
                satis: item.Satis
              }))
            };
          }
          break;
          
        case 'hakangold':
          if (global.hakanAltinService) {
            // fetchSampleData metodunu kullan
            const result = await global.hakanAltinService.fetchSampleData();
            if (result.success) {
              sampleData = result.sampleData;
            } else {
              // Fallback: Mevcut verileri kullan
              const status = global.hakanAltinService.getStatus();
              const priceData = Array.from(global.hakanAltinService.priceData || new Map());
              
              sampleData = {
                currency: priceData.map(([code, data]) => ({
                  kod: code,
                  aciklama: global.hakanAltinService.currencyMapping[code] || code,
                  alis: data.alis,
                  satis: data.satis
                }))
              };
            }
          }
          break;
          
        case 'haremgold':
          if (global.haremAltinService) {
            // Mevcut verileri kullan
            const status = global.haremAltinService.getStatus();
            const priceData = Array.from(global.haremAltinService.priceData || new Map());
            
            sampleData = {
              currency: priceData.map(([code, data]) => ({
                kod: code,
                aciklama: global.haremAltinService.currencyMapping[code] || code,
                alis: data.alis,
                satis: data.satis
              }))
            };
          }
          break;
          
        case 'haremgoldweb':
          if (global.haremAltinWebService) {
            // fetchSampleData metodunu kullan
            const result = await global.haremAltinWebService.fetchSampleData();
            if (result.success) {
              sampleData = result.sampleData;
            }
          }
          break;
          
        case 'tcmb':
          if (global.tcmbService) {
            // fetchSampleData metodunu kullan
            const result = await global.tcmbService.fetchSampleData();
            if (result.success) {
              sampleData = result.sampleData;
            }
          }
          break;
          
        default:
          return res.status(404).json({
            success: false,
            error: 'Desteklenmeyen kaynak: ' + sourceName
          });
      }
      
      if (!sampleData) {
        return res.status(503).json({
          success: false,
          error: 'Servis kullanılamıyor veya veri alınamadı'
        });
      }
      
      res.json({
        success: true,
        sourceName,
        sampleData
      });
      
    } catch (error) {
      console.error('Örnek veri çekme hatası:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Bulk mapping oluştur (Currencies sayfasından)
  router.post('/api/mappings/bulk-create', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const { mappings } = req.body;
      
      if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Geçerli mapping listesi gerekli'
        });
      }

      let createdCount = 0;
      let skippedCount = 0;
      const results = [];

      for (const mapping of mappings) {
        try {
          const { currencyId, symbol, sourceName, sourceField, priority } = mapping;
          
          // Source'u bul
          const source = await sourceModel.findByName(sourceName);
          if (!source) {
            results.push({
              symbol,
              sourceField,
              status: 'error',
              error: 'Kaynak bulunamadı'
            });
            skippedCount++;
            continue;
          }

          // Mevcut mapping var mı kontrol et
          const existingMapping = await db.collection('price_mappings').findOne({
            sourceId: source._id,
            sourceField: sourceField
          });

          if (existingMapping) {
            results.push({
              symbol,
              sourceField,
              status: 'skipped',
              error: 'Mapping zaten mevcut'
            });
            skippedCount++;
            continue;
          }

          // Yeni mapping oluştur
          const mappingData = {
            sourceId: source._id,
            sourceField: sourceField,
            sourceDescription: `${symbol} - ${source.displayName}`,
            targetSymbol: symbol,
            targetType: symbol.includes('HAS') ? 'gold' : 'forex',
            priority: priority || 1,
            multiplier: 1,
            offset: 0,
            formula: null,
            isActive: true,
            createdAt: DateHelper.createDate(),
            updatedAt: DateHelper.createDate(),
            metadata: {
              bulkCreated: true,
              systemCurrencyId: currencyId,
              sourceName: sourceName
            }
          };

          await db.collection('price_mappings').insertOne(mappingData);
          
          results.push({
            symbol,
            sourceField,
            status: 'created',
            error: null
          });
          createdCount++;

        } catch (error) {
          console.error(`Mapping oluşturma hatası (${mapping.symbol}):`, error);
          results.push({
            symbol: mapping.symbol || 'Unknown',
            sourceField: mapping.sourceField || 'Unknown',
            status: 'error',
            error: error.message
          });
          skippedCount++;
        }
      }

      res.json({
        success: true,
        createdCount,
        skippedCount,
        results
      });

    } catch (error) {
      console.error('Bulk mapping oluşturma hatası:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Otomatik mapping oluştur
  router.post('/api/mappings/auto-create', authenticateSession, requireAdmin, async (req, res) => {
    try {
      let createdCount = 0;
      let skippedCount = 0;
      const results = [];

      // System currencies'leri al
      const systemCurrencies = await systemCurrenciesCollection
        .find({ hasSource: true, isActive: true })
        .toArray();

      for (const currency of systemCurrencies) {
        for (const sourceName of currency.sources) {
          const source = await sourceModel.findByName(sourceName);
          if (!source) continue;

          // Source field'ını belirle - farklı formatları dene
          let sourceField;
          if (currency.sourceMapping && currency.sourceMapping[sourceName]) {
            sourceField = currency.sourceMapping[sourceName];
          } else {
            // Varsayılan olarak currency code'u kullan
            sourceField = currency.code;
            
            // Eğer source haremgoldweb ise, slash'sız format dene
            if (sourceName === 'haremgoldweb') {
              // USD/TRY -> USDTRY formatı
              const symbolWithoutSlash = currency.symbol.replace('/', '');
              sourceField = symbolWithoutSlash;
            }
            // Eğer source tcmb ise, sadece base currency kullan
            else if (sourceName === 'tcmb') {
              // USD/TRY -> USD formatı  
              const baseCurrency = currency.symbol.split('/')[0];
              sourceField = baseCurrency;
            }
          }

          // Mevcut mapping'i kontrol et
          const existingMapping = await db.collection('price_mappings').findOne({
            sourceId: source._id,
            sourceField: sourceField
          });

          if (existingMapping) {
            results.push({
              currency: currency.symbol,
              source: sourceName,
              sourceField,
              status: 'skipped',
              reason: 'Zaten mevcut'
            });
            skippedCount++;
            continue;
          }

          // Yeni mapping oluştur
          const mappingData = {
            sourceId: source._id,
            sourceField: sourceField,
            sourceDescription: currency.name,
            targetSymbol: currency.symbol,
            targetType: 'forex',
            priority: currency.priority,
            multiplier: 1,
            offset: 0,
            formula: null,
            isActive: true,
            createdAt: DateHelper.createDate(),
            updatedAt: DateHelper.createDate(),
            metadata: {
              autoCreated: true,
              systemCurrencyId: currency._id
            }
          };

          await db.collection('price_mappings').insertOne(mappingData);
          results.push({
            currency: currency.symbol,
            source: sourceName,
            sourceField,
            status: 'created',
            reason: 'Başarıyla oluşturuldu'
          });
          createdCount++;
        }
      }

      res.json({
        success: true,
        createdCount,
        skippedCount,
        results
      });
    } catch (error) {
      console.error('Otomatik mapping oluşturma hatası:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Çoklu mapping güncelleme
  router.post('/api/mappings/bulk-update', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const { mappings } = req.body;
      let updateCount = 0;
      const results = [];

      for (const mapping of mappings) {
        try {
          const { sourceId, sourceField, targetSymbol, isActive } = mapping;
          
          await db.collection('price_mappings').updateOne(
            { sourceId: new ObjectId(sourceId), sourceField },
            {
              $set: {
                targetSymbol,
                isActive: isActive !== false,
                updatedAt: DateHelper.createDate()
              }
            },
            { upsert: true }
          );

          results.push({
            sourceField,
            targetSymbol,
            status: 'updated'
          });
          updateCount++;
        } catch (error) {
          results.push({
            sourceField: mapping.sourceField,
            targetSymbol: mapping.targetSymbol,
            status: 'error',
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        updateCount,
        results
      });
    } catch (error) {
      console.error('Çoklu mapping güncelleme hatası:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // AltinKaynak zorla güncelleme
  router.post('/api/altinkaynak/force-update', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      if (global.altinKaynakService) {
        const result = await global.altinKaynakService.forceUpdate();
        res.json({
          success: true,
          message: 'AltinKaynak güncelleme başarılı',
          result
        });
      } else {
        res.status(503).json({
          success: false,
          error: 'AltinKaynak servisi kullanılamıyor'
        });
      }
    } catch (error) {
      console.error('AltinKaynak zorla güncelleme hatası:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // AltinKaynak servis durumu
  router.get('/api/altinkaynak/status', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      if (global.altinKaynakService) {
        const status = global.altinKaynakService.getStatus();
        res.json({
          success: true,
          status
        });
      } else {
        res.json({
          success: false,
          error: 'AltinKaynak servisi kullanılamıyor'
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // Kullanıcı durumu değiştir
  router.post('/api/users/:id/toggle', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const user = await userModel.findById(new ObjectId(req.params.id));
      if (!user) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      }

      await userModel.update(new ObjectId(req.params.id), { 
        isActive: !user.isActive 
      });

      res.json({ 
        success: true, 
        message: user.isActive ? 'Kullanıcı deaktif edildi' : 'Kullanıcı aktif edildi'
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Kaynak durumu değiştir
  router.post('/api/sources/:id/toggle', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      const source = await sourceModel.getById(new ObjectId(req.params.id));
      if (!source) {
        return res.status(404).json({ error: 'Kaynak bulunamadı' });
      }

      await sourceModel.update(new ObjectId(req.params.id), { 
        isActive: !source.isActive 
      });

      res.json({ 
        success: true, 
        message: source.isActive ? 'Kaynak deaktif edildi' : 'Kaynak aktif edildi'
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Logs - Log görüntüleme sayfası
  router.get('/logs', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const { source, date } = req.query;
      
      // Mevcut kaynakları al
      const sources = await db.collection('sources').find({}).toArray();
      const sourceList = sources.map(s => ({ name: s.name, displayName: s.displayName }));
      sourceList.unshift({ name: 'system', displayName: 'Sistem' });
      
      // Log dosyalarını al
      const logFiles = await LoggerHelper.getLogFiles(source, date);
      
      res.render('admin/logs/list', {
        title: 'Log Dosyaları',
        page: 'logs',
        user: req.user,
        sources: sourceList,
        logFiles,
        selectedSource: source,
        selectedDate: date
      });
    } catch (error) {
      console.error('Log sayfası hatası:', error);
      res.render('admin/logs/list', {
        title: 'Log Dosyaları',
        page: 'logs',
        user: req.user,
        sources: [],
        logFiles: [],
        error: 'Log dosyaları yüklenemedi: ' + error.message
      });
    }
  });

  // Logs API - Log dosyası içeriği
  router.get('/api/logs/:filename', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const { filename } = req.params;
      const { source, lines = 100 } = req.query;
      
      // Log dosyalarını al ve dosyayı bul
      const logFiles = await LoggerHelper.getLogFiles(source);
      const logFile = logFiles.find(file => file.name === filename);
      
      if (!logFile) {
        return res.status(404).json({ error: 'Log dosyası bulunamadı' });
      }
      
      const logLines = await LoggerHelper.readLogFile(logFile.path, parseInt(lines));
      
      res.json({
        success: true,
        filename: logFile.name,
        size: logFile.size,
        modified: logFile.modified,
        lines: logLines
      });
      
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Logs API - Canlı loglar
  router.get('/api/logs/live/:source', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const { source } = req.params;
      const { lines = 50 } = req.query;
      
      console.log(`🔍 Live log request: source=${source}, lines=${lines}`);
      
      // Günün log dosyasını al
      const today = DateHelper.formatDate(DateHelper.createDate());
      console.log(`📅 Bugünün tarihi: ${today}`);
      
      const logFiles = await LoggerHelper.getLogFiles(source, today);
      console.log(`📁 Bulunan log dosyası sayısı: ${logFiles.length}`);
      
      if (logFiles.length === 0) {
        // Günün log dosyası yoksa, son log dosyasını al
        const allLogFiles = await LoggerHelper.getLogFiles(source);
        console.log(`📁 Tüm log dosyası sayısı: ${allLogFiles.length}`);
        
        if (allLogFiles.length === 0) {
          return res.json({ 
            success: true, 
            lines: [],
            message: `${source} kaynağı için log dosyası bulunamadı`
          });
        }
        
        const latestLogFile = allLogFiles[0];
        console.log(`📄 En son log dosyası: ${latestLogFile.name}`);
        
        const logLines = await LoggerHelper.readLogFile(latestLogFile.path, parseInt(lines));
        
        return res.json({
          success: true,
          source,
          lines: logLines,
          filename: latestLogFile.name
        });
      }
      
      const latestLogFile = logFiles[0];
      console.log(`📄 Bugünün log dosyası: ${latestLogFile.name}`);
      
      const logLines = await LoggerHelper.readLogFile(latestLogFile.path, parseInt(lines));
      console.log(`📝 Okunan satır sayısı: ${logLines.length}`);
      
      res.json({
        success: true,
        source,
        lines: logLines,
        filename: latestLogFile.name
      });
      
    } catch (error) {
      console.error('❌ Live log API hatası:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // System Monitoring - Sistem bilgileri
  router.get('/api/system/info', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const si = require('systeminformation');
      
      // Sistem bilgilerini paralel olarak al
      const [cpu, mem, disk, currentLoad, dbStats] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.fsSize(),
        si.currentLoad(),
        getDbStats()
      ]);

      // Node.js process bilgileri
      const processMemory = process.memoryUsage();
      const uptime = process.uptime();

      res.json({
        success: true,
        system: {
          cpu: {
            manufacturer: cpu.manufacturer,
            brand: cpu.brand,
            cores: cpu.cores,
            speed: cpu.speed,
            usage: currentLoad.currentload
          },
          memory: {
            total: mem.total,
            available: mem.available,
            used: mem.used,
            free: mem.free,
            usage: ((mem.used / mem.total) * 100)
          },
          disk: disk.map(d => ({
            fs: d.fs,
            type: d.type,
            size: d.size,
            used: d.used,
            available: d.available,
            usage: d.use
          })),
          process: {
            uptime: uptime,
            memory: {
              rss: processMemory.rss,
              heapTotal: processMemory.heapTotal,
              heapUsed: processMemory.heapUsed,
              external: processMemory.external
            },
            pid: process.pid,
            nodeVersion: process.version
          },
          database: dbStats
        }
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // System Control - Restart/Shutdown
  router.post('/api/system/restart', authenticateSession, requireAdmin, async (req, res) => {
    try {
      LoggerHelper.logWarning('system', `Admin ${req.user.username} tarafından sistem yeniden başlatılıyor`);
      
      res.json({ 
        success: true, 
        message: 'Sistem 5 saniye içinde yeniden başlatılacak...' 
      });

      // 5 saniye bekle sonra restart
      setTimeout(() => {
        process.exit(0);
      }, 5000);

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/api/system/shutdown', authenticateSession, requireAdmin, async (req, res) => {
    try {
      LoggerHelper.logWarning('system', `Admin ${req.user.username} tarafından sistem kapatılıyor`);
      
      res.json({ 
        success: true, 
        message: 'Sistem 5 saniye içinde kapatılacak...' 
      });

      // 5 saniye bekle sonra shutdown
      setTimeout(() => {
        process.exit(0);
      }, 5000);

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // === API TOKEN MANAGEMENT ===
  
  // API Token listesi
  router.get('/tokens', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const ApiToken = require('../models/ApiToken');
      const apiTokenModel = new ApiToken(db);
      
      const tokens = await apiTokenModel.listActive({ limit: 100 });
      
      res.render('admin/tokens/list', {
        title: 'API Token Yönetimi',
        page: 'tokens',
        user: req.user,
        tokens
      });
    } catch (error) {
      console.error('Token listesi hatası:', error);
      res.render('admin/tokens/list', {
        title: 'API Token Yönetimi',
        page: 'tokens',
        user: req.user,
        tokens: [],
        error: 'Tokenlar yüklenirken hata oluştu'
      });
    }
  });

  // Yeni API Token formu
  router.get('/tokens/new', authenticateSession, requireAdmin, (req, res) => {
    res.render('admin/tokens/new', {
      title: 'Yeni API Token Ekle',
      page: 'tokens'
    });
  });

  // Yeni API Token oluştur
  router.post('/tokens', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const ApiToken = require('../models/ApiToken');
      const apiTokenModel = new ApiToken(db);
      
      const tokenData = {
        domain: req.body.domain,
        name: req.body.name,
        description: req.body.description,
        permissions: req.body.permissions || ['read'],
        allowedChannels: req.body.allowedChannels ? req.body.allowedChannels.split(',').map(c => c.trim()) : ['*'],
        rateLimit: {
          requests: parseInt(req.body.rateLimit_requests) || 1000,
          window: parseInt(req.body.rateLimit_window) || 60
        },
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
        metadata: {
          createdBy: req.user._id,
          createdByUsername: req.user.username
        }
      };
      
      const token = await apiTokenModel.create(tokenData);
      
      LoggerHelper.logSuccess('system', `Yeni API token oluşturuldu: ${token.name} (${token.domain})`);
      
      res.redirect(`/admin/tokens/${token._id}?success=Token başarıyla oluşturuldu&newToken=${token.token}`);
    } catch (error) {
      console.error('Token oluşturma hatası:', error);
      res.render('admin/tokens/new', {
        title: 'Yeni API Token Ekle',
        page: 'tokens',
        error: error.message,
        formData: req.body
      });
    }
  });

  
  // API Token Logs - Genel log sayfası
  router.get('/tokens/logs', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const ApiConnectionLog = require('../models/ApiConnectionLog');
      const apiConnectionLog = new ApiConnectionLog(db);
      
      // Tüm tokenları al (select listesi için)
      const ApiToken = require('../models/ApiToken');
      const apiTokenModel = new ApiToken(db);
      const allTokens = await apiTokenModel.collection.find({}, { 
        projection: { _id: 1, name: 1, domain: 1, isActive: 1 } 
      }).sort({ name: 1 }).toArray();
      
      // Query parametrelerini al
      const { token: tokenFilter } = req.query;
      let logs, stats, tokenInfo = null;
      
      if (tokenFilter && tokenFilter.length === 24) {
        // Belirli bir token için logları al
        const tokenId = new ObjectId(tokenFilter);
        
        // Token bilgilerini al
        tokenInfo = await apiTokenModel.collection.findOne({ _id: tokenId });
        
        // Token'a özel logları ve istatistikleri al
        [logs, stats] = await Promise.all([
          apiConnectionLog.getConnectionsByToken(tokenId, 100, 0),
          apiConnectionLog.getTokenStats(tokenId, 30)
        ]);
      } else {
        // Tüm logları al
        [logs, stats] = await Promise.all([
          apiConnectionLog.getRecentConnections(100, 0),
          apiConnectionLog.getOverallStats(30)
        ]);
      }
      
      res.render('admin/tokens/logs/list', {
        title: tokenInfo ? `${tokenInfo.name} - API Logları` : 'API Bağlantı Logları',
        logs: logs,
        stats: stats,
        tokenFilter: tokenFilter,
        tokenInfo: tokenInfo,
        allTokens: allTokens,
        currentPage: 1,
        limit: 100
      });
    } catch (error) {
      console.error('API logs sayfası hatası:', error);
      res.render('admin/tokens/logs/list', {
        title: 'API Bağlantı Logları',
        error: 'Loglar yüklenirken hata oluştu',
        logs: [],
        stats: null,
        tokenFilter: null,
        tokenInfo: null
      });
    }
  });

  // API Token Logs - Spesifik token logları
  router.get('/tokens/logs/token/:tokenId', authenticateSession, requireAdmin, async (req, res) => {
    try {
      // ObjectId validation
      if (!req.params.tokenId || req.params.tokenId.length !== 24) {
        return res.redirect('/admin/tokens/logs?error=Geçersiz token ID');
      }
      
      const tokenId = new ObjectId(req.params.tokenId);
      
      // Token bilgilerini al
      const ApiToken = require('../models/ApiToken');
      const apiTokenModel = new ApiToken(db);
      const tokenInfo = await apiTokenModel.collection.findOne({ _id: tokenId });
      
      if (!tokenInfo) {
        return res.redirect('/admin/tokens?error=Token bulunamadı');
      }
      
      // API Connection Log modelini kullan
      const ApiConnectionLog = require('../models/ApiConnectionLog');
      const apiConnectionLog = new ApiConnectionLog(db);
      
      // Token'a özel logları ve istatistikleri al
      const [logs, stats] = await Promise.all([
        apiConnectionLog.getConnectionsByToken(tokenId, 100, 0),
        apiConnectionLog.getTokenStats(tokenId, 30)
      ]);
      
      res.render('admin/tokens/logs/token', {
        title: `${tokenInfo.name} - Token Logları`,
        tokenId: req.params.tokenId,
        tokenInfo: tokenInfo,
        logs: logs,
        stats: stats,
        currentPage: 1,
        limit: 100
      });
    } catch (error) {
      console.error('Token logs sayfası hatası:', error);
      res.redirect('/admin/tokens?error=Token logları yüklenirken hata oluştu');
    }
  });

  // API Token istatistikleri
  router.get('/api/tokens/stats', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const ApiToken = require('../models/ApiToken');
      const apiTokenModel = new ApiToken(db);
      
      const stats = await apiTokenModel.collection.aggregate([
        {
          $group: {
            _id: null,
            totalTokens: { $sum: 1 },
            activeTokens: { $sum: { $cond: ['$isActive', 1, 0] } },
            inactiveTokens: { $sum: { $cond: ['$isActive', 0, 1] } },
            totalUsage: { $sum: '$usageCount' },
            avgUsage: { $avg: '$usageCount' },
            domains: { $addToSet: '$domain' }
          }
        }
      ]).toArray();
      
      const result = stats[0] || {
        totalTokens: 0,
        activeTokens: 0,
        inactiveTokens: 0,
        totalUsage: 0,
        avgUsage: 0,
        domains: []
      };
      
      res.json({
        success: true,
        stats: result
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  // API Token detayları ve düzenleme formu
  router.get('/tokens/:id', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const ApiToken = require('../models/ApiToken');
      const apiTokenModel = new ApiToken(db);
      
      // ObjectId validation
      if (!req.params.id || req.params.id.length !== 24) {
        return res.redirect('/admin/tokens?error=Geçersiz token ID');
      }
      
      const token = await apiTokenModel.collection.findOne({ _id: new ObjectId(req.params.id) });
      
      if (!token) {
        return res.redirect('/admin/tokens?error=Token bulunamadı');
      }
      
      // Token'ı güvenli gösterim için maskeleme
      const maskedToken = token.token ? token.token.substring(0, 8) + '...' + token.token.slice(-4) : '';
      
      res.render('admin/tokens/detail', {
        title: 'API Token Detayları',
        page: 'tokens',
        token: { ...token, maskedToken },
        showToken: req.query.newToken === token.token,
        success: req.query.success,
        error: req.query.error
      });
    } catch (error) {
      console.error('Token detayları hatası:', error);
      res.redirect('/admin/tokens?error=Token detayları yüklenirken hata oluştu');
    }
  });

  // API Token düzenleme
  router.post('/tokens/:id', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const ApiToken = require('../models/ApiToken');
      const apiTokenModel = new ApiToken(db);
      
      // ObjectId validation
      if (!req.params.id || req.params.id.length !== 24) {
        return res.redirect('/admin/tokens?error=Geçersiz token ID');
      }
      
      const updateData = {
        name: req.body.name,
        description: req.body.description,
        permissions: req.body.permissions || ['read'],
        allowedChannels: req.body.allowedChannels ? req.body.allowedChannels.split(',').map(c => c.trim()) : ['*'],
        rateLimit: {
          requests: parseInt(req.body.rateLimit_requests) || 1000,
          window: parseInt(req.body.rateLimit_window) || 60
        },
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null
      };
      
      await apiTokenModel.update(new ObjectId(req.params.id), updateData);
      
      LoggerHelper.logSuccess('system', `API token güncellendi: ${req.params.id}`);
      
      res.redirect(`/admin/tokens/${req.params.id}?success=Token başarıyla güncellendi`);
    } catch (error) {
      console.error('Token güncelleme hatası:', error);
      res.redirect(`/admin/tokens/${req.params.id}?error=${error.message}`);
    }
  });

  // API Token aktif/pasif durumu değiştir
  router.post('/api/tokens/:id/toggle', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const ApiToken = require('../models/ApiToken');
      const apiTokenModel = new ApiToken(db);
      
      // ObjectId validation
      if (!req.params.id || req.params.id.length !== 24) {
        return res.status(400).json({ success: false, error: 'Geçersiz token ID' });
      }
      
      const token = await apiTokenModel.collection.findOne({ _id: new ObjectId(req.params.id) });
      if (!token) {
        return res.status(404).json({ error: 'Token bulunamadı' });
      }

      await apiTokenModel.update(new ObjectId(req.params.id), { 
        isActive: !token.isActive 
      });

      LoggerHelper.logWarning('system', `API token durumu değiştirildi: ${token.name} - ${!token.isActive ? 'aktif' : 'pasif'}`);

      res.json({ 
        success: true, 
        isActive: !token.isActive,
        message: token.isActive ? 'Token deaktif edildi' : 'Token aktif edildi'
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // API Token sil
  router.post('/tokens/:id/delete', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const ApiToken = require('../models/ApiToken');
      const apiTokenModel = new ApiToken(db);
      
      // ObjectId validation
      if (!req.params.id || req.params.id.length !== 24) {
        return res.redirect('/admin/tokens?error=Geçersiz token ID');
      }
      
      const token = await apiTokenModel.collection.findOne({ _id: new ObjectId(req.params.id) });
      if (!token) {
        return res.redirect('/admin/tokens?error=Token bulunamadı');
      }
      
      await apiTokenModel.delete(new ObjectId(req.params.id));
      
      LoggerHelper.logWarning('system', `API token silindi: ${token.name} (${token.domain})`);
      
      res.redirect('/admin/tokens?success=Token başarıyla silindi');
    } catch (error) {
      console.error('Token silme hatası:', error);
      res.redirect('/admin/tokens?error=Token silinirken hata oluştu');
    }
  });


  // === API CONNECTION LOGS ===
  
  // API bağlantı logları sayfası
  router.get('/connection-logs', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const ApiConnectionLog = require('../models/ApiConnectionLog');
      const apiConnectionLogModel = new ApiConnectionLog(db);
      
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const skip = (page - 1) * limit;
      
      const [connections, overallStats] = await Promise.all([
        apiConnectionLogModel.getRecentConnections(limit, skip),
        apiConnectionLogModel.getOverallStats(30)
      ]);
      
      res.render('admin/connection-logs/list', {
        title: 'API Bağlantı Logları',
        page: 'connection-logs',
        user: req.user,
        connections,
        stats: overallStats,
        currentPage: page,
        limit
      });
    } catch (error) {
      console.error('Connection logs hatası:', error);
      res.render('admin/connection-logs/list', {
        title: 'API Bağlantı Logları',
        page: 'connection-logs',
        user: req.user,
        connections: [],
        stats: null,
        error: 'Bağlantı logları yüklenemedi'
      });
    }
  });

  // Token'a göre bağlantı logları
  router.get('/api/connection-logs/token/:tokenId', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const ApiConnectionLog = require('../models/ApiConnectionLog');
      const apiConnectionLogModel = new ApiConnectionLog(db);
      
      const { tokenId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const skip = (page - 1) * limit;
      const days = parseInt(req.query.days) || 30;
      
      const [connections, stats] = await Promise.all([
        apiConnectionLogModel.getConnectionsByToken(new ObjectId(tokenId), limit, skip),
        apiConnectionLogModel.getTokenStats(new ObjectId(tokenId), days)
      ]);
      
      res.json({
        success: true,
        connections,
        stats,
        pagination: {
          page,
          limit,
          hasMore: connections.length === limit
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Domain'e göre bağlantı logları
  router.get('/api/connection-logs/domain/:domain', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const ApiConnectionLog = require('../models/ApiConnectionLog');
      const apiConnectionLogModel = new ApiConnectionLog(db);
      
      const { domain } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const skip = (page - 1) * limit;
      const days = parseInt(req.query.days) || 30;
      
      const [connections, stats] = await Promise.all([
        apiConnectionLogModel.getConnectionsByDomain(domain, limit, skip),
        apiConnectionLogModel.getDomainStats(domain, days)
      ]);
      
      res.json({
        success: true,
        connections,
        stats,
        pagination: {
          page,
          limit,
          hasMore: connections.length === limit
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Bağlantı istatistikleri
  router.get('/api/connection-logs/stats', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const ApiConnectionLog = require('../models/ApiConnectionLog');
      const apiConnectionLogModel = new ApiConnectionLog(db);
      
      const days = parseInt(req.query.days) || 30;
      
      const [overallStats, chartData] = await Promise.all([
        apiConnectionLogModel.getOverallStats(days),
        apiConnectionLogModel.getDailyConnectionChart(7)
      ]);
      
      res.json({
        success: true,
        overall: overallStats,
        chart: chartData
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // === SERVICE MANAGEMENT ENDPOINTS ===
  
  // Tüm servislerin durumu
  router.get('/api/services/status', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      // Get database stats
      const dbStats = await getDbStats();
      
      const services = {
        // System Services
        database: {
          name: 'MongoDB Veritabanı',
          type: 'system',
          available: true,
          status: {
            isRunning: !!db,
            details: {
              dataSize: dbStats?.dataSize || 0,
              collections: dbStats?.collections || 0,
              connections: 1
            }
          }
        },
        server: {
          name: 'Node.js Server',
          type: 'system',
          available: true,
          status: {
            isRunning: true,
            details: {
              uptime: process.uptime(),
              uptimeHuman: formatUptime(process.uptime()),
              memoryUsage: process.memoryUsage(),
              cpuUsage: process.cpuUsage().user / 1000000
            }
          }
        },
        socket: {
          name: 'Socket.IO Server',
          type: 'system',
          available: !!global.io,
          status: {
            isRunning: !!global.io,
            details: global.io ? {
              port: process.env.PORT || 3001,
              connectedClients: global.io.engine.clientsCount || 0,
              tokenAuthClients: global.socketChannels ? global.socketChannels.getConnectedTokensCount() : 0
            } : null
          }
        },
        
        // Data Services
        altinkaynak: {
          name: 'AltınKaynak',
          type: 'data',
          available: !!global.altinKaynakService,
          status: global.altinKaynakService ? {
            isRunning: global.altinKaynakService.getStatus().isActive,
            isConnected: global.altinKaynakService.getStatus().isActive,
            lastUpdateTime: global.altinKaynakService.getStatus().lastUpdate,
            ...global.altinKaynakService.getStatus()
          } : null
        },
        hakangold: {
          name: 'Hakan Altın',
          type: 'data',
          available: !!global.hakanAltinService,
          status: global.hakanAltinService ? {
            isRunning: global.hakanAltinService.isRunning,
            isConnected: global.hakanAltinService.ws && global.hakanAltinService.ws.readyState === 1,
            lastUpdateTime: global.hakanAltinService.getStatus().lastUpdate,
            ...global.hakanAltinService.getStatus()
          } : null
        },
        haremgold: {
          name: 'Harem Altın',
          type: 'data',
          available: !!global.haremAltinService,
          status: global.haremAltinService ? {
            isRunning: global.haremAltinService.isRunning,
            isConnected: global.haremAltinService.socket && global.haremAltinService.socket.connected,
            lastUpdateTime: global.haremAltinService.getStatus().lastUpdate,
            ...global.haremAltinService.getStatus()
          } : null
        },
        haremgoldweb: {
          name: 'Harem Altın Web',
          type: 'data',
          available: !!global.haremAltinWebService,
          status: global.haremAltinWebService ? {
            isRunning: global.haremAltinWebService.getStatus().isRunning,
            isConnected: global.haremAltinWebService.getStatus().isRunning,
            lastUpdateTime: global.haremAltinWebService.getStatus().lastUpdate,
            ...global.haremAltinWebService.getStatus()
          } : null
        },
        tcmb: {
          name: 'TCMB',
          type: 'data',
          available: !!global.tcmbService,
          status: global.tcmbService ? {
            isRunning: global.tcmbService.getStatus().isRunning,
            isConnected: global.tcmbService.getStatus().isRunning,
            lastUpdateTime: global.tcmbService.getStatus().lastUpdate,
            ...global.tcmbService.getStatus()
          } : null
        },
        pricearchive: {
          name: 'Price Archive',
          type: 'cron',
          available: !!global.priceArchiveService,
          status: global.priceArchiveService ? global.priceArchiveService.getServiceStatus() : null
        },
        cleanup: {
          name: 'Cleanup Service',
          type: 'cron',
          available: !!global.cleanupService,
          status: global.cleanupService ? global.cleanupService.getServiceStatus() : null
        }
      };

      res.json({
        success: true,
        services
      });
    } catch (error) {
      LoggerHelper.logError('system', error, 'Service status API');
      res.status(500).json({ error: error.message });
    }
  });

  // Servis kontrolü - Start
  router.post('/api/services/:serviceName/start', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      const { serviceName } = req.params;
      let service;
      let result = { success: false };

      switch (serviceName) {
        case 'altinkaynak':
          service = global.altinKaynakService;
          if (service) {
            await service.start();
            result = { success: true, message: 'AltınKaynak servisi başlatıldı' };
          }
          break;
        case 'hakangold':
          service = global.hakanAltinService;
          if (service) {
            await service.start();
            result = { success: true, message: 'Hakan Altın servisi başlatıldı' };
          }
          break;
        case 'haremgold':
          service = global.haremAltinService;
          if (service) {
            await service.start();
            result = { success: true, message: 'Harem Altın servisi başlatıldı' };
          }
          break;
        case 'haremgoldweb':
          service = global.haremAltinWebService;
          if (service) {
            await service.start();
            result = { success: true, message: 'Harem Altın Web servisi başlatıldı' };
          }
          break;
        case 'tcmb':
          service = global.tcmbService;
          if (service) {
            await service.start();
            result = { success: true, message: 'TCMB servisi başlatıldı' };
          }
          break;
        case 'pricearchive':
          service = global.priceArchiveService;
          if (service) {
            await service.start();
            result = { success: true, message: 'Price Archive servisi başlatıldı' };
          }
          break;
        case 'cleanup':
          service = global.cleanupService;
          if (service) {
            await service.start();
            result = { success: true, message: 'Cleanup servisi başlatıldı' };
          }
          break;
        default:
          return res.status(404).json({ error: 'Servis bulunamadı' });
      }

      if (!service) {
        return res.status(503).json({ error: 'Servis kullanılamıyor' });
      }

      LoggerHelper.logSuccess('system', `${serviceName} servisi başlatıldı - Admin: ${req.user.username}`);
      res.json(result);
      
    } catch (error) {
      LoggerHelper.logError('system', error, `Service start: ${req.params.serviceName}`);
      res.status(500).json({ error: error.message });
    }
  });

  // Servis kontrolü - Stop
  router.post('/api/services/:serviceName/stop', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      const { serviceName } = req.params;
      let service;
      let result = { success: false };

      switch (serviceName) {
        case 'altinkaynak':
          service = global.altinKaynakService;
          if (service) {
            await service.stop();
            result = { success: true, message: 'AltınKaynak servisi durduruldu' };
          }
          break;
        case 'hakangold':
          service = global.hakanAltinService;
          if (service) {
            await service.stop();
            result = { success: true, message: 'Hakan Altın servisi durduruldu' };
          }
          break;
        case 'haremgold':
          service = global.haremAltinService;
          if (service) {
            await service.stop();
            result = { success: true, message: 'Harem Altın servisi durduruldu' };
          }
          break;
        case 'haremgoldweb':
          service = global.haremAltinWebService;
          if (service) {
            await service.stop();
            result = { success: true, message: 'Harem Altın Web servisi durduruldu' };
          }
          break;
        case 'tcmb':
          service = global.tcmbService;
          if (service) {
            await service.stop();
            result = { success: true, message: 'TCMB servisi durduruldu' };
          }
          break;
        case 'pricearchive':
          service = global.priceArchiveService;
          if (service) {
            await service.stop();
            result = { success: true, message: 'Price Archive servisi durduruldu' };
          }
          break;
        case 'cleanup':
          service = global.cleanupService;
          if (service) {
            await service.stop();
            result = { success: true, message: 'Cleanup servisi durduruldu' };
          }
          break;
        default:
          return res.status(404).json({ error: 'Servis bulunamadı' });
      }

      if (!service) {
        return res.status(503).json({ error: 'Servis kullanılamıyor' });
      }

      LoggerHelper.logSuccess('system', `${serviceName} servisi durduruldu - Admin: ${req.user.username}`);
      res.json(result);
      
    } catch (error) {
      LoggerHelper.logError('system', error, `Service stop: ${req.params.serviceName}`);
      res.status(500).json({ error: error.message });
    }
  });

  // Servis kontrolü - Restart
  router.post('/api/services/:serviceName/restart', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      const { serviceName } = req.params;
      let service;
      let result = { success: false };

      switch (serviceName) {
        case 'altinkaynak':
          service = global.altinKaynakService;
          if (service) {
            await service.stop();
            await new Promise(resolve => setTimeout(resolve, 1000));
            await service.start();
            result = { success: true, message: 'AltınKaynak servisi yeniden başlatıldı' };
          }
          break;
        case 'hakangold':
          service = global.hakanAltinService;
          if (service) {
            await service.stop();
            await new Promise(resolve => setTimeout(resolve, 1000));
            await service.start();
            result = { success: true, message: 'Hakan Altın servisi yeniden başlatıldı' };
          }
          break;
        case 'haremgold':
          service = global.haremAltinService;
          if (service) {
            await service.stop();
            await new Promise(resolve => setTimeout(resolve, 1000));
            await service.start();
            result = { success: true, message: 'Harem Altın servisi yeniden başlatıldı' };
          }
          break;
        case 'haremgoldweb':
          service = global.haremAltinWebService;
          if (service) {
            await service.stop();
            await new Promise(resolve => setTimeout(resolve, 1000));
            await service.start();
            result = { success: true, message: 'Harem Altın Web servisi yeniden başlatıldı' };
          }
          break;
        case 'pricearchive':
          service = global.priceArchiveService;
          if (service) {
            await service.restart();
            result = { success: true, message: 'Price Archive servisi yeniden başlatıldı' };
          }
          break;
        case 'cleanup':
          service = global.cleanupService;
          if (service) {
            await service.restart();
            result = { success: true, message: 'Cleanup servisi yeniden başlatıldı' };
          }
          break;
        default:
          return res.status(404).json({ error: 'Servis bulunamadı' });
      }

      if (!service) {
        return res.status(503).json({ error: 'Servis kullanılamıyor' });
      }

      LoggerHelper.logSuccess('system', `${serviceName} servisi yeniden başlatıldı - Admin: ${req.user.username}`);
      res.json(result);
      
    } catch (error) {
      LoggerHelper.logError('system', error, `Service restart: ${req.params.serviceName}`);
      res.status(500).json({ error: error.message });
    }
  });

  // Price Archive - Manuel arşivleme
  router.post('/api/services/pricearchive/manual-archive', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      if (!global.priceArchiveService) {
        return res.status(503).json({ error: 'Price Archive servisi kullanılamıyor' });
      }

      await global.priceArchiveService.manualArchive();
      
      LoggerHelper.logSuccess('system', `Manuel price archive başlatıldı - Admin: ${req.user.username}`);
      res.json({ success: true, message: 'Manuel arşivleme başlatıldı' });
      
    } catch (error) {
      LoggerHelper.logError('system', error, 'Manual price archive');
      res.status(500).json({ error: error.message });
    }
  });

  // Cleanup - Manuel temizlik
  router.post('/api/services/cleanup/manual-cleanup', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      if (!global.cleanupService) {
        return res.status(503).json({ error: 'Cleanup servisi kullanılamıyor' });
      }

      await global.cleanupService.manualCleanup();
      
      LoggerHelper.logSuccess('system', `Manuel cleanup başlatıldı - Admin: ${req.user.username}`);
      res.json({ success: true, message: 'Manuel temizlik başlatıldı' });
      
    } catch (error) {
      LoggerHelper.logError('system', error, 'Manual cleanup');
      res.status(500).json({ error: error.message });
    }
  });

  // Servis yönetimi sayfası
  router.get('/services', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      const services = [];
      
      // System Services
      const dbStats = await getDbStats();
      services.push({
        id: 'database',
        name: 'MongoDB Veritabanı',
        type: 'system',
        category: 'Sistem Servisleri',
        description: 'MongoDB veritabanı bağlantısı ve veri depolama',
        status: {
          isRunning: !!db,
          details: {
            dataSize: dbStats?.dataSize || 0,
            collections: dbStats?.collections || 0,
            connections: 1
          }
        }
      });

      services.push({
        id: 'server',
        name: 'Node.js Server',
        type: 'system',
        category: 'Sistem Servisleri', 
        description: 'Ana uygulama sunucusu ve API',
        status: {
          isRunning: true,
          details: {
            uptime: process.uptime(),
            uptimeHuman: formatUptime(process.uptime()),
            memoryUsage: process.memoryUsage(),
            cpuUsage: Math.round(process.cpuUsage().system / 1000000)
          }
        }
      });

      services.push({
        id: 'socket',
        name: 'Socket.IO Server',
        type: 'system',
        category: 'Sistem Servisleri',
        description: 'WebSocket bağlantıları ve gerçek zamanlı iletişim',
        status: {
          isRunning: true,
          details: {
            port: process.env.PORT || 3000,
            connectedClients: global.io ? global.io.engine.clientsCount : 0,
            tokenAuthClients: global.clients ? Array.from(global.clients.values()).filter(c => c.isTokenAuth).length : 0
          }
        }
      });
      
      // Data Services
      if (global.altinKaynakService) {
        const altinStatus = global.altinKaynakService.getStatus();
        services.push({
          id: 'altinkaynak',
          name: 'AltınKaynak',
          type: 'data',
          category: 'Veri Servisleri',
          status: {
            isRunning: altinStatus.isActive,
            isConnected: altinStatus.isActive, // AltınKaynak is API based, so if active then connected
            lastUpdateTime: altinStatus.lastUpdate,
            updateInterval: altinStatus.updateInterval,
            mappingCount: altinStatus.mappingCount
          }
        });
      }
      
      if (global.hakanAltinService) {
        const hakanStatus = global.hakanAltinService.getStatus();
        services.push({
          id: 'hakangold',
          name: 'Hakan Altın',
          type: 'data',
          category: 'Veri Servisleri',
          status: {
            isRunning: hakanStatus.isRunning,
            isConnected: hakanStatus.isConnected,
            lastUpdateTime: hakanStatus.lastUpdate,
            activeSymbols: hakanStatus.activeSymbols
          }
        });
      }
      
      if (global.haremAltinService) {
        const haremStatus = global.haremAltinService.getStatus();
        services.push({
          id: 'haremgold',
          name: 'Harem Altın',
          type: 'data',
          category: 'Veri Servisleri',
          status: {
            isRunning: haremStatus.isRunning,
            isConnected: haremStatus.isConnected,
            lastUpdateTime: haremStatus.lastUpdate,
            activeSymbols: haremStatus.activeSymbols
          }
        });
      }
      
      if (global.haremAltinWebService) {
        const haremWebStatus = global.haremAltinWebService.getStatus();
        services.push({
          id: 'haremgoldweb',
          name: 'Harem Altın Web',
          type: 'data',
          category: 'Veri Servisleri',
          status: {
            isRunning: haremWebStatus.isRunning,
            isConnected: haremWebStatus.isRunning, // HTTP based, so if running then connected
            lastUpdateTime: haremWebStatus.lastUpdate,
            activeSymbols: haremWebStatus.activeSymbols,
            updateIntervalMs: haremWebStatus.updateIntervalMs
          }
        });
      }
      
      if (global.tcmbService) {
        const tcmbStatus = global.tcmbService.getStatus();
        services.push({
          id: 'tcmb',
          name: 'TCMB',
          type: 'data',
          category: 'Veri Servisleri',
          status: {
            isRunning: tcmbStatus.isRunning,
            isConnected: tcmbStatus.isRunning, // HTTP based, so if running then connected
            lastUpdateTime: tcmbStatus.lastUpdate,
            activeSymbols: tcmbStatus.activeSymbols,
            updateIntervalMs: tcmbStatus.updateIntervalMs
          }
        });
      }
      
      // Cron Services
      if (global.priceArchiveService) {
        services.push({
          id: 'pricearchive',
          name: 'Price Archive',
          type: 'cron',
          category: 'Zamanlanmış Görevler',
          status: global.priceArchiveService.getServiceStatus()
        });
      }
      
      if (global.cleanupService) {
        services.push({
          id: 'cleanup',
          name: 'Cleanup Service',
          type: 'cron',
          category: 'Zamanlanmış Görevler',
          status: global.cleanupService.getServiceStatus()
        });
      }
      
      res.render('admin/services/list', {
        title: 'Servis Yönetimi',
        page: 'services',
        user: req.user,
        services
      });
    } catch (error) {
      console.error('Servis listesi hatası:', error);
      res.render('admin/services/list', {
        title: 'Servis Yönetimi',
        page: 'services',
        user: req.user,
        services: [],
        error: 'Servisler yüklenirken hata oluştu'
      });
    }
  });

  // System API endpoints
  router.get('/api/system/db-stats', authenticateSession, requireAdmin, async (req, res) => {
    try {
      const stats = await getDbStats();
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      LoggerHelper.logError('system', error, 'Database stats API');
      res.status(500).json({ error: error.message });
    }
  });

  // System metrics for performance chart
  router.get('/api/system/metrics', authenticateSession, requireManagerOrAdmin, async (req, res) => {
    try {
      let metrics = [];
      if (global.metricsService) {
        metrics = await global.metricsService.getRecentMetrics();
      }
      res.json({
        success: true,
        metrics
      });
    } catch (error) {
      LoggerHelper.logError('system', error, 'System metrics API');
      res.status(500).json({ error: error.message });
    }
  });

  // Helper functions
  function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days} gün, ${hours} saat, ${minutes} dakika`;
    } else if (hours > 0) {
      return `${hours} saat, ${minutes} dakika`;
    } else {
      return `${minutes} dakika`;
    }
  }

  // Eski kurlar (rates) sayfası
  router.get('/rates', authenticateSession, async (req, res) => {
    try {
      // Query parametrelerini al
      const {
        source,
        symbol,
        startDate,
        endDate,
        limit = 100,
        page = 1,
        export: exportType
      } = req.query;

      // Filtreleri oluştur
      const filters = {};
      
      if (source) {
        // Source name'e göre ObjectId bul
        const sourceDoc = await db.collection('sources').findOne({ name: source });
        if (sourceDoc) {
          filters.sourceId = sourceDoc._id;
        }
      }
      
      if (symbol) {
        filters.symbol = symbol.toUpperCase();
      }
      
      if (startDate || endDate) {
        filters.timestamp = {};
        if (startDate) filters.timestamp.$gte = new Date(startDate);
        if (endDate) {
          const endDateTime = new Date(endDate);
          endDateTime.setHours(23, 59, 59, 999);
          filters.timestamp.$lte = endDateTime;
        }
      }

      // Price history verilerini al
      const PriceHistory = require('../models/PriceHistory');
      const priceHistory = new PriceHistory(db);
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      // Aggregation pipeline
      const pipeline = [
        { $match: filters },
        {
          $lookup: {
            from: 'sources',
            localField: 'sourceId',
            foreignField: '_id',
            as: 'sourceInfo'
          }
        },
        { $unwind: '$sourceInfo' },
        {
          $project: {
            symbol: 1,
            buyPrice: 1,
            sellPrice: 1,
            midPrice: 1,
            timestamp: 1,
            'sourceInfo.displayName': 1,
            'sourceInfo.name': 1,
            createdAt: 1
          }
        },
        { $sort: { timestamp: -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) }
      ];

      const rates = await db.collection('price_history').aggregate(pipeline).toArray();
      
      // Total count için ayrı sorgu
      const totalCount = await db.collection('price_history').countDocuments(filters);
      
      // Export işlemi
      if (exportType) {
        const allRates = await db.collection('price_history').aggregate([
          { $match: filters },
          {
            $lookup: {
              from: 'sources',
              localField: 'sourceId',
              foreignField: '_id',
              as: 'sourceInfo'
            }
          },
          { $unwind: '$sourceInfo' },
          {
            $project: {
              symbol: 1,
              buyPrice: 1,
              sellPrice: 1,
              midPrice: 1,
              timestamp: 1,
              'sourceInfo.displayName': 1,
              'sourceInfo.name': 1
            }
          },
          { $sort: { timestamp: -1 } }
        ]).toArray();

        if (exportType === 'csv') {
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename="rates.csv"');
          
          const csvContent = [
            'Tarih,Sembol,Kaynak,Alış,Satış,Orta',
            ...allRates.map(rate => [
              new Date(rate.timestamp).toLocaleString('tr-TR'),
              rate.symbol,
              rate.sourceInfo.displayName,
              rate.buyPrice,
              rate.sellPrice,
              rate.midPrice
            ].join(','))
          ].join('\n');
          
          return res.send(csvContent);
        }
        
        if (exportType === 'json') {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', 'attachment; filename="rates.json"');
          return res.json(allRates);
        }
      }

      // Aktif kaynakları al (filter için)
      const sources = await db.collection('sources').find({ isActive: true }).toArray();
      
      // Aktif sembolleri al (filter için)
      const symbols = await db.collection('system_currencies').find({ isActive: true }).sort({ symbol: 1 }).toArray();

      // Grafik verisi için (son 24 saat)
      let chartData = [];
      if (symbol && source) {
        const sourceDoc = await db.collection('sources').findOne({ name: source });
        if (sourceDoc) {
          const chartStartDate = new Date();
          chartStartDate.setDate(chartStartDate.getDate() - 1);
          
          const chartRates = await db.collection('price_history').find({
            symbol: symbol.toUpperCase(),
            sourceId: sourceDoc._id,
            timestamp: { $gte: chartStartDate }
          }).sort({ timestamp: 1 }).toArray();
          
          chartData = chartRates.map(rate => ({
            timestamp: rate.timestamp,
            buyPrice: rate.buyPrice,
            sellPrice: rate.sellPrice,
            midPrice: rate.midPrice
          }));
        }
      }

      const totalPages = Math.ceil(totalCount / parseInt(limit));

      res.render('admin/rates/list', {
        title: 'Eski Kurlar',
        page: 'rates',
        rates,
        sources,
        symbols,
        chartData: JSON.stringify(chartData),
        filters: {
          source,
          symbol,
          startDate,
          endDate,
          limit,
          page: parseInt(page)
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      });
    } catch (error) {
      console.error('Rates sayfası hatası:', error);
      res.render('admin/rates/list', {
        title: 'Eski Kurlar',
        page: 'rates',
        rates: [],
        sources: [],
        symbols: [],
        chartData: '[]',
        filters: {},
        pagination: {},
        error: 'Veriler yüklenirken hata oluştu'
      });
    }
  });

  // Database stats helper
  async function getDbStats() {
    try {
      const stats = await db.stats();
      const collections = await db.listCollections().toArray();
      
      const collectionStats = await Promise.all(
        collections.map(async (col) => {
          try {
            const colStats = await db.collection(col.name).stats();
            return {
              name: col.name,
              count: colStats.count || 0,
              size: colStats.size || 0,
              storageSize: colStats.storageSize || 0
            };
          } catch (error) {
            return {
              name: col.name,
              count: 0,
              size: 0,
              storageSize: 0,
              error: error.message
            };
          }
        })
      );

      return {
        dbName: stats.db,
        collections: stats.collections,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexSize: stats.indexSize,
        totalSize: stats.dataSize + stats.indexSize,
        collectionDetails: collectionStats
      };
    } catch (error) {
      return {
        error: error.message
      };
    }
  }

  return router;
};