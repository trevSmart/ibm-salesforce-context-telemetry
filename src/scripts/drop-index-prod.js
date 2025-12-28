#!/usr/bin/env node

/**
 * Script to safely drop indexes from production database
 *
 * This script allows you to drop specific indexes from the production database
 * without requiring a full repository deploy to Render.
 *
 * Usage:
 *   node src/scripts/drop-index-prod.js <index-name> [--confirm]
 *   node src/scripts/drop-index-prod.js --list
 *   node src/scripts/drop-index-prod.js --find-duplicates
 *
 * Environment variables:
 *   DATABASE_URL_PROD - Production database URL (required)
 *
 * Options:
 *   --list: List all indexes in the production database
 *   --find-duplicates: Find duplicate indexes that can be safely dropped
 *   --confirm: Actually drop the index (default: dry-run mode)
 *
 * Examples:
 *   # List all indexes
 *   DATABASE_URL_PROD="..." node src/scripts/drop-index-prod.js --list
 *
 *   # Find duplicate indexes
 *   DATABASE_URL_PROD="..." node src/scripts/drop-index-prod.js --find-duplicates
 *
 *   # Drop a specific index (dry-run)
 *   DATABASE_URL_PROD="..." node src/scripts/drop-index-prod.js idx_old_index
 *
 *   # Actually drop the index
 *   DATABASE_URL_PROD="..." node src/scripts/drop-index-prod.js idx_old_index --confirm
 *
 * IMPORTANT: Always backup production before dropping indexes!
 */

import 'dotenv/config';
import {Pool} from 'pg';

function maskUrl(url) {
	return url.replace(/:[^:@]+@/, ':****@');
}

async function listIndexes(pool) {
	console.log('📋 Listing all indexes in production database...\n');

	const result = await pool.query(`
		SELECT
			schemaname,
			tablename,
			indexname,
			pg_size_pretty(pg_relation_size(indexname::regclass)) as size,
			indexdef
		FROM pg_indexes
		WHERE schemaname = 'public'
		ORDER BY tablename, indexname;
	`);

	if (result.rows.length === 0) {
		console.log('   No indexes found\n');
		return;
	}

	let currentTable = '';
	for (const row of result.rows) {
		if (row.tablename !== currentTable) {
			currentTable = row.tablename;
			console.log(`\n📊 Table: ${currentTable}`);
		}
		console.log(`   • ${row.indexname} (${row.size})`);
		console.log(`     ${row.indexdef}`);
	}
	console.log('');
}

async function findDuplicates(pool) {
	console.log('🔍 Finding duplicate indexes...\n');

	// Find exact duplicates
	const exactDuplicates = await pool.query(`
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
	`);

	if (exactDuplicates.rows.length > 0) {
		console.log(`⚠️  Found ${exactDuplicates.rows.length} set(s) of exact duplicate indexes:\n`);
		exactDuplicates.rows.forEach((dup, idx) => {
			console.log(`${idx + 1}. Size: ${dup.size}`);
			console.log(`   Keeping: ${dup.idx1}`);
			const duplicates = [dup.idx2, dup.idx3, dup.idx4, dup.idx5].filter(Boolean);
			if (duplicates.length > 0) {
				console.log(`   Can drop: ${duplicates.join(', ')}`);
			}
			console.log('');
		});
	} else {
		console.log('✅ No exact duplicate indexes found\n');
	}

	// Find covered indexes
	const coveredIndexes = await pool.query(`
		SELECT
			t.relname as table_name,
			cidx.relname as covered_index,
			cidxidx.indexrelid::regclass::text as covering_index,
			pg_size_pretty(pg_relation_size(cidx.oid)) as size,
			pg_get_indexdef(cidxidx.indexrelid) as covered_def
		FROM pg_index cidxidx
		JOIN pg_class cidx ON cidx.oid = cidxidx.indexrelid
		JOIN pg_class t ON t.oid = cidxidx.indrelid
		WHERE EXISTS (
			SELECT 1
			FROM pg_index oidxidx
			JOIN pg_class oidx ON oidx.oid = oidxidx.indexrelid
			WHERE oidxidx.indrelid = cidxidx.indrelid
				AND oidxidx.indexrelid != cidxidx.indexrelid
				AND (
					-- Check if covering index has all columns from covered index
					oidxidx.indkey::int[] @> cidxidx.indkey::int[]
					OR (
						-- Check if covering index is a unique constraint that covers the covered index
						oidxidx.indisunique = true
						AND oidxidx.indkey::int[] = cidxidx.indkey::int[]
					)
				)
		)
		ORDER BY pg_relation_size(cidx.oid) DESC;
	`);

	if (coveredIndexes.rows.length > 0) {
		console.log(`⚠️  Found ${coveredIndexes.rows.length} covered index(es):\n`);
		coveredIndexes.rows.forEach((covered, idx) => {
			console.log(`${idx + 1}. ${covered.table_name}.${covered.covered_index}`);
			console.log(`   Size: ${covered.size}`);
			console.log(`   Covered by: ${covered.covering_index}`);
			console.log(`   Definition: ${covered.covered_def}`);
			console.log('');
		});
	} else {
		console.log('✅ No covered indexes found\n');
	}
}

async function dropIndex(pool, indexName, confirm) {
	console.log(`🔍 Checking index: ${indexName}\n`);

	// Check if index exists
	const checkResult = await pool.query(`
		SELECT
			indexname,
			tablename,
			pg_size_pretty(pg_relation_size(indexname::regclass)) as size,
			indexdef
		FROM pg_indexes
		WHERE indexname = $1 AND schemaname = 'public'
	`, [indexName]);

	if (checkResult.rows.length === 0) {
		console.log(`❌ Index '${indexName}' not found in production database\n`);
		process.exit(1);
	}

	const indexInfo = checkResult.rows[0];
	console.log('📊 Index information:');
	console.log(`   Name: ${indexInfo.indexname}`);
	console.log(`   Table: ${indexInfo.tablename}`);
	console.log(`   Size: ${indexInfo.size}`);
	console.log(`   Definition: ${indexInfo.indexdef}\n`);

	if (!confirm) {
		console.log('🔍 DRY RUN MODE - Index will NOT be dropped');
		console.log('   Add --confirm flag to actually drop the index\n');
		return;
	}

	// Confirm before dropping
	console.log('⚠️  WARNING: This will drop the index from production!');
	console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
	await new Promise(resolve => setTimeout(resolve, 5000));

	try {
		await pool.query(`DROP INDEX IF EXISTS ${indexName}`);
		console.log(`✅ Index '${indexName}' dropped successfully\n`);
	} catch (error) {
		console.error(`❌ Error dropping index: ${error.message}\n`);
		process.exit(1);
	}
}

async function main() {
	const args = process.argv.slice(2);

	if (!process.env.DATABASE_URL_PROD) {
		console.error('❌ Error: DATABASE_URL_PROD must be set');
		console.error('');
		console.error('Usage:');
		console.error('  DATABASE_URL_PROD="postgresql://user:pass@host/db" node src/scripts/drop-index-prod.js <index-name>');
		process.exit(1);
	}

	const prodUrl = process.env.DATABASE_URL_PROD;
	console.log('📊 Connecting to production database...');
	console.log(`   ${maskUrl(prodUrl)}\n`);

	const pool = new Pool({
		connectionString: prodUrl,
		ssl: prodUrl.includes('sslmode=require') || prodUrl.includes('render.com')
			? {rejectUnauthorized: false}
			: false
	});

	try {
		await pool.query('SELECT NOW()');
		console.log('✅ Connected to production database\n');

		if (args.includes('--list')) {
			await listIndexes(pool);
		} else if (args.includes('--find-duplicates')) {
			await findDuplicates(pool);
		} else {
			const indexName = args.find(arg => !arg.startsWith('--'));
			if (!indexName) {
				console.error('❌ Error: Index name is required');
				console.error('');
				console.error('Usage:');
				console.error('  node src/scripts/drop-index-prod.js <index-name> [--confirm]');
				console.error('  node src/scripts/drop-index-prod.js --list');
				console.error('  node src/scripts/drop-index-prod.js --find-duplicates');
				process.exit(1);
			}

			const confirm = args.includes('--confirm');
			await dropIndex(pool, indexName, confirm);
		}
	} catch (error) {
		console.error('❌ Error:', error.message);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

main().catch(error => {
	console.error('❌ Unhandled error:', error);
	process.exit(1);
});
