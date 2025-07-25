const io = require('socket.io-client');

const testToken = 'sk_12db8a09f2b6e807e0992c8dc3e9c23d648b7cab63a489f2550f422a248d60d7';

console.log('Socket bağlantı testi başlıyor...');

const socket = io('http://localhost:6701', {
  auth: {
    token: testToken
  }
});

socket.on('connect', () => {
  console.log('✅ Bağlantı başarılı! Socket ID:', socket.id);
  
  // Test kanalına abone ol
  socket.emit('subscribe', 'prices');
  console.log('📡 Prices kanalına abone olundu');
  
  // 5 saniye sonra bağlantıyı kapat
  setTimeout(() => {
    socket.disconnect();
    console.log('🔌 Bağlantı kapatıldı');
    process.exit(0);
  }, 5000);
});

socket.on('connect_error', (error) => {
  console.log('❌ Bağlantı hatası:', error.message);
  process.exit(1);
});

socket.on('error', (error) => {
  console.log('❌ Socket hatası:', error);
});

socket.on('disconnect', () => {
  console.log('🔌 Bağlantı kesildi');
});

// Timeout
setTimeout(() => {
  console.log('⏰ Bağlantı zaman aşımı');
  process.exit(1);
}, 10000);