/**
 * Migration script to add missing indexes to production database
 * 
 * Adds the following indexes that are missing in PROD:
 * - person_usernames.person_usernames_person_id_username_key (UNIQUE constraint)
 * - people.idx_person_email (if missing)
 * - people.idx_person_name (if missing)
 * - person_usernames.idx_person_username (if missing)
 * - person_usernames.person_usernames_username_org_id_key (UNIQUE constraint, if missing)
 * 
 * Usage: node src/scripts/migrate-add-missing-indexes-prod.js
 */

// Load environment variables from .env file
import 'dotenv/config';

import {init, close, getPostgresPool} from '../storage/database.js';

async function main() {
	console.log('🚀 Starting migration to add missing indexes to PROD...\n');

	try {
		// Initialize database connection
		await init();
		console.log('✅ Database connection established\n');

		const dbInstance = getPostgresPool();
		if (!dbInstance) {
			throw new Error('PostgreSQL database instance not available');
		}

		console.log('📊 Adding missing indexes...\n');

		// Check and add person_usernames.person_usernames_person_id_username_key
		try {
			const checkConstraint = await dbInstance.query(`
				SELECT 1 FROM pg_constraint 
				WHERE conname = 'person_usernames_person_id_username_key'
			`);
			
			if (checkConstraint.rows.length === 0) {
				await dbInstance.query(`
					ALTER TABLE person_usernames 
					ADD CONSTRAINT person_usernames_person_id_username_key 
					UNIQUE (person_id, username);
				`);
				console.log('   ✓ Added constraint: person_usernames.person_usernames_person_id_username_key');
			} else {
				console.log('   - Constraint person_usernames_person_id_username_key already exists');
			}
		} catch (error) {
			console.log(`   ⚠️  Failed to add person_usernames_person_id_username_key: ${error.message}`);
		}

		// Check and add people.idx_person_email
		try {
			const checkIndex = await dbInstance.query(`
				SELECT 1 FROM pg_indexes 
				WHERE indexname = 'idx_person_email'
			`);
			
			if (checkIndex.rows.length === 0) {
				await dbInstance.query(`
					CREATE INDEX idx_person_email ON people(email) 
					WHERE email IS NOT NULL;
				`);
				console.log('   ✓ Added index: people.idx_person_email');
			} else {
				console.log('   - Index idx_person_email already exists');
			}
		} catch (error) {
			console.log(`   ⚠️  Failed to add idx_person_email: ${error.message}`);
		}

		// Check and add people.idx_person_name
		try {
			const checkIndex = await dbInstance.query(`
				SELECT 1 FROM pg_indexes 
				WHERE indexname = 'idx_person_name'
			`);
			
			if (checkIndex.rows.length === 0) {
				await dbInstance.query(`
					CREATE INDEX idx_person_name ON people(name);
				`);
				console.log('   ✓ Added index: people.idx_person_name');
			} else {
				console.log('   - Index idx_person_name already exists');
			}
		} catch (error) {
			console.log(`   ⚠️  Failed to add idx_person_name: ${error.message}`);
		}

		// Check and add person_usernames.idx_person_username
		try {
			const checkIndex = await dbInstance.query(`
				SELECT 1 FROM pg_indexes 
				WHERE indexname = 'idx_person_username'
			`);
			
			if (checkIndex.rows.length === 0) {
				await dbInstance.query(`
					CREATE INDEX idx_person_username ON person_usernames(username);
				`);
				console.log('   ✓ Added index: person_usernames.idx_person_username');
			} else {
				console.log('   - Index idx_person_username already exists');
			}
		} catch (error) {
			console.log(`   ⚠️  Failed to add idx_person_username: ${error.message}`);
		}

		// Check and add person_usernames.person_usernames_username_org_id_key
		try {
			const checkConstraint = await dbInstance.query(`
				SELECT 1 FROM pg_constraint 
				WHERE conname = 'person_usernames_username_org_id_key'
			`);
			
			if (checkConstraint.rows.length === 0) {
				// Check for duplicate data first
				const duplicates = await dbInstance.query(`
					SELECT username, org_id, COUNT(*) as count
					FROM person_usernames
					GROUP BY username, org_id
					HAVING COUNT(*) > 1
				`);
				
				if (duplicates.rows.length > 0) {
					console.log(`   ⚠️  Cannot add constraint: Found ${duplicates.rows.length} duplicate(s) in person_usernames(username, org_id)`);
					console.log('   ℹ️  Please clean up duplicates before adding this constraint');
				} else {
					await dbInstance.query(`
						ALTER TABLE person_usernames 
						ADD CONSTRAINT person_usernames_username_org_id_key 
						UNIQUE (username, org_id);
					`);
					console.log('   ✓ Added constraint: person_usernames.person_usernames_username_org_id_key');
				}
			} else {
				console.log('   - Constraint person_usernames_username_org_id_key already exists');
			}
		} catch (error) {
			console.log(`   ⚠️  Failed to add person_usernames_username_org_id_key: ${error.message}`);
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
