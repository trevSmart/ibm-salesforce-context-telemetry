/**
 * Migration script to remove unused columns from production database
 * 
 * Removes the following columns that are not used in the code:
 * - people.notes
 * - people.updated_at
 * - teams.logo_filename
 * 
 * Usage: node src/scripts/migrate-remove-unused-columns.js
 */

// Load environment variables from .env file
import 'dotenv/config';

import {init, close, getPostgresPool} from '../storage/database.js';

async function main() {
	console.log('🚀 Starting migration to remove unused columns...\n');

	try {
		// Initialize database connection
		await init();
		console.log('✅ Database connection established\n');

		const dbInstance = getPostgresPool();
		if (!dbInstance) {
			throw new Error('PostgreSQL database instance not available');
		}

		console.log('🗑️  Removing unused columns...\n');

		// Remove people.notes
		try {
			await dbInstance.query('ALTER TABLE people DROP COLUMN IF EXISTS notes;');
			console.log('   ✓ Removed column: people.notes');
		} catch (error) {
			console.log(`   ⚠️  Failed to remove people.notes: ${error.message}`);
		}

		// Remove people.updated_at
		try {
			await dbInstance.query('ALTER TABLE people DROP COLUMN IF EXISTS updated_at;');
			console.log('   ✓ Removed column: people.updated_at');
		} catch (error) {
			console.log(`   ⚠️  Failed to remove people.updated_at: ${error.message}`);
		}

		// Remove teams.logo_filename
		try {
			await dbInstance.query('ALTER TABLE teams DROP COLUMN IF EXISTS logo_filename;');
			console.log('   ✓ Removed column: teams.logo_filename');
		} catch (error) {
			console.log(`   ⚠️  Failed to remove teams.logo_filename: ${error.message}`);
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
