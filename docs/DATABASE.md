# Database Configuration

El servidor de telemetria utilitza PostgreSQL per emmagatzemar els events de telemetria.

## PostgreSQL

PostgreSQL és la base de dades utilitzada per:
- Desenvolupament local
- Producció
- Alt volum de dades
- Múltiples instàncies del servidor
- Necessitat de consultes complexes

**Avantatges:**
- Escalable i robust
- Suporta múltiples connexions simultànies
- Consultes SQL avançades
- JSONB per dades estructurades
- Índexs funcionals per millorar el rendiment

## Configuració

### Desenvolupament Local

Per usar PostgreSQL localment, configura la variable d'entorn `DATABASE_URL`:

```bash
# .env
DATABASE_URL=postgresql://localhost:5432/telemetry_local
DATABASE_SSL=false  # false per connexions locals
```

**Instal·lació de PostgreSQL local (macOS):**
```bash
# Instal·lar PostgreSQL
brew install postgresql@16

# Iniciar el servei
brew services start postgresql@16

# Crear base de dades
createdb telemetry_local
```

### Producció (Render.com)

Per producció a Render, configura les variables d'entorn:

```bash
# .env
DATABASE_URL=postgresql://user:pass@dpg-xxxxx-a/telemetry
DATABASE_SSL=true

# O preferiblement, usa la URL interna per millor rendiment
DATABASE_INTERNAL_URL=postgresql://user:pass@internal-hostname/database
# DATABASE_SSL s'ignora automàticament quan s'usa DATABASE_INTERNAL_URL
```

**Variables d'entorn clau:**
- `DATABASE_URL`: Connection string per PostgreSQL (URL externa - s'utilitza quan DATABASE_INTERNAL_URL no està configurada)
- `DATABASE_INTERNAL_URL`: Connection string interna per PostgreSQL (preferida per serveis Render.com a la mateixa regió). Quan està configurada, aquesta URL s'utilitza en lloc de DATABASE_URL per xarxa interna més ràpida.
- `DATABASE_SSL`: Habilita SSL per PostgreSQL (true/false). Nota: SSL es deshabilita automàticament quan s'utilitza DATABASE_INTERNAL_URL.

## Instal·lació de Dependències

PostgreSQL requereix el paquet `pg`:

```bash
npm install pg --save
```

El paquet ja està inclòs a les dependències del projecte.

## Estructura de la Taula

La taula `telemetry_events` s'crea automàticament amb aquesta estructura:

| Camp | Tipus | Descripció |
|------|-------|------------|
| `id` | SERIAL | ID únic de l'esdeveniment |
| `event` | TEXT | Tipus d'esdeveniment (tool_call, tool_error, etc.) |
| `timestamp` | TIMESTAMPTZ | Timestamp de l'esdeveniment (ISO 8601) |
| `server_id` | TEXT | ID del servidor MCP |
| `version` | TEXT | Versió del servidor MCP |
| `session_id` | TEXT | ID de la sessió MCP |
| `parent_session_id` | TEXT | ID de la sessió pare (per sessions niades) |
| `user_id` | TEXT | ID anònim de l'usuari |
| `data` | JSONB | Dades de l'esdeveniment (JSON) |
| `received_at` | TIMESTAMPTZ | Timestamp quan el servidor va rebre l'esdeveniment |
| `created_at` | TIMESTAMPTZ | Timestamp de creació del registre |
| `deleted_at` | TIMESTAMPTZ | Timestamp de soft delete (NULL si no està esborrat) |

### Índexs

S'han creat índexs per millorar el rendiment de les consultes:
- `idx_event` - Per filtrar per tipus d'esdeveniment
- `idx_timestamp` - Per filtrar per data
- `idx_server_id` - Per filtrar per servidor
- `idx_created_at` - Per consultes temporals
- `idx_session_id` - Per consultes de sessions
- `idx_parent_session_id` - Per consultes de sessions pare
- Índexs funcionals per accés a camps JSONB

## Consultes Exemples

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

-- Esdeveniments no esborrats (soft delete)
SELECT * FROM telemetry_events
WHERE deleted_at IS NULL
ORDER BY created_at DESC;
```

## Backup i Manteniment

### PostgreSQL

```bash
# Backup amb pg_dump
pg_dump $DATABASE_URL > telemetry_backup.sql

# Restaurar
psql $DATABASE_URL < telemetry_backup.sql

# Backup comprimit
pg_dump $DATABASE_URL | gzip > telemetry_backup.sql.gz

# Restaurar des de backup comprimit
gunzip < telemetry_backup.sql.gz | psql $DATABASE_URL
```

## Retenció de Dades

Per defecte, els esdeveniments es guarden indefinidament. Pots implementar una política de retenció:

```sql
-- Eliminar esdeveniments més antics de 90 dies
DELETE FROM telemetry_events
WHERE created_at < NOW() - INTERVAL '90 days';
```

Pots crear un cron job o tasca programada per executar aquestes consultes periòdicament.

## Migració de Dades

Si tens dades existents en SQLite i vols migrar a PostgreSQL, utilitza el script de migració:

```bash
node src/scripts/migrate-sqlite-to-postgresql.js [sqlite-path] [postgres-url]
```

El script:
1. Connecta a SQLite i PostgreSQL simultàniament
2. Migra les taules en ordre: `event_types` → `system_users` → `people` → `person_usernames` → `orgs` → `telemetry_events` → `teams` → `settings`
3. Gestiona errors i mostra progrés
4. Valida post-migració (comptadors de registres)

## Troubleshooting

### Error: "Database not initialized"

Assegura't que la base de dades s'inicialitza abans d'usar-la. El servidor ho fa automàticament a l'inici.

### Error: PostgreSQL connection failed

- Verifica que `DATABASE_URL` o `DATABASE_INTERNAL_URL` és correcta
- Assegura't que el servidor PostgreSQL està corrent
- Comprova els permisos d'usuari
- Per connexions SSL, configura `DATABASE_SSL=true`
- Per connexions locals, configura `DATABASE_SSL=false`

### Error: "Cannot find module 'pg'"

Instal·la les dependències:
```bash
npm install
```

### Millorar Rendiment

- Utilitza `DATABASE_INTERNAL_URL` quan sigui possible (Render.com)
- Executa `node src/scripts/optimize-database.js` periòdicament per optimitzar índexs
- Considera usar connection pooling (ja configurat per defecte)
