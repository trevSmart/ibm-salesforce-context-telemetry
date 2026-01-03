// @ts-nocheck
import {toggleTheme, applyTheme} from './theme.js';
import {timerRegistry} from './utils/timerRegistry.js';
import {
	mountSessionActivityChart,
	renderSessionActivityChart,
	cleanupSessionActivityChart,
	hideChart as hideSessionActivityCard,
	navigateToPreviousDay,
	navigateToNextDay,
	setSelectedActivityDate,
	resizeChart as resizeSessionActivityChart
} from './session-activity-chart.js';

// Prevent double execution when soft navigation re-injects the script
if (window.__EVENT_LOG_LOADED__) {
	console.info('[Telemetry Viewer] Event log script already loaded; skipping duplicate execution.');
} else {
	window.__EVENT_LOG_LOADED__ = true;

// Global data cache functions are now loaded from global-cache.js


// Safe wrapper for showToast function

function safeShowToast(message, type = 'info') {
	if (typeof window.showToast === 'function') {
		window.showToast(message, type);
	} else {
		console.warn('showToast not available, falling back to console:', message);
		console[type === 'error' ? 'error' : 'log'](message);
	}
}


// Utility to escape HTML special characters for safe output in innerHTML
	function escapeHtml(unsafe) {
		return String(unsafe)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	function getUserInitials(name) {
		if (!name) {
			return '?';
		}

		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (parts.length === 0) {
			return '?';
		}

		if (parts.length === 1) {
			const firstWord = parts[0];
			const initials = firstWord.slice(0, 2).toUpperCase();
			return initials || '?';
		}

		const first = parts[0]?.charAt(0) || '';
		const second = parts[1]?.charAt(0) || '';
		const initials = `${first}${second}`.toUpperCase();
		return initials || '?';
	}

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


	// Check authentication status on page load
	// Cache auth data to avoid redundant API calls
	let cachedAuthData = null;
	(async () => {
		try {
		// Check if we already have cached auth data from previous page loads
		if (window.__cachedAuthData && window.__cachedAuthData.authenticated) {
			cachedAuthData = window.__cachedAuthData;
				// Verify the cached data is still valid (basic check)
				if (cachedAuthData.role !== 'advanced' && cachedAuthData.role !== 'administrator' && cachedAuthData.role !== 'god') {
					window.location.href = '/';
					return;
				}
				// Ensure CSRF token is set
				if (cachedAuthData.csrfToken) {
					window.setCsrfToken(cachedAuthData.csrfToken);
				}
				return;
			}

			const response = await fetch('/api/auth/status', {
				credentials: 'include' // Ensure cookies are sent
			});
			const data = await response.json();
			if (!data.authenticated) {
				window.location.href = '/login';
				return;
			}
			if (data.role !== 'advanced' && data.role !== 'administrator' && data.role !== 'god') {
				window.location.href = '/';
				return;
			}
			// Store CSRF token
			window.setCsrfToken(data.csrfToken);
			// Cache auth data for reuse by other components
			cachedAuthData = data;
			window.__cachedAuthData = cachedAuthData;
		} catch (error) {
			console.error('Auth check failed:', error);
			window.location.href = '/login';
		}
	})();

	// User menu functions are now in user-menu.js
	const REFRESH_ICON_ANIMATION_DURATION_MS = 700;

	function ensureUserMenuStructure() {
		const userMenu = document.getElementById('userMenu');
		if (!userMenu || userMenu.dataset.initialized === 'true') {
			return;
		}

		const buildTemplate = window.buildUserMenuTemplate;
		if (typeof buildTemplate === 'function') {
			userMenu.innerHTML = buildTemplate();
			userMenu.dataset.initialized = 'true';
		}
	}


	// Settings modal moved to settings-modal.js


	// handleLogout is now in user-menu.js

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

	// Attach CSRF token to mutating requests
	function getCsrfHeaders(includeJson = false) {
		if (typeof window.getRequestHeaders === 'function') {
			return window.getRequestHeaders(includeJson);
		}

		const headers = includeJson ? {'Content-Type': 'application/json'} : {};
		if (typeof window.getCsrfTokenFromCookie === 'function') {
			const token = window.getCsrfTokenFromCookie();
			if (token) {
				headers['X-CSRF-Token'] = token;
			}
		}
		return headers;
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
		timerRegistry.setInterval('eventLog.lastUpdated', () => {
			updateLastUpdatedText();
		}, 60000); // Update every minute
	}

	let currentOffset = 0;
	let limit = 50;
	let hasMoreEvents = true;
	let isLoadingMore = false;
	let allLoadedEvents = []; // Accumulative array of all loaded events
	let selectedSession = 'all';
	let selectedTeamKey = null; // Lowercased team name acting as key
	let orgToTeamMap = new Map(); // org identifier -> team key
	let teamEventCounts = new Map(); // team key -> event count in current view
	let teamEventCountsSource = 'server'; // 'server' uses aggregated counters, 'local' uses paged events
	let activeFilters = new Set(['tool', 'session', 'general']);
	let selectedPersonIds = new Set(); // Will be populated with all people when loaded - all selected by default
	let allPersonIds = new Set(); // Track all available person IDs
	let selectedSessionsForDeletion = new Set(); // Track sessions selected for deletion
	let selectionMode = false; // Track if selection mode is active
	let lastSelectedSessionId = null; // Track last selected session for shift-click range selection
	let searchQuery = '';
	let sortOrder = 'DESC';
	let startTime = performance.now();
	let notificationModeEnabled = false;
	let autoRefreshEnabledState = false;
	const autoRefreshIntervalMinutes = '';
	let isRefreshInProgress = false;
	let lastKnownEventTimestamp = null;
	let lastFetchTime = null; // Track when events were last fetched
	let isInitialChartLoad = true; // Track if this is the initial chart load
	const knownSessionIds = new Set();
	const sessionDisplayMap = new Map();
	let lastSessionActivityEvents = []; // Track last events for hover preview and resume
	let activeTab = 'sessions'; // 'sessions' or 'people'
	const SESSION_ACTIVITY_FETCH_LIMIT = 1000;
	// State for hover preview functionality
	let isHoverPreviewActive = false;

	// Event listener references for cleanup
	let sessionListDelegationHandler = null;
	let peopleListDelegationHandler = null;
	let teamsListDelegationHandler = null;
	let tableRowDelegationHandler = null;

	function revealEventLogShell() {
		const body = document.body;
		if (body.classList.contains('hydrating')) {
			body.classList.remove('hydrating');
		}
		document.body.style.visibility = 'visible';
		const mainContainer = document.querySelector('.container');
		if (mainContainer) {
			mainContainer.style.visibility = 'visible';
			requestAnimationFrame(() => {
				mainContainer.style.opacity = '1';
			});
		}
	}
	const logChartTrace = (message, _details = {}) => {
		try {
			// Lightweight tracing to understand intermittent chart load issues
			// Tracing disabled in production
		} catch {
			// No-op: tracing should never break the UI
		}
	};

	let isResizingSidebar = false;
	let sidebarResizeStartX = 0;
	let sidebarResizeStartWidth = 0;
	let isResizingActivity = false;
	let activityResizeStartY = 0;
	let activityResizeStartHeight = 0;

	function resetEventLogState() {
		currentOffset = 0;
		limit = 50;
		hasMoreEvents = true;
		isLoadingMore = false;
		allLoadedEvents = [];
		selectedSession = 'all';
		activeFilters = new Set(['tool', 'session', 'general']);
		selectedPersonIds = new Set();
		allPersonIds = new Set();
		selectedSessionsForDeletion = new Set();
		selectionMode = false;
		lastSelectedSessionId = null;
		searchQuery = '';
		sortOrder = 'DESC';
		startTime = performance.now();
		notificationModeEnabled = false;
		timerRegistry.clearAll();
		lastKnownEventTimestamp = null;
		lastFetchTime = null;
		isInitialChartLoad = true;
		knownSessionIds.clear();
		sessionDisplayMap.clear();
		cleanupSessionActivityChart();
		lastSessionActivityEvents = [];
		activeTab = 'sessions';
		isHoverPreviewActive = false;
	}

	function initTheme() {
		// Theme initialization is now handled by the theme module in app.js
		// Wire up theme toggle if present
		const darkThemeToggle = document.querySelector('#darkThemeToggle');
		if (darkThemeToggle) {
			darkThemeToggle.addEventListener('change', () => {
				toggleTheme();
				refreshSessionActivityTheme();
			});
		}
	}



	function openConfirmModal({
		title,
		message,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		destructive = false,
		onConfirm,
		onCancel
	}) {
		return new Promise((resolve) => {
			const existing = document.querySelector('.confirm-dialog-backdrop');
			if (existing) {
				existing.remove();
			}

			const backdrop = document.createElement('div');
			backdrop.className = 'confirm-modal-backdrop confirm-dialog-backdrop';

			const modal = document.createElement('div');
			modal.className = 'confirm-modal confirm-dialog';
			modal.innerHTML = `
				<div class="confirm-dialog-header">
					${destructive ? `<div class="mx-auto flex size-12 shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:size-10">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" data-slot="icon" aria-hidden="true" class="size-6 text-red-600">
							<path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" stroke-linecap="round" stroke-linejoin="round"></path>
						</svg>
					</div>` : ''}
					<div>
						<div class="confirm-modal-title">${escapeHtml(title || 'Confirm action')}</div>
						<div>${escapeHtml(message || '')}</div>
					</div>
				</div>
				<div class="confirm-dialog-actions">
					<button type="button" class="btn">${escapeHtml(cancelLabel)}</button>
					<button type="button" class="btn ${destructive ? 'text-sm inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 font-semibold text-white shadow-xs hover:bg-red-500 sm:ml-3 sm:w-auto' : 'confirm-modal-btn-confirm'}">${escapeHtml(confirmLabel)}</button>
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

			const [cancelBtn, confirmBtn] = modal.querySelectorAll('.btn');
			const handleCancel = () => {
				if (typeof onCancel === 'function') {
					try {
						onCancel();
					} catch (error) {
						console.error('Confirm modal cancel handler failed:', error);
					}
				}
				animateAndResolve(false);
			};
			const handleConfirm = () => {
				if (typeof onConfirm === 'function') {
					try {
						onConfirm();
					} catch (error) {
						console.error('Confirm modal confirm handler failed:', error);
					}
				}
				animateAndResolve(true);
			};
			cancelBtn.addEventListener('click', handleCancel);
			confirmBtn.addEventListener('click', handleConfirm);

			backdrop.addEventListener('click', (e) => {
				if (e.target === backdrop) {
					handleCancel();
				}
			});

			document.addEventListener(
				'keydown',
				function handleKeydown(e) {
					if (e.key === 'Escape') {
						e.stopImmediatePropagation();
						e.preventDefault();
						document.removeEventListener('keydown', handleKeydown);
						if (document.body.contains(backdrop)) {
							handleCancel();
						}
					}
				}
			);
		});
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
			// Skip if listeners are already initialized
			if (btn.dataset.listenersInitialized === 'true') {
				return;
			}

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

			// Mark as initialized
			btn.dataset.listenersInitialized = 'true';

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

		// Skip if listeners are already initialized
		if (resizer.dataset.listenersInitialized === 'true') {
			return;
		}

		const handleResize = (clientX) => {
			const delta = clientX - sidebarResizeStartX;
			let newWidth = sidebarResizeStartWidth + delta;
			newWidth = Math.max(220, Math.min(500, newWidth));
			document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
		};

		// Pointer events preferred to avoid duplicate mouse/touch firing
		if (window.PointerEvent) {
			const onPointerMove = (event) => {
				if (!isResizingSidebar) {return;}
				handleResize(event.clientX);
			};
			const stopResize = (event) => {
				if (!isResizingSidebar) {
					return;
				}
				isResizingSidebar = false;
				document.body.classList.remove('sidebar-resizing');
				document.removeEventListener('pointermove', onPointerMove);
				document.removeEventListener('pointerup', stopResize);
				document.removeEventListener('pointercancel', stopResize);
				if (event?.pointerId !== undefined && typeof resizer.releasePointerCapture === 'function') {
					try {
						resizer.releasePointerCapture(event.pointerId);
					} catch {
						/* ignore */
					}
				}
			};
			const startResize = (event) => {
				isResizingSidebar = true;
				sidebarResizeStartX = event.clientX;
				sidebarResizeStartWidth = sidebar.offsetWidth;
				document.body.classList.add('sidebar-resizing');
				if (event.pointerId !== undefined && typeof resizer.setPointerCapture === 'function') {
					try {
						resizer.setPointerCapture(event.pointerId);
					} catch {
						/* ignore */
					}
				}
				document.addEventListener('pointermove', onPointerMove);
				document.addEventListener('pointerup', stopResize);
				document.addEventListener('pointercancel', stopResize);
				event.preventDefault();
			};
			resizer.addEventListener('pointerdown', startResize);
		} else {
			// Fallback for older browsers: mouse + touch
			const onMouseMove = (event) => {
				if (!isResizingSidebar) {return;}
				handleResize(event.clientX);
			};
			const onTouchMove = (event) => {
				if (!isResizingSidebar || !event.touches?.length) {return;}
				handleResize(event.touches[0].clientX);
			};
			const stopResize = () => {
				if (!isResizingSidebar) {
					return;
				}
				isResizingSidebar = false;
				document.body.classList.remove('sidebar-resizing');
				document.removeEventListener('mousemove', onMouseMove);
				document.removeEventListener('mouseup', stopResize);
				document.removeEventListener('touchmove', onTouchMove);
				document.removeEventListener('touchend', stopResize);
				document.removeEventListener('touchcancel', stopResize);
			};
			const startResize = (event) => {
				const point = event.touches ? event.touches[0] : event;
				isResizingSidebar = true;
				sidebarResizeStartX = point.clientX;
				sidebarResizeStartWidth = sidebar.offsetWidth;
				document.body.classList.add('sidebar-resizing');
				document.addEventListener('mousemove', onMouseMove);
				document.addEventListener('mouseup', stopResize);
				document.addEventListener('touchmove', onTouchMove, {passive: false});
				document.addEventListener('touchend', stopResize);
				document.addEventListener('touchcancel', stopResize);
				event.preventDefault();
			};
			resizer.addEventListener('mousedown', startResize);
			resizer.addEventListener('touchstart', startResize, {passive: false});
		}

		// Mark as initialized
		resizer.dataset.listenersInitialized = 'true';
	}

	function setupHorizontalResizer() {
		const resizer = document.getElementById('horizontalResizer');
		const activityCard = document.getElementById('sessionActivityCard');
		if (!resizer || !activityCard) {
			// Elements not found - this might be because the page isn't fully loaded yet
			// Defer setup until DOM is ready
			if (document.readyState === 'loading') {
				window.addEventListener('DOMContentLoaded', () => {
					requestAnimationFrame(() => setupHorizontalResizer());
				});
			} else {
				console.warn('Horizontal resizer: resizer or activityCard not found after DOM ready', {resizer, activityCard});
			}
			return;
		}

		// Skip if listeners are already initialized
		if (resizer.dataset.listenersInitialized === 'true') {
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
		observer.observe(activityCard, {attributes: true, attributeFilter: ['class']});
		updateResizerVisibility();

		const resizeActivityCard = (clientY) => {
			const delta = clientY - activityResizeStartY;
			let newHeight = activityResizeStartHeight + delta;
			newHeight = Math.max(190, Math.min(600, newHeight));
			activityCard.style.height = `${newHeight}px`;
			resizeSessionActivityChart();
		};

		if (window.PointerEvent) {
			const onPointerMove = (event) => {
				if (!isResizingActivity) {return;}
				resizeActivityCard(event.clientY);
			};
			const stopResize = (event) => {
				if (!isResizingActivity) {
					return;
				}
				isResizingActivity = false;
				document.body.classList.remove('activity-resizing');
				document.removeEventListener('pointermove', onPointerMove);
				document.removeEventListener('pointerup', stopResize);
				document.removeEventListener('pointercancel', stopResize);
				if (event?.pointerId !== undefined && typeof resizer.releasePointerCapture === 'function') {
					try {
						resizer.releasePointerCapture(event.pointerId);
					} catch {
						/* ignore */
					}
				}
				setTimeout(() => {
					resizeSessionActivityChart();
				}, 0);
			};
			const startResize = (event) => {
				isResizingActivity = true;
				activityResizeStartY = event.clientY;
				activityResizeStartHeight = activityCard.offsetHeight;
				document.body.classList.add('activity-resizing');
				if (event.pointerId !== undefined && typeof resizer.setPointerCapture === 'function') {
					try {
						resizer.setPointerCapture(event.pointerId);
					} catch {
						/* ignore */
					}
				}
				document.addEventListener('pointermove', onPointerMove);
				document.addEventListener('pointerup', stopResize);
				document.addEventListener('pointercancel', stopResize);
				event.preventDefault();
			};
			resizer.addEventListener('pointerdown', startResize);
		} else {
			const onMouseMove = (event) => {
				if (!isResizingActivity) {return;}
				resizeActivityCard(event.clientY);
			};
			const onTouchMove = (event) => {
				if (!isResizingActivity || !event.touches?.length) {return;}
				resizeActivityCard(event.touches[0].clientY);
			};
			const stopResize = () => {
				if (!isResizingActivity) {
					return;
				}
				isResizingActivity = false;
				document.body.classList.remove('activity-resizing');
				document.removeEventListener('mousemove', onMouseMove);
				document.removeEventListener('mouseup', stopResize);
				document.removeEventListener('touchmove', onTouchMove);
				document.removeEventListener('touchend', stopResize);
				document.removeEventListener('touchcancel', stopResize);
				setTimeout(() => {
					resizeSessionActivityChart();
				}, 0);
			};
			const startResize = (event) => {
				const point = event.touches ? event.touches[0] : event;
				isResizingActivity = true;
				activityResizeStartY = point.clientY;
				activityResizeStartHeight = activityCard.offsetHeight;
				document.body.classList.add('activity-resizing');
				document.addEventListener('mousemove', onMouseMove);
				document.addEventListener('mouseup', stopResize);
				document.addEventListener('touchmove', onTouchMove, {passive: false});
				document.addEventListener('touchend', stopResize);
				document.addEventListener('touchcancel', stopResize);
				event.preventDefault();
			};
			resizer.addEventListener('mousedown', startResize);
			resizer.addEventListener('touchstart', startResize, {passive: false});
		}

		// Mark as initialized
		resizer.dataset.listenersInitialized = 'true';
	}

	async function fetchAllSessionsActivityEvents() {
		const params = new URLSearchParams({
			limit: SESSION_ACTIVITY_FETCH_LIMIT.toString(),
			orderBy: 'created_at',
			order: 'ASC'
		});

		const fetchUrl = `/api/events?${params}`;
		logChartTrace('fetchAllSessionsActivityEvents: requesting', {url: fetchUrl});
		try {
			const response = await fetch(fetchUrl, {
				credentials: 'include' // Ensure cookies are sent
			});
			const validResponse = await handleApiResponse(response);
			if (!validResponse) {return [];}
			const data = await validResponse.json();
			logChartTrace('fetchAllSessionsActivityEvents: response', {
				url: fetchUrl,
				status: response.status,
				eventCount: Array.isArray(data.events) ? data.events.length : 0
			});
			return Array.isArray(data.events) ? data.events : [];
		} catch (error) {
			logChartTrace('fetchAllSessionsActivityEvents: fetch failed', {
				url: fetchUrl,
				online: navigator.onLine,
				message: error?.message
			});
			throw error;
		}
	}

	// Save current chart state for hover preview restoration


	// Handle hover preview for session buttons

	async function updateSessionActivityChart(options = {}) {
		const eventsOverride = Array.isArray(options.events) ? options.events : null;
		const targetSession = typeof options.sessionId !== 'undefined' ? options.sessionId : selectedSession;
		logChartTrace('updateSessionActivityChart: start', {
			targetSession,
			hasEventsOverride: Boolean(eventsOverride),
			eventsOverrideCount: eventsOverride ? eventsOverride.length : 0
		});

		if (eventsOverride && eventsOverride.length > 0) {
			logChartTrace('updateSessionActivityChart: using provided events', {count: eventsOverride.length, targetSession});
			lastSessionActivityEvents = eventsOverride.slice();
			renderSessionActivityChart(eventsOverride, {sessionId: targetSession, sessionDisplayMap});
			return;
		}

		if (targetSession === 'all') {
			try {
				const allEvents = await fetchAllSessionsActivityEvents();
				logChartTrace('updateSessionActivityChart: fetched all sessions activity', {
					count: allEvents.length
				});
				if (allEvents.length === 0) {
					hideSessionActivityCard();
					lastSessionActivityEvents = [];
					// If this is the initial load and there are no events, show the page anyway
					if (isInitialChartLoad) {
						isInitialChartLoad = false;
						revealEventLogShell();
					}
					return;
				}
				lastSessionActivityEvents = allEvents.slice();
				renderSessionActivityChart(allEvents, {sessionId: 'all', sessionDisplayMap});
			} catch (error) {
				handleInitializationError('all sessions activity chart', error);
				hideSessionActivityCard();
				// If this is the initial load and there's an error, show the page anyway
				if (isInitialChartLoad) {
					isInitialChartLoad = false;
					revealEventLogShell();
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
			logChartTrace('updateSessionActivityChart: fetching session activity', {
				targetSession,
				params: params.toString()
			});
			const response = await fetch(`/api/events?${params}`);
			const validResponse = await handleApiResponse(response);
			if (!validResponse) {
				// If this is the initial load and response is invalid, show the page anyway
				if (isInitialChartLoad) {
					isInitialChartLoad = false;
					revealEventLogShell();
				}
				return;
			}
			const data = await validResponse.json();
			logChartTrace('updateSessionActivityChart: fetch result', {
				targetSession,
				eventCount: data.events ? data.events.length : 0
			});
			if (!data.events || data.events.length === 0) {
				hideSessionActivityCard();
				lastSessionActivityEvents = [];
				// If this is the initial load and there are no events, show the page anyway
				if (isInitialChartLoad) {
					isInitialChartLoad = false;
					revealEventLogShell();
				}
				return;
			}
			lastSessionActivityEvents = data.events.slice();
			renderSessionActivityChart(data.events, {sessionId: targetSession, sessionDisplayMap});
		} catch (error) {
			console.error('Error loading session activity chart:', error);
			logChartTrace('updateSessionActivityChart: error', {
				targetSession,
				message: error?.message
			});
			hideSessionActivityCard();
			// If this is the initial load and there's an error, show the page anyway
			if (isInitialChartLoad) {
				isInitialChartLoad = false;
				revealEventLogShell();
			}
		}
	}

	function refreshSessionActivityTheme() {
		// Chart theme refresh is now handled by the session-activity-chart module
		if (lastSessionActivityEvents.length > 0) {
			renderSessionActivityChart(lastSessionActivityEvents, {
				sessionId: selectedSession,
				sessionDisplayMap
			});
		}
	}

	// Helper functions

	function showGlobalError(message) {
		const formattedMessage = typeof message === 'string'? message: (message?.message || 'Unexpected error');
		if (formattedMessage) {
			safeShowToast(formattedMessage, 'error');
		}
	}

	function handleInitializationError(context, error) {
		const details = error?.message || error || 'Unknown error';
		console.error(`Initialization error (${context}):`, error);
		logChartTrace('handleInitializationError', {
			context,
			message: details,
			online: navigator.onLine
		});
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

	function formatSessionDisplay(session) {
		const fallbackId = session?.session_id || 'Unknown session';
		const fallbackShort = fallbackId.length > 12 ? `${fallbackId.substring(0, 12)}...` : fallbackId;
		const fallbackHtml = `<span class="session-date">${escapeHtml(fallbackShort)}</span>`;

		if (!session || !session.first_event) {
			return {html: fallbackHtml, text: fallbackShort};
		}

		const parsedDate = new Date(session.first_event);
		if (Number.isNaN(parsedDate.getTime())) {
			return {html: fallbackHtml, text: fallbackShort};
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
			return {html: dateHtml, text: dateStr};
		}

		const separatorHtml = '<span class="session-separator"><i class="fa-solid fa-circle"></i></span>';
		const userHtml = `<span class="session-user">${escapeHtml(userText)}</span>`;
		return {html: `${dateHtml}${separatorHtml}${userHtml}`, text: `${dateStr} • ${userText}`};
	}

	async function loadEventTypeStats(sessionId = null) {
		try {
			const params = new URLSearchParams();
			if (sessionId && sessionId !== 'all') {
				params.append('sessionId', sessionId);
			}
			// Apply user filters
			// If people haven't been loaded yet (allPersonIds.size === 0), don't filter (show all)
			// If no people are selected after loading, send a special marker to return no stats
			// If all people are selected, don't filter (show all)
			// If some people are selected, filter by those people
			if (allPersonIds.size === 0) {
				// Users not loaded yet - don't filter (show all stats)
				// Don't add any userId param
			} else if (selectedPersonIds.size === 0) {
				// No people selected - send special marker to return no stats
				params.append('userId', '__none__');
			} else if (selectedPersonIds.size > 0 && selectedPersonIds.size < allPersonIds.size) {
				// Some people selected - filter by those people
				Array.from(selectedPersonIds).forEach(userId => {
					params.append('userId', userId);
				});
			}
			// If all people are selected (selectedPersonIds.size === allPersonIds.size), don't add any userId param
			const queryString = params.toString();

			// Check if we have fresh cached event types data and no filters applied
		let stats;
		if (window.isCacheFresh('eventTypes') && queryString === '') {
			stats = window.__globalDataCache.eventTypes;
			} else {
				const url = queryString ? `/api/event-types?${queryString}` : '/api/event-types';
				const response = await fetch(url, {
					credentials: 'include' // Ensure cookies are sent
				});
				const validResponse = await handleApiResponse(response);
				if (!validResponse) {return;}
				stats = await validResponse.json();

				// Cache the data if no filters were applied
				if (queryString === '') {
					window.updateCache('eventTypes', stats);
				}
			}

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

	/**
	 * Setup event delegation for session list
	 * This adds ONE listener to the parent instead of many to children
	 */
	function setupSessionListDelegation() {
		const sessionList = document.getElementById('sessionList');
		if (!sessionList) {
			return;
		}

		// Remove old listener if it exists
		if (sessionListDelegationHandler) {
			sessionList.removeEventListener('click', sessionListDelegationHandler);
		}

		// Create delegation handler
		sessionListDelegationHandler = (e) => {
			const sessionItem = e.target.closest('.session-item');
			if (!sessionItem) {
				return;
			}

			const sessionId = sessionItem.getAttribute('data-session');
			if (!sessionId) {
				return;
			}

			// Handle checkbox clicks
			if (e.target.closest('.session-checkbox')) {
				e.stopPropagation();
				toggleSessionSelection(sessionId, e);
				return;
			}

			// Handle actions button clicks
			if (e.target.closest('.actions-btn')) {
				e.stopPropagation();
				toggleSessionActionsDropdown(e, sessionId);
				return;
			}

			// Handle delete button clicks
			if (e.target.closest('.actions-dropdown-item.delete')) {
				e.stopPropagation();
				confirmDeleteSession(sessionId);
				return;
			}

			// Handle session item clicks (don't activate if clicking on actions or checkbox)
			if (e.target.closest('.session-item-actions') || e.target.closest('.session-checkbox')) {
				return;
			}

			// Cancel hover preview when clicking
			if (isHoverPreviewActive) {
				isHoverPreviewActive = false;
			}

			// If in selection mode, toggle selection for deletion instead of viewing
			if (selectionMode) {
				toggleSessionSelection(sessionId, e);
				return;
			}

			// If Ctrl/Cmd is pressed and not in selection mode, enter selection mode and select this session
			if ((e.ctrlKey || e.metaKey) && !selectionMode) {
				toggleSelectionMode();
				// Small delay to ensure selection mode is active
				setTimeout(() => {
					toggleSessionSelection(sessionId, e);
				}, 0);
				return;
			}

			// Avoid flickering if clicking on the same session that's already selected
			if (selectedSession === sessionId && sessionItem.classList.contains('active')) {
				return;
			}

			document.querySelectorAll('.session-item').forEach(i => i.classList.remove('active'));
			sessionItem.classList.add('active');
			selectedSession = sessionId;

			// Find session data to get dates
			const session = Array.from(document.querySelectorAll('.session-item'))
				.find(el => el.getAttribute('data-session') === sessionId);
			const sessionDay = session?.dataset?.lastEvent || session?.dataset?.firstEvent || null;
			const parsedSessionDate = sessionDay ? new Date(sessionDay) : null;

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
		};

		// Add the delegation listener
		sessionList.addEventListener('click', sessionListDelegationHandler);
	}

	/**
	 * Setup event delegation for people list
	 */
	function setupPeopleListDelegation() {
		const peopleList = document.getElementById('peopleList');
		if (!peopleList) {
			return;
		}

		// Remove old listener if it exists
		if (peopleListDelegationHandler) {
			peopleList.removeEventListener('click', peopleListDelegationHandler);
		}

		// Create delegation handler
		peopleListDelegationHandler = (e) => {
			const userItem = e.target.closest('.session-item[data-user]');
			if (!userItem) {
				return;
			}

			const userId = userItem.getAttribute('data-user');
			if (!userId) {
				return;
			}

			// Avoid flickering if clicking on the same user that's already selected
			if (selectedPersonIds.has(userId) && selectedPersonIds.size === 1) {
				return;
			}

			// Select only this user
			selectedPersonIds.clear();
			selectedPersonIds.add(userId);

			// Update UI to reflect selection
			document.querySelectorAll('.session-item[data-user]').forEach(i => i.classList.remove('active'));
			userItem.classList.add('active');

			// Switch to sessions tab and reload
			switchTab('sessions');
			loadSessions();
			loadEvents();
			loadEventTypeStats(selectedSession);
		};

		// Add the delegation listener
		peopleList.addEventListener('click', peopleListDelegationHandler);
	}

	/**
	 * Setup event delegation for teams list
	 */
	function setupTeamsListDelegation() {
		const teamList = document.getElementById('teamList');
		if (!teamList) {
			return;
		}

		// Remove old listener if it exists
		if (teamsListDelegationHandler) {
			teamList.removeEventListener('click', teamsListDelegationHandler);
		}

		// Create delegation handler
		teamsListDelegationHandler = (e) => {
			const teamItem = e.target.closest('.session-item[data-team-key]');
			if (!teamItem) {
				return;
			}

			const teamKey = teamItem.dataset.teamKey;
			if (!teamKey) {
				return;
			}

			const isSelectingSame = selectedTeamKey === teamKey;
			selectedTeamKey = isSelectingSame ? null : teamKey;

			document.querySelectorAll('#teamList .session-item').forEach((item) => {
				item.classList.toggle('active', item.dataset.teamKey === selectedTeamKey);
			});

			switchTab('teams');
			currentOffset = 0;
			loadEvents();
			loadEventTypeStats(selectedSession);
		};

		// Add the delegation listener
		teamList.addEventListener('click', teamsListDelegationHandler);
	}

	/**
	 * Setup event delegation for table rows
	 */
	function setupTableRowDelegation() {
		const logsTableScroll = document.getElementById('logsTableScroll');
		if (!logsTableScroll) {
			return;
		}

		// Remove old listener if it exists
		if (tableRowDelegationHandler) {
			logsTableScroll.removeEventListener('click', tableRowDelegationHandler);
		}

		// Create delegation handler for table rows
		tableRowDelegationHandler = (evt) => {
			// Find the closest tr with data-event-id
			const row = evt.target.closest('tr[data-event-id]');
			if (!row) {
				return;
			}

			// Don't expand if clicking on actions button, dropdown, or expand button
			if (evt.target.closest('.actions-btn') ||
			    evt.target.closest('.actions-dropdown') ||
			    evt.target.closest('.expand-btn')) {
				return;
			}

			const eventId = row.getAttribute('data-event-id');
			if (eventId) {
				toggleRowExpand(Number.parseInt(eventId, 10)).catch(console.error);
			}
		};

		// Add the delegation listener
		logsTableScroll.addEventListener('click', tableRowDelegationHandler);
	}

	async function loadSessions() {
		try {
			const params = new URLSearchParams();
			// Apply user filters
			// If people haven't been loaded yet (allPersonIds.size === 0), don't filter (show all)
			// If no people are selected after loading, send a special marker to return no sessions
			// If all people are selected, don't filter (show all)
			// If some people are selected, filter by those people
			if (allPersonIds.size === 0) {
				// Users not loaded yet - don't filter (show all sessions)
				// Don't add any userId param
			} else if (selectedPersonIds.size === 0) {
				// No people selected - send special marker to return no sessions
				params.append('userId', '__none__');
			} else if (selectedPersonIds.size > 0 && selectedPersonIds.size < allPersonIds.size) {
				// Some people selected - filter by those people
				Array.from(selectedPersonIds).forEach(userId => {
					params.append('userId', userId);
				});
			}
			// If all people are selected (selectedPersonIds.size === allPersonIds.size), don't add any userId param

			// Add limit for performance - load only recent sessions initially
			params.append('limit', '50');

			// Always include people without formal sessions
			params.append('includeUsersWithoutSessions', 'true');

			const queryString = params.toString();
			const cacheKey = `sessions_${queryString || 'default'}`;

			const sessionList = document.getElementById('sessionList');

			if (!sessionList) {
				// Element not found - this might be because we're not on the logs page,
				// or the page isn't fully loaded yet. Skip gracefully.
				if (document.readyState === 'loading') {
					window.addEventListener('DOMContentLoaded', () => {
						requestAnimationFrame(() => loadSessions());
					});
				}
				// Don't log an error - this is expected on non-logs pages
				return;
			}

			// Show loading state while fetching sessions
			sessionList.innerHTML = `
				<li class="session-loading">
					<div class="flex items-center justify-center py-4">
						<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
						<span class="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading sessions...</span>
					</div>
				</li>
			`;

			// Fetch sessions data
			let sessions;
			if (window.isCacheFresh(cacheKey) && params.toString() === '') {
				sessions = window.__globalDataCache.sessions;
			} else {
				const url = queryString ? `/api/sessions?${queryString}` : '/api/sessions';
				const response = await fetch(url, {
					credentials: 'include' // Ensure cookies are sent
				});
				const validResponse = await handleApiResponse(response);
				if (!validResponse) {return;}
				sessions = await validResponse.json();

				// Cache the data if no filters were applied
				if (params.toString() === '') {
					window.updateCache('sessions', sessions);
				}
			}

			// Clear loading state and populate with sessions
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
					const {html: sessionDisplayHtml, text: sessionLabelText} = formatSessionDisplay(session);
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
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
										</svg>
									</div>
								</div>
							</div>
						</div>
					`;

					// Store session date information in dataset for delegation handler
					if (session.last_event) {
						li.dataset.lastEvent = session.last_event;
					}
					if (session.first_event) {
						li.dataset.firstEvent = session.first_event;
					}

					// NO MORE INDIVIDUAL LISTENERS! Event delegation handles all clicks
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

				// Update total size only if not viewing "All Sessions"
				// When viewing "All Sessions", loadEventTypeStats() provides the accurate total
				if (selectedSession !== 'all') {
					const total = sessions.reduce((sum, session) => sum + (session.count || 0), 0);
					const totalSizeEl = document.getElementById('totalSize');
					if (totalSizeEl) {
						totalSizeEl.textContent = total;
					}
				}

				// Update delete selected button
				updateDeleteSelectedButton();
			} else {
				// Update total size to 0 if no sessions and not viewing "All Sessions"
				// When viewing "All Sessions", loadEventTypeStats() provides the accurate total
				if (selectedSession !== 'all') {
					const totalSizeEl = document.getElementById('totalSize');
					if (totalSizeEl) {
						totalSizeEl.textContent = '0';
					}
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
			return {html: fallbackHtml, text: fallbackShort};
		}

		const parsedDate = new Date(user.last_event);
		if (Number.isNaN(parsedDate.getTime())) {
			return {html: fallbackHtml, text: fallbackShort};
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
			return {html: dateHtml, text: dateStr};
		}

		// Get user initials for avatar
		const initials = getUserInitials(userText);
		const avatarHtml = `<span class="person-avatar" style="margin-right: 8px;">${escapeHtml(initials)}</span>`;

		const userHtml = `<span class="session-user">${escapeHtml(userText)}</span>`;
		return {html: `${avatarHtml}${userHtml} <span class="session-date">${escapeHtml(dateStr)}</span>`, text: `${userText} • ${dateStr}`};
	}

	async function loadPeopleList() {
		try {
			const response = await fetch('/api/telemetry-users', {
				credentials: 'include'
			});
			const validResponse = await handleApiResponse(response);
			if (!validResponse) {return;}
			const data = await validResponse.json();

			// Check if response is an error object
			if (data && data.status === 'error') {
				console.error('Error loading users:', data.message);
				return;
			}

			const peopleList = document.getElementById('peopleList');
			if (!peopleList) {
				// Element not found - this might be because we're not on the logs page,
				// or the page isn't fully loaded yet. Skip gracefully.
				if (document.readyState === 'loading') {
					window.addEventListener('DOMContentLoaded', () => {
						requestAnimationFrame(() => loadPeopleList());
					});
				}
				// Don't log an error - this is expected on non-logs pages
				return;
			}

			// Clear the list
			peopleList.innerHTML = '';

			// Normalize API response to consistent objects { id, label, count, last_event }
			const normalizedPeople = (Array.isArray(data) ? data : [])
				.map(entry => {
					if (entry && typeof entry === 'object') {
						const rawId = typeof entry.id === 'string' ? entry.id : (typeof entry.user_id === 'string' ? entry.user_id : '');
						const trimmedId = rawId.trim();
						if (!trimmedId) {
							return null;
						}
						const label = typeof entry.label === 'string' && entry.label.trim() !== ''? entry.label.trim(): trimmedId;
						const count = Number.isFinite(entry.eventCount)? Number(entry.eventCount): (Number.isFinite(entry.count) ? Number(entry.count) : 0);
						const lastEvent = entry.lastEvent || entry.last_event || null;
						const userName = entry.user_name || label;
						return {id: trimmedId, label, count, last_event: lastEvent, user_name: userName};
					}
					if (typeof entry === 'string') {
						const trimmedValue = entry.trim();
						return trimmedValue? {id: trimmedValue, label: trimmedValue, count: 0, last_event: null, user_name: trimmedValue}: null;
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
				}, {seen: new Set(), values: []}).values;

			if (normalizedPeople.length === 0) {
				return;
			}

			// Sort people by last activity (most recent first)
			const peopleWithStats = normalizedPeople.map(user => {
				return {
					user_id: user.id,
					label: user.label,
					count: user.count || 0,
					last_event: user.last_event || null,
					user_name: user.user_name || user.label
				};
			}).sort((a, b) => {
				// Sort by last_event DESC, people without events go to the end
				if (!a.last_event && !b.last_event) {return 0;}
				if (!a.last_event) {return 1;}
				if (!b.last_event) {return -1;}
				const dateA = new Date(a.last_event);
				const dateB = new Date(b.last_event);
				return dateB - dateA;
			});

			// Add each user to the list
			peopleWithStats.forEach(user => {
				const li = document.createElement('li');
				li.className = 'session-item';
				li.setAttribute('data-user', user.user_id);

				const {html: userDisplayHtml} = formatUserDisplay({
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

				// NO MORE INDIVIDUAL LISTENERS! Event delegation handles all clicks
				peopleList.appendChild(li);
			});
		} catch (error) {
			console.error('Error loading users list:', error);
		}
	}

	async function loadTeamsList() {
		try {
			const teamList = document.getElementById('teamList');
			if (!teamList) {
				// Element not found - this might be because the page isn't fully loaded yet
				// Defer loading until DOM is ready
				if (document.readyState === 'loading') {
					window.addEventListener('DOMContentLoaded', () => {
						requestAnimationFrame(() => loadTeamsList());
					});
				} else {
					console.error('teamList element not found after DOM ready');
				}
				return;
			}

			let teams = [];
			let aggregatedTeams = [];

			try {
				// Check if we have fresh cached team stats data
			let statsData;
			if (window.isCacheFresh('teamStats')) {
				statsData = window.__globalDataCache.teamStats;
				} else {
					const teamStatsUrl = '/api/team-stats';
					logChartTrace('loadTeamsList: fetching aggregated team stats', {url: teamStatsUrl});
					const statsResponse = await fetch(teamStatsUrl, {credentials: 'include'});
					const validStatsResponse = await handleApiResponse(statsResponse);
					if (validStatsResponse) {
						statsData = await validStatsResponse.json();
						window.updateCache('teamStats', statsData);
					}
				}
				if (statsData && Array.isArray(statsData.teams)) {
					aggregatedTeams = statsData.teams;
				}
			} catch (error) {
				logChartTrace('loadTeamsList: aggregated team stats failed', {
					online: navigator.onLine,
					message: error?.message
				});
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
					const totalMappings = Number.isFinite(team.totalMappings)? Number(team.totalMappings): activeCount + inactiveCount;

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
				// No aggregated data available; keep empty state and direct users to the Teams page.
				teamEventCountsSource = 'server';
				teamEventCounts = new Map();
				orgToTeamMap = new Map();
			}

			teamList.innerHTML = '';

			if (teams.length === 0) {
				selectedTeamKey = null;
				teamList.innerHTML = `
				<li class="session-item">
					<div class="session-item-left">
						<span class="session-name text-sm">No teams configured</span>
						<span class="session-date text-xs">Manage teams from the Teams page.</span>
					</div>
					<div class="session-item-right">
						<a class="btn" href="/teams">
							Open Teams
						</a>
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
				const clientsLabel = team.clients.length? `Clients: ${escapeHtml(team.clients.slice(0, 2).join(', '))}${team.clients.length > 2 ? '…' : ''}`: 'No clients defined';
				const mappingLabel = `${team.totalMappings} mapping${team.totalMappings === 1 ? '' : 's'}`;
				const statusLabel = team.inactiveCount > 0? `${team.activeCount} active · ${team.inactiveCount} inactive`: `${team.activeCount} active`;
				const eventCount = team.eventCount || 0;
				const initials = team.teamName.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase();

				li.innerHTML = `
				<div class="session-item-left">
					<div style="width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; margin-right: 10px; color: white; border-radius: 7px; background: ${color}; font-weight: 600; font-size: 14px; aspect-ratio: 1;">
            ${escapeHtml(initials)}
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

				// NO MORE INDIVIDUAL LISTENERS! Event delegation handles all clicks
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
			if (!teamKey) {return;}
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
		if (!indicator) {return;}

		const activeTabBtn = document.querySelector('.tab-btn.active');
		if (!activeTabBtn) {return;}

		const tabsContainer = activeTabBtn.closest('.tabs-container');
		if (!tabsContainer) {return;}

		const containerRect = tabsContainer.getBoundingClientRect();
		const activeTabRect = activeTabBtn.getBoundingClientRect();

		indicator.style.left = `${activeTabRect.left - containerRect.left}px`;
		indicator.style.width = `${activeTabBtn.offsetWidth}px`;
	}

	function switchTab(tab) {
		if (tab === activeTab) {return;}

		activeTab = tab;
		const sessionsTab = document.getElementById('sessionsTab');
		const peopleTab = document.getElementById('peopleTab');
		const teamsTab = document.getElementById('teamsTab');
		const sessionsContainer = document.getElementById('sessionsContainer');
		const sessionList = document.getElementById('sessionList');
		const peopleList = document.getElementById('peopleList');
		const teamList = document.getElementById('teamList');

		// Clear session selection and exit selection mode when switching tabs
		if (tab !== 'sessions') {
			selectedSessionsForDeletion.clear();
			lastSelectedSessionId = null;
			selectionMode = false;
			const toggleBtn = document.getElementById('toggleSelectionModeBtn');
			if (toggleBtn) {
				toggleBtn.classList.remove('active');
			}
			updateDeleteSelectedButton();
		}

		// Clear team selection when leaving Teams tab to avoid stale filters
		if (tab !== 'teams' && selectedTeamKey) {
			selectedTeamKey = null;
			const teamItems = document.querySelectorAll('#teamList .session-item');
			teamItems.forEach((item) => item.classList.remove('active'));
			loadEvents();
		}

		// Update tab buttons
		if (sessionsTab && peopleTab && teamsTab) {
			sessionsTab.classList.toggle('active', tab === 'sessions');
			peopleTab.classList.toggle('active', tab === 'people');
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
		if (peopleList) {
			peopleList.style.display = tab === 'people' ? 'block' : 'none';
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
		const durationInfoEl = document.getElementById('durationInfo');
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

			// Apply area filters
			if (activeFilters.size > 0 && activeFilters.size < 3) {
				Array.from(activeFilters).forEach(area => {
					params.append('area', area);
				});
			}

			if (selectedSession !== 'all') {
				params.append('sessionId', selectedSession);
			}

			if (searchQuery) {
				params.append('search', searchQuery);
			}

			// Apply user filters
			// If people haven't been loaded yet (allPersonIds.size === 0), don't filter (show all)
			// If no people are selected after loading, send a special marker to return no events
			// If all people are selected, don't filter (show all)
			// If some people are selected, filter by those people
			if (allPersonIds.size === 0) {
				// Users not loaded yet - don't filter (show all events)
				// Don't add any userId param
			} else if (selectedPersonIds.size === 0) {
				// No people selected - send special marker to return no events
				params.append('userId', '__none__');
			} else if (selectedPersonIds.size > 0 && selectedPersonIds.size < allPersonIds.size) {
				// Some people selected - filter by those people
				Array.from(selectedPersonIds).forEach(userId => {
					params.append('userId', userId);
				});
			}
			// If all people are selected (selectedPersonIds.size === allPersonIds.size), don't add any userId param

			const response = await fetch(`/api/events?${params}`);
			const validResponse = await handleApiResponse(response);
			if (!validResponse) {return;}
			const data = await validResponse.json();

			// Update last fetch time when fetch is successful
			lastFetchTime = Date.now();
			updateLastUpdatedText();
			if (!timerRegistry.has('eventLog.lastUpdated')) {
				startLastUpdatedInterval();
			}

			const duration = Math.round(performance.now() - startTime);
			if (durationInfoEl) {
				durationInfoEl.textContent = `${duration}ms`;
			}

			let fetchedEvents = Array.isArray(data.events) ? data.events : [];

			if (selectedTeamKey) {
				fetchedEvents = fetchedEvents.filter(eventMatchesSelectedTeam);
			}

			const hasEventsToShow = fetchedEvents.length > 0;

			if (hasEventsToShow) {
				displayEvents(fetchedEvents, append);
				hasMoreEvents = data.hasMore || false;
				currentOffset += fetchedEvents.length;
				handleNotificationState(fetchedEvents, triggeredByNotification);
				if (!append) {
					updateSessionActivityChart({sessionId: selectedSession});
				}
			} else {
				hasMoreEvents = false;
				if (!append) {
					const emptyStateEl = document.getElementById('emptyState');
					if (emptyStateEl) {
						emptyStateEl.style.display = 'block';
					}
					hideSessionActivityCard();
					allLoadedEvents = [];
					updateTeamEventCounts(allLoadedEvents);
				}
			}
			updateTeamEventCounts(allLoadedEvents);
		} catch (error) {
			console.error('Error loading events:', error);
			safeShowToast(`Error loading events: ${  error.message}`, 'error');
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
		} catch {
			return {};
		}
	}

	function buildStatusIcon(isError) {
		const statusClass = isError ? 'ko' : 'ok';
		const statusLabel = isError ? 'KO' : 'OK';
		const src = isError ? '/resources/ko.png' : '/resources/ok.png';
		return `<img src="${src}" alt="${statusLabel}" class="status-indicator ${statusClass}" loading="lazy">`;
	}

	// Filter events based on search query
	function filterEventsBySearch(events, query) {
		if (!query || !query.trim()) {
			return events;
		}

		const searchTerm = query.trim().toLowerCase();
		return events.filter(event => {
			const eventData = normalizeEventData(event.data);
			const userLabel = extractUserLabelFromEvent(event, eventData);
			const clientName = event.company_name || '';
			const rawToolName = (event.event === 'tool_call' || event.event === 'tool_error')? (event.tool_name || event.toolName || ''): '';
			const toolName = rawToolName || 'N/A';
			const errorMessage = event.event === 'tool_error' ? (event.error_message || '') : '';
			const area = event.area || 'N/A';
			const eventType = event.event || 'N/A';

			// Search in various fields
			const searchableText = [
				userLabel,
				clientName,
				toolName,
				errorMessage,
				area,
				eventType,
				event.timestamp ? formatDate(event.timestamp) : '',
				JSON.stringify(eventData)
			].join(' ').toLowerCase();

			return searchableText.includes(searchTerm);
		});
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
		} catch {
			return '';
		}
	}

	function getTeamKeyForEvent(event) {
		if (!event) {return '';}
		const orgIdentifier = extractOrgIdentifierFromEvent(event);
		if (!orgIdentifier) {return '';}
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
			} catch {
				// Ignore and fall through to other sources
			}
		}

		// Fallback to user_id from the event itself
		if (event.user_id) {
			return String(event.user_id);
		}

		return '';
	}


	function getLevelClass(area) {
		const levelMap = {
			'tool': 'tool',
			'session': 'session',
			'general': 'general'
		};
		return levelMap[area] || 'session';
	}

	function getLevelBadgeClass(area) {
		const levelClass = getLevelClass(area);
		return `level-badge ${levelClass}`;
	}

	function getEventBadgeClass(eventType, eventSuccess) {
		// Si success és false, sempre usa colors vermells
		if (eventSuccess === false) {
			return `event-badge bg-red-50 text-red-700 inset-ring-red-600/10`;
		}

		// Assigna colors aleatòriament però consistentment basat en el tipus d'event
		const eventColorMap = {
			'tool_call': 'green',
			'tool_error': 'indigo',
			'session_start': 'pink',
			'session_end': 'yellow',
			'error': 'green',
			'custom': 'indigo',
			'validation': 'gray',
			'execution': 'green'
		};
		const colorClass = eventColorMap[eventType] || 'green';
		return `event-badge ${colorClass}`;
	}




	async function toggleRowExpand(eventId) {
		const expandedRow = document.getElementById(`expanded-${eventId}`);
		const mainRow = document.querySelector(`tr[data-event-id="${eventId}"]`);
		const expandBtn = document.getElementById(`expand-btn-${eventId}`);

		if (!expandedRow || !mainRow || !expandBtn) {
			return;
		}

		if (expandedRow.classList.contains('expanded')) {
			// Collapse
			expandedRow.classList.remove('expanded');
			expandBtn.classList.remove('expanded');
			mainRow.classList.remove('expanded');
		} else {
			// Expand - First check if we need to load the payload data
			if (!expandedRow.hasAttribute('data-loaded')) {
				// Show loading state
				expandedRow.innerHTML = `
					<td colspan="11" class="log-description-expanded px-3 py-4">
						<div class="flex items-center justify-center py-8">
							<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
							<span class="ml-2 text-gray-600 dark:text-gray-400">Loading event details...</span>
						</div>
					</td>
				`;

				try {
					// Load the complete event data including payload
					const response = await fetch(`/api/events/${eventId}`);
					const validResponse = await handleApiResponse(response);
					if (!validResponse) {
						throw new Error('Failed to load event data');
					}
					const eventData = await validResponse.json();

					// Find the event in our cached events and update it with the payload data
					const eventIndex = allLoadedEvents.findIndex(e => e.id === eventId);
					if (eventIndex !== -1) {
						// Merge the payload data into the existing event object
						Object.assign(allLoadedEvents[eventIndex], {
							data: eventData.event.data
						});
					}

					// Generate the form HTML with the now available data
					const event = allLoadedEvents[eventIndex];
					expandedRow.innerHTML = `
						<td colspan="11" class="log-description-expanded px-3 py-4">
							${createEventDetailsFormHTML(event)}
						</td>
					`;
					expandedRow.setAttribute('data-loaded', 'true');

				} catch (error) {
					console.error('Error loading event details:', error);
					expandedRow.innerHTML = `
						<td colspan="11" class="log-description-expanded px-3 py-4">
							<div class="text-center text-red-600 dark:text-red-400 py-8">
								Failed to load event details. Please try again.
							</div>
						</td>
					`;
					return;
				}
			}

			// Show the expanded row
			expandedRow.classList.add('expanded');
			expandBtn.classList.add('expanded');
			mainRow.classList.add('expanded');
		}
	}

	function formatDate(dateString) {
		if (!dateString) {return '';}
		const date = new Date(dateString);
		const day = date.getDate();
		const month = date.toLocaleString('default', {month: 'short'}).toLowerCase();
		const hours = String(date.getHours());
		const minutes = String(date.getMinutes()).padStart(2, '0');
		return `${day} ${month} ${hours}:${minutes}`;
	}

	// Create event details form HTML
	function createEventDetailsFormHTML(event) {
		// event.data now contains the original payload exactly as received
		const payload = event.data || {};

		const formatDateForForm = (dateString) => {
			if (!dateString) {return '';}
			try {
				const date = new Date(dateString);
				if (Number.isNaN(date.getTime())) {return dateString;}

				// Format: "15 Jan 2024, 14:30:45" (day month year, hour:minute:second)
				const options = {
					day: 'numeric',
					month: 'short',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit',
					hour12: false
				};
				return date.toLocaleDateString('en-GB', options);
			} catch {
				return dateString;
			}
		};

		const formatValue = (value) => {
			if (value === null || value === undefined) {
				return '';
			}
			if (typeof value === 'object') {
				return JSON.stringify(value, null, 2);
			}
			return String(value);
		};

		const createInputHTML = (id, name, label, value, placeholder = '', type = 'text', roundedClasses = '') => {
			return `
				<div class="bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700 focus-within:relative focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 dark:focus-within:outline-indigo-500 ${roundedClasses}">
					<label for="${id}" class="block text-xs font-medium text-gray-900 dark:text-white">${label}</label>
					<input
						id="${id}"
						name="${name}"
						type="${type}"
						value="${formatValue(value).replace(/"/g, '&quot;')}"
						placeholder="${placeholder}"
						aria-label="${label}"
						readonly
						class="block w-full text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
						style="font-size: 13.5px;"
					/>
				</div>
			`;
		};


		let formHTML = '<div style="max-width: 700px; padding-left: 30px; padding-right: 30px;">';

		// Event Information fieldset
		formHTML += '<fieldset>';
		formHTML += '<legend class="block text-sm/6 font-semibold text-gray-900 dark:text-white">Event Information</legend>';
		formHTML += '<div class="mt-2 -space-y-px">';

		// Request ID (top, full width)
		formHTML += createInputHTML(
			`event-id-${event.id}`,
			'id',
			'Request ID',
			event.id,
			'Request ID',
			'text',
			'rounded-t-md'
		);

		// Area and Event (side by side as badges) - Second row
		formHTML += '<div class="grid grid-cols-2 gap-0">';
		formHTML += `
			<div class="bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700 -mr-px">
				<label class="block text-xs font-medium text-gray-900 dark:text-white mb-1.5">Area</label>
				<div class="flex items-center">
					<span class="${getLevelBadgeClass(event.area)}">${formatValue(event.area)}</span>
				</div>
			</div>
			<div class="bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700">
				<label class="block text-xs font-medium text-gray-900 dark:text-white mb-1.5">Event</label>
				<div class="flex items-center">
					<span class="${getEventBadgeClass(event.event, event.success)}">${formatValue(event.event)}</span>
				</div>
			</div>
		`;
		formHTML += '</div>';

		// Timestamp and Received At (side by side)
		formHTML += '<div class="grid grid-cols-2 gap-0">';
		formHTML += `
			<div class="bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700 focus-within:relative focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 dark:focus-within:outline-indigo-500 -mr-px">
				<label for="event-timestamp-${event.id}" class="block text-xs font-medium text-gray-900 dark:text-white">Timestamp</label>
				<input
					id="event-timestamp-${event.id}"
					name="timestamp"
					type="text"
					value="${formatDateForForm(event.timestamp).replace(/"/g, '&quot;')}"
					placeholder="Timestamp"
					aria-label="Timestamp"
					readonly
					class="block w-full text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
					style="font-size: 13.5px;"
				/>
			</div>
			<div class="bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700 focus-within:relative focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 dark:focus-within:outline-indigo-500">
				<label for="event-received-at-${event.id}" class="block text-xs font-medium text-gray-900 dark:text-white">Received At</label>
				<input
					id="event-received-at-${event.id}"
					name="received_at"
					type="text"
					value="${formatDateForForm(event.received_at).replace(/"/g, '&quot;')}"
					placeholder="Received At"
					aria-label="Received At"
					readonly
					class="block w-full text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
					style="font-size: 13.5px;"
				/>
			</div>
		`;
		formHTML += '</div>';

		// Schema Version and Success (side by side)
		formHTML += '<div class="grid grid-cols-2 gap-0">';
		formHTML += `
			<div class="bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700 focus-within:relative focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 dark:focus-within:outline-indigo-500 -mr-px">
				<label for="event-schema-version-${event.id}" class="block text-xs font-medium text-gray-900 dark:text-white">Request schema version</label>
				<input
					id="event-schema-version-${event.id}"
					name="telemetry_schema_version"
					type="text"
					value="${formatValue(event.telemetry_schema_version).replace(/"/g, '&quot;')}"
					placeholder="Request schema version"
					aria-label="Request schema version"
					readonly
					class="block w-full text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
					style="font-size: 13.5px;"
				/>
			</div>
			<div class="bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700">
				<label class="block text-xs font-medium text-gray-900 dark:text-white mb-1.5">Success</label>
				<div class="flex items-center">
					${event.success === true || event.success === 'true'? '<img src="/resources/ok.png" alt="OK" class="status-indicator ok" loading="lazy">': '<img src="/resources/ko.png" alt="KO" class="status-indicator ko" loading="lazy">'}
				</div>
			</div>
		`;
		formHTML += '</div>';

		// Version and Error Message (side by side)
		formHTML += '<div class="grid grid-cols-2 gap-0">';
		formHTML += `
			<div class="bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700 focus-within:relative focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 dark:focus-within:outline-indigo-500 rounded-bl-md -mr-px">
				<label for="event-version-${event.id}" class="block text-xs font-medium text-gray-900 dark:text-white">Server version</label>
				<input
					id="event-version-${event.id}"
					name="version"
					type="text"
					value="${formatValue(event.version).replace(/"/g, '&quot;')}"
					placeholder="Server version"
					aria-label="Server version"
					readonly
					class="block w-full text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
					style="font-size: 13.5px;"
				/>
			</div>
			<div class="bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700 focus-within:relative focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 dark:focus-within:outline-indigo-500 rounded-br-md">
				<label for="event-error-message-${event.id}" class="block text-xs font-medium text-gray-900 dark:text-white">Error Message</label>
				<input
					id="event-error-message-${event.id}"
					name="error_message"
					type="text"
					value="${formatValue(event.error_message).replace(/"/g, '&quot;')}"
					placeholder="Error Message"
					aria-label="Error Message"
					readonly
					class="block w-full text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
					style="font-size: 13.5px;"
				/>
			</div>
		`;
		formHTML += '</div>';

		formHTML += '</div>';
		formHTML += '</fieldset>';

		formHTML += '</div>';
		return formHTML;
	}

	// Display events function for logs table
	function displayEvents(events, append = false) {
		const logsTableScroll = document.getElementById('logsTableScroll');
		if (!logsTableScroll) {
			return;
		}

		// Filter events by search query if present
		const filteredEvents = filterEventsBySearch(events, searchQuery);

		// If appending, find the tbody and add rows to it
		// If not appending, replace the entire content
		let tbody;
		if (append) {
			tbody = logsTableScroll.querySelector('tbody');
			if (!tbody) {
				return;
			}
		} else {
			// Clear existing content and create new table structure
			logsTableScroll.innerHTML = '';
		}

		// Create rows as DOM elements instead of HTML strings
		const rowElements = [];

		filteredEvents.forEach((event) => {
			// When appending, we don't know if it's the last event overall, so always show border
			const borderClass = 'border-b border-gray-200 dark:border-white/10';

			const eventData = normalizeEventData(event.data);
			const userLabel = extractUserLabelFromEvent(event, eventData);
			const clientName = event.company_name || '';
			const dataStatus = typeof eventData.status === 'string'? eventData.status.toLowerCase(): null;
			const isToolFailure = event.event === 'tool_call' && (
				dataStatus === 'error' ||
				dataStatus === 'failed' ||
				eventData.success === false ||
				Boolean(eventData.error)
			);
			const isError = event.event === 'tool_error' || event.event === 'error' || isToolFailure;
			const statusIcon = buildStatusIcon(isError);

			// Extract tool name for tool events
			const isToolEvent = event.event === 'tool_call' || event.event === 'tool_error';
			const rawToolName = isToolEvent? (event.tool_name || event.toolName || ''): '';
			const toolName = rawToolName ? escapeHtml(String(rawToolName)) : 'N/A';

			// Extract error message for tool_error events
			const errorMessage = event.event === 'tool_error'? (event.error_message || ''): '';
			const escapedErrorMessage = errorMessage ? escapeHtml(String(errorMessage)) : '';

			// Main row
			const row = document.createElement('tr');
			row.className = 'logs-table-row';
			row.setAttribute('data-event-id', event.id);
			row.style.height = '46px';

			row.innerHTML = `
				<td class="${borderClass} pl-2 pr-1 text-center font-medium text-gray-500 dark:text-gray-400" style="height: 46px; vertical-align: middle;">
					<button type="button" id="expand-btn-${event.id}" class="expand-btn" onclick="toggleRowExpand(${event.id}).catch(console.error)" style="background: none; border: none; cursor: pointer; padding: 4px;">
						<i class="fa-solid fa-chevron-right text-gray-400"></i>
					</button>
				</td>
				<td class="${borderClass} pr-2 pl-2 whitespace-nowrap text-gray-700 dark:text-gray-300" style="height: 46px; vertical-align: middle; max-width: 90px; width: 90px;">${formatDate(event.timestamp)}</td>
				<td class="${borderClass} px-2 font-medium whitespace-nowrap text-gray-500 dark:text-gray-400" style="height: 46px; vertical-align: middle; max-width: 100px; width: 100px;">${escapeHtml(userLabel)}</td>
				<td class="hidden ${borderClass} px-2 whitespace-nowrap text-gray-500 dark:text-gray-400 md:table-cell" style="height: 46px; vertical-align: middle;">${escapeHtml(clientName)}</td>
				<td class="${borderClass} px-2 whitespace-nowrap text-gray-500 dark:text-gray-400" style="height: 46px; vertical-align: middle; max-width: 100px; width: 100px;">
					<span class="${getLevelBadgeClass(event.area)}${!event.area ? ' na' : ''}">${escapeHtml(event.area || 'N/A')}</span>
				</td>
				<td class="${borderClass} px-2 whitespace-nowrap text-gray-500 dark:text-gray-400" style="height: 46px; vertical-align: middle; max-width: 120px; width: 120px;">
					<span class="${getEventBadgeClass(event.event, event.success)}">${escapeHtml(event.event || 'N/A')}</span>
				</td>
				<td class="hidden ${borderClass} px-2 whitespace-nowrap text-gray-500 dark:text-gray-400 lg:table-cell" style="height: 46px; vertical-align: middle; max-width: 150px; width: 150px;">${toolName}</td>
				<td class="${borderClass} px-2 whitespace-nowrap text-center" style="height: 46px; vertical-align: middle;">${statusIcon}</td>
				<td class="hidden ${borderClass} px-2 whitespace-nowrap text-gray-500 dark:text-gray-400 xl:table-cell overflow-hidden text-ellipsis max-w-48" style="height: 46px; vertical-align: middle;" title="${escapedErrorMessage}">${escapedErrorMessage}</td>
				<td class="${borderClass} px-2 text-center text-gray-500 dark:text-gray-400" style="height: 46px; vertical-align: middle;">
					<button type="button" onclick="event.stopPropagation(); loadEventPayload(${event.id})" class="text-gray-500 hover:text-[#2195cf] hover:bg-gray-100 rounded dark:text-white dark:hover:text-[#2195cf] dark:hover:bg-white/5 p-2 rounded -m-1 transition-colors duration-150" title="View payload">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
							<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
						</svg>
					</button>
				</td>
				<td class="${borderClass} pr-2 pl-2 text-right font-medium whitespace-nowrap" style="height: 46px; vertical-align: middle; max-width: 60px; width: 60px;">
					<button type="button" class="actions-btn hover:text-indigo-900 dark:hover:text-indigo-400" onclick="toggleActionsDropdown(event, ${event.id})" style="background: none; border: none; cursor: pointer; padding: 4px;">
						<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
							<circle cx="8" cy="3" r="1.5"/>
							<circle cx="8" cy="8" r="1.5"/>
							<circle cx="8" cy="13" r="1.5"/>
						</svg>
					</button>
					<div class="actions-dropdown actions-dropdown-left" id="dropdown-${event.id}">
						<div class="actions-dropdown-item" onclick="copyEventPayload(${event.id})">
							<span>Copy payload</span>
						</div>
						<div class="actions-dropdown-item delete" onclick="confirmDeleteEvent(${event.id})">
							<span>Move to trash</span>
						</div>
					</div>
				</td>
			`;

			// Expanded row
			const expandedRow = document.createElement('tr');
			expandedRow.className = 'logs-item-expanded';
			expandedRow.id = `expanded-${event.id}`;
			expandedRow.innerHTML = `
				<td colspan="11" class="log-description-expanded px-3 py-4">
					${createEventDetailsFormHTML(event)}
				</td>
			`;

			rowElements.push(row);
			rowElements.push(expandedRow);
		});

		// For non-append mode, we still need the HTML string
		const rows = append ? null : rowElements.map(row => row.outerHTML).join('');

		if (append) {
			// Append rows directly as DOM elements
			rowElements.forEach(row => {
				tbody.appendChild(row);
			});
			// Add filtered events to allLoadedEvents array
			allLoadedEvents.push(...filteredEvents);
		} else {
			// Create new table structure
			logsTableScroll.innerHTML = `
				<div>
					<div class="flow-root">
						<div class="-my-2">
							<div class="inline-block min-w-full py-2 align-middle">
								<table class="min-w-full border-separate border-spacing-0 bg-white dark:bg-gray-900" data-resizable-columns-id="event-logs-table" style="font-size: 13.5px !important; min-width: 100%;">
									<thead class="bg-gray-50 dark:bg-gray-800/79">
										<tr>
											<th scope="col" data-resizable-column-id="expand" class="sticky top-0 z-10 border-b border-gray-300 dark:border-white/15 bg-gray-50/83 dark:bg-gray-800/79 py-2 pl-2 pr-1 text-left font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter" style="backdrop-filter: blur(1px);">
												<span class="sr-only">Expand</span>
											</th>
											<th scope="col" data-resizable-column-id="date" class="sticky top-0 z-10 border-b border-gray-300 dark:border-white/15 bg-gray-50/83 dark:bg-gray-800/79 py-2 pr-2 pl-2 text-left font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter" style="max-width: 90px; width: 90px; backdrop-filter: blur(2px);">Date</th>
											<th scope="col" data-resizable-column-id="user" class="sticky top-0 z-10 border-b border-gray-300 dark:border-white/15 bg-gray-50/83 dark:bg-gray-800/79 px-2 py-2 text-left font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter" style="max-width: 100px; width: 100px; backdrop-filter: blur(2px);">User</th>
											<th scope="col" data-resizable-column-id="company" class="sticky top-0 z-10 hidden border-b border-gray-300 dark:border-white/15 bg-gray-50/83 dark:bg-gray-800/79 px-2 py-2 text-left font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter md:table-cell" style="backdrop-filter: blur(2px);">Company</th>
											<th scope="col" data-resizable-column-id="area" class="sticky top-0 z-10 border-b border-gray-300 dark:border-white/15 bg-gray-50/83 dark:bg-gray-800/79 px-2 py-2 text-left font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter" style="max-width: 100px; width: 100px; backdrop-filter: blur(2px);">Area</th>
											<th scope="col" data-resizable-column-id="event" class="sticky top-0 z-10 border-b border-gray-300 dark:border-white/15 bg-gray-50/83 dark:bg-gray-800/79 px-2 py-2 text-left font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter" style="max-width: 120px; width: 120px; backdrop-filter: blur(2px);">Event</th>
											<th scope="col" data-resizable-column-id="tool" class="sticky top-0 z-10 hidden border-b border-gray-300 dark:border-white/15 bg-gray-50/83 dark:bg-gray-800/79 px-2 py-2 text-left font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter lg:table-cell" style="max-width: 150px; width: 150px; backdrop-filter: blur(2px);">Tool</th>
											<th scope="col" data-resizable-column-id="status" class="sticky top-0 z-10 border-b border-gray-300 dark:border-white/15 bg-gray-50/83 dark:bg-gray-800/79 px-2 py-2 text-center font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter" style="backdrop-filter: blur(2px);">Status</th>
											<th scope="col" data-resizable-column-id="error" class="sticky top-0 z-10 hidden border-b border-gray-300 dark:border-white/15 bg-gray-50/83 dark:bg-gray-800/79 px-2 py-2 text-left font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter xl:table-cell" style="backdrop-filter: blur(2px);">Error</th>
											<th scope="col" data-resizable-column-id="payload" class="sticky top-0 z-10 border-b border-gray-300 dark:border-white/15 bg-gray-50/83 dark:bg-gray-800/79 px-2 py-2 text-center font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter" style="backdrop-filter: blur(2px);">Payload</th>
											<th scope="col" class="sticky top-0 z-10 border-b border-gray-300 dark:border-white/15 bg-gray-50/83 dark:bg-gray-800/79 py-2 pr-2 pl-2 backdrop-blur-sm backdrop-filter" style="max-width: 60px; width: 60px; backdrop-filter: blur(2px);">
												<span class="sr-only">Actions</span>
											</th>
										</tr>
									</thead>
									<tbody>
										${rows}
									</tbody>
								</table>
							</div>
						</div>
					</div>
				</div>
			`;
			// Store filtered events in allLoadedEvents array
			allLoadedEvents = [...filteredEvents];
			// Get the tbody for adding event listeners
			tbody = logsTableScroll.querySelector('tbody');

			// Initialize resizable columns after table is created
			if (window.ResizableColumns) {
				const table = logsTableScroll.querySelector('table[data-resizable-columns-id]');
				if (table) {
					// eslint-disable-next-line no-new
					new ResizableColumns(table, {
						store: window.resizableColumnsStore,
						maxWidth: 200,
						columnWidths: {
							expand: {initial: 50, min: 50, max: 50, fixed: true},
							date: {initial: 108, min: 108, max: 200},
							user: {initial: 100, min: 100, max: 200},
							company: {initial: 120, min: 80, max: 200},
							area: {initial: 60, min: 60, max: 200},
							event: {initial: 68, min: 68, max: 200},
							tool: {initial: 108, min: 108, max: 200},
							status: {initial: 60, min: 60, max: 200},
							error: {initial: 120, min: 80, max: 200},
							payload: {initial: 60, min: 60, max: 200}
						}
					});
				}
			}
		}

		// NO MORE INDIVIDUAL ROW LISTENERS! Event delegation handles all table row clicks
	}

	// Infinite scroll handler for logs table
	function shouldLoadMoreOnScroll() {
		const logsTableScroll = document.getElementById('logsTableScroll');
		if (!logsTableScroll) {
			return false;
		}

		// Check if logsTableScroll has its own scroll (overflow-y: auto)
		const hasOwnScroll = logsTableScroll.scrollHeight > logsTableScroll.clientHeight;

		if (hasOwnScroll) {
			// logsTableScroll has its own scroll container
			const scrollTop = logsTableScroll.scrollTop;
			const scrollHeight = logsTableScroll.scrollHeight;
			const clientHeight = logsTableScroll.clientHeight;
			const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
			return distanceFromBottom < 300; // Load more when 300px from bottom
		}
			// Use page scroll
			const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
			const windowHeight = window.innerHeight || document.documentElement.clientHeight;
			const documentHeight = Math.max(
				document.body.scrollHeight,
				document.body.offsetHeight,
				document.documentElement.clientHeight,
				document.documentElement.scrollHeight,
				document.documentElement.offsetHeight
			);

			const distanceFromBottom = documentHeight - (scrollTop + windowHeight);
			return distanceFromBottom < 300; // Load more when 300px from bottom

	}

	function handleScroll() {
		if (isLoadingMore) {
			return;
		}

		if (!hasMoreEvents) {
			return;
		}

		if (shouldLoadMoreOnScroll()) {
			loadEvents({append: true});
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
			// Wait for all refresh-related loads to complete
			await Promise.all([
				loadEventTypeStats(selectedSession),
				loadSessions(),
				loadEvents()
			]);
		} catch (error) {
			// Internal functions already handle and display errors (including timeout);
			// we keep this catch to ensure rotation always stops
			console.error('Error refreshing logs:', error);
		} finally {
			if (refreshIcon) {
				// Smooth transition: replace infinite animation with a finishing one
				refreshIcon.classList.remove('rotating');
				refreshIcon.classList.add('rotating-finish');

				// Remove the finish class after animation completes
				setTimeout(() => {
					refreshIcon.classList.remove('rotating-finish');
				}, REFRESH_ICON_ANIMATION_DURATION_MS);
			}
			isRefreshInProgress = false;
		}
	}

	// Page-specific refresh callback for when events are deleted
	window.onEventsDeleted = function() {
		// Refresh the view
		currentOffset = 0;
		loadEventTypeStats(selectedSession);
		loadSessions();
		loadEvents();
	};


	function toggleNotificationMode() {
		if (notificationModeEnabled) {
			disableNotificationMode();
		} else {
			enableNotificationMode();
		}
	}


	async function enableNotificationMode() {
		if (!('Notification' in window)) {
			safeShowToast('Your browser does not support desktop notifications.', 'error');
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
			safeShowToast('You must allow browser notifications to enable this mode.', 'error');
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
					}, {once: true});
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
		timerRegistry.clearInterval('eventLog.notificationRefresh');
	}

	function updateAutoRefreshInterval() {
		clearAutoRefreshInterval();

		const intervalMinutes = autoRefreshIntervalMinutes;
		const enabled = intervalMinutes !== '';
		autoRefreshEnabledState = enabled;

		setRefreshButtonAutoState(enabled, intervalMinutes);

		if (enabled && intervalMinutes && intervalMinutes !== '') {
			const intervalMs = Number.parseInt(intervalMinutes, 10) * 60 * 1000;
			timerRegistry.setInterval('eventLog.autoRefresh', () => {
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
		timerRegistry.clearInterval('eventLog.autoRefresh');
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
		const body = newSessionsCount === 1? '1 new session started.': `${newSessionsCount} new sessions started.`;

		try {
			// eslint-disable-next-line no-new
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
	let searchInputBound = false;

	function bindSearchInput() {
		if (searchInputBound) {
			return true;
		}

		const searchInputEl = document.getElementById('searchInput');
		if (!searchInputEl) {
			return false;
		}

		searchInputEl.addEventListener('input', (e) => {
			timerRegistry.clearTimeout('eventLog.searchDebounce');
			timerRegistry.setTimeout('eventLog.searchDebounce', () => {
				searchQuery = e.target.value;
				currentOffset = 0;
				loadEvents();
			}, 500);
		});
		searchInputBound = true;
		return true;
	}

	if (!bindSearchInput()) {
		// Header builds the search input on DOMContentLoaded; defer binding until it exists
		window.addEventListener('DOMContentLoaded', () => {
			requestAnimationFrame(() => {
				if (!bindSearchInput()) {
					handleInitializationError('search input binding', new Error('Search input not found after header init'));
				}
			});
		});
	}

	// Sort order change - defer binding until header is loaded
	function bindSortButton() {
		const sortBtnEl = document.getElementById('sortBtn');
		const sortIconEl = document.getElementById('sortIcon');
		if (!sortBtnEl || !sortIconEl) {
			return false;
		}

		// Update icon based on current sort order
		function updateSortIcon() {
			if (sortOrder === 'DESC') {
				sortIconEl.src = '/resources/sort-desc';
				sortIconEl.alt = 'Sort descending';
				sortBtnEl.setAttribute('data-tooltip', 'Show newest first');
			} else {
				sortIconEl.src = '/resources/sort-asc';
				sortIconEl.alt = 'Sort ascending';
				sortBtnEl.setAttribute('data-tooltip', 'Show oldest first');
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

		return true;
	}

	if (!bindSortButton()) {
		// Header builds the sort button on DOMContentLoaded; defer binding until it exists
		window.addEventListener('DOMContentLoaded', () => {
			requestAnimationFrame(() => {
				if (!bindSortButton()) {
					handleInitializationError('sort button binding', new Error('Sort button not found after header init'));
				}
			});
		});
	}

	function setupInfiniteScroll() {
		const logsTableScroll = document.getElementById('logsTableScroll');
		if (!logsTableScroll) {
			// Element not found - this might be because the page isn't fully loaded yet
			// Defer setup until DOM is ready
			if (document.readyState === 'loading') {
				window.addEventListener('DOMContentLoaded', () => {
					requestAnimationFrame(() => setupInfiniteScroll());
				});
			} else {
				console.error('[Event Log] logsTableScroll not found after DOM ready');
			}
			return;
		}

		// Remove any existing scroll listeners to avoid duplicates
		if (window._eventLogScrollHandler) {
			window.removeEventListener('scroll', window._eventLogScrollHandler, {passive: true});
			logsTableScroll.removeEventListener('scroll', window._eventLogScrollHandler, {passive: true});
			timerRegistry.clearTimeout('eventLog.scroll');
		}

		// Create new scroll handler with debouncing
		window._eventLogScrollHandler = () => {
			// Clear existing timeout
			timerRegistry.clearTimeout('eventLog.scroll');

			// Set new timeout
			timerRegistry.setTimeout('eventLog.scroll', () => {
				handleScroll();
			}, 150);
		};

		// Check if logsTableScroll has its own scroll
		const hasOwnScroll = logsTableScroll.scrollHeight > logsTableScroll.clientHeight;

		if (hasOwnScroll) {
			// Listen to logsTableScroll scroll
			logsTableScroll.addEventListener('scroll', window._eventLogScrollHandler, {passive: true});
		} else {
			// Listen to page scroll
			window.addEventListener('scroll', window._eventLogScrollHandler, {passive: true});
		}

		// Also listen to wheel events for better detection
		logsTableScroll.addEventListener('wheel', window._eventLogScrollHandler, {passive: true});
	}

	// Function to clear all filters
	function clearAllFilters() {
		// Clear search query
		searchQuery = '';
		const searchInputEl = document.getElementById('searchInput');
		if (searchInputEl) {
			searchInputEl.value = '';
		}

		// Reset all area filters to active
		activeFilters = new Set(['tool', 'session', 'general']);
		document.querySelectorAll('.level-filter-btn').forEach(btn => {
			const level = btn.dataset.level;
			if (activeFilters.has(level)) {
				btn.classList.add('active');
			} else {
				btn.classList.remove('active');
			}
		});

		// Select all people
		if (allPersonIds.size > 0) {
			selectedPersonIds = new Set(allPersonIds);
			// Update checkboxes in user filter dropdown
			const dropdownContent = document.getElementById('personFilterDropdownContent');
			if (dropdownContent) {
				dropdownContent.querySelectorAll('.person-filter-checkbox').forEach(checkbox => {
					const checkboxUserId = checkbox.getAttribute('data-user-id');
					if (checkboxUserId) {
						checkbox.checked = selectedPersonIds.has(checkboxUserId);
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
				isHoverPreviewActive = false;
			}
			// Avoid flickering if clicking on "All Sessions" when it's already selected
			if (selectedSession === 'all' && item.classList.contains('active')) {
				return;
			}
			document.querySelectorAll('.session-item').forEach(i => i.classList.remove('active'));
			item.classList.add('active');
			selectedSession = 'all';
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
		if (!target) {return;}
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
		}, {passive: true});
	}

	registerDropdownScrollClose(window);
	registerDropdownScrollClose(document.querySelector('.sessions-scrollable'));

	// Keyboard navigation state
	let keyboardNavigationMode = null; // 'sessions'
	let selectedSessionIndex = -1;

	// Remove keyboard selection from all elements
	function clearKeyboardSelection() {
		document.querySelectorAll('.session-item.keyboard-selected').forEach(item => {
			item.classList.remove('keyboard-selected');
		});
	}

	// Get all session items (including "All Sessions")
	function getAllSessionItems() {
		const allSessionsItem = document.querySelector('.session-item[data-session="all"]');
		const sessionItems = Array.from(document.querySelectorAll('#sessionList .session-item'));
		return allSessionsItem ? [allSessionsItem, ...sessionItems] : sessionItems;
	}

	// Navigate sessions with keyboard
	function navigateSessions(direction) {
		const sessions = getAllSessionItems();
		if (sessions.length === 0) {return;}

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
			selectedItem.scrollIntoView({behavior: 'smooth', block: 'nearest'});
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


	// Keyboard event handler
	document.addEventListener('keydown', (e) => {
		// Handle ESC key for modals first
		if (e.key === 'Escape') {
			// Close payload modal if open
			const payloadModal = document.querySelector('.payload-modal-backdrop');
			if (payloadModal) {
				closePayloadModal();
				return;
			}

			// Close confirm dialog if open
			const confirmModal = document.querySelector('.confirm-dialog-backdrop');
			if (confirmModal) {
				confirmModal.remove();
				return;
			}

			// Exit selection mode if active
			if (selectionMode) {
				toggleSelectionMode();
				return;
			}
		}

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
			}
			break;

		case 'ArrowUp':
			e.preventDefault();
			if (keyboardNavigationMode === 'sessions' || (!keyboardNavigationMode && document.activeElement.closest('.sidebar'))) {
				navigateSessions('up');
			}
			break;

		case 'Enter':
			e.preventDefault();
			if (keyboardNavigationMode === 'sessions') {
				activateSelectedSession();
			}
			break;

		case 'Escape':
			clearKeyboardSelection();
			keyboardNavigationMode = null;
			selectedSessionIndex = -1;
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
		}
	});


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
		if (!dropdown) {return;}
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


	async function copyEventPayload(eventId) {
		try {
			let payload;

			// First check if we already have the payload data loaded from expanding the row
			const eventIndex = allLoadedEvents.findIndex(e => e.id === eventId);
			if (eventIndex !== -1 && allLoadedEvents[eventIndex].data) {
				payload = allLoadedEvents[eventIndex].data;
			} else {
				// Fetch the complete event (including payload) from the API
				const response = await fetch(`/api/events/${eventId}`);
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText || 'Unable to load event'}`);
				}
				const data = await response.json();
				if (!data?.event) {
					throw new Error('Event payload not available');
				}
				// data.event.data now contains the original payload exactly as received
				payload = data.event.data || {};

				// Cache the payload data for future use
				if (eventIndex !== -1) {
					allLoadedEvents[eventIndex].data = payload;
				}
			}

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
			safeShowToast(`Error copying payload: ${  error.message}`, 'error');
		}
	}


	function confirmDeleteEvent(eventId) {
		openConfirmModal({
			title: 'Move event to trash',
			message: 'Are you sure you want to move this event to the trash? You can recover it later from the trash bin.',
			confirmLabel: 'Move to trash',
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
				headers: getCsrfHeaders(false),
				credentials: 'include' // Ensure cookies are sent
			});
			const validResponse = await handleApiResponse(response);
			if (!validResponse) {return;}

			// Close dropdown
			closeAllDropdowns();

			// Refresh the view
			loadEventTypeStats(selectedSession);
			loadSessions();
			loadEvents();
		} catch (error) {
			console.error('Error deleting event:', error);
			safeShowToast(`Error deleting the event: ${  error.message}`, 'error');
		}
	}

	function toggleSelectionMode() {
		selectionMode = !selectionMode;
		const toggleBtn = document.getElementById('toggleSelectionModeBtn');
		const allSessionsItem = document.querySelector('.session-item[data-session="all"]');

		if (toggleBtn) {
			if (selectionMode) {
				toggleBtn.classList.add('active');
				// Add selection mode class to body
				document.body.classList.add('selection-mode');
				// Disable "All Sessions" when entering selection mode
				if (allSessionsItem) {
					allSessionsItem.classList.add('disabled');
				}
			} else {
				toggleBtn.classList.remove('active');
				// Remove selection mode class from body
				document.body.classList.remove('selection-mode');
				// Clear selection when exiting selection mode
				selectedSessionsForDeletion.clear();
				lastSelectedSessionId = null;
				// Re-enable "All Sessions" when exiting selection mode
				if (allSessionsItem) {
					allSessionsItem.classList.remove('disabled');
				}
			}
		}
		// Update delete button visibility
		updateDeleteSelectedButton();

		// Toggle checkbox visibility without reloading sessions
		const checkboxes = document.querySelectorAll('.session-checkbox');
		if (selectionMode) {
			// Entering selection mode - show all checkboxes
			checkboxes.forEach((checkbox) => {
				checkbox.classList.add('show');
			});
			// Also show checkboxes for any previously selected sessions
			selectedSessionsForDeletion.forEach(sessionId => {
				const checkbox = document.getElementById(`session-checkbox-${escapeHtml(sessionId)}`);
				if (checkbox && !checkbox.classList.contains('show')) {
					checkbox.classList.add('show');
				}
			});
		} else {
			// Exiting selection mode - hide all checkboxes
			checkboxes.forEach((checkbox) => {
				checkbox.classList.remove('show');
			});
		}
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
					// Show checkbox when selected
					checkbox.classList.add('show');
					// Add selected class to session item
					const sessionItem = checkbox.closest('.session-item');
					if (sessionItem) {
						sessionItem.classList.add('selected');
					}
					// Trigger animation
					checkbox.classList.remove('just-unchecked');
					// eslint-disable-next-line no-unused-expressions
					checkbox.offsetWidth; // Force reflow
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
				// Hide checkbox when deselected
				checkbox.classList.remove('show');
				// Remove selected class from session item
				const sessionItem = checkbox.closest('.session-item');
				if (sessionItem) {
					sessionItem.classList.remove('selected');
				}
				// Trigger animation by temporarily removing and re-adding checked state
				checkbox.classList.remove('just-checked');
				// eslint-disable-next-line no-unused-expressions
				checkbox.offsetWidth; // Force reflow
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
				// Show checkbox when selected
				checkbox.classList.add('show');
				// Add selected class to session item
				const sessionItem = checkbox.closest('.session-item');
				if (sessionItem) {
					sessionItem.classList.add('selected');
				}
				// Trigger animation by temporarily removing and re-adding checked state
				checkbox.classList.remove('just-unchecked');
				// eslint-disable-next-line no-unused-expressions
				checkbox.offsetWidth; // Force reflow
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

	function clearSelectedSessions() {
		// Clear all selected sessions
		selectedSessionsForDeletion.forEach(sessionId => {
			const checkbox = document.getElementById(`session-checkbox-${escapeHtml(sessionId)}`);
			if (checkbox) {
				checkbox.checked = false;
				checkbox.classList.remove('show');
				// Remove selected class from session item
				const sessionItem = checkbox.closest('.session-item');
				if (sessionItem) {
					sessionItem.classList.remove('selected');
				}
			}
		});

		// Clear the selection set
		selectedSessionsForDeletion.clear();
		lastSelectedSessionId = null;

		// Update buttons
		updateDeleteSelectedButton();
	}

	function updateDeleteSelectedButton() {
		const selectionButtonsGroup = document.querySelector('.selection-buttons-group');
		const deleteSelectedBtn = document.getElementById('deleteSelectedSessionsBtn');
		const count = selectedSessionsForDeletion.size;

		if (count > 0 && selectionMode) {
			// Show the buttons group when in selection mode and have items selected
			if (selectionButtonsGroup) {
				selectionButtonsGroup.classList.add('visible');
			}
			if (deleteSelectedBtn) {
				deleteSelectedBtn.innerHTML = `<i class="fa-solid fa-trash"></i> Delete (${count})`;
			}
		} else {
			// Hide the buttons group
			if (selectionButtonsGroup) {
				selectionButtonsGroup.classList.remove('visible');
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
				headers: getCsrfHeaders(false),
				credentials: 'include' // Ensure cookies are sent
			});
			const validResponse = await handleApiResponse(response);
			if (!validResponse) {return;}

			// Close dropdown
			closeAllDropdowns();

			// If we were viewing this session, switch to "all"
			if (selectedSession === sessionId) {
				selectedSession = 'all';
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
			safeShowToast(`Error deleting the session: ${  error.message}`, 'error');
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
					headers: getCsrfHeaders(false),
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

			// Exit selection mode if active
			if (selectionMode) {
				toggleSelectionMode();
			}

			// If we were viewing one of the deleted sessions, switch to "all"
			if (sessionsToDelete.includes(selectedSession)) {
				selectedSession = 'all';
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
			safeShowToast(`Error deleting sessions: ${  error.message}`, 'error');
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

		// Skip if listeners are already initialized
		if (wrapper.dataset.listenersInitialized === 'true') {
			return;
		}

		let hoverDepth = 0;

		const openLegend = () => {
			timerRegistry.clearTimeout('eventLog.legendClose');
			wrapper.classList.add('is-open');
		};

		const scheduleClose = () => {
			timerRegistry.clearTimeout('eventLog.legendClose');
			timerRegistry.setTimeout('eventLog.legendClose', () => {
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

		// Mark as initialized
		wrapper.dataset.listenersInitialized = 'true';
	}

	async function loadDatabaseSize() {
		try {
			// Check if we have fresh cached database size data (cache for 30 seconds since it updates frequently)
			let data;
			const cacheKey = 'databaseSize';
			const thirtySecondsAgo = Date.now() - (30 * 1000);
			const lastUpdated = window.__globalDataCache.lastUpdated[cacheKey];

		if (lastUpdated && lastUpdated > thirtySecondsAgo && window.__globalDataCache[cacheKey]) {
			data = window.__globalDataCache[cacheKey];
			} else {
				const response = await fetch('/api/database-size', {
					credentials: 'include' // Ensure cookies are sent
				});
				const validResponse = await handleApiResponse(response);
				if (!validResponse) {return;}
				data = await validResponse.json();
				window.__globalDataCache[cacheKey] = data;
				window.__globalDataCache.lastUpdated[cacheKey] = Date.now();
			}
			if (data.status === 'ok') {
				const displayText = data.displayText || data.sizeFormatted;
				if (displayText) {
					const dbSizeElement = document.getElementById('dbSize');
					if (!dbSizeElement) {
						return;
					}
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
		} catch {
			// Silently fail if database size is not available
		}
	}

	// User filter dropdown management
	async function loadPeople() {
		try {
			// Check if we have fresh cached telemetry people data
		let data;
		if (window.isCacheFresh('telemetryUsers')) {
			data = window.__globalDataCache.telemetryUsers;
			} else {
				const response = await fetch('/api/telemetry-users?limit=50', {
					credentials: 'include'
				});
				const validResponse = await handleApiResponse(response);
				if (!validResponse) {return;}
				data = await validResponse.json();
				window.updateCache('telemetryUsers', data);
			}

			// Check if response is an error object
			if (data && data.status === 'error') {
				console.error('Error loading users:', data.message);
				safeShowToast('Error loading users', 'error');
				return;
			}

			const optionsContainer = document.getElementById('personFilterOptions');
			if (!optionsContainer) {return;}

			// Clear existing options
			optionsContainer.innerHTML = '';

			// Normalize API response to consistent objects { id, label }
			const normalizedPeople = (Array.isArray(data) ? data : [])
				.map(entry => {
					if (entry && typeof entry === 'object' && typeof entry.id === 'string') {
						const trimmedId = entry.id.trim();
						if (!trimmedId) {
							return null;
						}
						const label = typeof entry.label === 'string' && entry.label.trim() !== ''? entry.label.trim(): trimmedId;
						return {id: trimmedId, label};
					}
					if (typeof entry === 'string') {
						const trimmedValue = entry.trim();
						return trimmedValue ? {id: trimmedValue, label: trimmedValue} : null;
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
				}, {seen: new Set(), values: []}).values;

			if (normalizedPeople.length === 0) {
				allPersonIds = new Set();
				selectedPersonIds.clear();
				optionsContainer.innerHTML = '<div class="person-filter-empty">No people found</div>';
				return;
			}

			const allIdsArray = normalizedPeople.map(user => user.id);

			// Update allPersonIds and select all people by default if this is the first load
			const previousSelection = new Set(selectedPersonIds);
			allPersonIds = new Set(allIdsArray);
			const isFirstLoad = previousSelection.size === 0;
			if (isFirstLoad) {
				// Select all people by default
				selectedPersonIds = new Set(allIdsArray);
			} else {
				// Keep only IDs that still exist
				selectedPersonIds = new Set(
					Array.from(previousSelection).filter(userId => allPersonIds.has(userId))
				);
			}

			// For autocomplete, we don't need Select All/Deselect All buttons
			// Users can select individual people or use the input to filter

			// Color palette for user indicators (matching chart colors)
			const userColors = [
				'#3B82F6', // blue-500
				'#EF4444', // red-500
				'#10B981', // emerald-500
				'#F59E0B', // amber-500
				'#8B5CF6', // violet-500
				'#06B6D4', // cyan-500
				'#F97316', // orange-500
				'#84CC16', // lime-500
				'#EC4899', // pink-500
				'#6B7280'  // gray-500 (fallback)
			];

			// Create el-option elements for each user
			normalizedPeople.forEach((user, index) => {
				const userId = user.id;
				const userLabel = user.label || userId;

				// Assign color to user (cycle through color palette)
				const userColor = userColors[index % userColors.length];

				// Create the el-option element
				const optionElement = document.createElement('el-option');
				optionElement.setAttribute('value', userId);
				optionElement.className = 'block px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white';
				optionElement.innerHTML = `
					<div class="flex items-center">
						<span aria-hidden="true" class="inline-block size-2 shrink-0 rounded-full forced-colors:bg-[Highlight]" style="background-color: ${userColor}"></span>
						<span class="ml-3 truncate">
							${escapeHtml(userLabel)}
						</span>
					</div>
				`;

				optionsContainer.appendChild(optionElement);
			});
		} catch (error) {
			console.error('Error loading users:', error);
		}
	}

	function setupPersonFilterLabel() {
		const personFilterInput = document.getElementById('autocomplete');
		if (!personFilterInput) {
			return;
		}

		// Skip if listeners are already initialized
		if (personFilterInput.dataset.listenersInitialized === 'true') {
			return;
		}

		const enforceUsersLabel = () => {
			if (personFilterInput.value !== 'People') {
				personFilterInput.value = 'People';
			}
		};

		enforceUsersLabel();
		personFilterInput.addEventListener('change', enforceUsersLabel);
		personFilterInput.addEventListener('blur', enforceUsersLabel);

		const optionsContainer = document.getElementById('personFilterOptions');
		if (optionsContainer) {
			optionsContainer.addEventListener('click', (event) => {
				if (event.target.closest('el-option')) {
					requestAnimationFrame(() => {
						enforceUsersLabel();
					});
				}
			});
		}

		// Mark as initialized
		personFilterInput.dataset.listenersInitialized = 'true';
	}

	// Show user filter dropdown (used by both click and hover)
	function showPersonFilterDropdown() {
		const dropdown = document.getElementById('personFilterDropdown');
		const chevron = document.getElementById('personFilterChevron');
		if (!dropdown || !chevron) {return;}

		const isVisible = !dropdown.classList.contains('hidden');
		if (!isVisible) {
			dropdown.classList.remove('hidden');
			chevron.style.transform = 'rotate(180deg)';
			// Load people if not already loaded
			const optionsContainer = document.getElementById('personFilterOptions');
			if (optionsContainer && optionsContainer.children.length === 0) {
				loadPeople();
			}
		}
	}

	// Hide user filter dropdown
	function hidePersonFilterDropdown() {
		const dropdown = document.getElementById('personFilterDropdown');
		const chevron = document.getElementById('personFilterChevron');
		if (!dropdown || !chevron) {return;}

		dropdown.classList.add('hidden');
		chevron.style.transform = 'rotate(0deg)';
	}

	window.togglePersonFilterDropdown = function(event) {
		event.stopPropagation();
		const dropdown = document.getElementById('personFilterDropdown');
		const chevron = document.getElementById('personFilterChevron');
		if (!dropdown || !chevron) {return;}

		const isVisible = !dropdown.classList.contains('hidden');
		if (isVisible) {
			hidePersonFilterDropdown();
		} else {
			showPersonFilterDropdown();
		}
	};

	// Close user filter dropdown when clicking outside
	document.addEventListener('click', (event) => {
		const dropdown = document.getElementById('personFilterDropdown');
		const dropdownContainer = event.target.closest('.person-filter-dropdown-container');

		if (dropdown && !dropdown.classList.contains('hidden')) {
			if (!dropdownContainer && !dropdown.contains(event.target)) {
				hidePersonFilterDropdown();
			}
		}
	});

	// Setup hover functionality for user filter dropdown
	(function setupPersonFilterDropdownHover() {
		const USER_FILTER_HIDE_DELAY_MS = 300;

		const container = document.querySelector('.person-filter-dropdown-container');
		if (!container) {
			return;
		}

		const dropdown = document.getElementById('personFilterDropdown');
		if (!dropdown) {
			return;
		}

		const cancelHide = () => {
			timerRegistry.clearTimeout('eventLog.personFilterHide');
		};

		const scheduleHide = () => {
			cancelHide();
			timerRegistry.setTimeout('eventLog.personFilterHide', () => {
				hidePersonFilterDropdown();
			}, USER_FILTER_HIDE_DELAY_MS);
		};

		// Treat the button + dropdown as a single hover region
		const isInsideDropdownRegion = (node) => {
			if (!node) {
				return false;
			}
			return container.contains(node) || dropdown.contains(node);
		};

		const handleMouseEnter = () => {
			cancelHide();
			showPersonFilterDropdown();
		};

		const handleMouseLeave = (event) => {
			const nextTarget = event?.relatedTarget;
			if (nextTarget && isInsideDropdownRegion(nextTarget)) {
				return;
			}
			scheduleHide();
		};

		// Add hover listeners to container
		container.addEventListener('mouseenter', handleMouseEnter);
		container.addEventListener('mouseleave', handleMouseLeave);

		// Add hover listeners to dropdown itself
		dropdown.addEventListener('mouseenter', handleMouseEnter);
		dropdown.addEventListener('mouseleave', handleMouseLeave);
	}());

	function setupTabs() {
		const sessionsTab = document.getElementById('sessionsTab');
		const peopleTab = document.getElementById('peopleTab');
		const teamsTab = document.getElementById('teamsTab');

		// Skip if listeners are already initialized
		if (sessionsTab?.dataset.listenersInitialized === 'true') {
			return;
		}

		if (sessionsTab) {
			sessionsTab.addEventListener('click', () => {
				switchTab('sessions');
			});
		}

		if (peopleTab) {
			peopleTab.addEventListener('click', () => {
				switchTab('people');
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
		window.addEventListener('resize', () => {
			timerRegistry.clearTimeout('eventLog.tabResize');
			timerRegistry.setTimeout('eventLog.tabResize', () => {
				updateTabIndicator();
			}, 100);
		});

		// Mark as initialized
		if (sessionsTab) {
			sessionsTab.dataset.listenersInitialized = 'true';
		}
	}

	function pauseEventLogPage() {
		// Pause all intervals when leaving the page
		timerRegistry.clearAll();

		// Remove event delegation listeners
		const sessionList = document.getElementById('sessionList');
		if (sessionList && sessionListDelegationHandler) {
			sessionList.removeEventListener('click', sessionListDelegationHandler);
			sessionListDelegationHandler = null;
		}

		const peopleList = document.getElementById('peopleList');
		if (peopleList && peopleListDelegationHandler) {
			peopleList.removeEventListener('click', peopleListDelegationHandler);
			peopleListDelegationHandler = null;
		}

		const teamList = document.getElementById('teamList');
		if (teamList && teamsListDelegationHandler) {
			teamList.removeEventListener('click', teamsListDelegationHandler);
			teamsListDelegationHandler = null;
		}

		const logsTableScroll = document.getElementById('logsTableScroll');
		if (logsTableScroll && tableRowDelegationHandler) {
			logsTableScroll.removeEventListener('click', tableRowDelegationHandler);
			tableRowDelegationHandler = null;
		}

		// Clean up initialization flags so listeners can be re-added when returning to page
		document.querySelectorAll('[data-listeners-initialized]').forEach(el => {
			delete el.dataset.listenersInitialized;
		});

		// Clean up session activity chart
		cleanupSessionActivityChart();
	}

	async function resumeEventLogPage(fromCache = false) {
		// Resume intervals if they were active before pausing
		// Note: We don't re-fetch data here since the UI is preserved
		// Only restart intervals that should be running
		if (autoRefreshEnabledState && !timerRegistry.has('eventLog.autoRefresh')) {
			updateAutoRefreshInterval();
		}

		// Only reload sessions if this is not a cache restoration
		// When fromCache=true, the DOM is preserved so sessions are already there
		if (!fromCache) {
			// Re-bind event listeners for session list items that may have been lost during soft navigation
			await loadSessions();
		}

		// Always re-bind search input since event listeners are lost during soft navigation
		bindSearchInput();
		// Restart last updated interval if it was running
		const lastUpdatedEl = document.querySelector('.last-updated-text');
		if (lastUpdatedEl && !timerRegistry.has('eventLog.lastUpdated')) {
			timerRegistry.setInterval('eventLog.lastUpdated', () => {
				if (lastFetchTime) {
					const elapsed = Date.now() - lastFetchTime;
					const minutes = Math.floor(elapsed / 60000);
					const seconds = Math.floor((elapsed % 60000) / 1000);
					if (minutes > 0) {
						lastUpdatedEl.textContent = `${minutes}m ${seconds}s ago`;
					} else {
						lastUpdatedEl.textContent = `${seconds}s ago`;
					}
				}
			}, 1000);
		}

		// Re-mount the chart if we have events to display
		if (lastSessionActivityEvents.length > 0) {
			await mountSessionActivityChart();
			renderSessionActivityChart(lastSessionActivityEvents, {
				sessionId: selectedSession,
				sessionDisplayMap
			});
		}
	}

	function initializeApp(forceLogsPage = false) {
		runSafeInitStep('notification button state', updateNotificationButtonState);
		runSafeInitStep('theme initialization', initTheme);
		runSafeInitStep('user menu structure', ensureUserMenuStructure);
		// Note: setupUserMenuHover is now auto-initialized in user-menu.js
		runSafeInitStep('level filters setup', setupLevelFilters);
		runSafeInitStep('sidebar resizer setup', setupSidebarResizer);
		runSafeInitStep('horizontal resizer setup', setupHorizontalResizer);
		runSafeInitStep('session legend hover', setupSessionLegendHover);
		runSafeInitStep('tabs setup', setupTabs);
		runSafeInitStep('user filter label', setupPersonFilterLabel);
		runSafeInitStep('session list delegation', setupSessionListDelegation); // Event delegation for sessions
		runSafeInitStep('people list delegation', setupPeopleListDelegation); // Event delegation for people
		runSafeInitStep('teams list delegation', setupTeamsListDelegation); // Event delegation for teams
		runSafeInitStep('table row delegation', setupTableRowDelegation); // Event delegation for table rows
		runSafeInitStep('search input binding', bindSearchInput);
		runSafeAsyncInitStep('event type stats', () => loadEventTypeStats(selectedSession));
		runSafeAsyncInitStep('sessions list', () => {
			// Only load sessions list if we're on the logs page and DOM is ready
			const shouldLoadSessions = forceLogsPage || window.location.pathname === '/logs' || window.location.pathname === '/logs/';
			if (shouldLoadSessions) {
				if (document.readyState === 'loading') {
					window.addEventListener('DOMContentLoaded', () => loadSessions());
				} else {
					loadSessions();
				}
			}
		});
		runSafeAsyncInitStep('events table', () => loadEvents());
		// Lazy load database size and people list - they're not critical for initial render
		runSafeAsyncInitStep('database size', () => {
			// Delay database size load slightly to prioritize critical data
			setTimeout(() => loadDatabaseSize(), 2000);
		});
		runSafeAsyncInitStep('people list', () => {
			// Delay people list load slightly to prioritize critical data
			setTimeout(() => {
				// Only load people list if we're on the logs page and DOM is ready
				const currentPath = window.location.pathname;
				if (currentPath === '/logs' || currentPath === '/logs/') {
					if (document.readyState === 'loading') {
						window.addEventListener('DOMContentLoaded', () => loadPeopleList());
					} else {
						loadPeopleList();
					}
				}
			}, 300);
		});
		runSafeAsyncInitStep('teams list', () => {
			// Ensure DOM is ready before loading teams list
			if (document.readyState === 'loading') {
				window.addEventListener('DOMContentLoaded', () => loadTeamsList());
			} else {
				loadTeamsList();
			}
		});
		runSafeAsyncInitStep('people for filter', () => loadPeople());
		runSafeAsyncInitStep('auto refresh', () => updateAutoRefreshInterval());
		runSafeInitStep('infinite scroll', () => setupInfiniteScroll());

		// Listen for chart rendering completion
		window.addEventListener('chartRenderComplete', (event) => {
			const revealState = window.getEventLogChartRevealState({
				isInitialChartLoad,
				eventDetail: event?.detail
			});
			isInitialChartLoad = revealState.nextIsInitialChartLoad;
			if (revealState.shouldReveal) {
				// Show the page once initial chart render is complete
				revealEventLogShell();
			}
		});
	}

	// Expose a re-initializer so soft navigation can rebuild the page
	window.initializeEventLogApp = function({resetState = false, forceLogsPage = false} = {}) {
		if (resetState) {
			// Don't reset state if we already have sessions loaded (preserves user selections)
			const sessionList = document.getElementById('sessionList');
			const hasSessionsLoaded = sessionList && sessionList.children.length > 0;
			if (!hasSessionsLoaded) {
				resetEventLogState();
			}
		}
		initializeApp(forceLogsPage);
	};

	// Expose pause/resume hooks for soft navigation
	window.pauseEventLogPage = pauseEventLogPage;
	window.resumeEventLogPage = resumeEventLogPage;

	// Listen for soft navigation events
	window.addEventListener('softNav:pagePausing', (event) => {
		if (event?.detail?.path === '/logs') {
			pauseEventLogPage();
		}
	});

	window.addEventListener('softNav:pageMounted', async (event) => {
		if (event?.detail?.path === '/logs') {
			const fromCache = event?.detail?.fromCache === true;
			if (fromCache) {
				// Page was restored from cache - resume intervals and restore chart
				await resumeEventLogPage(true);
			} else {
				// New page load - full initialization
				window.initializeEventLogApp({resetState: true, forceLogsPage: true});
			}
		}
	});

	window.initializeEventLogApp();
	// Handle smooth hover animation for icon buttons group
	(function() {
		const iconButtonsGroup = document.querySelector('.icon-buttons-group');
		if (!iconButtonsGroup) {return;}

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
					// eslint-disable-next-line no-unused-expressions
					iconButtonsGroup.offsetHeight;

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
	}());

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


	// Scroll to a specific event in the main logs table
	function scrollToEvent(eventId) {
		const eventRow = document.querySelector(`tr[data-event-id="${eventId}"]`);
		if (eventRow) {
			eventRow.scrollIntoView({behavior: 'smooth', block: 'center'});
			// Highlight the row briefly
			eventRow.classList.add('keyboard-selected');
			setTimeout(() => {
				eventRow.classList.remove('keyboard-selected');
			}, 2000);
		}
	}

	// Expose handlers used by inline HTML attributes
	// Note: showUserMenu and handleLogout are now exposed by user-menu.js
	// Note: openSettingsModal is now exposed by settings-modal.js
	window.refreshLogs = refreshLogs;
	window.toggleNotificationMode = toggleNotificationMode;
	window.toggleSelectionMode = toggleSelectionMode;
	window.clearSelectedSessions = clearSelectedSessions;
	// Load and display event payload in a modal
	async function loadEventPayload(eventId) {
		try {
			let payload;

			// First check if we already have the payload data loaded from expanding the row
			const eventIndex = allLoadedEvents.findIndex(e => e.id === eventId);
			if (eventIndex !== -1 && allLoadedEvents[eventIndex].data) {
				payload = allLoadedEvents[eventIndex].data;
			} else {
				// Fetch the complete event (including payload) from the API
				const response = await fetch(`/api/events/${eventId}`);
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText || 'Unable to load event'}`);
				}
				const data = await response.json();
				if (!data?.event) {
					throw new Error('Event payload not available');
				}
				// data.event.data now contains the original payload exactly as received
				payload = data.event.data || {};

				// Cache the payload data for future use
				if (eventIndex !== -1) {
					allLoadedEvents[eventIndex].data = payload;
				}
			}

			// Show payload in modal
			showPayloadModal(payload, eventId);
		} catch (error) {
			console.error('Error loading event payload:', error);
			safeShowToast(`Error loading event payload: ${  error.message}`, 'error');
		}
	}

	// Show payload modal
	function showPayloadModal(payload, eventId) {
		// Remove existing payload modal if any
		const existingModal = document.querySelector('.payload-modal-backdrop');
		if (existingModal) {
			existingModal.remove();
		}

		// Create backdrop
		const backdrop = document.createElement('div');
		backdrop.className = 'confirm-modal-backdrop payload-modal-backdrop';

		// Create modal
		const modal = document.createElement('div');
		modal.className = 'confirm-modal payload-modal';

		// Format payload as pretty JSON
		const formattedPayload = JSON.stringify(payload, null, 2);

		modal.innerHTML = `
			<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 dark:bg-gray-800">
				<div class="payload-modal-header">
					<h3 id="payload-modal-title" class="text-base font-semibold text-gray-900 dark:text-white">Payload</h3>
				</div>
				<div class="payload-modal-content">
					<div class="relative mt-4">
						<div class="rounded-lg bg-white outline-1 -outline-offset-1 outline-gray-300 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 dark:bg-gray-800/50 dark:outline-white/10 dark:focus-within:outline-indigo-500">
							<label for="payload-code" class="sr-only">Event Payload JSON</label>
							<pre class="focus:outline-none payload-modal-code px-3 py-1.5"><code id="payload-code" class="language-json" aria-label="Event payload JSON"></code></pre>

							<!-- Spacer element to match the height of the toolbar -->
							<div aria-hidden="true">
								<div class="py-2">
									<div class="h-9"></div>
								</div>
								<div class="h-px"></div>
								<div class="py-2">
									<div class="py-px">
										<div class="h-9"></div>
									</div>
								</div>
							</div>
						</div>

						<div class="absolute inset-x-px top-0">
							<!-- Actions: positioned at top like textarea toolbar -->
							<div class="flex flex-nowrap justify-end space-x-2 px-2 py-2 sm:px-3">
								<button type="button" class="inline-flex items-center rounded-full bg-gray-50 px-2 py-2 text-xs font-medium whitespace-nowrap hover:bg-gray-100 sm:px-3 dark:bg-white/5 dark:hover:bg-white/10" data-action="copy">
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4 shrink-0 text-gray-300 sm:-ml-1 dark:text-gray-500">
										<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
									</svg>
									<span class="hidden truncate text-gray-500 sm:block dark:text-gray-400" data-copy-text>Copy</span>
								</button>
								<button type="button" class="inline-flex items-center rounded-full bg-gray-50 px-2 py-2 text-xs font-medium whitespace-nowrap hover:bg-gray-100 sm:px-3 dark:bg-white/5 dark:hover:bg-white/10" data-action="save">
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4 shrink-0 text-gray-300 sm:-ml-1 dark:text-gray-500">
										<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
									</svg>
									<span class="hidden truncate text-gray-500 sm:block dark:text-gray-400">Save</span>
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
			<div class="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 dark:bg-gray-800/50">
				<button type="button" class="inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:ml-3 sm:w-auto dark:bg-gray-700 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-600" data-action="close-modal">Close</button>
			</div>
		`;

		backdrop.appendChild(modal);
		document.body.appendChild(backdrop);
		// Use double requestAnimationFrame to ensure initial state is processed before transition
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				backdrop.classList.add('visible');
			});
		});

		const codeElement = modal.querySelector('#payload-code');
		if (codeElement) {
			codeElement.textContent = formattedPayload;
			// Apply Highlight.js syntax highlighting
			// Use requestAnimationFrame to ensure Highlight.js is loaded
			requestAnimationFrame(() => {
				if (window.hljs && typeof window.hljs.highlightElement === 'function') {
					window.hljs.highlightElement(codeElement);
				} else {
					// Fallback: wait a bit more if Highlight.js isn't ready yet
					setTimeout(() => {
						if (window.hljs && typeof window.hljs.highlightElement === 'function') {
							window.hljs.highlightElement(codeElement);
						}
					}, 100);
				}
			});
		}

		const closeAction = modal.querySelector('[data-action="close-modal"]');
		const copyBtn = modal.querySelector('[data-action="copy"]');
		const saveBtn = modal.querySelector('[data-action="save"]');

		const handleClose = () => closePayloadModal();
		if (closeAction) {closeAction.addEventListener('click', handleClose);}
		if (copyBtn) {
			copyBtn.addEventListener('click', async () => {
				try {
					await navigator.clipboard.writeText(formattedPayload);
					const textSpan = copyBtn.querySelector('[data-copy-text]');
					if (textSpan) {
						const originalText = textSpan.textContent;
						textSpan.textContent = 'Copied!';
						copyBtn.disabled = true;
						setTimeout(() => {
							textSpan.textContent = originalText;
							copyBtn.disabled = false;
						}, 1600);
					}
				} catch (error) {
					console.error('Error copying payload:', error);
					safeShowToast(`Error copying payload: ${  error.message}`, 'error');
				}
			});
		}
		if (saveBtn) {
			saveBtn.addEventListener('click', () => {
				// Create a blob with the JSON content
				const blob = new Blob([formattedPayload], {type: 'application/json'});
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `event-payload-${eventId}.json`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
				safeShowToast('Payload saved successfully', 'success');
			});
		}

		// Close modal when clicking backdrop
		backdrop.addEventListener('click', (e) => {
			if (e.target === backdrop) {
				closePayloadModal();
			}
		});

		// Close modal on Escape key and handle Cmd+A/Ctrl+A
		const handleKeydown = function(e) {
			if (e.key === 'Escape') {
				closePayloadModal();
			} else if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
				// Check if focus is within the payload modal
				const activeElement = document.activeElement;
				const isInModal = backdrop.contains(activeElement) || backdrop === activeElement;

				if (isInModal) {
					e.preventDefault();
					// Select all text in the code element
					const codeEl = modal.querySelector('#payload-code');
					if (codeEl) {
						const range = document.createRange();
						range.selectNodeContents(codeEl);
						const selection = window.getSelection();
						selection.removeAllRanges();
						selection.addRange(range);
					}
				}
			}
		};
		modal._payloadKeydownHandler = handleKeydown;
		document.addEventListener('keydown', handleKeydown);
	}

	// Close payload modal
	function closePayloadModal() {
		const modal = document.querySelector('.payload-modal-backdrop');
		if (modal) {
			const dialog = modal.querySelector('.payload-modal');
			if (dialog?._payloadKeydownHandler) {
				document.removeEventListener('keydown', dialog._payloadKeydownHandler);
			}
			// Add hiding class to trigger transition
			modal.classList.remove('visible');
			modal.classList.add('hiding');
			// Wait for transition to complete before removing
			setTimeout(() => {
				modal.remove();
			}, 150); // Match transition duration
		}
	}

	// Wrapper functions for day navigation that handle re-rendering the chart
	function handleNavigateToPreviousDay() {
		navigateToPreviousDay((newDate) => {
			setSelectedActivityDate(newDate);
			// Re-render chart with the new date
			if (lastSessionActivityEvents.length > 0) {
				renderSessionActivityChart(lastSessionActivityEvents, {
					sessionId: selectedSession,
					sessionDisplayMap,
					activityDate: newDate
				});
			}
		});
	}

	function handleNavigateToNextDay() {
		navigateToNextDay((newDate) => {
			setSelectedActivityDate(newDate);
			// Re-render chart with the new date
			if (lastSessionActivityEvents.length > 0) {
				renderSessionActivityChart(lastSessionActivityEvents, {
					sessionId: selectedSession,
					sessionDisplayMap,
					activityDate: newDate
				});
			}
		});
	}

	window.confirmDeleteSelectedSessions = confirmDeleteSelectedSessions;
	window.toggleMobileSidebar = toggleMobileSidebar;
	window.navigateToPreviousDay = handleNavigateToPreviousDay;
	window.navigateToNextDay = handleNavigateToNextDay;
	window.scrollToEvent = scrollToEvent;
	window.loadEventPayload = loadEventPayload;
	window.closePayloadModal = closePayloadModal;
	window.toggleActionsDropdown = toggleActionsDropdown;
	window.copyEventPayload = copyEventPayload;
	window.confirmDeleteEvent = confirmDeleteEvent;
	window.toggleRowExpand = toggleRowExpand;


} // end guard to avoid duplicate execution
