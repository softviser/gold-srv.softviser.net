// routes/webApiPricesRoutes.js
const express = require('express');
const router = express.Router();
const JmonUserProduct = require('../models/JmonUserProduct');
const JmonSection = require('../models/JmonSection');
const FormulaCalculator = require('../services/FormulaCalculator');
const { MongoClient } = require('mongodb');

// MongoDB bağlantısı
let db, productModel, sectionModel;

async function initializeDb() {
  if (!db) {
    const mongoClient = new MongoClient(process.env.MONGODB_URI, {
      auth: {
        username: process.env.MONGODB_USERNAME,
        password: process.env.MONGODB_PASSWORD
      }
    });
    await mongoClient.connect();
    db = mongoClient.db();
    productModel = new JmonUserProduct(db);
    sectionModel = new JmonSection(db);
  }
  return { db, productModel, sectionModel };
}

// API Token middleware
async function validateApiToken(req, res, next) {
  try {
    const token = req.headers['x-api-key'] || req.query.token;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_MISSING',
          message: 'API token is required. Provide via X-API-Key header or token parameter'
        },
        timestamp: new Date().toISOString()
      });
    }

    await initializeDb();
    const apiTokensCollection = db.collection('api_tokens');
    
    const validToken = await apiTokensCollection.findOne({
      token: token,
      isActive: true,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    });

    if (!validToken) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired API token'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Token bilgilerini request'e ekle
    req.apiToken = validToken;
    next();
  } catch (error) {
    console.error('API Token validation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TOKEN_VALIDATION_ERROR',
        message: 'Token validation failed'
      },
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * @swagger
 * /web-api/prices/live:
 *   get:
 *     summary: Get live prices for all products grouped by sections
 *     description: |
 *       Get real-time calculated prices for all active products, organized by sections with applied rounding configurations.
 *       
 *       **Authentication**: API Token required via X-API-Key header or token parameter.
 *       
 *       **Features**:
 *       - Real-time formula calculations
 *       - Applied rounding configurations
 *       - Grouped by sections (price categories)
 *       - Includes metadata for each section and product
 *       - Caching with configurable TTL
 *     tags: [Prices]
 *     security: []
 *     parameters:
 *       - name: X-API-Key
 *         in: header
 *         schema:
 *           type: string
 *         description: API Token for authentication
 *         example: your-api-token-here
 *       - name: token
 *         in: query
 *         schema:
 *           type: string
 *         description: API Token as query parameter (alternative to header)
 *         example: your-api-token-here
 *       - name: sectionId
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter by specific section ID
 *       - name: category
 *         in: query
 *         schema:
 *           type: string
 *           enum: [general, gold, currency, crypto, custom]
 *         description: Filter by section category
 *       - name: includeInactive
 *         in: query
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include inactive products
 *       - name: format
 *         in: query
 *         schema:
 *           type: string
 *           enum: [grouped, flat]
 *           default: grouped
 *         description: Response format (grouped by sections or flat list)
 *       - name: cache
 *         in: query
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Cache TTL in seconds (0 to disable)
 *       - name: sourceId
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter by specific source ID to show prices from only that source
 *     responses:
 *       200:
 *         description: Live prices data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     sections:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           sectionInfo:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                                 example: Altın Ürünleri
 *                               category:
 *                                 type: string
 *                                 example: gold
 *                               displayOrder:
 *                                 type: integer
 *                                 example: 1
 *                               displayConfig:
 *                                 type: object
 *                                 properties:
 *                                   icon:
 *                                     type: string
 *                                     example: gold
 *                                   color:
 *                                     type: string
 *                                     example: "#FFD700"
 *                           products:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 productInfo:
 *                                   type: object
 *                                   properties:
 *                                     _id:
 *                                       type: string
 *                                     name:
 *                                       type: string
 *                                       example: 22 Ayar Altın
 *                                     productCode:
 *                                       type: string
 *                                       example: AU22K
 *                                 prices:
 *                                   type: object
 *                                   properties:
 *                                     buying:
 *                                       type: number
 *                                       example: 2290.50
 *                                     selling:
 *                                       type: number
 *                                       example: 2310.75
 *                                     formattedBuying:
 *                                       type: string
 *                                       example: "2.290,50 ₺"
 *                                     formattedSelling:
 *                                       type: string
 *                                       example: "2.310,75 ₺"
 *                                 roundingApplied:
 *                                   type: object
 *                                   properties:
 *                                     method:
 *                                       type: string
 *                                       example: nearest
 *                                     precision:
 *                                       type: integer
 *                                       example: 5
 *                     statistics:
 *                       type: object
 *                       properties:
 *                         totalSections:
 *                           type: integer
 *                         totalProducts:
 *                           type: integer
 *                         calculationTime:
 *                           type: number
 *                           description: Time taken for calculations in ms
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 cacheInfo:
 *                   type: object
 *                   properties:
 *                     cached:
 *                       type: boolean
 *                     ttl:
 *                       type: integer
 *             example:
 *               success: true
 *               data:
 *                 sections:
 *                   - sectionInfo:
 *                       _id: "507f1f77bcf86cd799439015"
 *                       name: "Altın Ürünleri"
 *                       category: "gold"
 *                       displayOrder: 1
 *                       displayConfig:
 *                         icon: "gold"
 *                         color: "#FFD700"
 *                     products:
 *                       - productInfo:
 *                           _id: "507f1f77bcf86cd799439014"
 *                           name: "22 Ayar Altın"
 *                           productCode: "AU22K"
 *                         prices:
 *                           buying: 2290.50
 *                           selling: 2310.75
 *                           formattedBuying: "2.290,50 ₺"
 *                           formattedSelling: "2.310,75 ₺"
 *                         roundingApplied:
 *                           method: "nearest"
 *                           precision: 5
 *                 statistics:
 *                   totalSections: 3
 *                   totalProducts: 12
 *                   calculationTime: 45.2
 *               timestamp: "2024-01-01T12:00:00.000Z"
 *       401:
 *         description: Authentication failed
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               error:
 *                 code: "INVALID_TOKEN"
 *                 message: "Invalid or expired API token"
 *               timestamp: "2024-01-01T12:00:00.000Z"
 *       500:
 *         description: Internal server error
 */
router.get('/live', validateApiToken, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { productModel, sectionModel } = await initializeDb();
    
    const {
      sectionId,
      category,
      includeInactive = 'false',
      format = 'grouped',
      cache = '30',
      sourceId
    } = req.query;

    // Section filtreleri
    const sectionFilters = {
      isActive: true
    };
    if (category) sectionFilters.category = category;
    if (sectionId) sectionFilters._id = sectionId;

    // Tüm aktif section'ları al
    const sections = await sectionModel.collection.find(sectionFilters)
      .sort({ displayOrder: 1, name: 1 })
      .toArray();

    // Product filtreleri
    const productFilters = {
      isActive: includeInactive === 'true' ? undefined : true
    };

    const calculationResults = [];
    let totalProducts = 0;

    // Formula Calculator'ı başlat
    const calculator = new FormulaCalculator();
    
    // Güncel fiyat verilerini al
    const CurrentPrices = require('../models/CurrentPrices');
    const currentPricesModel = new CurrentPrices(db);
    
    // sourceId parametresi varsa sadece o source'a ait fiyatları al
    let allPrices;
    if (sourceId) {
      allPrices = await currentPricesModel.collection.find({ sourceId: sourceId }).toArray();
    } else {
      allPrices = await currentPricesModel.getAll();
    }
    
    // Fiyat verilerini hem symbol hem de variable formatına çevir
    const priceData = {};
    allPrices.forEach(price => {
      // Symbol bazlı format (HAS/TRY -> {buying, selling})
      if (!priceData[price.symbol]) {
        priceData[price.symbol] = {};
      }
      priceData[price.symbol].buying = price.buyPrice;
      priceData[price.symbol].selling = price.sellPrice;
      priceData[price.symbol].last = price.lastPrice || price.sellPrice;
      
      // Variable formatı için de ekle (HAS/TRY_buying, HAS/TRY_selling)
      priceData[price.symbol + '_buying'] = price.buyPrice;
      priceData[price.symbol + '_selling'] = price.sellPrice;
      
      // Eski format desteği (HAS_alis, HAS_satis)
      const currencyCode = price.symbol.split('/')[0];
      priceData[currencyCode + '_alis'] = price.buyPrice;
      priceData[currencyCode + '_satis'] = price.sellPrice;
    });

    // Her section için ürünleri al ve hesapla
    for (const section of sections) {
      // Section'a ait ürünleri al
      const sectionQuery = {
        sectionId: section._id.toString(),
        isActive: includeInactive === 'true' ? { $in: [true, false] } : true
      };
      
      const sectionProducts = await productModel.collection.find(sectionQuery).toArray();

      const productsWithPrices = [];

      for (const product of sectionProducts) {
        try {
          // Ürün fiyatlarını hesapla - Alış ve satış için ayrı rounding
          const buyingRounding = product.buyingRoundingConfig || product.roundingConfig || { method: 'none' };
          const sellingRounding = product.sellingRoundingConfig || product.roundingConfig || { method: 'none' };
          
          const buyingResult = calculator.calculate(product.buyingFormula, priceData, buyingRounding);
          const sellingResult = calculator.calculate(product.sellingFormula, priceData, sellingRounding);
          
          const buyingPrice = buyingResult.roundedValue || buyingResult.value;
          const sellingPrice = sellingResult.roundedValue || sellingResult.value;

          // Formatlanmış fiyatlar
          const formattedBuying = formatPrice(buyingPrice, product.displayConfig);
          const formattedSelling = formatPrice(sellingPrice, product.displayConfig);

          productsWithPrices.push({
            productInfo: {
              _id: product._id,
              name: product.name,
              productCode: product.productCode,
              description: product.description,
              category: product.category,
              tags: product.tags,
              baseSymbol: product.baseSymbol
            },
            prices: {
              buying: buyingPrice,
              selling: sellingPrice,
              formattedBuying: formattedBuying,
              formattedSelling: formattedSelling
            },
            roundingApplied: {
              buying: product.buyingRoundingConfig || product.roundingConfig || { method: 'none', precision: 0 },
              selling: product.sellingRoundingConfig || product.roundingConfig || { method: 'none', precision: 0 }
            },
            displayConfig: product.displayConfig,
            lastCalculated: new Date().toISOString()
          });

          totalProducts++;
        } catch (error) {
          console.error(`Price calculation error for product ${product._id}:`, error);
          
          // Hata durumunda da ürünü ekle ama fiyat bilgisi olmadan
          productsWithPrices.push({
            productInfo: {
              _id: product._id,
              name: product.name,
              productCode: product.productCode,
              description: product.description,
              category: product.category,
              tags: product.tags,
              baseSymbol: product.baseSymbol
            },
            prices: {
              buying: null,
              selling: null,
              formattedBuying: 'Error',
              formattedSelling: 'Error'
            },
            error: {
              code: 'CALCULATION_FAILED',
              message: error.message
            },
            roundingApplied: {
              buying: product.buyingRoundingConfig || product.roundingConfig || { method: 'none', precision: 0 },
              selling: product.sellingRoundingConfig || product.roundingConfig || { method: 'none', precision: 0 }
            },
            displayConfig: product.displayConfig,
            lastCalculated: new Date().toISOString()
          });
        }
      }

      if (productsWithPrices.length > 0) {
        calculationResults.push({
          sectionInfo: {
            _id: section._id,
            name: section.name,
            description: section.description,
            sectionCode: section.sectionCode,
            category: section.category,
            displayOrder: section.displayOrder,
            displayConfig: section.displayConfig,
            productCount: productsWithPrices.length
          },
          products: productsWithPrices
        });
      }
    }

    // Section'a atanmamış ürünler için
    const unassignedQuery = {
      isActive: includeInactive === 'true' ? { $in: [true, false] } : true,
      $or: [
        { sectionId: { $exists: false } },
        { sectionId: null },
        { sectionId: '' }
      ]
    };
    
    const unassignedProducts = await productModel.collection.find(unassignedQuery).toArray();

    if (unassignedProducts.length > 0) {
      const productsWithPrices = [];

      for (const product of unassignedProducts) {
        try {
          const buyingRounding = product.buyingRoundingConfig || product.roundingConfig || { method: 'none' };
          const sellingRounding = product.sellingRoundingConfig || product.roundingConfig || { method: 'none' };
          
          const buyingResult = calculator.calculate(product.buyingFormula, priceData, buyingRounding);
          const sellingResult = calculator.calculate(product.sellingFormula, priceData, sellingRounding);
          
          const buyingPrice = buyingResult.roundedValue || buyingResult.value;
          const sellingPrice = sellingResult.roundedValue || sellingResult.value;

          const formattedBuying = formatPrice(buyingPrice, product.displayConfig);
          const formattedSelling = formatPrice(sellingPrice, product.displayConfig);

          productsWithPrices.push({
            productInfo: {
              _id: product._id,
              name: product.name,
              productCode: product.productCode,
              description: product.description,
              category: product.category,
              tags: product.tags,
              baseSymbol: product.baseSymbol
            },
            prices: {
              buying: buyingPrice,
              selling: sellingPrice,
              formattedBuying: formattedBuying,
              formattedSelling: formattedSelling
            },
            roundingApplied: {
              buying: product.buyingRoundingConfig || product.roundingConfig || { method: 'none', precision: 0 },
              selling: product.sellingRoundingConfig || product.roundingConfig || { method: 'none', precision: 0 }
            },
            displayConfig: product.displayConfig,
            lastCalculated: new Date().toISOString()
          });

          totalProducts++;
        } catch (error) {
          console.error(`Price calculation error for unassigned product ${product._id}:`, error);
        }
      }

      if (productsWithPrices.length > 0) {
        calculationResults.push({
          sectionInfo: {
            _id: null,
            name: 'Kategorisiz Ürünler',
            description: 'Section atanmamış ürünler',
            sectionCode: 'UNASSIGNED',
            category: 'general',
            displayOrder: 999,
            displayConfig: {
              icon: 'folder',
              color: '#808080',
              backgroundColor: '#F5F5F5'
            },
            productCount: productsWithPrices.length
          },
          products: productsWithPrices
        });
      }
    }

    const calculationTime = Date.now() - startTime;

    // Response formatını kontrol et
    let responseData;
    if (format === 'flat') {
      // Düz liste formatı
      const allProducts = [];
      calculationResults.forEach(section => {
        section.products.forEach(product => {
          allProducts.push({
            ...product,
            sectionInfo: section.sectionInfo
          });
        });
      });

      responseData = {
        products: allProducts,
        statistics: {
          totalSections: calculationResults.length,
          totalProducts: totalProducts,
          calculationTime: calculationTime
        }
      };
    } else {
      // Gruplu format (default)
      responseData = {
        sections: calculationResults,
        statistics: {
          totalSections: calculationResults.length,
          totalProducts: totalProducts,
          calculationTime: calculationTime
        }
      };
    }

    res.json({
      success: true,
      data: responseData,
      timestamp: new Date().toISOString(),
      cacheInfo: {
        cached: false,
        ttl: parseInt(cache) || 30
      },
      apiToken: {
        name: req.apiToken.name,
        permissions: req.apiToken.permissions
      }
    });

  } catch (error) {
    console.error('Live prices error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CALCULATION_ERROR',
        message: 'Fiyat hesaplama hatası',
        details: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Fiyat formatla helper function
function formatPrice(price, displayConfig = {}) {
  if (price === null || price === undefined || isNaN(price)) {
    return 'N/A';
  }

  const {
    decimalPlaces = 2,
    prefix = '',
    suffix = ' ₺'
  } = displayConfig;

  // Sayıyı formatla
  const formattedNumber = price.toLocaleString('tr-TR', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces
  });

  return `${prefix}${formattedNumber}${suffix}`;
}

/**
 * @swagger
 * /web-api/prices/summary:
 *   get:
 *     summary: Get price summary statistics
 *     description: Get summary statistics about available prices and sections
 *     tags: [Prices]
 *     security: []
 *     parameters:
 *       - name: X-API-Key
 *         in: header
 *         schema:
 *           type: string
 *         description: API Token for authentication
 *       - name: token
 *         in: query
 *         schema:
 *           type: string
 *         description: API Token as query parameter
 *     responses:
 *       200:
 *         description: Price summary statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalSections:
 *                       type: integer
 *                     totalProducts:
 *                       type: integer
 *                     sectionBreakdown:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           category:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     lastUpdate:
 *                       type: string
 *                       format: date-time
 */
router.get('/summary', validateApiToken, async (req, res) => {
  try {
    const { productModel, sectionModel } = await initializeDb();

    // Section istatistikleri
    const sections = await sectionModel.collection.find({ isActive: true }).toArray();
    const sectionStats = sections.reduce((acc, section) => {
      acc[section.category] = (acc[section.category] || 0) + 1;
      return acc;
    }, {});

    const sectionBreakdown = Object.entries(sectionStats).map(([category, count]) => ({
      category,
      count
    }));

    // Ürün sayısı
    const totalProducts = await productModel.collection.countDocuments({ isActive: true });

    res.json({
      success: true,
      data: {
        totalSections: sections.length,
        totalProducts: totalProducts,
        sectionBreakdown: sectionBreakdown,
        availableCategories: ['general', 'gold', 'currency', 'crypto', 'custom'],
        lastUpdate: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Price summary error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SUMMARY_ERROR',
        message: 'İstatistik bilgisi alınamadı',
        details: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;