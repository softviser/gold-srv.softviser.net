const express = require('express');
const path = require('path');
const fs = require('fs');
const LoggerHelper = require('../utils/logger');
const { authenticateJWT } = require('./webApiAuthRoutes');
const { 
  uploadSingle, 
  uploadMultiple, 
  deleteFile, 
  getFileType,
  ALLOWED_FILE_TYPES 
} = require('../middleware/uploadMiddleware');

function createWebApiMediaRoutes(db) {
  const router = express.Router();

  // Models
  const JmonUserMedia = require('../models/JmonUserMedia');
  const jmonUserMedia = new JmonUserMedia(db);

  // Apply JWT authentication to all routes
  router.use(authenticateJWT);

  // Helper function to check media ownership
  async function checkMediaAccess(mediaId, userId) {
    const media = await jmonUserMedia.findById(mediaId);
    return media && media.userId.toString() === userId;
  }

  // =================== MEDIA UPLOAD ROUTES ===================

  // Upload single file
  router.post('/upload', uploadSingle('file'), async (req, res) => {
    try {
      const userId = req.user.userId;
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Dosya yüklenmedi'
        });
      }

      const file = req.file;
      const {
        title,
        description,
        altText,
        tags,
        isPublic,
        allowedUses
      } = req.body;

      // Parse tags if string
      let parsedTags = [];
      if (tags) {
        try {
          parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
        } catch (e) {
          parsedTags = typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : [];
        }
      }

      // Parse allowedUses if string
      let parsedAllowedUses = ['widget', 'dashboard', 'profile'];
      if (allowedUses) {
        try {
          parsedAllowedUses = typeof allowedUses === 'string' ? JSON.parse(allowedUses) : allowedUses;
        } catch (e) {
          parsedAllowedUses = typeof allowedUses === 'string' ? allowedUses.split(',').map(t => t.trim()) : parsedAllowedUses;
        }
      }

      const mediaData = {
        userId,
        fileName: file.filename,
        originalFileName: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
        imageMetadata: req.imageMetadata || null,
        title: title || file.originalname,
        description: description || '',
        altText: altText || '',
        tags: parsedTags,
        isPublic: isPublic === 'true' || isPublic === true,
        allowedUses: parsedAllowedUses
      };

      const media = await jmonUserMedia.create(mediaData);

      res.json({
        success: true,
        data: {
          id: media._id,
          fileName: media.fileName,
          originalFileName: media.originalFileName,
          fileUrl: media.fileUrl,
          fileSize: media.fileSize,
          fileType: media.fileType,
          mimeType: media.mimeType,
          title: media.title,
          description: media.description,
          altText: media.altText,
          tags: media.tags,
          isPublic: media.isPublic,
          imageMetadata: media.imageMetadata,
          createdAt: media.createdAt
        }
      });

      LoggerHelper.logInfo('webapi-media', `File uploaded: ${file.originalname} by user ${req.user.username}`);

    } catch (error) {
      // Hata durumunda yüklenen dosyayı sil
      if (req.file && req.file.path) {
        deleteFile(req.file.path);
      }

      LoggerHelper.logError('webapi-media', error, 'Upload file error');
      
      res.status(500).json({
        success: false,
        error: error.message || 'Dosya yüklenemedi'
      });
    }
  });

  // Upload multiple files
  router.post('/upload-multiple', uploadMultiple('files', 10), async (req, res) => {
    try {
      const userId = req.user.userId;
      
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Dosya yüklenmedi'
        });
      }

      const {
        title,
        description,
        tags,
        isPublic,
        allowedUses
      } = req.body;

      // Parse tags if string
      let parsedTags = [];
      if (tags) {
        try {
          parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
        } catch (e) {
          parsedTags = typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : [];
        }
      }

      const uploadedFiles = [];
      const errors = [];

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        
        try {
          const mediaData = {
            userId,
            fileName: file.filename,
            originalFileName: file.originalname,
            filePath: file.path,
            fileSize: file.size,
            mimeType: file.mimetype,
            imageMetadata: req.imageMetadata || null,
            title: title || file.originalname,
            description: description || '',
            tags: parsedTags,
            isPublic: isPublic === 'true' || isPublic === true,
            allowedUses: typeof allowedUses === 'string' ? JSON.parse(allowedUses) : (allowedUses || ['widget', 'dashboard', 'profile'])
          };

          const media = await jmonUserMedia.create(mediaData);
          uploadedFiles.push({
            id: media._id,
            fileName: media.fileName,
            originalFileName: media.originalFileName,
            fileUrl: media.fileUrl,
            fileSize: media.fileSize,
            fileType: media.fileType
          });

        } catch (fileError) {
          deleteFile(file.path);
          errors.push({
            fileName: file.originalname,
            error: fileError.message
          });
        }
      }

      res.json({
        success: true,
        data: {
          uploaded: uploadedFiles,
          errors: errors,
          summary: {
            total: req.files.length,
            successful: uploadedFiles.length,
            failed: errors.length
          }
        }
      });

      LoggerHelper.logInfo('webapi-media', `Multiple files uploaded: ${uploadedFiles.length}/${req.files.length} successful by user ${req.user.username}`);

    } catch (error) {
      // Hata durumunda tüm yüklenen dosyaları sil
      if (req.files) {
        req.files.forEach(file => {
          if (file.path) {
            deleteFile(file.path);
          }
        });
      }

      LoggerHelper.logError('webapi-media', error, 'Upload multiple files error');
      
      res.status(500).json({
        success: false,
        error: 'Dosyalar yüklenemedi'
      });
    }
  });

  // =================== MEDIA MANAGEMENT ROUTES ===================

  // Get user's media files
  router.get('/', async (req, res) => {
    try {
      const userId = req.user.userId;
      const options = {
        includeInactive: req.query.includeInactive === 'true',
        fileType: req.query.fileType || null,
        tags: req.query.tags ? req.query.tags.split(',') : null,
        sortBy: req.query.sortBy || 'updatedAt',
        sortOrder: parseInt(req.query.sortOrder) || -1,
        limit: req.query.limit ? parseInt(req.query.limit) : null,
        skip: req.query.skip ? parseInt(req.query.skip) : 0,
        search: req.query.search || null
      };

      const files = await jmonUserMedia.findByUserId(userId, options);

      res.json({
        success: true,
        data: files
      });

    } catch (error) {
      LoggerHelper.logError('webapi-media', error, 'Get media files error');
      
      res.status(500).json({
        success: false,
        error: 'Medya dosyaları alınamadı'
      });
    }
  });

  // Get specific media file
  router.get('//:id', async (req, res) => {
    try {
      const mediaId = req.params.id;
      const userId = req.user.userId;

      const media = await jmonUserMedia.findById(mediaId);

      if (!media) {
        return res.status(404).json({
          success: false,
          error: 'Medya dosyası bulunamadı'
        });
      }

      // Check media ownership or if it's public
      if (media.userId.toString() !== userId && !media.isPublic) {
        return res.status(403).json({
          success: false,
          error: 'Bu medya dosyasına erişim yetkiniz yok'
        });
      }

      // Record usage
      await jmonUserMedia.recordUsage(mediaId, 'view');

      res.json({
        success: true,
        data: media
      });

    } catch (error) {
      LoggerHelper.logError('webapi-media', error, 'Get media file error');
      
      res.status(500).json({
        success: false,
        error: 'Medya dosyası bilgisi alınamadı'
      });
    }
  });

  // Update media file info
  router.put('/:id', async (req, res) => {
    try {
      const mediaId = req.params.id;
      const userId = req.user.userId;

      // Check media ownership
      if (!(await checkMediaAccess(mediaId, userId))) {
        return res.status(403).json({
          success: false,
          error: 'Bu medya dosyasını güncellemek için yetkiniz yok'
        });
      }

      const {
        title,
        description,
        altText,
        tags,
        isActive,
        isPublic,
        allowedUses
      } = req.body;

      const updates = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (altText !== undefined) updates.altText = altText;
      if (tags !== undefined) updates.tags = tags;
      if (isActive !== undefined) updates.isActive = isActive;
      if (isPublic !== undefined) updates.isPublic = isPublic;
      if (allowedUses !== undefined) updates.allowedUses = allowedUses;

      const success = await jmonUserMedia.update(mediaId, updates);

      if (success) {
        const updatedMedia = await jmonUserMedia.findById(mediaId);
        
        res.json({
          success: true,
          data: updatedMedia
        });

        LoggerHelper.logInfo('webapi-media', `Media file updated: ${mediaId} by user ${req.user.username}`);
      } else {
        res.status(400).json({
          success: false,
          error: 'Medya dosyası güncellenemedi'
        });
      }

    } catch (error) {
      LoggerHelper.logError('webapi-media', error, 'Update media file error');
      
      res.status(500).json({
        success: false,
        error: 'Medya dosyası güncellenirken hata oluştu'
      });
    }
  });

  // Delete media file
  router.delete('/:id', async (req, res) => {
    try {
      const mediaId = req.params.id;
      const userId = req.user.userId;

      // Check media ownership
      if (!(await checkMediaAccess(mediaId, userId))) {
        return res.status(403).json({
          success: false,
          error: 'Bu medya dosyasını silmek için yetkiniz yok'
        });
      }

      const success = await jmonUserMedia.delete(mediaId);

      if (success) {
        res.json({
          success: true,
          message: 'Medya dosyası başarıyla silindi'
        });

        LoggerHelper.logInfo('webapi-media', `Media file deleted: ${mediaId} by user ${req.user.username}`);
      } else {
        res.status(400).json({
          success: false,
          error: 'Medya dosyası silinemedi'
        });
      }

    } catch (error) {
      LoggerHelper.logError('webapi-media', error, 'Delete media file error');
      
      res.status(500).json({
        success: false,
        error: 'Medya dosyası silinirken hata oluştu'
      });
    }
  });

  // =================== FILE SERVING ROUTES ===================

  // Serve uploaded files
  router.get('/serve/:userId/:fileName', async (req, res) => {
    try {
      const { userId: targetUserId, fileName } = req.params;
      const currentUserId = req.user.userId;

      // Find media record
      const media = await jmonUserMedia.findByFileName(fileName, targetUserId);

      if (!media) {
        return res.status(404).json({
          success: false,
          error: 'Dosya bulunamadı'
        });
      }

      // Check access permissions
      if (media.userId.toString() !== currentUserId && !media.isPublic) {
        return res.status(403).json({
          success: false,
          error: 'Bu dosyaya erişim yetkiniz yok'
        });
      }

      const filePath = media.filePath;

      // Check if file exists on disk
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: 'Dosya bulunamadı'
        });
      }

      // Record usage
      await jmonUserMedia.recordUsage(media._id, 'view');

      // Set appropriate headers
      res.setHeader('Content-Type', media.mimeType);
      res.setHeader('Content-Length', media.fileSize);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
      
      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

    } catch (error) {
      LoggerHelper.logError('webapi-media', error, 'Serve file error');
      
      res.status(500).json({
        success: false,
        error: 'Dosya servis edilemedi'
      });
    }
  });

  // Download file (with download headers)
  router.get('/download/:id', async (req, res) => {
    try {
      const mediaId = req.params.id;
      const userId = req.user.userId;

      const media = await jmonUserMedia.findById(mediaId);

      if (!media) {
        return res.status(404).json({
          success: false,
          error: 'Dosya bulunamadı'
        });
      }

      // Check access permissions
      if (media.userId.toString() !== userId && !media.isPublic) {
        return res.status(403).json({
          success: false,
          error: 'Bu dosyayı indirmek için yetkiniz yok'
        });
      }

      const filePath = media.filePath;

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: 'Dosya bulunamadı'
        });
      }

      // Record download
      await jmonUserMedia.recordUsage(mediaId, 'download');

      // Set download headers
      res.setHeader('Content-Disposition', `attachment; filename="${media.originalFileName}"`);
      res.setHeader('Content-Type', media.mimeType);
      res.setHeader('Content-Length', media.fileSize);

      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      LoggerHelper.logInfo('webapi-media', `File downloaded: ${media.originalFileName} by user ${req.user.username}`);

    } catch (error) {
      LoggerHelper.logError('webapi-media', error, 'Download file error');
      
      res.status(500).json({
        success: false,
        error: 'Dosya indirilemedi'
      });
    }
  });

  // =================== MEDIA UTILITY ROUTES ===================

  // Get file types
  router.get('/file-types', async (req, res) => {
    try {
      const userId = req.user.userId;
      const fileTypes = await jmonUserMedia.getFileTypes(userId);

      res.json({
        success: true,
        data: {
          userTypes: fileTypes,
          allowedTypes: ALLOWED_FILE_TYPES
        }
      });

    } catch (error) {
      LoggerHelper.logError('webapi-media', error, 'Get file types error');
      
      res.status(500).json({
        success: false,
        error: 'Dosya tipleri alınamadı'
      });
    }
  });

  // Get media tags
  router.get('/tags', async (req, res) => {
    try {
      const userId = req.user.userId;
      const tags = await jmonUserMedia.getTags(userId);

      res.json({
        success: true,
        data: tags
      });

    } catch (error) {
      LoggerHelper.logError('webapi-media', error, 'Get media tags error');
      
      res.status(500).json({
        success: false,
        error: 'Medya etiketleri alınamadı'
      });
    }
  });

  // Get media statistics
  router.get('/stats', async (req, res) => {
    try {
      const userId = req.user.userId;

      const [stats, mostUsed, largeFiles] = await Promise.all([
        jmonUserMedia.getStats(userId),
        jmonUserMedia.getMostUsed(5, userId),
        jmonUserMedia.findLargeFiles(10 * 1024 * 1024, userId) // 10MB+
      ]);

      res.json({
        success: true,
        data: {
          stats: stats,
          mostUsed: mostUsed,
          largeFiles: largeFiles.slice(0, 5) // İlk 5 büyük dosya
        }
      });

    } catch (error) {
      LoggerHelper.logError('webapi-media', error, 'Get media stats error');
      
      res.status(500).json({
        success: false,
        error: 'Medya istatistikleri alınamadı'
      });
    }
  });

  // Cleanup unused files
  router.post('/cleanup', async (req, res) => {
    try {
      const userId = req.user.userId;
      const { daysSinceLastUse = 30 } = req.body;

      const unusedFiles = await jmonUserMedia.findUnusedFiles(daysSinceLastUse, userId);
      
      let deletedCount = 0;
      const errors = [];

      for (const file of unusedFiles) {
        try {
          const success = await jmonUserMedia.delete(file._id);
          if (success) {
            deletedCount++;
          }
        } catch (deleteError) {
          errors.push({
            fileName: file.originalFileName,
            error: deleteError.message
          });
        }
      }

      res.json({
        success: true,
        data: {
          totalFound: unusedFiles.length,
          deleted: deletedCount,
          errors: errors
        }
      });

      LoggerHelper.logInfo('webapi-media', `Media cleanup: ${deletedCount}/${unusedFiles.length} files deleted by user ${req.user.username}`);

    } catch (error) {
      LoggerHelper.logError('webapi-media', error, 'Media cleanup error');
      
      res.status(500).json({
        success: false,
        error: 'Medya temizleme işlemi başarısız'
      });
    }
  });

  return router;
}

module.exports = createWebApiMediaRoutes;