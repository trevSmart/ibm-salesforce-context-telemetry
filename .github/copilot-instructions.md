# GitHub Copilot Instructions for IBM Salesforce Context Telemetry Server

This file provides guidance for GitHub Copilot when working on the IBM Salesforce Context Telemetry Server. For comprehensive agent instructions, also refer to [AGENTS.md](../AGENTS.md) in the repository root.

**Mandatory**: Whenever you take a browser snapshot while coding, share a link to the image with the user.

## Project Overview

The IBM Salesforce Context Telemetry Server is a Node.js/Express backend service that collects telemetry data from IBM Salesforce Context MCP server instances. It provides:

- REST API endpoints for telemetry collection
- Web dashboard for viewing and analyzing events
- Multi-user authentication with role-based permissions
- Database storage (SQLite for development, PostgreSQL for production)
- Desktop Electron viewer for offline monitoring
- Export capabilities in standard formats (JSON Lines/JSONL)

**Production Deployment**: https://ibm-salesforce-context-telemetry.onrender.com

## Repository Structure

```
.
├── src/
│   ├── index.js              # Main server entry point
│   ├── api/                  # API specifications and schemas
│   ├── auth/                 # Authentication and session management
│   ├── storage/              # Database operations (SQLite/PostgreSQL)
│   ├── scripts/              # Utility scripts (user management, data generation)
│   ├── electron.js           # Desktop Electron app entry point
│   ├── utils/                # Shared utilities (performance, caching)
│   └── types/                # TypeScript definitions
├── public/                   # Frontend web assets
│   ├── index.html            # Main dashboard
│   ├── event-log.html        # Event log viewer
│   ├── login.html            # Login page
│   ├── teams.html            # Team management page
│   ├── health.html           # Health status page
│   ├── css/                  # Stylesheets (Tailwind CSS)
│   └── js/                   # Frontend JavaScript
├── docs/                     # Documentation (additional copies)
├── AGENTS.md                 # Agent instructions (canonical - at root)
├── API_SPECIFICATION.md      # API docs (canonical - at root)
├── INTEGRATION.md            # Integration guide (canonical - at root)
├── README.md                 # Main readme (root only)
└── .github/
    ├── copilot-instructions.md  # This file
    └── workflows/            # GitHub Actions workflows
```

**Note**: Some documentation files exist in both root and `docs/` directories. The root-level versions are canonical and should be updated first. The `docs/` directory contains additional documentation and some duplicate files for organizational purposes.

## Key Technologies

- **Backend**: Node.js, Express.js (v5)
- **Database**: SQLite (development), PostgreSQL (production)
- **Frontend**: Vanilla JavaScript, Tailwind CSS v4
- **Desktop**: Electron
- **Build Tools**: Tailwind CLI, ESLint, TypeScript (for type checking)

## Development Workflow

### Getting Started

```bash
# Install dependencies
npm install

# Run development server with live reload
npm run dev

# Run production build
npm start
```

### Common Commands

```bash
# Linting
npm run lint              # Run ESLint + TypeScript checks
npm run lint:fix          # Auto-fix ESLint issues

# CSS Build
npm run build:css         # Build Tailwind CSS
npm run dev:css           # Watch mode for CSS

Tailwind CSS documentation and reference are available via the Context7 MCP server using the `get-library-docs` tool with `context7CompatibleLibraryID: "/websites/tailwindcss_com-plus-ui-blocks-documentation"`.

# User Management
npm run create-user <username> <password> [role]
npm run update-user-role <username> <role>
npm run generate-password-hash <password>

# Desktop Electron Viewer
npm run start:electron    # Launch desktop viewer
npm run dist:mac          # Build macOS app (.app + .dmg)

# Database Management
npm run export-database   # Export data to JSON
npm run import-database   # Import data from JSON
```

### Testing

The server includes:
- API endpoint validation with Ajv/JSON Schema
- Health check endpoint at `/health`
- Manual testing via curl or the web dashboard

```bash
# Test server is running
curl http://localhost:3100/

# Test health check
curl http://localhost:3100/health

# Send test telemetry
curl -X POST http://localhost:3100/telemetry \
  -H "Content-Type: application/json" \
  -d '{"event":"tool_call","timestamp":"2024-01-15T10:30:00.000Z","data":{}}'
```

## Coding Standards and Conventions

### JavaScript Style

- **ESLint Configuration**: Uses `@eslint/js` with custom rules
- **Indentation**: 2 spaces
- **Quotes**: Single quotes for strings
- **Semicolons**: Required
- **Line endings**: Unix (LF)
- **Unused variables**: Prefix with underscore (`_`) to ignore warnings

### Code Organization

- **Module System**: CommonJS (`require`/`module.exports`)
- **Error Handling**: Always use try-catch for async operations
- **Logging**: Use `console.log`, `console.error` (no logger framework currently)
- **Environment Variables**: Load via `dotenv`, validate required vars

### Naming Conventions

- **Files**: kebab-case (e.g., `database.js`, `auth-middleware.js`)
- **Functions**: camelCase (e.g., `getUserById`, `validateInput`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_API_LIMIT`, `PORT`)
- **Classes**: PascalCase (e.g., `Cache`, `Database`)

### Frontend Patterns

- **No Framework**: Vanilla JavaScript for frontend
- **CSS Framework**: Tailwind CSS v4 with custom configuration
- **DOM Manipulation**: Direct DOM APIs, no jQuery
- **Event Listeners**: Avoid adding listeners in render functions; use inline `onclick` or add once on page load
- **Modal Animations**: Use `requestAnimationFrame` for adding `.visible` class to enable CSS transitions

### Database Conventions

- **Dual Database Support**: SQLite (dev) and PostgreSQL (production)
- **Connection**: Managed by `src/storage/database.js`
- **Environment Config**:
  - `DB_TYPE`: `sqlite` or `postgresql`
  - `DB_PATH`: SQLite file path (e.g., `./data/telemetry.db`)
  - `DATABASE_URL`: PostgreSQL connection string
  - `DATABASE_SSL`: Enable SSL for PostgreSQL (`true`/`false`)

### Authentication and Security

- **Multi-User Support**: Database-backed authentication with bcrypt
- **Session Management**: Express sessions with PostgreSQL/SQLite store
- **Roles**: `basic`, `advanced`, `administrator`
- **Password Hashing**: Use bcrypt (10 rounds)
- **HTTPS**: Always use `secure` cookies in production
- **Input Validation**: Validate all incoming requests against JSON schemas

## Important Patterns and Best Practices

### Performance

- **Caching**: Use the `Cache` utility class (in `src/utils/performance.js`)
- **Pagination**: Always paginate large result sets (default: 50 items)
- **Limits**: Enforce max limits on API endpoints (e.g., 1000 events)
- **Compression**: Enable gzip compression for responses

### Privacy and Data Handling

- **No PII**: Never log or store personally identifiable information
- **Data Retention**: Consider implementing automatic data expiration
- **Telemetry Opt-out**: Respect user privacy preferences
- **Sanitization**: Validate and sanitize all user inputs

### Error Handling

```javascript
try {
  // Your code here
} catch (error) {
  console.error('Error description:', error);
  return res.status(500).json({
    status: 'error',
    message: 'User-friendly error message'
  });
}
```

### API Response Format

```javascript
// Success
{ status: 'ok', data: {...}, message: 'Optional message' }

// Error
{ status: 'error', message: 'Error description' }
```

### Database Queries

- Always use parameterized queries to prevent SQL injection
- Handle both SQLite and PostgreSQL syntax differences
- Use transactions for multi-step operations
- Close connections properly

### Frontend Development

- **CSS Build**: Always run `npm run build:css` before committing
- **Live Reload**: Use `npm run dev` for development with auto-reload
- **Browser Support**: Target modern browsers (ES6+)
- **Responsive Design**: Use Tailwind responsive utilities

## Common Tasks

### Adding a New API Endpoint

1. Add route handler in `src/index.js` or relevant module
2. Add authentication middleware if needed (e.g., `auth.requireAuth`)
3. Validate inputs (use Ajv or manual validation)
4. Update API specification in `API_SPECIFICATION.md` (canonical version at root)
5. Add examples to README.md if public-facing

### Adding a Database Column

1. Update table creation SQL in `src/storage/database.js`
2. Add migration logic for existing databases
3. Update TypeScript definitions in `src/types/`
4. Test with both SQLite and PostgreSQL

### Modifying Authentication

1. Update `src/auth/auth.js` for core authentication logic
2. Update session configuration if needed
3. Test login/logout flows
4. Update documentation in README.md

### Adding User Roles/Permissions

1. Define new role in `src/auth/auth.js`
2. Update middleware to check permissions
3. Update UI to show/hide features based on role
4. Document in README.md under "Permission Levels"

## File-Specific Guidelines

### `src/index.js`

- Main server file, keep routes organized
- Add middleware in correct order
- Use `auth.requireAuth` for protected routes
- Keep startup logic clean and well-commented

### `src/storage/database.js`

- Abstract database operations
- Support both SQLite and PostgreSQL
- Always use parameterized queries
- Export clear, documented functions

### `public/js/*.js`

- No bundler; keep files standalone
- Avoid global namespace pollution
- Use IIFE or modules where appropriate
- Comment complex DOM manipulation

### Frontend HTML Files

- Use semantic HTML5
- Include Tailwind CSS (`/css/output.css`)
- Maintain consistent structure across pages
- Add `data-*` attributes for JavaScript hooks

## Environment Configuration

Create a `.env` file from `.env.example`:

```bash
cp .env.example .env
```

**Key Variables:**

- `PORT`: Server port (default: 3100)
- `DB_TYPE`: `sqlite` or `postgresql`
- `DB_PATH`: SQLite file path
- `DATABASE_URL`: PostgreSQL connection string
- `DATABASE_SSL`: PostgreSQL SSL setting
- `ADMIN_USERNAME`: Admin user
- `ADMIN_PASSWORD_HASH`: Admin password hash
- `SESSION_SECRET`: Session encryption key
- `TELEMETRY_UI_URL`: URL for Electron viewer

## Deployment Considerations

### Render.com (Production)

- Use PostgreSQL (SQLite doesn't persist)
- Set environment variables in Render dashboard
- Enable auto-deploy from `main` branch
- Configure health check endpoint: `/health`
- Use Render's PostgreSQL add-on

### Docker

- Not currently containerized
- Future: Consider adding `Dockerfile` and `docker-compose.yml`

## Documentation

### Root-Level Documentation (Canonical)
- **README.md**: User-facing documentation (root only)
- **AGENTS.md**: Comprehensive agent instructions (canonical version at root)
- **API_SPECIFICATION.md**: Complete API documentation (canonical version at root)
- **INTEGRATION.md**: Integration guide for MCP servers (canonical version at root)
- **SETUP.md**: Quick setup reference (canonical version at root)
- **PERFORMANCE.md**: Performance considerations (root only)

### docs/ Directory (Additional Documentation)
- **docs/SETUP.md**: Detailed deployment guide
- **docs/DATABASE.md**: Database configuration details
- **docs/RENDER_DEPLOYMENT.md**: Render-specific deployment guide
- **docs/DATABASE_EXPIRATION.md**: Data expiration policies
- **docs/LOG_FORMATS.md**: Standard log formats

**Important**: When updating documentation, always update the root-level canonical files first. Some files exist in both locations for organizational purposes, but the root versions are authoritative.

## Related Projects

- [IBM Salesforce Context](https://github.com/trevSmart/ibm-salesforce-context) - Main MCP server

## When in Doubt

1. Check existing code patterns in similar files
2. Review README.md for user-facing behavior
3. Consult AGENTS.md for detailed agent guidance
4. Run linters to catch style issues: `npm run lint`
5. Test locally before suggesting changes
6. Consider security implications of all changes
7. Ask for clarification if requirements are unclear

## Quick Reference

| Task | Command |
|------|---------|
| Install dependencies | `npm install` |
| Start dev server | `npm run dev` |
| Build production | `npm start` |
| Run linter | `npm run lint` |
| Fix lint issues | `npm run lint:fix` |
| Build CSS | `npm run build:css` |
| Create user | `npm run create-user <username> <password> [role]` |
| Launch Electron | `npm run start:electron` |
| Test endpoint | `curl http://localhost:3100/` |

---

**Remember**: Make minimal, surgical changes. Always validate security, test thoroughly, and maintain backward compatibility.
