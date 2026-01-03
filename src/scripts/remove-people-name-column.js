#!/usr/bin/env node

/**
 * Migration script to remove the name column from the people table.
 * This script should be run after deploying the code changes that remove
 * references to the name field.
 */

const { init } = require('../storage/database');

async function removePeopleNameColumn() {
	try {
		console.log('Initializing database connection...');
		await init();

		console.log('Checking if name column exists...');

		// Check if the column exists before trying to drop it
		const checkResult = await db.query(`
			SELECT column_name
			FROM information_schema.columns
			WHERE table_name = 'people' AND column_name = 'name'
		`);

		if (checkResult.rows.length === 0) {
			console.log('Name column does not exist in people table. Migration not needed.');
			return;
		}

		console.log('Dropping name column from people table...');

		// Drop the name column
		await db.query('ALTER TABLE people DROP COLUMN IF EXISTS name');

		console.log('✅ Successfully removed name column from people table');
		console.log('Migration completed successfully!');

	} catch (error) {
		console.error('❌ Migration failed:', error);
		process.exit(1);
	} finally {
		// Close database connection
		if (db && db.end) {
			await db.end();
		}
		process.exit(0);
	}
}

// Import database after defining the function
let db;
(async () => {
	try {
		const database = require('../storage/database');
		db = database.db;
		await removePeopleNameColumn();
	} catch (error) {
		console.error('Failed to load database module:', error);
		process.exit(1);
	}
})();