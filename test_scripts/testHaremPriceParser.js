// Harem Altın Web fiyat parse test scripti

const testPrices = [
  "46.8320",      // EUR/TRY alış - ondalık nokta
  "46.9600",      // EUR/TRY satış - ondalık nokta  
  "4.348,57",     // HAS/TRY - binlik nokta, ondalık virgül
  "4.361,01",     // HAS/TRY - binlik nokta, ondalık virgül
  "40.38",        // USD/TRY - sadece ondalık nokta
  "1.234.567,89", // Büyük sayı - binlik nokta, ondalık virgül
  "123",          // Tam sayı
  123.45,         // Number tip
  "53.82",        // GBP - ondalık nokta
  "10.61"         // SAR - ondalık nokta
];

function parsePrice(priceValue) {
  if (typeof priceValue === 'number') {
    return priceValue;
  }
  
  if (typeof priceValue === 'string') {
    // Harem Altın Web API'sinde formatlar:
    // 1. "46.8320" -> 46.8320 (nokta ondalık ayırıcı)
    // 2. "4.340,23" -> 4340.23 (nokta binlik, virgül ondalık)
    
    // Virgül varsa Türk formatı (nokta=binlik, virgül=ondalık)
    if (priceValue.includes(',')) {
      // Noktaları kaldır (binlik ayırıcılar)
      const withoutThousandSeparators = priceValue.replace(/\./g, '');
      // Virgülü noktaya çevir (ondalık ayırıcı)
      const normalized = withoutThousandSeparators.replace(',', '.');
      // Sayısal olmayan karakterleri temizle
      const cleaned = normalized.replace(/[^\d.]/g, '');
      const price = parseFloat(cleaned);
      return isNaN(price) ? 0 : price;
    } else {
      // Virgül yoksa Amerikan formatı (nokta=ondalık ayırıcı)
      // Sayısal olmayan karakterleri temizle
      const cleaned = priceValue.replace(/[^\d.]/g, '');
      const price = parseFloat(cleaned);
      return isNaN(price) ? 0 : price;
    }
  }
  
  return 0;
}

console.log('🧪 Harem Altın Web Fiyat Parse Testi\n');

testPrices.forEach(priceString => {
  const result = parsePrice(priceString);
  const type = typeof priceString;
  console.log(`${type === 'string' ? '"' + priceString + '"' : priceString} (${type}) → ${result}`);
});

console.log('\n🔍 Sorunlu fiyat örnekleri:');
console.log('EUR/TRY alis: "46.8320" →', parsePrice("46.8320"), '(Doğru: 46.83)');
console.log('EUR/TRY satis: "46.9600" →', parsePrice("46.9600"), '(Doğru: 46.96)');
console.log('HAS/TRY alis: "4.348,57" →', parsePrice("4.348,57"), '(Doğru: 4348.57)');
console.log('HAS/TRY satis: "4.361,01" →', parsePrice("4.361,01"), '(Doğru: 4361.01)');

console.log('\n✅ Test tamamlandı!');