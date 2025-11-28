# IBM Salesforce Context Telemetry Server

A telemetry collection server for the [IBM Salesforce Context](https://github.com/trevSmart/ibm-salesforce-context) MCP server. This service captures and processes telemetry data from MCP server instances to help improve the product and understand usage patterns.

## Quick Start

**New to this project?** Check out the [SETUP.md](./docs/SETUP.md) guide for step-by-step instructions on how to set up and deploy the telemetry server.

**Quick commands:**
```bash
# Install dependencies
npm install

# Run locally
npm start

# Test the server
curl http://localhost:3100/

# Create a user in the database
npm run create-user admin my-password

# Generate password hash
npm run generate-password-hash "my-password"

# Launch the event log desktop viewer
npm run start:electron
```

## Overview

This telemetry server receives telemetry events from IBM Salesforce Context MCP server instances and processes them for analytics and monitoring purposes. The server is designed to be lightweight, scalable, and privacy-conscious.

## Project Structure

```
.
├── api/                    # API specifications
│   ├── api-spec.yaml       # OpenAPI 3.0 specification
│   └── telemetry-schema.json # JSON Schema for validation
├── docs/                   # Documentation
│   ├── SETUP.md           # Setup and deployment guide
│   ├── INTEGRATION.md     # Integration guide for MCP servers
│   ├── API_SPECIFICATION.md # Complete API documentation
│   ├── DATABASE.md        # Database configuration guide
│   ├── LOG_FORMATS.md     # Standard log formats documentation
│   └── AGENTS.md          # Instructions for AI agents
├── examples/               # Code examples
│   └── telemetry-client.js # Reference telemetry client
├── public/                 # Web dashboard
│   └── index.html         # Telemetry dashboard interface
├── storage/                # Database storage module
│   └── database.js        # Database operations
├── index.js                # Main server file
└── package.json            # Dependencies and scripts
```

## Features

* **Telemetry Collection**: Receives telemetry events via REST API
* **Web Dashboard**: Beautiful web interface to view and analyze telemetry data
* **Database Storage**: Stores events in SQLite (default) or PostgreSQL
* **Multi-User Authentication**: Support for multiple users with database-backed authentication
* **Standard Log Format**: Export logs in JSON Lines (JSONL) format - the industry standard
* **Third-Party Integration**: Compatible with ELK Stack, Splunk, Datadog, Grafana Loki, BigQuery, and more
* **Health Monitoring**: Provides health check endpoints for monitoring
* **Scalable Architecture**: Built with Express.js for easy deployment
* **Privacy-First**: Designed with data privacy and security in mind

## Deployment

The server is currently deployed on Render at:
**https://ibm-salesforce-context-telemetry.onrender.com**

Visit the URL in your browser to access the **Telemetry Dashboard** and view all collected events.

## Desktop event log viewer

If you prefer a desktop experience to monitor telemetry events, you can now open the existing `public/event-log.html` UI inside a lightweight Electron shell. Keep the API server running (`npm start`) so the UI can reach `/api/*`:

```bash
npm run start:electron
```

This command rebuilds the Tailwind CSS bundle (ensuring `public/css/output.css` is up to date) and then spins up an Electron window that simply hosts the current HTML interface, so you get the exact same experience without needing to open the browser manually. By default it points to `http://localhost:3100/event-log`, but you can override it (for example, to target a remote deployment) via:

```bash
TELEMETRY_UI_URL="https://your-server.example.com/event-log" npm run start:electron
```

To avoid passing the variable manually each time, create a `.env` file (copy `.env.example`) and set `TELEMETRY_UI_URL` there. The Electron bootstrap automatically loads the value both in development and inside the packaged app (the `.env` file is bundled), so the desktop viewer will always target the URL you define.

Inside the UI you can detect if it is running under the desktop shell by checking `window.__IS_ELECTRON__` (boolean) or by inspecting `document.documentElement.dataset.runtime` (`electron` / `browser`). This is useful if you need to adjust behavior (for example, hiding links that only make sense on the web).

### Build a macOS app bundle

When you need a distributable `.app` (and `.dmg` installer) run:

```bash
npm run dist:mac
```

Electron Builder will place the signed artifacts under `dist/`. The command already regenerates the Tailwind bundle before packaging, so the embedded offline fallback remains in sync. We pass `--universal`, which merges x64 i arm64 en un sol binari per garantir compatibilitat amb qualsevol Mac. Abans de construir, assegura’t que el teu `.env` (no es versiona) conté el `TELEMETRY_UI_URL` desitjat: l’arxiu es copia com a recurs extra i es llegeix en temps d’execució, per tant qualsevol canvi requereix regenerar els artefactes.

## API Endpoints

### POST `/telemetry`

Receives telemetry events from MCP server instances.

**Request Body:**
```json
{
  "event": "tool_call",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    // Event-specific data
  }
}
```

**Response:**
```json
{
  "status": "ok"
}
```

### GET `/health`

Health check endpoint for monitoring and load balancers.

**Response:**
```
ok
```

### GET `/`

Root endpoint that returns server status.

**Response:**
```
MCP Telemetry server is running ✅
```

### GET `/api-spec`

Serves the OpenAPI specification in YAML format.

**Response:**
OpenAPI 3.0 YAML specification

### GET `/schema`

Serves the JSON Schema for validation.

**Response:**
JSON Schema object

### GET `/api/export/logs`

Exports telemetry events in JSON Lines (JSONL) format - the industry standard for structured logging.

**Query Parameters:**
- `startDate` - Filter events from this date (ISO 8601 or YYYY-MM-DD)
- `endDate` - Filter events until this date (ISO 8601 or YYYY-MM-DD)
- `eventType` - Filter by event type
- `serverId` - Filter by server ID
- `limit` (default: 10000) - Maximum number of events to export

**Format:**
JSON Lines (JSONL) - Each line is a valid JSON object. This format is compatible with:
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Splunk Enterprise/Cloud
- Datadog
- AWS CloudWatch
- Grafana Loki
- Google BigQuery
- MongoDB
- PostgreSQL
- Apache Kafka
- And many other tools

**Example:**
```bash
# Export all logs
curl "http://localhost:3100/api/export/logs" -o logs.jsonl

# Export with filters
curl "http://localhost:3100/api/export/logs?startDate=2024-01-01&eventType=tool_call" -o logs.jsonl
```

**Response:**
Returns a downloadable JSONL file (Content-Type: `application/x-ndjson`)

For detailed information about JSON Lines format and integration with third-party tools, see [LOG_FORMATS.md](./docs/LOG_FORMATS.md).

### GET `/api/events`

Retrieves telemetry events with pagination and filtering.

**Query Parameters:**
- `limit` (default: 50) - Number of events per page
- `offset` (default: 0) - Pagination offset
- `eventType` - Filter by event type
- `serverId` - Filter by server ID
- `startDate` - Filter events from this date
- `endDate` - Filter events until this date
- `orderBy` - Sort field (id, event, timestamp, created_at, server_id)
- `order` - Sort order (ASC, DESC)

**Response:**
```json
{
  "events": [...],
  "total": 100,
  "limit": 50,
  "offset": 0,
  "hasMore": true
}
```

### GET `/api/stats`

Get telemetry statistics.

**Query Parameters:**
- `startDate` - Filter from date
- `endDate` - Filter until date
- `eventType` - Filter by event type

**Response:**
```json
{
  "total": 100
}
```

### GET `/api/event-types`

Get statistics grouped by event type.

**Response:**
```json
[
  { "event": "tool_call", "count": 50 },
  { "event": "tool_error", "count": 5 }
]
```

### Authentication Endpoints

All API endpoints (except `/telemetry`, `/health`, and `/login`) require authentication.

**POST `/login`**

Authenticate and create a session.

**Request Body:**
```json
{
  "username": "admin",
  "password": "your-password"
}
```

**Response:**
```json
{
  "status": "ok",
  "message": "Login successful"
}
```

**GET `/api/auth/status`**

Check authentication status.

**Response:**
```json
{
  "authenticated": true,
  "username": "admin"
}
```

**POST `/logout`**

End the current session.

**Response:**
```json
{
  "status": "ok",
  "message": "Logout successful"
}
```

### User Management Endpoints

**GET `/api/users`**

List all users (requires authentication).

**Response:**
```json
{
  "status": "ok",
  "users": [
    {
      "id": 1,
      "username": "admin",
      "created_at": "2024-01-15T10:30:00.000Z",
      "last_login": "2024-01-15T12:00:00.000Z"
    }
  ]
}
```

**POST `/api/users`**

Create a new user (requires authentication).

**Request Body:**
```json
{
  "username": "newuser",
  "password": "secure-password"
}
```

**Response:**
```json
{
  "status": "ok",
  "message": "User created successfully",
  "user": {
    "id": 2,
    "username": "newuser",
    "created_at": "2024-01-15T10:30:00.000Z"
  }
}
```

**DELETE `/api/users/:username`**

Delete a user (requires authentication). Cannot delete your own account.

**Response:**
```json
{
  "status": "ok",
  "message": "User deleted successfully"
}
```

**PUT `/api/users/:username/password`**

Update a user's password (requires authentication).

**Request Body:**
```json
{
  "password": "new-secure-password"
}
```

**Response:**
```json
{
  "status": "ok",
  "message": "Password updated successfully"
}
```

## Local Development

### Prerequisites

* Node.js v18 or newer
* npm or yarn

### Installation

```bash
npm install
```

### Running Locally

```bash
npm start
```

The server will start on port 3100 by default, or the port specified in the `PORT` environment variable.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3100` |
| `DB_TYPE` | Database type (`sqlite` or `postgresql`) | `sqlite` |
| `DB_PATH` | Path to SQLite database file (SQLite only) | `./data/telemetry.db` |
| `DATABASE_URL` | PostgreSQL connection string (PostgreSQL only) | - |
| `DATABASE_SSL` | Enable SSL for PostgreSQL (`true`/`false`) | `false` |
| `ADMIN_USERNAME` | Admin username (for single-user auth) | `admin` |
| `ADMIN_PASSWORD` | Admin password in plain text (will be hashed) | - |
| `ADMIN_PASSWORD_HASH` | Admin password as bcrypt hash (recommended) | - |
| `SESSION_SECRET` | Secret key for session management (auto-generated if not set) | - |

**Note**: For multi-user authentication, create users in the database using the API or scripts. Environment variables are used as a fallback for backward compatibility.

## Architecture

The server stores telemetry events and user data in a database:

* **SQLite** (default) - File-based database, perfect for development and small deployments
* **PostgreSQL** - Production-ready database for high-volume deployments

The database automatically creates two tables:
* `telemetry_events` - Stores all telemetry event data
* `users` - Stores user authentication credentials (for multi-user support)

See [docs/DATABASE.md](./docs/DATABASE.md) for complete database configuration and setup instructions.

**⚠️ Important for Render deployments**: SQLite does not persist between deployments on Render. See [docs/RENDER_DEPLOYMENT.md](./docs/RENDER_DEPLOYMENT.md) for instructions on using PostgreSQL with Render.

## Authentication

The server supports two authentication methods:

### Single User (Environment Variables)

Configure authentication using environment variables:

```bash
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
```

Or use a password hash (more secure):

```bash
# Generate hash locally
npm run generate-password-hash "your-password"

# Add to environment
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2b$10$...
```

### Multiple Users (Database)

For production deployments with multiple users, create users in the database:

**Via Script:**
```bash
npm run create-user admin secure-password
npm run create-user user1 password1
# Optional third argument sets the role (advanced|basic). Default is advanced.
npm run create-user analyst password123 basic
```

**Via API (after initial login):**
```bash
# First login with environment variables, then create users via API
curl -X POST http://localhost:3100/api/users \
  -H "Content-Type: application/json" \
  -d '{"username": "newuser", "password": "secure-password"}'
```

### Permission Levels

User accounts can operate with two permission levels:

| Role      | Access                                                                     |
|-----------|----------------------------------------------------------------------------|
| advanced  | Full access to the event log, export/delete operations, and user management |
| basic     | Limited to the main dashboard (no event log or destructive actions)        |

When creating a user (via script or API), pass `"role": "basic"` to limit access. You can also change existing users with:

```bash
curl -X PUT http://localhost:3100/api/users/alice/role \
  -H "Content-Type: application/json" \
  -d '{"role": "advanced"}'
```

**Authentication Priority:**
1. Database users are checked first
2. Falls back to environment variables if no database users exist
3. Maintains backward compatibility with existing deployments

See [docs/RENDER_DEPLOYMENT.md](./docs/RENDER_DEPLOYMENT.md) for deployment-specific authentication setup.

Future enhancements may include:

* Cloud storage (S3, Azure Blob, etc.)
* Real-time analytics dashboard
* Data aggregation and reporting
* Privacy-preserving anonymization

## Privacy and Data Handling

This telemetry server is designed with privacy in mind:

* All telemetry data is handled according to privacy best practices
* No personally identifiable information (PII) should be sent to this endpoint
* Data retention policies should be implemented based on requirements
* Users should be informed about telemetry collection

## Contributing

Contributions are welcome! Please ensure that:

* Code follows the existing style and patterns
* Privacy considerations are maintained
* Tests are added for new features
* Documentation is updated as needed

## API Specification

The complete API specification is available in multiple formats:

- **[API_SPECIFICATION.md](./docs/API_SPECIFICATION.md)** - Human-readable API documentation
- **[api-spec.yaml](./api/api-spec.yaml)** - OpenAPI 3.0 specification (Swagger)
- **[telemetry-schema.json](./api/telemetry-schema.json)** - JSON Schema for validation

You can view the OpenAPI spec in [Swagger Editor](https://editor.swagger.io/) by importing `api/api-spec.yaml`.

## Integration

To integrate this telemetry server with your MCP server, see the [INTEGRATION.md](./docs/INTEGRATION.md) guide for detailed instructions and code examples.

**Quick integration example:**

```javascript
const { sendTelemetry } = require('./telemetry-client');

// Send telemetry after a tool call
await sendTelemetry('tool_call', {
  toolName: 'my_tool',
  success: true,
  duration: 150
});
```

A reference implementation is available in [`examples/telemetry-client.js`](./examples/telemetry-client.js).

## Related Projects

* [IBM Salesforce Context](https://github.com/trevSmart/ibm-salesforce-context) - The main MCP server that sends telemetry to this service

## License

See the LICENSE file for details.
