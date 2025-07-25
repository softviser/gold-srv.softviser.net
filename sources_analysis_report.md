# MongoDB Sources Collection Analizi ve API Güncellemeleri

## Sources Collection Durumu

MongoDB'daki `sources` collection'ında **6 adet source** bulunmaktadır:

### 1. TCMB (T.C. Merkez Bankası)
- **ObjectId:** `687d537c88abf1273ecaf39f`
- **Name:** tcmb
- **Type:** api
- **Status:** Aktif ✅
- **URL:** https://www.tcmb.gov.tr

### 2. Investing.com
- **ObjectId:** `687d537c88abf1273ecaf3a0`
- **Name:** investing_com
- **Type:** webscraping
- **Status:** Pasif ❌
- **URL:** https://tr.investing.com

### 3. AltınKaynak
- **ObjectId:** `687d679c8e03c87509d3edd6`
- **Name:** altinkaynak
- **Type:** api
- **Status:** Aktif ✅
- **URL:** https://altinkaynak.com

### 4. HakanGold (Hakan Altın)
- **ObjectId:** `687d7630bbd14de85a114ae8`
- **Name:** hakangold
- **Type:** websocket
- **Status:** Aktif ✅
- **URL:** https://hakanaltin.com

### 5. HaremGold (Harem Altın)
- **ObjectId:** `687d7bd957854b08834b744a`
- **Name:** haremgold
- **Type:** socketio
- **Status:** Aktif ✅
- **URL:** https://haremaltin.com

### 6. HaremGoldWeb (Harem Altın Web)
- **ObjectId:** `687d8a6e94075260a2698098`
- **Name:** haremgoldweb
- **Type:** api
- **Status:** Aktif ✅
- **URL:** https://haremaltin.com

## API Endpoints Güncellemeleri

### Yeni Eklenen Source-Specific Endpoints

Aşağıdaki endpoint'ler `routes/apiRoutes.js` dosyasına eklendi:

1. **HaremGold Fiyatları:**
   - Endpoint: `GET /api/prices/source/haremgold`
   - Source ID: `687d7bd957854b08834b744a`

2. **AltınKaynak Fiyatları:**
   - Endpoint: `GET /api/prices/source/altinkaynak`
   - Source ID: `687d679c8e03c87509d3edd6`

3. **HakanGold Fiyatları:**
   - Endpoint: `GET /api/prices/source/hakangold`
   - Source ID: `687d7630bbd14de85a114ae8`

4. **TCMB Fiyatları:**
   - Endpoint: `GET /api/prices/source/tcmb`
   - Source ID: `687d537c88abf1273ecaf39f`

5. **HaremGoldWeb Fiyatları:**
   - Endpoint: `GET /api/prices/source/haremgoldweb`
   - Source ID: `687d8a6e94075260a2698098`

### API Info Endpoint Güncellemesi

`/api/info` endpoint'i güncellenerek yeni source-specific endpoint'ler `endpoints.prices.by_source` altında listelendi.

### WebSocket Info Güncellemesi

`/api/websocket/info` endpoint'indeki kanal listesi güncellenerek her source için ObjectId bilgileri yorumlara eklendi.

## Doğru Kullanım

### API Çağrıları için Doğru Source ID'leri:

```javascript
// HaremGold
sourceId: '687d7bd957854b08834b744a'

// AltınKaynak  
sourceId: '687d679c8e03c87509d3edd6'

// HakanGold
sourceId: '687d7630bbd14de85a114ae8'

// TCMB
sourceId: '687d537c88abf1273ecaf39f'

// HaremGoldWeb
sourceId: '687d8a6e94075260a2698098'
```

### Örnek API Çağrıları:

```bash
# HaremGold fiyatları
GET /api/prices/source/haremgold
Authorization: Bearer YOUR_TOKEN

# AltınKaynak fiyatları  
GET /api/prices/source/altinkaynak
Authorization: Bearer YOUR_TOKEN

# Genel endpoint ile source filtreleme
GET /api/prices/current?source=687d7bd957854b08834b744a
Authorization: Bearer YOUR_TOKEN
```

## Sonuç

✅ **Tamamlanan İşlemler:**
- MongoDB sources collection'ı analiz edildi
- Tüm active source'ların ObjectId'leri belirlendi
- API routes'una source-specific endpoint'ler eklendi
- API info ve WebSocket info endpoint'leri güncellendi
- Doğru source ID mapping'leri oluşturuldu

🔧 **Artık Kullanılabilir:**
- Kaynak bazlı fiyat sorgulamaları
- Doğru ObjectId'ler ile API çağrıları
- Source-specific endpoint'ler
- Güncellenmiş API dokümantasyonu

Bu güncellemeler ile artık API endpoint'leri MongoDB'daki gerçek source ObjectId'leri ile doğru şekilde çalışacaktır.