// routes/webApiSectionRoutes.js
const express = require('express');
const router = express.Router();
const JmonSection = require('../models/JmonSection');
const { MongoClient } = require('mongodb');

// MongoDB bağlantısı
let db, sectionModel;

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
    sectionModel = new JmonSection(db);
  }
  return { db, sectionModel };
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Section:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Section ID
 *         name:
 *           type: string
 *           description: Section name
 *         description:
 *           type: string
 *           description: Section description
 *         sectionCode:
 *           type: string
 *           description: Unique section code
 *         displayConfig:
 *           type: object
 *           properties:
 *             icon:
 *               type: string
 *             color:
 *               type: string
 *             backgroundColor:
 *               type: string
 *             showProductCount:
 *               type: boolean
 *             showLastUpdate:
 *               type: boolean
 *         displayOrder:
 *           type: integer
 *         category:
 *           type: string
 *           enum: [general, gold, currency, crypto, custom]
 *         isActive:
 *           type: boolean
 *         isDefault:
 *           type: boolean
 *         productCount:
 *           type: integer
 *     SectionCreate:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           description: Section name
 *         description:
 *           type: string
 *           description: Section description
 *         sectionCode:
 *           type: string
 *           description: Custom section code (optional)
 *         displayConfig:
 *           type: object
 *           properties:
 *             icon:
 *               type: string
 *             color:
 *               type: string
 *             backgroundColor:
 *               type: string
 *         displayOrder:
 *           type: integer
 *         category:
 *           type: string
 *           enum: [general, gold, currency, crypto, custom]
 *         isDefault:
 *           type: boolean
 */

/**
 * @swagger
 * /web-api/sections:
 *   get:
 *     summary: Get user sections
 *     tags: [Sections]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: category
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - name: includeInactive
 *         in: query
 *         schema:
 *           type: boolean
 *         description: Include inactive sections
 *     responses:
 *       200:
 *         description: List of sections
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 sections:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Section'
 *                 total:
 *                   type: integer
 */
router.get('/', async (req, res) => {
  try {
    const { sectionModel } = await initializeDb();
    const userId = req.user.userId;

    const { category, includeInactive } = req.query;

    const options = {
      includeInactive: includeInactive === 'true',
      category: category || null
    };

    const sections = await sectionModel.findByUserId(userId, options);

    res.json({
      success: true,
      sections: sections,
      total: sections.length
    });

  } catch (error) {
    console.error('Sections get error:', error);
    res.status(500).json({
      success: false,
      error: 'Section listesi alınamadı',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /web-api/sections:
 *   post:
 *     summary: Create new section
 *     tags: [Sections]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SectionCreate'
 *     responses:
 *       201:
 *         description: Section created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 section:
 *                   $ref: '#/components/schemas/Section'
 */
router.post('/', async (req, res) => {
  try {
    const { sectionModel } = await initializeDb();
    const userId = req.user.userId;

    const sectionData = {
      ...req.body,
      userId: userId
    };

    const section = await sectionModel.create(sectionData);

    res.status(201).json({
      success: true,
      message: 'Section başarıyla oluşturuldu',
      section: section
    });

  } catch (error) {
    console.error('Section create error:', error);
    
    if (error.message.includes('zaten kullanımda')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Section oluşturulamadı',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /web-api/sections/{id}:
 *   get:
 *     summary: Get section by ID
 *     tags: [Sections]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Section ID
 *     responses:
 *       200:
 *         description: Section details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 section:
 *                   $ref: '#/components/schemas/Section'
 */
router.get('/:id', async (req, res) => {
  try {
    const { sectionModel } = await initializeDb();
    const sectionId = req.params.id;

    const section = await sectionModel.findById(sectionId);

    if (!section) {
      return res.status(404).json({
        success: false,
        error: 'Section bulunamadı'
      });
    }

    // Kullanıcı kontrolü
    if (section.userId.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Bu sectiona erişim izniniz yok'
      });
    }

    res.json({
      success: true,
      section: section
    });

  } catch (error) {
    console.error('Section get error:', error);
    res.status(500).json({
      success: false,
      error: 'Section bilgisi alınamadı',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /web-api/sections/{id}:
 *   put:
 *     summary: Update section
 *     tags: [Sections]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Section ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SectionCreate'
 *     responses:
 *       200:
 *         description: Section updated successfully
 */
router.put('/:id', async (req, res) => {
  try {
    const { sectionModel } = await initializeDb();
    const sectionId = req.params.id;

    // Section var mı ve kullanıcıya ait mi kontrol et
    const section = await sectionModel.findById(sectionId);
    if (!section) {
      return res.status(404).json({
        success: false,
        error: 'Section bulunamadı'
      });
    }

    if (section.userId.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Bu sectionı güncelleme izniniz yok'
      });
    }

    const updated = await sectionModel.update(sectionId, req.body);

    if (!updated) {
      return res.status(400).json({
        success: false,
        error: 'Section güncellenemedi'
      });
    }

    // Güncellenmiş sectionı al
    const updatedSection = await sectionModel.findById(sectionId);

    res.json({
      success: true,
      message: 'Section başarıyla güncellendi',
      section: updatedSection
    });

  } catch (error) {
    console.error('Section update error:', error);
    res.status(500).json({
      success: false,
      error: 'Section güncellenemedi',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /web-api/sections/{id}:
 *   delete:
 *     summary: Delete section
 *     tags: [Sections]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Section ID
 *     responses:
 *       200:
 *         description: Section deleted successfully
 */
router.delete('/:id', async (req, res) => {
  try {
    const { sectionModel } = await initializeDb();
    const sectionId = req.params.id;

    // Section var mı ve kullanıcıya ait mi kontrol et
    const section = await sectionModel.findById(sectionId);
    if (!section) {
      return res.status(404).json({
        success: false,
        error: 'Section bulunamadı'
      });
    }

    if (section.userId.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Bu sectionı silme izniniz yok'
      });
    }

    const deleted = await sectionModel.delete(sectionId);

    if (!deleted) {
      return res.status(400).json({
        success: false,
        error: 'Section silinemedi'
      });
    }

    res.json({
      success: true,
      message: 'Section başarıyla silindi'
    });

  } catch (error) {
    console.error('Section delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Section silinemedi',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /web-api/sections/{id}/set-default:
 *   post:
 *     summary: Set section as default
 *     tags: [Sections]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Section ID
 *     responses:
 *       200:
 *         description: Default section set successfully
 */
router.post('/:id/set-default', async (req, res) => {
  try {
    const { sectionModel } = await initializeDb();
    const sectionId = req.params.id;
    const userId = req.user.userId;

    // Section var mı ve kullanıcıya ait mi kontrol et
    const section = await sectionModel.findById(sectionId);
    if (!section) {
      return res.status(404).json({
        success: false,
        error: 'Section bulunamadı'
      });
    }

    if (section.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Bu sectiona erişim izniniz yok'
      });
    }

    const success = await sectionModel.setDefault(sectionId, userId);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: 'Varsayılan section belirlenemedi'
      });
    }

    res.json({
      success: true,
      message: 'Varsayılan section başarıyla belirlendi'
    });

  } catch (error) {
    console.error('Set default section error:', error);
    res.status(500).json({
      success: false,
      error: 'Varsayılan section belirlenemedi',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /web-api/sections/stats:
 *   get:
 *     summary: Get section statistics
 *     tags: [Sections]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Section statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 */
router.get('/stats', async (req, res) => {
  try {
    const { sectionModel } = await initializeDb();
    const userId = req.user.userId;

    const stats = await sectionModel.getStats(userId);
    const categories = await sectionModel.getCategories(userId);

    res.json({
      success: true,
      stats: {
        ...stats,
        categories: categories
      }
    });

  } catch (error) {
    console.error('Section stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Section istatistikleri alınamadı',
      details: error.message
    });
  }
});

module.exports = router;