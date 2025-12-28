# Deploy a Render

Aquesta guia explica com desplegar el servidor de telemetria a Render amb persistència de dades.

## Base de Dades PostgreSQL

El servidor utilitza PostgreSQL per emmagatzemar les dades de manera persistent. A Render, utilitza la base de dades PostgreSQL que ofereix persistència entre deployments.

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
DATABASE_URL=<Internal Database URL de Render>
DATABASE_SSL=true
```

O preferiblement, utilitza la URL interna per millor rendiment:

```
DATABASE_INTERNAL_URL=<Internal Database URL de Render>
# DATABASE_SSL s'ignora automàticament quan s'utilitza DATABASE_INTERNAL_URL
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

## Pas 5: Optimitzar el Build (Recomanat)

Per reduir significativament el temps de build a Render:

1. **Configura el Build Command a Render**:
   - Al dashboard del teu servei web, ves a "Settings"
   - Busca la secció "Build & Deploy"
   - Canvia el "Build Command" de `npm install` a `npm ci --production`
   - `npm ci` és més ràpid i determinístic que `npm install`
   - El flag `--production` assegura que només s'instal·lin les dependències de producció (no les `devDependencies`), reduint el temps de build i la mida del deploy

2. **El fitxer `.npmrc`** (ja inclòs al repositori):
   - Desactiva l'audit durant l'instal·lació (tarda molt)
   - Optimitza la configuració de npm per producció
   - S'aplica automàticament quan Render fa `npm ci` o `npm install`

**Nota**: Aquestes optimitzacions poden reduir el temps de build fins a un 50% en alguns casos.

## Pas 6: Fer Deploy

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

Utilitza el script de migració inclòs al projecte:

```bash
node src/scripts/migrate-sqlite-to-postgresql.js [sqlite-path] [postgres-url]
```

El script:
1. Connecta a SQLite i PostgreSQL simultàniament
2. Migra les taules en ordre: `event_types` → `system_users` → `people` → `person_usernames` → `orgs` → `telemetry_events` → `teams` → `settings`
3. Gestiona errors i mostra progrés
4. Valida post-migració (comptadors de registres)

**Exemple d'ús:**
```bash
# Des de local, amb accés a la base de dades de Render
node src/scripts/migrate-sqlite-to-postgresql.js \
  ./src/data/telemetry.db \
  postgresql://user:password@dpg-xxxxx-a.oregon-postgres.render.com/telemetry_db
```

## Troubleshooting

### Avís: "connect.session() MemoryStore is not designed for a production environment"

Aquest avís apareix quan les sessions s'emmagatzemen a memòria en comptes d'una base de dades persistent. El sistema utilitza una jerarquia de stores:

1. **PostgreSQL** (recomanat per producció) - sessions persistents a la base de dades
2. **Redis** (alternativa) - sessions a Redis
3. **memorystore** (fallback millorat) - sessions a memòria sense memory leaks (millor que MemoryStore per defecte però encara no ideal per producció)

**Solucions**:
1. **Assegura't que PostgreSQL està configurat** (recomanat):
   - Comprova que `DATABASE_URL` o `DATABASE_INTERNAL_URL` apunta a la base de dades PostgreSQL
   - Assegura't que `DATABASE_SSL=true` (o utilitza `DATABASE_INTERNAL_URL` que no requereix SSL)

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

- Comprova que `DATABASE_URL` o `DATABASE_INTERNAL_URL` apunta a la base de dades PostgreSQL
- Assegura't que la base de dades PostgreSQL no s'ha eliminat o reinicialitzat
- Verifica que la base de dades està activa al dashboard de Render

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

Si vols utilitzar una base de dades PostgreSQL externa en lloc de la de Render:

1. **Base de dades externa**: Utilitzar un servei com Supabase, Neon, o Railway PostgreSQL
2. Configura `DATABASE_URL` amb la connection string de la base de dades externa
3. Assegura't de configurar `DATABASE_SSL=true` per connexions segures
