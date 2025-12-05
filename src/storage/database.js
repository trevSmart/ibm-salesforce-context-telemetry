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
const MAX_LIMIT_FOR_TOTAL_COMPUTATION = 100; // Skip expensive COUNT queries for large limits

let db = null;
let dbType = process.env.DB_TYPE || 'sqlite';
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
    const Database = require('better-sqlite3');
    const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'telemetry.db');

    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
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

			CREATE TABLE IF NOT EXISTS settings (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL,
				updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			);

			CREATE INDEX IF NOT EXISTS idx_event ON telemetry_events(event);
			CREATE INDEX IF NOT EXISTS idx_timestamp ON telemetry_events(timestamp);
			CREATE INDEX IF NOT EXISTS idx_server_id ON telemetry_events(server_id);
			CREATE INDEX IF NOT EXISTS idx_created_at ON telemetry_events(created_at);
			CREATE INDEX IF NOT EXISTS idx_session_id ON telemetry_events(session_id);
			CREATE INDEX IF NOT EXISTS idx_user_id ON telemetry_events(user_id);
			CREATE INDEX IF NOT EXISTS idx_parent_session_id ON telemetry_events(parent_session_id);
			CREATE INDEX IF NOT EXISTS idx_username ON users(username);
			CREATE INDEX IF NOT EXISTS idx_event_created_at ON telemetry_events(event, created_at);
			CREATE INDEX IF NOT EXISTS idx_user_created_at ON telemetry_events(user_id, created_at);
		`);

    console.log(`SQLite database initialized at: ${dbPath}`);
  } else if (dbType === 'postgresql') {
    const { Pool } = require('pg');

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
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

			CREATE TABLE IF NOT EXISTS settings (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL,
				updated_at TIMESTAMPTZ DEFAULT NOW(),
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE INDEX IF NOT EXISTS idx_event ON telemetry_events(event);
			CREATE INDEX IF NOT EXISTS idx_timestamp ON telemetry_events(timestamp);
			CREATE INDEX IF NOT EXISTS idx_server_id ON telemetry_events(server_id);
			CREATE INDEX IF NOT EXISTS idx_created_at ON telemetry_events(created_at);
			CREATE INDEX IF NOT EXISTS idx_session_id ON telemetry_events(session_id);
			CREATE INDEX IF NOT EXISTS idx_user_id ON telemetry_events(user_id);
			CREATE INDEX IF NOT EXISTS idx_parent_session_id ON telemetry_events(parent_session_id);
			CREATE INDEX IF NOT EXISTS idx_username ON users(username);
			CREATE INDEX IF NOT EXISTS idx_event_created_at ON telemetry_events(event, created_at);
			CREATE INDEX IF NOT EXISTS idx_user_created_at ON telemetry_events(user_id, created_at);
		`);

    db = pool;
    console.log('PostgreSQL database initialized');
  } else {
    throw new Error(`Unsupported database type: ${dbType}`);
  }

  await ensureUserRoleColumn();
  await ensureTelemetryParentSessionColumn();
  await ensureDenormalizedColumns();
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

function buildUserLabel(userId, rawData) {
  let parsedData = null;
  if (rawData) {
    try {
      parsedData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
    } catch (_error) {
      parsedData = null;
    }
  }

  const displayName = extractUserDisplayName(parsedData || {});
  if (displayName) {
    return displayName;
  }

  const normalizedFromData = getNormalizedUserId({ data: parsedData });
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
function extractOrgId(eventData = {}) {
  if (!eventData || !eventData.data) {
    return null;
  }

  const data = eventData.data;

  // New format: data.state.org.id
  if (data.state && data.state.org && data.state.org.id) {
    const orgId = data.state.org.id;
    if (typeof orgId === 'string' && orgId.trim() !== '') {
      return orgId.trim();
    }
  }

  // Legacy format: data.orgId
  if (data.orgId && typeof data.orgId === 'string') {
    const orgId = data.orgId.trim();
    if (orgId !== '') {
      return orgId;
    }
  }

  return null;
}

/**
 * Extract tool name from telemetry event data
 * @param {object} eventData - The telemetry event data
 * @returns {string|null} Tool name or null if not found
 */
function extractToolName(eventData = {}) {
  if (!eventData || !eventData.data) {
    return null;
  }

  const data = eventData.data;

  // Try data.toolName first (most common)
  if (data.toolName && typeof data.toolName === 'string') {
    const toolName = data.toolName.trim();
    if (toolName !== '') {
      return toolName;
    }
  }

  // Try data.tool as fallback
  if (data.tool && typeof data.tool === 'string') {
    const toolName = data.tool.trim();
    if (toolName !== '') {
      return toolName;
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
    const allowMissingUser = eventData?.allowMissingUser === true;

    if (!normalizedUserId && !allowMissingUser) {
      console.warn('Dropping telemetry event without username/userId');
      return false;
    }

    const parentSessionId = await computeParentSessionId(
      eventData,
      normalizedSessionId,
      normalizedUserId
    );

    // Extract denormalized fields for faster queries
    const orgId = extractOrgId(eventData);
    const userName = extractUserDisplayName(eventData.data || {});
    const toolName = extractToolName(eventData);

    if (dbType === 'sqlite') {
      const stmt = getPreparedStatement('insertEvent', `
				INSERT INTO telemetry_events
				(event, timestamp, server_id, version, session_id, parent_session_id, user_id, data, received_at, org_id, user_name, tool_name)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        receivedAt,
        orgId,
        userName,
        toolName
      );
    } else if (dbType === 'postgresql') {
      await db.query(
        `INSERT INTO telemetry_events
				(event, timestamp, server_id, version, session_id, parent_session_id, user_id, data, received_at, org_id, user_name, tool_name)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          eventData.event,
          eventData.timestamp,
          eventData.serverId || null,
          eventData.version || null,
          normalizedSessionId || null,
          parentSessionId || null,
          normalizedUserId || null,
          eventData.data || {},
          receivedAt,
          orgId,
          userName,
          toolName
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

    return true;
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
    // Use prepared statement for common case (no filters)
    if (!startDate && !endDate && !eventType) {
      const stmt = getPreparedStatement('getStatsTotal', 'SELECT COUNT(*) as total FROM telemetry_events');
      return { total: stmt.get().total };
    }

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

  // Get total count (optimize by skipping if not needed)
  let total = 0;
  // Only compute total if it's a reasonable query (not too expensive)
  // We compute total when:
  // 1. offset === 0: First page, total is useful for pagination UI
  // 2. limit <= MAX_LIMIT_FOR_TOTAL_COMPUTATION: Small result set, COUNT is fast
  const shouldComputeTotal = offset === 0 || limit <= MAX_LIMIT_FOR_TOTAL_COMPUTATION;

  if (shouldComputeTotal) {
    let countQuery = `SELECT COUNT(*) as total FROM telemetry_events ${whereClause}`;
    if (dbType === 'sqlite') {
      total = db.prepare(countQuery).get(...params).total;
    } else {
      const countResult = await db.query(countQuery, params);
      total = parseInt(countResult.rows[0].total);
    }
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
    // Use optimized query with CTEs and aggregations instead of correlated subqueries
    let whereClause = 'WHERE session_id IS NOT NULL OR parent_session_id IS NOT NULL';
    const params = [];
    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(', ');
      whereClause += ` AND user_id IN (${placeholders})`;
      params.push(...userIds);
    }
    const result = db.prepare(`
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
				 ORDER BY timestamp ASC LIMIT 1) as user_id,
				(SELECT data FROM telemetry_events
				 WHERE COALESCE(parent_session_id, session_id) = sa.logical_session_id
				   AND event = 'session_start'
				 ORDER BY timestamp ASC LIMIT 1) as session_start_data,
				sa.has_start,
				sa.has_end
			FROM session_aggregates sa
			ORDER BY sa.last_event DESC
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
    let whereClause = 'WHERE session_id IS NOT NULL OR parent_session_id IS NOT NULL';
    const params = [];
    let paramIndex = 1;
    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      const placeholders = userIds.map(() => `$${paramIndex++}`).join(', ');
      whereClause += ` AND user_id IN (${placeholders})`;
      params.push(...userIds);
    }

    // Use optimized query with CTEs and aggregations instead of correlated subqueries
    const result = await db.query(`
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
				 ORDER BY timestamp ASC LIMIT 1) as user_id,
				(SELECT data FROM telemetry_events
				 WHERE COALESCE(parent_session_id, session_id) = sa.logical_session_id
				   AND event = 'session_start'
				 ORDER BY timestamp ASC LIMIT 1) as session_start_data,
				sa.has_start,
				sa.has_end
			FROM session_aggregates sa
			ORDER BY sa.last_event DESC
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
    const stmt = getPreparedStatement('getDailyStats', `
			SELECT
				date(timestamp, 'utc') as date,
				COUNT(*) as count
			FROM telemetry_events
			WHERE timestamp >= ?
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
          stmt.finalize();
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

  const safeLimit = Math.min(Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 50), 500);
  const safeDays = Math.min(Math.max(1, Number.isFinite(days) ? Math.floor(days) : 3), 365);
  const lookbackModifier = `-${safeDays} days`;

  const normalizeOrgId = (orgId) => String(orgId || '').trim().toLowerCase();
  const normalizeTeamKey = (teamName) => String(teamName || '').trim().toLowerCase();

  // Build lookups so multiple orgs that point to the same team name are grouped
  const orgToTeamKey = new Map(); // normalized org id -> normalized team key
  const teamAggregates = new Map(); // normalized team key -> aggregate info
  if (Array.isArray(orgTeamMappings)) {
    orgTeamMappings.forEach(mapping => {
      const isActive = mapping?.active !== false;
      const rawTeamName = String(mapping?.teamName || '').trim();
      const rawOrgId = normalizeOrgId(mapping?.orgIdentifier);
      if (!isActive || !rawTeamName || !rawOrgId) {
        return;
      }

      const teamKey = normalizeTeamKey(rawTeamName);
      if (!teamAggregates.has(teamKey)) {
        teamAggregates.set(teamKey, {
          key: teamKey,
          teamName: rawTeamName,
          color: String(mapping?.color || '').trim(),
          clients: new Set(),
          orgIds: new Set(),
          eventCount: 0
        });
      }

      const entry = teamAggregates.get(teamKey);
      entry.orgIds.add(rawOrgId);
      orgToTeamKey.set(rawOrgId, teamKey);

      const clientName = String(mapping?.clientName || '').trim();
      if (clientName) {
        entry.clients.add(clientName);
      }

      if (!entry.color && mapping?.color) {
        entry.color = String(mapping.color).trim();
      }
    });
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
				AND TRIM(org_id) != ''
			GROUP BY org_id
			ORDER BY event_count DESC, org_id ASC
			LIMIT ?
		`).all(lookbackModifier, safeLimit);

    aggregated.forEach(row => {
      const orgId = row.org_id;
      if (orgId) {
        orgIdCounts.set(orgId, parseInt(row.event_count) || 0);
      }
    });
  } else if (dbType === 'postgresql') {
    // Use denormalized org_id column for faster queries
    const aggregated = await db.query(
      `
				SELECT org_id, COUNT(*) AS event_count
				FROM telemetry_events
				WHERE created_at >= (NOW() - ($2 || ' days')::interval)
					AND org_id IS NOT NULL
					AND TRIM(org_id) != ''
				GROUP BY org_id
				ORDER BY event_count DESC, org_id ASC
				LIMIT $1
			`,
      [safeLimit, String(safeDays)]
    );

    aggregated.rows.forEach(row => {
      const orgId = row.org_id;
      if (orgId) {
        orgIdCounts.set(orgId, parseInt(row.event_count) || 0);
      }
    });
  }

  // Convert to array, sort by count, and apply limit
  const sortedOrgs = Array.from(orgIdCounts.entries())
    .map(([orgId, count]) => ({ orgId, count }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.orgId.localeCompare(b.orgId);
    })
    .slice(0, safeLimit);

  // Map to team info and add to results
  sortedOrgs.forEach(({ orgId, count }) => {
    const normalizedOrgId = normalizeOrgId(orgId);
    const teamKey = orgToTeamKey.get(normalizedOrgId);
    if (!teamKey) {
      return;
    }
    const teamEntry = teamAggregates.get(teamKey);
    if (teamEntry) {
      teamEntry.eventCount += count;
    }
  });

  // Convert aggregates to sorted array and apply limit
  Array.from(teamAggregates.values()).forEach(teamEntry => {
    if (teamEntry.eventCount <= 0) {
      return;
    }
    const clients = Array.from(teamEntry.clients);
    results.push({
      id: teamEntry.key,
      label: teamEntry.teamName,
      clientName: clients.join(' · '),
      color: teamEntry.color,
      eventCount: teamEntry.eventCount
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
        console.log('Added org_id column to telemetry_events');
      }

      // Add user_name column if it doesn't exist
      if (!columnNames.includes('user_name')) {
        db.exec('ALTER TABLE telemetry_events ADD COLUMN user_name TEXT');
        console.log('Added user_name column to telemetry_events');
      }

      // Add tool_name column if it doesn't exist
      if (!columnNames.includes('tool_name')) {
        db.exec('ALTER TABLE telemetry_events ADD COLUMN tool_name TEXT');
        console.log('Added tool_name column to telemetry_events');
      }

      // Create indexes for denormalized columns (if they don't exist)
      db.exec('CREATE INDEX IF NOT EXISTS idx_user_name_created_at ON telemetry_events(user_name, created_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_org_id_created_at ON telemetry_events(org_id, created_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_tool_name_created_at ON telemetry_events(tool_name, created_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_user_name_tool_name_created_at ON telemetry_events(user_name, tool_name, created_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_org_id_tool_name_created_at ON telemetry_events(org_id, tool_name, created_at)');
    } else if (dbType === 'postgresql') {
      // PostgreSQL supports IF NOT EXISTS in ALTER TABLE
      await db.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS org_id TEXT');
      await db.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS user_name TEXT');
      await db.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS tool_name TEXT');
      console.log('Ensured denormalized columns (org_id, user_name, tool_name) in telemetry_events');

      // Create indexes for denormalized columns (if they don't exist)
      await db.query('CREATE INDEX IF NOT EXISTS idx_user_name_created_at ON telemetry_events(user_name, created_at)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_org_id_created_at ON telemetry_events(org_id, created_at)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_tool_name_created_at ON telemetry_events(tool_name, created_at)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_user_name_tool_name_created_at ON telemetry_events(user_name, tool_name, created_at)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_org_id_tool_name_created_at ON telemetry_events(org_id, tool_name, created_at)');

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
 * Populate denormalized columns from JSON data for existing records
 * This is called after adding the columns to backfill existing data
 */
async function populateDenormalizedColumns() {
  if (!db) {
    return;
  }

  try {
    // Check if we need to populate (only if there are records with NULL values in new columns)
    let needsPopulation = false;

    if (dbType === 'sqlite') {
      const result = db.prepare(`
        SELECT COUNT(*) as count
        FROM telemetry_events
        WHERE (org_id IS NULL OR user_name IS NULL OR tool_name IS NULL)
          AND data IS NOT NULL
          AND data != ''
        LIMIT 1
      `).get();
      needsPopulation = result && result.count > 0;
    } else if (dbType === 'postgresql') {
      const result = await db.query(`
        SELECT COUNT(*) as count
        FROM telemetry_events
        WHERE (org_id IS NULL OR user_name IS NULL OR tool_name IS NULL)
          AND data IS NOT NULL
        LIMIT 1
      `);
      needsPopulation = result.rows.length > 0 && parseInt(result.rows[0].count) > 0;
    }

    if (!needsPopulation) {
      return; // No data to populate
    }

    console.log('Populating denormalized columns from existing data...');

    if (dbType === 'sqlite') {
      // For SQLite, we'll update in batches to avoid locking
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const rows = db.prepare(`
          SELECT id, data
          FROM telemetry_events
          WHERE (org_id IS NULL OR user_name IS NULL OR tool_name IS NULL)
            AND data IS NOT NULL
            AND data != ''
          LIMIT ? OFFSET ?
        `).all(batchSize, offset);

        if (rows.length === 0) {
          hasMore = false;
          break;
        }

        const updateStmt = db.prepare(`
          UPDATE telemetry_events
          SET org_id = ?, user_name = ?, tool_name = ?
          WHERE id = ?
        `);

        for (const row of rows) {
          try {
            const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
            const orgId = extractOrgId({ data });
            const userName = extractUserDisplayName(data);
            const toolName = extractToolName({ data });

            updateStmt.run(orgId, userName, toolName, row.id);
          } catch (error) {
            // Skip invalid JSON
            console.warn(`Error parsing data for event ${row.id}:`, error.message);
          }
        }

        offset += batchSize;
        if (rows.length < batchSize) {
          hasMore = false;
        }
      }
    } else if (dbType === 'postgresql') {
      // For PostgreSQL, use a single UPDATE with JSON extraction
      await db.query(`
        UPDATE telemetry_events
        SET
          org_id = COALESCE(
            data->>'orgId',
            data->'state'->'org'->>'id'
          ),
          user_name = COALESCE(
            data->>'userName',
            data->>'user_name',
            data->'user'->>'name'
          ),
          tool_name = COALESCE(
            data->>'toolName',
            data->>'tool'
          )
        WHERE (org_id IS NULL OR user_name IS NULL OR tool_name IS NULL)
          AND data IS NOT NULL
      `);
    }

    console.log('Finished populating denormalized columns');
  } catch (error) {
    console.error('Error populating denormalized columns:', error);
  }
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
  getTopUsersLastDays,
  getTopTeamsLastDays,
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
  getPostgresPool,
  // Settings
  getSetting,
  saveSetting,
  // Utilities
  getNormalizedUserId
};
