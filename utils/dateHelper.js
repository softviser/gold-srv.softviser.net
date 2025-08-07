const moment = require('moment');
const settingsService = require('./settingsService');

class DateHelper {
  /**
   * Tarihi settingsService'deki timezone ve language ayarlarına göre formatlar
   * @param {Date|string} date - Formatlanacak tarih
   * @param {string} format - Moment.js format string (opsiyonel)
   * @returns {string} Formatlanmış tarih
   */
  static formatDateTime(date, format = null) {
    if (!date) return '';
    
    try {
      const timezone = settingsService.getTimezone() || 'Europe/Istanbul';
      const language = settingsService.getLanguage() || 'tr';
      
      // Moment'i dil ile ayarla
      moment.locale(language);
      
      // Tarihi timezone'a çevir
      let momentDate = moment(date);
      if (timezone !== 'UTC') {
        momentDate = momentDate.utcOffset(this.getTimezoneOffsetMinutes(timezone));
      }
      
      // Format belirtilmemişse varsayılan format kullan
      if (!format) {
        format = 'YYYY-MM-DD HH:mm:ss';
      }
      
      return momentDate.format(format);
    } catch (error) {
      console.error('DateHelper formatDateTime error:', error);
      return moment(date).format('YYYY-MM-DD HH:mm:ss');
    }
  }
  
  /**
   * Tarihi kısa format ile gösterir (sadece tarih)
   * @param {Date|string} date 
   * @returns {string}
   */
  static formatDate(date) {
    return this.formatDateTime(date, 'YYYY-MM-DD');
  }
  
  /**
   * Tarihi uzun format ile gösterir
   * @param {Date|string} date 
   * @returns {string}
   */
  static formatDateTimeLong(date) {
    return this.formatDateTime(date, 'YYYY-MM-DD HH:mm:ss');
  }
  
  /**
   * Tarihi göreli olarak gösterir (5 dakika önce, 2 saat önce vs.)
   * @param {Date|string} date 
   * @returns {string}
   */
  static formatRelative(date) {
    if (!date) return '';
    
    try {
      const timezone = settingsService.getTimezone() || 'Europe/Istanbul';
      const language = settingsService.getLanguage() || 'tr';
      
      moment.locale(language);
      
      let momentDate = moment(date);
      if (timezone !== 'UTC') {
        momentDate = momentDate.utcOffset(this.getTimezoneOffsetMinutes(timezone));
      }
      
      return momentDate.fromNow();
    } catch (error) {
      console.error('DateHelper formatRelative error:', error);
      return moment(date).fromNow();
    }
  }
  
  /**
   * Timezone için offset hesapla (dakika cinsinden)
   * @param {string} timezone 
   * @returns {number}
   */
  static getTimezoneOffsetMinutes(timezone) {
    const offsets = {
      'Europe/Istanbul': 180, // UTC+3
      'Europe/London': 0,     // UTC+0
      'America/New_York': -300, // UTC-5
      'Asia/Tokyo': 540,      // UTC+9
      'UTC': 0
    };
    
    return offsets[timezone] || 180; // Varsayılan UTC+3
  }

  /**
   * UTC tarihini settings'teki timezone'a dönüştürür
   * @param {Date|string} date - UTC tarih
   * @returns {Date} - Timezone'a göre ayarlanmış tarih
   */
  static toLocalTimezone(date) {
    if (!date) return null;
    
    const utcDate = new Date(date);
    const timezone = settingsService.getTimezone();
    
    try {
      // Intl.DateTimeFormat kullanarak timezone dönüşümü
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      const parts = formatter.formatToParts(utcDate);
      const partsObj = parts.reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
      }, {});
      
      // ISO format'ta birleştir
      const localDateString = `${partsObj.year}-${partsObj.month}-${partsObj.day}T${partsObj.hour}:${partsObj.minute}:${partsObj.second}`;
      
      return new Date(localDateString);
      
    } catch (error) {
      console.warn('Timezone conversion failed, returning UTC date:', error.message);
      return utcDate;
    }
  }

  /**
   * Tarih objesini settings'teki timezone'da ISO string'e dönüştürür
   * @param {Date|string} date - UTC tarih
   * @returns {string} - Timezone'a göre formatlanmış string
   */
  static toLocalISOString(date) {
    if (!date) return null;
    
    const timezone = this.getCurrentTimezone();
    const utcDate = new Date(date);
    
    try {
      // Local timezone'da tarihi formatla
      const localFormatter = new Intl.DateTimeFormat('sv-SE', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      const localTimeString = localFormatter.format(utcDate);
      // sv-SE format: YYYY-MM-DD HH:mm:ss
      const [datePart, timePart] = localTimeString.split(' ');
      
      // ISO benzeri format ama local timezone göstergesi ile
      const offset = this.getTimezoneOffset();
      return `${datePart}T${timePart}${offset}`;
      
    } catch (error) {
      console.warn('Local date formatting failed:', error.message);
      return utcDate.toISOString(); // Fallback
    }
  }

  /**
   * Tarih objesini kullanıcı dostu formatta döndürür
   * @param {Date|string} date - UTC tarih
   * @returns {string} - Formatlanmış tarih string'i
   */
  static formatForUser(date) {
    if (!date) return null;
    
    const utcDate = new Date(date);
    const timezone = settingsService.getTimezone();
    const dateFormat = settingsService.getDateFormat();
    const timeFormat = settingsService.getTimeFormat();
    
    try {
      const options = {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: timeFormat === '12' // 12 saat formatı kontrol
      };
      
      const formatter = new Intl.DateTimeFormat('tr-TR', options);
      return formatter.format(utcDate);
      
    } catch (error) {
      console.warn('Date formatting failed:', error.message);
      return utcDate.toLocaleString('tr-TR', { timeZone: timezone });
    }
  }

  /**
   * Bir nesnenin içindeki tüm date alanlarını local timezone'a dönüştürür
   * @param {Object} obj - İşlenecek obje
   * @param {Array} dateFields - Date olarak işlenecek alan isimleri
   * @returns {Object} - İşlenmiş obje
   */
  static convertObjectDates(obj, dateFields = ['updatedAt', 'lastUpdated', 'timestamp', 'lastUpdate', 'lastCheckedAt']) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const converted = { ...obj };
    
    dateFields.forEach(field => {
      if (converted[field]) {
        converted[field] = this.toLocalISOString(converted[field]);
      }
    });
    
    // Nested objects kontrolü (dailyStats.date gibi)
    if (converted.dailyStats && converted.dailyStats.date) {
      converted.dailyStats.date = this.toLocalISOString(converted.dailyStats.date);
    }
    
    // API için gereksiz alanları kaldır
    if (converted.sourceData) {
      delete converted.sourceData;
    }
    
    // createdAt'i API'den kaldır
    if (converted.createdAt) {
      delete converted.createdAt;
    }
    
    return converted;
  }

  /**
   * Sources endpoint için özel filtreleme
   * @param {Object} obj - Source objesi
   * @returns {Object} - Filtrelenmiş source objesi
   */
  static filterSourceForApi(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const filtered = {
      id: obj._id,
      name: obj.name,
      displayName: obj.displayName,
      url: obj.url,
      category: obj.category,
      isActive: obj.isActive,
      updatedAt: obj.updatedAt ? this.toLocalISOString(obj.updatedAt) : null
    };
    
    return filtered;
  }

  /**
   * Array içindeki tüm objelerin date alanlarını dönüştürür
   * @param {Array} array - İşlenecek array
   * @param {Array} dateFields - Date olarak işlenecek alan isimleri
   * @returns {Array} - İşlenmiş array
   */
  static convertArrayDates(array, dateFields = ['createdAt', 'updatedAt', 'lastUpdated', 'timestamp', 'lastUpdate', 'lastCheckedAt']) {
    if (!Array.isArray(array)) return array;
    
    return array.map(item => this.convertObjectDates(item, dateFields));
  }

  /**
   * Şu anki zamanı local timezone'da döndürür
   * @returns {Date} - Local timezone'daki şu anki zaman
   */
  static now() {
    return this.toLocalTimezone(new Date());
  }

  /**
   * UTC tarihini local timezone'da timestamp olarak döndürür
   * @param {Date|string} date - UTC tarih
   * @returns {number} - Unix timestamp
   */
  static toLocalTimestamp(date) {
    const localDate = this.toLocalTimezone(date);
    return localDate ? localDate.getTime() : null;
  }

  /**
   * İki tarih arasındaki farkı hesaplar (local timezone'da)
   * @param {Date|string} startDate - Başlangıç tarihi
   * @param {Date|string} endDate - Bitiş tarihi
   * @returns {Object} - Fark bilgileri
   */
  static timeDifference(startDate, endDate) {
    const start = this.toLocalTimezone(startDate);
    const end = this.toLocalTimezone(endDate || new Date());
    
    if (!start || !end) return null;
    
    const diffMs = end.getTime() - start.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    return {
      milliseconds: diffMs,
      seconds: diffSeconds,
      minutes: diffMinutes,
      hours: diffHours,
      days: diffDays,
      humanReadable: this.humanReadableTimeDiff(diffMs)
    };
  }

  /**
   * Zaman farkını insan tarafından okunabilir formata dönüştürür
   * @param {number} diffMs - Milisaniye cinsinden fark
   * @returns {string} - Okunabilir zaman farkı
   */
  static humanReadableTimeDiff(diffMs) {
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} gün önce`;
    if (hours > 0) return `${hours} saat önce`;
    if (minutes > 0) return `${minutes} dakika önce`;
    if (seconds > 0) return `${seconds} saniye önce`;
    return 'şimdi';
  }

  /**
   * Timezone bilgisini döndürür
   * @returns {string} - Mevcut timezone
   */
  static getCurrentTimezone() {
    return settingsService.getTimezone();
  }

  /**
   * Timezone'un UTC offset'ini döndürür
   * @returns {string} - UTC offset (+03:00 formatında)
   */
  static getTimezoneOffset() {
    const timezone = this.getCurrentTimezone();
    
    // İstanbul timezone'u için sabit değer döndür (DST dahil)
    if (timezone === 'Europe/Istanbul') {
      const now = new Date();
      const januaryOffset = new Date(now.getFullYear(), 0, 1).getTimezoneOffset();
      const julyOffset = new Date(now.getFullYear(), 6, 1).getTimezoneOffset();
      const isDST = now.getTimezoneOffset() < Math.max(januaryOffset, julyOffset);
      return isDST ? '+03:00' : '+03:00'; // İstanbul her zaman +03:00
    }
    
    try {
      // Diğer timezone'lar için hesaplama
      const now = new Date();
      const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
      const targetDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
      
      const offsetMs = targetDate.getTime() - utcDate.getTime();
      const offsetHours = offsetMs / (1000 * 60 * 60);
      
      const sign = offsetHours >= 0 ? '+' : '-';
      const absHours = Math.abs(offsetHours);
      const hours = Math.floor(absHours);
      const minutes = Math.round((absHours - hours) * 60);
      
      return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      
    } catch (error) {
      console.warn('Timezone offset calculation failed:', error.message);
      return '+03:00'; // İstanbul varsayılanı
    }
  }

  /**
   * Timezone'un UTC'den farkını milisaniye olarak döndürür
   * @param {string} timezone - Timezone adı
   * @returns {number} - Milisaniye cinsinden fark
   */
  static getTimezoneOffsetMs(timezone) {
    const now = new Date();
    const utc = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
    
    const targetFormatter = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const utcFormatter = new Intl.DateTimeFormat('en', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const targetTime = new Date(targetFormatter.format(now).replace(/(\d+)\/(\d+)\/(\d+),?\s+/, '$3-$1-$2 '));
    const utcTime = new Date(utcFormatter.format(now).replace(/(\d+)\/(\d+)\/(\d+),?\s+/, '$3-$1-$2 '));
    
    return targetTime.getTime() - utcTime.getTime();
  }

  /**
   * Handlebars helper olarak kullanılacak formatlar
   */
  static getHandlebarsHelpers() {
    return {
      formatDateTime: (date, format) => this.formatDateTime(date, format),
      formatDate: (date) => this.formatDate(date),
      formatDateTimeLong: (date) => this.formatDateTimeLong(date),
      formatRelative: (date) => this.formatRelative(date)
    };
  }

  /**
   * Şu anki tarihi ayarlanan timezone'da döndürür
   * @returns {Date}
   */
  static nowMoment() {
    const timezone = settingsService.getTimezone() || 'Europe/Istanbul';
    const language = settingsService.getLanguage() || 'tr';
    
    moment.locale(language);
    
    if (timezone === 'UTC') {
      return moment().toDate();
    }
    
    return moment().utcOffset(this.getTimezoneOffsetMinutes(timezone)).toDate();
  }

  /**
   * new Date() yerine kullanılacak ana metod
   * @returns {Date}
   */
  static createDate() {
    return this.nowMoment();
  }

  /**
   * MongoDB için şu anki zamanı döndürür (JmonSettings için)
   * @returns {Date}
   */
  static getNow() {
    return new Date();
  }

  /**
   * MongoDB için timezone-aware tarih oluşturur
   * MongoDB UTC olarak saklasa da, local timezone saatini UTC gibi kaydeder
   * @returns {Date} - Local timezone saatini UTC olarak gösteren Date objesi
   */
  static createDateForDatabase() {
    const timezone = settingsService.getTimezone() || 'Europe/Istanbul';
    
    try {
      // Şu anki UTC zamanını al
      const now = new Date();
      
      // Local timezone'daki zamanı string olarak al
      const localTimeString = now.toLocaleString('sv-SE', { 
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      // Local time string'ini UTC Date objesi olarak oluştur
      // Bu sayede MongoDB'de local saat UTC gibi görünecek
      const localAsUtc = new Date(localTimeString + 'Z');
      
      return localAsUtc;
      
    } catch (error) {
      console.warn('Database date creation failed, using UTC:', error.message);
      return new Date(); // Fallback
    }
  }
}

module.exports = DateHelper;