#!/usr/bin/env node

/**
 * Script to regularize existing telemetry events by extracting denormalized fields
 * from JSON data and populating dedicated columns for better query performance.
 *
 * This script:
 * 1. Updates tool_name, user_name, org_id columns in telemetry_events table
 * 2. Updates company names in orgs table
 * 3. Processes events in batches to avoid memory issues
 *
 * Usage: node src/scripts/regularize-telemetry-data.js
 */

const dbModule = require('../storage/database');

// Access internal database instance (hack for bulk operations)
let dbInstance = null;
const getDbInstance = () => {
	if (!dbInstance) {
		// Try to get PostgreSQL pool
		dbInstance = dbModule.getPostgresPool();
		if (!dbInstance) {
			// For SQLite, we need to access the internal variable
			// This is a bit hacky but necessary for bulk operations
			const dbPath = process.env.DB_PATH || require('path').join(__dirname, '..', 'data', 'telemetry.db');
			const Database = require('better-sqlite3');
			dbInstance = new Database(dbPath);
		}
	}
	return dbInstance;
};

/**
 * Extract company name from event data (same logic as in database.js)
 */
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

/**
 * Extract tool name from event data (same logic as in database.js)
 */
function extractToolName(eventData = {}) {
	if (!eventData || !eventData.data) {
		return null;
	}

	const data = eventData.data;

	// Check for toolName field (new format)
	if (data.toolName && typeof data.toolName === 'string') {
		const toolName = data.toolName.trim();
		if (toolName !== '') {
			return toolName;
		}
	}

	// Check for tool field (legacy format)
	if (data.tool && typeof data.tool === 'string') {
		const toolName = data.tool.trim();
		if (toolName !== '') {
			return toolName;
		}
	}

	return null;
}

/**
 * Extract user display name from event data (same logic as in database.js)
 */
function extractUserDisplayName(data = {}) {
	if (!data) {
		return null;
	}

	// Check for userName field
	if (data.userName && typeof data.userName === 'string') {
		const userName = data.userName.trim();
		if (userName !== '') {
			return userName;
		}
	}

	// Check for user_name field (legacy)
	if (data.user_name && typeof data.user_name === 'string') {
		const userName = data.user_name.trim();
		if (userName !== '') {
			return userName;
		}
	}

	// Check for nested user.name field
	if (data.user && data.user.name && typeof data.user.name === 'string') {
		const userName = data.user.name.trim();
		if (userName !== '') {
			return userName;
		}
	}

	return null;
}

/**
 * Extract org ID from event data (same logic as in database.js)
 */
function extractOrgId(eventData = {}) {
	if (!eventData || !eventData.data) {
		return null;
	}

	const data = eventData.data;

	// Check for orgId field
	if (data.orgId && typeof data.orgId === 'string') {
		const orgId = data.orgId.trim();
		if (orgId !== '') {
			return orgId;
		}
	}

	// Check for nested state.org.id field
	if (data.state && data.state.org && data.state.org.id && typeof data.state.org.id === 'string') {
		const orgId = data.state.org.id.trim();
		if (orgId !== '') {
			return orgId;
		}
	}

	return null;
}

/**
 * Force populate denormalized columns for all events
 */
async function forcePopulateDenormalizedColumns() {
	console.log('🔄 Force populating denormalized columns for all events...');

	const dbType = process.env.DB_TYPE || 'sqlite';
	const db = getDbInstance();

	if (dbType === 'sqlite') {
		// For SQLite, we'll update in batches to avoid locking
		const batchSize = 1000;
		let offset = 0;
		let hasMore = true;
		let totalProcessed = 0;

		while (hasMore) {
			const rows = db.prepare(`
				SELECT id, data, server_id, user_id
				FROM telemetry_events
				WHERE data IS NOT NULL AND data != ''
				LIMIT ? OFFSET ?
			`).all(batchSize, offset);

			if (rows.length === 0) {
				hasMore = false;
				break;
			}

			const updateStmt = db.prepare(`
				UPDATE telemetry_events
				SET org_id = ?, user_name = ?, tool_name = ?
				WHERE id = ?
			`);

			for (const row of rows) {
				try {
					const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
					const eventData = { data, server_id: row.server_id };

					const orgId = extractOrgId(eventData);
					// user_name comes from user_id column, not from JSON data
					const userName = row.user_id || extractUserDisplayName(data);
					const toolName = extractToolName(eventData);

					updateStmt.run(orgId, userName, toolName, row.id);
					totalProcessed++;
				} catch (error) {
					// Skip invalid JSON
					console.warn(`Error parsing data for event ${row.id}:`, error.message);
				}
			}

			offset += batchSize;
			if (rows.length < batchSize) {
				hasMore = false;
			}

			if (totalProcessed % 10000 === 0) {
				console.log(`   📊 Processed ${totalProcessed} events...`);
			}
		}

		console.log(`   ✅ Processed ${totalProcessed} events total`);
	} else if (dbType === 'postgresql') {
		// For PostgreSQL, use a single UPDATE with JSON extraction
		const result = await db.query(`
			UPDATE telemetry_events
			SET
				org_id = COALESCE(
					data->>'orgId',
					data->'state'->'org'->>'id'
				),
				user_name = COALESCE(
					data->>'userName',
					data->>'user_name',
					data->'user'->>'name'
				),
				tool_name = COALESCE(
					data->>'toolName',
					data->>'tool'
				)
			WHERE data IS NOT NULL
		`);

		console.log(`   ✅ Updated ${result.rowCount} events`);
	}
}

/**
 * Update company names in orgs table
 */
async function updateCompanyNames() {
	const dbType = process.env.DB_TYPE || 'sqlite';
	const db = getDbInstance();
	let updated = 0;

	console.log('🏢 Updating company names in orgs table...');

	if (dbType === 'sqlite') {
		// Get all unique server_ids from telemetry_events
		const serverIds = db.prepare(`
			SELECT DISTINCT server_id
			FROM telemetry_events
			WHERE server_id IS NOT NULL AND server_id != ''
		`).all();

		for (const { server_id } of serverIds) {
			// Find the most recent event with company name for this server_id
			const event = db.prepare(`
				SELECT data
				FROM telemetry_events
				WHERE server_id = ?
					AND data IS NOT NULL AND data != ''
				ORDER BY created_at DESC
				LIMIT 1
			`).get(server_id);

			if (event) {
				try {
					const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
					const companyName = extractCompanyName({ data });

					if (companyName) {
						// Update or insert in orgs table
						const upsertStmt = db.prepare(`
							INSERT OR REPLACE INTO orgs (server_id, company_name, updated_at)
							VALUES (?, ?, ?)
						`);
						upsertStmt.run(server_id, companyName, new Date().toISOString());
						updated++;
					}
				} catch (error) {
					console.warn(`Error parsing company name for server_id ${server_id}:`, error.message);
				}
			}
		}
	} else if (dbType === 'postgresql') {
		// For PostgreSQL, use a more efficient approach
		const result = await db.query(`
			INSERT INTO orgs (server_id, company_name, updated_at)
			SELECT
				server_id,
				COALESCE(
					data->'state'->'org'->'companyDetails'->>'Name',
					data->'companyDetails'->>'Name'
				) as company_name,
				NOW() as updated_at
			FROM telemetry_events
			WHERE server_id IS NOT NULL
				AND (
					data->'state'->'org'->'companyDetails'->>'Name' IS NOT NULL
					OR data->'companyDetails'->>'Name' IS NOT NULL
				)
			ON CONFLICT (server_id) DO UPDATE SET
				company_name = EXCLUDED.company_name,
				updated_at = EXCLUDED.updated_at
		`);

		updated = result.rowCount;
	}

	return { updated };
}

async function main() {
	console.log('🚀 Starting telemetry data regularization...\n');

	try {
		// Initialize database connection
		await dbModule.init();
		console.log('✅ Database connection established');

		const dbType = process.env.DB_TYPE || 'sqlite';
		console.log(`📊 Database type: ${dbType}\n`);

		// Force population of denormalized columns for all events
		console.log('🔄 Regularizing denormalized columns (org_id, user_name, tool_name)...');
		await forcePopulateDenormalizedColumns();
		console.log('✅ Denormalized columns regularized\n');

		// Update company names in orgs table
		console.log('🏢 Updating company names in orgs table...');
		const companyResults = await updateCompanyNames();
		console.log(`✅ Updated ${companyResults.updated} company names\n`);

		console.log('🎉 Telemetry data regularization completed successfully!');

	} catch (error) {
		console.error('❌ Error during regularization:', error);
		process.exit(1);
	} finally {
		// Close database connection
		await dbModule.close();

		// Close our custom db instance if it's SQLite
		const dbType = process.env.DB_TYPE || 'sqlite';
		if (dbType === 'sqlite' && dbInstance) {
			dbInstance.close();
		}
	}
}

// Run the script
if (require.main === module) {
	main().catch(error => {
		console.error('❌ Unhandled error:', error);
		process.exit(1);
	});
}

module.exports = {
	extractCompanyName,
	extractToolName,
	extractUserDisplayName,
	extractOrgId
};