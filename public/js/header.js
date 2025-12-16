// @ts-nocheck
// Global header component - single source of truth for the navigation header
(function initGlobalHeader() {
	/**
   * Build the global header HTML
   * @param {Object} config - Configuration for page-specific elements
   * @param {string} config.activePage - Path of the active page ('/', '/logs', '/teams', '/people')
   * @param {Object} config.refreshButton - Refresh button configuration
   * @param {string} config.refreshButton.onClick - onClick handler function name
   * @param {string} config.refreshButton.id - Optional button ID
   * @param {boolean} config.refreshButton.showBadge - Whether to show auto-refresh badge
   * @param {string} config.refreshButton.ariaLabel - Aria label for the button
   * @param {string} config.refreshButton.title - Title/tooltip for the button
   * @param {Object} config.secondaryButton - Secondary button configuration
   * @param {string} config.secondaryButton.type - Type of button ('notification' or 'settings')
   * @returns {string} Header HTML
   */
	function buildHeaderHTML(config = {}) {
		const {
			activePage = '/',
			refreshButton = {},
			secondaryButton = { type: 'notification' }
		} = config;

		const {
			onClick: refreshOnClick = 'refreshDashboard(event)',
			id: refreshId = '',
			showBadge = false,
			ariaLabel: refreshAriaLabel = 'Refresh',
			title: refreshTitle = 'Refresh'
		} = refreshButton;

		const refreshButtonId = refreshId ? `id="${refreshId}"` : '';
		const refreshBadge = showBadge
			? '<span class="refresh-badge" id="autoRefreshBadge" aria-hidden="true"></span>'
			: '';

		// Determine secondary button content
		let secondaryButtonHTML = '';
		if (secondaryButton.type === 'settings') {
			secondaryButtonHTML = `
        <button class="icon-btn notification-toggle" onclick="openSettingsModal()" aria-label="Settings" title="Settings">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        </button>
      `;
		} else {
			// notification button (default)
			secondaryButtonHTML = `
        <button class="icon-btn notification-toggle" onclick="toggleNotificationMode()" aria-label="Toggle notifications" title="Enable notifications">
          <svg class="notification-bell-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
        </button>
      `;
		}

		return `
      <nav class="top-nav">
        <a href="/" class="top-nav-logo">
          <div class="top-nav-logo-icon">
            <img src="/resources/custom30.png" alt="IBM SF CTXT TELEMETRY" class="top-nav-logo-img">
          </div>
          <span>TELEMETRY</span>
        </a>
        <div class="top-nav-links">
          <a href="/" class="top-nav-link${activePage === '/' ? ' active' : ''}">Dashboard</a>
          <a href="/logs" class="top-nav-link${activePage === '/logs' ? ' active' : ''}">Logs</a>
          <a href="/teams" class="top-nav-link${activePage === '/teams' ? ' active' : ''}">Teams</a>
          <a href="/people" class="top-nav-link${activePage === '/people' ? ' active' : ''}">People</a>
        </div>
        <div class="top-nav-search">
          <input type="text" class="top-nav-search-input" placeholder="Search" id="searchInput">
        </div>
        <div class="top-nav-actions">
          <button type="button" class="icon-btn" ${refreshButtonId} aria-label="${refreshAriaLabel}" title="${refreshTitle}" onclick="${refreshOnClick}">
            <svg class="refresh-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
            </svg>
            ${refreshBadge}
          </button>
          ${secondaryButtonHTML}
          <el-dropdown class="user-menu-container inline-block">
            <button class="icon-btn user-btn inline-flex items-center gap-1.5" id="userBtn" onclick="showUserMenu(event)" aria-label="User menu">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
                <path fill-rule="evenodd" d="M12 2.25a5.25 5.25 0 0 0-3.717 8.966 8.252 8.252 0 0 0-4.367 7.284.75.75 0 0 0 1.5 0 6.75 6.75 0 1 1 13.5 0 .75.75 0 0 0 1.5 0 8.252 8.252 0 0 0-4.366-7.284A5.25 5.25 0 0 0 12 2.25Zm0 1.5a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5Z" clip-rule="evenodd"/>
              </svg>
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="size-4 text-(--text-secondary)">
                <path d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
              </svg>
            </button>
            <el-menu id="userMenu" anchor="bottom end" popover class="w-56 origin-top-right divide-y divide-gray-100 rounded-md bg-white text-gray-900 shadow-lg ring-1 ring-black/5 transition transition-discrete dark:divide-white/10 dark:bg-zinc-900 dark:text-gray-50 font-light [--anchor-gap:--spacing(2)] data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"></el-menu>
          </el-dropdown>
        </div>
      </nav>
    `;
	}

	/**
   * Initialize the header on the page
   * @param {Object} config - Configuration for page-specific elements
   */
	function initHeader(config) {
		// Find the header placeholder or existing nav element
		const headerPlaceholder = document.getElementById('global-header-placeholder');
		const existingNav = document.querySelector('nav.top-nav');

		if (headerPlaceholder) {
			// Replace placeholder with header
			headerPlaceholder.outerHTML = buildHeaderHTML(config);
		} else if (existingNav) {
			// Replace existing nav (for backward compatibility during migration)
			existingNav.outerHTML = buildHeaderHTML(config);
		} else {
			console.warn('No header placeholder or existing nav found');
		}
	}

	// Expose globally
	window.initGlobalHeader = initHeader;
	window.buildGlobalHeaderHTML = buildHeaderHTML;
})();
