const LoggerHelper = require('./utils/logger');
const settingsService = require('./utils/settingsService');
const DateHelper = require('./utils/dateHelper');

class SocketChannelManager {
  constructor(io, db) {
    this.io = io;
    this.db = db;
    this.activeConnections = new Map(); // tokenId -> connection info
    this.channels = {
      system: 'system',           // Sistem komutları (refresh, reload)
      price: 'price',             // Fiyat güncellemeleri
      altinkaynak: 'altinkaynak', // AltınKaynak verileri
      hakangold: 'hakangold',     // Hakan Altın verileri
      haremgold: 'haremgold',     // Harem Altın verileri
      tcmb: 'tcmb',              // TCMB verileri
      alerts: 'alerts'           // Uyarılar ve anomaliler
    };
    
    this.setupChannelHandlers();
  }

  // Kanal handler'larını kur
  setupChannelHandlers() {
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }

  // Yeni bağlantı işlemi
  async handleConnection(socket) {
    try {
      const tokenInfo = socket.tokenInfo;
      const isTokenAuth = socket.isTokenAuth;

      if (isTokenAuth && tokenInfo) {
        // Token bazlı bağlantı kontrolü
        const connectionAllowed = await this.checkTokenConnection(socket, tokenInfo);
        if (!connectionAllowed) {
          return; // Bağlantı reddedildi
        }
      }

      // Bağlantı bilgilerini kaydet
      await this.logConnection(socket);

      // Temel event handler'ları kur
      this.setupSocketEvents(socket);

      // Hoş geldiniz mesajı
      this.sendWelcomeMessage(socket);

    } catch (error) {
      LoggerHelper.logError('system', error, 'Socket connection handling');
      socket.disconnect();
    }
  }

  // Token bağlantı kontrolü
  async checkTokenConnection(socket, tokenInfo) {
    const tokenId = tokenInfo.tokenId;
    const existingConnection = this.activeConnections.get(tokenId);

    if (existingConnection && !tokenInfo.allowMultipleConnections) {
      // Aynı token zaten bağlı ve çoklu bağlantı izni yok
      const existingSocket = existingConnection.socket;
      
      // Mevcut bağlantıya uyarı gönder
      existingSocket.emit('connection_warning', {
        type: 'duplicate_connection',
        message: 'Aynı token ile başka yerden bağlantı yapılmaya çalışıldı',
        timestamp: DateHelper.createDate(),
        newConnectionInfo: {
          ip: socket.handshake.address,
          userAgent: socket.handshake.headers['user-agent']
        }
      });

      // Yeni bağlantıyı reddet
      socket.emit('connection_rejected', {
        type: 'duplicate_token',
        message: 'Bu token zaten kullanımda. Aynı anda birden fazla bağlantı yapılamaz.',
        timestamp: DateHelper.createDate(),
        existingConnection: {
          connectedAt: existingConnection.connectedAt,
          ip: existingConnection.ip
        }
      });

      LoggerHelper.logWarning('system', 
        `Duplicate token connection rejected: ${tokenId} from ${socket.handshake.address}`
      );

      socket.disconnect();
      return false;
    }

    // Bağlantı bilgilerini kaydet
    this.activeConnections.set(tokenId, {
      socket: socket,
      tokenInfo: tokenInfo,
      connectedAt: DateHelper.createDate(),
      ip: socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent'],
      lastActivity: DateHelper.createDate()
    });

    return true;
  }

  // Bağlantı loglaması
  async logConnection(socket) {
    const connectionInfo = {
      socketId: socket.id,
      ip: socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent'],
      connectedAt: DateHelper.createDate(),
      tokenInfo: socket.tokenInfo || null,
      isTokenAuth: socket.isTokenAuth || false
    };

    // Veritabanına kaydet (ApiConnectionLog kullan)
    if (socket.connectionLogId) {
      // Zaten loglanmış, sadece güncelle
      return;
    }

    LoggerHelper.logSuccess('system', 
      `New socket connection: ${socket.id} ${socket.isTokenAuth ? '(Token)' : '(Direct)'}`
    );
  }

  // Socket event handler'ları
  setupSocketEvents(socket) {
    // Kanal aboneliği
    socket.on('subscribe', (channelData) => {
      this.handleSubscription(socket, channelData);
    });

    // Kanal abonelik iptali
    socket.on('unsubscribe', (channelData) => {
      this.handleUnsubscription(socket, channelData);
    });

    // Client mesajları
    socket.on('client_message', (data) => {
      this.handleClientMessage(socket, data);
    });

    // Ping/Pong for keepalive
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: DateHelper.createDate() });
      this.updateLastActivity(socket);
    });

    // Disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });
  }

  // Kanal aboneliği işlemi
  handleSubscription(socket, channelData) {
    try {
      const { channel, filters } = channelData;

      // Kanal izin kontrolü
      if (!this.hasChannelPermission(socket, channel)) {
        socket.emit('subscription_error', {
          channel,
          error: 'Bu kanala erişim izniniz yok',
          timestamp: DateHelper.createDate()
        });
        return;
      }

      // Kanala katıl
      socket.join(channel);
      
      // Aktiviteyi güncelle
      this.updateLastActivity(socket);

      socket.emit('subscription_success', {
        channel,
        message: `${channel} kanalına başarıyla abone oldunuz`,
        timestamp: DateHelper.createDate(),
        filters: filters || null
      });

      LoggerHelper.logSuccess('system', 
        `Socket ${socket.id} subscribed to channel: ${channel}`
      );

    } catch (error) {
      LoggerHelper.logError('system', error, 'Channel subscription');
      socket.emit('subscription_error', {
        channel: channelData.channel,
        error: 'Abonelik sırasında hata oluştu',
        timestamp: DateHelper.createDate()
      });
    }
  }

  // Kanal abonelik iptali
  handleUnsubscription(socket, channelData) {
    const { channel } = channelData;
    
    socket.leave(channel);
    this.updateLastActivity(socket);

    socket.emit('unsubscription_success', {
      channel,
      message: `${channel} kanalından ayrıldınız`,
      timestamp: DateHelper.createDate()
    });

    LoggerHelper.logSuccess('system', 
      `Socket ${socket.id} unsubscribed from channel: ${channel}`
    );
  }

  // Kanal izin kontrolü
  hasChannelPermission(socket, channel) {
    if (!socket.isTokenAuth) {
      // Token olmayan bağlantılar için temel kanallar
      return ['price', 'system'].includes(channel);
    }

    const tokenInfo = socket.tokenInfo;
    if (!tokenInfo.allowedChannels) {
      return false;
    }

    // Üniversal erişim
    if (tokenInfo.allowedChannels.includes('*')) {
      return true;
    }

    // Spesifik kanal kontrolü
    return tokenInfo.allowedChannels.includes(channel);
  }

  // Client mesaj işleme
  handleClientMessage(socket, data) {
    this.updateLastActivity(socket);

    // System kanalından gelen admin komutları
    if (data.channel === 'system' && this.hasAdminPermission(socket)) {
      this.handleSystemCommand(socket, data);
      return;
    }

    // Normal mesaj broadcast
    this.io.to(data.channel).emit('message', {
      from: socket.id,
      channel: data.channel,
      data: data.message,
      timestamp: DateHelper.createDate()
    });
  }

  // Sistem komutları işleme
  handleSystemCommand(socket, data) {
    const { command, parameters } = data;

    switch (command) {
      case 'refresh':
        this.broadcastRefresh(parameters);
        break;
      case 'reload':
        this.broadcastReload(parameters);
        break;
      case 'announcement':
        this.broadcastAnnouncement(parameters);
        break;
      default:
        socket.emit('command_error', {
          command,
          error: 'Bilinmeyen komut',
          timestamp: DateHelper.createDate()
        });
    }
  }

  // Refresh broadcast
  broadcastRefresh(parameters = {}) {
    const message = {
      type: 'refresh',
      message: 'Sayfa yenileme talebi',
      parameters,
      timestamp: DateHelper.createDate()
    };

    this.io.to('system').emit('system_command', message);
    
    LoggerHelper.logSuccess('system', 
      `Refresh command broadcasted to ${this.io.sockets.adapter.rooms.get('system')?.size || 0} clients`
    );
  }

  // Reload broadcast
  broadcastReload(parameters = {}) {
    const message = {
      type: 'reload',
      message: 'Uygulama yeniden başlatma talebi', 
      parameters,
      timestamp: DateHelper.createDate()
    };

    this.io.to('system').emit('system_command', message);
    
    LoggerHelper.logSuccess('system', 
      `Reload command broadcasted to ${this.io.sockets.adapter.rooms.get('system')?.size || 0} clients`
    );
  }

  // Duyuru broadcast
  broadcastAnnouncement(parameters = {}) {
    const message = {
      type: 'announcement',
      message: parameters.message || 'Sistem duyurusu',
      priority: parameters.priority || 'normal',
      timestamp: DateHelper.createDate()
    };

    this.io.emit('announcement', message);
    
    LoggerHelper.logSuccess('system', 
      `Announcement broadcasted to all clients: ${message.message}`
    );
  }

  // Admin izin kontrolü
  hasAdminPermission(socket) {
    if (!socket.tokenInfo) return false;
    
    const permissions = socket.tokenInfo.permissions || [];
    return permissions.includes('admin') || permissions.includes('system_control');
  }

  // Son aktivite güncelleme
  updateLastActivity(socket) {
    if (socket.tokenInfo && socket.tokenInfo.tokenId) {
      const connection = this.activeConnections.get(socket.tokenInfo.tokenId);
      if (connection) {
        connection.lastActivity = DateHelper.createDate();
      }
    }
  }

  // Bağlantı kopma işlemi
  handleDisconnection(socket) {
    if (socket.tokenInfo && socket.tokenInfo.tokenId) {
      this.activeConnections.delete(socket.tokenInfo.tokenId);
    }

    LoggerHelper.logSuccess('system', 
      `Socket disconnected: ${socket.id}`
    );
  }

  // Hoş geldiniz mesajı
  sendWelcomeMessage(socket) {
    const welcomeData = {
      message: 'Socket sunucusuna hoş geldiniz',
      serverId: 'gold-server-socket',
      channels: Object.keys(this.channels),
      timestamp: DateHelper.createDate(),
      clientId: socket.id,
      tokenAuth: socket.isTokenAuth || false
    };

    if (socket.tokenInfo) {
      welcomeData.tokenInfo = {
        name: socket.tokenInfo.tokenName,
        permissions: socket.tokenInfo.permissions,
        allowedChannels: socket.tokenInfo.allowedChannels
      };
    }

    socket.emit('welcome', welcomeData);
  }

  // Fiyat güncellemesi broadcast
  broadcastPriceUpdate(priceData) {
    const message = {
      type: 'price_update',
      data: priceData,
      timestamp: DateHelper.createDate()
    };

    this.io.to('price').emit('price_update', message);
    
    // Kaynak bazlı kanallar
    if (priceData.source) {
      this.io.to(priceData.source).emit('price_update', message);
    }
  }

  // Anomali uyarısı broadcast
  broadcastAnomalyAlert(alertData) {
    const message = {
      type: 'anomaly_alert',
      data: alertData,
      timestamp: DateHelper.createDate()
    };

    this.io.to('alerts').emit('anomaly_alert', message);
    this.io.to('system').emit('anomaly_alert', message);
  }

  // Aktif bağlantı istatistikleri
  getConnectionStats() {
    const totalConnections = this.io.engine.clientsCount;
    const tokenConnections = this.activeConnections.size;
    const directConnections = totalConnections - tokenConnections;

    return {
      total: totalConnections,
      tokenAuth: tokenConnections,
      direct: directConnections,
      channels: Object.keys(this.channels),
      timestamp: DateHelper.createDate()
    };
  }
}

module.exports = SocketChannelManager;