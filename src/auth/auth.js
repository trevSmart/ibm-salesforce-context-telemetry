/**
 * Authentication module
 * Handles user authentication and session management
 */

import bcrypt from 'bcrypt';
import session from 'express-session';
import crypto from 'node:crypto';
import pgSession from 'connect-pg-simple';
import redis from 'redis';
import { RedisStore } from 'connect-redis';

// Get credentials from environment variables (for backward compatibility)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || null;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || null; // Plain password (will be hashed on first use)
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const ROLE_HIERARCHY = {
	basic: 1,
	advanced: 2,
	administrator: 3,
	god: 4
};
const ROLE_ALIASES = {
	admin: 'administrator',
	superadmin: 'administrator',
	super_admin: 'administrator',
	superadministrator: 'administrator',
	superuser: 'god',
	root: 'god',
	supreme: 'god'
};
const VALID_ROLES = Object.keys(ROLE_HIERARCHY);

// Store hashed password in memory (will be set on first login if using plain password)
let hashedPassword = ADMIN_PASSWORD_HASH;

// Database module (will be initialized later)
let db = null;

/**
 * Initialize authentication module with database
 * @param {object} databaseModule - Database module instance
 */
function init(databaseModule) {
	db = databaseModule;
}

function normalizeRole(role) {
	if (typeof role !== 'string') {
		return 'basic';
	}
	const trimmed = role.trim().toLowerCase();
	const resolved = ROLE_ALIASES[trimmed] || trimmed;
	return VALID_ROLES.includes(resolved) ? resolved : 'basic';
}

/**
 * Initialize session middleware
 * Uses PostgreSQL store if available, otherwise Redis, otherwise MemoryStore
 *
 * NOTE: This function should be called AFTER the database is initialized
 * to properly support PostgreSQL session store. If called before database
 * initialization, it will fall back to Redis or MemoryStore.
 */
function initSessionMiddleware() {
	const isProduction = process.env.NODE_ENV === 'production';

	// Try to get PostgreSQL pool from database module
	let store = null;
	if (db) {
		const postgresPool = db.getPostgresPool ? db.getPostgresPool() : null;
		if (postgresPool) {
			try {
				// Use PostgreSQL store for sessions
				// connect-pg-simple is a factory function that needs to be called with the session module
				const PgSession = pgSession(session);
				store = new PgSession({
					pool: postgresPool,
					tableName: 'session', // Table name for sessions
					createTableIfMissing: true // Automatically create session table if it doesn't exist
				});
				console.log('✅ Session store: PostgreSQL');
			} catch (error) {
				console.error('❌ Failed to initialize PostgreSQL session store:', error.message);
				console.warn('⚠️  Falling back to alternative session store');
			}
		}
	}

	// If PostgreSQL failed or not available, try Redis
	if (!store && process.env.REDIS_URL) {
		try {
			const redisClient = redis.createClient({
				url: process.env.REDIS_URL,
				socket: {
					connectTimeout: 60000,
					lazyConnect: true
				}
			});

			// Handle Redis connection errors gracefully
			redisClient.on('error', (err) => {
				console.error('❌ Redis session store error:', err.message);
			});

			store = new RedisStore({
				client: redisClient,
				prefix: 'session:',
				ttl: 24 * 60 * 60 // 24 hours in seconds
			});

			console.log('✅ Session store: Redis');
		} catch (error) {
			console.error('❌ Failed to initialize Redis session store:', error.message);
			console.warn('⚠️  Falling back to MemoryStore for sessions');
		}
	}

	// If no persistent store available, use MemoryStore
	if (!store) {
		if (isProduction) {
			console.warn('⚠️  WARNING: Using MemoryStore for sessions in production. Sessions will not persist across server restarts.');
			console.warn('⚠️  To fix this, configure one of:');
			console.warn('⚠️    - PostgreSQL: Set DB_TYPE=postgresql and DATABASE_URL');
			console.warn('⚠️    - Redis: Set REDIS_URL environment variable');
		} else {
			console.log('📦 Session store: MemoryStore (development)');
		}
	}

	const sessionConfig = {
		secret: SESSION_SECRET,
		resave: false,
		saveUninitialized: false,
		cookie: {
			secure: isProduction, // Use secure cookies in production (HTTPS)
			httpOnly: true,
			sameSite: 'lax', // Allow cookies to be sent on same-site requests and top-level navigations
			maxAge: 24 * 60 * 60 * 1000 // 24 hours
		}
	};

	// Only set store if we have a working store, otherwise use default MemoryStore
	if (store) {
		sessionConfig.store = store;
	}

	return session(sessionConfig);
}

/**
 * Hash a password
 */
async function hashPassword(password) {
	const saltRounds = 10;
	return bcrypt.hash(password, saltRounds);
}

/**
 * Verify a password against a hash
 */
async function verifyPassword(password, hash) {
	return bcrypt.compare(password, hash);
}

/**
 * Authenticate user credentials
 * Supports both database users and environment variable users (for backward compatibility)
 */
async function authenticate(username, password) {
	if (!username || !password) {
		return {success: false};
	}

	// First, try to authenticate from database
	if (db) {
		try {
			const user = await db.getUserByUsername(username);
			if (user) {
				const isValid = await verifyPassword(password, user.password_hash);
				if (isValid) {
					const role = normalizeRole(user.role);
					// Update last login
					await db.updateLastLogin(username);
					return {
						success: true,
						user: {
							username: user.username,
							role
						}
					};
				}
				return {success: false};
			}
		} catch (error) {
			console.error('Error authenticating from database:', error);
			// Fall through to environment variable authentication
		}
	}

	// Fallback to environment variable authentication (backward compatibility)
	if (username !== ADMIN_USERNAME) {
		return {success: false};
	}

	// If we have a plain password in env, hash it on first use
	if (ADMIN_PASSWORD && !hashedPassword) {
		hashedPassword = await hashPassword(ADMIN_PASSWORD);
		console.log('⚠️  WARNING: Using plain ADMIN_PASSWORD from environment. Consider using ADMIN_PASSWORD_HASH instead.');
	}

	// If no password is configured, deny access
	if (!hashedPassword) {
		console.error('❌ No password configured. Set ADMIN_PASSWORD or ADMIN_PASSWORD_HASH in environment variables, or create users in the database.');
		return {success: false};
	}

	// Verify password
	const isValid = await verifyPassword(password, hashedPassword);
	return isValid? {
			success: true,
			user: {
				username: ADMIN_USERNAME,
				role: 'administrator'
			}
		}: {success: false};
}

/**
 * Middleware to check if user is authenticated
 */
function requireAuth(req, res, next) {
	if (req.session && req.session.authenticated) {
		req.session.role = normalizeRole(req.session.role);
		return next();
	}

	// For API requests, return JSON error
	if (req.path.startsWith('/api/')) {
		return res.status(401).json({
			status: 'error',
			message: 'Authentication required'
		});
	}

	// For web requests, redirect to login
	res.redirect('/login');
}

/**
 * Middleware to check if user is already logged in (redirect to home)
 */
function requireGuest(req, res, next) {
	if (req.session && req.session.authenticated) {
		return res.redirect('/');
	}
	next();
}

function getSessionRole(req) {
	if (req && req.session && req.session.role) {
		return normalizeRole(req.session.role);
	}
	return 'basic';
}

/**
 * Middleware factory to require a minimum role
 * @param {'basic'|'advanced'|'administrator'} requiredRole
 */
function requireRole(requiredRole) {
	const normalizedRequired = normalizeRole(requiredRole);
	const requiredLevel = ROLE_HIERARCHY[normalizedRequired] || ROLE_HIERARCHY.basic;

	return function roleGuard(req, res, next) {
		if (!req.session || !req.session.authenticated) {
			return requireAuth(req, res, next);
		}

		const userRole = getSessionRole(req);
		const userLevel = ROLE_HIERARCHY[userRole] || 0;

		if (userLevel >= requiredLevel) {
			return next();
		}

		if (req.path.startsWith('/api/')) {
			return res.status(403).json({
				status: 'error',
				message: 'Insufficient permissions'
			});
		}

		return res.redirect('/');
	};
}

export {
	initSessionMiddleware,
	authenticate,
	requireAuth,
	requireGuest,
	hashPassword,
	init,
	requireRole,
	normalizeRole,
	SESSION_SECRET
};
