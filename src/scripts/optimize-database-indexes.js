#!/usr/bin/env node

/**
 * Database Optimization Migration Script
 *
 * This script optimizes the PostgreSQL database by:
 * 1. Removing duplicate indexes identified by PGHero
 * 2. Adding indexes to improve slow query performance
 *
 * Based on PGHero analysis of production database on Render.
 */

const db = require('../storage/database');

async function optimizeDatabaseIndexes() {
    console.log('Starting database index optimization...');

    try {

        // Initialize database
        await db.init();
        console.log('Database connection established.');

        // Check database type
        const dbType = process.env.DB_TYPE || 'sqlite';
        console.log(`Database type: ${dbType}`);

        if (dbType !== 'postgresql') {
            console.log('\n⚠️  This optimization script is designed for PostgreSQL databases.');
            console.log('The production database on Render uses PostgreSQL, but the local environment uses SQLite.');
            console.log('This script will exit without making changes to avoid affecting the local SQLite database.');
            console.log('\nTo apply these optimizations to production:');
            console.log('1. Deploy this script to your Render service');
            console.log('2. Set DB_TYPE=postgresql in your environment variables');
            console.log('3. Run: node src/scripts/optimize-database-indexes.js');
            return;
        }

        console.log('\n=== REMOVING DUPLICATE INDEXES ===');

        // Remove duplicate indexes identified by PGHero
        const duplicateIndexes = [
            'idx_username_person',           // covered by person_usernames_username_org_id_key
            'idx_remember_token_hash',       // covered by remember_tokens_token_hash_key
            'idx_team_event_users_team_id',  // covered by team_event_users_team_id_user_name_key
            'idx_teams_name',                // covered by teams_name_key
            'idx_created_at',                // covered by idx_created_at_org_id
            'idx_event',                     // covered by idx_event_created_at
            'idx_org_id',                    // covered by idx_org_id_created_at
            'idx_timestamp',                 // covered by idx_timestamp_event
            'idx_user_id',                   // covered by idx_user_created_at
            'idx_username'                   // covered by users_username_key
        ];

        for (const indexName of duplicateIndexes) {
            try {
                console.log(`Dropping duplicate index: ${indexName}`);
                await db.executeSql(`DROP INDEX IF EXISTS ${indexName}`);
                console.log(`✓ Dropped ${indexName}`);
            } catch (error) {
                console.log(`⚠ Could not drop ${indexName}: ${error.message}`);
            }
        }

        console.log('\n=== ADDING PERFORMANCE INDEXES ===');

        // Add indexes to improve slow query performance

        // Index for session aggregates query optimization
        // This helps with the GROUP BY COALESCE(parent_session_id, session_id)
        // and the MIN/MAX timestamp operations
        try {
            console.log('Creating index for session aggregates query...');
            await db.executeSql('CREATE INDEX IF NOT EXISTS idx_session_logical ON telemetry_events (COALESCE(parent_session_id, session_id), timestamp)');
            console.log('✓ Created idx_session_logical');
        } catch (error) {
            console.log(`⚠ Could not create idx_session_logical: ${error.message}`);
            // Fallback: create separate indexes for parent_session_id and session_id with timestamp
            try {
                await db.executeSql('CREATE INDEX IF NOT EXISTS idx_parent_session_timestamp ON telemetry_events (parent_session_id, timestamp) WHERE parent_session_id IS NOT NULL');
                await db.executeSql('CREATE INDEX IF NOT EXISTS idx_session_timestamp ON telemetry_events (session_id, timestamp) WHERE session_id IS NOT NULL');
                console.log('✓ Created fallback indexes: idx_parent_session_timestamp, idx_session_timestamp');
            } catch (fallbackError) {
                console.log(`⚠ Fallback indexes also failed: ${fallbackError.message}`);
            }
        }

        // Index for the correlated subquery in session aggregates that finds user_id
        try {
            console.log('Creating index for session user lookup...');
            await db.executeSql('CREATE INDEX IF NOT EXISTS idx_session_user_timestamp ON telemetry_events (COALESCE(parent_session_id, session_id), timestamp, user_id)');
            console.log('✓ Created idx_session_user_timestamp');
        } catch (error) {
            console.log(`⚠ Could not create idx_session_user_timestamp: ${error.message}`);
        }

        // Index for the session_start_data lookup
        try {
            console.log('Creating index for session start data lookup...');
            await db.executeSql('CREATE INDEX IF NOT EXISTS idx_session_event_timestamp ON telemetry_events (COALESCE(parent_session_id, session_id), event, timestamp)');
            console.log('✓ Created idx_session_event_timestamp');
        } catch (error) {
            console.log(`⚠ Could not create idx_session_event_timestamp: ${error.message}`);
        }

        // Ensure we have an index for the pagination query ORDER BY created_at
        // (This should already exist as idx_created_at_org_id, but let's make sure)
        try {
            console.log('Ensuring pagination query optimization...');
            await db.executeSql('CREATE INDEX IF NOT EXISTS idx_pagination_created_at ON telemetry_events (created_at)');
            console.log('✓ Ensured idx_pagination_created_at exists');
        } catch (error) {
            console.log(`⚠ Could not create idx_pagination_created_at: ${error.message}`);
        }

        console.log('\n=== OPTIMIZATION COMPLETE ===');
        console.log('Database index optimization finished successfully.');
        console.log('\nNext steps:');
        console.log('1. Monitor query performance in PGHero after deployment');
        console.log('2. Consider running ANALYZE on tables if query plans don\'t improve');
        console.log('3. Review slow query logs to ensure improvements');

    } catch (error) {
        console.error('Error during database optimization:', error);
        process.exit(1);
    } finally {
        // Close database connection
        try {
            await db.close();
        } catch (closeError) {
            console.error('Error closing database:', closeError);
        }
    }
}

// Run the optimization if this script is executed directly
if (require.main === module) {
    optimizeDatabaseIndexes()
        .then(() => {
            console.log('\nOptimization script completed.');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Optimization script failed:', error);
            process.exit(1);
        });
}

module.exports = { optimizeDatabaseIndexes };