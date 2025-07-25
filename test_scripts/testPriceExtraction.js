// AltinKaynak fiyat parse test scripti

const testPrices = [
  "4.340,23",
  "4.354,33",
  "40,38",
  "46,81",
  "53,82",
  "1.234.567,89",
  "123",
  "123,45",
  "1.234",
  1234.56
];

function extractPrice(priceString) {
  if (typeof priceString === 'number') {
    return priceString;
  }
  
  if (typeof priceString === 'string') {
    // Türk formatında binlik ayırıcı nokta, ondalık ayırıcı virgül kullanılır
    // Örnek: "4.340,23" -> 4340.23
    
    // Önce tüm noktaları kaldır (binlik ayırıcılar)
    const withoutThousandSeparators = priceString.replace(/\./g, '');
    
    // Sonra virgülü noktaya çevir (ondalık ayırıcı)
    const normalized = withoutThousandSeparators.replace(',', '.');
    
    // Sayısal olmayan karakterleri temizle
    const cleaned = normalized.replace(/[^\d.]/g, '');
    
    const price = parseFloat(cleaned);
    return isNaN(price) ? 0 : price;
  }
  
  return 0;
}

console.log('🧪 AltinKaynak Fiyat Parse Testi\n');

testPrices.forEach(priceString => {
  const result = extractPrice(priceString);
  console.log(`"${priceString}" → ${result}`);
});

console.log('\n✅ Test tamamlandı!');