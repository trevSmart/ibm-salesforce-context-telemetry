import {parseV1Event} from './schema-v1-parser.js';
import {parseV2Event} from './schema-v2-parser.js';

/**
 * Parse telemetry event from any supported schema version to TelemetryEvent
 * Factory function that detects schema version and delegates to appropriate parser
 */

/**
 * Detect telemetry schema version from raw event
 * @param {object} rawEvent - Raw telemetry event
 * @returns {number|null} Schema version (1, 2) or null if cannot determine
 */
function detectSchemaVersion(rawEvent) {
  if (!rawEvent || typeof rawEvent !== 'object') {
    return null;
  }

  // Explicit schema version
  if (typeof rawEvent.schemaVersion === 'number') {
    return rawEvent.schemaVersion;
  }

  // V2 indicators
  if (rawEvent.area && ['tool', 'session', 'general'].includes(rawEvent.area)) {
    return 2;
  }

  // V1 indicators (has event field with v1 event types)
  const v1EventTypes = ['tool_call', 'tool_error', 'session_start', 'session_end', 'error', 'custom'];
  if (rawEvent.event && v1EventTypes.includes(rawEvent.event)) {
    return 1;
  }

  // Cannot determine version
  return null;
}

/**
 * Parse telemetry event from any supported schema version
 * @param {object} rawEvent - Raw telemetry event data
 * @returns {import('../telemetry-event.js').TelemetryEvent} Parsed TelemetryEvent instance
 * @throws {Error} If parsing fails or schema version is unsupported
 */
export function parseTelemetryEvent(rawEvent) {
  if (!rawEvent) {
    throw new Error('Cannot parse null or undefined event');
  }

  // Detect schema version
  const schemaVersion = detectSchemaVersion(rawEvent);

  if (schemaVersion === 1) {
    // Parse as v1 event
    return parseV1Event(rawEvent);
  } else if (schemaVersion === 2) {
    // Parse as v2 event
    return parseV2Event(rawEvent);
  } 
    // Unknown or invalid schema
    throw new Error(`Unsupported or invalid telemetry schema. Detected version: ${schemaVersion}. Event: ${JSON.stringify(rawEvent).substring(0, 200)}...`);
  
}

// Export individual parsers for testing or direct use
export {parseV1Event, parseV2Event};