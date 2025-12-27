import {TelemetryEvent} from '../telemetry-event.js';

/**
 * Parse schema v2 telemetry events to TelemetryEvent instances
 * Schema v2 is already close to TelemetryEvent structure, so this is mainly validation and mapping
 */

/**
 * Validate v2 event structure (basic validation)
 * @param {object} rawEvent - Raw v2 event
 * @throws {Error} If validation fails
 */
function validateV2Structure(rawEvent) {
  if (!rawEvent || typeof rawEvent !== 'object') {
    throw new Error('V2 event must be an object');
  }

  // Required fields
  const required = ['schemaVersion', 'area', 'event', 'success', 'timestamp'];
  for (const field of required) {
    if (!(field in rawEvent)) {
      throw new Error(`V2 event missing required field: ${field}`);
    }
  }

  // Validate schemaVersion
  if (rawEvent.schemaVersion !== 2) {
    throw new Error(`Invalid schemaVersion: ${rawEvent.schemaVersion}. Expected 2`);
  }

  // Validate area
  if (!['tool', 'session', 'general'].includes(rawEvent.area)) {
    throw new Error(`Invalid area: ${rawEvent.area}. Must be 'tool', 'session', or 'general'`);
  }

  // Validate success
  if (typeof rawEvent.success !== 'boolean') {
    throw new Error('success must be a boolean');
  }

  // Validate timestamp
  if (typeof rawEvent.timestamp !== 'string') {
    throw new Error('timestamp must be a string');
  }

  // Validate structured objects (if present)
  if (rawEvent.server && typeof rawEvent.server !== 'object') {
    throw new Error('server must be an object if present');
  }
  if (rawEvent.client && rawEvent.client !== null && typeof rawEvent.client !== 'object') {
    throw new Error('client must be an object or null if present');
  }
  if (rawEvent.session && typeof rawEvent.session !== 'object') {
    throw new Error('session must be an object if present');
  }
  if (rawEvent.user && rawEvent.user !== null && typeof rawEvent.user !== 'object') {
    throw new Error('user must be an object or null if present');
  }

  // Validate data
  if (rawEvent.data && typeof rawEvent.data !== 'object') {
    throw new Error('data must be an object if present');
  }
}

/**
 * Parse a schema v2 event to TelemetryEvent
 * @param {object} rawEvent - Raw v2 event data
 * @returns {TelemetryEvent} Parsed TelemetryEvent instance
 * @throws {Error} If parsing fails
 */
export function parseV2Event(rawEvent) {
  // Validate structure
  validateV2Structure(rawEvent);

  // Create TelemetryEvent - v2 format maps almost directly
  const telemetryEvent = new TelemetryEvent({
    area: rawEvent.area,
    event: rawEvent.event,
    success: rawEvent.success,
    timestamp: rawEvent.timestamp,
    telemetrySchemaVersion: rawEvent.schemaVersion, // Should be 2

    // Structured objects
    server: rawEvent.server || null,
    client: rawEvent.client || null,
    session: rawEvent.session || null,
    user: rawEvent.user || null,

    // Event data
    data: rawEvent.data || {},

    // Server info (will be set later)
    receivedAt: null
  });

  return telemetryEvent;
}