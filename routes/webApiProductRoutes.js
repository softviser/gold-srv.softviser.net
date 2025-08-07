const express = require('express');
const LoggerHelper = require('../utils/logger');
const { authenticateJWT } = require('./webApiAuthRoutes');

function createWebApiProductRoutes(db) {
  const router = express.Router();

  // Models
  const JmonUserProduct = require('../models/JmonUserProduct');
  const jmonUserProduct = new JmonUserProduct(db);

  // Apply JWT authentication to all routes
  router.use(authenticateJWT);

  // Helper function to check product ownership
  async function checkProductAccess(productId, userId) {
    const product = await jmonUserProduct.findById(productId);
    return product && product.userId.toString() === userId;
  }

  // =================== USER PRODUCT ROUTES ===================

  // Get user's products
  router.get('/', async (req, res) => {
    try {
      const userId = req.user.userId;
      const options = {
        includeInactive: req.query.includeInactive === 'true',
        category: req.query.category || null,
        tags: req.query.tags ? req.query.tags.split(',') : null,
        sortBy: req.query.sortBy || 'updatedAt',
        sortOrder: parseInt(req.query.sortOrder) || -1,
        limit: req.query.limit ? parseInt(req.query.limit) : null,
        skip: req.query.skip ? parseInt(req.query.skip) : 0
      };

      const products = await jmonUserProduct.findByUserId(userId, options);

      res.json({
        success: true,
        data: products
      });

    } catch (error) {
      LoggerHelper.logError('webapi-product', error, 'Get user products error');
      
      res.status(500).json({
        success: false,
        error: 'Ürün listesi alınamadı'
      });
    }
  });

  // Get specific product
  router.get('/:id', async (req, res) => {
    try {
      const productId = req.params.id;
      const userId = req.user.userId;

      const product = await jmonUserProduct.findById(productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Ürün bulunamadı'
        });
      }

      // Check product ownership
      if (product.userId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Bu ürüne erişim yetkiniz yok'
        });
      }

      res.json({
        success: true,
        data: product
      });

    } catch (error) {
      LoggerHelper.logError('webapi-product', error, 'Get product error');
      
      res.status(500).json({
        success: false,
        error: 'Ürün bilgisi alınamadı'
      });
    }
  });

  // Get product by code
  router.get('/code/:productCode', async (req, res) => {
    try {
      const productCode = req.params.productCode;
      const userId = req.user.userId;

      const product = await jmonUserProduct.findByProductCode(productCode, userId);

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
      LoggerHelper.logError('webapi-product', error, 'Get product by code error');
      
      res.status(500).json({
        success: false,
        error: 'Ürün bilgisi alınamadı'
      });
    }
  });

  // Create new product
  router.post('/', async (req, res) => {
    try {
      const userId = req.user.userId;
      const {
        name,
        description,
        productCode,
        buyingFormula,
        sellingFormula,
        baseSymbol,
        displayConfig,
        calculationConfig,
        roundingConfig,
        buyingRoundingConfig,
        sellingRoundingConfig,
        sectionId,
        category,
        tags,
        isPublic
      } = req.body;

      // Validation
      if (!name || !buyingFormula || !sellingFormula || !baseSymbol) {
        return res.status(400).json({
          success: false,
          error: 'Ürün adı, alış formülü, satış formülü ve ana sembol gereklidir'
        });
      }

   /*    // Validate formulas (basic check)
      if (!buyingFormula.includes(baseSymbol)) {
        return res.status(400).json({
          success: false,
          error: 'Alış formülü ana sembolu içermelidir'
        });
      }

      if (!sellingFormula.includes(baseSymbol)) {
        return res.status(400).json({
          success: false,
          error: 'Satış formülü ana sembolu içermelidir'
        });
      } */

      const productData = {
        userId,
        name,
        description,
        productCode,
        buyingFormula,
        sellingFormula,
        baseSymbol,
        displayConfig,
        calculationConfig,
        roundingConfig,
        buyingRoundingConfig,
        sellingRoundingConfig,
        category,
        tags,
        sectionId,
        isPublic
      };

      const product = await jmonUserProduct.create(productData);

      res.json({
        success: true,
        data: product
      });

      LoggerHelper.logInfo('webapi-product', `User product created: ${name} (${product.productCode}) by user ${req.user.username}`);

    } catch (error) {
      LoggerHelper.logError('webapi-product', error, 'Create product error');
      
      res.status(500).json({
        success: false,
        error: error.message || 'Ürün oluşturulamadı'
      });
    }
  });

  // Update product
  router.put('/:id', async (req, res) => {
    try {
      const productId = req.params.id;
      const userId = req.user.userId;

      // Check product ownership
      if (!(await checkProductAccess(productId, userId))) {
        return res.status(403).json({
          success: false,
          error: 'Bu ürünü güncellemek için yetkiniz yok'
        });
      }

      const {
        name,
        description,
        productCode,
        buyingFormula,
        sellingFormula,
        baseSymbol,
        displayConfig,
        calculationConfig,
        roundingConfig,
        buyingRoundingConfig,
        sellingRoundingConfig,
        category,
        tags,
        isActive,
        isPublic
      } = req.body;

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (productCode !== undefined) updates.productCode = productCode;
      if (buyingFormula !== undefined) updates.buyingFormula = buyingFormula;
      if (sellingFormula !== undefined) updates.sellingFormula = sellingFormula;
      if (baseSymbol !== undefined) updates.baseSymbol = baseSymbol;
      if (displayConfig !== undefined) updates.displayConfig = displayConfig;
      if (calculationConfig !== undefined) updates.calculationConfig = calculationConfig;
      if (roundingConfig !== undefined) updates.roundingConfig = roundingConfig;
      if (buyingRoundingConfig !== undefined) updates.buyingRoundingConfig = buyingRoundingConfig;
      if (sellingRoundingConfig !== undefined) updates.sellingRoundingConfig = sellingRoundingConfig;
      if (category !== undefined) updates.category = category;
      if (tags !== undefined) updates.tags = tags;
      if (isActive !== undefined) updates.isActive = isActive;
      if (isPublic !== undefined) updates.isPublic = isPublic;

      // Validate formulas if updated
      if (buyingFormula && baseSymbol && !buyingFormula.includes(baseSymbol)) {
        return res.status(400).json({
          success: false,
          error: 'Alış formülü ana sembolu içermelidir'
        });
      }

      if (sellingFormula && baseSymbol && !sellingFormula.includes(baseSymbol)) {
        return res.status(400).json({
          success: false,
          error: 'Satış formülü ana sembolu içermelidir'
        });
      }

      const success = await jmonUserProduct.update(productId, updates);

      if (success) {
        const updatedProduct = await jmonUserProduct.findById(productId);
        
        res.json({
          success: true,
          data: updatedProduct
        });

        LoggerHelper.logInfo('webapi-product', `User product updated: ${productId} by user ${req.user.username}`);
      } else {
        res.status(400).json({
          success: false,
          error: 'Ürün güncellenemedi'
        });
      }

    } catch (error) {
      LoggerHelper.logError('webapi-product', error, 'Update product error');
      
      res.status(500).json({
        success: false,
        error: error.message || 'Ürün güncellenirken hata oluştu'
      });
    }
  });

  // Clone product
  router.post('//:id/clone', async (req, res) => {
    try {
      const productId = req.params.id;
      const userId = req.user.userId;

      // Check product ownership
      if (!(await checkProductAccess(productId, userId))) {
        return res.status(403).json({
          success: false,
          error: 'Bu ürünü klonlamak için yetkiniz yok'
        });
      }

      const clonedProduct = await jmonUserProduct.clone(productId);

      res.json({
        success: true,
        data: clonedProduct
      });

      LoggerHelper.logInfo('webapi-product', `User product cloned: ${productId} -> ${clonedProduct._id} by user ${req.user.username}`);

    } catch (error) {
      LoggerHelper.logError('webapi-product', error, 'Clone product error');
      
      res.status(500).json({
        success: false,
        error: 'Ürün klonlanırken hata oluştu'
      });
    }
  });

  // Delete product
  router.delete('/:id', async (req, res) => {
    try {
      const productId = req.params.id;
      const userId = req.user.userId;

      // Check product ownership
      if (!(await checkProductAccess(productId, userId))) {
        return res.status(403).json({
          success: false,
          error: 'Bu ürünü silmek için yetkiniz yok'
        });
      }

      const success = await jmonUserProduct.delete(productId);

      if (success) {
        res.json({
          success: true,
          message: 'Ürün başarıyla silindi'
        });

        LoggerHelper.logInfo('webapi-product', `User product deleted: ${productId} by user ${req.user.username}`);
      } else {
        res.status(400).json({
          success: false,
          error: 'Ürün silinemedi'
        });
      }

    } catch (error) {
      LoggerHelper.logError('webapi-product', error, 'Delete product error');
      
      res.status(500).json({
        success: false,
        error: 'Ürün silinirken hata oluştu'
      });
    }
  });

  // =================== PRODUCT CALCULATION ROUTES ===================

  // Calculate product value
  router.post('//:id/calculate', async (req, res) => {
    try {
      const productId = req.params.id;
      const userId = req.user.userId;

      // Check product ownership or if it's public
      const product = await jmonUserProduct.findById(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Ürün bulunamadı'
        });
      }

      if (product.userId.toString() !== userId && !product.isPublic) {
        return res.status(403).json({
          success: false,
          error: 'Bu ürüne erişim yetkiniz yok'
        });
      }

      // Get current prices and calculate
      const CurrentPrices = require('../models/CurrentPrices');
      const currentPrices = new CurrentPrices(db);
      
      try {
        const prices = await currentPrices.getCurrentPrices();
        const FormulaCalculator = require('../services/FormulaCalculator');
        const calculator = new FormulaCalculator();
        
        const buyingResult = calculator.calculate(product.buyingFormula, prices);
        const sellingResult = calculator.calculate(product.sellingFormula, prices);
        
        // Update product calculation info
        await jmonUserProduct.updateCalculation(productId, {
          buying: buyingResult.value,
          selling: sellingResult.value
        }, false);

        res.json({
          success: true,
          data: {
            productId: productId,
            productName: product.name,
            buyingFormula: product.buyingFormula,
            sellingFormula: product.sellingFormula,
            calculatedValues: {
              buying: buyingResult.value,
              selling: sellingResult.value
            },
            formattedValues: {
              buying: calculator.formatValue(buyingResult.value, product.displayConfig),
              selling: calculator.formatValue(sellingResult.value, product.displayConfig)
            },
            calculatedAt: new Date(),
            usedPrices: {
              buying: buyingResult.usedPrices,
              selling: sellingResult.usedPrices
            }
          }
        });

      } catch (calcError) {
        // Update error count
        await jmonUserProduct.updateCalculation(productId, { buying: null, selling: null }, true);
        
        res.status(400).json({
          success: false,
          error: 'Hesaplama hatası: ' + calcError.message
        });
      }

    } catch (error) {
      LoggerHelper.logError('webapi-product', error, 'Calculate product error');
      
      res.status(500).json({
        success: false,
        error: 'Ürün hesaplanırken hata oluştu'
      });
    }
  });

  // Calculate multiple products
  router.post('//calculate-batch', async (req, res) => {
    try {
      const userId = req.user.userId;
      const { productIds } = req.body;

      if (!productIds || !Array.isArray(productIds)) {
        return res.status(400).json({
          success: false,
          error: 'Ürün ID listesi gereklidir'
        });
      }

      // Get current prices once
      const CurrentPrices = require('../models/CurrentPrices');
      const currentPrices = new CurrentPrices(db);
      const prices = await currentPrices.getCurrentPrices();
      
      const FormulaCalculator = require('../services/FormulaCalculator');
      const calculator = new FormulaCalculator();

      const results = [];

      for (const productId of productIds) {
        try {
          const product = await jmonUserProduct.findById(productId);
          
          if (!product) {
            results.push({
              productId,
              success: false,
              error: 'Ürün bulunamadı'
            });
            continue;
          }

          // Check access
          if (product.userId.toString() !== userId && !product.isPublic) {
            results.push({
              productId,
              success: false,
              error: 'Erişim yetkiniz yok'
            });
            continue;
          }

          const buyingResult = calculator.calculate(product.buyingFormula, prices);
          const sellingResult = calculator.calculate(product.sellingFormula, prices);
          
          // Update product calculation info
          await jmonUserProduct.updateCalculation(productId, {
            buying: buyingResult.value,
            selling: sellingResult.value
          }, false);

          results.push({
            productId,
            success: true,
            data: {
              productName: product.name,
              buyingFormula: product.buyingFormula,
              sellingFormula: product.sellingFormula,
              calculatedValues: {
                buying: buyingResult.value,
                selling: sellingResult.value
              },
              formattedValues: {
                buying: calculator.formatValue(buyingResult.value, product.displayConfig),
                selling: calculator.formatValue(sellingResult.value, product.displayConfig)
              },
              calculatedAt: new Date()
            }
          });

        } catch (calcError) {
          await jmonUserProduct.updateCalculation(productId, { buying: null, selling: null }, true);
          
          results.push({
            productId,
            success: false,
            error: calcError.message
          });
        }
      }

      res.json({
        success: true,
        data: results
      });

    } catch (error) {
      LoggerHelper.logError('webapi-product', error, 'Calculate batch products error');
      
      res.status(500).json({
        success: false,
        error: 'Toplu hesaplama sırasında hata oluştu'
      });
    }
  });

  // =================== PRODUCT CATEGORIES & TAGS ===================

  // Get user's product categories
  router.get('/categories', async (req, res) => {
    try {
      const userId = req.user.userId;
      const categories = await jmonUserProduct.getCategories(userId);

      res.json({
        success: true,
        data: categories
      });

    } catch (error) {
      LoggerHelper.logError('webapi-product', error, 'Get product categories error');
      
      res.status(500).json({
        success: false,
        error: 'Kategoriler alınamadı'
      });
    }
  });

  // Get user's product tags
  router.get('/tags', async (req, res) => {
    try {
      const userId = req.user.userId;
      const tags = await jmonUserProduct.getTags(userId);

      res.json({
        success: true,
        data: tags
      });

    } catch (error) {
      LoggerHelper.logError('webapi-product', error, 'Get product tags error');
      
      res.status(500).json({
        success: false,
        error: 'Etiketler alınamadı'
      });
    }
  });

  // =================== PUBLIC PRODUCTS ===================

  // Get public products
  router.get('/public', async (req, res) => {
    try {
      const options = {
        category: req.query.category || null,
        tags: req.query.tags ? req.query.tags.split(',') : null,
        sortBy: req.query.sortBy || 'usageCount',
        sortOrder: parseInt(req.query.sortOrder) || -1,
        limit: req.query.limit ? parseInt(req.query.limit) : 50,
        skip: req.query.skip ? parseInt(req.query.skip) : 0
      };

      const products = await jmonUserProduct.findPublicProducts(options);

      res.json({
        success: true,
        data: products
      });

    } catch (error) {
      LoggerHelper.logError('webapi-product', error, 'Get public products error');
      
      res.status(500).json({
        success: false,
        error: 'Genel ürünler alınamadı'
      });
    }
  });

  // =================== PRODUCT STATS ===================

  // Get product statistics
  router.get('/stats', async (req, res) => {
    try {
      const userId = req.user.userId;

      const [userStats, mostUsed] = await Promise.all([
        jmonUserProduct.getStats(userId),
        jmonUserProduct.getMostUsed(5, userId)
      ]);

      res.json({
        success: true,
        data: {
          stats: userStats,
          mostUsed: mostUsed
        }
      });

    } catch (error) {
      LoggerHelper.logError('webapi-product', error, 'Get product stats error');
      
      res.status(500).json({
        success: false,
        error: 'Ürün istatistikleri alınamadı'
      });
    }
  });

  // =================== FORMULA VALIDATION ===================

  // Validate formulas
  router.post('//validate-formulas', async (req, res) => {
    try {
      const { buyingFormula, sellingFormula, baseSymbol } = req.body;

      if (!buyingFormula || !sellingFormula || !baseSymbol) {
        return res.status(400).json({
          success: false,
          error: 'Alış formülü, satış formülü ve ana sembol gereklidir'
        });
      }

      try {
        const FormulaCalculator = require('../services/FormulaCalculator');
        const calculator = new FormulaCalculator();
        
        const buyingValidation = calculator.validateFormula(buyingFormula, baseSymbol);
        const sellingValidation = calculator.validateFormula(sellingFormula, baseSymbol);

        res.json({
          success: true,
          data: {
            buying: buyingValidation,
            selling: sellingValidation,
            overall: {
              isValid: buyingValidation.isValid && sellingValidation.isValid,
              errors: [...(buyingValidation.errors || []), ...(sellingValidation.errors || [])]
            }
          }
        });

      } catch (validationError) {
        res.json({
          success: false,
          error: validationError.message,
          data: {
            isValid: false,
            errors: [validationError.message]
          }
        });
      }

    } catch (error) {
      LoggerHelper.logError('webapi-product', error, 'Validate formulas error');
      
      res.status(500).json({
        success: false,
        error: 'Formül doğrulaması sırasında hata oluştu'
      });
    }
  });

  return router;
}

module.exports = createWebApiProductRoutes;