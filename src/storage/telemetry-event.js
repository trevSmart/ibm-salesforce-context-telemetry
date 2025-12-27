/**
 * TelemetryEvent class - Canonical representation of telemetry events
 *
 * Based on schema v2 structure, agnostic about data source format (v1 or v2).
 * Provides methods for accessing normalized data and calculating derived fields.
 */
export class TelemetryEvent {
  // Core v2 structure
  area;              // 'tool' | 'session' | 'general'
  event;             // string (moment within area)
  success;           // boolean
  timestamp;         // ISO string
  telemetrySchemaVersion; // 1 | 2 | null (from original request)

  // Structured objects (v2 style)
  server;            // { id, version, capabilities }
  client;            // { name, version, capabilities } | null
  session;           // { id, transport, protocolVersion }
  user;              // { id } | null

  // Event-specific data
  data;              // object

  // Server-added info
  receivedAt;        // ISO string

  // Denormalized fields (calculated)
  eventType;         // 'tool_call' | 'tool_error' | etc. (for DB compatibility)
  orgId;             // string | null
  userName;          // string | null
  toolName;          // string | null
  companyName;       // string | null
  errorMessage;      // string | null

  /**
   * Constructor - creates TelemetryEvent from raw v2-like structure
   * @param {object} raw - Raw event data in v2 format
   */
  constructor(raw = {}) {
    this.validateStructure(raw);

    // Core fields
    this.area = raw.area;
    this.event = raw.event;
    this.success = raw.success;
    this.timestamp = raw.timestamp;
    this.telemetrySchemaVersion = raw.telemetrySchemaVersion || null;

    // Structured objects
    this.server = raw.server || null;
    this.client = raw.client || null;
    this.session = raw.session || null;
    this.user = raw.user || null;

    // Event data
    this.data = raw.data || {};

    // Server info (set later)
    this.receivedAt = raw.receivedAt || null;

    // Calculate derived fields
    this.calculateDerivedFields();
  }

  /**
   * Validate minimum required structure
   * @param {object} raw - Raw event data
   * @throws {Error} If structure is invalid
   */
  validateStructure(raw) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('TelemetryEvent requires an object');
    }

    if (!raw.area || !raw.event || typeof raw.success !== 'boolean' || !raw.timestamp) {
      throw new Error('TelemetryEvent requires area, event, success (boolean), and timestamp');
    }

    // Validate area
    if (!['tool', 'session', 'general'].includes(raw.area)) {
      throw new Error(`Invalid area: ${raw.area}. Must be 'tool', 'session', or 'general'`);
    }

    // Validate timestamp format (basic check)
    if (typeof raw.timestamp !== 'string') {
      throw new Error('Timestamp must be a string');
    }
  }

  /**
   * Calculate derived fields from core data
   */
  calculateDerivedFields() {
    this.eventType = this.calculateEventType();
    const denormalized = this.extractDenormalizedFields();
    this.orgId = denormalized.orgId;
    this.userName = denormalized.userName;
    this.toolName = denormalized.toolName;
    this.companyName = denormalized.companyName;
    this.errorMessage = denormalized.errorMessage;
  }

  /**
   * Calculate eventType for database compatibility
   * Maps area + event + success to legacy event types
   * @returns {string} Event type for database
   */
  calculateEventType() {
    if (this.area === 'tool') {
      if (this.event === 'execution' || this.event === 'response') {
        return this.success ? 'tool_call' : 'tool_error';
      }
      if (this.event === 'validation') {
        return 'tool_error'; // Validation errors are always errors
      }
    }

    if (this.area === 'session') {
      if (['session_start', 'server_boot', 'client_connect'].includes(this.event)) {
        return 'session_start';
      }
      if (this.event === 'session_end') {
        return 'session_end';
      }
    }

    if (this.area === 'general') {
      if (this.event === 'error_occurred') {
        return 'error';
      }
      return 'custom'; // Other general events
    }

    return 'custom'; // Fallback
  }

  /**
   * Extract denormalized fields from data for faster queries
   * @returns {object} Denormalized fields
   */
  extractDenormalizedFields() {
    const result = {
      orgId: null,
      userName: null,
      toolName: null,
      companyName: null,
      errorMessage: null
    };

    if (!this.data || typeof this.data !== 'object') {
      return result;
    }

    const data = this.data;

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

    // Extract userName (from data or user object)
    result.userName = this.extractUserName();

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
   * Extract user name from various sources
   * @returns {string|null} User name or null
   */
  extractUserName() {
    // From user object (v2 style)
    if (this.user?.name && typeof this.user.name === 'string') {
      return this.user.name.trim() || null;
    }

    // From user id if it looks like a name
    if (this.user?.id && typeof this.user.id === 'string') {
      const id = this.user.id.trim();
      // If it contains spaces or looks like an email/name, use it
      if (id.includes(' ') || id.includes('@') || id.length > 20) {
        return id;
      }
    }

    // From data (legacy style)
    if (!this.data || typeof this.data !== 'object') {
      return null;
    }

    const data = this.data;

    // Try multiple paths: userName (camelCase), user_name (snake_case), or data.user.name (nested)
    if (typeof data.userName === 'string' && data.userName.trim() !== '') {
      return data.userName.trim();
    }
    if (typeof data.user_name === 'string' && data.user_name.trim() !== '') {
      return data.user_name.trim();
    }
    if (data.user && typeof data.user === 'object' && typeof data.user.name === 'string' && data.user.name.trim() !== '') {
      return data.user.name.trim();
    }

    return null;
  }

  // Getter methods for normalized access

  getServerId() {
    return this.server?.id || null;
  }

  getVersion() {
    return this.server?.version || null;
  }

  getSessionId() {
    return this.session?.id || null;
  }

  getUserId() {
    return this.user?.id || null;
  }

  /**
   * Get a summary representation for logging/debugging
   * @returns {object} Summary object
   */
  toSummary() {
    return {
      area: this.area,
      event: this.event,
      success: this.success,
      eventType: this.eventType,
      serverId: this.getServerId(),
      sessionId: this.getSessionId(),
      userId: this.getUserId(),
      timestamp: this.timestamp
    };
  }

  /**
   * Convert to plain object for serialization
   * @returns {object} Plain object representation
   */
  toJSON() {
    return {
      area: this.area,
      event: this.event,
      success: this.success,
      timestamp: this.timestamp,
      telemetrySchemaVersion: this.telemetrySchemaVersion,
      server: this.server,
      client: this.client,
      session: this.session,
      user: this.user,
      data: this.data,
      receivedAt: this.receivedAt,
      // Include denormalized fields for debugging
      eventType: this.eventType,
      orgId: this.orgId,
      userName: this.userName,
      toolName: this.toolName,
      companyName: this.companyName,
      errorMessage: this.errorMessage
    };
  }
}