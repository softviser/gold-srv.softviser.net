const express = require('express');
const router = express.Router();

module.exports = (db) => {
  const User = require('../models/User');
  const userModel = new User(db);

  // Giriş sayfası
  router.get('/login', (req, res) => {
    if (req.session.userId) {
      return res.redirect('/admin');
    }
    
    res.render('auth/login', {
      title: 'Giriş Yap',
      layout: 'auth'
    });
  });

  // Giriş işlemi
  router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.render('auth/login', {
          title: 'Giriş Yap',
          layout: 'auth',
          error: 'Email ve şifre gerekli',
          email: email
        });
      }

      const result = await userModel.login(email, password);
      
      // Admin paneli için sadece admin ve manager'lar giriş yapabilir
      if (!['admin', 'manager'].includes(result.user.role)) {
        return res.render('auth/login', {
          title: 'Giriş Yap',
          layout: 'auth',
          error: 'Bu panele erişim yetkiniz yok',
          email: email
        });
      }

      // Session oluştur
      req.session.userId = result.user._id;
      req.session.userRole = result.user.role;
      
      res.redirect('/admin');
    } catch (error) {
      console.error('Giriş hatası:', error);
      res.render('auth/login', {
        title: 'Giriş Yap',
        layout: 'auth',
        error: error.message,
        email: req.body.email
      });
    }
  });

  // Çıkış işlemi
  router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Çıkış hatası:', err);
      }
      res.redirect('/admin/login');
    });
  });

  // Profil sayfası
  router.get('/profile', async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.redirect('/admin/login');
      }

      const user = await userModel.findById(req.session.userId);
      if (!user) {
        req.session.destroy();
        return res.redirect('/admin/login');
      }

      res.render('admin/profile', {
        title: 'Profil',
        user: user
      });
    } catch (error) {
      console.error('Profil hatası:', error);
      res.redirect('/admin');
    }
  });

  // Profil güncelleme
  router.post('/profile', async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.redirect('/admin/login');
      }

      const { firstName, lastName, phone, currentPassword, newPassword, confirmPassword } = req.body;
      
      const user = await userModel.findById(req.session.userId);
      if (!user) {
        req.session.destroy();
        return res.redirect('/admin/login');
      }

      // Profil bilgilerini güncelle
      const updateData = {
        firstName,
        lastName,
        phone
      };

      await userModel.update(req.session.userId, updateData);

      // Şifre değişikliği varsa
      if (currentPassword && newPassword) {
        if (newPassword !== confirmPassword) {
          return res.render('admin/profile', {
            title: 'Profil',
            user: { ...user, ...updateData },
            error: 'Yeni şifreler eşleşmiyor'
          });
        }

        try {
          await userModel.changePassword(req.session.userId, currentPassword, newPassword);
        } catch (passwordError) {
          return res.render('admin/profile', {
            title: 'Profil',
            user: { ...user, ...updateData },
            error: passwordError.message
          });
        }
      }

      // Güncellenmiş kullanıcı bilgilerini al
      const updatedUser = await userModel.findById(req.session.userId);
      
      res.render('admin/profile', {
        title: 'Profil',
        user: updatedUser,
        success: 'Profil başarıyla güncellendi'
      });
    } catch (error) {
      console.error('Profil güncelleme hatası:', error);
      res.render('admin/profile', {
        title: 'Profil',
        user: req.body,
        error: 'Profil güncellenirken hata oluştu'
      });
    }
  });

  return router;
};