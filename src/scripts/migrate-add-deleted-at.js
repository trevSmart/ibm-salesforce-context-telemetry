#!/usr/bin/env node

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

const dbModule = require('../storage/database');

async function main() {
	console.log('🚀 Starting deleted_at column migration...\n');

	try {
		// Initialize database connection
		await dbModule.init();
		console.log('✅ Database connection established');

		const dbType = process.env.DB_TYPE || 'sqlite';
		console.log(`📊 Database type: ${dbType}\n`);

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
	const dbType = process.env.DB_TYPE || 'sqlite';

	if (dbType === 'sqlite') {
		const db = require('../storage/database');
		const dbInstance = db.getSqliteDb ? db.getSqliteDb() : null;
		if (dbInstance) {
			const columns = dbInstance.prepare('PRAGMA table_info(telemetry_events)').all();
			const columnNames = columns.map(col => col.name);

			if (!columnNames.includes('deleted_at')) {
				dbInstance.exec('ALTER TABLE telemetry_events ADD COLUMN deleted_at TEXT');
				console.log('   Added deleted_at column');
			} else {
				console.log('   deleted_at column already exists');
			}
		}
	} else if (dbType === 'postgresql') {
		const db = require('../storage/database');
		const dbInstance = db.getPostgresPool ? db.getPostgresPool() : null;
		if (dbInstance) {
			await dbInstance.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
			console.log('   Ensured deleted_at column exists');
		}
	}
}

async function createDeletedAtIndexes() {
	const dbType = process.env.DB_TYPE || 'sqlite';

	if (dbType === 'sqlite') {
		const db = require('../storage/database');
		const dbInstance = db.getSqliteDb ? db.getSqliteDb() : null;
		if (dbInstance) {
			dbInstance.exec('CREATE INDEX IF NOT EXISTS idx_deleted_at ON telemetry_events(deleted_at)');
			console.log('   Created idx_deleted_at index');
		}
	} else if (dbType === 'postgresql') {
		const db = require('../storage/database');
		const dbInstance = db.getPostgresPool ? db.getPostgresPool() : null;
		if (dbInstance) {
			await dbInstance.query('CREATE INDEX IF NOT EXISTS idx_deleted_at ON telemetry_events(deleted_at)');
			console.log('   Created idx_deleted_at index');
		}
	}
}

// Run the migration
if (require.main === module) {
	main().catch(error => {
		console.error('❌ Unhandled error:', error);
		process.exit(1);
	});
}

module.exports = {
	addDeletedAtColumn,
	createDeletedAtIndexes
};