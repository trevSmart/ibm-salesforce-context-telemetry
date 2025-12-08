// Shared rendering helpers for the user dropdown.
// Keeping the template centralized guarantees every page gets the same blueprint styling.

(function initUserMenu() {
  function buildUserMenuTemplate() {
    const isDark = document.documentElement.classList.contains('dark');
    const themeLabel = isDark ? 'Light theme' : 'Dark theme';
    const baseButtonClasses = [
      'group/item flex w-full items-center gap-3 px-4 py-2 text-sm',
      'text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus-visible:bg-gray-100 focus-visible:text-gray-900',
      'dark:text-gray-100 dark:hover:bg-white/10 dark:focus-visible:bg-white/10 dark:hover:text-white',
      'transition-colors cursor-pointer focus-visible:outline-none'
    ].join(' ');
    const destructiveButtonClasses = [
      'group/item flex w-full items-center gap-3 px-4 py-2 text-sm font-medium text-red-600',
      'hover:bg-red-50 focus-visible:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 dark:focus-visible:bg-red-500/10',
      'transition-colors cursor-pointer focus-visible:outline-none'
    ].join(' ');
    const iconClasses = 'size-5 shrink-0 text-gray-400 transition-colors group-hover/item:text-gray-500 group-focus-visible/item:text-gray-500 dark:text-gray-400 dark:group-hover/item:text-gray-200';
    const destructiveIconClasses = `${iconClasses} text-red-500 dark:text-red-400`;
    const themeIcon = isDark
      ? `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="${iconClasses}" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
      `
      : `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="${iconClasses}" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
      `;

    return `
      <div class="py-1">
        <div class="flex items-center gap-3 px-4 py-2 text-sm text-gray-500 dark:text-gray-300" id="userMenuUsername">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="size-5 shrink-0 text-gray-400 dark:text-gray-300">
            <path fill-rule="evenodd" d="M12 2.25a5.25 5.25 0 0 0-3.717 8.966 8.252 8.252 0 0 0-4.367 7.284.75.75 0 0 0 1.5 0 6.75 6.75 0 1 1 13.5 0 .75.75 0 0 0 1.5 0 8.252 8.252 0 0 0-4.366-7.284A5.25 5.25 0 0 0 12 2.25Zm0 1.5a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5Z" clip-rule="evenodd"/>
          </svg>
          <span class="font-semibold text-gray-900 dark:text-white">Loading user...</span>
        </div>
      </div>
      <div class="py-1">
        <button type="button" class="${baseButtonClasses}" id="themeToggleMenuItem" onclick="toggleTheme()">
          ${themeIcon}
          <span>${themeLabel}</span>
        </button>
        <button type="button" class="${baseButtonClasses}" onclick="openSettingsModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke="currentColor" class="${iconClasses}" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
          </svg>
          <span>Settings</span>
        </button>
      </div>
      <div class="py-1">
        <button type="button" class="${destructiveButtonClasses}" onclick="clearLocalData()">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke="currentColor" class="${destructiveIconClasses}" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" />
          </svg>
          <span>Clear local data</span>
        </button>
      </div>
      <div class="py-1">
        <button type="button" class="${baseButtonClasses}" onclick="handleLogout()">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke="currentColor" class="${iconClasses}" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" />
          </svg>
          <span>Sign out</span>
        </button>
      </div>
    `;
  }

  function renderUserMenu() {
    const userMenu = document.getElementById('userMenu');
    if (!userMenu) {
      return;
    }
    userMenu.innerHTML = buildUserMenuTemplate();
    userMenu.dataset.initialized = 'true';
  }

  // Initialize immediately so static pages (like /teams) receive the dropdown.
  renderUserMenu();
  window.buildUserMenuTemplate = buildUserMenuTemplate;
  window.renderUserMenu = renderUserMenu;
})();

// User menu behavior - with fallback when Tailwind Plus Elements is not loaded
(function initUserMenuBehavior() {
  // Load user info when the page loads
  function loadUserInfo() {
    fetch('/api/auth/status', {
      credentials: 'include' // Ensure cookies are sent
    })
      .then(response => response.json())
      .then(data => {
        const usernameElement = document.getElementById('userMenuUsername');
        if (usernameElement) {
          const usernameSpan = usernameElement.querySelector('span');
          if (usernameSpan) {
            if (data.authenticated && data.username) {
              usernameSpan.textContent = data.username;
            } else {
              usernameSpan.textContent = 'Not authenticated';
            }
          }
        }
      })
      .catch(() => {
        const usernameElement = document.getElementById('userMenuUsername');
        if (usernameElement) {
          const usernameSpan = usernameElement.querySelector('span');
          if (usernameSpan) {
            usernameSpan.textContent = 'Error loading user';
          }
        }
      });
  }

  async function handleLogout() {
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

  // Fallback: If Tailwind Plus Elements doesn't load, implement basic dropdown behavior
  function initFallbackDropdown() {
    // Wait a bit to see if el-dropdown is defined
    setTimeout(() => {
      // Check if el-dropdown custom element is registered
      if (typeof customElements !== 'undefined' && !customElements.get('el-dropdown')) {
        console.log('Tailwind Plus Elements not loaded, using fallback dropdown behavior');
        
        const userBtn = document.getElementById('userBtn');
        const userMenu = document.getElementById('userMenu');
        
        if (userBtn && userMenu) {
          // Make menu hidden by default
          userMenu.style.display = 'none';
          
          // Toggle dropdown on button click
          userBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = userMenu.style.display === 'none';
            userMenu.style.display = isHidden ? 'block' : 'none';
          });
          
          // Close dropdown when clicking outside
          document.addEventListener('click', (e) => {
            if (!userBtn.contains(e.target) && !userMenu.contains(e.target)) {
              userMenu.style.display = 'none';
            }
          });
        }
      }
    }, 100);
  }

  // Load user info immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      loadUserInfo();
      initFallbackDropdown();
    });
  } else {
    loadUserInfo();
    initFallbackDropdown();
  }

  // Expose functions globally
  window.handleLogout = handleLogout;
})();
