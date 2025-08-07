/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: User Login
 *     description: |
 *       Authenticate user with username and password to receive JWT token.
 *       
 *       **Important**: Copy the token from response and use it in the Authorize button above.
 *       
 *       ### Test Credentials:
 *       - Username: `demo_user`
 *       - Password: `password123`
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *           examples:
 *             demo:
 *               summary: Demo User
 *               value:
 *                 username: demo_user
 *                 password: password123
 *             email:
 *               summary: Login with Email
 *               value:
 *                 username: user@example.com
 *                 password: SecurePassword123!
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *             example:
 *               success: true
 *               data:
 *                 token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1MDdmMWY3N2JjZjg2Y2Q3OTk0MzkwMTEiLCJ1c2VybmFtZSI6ImRlbW9fdXNlciIsImlhdCI6MTcwNDExNDAwMCwiZXhwIjoxNzA0MjAwNDAwfQ...."
 *                 user:
 *                   _id: "507f1f77bcf86cd799439011"
 *                   username: demo_user
 *                   email: user@example.com
 *                   permissions: ["read", "write", "subscribe"]
 *                 expiresIn: 86400
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               error:
 *                 code: INVALID_CREDENTIALS
 *                 message: Invalid username or password
 */

/**
 * @swagger
 * /auth/validate:
 *   get:
 *     summary: Validate Token
 *     description: Check if the current JWT token is valid
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token is valid
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 valid: true
 *                 userId: "507f1f77bcf86cd799439011"
 *                 username: demo_user
 *                 expiresAt: "2024-01-02T12:00:00.000Z"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh Token
 *     description: Get a new JWT token using the current valid token
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 expiresIn: 86400
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Change Password
 *     description: Change the password for the authenticated user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *                 example: password123
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 example: NewSecurePassword456!
 *                 minLength: 8
 *           example:
 *             currentPassword: password123
 *             newPassword: NewSecurePassword456!
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Password changed successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout
 *     description: Invalidate the current session
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Logged out successfully
 */

/**
 * @swagger
 * /user/dashboards:
 *   get:
 *     summary: Get User Dashboards
 *     description: |
 *       Retrieve all dashboards for the authenticated user.
 *       
 *       ### Query Parameters:
 *       - Use `includeInactive=true` to include inactive dashboards
 *       - Use `sortBy` and `sortOrder` for custom sorting
 *     tags: [Dashboards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include inactive dashboards
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, createdAt, updatedAt, lastAccessedAt]
 *           default: updatedAt
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc, "1", "-1"]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: List of dashboards
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Dashboard'
 *             example:
 *               success: true
 *               data:
 *                 - _id: "507f1f77bcf86cd799439011"
 *                   name: "Ana Dashboard"
 *                   description: "Birincil kontrol paneli"
 *                   isDefault: true
 *                   isActive: true
 *                   createdAt: "2024-01-01T00:00:00.000Z"
 *                 - _id: "507f1f77bcf86cd799439012"
 *                   name: "Trading Dashboard"
 *                   description: "Ticaret takip paneli"
 *                   isDefault: false
 *                   isActive: true
 *                   createdAt: "2024-01-02T00:00:00.000Z"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /user/dashboards:
 *   post:
 *     summary: Create Dashboard
 *     description: |
 *       Create a new dashboard for the authenticated user.
 *       
 *       ### Notes:
 *       - Maximum 10 dashboards per user
 *       - Only one dashboard can be set as default
 *       - Grid columns can be between 1-24
 *     tags: [Dashboards]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateDashboardRequest'
 *           examples:
 *             basic:
 *               summary: Basic Dashboard
 *               value:
 *                 name: "My Dashboard"
 *                 description: "Personal dashboard"
 *             advanced:
 *               summary: Advanced Dashboard
 *               value:
 *                 name: "Trading Dashboard"
 *                 description: "Real-time trading dashboard"
 *                 isDefault: true
 *                 gridConfig:
 *                   cols: 12
 *                   rowHeight: 60
 *                 themeConfig:
 *                   darkMode: true
 *                   primaryColor: "#2196f3"
 *                 settings:
 *                   autoRefresh: true
 *                   refreshInterval: 5000
 *     responses:
 *       201:
 *         description: Dashboard created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Dashboard'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /user/dashboards/{id}:
 *   get:
 *     summary: Get Dashboard by ID
 *     description: Get a specific dashboard by its ID
 *     tags: [Dashboards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Dashboard ID
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Dashboard details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Dashboard'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */

/**
 * @swagger
 * /user/dashboards/{id}:
 *   put:
 *     summary: Update Dashboard
 *     description: Update an existing dashboard
 *     tags: [Dashboards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Dashboard ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Updated Dashboard Name
 *               description:
 *                 type: string
 *               themeConfig:
 *                 type: object
 *               settings:
 *                 type: object
 *     responses:
 *       200:
 *         description: Dashboard updated
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */

/**
 * @swagger
 * /user/dashboards/{id}:
 *   delete:
 *     summary: Delete Dashboard
 *     description: |
 *       Delete a dashboard.
 *       
 *       **Warning**: This will also delete all widgets associated with this dashboard.
 *     tags: [Dashboards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Dashboard ID
 *     responses:
 *       200:
 *         description: Dashboard deleted
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Dashboard deleted successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */

/**
 * @swagger
 * /products:
 *   get:
 *     summary: Get User Products
 *     description: Get all products created by the authenticated user
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [precious-metals, currency, crypto, commodity]
 *         description: Filter by category
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: Comma-separated tags to filter
 *         example: gold,silver
 *       - in: query
 *         name: isPublic
 *         schema:
 *           type: boolean
 *         description: Filter by public/private status
 *     responses:
 *       200:
 *         description: List of products
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 */

/**
 * @swagger
 * /products:
 *   post:
 *     summary: Create Product
 *     description: |
 *       Create a new custom product with formula calculations.
 *       
 *       ### Formula Syntax:
 *       - Variables: `SYMBOL_type` (e.g., `HAS_alis`, `USD_satis`)
 *       - Operators: `+`, `-`, `*`, `/`, `(`, `)`
 *       - Numbers: Decimals allowed (e.g., `0.916`)
 *       
 *       ### Available Symbols:
 *       - `HAS/TRY` - Has Altın
 *       - `USD/TRY` - US Dollar
 *       - `EUR/TRY` - Euro
 *       - `GBP/TRY` - British Pound
 *       - `XAU/USD` - Gold/USD
 *       
 *       ### Price Types:
 *       - `_buying` - Buying price
 *       - `_selling` - Selling price
 *       - `_last` - Last price
 *       - `_avg` - Average price
 *       
 *       ### Example Formulas:
 *       - 22 Ayar Altın: `HAS_alis * 0.916`
 *       - Komisyonlu Altın: `HAS/TRY_last * 0.995 - 5`
 *       - Döviz Ortalaması: `(USD/TRY_buying + USD_satis) / 2`
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProductRequest'
 *           examples:
 *             gold22k:
 *               summary: 22 Ayar Altın
 *               value:
 *                 name: "22 Ayar Altın"
 *                 productCode: "AU22K"
 *                 buyingFormula: "HAS_alis * 0.916"
 *                 sellingFormula: "HAS_satis * 0.916"
 *                 baseSymbol: "HAS/TRY"
 *                 displayConfig:
 *                   decimalPlaces: 2
 *                   suffix: " ₺"
 *                 category: "precious-metals"
 *                 tags: ["gold", "22k", "jewelry"]
 *             gold18k:
 *               summary: 18 Ayar Altın
 *               value:
 *                 name: "18 Ayar Altın"
 *                 productCode: "AU18K"
 *                 buyingFormula: "HAS_alis * 0.75"
 *                 sellingFormula: "HAS_satis * 0.75"
 *                 baseSymbol: "HAS/TRY"
 *                 displayConfig:
 *                   decimalPlaces: 2
 *                   suffix: " TL"
 *                 category: "precious-metals"
 *                 tags: ["gold", "18k"]
 *     responses:
 *       201:
 *         description: Product created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Product'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */

/**
 * @swagger
 * /products/{id}/calculate:
 *   post:
 *     summary: Calculate Product Value
 *     description: |
 *       Calculate the current value of a product using its formula.
 *       
 *       You can either:
 *       1. Use current market prices (leave body empty)
 *       2. Provide custom variables for testing
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               variables:
 *                 type: object
 *                 description: Custom variables for calculation
 *                 example:
 *                   HAS_alis: 4350.25
 *                   HAS_satis: 4375.50
 *           examples:
 *             currentPrices:
 *               summary: Use Current Prices
 *               value: {}
 *             customPrices:
 *               summary: Custom Test Prices
 *               value:
 *                 variables:
 *                   HAS_alis: 4350.25
 *                   HAS_satis: 4375.50
 *     responses:
 *       200:
 *         description: Calculation result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CalculateProductResponse'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health Check
 *     description: Check if the API is running and healthy
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 service: Gold Dashboard Web API
 *                 version: "1.0.0"
 *                 status: healthy
 *                 timestamp: "2024-01-01T12:00:00.000Z"
 *                 uptime: 3600
 *                 environment: production
 */

/**
 * @swagger
 * /info:
 *   get:
 *     summary: API Information
 *     description: Get general information about the API
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: API information
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 service: Gold Dashboard Web API
 *                 version: "1.0.0"
 *                 description: Multi-user dashboard system
 *                 features:
 *                   - User Authentication & Management
 *                   - Dashboard Design & Configuration
 *                   - Widget System
 *                   - Custom Product Formula System
 *                   - File Upload & Media Management
 *                 documentation: /web-api/swagger
 */

module.exports = {}; // This file is just for Swagger annotations