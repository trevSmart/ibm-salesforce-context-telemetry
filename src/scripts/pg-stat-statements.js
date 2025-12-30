
/**
 * Script to query and display pg_stat_statements statistics
 *
 * This script queries the pg_stat_statements view to show:
 * - Most frequently executed queries
 * - Slowest queries
 * - Queries with highest total execution time
 * - Cache hit ratios
 *
 * Usage:
 *   node src/scripts/pg-stat-statements.js [--env=local|prod] [--top=N] [--slow] [--format=table|json]
 *
 * Options:
 *   --env=local|prod: Target environment (default: local)
 *   --top=N: Show top N queries (default: 10)
 *   --slow: Show only slow queries (mean_exec_time > 100ms)
 *   --format=table|json: Output format (default: table)
 */

import 'dotenv/config';
import {Pool} from 'pg';

function maskUrl(url) {
	return url.replace(/:[^:@]+@/, ':****@');
}

function formatTime(ms) {
	if (ms < 1) {return `${(ms * 1000).toFixed(2)} µs`;}
	if (ms < 1000) {return `${ms.toFixed(2)} ms`;}
	return `${(ms / 1000).toFixed(2)} s`;
}


async function checkExtension(pool) {
	const result = await pool.query(`
		SELECT EXISTS(
			SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
		) as exists;
	`);
	return result.rows[0].exists;
}

async function getTopQueries(pool, limit, slowOnly) {
	let query = `
		SELECT
			LEFT(query, 100) as query_preview,
			calls,
			total_exec_time,
			mean_exec_time,
			max_exec_time,
			rows,
			shared_blks_hit,
			shared_blks_read,
			CASE
				WHEN (shared_blks_hit + shared_blks_read) > 0
				THEN 100.0 * shared_blks_hit / (shared_blks_hit + shared_blks_read)
				ELSE 0
			END as cache_hit_ratio
		FROM pg_stat_statements
		WHERE query NOT LIKE '%pg_stat_statements%'
	`;

	if (slowOnly) {
		query += ' AND mean_exec_time > 100';
	}

	query += `
		ORDER BY total_exec_time DESC
		LIMIT $1
	`;

	const result = await pool.query(query, [limit]);
	return result.rows;
}

async function getStatistics(pool) {
	const result = await pool.query(`
		SELECT
			COUNT(*) as total_queries,
			SUM(calls) as total_calls,
			SUM(total_exec_time) as total_time,
			AVG(mean_exec_time) as avg_mean_time,
			MAX(max_exec_time) as max_time,
			SUM(shared_blks_hit) as total_cache_hits,
			SUM(shared_blks_read) as total_cache_reads
		FROM pg_stat_statements
		WHERE query NOT LIKE '%pg_stat_statements%'
	`);
	return result.rows[0];
}

function displayTable(queries, stats) {
	console.log('\n📊 Query Statistics Summary');
	console.log('═'.repeat(80));
	console.log(`Total queries tracked: ${stats.total_queries}`);
	console.log(`Total calls: ${stats.total_calls?.toLocaleString() || 0}`);
	console.log(`Total execution time: ${formatTime(stats.total_time || 0)}`);
	console.log(`Average mean time: ${formatTime(stats.avg_mean_time || 0)}`);
	console.log(`Max execution time: ${formatTime(stats.max_time || 0)}`);

	if (stats.total_cache_hits && stats.total_cache_reads) {
		const totalBlocks = Number.parseInt(stats.total_cache_hits, 10) + Number.parseInt(stats.total_cache_reads, 10);
		const hitRatio = totalBlocks > 0? (100.0 * Number.parseInt(stats.total_cache_hits, 10) / totalBlocks).toFixed(2): 0;
		console.log(`Cache hit ratio: ${hitRatio}%`);
	}
	console.log('═'.repeat(80));
	console.log('');

	if (queries.length === 0) {
		console.log('No queries found matching criteria');
		return;
	}

	console.log('🔝 Top Queries by Total Execution Time');
	console.log('═'.repeat(120));
	console.log(
		`${'Calls'.padEnd(10) +
		'Total Time'.padEnd(15) +
		'Mean Time'.padEnd(15) +
		'Max Time'.padEnd(15) +
		'Rows'.padEnd(12) +
		'Cache Hit'.padEnd(12)
		}Query Preview`
	);
	console.log('─'.repeat(120));

	queries.forEach((q, _i) => {
		const cacheHit = q.cache_hit_ratio ? `${Number.parseFloat(q.cache_hit_ratio).toFixed(1)}%` : 'N/A';
		console.log(
			`${q.calls?.toLocaleString() || 0}`.padEnd(10) +
			formatTime(q.total_exec_time || 0).padEnd(15) +
			formatTime(q.mean_exec_time || 0).padEnd(15) +
			formatTime(q.max_exec_time || 0).padEnd(15) +
			`${q.rows?.toLocaleString() || 0}`.padEnd(12) +
			cacheHit.padEnd(12) +
			(q.query_preview || '').substring(0, 50)
		);
	});

	console.log('═'.repeat(120));
}

function displayJSON(queries, stats) {
	const output = {
		summary: {
			total_queries: Number.parseInt(stats.total_queries || 0, 10),
			total_calls: Number.parseInt(stats.total_calls || 0, 10),
			total_execution_time_ms: Number.parseFloat(stats.total_time || 0),
			average_mean_time_ms: Number.parseFloat(stats.avg_mean_time || 0),
			max_execution_time_ms: Number.parseFloat(stats.max_time || 0),
			cache_hit_ratio: stats.total_cache_hits && stats.total_cache_reads? (100.0 * Number.parseInt(stats.total_cache_hits, 10) / (Number.parseInt(stats.total_cache_hits, 10) + Number.parseInt(stats.total_cache_reads, 10))): null
		},
		queries: queries.map(q => ({
			query_preview: q.query_preview,
			calls: Number.parseInt(q.calls || 0, 10),
			total_exec_time_ms: Number.parseFloat(q.total_exec_time || 0),
			mean_exec_time_ms: Number.parseFloat(q.mean_exec_time || 0),
			max_exec_time_ms: Number.parseFloat(q.max_exec_time || 0),
			rows: Number.parseInt(q.rows || 0, 10),
			cache_hit_ratio: q.cache_hit_ratio ? Number.parseFloat(q.cache_hit_ratio) : null
		}))
	};

	console.log(JSON.stringify(output, null, 2));
}

async function main() {
	const args = process.argv.slice(2);
	const envArg = args.find(arg => arg.startsWith('--env='));
	const topArg = args.find(arg => arg.startsWith('--top='));
	const formatArg = args.find(arg => arg.startsWith('--format='));
	const slowOnly = args.includes('--slow');

	const env = envArg ? envArg.split('=')[1] : 'local';
	const top = topArg ? Number.parseInt(topArg.split('=')[1], 10) : 10;
	const format = formatArg ? formatArg.split('=')[1] : 'table';

	// Safety check: prevent accidental execution in production
	const isProduction =
		process.env.ENVIRONMENT === 'production' ||
		process.env.NODE_ENV === 'production' ||
		(process.env.DATABASE_URL && (
			process.env.DATABASE_URL.includes('render.com') ||
			process.env.DATABASE_URL.includes('amazonaws.com') ||
			process.env.DATABASE_URL.includes('heroku.com')
		)) ||
		process.env.DATABASE_INTERNAL_URL;

	if (isProduction && env !== 'prod') {
		// If production environment detected but user didn't explicitly use --env=prod
		// This is a safety measure to prevent accidental execution
		console.error('❌ Error: Production environment detected');
		console.error('   pg_stat_statements is only available in local development');
		console.error('   If you really want to query production, use: --env=prod');
		process.exit(1);
	}

	let dbUrl;
	let envName;

	if (env === 'prod') {
		if (!process.env.DATABASE_URL_PROD) {
			console.error('❌ Error: DATABASE_URL_PROD must be set for production');
			process.exit(1);
		}
		dbUrl = process.env.DATABASE_URL_PROD;
		envName = 'production';
	} else {
		if (!process.env.DATABASE_URL) {
			console.error('❌ Error: DATABASE_URL must be set');
			process.exit(1);
		}
		dbUrl = process.env.DATABASE_URL;
		envName = 'local';
	}

	console.log(`📊 Connecting to ${envName} database...`);
	console.log(`   ${maskUrl(dbUrl)}\n`);

	const pool = new Pool({
		connectionString: dbUrl,
		ssl: dbUrl.includes('sslmode=require') || dbUrl.includes('render.com')? {rejectUnauthorized: false}: (process.env.DATABASE_SSL === 'true' ? {rejectUnauthorized: false} : false)
	});

	try {
		await pool.query('SELECT NOW()');
		console.log(`✅ Connected to ${envName} database\n`);

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

		// Get statistics
		const stats = await getStatistics(pool);
		const queries = await getTopQueries(pool, top, slowOnly);

		// Display results
		if (format === 'json') {
			displayJSON(queries, stats);
		} else {
			displayTable(queries, stats);
		}

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
