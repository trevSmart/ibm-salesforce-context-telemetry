// @ts-nocheck
/* global DOMParser */
// Lightweight client-side navigation to avoid repainting shared chrome
(() => {
	const SUPPORTED_PATHS = ['/', '/logs', '/teams'];
	const EVENT_LOG_JS_SRC = '/js/event-log.js?v=20251217';
	const SOFT_NAV_SELECTOR = [
		'a.top-nav-link',
		'a.top-nav-logo',
		'a.back-link',
		'a[data-soft-nav="true"]',
		'a[data-soft-nav]'
	].join(',');
	const PAGE_SCRIPTS = {
		'/': [{ src: '/js/index.js', type: 'module' }],
		'/logs': [{ src: EVENT_LOG_JS_SRC }],
		'/teams': [{ src: '/js/teams.js', type: 'module' }]
	};

	// Crossfade transition duration in milliseconds
	const TRANSITION_DURATION_MS = 150;

	const domParser = new DOMParser();
	const pageCache = new Map();
	const containerCache = new Map(); // Cache for DOM container nodes per path
	const dataCache = new Map(); // Cache for API data between navigation
	const normalizeSrc = (src) => {
		try {
			const url = new URL(src, window.location.href);
			return `${url.pathname}${url.search}`;
		} catch (_e) {
			return src;
		}
	};

	const loadedScripts = new Set(
		Array.from(document.querySelectorAll('script[src]')).map((script) => normalizeSrc(script.src))
	);

	let isNavigating = false;

	// Data cache management functions
	function getCachedData(key) {
		const cached = dataCache.get(key);
		if (cached && Date.now() - cached.timestamp < 300000) { // 5 minutes cache
			return cached.data;
		}
		dataCache.delete(key);
		return null;
	}

	function setCachedData(key, data) {
		dataCache.set(key, {
			data: data,
			timestamp: Date.now()
		});
	}

	function clearDataCache() {
		dataCache.clear();
	}

	// Expose cache functions globally
	window.getCachedData = getCachedData;
	window.setCachedData = setCachedData;
	window.clearDataCache = clearDataCache;

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

	function isModifiedClick(event) {
		return (
			event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.button !== 0
		);
	}

	function resolveSoftNavTarget(event) {
		const link = event.target.closest(SOFT_NAV_SELECTOR);
		if (!link) {
			return null;
		}
		if (link.hasAttribute('download')) {
			return null;
		}
		if (link.target && link.target !== '_self') {
			return null;
		}
		const href = link.getAttribute('href');
		if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
			return null;
		}
		const targetPath = getPath(href);
		if (!SUPPORTED_PATHS.includes(targetPath)) {
			return null;
		}
		return targetPath;
	}

	async function ensurePageScripts(targetPath) {
		const scripts = PAGE_SCRIPTS[targetPath] || [];
		for (const entry of scripts) {
			const src = typeof entry === 'string' ? entry : entry.src;
			const type = typeof entry === 'object' ? entry.type : undefined;
			const normalizedSrc = normalizeSrc(src);

			if (loadedScripts.has(normalizedSrc)) {
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
					loadedScripts.add(normalizedSrc);
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

	function primeInitialCache() {
		if (pageCache.has(window.location.pathname)) {
			return;
		}
		try {
			pageCache.set(window.location.pathname, document.documentElement.outerHTML);
		} catch (_e) {
			// Swallow caching errors; navigation will still work without cache
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
		const containerParent = container.parentNode;

		try {
			const currentPath = window.location.pathname;

			// Notify current page to pause intervals/listeners before caching
			window.dispatchEvent(new CustomEvent('softNav:pagePausing', { detail: { path: currentPath } }));

			// Cache the current container before removing it
			if (currentPath && SUPPORTED_PATHS.includes(currentPath)) {
				containerCache.set(currentPath, container.cloneNode(true));
			}

			let nextContent;
			let doc = null;
			const cachedContainer = containerCache.get(targetPath);

			if (cachedContainer) {
				// Restore from cache - no need to fetch
				nextContent = cachedContainer.cloneNode(true);
				containerCache.delete(targetPath); // Remove from cache to avoid stale references
			} else {
				// Fetch new content
				let html;

				if (pageCache.has(targetPath)) {
					html = pageCache.get(targetPath);
				} else {
					const response = await fetch(targetPath, {
						headers: { 'X-Requested-With': 'soft-nav' },
						credentials: 'include'
					});
					if (!response.ok) {
						throw new Error(`Navigation failed with status ${response.status}`);
					}

					html = await response.text();
					pageCache.set(targetPath, html);
				}
				doc = domParser.parseFromString(html, 'text/html');
				nextContent = doc.querySelector('.container-content');

				if (!nextContent) {
					throw new Error('Target page missing container-content');
				}

				// Keep nav, search, and container shell styling consistent across pages
				syncShellFromDocument(doc);

				// Sync body class and title for page-specific styles (strip hydrating)
				const nextBodyClasses = doc.body?.classList ? Array.from(doc.body.classList) : [];
				const filteredBodyClasses = nextBodyClasses.filter((cls) => cls !== 'hydrating');
				if (filteredBodyClasses.length > 0) {
					document.body.className = filteredBodyClasses.join(' ');
				} else if (document.body.classList.contains('hydrating')) {
					document.body.classList.remove('hydrating');
				}
				if (doc.title) {
					document.title = doc.title;
				}

				// Sync container classes for page-specific styles (e.g., main-container for event-log page)
				const currentContainer = document.querySelector('.container, .main-container');
				const nextContainer = doc.querySelector('.container, .main-container');
				if (currentContainer && nextContainer) {
					currentContainer.className = nextContainer.className;
				}
			}

			// Match current padding so the overlayed content keeps the same inset during crossfade
			const containerStyle = window.getComputedStyle(container);
			['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach((prop) => {
				nextContent.style[prop] = containerStyle[prop];
			});

			// Overlay the incoming content exactly where the outgoing one sits to avoid visual mixing
			if (containerParent) {
				const parentRect = containerParent.getBoundingClientRect();
				const containerRect = container.getBoundingClientRect();

				if (window.getComputedStyle(containerParent).position === 'static') {
					containerParent.style.position = 'relative';
				}

				nextContent.style.position = 'absolute';
				nextContent.style.top = `${containerRect.top - parentRect.top}px`;
				nextContent.style.left = `${containerRect.left - parentRect.left}px`;
				nextContent.style.width = `${containerRect.width}px`;
				nextContent.style.height = `${containerRect.height}px`;
				nextContent.style.zIndex = '1';
			}
			nextContent.style.opacity = '0';
			nextContent.style.pointerEvents = 'none';

			// Insert new content after current content (both will be visible briefly)
			containerParent.style.position = 'relative';
			container.after(nextContent);

			updateActiveLink(targetPath);
			await ensurePageScripts(targetPath);

			// Trigger reflow to ensure opacity:0 is applied before transition
			void nextContent.offsetHeight;

			// Start crossfade: fade out old, fade in new
			container.style.transition = `opacity ${TRANSITION_DURATION_MS}ms ease-out`;
			container.style.pointerEvents = 'none';
			container.style.opacity = '0';
			nextContent.style.transition = `opacity ${TRANSITION_DURATION_MS}ms ease-in`;
			nextContent.style.opacity = '1';
			nextContent.style.pointerEvents = 'auto';

			// Wait for transition to complete
			await new Promise((resolve) => setTimeout(resolve, TRANSITION_DURATION_MS));

			// Remove old content and reset positioning on new content
			container.remove();
			nextContent.style.position = '';
			nextContent.style.top = '';
			nextContent.style.left = '';
			nextContent.style.width = '';
			nextContent.style.height = '';
			nextContent.style.inset = '';
			nextContent.style.transition = '';
			nextContent.style.opacity = '';
			nextContent.style.zIndex = '';
			nextContent.style.paddingTop = '';
			nextContent.style.paddingRight = '';
			nextContent.style.paddingBottom = '';
			nextContent.style.paddingLeft = '';
			nextContent.style.pointerEvents = '';

			// Notify pages that a soft navigation completed so they can resume
			window.dispatchEvent(new CustomEvent('softNav:pageMounted', { detail: { path: targetPath, fromCache: !!cachedContainer } }));

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
			isNavigating = false;
		}
	}

	function handleSoftNavClick(event) {
		if (isModifiedClick(event)) {
			return;
		}
		const targetPath = resolveSoftNavTarget(event);
		if (!targetPath) {
			return;
		}
		event.preventDefault();
		softNavigate(targetPath);
	}

	function initNav() {
		primeInitialCache();
		document.addEventListener('click', handleSoftNavClick);
		window.history.replaceState({ softNav: true }, '', window.location.pathname);
		window.addEventListener('popstate', () => {
			softNavigate(window.location.pathname, { replace: true });
		});
	}

	// Register Service Worker for modern caching
	function registerServiceWorker() {
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/sw.js', { scope: '/' })
				.then((registration) => {
					console.log('[SW] Registered successfully:', registration.scope);

					// Handle updates
					registration.addEventListener('updatefound', () => {
						const newWorker = registration.installing;
						if (newWorker) {
							newWorker.addEventListener('statechange', () => {
								if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
									// New version available
									console.log('[SW] New version available, notifying user');
									// You could show a notification to the user here
									newWorker.postMessage({ type: 'SKIP_WAITING' });
								}
							});
						}
					});
				})
				.catch((error) => {
					console.log('[SW] Registration failed:', error);
				});
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initNav);
	} else {
		initNav();
	}

	// Register Service Worker
	registerServiceWorker();
})();
