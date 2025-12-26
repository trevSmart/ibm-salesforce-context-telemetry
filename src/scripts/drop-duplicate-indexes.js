/**
 * Migration script to drop duplicate indexes that are covered by more comprehensive indexes.
 * This improves write performance by reducing index maintenance overhead.
 *
 * The following indexes are being removed as they are covered by composite/unique indexes:
 *
 * On person_usernames:
 * - idx_person_usernames_person_id (covered by idx_person_username)
 * - idx_person_usernames_username (covered by person_usernames_username_org_id_key)
 *
 * On remember_tokens:
 * - idx_remember_token_hash (covered by remember_tokens_token_hash_key)
 *
 * On team_event_users:
 * - idx_team_event_users_team_id (covered by team_event_users_team_id_user_name_key)
 *
 * On teams:
 * - idx_teams_name (covered by teams_name_key)
 *
 * On telemetry_events:
 * - idx_session_logical (covered by idx_session_user_timestamp)
 * - idx_pagination_created_at (covered by idx_created_at_org_id)
 * - idx_created_at (covered by idx_created_at_org_id)
 * - idx_event (covered by idx_event_created_at)
 * - idx_team_id (covered by idx_team_id_created_at)
 * - idx_timestamp (covered by idx_timestamp_event)
 * - idx_user_id (covered by idx_user_created_at)
 *
 * On users:
 * - idx_username (covered by users_username_key)
 *
 * Usage: node src/scripts/drop-duplicate-indexes.js
 */

import {init, close, getSqliteDb, getPostgresPool} from '../storage/database.js';

async function main() {
	console.log('🚀 Starting duplicate indexes removal...\n');

	try {
		// Initialize database connection
		await init();
		console.log('✅ Database connection established');

		const dbType = process.env.DB_TYPE || 'sqlite';
		console.log(`📊 Database type: ${dbType}\n`);

		// Drop duplicate indexes
		console.log('🗑️  Dropping duplicate indexes...');
		await dropDuplicateIndexes();
		console.log('✅ Duplicate indexes removed\n');

		console.log('🎉 Duplicate indexes removal completed successfully!');

	} catch (error) {
		console.error('❌ Error during index removal:', error);
		process.exit(1);
	} finally {
		// Close database connection
		await close();
	}
}

async function dropDuplicateIndexes() {
	const dbType = process.env.DB_TYPE || 'sqlite';

	if (dbType === 'sqlite') {
		await dropSQLiteIndexes();
	} else if (dbType === 'postgresql') {
		await dropPostgreSQLIndexes();
	}
}

async function dropSQLiteIndexes() {
	const dbInstance = getSqliteDb ? getSqliteDb() : null;

	if (!dbInstance) {
		throw new Error('SQLite database instance not available');
	}

	const indexesToDrop = [
		// person_usernames table
		'idx_person_usernames_person_id',
		'idx_person_usernames_username',
		// remember_tokens table
		'idx_remember_token_hash',
		// team_event_users table
		'idx_team_event_users_team_id',
		// teams table
		'idx_teams_name',
		// telemetry_events table
		'idx_session_logical',
		'idx_pagination_created_at',
		'idx_created_at',
		'idx_event',
		'idx_team_id',
		'idx_timestamp',
		'idx_user_id',
		// users table
		'idx_username'
	];

	console.log('   Dropping SQLite indexes...');

	for (const indexName of indexesToDrop) {
		try {
			// Check if index exists first
			const indexExists = dbInstance.prepare(`
				SELECT name FROM sqlite_master
				WHERE type='index' AND name=?
			`).get(indexName);

			if (indexExists) {
				dbInstance.exec(`DROP INDEX IF EXISTS ${indexName}`);
				console.log(`   ✓ Dropped index: ${indexName}`);
			} else {
				console.log(`   - Index ${indexName} does not exist (skipping)`);
			}
		} catch (error) {
			console.log(`   ⚠️  Failed to drop index ${indexName}: ${error.message}`);
		}
	}
}

async function dropPostgreSQLIndexes() {
	const dbInstance = getPostgresPool ? getPostgresPool() : null;

	if (!dbInstance) {
		throw new Error('PostgreSQL database instance not available');
	}

	const indexesToDrop = [
		// person_usernames table
		'idx_person_usernames_person_id',
		'idx_person_usernames_username',
		// remember_tokens table
		'idx_remember_token_hash',
		// team_event_users table
		'idx_team_event_users_team_id',
		// teams table
		'idx_teams_name',
		// telemetry_events table
		'idx_session_logical',
		'idx_pagination_created_at',
		'idx_created_at',
		'idx_event',
		'idx_team_id',
		'idx_timestamp',
		'idx_user_id',
		// users table
		'idx_username'
	];

	console.log('   Dropping PostgreSQL indexes...');

	for (const indexName of indexesToDrop) {
		try {
			// Check if index exists first
			const result = await dbInstance.query(`
				SELECT 1 FROM pg_indexes
				WHERE indexname = $1
			`, [indexName]);

			if (result.rows.length > 0) {
				await dbInstance.query(`DROP INDEX IF EXISTS ${indexName}`);
				console.log(`   ✓ Dropped index: ${indexName}`);
			} else {
				console.log(`   - Index ${indexName} does not exist (skipping)`);
			}
		} catch (error) {
			console.log(`   ⚠️  Failed to drop index ${indexName}: ${error.message}`);
		}
	}
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(error => {
		console.error('❌ Unhandled error:', error);
		process.exit(1);
	});
}

export {
	dropDuplicateIndexes,
	dropSQLiteIndexes,
	dropPostgreSQLIndexes
};