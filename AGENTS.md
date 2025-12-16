# Agent Instructions for IBM Salesforce Context Telemetry Server

This document provides instructions for AI agents working with the IBM Salesforce Context Telemetry Server.

## Overview

The *IBM Salesforce Context Telemetry Server* is a backend service that collects telemetry data from *IBM Salesforce Context MCP server* instances. It provides:
- REST API endpoints for receiving telemetry events and monitoring server health
- A web-based UI for viewing and analyzing telemetry data
- People management system for grouping usernames across organizations
- Advanced analytics capabilities with user-centric data aggregation

## UI

La UI està construïda amb Tailwind CSS amb una capa lleugera de personalitzacions pròpies.

### Elements comuns a totes les pàgines:

#### Top header
- Logo and site title: "TELEMETRY"
- Horizontal navigation bar with the following links:
	- Dashboard
	- Logs
	- Teams
	- People
- Controls:
	- Search input
	- Refresh button
	- Notifications enabled toggle
	- User dropdown menu with the following options:
		- Username (non-interactive)
		- Light/Dark theme toggle
		- Open settings modal
		- Logout

#### Footer
- Links to:
	- Health check
	- JSON schema

### Pages
- #### Login (`/login`)
    Branded login card with username/password fields, remember-me toggle, error banner, and submit button. Posts to `/login` and redirects to dashboard on success; checks `/api/auth/status` to skip already-authenticated users.

- #### Dashboard (`/`)
    Top navigation with search, refresh, notifications, and user menu. Main events time-series chart with range selector, plus cards for top teams (last 30 days), top users (last 3 days), server stats (last updated/load time/version/DB size), and a lightweight proposal tracker list. Footer links to health check, API, and schema.

- #### Logs (`/logs`)
    Event log viewer with sidebar tabs for Sessions/Users/Teams, list with totals and multi-select/delete controls. Filters include search, sort toggle, user dropdown, and level filters (session_start/tool_call/custom/tool_error). Main area shows session activity timeline chart with legend and navigation, plus the paginated logs table (time, user, event type, tool name, company, payload, status). Footer shows last updated, load time, version, and optional DB size.

- #### Teams (`/teams`)
    Same top navigation as dashboard, breadcrumb back link, and Teams header. Content is loaded by `teams.js`, refreshed via the top refresh button; notifications toggle and user menu remain available.

- #### People (`/people`)
    People management interface for grouping usernames from different organizations under single physical persons. Shows a form to add new people and a list of existing people with their associated usernames. Content is loaded by `people.js`, refreshed via the top refresh button. The old `/users` URL redirects to `/people` for backward compatibility.


## Data Model and Nomenclature

### User Types Clarification
The system distinguishes between different types of users:

- **`system_users`** (authentication table): System accounts for accessing the telemetry UI with different roles (basic, advanced, administrator)
- **`people`** (telemetry data): Physical persons who generate telemetry events and may have multiple usernames across different organizations
- **`person_usernames`** (relationship table): Links between usernames found in events and physical persons

This distinction allows grouping telemetry data by actual people rather than by technical account names.

## Key Endpoints

-### Telemetry Collection

**POST `/telemetry`**
- Receives telemetry events from MCP server instances
- Accepts JSON payloads with event data
- Returns `{ "status": "ok" }` on successful receipt
- Currently logs events to console; future implementations may store data

### Health Monitoring

**GET `/health`**
- Simple health check endpoint
- Returns `"ok"` when server is operational
- Used by monitoring systems and load balancers

**GET `/`**
- Root endpoint showing server status
- Returns confirmation message when server is running

### People Management (User Grouping)

**GET `/api/people`**
- Returns list of all physical people in the system
- Requires administrator role

**POST `/api/people`**
- Creates a new physical person
- Body: `{ "name": "Person Name", "email": "optional@email.com" }`
- Requires administrator role

**GET `/api/people/:id/usernames`**
- Returns all usernames associated with a specific person
- Requires administrator role

**POST `/api/people/:id/usernames`**
- Associates a username with a person
- Body: `{ "username": "john.doe", "org_id": "optional-org-id" }`
- Requires administrator role

**GET `/api/events?groupBy=person`**
- Returns events grouped by physical person instead of username
- Useful for analytics by actual users rather than accounts

## Development Guidelines

### Adding New Features

When extending the telemetry server:

1. **Maintain Privacy**: Ensure all telemetry data handling follows privacy best practices
2. **Error Handling**: Implement proper error handling and logging
3. **Validation**: Validate incoming telemetry data structure
4. **Scalability**: Consider performance implications for high-volume scenarios
5. **Documentation**: Update this file and README.md when adding features

### Data Storage and Environment Configuration

The project uses a dual-database setup driven by environment variables:

| Environment | `DB_TYPE` | Location / Connection | Notes |
|-------------|-----------|-----------------------|-------|
| Local development | `sqlite` | `DB_PATH=./src/data/telemetry.db` | SQLite file lives inside the repo, ideal for quick iteration. |
| Production on Render.com | `postgresql` | `DATABASE_URL=postgresql://<user>:<password>@<host>/<db>?sslmode=require` | Requires `DATABASE_SSL=true`. Credentials are provisioned by Render and must remain in environment secrets, not in docs. |

Key `.env` variables:

- `TELEMETRY_UI_URL`: Full URL to the event log UI (set to Render URL in production, `http://localhost:3100/logs` locally).
- `DB_TYPE`: Switch between `sqlite` and `postgresql`.
- `DB_PATH`: Only used when `DB_TYPE=sqlite`; keep the relative path unless you need a custom location.
- `DATABASE_URL` / `DATABASE_SSL`: Only used when `DB_TYPE=postgresql`.
- `TELEMETRY_DISABLED`: Optional flag that temporarily disables ingestion (set to `false` in production).

### Database Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `telemetry_events` | Raw telemetry events | `id`, `event`, `user_id`, `server_id`, `timestamp` |
| `system_users` | System authentication accounts | `id`, `username`, `password_hash`, `role` |
| `people` | Physical persons for telemetry grouping | `id`, `name`, `email`, `notes` |
| `person_usernames` | Username-to-person relationships | `person_id`, `username`, `org_id`, `is_primary` |
| `orgs` | Organization/company information | `server_id`, `company_name` |
| `settings` | Application configuration | `key`, `value` |

Always keep the `.env` comments aligned with the current deployment strategy so agents and contributors know which configuration to pick up.

### Security Considerations

- Validate all incoming requests
- Implement rate limiting to prevent abuse
- Use HTTPS in production
- Sanitize and validate all input data
- Consider authentication for sensitive operations

### Monitoring and Observability

- Log important events and errors
- Monitor endpoint response times
- Track telemetry volume and patterns
- Set up alerts for server health issues

## Integration with IBM Salesforce Context

The IBM Salesforce Context MCP server can be configured to send telemetry to this server by:

1. Setting the telemetry endpoint URL in the MCP server configuration
2. Ensuring the MCP server has network access to the telemetry server
3. Verifying the telemetry format matches expected schema

## Development and Skills System

The project includes a skills system for enhanced AI agent capabilities. Available skills are documented at the end of this file and can be invoked during development tasks.

### Testing

When testing the telemetry server:

- Test with various telemetry event formats
- Verify error handling for malformed requests
- Test health endpoints for monitoring integration
- Validate response times under load
- Test user management and people grouping functionality

## Deployment

The server is designed to run on platforms like Render, Heroku, or any Node.js hosting service:

- Set the `PORT` environment variable if needed (defaults to 3100)
- Ensure the service can handle concurrent requests
- Configure appropriate resource limits based on expected telemetry volume
- Set up monitoring and logging for both system health and data ingestion
- Database migrations run automatically on startup for new features

## Recent Features

### People Management System (v1.0)
- **Physical Person Tracking**: Group multiple usernames from different organizations under single people
- **Enhanced Analytics**: View telemetry data grouped by actual users instead of technical accounts
- **User Management UI**: Dedicated interface for managing people and their username associations
- **Database Relations**: New `people` and `person_usernames` tables with proper foreign keys

## Future Enhancements

Potential improvements to consider:

- Real-time analytics dashboard with live updates
- Advanced data aggregation and automated reporting
- Enhanced anonymization and privacy-preserving techniques
- Support for additional telemetry formats beyond current JSON schema
- Webhook notifications for specific events or thresholds
- Advanced rate limiting and request throttling
- Multi-factor authentication for admin accounts

<skills_system priority="1">

## Available Skills

<!-- SKILLS_TABLE_START -->
<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

How to use skills:
- Invoke: Bash("openskills read <skill-name>")
- The skill content will load with detailed instructions on how to complete the task
- Base directory provided in output for resolving bundled resources (references/, scripts/, assets/)

Usage notes:
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context
- Each skill invocation is stateless
</usage>

<available_skills>

<skill>
<name>brainstorming</name>
<description>Use when creating or developing, before writing code or implementation plans - refines rough ideas into fully-formed designs through collaborative questioning, alternative exploration, and incremental validation. Don't use during clear 'mechanical' processes</description>
<location>global</location>
</skill>

<skill>
<name>condition-based-waiting</name>
<description>Use when tests have race conditions, timing dependencies, or inconsistent pass/fail behavior - replaces arbitrary timeouts with condition polling to wait for actual state changes, eliminating flaky tests from timing guesses</description>
<location>global</location>
</skill>

<skill>
<name>dispatching-parallel-agents</name>
<description>Use when facing 3+ independent failures that can be investigated without shared state or dependencies - dispatches multiple Claude agents to investigate and fix independent problems concurrently</description>
<location>global</location>
</skill>

<skill>
<name>executing-plans</name>
<description>Use when partner provides a complete implementation plan to execute in controlled batches with review checkpoints - loads plan, reviews critically, executes tasks in batches, reports for review between batches</description>
<location>global</location>
</skill>

<skill>
<name>finishing-a-development-branch</name>
<description>Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion of development work by presenting structured options for merge, PR, or cleanup</description>
<location>global</location>
</skill>

<skill>
<name>root-cause-tracing</name>
<description>Use when errors occur deep in execution and you need to trace back to find the original trigger - systematically traces bugs backward through call stack, adding instrumentation when needed, to identify source of invalid data or incorrect behavior</description>
<location>global</location>
</skill>

<skill>
<name>subagent-driven-development</name>
<description>Use when executing implementation plans with independent tasks in the current session - dispatches fresh subagent for each task with code review between tasks, enabling fast iteration with quality gates</description>
<location>global</location>
</skill>

<skill>
<name>systematic-debugging</name>
<description>Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes - four-phase framework (root cause investigation, pattern analysis, hypothesis testing, implementation) that ensures understanding before attempting solutions</description>
<location>global</location>
</skill>

<skill>
<name>test-driven-development</name>
<description>Use when implementing any feature or bugfix, before writing implementation code - write the test first, watch it fail, write minimal code to pass; ensures tests actually verify behavior by requiring failure first</description>
<location>global</location>
</skill>

<skill>
<name>testing-skills-with-subagents</name>
<description>Use when creating or editing skills, before deployment, to verify they work under pressure and resist rationalization - applies RED-GREEN-REFACTOR cycle to process documentation by running baseline without skill, writing to address failures, iterating to close loopholes</description>
<location>global</location>
</skill>

<skill>
<name>using-superpowers</name>
<description>Use when starting any conversation - establishes mandatory workflows for finding and using skills, including using Skill tool before announcing usage, following brainstorming before coding, and creating TodoWrite todos for checklists</description>
<location>global</location>
</skill>

<skill>
<name>verification-before-completion</name>
<description>Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always</description>
<location>global</location>
</skill>

<skill>
<name>writing-plans</name>
<description>Use when design is complete and you need detailed implementation tasks for engineers with zero codebase context - creates comprehensive implementation plans with exact file paths, complete code examples, and verification steps assuming engineer has minimal domain knowledge</description>
<location>global</location>
</skill>

</available_skills>
<!-- SKILLS_TABLE_END -->

</skills_system>
