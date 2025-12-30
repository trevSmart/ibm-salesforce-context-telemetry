# Agent Instructions for IBM Salesforce Context Telemetry Server

This document provides instructions for AI agents working with the IBM Salesforce Context Telemetry Server.

## Overview

The *IBM Salesforce Context Telemetry Server* is a backend service that collects telemetry data from *IBM Salesforce Context MCP server* instances. It provides:
- REST API endpoints for receiving telemetry events and monitoring server health
- A web-based UI for viewing and analyzing telemetry data
- People management system for grouping usernames across organizations
- Advanced analytics capabilities with user-centric data aggregation

## UI

The UI is built with Tailwind CSS with a layer of customizations.

### Common elements across all pages:

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
    People management interface for grouping usernames from different organizations under single physical persons. Shows a form to add new people and a list of existing people with their associated usernames. Content is loaded by `people.js`, refreshed via the top refresh button.

### Soft Navigation Architecture

The application implements **soft navigation** (also known as client-side navigation) to provide a faster, smoother user experience by avoiding full page reloads when navigating between pages. This is implemented via `public/js/navigation.js` and follows a clear contract between the navigation system and individual pages.

#### Navigation System Responsibilities (`navigation.js`)

The navigation system handles all generic navigation concerns and MUST remain agnostic to page-specific functionality:

**Core Responsibilities:**
- **Navigation interception**: Captures clicks on navigation links via event delegation
- **History management**: Manages `history.pushState` and `popstate` events
- **HTML fetching and caching**: Loads and caches full page HTML to optimize subsequent visits
- **DOM container caching**: Preserves page container nodes to restore pages from cache instantly
- **DOM swapping**: Replaces page content with crossfade transitions
- **Lifecycle event emission**: Broadcasts generic lifecycle events that pages can listen to

**Lifecycle Events Emitted:**

1. **`softNav:pagePausing`** - Dispatched when navigating away from the current page
   - Event detail: `{path: '/current-path'}` (the path being left)
   - Fired BEFORE the current page container is cached
   - Pages should pause/cleanup their resources when receiving this event

2. **`softNav:pageMounted`** - Dispatched when a page has been mounted and is visible
   - Event detail: `{path: '/target-path', fromCache: boolean}` 
   - `fromCache: true` means the page was restored from cache (container was preserved)
   - `fromCache: false` means the page was freshly loaded/rendered
   - Pages should initialize/resume when receiving this event

**What navigation.js MUST NOT contain:**
- Page-specific logic (charts, data loading, timers, UI widgets)
- Business logic for any specific page
- Direct manipulation of page content beyond container swapping
- Page-specific resource management

**Exception:** The notification toggle fallback (lines 125-181) provides basic functionality when page scripts aren't loaded. This is acceptable as it's part of the shared UI shell, not page-specific business logic.

#### Page Script Responsibilities

Each page script (e.g., `index.js`, `event-log.js`, `teams.js`, `people.js`) is responsible for managing its own lifecycle by listening to soft navigation events.

**Required Pattern:**

```javascript
// Listen for page pausing (user navigating away)
window.addEventListener('softNav:pagePausing', (event) => {
  if (event?.detail?.path === '/your-route') {
    pauseYourPage();
  }
});

// Listen for page mounting (page becoming visible)
window.addEventListener('softNav:pageMounted', async (event) => {
  if (event?.detail?.path === '/your-route') {
    const fromCache = event?.detail?.fromCache === true;
    if (fromCache) {
      // Page restored from cache - resume existing state
      await resumeYourPage();
    } else {
      // Fresh page load - full initialization
      initializeYourPage({resetState: true});
    }
  }
});
```

**Resources to Manage:**

Pages must properly manage these resources in their pause/cleanup logic:

- **Event listeners** - Remove to prevent duplicate handlers
- **Timers and intervals** - Clear using `timerRegistry.clearInterval()`, `timerRegistry.clearTimeout()`
- **Charts (ECharts)** - Call `.dispose()` on chart instances when pausing
- **Observers** - Disconnect `ResizeObserver`, `MutationObserver`, `IntersectionObserver`
- **Fetch requests** - Cancel in-flight requests if applicable
- **Animation frames** - Cancel pending `requestAnimationFrame` callbacks
- **WebSocket connections** - Close or pause subscriptions

**Timer Management:**

The application uses a global `timerRegistry` (from `utils/timer-registry.js`) for safe timer management:

```javascript
// Setting timers
timerRegistry.setTimeout('uniqueId', callback, delay);
timerRegistry.setInterval('uniqueId', callback, interval);

// Clearing timers
timerRegistry.clearTimeout('uniqueId');
timerRegistry.clearInterval('uniqueId');

// Clear all timers for a page
timerRegistry.clearAll(); // Clears everything (use carefully)
```

Using the timer registry ensures timers can be properly cleared even if the page is cached or removed from the DOM.

**Implementation Examples:**

See these files for reference implementations:

- **`public/js/index.js`** - Dashboard page with pause/resume and chart cleanup
- **`public/js/event-log.js`** - Complex page with multiple charts, timers, and data loading
- **`public/js/teams.js`** - Simpler page with state reset on navigation
- **`public/js/people.js`** - Similar to teams with view state management
- **`public/js/tool-usage-chart.js`** - Standalone component with cleanup logic

#### Benefits of This Architecture

- **Predictable lifecycle** - Clear mount/pause events make page behavior easier to understand
- **No duplicate resources** - Proper cleanup prevents listeners, timers, and charts from accumulating
- **Smaller navigation.js** - Generic navigation code stays stable and maintainable
- **Fewer regressions** - New pages follow the same pattern, reducing bugs
- **Better performance** - Page caching and instant restoration improve perceived speed
- **Isolation** - Pages don't interfere with each other's lifecycle

#### Adding New Pages

When creating a new page with soft navigation support:

1. **Add route to `SUPPORTED_PATHS`** in `navigation.js` (line 4)
2. **Add page scripts to `PAGE_SCRIPTS`** object in `navigation.js` (line 12-18)
3. **Implement lifecycle listeners** in your page script following the pattern above
4. **Create pause function** that cleans up all resources (listeners, timers, charts)
5. **Create resume function** that re-initializes when returning from cache
6. **Test navigation** - Navigate away and back multiple times to verify no resource leaks

#### Common Pitfalls to Avoid

❌ **Adding page-specific logic to navigation.js** - Keep it generic
❌ **Forgetting to check path in event listeners** - Always verify `event.detail.path` matches your route
❌ **Not clearing timers** - Use `timerRegistry` and clear in pause function  
❌ **Not disposing charts** - Call `.dispose()` on ECharts instances
❌ **Adding listeners in render functions** - Use inline `onclick` or add listeners once on mount
❌ **Not handling fromCache flag** - Distinguish between fresh load and cache restoration

#### Pause vs Cleanup Semantics

**What "pause" means in this architecture:**

When a page receives `softNav:pagePausing`, it should perform **complete cleanup**, not just "pause":

- ✅ **Clear all timers** - `timerRegistry.clearAll()` to stop all intervals and timeouts
- ✅ **Remove all event listeners** - Especially scroll, resize, click handlers added dynamically
- ✅ **Dispose all charts** - Call `.dispose()` on ECharts instances to free memory
- ✅ **Disconnect all observers** - ResizeObserver, MutationObserver, IntersectionObserver
- ✅ **Cancel in-flight requests** - If using AbortController, cancel pending fetches
- ✅ **Clear handler references** - Set global handler variables to null

**Why complete cleanup is required:**

The page DOM may be cached and restored later, but all JavaScript resources must be cleaned up to prevent:
- Memory leaks from accumulated listeners
- Multiple chart instances rendering to the same container
- Timers running in the background for pages that aren't visible
- Event handlers firing multiple times on subsequent visits

**Resume pattern:**

When a page is restored from cache (`fromCache: true`), it should:
- Re-bind any necessary event listeners
- Restart timers if needed
- Reinitialize charts (don't assume they still exist)
- Refresh data if needed

#### Acceptance Testing

Before considering the soft navigation refactor complete, perform this manual test:

**Test Procedure:**

1. **Load the dashboard** (`/`)
   - Verify initial load works correctly
   - Note any timers, charts, or intervals running

2. **Navigate to logs** (`/logs`)
   - Click the navigation link
   - Verify smooth transition
   - Check console for errors
   - Verify page functionality

3. **Navigate back to dashboard**
   - Click the navigation link
   - Verify smooth transition
   - Check that dashboard reinitializes correctly

4. **Repeat 5 times** - Navigate between pages
   - Dashboard → Logs → Teams → People → Dashboard
   - Each transition should be smooth
   - No console errors
   - No duplicate behavior

5. **Test browser back/forward** - Use browser buttons
   - Click back 5 times
   - Click forward 5 times
   - Verify same smooth behavior as clicking links

6. **Verify no resource leaks:**
   - Open browser DevTools
   - Check Performance/Memory tabs
   - Navigate multiple times
   - Memory should not continuously grow
   - No accumulating event listeners
   - Charts should not multiply

**Expected Results:**

✅ **No double fetches** - Each page loads data only once per visit  
✅ **No double renders** - UI updates once, not multiple times  
✅ **No duplicate handlers** - Clicking a button performs action once  
✅ **Charts work correctly** - No accumulation, resize works properly  
✅ **Timers behave correctly** - Auto-refresh and intervals work as expected  
✅ **Smooth transitions** - Crossfade animation works every time  
✅ **Back/forward work** - Browser navigation behaves same as clicking links

**Debug tip:** Add temporary console.log in mount/pause functions to count invocations during testing.

## Data Model and Nomenclature

### User Types Clarification
The system distinguishes between different types of users:

- **`system_users`** (authentication table): System accounts for accessing the telemetry UI with different roles (basic, advanced, administrator)
- **`people`** (telemetry data): Physical persons who generate telemetry events and may have multiple usernames across different organizations
- **`person_usernames`** (relationship table): Links between usernames found in events and physical persons

This distinction allows grouping telemetry data by actual people rather than by technical account names.

## Key Endpoints

### Telemetry Collection

**POST `/telemetry`**
- Receives telemetry events from MCP server instances
- Accepts JSON payloads with event data
- Stores events in PostgreSQL database
- Returns `{ "status": "ok" }` on successful receipt

### Health Monitoring

**GET `/health`** or **GET `/healthz`**
- Simple health check endpoint
- Returns `"ok"` when server is operational
- `/healthz` is provided for Kubernetes/Render compatibility
- Used by monitoring systems and load balancers

**GET `/`**
- Root endpoint showing server status
- Returns confirmation message when server is running

### Authentication

**POST `/login`**
- Authenticates users and creates sessions
- Supports database-backed multi-user authentication
- Accepts `{ "username": "user", "password": "pass" }`

**GET `/api/auth/status`**
- Checks current authentication status
- Returns user information if authenticated

**POST `/logout`**
- Ends the current session

### Analytics and Data Export

**GET `/api/events`**
- Retrieves telemetry events with pagination and filtering
- Supports filtering by date, event type, server ID, etc.
- Requires authentication

**GET `/api/export/logs`**
- Exports telemetry events in JSON Lines (JSONL) format
- Compatible with ELK Stack, Splunk, Datadog, and other log analysis tools
- Supports date range and event type filtering

**GET `/api/stats`**
- Returns telemetry statistics and aggregations
- Supports date filtering and grouping options

### User Management

**GET `/api/users`**
- Lists all system users
- Requires administrator role

**POST `/api/users`**
- Creates new system users with roles
- Requires administrator role

**DELETE `/api/users/:username`**
- Deletes system users
- Requires administrator role

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

NEVER RESTART THE SERVER AFTER CHANGES. IT HAS AUTO-RELOADING FEATURE.

### Data Storage and Environment Configuration

The project uses PostgreSQL for all environments:

| Environment | Location / Connection | Notes |
|-------------|-----------------------|-------|
| Local development | `DATABASE_URL=postgresql://localhost:5432/telemetry_local` | Local PostgreSQL database. Set `DATABASE_SSL=false` for local connections. |
| Production on Render.com | `DATABASE_URL=postgresql://<user>:<password>@<host>/<db>?sslmode=require` | Requires `DATABASE_SSL=true`. Credentials are provisioned by Render and must remain in environment secrets, not in docs. Prefer `DATABASE_INTERNAL_URL` for faster internal networking within same region. |

Key `.env` variables:

- `TELEMETRY_UI_URL`: Full URL to the event log UI (set to Render URL in production, `http://localhost:3100/logs` locally).
- `DATABASE_URL`: PostgreSQL connection string (external URL - used when DATABASE_INTERNAL_URL is not set).
- `DATABASE_INTERNAL_URL`: Internal connection string for PostgreSQL (preferred for Render.com services in same region). When set, this URL will be used instead of DATABASE_URL for faster internal networking.
- `DATABASE_SSL`: Enable SSL for PostgreSQL (true/false). Note: SSL is automatically disabled when using DATABASE_INTERNAL_URL.
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
- Database migrations run automatically on startup

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
