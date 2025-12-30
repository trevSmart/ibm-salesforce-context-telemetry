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

# Launch the event log desktop viewer
npm run start:electron
```

## Overview

This telemetry server receives telemetry events from IBM Salesforce Context MCP server instances and provides a web dashboard for viewing and analyzing usage data. The server includes user management, team analytics, and data export capabilities.

## Project Structure

```
.
├── api/                    # API specifications
│   ├── api-spec.yaml       # OpenAPI 3.0 specification
│   └── telemetry-schema.json # JSON Schema for validation
├── docs/                   # Complete documentation
├── AGENTS.md              # Instructions for AI agents
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

* **Web Dashboard**: View and analyze telemetry data through an intuitive web interface
* **Multi-User Support**: Role-based authentication with administrator, advanced, and basic user levels
* **People Management**: Group multiple usernames from different organizations under single individuals
* **Team Analytics**: Analyze usage patterns by teams and organizations
* **Data Export**: Export telemetry data in industry-standard JSON Lines (JSONL) format
* **Third-Party Integration**: Compatible with ELK Stack, Splunk, Datadog, and other log analysis tools
* **Desktop Viewer**: Electron-based desktop application for offline monitoring
* **Health Monitoring**: Built-in health checks and system monitoring

## Deployment

The server is deployed on Render at:
**https://ibm-salesforce-context-telemetry.onrender.com**

Visit the URL in your browser to access the telemetry dashboard and view collected events.

## Desktop event log viewer

If you prefer a desktop experience to monitor telemetry events, you can now open the existing `public/event-log.html` UI inside a lightweight Electron shell. Keep the API server running (`npm start`) so the UI can reach `/api/*`:

```bash
npm run start:electron
```

This command rebuilds the Tailwind CSS bundle (ensuring `public/css/output.css` is up to date) and then spins up an Electron window that simply hosts the current HTML interface, so you get the exact same experience without needing to open the browser manually. By default it points to `http://localhost:3100/logs`, but you can override it (for example, to target a remote deployment) via:

```bash
TELEMETRY_UI_URL="https://your-server.example.com/logs" npm run start:electron
```

To avoid passing the variable manually each time, create a `.env` file (copy `.env.example`) and set `TELEMETRY_UI_URL` there. The Electron bootstrap automatically loads the value both in development and inside the packaged app (the `.env` file is bundled), so the desktop viewer will always target the URL you define.

Inside the UI you can detect if it is running under the desktop shell by checking `window.__IS_ELECTRON__` (boolean) or by inspecting `document.documentElement.dataset.runtime` (`electron` / `browser`). This is useful if you need to adjust behavior (for example, hiding links that only make sense on the web).

### Build a macOS app bundle

When you need a distributable `.app` (and `.dmg` installer) run:

```bash
npm run dist:mac
```

Electron Builder will place the signed artifacts under `dist/`. The command already regenerates the Tailwind bundle before packaging, so the embedded offline fallback remains in sync. We pass `--universal`, which merges x64 and arm64 into a single binary to ensure compatibility with any Mac. Before building, make sure your `.env` file (not versioned) contains the desired `TELEMETRY_UI_URL`: the file is copied as an extra resource and read at runtime, so any changes require regenerating the artifacts.

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

- Node.js v18 or newer
- PostgreSQL (see [docs/SETUP.md](./docs/SETUP.md) for installation instructions)

### Installation

```bash
npm install
```

### Running Locally

```bash
npm start
```

The server will start on port 3100 by default.

### Configuration

Create a `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Key settings:
- `DATABASE_URL`: PostgreSQL connection string
- `DATABASE_SSL`: Set to `false` for local development
- `PORT`: Server port (optional, defaults to 3100)

## Architecture

The server uses PostgreSQL to store telemetry events and user data. The database includes tables for events, users, people management, and configuration settings.

## Authentication

The server supports multi-user authentication with role-based permissions:

### User Roles

| Role          | Access                                                                     |
|---------------|----------------------------------------------------------------------------|
| basic         | Limited to the main dashboard (no event log or destructive actions)        |
| advanced      | Full access to the event log, export/delete operations                    |
| administrator | Full access to the event log, export/delete operations, and user management |

### Creating Users

Create users using the provided scripts:

```bash
# Create administrator user
npm run create-user admin secure-password administrator

# Create advanced user
npm run create-user analyst password123 advanced

# Create basic user (default role)
npm run create-user viewer password456
```

Users can also be created through the web interface by administrators.

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

## Documentation

Complete documentation is available in the [`docs/`](./docs/) directory, including:

- Setup and deployment guides
- API specification and examples
- Integration instructions
- Database configuration
- Performance optimizations

## API Specification

The complete API specification is available in multiple formats:

- **OpenAPI/Swagger**: [`api/api-spec.yaml`](./api/api-spec.yaml)
- **JSON Schema**: [`api/telemetry-schema.json`](./api/telemetry-schema.json)

## Integration

To integrate this telemetry server with your MCP server, see the integration guide in [`docs/`](./docs/).

A reference implementation is available in [`examples/telemetry-client.js`](./examples/telemetry-client.js).

## Related Projects

* [IBM Salesforce Context](https://github.com/trevSmart/ibm-salesforce-context) - The main MCP server that sends telemetry to this service

## License

See the LICENSE file for details.
