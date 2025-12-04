#!/usr/bin/env node

/**
 * Script per importar dades a la base de dades PostgreSQL
 *
 * Ús:
 *   node src/scripts/import-database.js <backup-file>
 *
 * Variables d'entorn requerides:
 *   DATABASE_URL - URL de connexió PostgreSQL
 *   DATABASE_SSL - true/false (opcional, per defecte false)
 *
 * Exemple:
 *   DATABASE_URL="postgresql://user:pass@host/db" DATABASE_SSL=true node src/scripts/import-database.js backup.json
 *
 * ⚠️ ADVERTÈNCIA: Aquest script eliminarà totes les dades existents a la base de dades!
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function importDatabase() {
  const backupFile = process.argv[2];

  if (!backupFile) {
    console.error('Error: Has de proporcionar el fitxer de backup');
    console.error('Ús: node src/scripts/import-database.js <backup-file>');
    process.exit(1);
  }

  if (!fs.existsSync(backupFile)) {
    console.error(`Error: El fitxer ${backupFile} no existeix`);
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL no està configurada');
    console.error('Configura-la com a variable d\'entorn o al fitxer .env');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('Connectant a la base de dades...');
    await pool.query('SELECT NOW()');
    console.log('✓ Connexió establerta');

    // Llegir backup
    console.log(`Llegint backup: ${backupFile}...`);
    const backupContent = fs.readFileSync(backupFile, 'utf8');
    const backup = JSON.parse(backupContent);
    console.log(`✓ Backup llegit (versió ${backup.version || 'desconeguda'})`);
    console.log(`  - Events: ${backup.data?.events?.length || 0}`);
    console.log(`  - Usuaris: ${backup.data?.users?.length || 0}`);
    console.log(`  - Organitzacions: ${backup.data?.orgs?.length || 0}`);

    // Confirmar abans de continuar
    console.log('\n⚠️  ADVERTÈNCIA: Això eliminarà totes les dades existents!');
    console.log('Prem Ctrl+C per cancel·lar o espera 5 segons per continuar...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Iniciar transacció
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Eliminar dades existents
      console.log('\nEliminant dades existents...');
      await client.query('DELETE FROM telemetry_events');
      await client.query('DELETE FROM users');
      await client.query('DELETE FROM orgs');
      console.log('✓ Dades existents eliminades');

      // Importar events
      if (backup.data?.events && backup.data.events.length > 0) {
        console.log(`\nImportant ${backup.data.events.length} events...`);
        let imported = 0;
        for (const event of backup.data.events) {
          await client.query(`
						INSERT INTO telemetry_events
						(event, timestamp, server_id, version, session_id, user_id, data, received_at, created_at)
						VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
					`, [
            event.event,
            event.timestamp,
            event.server_id || null,
            event.version || null,
            event.session_id || null,
            event.user_id || null,
            typeof event.data === 'string' ? JSON.parse(event.data) : event.data,
            event.received_at,
            event.created_at || event.received_at
          ]);
          imported++;
          if (imported % 100 === 0) {
            process.stdout.write(`\r  Progress: ${imported}/${backup.data.events.length}`);
          }
        }
        console.log(`\n✓ ${imported} events importats`);
      }

      // Importar usuaris
      if (backup.data?.users && backup.data.users.length > 0) {
        console.log(`\nImportant ${backup.data.users.length} usuaris...`);
        for (const user of backup.data.users) {
          await client.query(`
						INSERT INTO users (id, username, password_hash, created_at, last_login)
						VALUES ($1, $2, $3, $4, $5)
						ON CONFLICT (id) DO UPDATE SET
							username = EXCLUDED.username,
							password_hash = EXCLUDED.password_hash,
							last_login = EXCLUDED.last_login
					`, [
            user.id,
            user.username,
            user.password_hash,
            user.created_at,
            user.last_login || null
          ]);
        }
        console.log(`✓ ${backup.data.users.length} usuaris importats`);
      }

      // Importar organitzacions
      if (backup.data?.orgs && backup.data.orgs.length > 0) {
        console.log(`\nImportant ${backup.data.orgs.length} organitzacions...`);
        for (const org of backup.data.orgs) {
          await client.query(`
						INSERT INTO orgs (server_id, company_name, created_at, updated_at)
						VALUES ($1, $2, $3, $4)
						ON CONFLICT (server_id) DO UPDATE SET
							company_name = EXCLUDED.company_name,
							updated_at = EXCLUDED.updated_at
					`, [
            org.server_id,
            org.company_name || null,
            org.created_at,
            org.updated_at || org.created_at
          ]);
        }
        console.log(`✓ ${backup.data.orgs.length} organitzacions importades`);
      }

      // Commit transacció
      await client.query('COMMIT');
      console.log('\n✓ Importació completada amb èxit');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await pool.end();
  } catch (error) {
    console.error('\n✗ Error durant la importació:', error.message);
    await pool.end();
    process.exit(1);
  }
}

importDatabase();
