// @ts-nocheck
// Dashboard constants
const SESSION_START_SERIES_COLOR = '#2195cf';
const TOP_USERS_LOOKBACK_DAYS = 14;
const TOP_USERS_LIMIT = 3;
const TOP_TEAMS_LOOKBACK_DAYS = 30;
const TOP_TEAMS_LIMIT = 5;
const SERVER_VERSION_LABEL = 'v1.0.0';
const REFRESH_ICON_ANIMATION_DURATION_MS = 700;
const DEFAULT_DASHBOARD_TIME_RANGE_DAYS = 30;
let serverStatsLastFetchTime = null;
let serverStatsUpdateIntervalId = null;
let _autoRefreshEnabledState = false;
let autoRefreshIntervalMinutes = '';
let currentDays = DEFAULT_DASHBOARD_TIME_RANGE_DAYS;

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

	// Always restore saved time range from localStorage, default to last month if not found
	const savedTimeRange = localStorage.getItem('dashboardTimeRange');
	currentDays = savedTimeRange ? parseInt(savedTimeRange, 10) : DEFAULT_DASHBOARD_TIME_RANGE_DAYS;

	if (resetState) {
		isInitialChartLoad = true;
		resetServerStatsUi();
	}

	// Always set the combobox value to match the current days
	const timeRangeSelect = document.getElementById('timeRangeSelect');
	if (timeRangeSelect) {
		timeRangeSelect.value = String(currentDays);
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
				// Save selected time range to localStorage
				localStorage.setItem('dashboardTimeRange', resolvedDays.toString());
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
	const theme = savedTheme || 'light';
	applyTheme(theme);
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
	const savedTheme = localStorage.getItem('theme') || 'light';
	const isDarkTheme = savedTheme === 'dark';
	const autoRefreshInterval = autoRefreshIntervalMinutes;

	// Build sidebar navigation
	const sidebarNav = `
    <a href="#settings-general" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-[color:var(--text-primary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-secondary)]">
	 <span class="w-5 h-5 flex items-center justify-center">
        <i class="fa-solid fa-gear text-[12px]"></i>
      </span>
      <span class="font-medium">General</span>
    </a>
    ${isAdministrator ? `
    <a href="#settings-users" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-[color:var(--text-primary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-secondary)]">
      <span class="w-5 h-5 flex items-center justify-center">
        <i class="fa-solid fa-user-gear text-[12px]"></i>
      </span>
      <span class="font-medium">Users</span>
    </a>
    ` : ''}
    ${isAdministrator ? `
    <a href="#settings-import-export" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-[color:var(--text-primary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-secondary)]">
      <span class="w-5 h-5 flex items-center justify-center">
        <i class="fa-solid fa-database text-[12px]"></i>
      </span>
      <span class="font-medium">Import/Export</span>
    </a>
    ` : ''}
    <a href="#settings-danger" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-[color:var(--text-primary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-secondary)]">
      <span class="w-5 h-5 flex items-center justify-center">
        <i class="fa-solid fa-triangle-exclamation text-[12px]"></i>
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
					<section id="settings-general" class="settings-section">
						<div class="settings-modal-placeholder-title">General</div>
						<label class="flex items-center justify-between cursor-pointer py-2">
							<div class="flex flex-col">
								<span class="text-sm font-medium text-[color:var(--text-primary)]">Dark theme</span>
								<span class="text-xs text-[color:var(--text-primary)]">Switch between light and dark color scheme.</span>
							</div>
							<div class="group relative inline-flex w-11 shrink-0 rounded-full bg-gray-200 p-0.5 inset-ring inset-ring-gray-900/5 outline-offset-2 outline-indigo-600 transition-colors duration-200 ease-in-out has-checked:bg-indigo-600 has-focus-visible:outline-2">
								<span class="size-5 rounded-full bg-white shadow-xs ring-1 ring-gray-900/5 transition-transform duration-200 ease-in-out group-has-checked:translate-x-5"></span>
								<input type="checkbox" id="darkThemeToggle" ${isDarkTheme ? 'checked' : ''} aria-label="Dark theme" class="absolute inset-0 appearance-none focus:outline-hidden">
							</div>
						</label>
						<div class="settings-toggle-row" style="margin-top: 16px;">
							<div class="settings-toggle-text" style="flex: 1;">
								<div class="settings-toggle-title">Automatic refresh</div>
								<div class="settings-toggle-description">
									Automatically refresh the events list at the specified interval.
								</div>
							</div>
							<div style="display: flex; align-items: center; gap: 8px;">
								<select id="autoRefreshInterval" name="autoRefreshInterval"
									class="auto-refresh-interval block w-full rounded-md bg-white py-1.5 pr-3 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6">
									<option value="" ${autoRefreshInterval === '' ? 'selected' : ''}>Off</option>
									<option value="3" ${autoRefreshInterval === '3' ? 'selected' : ''}>3 minutes</option>
									<option value="5" ${autoRefreshInterval === '5' ? 'selected' : ''}>5 minutes</option>
									<option value="10" ${autoRefreshInterval === '10' ? 'selected' : ''}>10 minutes</option>
									<option value="15" ${autoRefreshInterval === '15' ? 'selected' : ''}>15 minutes</option>
								</select>
							</div>
						</div>
					</section>
					${isAdministrator ? `
					<section id="settings-users" class="settings-section settings-users-section" style="display: none;">
						<div class="settings-users-header">
							<div class="settings-modal-placeholder-title settings-users-title">User Management</div>
							<button type="button" class="confirm-modal-btn settings-users-add-btn" id="addUserBtn">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style="margin-right: 6px;">
									<path fill-rule="evenodd" d="M12 2.25a5.25 5.25 0 0 0-3.717 8.966 8.252 8.252 0 0 0-4.367 7.284.75.75 0 0 0 1.5 0 6.75 6.75 0 1 1 13.5 0 .75.75 0 0 0 1.5 0 8.252 8.252 0 0 0-4.366-7.284A5.25 5.25 0 0 0 12 2.25Zm0 1.5a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5Z" clip-rule="evenodd"/>
								</svg>
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
					${isAdministrator ? `
					<section id="settings-import-export" class="settings-danger-section">
						<div class="settings-modal-placeholder-title">Import/Export</div>
						<div class="settings-modal-placeholder-text">
							<div class="settings-toggle-row" style="align-items: flex-start;">
								<div class="settings-toggle-text">
									<div class="settings-toggle-title">Export database</div>
									<div class="settings-toggle-description">
										Download a complete backup of the database as a JSON file. This includes all telemetry events, users, teams, organizations, and settings.
									</div>
								</div>
								<div class="settings-toggle-actions">
									<button type="button" class="confirm-modal-btn" id="exportDatabaseBtn">
										<i class="fa-solid fa-download"></i>
										Export database
									</button>
								</div>
							</div>
							<div class="settings-toggle-row" style="align-items: flex-start; margin-top: 8px;">
								<div class="settings-toggle-text">
									<div class="settings-toggle-title">Import database</div>
									<div class="settings-toggle-description">
										Import data from a previously exported database JSON file. This will merge the imported data with the existing database. Existing records with the same ID will be replaced.
									</div>
								</div>
								<div class="settings-toggle-actions">
									<input type="file" id="importDatabaseInput" accept=".json" style="display: none;">
									<button type="button" class="confirm-modal-btn" id="importDatabaseBtn">
										<i class="fa-solid fa-upload"></i>
										Import database
									</button>
								</div>
							</div>
							<div id="importProgressContainer" style="display: none; margin-top: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 6px;">
								<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
									<span class="settings-users-spinner" style="width: 16px; height: 16px;"></span>
									<span id="importProgressText" style="font-size: 14px; color: var(--text-primary);">Importing database...</span>
								</div>
								<div style="width: 100%; height: 4px; background: var(--border-color); border-radius: 2px; overflow: hidden;">
									<div id="importProgressBar" style="width: 0%; height: 100%; background: var(--color-primary); transition: width 0.3s ease;"></div>
								</div>
							</div>
						</div>
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
                    <i class="fa-solid fa-broom"></i>
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
                      <i class="fa-solid fa-trash-can"></i>
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

	backdrop.appendChild(modal);
	document.body.appendChild(backdrop);

	requestAnimationFrame(() => {
		backdrop.classList.add('visible');
	});

	function closeSettingsModal() {
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

	const darkThemeToggle = modal.querySelector('#darkThemeToggle');
	if (darkThemeToggle) {
		darkThemeToggle.addEventListener('change', (e) => {
			const newTheme = e.target.checked ? 'dark' : 'light';
			localStorage.setItem('theme', newTheme);
			applyTheme(newTheme);
		});
	}

	const autoRefreshIntervalInput = modal.querySelector('#autoRefreshInterval');

	if (autoRefreshIntervalInput) {
		const handleAutoRefreshChange = (e) => {
			let interval = (e.target.value || '').trim();
			if (!interval) {
				interval = '';
			}
			autoRefreshIntervalMinutes = interval;
			_autoRefreshEnabledState = interval !== '';
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

	// Export/Import database functionality (only for administrators)
	if (isAdministrator) {
		const exportDatabaseBtn = modal.querySelector('#exportDatabaseBtn');
		if (exportDatabaseBtn) {
			exportDatabaseBtn.addEventListener('click', async () => {
				try {
					exportDatabaseBtn.disabled = true;
					exportDatabaseBtn.innerHTML = '<span class="settings-users-spinner" style="width: 14px; height: 14px; margin-right: 6px;"></span>Exporting...';

					const response = await fetch('/api/database/export', {
						method: 'GET',
						headers: {
							'Content-Type': 'application/json',
							'X-CSRF-Token': await window.getCsrfToken()
						},
						credentials: 'include'
					});

					if (!response.ok) {
						const error = await response.json();
						throw new Error(error.message || 'Failed to export database');
					}

					const blob = await response.blob();
					const url = window.URL.createObjectURL(blob);
					const a = document.createElement('a');
					a.href = url;
					a.download = `database-export-${new Date().toISOString().split('T')[0]}.json`;
					document.body.appendChild(a);
					a.click();
					window.URL.revokeObjectURL(url);
					document.body.removeChild(a);

					window.showToast('Database exported successfully', 'success');
				} catch (error) {
					console.error('Error exporting database:', error);
					window.showToast('Failed to export database: ' + error.message, 'error');
				} finally {
					exportDatabaseBtn.disabled = false;
					exportDatabaseBtn.innerHTML = '<i class="fa-solid fa-download" style="margin-right: 6px;"></i>Export database';
				}
			});
		}

		const importDatabaseBtn = modal.querySelector('#importDatabaseBtn');
		const importDatabaseInput = modal.querySelector('#importDatabaseInput');
		if (importDatabaseBtn && importDatabaseInput) {
			importDatabaseBtn.addEventListener('click', () => {
				importDatabaseInput.click();
			});

			importDatabaseInput.addEventListener('change', async (e) => {
				const file = e.target.files[0];
				if (!file) return;

				if (!file.name.endsWith('.json')) {
					window.showToast('Please select a valid JSON file', 'error');
					importDatabaseInput.value = '';
					return;
				}

				try {
					const progressContainer = modal.querySelector('#importProgressContainer');
					const progressText = modal.querySelector('#importProgressText');
					const progressBar = modal.querySelector('#importProgressBar');

					progressContainer.style.display = 'block';
					progressText.textContent = 'Reading file...';
					progressBar.style.width = '10%';
					importDatabaseBtn.disabled = true;

					const fileContent = await file.text();
					let importData;
					try {
						importData = JSON.parse(fileContent);
					} catch (_parseError) {
						throw new Error('Invalid JSON file format');
					}

					progressText.textContent = 'Uploading to server...';
					progressBar.style.width = '30%';

					const response = await fetch('/api/database/import', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'X-CSRF-Token': await window.getCsrfToken()
						},
						credentials: 'include',
						body: JSON.stringify(importData)
					});

					progressBar.style.width = '60%';
					progressText.textContent = 'Processing import...';

					if (!response.ok) {
						const error = await response.json();
						throw new Error(error.message || 'Failed to import database');
					}

					const result = await response.json();
					progressBar.style.width = '100%';
					progressText.textContent = 'Import completed!';

					const errorMsg = result.errors && result.errors.length > 0
						? ` (${result.errors.length} errors)`
						: '';
					window.showToast(`Database imported successfully: ${result.imported} records imported${errorMsg}`, 'success');

					if (result.errors && result.errors.length > 0) {
						console.warn('Import errors:', result.errors);
					}

					setTimeout(() => {
						progressContainer.style.display = 'none';
						progressBar.style.width = '0%';
					}, 2000);

					// Reload the page after successful import to refresh all data
					setTimeout(() => {
						window.location.reload();
					}, 2500);
				} catch (error) {
					console.error('Error importing database:', error);
					window.showToast('Failed to import database: ' + error.message, 'error');
					const progressContainer = modal.querySelector('#importProgressContainer');
					if (progressContainer) {
						progressContainer.style.display = 'none';
					}
				} finally {
					importDatabaseInput.value = '';
					importDatabaseBtn.disabled = false;
				}
			});
		}
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
            <select id="createUserRole" name="role" required
              style="margin-top: 4px; width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 14px;">
              <option value="basic">Basic</option>
              <option value="advanced">Advanced</option>
              <option value="administrator">Administrator</option>
            </select>
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
							headers: window.getRequestHeaders(),
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
							headers: window.getRequestHeaders(),
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
            <select id="editUserRole" name="role" required
              style="margin-top: 4px; width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 14px;">
              <option value="basic" ${currentRole === 'basic' ? 'selected' : ''}>Basic</option>
              <option value="advanced" ${currentRole === 'advanced' ? 'selected' : ''}>Advanced</option>
              <option value="administrator" ${currentRole === 'administrator' ? 'selected' : ''}>Administrator</option>
            </select>
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
							headers: window.getRequestHeaders(),
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
						headers: window.getRequestHeaders(false), // No Content-Type for DELETE
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

// Initialize theme
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => {
		initTheme();
		ensureUserMenuStructure();
		setupIconButtonsGroupHover();
	});
} else {
	initTheme();
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
let isInitialChartLoad = true; // Track if this is the initial chart load
let savedChartOption = null; // Store chart option when pausing for cache restoration
let chartResizeObserver = null;

function revealDashboardShell() {
	const body = document.body;
	if (body.classList.contains('hydrating')) {
		body.classList.remove('hydrating');
	}
	// Container is now visible by default for better LCP
	// Only reveal the chart area when ready
	const chartEl = document.getElementById('eventsChart');
	if (chartEl) {
		chartEl.style.visibility = 'visible';
		chartEl.style.opacity = '1';
	}
}

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
		const smoothed = calculateExponentialSmoothing(dataPoints, 0.55); // menys smoothing
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

function attachChartResizeObserver(chartEl) {
	if (typeof ResizeObserver === 'undefined' || !chartEl) {
		return;
	}
	if (chartResizeObserver) {
		chartResizeObserver.disconnect();
	}
	chartResizeObserver = new ResizeObserver(() => {
		chart?.resize();
	});
	chartResizeObserver.observe(chartEl);
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
	attachChartResizeObserver(chartEl);
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
		renderTopUsersPlaceholder('No events recorded in the last 14 days yet.');
		return;
	}

	const items = users.map((user, index) => {
		const name = user.label || user.id || 'Unknown user';
		const initial = getUserInitials(name);
		const eventCount = Number(user.eventCount) || 0;
		const countLabel = eventCount === 1 ? '1 event last 14 days' : `${eventCount} events last 14 days`;
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
		const _countLabel = eventCount === 1 ? '1 event last 30 days' : `${eventCount} events last 30 days`;
		const clientName = team.clientName ? team.clientName : '';
		const orgNames = Array.isArray(team.orgs)
			? team.orgs
				.map(name => typeof name === 'string' ? name.trim() : '')
				.filter(name => name.length > 0)
			: [];
		const orgText = orgNames.length > 0
			? orgNames.map(name => escapeHtml(name)).join(' · ')
			: (clientName ? escapeHtml(clientName) : escapeHtml('No org events recorded yet'));
		const orgSubtitle = `
			<span class="top-teams-orgs" style="display: inline-flex; align-items: center; gap: 6px;">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="size-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z" />
				</svg>
				<span>${orgText}</span>
			</span>
		`.trim();
		const badgeBackground = index === 0 ? '#dc2626' : SESSION_START_SERIES_COLOR;
		const logoUrl = team.logoUrl || (team.teamId && team.hasLogo ? `/api/teams/${team.teamId}/logo` : '');

		const avatar = logoUrl
			? `
        <span class="top-users-avatar top-users-avatar--team" style="padding: 0; background: transparent; border-radius: 0;">
          <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(teamName)} logo" style="object-fit: contain;" onerror="this.style.display='none'; const fallback=this.nextElementSibling; if (fallback) { fallback.style.display='flex'; }">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="width: 32px; height: 32px; color: ${team.color || badgeBackground}; display:none;">
            <path d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
          </svg>
        </span>
      `
			: `
        <span class="top-users-avatar top-users-avatar--team">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="width: 32px; height: 32px; color: ${team.color || badgeBackground};">
            <path d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
          </svg>
        </span>
      `;

		return `
      <li class="top-users-item">
        ${avatar}
        <div class="top-users-info">
          <div class="top-users-name-row">
            <strong class="top-users-name" title="${escapeHtml(teamName)}">${escapeHtml(teamName)}</strong>
            <span class="top-users-badge" style="background: ${badgeBackground}; color: #ffffff;">${escapeHtml(String(eventCount))} events</span>
          </div>
          <div class="top-users-role">
						${orgSubtitle}
					</div>
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
		const params = new URLSearchParams({
			days: TOP_TEAMS_LOOKBACK_DAYS.toString(),
			limit: TOP_TEAMS_LIMIT.toString()
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
		if (!Array.isArray(data)) {
			throw new Error('Invalid stats response');
		}

		recordServerStatsFetch(performance.now() - fetchStartTime);

		if (data.length === 0 && isInitialChartLoad) {
			isInitialChartLoad = false;
			revealDashboardShell();
		}

		const chartInstance = initChart();
		if (!chartInstance) {
			window.addEventListener('echartsLoaded', () => loadChartData(days), { once: true });
			return;
		}

		const hasBreakdown =
		data.length > 0 &&
		(data[0].startSessionsWithoutEnd !== undefined || data[0].toolEvents !== undefined);

		const isDark = document.documentElement.classList.contains('dark');
		const textColor = isDark ? '#a1a1aa' : '#52525b';
		const gridColor = isDark ? '#50515c' : '#eaecf2';
		const faintGridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';
		const axisPointerBg = isDark ? '#27272a' : '#ffffff';

		const startSessionsColor = SESSION_START_SERIES_COLOR;
		const toolEventsColor = '#8e81ea';
		const errorEventsColor = '#ef4444';
		const totalEventsColor = toolEventsColor;

		const FUTURE_POINTS = 0;

		const _dates = data.map(item => item.date);
		const weekdayLabels = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
		const labels = data.map(item => {
			const date = new Date(item.date);
			const dayIndex = date.getDay();
			const dayNumber = date.getDate();
			return `${weekdayLabels[dayIndex] || ''} ${dayNumber}`;
		});

		const futureLabels = [];
		for (let i = 1; i <= FUTURE_POINTS; i++) {
			const futureDate = new Date(_dates[_dates.length - 1]);
			futureDate.setDate(futureDate.getDate() + i);
			const dayIndex = futureDate.getDay();
			const dayNumber = futureDate.getDate();
			// Mostrar etiqueta només per als dilluns
			futureLabels.push(dayIndex === 1 ? `DL ${dayNumber}` : '');
		}
		const extendedLabels = [...labels, ...futureLabels];

		// -------------------------
		// Helpers (spline + densify)
		// -------------------------
		function naturalCubicSplineYs(y) {
			const n = y.length;
			if (n < 3) return (x) => y[Math.round(Math.max(0, Math.min(n - 1, x)))];

			const a = y.slice();
			const b = new Array(n - 1).fill(0);
			const d = new Array(n - 1).fill(0);

			const alpha = new Array(n).fill(0);
			for (let i = 1; i < n - 1; i++) {
				alpha[i] = 3 * (a[i + 1] - 2 * a[i] + a[i - 1]);
			}

			const l = new Array(n).fill(0);
			const mu = new Array(n).fill(0);
			const z = new Array(n).fill(0);
			const c = new Array(n).fill(0);

			l[0] = 1;
			for (let i = 1; i < n - 1; i++) {
				l[i] = 4 - mu[i - 1];
				mu[i] = 1 / l[i];
				z[i] = (alpha[i] - z[i - 1]) / l[i];
			}
			l[n - 1] = 1;

			for (let j = n - 2; j >= 0; j--) {
				c[j] = z[j] - mu[j] * c[j + 1];
				b[j] = (a[j + 1] - a[j]) - (2 * c[j] + c[j + 1]) / 3;
				d[j] = (c[j + 1] - c[j]) / 3;
			}

			return function evalSpline(x) {
				const i = Math.min(n - 2, Math.max(0, Math.floor(x)));
				const dx = x - i;
				return a[i] + b[i] * dx + c[i] * dx * dx + d[i] * dx * dx * dx;
			};
		}

		function densifyTrendY(yValues, samplesPerSegment = 25) {
			const f = naturalCubicSplineYs(yValues);
			const n = yValues.length;
			if (n === 0) return [];

			const out = [];
			for (let i = 0; i < n - 1; i++) {
				for (let s = 0; s < samplesPerSegment; s++) {
					const x = i + s / samplesPerSegment;
					out.push([x, Math.max(0, f(x))]);
				}
			}
			out.push([n - 1, Math.max(0, f(n - 1))]);
			return out;
		}

		function weightedMovingAverage(y, weights = [1, 2, 3, 2, 1]) {
			const half = Math.floor(weights.length / 2);
			return y.map((_, i) => {
				let acc = 0;
				let wAcc = 0;
				for (let k = -half; k <= half; k++) {
					const idx = i + k;
					if (idx >= 0 && idx < y.length) {
						const w = weights[k + half];
						acc += y[idx] * w;
						wAcc += w;
					}
				}
				return wAcc ? acc / wAcc : y[i];
			});
		}

		function smoothSeries(y, passes = 2, weights = [1, 2, 3, 2, 1]) {
			let out = y.slice();
			for (let p = 0; p < passes; p++) {
				out = weightedMovingAverage(out, weights);
			}
			return out;
		}

		function buildDenseTrendSeries(trendLineSource, fullLen, trendLine, samplesPerSegment = 100) {
			const yTrendRaw = [...trendLine.trendData, ...trendLine.extrapolatedData];

			// ⭐️ Important: if we trimmed trailing zeros for fitting, the trend array can end earlier
			// than the number of categories we still display (because we still show those zero days).
			// Extend the trend to the full displayed length so the line reaches the last label.
			const safeLast = yTrendRaw.length ? yTrendRaw[yTrendRaw.length - 1] : 0;
			const missing = Math.max(0, (fullLen || 0) - yTrendRaw.length);
			const yTrendFull = missing > 0 ? [...yTrendRaw, ...Array(missing).fill(safeLast)] : yTrendRaw;

			// ⭐️ Nou: suavitzat per evitar zig-zag amb petites variacions
			// - passes: 1..3 (2 és un bon punt dolç)
			// - weights: pots provar [1,2,3,4,3,2,1] per encara més suavitat
			const yTrend = smoothSeries(yTrendFull, 1, [1, 2, 1]);
			const dense = densifyTrendY(yTrend, samplesPerSegment);

			// Align slightly to the left so it feels centered on category ticks
			const CATEGORY_CENTER_SHIFT = -0.35;
			const TREND_FUTURE_OFFSET = 0.14; // shift the whole trend line slightly to the right (towards the future)
			return dense.map(([x, y]) => [x + CATEGORY_CENTER_SHIFT + TREND_FUTURE_OFFSET, y]);		}

		function compressYAroundMean(points, factor = 0.88) {
			if (!points?.length) return points;
			let sum = 0;
			for (const [, y] of points) sum += y;
			const mean = sum / points.length;
			return points.map(([x, y]) => [x, mean + (y - mean) * factor]);
		}

		function makeRightFadeGradient(opacityBase = 0.3, fadeStart = 0) {
			const o = Math.max(0, Math.min(1, opacityBase));
			const fs = Math.max(0, Math.min(1, fadeStart));
			return new echarts.graphic.LinearGradient(0, 1, 1, 0, [
				{ offset: 0, color: `rgba(255, 183, 0, ${o})` },
				{ offset: fs, color: `rgba(255, 105, 0, ${o})` },
				{ offset: 1, color: 'rgba(255, 105, 0, 0)' }
			]);
		}

		// Badge micro-upsize
		const BADGE_FONT = 11; // abans 9.8
		const BADGE_PAD = [2, 6]; // abans [2,5]

		// Blur (hover) tuning
		const BAR_BLUR_OPACITY = 0.38;   // no tan bèstia
		const LABEL_BLUR_OPACITY = 0.35; // badges visibles
		const TREND_BLUR_OPACITY = 0.18; // trend no desapareix

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
						formatter: (params) => {
							const value = Number(params.value);
							if (!Number.isFinite(value)) return '';
							if (value === 0) return '{zero| }';
							return `{val|${value}}`;
						},
						rich: {
							val: {
								fontSize: BADGE_FONT,
								color: '#ffffff',
								backgroundColor: startSessionsColor,
								padding: BADGE_PAD,
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
						itemStyle: { opacity: 1 }
					},
					blur: {
						itemStyle: { opacity: BAR_BLUR_OPACITY },
						label: { opacity: LABEL_BLUR_OPACITY }
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
						formatter: (params) => {
							const value = Number(params.value);
							if (!Number.isFinite(value)) return '';
							if (value === 0) return '{zero| }';
							return `{val|${value}}`;
						},
						rich: {
							val: {
								fontSize: BADGE_FONT,
								color: '#ffffff',
								backgroundColor: toolEventsColor,
								padding: BADGE_PAD,
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
						itemStyle: { opacity: 1 }
					},
					blur: {
						itemStyle: { opacity: BAR_BLUR_OPACITY },
						label: { opacity: LABEL_BLUR_OPACITY }
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
						formatter: (params) => {
							const value = Number(params.value);
							if (!Number.isFinite(value)) return '';
							if (value === 0) return '{zero| }';
							return `{val|${value}}`;
						},
						rich: {
							val: {
								fontSize: BADGE_FONT,
								color: '#ffffff',
								backgroundColor: errorEventsColor,
								padding: BADGE_PAD,
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
						itemStyle: { opacity: 1 }
					},
					blur: {
						itemStyle: { opacity: BAR_BLUR_OPACITY },
						label: { opacity: LABEL_BLUR_OPACITY }
					}
				}
			];

			const trimmedToolEvents = trimTrailingZeros(toolEventsData);
			const trendLineSource = trimmedToolEvents.length >= 2 ? trimmedToolEvents : toolEventsData;
			// Use exponential smoothing for a more stable trend line when there are sparse days
			const trendLine = generateTrendLine(trendLineSource, FUTURE_POINTS, 'exponential');

			const denseTrendRaw = buildDenseTrendSeries(
				toolEventsData,
				extendedLabels.length,
				trendLine,
				30
			);

			const TREND_Y_COMPRESSION = 0.92;
			const denseTrend = compressYAroundMean(denseTrendRaw, TREND_Y_COMPRESSION);

			const BASE_OPACITY = 0.18;
			const FADE_START = 0.78;
			const trendLineGradient = new echarts.graphic.LinearGradient(0, 1, 1, 0, [
				{ offset: 0, color: `rgba(142, 129, 234, ${BASE_OPACITY})` }, // toolEventsColor with opacity
				{ offset: FADE_START, color: `rgba(142, 129, 234, ${BASE_OPACITY})` },
				{ offset: 1, color: 'rgba(142, 129, 234, 0)' }
			]);

			series.push({
				name: 'Trend',
				type: 'line',
				xAxisIndex: 1,
				data: denseTrend,
				smooth: false,
				symbol: 'none',
				zlevel: 0,
				z: -1,
				lineStyle: {
					width: 1,
					type: 'solid',
					color: trendLineGradient,
					shadowColor: 'rgba(142, 129, 234, 0.35)', // toolEventsColor shadow
					shadowBlur: 8,
					shadowOffsetY: 4
				},
				emphasis: {
					focus: 'series',
					lineStyle: { width: 3, opacity: 0.9 }
				},
				blur: {
					lineStyle: { opacity: TREND_BLUR_OPACITY }
				}
			});

			// Add trend line for Start Sessions (blue series)
			const trimmedStartSessions = trimTrailingZeros(startSessionsData);
			const startSessionsTrendLineSource = trimmedStartSessions.length >= 2 ? trimmedStartSessions : startSessionsData;
			const startSessionsTrendLine = generateTrendLine(startSessionsTrendLineSource, FUTURE_POINTS, 'exponential');

			const startSessionsDenseTrendRaw = buildDenseTrendSeries(
				startSessionsData,
				extendedLabels.length,
				startSessionsTrendLine,
				30
			);

			// Scale Y values by 2x for Start Sessions trend line
			const startSessionsDenseTrendScaled = startSessionsDenseTrendRaw.map(([x, y]) => [x, y * 2]);

			const startSessionsDenseTrend = compressYAroundMean(startSessionsDenseTrendScaled, TREND_Y_COMPRESSION);

			const startSessionsBaseOpacity = 0.50;
			const startSessionsTrendLineGradient = new echarts.graphic.LinearGradient(0, 1, 1, 0, [
				{ offset: 0, color: `rgba(33, 149, 207, ${startSessionsBaseOpacity})` },
				{ offset: FADE_START, color: `rgba(33, 149, 207, ${startSessionsBaseOpacity})` },
				{ offset: 1, color: 'rgba(33, 149, 207, 0)' }
			]);

			series.push({
				name: 'Start Sessions Trend',
				type: 'line',
				xAxisIndex: 1,
				data: startSessionsDenseTrend,
				smooth: false,
				symbol: 'none',
				zlevel: 0,
				z: -2,
				lineStyle: {
					width: 1,
					type: 'solid',
					color: startSessionsTrendLineGradient,
					opacity: startSessionsBaseOpacity,
					shadowColor: 'rgba(33, 149, 207, 0.35)',
					shadowBlur: 8,
					shadowOffsetY: 4
				},
				emphasis: {
					focus: 'series',
					lineStyle: { width: 3, opacity: 0.9 }
				},
				blur: {
					lineStyle: { opacity: TREND_BLUR_OPACITY }
				}
			});

			legendData = [
				{ name: 'Start Sessions', icon: 'circle', itemStyle: { color: startSessionsColor } },
				{ name: 'Tool Events', icon: 'circle', itemStyle: { color: toolEventsColor } },
				{ name: 'Errors', icon: 'circle', itemStyle: { color: errorEventsColor } },
				{ name: 'Trend', icon: 'line', itemStyle: { color: '#8e81ea' } },
				{ name: 'Start Sessions Trend', icon: 'line', itemStyle: { color: startSessionsColor } }
			];
		} else {
			const totalEventsData = data.map(item => Number(item.count ?? item.total ?? 0));
			const totalEventsDataWithZeroes = totalEventsData.map(v => (Number.isFinite(Number(v)) ? Number(v) : 0));
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
						formatter: (params) => {
							const value = Number(params.value);
							if (!Number.isFinite(value)) return '';
							if (value === 0) return '{zero| }';
							return `{val|${value}}`;
						},
						rich: {
							val: {
								fontSize: BADGE_FONT,
								color: '#ffffff',
								backgroundColor: totalEventsColor,
								padding: BADGE_PAD,
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
						itemStyle: { opacity: 1 }
					},
					blur: {
						itemStyle: { opacity: BAR_BLUR_OPACITY },
						label: { opacity: LABEL_BLUR_OPACITY }
					}
				}
			];

			const trendLineSource = trimmedTotalEvents.length >= 2 ? trimmedTotalEvents : totalEventsDataWithZeroes;
			// Use exponential smoothing for a more stable trend line when there are sparse days
			const trendLine = generateTrendLine(trendLineSource, FUTURE_POINTS, 'exponential');

			const denseTrendRaw = buildDenseTrendSeries(
				totalEventsDataWithZeroes,
				extendedLabels.length,
				trendLine,
				30
			);

			const TREND_Y_COMPRESSION = 0.88;
			const denseTrend = compressYAroundMean(denseTrendRaw, TREND_Y_COMPRESSION);

			const BASE_OPACITY = 0.18;
			const FADE_START = 0.78;
			const trendLineGradient = makeRightFadeGradient(BASE_OPACITY, FADE_START);

			series.push({
				name: 'Trend',
				type: 'line',
				xAxisIndex: 1,
				data: denseTrend,
				smooth: false,
				symbol: 'none',
				zlevel: 0,
				z: -1,
				lineStyle: {
					width: 1,
					type: 'solid',
					color: trendLineGradient,
					shadowColor: 'rgba(249, 115, 22, 0.35)',
					shadowBlur: 8,
					shadowOffsetY: 4
				},
				emphasis: {
					focus: 'series',
					lineStyle: { width: 1, opacity: 0.9 }
				},
				blur: {
					lineStyle: { opacity: TREND_BLUR_OPACITY }
				}
			});

			legendData = [
				{ name: 'Events', icon: 'circle', itemStyle: { color: totalEventsColor } },
				{ name: 'Trend', icon: 'line', itemStyle: { color: '#ff6900' } }
			];
		}

		updateChartLegendOverlay(legendData);

		// Calculate label interval based on number of days to prevent overlapping
		let labelInterval = 0;
		if (days > 14) {
			labelInterval = Math.max(1, Math.floor(days / 10)); // Show ~10 labels max
		}

		const option = {
			textStyle: {
				fontFamily:
				'Inter, \'Manrope\', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif'
			},
			animation: true,
			animationDuration: 350,

			// ⭐️ hover/blur transition més ràpida
			stateAnimation: {
				duration: 140
			},

			grid: {
				left: '3%',
				right: '0%',
				bottom: '14%',
				top: '5%',
				containLabel: false,
				width: 'auto',
				height: 'auto'
			},
			tooltip: { show: false },
			legend: { show: false, data: legendData },

			xAxis: [
				{
					type: 'category',
					data: extendedLabels,
					boundaryGap: ['5%', '10%'],
					axisLabel: {
						color: textColor,
						fontSize: 12,
						interval: labelInterval,
						margin: 18
					},
					axisLine: { show: false },
					axisTick: { show: false },
					splitLine: { show: false }
				},
				{
					type: 'value',
					min: -0.5,
					max: Math.max(-0.5, extendedLabels.length - 0.5 + 0.25),					show: false
				}
			],

			yAxis: {
				type: 'value',
				min: 0,
				axisLabel: { show: false },
				axisLine: { show: false },
				axisTick: { show: false },
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
					lineStyle: { color: faintGridColor, width: 1 }
				}
			},

			series
		};

		chartInstance.setOption(option, true);
		chartInstance.resize();

		const onChartFinished = () => {
			chartInstance.off('finished', onChartFinished);

			if (isInitialChartLoad) {
				isInitialChartLoad = false;
				revealDashboardShell();
			}
		};

		chartInstance.on('finished', onChartFinished);
		chartInstance.resize();
	} catch (error) {
		console.error('Error loading chart data:', error);
		if (isInitialChartLoad) {
			isInitialChartLoad = false;
			revealDashboardShell();
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

// Pause/resume functions for soft navigation
function pauseDashboardPage() {
	if (serverStatsUpdateIntervalId) {
		clearInterval(serverStatsUpdateIntervalId);
		serverStatsUpdateIntervalId = null;
	}
	if (chartResizeObserver) {
		chartResizeObserver.disconnect();
		chartResizeObserver = null;
	}
	// Save chart option before disposing to restore it later
	if (chart && typeof chart.getOption === 'function') {
		try {
			savedChartOption = chart.getOption();
		} catch (error) {
			console.warn('Failed to save chart option:', error);
			savedChartOption = null;
		}
	}
	// Dispose chart when leaving page to avoid stale references
	if (chart) {
		if (typeof chart.dispose === 'function') {
			chart.dispose();
		}
		chart = null;
	}
}

async function resumeDashboardPage() {
	// Restart server stats interval if it was running
	if (!serverStatsUpdateIntervalId && serverStatsLastFetchTime) {
		startServerStatsInterval();
	}
	// Restore chart from saved option if available
	if (savedChartOption && chart === null) {
		const chartEl = document.getElementById('eventsChart');
		if (chartEl) {
			// Wait for ECharts to load if not available yet
			if (typeof echarts === 'undefined') {
				await new Promise((resolve) => {
					if (typeof echarts !== 'undefined') {
						resolve();
					} else {
						window.addEventListener('echartsLoaded', resolve, { once: true });
					}
				});
			}
			// Initialize new chart instance
			chart = echarts.init(chartEl);
			window.addEventListener('resize', () => {
				chart?.resize();
			});
			attachChartResizeObserver(chartEl);
			// Restore the saved option (notMerge: true to replace entirely)
			chart.setOption(savedChartOption, true);
			chart.resize();
			// Clear saved option after restoration
			savedChartOption = null;
		}
	} else if (chart === null) {
		// No saved option, load chart data normally
		await loadChartData();
	}
}

// Expose pause/resume hooks
window.pauseDashboardPage = pauseDashboardPage;
window.resumeDashboardPage = resumeDashboardPage;

// Listen for soft navigation events
window.addEventListener('softNav:pagePausing', (event) => {
	if (event?.detail?.path === '/') {
		pauseDashboardPage();
	}
});

// Rehydrate dashboard when returning via soft navigation
window.addEventListener('softNav:pageMounted', async (event) => {
	if (event?.detail?.path === '/') {
		const fromCache = event?.detail?.fromCache === true;
		if (fromCache) {
			// Page was restored from cache - resume intervals and reinitialize chart
			await resumeDashboardPage();
		} else {
			// New page load - full initialization
			initializeDashboardPage({ resetState: true });
		}
	}
});
