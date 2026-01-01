/**
 * Script to generate a bcrypt hash for a password
 * Usage: node src/scripts/generate-password-hash.js
 * Then enter password when prompted (more secure than command line args)
 */

const bcrypt = require('bcrypt');
const readline = require('readline');

async function generateHash() {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: true // Hide password input
	});

	rl.question('Enter password to hash (input will be hidden): ', async (password) => {
		rl.close();

		if (!password || password.trim().length === 0) {
			console.error('❌ Error: Password cannot be empty');
			process.exit(1);
		}

		try {
			console.log('🔐 Generating password hash...');
			const hash = await bcrypt.hash(password.trim(), 10);
			console.log('\n✅ Password hash generated successfully!');
			console.log('Hash:', hash);
			console.log('\n📝 Add this to your .env file:');
			console.log(`ADMIN_PASSWORD_HASH=${hash}`);
			console.log('\n⚠️  Important: Never commit password hashes to version control!');
		} catch (error) {
			console.error('❌ Error generating hash:', error.message);
			process.exit(1);
		}
	});

	// Handle Ctrl+C gracefully
	rl.on('SIGINT', () => {
		console.log('\n❌ Operation cancelled');
		rl.close();
		process.exit(0);
	});
}

generateHash();
