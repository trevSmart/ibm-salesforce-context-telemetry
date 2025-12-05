// Initialize user preferences menu content for both dashboard and event log pages
// This script only builds the menu markup. The behavior (handlers) is implemented
// in the page-specific scripts (`index.js` and `event-log.js`).

(function initUserMenu() {
  const userMenu = document.getElementById('userMenu');
  if (!userMenu) {
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

  // Build the menu structure expected by the page scripts and CSS
  userMenu.innerHTML = `
		<div class="user-menu-item" id="userMenuUsername">
			<i class="fa-regular fa-user user-menu-icon"></i>Loading user...
		</div>
		<div class="user-menu-item">
			<button type="button" id="themeToggleMenuItem" onclick="toggleTheme()">
				${themeIcon}${themeLabel}
			</button>
		</div>
		<div class="user-menu-item clear-data-menu-item user-menu-item-danger" onclick="clearLocalData()">
			<i class="fa-solid fa-broom user-menu-icon user-menu-icon-danger"></i>Clear local data
		</div>
		<div class="user-menu-item" onclick="handleLogout()">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="user-menu-icon" width="16" height="16" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" />
			</svg>Sign out
		</div>
	`;
})();

