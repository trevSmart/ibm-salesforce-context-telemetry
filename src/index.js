// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs');
const path = require('path');
const db = require('./storage/database');
const logFormatter = require('./storage/log-formatter');
const auth = require('./auth/auth');
const { Cache } = require('./utils/performance');
const app = express();
const port = process.env.PORT || 3100;
const isDevelopment = process.env.NODE_ENV !== 'production';

// Performance constants
const MAX_API_LIMIT = 1000; // Maximum events per API request
const MAX_EXPORT_LIMIT = 50000; // Maximum events per export
const HEALTH_CHECK_CACHE_TTL = parseInt(process.env.HEALTH_CHECK_CACHE_TTL_MS) || 5000; // 5 seconds default
const STATS_CACHE_KEY_EMPTY = 'stats:::'; // Cache key for stats with no filters

// Initialize caches for frequently accessed data
const statsCache = new Cache(30000); // 30 seconds TTL for stats
const sessionsCache = new Cache(60000); // 60 seconds TTL for sessions
const userIdsCache = new Cache(120000); // 2 minutes TTL for user IDs
const healthCheckCache = new Cache(HEALTH_CHECK_CACHE_TTL); // Health check cache

// Periodic cache cleanup to prevent memory bloat
setInterval(() => {
  statsCache.cleanup();
  sessionsCache.cleanup();
  userIdsCache.cleanup();
  healthCheckCache.cleanup();
}, 60000); // Clean up every minute

// Trust reverse proxy headers so secure cookies work behind Render/Cloudflare
app.set('trust proxy', 1);

// Load and compile JSON schema for validation
const schemaPath = path.join(__dirname, 'api', 'telemetry-schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false }); // strict: false allows additional properties in 'data'
addFormats(ajv); // Add support for date-time and other formats
const validate = ajv.compile(schema);

// Middleware
app.use(cors()); // Allow requests from any origin
app.use(express.json({ limit: '10mb' })); // Parse JSON request bodies with size limit
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded bodies (for login form)

// Add compression middleware for responses
const compression = require('compression');
app.use(compression());

// Live reload middleware (development only)
if (isDevelopment) {
  try {
    const livereload = require('livereload');
    const connectLivereload = require('connect-livereload');

    // Create livereload server
    const liveReloadServer = livereload.createServer({
      port: 35729,
      exts: ['html', 'css', 'js', 'json']
    });

    // Watch public directory for changes
    liveReloadServer.watch(path.join(__dirname, '..', 'public'));

    // Inject livereload script into HTML responses
    app.use(connectLivereload({
      port: 35729
    }));

    console.log('🔄 Live reload enabled on port 35729');
  } catch (_error) {
    // Live reload dependencies not installed, continue without it
    console.log('⚠️  Live reload not available (install dev dependencies: npm install)');
  }
}

// Initialize session middleware early (will use MemoryStore initially, then upgrade to PostgreSQL if available)
app.use(auth.initSessionMiddleware());

// Serve static files from public directory with caching
app.use(express.static(path.join(__dirname, '..', 'public'), {
  // Prevent automatic index.html serving so auth guard can handle "/"
  index: false,
  // Ensure CSS files are served with correct MIME type
  maxAge: isDevelopment ? 0 : '1y', // Cache static assets for 1 year in production
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.type('text/css');
    } else if (filePath.endsWith('sort-desc') || filePath.endsWith('sort-asc')) {
      res.type('image/svg+xml');
    }
    // Add cache control for static assets
    if (!isDevelopment) {
      if (filePath.match(/\.(js|css|woff|woff2|ttf|svg|jpg|jpeg|png|gif|ico)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }
}));

// Fallback for CSS files - return empty CSS if file doesn't exist (prevents HTML 404)
app.use((req, res, next) => {
  if (req.path.endsWith('.css') && !res.headersSent) {
    const cssPath = path.join(__dirname, '..', 'public', req.path);
    if (!fs.existsSync(cssPath)) {
      // Return empty CSS with correct MIME type instead of HTML 404
      res.type('text/css');
      return res.status(200).send('/* CSS file not found */');
    }
  }
  next();
});

app.post('/telemetry', (req, res) => {
  try {
    const telemetryData = req.body;

    // Basic validation
    if (!telemetryData || typeof telemetryData !== 'object') {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid telemetry data: expected JSON object'
      });
    }

    // Validate against JSON schema
    const valid = validate(telemetryData);
    if (!valid) {
      const errors = validate.errors.map(err => ({
        field: err.instancePath || err.params?.missingProperty || 'root',
        message: err.message
      }));

      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors
      });
    }

    // Log the telemetry event with timestamp
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Telemetry event:`, JSON.stringify(telemetryData, null, 2));

    // Store in database (non-blocking - don't await to avoid blocking response)
    db.storeEvent(telemetryData, timestamp).then(() => {
      // Clear relevant caches when new data arrives
      statsCache.clear();
      sessionsCache.clear();
      userIdsCache.clear();
    }).catch(err => {
      console.error('Error storing telemetry event:', err);
      // Don't fail the request if storage fails - telemetry is non-critical
    });

    // Return success response
    res.status(200).json({
      status: 'ok',
      receivedAt: timestamp
    });
  } catch (error) {
    console.error('Error processing telemetry:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Track server start time for uptime calculation
const serverStartTime = Date.now();

app.get('/health', async (req, res) => {
  const format = req.query.format || (req.headers.accept?.includes('application/json') ? 'json' : 'html');

  if (format === 'json') {
    try {
      // Use cached health data if available
      const cachedHealth = healthCheckCache.get('health');
      if (cachedHealth) {
        // Update uptime but use cached DB stats
        const now = Date.now();
        cachedHealth.uptime = Math.floor((now - serverStartTime) / 1000);
        cachedHealth.timestamp = new Date().toISOString();
        return res.status(cachedHealth.status === 'healthy' ? 200 : 503).json(cachedHealth);
      }

      // Get uptime
      const now = Date.now();
      const uptime = Math.floor((now - serverStartTime) / 1000);

      // Get memory usage
      const memoryUsage = process.memoryUsage();
      const memory = {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss
      };

      // Check database status (lightweight check)
      let dbStatus = 'unknown';
      let dbType = process.env.DB_TYPE || 'sqlite';
      let totalEvents = 0;
      
      try {
        // Use cached stats from cache instead of querying DB
        const cachedStats = statsCache.get(STATS_CACHE_KEY_EMPTY);
        if (cachedStats) {
          dbStatus = 'connected';
          totalEvents = cachedStats.total || 0;
        } else {
          // Only query if not in cache
          const stats = await db.getStats();
          dbStatus = 'connected';
          totalEvents = stats.total || 0;
          // Cache for next health check
          statsCache.set(STATS_CACHE_KEY_EMPTY, stats);
        }
      } catch (error) {
        dbStatus = 'error';
        console.error('Database health check failed:', error);
      }

      // Determine overall health status
      const isHealthy = dbStatus === 'connected';

      const healthData = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: uptime,
        version: require('../package.json').version,
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development',
        memory: memory,
        database: {
          type: dbType,
          status: dbStatus
        },
        stats: {
          totalEvents: totalEvents
        }
      };
      
      // Cache the health data using Cache class
      healthCheckCache.set('health', healthData);

      res.status(isHealthy ? 200 : 503).json(healthData);
    } catch (error) {
      console.error('Health check error:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        message: 'Health check failed',
        error: error.message
      });
    }
  } else {
    // Serve HTML page
    const healthPath = path.join(__dirname, '..', 'public', 'health.html');
    if (fs.existsSync(healthPath)) {
      res.sendFile(healthPath);
    } else {
      // Fallback to simple text response
      res.status(200).send('ok');
    }
  }
});

// Authentication routes
app.get('/login', auth.requireGuest, (req, res) => {
  const loginPath = path.join(__dirname, '..', 'public', 'login.html');
  if (fs.existsSync(loginPath)) {
    res.sendFile(loginPath);
  } else {
    res.status(404).send('Login page not found');
  }
});

app.post('/login', auth.requireGuest, async (req, res) => {
  try {
    // Support both JSON and form-urlencoded
    const username = req.body.username;
    const password = req.body.password;

    if (!username || !password) {
      // If it's a form submission, redirect back with error
      if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
        return res.redirect('/login?error=missing_credentials');
      }
      return res.status(400).json({
        status: 'error',
        message: 'Username and password are required'
      });
    }

    const authResult = await auth.authenticate(username, password);

    if (authResult && authResult.success) {
      const userInfo = authResult.user || { username, role: 'basic' };
      req.session.authenticated = true;
      req.session.username = userInfo.username;
      req.session.role = userInfo.role;

      // If it's a form submission, save session and redirect to home
      if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
        req.session.save((err) => {
          if (err) {
            console.error('Error saving session:', err);
            return res.redirect('/login?error=server_error');
          }
          return res.redirect('/');
        });
        return;
      }

      return res.json({
        status: 'ok',
        message: 'Login successful'
      });
    } else {
      // If it's a form submission, redirect back with error
      if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
        return res.redirect('/login?error=invalid_credentials');
      }

      return res.status(401).json({
        status: 'error',
        message: 'Invalid username or password'
      });
    }
  } catch (error) {
    console.error('Login error:', error);

    // If it's a form submission, redirect back with error
    if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
      return res.redirect('/login?error=server_error');
    }

    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to logout'
      });
    }
    res.json({
      status: 'ok',
      message: 'Logout successful'
    });
  });
});

app.get('/api/auth/status', (req, res) => {
  const isAuthenticated = Boolean(req.session && req.session.authenticated);
  res.json({
    authenticated: isAuthenticated,
    username: req.session && req.session.username || null,
    role: isAuthenticated && req.session?.role
      ? auth.normalizeRole(req.session.role)
      : null
  });
});

// User management API endpoints
app.get('/api/users', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json({
      status: 'ok',
      users: users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch users'
    });
  }
});

app.post('/api/users', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Username and password are required'
      });
    }

    // Check if user already exists
    const existingUser = await db.getUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({
        status: 'error',
        message: 'User already exists'
      });
    }

    // Hash password
    const passwordHash = await auth.hashPassword(password);

    // Create user
    const normalizedRole = role ? auth.normalizeRole(role) : 'basic';

    const user = await db.createUser(username, passwordHash, normalizedRole);

    res.status(201).json({
      status: 'ok',
      message: 'User created successfully',
      user: {
        id: user.id,
        username: user.username,
        created_at: user.created_at,
        role: normalizedRole
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create user'
    });
  }
});

app.delete('/api/users/:username', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
  try {
    const { username } = req.params;

    // Prevent deleting the current user
    if (req.session && req.session.username === username) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete your own user account'
      });
    }

    const deleted = await db.deleteUser(username);
    if (!deleted) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    res.json({
      status: 'ok',
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete user'
    });
  }
});

app.put('/api/users/:username/password', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
  try {
    const { username } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        status: 'error',
        message: 'Password is required'
      });
    }

    // Hash password
    const passwordHash = await auth.hashPassword(password);

    // Update password
    const updated = await db.updateUserPassword(username, passwordHash);
    if (!updated) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    res.json({
      status: 'ok',
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update password'
    });
  }
});

app.put('/api/users/:username/role', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
  try {
    const { username } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({
        status: 'error',
        message: 'Role is required'
      });
    }

    const normalizedRole = auth.normalizeRole(role);
    const updated = await db.updateUserRole(username, normalizedRole);
    if (!updated) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // If the authenticated user updated their own role, refresh session value
    if (req.session && req.session.username === username) {
      req.session.role = normalizedRole;
    }

    res.json({
      status: 'ok',
      message: 'Role updated successfully',
      role: normalizedRole
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update role'
    });
  }
});

// API endpoints for viewing telemetry data
app.get('/api/events', auth.requireAuth, auth.requireRole('advanced'), async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      eventType,
      serverId,
      sessionId,
      startDate,
      endDate,
      userId,
      orderBy = 'created_at',
      order = 'DESC'
    } = req.query;
    
    // Enforce maximum limit to prevent performance issues
    const effectiveLimit = Math.min(parseInt(limit), MAX_API_LIMIT);

    // Handle multiple eventType values (Express converts them to an array)
    const eventTypes = Array.isArray(eventType) ? eventType : (eventType ? [eventType] : []);
    // Handle multiple userId values (Express converts them to an array)
    const userIds = Array.isArray(userId) ? userId : (userId ? [userId] : []);

    // If __none__ is in the userIds array, return no events
    if (userIds.includes('__none__')) {
      return res.json({
        events: [],
        total: 0,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    }

    const result = await db.getEvents({
      limit: effectiveLimit,
      offset: parseInt(offset),
      eventTypes: eventTypes.length > 0 ? eventTypes : undefined,
      serverId,
      sessionId,
      startDate,
      endDate,
      userIds: userIds.length > 0 ? userIds : undefined,
      orderBy,
      order
    });
    
    // Add cache headers for repeated queries
    if (!startDate && !endDate && !eventType && !serverId && !sessionId && !userId) {
      res.setHeader('Cache-Control', 'private, max-age=10'); // Cache for 10 seconds
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch events'
    });
  }
});

app.get('/api/events/:id', auth.requireAuth, auth.requireRole('advanced'), async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    if (isNaN(eventId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid event ID'
      });
    }

    const event = await db.getEventById(eventId);
    if (!event) {
      return res.status(404).json({
        status: 'error',
        message: 'Event not found'
      });
    }

    res.json({
      status: 'ok',
      event: event
    });
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch event'
    });
  }
});

app.get('/api/stats', auth.requireAuth, async (req, res) => {
  try {
    const { startDate, endDate, eventType } = req.query;
    
    // Use cache for basic stats queries without filters
    const cacheKey = `stats:${startDate || ''}:${endDate || ''}:${eventType || ''}`;
    const cached = statsCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    const stats = await db.getStats({ startDate, endDate, eventType });
    
    // Cache the result
    statsCache.set(cacheKey, stats);
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch statistics'
    });
  }
});

app.get('/api/event-types', auth.requireAuth, auth.requireRole('advanced'), async (req, res) => {
  try {
    const { sessionId, userId } = req.query;
    // Handle multiple userId values (Express converts them to an array)
    const userIds = Array.isArray(userId) ? userId : (userId ? [userId] : []);

    // If __none__ is in the userIds array, return no stats
    if (userIds.includes('__none__')) {
      return res.json([]);
    }

    const stats = await db.getEventTypeStats({
      sessionId,
      userIds: userIds.length > 0 ? userIds : undefined
    });
    res.json(stats);
  } catch (error) {
    console.error('Error fetching event type stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch event type statistics'
    });
  }
});

app.get('/api/sessions', auth.requireAuth, auth.requireRole('advanced'), async (req, res) => {
  try {
    const { userId } = req.query;
    // Handle multiple userId values (Express converts them to an array)
    const userIds = Array.isArray(userId) ? userId : (userId ? [userId] : []);

    // If __none__ is in the userIds array, return no sessions
    if (userIds.includes('__none__')) {
      return res.json([]);
    }

    // Use cache for session queries (sanitize key to avoid cache pollution)
    const cacheKey = `sessions:${JSON.stringify(userIds.sort())}`;
    const cached = sessionsCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const sessions = await db.getSessions({
      userIds: userIds.length > 0 ? userIds : undefined
    });
    
    // Cache the result
    sessionsCache.set(cacheKey, sessions);
    
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch sessions'
    });
  }
});

app.get('/api/daily-stats', auth.requireAuth, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const byEventTypeRaw = String(req.query.byEventType || '').toLowerCase();
    const useEventTypeBreakdown = ['true', '1', 'yes', 'on'].includes(byEventTypeRaw);

    const stats = useEventTypeBreakdown
      ? await db.getDailyStatsByEventType(days)
      : await db.getDailyStats(days);

    res.json(stats);
  } catch (error) {
    console.error('Error fetching daily stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch daily statistics'
    });
  }
});

app.get('/api/top-users-today', auth.requireAuth, async (req, res) => {
  try {
    const limitRaw = parseInt(req.query.limit, 10);
    const daysRaw = parseInt(req.query.days, 10);
    const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 3), 500);
    const days = Math.min(Math.max(1, Number.isFinite(daysRaw) ? daysRaw : 3), 365);
    const users = await db.getTopUsersLastDays(limit, days);
    res.json({ users, days });
  } catch (error) {
    console.error('Error fetching top users for the selected window:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch top users for the selected window'
    });
  }
});

app.get('/api/telemetry-users', auth.requireAuth, auth.requireRole('advanced'), async (req, res) => {
  try {
    // Use cache for user IDs since they don't change frequently
    const cacheKey = 'userIds:all';
    const cached = userIdsCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    const userIds = await db.getUniqueUserIds();
    
    // Cache the result
    userIdsCache.set(cacheKey, userIds);
    
    res.json(userIds);
  } catch (error) {
    console.error('Error fetching unique user IDs:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch unique user IDs'
    });
  }
});

app.get('/api/database-size', auth.requireAuth, auth.requireRole('advanced'), async (req, res) => {
  try {
    const sizeInfo = await db.getDatabaseSize();
    if (sizeInfo === null) {
      return res.status(404).json({
        status: 'error',
        message: 'Database size not available'
      });
    }

    const { size, maxSize } = sizeInfo;
    const sizeFormatted = formatBytes(size);
    const maxSizeFormatted = maxSize ? formatBytes(maxSize) : null;
    const percentage = maxSize ? Math.round((size / maxSize) * 100) : null;

    res.json({
      status: 'ok',
      size: size,
      maxSize: maxSize,
      sizeFormatted: sizeFormatted,
      maxSizeFormatted: maxSizeFormatted,
      percentage: percentage,
      displayText: maxSize
        ? `${percentage}% (${sizeFormatted} / ${maxSizeFormatted})`
        : sizeFormatted
    });
  } catch (error) {
    console.error('Error fetching database size:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch database size'
    });
  }
});

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Serve landing page
app.get('/', auth.requireAuth, (_req, res) => {
  const landingPath = path.join(__dirname, '..', 'public', 'index.html');
  if (fs.existsSync(landingPath)) {
    res.sendFile(landingPath);
  } else {
    res.status(200).send('MCP Telemetry server is running ✅<br><a href="/api/events">View API</a>');
  }
});

// Serve event log page
app.get('/event-log', auth.requireAuth, auth.requireRole('advanced'), (_req, res) => {
  const eventLogPath = path.join(__dirname, '..', 'public', 'event-log.html');
  if (fs.existsSync(eventLogPath)) {
    res.sendFile(eventLogPath);
  } else {
    res.status(404).send('Event logs page not found');
  }
});

// Serve OpenAPI specification
app.get('/api-spec', auth.requireAuth, (_req, res) => {
  const specPath = path.join(__dirname, 'api', 'api-spec.yaml');
  if (fs.existsSync(specPath)) {
    res.type('text/yaml');
    res.send(fs.readFileSync(specPath, 'utf8'));
  } else {
    res.status(404).json({ status: 'error', message: 'API spec not found' });
  }
});

// Serve JSON schema
app.get('/schema', auth.requireAuth, (_req, res) => {
  res.json(schema);
});

// Export logs in JSON Lines (JSONL) format
app.get('/api/export/logs', auth.requireAuth, auth.requireRole('advanced'), async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      eventType,
      serverId,
      limit = 10000
    } = req.query;
    
    // Enforce maximum export limit for performance
    const effectiveLimit = Math.min(parseInt(limit), MAX_EXPORT_LIMIT);

    // Get events from database
    const result = await db.getEvents({
      limit: effectiveLimit,
      offset: 0,
      eventType,
      serverId,
      startDate,
      endDate,
      orderBy: 'created_at',
      order: 'ASC'
    });

    // Format events as JSON Lines (JSONL)
    const formattedLogs = logFormatter.formatEvents(result.events);

    const filename = `telemetry-logs-${new Date().toISOString().split('T')[0]}.jsonl`;

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache'); // Don't cache exports
    res.send(formattedLogs);
  } catch (error) {
    console.error('Error exporting logs:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to export logs'
    });
  }
});

// Delete a single event by ID
app.delete('/api/events/:id', auth.requireAuth, auth.requireRole('advanced'), async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    if (isNaN(eventId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid event ID'
      });
    }

    const deleted = await db.deleteEvent(eventId);
    if (deleted) {
      res.json({
        status: 'ok',
        message: 'Event deleted successfully'
      });
    } else {
      res.status(404).json({
        status: 'error',
        message: 'Event not found'
      });
    }
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete event'
    });
  }
});

// Delete all events from database
app.delete('/api/events', auth.requireAuth, auth.requireRole('advanced'), async (req, res) => {
  try {
    const { sessionId } = req.query;

    if (sessionId) {
      const deletedCount = await db.deleteEventsBySession(sessionId);
      return res.json({
        status: 'ok',
        message: `Successfully deleted ${deletedCount} events from session ${sessionId}`,
        deletedCount,
        sessionId
      });
    }

    const deletedCount = await db.deleteAllEvents();
    res.json({
      status: 'ok',
      message: `Successfully deleted ${deletedCount} events`,
      deletedCount
    });
  } catch (error) {
    console.error('Error deleting events:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete events'
    });
  }
});

// Initialize database and start server
async function startServer() {
  try {
    await db.init();
    console.log('Database initialized successfully');

    // Send a START event to local database
    const startEvent = {
      event: 'session_start',
      timestamp: new Date().toISOString(),
      serverId: 'local-server',
      version: '1.0.0',
      data: {
        message: 'Server started',
        environment: process.env.NODE_ENV || 'development'
      }
    };
    await db.storeEvent(startEvent, new Date().toISOString());
    console.log('START event sent to local database');

    // Initialize authentication with database
    auth.init(db);
    console.log('Authentication initialized with database support');

    // Note: Session middleware was initialized earlier (before routes)
    // It will use MemoryStore initially, which is fine for SQLite or development
    // For PostgreSQL in production, the warning about MemoryStore will appear
    // but sessions will still work correctly

    app.listen(port, () => {
      console.log('\n' + '='.repeat(60));
      console.log('✅ Telemetry server is running!');
      console.log('='.repeat(60));
      console.log(`🌐 Server URL: http://localhost:${port}`);
      console.log(`📊 Dashboard:  http://localhost:${port}/`);
      console.log(`❤️  Health:     http://localhost:${port}/health`);
      console.log(`📡 API:        http://localhost:${port}/api/events`);
      console.log(`📋 Schema:     http://localhost:${port}/schema`);
      console.log('='.repeat(60) + '\n');
    });
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database...');
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing database...');
  await db.close();
  process.exit(0);
});

// Start the server
startServer();
