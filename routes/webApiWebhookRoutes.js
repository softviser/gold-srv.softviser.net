const express = require('express');
const router = express.Router();
const webhookService = require('../services/WebhookService');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const authMiddleware = require('../middleware/auth');

// Apply authentication to all webhook routes
router.use(authMiddleware);

/**
 * @swagger
 * /webhooks:
 *   get:
 *     summary: Get all webhooks for the authenticated user
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of webhooks
 */
router.get('/', asyncHandler(async (req, res) => {
  const webhooks = webhookService.getUserWebhooks(req.user.id);
  
  res.json({
    success: true,
    data: webhooks
  });
}));

/**
 * @swagger
 * /webhooks:
 *   post:
 *     summary: Register a new webhook
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 example: https://example.com/webhook
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["dashboard.created", "widget.updated"]
 *               headers:
 *                 type: object
 *               retryOnFailure:
 *                 type: boolean
 *                 default: true
 *               testOnRegister:
 *                 type: boolean
 *                 default: true
 */
router.post('/', asyncHandler(async (req, res) => {
  const { url, events, headers, retryOnFailure, testOnRegister } = req.body;
  
  if (!url) {
    throw ApiError.validationError('Webhook URL is required');
  }

  // Validate events if provided
  if (events && Array.isArray(events)) {
    const validEvents = Object.keys(webhookService.eventTypes);
    const invalidEvents = events.filter(e => e !== '*' && !validEvents.includes(e));
    
    if (invalidEvents.length > 0) {
      throw ApiError.validationError(`Invalid event types: ${invalidEvents.join(', ')}`);
    }
  }

  const webhook = await webhookService.registerWebhook(req.user.id, {
    url,
    events,
    headers,
    retryOnFailure,
    testOnRegister
  });

  res.status(201).json({
    success: true,
    data: webhook,
    message: 'Webhook registered successfully'
  });
}));

/**
 * @swagger
 * /webhooks/events:
 *   get:
 *     summary: Get list of available webhook events
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available events
 */
router.get('/events', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: webhookService.eventTypes
  });
}));

/**
 * @swagger
 * /webhooks/{webhookId}:
 *   get:
 *     summary: Get specific webhook details
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/:webhookId', asyncHandler(async (req, res) => {
  const webhooks = webhookService.getUserWebhooks(req.user.id);
  const webhook = webhooks.find(w => w.id === req.params.webhookId);
  
  if (!webhook) {
    throw ApiError.notFound('Webhook not found');
  }

  res.json({
    success: true,
    data: webhook
  });
}));

/**
 * @swagger
 * /webhooks/{webhookId}:
 *   put:
 *     summary: Update webhook configuration
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 */
router.put('/:webhookId', asyncHandler(async (req, res) => {
  const { url, events, headers, active, retryOnFailure } = req.body;
  
  const webhook = await webhookService.updateWebhook(
    req.user.id,
    req.params.webhookId,
    { url, events, headers, active, retryOnFailure }
  );

  res.json({
    success: true,
    data: webhook,
    message: 'Webhook updated successfully'
  });
}));

/**
 * @swagger
 * /webhooks/{webhookId}/test:
 *   post:
 *     summary: Test webhook delivery
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 */
router.post('/:webhookId/test', asyncHandler(async (req, res) => {
  const userWebhooks = webhookService.webhooks.get(req.user.id);
  
  if (!userWebhooks || !userWebhooks.has(req.params.webhookId)) {
    throw ApiError.notFound('Webhook not found');
  }

  const webhook = userWebhooks.get(req.params.webhookId);
  const result = await webhookService.testWebhook(webhook);

  res.json({
    success: true,
    data: result,
    message: 'Test webhook sent successfully'
  });
}));

/**
 * @swagger
 * /webhooks/{webhookId}/logs:
 *   get:
 *     summary: Get webhook delivery logs
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: eventType
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [success, failed]
 */
router.get('/:webhookId/logs', asyncHandler(async (req, res) => {
  const { limit, offset, eventType, status } = req.query;
  
  const logs = await webhookService.getWebhookLogs(
    req.user.id,
    req.params.webhookId,
    { limit: parseInt(limit) || 100, offset: parseInt(offset) || 0, eventType, status }
  );

  res.json({
    success: true,
    data: logs
  });
}));

/**
 * @swagger
 * /webhooks/{webhookId}:
 *   delete:
 *     summary: Delete webhook
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 */
router.delete('/:webhookId', asyncHandler(async (req, res) => {
  await webhookService.deleteWebhook(req.user.id, req.params.webhookId);

  res.json({
    success: true,
    message: 'Webhook deleted successfully'
  });
}));

/**
 * @swagger
 * /webhooks/trigger:
 *   post:
 *     summary: Manually trigger a webhook event (for testing)
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - eventType
 *               - data
 *             properties:
 *               eventType:
 *                 type: string
 *                 example: dashboard.created
 *               data:
 *                 type: object
 */
router.post('/trigger', asyncHandler(async (req, res) => {
  const { eventType, data } = req.body;
  
  if (!eventType) {
    throw ApiError.validationError('Event type is required');
  }

  if (!webhookService.eventTypes[eventType]) {
    throw ApiError.validationError(`Invalid event type: ${eventType}`);
  }

  await webhookService.triggerEvent(eventType, req.user.id, data || {});

  res.json({
    success: true,
    message: `Event ${eventType} triggered successfully`
  });
}));

module.exports = router;