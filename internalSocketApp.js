require('dotenv').config();
const InternalSocketServer = require('./socketServer');
const DataEmitter = require('./dataEmitter');
const { MongoClient } = require('mongodb');

let mongoClient;
let db;
let socketServer;
let dataEmitter;

// MongoDB bağlantı ayarları
const mongoUri = process.env.MONGODB_URI;
const mongoOptions = {
  auth: {
    username: process.env.MONGODB_USERNAME,
    password: process.env.MONGODB_PASSWORD
  }
};

async function connectToDatabase() {
  try {
    mongoClient = new MongoClient(mongoUri, mongoOptions);
    await mongoClient.connect();
    db = mongoClient.db();
    console.log('[Internal Socket App] MongoDB bağlantısı başarılı!');
    return db;
  } catch (error) {
    console.error('[Internal Socket App] MongoDB bağlantı hatası:', error);
    process.exit(1);
  }
}

async function startInternalSocketServer() {
  // MongoDB'ye bağlan
  await connectToDatabase();
  
  // Socket sunucusunu başlat
  const port = process.env.INTERNAL_SOCKET_PORT || 6702;
  
  socketServer = new InternalSocketServer(port, db);
  socketServer.initialize();
  
  // Data emitter'ı oluştur
  dataEmitter = new DataEmitter(socketServer);
  
  // Periyodik sistem durumu yayını
  socketServer.startPeriodicBroadcast(5000);
  
  // Örnek veri yayını (test amaçlı)
  //startSampleDataEmission();
  
  console.log(`[Internal Socket App] Dahili socket sunucusu ${port} portunda başlatıldı`);
}

/* // Test amaçlı örnek veri yayını
function startSampleDataEmission() {
  // Her 3 saniyede bir fiyat güncellemesi
  setInterval(() => {
    const symbols = ['GOLD', 'SILVER', 'USD/TRY', 'EUR/TRY'];
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    const price = (Math.random() * 1000 + 100).toFixed(2);
    const change = (Math.random() * 10 - 5).toFixed(2);
    
    dataEmitter.emitPriceUpdate(symbol, parseFloat(price), parseFloat(change));
  }, 3000);
  
  // Her 10 saniyede bir duyuru
  setInterval(() => {
    const announcements = [
      { title: 'Piyasa Açık', message: 'İşlemler devam ediyor' },
      { title: 'Sistem Güncellemesi', message: 'Yeni özellikler eklendi' },
      { title: 'Bakım Duyurusu', message: 'Planlı bakım yaklaşıyor' }
    ];
    const announcement = announcements[Math.floor(Math.random() * announcements.length)];
    
    dataEmitter.emitAnnouncement(announcement.title, announcement.message, 'info');
  }, 10000);
} */

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Internal Socket App] Kapatılıyor...');
  
  if (socketServer) {
    socketServer.close();
    console.log('[Internal Socket App] Socket sunucusu kapatıldı');
  }
  
  if (mongoClient) {
    await mongoClient.close();
    console.log('[Internal Socket App] MongoDB bağlantısı kapatıldı');
  }
  
  process.exit(0);
});

// Hata yakalama
process.on('uncaughtException', (error) => {
  console.error('[Internal Socket App] Beklenmeyen hata:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Internal Socket App] İşlenmeyen Promise reddi:', reason);
  process.exit(1);
});

// Sunucuyu başlat
startInternalSocketServer();

// Export for external usage
module.exports = {
  getSocketServer: () => socketServer,
  getDataEmitter: () => dataEmitter,
  getDatabase: () => db
};