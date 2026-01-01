/**
 * Script to update a user's role in the database
 * Usage: node src/scripts/update-user-role.js <username> <role>
 */

// Load environment variables from .env file
require('dotenv').config();

const db = require('../storage/database');
const auth = require('../auth/auth');

async function updateUserRole() {
	const username = process.argv[2];
	const roleInput = process.argv[3];

	if (!username || !roleInput) {
		console.error('Usage: node src/scripts/update-user-role.js <username> <role>');
		console.error('Roles: basic, advanced, administrator');
		process.exit(1);
	}

	try {
		// Initialize database
		await db.init();
		console.log('Database initialized');

		// Check if user exists
		const existingUser = await db.getUserByUsername(username);
		if (!existingUser) {
			console.error(`❌ User "${username}" does not exist`);
			process.exit(1);
		}

		// Normalize role
		const normalizedRole = auth.normalizeRole(roleInput);

		// Update user role
		const updated = await db.updateUserRole(username, normalizedRole);

		if (updated) {
			// Get updated user
			const user = await db.getUserByUsername(username);
			console.log('\n✅ User role updated successfully:');
			console.log(`   Username: ${user.username}`);
			console.log(`   ID: ${user.id}`);
			console.log(`   Role: ${user.role}`);
			console.log(`   Created at: ${user.created_at}\n`);
		} else {
			console.error('❌ Failed to update user role');
			process.exit(1);
		}

		// Close database connection
		await db.close();
	} catch (error) {
		console.error('Error updating user role:', error.message);
		process.exit(1);
	}
}

updateUserRole();

