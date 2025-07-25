const { createServer } = require('http');
const { Server } = require('socket.io');
const DateHelper = require('./utils/dateHelper');

class InternalSocketServer {
  constructor(port = 6702, db = null) {
    this.port = port;
    this.db = db;
    this.apiToken = null;
    
    if (this.db) {
      const ApiToken = require('./models/ApiToken');
      this.apiToken = new ApiToken(this.db);
    }
    
    this.httpServer = createServer();
    this.io = new Server(this.httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      transports: ['websocket', 'polling']
    });
    
    this.clients = new Map();
    this.broadcastInterval = null;
  }

  initialize() {
    // Token doğrulama middleware'i
    if (this.apiToken) {
      console.log('[Internal Socket] Token doğrulama middleware aktif');
      this.io.use(async (socket, next) => {
        try {
          const token = socket.handshake.auth.token || socket.handshake.query.token;
          const domain = socket.handshake.headers.origin || socket.handshake.headers.referer;
          
          console.log('[Internal Socket] Token doğrulama başladı:', {
            token: token ? token.substring(0, 20) + '...' : 'YOK',
            domain: domain,
            extractedDomain: this.extractDomain(domain)
          });

          if (!token) {
            console.log('[Internal Socket] Token bulunamadı');
            return next(new Error('Token gerekli'));
          }

          // Token'ı doğrula - domain kontrolü model içinde yapılıyor
          const validToken = await this.apiToken.validate(token, this.extractDomain(domain));
          
          console.log('[Internal Socket] Token doğrulama sonucu:', {
            valid: !!validToken,
            tokenDomain: validToken?.domain,
            permissions: validToken?.permissions,
            testedWithDomain: this.extractDomain(domain)
          });
          
          if (!validToken) {
            console.log('[Internal Socket] Token geçersiz');
            return next(new Error('Geçersiz veya süresi dolmuş token'));
          }

          // Token bilgilerini socket'e ekle
          socket.tokenInfo = {
            tokenId: validToken._id,
            domain: validToken.domain,
            permissions: validToken.permissions,
            allowedChannels: validToken.allowedChannels,
            rateLimit: validToken.rateLimit
          };

          console.log('[Internal Socket] Token doğrulama başarılı:', socket.tokenInfo);
          next();
        } catch (error) {
          console.error('[Internal Socket] Token doğrulama hatası:', error);
          next(new Error('Token doğrulanamadı: ' + error.message));
        }
      });
    }

    this.io.on('connection', (socket) => {
      console.log(`[Internal Socket] Yeni bağlantı: ${socket.id} - Domain: ${socket.tokenInfo?.domain || 'N/A'}`);
      
      this.clients.set(socket.id, {
        id: socket.id,
        connectedAt: DateHelper.createDate(),
        socket: socket,
        tokenInfo: socket.tokenInfo
      });

      socket.on('subscribe', (channel) => {
        // Kanal iznini kontrol et
        if (socket.tokenInfo && !this.canAccessChannel(socket.tokenInfo, channel)) {
          socket.emit('error', { message: `Bu kanala erişim izniniz yok: ${channel}` });
          return;
        }
        
        socket.join(channel);
        console.log(`[Internal Socket] ${socket.id} ${channel} kanalına abone oldu`);
      });

      socket.on('unsubscribe', (channel) => {
        socket.leave(channel);
        console.log(`[Internal Socket] ${socket.id} ${channel} kanalından ayrıldı`);
      });

      socket.on('disconnect', () => {
        this.clients.delete(socket.id);
        console.log(`[Internal Socket] Bağlantı kesildi: ${socket.id}`);
      });
    });

    this.httpServer.listen(this.port, () => {
      console.log(`[Internal Socket] Dahili socket sunucusu ${this.port} portunda çalışıyor`);
    });
  }

  // Belirli bir kanala veri yayınla
  broadcastToChannel(channel, event, data) {
    this.io.to(channel).emit(event, {
      timestamp: DateHelper.createDate(),
      channel: channel,
      data: data
    });
  }

  // Tüm bağlı istemcilere veri yayınla
  broadcastToAll(event, data) {
    this.io.emit(event, {
      timestamp: DateHelper.createDate(),
      data: data
    });
  }

  // Belirli bir istemciye veri gönder
  sendToClient(clientId, event, data) {
    const client = this.clients.get(clientId);
    if (client) {
      client.socket.emit(event, {
        timestamp: DateHelper.createDate(),
        data: data
      });
    }
  }

  // Periyodik veri yayını başlat
  startPeriodicBroadcast(interval = 5000) {
    this.broadcastInterval = setInterval(() => {
      const systemData = {
        activeClients: this.clients.size,
        serverTime: DateHelper.createDate(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      };
      
      this.broadcastToAll('system-status', systemData);
    }, interval);
  }

  // Periyodik veri yayınını durdur
  stopPeriodicBroadcast() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
  }

  // Sunucuyu kapat
  close() {
    this.stopPeriodicBroadcast();
    this.io.close();
    this.httpServer.close();
  }

  // Aktif istemci listesini al
  getActiveClients() {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      connectedAt: client.connectedAt,
      domain: client.tokenInfo?.domain || 'N/A'
    }));
  }

  // Domain'den URL çıkar
  extractDomain(url) {
    if (!url) return null;
    
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      // URL parse edilemezse, localhost varsa localhost döndür
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        return 'localhost';
      }
      return url;
    }
  }

  // Kanal erişim kontrolü
  canAccessChannel(tokenInfo, channel) {
    if (!tokenInfo.allowedChannels) return false;
    
    // Eğer allowedChannels içinde '*' varsa tüm kanallara erişim var
    if (tokenInfo.allowedChannels.includes('*')) return true;
    
    // Belirli kanal kontrolü
    return tokenInfo.allowedChannels.includes(channel);
  }

  // İzin kontrolü
  hasPermission(tokenInfo, permission) {
    return tokenInfo.permissions && tokenInfo.permissions.includes(permission);
  }
}

module.exports = InternalSocketServer;