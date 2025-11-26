const express = require('express');
const cors = require('cors');
const Ajv = require('ajv');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Load and compile JSON schema for validation
const schemaPath = path.join(__dirname, 'api', 'telemetry-schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false }); // strict: false allows additional properties in 'data'
const validate = ajv.compile(schema);

// Middleware
app.use(cors()); // Allow requests from any origin
app.use(express.json()); // Parse JSON request bodies

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

		// TODO: Store in database, send to analytics, etc.
		// Example: await db.telemetry.insert(telemetryData);

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

app.get('/', (_req, res) => {
	res.status(200).send('MCP Telemetry server is running ✅');
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

app.listen(port, () => {
	console.log(`Telemetry server listening on port ${port}`);
});