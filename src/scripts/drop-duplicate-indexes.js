/**
 * Database optimization script that performs two key operations:
 * 1. Drop duplicate indexes that are covered by more comprehensive indexes (improves write performance)
 * 2. Create performance indexes for JSON operations (improves read performance)
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
 * - idx_event_id (covered by idx_event_id_created_at)
 * - idx_parent_session_id (covered by idx_parent_session_timestamp)
 * - idx_session_id (covered by idx_session_timestamp)
 * - idx_team_id (covered by idx_team_id_created_at)
 * - idx_user_id (covered by idx_user_created_at)
 *
 * On users:
 * - idx_username (covered by users_username_key)
 *
 * Usage: node src/scripts/drop-duplicate-indexes.js
 *
 * This script should be run periodically to optimize database performance.
 * The duplicate index removal improves write performance, while the performance indexes
 * improve read performance for JSON-based queries.
 */

import {init, close, getPostgresPool} from '../storage/database.js';

async function main() {
	console.log('🚀 Starting database optimization...\n');

	try {
		// Initialize database connection
		await init();
		console.log('✅ Database connection established');
		console.log('📊 Database type: PostgreSQL\n');

		// Drop duplicate indexes
		console.log('🗑️  Dropping duplicate indexes...');
		await dropPostgreSQLIndexes();
		console.log('✅ Duplicate indexes removed\n');

		// Create performance indexes
		console.log('⚡ Creating performance indexes...');
		await createPostgreSQLPerformanceIndexes();
		console.log('✅ Performance indexes created\n');

		console.log('🎉 Database optimization completed successfully!');

	} catch (error) {
		console.error('❌ Error during database optimization:', error);
		process.exit(1);
	} finally {
		// Close database connection
		await close();
	}
}

async function dropPostgreSQLIndexes() {
	const dbInstance = getPostgresPool();

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
		'idx_event_id',
		'idx_parent_session_id',
		'idx_session_id',
		'idx_team_id',
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

async function createPostgreSQLPerformanceIndexes() {
	const dbInstance = getPostgresPool();

	if (!dbInstance) {
		throw new Error('PostgreSQL database instance not available');
	}

	console.log('   Creating PostgreSQL performance indexes...');

	// Create functional indexes for common JSON access patterns
	const indexesToCreate = [
		// Index for NULL checks in denormalization query
		'CREATE INDEX IF NOT EXISTS idx_telemetry_events_null_fields ON telemetry_events(org_id, user_name, tool_name, error_message) WHERE org_id IS NULL OR user_name IS NULL OR tool_name IS NULL OR error_message IS NULL',

		// Functional indexes for common JSON access patterns (most frequently used)
		'CREATE INDEX IF NOT EXISTS idx_telemetry_events_data_org_id ON telemetry_events ((data->>\'orgId\')) WHERE data IS NOT NULL',
		'CREATE INDEX IF NOT EXISTS idx_telemetry_events_data_user_name ON telemetry_events ((data->>\'userName\')) WHERE data IS NOT NULL',
		'CREATE INDEX IF NOT EXISTS idx_telemetry_events_data_tool_name ON telemetry_events ((data->>\'toolName\')) WHERE data IS NOT NULL',

		// Index for nested state.org.id pattern
		'CREATE INDEX IF NOT EXISTS idx_telemetry_events_data_state_org_id ON telemetry_events ((data->\'state\'->\'org\'->>\'id\')) WHERE data->\'state\'->\'org\'->>\'id\' IS NOT NULL',

		// Partial index for data IS NOT NULL to speed up the WHERE clause
		'CREATE INDEX IF NOT EXISTS idx_telemetry_events_data_not_null ON telemetry_events(id) WHERE data IS NOT NULL',

		// Indexes for session queries performance
		'CREATE INDEX IF NOT EXISTS idx_telemetry_events_session_logical ON telemetry_events(COALESCE(parent_session_id, session_id), timestamp) WHERE session_id IS NOT NULL OR parent_session_id IS NOT NULL',
		'CREATE INDEX IF NOT EXISTS idx_telemetry_events_session_user_timestamp ON telemetry_events(COALESCE(parent_session_id, session_id), timestamp, user_id) WHERE session_id IS NOT NULL OR parent_session_id IS NOT NULL',
		'CREATE INDEX IF NOT EXISTS idx_telemetry_events_session_timestamp ON telemetry_events(session_id, timestamp) WHERE session_id IS NOT NULL',
		'CREATE INDEX IF NOT EXISTS idx_telemetry_events_parent_session_timestamp ON telemetry_events(parent_session_id, timestamp) WHERE parent_session_id IS NOT NULL',

		// Index for event-based filtering in sessions
		'CREATE INDEX IF NOT EXISTS idx_telemetry_events_event_timestamp ON telemetry_events(event, timestamp)',
		'CREATE INDEX IF NOT EXISTS idx_telemetry_events_event_session ON telemetry_events(event, COALESCE(parent_session_id, session_id)) WHERE event IN (\'session_start\', \'session_end\')',
	];

	for (const indexSql of indexesToCreate) {
		try {
			await dbInstance.query(indexSql);
			console.log(`   ✓ Created performance index`);
		} catch (error) {
			console.log(`   ⚠️  Failed to create performance index: ${error.message}`);
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
	dropPostgreSQLIndexes,
	createPostgreSQLPerformanceIndexes
};
