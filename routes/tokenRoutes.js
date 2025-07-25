const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

module.exports = (db) => {
  const ApiToken = require('../models/ApiToken');
  const ApiConnectionLog = require('../models/ApiConnectionLog');
  const apiToken = new ApiToken(db);
  const apiConnectionLog = new ApiConnectionLog(db);

  // Admin authentication middleware (basit örnek)
  const adminAuth = (req, res, next) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };

  // Yeni token oluştur
  router.post('/tokens', adminAuth, async (req, res) => {
    try {
      const { domain, name, description, permissions, allowedChannels, expiresIn } = req.body;

      if (!domain) {
        return res.status(400).json({ error: 'Domain gerekli' });
      }

      const expiresAt = expiresIn ? 
        new Date(Date.now() + expiresIn * 1000) : 
        null;

      const token = await apiToken.create({
        domain,
        name,
        description,
        permissions,
        allowedChannels,
        expiresAt
      });

      res.status(201).json({
        success: true,
        token: token
      });
    } catch (error) {
      console.error('Token oluşturma hatası:', error);
      res.status(500).json({ error: 'Token oluşturulamadı' });
    }
  });

  // Domain'e göre tokenları listele
  router.get('/tokens/domain/:domain', adminAuth, async (req, res) => {
    try {
      const tokens = await apiToken.findByDomain(req.params.domain);
      
      // Hassas bilgileri gizle
      const safeTokens = tokens.map(t => ({
        _id: t._id,
        name: t.name,
        domain: t.domain,
        tokenPreview: t.token.substring(0, 10) + '...',
        permissions: t.permissions,
        isActive: t.isActive,
        createdAt: t.createdAt,
        lastUsedAt: t.lastUsedAt,
        usageCount: t.usageCount
      }));

      res.json({
        success: true,
        tokens: safeTokens
      });
    } catch (error) {
      console.error('Token listeleme hatası:', error);
      res.status(500).json({ error: 'Tokenlar listelenemedi' });
    }
  });

  // Tüm aktif tokenları listele
  router.get('/tokens', adminAuth, async (req, res) => {
    try {
      const { skip = 0, limit = 50 } = req.query;
      
      const tokens = await apiToken.listActive({
        skip: parseInt(skip),
        limit: parseInt(limit)
      });

      const safeTokens = tokens.map(t => ({
        _id: t._id,
        name: t.name,
        domain: t.domain,
        tokenPreview: t.token.substring(0, 10) + '...',
        permissions: t.permissions,
        allowedChannels: t.allowedChannels,
        isActive: t.isActive,
        createdAt: t.createdAt,
        lastUsedAt: t.lastUsedAt,
        usageCount: t.usageCount,
        expiresAt: t.expiresAt
      }));

      res.json({
        success: true,
        tokens: safeTokens,
        count: safeTokens.length
      });
    } catch (error) {
      console.error('Token listeleme hatası:', error);
      res.status(500).json({ error: 'Tokenlar listelenemedi' });
    }
  });

  // Token güncelle
  router.put('/tokens/:id', adminAuth, async (req, res) => {
    try {
      const tokenId = new ObjectId(req.params.id);
      const updates = req.body;

      const success = await apiToken.update(tokenId, updates);

      if (success) {
        res.json({
          success: true,
          message: 'Token güncellendi'
        });
      } else {
        res.status(404).json({ error: 'Token bulunamadı' });
      }
    } catch (error) {
      console.error('Token güncelleme hatası:', error);
      res.status(500).json({ error: 'Token güncellenemedi' });
    }
  });

  // Token deaktif et
  router.post('/tokens/:id/deactivate', adminAuth, async (req, res) => {
    try {
      const tokenId = new ObjectId(req.params.id);
      const success = await apiToken.deactivate(tokenId);

      if (success) {
        res.json({
          success: true,
          message: 'Token deaktif edildi'
        });
      } else {
        res.status(404).json({ error: 'Token bulunamadı' });
      }
    } catch (error) {
      console.error('Token deaktif etme hatası:', error);
      res.status(500).json({ error: 'Token deaktif edilemedi' });
    }
  });

  // Token sil
  router.delete('/tokens/:id', adminAuth, async (req, res) => {
    try {
      const tokenId = new ObjectId(req.params.id);
      const success = await apiToken.delete(tokenId);

      if (success) {
        res.json({
          success: true,
          message: 'Token silindi'
        });
      } else {
        res.status(404).json({ error: 'Token bulunamadı' });
      }
    } catch (error) {
      console.error('Token silme hatası:', error);
      res.status(500).json({ error: 'Token silinemedi' });
    }
  });

  // Token istatistikleri
  router.get('/tokens/:id/stats', adminAuth, async (req, res) => {
    try {
      const tokenId = new ObjectId(req.params.id);
      const stats = await apiToken.getStats(tokenId);

      if (stats) {
        res.json({
          success: true,
          stats: stats
        });
      } else {
        res.status(404).json({ error: 'Token bulunamadı' });
      }
    } catch (error) {
      console.error('Token istatistik hatası:', error);
      res.status(500).json({ error: 'İstatistikler alınamadı' });
    }
  });

  // Token doğrula (public endpoint - test için)
  router.post('/tokens/validate', async (req, res) => {
    try {
      const { token, domain } = req.body;

      if (!token) {
        return res.status(400).json({ error: 'Token gerekli' });
      }

      const validToken = await apiToken.validate(token, domain);

      if (validToken) {
        res.json({
          success: true,
          valid: true,
          permissions: validToken.permissions,
          allowedChannels: validToken.allowedChannels
        });
      } else {
        res.status(401).json({
          success: false,
          valid: false,
          error: 'Geçersiz veya süresi dolmuş token'
        });
      }
    } catch (error) {
      console.error('Token doğrulama hatası:', error);
      res.status(500).json({ error: 'Token doğrulanamadı' });
    }
  });

  // Süresi dolmuş tokenları temizle
  router.post('/tokens/cleanup', adminAuth, async (req, res) => {
    try {
      const deletedCount = await apiToken.cleanupExpired();
      
      res.json({
        success: true,
        message: `${deletedCount} adet süresi dolmuş token silindi`
      });
    } catch (error) {
      console.error('Token temizleme hatası:', error);
      res.status(500).json({ error: 'Tokenlar temizlenemedi' });
    }
  });

  // API Connection Logs - Genel logları listele
  router.get('/logs', adminAuth, async (req, res) => {
    try {
      const { limit = 100, skip = 0 } = req.query;
      
      const logs = await apiConnectionLog.getRecentConnections(
        parseInt(limit), 
        parseInt(skip)
      );
      
      res.json({
        success: true,
        logs: logs,
        count: logs.length
      });
    } catch (error) {
      console.error('API log listeleme hatası:', error);
      res.status(500).json({ error: 'Loglar listelenemedi' });
    }
  });

  // API Connection Logs - Token bazında logları listele
  router.get('/logs/token/:tokenId', adminAuth, async (req, res) => {
    try {
      const { limit = 100, skip = 0 } = req.query;
      const tokenId = new ObjectId(req.params.tokenId);
      
      const logs = await apiConnectionLog.getConnectionsByToken(
        tokenId, 
        parseInt(limit), 
        parseInt(skip)
      );
      
      res.json({
        success: true,
        logs: logs,
        count: logs.length
      });
    } catch (error) {
      console.error('Token log listeleme hatası:', error);
      res.status(500).json({ error: 'Token logları listelenemedi' });
    }
  });

  // API Connection Logs - Domain bazında logları listele
  router.get('/logs/domain/:domain', adminAuth, async (req, res) => {
    try {
      const { limit = 100, skip = 0 } = req.query;
      const domain = req.params.domain;
      
      const logs = await apiConnectionLog.getConnectionsByDomain(
        domain, 
        parseInt(limit), 
        parseInt(skip)
      );
      
      res.json({
        success: true,
        logs: logs,
        count: logs.length
      });
    } catch (error) {
      console.error('Domain log listeleme hatası:', error);
      res.status(500).json({ error: 'Domain logları listelenemedi' });
    }
  });

  // API Connection Logs - Genel istatistikler
  router.get('/logs/stats', adminAuth, async (req, res) => {
    try {
      const { days = 30 } = req.query;
      
      const stats = await apiConnectionLog.getOverallStats(parseInt(days));
      
      res.json({
        success: true,
        stats: stats
      });
    } catch (error) {
      console.error('API log istatistik hatası:', error);
      res.status(500).json({ error: 'Log istatistikleri alınamadı' });
    }
  });

  // API Connection Logs - Günlük grafik verisi
  router.get('/logs/chart', adminAuth, async (req, res) => {
    try {
      const { days = 7 } = req.query;
      
      const chartData = await apiConnectionLog.getDailyConnectionChart(parseInt(days));
      
      res.json({
        success: true,
        chartData: chartData
      });
    } catch (error) {
      console.error('API log grafik hatası:', error);
      res.status(500).json({ error: 'Grafik verisi alınamadı' });
    }
  });

  // API Connection Logs - Eski logları temizle
  router.post('/logs/cleanup', adminAuth, async (req, res) => {
    try {
      const { days = 90 } = req.body;
      
      const deletedCount = await apiConnectionLog.cleanupOldLogs(parseInt(days));
      
      res.json({
        success: true,
        message: `${deletedCount} adet eski API log kaydı silindi`
      });
    } catch (error) {
      console.error('API log temizleme hatası:', error);
      res.status(500).json({ error: 'API logları temizlenemedi' });
    }
  });

  return router;
};