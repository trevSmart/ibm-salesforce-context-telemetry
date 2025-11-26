# Database Configuration

El servidor de telemetria suporta múltiples tipus de bases de dades per emmagatzemar els events de telemetria.

## Opcions Disponibles

### SQLite (Per defecte)

SQLite és la opció per defecte i és perfecta per:
- Desenvolupament local
- Desplegaments petits
- Prototips i proves
- No requereix servidor de base de dades separat

**Avantatges:**
- Fàcil de configurar (no necessita servidor)
- Fitxer únic, fàcil de fer backup
- Ràpid per a volums petits-mitjans
- Zero configuració

**Desavantatges:**
- No ideal per a alt volum (milers d'esdeveniments per segon)
- No suporta múltiples instàncies del servidor escrivint simultàniament

### PostgreSQL

PostgreSQL és ideal per:
- Producció
- Alt volum de dades
- Múltiples instàncies del servidor
- Necessitat de consultes complexes

**Avantatges:**
- Escalable i robust
- Suporta múltiples connexions simultànies
- Consultes SQL avançades
- JSONB per dades estructurades

**Desavantatges:**
- Requereix servidor de base de dades separat
- Més configuració inicial

## Configuració

### SQLite

Per defecte, SQLite s'utilitza automàticament. Només cal configurar la ruta del fitxer (opcional):

```bash
# .env
DB_TYPE=sqlite
DB_PATH=./data/telemetry.db  # Opcional, per defecte: ./data/telemetry.db
```

El fitxer de base de dades es crearà automàticament a la primera execució.

### PostgreSQL

Per usar PostgreSQL, configura la variable d'entorn `DATABASE_URL`:

```bash
# .env
DB_TYPE=postgresql
DATABASE_URL=postgresql://user:password@localhost:5432/telemetry
DATABASE_SSL=false  # true per connexions SSL (ex: Render, Heroku)
```

**Exemple per Render:**
```bash
DB_TYPE=postgresql
DATABASE_URL=postgresql://user:pass@dpg-xxxxx-a/telemetry
DATABASE_SSL=true
```

**Exemple per Heroku:**
```bash
DB_TYPE=postgresql
DATABASE_URL=$DATABASE_URL  # Heroku proporciona aquesta variable automàticament
DATABASE_SSL=true
```

## Instal·lació de Dependències

### SQLite (per defecte)

SQLite ja està inclòs amb `better-sqlite3` (instal·lat per defecte).

### PostgreSQL

Si vols usar PostgreSQL, instal·la el paquet:

```bash
npm install pg --save
```

## Estructura de la Taula

La taula `telemetry_events` s'crea automàticament amb aquesta estructura:

| Camp | Tipus | Descripció |
|------|-------|------------|
| `id` | INTEGER/SERIAL | ID únic de l'esdeveniment |
| `event` | TEXT | Tipus d'esdeveniment (tool_call, tool_error, etc.) |
| `timestamp` | TEXT/TIMESTAMPTZ | Timestamp de l'esdeveniment (ISO 8601) |
| `server_id` | TEXT | ID del servidor MCP |
| `version` | TEXT | Versió del servidor MCP |
| `session_id` | TEXT | ID de la sessió MCP |
| `user_id` | TEXT | ID anònim de l'usuari |
| `data` | TEXT/JSONB | Dades de l'esdeveniment (JSON) |
| `received_at` | TEXT/TIMESTAMPTZ | Timestamp quan el servidor va rebre l'esdeveniment |
| `created_at` | TEXT/TIMESTAMPTZ | Timestamp de creació del registre |

### Índexs

S'han creat índexs per millorar el rendiment de les consultes:
- `idx_event` - Per filtrar per tipus d'esdeveniment
- `idx_timestamp` - Per filtrar per data
- `idx_server_id` - Per filtrar per servidor
- `idx_created_at` - Per consultes temporals

## Consultes Exemples

### SQLite

```sql
-- Contar tots els esdeveniments
SELECT COUNT(*) FROM telemetry_events;

-- Esdeveniments per tipus
SELECT event, COUNT(*) as count
FROM telemetry_events
GROUP BY event;

-- Últims 100 esdeveniments
SELECT * FROM telemetry_events
ORDER BY created_at DESC
LIMIT 100;

-- Esdeveniments d'un servidor específic
SELECT * FROM telemetry_events
WHERE server_id = 'server-instance-123'
ORDER BY created_at DESC;
```

### PostgreSQL

```sql
-- Contar tots els esdeveniments
SELECT COUNT(*) FROM telemetry_events;

-- Esdeveniments per tipus
SELECT event, COUNT(*) as count
FROM telemetry_events
GROUP BY event
ORDER BY count DESC;

-- Últims 100 esdeveniments
SELECT * FROM telemetry_events
ORDER BY created_at DESC
LIMIT 100;

-- Esdeveniments d'un servidor específic
SELECT * FROM telemetry_events
WHERE server_id = 'server-instance-123'
ORDER BY created_at DESC;

-- Consultar dades JSONB
SELECT event, data->>'toolName' as tool_name, data->>'duration' as duration
FROM telemetry_events
WHERE event = 'tool_call'
ORDER BY created_at DESC;
```

## Backup i Manteniment

### SQLite

Per fer backup del fitxer SQLite:

```bash
# Copiar el fitxer
cp data/telemetry.db data/telemetry.db.backup

# O usar sqlite3 per exportar
sqlite3 data/telemetry.db ".backup 'data/telemetry.db.backup'"
```

### PostgreSQL

```bash
# Backup amb pg_dump
pg_dump $DATABASE_URL > telemetry_backup.sql

# Restaurar
psql $DATABASE_URL < telemetry_backup.sql
```

## Retenció de Dades

Per defecte, els esdeveniments es guarden indefinidament. Pots implementar una política de retenció:

### SQLite

```sql
-- Eliminar esdeveniments més antics de 90 dies
DELETE FROM telemetry_events
WHERE created_at < datetime('now', '-90 days');
```

### PostgreSQL

```sql
-- Eliminar esdeveniments més antics de 90 dies
DELETE FROM telemetry_events
WHERE created_at < NOW() - INTERVAL '90 days';
```

Pots crear un cron job o tasca programada per executar aquestes consultes periòdicament.

## Migració de SQLite a PostgreSQL

Si comences amb SQLite i després vols migrar a PostgreSQL:

1. Exporta les dades de SQLite:
```bash
sqlite3 data/telemetry.db .dump > export.sql
```

2. Adapta el fitxer SQL per PostgreSQL (canvia AUTOINCREMENT per SERIAL, etc.)

3. Importa a PostgreSQL:
```bash
psql $DATABASE_URL < export.sql
```

## Troubleshooting

### Error: "Database not initialized"

Assegura't que la base de dades s'inicialitza abans d'usar-la. El servidor ho fa automàticament a l'inici.

### Error: "Cannot find module 'better-sqlite3'"

Instal·la les dependències:
```bash
npm install
```

### Error: PostgreSQL connection failed

- Verifica que `DATABASE_URL` és correcta
- Assegura't que el servidor PostgreSQL està corrent
- Comprova els permisos d'usuari
- Per connexions SSL, configura `DATABASE_SSL=true`

### SQLite locked

Això pot passar si múltiples processos intenten escriure simultàniament. Considera usar PostgreSQL per a producció amb múltiples instàncies.
