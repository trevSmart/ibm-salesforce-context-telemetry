#!/usr/bin/env node

/**
 * Script per exportar dades de la base de dades PostgreSQL
 *
 * Ús:
 *   node src/scripts/export-database.js [output-file]
 *
 * Variables d'entorn requerides:
 *   DATABASE_URL - URL de connexió PostgreSQL
 *   DATABASE_SSL - true/false (opcional, per defecte false)
 *
 * Exemple:
 *   DATABASE_URL="postgresql://user:pass@host/db" DATABASE_SSL=true node src/scripts/export-database.js backup.sql
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const outputFile = process.argv[2] || `backup_telemetry_${new Date().toISOString().split('T')[0]}.json`;

async function exportDatabase() {
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

    // Exportar events
    console.log('Exportant events de telemetria...');
    const eventsResult = await pool.query(`
			SELECT id, event, timestamp, server_id, version, session_id, user_id, data, received_at, created_at
			FROM telemetry_events
			ORDER BY id ASC
		`);
    const events = eventsResult.rows.map(row => ({
      ...row,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data
    }));
    console.log(`✓ Exportats ${events.length} events`);

    // Exportar usuaris
    console.log('Exportant usuaris...');
    const usersResult = await pool.query(`
			SELECT id, username, password_hash, created_at, last_login
			FROM users
			ORDER BY id ASC
		`);
    const users = usersResult.rows;
    console.log(`✓ Exportats ${users.length} usuaris`);

    // Exportar organitzacions
    console.log('Exportant organitzacions...');
    const orgsResult = await pool.query(`
			SELECT server_id, company_name, created_at, updated_at
			FROM orgs
			ORDER BY created_at ASC
		`);
    const orgs = orgsResult.rows;
    console.log(`✓ Exportades ${orgs.length} organitzacions`);

    // Crear objecte de backup
    const backup = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      statistics: {
        totalEvents: events.length,
        totalUsers: users.length,
        totalOrgs: orgs.length
      },
      data: {
        events,
        users,
        orgs
      }
    };

    // Escriure fitxer
    const outputPath = path.resolve(outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(backup, null, 2), 'utf8');
    console.log(`\n✓ Backup creat: ${outputPath}`);
    console.log('\nResum:');
    console.log(`  - Events: ${events.length}`);
    console.log(`  - Usuaris: ${users.length}`);
    console.log(`  - Organitzacions: ${orgs.length}`);
    console.log(`  - Mida del fitxer: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`);

    await pool.end();
    console.log('\n✓ Exportació completada');
  } catch (error) {
    console.error('\n✗ Error durant l\'exportació:', error.message);
    await pool.end();
    process.exit(1);
  }
}

exportDatabase();
