# Gestió de l'Expiració de la Base de Dades PostgreSQL

La base de dades PostgreSQL a Render (`telemetry-db`) expira el **26 de desembre de 2025**. Aquest document explica les opcions disponibles i com procedir.

## ⚠️ Situació Actual

- **Base de dades**: `telemetry-db` (PostgreSQL Free tier)
- **Data d'expiració**: 26 de desembre de 2025
- **Conseqüència**: La base de dades serà eliminada si no s'actualitza a un pla de pagament

## Opcions Disponibles

### Opció 1: Actualitzar a un Pla de Pagament a Render (Recomanat)

**Avantatges:**
- Manté totes les dades existents
- No requereix migració
- Configuració mínima
- Continuïtat del servei

**Passos:**
1. Accedeix al dashboard de Render
2. Obre la base de dades `telemetry-db`
3. Clic a "Upgrade your instance"
4. Escull un pla:
   - **Starter** ($7/mes): 256 MB, adequat per desenvolupament
   - **Standard** ($20/mes): 1 GB, adequat per producció
5. Confirma l'actualització

**Costos:**
- Starter: ~$7/mes (84$/any)
- Standard: ~$20/mes (240$/any)

### Opció 2: Crear Nova Base de Dades i Migrar

**Avantatges:**
- Pot ser més econòmic (algunes alternatives tenen plans gratuïts permanents)
- Flexibilitat per canviar de proveïdor

**Desavantatges:**
- Requereix migració de dades
- Pot haver-hi temps d'inactivitat
- Requereix actualitzar variables d'entorn

#### 2.1. Nova Base de Dades a Render (Pla de Pagament)

1. Crea una nova base de dades PostgreSQL a Render amb un pla de pagament
2. Exporta les dades de la base de dades actual (veure secció "Exportar Dades")
3. Importa les dades a la nova base de dades
4. Actualitza `DATABASE_URL` al servei web amb la nova URL

#### 2.2. Migrar a un Proveïdor Alternatiu

**Alternatives recomanades:**

1. **Supabase** (PostgreSQL gratuït permanent)
   - 500 MB gratuïts
   - PostgreSQL complet
   - Fàcil migració

2. **Neon** (PostgreSQL serverless)
   - Pla gratuït generós
   - Escalable automàticament

3. **Railway** (PostgreSQL)
   - $5/mes amb crèdit gratuït mensual
   - Fàcil de configurar

**Passos generals:**
1. Crea la base de dades al nou proveïdor
2. Exporta les dades de Render (veure secció "Exportar Dades")
3. Importa les dades al nou proveïdor
4. Actualitza `DATABASE_URL` al servei web
5. Verifica que tot funciona correctament

### Opció 3: Exportar Dades i Eliminar Base de Dades

Si no necessites continuïtat del servei:

1. Exporta totes les dades (veure secció "Exportar Dades")
2. Guarda el backup de forma segura
3. Deixa que la base de dades expiri
4. Si en el futur necessites les dades, pots importar-les a una nova base de dades

## Exportar Dades Abans de l'Expiració

### Mètode 1: Exportar via pg_dump (Recomanat)

```bash
# Instal·la pg_dump si no el tens
# macOS: brew install postgresql
# Linux: apt-get install postgresql-client

# Exporta totes les dades
pg_dump "$DATABASE_URL" > backup_telemetry_$(date +%Y%m%d).sql

# O exporta només les dades (sense estructura)
pg_dump --data-only "$DATABASE_URL" > backup_telemetry_data_$(date +%Y%m%d).sql
```

### Mètode 2: Exportar via Script Node.js

Utilitza el script `scripts/export-database.js` (veure secció següent).

### Mètode 3: Exportar via Render Dashboard

1. Accedeix al dashboard de Render
2. Obre la base de dades `telemetry-db`
3. Utilitza l'eina de backup/exportació (si està disponible)

## Importar Dades a una Nova Base de Dades

### Via psql

```bash
# Importa el backup
psql "$NEW_DATABASE_URL" < backup_telemetry_YYYYMMDD.sql
```

### Via Script Node.js

Utilitza el script `scripts/import-database.js` (si està disponible).

## Recomanació

**Per desenvolupament/proves:**
- Si el volum de dades és baix (< 100 MB): Considera migrar a Supabase (gratuït permanent)
- Si necessites més espai: Actualitza a Render Starter ($7/mes)

**Per producció:**
- Actualitza a Render Standard ($20/mes) o considera alternatives com Supabase/Neon segons volum

## Checklist Abans de l'Expiració

- [ ] Decidir quina opció seguir
- [ ] Exportar totes les dades com a backup (independentment de l'opció)
- [ ] Si actualitzes a Render: Fer l'actualització abans del 26 de desembre
- [ ] Si migres: Crear nova base de dades, migrar dades, actualitzar variables d'entorn
- [ ] Verificar que tot funciona després dels canvis
- [ ] Documentar la nova configuració

## Suport

Si tens problemes amb la migració o exportació, consulta:
- Documentació de Render: https://render.com/docs
- Documentació de PostgreSQL: https://www.postgresql.org/docs/
