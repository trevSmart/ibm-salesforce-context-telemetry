
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
 */

import 'dotenv/config';
import * as db from '../storage/database.js';
import {TelemetryEvent} from '../storage/telemetry-event.js';
import {v4 as uuidv4} from 'uuid';

// Configuration
const NUM_USERS = 20;
const NUM_PROJECTS = 4;
const WEEKS = 6; // Increased to cover more weeks
const OFFICE_HOURS_START = 9; // 9 AM
const OFFICE_HOURS_END = 18; // 6 PM
const TARGET_EVENT_COUNT = 500; // Target number of events to generate

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
 * Generate a session start event (v2 schema)
 */
function generateSessionStart(sessionId, userId, serverId, version, timestamp, project) {
	const payload = {
		schemaVersion: 2,
		area: 'session',
		event: 'session_start',
		success: true,
		timestamp: timestamp.toISOString(),
		server: {
			id: serverId,
			version: version,
			capabilities: {
				logging: {},
				resources: {listChanged: true},
				tools: {},
				prompts: {},
				completions: {}
			}
		},
		client: {
			name: 'Cursor',
			version: '1.0.0',
			capabilities: {
				elicitation: {form: {}},
				roots: {listChanged: false}
			}
		},
		session: {
			id: sessionId,
			transport: 'stdio',
			protocolVersion: '2025-11-25'
		},
		user: {
			id: userId
		},
		data: {
			transport: 'stdio',
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

	return new TelemetryEvent(payload, payload);
}

/**
 * Generate a tool call event (v2 schema)
 */
function generateToolCall(sessionId, userId, serverId, version, timestamp, toolIndex, project) {
	const toolName = TOOLS[toolIndex % TOOLS.length];
	const operation = OPERATIONS[randomInt(0, OPERATIONS.length - 1)];
	const duration = randomInt(50, 2000);
	const success = Math.random() > 0.05; // 95% success rate

	const payload = {
		schemaVersion: 2,
		area: 'tool',
		event: 'execution',
		success: success,
		timestamp: timestamp.toISOString(),
		server: {
			id: serverId,
			version: version,
			capabilities: {
				logging: {},
				resources: {listChanged: true},
				tools: {},
				prompts: {},
				completions: {}
			}
		},
		client: {
			name: 'Cursor',
			version: '1.0.0',
			capabilities: {
				elicitation: {form: {}},
				roots: {listChanged: false}
			}
		},
		session: {
			id: sessionId,
			transport: 'stdio',
			protocolVersion: '2025-11-25'
		},
		user: {
			id: userId
		},
		data: {
			toolName: toolName,
			operation: operation,
			duration: duration,
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

	return new TelemetryEvent(payload, payload);
}

/**
 * Generate a tool error event (v2 schema)
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

	const payload = {
		schemaVersion: 2,
		area: 'tool',
		event: 'execution',
		success: false,
		timestamp: timestamp.toISOString(),
		server: {
			id: serverId,
			version: version,
			capabilities: {
				logging: {},
				resources: {listChanged: true},
				tools: {},
				prompts: {},
				completions: {}
			}
		},
		client: {
			name: 'Cursor',
			version: '1.0.0',
			capabilities: {
				elicitation: {form: {}},
				roots: {listChanged: false}
			}
		},
		session: {
			id: sessionId,
			transport: 'stdio',
			protocolVersion: '2025-11-25'
		},
		user: {
			id: userId
		},
		data: {
			toolName: toolName,
			error: {
				type: errorTypes[errorIndex],
				message: errorMessages[errorIndex],
				tool: toolName
			},
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

	return new TelemetryEvent(payload, payload);
}

/**
 * Generate a server boot event (v2 schema)
 */
function generateServerBoot(serverId, version, timestamp) {
	const payload = {
		schemaVersion: 2,
		area: 'session',
		event: 'server_boot',
		success: true,
		timestamp: timestamp.toISOString(),
		server: {
			id: serverId,
			version: version,
			capabilities: {
				logging: {},
				resources: {listChanged: true},
				tools: {},
				prompts: {},
				completions: {}
			}
		},
		client: {
			name: 'Cursor',
			version: '1.0.0',
			capabilities: {
				elicitation: {form: {}},
				roots: {listChanged: false}
			}
		},
		session: {
			id: null,
			transport: 'stdio',
			protocolVersion: '2025-11-25'
		},
		user: null,
		data: {
			transport: 'stdio',
			port: null
		}
	};

	return new TelemetryEvent(payload, payload);
}

/**
 * Generate a client connect event (v2 schema)
 */
function generateClientConnect(sessionId, serverId, version, timestamp) {
	const payload = {
		schemaVersion: 2,
		area: 'session',
		event: 'client_connect',
		success: true,
		timestamp: timestamp.toISOString(),
		server: {
			id: serverId,
			version: version,
			capabilities: {
				logging: {},
				resources: {listChanged: true},
				tools: {},
				prompts: {},
				completions: {}
			}
		},
		client: {
			name: 'Cursor',
			version: '1.0.0',
			capabilities: {
				elicitation: {form: {}},
				roots: {listChanged: false}
			}
		},
		session: {
			id: sessionId,
			transport: 'stdio',
			protocolVersion: '2025-11-25'
		},
		user: null,
		data: {
			transport: 'stdio'
		}
	};

	return new TelemetryEvent(payload, payload);
}

/**
 * Generate a session end event (v2 schema)
 */
function generateSessionEnd(sessionId, userId, serverId, version, timestamp, project) {
	const payload = {
		schemaVersion: 2,
		area: 'session',
		event: 'session_end',
		success: true,
		timestamp: timestamp.toISOString(),
		server: {
			id: serverId,
			version: version,
			capabilities: {
				logging: {},
				resources: {listChanged: true},
				tools: {},
				prompts: {},
				completions: {}
			}
		},
		client: {
			name: 'Cursor',
			version: '1.0.0',
			capabilities: {
				elicitation: {form: {}},
				roots: {listChanged: false}
			}
		},
		session: {
			id: sessionId,
			transport: 'stdio',
			protocolVersion: '2025-11-25'
		},
		user: {
			id: userId
		},
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

	return new TelemetryEvent(payload, payload);
}

/**
 * Generate events for a single session
 */
function generateSession(userId, project, startDate, endDate) {
	const sessionId = uuidv4();
	const serverId = `server-${project.orgId}-${randomInt(1000, 9999)}`;
	const version = VERSIONS[randomInt(0, VERSIONS.length - 1)];

	const events = [];

	// Server boot (happens before session, 1-5 seconds before session start)
	const sessionStartTime = randomOfficeHourTimestamp(startDate);
	const serverBootTime = addSeconds(sessionStartTime, -randomInt(1, 5));
	events.push(generateServerBoot(serverId, version, serverBootTime));

	// Client connect (happens right before session start, 0.5-2 seconds before)
	const clientConnectTime = addSeconds(sessionStartTime, -randomFloat(0.5, 2));
	events.push(generateClientConnect(sessionId, serverId, version, clientConnectTime));

	// Session start
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
 * Generate all test data
 */
async function generateTestData(targetDay, shouldDeleteExisting) {
	if (shouldDeleteExisting) {
		console.log('🗑️  Deleting all existing data...');
		const deletedCount = await db.deleteAllEvents();
		console.log(`   Deleted ${deletedCount} existing events\n`);
	} else {
		console.log('🗂️  Keeping existing data (no delete requested)\n');
	}

	console.log('📊 Generating test data...');
	console.log(`   Users: ${NUM_USERS}`);
	console.log(`   Projects: ${NUM_PROJECTS}`);
	console.log(`   Target events: ${TARGET_EVENT_COUNT}`);
	console.log(`   Period: ${WEEKS} weeks (with reduced weekend activity)\n`);

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

	// Generate sessions for each day until we reach the target event count
	const startTime = startDate.getTime();
	const endTime = endDate.getTime();
	const oneDayMs = 24 * 60 * 60 * 1000;

	for (let dayMs = startTime; dayMs <= endTime && allEvents.length < TARGET_EVENT_COUNT; dayMs += oneDayMs) {
		const currentDate = new Date(dayMs);
		const isWeekend = !isWeekday(currentDate);

		// Each user has different chance of opening IDE based on weekday/weekend
		const workProbability = isWeekend ? 0.05 : 0.6; // Much lower activity on weekends

		for (const project of PROJECTS) {
			for (const userIndex of project.users) {
				// Stop if we've reached the target event count
				if (allEvents.length >= TARGET_EVENT_COUNT) {
					break;
				}

				if (Math.random() < workProbability) {
					const userId = USER_IDS[userIndex];
					const sessionEvents = generateSession(userId, project, currentDate, endDate);

					// Only add events if we haven't exceeded the target
					const remainingSlots = TARGET_EVENT_COUNT - allEvents.length;
					if (sessionEvents.length <= remainingSlots) {
						allEvents.push(...sessionEvents);
						totalSessions++;
					} else {
						// Add only the events that fit within the target
						allEvents.push(...sessionEvents.slice(0, remainingSlots));
						totalSessions++;
						break; // We've reached the target, exit loops
					}
				}
			}

			// Break outer loop if we've reached the target
			if (allEvents.length >= TARGET_EVENT_COUNT) {
				break;
			}
		}
	}

	// Sort events by timestamp
	allEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

	console.log(`   Generated ${allEvents.length} events`);
	console.log(`   Generated ${totalSessions} sessions\n`);

	console.log('💾 Storing events in database...');

	// Store events in batches
	const BATCH_SIZE = 100;
	let stored = 0;

	for (let i = 0; i < allEvents.length; i += BATCH_SIZE) {
		const batch = allEvents.slice(i, i + BATCH_SIZE);

		for (const event of batch) {
			// event is a TelemetryEvent instance
			const receivedAt = new Date(event.timestamp);
			// Add small random delay (0-5 seconds) to received_at
			receivedAt.setMilliseconds(receivedAt.getMilliseconds() + randomInt(0, 5000));
			
			// Set receivedAt on the event
			event.receivedAt = receivedAt.toISOString();

			await db.storeEvent(event, receivedAt.toISOString());
			stored++;

			if (stored % 1000 === 0) {
				process.stdout.write(`   Stored ${stored}/${allEvents.length} events...\r`);
			}
		}
	}

	console.log(`\n✅ Successfully stored ${stored} events\n`);

	// Print summary statistics
	const stats = await db.getStats();
	const eventTypeStats = await db.getEventTypeStats();
	const sessions = await db.getSessions();

	console.log('📈 Summary Statistics:');
	console.log(`   Total events: ${stats.total}`);
	console.log(`   Total sessions: ${sessions.length}`);
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
				console.error('   Usage: node src/scripts/generate-test-data.js [--disable-env-check] [YYYY-MM-DD] [true|false]');
				console.error('   Examples:');
				console.error('     ENVIRONMENT=dev node src/scripts/generate-test-data.js');
				console.error('     node src/scripts/generate-test-data.js --disable-env-check true');
				console.error('     node src/scripts/generate-test-data.js 2025-12-01 false');
				process.exit(1);
			}
		}

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
		await generateTestData(targetDay, shouldDeleteExisting);
		await db.close();
		process.exit(0);
	} catch (error) {
		console.error('❌ Error generating test data:', error);
		process.exit(1);
	}
})();

