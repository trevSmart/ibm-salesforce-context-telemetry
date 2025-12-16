/**
 * Script to update all events in the database to include companyName in their payload
 * The companyName will be the same for all events from the same org (orgId)
 *
 * Usage: node src/scripts/update-company-names.js
 */

const db = require('../storage/database');

/**
 * Extract company name from event data
 */
function extractCompanyName(eventData) {
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
 * Get orgId from event (server_id or data.orgId)
 */
function getOrgId(event) {
	// Try server_id first
	if (event.server_id) {
		return event.server_id;
	}

	// Try data.orgId
	if (event.data && event.data.orgId) {
		return event.data.orgId;
	}

	// Try data.state.org.id
	if (event.data && event.data.state && event.data.state.org && event.data.state.org.id) {
		return event.data.state.org.id;
	}

	return null;
}

/**
 * Generate a fake company name for an org based on its server_id
 */
function generateCompanyName(orgId) {
	if (!orgId) {
		return null;
	}

	// Extract the org type and number from server_id pattern: server-org-{type}-dev-{number}
	const match = orgId.match(/server-org-(\w+)-dev-(\d+)/);
	if (match) {
		const [, type, number] = match;
		const typeMap = {
			alpha: 'Alpha',
			beta: 'Beta',
			delta: 'Delta',
			gamma: 'Gamma'
		};
		const typeName = typeMap[type.toLowerCase()] || type.charAt(0).toUpperCase() + type.slice(1);

		// Generate company names based on type
		const companyNames = [
			`${typeName} Development Corp`,
			`${typeName} Solutions Inc`,
			`${typeName} Technologies Ltd`,
			`${typeName} Systems SA`,
			`${typeName} Enterprise Solutions`,
			`${typeName} Digital Services`,
			`${typeName} Cloud Solutions`,
			`${typeName} Software Group`
		];

		// Use the number as a seed to consistently assign the same company name to the same org
		const index = parseInt(number) % companyNames.length;
		return companyNames[index];
	}

	// Fallback: generate a generic name
	return `Company ${orgId.slice(-4)}`;
}

/**
 * Find company name for an org by searching other events with the same server_id
 */
async function findCompanyNameForOrg(orgId, excludeEventId = null) {
	if (!orgId) {
		return null;
	}

	try {
		// First, try to get from orgs table
		const companyName = await db.getOrgCompanyName(orgId);
		if (companyName) {
			return companyName;
		}

		// If not found, search in events with the same server_id
		// We'll search in batches to find events with companyDetails
		let offset = 0;
		const batchSize = 100;

		while (true) {
			const eventsResult = await db.getEvents({
				limit: batchSize,
				offset: offset,
				orderBy: 'id',
				order: 'DESC'
			});

			if (eventsResult.events.length === 0) {
				break;
			}

			for (const event of eventsResult.events) {
				// Skip the current event if specified
				if (excludeEventId && event.id === excludeEventId) {
					continue;
				}

				// Check if this event belongs to the same org
				const eventOrgId = getOrgId(event);
				if (eventOrgId === orgId) {
					const companyName = extractCompanyName({ data: event.data });
					if (companyName) {
						// Store it in orgs table for future use
						await db.upsertOrgCompanyName(orgId, companyName).catch(() => {});
						return companyName;
					}
				}
			}

			offset += batchSize;
			if (offset >= eventsResult.total) {
				break;
			}
		}

		// If not found in events, generate a fake company name
		return generateCompanyName(orgId);
	} catch (error) {
		console.error(`Error finding company name for org ${orgId}:`, error.message);
		// Fallback to generated name
		return generateCompanyName(orgId);
	}
}

/**
 * Update event with companyName in data.state.org.companyDetails.Name (as in session_start example)
 */
async function updateEvent(event, companyName) {
	if (!companyName) {
		return false;
	}

	// Ensure data.state exists
	if (!event.data.state) {
		event.data.state = {};
	}

	// Ensure data.state.org exists
	if (!event.data.state.org) {
		event.data.state.org = {};
	}

	// Ensure companyDetails exists
	if (!event.data.state.org.companyDetails) {
		event.data.state.org.companyDetails = {};
	}

	// Check if Name already exists
	if (event.data.state.org.companyDetails.Name) {
		// Already has companyName, no need to update
		return false;
	}

	// Add Name to companyDetails
	event.data.state.org.companyDetails.Name = companyName;

	try {
		return await db.updateEventData(event.id, event.data);
	} catch (error) {
		console.error(`Error updating event ${event.id}:`, error.message);
		return false;
	}
}

async function updateAllEvents() {
	try {
		console.log('Initializing database...');
		await db.init();
		console.log('Database initialized\n');

		let totalEvents = 0;
		let updatedEvents = 0;
		let skippedEvents = 0;
		let errorEvents = 0;

		// Get total count using getStats
		const stats = await db.getStats();
		totalEvents = stats.total;

		console.log(`Total events to process: ${totalEvents}\n`);

		// Process events in batches
		const batchSize = 100;
		let offset = 0;
		const orgCompanyNameCache = new Map(); // Cache to avoid repeated lookups

		while (offset < totalEvents) {
			// Get events using the public API
			const eventsResult = await db.getEvents({
				limit: batchSize,
				offset: offset,
				orderBy: 'id',
				order: 'ASC'
			});

			const events = eventsResult.events;

			if (events.length === 0) {
				break;
			}

			for (const event of events) {
				try {
					// Check if event already has companyName in data.state.org.companyDetails.Name
					if (event.data.state?.org?.companyDetails?.Name) {
						skippedEvents++;
						continue;
					}

					// Get orgId - use server_id as the primary identifier
					const orgId = event.server_id || getOrgId(event);
					if (!orgId) {
						skippedEvents++;
						continue;
					}

					// Try to get companyName from cache first
					let companyName = orgCompanyNameCache.get(orgId);

					// If not in cache, try to extract from current event
					if (!companyName) {
						companyName = extractCompanyName({ data: event.data });
						if (companyName) {
							// Store in cache and in orgs table
							orgCompanyNameCache.set(orgId, companyName);
							await db.upsertOrgCompanyName(orgId, companyName).catch(() => {});
						}
					}

					// If still not found, search in other events or generate one
					if (!companyName) {
						companyName = await findCompanyNameForOrg(orgId, event.id);
						if (companyName) {
							orgCompanyNameCache.set(orgId, companyName);
							// Store generated company name in orgs table
							await db.upsertOrgCompanyName(orgId, companyName).catch(() => {});
						}
					}

					// If found, update event
					if (companyName) {
						const updated = await updateEvent(event, companyName);
						if (updated) {
							updatedEvents++;
						} else {
							skippedEvents++;
						}
					} else {
						skippedEvents++;
					}
				} catch (error) {
					console.error(`Error processing event ${event.id}:`, error.message);
					errorEvents++;
				}
			}

			offset += batchSize;
			const progress = Math.min(100, Math.round((offset / totalEvents) * 100));
			process.stdout.write(`\rProgress: ${progress}% (${offset}/${totalEvents} events processed)`);
		}

		console.log('\n\n✅ Update completed!');
		console.log(`   Total events: ${totalEvents}`);
		console.log(`   Updated: ${updatedEvents}`);
		console.log(`   Skipped (already had companyName or no orgId): ${skippedEvents}`);
		console.log(`   Errors: ${errorEvents}\n`);

		// Close database connection
		await db.close();
	} catch (error) {
		console.error('\n❌ Error updating events:', error);
		process.exit(1);
	}
}

// Run the update
updateAllEvents();
