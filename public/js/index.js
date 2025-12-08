// @ts-nocheck
// Dashboard constants
const SESSION_START_SERIES_COLOR = '#2195cf';
const TOP_USERS_LOOKBACK_DAYS = 3;
const TOP_USERS_LIMIT = 3;
const TOP_TEAMS_LOOKBACK_DAYS = 30;
const TOP_TEAMS_LIMIT = 5;
const SERVER_VERSION_LABEL = 'v1.0.0';
const REFRESH_ICON_ANIMATION_DURATION_MS = 700;
let serverStatsLastFetchTime = null;
let serverStatsUpdateIntervalId = null;
let autoRefreshEnabledState = false;
let autoRefreshIntervalMinutes = '';

function normalizeColorToHex(value) {
  if (!value) {
    return null;
  }
  const probe = document.createElement('span');
  probe.style.position = 'absolute';
  probe.style.opacity = '0';
  probe.style.pointerEvents = 'none';
  probe.style.color = value.trim();
  document.body.appendChild(probe);
  const computed = window.getComputedStyle(probe).color;
  probe.remove();
  const match = computed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) {
    return null;
  }
  const [, r, g, b] = match;
  const toHex = (num) => Number(num).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function attachColorPicker(textInput) {
  const defaultColor = '#2195cf';
  if (!textInput) {
    return { setValue: () => {}, getValue: () => '' };
  }
  if (textInput._colorPickerApi) {
    return textInput._colorPickerApi;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'color-picker-field';
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.gap = '8px';
  wrapper.style.marginTop = '2px';

  textInput.parentNode.insertBefore(wrapper, textInput);
  wrapper.appendChild(textInput);
  textInput.style.flex = '1 1 auto';

  const pickerButton = document.createElement('button');
  pickerButton.type = 'button';
  pickerButton.className = 'color-picker-button';
  pickerButton.style.display = 'inline-flex';
  pickerButton.style.alignItems = 'center';
  pickerButton.style.gap = '8px';
  pickerButton.style.padding = '6px 10px';
  pickerButton.style.borderRadius = '6px';
  pickerButton.style.border = '1px solid var(--border-color)';
  pickerButton.style.background = 'var(--bg-secondary)';
  pickerButton.style.color = 'var(--text-primary)';
  pickerButton.style.fontSize = '0.8rem';
  pickerButton.style.cursor = 'pointer';

  const swatch = document.createElement('span');
  swatch.style.width = '14px';
  swatch.style.height = '14px';
  swatch.style.borderRadius = '999px';
  swatch.style.border = '1px solid var(--border-color)';
  swatch.style.background = 'transparent';

  const valueLabel = document.createElement('span');
  valueLabel.textContent = 'Pick color';

  const hiddenColorInput = document.createElement('input');
  hiddenColorInput.type = 'color';
  hiddenColorInput.value = defaultColor;
  hiddenColorInput.style.position = 'absolute';
  hiddenColorInput.style.opacity = '0';
  hiddenColorInput.style.pointerEvents = 'none';
  hiddenColorInput.style.width = '0';
  hiddenColorInput.style.height = '0';
  hiddenColorInput.tabIndex = -1;

  pickerButton.appendChild(swatch);
  pickerButton.appendChild(valueLabel);
  wrapper.appendChild(pickerButton);
  wrapper.appendChild(hiddenColorInput);

  function updateSwatchFromText() {
    const normalized = normalizeColorToHex(textInput.value.trim());
    const nextColor = normalized || defaultColor;
    swatch.style.background = nextColor;
    valueLabel.textContent = normalized || 'Pick color';
    hiddenColorInput.value = nextColor;
  }

  pickerButton.addEventListener('click', () => {
    hiddenColorInput.click();
  });

  hiddenColorInput.addEventListener('input', () => {
    textInput.value = hiddenColorInput.value;
    updateSwatchFromText();
  });

  textInput.addEventListener('input', updateSwatchFromText);
  updateSwatchFromText();

  const api = {
    setValue: (value) => {
      textInput.value = value || '';
      updateSwatchFromText();
    },
    getValue: () => textInput.value.trim()
  };

  textInput._colorPickerApi = api;
  return api;
}

// Helper function to escape HTML
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTimeAgo(timestamp) {
  if (!timestamp) {
    return 'never';
  }
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 10) {
    return 'just now';
  }
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
  }
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  }
  if (hours < 24) {
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    }
    return `${hours}h ${remainingMinutes}min ago`;
  }
  if (days === 1) {
    const remainingHours = hours % 24;
    if (remainingHours === 0) {
      return '1 day ago';
    }
    return `1 day ${remainingHours}h ago`;
  }
  return `${days} days ago`;
}

function updateServerStatsLastUpdatedText() {
  const lastUpdatedEl = document.getElementById('serverStatsLastUpdated');
  if (lastUpdatedEl) {
    lastUpdatedEl.textContent = formatTimeAgo(serverStatsLastFetchTime);
  }
}

function startServerStatsInterval() {
  if (serverStatsUpdateIntervalId) {
    clearInterval(serverStatsUpdateIntervalId);
  }
  serverStatsUpdateIntervalId = setInterval(updateServerStatsLastUpdatedText, 60000);
}

function setServerStatsLoadTime(durationMs) {
  const loadTimeEl = document.getElementById('serverStatsLoadTime');
  if (!loadTimeEl) {
    return;
  }
  if (Number.isFinite(durationMs)) {
    const clamped = Math.max(0, Math.round(durationMs));
    loadTimeEl.textContent = `${clamped}ms`;
  } else {
    loadTimeEl.textContent = '-';
  }
}

function setServerStatsVersion() {
  const versionEl = document.getElementById('serverStatsVersion');
  if (versionEl) {
    versionEl.textContent = SERVER_VERSION_LABEL;
  }
}

function resetServerStatsUi() {
  serverStatsLastFetchTime = null;
  if (serverStatsUpdateIntervalId) {
    clearInterval(serverStatsUpdateIntervalId);
    serverStatsUpdateIntervalId = null;
  }
  updateServerStatsLastUpdatedText();
  setServerStatsLoadTime(null);
  const dbSizeElement = document.getElementById('serverStatsDbSize');
  if (dbSizeElement) {
    dbSizeElement.textContent = '-';
    dbSizeElement.style.color = '';
  }
}

function recordServerStatsFetch(durationMs) {
  serverStatsLastFetchTime = Date.now();
  updateServerStatsLastUpdatedText();
  if (!serverStatsUpdateIntervalId) {
    startServerStatsInterval();
  }
  if (Number.isFinite(durationMs)) {
    setServerStatsLoadTime(durationMs);
  }
}

async function loadDashboardDatabaseSize() {
  try {
    const response = await fetch('/api/database-size', {
      credentials: 'include'
    });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    if (data?.status !== 'ok') {
      return;
    }
    const displayText = data.displayText || data.sizeFormatted;
    const dbSizeElement = document.getElementById('serverStatsDbSize');
    if (dbSizeElement && displayText) {
      dbSizeElement.textContent = displayText;
      if (data.percentage !== null && data.percentage !== undefined) {
        if (data.percentage >= 80) {
          dbSizeElement.style.color = 'var(--level-error)';
        } else if (data.percentage >= 70) {
          dbSizeElement.style.color = 'var(--level-warning)';
        } else {
          dbSizeElement.style.color = '';
        }
      }
    }
  } catch (error) {
    console.debug('Database size not available:', error);
  }
}

// Initial bootstrap
void initializeDashboardPage();

// Initialize dashboard; reused on first load and on soft navigation
async function initializeDashboardPage({ resetState = false } = {}) {
  // Reset chart state when coming back from another page
  if (resetState && chart) {
    if (typeof chart.dispose === 'function') {
      chart.dispose();
    }
    chart = null;
  }
  if (resetState) {
    isInitialChartLoad = true;
    currentDays = 7;
    resetServerStatsUi();
    const timeRangeSelect = document.getElementById('timeRangeSelect');
    if (timeRangeSelect) {
      timeRangeSelect.value = String(currentDays);
    }
  }

  setServerStatsVersion();

  try {
    const response = await fetch('/api/auth/status', {
      credentials: 'include' // Ensure cookies are sent
    });
    const data = await response.json();
    if (!data.authenticated) {
      window.location.href = '/login';
      return;
    }

    const eventLogLink = document.getElementById('eventLogLink');
    if (eventLogLink) {
      if (data.role === 'advanced' || data.role === 'administrator') {
        eventLogLink.style.display = '';
      } else {
        eventLogLink.style.display = 'none';
      }
    }

    // Only load chart data if authenticated
    await loadChartData();
    await loadTopUsersToday();
    await loadTopTeamsToday();
    await loadDashboardDatabaseSize();

    // Set up time range selector (guard against duplicate listeners)
    const timeRangeSelect = document.getElementById('timeRangeSelect');
    if (timeRangeSelect && timeRangeSelect.dataset.dashboardInitialized !== 'true') {
      const handleTimeRangeChange = (e) => {
        const days = parseInt(e.target.value, 10);
        const resolvedDays = Number.isFinite(days) ? days : currentDays;
        loadChartData(resolvedDays);
      };
      timeRangeSelect.addEventListener('change', handleTimeRangeChange);
      timeRangeSelect.addEventListener('input', handleTimeRangeChange);
      timeRangeSelect.dataset.dashboardInitialized = 'true';
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    window.location.href = '/login';
  }
}


// User menu functions are now in user-menu.js


let deleteAllConfirmed = false;

function confirmDeleteAll() {
  if (!deleteAllConfirmed) {
    deleteAllConfirmed = true;
    openConfirmModal({
      title: 'Delete all events',
      message: 'Are you sure you want to delete ALL events? This action cannot be undone.',
      confirmLabel: 'Delete all events',
      destructive: true
    }).then((firstConfirmed) => {
      if (!firstConfirmed) {
        deleteAllConfirmed = false;
        return;
      }

      openConfirmModal({
        title: 'Final warning',
        message: 'This will permanently delete ALL events from the database.\nAre you absolutely sure?',
        confirmLabel: 'Yes, delete everything',
        destructive: true
      }).then((secondConfirmed) => {
        if (!secondConfirmed) {
          deleteAllConfirmed = false;
          return;
        }
        // Perform deletion
        deleteAllEvents();
      });
    });
  } else {
    deleteAllEvents();
  }
}

async function deleteAllEvents() {
  try {
    const response = await fetch('/api/events', {
      method: 'DELETE',
      credentials: 'include' // Ensure cookies are sent
    });

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    alert(`Successfully deleted ${data.deletedCount || 0} events.`);

    // Reset confirmation flag
    deleteAllConfirmed = false;

    // Refresh chart data
    loadChartData(currentDays);
  } catch (error) {
    console.error('Error deleting events:', error);
    alert('Error deleting events: ' + error.message);
    deleteAllConfirmed = false;
  }
}

// Detect system theme
function getSystemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  updateThemeMenuItem(theme);
}

function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const theme = savedTheme || getSystemTheme();
  applyTheme(theme);
}

function updateServerStatsVisibility() {
  const showServerStats = localStorage.getItem('showServerStats') !== 'false';
  const footer = document.querySelector('.dashboard-footer');
  if (footer) {
    footer.style.display = showServerStats ? '' : 'none';
  }
  const serverStatsCard = document.getElementById('serverStatsCard');
  if (serverStatsCard) {
    serverStatsCard.style.display = showServerStats ? '' : 'none';
  }
}


function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  const newTheme = isDark ? 'light' : 'dark';
  localStorage.setItem('theme', newTheme);
  applyTheme(newTheme);
}

function updateThemeMenuItem(theme) {
  const btn = document.getElementById('themeToggleMenuItem');
  if (!btn) {
    return;
  }

  const isDark = theme === 'dark';
  const lightThemeIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="user-menu-icon" width="16" height="16" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>
  `;
  const darkThemeIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="user-menu-icon" width="16" height="16" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
    </svg>
  `;
  const label = isDark ? 'Light theme' : 'Dark theme';
  btn.innerHTML = `${isDark ? lightThemeIcon : darkThemeIcon}${label}`;
}


function clearLocalData() {
  openConfirmModal({
    title: 'Clear local data',
    message: 'This will clear all local data stored in this browser for the telemetry UI (theme, filters, etc.).',
    confirmLabel: 'Clear data',
    destructive: true
  }).then((confirmed) => {
    if (!confirmed) {
      return;
    }
    try {
      localStorage.clear();
    } catch (error) {
      console.error('Error clearing local storage:', error);
    }
    window.location.reload();
  });
}

function openConfirmModal({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive = false }) {
  return new Promise((resolve) => {
    const existing = document.querySelector('.confirm-dialog-backdrop');
    if (existing) {
      existing.remove();
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'confirm-modal-backdrop confirm-dialog-backdrop';

    const modal = document.createElement('div');
    modal.className = 'confirm-modal confirm-dialog';
    modal.innerHTML = `
			<div class="confirm-dialog-header">
				<div class="confirm-dialog-icon ${destructive ? 'destructive' : ''}">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false">
						<path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</div>
				<div class="confirm-dialog-text">
					<div class="confirm-modal-title">${escapeHtml(title || 'Confirm action')}</div>
					<div class="confirm-modal-message">${escapeHtml(message || '')}</div>
				</div>
			</div>
			<div class="confirm-dialog-actions">
				<button type="button" class="confirm-modal-btn confirm-modal-btn-cancel">${escapeHtml(cancelLabel)}</button>
				<button type="button" class="confirm-modal-btn ${destructive ? 'confirm-modal-btn-destructive' : 'confirm-modal-btn-confirm'}">${escapeHtml(confirmLabel)}</button>
			</div>
		`;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    // Trigger enter transition on next frame
    requestAnimationFrame(() => {
      backdrop.classList.add('visible');
    });

    function animateAndResolve(result) {
      const handleTransitionEnd = (event) => {
        if (event.target !== backdrop) {
          return;
        }
        backdrop.ontransitionend = null;
        backdrop.remove();
      };

      backdrop.ontransitionend = handleTransitionEnd;
      backdrop.classList.remove('visible');
      backdrop.classList.add('hiding');

      resolve(result);
    }

    const [cancelBtn, confirmBtn] = modal.querySelectorAll('.confirm-modal-btn');
    cancelBtn.addEventListener('click', () => animateAndResolve(false));
    confirmBtn.addEventListener('click', () => animateAndResolve(true));

    document.addEventListener(
      'keydown',
      function handleKeydown(e) {
        if (e.key === 'Escape') {
          e.stopImmediatePropagation();
          e.preventDefault();
          document.removeEventListener('keydown', handleKeydown);
          if (document.body.contains(backdrop)) {
            animateAndResolve(false);
          }
        }
      }
    );
  });
}

// Settings modal & org–client–team mapping

// Cache for org-team mappings to avoid repeated API calls
let orgTeamMappingsCache = null;
let mappingsCacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getOrgTeamMappings() {
  // Check cache first
  if (orgTeamMappingsCache && mappingsCacheTimestamp &&
      (Date.now() - mappingsCacheTimestamp) < CACHE_DURATION) {
    return orgTeamMappingsCache;
  }

  try {
    const response = await fetch('/api/settings/org-team-mappings', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.status === 'ok') {
      orgTeamMappingsCache = data.mappings || [];
      mappingsCacheTimestamp = Date.now();
      return orgTeamMappingsCache;
    } else {
      console.error('Error fetching org-team mappings:', data.message);
      return [];
    }
  } catch (error) {
    console.error('Error fetching org-team mappings from API:', error);
    return [];
  }
}

async function saveOrgTeamMappings(mappings) {
  try {
    const response = await fetch('/api/settings/org-team-mappings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin',
      body: JSON.stringify({ mappings: mappings || [] })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.status === 'ok') {
      // Clear cache to force refresh on next read
      orgTeamMappingsCache = null;
      mappingsCacheTimestamp = null;
      return true;
    } else {
      console.error('Error saving org-team mappings:', data.message);
      return false;
    }
  } catch (error) {
    console.error('Error saving org-team mappings to API:', error);
    return false;
  }
}

function ensureUserMenuStructure() {
  const userMenu = document.getElementById('userMenu');
  if (!userMenu || userMenu.dataset.initialized === 'true') {
    return;
  }

  const buildTemplate = window.buildUserMenuTemplate;
  if (typeof buildTemplate === 'function') {
    userMenu.innerHTML = buildTemplate();
    userMenu.dataset.initialized = 'true';
  }
}

// Shared settings modal used by both dashboard and event log pages

async function openSettingsModal() {
  const existing = document.querySelector('.confirm-modal-backdrop.settings-backdrop');
  if (existing) {
    return;
  }

  // Check user role first
  let userRole = 'basic';
  try {
    const authResponse = await fetch('/api/auth/status', {
      credentials: 'include'
    });
    if (authResponse.ok) {
      const authData = await authResponse.json();
      userRole = authData.role || 'basic';
    }
  } catch (error) {
    console.error('Error checking auth status:', error);
  }

  const isAdministrator = userRole === 'administrator';
  const canDeleteAllEvents = userRole === 'advanced' || userRole === 'administrator';

  const backdrop = document.createElement('div');
  backdrop.className = 'confirm-modal-backdrop settings-backdrop';

  const modal = document.createElement('div');
  modal.className = 'confirm-modal settings-modal';

  // Get current settings
  const savedTheme = localStorage.getItem('theme') || getSystemTheme();
  const isDarkTheme = savedTheme === 'dark';
  const showServerStats = localStorage.getItem('showServerStats') !== 'false';
  const autoRefreshEnabled = autoRefreshEnabledState;
  const autoRefreshInterval = autoRefreshIntervalMinutes;

  // Build sidebar navigation
  const sidebarNav = `
    <a href="#settings-appearance" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-[color:var(--text-secondary)] hover:text-(--text-primary) hover:bg-(--bg-secondary)">
      <span class="w-4 h-4 flex items-center justify-center rounded-full border border-(--border-color) bg-[color:var(--bg-secondary)]">
        <i class="fa-regular fa-moon text-[10px]"></i>
      </span>
      <span class="font-medium">Appearance</span>
    </a>
    <a href="#settings-events" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-secondary)">
      <span class="w-4 h-4 flex items-center justify-center rounded-full border border-(--border-color) bg-(--bg-secondary)">
        <i class="fa-solid fa-chart-line text-[10px]"></i>
      </span>
      <span class="font-medium">Events</span>
    </a>
    <a href="#settings-teams" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-secondary)">
      <span class="w-4 h-4 flex items-center justify-center rounded-full border border-(--border-color) bg-[color:var(--bg-secondary)]">
        <i class="fa-solid fa-users text-[10px]"></i>
      </span>
      <span class="font-medium">Teams</span>
    </a>
    ${isAdministrator ? `
    <a href="#settings-users" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-secondary)]">
      <span class="w-4 h-4 flex items-center justify-center rounded-full border border-[color:var(--border-color)] bg-[color:var(--bg-secondary)]">
        <i class="fa-solid fa-user-gear text-[10px]"></i>
      </span>
      <span class="font-medium">Users</span>
    </a>
    ` : ''}
    <a href="#settings-danger" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-secondary)]">
      <span class="w-4 h-4 flex items-center justify-center rounded-full border border-[color:var(--border-color)] bg-[color:var(--bg-secondary)]">
        <i class="fa-solid fa-triangle-exclamation text-[10px]"></i>
      </span>
      <span class="font-medium">Danger zone</span>
    </a>
  `;

  modal.innerHTML = `
		<div class="settings-modal-header">
			<div class="confirm-modal-title">Settings</div>
		</div>
		<div class="settings-modal-content">
			<div class="settings-layout flex flex-col md:flex-row md:gap-8 mt-2">
				<aside class="settings-sidebar-nav md:w-56 border-b md:border-b-0 md:border-r border-[color:var(--border-color)] pb-3 md:pb-0 md:pr-3">
					<nav class="flex md:flex-col gap-2 text-sm" aria-label="Settings sections">
						${sidebarNav}
					</nav>
				</aside>
				<div class="settings-main flex-1 flex flex-col gap-4 mt-3 md:mt-0">
					<section id="settings-appearance" class="settings-section">
						<div class="settings-modal-placeholder-title">Appearance</div>
						<label class="flex items-center justify-between cursor-pointer py-2">
							<div class="flex flex-col">
								<span class="text-sm font-medium text-(--text-primary)">Show server stats</span>
								<span class="text-xs text-[color:var(--text-secondary)]">Display server information in the footer (last updated, load time, version, etc.).</span>
							</div>
							<div class="group relative inline-flex w-11 shrink-0 rounded-full bg-gray-200 p-0.5 inset-ring inset-ring-gray-900/5 outline-offset-2 outline-indigo-600 transition-colors duration-200 ease-in-out has-checked:bg-indigo-600 has-focus-visible:outline-2">
								<span class="size-5 rounded-full bg-white shadow-xs ring-1 ring-gray-900/5 transition-transform duration-200 ease-in-out group-has-checked:translate-x-5"></span>
								<input type="checkbox" id="showServerStatsToggle" ${showServerStats ? 'checked' : ''} aria-label="Show server stats" class="absolute inset-0 appearance-none focus:outline-hidden">
							</div>
						</label>
						<label class="flex items-center justify-between cursor-pointer py-2">
							<div class="flex flex-col">
								<span class="text-sm font-medium text-[color:var(--text-primary)]">Dark theme</span>
								<span class="text-xs text-(--text-secondary)">Switch between light and dark color scheme.</span>
							</div>
							<div class="group relative inline-flex w-11 shrink-0 rounded-full bg-gray-200 p-0.5 inset-ring inset-ring-gray-900/5 outline-offset-2 outline-indigo-600 transition-colors duration-200 ease-in-out has-checked:bg-indigo-600 has-focus-visible:outline-2">
								<span class="size-5 rounded-full bg-white shadow-xs ring-1 ring-gray-900/5 transition-transform duration-200 ease-in-out group-has-checked:translate-x-5"></span>
								<input type="checkbox" id="darkThemeToggle" ${isDarkTheme ? 'checked' : ''} aria-label="Dark theme" class="absolute inset-0 appearance-none focus:outline-hidden">
							</div>
						</label>
					</section>
					<section id="settings-events" class="settings-section">
						<div class="settings-modal-placeholder-title">Events</div>
						<div class="settings-toggle-row" style="margin-top: 16px;">
							<div class="settings-toggle-text" style="flex: 1;">
								<div class="settings-toggle-title">Automatic refresh</div>
								<div class="settings-toggle-description">
									Automatically refresh the events list at the specified interval.
								</div>
							</div>
							<div style="display: flex; align-items: center; gap: 8px;">
								<label class="relative inline-flex items-center cursor-pointer" style="margin: 0;">
									<div class="group relative inline-flex w-11 shrink-0 rounded-full bg-gray-200 p-0.5 inset-ring inset-ring-gray-900/5 outline-offset-2 outline-indigo-600 transition-colors duration-200 ease-in-out has-checked:bg-indigo-600 has-focus-visible:outline-2">
										<span class="size-5 rounded-full bg-white shadow-xs ring-1 ring-gray-900/5 transition-transform duration-200 ease-in-out group-has-checked:translate-x-5"></span>
										<input type="checkbox" id="autoRefreshToggle" ${autoRefreshEnabled ? 'checked' : ''} aria-label="Toggle auto refresh" class="absolute inset-0 appearance-none focus:outline-hidden">
									</div>
								</label>
								<el-autocomplete class="relative auto-refresh-interval" data-disabled="${autoRefreshEnabled ? 'false' : 'true'}">
									<input id="autoRefreshInterval" name="autoRefreshInterval" type="text" value="${autoRefreshInterval}"
										class="block w-full rounded-md bg-white py-1.5 pr-12 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
										${autoRefreshEnabled ? '' : 'disabled'}>
									<button type="button" class="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2">
										<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="size-5 text-gray-400">
											<path d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
										</svg>
									</button>
									<el-options anchor="bottom end" popover class="max-h-60 w-(--input-width) overflow-auto rounded-md bg-white py-1 text-base shadow-lg outline outline-black/5 transition-discrete [--anchor-gap:--spacing(1)] data-leave:transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0 sm:text-sm">
										<el-option value="" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">Off</el-option>
										<el-option value="3" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">3</el-option>
										<el-option value="5" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">5</el-option>
										<el-option value="10" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">10</el-option>
									</el-options>
								</el-autocomplete>
							</div>
						</div>
					</section>
					<section id="settings-teams" class="settings-section" style="display: none;">
						<div class="settings-modal-placeholder-title" style="margin-bottom: 6px;">Org – Client – Team mapping</div>
						<p class="settings-modal-placeholder-text" style="margin-bottom: 12px;">
							Manage how Salesforce org identifiers are associated with clients and teams. This global configuration applies to all users.
						</p>
						<div id="orgTeamMappingList" style="max-height: 260px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px; margin-bottom: 12px;">
						</div>
						<form id="orgTeamMappingForm" class="settings-toggle-row" style="flex-direction: column; align-items: stretch; gap: 10px; padding-top: 4px; padding-bottom: 0;">
							<input type="hidden" id="orgTeamMappingEditingId" value="">
							<div style="display: flex; flex-direction: column; gap: 6px;">
								<label class="settings-modal-placeholder-text">
									Salesforce org identifier
									<input id="orgIdentifierInput" type="text" placeholder="Org ID or unique org key"
										style="margin-top: 2px; width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.8rem;">
								</label>
								<label class="settings-modal-placeholder-text">
									Client name
									<input id="clientNameInput" type="text" placeholder="Client"
										style="margin-top: 2px; width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.8rem;">
								</label>
								<label class="settings-modal-placeholder-text">
									Team name
									<input id="teamNameInput" type="text" placeholder="Team"
										style="margin-top: 2px; width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.8rem;">
								</label>
								<label class="settings-modal-placeholder-text">
									Color (optional)
									<input id="teamColorInput" type="text" placeholder="#2195cf or CSS color name"
										style="margin-top: 2px; width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.8rem;">
								</label>
								<label class="settings-modal-placeholder-text" style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
									<input id="mappingActiveInput" type="checkbox" checked style="width: 14px; height: 14px;">
									<span>Active mapping</span>
								</label>
							</div>
							<div class="confirm-modal-actions" style="width: 100%; justify-content: space-between; margin-top: 4px;">
								<button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" id="resetOrgTeamMappingFormBtn">
									Clear form
								</button>
								<button type="submit" class="confirm-modal-btn confirm-modal-btn-confirm">
									Save mapping
							</button>
							</div>
						</form>
					</section>
					${isAdministrator ? `
					<section id="settings-users" class="settings-section settings-users-section" style="display: none;">
						<div class="settings-users-header">
							<div class="settings-modal-placeholder-title settings-users-title">User Management</div>
							<button type="button" class="confirm-modal-btn settings-users-add-btn" id="addUserBtn">
								<i class="fa-solid fa-plus"></i>
								Add User
							</button>
						</div>
						<div class="settings-users-table-wrapper">
							<table id="usersTable" class="settings-users-table">
								<thead>
									<tr>
										<th>Username</th>
										<th>Created</th>
										<th>Last Login</th>
										<th class="settings-users-actions-column">Actions</th>
									</tr>
								</thead>
								<tbody id="usersTableBody">
									<tr>
										<td colspan="4" class="settings-users-empty">
											Loading users...
										</td>
									</tr>
								</tbody>
							</table>
						</div>
						<div id="userFormContainer" class="settings-users-inline-form" style="display: none;"></div>
					</section>
					` : ''}
					<section id="settings-danger" class="settings-danger-section">
						<div class="settings-modal-placeholder-title">Danger zone</div>
						<div class="settings-modal-placeholder-text">
							<div class="settings-toggle-row" style="align-items: flex-start;">
								<div class="settings-toggle-text">
									<div class="settings-toggle-title">Clear local data</div>
									<div class="settings-toggle-description">
										Remove all local preferences and cached data stored in this browser for the telemetry dashboard (theme, filters, mappings, etc.).
									</div>
								</div>
                <div class="settings-toggle-actions">
                  <button type="button" class="confirm-modal-btn confirm-modal-btn-destructive" id="clearLocalDataBtn">
                    Clear local data
                  </button>
                </div>
							</div>
							<div class="settings-toggle-row" style="align-items: flex-start; margin-top: 8px;">
								<div class="settings-toggle-text">
									<div class="settings-toggle-title">Delete all events</div>
									<div class="settings-toggle-description">
										Permanently delete all telemetry events from the server database. This action cannot be undone.
									</div>
								</div>
                <div class="settings-toggle-actions">
                  ${canDeleteAllEvents ? `
                    <button type="button" class="confirm-modal-btn confirm-modal-btn-destructive" id="deleteAllEventsBtn">
                      Delete all events
                    </button>
                  ` : `
                    <div class="settings-toggle-description">Only advanced or administrator users can delete all events.</div>
                  `}
                </div>
							</div>
						</div>
					</section>
				</div>
			</div>
		</div>
		<div class="settings-modal-footer">
			<div class="confirm-modal-actions">
				<button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" id="settingsCloseBtn">
					Close
				</button>
			</div>
		</div>
	`;

  const closeIcon = document.createElement('button');
  closeIcon.type = 'button';
  closeIcon.className = 'settings-modal-close-icon';
  closeIcon.id = 'settingsCloseIcon';
  closeIcon.setAttribute('aria-label', 'Close');
  closeIcon.innerHTML = '<i class="fa-solid fa-xmark"></i>';

  backdrop.appendChild(modal);
  backdrop.appendChild(closeIcon);
  document.body.appendChild(backdrop);

  const closeIconOffset = 14;

  const positionCloseIcon = () => {
    const modalRect = modal.getBoundingClientRect();
    closeIcon.style.top = `${modalRect.top - closeIconOffset}px`;
    closeIcon.style.left = `${modalRect.right + closeIconOffset}px`;
    closeIcon.style.right = 'auto';
    closeIcon.style.transform = 'none';
  };

  requestAnimationFrame(() => {
    backdrop.classList.add('visible');
    positionCloseIcon();
  });

  const handleResize = () => positionCloseIcon();
  window.addEventListener('resize', handleResize);

  function closeSettingsModal() {
    window.removeEventListener('resize', handleResize);
    const handleTransitionEnd = (event) => {
      if (event.target !== backdrop) {
        return;
      }
      backdrop.ontransitionend = null;
      backdrop.remove();
    };
    backdrop.ontransitionend = handleTransitionEnd;
    backdrop.classList.remove('visible');
    backdrop.classList.add('hiding');
  }

  const closeBtn = modal.querySelector('#settingsCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeSettingsModal);
  }

  const closeIconBtn = backdrop.querySelector('#settingsCloseIcon');
  if (closeIconBtn) {
    closeIconBtn.addEventListener('click', closeSettingsModal);
  }

  const darkThemeToggle = modal.querySelector('#darkThemeToggle');
  if (darkThemeToggle) {
    darkThemeToggle.addEventListener('change', (e) => {
      const newTheme = e.target.checked ? 'dark' : 'light';
      localStorage.setItem('theme', newTheme);
      applyTheme(newTheme);
    });
  }

  const showServerStatsToggle = modal.querySelector('#showServerStatsToggle');
  if (showServerStatsToggle) {
    showServerStatsToggle.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      localStorage.setItem('showServerStats', enabled ? 'true' : 'false');
      updateServerStatsVisibility();
    });
  }

  const autoRefreshToggle = modal.querySelector('#autoRefreshToggle');
  const autoRefreshIntervalInput = modal.querySelector('#autoRefreshInterval');

  if (autoRefreshToggle && autoRefreshIntervalInput) {
    autoRefreshToggle.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      autoRefreshEnabledState = enabled;
      if (!enabled) {
        autoRefreshIntervalMinutes = '';
        autoRefreshIntervalInput.value = '';
      }
      autoRefreshIntervalInput.disabled = !enabled;
    });

    const handleAutoRefreshChange = (e) => {
      const interval = e.target.value;
      autoRefreshIntervalMinutes = interval;
    };
    autoRefreshIntervalInput.addEventListener('change', handleAutoRefreshChange);
    autoRefreshIntervalInput.addEventListener('input', handleAutoRefreshChange);
  }

  const clearLocalDataBtn = modal.querySelector('#clearLocalDataBtn');
  if (clearLocalDataBtn) {
    clearLocalDataBtn.addEventListener('click', () => {
      clearLocalData();
    });
  }

  const deleteAllEventsBtn = modal.querySelector('#deleteAllEventsBtn');
  if (deleteAllEventsBtn) {
    deleteAllEventsBtn.addEventListener('click', () => {
      confirmDeleteAll();
    });
  }

  // Navigation between settings sections
  const sidebarLinks = modal.querySelectorAll('.settings-sidebar-link');
  const sections = modal.querySelectorAll('.settings-section, .settings-danger-section');

  function showSection(sectionId) {
    sections.forEach(section => {
      section.style.display = 'none';
    });
    const targetSection = modal.querySelector(sectionId);
    if (targetSection) {
      targetSection.style.display = 'block';
    }

    sidebarLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === sectionId) {
        link.classList.add('active');
      }
    });
  }

  sidebarLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const sectionId = link.getAttribute('href');
      showSection(sectionId);
    });
  });

  // Show first section by default
  if (sidebarLinks.length > 0) {
    const firstSectionId = sidebarLinks[0].getAttribute('href');
    showSection(firstSectionId);
  }

  // Teams mapping section (local-only configuration)
  const teamsSection = modal.querySelector('#settings-teams');
  if (teamsSection) {
    const listContainer = teamsSection.querySelector('#orgTeamMappingList');
    const form = teamsSection.querySelector('#orgTeamMappingForm');
    const editingIdInput = teamsSection.querySelector('#orgTeamMappingEditingId');
    const orgInput = teamsSection.querySelector('#orgIdentifierInput');
    const clientInput = teamsSection.querySelector('#clientNameInput');
    const teamInput = teamsSection.querySelector('#teamNameInput');
    const colorInput = teamsSection.querySelector('#teamColorInput');
    const colorPicker = attachColorPicker(colorInput);
    const activeInput = teamsSection.querySelector('#mappingActiveInput');
    const resetFormBtn = teamsSection.querySelector('#resetOrgTeamMappingFormBtn');

    async function renderMappings() {
      if (!listContainer) return;
      const mappings = await getOrgTeamMappings();
      if (!mappings.length) {
        listContainer.innerHTML = `
          <div class="settings-modal-placeholder-text">
            No mappings defined yet. Add a mapping using the form below.
          </div>
        `;
        return;
      }

      const rowsHtml = mappings
        .map((mapping, index) => {
          const safeOrg = escapeHtml(mapping.orgIdentifier || '');
          const safeClient = escapeHtml(mapping.clientName || '');
          const safeTeam = escapeHtml(mapping.teamName || '');
          const safeColor = escapeHtml(mapping.color || '');
          const status = mapping.active === false ? 'Inactive' : 'Active';
          return `
            <div class="settings-toggle-row" data-mapping-index="${index}" style="padding-top: 6px; padding-bottom: 6px; border-bottom: 1px solid var(--border-color);">
              <div class="settings-toggle-text">
                <div class="settings-toggle-title">${safeTeam || '(Unnamed team)'} ${safeClient ? '· ' + safeClient : ''}</div>
                <div class="settings-toggle-description">
                  Org: <code>${safeOrg || '-'}</code>
                  ${safeColor ? ` · Color: <span style="display:inline-flex;align-items:center;gap:4px;"><span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${safeColor};border:1px solid var(--border-color);"></span>${safeColor}</span>` : ''}
                   · Status: ${status}
								</div>
							</div>
              <div class="confirm-modal-actions org-team-actions" style="gap: 6px;">
                <button type="button" class="icon-btn org-team-action-btn org-team-action-btn-edit" data-action="edit" data-index="${index}" aria-label="Edit mapping">
                  <i class="fas fa-pen"></i>
                </button>
                <button type="button" class="icon-btn org-team-action-btn org-team-action-btn-delete" data-action="delete" data-index="${index}" aria-label="Delete mapping">
                  <i class="fas fa-trash"></i>
                </button>
							</div>
            </div>
				`;
        })
        .join('');

      listContainer.innerHTML = rowsHtml;

      listContainer.querySelectorAll('button[data-action="edit"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const idx = Number(btn.dataset.index);
          const mappingsData = await getOrgTeamMappings();
          const mapping = mappingsData[idx];
          if (!mapping) return;
          editingIdInput.value = String(idx);
          orgInput.value = mapping.orgIdentifier || '';
          clientInput.value = mapping.clientName || '';
          teamInput.value = mapping.teamName || '';
          colorPicker.setValue(mapping.color || '');
          activeInput.checked = mapping.active !== false;
        });
      });

      listContainer.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const idx = Number(btn.dataset.index);
          const mappingsData = await getOrgTeamMappings();
          if (idx >= 0 && idx < mappingsData.length) {
            mappingsData.splice(idx, 1);
            await saveOrgTeamMappings(mappingsData);
            renderMappings();
          }
        });
      });
    }

    function resetForm() {
      if (!editingIdInput || !orgInput || !clientInput || !teamInput || !colorInput || !activeInput) return;
      editingIdInput.value = '';
      orgInput.value = '';
      clientInput.value = '';
      teamInput.value = '';
      colorPicker.setValue('');
      activeInput.checked = true;
    }

    if (resetFormBtn) {
      resetFormBtn.addEventListener('click', (e) => {
        e.preventDefault();
        resetForm();
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const orgIdentifier = orgInput.value.trim();
        const clientName = clientInput.value.trim();
        const teamName = teamInput.value.trim();
        const color = colorPicker.getValue();
        const active = !!activeInput.checked;

        if (!orgIdentifier || !clientName || !teamName) {
          alert('Org identifier, client name and team name are required.');
          return;
        }

        const mappings = await getOrgTeamMappings();
        const editingIndex = editingIdInput.value !== '' ? Number(editingIdInput.value) : -1;
        const duplicateIndex = mappings.findIndex((m, idx) => m.orgIdentifier === orgIdentifier && idx !== editingIndex);
        if (duplicateIndex !== -1) {
          alert('There is already a mapping for this org identifier. Edit the existing mapping instead.');
          return;
        }

        const mappingData = { orgIdentifier, clientName, teamName, color, active };

        if (editingIndex >= 0 && editingIndex < mappings.length) {
          mappings[editingIndex] = mappingData;
        } else {
          mappings.push(mappingData);
        }

        await saveOrgTeamMappings(mappings);
        resetForm();
        renderMappings();
      });
    }

    renderMappings().catch(error => console.error('Error rendering mappings:', error));
  }

  // Users section functionality (only for administrators)
  if (isAdministrator) {
    const usersSection = modal.querySelector('#settings-users');
    if (usersSection) {
      const usersTableBody = modal.querySelector('#usersTableBody');
      const addUserBtn = modal.querySelector('#addUserBtn');
      const userFormContainer = modal.querySelector('#userFormContainer');

      function closeUserForm() {
        if (!userFormContainer) return;
        userFormContainer.innerHTML = '';
        userFormContainer.style.display = 'none';
      }

      function renderUserForm({ title, description, fieldsHtml, submitLabel, onSubmit }) {
        if (!userFormContainer) return;

        userFormContainer.innerHTML = `
          <div class="settings-users-form-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <div class="settings-modal-placeholder-title" style="margin: 0;">${title}</div>
            <button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" data-action="cancel-user-form" style="padding: 6px 10px;">
              Close
            </button>
          </div>
          ${description ? `<p class="settings-modal-placeholder-text" style="margin-top: 6px; margin-bottom: 4px;">${description}</p>` : ''}
          <form class="settings-users-form" style="display: flex; flex-direction: column; gap: 12px; margin-top: 10px;">
            ${fieldsHtml}
            <div class="settings-users-form-error" style="color: #dc2626; font-size: 13px; display: none;"></div>
            <div class="confirm-modal-actions">
              <button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" data-action="cancel-user-form">
                Cancel
              </button>
              <button type="submit" class="confirm-modal-btn confirm-modal-btn-confirm">
                ${submitLabel}
              </button>
            </div>
          </form>
        `;
        userFormContainer.style.display = 'block';

        const form = userFormContainer.querySelector('form');
        const errorDiv = userFormContainer.querySelector('.settings-users-form-error');
        const cancelButtons = userFormContainer.querySelectorAll('[data-action="cancel-user-form"]');

        const setError = (message) => {
          if (!errorDiv) return;
          if (message) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
          } else {
            errorDiv.textContent = '';
            errorDiv.style.display = 'none';
          }
        };

        cancelButtons.forEach((button) => {
          button.addEventListener('click', () => {
            closeUserForm();
          });
        });

        if (form) {
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            setError('');
            try {
              const formData = new window.FormData(form);
              await onSubmit(formData, setError);
            } catch (error) {
              setError(error.message || 'Operation failed');
            }
          });
        }

        userFormContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      async function loadUsers() {
        try {
          const response = await fetch('/api/users', {
            credentials: 'include'
          });
          if (response.status === 401) {
            window.location.href = '/login';
            return;
          }
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const data = await response.json();
          await renderUsers(data.users || []);
        } catch (error) {
          console.error('Error loading users:', error);
          if (usersTableBody) {
            usersTableBody.innerHTML = `
              <tr>
                <td colspan="4" class="settings-users-empty">
                  Error loading users: ${escapeHtml(error.message)}
                </td>
              </tr>
            `;
          }
        }
      }

      function formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }

      function getRoleBadgeColor(role) {
        switch (role) {
        case 'administrator':
          return '#dc2626'; // red
        case 'advanced':
          return '#2563eb'; // blue
        case 'basic':
          return '#16a34a'; // green
        default:
          return '#6b7280'; // gray
        }
      }

      function openCreateUserForm() {
        renderUserForm({
          title: 'Create New User',
          description: 'Add a user to access the telemetry UI.',
          submitLabel: 'Create User',
          fieldsHtml: `
        <div>
          <label class="settings-modal-placeholder-text" style="display: block; margin-bottom: 6px;">
            Username
                <input type="text" name="username" required
              style="margin-top: 4px; width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 14px;"
              placeholder="Enter username">
          </label>
        </div>
        <div>
          <label class="settings-modal-placeholder-text" style="display: block; margin-bottom: 6px;">
            Password
                <input type="password" name="password" required
              style="margin-top: 4px; width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 14px;"
              placeholder="Enter password">
          </label>
        </div>
        <div>
          <label class="settings-modal-placeholder-text" style="display: block; margin-bottom: 6px;">
            Role
                <el-autocomplete class="relative" style="margin-top: 4px;">
              <input id="createUserRole" name="role" type="text" value="basic"
                class="block w-full rounded-md bg-white py-1.5 pr-12 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6">
              <button type="button" class="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2">
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="size-5 text-gray-400">
                  <path d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
                </svg>
              </button>
              <el-options anchor="bottom end" popover class="max-h-60 w-(--input-width) overflow-auto rounded-md bg-white py-1 text-base shadow-lg outline outline-black/5 transition-discrete [--anchor-gap:--spacing(1)] data-leave:transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0 sm:text-sm">
                <el-option value="basic" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">Basic</el-option>
                <el-option value="advanced" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">Advanced</el-option>
                <el-option value="administrator" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">Administrator</el-option>
              </el-options>
            </el-autocomplete>
          </label>
        </div>
          `,
          onSubmit: async (formData, setError) => {
            const username = (formData.get('username') || '').trim();
            const password = formData.get('password') || '';
            const role = formData.get('role') || 'basic';

            if (!username || !password) {
              setError('Username and password are required');
              return;
            }

            const response = await fetch('/api/users', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              credentials: 'include',
              body: JSON.stringify({ username, password, role })
            });

            const data = await response.json();
            if (!response.ok) {
              throw new Error(data.message || 'Failed to create user');
            }

            closeUserForm();
            await loadUsers();
          }
        });
      }

      function openEditPasswordForm(username) {
        renderUserForm({
          title: 'Change Password',
          description: `Change password for user: <strong>${escapeHtml(username)}</strong>`,
          submitLabel: 'Update Password',
          fieldsHtml: `
        <div>
          <label class="settings-modal-placeholder-text" style="display: block; margin-bottom: 6px;">
            New Password
                <input type="password" name="password" required
              style="margin-top: 4px; width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 14px;"
              placeholder="Enter new password">
          </label>
        </div>
          `,
          onSubmit: async (formData, setError) => {
            const password = formData.get('password') || '';
            if (!password) {
              setError('Password is required');
              return;
            }

            const response = await fetch(`/api/users/${encodeURIComponent(username)}/password`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json'
              },
              credentials: 'include',
              body: JSON.stringify({ password })
            });

            const data = await response.json();
            if (!response.ok) {
              throw new Error(data.message || 'Failed to update password');
            }

            closeUserForm();
            await loadUsers();
          }
        });
      }

      function openEditRoleForm(username, currentRole) {
        renderUserForm({
          title: 'Change Role',
          description: `Change role for user: <strong>${escapeHtml(username)}</strong>`,
          submitLabel: 'Update Role',
          fieldsHtml: `
        <div>
          <label class="settings-modal-placeholder-text" style="display: block; margin-bottom: 6px;">
            Role
                <el-autocomplete class="relative" style="margin-top: 4px;">
              <input id="editUserRole" name="role" type="text" value="${currentRole}"
                class="block w-full rounded-md bg-white py-1.5 pr-12 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6">
              <button type="button" class="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2">
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="size-5 text-gray-400">
                  <path d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
                </svg>
              </button>
              <el-options anchor="bottom end" popover class="max-h-60 w-(--input-width) overflow-auto rounded-md bg-white py-1 text-base shadow-lg outline outline-black/5 transition-discrete [--anchor-gap:--spacing(1)] data-leave:transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0 sm:text-sm">
                <el-option value="basic" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">Basic</el-option>
                <el-option value="advanced" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">Advanced</el-option>
                <el-option value="administrator" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">Administrator</el-option>
              </el-options>
            </el-autocomplete>
          </label>
        </div>
          `,
          onSubmit: async (formData, setError) => {
            const role = formData.get('role') || '';
            if (!role) {
              setError('Role is required');
              return;
            }

            const response = await fetch(`/api/users/${encodeURIComponent(username)}/role`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json'
              },
              credentials: 'include',
              body: JSON.stringify({ role })
            });

            const data = await response.json();
            if (!response.ok) {
              throw new Error(data.message || 'Failed to update role');
            }

            closeUserForm();
            await loadUsers();
          }
        });
      }

      async function handleDeleteUser(username) {
        const confirmed = await openConfirmModal({
          title: 'Delete User',
          message: `Are you sure you want to delete user "${escapeHtml(username)}"? This action cannot be undone.`,
          confirmLabel: 'Delete User',
          destructive: true
        });

        if (!confirmed) {
          return;
        }

        try {
          const response = await fetch(`/api/users/${encodeURIComponent(username)}`, {
            method: 'DELETE',
            credentials: 'include'
          });
          const data = await response.json();
          if (data.status === 'ok') {
            await loadUsers();
          } else {
            throw new Error(data.message || 'Failed to delete user');
          }
        } catch (error) {
          console.error('Error deleting user:', error);
          alert('Error deleting user: ' + error.message);
        }
      }

      async function renderUsers(users) {
        if (!usersTableBody) return;

        if (users.length === 0) {
          usersTableBody.innerHTML = `
            <tr>
              <td colspan="4" class="settings-users-empty">
                No users found. Click "Add User" to create one.
              </td>
            </tr>
          `;
          return;
        }

        let currentUsername = '';
        try {
          const authResponse = await fetch('/api/auth/status', {
            credentials: 'include'
          });
          if (authResponse.ok) {
            const authData = await authResponse.json();
            currentUsername = authData.username || '';
          }
        } catch (error) {
          console.error('Error getting current username:', error);
        }

        usersTableBody.innerHTML = users.map(user => {
          const roleColor = getRoleBadgeColor(user.role);
          const isCurrentUser = user.username === currentUsername;
          return `
            <tr class="settings-users-row">
              <td>
                <div class="settings-user-overview">
                  <div class="settings-user-avatar">
                    ${escapeHtml(user.username.charAt(0).toUpperCase())}
                  </div>
                  <div class="settings-user-meta">
                    <div class="settings-user-identity">
                      <span class="settings-user-name">${escapeHtml(user.username)}</span>
                      ${isCurrentUser ? '<span class="settings-user-self">(you)</span>' : ''}
                    </div>
                    <span class="settings-user-role-badge" style="background: ${roleColor}20; color: ${roleColor};">
                      <span class="settings-user-role-dot" style="background: ${roleColor};"></span>
                      ${escapeHtml(user.role || 'basic')}
                    </span>
                  </div>
                </div>
              </td>
              <td>
                ${formatDate(user.created_at)}
              </td>
              <td>
                ${formatDate(user.last_login)}
              </td>
              <td class="settings-users-actions-cell">
                <div class="settings-users-actions">
                  <button type="button" class="confirm-modal-btn settings-users-action-btn" data-action="edit-password" data-username="${escapeHtml(user.username)}" title="Change password">
                    <i class="fa-solid fa-key"></i>
                  </button>
                  <button type="button" class="confirm-modal-btn settings-users-action-btn" data-action="edit-role" data-username="${escapeHtml(user.username)}" data-role="${escapeHtml(user.role || 'basic')}" title="Change role">
                    <i class="fa-solid fa-user-tag"></i>
                  </button>
                  ${!isCurrentUser ? `
                  <button type="button" class="confirm-modal-btn confirm-modal-btn-destructive settings-users-action-btn" data-action="delete-user" data-username="${escapeHtml(user.username)}" title="Delete user">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                  ` : ''}
                </div>
              </td>
            </tr>
          `;
        }).join('');

        const actionButtons = usersTableBody.querySelectorAll('.settings-users-action-btn');
        actionButtons.forEach((button) => {
          const action = button.dataset.action;
          const username = button.dataset.username || '';
          const role = button.dataset.role || 'basic';

          if (action === 'edit-password') {
            button.addEventListener('click', () => openEditPasswordForm(username));
          } else if (action === 'edit-role') {
            button.addEventListener('click', () => openEditRoleForm(username, role));
          } else if (action === 'delete-user') {
            button.addEventListener('click', () => handleDeleteUser(username));
          }
        });
      }

      const usersSectionObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            const isVisible = usersSection.style.display !== 'none';
            if (isVisible) {
              loadUsers();
            }
          }
        });
      });
      usersSectionObserver.observe(usersSection, { attributes: true, attributeFilter: ['style'] });

      if (addUserBtn) {
        addUserBtn.addEventListener('click', () => {
          openCreateUserForm();
        });
      }

      if (usersSection.style.display !== 'none') {
        loadUsers();
      }
    }
  }

  document.addEventListener(
    'keydown',
    function handleKeydown(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleKeydown);
        if (document.body.contains(backdrop)) {
          closeSettingsModal();
        }
      }
    }
  );
}

/* exported openOrgTeamMappingModal */
function openOrgTeamMappingModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'confirm-modal-backdrop org-team-mapping-backdrop';

  const modal = document.createElement('div');
  modal.className = 'confirm-modal settings-modal';
  modal.innerHTML = `
		<div class="confirm-modal-title">Org – Client – Team mapping</div>
		<div class="confirm-modal-message">
			<p class="settings-modal-placeholder-text">
				Manage how Salesforce org identifiers are associated with clients and teams. This configuration is stored only in this browser.
			</p>
		</div>
		<div style="display: flex; flex-direction: column; gap: 12px;">
			<div id="orgTeamMappingList" style="max-height: 260px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px;">
			</div>
			<form id="orgTeamMappingForm" class="settings-toggle-row" style="flex-direction: column; align-items: stretch; gap: 10px; padding-top: 4px; padding-bottom: 0;">
				<input type="hidden" id="orgTeamMappingEditingId" value="">
				<div style="display: flex; flex-direction: column; gap: 6px;">
					<label class="settings-modal-placeholder-text">
						Salesforce org identifier
						<input id="orgIdentifierInput" type="text" placeholder="Org ID or unique org key"
							style="margin-top: 2px; width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.8rem;">
					</label>
					<label class="settings-modal-placeholder-text">
						Client name
						<input id="clientNameInput" type="text" placeholder="Client"
							style="margin-top: 2px; width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.8rem;">
					</label>
					<label class="settings-modal-placeholder-text">
						Team name
						<input id="teamNameInput" type="text" placeholder="Team"
							style="margin-top: 2px; width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.8rem;">
					</label>
					<label class="settings-modal-placeholder-text">
						Color (optional)
						<input id="teamColorInput" type="text" placeholder="#2195cf or CSS color name"
							style="margin-top: 2px; width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.8rem;">
					</label>
					<label class="settings-modal-placeholder-text" style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
						<input id="mappingActiveInput" type="checkbox" checked style="width: 14px; height: 14px;">
						<span>Active mapping</span>
					</label>
				</div>
				<div class="confirm-modal-actions" style="width: 100%; justify-content: space-between; margin-top: 4px;">
					<button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" id="resetOrgTeamMappingFormBtn">
						Clear form
					</button>
					<button type="submit" class="confirm-modal-btn confirm-modal-btn-confirm">
						Save mapping
					</button>
				</div>
			</form>
		</div>
		<div class="confirm-modal-actions" style="margin-top: 16px;">
			<button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" id="orgTeamMappingCloseBtn">
				Close
			</button>
		</div>
	`;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  function closeMappingModal() {
    const handleTransitionEnd = (event) => {
      if (event.target !== backdrop) {
        return;
      }
      backdrop.ontransitionend = null;
      backdrop.remove();
    };
    backdrop.ontransitionend = handleTransitionEnd;
    backdrop.classList.remove('visible');
    backdrop.classList.add('hiding');
  }

  const closeBtn = modal.querySelector('#orgTeamMappingCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeMappingModal);
  }

  document.addEventListener(
    'keydown',
    function handleKeydown(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleKeydown);
        if (document.body.contains(backdrop)) {
          closeMappingModal();
        }
      }
    }
  );

  const listContainer = modal.querySelector('#orgTeamMappingList');
  const form = modal.querySelector('#orgTeamMappingForm');
  const editingIdInput = modal.querySelector('#orgTeamMappingEditingId');
  const orgInput = modal.querySelector('#orgIdentifierInput');
  const clientInput = modal.querySelector('#clientNameInput');
  const teamInput = modal.querySelector('#teamNameInput');
  const colorInput = modal.querySelector('#teamColorInput');
  const colorPicker = attachColorPicker(colorInput);
  const activeInput = modal.querySelector('#mappingActiveInput');
  const resetFormBtn = modal.querySelector('#resetOrgTeamMappingFormBtn');

  async function renderMappings() {
    if (!listContainer) {
      return;
    }
    const mappings = await getOrgTeamMappings();
    if (!mappings.length) {
      listContainer.innerHTML = `
				<div class="settings-modal-placeholder-text">
					No mappings defined yet. Add a mapping using the form below.
				</div>
			`;
      return;
    }

    const rowsHtml = mappings
      .map((mapping, index) => {
        const safeOrg = escapeHtml(mapping.orgIdentifier || '');
        const safeClient = escapeHtml(mapping.clientName || '');
        const safeTeam = escapeHtml(mapping.teamName || '');
        const safeColor = escapeHtml(mapping.color || '');
        const status = mapping.active === false ? 'Inactive' : 'Active';
        return `
					<div class="settings-toggle-row" data-mapping-index="${index}" style="padding-top: 6px; padding-bottom: 6px; border-bottom: 1px solid var(--border-color);">
						<div class="settings-toggle-text">
							<div class="settings-toggle-title">${safeTeam || '(Unnamed team)'} ${safeClient ? '· ' + safeClient : ''}</div>
							<div class="settings-toggle-description">
								Org: <code>${safeOrg || '-'}</code>
								${safeColor ? ` · Color: <span style="display:inline-flex;align-items:center;gap:4px;"><span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${safeColor};border:1px solid var(--border-color);"></span>${safeColor}</span>` : ''}
								 · Status: ${status}
							</div>
						</div>
						<div class="confirm-modal-actions org-team-actions" style="gap: 6px;">
							<button type="button" class="icon-btn org-team-action-btn org-team-action-btn-edit" data-action="edit" data-index="${index}" aria-label="Edit mapping">
								<i class="fas fa-pen"></i>
							</button>
							<button type="button" class="icon-btn org-team-action-btn org-team-action-btn-delete" data-action="delete" data-index="${index}" aria-label="Delete mapping">
								<i class="fas fa-trash"></i>
							</button>
						</div>
					</div>
				`;
      })
      .join('');

    listContainer.innerHTML = rowsHtml;

    listContainer.querySelectorAll('button[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.index);
        const mappingsData = await getOrgTeamMappings();
        const mapping = mappingsData[idx];
        if (!mapping) {
          return;
        }
        editingIdInput.value = String(idx);
        orgInput.value = mapping.orgIdentifier || '';
        clientInput.value = mapping.clientName || '';
        teamInput.value = mapping.teamName || '';
        colorPicker.setValue(mapping.color || '');
        activeInput.checked = mapping.active !== false;
      });
    });

    listContainer.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.index);
        const mappingsData = await getOrgTeamMappings();
        if (idx >= 0 && idx < mappingsData.length) {
          mappingsData.splice(idx, 1);
          await saveOrgTeamMappings(mappingsData);
          renderMappings();
        }
      });
    });
  }

  function resetForm() {
    if (!editingIdInput || !orgInput || !clientInput || !teamInput || !colorInput || !activeInput) {
      return;
    }
    editingIdInput.value = '';
    orgInput.value = '';
    clientInput.value = '';
    teamInput.value = '';
    colorPicker.setValue('');
    activeInput.checked = true;
  }

  if (resetFormBtn) {
    resetFormBtn.addEventListener('click', (e) => {
      e.preventDefault();
      resetForm();
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const orgIdentifier = orgInput.value.trim();
      const clientName = clientInput.value.trim();
      const teamName = teamInput.value.trim();
      const color = colorPicker.getValue();
      const active = !!activeInput.checked;

      if (!orgIdentifier || !clientName || !teamName) {
        alert('Org identifier, client name and team name are required.');
        return;
      }

      const mappings = await getOrgTeamMappings();
      const editingIndex = editingIdInput.value !== '' ? Number(editingIdInput.value) : -1;

      // Prevent duplicate org identifiers when creating a new mapping
      const duplicateIndex = mappings.findIndex((m, idx) => m.orgIdentifier === orgIdentifier && idx !== editingIndex);
      if (duplicateIndex !== -1) {
        alert('There is already a mapping for this org identifier. Edit the existing mapping instead.');
        return;
      }

      const mappingData = {
        orgIdentifier,
        clientName,
        teamName,
        color,
        active
      };

      if (editingIndex >= 0 && editingIndex < mappings.length) {
        mappings[editingIndex] = mappingData;
      } else {
        mappings.push(mappingData);
      }
      await saveOrgTeamMappings(mappings);
      renderMappings();
      resetForm();
    });
  }

  renderMappings().catch(error => console.error('Error rendering mappings:', error));

  requestAnimationFrame(() => {
    backdrop.classList.add('visible');
  });
}

window.openOrgTeamMappingModal = openOrgTeamMappingModal;

// Initialize theme
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    updateServerStatsVisibility();
    ensureUserMenuStructure();
    setupIconButtonsGroupHover();
  });
} else {
  initTheme();
  updateServerStatsVisibility();
  ensureUserMenuStructure();
  setupIconButtonsGroupHover();
}

// Handle smooth hover animation for icon buttons group
function setupIconButtonsGroupHover() {
  const iconButtonsGroup = document.querySelector('.icon-buttons-group');
  if (!iconButtonsGroup) return;

  let isInsideGroup = false;
  let currentHoveredButton = null;
  let hasEnteredFromOutside = false;

  iconButtonsGroup.addEventListener('mouseenter', (_e) => {
    isInsideGroup = true;
    hasEnteredFromOutside = true;
    iconButtonsGroup.classList.add('no-transition');
  });

  iconButtonsGroup.addEventListener('mouseleave', () => {
    isInsideGroup = false;
    currentHoveredButton = null;
    hasEnteredFromOutside = false;
    iconButtonsGroup.classList.add('no-transition');
    iconButtonsGroup.removeAttribute('data-hover-index');
    requestAnimationFrame(() => {
      iconButtonsGroup.classList.remove('no-transition');
    });
  });

  const buttons = iconButtonsGroup.querySelectorAll('.icon-btn');
  buttons.forEach((button, index) => {
    button.addEventListener('mouseenter', (_e) => {
      const wasFromOutside = currentHoveredButton === null || hasEnteredFromOutside;

      if (currentHoveredButton !== null && currentHoveredButton !== index && !wasFromOutside) {
        // Moving from one button to another - enable transition
        iconButtonsGroup.classList.remove('no-transition');
        iconButtonsGroup.setAttribute('data-hover-index', index);
      } else {
        // Entering from outside or first hover - no transition
        iconButtonsGroup.classList.add('no-transition');

        // Set the hover index attribute which triggers CSS
        iconButtonsGroup.setAttribute('data-hover-index', index);

        // Force a reflow to ensure the position is set before removing no-transition
        void iconButtonsGroup.offsetHeight;

        // Remove no-transition after a short delay to allow smooth transitions between buttons
        setTimeout(() => {
          if (isInsideGroup && currentHoveredButton === index) {
            iconButtonsGroup.classList.remove('no-transition');
          }
        }, 20);

        hasEnteredFromOutside = false;
      }
      currentHoveredButton = index;
    });

    button.addEventListener('mouseleave', () => {
      if (currentHoveredButton === index && !isInsideGroup) {
        iconButtonsGroup.removeAttribute('data-hover-index');
        currentHoveredButton = null;
      }
    });
  });
}

// Refresh dashboard function

async function refreshDashboard(event) {
  if (event) {
    event.stopPropagation();
  }
  // Rotate refresh icon
  const button = event?.target?.closest('.icon-btn') || event?.currentTarget;
  const refreshIcon = button?.querySelector('.fa-refresh, .refresh-icon') || (event?.target?.classList?.contains('fa-refresh') ? event.target : null);
  if (refreshIcon) {
    refreshIcon.classList.add('rotating');
  }
  // Reload chart data with current days setting
  try {
    await Promise.all([
      loadChartData(currentDays),
      loadTopUsersToday(),
      loadTopTeamsToday(),
      loadDashboardDatabaseSize()
    ]);
  } catch (error) {
    // Any errors are already logged inside loadChartData; this catch
    // simply ensures we always stop the spinner.
    console.error('Error refreshing dashboard:', error);
  } finally {
    if (refreshIcon) {
      // Smooth transition: replace infinite animation with a finishing one
      refreshIcon.classList.remove('rotating');
      refreshIcon.classList.add('rotating-finish');

      // Remove the finish class after animation completes
      setTimeout(() => {
        refreshIcon.classList.remove('rotating-finish');
      }, REFRESH_ICON_ANIMATION_DURATION_MS);
    }
  }
}

// Chart configuration
let chart = null;
let currentDays = 7;
let isInitialChartLoad = true; // Track if this is the initial chart load

// Function to calculate polynomial regression (degree 2 for curved trend)
function calculatePolynomialRegression(dataPoints, degree = 2) {
  const n = dataPoints.length;
  if (n < degree + 1) return { coefficients: [0] };

  // Prepare matrices for polynomial regression
  const X = [];
  const Y = dataPoints;

  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j <= degree; j++) {
      row.push(Math.pow(i, j));
    }
    X.push(row);
  }

  // Solve normal equations using Gaussian elimination
  const coefficients = solveNormalEquations(X, Y);
  return { coefficients };
}

// Gaussian elimination for normal equations
function solveNormalEquations(X, Y) {
  const n = X[0].length;
  const m = X.length;

  // Create augmented matrix [X^T * X | X^T * Y]
  const A = Array.from({ length: n }, () => Array(n + 1).fill(0));

  // Calculate X^T * X and X^T * Y
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < m; k++) {
        sum += X[k][i] * X[k][j];
      }
      A[i][j] = sum;
    }
    let sum = 0;
    for (let k = 0; k < m; k++) {
      sum += X[k][i] * Y[k];
    }
    A[i][n] = sum;
  }

  // Gaussian elimination
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }

    // Swap rows
    [A[i], A[maxRow]] = [A[maxRow], A[i]];

    // Make pivot 1
    const pivot = A[i][i];
    if (Math.abs(pivot) < 1e-10) continue; // Skip if pivot is too small

    for (let j = i; j <= n; j++) {
      A[i][j] /= pivot;
    }

    // Eliminate
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = A[k][i];
        for (let j = i; j <= n; j++) {
          A[k][j] -= factor * A[i][j];
        }
      }
    }
  }

  // Extract coefficients
  const coefficients = [];
  for (let i = 0; i < n; i++) {
    coefficients.push(A[i][n]);
  }

  return coefficients;
}

// Function to calculate exponential smoothing
function calculateExponentialSmoothing(dataPoints, alpha = 0.3) {
  if (dataPoints.length === 0) return [];

  const smoothed = [dataPoints[0]]; // First value remains the same

  for (let i = 1; i < dataPoints.length; i++) {
    const smoothedValue = alpha * dataPoints[i] + (1 - alpha) * smoothed[i - 1];
    smoothed.push(smoothedValue);
  }

  return smoothed;
}

// Remove trailing zeros so future empty days don't distort the trend fit
function trimTrailingZeros(dataPoints) {
  let lastNonZeroIndex = -1;
  for (let i = dataPoints.length - 1; i >= 0; i--) {
    const value = Number(dataPoints[i]);
    if (Number.isFinite(value) && value !== 0) {
      lastNonZeroIndex = i;
      break;
    }
  }

  if (lastNonZeroIndex === -1 || lastNonZeroIndex === dataPoints.length - 1) {
    return dataPoints;
  }

  return dataPoints.slice(0, lastNonZeroIndex + 1);
}

// Function to generate trend line data using polynomial regression for curved trends
function generateTrendLine(dataPoints, futurePoints = 3, method = 'polynomial') {
  let trendData = [];
  let extrapolatedData = [];

  if (method === 'polynomial') {
    // Use polynomial regression (degree 2) for curved trends
    const { coefficients } = calculatePolynomialRegression(dataPoints, 2);

    // Generate trend line for existing data points
    trendData = dataPoints.map((_, index) => {
      let value = 0;
      for (let i = 0; i < coefficients.length; i++) {
        value += coefficients[i] * Math.pow(index, i);
      }
      return Math.max(0, value); // Ensure non-negative values
    });

    // Extrapolate future points
    for (let i = 0; i < futurePoints; i++) {
      const futureIndex = dataPoints.length + i;
      let value = 0;
      for (let j = 0; j < coefficients.length; j++) {
        value += coefficients[j] * Math.pow(futureIndex, j);
      }
      extrapolatedData.push(Math.max(0, value));
    }
  } else if (method === 'exponential') {
    // Use exponential smoothing for trend following recent patterns
    const smoothed = calculateExponentialSmoothing(dataPoints);

    // Extend smoothing for future points (use last smoothed value)
    const lastSmoothed = smoothed[smoothed.length - 1];
    trendData = smoothed;
    extrapolatedData = Array(futurePoints).fill(lastSmoothed);
  }

  return {
    trendData,
    extrapolatedData,
    method
  };
}

function initChart() {
  if (chart) {
    return chart;
  }
  const chartEl = document.getElementById('eventsChart');
  if (!chartEl) {
    return null;
  }
  // Wait for ECharts to load if not available yet
  if (typeof echarts === 'undefined') {
    window.addEventListener('echartsLoaded', function onEChartsLoaded() {
      window.removeEventListener('echartsLoaded', onEChartsLoaded);
      initChart();
    }, { once: true });
    return null;
  }
  chart = echarts.init(chartEl);
  window.addEventListener('resize', () => {
    chart?.resize();
  });
  return chart;
}

function updateChartLegendOverlay(legendItems) {
  const overlay = document.getElementById('chartLegendOverlay');
  if (!overlay) {
    return;
  }

  if (!Array.isArray(legendItems) || legendItems.length === 0) {
    overlay.innerHTML = '';
    overlay.setAttribute('data-state', 'empty');
    return;
  }

  const itemsMarkup = legendItems.map((item) => {
    const name = escapeHtml(item?.name || '');
    const color = escapeHtml(item?.itemStyle?.color || '#94a3b8');
    const icon = item?.icon === 'line' ? 'line' : 'circle';
    const markerClass = icon === 'line'
      ? 'chart-legend-overlay-marker chart-legend-overlay-marker--line'
      : 'chart-legend-overlay-marker';
    return `<span class="chart-legend-overlay-item"><span class="${markerClass}" style="background:${color};"></span>${name}</span>`;
  }).join('');

  overlay.innerHTML = itemsMarkup;
  overlay.setAttribute('data-state', 'ready');
}

function renderTopUsersPlaceholder(message) {
  const list = document.getElementById('topUsersList');
  if (!list) {
    return;
  }
  list.innerHTML = `<li class="top-users-empty">${escapeHtml(message)}</li>`;
}

function getUserInitials(name) {
  if (!name) {
    return '?';
  }

  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }

  if (parts.length === 1) {
    const firstWord = parts[0];
    const initials = firstWord.slice(0, 2).toUpperCase();
    return initials || '?';
  }

  const first = parts[0]?.charAt(0) || '';
  const second = parts[1]?.charAt(0) || '';
  const initials = `${first}${second}`.toUpperCase();
  return initials || '?';
}

function renderTopUsers(users) {
  const list = document.getElementById('topUsersList');
  if (!list) {
    return;
  }

  if (!users || users.length === 0) {
    renderTopUsersPlaceholder('No events recorded in the last 3 days yet.');
    return;
  }

  const items = users.map((user, index) => {
    const name = user.label || user.id || 'Unknown user';
    const initial = getUserInitials(name);
    const eventCount = Number(user.eventCount) || 0;
    const countLabel = eventCount === 1 ? '1 event last 3 days' : `${eventCount} events last 3 days`;
    const badgeBackground = index === 0 ? '#dc2626' : SESSION_START_SERIES_COLOR;

    return `
      <li class="top-users-item">
        <span class="top-users-avatar">${escapeHtml(initial)}</span>
        <div class="top-users-info">
          <div class="top-users-name-row">
            <strong class="top-users-name" title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
            <span class="top-users-badge" style="background: ${badgeBackground}; color: #ffffff;">${escapeHtml(String(eventCount))} events</span>
          </div>
          <div class="top-users-role">${escapeHtml(countLabel)}</div>
        </div>
        <button type="button" class="top-users-action" aria-label="Open user">
          <i class="fa-solid fa-chevron-right" aria-hidden="true" style="font-size: 11px;"></i>
        </button>
      </li>
    `;
  }).join('');

  list.innerHTML = items;
}

function renderTopTeamsPlaceholder(message) {
  const list = document.getElementById('topTeamsList');
  if (!list) {
    return;
  }
  list.innerHTML = `<li class="top-users-empty">${escapeHtml(message)}</li>`;
}

function renderTopTeams(teams) {
  const list = document.getElementById('topTeamsList');
  if (!list) {
    return;
  }

  if (!teams || teams.length === 0) {
    renderTopTeamsPlaceholder('No team activity recorded in the last 30 days yet.');
    return;
  }

  const items = teams.map((team, index) => {
    const teamName = team.label || team.id || 'Unknown team';
    const eventCount = Number(team.eventCount) || 0;
    const countLabel = eventCount === 1 ? '1 event last 30 days' : `${eventCount} events last 30 days`;
    const clientName = team.clientName ? ` · ${team.clientName}` : '';
    const badgeBackground = index === 0 ? '#dc2626' : SESSION_START_SERIES_COLOR;

    return `
      <li class="top-users-item">
        <span class="top-users-avatar top-users-avatar--team">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="width: 24px; height: 24px; color: ${team.color || badgeBackground};">
            <path d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
          </svg>
        </span>
        <div class="top-users-info">
          <div class="top-users-name-row">
            <strong class="top-users-name" title="${escapeHtml(teamName)}${clientName}">${escapeHtml(teamName)}${clientName}</strong>
            <span class="top-users-badge" style="background: ${badgeBackground}; color: #ffffff;">${escapeHtml(String(eventCount))} events</span>
          </div>
          <div class="top-users-role">${escapeHtml(countLabel)}</div>
        </div>
        <button type="button" class="top-users-action" aria-label="Open team">
          <i class="fa-solid fa-chevron-right" aria-hidden="true" style="font-size: 11px;"></i>
        </button>
      </li>
    `;
  }).join('');

  list.innerHTML = items;
}

async function loadTopUsersToday() {
  const list = document.getElementById('topUsersList');
  if (!list) {
    return;
  }

  renderTopUsersPlaceholder('Loading top users…');

  try {
    const response = await fetch(`/api/top-users-today?days=${TOP_USERS_LOOKBACK_DAYS}&limit=${TOP_USERS_LIMIT}`, {
      credentials: 'include'
    });

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const payload = await response.json();
    const users = Array.isArray(payload?.users) ? payload.users : [];
    renderTopUsers(users);
  } catch (error) {
    console.error('Error loading top users:', error);
    renderTopUsersPlaceholder('Unable to load top users right now.');
  }
}

async function loadTopTeamsToday() {
  const list = document.getElementById('topTeamsList');
  if (!list) {
    return;
  }

  renderTopTeamsPlaceholder('Loading top teams…');

  try {
    // Get org-team mappings from API
    const orgTeamMappings = await getOrgTeamMappings();

    // Build query parameters
    const params = new URLSearchParams({
      days: TOP_TEAMS_LOOKBACK_DAYS.toString(),
      limit: TOP_TEAMS_LIMIT.toString(),
      mappings: JSON.stringify(orgTeamMappings)
    });

    const response = await fetch(`/api/top-teams-today?${params}`, {
      credentials: 'include'
    });

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const payload = await response.json();
    const teams = Array.isArray(payload?.teams) ? payload.teams : [];
    renderTopTeams(teams);
  } catch (error) {
    console.error('Error loading top teams:', error);
    renderTopTeamsPlaceholder('Unable to load top teams right now.');
  }
}

async function loadChartData(days = currentDays) {
  const fetchStartTime = performance.now();
  try {
    currentDays = days;
    const response = await fetch(`/api/daily-stats?days=${days}&byEventType=true`, {
      credentials: 'include' // Ensure cookies are sent
    });
    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('Invalid stats response');
    }

    recordServerStatsFetch(performance.now() - fetchStartTime);

    // If no data, show the page anyway
    if (data.length === 0 && isInitialChartLoad) {
      isInitialChartLoad = false;
      const container = document.querySelector('.container');
      if (container) {
        container.style.visibility = 'visible';
        container.style.opacity = '1';
      }
      const chartEl = document.getElementById('eventsChart');
      if (chartEl) {
        chartEl.style.visibility = 'visible';
      }
    }

    const chartInstance = initChart();
    if (!chartInstance) {
      // If ECharts is not loaded yet, wait for it
      window.addEventListener('echartsLoaded', () => {
        loadChartData(days);
      }, { once: true });
      return;
    }

    const hasBreakdown = data.length > 0 &&
			(data[0].startSessionsWithoutEnd !== undefined || data[0].toolEvents !== undefined);

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#a1a1aa' : '#52525b';
    const gridColor = isDark ? '#50515c' : '#eaecf2';
    const faintGridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';
    const axisPointerBg = isDark ? '#27272a' : '#ffffff';

    // Colors for start sessions without end (match session badge blue)
    const startSessionsColor = SESSION_START_SERIES_COLOR;

    // Colors for tool events (match tool badge purple)
    const toolEventsColor = '#8e81ea';

    // Colors for error events (match header icon red)
    const errorEventsColor = '#ef4444';

    const totalEventsColor = toolEventsColor;

    // Prepare data for ECharts
    const FUTURE_POINTS = 0; // Do not show future days; use only observed days
    const _dates = data.map(item => item.date);
    const weekdayLabels = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const labels = data.map(item => {
      const date = new Date(item.date);
      const dayIndex = date.getDay();
      const dayNumber = date.getDate();
      return `${weekdayLabels[dayIndex] || ''} ${dayNumber}`;
    });

    // Add future labels for trend extrapolation (disabled when FUTURE_POINTS = 0)
    const futureLabels = [];
    for (let i = 1; i <= FUTURE_POINTS; i++) {
      const futureDate = new Date(_dates[_dates.length - 1]);
      futureDate.setDate(futureDate.getDate() + i);
      const dayIndex = futureDate.getDay();
      const dayNumber = futureDate.getDate();
      futureLabels.push(`${weekdayLabels[dayIndex] || ''} ${dayNumber}`);
    }
    const extendedLabels = [...labels, ...futureLabels];

    let series = [];
    let legendData = [];

    if (hasBreakdown) {
      const startSessionsData = data.map(item => {
        const value = Number(item.startSessionsWithoutEnd);
        return Number.isFinite(value) ? value : 0;
      });
      const toolEventsData = data.map(item => {
        const value = Number(item.toolEvents);
        return Number.isFinite(value) ? value : 0;
      });
      const errorEventsData = data.map(item => {
        const value = Number(item.errorEvents);
        return Number.isFinite(value) ? value : 0;
      });

      series = [
        {
          name: 'Start Sessions',
          type: 'bar',
          barWidth: 2,
          barGap: '2px',
          data: startSessionsData,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(33, 149, 207, 0.16)' },
              { offset: 1, color: startSessionsColor }
            ]),
            borderRadius: [4, 4, 0, 0]
          },
          label: {
            show: true,
            position: 'top',
            formatter: function(params) {
              const value = Number(params.value);
              if (!Number.isFinite(value)) return '';
              if (value === 0) return '{zero| }';
              return `{val|${value}}`;
            },
            rich: {
              val: {
                fontSize: 9.8,
                color: '#ffffff',
                backgroundColor: startSessionsColor,
                padding: [2, 5],
                borderRadius: 999
              },
              zero: {
                fontSize: 1,
                lineHeight: 1,
                height: 1,
                color: 'transparent',
                backgroundColor: startSessionsColor,
                padding: [0, 3],
                borderRadius: 1
              }
            },
            distance: 1,
            offset: [-9, -2]
          },
          emphasis: {
            focus: 'series',
            itemStyle: {
              color: startSessionsColor
            }
          }
        },
        {
          name: 'Tool Events',
          type: 'bar',
          barWidth: 2,
          barGap: '2px',
          data: toolEventsData,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(142, 129, 234, 0.16)' },
              { offset: 1, color: toolEventsColor }
            ]),
            borderRadius: [4, 4, 0, 0]
          },
          label: {
            show: true,
            position: 'top',
            formatter: function(params) {
              const value = Number(params.value);
              if (!Number.isFinite(value)) return '';
              if (value === 0) return '{zero| }';
              return `{val|${value}}`;
            },
            rich: {
              val: {
                fontSize: 9.8,
                color: '#ffffff',
                backgroundColor: toolEventsColor,
                padding: [2, 5],
                borderRadius: 999
              },
              zero: {
                fontSize: 1,
                lineHeight: 1,
                height: 1,
                color: 'transparent',
                backgroundColor: toolEventsColor,
                padding: [0, 3],
                borderRadius: 1
              }
            },
            distance: 1,
            offset: [0, -2]
          },
          emphasis: {
            focus: 'series',
            itemStyle: {
              color: toolEventsColor
            }
          }
        },
        {
          name: 'Errors',
          type: 'bar',
          barWidth: 2,
          barGap: '2px',
          data: errorEventsData,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(239, 68, 68, 0.16)' },
              { offset: 1, color: errorEventsColor }
            ]),
            borderRadius: [4, 4, 0, 0]
          },
          label: {
            show: true,
            position: 'top',
            formatter: function(params) {
              const value = Number(params.value);
              if (!Number.isFinite(value)) return '';
              if (value === 0) return '{zero| }';
              return `{val|${value}}`;
            },
            rich: {
              val: {
                fontSize: 9.8,
                color: '#ffffff',
                backgroundColor: errorEventsColor,
                padding: [2, 5],
                borderRadius: 999
              },
              zero: {
                fontSize: 1,
                lineHeight: 1,
                height: 1,
                color: 'transparent',
                backgroundColor: errorEventsColor,
                padding: [0, 3],
                borderRadius: 1
              }
            },
            distance: 1,
            offset: [9, -2]
          },
          emphasis: {
            focus: 'series',
            itemStyle: {
              color: errorEventsColor
            }
          }
        }
      ];

      // Calculate trend line for tool events (most representative metric)
      const trimmedToolEvents = trimTrailingZeros(toolEventsData);
      const trendLineSource = trimmedToolEvents.length >= 2 ? trimmedToolEvents : toolEventsData;
      const trendLine = generateTrendLine(trendLineSource, FUTURE_POINTS);
      const trendColor = '#fbbf24'; // Amber color for trend line
      const trendLineGradient = new echarts.graphic.LinearGradient(0, 0, 1, 0, [
        { offset: 0, color: 'rgba(250, 204, 21, 1)' }, // yellow (past)
        { offset: 1, color: 'rgba(251, 146, 60, 1)' }  // softer orange (future)
      ]);

      // Add trend line series with gradient from orange (past) to red (future)

      series.push({
        name: 'Trend',
        type: 'line',
        data: [...trendLine.trendData, ...trendLine.extrapolatedData],
        smooth: 0.6,
        symbol: 'none',
        zlevel: 0,
        z: -1,
        lineStyle: {
          width: 1,
          type: 'solid',
          color: trendLineGradient,
          opacity: 0.3,
          shadowColor: 'rgba(249, 115, 22, 0.35)',
          shadowBlur: 8,
          shadowOffsetY: 4
        },
        itemStyle: {
          color: trendColor
        },
        emphasis: {
          focus: 'series',
          lineStyle: {
            width: 3
          }
        }
      });

      legendData = [
        { name: 'Start Sessions', icon: 'circle', itemStyle: { color: startSessionsColor } },
        { name: 'Tool Events', icon: 'circle', itemStyle: { color: toolEventsColor } },
        { name: 'Errors', icon: 'circle', itemStyle: { color: errorEventsColor } },
        { name: 'Trend', icon: 'line', itemStyle: { color: trendColor } }
      ];
    } else {
      const totalEventsData = data.map(item => Number(item.count ?? item.total ?? 0));
      const totalEventsDataWithZeroes = totalEventsData.map(value => {
        const num = Number(value);
        return Number.isFinite(num) ? num : 0;
      });
      const trimmedTotalEvents = trimTrailingZeros(totalEventsDataWithZeroes);

      series = [
        {
          name: 'Events',
          type: 'bar',
          barWidth: 2,
          barGap: '2px',
          data: totalEventsDataWithZeroes,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(142, 129, 234, 0.16)' },
              { offset: 1, color: totalEventsColor }
            ]),
            borderRadius: [4, 4, 0, 0]
          },
          label: {
            show: true,
            position: 'top',
            formatter: function(params) {
              const value = Number(params.value);
              if (!Number.isFinite(value)) return '';
              if (value === 0) return '{zero| }';
              return `{val|${value}}`;
            },
            rich: {
              val: {
                fontSize: 9.8,
                color: '#ffffff',
                backgroundColor: totalEventsColor,
                padding: [2, 5],
                borderRadius: 999
              },
              zero: {
                fontSize: 1,
                lineHeight: 1,
                height: 1,
                color: 'transparent',
                backgroundColor: totalEventsColor,
                padding: [0, 3],
                borderRadius: 1
              }
            },
            distance: 1
          },
          emphasis: {
            focus: 'series',
            itemStyle: {
              color: totalEventsColor
            }
          }
        }
      ];

      // Calculate trend line for total events
      const trendLineSource = trimmedTotalEvents.length >= 2 ? trimmedTotalEvents : totalEventsDataWithZeroes;
      const trendLine = generateTrendLine(trendLineSource, FUTURE_POINTS);
      const trendColor = '#fbbf24'; // Amber color for trend line
      const trendLineGradient = new echarts.graphic.LinearGradient(0, 0, 1, 0, [
        { offset: 0, color: 'rgba(250, 204, 21, 1)' }, // yellow (past)
        { offset: 1, color: 'rgba(251, 146, 60, 1)' }  // softer orange (future)
      ]);

      // Add trend line series with gradient from orange (past) to red (future)
      const _totalDataPoints = trendLine.trendData.length + trendLine.extrapolatedData.length;
      series.push({
        name: 'Trend',
        type: 'line',
        data: [...trendLine.trendData, ...trendLine.extrapolatedData],
        smooth: 0.6,
        symbol: 'none',
        zlevel: 0,
        z: -1,
        lineStyle: {
          width: 1,
          type: 'solid',
          color: trendLineGradient,
          opacity: 0.3,
          shadowColor: 'rgba(249, 115, 22, 0.35)',
          shadowBlur: 8,
          shadowOffsetY: 4
        },
        itemStyle: {
          color: trendColor
        },
        emphasis: {
          focus: 'series',
          lineStyle: {
            width: 3
          }
        }
      });

      legendData = [
        { name: 'Events', icon: 'circle', itemStyle: { color: totalEventsColor } },
        { name: 'Trend', icon: 'line', itemStyle: { color: trendColor } }
      ];
    }

    updateChartLegendOverlay(legendData);

    const option = {
      textStyle: {
        fontFamily: 'Inter, \'Manrope\', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif'
      },
      animation: true,
      animationDuration: 350,
      grid: {
        left: '3%',
        right: '0%',
        bottom: '14%',
        top: '5%',
        containLabel: false,
        width: 'auto',
        height: 'auto'
      },
      tooltip: {
        show: false
      },
      legend: {
        show: false,
        data: legendData
      },
      xAxis: {
        type: 'category',
        data: extendedLabels,
        // Add a small gap so the trend line can extend slightly past today
        boundaryGap: ['5%', '10%'],
        axisLabel: {
          color: textColor,
          fontSize: 12,
          interval: 0,
          margin: 18
        },
        axisLine: {
          show: false
        },
        axisTick: {
          show: false
        },
        splitLine: {
          show: false
        }
      },
      yAxis: {
        type: 'value',
        min: 0,
        axisLabel: {
          show: false
        },
        axisLine: {
          show: false
        },
        axisTick: {
          show: false
        },
        axisPointer: {
          label: {
            show: true,
            backgroundColor: axisPointerBg,
            color: textColor,
            borderColor: gridColor,
            borderWidth: 1,
            padding: [4, 6]
          }
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: faintGridColor,
            width: 1
          }
        }
      },
      series: series
    };

    chartInstance.setOption(option);
    chartInstance.resize();

    // Listen for chart rendering completion
    const onChartFinished = () => {
      chartInstance.off('finished', onChartFinished);

      // Show the chart once rendering is complete
      const chartEl = document.getElementById('eventsChart');
      if (chartEl) {
        chartEl.style.visibility = 'visible';
      }

      // Show the container if this is the initial load
      if (isInitialChartLoad) {
        isInitialChartLoad = false;
        const container = document.querySelector('.container');
        if (container) {
          container.style.visibility = 'visible';
          requestAnimationFrame(() => {
            container.style.opacity = '1';
          });
        }
      }
    };

    chartInstance.on('finished', onChartFinished);
    chartInstance.resize();
  } catch (error) {
    console.error('Error loading chart data:', error);
    // If this is the initial load and there's an error, show the page anyway
    if (isInitialChartLoad) {
      isInitialChartLoad = false;
      const container = document.querySelector('.container');
      if (container) {
        container.style.visibility = 'visible';
        container.style.opacity = '1';
      }
    }
  }
}

// Expose functions used by inline handlers / shared markup
// Note: showUserMenu and handleLogout are now exposed by user-menu.js
Object.assign(window, {
  clearLocalData,
  toggleTheme,
  openSettingsModal,
  refreshDashboard
});

// Chart will be loaded after authentication check

// Rehydrate dashboard when returning via soft navigation
window.addEventListener('softNav:pageMounted', (event) => {
  if (event?.detail?.path === '/') {
    updateServerStatsVisibility();
    initializeDashboardPage({ resetState: true });
  }
});
