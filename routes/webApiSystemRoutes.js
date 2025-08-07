// routes/webApiSystemRoutes.js
const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');

// MongoDB bağlantısı (global'dan kullan)
let db;

// Initialize database connection
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
  }
  return db;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     SystemCurrency:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Currency ID
 *         symbol:
 *           type: string
 *           description: Currency symbol (e.g., HAS/TRY)
 *         code:
 *           type: string
 *           description: Currency code (e.g., HAS)
 *         name:
 *           type: string
 *           description: Currency name
 *         type:
 *           type: string
 *           enum: [forex, gold, crypto]
 *         baseCurrency:
 *           type: string
 *         quoteCurrency:
 *           type: string
 *         isActive:
 *           type: boolean
 *         priority:
 *           type: integer
 *         hasSource:
 *           type: boolean
 *         sources:
 *           type: array
 *           items:
 *             type: string
 */

/**
 * @swagger
 * /web-api/system/currencies:
 *   get:
 *     summary: Get all system currencies
 *     tags: [System]
 *     parameters:
 *       - name: type
 *         in: query
 *         schema:
 *           type: string
 *           enum: [forex, gold, crypto]
 *         description: Filter by currency type
 *       - name: active
 *         in: query
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - name: hasSource
 *         in: query
 *         schema:
 *           type: boolean
 *         description: Filter by source availability
 *     responses:
 *       200:
 *         description: List of system currencies
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 currencies:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SystemCurrency'
 *                 total:
 *                   type: integer
 */
router.get('/currencies', async (req, res) => {
  try {
    await initializeDb();
    const systemCurrenciesCollection = db.collection('system_currencies');

    // Query parameters
    const { type, active, hasSource } = req.query;
    
    // Build filter
    const filter = {};
    if (type) filter.type = type;
    if (active !== undefined) filter.isActive = active === 'true';
    if (hasSource !== undefined) filter.hasSource = hasSource === 'true';

    // Get currencies
    const currencies = await systemCurrenciesCollection
      .find(filter)
      .sort({ priority: 1, symbol: 1 })
      .toArray();

    res.json({
      success: true,
      currencies: currencies,
      total: currencies.length
    });

  } catch (error) {
    console.error('System currencies error:', error);
    res.status(500).json({
      success: false,
      error: 'Sistem para birimleri alınamadı',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /web-api/system/currencies/{code}:
 *   get:
 *     summary: Get currency by code
 *     tags: [System]
 *     parameters:
 *       - name: code
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Currency code (e.g., HAS, USD)
 *     responses:
 *       200:
 *         description: Currency details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 currency:
 *                   $ref: '#/components/schemas/SystemCurrency'
 *       404:
 *         description: Currency not found
 */
router.get('/currencies/:code', async (req, res) => {
  try {
    await initializeDb();
    const systemCurrenciesCollection = db.collection('system_currencies');

    const currency = await systemCurrenciesCollection.findOne({
      code: req.params.code.toUpperCase()
    });

    if (!currency) {
      return res.status(404).json({
        success: false,
        error: 'Para birimi bulunamadı'
      });
    }

    res.json({
      success: true,
      currency: currency
    });

  } catch (error) {
    console.error('Currency get error:', error);
    res.status(500).json({
      success: false,
      error: 'Para birimi bilgisi alınamadı',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /web-api/system/currencies/types:
 *   get:
 *     summary: Get available currency types
 *     tags: [System]
 *     responses:
 *       200:
 *         description: List of currency types
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 types:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                       count:
 *                         type: integer
 *                       name:
 *                         type: string
 */
router.get('/currencies/types', async (req, res) => {
  try {
    await initializeDb();
    const systemCurrenciesCollection = db.collection('system_currencies');

    // Get currency type counts
    const pipeline = [
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          activeCount: { $sum: { $cond: ['$isActive', 1, 0] } },
          hasSourceCount: { $sum: { $cond: ['$hasSource', 1, 0] } }
        }
      },
      { $sort: { count: -1 } }
    ];

    const typeStats = await systemCurrenciesCollection.aggregate(pipeline).toArray();

    const typeNames = {
      'forex': 'Döviz',
      'gold': 'Altın',
      'crypto': 'Kripto Para'
    };

    const types = typeStats.map(stat => ({
      type: stat._id,
      name: typeNames[stat._id] || stat._id,
      count: stat.count,
      activeCount: stat.activeCount,
      hasSourceCount: stat.hasSourceCount
    }));

    res.json({
      success: true,
      types: types
    });

  } catch (error) {
    console.error('Currency types error:', error);
    res.status(500).json({
      success: false,
      error: 'Para birimi tipleri alınamadı',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /web-api/system/rounding-options:
 *   get:
 *     summary: Get available rounding options
 *     tags: [System]
 *     responses:
 *       200:
 *         description: List of rounding options
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 methods:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       value:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                 precisions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       value:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 */
router.get('/rounding-options', async (req, res) => {
  try {
    const methods = [
      {
        value: 'none',
        name: 'Yuvarlama Yok',
        description: 'Hesaplanan değer olduğu gibi kullanılır'
      },
      {
        value: 'nearest',
        name: 'En Yakın',
        description: 'En yakın belirlenen değere yuvarlar'
      },
      {
        value: 'up',
        name: 'Yukarı',
        description: 'Her zaman yukarı yuvarlar'
      },
      {
        value: 'down',
        name: 'Aşağı',
        description: 'Her zaman aşağı yuvarlar'
      }
    ];

    const precisions = [
      {
        value: 0,
        name: 'Yuvarlama Yok',
        description: 'Yuvarlama uygulanmaz'
      },
      {
        value: 1,
        name: '1\'e Yuvarla',
        description: 'En yakın tam sayıya yuvarlar'
      },
      {
        value: 5,
        name: '5\'e Yuvarla',
        description: '5, 10, 15, 20... gibi değerlere yuvarlar'
      },
      {
        value: 10,
        name: '10\'a Yuvarla',
        description: '10, 20, 30... gibi değerlere yuvarlar'
      },
      {
        value: 25,
        name: '25\'e Yuvarla',
        description: '25, 50, 75, 100... gibi değerlere yuvarlar'
      },
      {
        value: 50,
        name: '50\'ye Yuvarla',
        description: '50, 100, 150... gibi değerlere yuvarlar'
      },
      {
        value: 100,
        name: '100\'e Yuvarla',
        description: '100, 200, 300... gibi değerlere yuvarlar'
      }
    ];

    res.json({
      success: true,
      methods: methods,
      precisions: precisions
    });

  } catch (error) {
    console.error('Rounding options error:', error);
    res.status(500).json({
      success: false,
      error: 'Yuvarlama seçenekleri alınamadı',
      details: error.message
    });
  }
});

module.exports = router;