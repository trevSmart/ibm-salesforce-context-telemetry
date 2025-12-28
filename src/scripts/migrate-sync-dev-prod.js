/**
 * Complete migration script to sync PROD with DEV
 * 
 * This script performs all the migrations needed to sync PROD with DEV:
 * 1. Remove duplicate indexes
 * 2. Remove unused columns (people.notes, people.updated_at, teams.logo_filename)
 * 3. Update users.role default value to 'basic'
 * 4. Add missing indexes
 * 
 * Usage: 
 *   DATABASE_URL=<prod_url> node src/scripts/migrate-sync-dev-prod.js [--drop-duplicates]
 * 
 * Options:
 *   --drop-duplicates: Also drop duplicate indexes (default: only report)
 * 
 * IMPORTANT: Make sure to backup PROD before running this script!
 */

// Load environment variables from .env file (but DATABASE_URL can be overridden)
import 'dotenv/config';

import {init, close, getPostgresPool} from '../storage/database.js';
import {findExactDuplicates, findCoveredIndexes} from './find-duplicate-indexes.js';

async function main() {
	const args = process.argv.slice(2);
	const shouldDropDuplicates = args.includes('--drop-duplicates');

	console.log('🚀 Starting complete migration to sync PROD with DEV...\n');
	console.log('⚠️  WARNING: This script will modify the production database!');
	console.log('⚠️  Make sure you have a backup before proceeding!\n');

	// Check if DATABASE_URL is set
	if (!process.env.DATABASE_URL && !process.env.DATABASE_INTERNAL_URL) {
		console.error('❌ Error: DATABASE_URL or DATABASE_INTERNAL_URL must be set');
		console.error('   Usage: DATABASE_URL=<prod_url> node src/scripts/migrate-sync-dev-prod.js');
		process.exit(1);
	}

	const dbUrl = process.env.DATABASE_INTERNAL_URL || process.env.DATABASE_URL;
	console.log(`📊 Target database: ${dbUrl.replace(/:[^:@]+@/, ':****@')}\n`);

	try {
		// Initialize database connection
		await init();
		console.log('✅ Database connection established\n');

		const dbInstance = getPostgresPool();
		if (!dbInstance) {
			throw new Error('PostgreSQL database instance not available');
		}

		// Step 1: Find and optionally drop duplicate indexes
		console.log('📋 Step 1: Checking for duplicate indexes...\n');
		const exactDuplicates = await findExactDuplicates(dbInstance);
		const coveredIndexes = await findCoveredIndexes(dbInstance);
		
		const indexesToDrop = new Set();
		exactDuplicates.forEach(dup => {
			[dup.idx2, dup.idx3, dup.idx4, dup.idx5]
				.filter(Boolean)
				.forEach(idx => indexesToDrop.add(idx));
		});
		coveredIndexes.forEach(covered => {
			indexesToDrop.add(covered.covered_index);
		});

		if (indexesToDrop.size > 0) {
			console.log(`   Found ${indexesToDrop.size} duplicate index(es) to drop\n`);
			if (shouldDropDuplicates) {
				console.log('🗑️  Dropping duplicate indexes...\n');
				for (const indexName of indexesToDrop) {
					try {
						const parts = indexName.split('.');
						const indexNameOnly = parts.length > 1 ? parts[parts.length - 1] : indexName;
						await dbInstance.query(`DROP INDEX IF EXISTS ${indexNameOnly}`);
						console.log(`   ✓ Dropped: ${indexName}`);
					} catch (error) {
						console.log(`   ✗ Failed to drop ${indexName}: ${error.message}`);
					}
				}
				console.log('');
			} else {
				console.log('   💡 Run with --drop-duplicates to actually drop these indexes\n');
			}
		} else {
			console.log('   ✅ No duplicate indexes found\n');
		}

		// Step 2: Remove unused columns
		console.log('📋 Step 2: Removing unused columns...\n');
		try {
			await dbInstance.query('ALTER TABLE people DROP COLUMN IF EXISTS notes;');
			console.log('   ✓ Removed column: people.notes');
		} catch (error) {
			console.log(`   ⚠️  Failed to remove people.notes: ${error.message}`);
		}

		try {
			await dbInstance.query('ALTER TABLE people DROP COLUMN IF EXISTS updated_at;');
			console.log('   ✓ Removed column: people.updated_at');
		} catch (error) {
			console.log(`   ⚠️  Failed to remove people.updated_at: ${error.message}`);
		}

		try {
			await dbInstance.query('ALTER TABLE teams DROP COLUMN IF EXISTS logo_filename;');
			console.log('   ✓ Removed column: teams.logo_filename');
		} catch (error) {
			console.log(`   ⚠️  Failed to remove teams.logo_filename: ${error.message}`);
		}
		console.log('');

		// Step 3: Update users.role default
		console.log('📋 Step 3: Updating users.role default value...\n');
		try {
			await dbInstance.query("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'basic';");
			console.log("   ✓ Updated users.role default value to 'basic'");
			console.log('   ℹ️  Note: This only affects new records, not existing ones\n');
		} catch (error) {
			console.log(`   ⚠️  Failed to update users.role default: ${error.message}\n`);
		}

		// Step 4: Add missing indexes
		console.log('📋 Step 4: Adding missing indexes...\n');
		
		// person_usernames.person_usernames_person_id_username_key
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

		// people.idx_person_email
		try {
			const checkIndex = await dbInstance.query(`
				SELECT 1 FROM pg_indexes WHERE indexname = 'idx_person_email'
			`);
			if (checkIndex.rows.length === 0) {
				await dbInstance.query(`
					CREATE INDEX idx_person_email ON people(email) WHERE email IS NOT NULL;
				`);
				console.log('   ✓ Added index: people.idx_person_email');
			} else {
				console.log('   - Index idx_person_email already exists');
			}
		} catch (error) {
			console.log(`   ⚠️  Failed to add idx_person_email: ${error.message}`);
		}

		// people.idx_person_name
		try {
			const checkIndex = await dbInstance.query(`
				SELECT 1 FROM pg_indexes WHERE indexname = 'idx_person_name'
			`);
			if (checkIndex.rows.length === 0) {
				await dbInstance.query(`CREATE INDEX idx_person_name ON people(name);`);
				console.log('   ✓ Added index: people.idx_person_name');
			} else {
				console.log('   - Index idx_person_name already exists');
			}
		} catch (error) {
			console.log(`   ⚠️  Failed to add idx_person_name: ${error.message}`);
		}

		// person_usernames.idx_person_username
		try {
			const checkIndex = await dbInstance.query(`
				SELECT 1 FROM pg_indexes WHERE indexname = 'idx_person_username'
			`);
			if (checkIndex.rows.length === 0) {
				await dbInstance.query(`CREATE INDEX idx_person_username ON person_usernames(username);`);
				console.log('   ✓ Added index: person_usernames.idx_person_username');
			} else {
				console.log('   - Index idx_person_username already exists');
			}
		} catch (error) {
			console.log(`   ⚠️  Failed to add idx_person_username: ${error.message}`);
		}

		// person_usernames.person_usernames_username_org_id_key
		try {
			const checkConstraint = await dbInstance.query(`
				SELECT 1 FROM pg_constraint 
				WHERE conname = 'person_usernames_username_org_id_key'
			`);
			if (checkConstraint.rows.length === 0) {
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
		console.log('\n📊 Next steps:');
		console.log('   1. Verify that all changes were applied correctly');
		console.log('   2. Run schema comparison script to confirm DEV and PROD are in sync');
		console.log('   3. Test the application to ensure everything works correctly');

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
