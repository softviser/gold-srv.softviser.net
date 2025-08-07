const express = require('express');
const jwt = require('jsonwebtoken');
const LoggerHelper = require('../utils/logger');

function createWebApiAuthRoutes(db) {
  const router = express.Router();

  // Models
  const JmonUser = require('../models/JmonUser');
  const jmonUser = new JmonUser(db);

  // JWT secret key (production'da environment variable kullanılmalı)
  const JWT_SECRET = process.env.JWT_SECRET || 'jmon-secret-key-2024';
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

  // Login endpoint
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;

      // Validation
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Kullanıcı adı ve şifre gereklidir'
        });
      }

      // Login attempt
      const user = await jmonUser.login(username, password);

      // JWT token oluştur
      const token = jwt.sign(
        { 
          userId: user._id,
          username: user.username,
          domain: user.domain 
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      // Response
      res.json({
        success: true,
        data: {
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
            domain: user.domain,
            permissions: user.permissions,
            allowedChannels: user.allowedChannels,
            dashboardPreferences: user.dashboardPreferences,
            token: user.token, // API token
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt,
            loginCount: user.loginCount
          },
          token: token // JWT token
        }
      });

      LoggerHelper.logInfo('webapi-auth', `Dashboard login successful: ${username}`);

    } catch (error) {
      LoggerHelper.logError('webapi-auth', error, 'Dashboard login error');
      
      res.status(401).json({
        success: false,
        error: error.message || 'Giriş başarısız'
      });
    }
  });

  // Token validation endpoint
  router.get('/validate', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.userId;
      const user = await jmonUser.findById(userId);

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Kullanıcı bulunamadı'
        });
      }

      res.json({
        success: true,
        data: {
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
            domain: user.domain,
            permissions: user.permissions,
            allowedChannels: user.allowedChannels,
            dashboardPreferences: user.dashboardPreferences,
            token: user.token, // API token
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt,
            loginCount: user.loginCount
          },
          valid: true
        }
      });

    } catch (error) {
      LoggerHelper.logError('webapi-auth', error, 'Token validation error');
      
      res.status(500).json({
        success: false,
        error: 'Token doğrulama başarısız'
      });
    }
  });

  // Token refresh endpoint
  router.post('/refresh', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.userId;
      const user = await jmonUser.findById(userId);

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Kullanıcı bulunamadı'
        });
      }

      // Yeni JWT token oluştur
      const newToken = jwt.sign(
        { 
          userId: user._id,
          username: user.username,
          domain: user.domain 
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      res.json({
        success: true,
        data: {
          token: newToken
        }
      });

    } catch (error) {
      LoggerHelper.logError('webapi-auth', error, 'Token refresh error');
      
      res.status(500).json({
        success: false,
        error: 'Token yenileme başarısız'
      });
    }
  });

  // Logout endpoint (token blacklist için kullanılabilir)
  router.post('/logout', authenticateJWT, async (req, res) => {
    try {
      // Bu endpoint'te token blacklist'e eklenebilir
      // Şimdilik basit response döndürüyoruz
      
      res.json({
        success: true,
        message: 'Çıkış başarılı'
      });

      LoggerHelper.logInfo('webapi-auth', `Dashboard logout: ${req.user.username}`);

    } catch (error) {
      LoggerHelper.logError('webapi-auth', error, 'Logout error');
      
      res.status(500).json({
        success: false,
        error: 'Çıkış işlemi başarısız'
      });
    }
  });

  // Change password endpoint
  router.post('/change-password', authenticateJWT, async (req, res) => {
    try {
      const { newPassword } = req.body;
      const userId = req.user.userId;

      if (!newPassword) {
        return res.status(400).json({
          success: false,
          error: 'Yeni şifre gereklidir'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Şifre en az 6 karakter olmalıdır'
        });
      }

      const success = await jmonUser.changePassword(userId, newPassword);

      if (success) {
        res.json({
          success: true,
          message: 'Şifre başarıyla değiştirildi'
        });

        LoggerHelper.logInfo('webapi-auth', `Password changed for user: ${req.user.username}`);
      } else {
        res.status(400).json({
          success: false,
          error: 'Şifre değiştirilemedi'
        });
      }

    } catch (error) {
      LoggerHelper.logError('webapi-auth', error, 'Change password error');
      
      res.status(500).json({
        success: false,
        error: 'Şifre değiştirme işlemi başarısız'
      });
    }
  });

  return router;
}

// JWT Authentication Middleware
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Token gereklidir'
    });
  }

  const JWT_SECRET = process.env.JWT_SECRET || 'jmon-secret-key-2024';

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: 'Geçersiz token'
      });
    }

    req.user = user;
    next();
  });
}

// API Token Authentication Middleware (for API access)
function authenticateApiToken(db) {
  const JmonUser = require('../models/JmonUser');
  const jmonUser = new JmonUser(db);

  return async (req, res, next) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
      
      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'API token gereklidir'
        });
      }

      const domain = req.headers.origin || req.headers.referer || 'unknown';
      const extractedDomain = extractDomain(domain);
      
      const user = await jmonUser.validateByToken(token, extractedDomain);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Geçersiz API token'
        });
      }

      req.apiUser = user;
      next();

    } catch (error) {
      LoggerHelper.logError('webapi-auth', error, 'API Token authentication error');
      
      res.status(500).json({
        success: false,
        error: 'Token doğrulama başarısız'
      });
    }
  };
}

// Domain extraction helper
function extractDomain(url) {
  try {
    if (!url) return 'unknown';
    
    // URL formatında değilse direkt dön
    if (!url.includes('http')) {
      return url;
    }
    
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    return url || 'unknown';
  }
}

module.exports = {
  createWebApiAuthRoutes,
  authenticateJWT,
  authenticateApiToken
};