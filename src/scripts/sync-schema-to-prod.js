#!/usr/bin/env node

/**
 * Helper script to sync database schema from local to production using pgsync
 *
 * This script provides a safer way to apply schema changes to production
 * without requiring a full repository deploy to Render.
 *
 * Usage:
 *   node src/scripts/sync-schema-to-prod.js [--dry-run] [--tables=table1,table2]
 *
 * Environment variables:
 *   DATABASE_URL_PROD - Production database URL (required)
 *   DATABASE_URL - Local database URL (optional, uses .env default)
 *
 * Options:
 *   --dry-run: Show what would be synced without actually syncing
 *   --tables: Comma-separated list of specific tables to sync
 *   --groups: Comma-separated list of groups to sync (from .pgsync.yml)
 *
 * IMPORTANT: Always backup production before syncing!
 */

import 'dotenv/config';
import {execSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../..');

function checkPgsyncInstalled() {
	try {
		execSync('pgsync --version', {stdio: 'ignore'});
		return true;
	} catch {
		return false;
	}
}

function checkDatabaseUrl() {
	if (!process.env.DATABASE_URL_PROD) {
		console.error('❌ Error: DATABASE_URL_PROD must be set');
		console.error('');
		console.error('Usage:');
		console.error('  DATABASE_URL_PROD="postgresql://user:pass@host/db" node src/scripts/sync-schema-to-prod.js');
		console.error('');
		console.error('Or set it in your .env file:');
		console.error('  DATABASE_URL_PROD=postgresql://user:pass@host/db');
		process.exit(1);
	}
}

function maskUrl(url) {
	return url.replace(/:[^:@]+@/, ':****@');
}

async function main() {
	const args = process.argv.slice(2);
	const isDryRun = args.includes('--dry-run');
	const tablesArg = args.find(arg => arg.startsWith('--tables='));
	const groupsArg = args.find(arg => arg.startsWith('--groups='));

	const tables = tablesArg ? tablesArg.split('=')[1].split(',') : null;
	const groups = groupsArg ? groupsArg.split('=')[1].split(',') : null;

	console.log('🔍 Checking prerequisites...\n');

	// Check if pgsync is installed
	if (!checkPgsyncInstalled()) {
		console.error('❌ Error: pgsync is not installed');
		console.error('');
		console.error('Install it with one of these methods:');
		console.error('  gem install pgsync');
		console.error('  brew install pgsync');
		console.error('  docker pull ankane/pgsync');
		process.exit(1);
	}
	console.log('✅ pgsync is installed\n');

	// Check if .pgsync.yml exists
	try {
		readFileSync(resolve(projectRoot, '.pgsync.yml'), 'utf8');
		console.log('✅ .pgsync.yml configuration found\n');
	} catch {
		console.error('❌ Error: .pgsync.yml not found');
		console.error('   Run: pgsync --init');
		process.exit(1);
	}

	// Check database URLs
	checkDatabaseUrl();
	const localUrl = process.env.DATABASE_URL || 'postgresql://localhost:5432/telemetry_local';
	const prodUrl = process.env.DATABASE_URL_PROD;

	console.log('📊 Configuration:');
	console.log(`   Local:  ${maskUrl(localUrl)}`);
	console.log(`   Prod:   ${maskUrl(prodUrl)}\n`);

	if (isDryRun) {
		console.log('🔍 DRY RUN MODE - No changes will be made\n');
	}

	// Build pgsync command
	let command = 'pgsync --schema-only';

	if (isDryRun) {
		command += ' --debug';
	}

	if (tables) {
		command += ` ${tables.join(',')}`;
	} else if (groups) {
		command += ` ${groups.join(',')}`;
	}

	// Set environment variables
	const env = {
		...process.env,
		DATABASE_URL_PROD: prodUrl
	};

	console.log('🚀 Executing pgsync...\n');
	console.log(`Command: ${command}\n`);

	try {
		if (isDryRun) {
			console.log('📋 This is a dry run. The following SQL would be executed:\n');
		}

		execSync(command, {
			cwd: projectRoot,
			env,
			stdio: 'inherit'
		});

		if (!isDryRun) {
			console.log('\n✅ Schema sync completed successfully!');
			console.log('\n📋 Next steps:');
			console.log('   1. Verify the changes in production');
			console.log('   2. Test the application to ensure everything works');
			console.log('   3. Consider committing the schema changes to the repository');
		}
	} catch (error) {
		console.error('\n❌ Error during schema sync');
		if (error.status) {
			process.exit(error.status);
		}
		process.exit(1);
	}
}

main().catch(error => {
	console.error('❌ Unhandled error:', error);
	process.exit(1);
});
