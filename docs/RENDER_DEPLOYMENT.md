# Deploy a Render

Aquesta guia explica com desplegar el servidor de telemetria a Render amb persistència de dades.

## ⚠️ Problema amb SQLite a Render

**IMPORTANT**: SQLite utilitza fitxers locals que **NO persisteixen** entre deployments a Render. Cada vegada que es fa deploy, la base de dades es reinicialitza i es perden tots els events.

**Solució**: Utilitzar PostgreSQL a Render, que ofereix bases de dades persistents.

## Pas 1: Crear Base de Dades PostgreSQL a Render

1. Accedeix al teu dashboard de Render
2. Crea un **PostgreSQL Database**:
   - Clic a "New +" → "PostgreSQL"
   - Escull un nom (ex: `telemetry-db`)
   - Escull la regió (la mateixa que el teu servei web)
   - Escull el pla (Free tier està bé per començar)
   - Clic a "Create Database"

3. Un cop creada, Render et proporcionarà una **Internal Database URL** i una **External Database URL**

## Pas 2: Configurar Variables d'Entorn al Servei Web

Al teu servei web a Render, afegeix aquestes variables d'entorn:

```
DB_TYPE=postgresql
DATABASE_URL=<Internal Database URL de Render>
DATABASE_SSL=true
```

### Configuració d'Emmagatzematge de Sessions (Opcional però Recomanat)

Per defecte, les sessions s'emmagatzemen a PostgreSQL (que ja has configurat). Però si vols una alternativa o si tens problemes amb les sessions, pots configurar Redis:

1. **Crear Redis a Render**:
   - Al dashboard de Render, crea un **Redis** service
   - Clic a "New +" → "Redis"
   - Escull un nom (ex: `telemetry-redis`)
   - Escull la mateixa regió que el teu servei web
   - Clic a "Create Redis"

2. **Afegir variable d'entorn**:
```
REDIS_URL=<Redis Internal URL de Render>
```

**Nota**: Si no configures Redis, el sistema utilitzarà PostgreSQL per les sessions, que és adequat per la majoria dels casos.

**On trobar la Internal Database URL:**
- Al dashboard de la teva base de dades PostgreSQL
- A la secció "Connections" → "Internal Database URL"
- Té el format: `postgresql://user:password@dpg-xxxxx-a.oregon-postgres.render.com/telemetry_db`

**Important**:
- Utilitza la **Internal Database URL** (no l'External) per millor rendiment
- Assegura't que `DATABASE_SSL=true` per connexions segures

## Pas 3: Instal·lar Dependències PostgreSQL

Assegura't que el teu `package.json` inclou la dependència `pg`:

```json
{
  "dependencies": {
    "pg": "^8.11.0"
  }
}
```

Si no està, afegeix-la:

```bash
npm install pg --save
```

## Pas 4: Configurar Autenticació (Opcional)

Si vols usar autenticació amb múltiples usuaris (recomanat per producció):

**Opció A: Usar variables d'entorn (simple, un sol usuari)**
```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=tu-contrasenya-segura
```

O amb hash (més segur):
```bash
# Genera el hash localment
npm run generate-password-hash "tu-contrasenya-segura"
```

I afegeix a Render:
```
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2b$10$...
```

**Opció B: Usuaris a la base de dades (múltiples usuaris)**

Després del deploy, crea usuaris via API:
```bash
# Primer, fes login amb les variables d'entorn o crea el primer usuari
curl -X POST https://your-app.onrender.com/api/users \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{"username": "nou-usuari", "password": "contrasenya-segura"}'
```

O usa els endpoints API després de fer login a la interfície web.

## Pas 5: Fer Deploy

1. Commit els canvis (si has modificat `package.json`)
2. Push al teu repositori
3. Render farà deploy automàticament
4. Les taules de la base de dades (incloent `users`) es crearan automàticament a la primera execució

## Verificació

Després del deploy, pots verificar que la base de dades funciona:

1. Accedeix a la teva aplicació: `https://your-app.onrender.com/health` (o `/healthz`)
2. Comprova que retorna `"ok"`
3. Envia alguns events de telemetria
4. Fes un nou deploy
5. Verifica que els events **encara estan allà** (no s'han perdut)

## Migració de Dades Existents

Si ja tens dades a SQLite local i vols migrar-les a PostgreSQL:

### Opció 1: Exportar des de SQLite local

```bash
# Exportar dades de SQLite
sqlite3 data/telemetry.db .dump > export.sql

# Adaptar per PostgreSQL (canviar AUTOINCREMENT per SERIAL)
sed -i 's/AUTOINCREMENT/SERIAL/g' export.sql

# Importar a PostgreSQL de Render
psql $DATABASE_URL < export.sql
```

### Opció 2: Utilitzar un script de migració

Pots crear un script temporal que llegeixi de SQLite i escrigui a PostgreSQL:

```javascript
// migrate.js
const sqlite3 = require('better-sqlite3');
const { Pool } = require('pg');

const sqlite = sqlite3.open('./data/telemetry.db');
const pg = new Pool({ connectionString: process.env.DATABASE_URL });

// Migrar events
const events = sqlite.prepare('SELECT * FROM telemetry_events').all();

for (const event of events) {
  await pg.query(
    `INSERT INTO telemetry_events
     (event, timestamp, server_id, version, session_id, user_id, data, received_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      event.event,
      event.timestamp,
      event.server_id,
      event.version,
      event.session_id,
      event.user_id,
      typeof event.data === 'string' ? event.data : JSON.stringify(event.data),
      event.received_at,
      event.created_at
    ]
  );
}

console.log(`Migrated ${events.length} events`);
```

## Troubleshooting

### Avís: "connect.session() MemoryStore is not designed for a production environment"

Aquest avís apareix quan les sessions s'emmagatzemen a memòria en comptes d'una base de dades persistent. El sistema utilitza una jerarquia de stores:

1. **PostgreSQL** (recomanat per producció) - sessions persistents a la base de dades
2. **Redis** (alternativa) - sessions a Redis
3. **memorystore** (fallback millorat) - sessions a memòria sense memory leaks (millor que MemoryStore per defecte però encara no ideal per producció)

**Solucions**:
1. **Assegura't que PostgreSQL està configurat** (recomanat):
   - Verifica `DB_TYPE=postgresql`
   - Comprova que `DATABASE_URL` apunta a la base de dades PostgreSQL
   - Assegura't que `DATABASE_SSL=true`

2. **Configura Redis com alternativa** (opcional):
   - Afegeix `REDIS_URL=<Redis Internal URL>` a les variables d'entorn
   - Crear un servei Redis a Render si no en tens

**Nota**: Si no hi ha PostgreSQL ni Redis configurats, el sistema utilitzarà `memorystore`, que és millor que el MemoryStore per defecte però encara no és ideal per producció perquè les sessions no persisteixen després de reiniciar el servidor.

3. **Reinicia el servei**:
   - Força un nou deploy per assegurar que la configuració s'apliqui

### Error: "Cannot find module 'pg'"

Assegura't que `pg` està al `package.json` i que Render ha fet `npm install` correctament.

### Error: "Connection refused" o "timeout"

- Verifica que estàs utilitzant la **Internal Database URL** (no External)
- Assegura't que `DATABASE_SSL=true`
- Comprova que la base de dades PostgreSQL està activa a Render

### Error: "relation 'telemetry_events' does not exist"

Les taules s'haurien de crear automàticament. Si no, pots crear-les manualment:

```sql
-- Taula d'events de telemetria
CREATE TABLE IF NOT EXISTS telemetry_events (
    id SERIAL PRIMARY KEY,
    event TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    server_id TEXT,
    version TEXT,
    session_id TEXT,
    user_id TEXT,
    data JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Taula d'usuaris (per autenticació multi-usuari)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

-- Índexs per millorar el rendiment
CREATE INDEX IF NOT EXISTS idx_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_event ON telemetry_events(event);
CREATE INDEX IF NOT EXISTS idx_timestamp ON telemetry_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_server_id ON telemetry_events(server_id);
CREATE INDEX IF NOT EXISTS idx_created_at ON telemetry_events(created_at);
```

### Les dades encara es perden després del deploy

- Verifica que `DB_TYPE=postgresql` està configurat
- Comprova que `DATABASE_URL` apunta a la base de dades PostgreSQL (no SQLite)
- Assegura't que la base de dades PostgreSQL no s'ha eliminat o reinicialitzat

## Costos

- **PostgreSQL Free tier**: 90 MB de dades, adequat per desenvolupament i proves
- **PostgreSQL Starter**: $7/mes, 256 MB de dades
- **PostgreSQL Standard**: $20/mes, 1 GB de dades

Per a producció amb molts events, considera un pla de pagament.

## Gestió d'Usuaris a Render

### Crear el primer usuari

Després del deploy, pots crear usuaris de dues maneres:

**Mètode 1: Via API (després de login amb variables d'entorn)**
```bash
# Fes login primer amb les credencials de les variables d'entorn
# Després crea usuaris via API:
curl -X POST https://your-app.onrender.com/api/users \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=..." \
  -d '{"username": "admin", "password": "contrasenya-segura"}'
```

**Mètode 2: Via interfície web**
1. Fes login amb les credencials de les variables d'entorn
2. Accedeix a `/api/users` per veure la llista d'usuaris
3. Usa els endpoints API per crear/eliminar usuaris

### Endpoints disponibles

- `GET /api/users` - Llistar tots els usuaris
- `POST /api/users` - Crear un nou usuari
- `DELETE /api/users/:username` - Eliminar un usuari
- `PUT /api/users/:username/password` - Canviar contrasenya

**Nota**: Tots els endpoints requereixen autenticació.

## Alternatives

Si no vols utilitzar PostgreSQL, pots considerar:

1. **Base de dades externa**: Utilitzar un servei com Supabase, Neon, o Railway PostgreSQL
2. **Volum persistent**: Alguns serveis com Railway permeten volums persistents per SQLite
3. **Backup automàtic**: Fer backups periòdics de SQLite i restaurar-los després de cada deploy (no recomanat)
