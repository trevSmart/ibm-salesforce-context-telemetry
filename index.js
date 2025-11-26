const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.post('/telemetry', (req, res) => {
	// Aquí reps la telemetria del teu MCP
	console.log('Telemetry event:', JSON.stringify(req.body));

	// De moment només la logegem;
	// més endavant la pots guardar a Postgres, S3, etc.
	res.status(200).json({ status: 'ok' });
});

app.get('/health', (_req, res) => {
	res.status(200).send('ok');
});

app.get('/', (_req, res) => {
	res.status(200).send('MCP Telemetry server is running ✅');
});

app.listen(port, () => {
	console.log(`Telemetry server listening on port ${port}`);
});