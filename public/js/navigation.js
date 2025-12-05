// @ts-nocheck
/* global DOMParser */
// Lightweight client-side navigation to avoid repainting shared chrome
(() => {
  const SUPPORTED_PATHS = ['/', '/event-log'];
  const PAGE_SCRIPTS = {
    '/': [{ src: '/js/index.js', type: 'module' }],
    '/event-log': [{ src: '/js/event-log.js' }]
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

      container.replaceWith(nextContent);
      // Keep container reference updated for future navigations

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
