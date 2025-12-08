// Shared rendering helpers for the user dropdown.
// Keeping the template centralized guarantees every page gets the same blueprint styling.

(function initUserMenu() {
  function buildUserMenuTemplate() {
    const isDark = document.documentElement.classList.contains('dark');
    const themeLabel = isDark ? 'Light theme' : 'Dark theme';
    const baseButtonClasses = [
      'group/item user-menu-item flex w-full items-center gap-3 px-4 py-2 text-sm',
      'text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus-visible:bg-gray-100 focus-visible:text-gray-900',
      'dark:text-gray-100 dark:hover:bg-white/10 dark:focus-visible:bg-white/10 dark:hover:text-white',
      'transition-colors cursor-pointer focus-visible:outline-none'
    ].join(' ');
    const iconClasses = 'size-5 shrink-0 text-gray-400 transition-colors group-hover/item:text-gray-500 group-focus-visible/item:text-gray-500 dark:text-gray-400 dark:group-hover/item:text-gray-200';
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
        <div class="flex items-center gap-3 px-4 py-2 text-sm text-gray-500 dark:text-gray-300 cursor-default" id="userMenuUsername">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="size-5 shrink-0 text-gray-400 dark:text-gray-300">
            <path fill-rule="evenodd" d="M12 2.25a5.25 5.25 0 0 0-3.717 8.966 8.252 8.252 0 0 0-4.367 7.284.75.75 0 0 0 1.5 0 6.75 6.75 0 1 1 13.5 0 .75.75 0 0 0 1.5 0 8.252 8.252 0 0 0-4.366-7.284A5.25 5.25 0 0 0 12 2.25Zm0 1.5a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5Z" clip-rule="evenodd"/>
          </svg>
          <span class="font-thin text-gray-900 dark:text-white">Loading user...</span>
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

// User menu behavior - consolidated from index.js, event-log.js, and teams.js
(function initUserMenuBehavior() {
  const USER_MENU_HIDE_DELAY_MS = 300;
  let userMenuHideTimeout = null;
  let cleanupHoverHandlers = null;
  const supportsNativePopover = typeof HTMLElement !== 'undefined' &&
    (typeof HTMLElement.prototype.showPopover === 'function' || typeof HTMLElement.prototype.togglePopover === 'function');

  function prepareUserMenuElement(userMenu) {
    if (!userMenu) {
      return;
    }
    if (!supportsNativePopover && userMenu.hasAttribute('popover')) {
      userMenu.removeAttribute('popover');
    }
  }

  function setPopoverVisibility(userMenu, shouldOpen) {
    if (!supportsNativePopover || !userMenu) {
      return;
    }

    if (typeof userMenu.matches === 'function') {
      try {
        if (userMenu.matches(':popover-open') === shouldOpen) {
          return;
        }
      } catch (_err) {
        // Ignore if :popover-open is unsupported in the current browser.
      }
    }

    if (typeof userMenu.togglePopover === 'function') {
      try {
        userMenu.togglePopover(shouldOpen);
        return;
      } catch (_err) {
        // Ignore and fall back to show/hide specific methods.
      }
    }

    const method = shouldOpen ? 'showPopover' : 'hidePopover';
    if (typeof userMenu[method] === 'function') {
      try {
        userMenu[method]();
      } catch (_err) {
        // Swallow InvalidStateError (already in requested state).
      }
    }
  }

  function hideUserMenu() {
    if (userMenuHideTimeout) {
      clearTimeout(userMenuHideTimeout);
      userMenuHideTimeout = null;
    }

    const userMenu = document.getElementById('userMenu');
    if (!userMenu) {
      return;
    }

    if (userMenu.classList.contains('show')) {
      userMenu.classList.remove('show');
    }

    setPopoverVisibility(userMenu, false);
  }

  function ensureUserMenuReady() {
    let userMenu = document.getElementById('userMenu');
    if (!userMenu) {
      return null;
    }

    if (userMenu.dataset.initialized !== 'true' && typeof window.renderUserMenu === 'function') {
      window.renderUserMenu();
      userMenu = document.getElementById('userMenu');
      if (!userMenu) {
        return null;
      }
    }

    prepareUserMenuElement(userMenu);
    return userMenu;
  }

  function showUserMenu(e) {
    if (e) {
      e.stopPropagation();
    }
    const userMenu = ensureUserMenuReady();
    if (!userMenu) {
      return;
    }

    // Only open the menu; do not toggle/close it from this handler
    if (!userMenu.classList.contains('show')) {
      userMenu.classList.add('show');
      setPopoverVisibility(userMenu, true);
      // Load user info
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
  }

  // Close user menu when clicking outside
  document.addEventListener('click', function(event) {
    const userMenu = document.getElementById('userMenu');
    const _userBtn = document.getElementById('userBtn');
    const userMenuContainer = event.target.closest('.user-menu-container');

    if (userMenu && userMenu.classList.contains('show')) {
      if (!userMenuContainer && !userMenu.contains(event.target)) {
        hideUserMenu();
      }
    }
  });

  function setupUserMenuHover() {
    if (cleanupHoverHandlers) {
      cleanupHoverHandlers();
      cleanupHoverHandlers = null;
    }

    const container = document.querySelector('.user-menu-container');
    if (!container) {
      return;
    }

    const userMenu = ensureUserMenuReady();
    if (!userMenu) {
      return;
    }

    const cancelHide = () => {
      if (userMenuHideTimeout) {
        clearTimeout(userMenuHideTimeout);
        userMenuHideTimeout = null;
      }
    };

    const scheduleHide = () => {
      cancelHide();
      userMenuHideTimeout = setTimeout(() => {
        hideUserMenu();
      }, USER_MENU_HIDE_DELAY_MS);
    };

    // Treat the trigger + popover as a single hover region even if the
    // popover is teleported elsewhere in the DOM.
    const isInsideMenuRegion = (node) => {
      if (!node) {
        return false;
      }
      return container.contains(node) || userMenu.contains(node);
    };

    const handleMouseEnter = (event) => {
      cancelHide();
      // Only open if it's not already visible
      if (!userMenu.classList.contains('show')) {
        showUserMenu(event);
      }
    };

    const handleMouseLeave = (event) => {
      const nextTarget = event?.relatedTarget;
      if (nextTarget && isInsideMenuRegion(nextTarget)) {
        return;
      }
      scheduleHide();
    };

    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);
    container.addEventListener('focusin', handleMouseEnter);
    container.addEventListener('focusout', handleMouseLeave);

    const userBtn = container.querySelector('#userBtn');
    if (userBtn) {
      userBtn.addEventListener('mouseenter', handleMouseEnter);
      userBtn.addEventListener('focus', handleMouseEnter);
    }

    userMenu.addEventListener('mouseenter', handleMouseEnter);
    userMenu.addEventListener('mouseleave', handleMouseLeave);
    userMenu.addEventListener('focusin', handleMouseEnter);
    userMenu.addEventListener('focusout', handleMouseLeave);

    cleanupHoverHandlers = () => {
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
      container.removeEventListener('focusin', handleMouseEnter);
      container.removeEventListener('focusout', handleMouseLeave);
      if (userBtn) {
        userBtn.removeEventListener('mouseenter', handleMouseEnter);
        userBtn.removeEventListener('focus', handleMouseEnter);
      }
      userMenu.removeEventListener('mouseenter', handleMouseEnter);
      userMenu.removeEventListener('mouseleave', handleMouseLeave);
      userMenu.removeEventListener('focusin', handleMouseEnter);
      userMenu.removeEventListener('focusout', handleMouseLeave);
    };
  }

  async function handleLogout() {
    // Close menu
    hideUserMenu();

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

  // Initialize hover functionality when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupUserMenuHover);
  } else {
    setupUserMenuHover();
  }

  // Rehydrate menu after soft navigation replaces the header.
  window.addEventListener('softNav:pageMounted', () => {
    if (typeof window.renderUserMenu === 'function') {
      window.renderUserMenu();
    }
    setupUserMenuHover();
  });

  // Fallback: delegate hover to handle cases where the nav is replaced and a
  // specific listener was not yet attached. This keeps hover-open reliable.
  document.addEventListener('pointerover', (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const trigger = event.target.closest('.user-menu-container');
    if (!trigger) return;
    showUserMenu(event);
  });

  // Expose functions globally
  window.showUserMenu = showUserMenu;
  window.handleLogout = handleLogout;
})();
