const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const settingsService = require('../utils/settingsService');
const DateHelper = require('../utils/dateHelper');

class User {
  constructor(db) {
    this.collection = db.collection('users');
    
    // Index oluştur
    this.collection.createIndex({ email: 1 }, { unique: true });
    this.collection.createIndex({ phone: 1 });
    this.collection.createIndex({ role: 1 });
    this.collection.createIndex({ isActive: 1 });
  }

  // Yeni kullanıcı oluştur
  async create(data) {
    // Email kontrolü
    const existingUser = await this.collection.findOne({ email: data.email });
    if (existingUser) {
      throw new Error('Bu email adresi zaten kullanımda');
    }

    // Şifre validasyonu
    this.validatePassword(data.password);

    // Şifreyi hashle
    const hashedPassword = await bcrypt.hash(data.password, 12);

    const user = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email.toLowerCase(),
      phone: data.phone || null,
      password: hashedPassword,
      role: data.role || 'user',          // 'admin', 'manager', 'user'
      permissions: data.permissions || [], // ['read', 'write', 'delete', 'manage_users']
      department: data.department || null,
      title: data.title || null,
      avatar: data.avatar || null,
      isActive: true,
      isEmailVerified: false,
      emailVerificationToken: null,
      passwordResetToken: null,
      passwordResetExpires: null,
      lastLogin: null,
      loginCount: 0,
      failedLoginAttempts: 0,
      lockoutUntil: null,
      preferences: data.preferences || {
        language: 'tr',
        timezone: 'Europe/Istanbul',
        theme: 'light',
        notifications: {
          email: true,
          browser: true,
          sms: false
        }
      },
      metadata: data.metadata || {},
      createdAt: DateHelper.createDate(),
      updatedAt: DateHelper.createDate(),
      createdBy: data.createdBy || null
    };

    const result = await this.collection.insertOne(user);
    
    // Şifreyi response'dan çıkar
    const { password, ...userWithoutPassword } = user;
    return { ...userWithoutPassword, _id: result.insertedId };
  }

  // Email ile kullanıcı bul
  async findByEmail(email) {
    return await this.collection.findOne({ 
      email: email.toLowerCase(),
      isActive: true 
    });
  }

  // ID ile kullanıcı bul
  async findById(userId) {
    const { ObjectId } = require('mongodb');
    
    // ObjectId tipini kontrol et
    let query;
    if (typeof userId === 'string') {
      query = { _id: new ObjectId(userId) };
    } else {
      query = { _id: userId };
    }
    
    const user = await this.collection.findOne(query);
    if (user) {
      delete user.password;
    }
    return user;
  }

  // Kullanıcı girişi
  async login(email, password) {
    const user = await this.collection.findOne({ 
      email: email.toLowerCase(),
      isActive: true 
    });

    if (!user) {
      throw new Error('Kullanıcı bulunamadı');
    }

    // Hesap kilidi kontrolü
    if (user.lockoutUntil && user.lockoutUntil > DateHelper.createDate()) {
      throw new Error('Hesap geçici olarak kilitli');
    }

    // Şifre kontrolü
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      // Başarısız giriş sayısını artır
      await this.incrementFailedLogins(user._id);
      throw new Error('Geçersiz şifre');
    }

    // Başarılı giriş
    await this.updateLastLogin(user._id);

    // JWT token oluştur
    const tokenExpiration = settingsService.getTokenExpiration();
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email, 
        role: user.role 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: `${tokenExpiration}s` }
    );

    // Şifreyi response'dan çıkar
    const { password: _, ...userWithoutPassword } = user;
    
    return {
      user: userWithoutPassword,
      token: token
    };
  }

  // Son giriş zamanını güncelle
  async updateLastLogin(userId) {
    await this.collection.updateOne(
      { _id: userId },
      { 
        $set: { 
          lastLogin: DateHelper.createDate(),
          updatedAt: DateHelper.createDate()
        },
        $inc: { loginCount: 1 },
        $unset: { 
          failedLoginAttempts: 1, 
          lockoutUntil: 1 
        }
      }
    );
  }

  // Başarısız giriş sayısını artır
  async incrementFailedLogins(userId) {
    const user = await this.collection.findOne({ _id: userId });
    const failedAttempts = (user.failedLoginAttempts || 0) + 1;
    
    const updateData = {
      failedLoginAttempts: failedAttempts,
      updatedAt: DateHelper.createDate()
    };

    // Settings'ten maksimum deneme sayısı ve lockout süresini al
    const maxAttempts = settingsService.getMaxLoginAttempts();
    const lockoutDuration = settingsService.getLockoutDuration();
    
    if (failedAttempts >= maxAttempts) {
      updateData.lockoutUntil = new Date(Date.now() + lockoutDuration);
    }

    await this.collection.updateOne(
      { _id: userId },
      { $set: updateData }
    );
  }

  // Kullanıcı güncelle
  async update(userId, updates) {
    const allowedUpdates = [
      'firstName', 'lastName', 'phone', 'role', 'permissions',
      'department', 'title', 'avatar', 'isActive', 'preferences', 'metadata'
    ];

    const updateData = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        updateData[key] = updates[key];
      }
    }

    updateData.updatedAt = DateHelper.createDate();

    const result = await this.collection.updateOne(
      { _id: userId },
      { $set: updateData }
    );

    return result.modifiedCount > 0;
  }

  // Şifre değiştir
  async changePassword(userId, currentPassword, newPassword) {
    const user = await this.collection.findOne({ _id: userId });
    
    if (!user) {
      throw new Error('Kullanıcı bulunamadı');
    }

    // Mevcut şifre kontrolü
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new Error('Mevcut şifre yanlış');
    }

    // Yeni şifre validasyonu
    this.validatePassword(newPassword);

    // Yeni şifreyi hashle
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    await this.collection.updateOne(
      { _id: userId },
      { 
        $set: { 
          password: hashedNewPassword,
          updatedAt: DateHelper.createDate()
        }
      }
    );

    return true;
  }

  // Şifre sıfırlama token'ı oluştur
  async generatePasswordResetToken(email) {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new Error('Kullanıcı bulunamadı');
    }

    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 saat

    await this.collection.updateOne(
      { _id: user._id },
      { 
        $set: { 
          passwordResetToken: resetToken,
          passwordResetExpires: resetExpires,
          updatedAt: DateHelper.createDate()
        }
      }
    );

    return resetToken;
  }

  // Şifre sıfırla
  async resetPassword(token, newPassword) {
    const user = await this.collection.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: DateHelper.createDate() }
    });

    if (!user) {
      throw new Error('Geçersiz veya süresi dolmuş token');
    }

    // Yeni şifre validasyonu
    this.validatePassword(newPassword);

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await this.collection.updateOne(
      { _id: user._id },
      { 
        $set: { 
          password: hashedPassword,
          updatedAt: DateHelper.createDate()
        },
        $unset: {
          passwordResetToken: 1,
          passwordResetExpires: 1
        }
      }
    );

    return true;
  }

  // Tüm kullanıcıları listele
  async list(options = {}) {
    const { skip = 0, limit = 50, role = null, isActive = null } = options;
    
    const query = {};
    if (role) query.role = role;
    if (isActive !== null) query.isActive = isActive;

    const users = await this.collection.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Şifreleri çıkar
    return users.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
  }

  // Kullanıcı deaktif et
  async deactivate(userId) {
    return await this.update(userId, { isActive: false });
  }

  // Kullanıcı sil
  async delete(userId) {
    const result = await this.collection.deleteOne({ _id: userId });
    return result.deletedCount > 0;
  }

  // İstatistikler
  async getStats() {
    const stats = await this.collection.aggregate([
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          activeUsers: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          adminUsers: {
            $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] }
          },
          managerUsers: {
            $sum: { $cond: [{ $eq: ['$role', 'manager'] }, 1, 0] }
          },
          regularUsers: {
            $sum: { $cond: [{ $eq: ['$role', 'user'] }, 1, 0] }
          },
          recentLogins: {
            $sum: { 
              $cond: [
                { $gte: ['$lastLogin', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] }, 
                1, 
                0
              ] 
            }
          }
        }
      }
    ]).toArray();

    if (stats.length === 0) {
      return {
        totalUsers: 0,
        activeUsers: 0,
        adminUsers: 0,
        managerUsers: 0,
        regularUsers: 0,
        recentLogins: 0
      };
    }

    return stats[0];
  }

  // Şifre validasyonu
  validatePassword(password) {
    const minLength = settingsService.getPasswordMinLength();
    const requireStrong = settingsService.requireStrongPassword();

    if (!password || password.length < minLength) {
      throw new Error(`Şifre en az ${minLength} karakter olmalıdır`);
    }

    if (requireStrong) {
      // Güçlü şifre kontrolü: en az 1 büyük harf, 1 küçük harf, 1 sayı, 1 özel karakter
      const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
      if (!strongPasswordRegex.test(password)) {
        throw new Error('Şifre en az 1 büyük harf, 1 küçük harf, 1 sayı ve 1 özel karakter içermelidir');
      }
    }
  }

  // İki faktörlü doğrulama durumunu kontrol et
  async requiresTwoFactor(userId) {
    if (!settingsService.isTwoFactorEnabled()) {
      return false;
    }

    const user = await this.findById(userId);
    return user && user.twoFactorEnabled;
  }
}

module.exports = User;