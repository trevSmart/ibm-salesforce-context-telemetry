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
	const themeIcon = isDark ? 'fa-regular fa-sun' : 'fa-regular fa-moon';
	const themeLabel = isDark ? 'Light theme' : 'Dark theme';

	// Build the menu structure expected by the page scripts and CSS
	userMenu.innerHTML = `
		<div class="user-menu-item" id="userMenuUsername">
			<i class="fa-regular fa-user user-menu-icon"></i>Loading user...
		</div>
		<div class="user-menu-item">
			<button type="button" id="themeToggleMenuItem" onclick="toggleTheme()">
				<i class="${themeIcon} user-menu-icon"></i>${themeLabel}
			</button>
		</div>
		<div class="user-menu-item clear-data-menu-item" onclick="clearLocalData()">
			<i class="fa-solid fa-broom user-menu-icon"></i>Clear local data
		</div>
		<div class="user-menu-item delete-all-menu-item" onclick="handleDeleteAll()">
			<i class="fa-solid fa-trash user-menu-icon"></i>Delete all events
		</div>
		<div class="user-menu-item" onclick="handleLogout()">
			<i class="fa-solid fa-arrow-right-from-bracket user-menu-icon"></i>Sign out
		</div>
	`;
})();

