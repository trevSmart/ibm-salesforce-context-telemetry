/**
 * Migration script to add optimized indexes for slow session aggregation queries.
 *
 * The slow query is:
 * WITH session_aggregates AS (
 *     SELECT
 *         COALESCE(parent_session_id, session_id) AS logical_session_id,
 *         COUNT(*) as count,
 *         MIN(timestamp) as first_event,
 *         MAX(timestamp) as last_event,
 *         SUM(CASE WHEN event = 'session_start' THEN 1 ELSE 0 END) as has_start,
 *         SUM(CASE WHEN event = 'session_end' THEN 1 ELSE 0 END) as has_end
 *     FROM telemetry_events
 *     WHERE (session_id IS NOT NULL OR parent_session_id IS NOT NULL) AND deleted_at IS NULL
 *     GROUP BY COALESCE(parent_session_id, session_id)
 * )
 *
 * This query is slow because COALESCE can't use existing indexes efficiently.
 *
 * Solution: Add composite indexes that can help with the query pattern.
 *
 * Usage: node src/scripts/optimize-session-query-indexes.js
 */

import {init, close} from '../storage/database.js';

async function main() {
	console.log('🚀 Starting session query optimization...\n');

	try {
		// Initialize database connection
		await init();
		console.log('✅ Database connection established');

		const dbType = process.env.DB_TYPE || 'sqlite';
		console.log(`📊 Database type: ${dbType}\n`);

		// Add optimized indexes for session queries
		console.log('📈 Adding optimized indexes for session aggregation queries...');
		await addOptimizedIndexes();
		console.log('✅ Optimized indexes added\n');

		console.log('🎉 Session query optimization completed successfully!');

	} catch (error) {
		console.error('❌ Error during optimization:', error);
		process.exit(1);
	} finally {
		// Close database connection
		await close();
	}
}

async function addOptimizedIndexes() {
	const dbType = process.env.DB_TYPE || 'sqlite';

	if (dbType === 'sqlite') {
		await addSQLiteIndexes();
	} else if (dbType === 'postgresql') {
		await addPostgreSQLIndexes();
	}
}

async function addSQLiteIndexes() {
	// For SQLite, we'll add indexes that can help with the session aggregation query
	// The key is to have indexes on the columns used in the COALESCE expression

	const indexes = [
		// Index for when parent_session_id is used (covers COALESCE case when parent_session_id IS NOT NULL)
		'CREATE INDEX IF NOT EXISTS idx_parent_session_timestamp ON telemetry_events(parent_session_id, timestamp)',

		// Index for when session_id is used (covers COALESCE case when parent_session_id IS NULL)
		'CREATE INDEX IF NOT EXISTS idx_session_timestamp ON telemetry_events(session_id, timestamp)',

		// Composite index for the WHERE clause filtering
		'CREATE INDEX IF NOT EXISTS idx_deleted_session_parent ON telemetry_events(deleted_at, session_id, parent_session_id)',

		// Index for event filtering within sessions
		'CREATE INDEX IF NOT EXISTS idx_session_event_timestamp ON telemetry_events(session_id, event, timestamp)',
		'CREATE INDEX IF NOT EXISTS idx_parent_session_event_timestamp ON telemetry_events(parent_session_id, event, timestamp)'
	];

	console.log('   Adding SQLite indexes for session queries...');

	for (const indexSQL of indexes) {
		try {
			// Execute the index creation
			const db = (await import('../storage/database.js')).getSqliteDb();
			if (db) {
				db.exec(indexSQL);
				const indexName = indexSQL.match(/idx_\w+/)[0];
				console.log(`   ✓ Created index: ${indexName}`);
			}
		} catch (error) {
			console.log(`   ⚠️  Failed to create index: ${error.message}`);
		}
	}
}

async function addPostgreSQLIndexes() {
	// For PostgreSQL, we can create more sophisticated indexes

	const indexes = [
		// Index for when parent_session_id is used (covers COALESCE case when parent_session_id IS NOT NULL)
		'CREATE INDEX IF NOT EXISTS idx_parent_session_timestamp ON telemetry_events(parent_session_id, timestamp)',

		// Index for when session_id is used (covers COALESCE case when parent_session_id IS NULL)
		'CREATE INDEX IF NOT EXISTS idx_session_timestamp ON telemetry_events(session_id, timestamp)',

		// Partial index for non-deleted events with sessions (helps with WHERE clause)
		'CREATE INDEX IF NOT EXISTS idx_active_sessions ON telemetry_events(session_id, parent_session_id, timestamp) WHERE deleted_at IS NULL',

		// Index for event filtering within sessions
		'CREATE INDEX IF NOT EXISTS idx_session_event_timestamp ON telemetry_events(session_id, event, timestamp)',
		'CREATE INDEX IF NOT EXISTS idx_parent_session_event_timestamp ON telemetry_events(parent_session_id, event, timestamp)',

		// Covering index for the aggregation query (includes all needed columns)
		'CREATE INDEX IF NOT EXISTS idx_session_aggregation ON telemetry_events(COALESCE(parent_session_id, session_id), timestamp, event) WHERE deleted_at IS NULL'
	];

	console.log('   Adding PostgreSQL indexes for session queries...');

	for (const indexSQL of indexes) {
		try {
			const db = (await import('../storage/database.js')).getPostgresPool();
			if (db) {
				await db.query(indexSQL);
				const indexName = indexSQL.match(/idx_\w+/)[0];
				console.log(`   ✓ Created index: ${indexName}`);
			}
		} catch (error) {
			console.log(`   ⚠️  Failed to create index: ${error.message}`);
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
	addOptimizedIndexes,
	addSQLiteIndexes,
	addPostgreSQLIndexes
};