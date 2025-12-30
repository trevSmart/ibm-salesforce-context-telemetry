/**
 * Script to find duplicate indexes using PgHero's detection method
 *
 * PgHero uses a specific query to detect duplicate indexes that are covered
 * by other indexes. This script replicates that logic.
 *
 * Usage: node src/scripts/find-duplicates-pghero-style.js
 */

// Load environment variables from .env file
import 'dotenv/config';

import {init, close, getPostgresPool} from '../storage/database.js';

async function main() {
	console.log('🔍 Finding duplicate indexes (PgHero style)...\n');

	try {
		// Initialize database connection
		await init();
		console.log('✅ Database connection established\n');

		const dbInstance = getPostgresPool();
		if (!dbInstance) {
			throw new Error('PostgreSQL database instance not available');
		}

		// PgHero-style duplicate index detection
		// This query finds indexes that are covered by other indexes
		const query = `
			SELECT
				schemaname,
				tablename,
				indexname AS duplicate_index,
				pg_size_pretty(pg_relation_size(indexname::regclass)) AS size,
				indexdef AS duplicate_def,
				(
					SELECT indexname
					FROM pg_indexes pi2
					WHERE pi2.schemaname = pi1.schemaname
						AND pi2.tablename = pi1.tablename
						AND pi2.indexname != pi1.indexname
						AND (
							-- Check if the index is covered by a composite index
							pi2.indexdef LIKE '%' || substring(pi1.indexdef from '(([^)]+))') || '%'
							OR
							-- Check if it's a unique constraint covering a simple index
							EXISTS (
								SELECT 1
								FROM pg_constraint pc
								WHERE pc.conrelid = (SELECT oid FROM pg_class WHERE relname = pi1.tablename)
									AND pc.conname = pi2.indexname
									AND pc.contype = 'u'
							)
						)
					LIMIT 1
				) AS covering_index
			FROM pg_indexes pi1
			WHERE schemaname = 'public'
				AND indexname NOT LIKE '%_key'
				AND indexname NOT LIKE '%_pkey'
			ORDER BY tablename, indexname;
		`;

		// Simpler approach: find indexes that are subsets of other indexes
		const simplerQuery = `
			WITH index_columns AS (
				SELECT
					i.indexrelid::regclass::text AS index_name,
					i.indrelid::regclass::text AS table_name,
					array_to_string(i.indkey, ' ') AS index_keys,
					pg_get_indexdef(i.indexrelid) AS index_def,
					pg_relation_size(i.indexrelid) AS index_size,
					i.indisunique AS is_unique,
					i.indisprimary AS is_primary
				FROM pg_index i
				JOIN pg_class c ON c.oid = i.indexrelid
				JOIN pg_namespace n ON n.oid = c.relnamespace
				WHERE n.nspname = 'public'
					AND NOT i.indisprimary
			),
			index_column_lists AS (
				SELECT
					index_name,
					table_name,
					index_keys,
					index_def,
					index_size,
					is_unique,
					is_primary,
					string_to_array(index_keys, ' ')::int[] AS column_list
				FROM index_columns
			)
			SELECT DISTINCT
				covered.index_name AS duplicate_index,
				covered.table_name,
				pg_size_pretty(covered.index_size) AS size,
				covering.index_name AS covering_index,
				covered.index_def AS duplicate_def
			FROM index_column_lists covered
			JOIN index_column_lists covering
				ON covered.table_name = covering.table_name
				AND covered.index_name != covering.index_name
				AND covered.column_list <@ covering.column_list
				AND array_length(covered.column_list, 1) < array_length(covering.column_list, 1)
			WHERE NOT covered.is_unique
				AND NOT covered.is_primary
			ORDER BY covered.table_name, covered.index_name;
		`;

		const result = await dbInstance.query(simplerQuery);

		if (result.rows.length > 0) {
			console.log(`⚠️  Found ${result.rows.length} duplicate index(es):\n`);

			result.rows.forEach((row, idx) => {
				console.log(`${idx + 1}. ${row.table_name}.${row.duplicate_index}`);
				console.log(`   Size: ${row.size}`);
				console.log(`   Covered by: ${row.covering_index}`);
				console.log(`   Definition: ${row.duplicate_def.substring(0, 100)}...`);
				console.log('');
			});

			console.log(`\n📊 Summary: ${result.rows.length} index(es) can be dropped`);
			console.log('\n💡 To drop these indexes, run:');
			console.log('   node src/scripts/find-duplicate-indexes.js --drop');
		} else {
			console.log('✅ No duplicate indexes found!');
		}

	} catch (error) {
		console.error('❌ Error finding duplicate indexes:', error);
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
