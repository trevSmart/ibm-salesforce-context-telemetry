#!/usr/bin/env node

/**
 * Script to regularize existing telemetry events by extracting denormalized fields
 * from JSON data and populating dedicated columns for better query performance.
 *
 * This script:
 * 1. Updates tool_name, user_name, org_id columns in telemetry_events table
 * 2. Updates company names in orgs table
 * 3. Processes events in batches to avoid memory issues
 */

const db = require('../storage/database');

async function regularizeTelemetryEvents() {
    console.log('🚀 Starting telemetry events regularization...');

    try {
        // Initialize database connection
        await db.init();
        console.log('✅ Database connection established');

        const dbType = process.env.DB_TYPE || 'sqlite';
        console.log(`📊 Database type: ${dbType}`);

        // Force population of denormalized columns for all events
        console.log('\n🔄 Regularizing denormalized columns...');
        await forcePopulateDenormalizedColumns();
        console.log('   ✅ Denormalized columns regularized');

        // Update company names in orgs table
        console.log('\n🏢 Updating company names in orgs table...');
        const companyResults = await updateCompanyNames();
        console.log(`   ✅ Updated ${companyResults.updated} company names`);

        console.log('\n🎉 Regularization completed successfully!');

    } catch (error) {
        console.error('❌ Error during regularization:', error);
        process.exit(1);
    } finally {
        await db.close();
    }
}

async function forcePopulateDenormalizedColumns() {
    const dbType = process.env.DB_TYPE || 'sqlite';

    const dbConn = db.getDbConnection();

    if (dbType === 'sqlite') {
        // For SQLite, update all events in batches
        const batchSize = 500;
        let offset = 0;
        let totalUpdated = 0;

        while (true) {
            const events = dbConn.prepare(`
                SELECT id, data
                FROM telemetry_events
                WHERE data IS NOT NULL AND data != ''
                LIMIT ? OFFSET ?
            `).all(batchSize, offset);

            if (events.length === 0) break;

            const updateStmt = dbConn.prepare(`
                UPDATE telemetry_events
                SET org_id = ?, user_name = ?, tool_name = ?
                WHERE id = ?
            `);

            let batchUpdated = 0;
            for (const event of events) {
                try {
                    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                    const orgId = db.extractOrgId({ data });
                    const userName = db.extractUserDisplayName(data);
                    const toolName = db.extractToolName({ data });

                    updateStmt.run(orgId, userName, toolName, event.id);
                    batchUpdated++;
                } catch (error) {
                    // Skip events with invalid JSON
                }
            }

            totalUpdated += batchUpdated;
            offset += batchSize;

            if (events.length < batchSize) break;
        }

        console.log(`   ✅ Updated ${totalUpdated} events in SQLite database`);
    } else {
        // For PostgreSQL, use a single UPDATE query
        const result = await dbConn.query(`
            UPDATE telemetry_events
            SET
                org_id = CASE
                    WHEN data->>'state'->>'org'->>'id' IS NOT NULL THEN data->>'state'->>'org'->>'id'
                    WHEN data->>'orgId' IS NOT NULL THEN data->>'orgId'
                    ELSE org_id
                END,
                user_name = CASE
                    WHEN data->>'userDisplayName' IS NOT NULL THEN data->>'userDisplayName'
                    WHEN data->>'userName' IS NOT NULL THEN data->>'userName'
                    ELSE user_name
                END,
                tool_name = CASE
                    WHEN data->>'toolName' IS NOT NULL THEN data->>'toolName'
                    WHEN data->>'tool' IS NOT NULL THEN data->>'tool'
                    ELSE tool_name
                END
            WHERE data IS NOT NULL
        `);

        console.log(`   ✅ Updated ${result.rowCount} events in PostgreSQL database`);
    }
}

async function updateCompanyNames() {
    const dbType = process.env.DB_TYPE || 'sqlite';
    const dbConn = db.getDbConnection();
    let updated = 0;

    if (dbType === 'sqlite') {
        // Get all unique server_ids
        const serverIds = dbConn.prepare(`
            SELECT DISTINCT server_id
            FROM telemetry_events
            WHERE server_id IS NOT NULL
        `).all().map(row => row.server_id);

        for (const serverId of serverIds) {
            // Get the latest event for this server that might have company details
            const event = dbConn.prepare(`
                SELECT data
                FROM telemetry_events
                WHERE server_id = ?
                  AND data IS NOT NULL
                  AND data != ''
                ORDER BY timestamp DESC
                LIMIT 1
            `).get(serverId);

            if (event) {
                try {
                    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                    const companyName = db.extractCompanyName({ data });

                    if (companyName) {
                        await db.upsertOrgCompanyName(serverId, companyName);
                        updated++;
                    }
                } catch (error) {
                    // Skip events with invalid JSON
                }
            }
        }
    } else {
        // For PostgreSQL, use a simpler approach
        const result = await dbConn.query(`
            SELECT DISTINCT server_id
            FROM telemetry_events
            WHERE server_id IS NOT NULL
        `);

        for (const row of result.rows) {
            const serverId = row.server_id;

            // Get latest event for this server
            const eventResult = await dbConn.query(`
                SELECT data
                FROM telemetry_events
                WHERE server_id = $1
                  AND data IS NOT NULL
                ORDER BY timestamp DESC
                LIMIT 1
            `, [serverId]);

            if (eventResult.rows.length > 0) {
                const data = eventResult.rows[0].data;
                const companyName = db.extractCompanyName({ data });

                if (companyName) {
                    await db.upsertOrgCompanyName(serverId, companyName);
                    updated++;
                }
            }
        }
    }

    return { updated };
}

// Run the script
if (require.main === module) {
    regularizeTelemetryEvents()
        .then(() => {
            console.log('\n✨ Regularization script completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Script failed:', error);
            process.exit(1);
        });
}

module.exports = { regularizeTelemetryEvents };