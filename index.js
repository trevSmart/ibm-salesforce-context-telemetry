const express = require('express');
const cors = require('cors');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs');
const path = require('path');
const db = require('./storage/database');
const logFormatter = require('./storage/log-formatter');
const app = express();
const port = process.env.PORT || 3100;

// Load and compile JSON schema for validation
const schemaPath = path.join(__dirname, 'api', 'telemetry-schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false }); // strict: false allows additional properties in 'data'
addFormats(ajv); // Add support for date-time and other formats
const validate = ajv.compile(schema);

// Middleware
app.use(cors()); // Allow requests from any origin
app.use(express.json()); // Parse JSON request bodies
app.use(express.static('public')); // Serve static files from public directory

app.post('/telemetry', (req, res) => {
	try {
		const telemetryData = req.body;

		// Basic validation
		if (!telemetryData || typeof telemetryData !== 'object') {
			return res.status(400).json({
				status: 'error',
				message: 'Invalid telemetry data: expected JSON object'
			});
		}

		// Validate against JSON schema
		const valid = validate(telemetryData);
		if (!valid) {
			const errors = validate.errors.map(err => ({
				field: err.instancePath || err.params?.missingProperty || 'root',
				message: err.message
			}));

			return res.status(400).json({
				status: 'error',
				message: 'Validation failed',
				errors: errors
			});
		}

		// Log the telemetry event with timestamp
		const timestamp = new Date().toISOString();
		console.log(`[${timestamp}] Telemetry event:`, JSON.stringify(telemetryData, null, 2));

		// Store in database (non-blocking - don't await to avoid blocking response)
		db.storeEvent(telemetryData, timestamp).catch(err => {
			console.error('Error storing telemetry event:', err);
			// Don't fail the request if storage fails - telemetry is non-critical
		});

		// Return success response
		res.status(200).json({
			status: 'ok',
			receivedAt: timestamp
		});
	} catch (error) {
		console.error('Error processing telemetry:', error);
		res.status(500).json({
			status: 'error',
			message: 'Internal server error'
		});
	}
});

app.get('/health', (_req, res) => {
	res.status(200).send('ok');
});

// API endpoints for viewing telemetry data
app.get('/api/events', async (req, res) => {
	try {
		const {
			limit = 50,
			offset = 0,
			eventType,
			serverId,
			startDate,
			endDate,
			orderBy = 'created_at',
			order = 'DESC'
		} = req.query;

		const result = await db.getEvents({
			limit: parseInt(limit),
			offset: parseInt(offset),
			eventType,
			serverId,
			startDate,
			endDate,
			orderBy,
			order
		});

		res.json(result);
	} catch (error) {
		console.error('Error fetching events:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch events'
		});
	}
});

app.get('/api/stats', async (req, res) => {
	try {
		const { startDate, endDate, eventType } = req.query;
		const stats = await db.getStats({ startDate, endDate, eventType });
		res.json(stats);
	} catch (error) {
		console.error('Error fetching stats:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch statistics'
		});
	}
});

app.get('/api/event-types', async (req, res) => {
	try {
		const stats = await db.getEventTypeStats();
		res.json(stats);
	} catch (error) {
		console.error('Error fetching event type stats:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to fetch event type statistics'
		});
	}
});

// Serve dashboard page
app.get('/', (_req, res) => {
	const dashboardPath = path.join(__dirname, 'public', 'index.html');
	if (fs.existsSync(dashboardPath)) {
		res.sendFile(dashboardPath);
	} else {
		res.status(200).send('MCP Telemetry server is running ✅<br><a href="/api/events">View API</a>');
	}
});

// Serve OpenAPI specification
app.get('/api-spec', (_req, res) => {
	const specPath = path.join(__dirname, 'api', 'api-spec.yaml');
	if (fs.existsSync(specPath)) {
		res.type('text/yaml');
		res.send(fs.readFileSync(specPath, 'utf8'));
	} else {
		res.status(404).json({ status: 'error', message: 'API spec not found' });
	}
});

// Serve JSON schema
app.get('/schema', (_req, res) => {
	res.json(schema);
});

// Export logs in JSON Lines (JSONL) format
app.get('/api/export/logs', async (req, res) => {
	try {
		const {
			startDate,
			endDate,
			eventType,
			serverId,
			limit = 10000
		} = req.query;

		// Get events from database
		const result = await db.getEvents({
			limit: parseInt(limit),
			offset: 0,
			eventType,
			serverId,
			startDate,
			endDate,
			orderBy: 'created_at',
			order: 'ASC'
		});

		// Format events as JSON Lines (JSONL)
		const formattedLogs = logFormatter.formatEvents(result.events);

		const filename = `telemetry-logs-${new Date().toISOString().split('T')[0]}.jsonl`;

		res.setHeader('Content-Type', 'application/x-ndjson');
		res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
		res.send(formattedLogs);
	} catch (error) {
		console.error('Error exporting logs:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to export logs'
		});
	}
});

// Delete all events from database
app.delete('/api/events', async (req, res) => {
	try {
		const deletedCount = await db.deleteAllEvents();
		res.json({
			status: 'ok',
			message: `Successfully deleted ${deletedCount} events`,
			deletedCount
		});
	} catch (error) {
		console.error('Error deleting events:', error);
		res.status(500).json({
			status: 'error',
			message: 'Failed to delete events'
		});
	}
});

// Initialize database and start server
async function startServer() {
	try {
		await db.init();
		console.log('Database initialized successfully');

		app.listen(port, () => {
			console.log('\n' + '='.repeat(60));
			console.log('✅ Telemetry server is running!');
			console.log('='.repeat(60));
			console.log(`🌐 Server URL: http://localhost:${port}`);
			console.log(`📊 Dashboard:  http://localhost:${port}/`);
			console.log(`❤️  Health:     http://localhost:${port}/health`);
			console.log(`📡 API:        http://localhost:${port}/api/events`);
			console.log(`📋 Schema:     http://localhost:${port}/schema`);
			console.log('='.repeat(60) + '\n');
		});
	} catch (error) {
		console.error('Failed to initialize database:', error);
		process.exit(1);
	}
}

// Graceful shutdown
process.on('SIGTERM', async () => {
	console.log('SIGTERM received, closing database...');
	await db.close();
	process.exit(0);
});

process.on('SIGINT', async () => {
	console.log('SIGINT received, closing database...');
	await db.close();
	process.exit(0);
});

// Start the server
startServer();