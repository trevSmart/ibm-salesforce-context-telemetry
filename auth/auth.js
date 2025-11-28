/**
 * Authentication module
 * Handles user authentication and session management
 */

const bcrypt = require('bcrypt');
const session = require('express-session');
const crypto = require('crypto');
const pgSession = require('connect-pg-simple')(session);

// Get credentials from environment variables (for backward compatibility)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || null;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || null; // Plain password (will be hashed on first use)
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

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

/**
 * Initialize session middleware
 * Uses PostgreSQL store if available, otherwise falls back to MemoryStore
 */
function initSessionMiddleware() {
	const isProduction = process.env.NODE_ENV === 'production';

	// Try to get PostgreSQL pool from database module
	let store = null;
	if (db) {
		const postgresPool = db.getPostgresPool ? db.getPostgresPool() : null;
		if (postgresPool) {
			// Use PostgreSQL store for sessions
			store = new pgSession({
				pool: postgresPool,
				tableName: 'session', // Table name for sessions
				createTableIfMissing: true // Automatically create session table if it doesn't exist
			});
		}
	}

	// If no PostgreSQL store, MemoryStore will be used (with warning in production)
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

	// Only set store if we have PostgreSQL, otherwise use default MemoryStore
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
	return await bcrypt.hash(password, saltRounds);
}

/**
 * Verify a password against a hash
 */
async function verifyPassword(password, hash) {
	return await bcrypt.compare(password, hash);
}

/**
 * Authenticate user credentials
 * Supports both database users and environment variable users (for backward compatibility)
 */
async function authenticate(username, password) {
	if (!username || !password) {
		return false;
	}

	// First, try to authenticate from database
	if (db) {
		try {
			const user = await db.getUserByUsername(username);
			if (user) {
				const isValid = await verifyPassword(password, user.password_hash);
				if (isValid) {
					// Update last login
					await db.updateLastLogin(username);
					return true;
				}
				return false;
			}
		} catch (error) {
			console.error('Error authenticating from database:', error);
			// Fall through to environment variable authentication
		}
	}

	// Fallback to environment variable authentication (backward compatibility)
	if (username !== ADMIN_USERNAME) {
		return false;
	}

	// If we have a plain password in env, hash it on first use
	if (ADMIN_PASSWORD && !hashedPassword) {
		hashedPassword = await hashPassword(ADMIN_PASSWORD);
		console.log('⚠️  WARNING: Using plain ADMIN_PASSWORD from environment. Consider using ADMIN_PASSWORD_HASH instead.');
	}

	// If no password is configured, deny access
	if (!hashedPassword) {
		console.error('❌ No password configured. Set ADMIN_PASSWORD or ADMIN_PASSWORD_HASH in environment variables, or create users in the database.');
		return false;
	}

	// Verify password
	return await verifyPassword(password, hashedPassword);
}

/**
 * Middleware to check if user is authenticated
 */
function requireAuth(req, res, next) {
	if (req.session && req.session.authenticated) {
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

module.exports = {
	initSessionMiddleware,
	authenticate,
	requireAuth,
	requireGuest,
	hashPassword,
	init
};
