// @ts-nocheck
/* global DOMParser */
// Lightweight client-side navigation to avoid repainting shared chrome
(() => {
  const SUPPORTED_PATHS = ['/', '/logs', '/teams'];
  const PAGE_SCRIPTS = {
    '/': [{ src: '/js/index.js', type: 'module' }],
    '/logs': [{ src: '/js/event-log.js' }],
    '/teams': [{ src: '/js/teams.js', type: 'module' }]
  };

  const loadedScripts = new Set(
    Array.from(document.querySelectorAll('script[src]')).map((script) => {
      try {
        return new URL(script.src, window.location.href).pathname;
      } catch (_e) {
        return script.src;
      }
    })
  );

  let isNavigating = false;

  function getPath(href) {
    try {
      return new URL(href, window.location.href).pathname;
    } catch (_e) {
      return href;
    }
  }

  function updateActiveLink(targetPath) {
    document.querySelectorAll('.top-nav-link').forEach((link) => {
      const linkPath = getPath(link.getAttribute('href'));
      if (linkPath === targetPath) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  async function ensurePageScripts(targetPath) {
    const scripts = PAGE_SCRIPTS[targetPath] || [];
    for (const entry of scripts) {
      const src = typeof entry === 'string' ? entry : entry.src;
      const type = typeof entry === 'object' ? entry.type : undefined;

      if (loadedScripts.has(src)) {
        continue;
      }
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        if (type) {
          script.type = type;
        }
        script.async = true;
        script.onload = () => {
          loadedScripts.add(src);
          resolve();
        };
        script.onerror = (err) => reject(err);
        document.body.appendChild(script);
      });
    }
  }

  // Provide a lightweight notification toggle when the page-specific script
  // (event-log.js) is not loaded. This keeps the nav button functional on all
  // pages without interfering with the richer implementation on /logs.
  if (typeof window.toggleNotificationMode !== 'function') {
    let globalNotificationModeEnabled = false;

    const ensureNotificationButtonState = () => {
      const button = document.querySelector('.notification-toggle');
      if (!button) {
        return;
      }

      if (!button.querySelector('.notification-bell-icon')) {
        button.innerHTML = `
          <svg class="notification-bell-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
        `;
      }

      const bellIcon = button.querySelector('.notification-bell-icon');
      button.classList.toggle('active', globalNotificationModeEnabled);
      button.setAttribute('title', globalNotificationModeEnabled ? 'Disable notifications' : 'Enable notifications');
      if (bellIcon) {
        if (globalNotificationModeEnabled) {
          bellIcon.classList.add('tilted');
        } else {
          bellIcon.classList.remove('tilted');
        }
      }
    };

    window.updateNotificationButtonState = function updateNotificationButtonState() {
      ensureNotificationButtonState();
    };

    window.toggleNotificationMode = async function toggleNotificationMode() {
      if (!('Notification' in window)) {
        alert('Your browser does not support desktop notifications.');
        return;
      }

      let permission = Notification.permission;
      if (permission === 'default') {
        try {
          permission = await Notification.requestPermission();
        } catch (_e) {
          permission = 'denied';
        }
      }

      if (permission !== 'granted') {
        alert('You must allow browser notifications to enable this mode.');
        return;
      }

      globalNotificationModeEnabled = !globalNotificationModeEnabled;
      ensureNotificationButtonState();
    };
  }

  function syncShellFromDocument(doc) {
    const currentNavActions = document.querySelector('.top-nav-actions');
    const nextNavActions = doc.querySelector('.top-nav-actions');
    if (currentNavActions && nextNavActions) {
      const cloned = nextNavActions.cloneNode(true);
      currentNavActions.replaceWith(cloned);
    }

    const currentNavSearch = document.querySelector('.top-nav-search');
    const nextNavSearch = doc.querySelector('.top-nav-search');
    if (currentNavSearch && nextNavSearch) {
      const cloned = nextNavSearch.cloneNode(true);
      currentNavSearch.replaceWith(cloned);
    }

    const currentMainContainer = document.querySelector('.main-container');
    const nextMainContainer = doc.querySelector('.main-container');
    if (currentMainContainer && nextMainContainer) {
      // Preserve shell sizing/styling by swapping class list while keeping node
      currentMainContainer.className = nextMainContainer.className;
      currentMainContainer.style.cssText = nextMainContainer.style.cssText;
    }
  }

  async function softNavigate(targetPath, { replace = false } = {}) {
    if (isNavigating) {
      return;
    }
    if (window.location.pathname === targetPath && !replace) {
      return;
    }
    if (!SUPPORTED_PATHS.includes(targetPath)) {
      window.location.href = targetPath;
      return;
    }

    const container = document.querySelector('.container-content');
    if (!container) {
      window.location.href = targetPath;
      return;
    }

    isNavigating = true;
    document.body.classList.add('soft-nav-loading');

    try {
      const response = await fetch(targetPath, {
        headers: { 'X-Requested-With': 'soft-nav' },
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`Navigation failed with status ${response.status}`);
      }

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const nextContent = doc.querySelector('.container-content');

      if (!nextContent) {
        throw new Error('Target page missing container-content');
      }

      // Keep nav, search, and container shell styling consistent across pages
      syncShellFromDocument(doc);

      // Match current padding so the overlayed content keeps the same inset during crossfade
      const containerStyle = window.getComputedStyle(container);
      ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach((prop) => {
        nextContent.style[prop] = containerStyle[prop];
      });

      // Prepare new content for crossfade: start invisible and position it
      nextContent.style.opacity = '0';
      nextContent.style.position = 'absolute';
      nextContent.style.inset = '0';

      // (not strictly necessary because we re-query each time)

      // Sync body class and title for page-specific styles
      document.body.className = doc.body.className || document.body.className;
      if (doc.title) {
        document.title = doc.title;
      }

      // Sync container classes for page-specific styles (e.g., main-container for event-log page)
      const currentContainer = document.querySelector('.container, .main-container');
      const nextContainer = doc.querySelector('.container, .main-container');
      if (currentContainer && nextContainer) {
        currentContainer.className = nextContainer.className;
      }

      updateActiveLink(targetPath);
      await ensurePageScripts(targetPath);

      // Trigger reflow to ensure opacity:0 is applied before transition
      void nextContent.offsetHeight;

      // Start crossfade: fade out old, fade in new
      container.style.transition = `opacity ${TRANSITION_DURATION_MS}ms ease-out`;
      container.style.opacity = '0';
      nextContent.style.transition = `opacity ${TRANSITION_DURATION_MS}ms ease-in`;
      nextContent.style.opacity = '1';

      // Wait for transition to complete
      await new Promise((resolve) => setTimeout(resolve, TRANSITION_DURATION_MS));

      // Remove old content and reset positioning on new content
      container.remove();
      nextContent.style.position = '';
      nextContent.style.inset = '';
      nextContent.style.transition = '';
      nextContent.style.opacity = '';
      nextContent.style.paddingTop = '';
      nextContent.style.paddingRight = '';
      nextContent.style.paddingBottom = '';
      nextContent.style.paddingLeft = '';

      // Notify pages that a soft navigation completed so they can rehydrate
      window.dispatchEvent(new CustomEvent('softNav:pageMounted', { detail: { path: targetPath } }));

      if (replace) {
        window.history.replaceState({ softNav: true }, '', targetPath);
      } else {
        window.history.pushState({ softNav: true }, '', targetPath);
      }
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (error) {
      console.error('Soft navigation failed, falling back to full load:', error);
      window.location.href = targetPath;
    } finally {
      document.body.classList.remove('soft-nav-loading');
      isNavigating = false;
    }
  }

  function handleNavClick(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
      return;
    }
    const link = event.currentTarget;
    const targetPath = getPath(link.getAttribute('href'));
    if (!SUPPORTED_PATHS.includes(targetPath)) {
      return;
    }
    event.preventDefault();
    softNavigate(targetPath);
  }

  function initNav() {
    const navLinks = document.querySelectorAll('.top-nav-link');
    navLinks.forEach((link) => {
      const targetPath = getPath(link.getAttribute('href'));
      if (SUPPORTED_PATHS.includes(targetPath)) {
        link.addEventListener('click', handleNavClick);
      }
    });
    window.history.replaceState({ softNav: true }, '', window.location.pathname);
    window.addEventListener('popstate', () => {
      softNavigate(window.location.pathname, { replace: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }
})();
