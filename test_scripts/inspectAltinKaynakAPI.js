require('dotenv').config();
const axios = require('axios');

async function inspectAltinKaynakAPI() {
  try {
    console.log('🔍 AltinKaynak API verilerini inceliyoruz...\n');

    // Currency API'sini test et
    console.log('📊 Currency.json verisi:');
    try {
      const currencyResponse = await axios.get('https://rest.altinkaynak.com/Currency.json', {
        timeout: 10000
      });
      
      console.log(`✓ ${currencyResponse.data.length} currency kaydı alındı`);
      console.log('\n🔍 İlk 5 currency kaydı:');
      currencyResponse.data.slice(0, 5).forEach((item, index) => {
        console.log(`${index + 1}. ${JSON.stringify(item, null, 2)}`);
      });

      // Tüm farklı code değerlerini göster
      const codes = [...new Set(currencyResponse.data.map(item => item.code))];
      console.log(`\n📝 Tüm Currency code'ları (${codes.length} adet):`);
      console.log(codes.sort().join(', '));

    } catch (error) {
      console.error('❌ Currency API hatası:', error.message);
    }

    console.log('\n' + '='.repeat(80) + '\n');

    // Gold API'sini test et
    console.log('📊 Gold.json verisi:');
    try {
      const goldResponse = await axios.get('https://rest.altinkaynak.com/Gold.json', {
        timeout: 10000
      });
      
      console.log(`✓ ${goldResponse.data.length} gold kaydı alındı`);
      console.log('\n🔍 İlk 5 gold kaydı:');
      goldResponse.data.slice(0, 5).forEach((item, index) => {
        console.log(`${index + 1}. ${JSON.stringify(item, null, 2)}`);
      });

      // Tüm farklı code değerlerini göster
      const codes = [...new Set(goldResponse.data.map(item => item.code))];
      console.log(`\n📝 Tüm Gold code'ları (${codes.length} adet):`);
      console.log(codes.sort().join(', '));

    } catch (error) {
      console.error('❌ Gold API hatası:', error.message);
    }

  } catch (error) {
    console.error('❌ Genel hata:', error);
  }
}

// Test'i çalıştır
inspectAltinKaynakAPI();