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

Currently, telemetry events are logged to the console. When implementing persistent storage:

- Consider using a database (PostgreSQL, MongoDB) for structured queries
- Use cloud storage (S3, Azure Blob) for large datasets or logs
- Implement data retention policies
- Ensure compliance with data protection regulations

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
- Authentication and authorization
