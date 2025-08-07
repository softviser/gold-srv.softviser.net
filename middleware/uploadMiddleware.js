const multer = require('multer');
const path = require('path');
const fs = require('fs');
const LoggerHelper = require('../utils/logger');

// Sharp'ı opsiyonel olarak yükle
let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  LoggerHelper.warn('Sharp module could not be loaded. Image processing will be disabled.', error);
  sharp = null;
}

// Desteklenen dosya tipleri
const ALLOWED_FILE_TYPES = {
  image: {
    mimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    maxSize: 10 * 1024 * 1024 // 10MB
  },
  document: {
    mimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ],
    extensions: ['.pdf', '.doc', '.docx', '.txt'],
    maxSize: 50 * 1024 * 1024 // 50MB
  },
  video: {
    mimeTypes: ['video/mp4', 'video/avi', 'video/mov', 'video/wmv'],
    extensions: ['.mp4', '.avi', '.mov', '.wmv'],
    maxSize: 100 * 1024 * 1024 // 100MB
  }
};

// Dosya depolama konfigürasyonu
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      const userId = req.user ? req.user.userId : 'temp';
      const uploadDir = path.join(__dirname, '..', 'uploads', `user${userId}`);
      
      // Klasör yoksa oluştur
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      cb(null, uploadDir);
    } catch (error) {
      LoggerHelper.error('Upload destination error:', error);
      cb(error, null);
    }
  },
  
  filename: function (req, file, cb) {
    try {
      // Dosya adını güvenli hale getir
      const sanitizedOriginalName = file.originalname
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .replace(/_{2,}/g, '_');
      
      // Benzersiz dosya adı oluştur
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const extension = path.extname(sanitizedOriginalName);
      const basename = path.basename(sanitizedOriginalName, extension);
      
      const fileName = `${basename}_${timestamp}_${random}${extension}`;
      
      cb(null, fileName);
    } catch (error) {
      LoggerHelper.error('Upload filename error:', error);
      cb(error, null);
    }
  }
});

// Dosya filtreleme
const fileFilter = (req, file, cb) => {
  try {
    const fileType = getFileTypeFromMime(file.mimetype);
    
    if (!fileType) {
      return cb(new Error('Desteklenmeyen dosya tipi'), false);
    }
    
    const config = ALLOWED_FILE_TYPES[fileType];
    
    // MIME type kontrolü
    if (!config.mimeTypes.includes(file.mimetype)) {
      return cb(new Error(`${fileType} dosyası için desteklenmeyen format`), false);
    }
    
    // Extension kontrolü
    const extension = path.extname(file.originalname).toLowerCase();
    if (!config.extensions.includes(extension)) {
      return cb(new Error(`${extension} uzantısı desteklenmiyor`), false);
    }
    
    // Dosya adı güvenlik kontrolü
    if (file.originalname.length > 255) {
      return cb(new Error('Dosya adı çok uzun'), false);
    }
    
    // Zararlı dosya adı kontrolü
    const dangerousPatterns = [
      /\.exe$/i, /\.bat$/i, /\.cmd$/i, /\.scr$/i, /\.com$/i,
      /\.pif$/i, /\.vbs$/i, /\.js$/i, /\.jar$/i, /\.php$/i
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(file.originalname)) {
        return cb(new Error('Güvenlik nedeniyle bu dosya tipi yüklenemez'), false);
      }
    }
    
    req.fileType = fileType;
    cb(null, true);
    
  } catch (error) {
    LoggerHelper.error('File filter error:', error);
    cb(error, false);
  }
};

// Multer konfigürasyonu
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max (dinamik olarak kontrol edilecek)
    files: 10, // Maksimum 10 dosya
    parts: 20 // Form field limiti
  }
});

// Dosya boyutu kontrolü middleware
const checkFileSize = (req, res, next) => {
  try {
    if (!req.file && !req.files) {
      return next();
    }
    
    const files = req.files || [req.file];
    const fileType = req.fileType;
    
    if (!fileType || !ALLOWED_FILE_TYPES[fileType]) {
      return res.status(400).json({
        success: false,
        error: 'Desteklenmeyen dosya tipi'
      });
    }
    
    const maxSize = ALLOWED_FILE_TYPES[fileType].maxSize;
    
    for (const file of files) {
      if (file.size > maxSize) {
        // Yüklenen dosyayı sil
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        
        return res.status(400).json({
          success: false,
          error: `Dosya boyutu ${Math.round(maxSize / 1024 / 1024)}MB'ı aşamaz`
        });
      }
    }
    
    next();
  } catch (error) {
    LoggerHelper.error('Check file size error:', error);
    res.status(500).json({
      success: false,
      error: 'Dosya boyutu kontrolü başarısız'
    });
  }
};

// Resim işleme middleware
const processImage = async (req, res, next) => {
  try {
    if (!req.file || req.fileType !== 'image') {
      return next();
    }
    
    // Sharp yoksa resim işlemeyi atla
    if (!sharp) {
      LoggerHelper.info('Image processing skipped - sharp module not available');
      return next();
    }
    
    const file = req.file;
    const inputPath = file.path;
    
    try {
      // Resim metadata'sını al
      const metadata = await sharp(inputPath).metadata();
      
      req.imageMetadata = {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: metadata.size,
        channels: metadata.channels,
        density: metadata.density
      };
      
      // Büyük resimleri otomatik olarak yeniden boyutlandır
      if (metadata.width > 2048 || metadata.height > 2048) {
        const outputPath = inputPath.replace(/(\.[^.]+)$/, '_resized$1');
        
        await sharp(inputPath)
          .resize(2048, 2048, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({
            quality: 85,
            progressive: true
          })
          .toFile(outputPath);
        
        // Orijinal dosyayı sil ve yenisini kullan
        fs.unlinkSync(inputPath);
        fs.renameSync(outputPath, inputPath);
        
        // Metadata'yı güncelle
        const newMetadata = await sharp(inputPath).metadata();
        req.imageMetadata = {
          ...req.imageMetadata,
          width: newMetadata.width,
          height: newMetadata.height,
          size: newMetadata.size,
          resized: true
        };
      }
      
      // Thumbnail oluştur
      const thumbnailDir = path.join(path.dirname(inputPath), 'thumbnails');
      if (!fs.existsSync(thumbnailDir)) {
        fs.mkdirSync(thumbnailDir, { recursive: true });
      }
      
      const thumbnailPath = path.join(thumbnailDir, `thumb_${file.filename}`);
      
      await sharp(inputPath)
        .resize(300, 300, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({
          quality: 80
        })
        .toFile(thumbnailPath);
      
      req.thumbnailPath = thumbnailPath;
      
    } catch (imageError) {
      LoggerHelper.error('Image processing error:', imageError);
      // Resim işleme hatası varsa devam et ama metadata'yı boş bırak
      req.imageMetadata = null;
    }
    
    next();
    
  } catch (error) {
    LoggerHelper.error('Process image error:', error);
    res.status(500).json({
      success: false,
      error: 'Resim işleme başarısız'
    });
  }
};

// Virus tarama middleware (basit)
const scanForVirus = (req, res, next) => {
  try {
    if (!req.file) {
      return next();
    }
    
    const file = req.file;
    const filePath = file.path;
    
    // Basit virus imzası kontrolü
    const dangerousSignatures = [
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*', // EICAR test
      'MZ', // PE executable
      'PK', // ZIP-based files (potansiyel risk)
    ];
    
    try {
      const buffer = fs.readFileSync(filePath, { encoding: null });
      const fileHeader = buffer.toString('ascii', 0, 100);
      
      for (const signature of dangerousSignatures) {
        if (fileHeader.includes(signature)) {
          // Şüpheli dosyayı sil
          fs.unlinkSync(filePath);
          
          return res.status(400).json({
            success: false,
            error: 'Güvenlik taraması başarısız - dosya yüklenemez'
          });
        }
      }
      
    } catch (scanError) {
      LoggerHelper.error('Virus scan error:', scanError);
      // Tarama hatası varsa devam et
    }
    
    next();
    
  } catch (error) {
    LoggerHelper.error('Scan for virus error:', error);
    res.status(500).json({
      success: false,
      error: 'Güvenlik taraması başarısız'
    });
  }
};

// Yardımcı fonksiyonlar
function getFileTypeFromMime(mimeType) {
  for (const [type, config] of Object.entries(ALLOWED_FILE_TYPES)) {
    if (config.mimeTypes.includes(mimeType)) {
      return type;
    }
  }
  return null;
}

function getFileType(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  
  for (const [type, config] of Object.entries(ALLOWED_FILE_TYPES)) {
    if (config.extensions.includes(extension)) {
      return type;
    }
  }
  
  return 'unknown';
}

// Export edilecek middleware chain'ler
const uploadSingle = (fieldName = 'file') => [
  upload.single(fieldName),
  checkFileSize,
  scanForVirus,
  processImage
];

const uploadMultiple = (fieldName = 'files', maxCount = 10) => [
  upload.array(fieldName, maxCount),
  checkFileSize,
  scanForVirus,
  processImage
];

const uploadFields = (fields) => [
  upload.fields(fields),
  checkFileSize,
  scanForVirus,
  processImage
];

// Dosya silme helper
const deleteFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      
      // Thumbnail varsa onu da sil
      const dir = path.dirname(filePath);
      const filename = path.basename(filePath);
      const thumbnailPath = path.join(dir, 'thumbnails', `thumb_${filename}`);
      
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
      }
      
      return true;
    }
    return false;
  } catch (error) {
    LoggerHelper.error('Delete file error:', error);
    return false;
  }
};

// Klasör temizleme helper
const cleanupUserDirectory = (userId) => {
  try {
    const userDir = path.join(__dirname, '..', 'uploads', `user${userId}`);
    
    if (fs.existsSync(userDir)) {
      const files = fs.readdirSync(userDir, { withFileTypes: true });
      
      for (const file of files) {
        const filePath = path.join(userDir, file.name);
        
        if (file.isDirectory()) {
          // Alt klasörleri recursive temizle
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
      }
      
      // Boş klasörü sil
      fs.rmdirSync(userDir);
      return true;
    }
    
    return false;
  } catch (error) {
    LoggerHelper.error('Cleanup user directory error:', error);
    return false;
  }
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  uploadFields,
  deleteFile,
  cleanupUserDirectory,
  getFileType,
  ALLOWED_FILE_TYPES
};