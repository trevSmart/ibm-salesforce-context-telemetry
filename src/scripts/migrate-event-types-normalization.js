#!/usr/bin/env node
/**
 * Migration script to normalize event types
 *
 * This script:
 * 1. Creates the event_types table
 * 2. Populates it with the 6 event types
 * 3. Adds event_id column to telemetry_events
 * 4. Migrates existing data from event TEXT to event_id INTEGER
 * 5. Drops the old event column
 * 6. Updates indexes
 */

import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);

const path = require('node:path');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'src', 'data', 'telemetry.db');

// Event types to create
const EVENT_TYPES = [
	{name: 'tool_call', description: 'Tool call event'},
	{name: 'tool_error', description: 'Tool error event'},
	{name: 'session_start', description: 'Session start event'},
	{name: 'session_end', description: 'Session end event'},
	{name: 'error', description: 'General error event'},
	{name: 'custom', description: 'Custom event'}
];

async function migrateEventTypes() {
	console.log('Starting event types normalization migration...');

	let db;
	try {
		// Import better-sqlite3 dynamically
		const Database = (await import('better-sqlite3')).default;
		db = new Database(DB_PATH);

		// Enable foreign keys
		db.pragma('foreign_keys = ON');

		console.log('Connected to database');

		// Check if migration already completed
		const eventTypesTableExists = db.prepare(`
			SELECT name FROM sqlite_master
			WHERE type='table' AND name='event_types'
		`).get();

		const eventIdColumnExists = db.prepare(`
			SELECT name FROM pragma_table_info('telemetry_events')
			WHERE name='event_id'
		`).get();

		const eventColumnExists = db.prepare(`
			SELECT name FROM pragma_table_info('telemetry_events')
			WHERE name='event'
		`).get();

		if (eventTypesTableExists && eventIdColumnExists && !eventColumnExists) {
			console.log('Migration already completed. Skipping...');
			return;
		}

		// Start transaction
		const transaction = db.transaction(() => {
			console.log('Creating event_types table...');

			// 1. Create event_types table
			db.exec(`
				CREATE TABLE IF NOT EXISTS event_types (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					name TEXT NOT NULL UNIQUE,
					description TEXT,
					created_at TEXT DEFAULT CURRENT_TIMESTAMP
				);
			`);

			// 2. Insert event types
			const insertStmt = db.prepare(`
				INSERT OR IGNORE INTO event_types (name, description) VALUES (?, ?)
			`);

			for (const eventType of EVENT_TYPES) {
				insertStmt.run(eventType.name, eventType.description);
			}

			console.log('Event types created');

			// 3. Add event_id column if it doesn't exist
			if (!eventIdColumnExists) {
				console.log('Adding event_id column...');
				db.exec('ALTER TABLE telemetry_events ADD COLUMN event_id INTEGER REFERENCES event_types(id)');
			}

			// 4. Migrate data from event to event_id
			console.log('Migrating event data to event_id...');
			const updateStmt = db.prepare(`
				UPDATE telemetry_events
				SET event_id = (SELECT id FROM event_types WHERE name = telemetry_events.event)
				WHERE event_id IS NULL
			`);

			const result = updateStmt.run();
			console.log(`Updated ${result.changes} rows`);

			// 5. Verify migration - check for any NULL event_id
			const nullCount = db.prepare('SELECT COUNT(*) as count FROM telemetry_events WHERE event_id IS NULL').get();
			if (nullCount.count > 0) {
				throw new Error(`Migration failed: ${nullCount.count} rows still have NULL event_id`);
			}

			// 6. Drop old indexes that reference the event column
			console.log('Dropping old indexes that reference event column...');
			const indexesToDrop = [
				'idx_event',
				'idx_event_created_at',
				'idx_timestamp_event'
			];

			for (const indexName of indexesToDrop) {
				try {
					db.exec(`DROP INDEX IF EXISTS ${indexName}`);
					console.log(`Dropped index: ${indexName}`);
				} catch (e) {
					console.warn(`Could not drop index ${indexName}:`, e.message);
				}
			}

			// 7. Drop old event column
			if (eventColumnExists) {
				console.log('Dropping old event column...');
				db.exec('ALTER TABLE telemetry_events DROP COLUMN event');
			}

			// 8. Recreate all necessary indexes
			console.log('Recreating indexes...');
			db.exec('CREATE INDEX IF NOT EXISTS idx_event_id ON telemetry_events(event_id)');
			db.exec('CREATE INDEX IF NOT EXISTS idx_timestamp ON telemetry_events(timestamp)');
			db.exec('CREATE INDEX IF NOT EXISTS idx_server_id ON telemetry_events(server_id)');
			db.exec('CREATE INDEX IF NOT EXISTS idx_created_at ON telemetry_events(created_at)');
			db.exec('CREATE INDEX IF NOT EXISTS idx_session_id ON telemetry_events(session_id)');
			db.exec('CREATE INDEX IF NOT EXISTS idx_user_id ON telemetry_events(user_id)');
			db.exec('CREATE INDEX IF NOT EXISTS idx_parent_session_id ON telemetry_events(parent_session_id)');
			db.exec('CREATE INDEX IF NOT EXISTS idx_event_id_created_at ON telemetry_events(event_id, created_at)');

			console.log('Migration completed successfully!');
		});

		// Run transaction
		transaction();

	} catch (error) {
		console.error('Migration failed:', error);
		throw error;
	} finally {
		if (db) {
			db.close();
			console.log('Database connection closed');
		}
	}
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	migrateEventTypes()
		.then(() => {
			console.log('Migration completed successfully!');
			process.exit(0);
		})
		.catch((error) => {
			console.error('Migration failed:', error);
			process.exit(1);
		});
}

export {migrateEventTypes};