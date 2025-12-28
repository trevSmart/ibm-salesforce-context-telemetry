# pg_stat_statements - Query Performance Statistics

Aquest document explica com habilitar i utilitzar `pg_stat_statements` per recollir estadístiques de rendiment de les consultes SQL a PostgreSQL.

## Què és pg_stat_statements?

`pg_stat_statements` és una extensió de PostgreSQL que rastreja estadístiques de planificació i execució de totes les consultes SQL executades pel servidor. Proporciona informació valuosa sobre:

- Queries més executades
- Queries més lentes
- Temps de planificació i execució
- Ús de cache (hit ratio)
- Nombre de files processades
- I/O de blocs

## Limitacions a Render

A Render.com, normalment **no és possible** habilitar `pg_stat_statements` perquè:

1. Requereix modificar `postgresql.conf` (no accessible)
2. Requereix reiniciar el servidor PostgreSQL (no controlable)
3. Requereix privilegis de superusuari (no disponibles)

**Alternativa**: Utilitza la base de dades local per recollir estadístiques i analitzar el rendiment de les consultes.

## Configuració Local

### Opció A: Setup Automàtic (Recomanat)

El projecte inclou un script que automatitza la configuració:

```bash
npm run setup-pg-stat-statements
```

Aquest script:
1. Troba automàticament el fitxer `postgresql.conf`
2. Afegeix `shared_preload_libraries = 'pg_stat_statements'`
3. Crea un backup del fitxer de configuració
4. Reinicia PostgreSQL (si usas Homebrew)
5. Crea l'extensió a la base de dades

### Opció B: Configuració Manual

Si prefereixes fer-ho manualment:

#### Pas 1: Configurar PostgreSQL

Edita el fitxer `postgresql.conf`:

```bash
# Troba la ubicació del fitxer
psql -U postgres -c "SHOW config_file;"

# O en macOS amb Homebrew:
# /opt/homebrew/var/postgresql@16/postgresql.conf
# o
# /usr/local/var/postgresql@16/postgresql.conf
```

Afegeix o modifica aquesta línia:

```conf
shared_preload_libraries = 'pg_stat_statements'
```

#### Pas 2: Reiniciar PostgreSQL

```bash
# macOS amb Homebrew
brew services restart postgresql@16

# Linux (systemd)
sudo systemctl restart postgresql

# Linux (SysVinit)
sudo service postgresql restart
```

#### Pas 3: Habilitar l'Extensió

```bash
# Usant el script del projecte
npm run enable-pg-stat-statements

# O manualment amb psql
psql -d telemetry_local -c "CREATE EXTENSION pg_stat_statements;"
```

## Ús

### Consultar Estadístiques

```bash
# Mostrar top 10 queries per temps total d'execució
npm run pg-stat-statements

# Mostrar top 20 queries
npm run pg-stat-statements -- --top=20

# Mostrar només queries lentes (>100ms)
npm run pg-stat-statements -- --slow

# Sortida en format JSON
npm run pg-stat-statements -- --format=json
```

### Exportar Estadístiques

```bash
# Exportar totes les estadístiques a JSON
npm run export-pg-stat-statements

# Especificar nom de fitxer
npm run export-pg-stat-statements stats_2025-01-15.json
```

**Ús recomanat**: Exporta les estadístiques periòdicament (abans d'aturar PostgreSQL o setmanalment) per tenir backups i poder analitzar-les més tard.

### Exemple de Sortida

```
📊 Query Statistics Summary
════════════════════════════════════════════════════════════════════════════════
Total queries tracked: 45
Total calls: 12,345
Total execution time: 45.23 s
Average mean time: 3.67 ms
Max execution time: 1.23 s
Cache hit ratio: 98.45%
════════════════════════════════════════════════════════════════════════════════

🔝 Top Queries by Total Execution Time
════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
Calls      Total Time     Mean Time      Max Time       Rows        Cache Hit    Query Preview
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
1,234      12.34 s        10.00 ms       123.45 ms      5,678       98.5%        SELECT * FROM telemetry_events WHERE event_id = $1
567        8.90 s         15.67 ms       89.12 ms      2,345       99.2%        INSERT INTO telemetry_events (event, timestamp, ...
```

## Interpretació de les Estadístiques

### Mètriques Clau

- **calls**: Nombre de vegades que s'ha executat la query
- **total_exec_time**: Temps total d'execució (suma de totes les execucions)
- **mean_exec_time**: Temps mitjà d'execució per query
- **max_exec_time**: Temps màxim d'execució
- **rows**: Nombre total de files retornades/afectades
- **cache_hit_ratio**: Percentatge de hits al cache (ideal: >95%)

### Què Buscar

1. **Queries lentes**: `mean_exec_time > 100ms` - candidates per optimització
2. **Baix cache hit ratio**: `< 90%` - potser cal més memòria o millors índexs
3. **Queries freqüents**: `calls` alt - candidates per optimització
4. **Queries amb alt temps total**: `total_exec_time` alt - impacte global alt

## Optimització Basada en Estadístiques

### Exemple 1: Query Lenta

Si veus una query amb `mean_exec_time` alt:

```sql
-- Query lenta
SELECT * FROM telemetry_events WHERE event_id = $1 ORDER BY created_at DESC LIMIT 100;
-- mean_exec_time: 250ms
```

**Solució**: Afegeix un índex compost:

```sql
CREATE INDEX idx_event_id_created_at ON telemetry_events(event_id, created_at DESC);
```

### Exemple 2: Baix Cache Hit Ratio

Si una query té `cache_hit_ratio < 90%`:

**Solució**: 
- Augmenta `shared_buffers` a `postgresql.conf`
- Considera afegir índexs per reduir I/O
- Verifica que les dades càlides caben a memòria

### Exemple 3: Query Frequenta

Si una query s'executa moltes vegades (`calls` alt):

**Solució**:
- Considera preparar statements
- Optimitza la query
- Afegeix índexs si cal

## Persistència de les Estadístiques

### Com Funcionen les Estadístiques

Les estadístiques de `pg_stat_statements` es guarden a **memòria compartida** (shared memory) mentre PostgreSQL està en execució. Per defecte:

- **Es guarden automàticament**: El paràmetre `pg_stat_statements.save = on` (per defecte) fa que les estadístiques es guardin a disc quan PostgreSQL s'atura i es recarreguin quan s'inicia.
- **Límit de queries**: Hi ha un límit de quantes queries diferents es poden rastrejar (`pg_stat_statements.max`, per defecte 5000). Si hi ha més queries diferents, les menys executades es perden.
- **Acumulació**: Les estadístiques es van acumulant mentre PostgreSQL està en execució. Cada execució d'una query actualitza les seves estadístiques.

### Què Passa Quan S'atura PostgreSQL?

1. **Si `pg_stat_statements.save = on`** (per defecte):
   - Les estadístiques es guarden automàticament a disc
   - Es recarreguen quan PostgreSQL s'inicia
   - **No es perden** - es mantenen entre reinicis

2. **Si `pg_stat_statements.save = off`**:
   - Les estadístiques es perden quan s'atura PostgreSQL
   - Cal exportar-les abans d'aturar si vols conservar-les

### Exportar Estadístiques (Recomanat)

Per assegurar-te que no perdis estadístiques valuoses, pots exportar-les abans d'aturar PostgreSQL:

```bash
# Exportar totes les estadístiques a un fitxer JSON
npm run export-pg-stat-statements

# O especificar un fitxer personalitzat
npm run export-pg-stat-statements stats_backup_2025-01-15.json
```

El fitxer exportat conté:
- Data d'exportació
- Resum de totes les estadístiques
- Totes les queries amb les seves mètriques completes
- Versió de PostgreSQL

Això et permet:
- Analitzar estadístiques històriques
- Comparar rendiment entre períodes
- No dependre només de la persistència automàtica

### Verificar Configuració de Persistència

Per verificar si les estadístiques es guarden automàticament:

```sql
-- Verificar configuració
SHOW pg_stat_statements.save;
-- Ha de retornar 'on' per defecte

-- Verificar límit de queries
SHOW pg_stat_statements.max;
-- Per defecte: 5000
```

### Recomanació

1. **Deixa `pg_stat_statements.save = on`** (per defecte) - les estadístiques es guarden automàticament
2. **Exporta periòdicament** les estadístiques amb `npm run export-pg-stat-statements` per tenir backups
3. **Analitza quan vulguis** - les estadístiques es van acumulant, pots analitzar-les quan tinguis suficients dades

## Resetejar Estadístiques

Per començar de nou les estadístiques:

```sql
-- Resetejar totes les estadístiques
SELECT pg_stat_statements_reset();

-- Resetejar estadístiques d'una query específica
SELECT pg_stat_statements_reset(0, 0, queryid) 
FROM pg_stat_statements 
WHERE query LIKE '%telemetry_events%';
```

## Integració amb la UI

Les estadístiques es poden mostrar a la UI mitjançant l'endpoint API:

```
GET /api/pg-stat-statements?top=10&slow=true
```

Això retorna les estadístiques en format JSON per visualitzar-les al dashboard.

## Referències

- [Documentació oficial de PostgreSQL](https://www.postgresql.org/docs/current/pgstatstatements.html)
- [PgHero](https://github.com/ankane/pghero) - Dashboard alternatiu amb estadístiques similars
