// @ts-nocheck
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
    const timeRangeSelect = document.getElementById('timeRangeSelect');
    if (timeRangeSelect) {
      timeRangeSelect.value = String(currentDays);
    }
  }

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

    // Set up time range selector (guard against duplicate listeners)
    const timeRangeSelect = document.getElementById('timeRangeSelect');
    if (timeRangeSelect && timeRangeSelect.dataset.dashboardInitialized !== 'true') {
      timeRangeSelect.addEventListener('change', (e) => {
        const days = parseInt(e.target.value, 10);
        loadChartData(days);
      });
      timeRangeSelect.dataset.dashboardInitialized = 'true';
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    window.location.href = '/login';
  }
}

// Initial bootstrap
void initializeDashboardPage();

// Helper function to escape HTML
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// User menu functions
let userMenuHideTimeout = null;
const USER_MENU_HIDE_DELAY_MS = 300;
const SESSION_START_SERIES_COLOR = '#2195cf';
const TOP_USERS_LOOKBACK_DAYS = 3;
const TOP_USERS_LIMIT = 3;

function showUserMenu(e) {
  if (e) {
    e.stopPropagation();
  }
  const userMenu = document.getElementById('userMenu');
  if (!userMenu) {
    return;
  }

  // Only open the menu; do not toggle/close it from this handler
  if (!userMenu.classList.contains('show')) {
    userMenu.classList.add('show');
    // Load user info
    fetch('/api/auth/status', {
      credentials: 'include' // Ensure cookies are sent
    })
      .then(response => response.json())
      .then(data => {
        const usernameElement = document.getElementById('userMenuUsername');
        if (usernameElement) {
          if (data.authenticated && data.username) {
            usernameElement.innerHTML = '<i class="fa-regular fa-user user-menu-icon"></i>' + escapeHtml(data.username);
          } else {
            usernameElement.innerHTML = '<i class="fa-regular fa-user user-menu-icon"></i>Not authenticated';
          }
        }

      })
      .catch(() => {
        const usernameElement = document.getElementById('userMenuUsername');
        if (usernameElement) {
          usernameElement.innerHTML = '<i class="fa-regular fa-user user-menu-icon"></i>Error loading user';
        }
      });
  }
}

// Close user menu when clicking outside
document.addEventListener('click', function(event) {
  const userMenu = document.getElementById('userMenu');
  const _userBtn = document.getElementById('userBtn');
  const userMenuContainer = event.target.closest('.user-menu-container');

  if (userMenu && userMenu.classList.contains('show')) {
    if (!userMenuContainer && !userMenu.contains(event.target)) {
      userMenu.classList.remove('show');
    }
  }
});

function setupUserMenuHover() {
  const container = document.querySelector('.user-menu-container');
  if (!container) {
    return;
  }

  container.addEventListener('mouseenter', (event) => {
    const userMenu = document.getElementById('userMenu');
    if (!userMenu) {
      return;
    }

    if (userMenuHideTimeout) {
      clearTimeout(userMenuHideTimeout);
      userMenuHideTimeout = null;
    }

    // Only open if it's not already visible
    if (!userMenu.classList.contains('show')) {
      showUserMenu(event);
    }
  });

  container.addEventListener('mouseleave', () => {
    const userMenu = document.getElementById('userMenu');
    if (!userMenu) {
      return;
    }

    if (userMenuHideTimeout) {
      clearTimeout(userMenuHideTimeout);
    }
    userMenuHideTimeout = setTimeout(() => {
      userMenu.classList.remove('show');
      userMenuHideTimeout = null;
    }, USER_MENU_HIDE_DELAY_MS);
  });
}


async function handleLogout() {
  // Close menu
  const userMenu = document.getElementById('userMenu');
  if (userMenu) {
    userMenu.classList.remove('show');
  }

  try {
    const response = await fetch('/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include' // Ensure cookies are sent
    });
    if (response.ok) {
      window.location.href = '/login';
    }
  } catch (error) {
    console.error('Logout error:', error);
    window.location.href = '/login';
  }
}


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
    const existing = document.querySelector('.confirm-modal-backdrop');
    if (existing) {
      existing.remove();
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'confirm-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'confirm-modal';
    modal.innerHTML = `
			<div class="confirm-modal-title">${escapeHtml(title || 'Confirm action')}</div>
			<div class="confirm-modal-message">${escapeHtml(message || '')}</div>
			<div class="confirm-modal-actions">
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
      const handleTransitionEnd = () => {
        backdrop.removeEventListener('transitionend', handleTransitionEnd);
        backdrop.remove();
      };

      backdrop.addEventListener('transitionend', handleTransitionEnd);
      backdrop.classList.remove('visible');
      backdrop.classList.add('hiding');

      // Fallback in case transitionend does not fire
      setTimeout(() => {
        if (document.body.contains(backdrop)) {
          backdrop.removeEventListener('transitionend', handleTransitionEnd);
          backdrop.remove();
        }
      }, 220);

      resolve(result);
    }

    const [cancelBtn, confirmBtn] = modal.querySelectorAll('.confirm-modal-btn');
    cancelBtn.addEventListener('click', () => animateAndResolve(false));
    confirmBtn.addEventListener('click', () => animateAndResolve(true));

    document.addEventListener(
      'keydown',
      function handleKeydown(e) {
        if (e.key === 'Escape') {
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
const ORG_TEAM_MAPPING_STORAGE_KEY = 'orgTeamMappings';

function getOrgTeamMappings() {
  try {
    const raw = localStorage.getItem(ORG_TEAM_MAPPING_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error parsing org-team mappings from localStorage:', error);
    return [];
  }
}

function saveOrgTeamMappings(mappings) {
  try {
    localStorage.setItem(ORG_TEAM_MAPPING_STORAGE_KEY, JSON.stringify(mappings || []));
  } catch (error) {
    console.error('Error saving org-team mappings to localStorage:', error);
  }
}

function ensureUserMenuStructure() {
  const userMenu = document.getElementById('userMenu');
  if (!userMenu || userMenu.dataset.initialized === 'true') {
    return;
  }

  // Get current theme to initialize menu with correct label
  const isDark = document.documentElement.classList.contains('dark');
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
  const themeIcon = isDark ? lightThemeIcon : darkThemeIcon;
  const themeLabel = isDark ? 'Light theme' : 'Dark theme';

  // Basic preferences menu used on dashboard and event log
  userMenu.innerHTML = `
		<div class="user-menu-item" id="userMenuUsername">
			<i class="fa-regular fa-user user-menu-icon"></i>Loading...
		</div>
		<div class="user-menu-item">
			<button type="button" id="themeToggleMenuItem" onclick="toggleTheme()">
				${themeIcon}${themeLabel}
			</button>
		</div>
		<div class="user-menu-item">
			<button type="button" id="openSettingsMenuItem" onclick="openSettingsModal()">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="user-menu-icon" width="16" height="16" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
				</svg>Settings
			</button>
		</div>
		<div class="user-menu-item clear-data-menu-item user-menu-item-danger">
			<button type="button" onclick="clearLocalData()">
				<i class="fa-solid fa-broom user-menu-icon user-menu-icon-danger"></i>Clear local data
			</button>
		</div>
		<div class="user-menu-separator"></div>
		<div class="user-menu-item">
			<button type="button" onclick="handleLogout()">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="user-menu-icon" width="16" height="16" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" />
				</svg>Logout
			</button>
		</div>
	`;

  userMenu.dataset.initialized = 'true';
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
  const autoRefreshEnabled = localStorage.getItem('autoRefreshEnabled') === 'true';
  const autoRefreshInterval = localStorage.getItem('autoRefreshInterval') || '';

  // Build sidebar navigation
  const sidebarNav = `
    <a href="#settings-appearance" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-secondary)]">
      <span class="w-4 h-4 flex items-center justify-center rounded-full border border-[color:var(--border-color)] bg-[color:var(--bg-secondary)]">
        <i class="fa-regular fa-moon text-[10px]"></i>
      </span>
      <span class="font-medium">Appearance</span>
    </a>
    <a href="#settings-events" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-secondary)]">
      <span class="w-4 h-4 flex items-center justify-center rounded-full border border-[color:var(--border-color)] bg-[color:var(--bg-secondary)]">
        <i class="fa-solid fa-chart-line text-[10px]"></i>
      </span>
      <span class="font-medium">Events</span>
    </a>
    <a href="#settings-teams" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-secondary)]">
      <span class="w-4 h-4 flex items-center justify-center rounded-full border border-[color:var(--border-color)] bg-[color:var(--bg-secondary)]">
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
								<span class="text-sm font-medium text-[color:var(--text-primary)]">Show server stats</span>
								<span class="text-xs text-[color:var(--text-secondary)]">Display server information in the footer (last updated, load time, version, etc.).</span>
							</div>
							<input type="checkbox" class="sr-only peer" id="showServerStatsToggle" ${showServerStats ? 'checked' : ''}>
							<div class="relative w-11 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:bg-blue-600 dark:peer-checked:bg-blue-600 transition-colors duration-200 ease-in-out">
								<div class="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ease-in-out transform peer-checked:translate-x-5"></div>
							</div>
						</label>
						<label class="flex items-center justify-between cursor-pointer py-2">
							<div class="flex flex-col">
								<span class="text-sm font-medium text-[color:var(--text-primary)]">Dark theme</span>
								<span class="text-xs text-[color:var(--text-secondary)]">Switch between light and dark color scheme.</span>
							</div>
							<input type="checkbox" class="sr-only peer" id="darkThemeToggle" ${isDarkTheme ? 'checked' : ''}>
							<div class="relative w-11 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:bg-blue-600 dark:peer-checked:bg-blue-600 transition-colors duration-200 ease-in-out">
								<div class="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ease-in-out transform peer-checked:translate-x-5"></div>
							</div>
						</label>
					</section>
					<section id="settings-events" class="settings-section">
						<div class="settings-modal-placeholder-title">Events</div>
						<div class="settings-toggle-row">
							<div class="settings-toggle-text">
								<div class="settings-toggle-title">Org – Client – Team mapping</div>
								<div class="settings-toggle-description">
									Define how Salesforce org identifiers map to clients and teams. This mapping is used to group telemetry in the Teams view.
								</div>
							</div>
							<button type="button" class="confirm-modal-btn" id="manageOrgTeamMappingBtn">
								<i class="fa-solid fa-users user-menu-icon"></i>Manage teams
							</button>
						</div>
						<div class="settings-toggle-row" style="margin-top: 16px;">
							<div class="settings-toggle-text" style="flex: 1;">
								<div class="settings-toggle-title">Refresh every X minutes</div>
								<div class="settings-toggle-description">
									Automatically refresh the events list at the specified interval.
								</div>
							</div>
							<div style="display: flex; align-items: center; gap: 8px;">
								<label class="relative inline-flex items-center cursor-pointer" style="margin: 0;">
									<input type="checkbox" class="sr-only peer" id="autoRefreshToggle" ${autoRefreshEnabled ? 'checked' : ''} aria-label="Toggle auto refresh">
									<div class="w-11 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:bg-blue-600 dark:peer-checked:bg-blue-600 transition-colors duration-200 ease-in-out">
										<div class="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ease-in-out transform peer-checked:translate-x-5"></div>
									</div>
								</label>
								<div style="position: relative;">
									<select id="autoRefreshInterval" style="padding: 6px 24px 6px 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 14px; cursor: pointer; appearance: none; min-width: 80px;" ${autoRefreshEnabled ? '' : 'disabled'}>
										<option value="" ${autoRefreshInterval === '' ? 'selected' : ''}>Off</option>
										<option value="3" ${autoRefreshInterval === '3' ? 'selected' : ''}>3</option>
										<option value="5" ${autoRefreshInterval === '5' ? 'selected' : ''}>5</option>
										<option value="10" ${autoRefreshInterval === '10' ? 'selected' : ''}>10</option>
									</select>
									<i class="fa-solid fa-chevron-down" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); color: var(--text-secondary); font-size: 10px; pointer-events: none;"></i>
								</div>
							</div>
						</div>
					</section>
					<section id="settings-teams" class="settings-section" style="display: none;">
						<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
							<div class="settings-modal-placeholder-title" style="margin: 0;">Teams</div>
							<button type="button" class="confirm-modal-btn" id="addTeamBtn" style="display: flex; align-items: center; gap: 6px;">
								<i class="fa-solid fa-plus" style="font-size: 12px;"></i>Add Team
							</button>
						</div>
						<div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
							<div style="position: relative; flex: 1; min-width: 200px;">
								<i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-secondary); font-size: 14px;"></i>
								<input type="text" id="teamsSearchInput" placeholder="Search..."
									style="width: 100%; padding: 8px 12px 8px 36px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 14px;">
							</div>
							<div style="position: relative;">
								<button type="button" id="teamsFilterBtn" class="confirm-modal-btn confirm-modal-btn-cancel" style="display: flex; align-items: center; gap: 6px; padding: 8px 12px;">
									<i class="fa-solid fa-filter" style="font-size: 12px;"></i>
									<span id="teamsFilterBadge" style="display: none; background: var(--text-primary); color: var(--bg-primary); border-radius: 10px; padding: 2px 6px; font-size: 11px; margin-left: 4px;">1</span>
								</button>
							</div>
							<button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" style="padding: 8px 12px;">
								<i class="fa-solid fa-gear" style="font-size: 12px;"></i>
							</button>
							<div style="position: relative;">
								<select id="teamsSortSelect" style="padding: 8px 32px 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 14px; cursor: pointer; appearance: none;">
									<option>Sort by</option>
									<option value="name-asc">Name (A-Z)</option>
									<option value="name-desc">Name (Z-A)</option>
									<option value="members-asc">Members (Low to High)</option>
									<option value="members-desc">Members (High to Low)</option>
									<option value="activity-desc">Last Activity (Recent)</option>
									<option value="activity-asc">Last Activity (Oldest)</option>
								</select>
								<i class="fa-solid fa-chevron-down" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: var(--text-secondary); font-size: 10px; pointer-events: none;"></i>
							</div>
						</div>
						<div class="settings-teams-table-wrapper">
							<table id="teamsTable" class="settings-teams-table">
								<thead>
									<tr>
										<th class="settings-teams-checkbox-column">
											<input type="checkbox" id="teamsSelectAll" style="cursor: pointer;">
										</th>
										<th>
											Team Name
											<i class="fa-solid fa-arrows-up-down" style="margin-left: 6px; font-size: 10px; color: var(--text-secondary);"></i>
										</th>
										<th>
											Members
											<i class="fa-solid fa-arrows-up-down" style="margin-left: 6px; font-size: 10px; color: var(--text-secondary);"></i>
										</th>
										<th>
											Last Activity
											<i class="fa-solid fa-arrows-up-down" style="margin-left: 6px; font-size: 10px; color: var(--text-secondary);"></i>
										</th>
										<th>
											Status
											<i class="fa-solid fa-arrows-up-down" style="margin-left: 6px; font-size: 10px; color: var(--text-secondary);"></i>
										</th>
										<th class="settings-teams-actions-column"></th>
									</tr>
								</thead>
								<tbody id="teamsTableBody">
									<!-- Teams will be populated here -->
								</tbody>
							</table>
						</div>
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
    backdrop.classList.remove('visible');
    backdrop.classList.add('hiding');
    const handleTransitionEnd = () => {
      backdrop.removeEventListener('transitionend', handleTransitionEnd);
      backdrop.remove();
    };
    backdrop.addEventListener('transitionend', handleTransitionEnd);
    setTimeout(() => {
      if (document.body.contains(backdrop)) {
        backdrop.removeEventListener('transitionend', handleTransitionEnd);
        backdrop.remove();
      }
    }, 220);
  }

  const closeBtn = modal.querySelector('#settingsCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeSettingsModal);
  }

  const closeIconBtn = backdrop.querySelector('#settingsCloseIcon');
  if (closeIconBtn) {
    closeIconBtn.addEventListener('click', closeSettingsModal);
  }

  const manageBtn = modal.querySelector('#manageOrgTeamMappingBtn');
  if (manageBtn) {
    manageBtn.addEventListener('click', () => {
      openOrgTeamMappingModal();
    });
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
  const autoRefreshIntervalSelect = modal.querySelector('#autoRefreshInterval');

  if (autoRefreshToggle && autoRefreshIntervalSelect) {
    autoRefreshToggle.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      localStorage.setItem('autoRefreshEnabled', enabled ? 'true' : 'false');
      autoRefreshIntervalSelect.disabled = !enabled;
    });

    autoRefreshIntervalSelect.addEventListener('change', (e) => {
      const interval = e.target.value;
      localStorage.setItem('autoRefreshInterval', interval);
    });
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

  // Teams section functionality
  const teamsSection = modal.querySelector('#settings-teams');
  if (teamsSection) {
    // Dummy teams data
    const dummyTeams = [
      { id: 1, name: 'Development Team', members: 8, lastActivity: 'Today, 3:52 PM', status: 'Active' },
      { id: 2, name: 'QA Team', members: 5, lastActivity: 'Yesterday, 8:21 AM', status: 'Active' },
      { id: 3, name: 'DevOps Team', members: 4, lastActivity: 'Sep 24, 2023 at 2:10 PM', status: 'Active' },
      { id: 4, name: 'Sales Team', members: 12, lastActivity: 'Sep 23, 2023 at 1:30 PM', status: 'Active' },
      { id: 5, name: 'Support Team', members: 6, lastActivity: 'Sep 22, 2023 at 4:45 PM', status: 'Inactive' },
      { id: 6, name: 'Marketing Team', members: 7, lastActivity: 'Sep 21, 2023 at 10:15 AM', status: 'Active' }
    ];

    let filteredTeams = [...dummyTeams];
    const teamsTableBody = modal.querySelector('#teamsTableBody');
    const teamsSearchInput = modal.querySelector('#teamsSearchInput');
    const teamsSortSelect = modal.querySelector('#teamsSortSelect');
    const teamsSelectAll = modal.querySelector('#teamsSelectAll');
    const addTeamBtn = modal.querySelector('#addTeamBtn');

    function renderTeams() {
      if (!teamsTableBody) return;

      teamsTableBody.innerHTML = filteredTeams.map(team => {
        const statusClass = team.status === 'Active' ? 'active' : 'inactive';
        const statusLabel = escapeHtml(team.status);
        return `
					<tr class="settings-teams-row">
						<td class="settings-teams-cell settings-teams-checkbox-cell">
							<input type="checkbox" class="team-checkbox" data-team-id="${team.id}" style="cursor: pointer;">
						</td>
						<td class="settings-teams-cell">
							<div class="settings-team-overview">
								<div class="settings-teams-avatar">
									${team.name.charAt(0).toUpperCase()}
								</div>
								<span class="settings-teams-name">${escapeHtml(team.name)}</span>
							</div>
						</td>
						<td class="settings-teams-cell">
							${team.members} members
						</td>
						<td class="settings-teams-cell settings-teams-muted">
							${escapeHtml(team.lastActivity)}
						</td>
						<td class="settings-teams-cell">
							<span class="settings-teams-status settings-teams-status-${statusClass}">
								<span class="settings-teams-status-dot"></span>
								${statusLabel}
							</span>
						</td>
						<td class="settings-teams-actions-cell">
							<div class="settings-users-actions">
								<button type="button" class="confirm-modal-btn settings-users-action-btn" data-team-id="${team.id}" title="View team">
									<i class="fa-solid fa-magnifying-glass"></i>
								</button>
								<button type="button" class="confirm-modal-btn settings-users-action-btn" data-team-id="${team.id}" title="More actions">
									<i class="fa-solid fa-ellipsis-vertical"></i>
								</button>
							</div>
						</td>
					</tr>
				`;
      }).join('');
    }

    // Search functionality
    if (teamsSearchInput) {
      teamsSearchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        filteredTeams = dummyTeams.filter(team =>
          team.name.toLowerCase().includes(searchTerm) ||
					team.status.toLowerCase().includes(searchTerm)
        );
        renderTeams();
      });
    }

    // Sort functionality
    if (teamsSortSelect) {
      teamsSortSelect.addEventListener('change', (e) => {
        const sortValue = e.target.value;
        filteredTeams.sort((a, b) => {
          switch(sortValue) {
          case 'name-asc':
            return a.name.localeCompare(b.name);
          case 'name-desc':
            return b.name.localeCompare(a.name);
          case 'members-asc':
            return a.members - b.members;
          case 'members-desc':
            return b.members - a.members;
          default:
            return 0;
          }
        });
        renderTeams();
      });
    }

    // Select all functionality
    if (teamsSelectAll) {
      teamsSelectAll.addEventListener('change', (e) => {
        const checkboxes = teamsTableBody.querySelectorAll('.team-checkbox');
        checkboxes.forEach(checkbox => {
          checkbox.checked = e.target.checked;
        });
      });
    }

    // Add team button
    if (addTeamBtn) {
      addTeamBtn.addEventListener('click', () => {
        alert('Add Team functionality will be implemented here');
      });
    }

    // Initial render
    renderTeams();
  }

  // Users section functionality (only for administrators)
  if (isAdministrator) {
    const usersSection = modal.querySelector('#settings-users');
    if (usersSection) {
      const usersTableBody = modal.querySelector('#usersTableBody');
      const addUserBtn = modal.querySelector('#addUserBtn');

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

        // Get current username from auth status
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
                  <button type="button" class="confirm-modal-btn settings-users-action-btn" onclick="openEditPasswordModal('${escapeHtml(user.username)}')" title="Change password">
                    <i class="fa-solid fa-key"></i>
                  </button>
                  <button type="button" class="confirm-modal-btn settings-users-action-btn" onclick="openEditRoleModal('${escapeHtml(user.username)}', '${escapeHtml(user.role || 'basic')}')" title="Change role">
                    <i class="fa-solid fa-user-tag"></i>
                  </button>
                  ${!isCurrentUser ? `
                  <button type="button" class="confirm-modal-btn confirm-modal-btn-destructive settings-users-action-btn" onclick="openDeleteUserModal('${escapeHtml(user.username)}')" title="Delete user">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                  ` : ''}
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }

      // Load users when section is shown
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

      // Add user button
      if (addUserBtn) {
        addUserBtn.addEventListener('click', () => {
          window.openCreateUserModal();
        });
      }

      // Initial load if section is visible
      if (usersSection.style.display !== 'none') {
        loadUsers();
      }
    }
  }

  // Global functions for user management (needed for onclick handlers)
  window.openCreateUserModal = function() {
    const existing = document.querySelector('.confirm-modal-backdrop.user-management-backdrop');
    if (existing) {
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'confirm-modal-backdrop user-management-backdrop';

    const modal = document.createElement('div');
    modal.className = 'confirm-modal settings-modal';
    modal.style.maxWidth = '500px';

    modal.innerHTML = `
      <div class="confirm-modal-title">Create New User</div>
      <form id="createUserForm" style="display: flex; flex-direction: column; gap: 16px; margin-top: 16px;">
        <div>
          <label class="settings-modal-placeholder-text" style="display: block; margin-bottom: 6px;">
            Username
            <input type="text" id="createUsernameInput" required
              style="margin-top: 4px; width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 14px;"
              placeholder="Enter username">
          </label>
        </div>
        <div>
          <label class="settings-modal-placeholder-text" style="display: block; margin-bottom: 6px;">
            Password
            <input type="password" id="createPasswordInput" required
              style="margin-top: 4px; width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 14px;"
              placeholder="Enter password">
          </label>
        </div>
        <div>
          <label class="settings-modal-placeholder-text" style="display: block; margin-bottom: 6px;">
            Role
            <select id="createRoleSelect"
              style="margin-top: 4px; width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 14px; cursor: pointer;">
              <option value="basic">Basic</option>
              <option value="advanced">Advanced</option>
              <option value="administrator">Administrator</option>
            </select>
          </label>
        </div>
        <div id="createUserError" style="color: #dc2626; font-size: 13px; display: none;"></div>
        <div class="confirm-modal-actions">
          <button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" onclick="window.closeUserManagementModal()">
            Cancel
          </button>
          <button type="submit" class="confirm-modal-btn confirm-modal-btn-confirm">
            Create User
          </button>
        </div>
      </form>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    requestAnimationFrame(() => {
      backdrop.classList.add('visible');
    });

    const form = modal.querySelector('#createUserForm');
    const errorDiv = modal.querySelector('#createUserError');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorDiv.style.display = 'none';
      errorDiv.textContent = '';

      const username = modal.querySelector('#createUsernameInput').value.trim();
      const password = modal.querySelector('#createPasswordInput').value;
      const role = modal.querySelector('#createRoleSelect').value;

      if (!username || !password) {
        errorDiv.textContent = 'Username and password are required';
        errorDiv.style.display = 'block';
        return;
      }

      try {
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

        // Close modal and reload users
        window.closeUserManagementModal();
        const usersSection = document.querySelector('#settings-users');
        if (usersSection && usersSection.style.display !== 'none') {
          // Trigger reload by dispatching a custom event or calling loadUsers
          const event = new CustomEvent('reloadUsers');
          usersSection.dispatchEvent(event);
        }
        // Reload the page to refresh the users list
        window.location.reload();
      } catch (error) {
        errorDiv.textContent = error.message || 'Failed to create user';
        errorDiv.style.display = 'block';
      }
    });

    window.closeUserManagementModal = function() {
      backdrop.classList.remove('visible');
      backdrop.classList.add('hiding');
      setTimeout(() => {
        if (document.body.contains(backdrop)) {
          backdrop.remove();
        }
      }, 220);
    };
  };

  window.openEditPasswordModal = function(username) {
    const existing = document.querySelector('.confirm-modal-backdrop.user-management-backdrop');
    if (existing) {
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'confirm-modal-backdrop user-management-backdrop';

    const modal = document.createElement('div');
    modal.className = 'confirm-modal settings-modal';
    modal.style.maxWidth = '500px';

    modal.innerHTML = `
      <div class="confirm-modal-title">Change Password</div>
      <div class="confirm-modal-message" style="margin-top: 8px; margin-bottom: 16px;">
        <p class="settings-modal-placeholder-text">
          Change password for user: <strong>${escapeHtml(username)}</strong>
        </p>
      </div>
      <form id="editPasswordForm" style="display: flex; flex-direction: column; gap: 16px;">
        <div>
          <label class="settings-modal-placeholder-text" style="display: block; margin-bottom: 6px;">
            New Password
            <input type="password" id="editPasswordInput" required
              style="margin-top: 4px; width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 14px;"
              placeholder="Enter new password">
          </label>
        </div>
        <div id="editPasswordError" style="color: #dc2626; font-size: 13px; display: none;"></div>
        <div class="confirm-modal-actions">
          <button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" onclick="window.closeUserManagementModal()">
            Cancel
          </button>
          <button type="submit" class="confirm-modal-btn confirm-modal-btn-confirm">
            Update Password
          </button>
        </div>
      </form>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    requestAnimationFrame(() => {
      backdrop.classList.add('visible');
    });

    const form = modal.querySelector('#editPasswordForm');
    const errorDiv = modal.querySelector('#editPasswordError');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorDiv.style.display = 'none';
      errorDiv.textContent = '';

      const password = modal.querySelector('#editPasswordInput').value;

      if (!password) {
        errorDiv.textContent = 'Password is required';
        errorDiv.style.display = 'block';
        return;
      }

      try {
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

        window.closeUserManagementModal();
        alert('Password updated successfully');
        window.location.reload();
      } catch (error) {
        errorDiv.textContent = error.message || 'Failed to update password';
        errorDiv.style.display = 'block';
      }
    });

    window.closeUserManagementModal = function() {
      backdrop.classList.remove('visible');
      backdrop.classList.add('hiding');
      setTimeout(() => {
        if (document.body.contains(backdrop)) {
          backdrop.remove();
        }
      }, 220);
    };
  };

  window.openEditRoleModal = function(username, currentRole) {
    const existing = document.querySelector('.confirm-modal-backdrop.user-management-backdrop');
    if (existing) {
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'confirm-modal-backdrop user-management-backdrop';

    const modal = document.createElement('div');
    modal.className = 'confirm-modal settings-modal';
    modal.style.maxWidth = '500px';

    modal.innerHTML = `
      <div class="confirm-modal-title">Change Role</div>
      <div class="confirm-modal-message" style="margin-top: 8px; margin-bottom: 16px;">
        <p class="settings-modal-placeholder-text">
          Change role for user: <strong>${escapeHtml(username)}</strong>
        </p>
      </div>
      <form id="editRoleForm" style="display: flex; flex-direction: column; gap: 16px;">
        <div>
          <label class="settings-modal-placeholder-text" style="display: block; margin-bottom: 6px;">
            Role
            <select id="editRoleSelect"
              style="margin-top: 4px; width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 14px; cursor: pointer;">
              <option value="basic" ${currentRole === 'basic' ? 'selected' : ''}>Basic</option>
              <option value="advanced" ${currentRole === 'advanced' ? 'selected' : ''}>Advanced</option>
              <option value="administrator" ${currentRole === 'administrator' ? 'selected' : ''}>Administrator</option>
            </select>
          </label>
        </div>
        <div id="editRoleError" style="color: #dc2626; font-size: 13px; display: none;"></div>
        <div class="confirm-modal-actions">
          <button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" onclick="window.closeUserManagementModal()">
            Cancel
          </button>
          <button type="submit" class="confirm-modal-btn confirm-modal-btn-confirm">
            Update Role
          </button>
        </div>
      </form>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    requestAnimationFrame(() => {
      backdrop.classList.add('visible');
    });

    const form = modal.querySelector('#editRoleForm');
    const errorDiv = modal.querySelector('#editRoleError');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorDiv.style.display = 'none';
      errorDiv.textContent = '';

      const role = modal.querySelector('#editRoleSelect').value;

      if (!role) {
        errorDiv.textContent = 'Role is required';
        errorDiv.style.display = 'block';
        return;
      }

      try {
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

        window.closeUserManagementModal();
        alert('Role updated successfully');
        window.location.reload();
      } catch (error) {
        errorDiv.textContent = error.message || 'Failed to update role';
        errorDiv.style.display = 'block';
      }
    });

    window.closeUserManagementModal = function() {
      backdrop.classList.remove('visible');
      backdrop.classList.add('hiding');
      setTimeout(() => {
        if (document.body.contains(backdrop)) {
          backdrop.remove();
        }
      }, 220);
    };
  };

  window.openDeleteUserModal = function(username) {
    openConfirmModal({
      title: 'Delete User',
      message: `Are you sure you want to delete user "${escapeHtml(username)}"? This action cannot be undone.`,
      confirmLabel: 'Delete User',
      destructive: true
    }).then((confirmed) => {
      if (!confirmed) {
        return;
      }

      fetch(`/api/users/${encodeURIComponent(username)}`, {
        method: 'DELETE',
        credentials: 'include'
      })
        .then(response => response.json())
        .then(data => {
          if (data.status === 'ok') {
            alert('User deleted successfully');
            window.location.reload();
          } else {
            alert('Error: ' + (data.message || 'Failed to delete user'));
          }
        })
        .catch(error => {
          console.error('Error deleting user:', error);
          alert('Error deleting user: ' + error.message);
        });
    });
  };

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

function openOrgTeamMappingModal() {
  const existing = document.querySelector('.confirm-modal-backdrop.org-team-mapping-backdrop');
  if (existing) {
    return;
  }

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
    backdrop.classList.remove('visible');
    backdrop.classList.add('hiding');
    const handleTransitionEnd = () => {
      backdrop.removeEventListener('transitionend', handleTransitionEnd);
      backdrop.remove();
    };
    backdrop.addEventListener('transitionend', handleTransitionEnd);
    setTimeout(() => {
      if (document.body.contains(backdrop)) {
        backdrop.removeEventListener('transitionend', handleTransitionEnd);
        backdrop.remove();
      }
    }, 220);
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
  const activeInput = modal.querySelector('#mappingActiveInput');
  const resetFormBtn = modal.querySelector('#resetOrgTeamMappingFormBtn');

  function renderMappings() {
    if (!listContainer) {
      return;
    }
    const mappings = getOrgTeamMappings();
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
						<div class="confirm-modal-actions" style="gap: 6px;">
							<button type="button" class="confirm-modal-btn" data-action="edit" data-index="${index}">Edit</button>
							<button type="button" class="confirm-modal-btn confirm-modal-btn-destructive" data-action="delete" data-index="${index}">Delete</button>
						</div>
					</div>
				`;
      })
      .join('');

    listContainer.innerHTML = rowsHtml;

    listContainer.querySelectorAll('button[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        const mappingsData = getOrgTeamMappings();
        const mapping = mappingsData[idx];
        if (!mapping) {
          return;
        }
        editingIdInput.value = String(idx);
        orgInput.value = mapping.orgIdentifier || '';
        clientInput.value = mapping.clientName || '';
        teamInput.value = mapping.teamName || '';
        colorInput.value = mapping.color || '';
        activeInput.checked = mapping.active !== false;
      });
    });

    listContainer.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        const mappingsData = getOrgTeamMappings();
        if (idx >= 0 && idx < mappingsData.length) {
          mappingsData.splice(idx, 1);
          saveOrgTeamMappings(mappingsData);
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
    colorInput.value = '';
    activeInput.checked = true;
  }

  if (resetFormBtn) {
    resetFormBtn.addEventListener('click', (e) => {
      e.preventDefault();
      resetForm();
    });
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const orgIdentifier = orgInput.value.trim();
      const clientName = clientInput.value.trim();
      const teamName = teamInput.value.trim();
      const color = colorInput.value.trim();
      const active = !!activeInput.checked;

      if (!orgIdentifier || !clientName || !teamName) {
        alert('Org identifier, client name and team name are required.');
        return;
      }

      const mappings = getOrgTeamMappings();
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
      saveOrgTeamMappings(mappings);
      renderMappings();
      resetForm();
    });
  }

  renderMappings();

  requestAnimationFrame(() => {
    backdrop.classList.add('visible');
  });
}

// Initialize theme
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    updateServerStatsVisibility();
    ensureUserMenuStructure();
    setupUserMenuHover();
    setupIconButtonsGroupHover();
  });
} else {
  initTheme();
  updateServerStatsVisibility();
  ensureUserMenuStructure();
  setupUserMenuHover();
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
  const refreshIcon = button?.querySelector('.fa-refresh') || (event?.target?.classList?.contains('fa-refresh') ? event.target : null);
  if (refreshIcon) {
    refreshIcon.classList.add('rotating');
  }
  // Reload chart data with current days setting
  try {
    await Promise.all([
      loadChartData(currentDays),
      loadTopUsersToday()
    ]);
  } catch (error) {
    // Any errors are already logged inside loadChartData; this catch
    // simply ensures we always stop the spinner.
    console.error('Error refreshing dashboard:', error);
  } finally {
    if (refreshIcon) {
      refreshIcon.classList.remove('rotating');
    }
  }
}

// Chart configuration
let chart = null;
let currentDays = 7;
let isInitialChartLoad = true; // Track if this is the initial chart load

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

function renderTopUsersPlaceholder(message) {
  const list = document.getElementById('topUsersList');
  if (!list) {
    return;
  }
  list.innerHTML = `<li class="top-users-empty">${escapeHtml(message)}</li>`;
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
    const initial = name.trim().charAt(0).toUpperCase() || '?';
    const eventCount = Number(user.eventCount) || 0;
    const countLabel = eventCount === 1 ? '1 event last 3 days' : `${eventCount} events last 3 days`;
    const badgeBackground = index === 0 ? '#dc2626' : SESSION_START_SERIES_COLOR;

    return `
      <li class="top-users-item">
        <span class="top-users-avatar">${escapeHtml(initial)}</span>
        <div class="top-users-info">
          <div class="top-users-name-row">
            <strong class="top-users-name" title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
            <span class="top-users-badge" style="background: ${badgeBackground}; color: #ffffff;">${escapeHtml(String(eventCount))} last 3 days</span>
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

async function loadChartData(days = currentDays) {
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
    const _dates = data.map(item => item.date);
    const weekdayLabels = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const labels = data.map(item => {
      const date = new Date(item.date);
      const dayIndex = date.getDay();
      return weekdayLabels[dayIndex] || '';
    });

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
              return Number.isFinite(value) ? value : 0;
            },
            fontSize: 9.8,
            color: '#ffffff',
            backgroundColor: startSessionsColor,
            padding: [2, 5],
            borderRadius: 999,
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
              return Number.isFinite(value) ? value : 0;
            },
            fontSize: 9.8,
            color: '#ffffff',
            backgroundColor: toolEventsColor,
            padding: [2, 5],
            borderRadius: 999,
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
              return Number.isFinite(value) ? value : 0;
            },
            fontSize: 9.8,
            color: '#ffffff',
            backgroundColor: errorEventsColor,
            padding: [2, 5],
            borderRadius: 999,
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
      legendData = [
        { name: 'Start Sessions', icon: 'circle', itemStyle: { color: startSessionsColor } },
        { name: 'Tool Events', icon: 'circle', itemStyle: { color: toolEventsColor } },
        { name: 'Errors', icon: 'circle', itemStyle: { color: errorEventsColor } }
      ];
    } else {
      const totalEventsData = data.map(item => Number(item.count ?? item.total ?? 0));
      const totalEventsDataWithZeroes = totalEventsData.map(value => {
        const num = Number(value);
        return Number.isFinite(num) ? num : 0;
      });

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
              return Number.isFinite(value) ? value : 0;
            },
            fontSize: 9.8,
            color: '#ffffff',
            backgroundColor: totalEventsColor,
            padding: [2, 5],
            borderRadius: 999,
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
      legendData = [
        { name: 'Events', icon: 'circle', itemStyle: { color: totalEventsColor } }
      ];
    }

    const option = {
      textStyle: {
        fontFamily: 'Inter, \'Manrope\', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif'
      },
      animation: true,
      animationDuration: 350,
      grid: {
        left: '3%',
        right: '0%',
        bottom: '20%',
        top: '5%',
        containLabel: false,
        width: 'auto',
        height: 'auto'
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? '#27272a' : '#ffffff',
        borderColor: gridColor,
        borderWidth: 1,
        textStyle: {
          color: isDark ? '#a1a1aa' : '#52525b'
        },
        axisPointer: {
          type: 'line',
          lineStyle: {
            color: gridColor,
            type: 'dashed'
          }
        },
        formatter: function(params) {
          if (!Array.isArray(params)) {
            params = [params];
          }
          let result = '';
          if (params.length > 0 && params[0].axisValue) {
            result += `<div style="margin-bottom: 4px; font-weight: 500; color: ${isDark ? '#e4e4e7' : '#18181b'};">${params[0].axisValue}</div>`;
          }
          params.forEach(param => {
            const marker = `<span style="display:inline-block;margin-right:4px;border-radius:50%;width:10px;height:10px;background-color:${param.color};"></span>`;
            result += `<div style="margin: 2px 0;">${marker}${param.seriesName}: <strong>${param.value}</strong></div>`;
          });
          return result;
        }
      },
      legend: {
        data: legendData,
        bottom: 0,
        textStyle: {
          color: isDark ? '#b8b8c2' : '#6b6b75',
          fontSize: 11,
          letterSpacing: 0.2
        },
        itemGap: 20,
        icon: 'circle',
        itemWidth: 12,
        itemHeight: 12
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: {
          color: textColor,
          fontSize: 11,
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
Object.assign(window, {
  showUserMenu,
  handleLogout,
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
