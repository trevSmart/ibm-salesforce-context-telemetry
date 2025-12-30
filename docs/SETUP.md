# Telemetry Server Setup Guide

This guide explains step by step how to set up and deploy the telemetry server.

## 📋 Prerequisites

Before starting, make sure you have installed:

- **Node.js** (version 18 or higher)
  - Check if you have it: `node --version`
  - If not, download from: https://nodejs.org/

- **npm** (usually comes with Node.js)
  - Check if you have it: `npm --version`

- **PostgreSQL** (required for all installations)
  - For local development: Install PostgreSQL on your system
  - For production: Use a service like Render PostgreSQL

## 🚀 Step 1: Install Dependencies

Open a terminal in the project folder and run:

```bash
npm install
```

This will install all necessary libraries (express, cors, etc.) in the `node_modules/` folder.

## 🧪 Step 2: Test the Server Locally

### Run the server

```bash
npm start
```

You should see a message like:
```
Telemetry server listening on port 3100
```

### Test that it works

Open another terminal and test the endpoints:

**1. Test the main endpoint:**
```bash
curl http://localhost:3100/
```

You should see: `MCP Telemetry server is running ✅`

**2. Test the health endpoint:**
```bash
curl http://localhost:3100/health
```

You should see: `ok`

**3. Test the telemetry endpoint (POST):**
```bash
curl -X POST http://localhost:3100/telemetry \
  -H "Content-Type: application/json" \
  -d '{"event":"test","timestamp":"2024-01-15T10:30:00.000Z"}'
```

You should see: `{"status":"ok"}`

The event will be stored in the PostgreSQL database.

### Stop the server

Press `Ctrl + C` in the terminal where the server is running to stop it.

## 🌐 Step 3: Configure the Database

The server requires PostgreSQL to function.

### For local development:

**macOS (with Homebrew):**
```bash
brew install postgresql@16
brew services start postgresql@16
createdb telemetry_local
```

**Configure environment variables:**
Create a `.env` file:
```bash
DATABASE_URL=postgresql://localhost:5432/telemetry_local
DATABASE_SSL=false
```

### For production (Render):

**📖 Complete guide**: See [RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md) for detailed instructions on configuring PostgreSQL on Render.

### Quick summary:

1. **Create PostgreSQL database** on Render
2. **Configure environment variables**:
   - `DATABASE_URL=<Internal Database URL from Render>` (or preferably `DATABASE_INTERNAL_URL`)
   - `DATABASE_SSL=true`
3. **Deploy** the web service

## 🔧 Advanced Configuration

### Environment Variables

Create a `.env` file to configure the server:

```bash
# Server port (optional, defaults to 3100)
PORT=3100

# PostgreSQL database (required)
DATABASE_URL=postgresql://localhost:5432/telemetry_local
DATABASE_SSL=false

# For production on Render:
# DATABASE_URL=<Render PostgreSQL URL>
# DATABASE_SSL=true
# DATABASE_INTERNAL_URL=<Render internal PostgreSQL URL>
```

### Change the port locally

If you want to run the server on a different port:

```bash
PORT=8080 npm start
```

### Run in background

If you want the server to keep running after closing the terminal:

**macOS/Linux:**
```bash
nohup npm start &
```

Or use `pm2` to manage the process:
```bash
npm install -g pm2
pm2 start npm -- run start
pm2 list  # See active processes
pm2 stop 0  # Stop
```

## 🐛 Troubleshooting

### Error: "Port already in use"

If port 3100 is occupied:

1. Find which process is using it:
   ```bash
   lsof -i :3100
   ```
2. Kill the process or change the port:
   ```bash
   PORT=3001 npm start
   ```

### Error: "Cannot find module"

Make sure you have run `npm install` before `npm start`.

### Server not responding

1. Check that the server is running (you should see the "listening" message)
2. Check that there are no errors in the terminal
3. Verify that PostgreSQL is running and accessible
4. Check the database environment variables
5. Try restarting the server

### Database connection error

If you see PostgreSQL-related errors:

1. Make sure PostgreSQL is installed and running
2. Check that the database exists: `createdb telemetry_local`
3. Verify credentials in the `.env` file
4. For production, make sure `DATABASE_SSL=true`

## 📝 Next Steps

Once the server is running:

1. **Connect the MCP server**: Configure the IBM Salesforce Context MCP server to send telemetry to this URL
2. **Create users**: Use the scripts to create user accounts with different roles
3. **Explore the dashboard**: Access the web dashboard to view telemetry data
4. **Configure exports**: Use the export endpoint to get data in JSONL format

## 💡 Tips

- **Local development**: Always test locally before deploying
- **Database**: PostgreSQL is required - configure it correctly before starting
- **Authentication**: Create at least one administrator user to access the dashboard
- **Logs**: Check the logs on Render to see what's happening
- **Versions**: Make sure the Node.js version on Render is compatible
- **Free tier**: The free plan on Render may "sleep" after inactivity. The first time may take a few seconds to "wake up"

## 🆘 Need Help?

If you have problems:
1. Check the server logs
2. Make sure PostgreSQL is running and accessible
3. Verify the environment variables in the `.env` file
4. Make sure all dependencies are installed (`npm install`)
5. Make sure the port is not occupied
6. For Render: verify that the database URL is correct
