const DateHelper = require('../utils/dateHelper');

class Settings {
  constructor(db) {
    this.collection = db.collection('settings');
    
    // Create unique index for setting key
    this.collection.createIndex({ key: 1 }, { unique: true });
    this.collection.createIndex({ category: 1 });
  }

  // Get setting by key
  async get(key, defaultValue = null) {
    const setting = await this.collection.findOne({ key });
    return setting ? setting.value : defaultValue;
  }

  // Get all settings in a category
  async getByCategory(category) {
    const settings = await this.collection.find({ category }).toArray();
    const result = {};
    settings.forEach(setting => {
      result[setting.key] = setting.value;
    });
    return result;
  }

  // Get all settings
  async getAll() {
    const settings = await this.collection.find({}).toArray();
    const result = {};
    settings.forEach(setting => {
      if (!result[setting.category]) {
        result[setting.category] = {};
      }
      // Key'den category prefix'ini çıkar (örn: "general.siteName" -> "siteName")
      const cleanKey = setting.key.includes('.') ? setting.key.split('.')[1] : setting.key;
      result[setting.category][cleanKey] = setting.value;
    });
    return result;
  }

  // Set a single setting
  async set(key, value, category = 'general', description = '') {
    const setting = {
      key,
      value,
      category,
      description,
      type: this.getValueType(value),
      updatedAt: DateHelper.createDate()
    };

    const result = await this.collection.replaceOne(
      { key },
      setting,
      { upsert: true }
    );

    return result.acknowledged;
  }

  // Set multiple settings
  async setMultiple(settings) {
    const operations = [];
    
    for (const [key, data] of Object.entries(settings)) {
      const setting = {
        key,
        value: data.value,
        category: data.category || 'general',
        description: data.description || '',
        type: this.getValueType(data.value),
        updatedAt: DateHelper.createDate()
      };

      operations.push({
        replaceOne: {
          filter: { key },
          replacement: setting,
          upsert: true
        }
      });
    }

    if (operations.length > 0) {
      const result = await this.collection.bulkWrite(operations);
      return result.acknowledged;
    }

    return true;
  }

  // Delete a setting
  async delete(key) {
    const result = await this.collection.deleteOne({ key });
    return result.deletedCount > 0;
  }

  // Delete settings by category
  async deleteByCategory(category) {
    const result = await this.collection.deleteMany({ category });
    return result.deletedCount;
  }

  // Get value type
  getValueType(value) {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (Array.isArray(value)) return 'array';
    if (value instanceof Date) return 'date';
    if (typeof value === 'object' && value !== null) return 'object';
    return 'string';
  }

  // Default settings structure
  getDefaultSettings() {
    return {
      // Genel Ayarlar
      general: {
        siteName: { value: 'Gold Server', description: 'Site adı' },
        siteDescription: { value: 'Altın ve Döviz Takip Sistemi', description: 'Site açıklaması' },
        adminEmail: { value: 'admin@goldserver.com', description: 'Yönetici e-posta adresi' },
        timezone: { value: 'Europe/Istanbul', description: 'Sistem saat dilimi' },
        language: { value: 'tr', description: 'Sistem dili' },
        dateFormat: { value: 'DD/MM/YYYY', description: 'Tarih formatı' },
        timeFormat: { value: 'HH:mm:ss', description: 'Saat formatı' }
      },
      
      // Veri Ayarları
      data: {
        defaultUpdateInterval: { value: 60, description: 'Varsayılan güncelleme aralığı (saniye)' },
        realtimeUpdateInterval: { value: 30, description: 'Gerçek zamanlı güncelleme aralığı (saniye)' },
        frequentUpdateInterval: { value: 300, description: 'Sık güncelleme aralığı (saniye)' },
        dailyUpdateInterval: { value: 3600, description: 'Günlük güncelleme aralığı (saniye)' },
        priceHistoryDays: { value: 90, description: 'API fiyat görüntüleme süresi (gün) - API\'de geçmiş fiyatlara ne kadar geriye dönük erişilebileceği' },
        priceHistoryRetentionDays: { value: 730, description: 'Fiyat geçmişi saklama süresi (gün) - price_history tablosundaki kayıtlar bu süre sonunda silinir' },
        connectionLogDays: { value: 30, description: 'Bağlantı logları saklama süresi (gün)' },
        autoCleanup: { value: true, description: 'Otomatik temizleme aktif mi?' },
        autoCleanupHour: { value: 3, description: 'Temizlik servisi çalışma saati (0-23)' },
        cleanupTime: { value: '03:00', description: 'Temizleme saati' },
        logRetentionDays: { value: 30, description: 'Log saklama süresi (gün)' },
        maxPriceChangePercent: { value: 10, description: 'Maksimum fiyat değişim yüzdesi' },
        anomalyDetection: { value: true, description: 'Anormal fiyat tespiti aktif mi?' },
        priceChangeValue: { value: 0.25, description: 'Fiyat değişim değeri' },
        priceChangeType: { value: 'amount', description: 'Fiyat değişim tipi (amount: TL, percent: %)' }
      },
      
      // Socket Ayarları
      socket: {
        socketPort: { value: 3001, description: 'WebSocket portu' },
        maxConnections: { value: 1000, description: 'Maksimum bağlantı sayısı' },
        heartbeatInterval: { value: 30000, description: 'Heartbeat aralığı (ms)' },
        reconnectAttempts: { value: 5, description: 'Yeniden bağlanma deneme sayısı' },
        reconnectDelay: { value: 5000, description: 'Yeniden bağlanma gecikmesi (ms)' },
        maxReconnectDelay: { value: 10000, description: 'Maksimum yeniden bağlanma gecikmesi (ms)' },
        messageTimeout: { value: 30000, description: 'Mesaj timeout süresi (ms)' },
        enableCompression: { value: true, description: 'Sıkıştırma aktif mi?' },
        enableCors: { value: true, description: 'CORS aktif mi?' }
      },
      
      // Güvenlik Ayarları
      security: {
        sessionTimeout: { value: 3600, description: 'Oturum zaman aşımı (saniye)' },
        maxLoginAttempts: { value: 5, description: 'Maksimum giriş denemesi' },
        lockoutDuration: { value: 900, description: 'Hesap kilitleme süresi (saniye)' },
        passwordMinLength: { value: 8, description: 'Minimum şifre uzunluğu' },
        requireStrongPassword: { value: true, description: 'Güçlü şifre zorunlu mu?' },
        enableTwoFactor: { value: false, description: 'İki faktörlü doğrulama aktif mi?' },
        tokenExpiration: { value: 86400, description: 'API token geçerlilik süresi (saniye)' }
      },
      
      // Loglama Ayarları
      logging: {
        logLevel: { value: 'info', description: 'Log seviyesi (debug, info, warn, error)' },
        enableFileLogging: { value: true, description: 'Dosya loglaması aktif mi?' },
        enableConsoleLogging: { value: true, description: 'Konsol loglaması aktif mi?' },
        logRetentionDays: { value: 30, description: 'Log saklama süresi (gün)' },
        maxLogFileSize: { value: '20m', description: 'Maksimum log dosya boyutu' },
        compressOldLogs: { value: true, description: 'Eski logları sıkıştır' },
        logPriceUpdates: { value: true, description: 'Fiyat güncellemelerini logla' },
        logApiRequests: { value: true, description: 'API isteklerini logla' }
      },
      
      // Geliştirici Ayarları
      devmode: {
        enabled: { value: false, description: 'Geliştirici modu aktif mi?' },
        showConsoleDebug: { value: true, description: 'Konsol debug mesajları gösterilsin mi?' },
        showDatabaseOperations: { value: true, description: 'Veritabanı işlemleri loglanacak mı?' },
        showPriceChangeNotifications: { value: true, description: 'Fiyat değişim bildirimleri gösterilsin mi?' }
      }
    };
  }

  // Initialize default settings if not exists
  async initializeDefaults() {
    const existingSettings = await this.collection.countDocuments();
    
    if (existingSettings === 0) {
      const defaults = this.getDefaultSettings();
      const operations = [];

      for (const [category, settings] of Object.entries(defaults)) {
        for (const [key, data] of Object.entries(settings)) {
          operations.push({
            insertOne: {
              document: {
                key: `${category}.${key}`,
                value: data.value,
                category,
                description: data.description,
                type: this.getValueType(data.value),
                updatedAt: DateHelper.createDate()
              }
            }
          });
        }
      }

      if (operations.length > 0) {
        await this.collection.bulkWrite(operations);
        console.log('Default settings initialized');
      }
    }
  }

  // Update category settings
  async updateCategory(category, settings) {
    const operations = [];
    
    for (const [key, value] of Object.entries(settings)) {
      const fullKey = `${category}.${key}`;
      const existingSetting = await this.collection.findOne({ key: fullKey });
      
      operations.push({
        replaceOne: {
          filter: { key: fullKey },
          replacement: {
            key: fullKey,
            value,
            category,
            description: existingSetting?.description || '',
            type: this.getValueType(value),
            updatedAt: DateHelper.createDate()
          },
          upsert: true
        }
      });
    }

    if (operations.length > 0) {
      const result = await this.collection.bulkWrite(operations);
      return result.acknowledged;
    }

    return true;
  }
}

module.exports = Settings;