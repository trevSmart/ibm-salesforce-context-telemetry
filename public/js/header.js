// @ts-nocheck
// Global header component - single source of truth for the navigation header
(function initGlobalHeader() {
	/**
	 * Dynamic refresh dispatcher - calls the appropriate refresh function based on current page
	 * This ensures the correct refresh function is called even after soft navigation
	 */
	function handleRefreshClick(event) {
		if (event?.preventDefault) {
			event.preventDefault();
		}

		// Determine which refresh function to call based on current path at click time
		const currentPath = window.location.pathname;

		if (currentPath === '/' || currentPath.startsWith('/?')) {
			// Dashboard page
			if (typeof window.refreshDashboard === 'function') {
				window.refreshDashboard(event);
			}
		} else if (currentPath.startsWith('/logs')) {
			// Event log page
			if (typeof window.refreshLogs === 'function') {
				window.refreshLogs(event);
			}
		} else if (currentPath.startsWith('/teams')) {
			// Teams page
			if (typeof window.refreshTeams === 'function') {
				window.refreshTeams(event);
			}
		} else if (currentPath.startsWith('/people')) {
			// People page
			if (typeof window.refreshPeople === 'function') {
				window.refreshPeople(event);
			}
		}
	}

	/**
	 * Unified refresh handler - fetches latest event data
	 * This is the same handler used across all pages
	 */
	async function refreshEvents(event) {
		if (event?.preventDefault) {
			event.preventDefault();
		}

		// Get the refresh button and icon
		const button = event?.target?.closest('.icon-btn') || event?.currentTarget || document.getElementById('refreshButton');
		const refreshIcon = button?.querySelector('.refresh-icon');

		// Start rotation animation
		if (refreshIcon) {
			refreshIcon.classList.add('rotating');
		}

		try {
			// Fetch latest events from the API
			const response = await fetch('/api/events?limit=100');
			if (!response.ok) {
				throw new Error('Failed to fetch events');
			}
			const data = await response.json();

			// Dispatch a custom event that pages can listen to if they want to update their UI
			window.dispatchEvent(new CustomEvent('eventsRefreshed', {detail: data}));
		} catch (error) {
			console.error('Error refreshing events:', error);
		} finally {
			// Stop rotation with smooth finish animation
			if (refreshIcon) {
				refreshIcon.classList.remove('rotating');
				refreshIcon.classList.add('rotating-finish');
				setTimeout(() => {
					refreshIcon.classList.remove('rotating-finish');
				}, 700); // REFRESH_ICON_ANIMATION_DURATION_MS
			}
		}
	}

	/**
   * Build the global header HTML - automatically detects page context
   * @returns {string} Header HTML
   */
	function buildHeaderHTML() {
		// Auto-detect active page from current URL
		const currentPath = window.location.pathname;
		const activePage = currentPath === '/' ? '/' :currentPath.startsWith('/logs') ? '/logs' :currentPath.startsWith('/teams') ? '/teams' :currentPath.startsWith('/people') ? '/people' :currentPath.startsWith('/users') ? '/users' : '/';

		// Refresh button properties - use dynamic handler for all pages
		const showBadge = currentPath.startsWith('/logs');
		const refreshId = currentPath.startsWith('/logs') ? 'refreshButton' : '';
		const refreshAriaLabel = 'Refresh';
		const refreshTitle = 'Refresh';

		// Use dynamic refresh handler that determines which function to call at click time
		// This ensures correct behavior even after soft navigation between pages
		const refreshOnClick = 'handleRefreshClick(event)';

		const refreshButtonId = refreshId ? `id="${refreshId}"` : '';
		const refreshBadge = showBadge? '<span class="refresh-badge" id="autoRefreshBadge" aria-hidden="true"></span>': '';

		// Secondary button content (always settings)
		const secondaryButtonHTML = ``;

		return `
      <nav class="top-nav">
        <a href="/" class="top-nav-logo">
          <div class="top-nav-logo-icon">
            <img src="/resources/ibm.webp" alt="IBM SF CTXT TELEMETRY" class="top-nav-logo-img">
          </div>
          <span>TELEMETRY</span>
        </a>
        <div class="top-nav-links">
          <a href="/" class="top-nav-link${activePage === '/' ? ' active' : ''}">Dashboard</a>
          <a href="/logs" class="top-nav-link${activePage === '/logs' ? ' active' : ''}">Logs</a>
          <a href="/teams" class="top-nav-link${activePage === '/teams' ? ' active' : ''}">Teams</a>
          <a href="/people" class="top-nav-link${activePage === '/people' ? ' active' : ''}">People</a>
        </div>
        <div class="top-nav-actions">
          <button type="button" class="icon-btn navbar-btn-icon" aria-label="Command Palette" title="Command Palette" onclick="window.showCommandPalette && window.showCommandPalette()">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </button>
          <button type="button" class="icon-btn navbar-btn-icon" ${refreshButtonId} aria-label="${refreshAriaLabel}" title="${refreshTitle}" onclick="${refreshOnClick}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="refresh-icon" width="18" height="18" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
            </svg>
            ${refreshBadge}
          </button>
          ${secondaryButtonHTML}
          <div class="inline-flex rounded-md shadow-xs mr-2">
            <button type="button" class="relative inline-flex items-center rounded-l-md bg-[var(--button-bg)] px-2 py-2 text-gray-400 inset-ring-1 inset-ring-gray-300 hover:bg-gray-50 focus:z-10" style="padding-left: 10px; --radius-md: 99px;" onclick="openSettingsModal()">
              <span class="sr-only">Save changes</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="var(--text-regular)" stroke-width="1.5" aria-hidden="true" class="size-[18px]">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </button>
            <el-dropdown class="user-menu-container inline-block -ml-px">
              <button class="relative inline-flex items-center rounded-r-md bg-[var(--button-bg)] px-3 py-2 text-sm text-gray-900 inset-ring-1 inset-ring-gray-300 hover:bg-gray-50 focus:z-10" style="--radius-md: 99px;" onclick="showUserMenu(event)">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--text-regular)" width="18" height="18" aria-hidden="true" class="size-[18px]">
                  <path fill-rule="evenodd" d="M12 2.25a5.25 5.25 0 0 0-3.717 8.966 8.252 8.252 0 0 0-4.367 7.284.75.75 0 0 0 1.5 0 6.75 6.75 0 1 1 13.5 0 .75.75 0 0 0 1.5 0 8.252 8.252 0 0 0-4.366-7.284A5.25 5.25 0 0 0 12 2.25Zm0 1.5a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5Z" clip-rule="evenodd"></path>
                </svg>
                <svg viewBox="0 0 20 20" fill="currentColor" data-slot="icon" aria-hidden="true" class="ml-1 size-4">
                  <path d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
                </svg>
              </button>
              <el-menu id="userMenu" anchor="bottom end" popover class="	origin-top-right divide-y divide-gray-100 rounded-md bg-white/70 dark:bg-gray-800/70 text-gray-900 shadow-2xl outline-1 outline-black/5 dark:outline-white/10 backdrop-blur-sm backdrop-filter transition transition-discrete dark:divide-white/10 dark:text-gray-50 [--anchor-gap:--spacing(2)] data-closed:-translate-y-2 data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-250 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"></el-menu>
            </el-dropdown>
          </div>
        </div>
      </nav>
    `;
	}

	/**
   * Initialize the header on the page - automatically detects page context
   */
	function initHeader() {
		// Find the header placeholder or existing nav element
		const headerPlaceholder = document.getElementById('global-header-placeholder');
		const existingNav = document.querySelector('nav.top-nav');

		if (headerPlaceholder) {
			// Replace placeholder with header
			headerPlaceholder.outerHTML = buildHeaderHTML();
		} else if (existingNav) {
			// Replace existing nav (for backward compatibility during migration)
			existingNav.outerHTML = buildHeaderHTML();
		} else {
			console.warn('No header placeholder or existing nav found');

		}

	}


	// Expose globally
	window.initGlobalHeader = initHeader;
	window.buildGlobalHeaderHTML = buildHeaderHTML;
	window.refreshEvents = refreshEvents;
	window.handleRefreshClick = handleRefreshClick;
}());
