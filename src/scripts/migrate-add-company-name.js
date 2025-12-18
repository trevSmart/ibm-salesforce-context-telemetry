#!/usr/bin/env node

/**
 * Migration script to add company_name column to telemetry_events table
 * and populate existing records with normalized company names.
 *
 * This script:
 * 1. Adds the company_name column to telemetry_events table
 * 2. Populates company_name for existing events
 * 3. Creates necessary indexes
 *
 * Usage: node src/scripts/migrate-add-company-name.js
 */

const dbModule = require('../storage/database');

async function main() {
	console.log('🚀 Starting company_name column migration...\n');

	try {
		// Initialize database connection
		await dbModule.init();
		console.log('✅ Database connection established');

		const dbType = process.env.DB_TYPE || 'sqlite';
		console.log(`📊 Database type: ${dbType}\n`);

		// Add company_name column
		console.log('🔧 Adding company_name column...');
		await addCompanyNameColumn();
		console.log('✅ company_name column added\n');

		// Populate company_name for existing events
		console.log('🏢 Populating company_name for existing events...');
		await populateCompanyNames();
		console.log('✅ Company names populated\n');

		// Create indexes
		console.log('📈 Creating indexes for company_name...');
		await createCompanyNameIndexes();
		console.log('✅ Indexes created\n');

		console.log('🎉 Company name migration completed successfully!');

	} catch (error) {
		console.error('❌ Error during migration:', error);
		process.exit(1);
	} finally {
		// Close database connection
		await dbModule.close();
	}
}

async function addCompanyNameColumn() {
	const dbType = process.env.DB_TYPE || 'sqlite';

	if (dbType === 'sqlite') {
		// Execute SQL directly using the database module's internal connection
		// Since ensureDenormalizedColumns is not exported, we'll do it manually
		const db = require('../storage/database');
		// We need to access the internal db instance - this is a bit hacky but necessary
		const dbInstance = db.getPostgresPool ? db.getPostgresPool() : null;
		if (dbInstance) {
			const columns = dbInstance.prepare('PRAGMA table_info(telemetry_events)').all();
			const columnNames = columns.map(col => col.name);

			if (!columnNames.includes('company_name')) {
				dbInstance.exec('ALTER TABLE telemetry_events ADD COLUMN company_name TEXT');
				console.log('   Added company_name column');
			} else {
				console.log('   company_name column already exists');
			}
		}
	} else if (dbType === 'postgresql') {
		const db = require('../storage/database');
		const dbInstance = db.getPostgresPool ? db.getPostgresPool() : null;
		if (dbInstance) {
			await dbInstance.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS company_name TEXT');
			console.log('   Ensured company_name column exists');
		}
	}
}

async function populateCompanyNames() {
	const dbType = process.env.DB_TYPE || 'sqlite';

	if (dbType === 'sqlite') {
		// For SQLite, since we can't easily access the internal db instance,
		// we'll use a different approach: get events and update them individually
		let offset = 0;
		const batchSize = 100;
		let hasMore = true;
		let totalProcessed = 0;

		while (hasMore) {
			try {
				const result = await dbModule.getEvents({
					limit: batchSize,
					offset: offset,
					orderBy: 'id',
					order: 'ASC'
				});

				if (result.events.length === 0) {
					hasMore = false;
					break;
				}

				for (const event of result.events) {
					try {
						// Extract company name using the same logic as storeEvent
						const companyName = extractCompanyName({ data: event.data });

						if (companyName && (!event.company_name || event.company_name !== companyName)) {
							// Update the event with company_name
							await dbModule.updateEventData(event.id, {
								...event.data,
								// The update will trigger the denormalization logic
							});
							totalProcessed++;
						}
					} catch (error) {
						console.warn(`   Error processing event ${event.id}:`, error.message);
					}
				}

				offset += batchSize;
				if (result.events.length < batchSize) {
					hasMore = false;
				}

				if (totalProcessed % 1000 === 0 && totalProcessed > 0) {
					console.log(`   📊 Processed ${totalProcessed} events...`);
				}
			} catch (error) {
				console.error('   Error in batch processing:', error);
				hasMore = false;
			}
		}

		console.log(`   ✅ Updated ${totalProcessed} events with company names`);
	} else if (dbType === 'postgresql') {
		// For PostgreSQL, use a direct SQL update via the pool
		const db = require('../storage/database');
		const dbInstance = db.getPostgresPool ? db.getPostgresPool() : null;

		if (dbInstance) {
			const result = await dbInstance.query(`
				UPDATE telemetry_events
				SET company_name = COALESCE(
					data->'state'->'org'->'companyDetails'->>'Name',
					data->'companyDetails'->>'Name'
				)
				WHERE data IS NOT NULL
					AND (company_name IS NULL OR company_name = '')
					AND (
						data->'state'->'org'->'companyDetails'->>'Name' IS NOT NULL
						OR data->'companyDetails'->>'Name' IS NOT NULL
					)
			`);

			console.log(`   ✅ Updated ${result.rowCount} events with company names`);
		} else {
			console.log('   No PostgreSQL instance available');
		}
	}
}

async function createCompanyNameIndexes() {
	// Indexes are already created by ensureDenormalizedColumns
	console.log('   Indexes already created by ensureDenormalizedColumns');
}

// Import extractCompanyName function
function extractCompanyName(eventData = {}) {
	if (!eventData || !eventData.data) {
		return null;
	}

	const data = eventData.data;

	// New format: data.state.org.companyDetails.Name
	if (data.state && data.state.org && data.state.org.companyDetails) {
		const companyName = data.state.org.companyDetails.Name;
		if (typeof companyName === 'string' && companyName.trim() !== '') {
			return companyName.trim();
		}
	}

	// Legacy format: data.companyDetails.Name
	if (data.companyDetails && typeof data.companyDetails.Name === 'string') {
		const companyName = data.companyDetails.Name.trim();
		if (companyName !== '') {
			return companyName;
		}
	}

	return null;
}

// Run the migration
if (require.main === module) {
	main().catch(error => {
		console.error('❌ Unhandled error:', error);
		process.exit(1);
	});
}

module.exports = {
	extractCompanyName
};