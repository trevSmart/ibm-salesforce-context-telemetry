
/**
 * Script to enable pg_stat_statements extension
 *
 * This script attempts to enable the pg_stat_statements extension in PostgreSQL.
 * Note: This requires:
 * 1. PostgreSQL server configured with shared_preload_libraries = 'pg_stat_statements'
 * 2. Server restart after configuration
 * 3. Superuser or CREATE EXTENSION privileges
 *
 * Usage:
 *   node src/scripts/enable-pg-stat-statements.js [--env=local|prod]
 *
 * Environment variables:
 *   DATABASE_URL - Local database URL (default)
 *   DATABASE_URL_PROD - Production database URL (when --env=prod)
 *
 * For local setup, you also need to:
 * 1. Edit postgresql.conf and add: shared_preload_libraries = 'pg_stat_statements'
 * 2. Restart PostgreSQL: brew services restart postgresql@16
 */

import 'dotenv/config';
import {Pool} from 'pg';

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

async function checkSharedPreloadLibraries(pool) {
	try {
		const result = await pool.query(`
			SHOW shared_preload_libraries;
		`);
		const libraries = result.rows[0].shared_preload_libraries || '';
		return libraries.includes('pg_stat_statements');
	} catch (error) {
		// This query might fail if user doesn't have permissions
		console.log(`   ⚠️  Could not check shared_preload_libraries: ${error.message}`);
		return null;
	}
}

async function enableExtension(pool) {
	try {
		await pool.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements;');
		return true;
	} catch (error) {
		throw error;
	}
}

async function main() {
	const args = process.argv.slice(2);
	const envArg = args.find(arg => arg.startsWith('--env='));
	const env = envArg ? envArg.split('=')[1] : 'local';

	// Safety check: prevent enabling in production
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
		console.error('❌ Error: Production environment detected');
		console.error('   pg_stat_statements cannot be enabled in production');
		console.error('   This feature is only available for local development');
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

		// Check if extension already exists
		const exists = await checkExtension(pool);
		if (exists) {
			console.log('✅ pg_stat_statements extension is already enabled\n');
			await pool.end();
			process.exit(0);
		}

		// Check shared_preload_libraries
		console.log('🔍 Checking configuration...\n');
		const preloadEnabled = await checkSharedPreloadLibraries(pool);

		if (preloadEnabled === false) {
			console.log('❌ pg_stat_statements is not in shared_preload_libraries');
			console.log('');
			if (env === 'local') {
				console.log('📋 To enable locally:');
				console.log('   1. Edit postgresql.conf:');
				console.log('      shared_preload_libraries = \'pg_stat_statements\'');
				console.log('');
				console.log('   2. Restart PostgreSQL:');
				console.log('      brew services restart postgresql@16');
				console.log('');
				console.log('   3. Run this script again');
			} else {
				console.log('⚠️  On Render, you typically cannot modify postgresql.conf');
				console.log('   Check if Render provides pg_stat_statements by default');
			}
			await pool.end();
			process.exit(1);
		}

		if (preloadEnabled === null) {
			console.log('   ⚠️  Could not verify shared_preload_libraries (permissions issue)');
			console.log('   Attempting to create extension anyway...\n');
		} else {
			console.log('✅ pg_stat_statements is in shared_preload_libraries\n');
		}

		// Try to create extension
		console.log('🔧 Creating pg_stat_statements extension...\n');
		try {
			await enableExtension(pool);
			console.log('✅ Extension created successfully!\n');
			console.log('📋 Next steps:');
			console.log('   - Query statistics: npm run pg-stat-statements');
			console.log('   - View in UI: Check if API endpoint is available');
		} catch (error) {
			console.error('❌ Failed to create extension:', error.message);
			console.log('');
			if (error.message.includes('permission denied') || error.message.includes('must be superuser')) {
				console.log('⚠️  This operation requires superuser privileges');
				if (env === 'prod') {
					console.log('   On Render, you may not have superuser access');
					console.log('   Check Render documentation for extension management');
				}
			} else 			if (error.message.includes('library "pg_stat_statements" is not available')) {
				console.log('⚠️  The pg_stat_statements library is not loaded');
				console.log('   Make sure shared_preload_libraries includes pg_stat_statements');
				console.log('   and PostgreSQL has been restarted');
			}
			process.exit(1);
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
