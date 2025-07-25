# Fiyat Veri Kaynakları ve Tablo Yapıları

## 1. DÖVİZ KURLARI

### Hedef Kurlar:
- **USD/TRY** - Amerikan Doları
- **EUR/TRY** - Euro
- **GBP/TRY** - İngiliz Sterlini (varsa)
- **CHF/TRY** - İsviçre Frangı (varsa)
- **RUB/TRY** - Rus Rublesi (varsa)
- **SAR/TRY** - Suudi Arabistan Riyali (varsa)

### Veri Kaynakları:
1. **TCMB (Türkiye Cumhuriyet Merkez Bankası)**
   - URL: `https://www.tcmb.gov.tr/kurlar/`
   - Güvenilirlik: Yüksek
   - Güncelleme: Günlük (resmi kurlar)
   - API: XML/JSON formatında

2. **ExchangeRate-API**
   - URL: `https://v6.exchangerate-api.com/`
   - Güvenilirlik: Yüksek
   - Güncelleme: Gerçek zamanlı
   - API: JSON REST API
   - Limit: 1500 request/month (free)

3. **Fixer.io**
   - URL: `https://fixer.io/`
   - Güvenilirlik: Yüksek
   - Güncelleme: Gerçek zamanlı
   - API: JSON REST API
   - Limit: 100 request/month (free)

4. **Investing.com**
   - Web scraping gerekli
   - Güvenilirlik: Yüksek
   - Güncelleme: Gerçek zamanlı

### MongoDB Tablo Yapısı: `currency_rates`
```javascript
{
  _id: ObjectId,
  symbol: "USD/TRY",           // Kur çifti
  baseCurrency: "USD",         // Ana para birimi
  quoteCurrency: "TRY",        // Karşı para birimi
  rate: 34.25,                 // Ana kur
  bid: 34.20,                  // Alış fiyatı
  ask: 34.30,                  // Satış fiyatı
  spread: 0.10,                // Fark
  change: 0.15,                // Değişim
  changePercent: 0.44,         // Yüzde değişim
  high: 34.35,                 // Günlük en yüksek
  low: 34.10,                  // Günlük en düşük
  open: 34.12,                 // Açılış fiyatı
  close: 34.25,                // Kapanış fiyatı
  volume: 1250000,             // İşlem hacmi
  source: "tcmb",              // Veri kaynağı
  sourceUrl: "https://...",    // Kaynak URL
  timestamp: ISODate,          // Veri zamanı
  createdAt: ISODate,          // Kayıt zamanı
  metadata: {}                 // Ek bilgiler
}
```

## 2. ALTIN FİYATLARI

### Hedef Altın Tipleri:
- **HAS (Türkiye)**
  - HAS Altın (gram/TRY)
  - Çeyrek Altın (adet/TRY)
  - Yarım Altın (adet/TRY)
  - Tam Altın (adet/TRY)

- **Uluslararası Altın**
  - XAU/USD (ons/USD)
  - XAU/EUR (ons/EUR)
  - Gold Spot (ons/USD)

### Veri Kaynakları:
1. **HAS (Altın Borsası)**
   - URL: `https://has.org.tr/`
   - Güvenilirlik: Yüksek (resmi)
   - Güncelleme: Gerçek zamanlı
   - Web scraping gerekli

2. **Investing.com**
   - URL: `https://tr.investing.com/commodities/gold`
   - Güvenilirlik: Yüksek
   - Güncelleme: Gerçek zamanlı
   - Web scraping gerekli

3. **GoldPrice.org**
   - URL: `https://goldprice.org/`
   - Güvenilirlik: Orta
   - Güncelleme: Gerçek zamanlı
   - API mevcut

4. **TCMB Altın Fiyatları**
   - URL: `https://www.tcmb.gov.tr/`
   - Güvenilirlik: Yüksek
   - Güncelleme: Günlük

### MongoDB Tablo Yapısı: `gold_prices`
```javascript
{
  _id: ObjectId,
  type: "HAS",                 // HAS, XAU, GOLD_COIN, GOLD_BAR
  unit: "gram",                // gram, ounce, kg, piece
  currency: "TRY",             // TRY, USD, EUR
  price: 2850.50,              // Ana fiyat
  buyPrice: 2845.00,           // Alış fiyatı
  sellPrice: 2855.00,          // Satış fiyatı
  spread: 10.00,               // Fark
  change: 25.50,               // Değişim
  changePercent: 0.90,         // Yüzde değişim
  high: 2860.00,               // Günlük en yüksek
  low: 2820.00,                // Günlük en düşük
  open: 2825.00,               // Açılış fiyatı
  close: 2850.50,              // Kapanış fiyatı
  volume: 125000,              // İşlem hacmi
  purity: "24K",               // Saflık (24K, 22K, 18K, 14K)
  weight: 1.0,                 // Ağırlık
  source: "has",               // Veri kaynağı
  sourceUrl: "https://...",    // Kaynak URL
  market: "istanbul",          // Piyasa (istanbul, london, new_york)
  timestamp: ISODate,          // Veri zamanı
  createdAt: ISODate,          // Kayıt zamanı
  metadata: {}                 // Ek bilgiler
}
```

## 3. VERİ ÇEKME STRATEJİSİ

### Güncelleme Sıklığı:
- **Gerçek zamanlı**: 30 saniye - 1 dakika (kritik kurlar)
- **Sık güncelleme**: 5-15 dakika (normal kurlar)
- **Günlük güncelleme**: TCMB resmi kurları

### Veri Doğrulama:
- Çoklu kaynak karşılaştırması
- Anormal değişim tespiti
- Kaynak güvenilirlik skoru

### Hata Yönetimi:
- Kaynak erişim hatalarında alternatif kaynak
- Veri tutarsızlığında uyarı sistemi
- Geçmiş veri ile karşılaştırma

### API Rate Limiting:
- Kaynak başına istek limiti kontrolü
- Öncelik sıralaması
- Cache sistemi

## 4. SOCKET BROADCAST KANALLARI

### Kanallar:
- `currency-rates` - Tüm döviz kurları
- `usd-try` - USD/TRY spesifik
- `eur-try` - EUR/TRY spesifik
- `gold-prices` - Tüm altın fiyatları
- `has-gold` - HAS altın fiyatları
- `international-gold` - Uluslararası altın
- `price-alerts` - Fiyat uyarıları

### Veri Formatı:
```javascript
{
  timestamp: "2025-01-20T10:30:00Z",
  channel: "currency-rates",
  data: {
    symbol: "USD/TRY",
    rate: 34.25,
    change: 0.15,
    changePercent: 0.44,
    source: "tcmb"
  }
}
```