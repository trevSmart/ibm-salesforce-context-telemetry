/**
 * Script to create a minimal seed database for GitHub Copilot
 *
 * This creates a SQLite database with:
 * - Complete schema (all tables and migrations)
 * - Example users for each role (basic, advanced, administrator, god)
 * - Test telemetry data (generated using generate-test-data.js)
 *
 * The seed database can be committed to the repository, allowing GitHub Copilot
 * to quickly initialize the database without running migrations from scratch.
 *
 * Usage:
 *   node src/scripts/create-seed-database.js
 *
 * Environment variables:
 *   COPILOT_USERNAME - Username for Copilot user (default: copilot)
 *   COPILOT_PASSWORD - Password for Copilot user (default: copilot)
 *   COPILOT_ROLE - Role for Copilot user (default: god)
 *   SEED_DB_PATH - Path where to create seed database (default: src/data/telemetry.seed.db)
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
import {spawn} from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const copilotUsername = process.env.COPILOT_USERNAME || 'copilot';
const copilotPassword = process.env.COPILOT_PASSWORD || 'copilot';
const copilotRole = process.env.COPILOT_ROLE || 'god';
const seedDbPath = process.env.SEED_DB_PATH || path.join(__dirname, '..', 'data', 'telemetry.seed.db');

async function createSeedDatabase() {
	console.log('🌱 Creating seed database for GitHub Copilot...\n');

	try {
		// Import database module
		const dbModule = await import('../storage/database.js');

		// Set environment variables for this run
		process.env.DB_TYPE = 'sqlite';
		process.env.DB_PATH = seedDbPath;
		// Don't set COPILOT_USERNAME/PASSWORD here - we'll create the user explicitly below
		// This prevents ensureCopilotUser() from creating it during init()

		// Remove existing seed database if it exists
		if (fs.existsSync(seedDbPath)) {
			console.log(`🗑️  Removing existing seed database at ${seedDbPath}`);
			fs.unlinkSync(seedDbPath);
		}

		// Ensure data directory exists
		const dataDir = path.dirname(seedDbPath);
		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir, {recursive: true});
		}

		// Initialize database (this will create tables and the Copilot user)
		console.log('📊 Initializing database schema...');
		await dbModule.init();

		// Create example users for each role
		console.log('👥 Creating example users for each role...');
		const {hashPassword} = await import('../auth/auth.js');
		const {createUser, getUserByUsername} = dbModule;

		// Create basic user
		const basicUsername = 'basic-user';
		const basicPassword = 'basic';
		if (!(await getUserByUsername(basicUsername))) {
			const basicHash = await hashPassword(basicPassword);
			await createUser(basicUsername, basicHash, 'basic');
			console.log(`  ✅ Created ${basicUsername} (role: basic)`);
		}

		// Create advanced user
		const advancedUsername = 'advanced-user';
		const advancedPassword = 'advanced';
		if (!(await getUserByUsername(advancedUsername))) {
			const advancedHash = await hashPassword(advancedPassword);
			await createUser(advancedUsername, advancedHash, 'advanced');
			console.log(`  ✅ Created ${advancedUsername} (role: advanced)`);
		}

		// Create administrator user
		const adminUsername = 'admin-user';
		const adminPassword = 'admin';
		if (!(await getUserByUsername(adminUsername))) {
			const adminHash = await hashPassword(adminPassword);
			await createUser(adminUsername, adminHash, 'administrator');
			console.log(`  ✅ Created ${adminUsername} (role: administrator)`);
		}

		// Create Copilot user (always create with default credentials for seed database)
		if (!(await getUserByUsername(copilotUsername))) {
			const copilotHash = await hashPassword(copilotPassword);
			await createUser(copilotUsername, copilotHash, copilotRole);
			console.log(`  ✅ Created ${copilotUsername} (role: ${copilotRole} - full access)`);
		} else {
			// Update role if it has changed
			const existingCopilot = await getUserByUsername(copilotUsername);
			if (existingCopilot.role !== copilotRole) {
				await dbModule.updateUserRole(copilotUsername, copilotRole);
				console.log(`  ✅ Updated ${copilotUsername} role to ${copilotRole}`);
			}
		}

		console.log('\n✅ Users created successfully!');
		console.log(`\n👤 Example users created:`);
		console.log(`   - ${basicUsername} / ${basicPassword} (role: basic)`);
		console.log(`   - ${advancedUsername} / ${advancedPassword} (role: advanced)`);
		console.log(`   - ${adminUsername} / ${adminPassword} (role: administrator)`);
		console.log(`   - ${copilotUsername} / ${copilotPassword} (role: ${copilotRole} - full access)`);
		console.log('');

		// Generate test data
		console.log('📊 Generating test data...');
		await generateTestDataForSeed(dbModule);

		console.log('\n✅ Seed database created successfully!');
		console.log(`\n📁 Location: ${seedDbPath}`);
		console.log('');

		// Close database connection
		await dbModule.close();

		console.log('💡 Tip: Copy this file to src/data/telemetry.db when setting up a new environment.');
		console.log('   The .gitignore will prevent committing telemetry.db, but telemetry.seed.db can be committed.\n');

	} catch (error) {
		console.error('❌ Error creating seed database:', error);
		process.exit(1);
	}
}

/**
 * Generate test data for seed database
 * This calls the generate-test-data.js script with appropriate options
 * We generate less data (1 week instead of 6) to keep the seed database small
 */
async function generateTestDataForSeed(dbModule) {
	return new Promise((resolve) => {
		const scriptPath = path.join(__dirname, 'generate-test-data.js');

		// Calculate a date 3 days ago as the center point for 1 week of data
		const targetDate = new Date();
		targetDate.setDate(targetDate.getDate() - 3);
		const targetDateStr = targetDate.toISOString().split('T')[0];

		const nodeProcess = spawn('node', [
			scriptPath,
			targetDateStr,
			'false' // Don't delete existing data (users)
		], {
			env: {
				...process.env,
				DB_TYPE: 'sqlite',
				DB_PATH: seedDbPath,
				ENVIRONMENT: 'dev',
				// Override to generate less data (1 week instead of 6)
				SEED_WEEKS: '1',
				SEED_NUM_USERS: '10'
			},
			stdio: 'inherit'
		});

		nodeProcess.on('close', (code) => {
			if (code === 0) {
				console.log('✅ Test data generated successfully');
				resolve();
			} else {
				console.warn(`⚠️  Test data generation exited with code ${code}`);
				// Don't fail the whole process if test data generation fails
				// The seed database is still useful without test data
				resolve();
			}
		});

		nodeProcess.on('error', (error) => {
			console.warn(`⚠️  Error generating test data: ${error.message}`);
			console.warn('   Continuing without test data...');
			// Don't fail the whole process if test data generation fails
			resolve();
		});
	});
}

createSeedDatabase();
