const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

/**
 * Loads TELEMETRY_UI_URL from the most relevant .env file.
 */
const loadEnv = () => {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '.env')
  ];

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, '.env'));
  }

  let loadedFrom = null;
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      loadedFrom = envPath;
      break;
    }
  }

  if (loadedFrom) {
    console.info(`[Electron] Loaded environment from ${loadedFrom}`);
  } else {
    console.warn('[Electron] No .env file found, using default configuration.');
  }
};

loadEnv();

/**
 * Creates the desktop window that displays the existing event log UI.
 */
const uiUrl = process.env.TELEMETRY_UI_URL || 'http://localhost:3100/event-log';

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#050816',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Prefer loading the UI from the running Express server so the relative
  // /api/* requests keep working. If the backend is down, fall back to the
  // local file so at least the shell opens (it will still show fetch errors).
  mainWindow.loadURL(uiUrl).catch(error => {
    console.error(`Failed to load ${uiUrl}, falling back to static file:`, error);
    mainWindow.loadFile(path.join(__dirname, 'public', 'event-log.html'));
  });
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
