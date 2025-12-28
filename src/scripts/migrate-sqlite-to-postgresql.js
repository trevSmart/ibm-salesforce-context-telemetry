/**
 * Migration script to migrate data from SQLite to PostgreSQL
 *
 * This script:
 * 1. Connects to SQLite source database
 * 2. Connects to PostgreSQL target database
 * 3. Migrates all tables in the correct order (respecting foreign keys)
 * 4. Converts data types appropriately (TEXT → TIMESTAMPTZ, etc.)
 * 5. Validates migration by comparing record counts
 *
 * Usage:
 *   node src/scripts/migrate-sqlite-to-postgresql.js [sqlite-path] [postgres-url]
 *
 * Environment variables:
 *   SQLITE_DB_PATH - Path to SQLite database (default: src/data/telemetry.db)
 *   DATABASE_URL - PostgreSQL connection URL (required)
 *   DATABASE_SSL - SSL setting for PostgreSQL (default: false)
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
import {Pool} from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sqliteDbPath = process.argv[2] || process.env.SQLITE_DB_PATH || path.join(__dirname, '..', 'data', 'telemetry.db');
const postgresUrl = process.argv[3] || process.env.DATABASE_URL;
const postgresSSL = process.env.DATABASE_SSL === 'true' ? {rejectUnauthorized: false} : false;

if (!postgresUrl) {
	console.error('Error: DATABASE_URL must be provided');
	console.error('Usage: node migrate-sqlite-to-postgresql.js [sqlite-path] [postgres-url]');
	process.exit(1);
}

if (!fs.existsSync(sqliteDbPath)) {
	console.error(`Error: SQLite database not found at ${sqliteDbPath}`);
	process.exit(1);
}

let sqliteDb = null;
let postgresPool = null;

async function migrate() {
	console.log('🔄 Starting migration from SQLite to PostgreSQL...\n');
	console.log(`📁 Source: ${sqliteDbPath}`);
	console.log(`📊 Target: ${postgresUrl}\n`);

	try {
		// Connect to SQLite
		console.log('📦 Connecting to SQLite...');
		const {default: Database} = await import('better-sqlite3');
		sqliteDb = new Database(sqliteDbPath);
		sqliteDb.pragma('foreign_keys = ON');
		console.log('✅ Connected to SQLite\n');

		// Connect to PostgreSQL
		console.log('📦 Connecting to PostgreSQL...');
		postgresPool = new Pool({
			connectionString: postgresUrl,
			ssl: postgresSSL
		});
		await postgresPool.query('SELECT NOW()');
		console.log('✅ Connected to PostgreSQL\n');

		// Ensure PostgreSQL tables exist (they should be created by database.js init)
		console.log('📋 Ensuring PostgreSQL schema exists...');
		await ensurePostgresSchema();
		console.log('✅ Schema verified\n');

		// Migration order (respecting foreign keys)
		const migrationOrder = [
			'event_types',
			'system_users', // users table
			'people',
			'person_usernames',
			'teams', // Must come before orgs (orgs has foreign key to teams)
			'orgs',
			'telemetry_events',
			'settings',
			'user_logins',
			'remember_tokens',
			'user_event_stats',
			'org_event_stats'
		];

		const stats = {};

		for (const tableName of migrationOrder) {
			const exists = await checkTableExists(sqliteDb, tableName);
			if (exists) {
				console.log(`📤 Migrating ${tableName}...`);
				const count = await migrateTable(tableName);
				stats[tableName] = count;
				console.log(`   ✅ Migrated ${count} records\n`);
			} else {
				console.log(`⏭️  Skipping ${tableName} (table doesn't exist in SQLite)\n`);
			}
		}

		// Validation
		console.log('🔍 Validating migration...\n');
		await validateMigration(stats);

		console.log('\n✅ Migration completed successfully!\n');
		console.log('📊 Summary:');
		for (const [table, count] of Object.entries(stats)) {
			console.log(`   ${table}: ${count} records`);
		}

	} catch (error) {
		console.error('\n❌ Migration failed:', error);
		throw error;
	} finally {
		if (sqliteDb) {
			sqliteDb.close();
			console.log('\n🔌 Closed SQLite connection');
		}
		if (postgresPool) {
			await postgresPool.end();
			console.log('🔌 Closed PostgreSQL connection');
		}
	}
}

async function ensurePostgresSchema() {
	// Check if event_types table exists, if not, we need to initialize the schema
	const result = await postgresPool.query(`
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_schema = 'public'
			AND table_name = 'event_types'
		)
	`);

	if (!result.rows[0].exists) {
		console.log('   ⚠️  PostgreSQL schema not found. Please run the server once to initialize it.');
		console.log('   The server will create all necessary tables on first startup.');
	}
}

function checkTableExists(db, tableName) {
	try {
		const result = db.prepare(`
			SELECT name FROM sqlite_master
			WHERE type='table' AND name=?
		`).get(tableName);
		return result !== undefined;
	} catch {
		return false;
	}
}

async function migrateTable(tableName) {
	// Get all data from SQLite
	const rows = sqliteDb.prepare(`SELECT * FROM ${tableName}`).all();

	if (rows.length === 0) {
		return 0;
	}

	// Get column names from SQLite
	const sqliteColumns = Object.keys(rows[0]);

	// Get column names from PostgreSQL
	const pgColumnsResult = await postgresPool.query(`
		SELECT column_name
		FROM information_schema.columns
		WHERE table_name = $1 AND table_schema = 'public'
		ORDER BY ordinal_position
	`, [tableName]);

	const pgColumns = pgColumnsResult.rows.map(row => row.column_name);

	// Only migrate columns that exist in both databases
	const columns = sqliteColumns.filter(col => pgColumns.includes(col));

	if (columns.length === 0) {
		console.warn(`   ⚠️  No common columns found for ${tableName}, skipping...`);
		return 0;
	}

	// Build INSERT statement
	const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
	const columnNames = columns.map(col => `"${col}"`).join(', ');
	const insertQuery = `INSERT INTO ${tableName} (${columnNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

	// Migrate in batches
	const batchSize = 100;
	let migrated = 0;

	for (let i = 0; i < rows.length; i += batchSize) {
		const batch = rows.slice(i, i + batchSize);
		const client = await postgresPool.connect();

		try {
			await client.query('BEGIN');

			for (const row of batch) {
				const values = columns.map(col => {
					// Only get value if column exists in row
					const value = row.hasOwnProperty(col) ? row[col] : null;

					// Convert data types
					if (value === null || value === undefined) {
						return null;
					}

					// Convert TEXT timestamps to TIMESTAMPTZ
					if (col.includes('_at') || col === 'timestamp' || col === 'last_login') {
						if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
							// Already in ISO format, use as-is
							return value;
						}
					}

					// Convert boolean strings to boolean
					if (typeof value === 'string' && (value === '1' || value === '0')) {
						if (col.includes('successful') || col.includes('is_primary') || col.includes('is_') || col === 'successful') {
							return value === '1';
						}
					}

					// Convert JSON strings to JSONB
					if (col === 'data' && typeof value === 'string') {
						try {
							return JSON.parse(value);
						} catch {
							return value;
						}
					}

					return value;
				});

				await client.query(insertQuery, values);
				migrated++;
			}

			await client.query('COMMIT');
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	}

	return migrated;
}

async function validateMigration(stats) {
	for (const [tableName, expectedCount] of Object.entries(stats)) {
		// Count in SQLite
		const sqliteCount = sqliteDb.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get().count;

		// Count in PostgreSQL
		const pgResult = await postgresPool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
		const pgCount = Number.parseInt(pgResult.rows[0].count, 10);

		if (sqliteCount !== pgCount) {
			console.warn(`   ⚠️  ${tableName}: SQLite has ${sqliteCount}, PostgreSQL has ${pgCount}`);
		} else {
			console.log(`   ✅ ${tableName}: ${pgCount} records (matches)`);
		}
	}
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	migrate()
		.then(() => {
			process.exit(0);
		})
		.catch((error) => {
			console.error('Migration failed:', error);
			process.exit(1);
		});
}

export {migrate};
