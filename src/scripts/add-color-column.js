#!/usr/bin/env node

/**
 * Script to add the missing 'color' column to the teams table
 */

import 'dotenv/config';
import {Pool} from 'pg';

function maskUrl(url) {
	return url.replace(/:[^:@]+@/, ':****@');
}

async function main() {
	const databaseUrl = process.env.DATABASE_INTERNAL_URL || process.env.DATABASE_URL;

	if (!databaseUrl) {
		console.error('❌ DATABASE_URL or DATABASE_INTERNAL_URL must be set');
		process.exit(1);
	}

	// Determine if we're using internal URL (no SSL needed for internal connections)
	const isInternalUrl = Boolean(process.env.DATABASE_INTERNAL_URL);
	const useSSL = isInternalUrl ? false : (process.env.DATABASE_SSL === 'true' ? {rejectUnauthorized: false} : false);

	console.log(`🔄 Connecting to PostgreSQL using ${isInternalUrl ? 'internal' : 'external'} URL: ${maskUrl(databaseUrl)}`);

	const pool = new Pool({
		connectionString: databaseUrl,
		ssl: useSSL,
	});

	try {
		// Test connection
		await pool.query('SELECT NOW()');
		console.log('✅ Database connection established');

		console.log('📊 Adding color column to teams table...');

		// Add the color column if it doesn't exist
		await pool.query(`
			ALTER TABLE teams
			ADD COLUMN IF NOT EXISTS color TEXT;
		`);

		console.log('✅ Color column added successfully to teams table');

		process.exit(0);
	} catch (error) {
		console.error('❌ Error adding color column:', error);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

main();