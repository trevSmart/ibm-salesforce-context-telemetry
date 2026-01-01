/**
 * Script to find duplicate indexes in PostgreSQL database
 *
 * This script detects two types of duplicate indexes:
 * 1. Exact duplicates: Indexes with identical column sets, operator classes, expressions, and predicates
 * 2. Covered indexes: Indexes that are covered by more comprehensive composite indexes
 *
 * Usage:
 *   node src/scripts/find-duplicate-indexes.js [--drop]
 *
 * Options:
 *   --drop: Actually drop the duplicate indexes (default: only report)
 *   --env=DEV|PROD: Specify which environment to check (default: uses DATABASE_URL from .env)
 */

// Load environment variables from .env file
import 'dotenv/config';

import {init, close, getPostgresPool} from '../storage/database.js';

/**
 * Find exact duplicate indexes (same columns, expressions, predicates)
 */
async function findExactDuplicates(dbInstance) {
	const query = `
		SELECT
			pg_size_pretty(sum(pg_relation_size(idx))::bigint) as size,
			(array_agg(idx::text))[1] as idx1,
			(array_agg(idx::text))[2] as idx2,
			(array_agg(idx::text))[3] as idx3,
			(array_agg(idx::text))[4] as idx4,
			(array_agg(idx::text))[5] as idx5
		FROM (
			SELECT
				indexrelid::regclass as idx,
				(indrelid::text || E'\\n' || indclass::text || E'\\n' || indkey::text || E'\\n' ||
				 coalesce(indexprs::text,'') || E'\\n' || coalesce(indpred::text,'')) as key
			FROM pg_index
		) sub
		GROUP BY key
		HAVING count(*) > 1
		ORDER BY sum(pg_relation_size(idx)) DESC;
	`;

	const result = await dbInstance.query(query);
	return result.rows;
}

/**
 * Find indexes that are covered by other more comprehensive indexes
 * This detects cases where a simple index on (A) is covered by a composite index on (A, B)
 */
async function findCoveredIndexes(dbInstance) {
	const query = `
		WITH index_info AS (
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
		index_columns AS (
			SELECT
				index_name,
				table_name,
				index_keys,
				index_def,
				index_size,
				is_unique,
				is_primary,
				unnest(string_to_array(index_keys, ' '))::int AS column_attnum
			FROM index_info
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
				array_agg(column_attnum ORDER BY column_attnum) AS column_list
			FROM index_columns
			GROUP BY index_name, table_name, index_keys, index_def, index_size, is_unique, is_primary
		)
		SELECT DISTINCT
			covered.index_name AS covered_index,
			covered.table_name,
			covering.index_name AS covering_index,
			pg_size_pretty(covered.index_size) AS size,
			covered.index_def AS covered_def
		FROM index_column_lists covered
		JOIN index_column_lists covering
			ON covered.table_name = covering.table_name
			AND covered.index_name != covering.index_name
			AND covered.column_list <@ covering.column_list  -- covered is subset of covering
			AND array_length(covered.column_list, 1) < array_length(covering.column_list, 1)  -- covering has more columns
		WHERE NOT covered.is_unique  -- Don't suggest dropping unique indexes
			AND NOT covered.is_primary
		ORDER BY covered.table_name, covered.index_name;
	`;

	const result = await dbInstance.query(query);
	return result.rows;
}

/**
 * Get all indexes for a table to help identify duplicates
 */
async function getAllIndexes(dbInstance) {
	const query = `
		SELECT
			schemaname,
			tablename,
			indexname,
			pg_size_pretty(pg_relation_size(indexname::regclass)) AS size,
			indexdef
		FROM pg_indexes
		WHERE schemaname = 'public'
		ORDER BY tablename, indexname;
	`;

	const result = await dbInstance.query(query);
	return result.rows;
}

async function main() {
	const args = process.argv.slice(2);
	const shouldDrop = args.includes('--drop');
	const envArg = args.find(arg => arg.startsWith('--env='));
	const env = envArg ? envArg.split('=')[1] : null;

	console.log('🔍 Finding duplicate indexes...\n');

	if (env) {
		console.log(`📊 Environment: ${env}`);
		console.log('⚠️  Note: Make sure DATABASE_URL is set for the specified environment\n');
	}

	try {
		// Initialize database connection
		await init();
		console.log('✅ Database connection established\n');

		const dbInstance = getPostgresPool();
		if (!dbInstance) {
			throw new Error('PostgreSQL database instance not available');
		}

		// Find exact duplicates
		console.log('📋 Searching for exact duplicate indexes...');
		const exactDuplicates = await findExactDuplicates(dbInstance);

		if (exactDuplicates.length > 0) {
			console.log(`\n⚠️  Found ${exactDuplicates.length} set(s) of exact duplicate indexes:\n`);
			exactDuplicates.forEach((dup, idx) => {
				console.log(`Set ${idx + 1}:`);
				console.log(`  Size: ${dup.size}`);
				console.log(`  Indexes:`);
				[dup.idx1, dup.idx2, dup.idx3, dup.idx4, dup.idx5]
					.filter(Boolean)
					.forEach((indexName, i) => {
						if (i === 0) {
							console.log(`    ✓ Keep: ${indexName}`);
						} else {
							console.log(`    ✗ Drop: ${indexName}`);
						}
					});
				console.log('');
			});
		} else {
			console.log('✅ No exact duplicate indexes found\n');
		}

		// Find covered indexes
		console.log('📋 Searching for indexes covered by other indexes...');
		const coveredIndexes = await findCoveredIndexes(dbInstance);

		if (coveredIndexes.length > 0) {
			console.log(`\n⚠️  Found ${coveredIndexes.length} covered index(es):\n`);
			coveredIndexes.forEach((covered, idx) => {
				console.log(`${idx + 1}. ${covered.table_name}.${covered.covered_index}`);
				console.log(`   Size: ${covered.size}`);
				console.log(`   Covered by: ${covered.covering_index}`);
				console.log(`   Definition: ${covered.covered_def}`);
				console.log('');
			});
		} else {
			console.log('✅ No covered indexes found\n');
		}

		// Combine all indexes to drop
		const indexesToDrop = new Set();

		// Add duplicates (keep first, drop rest)
		exactDuplicates.forEach(dup => {
			[dup.idx2, dup.idx3, dup.idx4, dup.idx5]
				.filter(Boolean)
				.forEach(idx => indexesToDrop.add(idx));
		});

		// Add covered indexes
		coveredIndexes.forEach(covered => {
			indexesToDrop.add(covered.covered_index);
		});

		if (indexesToDrop.size > 0) {
			console.log(`\n📊 Summary: ${indexesToDrop.size} index(es) can be dropped\n`);

			if (shouldDrop) {
				console.log('🗑️  Dropping duplicate indexes...\n');
				for (const indexName of indexesToDrop) {
					try {
						// Extract schema and index name
						const parts = indexName.split('.');
						const indexNameOnly = parts.length > 1 ? parts.at(-1) : indexName;

						await dbInstance.query(`DROP INDEX IF EXISTS ${indexNameOnly}`);
						console.log(`   ✓ Dropped: ${indexName}`);
					} catch (error) {
						console.log(`   ✗ Failed to drop ${indexName}: ${error.message}`);
					}
				}
				console.log('\n✅ Duplicate indexes removed');
			} else {
				console.log('💡 Run with --drop flag to actually drop these indexes');
				console.log('\nIndexes to drop:');
				indexesToDrop.forEach(idx => console.log(`  - ${idx}`));
			}
		} else {
			console.log('\n✅ No duplicate indexes found. Database is optimized!');
		}

	} catch (error) {
		console.error('❌ Error finding duplicate indexes:', error.message);
		process.exit(1);
	} finally {
		// Close database connection
		await close();
	}
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(error => {
		console.error('❌ Unhandled error:', error.message);
		process.exit(1);
	});
}

export {
	findExactDuplicates,
	findCoveredIndexes
};
