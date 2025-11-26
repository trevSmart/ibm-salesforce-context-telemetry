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

## Pas 4: Fer Deploy

1. Commit els canvis (si has modificat `package.json`)
2. Push al teu repositori
3. Render farà deploy automàticament
4. La base de dades es crearà automàticament a la primera execució

## Verificació

Després del deploy, pots verificar que la base de dades funciona:

1. Accedeix a la teva aplicació: `https://your-app.onrender.com/health`
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

### Error: "Cannot find module 'pg'"

Assegura't que `pg` està al `package.json` i que Render ha fet `npm install` correctament.

### Error: "Connection refused" o "timeout"

- Verifica que estàs utilitzant la **Internal Database URL** (no External)
- Assegura't que `DATABASE_SSL=true`
- Comprova que la base de dades PostgreSQL està activa a Render

### Error: "relation 'telemetry_events' does not exist"

La taula s'hauria de crear automàticament. Si no, pots crear-la manualment:

```sql
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

## Alternatives

Si no vols utilitzar PostgreSQL, pots considerar:

1. **Base de dades externa**: Utilitzar un servei com Supabase, Neon, o Railway PostgreSQL
2. **Volum persistent**: Alguns serveis com Railway permeten volums persistents per SQLite
3. **Backup automàtic**: Fer backups periòdics de SQLite i restaurar-los després de cada deploy (no recomanat)
