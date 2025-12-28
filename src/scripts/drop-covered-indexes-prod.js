#!/usr/bin/env node

/**
 * Script to drop covered/duplicate indexes from production database
 *
 * This script drops indexes that are covered by more comprehensive composite indexes
 * or unique constraints. These indexes are redundant and can be safely removed
 * to improve write performance.
 *
 * Usage:
 *   node src/scripts/drop-covered-indexes-prod.js [--confirm]
 *
 * Environment variables:
 *   DATABASE_URL_PROD - Production database URL (required)
 *
 * Options:
 *   --confirm: Actually drop the indexes (default: dry-run mode)
 *
 * IMPORTANT: Always backup production before dropping indexes!
 */

import 'dotenv/config';
import {Pool} from 'pg';

function maskUrl(url) {
	return url.replace(/:[^:@]+@/, ':****@');
}

// List of indexes to drop (covered by more comprehensive indexes)
const indexesToDrop = [
	// person_usernames table
	{
		name: 'idx_person_usernames_person_id',
		table: 'person_usernames',
		reason: 'Covered by person_usernames_person_id_username_key (person_id, username)'
	},
	{
		name: 'idx_person_usernames_username',
		table: 'person_usernames',
		reason: 'Covered by idx_person_username (username)'
	},
	// remember_tokens table
	{
		name: 'idx_remember_token_hash',
		table: 'remember_tokens',
		reason: 'Covered by remember_tokens_token_hash_key (token_hash)'
	},
	// team_event_users table
	{
		name: 'idx_team_event_users_team_id',
		table: 'team_event_users',
		reason: 'Covered by team_event_users_team_id_user_name_key (team_id, user_name)'
	},
	// teams table
	{
		name: 'idx_teams_name',
		table: 'teams',
		reason: 'Covered by teams_name_key (name)'
	},
	// telemetry_events table
	{
		name: 'idx_deleted_at',
		table: 'telemetry_events',
		reason: 'Covered by idx_deleted_at_created_at (deleted_at, created_at)'
	},
	{
		name: 'idx_event',
		table: 'telemetry_events',
		reason: 'Covered by idx_event_created_at (event, created_at)'
	},
	{
		name: 'idx_event_id',
		table: 'telemetry_events',
		reason: 'Covered by idx_event_id_created_at (event_id, created_at)'
	},
	{
		name: 'idx_parent_session_id',
		table: 'telemetry_events',
		reason: 'Covered by idx_parent_session_timestamp (parent_session_id, timestamp)'
	},
	{
		name: 'idx_session_id',
		table: 'telemetry_events',
		reason: 'Covered by idx_session_timestamp (session_id, timestamp)'
	},
	{
		name: 'idx_team_id',
		table: 'telemetry_events',
		reason: 'Covered by idx_team_id_created_at (team_id, created_at)'
	},
	{
		name: 'idx_user_id',
		table: 'telemetry_events',
		reason: 'Covered by idx_user_created_at (user_id, created_at)'
	},
	// users table
	{
		name: 'idx_username',
		table: 'users',
		reason: 'Covered by users_username_key (username)'
	}
];

async function checkIndexes(pool) {
	console.log('🔍 Checking which indexes exist in production...\n');

	const existingIndexes = [];
	const missingIndexes = [];

	for (const index of indexesToDrop) {
		const result = await pool.query(`
			SELECT
				indexname,
				pg_size_pretty(pg_relation_size(indexname::regclass)) as size,
				indexdef
			FROM pg_indexes
			WHERE indexname = $1 AND schemaname = 'public'
		`, [index.name]);

		if (result.rows.length > 0) {
			existingIndexes.push({
				...index,
				size: result.rows[0].size,
				definition: result.rows[0].indexdef
			});
		} else {
			missingIndexes.push(index);
		}
	}

	return {existingIndexes, missingIndexes};
}

async function dropIndexes(pool, indexes, confirm) {
	let totalSize = 0;
	const dropped = [];
	const failed = [];

	for (const index of indexes) {
		try {
			// Get index size before dropping
			const sizeResult = await pool.query(`
				SELECT pg_relation_size(indexname::regclass) as size
				FROM pg_indexes
				WHERE indexname = $1 AND schemaname = 'public'
			`, [index.name]);

			if (sizeResult.rows.length > 0) {
				totalSize += parseInt(sizeResult.rows[0].size);
			}

			await pool.query(`DROP INDEX IF EXISTS ${index.name}`);
			dropped.push(index);
			console.log(`   ✅ Dropped: ${index.name} (${index.size || 'unknown size'})`);
		} catch (error) {
			failed.push({index, error: error.message});
			console.log(`   ❌ Failed to drop ${index.name}: ${error.message}`);
		}
	}

	return {dropped, failed, totalSize};
}

async function main() {
	const args = process.argv.slice(2);
	const confirm = args.includes('--confirm');

	if (!process.env.DATABASE_URL_PROD) {
		console.error('❌ Error: DATABASE_URL_PROD must be set');
		console.error('');
		console.error('Usage:');
		console.error('  DATABASE_URL_PROD="postgresql://user:pass@host/db" node src/scripts/drop-covered-indexes-prod.js [--confirm]');
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

		// Check which indexes exist
		const {existingIndexes, missingIndexes} = await checkIndexes(pool);

		if (existingIndexes.length === 0) {
			console.log('✅ All indexes have already been dropped\n');
			await pool.end();
			return;
		}

		console.log(`📋 Found ${existingIndexes.length} index(es) to drop:\n`);
		existingIndexes.forEach((idx, i) => {
			console.log(`${i + 1}. ${idx.name}`);
			console.log(`   Table: ${idx.table}`);
			console.log(`   Size: ${idx.size}`);
			console.log(`   Reason: ${idx.reason}`);
			console.log('');
		});

		if (missingIndexes.length > 0) {
			console.log(`ℹ️  ${missingIndexes.length} index(es) not found (already dropped or never existed):\n`);
			missingIndexes.forEach(idx => {
				console.log(`   - ${idx.name} (${idx.table})`);
			});
			console.log('');
		}

		if (!confirm) {
			console.log('🔍 DRY RUN MODE - Indexes will NOT be dropped');
			console.log('   Add --confirm flag to actually drop the indexes\n');
			await pool.end();
			return;
		}

		// Confirm before dropping
		console.log('⚠️  WARNING: This will drop indexes from production!');
		console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
		await new Promise(resolve => setTimeout(resolve, 5000));

		console.log('🗑️  Dropping indexes...\n');
		const {dropped, failed, totalSize} = await dropIndexes(pool, existingIndexes, confirm);

		console.log('\n📊 Summary:');
		console.log(`   ✅ Dropped: ${dropped.length} index(es)`);
		if (failed.length > 0) {
			console.log(`   ❌ Failed: ${failed.length} index(es)`);
		}
		if (totalSize > 0) {
			const sizeInMB = (totalSize / 1024 / 1024).toFixed(2);
			console.log(`   💾 Space freed: ~${sizeInMB} MB`);
		}
		console.log('');

		if (failed.length > 0) {
			console.log('❌ Failed indexes:');
			failed.forEach(({index, error}) => {
				console.log(`   - ${index.name}: ${error}`);
			});
			console.log('');
			process.exit(1);
		}

		console.log('✅ All indexes dropped successfully!\n');
		console.log('📋 Next steps:');
		console.log('   1. Monitor query performance to ensure no degradation');
		console.log('   2. Verify that covering indexes are being used');
		console.log('   3. Consider running ANALYZE on affected tables');

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
