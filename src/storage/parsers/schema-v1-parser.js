import {TelemetryEvent} from '../telemetry-event.js';

/**
 * Parse schema v1 telemetry events to TelemetryEvent instances
 * Schema v1 has flat structure, so we need to transform it to v2 structure
 */

/**
 * Map v1 event type to v2 area and event
 * @param {string} eventType - V1 event type ('tool_call', 'tool_error', etc.)
 * @param {object} data - Event data to determine more specific mapping
 * @returns {object} {area, event}
 */
function mapV1EventToV2Structure(eventType, data = {}) {
  switch (eventType) {
    case 'tool_call':
      return {area: 'tool', event: 'execution'};

    case 'tool_error':
      // Check if it's a validation error
      if (data.isValidationError || data.errorType === 'ZodError') {
        return {area: 'tool', event: 'validation'};
      }
      return {area: 'tool', event: 'execution'};

    case 'session_start':
      return {area: 'session', event: 'session_start'};

    case 'session_end':
      return {area: 'session', event: 'session_end'};

    case 'error':
      return {area: 'general', event: 'error_occurred'};

    case 'custom':
      return {area: 'general', event: 'custom'};

    default:
      // Unknown event type, map to general/custom
      return {area: 'general', event: 'custom'};
  }
}

/**
 * Determine success based on v1 event type and data
 * @param {string} eventType - V1 event type
 * @param {object} data - Event data
 * @returns {boolean} Success status
 */
function determineSuccess(eventType, data = {}) {
  switch (eventType) {
    case 'tool_call':
      return true;

    case 'tool_error':
      return false;

    case 'session_start':
      return true;

    case 'session_end':
      return true;

    case 'error':
      return false;

    case 'custom':
      // For custom events, check if data indicates success
      return data.success !== false; // Default to true unless explicitly false

    default:
      return true; // Default to success for unknown types
  }
}

/**
 * Extract structured objects from v1 flat format
 * @param {object} rawEvent - Raw v1 event
 * @returns {object} {server, client, session, user}
 */
function extractStructuredObjects(rawEvent) {
  const {serverId, version, sessionId, userId, data = {}} = rawEvent;

  // Server object
  const server = (serverId || version) ? {
    id: serverId || null,
    version: version || null,
    capabilities: {} // v1 doesn't have capabilities
  } : null;

  // Client object - v1 doesn't have client info, but we can infer from data
  const client = null; // v1 doesn't have structured client info

  // Session object
  const session = sessionId ? {
    id: sessionId,
    transport: data.transport || null,
    protocolVersion: null // v1 doesn't specify protocol version
  } : null;

  // User object
  const user = userId ? {
    id: userId
  } : null;

  return {server, client, session, user};
}

/**
 * Validate v1 event structure (basic validation)
 * @param {object} rawEvent - Raw v1 event
 * @throws {Error} If validation fails
 */
function validateV1Structure(rawEvent) {
  if (!rawEvent || typeof rawEvent !== 'object') {
    throw new Error('V1 event must be an object');
  }

  // Required fields for v1
  if (!rawEvent.event || !rawEvent.timestamp) {
    throw new Error('V1 event missing required fields: event and timestamp');
  }

  // Validate event type
  const validEvents = ['tool_call', 'tool_error', 'session_start', 'session_end', 'error', 'custom'];
  if (!validEvents.includes(rawEvent.event)) {
    throw new Error(`Invalid v1 event type: ${rawEvent.event}`);
  }

  // Validate timestamp
  if (typeof rawEvent.timestamp !== 'string') {
    throw new Error('timestamp must be a string');
  }

  // Optional field validations
  if (rawEvent.serverId && typeof rawEvent.serverId !== 'string') {
    throw new Error('serverId must be a string if present');
  }
  if (rawEvent.version && typeof rawEvent.version !== 'string') {
    throw new Error('version must be a string if present');
  }
  if (rawEvent.sessionId && typeof rawEvent.sessionId !== 'string') {
    throw new Error('sessionId must be a string if present');
  }
  if (rawEvent.userId && typeof rawEvent.userId !== 'string') {
    throw new Error('userId must be a string if present');
  }
  if (rawEvent.data && typeof rawEvent.data !== 'object') {
    throw new Error('data must be an object if present');
  }
}

/**
 * Parse a schema v1 event to TelemetryEvent
 * @param {object} rawEvent - Raw v1 event data
 * @returns {TelemetryEvent} Parsed TelemetryEvent instance
 * @throws {Error} If parsing fails
 */
export function parseV1Event(rawEvent) {
  // Validate structure
  validateV1Structure(rawEvent);

  // Map v1 to v2 structure
  const {area, event} = mapV1EventToV2Structure(rawEvent.event, rawEvent.data);

  // Determine success
  const success = determineSuccess(rawEvent.event, rawEvent.data);

  // Extract structured objects
  const {server, client, session, user} = extractStructuredObjects(rawEvent);

  // Create TelemetryEvent
  const telemetryEvent = new TelemetryEvent({
    area,
    event,
    success,
    timestamp: rawEvent.timestamp,
    telemetrySchemaVersion: 1, // This is a v1 event

    // Structured objects
    server,
    client,
    session,
    user,

    // Event data - keep as is for compatibility
    data: rawEvent.data || {},

    // Server info (will be set later)
    receivedAt: null
  });

  return telemetryEvent;
}