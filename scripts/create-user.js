/**
 * Script to create a user in the database
 * Usage: node scripts/create-user.js <username> <password>
 */

const db = require('../storage/database');
const auth = require('../auth/auth');

async function createUser() {
	const username = process.argv[2];
	const password = process.argv[3];

	if (!username || !password) {
		console.error('Usage: node scripts/create-user.js <username> <password>');
		process.exit(1);
	}

	try {
		// Initialize database
		await db.init();
		console.log('Database initialized');

		// Check if user already exists
		const existingUser = await db.getUserByUsername(username);
		if (existingUser) {
			console.error(`❌ User "${username}" already exists`);
			process.exit(1);
		}

		// Hash password
		const passwordHash = await auth.hashPassword(password);

		// Create user
		const user = await db.createUser(username, passwordHash);

		console.log('\n✅ User created successfully:');
		console.log(`   Username: ${user.username}`);
		console.log(`   ID: ${user.id}`);
		console.log(`   Created at: ${user.created_at}\n`);

		// Close database connection
		await db.close();
	} catch (error) {
		console.error('Error creating user:', error);
		process.exit(1);
	}
}

createUser();
