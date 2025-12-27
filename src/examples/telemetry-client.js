/**
 * Example telemetry client for MCP servers
 *
 * This is a reference implementation showing how to send telemetry
 * from an MCP server to the telemetry collection server.
 *
 * Usage:
 *   const { sendTelemetry } = require('./telemetry-client');
 *   await sendTelemetry('tool_call', { toolName: 'my_tool', success: true });
 */

const TELEMETRY_ENDPOINT = process.env.TELEMETRY_ENDPOINT ||
  'https://ibm-salesforce-context-telemetry.onrender.com/telemetry';

const DEFAULT_TIMEOUT = 2000; // 2 seconds

/**
 * Sends a telemetry event to the telemetry server
 *
 * @param {string} event - Event type (e.g., 'tool_call', 'error', 'session_start')
 * @param {object} data - Event-specific data
 * @param {object} metadata - Additional metadata (serverId, version, etc.)
 * @returns {Promise<void>}
 */
async function sendTelemetry(event, data = {}, metadata = {}) {
	// Skip if telemetry is disabled
	if (process.env.DISABLE_TELEMETRY === 'true') {
		return;
	}

	// Skip if endpoint is not configured
	if (!TELEMETRY_ENDPOINT) {
		return;
	}

	const telemetryPayload = {
		event,
		timestamp: new Date().toISOString(),
		serverId: metadata.serverId || process.env.SERVER_ID || 'unknown',
		version: metadata.version || process.env.MCP_VERSION || 'unknown',
		data,
		...metadata
	};

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

		const response = await fetch(TELEMETRY_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(telemetryPayload),
			signal: controller.signal
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			console.warn(`Telemetry failed with status ${response.status}`);
		}
	} catch (error) {
		// Don't fail if telemetry fails - just log debug message
		// This ensures telemetry never blocks the main operation
		if (error.name !== 'AbortError') {
			console.debug('Telemetry error (non-critical):', error.message);
		}
	}
}

/**
 * Wraps a tool handler to automatically send telemetry
 *
 * @param {string} toolName - Name of the tool
 * @param {Function} handler - Original tool handler function
 * @returns {Function} Wrapped handler with telemetry
 */
function withTelemetry(toolName, handler) {
	return async (...args) => {
		const startTime = Date.now();

		try {
			const result = await handler(...args);
			const duration = Date.now() - startTime;

			// Send success telemetry asynchronously (don't await)
			sendTelemetry('tool_call', {
				toolName,
				success: true,
				duration,
				paramsCount: args.length
			}).catch(() => {
				// Ignore telemetry errors - they should never block the main operation
			});

			return result;
		} catch (error) {
			const duration = Date.now() - startTime;

			// Send error telemetry asynchronously
			sendTelemetry('tool_error', {
				toolName,
				success: false,
				duration,
				errorType: error.constructor.name,
				errorMessage: error.message
			}).catch(() => {
				// Ignore telemetry errors - they should never block the main operation
			});

			throw error;
		}
	};
}

/**
 * Sends a session start event
 *
 * @param {object} sessionInfo - Session information
 */
async function sendSessionStart(sessionInfo = {}) {
	await sendTelemetry('session_start', {
		transport: sessionInfo.transport || 'unknown',
		clientVersion: sessionInfo.clientVersion || 'unknown',
		...sessionInfo
	});
}

/**
 * Sends a session end event
 *
 * @param {object} sessionStats - Session statistics
 */
async function sendSessionEnd(sessionStats = {}) {
	await sendTelemetry('session_end', {
		duration: sessionStats.duration || 0,
		toolCallsCount: sessionStats.toolCallsCount || 0,
		...sessionStats
	});
}

module.exports = {
	sendTelemetry,
	withTelemetry,
	sendSessionStart,
	sendSessionEnd
};
