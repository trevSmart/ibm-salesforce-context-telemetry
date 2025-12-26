/**
 * Script to create an initial template database for production
 * 
 * This creates a SQLite database template with:
 * - Complete schema (all tables and migrations)
 * - Single user "god" with role "god"
 * - No test data
 * 
 * This template is intended for production deployments where you want
 * a clean database with only the schema initialized.
 * 
 * Usage: 
 *   node src/scripts/create-initial-template-database.js
 * 
 * Environment variables:
 *   INITIAL_TEMPLATE_DB_PATH - Path where to create initial template (default: src/data/database-base-template.db)
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const initialTemplateDbPath = process.env.INITIAL_TEMPLATE_DB_PATH || path.join(__dirname, '..', 'data', 'database-base-template.db');

async function createInitialTemplateDatabase() {
	console.log('🏗️  Creating initial template database (schema only)...\n');

	try {
		// Import database module
		const dbModule = await import('../storage/database.js');

		// Set environment variables for this run
		process.env.DB_TYPE = 'sqlite';
		process.env.DB_PATH = initialTemplateDbPath;
		// Don't set COPILOT_USERNAME/PASSWORD - we'll create the "god" user explicitly below

		// Remove existing initial template database if it exists
		if (fs.existsSync(initialTemplateDbPath)) {
			console.log(`🗑️  Removing existing initial template database at ${initialTemplateDbPath}`);
			fs.unlinkSync(initialTemplateDbPath);
		}

		// Ensure data directory exists
		const dataDir = path.dirname(initialTemplateDbPath);
		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir, {recursive: true});
		}

		// Initialize database (this will create tables and run migrations)
		console.log('📊 Initializing database schema...');
		await dbModule.init();

		// Create "god" user (only user in base template)
		console.log('👤 Creating god user...');
		const {hashPassword} = await import('../auth/auth.js');
		const {createUser, getUserByUsername} = dbModule;

		const godUsername = 'god';
		const godPassword = 'god';
		const godRole = 'god';

		if (!(await getUserByUsername(godUsername))) {
			const godHash = await hashPassword(godPassword);
			await createUser(godUsername, godHash, godRole);
			console.log(`  ✅ Created ${godUsername} (role: ${godRole} - full access)`);
		} else {
			// Update role if it has changed
			const existingGod = await getUserByUsername(godUsername);
			if (existingGod.role !== godRole) {
				await dbModule.updateUserRole(godUsername, godRole);
				console.log(`  ✅ Updated ${godUsername} role to ${godRole}`);
			}
		}

		console.log(`\n👤 User created:`);
		console.log(`   - ${godUsername} / ${godPassword} (role: ${godRole})`);
		console.log('');

		console.log('\n✅ Initial template database created successfully!');
		console.log(`\n📁 Location: ${initialTemplateDbPath}`);
		console.log('\n📋 This template contains:');
		console.log('   ✅ Complete schema (all tables and migrations)');
		console.log('   ✅ Single user "god" with role "god"');
		console.log('   ❌ No test data');
		console.log('');

		// Close database connection
		await dbModule.close();

		console.log('💡 Tip: Copy this file to src/data/telemetry.db when setting up a new production environment.');
		console.log('   The .gitignore will prevent committing telemetry.db, but database-base-template.db can be committed.\n');

	} catch (error) {
		console.error('❌ Error creating initial template database:', error);
		process.exit(1);
	}
}

createInitialTemplateDatabase();
