/**
 * Migration script to update users.role default value
 *
 * Changes the default value of users.role from 'advanced' to 'basic' in production
 * Note: This only affects new records, not existing ones
 *
 * Usage: node src/scripts/migrate-update-users-role-default.js
 */

// Load environment variables from .env file
import 'dotenv/config';

import {init, close, getPostgresPool} from '../storage/database.js';

async function main() {
	console.log('🚀 Starting migration to update users.role default value...\n');

	try {
		// Initialize database connection
		await init();
		console.log('✅ Database connection established\n');

		const dbInstance = getPostgresPool();
		if (!dbInstance) {
			throw new Error('PostgreSQL database instance not available');
		}

		console.log('🔄 Updating users.role default value...\n');

		// Change default value from 'advanced' to 'basic'
		try {
			await dbInstance.query("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'basic';");
			console.log("   ✓ Updated users.role default value to 'basic'");
			console.log('   ℹ️  Note: This only affects new records, not existing ones');
		} catch (error) {
			console.log(`   ⚠️  Failed to update users.role default: ${error.message}`);
			throw error;
		}

		console.log('\n✅ Migration completed successfully!');

	} catch (error) {
		console.error('❌ Error during migration:', error);
		process.exit(1);
	} finally {
		// Close database connection
		await close();
	}
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(error => {
		console.error('❌ Unhandled error:', error);
		process.exit(1);
	});
}

export default main;
