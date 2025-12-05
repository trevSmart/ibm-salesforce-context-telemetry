// @ts-nocheck
/* eslint-env browser */
// Prevent double execution when soft navigation re-injects the script
if (window.__EVENT_LOG_LOADED__) {
  console.info('[Telemetry Viewer] Event log script already loaded; skipping duplicate execution.');
} else {
  window.__EVENT_LOG_LOADED__ = true;

  const detectElectronEnvironment = () => {
    const userAgent = navigator?.userAgent?.toLowerCase() || '';
    if (userAgent.includes(' electron/')) {
      return true;
    }
    if (typeof window !== 'undefined' && window.process?.versions?.electron) {
      return true;
    }
    if (typeof navigator === 'object' && Array.isArray(navigator.plugins)) {
      return navigator.plugins.namedItem?.('Chromium PDF Plugin') && window.process?.type === 'renderer';
    }
    return false;
  };

  const isElectronRuntime = detectElectronEnvironment();
  window.__IS_ELECTRON__ = isElectronRuntime;
  document.documentElement.dataset.runtime = isElectronRuntime ? 'electron' : 'browser';
  document.body?.classList?.toggle('electron-runtime', isElectronRuntime);
  console.info(`[Telemetry Viewer] Runtime detected: ${isElectronRuntime ? 'Electron' : 'Browser'}`);


  // Check authentication status on page load
  (async () => {
    try {
      const response = await fetch('/api/auth/status', {
        credentials: 'include' // Ensure cookies are sent
      });
      const data = await response.json();
      if (!data.authenticated) {
        window.location.href = '/login';
        return;
      }
      if (data.role !== 'advanced' && data.role !== 'administrator') {
        window.location.href = '/';
        return;
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      window.location.href = '/login';
    }
  })();

  let userMenuHideTimeout = null;
  const USER_MENU_HIDE_DELAY_MS = 300;

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

  // Cache for org-team mappings to avoid repeated API calls
  let orgTeamMappingsCache = null;
  let mappingsCacheTimestamp = null;
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  async function getOrgTeamMappings() {
    // Check cache first
    if (orgTeamMappingsCache && mappingsCacheTimestamp &&
        (Date.now() - mappingsCacheTimestamp) < CACHE_DURATION) {
      // Ensure cached value is still an array (defensive check)
      if (Array.isArray(orgTeamMappingsCache)) {
        return orgTeamMappingsCache;
      } else {
        console.warn('Cached orgTeamMappingsCache is not an array, clearing cache');
        orgTeamMappingsCache = null;
        mappingsCacheTimestamp = null;
      }
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


  async function openSettingsModal() {
    const existing = document.querySelector('.confirm-modal-backdrop.settings-backdrop');
    if (existing) {
      return;
    }

    // Check user role to determine if admin-only sections should be shown
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
    const usersLoadingRow = `
      <tr>
        <td colspan="4" class="settings-users-empty">
          <div class="settings-users-loading" role="status" aria-live="polite">
            <span class="settings-users-spinner" aria-hidden="true"></span>
            <span class="settings-users-loading-text">Loading users...</span>
          </div>
        </td>
      </tr>
    `;

    const backdrop = document.createElement('div');
    backdrop.className = 'confirm-modal-backdrop settings-backdrop';

    const modal = document.createElement('div');
    modal.className = 'confirm-modal settings-modal';

    // Get current settings
    const savedTheme = localStorage.getItem('theme') || 'light';
    const isDarkTheme = savedTheme === 'dark';
    const showServerStats = localStorage.getItem('showServerStats') !== 'false';
    const autoRefreshEnabled = localStorage.getItem('autoRefreshEnabled') === 'true';
    const autoRefreshInterval = localStorage.getItem('autoRefreshInterval') || '';

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
									<div class="absolute left-1 top-1 w-4 h-4 bg-white rounded-full toggle-knob"></div>
								</div>
							</label>
							<label class="flex items-center justify-between cursor-pointer py-2">
								<div class="flex flex-col">
									<span class="text-sm font-medium text-[color:var(--text-primary)]">Dark theme</span>
									<span class="text-xs text-[color:var(--text-secondary)]">Switch between light and dark color scheme.</span>
								</div>
								<input type="checkbox" class="sr-only peer" id="darkThemeToggle" ${isDarkTheme ? 'checked' : ''}>
								<div class="relative w-11 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:bg-blue-600 dark:peer-checked:bg-blue-600 transition-colors duration-200 ease-in-out">
									<div class="absolute left-1 top-1 w-4 h-4 bg-white rounded-full toggle-knob"></div>
								</div>
							</label>
						</section>
						<section id="settings-events" class="settings-section">
							<div class="settings-modal-placeholder-title">Events</div>
							<div class="settings-toggle-row">
								<div class="settings-toggle-text" style="flex: 1;">
									<div class="settings-toggle-title">Automatic refresh</div>
									<div class="settings-toggle-description">
										Automatically refresh the events list at the specified interval.
									</div>
								</div>
								<div id="autoRefreshToggleWrapper" style="display: flex; align-items: center; gap: 8px;">
									<label for="autoRefreshToggle" class="flex items-center cursor-pointer" style="margin: 0;">
										<input type="checkbox" class="sr-only peer" id="autoRefreshToggle" ${autoRefreshEnabled ? 'checked' : ''}>
										<div class="relative w-11 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:bg-blue-600 dark:peer-checked:bg-blue-600 transition-colors duration-200 ease-in-out">
											<div id="autoRefreshToggleKnob" class="absolute left-1 top-1 w-4 h-4 bg-white rounded-full toggle-knob"></div>
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
										${usersLoadingRow}
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

    if (sidebarLinks.length > 0) {
      const firstSectionId = sidebarLinks[0].getAttribute('href');
      showSection(firstSectionId);
    }

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


    // Users section functionality
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
          if (usersTableBody) {
            usersTableBody.innerHTML = usersLoadingRow;
          }
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
            return '#dc2626';
          case 'advanced':
            return '#2563eb';
          case 'basic':
            return '#16a34a';
          default:
            return '#6b7280';
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
                  <select name="role"
                    style="margin-top: 4px; width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 14px; cursor: pointer;">
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
                  <select name="role"
                    style="margin-top: 4px; width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 14px; cursor: pointer;">
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

        usersSection.addEventListener('reloadUsers', loadUsers);

        if (usersSection.style.display !== 'none') {
          loadUsers();
        }
      }
    }

    // Handle dark theme toggle
    const darkThemeToggle = modal.querySelector('#darkThemeToggle');
    if (darkThemeToggle) {
      darkThemeToggle.addEventListener('change', (e) => {
        const newTheme = e.target.checked ? 'dark' : 'light';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
      });
    }

    // Handle show server stats toggle
    const showServerStatsToggle = modal.querySelector('#showServerStatsToggle');
    if (showServerStatsToggle) {
      showServerStatsToggle.addEventListener('change', (e) => {
        localStorage.setItem('showServerStats', e.target.checked ? 'true' : 'false');
        updateServerStatsVisibility();
      });
    }

    const clearLocalDataBtn = modal.querySelector('#clearLocalDataBtn');
    if (clearLocalDataBtn) {
      clearLocalDataBtn.addEventListener('click', () => {
        clearLocalData();
      });
    }

    // Handle auto refresh toggle
    const autoRefreshToggle = modal.querySelector('#autoRefreshToggle');
    const autoRefreshToggleWrapper = modal.querySelector('#autoRefreshToggleWrapper');
    const autoRefreshIntervalSelect = modal.querySelector('#autoRefreshInterval');
    if (autoRefreshToggle && autoRefreshIntervalSelect) {
      autoRefreshToggle.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        localStorage.setItem('autoRefreshEnabled', enabled ? 'true' : 'false');
        autoRefreshIntervalSelect.disabled = !enabled;
        updateAutoRefreshInterval();
      });

      autoRefreshIntervalSelect.addEventListener('change', (e) => {
        const interval = e.target.value;
        localStorage.setItem('autoRefreshInterval', interval);
        updateAutoRefreshInterval();
      });

      if (autoRefreshToggleWrapper) {
        autoRefreshToggleWrapper.addEventListener('click', (event) => {
          const clickedSelect = event.target.closest('#autoRefreshInterval');
          const clickedToggle = event.target.closest('label[for="autoRefreshToggle"]');
          if (clickedSelect || clickedToggle) {
            return;
          }
          event.preventDefault();
          autoRefreshToggle.checked = !autoRefreshToggle.checked;
          autoRefreshToggle.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }
    }

    const deleteAllEventsBtn = modal.querySelector('#deleteAllEventsBtn');
    if (deleteAllEventsBtn) {
      deleteAllEventsBtn.addEventListener('click', () => {
        confirmDeleteAll();
      });
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
        }
      });
      if (response.ok) {
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Logout error:', error);
      window.location.href = '/login';
    }
  }

  // Helper function to handle authentication errors
  async function handleApiResponse(response) {
    if (response.status === 401) {
      window.location.href = '/login';
      return null;
    }
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response;
  }

  // Format time ago in natural language
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

  // Update the "Last updated" text
  function updateLastUpdatedText() {
    const lastUpdatedEl = document.getElementById('lastUpdatedInfo');
    if (lastUpdatedEl && lastFetchTime) {
      lastUpdatedEl.textContent = formatTimeAgo(lastFetchTime);
    } else if (lastUpdatedEl) {
      lastUpdatedEl.textContent = 'never';
    }
  }

  // Start interval to update "Last updated" text every minute
  function startLastUpdatedInterval() {
    if (lastUpdatedIntervalId) {
      clearInterval(lastUpdatedIntervalId);
    }
    lastUpdatedIntervalId = setInterval(() => {
      updateLastUpdatedText();
    }, 60000); // Update every minute
  }

  let currentOffset = 0;
  let limit = 50;
  let _totalEvents = 0;
  let hasMoreEvents = true;
  let isLoadingMore = false;
  let allLoadedEvents = []; // Accumulative array of all loaded events
  let selectedSession = 'all';
  let selectedTeamKey = null; // Lowercased team name acting as key
  let orgToTeamMap = new Map(); // org identifier -> team key
  let teamEventCounts = new Map(); // team key -> event count in current view
  let teamEventCountsSource = 'local'; // 'server' uses aggregated counters, 'local' uses paged events
  let selectedActivityDate = null; // null means use current day by default
  let activeFilters = new Set(['tool_call', 'session_start', 'custom', 'tool_error']);
  let selectedUserIds = new Set(); // Will be populated with all users when loaded - all selected by default
  let allUserIds = new Set(); // Track all available user IDs
  let selectedSessionsForDeletion = new Set(); // Track sessions selected for deletion
  let selectionMode = false; // Track if selection mode is active
  let lastSelectedSessionId = null; // Track last selected session for shift-click range selection
  let searchQuery = '';
  let sortOrder = 'DESC';
  let startTime = performance.now();
  const _NOTIFICATION_REFRESH_INTERVAL = 5 * 60 * 1000;
  let notificationModeEnabled = false;
  let notificationRefreshIntervalId = null;
  let autoRefreshIntervalId = null;
  let isRefreshInProgress = false;
  let lastKnownEventTimestamp = null;
  let lastFetchTime = null; // Track when events were last fetched
  let isInitialChartLoad = true; // Track if this is the initial chart load
  let lastUpdatedIntervalId = null; // Interval to update "Last updated" text
  const knownSessionIds = new Set();
  const sessionDisplayMap = new Map();
  let sessionActivityChart = null;
  let lastSessionActivityEvents = [];
  let activeTab = 'sessions'; // 'sessions' or 'users'
  const SESSION_ACTIVITY_FETCH_LIMIT = 1000;
  // State for hover preview functionality
  let hoverPreviewState = null;
  let isHoverPreviewActive = false;
  let hoverTimeoutId = null;
  const SESSION_ACTIVITY_SLOT_MINUTES = 10;
  const _SESSION_ACTIVITY_MARGIN_MINUTES = 30;
  const SESSION_SERIES_COLORS = [
    '#53cf98',
    '#38bdf8',
    '#f97316',
    '#a78bfa',
    '#fb7185',
    '#22d3ee',
    '#c084fc',
    '#f472b6'
  ];
  const OFFICE_START = { hour: 8, minute: 30 };
  const OFFICE_END = { hour: 18, minute: 30 };
  let isResizingSidebar = false;
  let sidebarResizeStartX = 0;
  let sidebarResizeStartWidth = 0;
  let isResizingActivity = false;
  let activityResizeStartY = 0;
  let activityResizeStartHeight = 0;
  const globalErrorMessages = [];
  const MAX_GLOBAL_ERROR_MESSAGES = 3;

  function resetEventLogState() {
    currentOffset = 0;
    limit = 50;
    hasMoreEvents = true;
    isLoadingMore = false;
    allLoadedEvents = [];
    selectedSession = 'all';
    selectedActivityDate = null;
    activeFilters = new Set(['tool_call', 'session_start', 'custom', 'tool_error']);
    selectedUserIds = new Set();
    allUserIds = new Set();
    selectedSessionsForDeletion = new Set();
    selectionMode = false;
    lastSelectedSessionId = null;
    searchQuery = '';
    sortOrder = 'DESC';
    startTime = performance.now();
    notificationModeEnabled = false;
    if (notificationRefreshIntervalId) {
      clearInterval(notificationRefreshIntervalId);
      notificationRefreshIntervalId = null;
    }
    if (autoRefreshIntervalId) {
      clearInterval(autoRefreshIntervalId);
      autoRefreshIntervalId = null;
    }
    lastKnownEventTimestamp = null;
    lastFetchTime = null;
    isInitialChartLoad = true;
    if (lastUpdatedIntervalId) {
      clearInterval(lastUpdatedIntervalId);
      lastUpdatedIntervalId = null;
    }
    knownSessionIds.clear();
    sessionDisplayMap.clear();
    sessionActivityChart = null;
    lastSessionActivityEvents = [];
    activeTab = 'sessions';
    hoverPreviewState = null;
    isHoverPreviewActive = false;
    hoverTimeoutId = null;
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    updateThemeIcon(theme);
    // Update toggle in settings modal if it exists
    const darkThemeToggle = document.querySelector('#darkThemeToggle');
    if (darkThemeToggle) {
      darkThemeToggle.checked = theme === 'dark';
    }
  }

  function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const theme = savedTheme || 'light';
    applyTheme(theme);
    updateServerStatsVisibility();
    // Wire up theme toggle if present
    const darkThemeToggle = document.querySelector('#darkThemeToggle');
    if (darkThemeToggle) {
      darkThemeToggle.addEventListener('change', toggleTheme);
    }
  }

  function updateServerStatsVisibility() {
    const showServerStats = localStorage.getItem('showServerStats') !== 'false';
    const footerInfo = document.querySelector('.footer-info');
    if (footerInfo) {
      footerInfo.style.display = showServerStats ? '' : 'none';
    }
  }


  function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    const newTheme = isDark ? 'light' : 'dark';
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
    refreshSessionActivityTheme();
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

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          animateAndResolve(false);
        }
      });

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

  function updateThemeIcon(theme) {
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

  // Listen for system theme changes and update if no manual preference is set
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
    // Only update if user hasn't manually set a preference
      if (!localStorage.getItem('theme')) {
        const newTheme = e.matches ? 'dark' : 'light';
        applyTheme(newTheme);
        refreshSessionActivityTheme();
      }
    });
  }

  // Level filter management
  function setupLevelFilters() {
    document.querySelectorAll('.level-filter-btn').forEach(btn => {
      const level = btn.dataset.level;

      function updateButtonState() {
        if (btn.classList.contains('active')) {
          activeFilters.add(level);
        } else {
          activeFilters.delete(level);
        }
      }

      btn.addEventListener('click', (_e) => {
        btn.classList.toggle('active');
        updateButtonState();
        currentOffset = 0;
        loadEvents();
      });

      // Initialize button state
      updateButtonState();
    });
  }

  function setupSidebarResizer() {
    const resizer = document.getElementById('sidebarResizer');
    const sidebar = document.querySelector('.sidebar');
    if (!resizer || !sidebar) {
      return;
    }

    const startResize = (event) => {
      const point = event.touches ? event.touches[0] : event;
      isResizingSidebar = true;
      sidebarResizeStartX = point.clientX;
      sidebarResizeStartWidth = sidebar.offsetWidth;
      document.body.classList.add('sidebar-resizing');
      document.addEventListener('mousemove', handleResize);
      document.addEventListener('mouseup', stopResize);
      document.addEventListener('touchmove', handleResize, { passive: false });
      document.addEventListener('touchend', stopResize);
      event.preventDefault();
    };

    const handleResize = (event) => {
      if (!isResizingSidebar) {
        return;
      }
      const point = event.touches ? event.touches[0] : event;
      const delta = point.clientX - sidebarResizeStartX;
      let newWidth = sidebarResizeStartWidth + delta;
      newWidth = Math.max(220, Math.min(500, newWidth));
      document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
    };

    const stopResize = () => {
      if (!isResizingSidebar) {
        return;
      }
      isResizingSidebar = false;
      document.body.classList.remove('sidebar-resizing');
      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', stopResize);
      document.removeEventListener('touchmove', handleResize);
      document.removeEventListener('touchend', stopResize);
    };

    resizer.addEventListener('mousedown', startResize);
    resizer.addEventListener('touchstart', startResize, { passive: false });
  }

  function setupHorizontalResizer() {
    const resizer = document.getElementById('horizontalResizer');
    const activityCard = document.getElementById('sessionActivityCard');
    if (!resizer || !activityCard) {
      console.warn('Horizontal resizer: resizer or activityCard not found', { resizer, activityCard });
      return;
    }

    const updateResizerVisibility = () => {
      const isCardHidden = activityCard.classList.contains('hidden');
      if (isCardHidden) {
        resizer.classList.add('hidden');
      } else {
        resizer.classList.remove('hidden');
      }
    };

    // Update visibility when card visibility changes
    const observer = new MutationObserver(updateResizerVisibility);
    observer.observe(activityCard, { attributes: true, attributeFilter: ['class'] });
    updateResizerVisibility();

    const startResize = (event) => {
      const point = event.touches ? event.touches[0] : event;
      isResizingActivity = true;
      activityResizeStartY = point.clientY;
      activityResizeStartHeight = activityCard.offsetHeight;
      document.body.classList.add('activity-resizing');
      document.addEventListener('mousemove', handleResize);
      document.addEventListener('mouseup', stopResize);
      document.addEventListener('touchmove', handleResize, { passive: false });
      document.addEventListener('touchend', stopResize);
      event.preventDefault();
    };

    const handleResize = (event) => {
      if (!isResizingActivity) {
        return;
      }
      const point = event.touches ? event.touches[0] : event;
      const delta = point.clientY - activityResizeStartY;
      let newHeight = activityResizeStartHeight + delta;
      newHeight = Math.max(190, Math.min(600, newHeight));
      activityCard.style.height = `${newHeight}px`;
      // Redimensionar la gràfica per adaptar-se al nou espai
      if (sessionActivityChart) {
        sessionActivityChart.resize();
      }
    };

    const stopResize = () => {
      if (!isResizingActivity) {
        return;
      }
      isResizingActivity = false;
      document.body.classList.remove('activity-resizing');
      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', stopResize);
      document.removeEventListener('touchmove', handleResize);
      document.removeEventListener('touchend', stopResize);
      // Ensure the chart resizes when resizing ends
      if (sessionActivityChart) {
        setTimeout(() => {
          sessionActivityChart.resize();
        }, 0);
      }
    };

    resizer.addEventListener('mousedown', startResize);
    resizer.addEventListener('touchstart', startResize, { passive: false });
  }

  function initSessionActivityChart() {
    if (sessionActivityChart) {
      return sessionActivityChart;
    }
    const chartEl = document.getElementById('sessionActivityChart');
    if (!chartEl) {
      return null;
    }
    // Wait for ECharts to load if not available yet
    if (typeof echarts === 'undefined') {
      window.addEventListener('echartsLoaded', function onEChartsLoaded() {
        window.removeEventListener('echartsLoaded', onEChartsLoaded);
        initSessionActivityChart();
      }, { once: true });
      return null;
    }
    sessionActivityChart = echarts.init(chartEl);
    window.addEventListener('resize', () => {
      sessionActivityChart?.resize();
    });
    return sessionActivityChart;
  }

  function hideSessionActivityCard() {
    const card = document.getElementById('sessionActivityCard');
    if (card) {
      card.classList.add('hidden');
    }
    const title = document.getElementById('sessionActivityTitle');
    if (title) {
      title.textContent = 'Timeline';
    }
    const subtitle = document.getElementById('sessionActivitySubtitle');
    if (subtitle) {
      subtitle.textContent = '–';
    }
    lastSessionActivityEvents = [];
    if (sessionActivityChart) {
      sessionActivityChart.clear();
    }
  }

  function showSessionActivityCard() {
    const card = document.getElementById('sessionActivityCard');
    if (card) {
      card.classList.remove('hidden');
    }
  }

  async function fetchAllSessionsActivityEvents() {
    const params = new URLSearchParams({
      limit: SESSION_ACTIVITY_FETCH_LIMIT.toString(),
      orderBy: 'created_at',
      order: 'ASC'
    });

    const response = await fetch(`/api/events?${params}`, {
      credentials: 'include' // Ensure cookies are sent
    });
    const validResponse = await handleApiResponse(response);
    if (!validResponse) return [];
    const data = await validResponse.json();
    return Array.isArray(data.events) ? data.events : [];
  }

  // Save current chart state for hover preview restoration
  function saveChartState() {
  // If already in hover preview, we want to save the original state, not the preview state
  // So we use the saved state's sessionId if available, otherwise use current selectedSession
    if (isHoverPreviewActive && hoverPreviewState) {
    // Already saved the original state, don't overwrite it
      return;
    }
    hoverPreviewState = {
      sessionId: selectedSession,
      activityDate: selectedActivityDate ? new Date(selectedActivityDate) : null,
      events: lastSessionActivityEvents.slice()
    };
  }

  // Restore chart state from hover preview
  function restoreChartState() {
  // Clear any pending hover timeout
    if (hoverTimeoutId !== null) {
      clearTimeout(hoverTimeoutId);
      hoverTimeoutId = null;
    }

    if (!hoverPreviewState || !isHoverPreviewActive) {
      return;
    }
    const savedState = hoverPreviewState;
    hoverPreviewState = null;
    isHoverPreviewActive = false;

    // Restore the selected session
    selectedSession = savedState.sessionId;

    // Restore the selected activity date
    selectedActivityDate = savedState.activityDate ? new Date(savedState.activityDate) : null;

    // Restore the visual state of session buttons
    document.querySelectorAll('.session-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('[data-session="all"]').forEach(i => i.classList.remove('active'));

    if (savedState.sessionId === 'all') {
    // Restore "All Sessions" as active
      document.querySelectorAll('[data-session="all"]').forEach(item => {
        item.classList.add('active');
      });
    } else {
    // Restore the specific session as active
      const sessionItem = document.querySelector(`.session-item[data-session="${savedState.sessionId}"]`);
      if (sessionItem) {
        sessionItem.classList.add('active');
      }
    }

    // Restore the chart with saved state
    if (savedState.events && savedState.events.length > 0) {
      renderSessionActivityChart(savedState.events, { sessionId: savedState.sessionId, activityDate: savedState.activityDate });
    } else {
    // If no saved events, reload the chart for the saved session
      updateSessionActivityChart({ sessionId: savedState.sessionId });
    }
  }

  // Handle hover preview for session buttons
  async function handleSessionHover(sessionId, sessionData = null) {
  // Don't preview if already selected and not in hover preview
    if (selectedSession === sessionId && !isHoverPreviewActive) {
      return;
    }

    // Clear any existing hover timeout
    if (hoverTimeoutId !== null) {
      clearTimeout(hoverTimeoutId);
      hoverTimeoutId = null;
    }

    // Save current state if not already in hover preview
    if (!isHoverPreviewActive) {
      saveChartState();
    }

    // Extract the session date from sessionData
    let sessionDate = null;
    if (sessionData) {
      const sessionDay = sessionData.last_event || sessionData.first_event || null;
      if (sessionDay) {
        const parsedDate = new Date(sessionDay);
        if (!Number.isNaN(parsedDate.getTime())) {
          sessionDate = parsedDate;
        }
      }
    }

    // Delay the chart update by 150ms
    hoverTimeoutId = setTimeout(async () => {
      isHoverPreviewActive = true;

      // Update chart to show hovered session with smooth transition
      if (sessionId === 'all') {
        try {
          const allEvents = await fetchAllSessionsActivityEvents();
          if (allEvents.length > 0) {
            renderSessionActivityChart(allEvents, { sessionId: 'all', activityDate: sessionDate, enableTransition: true });
          }
        } catch (error) {
          console.error('Error loading hover preview for all sessions:', error);
        }
      } else {
        try {
          const params = new URLSearchParams({
            sessionId: sessionId,
            orderBy: 'created_at',
            order: 'ASC',
            limit: SESSION_ACTIVITY_FETCH_LIMIT.toString()
          });
          const response = await fetch(`/api/events?${params}`);
          const validResponse = await handleApiResponse(response);
          if (validResponse) {
            const data = await validResponse.json();
            if (data.events && data.events.length > 0) {
            // If no session date from sessionData, extract from first event
              if (!sessionDate && data.events.length > 0) {
                const firstEventDate = new Date(data.events[0].timestamp);
                if (!Number.isNaN(firstEventDate.getTime())) {
                  sessionDate = firstEventDate;
                }
              }
              renderSessionActivityChart(data.events, { sessionId: sessionId, activityDate: sessionDate, enableTransition: true });
            }
          }
        } catch (error) {
          console.error('Error loading hover preview for session:', error);
        }
      }

      hoverTimeoutId = null;
    }, 150);
  }

  async function updateSessionActivityChart(options = {}) {
    const eventsOverride = Array.isArray(options.events) ? options.events : null;
    const targetSession = typeof options.sessionId !== 'undefined' ? options.sessionId : selectedSession;

    if (eventsOverride && eventsOverride.length > 0) {
      renderSessionActivityChart(eventsOverride, { sessionId: targetSession });
      return;
    }

    if (targetSession === 'all') {
      try {
        const allEvents = await fetchAllSessionsActivityEvents();
        if (allEvents.length === 0) {
          hideSessionActivityCard();
          // If this is the initial load and there are no events, show the page anyway
          if (isInitialChartLoad) {
            isInitialChartLoad = false;
            document.body.style.visibility = 'visible';
          }
          return;
        }
        renderSessionActivityChart(allEvents, { sessionId: 'all' });
      } catch (error) {
        handleInitializationError('all sessions activity chart', error);
        hideSessionActivityCard();
        // If this is the initial load and there's an error, show the page anyway
        if (isInitialChartLoad) {
          isInitialChartLoad = false;
          document.body.style.visibility = 'visible';
        }
      }
      return;
    }

    try {
      const params = new URLSearchParams({
        sessionId: targetSession,
        orderBy: 'created_at',
        order: 'ASC',
        limit: SESSION_ACTIVITY_FETCH_LIMIT.toString()
      });
      const response = await fetch(`/api/events?${params}`);
      const validResponse = await handleApiResponse(response);
      if (!validResponse) {
      // If this is the initial load and response is invalid, show the page anyway
        if (isInitialChartLoad) {
          isInitialChartLoad = false;
          document.body.style.visibility = 'visible';
        }
        return;
      }
      const data = await validResponse.json();
      if (!data.events || data.events.length === 0) {
        hideSessionActivityCard();
        // If this is the initial load and there are no events, show the page anyway
        if (isInitialChartLoad) {
          isInitialChartLoad = false;
          const mainContainer = document.querySelector('.container');
          if (mainContainer) {
            mainContainer.style.visibility = 'visible';
            mainContainer.style.opacity = '1';
          }
        }
        return;
      }
      renderSessionActivityChart(data.events, { sessionId: targetSession });
    } catch (error) {
      console.error('Error loading session activity chart:', error);
      hideSessionActivityCard();
      // If this is the initial load and there's an error, show the page anyway
      if (isInitialChartLoad) {
        isInitialChartLoad = false;
        document.body.style.visibility = 'visible';
      }
    }
  }

  function renderSessionActivityChart(events, options = {}) {
    if (!Array.isArray(events) || events.length === 0) {
      hideSessionActivityCard();
      // If this is the initial load and there are no events, show the page anyway
      if (isInitialChartLoad) {
        isInitialChartLoad = false;
        document.body.style.visibility = 'visible';
      }
      return;
    }

    const chartInstance = initSessionActivityChart();
    if (!chartInstance) {
    // If this is the initial load and chart can't be initialized, show the page anyway
      if (isInitialChartLoad) {
        isInitialChartLoad = false;
        const mainContainer = document.querySelector('.container');
        if (mainContainer) {
          mainContainer.style.visibility = 'visible';
          mainContainer.style.opacity = '1';
        }
      }
      return;
    }

    lastSessionActivityEvents = events.slice();
    const targetSession = options.sessionId || selectedSession;
    const uniqueSessions = Array.from(new Set(events.map(evt => evt.session_id || 'Unknown session')));
    const isAllSessionsView = targetSession === 'all' && uniqueSessions.length > 0;

    // Use activityDate from options if provided (for hover preview), otherwise use selectedActivityDate
    const overrideDate = options.activityDate ? new Date(options.activityDate) : null;

    // Enable smooth transitions when hovering (notMerge: false allows ECharts to animate)
    const enableTransition = options.enableTransition === true;

    let seriesData = [];
    let windowStart;
    let windowEnd;
    let referenceDate;
    let officeStart;
    let officeEnd;
    let maxBucketCount;
    let multiSeriesEntries = [];

    if (isAllSessionsView) {
    // For "All sessions", use override date, selected date, or current day
      const useCurrentDay = false; // Always use the date from events or selected date
      let dateToUse = overrideDate || selectedActivityDate;
      if (!dateToUse) {
      // Use current day by default
        dateToUse = new Date();
      }
      const multiSeries = buildMultiSessionActivitySeries(events, useCurrentDay, dateToUse);
      windowStart = multiSeries.windowStart;
      windowEnd = multiSeries.windowEnd;
      referenceDate = multiSeries.referenceDate;
      officeStart = multiSeries.officeStart;
      officeEnd = multiSeries.officeEnd;
      maxBucketCount = multiSeries.maxBucketCount;
      multiSeriesEntries = multiSeries.seriesList;
    } else {
    // For specific session, use override date, selected date, or current day
      const useCurrentDay = true; // Always use current day when no date is selected
      const dateToUse = overrideDate || selectedActivityDate || new Date();
      const singleSeries = buildSessionActivitySeries(events, useCurrentDay, dateToUse);
      ({
        seriesData,
        windowStart,
        windowEnd,
        referenceDate,
        officeStart,
        officeEnd,
        maxBucketCount
      } = singleSeries);
    }

    const totalEvents = events.length;
    const sessionCount = uniqueSessions.length;
    const dateLabel = getRelativeDateLabel(referenceDate);

    // Update the title with the date
    const title = document.getElementById('sessionActivityTitle');
    if (title) {
      title.textContent = `Activity during ${dateLabel}`;
    }

    // Update navigation buttons state
    updateDateNavigationButtons(referenceDate);

    const subtitle = document.getElementById('sessionActivitySubtitle');
    if (subtitle) {
      const eventLabel = totalEvents === 1 ? 'event' : 'events';
      const formattedDate = formatHumanDate(referenceDate);
      if (isAllSessionsView) {
        const sessionLabel = sessionCount === 1 ? 'session' : 'sessions';
        subtitle.textContent = `${formattedDate} · ${sessionCount} ${sessionLabel} · ${totalEvents} ${eventLabel}`;
      } else {
        subtitle.textContent = `${formattedDate} · ${totalEvents} ${eventLabel}`;
      }
    }
    showSessionActivityCard();

    const themeIsDark = document.documentElement.classList.contains('dark');
    const axisColor = themeIsDark ? '#a1a1aa' : '#52525b';
    const splitLineColor = themeIsDark ? 'rgba(63, 63, 70, 0.35)' : 'rgba(228, 228, 231, 0.35)';
    const gradientCap = 70;
    const yAxisMax = Math.max(10, maxBucketCount || 0);
    const warmOffset = Math.min(gradientCap / Math.max(yAxisMax, 1), 1);

    let chartSeries = [];
    if (isAllSessionsView) {
      chartSeries = multiSeriesEntries.map((entry, index) => {
        const color = SESSION_SERIES_COLORS[index % SESSION_SERIES_COLORS.length];
        return createMultiSessionSeriesOption(entry.sessionId, entry.seriesData, color);
      });
    } else {
      chartSeries = [createSingleSessionSeriesOption(seriesData, warmOffset)];
    }

    // Configure animation for smooth transitions
    const animationConfig = enableTransition ? {
      animation: true,
      animationDuration: 200,
      animationEasing: 'cubicOut'
    } : {
      animation: true,
      animationDuration: 200,
      animationEasing: 'cubicOut'
    };

    chartInstance.setOption({
      ...animationConfig,
      textStyle: {
        fontFamily: 'Inter, \'Manrope\', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif'
      },
      grid: { left: 45, right: 10, top: 15, bottom: 30 },
      xAxis: {
        type: 'time',
        min: windowStart.getTime(),
        max: windowEnd.getTime(),
        axisLabel: {
          color: axisColor,
          formatter: value => formatChartTimeLabel(new Date(value))
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { show: true, lineStyle: { color: splitLineColor } },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: yAxisMax,
        minInterval: 1,
        name: 'Events',
        nameGap: 22,
        nameTextStyle: { color: axisColor },
        axisLabel: { color: axisColor },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: splitLineColor } }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'line',
          lineStyle: {
            type: 'solid',
            color: 'rgba(14, 165, 233, 0.6)',
            width: 1
          }
        },
        formatter: function(params) {
          if (!Array.isArray(params)) {
            params = [params];
          }
          // Filter series with value 0 or null
          const filteredParams = params.filter(param => {
          // Extract the actual numeric value from param.value
          // For time-series data, value can be [timestamp, value] or just the value
            let value = param.value;
            if (Array.isArray(value) && value.length >= 2) {
            // If it's an array, the second element is the actual value
              value = value[1];
            }
            return value !== null && value !== undefined && value !== 0;
          });
          // If there are no valid series, don't show the tooltip
          if (filteredParams.length === 0) {
            return '';
          }
          // Build the tooltip content with filtered series
          let result = '';
          if (filteredParams.length > 0 && filteredParams[0].axisValue) {
            const date = new Date(filteredParams[0].axisValue);
            result += `<div style="margin-bottom: 4px; font-weight: 500;">${formatHumanDate(date)} ${formatChartTimeLabel(date)}</div>`;
          }
          filteredParams.forEach(param => {
          // Extract the actual numeric value
            let value = param.value;
            if (Array.isArray(value) && value.length >= 2) {
            // If it's an array, the second element is the actual value
              value = value[1];
            }
            const eventLabel = value === 1 ? 'event' : 'events';
            const marker = `<span style="display:inline-block;margin-right:4px;border-radius:50%;width:10px;height:10px;background-color:${param.color};"></span>`;
            result += `<div style="margin: 2px 0;">${marker}${param.seriesName}: <strong>${value} ${eventLabel}</strong></div>`;
          });
          return result;
        }
      },
      series: chartSeries,
      markArea: {
        itemStyle: { color: 'rgba(16,185,129,0.12)' },
        data: [
          [
            { xAxis: officeStart.getTime() },
            { xAxis: officeEnd.getTime() }
          ]
        ]
      }
    }, !enableTransition); // notMerge: false when transition is enabled, true otherwise

    chartInstance.resize();

    // Listen for chart rendering completion
    const onChartFinished = () => {
    // Remove the listener after it fires once
      chartInstance.off('finished', onChartFinished);

      // Show the chart once rendering is complete
      const chartEl = document.getElementById('sessionActivityChart');
      if (chartEl) {
        chartEl.style.visibility = 'visible';
      }

      // Call the callback if provided
      if (options.onRenderComplete && typeof options.onRenderComplete === 'function') {
        options.onRenderComplete();
      }

      // Dispatch a custom event for external listeners
      const event = new CustomEvent('chartRenderComplete', {
        detail: {
          sessionId: targetSession,
          eventCount: totalEvents,
          timestamp: Date.now(),
          isInitialLoad: isInitialChartLoad
        }
      });
      window.dispatchEvent(event);

      // Mark that initial load is complete
      if (isInitialChartLoad) {
        isInitialChartLoad = false;
      }
    };

    // Register the listener for the 'finished' event
    chartInstance.on('finished', onChartFinished);

    // Filter legend to only show series with data during the displayed day
    let legendEntries = null;
    if (isAllSessionsView) {
    // Calculate the day boundaries (00:00:00 to 23:59:59.999 of referenceDate)
      const dayStart = new Date(referenceDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(referenceDate);
      dayEnd.setHours(23, 59, 59, 999);

      // Filter series to only those with data (value > 0) during the displayed day
      const filteredSeries = chartSeries.filter(series => {
      // Check if series has any data points with value > 0 during the displayed day
        if (!series.data || !Array.isArray(series.data)) {
          return false;
        }
        // Check if any point has value > 0 and falls within the displayed day
        return series.data.some(point => {
          if (!Array.isArray(point) || point.length < 2) {
            return false;
          }
          const timestamp = point[0];
          const value = point[1];
          // Check if the point is within the displayed day and has data
          return value > 0 && timestamp >= dayStart.getTime() && timestamp <= dayEnd.getTime();
        });
      });

      // Map to legend entries
      legendEntries = filteredSeries.map(series => ({
        name: series.name,
        color: series.lineStyle?.color || '#53cf98'
      }));

      // Fallback: if filter removed all series, show all series (for debugging)
      if (legendEntries.length === 0 && chartSeries.length > 0) {
        legendEntries = chartSeries.map(series => ({
          name: series.name,
          color: series.lineStyle?.color || '#53cf98'
        }));
      }
    } else {
    // For single session view, show the session's series in the legend
      if (chartSeries.length > 0) {
        const series = chartSeries[0];
        // Check if series has data (value > 0) in the visible window
        const hasData = series.data && Array.isArray(series.data) && series.data.some(point => {
          if (!Array.isArray(point) || point.length < 2) {
            return false;
          }
          const value = point[1];
          return value > 0;
        });

        if (hasData) {
          legendEntries = [{
            name: series.name,
            color: series.lineStyle?.color || '#53cf98'
          }];
        }
      }
    }
    renderSessionActivityLegend(legendEntries, isAllSessionsView);
  }

  function buildSessionActivitySeries(events, useCurrentDay = false, customDate = null) {
  // Use custom date if provided, otherwise use current day if useCurrentDay is true, otherwise use the session's day
    let referenceDate;
    if (customDate) {
      referenceDate = new Date(customDate);
    } else if (useCurrentDay) {
      referenceDate = new Date();
    } else {
      referenceDate = new Date(events[0].timestamp);
    }
    const eventTimes = events
      .map(event => Date.parse(event.timestamp))
      .filter(time => !Number.isNaN(time));
    const minEventTime = eventTimes.length ? Math.min(...eventTimes) : null;
    const maxEventTime = eventTimes.length ? Math.max(...eventTimes) : null;
    const { start: windowStart, end: windowEnd } = getExtendedWindow(referenceDate, minEventTime, maxEventTime);
    const officeStart = new Date(referenceDate);
    officeStart.setHours(OFFICE_START.hour, OFFICE_START.minute, 0, 0);
    const officeEnd = new Date(referenceDate);
    officeEnd.setHours(OFFICE_END.hour, OFFICE_END.minute, 0, 0);
    const slotMs = SESSION_ACTIVITY_SLOT_MINUTES * 60 * 1000;
    const slotCount = Math.floor((windowEnd.getTime() - windowStart.getTime()) / slotMs) + 1;
    const buckets = Array.from({ length: slotCount }, () => 0);

    events.forEach(event => {
      const time = Date.parse(event.timestamp);
      if (Number.isNaN(time)) {
        return;
      }
      const bucketIndex = Math.floor((time - windowStart.getTime()) / slotMs);
      if (bucketIndex >= 0 && bucketIndex < buckets.length) {
        buckets[bucketIndex] += 1;
      }
    });

    const seriesData = buckets.map((count, index) => {
      const ts = windowStart.getTime() + (index * slotMs);
      // Use 0 for zero values so the line is always visible
      return [ts, count];
    });

    const maxBucketCount = buckets.length ? Math.max(...buckets) : 0;

    return { seriesData, windowStart, windowEnd, referenceDate, officeStart, officeEnd, maxBucketCount };
  }

  function buildMultiSessionActivitySeries(events, useCurrentDay = false, customDate = null) {
  // Use custom date if provided, otherwise use current day if useCurrentDay is true, otherwise use the first event's day
    let referenceDate;
    if (customDate) {
      referenceDate = new Date(customDate);
    } else if (useCurrentDay) {
      referenceDate = new Date();
    } else {
      referenceDate = new Date(events[0].timestamp);
    }
    const eventTimes = events
      .map(event => Date.parse(event.timestamp))
      .filter(time => !Number.isNaN(time));
    const minEventTime = eventTimes.length ? Math.min(...eventTimes) : null;
    const maxEventTime = eventTimes.length ? Math.max(...eventTimes) : null;
    const { start: windowStart, end: windowEnd } = getExtendedWindow(referenceDate, minEventTime, maxEventTime);
    const officeStart = new Date(referenceDate);
    officeStart.setHours(OFFICE_START.hour, OFFICE_START.minute, 0, 0);
    const officeEnd = new Date(referenceDate);
    officeEnd.setHours(OFFICE_END.hour, OFFICE_END.minute, 0, 0);
    const slotMs = SESSION_ACTIVITY_SLOT_MINUTES * 60 * 1000;
    const slotCount = Math.floor((windowEnd.getTime() - windowStart.getTime()) / slotMs) + 1;

    const sessionBuckets = new Map();

    events.forEach(event => {
      const time = Date.parse(event.timestamp);
      if (Number.isNaN(time)) {
        return;
      }
      const sessionId = event.session_id || 'Unknown session';
      if (!sessionBuckets.has(sessionId)) {
        sessionBuckets.set(sessionId, Array.from({ length: slotCount }, () => 0));
      }
      const bucketIndex = Math.floor((time - windowStart.getTime()) / slotMs);
      if (bucketIndex >= 0 && bucketIndex < slotCount) {
        const buckets = sessionBuckets.get(sessionId);
        buckets[bucketIndex] += 1;
      }
    });

    const seriesList = [];
    let maxBucketCount = 0;

    sessionBuckets.forEach((buckets, sessionId) => {
      const seriesData = buckets.map((count, index) => {
        const ts = windowStart.getTime() + (index * slotMs);
        // Use 0 for zero values so the line is always visible
        return [ts, count];
      });
      maxBucketCount = Math.max(maxBucketCount, ...buckets, maxBucketCount);
      seriesList.push({
        sessionId,
        seriesData
      });
    });

    return { seriesList, windowStart, windowEnd, referenceDate, officeStart, officeEnd, maxBucketCount };
  }

  function getExtendedWindow(referenceDate, minEventTime, maxEventTime) {
  // Start with office hours as base (9-18h)
    const officeStart = new Date(referenceDate);
    officeStart.setHours(OFFICE_START.hour, OFFICE_START.minute, 0, 0);
    const officeEnd = new Date(referenceDate);
    officeEnd.setHours(OFFICE_END.hour, OFFICE_END.minute, 0, 0);

    // If we have event times, expand the window to include all events
    // but keep it within the same day as referenceDate
    let start = officeStart;
    let end = officeEnd;

    if (minEventTime !== null && maxEventTime !== null) {
      const minEventDate = new Date(minEventTime);
      const maxEventDate = new Date(maxEventTime);

      // Get the day boundaries for referenceDate
      const refDay = referenceDate.getDate();
      const refMonth = referenceDate.getMonth();
      const refYear = referenceDate.getFullYear();

      // Check if events are on the same day as referenceDate
      const minEventDay = minEventDate.getDate();
      const minEventMonth = minEventDate.getMonth();
      const minEventYear = minEventDate.getFullYear();
      const maxEventDay = maxEventDate.getDate();
      const maxEventMonth = maxEventDate.getMonth();
      const maxEventYear = maxEventDate.getFullYear();

      const isSameDay = (minEventDay === refDay && minEventMonth === refMonth && minEventYear === refYear) ||
			                  (maxEventDay === refDay && maxEventMonth === refMonth && maxEventYear === refYear);

      if (isSameDay) {
      // Adjust start to include earliest event
        const earliestEvent = new Date(minEventDate);
        earliestEvent.setFullYear(refYear, refMonth, refDay);
        if (earliestEvent < start) {
          start = earliestEvent;
          // Round down to the previous slot boundary
          const slotMs = SESSION_ACTIVITY_SLOT_MINUTES * 60 * 1000;
          const remainder = start.getTime() % slotMs;
          if (remainder > 0) {
            start = new Date(start.getTime() - remainder);
          }
        }

        // Adjust end to include latest event
        const latestEvent = new Date(maxEventDate);
        latestEvent.setFullYear(refYear, refMonth, refDay);
        if (latestEvent > end) {
          end = latestEvent;
          // Round up to the next slot boundary
          const slotMs = SESSION_ACTIVITY_SLOT_MINUTES * 60 * 1000;
          const remainder = end.getTime() % slotMs;
          if (remainder > 0) {
            end = new Date(end.getTime() + slotMs - remainder);
          }
        }
      }
    }

    return { start, end };
  }

  function formatChartTimeLabel(dateObj) {
    if (!(dateObj instanceof Date)) {
      return '';
    }
    return `${padNumber(dateObj.getHours())}:${padNumber(dateObj.getMinutes())}`;
  }


  function navigateToPreviousDay() {
    if (!lastSessionActivityEvents || lastSessionActivityEvents.length === 0) {
      return;
    }

    // Get current reference date
    const currentDate = selectedActivityDate || new Date();
    const previousDate = new Date(currentDate);
    previousDate.setDate(previousDate.getDate() - 1);

    selectedActivityDate = previousDate;
    renderSessionActivityChart(lastSessionActivityEvents, { sessionId: selectedSession });
  }


  function navigateToNextDay() {
    if (!lastSessionActivityEvents || lastSessionActivityEvents.length === 0) {
      return;
    }

    // Get current reference date
    const currentDate = selectedActivityDate || new Date();
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);

    // Don't allow navigating to future dates
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (nextDate > today) {
      return;
    }

    selectedActivityDate = nextDate;
    renderSessionActivityChart(lastSessionActivityEvents, { sessionId: selectedSession });
  }

  function updateDateNavigationButtons(referenceDate) {
    const prevBtn = document.getElementById('prevDayBtn');
    const nextBtn = document.getElementById('nextDayBtn');

    if (!prevBtn || !nextBtn) return;

    // Disable next button if we're at today
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const refDate = new Date(referenceDate);
    refDate.setHours(23, 59, 59, 999);

    nextBtn.disabled = refDate >= today;

    // Previous button is always enabled (we can go back as far as we want)
    prevBtn.disabled = false;
  }

  function formatHumanDate(dateObj) {
    if (!(dateObj instanceof Date)) {
      return '';
    }
    const day = padNumber(dateObj.getDate());
    const month = padNumber(dateObj.getMonth() + 1);
    const year = dateObj.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function getRelativeDateLabel(dateObj) {
    if (!(dateObj instanceof Date)) {
      return '';
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateToCheck = new Date(dateObj);
    dateToCheck.setHours(0, 0, 0, 0);

    if (dateToCheck.getTime() === today.getTime()) {
      return 'today';
    } else if (dateToCheck.getTime() === yesterday.getTime()) {
      return 'yesterday';
    } else {
      return formatHumanDate(dateObj);
    }
  }

  function padNumber(value) {
    return String(value).padStart(2, '0');
  }

  function showGlobalError(message) {
    const banner = document.getElementById('globalErrorBanner');
    if (!banner || !message) {
      return;
    }
    const formattedMessage = typeof message === 'string'
      ? message
      : (message?.message || 'Unexpected error');
    globalErrorMessages.unshift(formattedMessage);
    if (globalErrorMessages.length > MAX_GLOBAL_ERROR_MESSAGES) {
      globalErrorMessages.length = MAX_GLOBAL_ERROR_MESSAGES;
    }
    banner.innerHTML = globalErrorMessages
      .map(msg => `<div>${escapeHtml(msg)}</div>`)
      .join('');
    banner.classList.remove('hidden');
  }

  function handleInitializationError(context, error) {
    const details = error?.message || error || 'Unknown error';
    console.error(`Initialization error (${context}):`, error);
    showGlobalError(`Initialization error (${context}): ${details}`);
  }

  function runSafeInitStep(label, fn) {
    try {
      if (typeof fn === 'function') {
        fn();
      }
    } catch (error) {
      handleInitializationError(label, error);
    }
  }

  function runSafeAsyncInitStep(label, fn) {
    try {
      const result = typeof fn === 'function' ? fn() : null;
      if (result && typeof result.catch === 'function') {
        result.catch(error => handleInitializationError(label, error));
      }
    } catch (error) {
      handleInitializationError(label, error);
    }
  }

  function createSingleSessionSeriesOption(seriesData, warmOffset) {
    return {
      name: 'Events',
      type: 'line',
      smooth: 0.55,
      smoothMonotone: 'x', // prevent bezier overshoot while keeping curvature
      showSymbol: false,
      connectNulls: true, // Connect valid points even if there are null values between them
      lineStyle: { width: 3, color: hexToRgba('#53cf98', 0.5) }, // More transparent line
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(133,230,185,0.45)' },
          { offset: warmOffset, color: 'rgba(197,241,221,0.35)' },
          { offset: 1, color: 'rgba(216,247,232,0.16)' }
        ])
      },
      data: seriesData
    };
  }

  function createMultiSessionSeriesOption(sessionId, seriesData, color) {
    const startColor = hexToRgba(color, 0.35);
    const endColor = hexToRgba(color, 0.05);
    return {
      name: formatSessionLabel(sessionId),
      type: 'line',
      smooth: 0.65,
      smoothMonotone: 'x',
      showSymbol: false,
      connectNulls: true, // Connect valid points even if there are null values between them
      lineStyle: { width: 2.5, color: hexToRgba(color, 0.5) }, // More transparent line
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: startColor },
          { offset: 1, color: endColor }
        ])
      },
      data: seriesData
    };
  }

  function hexToRgba(hex, alpha = 1) {
    if (typeof hex !== 'string') {
      return `rgba(83, 207, 152, ${alpha})`;
    }
    let sanitized = hex.replace('#', '');
    if (sanitized.length === 3) {
      sanitized = sanitized.split('').map(ch => ch + ch).join('');
    }
    const bigint = parseInt(sanitized, 16);
    if (Number.isNaN(bigint)) {
      return `rgba(83, 207, 152, ${alpha})`;
    }
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function formatSessionLabel(sessionId) {
    if (!sessionId) {
      return 'Unknown session';
    }
    const storedLabel = sessionDisplayMap.get(sessionId);
    if (storedLabel) {
      return storedLabel;
    }
    if (sessionId.length <= 22) {
      return sessionId;
    }
    return `${sessionId.slice(0, 10)}…${sessionId.slice(-6)}`;
  }

  function formatSessionDisplay(session) {
    const fallbackId = session?.session_id || 'Unknown session';
    const fallbackShort = fallbackId.length > 12 ? `${fallbackId.substring(0, 12)}...` : fallbackId;
    const fallbackHtml = `<span class="session-date">${escapeHtml(fallbackShort)}</span>`;

    if (!session || !session.first_event) {
      return { html: fallbackHtml, text: fallbackShort };
    }

    const parsedDate = new Date(session.first_event);
    if (Number.isNaN(parsedDate.getTime())) {
      return { html: fallbackHtml, text: fallbackShort };
    }

    const day = parsedDate.getDate();
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const month = monthNames[parsedDate.getMonth()];
    const hours = parsedDate.getHours();
    const minutes = String(parsedDate.getMinutes()).padStart(2, '0');
    const dateStr = `${day} ${month} ${hours}:${minutes}`;
    const dateHtml = `<span class="session-date">${escapeHtml(dateStr)}</span>`;

    let userText = '';
    if (session.user_name) {
      userText = session.user_name;
    } else if (session.user_id) {
      userText = session.user_id;
    }

    if (!userText) {
      return { html: dateHtml, text: dateStr };
    }

    const separatorHtml = '<span class="session-separator"><i class="fa-solid fa-circle"></i></span>';
    const userHtml = `<span class="session-user">${escapeHtml(userText)}</span>`;
    return { html: `${dateHtml}${separatorHtml}${userHtml}`, text: `${dateStr} • ${userText}` };
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderSessionActivityLegend(seriesEntries, isAllSessionsView = false) {
    const legendEl = document.getElementById('sessionActivityLegend');
    const legendWrapper = document.querySelector('.session-activity-legend-wrapper');
    if (!legendEl || !legendWrapper) {
      return;
    }

    legendEl.innerHTML = '';

    // Always keep the wrapper in the layout to prevent height changes
    legendWrapper.style.display = 'flex';

    // Show legend button only for "All sessions" view and if there are more than one series
    const hasMultipleSeries = Array.isArray(seriesEntries) && seriesEntries.length > 1;
    if (isAllSessionsView && hasMultipleSeries) {
    // Show legend button with opacity transition
      legendWrapper.classList.remove('hidden');
      // Show legend for series with data
      seriesEntries.forEach(entry => {
        const safeName = escapeHtml(entry.name);
        const item = document.createElement('span');
        item.className = 'legend-item';
        item.innerHTML = `
					<span class="legend-dot" style="background: ${entry.color};"></span>
					<span>${safeName}</span>
				`;
        legendEl.appendChild(item);
      });
    } else {
    // Hide the legend button with opacity transition
      legendWrapper.classList.add('hidden');
    }
  }

  function refreshSessionActivityTheme() {
    if (lastSessionActivityEvents.length > 0) {
      renderSessionActivityChart(lastSessionActivityEvents);
    } else if (sessionActivityChart) {
      sessionActivityChart.resize();
    }
  }

  async function loadEventTypeStats(sessionId = null) {
    try {
      const params = new URLSearchParams();
      if (sessionId && sessionId !== 'all') {
        params.append('sessionId', sessionId);
      }
      // Apply user filters
      // If users haven't been loaded yet (allUserIds.size === 0), don't filter (show all)
      // If no users are selected after loading, send a special marker to return no stats
      // If all users are selected, don't filter (show all)
      // If some users are selected, filter by those users
      if (allUserIds.size === 0) {
      // Users not loaded yet - don't filter (show all stats)
      // Don't add any userId param
      } else if (selectedUserIds.size === 0) {
      // No users selected - send special marker to return no stats
        params.append('userId', '__none__');
      } else if (selectedUserIds.size > 0 && selectedUserIds.size < allUserIds.size) {
      // Some users selected - filter by those users
        Array.from(selectedUserIds).forEach(userId => {
          params.append('userId', userId);
        });
      }
      // If all users are selected (selectedUserIds.size === allUserIds.size), don't add any userId param
      const queryString = params.toString();
      const url = queryString ? `/api/event-types?${queryString}` : '/api/event-types';
      const response = await fetch(url, {
        credentials: 'include' // Ensure cookies are sent
      });
      const validResponse = await handleApiResponse(response);
      if (!validResponse) return;
      const stats = await validResponse.json();

      stats.forEach(stat => {
        const countEl = document.getElementById(`count-${stat.event}`);
        if (countEl) {
          countEl.textContent = stat.count || 0;
        }
      });

      // Update total size
      const total = stats.reduce((sum, stat) => sum + (stat.count || 0), 0);
      const totalSizeEl = document.getElementById('totalSize');
      if (totalSizeEl) {
        totalSizeEl.textContent = total;
      }
    } catch (error) {
      console.error('Error loading event type stats:', error);
    }
  }

  async function loadSessions() {
    try {
      const params = new URLSearchParams();
      // Apply user filters
      // If users haven't been loaded yet (allUserIds.size === 0), don't filter (show all)
      // If no users are selected after loading, send a special marker to return no sessions
      // If all users are selected, don't filter (show all)
      // If some users are selected, filter by those users
      if (allUserIds.size === 0) {
      // Users not loaded yet - don't filter (show all sessions)
      // Don't add any userId param
      } else if (selectedUserIds.size === 0) {
      // No users selected - send special marker to return no sessions
        params.append('userId', '__none__');
      } else if (selectedUserIds.size > 0 && selectedUserIds.size < allUserIds.size) {
      // Some users selected - filter by those users
        Array.from(selectedUserIds).forEach(userId => {
          params.append('userId', userId);
        });
      }
      // If all users are selected (selectedUserIds.size === allUserIds.size), don't add any userId param
      const queryString = params.toString();
      const url = queryString ? `/api/sessions?${queryString}` : '/api/sessions';
      const response = await fetch(url, {
        credentials: 'include' // Ensure cookies are sent
      });
      const validResponse = await handleApiResponse(response);
      if (!validResponse) return;
      const sessions = await validResponse.json();
      const sessionList = document.getElementById('sessionList');

      if (!sessionList) {
        console.error('sessionList element not found');
        return;
      }

      // Clear the scrollable list (All Sessions is now separate)
      sessionList.innerHTML = '';

      // Reset keyboard navigation for sessions when sessions are reloaded
      if (keyboardNavigationMode === 'sessions') {
        selectedSessionIndex = -1;
      }

      // Add each session
      if (Array.isArray(sessions) && sessions.length > 0) {
        const discoveredSessionIds = [];
        sessions.forEach(session => {
          if (!session || !session.session_id) {
            console.warn('Invalid session data:', session);
            return;
          }
          discoveredSessionIds.push(session.session_id);

          const li = document.createElement('li');
          li.className = 'session-item';
          li.setAttribute('data-session', session.session_id);
          if (session.is_active) {
            li.setAttribute('data-active', 'true');
          }

          // Format session display: date and user
          const { html: sessionDisplayHtml, text: sessionLabelText } = formatSessionDisplay(session);
          sessionDisplayMap.set(session.session_id, sessionLabelText);

          const isSelected = selectedSessionsForDeletion.has(session.session_id);
          // Always render checkbox to prevent label shift, but control visibility with 'show' class
          // Don't add 'show' class initially - it will be added via toggleSelectionMode for smooth transition
          // Security: Use escapeHtml for session_id to prevent XSS in HTML attributes and IDs
          const escapedSessionId = escapeHtml(session.session_id);
          const checkboxHtml = `<input type="checkbox" class="session-checkbox" id="session-checkbox-${escapedSessionId}" ${isSelected ? 'checked' : ''}>`;
          li.innerHTML = `
						<div class="session-item-left">
							${checkboxHtml}
							<span class="session-name text-sm">${sessionDisplayHtml}</span>
						</div>
						<div class="session-item-right">
							<span class="session-size text-xs">${session.count || 0}</span>
							<div class="session-item-actions">
								<button class="actions-btn" data-session-id="${escapedSessionId}">
									<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
										<circle cx="8" cy="3" r="1.5"/>
										<circle cx="8" cy="8" r="1.5"/>
										<circle cx="8" cy="13" r="1.5"/>
									</svg>
								</button>
								<div class="actions-dropdown" id="session-dropdown-${escapedSessionId}">
									<div class="actions-dropdown-item delete" data-session-id="${escapedSessionId}">
										<span>Delete</span>
									</div>
								</div>
							</div>
						</div>
					`;

          // Add event listeners for checkbox and actions (safer than inline onclick with XSS protection)
          const checkbox = li.querySelector('.session-checkbox');
          if (checkbox) {
            checkbox.addEventListener('click', (event) => {
              event.stopPropagation();
              toggleSessionSelection(session.session_id, event);
            });
          }

          const actionsBtn = li.querySelector('.actions-btn');
          if (actionsBtn) {
            actionsBtn.addEventListener('click', (event) => {
              event.stopPropagation();
              toggleSessionActionsDropdown(event, session.session_id);
            });
          }

          const deleteBtn = li.querySelector('.actions-dropdown-item.delete');
          if (deleteBtn) {
            deleteBtn.addEventListener('click', (event) => {
              event.stopPropagation();
              confirmDeleteSession(session.session_id);
            });
          }

          li.addEventListener('click', (e) => {
          // Don't activate session if clicking on actions button or checkbox
            if (e.target.closest('.session-item-actions') || e.target.closest('.session-checkbox')) {
              return;
            }
            // Cancel hover preview when clicking
            if (isHoverPreviewActive) {
              hoverPreviewState = null;
              isHoverPreviewActive = false;
            }
            // If in selection mode, toggle selection for deletion instead of viewing
            if (selectionMode) {
              toggleSessionSelection(session.session_id, e);
              return;
            }
            // If Ctrl/Cmd is pressed and not in selection mode, enter selection mode and select this session
            if ((e.ctrlKey || e.metaKey) && !selectionMode) {
              toggleSelectionMode();
              // Small delay to ensure selection mode is active
              setTimeout(() => {
                toggleSessionSelection(session.session_id, e);
              }, 0);
              return;
            }
            // Avoid flickering if clicking on the same session that's already selected
            if (selectedSession === session.session_id && li.classList.contains('active')) {
              return;
            }
            document.querySelectorAll('.session-item').forEach(i => i.classList.remove('active'));
            li.classList.add('active');
            selectedSession = session.session_id;
            // Pin activity chart to this session's day (prefer last event, fall back to first)
            const sessionDay = session.last_event || session.first_event || null;
            const parsedSessionDate = sessionDay ? new Date(sessionDay) : null;
            selectedActivityDate = parsedSessionDate && !Number.isNaN(parsedSessionDate.getTime())
              ? parsedSessionDate
              : null;
            // Always default to DESC order (newest first)
            sortOrder = 'DESC';
            // Update sort icon
            const sortIconEl = document.getElementById('sortIcon');
            if (sortIconEl) {
              if (sortOrder === 'DESC') {
                sortIconEl.src = '/resources/sort-desc';
                sortIconEl.alt = 'Sort descending';
              } else {
                sortIconEl.src = '/resources/sort-asc';
                sortIconEl.alt = 'Sort ascending';
              }
            }
            currentOffset = 0;
            loadEvents();
            loadEventTypeStats(selectedSession);
          });

          // Add hover preview functionality
          li.addEventListener('mouseenter', (e) => {
          // Don't preview if hovering over actions button
            if (e.target.closest('.session-item-actions')) {
              return;
            }
            handleSessionHover(session.session_id, session);
          });

          li.addEventListener('mouseleave', (e) => {
          // Don't restore if mouse is moving to actions button
            if (e.relatedTarget && e.relatedTarget.closest('.session-item-actions')) {
              return;
            }
            // Don't restore if mouse is still within the sessions area (sidebar-content)
            // This includes gaps between buttons
            if (e.relatedTarget && (
              e.relatedTarget.closest('.sidebar-content') ||
							e.relatedTarget.closest('.all-sessions-container') ||
							e.relatedTarget.closest('#sessionList') ||
							e.relatedTarget.closest('.session-list') ||
							e.relatedTarget.closest('.session-item')
            )) {
              return;
            }
            // Only restore if not clicking (click will handle it) and cursor left sessions area
            if (isHoverPreviewActive) {
              restoreChartState();
            }
          });

          sessionList.appendChild(li);
        });

        rememberSessionsFromList(discoveredSessionIds);

        // Restore selected session if it still exists
        if (selectedSession && selectedSession !== 'all') {
          const selectedSessionElement = document.querySelector(`.session-item[data-session="${selectedSession}"]`);
          if (selectedSessionElement) {
          // Remove active class from all sessions first
            document.querySelectorAll('.session-item').forEach(i => i.classList.remove('active'));
            // Add active class to the previously selected session
            selectedSessionElement.classList.add('active');
          }
        } else if (selectedSession === 'all') {
        // Restore "All Sessions" selection
          const allSessionsElement = document.querySelector('.session-item[data-session="all"]');
          if (allSessionsElement) {
            document.querySelectorAll('.session-item').forEach(i => i.classList.remove('active'));
            allSessionsElement.classList.add('active');
          }
        }

        // Update total size
        const total = sessions.reduce((sum, session) => sum + (session.count || 0), 0);
        const totalSizeEl = document.getElementById('totalSize');
        if (totalSizeEl) {
          totalSizeEl.textContent = total;
        }

        // Update delete selected button
        updateDeleteSelectedButton();
      } else {
      // Update total size to 0 if no sessions
        const totalSizeEl = document.getElementById('totalSize');
        if (totalSizeEl) {
          totalSizeEl.textContent = '0';
        }
        // Update delete selected button
        updateDeleteSelectedButton();
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    // Show error in console but don't break the UI
    }
  }

  function formatUserDisplay(user) {
    const fallbackId = user?.user_id || 'Unknown user';
    const fallbackShort = fallbackId.length > 20 ? `${fallbackId.substring(0, 20)}...` : fallbackId;
    const fallbackHtml = `<span class="session-date">${escapeHtml(fallbackShort)}</span>`;

    if (!user || !user.last_event) {
      return { html: fallbackHtml, text: fallbackShort };
    }

    const parsedDate = new Date(user.last_event);
    if (Number.isNaN(parsedDate.getTime())) {
      return { html: fallbackHtml, text: fallbackShort };
    }

    const day = parsedDate.getDate();
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const month = monthNames[parsedDate.getMonth()];
    const hours = parsedDate.getHours();
    const minutes = String(parsedDate.getMinutes()).padStart(2, '0');
    const dateStr = `${day} ${month} ${hours}:${minutes}`;
    const dateHtml = `<span class="session-date">${escapeHtml(dateStr)}</span>`;

    let userText = '';
    if (user.user_name) {
      userText = user.user_name;
    } else if (user.user_id) {
      userText = user.user_id;
    }

    if (!userText) {
      return { html: dateHtml, text: dateStr };
    }

    const userHtml = `<span class="session-user">${escapeHtml(userText)}</span>`;
    return { html: `${userHtml} <span class="session-date">${escapeHtml(dateStr)}</span>`, text: `${userText} • ${dateStr}` };
  }

  async function loadUsersList() {
    try {
      const response = await fetch('/api/telemetry-users', {
        credentials: 'include'
      });
      const validResponse = await handleApiResponse(response);
      if (!validResponse) return;
      const data = await validResponse.json();

      // Check if response is an error object
      if (data && data.status === 'error') {
        console.error('Error loading users:', data.message);
        return;
      }

      const userList = document.getElementById('userList');
      if (!userList) {
        console.error('userList element not found');
        return;
      }

      // Clear the list
      userList.innerHTML = '';

      // Normalize API response to consistent objects { id, label, count, last_event }
      const normalizedUsers = (Array.isArray(data) ? data : [])
        .map(entry => {
          if (entry && typeof entry === 'object') {
            const rawId = typeof entry.id === 'string' ? entry.id : (typeof entry.user_id === 'string' ? entry.user_id : '');
            const trimmedId = rawId.trim();
            if (!trimmedId) {
              return null;
            }
            const label = typeof entry.label === 'string' && entry.label.trim() !== ''
              ? entry.label.trim()
              : trimmedId;
            const count = Number.isFinite(entry.eventCount)
              ? Number(entry.eventCount)
              : (Number.isFinite(entry.count) ? Number(entry.count) : 0);
            const lastEvent = entry.lastEvent || entry.last_event || null;
            const userName = entry.user_name || label;
            return { id: trimmedId, label, count, last_event: lastEvent, user_name: userName };
          }
          if (typeof entry === 'string') {
            const trimmedValue = entry.trim();
            return trimmedValue
              ? { id: trimmedValue, label: trimmedValue, count: 0, last_event: null, user_name: trimmedValue }
              : null;
          }
          return null;
        })
        .filter(Boolean)
        .reduce((acc, user) => {
          if (!acc.seen.has(user.id)) {
            acc.seen.add(user.id);
            acc.values.push(user);
          }
          return acc;
        }, { seen: new Set(), values: [] }).values;

      if (normalizedUsers.length === 0) {
        return;
      }

      // Sort users by last activity (most recent first)
      const usersWithStats = normalizedUsers.map(user => {
        return {
          user_id: user.id,
          label: user.label,
          count: user.count || 0,
          last_event: user.last_event || null,
          user_name: user.user_name || user.label
        };
      }).sort((a, b) => {
      // Sort by last_event DESC, users without events go to the end
        if (!a.last_event && !b.last_event) return 0;
        if (!a.last_event) return 1;
        if (!b.last_event) return -1;
        const dateA = new Date(a.last_event);
        const dateB = new Date(b.last_event);
        return dateB - dateA;
      });

      // Add each user to the list
      usersWithStats.forEach(user => {
        const li = document.createElement('li');
        li.className = 'session-item';
        li.setAttribute('data-user', user.user_id);

        const { html: userDisplayHtml } = formatUserDisplay({
          user_id: user.user_id,
          user_name: user.user_name || user.label,
          last_event: user.last_event,
          count: user.count
        });

        li.innerHTML = `
					<div class="session-item-left">
						<span class="session-name text-sm">${userDisplayHtml}</span>
					</div>
					<div class="session-item-right">
						<span class="session-size text-xs">${user.count || 0}</span>
					</div>
				`;

        li.addEventListener('click', (_e) => {
        // Avoid flickering if clicking on the same user that's already selected
          if (selectedUserIds.has(user.user_id) && selectedUserIds.size === 1) {
            return;
          }
          // Select only this user
          selectedUserIds.clear();
          selectedUserIds.add(user.user_id);
          // Update UI to reflect selection
          document.querySelectorAll('.session-item[data-user]').forEach(i => i.classList.remove('active'));
          li.classList.add('active');
          // Switch to sessions tab and reload
          switchTab('sessions');
          loadSessions();
          loadEvents();
          loadEventTypeStats(selectedSession);
        });

        userList.appendChild(li);
      });
    } catch (error) {
      console.error('Error loading users list:', error);
    }
  }

  async function loadTeamsList() {
    try {
      const teamList = document.getElementById('teamList');
      if (!teamList) {
        console.error('teamList element not found');
        return;
      }

      let teams = [];
      let aggregatedTeams = [];

      try {
        const statsResponse = await fetch('/api/team-stats', { credentials: 'include' });
        const validStatsResponse = await handleApiResponse(statsResponse);
        if (validStatsResponse) {
          const statsData = await validStatsResponse.json();
          if (statsData && Array.isArray(statsData.teams)) {
            aggregatedTeams = statsData.teams;
          }
        }
      } catch (error) {
        console.warn('Error fetching aggregated team stats:', error);
      }

      if (aggregatedTeams.length > 0) {
        teamEventCountsSource = 'server';
        teamEventCounts = new Map();
        orgToTeamMap = new Map();

        teams = aggregatedTeams.map(team => {
          const key = (team.key || team.teamName || '').trim().toLowerCase();
          const activeCount = Number(team.activeCount) || 0;
          const inactiveCount = Number(team.inactiveCount) || 0;
          const totalMappings = Number.isFinite(team.totalMappings)
            ? Number(team.totalMappings)
            : activeCount + inactiveCount;

          if (key) {
            const safeCount = Number(team.eventCount) || 0;
            teamEventCounts.set(key, safeCount);
            if (Array.isArray(team.orgs)) {
              team.orgs.forEach(org => {
                const normalizedOrg = normalizeOrgIdentifier(org);
                if (normalizedOrg) {
                  orgToTeamMap.set(normalizedOrg, key);
                }
              });
            }
          }

          return {
            key,
            teamName: team.teamName || team.label || key || 'Unnamed team',
            color: (team.color || '').trim(),
            clients: Array.isArray(team.clients) ? team.clients : [],
            orgs: Array.isArray(team.orgs) ? team.orgs : [],
            activeCount,
            inactiveCount,
            totalMappings,
            eventCount: Number(team.eventCount) || 0
          };
        }).filter(team => team.key).sort((a, b) => a.teamName.localeCompare(b.teamName));
      } else {
        const mappings = await getOrgTeamMappings();
        const teamsMap = new Map();
        orgToTeamMap = new Map();
        teamEventCountsSource = 'local';

        // Ensure mappings is an array before iterating
        if (!Array.isArray(mappings)) {
          console.error('Expected mappings to be an array, but got:', typeof mappings, mappings);
          return;
        }

        mappings.forEach((mapping) => {
          const rawName = (mapping?.teamName || '').trim();
          if (!rawName) {
            return;
          }
          const key = rawName.toLowerCase();
          if (!teamsMap.has(key)) {
            teamsMap.set(key, {
              teamName: rawName,
              color: mapping?.color?.trim() || '',
              clients: new Set(),
              orgs: new Set(),
              activeCount: 0,
              inactiveCount: 0
            });
          }
          const entry = teamsMap.get(key);
          const client = (mapping?.clientName || '').trim();
          const org = (mapping?.orgIdentifier || '').trim();
          if (client) {
            entry.clients.add(client);
          }
          if (org) {
            const normalizedOrg = normalizeOrgIdentifier(org);
            if (normalizedOrg) {
              entry.orgs.add(org);
              orgToTeamMap.set(normalizedOrg, key);
            }
          }
          if (entry.color === '' && mapping?.color) {
            entry.color = mapping.color.trim();
          }
          if (mapping?.active === false) {
            entry.inactiveCount += 1;
          } else {
            entry.activeCount += 1;
          }
        });

        teams = Array.from(teamsMap.entries())
          .map(([key, team]) => ({
            key,
            ...team,
            clients: Array.from(team.clients),
            orgs: Array.from(team.orgs),
            totalMappings: team.activeCount + team.inactiveCount,
            eventCount: teamEventCounts.get(key) || 0
          }))
          .sort((a, b) => a.teamName.localeCompare(b.teamName));
      }

      teamList.innerHTML = '';

      if (teams.length === 0) {
        selectedTeamKey = null;
        teamList.innerHTML = `
				<li class="session-item">
					<div class="session-item-left">
						<span class="session-name text-sm">No teams configured</span>
						<span class="session-date text-xs">Add mappings in Settings → Events → Manage teams</span>
					</div>
					<div class="session-item-right">
						<button type="button" class="confirm-modal-btn" style="padding: 4px 8px;" onclick="openOrgTeamMappingModal()">
							Manage teams
						</button>
					</div>
				</li>
			`;
        return;
      }

      teams.forEach((team) => {
        const li = document.createElement('li');
        li.className = 'session-item';
        li.dataset.teamKey = team.key;
        const color = team.color || 'var(--bg-secondary)';
        const clientsLabel = team.clients.length
          ? `Clients: ${escapeHtml(team.clients.slice(0, 2).join(', '))}${team.clients.length > 2 ? '…' : ''}`
          : 'No clients defined';
        const mappingLabel = `${team.totalMappings} mapping${team.totalMappings === 1 ? '' : 's'}`;
        const statusLabel = team.inactiveCount > 0
          ? `${team.activeCount} active · ${team.inactiveCount} inactive`
          : `${team.activeCount} active`;
        const eventCount = team.eventCount || 0;

        li.innerHTML = `
				<div class="session-item-left">
					<div style="width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; margin-right: 10px; color: ${color}; border-radius: 50%; background: #f3f3f3;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="width: 24px; height: 24px;">
              <path d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
					</div>
					<div style="display: flex; flex-direction: column; gap: 2px;">
						<span class="session-name text-sm" style="font-weight: 600;">${escapeHtml(team.teamName)}</span>
						<span class="session-date text-xs">${clientsLabel}</span>
					</div>
				</div>
				<div class="session-item-right" style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
					<span class="session-size text-xs"><span class="team-event-count">${eventCount}</span> events</span>
					<span class="session-size text-xs">${mappingLabel}</span>
					<span class="session-date text-[11px]">${escapeHtml(statusLabel)}</span>
				</div>
			`;

        li.addEventListener('click', () => {
          const isSelectingSame = selectedTeamKey === team.key;
          selectedTeamKey = isSelectingSame ? null : team.key;
          document.querySelectorAll('#teamList .session-item').forEach((item) => {
            item.classList.toggle('active', item.dataset.teamKey === selectedTeamKey);
          });
          switchTab('teams');
          currentOffset = 0;
          loadEvents();
        });

        teamList.appendChild(li);
      });
      // Refresh counts in case events already loaded
      updateTeamEventCounts(allLoadedEvents);
    } catch (error) {
      console.error('Error loading teams list:', error);
    }
  }

  function updateTeamEventCounts(events = []) {
    if (teamEventCountsSource === 'server') {
      // Use precomputed counters from the backend; just refresh the UI badges
      const teamItemsServer = document.querySelectorAll('#teamList .session-item[data-team-key]');
      teamItemsServer.forEach((item) => {
        const key = item.dataset.teamKey;
        const count = teamEventCounts.get(key) || 0;
        const badge = item.querySelector('.team-event-count');
        if (badge) {
          badge.textContent = count;
        }
        item.classList.toggle('active', selectedTeamKey === key);
      });
      return;
    }

    const counts = new Map();
    events.forEach((event) => {
      const teamKey = getTeamKeyForEvent(event);
      if (!teamKey) return;
      const current = counts.get(teamKey) || 0;
      counts.set(teamKey, current + 1);
    });
    teamEventCounts = counts;

    const teamItems = document.querySelectorAll('#teamList .session-item[data-team-key]');
    teamItems.forEach((item) => {
      const key = item.dataset.teamKey;
      const count = teamEventCounts.get(key) || 0;
      const badge = item.querySelector('.team-event-count');
      if (badge) {
        badge.textContent = count;
      }
      item.classList.toggle('active', selectedTeamKey === key);
    });
  }

  function updateTabIndicator() {
    const indicator = document.getElementById('tabIndicator');
    if (!indicator) return;

    const activeTabBtn = document.querySelector('.tab-btn.active');
    if (!activeTabBtn) return;

    const tabsContainer = activeTabBtn.closest('.tabs-container');
    if (!tabsContainer) return;

    const containerRect = tabsContainer.getBoundingClientRect();
    const activeTabRect = activeTabBtn.getBoundingClientRect();

    indicator.style.left = `${activeTabRect.left - containerRect.left}px`;
    indicator.style.width = `${activeTabBtn.offsetWidth}px`;
  }

  function switchTab(tab) {
    if (tab === activeTab) return;

    activeTab = tab;
    const sessionsTab = document.getElementById('sessionsTab');
    const usersTab = document.getElementById('usersTab');
    const teamsTab = document.getElementById('teamsTab');
    const sessionsContainer = document.getElementById('sessionsContainer');
    const sessionList = document.getElementById('sessionList');
    const userList = document.getElementById('userList');
    const teamList = document.getElementById('teamList');

    // Clear session selection and exit selection mode when switching tabs
    if (tab !== 'sessions') {
      selectedSessionsForDeletion.clear();
      lastSelectedSessionId = null;
      selectionMode = false;
      const toggleBtn = document.getElementById('toggleSelectionModeBtn');
      if (toggleBtn) {
        toggleBtn.innerHTML = '<i class="fa-solid fa-list-check"></i>';
        toggleBtn.classList.remove('active');
      }
      updateDeleteSelectedButton();
    }

    // Clear team selection when leaving Teams tab to avoid stale filters
    if (tab !== 'teams' && selectedTeamKey) {
      selectedTeamKey = null;
      const teamItems = document.querySelectorAll('#teamList .session-item');
      teamItems.forEach((item) => item.classList.remove('active'));
      // Reload events without team filter if we're moving to a tab that shows events
      loadEvents();
    }

    // Update tab buttons
    if (sessionsTab && usersTab && teamsTab) {
      sessionsTab.classList.toggle('active', tab === 'sessions');
      usersTab.classList.toggle('active', tab === 'users');
      teamsTab.classList.toggle('active', tab === 'teams');
    }

    // Update indicator position
    updateTabIndicator();

    // Show/hide containers
    if (sessionsContainer) {
      sessionsContainer.style.display = tab === 'sessions' ? 'block' : 'none';
    }
    if (sessionList) {
      sessionList.style.display = tab === 'sessions' ? 'block' : 'none';
    }
    if (userList) {
      userList.style.display = tab === 'users' ? 'block' : 'none';
    }
    if (teamList) {
      teamList.style.display = tab === 'teams' ? 'block' : 'none';
    }
  }

  async function loadEvents(options = {}) {
    const triggeredByNotification = Boolean(options.triggeredByNotification);
    const append = Boolean(options.append); // If true, append events instead of replacing

    // Prevent multiple simultaneous loads
    if (isLoadingMore && append) {
      return;
    }

    if (append) {
      isLoadingMore = true;
    } else {
      currentOffset = 0;
      hasMoreEvents = true;
      allLoadedEvents = [];
    }

    startTime = performance.now();
    // const loadingMessageEl = document.getElementById('loadingMessage');
    const _logsTableEl = document.getElementById('logsTable');
    const errorMessageEl = document.getElementById('errorMessage');
    const emptyStateEl = document.getElementById('emptyState');

    // if (loadingMessageEl && !append) {
    // 	loadingMessageEl.style.display = 'none';
    // }

    if (errorMessageEl) {
      errorMessageEl.style.display = 'none';
    }
    if (emptyStateEl) {
      emptyStateEl.style.display = 'none';
    }

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: currentOffset.toString(),
        orderBy: 'created_at',
        order: sortOrder
      });

      // Apply level filters
      if (activeFilters.size > 0 && activeFilters.size < 4) {
        Array.from(activeFilters).forEach(level => {
          params.append('eventType', level);
        });
      }

      if (selectedSession !== 'all') {
        params.append('sessionId', selectedSession);
      }

      if (searchQuery) {
        params.append('search', searchQuery);
      }

      // Apply user filters
      // If users haven't been loaded yet (allUserIds.size === 0), don't filter (show all)
      // If no users are selected after loading, send a special marker to return no events
      // If all users are selected, don't filter (show all)
      // If some users are selected, filter by those users
      if (allUserIds.size === 0) {
      // Users not loaded yet - don't filter (show all events)
      // Don't add any userId param
      } else if (selectedUserIds.size === 0) {
      // No users selected - send special marker to return no events
        params.append('userId', '__none__');
      } else if (selectedUserIds.size > 0 && selectedUserIds.size < allUserIds.size) {
      // Some users selected - filter by those users
        Array.from(selectedUserIds).forEach(userId => {
          params.append('userId', userId);
        });
      }
      // If all users are selected (selectedUserIds.size === allUserIds.size), don't add any userId param

      const response = await fetch(`/api/events?${params}`);
      const validResponse = await handleApiResponse(response);
      if (!validResponse) return;
      const data = await validResponse.json();

      // Update last fetch time when fetch is successful
      lastFetchTime = Date.now();
      updateLastUpdatedText();
      if (!lastUpdatedIntervalId) {
        startLastUpdatedInterval();
      }

      const duration = Math.round(performance.now() - startTime);
      document.getElementById('durationInfo').textContent = `${duration}ms`;

      let fetchedEvents = Array.isArray(data.events) ? data.events : [];

      if (selectedTeamKey) {
        fetchedEvents = fetchedEvents.filter(eventMatchesSelectedTeam);
      }

      const hasEventsToShow = fetchedEvents.length > 0;

      if (hasEventsToShow) {
        displayEvents(fetchedEvents, append);
        hasMoreEvents = data.hasMore || false;
        currentOffset += fetchedEvents.length;
        document.getElementById('logsTable').style.display = 'table';
        handleNotificationState(fetchedEvents, triggeredByNotification);
        if (!append) {
          updateSessionActivityChart({ sessionId: selectedSession });
        }
      } else {
        hasMoreEvents = false;
        if (!append) {
          const emptyStateEl = document.getElementById('emptyState');
          if (emptyStateEl) {
            emptyStateEl.style.display = 'block';
          }
          hideSessionActivityCard();
          const tbody = document.getElementById('logsBody');
          if (tbody) {
            tbody.innerHTML = '';
          }
          allLoadedEvents = [];
          updateTeamEventCounts(allLoadedEvents);
        }
      }
      updateTeamEventCounts(allLoadedEvents);
    } catch (error) {
      console.error('Error loading events:', error);
      document.getElementById('errorMessage').textContent = 'Error loading events: ' + error.message;
      document.getElementById('errorMessage').style.display = 'block';
    } finally {
      isLoadingMore = false;
    // if (loadingMessageEl && !append) {
    // 	loadingMessageEl.style.display = 'none';
    // }
    }
  }

  function normalizeEventData(rawData) {
    if (!rawData) {
      return {};
    }
    if (typeof rawData === 'object') {
      return rawData;
    }
    try {
      return JSON.parse(rawData);
    } catch (_error) {
      return {};
    }
  }

  function extractClientName(eventData) {
    if (!eventData || typeof eventData !== 'object') {
      return '';
    }
    try {
    // New format: data.state.org.companyDetails.Name
      const nestedCompanyName = eventData.state
				&& eventData.state.org
				&& eventData.state.org.companyDetails
				&& typeof eventData.state.org.companyDetails.Name === 'string'
				&& eventData.state.org.companyDetails.Name.trim() !== ''
        ? eventData.state.org.companyDetails.Name.trim()
        : null;

      if (nestedCompanyName) {
        return nestedCompanyName;
      }

      // Legacy format: data.companyDetails.Name
      if (eventData.companyDetails
				&& typeof eventData.companyDetails.Name === 'string'
				&& eventData.companyDetails.Name.trim() !== '') {
        return eventData.companyDetails.Name.trim();
      }
    } catch (_error) {
    // Ignore and fall through to default
    }
    return '';
  }

  function normalizeOrgIdentifier(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  function extractOrgIdentifierFromEvent(event) {
    try {
      const eventData = normalizeEventData(event?.data);
      const candidates = [
        event?.org_id,
        event?.orgId,
        event?.orgIdentifier,
        event?.org_identifier,
        eventData?.org_id,
        eventData?.orgId,
        eventData?.orgIdentifier,
        eventData?.org_identifier,
        eventData?.org?.id,
        eventData?.org?.orgId,
        eventData?.org?.org_id,
        eventData?.org?.identifier,
        eventData?.org?.salesforceOrgId,
        eventData?.state?.org?.id,
        eventData?.state?.org?.orgId,
        eventData?.state?.org?.org_id,
        eventData?.state?.org?.identifier,
        eventData?.state?.org?.salesforceOrgId,
        eventData?.companyDetails?.Id,
        eventData?.state?.org?.companyDetails?.Id,
        eventData?.org?.companyDetails?.Id
      ];
      const found = candidates.find(
        (value) => typeof value === 'string' && value.trim() !== ''
      );
      return found ? found.trim() : '';
    } catch (_error) {
      return '';
    }
  }

  function getTeamKeyForEvent(event) {
    if (!event) return '';
    const orgIdentifier = extractOrgIdentifierFromEvent(event);
    if (!orgIdentifier) return '';
    const mappedKey = orgToTeamMap.get(normalizeOrgIdentifier(orgIdentifier));
    return mappedKey || '';
  }

  function eventMatchesSelectedTeam(event) {
    if (!selectedTeamKey) {
      return true;
    }
    const teamKey = getTeamKeyForEvent(event);
    if (!teamKey) {
      return false;
    }
    return teamKey === selectedTeamKey;
  }

  function extractUserLabelFromEvent(event, eventData) {
    if (!event) {
      return '';
    }

    // Prefer explicit user name fields from event data when available
    if (eventData && typeof eventData === 'object') {
      try {
        const fromData =
					(typeof eventData.userName === 'string' && eventData.userName.trim()) ||
					(typeof eventData.user_name === 'string' && eventData.user_name.trim()) ||
					(eventData.user &&
						typeof eventData.user.name === 'string' &&
						eventData.user.name.trim());

        if (fromData) {
          return String(fromData);
        }
      } catch (_error) {
      // Ignore and fall through to other sources
      }
    }

    // Fallback to user_id from the event itself
    if (event.user_id) {
      return String(event.user_id);
    }

    return '';
  }

  function displayEvents(events, append = false) {
    // Enforce team filter just before rendering to avoid any leakage
    const renderableEvents = selectedTeamKey ? events.filter(eventMatchesSelectedTeam) : events;
    const tbody = document.getElementById('logsBody');

    // Save selected event state before clearing (only if not appending)
    let selectedEventId = null;
    let expandedEventIds = new Set();
    if (!append) {
    // Find the currently selected event (keyboard-selected)
      const selectedRow = tbody.querySelector('tr.keyboard-selected[data-event-id]');
      if (selectedRow) {
        selectedEventId = selectedRow.getAttribute('data-event-id');
      }

      // Find all expanded events
      const expandedRows = tbody.querySelectorAll('tr.log-item-expanded.expanded');
      expandedRows.forEach(row => {
        const expandedId = row.id.replace('expanded-', '');
        if (expandedId) {
          expandedEventIds.add(expandedId);
        }
      });

      tbody.innerHTML = '';
      allLoadedEvents = [];
      // Reset keyboard navigation for events when new events are loaded
      if (keyboardNavigationMode === 'events') {
        selectedEventIndex = -1;
      }
    }

    const showUserColumn = selectedSession === 'all';

    // Toggle header visibility based on current view
    const userHeader = document.querySelector('th.user-column');
    if (userHeader) {
      userHeader.style.display = showUserColumn ? '' : 'none';
    }

    renderableEvents.forEach(event => {
      const levelClass = getLevelClass(event.event);
      const description = formatDescription(event);
      const descriptionPretty = formatDescriptionPretty(event);
      const eventData = normalizeEventData(event.data);
      const clientName = extractClientName(eventData);
      const userLabel = extractUserLabelFromEvent(event, eventData);
      const dataStatus = typeof eventData.status === 'string'
        ? eventData.status.toLowerCase()
        : null;
      const isToolFailure = event.event === 'tool_call' && (
        dataStatus === 'error' ||
				dataStatus === 'failed' ||
				eventData.success === false ||
				Boolean(eventData.error)
      );
      const isError = event.event === 'tool_error' || event.event === 'error' || isToolFailure;
      const statusClass = isError ? 'ko' : 'ok';
      const statusLabel = isError ? 'KO' : 'OK';

      // Extract tool name for tool events (tool_call or tool_error)
      const isToolEvent = event.event === 'tool_call' || event.event === 'tool_error';
      const toolName = isToolEvent && eventData.toolName
        ? escapeHtml(String(eventData.toolName))
        : '';

      // Main row
      const row = document.createElement('tr');
      row.className = `log-item-${levelClass}`;
      row.setAttribute('data-event-id', event.id);
      // Store event data in the row element to avoid API call when copying payload
      row.setAttribute('data-event', JSON.stringify(event));
      const userCellHtml = showUserColumn
        ? `<td class="log-user">${escapeHtml(userLabel)}</td>`
        : '';

      row.innerHTML = `
				<td style="text-align: center; padding: 2px 8px;">
					<button class="expand-btn" type="button" id="expand-btn-${event.id}">
						<i class="fa-solid fa-chevron-right"></i>
					</button>
				</td>
				<td style="text-align: center; padding: 2px 8px;">
					<span class="status-indicator ${statusClass}">${statusLabel}</span>
				</td>
				<td class="log-time">${formatDate(event.timestamp)}</td>
				${userCellHtml}
				<td>
					<span class="level-badge ${levelClass}">
						${event.event.replace('_', ' ')}
					</span>
				</td>
				<td class="log-client">${escapeHtml(clientName)}</td>
				<td class="log-tool-name">${toolName}</td>
				<td class="log-description">${description}</td>
				<td class="actions-cell">
					<button class="actions-btn" onclick="toggleActionsDropdown(event, ${event.id})">
						<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
							<circle cx="8" cy="3" r="1.5"/>
							<circle cx="8" cy="8" r="1.5"/>
							<circle cx="8" cy="13" r="1.5"/>
						</svg>
					</button>
					<div class="actions-dropdown" id="dropdown-${event.id}">
						<div class="actions-dropdown-item" onclick="copyEventPayload(${event.id})">
							<span>Copy payload</span>
						</div>
						<div class="actions-dropdown-item delete" onclick="confirmDeleteEvent(${event.id})">
							<span>Delete</span>
						</div>
					</div>
				</td>
			`;
      const descriptionCell = row.querySelector('.log-description');
      if (descriptionCell) {
        descriptionCell.textContent = description;
        descriptionCell.removeAttribute('title');
      }
      const expandButton = row.querySelector(`#expand-btn-${event.id}`);
      if (expandButton) {
        expandButton.addEventListener('click', (evt) => {
          evt.stopPropagation();
          toggleRowExpand(event.id);
        });
      }

      row.addEventListener('click', (evt) => {
        if (evt.target.closest('.actions-btn') || evt.target.closest('.actions-dropdown')) {
          return;
        }

        toggleRowExpand(event.id);
      });

      tbody.appendChild(row);

      // Expanded row
      const expandedRow = document.createElement('tr');
      expandedRow.className = `log-item-expanded log-item-${levelClass}`;
      expandedRow.id = `expanded-${event.id}`;

      const expandedTd = document.createElement('td');
      expandedTd.colSpan = showUserColumn ? 8 : 7;
      expandedTd.className = 'log-description-expanded';

      const pre = document.createElement('pre');
      pre.className = 'json-pretty';
      pre.textContent = descriptionPretty;

      expandedTd.appendChild(pre);
      expandedRow.appendChild(document.createElement('td')); // Empty first cell
      expandedRow.appendChild(expandedTd);
      tbody.appendChild(expandedRow);
    });

    // Add events to accumulative array
    if (append) {
      allLoadedEvents.push(...renderableEvents);
    } else {
      allLoadedEvents = [...renderableEvents];

      // Restore selected event and expanded state after rendering
      if (selectedEventId) {
        const restoredRow = tbody.querySelector(`tr[data-event-id="${selectedEventId}"]`);
        if (restoredRow && !restoredRow.classList.contains('log-item-expanded')) {
          restoredRow.classList.add('keyboard-selected');
          // Update selectedEventIndex to match the restored row
          const allEventRows = getAllEventRows();
          selectedEventIndex = allEventRows.findIndex(row => row === restoredRow);
          if (selectedEventIndex >= 0) {
            restoredRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      }

      // Restore expanded state for events that were expanded
      expandedEventIds.forEach(eventId => {
        const eventIdNum = parseInt(eventId, 10);
        if (!isNaN(eventIdNum)) {
          const mainRow = tbody.querySelector(`tr[data-event-id="${eventId}"]`);
          const expandedRow = document.getElementById(`expanded-${eventId}`);
          if (mainRow && expandedRow) {
          // Restore expanded state
            expandedRow.classList.add('expanded');
            const expandBtn = document.getElementById(`expand-btn-${eventId}`);
            if (expandBtn) {
              expandBtn.classList.add('expanded');
            }
            mainRow.classList.add('expanded');
          }
        }
      });
    }
  }

  function getLevelClass(eventType) {
    const levelMap = {
      'tool_call': 'debug',
      'session_start': 'info',
      'session_end': 'info',
      'tool_error': 'error',
      'error': 'error',
      'custom': 'warning'
    };
    return levelMap[eventType] || 'info';
  }

  function _getLevelIcon(eventType) {
    const iconMap = {
      'tool_call': '🐛',
      'session_start': 'ℹ️',
      'session_end': 'ℹ️',
      'tool_error': '❌',
      'error': '❌',
      'custom': '⚠️'
    };
    return iconMap[eventType] || 'ℹ️';
  }

  function formatDescription(event) {
  // Reconstruct the full payload as it was received
    const payload = {
      event: event.event,
      timestamp: event.timestamp,
      serverId: event.server_id || null,
      version: event.version || null,
      sessionId: event.session_id || null,
      userId: event.user_id || null,
      data: event.data || {}
    };

    // Remove null values to keep the JSON clean
    Object.keys(payload).forEach(key => {
      if (payload[key] === null) {
        delete payload[key];
      }
    });

    // Return as single line JSON (no indentation)
    return JSON.stringify(payload);
  }

  function formatDescriptionPretty(event) {
  // Reconstruct the full payload as it was received
    const payload = {
      event: event.event,
      timestamp: event.timestamp,
      serverId: event.server_id || null,
      version: event.version || null,
      sessionId: event.session_id || null,
      userId: event.user_id || null,
      data: event.data || {}
    };

    // Remove null values to keep the JSON clean
    Object.keys(payload).forEach(key => {
      if (payload[key] === null) {
        delete payload[key];
      }
    });

    // Return as pretty formatted JSON (with indentation)
    return JSON.stringify(payload, null, 2);
  }

  function toggleRowExpand(eventId) {
    const expandedRow = document.getElementById(`expanded-${eventId}`);
    const mainRow = document.querySelector(`tr[data-event-id="${eventId}"]`);
    const expandBtn = document.getElementById(`expand-btn-${eventId}`);

    if (expandedRow.classList.contains('expanded')) {
    // Collapse
      expandedRow.classList.remove('expanded');
      expandBtn.classList.remove('expanded');
      mainRow.classList.remove('expanded');
    } else {
    // Expand
      expandedRow.classList.add('expanded');
      expandBtn.classList.add('expanded');
      mainRow.classList.add('expanded');
    }
  }

  function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear().toString().slice(-2);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }

  function _formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  // Infinite scroll handler
  function handleScroll() {
    const scrollContainer = document.getElementById('logsTableScroll');
    if (!scrollContainer || isLoadingMore || !hasMoreEvents) {
      return;
    }

    // Check if user is near the bottom (within 200px)
    const scrollTop = scrollContainer.scrollTop;
    const scrollHeight = scrollContainer.scrollHeight;
    const clientHeight = scrollContainer.clientHeight;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    if (distanceFromBottom < 200) {
      loadEvents({ append: true });
    }
  }


  async function refreshLogs(event) {
    if (isRefreshInProgress) {
      return;
    }
    isRefreshInProgress = true;
    if (event?.preventDefault) {
      event.preventDefault();
    }
    // Rotate refresh icon even when triggered automatically
    const button = event?.target?.closest('.icon-btn') || event?.currentTarget || document.getElementById('refreshButton');
    const refreshIcon = button?.querySelector('.fa-refresh, .refresh-icon') ||
      document.querySelector('#refreshButton .fa-refresh, #refreshButton .refresh-icon');
    if (refreshIcon) {
      refreshIcon.classList.add('rotating');
    }
    currentOffset = 0;

    try {
    // Esperem a que es completin totes les càrregues relacionades amb el refresc.
      await Promise.all([
        loadEventTypeStats(selectedSession),
        loadSessions(),
        loadEvents()
      ]);
    } catch (error) {
    // Les funcions internes ja gestionen i mostren errors (inclòs timeout);
    // mantenim aquest catch per assegurar-nos que la rotació sempre s'atura.
      console.error('Error refreshing logs:', error);
    } finally {
      if (refreshIcon) {
        refreshIcon.classList.remove('rotating');
      }
      isRefreshInProgress = false;
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
      const validResponse = await handleApiResponse(response);
      if (!validResponse) return;

      const data = await validResponse.json();
      alert(`Successfully deleted ${data.deletedCount || 0} events.`);

      // Reset confirmation flag
      deleteAllConfirmed = false;

      // Refresh the view
      currentOffset = 0;
      loadEventTypeStats(selectedSession);
      loadSessions();
      loadEvents();
    } catch (error) {
      console.error('Error deleting events:', error);
      alert('Error deleting events: ' + error.message);
      deleteAllConfirmed = false;
    }
  }


  function toggleNotificationMode() {
    if (notificationModeEnabled) {
      disableNotificationMode();
    } else {
      enableNotificationMode();
    }
  }

  async function enableNotificationMode() {
    if (!('Notification' in window)) {
      alert('Your browser does not support desktop notifications.');
      return;
    }

    let permission = Notification.permission;
    if (permission === 'default') {
      try {
        permission = await Notification.requestPermission();
      } catch (error) {
        console.error('Notification permission error:', error);
        permission = 'denied';
      }
    }

    if (permission !== 'granted') {
      alert('You must allow browser notifications to enable this mode.');
      return;
    }

    notificationModeEnabled = true;
    updateNotificationButtonState(true);
    scheduleNotificationRefresh();
  }

  function disableNotificationMode() {
    notificationModeEnabled = false;
    updateNotificationButtonState(false); // No animation when disabling
    clearNotificationInterval();
  }

  function updateNotificationButtonState(shouldAnimate = false) {
    const button = document.querySelector('.notification-toggle');
    if (!button) {
      return;
    }
    button.classList.toggle('active', notificationModeEnabled);
    button.setAttribute('title', notificationModeEnabled ? 'Disable notifications' : 'Enable notifications');

    // Update the icon to the provided bell SVG
    const bellIconSvg = `
      <svg class="notification-bell-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
      </svg>
    `;
    button.innerHTML = bellIconSvg;

    const bellIcon = button.querySelector('.notification-bell-icon');
    if (bellIcon) {
    // Remove tilted class when disabling
      if (!notificationModeEnabled) {
        bellIcon.classList.remove('tilted');
      }

      // Add animation to the bell icon only when activating (shouldAnimate is true and notificationModeEnabled is true)
      if (shouldAnimate && notificationModeEnabled) {
      // Use requestAnimationFrame to ensure the icon is rendered before animating
        requestAnimationFrame(() => {
          bellIcon.classList.add('animating');
          bellIcon.addEventListener('animationend', () => {
            bellIcon.classList.remove('animating');
            // Apply tilted class after animation ends to maintain the tilted position
            bellIcon.classList.add('tilted');
          }, { once: true });
        });
      } else if (notificationModeEnabled && !shouldAnimate) {
      // If already enabled but no animation needed (e.g., on page load), just add tilted class
        bellIcon.classList.add('tilted');
      }
    }
  }

  function scheduleNotificationRefresh() {
    clearNotificationInterval();
  // No longer doing polling - notifications will be triggered by auto refresh
  }

  function clearNotificationInterval() {
    if (notificationRefreshIntervalId) {
      clearInterval(notificationRefreshIntervalId);
      notificationRefreshIntervalId = null;
    }
  }

  function updateAutoRefreshInterval() {
    clearAutoRefreshInterval();

    const enabled = localStorage.getItem('autoRefreshEnabled') === 'true';
    const intervalMinutes = localStorage.getItem('autoRefreshInterval');

    setRefreshButtonAutoState(enabled, intervalMinutes);

    if (enabled && intervalMinutes && intervalMinutes !== '') {
      const intervalMs = parseInt(intervalMinutes) * 60 * 1000;
      autoRefreshIntervalId = setInterval(() => {
        refreshLogs();
      }, intervalMs);
    }
  }

  function setRefreshButtonAutoState(enabled, intervalMinutes) {
    const refreshButton = document.getElementById('refreshButton');
    const badge = document.getElementById('autoRefreshBadge');
    if (!refreshButton) {
      return;
    }

    const hasInterval = intervalMinutes && intervalMinutes !== '';
    const shouldHighlight = enabled && hasInterval;
    refreshButton.classList.toggle('auto-refresh-active', shouldHighlight);

    if (shouldHighlight) {
      refreshButton.setAttribute('title', `Auto-refresh every ${intervalMinutes} min`);
      refreshButton.setAttribute('aria-label', `Auto-refresh every ${intervalMinutes} minutes. Click to refresh now.`);
      if (badge) {
        badge.textContent = intervalMinutes;
        badge.style.display = 'inline-flex';
      }
      return;
    }

    refreshButton.setAttribute('title', 'Refresh now');
    refreshButton.setAttribute('aria-label', 'Refresh now');
    if (badge) {
      badge.textContent = '';
      badge.style.display = 'none';
    }
  }

  function clearAutoRefreshInterval() {
    if (autoRefreshIntervalId) {
      clearInterval(autoRefreshIntervalId);
      autoRefreshIntervalId = null;
    }
  }

  function handleNotificationState(events, _triggeredByNotification) {
    if (!Array.isArray(events) || events.length === 0) {
      return;
    }

    const newestTimestamp = getNewestTimestampFromEvents(events);

    // Always check for new sessions (not just when triggeredByNotification is true)
    if (lastKnownEventTimestamp) {
      const newSessionIds = events.reduce((set, event) => {
        const eventTimestamp = getEventTimestamp(event);
        const sessionId = event?.session_id;
        if (
          eventTimestamp !== null &&
					eventTimestamp > lastKnownEventTimestamp &&
					sessionId &&
					!knownSessionIds.has(sessionId)
        ) {
          set.add(sessionId);
        }
        return set;
      }, new Set());

      if (newSessionIds.size > 0) {
        notifyAboutNewSessions(newSessionIds.size);
        newSessionIds.forEach((sessionId) => knownSessionIds.add(sessionId));
      }
    }

    rememberSessionsFromEvents(events);

    if (newestTimestamp !== null) {
      lastKnownEventTimestamp = Math.max(lastKnownEventTimestamp || 0, newestTimestamp);
    }
  }

  function getNewestTimestampFromEvents(events) {
    return events.reduce((latest, event) => {
      const eventTimestamp = getEventTimestamp(event);
      if (eventTimestamp === null) {
        return latest;
      }
      if (latest === null || eventTimestamp > latest) {
        return eventTimestamp;
      }
      return latest;
    }, lastKnownEventTimestamp);
  }

  function getEventTimestamp(event) {
    if (!event || !event.timestamp) {
      return null;
    }
    const timestamp = Date.parse(event.timestamp);
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  function rememberSessionId(sessionId) {
    if (typeof sessionId === 'string' && sessionId.trim() !== '') {
      knownSessionIds.add(sessionId);
    }
  }

  function rememberSessionsFromList(sessionIds) {
    if (!Array.isArray(sessionIds)) {
      return;
    }
    sessionIds.forEach(rememberSessionId);
  }

  function rememberSessionsFromEvents(events) {
    if (!Array.isArray(events)) {
      return;
    }
    events.forEach(event => {
      if (event?.session_id) {
        rememberSessionId(event.session_id);
      }
    });
  }

  function notifyAboutNewSessions(newSessionsCount) {
    if (!('Notification' in window) || Notification.permission !== 'granted' || newSessionsCount <= 0) {
      return;
    }

    const title = 'New telemetry sessions';
    const body = newSessionsCount === 1
      ? '1 new session started.'
      : `${newSessionsCount} new sessions started.`;

    try {
      new Notification(title, {
        body,
        tag: 'telemetry-sessions',
        renotify: true
      });
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  // Search with debounce
  let searchDebounceTimer;
  const searchInputEl = document.getElementById('searchInput');
  if (searchInputEl) {
    searchInputEl.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        searchQuery = e.target.value;
        currentOffset = 0;
        loadEvents();
      }, 500);
    });
  } else {
    handleInitializationError('search input binding', new Error('Search input not found'));
  }

  // Sort order change
  const sortBtnEl = document.getElementById('sortBtn');
  const sortIconEl = document.getElementById('sortIcon');
  if (sortBtnEl && sortIconEl) {
  // Update icon based on current sort order
    function updateSortIcon() {
      if (sortOrder === 'DESC') {
        sortIconEl.src = '/resources/sort-desc';
        sortIconEl.alt = 'Sort descending';
        sortBtnEl.title = 'Sort: Newest first (click to change)';
      } else {
        sortIconEl.src = '/resources/sort-asc';
        sortIconEl.alt = 'Sort ascending';
        sortBtnEl.title = 'Sort: Oldest first (click to change)';
      }
    }

    // Initialize icon
    updateSortIcon();

    sortBtnEl.addEventListener('click', (_e) => {
    // Toggle sort order
      sortOrder = sortOrder === 'DESC' ? 'ASC' : 'DESC';
      currentOffset = 0;
      updateSortIcon();
      loadEvents();
    });
  } else {
    handleInitializationError('sort button binding', new Error('Sort button not found'));
  }

  // Infinite scroll setup
  const scrollContainer = document.getElementById('logsTableScroll');
  if (scrollContainer) {
  // Use throttling to improve performance
    let scrollTimeout;
    const throttledHandleScroll = () => {
      if (scrollTimeout) {
        return;
      }
      scrollTimeout = setTimeout(() => {
        handleScroll();
        scrollTimeout = null;
      }, 100);
    };
    scrollContainer.addEventListener('scroll', throttledHandleScroll);
  } else {
    handleInitializationError('scroll container binding', new Error('Scroll container not found'));
  }

  // Function to clear all filters
  function clearAllFilters() {
    // Clear search query
    searchQuery = '';
    const searchInputEl = document.getElementById('searchInput');
    if (searchInputEl) {
      searchInputEl.value = '';
    }

    // Reset all event type filters to active
    activeFilters = new Set(['tool_call', 'session_start', 'custom', 'tool_error']);
    document.querySelectorAll('.level-filter-btn').forEach(btn => {
      const level = btn.dataset.level;
      if (activeFilters.has(level)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Select all users
    if (allUserIds.size > 0) {
      selectedUserIds = new Set(allUserIds);
      // Update checkboxes in user filter dropdown
      const dropdownContent = document.getElementById('userFilterDropdownContent');
      if (dropdownContent) {
        dropdownContent.querySelectorAll('.user-filter-checkbox').forEach(checkbox => {
          const checkboxUserId = checkbox.getAttribute('data-user-id');
          if (checkboxUserId) {
            checkbox.checked = selectedUserIds.has(checkboxUserId);
          }
        });
      }
    }

    // Clear team selection
    selectedTeamKey = null;
    document.querySelectorAll('#teamList .session-item').forEach(item => {
      item.classList.remove('active');
    });
  }

  // Session selection (for "All Sessions" item)
  document.querySelectorAll('[data-session="all"]').forEach(item => {
    item.addEventListener('click', () => {
    // Cancel hover preview when clicking
      if (isHoverPreviewActive) {
        hoverPreviewState = null;
        isHoverPreviewActive = false;
      }
      // Avoid flickering if clicking on "All Sessions" when it's already selected
      if (selectedSession === 'all' && item.classList.contains('active')) {
        return;
      }
      document.querySelectorAll('.session-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      selectedSession = 'all';
      selectedActivityDate = null; // Reset to default when selecting all sessions
      sortOrder = 'DESC';
      sortOrder = 'DESC';
      const sortIconEl = document.getElementById('sortIcon');
      if (sortIconEl) {
        sortIconEl.src = '/resources/sort-desc';
        sortIconEl.alt = 'Sort descending';
      }
      // Clear all filters when clicking "All Sessions"
      clearAllFilters();
      currentOffset = 0;
      loadEvents();
      loadEventTypeStats(selectedSession);
    });

    // Add hover preview functionality
    item.addEventListener('mouseenter', () => {
      handleSessionHover('all');
    });

    item.addEventListener('mouseleave', (e) => {
    // Don't restore if mouse is still within the sessions area (sidebar-content)
    // This includes gaps between buttons
      if (e.relatedTarget && (
        e.relatedTarget.closest('.sidebar-content') ||
				e.relatedTarget.closest('.all-sessions-container') ||
				e.relatedTarget.closest('#sessionList') ||
				e.relatedTarget.closest('.session-list') ||
				e.relatedTarget.closest('.session-item')
      )) {
        return;
      }
      // Only restore if not clicking (click will handle it) and cursor left sessions area
      if (isHoverPreviewActive) {
        restoreChartState();
      }
    });
  });

  const DROPDOWN_SCROLL_CLOSE_THRESHOLD = 3;

  function closeAllDropdowns() {
    document.querySelectorAll('.actions-dropdown').forEach(dropdown => {
      dropdown.classList.remove('show');
    });
    document.querySelectorAll('.session-item').forEach(item => {
      item.classList.remove('dropdown-open');
    });
  }

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.actions-cell') && !e.target.closest('.session-item-actions')) {
      closeAllDropdowns();
    }
  });

  function registerDropdownScrollClose(target) {
    if (!target) return;
    const isWindow = target === window;
    let lastTop = isWindow ? window.pageYOffset : target.scrollTop;
    let lastLeft = isWindow ? window.pageXOffset : target.scrollLeft;

    target.addEventListener('scroll', () => {
      const currentTop = isWindow ? window.pageYOffset : target.scrollTop;
      const currentLeft = isWindow ? window.pageXOffset : target.scrollLeft;

      const movedVertically = Math.abs(currentTop - lastTop) > DROPDOWN_SCROLL_CLOSE_THRESHOLD;
      const movedHorizontally = Math.abs(currentLeft - lastLeft) > DROPDOWN_SCROLL_CLOSE_THRESHOLD;

      if (!movedVertically && !movedHorizontally) {
        return;
      }

      lastTop = currentTop;
      lastLeft = currentLeft;
      closeAllDropdowns();
    }, { passive: true });
  }

  registerDropdownScrollClose(window);
  registerDropdownScrollClose(document.getElementById('logsTableScroll'));
  registerDropdownScrollClose(document.querySelector('.sessions-scrollable'));

  // Keyboard navigation state
  let keyboardNavigationMode = null; // 'sessions' or 'events'
  let selectedSessionIndex = -1;
  let selectedEventIndex = -1;

  // Remove keyboard selection from all elements
  function clearKeyboardSelection() {
    document.querySelectorAll('.session-item.keyboard-selected').forEach(item => {
      item.classList.remove('keyboard-selected');
    });
    document.querySelectorAll('.logs-table tbody tr.keyboard-selected').forEach(row => {
      row.classList.remove('keyboard-selected');
    });
  }

  // Get all session items (including "All Sessions")
  function getAllSessionItems() {
    const allSessionsItem = document.querySelector('.session-item[data-session="all"]');
    const sessionItems = Array.from(document.querySelectorAll('#sessionList .session-item'));
    return allSessionsItem ? [allSessionsItem, ...sessionItems] : sessionItems;
  }

  // Get all event rows (excluding expanded rows)
  function getAllEventRows() {
    return Array.from(document.querySelectorAll('#logsBody tr[data-event-id]')).filter(row => {
      return !row.classList.contains('log-item-expanded');
    });
  }

  // Navigate sessions with keyboard
  function navigateSessions(direction) {
    const sessions = getAllSessionItems();
    if (sessions.length === 0) return;

    clearKeyboardSelection();
    keyboardNavigationMode = 'sessions';

    if (selectedSessionIndex < 0) {
    // Find currently active session
      const activeIndex = sessions.findIndex(item => item.classList.contains('active'));
      selectedSessionIndex = activeIndex >= 0 ? activeIndex : 0;
    } else {
      if (direction === 'down') {
        selectedSessionIndex = Math.min(selectedSessionIndex + 1, sessions.length - 1);
      } else if (direction === 'up') {
        selectedSessionIndex = Math.max(selectedSessionIndex - 1, 0);
      }
    }

    const selectedItem = sessions[selectedSessionIndex];
    if (selectedItem) {
      selectedItem.classList.add('keyboard-selected');
      selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // Navigate events with keyboard
  function navigateEvents(direction) {
    const events = getAllEventRows();
    if (events.length === 0) return;

    clearKeyboardSelection();
    keyboardNavigationMode = 'events';

    if (selectedEventIndex < 0) {
      selectedEventIndex = 0;
    } else {
      if (direction === 'down') {
        selectedEventIndex = Math.min(selectedEventIndex + 1, events.length - 1);
      } else if (direction === 'up') {
        selectedEventIndex = Math.max(selectedEventIndex - 1, 0);
      }
    }

    const selectedRow = events[selectedEventIndex];
    if (selectedRow) {
      selectedRow.classList.add('keyboard-selected');
      selectedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // Activate selected session
  function activateSelectedSession() {
    const sessions = getAllSessionItems();
    if (selectedSessionIndex >= 0 && selectedSessionIndex < sessions.length) {
      const selectedItem = sessions[selectedSessionIndex];
      selectedItem.click();
    }
  }

  // Activate selected event (expand/collapse)
  function activateSelectedEvent() {
    const events = getAllEventRows();
    if (selectedEventIndex >= 0 && selectedEventIndex < events.length) {
      const selectedRow = events[selectedEventIndex];
      const eventId = selectedRow.getAttribute('data-event-id');
      if (eventId) {
        toggleRowExpand(parseInt(eventId, 10));
      }
    }
  }

  // Keyboard event handler
  document.addEventListener('keydown', (e) => {
  // Don't interfere with input fields or textareas
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
      return;
    }

    // Don't interfere with dropdowns
    if (e.target.closest('.actions-dropdown')) {
      return;
    }

    switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      // Determine which list to navigate based on focus or current mode
      if (keyboardNavigationMode === 'sessions' || (!keyboardNavigationMode && document.activeElement.closest('.sidebar'))) {
        navigateSessions('down');
      } else {
        navigateEvents('down');
      }
      break;

    case 'ArrowUp':
      e.preventDefault();
      if (keyboardNavigationMode === 'sessions' || (!keyboardNavigationMode && document.activeElement.closest('.sidebar'))) {
        navigateSessions('up');
      } else {
        navigateEvents('up');
      }
      break;

    case 'Enter':
      e.preventDefault();
      if (keyboardNavigationMode === 'sessions') {
        activateSelectedSession();
      } else if (keyboardNavigationMode === 'events') {
        activateSelectedEvent();
      }
      break;

    case 'Escape':
      clearKeyboardSelection();
      keyboardNavigationMode = null;
      selectedSessionIndex = -1;
      selectedEventIndex = -1;
      break;
    }
  });

  // Reset keyboard navigation when clicking
  document.addEventListener('click', (e) => {
  // Don't reset if clicking on keyboard-selected items
    if (!e.target.closest('.keyboard-selected')) {
      clearKeyboardSelection();
      keyboardNavigationMode = null;
      selectedSessionIndex = -1;
      selectedEventIndex = -1;
    }
  });

  // eslint-disable-next-line no-unused-vars
  function toggleActionsDropdown(e, eventId) {
    e.stopPropagation();
    const dropdown = document.getElementById(`dropdown-${eventId}`);
    const isShowing = dropdown.classList.contains('show');
    const button = e.target.closest('.actions-btn');

    // Close all other dropdowns
    closeAllDropdowns();

    // Toggle this dropdown
    if (!isShowing) {
    // Calculate position relative to the button
      if (button) {
        const rect = button.getBoundingClientRect();

        // Position dropdown to the left of the button, vertically centered
        let right = window.innerWidth - rect.left + 4;
        let top = rect.top + (rect.height / 2);

        // Ensure dropdown doesn't go off-screen
        // First, make it visible temporarily to measure its size
        dropdown.style.visibility = 'hidden';
        dropdown.style.display = 'block';
        const dropdownRect = dropdown.getBoundingClientRect();

        // Center vertically on the button
        top = top - (dropdownRect.height / 2);

        // Check if dropdown would go off the top of the screen
        if (top < 4) {
          top = 4;
        }

        // Check if dropdown would go off the bottom of the screen
        if (top + dropdownRect.height > window.innerHeight - 4) {
          top = window.innerHeight - dropdownRect.height - 4;
        }

        // Check if dropdown would go off the left edge (since it's positioned to the left)
        if (right + dropdownRect.width > window.innerWidth) {
        // If not enough space on the left, position to the right of the button instead
          right = window.innerWidth - rect.right - 4;
        }

        dropdown.style.top = `${Math.max(4, top)}px`;
        dropdown.style.right = `${Math.max(4, right)}px`;
        dropdown.style.left = 'auto';
        dropdown.style.bottom = 'auto';
        dropdown.style.visibility = 'visible';
        dropdown.style.display = 'block';
        dropdown.style.zIndex = '10000';
      }

      // Use requestAnimationFrame to ensure the element is visible before transition
      requestAnimationFrame(() => {
        dropdown.classList.add('show');
      });
    }
  }


  function toggleSessionActionsDropdown(e, sessionId) {
    e.stopPropagation();
    const dropdown = document.getElementById(`session-dropdown-${escapeHtml(sessionId)}`);
    if (!dropdown) return;
    const isShowing = dropdown.classList.contains('show');
    const button = e.currentTarget || e.target.closest('.actions-btn') || e.target.closest('button');
    const sessionItem = dropdown.closest('.session-item');

    closeAllDropdowns();
    dropdown.classList.add('dropdown-right');

    if (!isShowing) {
      if (button) {
        const rect = button.getBoundingClientRect();

        dropdown.style.visibility = 'hidden';
        dropdown.style.display = 'block';
        const dropdownRect = dropdown.getBoundingClientRect();

        let left = rect.right + 6;
        let top = rect.top + (rect.height / 2) - (dropdownRect.height / 2);

        if (top < 4) {
          top = 4;
        }

        if (top + dropdownRect.height > window.innerHeight - 4) {
          top = window.innerHeight - dropdownRect.height - 4;
        }

        if (left + dropdownRect.width > window.innerWidth - 4) {
        // Not enough space on the right, position to the left
          left = Math.max(4, rect.left - dropdownRect.width - 6);
          dropdown.classList.remove('dropdown-right');
        } else {
          dropdown.classList.add('dropdown-right');
        }

        dropdown.style.top = `${Math.max(4, top)}px`;
        dropdown.style.left = `${Math.max(4, left)}px`;
        dropdown.style.right = 'auto';
        dropdown.style.bottom = 'auto';
        dropdown.style.visibility = 'visible';
        dropdown.style.display = 'block';
        dropdown.style.zIndex = '10000';
      }

      requestAnimationFrame(() => {
        dropdown.classList.add('show');
      });

      if (sessionItem) {
        sessionItem.classList.add('dropdown-open');
      }
    }
  }

  // eslint-disable-next-line no-unused-vars
  async function copyEventPayload(eventId) {
    try {
    // Get event data from the DOM element (already loaded, no API call needed)
      const row = document.querySelector(`tr[data-event-id="${eventId}"]`);
      if (!row) {
        alert('Event not found');
        return;
      }

      const eventDataStr = row.getAttribute('data-event');
      if (!eventDataStr) {
        alert('Event data not available');
        return;
      }

      const event = JSON.parse(eventDataStr);

      // Reconstruct the full payload as it was received
      const payload = {
        event: event.event,
        timestamp: event.timestamp,
        serverId: event.server_id || null,
        version: event.version || null,
        sessionId: event.session_id || null,
        userId: event.user_id || null,
        data: event.data || {}
      };

      // Remove null values to keep the JSON clean
      Object.keys(payload).forEach(key => {
        if (payload[key] === null) {
          delete payload[key];
        }
      });

      // Format as beautified JSON with proper indentation (2 spaces)
      const beautifiedPayload = JSON.stringify(payload, null, 2);

      // Copy to clipboard
      await navigator.clipboard.writeText(beautifiedPayload);

      // Close dropdown
      closeAllDropdowns();

      // Show feedback (optional - could use a toast notification)
      const btn = document.querySelector(`#dropdown-${eventId}`)?.previousElementSibling;
      if (btn) {
        const originalTitle = btn.getAttribute('title');
        btn.setAttribute('title', 'Payload copied to clipboard!');
        setTimeout(() => {
          btn.setAttribute('title', originalTitle || 'Actions');
        }, 2000);
      }
    } catch (error) {
      console.error('Error copying payload:', error);
      alert('Error copying payload: ' + error.message);
    }
  }

  // eslint-disable-next-line no-unused-vars
  function confirmDeleteEvent(eventId) {
    openConfirmModal({
      title: 'Delete event',
      message: 'Are you sure you want to delete this event? This action cannot be undone.',
      confirmLabel: 'Delete event',
      destructive: true
    }).then((confirmed) => {
      if (!confirmed) {
        return;
      }
      deleteEvent(eventId);
    });
  }

  async function deleteEvent(eventId) {
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: 'DELETE',
        credentials: 'include' // Ensure cookies are sent
      });
      const validResponse = await handleApiResponse(response);
      if (!validResponse) return;

      const _data = await validResponse.json();

      // Close dropdown
      closeAllDropdowns();

      // Refresh the view
      loadEventTypeStats(selectedSession);
      loadSessions();
      loadEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
      alert('Error deleting the event: ' + error.message);
    }
  }

  function toggleSelectionMode() {
    selectionMode = !selectionMode;
    const toggleBtn = document.getElementById('toggleSelectionModeBtn');
    if (toggleBtn) {
      if (selectionMode) {
        toggleBtn.innerHTML = '<i class="fa-solid fa-times"></i>';
        toggleBtn.classList.add('active');
      } else {
        toggleBtn.innerHTML = '<i class="fa-solid fa-list-check"></i>';
        toggleBtn.classList.remove('active');
        // Clear selection when exiting selection mode
        selectedSessionsForDeletion.clear();
        lastSelectedSessionId = null;
      }
    }
    // Update delete button visibility
    updateDeleteSelectedButton();

    // Reload sessions to ensure checkboxes exist in DOM, then animate
    (async () => {
      if (!selectionMode) {
      // If exiting selection mode, animate out first before reloading
        const checkboxes = document.querySelectorAll('.session-checkbox');
        checkboxes.forEach((checkbox) => {
          checkbox.classList.remove('show');
        });
        // Wait for animation to complete before reloading (reduced to match faster transition)
        await new Promise(resolve => setTimeout(resolve, 120));
      }
      await loadSessions();
      // Use requestAnimationFrame to ensure DOM is ready, then trigger transitions
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const checkboxes = document.querySelectorAll('.session-checkbox');
          if (selectionMode) {
          // Animate checkboxes in - all at the same time
            checkboxes.forEach((checkbox) => {
            // Remove show class first to ensure transition works
              checkbox.classList.remove('show');
              void checkbox.offsetWidth; // Force reflow
              checkbox.classList.add('show');
            });
          }
        });
      });
    })();
  }

  function selectSessionRange(startSessionId, endSessionId) {
  // Get all session items from the DOM
    const sessionItems = Array.from(document.querySelectorAll('#sessionList .session-item'));

    // Find indices of start and end sessions
    let startIndex = -1;
    let endIndex = -1;

    sessionItems.forEach((item, index) => {
      const sessionId = item.getAttribute('data-session');
      if (sessionId === startSessionId) {
        startIndex = index;
      }
      if (sessionId === endSessionId) {
        endIndex = index;
      }
    });

    // If either session not found, return
    if (startIndex === -1 || endIndex === -1) {
      return;
    }

    // Ensure startIndex is less than endIndex
    if (startIndex > endIndex) {
      [startIndex, endIndex] = [endIndex, startIndex];
    }

    // Save scroll position
    const sessionList = document.getElementById('sessionList');
    const scrollTop = sessionList ? sessionList.scrollTop : 0;

    // Select all sessions in the range
    for (let i = startIndex; i <= endIndex; i++) {
      const item = sessionItems[i];
      const sessionId = item.getAttribute('data-session');

      // Only add if not already selected (to avoid unnecessary animations)
      if (!selectedSessionsForDeletion.has(sessionId)) {
        selectedSessionsForDeletion.add(sessionId);
        const checkbox = document.getElementById(`session-checkbox-${escapeHtml(sessionId)}`);
        if (checkbox) {
          checkbox.checked = true;
          // Trigger animation
          checkbox.classList.remove('just-unchecked');
          void checkbox.offsetWidth; // Force reflow
          checkbox.classList.add('just-checked');

          // Restore scroll position
          if (sessionList) {
            requestAnimationFrame(() => {
              sessionList.scrollTop = scrollTop;
            });
          }

          // Clean up animation class
          const handleAnimationEnd = (e) => {
            if (e.animationName === 'checkboxCheck') {
              checkbox.classList.remove('just-checked');
              if (sessionList) {
                requestAnimationFrame(() => {
                  sessionList.scrollTop = scrollTop;
                });
              }
              checkbox.removeEventListener('animationend', handleAnimationEnd);
            }
          };
          checkbox.addEventListener('animationend', handleAnimationEnd);
        }
      }
    }

    updateDeleteSelectedButton();
  }

  function toggleSessionSelection(sessionId, event) {
    if (event) {
      event.stopPropagation();
    }

    // Handle shift-click for range selection
    if (event && event.shiftKey && lastSelectedSessionId !== null && lastSelectedSessionId !== sessionId) {
    // Select range from last selected to current
      selectSessionRange(lastSelectedSessionId, sessionId);
      // Update last selected to the current one
      lastSelectedSessionId = sessionId;
      return;
    }

    // Save scroll position to prevent scroll jump during animation
    // The scrollable container is the parent ul with class 'sessions-scrollable'
    const sessionList = document.getElementById('sessionList');
    const scrollTop = sessionList ? sessionList.scrollTop : 0;

    const checkbox = document.getElementById(`session-checkbox-${escapeHtml(sessionId)}`);
    if (selectedSessionsForDeletion.has(sessionId)) {
      selectedSessionsForDeletion.delete(sessionId);
      if (checkbox) {
        checkbox.checked = false;
        // Trigger animation by temporarily removing and re-adding checked state
        checkbox.classList.remove('just-checked');
        void checkbox.offsetWidth; // Force reflow
        checkbox.classList.add('just-unchecked');
        // Restore scroll position using requestAnimationFrame for smooth restoration
        if (sessionList) {
          requestAnimationFrame(() => {
            sessionList.scrollTop = scrollTop;
          });
        }
        // Use animationend event instead of setTimeout for better precision
        const handleAnimationEnd = (e) => {
          if (e.animationName === 'checkboxUncheck') {
            checkbox.classList.remove('just-unchecked');
            // Restore scroll position again after animation completes
            if (sessionList) {
              requestAnimationFrame(() => {
                sessionList.scrollTop = scrollTop;
              });
            }
            checkbox.removeEventListener('animationend', handleAnimationEnd);
          }
        };
        checkbox.addEventListener('animationend', handleAnimationEnd);
      }
    } else {
      selectedSessionsForDeletion.add(sessionId);
      if (checkbox) {
        checkbox.checked = true;
        // Trigger animation by temporarily removing and re-adding checked state
        checkbox.classList.remove('just-unchecked');
        void checkbox.offsetWidth; // Force reflow
        checkbox.classList.add('just-checked');
        // Restore scroll position using requestAnimationFrame for smooth restoration
        if (sessionList) {
          requestAnimationFrame(() => {
            sessionList.scrollTop = scrollTop;
          });
        }
        // Use animationend event instead of setTimeout for better precision
        const handleAnimationEnd = (e) => {
          if (e.animationName === 'checkboxCheck') {
            checkbox.classList.remove('just-checked');
            // Restore scroll position again after animation completes
            if (sessionList) {
              requestAnimationFrame(() => {
                sessionList.scrollTop = scrollTop;
              });
            }
            checkbox.removeEventListener('animationend', handleAnimationEnd);
          }
        };
        checkbox.addEventListener('animationend', handleAnimationEnd);
      }
    }

    // Update last selected session (for shift-click range selection)
    lastSelectedSessionId = sessionId;

    updateDeleteSelectedButton();
  }

  function updateDeleteSelectedButton() {
    const deleteSelectedBtn = document.getElementById('deleteSelectedSessionsBtn');
    if (deleteSelectedBtn) {
      const count = selectedSessionsForDeletion.size;
      if (count > 0 && selectionMode) {
        deleteSelectedBtn.style.display = 'flex';
        deleteSelectedBtn.innerHTML = `<i class="fa-solid fa-trash"></i> Delete (${count})`;
      } else {
        deleteSelectedBtn.style.display = 'none';
      }
    }
  }


  function confirmDeleteSession(sessionId) {
    openConfirmModal({
      title: 'Delete session events',
      message: 'Are you sure you want to delete all events from this session? This action cannot be undone.',
      confirmLabel: 'Delete session events',
      destructive: true
    }).then((confirmed) => {
      if (!confirmed) {
        return;
      }
      deleteSession(sessionId);
    });
  }


  function confirmDeleteSelectedSessions() {
    const count = selectedSessionsForDeletion.size;
    if (count === 0) {
      return;
    }
    openConfirmModal({
      title: 'Delete selected sessions',
      message: `Are you sure you want to delete all events from ${count} selected session${count > 1 ? 's' : ''}? This action cannot be undone.`,
      confirmLabel: `Delete ${count} session${count > 1 ? 's' : ''}`,
      destructive: true
    }).then((confirmed) => {
      if (!confirmed) {
        return;
      }
      deleteSelectedSessions();
    });
  }

  async function deleteSession(sessionId) {
    try {
      const response = await fetch(`/api/events?sessionId=${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        credentials: 'include' // Ensure cookies are sent
      });
      const validResponse = await handleApiResponse(response);
      if (!validResponse) return;

      const _data = await validResponse.json();

      // Close dropdown
      closeAllDropdowns();

      // If we were viewing this session, switch to "all"
      if (selectedSession === sessionId) {
        selectedSession = 'all';
        selectedActivityDate = null; // Reset to default when selecting all sessions
        document.querySelectorAll('.session-item').forEach(i => i.classList.remove('active'));
        const allSessionsItem = document.querySelector('[data-session="all"]');
        if (allSessionsItem) {
          allSessionsItem.classList.add('active');
        }
        sortOrder = 'DESC';
        sortOrder = 'DESC';
        const sortIconEl = document.getElementById('sortIcon');
        if (sortIconEl) {
          sortIconEl.src = '/resources/sort-desc';
          sortIconEl.alt = 'Sort descending';
        }
      }

      // Remove from selection if it was selected
      selectedSessionsForDeletion.delete(sessionId);

      // Refresh the view
      loadEventTypeStats(selectedSession);
      loadSessions();
      loadEvents();
    } catch (error) {
      console.error('Error deleting session:', error);
      alert('Error deleting the session: ' + error.message);
    }
  }

  async function deleteSelectedSessions() {
    const sessionsToDelete = Array.from(selectedSessionsForDeletion);
    if (sessionsToDelete.length === 0) {
      return;
    }

    try {
    // Delete sessions in parallel
      const deletePromises = sessionsToDelete.map(async (sessionId) => {
        const response = await fetch(`/api/events?sessionId=${encodeURIComponent(sessionId)}`, {
          method: 'DELETE',
          credentials: 'include'
        });
        const validResponse = await handleApiResponse(response);
        if (!validResponse) {
          throw new Error(`Failed to delete session ${sessionId}`);
        }
        return validResponse.json();
      });

      await Promise.all(deletePromises);

      // Clear selection
      selectedSessionsForDeletion.clear();
      lastSelectedSessionId = null;

      // If we were viewing one of the deleted sessions, switch to "all"
      if (sessionsToDelete.includes(selectedSession)) {
        selectedSession = 'all';
        selectedActivityDate = null;
        document.querySelectorAll('.session-item').forEach(i => i.classList.remove('active'));
        const allSessionsItem = document.querySelector('[data-session="all"]');
        if (allSessionsItem) {
          allSessionsItem.classList.add('active');
        }
        sortOrder = 'DESC';
        const sortIconEl = document.getElementById('sortIcon');
        if (sortIconEl) {
          sortIconEl.src = '/resources/sort-desc';
          sortIconEl.alt = 'Sort descending';
        }
      }

      // Refresh the view
      loadEventTypeStats(selectedSession);
      loadSessions();
      loadEvents();
    } catch (error) {
      console.error('Error deleting selected sessions:', error);
      alert('Error deleting sessions: ' + error.message);
    }
  }

  window.addEventListener('error', (event) => {
    if (!event) {
      return;
    }
    const message = event.message || 'Unexpected runtime error';
    showGlobalError(`Runtime error: ${message}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (!event) {
      return;
    }
    const reason = event.reason?.message || event.reason || 'Unhandled promise rejection';
    showGlobalError(`Unhandled error: ${reason}`);
  });

  function setupSessionLegendHover() {
    const wrapper = document.querySelector('.session-activity-legend-wrapper');
    const legend = document.getElementById('sessionActivityLegend');
    if (!wrapper || !legend) {
      return;
    }

    let hoverDepth = 0;
    let closeTimeoutId = null;

    const openLegend = () => {
      if (closeTimeoutId) {
        clearTimeout(closeTimeoutId);
        closeTimeoutId = null;
      }
      wrapper.classList.add('is-open');
    };

    const scheduleClose = () => {
      if (closeTimeoutId) {
        clearTimeout(closeTimeoutId);
      }
      closeTimeoutId = setTimeout(() => {
        if (hoverDepth <= 0) {
          wrapper.classList.remove('is-open');
        }
      }, 80);
    };

    const handleEnter = () => {
      hoverDepth += 1;
      openLegend();
    };

    const handleLeave = () => {
      hoverDepth = Math.max(0, hoverDepth - 1);
      if (hoverDepth === 0) {
        scheduleClose();
      }
    };

    wrapper.addEventListener('mouseenter', handleEnter);
    wrapper.addEventListener('mouseleave', handleLeave);
    legend.addEventListener('mouseenter', handleEnter);
    legend.addEventListener('mouseleave', handleLeave);
  }

  async function loadDatabaseSize() {
    try {
      const response = await fetch('/api/database-size', {
        credentials: 'include' // Ensure cookies are sent
      });
      const validResponse = await handleApiResponse(response);
      if (!validResponse) return;
      const data = await validResponse.json();
      if (data.status === 'ok') {
        const displayText = data.displayText || data.sizeFormatted;
        if (displayText) {
          const dbSizeElement = document.getElementById('dbSize');
          dbSizeElement.textContent = displayText;

          // Apply color based on percentage
          if (data.percentage !== null && data.percentage !== undefined) {
            if (data.percentage >= 80) {
            // Red for 80% or more
              dbSizeElement.style.color = 'var(--level-error)';
            } else if (data.percentage >= 70) {
            // Orange for 70% or more
              dbSizeElement.style.color = 'var(--level-warning)';
            } else {
            // Default color (inherit from parent)
              dbSizeElement.style.color = '';
            }
          }

          document.getElementById('dbSizeInfo').style.display = '';
        }
      }
    } catch (error) {
    // Silently fail if database size is not available
      console.debug('Database size not available:', error);
    }
  }

  // User filter dropdown management
  async function loadUsers() {
    try {
      const response = await fetch('/api/telemetry-users', {
        credentials: 'include'
      });
      const validResponse = await handleApiResponse(response);
      if (!validResponse) return;
      const data = await validResponse.json();

      // Check if response is an error object
      if (data && data.status === 'error') {
        console.error('Error loading users:', data.message);
        const dropdownContent = document.getElementById('userFilterDropdownContent');
        if (dropdownContent) {
          dropdownContent.innerHTML = '<div class="user-filter-empty">Error loading users</div>';
        }
        return;
      }

      const dropdownContent = document.getElementById('userFilterDropdownContent');
      if (!dropdownContent) return;

      dropdownContent.innerHTML = '';

      // Normalize API response to consistent objects { id, label }
      const normalizedUsers = (Array.isArray(data) ? data : [])
        .map(entry => {
          if (entry && typeof entry === 'object' && typeof entry.id === 'string') {
            const trimmedId = entry.id.trim();
            if (!trimmedId) {
              return null;
            }
            const label = typeof entry.label === 'string' && entry.label.trim() !== ''
              ? entry.label.trim()
              : trimmedId;
            return { id: trimmedId, label };
          }
          if (typeof entry === 'string') {
            const trimmedValue = entry.trim();
            return trimmedValue ? { id: trimmedValue, label: trimmedValue } : null;
          }
          return null;
        })
        .filter(Boolean)
        .reduce((acc, user) => {
          if (!acc.seen.has(user.id)) {
            acc.seen.add(user.id);
            acc.values.push(user);
          }
          return acc;
        }, { seen: new Set(), values: [] }).values;

      if (normalizedUsers.length === 0) {
        allUserIds = new Set();
        selectedUserIds.clear();
        dropdownContent.innerHTML = '<div class="user-filter-empty">No users found</div>';
        return;
      }

      const allIdsArray = normalizedUsers.map(user => user.id);

      // Update allUserIds and select all users by default if this is the first load
      const previousSelection = new Set(selectedUserIds);
      allUserIds = new Set(allIdsArray);
      const isFirstLoad = previousSelection.size === 0;
      if (isFirstLoad) {
      // Select all users by default
        selectedUserIds = new Set(allIdsArray);
      } else {
      // Keep only IDs that still exist
        selectedUserIds = new Set(
          Array.from(previousSelection).filter(userId => allUserIds.has(userId))
        );
      }

      const syncCheckboxStates = () => {
        dropdownContent.querySelectorAll('.user-filter-checkbox').forEach(checkbox => {
          const checkboxUserId = checkbox.getAttribute('data-user-id');
          if (!checkboxUserId) {
            return;
          }
          checkbox.checked = selectedUserIds.has(checkboxUserId);
        });
      };

      // Add "Select all" button at the top
      const selectAllButton = document.createElement('button');
      selectAllButton.className = 'user-filter-action-btn';
      selectAllButton.textContent = 'Select all';
      selectAllButton.addEventListener('click', (e) => {
        e.stopPropagation();
        // Select all users
        selectedUserIds = new Set(allIdsArray);
        syncCheckboxStates();
        currentOffset = 0;
        loadEvents();
        loadEventTypeStats(selectedSession);
        loadSessions();
      });

      dropdownContent.appendChild(selectAllButton);

      // Add "Deselect all" button
      const deselectAllButton = document.createElement('button');
      deselectAllButton.className = 'user-filter-action-btn';
      deselectAllButton.textContent = 'Deselect all';
      deselectAllButton.addEventListener('click', (e) => {
        e.stopPropagation();
        // Deselect all users
        selectedUserIds.clear();
        syncCheckboxStates();
        currentOffset = 0;
        loadEvents();
        loadEventTypeStats(selectedSession);
        loadSessions();
      });

      dropdownContent.appendChild(deselectAllButton);

      // Add separator
      const separator = document.createElement('div');
      separator.className = 'user-filter-separator';
      dropdownContent.appendChild(separator);

      let userCheckboxCounter = 0;
      normalizedUsers.forEach(user => {
        const userId = user.id;
        const userLabel = user.label || userId;
        const checkboxId = `user-filter-${userCheckboxCounter++}`;
        const userItem = document.createElement('div');
        userItem.className = 'user-filter-item';
        userItem.innerHTML = `
					<input type="checkbox" id="${checkboxId}" class="user-filter-checkbox" data-user-id="${escapeHtml(userId)}">
					<label for="${checkboxId}" class="user-filter-label">${escapeHtml(userLabel)}</label>
				`;

        const checkbox = userItem.querySelector('input[type="checkbox"]');
        // Check if user is selected (default to true on first load)
        checkbox.checked = selectedUserIds.has(userId);

        checkbox.addEventListener('change', (e) => {
          const targetUserId = e.target.getAttribute('data-user-id');
          if (!targetUserId) {
            return;
          }
          if (e.target.checked) {
            selectedUserIds.add(targetUserId);
          } else {
            selectedUserIds.delete(targetUserId);
          }
          // No need to update button states - they're always available
          currentOffset = 0;
          loadEvents();
          loadEventTypeStats(selectedSession);
          loadSessions();
        });

        dropdownContent.appendChild(userItem);
      });
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  window.toggleUserFilterDropdown = function(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('userFilterDropdown');
    const chevron = document.getElementById('userFilterChevron');
    if (!dropdown || !chevron) return;

    const isVisible = !dropdown.classList.contains('hidden');
    if (isVisible) {
      dropdown.classList.add('hidden');
      chevron.classList.remove('fa-sort-up');
      chevron.classList.add('fa-sort-down');
    } else {
      dropdown.classList.remove('hidden');
      chevron.classList.remove('fa-sort-down');
      chevron.classList.add('fa-sort-up');
      // Load users if not already loaded
      const dropdownContent = document.getElementById('userFilterDropdownContent');
      if (dropdownContent && dropdownContent.children.length === 0) {
        loadUsers();
      }
    }
  };

  // Close user filter dropdown when clicking outside
  document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('userFilterDropdown');
    const _dropdownBtn = document.getElementById('userFilterDropdownBtn');
    const dropdownContainer = event.target.closest('.user-filter-dropdown-container');

    if (dropdown && !dropdown.classList.contains('hidden')) {
      if (!dropdownContainer && !dropdown.contains(event.target)) {
        dropdown.classList.add('hidden');
        const chevron = document.getElementById('userFilterChevron');
        if (chevron) {
          chevron.classList.remove('fa-sort-up');
          chevron.classList.add('fa-sort-down');
        }
      }
    }
  });

  function setupTabs() {
    const sessionsTab = document.getElementById('sessionsTab');
    const usersTab = document.getElementById('usersTab');
    const teamsTab = document.getElementById('teamsTab');

    if (sessionsTab) {
      sessionsTab.addEventListener('click', () => {
        switchTab('sessions');
      });
    }

    if (usersTab) {
      usersTab.addEventListener('click', () => {
        switchTab('users');
      });
    }

    if (teamsTab) {
      teamsTab.addEventListener('click', () => {
        switchTab('teams');
      });
    }

    // Initialize indicator position after a short delay to ensure DOM is ready
    setTimeout(() => {
      updateTabIndicator();
    }, 0);

    // Also initialize on next frame to ensure layout is complete
    requestAnimationFrame(() => {
      updateTabIndicator();
    });

    // Update indicator on window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        updateTabIndicator();
      }, 100);
    });
  }

  function initializeApp() {
    runSafeInitStep('notification button state', updateNotificationButtonState);
    runSafeInitStep('theme initialization', initTheme);
    runSafeInitStep('user menu structure', ensureUserMenuStructure);
    runSafeInitStep('user menu hover', setupUserMenuHover);
    runSafeInitStep('level filters setup', setupLevelFilters);
    runSafeInitStep('sidebar resizer setup', setupSidebarResizer);
    runSafeInitStep('horizontal resizer setup', setupHorizontalResizer);
    runSafeInitStep('session legend hover', setupSessionLegendHover);
    runSafeInitStep('tabs setup', setupTabs);
    runSafeAsyncInitStep('event type stats', () => loadEventTypeStats(selectedSession));
    runSafeAsyncInitStep('sessions list', () => loadSessions());
    runSafeAsyncInitStep('events table', () => loadEvents());
    runSafeAsyncInitStep('database size', () => loadDatabaseSize());
    runSafeAsyncInitStep('users list', () => loadUsersList());
    runSafeAsyncInitStep('teams list', () => loadTeamsList());
    runSafeAsyncInitStep('auto refresh', () => updateAutoRefreshInterval());

    // Listen for chart rendering completion
    window.addEventListener('chartRenderComplete', (event) => {
      const { isInitialLoad, sessionId, eventCount, timestamp } = event.detail;
      if (isInitialLoad) {
        console.log('Initial chart render completed:', {
          sessionId,
          eventCount,
          renderTime: timestamp
        });
        // Show the page once initial chart render is complete
        const mainContainer = document.querySelector('.container');
        if (mainContainer) {
          mainContainer.style.visibility = 'visible';
          // Use requestAnimationFrame to ensure the visibility change is applied before opacity transition
          requestAnimationFrame(() => {
            mainContainer.style.opacity = '1';
          });
        }
      }
    });
  }

  // Expose a re-initializer so soft navigation can rebuild the page
  window.initializeEventLogApp = function({ resetState = false } = {}) {
    if (resetState) {
      resetEventLogState();
    }
    initializeApp();
  };

  // Allow soft navigation to rehydrate the page when arriving from Dashboard
  window.addEventListener('softNav:pageMounted', (event) => {
    if (event?.detail?.path === '/event-log') {
      window.initializeEventLogApp({ resetState: true });
    }
  });

  window.initializeEventLogApp();
  // Handle smooth hover animation for icon buttons group
  (function() {
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
        }
      });
    });
  })();

  // Mobile sidebar toggle functionality

  function toggleMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('mobileSidebarOverlay');

    if (sidebar && overlay) {
      const isVisible = sidebar.classList.contains('mobile-visible');

      if (isVisible) {
        sidebar.classList.remove('mobile-visible');
        overlay.classList.remove('visible');
      } else {
        sidebar.classList.add('mobile-visible');
        overlay.classList.add('visible');
      }
    }
  }

  // Close mobile sidebar when clicking on a session
  document.addEventListener('DOMContentLoaded', () => {
    const sessionItems = document.querySelectorAll('.session-item');
    sessionItems.forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          const sidebar = document.querySelector('.sidebar');
          const overlay = document.getElementById('mobileSidebarOverlay');
          if (sidebar && overlay) {
            sidebar.classList.remove('mobile-visible');
            overlay.classList.remove('visible');
          }
        }
      });
    });
  });

  // Expose handlers used by inline HTML attributes
  window.refreshLogs = refreshLogs;
  window.openSettingsModal = openSettingsModal;
  window.toggleNotificationMode = toggleNotificationMode;
  window.showUserMenu = showUserMenu;
  window.handleLogout = handleLogout;
  window.toggleSelectionMode = toggleSelectionMode;
  window.confirmDeleteSelectedSessions = confirmDeleteSelectedSessions;
  window.toggleMobileSidebar = toggleMobileSidebar;
  window.navigateToPreviousDay = navigateToPreviousDay;
  window.navigateToNextDay = navigateToNextDay;

} // end guard to avoid duplicate execution
