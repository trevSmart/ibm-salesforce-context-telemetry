/**
 * Migration script to add initials column to people table
 * for custom user initials display.
 *
 * This script:
 * 1. Adds the initials column to people table
 * 2. Creates necessary indexes
 *
 * Usage: node src/scripts/migrate-add-initials.js
 */

import * as dbModule from '../storage/database.js';

async function main() {
	console.log('🚀 Starting initials column migration...\n');

	try {
		// Initialize database connection
		await dbModule.init();
		console.log('✅ Database connection established');
		console.log('📊 Database type: PostgreSQL\n');

		// Add initials column
		console.log('🔧 Adding initials column...');
		await addInitialsColumn();
		console.log('✅ initials column added\n');

		console.log('🎉 Initials migration completed successfully!');

	} catch (error) {
		console.error('❌ Error during migration:', error);
		process.exit(1);
	} finally {
		// Close database connection
		await dbModule.close();
	}
}

async function addInitialsColumn() {
	const db = dbModule;
	const dbInstance = db.getPostgresPool ? db.getPostgresPool() : null;
	if (dbInstance) {
		await dbInstance.query('ALTER TABLE IF EXISTS people ADD COLUMN IF NOT EXISTS initials TEXT');
		console.log('   Ensured initials column exists');
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
	addInitialsColumn
};
