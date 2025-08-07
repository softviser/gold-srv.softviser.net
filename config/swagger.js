const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Gold Dashboard Web API',
      version: '1.0.0',
      description: 'Multi-user dashboard system with custom product calculations and real-time price integration',
      contact: {
        name: 'API Support',
        email: 'api@goldsrv.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:6701/web-api',
        description: 'Development server'
      },
      {
        url: 'https://api.goldsrv.com/web-api',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Authorization header using the Bearer scheme'
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API Key for service-to-service communication'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  example: 'VALIDATION_ERROR'
                },
                message: {
                  type: 'string',
                  example: 'Invalid request parameters'
                },
                details: {
                  type: 'array',
                  items: {
                    type: 'object'
                  }
                }
              }
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'object'
            },
            message: {
              type: 'string'
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        User: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              example: '507f1f77bcf86cd799439011'
            },
            username: {
              type: 'string',
              example: 'demo_user'
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com'
            },
            domain: {
              type: 'string',
              example: 'example.com'
            },
            permissions: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['read', 'write']
            },
            isActive: {
              type: 'boolean',
              example: true
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Dashboard: {
          type: 'object',
          properties: {
            _id: {
              type: 'string'
            },
            userId: {
              type: 'string'
            },
            name: {
              type: 'string',
              example: 'Ana Dashboard'
            },
            description: {
              type: 'string'
            },
            isDefault: {
              type: 'boolean'
            },
            gridConfig: {
              type: 'object',
              properties: {
                cols: {
                  type: 'integer',
                  example: 12
                },
                rowHeight: {
                  type: 'integer',
                  example: 60
                }
              }
            },
            themeConfig: {
              type: 'object',
              properties: {
                darkMode: {
                  type: 'boolean'
                },
                primaryColor: {
                  type: 'string',
                  example: '#1976d2'
                }
              }
            },
            isActive: {
              type: 'boolean'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Widget: {
          type: 'object',
          properties: {
            _id: {
              type: 'string'
            },
            dashboardId: {
              type: 'string'
            },
            widgetType: {
              type: 'string',
              enum: ['price-list', 'calculator', 'chart', 'custom-product', 'text-image']
            },
            positionConfig: {
              type: 'object',
              properties: {
                x: { type: 'integer' },
                y: { type: 'integer' },
                w: { type: 'integer' },
                h: { type: 'integer' }
              }
            },
            widgetConfig: {
              type: 'object'
            },
            styleConfig: {
              type: 'object'
            }
          }
        },
        Product: {
          type: 'object',
          properties: {
            _id: {
              type: 'string'
            },
            userId: {
              type: 'string'
            },
            name: {
              type: 'string',
              example: '22 Ayar Altın'
            },
            productCode: {
              type: 'string',
              example: 'AU22K'
            },
            buyingFormula: {
              type: 'string',
              example: 'HAS_alis * 0.916'
            },
            sellingFormula: {
              type: 'string',
              example: 'HAS_satis * 0.916'
            },
            baseSymbol: {
              type: 'string',
              example: 'HAS/TRY'
            },
            displayConfig: {
              type: 'object'
            },
            category: {
              type: 'string'
            },
            tags: {
              type: 'array',
              items: {
                type: 'string'
              }
            },
            isPublic: {
              type: 'boolean'
            }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Access token is missing or invalid',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        NotFoundError: {
          description: 'The requested resource was not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        ValidationError: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ],
    tags: [
      {
        name: 'Health',
        description: 'API health and status endpoints'
      },
      {
        name: 'Authentication',
        description: 'User authentication and authorization'
      },
      {
        name: 'Users',
        description: 'User profile and preferences management'
      },
      {
        name: 'Dashboards',
        description: 'Dashboard creation and management'
      },
      {
        name: 'Widgets',
        description: 'Widget configuration and management'
      },
      {
        name: 'Products',
        description: 'Custom product formulas and calculations'
      },
      {
        name: 'Media',
        description: 'File upload and media management'
      },
      {
        name: 'Settings',
        description: 'User settings and preferences'
      },
      {
        name: 'Admin',
        description: 'Administrative functions (Admin only)'
      }
    ]
  },
  apis: [
    './routes/webApi*.js',
    './models/Jmon*.js'
  ]
};

module.exports = swaggerJsdoc(options);