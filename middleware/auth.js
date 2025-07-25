const jwt = require('jsonwebtoken');
const User = require('../models/User');
const settingsService = require('../utils/settingsService');

// JWT token doğrulama middleware'i
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token gerekli' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // Kullanıcıyı veritabanından kontrol et
    const userModel = new User(req.db);
    const user = await userModel.findById(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Geçersiz kullanıcı' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Geçersiz token' });
  }
};

// Session tabanlı auth (admin panel için)
const authenticateSession = async (req, res, next) => {
  try {
    if (!req.session.userId) {
      return res.redirect('/admin/login');
    }

    // Session timeout kontrolü
    const sessionTimeout = settingsService.getSessionTimeout();
    if (req.session.lastActivity && (Date.now() - req.session.lastActivity) > sessionTimeout) {
      req.session.destroy();
      return res.redirect('/admin/login?expired=true');
    }

    const userModel = new User(req.db);
    const user = await userModel.findById(req.session.userId);
    
    if (!user || !user.isActive) {
      req.session.destroy();
      return res.redirect('/admin/login');
    }

    // İki faktörlü doğrulama kontrolü
    if (await userModel.requiresTwoFactor(user._id) && !req.session.twoFactorVerified) {
      return res.redirect('/admin/two-factor');
    }

    // Session activity'yi güncelle
    req.session.lastActivity = Date.now();

    req.user = user;
    res.locals.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware hatası:', error);
    res.redirect('/admin/login');
  }
};

// Admin yetkisi kontrolü
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(403).json({ error: 'Admin yetkisi gerekli' });
    }
    return res.redirect('/admin/login');
  }
  next();
};

// Manager veya Admin yetkisi kontrolü
const requireManagerOrAdmin = (req, res, next) => {
  if (!req.user || !['admin', 'manager'].includes(req.user.role)) {
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(403).json({ error: 'Yönetici yetkisi gerekli' });
    }
    return res.redirect('/admin/login');
  }
  next();
};

// İzin kontrolü
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions.includes(permission)) {
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(403).json({ error: `${permission} izni gerekli` });
      }
      return res.status(403).render('error', { 
        message: 'Bu işlem için yetkiniz yok',
        error: { status: 403 }
      });
    }
    next();
  };
};

// Rate limiting middleware (başarısız giriş denemelerine karşı)
const rateLimitFailedLogins = () => {
  const attempts = new Map();
  
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const maxAttempts = settingsService.getMaxLoginAttempts();
    const lockoutDuration = settingsService.getLockoutDuration();
    
    // IP'nin deneme geçmişini kontrol et
    const userAttempts = attempts.get(ip) || { count: 0, lastAttempt: now };
    
    // Lockout süresi geçtiyse sıfırla
    if (now - userAttempts.lastAttempt > lockoutDuration) {
      userAttempts.count = 0;
    }
    
    // Maksimum deneme sayısına ulaşıldıysa engelle
    if (userAttempts.count >= maxAttempts) {
      return res.status(429).json({ 
        error: 'Çok fazla başarısız deneme. Lütfen daha sonra tekrar deneyin.',
        retryAfter: Math.ceil((lockoutDuration - (now - userAttempts.lastAttempt)) / 1000)
      });
    }
    
    // Başarısız deneme durumunda sayacı artır
    req.incrementFailedAttempt = () => {
      userAttempts.count++;
      userAttempts.lastAttempt = now;
      attempts.set(ip, userAttempts);
    };
    
    // Başarılı giriş durumunda sıfırla
    req.resetFailedAttempts = () => {
      attempts.delete(ip);
    };
    
    next();
  };
};

module.exports = {
  authenticateToken,
  authenticateSession,
  requireAdmin,
  requireManagerOrAdmin,
  requirePermission,
  rateLimitFailedLogins
};