# Guia d'Integració: Enviar Telemetria des del Servidor MCP

Aquesta guia explica com configurar el servidor MCP IBM Salesforce Context per enviar telemetria al servidor de telemetria.

## 📡 Endpoint de Telemetria

El servidor de telemetria ofereix un endpoint REST per rebre dades:

**URL**: `POST https://ibm-salesforce-context-telemetry.onrender.com/telemetry`

## 📋 Format de les Dades

El servidor espera rebre un objecte JSON amb la següent estructura:

```json
{
  "event": "tool_call",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "serverId": "unique-server-instance-id",
  "version": "1.0.0",
  "data": {
    "toolName": "execute_queries_and_dml",
    "operation": "query",
    "duration": 150,
    "success": true
  }
}
```

### Camps Requerits

- `event` (string): Tipus d'esdeveniment (ex: "tool_call", "error", "session_start", etc.)
- `timestamp` (string): Data i hora en format ISO 8601

### Camps Opcionals

- `serverId` (string): Identificador únic de la instància del servidor MCP
- `version` (string): Versió del servidor MCP
- `data` (object): Dades específiques de l'esdeveniment
- `userId` (string): Identificador anònim de l'usuari (si s'aplica)
- `sessionId` (string): Identificador de la sessió MCP

## 🔧 Implementació al Servidor MCP

### Opció 1: Funció Helper per Enviar Telemetria

Afegeix aquesta funció al teu servidor MCP:

```javascript
const TELEMETRY_ENDPOINT = process.env.TELEMETRY_ENDPOINT ||
  'https://ibm-salesforce-context-telemetry.onrender.com/telemetry';

/**
 * Envia un esdeveniment de telemetria al servidor de telemetria
 * @param {string} event - Tipus d'esdeveniment
 * @param {object} data - Dades de l'esdeveniment
 * @param {object} metadata - Metadades addicionals (serverId, version, etc.)
 */
async function sendTelemetry(event, data = {}, metadata = {}) {
  // No enviar telemetria si està deshabilitada
  if (process.env.DISABLE_TELEMETRY === 'true') {
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
    const response = await fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(telemetryPayload),
      // Timeout de 2 segons per no bloquejar
      signal: AbortSignal.timeout(2000)
    });

    if (!response.ok) {
      console.warn(`Telemetry failed: ${response.status}`);
    }
  } catch (error) {
    // No fallar si la telemetria falla - només loguejar
    console.debug('Telemetry error (non-critical):', error.message);
  }
}
```

### Opció 2: Enviar Telemetria després de Cada Tool Call

Exemple d'ús dins d'un handler de tool:

```javascript
// Dins del handler d'una tool
async function handleToolCall(toolName, params, result) {
  const startTime = Date.now();

  try {
    // Executar la tool
    const result = await executeTool(toolName, params);
    const duration = Date.now() - startTime;

    // Enviar telemetria d'èxit
    await sendTelemetry('tool_call', {
      toolName,
      success: true,
      duration,
      paramsCount: Object.keys(params).length
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    // Enviar telemetria d'error
    await sendTelemetry('tool_error', {
      toolName,
      success: false,
      duration,
      errorType: error.constructor.name,
      errorMessage: error.message
    });

    throw error;
  }
}
```

### Opció 3: Middleware per Capturar Tots els Tool Calls

Si el teu servidor MCP usa un sistema de middleware:

```javascript
// Middleware per capturar tots els tool calls
function telemetryMiddleware(handler) {
  return async (request) => {
    const startTime = Date.now();
    const toolName = request.method;

    try {
      const result = await handler(request);
      const duration = Date.now() - startTime;

      // Enviar telemetria de forma asíncrona (no bloqueja)
      sendTelemetry('tool_call', {
        toolName,
        success: true,
        duration
      }).catch(() => {}); // Ignorar errors

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      sendTelemetry('tool_error', {
        toolName,
        success: false,
        duration,
        errorType: error.constructor.name
      }).catch(() => {});

      throw error;
    }
  };
}
```

## 🔐 Variables d'Entorn

Configura aquestes variables d'entorn al servidor MCP:

```bash
# URL del servidor de telemetria
TELEMETRY_ENDPOINT=https://ibm-salesforce-context-telemetry.onrender.com/telemetry

# Identificador únic del servidor (opcional)
SERVER_ID=server-instance-123

# Versió del servidor MCP (opcional)
MCP_VERSION=1.0.0

# Deshabilitar telemetria (opcional, per defecte false)
DISABLE_TELEMETRY=false
```

## 📊 Tipus d'Esdeveniments Recomanats

### Tool Calls
```json
{
  "event": "tool_call",
  "data": {
    "toolName": "execute_queries_and_dml",
    "success": true,
    "duration": 150
  }
}
```

### Errors
```json
{
  "event": "tool_error",
  "data": {
    "toolName": "describe_object",
    "errorType": "ValidationError",
    "errorMessage": "Invalid object name"
  }
}
```

### Sessió Iniciada
```json
{
  "event": "session_start",
  "data": {
    "transport": "stdio",
    "clientVersion": "1.0.0"
  }
}
```

### Sessió Finalitzada
```json
{
  "event": "session_end",
  "data": {
    "duration": 3600000,
    "toolCallsCount": 42
  }
}
```

## 🧪 Provar la Integració

### Provar amb curl

```bash
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

### Provar localment

Si tens el servidor de telemetria corrent localment:

```bash
curl -X POST http://localhost:3000/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "event": "test",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "data": {"test": true}
  }'
```

## ⚠️ Consideracions Importants

### Privacitat

- **No enviar informació personal**: Mai enviïs noms d'usuari, emails, o qualsevol PII
- **Anonimització**: Usa identificadors anònims per usuaris i sessions
- **Dades sensibles**: No enviïs contrasenyes, tokens, o dades sensibles de Salesforce

### Rendiment

- **Asíncron**: Envia telemetria de forma asíncrona per no bloquejar les operacions principals
- **Timeout**: Usa timeouts curts (2-3 segons) per no esperar massa
- **Error handling**: No fallar si la telemetria falla - només loguejar errors

### Fiabilitat

- **Retry logic**: Considera implementar retry amb backoff exponencial
- **Batch sending**: Per alt volum, considera enviar esdeveniments en batch
- **Fallback**: Si el servidor de telemetria no està disponible, no hauria d'afectar el funcionament del MCP

## 🔍 Monitoring

Després d'integrar la telemetria, pots:

1. **Veure els logs**: Els esdeveniments es loguegen a la consola del servidor de telemetria
2. **Verificar l'endpoint**: Fes un GET a `/health` per verificar que el servidor està actiu
3. **Revisar les dades**: Els logs mostraran tots els esdeveniments rebuts

## 📝 Exemple Complet

Aquí tens un exemple complet d'integració:

```javascript
// telemetry.js
const TELEMETRY_ENDPOINT = process.env.TELEMETRY_ENDPOINT ||
  'https://ibm-salesforce-context-telemetry.onrender.com/telemetry';

async function sendTelemetry(event, data = {}) {
  if (process.env.DISABLE_TELEMETRY === 'true') return;

  try {
    await fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        serverId: process.env.SERVER_ID || 'unknown',
        version: process.env.MCP_VERSION || 'unknown',
        data
      }),
      signal: AbortSignal.timeout(2000)
    });
  } catch (error) {
    // Silent fail - no afectar l'operació principal
    console.debug('Telemetry failed:', error.message);
  }
}

// main.js - Ús dins del servidor MCP
import { sendTelemetry } from './telemetry.js';

// Envoltar tool handlers
const originalHandler = server.handleToolCall;
server.handleToolCall = async (toolName, params) => {
  const start = Date.now();
  try {
    const result = await originalHandler(toolName, params);
    await sendTelemetry('tool_call', {
      toolName,
      success: true,
      duration: Date.now() - start
    });
    return result;
  } catch (error) {
    await sendTelemetry('tool_error', {
      toolName,
      success: false,
      duration: Date.now() - start,
      errorType: error.constructor.name
    });
    throw error;
  }
};
```

## 🚀 Següents Passos

Un cop integrat:

1. **Provar localment**: Assegura't que funciona amb el servidor local
2. **Desplegar**: Desplega el servidor MCP amb la telemetria habilitada
3. **Monitoritzar**: Revisa els logs del servidor de telemetria per veure les dades
4. **Iterar**: Ajusta els esdeveniments segons les necessitats
