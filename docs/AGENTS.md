# Agent Instructions for IBM Salesforce Context Telemetry Server

This document provides instructions for AI agents working with the IBM Salesforce Context Telemetry Server.

## Overview

The IBM Salesforce Context Telemetry Server is a backend service that collects telemetry data from IBM Salesforce Context MCP server instances. It provides REST API endpoints for receiving telemetry events and monitoring server health.

## Key Endpoints

### Telemetry Collection

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

## Development Guidelines

### Adding New Features

When extending the telemetry server:

1. **Maintain Privacy**: Ensure all telemetry data handling follows privacy best practices
2. **Error Handling**: Implement proper error handling and logging
3. **Validation**: Validate incoming telemetry data structure
4. **Scalability**: Consider performance implications for high-volume scenarios
5. **Documentation**: Update this file and README.md when adding features

### Data Storage

The server stores telemetry events and user data in a database:

- **SQLite** (default) - File-based database for development
- **PostgreSQL** - Production-ready database for high-volume deployments
- Both databases automatically create required tables on initialization:
  - `telemetry_events` - Stores telemetry event data
  - `users` - Stores user authentication data

When implementing additional storage:

- Consider using a database (PostgreSQL, MongoDB) for structured queries
- Use cloud storage (S3, Azure Blob) for large datasets or logs
- Implement data retention policies
- Ensure compliance with data protection regulations

### Security Considerations

- Validate all incoming requests
- Implement rate limiting to prevent abuse
- Use HTTPS in production
- Sanitize and validate all input data
- Authentication and authorization are implemented

### Authentication

The server supports two authentication methods:

1. **Environment Variables** (single user, backward compatible):
   - `ADMIN_USERNAME` - Admin username (default: `admin`)
   - `ADMIN_PASSWORD` - Plain password (will be hashed on first use)
   - `ADMIN_PASSWORD_HASH` - Bcrypt password hash (recommended for production)

2. **Database Users** (multiple users, recommended for production):
   - Users are stored in the `users` table in the database
   - Supports multiple users with individual passwords
   - Passwords are hashed using bcrypt
   - Last login timestamps are tracked

**User Management API Endpoints:**
- `GET /api/users` - List all users (requires authentication)
- `POST /api/users` - Create a new user (requires authentication)
- `DELETE /api/users/:username` - Delete a user (requires authentication)
- `PUT /api/users/:username/password` - Update user password (requires authentication)

**Creating Users:**
- Via script: `npm run create-user <username> <password>`
- Via API: `POST /api/users` with `{"username": "...", "password": "..."}`
- Via environment variables: `ADMIN_USERNAME` and `ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH`

**Authentication Priority:**
1. First checks database users
2. Falls back to environment variables if no database users exist
3. Maintains backward compatibility with existing deployments

### Monitoring and Observability

- Log important events and errors
- Monitor endpoint response times
- Track telemetry volume and patterns
- Set up alerts for server health issues

## User Interface

The telemetry server includes a web-based user interface built with:

- **HTML/CSS/JavaScript** for the frontend
- **Tailwind CSS** for styling
- **Font Awesome** for icons
- **ECharts** (version 6.0.0) for data visualization

### Pages

The application consists of three main pages:

1. **Login Page** (`/login`)
   - User authentication interface
   - Supports username and password login

2. **Dashboard** (`/`)
   - Overview page showing telemetry statistics
   - Displays charts with event data over time
   - Time range selector (7, 15, 30, or 90 days)
   - Accessible to all authenticated users
   - Includes the preferences menu (accessible via wrench icon)

3. **Event Logs** (`/logs`)
   - Main interface for viewing detailed telemetry events
   - Two-column layout:
     - **Left column**: Sidebar with tabs to switch between:
       - **Sessions tab**: List of all sessions with session ID, date, and user information
       - **Users tab**: List of all users with user information and date
     - **Right column**: Main content area with:
       - **Activity chart**: Visual representation of session activity over time
       - **Events table**: Detailed table showing all telemetry events with filtering capabilities
   - Advanced filtering options for event types and users
   - Accessible to users with "advanced" role
   - Includes the preferences menu (accessible via wrench icon)

### Preferences Menu

The **preferences menu** (also referred to as the user menu) is a dropdown menu accessible from both the Dashboard and Event Logs pages. It is triggered by clicking the wrench icon in the top navigation bar. The menu provides the following options:

- **User information**: Displays the currently logged-in username
- **Theme toggle**: Switch between light and dark themes
- **Clear local data**: Clear all local browser data (theme preferences, filters, etc.)
- **Delete all events**: Delete all telemetry events from the database (requires advanced role)
- **Logout**: Sign out of the current session

The menu uses Font Awesome icons for visual representation and is styled consistently across both pages.

### Frontend Architecture

- CSS is compiled from `input.css` using Tailwind CSS
- JavaScript modules handle authentication, data fetching, and UI interactions
- Responsive design with dark mode support
- Session and user data displayed with formatted dates and user names

## Integration with IBM Salesforce Context

The IBM Salesforce Context MCP server can be configured to send telemetry to this server by:

1. Setting the telemetry endpoint URL in the MCP server configuration
2. Ensuring the MCP server has network access to the telemetry server
3. Verifying the telemetry format matches expected schema

## Testing

When testing the telemetry server:

- Test with various telemetry event formats
- Verify error handling for malformed requests
- Test health endpoints for monitoring integration
- Validate response times under load

## Deployment

The server is designed to run on platforms like Render, Heroku, or any Node.js hosting service:

- Set the `PORT` environment variable if needed
- Ensure the service can handle concurrent requests
- Configure appropriate resource limits
- Set up monitoring and logging

## Future Enhancements

Potential improvements to consider:

- Real-time analytics dashboard
- Data aggregation and reporting
- Anonymization and privacy-preserving techniques
- Support for multiple telemetry formats
- Webhook notifications for specific events
- Rate limiting and throttling
- User roles and permissions
- Password reset functionality
