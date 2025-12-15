/**
 * Migration script to add performance indexes for dashboard queries
 * Run this script to add the new indexes to existing databases
 */

const path = require('path');
const fs = require('fs');

async function addPerformanceIndexes() {
  console.log('Adding performance indexes to database...');

  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'telemetry.db');

  if (!fs.existsSync(dbPath)) {
    console.log(`Database file not found at: ${dbPath}`);
    console.log('This script is only needed for existing SQLite databases.');
    return;
  }

  try {
    const Database = require('better-sqlite3');
    const sqliteDb = new Database(dbPath);

    console.log('Adding performance indexes to SQLite database...');

    // Add the new performance indexes
    sqliteDb.exec(`
      CREATE INDEX IF NOT EXISTS idx_timestamp_event ON telemetry_events(timestamp, event);
      CREATE INDEX IF NOT EXISTS idx_created_at_org_id ON telemetry_events(created_at, org_id);
      CREATE INDEX IF NOT EXISTS idx_org_id ON telemetry_events(org_id);
    `);

    sqliteDb.close();

    console.log('✅ Performance indexes added successfully');
    console.log('Indexes added:');
    console.log('- idx_timestamp_event (timestamp, event)');
    console.log('- idx_created_at_org_id (created_at, org_id)');
    console.log('- idx_org_id (org_id)');
  } catch (error) {
    console.error('Error adding performance indexes:', error);
    process.exit(1);
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  addPerformanceIndexes().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}

module.exports = { addPerformanceIndexes };