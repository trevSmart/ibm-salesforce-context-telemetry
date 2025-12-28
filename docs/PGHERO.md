# PgHero - Monitorització de PostgreSQL

Aquest projecte inclou un dashboard de monitorització:

- **PgHero**: Dashboard de rendiment per a PostgreSQL que permet monitorar i analitzar el rendiment de la base de dades, incloent la detecció d'índexs duplicats.

## Instal·lació Local (Sense Docker)

Aquest projecte inclou una configuració per executar PgHero localment sense necessitat de Docker, connectant-se directament a la base de dades PostgreSQL.

### Requisits

- Ruby instal·lat al sistema (normalment ja està instal·lat a macOS)
- Accés a la base de dades PostgreSQL remota (External Database URL de Render)

### Configuració Ràpida

1. **Configura la connexió a la base de dades**

   Crea un fitxer `.env` a la carpeta `dev/pghero-local/` amb la teva connexió:

   ```bash
   # dev/pghero-local/.env

   # PgHero - PostgreSQL connection
   DATABASE_URL=postgresql://localhost:5432/telemetry_local

   # Disable SSL for local PostgreSQL connections
   DATABASE_SSL=false
   ```

   **Important**: Per desenvolupament local, utilitza la connexió a PostgreSQL local. Per producció, utilitza la **External Database URL** de Render (no l'Internal).

2. **Instal·la les dependències Ruby**

   ```bash
   cd dev/pghero-local
   bundle install
   ```

   Si no tens `bundle` instal·lat:

   ```bash
   gem install bundler
   ```

3. **Executa els dashboards**

   Opció 1: Utilitzant el script npm (recomanat):

   ```bash
   npm run pghero
   ```

   Opció 2: Directament amb el script shell:

   ```bash
   ./dev/pghero-local/start.sh
   ```

   Opció 3: Manualment:

   ```bash
   cd dev/pghero-local
   bundle exec puma
   ```

4. **Accedeix al dashboard**

   Un cop executat, obre el teu navegador i accedeix a:

   - **PgHero**: http://localhost:9292/pghero
   - **Root** (redirigeix a PgHero): http://localhost:9292

### Configuració per a Desenvolupament Local

Per desenvolupament local, PgHero es connecta directament a la base de dades PostgreSQL local:

```bash
# dev/pghero-local/.env
DATABASE_URL=postgresql://localhost:5432/telemetry_local
DATABASE_SSL=false
```

Assegura't que PostgreSQL estigui executant-se localment i que la base de dades `telemetry_local` existeixi.

### Configuració per a Producció (Render)

Per connectar-se a una base de dades PostgreSQL allotjada a Render:

1. Accedeix al dashboard de Render: https://dashboard.render.com
2. Ves a la teva base de dades PostgreSQL
3. A la secció "Connections" trobaràs:
   - **Internal Database URL**: Per connexions des de serveis Render a la mateixa regió
   - **External Database URL**: Per connexions des de fora de Render (el teu ordinador)
4. Copia la **External Database URL** i afegeix-la al fitxer `.env`

```bash
# dev/pghero-local/.env
DATABASE_URL=postgresql://user:password@dpg-xxxxx-a.oregon-postgres.render.com/telemetry_db
```

### Autenticació (Opcional)

Si vols protegir l'accés a PgHero, afegeix al fitxer `.env`:

```bash
PGHERO_USERNAME=admin
PGHERO_PASSWORD=your-secure-password
```

### Canviar el Port

Per defecte, PgHero s'executa al port 9292. Per canviar-lo, modifica el script `start.sh` o executa directament:

```bash
cd pghero-local
bundle exec puma -p 8080
```

### Funcionalitats de PgHero

PgHero proporciona informació sobre:

- **Query Performance**: Consultes lentes i problemàtiques
- **Index Usage**: Ús d'índexs i recomanacions
- **Table Statistics**: Estadístiques de taules i mides
- **Connection Stats**: Estadístiques de connexions
- **Query Stats**: Estadístiques detallades de consultes (requereix `pg_stat_statements`)

### Habilitar pg_stat_statements

Per obtenir estadístiques detallades de consultes, necessites habilitar l'extensió `pg_stat_statements` a PostgreSQL:

1. Connecta't a la base de dades com a superusuari
2. Executa:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

**Nota**: A Render, aquesta extensió pot estar ja habilitada. Si no ho està, hauràs de contactar amb el suport o verificar els permisos de la base de dades.

### Solució de Problemes

**Error: "DATABASE_URL no està configurada"**

- Assegura't que el fitxer `.env` existeix a `dev/pghero-local/` o al directori arrel del projecte
- Verifica que la variable `DATABASE_URL` estigui ben formatada

**Error: "Could not find gem 'pghero'"**

- Executa `bundle install` dins del directori `pghero-local/`
- Assegura't que tens Ruby i bundler instal·lats

**Error de connexió a la base de dades**

- Verifica que utilitzes la **External Database URL** (no l'Internal)
- Assegura't que la base de dades permet connexions externes
- Verifica que el firewall no estigui bloquejant la connexió

**Port ja en ús**

- Atura altres processos que estiguin utilitzant el port 9292
- O canvia el port utilitzant `-p` amb puma

### Alternatives a Docker

Si no pots usar Docker Desktop per polítiques d'empresa, aquesta solució Ruby standalone és perfecta. Altres alternatives (que també poden estar restringides) inclouen:

- **Podman**: Daemonless container engine
- **Colima**: Containers on Lima
- **Lima**: Linux virtual machines
- **Rancher Desktop**: GUI amb suport Kubernetes

Però la solució Ruby standalone és la més simple i no requereix contenidors.
