#!/usr/bin/env node

/**
 * Migration script to move org-team mappings from settings table
 * to the new teams and orgs relational structure
 *
 * This script:
 * 1. Reads existing mappings from settings.org_team_mappings
 * 2. Creates teams based on unique team names
 * 3. Creates/updates orgs with team_id, alias, and color
 * 4. Optionally removes the old mappings from settings
 */

require('dotenv').config();
const path = require('path');
const db = require('../storage/database');

async function migrateMappings() {
  console.log('Starting migration of org-team mappings...\n');

  try {
    // Initialize database
    await db.init();

    // Get existing mappings from settings
    const mappingsJson = await db.getSetting('org_team_mappings');
    let mappings = [];

    if (mappingsJson) {
      try {
        mappings = JSON.parse(mappingsJson);
        if (!Array.isArray(mappings)) {
          console.log('⚠️  Mappings data is not an array, skipping migration');
          return;
        }
      } catch (error) {
        console.error('❌ Error parsing mappings JSON:', error);
        return;
      }
    }

    if (mappings.length === 0) {
      console.log('ℹ️  No mappings found in settings, nothing to migrate');
      return;
    }

    console.log(`Found ${mappings.length} mapping(s) to migrate\n`);

    // Group mappings by team name to create teams
    const teamsMap = new Map(); // teamName (normalized) -> { name, color, orgs: [] }
    const orgsToMigrate = [];

    mappings.forEach((mapping, index) => {
      const orgId = String(mapping.orgIdentifier || '').trim();
      const teamName = String(mapping.teamName || '').trim();
      const color = String(mapping.color || '').trim() || null;
      const alias = orgId; // Use orgId as default alias if not provided
      const companyName = String(mapping.clientName || '').trim() || null;
      const isActive = mapping.active !== false;

      if (!orgId || !teamName) {
        console.log(`⚠️  Skipping mapping ${index + 1}: missing orgIdentifier or teamName`);
        return;
      }

      // Normalize team name for grouping
      const teamKey = teamName.toLowerCase().trim();

      if (!teamsMap.has(teamKey)) {
        teamsMap.set(teamKey, {
          name: teamName,
          color: color,
          orgs: []
        });
      }

      const team = teamsMap.get(teamKey);
      // Use the first non-empty color found for the team
      if (!team.color && color) {
        team.color = color;
      }

      // Only migrate active mappings
      if (isActive) {
        orgsToMigrate.push({
          orgId,
          alias,
          color,
          companyName,
          teamKey
        });
        team.orgs.push(orgId);
      }
    });

    console.log(`Will create ${teamsMap.size} team(s) and migrate ${orgsToMigrate.length} org(s)\n`);

    // Create teams
    const teamIdMap = new Map(); // teamKey -> teamId
    let teamsCreated = 0;
    let teamsSkipped = 0;

    for (const [teamKey, teamData] of teamsMap.entries()) {
      try {
        // Check if team already exists
        const existingTeams = await db.getAllTeams();
        const existing = existingTeams.find(t => t.name.toLowerCase() === teamKey);

        if (existing) {
          console.log(`✓ Team "${teamData.name}" already exists (ID: ${existing.id})`);
          teamIdMap.set(teamKey, existing.id);
          teamsSkipped++;
        } else {
          const team = await db.createTeam(teamData.name, teamData.color, null);
          console.log(`✓ Created team "${teamData.name}" (ID: ${team.id})`);
          teamIdMap.set(teamKey, team.id);
          teamsCreated++;
        }
      } catch (error) {
        console.error(`❌ Error creating team "${teamData.name}":`, error.message);
      }
    }

    console.log(`\nTeams: ${teamsCreated} created, ${teamsSkipped} already existed\n`);

    // Migrate orgs
    let orgsCreated = 0;
    let orgsUpdated = 0;
    let orgsSkipped = 0;

    for (const orgData of orgsToMigrate) {
      try {
        const teamId = teamIdMap.get(orgData.teamKey);
        if (!teamId) {
          console.log(`⚠️  Skipping org "${orgData.orgId}": team not found`);
          orgsSkipped++;
          continue;
        }

        // Check if org exists
        const existingOrgs = await db.getAllOrgs();
        const existing = existingOrgs.find(o => o.server_id === orgData.orgId);

        if (existing) {
          // Update existing org
          await db.upsertOrg(orgData.orgId, {
            alias: orgData.alias,
            color: orgData.color,
            team_id: teamId,
            company_name: orgData.companyName
          });
          console.log(`✓ Updated org "${orgData.orgId}" -> team "${teamIdMap.get(orgData.teamKey)}"`);
          orgsUpdated++;
        } else {
          // Create new org
          await db.upsertOrg(orgData.orgId, {
            alias: orgData.alias,
            color: orgData.color,
            team_id: teamId,
            company_name: orgData.companyName
          });
          console.log(`✓ Created org "${orgData.orgId}" -> team "${teamIdMap.get(orgData.teamKey)}"`);
          orgsCreated++;
        }
      } catch (error) {
        console.error(`❌ Error migrating org "${orgData.orgId}":`, error.message);
        orgsSkipped++;
      }
    }

    console.log(`\nOrgs: ${orgsCreated} created, ${orgsUpdated} updated, ${orgsSkipped} skipped\n`);

    // Ask if we should remove old mappings (commented out for safety)
    console.log('✅ Migration completed!');
    console.log('\n⚠️  Old mappings are still in settings.org_team_mappings');
    console.log('   You can manually remove them after verifying the migration.\n');

    // Summary
    console.log('Summary:');
    console.log(`  - Teams created: ${teamsCreated}`);
    console.log(`  - Teams already existed: ${teamsSkipped}`);
    console.log(`  - Orgs created: ${orgsCreated}`);
    console.log(`  - Orgs updated: ${orgsUpdated}`);
    console.log(`  - Orgs skipped: ${orgsSkipped}\n`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run migration
if (require.main === module) {
  migrateMappings().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { migrateMappings };
