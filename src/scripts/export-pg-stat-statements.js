#!/usr/bin/env node

/**
 * Script to export pg_stat_statements statistics to JSON file
 *
 * This script exports all query statistics to a JSON file for later analysis.
 * Useful for:
 * - Backing up statistics before restarting PostgreSQL
 * - Analyzing statistics over time
 * - Sharing statistics with team
 *
 * Usage:
 *   node src/scripts/export-pg-stat-statements.js [output-file]
 *
 * Environment variables:
 *   DATABASE_URL - Local database URL (default, from .env)
 *
 * The exported file contains:
 * - Export metadata (date, version)
 * - Summary statistics
 * - All query statistics with full query text
 */

import 'dotenv/config';
import {Pool} from 'pg';
import fs from 'node:fs';
import path from 'node:path';

function maskUrl(url) {
	return url.replace(/:[^:@]+@/, ':****@');
}

async function checkExtension(pool) {
	const result = await pool.query(`
		SELECT EXISTS(
			SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
		) as exists;
	`);
	return result.rows[0].exists;
}

async function getAllStatistics(pool) {
	// Get summary statistics
	const statsResult = await pool.query(`
		SELECT
			COUNT(*) as total_queries,
			SUM(calls) as total_calls,
			SUM(total_exec_time) as total_time,
			AVG(mean_exec_time) as avg_mean_time,
			MAX(max_exec_time) as max_time,
			SUM(shared_blks_hit) as total_cache_hits,
			SUM(shared_blks_read) as total_cache_reads,
			SUM(rows) as total_rows
		FROM pg_stat_statements
		WHERE query NOT LIKE '%pg_stat_statements%'
	`);

	// Get all queries
	const queriesResult = await pool.query(`
		SELECT
			query,
			queryid,
			calls,
			total_exec_time,
			mean_exec_time,
			min_exec_time,
			max_exec_time,
			stddev_exec_time,
			rows,
			shared_blks_hit,
			shared_blks_read,
			shared_blks_dirtied,
			shared_blks_written,
			local_blks_hit,
			local_blks_read,
			local_blks_dirtied,
			local_blks_written,
			temp_blks_read,
			temp_blks_written,
			shared_blk_read_time,
			shared_blk_write_time,
			local_blk_read_time,
			local_blk_write_time,
			temp_blk_read_time,
			temp_blk_write_time,
			wal_records,
			wal_fpi,
			wal_bytes,
			stats_since
		FROM pg_stat_statements
		WHERE query NOT LIKE '%pg_stat_statements%'
		ORDER BY total_exec_time DESC
	`);

	return {
		summary: statsResult.rows[0],
		queries: queriesResult.rows
	};
}

async function main() {
	const outputFile = process.argv[2] || `pg_stat_statements_${new Date().toISOString().split('T')[0]}_${Date.now()}.json`;

	if (!process.env.DATABASE_URL) {
		console.error('❌ Error: DATABASE_URL must be set');
		console.error('   Set it in your .env file or as an environment variable');
		process.exit(1);
	}

	const dbUrl = process.env.DATABASE_URL;
	console.log('📊 Connecting to local database...');
	console.log(`   ${maskUrl(dbUrl)}\n`);

	const pool = new Pool({
		connectionString: dbUrl,
		ssl: process.env.DATABASE_SSL === 'true' ? {rejectUnauthorized: false} : false
	});

	try {
		await pool.query('SELECT NOW()');
		console.log('✅ Connected to local database\n');

		// Check if extension exists
		const exists = await checkExtension(pool);
		if (!exists) {
			console.error('❌ pg_stat_statements extension is not enabled');
			console.log('');
			console.log('Enable it with:');
			console.log('  npm run enable-pg-stat-statements');
			await pool.end();
			process.exit(1);
		}

		// Get all statistics
		console.log('📥 Exporting statistics...\n');
		const data = await getAllStatistics(pool);

		// Create export object
		const exportData = {
			exportDate: new Date().toISOString(),
			version: '1.0',
			postgresqlVersion: (await pool.query('SELECT version()')).rows[0].version,
			summary: {
				total_queries: parseInt(data.summary.total_queries || 0),
				total_calls: parseInt(data.summary.total_calls || 0),
				total_execution_time_ms: parseFloat(data.summary.total_time || 0),
				average_mean_time_ms: parseFloat(data.summary.avg_mean_time || 0),
				max_execution_time_ms: parseFloat(data.summary.max_time || 0),
				total_rows: parseInt(data.summary.total_rows || 0),
				total_cache_hits: parseInt(data.summary.total_cache_hits || 0),
				total_cache_reads: parseInt(data.summary.total_cache_reads || 0),
				cache_hit_ratio: data.summary.total_cache_hits && data.summary.total_cache_reads
					? (100.0 * parseInt(data.summary.total_cache_hits) / (parseInt(data.summary.total_cache_hits) + parseInt(data.summary.total_cache_reads)))
					: null
			},
			queries: data.queries.map(q => ({
				queryid: q.queryid?.toString(),
				query: q.query,
				calls: parseInt(q.calls || 0),
				total_exec_time_ms: parseFloat(q.total_exec_time || 0),
				mean_exec_time_ms: parseFloat(q.mean_exec_time || 0),
				min_exec_time_ms: parseFloat(q.min_exec_time || 0),
				max_exec_time_ms: parseFloat(q.max_exec_time || 0),
				stddev_exec_time_ms: parseFloat(q.stddev_exec_time || 0),
				rows: parseInt(q.rows || 0),
				shared_blks_hit: parseInt(q.shared_blks_hit || 0),
				shared_blks_read: parseInt(q.shared_blks_read || 0),
				shared_blks_dirtied: parseInt(q.shared_blks_dirtied || 0),
				shared_blks_written: parseInt(q.shared_blks_written || 0),
				local_blks_hit: parseInt(q.local_blks_hit || 0),
				local_blks_read: parseInt(q.local_blks_read || 0),
				local_blks_dirtied: parseInt(q.local_blks_dirtied || 0),
				local_blks_written: parseInt(q.local_blks_written || 0),
				temp_blks_read: parseInt(q.temp_blks_read || 0),
				temp_blks_written: parseInt(q.temp_blks_written || 0),
				shared_blk_read_time_ms: parseFloat(q.shared_blk_read_time || 0),
				shared_blk_write_time_ms: parseFloat(q.shared_blk_write_time || 0),
				local_blk_read_time_ms: parseFloat(q.local_blk_read_time || 0),
				local_blk_write_time_ms: parseFloat(q.local_blk_write_time || 0),
				temp_blk_read_time_ms: parseFloat(q.temp_blk_read_time || 0),
				temp_blk_write_time_ms: parseFloat(q.temp_blk_write_time || 0),
				wal_records: parseInt(q.wal_records || 0),
				wal_fpi: parseInt(q.wal_fpi || 0),
				wal_bytes: q.wal_bytes ? parseFloat(q.wal_bytes) : null,
				stats_since: q.stats_since
			}))
		};

		// Write to file
		const outputPath = path.resolve(outputFile);
		fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf8');

		const fileSize = fs.statSync(outputPath).size;
		console.log('✅ Export completed successfully!\n');
		console.log(`📄 File: ${outputPath}`);
		console.log(`📊 Statistics:`);
		console.log(`   - Total queries: ${exportData.summary.total_queries}`);
		console.log(`   - Total calls: ${exportData.summary.total_calls?.toLocaleString() || 0}`);
		console.log(`   - Total execution time: ${(exportData.summary.total_execution_time_ms / 1000).toFixed(2)}s`);
		console.log(`   - File size: ${(fileSize / 1024).toFixed(2)} KB\n`);

	} catch (error) {
		console.error('❌ Error:', error.message);
		if (error.message.includes('relation "pg_stat_statements" does not exist')) {
			console.log('');
			console.log('The pg_stat_statements extension is not enabled.');
			console.log('Enable it with: npm run enable-pg-stat-statements');
		}
		process.exit(1);
	} finally {
		await pool.end();
	}
}

main().catch(error => {
	console.error('❌ Unhandled error:', error);
	process.exit(1);
});
