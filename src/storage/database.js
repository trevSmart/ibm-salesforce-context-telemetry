/**
 * Database storage module for telemetry events
 *
 * Supports multiple database backends:
 * - SQLite (default, for development and small deployments)
 * - PostgreSQL (for production)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
import {TelemetryEvent} from './telemetry-event.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database configuration constants
const DEFAULT_MAX_DB_SIZE = 1024 * 1024 * 1024; // 1 GB in bytes
const VALID_ROLES = ['basic', 'advanced', 'administrator', 'god'];
const MAX_LIMIT_FOR_TOTAL_COMPUTATION = 100; // Skip expensive COUNT queries for large limits

let db = null;
const dbType = process.env.DB_TYPE || 'sqlite';
let preparedStatements = {}; // Cache for prepared statements

function normalizeRole(role) {
	const value = typeof role === 'string' ? role.toLowerCase() : '';
	return VALID_ROLES.includes(value) ? value : 'basic';
}

/**
 * Initialize database connection
 */
async function init() {
	if (dbType === 'sqlite') {
		const {default: Database} = await import('better-sqlite3');
		const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'telemetry.db');

		// Ensure data directory exists
		const dataDir = path.dirname(dbPath);
		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir, {recursive: true});
		}

		// If database doesn't exist, try to copy from test template database
		if (!fs.existsSync(dbPath)) {
			const testTemplateDbPath = path.join(__dirname, '..', 'data', 'database-test-template.db');
			if (fs.existsSync(testTemplateDbPath)) {
				console.log('📋 Copying test template database to initialize new database...');
				fs.copyFileSync(testTemplateDbPath, dbPath);
				console.log('✅ Test template database copied successfully');
			}
		}

		db = new Database(dbPath);

		// Performance optimizations for SQLite
		db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
		db.pragma('synchronous = NORMAL'); // Faster writes with good safety
		db.pragma('cache_size = -64000'); // 64MB cache
		db.pragma('temp_store = MEMORY'); // Use memory for temporary tables
		db.pragma('mmap_size = 30000000000'); // Use memory-mapped I/O

		// Create tables if they don't exist
		db.exec(`
			CREATE TABLE IF NOT EXISTS event_types (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL UNIQUE,
				description TEXT,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS telemetry_events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				event_id INTEGER NOT NULL REFERENCES event_types(id),
				timestamp TEXT NOT NULL,
				server_id TEXT,
				version TEXT,
				session_id TEXT,
				parent_session_id TEXT,
				user_id TEXT,
				data TEXT NOT NULL,
				received_at TEXT NOT NULL,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				username TEXT NOT NULL UNIQUE,
				password_hash TEXT NOT NULL,
				role TEXT NOT NULL DEFAULT 'basic',
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				last_login TEXT
			);

			CREATE TABLE IF NOT EXISTS orgs (
				server_id TEXT PRIMARY KEY,
				company_name TEXT,
				updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS settings (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL,
				updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS people (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				email TEXT,
				initials TEXT,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS person_usernames (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
				username TEXT NOT NULL,
				org_id TEXT,
				is_primary BOOLEAN DEFAULT FALSE,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				UNIQUE(person_id, username)
			);
			CREATE INDEX IF NOT EXISTS idx_person_usernames_person_id ON person_usernames(person_id);
			CREATE INDEX IF NOT EXISTS idx_person_usernames_username ON person_usernames(username);

			CREATE TABLE IF NOT EXISTS user_logins (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				username TEXT NOT NULL,
				ip_address TEXT,
				user_agent TEXT,
				successful BOOLEAN NOT NULL DEFAULT 1,
				error_message TEXT,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			);

			-- CREATE INDEX IF NOT EXISTS idx_event_id ON telemetry_events(event_id); -- Created by migration
			CREATE INDEX IF NOT EXISTS idx_timestamp ON telemetry_events(timestamp);
			CREATE INDEX IF NOT EXISTS idx_server_id ON telemetry_events(server_id);
			CREATE INDEX IF NOT EXISTS idx_created_at ON telemetry_events(created_at);
			CREATE INDEX IF NOT EXISTS idx_session_id ON telemetry_events(session_id);
			CREATE INDEX IF NOT EXISTS idx_user_id ON telemetry_events(user_id);
			CREATE INDEX IF NOT EXISTS idx_parent_session_id ON telemetry_events(parent_session_id);
			CREATE INDEX IF NOT EXISTS idx_username ON users(username);
			-- CREATE INDEX IF NOT EXISTS idx_event_id_created_at ON telemetry_events(event_id, created_at); -- Created by migration
			CREATE INDEX IF NOT EXISTS idx_user_created_at ON telemetry_events(user_id, created_at);
			CREATE INDEX IF NOT EXISTS idx_user_logins_username ON user_logins(username);
			CREATE INDEX IF NOT EXISTS idx_user_logins_created_at ON user_logins(created_at);
			CREATE INDEX IF NOT EXISTS idx_user_logins_successful ON user_logins(successful);
		`);


	} else if (dbType === 'postgresql') {
		const {Pool} = await import('pg');

		// Prefer internal database URL if available (for Render.com internal networking)
		// Internal URL uses private network and is faster/more secure within same region
		const databaseUrl = process.env.DATABASE_INTERNAL_URL || process.env.DATABASE_URL;

		if (!databaseUrl) {
			throw new Error('DATABASE_URL or DATABASE_INTERNAL_URL must be set for PostgreSQL');
		}

		// Determine if we're using internal URL (no SSL needed for internal connections)
		const isInternalUrl = Boolean(process.env.DATABASE_INTERNAL_URL);
		const useSSL = isInternalUrl ? false : (process.env.DATABASE_SSL === 'true' ? {rejectUnauthorized: false} : false);

		console.log(`📊 Connecting to PostgreSQL using ${isInternalUrl ? 'internal' : 'external'} URL`);

		const pool = new Pool({
			connectionString: databaseUrl,
			ssl: useSSL,
			// Connection pool optimization
			max: 20, // Maximum pool size
			min: 2, // Minimum pool size
			idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
			connectionTimeoutMillis: 10000, // Timeout connection attempts after 10 seconds
			maxUses: 7500 // Close connections after 7500 uses
		});

		// Test connection
		await pool.query('SELECT NOW()');

		// Create tables if they don't exist
		await pool.query(`
			CREATE TABLE IF NOT EXISTS event_types (
				id SERIAL PRIMARY KEY,
				name TEXT NOT NULL UNIQUE,
				description TEXT,
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS telemetry_events (
				id SERIAL PRIMARY KEY,
				timestamp TIMESTAMPTZ NOT NULL,
				server_id TEXT,
				version TEXT,
				session_id TEXT,
				parent_session_id TEXT,
				user_id TEXT,
				data JSONB NOT NULL,
				received_at TIMESTAMPTZ NOT NULL,
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS users (
				id SERIAL PRIMARY KEY,
				username TEXT NOT NULL UNIQUE,
				password_hash TEXT NOT NULL,
				role TEXT NOT NULL DEFAULT 'basic',
				created_at TIMESTAMPTZ DEFAULT NOW(),
				last_login TIMESTAMPTZ
			);

			CREATE TABLE IF NOT EXISTS orgs (
				server_id TEXT PRIMARY KEY,
				company_name TEXT,
				updated_at TIMESTAMPTZ DEFAULT NOW(),
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS settings (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL,
				updated_at TIMESTAMPTZ DEFAULT NOW(),
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS people (
				id SERIAL PRIMARY KEY,
				name TEXT NOT NULL,
				email TEXT,
				initials TEXT,
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS person_usernames (
				id SERIAL PRIMARY KEY,
				person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
				username TEXT NOT NULL,
				org_id TEXT,
				is_primary BOOLEAN DEFAULT FALSE,
				created_at TIMESTAMPTZ DEFAULT NOW(),
				UNIQUE(person_id, username)
			);
			CREATE INDEX IF NOT EXISTS idx_person_usernames_person_id ON person_usernames(person_id);
			CREATE INDEX IF NOT EXISTS idx_person_usernames_username ON person_usernames(username);

			CREATE TABLE IF NOT EXISTS user_logins (
				id SERIAL PRIMARY KEY,
				username TEXT NOT NULL,
				ip_address INET,
				user_agent TEXT,
				successful BOOLEAN NOT NULL DEFAULT true,
				error_message TEXT,
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			-- CREATE INDEX IF NOT EXISTS idx_event_id ON telemetry_events(event_id); -- Created by migration
			CREATE INDEX IF NOT EXISTS idx_timestamp ON telemetry_events(timestamp);
			CREATE INDEX IF NOT EXISTS idx_server_id ON telemetry_events(server_id);
			CREATE INDEX IF NOT EXISTS idx_created_at ON telemetry_events(created_at);
			CREATE INDEX IF NOT EXISTS idx_session_id ON telemetry_events(session_id);
			CREATE INDEX IF NOT EXISTS idx_user_id ON telemetry_events(user_id);
			CREATE INDEX IF NOT EXISTS idx_parent_session_id ON telemetry_events(parent_session_id);
			CREATE INDEX IF NOT EXISTS idx_username ON users(username);
			-- CREATE INDEX IF NOT EXISTS idx_event_id_created_at ON telemetry_events(event_id, created_at); -- Created by migration
			CREATE INDEX IF NOT EXISTS idx_user_created_at ON telemetry_events(user_id, created_at);
			CREATE INDEX IF NOT EXISTS idx_user_logins_username ON user_logins(username);
			CREATE INDEX IF NOT EXISTS idx_user_logins_created_at ON user_logins(created_at);
			CREATE INDEX IF NOT EXISTS idx_user_logins_successful ON user_logins(successful);
		`);

		db = pool;
	} else {
		throw new Error(`Unsupported database type: ${dbType}`);
	}

		await ensureUserRoleColumn();
		await ensureTelemetryParentSessionColumn();
		// ensureErrorMessageColumn must run before ensureDenormalizedColumns
		// because populateDenormalizedColumns references the error_message column
		await ensureErrorMessageColumn();
		await ensureDenormalizedColumns();
		await ensureSchemaV2Columns();

		// Migrate existing events asynchronously (doesn't block startup)
		migrateExistingEventsToSchemaV2().catch(err => {
			console.warn('Background migration of existing events failed:', err);
		});

		await ensurePeopleInitialsColumn();
		await ensureEventTypesInitialized();
		await ensureEventMigration(); // Execute migration before creating indexes that reference event_id
		await ensureEventStatsTables();
		await ensureTeamsAndOrgsTables();
		await ensureRememberTokensTable();
		await ensureCopilotUser();
}

async function ensureErrorMessageColumn() {
	if (!db) {
		return;
	}

	try {
		if (dbType === 'sqlite') {
			const columns = db.prepare('PRAGMA table_info(telemetry_events)').all();
			const columnNames = columns.map(col => col.name);

			// Add error_message column if it doesn't exist
			if (!columnNames.includes('error_message')) {
				db.exec('ALTER TABLE telemetry_events ADD COLUMN error_message TEXT');
				db.exec('CREATE INDEX IF NOT EXISTS idx_error_message ON telemetry_events(error_message)');
			}
		} else if (dbType === 'postgresql') {
			// PostgreSQL supports IF NOT EXISTS in ALTER TABLE
			await db.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS error_message TEXT');
			await db.query('CREATE INDEX IF NOT EXISTS idx_error_message ON telemetry_events(error_message)');
		}
	} catch (error) {
		console.error('Error ensuring error_message column:', error);
	}
}

async function getEventTypeId(eventName) {
	if (!eventName) {
		return null;
	}

	if (!db) {
		throw new Error('Database not initialized');
	}

	// Cache event type IDs to avoid repeated queries
	if (!global.eventTypeCache) {
		global.eventTypeCache = new Map();
	}

	if (global.eventTypeCache.has(eventName)) {
		return global.eventTypeCache.get(eventName);
	}

	if (dbType === 'sqlite') {
		const stmt = db.prepare('SELECT id FROM event_types WHERE name = ?');
		const result = stmt.get(eventName);
		const id = result ? result.id : null;
		if (id) {
			global.eventTypeCache.set(eventName, id);
		}
		return id;
	} else if (dbType === 'postgresql') {
		const result = await db.query('SELECT id FROM event_types WHERE name = $1', [eventName]);
		const id = result.rows.length > 0 ? result.rows[0].id : null;
		if (id) {
			global.eventTypeCache.set(eventName, id);
		}
		return id;
	}
}

async function ensureEventTypesInitialized() {
	if (!db) {
		return;
	}

	try {
		// Define the event types
		const eventTypes = [
			{name: 'tool_call', description: 'Tool call event'},
			{name: 'tool_error', description: 'Tool error event'},
			{name: 'session_start', description: 'Session start event'},
			{name: 'session_end', description: 'Session end event'},
			{name: 'error', description: 'General error event'},
			{name: 'custom', description: 'Custom event'}
		];

		if (dbType === 'sqlite') {
			// Check if event_types table has data
			const count = db.prepare('SELECT COUNT(*) as count FROM event_types').get();
			if (count.count === 0) {
				const stmt = db.prepare('INSERT INTO event_types (name, description) VALUES (?, ?)');
				for (const eventType of eventTypes) {
					stmt.run(eventType.name, eventType.description);
				}
			}
		} else if (dbType === 'postgresql') {
			// Use ON CONFLICT DO NOTHING to safely insert all event types
			// This ensures all required types exist even if table has partial data
			const query = 'INSERT INTO event_types (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING';
			let insertedCount = 0;
			for (const eventType of eventTypes) {
				const result = await db.query(query, [eventType.name, eventType.description]);
				if (result.rowCount > 0) {
					insertedCount++;
				}
			}
			if (insertedCount > 0) {
				console.log(`Initialized ${insertedCount} new event types`);
			}
		}
	} catch (error) {
		console.error('Error initializing event types:', error);
	}
}

async function ensureEventMigration() {
	if (!db) {
		return;
	}

	try {

		if (dbType === 'sqlite') {
			// Check if migration is needed (event_id column missing)
			const columns = db.prepare('PRAGMA table_info(telemetry_events)').all();
			const columnNames = columns.map(col => col.name);

			const hasEventColumn = columnNames.includes('event');
			const hasEventIdColumn = columnNames.includes('event_id');

			if (!hasEventIdColumn) {

				// Add event_id column if it doesn't exist (nullable initially)
				db.exec('ALTER TABLE telemetry_events ADD COLUMN event_id INTEGER REFERENCES event_types(id)');

				// Migrate data from event to event_id if event column exists
				if (hasEventColumn) {
					const updateStmt = db.prepare(`
						UPDATE telemetry_events
						SET event_id = (SELECT id FROM event_types WHERE name = telemetry_events.event)
						WHERE event_id IS NULL
					`);
					updateStmt.run();
				} else {
					// Check if there are NULL event_id values that need a default
					const nullCount = db.prepare('SELECT COUNT(*) as count FROM telemetry_events WHERE event_id IS NULL').get();
					if (nullCount.count > 0) {
						// Assign default event type (custom) for NULL values
						const defaultEventId = db.prepare('SELECT id FROM event_types WHERE name = ?').get('custom');
						if (defaultEventId) {
							const updateStmt = db.prepare('UPDATE telemetry_events SET event_id = ? WHERE event_id IS NULL');
							updateStmt.run(defaultEventId.id);
						}
					}
				}

				// Drop old indexes that reference the event column
				const indexesToDrop = ['idx_event', 'idx_event_created_at', 'idx_timestamp_event'];
				for (const indexName of indexesToDrop) {
					try {
						db.exec(`DROP INDEX IF EXISTS ${indexName}`);
					} catch (e) {
						console.warn(`Could not drop index ${indexName}:`, e.message);
					}
				}

				// Drop old event column
				db.exec('ALTER TABLE telemetry_events DROP COLUMN event');

				// Note: SQLite columns are nullable by default when added. The application logic should ensure event_id is set.

				// Recreate indexes
				db.exec('CREATE INDEX IF NOT EXISTS idx_event_id ON telemetry_events(event_id)');
				db.exec('CREATE INDEX IF NOT EXISTS idx_event_id_created_at ON telemetry_events(event_id, created_at)');

			} else if (hasEventIdColumn) {
				console.log('Event migration already completed - event_id column exists');
			} else {
				console.log('Unexpected state: neither event nor event_id column found');
			}

		} else 		if (dbType === 'postgresql') {
			// Check if migration is needed
			const columnsResult = await db.query(`
				SELECT column_name
				FROM information_schema.columns
				WHERE table_name = 'telemetry_events' AND table_schema = 'public'
			`);
			const columnNames = columnsResult.rows.map(row => row.column_name);

			const hasEventColumn = columnNames.includes('event');
			const hasEventIdColumn = columnNames.includes('event_id');


			if (!hasEventIdColumn) {

				// Log total rows in telemetry_events
				await db.query('SELECT COUNT(*) as count FROM telemetry_events');

				// Ensure event_types table has data before migration
				// This is a safety check - ensureEventTypesInitialized() should have already run
				const eventTypesCount = await db.query('SELECT COUNT(*) as count FROM event_types');
				if (eventTypesCount.rows[0].count === 0) {
					const eventTypes = [
						{name: 'tool_call', description: 'Tool call event'},
						{name: 'tool_error', description: 'Tool error event'},
						{name: 'session_start', description: 'Session start event'},
						{name: 'session_end', description: 'Session end event'},
						{name: 'error', description: 'General error event'},
						{name: 'custom', description: 'Custom event'}
					];
					for (const eventType of eventTypes) {
						await db.query('INSERT INTO event_types (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [eventType.name, eventType.description]);
					}
				}

				// Start transaction for PostgreSQL
				await db.query('BEGIN');

				try {
					// Add event_id column
					await db.query('ALTER TABLE telemetry_events ADD COLUMN event_id INTEGER REFERENCES event_types(id)');

					// Migrate data from event to event_id if event column exists
					if (hasEventColumn) {
						await db.query(`
							UPDATE telemetry_events
							SET event_id = event_types.id
							FROM event_types
							WHERE event_types.name = telemetry_events.event
							AND telemetry_events.event_id IS NULL
						`);
					}

					// Check if there are still NULL event_id values that need a default (regardless of event column)
					const nullCountResult = await db.query('SELECT COUNT(*) as count FROM telemetry_events WHERE event_id IS NULL');
					const nullCount = nullCountResult.rows[0].count;
					if (nullCount > 0) {
						// Assign default event type (custom) for NULL values
						const defaultEventResult = await db.query('SELECT id FROM event_types WHERE name = $1', ['custom']);
						if (defaultEventResult.rows.length > 0) {
							const defaultEventId = defaultEventResult.rows[0].id;
							await db.query('UPDATE telemetry_events SET event_id = $1 WHERE event_id IS NULL', [defaultEventId]);
						} else {
							console.error('Could not find default event type "custom"');
							throw new Error('Default event type "custom" not found in event_types table');
						}
					} else {
						console.log('All event_id values are already set, no default assignment needed');
					}

					// Drop old indexes that reference the event column
					const indexesToDrop = ['idx_event', 'idx_event_created_at', 'idx_timestamp_event'];
					for (const indexName of indexesToDrop) {
						try {
							await db.query(`DROP INDEX IF EXISTS ${indexName}`);
						} catch (e) {
							console.warn(`Could not drop index ${indexName}:`, e.message);
						}
					}

					// Drop old event column if it exists
					if (hasEventColumn) {
						await db.query('ALTER TABLE telemetry_events DROP COLUMN event');
					}

					// Make event_id NOT NULL (after ensuring no NULL values exist)
					const nullCheckResult = await db.query('SELECT COUNT(*) as count FROM telemetry_events WHERE event_id IS NULL');
					if (nullCheckResult.rows[0].count > 0) {
						throw new Error(`Cannot make event_id NOT NULL: ${nullCheckResult.rows[0].count} rows still have NULL values`);
					}
					await db.query('ALTER TABLE telemetry_events ALTER COLUMN event_id SET NOT NULL');

					// Recreate indexes
					await db.query('CREATE INDEX IF NOT EXISTS idx_event_id ON telemetry_events(event_id)');
					await db.query('CREATE INDEX IF NOT EXISTS idx_event_id_created_at ON telemetry_events(event_id, created_at)');

					await db.query('COMMIT');
				} catch (error) {
					await db.query('ROLLBACK');
					throw error;
				}
			} else if (hasEventIdColumn) {
				console.log('Event migration already completed - event_id column exists');
			} else {
				console.log('Unexpected state: event_id column not found');
			}
		}
	} catch (error) {
		console.error('Error during event migration:', error);
		throw error; // Re-throw to fail initialization if migration fails
	}
}

async function ensurePeopleInitialsColumn() {
	if (!db) {
		return;
	}

	try {
		if (dbType === 'sqlite') {
			const columns = db.prepare('PRAGMA table_info(people)').all();
			const columnNames = columns.map(col => col.name);

			// Add initials column if it doesn't exist
			if (!columnNames.includes('initials')) {
				db.exec('ALTER TABLE people ADD COLUMN initials TEXT');
			}
		} else if (dbType === 'postgresql') {
			// PostgreSQL supports IF NOT EXISTS in ALTER TABLE
			await db.query('ALTER TABLE IF EXISTS people ADD COLUMN IF NOT EXISTS initials TEXT');
		}
	} catch (error) {
		console.error('Error ensuring initials column in people table:', error);
	}
}

/**
 * Extract a session identifier from different telemetry payload formats.
 * Accepts camelCase (sessionId) and snake_case (session_id) plus nested "session".
 * @param {object} eventData
 * @returns {string|null}
 */
// eslint-disable-next-line no-unused-vars
function getNormalizedSessionId(eventData = {}) {
	// If it's a TelemetryEvent, use its getter method
	if (eventData.constructor?.name === 'TelemetryEvent') {
		return eventData.getSessionId();
	}

	// Legacy support for raw event data
	const directId = eventData.sessionId || eventData.session_id;
	if (directId) {
		return directId;
	}

	if (typeof eventData.session === 'string') {
		return eventData.session;
	}

	if (eventData.session && typeof eventData.session === 'object') {
		return eventData.session.id || eventData.session.sessionId || eventData.session.session_id || null;
	}

	const dataSession =
		eventData.data?.sessionId ||
		eventData.data?.session_id ||
		(typeof eventData.data?.session === 'string' ? eventData.data.session : null) ||
		(eventData.data?.session && typeof eventData.data.session === 'object' ? eventData.data.session.id ||
			eventData.data.session.sessionId ||
			eventData.data.session.session_id : null);

	return dataSession || null;
}

/**
 * Extract a user identifier from different telemetry payload formats.
 * Accepts camelCase (userId) and snake_case (user_id) plus nested locations.
 * Also extracts user name from data field (userName, user_name, user.name) similar to how sessions display them.
 * @param {object} eventData
 * @returns {string|null}
 */
function sanitizeUserIdentifier(value) {
	if (value === undefined || value === null) {
		return null;
	}
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed === '' ? null : trimmed;
	}
	const stringValue = String(value);
	return stringValue === '' ? null : stringValue;
}

function extractUserDisplayName(data = {}) {
	if (!data || typeof data !== 'object') {
		return null;
	}

	const displayName =
		(typeof data.userName === 'string' && data.userName.trim() !== '' && data.userName.trim()) ||
		(typeof data.user_name === 'string' && data.user_name.trim() !== '' && data.user_name.trim()) ||
		(typeof data.user === 'object' && typeof data.user?.name === 'string' && data.user.name.trim() !== '' && data.user.name.trim()) ||
		null;

	return displayName;
}

function getNormalizedUserId(eventData = {}) {
	// If it's a TelemetryEvent, use its getter method
	if (eventData.constructor?.name === 'TelemetryEvent') {
		return eventData.getUserId();
	}

	// Legacy support for raw event data
	// Try direct fields first
	const directId = sanitizeUserIdentifier(eventData.userId || eventData.user_id);
	if (directId) {
		return directId;
	}

	// Try nested in data object (for userId/user_id)
	const dataUserId = sanitizeUserIdentifier(
		eventData.data?.userId ||
		eventData.data?.user_id ||
		eventData.data?.user?.id ||
		eventData.data?.user?.userId ||
		eventData.data?.user?.user_id ||
		null
	);
	if (dataUserId) {
		return dataUserId;
	}

	// Try user name from data field (same logic as in getSessions for display)
	// This is what appears in the session buttons
	const userName = sanitizeUserIdentifier(
		eventData.data?.userName ||
		eventData.data?.user_name ||
		(eventData.data?.user && eventData.data.user.name) ||
		null
	);

	return userName || null;
}

function buildUserLabel(userId, rawData) {
	let parsedData = null;
	if (rawData) {
		try {
			parsedData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
		} catch {
			parsedData = null;
		}
	}

	const displayName = extractUserDisplayName(parsedData || {});
	if (displayName) {
		return displayName;
	}

	const normalizedFromData = getNormalizedUserId({data: parsedData});
	if (normalizedFromData) {
		return normalizedFromData;
	}

	const sanitizedUserId = sanitizeUserIdentifier(userId);
	return sanitizedUserId || 'Unknown user';
}

/**
 * Extract company name from telemetry event data
 * Supports both new format (data.state.org.companyDetails.Name) and legacy format (data.companyDetails.Name)
 * @param {object} eventData - The telemetry event data
 * @returns {string|null} Company name or null if not found
 */
function extractCompanyName(eventData = {}) {
	if (!eventData || !eventData.data) {
		return null;
	}

	const data = eventData.data;

	// New format: data.state.org.companyDetails.Name
	if (data.state && data.state.org && data.state.org.companyDetails) {
		const companyName = data.state.org.companyDetails.Name;
		if (typeof companyName === 'string' && companyName.trim() !== '') {
			return companyName.trim();
		}
	}

	// Legacy format: data.companyDetails.Name
	if (data.companyDetails && typeof data.companyDetails.Name === 'string') {
		const companyName = data.companyDetails.Name.trim();
		if (companyName !== '') {
			return companyName;
		}
	}

	return null;
}

/**
 * Extract org ID from telemetry event data
 * Supports both new format (data.state.org.id) and legacy format (data.orgId)
 * @param {object} eventData - The telemetry event data
 * @returns {string|null} Org ID or null if not found
 */

/**
 * Extract tool name from telemetry event data
 * @param {object} eventData - The telemetry event data
 * @returns {string|null} Tool name or null if not found
 */

/**
 * Extract all normalized fields from telemetry event data in a single pass
 * @param {object} eventData - The telemetry event data (raw or TelemetryEvent)
 * @returns {object} Object containing all extracted fields: {orgId, userName, toolName, companyName, errorMessage}
 */
function extractNormalizedFields(eventData = {}) {
	// If it's a TelemetryEvent, return its already calculated denormalized fields
	if (eventData.constructor?.name === 'TelemetryEvent') {
		return {
			orgId: eventData.orgId,
			userName: eventData.userName,
			toolName: eventData.toolName,
			companyName: eventData.companyName,
			errorMessage: eventData.errorMessage
		};
	}

	// Legacy support for raw event data
	const result = {
		orgId: null,
		userName: null,
		toolName: null,
		companyName: null,
		errorMessage: null
	};

	if (!eventData || !eventData.data) {
		return result;
	}

	const data = eventData.data;

	// Extract orgId (new format: data.state.org.id, legacy: data.orgId)
	if (data.state && data.state.org && data.state.org.id) {
		const orgId = data.state.org.id;
		if (typeof orgId === 'string' && orgId.trim() !== '') {
			result.orgId = orgId.trim();
		}
	} else if (data.orgId && typeof data.orgId === 'string') {
		const orgId = data.orgId.trim();
		if (orgId !== '') {
			result.orgId = orgId;
		}
	}

	// Extract userName (from data, prioritizing different formats)
	result.userName = extractUserDisplayName(data);

	// Extract toolName (data.toolName first, then data.tool)
	if (data.toolName && typeof data.toolName === 'string') {
		const toolName = data.toolName.trim();
		if (toolName !== '') {
			result.toolName = toolName;
		}
	} else if (data.tool && typeof data.tool === 'string') {
		const toolName = data.tool.trim();
		if (toolName !== '') {
			result.toolName = toolName;
		}
	}
	// For error events, also check data.error.toolName and data.error.tool
	if (!result.toolName && data.error && typeof data.error === 'object') {
		if (data.error.toolName && typeof data.error.toolName === 'string') {
			const toolName = data.error.toolName.trim();
			if (toolName !== '') {
				result.toolName = toolName;
			}
		} else if (data.error.tool && typeof data.error.tool === 'string') {
			const toolName = data.error.tool.trim();
			if (toolName !== '') {
				result.toolName = toolName;
			}
		}
	}

	// Extract companyName (new format: data.state.org.companyDetails.Name, legacy: data.companyDetails.Name)
	if (data.state && data.state.org && data.state.org.companyDetails) {
		const companyName = data.state.org.companyDetails.Name;
		if (typeof companyName === 'string' && companyName.trim() !== '') {
			result.companyName = companyName.trim();
		}
	} else if (data.companyDetails && typeof data.companyDetails.Name === 'string') {
		const companyName = data.companyDetails.Name.trim();
		if (companyName !== '') {
			result.companyName = companyName;
		}
	}

	// Extract errorMessage (for tool_error events: data.errorMessage, fallback: data.error.message)
	if (data.errorMessage && typeof data.errorMessage === 'string') {
		const errorMessage = data.errorMessage.trim();
		if (errorMessage !== '') {
			result.errorMessage = errorMessage;
		}
	} else if (data.error && typeof data.error === 'object' && data.error.message && typeof data.error.message === 'string') {
		const errorMessage = data.error.message.trim();
		if (errorMessage !== '') {
			result.errorMessage = errorMessage;
		}
	}

	return result;
}

/**
 * Extract error message from tool_error events (legacy function, kept for backward compatibility)
 * @param {object} eventData - The event data object
 * @returns {string|null} - The error message or null if not found
 */

/**
 * Update or insert organization company name
 * @param {string} serverId - Server ID (org identifier)
 * @param {string} companyName - Company name
 * @returns {Promise<void>}
 */
async function upsertOrgCompanyName(serverId, companyName) {
	if (!db || !serverId || !companyName) {
		return;
	}

	try {
		const now = new Date().toISOString();
		if (dbType === 'sqlite') {
			const stmt = db.prepare(`
				INSERT INTO orgs (server_id, company_name, updated_at, created_at)
				VALUES (?, ?, ?, ?)
				ON CONFLICT(server_id) DO UPDATE SET
					company_name = excluded.company_name,
					updated_at = excluded.updated_at
			`);
			stmt.run(serverId, companyName, now, now);
		} else if (dbType === 'postgresql') {
			await db.query(`
				INSERT INTO orgs (server_id, company_name, updated_at, created_at)
				VALUES ($1, $2, $3, $4)
				ON CONFLICT (server_id) DO UPDATE SET
					company_name = EXCLUDED.company_name,
					updated_at = EXCLUDED.updated_at
			`, [serverId, companyName, now, now]);
		}
	} catch (error) {
		// Log error but don't fail the event storage
		console.error('Error upserting org company name:', error);
	}
}

/**
 * Compute the logical parent session identifier for an event.
 *
 * Rules:
 * - Key is user (user_id) + org (server_id)
 * - If another START SESSION exists for same user+org within 4 hours, reuse that
 *   session as the logical parent.
 * - Otherwise, the current sessionId becomes the new logical parent.
 *
 * For non-start events we try to inherit the parent_session_id from existing
 * events with the same session_id.
 *
 * @param {object} eventData - Raw telemetry event data
 * @param {string|null} normalizedSessionId - Normalized session identifier
 * @param {string|null} normalizedUserId - Normalized user identifier
 * @returns {Promise<string|null>}
 */
async function computeParentSessionId(eventData, normalizedSessionId, normalizedUserId) {
	if (!normalizedSessionId || !db) {
		return null;
	}

	const eventType = eventData.event;
	const serverId = eventData.serverId || null;

	// For non-start events, try to inherit an existing parent_session_id
	if (eventType !== 'session_start') {
		if (dbType === 'sqlite') {
			const existing = db.prepare(`
				SELECT parent_session_id
				FROM telemetry_events
				WHERE session_id = ? AND parent_session_id IS NOT NULL
				ORDER BY timestamp DESC
				LIMIT 1
			`).get(normalizedSessionId);
			if (existing && existing.parent_session_id) {
				return existing.parent_session_id;
			}
		} else if (dbType === 'postgresql') {
			const result = await db.query(
				`SELECT parent_session_id
				 FROM telemetry_events
				 WHERE session_id = $1 AND parent_session_id IS NOT NULL
				 ORDER BY timestamp DESC
				 LIMIT 1`,
				[normalizedSessionId]
			);
			if (result.rows.length > 0 && result.rows[0].parent_session_id) {
				return result.rows[0].parent_session_id;
			}
		}

		// If we could not find a parent yet, try to base it on any START SESSION
		// event with this session_id
		if (dbType === 'sqlite') {
			const startRow = db.prepare(`
				SELECT parent_session_id, session_id
				FROM telemetry_events
				WHERE session_id = ? AND event_id = (SELECT id FROM event_types WHERE name = 'session_start')
				ORDER BY timestamp ASC
				LIMIT 1
			`).get(normalizedSessionId);
			if (startRow) {
				return startRow.parent_session_id || startRow.session_id || normalizedSessionId;
			}
		} else if (dbType === 'postgresql') {
			const result = await db.query(
				`SELECT parent_session_id, session_id
				 FROM telemetry_events
				 WHERE session_id = $1 AND event_id = (SELECT id FROM event_types WHERE name = 'session_start')
				 ORDER BY timestamp ASC
				 LIMIT 1`,
				[normalizedSessionId]
			);
			if (result.rows.length > 0) {
				const row = result.rows[0];
				return row.parent_session_id || row.session_id || normalizedSessionId;
			}
		}

		// Fallback: treat the physical sessionId as the logical parent
		return normalizedSessionId;
	}

	// From here, we are dealing with a session_start event
	// If we don't have user or org information, we cannot safely merge sessions
	if (!normalizedUserId || !serverId) {
		return normalizedSessionId;
	}

	const currentTs = eventData.timestamp ? new Date(eventData.timestamp) : new Date();
	if (Number.isNaN(currentTs.getTime())) {
		return normalizedSessionId;
	}

	const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

	if (dbType === 'sqlite') {
		const lastStart = db.prepare(`
			SELECT timestamp, parent_session_id, session_id
			FROM telemetry_events
			WHERE event_id = (SELECT id FROM event_types WHERE name = 'session_start')
			  AND server_id = ?
			  AND user_id = ?
			ORDER BY timestamp DESC
			LIMIT 1
		`).get(serverId, normalizedUserId);

		if (!lastStart) {
			return normalizedSessionId;
		}

		const lastTs = new Date(lastStart.timestamp);
		if (Number.isNaN(lastTs.getTime())) {
			return normalizedSessionId;
		}

		const diffMs = currentTs - lastTs;
		if (diffMs <= FOUR_HOURS_MS) {
			// Same logical session as the previous START SESSION
			return lastStart.parent_session_id || lastStart.session_id || normalizedSessionId;
		}

		return normalizedSessionId;
	}

	// PostgreSQL implementation
	const result = await db.query(
		`SELECT timestamp, parent_session_id, session_id
		 FROM telemetry_events
		 WHERE event = 'session_start'
		   AND server_id = $1
		   AND user_id = $2
		 ORDER BY timestamp DESC
		 LIMIT 1`,
		[serverId, normalizedUserId]
	);

	if (result.rows.length === 0) {
		return normalizedSessionId;
	}

	const row = result.rows[0];
	const lastTs = new Date(row.timestamp);
	if (Number.isNaN(lastTs.getTime())) {
		return normalizedSessionId;
	}

	const diffMs = currentTs - lastTs;
	if (diffMs <= FOUR_HOURS_MS) {
		return row.parent_session_id || row.session_id || normalizedSessionId;
	}

	return normalizedSessionId;
}

/**
 * Store a telemetry event
 * @param {import('./telemetry-event.js').TelemetryEvent} telemetryEvent - The parsed telemetry event
 * @param {string} receivedAt - ISO timestamp when event was received
 * @returns {Promise<boolean>} Success status
 */
async function storeEvent(telemetryEvent, receivedAt) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	// Validate that it's a TelemetryEvent instance
	if (!(telemetryEvent instanceof TelemetryEvent)) {
		throw new Error('storeEvent() requires a TelemetryEvent instance');
	}

	try {
		const sessionId = telemetryEvent.getSessionId();
		const userId = telemetryEvent.getUserId();
		const allowMissingUser = telemetryEvent.data?.allowMissingUser === true;
		const isSessionEventWithoutStart = telemetryEvent.area === 'session' && telemetryEvent.event !== 'session_start';
		const isExemptEvent = ['server_boot', 'client_connect'].includes(telemetryEvent.event);

		if (!userId && !allowMissingUser && !isSessionEventWithoutStart && !isExemptEvent) {
			console.warn('Dropping telemetry event without username/userId');
			// Store discarded event as general error
			const timestamp = receivedAt || new Date().toISOString();
			storeDiscardedEvent(telemetryEvent.payload || telemetryEvent, 'Event discarded: missing username/userId', timestamp).catch(err => {
				console.error('Error storing discarded event:', err);
			});
			return false;
		}

		// Get event type ID from TelemetryEvent's calculated eventType
		const eventTypeId = await getEventTypeId(telemetryEvent.eventType);
		if (!eventTypeId) {
			console.warn(`Unknown event type: ${telemetryEvent.eventType}, dropping event`);
			// Store discarded event as general error
			const timestamp = receivedAt || new Date().toISOString();
			storeDiscardedEvent(telemetryEvent.payload || telemetryEvent, `Event discarded: unknown event type '${telemetryEvent.eventType}'`, timestamp).catch(err => {
				console.error('Error storing discarded event:', err);
			});
			return false;
		}

		const parentSessionId = await computeParentSessionId(
			telemetryEvent,
			sessionId,
			userId
		);

		// Use denormalized fields from TelemetryEvent
		const {orgId, userName, toolName, companyName, errorMessage} = telemetryEvent;

		// Resolve team_id for pre-calculated team association
		let teamId = null;
		if (orgId) {
			try {
				if (dbType === 'sqlite') {
					const result = db.prepare('SELECT team_id FROM orgs WHERE server_id = ?').get(orgId);
					teamId = result?.team_id || null;
				} else if (dbType === 'postgresql') {
					const result = await db.query('SELECT team_id FROM orgs WHERE server_id = $1', [orgId]);
					teamId = result.rows.length > 0 ? result.rows[0].team_id : null;
				}
			} catch (error) {
				// Log error but don't fail event insertion
				console.warn('Could not resolve team_id for org_id %s:', orgId, error.message);
			}
		}

		// Store original payload exactly as received (preserved in telemetryEvent.payload)
		const payloadToStore = telemetryEvent.payload || JSON.stringify(telemetryEvent.toJSON());

		// Handle payload differently for SQLite vs PostgreSQL
		let payloadForSQLite;
		let payloadForPostgreSQL;

		if (dbType === 'sqlite') {
			// For SQLite, ensure payload is always a string (TEXT column)
			if (typeof payloadToStore !== 'string') {
				payloadForSQLite = JSON.stringify(payloadToStore);
			} else {
				payloadForSQLite = payloadToStore;
			}
		} else if (dbType === 'postgresql') {
			// For PostgreSQL, convert to object for JSONB column
			// If it's already an object, use it directly; if it's a string, parse it
			if (typeof payloadToStore === 'string') {
				try {
					payloadForPostgreSQL = JSON.parse(payloadToStore);
				} catch {
					// If parsing fails, wrap it as an object with the raw string
					payloadForPostgreSQL = {_raw: payloadToStore};
				}
			} else {
				payloadForPostgreSQL = payloadToStore;
			}
		}

		if (dbType === 'sqlite') {
			const stmt = getPreparedStatement('insertEvent', `
				INSERT INTO telemetry_events
				(event_id, timestamp, server_id, version, session_id, parent_session_id, user_id, data, received_at, org_id, user_name, tool_name, company_name, error_message, team_id, event, area, success, telemetry_schema_version)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);

			// Convert boolean to integer for SQLite (0 or 1)
			const successValue = telemetryEvent.success === true ? 1 : (telemetryEvent.success === false ? 0 : null);

			stmt.run(
				eventTypeId,
				telemetryEvent.timestamp,
				telemetryEvent.getServerId() || null,
				telemetryEvent.getVersion() || null,
				sessionId || null,
				parentSessionId || null,
				userId || null,
				payloadForSQLite,
				receivedAt,
				orgId,
				userName,
				toolName,
				companyName,
				errorMessage,
				teamId,
				telemetryEvent.eventType || null, // For compatibility
				telemetryEvent.area || null,
				successValue,
				telemetryEvent.telemetrySchemaVersion || null
			);
		} else if (dbType === 'postgresql') {
			await db.query(
				`INSERT INTO telemetry_events
				(event_id, timestamp, server_id, version, session_id, parent_session_id, user_id, data, received_at, org_id, user_name, tool_name, company_name, error_message, team_id, event, area, success, telemetry_schema_version)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
				[
					eventTypeId,
					telemetryEvent.timestamp,
					telemetryEvent.getServerId() || null,
					telemetryEvent.getVersion() || null,
					sessionId || null,
					parentSessionId || null,
					userId || null,
					payloadForPostgreSQL, // PostgreSQL JSONB column receives parsed object
					receivedAt,
					orgId,
					userName,
					toolName,
					companyName,
					errorMessage,
					teamId,
					telemetryEvent.eventType || null,
					telemetryEvent.area || null,
					telemetryEvent.success ?? null,
					telemetryEvent.telemetrySchemaVersion || null
				]
			);
		}

		// Extract and store company name if available
		const serverId = telemetryEvent.getServerId();
		if (serverId) {
			const companyName = extractCompanyName(telemetryEvent);
			if (companyName) {
				// Don't await to avoid blocking event storage
				upsertOrgCompanyName(serverId, companyName).catch(err => {
					console.error('Error storing company name:', err);
				});
			}
		}

		// Update aggregated counters so UI lists stay accurate without pagination
		await updateAggregatedStatsForEvent(userId, orgId, telemetryEvent.timestamp, userName);

		return true;
	} catch (error) {
		// Re-throw to allow caller to handle
		throw new Error(`Failed to store telemetry event: ${error.message}`);
	}
}

/**
 * Store a discarded telemetry event as a general error
 * This function stores events that were discarded for any reason (missing userId, unknown event type, etc.)
 * without any validation requirements - it stores everything that was discarded
 * @param {object} rawPayload - Original raw payload that was discarded
 * @param {string} reason - Reason why the event was discarded (optional)
 * @param {string} receivedAt - ISO timestamp when event was received
 * @returns {Promise<boolean>} Success status
 */
async function storeDiscardedEvent(rawPayload, reason = 'discarded', receivedAt = null) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		// Use current timestamp if not provided
		const timestamp = receivedAt || new Date().toISOString();

		// Get or create "error" event type (used for discarded events)
		let eventTypeId = await getEventTypeId('error');
		if (!eventTypeId) {
			// If "error" type doesn't exist, create it
			if (dbType === 'sqlite') {
				const stmt = db.prepare('INSERT INTO event_types (name, description) VALUES (?, ?)');
				const result = stmt.run('error', 'General error event');
				eventTypeId = result.lastInsertRowid;
			} else if (dbType === 'postgresql') {
				const result = await db.query(
					'INSERT INTO event_types (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING RETURNING id',
					['error', 'General error event']
				);
				if (result.rows.length > 0) {
					eventTypeId = result.rows[0].id;
				} else {
					// Type already exists, fetch it
					eventTypeId = await getEventTypeId('error');
				}
			}
		}

		// Store the discarded payload as-is in the data field
		// Handle payload differently for SQLite vs PostgreSQL
		let payloadForSQLite;
		let payloadForPostgreSQL;

		if (dbType === 'sqlite') {
			// For SQLite, ensure payload is always a string (TEXT column)
			payloadForSQLite = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
		} else if (dbType === 'postgresql') {
			// For PostgreSQL, convert to object for JSONB column
			// If it's already an object, use it directly; if it's a string, parse it
			if (typeof rawPayload === 'string') {
				try {
					payloadForPostgreSQL = JSON.parse(rawPayload);
				} catch {
					// If parsing fails, wrap it as an object with the raw string
					payloadForPostgreSQL = {_raw: rawPayload};
				}
			} else {
				payloadForPostgreSQL = rawPayload;
			}
		}

		// Extract any available metadata from the payload if it exists
		let serverId = null;
		let version = null;
		let sessionId = null;
		let userId = null;
		let orgId = null;
		let userName = null;
		let toolName = null;
		let companyName = null;
		const errorMessage = reason;

		// Try to extract metadata from payload if it's an object
		if (typeof rawPayload === 'object' && rawPayload !== null) {
			// Try to get server info
			if (rawPayload.server?.id) {
				serverId = rawPayload.server.id;
			}
			if (rawPayload.server?.version) {
				version = rawPayload.server.version;
			}

			// Try to get session info
			if (rawPayload.session?.id) {
				sessionId = rawPayload.session.id;
			}

			// Try to get user info
			if (rawPayload.user?.id) {
				userId = rawPayload.user.id;
			}
			if (rawPayload.data?.userName || rawPayload.data?.user_name) {
				userName = rawPayload.data.userName || rawPayload.data.user_name;
			}

			// Try to get org info
			if (rawPayload.server?.id) {
				orgId = rawPayload.server.id;
			}

			// Try to get tool name
			if (rawPayload.data?.toolName || rawPayload.data?.tool_name) {
				toolName = rawPayload.data.toolName || rawPayload.data.tool_name;
			}

			// Try to get company name
			if (rawPayload.data?.companyName || rawPayload.data?.company_name) {
				companyName = rawPayload.data.companyName || rawPayload.data.company_name;
			}
		}

		// Resolve team_id if orgId is available
		let teamId = null;
		if (orgId) {
			try {
				if (dbType === 'sqlite') {
					const result = db.prepare('SELECT team_id FROM orgs WHERE server_id = ?').get(orgId);
					teamId = result?.team_id || null;
				} else if (dbType === 'postgresql') {
					const result = await db.query('SELECT team_id FROM orgs WHERE server_id = $1', [orgId]);
					teamId = result.rows.length > 0 ? result.rows[0].team_id : null;
				}
			} catch (error) {
				// Log error but don't fail event insertion
				console.warn('Could not resolve team_id for org_id %s:', orgId, error.message);
			}
		}

		// Insert the discarded event with area='general' and success=false
		if (dbType === 'sqlite') {
			const stmt = getPreparedStatement('insertDiscardedEvent', `
				INSERT INTO telemetry_events
				(event_id, timestamp, server_id, version, session_id, parent_session_id, user_id, data, received_at, org_id, user_name, tool_name, company_name, error_message, team_id, event, area, success, telemetry_schema_version)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);

			stmt.run(
				eventTypeId,
				timestamp,
				serverId,
				version,
				sessionId,
				null, // parent_session_id
				userId,
				payloadForSQLite,
				receivedAt || timestamp,
				orgId,
				userName,
				toolName,
				companyName,
				errorMessage,
				teamId,
				'error', // event type name for compatibility
				'general', // area
				false, // success
				null // telemetry_schema_version
			);
		} else if (dbType === 'postgresql') {
			await db.query(
				`INSERT INTO telemetry_events
				(event_id, timestamp, server_id, version, session_id, parent_session_id, user_id, data, received_at, org_id, user_name, tool_name, company_name, error_message, team_id, event, area, success, telemetry_schema_version)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
				[
					eventTypeId,
					timestamp,
					serverId,
					version,
					sessionId,
					null, // parent_session_id
					userId,
					payloadForPostgreSQL, // PostgreSQL JSONB column receives parsed object
					receivedAt || timestamp,
					orgId,
					userName,
					toolName,
					companyName,
					errorMessage,
					teamId,
					'error', // event type name for compatibility
					'general', // area
					false, // success
					null // telemetry_schema_version
				]
			);
		}

		return true;
	} catch (error) {
		// Log error but don't throw - we don't want discarded event storage to fail the main flow
		console.error('Error storing discarded event:', error);
		return false;
	}
}

/**
 * Get event statistics
 * @param {object} options - Query options
 * @returns {object} Statistics
 */
async function getStats(options = {}) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	const {startDate, endDate, eventType} = options;

	if (dbType === 'sqlite') {
		// Use prepared statement for common case (no filters)
		if (!startDate && !endDate && !eventType) {
			const stmt = getPreparedStatement('getStatsTotal', 'SELECT COUNT(*) as total FROM telemetry_events WHERE deleted_at IS NULL');
			return {total: stmt.get().total};
		}

		let query = 'SELECT COUNT(*) as total FROM telemetry_events WHERE deleted_at IS NULL';
		const params = [];

		if (startDate) {
			query += ' AND created_at >= ?';
			params.push(startDate);
		}
		if (endDate) {
			query += ' AND created_at <= ?';
			params.push(endDate);
		}
		if (eventType) {
			query += ' AND event = ?';
			params.push(eventType);
		}

		const result = db.prepare(query).get(...params);
		return {total: result.total};
	} else if (dbType === 'postgresql') {
		let query = 'SELECT COUNT(*) as total FROM telemetry_events WHERE deleted_at IS NULL';
		const params = [];
		let paramIndex = 1;

		if (startDate) {
			query += ` AND created_at >= $${paramIndex++}`;
			params.push(startDate);
		}
		if (endDate) {
			query += ` AND created_at <= $${paramIndex++}`;
			params.push(endDate);
		}
		if (eventType) {
			query += ` AND event = $${paramIndex++}`;
			params.push(eventType);
		}

		const result = await db.query(query, params);
		return {total: Number.parseInt(result.rows[0].total, 10)};
	}
}

/**
 * Get telemetry events with pagination and filters
 * @param {object} options - Query options
 * @returns {object} Events and pagination info
 */
async function getEvents(options = {}) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	const {
		limit = 50,
		offset = 0,
		eventTypes,
		areas,
		serverId,
		sessionId,
		startDate,
		endDate,
		orderBy = 'created_at',
		order = 'DESC',
		includeDeleted = false
	} = options;

	let whereClause = 'WHERE 1=1';
	const params = [];
	let paramIndex = 1;

	// Exclude soft deleted events by default unless explicitly requested
	if (!includeDeleted) {
		whereClause += ' AND deleted_at IS NULL';
	}

	if (areas && Array.isArray(areas) && areas.length > 0) {
		// Filter by area (preferred over eventTypes for area-based filtering)
		if (areas.length === 1) {
			whereClause += dbType === 'sqlite' ? ' AND COALESCE(e.area, \'general\') = ?' : ` AND COALESCE(e.area, 'general') = $${paramIndex++}`;
			params.push(areas[0]);
		} else {
			const placeholders = areas.map(() => {
				return dbType === 'sqlite' ? '?' : `$${paramIndex++}`;
			}).join(', ');
			whereClause += ` AND COALESCE(e.area, 'general') IN (${placeholders})`;
			params.push(...areas);
		}
	} else if (eventTypes && Array.isArray(eventTypes) && eventTypes.length > 0) {
		// Fallback to eventTypes for backward compatibility
		if (eventTypes.length === 1) {
			whereClause += dbType === 'sqlite' ? ' AND et.name = ?' : ` AND et.name = $${paramIndex++}`;
			params.push(eventTypes[0]);
		} else {
			const placeholders = eventTypes.map(() => {
				return dbType === 'sqlite' ? '?' : `$${paramIndex++}`;
			}).join(', ');
			whereClause += ` AND et.name IN (${placeholders})`;
			params.push(...eventTypes);
		}
	}
	if (serverId) {
		whereClause += dbType === 'sqlite' ? ' AND e.server_id = ?' : ` AND e.server_id = $${paramIndex++}`;
		params.push(serverId);
	}
	if (sessionId) {
		// Filter by logical session: parent_session_id when set, otherwise raw session_id
		if (dbType === 'sqlite') {
			whereClause += ' AND (e.parent_session_id = ? OR (e.parent_session_id IS NULL AND e.session_id = ?))';
		} else {
			whereClause += ` AND (e.parent_session_id = $${paramIndex} OR (e.parent_session_id IS NULL AND e.session_id = $${paramIndex + 1}))`;
		}
		params.push(sessionId, sessionId);
		paramIndex += dbType === 'sqlite' ? 0 : 2;
	}
	if (startDate) {
		whereClause += dbType === 'sqlite' ? ' AND e.created_at >= ?' : ` AND e.created_at >= $${paramIndex++}`;
		params.push(startDate);
	}
	if (endDate) {
		whereClause += dbType === 'sqlite' ? ' AND e.created_at <= ?' : ` AND e.created_at <= $${paramIndex++}`;
		params.push(endDate);
	}
	if (options.userIds && Array.isArray(options.userIds) && options.userIds.length > 0) {
		const placeholders = options.userIds.map(() => {
			return dbType === 'sqlite' ? '?' : `$${paramIndex++}`;
		}).join(', ');
		whereClause += ` AND e.user_id IN (${placeholders})`;
		params.push(...options.userIds);
	}

	// Get total count (optimize by skipping if not needed)
	let total = 0;
	// Only compute total if it's a reasonable query (not too expensive)
	// We compute total when:
	// 1. offset === 0: First page, total is useful for pagination UI
	// 2. limit <= MAX_LIMIT_FOR_TOTAL_COMPUTATION: Small result set, COUNT is fast
	const shouldComputeTotal = offset === 0 || limit <= MAX_LIMIT_FOR_TOTAL_COMPUTATION;

	if (shouldComputeTotal) {
		const countQuery = `SELECT COUNT(*) as total FROM telemetry_events e JOIN event_types et ON e.event_id = et.id ${whereClause}`;
		if (dbType === 'sqlite') {
			total = db.prepare(countQuery).get(...params).total;
		} else {
			const countResult = await db.query(countQuery, params);
			total = Number.parseInt(countResult.rows[0].total, 10);
		}
	}

	// Get events
	const validOrderBy = ['id', 'event', 'timestamp', 'created_at', 'server_id'];
	const validOrder = ['ASC', 'DESC'];
	// Only select orderBy and order values from predefined lists without using user data directly
	let safeOrderBy = 'e.created_at';
	if (validOrderBy.includes(orderBy)) {
		if (orderBy === 'created_at') {
			safeOrderBy = 'e.created_at';
		} else if (orderBy === 'timestamp') {
			safeOrderBy = 'e.timestamp';
		} else if (orderBy === 'id') {
			safeOrderBy = 'e.id';
		} else if (orderBy === 'server_id') {
			safeOrderBy = 'e.server_id';
		} else {
			safeOrderBy = orderBy;
		}
	}
	let safeOrder = 'DESC';
	if (typeof order === 'string' && validOrder.includes(order.toUpperCase())) {
		safeOrder = order.toUpperCase();
	}

	const eventsQuery = `
		SELECT
			e.id, et.name as event, e.timestamp, e.server_id, e.version, e.session_id, e.parent_session_id,
			e.user_id, e.received_at, e.created_at, e.user_name, e.tool_name, e.company_name,
			e.error_message, e.area
		FROM telemetry_events e
		JOIN event_types et ON e.event_id = et.id
		${whereClause}
		ORDER BY ${safeOrderBy} ${safeOrder}
		LIMIT ${dbType === 'sqlite' ? '?' : `$${paramIndex++}`}
		OFFSET ${dbType === 'sqlite' ? '?' : `$${paramIndex++}`}
	`;

	const queryParams = [...params, limit, offset];
	let events;

	if (dbType === 'sqlite') {
		events = db.prepare(eventsQuery).all(...queryParams);
	} else {
		const result = await db.query(eventsQuery, queryParams);
		events = result.rows;
	}

	return {
		events,
		total,
		limit,
		offset,
		hasMore: offset + limit < total
	};
}

/**
 * Get a single event by ID
 * @param {number} id - Event ID
 * @returns {Object|null} Event object or null if not found
 */
async function getEventById(id) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (dbType === 'sqlite') {
		const event = db.prepare('SELECT e.id, et.name as event, e.timestamp, e.server_id, e.version, e.session_id, e.user_id, e.data, e.received_at, e.created_at, e.org_id, e.user_name, e.tool_name, e.company_name, e.error_message, e.area FROM telemetry_events e JOIN event_types et ON e.event_id = et.id WHERE e.id = ? AND e.deleted_at IS NULL').get(id);
		if (!event) {
			return null;
		}
		return {
			...event,
			data: JSON.parse(event.data)
		};
	}
	const result = await db.query('SELECT e.id, et.name as event, e.timestamp, e.server_id, e.version, e.session_id, e.user_id, e.data, e.received_at, e.created_at, e.org_id, e.user_name, e.tool_name, e.company_name, e.error_message, e.area FROM telemetry_events e JOIN event_types et ON e.event_id = et.id WHERE e.id = $1 AND e.deleted_at IS NULL', [id]);
	if (result.rows.length === 0) {
		return null;
	}
	return result.rows[0];

}

/**
 * Get event type statistics
 * @returns {Array} Statistics by event type
 */
async function getEventTypeStats(options = {}) {
	const {sessionId, userIds} = options || {};
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (dbType === 'sqlite') {
		let query = `
			SELECT COALESCE(area, 'general') as event, COUNT(*) as count
			FROM telemetry_events
		`;
		const params = [];
		const conditions = [];

		// Always exclude soft deleted events
		conditions.push('deleted_at IS NULL');

		if (sessionId) {
			// Logical session filter
			conditions.push('(parent_session_id = ? OR (parent_session_id IS NULL AND session_id = ?))');
			params.push(sessionId, sessionId);
		}
		if (userIds && Array.isArray(userIds) && userIds.length > 0) {
			const placeholders = userIds.map(() => '?').join(', ');
			conditions.push(`user_id IN (${placeholders})`);
			params.push(...userIds);
		}
		if (conditions.length > 0) {
			query += ` WHERE ${conditions.join(' AND ')}`;
		}
		query += `
			GROUP BY COALESCE(area, 'general')
			ORDER BY count DESC
		`;
		const stmt = db.prepare(query);
		const result = params.length ? stmt.all(...params) : stmt.all();
		return result;
	}
	let query = `
			SELECT COALESCE(area, 'general') as event, COUNT(*) as count
			FROM telemetry_events
		`;
	const params = [];
	const conditions = [];
	let paramIndex = 1;

	// Always exclude soft deleted events
	conditions.push('deleted_at IS NULL');

	if (sessionId) {
		conditions.push(`(parent_session_id = $${paramIndex} OR (parent_session_id IS NULL AND session_id = $${paramIndex + 1}))`);
		params.push(sessionId, sessionId);
		paramIndex += 2;
	}
	if (userIds && Array.isArray(userIds) && userIds.length > 0) {
		const placeholders = userIds.map(() => `$${paramIndex++}`).join(', ');
		conditions.push(`user_id IN (${placeholders})`);
		params.push(...userIds);
	}
	if (conditions.length > 0) {
		query += ` WHERE ${conditions.join(' AND ')}`;
	}
	query += `
			GROUP BY COALESCE(area, 'general')
			ORDER BY count DESC
		`;
	const result = await db.query(query, params);
	return result.rows.map(row => ({
		event: row.event,
		count: Number.parseInt(row.count, 10)
	}));

}

/**
 * Get unique sessions with event counts
 * @param {object} options - Query options
 * @returns {Array} Sessions with count and latest timestamp
 */
async function getSessions(options = {}) {
	const {userIds, limit, offset, includeUsersWithoutSessions = true} = options || {};
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (dbType === 'sqlite') {
		// Group by logical session: parent_session_id when available, otherwise session_id
		// Use optimized query with CTEs and aggregations instead of correlated subqueries
		let whereClause = `WHERE deleted_at IS NULL AND (
			(session_id IS NOT NULL OR parent_session_id IS NOT NULL)${includeUsersWithoutSessions ? ' OR user_id IS NOT NULL' : ''}
		)`;
		const params = [];
		if (userIds && Array.isArray(userIds) && userIds.length > 0) {
			const placeholders = userIds.map(() => '?').join(', ');
			whereClause += ` AND user_id IN (${placeholders})`;
			params.push(...userIds);
		}
		let query;
		const queryParams = params.slice(); // Copy params array

		if (includeUsersWithoutSessions) {
			// When including users without sessions, use UNION of sessions and user-only events
			query = `
				WITH session_aggregates AS (
					SELECT
						COALESCE(parent_session_id, session_id) AS logical_session_id,
						COUNT(*) as count,
						MIN(timestamp) as first_event,
						MAX(timestamp) as last_event,
						SUM(CASE WHEN event = 'session_start' THEN 1 ELSE 0 END) as has_start,
						SUM(CASE WHEN event = 'session_end' THEN 1 ELSE 0 END) as has_end,
						(SELECT user_id FROM telemetry_events
						 WHERE COALESCE(parent_session_id, session_id) = COALESCE(sa.parent_session_id, sa.session_id)
						   AND deleted_at IS NULL
						 ORDER BY timestamp ASC LIMIT 1) as user_id,
						(SELECT data FROM telemetry_events
						 WHERE COALESCE(parent_session_id, session_id) = COALESCE(sa.parent_session_id, sa.session_id)
						   AND event = 'session_start'
						   AND deleted_at IS NULL
						 ORDER BY timestamp ASC LIMIT 1) as session_start_data
					FROM telemetry_events sa
					WHERE (session_id IS NOT NULL OR parent_session_id IS NOT NULL) AND deleted_at IS NULL
					${userIds && userIds.length > 0 ? `AND user_id IN (${userIds.map(() => '?').join(', ')})` : ''}
					GROUP BY COALESCE(parent_session_id, session_id)
				),
				user_aggregates AS (
					SELECT
						'user_' || user_id || '_' || DATE(timestamp) AS logical_session_id,
						COUNT(*) as count,
						MIN(timestamp) as first_event,
						MAX(timestamp) as last_event,
						0 as has_start,
						0 as has_end,
						user_id,
						NULL as session_start_data
					FROM telemetry_events
					WHERE session_id IS NULL AND parent_session_id IS NULL AND user_id IS NOT NULL AND deleted_at IS NULL
					${userIds && userIds.length > 0 ? `AND user_id IN (${userIds.map(() => '?').join(', ')})` : ''}
					GROUP BY user_id, DATE(timestamp)
				)
				SELECT * FROM session_aggregates
				UNION ALL
				SELECT * FROM user_aggregates
				ORDER BY last_event DESC
				${limit ? `LIMIT ?` : ''}
				${offset ? `OFFSET ?` : ''}
			`;
			// Add userIds again for the user_aggregates part
			if (userIds && userIds.length > 0) {
				queryParams.push(...userIds);
			}
		} else {
			// Original query for sessions only
			query = `
				WITH session_aggregates AS (
					SELECT
						COALESCE(parent_session_id, session_id) AS logical_session_id,
						COUNT(*) as count,
						MIN(timestamp) as first_event,
						MAX(timestamp) as last_event,
						SUM(CASE WHEN event = 'session_start' THEN 1 ELSE 0 END) as has_start,
						SUM(CASE WHEN event = 'session_end' THEN 1 ELSE 0 END) as has_end
					FROM telemetry_events
					${whereClause}
					GROUP BY COALESCE(parent_session_id, session_id)
				)
				SELECT
					sa.logical_session_id,
					sa.count,
					sa.first_event,
					sa.last_event,
					(SELECT user_id FROM telemetry_events
					 WHERE COALESCE(parent_session_id, session_id) = COALESCE(sa.parent_session_id, sa.session_id)
					   AND deleted_at IS NULL
					 ORDER BY timestamp ASC LIMIT 1) as user_id,
					(SELECT data FROM telemetry_events
					 WHERE COALESCE(parent_session_id, session_id) = COALESCE(sa.parent_session_id, sa.session_id)
					   AND event = 'session_start'
					   AND deleted_at IS NULL
					 ORDER BY timestamp ASC LIMIT 1) as session_start_data,
					sa.has_start,
					sa.has_end
				FROM session_aggregates sa
				WHERE sa.count > 0
				ORDER BY sa.last_event DESC
				${limit ? `LIMIT ?` : ''}
				${offset ? `OFFSET ?` : ''}
			`;
		}

		const result = db.prepare(query).all(...queryParams, ...(limit ? [limit] : []), ...(offset ? [offset] : []));
		return result.map(row => {
			let user_name = null;
			if (row.session_start_data) {
				try {
					const data = JSON.parse(row.session_start_data);
					// Try multiple paths: userName (camelCase), user_name (snake_case), or data.user.name (nested)
					if (data) {
						user_name = data.userName || data.user_name || (data.user && data.user.name) || null;
					}
				} catch {
					// If parsing fails, ignore and use user_id
				}
			}

			// Determine if session is active
			const hasStart = Number.parseInt(row.has_start, 10) > 0;
			const hasEnd = Number.parseInt(row.has_end, 10) > 0;
			const lastEvent = new Date(row.last_event);
			const now = new Date();
			const hoursSinceLastEvent = (now - lastEvent) / (1000 * 60 * 60);
			const isActive = hasStart && !hasEnd && hoursSinceLastEvent < 2;

			return {
				session_id: row.logical_session_id,
				count: Number.parseInt(row.count, 10),
				first_event: row.first_event,
				last_event: row.last_event,
				user_id: row.user_id,
				user_name: user_name,
				is_active: isActive
			};
		});

	} else if (dbType === 'postgresql') {
		// PostgreSQL implementation
		let whereClause = `WHERE deleted_at IS NULL AND (`;
		const params = [];
		let paramIndex = 1;

		if (includeUsersWithoutSessions) {
			whereClause += `(session_id IS NOT NULL OR parent_session_id IS NOT NULL) OR user_id IS NOT NULL`;
		} else {
			whereClause += `(session_id IS NOT NULL OR parent_session_id IS NOT NULL)`;
		}
		whereClause += `)`;

		if (userIds && Array.isArray(userIds) && userIds.length > 0) {
			const placeholders = userIds.map(() => `$${paramIndex++}`).join(', ');
			whereClause += ` AND user_id IN (${placeholders})`;
			params.push(...userIds);
		}

		let query;
		const queryParams = params.slice();

		if (includeUsersWithoutSessions) {
			query = `
				WITH session_aggregates AS (
					SELECT
						COALESCE(parent_session_id, session_id) AS logical_session_id,
						COUNT(*) as count,
						MIN(timestamp) as first_event,
						MAX(timestamp) as last_event,
						SUM(CASE WHEN event = 'session_start' THEN 1 ELSE 0 END) as has_start,
						SUM(CASE WHEN event = 'session_end' THEN 1 ELSE 0 END) as has_end
					FROM telemetry_events te
					WHERE (session_id IS NOT NULL OR parent_session_id IS NOT NULL) AND deleted_at IS NULL
					${userIds && userIds.length > 0 ? `AND user_id IN (${userIds.map(() => `$${paramIndex++}`).join(', ')})` : ''}
					GROUP BY COALESCE(parent_session_id, session_id)
				),
				session_details AS (
					SELECT
						sa.logical_session_id,
						sa.count,
						sa.first_event,
						sa.last_event,
						sa.has_start,
						sa.has_end,
						(SELECT user_id FROM telemetry_events
						 WHERE COALESCE(parent_session_id, session_id) = sa.logical_session_id
						   AND deleted_at IS NULL
						 ORDER BY timestamp ASC LIMIT 1) as user_id,
						(SELECT data FROM telemetry_events
						 WHERE COALESCE(parent_session_id, session_id) = sa.logical_session_id
						   AND event = 'session_start'
						   AND deleted_at IS NULL
						 ORDER BY timestamp ASC LIMIT 1) as session_start_data
					FROM session_aggregates sa
				),
				user_aggregates AS (
					SELECT
						'user_' || user_id || '_' || DATE(timestamp) AS logical_session_id,
						COUNT(*) as count,
						MIN(timestamp) as first_event,
						MAX(timestamp) as last_event,
						0 as has_start,
						0 as has_end,
						user_id,
						NULL::jsonb as session_start_data
					FROM telemetry_events
					WHERE session_id IS NULL AND parent_session_id IS NULL AND user_id IS NOT NULL AND deleted_at IS NULL
					${userIds && userIds.length > 0 ? `AND user_id IN (${userIds.map(() => `$${paramIndex++}`).join(', ')})` : ''}
					GROUP BY user_id, DATE(timestamp)
				)
				SELECT * FROM session_details
				UNION ALL
				SELECT * FROM user_aggregates
				ORDER BY last_event DESC
				${limit ? `LIMIT $${paramIndex++}` : ''}
				${offset ? `OFFSET $${paramIndex++}` : ''}
			`;

			// Add userIds again for the user_aggregates part
			if (userIds && userIds.length > 0) {
				queryParams.push(...userIds);
			}
		} else {
			query = `
				WITH session_aggregates AS (
					SELECT
						COALESCE(parent_session_id, session_id) AS logical_session_id,
						COUNT(*) as count,
						MIN(timestamp) as first_event,
						MAX(timestamp) as last_event,
						SUM(CASE WHEN event = 'session_start' THEN 1 ELSE 0 END) as has_start,
						SUM(CASE WHEN event = 'session_end' THEN 1 ELSE 0 END) as has_end
					FROM telemetry_events
					${whereClause}
					GROUP BY COALESCE(parent_session_id, session_id)
				)
				SELECT
					sa.logical_session_id,
					sa.count,
					sa.first_event,
					sa.last_event,
					(SELECT user_id FROM telemetry_events
					 WHERE COALESCE(parent_session_id, session_id) = sa.logical_session_id
					   AND deleted_at IS NULL
					 ORDER BY timestamp ASC LIMIT 1) as user_id,
					(SELECT data FROM telemetry_events
					 WHERE COALESCE(parent_session_id, session_id) = sa.logical_session_id
					   AND event = 'session_start'
					   AND deleted_at IS NULL
					 ORDER BY timestamp ASC LIMIT 1) as session_start_data,
					sa.has_start,
					sa.has_end
				FROM session_aggregates sa
				WHERE sa.count > 0
				ORDER BY sa.last_event DESC
				${limit ? `LIMIT $${paramIndex++}` : ''}
				${offset ? `OFFSET $${paramIndex++}` : ''}
			`;
		}

		if (limit) {queryParams.push(limit);}
		if (offset) {queryParams.push(offset);}

		const result = await db.query(query, queryParams);

		const mappedResult = result.rows.map(row => {
			let user_name = null;
			if (row.session_start_data) {
				try {
					const data = JSON.parse(row.session_start_data);
					// Try multiple paths: userName (camelCase), user_name (snake_case), or data.user.name (nested)
					if (data) {
						user_name = data.userName || data.user_name || (data.user && data.user.name) || null;
					}
				} catch {
					// If parsing fails, ignore and use user_id
				}
			}

			// Determine if session is active
			const hasStart = Number.parseInt(row.has_start, 10) > 0;
			const hasEnd = Number.parseInt(row.has_end, 10) > 0;
			const lastEvent = new Date(row.last_event);
			const now = new Date();
			const hoursSinceLastEvent = (now - lastEvent) / (1000 * 60 * 60);
			const isActive = hasStart && !hasEnd && hoursSinceLastEvent < 2;

			return {
				session_id: row.logical_session_id,
				count: Number.parseInt(row.count, 10),
				first_event: row.first_event,
				last_event: row.last_event,
				user_id: row.user_id,
				user_name: user_name,
				is_active: isActive
			};
		});

		return mappedResult;
	}
	let whereClause = `WHERE deleted_at IS NULL AND (
			(session_id IS NOT NULL OR parent_session_id IS NOT NULL)${includeUsersWithoutSessions ? ' OR user_id IS NOT NULL' : ''}
		)`;
	const params = [];
	let paramIndex = 1;
	if (userIds && Array.isArray(userIds) && userIds.length > 0) {
		const placeholders = userIds.map(() => `$${paramIndex++}`).join(', ');
		whereClause += ` AND user_id IN (${placeholders})`;
		params.push(...userIds);
	}

	let query;
	const queryParams = params.slice(); // Copy params array

	if (includeUsersWithoutSessions) {
		// When including users without sessions, use UNION of sessions and user-only events
		query = `
				WITH session_aggregates AS (
					SELECT
						COALESCE(parent_session_id, session_id) AS logical_session_id,
						COUNT(*) as count,
						MIN(timestamp) as first_event,
						MAX(timestamp) as last_event,
						SUM(CASE WHEN event = 'session_start' THEN 1 ELSE 0 END) as has_start,
						SUM(CASE WHEN event = 'session_end' THEN 1 ELSE 0 END) as has_end,
						(SELECT user_id FROM telemetry_events
						 WHERE COALESCE(parent_session_id, session_id) = COALESCE(sa.parent_session_id, sa.session_id)
						   AND deleted_at IS NULL
						 ORDER BY timestamp ASC LIMIT 1) as user_id,
						(SELECT data FROM telemetry_events
						 WHERE COALESCE(parent_session_id, session_id) = COALESCE(sa.parent_session_id, sa.session_id)
						   AND event = 'session_start'
						   AND deleted_at IS NULL
						 ORDER BY timestamp ASC LIMIT 1) as session_start_data
					FROM telemetry_events sa
					WHERE (session_id IS NOT NULL OR parent_session_id IS NOT NULL) AND deleted_at IS NULL
					${userIds && userIds.length > 0 ? `AND user_id IN (${userIds.map((_, i) => `$${paramIndex + i}`).join(', ')})` : ''}
					GROUP BY COALESCE(parent_session_id, session_id)
				),
				user_aggregates AS (
					SELECT
						'user_' || user_id || '_' || DATE(timestamp) AS logical_session_id,
						COUNT(*) as count,
						MIN(timestamp) as first_event,
						MAX(timestamp) as last_event,
						0 as has_start,
						0 as has_end,
						user_id,
						NULL as session_start_data
					FROM telemetry_events
					WHERE session_id IS NULL AND parent_session_id IS NULL AND user_id IS NOT NULL AND deleted_at IS NULL
					${userIds && userIds.length > 0 ? `AND user_id IN (${userIds.map((_, i) => `$${paramIndex + userIds.length + i}`).join(', ')})` : ''}
					GROUP BY user_id, DATE(timestamp)
				)
				SELECT * FROM session_aggregates
				UNION ALL
				SELECT * FROM user_aggregates
				ORDER BY last_event DESC
				${limit ? `LIMIT $${paramIndex + (userIds ? userIds.length * 2 : 0)}` : ''}
				${offset ? `OFFSET $${paramIndex + (userIds ? userIds.length * 2 : 0) + (limit ? 1 : 0)}` : ''}
			`;
		// Add userIds for both parts of the union
		if (userIds && userIds.length > 0) {
			queryParams.push(...userIds, ...userIds);
		}
		if (limit) { queryParams.push(limit); }
		if (offset) { queryParams.push(offset); }
	} else {
		// Original query for sessions only
		query = `
				WITH session_aggregates AS (
					SELECT
						COALESCE(parent_session_id, session_id) AS logical_session_id,
						COUNT(*) as count,
						MIN(timestamp) as first_event,
						MAX(timestamp) as last_event,
						SUM(CASE WHEN event = 'session_start' THEN 1 ELSE 0 END) as has_start,
						SUM(CASE WHEN event = 'session_end' THEN 1 ELSE 0 END) as has_end
					FROM telemetry_events
					${whereClause}
					GROUP BY COALESCE(parent_session_id, session_id)
				)
				SELECT
					sa.logical_session_id,
					sa.count,
					sa.first_event,
					sa.last_event,
					(SELECT user_id FROM telemetry_events
					 WHERE COALESCE(parent_session_id, session_id) = COALESCE(sa.parent_session_id, sa.session_id)
					   AND deleted_at IS NULL
					 ORDER BY timestamp ASC LIMIT 1) as user_id,
					(SELECT data FROM telemetry_events
					 WHERE COALESCE(parent_session_id, session_id) = COALESCE(sa.parent_session_id, sa.session_id)
					   AND event = 'session_start'
					   AND deleted_at IS NULL
					 ORDER BY timestamp ASC LIMIT 1) as session_start_data,
					sa.has_start,
					sa.has_end
				FROM session_aggregates sa
				WHERE sa.count > 0
				ORDER BY sa.last_event DESC
				${limit ? `LIMIT $${paramIndex++}` : ''}
				${offset ? `OFFSET $${paramIndex++}` : ''}
			`;
		if (limit) { queryParams.push(limit); }
		if (offset) { queryParams.push(offset); }
	}

	const result = await db.query(query, queryParams);
	return result.rows.map(row => {
		let user_name = null;
		if (row.session_start_data) {
			try {
				const data = typeof row.session_start_data === 'string' ? JSON.parse(row.session_start_data) : row.session_start_data;
				// Try multiple paths: userName (camelCase), user_name (snake_case), or data.user.name (nested)
				if (data) {
					user_name = data.userName || data.user_name || (data.user && data.user.name) || null;
				}
			} catch {
				// If parsing fails, ignore and use user_id
			}
		}

		// Determine if session is active
		const hasStart = Number.parseInt(row.has_start, 10) > 0;
		const hasEnd = Number.parseInt(row.has_end, 10) > 0;
		const lastEvent = new Date(row.last_event);
		const now = new Date();
		const hoursSinceLastEvent = (now - lastEvent) / (1000 * 60 * 60);
		const isActive = hasStart && !hasEnd && hoursSinceLastEvent < 2;

		return {
			session_id: row.logical_session_id,
			count: Number.parseInt(row.count, 10),
			first_event: row.first_event,
			last_event: row.last_event,
			user_id: row.user_id,
			user_name: user_name,
			is_active: isActive
		};
	});

}

/**
 * Delete a single event by ID
 * @param {number} id - Event ID
 * @returns {Promise<boolean>} True if event was deleted, false if not found
 */
async function deleteEvent(id) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	// Check if event exists and is not already deleted
	let existingEvent = null;
	if (dbType === 'sqlite') {
		existingEvent = db.prepare('SELECT id FROM telemetry_events WHERE id = ? AND deleted_at IS NULL').get(id);
	} else if (dbType === 'postgresql') {
		const result = await db.query('SELECT id FROM telemetry_events WHERE id = $1 AND deleted_at IS NULL', [id]);
		existingEvent = result.rows[0];
	}

	if (!existingEvent) {
		return false; // Event not found or already deleted
	}

	if (dbType === 'sqlite') {
		const stmt = db.prepare('UPDATE telemetry_events SET deleted_at = ? WHERE id = ?');
		const result = stmt.run(new Date().toISOString(), id);
		return result.changes > 0;
	} else if (dbType === 'postgresql') {
		const result = await db.query('UPDATE telemetry_events SET deleted_at = NOW() WHERE id = $1', [id]);
		return result.rowCount > 0;
	}
}

/**
 * Soft delete all events from the database (move to trash)
 * @returns {Promise<number>} Number of soft deleted events
 */
async function deleteAllEvents() {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (dbType === 'sqlite') {
		const stmt = db.prepare('UPDATE telemetry_events SET deleted_at = ? WHERE deleted_at IS NULL');
		const result = stmt.run(new Date().toISOString());
		return result.changes;
	} else if (dbType === 'postgresql') {
		const result = await db.query('UPDATE telemetry_events SET deleted_at = NOW() WHERE deleted_at IS NULL');
		return result.rowCount;
	}
}

/**
 * Soft delete all events for a specific session (move to trash)
 * @param {string} sessionId - Session identifier
 * @returns {Promise<number>} Number of soft deleted events
 */
async function deleteEventsBySession(sessionId) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (!sessionId) {
		throw new Error('Session ID is required to delete events by session');
	}

	// Detect pseudo-session: user-only session (format: user_<userId>_<date>)
	const userSessionMatch = /^user_(?<userId>.+)_(?<date>\d{4}-\d{2}-\d{2})$/.exec(sessionId);
	if (userSessionMatch) {
		const userId = userSessionMatch.groups.userId;
		const date = userSessionMatch.groups.date;
		if (dbType === 'sqlite') {
			const stmt = db.prepare('UPDATE telemetry_events SET deleted_at = ? WHERE user_id = ? AND date(timestamp) = ? AND session_id IS NULL AND parent_session_id IS NULL AND deleted_at IS NULL');
			const result = stmt.run(new Date().toISOString(), userId, date);
			return result.changes;
		} else if (dbType === 'postgresql') {
			const result = await db.query('UPDATE telemetry_events SET deleted_at = NOW() WHERE user_id = $1 AND DATE(timestamp) = $2 AND session_id IS NULL AND parent_session_id IS NULL AND deleted_at IS NULL', [userId, date]);
			return result.rowCount;
		}
	}

	// Normal session logic
	if (dbType === 'sqlite') {
		const stmt = db.prepare('UPDATE telemetry_events SET deleted_at = ? WHERE (parent_session_id = ? OR (parent_session_id IS NULL AND session_id = ?)) AND deleted_at IS NULL');
		const result = stmt.run(new Date().toISOString(), sessionId, sessionId);
		return result.changes;
	} else if (dbType === 'postgresql') {
		const result = await db.query('UPDATE telemetry_events SET deleted_at = NOW() WHERE (parent_session_id = $1 OR (parent_session_id IS NULL AND session_id = $1)) AND deleted_at IS NULL', [sessionId]);
		return result.rowCount;
	}
}

/**
 * Get daily event counts for the last N days
 * @param {number} days - Number of days to retrieve (default: 30)
 * @returns {Array} Array of {date, count} objects
 */
async function getDailyStats(days = 30) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	// Always include today's data by building the range backwards from today (UTC)
	const rangeDays = Math.max(1, Number.isFinite(days) ? Math.floor(days) : 30);
	const now = new Date();
	const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	startDate.setUTCDate(startDate.getUTCDate() - (rangeDays - 1));
	const startDateISO = startDate.toISOString();

	if (dbType === 'sqlite') {
		// SQLite: use DATE() function to group by date using the event timestamp (UTC)
		const stmt = getPreparedStatement('getDailyStats', `
			SELECT
				date(timestamp, 'utc') as date,
				COUNT(*) as count
			FROM telemetry_events
			WHERE timestamp >= ?
				AND deleted_at IS NULL
			GROUP BY date(timestamp, 'utc')
			ORDER BY date ASC
		`);
		const result = stmt.all(startDateISO);

		// Fill in missing days with 0 counts
		const dateMap = new Map();
		result.forEach(row => {
			// SQLite DATE() returns string in 'YYYY-MM-DD' format
			// Normalize to ensure consistent format
			let dateStr = String(row.date);
			// Remove time portion if present, keep only date part
			dateStr = dateStr.split('T')[0].split(' ')[0];
			dateMap.set(dateStr, Number.parseInt(row.count, 10));
		});

		const filledResults = [];
		for (let i = 0; i < rangeDays; i++) {
			const date = new Date(startDate);
			date.setUTCDate(date.getUTCDate() + i);
			const dateStr = date.toISOString().split('T')[0];
			filledResults.push({
				date: dateStr,
				count: dateMap.get(dateStr) || 0
			});
		}

		return filledResults;
	}
	// PostgreSQL: use DATE with UTC timezone to group by date using the event timestamp
	const result = await db.query(`
			SELECT
				DATE(timestamp AT TIME ZONE 'UTC') as date,
				COUNT(*) as count
			FROM telemetry_events
			WHERE timestamp >= $1
				AND deleted_at IS NULL
			GROUP BY DATE(timestamp AT TIME ZONE 'UTC')
			ORDER BY date ASC
		`, [startDateISO]);

	// Fill in missing days with 0 counts
	const dateMap = new Map();
	result.rows.forEach(row => {
		// Handle both Date objects and string dates from PostgreSQL
		const dateValue = row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date.split('T')[0];
		dateMap.set(dateValue, Number.parseInt(row.count, 10));
	});

	const filledResults = [];
	for (let i = 0; i < rangeDays; i++) {
		const date = new Date(startDate);
		date.setUTCDate(date.getUTCDate() + i);
		const dateStr = date.toISOString().split('T')[0];
		filledResults.push({
			date: dateStr,
			count: dateMap.get(dateStr) || 0
		});
	}

	return filledResults;

}

/**
 * Get daily event counts separated by event type for the last N days
 * Returns two series: start sessions without end, and tool events
 * @param {number} days - Number of days to retrieve (default: 30)
 * @returns {Array} Array of {date, startSessionsWithoutEnd, toolEvents} objects
 */
async function getDailyStatsByEventType(days = 30) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	// Always include today's data by building the range backwards from today (UTC)
	const rangeDays = Math.max(1, Number.isFinite(days) ? Math.floor(days) : 30);
	const now = new Date();
	const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	startDate.setUTCDate(startDate.getUTCDate() - (rangeDays - 1));
	const startDateISO = startDate.toISOString();

	if (dbType === 'sqlite') {
		// Get all session_start events
		const sessionStarts = db.prepare(`
			SELECT
				date(timestamp, 'utc') as date,
				session_id,
				id
			FROM telemetry_events
			WHERE timestamp >= ? AND event_id = (SELECT id FROM event_types WHERE name = 'session_start')
				AND deleted_at IS NULL
		`).all(startDateISO);

		// Count all session_starts by date (regardless of whether they have an end)
		const startSessionsMap = new Map();
		sessionStarts.forEach(row => {
			let dateStr = String(row.date);
			dateStr = dateStr.split('T')[0].split(' ')[0];
			startSessionsMap.set(dateStr, (startSessionsMap.get(dateStr) || 0) + 1);
		});

		// Get tool events (tool_call and tool_error)
		const toolEvents = db.prepare(`
			SELECT
				date(timestamp, 'utc') as date,
				COUNT(*) as count
			FROM telemetry_events
			WHERE timestamp >= ? AND event_id IN (SELECT id FROM event_types WHERE name IN ('tool_call', 'tool_error'))
				AND deleted_at IS NULL
			GROUP BY date(timestamp, 'utc')
		`).all(startDateISO);

		const toolEventsMap = new Map();
		toolEvents.forEach(row => {
			let dateStr = String(row.date);
			dateStr = dateStr.split('T')[0].split(' ')[0];
			toolEventsMap.set(dateStr, Number.parseInt(row.count, 10));
		});

		// Get error events (tool_error only)
		const errorEvents = db.prepare(`
			SELECT
				date(timestamp, 'utc') as date,
				COUNT(*) as count
			FROM telemetry_events
			WHERE timestamp >= ? AND event_id = (SELECT id FROM event_types WHERE name = 'tool_error')
				AND deleted_at IS NULL
			GROUP BY date(timestamp, 'utc')
		`).all(startDateISO);

		const errorEventsMap = new Map();
		errorEvents.forEach(row => {
			let dateStr = String(row.date);
			dateStr = dateStr.split('T')[0].split(' ')[0];
			errorEventsMap.set(dateStr, Number.parseInt(row.count, 10));
		});

		// Fill in missing days with 0 counts
		const filledResults = [];
		for (let i = 0; i < rangeDays; i++) {
			const date = new Date(startDate);
			date.setUTCDate(date.getUTCDate() + i);
			const dateStr = date.toISOString().split('T')[0];
			filledResults.push({
				date: dateStr,
				startSessionsWithoutEnd: startSessionsMap.get(dateStr) || 0,
				toolEvents: toolEventsMap.get(dateStr) || 0,
				errorEvents: errorEventsMap.get(dateStr) || 0
			});
		}

		return filledResults;
	}
	// PostgreSQL
	// Get all session_start events
	const sessionStartsResult = await db.query(`
			SELECT
				DATE(timestamp AT TIME ZONE 'UTC') as date,
				session_id,
				id
			FROM telemetry_events
			WHERE timestamp >= $1 AND event_id = (SELECT id FROM event_types WHERE name = 'session_start')
				AND deleted_at IS NULL
		`, [startDateISO]);

	// Count all session_starts by date (regardless of whether they have an end)
	const startSessionsMap = new Map();
	sessionStartsResult.rows.forEach(row => {
		const dateValue = row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date.split('T')[0];
		startSessionsMap.set(dateValue, (startSessionsMap.get(dateValue) || 0) + 1);
	});

	// Get tool events (tool_call and tool_error)
	const toolEventsResult = await db.query(`
			SELECT
				DATE(timestamp AT TIME ZONE 'UTC') as date,
				COUNT(*) as count
			FROM telemetry_events
			WHERE timestamp >= $1 AND event_id IN (SELECT id FROM event_types WHERE name IN ('tool_call', 'tool_error'))
				AND deleted_at IS NULL
			GROUP BY DATE(timestamp AT TIME ZONE 'UTC')
		`, [startDateISO]);

	const toolEventsMap = new Map();
	toolEventsResult.rows.forEach(row => {
		const dateValue = row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date.split('T')[0];
		toolEventsMap.set(dateValue, Number.parseInt(row.count, 10));
	});

	// Get error events (tool_error only)
	const errorEventsResult = await db.query(`
			SELECT
				DATE(timestamp AT TIME ZONE 'UTC') as date,
				COUNT(*) as count
			FROM telemetry_events
			WHERE timestamp >= $1 AND event_id = (SELECT id FROM event_types WHERE name = 'tool_error')
				AND deleted_at IS NULL
			GROUP BY DATE(timestamp AT TIME ZONE 'UTC')
		`, [startDateISO]);

	const errorEventsMap = new Map();
	errorEventsResult.rows.forEach(row => {
		const dateValue = row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date.split('T')[0];
		errorEventsMap.set(dateValue, Number.parseInt(row.count, 10));
	});

	// Fill in missing days with 0 counts
	const filledResults = [];
	for (let i = 0; i < rangeDays; i++) {
		const date = new Date(startDate);
		date.setUTCDate(date.getUTCDate() + i);
		const dateStr = date.toISOString().split('T')[0];
		filledResults.push({
			date: dateStr,
			startSessionsWithoutEnd: startSessionsMap.get(dateStr) || 0,
			toolEvents: toolEventsMap.get(dateStr) || 0,
			errorEvents: errorEventsMap.get(dateStr) || 0
		});
	}

	return filledResults;

}

/**
 * Get database size in bytes
 * @returns {Promise<{size: number, maxSize: number|null}|null>} Database size info, or null if not available
 */
async function getDatabaseSize() {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		let size = null;
		if (dbType === 'sqlite') {
			// SQLite: get file size
			const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'telemetry.db');
			if (fs.existsSync(dbPath)) {
				const stats = fs.statSync(dbPath);
				size = stats.size;
			}
		} else if (dbType === 'postgresql') {
			// PostgreSQL: use pg_database_size function
			const result = await db.query(
				'SELECT pg_database_size(current_database()) as size'
			);
			size = result.rows[0]?.size || null;
		}

		if (size === null) {
			return null;
		}

		// Get max size from environment variable (in bytes) if set, otherwise use default
		const maxSize = process.env.DB_MAX_SIZE ? Number.parseInt(process.env.DB_MAX_SIZE, 10) : DEFAULT_MAX_DB_SIZE;

		return {
			size: size,
			maxSize: maxSize
		};
	} catch (error) {
		console.error('Error getting database size:', error);
		return null;
	}
}

/**
 * Get or create a prepared statement (for SQLite performance)
 * @param {string} key - Cache key for the statement
 * @param {string} sql - SQL query
 * @returns {object} Prepared statement
 */
function getPreparedStatement(key, sql) {
	if (dbType !== 'sqlite') {
		return null;
	}

	if (!preparedStatements[key]) {
		preparedStatements[key] = db.prepare(sql);
	}

	return preparedStatements[key];
}

/**
 * Close database connection
 */
async function close() {
	if (db) {
		if (dbType === 'sqlite') {
			// Finalize all prepared statements before clearing the cache
			for (const stmt of Object.values(preparedStatements)) {
				try {
					if (stmt && typeof stmt.finalize === 'function') {
						stmt.finalize();
					}
				} catch (err) {
					console.error('Error finalizing prepared statement:', err);
				}
			}
			preparedStatements = {};
			db.close();
		} else if (dbType === 'postgresql') {
			await db.end();
		}
		db = null;
	}
}

/**
 * Get tool usage statistics
 * @param {number} days - Number of days to look back (default: 30)
 * @returns {Promise<Array>} Array of tool usage statistics with successful calls and errors
 */
async function getToolUsageStats(days = 30) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	const rangeDays = Math.min(Math.max(1, Number.isFinite(days) ? days : 30), 365);
	const startDate = new Date();
	startDate.setUTCDate(startDate.getUTCDate() - (rangeDays - 1));
	const startDateISO = startDate.toISOString();

	try {
		if (dbType === 'sqlite') {
			// Try to use the tool_name column first (more efficient)
			const toolStats = db.prepare(`
				SELECT
					tool_name as tool,
					SUM(CASE WHEN event = 'tool_call' THEN 1 ELSE 0 END) as successful,
					SUM(CASE WHEN event = 'tool_error' THEN 1 ELSE 0 END) as errors
				FROM telemetry_events
				WHERE timestamp >= ?
					AND event IN ('tool_call', 'tool_error')
					AND tool_name IS NOT NULL
					AND tool_name != ''
					AND deleted_at IS NULL
				GROUP BY tool_name
				ORDER BY SUM(CASE WHEN event = 'tool_call' THEN 1 ELSE 0 END) + SUM(CASE WHEN event = 'tool_error' THEN 1 ELSE 0 END) DESC
				LIMIT 6
			`).all(startDateISO);

			return toolStats.map(row => ({
				tool: row.tool,
				successful: Number.parseInt(row.successful, 10) || 0,
				errors: Number.parseInt(row.errors, 10) || 0
			}));
		} else if (dbType === 'postgresql') {
			// Try to use the tool_name column first (more efficient)
			const result = await db.query(`
				SELECT
					tool_name as tool,
					SUM(CASE WHEN event = 'tool_call' THEN 1 ELSE 0 END) as successful,
					SUM(CASE WHEN event = 'tool_error' THEN 1 ELSE 0 END) as errors
				FROM telemetry_events
				WHERE timestamp >= $1
					AND event IN ('tool_call', 'tool_error')
					AND tool_name IS NOT NULL
					AND tool_name != ''
					AND deleted_at IS NULL
				GROUP BY tool_name
				ORDER BY SUM(CASE WHEN event = 'tool_call' THEN 1 ELSE 0 END) + SUM(CASE WHEN event = 'tool_error' THEN 1 ELSE 0 END) DESC
				LIMIT 6
			`, [startDateISO]);

			return result.rows.map(row => ({
				tool: row.tool,
				successful: Number.parseInt(row.successful, 10) || 0,
				errors: Number.parseInt(row.errors, 10) || 0
			}));
		}
	} catch (error) {
		console.warn('Error querying tool_name column, falling back to JSON extraction:', error.message);

		// Fallback: extract tool names from JSON data
		if (dbType === 'sqlite') {
			const result = db.prepare(`
				SELECT data
				FROM telemetry_events
				WHERE timestamp >= ?
					AND event IN ('tool_call', 'tool_error')
			`).all(startDateISO);

			// Aggregate by tool name
			const toolStats = new Map();
			result.forEach(row => {
				try {
					const eventData = JSON.parse(row.data);
					const toolName = eventData.toolName || eventData.tool;
					if (toolName && typeof toolName === 'string') {
						const trimmedName = toolName.trim();
						if (trimmedName) {
							if (!toolStats.has(trimmedName)) {
								toolStats.set(trimmedName, {
									tool: trimmedName,
									successful: 0,
									errors: 0
								});
							}

							const stat = toolStats.get(trimmedName);
							if (row.event === 'tool_call') {
								stat.successful++;
							} else if (row.event === 'tool_error') {
								stat.errors++;
							}
						}
					}
				} catch {
					// Skip malformed JSON
				}
			});

			// Convert to array and sort by total usage
			return Array.from(toolStats.values())
				.sort((a, b) => (b.successful + b.errors) - (a.successful + a.errors))
				.slice(0, 6);
		} else if (dbType === 'postgresql') {
			const result = await db.query(`
				SELECT
					COALESCE(data->>'toolName', data->>'tool') as tool_name,
					event,
					COUNT(*) as count
				FROM telemetry_events
				WHERE timestamp >= $1 AND event IN ('tool_call', 'tool_error')
					AND (data->>'toolName' IS NOT NULL OR data->>'tool' IS NOT NULL)
					AND (data->>'toolName' != '' OR data->>'tool' != '')
				GROUP BY COALESCE(data->>'toolName', data->>'tool'), event
			`, [startDateISO]);

			// Aggregate by tool name
			const toolStats = new Map();
			result.rows.forEach(row => {
				const toolName = String(row.tool_name).trim();
				if (!toolName) { return; }

				if (!toolStats.has(toolName)) {
					toolStats.set(toolName, {
						tool: toolName,
						successful: 0,
						errors: 0
					});
				}

				const stat = toolStats.get(toolName);
				const count = Number.parseInt(row.count, 10) || 0;

				if (row.event === 'tool_call') {
					stat.successful += count;
				} else if (row.event === 'tool_error') {
					stat.errors += count;
				}
			});

			// Convert to array and sort by total usage
			return Array.from(toolStats.values())
				.sort((a, b) => (b.successful + b.errors) - (a.successful + a.errors))
				.slice(0, 6);
		}
	}

	return [];
}

/**
 * User management functions
 */

/**
 * Get a user by username
 * @param {string} username - Username to look up
 * @returns {Promise<object|null>} User object or null if not found
 */
async function getUserByUsername(username) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (dbType === 'sqlite') {
		const stmt = getPreparedStatement('getUserByUsername', 'SELECT id, username, password_hash, role, created_at, last_login FROM users WHERE username = ?');
		const user = stmt.get(username);
		return user || null;
	} else if (dbType === 'postgresql') {
		const result = await db.query(
			'SELECT id, username, password_hash, role, created_at, last_login FROM users WHERE username = $1',
			[username]
		);
		return result.rows[0] || null;
	}
}

/**
 * Create a new user
 * @param {string} username - Username
 * @param {string} passwordHash - Bcrypt password hash
 * @returns {Promise<object>} Created user object
 */
async function createUser(username, passwordHash, role = 'basic') {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	const normalized = normalizeRole(role);

	if (dbType === 'sqlite') {
		const stmt = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
		const result = stmt.run(username, passwordHash, normalized);
		return {
			id: result.lastInsertRowid,
			username,
			password_hash: passwordHash,
			role: normalized,
			created_at: new Date().toISOString()
		};
	} else if (dbType === 'postgresql') {
		const result = await db.query(
			'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, password_hash, role, created_at',
			[username, passwordHash, normalized]
		);
		return result.rows[0];
	}
}

/**
 * Update user's last login timestamp
 * @param {string} username - Username
 * @returns {Promise<void>}
 */
async function updateLastLogin(username) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	const now = new Date().toISOString();
	if (dbType === 'sqlite') {
		const stmt = db.prepare('UPDATE users SET last_login = ? WHERE username = ?');
		stmt.run(now, username);
	} else if (dbType === 'postgresql') {
		await db.query('UPDATE users SET last_login = $1 WHERE username = $2', [now, username]);
	}
}

/**
 * Get user by ID
 * @param {number} userId - User ID
 * @returns {Promise<object|null>} User object or null
 */
async function getUserById(userId) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (dbType === 'sqlite') {
		const stmt = db.prepare('SELECT id, username, password_hash, role, created_at, last_login FROM users WHERE id = ?');
		const user = stmt.get(userId);
		return user || null;
	} else if (dbType === 'postgresql') {
		const result = await db.query(
			'SELECT id, username, password_hash, role, created_at, last_login FROM users WHERE id = $1',
			[userId]
		);
		return result.rows[0] || null;
	}
}

/**
 * Get all users
 * @returns {Promise<Array>} Array of user objects (without password hashes)
 */
async function getAllUsers() {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (dbType === 'sqlite') {
		const stmt = db.prepare('SELECT id, username, role, created_at, last_login FROM users ORDER BY username');
		return stmt.all();
	} else if (dbType === 'postgresql') {
		const result = await db.query('SELECT id, username, role, created_at, last_login FROM users ORDER BY username');
		return result.rows;
	}
}

/**
 * Delete a user by username
 * @param {string} username - Username to delete
 * @returns {Promise<boolean>} True if user was deleted, false if not found
 */
async function deleteUser(username) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (dbType === 'sqlite') {
		const stmt = db.prepare('DELETE FROM users WHERE username = ?');
		const result = stmt.run(username);
		return result.changes > 0;
	} else if (dbType === 'postgresql') {
		const result = await db.query('DELETE FROM users WHERE username = $1', [username]);
		return result.rowCount > 0;
	}
}

/**
 * Update user password
 * @param {string} username - Username
 * @param {string} passwordHash - New bcrypt password hash
 * @returns {Promise<boolean>} True if password was updated, false if user not found
 */
async function updateUserPassword(username, passwordHash) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (dbType === 'sqlite') {
		const stmt = db.prepare('UPDATE users SET password_hash = ? WHERE username = ?');
		const result = stmt.run(passwordHash, username);
		return result.changes > 0;
	} else if (dbType === 'postgresql') {
		const result = await db.query('UPDATE users SET password_hash = $1 WHERE username = $2', [passwordHash, username]);
		return result.rowCount > 0;
	}
}

/**
 * Update user role
 * @param {string} username - Username
 * @param {string} role - New role (basic|advanced)
 * @returns {Promise<boolean>} True if updated, false otherwise
 */
async function updateUserRole(username, role) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	const normalized = normalizeRole(role);

	if (dbType === 'sqlite') {
		const stmt = db.prepare('UPDATE users SET role = ? WHERE username = ?');
		const result = stmt.run(normalized, username);
		return result.changes > 0;
	} else if (dbType === 'postgresql') {
		const result = await db.query('UPDATE users SET role = $1 WHERE username = $2', [normalized, username]);
		return result.rowCount > 0;
	}

	return false;
}

/**
 * Get company name for a server/org
 * @param {string} serverId - Server ID
 * @returns {Promise<string|null>} Company name or null if not found
 */
async function getOrgCompanyName(serverId) {
	if (!db || !serverId) {
		return null;
	}

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare('SELECT company_name FROM orgs WHERE server_id = ?');
			const result = stmt.get(serverId);
			return result ? result.company_name : null;
		} else if (dbType === 'postgresql') {
			const result = await db.query('SELECT company_name FROM orgs WHERE server_id = $1', [serverId]);
			return result.rows.length > 0 ? result.rows[0].company_name : null;
		}
	} catch (error) {
		console.error('Error getting org company name:', error);
		return null;
	}
}

/**
 * Get all organizations with their company names
 * @returns {Promise<Array>} Array of org objects with server_id and company_name
 */
async function getAllOrgs() {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare('SELECT server_id, company_name, created_at, updated_at FROM orgs ORDER BY updated_at DESC');
			return stmt.all();
		} else if (dbType === 'postgresql') {
			const result = await db.query('SELECT server_id, company_name, created_at, updated_at FROM orgs ORDER BY updated_at DESC');
			return result.rows;
		}
	} catch (error) {
		console.error('Error getting all orgs:', error);
		return [];
	}
}

/**
 * Update event data by ID
 * @param {number} id - Event ID
 * @param {object} data - New data object
 * @returns {Promise<boolean>} True if updated, false otherwise
 */
async function updateEventData(id, data) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare('UPDATE telemetry_events SET data = ? WHERE id = ?');
			const result = stmt.run(JSON.stringify(data), id);
			return result.changes > 0;
		} else if (dbType === 'postgresql') {
			const result = await db.query('UPDATE telemetry_events SET data = $1 WHERE id = $2', [data, id]);
			return result.rowCount > 0;
		}
		return false;
	} catch (error) {
		console.error('Error updating event data:', error);
		return false;
	}
}

/**
 * Get unique user IDs from all events
 * Returns both the identifier used for filtering and a human readable label
 * @returns {Array<{id: string, label: string}>} Sorted array of unique users
 */
async function getUniqueUserIds() {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	let rows;
	if (dbType === 'sqlite') {
		rows = db.prepare(`
			SELECT user_id, data
			FROM telemetry_events
			WHERE user_id IS NOT NULL OR (data IS NOT NULL AND data != '')
		`).all();
	} else {
		const result = await db.query(`
			SELECT user_id, data
			FROM telemetry_events
			WHERE user_id IS NOT NULL OR data IS NOT NULL
		`);
		rows = result.rows;
	}

	const userMap = new Map();

	rows.forEach(row => {
		let parsedData = null;
		if (row.data) {
			try {
				parsedData = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
			} catch {
				parsedData = null;
			}
		}

		const normalizedId = getNormalizedUserId({
			userId: row.user_id,
			data: parsedData
		});

		if (!normalizedId) {
			return;
		}

		const displayName = extractUserDisplayName(parsedData);
		const label = displayName && displayName.toLowerCase() !== normalizedId.toLowerCase() ? `${displayName} (${normalizedId})` : normalizedId;

		const existing = userMap.get(normalizedId);
		if (!existing || (existing.label === normalizedId && label !== normalizedId)) {
			userMap.set(normalizedId, {
				id: normalizedId,
				label
			});
		}
	});

	return Array.from(userMap.values()).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Get PostgreSQL pool if using PostgreSQL, null otherwise
 * Used for session store configuration
 */
function getPostgresPool() {
	if (dbType === 'postgresql' && db) {
		return db;
	}
	return null;
}

/**
 * Get SQLite database instance if using SQLite, null otherwise
 * Used for direct database operations in scripts
 */
function getSqliteDb() {
	if (dbType === 'sqlite' && db) {
		return db;
	}
	return null;
}

async function ensureUserRoleColumn() {
	if (!db) {
		return;
	}

	try {
		if (dbType === 'sqlite') {
			const columns = db.prepare('PRAGMA table_info(users)').all();
			const hasRoleColumn = columns.some(column => column.name === 'role');
			if (!hasRoleColumn) {
				db.exec('ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT \'basic\'');
			}
		} else if (dbType === 'postgresql') {
			await db.query('ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT \'basic\'');
		}
	} catch (error) {
		console.error('Error ensuring user role column:', error);
	}
}

/**
 * Get top users by event volume for the last N days (rolling window)
 * @param {number} limit - Maximum number of users to return (default 50)
 * @param {number} days - Number of days to look back (default 3)
 * @returns {Promise<Array<{id: string, label: string, eventCount: number}>>}
 */
async function getTopUsersLastDays(limit = 50, days = 3) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	const safeLimit = Math.min(Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 50), 500);
	const safeDays = Math.min(Math.max(1, Number.isFinite(days) ? Math.floor(days) : 3), 365);
	const lookbackModifier = `-${safeDays} days`;
	const results = [];

	if (dbType === 'sqlite') {
		const aggregated = db.prepare(`
			SELECT user_id, COUNT(*) as event_count
			FROM telemetry_events
			WHERE created_at >= datetime('now', 'localtime', ?)
				AND user_id IS NOT NULL
				AND TRIM(user_id) != ''
				AND deleted_at IS NULL
			GROUP BY user_id
			ORDER BY event_count DESC, user_id ASC
			LIMIT ?
		`).all(lookbackModifier, safeLimit);

		aggregated.forEach(row => {
			const latest = db.prepare(`
				SELECT data
				FROM telemetry_events
				WHERE user_id = ?
					AND created_at >= datetime('now', 'localtime', ?)
					AND deleted_at IS NULL
				ORDER BY created_at DESC
				LIMIT 1
			`).get(row.user_id, lookbackModifier);

			results.push({
				id: row.user_id,
				label: buildUserLabel(row.user_id, latest?.data),
				eventCount: Number(row.event_count) || 0
			});
		});
	} else if (dbType === 'postgresql') {
		const aggregated = await db.query(
			`
				WITH aggregated AS (
					SELECT user_id, COUNT(*) AS event_count
					FROM telemetry_events
					WHERE created_at >= (NOW() - ($2 || ' days')::interval)
						AND user_id IS NOT NULL
						AND TRIM(user_id) != ''
						AND deleted_at IS NULL
					GROUP BY user_id
					ORDER BY event_count DESC, user_id ASC
					LIMIT $1
				)
				SELECT a.user_id,
				       a.event_count,
				       (
				         SELECT data
				         FROM telemetry_events e
				         WHERE e.user_id = a.user_id
				           AND e.created_at >= (NOW() - ($2 || ' days')::interval)
				           AND e.deleted_at IS NULL
				         ORDER BY e.created_at DESC
				         LIMIT 1
				       ) AS data
				FROM aggregated a
				ORDER BY a.event_count DESC, a.user_id ASC
			`,
			[safeLimit, String(safeDays)]
		);

		aggregated.rows.forEach(row => {
			results.push({
				id: row.user_id,
				label: buildUserLabel(row.user_id, row.data),
				eventCount: Number(row.event_count) || 0
			});
		});
	}

	return results;
}

/**
 * Get top teams by event count in the last N days based on org-team mapping
 * @param {Array} orgTeamMappings - Array of {orgIdentifier, clientName, teamName, color, active}
 * @param {number} limit - Maximum number of teams to return (default: 50)
 * @param {number} days - Number of days to look back (default: 3)
 * @returns {Promise<Array>} Array of {id, label, eventCount, clientName, color} objects
 */
async function getTopTeamsLastDays(orgTeamMappings = [], limit = 50, days = 3) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	const mappingsFromRequest = Array.isArray(orgTeamMappings) ? orgTeamMappings : [];
	const effectiveMappings = mappingsFromRequest.length > 0 ? mappingsFromRequest : await getOrgTeamMappingsFromTeamsTable();

	if (!effectiveMappings || effectiveMappings.length === 0) {
		return [];
	}

	const safeLimit = Math.min(Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 50), 500);
	const safeDays = Math.min(Math.max(1, Number.isFinite(days) ? Math.floor(days) : 3), 365);
	const lookbackModifier = `-${safeDays} days`;

	const normalizeOrgId = (orgId) => String(orgId || '').trim().toLowerCase();
	const normalizeTeamKey = (teamName) => String(teamName || '').trim().toLowerCase();

	// Build lookups so multiple orgs that point to the same team name are grouped
	const orgToTeamKey = new Map(); // normalized org id -> normalized team key
	const teamAggregates = new Map(); // normalized team key -> aggregate info
	if (Array.isArray(effectiveMappings)) {
		effectiveMappings.forEach(mapping => {
			const isActive = mapping?.active !== false;
			const rawTeamName = String(mapping?.teamName || '').trim();
			const originalOrgId = String(mapping?.orgIdentifier || '').trim();
			const normalizedOrgId = normalizeOrgId(originalOrgId);
			if (!isActive || !rawTeamName || !normalizedOrgId) {
				return;
			}

			const teamKey = normalizeTeamKey(rawTeamName);
			if (!teamAggregates.has(teamKey)) {
				teamAggregates.set(teamKey, {
					key: teamKey,
					teamName: rawTeamName,
					color: String(mapping?.color || '').trim(),
					teamId: mapping?.teamId || null,
					hasLogo: Boolean(mapping?.hasLogo),
					logoUrl: String(mapping?.logoUrl || '').trim(),
					clients: new Set(),
					orgIds: new Set(),
					orgDisplayNames: new Map(),
					activeOrgDisplayNames: new Set(),
					eventCount: 0
				});
			}

			const entry = teamAggregates.get(teamKey);
			entry.orgIds.add(normalizedOrgId);
			orgToTeamKey.set(normalizedOrgId, teamKey);

			if (!entry.teamId && mapping?.teamId) {
				entry.teamId = mapping.teamId;
			}
			const mappingHasLogo = Boolean(mapping?.hasLogo);
			if (mappingHasLogo && !entry.hasLogo) {
				entry.hasLogo = true;
			}
			if (mapping?.logoUrl && !entry.logoUrl) {
				entry.logoUrl = String(mapping.logoUrl).trim();
			}

			const clientName = String(mapping?.clientName || '').trim();
			if (clientName) {
				entry.clients.add(clientName);
			}

			const displayLabel = clientName || originalOrgId || normalizedOrgId;
			if (displayLabel && !entry.orgDisplayNames.has(normalizedOrgId)) {
				entry.orgDisplayNames.set(normalizedOrgId, displayLabel);
			}

			if (!entry.color && mapping?.color) {
				entry.color = String(mapping.color).trim();
			}
		});
	}

	// If there are no active mappings we can return early and avoid a full scan
	if (teamAggregates.size === 0 || orgToTeamKey.size === 0) {
		return [];
	}

	const results = [];
	const orgIdCounts = new Map();

	if (dbType === 'sqlite') {
		// Use denormalized org_id column for faster queries
		const aggregated = db.prepare(`
			SELECT org_id, COUNT(*) as event_count
			FROM telemetry_events
			WHERE created_at >= datetime('now', 'localtime', ?)
				AND org_id IS NOT NULL
				AND org_id != ''
				AND deleted_at IS NULL
			GROUP BY org_id
			ORDER BY event_count DESC, org_id ASC
		`).all(lookbackModifier);

		aggregated.forEach(row => {
			const orgId = row.org_id;
			if (orgId) {
				orgIdCounts.set(orgId, Number.parseInt(row.event_count, 10) || 0);
			}
		});
	} else if (dbType === 'postgresql') {
		// Use denormalized org_id column for faster queries
		const aggregated = await db.query(
			`
				SELECT org_id, COUNT(*) AS event_count
				FROM telemetry_events
				WHERE created_at >= (NOW() - ($1 || ' days')::interval)
					AND org_id IS NOT NULL
					AND org_id != ''
					AND deleted_at IS NULL
				GROUP BY org_id
				ORDER BY event_count DESC, org_id ASC
			`,
			[String(safeDays)]
		);

		aggregated.rows.forEach(row => {
			const orgId = row.org_id;
			if (orgId) {
				orgIdCounts.set(orgId, Number.parseInt(row.event_count, 10) || 0);
			}
		});
	}

	// Convert to array and sort by count
	const sortedOrgs = Array.from(orgIdCounts.entries())
		.map(([orgId, count]) => ({orgId, count}))
		.sort((a, b) => {
			if (b.count !== a.count) {
				return b.count - a.count;
			}
			return a.orgId.localeCompare(b.orgId);
		});

	// Map to team info and add to results
	sortedOrgs.forEach(({orgId, count}) => {
		const normalizedOrgId = normalizeOrgId(orgId);
		const teamKey = orgToTeamKey.get(normalizedOrgId);
		if (!teamKey) {
			return;
		}
		const teamEntry = teamAggregates.get(teamKey);
		if (teamEntry) {
			teamEntry.eventCount += count;
			const orgDisplayValue = teamEntry.orgDisplayNames.get(normalizedOrgId) || orgId;
			if (orgDisplayValue) {
				teamEntry.activeOrgDisplayNames.add(orgDisplayValue);
			}
		}
	});

	// Convert aggregates to sorted array and apply limit
	Array.from(teamAggregates.values()).forEach(teamEntry => {
		if (teamEntry.eventCount <= 0) {
			return;
		}
		const clients = Array.from(teamEntry.clients);
		const orgNames = Array.from(teamEntry.activeOrgDisplayNames)
			.map(name => String(name || '').trim())
			.filter(name => name.length > 0);
		results.push({
			id: teamEntry.key,
			label: teamEntry.teamName,
			clientName: clients.join(' · '),
			orgs: orgNames,
			color: teamEntry.color,
			eventCount: teamEntry.eventCount,
			teamId: teamEntry.teamId,
			hasLogo: Boolean(teamEntry.hasLogo),
			logoUrl: teamEntry.logoUrl || ''
		});
	});

	return results
		.sort((a, b) => {
			if (b.eventCount !== a.eventCount) {
				return b.eventCount - a.eventCount;
			}
			return a.label.localeCompare(b.label);
		})
		.slice(0, safeLimit);
}

/**
 * Build org -> team mappings from the teams/orgs tables as a fallback when
 * no explicit mappings are provided by the client.
 */
async function getOrgTeamMappingsFromTeamsTable() {
	if (!db) {
		return [];
	}

	try {
		if (dbType === 'sqlite') {
			const rows = db.prepare(`
        SELECT
          o.server_id AS org_id,
          COALESCE(o.company_name, o.alias, '') AS client_name,
          t.id AS team_id,
          t.name AS team_name,
          t.color AS team_color,
          t.logo_mime AS team_logo_mime
        FROM orgs o
        JOIN teams t ON t.id = o.team_id
        WHERE o.server_id IS NOT NULL
          AND TRIM(o.server_id) != ''
      `).all();

			return rows
				.filter(row => row.org_id && row.team_name)
				.map(row => ({
					orgIdentifier: row.org_id,
					clientName: row.client_name || '',
					teamId: row.team_id || null,
					teamName: row.team_name,
					color: row.team_color || '',
					hasLogo: Boolean(row.team_logo_mime && String(row.team_logo_mime).trim() !== ''),
					logoUrl: row.team_id && row.team_logo_mime ? `/api/teams/${row.team_id}/logo` : '',
					active: true
				}));
		} else if (dbType === 'postgresql') {
			const {rows} = await db.query(`
        SELECT
          o.server_id AS org_id,
          COALESCE(o.company_name, o.alias, '') AS client_name,
          t.id AS team_id,
          t.name AS team_name,
          t.color AS team_color,
          t.logo_mime AS team_logo_mime
        FROM orgs o
        JOIN teams t ON t.id = o.team_id
        WHERE o.server_id IS NOT NULL
          AND btrim(o.server_id) <> ''
      `);

			return rows
				.filter(row => row.org_id && row.team_name)
				.map(row => ({
					orgIdentifier: row.org_id,
					clientName: row.client_name || '',
					teamId: row.team_id || null,
					teamName: row.team_name,
					color: row.team_color || '',
					hasLogo: Boolean(row.team_logo_mime && String(row.team_logo_mime).trim() !== ''),
					logoUrl: row.team_id && row.team_logo_mime ? `/api/teams/${row.team_id}/logo` : '',
					active: true
				}));
		}
	} catch (error) {
		console.error('Error building org-team mappings from teams table:', error);
	}

	return [];
}

async function ensureTelemetryParentSessionColumn() {
	if (!db) {
		return;
	}

	try {
		if (dbType === 'sqlite') {
			const columns = db.prepare('PRAGMA table_info(telemetry_events)').all();
			const hasParentColumn = columns.some(column => column.name === 'parent_session_id');
			if (!hasParentColumn) {
				db.exec('ALTER TABLE telemetry_events ADD COLUMN parent_session_id TEXT');
				db.exec('CREATE INDEX IF NOT EXISTS idx_parent_session_id ON telemetry_events(parent_session_id)');
			}
		} else if (dbType === 'postgresql') {
			await db.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS parent_session_id TEXT');
			await db.query('CREATE INDEX IF NOT EXISTS idx_parent_session_id ON telemetry_events(parent_session_id)');
		}
	} catch (error) {
		console.error('Error ensuring telemetry parent_session_id column:', error);
	}
}

/**
 * Ensure denormalized columns exist in telemetry_events table
 * Adds org_id, user_name, and tool_name columns for faster queries
 */
async function ensureDenormalizedColumns() {
	if (!db) {
		return;
	}

	try {
		if (dbType === 'sqlite') {
			const columns = db.prepare('PRAGMA table_info(telemetry_events)').all();
			const columnNames = columns.map(col => col.name);

			// Add org_id column if it doesn't exist
			if (!columnNames.includes('org_id')) {
				db.exec('ALTER TABLE telemetry_events ADD COLUMN org_id TEXT');
			}

			// Add user_name column if it doesn't exist
			if (!columnNames.includes('user_name')) {
				db.exec('ALTER TABLE telemetry_events ADD COLUMN user_name TEXT');
			}

			// Add tool_name column if it doesn't exist
			if (!columnNames.includes('tool_name')) {
				db.exec('ALTER TABLE telemetry_events ADD COLUMN tool_name TEXT');
			}

			// Add company_name column if it doesn't exist
			if (!columnNames.includes('company_name')) {
				db.exec('ALTER TABLE telemetry_events ADD COLUMN company_name TEXT');
			}

			// Add deleted_at column if it doesn't exist (for soft delete/trash functionality)
			if (!columnNames.includes('deleted_at')) {
				db.exec('ALTER TABLE telemetry_events ADD COLUMN deleted_at TEXT');
				db.exec('CREATE INDEX IF NOT EXISTS idx_deleted_at ON telemetry_events(deleted_at)');
			}

			// Add team_id column if it doesn't exist (for pre-calculated team association)
			if (!columnNames.includes('team_id')) {
				db.exec('ALTER TABLE telemetry_events ADD COLUMN team_id INTEGER REFERENCES teams(id)');
				db.exec('CREATE INDEX IF NOT EXISTS idx_team_id ON telemetry_events(team_id)');
				db.exec('CREATE INDEX IF NOT EXISTS idx_team_id_created_at ON telemetry_events(team_id, created_at)');
			}

			// Add event column if it doesn't exist (for denormalized event name from event_types)
			if (!columnNames.includes('event')) {
				db.exec('ALTER TABLE telemetry_events ADD COLUMN event TEXT');
			}

			// Create indexes for denormalized columns (if they don't exist)
			db.exec('CREATE INDEX IF NOT EXISTS idx_user_name_created_at ON telemetry_events(user_name, created_at)');
			db.exec('CREATE INDEX IF NOT EXISTS idx_org_id_created_at ON telemetry_events(org_id, created_at)');
			db.exec('CREATE INDEX IF NOT EXISTS idx_tool_name_created_at ON telemetry_events(tool_name, created_at)');
			db.exec('CREATE INDEX IF NOT EXISTS idx_company_name_created_at ON telemetry_events(company_name, created_at)');
			db.exec('CREATE INDEX IF NOT EXISTS idx_user_name_tool_name_created_at ON telemetry_events(user_name, tool_name, created_at)');
			db.exec('CREATE INDEX IF NOT EXISTS idx_org_id_tool_name_created_at ON telemetry_events(org_id, tool_name, created_at)');
			db.exec('CREATE INDEX IF NOT EXISTS idx_event ON telemetry_events(event)');
			db.exec('CREATE INDEX IF NOT EXISTS idx_event_created_at ON telemetry_events(event, created_at)');
		} else if (dbType === 'postgresql') {
			// PostgreSQL supports IF NOT EXISTS in ALTER TABLE
			await db.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS org_id TEXT');
			await db.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS user_name TEXT');
			await db.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS tool_name TEXT');
			await db.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS company_name TEXT');
			await db.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
			await db.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id)');
			await db.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS event TEXT');
			await db.query('CREATE INDEX IF NOT EXISTS idx_deleted_at ON telemetry_events(deleted_at)');
			await db.query('CREATE INDEX IF NOT EXISTS idx_team_id ON telemetry_events(team_id)');
			await db.query('CREATE INDEX IF NOT EXISTS idx_team_id_created_at ON telemetry_events(team_id, created_at)');

			// Create indexes for denormalized columns (if they don't exist)
			await db.query('CREATE INDEX IF NOT EXISTS idx_user_name_created_at ON telemetry_events(user_name, created_at)');
			await db.query('CREATE INDEX IF NOT EXISTS idx_org_id_created_at ON telemetry_events(org_id, created_at)');
			await db.query('CREATE INDEX IF NOT EXISTS idx_tool_name_created_at ON telemetry_events(tool_name, created_at)');
			await db.query('CREATE INDEX IF NOT EXISTS idx_company_name_created_at ON telemetry_events(company_name, created_at)');
			await db.query('CREATE INDEX IF NOT EXISTS idx_user_name_tool_name_created_at ON telemetry_events(user_name, tool_name, created_at)');
			await db.query('CREATE INDEX IF NOT EXISTS idx_org_id_tool_name_created_at ON telemetry_events(org_id, tool_name, created_at)');
			await db.query('CREATE INDEX IF NOT EXISTS idx_event ON telemetry_events(event)');
			await db.query('CREATE INDEX IF NOT EXISTS idx_event_created_at ON telemetry_events(event, created_at)');

			// GIN index for JSONB queries (PostgreSQL only)
			await db.query('CREATE INDEX IF NOT EXISTS idx_data_gin ON telemetry_events USING GIN (data)');
		}

		// Populate existing data if columns were just added
		await populateDenormalizedColumns();
	} catch (error) {
		console.error('Error ensuring denormalized columns:', error);
	}
}

/**
 * Omple les columnes denormalitzades amb dades JSON existents als registres
 * Aquesta funció s'executa després d'afegir les columnes per emplenar dades existents
 *
 * Aquest procés és necessari quan s'afegeixen noves columnes denormalitzades a la taula,
 * ja que els registres existents tenen aquestes columnes buides. Extreu informació
 * del camp JSON 'data' i la guarda directament a les columnes per millorar el rendiment de consultes.
 */
async function populateDenormalizedColumns() {
	if (!db) {
		return;
	}

	try {
		// Verifica si cal emplenar dades (només si hi ha registres amb valors NULL a les noves columnes)
		let needsPopulation = false;

		if (dbType === 'sqlite') {
			const result = db.prepare(`
        SELECT COUNT(*) as count
        FROM telemetry_events
        WHERE (org_id IS NULL OR user_name IS NULL OR tool_name IS NULL OR error_message IS NULL OR team_id IS NULL)
          AND data IS NOT NULL
          AND data != ''
        LIMIT 1
      `).get();
			needsPopulation = result && result.count > 0;
		} else if (dbType === 'postgresql') {
			const result = await db.query(`
        SELECT COUNT(*) as count
        FROM telemetry_events
        WHERE (org_id IS NULL OR user_name IS NULL OR tool_name IS NULL OR team_id IS NULL)
          AND data IS NOT NULL
        LIMIT 1
      `);
			needsPopulation = result.rows.length > 0 && Number.parseInt(result.rows[0].count, 10) > 0;
		}

		if (!needsPopulation) {
			return; // No data to populate
		}


		if (dbType === 'sqlite') {
			// Per SQLite, actualitzem en lots per evitar bloquejos de base de dades
			const batchSize = 1000; // Processa 1000 registres cada vegada
			let offset = 0;
			let hasMore = true;

			while (hasMore) {
				// Obté el següent lot de registres que necessiten actualització
				const rows = db.prepare(`
          SELECT id, data, org_id
          FROM telemetry_events
          WHERE (org_id IS NULL OR user_name IS NULL OR tool_name IS NULL OR (team_id IS NULL AND org_id IS NOT NULL))
            AND data IS NOT NULL
            AND data != ''
          LIMIT ? OFFSET ?
        `).all(batchSize, offset);

				if (rows.length === 0) {
					hasMore = false;
					break;
				}

				// Prepara la consulta d'actualització
				const updateStmt = db.prepare(`
          UPDATE telemetry_events
          SET org_id = ?, user_name = ?, tool_name = ?, company_name = ?, error_message = ?, team_id = ?
          WHERE id = ?
        `);

				// Processa cada registre del lot
				for (const row of rows) {
					try {
						// Parseja les dades JSON si cal
						const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
						const eventData = {data};

						// Extreu els valors denormalitzats usant la funció consolidada (optimització)
						const normalizedFields = extractNormalizedFields(eventData);
						const {orgId, userName, toolName, companyName, errorMessage} = normalizedFields;

						// Resol team_id si tenim org_id
						let teamId = null;
						if (orgId) {
							const teamResult = db.prepare('SELECT team_id FROM orgs WHERE server_id = ?').get(orgId);
							teamId = teamResult?.team_id || null;
						}

						// Actualitza el registre amb els valors extrets
						updateStmt.run(orgId, userName, toolName, companyName, errorMessage, teamId, row.id);
					} catch (error) {
						// Salta registres amb JSON invàlid (els deixa sense emplenar)
						// Això evita aturar tot el procés per un sol registre corrupte
						console.warn(`Error processant dades per l'event ${row.id}:`, error.message);
					}
				}

				offset += batchSize;
				if (rows.length < batchSize) {
					hasMore = false;
				}
			}
		} else if (dbType === 'postgresql') {
			// Per PostgreSQL, usa una sola consulta UPDATE amb extracció JSON nativa
			// Això és més eficient que processar registre a registre
			await db.query(`
        UPDATE telemetry_events
        SET
          -- Extreu org_id de diverses ubicacions possibles al JSON
          org_id = COALESCE(
            data->>'orgId',
            data->'state'->'org'->>'id'
          ),
          -- Extreu user_name de diverses ubicacions possibles
          user_name = COALESCE(
            data->>'userName',
            data->>'user_name',
            data->'user'->>'name'
          ),
          -- Extreu tool_name
          tool_name = COALESCE(
            data->>'toolName',
            data->>'tool'
          ),
          -- Extreu company_name dels nous formats
          company_name = COALESCE(
            data->'state'->'org'->'companyDetails'->>'Name',
            data->'companyDetails'->>'Name'
          ),
          -- Extreu error_message per events tool_error
          error_message = COALESCE(
            data->>'errorMessage',
            data->'error'->>'message'
          )
        WHERE (org_id IS NULL OR user_name IS NULL OR tool_name IS NULL OR error_message IS NULL)
          AND data IS NOT NULL
      `);

			// Actualitza team_id basant-se en org_id per registres que el necessiten
			await db.query(`
        UPDATE telemetry_events
        SET team_id = orgs.team_id
        FROM orgs
        WHERE telemetry_events.org_id = orgs.server_id
          AND telemetry_events.team_id IS NULL
          AND telemetry_events.org_id IS NOT NULL
      `);
		}

		// Populate event column from event_types table based on event_id (both SQLite and PostgreSQL)
		// This runs separately from the JSON-based population above since event comes from a different table
		if (dbType === 'sqlite') {
			const eventCheck = db.prepare('SELECT COUNT(*) as count FROM telemetry_events WHERE event IS NULL AND event_id IS NOT NULL LIMIT 1').get();
			if (eventCheck && eventCheck.count > 0) {
				db.prepare(`
          UPDATE telemetry_events
          SET event = (SELECT name FROM event_types WHERE id = telemetry_events.event_id)
          WHERE event IS NULL AND event_id IS NOT NULL
        `).run();
			}
		} else if (dbType === 'postgresql') {
			const eventCheck = await db.query('SELECT COUNT(*) as count FROM telemetry_events WHERE event IS NULL AND event_id IS NOT NULL LIMIT 1');
			if (eventCheck.rows.length > 0 && Number.parseInt(eventCheck.rows[0].count, 10) > 0) {
				await db.query(`
          UPDATE telemetry_events
          SET event = event_types.name
          FROM event_types
          WHERE telemetry_events.event_id = event_types.id
            AND telemetry_events.event IS NULL
        `);
			}
		}

	} catch (error) {
		console.error('Error emplenant columnes denormalitzades:', error);
	}
}

/**
 * Adds schema v2 columns to telemetry_events table for better query performance
 * - area: event area ('tool', 'session', 'general')
 * - success: operation success status
 * - telemetry_schema_version: original schema version (1 or 2)
 */
async function ensureSchemaV2Columns() {
	if (!db) {
		return;
	}

	try {
		if (dbType === 'sqlite') {
			const columns = db.prepare('PRAGMA table_info(telemetry_events)').all();
			const columnNames = columns.map(col => col.name);

			if (!columnNames.includes('area')) {
				db.exec('ALTER TABLE telemetry_events ADD COLUMN area TEXT');
				db.exec('CREATE INDEX IF NOT EXISTS idx_area ON telemetry_events(area)');
			}
			if (!columnNames.includes('success')) {
				db.exec('ALTER TABLE telemetry_events ADD COLUMN success BOOLEAN');
				db.exec('CREATE INDEX IF NOT EXISTS idx_success ON telemetry_events(success)');
			}
			if (!columnNames.includes('telemetry_schema_version')) {
				db.exec('ALTER TABLE telemetry_events ADD COLUMN telemetry_schema_version INTEGER');
				db.exec('CREATE INDEX IF NOT EXISTS idx_telemetry_schema_version ON telemetry_events(telemetry_schema_version)');
			}
		} else if (dbType === 'postgresql') {
			await db.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS area TEXT');
			await db.query('CREATE INDEX IF NOT EXISTS idx_area ON telemetry_events(area)');
			await db.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS success BOOLEAN');
			await db.query('CREATE INDEX IF NOT EXISTS idx_success ON telemetry_events(success)');
			await db.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS telemetry_schema_version INTEGER');
			await db.query('CREATE INDEX IF NOT EXISTS idx_telemetry_schema_version ON telemetry_events(telemetry_schema_version)');
		}
	} catch (error) {
		console.error('Error ensuring schema v2 columns:', error);
	}
}

/**
 * Migrate existing events to schema v2 by populating area, success, and telemetry_schema_version columns
 * This is optional but recommended for better query performance and consistent data
 */
async function migrateExistingEventsToSchemaV2() {
	if (!db) {
		return;
	}

	try {
		if (dbType === 'sqlite') {
			// SQLite: use UPDATE with CASE statements for efficiency (similar to PostgreSQL)
			// This avoids the LIMIT/OFFSET pagination issue where records are skipped
			const result = db.prepare(`
				UPDATE telemetry_events
				SET
					area = CASE
						WHEN (SELECT name FROM event_types WHERE id = telemetry_events.event_id) = 'tool_call' THEN 'tool'
						WHEN (SELECT name FROM event_types WHERE id = telemetry_events.event_id) = 'tool_error' THEN 'tool'
						WHEN (SELECT name FROM event_types WHERE id = telemetry_events.event_id) = 'session_start' THEN 'session'
						WHEN (SELECT name FROM event_types WHERE id = telemetry_events.event_id) = 'session_end' THEN 'session'
						WHEN (SELECT name FROM event_types WHERE id = telemetry_events.event_id) = 'error' THEN 'general'
						ELSE 'general'
					END,
					success = CASE
						WHEN (SELECT name FROM event_types WHERE id = telemetry_events.event_id) = 'tool_call' THEN 1
						WHEN (SELECT name FROM event_types WHERE id = telemetry_events.event_id) = 'session_start' THEN 1
						WHEN (SELECT name FROM event_types WHERE id = telemetry_events.event_id) = 'session_end' THEN 1
						WHEN (SELECT name FROM event_types WHERE id = telemetry_events.event_id) = 'custom' THEN 1
						ELSE 0
					END,
					telemetry_schema_version = 1
				WHERE area IS NULL OR telemetry_schema_version IS NULL
			`).run();

			if (result.changes > 0) {
				console.log(`✅ Migration complete: ${result.changes} events migrated to schema v2`);
			}
		} else if (dbType === 'postgresql') {
			// PostgreSQL: use UPDATE with JOIN for efficiency
			const result = await db.query(`
				UPDATE telemetry_events e
				SET
					area = CASE et.name
						WHEN 'tool_call' THEN 'tool'
						WHEN 'tool_error' THEN 'tool'
						WHEN 'session_start' THEN 'session'
						WHEN 'session_end' THEN 'session'
						WHEN 'error' THEN 'general'
						ELSE 'general'
					END,
					success = CASE et.name
						WHEN 'tool_call' THEN true
						WHEN 'session_start' THEN true
						WHEN 'session_end' THEN true
						WHEN 'custom' THEN true
						ELSE false
					END,
					telemetry_schema_version = 1
				FROM event_types et
				WHERE e.event_id = et.id
					AND (e.area IS NULL OR e.telemetry_schema_version IS NULL)
			`);

			if (result.rowCount > 0) {
				console.log(`✅ Migration complete: ${result.rowCount} events migrated to schema v2`);
			}
		}
	} catch (error) {
		console.error('Error migrating existing events to schema v2:', error);
		// Don't throw error - migration is optional
		console.warn('Continuing without migration - new events will have schema v2 fields, old events will have NULL');
	}
}

/**
 * Ensure event statistics tables exist and are backfilled
 * - user_event_stats: aggregated counters per user_id
 * - org_event_stats: aggregated counters per org_id (for team calculations)
 */
async function ensureEventStatsTables() {
	if (!db) {
		return;
	}

	try {
		if (dbType === 'sqlite') {
			db.exec(`
        CREATE TABLE IF NOT EXISTS user_event_stats (
          user_id TEXT PRIMARY KEY,
          event_count INTEGER NOT NULL DEFAULT 0,
          last_event TEXT,
          display_name TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_user_event_stats_last_event ON user_event_stats(last_event);
        CREATE TABLE IF NOT EXISTS org_event_stats (
          org_id TEXT PRIMARY KEY,
          event_count INTEGER NOT NULL DEFAULT 0,
          last_event TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_org_event_stats_last_event ON org_event_stats(last_event);
      `);
		} else if (dbType === 'postgresql') {
			await db.query(`
        CREATE TABLE IF NOT EXISTS user_event_stats (
          user_id TEXT PRIMARY KEY,
          event_count INTEGER NOT NULL DEFAULT 0,
          last_event TIMESTAMPTZ,
          display_name TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_user_event_stats_last_event ON user_event_stats(last_event);
        CREATE TABLE IF NOT EXISTS org_event_stats (
          org_id TEXT PRIMARY KEY,
          event_count INTEGER NOT NULL DEFAULT 0,
          last_event TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS idx_org_event_stats_last_event ON org_event_stats(last_event);
      `);
		}

		await backfillEventStatsIfEmpty();
	} catch (error) {
		console.error('Error ensuring event stats tables:', error);
	}
}

/**
 * Convert any timestamp-ish input to ISO string for consistent ordering
 */
function normalizeStatsTimestamp(value) {
	if (!value) {
		return null;
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	try {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date.toISOString();
	} catch {
		return null;
	}
}

/**
 * Backfill stats tables once so we start from the real totals
 */
async function backfillEventStatsIfEmpty() {
	if (!db) {
		return;
	}

	try {
		const hasUserStats = dbType === 'sqlite' ? (db.prepare('SELECT COUNT(*) as count FROM user_event_stats').get()?.count || 0) > 0 : (await db.query('SELECT COUNT(*) as count FROM user_event_stats')).rows.some(row => Number.parseInt(row.count, 10) > 0);
		const hasOrgStats = dbType === 'sqlite' ? (db.prepare('SELECT COUNT(*) as count FROM org_event_stats').get()?.count || 0) > 0 : (await db.query('SELECT COUNT(*) as count FROM org_event_stats')).rows.some(row => Number.parseInt(row.count, 10) > 0);

		if (hasUserStats && hasOrgStats) {
			return;
		}

		if (dbType === 'sqlite') {
			if (!hasUserStats) {
				const aggregatedUsers = db.prepare(`
          SELECT
            user_id,
            COUNT(*) AS event_count,
            MAX(timestamp) AS last_event,
            (
              SELECT user_name
              FROM telemetry_events te2
              WHERE te2.user_id = te.user_id
                AND te2.user_name IS NOT NULL
                AND TRIM(te2.user_name) != ''
              ORDER BY te2.timestamp DESC
              LIMIT 1
            ) AS display_name
          FROM telemetry_events te
          WHERE user_id IS NOT NULL
            AND TRIM(user_id) != ''
          GROUP BY user_id
        `).all();

				const insertUserStat = db.prepare(`
          INSERT INTO user_event_stats (user_id, event_count, last_event, display_name)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            event_count = excluded.event_count,
            last_event = excluded.last_event,
            display_name = COALESCE(excluded.display_name, user_event_stats.display_name)
        `);

				aggregatedUsers.forEach(row => {
					insertUserStat.run(row.user_id, row.event_count, row.last_event, row.display_name || null);
				});
			}

			if (!hasOrgStats) {
				const aggregatedOrgs = db.prepare(`
          SELECT
            org_id,
            COUNT(*) AS event_count,
            MAX(timestamp) AS last_event
          FROM telemetry_events
          WHERE org_id IS NOT NULL
            AND TRIM(org_id) != ''
            AND deleted_at IS NULL
          GROUP BY org_id
        `).all();

				const insertOrgStat = db.prepare(`
          INSERT INTO org_event_stats (org_id, event_count, last_event)
          VALUES (?, ?, ?)
          ON CONFLICT(org_id) DO UPDATE SET
            event_count = excluded.event_count,
            last_event = excluded.last_event
        `);

				aggregatedOrgs.forEach(row => {
					insertOrgStat.run(row.org_id, row.event_count, row.last_event);
				});
			}
		} else if (dbType === 'postgresql') {
			if (!hasUserStats) {
				await db.query(`
          INSERT INTO user_event_stats (user_id, event_count, last_event, display_name)
          SELECT
            user_id,
            COUNT(*) AS event_count,
            MAX(timestamp) AS last_event,
            (
              SELECT user_name
              FROM telemetry_events te2
              WHERE te2.user_id = te.user_id
                AND te2.user_name IS NOT NULL
                AND TRIM(te2.user_name) != ''
              ORDER BY te2.timestamp DESC
              LIMIT 1
            ) AS display_name
          FROM telemetry_events te
          WHERE user_id IS NOT NULL
            AND TRIM(user_id) != ''
          GROUP BY user_id
          ON CONFLICT (user_id) DO UPDATE SET
            event_count = EXCLUDED.event_count,
            last_event = EXCLUDED.last_event,
            display_name = COALESCE(EXCLUDED.display_name, user_event_stats.display_name)
        `);
			}

			if (!hasOrgStats) {
				await db.query(`
          INSERT INTO org_event_stats (org_id, event_count, last_event)
          SELECT
            org_id,
            COUNT(*) AS event_count,
            MAX(timestamp) AS last_event
          FROM telemetry_events
          WHERE org_id IS NOT NULL
            AND TRIM(org_id) != ''
            AND deleted_at IS NULL
          GROUP BY org_id
          ON CONFLICT (org_id) DO UPDATE SET
            event_count = EXCLUDED.event_count,
            last_event = EXCLUDED.last_event
        `);
			}
		}
	} catch (error) {
		console.error('Error backfilling event stats tables:', error);
	}
}

async function upsertUserEventStats(userId, eventTimestamp, displayName = null) {
	if (!db || !userId) {
		return;
	}
	const normalizedTimestamp = normalizeStatsTimestamp(eventTimestamp) || new Date().toISOString();

	if (dbType === 'sqlite') {
		const stmt = getPreparedStatement('upsertUserEventStats', `
      INSERT INTO user_event_stats (user_id, event_count, last_event, display_name)
      VALUES (?, 1, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        event_count = user_event_stats.event_count + 1,
        last_event = CASE
          WHEN excluded.last_event IS NOT NULL
               AND (user_event_stats.last_event IS NULL OR excluded.last_event > user_event_stats.last_event)
          THEN excluded.last_event
          ELSE user_event_stats.last_event
        END,
        display_name = COALESCE(excluded.display_name, user_event_stats.display_name)
    `);
		stmt.run(userId, normalizedTimestamp, displayName || null);
	} else if (dbType === 'postgresql') {
		await db.query(
			`
        INSERT INTO user_event_stats (user_id, event_count, last_event, display_name)
        VALUES ($1, 1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET
          event_count = user_event_stats.event_count + 1,
          last_event = CASE
            WHEN EXCLUDED.last_event IS NOT NULL
                 AND (user_event_stats.last_event IS NULL OR EXCLUDED.last_event > user_event_stats.last_event)
            THEN EXCLUDED.last_event
            ELSE user_event_stats.last_event
          END,
          display_name = COALESCE(EXCLUDED.display_name, user_event_stats.display_name)
      `,
			[userId, normalizedTimestamp, displayName || null]
		);
	}
}

async function upsertOrgEventStats(orgId, eventTimestamp) {
	if (!db || !orgId) {
		return;
	}
	const normalizedTimestamp = normalizeStatsTimestamp(eventTimestamp) || new Date().toISOString();

	if (dbType === 'sqlite') {
		const stmt = getPreparedStatement('upsertOrgEventStats', `
      INSERT INTO org_event_stats (org_id, event_count, last_event)
      VALUES (?, 1, ?)
      ON CONFLICT(org_id) DO UPDATE SET
        event_count = org_event_stats.event_count + 1,
        last_event = CASE
          WHEN excluded.last_event IS NOT NULL
               AND (org_event_stats.last_event IS NULL OR excluded.last_event > org_event_stats.last_event)
          THEN excluded.last_event
          ELSE org_event_stats.last_event
        END
    `);
		stmt.run(orgId, normalizedTimestamp);
	} else if (dbType === 'postgresql') {
		await db.query(
			`
        INSERT INTO org_event_stats (org_id, event_count, last_event)
        VALUES ($1, 1, $2)
        ON CONFLICT (org_id) DO UPDATE SET
          event_count = org_event_stats.event_count + 1,
          last_event = CASE
            WHEN EXCLUDED.last_event IS NOT NULL
                 AND (org_event_stats.last_event IS NULL OR EXCLUDED.last_event > org_event_stats.last_event)
            THEN EXCLUDED.last_event
            ELSE org_event_stats.last_event
          END
      `,
			[orgId, normalizedTimestamp]
		);
	}
}

async function updateAggregatedStatsForEvent(userId, orgId, eventTimestamp, displayName = null) {
	const tasks = [];
	if (userId) {
		tasks.push(upsertUserEventStats(userId, eventTimestamp, displayName));
	}
	if (orgId) {
		tasks.push(upsertOrgEventStats(orgId, eventTimestamp));
	}
	if (tasks.length > 0) {
		await Promise.all(tasks);
	}
}

async function recomputeUserEventStats(userIds = []) {
	if (!db) {
		return;
	}
	const uniqueIds = Array.from(new Set((userIds || []).filter(id => typeof id === 'string' && id.trim() !== '')));
	if (uniqueIds.length === 0) {
		return;
	}

	if (dbType === 'sqlite') {
		const statsStmt = db.prepare(`
      SELECT
        COUNT(*) AS event_count,
        MAX(timestamp) AS last_event,
        (
          SELECT user_name
          FROM telemetry_events te2
          WHERE te2.user_id = ?
            AND te2.user_name IS NOT NULL
            AND TRIM(te2.user_name) != ''
          ORDER BY te2.timestamp DESC
          LIMIT 1
        ) AS display_name
      FROM telemetry_events
      WHERE user_id = ?
    `);
		const upsertStmt = db.prepare(`
      INSERT INTO user_event_stats (user_id, event_count, last_event, display_name)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        event_count = excluded.event_count,
        last_event = excluded.last_event,
        display_name = COALESCE(excluded.display_name, user_event_stats.display_name)
    `);
		const deleteStmt = db.prepare('DELETE FROM user_event_stats WHERE user_id = ?');

		uniqueIds.forEach(userId => {
			const stats = statsStmt.get(userId, userId);
			const count = Number.parseInt(stats?.event_count, 10) || 0;
			if (count === 0) {
				deleteStmt.run(userId);
				return;
			}
			upsertStmt.run(userId, count, stats.last_event || null, stats.display_name || null);
		});
	} else if (dbType === 'postgresql') {
		for (const userId of uniqueIds) {
			const {rows} = await db.query(
				`
          SELECT
            COUNT(*) AS event_count,
            MAX(timestamp) AS last_event,
            (
              SELECT user_name
              FROM telemetry_events te2
              WHERE te2.user_id = $1
                AND te2.user_name IS NOT NULL
                AND TRIM(te2.user_name) != ''
              ORDER BY te2.timestamp DESC
              LIMIT 1
            ) AS display_name
          FROM telemetry_events
          WHERE user_id = $1
        `,
				[userId]
			);
			const stats = rows[0] || {};
			const count = Number.parseInt(stats.event_count, 10) || 0;
			if (count === 0) {
				await db.query('DELETE FROM user_event_stats WHERE user_id = $1', [userId]);
				continue;
			}
			await db.query(
				`
          INSERT INTO user_event_stats (user_id, event_count, last_event, display_name)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (user_id) DO UPDATE SET
            event_count = EXCLUDED.event_count,
            last_event = EXCLUDED.last_event,
            display_name = COALESCE(EXCLUDED.display_name, user_event_stats.display_name)
        `,
				[userId, count, stats.last_event || null, stats.display_name || null]
			);
		}
	}
}

async function recomputeOrgEventStats(orgIds = []) {
	if (!db) {
		return;
	}
	const uniqueIds = Array.from(new Set((orgIds || []).filter(id => typeof id === 'string' && id.trim() !== '')));
	if (uniqueIds.length === 0) {
		return;
	}

	if (dbType === 'sqlite') {
		const statsStmt = db.prepare(`
      SELECT
        COUNT(*) AS event_count,
        MAX(timestamp) AS last_event
      FROM telemetry_events
      WHERE org_id = ?
    `);
		const upsertStmt = db.prepare(`
      INSERT INTO org_event_stats (org_id, event_count, last_event)
      VALUES (?, ?, ?)
      ON CONFLICT(org_id) DO UPDATE SET
        event_count = excluded.event_count,
        last_event = excluded.last_event
    `);
		const deleteStmt = db.prepare('DELETE FROM org_event_stats WHERE org_id = ?');

		uniqueIds.forEach(orgId => {
			const stats = statsStmt.get(orgId);
			const count = Number.parseInt(stats?.event_count, 10) || 0;
			if (count === 0) {
				deleteStmt.run(orgId);
				return;
			}
			upsertStmt.run(orgId, count, stats.last_event || null);
		});
	} else if (dbType === 'postgresql') {
		for (const orgId of uniqueIds) {
			const {rows} = await db.query(
				`
          SELECT
            COUNT(*) AS event_count,
            MAX(timestamp) AS last_event
          FROM telemetry_events
          WHERE org_id = $1
        `,
				[orgId]
			);
			const stats = rows[0] || {};
			const count = Number.parseInt(stats.event_count, 10) || 0;
			if (count === 0) {
				await db.query('DELETE FROM org_event_stats WHERE org_id = $1', [orgId]);
				continue;
			}
			await db.query(
				`
          INSERT INTO org_event_stats (org_id, event_count, last_event)
          VALUES ($1, $2, $3)
          ON CONFLICT (org_id) DO UPDATE SET
            event_count = EXCLUDED.event_count,
            last_event = EXCLUDED.last_event
        `,
				[orgId, count, stats.last_event || null]
			);
		}
	}
}


async function getUserEventStats(options = {}) {
	const {limit, offset} = options;
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (dbType === 'sqlite') {
		let query = `
      SELECT user_id, display_name, event_count, last_event
      FROM user_event_stats
      ORDER BY
        CASE WHEN last_event IS NULL THEN 1 ELSE 0 END,
        last_event DESC,
        user_id ASC
    `;
		const params = [];
		if (limit) {
			query += ' LIMIT ?';
			params.push(limit);
		}
		if (offset) {
			query += ' OFFSET ?';
			params.push(offset);
		}
		const rows = db.prepare(query).all(...params);
		return rows.map(row => ({
			id: row.user_id,
			label: (row.display_name || row.user_id || '').trim() || row.user_id || '',
			eventCount: Number(row.event_count) || 0,
			lastEvent: row.last_event || null
		})).filter(entry => entry.id);
	}

	let query = `
    SELECT user_id, display_name, event_count, last_event
    FROM user_event_stats
    ORDER BY
      CASE WHEN last_event IS NULL THEN 1 ELSE 0 END,
      last_event DESC,
      user_id ASC
  `;
	const params = [];
	if (limit) {
		query += ' LIMIT $1';
		params.push(limit);
	}
	if (offset) {
		query += ` OFFSET $${params.length + 1}`;
		params.push(offset);
	}
	const {rows} = await db.query(query, params);
	return rows.map(row => ({
		id: row.user_id,
		label: (row.display_name || row.user_id || '').trim() || row.user_id || '',
		eventCount: Number(row.event_count) || 0,
		lastEvent: row.last_event || null
	})).filter(entry => entry.id);
}

async function getOrgStatsMap() {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	const statsMap = new Map();
	if (dbType === 'sqlite') {
		const rows = db.prepare('SELECT org_id, event_count, last_event FROM org_event_stats').all();
		rows.forEach(row => {
			if (row.org_id) {
				statsMap.set(row.org_id.trim().toLowerCase(), {
					orgId: row.org_id,
					eventCount: Number(row.event_count) || 0,
					lastEvent: row.last_event || null
				});
			}
		});
	} else {
		const {rows} = await db.query('SELECT org_id, event_count, last_event FROM org_event_stats');
		rows.forEach(row => {
			if (row.org_id) {
				statsMap.set(String(row.org_id).trim().toLowerCase(), {
					orgId: row.org_id,
					eventCount: Number(row.event_count) || 0,
					lastEvent: row.last_event || null
				});
			}
		});
	}
	return statsMap;
}

/**
 * Aggregate team stats using org -> team mappings and org_event_stats totals.
 * Only active mappings contribute to event counts.
 */
async function getTeamStats(orgTeamMappings = []) {
	const normalizeTeamKey = (value) => String(value || '').trim().toLowerCase();
	const normalizeOrgId = (value) => String(value || '').trim().toLowerCase();

	const mappingsFromRequest = Array.isArray(orgTeamMappings) ? orgTeamMappings : [];
	const effectiveMappings = mappingsFromRequest.length > 0 ? mappingsFromRequest : await getOrgTeamMappingsFromTeamsTable();

	if (!effectiveMappings || effectiveMappings.length === 0) {
		return [];
	}

	const orgStats = await getOrgStatsMap();
	const teamsMap = new Map();

	if (Array.isArray(effectiveMappings)) {
		effectiveMappings.forEach(mapping => {
			const rawTeamName = String(mapping?.teamName || '').trim();
			const rawOrgId = normalizeOrgId(mapping?.orgIdentifier);
			const clientName = String(mapping?.clientName || '').trim();
			const color = String(mapping?.color || '').trim();
			const isActive = mapping?.active !== false;

			if (!rawTeamName || !rawOrgId) {
				return;
			}

			const teamKey = normalizeTeamKey(rawTeamName);
			if (!teamsMap.has(teamKey)) {
				teamsMap.set(teamKey, {
					key: teamKey,
					teamName: rawTeamName,
					color: color,
					teamId: mapping?.teamId || null,
					hasLogo: Boolean(mapping?.hasLogo),
					logoUrl: String(mapping?.logoUrl || '').trim(),
					clients: new Set(),
					orgs: new Set(),
					activeCount: 0,
					inactiveCount: 0,
					eventCount: 0
				});
			}

			const entry = teamsMap.get(teamKey);
			entry.orgs.add(rawOrgId);
			if (clientName) {
				entry.clients.add(clientName);
			}
			if (!entry.color && color) {
				entry.color = color;
			}
			if (!entry.teamId && mapping?.teamId) {
				entry.teamId = mapping.teamId;
			}
			if (mapping?.hasLogo && !entry.hasLogo) {
				entry.hasLogo = true;
			}
			if (mapping?.logoUrl && !entry.logoUrl) {
				entry.logoUrl = String(mapping.logoUrl).trim();
			}
			if (isActive) {
				entry.activeCount += 1;
			} else {
				entry.inactiveCount += 1;
			}
		});
	}

	// Apply event counts based on org stats and only active mappings
	orgStats.forEach((stats, orgKey) => {
		effectiveMappings
			.filter(mapping => mapping?.active !== false && normalizeOrgId(mapping?.orgIdentifier) === orgKey)
			.forEach(mapping => {
				const teamKey = normalizeTeamKey(mapping.teamName);
				const entry = teamsMap.get(teamKey);
				if (entry) {
					entry.eventCount += stats.eventCount;
				}
			});
	});

	return Array.from(teamsMap.values())
		.map(entry => ({
			...entry,
			clients: Array.from(entry.clients),
			orgs: Array.from(entry.orgs),
			totalMappings: entry.activeCount + entry.inactiveCount
		}))
		.sort((a, b) => a.teamName.localeCompare(b.teamName));
}

/**
 * Get a setting value by key
 * @param {string} key - The setting key
 * @returns {string|null} - The setting value or null if not found
 */
async function getSetting(key) {
	if (!db) {
		return null;
	}

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
			const row = stmt.get(key);
			return row ? row.value : null;
		} else if (dbType === 'postgresql') {
			const result = await db.query('SELECT value FROM settings WHERE key = $1', [key]);
			return result.rows.length > 0 ? result.rows[0].value : null;
		}
	} catch (error) {
		console.error(`Error getting setting ${key}:`, error);
		return null;
	}
}

/**
 * Save a setting value by key
 * @param {string} key - The setting key
 * @param {string} value - The setting value
 */
async function saveSetting(key, value) {
	if (!db) {
		return;
	}

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare(`
        INSERT OR REPLACE INTO settings (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
      `);
			stmt.run(key, value);
		} else if (dbType === 'postgresql') {
			await db.query(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `, [key, value]);
		}
	} catch (error) {
		console.error(`Error saving setting ${key}:`, error);
	}
}

/**
 * Ensure teams table exists and orgs/users tables have team_id foreign key
 * Creates teams table with id, name (unique), color, logo_url, timestamps
 * Adds team_id column to orgs and users tables
 */
async function ensureTeamsAndOrgsTables() {
	if (!db) {
		return;
	}

	try {
		if (dbType === 'sqlite') {
			// Create teams table
			db.exec(`
        CREATE TABLE IF NOT EXISTS teams (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          color TEXT,
          logo_url TEXT,
          logo_data BLOB,
          logo_mime TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);
      `);

			// Add logo_data and logo_mime columns if they don't exist
			const teamsColumns = db.prepare('PRAGMA table_info(teams)').all();
			const hasLogoData = teamsColumns.some(column => column.name === 'logo_data');
			const hasLogoMime = teamsColumns.some(column => column.name === 'logo_mime');
			if (!hasLogoData) {
				db.exec('ALTER TABLE teams ADD COLUMN logo_data BLOB');
			}
			if (!hasLogoMime) {
				db.exec('ALTER TABLE teams ADD COLUMN logo_mime TEXT');
			}

			// Add team_id to orgs table if it doesn't exist
			const orgsColumns = db.prepare('PRAGMA table_info(orgs)').all();
			const hasTeamIdInOrgs = orgsColumns.some(column => column.name === 'team_id');
			if (!hasTeamIdInOrgs) {
				db.exec('ALTER TABLE orgs ADD COLUMN team_id INTEGER REFERENCES teams(id)');
				db.exec('CREATE INDEX IF NOT EXISTS idx_orgs_team_id ON orgs(team_id)');
			}

			// Add alias and color to orgs table if they don't exist
			const hasAliasInOrgs = orgsColumns.some(column => column.name === 'alias');
			if (!hasAliasInOrgs) {
				db.exec('ALTER TABLE orgs ADD COLUMN alias TEXT');
				db.exec('CREATE INDEX IF NOT EXISTS idx_orgs_alias ON orgs(alias)');
			}
			const hasColorInOrgs = orgsColumns.some(column => column.name === 'color');
			if (!hasColorInOrgs) {
				db.exec('ALTER TABLE orgs ADD COLUMN color TEXT');
			}

			// Add team_id to users table if it doesn't exist (for application users)
			const usersColumns = db.prepare('PRAGMA table_info(users)').all();
			const hasTeamIdInUsers = usersColumns.some(column => column.name === 'team_id');
			if (!hasTeamIdInUsers) {
				db.exec('ALTER TABLE users ADD COLUMN team_id INTEGER REFERENCES teams(id)');
				db.exec('CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id)');
			}

			// Create team_event_users table for mapping event log users to teams
			db.exec(`
        CREATE TABLE IF NOT EXISTS team_event_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
          user_name TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(team_id, user_name)
        );
        CREATE INDEX IF NOT EXISTS idx_team_event_users_team_id ON team_event_users(team_id);
        CREATE INDEX IF NOT EXISTS idx_team_event_users_user_name ON team_event_users(user_name);
      `);
		} else if (dbType === 'postgresql') {
			// Create teams table
			await db.query(`
        CREATE TABLE IF NOT EXISTS teams (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          color TEXT,
          logo_url TEXT,
          logo_data BYTEA,
          logo_mime TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);
      `);

			// Add logo_data and logo_mime columns if they don't exist
			await db.query(`
        ALTER TABLE teams
        ADD COLUMN IF NOT EXISTS logo_data BYTEA;
        ALTER TABLE teams
        ADD COLUMN IF NOT EXISTS logo_mime TEXT;
      `);

			// Add team_id to orgs table if it doesn't exist
			await db.query(`
        ALTER TABLE IF EXISTS orgs
        ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id);
        CREATE INDEX IF NOT EXISTS idx_orgs_team_id ON orgs(team_id);
      `);

			// Add alias and color to orgs table if they don't exist
			await db.query(`
        ALTER TABLE IF EXISTS orgs
        ADD COLUMN IF NOT EXISTS alias TEXT;
        CREATE INDEX IF NOT EXISTS idx_orgs_alias ON orgs(alias);
        ALTER TABLE IF EXISTS orgs
        ADD COLUMN IF NOT EXISTS color TEXT;
      `);

			// Add team_id to users table if it doesn't exist (for application users)
			await db.query(`
        ALTER TABLE IF EXISTS users
        ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id);
        CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id);
      `);

			// Create team_event_users table for mapping event log users to teams
			await db.query(`
        CREATE TABLE IF NOT EXISTS team_event_users (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
          user_name TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(team_id, user_name)
        );
        CREATE INDEX IF NOT EXISTS idx_team_event_users_team_id ON team_event_users(team_id);
        CREATE INDEX IF NOT EXISTS idx_team_event_users_user_name ON team_event_users(user_name);
      `);
		}
	} catch (error) {
		console.error('Error ensuring teams and orgs tables:', error);
	}
}

/**
 * Team management functions
 */

/**
 * Get all teams with their orgs and users count
 * @returns {Promise<Array>} Array of team objects with orgs and users count
 */
async function getAllTeams() {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		if (dbType === 'sqlite') {
			const teams = db.prepare(`
        SELECT
          t.id,
          t.name,
          t.color,
          t.logo_url,
          t.logo_mime,
          t.created_at,
          t.updated_at,
          COUNT(DISTINCT o.server_id) as org_count,
          COUNT(DISTINCT teu.user_name) as user_count
        FROM teams t
        LEFT JOIN orgs o ON o.team_id = t.id
        LEFT JOIN team_event_users teu ON teu.team_id = t.id
        GROUP BY t.id
        ORDER BY t.name ASC
      `).all();

			return teams.map(team => ({
				id: team.id,
				name: team.name,
				color: team.color || null,
				logo_url: team.logo_url || null,
				has_logo: Boolean(team.logo_mime && team.logo_mime.trim() !== ''),
				created_at: team.created_at,
				updated_at: team.updated_at,
				org_count: Number.parseInt(team.org_count, 10) || 0,
				user_count: Number.parseInt(team.user_count, 10) || 0
			}));
		} else if (dbType === 'postgresql') {
			const result = await db.query(`
        SELECT
          t.id,
          t.name,
          t.color,
          t.logo_url,
          t.logo_mime,
          t.created_at,
          t.updated_at,
          COUNT(DISTINCT o.server_id) as org_count,
          COUNT(DISTINCT teu.user_name) as user_count
        FROM teams t
        LEFT JOIN orgs o ON o.team_id = t.id
        LEFT JOIN team_event_users teu ON teu.team_id = t.id
        GROUP BY t.id
        ORDER BY t.name ASC
      `);

			return result.rows.map(team => ({
				id: team.id,
				name: team.name,
				color: team.color || null,
				logo_url: team.logo_url || null,
				has_logo: Boolean(team.logo_mime && team.logo_mime.trim() !== ''),
				created_at: team.created_at,
				updated_at: team.updated_at,
				org_count: Number.parseInt(team.org_count, 10) || 0,
				user_count: Number.parseInt(team.user_count, 10) || 0
			}));
		}
	} catch (error) {
		console.error('Error getting all teams:', error);
		throw error;
	}
}

/**
 * Get a team by ID with its orgs and users
 * @param {number} teamId - Team ID
 * @returns {Promise<object|null>} Team object with orgs and users, or null if not found
 */
async function getTeamById(teamId) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		if (dbType === 'sqlite') {
			const team = db.prepare(`
        SELECT
          id,
          name,
          color,
          logo_url,
          logo_mime,
          created_at,
          updated_at
        FROM teams
        WHERE id = ?
      `).get(teamId);

			if (!team) {
				return null;
			}

			const orgs = db.prepare(`
        SELECT
          server_id,
          company_name,
          alias,
          color,
          team_id,
          created_at,
          updated_at
        FROM orgs
        WHERE team_id = ?
        ORDER BY alias ASC, server_id ASC
      `).all(teamId);

			// Get event log users assigned to this team
			const eventUsers = db.prepare(`
        SELECT
          user_name,
          created_at
        FROM team_event_users
        WHERE team_id = ?
        ORDER BY user_name ASC
      `).all(teamId);

			return {
				id: team.id,
				name: team.name,
				color: team.color || null,
				logo_url: team.logo_url || null,
				has_logo: Boolean(team.logo_mime && team.logo_mime.trim() !== ''),
				created_at: team.created_at,
				updated_at: team.updated_at,
				orgs: orgs.map(org => ({
					id: org.server_id,
					alias: org.alias || null,
					color: org.color || null,
					company_name: org.company_name || null,
					team_id: org.team_id || null,
					created_at: org.created_at,
					updated_at: org.updated_at
				})),
				users: eventUsers.map(user => ({
					user_name: user.user_name,
					created_at: user.created_at
				}))
			};
		} else if (dbType === 'postgresql') {
			const teamResult = await db.query(`
        SELECT
          id,
          name,
          color,
          logo_url,
          logo_mime,
          created_at,
          updated_at
        FROM teams
        WHERE id = $1
      `, [teamId]);

			if (teamResult.rows.length === 0) {
				return null;
			}

			const team = teamResult.rows[0];

			const orgsResult = await db.query(`
        SELECT
          server_id,
          company_name,
          alias,
          color,
          team_id,
          created_at,
          updated_at
        FROM orgs
        WHERE team_id = $1
        ORDER BY alias ASC, server_id ASC
      `, [teamId]);

			// Get event log users assigned to this team
			const eventUsersResult = await db.query(`
        SELECT
          user_name,
          created_at
        FROM team_event_users
        WHERE team_id = $1
        ORDER BY user_name ASC
      `, [teamId]);

			return {
				id: team.id,
				name: team.name,
				color: team.color || null,
				logo_url: team.logo_url || null,
				has_logo: Boolean(team.logo_mime && team.logo_mime.trim() !== ''),
				created_at: team.created_at,
				updated_at: team.updated_at,
				orgs: orgsResult.rows.map(org => ({
					id: org.server_id,
					alias: org.alias || null,
					color: org.color || null,
					company_name: org.company_name || null,
					team_id: org.team_id || null,
					created_at: org.created_at,
					updated_at: org.updated_at
				})),
				users: eventUsersResult.rows.map(user => ({
					user_name: user.user_name,
					created_at: user.created_at
				}))
			};
		}
	} catch (error) {
		console.error('Error getting team by ID:', error);
		throw error;
	}
}

/**
 * Add an event log user to a team
 * @param {number} teamId - Team ID
 * @param {string} userName - Event log user name
 * @returns {Promise<object>} Result object
 */
async function addEventUserToTeam(teamId, userName) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		if (dbType === 'sqlite') {
			db.prepare(`
        INSERT INTO team_event_users (team_id, user_name)
        VALUES (?, ?)
        ON CONFLICT(team_id, user_name) DO NOTHING
      `).run(teamId, userName);

			return {status: 'ok', message: 'Event user added to team successfully'};
		} else if (dbType === 'postgresql') {
			await db.query(`
        INSERT INTO team_event_users (team_id, user_name)
        VALUES ($1, $2)
        ON CONFLICT (team_id, user_name) DO NOTHING
      `, [teamId, userName]);

			return {status: 'ok', message: 'Event user added to team successfully'};
		}
	} catch (error) {
		console.error('Error adding event user to team:', error);
		throw error;
	}
}

/**
 * Remove an event log user from a team
 * @param {number} teamId - Team ID
 * @param {string} userName - Event log user name
 * @returns {Promise<object>} Result object
 */
async function removeEventUserFromTeam(teamId, userName) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		if (dbType === 'sqlite') {
			db.prepare(`
        DELETE FROM team_event_users
        WHERE team_id = ? AND user_name = ?
      `).run(teamId, userName);

			return {status: 'ok', message: 'Event user removed from team successfully'};
		} else if (dbType === 'postgresql') {
			await db.query(`
        DELETE FROM team_event_users
        WHERE team_id = $1 AND user_name = $2
      `, [teamId, userName]);

			return {status: 'ok', message: 'Event user removed from team successfully'};
		}
	} catch (error) {
		console.error('Error removing event user from team:', error);
		throw error;
	}
}

/**
 * Get all unique event log user names from telemetry data
 * @param {number} limit - Maximum number of users to return
 * @returns {Promise<Array>} Array of user names
 */
async function getEventUserNames(limit = 1000) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		if (dbType === 'sqlite') {
			const users = db.prepare(`
        SELECT DISTINCT user_label
        FROM (
          SELECT COALESCE(
            NULLIF(TRIM(user_name), ''),
            NULLIF(TRIM(user_id), '')
          ) AS user_label
          FROM telemetry_events
        ) AS labels
        WHERE user_label IS NOT NULL
        ORDER BY user_label ASC
        LIMIT ?
      `).all(limit);

			return users.map(u => u.user_label);
		} else if (dbType === 'postgresql') {
			const result = await db.query(`
        SELECT DISTINCT user_label
        FROM (
          SELECT COALESCE(
            NULLIF(TRIM(user_name), ''),
            NULLIF(TRIM(user_id), '')
          ) AS user_label
          FROM telemetry_events
        ) AS labels
        WHERE user_label IS NOT NULL
        ORDER BY user_label ASC
        LIMIT $1
      `, [limit]);

			return result.rows.map(u => u.user_label);
		}
	} catch (error) {
		console.error('Error getting event user names:', error);
		throw error;
	}
}

/**
 * Get a person by ID
 * @param {number} personId - Person ID
 * @returns {Promise<Object|null>} Person object or null if not found
 */
async function getPersonById(personId) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare('SELECT id, name, email, initials, created_at FROM people WHERE id = ?');
			const result = stmt.get(personId);
			return result || null;
		} else if (dbType === 'postgresql') {
			const result = await db.query('SELECT id, name, email, initials, created_at FROM people WHERE id = $1', [personId]);
			return result.rows[0] || null;
		}
	} catch (error) {
		console.error('Error getting person by ID:', error);
		throw error;
	}
}

/**
 * Get all people
 * @returns {Promise<Array>} Array of people
 */
async function getAllPeople() {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare('SELECT id, name, email, initials, created_at FROM people ORDER BY name ASC');
			return stmt.all();
		} else if (dbType === 'postgresql') {
			const result = await db.query('SELECT id, name, email, initials, created_at FROM people ORDER BY name ASC');
			return result.rows;
		}
	} catch (error) {
		console.error('Error getting all people:', error);
		throw error;
	}
}

/**
 * Create a new person
 * @param {string} name - Person's name
 * @param {string|null} email - Person's email (optional)
 * @returns {Promise<object>} Created person object
 */
async function createPerson(name, email = null, initials = null) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (!name || name.trim() === '') {
		throw new Error('Name is required');
	}

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare('INSERT INTO people (name, email, initials) VALUES (?, ?, ?)');
			const result = stmt.run(name.trim(), email, initials);

			// Get the created person
			const person = db.prepare('SELECT id, name, email, initials, created_at FROM people WHERE id = ?').get(result.lastInsertRowid);
			return person;
		} else if (dbType === 'postgresql') {
			const result = await db.query(
				'INSERT INTO people (name, email, initials) VALUES ($1, $2, $3) RETURNING id, name, email, initials, created_at',
				[name.trim(), email, initials]
			);
			return result.rows[0];
		}
	} catch (error) {
		console.error('Error creating person:', error);
		throw error;
	}
}

/**
 * Update a person's information
 * @param {number} personId - Person ID
 * @param {string} name - Person's name
 * @param {string|null} email - Person's email (optional)
 * @returns {Promise<object>} Updated person object
 */
async function updatePerson(personId, name, email = null, initials = null) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (!personId || Number.isNaN(personId)) {
		throw new Error('Valid person ID is required');
	}

	if (!name || name.trim() === '') {
		throw new Error('Name is required');
	}

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare('UPDATE people SET name = ?, email = ?, initials = ? WHERE id = ?');
			const result = stmt.run(name.trim(), email, initials, personId);

			if (result.changes === 0) {
				throw new Error('Person not found');
			}

			// Get the updated person
			const person = db.prepare('SELECT id, name, email, initials, created_at FROM people WHERE id = ?').get(personId);
			return person;
		} else if (dbType === 'postgresql') {
			const result = await db.query(
				'UPDATE people SET name = $1, email = $2, initials = $3 WHERE id = $4 RETURNING id, name, email, initials, created_at',
				[name.trim(), email, initials, personId]
			);

			if (result.rows.length === 0) {
				throw new Error('Person not found');
			}

			return result.rows[0];
		}
	} catch (error) {
		console.error('Error updating person:', error);
		throw error;
	}
}

/**
 * Delete a person and all associated usernames
 * @param {number} personId - Person ID
 * @returns {Promise<void>}
 */
async function deletePerson(personId) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (!personId || Number.isNaN(personId)) {
		throw new Error('Valid person ID is required');
	}

	try {
		if (dbType === 'sqlite') {
			// Check if person exists
			const person = db.prepare('SELECT id FROM people WHERE id = ?').get(personId);
			if (!person) {
				throw new Error('Person not found');
			}

			// Delete person (usernames will be deleted automatically due to CASCADE)
			const stmt = db.prepare('DELETE FROM people WHERE id = ?');
			stmt.run(personId);
		} else if (dbType === 'postgresql') {
			// Check if person exists and delete in one query
			const result = await db.query('DELETE FROM people WHERE id = $1 RETURNING id', [personId]);

			if (result.rows.length === 0) {
				throw new Error('Person not found');
			}
		}
	} catch (error) {
		console.error('Error deleting person:', error);
		throw error;
	}
}

/**
 * Get usernames associated with a person
 * @param {number} personId - Person ID
 * @returns {Promise<Array>} Array of usernames for the person
 */
async function getPersonUsernames(personId) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (!personId || Number.isNaN(personId)) {
		throw new Error('Valid person ID is required');
	}

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare(`
				SELECT id, person_id, username, org_id, is_primary, created_at
				FROM person_usernames
				WHERE person_id = ?
				ORDER BY is_primary DESC, username ASC
			`);
			return stmt.all(personId);
		} else if (dbType === 'postgresql') {
			const result = await db.query(`
				SELECT id, person_id, username, org_id, is_primary, created_at
				FROM person_usernames
				WHERE person_id = $1
				ORDER BY is_primary DESC, username ASC
			`, [personId]);
			return result.rows;
		}
	} catch (error) {
		console.error('Error getting person usernames:', error);
		throw error;
	}
}

/**
 * Add a username to a person
 * @param {number} personId - Person ID
 * @param {string} username - Username to add
 * @param {string|null} orgId - Optional organization ID
 * @returns {Promise<object>} Created username association object
 */
async function addUsernameToPerson(personId, username, orgId = null) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (!personId || Number.isNaN(personId)) {
		throw new Error('Valid person ID is required');
	}

	if (!username || username.trim() === '') {
		throw new Error('Username is required');
	}

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare(`
				INSERT INTO person_usernames (person_id, username, org_id, is_primary)
				VALUES (?, ?, ?, FALSE)
			`);
			const result = stmt.run(personId, username.trim(), orgId);
			return {
				id: result.lastInsertRowid,
				person_id: personId,
				username: username.trim(),
				org_id: orgId,
				is_primary: false,
				created_at: new Date().toISOString()
			};
		} else if (dbType === 'postgresql') {
			const result = await db.query(`
				INSERT INTO person_usernames (person_id, username, org_id, is_primary)
				VALUES ($1, $2, $3, FALSE)
				RETURNING id, person_id, username, org_id, is_primary, created_at
			`, [personId, username.trim(), orgId]);
			return result.rows[0];
		}
	} catch (error) {
		// Check if it's a unique constraint violation
		if (error.message && error.message.includes('UNIQUE constraint failed')) {
			throw new Error('This username is already associated with this person');
		}
		console.error('Error adding username to person:', error);
		throw error;
	}
}

/**
 * Remove a username from a person
 * @param {number} personId - Person ID
 * @param {string} username - Username to remove
 * @returns {Promise<boolean>} True if username was removed, false if not found
 */
async function removeUsernameFromPerson(personId, username) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (!personId || Number.isNaN(personId)) {
		throw new Error('Valid person ID is required');
	}

	if (!username || username.trim() === '') {
		throw new Error('Username is required');
	}

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare(`
				DELETE FROM person_usernames
				WHERE person_id = ? AND username = ?
			`);
			const result = stmt.run(personId, username.trim());
			return result.changes > 0;
		} else if (dbType === 'postgresql') {
			const result = await db.query(`
				DELETE FROM person_usernames
				WHERE person_id = $1 AND username = $2
			`, [personId, username.trim()]);
			return result.rowCount > 0;
		}
	} catch (error) {
		console.error('Error removing username from person:', error);
		throw error;
	}
}

/**
 * Create a new team
 * @param {string} name - Team name (must be unique)
 * @param {string} color - Team color (hex or CSS color)
 * @param {string} logoUrl - Optional logo URL
 * @param {Buffer} logoData - Optional logo binary data
 * @param {string} logoMime - Optional logo MIME type
 * @returns {Promise<object>} Created team object
 */
async function createTeam(name, color = null, logoUrl = null, logoData = null, logoMime = null) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (!name || typeof name !== 'string' || name.trim() === '') {
		throw new Error('Team name is required');
	}

	const now = new Date().toISOString();

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare(`
        INSERT INTO teams (name, color, logo_url, logo_data, logo_mime, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
			const result = stmt.run(name.trim(), color || null, logoUrl || null, logoData || null, logoMime || null, now, now);
			return {
				id: result.lastInsertRowid,
				name: name.trim(),
				color: color || null,
				logo_url: logoUrl || null,
				created_at: now,
				updated_at: now
			};
		} else if (dbType === 'postgresql') {
			const result = await db.query(`
        INSERT INTO teams (name, color, logo_url, logo_data, logo_mime, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, name, color, logo_url, created_at, updated_at
      `, [name.trim(), color || null, logoUrl || null, logoData || null, logoMime || null, now, now]);
			return result.rows[0];
		}
	} catch (error) {
		if (error.message.includes('UNIQUE constraint') || error.message.includes('duplicate key')) {
			throw new Error('Team name already exists');
		}
		console.error('Error creating team:', error);
		throw error;
	}
}

/**
 * Update a team
 * @param {number} teamId - Team ID
 * @param {object} updates - Object with name, color, logo_url, logo_data, logo_mime to update
 * @returns {Promise<boolean>} True if updated, false if not found
 */
async function updateTeam(teamId, updates) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	const {name, color, logo_url, logo_data, logo_mime} = updates || {};
	const now = new Date().toISOString();
	const updatesList = [];
	const params = [];

	if (name !== undefined) {
		if (typeof name !== 'string' || name.trim() === '') {
			throw new Error('Team name cannot be empty');
		}
		updatesList.push(dbType === 'sqlite' ? 'name = ?' : `name = $${params.length + 1}`);
		params.push(name.trim());
	}

	if (color !== undefined) {
		updatesList.push(dbType === 'sqlite' ? 'color = ?' : `color = $${params.length + 1}`);
		params.push(color || null);
	}

	if (logo_url !== undefined) {
		updatesList.push(dbType === 'sqlite' ? 'logo_url = ?' : `logo_url = $${params.length + 1}`);
		params.push(logo_url || null);
	}

	if (logo_data !== undefined) {
		updatesList.push(dbType === 'sqlite' ? 'logo_data = ?' : `logo_data = $${params.length + 1}`);
		params.push(logo_data || null);
	}

	if (logo_mime !== undefined) {
		updatesList.push(dbType === 'sqlite' ? 'logo_mime = ?' : `logo_mime = $${params.length + 1}`);
		params.push(logo_mime || null);
	}

	if (updatesList.length === 0) {
		return false;
	}

	updatesList.push(dbType === 'sqlite' ? 'updated_at = ?' : `updated_at = $${params.length + 1}`);
	params.push(now);

	params.push(teamId);

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare(`
        UPDATE teams
        SET ${updatesList.join(', ')}
        WHERE id = ?
      `);
			const result = stmt.run(...params);
			return result.changes > 0;
		} else if (dbType === 'postgresql') {
			const result = await db.query(`
        UPDATE teams
        SET ${updatesList.join(', ')}
        WHERE id = $${params.length}
      `, params);
			return result.rowCount > 0;
		}
	} catch (error) {
		if (error.message.includes('UNIQUE constraint') || error.message.includes('duplicate key')) {
			throw new Error('Team name already exists');
		}
		console.error('Error updating team:', error);
		throw error;
	}
}

/**
 * Get team logo data
 * @param {number} teamId - Team ID
 * @returns {Promise<{data: Buffer, mime: string}|null>} Logo data and MIME type, or null if not found
 */
async function getTeamLogo(teamId) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		if (dbType === 'sqlite') {
			const team = db.prepare(`
        SELECT logo_data, logo_mime
        FROM teams
        WHERE id = ? AND logo_data IS NOT NULL AND logo_mime IS NOT NULL
      `).get(teamId);

			if (!team || !team.logo_data || !team.logo_mime) {
				return null;
			}

			return {
				data: Buffer.from(team.logo_data),
				mime: team.logo_mime
			};
		} else if (dbType === 'postgresql') {
			const result = await db.query(`
        SELECT logo_data, logo_mime
        FROM teams
        WHERE id = $1 AND logo_data IS NOT NULL AND logo_mime IS NOT NULL
      `, [teamId]);

			if (result.rows.length === 0 || !result.rows[0].logo_data || !result.rows[0].logo_mime) {
				return null;
			}

			return {
				data: result.rows[0].logo_data,
				mime: result.rows[0].logo_mime
			};
		}
	} catch (error) {
		console.error('Error getting team logo:', error);
		throw error;
	}
}

/**
 * Delete a team
 * @param {number} teamId - Team ID
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
async function deleteTeam(teamId) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		if (dbType === 'sqlite') {
			// First, unassign orgs and users from this team
			db.prepare('UPDATE orgs SET team_id = NULL WHERE team_id = ?').run(teamId);
			db.prepare('UPDATE users SET team_id = NULL WHERE team_id = ?').run(teamId);

			const stmt = db.prepare('DELETE FROM teams WHERE id = ?');
			const result = stmt.run(teamId);
			return result.changes > 0;
		} else if (dbType === 'postgresql') {
			// First, unassign orgs and users from this team
			await db.query('UPDATE orgs SET team_id = NULL WHERE team_id = $1', [teamId]);
			await db.query('UPDATE users SET team_id = NULL WHERE team_id = $1', [teamId]);

			const result = await db.query('DELETE FROM teams WHERE id = $1', [teamId]);
			return result.rowCount > 0;
		}
	} catch (error) {
		console.error('Error deleting team:', error);
		throw error;
	}
}

/**
 * Org management functions (extended)
 */

/**
 * Get all orgs with their team information
 * @returns {Promise<Array>} Array of org objects with team info
 */
async function getAllOrgsWithTeams() {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		if (dbType === 'sqlite') {
			const orgs = db.prepare(`
        SELECT
          o.server_id,
          o.company_name,
          o.alias,
          o.color,
          o.team_id,
          o.created_at,
          o.updated_at,
          t.name as team_name,
          t.color as team_color
        FROM orgs o
        LEFT JOIN teams t ON t.id = o.team_id
        ORDER BY o.alias ASC, o.server_id ASC
      `).all();

			return orgs.map(org => ({
				id: org.server_id,
				alias: org.alias || null,
				color: org.color || null,
				company_name: org.company_name || null,
				team_id: org.team_id || null,
				team_name: org.team_name || null,
				team_color: org.team_color || null,
				created_at: org.created_at,
				updated_at: org.updated_at
			}));
		} else if (dbType === 'postgresql') {
			const result = await db.query(`
        SELECT
          o.server_id,
          o.company_name,
          o.alias,
          o.color,
          o.team_id,
          o.created_at,
          o.updated_at,
          t.name as team_name,
          t.color as team_color
        FROM orgs o
        LEFT JOIN teams t ON t.id = o.team_id
        ORDER BY o.alias ASC, o.server_id ASC
      `);

			return result.rows.map(org => ({
				id: org.server_id,
				alias: org.alias || null,
				color: org.color || null,
				company_name: org.company_name || null,
				team_id: org.team_id || null,
				team_name: org.team_name || null,
				team_color: org.team_color || null,
				created_at: org.created_at,
				updated_at: org.updated_at
			}));
		}
	} catch (error) {
		console.error('Error getting all orgs with teams:', error);
		throw error;
	}
}

/**
 * Create or update an org
 * @param {string} orgId - Org identifier (server_id)
 * @param {object} orgData - Object with alias, color, team_id, company_name
 * @returns {Promise<object>} Created or updated org object
 */
async function upsertOrg(orgId, orgData = {}) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (!orgId || typeof orgId !== 'string' || orgId.trim() === '') {
		throw new Error('Org ID is required');
	}

	const {alias, color, team_id, company_name} = orgData;
	const now = new Date().toISOString();

	try {
		if (dbType === 'sqlite') {
			// Check if org exists
			const existing = db.prepare('SELECT server_id FROM orgs WHERE server_id = ?').get(orgId);

			if (existing) {
				// Update existing org
				const updates = [];
				const params = [];

				if (alias !== undefined) {
					updates.push('alias = ?');
					params.push(alias || null);
				}
				if (color !== undefined) {
					updates.push('color = ?');
					params.push(color || null);
				}
				if (team_id !== undefined) {
					updates.push('team_id = ?');
					params.push(team_id || null);
				}
				if (company_name !== undefined) {
					updates.push('company_name = ?');
					params.push(company_name || null);
				}

				if (updates.length > 0) {
					updates.push('updated_at = ?');
					params.push(now);
					params.push(orgId);

					db.prepare(`
            UPDATE orgs
            SET ${updates.join(', ')}
            WHERE server_id = ?
          `).run(...params);
				}
			} else {
				// Create new org
				db.prepare(`
          INSERT INTO orgs (server_id, alias, color, team_id, company_name, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(orgId, alias || null, color || null, team_id || null, company_name || null, now, now);
			}

			// Return the org
			return db.prepare(`
        SELECT server_id, alias, color, team_id, company_name, created_at, updated_at
        FROM orgs
        WHERE server_id = ?
      `).get(orgId);
		} else if (dbType === 'postgresql') {
			const result = await db.query(`
        INSERT INTO orgs (server_id, alias, color, team_id, company_name, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (server_id) DO UPDATE SET
          alias = COALESCE(EXCLUDED.alias, orgs.alias),
          color = COALESCE(EXCLUDED.color, orgs.color),
          team_id = COALESCE(EXCLUDED.team_id, orgs.team_id),
          company_name = COALESCE(EXCLUDED.company_name, orgs.company_name),
          updated_at = EXCLUDED.updated_at
        RETURNING server_id, alias, color, team_id, company_name, created_at, updated_at
      `, [orgId, alias || null, color || null, team_id || null, company_name || null, now, now]);

			return result.rows[0];
		}
	} catch (error) {
		console.error('Error upserting org:', error);
		throw error;
	}
}

/**
 * Move an org to a different team
 * @param {string} orgId - Org identifier
 * @param {number|null} teamId - New team ID (null to unassign)
 * @returns {Promise<boolean>} True if moved, false if org not found
 */
async function moveOrgToTeam(orgId, teamId) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare('UPDATE orgs SET team_id = ?, updated_at = ? WHERE server_id = ?');
			const now = new Date().toISOString();
			const result = stmt.run(teamId || null, now, orgId);
			if (result.changes > 0) {
				// Recalculate team_id for all existing events of this org
				await recalculateTeamIdsForOrg(orgId);
			}
			return result.changes > 0;
		} else if (dbType === 'postgresql') {
			const result = await db.query(
				'UPDATE orgs SET team_id = $1, updated_at = NOW() WHERE server_id = $2',
				[teamId || null, orgId]
			);
			if (result.rowCount > 0) {
				// Recalculate team_id for all existing events of this org
				await recalculateTeamIdsForOrg(orgId);
			}
			return result.rowCount > 0;
		}
	} catch (error) {
		console.error('Error moving org to team:', error);
		throw error;
	}
}

/**
 * Assign a user to a team
 * @param {number} userId - User ID
 * @param {number|null} teamId - Team ID (null to unassign)
 * @returns {Promise<boolean>} True if assigned, false if user not found
 */
async function assignUserToTeam(userId, teamId) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare('UPDATE users SET team_id = ? WHERE id = ?');
			const result = stmt.run(teamId || null, userId);
			return result.changes > 0;
		} else if (dbType === 'postgresql') {
			const result = await db.query('UPDATE users SET team_id = $1 WHERE id = $2', [teamId || null, userId]);
			return result.rowCount > 0;
		}
	} catch (error) {
		console.error('Error assigning user to team:', error);
		throw error;
	}
}

/**
 * Ensure remember_tokens table exists
 */
async function ensureRememberTokensTable() {
	if (!db) {
		return;
	}

	try {
		if (dbType === 'sqlite') {
			db.exec(`
        CREATE TABLE IF NOT EXISTS remember_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          revoked_at TEXT,
          user_agent TEXT,
          ip_address TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_remember_token_hash ON remember_tokens(token_hash);
        CREATE INDEX IF NOT EXISTS idx_remember_user_id ON remember_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_remember_expires_at ON remember_tokens(expires_at);
      `);
		} else if (dbType === 'postgresql') {
			await db.query(`
        CREATE TABLE IF NOT EXISTS remember_tokens (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          revoked_at TIMESTAMPTZ,
          user_agent TEXT,
          ip_address TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_remember_token_hash ON remember_tokens(token_hash);
        CREATE INDEX IF NOT EXISTS idx_remember_user_id ON remember_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_remember_expires_at ON remember_tokens(expires_at);
      `);
		}
	} catch (error) {
		console.error('Error ensuring remember_tokens table:', error);
	}
}

/**
 * Ensure Copilot user exists if COPILOT_USERNAME and COPILOT_PASSWORD are set
 * This is useful for GitHub Copilot environments where the database needs to be initialized
 * with a default user for testing and development.
 */
async function ensureCopilotUser() {
	if (!db) {
		return;
	}

	const copilotUsername = process.env.COPILOT_USERNAME;
	const copilotPassword = process.env.COPILOT_PASSWORD;
	const copilotRole = process.env.COPILOT_ROLE || 'god';

	// Only create user if both username and password are provided
	if (!copilotUsername || !copilotPassword) {
		return;
	}

	try {
		// Check if user already exists
		const existingUser = await getUserByUsername(copilotUsername);
		if (existingUser) {
			// User exists, optionally update role if needed
			if (copilotRole && existingUser.role !== copilotRole) {
				await updateUserRole(copilotUsername, copilotRole);
				console.log(`✅ Updated Copilot user "${copilotUsername}" role to "${copilotRole}"`);
			}
			return;
		}

		// Import hashPassword from auth module
		const {hashPassword} = await import('../auth/auth.js');
		const passwordHash = await hashPassword(copilotPassword);
		await createUser(copilotUsername, passwordHash, copilotRole);
		console.log(`✅ Created Copilot user "${copilotUsername}" with role "${copilotRole}"`);
	} catch (error) {
		console.error('Error ensuring Copilot user:', error);
		// Don't throw - this is a convenience feature, not critical
	}
}

/**
 * Create a remember token for a user
 * @param {number} userId - User ID
 * @param {string} expiresAt - ISO timestamp when token expires
 * @param {string} userAgent - Optional user agent string
 * @param {string} ipAddress - Optional IP address
 * @returns {Promise<{token: string, id: number}>} - Returns the plain token and token ID
 */
async function createRememberToken(userId, expiresAt, userAgent = null, ipAddress = null) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	// Generate a random token (32 bytes = 64 hex characters)
	const token = crypto.randomBytes(32).toString('hex');
	// Hash the token before storing
	const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare(`
        INSERT INTO remember_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
        VALUES (?, ?, ?, ?, ?)
      `);
			const result = stmt.run(userId, tokenHash, expiresAt, userAgent, ipAddress);
			return {token, id: result.lastInsertRowid};
		} else if (dbType === 'postgresql') {
			const result = await db.query(
				`INSERT INTO remember_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
				[userId, tokenHash, expiresAt, userAgent, ipAddress]
			);
			return {token, id: result.rows[0].id};
		}
	} catch (error) {
		console.error('Error creating remember token:', error);
		throw error;
	}
}

/**
 * Validate and get user ID from a remember token
 * @param {string} token - Plain token string
 * @returns {Promise<{userId: number, tokenId: number} | null>} - Returns user ID and token ID if valid, null otherwise
 */
async function validateRememberToken(token) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
	const now = new Date().toISOString();

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare(`
        SELECT id, user_id
        FROM remember_tokens
        WHERE token_hash = ?
          AND expires_at > ?
          AND revoked_at IS NULL
      `);
			const row = stmt.get(tokenHash, now);
			return row ? {userId: row.user_id, tokenId: row.id} : null;
		} else if (dbType === 'postgresql') {
			const result = await db.query(
				`SELECT id, user_id
         FROM remember_tokens
         WHERE token_hash = $1
           AND expires_at > NOW()
           AND revoked_at IS NULL`,
				[tokenHash]
			);
			return result.rows.length > 0 ? {userId: result.rows[0].user_id, tokenId: result.rows[0].id} : null;
		}
	} catch (error) {
		console.error('Error validating remember token:', error);
		return null;
	}
}

/**
 * Revoke a remember token by ID
 * @param {number} tokenId - Token ID to revoke
 * @returns {Promise<boolean>} - Returns true if token was revoked
 */
async function revokeRememberToken(tokenId) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare('UPDATE remember_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?');
			const result = stmt.run(tokenId);
			return result.changes > 0;
		} else if (dbType === 'postgresql') {
			const result = await db.query('UPDATE remember_tokens SET revoked_at = NOW() WHERE id = $1', [tokenId]);
			return result.rowCount > 0;
		}
	} catch (error) {
		console.error('Error revoking remember token:', error);
		return false;
	}
}

/**
 * Revoke all remember tokens for a user
 * @param {number} userId - User ID
 * @returns {Promise<number>} - Returns number of tokens revoked
 */
async function revokeAllRememberTokensForUser(userId) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare('UPDATE remember_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL');
			const result = stmt.run(userId);
			return result.changes;
		} else if (dbType === 'postgresql') {
			const result = await db.query('UPDATE remember_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
			return result.rowCount;
		}
	} catch (error) {
		console.error('Error revoking all remember tokens for user:', error);
		return 0;
	}
}

/**
 * Rotate a remember token (create new, revoke old)
 * @param {number} oldTokenId - Old token ID to revoke
 * @param {number} userId - User ID
 * @param {string} expiresAt - New expiration timestamp
 * @param {string} userAgent - Optional user agent string
 * @param {string} ipAddress - Optional IP address
 * @returns {Promise<{token: string, id: number}>} - Returns the new plain token and token ID
 */
async function rotateRememberToken(oldTokenId, userId, expiresAt, userAgent = null, ipAddress = null) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	// Revoke old token
	await revokeRememberToken(oldTokenId);

	// Create new token
	return createRememberToken(userId, expiresAt, userAgent, ipAddress);
}

/**
 * Clean up expired remember tokens (optional maintenance)
 * @returns {Promise<number>} - Returns number of tokens deleted
 */
async function cleanupExpiredRememberTokens() {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare('DELETE FROM remember_tokens WHERE expires_at < CURRENT_TIMESTAMP');
			const result = stmt.run();
			return result.changes;
		} else if (dbType === 'postgresql') {
			const result = await db.query('DELETE FROM remember_tokens WHERE expires_at < NOW()');
			return result.rowCount;
		}
	} catch (error) {
		console.error('Error cleaning up expired remember tokens:', error);
		return 0;
	}
}

/**
 * Get active remember tokens count for a user (to enforce limits)
 * @param {number} userId - User ID
 * @returns {Promise<number>} - Returns count of active tokens
 */
async function getActiveRememberTokensCount(userId) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		if (dbType === 'sqlite') {
			const stmt = db.prepare(`
        SELECT COUNT(*) as count
        FROM remember_tokens
        WHERE user_id = ?
          AND expires_at > CURRENT_TIMESTAMP
          AND revoked_at IS NULL
      `);
			const row = stmt.get(userId);
			return row ? row.count : 0;
		} else if (dbType === 'postgresql') {
			const result = await db.query(
				`SELECT COUNT(*) as count
         FROM remember_tokens
         WHERE user_id = $1
           AND expires_at > NOW()
           AND revoked_at IS NULL`,
				[userId]
			);
			return result.rows.length > 0 ? Number.parseInt(result.rows[0].count, 10) : 0;
		}
	} catch (error) {
		console.error('Error getting active remember tokens count:', error);
		return 0;
	}
}

/**
 * Export entire database to a JSON format
 * Compatible with both SQLite and PostgreSQL
 * @returns {Promise<Object>} Database dump with all tables
 */
async function exportDatabase() {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	const exportData = {
		version: '1.0',
		exportedAt: new Date().toISOString(),
		dbType: dbType,
		tables: {}
	};

	// Helper function to safely export a table
	const exportTable = (tableName, orderBy) => {
		try {
			if (dbType === 'sqlite') {
				const data = db.prepare(`SELECT * FROM ${tableName} ORDER BY ${orderBy}`).all();
				exportData.tables[tableName] = data;
			}
		} catch (error) {
			// Table doesn't exist or other error - skip it
			console.warn(`Skipping table ${tableName}:`, error.message);
		}
	};

	// Helper function to safely export a table (PostgreSQL)
	const exportTablePg = async (tableName, orderBy) => {
		try {
			const result = await db.query(`SELECT * FROM ${tableName} ORDER BY ${orderBy}`);
			exportData.tables[tableName] = result.rows;
		} catch (error) {
			// Table doesn't exist or other error - skip it
			console.warn(`Skipping table ${tableName}:`, error.message);
		}
	};

	try {
		if (dbType === 'sqlite') {
			// Export all tables (skip if they don't exist)
			exportTable('telemetry_events', 'id');
			exportTable('users', 'id');
			exportTable('orgs', 'server_id');
			exportTable('teams', 'id');
			exportTable('settings', 'key');
			exportTable('remember_tokens', 'id');
			exportTable('event_user_teams', 'id');

		} else if (dbType === 'postgresql') {
			// Export all tables (skip if they don't exist)
			await exportTablePg('telemetry_events', 'id');
			await exportTablePg('users', 'id');
			await exportTablePg('orgs', 'server_id');
			await exportTablePg('teams', 'id');
			await exportTablePg('settings', 'key');
			await exportTablePg('remember_tokens', 'id');
			await exportTablePg('event_user_teams', 'id');
		}

		return exportData;
	} catch (error) {
		console.error('Error exporting database:', error);
		throw new Error(`Failed to export database: ${error.message}`);
	}
}

/**
 * Import database from JSON format
 * Compatible with both SQLite and PostgreSQL
 * @param {Object} importData - Database dump to import
 * @returns {Promise<{imported: number, errors: Array}>} Import results
 */
async function importDatabase(importData) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (!importData || !importData.tables) {
		throw new Error('Invalid import data format');
	}

	const results = {
		imported: 0,
		errors: []
	};

	try {
		if (dbType === 'sqlite') {
			// Use transaction for atomic import
			const importTransaction = db.transaction(() => {
				// Import users first (referenced by other tables)
				if (importData.tables.users && Array.isArray(importData.tables.users)) {
					const insertUser = db.prepare(`
						INSERT OR REPLACE INTO users (id, username, password_hash, role, created_at, last_login, team_id)
						VALUES (?, ?, ?, ?, ?, ?, ?)
					`);
					importData.tables.users.forEach(user => {
						try {
							insertUser.run(
								user.id,
								user.username,
								user.password_hash,
								user.role || 'basic',
								user.created_at,
								user.last_login,
								user.team_id || null
							);
							results.imported++;
						} catch (err) {
							results.errors.push({table: 'users', id: user.id, error: err.message});
						}
					});
				}

				// Import teams
				if (importData.tables.teams && Array.isArray(importData.tables.teams)) {
					const insertTeam = db.prepare(`
						INSERT OR REPLACE INTO teams (id, name, color, logo_url, logo_data, logo_mime, created_at, updated_at)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?)
					`);
					importData.tables.teams.forEach(team => {
						try {
							insertTeam.run(
								team.id,
								team.name,
								team.color,
								team.logo_url,
								team.logo_data,
								team.logo_mime,
								team.created_at,
								team.updated_at
							);
							results.imported++;
						} catch (err) {
							results.errors.push({table: 'teams', id: team.id, error: err.message});
						}
					});
				}

				// Import orgs
				if (importData.tables.orgs && Array.isArray(importData.tables.orgs)) {
					const insertOrg = db.prepare(`
						INSERT OR REPLACE INTO orgs (server_id, company_name, updated_at, created_at, alias, color, team_id)
						VALUES (?, ?, ?, ?, ?, ?, ?)
					`);
					importData.tables.orgs.forEach(org => {
						try {
							insertOrg.run(
								org.server_id,
								org.company_name,
								org.updated_at,
								org.created_at,
								org.alias || null,
								org.color || null,
								org.team_id || null
							);
							results.imported++;
						} catch (err) {
							results.errors.push({table: 'orgs', id: org.server_id, error: err.message});
						}
					});
				}

				// Import telemetry_events
				if (importData.tables.telemetry_events && Array.isArray(importData.tables.telemetry_events)) {
					const insertEvent = db.prepare(`
						INSERT OR REPLACE INTO telemetry_events (id, event, timestamp, server_id, version, session_id, parent_session_id, user_id, data, received_at, created_at)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					`);
					importData.tables.telemetry_events.forEach(event => {
						try {
							insertEvent.run(
								event.id,
								event.event,
								event.timestamp,
								event.server_id,
								event.version,
								event.session_id,
								event.parent_session_id,
								event.user_id,
								event.data,
								event.received_at,
								event.created_at
							);
							results.imported++;
						} catch (err) {
							results.errors.push({table: 'telemetry_events', id: event.id, error: err.message});
						}
					});
				}

				// Import settings
				if (importData.tables.settings && Array.isArray(importData.tables.settings)) {
					const insertSetting = db.prepare(`
						INSERT OR REPLACE INTO settings (key, value, updated_at, created_at)
						VALUES (?, ?, ?, ?)
					`);
					importData.tables.settings.forEach(setting => {
						try {
							insertSetting.run(
								setting.key,
								setting.value,
								setting.updated_at,
								setting.created_at
							);
							results.imported++;
						} catch (err) {
							results.errors.push({table: 'settings', key: setting.key, error: err.message});
						}
					});
				}

				// Import remember_tokens
				if (importData.tables.remember_tokens && Array.isArray(importData.tables.remember_tokens)) {
					const insertToken = db.prepare(`
						INSERT OR REPLACE INTO remember_tokens (id, user_id, token_hash, expires_at, created_at, last_used_at, user_agent, ip_address)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?)
					`);
					importData.tables.remember_tokens.forEach(token => {
						try {
							insertToken.run(
								token.id,
								token.user_id,
								token.token_hash,
								token.expires_at,
								token.created_at,
								token.last_used_at,
								token.user_agent,
								token.ip_address
							);
							results.imported++;
						} catch (err) {
							results.errors.push({table: 'remember_tokens', id: token.id, error: err.message});
						}
					});
				}

				// Import event_user_teams
				if (importData.tables.event_user_teams && Array.isArray(importData.tables.event_user_teams)) {
					const insertEventUserTeam = db.prepare(`
						INSERT OR REPLACE INTO event_user_teams (id, team_id, user_name, created_at)
						VALUES (?, ?, ?, ?)
					`);
					importData.tables.event_user_teams.forEach(eut => {
						try {
							insertEventUserTeam.run(
								eut.id,
								eut.team_id,
								eut.user_name,
								eut.created_at
							);
							results.imported++;
						} catch (err) {
							results.errors.push({table: 'event_user_teams', id: eut.id, error: err.message});
						}
					});
				}
			});

			importTransaction();

		} else if (dbType === 'postgresql') {
			// Use transaction for atomic import
			const client = await db.connect();
			try {
				await client.query('BEGIN');

				// Import users first
				if (importData.tables.users && Array.isArray(importData.tables.users)) {
					for (const user of importData.tables.users) {
						try {
							await client.query(`
								INSERT INTO users (id, username, password_hash, role, created_at, last_login, team_id)
								VALUES ($1, $2, $3, $4, $5, $6, $7)
								ON CONFLICT (id) DO UPDATE SET
									username = EXCLUDED.username,
									password_hash = EXCLUDED.password_hash,
									role = EXCLUDED.role,
									created_at = EXCLUDED.created_at,
									last_login = EXCLUDED.last_login,
									team_id = EXCLUDED.team_id
							`, [
								user.id,
								user.username,
								user.password_hash,
								user.role || 'basic',
								user.created_at,
								user.last_login,
								user.team_id || null
							]);
							results.imported++;
						} catch (err) {
							results.errors.push({table: 'users', id: user.id, error: err.message});
						}
					}
				}

				// Import teams
				if (importData.tables.teams && Array.isArray(importData.tables.teams)) {
					for (const team of importData.tables.teams) {
						try {
							await client.query(`
								INSERT INTO teams (id, name, color, logo_url, logo_data, logo_mime, created_at, updated_at)
								VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
								ON CONFLICT (id) DO UPDATE SET
									name = EXCLUDED.name,
									color = EXCLUDED.color,
									logo_url = EXCLUDED.logo_url,
									logo_data = EXCLUDED.logo_data,
									logo_mime = EXCLUDED.logo_mime,
									created_at = EXCLUDED.created_at,
									updated_at = EXCLUDED.updated_at
							`, [
								team.id,
								team.name,
								team.color,
								team.logo_url,
								team.logo_data ? Buffer.from(team.logo_data) : null,
								team.logo_mime,
								team.created_at,
								team.updated_at
							]);
							results.imported++;
						} catch (err) {
							results.errors.push({table: 'teams', id: team.id, error: err.message});
						}
					}
				}

				// Import orgs
				if (importData.tables.orgs && Array.isArray(importData.tables.orgs)) {
					for (const org of importData.tables.orgs) {
						try {
							await client.query(`
								INSERT INTO orgs (server_id, company_name, updated_at, created_at, alias, color, team_id)
								VALUES ($1, $2, $3, $4, $5, $6, $7)
								ON CONFLICT (server_id) DO UPDATE SET
									company_name = EXCLUDED.company_name,
									updated_at = EXCLUDED.updated_at,
									created_at = EXCLUDED.created_at,
									alias = EXCLUDED.alias,
									color = EXCLUDED.color,
									team_id = EXCLUDED.team_id
							`, [
								org.server_id,
								org.company_name,
								org.updated_at,
								org.created_at,
								org.alias || null,
								org.color || null,
								org.team_id || null
							]);
							results.imported++;
						} catch (err) {
							results.errors.push({table: 'orgs', id: org.server_id, error: err.message});
						}
					}
				}

				// Import telemetry_events
				if (importData.tables.telemetry_events && Array.isArray(importData.tables.telemetry_events)) {
					for (const event of importData.tables.telemetry_events) {
						try {
							// For PostgreSQL, convert data string to JSONB if needed
							const eventData = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
							await client.query(`
								INSERT INTO telemetry_events (id, event, timestamp, server_id, version, session_id, parent_session_id, user_id, data, received_at, created_at)
								VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
								ON CONFLICT (id) DO UPDATE SET
									event = EXCLUDED.event,
									timestamp = EXCLUDED.timestamp,
									server_id = EXCLUDED.server_id,
									version = EXCLUDED.version,
									session_id = EXCLUDED.session_id,
									parent_session_id = EXCLUDED.parent_session_id,
									user_id = EXCLUDED.user_id,
									data = EXCLUDED.data,
									received_at = EXCLUDED.received_at,
									created_at = EXCLUDED.created_at
							`, [
								event.id,
								event.event,
								event.timestamp,
								event.server_id,
								event.version,
								event.session_id,
								event.parent_session_id,
								event.user_id,
								eventData,
								event.received_at,
								event.created_at
							]);
							results.imported++;
						} catch (err) {
							results.errors.push({table: 'telemetry_events', id: event.id, error: err.message});
						}
					}
				}

				// Import settings
				if (importData.tables.settings && Array.isArray(importData.tables.settings)) {
					for (const setting of importData.tables.settings) {
						try {
							await client.query(`
								INSERT INTO settings (key, value, updated_at, created_at)
								VALUES ($1, $2, $3, $4)
								ON CONFLICT (key) DO UPDATE SET
									value = EXCLUDED.value,
									updated_at = EXCLUDED.updated_at
							`, [
								setting.key,
								setting.value,
								setting.updated_at,
								setting.created_at
							]);
							results.imported++;
						} catch (err) {
							results.errors.push({table: 'settings', key: setting.key, error: err.message});
						}
					}
				}

				// Import remember_tokens
				if (importData.tables.remember_tokens && Array.isArray(importData.tables.remember_tokens)) {
					for (const token of importData.tables.remember_tokens) {
						try {
							await client.query(`
								INSERT INTO remember_tokens (id, user_id, token_hash, expires_at, created_at, last_used_at, user_agent, ip_address)
								VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
								ON CONFLICT (id) DO UPDATE SET
									user_id = EXCLUDED.user_id,
									token_hash = EXCLUDED.token_hash,
									expires_at = EXCLUDED.expires_at,
									created_at = EXCLUDED.created_at,
									last_used_at = EXCLUDED.last_used_at,
									user_agent = EXCLUDED.user_agent,
									ip_address = EXCLUDED.ip_address
							`, [
								token.id,
								token.user_id,
								token.token_hash,
								token.expires_at,
								token.created_at,
								token.last_used_at,
								token.user_agent,
								token.ip_address
							]);
							results.imported++;
						} catch (err) {
							results.errors.push({table: 'remember_tokens', id: token.id, error: err.message});
						}
					}
				}

				// Import event_user_teams
				if (importData.tables.event_user_teams && Array.isArray(importData.tables.event_user_teams)) {
					for (const eut of importData.tables.event_user_teams) {
						try {
							await client.query(`
								INSERT INTO event_user_teams (id, team_id, user_name, created_at)
								VALUES ($1, $2, $3, $4)
								ON CONFLICT (id) DO UPDATE SET
									team_id = EXCLUDED.team_id,
									user_name = EXCLUDED.user_name,
									created_at = EXCLUDED.created_at
							`, [
								eut.id,
								eut.team_id,
								eut.user_name,
								eut.created_at
							]);
							results.imported++;
						} catch (err) {
							results.errors.push({table: 'event_user_teams', id: eut.id, error: err.message});
						}
					}
				}

				await client.query('COMMIT');
			} catch (error) {
				await client.query('ROLLBACK');
				throw error;
			} finally {
				client.release();
			}
		}

		return results;
	} catch (error) {
		console.error('Error importing database:', error);
		throw new Error(`Failed to import database: ${error.message}`);
	}
}

/**
 * Recover a soft deleted event (restore from trash)
 * @param {number} id - Event ID to recover
 * @returns {Promise<boolean>} True if recovered successfully
 */
async function recoverEvent(id) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (dbType === 'sqlite') {
		const stmt = db.prepare('UPDATE telemetry_events SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL');
		const result = stmt.run(id);
		return result.changes > 0;
	} else if (dbType === 'postgresql') {
		const result = await db.query('UPDATE telemetry_events SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL', [id]);
		return result.rowCount > 0;
	}
}

/**
 * Permanently delete a soft deleted event
 * @param {number} id - Event ID to permanently delete
 * @returns {Promise<boolean>} True if permanently deleted successfully
 */
async function permanentlyDeleteEvent(id) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	let eventInfo = null;
	if (dbType === 'sqlite') {
		eventInfo = db.prepare('SELECT user_id, org_id FROM telemetry_events WHERE id = ? AND deleted_at IS NOT NULL').get(id);
	} else if (dbType === 'postgresql') {
		const result = await db.query('SELECT user_id, org_id FROM telemetry_events WHERE id = $1 AND deleted_at IS NOT NULL', [id]);
		eventInfo = result.rows[0];
	}

	if (dbType === 'sqlite') {
		const stmt = db.prepare('DELETE FROM telemetry_events WHERE id = ? AND deleted_at IS NOT NULL');
		const result = stmt.run(id);
		const deleted = result.changes > 0;
		if (deleted && eventInfo) {
			await Promise.all([
				eventInfo?.user_id ? recomputeUserEventStats([eventInfo.user_id]) : Promise.resolve(),
				eventInfo?.org_id ? recomputeOrgEventStats([eventInfo.org_id]) : Promise.resolve()
			]);
		}
		return deleted;
	} else if (dbType === 'postgresql') {
		const result = await db.query('DELETE FROM telemetry_events WHERE id = $1 AND deleted_at IS NOT NULL', [id]);
		const deleted = result.rowCount > 0;
		if (deleted && eventInfo) {
			await Promise.all([
				eventInfo?.user_id ? recomputeUserEventStats([eventInfo.user_id]) : Promise.resolve(),
				eventInfo?.org_id ? recomputeOrgEventStats([eventInfo.org_id]) : Promise.resolve()
			]);
		}
		return deleted;
	}
}

/**
 * Permanently delete all events in the trash (all soft deleted events)
 * @returns {Promise<number>} Number of permanently deleted events
 */
async function emptyTrash() {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	let impactedUsers = [];
	let impactedOrgs = [];

	if (dbType === 'sqlite') {
		// First get affected users/orgs for stats recomputation
		const rows = db.prepare(`
			SELECT DISTINCT user_id, org_id
			FROM telemetry_events
			WHERE deleted_at IS NOT NULL
		`).all();
		impactedUsers = rows.map(row => row.user_id).filter(Boolean);
		impactedOrgs = rows.map(row => row.org_id).filter(Boolean);

		// Then delete all events in trash
		const stmt = db.prepare('DELETE FROM telemetry_events WHERE deleted_at IS NOT NULL');
		const result = stmt.run();

		if (result.changes > 0) {
			await Promise.all([
				impactedUsers.length ? recomputeUserEventStats(impactedUsers) : Promise.resolve(),
				impactedOrgs.length ? recomputeOrgEventStats(impactedOrgs) : Promise.resolve()
			]);
		}
		return result.changes;
	} else if (dbType === 'postgresql') {
		// First get affected users/orgs for stats recomputation
		const result = await db.query(`
			SELECT DISTINCT user_id, org_id
			FROM telemetry_events
			WHERE deleted_at IS NOT NULL
		`);
		impactedUsers = result.rows.map(row => row.user_id).filter(Boolean);
		impactedOrgs = result.rows.map(row => row.org_id).filter(Boolean);

		// Then delete all events in trash
		const deleteResult = await db.query('DELETE FROM telemetry_events WHERE deleted_at IS NOT NULL');

		if (deleteResult.rowCount > 0) {
			await Promise.all([
				impactedUsers.length ? recomputeUserEventStats(impactedUsers) : Promise.resolve(),
				impactedOrgs.length ? recomputeOrgEventStats(impactedOrgs) : Promise.resolve()
			]);
		}
		return deleteResult.rowCount;
	}
}

/**
 * Permanently delete all soft deleted events older than specified days
 * @param {number} daysOld - Delete events soft deleted more than this many days ago (default: 30)
 * @returns {Promise<number>} Number of permanently deleted events
 */
async function cleanupOldDeletedEvents(daysOld = 30) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - daysOld);

	let impactedUsers = [];
	let impactedOrgs = [];

	if (dbType === 'sqlite') {
		// First get affected users/orgs for stats recomputation
		const rows = db.prepare(`
			SELECT DISTINCT user_id, org_id
			FROM telemetry_events
			WHERE deleted_at IS NOT NULL AND deleted_at < ?
		`).all(cutoffDate.toISOString());
		impactedUsers = rows.map(row => row.user_id).filter(Boolean);
		impactedOrgs = rows.map(row => row.org_id).filter(Boolean);

		// Then delete the events
		const stmt = db.prepare('DELETE FROM telemetry_events WHERE deleted_at IS NOT NULL AND deleted_at < ?');
		const result = stmt.run(cutoffDate.toISOString());

		if (result.changes > 0) {
			await Promise.all([
				impactedUsers.length ? recomputeUserEventStats(impactedUsers) : Promise.resolve(),
				impactedOrgs.length ? recomputeOrgEventStats(impactedOrgs) : Promise.resolve()
			]);
		}
		return result.changes;
	} else if (dbType === 'postgresql') {
		// First get affected users/orgs for stats recomputation
		const result = await db.query(`
			SELECT DISTINCT user_id, org_id
			FROM telemetry_events
			WHERE deleted_at IS NOT NULL AND deleted_at < $1
		`, [cutoffDate]);
		impactedUsers = result.rows.map(row => row.user_id).filter(Boolean);
		impactedOrgs = result.rows.map(row => row.org_id).filter(Boolean);

		// Then delete the events
		const deleteResult = await db.query('DELETE FROM telemetry_events WHERE deleted_at IS NOT NULL AND deleted_at < $1', [cutoffDate]);

		if (deleteResult.rowCount > 0) {
			await Promise.all([
				impactedUsers.length ? recomputeUserEventStats(impactedUsers) : Promise.resolve(),
				impactedOrgs.length ? recomputeOrgEventStats(impactedOrgs) : Promise.resolve()
			]);
		}
		return deleteResult.rowCount;
	}
}

/**
 * Get soft deleted events (trashed events)
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of events to return (default: 50)
 * @param {number} options.offset - Offset for pagination (default: 0)
 * @param {string} options.orderBy - Column to order by (default: 'deleted_at')
 * @param {string} options.order - Sort order 'ASC' or 'DESC' (default: 'DESC')
 * @returns {Promise<Object>} Object with events array and total count
 */
async function getDeletedEvents(options = {}) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	const limit = Math.min(options.limit || 50, 1000); // Max 1000 for safety
	const offset = options.offset || 0;
	const orderBy = options.orderBy || 'deleted_at';
	const order = (options.order || 'DESC').toUpperCase();

	const validOrderBy = ['id', 'event', 'timestamp', 'deleted_at', 'user_id', 'server_id'];
	if (!validOrderBy.includes(orderBy)) {
		throw new Error(`Invalid orderBy column: ${orderBy}`);
	}

	if (!['ASC', 'DESC'].includes(order)) {
		throw new Error(`Invalid order: ${order}`);
	}

	let events = [];
	let total = 0;

	if (dbType === 'sqlite') {
		const countStmt = db.prepare('SELECT COUNT(*) as count FROM telemetry_events WHERE deleted_at IS NOT NULL');
		total = countStmt.get().count;

		const stmt = db.prepare(`
			SELECT id, event, timestamp, server_id, version, session_id, parent_session_id, user_id, data, received_at, created_at, deleted_at
			FROM telemetry_events
			WHERE deleted_at IS NOT NULL
			ORDER BY ${orderBy} ${order}
			LIMIT ? OFFSET ?
		`);
		events = stmt.all(limit, offset);
	} else if (dbType === 'postgresql') {
		const countResult = await db.query('SELECT COUNT(*) as count FROM telemetry_events WHERE deleted_at IS NOT NULL');
		total = Number.parseInt(countResult.rows[0].count, 10);

		const result = await db.query(`
			SELECT id, event, timestamp, server_id, version, session_id, parent_session_id, user_id, data, received_at, created_at, deleted_at
			FROM telemetry_events
			WHERE deleted_at IS NOT NULL
			ORDER BY ${orderBy} ${order}
			LIMIT $1 OFFSET $2
		`, [limit, offset]);
		events = result.rows;
	}

	return {
		events: events.map(event => ({
			...event,
			data: dbType === 'postgresql' ? event.data : JSON.parse(event.data || '{}')
		})),
		total,
		limit,
		offset
	};
}

/**
 * Recalculate team_id for all events of an organization when org->team assignment changes
 * @param {string} orgId - Organization ID (server_id)
 * @returns {Promise<number>} Number of events updated
 */
async function recalculateTeamIdsForOrg(orgId) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (!orgId) {
		throw new Error('orgId is required');
	}

	try {
		let teamId = null;

		// Get the current team_id for this org
		if (dbType === 'sqlite') {
			const result = db.prepare('SELECT team_id FROM orgs WHERE server_id = ?').get(orgId);
			teamId = result?.team_id || null;
		} else if (dbType === 'postgresql') {
			const result = await db.query('SELECT team_id FROM orgs WHERE server_id = $1', [orgId]);
			teamId = result.rows.length > 0 ? result.rows[0].team_id : null;
		}

		// Update all events for this org with the new team_id
		if (dbType === 'sqlite') {
			const result = db.prepare('UPDATE telemetry_events SET team_id = ? WHERE org_id = ?').run(teamId, orgId);
			return result.changes;
		} else if (dbType === 'postgresql') {
			const result = await db.query('UPDATE telemetry_events SET team_id = $1 WHERE org_id = $2', [teamId, orgId]);
			return result.rowCount;
		}

		return 0;
	} catch (error) {
		console.error('Error recalculating team_ids for org %s:', orgId, error);
		throw new Error(`Failed to recalculate team_ids: ${error.message}`);
	}
}

/**
 * Log a successful user login
 * @param {string} username - Username that logged in
 * @param {string} ipAddress - IP address of the login
 * @param {string} userAgent - User agent string
 * @returns {Promise<void>}
 */
async function logUserLogin(username, ipAddress, userAgent) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (dbType === 'sqlite') {
		db.prepare('INSERT INTO user_logins (username, ip_address, user_agent, successful) VALUES (?, ?, ?, 1)').run(username, ipAddress || null, userAgent || null);
	} else if (dbType === 'postgresql') {
		await db.query('INSERT INTO user_logins (username, ip_address, user_agent, successful) VALUES ($1, $2, $3, true)', [username, ipAddress || null, userAgent || null]);
	}
}

/**
 * Log a failed user login attempt
 * @param {string} username - Username that attempted to log in
 * @param {string} ipAddress - IP address of the attempt
 * @param {string} userAgent - User agent string
 * @param {string} errorMessage - Error message for the failed attempt
 * @returns {Promise<void>}
 */
async function logUserLoginAttempt(username, ipAddress, userAgent, errorMessage) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (dbType === 'sqlite') {
		db.prepare('INSERT INTO user_logins (username, ip_address, user_agent, successful, error_message) VALUES (?, ?, ?, 0, ?)').run(username, ipAddress || null, userAgent || null, errorMessage || null);
	} else if (dbType === 'postgresql') {
		await db.query('INSERT INTO user_logins (username, ip_address, user_agent, successful, error_message) VALUES ($1, $2, $3, false, $4)', [username, ipAddress || null, userAgent || null, errorMessage || null]);
	}
}

/**
 * Get user login logs with filtering and pagination
 * @param {object} options - Query options
 * @param {number} options.limit - Maximum number of logs to return (default: 100)
 * @param {number} options.offset - Number of logs to skip (default: 0)
 * @param {string} options.username - Filter by username
 * @param {boolean} options.successful - Filter by success status
 * @returns {Promise<Array>} Array of login log objects
 */
async function getUserLoginLogs(options = {}) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	const {limit = 100, offset = 0, username, successful} = options;

	let whereClause = '';
	const params = [];

	if (username) {
		whereClause += ' WHERE username = ?';
		params.push(username);
	}

	if (successful !== undefined) {
		const successBool = successful === true || successful === 'true' || successful === '1';
		whereClause += whereClause ? ' AND successful = ?' : ' WHERE successful = ?';
		params.push(successBool ? 1 : 0);
	}

	if (dbType === 'sqlite') {
		const query = `SELECT id, username, ip_address, user_agent, successful, error_message, created_at FROM user_logins${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
		const result = db.prepare(query).all(...params, Number.parseInt(limit, 10), Number.parseInt(offset, 10));
		return result;
	} else if (dbType === 'postgresql') {
		const query = `SELECT id, username, ip_address::text, user_agent, successful, error_message, created_at FROM user_logins${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
		const queryParams = [...params, Number.parseInt(limit, 10), Number.parseInt(offset, 10)];
		const result = await db.query(query, queryParams);
		return result.rows;
	}

	return [];
}

export {
	init,
	storeEvent,
	storeDiscardedEvent,
	getStats,
	getEvents,
	getEventById,
	getEventTypeStats,
	getSessions,
	getDailyStats,
	getDailyStatsByEventType,
	getTopUsersLastDays,
	getTopTeamsLastDays,
	getUserEventStats,
	getTeamStats,
	deleteEvent,
	deleteAllEvents,
	deleteEventsBySession,
	recoverEvent,
	permanentlyDeleteEvent,
	emptyTrash,
	cleanupOldDeletedEvents,
	getDeletedEvents,
	getDatabaseSize,
	close,
	logUserLogin,
	logUserLoginAttempt,
	getUserLoginLogs,
	// Utility functions
	extractNormalizedFields,
	DEFAULT_MAX_DB_SIZE,
	// User management
	getUserByUsername,
	getUserById,
	createUser,
	updateLastLogin,
	getAllUsers,
	deleteUser,
	updateUserPassword,
	updateUserRole,
	// Organization management
	getOrgCompanyName,
	getAllOrgs,
	upsertOrgCompanyName,
	getAllOrgsWithTeams,
	upsertOrg,
	moveOrgToTeam,
	// Team management
	getAllTeams,
	getTeamById,
	getTeamLogo,
	createTeam,
	updateTeam,
	deleteTeam,
	recalculateTeamIdsForOrg,
	assignUserToTeam,
	addEventUserToTeam,
	removeEventUserFromTeam,
	getEventUserNames,
	// People management
	getAllPeople,
	getPersonById,
	createPerson,
	updatePerson,
	deletePerson,
	getPersonUsernames,
	addUsernameToPerson,
	removeUsernameFromPerson,
	// Event updates
	updateEventData,
	// User filtering
	getUniqueUserIds,
	// Session store
	getPostgresPool,
	getSqliteDb,
	// Settings
	getSetting,
	saveSetting,
	// Remember tokens
	createRememberToken,
	validateRememberToken,
	revokeRememberToken,
	revokeAllRememberTokensForUser,
	rotateRememberToken,
	cleanupExpiredRememberTokens,
	getActiveRememberTokensCount,
	// Utilities
	getNormalizedUserId,
	// Tool usage statistics
	getToolUsageStats,
	// Database export/import
	exportDatabase,
	importDatabase
};
