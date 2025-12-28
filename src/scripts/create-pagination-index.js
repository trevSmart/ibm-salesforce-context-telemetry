/**
 * Script to create composite index for pagination performance
 * Creates idx_deleted_at_created_at index on telemetry_events table
 * This index significantly improves performance for queries with:
 * WHERE deleted_at IS NULL ORDER BY created_at DESC
 */

import {init, close, getPostgresPool} from '../storage/database.js';

async function createPaginationIndex() {
	try {
		await init();
		const db = getPostgresPool();

		if (!db) {
			throw new Error('PostgreSQL database instance not available');
		}

		console.log('Creating pagination index for PostgreSQL...');

		// Check if index already exists
		const result = await db.query(`
			SELECT EXISTS (
				SELECT 1 FROM pg_indexes 
				WHERE schemaname = 'public' 
				AND tablename = 'telemetry_events' 
				AND indexname = 'idx_deleted_at_created_at'
			) as exists
		`);
		if (result.rows[0].exists) {
			console.log('Index idx_deleted_at_created_at already exists');
		} else {
			await db.query('CREATE INDEX idx_deleted_at_created_at ON telemetry_events(deleted_at, created_at)');
			console.log('✓ Created index idx_deleted_at_created_at on telemetry_events(deleted_at, created_at)');
		}

		console.log('Pagination index creation completed successfully');
	} catch (error) {
		console.error('Error creating pagination index:', error);
		process.exit(1);
	} finally {
		await close();
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	createPaginationIndex();
}

export {createPaginationIndex};
