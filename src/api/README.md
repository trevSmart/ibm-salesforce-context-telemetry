# API Specifications

This directory contains the formal API specifications for the Telemetry Server.

## Schema Support

The Telemetry Server supports both schema versions for maximum compatibility:

- **Schema v1** (Legacy): Simple flat structure with basic fields
- **Schema v2** (Current): Hierarchical structure with detailed contextual information

The server automatically detects the schema version from the incoming request and processes it accordingly.

## Files

- **[api-spec.yaml](./api-spec.yaml)** - OpenAPI 3.0 specification in YAML format
  - Complete API documentation with request/response schemas
  - Can be viewed in [Swagger Editor](https://editor.swagger.io/)
  - Can be imported into API testing tools like Postman or Insomnia

- **[telemetry-schema.json](./telemetry-schema.json)** - JSON Schema for telemetry event validation
  - Defines the structure and validation rules for both schema v1 and v2 telemetry events
  - Uses `oneOf` to support both legacy (v1) and current (v2) formats
  - Can be used for programmatic validation before sending data
  - Includes examples for both schema versions

## Usage

### Viewing the OpenAPI Spec

1. Go to [Swagger Editor](https://editor.swagger.io/)
2. Click "File" → "Import file"
3. Select `api-spec.yaml`

### Using the JSON Schema

```javascript
const Ajv = require('ajv');
const schema = require('./telemetry-schema.json');

const ajv = new Ajv();
const validate = ajv.compile(schema);

// Example v1 event
const v1Data = {
  event: 'tool_call',
  timestamp: new Date().toISOString(),
  serverId: 'server-123',
  data: { toolName: 'my_tool' }
};

// Example v2 event
const v2Data = {
  schemaVersion: 2,
  area: 'tool',
  event: 'execution',
  success: true,
  timestamp: new Date().toISOString(),
  server: { id: 'server-123', version: '1.0.0' },
  data: { toolName: 'my_tool' }
};

if (validate(v1Data) || validate(v2Data)) {
  // Valid - send to server
} else {
  console.log(validate.errors);
}
```

## Access via API

The server also serves these specifications via HTTP:

- `GET /api-spec` - Returns the OpenAPI specification
- `GET /schema` - Returns the JSON Schema
