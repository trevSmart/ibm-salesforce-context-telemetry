/**
 * Database storage module for telemetry events
 *
 * Supports multiple database backends:
 * - SQLite (default, for development and small deployments)
 * - PostgreSQL (for production)
 */

const fs = require('fs');
const path = require('path');

// Database configuration constants
const DEFAULT_MAX_DB_SIZE = 1024 * 1024 * 1024; // 1 GB in bytes
const VALID_ROLES = ['basic', 'advanced', 'administrator'];

let db = null;
let dbType = process.env.DB_TYPE || 'sqlite';

function normalizeRole(role) {
  const value = typeof role === 'string' ? role.toLowerCase() : '';
  return VALID_ROLES.includes(value) ? value : 'basic';
}

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

    // Create tables if they don't exist
    db.exec(`
			CREATE TABLE IF NOT EXISTS telemetry_events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				event TEXT NOT NULL,
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

			CREATE INDEX IF NOT EXISTS idx_event ON telemetry_events(event);
			CREATE INDEX IF NOT EXISTS idx_timestamp ON telemetry_events(timestamp);
			CREATE INDEX IF NOT EXISTS idx_server_id ON telemetry_events(server_id);
			CREATE INDEX IF NOT EXISTS idx_created_at ON telemetry_events(created_at);
			CREATE INDEX IF NOT EXISTS idx_username ON users(username);
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

    // Create tables if they don't exist
    await pool.query(`
			CREATE TABLE IF NOT EXISTS telemetry_events (
				id SERIAL PRIMARY KEY,
				event TEXT NOT NULL,
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

			CREATE INDEX IF NOT EXISTS idx_event ON telemetry_events(event);
			CREATE INDEX IF NOT EXISTS idx_timestamp ON telemetry_events(timestamp);
			CREATE INDEX IF NOT EXISTS idx_server_id ON telemetry_events(server_id);
			CREATE INDEX IF NOT EXISTS idx_created_at ON telemetry_events(created_at);
			CREATE INDEX IF NOT EXISTS idx_parent_session_id ON telemetry_events(parent_session_id);
			CREATE INDEX IF NOT EXISTS idx_username ON users(username);
		`);

    db = pool;
    console.log('PostgreSQL database initialized');
  } else {
    throw new Error(`Unsupported database type: ${dbType}`);
  }

  await ensureUserRoleColumn();
  await ensureTelemetryParentSessionColumn();
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
 * - If another START SESSION exists for same user+org within 3 hours, reuse that
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
				WHERE session_id = ? AND event = 'session_start'
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
				 WHERE session_id = $1 AND event = 'session_start'
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

  const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

  if (dbType === 'sqlite') {
    const lastStart = db.prepare(`
			SELECT timestamp, parent_session_id, session_id
			FROM telemetry_events
			WHERE event = 'session_start'
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
    if (diffMs <= THREE_HOURS_MS) {
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
  if (diffMs <= THREE_HOURS_MS) {
    return row.parent_session_id || row.session_id || normalizedSessionId;
  }

  return normalizedSessionId;
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
    const normalizedUserId = getNormalizedUserId(eventData);
    const parentSessionId = await computeParentSessionId(
      eventData,
      normalizedSessionId,
      normalizedUserId
    );

    if (dbType === 'sqlite') {
      const stmt = db.prepare(`
				INSERT INTO telemetry_events
				(event, timestamp, server_id, version, session_id, parent_session_id, user_id, data, received_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);

      stmt.run(
        eventData.event,
        eventData.timestamp,
        eventData.serverId || null,
        eventData.version || null,
        normalizedSessionId || null,
        parentSessionId || null,
        normalizedUserId || null,
        JSON.stringify(eventData.data || {}),
        receivedAt
      );
    } else if (dbType === 'postgresql') {
      await db.query(
        `INSERT INTO telemetry_events
				(event, timestamp, server_id, version, session_id, parent_session_id, user_id, data, received_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          eventData.event,
          eventData.timestamp,
          eventData.serverId || null,
          eventData.version || null,
          normalizedSessionId || null,
          parentSessionId || null,
          normalizedUserId || null,
          eventData.data || {},
          receivedAt
        ]
      );
    }

    // Extract and store company name if available
    if (eventData.serverId) {
      const companyName = extractCompanyName(eventData);
      if (companyName) {
        // Don't await to avoid blocking event storage
        upsertOrgCompanyName(eventData.serverId, companyName).catch(err => {
          console.error('Error storing company name:', err);
        });
      }
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
    // Filter by logical session: parent_session_id when set, otherwise raw session_id
    if (dbType === 'sqlite') {
      whereClause += ' AND (parent_session_id = ? OR (parent_session_id IS NULL AND session_id = ?))';
    } else {
      whereClause += ` AND (parent_session_id = $${paramIndex} OR (parent_session_id IS NULL AND session_id = $${paramIndex + 1}))`;
    }
    params.push(sessionId, sessionId);
    paramIndex += dbType === 'sqlite' ? 0 : 2;
  }
  if (startDate) {
    whereClause += dbType === 'sqlite' ? ' AND created_at >= ?' : ` AND created_at >= $${paramIndex++}`;
    params.push(startDate);
  }
  if (endDate) {
    whereClause += dbType === 'sqlite' ? ' AND created_at <= ?' : ` AND created_at <= $${paramIndex++}`;
    params.push(endDate);
  }
  if (options.userIds && Array.isArray(options.userIds) && options.userIds.length > 0) {
    const placeholders = options.userIds.map(() => {
      return dbType === 'sqlite' ? '?' : `$${paramIndex++}`;
    }).join(', ');
    whereClause += ` AND user_id IN (${placeholders})`;
    params.push(...options.userIds);
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
 * Get a single event by ID
 * @param {number} id - Event ID
 * @returns {Object|null} Event object or null if not found
 */
async function getEventById(id) {
  if (!db) {
    throw new Error('Database not initialized. Call init() first.');
  }

  if (dbType === 'sqlite') {
    const event = db.prepare('SELECT id, event, timestamp, server_id, version, session_id, user_id, data, received_at, created_at FROM telemetry_events WHERE id = ?').get(id);
    if (!event) {
      return null;
    }
    return {
      ...event,
      data: JSON.parse(event.data)
    };
  } else {
    const result = await db.query('SELECT id, event, timestamp, server_id, version, session_id, user_id, data, received_at, created_at FROM telemetry_events WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return null;
    }
    return result.rows[0];
  }
}

/**
 * Get event type statistics
 * @returns {Array} Statistics by event type
 */
async function getEventTypeStats(options = {}) {
  const { sessionId, userIds } = options || {};
  if (!db) {
    throw new Error('Database not initialized. Call init() first.');
  }

  if (dbType === 'sqlite') {
    let query = `
			SELECT event, COUNT(*) as count
			FROM telemetry_events
		`;
    const params = [];
    const conditions = [];
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
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += `
			GROUP BY event
			ORDER BY count DESC
		`;
    const stmt = db.prepare(query);
    const result = params.length ? stmt.all(...params) : stmt.all();
    return result;
  } else {
    let query = `
			SELECT event, COUNT(*) as count
			FROM telemetry_events
		`;
    const params = [];
    const conditions = [];
    let paramIndex = 1;
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
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += `
			GROUP BY event
			ORDER BY count DESC
		`;
    const result = await db.query(query, params);
    return result.rows.map(row => ({
      event: row.event,
      count: parseInt(row.count)
    }));
  }
}

/**
 * Get unique sessions with event counts
 * @param {object} options - Query options
 * @returns {Array} Sessions with count and latest timestamp
 */
async function getSessions(options = {}) {
  const { userIds } = options || {};
  if (!db) {
    throw new Error('Database not initialized. Call init() first.');
  }

  if (dbType === 'sqlite') {
    // Group by logical session: parent_session_id when available, otherwise session_id
    let whereClause = 'WHERE s.session_id IS NOT NULL OR s.parent_session_id IS NOT NULL';
    const params = [];
    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(', ');
      whereClause += ` AND s.user_id IN (${placeholders})`;
      params.push(...userIds);
    }
    const result = db.prepare(`
			SELECT
				COALESCE(s.parent_session_id, s.session_id) AS logical_session_id,
				COUNT(*) as count,
				MIN(s.timestamp) as first_event,
				MAX(s.timestamp) as last_event,
				(SELECT user_id FROM telemetry_events
				 WHERE COALESCE(parent_session_id, session_id) = COALESCE(s.parent_session_id, s.session_id)
				 ORDER BY timestamp ASC LIMIT 1) as user_id,
				(SELECT data FROM telemetry_events
				 WHERE COALESCE(parent_session_id, session_id) = COALESCE(s.parent_session_id, s.session_id)
				   AND event = 'session_start'
				 ORDER BY timestamp ASC LIMIT 1) as session_start_data,
				(SELECT COUNT(*) FROM telemetry_events
				 WHERE COALESCE(parent_session_id, session_id) = COALESCE(s.parent_session_id, s.session_id)
				   AND event = 'session_start') as has_start,
				(SELECT COUNT(*) FROM telemetry_events
				 WHERE COALESCE(parent_session_id, session_id) = COALESCE(s.parent_session_id, s.session_id)
				   AND event = 'session_end') as has_end
			FROM telemetry_events s
			${whereClause}
			GROUP BY COALESCE(s.parent_session_id, s.session_id)
			ORDER BY last_event DESC
		`).all(...params);
    return result.map(row => {
      let user_name = null;
      if (row.session_start_data) {
        try {
          const data = JSON.parse(row.session_start_data);
          // Try multiple paths: userName (camelCase), user_name (snake_case), or data.user.name (nested)
          if (data) {
            user_name = data.userName || data.user_name || (data.user && data.user.name) || null;
          }
        } catch (_e) {
          // If parsing fails, ignore and use user_id
        }
      }

      // Determine if session is active
      const hasStart = parseInt(row.has_start) > 0;
      const hasEnd = parseInt(row.has_end) > 0;
      const lastEvent = new Date(row.last_event);
      const now = new Date();
      const hoursSinceLastEvent = (now - lastEvent) / (1000 * 60 * 60);
      const isActive = hasStart && !hasEnd && hoursSinceLastEvent < 2;

      return {
        session_id: row.logical_session_id,
        count: parseInt(row.count),
        first_event: row.first_event,
        last_event: row.last_event,
        user_id: row.user_id,
        user_name: user_name,
        is_active: isActive
      };
    });
  } else {
    let whereClause = 'WHERE s.logical_session_id IS NOT NULL';
    const params = [];
    let paramIndex = 1;
    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      const placeholders = userIds.map(() => `$${paramIndex++}`).join(', ');
      whereClause += ` AND s.user_id IN (${placeholders})`;
      params.push(...userIds);
    }

    // Use a CTE to compute logical_session_id once, then group on that.
    // This avoids PostgreSQL errors about ungrouped columns in correlated subqueries.
    const result = await db.query(`
			WITH logical_sessions AS (
				SELECT
					COALESCE(parent_session_id, session_id) AS logical_session_id,
					id,
					event,
					timestamp,
					server_id,
					version,
					session_id,
					parent_session_id,
					user_id,
					data,
					received_at,
					created_at
				FROM telemetry_events
			)
			SELECT
				s.logical_session_id,
				COUNT(*) as count,
				MIN(s.timestamp) as first_event,
				MAX(s.timestamp) as last_event,
				(SELECT user_id FROM logical_sessions ls
				 WHERE ls.logical_session_id = s.logical_session_id
				 ORDER BY ls.timestamp ASC LIMIT 1) as user_id,
				(SELECT data FROM logical_sessions ls
				 WHERE ls.logical_session_id = s.logical_session_id
				   AND ls.event = 'session_start'
				 ORDER BY ls.timestamp ASC LIMIT 1) as session_start_data,
				(SELECT COUNT(*) FROM logical_sessions ls
				 WHERE ls.logical_session_id = s.logical_session_id
				   AND ls.event = 'session_start') as has_start,
				(SELECT COUNT(*) FROM logical_sessions ls
				 WHERE ls.logical_session_id = s.logical_session_id
				   AND ls.event = 'session_end') as has_end
			FROM logical_sessions s
			${whereClause}
			GROUP BY s.logical_session_id
			ORDER BY last_event DESC
		`, params);
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
        } catch (_e) {
          // If parsing fails, ignore and use user_id
        }
      }

      // Determine if session is active
      const hasStart = parseInt(row.has_start) > 0;
      const hasEnd = parseInt(row.has_end) > 0;
      const lastEvent = new Date(row.last_event);
      const now = new Date();
      const hoursSinceLastEvent = (now - lastEvent) / (1000 * 60 * 60);
      const isActive = hasStart && !hasEnd && hoursSinceLastEvent < 2;

      return {
        session_id: row.logical_session_id,
        count: parseInt(row.count),
        first_event: row.first_event,
        last_event: row.last_event,
        user_id: row.user_id,
        user_name: user_name,
        is_active: isActive
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
 * Delete all events for a specific session
 * @param {string} sessionId - Session identifier
 * @returns {Promise<number>} Number of deleted events
 */
async function deleteEventsBySession(sessionId) {
  if (!db) {
    throw new Error('Database not initialized. Call init() first.');
  }

  if (!sessionId) {
    throw new Error('Session ID is required to delete events by session');
  }

  if (dbType === 'sqlite') {
    const stmt = db.prepare('DELETE FROM telemetry_events WHERE session_id = ?');
    const result = stmt.run(sessionId);
    return result.changes;
  } else if (dbType === 'postgresql') {
    const result = await db.query('DELETE FROM telemetry_events WHERE session_id = $1', [sessionId]);
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
    const result = db.prepare(`
			SELECT
				date(timestamp, 'utc') as date,
				COUNT(*) as count
			FROM telemetry_events
			WHERE timestamp >= ?
			GROUP BY date(timestamp, 'utc')
			ORDER BY date ASC
		`).all(startDateISO);

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
  } else {
    // PostgreSQL: use DATE with UTC timezone to group by date using the event timestamp
    const result = await db.query(`
			SELECT
				DATE(timestamp AT TIME ZONE 'UTC') as date,
				COUNT(*) as count
			FROM telemetry_events
			WHERE timestamp >= $1
			GROUP BY DATE(timestamp AT TIME ZONE 'UTC')
			ORDER BY date ASC
		`, [startDateISO]);

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
			WHERE timestamp >= ? AND event = 'session_start'
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
			WHERE timestamp >= ? AND event IN ('tool_call', 'tool_error')
			GROUP BY date(timestamp, 'utc')
		`).all(startDateISO);

    const toolEventsMap = new Map();
    toolEvents.forEach(row => {
      let dateStr = String(row.date);
      dateStr = dateStr.split('T')[0].split(' ')[0];
      toolEventsMap.set(dateStr, parseInt(row.count));
    });

    // Get error events (tool_error only)
    const errorEvents = db.prepare(`
			SELECT
				date(timestamp, 'utc') as date,
				COUNT(*) as count
			FROM telemetry_events
			WHERE timestamp >= ? AND event = 'tool_error'
			GROUP BY date(timestamp, 'utc')
		`).all(startDateISO);

    const errorEventsMap = new Map();
    errorEvents.forEach(row => {
      let dateStr = String(row.date);
      dateStr = dateStr.split('T')[0].split(' ')[0];
      errorEventsMap.set(dateStr, parseInt(row.count));
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
  } else {
    // PostgreSQL
    // Get all session_start events
    const sessionStartsResult = await db.query(`
			SELECT
				DATE(timestamp AT TIME ZONE 'UTC') as date,
				session_id,
				id
			FROM telemetry_events
			WHERE timestamp >= $1 AND event = 'session_start'
		`, [startDateISO]);

    // Count all session_starts by date (regardless of whether they have an end)
    const startSessionsMap = new Map();
    sessionStartsResult.rows.forEach(row => {
      const dateValue = row.date instanceof Date
        ? row.date.toISOString().split('T')[0]
        : row.date.split('T')[0];
      startSessionsMap.set(dateValue, (startSessionsMap.get(dateValue) || 0) + 1);
    });

    // Get tool events (tool_call and tool_error)
    const toolEventsResult = await db.query(`
			SELECT
				DATE(timestamp AT TIME ZONE 'UTC') as date,
				COUNT(*) as count
			FROM telemetry_events
			WHERE timestamp >= $1 AND event IN ('tool_call', 'tool_error')
			GROUP BY DATE(timestamp AT TIME ZONE 'UTC')
		`, [startDateISO]);

    const toolEventsMap = new Map();
    toolEventsResult.rows.forEach(row => {
      const dateValue = row.date instanceof Date
        ? row.date.toISOString().split('T')[0]
        : row.date.split('T')[0];
      toolEventsMap.set(dateValue, parseInt(row.count));
    });

    // Get error events (tool_error only)
    const errorEventsResult = await db.query(`
			SELECT
				DATE(timestamp AT TIME ZONE 'UTC') as date,
				COUNT(*) as count
			FROM telemetry_events
			WHERE timestamp >= $1 AND event = 'tool_error'
			GROUP BY DATE(timestamp AT TIME ZONE 'UTC')
		`, [startDateISO]);

    const errorEventsMap = new Map();
    errorEventsResult.rows.forEach(row => {
      const dateValue = row.date instanceof Date
        ? row.date.toISOString().split('T')[0]
        : row.date.split('T')[0];
      errorEventsMap.set(dateValue, parseInt(row.count));
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
    const maxSize = process.env.DB_MAX_SIZE
      ? parseInt(process.env.DB_MAX_SIZE)
      : DEFAULT_MAX_DB_SIZE;

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
    const stmt = db.prepare('SELECT id, username, password_hash, role, created_at, last_login FROM users WHERE username = ?');
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
      } catch (_error) {
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
    const label = displayName && displayName.toLowerCase() !== normalizedId.toLowerCase()
      ? `${displayName} (${normalizedId})`
      : normalizedId;

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

module.exports = {
  init,
  storeEvent,
  getStats,
  getEvents,
  getEventById,
  getEventTypeStats,
  getSessions,
  getDailyStats,
  getDailyStatsByEventType,
  deleteEvent,
  deleteAllEvents,
  deleteEventsBySession,
  getDatabaseSize,
  close,
  DEFAULT_MAX_DB_SIZE,
  // User management
  getUserByUsername,
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
  // Event updates
  updateEventData,
  // User filtering
  getUniqueUserIds,
  // Session store
  getPostgresPool
};
