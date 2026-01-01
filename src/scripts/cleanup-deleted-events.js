
/**
 * Cleanup script to permanently delete old soft-deleted events
 * from the telemetry_events table.
 *
 * This script:
 * 1. Identifies events that have been soft-deleted for more than X days
 * 2. Permanently deletes them from the database
 * 3. Provides statistics on the cleanup operation
 *
 * Usage: node src/scripts/cleanup-deleted-events.js [days]
 * Default: 30 days
 */

const dbModule = require('../storage/database');

async function main() {
	const daysOld = Number.parseInt(process.argv[2], 10) || 30;

	if (daysOld < 1 || daysOld > 365) {
		console.error('❌ Days must be between 1 and 365');
		process.exit(1);
	}

	console.log(`🗑️  Starting cleanup of deleted events older than ${daysOld} days...\n`);

	try {
		// Initialize database connection
		await dbModule.init();
		console.log('✅ Database connection established');
		console.log('📊 Database type: PostgreSQL\n');

		// Perform cleanup
		console.log(`🧹 Deleting events soft-deleted more than ${daysOld} days ago...`);
		const deletedCount = await dbModule.cleanupOldDeletedEvents(daysOld);

		if (deletedCount > 0) {
			console.log(`✅ Successfully deleted ${deletedCount} old deleted events`);
		} else {
			console.log('ℹ️  No old deleted events found to clean up');
		}

		console.log('\n🎉 Cleanup completed successfully!');

	} catch (error) {
		console.error('❌ Error during cleanup:', error.message);
		process.exit(1);
	} finally {
		// Close database connection
		await dbModule.close();
	}
}

// Run the cleanup
if (require.main === module) {
	main().catch(error => {
		console.error('❌ Unhandled error:', error.message);
		process.exit(1);
	});
}

module.exports = {
	cleanupDeletedEvents: main
};