const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');

// MongoDB connection
let db;
async function connectDB() {
  if (!db) {
    const client = new MongoClient(process.env.MONGODB_URI, {
      auth: {
        username: process.env.MONGODB_USERNAME,
        password: process.env.MONGODB_PASSWORD
      }
    });
    await client.connect();
    db = client.db();
  }
  return db;
}

// Session middleware for konsol
router.use(async (req, res, next) => {
  // Initialize session for konsol
  if (!req.session.konsol) {
    req.session.konsol = {};
  }
  
  // Make db available
  req.db = await connectDB();
  
  next();
});

// Check authentication for protected routes
const requireAuth = (req, res, next) => {
  if (!req.session.konsol.userId) {
    return res.redirect('/konsol/login');
  }
  
  // Check if user session is expired
  if (req.session.konsol.expiresAt && new Date(req.session.konsol.expiresAt) < new Date()) {
    req.session.konsol = {};
    return res.redirect('/konsol/login?expired=true');
  }
  
  next();
};

// Login page
router.get('/login', (req, res) => {
  if (req.session.konsol.userId) {
    return res.redirect('/konsol');
  }
  
  res.render('konsol/login', {
    layout: false,
    title: 'Konsol Giriş',
    error: req.query.error,
    expired: req.query.expired
  });
});

// Login handler
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.redirect('/konsol/login?error=missing');
    }
    
    const db = req.db;
    const user = await db.collection('jmon_users').findOne({
      $or: [
        { username: username },
        { email: username }
      ],
      isActive: true
    });
    
    if (!user) {
      return res.redirect('/konsol/login?error=invalid');
    }
    
    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.redirect('/konsol/login?error=invalid');
    }
    
    // Set session
    req.session.konsol = {
      userId: user._id.toString(),
      username: user.username,
      email: user.email,
      permissions: user.permissions || [],
      expiresAt: user.expiresAt,
      loginAt: new Date()
    };
    
    // Update last login
    await db.collection('jmon_users').updateOne(
      { _id: user._id },
      { 
        $set: { 
          lastLogin: new Date(),
          lastActivity: new Date()
        }
      }
    );
    
    res.redirect('/konsol');
  } catch (error) {
    console.error('Konsol login error:', error);
    res.redirect('/konsol/login?error=system');
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.konsol = {};
  res.redirect('/konsol/login');
});

// Main dashboard
router.get('/', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const userId = new ObjectId(req.session.konsol.userId);
    
    // Get user details with settings
    const user = await db.collection('jmon_users').findOne({ _id: userId });
    
    // Get user settings
    const settings = await db.collection('jmon_settings').find({
      userId: userId,
      isActive: true
    }).toArray();
    
    // Convert settings to object
    const settingsObj = {};
    settings.forEach(s => {
      if (!settingsObj[s.category]) settingsObj[s.category] = {};
      settingsObj[s.category][s.settingKey] = s.settingValue;
    });
    
    // Get statistics
    const stats = {
      sections: await db.collection('jmon_sections').countDocuments({ userId: userId }),
      products: await db.collection('jmon_user_products').countDocuments({ userId: userId }),
      widgets: await db.collection('jmon_widgets').countDocuments({ userId: userId }),
      dashboards: await db.collection('jmon_dashboards').countDocuments({ userId: userId })
    };
    
    // Get recent API usage
    const recentApiCalls = await db.collection('api_logs').find({
      userId: userId
    }).sort({ timestamp: -1 }).limit(10).toArray();
    
    res.render('konsol/dashboard', {
      layout: 'konsol',
      title: 'Konsol Dashboard',
      user: user,
      settings: settingsObj,
      stats: stats,
      recentApiCalls: recentApiCalls,
      session: req.session.konsol
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).render('error', {
      layout: 'konsol',
      message: 'Dashboard yüklenirken hata oluştu'
    });
  }
});

// Sections management
router.get('/sections', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const userId = new ObjectId(req.session.konsol.userId);
    
    const sections = await db.collection('jmon_sections').find({
      userId: userId
    }).sort({ displayOrder: 1, name: 1 }).toArray();
    
    res.render('konsol/sections', {
      layout: 'konsol',
      title: 'Section Yönetimi',
      sections: sections,
      session: req.session.konsol
    });
  } catch (error) {
    console.error('Sections error:', error);
    res.status(500).render('error', {
      layout: 'konsol',
      message: 'Sections yüklenirken hata oluştu'
    });
  }
});

// Products management
router.get('/products', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const userId = new ObjectId(req.session.konsol.userId);
    const { sectionId } = req.query;
    
    const query = { userId: userId };
    if (sectionId && ObjectId.isValid(sectionId)) {
      query.sectionId = sectionId;
    }
    
    // Get products with section lookup, grouped and sorted
    const products = await db.collection('jmon_user_products').aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'jmon_sections',
          let: { sectionId: '$sectionId' },
          pipeline: [
            { 
              $match: { 
                $expr: { 
                  $or: [
                    { $eq: ['$_id', { $toObjectId: '$$sectionId' }] },
                    { $eq: [{ $toString: '$_id' }, '$$sectionId'] }
                  ]
                } 
              } 
            }
          ],
          as: 'sectionInfo'
        }
      },
      {
        $addFields: {
          sectionName: { 
            $ifNull: [
              { $arrayElemAt: ['$sectionInfo.name', 0] },
              'Kategorisiz'
            ]
          },
          sectionDisplayOrder: { 
            $ifNull: [
              { $arrayElemAt: ['$sectionInfo.displayOrder', 0] },
              999
            ]
          },
          displayOrder: { 
            $ifNull: ['$displayOrder', 999]
          }
        }
      },
      { 
        $sort: { 
          sectionDisplayOrder: 1,
          sectionName: 1,
          displayOrder: 1,
          name: 1 
        } 
      }
    ]).toArray();
    
    
    // Get sections for filter
    const sections = await db.collection('jmon_sections').find({
      userId: userId,
      isActive: true
    }).sort({ displayOrder: 1 }).toArray();
    
    res.render('konsol/products', {
      layout: 'konsol',
      title: 'Ürün Yönetimi',
      products: products,
      sections: sections,
      selectedSection: sectionId,
      session: req.session.konsol
    });
  } catch (error) {
    console.error('Products error:', error);
    res.status(500).render('error', {
      layout: 'konsol',
      message: 'Products yüklenirken hata oluştu'
    });
  }
});

// Live prices
router.get('/prices', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const userId = new ObjectId(req.session.konsol.userId);
    
    // Get user's selected source from settings
    const sourceSetting = await db.collection('jmon_settings').findOne({
      userId: userId,
      settingKey: 'source',
      category: 'api'
    });
    
    const selectedSourceId = sourceSetting ? sourceSetting.settingValue : null;
    
    // Get available price sources with display names
    const sources = await db.collection('current_prices').aggregate([
      { 
        $group: { 
          _id: '$sourceId', 
          count: { $sum: 1 }, 
          lastUpdate: { $max: '$lastUpdate' } 
        } 
      },
      {
        $lookup: {
          from: 'sources',
          let: { sourceId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ['$sourceId', '$$sourceId'] },
                    { $eq: ['$_id', '$$sourceId'] },
                    { $eq: [{ $toString: '$_id' }, { $toString: '$$sourceId' }] }
                  ]
                }
              }
            }
          ],
          as: 'sourceInfo'
        }
      },
      {
        $addFields: {
          displayName: {
            $ifNull: [
              { $arrayElemAt: ['$sourceInfo.displayName', 0] },
              { $arrayElemAt: ['$sourceInfo.name', 0] },
              { $toString: '$_id' }
            ]
          }
        }
      },
      { $sort: { 'displayName': 1 } }
    ]).toArray();
    
    // Get sections with products
    const sections = await db.collection('jmon_sections').find({
      userId: userId,
      isActive: true
    }).sort({ displayOrder: 1 }).toArray();
    
    res.render('konsol/prices', {
      layout: 'konsol',
      title: 'Canlı Fiyatlar',
      sections: sections,
      selectedSourceId: selectedSourceId,
      sources: sources,
      session: req.session.konsol
    });
  } catch (error) {
    console.error('Prices error:', error);
    res.status(500).render('error', {
      layout: 'konsol',
      message: 'Fiyatlar yüklenirken hata oluştu'
    });
  }
});

// Formula calculator
router.get('/calculator', requireAuth, async (req, res) => {
  try {
    res.render('konsol/calculator', {
      layout: 'konsol',
      title: 'Formül Hesaplayıcı',
      session: req.session.konsol
    });
  } catch (error) {
    console.error('Calculator error:', error);
    res.status(500).render('error', {
      layout: 'konsol',
      message: 'Hesaplayıcı yüklenirken hata oluştu'
    });
  }
});

// API usage
router.get('/api-usage', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const userId = new ObjectId(req.session.konsol.userId);
    
    // Get API tokens
    const tokens = await db.collection('api_tokens').find({
      userId: userId
    }).toArray();
    
    // Get usage stats for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const apiLogs = await db.collection('api_logs').aggregate([
      {
        $match: {
          userId: userId,
          timestamp: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            endpoint: "$endpoint"
          },
          count: { $sum: 1 },
          avgResponseTime: { $avg: "$responseTime" }
        }
      },
      {
        $sort: { "_id.day": -1 }
      }
    ]).toArray();
    
    res.render('konsol/api-usage', {
      layout: 'konsol',
      title: 'API Kullanımı',
      tokens: tokens,
      apiLogs: apiLogs,
      session: req.session.konsol
    });
  } catch (error) {
    console.error('API usage error:', error);
    res.status(500).render('error', {
      layout: 'konsol',
      message: 'API kullanımı yüklenirken hata oluştu'
    });
  }
});

// Settings
router.get('/settings', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const userId = new ObjectId(req.session.konsol.userId);
    
    // Get all user settings
    const settings = await db.collection('jmon_settings').find({
      userId: userId
    }).toArray();
    
    // Get user's selected source from settings (for proper source selection display)
    const sourceSetting = await db.collection('jmon_settings').findOne({
      userId: userId,
      settingKey: 'source',
      category: 'api'
    });
    
    const selectedSourceId = sourceSetting ? sourceSetting.settingValue : null;
    
    // Get available sources for source settings
    const sources = await db.collection('sources').find({ isActive: true }).toArray();
    
    // Convert MongoDB ObjectIds to strings for proper comparison in Handlebars
    const sourcesFormatted = sources.map(source => ({
      ...source,
      _id: source._id.toString()
    }));
    
    // Group by category
    const groupedSettings = {};
    settings.forEach(s => {
      if (!groupedSettings[s.category]) {
        groupedSettings[s.category] = [];
      }
      groupedSettings[s.category].push(s);
    });
    
    res.render('konsol/settings', {
      layout: 'konsol',
      title: 'Ayarlar',
      settings: groupedSettings,
      sources: sourcesFormatted,
      selectedSourceId: selectedSourceId,
      session: req.session.konsol
    });
  } catch (error) {
    console.error('Settings error:', error);
    res.status(500).render('error', {
      layout: 'konsol',
      message: 'Ayarlar yüklenirken hata oluştu'
    });
  }
});

// API endpoints for AJAX operations
// Get section data
router.get('/api/sections/:id', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const userId = new ObjectId(req.session.konsol.userId);
    const sectionId = new ObjectId(req.params.id);
    
    const section = await db.collection('jmon_sections').findOne({
      _id: sectionId,
      userId: userId
    });
    
    if (!section) {
      return res.status(404).json({
        success: false,
        error: 'Section not found'
      });
    }
    
    res.json({
      success: true,
      data: section
    });
  } catch (error) {
    console.error('Get section error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create or update section
router.post('/api/sections', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const userId = new ObjectId(req.session.konsol.userId);
    const { sectionId, ...data } = req.body;
    
    // Prepare display config
    const displayConfig = {
      icon: data.icon || 'layer-group',
      color: data.color || '#3B82F6',
      backgroundColor: data.backgroundColor || '#EFF6FF',
      showProductCount: true,
      showLastUpdate: true
    };
    
    const sectionData = {
      userId: userId,
      name: data.name,
      description: data.description || '',
      sectionCode: data.sectionCode || '',
      category: data.category || 'general',
      displayOrder: parseInt(data.displayOrder) || 1,
      isActive: data.isActive,
      isDefault: data.isDefault,
      displayConfig: displayConfig,
      updatedAt: new Date()
    };
    
    let result;
    if (sectionId) {
      // Update existing
      result = await db.collection('jmon_sections').updateOne(
        { _id: new ObjectId(sectionId), userId: userId },
        { $set: sectionData }
      );
    } else {
      // Create new
      sectionData.createdAt = new Date();
      result = await db.collection('jmon_sections').insertOne(sectionData);
    }
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Save section error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete section
router.delete('/api/sections/:id', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const userId = new ObjectId(req.session.konsol.userId);
    const sectionId = new ObjectId(req.params.id);
    
    // Check if section has products
    const productCount = await db.collection('jmon_user_products').countDocuments({
      userId: userId,
      sectionId: sectionId.toString()
    });
    
    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        error: 'Bu section\'da ürünler var. Önce ürünleri silin veya başka section\'a taşıyın.'
      });
    }
    
    const result = await db.collection('jmon_sections').deleteOne({
      _id: sectionId,
      userId: userId
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Delete section error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get products data for JSON API
router.get('/api/products', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const userId = new ObjectId(req.session.konsol.userId);
    const { sectionId } = req.query;
    
    const query = { userId: userId, isActive: true };
    if (sectionId && ObjectId.isValid(sectionId)) {
      query.sectionId = new ObjectId(sectionId);
    }
    
    // Get products with section lookup, grouped and sorted
    const products = await db.collection('jmon_user_products').aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'jmon_sections',
          let: { sectionId: '$sectionId' },
          pipeline: [
            { 
              $match: { 
                $expr: { 
                  $or: [
                    { $eq: ['$_id', { $toObjectId: '$$sectionId' }] },
                    { $eq: [{ $toString: '$_id' }, '$$sectionId'] }
                  ]
                } 
              } 
            }
          ],
          as: 'sectionInfo'
        }
      },
      {
        $addFields: {
          sectionName: { 
            $ifNull: [
              { $arrayElemAt: ['$sectionInfo.name', 0] },
              'Kategorisiz'
            ]
          },
          sectionDisplayOrder: { 
            $ifNull: [
              { $arrayElemAt: ['$sectionInfo.displayOrder', 0] },
              999
            ]
          },
          displayOrder: { 
            $ifNull: ['$displayOrder', 999]
          }
        }
      },
      { 
        $sort: { 
          sectionDisplayOrder: 1,
          sectionName: 1,
          displayOrder: 1,
          name: 1 
        } 
      }
    ]).toArray();
    
    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    console.error('Get products API error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get live prices data
router.get('/api/prices', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const userId = new ObjectId(req.session.konsol.userId);
    const { sourceId } = req.query;
    
    // Get products with sections, ordered properly
    const products = await db.collection('jmon_user_products').aggregate([
      { $match: { userId: userId, isActive: true } },
      {
        $lookup: {
          from: 'jmon_sections',
          let: { sectionId: '$sectionId' },
          pipeline: [
            { 
              $match: { 
                $expr: { 
                  $or: [
                    { $eq: ['$_id', { $toObjectId: '$$sectionId' }] },
                    { $eq: [{ $toString: '$_id' }, '$$sectionId'] }
                  ]
                } 
              } 
            }
          ],
          as: 'section'
        }
      },
      {
        $addFields: {
          section: { $arrayElemAt: ['$section', 0] },
          sectionDisplayOrder: { 
            $ifNull: [
              { $arrayElemAt: ['$section.displayOrder', 0] },
              999
            ]
          },
          displayOrder: { 
            $ifNull: ['$displayOrder', 999]
          }
        }
      },
      { 
        $sort: { 
          sectionDisplayOrder: 1,
          displayOrder: 1,
          name: 1 
        } 
      }
    ]).toArray();
    
    // Get current prices using the existing model (same as webApiProductRoutes.js)
    const CurrentPrices = require('../models/CurrentPrices');
    const currentPrices = new CurrentPrices(db);
    
    // Use same method as webApiProductRoutes.js line 399 but with sourceId filter if provided
    const priceFilters = sourceId ? { sourceId: sourceId } : {};
    const prices = await currentPrices.getCurrentPrices(priceFilters);
    //console.log('Current prices from model:', prices.length, 'with filters:', priceFilters);
    
    // Convert to legacy format for formula calculator (HAS_alis, HAS_satis format)
    const priceData = {};
    
    prices.forEach(price => {
      const symbol = price.symbol;
      const buyPrice = price.buyPrice;
      const sellPrice = price.sellPrice;
      
      // Legacy format: HAS_alis, HAS_satis
      if (symbol && symbol.includes('/')) {
        const currencyCode = symbol.split('/')[0];
        priceData[currencyCode + '_alis'] = buyPrice;
        priceData[currencyCode + '_satis'] = sellPrice;
        
        //console.log(`✅ Added price data for ${currencyCode}: ${buyPrice}/${sellPrice}`);
      }
    });
    
   
    // Initialize FormulaCalculator (same as webApiProductRoutes.js line 400-401)
    const FormulaCalculator = require('../services/FormulaCalculator');
    const calculator = new FormulaCalculator();
    
    // Calculate product prices and return simplified data
    const results = products.map(product => {
      try {
        // Get proper rounding configs
        const buyingConfig = product.buyingRoundingConfig || product.roundingConfig || { method: 'nearest', precision: 5, decimalPlaces: 2 };
        const sellingConfig = product.sellingRoundingConfig || product.roundingConfig || { method: 'nearest', precision: 5, decimalPlaces: 2 };
        
        //  console.log(`Product ${product.name} - Buying config:`, buyingConfig, 'Selling config:', sellingConfig);
        
        // Use same format as webApiProductRoutes.js line 403-404
        const buyingResult = calculator.calculate(product.buyingFormula, priceData);
        const sellingResult = calculator.calculate(product.sellingFormula, priceData);
        
        // Apply manual rounding with product's config
        const buyingPrice = buyingResult.value !== null ? 
          parseFloat(buyingResult.value.toFixed(buyingConfig.decimalPlaces || 2)) : null;
        const sellingPrice = sellingResult.value !== null ? 
          parseFloat(sellingResult.value.toFixed(sellingConfig.decimalPlaces || 2)) : null;
        
        return {
          _id: product._id,
          name: product.name,
          productCode: product.productCode,
          buyingPrice: buyingPrice,
          sellingPrice: sellingPrice,
          buyingDecimalPlaces: buyingConfig.decimalPlaces || 2,
          sellingDecimalPlaces: sellingConfig.decimalPlaces || 2,
          lastUpdate: new Date(),
          section: product.section ? {
            name: product.section.name,
            displayConfig: product.section.displayConfig
          } : null
        };
      } catch (error) {
        const buyingConfig = product.buyingRoundingConfig || product.roundingConfig || { method: 'nearest', precision: 5, decimalPlaces: 2 };
        const sellingConfig = product.sellingRoundingConfig || product.roundingConfig || { method: 'nearest', precision: 5, decimalPlaces: 2 };
        
        return {
          _id: product._id,
          name: product.name,
          productCode: product.productCode,
          buyingPrice: null,
          sellingPrice: null,
          buyingDecimalPlaces: buyingConfig.decimalPlaces || 2,
          sellingDecimalPlaces: sellingConfig.decimalPlaces || 2,
          lastUpdate: new Date(),
          error: error.message,
          section: product.section ? {
            name: product.section.name,
            displayConfig: product.section.displayConfig
          } : null
        };
      }
    });
    
    res.json({
      success: true,
      count: results.length,
      timestamp: new Date(),
      data: {
        products: results
      }
    });
  } catch (error) {
    console.error('API prices error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Calculate formula
router.post('/api/calculate', requireAuth, async (req, res) => {
  try {
    const { formula, variables } = req.body;
    
    const FormulaCalculator = require('../services/FormulaCalculator');
    const calculator = new FormulaCalculator();
    
    const result = calculator.calculate(formula, variables);
    
    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Update price source setting
router.post('/api/price-source', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const userId = new ObjectId(req.session.konsol.userId);
    const { sourceId } = req.body;
    
    // Update or create the price source setting
    await db.collection('jmon_settings').updateOne(
      {
        userId: userId,
        settingKey: 'source',
        category: 'api'
      },
      {
        $set: {
          userId: userId,
          settingKey: 'source',
          category: 'api',
          settingValue: sourceId,
          description: 'Selected price data source for live prices display',
          isActive: true,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    
    res.json({
      success: true,
      message: 'Fiyat kaynağı güncellendi'
    });
  } catch (error) {
    console.error('Update price source error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get product data for editing
router.get('/api/products/:id', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const userId = new ObjectId(req.session.konsol.userId);
    const productId = new ObjectId(req.params.id);
    
    const product = await db.collection('jmon_user_products').findOne({
      _id: productId,
      userId: userId
    });
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Ürün bulunamadı'
      });
    }
    
    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create or update product
router.post('/api/products', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const userId = new ObjectId(req.session.konsol.userId);
    const { productId, ...data } = req.body;
    
    // Use the model for product operations
    const JmonUserProduct = require('../models/JmonUserProduct');
    const productModel = new JmonUserProduct(db);
    
    let result;
    if (productId) {
      // Update existing
      const updateData = {
        name: data.name,
        productCode: data.productCode || '',
        buyingFormula: data.buyingFormula,
        sellingFormula: data.sellingFormula,
        baseSymbol: data.baseSymbol || 'HAS/TRY',
        sectionId: data.sectionId || null,
        displayOrder: data.displayOrder ? parseInt(data.displayOrder) : undefined,
        buyingRoundingConfig: data.buyingRoundingConfig,
        sellingRoundingConfig: data.sellingRoundingConfig,
        isActive: data.isActive !== undefined ? data.isActive : true,
        isPublic: data.isPublic || false
      };
      
      result = await productModel.update(productId, updateData);
    } else {
      // Create new
      const productData = {
        userId: userId,
        name: data.name,
        productCode: data.productCode || '',
        buyingFormula: data.buyingFormula,
        sellingFormula: data.sellingFormula,
        baseSymbol: data.baseSymbol || 'HAS/TRY',
        sectionId: data.sectionId || null,
        displayOrder: data.displayOrder ? parseInt(data.displayOrder) : undefined,
        buyingRoundingConfig: data.buyingRoundingConfig,
        sellingRoundingConfig: data.sellingRoundingConfig,
        category: data.category || 'general',
        tags: data.tags || [],
        isActive: data.isActive !== undefined ? data.isActive : true,
        isPublic: data.isPublic || false
      };
      
      result = await productModel.create(productData);
    }
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Save product error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete product
router.delete('/api/products/:id', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const userId = new ObjectId(req.session.konsol.userId);
    const productId = new ObjectId(req.params.id);
    
    const result = await db.collection('jmon_user_products').deleteOne({
      _id: productId,
      userId: userId
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Reorder products within section
router.post('/api/products/reorder', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const userId = new ObjectId(req.session.konsol.userId);
    const { sectionId, productIds } = req.body;
    
    if (!Array.isArray(productIds)) {
      return res.status(400).json({
        success: false,
        error: 'Product IDs must be an array'
      });
    }
    
    // Use the model for reordering
    const JmonUserProduct = require('../models/JmonUserProduct');
    const productModel = new JmonUserProduct(db);
    
    const modifiedCount = await productModel.reorderProductsInSection(userId, sectionId, productIds);
    
    res.json({
      success: true,
      data: {
        modifiedCount: modifiedCount,
        message: `${modifiedCount} products reordered successfully`
      }
    });
  } catch (error) {
    console.error('Reorder products error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Socket.io price room join handler for konsol users
router.post('/api/join-price-room', requireAuth, async (req, res) => {
  try {
    const { roomName } = req.body;
    
    res.json({
      success: true,
      message: `${roomName} odasına katılım için socket kullanın`,
      roomName: roomName
    });
  } catch (error) {
    console.error('Join price room error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update setting
router.put('/api/settings/:key', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const userId = new ObjectId(req.session.konsol.userId);
    const { key } = req.params;
    const { value, category, description } = req.body;
    
    // First try to update existing setting
    let result = await db.collection('jmon_settings').updateOne(
      {
        userId: userId,
        settingKey: key,
        category: category
      },
      {
        $set: {
          settingValue: value,
          description: description || '',
          isActive: true,
          updatedAt: new Date()
        }
      }
    );
    
    // If no document was modified, try to insert new one
    if (result.matchedCount === 0) {
      try {
        result = await db.collection('jmon_settings').insertOne({
          userId: userId,
          settingKey: key,
          category: category,
          settingValue: value,
          description: description || '',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      } catch (insertError) {
        // If insert fails due to duplicate, try update again (race condition)
        if (insertError.code === 11000) {
          result = await db.collection('jmon_settings').updateOne(
            {
              userId: userId,
              settingKey: key,
              category: category
            },
            {
              $set: {
                settingValue: value,
                description: description || '',
                isActive: true,
                updatedAt: new Date()
              }
            }
          );
        } else {
          throw insertError;
        }
      }
    }
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Send control message to user WebSocket channel
router.post('/api/send-user-message', requireAuth, async (req, res) => {
  try {
    const { messageType, message, userId } = req.body;
    const targetUserId = userId || req.session.konsol.userId;
    
    if (!messageType) {
      return res.status(400).json({
        success: false,
        error: 'messageType gerekli'
      });
    }
    
    // Send control message via WebSocket
    if (global.socketChannels && global.socketChannels.sendUserControlMessage) {
      global.socketChannels.sendUserControlMessage(targetUserId, messageType, {
        message: message,
        timestamp: new Date()
      });
      
      res.json({
        success: true,
        message: `${messageType} mesajı kullanıcıya gönderildi`,
        userId: targetUserId
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'WebSocket sistemi hazır değil'
      });
    }
  } catch (error) {
    console.error('Send user message error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Debug endpoint to check current prices
router.get('/api/debug/prices', requireAuth, async (req, res) => {
  try {
    const db = req.db;
    const { sourceId } = req.query;
    
    const query = sourceId ? { sourceId: sourceId } : {};
    const prices = await db.collection('current_prices').find(query).toArray();
    
    // Get unique symbols
    const symbols = [...new Set(prices.map(p => p.symbol))];
    
    // Get sources from current_prices
    const sources = [...new Set(prices.map(p => p.sourceId))];
    
    // Also get all sources from sources table
    const allSources = await db.collection('sources').find({}).toArray();
    
    res.json({
      success: true,
      query: query,
      totalPrices: prices.length,
      sources: sources,
      symbols: symbols,
      samplePrices: prices.slice(0, 5),
      allSourcesInDatabase: allSources.map(s => ({
        _id: s._id,
        sourceId: s.sourceId,
        name: s.name,
        displayName: s.displayName,
        isActive: s.isActive
      })),
      requestedSourceId: sourceId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;