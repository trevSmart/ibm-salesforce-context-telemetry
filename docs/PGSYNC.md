# pgsync - Sincronització de Base de Dades

Aquest document explica com usar `pgsync` per aplicar canvis al model de dades a producció sense fer un deploy complet del repositori a Render.

## Què és pgsync?

`pgsync` és una eina de línia de comandes que sincronitza dades i esquemes entre bases de dades PostgreSQL. Està dissenyada per ser:
- **Ràpida**: Sincronitza taules en paral·lel
- **Segura**: Permet definir regles per ofuscar dades sensibles
- **Flexible**: Gestiona diferències d'esquema (columnes faltants o extra)

## Instal·lació

### Opció 1: Ruby Gem (recomanat)

```bash
gem install pgsync
```

### Opció 2: Homebrew (macOS)

```bash
brew install pgsync
```

### Opció 3: Docker

```bash
docker pull ankane/pgsync
alias pgsync="docker run -ti --rm -v .:/conf -w /conf ankane/pgsync"
```

## Configuració

El fitxer `.pgsync.yml` ja està configurat al projecte. Per defecte:
- **Source (from)**: Base de dades local (`DATABASE_URL` del `.env`)
- **Destination (to)**: Base de dades de producció (cal especificar via `DATABASE_URL_PROD`)

## Casos d'Ús

### 1. Aplicar Canvis de Schema a Producció

Quan has fet canvis al model de dades localment i vols aplicar-los a producció sense deploy:

**Pas 1**: Asegura't que els canvis estan aplicats localment
```bash
# Executa el servidor local per crear/actualitzar les taules
npm run dev
# O executa les migracions manualment si n'hi ha
```

**Pas 2**: Verifica els canvis localment
```bash
# Connecta't a la base de dades local i verifica l'esquema
psql $DATABASE_URL -c "\d telemetry_events"
```

**Pas 3**: Sincronitza només l'esquema a producció
```bash
# IMPORTANT: Fes backup de producció abans!
DATABASE_URL_PROD="postgresql://user:pass@host/db" pgsync --schema-only
```

**Què fa `--schema-only`?**
- Crea taules que no existeixen a producció
- Afegeix columnes que falten a producció
- Crea índexs que falten a producció
- **NO elimina** columnes o taules existents (seguretat)

### 2. Sincronitzar Taules Específiques

Si només vols sincronitzar certes taules:

```bash
# Sincronitza només les taules de people
DATABASE_URL_PROD="..." pgsync people

# Sincronitza múltiples taules
DATABASE_URL_PROD="..." pgsync people,person_usernames,orgs
```

### 3. Sincronitzar Grups de Taules Relacionades

Els grups predefinits a `.pgsync.yml` permeten sincronitzar taules relacionades:

```bash
# Sincronitza people + person_usernames
DATABASE_URL_PROD="..." pgsync people

# Sincronitza orgs + teams
DATABASE_URL_PROD="..." pgsync orgs
```

### 4. Sincronitzar Dades (amb Cura!)

⚠️ **ADVERTÈNCIA**: Sincronitzar dades pot sobreescriure dades de producció!

```bash
# Sincronitza només l'esquema (recomanat)
DATABASE_URL_PROD="..." pgsync --schema-only

# Sincronitza esquema + dades (perillós!)
DATABASE_URL_PROD="..." pgsync
```

## Workflow Recomanat per Canvis de Schema

### Escenari: Afegir una Nova Columna

1. **Desenvolupament local**:
   ```javascript
   // Modifica src/storage/database.js
   // Afegeix la columna a la definició de la taula
   await pool.query(`
     ALTER TABLE telemetry_events
     ADD COLUMN IF NOT EXISTS new_field TEXT;
   `);
   ```

2. **Prova localment**:
   ```bash
   npm run dev
   # Verifica que funciona correctament
   ```

3. **Aplica a producció amb pgsync**:
   ```bash
   # Opció A: Si la columna ja està a la definició CREATE TABLE
   DATABASE_URL_PROD="..." pgsync --schema-only

   # Opció B: Si cal executar ALTER TABLE manualment
   psql $DATABASE_URL_PROD -c "ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS new_field TEXT;"
   ```

4. **Verifica**:
   ```bash
   psql $DATABASE_URL_PROD -c "\d telemetry_events"
   ```

### Escenari: Afegir un Nou Índex

1. **Desenvolupament local**:
   ```javascript
   // Modifica src/storage/database.js
   await pool.query(`
     CREATE INDEX IF NOT EXISTS idx_new_field
     ON telemetry_events(new_field);
   `);
   ```

2. **Aplica a producció**:
   ```bash
   DATABASE_URL_PROD="..." pgsync --schema-only
   ```

## Seguretat

### Abans de Sincronitzar

1. **Fes backup de producció**:
   ```bash
   node src/scripts/export-database.js backup_prod_$(date +%Y%m%d_%H%M%S).json
   ```

2. **Verifica la configuració**:
   ```bash
   # Llista les taules que es sincronitzaran
   pgsync --list
   ```

3. **Prova amb `--debug`**:
   ```bash
   DATABASE_URL_PROD="..." pgsync --schema-only --debug
   # Això mostra el SQL que s'executarà sense executar-lo
   ```

### Regles de Dades Sensibles

Si sincronitzes dades (no només esquema), configura regles a `.pgsync.yml`:

```yaml
data_rules:
  password_hash: unique_secret  # Genera un hash únic
  email: unique_email  # Genera un email únic
```

## Eliminar Índexs de Producció

**pgsync NO elimina índexs** per seguretat. Per eliminar índexs de producció, usa el script `drop-index-prod.js`:

```bash
# Llistar tots els índexs
DATABASE_URL_PROD="..." npm run drop-index-prod -- --list

# Trobar índexs duplicats que es poden eliminar
DATABASE_URL_PROD="..." npm run drop-index-prod -- --find-duplicates

# Eliminar un índex específic (dry-run)
DATABASE_URL_PROD="..." npm run drop-index-prod -- idx_old_index

# Eliminar un índex específic (real)
DATABASE_URL_PROD="..." npm run drop-index-prod -- idx_old_index --confirm
```

## Limitacions

- **pgsync NO elimina** columnes, taules o índexs que existeixen a producció però no a local (seguretat)
- Per eliminar columnes, cal fer-ho manualment amb `ALTER TABLE ... DROP COLUMN`
- Per eliminar índexs, usa el script `drop-index-prod.js` (vegeu secció anterior)
- **pgsync NO sincronitza** extensions de PostgreSQL
- Les claus foranes poden causar problemes; usa `--defer-constraints` si cal

## Troubleshooting

### Error: "destination is limited to localhost"

Afegeix `to_safe: true` a `.pgsync.yml` (ja està configurat).

### Error: "Foreign key constraint violation"

Usa `--defer-constraints`:
```bash
DATABASE_URL_PROD="..." pgsync --schema-only --defer-constraints
```

### Error: "SSL connection required"

Assegura't que la URL de producció inclou `?sslmode=require`:
```bash
DATABASE_URL_PROD="postgresql://user:pass@host/db?sslmode=require" pgsync --schema-only
```

## Comparació amb Altres Mètodes

| Mètode | Velocitat | Seguretat | Flexibilitat | Ús Recomanat |
|--------|-----------|-----------|--------------|--------------|
| **pgsync --schema-only** | ⚡⚡⚡ Ràpid | ✅ Segur | ✅ Flexible | Canvis de schema freqüents |
| **Scripts de migració** | ⚡⚡ Mitjà | ✅ Segur | ⚡ Limitada | Canvis complexos, migracions específiques |
| **Deploy complet** | ⚡ Lent | ✅ Segur | ✅ Flexible | Canvis de codi + schema |

## Referències

- [Documentació oficial de pgsync](https://github.com/ankane/pgsync)
- [Documentació de PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)
