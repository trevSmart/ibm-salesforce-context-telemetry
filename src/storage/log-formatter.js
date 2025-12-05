/**
 * Log formatter module - JSON Lines (JSONL) format
 *
 * JSON Lines (JSONL) is the most widely adopted standard for structured logging.
 * Compatible with: ELK Stack, Splunk, Datadog, CloudWatch, Grafana Loki, BigQuery,
 * MongoDB, PostgreSQL, Elasticsearch, Kafka, and many other tools.
 *
 * Format specification: http://jsonlines.org/
 */

/**
 * Format event as JSON Lines (JSONL) - one JSON object per line
 *
 * @param {object} event - Telemetry event from database
 * @returns {string} JSONL formatted line
 */
function formatAsJSONL(event) {
  const logEntry = {
    '@timestamp': event.timestamp || event.created_at,
    '@version': '1',
    event: event.event,
    message: `Telemetry event: ${event.event}`,
    fields: {
      id: event.id,
      serverId: event.server_id,
      version: event.version,
      sessionId: event.session_id,
      userId: event.user_id,
      receivedAt: event.received_at,
      createdAt: event.created_at
    },
    data: event.data || {}
  };

  return JSON.stringify(logEntry);
}

/**
 * Format events as JSON Lines (JSONL)
 *
 * @param {Array} events - Array of telemetry events
 * @returns {string} Formatted logs as JSONL string
 */
function formatEvents(events) {
  return events.map(event => formatAsJSONL(event)).join('\n');
}

module.exports = {
  formatAsJSONL,
  formatEvents
};
