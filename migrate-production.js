#!/usr/bin/env node

/**
 * Production migration script to add error_message column
 * Execute this directly on the production server or via SSH
 *
 * Usage: node migrate-production.js
 */

const dbModule = require('./src/storage/database');

async function runProductionMigration() {
    console.log('🚀 Executing production migration: Adding error_message column');
    console.log('==============================================================');

    try {
        // Initialize database connection (will use production PostgreSQL if configured)
        await dbModule.init();
        console.log('✅ Database connection established');

        const dbType = process.env.DB_TYPE || 'sqlite';
        console.log(`📊 Database type: ${dbType}`);

        // Check if error_message column already exists
        console.log('\n🔍 Checking if error_message column exists...');

        let columnExists = false;
        if (dbType === 'sqlite') {
            const db = dbModule.getSqliteDb();
            const columns = db.prepare('PRAGMA table_info(telemetry_events)').all();
            columnExists = columns.some(col => col.name === 'error_message');
        } else if (dbType === 'postgresql') {
            const db = dbModule.getPostgresPool();
            const result = await db.query(`
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'telemetry_events' AND column_name = 'error_message'
            `);
            columnExists = result.rows.length > 0;
        }

        if (columnExists) {
            console.log('✅ error_message column already exists!');
            console.log('🎉 Migration completed successfully!');
            return;
        }

        console.log('❌ error_message column not found, creating it...');

        // Add error_message column
        if (dbType === 'sqlite') {
            const db = dbModule.getSqliteDb();
            db.exec('ALTER TABLE telemetry_events ADD COLUMN error_message TEXT');
            console.log('✅ Added error_message column to SQLite database');

            // Create index
            db.exec('CREATE INDEX IF NOT EXISTS idx_error_message ON telemetry_events(error_message)');
            console.log('✅ Created index on error_message column');
        } else if (dbType === 'postgresql') {
            const db = dbModule.getPostgresPool();
            await db.query('ALTER TABLE IF EXISTS telemetry_events ADD COLUMN IF NOT EXISTS error_message TEXT');
            console.log('✅ Added error_message column to PostgreSQL database');

            // Create index
            await db.query('CREATE INDEX IF NOT EXISTS idx_error_message ON telemetry_events(error_message)');
            console.log('✅ Created index on error_message column');
        }

        console.log('\n🎉 Production migration completed successfully!');
        console.log('📝 The error_message column has been added to telemetry_events table');
        console.log('🔄 Future tool_error events will have their error messages normalized');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await dbModule.close();
    }
}

if (require.main === module) {
    runProductionMigration().catch(error => {
        console.error('❌ Unhandled error:', error);
        process.exit(1);
    });
}