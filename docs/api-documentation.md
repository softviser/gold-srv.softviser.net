# API Dokümantasyonu

## Genel Bilgiler

Bu API, altın ve döviz fiyatlarına erişim sağlayan RESTful bir servistir.

### Base URL
```
https://your-domain.com/api
```

### Authentication
Tüm endpoint'ler (info hariç) API token gerektirir.

#### Bearer Token
```
Authorization: Bearer sk_your_token_here
```

#### Query Parameter
```
GET /api/prices/current?token=sk_your_token_here
```

## Endpoints

### 1. API Bilgileri

#### GET /api/info
API hakkında genel bilgileri döndürür.

**Authentication:** Gerekli değil

**Response:**
```json
{
  "name": "Gold Server API",
  "version": "1.0.0",
  "description": "Altın ve döviz fiyatları API",
  "documentation": "/docs",
  "endpoints": {
    "prices": {
      "current": "/api/prices/current",
      "history": "/api/prices/history",
      "symbols": "/api/prices/symbols"
    },
    "sources": {
      "list": "/api/sources",
      "data": "/api/sources/:sourceId/data"
    }
  },
  "authentication": "Bearer token required",
  "timezone": {
    "name": "Europe/Istanbul",
    "offset": "+03:00",
    "current_time": "2025-01-22T15:30:00+03:00"
  }
}
```

---

### 2. Güncel Fiyatlar

#### GET /api/prices/current
Tüm aktif güncel fiyatları döndürür.

**Authentication:** `read` permission gerekli

**Query Parameters:**
- `source` (string, optional): Kaynak filtresi
- `symbol` (string, optional): Sembol filtresi (regex destekli)
- `category` (string, optional): Kategori filtresi
- `currency` (string, optional): Para birimi filtresi

**Example Request:**
```bash
curl -H "Authorization: Bearer sk_your_token" \
     "https://your-domain.com/api/prices/current?source=altinkaynak"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "symbol": "USD/TRY",
      "buyPrice": 34.25,
      "sellPrice": 34.35,
      "source": "altinkaynak",
      "changePercent": {
        "buy": 0.15,
        "sell": 0.12
      },
      "updatedAt": "2025-01-22T15:30:00+03:00"
    }
  ],
  "count": 1,
  "filters": { "source": "altinkaynak" },
  "timezone": {
    "name": "Europe/Istanbul",
    "current_time": "2025-01-22T15:30:00+03:00"
  }
}
```

#### GET /api/prices/current/:symbol
Belirli bir sembol için güncel fiyat döndürür.

**Authentication:** `read` permission gerekli

**Parameters:**
- `symbol` (string): Para birimi sembolü (örn: USD/TRY)

**Query Parameters:**
- `source` (string, optional): Kaynak filtresi

**Example Request:**
```bash
curl -H "Authorization: Bearer sk_your_token" \
     "https://your-domain.com/api/prices/current/USD/TRY"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "USD/TRY",
    "buyPrice": 34.25,
    "sellPrice": 34.35,
    "source": "altinkaynak",
    "changePercent": {
      "buy": 0.15,
      "sell": 0.12
    },
    "updatedAt": "2025-01-22T15:30:00+03:00"
  },
  "timezone": {
    "name": "Europe/Istanbul",
    "current_time": "2025-01-22T15:30:00+03:00"
  }
}
```

#### GET /api/prices/symbols
Aktif sembollerin listesini döndürür.

**Authentication:** `read` permission gerekli

**Query Parameters:**
- `source` (string, optional): Kaynak filtresi
- `category` (string, optional): Kategori filtresi

**Response:**
```json
{
  "success": true,
  "data": ["USD/TRY", "EUR/TRY", "HAS/TRY"],
  "count": 3,
  "timezone": {
    "name": "Europe/Istanbul",
    "current_time": "2025-01-22T15:30:00+03:00"
  }
}
```

---

### 3. Fiyat Geçmişi

#### GET /api/prices/history/:symbol
Belirli bir sembol için fiyat geçmişini döndürür.

**Authentication:** `read` permission gerekli

**Parameters:**
- `symbol` (string): Para birimi sembolü

**Query Parameters:**
- `source` (string, optional): Kaynak filtresi
- `startDate` (string, optional): Başlangıç tarihi (ISO 8601)
- `endDate` (string, optional): Bitiş tarihi (ISO 8601)
- `limit` (number, optional): Maksimum kayıt sayısı (default: 100)
- `interval` (string, optional): Interval (hour, day, week, month)

**Example Request:**
```bash
curl -H "Authorization: Bearer sk_your_token" \
     "https://your-domain.com/api/prices/history/USD/TRY?limit=50&interval=hour"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "symbol": "USD/TRY",
      "buyPrice": 34.25,
      "sellPrice": 34.35,
      "source": "altinkaynak",
      "timestamp": "2025-01-22T15:00:00+03:00"
    }
  ],
  "count": 1,
  "symbol": "USD/TRY",
  "filters": {
    "limit": 50,
    "interval": "hour"
  },
  "timezone": {
    "name": "Europe/Istanbul",
    "current_time": "2025-01-22T15:30:00+03:00"
  }
}
```

---

### 4. Veri Kaynakları

#### GET /api/sources
Veri kaynaklarının listesini döndürür.

**Authentication:** `read` permission gerekli

**Query Parameters:**
- `isActive` (boolean, optional): Aktif/pasif filtresi (default: true)
- `category` (string, optional): Kategori filtresi
- `type` (string, optional): Tip filtresi

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "name": "altinkaynak",
      "displayName": "Altın Kaynak",
      "type": "scraping",
      "category": "gold_dealer",
      "isActive": true,
      "url": "https://altinkaynak.com"
    }
  ],
  "count": 1,
  "timezone": {
    "name": "Europe/Istanbul",
    "current_time": "2025-01-22T15:30:00+03:00"
  }
}
```

#### GET /api/sources/:sourceId/data
Belirli bir kaynak için güncel verileri döndürür.

**Authentication:** `read` permission gerekli

**Parameters:**
- `sourceId` (string): Kaynak ID'si

**Query Parameters:**
- `limit` (number, optional): Maksimum kayıt sayısı (default: 50)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "symbol": "USD/TRY",
      "buyPrice": 34.25,
      "sellPrice": 34.35,
      "source": "altinkaynak",
      "updatedAt": "2025-01-22T15:30:00+03:00"
    }
  ],
  "count": 1,
  "sourceId": "altinkaynak",
  "timezone": {
    "name": "Europe/Istanbul",
    "current_time": "2025-01-22T15:30:00+03:00"
  }
}
```

---

### 5. WebSocket Bağlantısı

#### GET /api/websocket/info
WebSocket bağlantı bilgilerini döndürür.

**Authentication:** `read` permission gerekli

**Response:**
```json
{
  "success": true,
  "websocket": {
    "url": "ws://your-domain.com",
    "authentication": "Token required in auth parameter",
    "channels": [
      "price",
      "system", 
      "alerts",
      "altinkaynak",
      "hakangold",
      "haremgold",
      "tcmb"
    ],
    "events": {
      "subscribe": "Kanala abone ol",
      "unsubscribe": "Kanaldan ayrıl",
      "price_update": "Fiyat güncellemesi",
      "anomaly_alert": "Anomali uyarısı"
    }
  }
}
```

#### WebSocket Kullanımı

**Bağlantı:**
```javascript
const socket = io('ws://your-domain.com', {
  auth: {
    token: 'sk_your_token_here'
  }
});
```

**Kanala Abone Olma:**
```javascript
socket.emit('subscribe', 'price');
```

**Fiyat Güncellemelerini Dinleme:**
```javascript
socket.on('price_update', (data) => {
  console.log('Fiyat güncellendi:', data);
});
```

---

### 6. İstatistikler

#### GET /api/stats
Sistem istatistiklerini döndürür.

**Authentication:** `admin` permission gerekli

**Response:**
```json
{
  "success": true,
  "data": {
    "prices": {
      "total": 150,
      "active": 142,
      "bySources": [
        { "_id": "altinkaynak", "count": 45 },
        { "_id": "haremgold", "count": 38 }
      ]
    },
    "sources": {
      "total": 6,
      "active": 5
    },
    "history": {
      "total": 25000,
      "last24h": 1200
    }
  },
  "timezone": {
    "name": "Europe/Istanbul",
    "current_time": "2025-01-22T15:30:00+03:00"
  }
}
```

---

## Hata Kodları

### 401 Unauthorized
```json
{
  "error": "Invalid token",
  "message": "Token not found or does not exist"
}
```

```json
{
  "error": "Token disabled", 
  "message": "This API token has been disabled by administrator"
}
```

```json
{
  "error": "Token expired",
  "message": "This token expired on 2025-01-22T15:30:00.000Z",
  "expiredAt": "2025-01-22T15:30:00.000Z"
}
```

### 403 Forbidden
```json
{
  "error": "Domain not allowed",
  "message": "This token is restricted to domain: example.com",
  "allowedDomain": "example.com",
  "yourDomain": "unauthorized.com"
}
```

```json
{
  "error": "Insufficient permissions",
  "message": "This endpoint requires 'admin' permission",
  "requiredPermission": "admin",
  "yourPermissions": ["read"]
}
```

### 429 Too Many Requests
```json
{
  "error": "Rate limit exceeded",
  "message": "Maximum 1000 requests per 60 seconds allowed",
  "rateLimit": {
    "requests": 1000,
    "window": 60,
    "remaining": 0,
    "resetTime": "2025-01-22T15:31:00.000Z"
  },
  "retryAfter": 25
}
```

### 404 Not Found
```json
{
  "error": "Symbol not found",
  "message": "No active price data found for symbol: XYZ/TRY",
  "symbol": "XYZ/TRY"
}
```

---

## Rate Limiting

API istekleriniz token bazında sınırlanır:

- Rate limit bilgileri response header'larında bulunur:
  - `X-RateLimit-Limit`: Maksimum istek sayısı
  - `X-RateLimit-Window`: Zaman penceresi (saniye)
  - `X-RateLimit-Remaining`: Kalan istek sayısı
  - `X-RateLimit-Reset`: Limit sıfırlanma zamanı

---

## Permissions

Token'lar şu izinlere sahip olabilir:

- `read`: Veri okuma izni
- `write`: Veri yazma izni (gelecekte eklenecek)
- `subscribe`: WebSocket abonelik izni
- `admin`: Yönetici izni (istatistikler vb.)
- `*`: Tüm izinler

---

## WebSocket Channels

Token'ınızın izin verdiği kanallara abone olabilirsiniz:

- `price`: Fiyat güncellemeleri
- `system`: Sistem bildirimleri
- `alerts`: Anomali uyarıları
- `altinkaynak`: Altın Kaynak verileri
- `hakangold`: Hakan Altın verileri
- `haremgold`: Harem Altın verileri
- `tcmb`: TCMB verileri
- `*`: Tüm kanallar

---

## SDK ve Örnekler

### JavaScript/Node.js
```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'https://your-domain.com/api',
  headers: {
    'Authorization': 'Bearer sk_your_token_here'
  }
});

// Güncel fiyatları al
const prices = await api.get('/prices/current');
console.log(prices.data);
```

### cURL
```bash
# Güncel fiyatları al
curl -H "Authorization: Bearer sk_your_token_here" \
     "https://your-domain.com/api/prices/current"

# Belirli sembol için fiyat
curl -H "Authorization: Bearer sk_your_token_here" \
     "https://your-domain.com/api/prices/current/USD/TRY"
```

### Python
```python
import requests

headers = {
    'Authorization': 'Bearer sk_your_token_here'
}

response = requests.get(
    'https://your-domain.com/api/prices/current',
    headers=headers
)

data = response.json()
print(data)
```