/**
 * Script to create a user in the database
 * Usage: node src/scripts/create-user.js <username> <password> [role]
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import {init, getUserByUsername, createUser, close} from '../storage/database.js';
import {hashPassword, normalizeRole} from '../auth/auth.js';

async function createUserScript() {
	const username = process.argv[2];
	const password = process.argv[3];
	const roleInput = process.argv[4];

	if (!username || !password) {
		console.error('Usage: node src/scripts/create-user.js <username> <password> [role]');
		process.exit(1);
	}

	try {
		// Initialize database
		await init();
		console.log('Database initialized');

		// Check if user already exists
		const existingUser = await getUserByUsername(username);
		if (existingUser) {
			console.error(`❌ User "${username}" already exists`);
			process.exit(1);
		}

		// Hash password
		const passwordHash = await hashPassword(password);
		// Normalize role using auth module (supports basic, advanced, administrator, god)
		const normalizedRole = roleInput ? normalizeRole(roleInput) : 'basic';

		// Create user
		const user = await createUser(username, passwordHash, normalizedRole);

		console.log('\n✅ User created successfully:');
		console.log(`   Username: ${user.username}`);
		console.log(`   ID: ${user.id}`);
		console.log(`   Role: ${normalizedRole}`);
		console.log(`   Created at: ${user.created_at}\n`);

		// Close database connection
		await close();
	} catch (error) {
		console.error('Error creating user:', error);
		process.exit(1);
	}
}

createUserScript();
