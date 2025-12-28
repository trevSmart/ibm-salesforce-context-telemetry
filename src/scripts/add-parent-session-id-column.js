/**
 * Script to add parent_session_id column to telemetry_events table
 * This script is safe to run multiple times - it checks if the column exists before adding it
 *
 * Usage: node src/scripts/add-parent-session-id-column.js
 */

import {Pool} from 'pg';
import 'dotenv/config';

async function addParentSessionIdColumn() {
	const connectionString = process.env.DATABASE_URL || process.env.DATABASE_INTERNAL_URL;
	if (!connectionString) {
		console.error('❌ DATABASE_URL or DATABASE_INTERNAL_URL environment variable is not set');
		process.exit(1);
	}

	const isInternalUrl = Boolean(process.env.DATABASE_INTERNAL_URL);
	const useSSL = isInternalUrl ? false : (process.env.DATABASE_SSL === 'true' ? {rejectUnauthorized: false} : false);

	const pool = new Pool({
		connectionString: connectionString,
		ssl: useSSL
	});

	try {
		console.log('Connecting to database...');
		await pool.query('SELECT NOW()');
		console.log('✅ Connected to database\n');

		// Check if column exists
		console.log('Checking if parent_session_id column exists...');
		const columnCheck = await pool.query(`
			SELECT column_name
			FROM information_schema.columns
			WHERE table_name = 'telemetry_events'
			AND column_name = 'parent_session_id'
		`);

		if (columnCheck.rows.length > 0) {
			console.log('✅ Column parent_session_id already exists');
		} else {
			console.log('⚠️  Column parent_session_id does not exist. Adding it...');
			await pool.query(`
				ALTER TABLE telemetry_events
				ADD COLUMN parent_session_id TEXT
			`);
			console.log('✅ Column parent_session_id added successfully');
		}

		// Check if index exists
		console.log('\nChecking if index idx_parent_session_id exists...');
		const indexCheck = await pool.query(`
			SELECT indexname
			FROM pg_indexes
			WHERE tablename = 'telemetry_events'
			AND indexname = 'idx_parent_session_id'
		`);

		if (indexCheck.rows.length > 0) {
			console.log('✅ Index idx_parent_session_id already exists');
		} else {
			console.log('⚠️  Index idx_parent_session_id does not exist. Creating it...');
			await pool.query(`
				CREATE INDEX idx_parent_session_id
				ON telemetry_events(parent_session_id)
			`);
			console.log('✅ Index idx_parent_session_id created successfully');
		}

		console.log('\n✅ Migration completed successfully!');
	} catch (error) {
		console.error('\n❌ Error during migration:', error);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

// Run the migration
addParentSessionIdColumn();
