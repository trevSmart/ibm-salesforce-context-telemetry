/**
 * Script to create a test template database for GitHub Copilot
 *
 * This creates a SQLite database template for testing and development with:
 * - Complete schema (all tables and migrations)
 * - Single user "copilot" with role "god"
 * - Test telemetry data (generated using generate-test-data.js)
 *
 * This template is intended for GitHub Copilot environments and can be committed
 * to the repository, allowing quick database initialization without running
 * migrations from scratch.
 *
 * Usage:
 *   node src/scripts/create-test-template-database.js
 *
 * Environment variables:
 *   COPILOT_USERNAME - Username for Copilot user (default: copilot)
 *   COPILOT_PASSWORD - Password for Copilot user (default: copilot)
 *   COPILOT_ROLE - Role for Copilot user (default: god)
 *   TEST_TEMPLATE_DB_PATH - Path where to create test template (default: src/data/database-test-template.db)
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

const copilotUsername = 'copilot';
const copilotPassword = 'copilot';
const copilotRole = 'god';
const testTemplateDbPath = process.env.TEST_TEMPLATE_DB_PATH || path.join(__dirname, '..', 'data', 'database-test-template.db');

async function createTestTemplateDatabase() {
	console.log('🧪 Creating test template database for GitHub Copilot...\n');

	try {
		// Import database module
		const dbModule = await import('../storage/database.js');

		// Set environment variables for this run
		process.env.DB_TYPE = 'sqlite';
		process.env.DB_PATH = testTemplateDbPath;
		// Don't set COPILOT_USERNAME/PASSWORD here - we'll create the user explicitly below
		// This prevents ensureCopilotUser() from creating it during init()

		// Remove existing test template database if it exists
		if (fs.existsSync(testTemplateDbPath)) {
			console.log(`🗑️  Removing existing test template database at ${testTemplateDbPath}`);
			fs.unlinkSync(testTemplateDbPath);
		}

		// Ensure data directory exists
		const dataDir = path.dirname(testTemplateDbPath);
		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir, {recursive: true});
		}

		// Initialize database (this will create tables)
		console.log('📊 Initializing database schema...');
		await dbModule.init();

		// Create Copilot user (only user in test template)
		console.log('👤 Creating Copilot user...');
		const {hashPassword} = await import('../auth/auth.js');
		const {createUser, getUserByUsername} = dbModule;

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

		console.log(`\n👤 User created:`);
		console.log(`   - ${copilotUsername} / ${copilotPassword} (role: ${copilotRole})`);
		console.log('');

		// Generate test data
		console.log('📊 Generating test data...');
		await generateTestDataForTemplate(dbModule);

		console.log('\n✅ Test template database created successfully!');
		console.log(`\n📁 Location: ${testTemplateDbPath}`);
		console.log('');

		// Close database connection
		await dbModule.close();

		console.log('💡 Tip: Copy this file to src/data/telemetry.db when setting up a new test environment.');
		console.log('   The .gitignore will prevent committing telemetry.db, but database-test-template.db can be committed.\n');

	} catch (error) {
		console.error('❌ Error creating test template database:', error);
		process.exit(1);
	}
}

/**
 * Generate test data for test template database
 * This calls the generate-test-data.js script with appropriate options
 * We generate less data (1 week instead of 6) to keep the template database small
 */
async function generateTestDataForTemplate(_dbModule) {
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
				DB_PATH: testTemplateDbPath,
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
				// The test template database is still useful without test data
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

createTestTemplateDatabase();
