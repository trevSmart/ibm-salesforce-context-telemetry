# API Specification - Telemetry Server

Aquesta documentació especifica l'API del servidor de telemetria per a l'equip de desenvolupament del servidor MCP.

## 📋 Especificacions Disponibles

- **OpenAPI/Swagger**: [`../api/api-spec.yaml`](../api/api-spec.yaml) - Especificació completa en format OpenAPI 3.0
- **JSON Schema**: [`../api/telemetry-schema.json`](../api/telemetry-schema.json) - Schema JSON per validació de dades

## 🔗 Endpoints

### Base URL

- **Production**: `https://ibm-salesforce-context-telemetry.onrender.com`
- **Development**: `http://localhost:3000`

## 📤 POST /telemetry

Envia un esdeveniment de telemetria al servidor.

### Request

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "event": "tool_call",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "serverId": "server-instance-123",
  "version": "1.0.0",
  "data": {
    "toolName": "execute_queries_and_dml",
    "operation": "query",
    "duration": 150,
    "success": true
  }
}
```

### Campos Requeridos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `event` | string | Tipo de evento. Valores permitidos: `tool_call`, `tool_error`, `session_start`, `session_end`, `error`, `custom` |
| `timestamp` | string (ISO 8601) | Fecha y hora del evento en formato ISO 8601 |

### Campos Opcionales

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `serverId` | string | Identificador único de la instancia del servidor MCP |
| `version` | string | Versión del servidor MCP |
| `sessionId` | string | Identificador único de la sesión MCP |
| `userId` | string | Identificador anónimo del usuario (sin PII) |
| `data` | object | Datos específicos del evento (ver ejemplos abajo) |

### Response

**Success (200):**
```json
{
  "status": "ok",
  "receivedAt": "2024-01-15T10:30:00.123Z"
}
```

**Error (400):**
```json
{
  "status": "error",
  "message": "Invalid telemetry data: expected JSON object"
}
```

**Error (500):**
```json
{
  "status": "error",
  "message": "Internal server error"
}
```

## 📝 Ejemplos de Eventos

### Tool Call (Éxito)

```json
{
  "event": "tool_call",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "serverId": "server-instance-123",
  "version": "1.0.0",
  "sessionId": "session-abc-123",
  "data": {
    "toolName": "execute_queries_and_dml",
    "operation": "query",
    "duration": 150,
    "success": true,
    "paramsCount": 2
  }
}
```

### Tool Error

```json
{
  "event": "tool_error",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "serverId": "server-instance-123",
  "version": "1.0.0",
  "sessionId": "session-abc-123",
  "data": {
    "toolName": "describe_object",
    "errorType": "ValidationError",
    "errorMessage": "Invalid object name",
    "success": false,
    "duration": 50
  }
}
```

### Session Start

```json
{
  "event": "session_start",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "serverId": "server-instance-123",
  "version": "1.0.0",
  "sessionId": "session-abc-123",
  "data": {
    "transport": "stdio",
    "clientVersion": "1.0.0"
  }
}
```

### Session End

```json
{
  "event": "session_end",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "serverId": "server-instance-123",
  "version": "1.0.0",
  "sessionId": "session-abc-123",
  "data": {
    "duration": 3600000,
    "toolCallsCount": 42,
    "successfulCalls": 40,
    "failedCalls": 2
  }
}
```

## 🔍 Otros Endpoints

### GET /health

Health check endpoint.

**Response:**
```
ok
```

### GET /

Status del servidor.

**Response:**
```
MCP Telemetry server is running ✅
```

### GET /api-spec

Sirve la especificación OpenAPI en formato YAML.

**Response:**
```yaml
openapi: 3.0.3
...
```

### GET /schema

Sirve el JSON Schema para validación.

**Response:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  ...
}
```

## ✅ Validación

El servidor valida automáticamente todas las peticiones usando el JSON Schema definido en [`../api/telemetry-schema.json`](../api/telemetry-schema.json).

### Validaciones Realizadas

1. El body sea un objeto JSON válido
2. Los campos requeridos (`event`, `timestamp`) estén presentes
3. El formato del timestamp sea ISO 8601 válido
4. El campo `event` sea uno de los valores permitidos
5. Los tipos de datos coincidan con el schema

### Respuesta de Error de Validación

Si la validación falla, el servidor responde con:

```json
{
  "status": "error",
  "message": "Validation failed",
  "errors": [
    {
      "field": "/event",
      "message": "must be equal to one of the allowed values"
    },
    {
      "field": "/timestamp",
      "message": "must match format \"date-time\""
    }
  ]
}
```

**Nota**: El servidor acepta campos adicionales en el objeto `data` para flexibilidad, permitiendo que cada tipo de evento envíe datos específicos.

## 🔒 Seguridad y Privacidad

### ⚠️ IMPORTANTE: No enviar nunca

- Información personal identificable (PII)
- Nombres de usuario reales
- Emails
- Contraseñas o tokens
- Datos sensibles de Salesforce
- IDs de registros de Salesforce que puedan identificar usuarios

### ✅ Se puede enviar

- Identificadores anónimos
- Nombres de herramientas
- Métricas de rendimiento
- Tipos de errores (sin mensajes detallados)
- Versiones y metadatos técnicos

## 🧪 Testing

### Con curl

```bash
# Tool call event
curl -X POST https://ibm-salesforce-context-telemetry.onrender.com/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "event": "tool_call",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "serverId": "test-server",
    "version": "1.0.0",
    "data": {
      "toolName": "test_tool",
      "success": true,
      "duration": 100
    }
  }'
```

### Con JavaScript/Node.js

```javascript
const response = await fetch('https://ibm-salesforce-context-telemetry.onrender.com/telemetry', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    event: 'tool_call',
    timestamp: new Date().toISOString(),
    serverId: 'server-instance-123',
    version: '1.0.0',
    data: {
      toolName: 'execute_queries_and_dml',
      success: true,
      duration: 150
    }
  })
});

const result = await response.json();
console.log(result); // { status: 'ok', receivedAt: '...' }
```

## 📚 Recursos Adicionales

- **OpenAPI Spec**: Visualiza la especificación completa en [Swagger Editor](https://editor.swagger.io/) o importa [`../api/api-spec.yaml`](../api/api-spec.yaml)
- **JSON Schema**: Usa [`../api/telemetry-schema.json`](../api/telemetry-schema.json) para validación programática
- **Ejemplo de Cliente**: Ver [`../examples/telemetry-client.js`](../examples/telemetry-client.js)
- **Guía de Integración**: Ver [`INTEGRATION.md`](./INTEGRATION.md)

## 🔄 Versionado

La API actual es la versión **1.0.0**. Cualquier cambio breaking será versionado y documentado.

## 📞 Soporte

Para preguntas o problemas con la integración, consulta:
- [INTEGRATION.md](./INTEGRATION.md) - Guía completa de integración
- [../examples/telemetry-client.js](../examples/telemetry-client.js) - Implementación de referencia
