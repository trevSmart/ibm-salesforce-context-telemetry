/**
 * Script to list all indexes in the database
 * Useful for debugging duplicate index issues
 *
 * Usage: node src/scripts/list-all-indexes.js
 */

// Load environment variables from .env file
import 'dotenv/config';

import {init, close, getPostgresPool} from '../storage/database.js';

async function main() {
	console.log('📋 Listing all indexes in the database...\n');

	try {
		// Initialize database connection
		await init();
		console.log('✅ Database connection established\n');

		const dbInstance = getPostgresPool();
		if (!dbInstance) {
			throw new Error('PostgreSQL database instance not available');
		}

		// Get all indexes with their definitions
		const query = `
			SELECT
				schemaname,
				tablename,
				indexname,
				indexdef
			FROM pg_indexes
			WHERE schemaname = 'public'
			ORDER BY tablename, indexname;
		`;

		const result = await dbInstance.query(query);

		// Get size for each index separately to handle missing indexes
		for (const row of result.rows) {
			try {
				const sizeResult = await dbInstance.query(`
					SELECT pg_size_pretty(pg_relation_size($1::regclass)) AS size
				`, [row.indexname]);
				row.size = sizeResult.rows[0]?.size || 'unknown';
			} catch (error) {
				row.size = 'error';
			}
		}

		console.log(`Found ${result.rows.length} indexes:\n`);

		let currentTable = '';
		for (const row of result.rows) {
			if (row.tablename !== currentTable) {
				currentTable = row.tablename;
				console.log(`\n📊 Table: ${row.tablename}`);
				console.log('─'.repeat(80));
			}
			console.log(`  ${row.indexname}`);
			console.log(`    Size: ${row.size}`);
			console.log(`    Definition: ${row.indexdef.substring(0, 100)}...`);
		}

		console.log(`\n\n📊 Total: ${result.rows.length} indexes`);

	} catch (error) {
		console.error('❌ Error listing indexes:', error);
		process.exit(1);
	} finally {
		// Close database connection
		await close();
	}
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(error => {
		console.error('❌ Unhandled error:', error);
		process.exit(1);
	});
}

export default main;
