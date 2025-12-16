/**
 * Script to generate a bcrypt hash for a password
 * Usage: node src/scripts/generate-password-hash.js <password>
 */

const bcrypt = require('bcrypt');

async function generateHash() {
	const password = process.argv[2];

	if (!password) {
		console.error('Usage: node src/scripts/generate-password-hash.js <password>');
		process.exit(1);
	}

	try {
		const hash = await bcrypt.hash(password, 10);
		console.log('\n✅ Password hash generated:');
		console.log(hash);
		console.log('\nAdd this to your .env file:');
		console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
	} catch (error) {
		console.error('Error generating hash:', error);
		process.exit(1);
	}
}

generateHash();
