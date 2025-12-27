// @ts-nocheck
import {toggleTheme, applyTheme} from './theme.js';

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
				console.info('[Event Log] Using cached auth data from previous page load');
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
		if (lastUpdatedIntervalId) {
			clearInterval(lastUpdatedIntervalId);
		}
		lastUpdatedIntervalId = setInterval(() => {
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
	let selectedActivityDate = null; // null means use current day by default
	let activeFilters = new Set(['tool', 'session', 'general']);
	let selectedUserIds = new Set(); // Will be populated with all users when loaded - all selected by default
	let allUserIds = new Set(); // Track all available user IDs
	let selectedSessionsForDeletion = new Set(); // Track sessions selected for deletion
	let selectionMode = false; // Track if selection mode is active
	let lastSelectedSessionId = null; // Track last selected session for shift-click range selection
	let searchQuery = '';
	let sortOrder = 'DESC';
	let startTime = performance.now();
	let notificationModeEnabled = false;
	let notificationRefreshIntervalId = null;
	let autoRefreshIntervalId = null;
	let autoRefreshEnabledState = false;
	const autoRefreshIntervalMinutes = '';
	let isRefreshInProgress = false;
	let lastKnownEventTimestamp = null;
	let lastFetchTime = null; // Track when events were last fetched
	let isInitialChartLoad = true; // Track if this is the initial chart load
	let lastUpdatedIntervalId = null; // Interval to update "Last updated" text
	const knownSessionIds = new Set();
	const sessionDisplayMap = new Map();
	let sessionActivityChart = null;
	let savedSessionActivityChartOption = null; // Store chart option when pausing for cache restoration
	let lastSessionActivityEvents = [];
	let activeTab = 'sessions'; // 'sessions' or 'users'
	const SESSION_ACTIVITY_FETCH_LIMIT = 1000;
	// State for hover preview functionality
	let hoverPreviewState = null;
	let isHoverPreviewActive = false;
	let hoverTimeoutId = null;

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
	const SESSION_ACTIVITY_SLOT_MINUTES = 10;
	const SESSION_SERIES_COLORS = [
		'#53cf98',
		'#38bdf8',
		'#f97316',
		'#a78bfa',
		'#fb7185',
		'#22d3ee',
		'#c084fc',
		'#f472b6'
	];
	const OFFICE_START = {hour: 8, minute: 30};
	const OFFICE_END = {hour: 18, minute: 30};
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
	let pendingChartRender = null; // Stores events/options when ECharts isn't ready yet

	function resetEventLogState() {
		currentOffset = 0;
		limit = 50;
		hasMoreEvents = true;
		isLoadingMore = false;
		allLoadedEvents = [];
		selectedSession = 'all';
		selectedActivityDate = null;
		activeFilters = new Set(['tool', 'session', 'general']);
		selectedUserIds = new Set();
		allUserIds = new Set();
		selectedSessionsForDeletion = new Set();
		selectionMode = false;
		lastSelectedSessionId = null;
		searchQuery = '';
		sortOrder = 'DESC';
		startTime = performance.now();
		notificationModeEnabled = false;
		if (notificationRefreshIntervalId) {
			clearInterval(notificationRefreshIntervalId);
			notificationRefreshIntervalId = null;
		}
		if (autoRefreshIntervalId) {
			clearInterval(autoRefreshIntervalId);
			autoRefreshIntervalId = null;
		}
		lastKnownEventTimestamp = null;
		lastFetchTime = null;
		isInitialChartLoad = true;
		if (lastUpdatedIntervalId) {
			clearInterval(lastUpdatedIntervalId);
			lastUpdatedIntervalId = null;
		}
		knownSessionIds.clear();
		sessionDisplayMap.clear();
		if (sessionActivityChart) {
			if (typeof sessionActivityChart.dispose === 'function') {
				sessionActivityChart.dispose();
			}
			sessionActivityChart = null;
		}
		savedSessionActivityChartOption = null;
		lastSessionActivityEvents = [];
		activeTab = 'sessions';
		hoverPreviewState = null;
		isHoverPreviewActive = false;
		hoverTimeoutId = null;
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
	}

	function setupHorizontalResizer() {
		const resizer = document.getElementById('horizontalResizer');
		const activityCard = document.getElementById('sessionActivityCard');
		if (!resizer || !activityCard) {
			console.warn('Horizontal resizer: resizer or activityCard not found', {resizer, activityCard});
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
			if (sessionActivityChart) {
				const chartEl = document.getElementById('sessionActivityChart');
				if (chartEl) {
					sessionActivityChart.resize();
				}
			}
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
				if (sessionActivityChart) {
					setTimeout(() => {
						const chartEl = document.getElementById('sessionActivityChart');
						if (chartEl) {
							sessionActivityChart.resize();
						}
					}, 0);
				}
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
				if (sessionActivityChart) {
					setTimeout(() => {
						const chartEl = document.getElementById('sessionActivityChart');
						if (chartEl) {
							sessionActivityChart.resize();
						}
					}, 0);
				}
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
	}

	function initSessionActivityChart() {
		if (sessionActivityChart) {
			return sessionActivityChart;
		}
		const chartEl = document.getElementById('sessionActivityChart');
		if (!chartEl) {
			logChartTrace('initSessionActivityChart: missing #sessionActivityChart element', {
				sessionActivityCardPresent: Boolean(document.getElementById('sessionActivityCard'))
			});
			return null;
		}
		// Wait for ECharts to load if not available yet
		if (typeof echarts === 'undefined') {
			logChartTrace('initSessionActivityChart: echarts not ready, waiting for echartsLoaded event');
			window.addEventListener('echartsLoaded', function onEChartsLoaded() {
				window.removeEventListener('echartsLoaded', onEChartsLoaded);
				const chart = initSessionActivityChart();
				if (pendingChartRender && chart) {
					const payload = pendingChartRender;
					pendingChartRender = null;
					logChartTrace('initSessionActivityChart: retrying pending render after echarts load', {
						pendingEventCount: payload.events.length,
						targetSession: payload.options?.sessionId
					});
					renderSessionActivityChart(payload.events, payload.options || {});
				}
			}, {once: true});
			return null;
		}
		sessionActivityChart = echarts.init(chartEl);
		logChartTrace('initSessionActivityChart: chart initialized', {
			chartElementReady: Boolean(chartEl),
			existingInstance: Boolean(sessionActivityChart)
		});
		if (pendingChartRender) {
			const payload = pendingChartRender;
			pendingChartRender = null;
			logChartTrace('initSessionActivityChart: applying pending render immediately after init', {
				pendingEventCount: payload.events.length,
				targetSession: payload.options?.sessionId
			});
			renderSessionActivityChart(payload.events, payload.options || {});
		}
		window.addEventListener('resize', () => {
			if (sessionActivityChart) {
				const chartEl = document.getElementById('sessionActivityChart');
				if (chartEl) {
					sessionActivityChart.resize();
				}
			}
		});
		return sessionActivityChart;
	}

	function hideSessionActivityCard() {
		// Show loading state and hide content
		const loading = document.getElementById('sessionActivityLoading');
		const content = document.getElementById('sessionActivityContent');
		if (loading) {
			loading.classList.remove('hidden');
		}
		if (content) {
			content.classList.add('hidden');
		}
		const title = document.getElementById('sessionActivityTitle');
		if (title) {
			title.textContent = 'Timeline';
		}
		const subtitle = document.getElementById('sessionActivitySubtitle');
		if (subtitle) {
			subtitle.textContent = '–';
		}
		lastSessionActivityEvents = [];
		if (sessionActivityChart) {
			sessionActivityChart.clear();
		}
	}

	function showSessionActivityCard() {
		// Hide loading state and show content
		const loading = document.getElementById('sessionActivityLoading');
		const content = document.getElementById('sessionActivityContent');
		if (loading) {
			loading.classList.add('hidden');
		}
		if (content) {
			content.classList.remove('hidden');
		}
		// Resize chart to fit the new available space
		if (sessionActivityChart) {
			// Check if the chart container still exists in the DOM
			const chartEl = document.getElementById('sessionActivityChart');
			if (chartEl) {
				sessionActivityChart.resize();
			} else {
				logChartTrace('showSessionActivityCard: chart container element not found, skipping resize');
			}
		}
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
	function saveChartState() {
		// If already in hover preview, we want to save the original state, not the preview state
		// So we use the saved state's sessionId if available, otherwise use current selectedSession
		if (isHoverPreviewActive && hoverPreviewState) {
			// Already saved the original state, don't overwrite it
			return;
		}
		hoverPreviewState = {
			sessionId: selectedSession,
			activityDate: selectedActivityDate ? new Date(selectedActivityDate) : null,
			events: lastSessionActivityEvents.slice()
		};
	}

	// Restore chart state from hover preview
	function restoreChartState() {
		// Clear any pending hover timeout
		if (hoverTimeoutId !== null) {
			clearTimeout(hoverTimeoutId);
			hoverTimeoutId = null;
		}

		if (!hoverPreviewState || !isHoverPreviewActive) {
			return;
		}
		const savedState = hoverPreviewState;
		hoverPreviewState = null;
		isHoverPreviewActive = false;

		// Restore the selected session
		selectedSession = savedState.sessionId;

		// Restore the selected activity date
		selectedActivityDate = savedState.activityDate ? new Date(savedState.activityDate) : null;

		// Restore the visual state of session buttons
		document.querySelectorAll('.session-item').forEach(i => i.classList.remove('active'));
		document.querySelectorAll('[data-session="all"]').forEach(i => i.classList.remove('active'));

		if (savedState.sessionId === 'all') {
			// Restore "All Sessions" as active
			document.querySelectorAll('[data-session="all"]').forEach(item => {
				item.classList.add('active');
			});
		} else {
			// Restore the specific session as active
			const sessionItem = document.querySelector(`.session-item[data-session="${savedState.sessionId}"]`);
			if (sessionItem) {
				sessionItem.classList.add('active');
			}
		}

		// Restore the chart with saved state
		if (savedState.events && savedState.events.length > 0) {
			renderSessionActivityChart(savedState.events, {sessionId: savedState.sessionId, activityDate: savedState.activityDate});
		} else {
			// If no saved events, reload the chart for the saved session
			updateSessionActivityChart({sessionId: savedState.sessionId});
		}
	}

	// Handle hover preview for session buttons
	async function handleSessionHover(sessionId, sessionData = null) {
		// Don't preview if already selected and not in hover preview
		if (selectedSession === sessionId && !isHoverPreviewActive) {
			return;
		}

		// Clear any existing hover timeout
		if (hoverTimeoutId !== null) {
			clearTimeout(hoverTimeoutId);
			hoverTimeoutId = null;
		}

		// Save current state if not already in hover preview
		if (!isHoverPreviewActive) {
			saveChartState();
		}

		// Extract the session date from sessionData
		let sessionDate = null;
		if (sessionData) {
			const sessionDay = sessionData.last_event || sessionData.first_event || null;
			if (sessionDay) {
				const parsedDate = new Date(sessionDay);
				if (!Number.isNaN(parsedDate.getTime())) {
					sessionDate = parsedDate;
				}
			}
		}

		// Delay the chart update by 150ms
		hoverTimeoutId = setTimeout(async () => {
			isHoverPreviewActive = true;

			// Update chart to show hovered session with smooth transition
			if (sessionId === 'all') {
				try {
					const allEvents = await fetchAllSessionsActivityEvents();
					if (allEvents.length > 0) {
						renderSessionActivityChart(allEvents, {sessionId: 'all', activityDate: sessionDate, enableTransition: true});
					}
				} catch (error) {
					console.error('Error loading hover preview for all sessions:', error);
				}
			} else {
				try {
					const params = new URLSearchParams({
						sessionId: sessionId,
						orderBy: 'created_at',
						order: 'ASC',
						limit: SESSION_ACTIVITY_FETCH_LIMIT.toString()
					});
					const response = await fetch(`/api/events?${params}`);
					const validResponse = await handleApiResponse(response);
					if (validResponse) {
						const data = await validResponse.json();
						if (data.events && data.events.length > 0) {
							// If no session date from sessionData, extract from first event
							if (!sessionDate && data.events.length > 0) {
								const firstEventDate = new Date(data.events[0].timestamp);
								if (!Number.isNaN(firstEventDate.getTime())) {
									sessionDate = firstEventDate;
								}
							}
							renderSessionActivityChart(data.events, {sessionId: sessionId, activityDate: sessionDate, enableTransition: true});
						}
					}
				} catch (error) {
					console.error('Error loading hover preview for session:', error);
				}
			}

			hoverTimeoutId = null;
		}, 150);
	}

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
			renderSessionActivityChart(eventsOverride, {sessionId: targetSession});
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
					// If this is the initial load and there are no events, show the page anyway
					if (isInitialChartLoad) {
						isInitialChartLoad = false;
						revealEventLogShell();
					}
					return;
				}
				renderSessionActivityChart(allEvents, {sessionId: 'all'});
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
				// If this is the initial load and there are no events, show the page anyway
				if (isInitialChartLoad) {
					isInitialChartLoad = false;
					revealEventLogShell();
				}
				return;
			}
			renderSessionActivityChart(data.events, {sessionId: targetSession});
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

	function renderSessionActivityChart(events, options = {}) {
		if (!Array.isArray(events) || events.length === 0) {
			logChartTrace('renderSessionActivityChart: no events to render', {
				targetSession: options.sessionId || selectedSession
			});
			hideSessionActivityCard();
			// If this is the initial load and there are no events, show the page anyway
			if (isInitialChartLoad) {
				isInitialChartLoad = false;
				revealEventLogShell();
			}
			return;
		}

		const chartInstance = initSessionActivityChart();
		if (!chartInstance) {
			// If this is the initial load and chart can't be initialized, show the page anyway
			const targetSession = options.sessionId || selectedSession;
			pendingChartRender = {
				events: events.slice(),
				options: {...options, sessionId: targetSession}
			};
			logChartTrace('renderSessionActivityChart: chart instance unavailable, storing pending render', {
				targetSession,
				eventCount: events.length
			});
			if (isInitialChartLoad) {
				isInitialChartLoad = false;
				revealEventLogShell();
			}
			return;
		}

		lastSessionActivityEvents = events.slice();
		const targetSession = options.sessionId || selectedSession;
		const uniqueSessions = Array.from(new Set(events.map(evt => evt.session_id || 'Unknown session')));
		const isAllSessionsView = targetSession === 'all' && uniqueSessions.length > 0;

		// Use activityDate from options if provided (for hover preview), otherwise use selectedActivityDate
		const overrideDate = options.activityDate ? new Date(options.activityDate) : null;

		// Enable smooth transitions when hovering (notMerge: false allows ECharts to animate)
		const enableTransition = options.enableTransition === true;

		logChartTrace('renderSessionActivityChart: rendering', {
			targetSession,
			eventCount: events.length,
			uniqueSessions: uniqueSessions.length,
			isAllSessionsView
		});

		let seriesData = [];
		let windowStart;
		let windowEnd;
		let referenceDate;
		let officeStart;
		let officeEnd;
		let maxBucketCount;
		let multiSeriesEntries = [];

		if (isAllSessionsView) {
			// For "All sessions", use override date, selected date, or current day
			const useCurrentDay = false; // Always use the date from events or selected date
			let dateToUse = overrideDate || selectedActivityDate;
			if (!dateToUse) {
				// Use current day by default
				dateToUse = new Date();
			}
			const multiSeries = buildMultiSessionActivitySeries(events, useCurrentDay, dateToUse);
			windowStart = multiSeries.windowStart;
			windowEnd = multiSeries.windowEnd;
			referenceDate = multiSeries.referenceDate;
			officeStart = multiSeries.officeStart;
			officeEnd = multiSeries.officeEnd;
			maxBucketCount = multiSeries.maxBucketCount;
			multiSeriesEntries = multiSeries.seriesList;
		} else {
			// For specific session, use override date, selected date, or current day
			const useCurrentDay = true; // Always use current day when no date is selected
			const dateToUse = overrideDate || selectedActivityDate || new Date();
			const singleSeries = buildSessionActivitySeries(events, useCurrentDay, dateToUse);
			({
				seriesData,
				windowStart,
				windowEnd,
				referenceDate,
				officeStart,
				officeEnd,
				maxBucketCount
			} = singleSeries);
		}

		const totalEvents = events.length;
		const sessionCount = uniqueSessions.length;
		const dateLabel = getRelativeDateLabel(referenceDate);

		// Update the title with the date
		const title = document.getElementById('sessionActivityTitle');
		if (title) {
			title.textContent = `Activity during ${dateLabel}`;
		}

		// Update navigation buttons state
		updateDateNavigationButtons(referenceDate);

		const subtitle = document.getElementById('sessionActivitySubtitle');
		if (subtitle) {
			const eventLabel = totalEvents === 1 ? 'event' : 'events';
			const formattedDate = formatHumanDate(referenceDate);
			if (isAllSessionsView) {
				const sessionLabel = sessionCount === 1 ? 'session' : 'sessions';
				subtitle.textContent = `${formattedDate} · ${sessionCount} ${sessionLabel} · ${totalEvents} ${eventLabel}`;
			} else {
				subtitle.textContent = `${formattedDate} · ${totalEvents} ${eventLabel}`;
			}
		}

		const themeIsDark = document.documentElement.classList.contains('dark');
		const axisColor = themeIsDark ? '#a1a1aa' : '#52525b';
		const splitLineColor = themeIsDark ? 'rgba(63, 63, 70, 0.35)' : 'rgba(228, 228, 231, 0.35)';
		const gradientCap = 70;
		const yAxisMax = Math.max(10, maxBucketCount || 0);
		const warmOffset = Math.min(gradientCap / Math.max(yAxisMax, 1), 1);

		let chartSeries = [];
		if (isAllSessionsView) {
			chartSeries = multiSeriesEntries.map((entry, index) => {
				const color = SESSION_SERIES_COLORS[index % SESSION_SERIES_COLORS.length];
				return createMultiSessionSeriesOption(entry.sessionId, entry.seriesData, color);
			});
		} else {
			chartSeries = [createSingleSessionSeriesOption(seriesData, warmOffset)];
		}

		// Configure animation for smooth transitions
		const animationConfig = enableTransition ? {
			animation: true,
			animationDuration: 200,
			animationEasing: 'cubicOut'
		} : {
			animation: true,
			animationDuration: 200,
			animationEasing: 'cubicOut'
		};

		let finishedHandled = false;
		let chartRenderFallbackTimeoutId = null;

		const ensureChartVisible = () => {
			const chartEl = document.getElementById('sessionActivityChart');
			if (chartEl) {
				chartEl.style.visibility = 'visible';
			}
		};

		const finalizeChartRender = (triggeredByFallback = false) => {
			if (finishedHandled) {
				return;
			}
			finishedHandled = true;
			if (chartRenderFallbackTimeoutId) {
				clearTimeout(chartRenderFallbackTimeoutId);
				chartRenderFallbackTimeoutId = null;
			}
			// Remove the listener after it fires once
			chartInstance.off('finished', onChartFinished);
			ensureChartVisible();
			showSessionActivityCard();

			// Call the callback if provided
			if (options.onRenderComplete && typeof options.onRenderComplete === 'function') {
				options.onRenderComplete();
			}

			const wasInitialLoad = isInitialChartLoad;

			// Dispatch a custom event for external listeners
			const event = new CustomEvent('chartRenderComplete', {
				detail: {
					sessionId: targetSession,
					eventCount: totalEvents,
					timestamp: Date.now(),
					isInitialLoad: wasInitialLoad
				}
			});
			window.dispatchEvent(event);

			// Mark that initial load is complete
			if (wasInitialLoad) {
				isInitialChartLoad = false;
				if (triggeredByFallback) {
					revealEventLogShell();
				}
			}
		};

		const onChartFinished = () => finalizeChartRender(false);

		// Register the listener for the 'finished' event before rendering to avoid missing it
		chartInstance.off('finished', onChartFinished);
		chartInstance.on('finished', onChartFinished);

		// Fallback: ensure the chart becomes visible even if 'finished' doesn't fire
		chartRenderFallbackTimeoutId = setTimeout(() => finalizeChartRender(true), 800);

		chartInstance.setOption({
			...animationConfig,
			textStyle: {
				fontFamily: 'Manrope, \'Manrope\', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif'
			},
			grid: {left: 45, right: 10, top: 15, bottom: 30},
			xAxis: {
				type: 'time',
				min: windowStart.getTime(),
				max: windowEnd.getTime(),
				axisLabel: {
					color: axisColor,
					formatter: value => formatChartTimeLabel(new Date(value))
				},
				axisLine: {lineStyle: {color: axisColor}},
				splitLine: {show: false},
				axisTick: {show: false}
			},
			yAxis: {
				type: 'value',
				min: 0,
				max: yAxisMax,
				minInterval: 1,
				axisLabel: {color: axisColor},
				axisLine: {show: false},
				splitLine: {lineStyle: {color: splitLineColor}}
			},
			tooltip: {
				trigger: 'axis',
				axisPointer: {
					type: 'line',
					lineStyle: {
						type: 'solid',
						color: 'rgba(14, 165, 233, 0.6)',
						width: 1
					}
				},
				formatter: function(params) {
					if (!Array.isArray(params)) {
						params = [params];
					}
					// Filter series with value 0 or null
					const filteredParams = params.filter(param => {
						// Extract the actual numeric value from param.value
						// For time-series data, value can be [timestamp, value] or just the value
						let value = param.value;
						if (Array.isArray(value) && value.length >= 2) {
							// If it's an array, the second element is the actual value
							value = value[1];
						}
						return value !== null && value !== undefined && value !== 0;
					});
					// If there are no valid series, don't show the tooltip
					if (filteredParams.length === 0) {
						return '';
					}
					// Build the tooltip content with filtered series
					let result = '';
					if (filteredParams.length > 0 && filteredParams[0].axisValue) {
						const date = new Date(filteredParams[0].axisValue);
						result += `<div style="margin-bottom: 4px; font-weight: 500;">${formatHumanDate(date)} ${formatChartTimeLabel(date)}</div>`;
					}
					filteredParams.forEach(param => {
						// Extract the actual numeric value
						let value = param.value;
						if (Array.isArray(value) && value.length >= 2) {
							// If it's an array, the second element is the actual value
							value = value[1];
						}
						const eventLabel = value === 1 ? 'event' : 'events';
						const marker = `<span style="display:inline-block;margin-right:4px;border-radius:50%;width:10px;height:10px;background-color:${param.color};"></span>`;
						result += `<div style="margin: 2px 0;">${marker}${param.seriesName}: <strong>${value} ${eventLabel}</strong></div>`;
					});
					return result;
				}
			},
			series: chartSeries,
			markArea: {
				itemStyle: {color: 'rgba(16,185,129,0.12)'},
				data: [
					[
						{xAxis: officeStart.getTime()},
						{xAxis: officeEnd.getTime()}
					]
				]
			}
		}, !enableTransition); // notMerge: false when transition is enabled, true otherwise

		chartInstance.resize();

		// Filter legend to only show series with data during the displayed day
		let legendEntries = null;
		if (isAllSessionsView) {
			// Calculate the day boundaries (00:00:00 to 23:59:59.999 of referenceDate)
			const dayStart = new Date(referenceDate);
			dayStart.setHours(0, 0, 0, 0);
			const dayEnd = new Date(referenceDate);
			dayEnd.setHours(23, 59, 59, 999);

			// Filter series to only those with data (value > 0) during the displayed day
			const filteredSeries = chartSeries.filter(series => {
				// Check if series has any data points with value > 0 during the displayed day
				if (!series.data || !Array.isArray(series.data)) {
					return false;
				}
				// Check if any point has value > 0 and falls within the displayed day
				return series.data.some(point => {
					if (!Array.isArray(point) || point.length < 2) {
						return false;
					}
					const timestamp = point[0];
					const value = point[1];
					// Check if the point is within the displayed day and has data
					return value > 0 && timestamp >= dayStart.getTime() && timestamp <= dayEnd.getTime();
				});
			});

			// Map to legend entries
			legendEntries = filteredSeries.map(series => ({
				name: series.name,
				color: series.lineStyle?.color || '#53cf98'
			}));

			// Fallback: if filter removed all series, show all series (for debugging)
			if (legendEntries.length === 0 && chartSeries.length > 0) {
				legendEntries = chartSeries.map(series => ({
					name: series.name,
					color: series.lineStyle?.color || '#53cf98'
				}));
			}
		} else {
			// For single session view, show the session's series in the legend
			if (chartSeries.length > 0) {
				const series = chartSeries[0];
				// Check if series has data (value > 0) in the visible window
				const hasData = series.data && Array.isArray(series.data) && series.data.some(point => {
					if (!Array.isArray(point) || point.length < 2) {
						return false;
					}
					const value = point[1];
					return value > 0;
				});

				if (hasData) {
					legendEntries = [{
						name: series.name,
						color: series.lineStyle?.color || '#53cf98'
					}];
				}
			}
		}
		renderSessionActivityLegend(legendEntries, isAllSessionsView);
	}

	function buildSessionActivitySeries(events, useCurrentDay = false, customDate = null) {
		// Use custom date if provided, otherwise use current day if useCurrentDay is true, otherwise use the session's day
		let referenceDate;
		if (customDate) {
			referenceDate = new Date(customDate);
		} else if (useCurrentDay) {
			referenceDate = new Date();
		} else {
			referenceDate = new Date(events[0].timestamp);
		}
		const eventTimes = events
			.map(event => Date.parse(event.timestamp))
			.filter(time => !Number.isNaN(time));
		const minEventTime = eventTimes.length ? Math.min(...eventTimes) : null;
		const maxEventTime = eventTimes.length ? Math.max(...eventTimes) : null;
		const {start: windowStart, end: windowEnd} = getExtendedWindow(referenceDate, minEventTime, maxEventTime);
		const officeStart = new Date(referenceDate);
		officeStart.setHours(OFFICE_START.hour, OFFICE_START.minute, 0, 0);
		const officeEnd = new Date(referenceDate);
		officeEnd.setHours(OFFICE_END.hour, OFFICE_END.minute, 0, 0);
		const slotMs = SESSION_ACTIVITY_SLOT_MINUTES * 60 * 1000;
		const slotCount = Math.floor((windowEnd.getTime() - windowStart.getTime()) / slotMs) + 1;
		const buckets = Array.from({length: slotCount}, () => 0);

		events.forEach(event => {
			const time = Date.parse(event.timestamp);
			if (Number.isNaN(time)) {
				return;
			}
			const bucketIndex = Math.floor((time - windowStart.getTime()) / slotMs);
			if (bucketIndex >= 0 && bucketIndex < buckets.length) {
				buckets[bucketIndex] += 1;
			}
		});

		const seriesData = buckets.map((count, index) => {
			const ts = windowStart.getTime() + (index * slotMs);
			// Use 0 for zero values so the line is always visible
			return [ts, count];
		});

		const maxBucketCount = buckets.length ? Math.max(...buckets) : 0;

		return {seriesData, windowStart, windowEnd, referenceDate, officeStart, officeEnd, maxBucketCount};
	}

	function buildMultiSessionActivitySeries(events, useCurrentDay = false, customDate = null) {
		// Use custom date if provided, otherwise use current day if useCurrentDay is true, otherwise use the first event's day
		let referenceDate;
		if (customDate) {
			referenceDate = new Date(customDate);
		} else if (useCurrentDay) {
			referenceDate = new Date();
		} else {
			referenceDate = new Date(events[0].timestamp);
		}
		const eventTimes = events
			.map(event => Date.parse(event.timestamp))
			.filter(time => !Number.isNaN(time));
		const minEventTime = eventTimes.length ? Math.min(...eventTimes) : null;
		const maxEventTime = eventTimes.length ? Math.max(...eventTimes) : null;
		const {start: windowStart, end: windowEnd} = getExtendedWindow(referenceDate, minEventTime, maxEventTime);
		const officeStart = new Date(referenceDate);
		officeStart.setHours(OFFICE_START.hour, OFFICE_START.minute, 0, 0);
		const officeEnd = new Date(referenceDate);
		officeEnd.setHours(OFFICE_END.hour, OFFICE_END.minute, 0, 0);
		const slotMs = SESSION_ACTIVITY_SLOT_MINUTES * 60 * 1000;
		const slotCount = Math.floor((windowEnd.getTime() - windowStart.getTime()) / slotMs) + 1;

		const sessionBuckets = new Map();

		events.forEach(event => {
			const time = Date.parse(event.timestamp);
			if (Number.isNaN(time)) {
				return;
			}
			const sessionId = event.session_id || 'Unknown session';
			if (!sessionBuckets.has(sessionId)) {
				sessionBuckets.set(sessionId, Array.from({length: slotCount}, () => 0));
			}
			const bucketIndex = Math.floor((time - windowStart.getTime()) / slotMs);
			if (bucketIndex >= 0 && bucketIndex < slotCount) {
				const buckets = sessionBuckets.get(sessionId);
				buckets[bucketIndex] += 1;
			}
		});

		const seriesList = [];
		let maxBucketCount = 0;

		sessionBuckets.forEach((buckets, sessionId) => {
			const seriesData = buckets.map((count, index) => {
				const ts = windowStart.getTime() + (index * slotMs);
				// Use 0 for zero values so the line is always visible
				return [ts, count];
			});
			maxBucketCount = Math.max(maxBucketCount, ...buckets, maxBucketCount);
			seriesList.push({
				sessionId,
				seriesData
			});
		});

		return {seriesList, windowStart, windowEnd, referenceDate, officeStart, officeEnd, maxBucketCount};
	}

	function getExtendedWindow(referenceDate, minEventTime, maxEventTime) {
		// Start with office hours as base (9-18h)
		const officeStart = new Date(referenceDate);
		officeStart.setHours(OFFICE_START.hour, OFFICE_START.minute, 0, 0);
		const officeEnd = new Date(referenceDate);
		officeEnd.setHours(OFFICE_END.hour, OFFICE_END.minute, 0, 0);

		// If we have event times, expand the window to include all events
		// but keep it within the same day as referenceDate
		let start = officeStart;
		let end = officeEnd;

		if (minEventTime !== null && maxEventTime !== null) {
			const minEventDate = new Date(minEventTime);
			const maxEventDate = new Date(maxEventTime);

			// Get the day boundaries for referenceDate
			const refDay = referenceDate.getDate();
			const refMonth = referenceDate.getMonth();
			const refYear = referenceDate.getFullYear();

			// Check if events are on the same day as referenceDate
			const minEventDay = minEventDate.getDate();
			const minEventMonth = minEventDate.getMonth();
			const minEventYear = minEventDate.getFullYear();
			const maxEventDay = maxEventDate.getDate();
			const maxEventMonth = maxEventDate.getMonth();
			const maxEventYear = maxEventDate.getFullYear();

			const isSameDay = (minEventDay === refDay && minEventMonth === refMonth && minEventYear === refYear) ||
			                  (maxEventDay === refDay && maxEventMonth === refMonth && maxEventYear === refYear);

			if (isSameDay) {
				// Adjust start to include earliest event
				const earliestEvent = new Date(minEventDate);
				earliestEvent.setFullYear(refYear, refMonth, refDay);
				if (earliestEvent < start) {
					start = earliestEvent;
					// Round down to the previous slot boundary
					const slotMs = SESSION_ACTIVITY_SLOT_MINUTES * 60 * 1000;
					const remainder = start.getTime() % slotMs;
					if (remainder > 0) {
						start = new Date(start.getTime() - remainder);
					}
				}

				// Adjust end to include latest event
				const latestEvent = new Date(maxEventDate);
				latestEvent.setFullYear(refYear, refMonth, refDay);
				if (latestEvent > end) {
					end = latestEvent;
					// Round up to the next slot boundary
					const slotMs = SESSION_ACTIVITY_SLOT_MINUTES * 60 * 1000;
					const remainder = end.getTime() % slotMs;
					if (remainder > 0) {
						end = new Date(end.getTime() + slotMs - remainder);
					}
				}
			}
		}

		return {start, end};
	}

	function formatChartTimeLabel(dateObj) {
		if (!(dateObj instanceof Date)) {
			return '';
		}
		return `${padNumber(dateObj.getHours())}:${padNumber(dateObj.getMinutes())}`;
	}


	function navigateToPreviousDay() {
		if (!lastSessionActivityEvents || lastSessionActivityEvents.length === 0) {
			return;
		}

		// Get current reference date
		const currentDate = selectedActivityDate || new Date();
		const previousDate = new Date(currentDate);
		previousDate.setDate(previousDate.getDate() - 1);

		selectedActivityDate = previousDate;
		renderSessionActivityChart(lastSessionActivityEvents, {sessionId: selectedSession});
	}


	function navigateToNextDay() {
		if (!lastSessionActivityEvents || lastSessionActivityEvents.length === 0) {
			return;
		}

		// Get current reference date
		const currentDate = selectedActivityDate || new Date();
		const nextDate = new Date(currentDate);
		nextDate.setDate(nextDate.getDate() + 1);

		// Don't allow navigating to future dates
		const today = new Date();
		today.setHours(23, 59, 59, 999);
		if (nextDate > today) {
			return;
		}

		selectedActivityDate = nextDate;
		renderSessionActivityChart(lastSessionActivityEvents, {sessionId: selectedSession});
	}

	function updateDateNavigationButtons(referenceDate) {
		const prevBtn = document.getElementById('prevDayBtn');
		const nextBtn = document.getElementById('nextDayBtn');

		if (!prevBtn || !nextBtn) {return;}

		// Disable next button if we're at today
		const today = new Date();
		today.setHours(23, 59, 59, 999);
		const refDate = new Date(referenceDate);
		refDate.setHours(23, 59, 59, 999);

		nextBtn.disabled = refDate >= today;

		// Previous button is always enabled (we can go back as far as we want)
		prevBtn.disabled = false;
	}

	function formatHumanDate(dateObj) {
		if (!(dateObj instanceof Date)) {
			return '';
		}
		const day = padNumber(dateObj.getDate());
		const month = padNumber(dateObj.getMonth() + 1);
		const year = dateObj.getFullYear();
		return `${day}/${month}/${year}`;
	}

	function getRelativeDateLabel(dateObj) {
		if (!(dateObj instanceof Date)) {
			return '';
		}
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);
		const dateToCheck = new Date(dateObj);
		dateToCheck.setHours(0, 0, 0, 0);

		if (dateToCheck.getTime() === today.getTime()) {
			return 'today';
		} else if (dateToCheck.getTime() === yesterday.getTime()) {
			return 'yesterday';
		}
			return formatHumanDate(dateObj);

	}

	function padNumber(value) {
		return String(value).padStart(2, '0');
	}

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

	function createSingleSessionSeriesOption(seriesData, warmOffset) {
		return {
			name: 'Events',
			type: 'line',
			smooth: 0.55,
			smoothMonotone: 'x', // prevent bezier overshoot while keeping curvature
			showSymbol: false,
			connectNulls: true, // Connect valid points even if there are null values between them
			lineStyle: {width: 3, color: hexToRgba('#53cf98', 0.5)}, // More transparent line
			areaStyle: {
				color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
					{offset: 0, color: 'rgba(133,230,185,0.45)'},
					{offset: warmOffset, color: 'rgba(197,241,221,0.35)'},
					{offset: 1, color: 'rgba(216,247,232,0.16)'}
				])
			},
			data: seriesData
		};
	}

	function createMultiSessionSeriesOption(sessionId, seriesData, color) {
		const startColor = hexToRgba(color, 0.35);
		const endColor = hexToRgba(color, 0.05);
		return {
			name: formatSessionLabel(sessionId),
			type: 'line',
			smooth: 0.65,
			smoothMonotone: 'x',
			showSymbol: false,
			connectNulls: true, // Connect valid points even if there are null values between them
			lineStyle: {width: 2.5, color: hexToRgba(color, 0.5)}, // More transparent line
			areaStyle: {
				color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
					{offset: 0, color: startColor},
					{offset: 1, color: endColor}
				])
			},
			data: seriesData
		};
	}

	function hexToRgba(hex, alpha = 1) {
		if (typeof hex !== 'string') {
			return `rgba(83, 207, 152, ${alpha})`;
		}
		let sanitized = hex.replace('#', '');
		if (sanitized.length === 3) {
			sanitized = sanitized.split('').map(ch => ch + ch).join('');
		}
		const bigint = Number.parseInt(sanitized, 16);
		if (Number.isNaN(bigint)) {
			return `rgba(83, 207, 152, ${alpha})`;
		}
		// eslint-disable-next-line no-bitwise
		const r = (bigint >> 16) & 255;
		// eslint-disable-next-line no-bitwise
		const g = (bigint >> 8) & 255;
		// eslint-disable-next-line no-bitwise
		const b = bigint & 255;
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	function formatSessionLabel(sessionId) {
		if (!sessionId) {
			return 'Unknown session';
		}
		const storedLabel = sessionDisplayMap.get(sessionId);
		if (storedLabel) {
			return storedLabel;
		}
		if (sessionId.length <= 22) {
			return sessionId;
		}
		return `${sessionId.slice(0, 10)}…${sessionId.slice(-6)}`;
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

	function renderSessionActivityLegend(seriesEntries, isAllSessionsView = false) {
		const legendEl = document.getElementById('sessionActivityLegend');
		const legendWrapper = document.querySelector('.session-activity-legend-wrapper');
		if (!legendEl || !legendWrapper) {
			return;
		}

		legendEl.innerHTML = '';

		// Always keep the wrapper in the layout to prevent height changes
		legendWrapper.style.display = 'flex';

		// Show legend button only for "All sessions" view and if there are more than one series
		const hasMultipleSeries = Array.isArray(seriesEntries) && seriesEntries.length > 1;
		if (isAllSessionsView && hasMultipleSeries) {
			// Show legend button with opacity transition
			legendWrapper.classList.remove('hidden');
			// Show legend for series with data
			seriesEntries.forEach(entry => {
				const safeName = escapeHtml(entry.name);
				const item = document.createElement('span');
				item.className = 'legend-item';
				item.innerHTML = `
					<span class="legend-dot" style="background: ${entry.color};"></span>
					<span>${safeName}</span>
				`;
				legendEl.appendChild(item);
			});
		} else {
			// Hide the legend button with opacity transition
			legendWrapper.classList.add('hidden');
		}
	}

	function refreshSessionActivityTheme() {
		if (lastSessionActivityEvents.length > 0) {
			renderSessionActivityChart(lastSessionActivityEvents);
		} else if (sessionActivityChart) {
			const chartEl = document.getElementById('sessionActivityChart');
			if (chartEl) {
				sessionActivityChart.resize();
			}
		}
	}

	async function loadEventTypeStats(sessionId = null) {
		try {
			const params = new URLSearchParams();
			if (sessionId && sessionId !== 'all') {
				params.append('sessionId', sessionId);
			}
			// Apply user filters
			// If users haven't been loaded yet (allUserIds.size === 0), don't filter (show all)
			// If no users are selected after loading, send a special marker to return no stats
			// If all users are selected, don't filter (show all)
			// If some users are selected, filter by those users
			if (allUserIds.size === 0) {
				// Users not loaded yet - don't filter (show all stats)
				// Don't add any userId param
			} else if (selectedUserIds.size === 0) {
				// No users selected - send special marker to return no stats
				params.append('userId', '__none__');
			} else if (selectedUserIds.size > 0 && selectedUserIds.size < allUserIds.size) {
				// Some users selected - filter by those users
				Array.from(selectedUserIds).forEach(userId => {
					params.append('userId', userId);
				});
			}
			// If all users are selected (selectedUserIds.size === allUserIds.size), don't add any userId param
			const queryString = params.toString();

			// Check if we have fresh cached event types data and no filters applied
			let stats;
			if (window.isCacheFresh('eventTypes') && queryString === '') {
				console.info('[Event Log] Using cached event types data');
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

	async function loadSessions() {
		try {
			const params = new URLSearchParams();
			// Apply user filters
			// If users haven't been loaded yet (allUserIds.size === 0), don't filter (show all)
			// If no users are selected after loading, send a special marker to return no sessions
			// If all users are selected, don't filter (show all)
			// If some users are selected, filter by those users
			if (allUserIds.size === 0) {
				// Users not loaded yet - don't filter (show all sessions)
				// Don't add any userId param
			} else if (selectedUserIds.size === 0) {
				// No users selected - send special marker to return no sessions
				params.append('userId', '__none__');
			} else if (selectedUserIds.size > 0 && selectedUserIds.size < allUserIds.size) {
				// Some users selected - filter by those users
				Array.from(selectedUserIds).forEach(userId => {
					params.append('userId', userId);
				});
			}
			// If all users are selected (selectedUserIds.size === allUserIds.size), don't add any userId param

			// Add limit for performance - load only recent sessions initially
			params.append('limit', '50');

			// Always include users without formal sessions
			params.append('includeUsersWithoutSessions', 'true');

			const queryString = params.toString();
			const cacheKey = `sessions_${queryString || 'default'}`;

			// Check if we have fresh cached data and no filters applied
			let sessions;
			if (window.isCacheFresh(cacheKey) && params.toString() === '') {
				console.info('[Event Log] Using cached sessions data');
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
			const sessionList = document.getElementById('sessionList');

			if (!sessionList) {
				console.error('sessionList element not found');
				return;
			}

			// Clear the scrollable list (All Sessions is now separate)
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

					// Add event listeners for checkbox and actions (safer than inline onclick with XSS protection)
					const checkbox = li.querySelector('.session-checkbox');
					if (checkbox) {
						checkbox.addEventListener('click', (event) => {
							event.stopPropagation();
							toggleSessionSelection(session.session_id, event);
						});
					}

					const actionsBtn = li.querySelector('.actions-btn');
					if (actionsBtn) {
						actionsBtn.addEventListener('click', (event) => {
							event.stopPropagation();
							toggleSessionActionsDropdown(event, session.session_id);
						});
					}

					const deleteBtn = li.querySelector('.actions-dropdown-item.delete');
					if (deleteBtn) {
						deleteBtn.addEventListener('click', (event) => {
							event.stopPropagation();
							confirmDeleteSession(session.session_id);
						});
					}

					li.addEventListener('click', (e) => {
						// Don't activate session if clicking on actions button or checkbox
						if (e.target.closest('.session-item-actions') || e.target.closest('.session-checkbox')) {
							return;
						}
						// Cancel hover preview when clicking
						if (isHoverPreviewActive) {
							hoverPreviewState = null;
							isHoverPreviewActive = false;
						}
						// If in selection mode, toggle selection for deletion instead of viewing
						if (selectionMode) {
							toggleSessionSelection(session.session_id, e);
							return;
						}
						// If Ctrl/Cmd is pressed and not in selection mode, enter selection mode and select this session
						if ((e.ctrlKey || e.metaKey) && !selectionMode) {
							toggleSelectionMode();
							// Small delay to ensure selection mode is active
							setTimeout(() => {
								toggleSessionSelection(session.session_id, e);
							}, 0);
							return;
						}
						// Avoid flickering if clicking on the same session that's already selected
						if (selectedSession === session.session_id && li.classList.contains('active')) {
							return;
						}
						document.querySelectorAll('.session-item').forEach(i => i.classList.remove('active'));
						li.classList.add('active');
						selectedSession = session.session_id;
						// Pin activity chart to this session's day (prefer last event, fall back to first)
						const sessionDay = session.last_event || session.first_event || null;
						const parsedSessionDate = sessionDay ? new Date(sessionDay) : null;
						selectedActivityDate = parsedSessionDate && !Number.isNaN(parsedSessionDate.getTime())? parsedSessionDate: null;
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
					});

					// Add hover preview functionality
					li.addEventListener('mouseenter', (e) => {
						// Don't preview if hovering over actions button
						if (e.target.closest('.session-item-actions')) {
							return;
						}
						handleSessionHover(session.session_id, session);
					});

					li.addEventListener('mouseleave', (e) => {
						// Don't restore if mouse is moving to actions button
						if (e.relatedTarget && e.relatedTarget.closest('.session-item-actions')) {
							return;
						}
						// Don't restore if mouse is still within the sessions area (sidebar-content)
						// This includes gaps between buttons
						if (e.relatedTarget && (
							e.relatedTarget.closest('.sidebar-content') ||
							e.relatedTarget.closest('.all-sessions-container') ||
							e.relatedTarget.closest('#sessionList') ||
							e.relatedTarget.closest('.session-list') ||
							e.relatedTarget.closest('.session-item')
						)) {
							return;
						}
						// Only restore if not clicking (click will handle it) and cursor left sessions area
						if (isHoverPreviewActive) {
							restoreChartState();
						}
					});

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

		const userHtml = `<span class="session-user">${escapeHtml(userText)}</span>`;
		return {html: `${userHtml} <span class="session-date">${escapeHtml(dateStr)}</span>`, text: `${userText} • ${dateStr}`};
	}

	async function loadUsersList() {
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

			const userList = document.getElementById('userList');
			if (!userList) {
				console.error('userList element not found');
				return;
			}

			// Clear the list
			userList.innerHTML = '';

			// Normalize API response to consistent objects { id, label, count, last_event }
			const normalizedUsers = (Array.isArray(data) ? data : [])
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

			if (normalizedUsers.length === 0) {
				return;
			}

			// Sort users by last activity (most recent first)
			const usersWithStats = normalizedUsers.map(user => {
				return {
					user_id: user.id,
					label: user.label,
					count: user.count || 0,
					last_event: user.last_event || null,
					user_name: user.user_name || user.label
				};
			}).sort((a, b) => {
				// Sort by last_event DESC, users without events go to the end
				if (!a.last_event && !b.last_event) {return 0;}
				if (!a.last_event) {return 1;}
				if (!b.last_event) {return -1;}
				const dateA = new Date(a.last_event);
				const dateB = new Date(b.last_event);
				return dateB - dateA;
			});

			// Add each user to the list
			usersWithStats.forEach(user => {
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

				li.addEventListener('click', (_e) => {
					// Avoid flickering if clicking on the same user that's already selected
					if (selectedUserIds.has(user.user_id) && selectedUserIds.size === 1) {
						return;
					}
					// Select only this user
					selectedUserIds.clear();
					selectedUserIds.add(user.user_id);
					// Update UI to reflect selection
					document.querySelectorAll('.session-item[data-user]').forEach(i => i.classList.remove('active'));
					li.classList.add('active');
					// Switch to sessions tab and reload
					switchTab('sessions');
					loadSessions();
					loadEvents();
					loadEventTypeStats(selectedSession);
				});

				userList.appendChild(li);
			});
		} catch (error) {
			console.error('Error loading users list:', error);
		}
	}

	async function loadTeamsList() {
		try {
			const teamList = document.getElementById('teamList');
			if (!teamList) {
				console.error('teamList element not found');
				return;
			}

			let teams = [];
			let aggregatedTeams = [];

			try {
				// Check if we have fresh cached team stats data
				let statsData;
				if (window.isCacheFresh('teamStats')) {
					console.info('[Event Log] Using cached team stats data');
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

				li.innerHTML = `
				<div class="session-item-left">
					<div style="width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; margin-right: 10px; color: ${color}; border-radius: 50%; background: #f3f3f3;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="width: 24px; height: 24px;">
              <path d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
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

				li.addEventListener('click', () => {
					const isSelectingSame = selectedTeamKey === team.key;
					selectedTeamKey = isSelectingSame ? null : team.key;
					document.querySelectorAll('#teamList .session-item').forEach((item) => {
						item.classList.toggle('active', item.dataset.teamKey === selectedTeamKey);
					});
					switchTab('teams');
					currentOffset = 0;
					loadEvents();
				});

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
		const usersTab = document.getElementById('usersTab');
		const teamsTab = document.getElementById('teamsTab');
		const sessionsContainer = document.getElementById('sessionsContainer');
		const sessionList = document.getElementById('sessionList');
		const userList = document.getElementById('userList');
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
		if (sessionsTab && usersTab && teamsTab) {
			sessionsTab.classList.toggle('active', tab === 'sessions');
			usersTab.classList.toggle('active', tab === 'users');
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
		if (userList) {
			userList.style.display = tab === 'users' ? 'block' : 'none';
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
		const _logsTableEl = document.getElementById('logsTable');
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
			// If users haven't been loaded yet (allUserIds.size === 0), don't filter (show all)
			// If no users are selected after loading, send a special marker to return no events
			// If all users are selected, don't filter (show all)
			// If some users are selected, filter by those users
			if (allUserIds.size === 0) {
				// Users not loaded yet - don't filter (show all events)
				// Don't add any userId param
			} else if (selectedUserIds.size === 0) {
				// No users selected - send special marker to return no events
				params.append('userId', '__none__');
			} else if (selectedUserIds.size > 0 && selectedUserIds.size < allUserIds.size) {
				// Some users selected - filter by those users
				Array.from(selectedUserIds).forEach(userId => {
					params.append('userId', userId);
				});
			}
			// If all users are selected (selectedUserIds.size === allUserIds.size), don't add any userId param

			const response = await fetch(`/api/events?${params}`);
			const validResponse = await handleApiResponse(response);
			if (!validResponse) {return;}
			const data = await validResponse.json();

			// Update last fetch time when fetch is successful
			lastFetchTime = Date.now();
			updateLastUpdatedText();
			if (!lastUpdatedIntervalId) {
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
				if (_logsTableEl) {
					_logsTableEl.style.display = 'table';
				}
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
					const tbody = document.getElementById('logsBody');
					if (tbody) {
						tbody.innerHTML = '';
					}
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

	function displayEvents(events, append = false) {
		// Enforce team filter just before rendering to avoid any leakage
		const renderableEvents = selectedTeamKey ? events.filter(eventMatchesSelectedTeam) : events;
		const tbody = document.getElementById('logsBody');

		// Gracefully handle pages that don't include the legacy logs table
		if (!tbody) {
			console.warn('[Telemetry Viewer] logs table body not found; skipping legacy table render');
			allLoadedEvents = append? [...allLoadedEvents, ...renderableEvents]: [...renderableEvents];
			return;
		}

		// Save selected event state before clearing (only if not appending)
		let selectedEventId = null;
		const expandedEventIds = new Set();
		if (!append) {
			// Find the currently selected event (keyboard-selected)
			const selectedRow = tbody.querySelector('tr.keyboard-selected[data-event-id]');
			if (selectedRow) {
				selectedEventId = selectedRow.getAttribute('data-event-id');
			}

			// Find all expanded events
			const expandedRows = tbody.querySelectorAll('tr.log-item-expanded.expanded');
			expandedRows.forEach(row => {
				const expandedId = row.id.replace('expanded-', '');
				if (expandedId) {
					expandedEventIds.add(expandedId);
				}
			});

			tbody.innerHTML = '';
			allLoadedEvents = [];
			// Reset keyboard navigation for events when new events are loaded
			if (keyboardNavigationMode === 'events') {
				selectedEventIndex = -1;
			}
		}

		const showUserColumn = selectedSession === 'all';

		// Toggle header visibility based on current view
		const userHeader = document.querySelector('th.user-column');
		if (userHeader) {
			userHeader.style.display = showUserColumn ? '' : 'none';
		}

		renderableEvents.forEach(event => {
			const levelClass = getLevelClass(event.area);
			const levelBadgeClass = getLevelBadgeClass(event.area);
			const eventBadgeClass = getEventBadgeClass(event.event);
			const description = formatDescription(event);
			const eventData = normalizeEventData(event.data);
			const clientName = event.company_name || '';
			const userLabel = extractUserLabelFromEvent(event, eventData);
			const dataStatus = typeof eventData.status === 'string'? eventData.status.toLowerCase(): null;
			const isToolFailure = event.event === 'tool_call' && (
				dataStatus === 'error' ||
				dataStatus === 'failed' ||
				eventData.success === false ||
				Boolean(eventData.error)
			);
			const isError = event.event === 'tool_error' || event.event === 'error' || isToolFailure;
			const statusIcon = buildStatusIcon(isError);

			// Extract tool name for tool events (tool_call or tool_error)
			const isToolEvent = event.event === 'tool_call' || event.event === 'tool_error';
			const rawToolName = isToolEvent? (event.tool_name || event.toolName || ''): '';
			const toolName = rawToolName ? escapeHtml(String(rawToolName)) : '';

			// Extract error message for tool_error events
			const errorMessage = event.event === 'tool_error'? (event.error_message || ''): '';
			const escapedErrorMessage = errorMessage ? escapeHtml(String(errorMessage)) : '';

			// Main row
			const row = document.createElement('tr');
			row.className = `log-item-${levelClass}`;
			row.setAttribute('data-event-id', event.id);
			// Store event data in the row element to avoid API call when copying payload
			row.setAttribute('data-event', JSON.stringify(event));
			const userCellHtml = showUserColumn? `<td class="hidden text-gray-700 sm:table-cell log-user whitespace-nowrap">${escapeHtml(userLabel)}</td>`: '';

			row.innerHTML = `
				<td class="expand-column px-2 font-medium text-gray-900 whitespace-nowrap" style="text-align: center;">
					<button class="expand-btn" type="button" id="expand-btn-${event.id}" style="background: none; border: none; cursor: pointer; padding: 4px;">
						<i class="fa-solid fa-chevron-right"></i>
					</button>
				</td>
				<td class="whitespace-nowrap">${formatDate(event.timestamp)}
				</td>
				${userCellHtml}
				<td class="hidden text-gray-500 md:table-cell log-client whitespace-nowrap">${escapeHtml(clientName)}</td>
				<td class="text-gray-500 whitespace-nowrap">
					<span class="${levelBadgeClass}${!event.area ? ' na' : ''}">
						${event.area || 'N/A'}
					</span>
				</td>
				<td class="text-gray-500 whitespace-nowrap">
					<span class="${eventBadgeClass}">
						${escapeHtml(event.event || 'N/A')}
					</span>
				</td>
				<td class="hidden text-gray-500 lg:table-cell log-tool-name whitespace-nowrap">${toolName}</td>
				<td class="font-medium text-gray-900 whitespace-nowrap" style="text-align: center;">
					${statusIcon}
				</td>
				<td class="hidden text-gray-500 xl:table-cell log-error-message whitespace-nowrap overflow-hidden text-ellipsis max-w-48" title="${escapedErrorMessage}">${escapedErrorMessage}</td>
				<td class="text-gray-500 text-center log-description">${description}</td>
				<td class="pr-4 pl-3 text-right font-medium actions-cell whitespace-nowrap sm:pr-8 lg:pr-8">
					<button class="actions-btn hover:text-indigo-900" onclick="toggleActionsDropdown(event, ${event.id})" style="background: none; border: none; cursor: pointer; padding: 4px;">
						<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
							<circle cx="8" cy="3" r="1.5"/>
							<circle cx="8" cy="8" r="1.5"/>
							<circle cx="8" cy="13" r="1.5"/>
						</svg>
					</button>
					<div class="actions-dropdown" id="dropdown-${event.id}">
						<div class="actions-dropdown-item" onclick="copyEventPayload(${event.id})">
							<span>Copy payload</span>
						</div>
						<div class="actions-dropdown-item delete" onclick="confirmDeleteEvent(${event.id})">
							<span>Move to trash</span>
						</div>
					</div>
				</td>
			`;
			const descriptionCell = row.querySelector('.log-description');
			if (descriptionCell) {
				if (description === '__VIEW_PAYLOAD_BUTTON__') {
					descriptionCell.innerHTML = `<button onclick="loadEventPayload(${event.id})" class="text-gray-500 hover:text-[#2195cf] dark:text-white dark:hover:text-[#2195cf] p-1 rounded" title="View payload">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
							<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
						</svg>
					</button>`;
					descriptionCell.title = 'Click to view payload';
				} else {
					descriptionCell.textContent = description;
					descriptionCell.removeAttribute('title');
				}
			}
			const expandButton = row.querySelector(`#expand-btn-${event.id}`);
			if (expandButton) {
				expandButton.addEventListener('click', (evt) => {
					evt.stopPropagation();
					toggleRowExpand(event.id);
				});
			}

			row.addEventListener('click', (evt) => {
				if (evt.target.closest('.actions-btn') || evt.target.closest('.actions-dropdown')) {
					return;
				}

				toggleRowExpand(event.id);
			});

			tbody.appendChild(row);

			// Expanded row
			const expandedRow = document.createElement('tr');
			expandedRow.className = `log-item-expanded log-item-${levelClass}`;
			expandedRow.id = `expanded-${event.id}`;

			const expandedTd = document.createElement('td');
			expandedTd.colSpan = showUserColumn ? 10 : 9;
			expandedTd.className = 'log-description-expanded px-3 py-4';

			// Create form with event details instead of JSON
			const formContainer = createEventDetailsForm(event);
			expandedTd.appendChild(formContainer);

			expandedRow.appendChild(expandedTd);
			tbody.appendChild(expandedRow);
		});

		// Add events to accumulative array
		if (append) {
			allLoadedEvents.push(...renderableEvents);
		} else {
			allLoadedEvents = [...renderableEvents];

			// Restore selected event and expanded state after rendering
			if (selectedEventId) {
				const restoredRow = tbody.querySelector(`tr[data-event-id="${selectedEventId}"]`);
				if (restoredRow && !restoredRow.classList.contains('log-item-expanded')) {
					restoredRow.classList.add('keyboard-selected');
					// Update selectedEventIndex to match the restored row
					const allEventRows = getAllEventRows();
					selectedEventIndex = allEventRows.findIndex(row => row === restoredRow);
					if (selectedEventIndex >= 0) {
						restoredRow.scrollIntoView({behavior: 'smooth', block: 'nearest'});
					}
				}
			}

			// Restore expanded state for events that were expanded
			expandedEventIds.forEach(eventId => {
				const eventIdNum = Number.parseInt(eventId, 10);
				if (!Number.isNaN(eventIdNum)) {
					const mainRow = tbody.querySelector(`tr[data-event-id="${eventId}"]`);
					const expandedRow = document.getElementById(`expanded-${eventId}`);
					if (mainRow && expandedRow) {
						// Restore expanded state
						expandedRow.classList.add('expanded');
						const expandBtn = document.getElementById(`expand-btn-${eventId}`);
						if (expandBtn) {
							expandBtn.classList.add('expanded');
						}
						mainRow.classList.add('expanded');
					}
				}
			});
		}
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

	function getEventBadgeClass(eventType) {
		// Assigna colors aleatòriament però consistentment basat en el tipus d'event
		const eventColorMap = {
			'tool_call': 'green',
			'tool_error': 'indigo',
			'session_start': 'pink',
			'session_end': 'yellow',
			'error': 'green',
			'custom': 'indigo'
		};
		const colorClass = eventColorMap[eventType] || 'green';
		return `event-badge ${colorClass}`;
	}


	function createEventDetailsForm(event) {
		// event.data now contains the original payload exactly as received
		const payload = event.data || {};

		// Helper function to format value for display
		const formatValue = (value) => {
			if (value === null || value === undefined) {
				return '';
			}
			if (typeof value === 'object') {
				return JSON.stringify(value, null, 2);
			}
			return String(value);
		};

		// Helper function to create input field with label
		const createInput = (id, name, label, value, placeholder = '', type = 'text', roundedClasses = '') => {
			const container = document.createElement('div');
			container.className = `bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700 focus-within:relative focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 dark:focus-within:outline-indigo-500 ${roundedClasses}`.trim();

			const labelEl = document.createElement('label');
			labelEl.for = id;
			labelEl.className = 'block text-xs font-medium text-gray-900 dark:text-white';
			labelEl.textContent = label;
			container.appendChild(labelEl);

			const input = document.createElement('input');
			input.id = id;
			input.name = name;
			input.type = type;
			input.value = formatValue(value);
			input.placeholder = placeholder;
			input.setAttribute('aria-label', label);
			input.readOnly = true;
			input.className = 'block w-full text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none'.trim();
			input.style.fontSize = '13.5px';
			container.appendChild(input);

			return container;
		};

		// Helper function to create textarea field with label
		const createTextarea = (id, name, label, value, placeholder = '') => {
			const container = document.createElement('div');
			container.className = 'rounded-md bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700 focus-within:relative focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 dark:focus-within:outline-indigo-500';

			const labelEl = document.createElement('label');
			labelEl.for = id;
			labelEl.className = 'block text-xs font-medium text-gray-900 dark:text-white';
			labelEl.textContent = label;
			container.appendChild(labelEl);

			const textarea = document.createElement('textarea');
			textarea.id = id;
			textarea.name = name;
			textarea.value = formatValue(value);
			textarea.placeholder = placeholder;
			textarea.setAttribute('aria-label', label);
			textarea.readOnly = true;
			textarea.rows = 8;
			textarea.className = 'block w-full text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none resize-y';
			textarea.style.fontSize = '13.5px';
			container.appendChild(textarea);

			return container;
		};

		// Create form container
		const formContainer = document.createElement('div');
		formContainer.style.paddingLeft = '30px';
		formContainer.style.paddingRight = '30px';

		// Event Information fieldset
		const eventFieldset = document.createElement('fieldset');
		const eventLegend = document.createElement('legend');
		eventLegend.className = 'block text-sm/6 font-medium text-gray-900 dark:text-white';
		eventLegend.textContent = 'Event Information';
		eventFieldset.appendChild(eventLegend);

		const eventContainer = document.createElement('div');
		eventContainer.className = 'mt-2 -space-y-px';

		// Event type (full width, top)
		const eventTypeInput = createInput(
			`event-type-${event.id}`,
			'event-type',
			'Event Type',
			payload.event,
			'Event type',
			'text',
			'rounded-t-md'
		);
		eventContainer.appendChild(eventTypeInput);

		// Server ID and Version row
		const hasServerId = payload.serverId !== undefined;
		const hasVersion = payload.version !== undefined;

		// Timestamp (full width)
		const timestampRounded = (!hasServerId && !hasVersion) ? 'rounded-b-md' : '';
		const timestampInput = createInput(
			`event-timestamp-${event.id}`,
			'timestamp',
			'Timestamp',
			payload.timestamp,
			'Timestamp',
			'text',
			timestampRounded
		);
		eventContainer.appendChild(timestampInput);

		if (hasServerId && hasVersion) {
			// Both fields: side by side using grid for this row only
			const sideBySideContainer = document.createElement('div');
			sideBySideContainer.className = 'grid grid-cols-2 gap-0';

			const serverIdInput = createInput(
				`event-serverId-${event.id}`,
				'serverId',
				'Server ID',
				payload.serverId,
				'Server ID',
				'text',
				'rounded-bl-md'
			);
			serverIdInput.style.marginRight = '-1px';
			sideBySideContainer.appendChild(serverIdInput);

			const versionInput = createInput(
				`event-version-${event.id}`,
				'version',
				'Version',
				payload.version,
				'Version',
				'text',
				'rounded-br-md'
			);
			sideBySideContainer.appendChild(versionInput);

			eventContainer.appendChild(sideBySideContainer);
		} else if (hasServerId) {
			// Only Server ID: full width
			const serverIdInput = createInput(
				`event-serverId-${event.id}`,
				'serverId',
				'Server ID',
				payload.serverId,
				'Server ID',
				'text',
				'rounded-b-md'
			);
			eventContainer.appendChild(serverIdInput);
		} else if (hasVersion) {
			// Only Version: full width
			const versionInput = createInput(
				`event-version-${event.id}`,
				'version',
				'Version',
				payload.version,
				'Version',
				'text',
				'rounded-b-md'
			);
			eventContainer.appendChild(versionInput);
		}

		eventFieldset.appendChild(eventContainer);
		formContainer.appendChild(eventFieldset);

		// Session Information fieldset
		const hasSessionId = payload.sessionId !== undefined;
		const hasUserId = payload.userId !== undefined;

		if (hasSessionId || hasUserId) {
			const sessionFieldset = document.createElement('fieldset');
			sessionFieldset.className = 'mt-6';
			const sessionLegend = document.createElement('legend');
			sessionLegend.className = 'block text-sm/6 font-medium text-gray-900 dark:text-white';
			sessionLegend.textContent = 'Session Information';
			sessionFieldset.appendChild(sessionLegend);

			const sessionContainer = document.createElement('div');
			sessionContainer.className = 'mt-2 -space-y-px';

			if (hasSessionId && hasUserId) {
				// Both fields: side by side using grid for this row only
				const sideBySideContainer = document.createElement('div');
				sideBySideContainer.className = 'grid grid-cols-2 gap-0';

				const sessionIdInput = createInput(
					`event-sessionId-${event.id}`,
					'sessionId',
					'Session ID',
					payload.sessionId,
					'Session ID',
					'text',
					'rounded-md'
				);
				sessionIdInput.style.marginRight = '-1px';
				sideBySideContainer.appendChild(sessionIdInput);

				const userIdInput = createInput(
					`event-userId-${event.id}`,
					'userId',
					'User ID',
					payload.userId,
					'User ID',
					'text',
					'rounded-md'
				);
				sideBySideContainer.appendChild(userIdInput);

				sessionContainer.appendChild(sideBySideContainer);
			} else if (hasSessionId) {
				// Only Session ID: full width
				const sessionIdInput = createInput(
					`event-sessionId-${event.id}`,
					'sessionId',
					'Session ID',
					payload.sessionId,
					'Session ID',
					'text',
					'rounded-md'
				);
				sessionContainer.appendChild(sessionIdInput);
			} else if (hasUserId) {
				// Only User ID: full width
				const userIdInput = createInput(
					`event-userId-${event.id}`,
					'userId',
					'User ID',
					payload.userId,
					'User ID',
					'text',
					'rounded-md'
				);
				sessionContainer.appendChild(userIdInput);
			}

			sessionFieldset.appendChild(sessionContainer);
			formContainer.appendChild(sessionFieldset);
		}

		// Data fieldset (if data exists and is not empty)
		if (payload.data && Object.keys(payload.data).length > 0) {
			const dataFieldset = document.createElement('fieldset');
			dataFieldset.className = 'mt-6';
			const dataLegend = document.createElement('legend');
			dataLegend.className = 'block text-sm/6 font-medium text-gray-900 dark:text-white';
			dataLegend.textContent = 'Event Data';
			dataFieldset.appendChild(dataLegend);

			const dataContainer = document.createElement('div');
			dataContainer.className = 'mt-2 -space-y-px';
			const dataTextarea = createTextarea(
				`event-data-${event.id}`,
				'data',
				'Event Data',
				payload.data,
				'Event data (JSON)'
			);
			dataContainer.appendChild(dataTextarea);
			dataFieldset.appendChild(dataContainer);
			formContainer.appendChild(dataFieldset);
		}

		return formContainer;
	}

	function formatDescription(event) {
		// If event doesn't have data field (payload not loaded), return special marker
		if (!Object.hasOwn(event, 'data')) {
			return '__VIEW_PAYLOAD_BUTTON__';
		}

		// event.data now contains the original payload exactly as received
		return JSON.stringify(event.data);
	}


	function toggleRowExpand(eventId) {
		const expandedRow = document.getElementById(`expanded-${eventId}`);
		const mainRow = document.querySelector(`tr[data-event-id="${eventId}"]`);
		const expandBtn = document.getElementById(`expand-btn-${eventId}`);

		if (expandedRow.classList.contains('expanded')) {
			// Collapse
			expandedRow.classList.remove('expanded');
			expandBtn.classList.remove('expanded');
			mainRow.classList.remove('expanded');
		} else {
			// Expand
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


	// Infinite scroll handler
	function shouldLoadMoreOnScroll() {
		const scrollContainer = document.getElementById('logsTableScroll');

		// Prefer the table scroll container if it can scroll
		if (scrollContainer) {
			const scrollableHeight = scrollContainer.scrollHeight - scrollContainer.clientHeight;
			if (scrollableHeight > 0) {
				const distanceFromBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
				if (distanceFromBottom < 50) {
					return true;
				}
			}
		}

		// Fallback to page scroll (when the table container does not create its own scroll)
		const distanceFromBottomPage = document.documentElement.scrollHeight - window.pageYOffset - window.innerHeight;
		return distanceFromBottomPage < 50;
	}

	function handleScroll() {
		if (isLoadingMore || !hasMoreEvents) {
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
		if (notificationRefreshIntervalId) {
			clearInterval(notificationRefreshIntervalId);
			notificationRefreshIntervalId = null;
		}
	}

	function updateAutoRefreshInterval() {
		clearAutoRefreshInterval();

		const intervalMinutes = autoRefreshIntervalMinutes;
		const enabled = intervalMinutes !== '';
		autoRefreshEnabledState = enabled;

		setRefreshButtonAutoState(enabled, intervalMinutes);

		if (enabled && intervalMinutes && intervalMinutes !== '') {
			const intervalMs = Number.parseInt(intervalMinutes, 10) * 60 * 1000;
			autoRefreshIntervalId = setInterval(() => {
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
		if (autoRefreshIntervalId) {
			clearInterval(autoRefreshIntervalId);
			autoRefreshIntervalId = null;
		}
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
	let searchDebounceTimer;
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
			clearTimeout(searchDebounceTimer);
			searchDebounceTimer = setTimeout(() => {
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

	// Sort order change
	const sortBtnEl = document.getElementById('sortBtn');
	const sortIconEl = document.getElementById('sortIcon');
	if (sortBtnEl && sortIconEl) {
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
	} else {
		handleInitializationError('sort button binding', new Error('Sort button not found'));
	}

	function setupInfiniteScroll() {
		// Remove any existing scroll listeners to avoid duplicates
		if (window._eventLogScrollHandler) {
			const scrollContainer = document.getElementById('logsTableScroll');
			if (scrollContainer) {
				scrollContainer.removeEventListener('scroll', window._eventLogScrollHandler, {passive: true});
			}
			window.removeEventListener('scroll', window._eventLogScrollHandler, {passive: true});
		}

		// Create new scroll handler
		window._eventLogScrollHandler = () => {
			if (window._eventLogScrollTimeout) {
				return;
			}
			window._eventLogScrollTimeout = setTimeout(() => {
				handleScroll();
				window._eventLogScrollTimeout = null;
			}, 100);
		};

		const scrollContainer = document.getElementById('logsTableScroll');
		if (scrollContainer) {
			scrollContainer.addEventListener('scroll', window._eventLogScrollHandler, {passive: true});
		} else {
			handleInitializationError('scroll container binding', new Error('Scroll container not found'));
		}

		// Also listen to page scroll to support layouts where the table container is not scrollable
		window.addEventListener('scroll', window._eventLogScrollHandler, {passive: true});
	}

	// Setup infinite scroll
	setupInfiniteScroll();

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

		// Select all users
		if (allUserIds.size > 0) {
			selectedUserIds = new Set(allUserIds);
			// Update checkboxes in user filter dropdown
			const dropdownContent = document.getElementById('userFilterDropdownContent');
			if (dropdownContent) {
				dropdownContent.querySelectorAll('.user-filter-checkbox').forEach(checkbox => {
					const checkboxUserId = checkbox.getAttribute('data-user-id');
					if (checkboxUserId) {
						checkbox.checked = selectedUserIds.has(checkboxUserId);
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
				hoverPreviewState = null;
				isHoverPreviewActive = false;
			}
			// Avoid flickering if clicking on "All Sessions" when it's already selected
			if (selectedSession === 'all' && item.classList.contains('active')) {
				return;
			}
			document.querySelectorAll('.session-item').forEach(i => i.classList.remove('active'));
			item.classList.add('active');
			selectedSession = 'all';
			selectedActivityDate = null; // Reset to default when selecting all sessions
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

		// Add hover preview functionality
		item.addEventListener('mouseenter', () => {
			handleSessionHover('all');
		});

		item.addEventListener('mouseleave', (e) => {
			// Don't restore if mouse is still within the sessions area (sidebar-content)
			// This includes gaps between buttons
			if (e.relatedTarget && (
				e.relatedTarget.closest('.sidebar-content') ||
				e.relatedTarget.closest('.all-sessions-container') ||
				e.relatedTarget.closest('#sessionList') ||
				e.relatedTarget.closest('.session-list') ||
				e.relatedTarget.closest('.session-item')
			)) {
				return;
			}
			// Only restore if not clicking (click will handle it) and cursor left sessions area
			if (isHoverPreviewActive) {
				restoreChartState();
			}
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
	registerDropdownScrollClose(document.getElementById('logsTableScroll'));
	registerDropdownScrollClose(document.querySelector('.sessions-scrollable'));

	// Keyboard navigation state
	let keyboardNavigationMode = null; // 'sessions' or 'events'
	let selectedSessionIndex = -1;
	let selectedEventIndex = -1;

	// Remove keyboard selection from all elements
	function clearKeyboardSelection() {
		document.querySelectorAll('.session-item.keyboard-selected').forEach(item => {
			item.classList.remove('keyboard-selected');
		});
		document.querySelectorAll('.logs-table tbody tr.keyboard-selected').forEach(row => {
			row.classList.remove('keyboard-selected');
		});
	}

	// Get all session items (including "All Sessions")
	function getAllSessionItems() {
		const allSessionsItem = document.querySelector('.session-item[data-session="all"]');
		const sessionItems = Array.from(document.querySelectorAll('#sessionList .session-item'));
		return allSessionsItem ? [allSessionsItem, ...sessionItems] : sessionItems;
	}

	// Get all event rows (excluding expanded rows)
	function getAllEventRows() {
		return Array.from(document.querySelectorAll('#logsBody tr[data-event-id]')).filter(row => {
			return !row.classList.contains('log-item-expanded');
		});
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

	// Navigate events with keyboard
	function navigateEvents(direction) {
		const events = getAllEventRows();
		if (events.length === 0) {return;}

		clearKeyboardSelection();
		keyboardNavigationMode = 'events';

		if (selectedEventIndex < 0) {
			selectedEventIndex = 0;
		} else {
			if (direction === 'down') {
				selectedEventIndex = Math.min(selectedEventIndex + 1, events.length - 1);
			} else if (direction === 'up') {
				selectedEventIndex = Math.max(selectedEventIndex - 1, 0);
			}
		}

		const selectedRow = events[selectedEventIndex];
		if (selectedRow) {
			selectedRow.classList.add('keyboard-selected');
			selectedRow.scrollIntoView({behavior: 'smooth', block: 'nearest'});
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

	// Activate selected event (expand/collapse)
	function activateSelectedEvent() {
		const events = getAllEventRows();
		if (selectedEventIndex >= 0 && selectedEventIndex < events.length) {
			const selectedRow = events[selectedEventIndex];
			const eventId = selectedRow.getAttribute('data-event-id');
			if (eventId) {
				toggleRowExpand(Number.parseInt(eventId, 10));
			}
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
			} else {
				navigateEvents('down');
			}
			break;

		case 'ArrowUp':
			e.preventDefault();
			if (keyboardNavigationMode === 'sessions' || (!keyboardNavigationMode && document.activeElement.closest('.sidebar'))) {
				navigateSessions('up');
			} else {
				navigateEvents('up');
			}
			break;

		case 'Enter':
			e.preventDefault();
			if (keyboardNavigationMode === 'sessions') {
				activateSelectedSession();
			} else if (keyboardNavigationMode === 'events') {
				activateSelectedEvent();
			}
			break;

		case 'Escape':
			clearKeyboardSelection();
			keyboardNavigationMode = null;
			selectedSessionIndex = -1;
			selectedEventIndex = -1;
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
			selectedEventIndex = -1;
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
			const payload = data.event.data || {};

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

		// Reload sessions to ensure checkboxes exist in DOM, then animate
		(async () => {
			if (!selectionMode) {
				// If exiting selection mode, animate out first before reloading
				const checkboxes = document.querySelectorAll('.session-checkbox');
				checkboxes.forEach((checkbox) => {
					checkbox.classList.remove('show');
				});
				// Wait for animation to complete before reloading (reduced to match faster transition)
				await new Promise(resolve => setTimeout(resolve, 120));
			}
			await loadSessions();
			// Use requestAnimationFrame to ensure DOM is ready, then trigger transitions
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					if (selectionMode) {
						// Show checkboxes only for selected sessions
						selectedSessionsForDeletion.forEach(sessionId => {
							const checkbox = document.getElementById(`session-checkbox-${escapeHtml(sessionId)}`);
							if (checkbox && !checkbox.classList.contains('show')) {
								checkbox.classList.add('show');
							}
						});
					}
				});
			});
		})();
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
				selectedActivityDate = null; // Reset to default when selecting all sessions
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
				selectedActivityDate = null;
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

		let hoverDepth = 0;
		let closeTimeoutId = null;

		const openLegend = () => {
			if (closeTimeoutId) {
				clearTimeout(closeTimeoutId);
				closeTimeoutId = null;
			}
			wrapper.classList.add('is-open');
		};

		const scheduleClose = () => {
			if (closeTimeoutId) {
				clearTimeout(closeTimeoutId);
			}
			closeTimeoutId = setTimeout(() => {
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
	}

	async function loadDatabaseSize() {
		try {
			// Check if we have fresh cached database size data (cache for 30 seconds since it updates frequently)
			let data;
			const cacheKey = 'databaseSize';
			const thirtySecondsAgo = Date.now() - (30 * 1000);
			const lastUpdated = window.__globalDataCache.lastUpdated[cacheKey];

			if (lastUpdated && lastUpdated > thirtySecondsAgo && window.__globalDataCache[cacheKey]) {
				console.info('[Event Log] Using cached database size data');
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
	async function loadUsers() {
		try {
			// Check if we have fresh cached telemetry users data
			let data;
			if (window.isCacheFresh('telemetryUsers')) {
				console.info('[Event Log] Using cached telemetry users data');
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

			const optionsContainer = document.getElementById('userFilterOptions');
			if (!optionsContainer) {return;}

			// Clear existing options
			optionsContainer.innerHTML = '';

			// Normalize API response to consistent objects { id, label }
			const normalizedUsers = (Array.isArray(data) ? data : [])
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

			if (normalizedUsers.length === 0) {
				allUserIds = new Set();
				selectedUserIds.clear();
				optionsContainer.innerHTML = '<div class="user-filter-empty">No users found</div>';
				return;
			}

			const allIdsArray = normalizedUsers.map(user => user.id);

			// Update allUserIds and select all users by default if this is the first load
			const previousSelection = new Set(selectedUserIds);
			allUserIds = new Set(allIdsArray);
			const isFirstLoad = previousSelection.size === 0;
			if (isFirstLoad) {
				// Select all users by default
				selectedUserIds = new Set(allIdsArray);
			} else {
				// Keep only IDs that still exist
				selectedUserIds = new Set(
					Array.from(previousSelection).filter(userId => allUserIds.has(userId))
				);
			}

			// For autocomplete, we don't need Select All/Deselect All buttons
			// Users can select individual users or use the input to filter

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
			normalizedUsers.forEach((user, index) => {
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

	function setupUserFilterLabel() {
		const userFilterInput = document.getElementById('autocomplete');
		if (!userFilterInput) {
			return;
		}

		const enforceUsersLabel = () => {
			if (userFilterInput.value !== 'Users') {
				userFilterInput.value = 'Users';
			}
		};

		enforceUsersLabel();
		userFilterInput.addEventListener('change', enforceUsersLabel);
		userFilterInput.addEventListener('blur', enforceUsersLabel);

		const optionsContainer = document.getElementById('userFilterOptions');
		if (optionsContainer) {
			optionsContainer.addEventListener('click', (event) => {
				if (event.target.closest('el-option')) {
					requestAnimationFrame(() => {
						enforceUsersLabel();
					});
				}
			});
		}
	}

	// Show user filter dropdown (used by both click and hover)
	function showUserFilterDropdown() {
		const dropdown = document.getElementById('userFilterDropdown');
		const chevron = document.getElementById('userFilterChevron');
		if (!dropdown || !chevron) {return;}

		const isVisible = !dropdown.classList.contains('hidden');
		if (!isVisible) {
			dropdown.classList.remove('hidden');
			chevron.style.transform = 'rotate(180deg)';
			// Load users if not already loaded
			const optionsContainer = document.getElementById('userFilterOptions');
			if (optionsContainer && optionsContainer.children.length === 0) {
				loadUsers();
			}
		}
	}

	// Hide user filter dropdown
	function hideUserFilterDropdown() {
		const dropdown = document.getElementById('userFilterDropdown');
		const chevron = document.getElementById('userFilterChevron');
		if (!dropdown || !chevron) {return;}

		dropdown.classList.add('hidden');
		chevron.style.transform = 'rotate(0deg)';
	}

	window.toggleUserFilterDropdown = function(event) {
		event.stopPropagation();
		const dropdown = document.getElementById('userFilterDropdown');
		const chevron = document.getElementById('userFilterChevron');
		if (!dropdown || !chevron) {return;}

		const isVisible = !dropdown.classList.contains('hidden');
		if (isVisible) {
			hideUserFilterDropdown();
		} else {
			showUserFilterDropdown();
		}
	};

	// Close user filter dropdown when clicking outside
	document.addEventListener('click', (event) => {
		const dropdown = document.getElementById('userFilterDropdown');
		const dropdownContainer = event.target.closest('.user-filter-dropdown-container');

		if (dropdown && !dropdown.classList.contains('hidden')) {
			if (!dropdownContainer && !dropdown.contains(event.target)) {
				hideUserFilterDropdown();
			}
		}
	});

	// Setup hover functionality for user filter dropdown
	(function setupUserFilterDropdownHover() {
		const USER_FILTER_HIDE_DELAY_MS = 300;
		let userFilterHideTimeout = null;

		const container = document.querySelector('.user-filter-dropdown-container');
		if (!container) {
			return;
		}

		const dropdown = document.getElementById('userFilterDropdown');
		if (!dropdown) {
			return;
		}

		const cancelHide = () => {
			if (userFilterHideTimeout) {
				clearTimeout(userFilterHideTimeout);
				userFilterHideTimeout = null;
			}
		};

		const scheduleHide = () => {
			cancelHide();
			userFilterHideTimeout = setTimeout(() => {
				hideUserFilterDropdown();
				userFilterHideTimeout = null;
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
			showUserFilterDropdown();
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
		const usersTab = document.getElementById('usersTab');
		const teamsTab = document.getElementById('teamsTab');

		if (sessionsTab) {
			sessionsTab.addEventListener('click', () => {
				switchTab('sessions');
			});
		}

		if (usersTab) {
			usersTab.addEventListener('click', () => {
				switchTab('users');
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
		let resizeTimeout;
		window.addEventListener('resize', () => {
			clearTimeout(resizeTimeout);
			resizeTimeout = setTimeout(() => {
				updateTabIndicator();
			}, 100);
		});
	}

	function pauseEventLogPage() {
		// Pause all intervals when leaving the page
		if (notificationRefreshIntervalId) {
			clearInterval(notificationRefreshIntervalId);
			notificationRefreshIntervalId = null;
		}
		if (autoRefreshIntervalId) {
			clearInterval(autoRefreshIntervalId);
			autoRefreshIntervalId = null;
		}
		if (lastUpdatedIntervalId) {
			clearInterval(lastUpdatedIntervalId);
			lastUpdatedIntervalId = null;
		}
		if (hoverTimeoutId) {
			clearTimeout(hoverTimeoutId);
			hoverTimeoutId = null;
		}
		// Clear scroll timeout for infinite scroll
		if (window._eventLogScrollTimeout) {
			clearTimeout(window._eventLogScrollTimeout);
			window._eventLogScrollTimeout = null;
		}
		// Save chart option before disposing to restore it later
		if (sessionActivityChart && typeof sessionActivityChart.getOption === 'function') {
			try {
				savedSessionActivityChartOption = sessionActivityChart.getOption();
			} catch (error) {
				console.warn('Failed to save session activity chart option:', error);
				savedSessionActivityChartOption = null;
			}
		}
		// Dispose chart when leaving page to avoid stale references
		if (sessionActivityChart) {
			if (typeof sessionActivityChart.dispose === 'function') {
				sessionActivityChart.dispose();
			}
			sessionActivityChart = null;
		}
	}

	async function resumeEventLogPage() {
		// Resume intervals if they were active before pausing
		// Note: We don't re-fetch data here since the UI is preserved
		// Only restart intervals that should be running
		if (autoRefreshEnabledState && !autoRefreshIntervalId) {
			updateAutoRefreshInterval();
		}

		// Re-bind event listeners for session list items that may have been lost during soft navigation
		await loadSessions();
		// Restart last updated interval if it was running
		const lastUpdatedEl = document.querySelector('.last-updated-text');
		if (lastUpdatedEl && !lastUpdatedIntervalId) {
			lastUpdatedIntervalId = setInterval(() => {
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
		// Restore session activity chart from saved option if available
		if (savedSessionActivityChartOption && sessionActivityChart === null) {
			const chartEl = document.getElementById('sessionActivityChart');
			if (chartEl) {
				// Wait for ECharts to load if not available yet
				if (typeof echarts === 'undefined') {
					await new Promise((resolve) => {
						if (typeof echarts !== 'undefined') {
							resolve();
						} else {
							window.addEventListener('echartsLoaded', resolve, {once: true});
						}
					});
				}
				// Initialize new chart instance
				sessionActivityChart = echarts.init(chartEl);
				window.addEventListener('resize', () => {
					if (sessionActivityChart) {
						const chartEl = document.getElementById('sessionActivityChart');
						if (chartEl) {
							sessionActivityChart.resize();
						}
					}
				});
				// Restore the saved option (notMerge: true to replace entirely)
				sessionActivityChart.setOption(savedSessionActivityChartOption, true);
				sessionActivityChart.resize();
				// Clear saved option after restoration
				savedSessionActivityChartOption = null;
			}
		}
	}

	function initializeApp() {
		runSafeInitStep('notification button state', updateNotificationButtonState);
		runSafeInitStep('theme initialization', initTheme);
		runSafeInitStep('user menu structure', ensureUserMenuStructure);
		// Note: setupUserMenuHover is now auto-initialized in user-menu.js
		runSafeInitStep('level filters setup', setupLevelFilters);
		runSafeInitStep('sidebar resizer setup', setupSidebarResizer);
		runSafeInitStep('horizontal resizer setup', setupHorizontalResizer);
		runSafeInitStep('session legend hover', setupSessionLegendHover);
		runSafeInitStep('tabs setup', setupTabs);
		runSafeInitStep('user filter label', setupUserFilterLabel);
		runSafeAsyncInitStep('event type stats', () => loadEventTypeStats(selectedSession));
		runSafeAsyncInitStep('sessions list', () => loadSessions());
		runSafeAsyncInitStep('events table', () => loadEvents());
		// Lazy load database size and users list - they're not critical for initial render
		runSafeAsyncInitStep('database size', () => {
			// Delay database size load slightly to prioritize critical data
			setTimeout(() => loadDatabaseSize(), 2000);
		});
		runSafeAsyncInitStep('users list', () => {
			// Delay users list load slightly to prioritize critical data
			setTimeout(() => loadUsersList(), 300);
		});
		runSafeAsyncInitStep('teams list', () => loadTeamsList());
		runSafeAsyncInitStep('users for filter', () => loadUsers());
		runSafeAsyncInitStep('auto refresh', () => updateAutoRefreshInterval());
		runSafeInitStep('infinite scroll', () => setupInfiniteScroll());

		// Listen for chart rendering completion
		window.addEventListener('chartRenderComplete', (event) => {
			const {isInitialLoad} = event.detail;
			if (isInitialLoad) {
				// Show the page once initial chart render is complete
				revealEventLogShell();
			}
		});
	}

	// Expose a re-initializer so soft navigation can rebuild the page
	window.initializeEventLogApp = function({resetState = false} = {}) {
		if (resetState) {
			resetEventLogState();
		}
		initializeApp();
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
				await resumeEventLogPage();
			} else {
				// New page load - full initialization
				window.initializeEventLogApp({resetState: true});
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
			const payload = data.event.data || {};

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
			<div class="payload-modal-header">
				<div class="confirm-modal-title">Event Payload - ID ${eventId}</div>
				<button type="button" class="payload-modal-close" aria-label="Close payload modal">
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M6 18L18 6M6 6l12 12"></path>
					</svg>
				</button>
			</div>
			<div class="payload-modal-content">
				<textarea class="payload-modal-textarea" readonly aria-label="Event payload JSON"></textarea>
			</div>
			<div class="payload-modal-footer">
				<div class="confirm-modal-actions">
					<button type="button" class="btn" data-action="copy-json">Copy JSON</button>
					<button type="button" class="btn confirm-modal-btn-confirm" data-action="close-modal">Close</button>
				</div>
			</div>
		`;

		backdrop.appendChild(modal);
		document.body.appendChild(backdrop);
		requestAnimationFrame(() => {
			backdrop.classList.add('visible');
		});

		const textarea = modal.querySelector('.payload-modal-textarea');
		if (textarea) {
			textarea.value = formattedPayload;
		}

		const closeBtn = modal.querySelector('.payload-modal-close');
		const closeAction = modal.querySelector('[data-action="close-modal"]');
		const copyBtn = modal.querySelector('[data-action="copy-json"]');

		const handleClose = () => closePayloadModal();
		if (closeBtn) {closeBtn.addEventListener('click', handleClose);}
		if (closeAction) {closeAction.addEventListener('click', handleClose);}
		if (copyBtn) {
			copyBtn.addEventListener('click', async () => {
				try {
					await navigator.clipboard.writeText(formattedPayload);
					const originalLabel = copyBtn.textContent;
					copyBtn.textContent = 'Copied!';
					copyBtn.disabled = true;
					setTimeout(() => {
						copyBtn.textContent = originalLabel || 'Copy JSON';
						copyBtn.disabled = false;
					}, 1600);
				} catch (error) {
					console.error('Error copying payload:', error);
					safeShowToast(`Error copying payload: ${  error.message}`, 'error');
				}
			});
		}

		// Close modal when clicking backdrop
		backdrop.addEventListener('click', (e) => {
			if (e.target === backdrop) {
				closePayloadModal();
			}
		});

		// Close modal on Escape key
		const handleKeydown = function(e) {
			if (e.key === 'Escape') {
				closePayloadModal();
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
			modal.remove();
		}
	}

	window.confirmDeleteSelectedSessions = confirmDeleteSelectedSessions;
	window.toggleMobileSidebar = toggleMobileSidebar;
	window.navigateToPreviousDay = navigateToPreviousDay;
	window.navigateToNextDay = navigateToNextDay;
	window.scrollToEvent = scrollToEvent;
	window.loadEventPayload = loadEventPayload;
	window.closePayloadModal = closePayloadModal;
	window.toggleActionsDropdown = toggleActionsDropdown;
	window.copyEventPayload = copyEventPayload;
	window.confirmDeleteEvent = confirmDeleteEvent;

} // end guard to avoid duplicate execution
