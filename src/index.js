// Load environment variables from .env file
import 'dotenv/config';

import express from 'express';
import session from 'express-session';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import rateLimit from 'express-rate-limit';
import sharp from 'sharp';
import compression from 'compression';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDevelopment = process.env.NODE_ENV !== 'production';

// Global rate limiter for all GET requests
const globalRateLimiter = rateLimit({
	standardHeaders: true,
	legacyHeaders: false,
	windowMs: 60 * 1000, // 1 minute
	max: 100, // limit each IP to 100 GET requests per minute
	message: {
		status: 'error',
		message: 'Too many requests. Please try again later.'
	}
});

// Sharp imported at top

// Process team logo image - only resize if larger than target, always convert to WebP
async function processTeamLogo(buffer, mimeType) {
	try {
		// Get image metadata to check dimensions
		const metadata = await sharp(buffer).metadata();
		const {width, height} = metadata;

		// Target dimensions
		const TARGET_SIZE = 48;

		// Check if resizing is needed
		const needsResize = width > TARGET_SIZE || height > TARGET_SIZE;
		const needsFormatConversion = mimeType !== 'image/webp';

		// If already WebP and correct size or smaller, return as-is
		if (!needsResize && !needsFormatConversion) {
			return {
				data: buffer,
				mime: mimeType,
				size: buffer.length
			};
		}

		let sharpInstance = sharp(buffer);

		// Only resize if image is larger than target
		if (needsResize) {
			sharpInstance = sharpInstance.resize(TARGET_SIZE, TARGET_SIZE, {
				fit: 'contain',
				background: {r: 255, g: 255, b: 255, alpha: 0}, // Transparent background
				withoutEnlargement: true // Never enlarge smaller images
			});
		}

		// Convert to WebP if not already
		if (needsFormatConversion) {
			sharpInstance = sharpInstance.webp({
				quality: 85, // Good quality with compression
				effort: 6    // Better compression (takes more time but better result)
			});
		}

		const processedBuffer = await sharpInstance.toBuffer();

		return {
			data: processedBuffer,
			mime: 'image/webp',
			size: processedBuffer.length,
			originalSize: buffer.length,
			resized: needsResize,
			converted: needsFormatConversion
		};
	} catch (error) {
		console.error('Error processing team logo:', error);
		throw new Error(`Failed to process image: ${  error.message}`);
	}
}

import multer from 'multer';
import * as db from './storage/database.js';
import * as logFormatter from './storage/log-formatter.js';
import * as auth from './auth/auth.js';
import * as csrf from './auth/csrf.js';
import {Cache} from './utils/performance.js';
import {parseTelemetryEvent} from './storage/parsers/index.js';
const app = express();
const port = process.env.PORT || 3100;

// Performance constants
const MAX_API_LIMIT = 1000; // Maximum events per API request
const MAX_EXPORT_LIMIT = 50000; // Maximum events per export
const HEALTH_CHECK_CACHE_TTL = Number.parseInt(process.env.HEALTH_CHECK_CACHE_TTL_MS, 10) || 5000; // 5 seconds default
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
const schema = JSON.parse(fs.readFileSync(schemaPath));
// Only enable allErrors in development/debug mode to prevent resource exhaustion in production
const ajv = new Ajv({allErrors: Boolean(process.env.REST_DEBUG), strict: false}); // strict: false allows additional properties in 'data'
addFormats(ajv); // Add support for date-time and other formats
const validate = ajv.compile(schema);

// Middleware
app.use(cors()); // Allow requests from any origin
app.use(cookieParser()); // Parse cookies
app.use(express.json({limit: '10mb'})); // Parse JSON request bodies with size limit
app.use(express.urlencoded({extended: true, limit: '10mb'})); // Parse URL-encoded bodies (for login form)

// Apply global rate limiter only to GET requests
app.use((req, res, next) => {
	if (req.method === 'GET') {
		return globalRateLimiter(req, res, next);
	}
	next();
});

// Configure multer for file uploads (team logos)
const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 2 * 1024 * 1024 // 2MB max for originals (will be processed)
	},
	fileFilter: (req, file, cb) => {
		// Accept common image formats that will be converted to WebP
		const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/bmp'];
		if (allowedMimes.includes(file.mimetype)) {
			cb(null, true);
		} else {
			cb(new Error('Invalid file type. Only image files are allowed.'), false);
		}
	}
});

// Add compression middleware for responses (imported at top)
app.use(compression());

// Live reload middleware (development only)
if (isDevelopment) {
	try {
		const {default: livereload} = await import('livereload');
		const {default: connectLivereload} = await import('connect-livereload');

		const livereloadPort = Number.parseInt(process.env.LIVERELOAD_PORT || '35729', 10);

		// Create livereload server
		const liveReloadServer = livereload.createServer({
			port: livereloadPort,
			exts: ['html', 'css', 'js', 'json']
		});

		// Avoid crashing when the livereload port is already in use
		liveReloadServer.server?.on('error', (error) => {
			if (error && error.code === 'EADDRINUSE') {
				console.warn(`⚠️  Live reload port ${livereloadPort} already in use; skipping live reload.`);
			} else {
				console.warn('⚠️  Live reload server error; skipping live reload.', error?.message || error);
			}
		});

		// Watch public directory for changes
		liveReloadServer.watch(path.join(__dirname, '..', 'public'));

		// Inject livereload script into HTML responses
		app.use(connectLivereload({
			port: livereloadPort
		}));

	} catch {
		// Live reload dependencies not installed, continue without it
	}
}

// Temporary placeholder for session middleware - will be replaced after database init
// This allows us to register routes early while deferring session store configuration
// Use the same SESSION_SECRET from auth module to ensure session continuity
const tempSession = session({
	secret: auth.SESSION_SECRET,
	resave: false,
	saveUninitialized: false,
	cookie: {
		secure: process.env.NODE_ENV === 'production',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 24 * 60 * 60 * 1000
	}
});

let sessionMiddleware = null;
let redisSessionClient = null; // Track Redis client for graceful shutdown
app.use((req, res, next) => {
	if (sessionMiddleware) {
		return sessionMiddleware(req, res, next);
	}
	// Before database init, use a basic session (will use memorystore if available, otherwise default MemoryStore)
	tempSession(req, res, next);
});

// Middleware to restore session from remember token
app.use(async (req, res, next) => {
	// Only check remember token if user is not already authenticated
	if (!req.session || !req.session.authenticated) {
		const cookieName = process.env.REMEMBER_COOKIE_NAME || 'remember_token';
		const rememberToken = req.cookies[cookieName];

		if (rememberToken) {
			try {
				// Validate token
				const tokenData = await db.validateRememberToken(rememberToken);
				if (tokenData) {
					// Get user info from database by ID
					const user = await db.getUserById(tokenData.userId);

					if (user) {
						// Restore session
						req.session.authenticated = true;
						req.session.username = user.username;
						req.session.role = user.role || 'basic';

						// Rotate token (create new, revoke old)
						const rememberTokenDays = Number.parseInt(process.env.REMEMBER_TOKEN_DAYS, 10) || 30;
						const expiresAt = new Date();
						expiresAt.setDate(expiresAt.getDate() + rememberTokenDays);
						const expiresAtISO = expiresAt.toISOString();

						const userAgent = req.headers['user-agent'] || null;
						const ipAddress = req.ip || req.connection.remoteAddress || null;

						const {token: newToken} = await db.rotateRememberToken(
							tokenData.tokenId,
							tokenData.userId,
							expiresAtISO,
							userAgent,
							ipAddress
						);

						// Update cookie with new token
						const isProduction = process.env.NODE_ENV === 'production';
						const maxAge = rememberTokenDays * 24 * 60 * 60 * 1000;
						res.cookie(cookieName, newToken, {
							httpOnly: true,
							secure: isProduction,
							sameSite: 'lax',
							maxAge: maxAge
						});
					}
				} else {
					// Invalid or expired token, clear cookie
					res.clearCookie(cookieName);
				}
			} catch (error) {
				console.error('Error restoring session from remember token:', error);
				// Clear invalid cookie
				res.clearCookie(cookieName);
			}
		}
	}
	next();
});

// CSRF Protection
// Set CSRF token cookie for all requests
app.use(csrf.setCsrfToken);

// Apply CSRF validation to state-changing requests
app.use(csrf.csrfProtection);

// Serve static files from public directory with caching
const LONG_CACHE_ASSETS = /\.(?<temp1>woff2?|ttf|svg|jpg|jpeg|png|gif|ico)$/;
const SHORT_CACHE_ASSETS = /\.(?<temp1>css|js)$/;

app.use(express.static(path.join(__dirname, '..', 'public'), {
	// Prevent automatic index.html serving so auth guard can handle "/"
	index: false,
	// Default to no cache; setHeaders will assign asset-specific policies
	maxAge: 0,
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
			// Keep CSS/JS on a short leash so updates propagate quickly after deploys
			if (SHORT_CACHE_ASSETS.test(filePath)) {
				res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
			} else if (LONG_CACHE_ASSETS.test(filePath)) {
				// Allow long-lived caching for binary assets
				res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
			}
		}
	}
}));

// Fallback for CSS files - return empty CSS if file doesn't exist (prevents HTML 404)
app.use((req, res, next) => {
	if (req.path.endsWith('.css') && !res.headersSent) {
		// Ensure publicRoot ends with a path separator for proper containment checking
		const rawPublicRoot = path.resolve(__dirname, '..', 'public');
		const publicRoot = rawPublicRoot.endsWith(path.sep) ? rawPublicRoot : rawPublicRoot + path.sep;
		let cssPath, resolvedPath = '';
		try {
			// Construct the absolute path to the requested CSS file
			cssPath = path.resolve(publicRoot, `.${  req.path}`);
			// Only proceed if the target is strictly within the public directory
			// (use normalized version for test, prior to reading)
			if (cssPath.startsWith(publicRoot) && fs.existsSync(cssPath)) {
				resolvedPath = fs.realpathSync(cssPath);
			}
		} catch {
			// If any error occurs, treat as not found
			resolvedPath = '';
		}
		// Check containment in the public directory after resolving symlinks
		if (!resolvedPath || !resolvedPath.startsWith(publicRoot)) {
			// Return empty CSS with correct MIME type instead of HTML 404
			res.type('text/css');
			return res.status(200).send('/* CSS file not found */');
		}
	}
	next();
});

app.post('/telemetry', (req, res) => {
	try {
		const rawTelemetryData = req.body;

		// Basic validation
		if (!rawTelemetryData || typeof rawTelemetryData !== 'object') {
			const receivedAt = new Date().toISOString();
			// Store discarded event as general error
			db.storeDiscardedEvent(rawTelemetryData || {}, 'Event discarded: invalid telemetry data (not an object)', receivedAt).catch(err => {
				console.error('Error storing discarded event:', err);
			});
			return res.status(400).json({
				status: 'error',
				message: 'Invalid telemetry data: expected JSON object'
			});
		}

		// Validate against unified JSON schema (v1 or v2)
		const valid = validate(rawTelemetryData);
		if (!valid) {
			const receivedAt = new Date().toISOString();
			const validationErrors = validate.errors.map(err => ({
				field: err.instancePath || err.params?.missingProperty || 'root',
				message: err.message
			}));
			const errorMessages = validationErrors.map(err => `${err.field}: ${err.message}`).join('; ');
			// Store discarded event as general error
			db.storeDiscardedEvent(rawTelemetryData, `Event discarded: schema validation failed (${errorMessages})`, receivedAt).catch(err => {
				console.error('Error storing discarded event:', err);
			});
			return res.status(400).json({
				status: 'error',
				message: 'Validation failed',
				errors: validationErrors
			});
		}

		// Parse raw event to TelemetryEvent (handles both v1 and v2 automatically)
		let telemetryEvent;
		try {
			telemetryEvent = parseTelemetryEvent(rawTelemetryData);
		} catch (parseError) {
			console.error('Error parsing telemetry event:', parseError);
			const receivedAt = new Date().toISOString();
			// Store discarded event as general error
			db.storeDiscardedEvent(rawTelemetryData, `Event discarded: parsing failed (${parseError.message})`, receivedAt).catch(err => {
				console.error('Error storing discarded event:', err);
			});
			return res.status(400).json({
				status: 'error',
				message: 'Failed to parse telemetry event',
				details: parseError.message
			});
		}

		// Set received timestamp
		const receivedAt = new Date().toISOString();
		telemetryEvent.receivedAt = receivedAt;

		// Skip storing events that do not include a username/userId
		// Exception: For area 'session', only 'session_start' requires username
		// (server_boot and client_connect happen before authentication)
		const userId = telemetryEvent.getUserId();
		const allowMissingUser = telemetryEvent.data?.allowMissingUser === true;
		const isSessionEventWithoutStart = telemetryEvent.area === 'session' && telemetryEvent.event !== 'session_start';

		// Debug logging
		if (process.env.REST_DEBUG) {
			console.log('[DEBUG] Username validation:', {
				area: telemetryEvent.area,
				event: telemetryEvent.event,
				userId: userId,
				allowMissingUser: allowMissingUser,
				isSessionEventWithoutStart: isSessionEventWithoutStart,
				willReject: !userId && !allowMissingUser && !isSessionEventWithoutStart
			});
		}

		if (!userId
			&& !['server_boot', 'client_connect'].includes(telemetryEvent.event)
			&& !allowMissingUser
			&& !isSessionEventWithoutStart) {
			console.warn('Dropping telemetry event without username/userId');
			// Store discarded event as general error
			db.storeDiscardedEvent(rawTelemetryData, 'Event discarded: missing username/userId', receivedAt).catch(err => {
				console.error('Error storing discarded event:', err);
			});
			return res.status(202).json({
				status: 'ignored',
				reason: 'missing_username',
				receivedAt: receivedAt
			});
		}

		// Store in database (non-blocking - don't await to avoid blocking response)
		db.storeEvent(telemetryEvent, receivedAt).then((stored) => {
			if (stored) {
				// Clear relevant caches when new data arrives
				statsCache.clear();
				sessionsCache.clear();
				userIdsCache.clear();
			}
		}).catch(err => {
			console.error('Error storing telemetry event:', err);
			// Don't fail the request if storage fails - telemetry is non-critical
		});

		// Return success response
		res.status(200).json({
			status: 'ok',
			receivedAt: receivedAt
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
			const dbType = process.env.DB_TYPE || 'sqlite';
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
				version: JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).version,
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

// Alternative health check endpoint for Kubernetes/Render compatibility
app.get('/healthz', async (req, res) => {
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
			const dbType = process.env.DB_TYPE || 'sqlite';
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
				version: JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).version,
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
		const rememberMe = req.body.rememberMe === true || req.body.rememberMe === 'true' || req.body.rememberMe === 'on';

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
			const userInfo = authResult.user || {username, role: 'basic'};
			req.session.authenticated = true;
			req.session.username = userInfo.username;
			req.session.role = userInfo.role;

			// Handle remember me token
			if (rememberMe) {
				try {
					// Get user ID from database
					const user = await db.getUserByUsername(userInfo.username);
					if (user && user.id) {
						// Check active tokens limit (max 3 per user)
						const activeCount = await db.getActiveRememberTokensCount(user.id);
						if (activeCount >= 3) {
							// Revoke all existing tokens for this user to enforce limit
							await db.revokeAllRememberTokensForUser(user.id);
						}

						// Calculate expiration (default 30 days, configurable)
						const rememberTokenDays = Number.parseInt(process.env.REMEMBER_TOKEN_DAYS, 10) || 30;
						const expiresAt = new Date();
						expiresAt.setDate(expiresAt.getDate() + rememberTokenDays);
						const expiresAtISO = expiresAt.toISOString();

						// Get user agent and IP for tracking
						const userAgent = req.headers['user-agent'] || null;
						const ipAddress = req.ip || req.connection.remoteAddress || null;

						// Create remember token
						const {token} = await db.createRememberToken(user.id, expiresAtISO, userAgent, ipAddress);

						// Set remember token cookie
						const cookieName = process.env.REMEMBER_COOKIE_NAME || 'remember_token';
						const isProduction = process.env.NODE_ENV === 'production';
						const maxAge = rememberTokenDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds

						res.cookie(cookieName, token, {
							httpOnly: true,
							secure: isProduction,
							sameSite: 'lax',
							maxAge: maxAge
						});
					}
				} catch (error) {
					console.error('Error creating remember token:', error);
					// Don't fail login if remember token creation fails
				}
			}

			// Log successful login
			try {
				const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || null;
				const userAgent = req.headers['user-agent'] || null;
				await db.logUserLogin(username, ipAddress, userAgent);
			} catch (logError) {
				console.error('Error logging user login:', logError);
				// Don't fail login if logging fails
			}

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
		}
			// Log failed login attempt
			try {
				const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || null;
				const userAgent = req.headers['user-agent'] || null;
				await db.logUserLoginAttempt(username, ipAddress, userAgent, 'Invalid username or password');
			} catch (logError) {
				console.error('Error logging failed login attempt:', logError);
				// Don't fail the error response if logging fails
			}

			// If it's a form submission, redirect back with error
			if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
				return res.redirect('/login?error=invalid_credentials');
			}

			return res.status(401).json({
				status: 'error',
				message: 'Invalid username or password'
			});

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

app.post('/logout', async (req, res) => {
	// Revoke remember token if present
	const cookieName = process.env.REMEMBER_COOKIE_NAME || 'remember_token';
	const rememberToken = req.cookies[cookieName];

	if (rememberToken) {
		try {
			const tokenData = await db.validateRememberToken(rememberToken);
			if (tokenData) {
				await db.revokeRememberToken(tokenData.tokenId);
			}
		} catch (error) {
			console.error('Error revoking remember token on logout:', error);
		}
		// Clear remember token cookie
		res.clearCookie(cookieName);
	}

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
		role: isAuthenticated && req.session?.role? auth.normalizeRole(req.session.role): null,
		csrfToken: csrf.getToken(req)
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
		const {username, password, role} = req.body;

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
		const {username} = req.params;

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
		const {username} = req.params;
		const {password} = req.body;

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
		const {username} = req.params;
		const {role} = req.body;

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

// People API endpoints
app.get('/api/people', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const people = await db.getAllPeople();
		res.json({
			status: 'ok',
			people: people
		});
	} catch (error) {
		console.error('Error fetching people:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch people'
		});
	}
});

app.post('/api/people', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const {name, email, initials} = req.body;

		if (!name || name.trim() === '') {
			return res.status(400).json({
				status: 'error',
				message: 'Name is required'
			});
		}

		const person = await db.createPerson(name, email || null, initials || null);

		res.status(201).json({
			status: 'ok',
			person: person,
			message: 'Person created successfully'
		});
	} catch (error) {
		console.error('Error creating person:', error);
		res.status(500).json({
			status: 'error',
			message: error.message || 'Failed to create person'
		});
	}
});

app.get('/api/people/:id', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const personId = Number.parseInt(req.params.id, 10);
		if (Number.isNaN(personId)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid person ID'
			});
		}

		const person = await db.getPersonById(personId);
		if (!person) {
			return res.status(404).json({
				status: 'error',
				message: 'Person not found'
			});
		}

		res.json({
			status: 'ok',
			person
		});
	} catch (error) {
		console.error('Error fetching person:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch person'
		});
	}
});

app.put('/api/people/:id', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const personId = Number.parseInt(req.params.id, 10);
		if (Number.isNaN(personId)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid person ID'
			});
		}

		const {name, email, initials} = req.body;

		if (!name || name.trim() === '') {
			return res.status(400).json({
				status: 'error',
				message: 'Name is required'
			});
		}

		// Verify person exists
		const people = await db.getAllPeople();
		const existingPerson = people.find(p => p.id === personId);
		if (!existingPerson) {
			return res.status(404).json({
				status: 'error',
				message: 'Person not found'
			});
		}

		const updatedPerson = await db.updatePerson(personId, name, email || null, initials || null);

		res.json({
			status: 'ok',
			person: updatedPerson,
			message: 'Person updated successfully'
		});
	} catch (error) {
		console.error('Error updating person:', error);
		res.status(500).json({
			status: 'error',
			message: error.message || 'Failed to update person'
		});
	}
});

app.delete('/api/people/:id', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const personId = Number.parseInt(req.params.id, 10);
		if (Number.isNaN(personId)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid person ID'
			});
		}

		// Verify person exists
		const people = await db.getAllPeople();
		const existingPerson = people.find(p => p.id === personId);
		if (!existingPerson) {
			return res.status(404).json({
				status: 'error',
				message: 'Person not found'
			});
		}

		await db.deletePerson(personId);

		res.json({
			status: 'ok',
			message: 'Person deleted successfully'
		});
	} catch (error) {
		console.error('Error deleting person:', error);
		res.status(500).json({
			status: 'error',
			message: error.message || 'Failed to delete person'
		});
	}
});

// Person usernames API endpoints
app.get('/api/people/:id/usernames', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const personId = Number.parseInt(req.params.id, 10);
		if (Number.isNaN(personId)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid person ID'
			});
		}

		// Verify person exists
		const people = await db.getAllPeople();
		const person = people.find(p => p.id === personId);
		if (!person) {
			return res.status(404).json({
				status: 'error',
				message: 'Person not found'
			});
		}

		const usernames = await db.getPersonUsernames(personId);
		res.json({
			status: 'ok',
			usernames: usernames
		});
	} catch (error) {
		console.error('Error getting person usernames:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to get person usernames'
		});
	}
});

app.post('/api/people/:id/usernames', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const personId = Number.parseInt(req.params.id, 10);
		if (Number.isNaN(personId)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid person ID'
			});
		}

		const {username, org_id} = req.body;

		if (!username || username.trim() === '') {
			return res.status(400).json({
				status: 'error',
				message: 'Username is required'
			});
		}

		// Verify person exists
		const people = await db.getAllPeople();
		const person = people.find(p => p.id === personId);
		if (!person) {
			return res.status(404).json({
				status: 'error',
				message: 'Person not found'
			});
		}

		const usernameAssoc = await db.addUsernameToPerson(personId, username.trim(), org_id || null);

		res.status(201).json({
			status: 'ok',
			username: usernameAssoc,
			message: 'Username added successfully'
		});
	} catch (error) {
		console.error('Error adding username to person:', error);

		// Handle unique constraint violations
		if (error.message && error.message.includes('already associated')) {
			return res.status(409).json({
				status: 'error',
				message: error.message
			});
		}

		res.status(500).json({
			status: 'error',
			message: 'Failed to add username to person'
		});
	}
});

// Settings API endpoints
// OBSOLETE: Not used by frontend - commented out
/*
app.get('/api/settings/org-team-mappings', auth.requireAuth, async (req, res) => {
	try {
		const mappingsJson = await db.getSetting('org_team_mappings');
		let mappings = [];

		if (mappingsJson) {
			try {
				mappings = JSON.parse(mappingsJson);
				if (!Array.isArray(mappings)) {
					mappings = [];
				}
			} catch (error) {
				console.error('Error parsing org-team mappings from database:', error);
				mappings = [];
			}
		}

		res.json({
			status: 'ok',
			mappings: mappings
		});
	} catch (error) {
		console.error('Error fetching org-team mappings:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch org-team mappings'
		});
	}
});

app.post('/api/settings/org-team-mappings', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const {mappings} = req.body;

		if (!Array.isArray(mappings)) {
			return res.status(400).json({
				status: 'error',
				message: 'Mappings must be an array'
			});
		}

		// Validate mapping structure
		for (const mapping of mappings) {
			if (!mapping.orgIdentifier || !mapping.clientName || !mapping.teamName) {
				return res.status(400).json({
					status: 'error',
					message: 'Each mapping must have orgIdentifier, clientName, and teamName'
				});
			}
		}

		await db.saveSetting('org_team_mappings', JSON.stringify(mappings));

		res.json({
			status: 'ok',
			message: 'Org-team mappings saved successfully'
		});
	} catch (error) {
		console.error('Error saving org-team mappings:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to save org-team mappings'
		});
	}
});
*/

// API endpoints for viewing telemetry data
app.get('/api/events', auth.requireAuth, auth.requireRole('advanced'), async (req, res) => {
	try {
		const {
			limit = 50,
			offset = 0,
			eventType,
			area,
			serverId,
			sessionId,
			startDate,
			endDate,
			userId,
			orderBy = 'created_at',
			order = 'DESC'
		} = req.query;

		// Enforce maximum limit to prevent performance issues
		const effectiveLimit = Math.min(Number.parseInt(limit, 10), MAX_API_LIMIT);

		// Handle multiple area values (preferred over eventType for area-based filtering)
		const areas = Array.isArray(area) ? area : (area ? [area] : []);
		// Handle multiple eventType values (Express converts them to an array) - fallback for backward compatibility
		const eventTypes = Array.isArray(eventType) ? eventType : (eventType ? [eventType] : []);
		// Handle multiple userId values (Express converts them to an array)
		const userIds = Array.isArray(userId) ? userId : (userId ? [userId] : []);

		// If __none__ is in the userIds array, return no events
		if (userIds.includes('__none__')) {
			return res.json({
				events: [],
				total: 0,
				limit: Number.parseInt(limit, 10),
				offset: Number.parseInt(offset, 10)
			});
		}

		const result = await db.getEvents({
			limit: effectiveLimit,
			offset: Number.parseInt(offset, 10),
			areas: areas.length > 0 ? areas : undefined,
			eventTypes: eventTypes.length > 0 ? eventTypes : undefined,
			serverId,
			sessionId,
			startDate,
			endDate,
			userIds: userIds.length > 0 ? userIds : undefined,
			orderBy,
			order
		});

		const isUnfiltered =
      !startDate && !endDate && !eventType && !serverId && !sessionId && !userId;
		res.setHeader(
			'Cache-Control',
			isUnfiltered ? 'private, max-age=10' : 'private, max-age=5'
		); // Longer cache for unfiltered, shorter for filtered

		res.json(result);
	} catch (error) {
		console.error('Error fetching events:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch events'
		});
	}
});

app.get('/api/events/:id', auth.requireAuth, auth.requireRole('advanced'), async (req, res, next) => {
	try {
		if (req.params.id === 'deleted') {
			return next();
		}
		const eventId = Number.parseInt(req.params.id, 10);
		if (Number.isNaN(eventId)) {
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

// OBSOLETE: Not used by frontend (uses /api/daily-stats instead) - commented out
/*
app.get('/api/stats', auth.requireAuth, async (req, res) => {
	try {
		const {startDate, endDate, eventType} = req.query;

		// Use cache for basic stats queries without filters
		const cacheKey = `stats:${startDate || ''}:${endDate || ''}:${eventType || ''}`;
		const cached = statsCache.get(cacheKey);
		if (cached) {
			return res.json(cached);
		}

		const stats = await db.getStats({startDate, endDate, eventType});

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
*/

app.get('/api/event-types', auth.requireAuth, auth.requireRole('advanced'), async (req, res) => {
	try {
		const {sessionId, userId} = req.query;
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
		// Clear sessions cache to avoid corrupted cached data
		sessionsCache.clear();
		const {userId, limit, offset, includeUsersWithoutSessions} = req.query;
		// Handle multiple userId values (Express converts them to an array)
		const userIds = Array.isArray(userId) ? userId : (userId ? [userId] : []);

		// If __none__ is in the userIds array, return no sessions
		if (userIds.includes('__none__')) {
			return res.json([]);
		}

		// Parse parameters
		const limitNum = limit ? Math.min(Number.parseInt(limit, 10), 1000) : undefined; // Max 1000 to prevent abuse
		const offsetNum = offset ? Number.parseInt(offset, 10) : 0;
		const includeUsersWithoutSessionsBool = includeUsersWithoutSessions === 'true' || includeUsersWithoutSessions === '1';

		// Use cache for session queries (sanitize key to avoid cache pollution)
		// Only cache when no pagination is applied and including users without sessions (new default behavior)
		const shouldCache = !limitNum && offsetNum === 0 && includeUsersWithoutSessionsBool;
		const cacheKey = shouldCache ? `sessions:${JSON.stringify(userIds.sort())}` : null;
		if (cacheKey) {
			const cached = sessionsCache.get(cacheKey);
			if (cached) {
				return res.json(cached);
			}
		}

		const sessions = await db.getSessions({
			userIds: userIds.length > 0 ? userIds : undefined,
			limit: limitNum,
			offset: offsetNum,
			includeUsersWithoutSessions: includeUsersWithoutSessionsBool
		});

		// Cache the result only for non-paginated requests
		if (cacheKey) {
			sessionsCache.set(cacheKey, sessions);
		}

		res.json(sessions);
	} catch (error) {
		console.error('Error fetching sessions:', error);
		console.error('Error stack:', error.stack);
		console.error('Request query:', req.query);
		console.error('User:', req.user);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch sessions',
			details: error.message
		});
	}
});

// Check if user_logins table exists (temporary endpoint)
// OBSOLETE: No longer used - commented out
/*
app.get('/api/check-user-logins-table', async (req, res) => {
	try {
		let tableExists = false;
		let recordCount = 0;

		if (db.dbType === 'sqlite') {
			const result = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_logins'").get();
			tableExists = Boolean(result);

			if (tableExists) {
				const countResult = db.db.prepare("SELECT COUNT(*) as count FROM user_logins").get();
				recordCount = countResult.count;
			}
		} else {
			try {
				const result = await db.db.query("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_logins') as exists");
				tableExists = result.rows[0].exists;

				if (tableExists) {
					const countResult = await db.db.query("SELECT COUNT(*) as count FROM user_logins");
					recordCount = Number.parseInt(countResult.rows[0].count, 10);
				}
			} catch (_error) {
				// Table might not exist
				tableExists = false;
			}
		}

		res.json({
			database_type: db.dbType,
			user_logins_table_exists: tableExists,
			user_logins_record_count: recordCount,
			message: tableExists ? 'User logins table is ready' : 'User logins table does not exist'
		});
	} catch (error) {
		res.status(500).json({
			error: error.message,
			message: 'Error checking user_logins table'
		});
	}
});
*/

// User login logs endpoint (god only)
app.get('/api/user-login-logs', auth.requireAuth, auth.requireRole('god'), async (req, res) => {
	try {
		const {limit = 100, offset = 0, username, successful} = req.query;

		const options = {
			limit: Number.parseInt(limit, 10),
			offset: Number.parseInt(offset, 10)
		};

		if (username) {
			options.username = username;
		}

		if (successful !== undefined) {
			options.successful = successful === 'true' || successful === '1';
		}

		const logs = await db.getUserLoginLogs(options);

		res.json({
			status: 'ok',
			logs: logs,
			limit: options.limit,
			offset: options.offset
		});
	} catch (error) {
		console.error('Error fetching user login logs:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch login logs'
		});
	}
});

// Temporary user info endpoint (admin only) - REMOVE AFTER USE
// OBSOLETE: No longer used - commented out
/*
app.get('/api/user-info/:username', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const {username} = req.params;

		if (!username) {
			return res.status(400).json({error: 'Username is required'});
		}

		const user = await db.getUserByUsername(username);
		if (!user) {
			return res.status(404).json({error: 'User not found'});
		}

		// Return user info without sensitive data
		res.json({
			username: user.username,
			role: user.role,
			id: user.id,
			created_at: user.created_at,
			last_login: user.last_login
		});
	} catch (error) {
		console.error('Error getting user info:', error);
		res.status(500).json({error: 'Failed to get user info'});
	}
});
*/

// Temporary user management endpoint (admin only) - REMOVE AFTER USE
// OBSOLETE: No longer used - commented out
/*
app.post('/api/manage-user', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const {action, username, role} = req.body;

		if (!action || !username) {
			return res.status(400).json({error: 'Action and username are required'});
		}

		// Special action to change user role to god
		if (action === 'make_god' && username && role === 'god') {
			const user = await db.getUserByUsername(username);
			if (!user) {
				return res.status(404).json({error: 'User not found'});
			}

			// Update user role to god
			await db.updateUserRole(user.id, 'god');

			return res.json({
				message: `User ${username} role changed to god successfully`,
				user: {id: user.id, username, role: 'god'}
			});
		}

		return res.status(400).json({error: 'Invalid action'});
	} catch (error) {
		console.error('Error managing user:', error);
		res.status(500).json({error: 'Failed to manage user'});
	}
});
*/

// Temporary user creation endpoint (admin only) - REMOVE AFTER USE
// OBSOLETE: No longer used - commented out
/*
app.post('/api/create-user', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const {username, password, role} = req.body;

		if (!username || !password || !role) {
			return res.status(400).json({error: 'Username, password, and role are required'});
		}

		// Special handling for god user creation
		if (username === 'god' && role === 'god') {
			// Check if god user already exists
			const existing = await db.getUserByUsername('god');
			if (existing) {
				return res.status(409).json({error: 'God user already exists'});
			}

			// Hash password "metria"
			const bcrypt = await import('bcrypt');
			const hashedPassword = await bcrypt.default.hash('metria', 10);

			// Create god user
			const userId = await db.createUser('god', hashedPassword, 'god');

			return res.json({
				message: 'God user created successfully',
				user: {id: userId, username: 'god', role: 'god'}
			});
		}

		// Regular user creation
		const existing = await db.getUserByUsername(username);
		if (existing) {
			return res.status(409).json({error: 'User already exists'});
		}

		const bcrypt = await import('bcrypt');
		const hashedPassword = await bcrypt.default.hash(password, 10);
		const userId = await db.createUser(username, hashedPassword, role);

		res.json({
			message: 'User created successfully',
			user: {id: userId, username, role}
		});
	} catch (error) {
		console.error('Error creating user:', error);
		res.status(500).json({error: 'Failed to create user'});
	}
});
*/

app.get('/api/daily-stats', auth.requireAuth, async (req, res) => {
	try {
		const days = Number.parseInt(req.query.days, 10) || 30;
		const byEventTypeRaw = String(req.query.byEventType || '').toLowerCase();
		const useEventTypeBreakdown = ['true', '1', 'yes', 'on'].includes(byEventTypeRaw);

		const stats = useEventTypeBreakdown? await db.getDailyStatsByEventType(days): await db.getDailyStats(days);

		res.json(stats);
	} catch (error) {
		console.error('Error fetching daily stats:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch daily statistics'
		});
	}
});

app.get('/api/tool-usage-stats', auth.requireAuth, async (req, res) => {
	try {
		const daysRaw = Number.parseInt(req.query.days, 10);
		const days = Math.min(Math.max(1, Number.isFinite(daysRaw) ? daysRaw : 30), 365);
		const tools = await db.getToolUsageStats(days);
		res.json({tools, days});
	} catch (error) {
		console.error('Error fetching tool usage stats:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch tool usage statistics'
		});
	}
});

app.get('/api/top-users-today', auth.requireAuth, async (req, res) => {
	try {
		const limitRaw = Number.parseInt(req.query.limit, 10);
		const daysRaw = Number.parseInt(req.query.days, 10);
		const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 3), 500);
		const days = Math.min(Math.max(1, Number.isFinite(daysRaw) ? daysRaw : 3), 365);
		const users = await db.getTopUsersLastDays(limit, days);
		res.json({users, days});
	} catch (error) {
		console.error('Error fetching top users for the selected window:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch top users for the selected window'
		});
	}
});

app.get('/api/top-teams-today', auth.requireAuth, async (req, res) => {
	try {
		const limitRaw = Number.parseInt(req.query.limit, 10);
		const daysRaw = Number.parseInt(req.query.days, 10);
		const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 5), 500);
		const days = Math.min(Math.max(1, Number.isFinite(daysRaw) ? daysRaw : 3), 365);

		// Parse org-team mappings from query parameter
		let orgTeamMappings = [];
		try {
			if (req.query.mappings) {
				orgTeamMappings = JSON.parse(req.query.mappings);
			}
		} catch (error) {
			console.warn('Invalid org-team mappings provided, using empty array:', error);
		}

		const teams = await db.getTopTeamsLastDays(orgTeamMappings, limit, days);
		res.json({teams, days});
	} catch (error) {
		console.error('Error fetching top teams for the selected window:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch top teams for the selected window'
		});
	}
});

app.get('/api/team-stats', auth.requireAuth, auth.requireRole('advanced'), async (_req, res) => {
	try {
		const mappingsJson = await db.getSetting('org_team_mappings');
		let mappings = [];
		if (mappingsJson) {
			try {
				const parsed = JSON.parse(mappingsJson);
				mappings = Array.isArray(parsed) ? parsed : [];
			} catch (error) {
				console.warn('Error parsing org-team mappings, using empty array:', error);
				mappings = [];
			}
		}

		const teams = await db.getTeamStats(mappings);
		res.json({teams});
	} catch (error) {
		console.error('Error fetching team stats:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch team stats'
		});
	}
});

// Teams API endpoints
app.get('/api/teams', auth.requireAuth, auth.requireRole('advanced'), async (req, res) => {
	try {
		const teams = await db.getAllTeams();
		res.json({
			status: 'ok',
			teams
		});
	} catch (error) {
		console.error('Error fetching teams:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch teams'
		});
	}
});

app.get('/api/teams/:id', auth.requireAuth, auth.requireRole('advanced'), async (req, res) => {
	try {
		const teamId = Number.parseInt(req.params.id, 10);
		if (Number.isNaN(teamId)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid team ID'
			});
		}

		const team = await db.getTeamById(teamId);
		if (!team) {
			return res.status(404).json({
				status: 'error',
				message: 'Team not found'
			});
		}

		res.json({
			status: 'ok',
			team
		});
	} catch (error) {
		console.error('Error fetching team:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch team'
		});
	}
});

app.post('/api/teams', auth.requireAuth, auth.requireRole('administrator'), (req, res, next) => {
	upload.single('logo')(req, res, async (err) => {
		if (err) {
			if (err instanceof multer.MulterError) {
				if (err.code === 'LIMIT_FILE_SIZE') {
					return res.status(400).json({
						status: 'error',
						message: 'Logo file is too large. Maximum size is 2MB.'
					});
				}
				return res.status(400).json({
					status: 'error',
					message: err.message
				});
			}
			if (err.message.includes('Invalid file type')) {
				return res.status(400).json({
					status: 'error',
					message: err.message
				});
			}
			return next(err);
		}

		// Process logo if uploaded
		if (req.file) {
			try {
				const processed = await processTeamLogo(req.file.buffer, req.file.mimetype);
				req.file.buffer = processed.data;
				req.file.mimetype = processed.mime;
				req.file.size = processed.size;

				// Log processing info
			} catch (processError) {
				console.error('Logo processing error:', processError);
				return res.status(400).json({
					status: 'error',
					message: `Failed to process logo image: ${  processError.message}`
				});
			}
		}

		next();
	});
}, async (req, res) => {
	try {
		const {name, color, logo_url} = req.body;

		if (!name || typeof name !== 'string' || name.trim() === '') {
			return res.status(400).json({
				status: 'error',
				message: 'Team name is required'
			});
		}

		let logoData = null;
		let logoMime = null;
		if (req.file) {
			logoData = req.file.buffer;
			logoMime = req.file.mimetype;
		}

		const team = await db.createTeam(name.trim(), color || null, logo_url || null, logoData, logoMime);
		res.status(201).json({
			status: 'ok',
			team
		});
	} catch (error) {
		console.error('Error creating team:', error);
		if (error.message.includes('already exists')) {
			return res.status(409).json({
				status: 'error',
				message: error.message
			});
		}
		res.status(500).json({
			status: 'error',
			message: 'Failed to create team'
		});
	}
});

app.put('/api/teams/:id', auth.requireAuth, auth.requireRole('administrator'), (req, res, next) => {
	upload.single('logo')(req, res, async (err) => {
		if (err) {
			if (err instanceof multer.MulterError) {
				if (err.code === 'LIMIT_FILE_SIZE') {
					return res.status(400).json({
						status: 'error',
						message: 'Logo file is too large. Maximum size is 2MB.'
					});
				}
				return res.status(400).json({
					status: 'error',
					message: err.message
				});
			}
			if (err.message.includes('Invalid file type')) {
				return res.status(400).json({
					status: 'error',
					message: err.message
				});
			}
			return next(err);
		}

		// Process logo if uploaded
		if (req.file) {
			try {
				const processed = await processTeamLogo(req.file.buffer, req.file.mimetype);
				req.file.buffer = processed.data;
				req.file.mimetype = processed.mime;
				req.file.size = processed.size;

				// Log processing info
			} catch (processError) {
				console.error('Logo processing error:', processError);
				return res.status(400).json({
					status: 'error',
					message: `Failed to process logo image: ${  processError.message}`
				});
			}
		}

		next();
	});
}, async (req, res) => {
	try {
		const teamId = Number.parseInt(req.params.id, 10);
		if (Number.isNaN(teamId)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid team ID'
			});
		}

		const {name, color, logo_url, remove_logo} = req.body;
		const updates = {};
		if (name !== undefined) {updates.name = name;}
		if (color !== undefined) {updates.color = color;}
		if (logo_url !== undefined) {updates.logo_url = logo_url;}

		// Handle logo file upload
		if (req.file) {
			updates.logo_data = req.file.buffer;
			updates.logo_mime = req.file.mimetype;
		} else if (remove_logo === 'true' || remove_logo === true) {
			// Allow removing logo by setting to null
			updates.logo_data = null;
			updates.logo_mime = null;
		}

		if (Object.keys(updates).length === 0) {
			return res.status(400).json({
				status: 'error',
				message: 'No updates provided'
			});
		}

		const updated = await db.updateTeam(teamId, updates);
		if (!updated) {
			return res.status(404).json({
				status: 'error',
				message: 'Team not found'
			});
		}

		const team = await db.getTeamById(teamId);
		res.json({
			status: 'ok',
			team
		});
	} catch (error) {
		console.error('Error updating team:', error);
		if (error.message.includes('already exists')) {
			return res.status(409).json({
				status: 'error',
				message: error.message
			});
		}
		res.status(500).json({
			status: 'error',
			message: 'Failed to update team'
		});
	}
});

app.get('/api/teams/:id/logo', auth.requireAuth, async (req, res) => {
	try {
		const teamId = Number.parseInt(req.params.id, 10);
		if (Number.isNaN(teamId)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid team ID'
			});
		}

		const logo = await db.getTeamLogo(teamId);
		if (!logo) {
			return res.status(404).json({
				status: 'error',
				message: 'Logo not found'
			});
		}

		res.setHeader('Content-Type', logo.mime);
		res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
		res.send(logo.data);
	} catch (error) {
		console.error('Error fetching team logo:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch team logo'
		});
	}
});

app.delete('/api/teams/:id', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const teamId = Number.parseInt(req.params.id, 10);
		if (Number.isNaN(teamId)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid team ID'
			});
		}

		const deleted = await db.deleteTeam(teamId);
		if (!deleted) {
			return res.status(404).json({
				status: 'error',
				message: 'Team not found'
			});
		}

		res.json({
			status: 'ok',
			message: 'Team deleted successfully'
		});
	} catch (error) {
		console.error('Error deleting team:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to delete team'
		});
	}
});

// Orgs API endpoints
app.get('/api/orgs', auth.requireAuth, auth.requireRole('advanced'), async (req, res) => {
	try {
		const orgs = await db.getAllOrgsWithTeams();
		res.json({
			status: 'ok',
			orgs
		});
	} catch (error) {
		console.error('Error fetching orgs:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch orgs'
		});
	}
});

app.post('/api/orgs', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const {id, alias, color, team_id, company_name} = req.body;

		if (!id || typeof id !== 'string' || id.trim() === '') {
			return res.status(400).json({
				status: 'error',
				message: 'Org ID is required'
			});
		}

		const org = await db.upsertOrg(id.trim(), {
			alias: alias || null,
			color: color || null,
			team_id: team_id || null,
			company_name: company_name || null
		});

		res.status(201).json({
			status: 'ok',
			org
		});
	} catch (error) {
		console.error('Error creating/updating org:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to create/update org'
		});
	}
});

// OBSOLETE: Not used by frontend - commented out
/*
app.put('/api/orgs/:id', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const orgId = req.params.id;
		const {alias, color, team_id, company_name} = req.body;

		const org = await db.upsertOrg(orgId, {
			alias: alias !== undefined ? alias : undefined,
			color: color !== undefined ? color : undefined,
			team_id: team_id !== undefined ? team_id : undefined,
			company_name: company_name !== undefined ? company_name : undefined
		});

		res.json({
			status: 'ok',
			org
		});
	} catch (error) {
		console.error('Error updating org:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to update org'
		});
	}
});
*/

app.post('/api/orgs/:id/move', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const orgId = req.params.id;
		const {team_id} = req.body;

		if (team_id !== null && team_id !== undefined && (Number.isNaN(team_id) || Number.parseInt(team_id, 10) < 1)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid team_id'
			});
		}

		const moved = await db.moveOrgToTeam(orgId, team_id ? Number.parseInt(team_id, 10) : null);
		if (!moved) {
			return res.status(404).json({
				status: 'error',
				message: 'Org not found'
			});
		}

		res.json({
			status: 'ok',
			message: 'Org moved successfully'
		});
	} catch (error) {
		console.error('Error moving org:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to move org'
		});
	}
});

// User-team assignment endpoint
// OBSOLETE: Not used by frontend - commented out
/*
app.post('/api/users/:id/assign-team', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const userId = Number.parseInt(req.params.id, 10);
		const {team_id} = req.body;

		if (Number.isNaN(userId)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid user ID'
			});
		}

		if (team_id !== null && team_id !== undefined && (Number.isNaN(team_id) || Number.parseInt(team_id, 10) < 1)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid team_id'
			});
		}

		const assigned = await db.assignUserToTeam(userId, team_id ? Number.parseInt(team_id, 10) : null);
		if (!assigned) {
			return res.status(404).json({
				status: 'error',
				message: 'User not found'
			});
		}

		res.json({
			status: 'ok',
			message: 'User assigned to team successfully'
		});
	} catch (error) {
		console.error('Error assigning user to team:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to assign user to team'
		});
	}
});
*/

// Event user management endpoints
// Get all unique event user names from telemetry data
app.get('/api/event-users', auth.requireAuth, auth.requireRole('advanced'), async (req, res) => {
	try {
		const userNames = await db.getEventUserNames();
		res.json({
			status: 'ok',
			users: userNames
		});
	} catch (error) {
		console.error('Error fetching event user names:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch event users'
		});
	}
});

// Add event user to team
app.post('/api/teams/:teamId/event-users', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const teamId = Number.parseInt(req.params.teamId, 10);
		const {user_name} = req.body;

		if (Number.isNaN(teamId)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid team ID'
			});
		}

		if (!user_name || typeof user_name !== 'string' || user_name.trim() === '') {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid user_name'
			});
		}

		const result = await db.addEventUserToTeam(teamId, user_name.trim());
		res.json(result);
	} catch (error) {
		console.error('Error adding event user to team:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to add event user to team'
		});
	}
});

// Remove event user from team
app.delete('/api/teams/:teamId/event-users/:userName', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const teamId = Number.parseInt(req.params.teamId, 10);
		const userName = req.params.userName;

		if (Number.isNaN(teamId)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid team ID'
			});
		}

		if (!userName) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid user name'
			});
		}

		const result = await db.removeEventUserFromTeam(teamId, userName);
		res.json(result);
	} catch (error) {
		console.error('Error removing event user from team:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to remove event user from team'
		});
	}
});

app.get('/api/telemetry-users', auth.requireAuth, auth.requireRole('advanced'), async (req, res) => {
	try {
		const {limit, offset} = req.query;

		// Parse limit and offset with defaults
		const limitNum = limit ? Math.min(Number.parseInt(limit, 10), 1000) : undefined; // Max 1000 to prevent abuse
		const offsetNum = offset ? Number.parseInt(offset, 10) : 0;

		// Use cache only for full list (no pagination)
		const shouldCache = !limitNum && offsetNum === 0;
		const cacheKey = shouldCache ? 'userStats:all' : null;
		if (cacheKey) {
			const cached = userIdsCache.get(cacheKey);
			if (cached) {
				return res.json(cached);
			}
		}

		const userStats = await db.getUserEventStats({
			limit: limitNum,
			offset: offsetNum
		});

		// Cache the result only for full list
		if (cacheKey) {
			userIdsCache.set(cacheKey, userStats);
		}

		res.json(userStats);
	} catch (error) {
		console.error('Error fetching user event stats:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch user event stats'
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

		const {size, maxSize} = sizeInfo;
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
			displayText: maxSize? `${percentage}% (${sizeFormatted} / ${maxSizeFormatted})`: sizeFormatted
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
	if (bytes === 0) {return '0 Bytes';}
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100  } ${  sizes[i]}`;
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
app.get('/teams', auth.requireAuth, auth.requireRole('administrator'), (_req, res) => {
	const teamsPath = path.join(__dirname, '..', 'public', 'teams.html');
	if (fs.existsSync(teamsPath)) {
		res.sendFile(teamsPath);
	} else {
		res.status(404).send('Teams page not found');
	}
});

app.get('/logs', auth.requireAuth, auth.requireRole('advanced'), (_req, res) => {
	const eventLogPath = path.join(__dirname, '..', 'public', 'event-log.html');
	if (fs.existsSync(eventLogPath)) {
		res.sendFile(eventLogPath);
	} else {
		res.status(404).send('Event logs page not found');
	}
});

app.get('/people', auth.requireAuth, auth.requireRole('administrator'), (_req, res) => {
	const peoplePath = path.join(__dirname, '..', 'public', 'people.html');
	if (fs.existsSync(peoplePath)) {
		res.sendFile(peoplePath);
	} else {
		res.status(404).send('People page not found');
	}
});

// Temporary debug route without authentication
// OBSOLETE: Temporary debug endpoint - commented out
/*
app.get('/people-debug', (_req, res) => {
	const peoplePath = path.join(__dirname, '..', 'public', 'people.html');
	if (fs.existsSync(peoplePath)) {
		res.sendFile(peoplePath);
	} else {
		res.status(404).send('People page not found');
	}
});
*/

// Serve OpenAPI specification
app.get('/api-spec', auth.requireAuth, (_req, res) => {
	const specPath = path.join(__dirname, 'api', 'api-spec.yaml');
	if (fs.existsSync(specPath)) {
		res.type('text/yaml');
		res.send(fs.readFileSync(specPath, 'utf8'));
	} else {
		res.status(404).json({status: 'error', message: 'API spec not found'});
	}
});

// Serve JSON schema (public endpoint)
app.get('/schema', (_req, res) => {
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
		const effectiveLimit = Math.min(Number.parseInt(limit, 10), MAX_EXPORT_LIMIT);

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
app.delete('/api/events/:id', auth.requireAuth, auth.requireRole('advanced'), async (req, res, next) => {
	try {
		if (req.params.id === 'deleted') {
			return next();
		}
		const eventId = Number.parseInt(req.params.id, 10);
		if (Number.isNaN(eventId)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid event ID'
			});
		}

		const deleted = await db.deleteEvent(eventId);
		if (deleted) {
			statsCache.clear();
			sessionsCache.clear();
			userIdsCache.clear();
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
		const {sessionId} = req.query;

		if (sessionId) {
			const deletedCount = await db.deleteEventsBySession(sessionId);
			statsCache.clear();
			sessionsCache.clear();
			userIdsCache.clear();
			return res.json({
				status: 'ok',
				message: `Successfully deleted ${deletedCount} events from session ${sessionId}`,
				deletedCount,
				sessionId
			});
		}

		const deletedCount = await db.deleteAllEvents();
		statsCache.clear();
		sessionsCache.clear();
		userIdsCache.clear();
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

// Recover a soft deleted event
// OBSOLETE: Not used by frontend - commented out
/*
app.patch('/api/events/:id/recover', auth.requireAuth, auth.requireRole('advanced'), async (req, res) => {
	try {
		const eventId = Number.parseInt(req.params.id, 10);
		if (Number.isNaN(eventId)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid event ID'
			});
		}

		const recovered = await db.recoverEvent(eventId);
		if (!recovered) {
			return res.status(404).json({
				status: 'error',
				message: 'Event not found or not deleted'
			});
		}

		statsCache.clear();
		sessionsCache.clear();
		userIdsCache.clear();
		res.json({
			status: 'ok',
			message: 'Event recovered successfully',
			eventId
		});
	} catch (error) {
		console.error('Error recovering event:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to recover event'
		});
	}
});
*/

// Permanently delete a soft deleted event
// OBSOLETE: Not used by frontend - commented out
/*
app.delete('/api/events/:id/permanent', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const eventId = Number.parseInt(req.params.id, 10);
		if (Number.isNaN(eventId)) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid event ID'
			});
		}

		const deleted = await db.permanentlyDeleteEvent(eventId);
		if (!deleted) {
			return res.status(404).json({
				status: 'error',
				message: 'Event not found or not deleted'
			});
		}

		statsCache.clear();
		sessionsCache.clear();
		userIdsCache.clear();
		res.json({
			status: 'ok',
			message: 'Event permanently deleted',
			eventId
		});
	} catch (error) {
		console.error('Error permanently deleting event:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to permanently delete event'
		});
	}
});
*/

// Get deleted events (trash bin)
app.get('/api/events/deleted', auth.requireAuth, auth.requireRole('advanced'), async (req, res) => {
	try {
		const limit = Math.min(Number.parseInt(req.query.limit, 10) || 50, 100);
		const offset = Number.parseInt(req.query.offset, 10) || 0;
		const orderBy = req.query.orderBy || 'deleted_at';
		const order = req.query.order || 'DESC';

		const result = await db.getDeletedEvents({
			limit,
			offset,
			orderBy,
			order
		});

		res.json({
			status: 'ok',
			events: result.events,
			total: result.total,
			limit: result.limit,
			offset: result.offset
		});
	} catch (error) {
		console.error('Error getting deleted events:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to get deleted events'
		});
	}
});

// Empty trash (permanently delete all events in trash)
app.delete('/api/events/deleted', auth.requireAuth, auth.requireRole('advanced'), async (req, res) => {
	try {
		const deletedCount = await db.emptyTrash();
		res.json({
			status: 'ok',
			message: `Successfully deleted ${deletedCount} events from trash`,
			deletedCount
		});
	} catch (error) {
		console.error('Error emptying trash:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to empty trash'
		});
	}
});

// Cleanup old deleted events (permanent deletion of events deleted more than X days ago)
// OBSOLETE: Not used by frontend - commented out
/*
app.delete('/api/events/deleted/cleanup', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const daysOld = Number.parseInt(req.query.days, 10) || 30;
		if (daysOld < 1 || daysOld > 365) {
			return res.status(400).json({
				status: 'error',
				message: 'Days must be between 1 and 365'
			});
		}

		const deletedCount = await db.cleanupOldDeletedEvents(daysOld);
		statsCache.clear();
		sessionsCache.clear();
		userIdsCache.clear();
		res.json({
			status: 'ok',
			message: `Successfully permanently deleted ${deletedCount} events older than ${daysOld} days`,
			deletedCount,
			daysOld
		});
	} catch (error) {
		console.error('Error cleaning up deleted events:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to cleanup deleted events'
		});
	}
});
*/

// Export entire database
app.get('/api/database/export', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const exportData = await db.exportDatabase();

		const filename = `database-export-${new Date().toISOString().split('T')[0]}.json`;

		res.setHeader('Content-Type', 'application/json');
		res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
		res.setHeader('Cache-Control', 'no-cache');
		res.json(exportData);
	} catch (error) {
		console.error('Error exporting database:', error);
		res.status(500).json({
			status: 'error',
			message: `Failed to export database: ${  error.message}`
		});
	}
});

// Import database from JSON file
app.post('/api/database/import', auth.requireAuth, auth.requireRole('administrator'), async (req, res) => {
	try {
		const importData = req.body;

		if (!importData || !importData.tables) {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid import data format'
			});
		}

		const results = await db.importDatabase(importData);

		// Clear all caches after import
		statsCache.clear();
		sessionsCache.clear();
		userIdsCache.clear();
		healthCheckCache.clear();

		res.json({
			status: 'ok',
			message: 'Database imported successfully',
			imported: results.imported,
			errors: results.errors
		});
	} catch (error) {
		console.error('Error importing database:', error);
		res.status(500).json({
			status: 'error',
			message: `Failed to import database: ${  error.message}`
		});
	}
});

// Initialize database and start server
async function startServer() {
	try {
		await db.init();

		// Initialize authentication with database
		auth.init(db);

		// Now that database is initialized, upgrade session middleware to use PostgreSQL store if available
		const sessionResult = auth.initSessionMiddleware();
		sessionMiddleware = sessionResult.middleware;
		redisSessionClient = sessionResult.redisClient;

		app.listen(port, () => {
			console.log(`\n${  '='.repeat(60)}`);
			console.log('✅ Telemetry server is running!');
			console.log('='.repeat(60));
			console.log(`🌐 Server URL: http://localhost:${port}`);
			console.log(`📊 Dashboard:  http://localhost:${port}/`);
			console.log(`❤️  Health:     http://localhost:${port}/health (or /healthz)`);
			console.log(`📡 API:        http://localhost:${port}/api/events`);
			console.log(`📋 Schema:     http://localhost:${port}/schema`);
			console.log(`${'='.repeat(60)  }\n`);
		});
	} catch (error) {
		console.error('Failed to initialize database:', error);
		process.exit(1);
	}
}

/**
 * Graceful shutdown handler
 * Closes all active connections (Redis, database) before exiting
 */
async function gracefulShutdown(signal) {
	console.log(`${signal} received, closing connections...`);

	// Close Redis session client if it exists and is connected
	if (redisSessionClient) {
		try {
			// Only quit if the client is connected (lazyConnect: true means it may not be)
			if (redisSessionClient.isOpen) {
				await redisSessionClient.quit();
				console.log('Redis session client closed');
			} else {
				console.log('Redis session client was not connected (skipped cleanup)');
			}
		} catch (error) {
			console.error('Error closing Redis session client:', error.message);
		}
	}

	// Close database connection
	try {
		await db.close();
	} catch (error) {
		console.error('Error closing database:', error.message);
	}

	process.exit(0);
}

// Graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server
startServer();
