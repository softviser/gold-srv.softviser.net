const swaggerJsdoc = require('swagger-jsdoc');

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Gold Dashboard Web API',
    version: '1.0.0',
    description: `
## Overview
Multi-user dashboard system with custom product calculations and real-time price integration.

## Authentication
All API endpoints (except health, info, and login) require JWT authentication.

### Getting Started:
1. Call \`/auth/login\` with your credentials
2. Copy the JWT token from the response
3. Click the "Authorize" button above
4. Enter: \`Bearer YOUR_JWT_TOKEN\`
5. Now you can use all protected endpoints

## Rate Limiting
- Default: 100 requests per minute per user
- Premium: 1000 requests per minute per user

## Response Format
All responses follow this structure:
\`\`\`json
{
  "success": true/false,
  "data": { ... },
  "error": { ... },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
\`\`\`
    `,
    contact: {
      name: 'API Support',
      email: 'api@goldsrv.com',
      url: 'https://goldsrv.com/support'
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
    },
    {
      url: 'https://staging-api.goldsrv.com/web-api',
      description: 'Staging server'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter the JWT token with the `Bearer ` prefix, e.g. "Bearer abcde12345"'
      }
    },
    schemas: {
      // Standard Responses
      SuccessResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
            description: 'Indicates if the request was successful'
          },
          data: {
            type: 'object',
            description: 'Response data'
          },
          message: {
            type: 'string',
            example: 'Operation completed successfully',
            description: 'Optional success message'
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            example: '2024-01-01T12:00:00.000Z'
          }
        },
        required: ['success']
      },
      ErrorResponse: {
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
                example: 'VALIDATION_ERROR',
                description: 'Error code for programmatic handling'
              },
              message: {
                type: 'string',
                example: 'Invalid request parameters',
                description: 'Human-readable error message'
              },
              details: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    field: {
                      type: 'string',
                      example: 'email'
                    },
                    message: {
                      type: 'string',
                      example: 'Invalid email format'
                    }
                  }
                },
                description: 'Detailed validation errors'
              }
            }
          },
          timestamp: {
            type: 'string',
            format: 'date-time'
          }
        },
        required: ['success', 'error']
      },
      // Authentication
      LoginRequest: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: {
            type: 'string',
            example: 'demo_user',
            description: 'Username or email address'
          },
          password: {
            type: 'string',
            format: 'password',
            example: 'SecurePassword123!',
            description: 'User password (min 8 characters)'
          }
        }
      },
      LoginResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          data: {
            type: 'object',
            properties: {
              token: {
                type: 'string',
                example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                description: 'JWT token for authentication'
              },
              user: {
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
                    example: 'user@example.com'
                  },
                  permissions: {
                    type: 'array',
                    items: {
                      type: 'string'
                    },
                    example: ['read', 'write', 'subscribe']
                  }
                }
              },
              expiresIn: {
                type: 'integer',
                example: 86400,
                description: 'Token expiration time in seconds'
              }
            }
          }
        }
      },
      // Dashboard
      Dashboard: {
        type: 'object',
        properties: {
          _id: {
            type: 'string',
            example: '507f1f77bcf86cd799439011'
          },
          userId: {
            type: 'string',
            example: '507f1f77bcf86cd799439012'
          },
          name: {
            type: 'string',
            example: 'Ana Dashboard',
            description: 'Dashboard name'
          },
          description: {
            type: 'string',
            example: 'Birincil kontrol paneli',
            description: 'Dashboard description'
          },
          isDefault: {
            type: 'boolean',
            example: true,
            description: 'Is this the default dashboard'
          },
          gridConfig: {
            type: 'object',
            properties: {
              cols: {
                type: 'integer',
                example: 12,
                description: 'Number of grid columns'
              },
              rowHeight: {
                type: 'integer',
                example: 60,
                description: 'Height of each grid row in pixels'
              },
              breakpoints: {
                type: 'object',
                properties: {
                  lg: { type: 'integer', example: 1200 },
                  md: { type: 'integer', example: 996 },
                  sm: { type: 'integer', example: 768 },
                  xs: { type: 'integer', example: 480 },
                  xxs: { type: 'integer', example: 0 }
                }
              }
            }
          },
          themeConfig: {
            type: 'object',
            properties: {
              darkMode: {
                type: 'boolean',
                example: false
              },
              primaryColor: {
                type: 'string',
                example: '#1976d2'
              },
              backgroundColor: {
                type: 'string',
                example: '#ffffff'
              }
            }
          },
          settings: {
            type: 'object',
            properties: {
              autoRefresh: {
                type: 'boolean',
                example: true
              },
              refreshInterval: {
                type: 'integer',
                example: 30000,
                description: 'Refresh interval in milliseconds'
              }
            }
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
      CreateDashboardRequest: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            example: 'Trading Dashboard',
            minLength: 3,
            maxLength: 50
          },
          description: {
            type: 'string',
            example: 'Real-time trading dashboard',
            maxLength: 200
          },
          isDefault: {
            type: 'boolean',
            example: false,
            description: 'Set as default dashboard'
          },
          gridConfig: {
            type: 'object',
            properties: {
              cols: {
                type: 'integer',
                example: 12,
                minimum: 1,
                maximum: 24
              }
            }
          },
          themeConfig: {
            type: 'object',
            properties: {
              darkMode: {
                type: 'boolean',
                example: true
              },
              primaryColor: {
                type: 'string',
                pattern: '^#[0-9A-Fa-f]{6}$',
                example: '#2196f3'
              }
            }
          }
        }
      },
      // Widget
      Widget: {
        type: 'object',
        properties: {
          _id: {
            type: 'string',
            example: '507f1f77bcf86cd799439013'
          },
          dashboardId: {
            type: 'string',
            example: '507f1f77bcf86cd799439011'
          },
          widgetType: {
            type: 'string',
            enum: ['price-list', 'calculator', 'chart', 'custom-product', 'text-image'],
            example: 'price-list',
            description: 'Type of widget'
          },
          positionConfig: {
            type: 'object',
            properties: {
              x: {
                type: 'integer',
                example: 0,
                description: 'X position in grid'
              },
              y: {
                type: 'integer',
                example: 0,
                description: 'Y position in grid'
              },
              w: {
                type: 'integer',
                example: 6,
                description: 'Width in grid units'
              },
              h: {
                type: 'integer',
                example: 4,
                description: 'Height in grid units'
              }
            }
          },
          widgetConfig: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                example: 'Anlık Fiyatlar'
              },
              symbols: {
                type: 'array',
                items: {
                  type: 'string'
                },
                example: ['HAS/TRY', 'USD/TRY', 'EUR/TRY']
              },
              showChange: {
                type: 'boolean',
                example: true
              },
              updateInterval: {
                type: 'integer',
                example: 5000
              }
            }
          },
          styleConfig: {
            type: 'object',
            properties: {
              backgroundColor: {
                type: 'string',
                example: '#ffffff'
              },
              borderColor: {
                type: 'string',
                example: '#e0e0e0'
              },
              textColor: {
                type: 'string',
                example: '#333333'
              }
            }
          },
          isActive: {
            type: 'boolean',
            example: true
          },
          createdAt: {
            type: 'string',
            format: 'date-time'
          }
        }
      },
      // Product
      Product: {
        type: 'object',
        properties: {
          _id: {
            type: 'string',
            example: '507f1f77bcf86cd799439014'
          },
          userId: {
            type: 'string',
            example: '507f1f77bcf86cd799439012'
          },
          name: {
            type: 'string',
            example: '22 Ayar Altın',
            description: 'Product name'
          },
          productCode: {
            type: 'string',
            example: 'AU22K',
            description: 'Unique product code'
          },
          buyingFormula: {
            type: 'string',
            example: 'HAS_alis * 0.916',
            description: 'Formula for calculating buying price'
          },
          sellingFormula: {
            type: 'string',
            example: 'HAS_satis * 0.916',
            description: 'Formula for calculating selling price'
          },
          baseSymbol: {
            type: 'string',
            example: 'HAS/TRY',
            description: 'Base symbol for the product'
          },
          sectionId: {
            type: 'string',
            example: '507f1f77bcf86cd799439015',
            description: 'Section ID (price category) - optional'
          },
          displayConfig: {
            type: 'object',
            properties: {
              decimalPlaces: {
                type: 'integer',
                example: 2,
                minimum: 0,
                maximum: 8
              },
              prefix: {
                type: 'string',
                example: ''
              },
              suffix: {
                type: 'string',
                example: ' ₺'
              },
              showChange: {
                type: 'boolean',
                example: true
              },
              showPercentage: {
                type: 'boolean',
                example: true
              }
            }
          },
          calculationConfig: {
            type: 'object',
            properties: {
              updateInterval: {
                type: 'integer',
                example: 5000,
                description: 'Update interval in milliseconds'
              },
              minValue: {
                type: 'number',
                example: 0
              },
              maxValue: {
                type: 'number',
                example: null
              }
            }
          },
          roundingConfig: {
            type: 'object',
            deprecated: true,
            description: 'Deprecated - Use buyingRoundingConfig and sellingRoundingConfig instead',
            properties: {
              method: {
                type: 'string',
                enum: ['none', 'up', 'down', 'nearest'],
                example: 'nearest',
                description: 'Rounding method'
              },
              precision: {
                type: 'integer',
                enum: [0, 1, 5, 10, 25, 50, 100],
                example: 5,
                description: 'Rounding precision (0 = no rounding)'
              },
              decimalPlaces: {
                type: 'integer',
                example: 2,
                minimum: 0,
                maximum: 8,
                description: 'Number of decimal places'
              }
            },
            example: {
              method: 'nearest',
              precision: 5,
              decimalPlaces: 2
            }
          },
          buyingRoundingConfig: {
            type: 'object',
            description: 'Rounding configuration for buying price',
            properties: {
              method: {
                type: 'string',
                enum: ['none', 'up', 'down', 'nearest'],
                example: 'down',
                description: 'Rounding method for buying price'
              },
              precision: {
                type: 'integer',
                enum: [0, 1, 5, 10, 25, 50, 100],
                example: 5,
                description: 'Rounding precision (0 = no rounding)'
              },
              decimalPlaces: {
                type: 'integer',
                example: 2,
                minimum: 0,
                maximum: 8,
                description: 'Number of decimal places after rounding'
              }
            },
            example: {
              method: 'down',
              precision: 5,
              decimalPlaces: 2
            }
          },
          sellingRoundingConfig: {
            type: 'object',
            description: 'Rounding configuration for selling price',
            properties: {
              method: {
                type: 'string',
                enum: ['none', 'up', 'down', 'nearest'],
                example: 'up',
                description: 'Rounding method for selling price'
              },
              precision: {
                type: 'integer',
                enum: [0, 1, 5, 10, 25, 50, 100],
                example: 5,
                description: 'Rounding precision (0 = no rounding)'
              },
              decimalPlaces: {
                type: 'integer',
                example: 2,
                minimum: 0,
                maximum: 8,
                description: 'Number of decimal places after rounding'
              }
            },
            example: {
              method: 'up',
              precision: 5,
              decimalPlaces: 2
            }
          },
          category: {
            type: 'string',
            example: 'precious-metals',
            description: 'Product category'
          },
          tags: {
            type: 'array',
            items: {
              type: 'string'
            },
            example: ['gold', '22k', 'jewelry']
          },
          isPublic: {
            type: 'boolean',
            example: false,
            description: 'Is this product public'
          },
          isActive: {
            type: 'boolean',
            example: true
          },
          createdAt: {
            type: 'string',
            format: 'date-time'
          }
        }
      },
      CreateProductRequest: {
        type: 'object',
        required: ['name', 'buyingFormula', 'sellingFormula', 'baseSymbol'],
        properties: {
          name: {
            type: 'string',
            example: '18 Ayar Altın',
            minLength: 3,
            maxLength: 100
          },
          productCode: {
            type: 'string',
            example: 'AU18K',
            pattern: '^[A-Z0-9_]+$'
          },
          buyingFormula: {
            type: 'string',
            example: 'HAS_alis * 0.75',
            description: 'Mathematical formula using symbols and operators (+, -, *, /, ())'
          },
          sellingFormula: {
            type: 'string',
            example: 'HAS_satis * 0.75'
          },
          baseSymbol: {
            type: 'string',
            example: 'HAS/TRY',
            enum: ['HAS/TRY', 'USD/TRY', 'EUR/TRY', 'GBP/TRY', 'XAU/USD']
          },
          sectionId: {
            type: 'string',
            example: '507f1f77bcf86cd799439015',
            description: 'Section ID (price category) - optional'
          },
          displayConfig: {
            type: 'object',
            properties: {
              decimalPlaces: {
                type: 'integer',
                example: 2,
                minimum: 0,
                maximum: 8
              },
              suffix: {
                type: 'string',
                example: ' TL'
              }
            }
          },
          roundingConfig: {
            type: 'object',
            deprecated: true,
            description: 'Deprecated - Use buyingRoundingConfig and sellingRoundingConfig instead',
            properties: {
              method: {
                type: 'string',
                enum: ['none', 'up', 'down', 'nearest'],
                example: 'nearest'
              },
              precision: {
                type: 'integer',
                enum: [0, 1, 5, 10, 25, 50, 100],
                example: 5
              },
              decimalPlaces: {
                type: 'integer',
                example: 2,
                minimum: 0,
                maximum: 8
              }
            }
          },
          buyingRoundingConfig: {
            type: 'object',
            description: 'Rounding configuration for buying price',
            properties: {
              method: {
                type: 'string',
                enum: ['none', 'up', 'down', 'nearest'],
                example: 'down',
                description: 'Rounding method for buying price'
              },
              precision: {
                type: 'integer',
                enum: [0, 1, 5, 10, 25, 50, 100],
                example: 5,
                description: 'Rounding precision (0 = no rounding)'
              },
              decimalPlaces: {
                type: 'integer',
                example: 2,
                minimum: 0,
                maximum: 8,
                description: 'Number of decimal places after rounding'
              }
            }
          },
          sellingRoundingConfig: {
            type: 'object',
            description: 'Rounding configuration for selling price',
            properties: {
              method: {
                type: 'string',
                enum: ['none', 'up', 'down', 'nearest'],
                example: 'up',
                description: 'Rounding method for selling price'
              },
              precision: {
                type: 'integer',
                enum: [0, 1, 5, 10, 25, 50, 100],
                example: 5,
                description: 'Rounding precision (0 = no rounding)'
              },
              decimalPlaces: {
                type: 'integer',
                example: 2,
                minimum: 0,
                maximum: 8,
                description: 'Number of decimal places after rounding'
              }
            }
          },
          category: {
            type: 'string',
            example: 'precious-metals'
          },
          tags: {
            type: 'array',
            items: {
              type: 'string'
            },
            example: ['gold', '18k']
          }
        }
      },
      CalculateProductResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          data: {
            type: 'object',
            properties: {
              productId: {
                type: 'string',
                example: '507f1f77bcf86cd799439014'
              },
              productName: {
                type: 'string',
                example: '22 Ayar Altın'
              },
              buyingPrice: {
                type: 'number',
                example: 2290.46,
                description: 'Calculated buying price'
              },
              sellingPrice: {
                type: 'number',
                example: 2310.75,
                description: 'Calculated selling price'
              },
              formattedBuyingPrice: {
                type: 'string',
                example: '2.290,46 ₺',
                description: 'Formatted buying price with currency'
              },
              formattedSellingPrice: {
                type: 'string',
                example: '2.310,75 ₺',
                description: 'Formatted selling price with currency'
              },
              timestamp: {
                type: 'string',
                format: 'date-time'
              },
              variables: {
                type: 'object',
                example: {
                  'HAS_alis': 2500.50,
                  'HAS_satis': 2522.25
                },
                description: 'Variables used in calculation'
              }
            }
          }
        }
      },
      Section: {
        type: 'object',
        properties: {
          _id: {
            type: 'string',
            example: '507f1f77bcf86cd799439015'
          },
          userId: {
            type: 'string',
            example: '507f1f77bcf86cd799439011'
          },
          name: {
            type: 'string',
            example: 'Altın Ürünleri',
            description: 'Section name'
          },
          description: {
            type: 'string',
            example: 'Altın fiyatları ve hesaplamaları',
            description: 'Section description'
          },
          sectionCode: {
            type: 'string',
            example: 'SEC_GOLD01',
            description: 'Unique section code'
          },
          displayConfig: {
            type: 'object',
            properties: {
              icon: {
                type: 'string',
                example: 'gold',
                description: 'Section icon'
              },
              color: {
                type: 'string',
                example: '#FFD700',
                description: 'Section primary color'
              },
              backgroundColor: {
                type: 'string',
                example: '#FFF8DC',
                description: 'Section background color'
              },
              showProductCount: {
                type: 'boolean',
                example: true
              },
              showLastUpdate: {
                type: 'boolean',
                example: true
              }
            }
          },
          displayOrder: {
            type: 'integer',
            example: 1,
            description: 'Display order for sorting'
          },
          category: {
            type: 'string',
            enum: ['general', 'gold', 'currency', 'crypto', 'custom'],
            example: 'gold',
            description: 'Section category'
          },
          isActive: {
            type: 'boolean',
            example: true
          },
          isDefault: {
            type: 'boolean',
            example: false,
            description: 'Is this the default section'
          },
          productCount: {
            type: 'integer',
            example: 5,
            description: 'Number of products in this section'
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
      SectionCreate: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            example: 'Döviz Kurları',
            minLength: 3,
            maxLength: 100
          },
          description: {
            type: 'string',
            example: 'Döviz kurları ve hesaplamaları'
          },
          sectionCode: {
            type: 'string',
            example: 'SEC_FOREX01',
            pattern: '^[A-Z0-9_]+$'
          },
          displayConfig: {
            type: 'object',
            properties: {
              icon: {
                type: 'string',
                example: 'currency_exchange'
              },
              color: {
                type: 'string',
                example: '#2196F3'
              },
              backgroundColor: {
                type: 'string',
                example: '#E3F2FD'
              }
            }
          },
          displayOrder: {
            type: 'integer',
            example: 2,
            minimum: 0
          },
          category: {
            type: 'string',
            enum: ['general', 'gold', 'currency', 'crypto', 'custom'],
            example: 'currency'
          },
          isDefault: {
            type: 'boolean',
            example: false
          }
        }
      },
      SystemCurrency: {
        type: 'object',
        properties: {
          _id: {
            type: 'string',
            example: '507f1f77bcf86cd799439016'
          },
          symbol: {
            type: 'string',
            example: 'HAS/TRY',
            description: 'Currency pair symbol'
          },
          code: {
            type: 'string',
            example: 'HAS',
            description: 'Currency code used in formulas'
          },
          name: {
            type: 'string',
            example: 'Has Altın',
            description: 'Currency display name'
          },
          type: {
            type: 'string',
            enum: ['forex', 'gold', 'crypto'],
            example: 'gold',
            description: 'Currency type'
          },
          baseCurrency: {
            type: 'string',
            example: 'HAS'
          },
          quoteCurrency: {
            type: 'string',
            example: 'TRY'
          },
          isActive: {
            type: 'boolean',
            example: true
          },
          priority: {
            type: 'integer',
            example: 1,
            description: 'Display priority (lower = higher priority)'
          },
          hasSource: {
            type: 'boolean',
            example: true,
            description: 'Has data source available'
          },
          sources: {
            type: 'array',
            items: {
              type: 'string'
            },
            example: ['altinkaynak'],
            description: 'Available data sources'
          },
          description: {
            type: 'string',
            example: 'Has Altın / Türk Lirası'
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
              $ref: '#/components/schemas/ErrorResponse'
            },
            example: {
              success: false,
              error: {
                code: 'UNAUTHORIZED',
                message: 'Invalid or expired token'
              },
              timestamp: '2024-01-01T12:00:00.000Z'
            }
          }
        }
      },
      NotFoundError: {
        description: 'The requested resource was not found',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse'
            },
            example: {
              success: false,
              error: {
                code: 'NOT_FOUND',
                message: 'Resource not found'
              },
              timestamp: '2024-01-01T12:00:00.000Z'
            }
          }
        }
      },
      ValidationError: {
        description: 'Validation error',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse'
            },
            example: {
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Validation failed',
                details: [
                  {
                    field: 'email',
                    message: 'Invalid email format'
                  }
                ]
              },
              timestamp: '2024-01-01T12:00:00.000Z'
            }
          }
        }
      },
      ServerError: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse'
            },
            example: {
              success: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: 'An unexpected error occurred'
              },
              timestamp: '2024-01-01T12:00:00.000Z'
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
      name: 'Authentication',
      description: 'User authentication and authorization endpoints'
    },
    {
      name: 'Dashboards',
      description: 'Dashboard management endpoints'
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
      name: 'Sections',
      description: 'Section management (price categories)'
    },
    {
      name: 'System',
      description: 'System resources (currencies, rounding options)'
    },
    {
      name: 'Prices',
      description: 'Live price data with API token authentication'
    },
    {
      name: 'Health',
      description: 'API health and status endpoints'
    }
  ]
};

const options = {
  definition: swaggerDefinition,
  apis: [
    './routes/webApiSwaggerDocs.js', // Swagger annotations file
    './routes/webApi*.js'
  ]
};

module.exports = swaggerJsdoc(options);