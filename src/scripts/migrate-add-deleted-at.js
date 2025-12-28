/**
 * Migration script to add deleted_at column to telemetry_events table
 * for implementing soft delete functionality (trash bin).
 *
 * This script:
 * 1. Adds the deleted_at column to telemetry_events table
 * 2. Creates necessary indexes
 *
 * Usage: node src/scripts/migrate-add-deleted-at.js
 */

import * as dbModule from '../storage/database.js';

async function main() {
	console.log('🚀 Starting deleted_at column migration...\n');

	try {
		// Initialize database connection
		await dbModule.init();
		console.log('✅ Database connection established');
		console.log('📊 Database type: PostgreSQL\n');

		// Add deleted_at column
		console.log('🔧 Adding deleted_at column...');
		await addDeletedAtColumn();
		console.log('✅ deleted_at column added\n');

		// Create indexes
		console.log('📈 Creating indexes for deleted_at...');
		await createDeletedAtIndexes();
		console.log('✅ Indexes created\n');

		console.log('🎉 Deleted_at migration completed successfully!');

	} catch (error) {
		console.error('❌ Error during migration:', error);
		process.exit(1);
	} finally {
		// Close database connection
		await dbModule.close();
	}
}

async function addDeletedAtColumn() {
	const db = dbModule;
	const dbInstance = db.getPostgresPool ? db.getPostgresPool() : null;
	if (dbInstance) {
		await dbInstance.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
		console.log('   Ensured deleted_at column exists');
	} else {
		throw new Error('PostgreSQL database instance not available');
	}
}

async function createDeletedAtIndexes() {
	const db = dbModule;
	const dbInstance = db.getPostgresPool ? db.getPostgresPool() : null;
	if (dbInstance) {
		await dbInstance.query('CREATE INDEX IF NOT EXISTS idx_deleted_at ON telemetry_events(deleted_at)');
		console.log('   Created idx_deleted_at index');
	} else {
		throw new Error('PostgreSQL database instance not available');
	}
}

// Run the migration
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(error => {
		console.error('❌ Unhandled error:', error);
		process.exit(1);
	});
}

export {
	addDeletedAtColumn,
	createDeletedAtIndexes
};
