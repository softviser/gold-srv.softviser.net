const EventEmitter = require('events');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class WebhookService extends EventEmitter {
  constructor() {
    super();
    this.webhooks = new Map();
    this.retryConfig = {
      maxRetries: 3,
      retryDelay: 1000, // Start with 1 second
      maxRetryDelay: 30000, // Max 30 seconds
      backoffMultiplier: 2
    };
    this.eventTypes = {
      // Dashboard events
      'dashboard.created': 'Triggered when a new dashboard is created',
      'dashboard.updated': 'Triggered when a dashboard is updated',
      'dashboard.deleted': 'Triggered when a dashboard is deleted',
      
      // Widget events
      'widget.created': 'Triggered when a new widget is created',
      'widget.updated': 'Triggered when a widget is updated',
      'widget.deleted': 'Triggered when a widget is deleted',
      'widget.data_updated': 'Triggered when widget data is refreshed',
      
      // Product events
      'product.created': 'Triggered when a new product is created',
      'product.updated': 'Triggered when a product is updated',
      'product.deleted': 'Triggered when a product is deleted',
      'product.calculated': 'Triggered when product value is calculated',
      
      // User events
      'user.login': 'Triggered when a user logs in',
      'user.logout': 'Triggered when a user logs out',
      'user.profile_updated': 'Triggered when user profile is updated',
      'user.password_changed': 'Triggered when user password is changed',
      
      // Media events
      'media.uploaded': 'Triggered when a file is uploaded',
      'media.deleted': 'Triggered when a file is deleted',
      
      // Price events
      'price.updated': 'Triggered when price data is updated',
      'price.alert': 'Triggered when price reaches alert threshold',
      
      // System events
      'system.error': 'Triggered on system errors',
      'system.maintenance': 'Triggered for maintenance notifications'
    };
  }

  // Register a webhook
  async registerWebhook(userId, webhook) {
    const webhookId = this.generateWebhookId();
    const secret = this.generateSecret();
    
    const webhookData = {
      id: webhookId,
      userId,
      url: webhook.url,
      events: webhook.events || ['*'], // Subscribe to all events by default
      secret,
      active: true,
      headers: webhook.headers || {},
      retryOnFailure: webhook.retryOnFailure !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deliveryStats: {
        sent: 0,
        succeeded: 0,
        failed: 0,
        lastDelivery: null,
        lastError: null
      }
    };

    // Validate webhook URL
    if (!this.isValidUrl(webhook.url)) {
      throw new Error('Invalid webhook URL');
    }

    // Test webhook endpoint
    if (webhook.testOnRegister !== false) {
      await this.testWebhook(webhookData);
    }

    // Store webhook
    if (!this.webhooks.has(userId)) {
      this.webhooks.set(userId, new Map());
    }
    this.webhooks.get(userId).set(webhookId, webhookData);

    // Store in database
    await this.saveWebhookToDb(webhookData);

    return {
      id: webhookId,
      secret,
      url: webhook.url,
      events: webhookData.events
    };
  }

  // Trigger webhook event
  async triggerEvent(eventType, userId, data) {
    if (!this.eventTypes[eventType]) {
      logger.warn(`Unknown event type: ${eventType}`);
      return;
    }

    const userWebhooks = this.webhooks.get(userId);
    if (!userWebhooks) return;

    const payload = {
      id: this.generateEventId(),
      type: eventType,
      timestamp: new Date().toISOString(),
      data,
      userId
    };

    // Send to all matching webhooks
    const deliveryPromises = [];
    for (const [webhookId, webhook] of userWebhooks) {
      if (this.shouldTriggerWebhook(webhook, eventType)) {
        deliveryPromises.push(this.deliverWebhook(webhook, payload));
      }
    }

    await Promise.allSettled(deliveryPromises);
  }

  // Check if webhook should be triggered for event
  shouldTriggerWebhook(webhook, eventType) {
    if (!webhook.active) return false;
    if (webhook.events.includes('*')) return true;
    return webhook.events.includes(eventType);
  }

  // Deliver webhook with retry logic
  async deliverWebhook(webhook, payload, attempt = 1) {
    try {
      const signature = this.generateSignature(payload, webhook.secret);
      
      const response = await axios.post(webhook.url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Id': webhook.id,
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': Date.now().toString(),
          'X-Event-Type': payload.type,
          ...webhook.headers
        },
        timeout: 10000, // 10 second timeout
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      });

      // Update delivery stats
      webhook.deliveryStats.sent++;
      webhook.deliveryStats.succeeded++;
      webhook.deliveryStats.lastDelivery = new Date();
      
      // Log successful delivery
      logger.info({
        message: 'Webhook delivered successfully',
        webhookId: webhook.id,
        eventType: payload.type,
        statusCode: response.status
      });

      return { success: true, statusCode: response.status };
    } catch (error) {
      webhook.deliveryStats.sent++;
      webhook.deliveryStats.failed++;
      webhook.deliveryStats.lastError = {
        message: error.message,
        timestamp: new Date()
      };

      logger.error({
        message: 'Webhook delivery failed',
        webhookId: webhook.id,
        eventType: payload.type,
        error: error.message,
        attempt
      });

      // Retry logic
      if (webhook.retryOnFailure && attempt < this.retryConfig.maxRetries) {
        const delay = Math.min(
          this.retryConfig.retryDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
          this.retryConfig.maxRetryDelay
        );
        
        setTimeout(() => {
          this.deliverWebhook(webhook, payload, attempt + 1);
        }, delay);
      }

      return { success: false, error: error.message };
    }
  }

  // Test webhook endpoint
  async testWebhook(webhook) {
    const testPayload = {
      id: this.generateEventId(),
      type: 'test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook delivery'
      }
    };

    const signature = this.generateSignature(testPayload, webhook.secret);
    
    try {
      const response = await axios.post(webhook.url, testPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Id': webhook.id,
          'X-Webhook-Signature': signature,
          'X-Webhook-Test': 'true'
        },
        timeout: 5000
      });

      return { success: true, statusCode: response.status };
    } catch (error) {
      throw new Error(`Webhook test failed: ${error.message}`);
    }
  }

  // Update webhook
  async updateWebhook(userId, webhookId, updates) {
    const userWebhooks = this.webhooks.get(userId);
    if (!userWebhooks || !userWebhooks.has(webhookId)) {
      throw new Error('Webhook not found');
    }

    const webhook = userWebhooks.get(webhookId);
    
    // Update allowed fields
    if (updates.url) {
      if (!this.isValidUrl(updates.url)) {
        throw new Error('Invalid webhook URL');
      }
      webhook.url = updates.url;
    }
    
    if (updates.events) webhook.events = updates.events;
    if (updates.headers) webhook.headers = updates.headers;
    if (updates.active !== undefined) webhook.active = updates.active;
    if (updates.retryOnFailure !== undefined) webhook.retryOnFailure = updates.retryOnFailure;
    
    webhook.updatedAt = new Date();

    // Update in database
    await this.updateWebhookInDb(webhook);

    return webhook;
  }

  // Delete webhook
  async deleteWebhook(userId, webhookId) {
    const userWebhooks = this.webhooks.get(userId);
    if (!userWebhooks || !userWebhooks.has(webhookId)) {
      throw new Error('Webhook not found');
    }

    userWebhooks.delete(webhookId);
    
    // Delete from database
    await this.deleteWebhookFromDb(webhookId);

    return { success: true };
  }

  // Get user webhooks
  getUserWebhooks(userId) {
    const userWebhooks = this.webhooks.get(userId);
    if (!userWebhooks) return [];
    
    return Array.from(userWebhooks.values()).map(webhook => ({
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      active: webhook.active,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt,
      deliveryStats: webhook.deliveryStats
    }));
  }

  // Get webhook logs
  async getWebhookLogs(userId, webhookId, options = {}) {
    const { limit = 100, offset = 0, eventType, status } = options;
    
    // This would query from a logs database
    // For now, returning mock data structure
    return {
      logs: [],
      total: 0,
      limit,
      offset
    };
  }

  // Helper methods
  generateWebhookId() {
    return `whk_${crypto.randomBytes(16).toString('hex')}`;
  }

  generateEventId() {
    return `evt_${crypto.randomBytes(16).toString('hex')}`;
  }

  generateSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  generateSignature(payload, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  verifySignature(payload, signature, secret) {
    const expectedSignature = this.generateSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  isValidUrl(url) {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  // Database operations (to be implemented with actual database)
  async saveWebhookToDb(webhook) {
    // Save to database
    logger.info(`Webhook saved to database: ${webhook.id}`);
  }

  async updateWebhookInDb(webhook) {
    // Update in database
    logger.info(`Webhook updated in database: ${webhook.id}`);
  }

  async deleteWebhookFromDb(webhookId) {
    // Delete from database
    logger.info(`Webhook deleted from database: ${webhookId}`);
  }

  async loadWebhooksFromDb() {
    // Load all webhooks from database on startup
    logger.info('Loading webhooks from database');
  }
}

// Create singleton instance
const webhookService = new WebhookService();

module.exports = webhookService;