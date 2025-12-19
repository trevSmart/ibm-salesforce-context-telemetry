#!/usr/bin/env node

/**
 * Migration script to add error_message column to telemetry_events table
 * for normalizing error messages from tool_error events.
 *
 * This script:
 * 1. Adds the error_message column to telemetry_events table
 * 2. Creates necessary indexes
 *
 * Usage: node src/scripts/migrate-add-error-message.js
 */

const dbModule = require('../storage/database');

async function main() {
	console.log('🚀 Starting error_message column migration...\n');

	try {
		// Initialize database connection
		await dbModule.init();
		console.log('✅ Database connection established');

		const dbType = process.env.DB_TYPE || 'sqlite';
		console.log(`📊 Database type: ${dbType}\n`);

		// Add error_message column
		console.log('🔧 Adding error_message column...');
		await addErrorMessageColumn();
		console.log('✅ error_message column added\n');

		// Create indexes
		console.log('📈 Creating indexes for error_message...');
		await createErrorMessageIndexes();
		console.log('✅ Indexes created\n');

		console.log('🎉 Error_message migration completed successfully!');

	} catch (error) {
		console.error('❌ Error during migration:', error);
		process.exit(1);
	} finally {
		// Close database connection
		await dbModule.close();
	}
}

async function addErrorMessageColumn() {
	const dbType = process.env.DB_TYPE || 'sqlite';

	if (dbType === 'sqlite') {
		const db = require('../storage/database');
		const dbInstance = db.getSqliteDb ? db.getSqliteDb() : null;
		if (dbInstance) {
			const columns = dbInstance.prepare('PRAGMA table_info(telemetry_events)').all();
			const columnNames = columns.map(col => col.name);

			if (!columnNames.includes('error_message')) {
				dbInstance.exec('ALTER TABLE telemetry_events ADD COLUMN error_message TEXT');
				console.log('   Added error_message column');
			} else {
				console.log('   error_message column already exists');
			}
		}
	} else if (dbType === 'postgresql') {
		const db = require('../storage/database');
		const dbInstance = db.getPostgresPool ? db.getPostgresPool() : null;
		if (dbInstance) {
			await dbInstance.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS error_message TEXT');
			console.log('   Ensured error_message column exists');
		}
	}
}

async function createErrorMessageIndexes() {
	const dbType = process.env.DB_TYPE || 'sqlite';

	if (dbType === 'sqlite') {
		const db = require('../storage/database');
		const dbInstance = db.getSqliteDb ? db.getSqliteDb() : null;
		if (dbInstance) {
			dbInstance.exec('CREATE INDEX IF NOT EXISTS idx_error_message ON telemetry_events(error_message)');
			console.log('   Created idx_error_message index');
		}
	} else if (dbType === 'postgresql') {
		const db = require('../storage/database');
		const dbInstance = db.getPostgresPool ? db.getPostgresPool() : null;
		if (dbInstance) {
			await dbInstance.query('CREATE INDEX IF NOT EXISTS idx_error_message ON telemetry_events(error_message)');
			console.log('   Created idx_error_message index');
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
	addErrorMessageColumn,
	createErrorMessageIndexes
};