/**
 * Script to update the admin user's role to administrator
 * Usage: node src/scripts/update-admin-role.js [username]
 * If username is not provided, defaults to 'admin'
 */

// Load environment variables from .env file
require('dotenv').config();

const db = require('../storage/database');
const auth = require('../auth/auth');

async function updateAdminRole() {+12
+14
+11
+24
+18
+16
+10;
const username = process.argv[2] || 'admin';

try {
  // Initialize database
  await db.init();
  console.log('Database initialized');

  // Check if user exists
  const existingUser = await db.getUserByUsername(username);
  if (!existingUser) {
    console.error(`❌ User "${username}" does not exist`);
    console.error(`   Create the user first with: npm run create-user ${username} <password> administrator`);
    process.exit(1);
  }

  // Update user role to administrator
  const updated = await db.updateUserRole(username, 'administrator');

  if (updated) {
    // Get updated user
    const user = await db.getUserByUsername(username);
    console.log('\n✅ User role updated successfully:');
    console.log(`   Username: ${user.username}`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Created at: ${user.created_at}\n`);
  } else {
    console.error('❌ Failed to update user role');
    process.exit(1);
  }

  // Close database connection
  await db.close();
} catch (error) {
  console.error('Error updating admin role:', error);
  process.exit(1);
}
}

updateAdminRole();

