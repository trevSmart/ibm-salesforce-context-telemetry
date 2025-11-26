/**
 * Database storage module for telemetry events
 *
 * Supports multiple database backends:
 * - SQLite (default, for development and small deployments)
 * - PostgreSQL (for production)
 */

const fs = require('fs');
const path = require('path');

let db = null;
let dbType = process.env.DB_TYPE || 'sqlite';

/**
 * Initialize database connection
 */
async function init() {
	if (dbType === 'sqlite') {
		const Database = require('better-sqlite3');
		const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'telemetry.db');

		// Ensure data directory exists
		const dataDir = path.dirname(dbPath);
		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir, { recursive: true });
		}

		db = new Database(dbPath);

		// Create table if it doesn't exist
		db.exec(`
			CREATE TABLE IF NOT EXISTS telemetry_events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				event TEXT NOT NULL,
				timestamp TEXT NOT NULL,
				server_id TEXT,
				version TEXT,
				session_id TEXT,
				user_id TEXT,
				data TEXT NOT NULL,
				received_at TEXT NOT NULL,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			);

			CREATE INDEX IF NOT EXISTS idx_event ON telemetry_events(event);
			CREATE INDEX IF NOT EXISTS idx_timestamp ON telemetry_events(timestamp);
			CREATE INDEX IF NOT EXISTS idx_server_id ON telemetry_events(server_id);
			CREATE INDEX IF NOT EXISTS idx_created_at ON telemetry_events(created_at);
		`);

		console.log(`SQLite database initialized at: ${dbPath}`);
	} else if (dbType === 'postgresql') {
		const { Pool } = require('pg');

		const pool = new Pool({
			connectionString: process.env.DATABASE_URL,
			ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
		});

		// Test connection
		await pool.query('SELECT NOW()');

		// Create table if it doesn't exist
		await pool.query(`
			CREATE TABLE IF NOT EXISTS telemetry_events (
				id SERIAL PRIMARY KEY,
				event TEXT NOT NULL,
				timestamp TIMESTAMPTZ NOT NULL,
				server_id TEXT,
				version TEXT,
				session_id TEXT,
				user_id TEXT,
				data JSONB NOT NULL,
				received_at TIMESTAMPTZ NOT NULL,
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE INDEX IF NOT EXISTS idx_event ON telemetry_events(event);
			CREATE INDEX IF NOT EXISTS idx_timestamp ON telemetry_events(timestamp);
			CREATE INDEX IF NOT EXISTS idx_server_id ON telemetry_events(server_id);
			CREATE INDEX IF NOT EXISTS idx_created_at ON telemetry_events(created_at);
		`);

		db = pool;
		console.log('PostgreSQL database initialized');
	} else {
		throw new Error(`Unsupported database type: ${dbType}`);
	}
}

/**
 * Extract a session identifier from different telemetry payload formats.
 * Accepts camelCase (sessionId) and snake_case (session_id) plus nested "session".
 * @param {object} eventData
 * @returns {string|null}
 */
function getNormalizedSessionId(eventData = {}) {
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
		(eventData.data?.session && typeof eventData.data.session === 'object'
			? eventData.data.session.id ||
				eventData.data.session.sessionId ||
				eventData.data.session.session_id
			: null);

	return dataSession || null;
}

/**
 * Store a telemetry event
 * @param {object} eventData - The telemetry event data
 * @param {string} receivedAt - ISO timestamp when event was received
 * @returns {Promise<void>}
 */
async function storeEvent(eventData, receivedAt) {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	try {
		const normalizedSessionId = getNormalizedSessionId(eventData);

		if (dbType === 'sqlite') {
			const stmt = db.prepare(`
				INSERT INTO telemetry_events
				(event, timestamp, server_id, version, session_id, user_id, data, received_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`);

			stmt.run(
				eventData.event,
				eventData.timestamp,
				eventData.serverId || null,
				eventData.version || null,
				normalizedSessionId || null,
				eventData.userId || null,
				JSON.stringify(eventData.data || {}),
				receivedAt
			);
		} else if (dbType === 'postgresql') {
			await db.query(
				`INSERT INTO telemetry_events
				(event, timestamp, server_id, version, session_id, user_id, data, received_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
				[
					eventData.event,
					eventData.timestamp,
					eventData.serverId || null,
					eventData.version || null,
					normalizedSessionId || null,
					eventData.userId || null,
					eventData.data || {},
					receivedAt
				]
			);
		}
	} catch (error) {
		// Re-throw to allow caller to handle
		throw new Error(`Failed to store telemetry event: ${error.message}`);
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

	const { startDate, endDate, eventType } = options;

	if (dbType === 'sqlite') {
		let query = 'SELECT COUNT(*) as total FROM telemetry_events WHERE 1=1';
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
		return { total: result.total };
	} else if (dbType === 'postgresql') {
		let query = 'SELECT COUNT(*) as total FROM telemetry_events WHERE 1=1';
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
		return { total: parseInt(result.rows[0].total) };
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
		serverId,
		sessionId,
		startDate,
		endDate,
		orderBy = 'created_at',
		order = 'DESC'
	} = options;

	let whereClause = 'WHERE 1=1';
	const params = [];
	let paramIndex = 1;

	if (eventTypes && Array.isArray(eventTypes) && eventTypes.length > 0) {
		if (eventTypes.length === 1) {
			whereClause += dbType === 'sqlite' ? ' AND event = ?' : ` AND event = $${paramIndex++}`;
			params.push(eventTypes[0]);
		} else {
			const placeholders = eventTypes.map(() => {
				return dbType === 'sqlite' ? '?' : `$${paramIndex++}`;
			}).join(', ');
			whereClause += ` AND event IN (${placeholders})`;
			params.push(...eventTypes);
		}
	}
	if (serverId) {
		whereClause += dbType === 'sqlite' ? ' AND server_id = ?' : ` AND server_id = $${paramIndex++}`;
		params.push(serverId);
	}
	if (sessionId) {
		whereClause += dbType === 'sqlite' ? ' AND session_id = ?' : ` AND session_id = $${paramIndex++}`;
		params.push(sessionId);
	}
	if (startDate) {
		whereClause += dbType === 'sqlite' ? ' AND created_at >= ?' : ` AND created_at >= $${paramIndex++}`;
		params.push(startDate);
	}
	if (endDate) {
		whereClause += dbType === 'sqlite' ? ' AND created_at <= ?' : ` AND created_at <= $${paramIndex++}`;
		params.push(endDate);
	}

	// Get total count
	let countQuery = `SELECT COUNT(*) as total FROM telemetry_events ${whereClause}`;
	let total;
	if (dbType === 'sqlite') {
		total = db.prepare(countQuery).get(...params).total;
	} else {
		const countResult = await db.query(countQuery, params);
		total = parseInt(countResult.rows[0].total);
	}

	// Get events
	const validOrderBy = ['id', 'event', 'timestamp', 'created_at', 'server_id'];
	const validOrder = ['ASC', 'DESC'];
	const safeOrderBy = validOrderBy.includes(orderBy) ? orderBy : 'created_at';
	const safeOrder = validOrder.includes(order.toUpperCase()) ? order.toUpperCase() : 'DESC';

	let eventsQuery = `
		SELECT id, event, timestamp, server_id, version, session_id, user_id, data, received_at, created_at
		FROM telemetry_events
		${whereClause}
		ORDER BY ${safeOrderBy} ${safeOrder}
		LIMIT ${dbType === 'sqlite' ? '?' : `$${paramIndex++}`}
		OFFSET ${dbType === 'sqlite' ? '?' : `$${paramIndex++}`}
	`;

	const queryParams = [...params, limit, offset];
	let events;

	if (dbType === 'sqlite') {
		events = db.prepare(eventsQuery).all(...queryParams);
		// Parse JSON data for SQLite
		events = events.map(event => ({
			...event,
			data: JSON.parse(event.data)
		}));
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
 * Get event type statistics
 * @returns {Array} Statistics by event type
 */
async function getEventTypeStats() {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (dbType === 'sqlite') {
		const result = db.prepare(`
			SELECT event, COUNT(*) as count
			FROM telemetry_events
			GROUP BY event
			ORDER BY count DESC
		`).all();
		return result;
	} else {
		const result = await db.query(`
			SELECT event, COUNT(*) as count
			FROM telemetry_events
			GROUP BY event
			ORDER BY count DESC
		`);
		return result.rows.map(row => ({
			event: row.event,
			count: parseInt(row.count)
		}));
	}
}

/**
 * Get unique sessions with event counts
 * @returns {Array} Sessions with count and latest timestamp
 */
async function getSessions() {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (dbType === 'sqlite') {
		const result = db.prepare(`
			SELECT
				s.session_id,
				COUNT(*) as count,
				MIN(s.created_at) as first_event,
				MAX(s.created_at) as last_event,
				(SELECT user_id FROM telemetry_events
				 WHERE session_id = s.session_id
				 ORDER BY created_at ASC LIMIT 1) as user_id,
				(SELECT data FROM telemetry_events
				 WHERE session_id = s.session_id AND event = 'session_start'
				 ORDER BY created_at ASC LIMIT 1) as session_start_data
			FROM telemetry_events s
			WHERE s.session_id IS NOT NULL
			GROUP BY s.session_id
			ORDER BY last_event DESC
		`).all();
		return result.map(row => {
			let user_name = null;
			if (row.session_start_data) {
				try {
					const data = JSON.parse(row.session_start_data);
					// Try multiple paths: userName (camelCase), user_name (snake_case), or data.user.name (nested)
					if (data) {
						user_name = data.userName || data.user_name || (data.user && data.user.name) || null;
					}
				} catch (e) {
					// If parsing fails, ignore and use user_id
				}
			}
			return {
				session_id: row.session_id,
				count: parseInt(row.count),
				first_event: row.first_event,
				last_event: row.last_event,
				user_id: row.user_id,
				user_name: user_name
			};
		});
	} else {
		const result = await db.query(`
			SELECT
				s.session_id,
				COUNT(*) as count,
				MIN(s.created_at) as first_event,
				MAX(s.created_at) as last_event,
				(SELECT user_id FROM telemetry_events
				 WHERE session_id = s.session_id
				 ORDER BY created_at ASC LIMIT 1) as user_id,
				(SELECT data FROM telemetry_events
				 WHERE session_id = s.session_id AND event = 'session_start'
				 ORDER BY created_at ASC LIMIT 1) as session_start_data
			FROM telemetry_events s
			WHERE s.session_id IS NOT NULL
			GROUP BY s.session_id
			ORDER BY last_event DESC
		`);
		return result.rows.map(row => {
			let user_name = null;
			if (row.session_start_data) {
				try {
					const data = typeof row.session_start_data === 'string'
						? JSON.parse(row.session_start_data)
						: row.session_start_data;
					// Try multiple paths: userName (camelCase), user_name (snake_case), or data.user.name (nested)
					if (data) {
						user_name = data.userName || data.user_name || (data.user && data.user.name) || null;
					}
				} catch (e) {
					// If parsing fails, ignore and use user_id
				}
			}
			return {
				session_id: row.session_id,
				count: parseInt(row.count),
				first_event: row.first_event,
				last_event: row.last_event,
				user_id: row.user_id,
				user_name: user_name
			};
		});
	}
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

	if (dbType === 'sqlite') {
		const stmt = db.prepare('DELETE FROM telemetry_events WHERE id = ?');
		const result = stmt.run(id);
		return result.changes > 0;
	} else if (dbType === 'postgresql') {
		const result = await db.query('DELETE FROM telemetry_events WHERE id = $1', [id]);
		return result.rowCount > 0;
	}
}

/**
 * Delete all events from the database
 * @returns {Promise<number>} Number of deleted events
 */
async function deleteAllEvents() {
	if (!db) {
		throw new Error('Database not initialized. Call init() first.');
	}

	if (dbType === 'sqlite') {
		const stmt = db.prepare('DELETE FROM telemetry_events');
		const result = stmt.run();
		return result.changes;
	} else if (dbType === 'postgresql') {
		const result = await db.query('DELETE FROM telemetry_events');
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

	const endDate = new Date();
	const startDate = new Date();
	startDate.setDate(startDate.getDate() - days);
	startDate.setHours(0, 0, 0, 0);

	if (dbType === 'sqlite') {
		// SQLite: use DATE() function to group by date
		// Convert startDate to SQLite datetime format (YYYY-MM-DD HH:MM:SS) for comparison
		// SQLite stores CURRENT_TIMESTAMP as 'YYYY-MM-DD HH:MM:SS' format
		const sqliteStartDate = startDate.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');

		const result = db.prepare(`
			SELECT
				DATE(created_at) as date,
				COUNT(*) as count
			FROM telemetry_events
			WHERE created_at >= ?
			GROUP BY DATE(created_at)
			ORDER BY date ASC
		`).all(sqliteStartDate);

		// Fill in missing days with 0 counts
		const dateMap = new Map();
		result.forEach(row => {
			// SQLite DATE() returns string in 'YYYY-MM-DD' format
			// Normalize to ensure consistent format
			let dateStr = String(row.date);
			// Remove time portion if present, keep only date part
			dateStr = dateStr.split('T')[0].split(' ')[0];
			dateMap.set(dateStr, parseInt(row.count));
		});

		const filledResults = [];
		for (let i = 0; i < days; i++) {
			const date = new Date(startDate);
			date.setDate(date.getDate() + i);
			const dateStr = date.toISOString().split('T')[0];
			filledResults.push({
				date: dateStr,
				count: dateMap.get(dateStr) || 0
			});
		}

		return filledResults;
	} else {
		// PostgreSQL: use DATE_TRUNC to group by date
		const result = await db.query(`
			SELECT
				DATE(created_at) as date,
				COUNT(*) as count
			FROM telemetry_events
			WHERE created_at >= $1
			GROUP BY DATE(created_at)
			ORDER BY date ASC
		`, [startDate.toISOString()]);

		// Fill in missing days with 0 counts
		const dateMap = new Map();
		result.rows.forEach(row => {
			// Handle both Date objects and string dates from PostgreSQL
			const dateValue = row.date instanceof Date
				? row.date.toISOString().split('T')[0]
				: row.date.split('T')[0];
			dateMap.set(dateValue, parseInt(row.count));
		});

		const filledResults = [];
		for (let i = 0; i < days; i++) {
			const date = new Date(startDate);
			date.setDate(date.getDate() + i);
			const dateStr = date.toISOString().split('T')[0];
			filledResults.push({
				date: dateStr,
				count: dateMap.get(dateStr) || 0
			});
		}

		return filledResults;
	}
}

/**
 * Close database connection
 */
async function close() {
	if (db) {
		if (dbType === 'sqlite') {
			db.close();
		} else if (dbType === 'postgresql') {
			await db.end();
		}
		db = null;
	}
}

module.exports = {
	init,
	storeEvent,
	getStats,
	getEvents,
	getEventTypeStats,
	getSessions,
	getDailyStats,
	deleteEvent,
	deleteAllEvents,
	close
};
