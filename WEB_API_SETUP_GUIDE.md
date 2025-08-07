# Gold Dashboard Web API - Setup & Integration Guide

## Overview

Bu proje, mevcut Gold Server API'sine entegre edilecek yeni bir multi-user dashboard sistemi sunar. Kullanıcılar kendi dashboard'larını oluşturabilir, özel ürün formülleri tanımlayabilir ve widget'lar ile verilerini görselleştirebilir.

## Architecture

```
Gold Server (Existing)
├── Current API (/api/*)
├── Admin Panel (/admin/*)
└── NEW: Web API (/web-api/*)
    ├── Authentication
    ├── User Management
    ├── Dashboard System
    ├── Widget System
    ├── Custom Products
    ├── Media Management
    └── Admin Panel
```

## New Components Added

### 1. Database Models (jmon_ prefix)

- **JmonUser**: Dashboard kullanıcıları (ApiToken'ı genişletir)
- **JmonDashboard**: Kullanıcı dashboard'ları
- **JmonWidget**: Dashboard widget'ları
- **JmonUserProduct**: Özel ürün tanımları
- **JmonUserMedia**: Medya dosyaları

### 2. Services

- **FormulaCalculator**: Özel ürün formül hesaplayıcısı
- **UploadMiddleware**: Dosya yükleme ve işleme

### 3. API Routes

- **/web-api/auth/**: Kimlik doğrulama
- **/web-api/user/**: Kullanıcı ve dashboard yönetimi
- **/web-api/widgets/**: Widget yönetimi
- **/web-api/products/**: Özel ürün yönetimi
- **/web-api/media/**: Medya dosyası yönetimi
- **/web-api/admin/**: Admin panel

## Installation & Setup

### 1. Dependencies

Yeni bağımlılıklar package.json'a eklenmelidir:

```bash
npm install --save bcryptjs jsonwebtoken multer sharp
```

### 2. Server Integration

Ana server.js dosyasına web-api routes'unu ekleyin:

```javascript
// server.js'ye eklenecek kod
const createWebApiRoutes = require('./routes/webApiRoutes');

// Mevcut routes'lardan sonra
app.use('/web-api', createWebApiRoutes(db));
```

### 3. Environment Variables

.env dosyasına eklenecek:

```env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h

# File Upload Configuration
MAX_FILE_SIZE=100MB
UPLOAD_PATH=./uploads

# Dashboard Configuration
DEFAULT_THEME=light
DEFAULT_LANGUAGE=tr
```

### 4. Directory Structure

Yeni klasörler oluşturun:

```
project/
├── models/
│   ├── JmonUser.js
│   ├── JmonDashboard.js
│   ├── JmonWidget.js
│   ├── JmonUserProduct.js
│   └── JmonUserMedia.js
├── routes/
│   ├── webApiRoutes.js (main)
│   ├── webApiAuthRoutes.js
│   ├── webApiUserRoutes.js
│   ├── webApiWidgetRoutes.js
│   ├── webApiProductRoutes.js
│   ├── webApiMediaRoutes.js
│   └── webApiAdminRoutes.js
├── services/
│   └── FormulaCalculator.js
├── middleware/
│   └── uploadMiddleware.js
└── uploads/ (otomatik oluşturulacak)
    └── user{id}/
```

## API Usage Examples

### 1. User Authentication

```javascript
// Login
const response = await fetch('/web-api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'demo_user',
    password: 'password123'
  })
});

const { data } = await response.json();
const token = data.token; // JWT token
```

### 2. Dashboard Management

```javascript
// Create Dashboard
const dashboard = await fetch('/web-api/user/dashboards', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Ana Dashboard',
    themeConfig: {
      darkMode: false,
      primaryColor: '#1976d2'
    },
    gridConfig: {
      cols: 12,
      rowHeight: 60
    }
  })
});
```

### 3. Widget Creation

```javascript
// Add Price List Widget
const widget = await fetch('/web-api/widgets', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    dashboardId: 'dashboard_id_here',
    widgetType: 'price-list',
    positionConfig: { x: 0, y: 0, w: 6, h: 4 },
    widgetConfig: {
      title: 'Anlık Fiyatlar',
      symbols: ['HAS/TRY', 'USD/TRY', 'EUR/TRY'],
      refreshInterval: 5000
    }
  })
});
```

### 4. Custom Product Formula

```javascript
// Create Custom Product
const product = await fetch('/web-api/products', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: '22 Ayar Altın Alış',
    formula: 'HAS/TRY_buying * 0.916',
    baseSymbol: 'HAS/TRY',
    displayConfig: {
      decimalPlaces: 2,
      suffix: ' ₺'
    }
  })
});

// Calculate Product Value
const calculation = await fetch(`/web-api/products/${product.id}/calculate`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### 5. File Upload

```javascript
// Upload Image
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('title', 'Logo');
formData.append('tags', JSON.stringify(['logo', 'brand']));

const media = await fetch('/web-api/media/upload', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});
```

## Admin Panel Integration

### 1. User Management

Mevcut admin panel'e JmonUser yönetimi ekleyin:

```javascript
// Admin routes'a eklenecek
router.get('/jmon-users', async (req, res) => {
  // JmonUser listesi
});

router.post('/jmon-users', async (req, res) => {
  // Yeni JmonUser oluştur
});
```

### 2. Admin Views

Yeni admin sayfaları:

- `/admin/jmon-users`: Dashboard kullanıcı listesi
- `/admin/jmon-users/new`: Yeni kullanıcı oluştur
- `/admin/jmon-users/:id`: Kullanıcı detayı
- `/admin/jmon-stats`: Dashboard sistem istatistikleri

## Formula System

### Supported Variables

- `SYMBOL_buying`: Alış fiyatı
- `SYMBOL_selling`: Satış fiyatı
- `SYMBOL_last`: Son fiyat
- `SYMBOL_avg`: Ortalama fiyat

### Supported Symbols

- `HAS/TRY`: Has Altın
- `USD/TRY`: Dolar
- `EUR/TRY`: Euro
- `GBP/TRY`: Sterlin
- `XAU/USD`: Altın/Dolar

### Formula Examples

```javascript
// 22 Ayar Altın
'HAS/TRY_buying * 0.916'

// Komisyonlu Altın
'HAS/TRY_last * 0.995 - 5'

// Döviz Ortalaması
'(USD/TRY_buying + USD/TRY_selling) / 2'

// Çeyrek Altın
'HAS/TRY_avg * 1.75'
```

## Widget Types

### 1. Price List
- Anlık fiyat listesi
- Alış-satış gösterimi
- Değişim yüzdesi
- Renk kodlaması

### 2. Calculator
- Fiyat hesaplayıcı
- Çarpan girişi
- Sonuç formatı

### 3. Chart
- Fiyat geçmişi grafiği
- Çizgi/Bar/Alan grafikleri
- Zaman aralığı seçimi

### 4. Custom Product
- Özel ürün widget'ı
- Formül gösterimi
- Anlık hesaplama

### 5. Text/Image
- Metin içeriği
- Resim gösterimi
- HTML desteği

## Security Features

### 1. Authentication
- JWT token tabanlı
- Token refresh mekanizması
- Session yönetimi

### 2. Authorization
- Kullanıcı bazlı erişim
- Admin yetki kontrolü
- Domain bazlı kısıtlama

### 3. File Upload Security
- Dosya tipi kontrolü
- Boyut sınırlaması
- Virus tarama (basit)
- Güvenli dosya adları

### 4. Formula Security
- Güvenli eval alternatifi
- Formül doğrulama
- Zararlı kod kontrolü

## Performance Considerations

### 1. Caching
- Hesaplanmış ürün değerleri
- Fiyat verileri cache
- Media file cache headers

### 2. Database Indexing
- Kullanıcı bazlı indexler
- Arama optimizasyonu
- Compound indexler

### 3. File Management
- Otomatik thumbnail oluşturma
- Resim optimizasyonu
- Unused file cleanup

## Backup Compatibility

### Existing API Compatibility
- Mevcut `/api/*` endpoints korunur
- Token sistemi genişletilir
- WebSocket kanalları korunur

### Data Migration
- ApiToken → JmonUser migration script gerekebilir
- Mevcut kullanıcı verileri korunur

## Testing

### API Testing

```bash
# Health check
curl http://localhost:6701/web-api/health

# Login test
curl -X POST http://localhost:6701/web-api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}'

# Dashboard list
curl http://localhost:6701/web-api/user/dashboards \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Formula Testing

```javascript
const FormulaCalculator = require('./services/FormulaCalculator');
const calculator = new FormulaCalculator();

// Test formula
const result = calculator.calculate(
  'HAS/TRY_buying * 0.916',
  { 'HAS/TRY': { buying: 2500.50, selling: 2501.25 } }
);

console.log(result.value); // 2288.458
```

## Deployment Checklist

- [ ] Install new dependencies
- [ ] Add environment variables
- [ ] Create upload directories
- [ ] Update server.js with web-api routes
- [ ] Add admin panel views for JmonUser
- [ ] Test authentication flow
- [ ] Test dashboard creation
- [ ] Test widget functionality
- [ ] Test formula calculations
- [ ] Test file uploads
- [ ] Configure CORS for frontend
- [ ] Set up SSL for production
- [ ] Configure database backups

## Support & Maintenance

### Logs
- Authentication attempts
- API usage statistics
- Formula calculation errors
- File upload activities
- Admin operations

### Monitoring
- User activity tracking
- Performance metrics
- Error rates
- Storage usage

### Troubleshooting
- Check JWT token validity
- Verify user permissions
- Validate formula syntax
- Check file upload limits
- Monitor database connections

---

**Created by**: Claude AI Assistant  
**Date**: 2024  
**Version**: 1.0.0