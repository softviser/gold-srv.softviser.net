// Veri yayını için yardımcı modül
const DateHelper = require('./utils/dateHelper');

class DataEmitter {
  constructor(socketServer) {
    this.socketServer = socketServer;
  }

  // Piyasa verisi yayınla
  emitMarketData(data) {
    this.socketServer.broadcastToChannel('market', 'market-update', data);
  }

  // Fiyat güncellemesi yayınla
  emitPriceUpdate(symbol, price, change) {
    const priceData = {
      symbol,
      price,
      change,
      changePercent: ((change / (price - change)) * 100).toFixed(2),
      timestamp: DateHelper.createDate()
    };
    
    this.socketServer.broadcastToChannel('prices', 'price-update', priceData);
  }

  // İşlem verisi yayınla
  emitTradeData(trade) {
    this.socketServer.broadcastToChannel('trades', 'new-trade', trade);
  }

  // Haber/duyuru yayınla
  emitAnnouncement(title, message, priority = 'normal') {
    const announcement = {
      id: Date.now().toString(),
      title,
      message,
      priority,
      timestamp: DateHelper.createDate()
    };
    
    this.socketServer.broadcastToAll('announcement', announcement);
  }

  // Kullanıcıya özel bildirim gönder
  sendNotificationToUser(userId, notification) {
    this.socketServer.sendToClient(userId, 'notification', notification);
  }

  // Toplu piyasa verisi yayınla
  emitBulkMarketData(marketData) {
    this.socketServer.broadcastToChannel('market', 'market-bulk-update', {
      count: marketData.length,
      data: marketData,
      timestamp: DateHelper.createDate()
    });
  }

  // Sistem uyarısı yayınla
  emitSystemAlert(level, message) {
    const alert = {
      level, // 'info', 'warning', 'error', 'critical'
      message,
      timestamp: DateHelper.createDate()
    };
    
    this.socketServer.broadcastToAll('system-alert', alert);
  }

  // İstatistik verisi yayınla
  emitStatistics(stats) {
    this.socketServer.broadcastToChannel('statistics', 'stats-update', stats);
  }

  // Canlı grafik verisi yayınla
  emitChartData(symbol, data) {
    this.socketServer.broadcastToChannel(`chart-${symbol}`, 'chart-update', {
      symbol,
      data,
      timestamp: DateHelper.createDate()
    });
  }

  // Order book güncellemesi yayınla
  emitOrderBookUpdate(symbol, bids, asks) {
    const orderBook = {
      symbol,
      bids,
      asks,
      spread: asks[0]?.price - bids[0]?.price || 0,
      timestamp: DateHelper.createDate()
    };
    
    this.socketServer.broadcastToChannel(`orderbook-${symbol}`, 'orderbook-update', orderBook);
  }
}

module.exports = DataEmitter;