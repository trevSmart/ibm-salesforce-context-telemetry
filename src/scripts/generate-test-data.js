
/**
 * Script to generate realistic test data for telemetry server
 *
 * Simulates 6 weeks of activity with:
 * - 20 users working on 4 different projects
 * - Each project has its own Salesforce org
 * - Sessions start when IDE opens
 * - Tool invocations (1-10 per prompt, often in quick succession)
 * - Some sessions without tool invocations
 * - Some sessions end abruptly without session_end event
 * - Activity mainly during office hours (9-18h, Mon-Fri)
 * - Very low activity on weekends (5% vs 60% on weekdays)
 *
 * By default, this script sends events via HTTP to the /telemetry endpoint (realistic mode).
 * Make sure the telemetry server is running before executing this script, unless using --skip-http flag.
 * The server should be accessible at http://localhost:3100 (or the PORT specified in .env).
 *
 * Usage: node src/scripts/generate-test-data.js [--disable-env-check] [--skip-http] [YYYY-MM-DD] [true|false]
 */

import 'dotenv/config';
import * as db from '../storage/database.js';
import {v4 as uuidv4} from 'uuid';

// Configuration
const NUM_USERS = 20;
const NUM_PROJECTS = 4;
const WEEKS = 6; // Increased to cover more weeks
const OFFICE_HOURS_START = 9; // 9 AM
const OFFICE_HOURS_END = 18; // 6 PM
const TARGET_EVENTS = 500; // Maximum number of events to generate

// Tool names that are commonly used
const TOOLS = [
	'execute_queries_and_dml',
	'describe_object',
	'get_record',
	'deploy_metadata',
	'run_anonymous_apex',
	'run_apex_test',
	'get_apex_class_code_coverage',
	'generate_metadata',
	'get_recently_viewed_records',
	'get_setup_audit_trail',
	'apex_debug_logs',
	'invoke_apex_rest_resource'
];

const OPERATIONS = ['query', 'create', 'update', 'delete', 'get', 'describe'];

// Projects configuration
const PROJECTS = [
	{
		name: 'Project Alpha',
		orgId: 'org-alpha-dev',
		companyName: 'Alpha Technologies S.A.',
		users: [0, 1, 2, 3, 4]
	},
	{
		name: 'Project Beta',
		orgId: 'org-beta-dev',
		companyName: 'Beta Solutions SL',
		users: [5, 6, 7, 8, 9]
	},
	{
		name: 'Project Gamma',
		orgId: 'org-gamma-dev',
		companyName: 'Gamma Innovations Corp',
		users: [10, 11, 12, 13, 14]
	},
	{
		name: 'Project Delta',
		orgId: 'org-delta-dev',
		companyName: 'Delta Analytics Group',
		users: [15, 16, 17, 18, 19]
	}
];

// User names (real Spanish/Catalan names)
const USER_IDS = [
	'María García',
'Josep Martínez',
'Anna López',
'Carlos Rodríguez',
'Laura Sánchez',
	'Pere Fernández',
'Elena González',
'Jordi Pérez',
'Carmen Torres',
'David Ruiz',
	'Montserrat Díaz',
'Antonio Moreno',
'Núria Jiménez',
'Miguel Álvarez',
'Sílvia Romero',
	'Javier Navarro',
'Marta Molina',
'Ramon Gutiérrez',
'Isabel Delgado',
'Francesc Ramos'
];

// Server versions
const VERSIONS = ['1.0.0', '1.0.1', '1.1.0', '1.1.1'];

/**
 * Generate a random number between min and max (inclusive)
 */
function randomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a random float between min and max
 */
function randomFloat(min, max) {
	return Math.random() * (max - min) + min;
}

/**
 * Check if a date is a weekday
 */
function isWeekday(date) {
	const day = date.getDay();
	return day >= 1 && day <= 5; // Monday to Friday
}

/**
 * Add random minutes to a date
 */
function addMinutes(date, minutes) {
	return new Date(date.getTime() + minutes * 60 * 1000);
}

/**
 * Add random seconds to a date
 */
function addSeconds(date, seconds) {
	return new Date(date.getTime() + seconds * 1000);
}

/**
 * Generate a random timestamp within office hours for a given day
 */
function randomOfficeHourTimestamp(day) {
	const start = new Date(day);
	start.setHours(OFFICE_HOURS_START, 0, 0, 0);

	const end = new Date(day);
	end.setHours(OFFICE_HOURS_END, 0, 0, 0);

	const randomTime = start.getTime() + Math.random() * (end.getTime() - start.getTime());
	return new Date(randomTime);
}

/**
 * Generate a session start event
 */
function generateSessionStart(sessionId, userId, serverId, version, timestamp, project) {
	return {
		event: 'session_start',
		timestamp: timestamp.toISOString(),
		serverId: serverId,
		version: version,
		sessionId: sessionId,
		userId: userId,
		data: {
			transport: 'stdio',
			clientVersion: '1.0.0',
			orgId: project.orgId,
			projectName: project.name,
			state: {
				org: {
					id: project.orgId,
					companyDetails: {
						Name: project.companyName
					}
				}
			}
		}
	};
}

/**
 * Generate a tool call event
 */
function generateToolCall(sessionId, userId, serverId, version, timestamp, toolIndex, project) {
	const toolName = TOOLS[toolIndex % TOOLS.length];
	const operation = OPERATIONS[randomInt(0, OPERATIONS.length - 1)];
	const duration = randomInt(50, 2000);
	const success = Math.random() > 0.05; // 95% success rate

	return {
		event: 'tool_call',
		timestamp: timestamp.toISOString(),
		serverId: serverId,
		version: version,
		sessionId: sessionId,
		userId: userId,
		data: {
			toolName: toolName,
			operation: operation,
			duration: duration,
			success: success,
			paramsCount: randomInt(1, 5),
			orgId: project.orgId,
			state: {
				org: {
					id: project.orgId,
					companyDetails: {
						Name: project.companyName
					}
				}
			}
		}
	};
}

/**
 * Generate a tool error event (occasionally)
 */
function generateToolError(sessionId, userId, serverId, version, timestamp, toolIndex, project) {
	const toolName = TOOLS[toolIndex % TOOLS.length];
	const errorTypes = ['ValidationError', 'PermissionError', 'TimeoutError', 'NetworkError'];
	const errorMessages = [
		'Invalid object name',
		'Insufficient permissions',
		'Request timeout',
		'Connection failed'
	];

	const errorIndex = randomInt(0, errorTypes.length - 1);

	return {
		event: 'tool_error',
		timestamp: timestamp.toISOString(),
		serverId: serverId,
		version: version,
		sessionId: sessionId,
		userId: userId,
		data: {
			toolName: toolName,
			errorType: errorTypes[errorIndex],
			errorMessage: errorMessages[errorIndex],
			success: false,
			orgId: project.orgId,
			state: {
				org: {
					id: project.orgId,
					companyDetails: {
						Name: project.companyName
					}
				}
			}
		}
	};
}

/**
 * Generate a session end event
 */
function generateSessionEnd(sessionId, userId, serverId, version, timestamp, project) {
	return {
		event: 'session_end',
		timestamp: timestamp.toISOString(),
		serverId: serverId,
		version: version,
		sessionId: sessionId,
		userId: userId,
		data: {
			toolCallsCount: randomInt(0, 50),
			orgId: project.orgId,
			state: {
				org: {
					id: project.orgId,
					companyDetails: {
						Name: project.companyName
					}
				}
			}
		}
	};
}

/**
 * Generate events for a single session
 */
function generateSession(userId, project, startDate, endDate) {
	const sessionId = uuidv4();
	const serverId = project.orgId;
	const version = VERSIONS[randomInt(0, VERSIONS.length - 1)];

	const events = [];

	// Session start
	const sessionStartTime = randomOfficeHourTimestamp(startDate);
	events.push(generateSessionStart(sessionId, userId, serverId, version, sessionStartTime, project));

	// Determine session duration (30 minutes to 4 hours)
	const sessionDurationMinutes = randomInt(30, 240);
	const sessionEndTime = addMinutes(sessionStartTime, sessionDurationMinutes);

	// Determine if user will use the agent (70% chance)
	const usesAgent = Math.random() < 0.7;

	if (usesAgent) {
		// Generate tool calls throughout the session
		// User makes 1-5 "prompts" during the session
		const numPrompts = randomInt(1, 5);

		for (let p = 0; p < numPrompts; p++) {
			// Prompt happens at random time during session
			const promptTime = new Date(
				sessionStartTime.getTime() +
				Math.random() * (sessionEndTime.getTime() - sessionStartTime.getTime())
			);

			// Each prompt generates 1-10 tool calls in quick succession
			const numToolCalls = randomInt(1, 10);

			for (let t = 0; t < numToolCalls; t++) {
				const toolCallTime = addSeconds(promptTime, t * randomFloat(0.5, 3));

				// 5% chance of error
				if (Math.random() < 0.05) {
					events.push(generateToolError(sessionId, userId, serverId, version, toolCallTime, t, project));
				} else {
					events.push(generateToolCall(sessionId, userId, serverId, version, toolCallTime, t, project));
				}
			}
		}
	}

	// Determine if session ends gracefully (80% chance)
	const gracefulEnd = Math.random() < 0.8;

	if (gracefulEnd && sessionEndTime <= endDate) {
		events.push(generateSessionEnd(sessionId, userId, serverId, version, sessionEndTime, project));
	}
	// Otherwise, session ends abruptly (no session_end event)

	return events;
}

/**
 * Generate initials from a name
 */
function generateInitials(name) {
	const parts = name.trim().split(/\s+/);
	if (parts.length >= 2) {
		return `${parts[0][0]}${parts.at(-1)[0]}`.toUpperCase();
	}
	return name.substring(0, 2).toUpperCase();
}


/**
 * Send events to telemetry endpoint via HTTP using batch mode
 * The endpoint accepts arrays of events, so we send them in batches of up to 1000 events
 */
async function sendEventsToEndpoint(events, endpointUrl) {
	const MAX_BATCH_SIZE = 1000; // Maximum events per API request
	const batches = [];

	// Split events into batches of MAX_BATCH_SIZE
	for (let i = 0; i < events.length; i += MAX_BATCH_SIZE) {
		batches.push(events.slice(i, i + MAX_BATCH_SIZE));
	}

	let totalSent = 0;
	let totalErrors = 0;

	console.log(`   Sending ${events.length} events in ${batches.length} batch(es)...`);

	for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
		const batch = batches[batchIndex];
		const isLastBatch = batchIndex === batches.length - 1;

		try {
			// Always send as array (batch mode) - more efficient
			const response = await fetch(endpointUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(batch)
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error(`   ⚠️  Batch ${batchIndex + 1}/${batches.length} failed: ${response.status} ${errorText}`);
				totalErrors += batch.length;
				continue;
			}

			const result = await response.json();

			// Handle batch response format
			totalSent += result.successful || 0;
			totalErrors += result.errors || 0;

			// Update progress
			if (!isLastBatch || totalSent % 1000 === 0) {
				process.stdout.write(`   Sent ${totalSent}/${events.length} events...\r`);
			}

			// Small delay between batches to avoid overwhelming the server
			if (!isLastBatch) {
				await new Promise(resolve => setTimeout(resolve, 10));
			}
		} catch (error) {
			console.error(`   ⚠️  Error sending batch ${batchIndex + 1}/${batches.length}:`, error.message);
			totalErrors += batch.length;
		}
	}

	return {totalSent, totalErrors};
}

/**
 * Generate all test data
 */
async function generateTestData(targetDay, shouldDeleteExisting, skipHttpFlag = false) {
	if (shouldDeleteExisting) {
		console.log('🗑️  Deleting all existing data...');
		const deletedCount = await db.deleteAllEvents();
		console.log(`   Deleted ${deletedCount} existing events\n`);
		const deletedTrash = await db.deleteAllDeletedEvents();
		console.log(`   Deleted ${deletedTrash} trashed events`);
		const deletedUserStats = await db.deleteAllUserEventStats();
		console.log(`   Deleted ${deletedUserStats} user_event_stats rows`);
		const deletedOrgStats = await db.deleteAllOrgEventStats();
		console.log(`   Deleted ${deletedOrgStats} org_event_stats rows`);
		const deletedTeamUsers = await db.deleteAllTeamEventUsers();
		console.log(`   Deleted ${deletedTeamUsers} team event user entries`);
		const deletedPeople = await db.deleteAllPeople();
		console.log(`   Deleted ${deletedPeople} people`);
		const deletedOrgs = await db.deleteAllOrgs();
		console.log(`   Deleted ${deletedOrgs} orgs`);
		const deletedTeams = await db.deleteAllTeams();
		console.log(`   Deleted ${deletedTeams} teams\n`);
	} else {
		console.log('🗂️  Keeping existing data (no delete requested)\n');
	}

	console.log('📊 Generating test data...');
	console.log(`   Users: ${NUM_USERS}`);
	console.log(`   Projects: ${NUM_PROJECTS}`);
	console.log(`   Period: ${WEEKS} weeks (with reduced weekend activity)`);
	console.log(`   Target: ${TARGET_EVENTS} events maximum\n`);

	// Base day for data generation (center of the period)
	const baseDate = targetDay ? new Date(targetDay) : new Date();
	baseDate.setHours(0, 0, 0, 0);

	// Calculate date range (WEEKS centered around baseDate)
	const halfRangeDays = (WEEKS * 7) / 2; // e.g. 7 days when WEEKS = 2

	const startDate = new Date(baseDate);
	startDate.setDate(startDate.getDate() - halfRangeDays);
	startDate.setHours(0, 0, 0, 0);

	const endDate = new Date(baseDate);
	endDate.setDate(endDate.getDate() + halfRangeDays - 1);
	endDate.setHours(23, 59, 59, 999);

	console.log(`   Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}\n`);

	const allEvents = [];
	let totalSessions = 0;

	// Generate sessions for each day
	const startTime = startDate.getTime();
	const endTime = endDate.getTime();
	const oneDayMs = 24 * 60 * 60 * 1000;

	for (let dayMs = startTime; dayMs <= endTime; dayMs += oneDayMs) {
		// Stop if we've reached the target number of events
		if (allEvents.length >= TARGET_EVENTS) {
			break;
		}

		const currentDate = new Date(dayMs);
		const isWeekend = !isWeekday(currentDate);

		// Each user has different chance of opening IDE based on weekday/weekend
		const workProbability = isWeekend ? 0.05 : 0.6; // Much lower activity on weekends

		for (const project of PROJECTS) {
			for (const userIndex of project.users) {
				// Stop if we've reached the target number of events
				if (allEvents.length >= TARGET_EVENTS) {
					break;
				}

				if (Math.random() < workProbability) {
					const userId = USER_IDS[userIndex];
					const sessionEvents = generateSession(userId, project, currentDate, endDate);
					allEvents.push(...sessionEvents);
					totalSessions++;

					// If we've exceeded the target, trim the last session's events
					if (allEvents.length > TARGET_EVENTS) {
						const excess = allEvents.length - TARGET_EVENTS;
						allEvents.splice(-excess);
					}
				}
			}

			// Break outer loop if we've reached the target
			if (allEvents.length >= TARGET_EVENTS) {
				break;
			}
		}
	}

	// Sort events by timestamp
	allEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

	console.log(`   Generated ${allEvents.length} events`);
	console.log(`   Generated ${totalSessions} sessions\n`);

	// Check if we should skip HTTP sending
	if (skipHttpFlag) {
		console.log('🚫 Skipping HTTP event sending (--skip-http flag provided)\n');
		return;
	}

	// Determine telemetry endpoint URL
	const port = process.env.PORT || 3100;
	const endpointUrl = process.env.TELEMETRY_ENDPOINT || `http://localhost:${port}/telemetry`;

	console.log('📡 Sending events to telemetry endpoint...');
	console.log(`   Endpoint: ${endpointUrl}`);

	// Verify server is accessible before sending events
	try {
		const healthCheck = await fetch(endpointUrl.replace('/telemetry', '/health'), {
			method: 'GET',
			signal: AbortSignal.timeout(2000)
		});
		if (!healthCheck.ok) {
			console.warn(`   ⚠️  Server health check returned ${healthCheck.status}`);
		}
	} catch (error) {
		console.error(`   ❌ Cannot connect to server at ${endpointUrl}`);
		console.error(`   Make sure the telemetry server is running before executing this script.`);
		console.error(`   Error: ${error.message}\n`);
		process.exit(1);
	}

	console.log('   Server is accessible, sending events...\n');

	// Send events via HTTP to the telemetry endpoint (more realistic)
	const {totalSent, totalErrors} = await sendEventsToEndpoint(allEvents, endpointUrl);

	if (totalErrors > 0) {
		console.log(`\n⚠️  Sent ${totalSent} events successfully, ${totalErrors} failed\n`);
	} else {
		console.log(`\n✅ Successfully sent ${totalSent} events to endpoint\n`);
	}

	// Generate teams (one per project)
	console.log('👥 Creating teams...');
	const teamColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444']; // Blue, Green, Orange, Red
	const teamsMap = new Map();

	for (let i = 0; i < PROJECTS.length; i++) {
		const project = PROJECTS[i];
		const teamName = `${project.name.replace('Project ', '')} Team`;
		const color = teamColors[i % teamColors.length];

		try {
			const team = await db.createTeam(teamName, color);
			teamsMap.set(project.orgId, team.id);
			console.log(`   Created team: ${teamName} (ID: ${team.id})`);

			// Ensure org exists with team mapping, then recalc existing events
			await db.upsertOrg(project.orgId, {
				alias: project.name,
				team_id: team.id,
				company_name: project.companyName
			});
			await db.moveOrgToTeam(project.orgId, team.id);
			console.log(`   Assigned org ${project.orgId} to team ${teamName}`);
		} catch (error) {
			if (error.message && error.message.includes('already exists')) {
				// Team already exists, try to find it
				const allTeams = await db.getAllTeams();
				const existingTeam = allTeams.find(t => t.name === teamName);
				if (existingTeam) {
					teamsMap.set(project.orgId, existingTeam.id);
					await db.upsertOrg(project.orgId, {
						alias: project.name,
						team_id: existingTeam.id,
						company_name: project.companyName
					});
					await db.moveOrgToTeam(project.orgId, existingTeam.id);
					console.log(`   Using existing team: ${teamName} (ID: ${existingTeam.id})`);
				} else {
					console.error(`   ⚠️  Error creating team ${teamName}: ${error.message}`);
				}
			} else {
				console.error(`   ⚠️  Error creating team ${teamName}: ${error.message}`);
			}
		}
	}

	console.log('');

	// Generate people (one per user) and associate usernames
	console.log('👤 Creating people and associating usernames...');
	const peopleMap = new Map();

	for (let userIndex = 0; userIndex < USER_IDS.length; userIndex++) {
		const personName = USER_IDS[userIndex];
		const initials = generateInitials(personName);

		// Find which project(s) this user belongs to
		const userProjects = PROJECTS.filter(p => p.users.includes(userIndex));

		try {
			// Create person
			const person = await db.createPerson(personName, initials);
			peopleMap.set(personName, person.id);
			console.log(`   Created person: ${personName} (ID: ${person.id}, ${initials})`);

			// Associate username with person for each project
			for (const project of userProjects) {
				try {
					await db.addUsernameToPerson(person.id, personName, project.orgId);
					console.log(`     Associated username "${personName}" with org ${project.orgId}`);

					// Assign username to team
					const teamId = teamsMap.get(project.orgId);
					if (teamId) {
						await db.addEventUserToTeam(teamId, personName);
						const projectName = project.name.replace('Project ', '');
						const teamName = `${projectName} Team`;
						console.log(`     Assigned username "${personName}" to team ${teamName}`);
					}
				} catch (error) {
					if (error.message && error.message.includes('already associated')) {
						console.log(`     Username "${personName}" already associated with org ${project.orgId}`);
					} else {
						console.error(`     ⚠️  Error associating username "${personName}" with org ${project.orgId}: ${error.message}`);
					}
				}
			}
		} catch (error) {
			console.error(`   ⚠️  Error creating person ${personName}: ${error.message}`);
		}
	}

	console.log('');

	// Print summary statistics
	const stats = await db.getStats();
	const eventTypeStats = await db.getEventTypeStats();
	const sessions = await db.getSessions();

	console.log('📈 Summary Statistics:');
	console.log(`   Total events: ${stats.total}`);
	console.log(`   Total sessions: ${sessions.length}`);
	console.log(`   Total teams: ${teamsMap.size}`);
	console.log(`   Total people: ${peopleMap.size}`);
	console.log('\n   Events by type:');
	for (const stat of eventTypeStats) {
		console.log(`     ${stat.event}: ${stat.count}`);
	}

	console.log('\n✅ Test data generation complete!');
}

// Run the script
(async () => {
	try {
		// Check ENVIRONMENT variable
		const environment = process.env.ENVIRONMENT;
		const hasDisableEnvCheckFlag = process.argv.includes('--disable-env-check');

		if (environment === 'pro') {
			console.error('❌ This script cannot run in production environment (ENVIRONMENT=pro)');
			process.exit(1);
		} else if (environment === 'dev') {
			// Continue with script execution
		} else if (!environment || environment.trim() === '') {
			if (!hasDisableEnvCheckFlag) {
				console.error('❌ ENVIRONMENT variable not set. Use --disable-env-check flag to bypass this check in development.');
				console.error('   Usage: node src/scripts/generate-test-data.js [--disable-env-check] [--skip-http] [YYYY-MM-DD] [true|false]');
				console.error('   Examples:');
				console.error('     ENVIRONMENT=dev node src/scripts/generate-test-data.js');
				console.error('     node src/scripts/generate-test-data.js --disable-env-check true');
				console.error('     node src/scripts/generate-test-data.js 2025-12-01 false');
				console.error('     node src/scripts/generate-test-data.js --skip-http 2025-12-01 true');
				process.exit(1);
			}
		}

	// Check for skip-http flag
	const skipHttpFlag = process.argv.includes('--skip-http');

	// Parse arguments, filtering out flags
	const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));

		const dayArg = args[0];
		const deleteArg = args[1];
		let targetDay = null;
		let shouldDeleteExisting = false;

		if (dayArg) {
			const parsed = new Date(dayArg);
			if (Number.isNaN(parsed.getTime())) {
				console.error('❌ Invalid date format. Use YYYY-MM-DD, e.g. 2025-12-01');
				process.exit(1);
			}
			targetDay = parsed;
			console.log(`📅 Using target day: ${dayArg}`);
		} else {
			console.log('📅 No target day provided, using today as center of the period');
		}

		if (typeof deleteArg === 'string') {
			const normalized = deleteArg.toLowerCase();
			shouldDeleteExisting = normalized === 'true' || normalized === '1' || normalized === 'yes';
		}

		console.log(`🧹 Delete existing data before insert: ${shouldDeleteExisting ? 'YES' : 'NO'}`);

		await db.init();
		await generateTestData(targetDay, shouldDeleteExisting, skipHttpFlag);
		await db.close();
		process.exit(0);
	} catch (error) {
		console.error('❌ Error generating test data:', error.message);
		process.exit(1);
	}
})();
