# API Specifications

This directory contains the formal API specifications for the Telemetry Server.

## Files

- **[api-spec.yaml](./api-spec.yaml)** - OpenAPI 3.0 specification in YAML format
  - Complete API documentation with request/response schemas
  - Can be viewed in [Swagger Editor](https://editor.swagger.io/)
  - Can be imported into API testing tools like Postman or Insomnia

- **[telemetry-schema.json](./telemetry-schema.json)** - JSON Schema for telemetry event validation
  - Defines the structure and validation rules for telemetry events
  - Can be used for programmatic validation before sending data
  - Includes examples for each event type

## Usage

### Viewing the OpenAPI Spec

1. Go to [Swagger Editor](https://editor.swagger.io/)
2. Click "File" → "Import file"
3. Select `api-spec.yaml`

### Using the JSON Schema

```javascript
const Ajv = require('ajv');
const schema = require('./api/telemetry-schema.json');

const ajv = new Ajv();
const validate = ajv.compile(schema);

const data = {
  event: 'tool_call',
  timestamp: new Date().toISOString(),
  data: { toolName: 'my_tool' }
};

if (validate(data)) {
  // Valid - send to server
} else {
  console.log(validate.errors);
}
```

## Access via API

The server also serves these specifications via HTTP:

- `GET /api-spec` - Returns the OpenAPI specification
- `GET /schema` - Returns the JSON Schema
