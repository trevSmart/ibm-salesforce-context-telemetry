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
	console.info(`[Telemetry Viewer] Runtime detected: ${isElectronRuntime ? 'Electron' : 'Browser'}`);


	// Check authentication status on page load
	(async () => {
		try {
			const response = await fetch('/api/auth/status', {
				credentials: 'include' // Ensure cookies are sent
			});
			const data = await response.json();
			if (!data.authenticated) {
				window.location.href = '/login';
				return;
			}
			if (data.role !== 'advanced') {
				window.location.href = '/';
				return;
			}
		} catch (error) {
			console.error('Auth check failed:', error);
			window.location.href = '/login';
		}
	})();

	function showUserMenu(e) {
		e.stopPropagation();
		const userMenu = document.getElementById('userMenu');
		const isVisible = userMenu.classList.contains('show');

		// Toggle menu visibility
		if (isVisible) {
			userMenu.classList.remove('show');
		} else {
			userMenu.classList.add('show');
			// Load user info
			fetch('/api/auth/status', {
				credentials: 'include' // Ensure cookies are sent
			})
				.then(response => response.json())
				.then(data => {
					const usernameElement = document.getElementById('userMenuUsername');
					if (data.authenticated && data.username) {
						usernameElement.innerHTML = '<i class="fa-regular fa-user user-menu-icon"></i>' + escapeHtml(data.username);
					} else {
						usernameElement.innerHTML = '<i class="fa-regular fa-user user-menu-icon"></i>Not authenticated';
					}
				})
				.catch(() => {
					const usernameElement = document.getElementById('userMenuUsername');
					usernameElement.innerHTML = '<i class="fa-regular fa-user user-menu-icon"></i>Error loading user';
				});
		}
	}

	// Close user menu when clicking outside
	document.addEventListener('click', function(event) {
		const userMenu = document.getElementById('userMenu');
		const userBtn = document.getElementById('userBtn');
		const userMenuContainer = event.target.closest('.user-menu-container');

		if (userMenu && userMenu.classList.contains('show')) {
			if (!userMenuContainer && !userMenu.contains(event.target)) {
				userMenu.classList.remove('show');
			}
		}
	});

	async function handleLogout() {
		// Close menu
		const userMenu = document.getElementById('userMenu');
		if (userMenu) {
			userMenu.classList.remove('show');
		}

		try {
			const response = await fetch('/logout', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});
			if (response.ok) {
				window.location.href = '/login';
			}
		} catch (error) {
			console.error('Logout error:', error);
			window.location.href = '/login';
		}
	}

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

	let currentOffset = 0;
	let limit = 50;
	let totalEvents = 0;
	let selectedSession = 'all';
	let selectedActivityDate = null; // null means use current day by default
	let activeFilters = new Set(['tool_call', 'session_start', 'custom', 'tool_error']);
	let selectedUserIds = new Set(); // Will be populated with all users when loaded - all selected by default
	let allUserIds = new Set(); // Track all available user IDs
	let searchQuery = '';
	let sortOrder = 'DESC';
	let startTime = performance.now();
	const NOTIFICATION_REFRESH_INTERVAL = 5 * 60 * 1000;
	let notificationModeEnabled = false;
	let notificationRefreshIntervalId = null;
	let lastKnownEventTimestamp = null;
	const knownSessionIds = new Set();
	const sessionDisplayMap = new Map();
	let sessionActivityChart = null;
	let lastSessionActivityEvents = [];
	const SESSION_ACTIVITY_FETCH_LIMIT = 1000;
	// State for hover preview functionality
	let hoverPreviewState = null;
	let isHoverPreviewActive = false;
	let hoverTimeoutId = null;
	const SESSION_ACTIVITY_SLOT_MINUTES = 10;
	const SESSION_ACTIVITY_MARGIN_MINUTES = 30;
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
	const OFFICE_START = { hour: 8, minute: 30 };
	const OFFICE_END = { hour: 18, minute: 30 };
	let isResizingSidebar = false;
	let sidebarResizeStartX = 0;
	let sidebarResizeStartWidth = 0;
	let isResizingActivity = false;
	let activityResizeStartY = 0;
	let activityResizeStartHeight = 0;
	const globalErrorMessages = [];
	const MAX_GLOBAL_ERROR_MESSAGES = 3;

	// Theme management - using .dark class like Laravel Log Viewer
	// Detects system theme by default, but allows manual override
	function getSystemTheme() {
		return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}

	function applyTheme(theme) {
		if (theme === 'dark') {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
		updateThemeIcon(theme);
	}

	function initTheme() {
		const savedTheme = localStorage.getItem('theme');
		const theme = savedTheme || 'dark';
		applyTheme(theme);
	}

	function toggleTheme() {
		const isDark = document.documentElement.classList.contains('dark');
		const newTheme = isDark ? 'light' : 'dark';
		localStorage.setItem('theme', newTheme);
		applyTheme(newTheme);
		refreshSessionActivityTheme();
	}

	function updateThemeIcon(theme) {
		const iconBtn = document.querySelector('.theme-toggle');
		if (iconBtn) {
			if (theme === 'dark') {
				iconBtn.innerHTML = '<i class="fa-regular fa-sun"></i>';
			} else {
				iconBtn.innerHTML = '<i class="fa-regular fa-moon"></i>';
			}
		}
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
			const checkbox = btn.querySelector('input[type="checkbox"]');
			const level = btn.dataset.level;

			function updateButtonState() {
				if (checkbox.checked) {
					btn.classList.add('active');
					activeFilters.add(level);
				} else {
					btn.classList.remove('active');
					activeFilters.delete(level);
				}
			}

			checkbox.addEventListener('change', () => {
				updateButtonState();
				currentOffset = 0;
				loadEvents();
			});

			btn.addEventListener('click', (e) => {
				if (e.target !== checkbox) {
					checkbox.checked = !checkbox.checked;
					updateButtonState();
					checkbox.dispatchEvent(new Event('change'));
				}
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

		const startResize = (event) => {
			const point = event.touches ? event.touches[0] : event;
			isResizingSidebar = true;
			sidebarResizeStartX = point.clientX;
			sidebarResizeStartWidth = sidebar.offsetWidth;
			document.body.classList.add('sidebar-resizing');
			document.addEventListener('mousemove', handleResize);
			document.addEventListener('mouseup', stopResize);
			document.addEventListener('touchmove', handleResize, { passive: false });
			document.addEventListener('touchend', stopResize);
			event.preventDefault();
		};

		const handleResize = (event) => {
			if (!isResizingSidebar) {
				return;
			}
			const point = event.touches ? event.touches[0] : event;
			const delta = point.clientX - sidebarResizeStartX;
			let newWidth = sidebarResizeStartWidth + delta;
			newWidth = Math.max(220, Math.min(500, newWidth));
			document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
		};

		const stopResize = () => {
			if (!isResizingSidebar) {
				return;
			}
			isResizingSidebar = false;
			document.body.classList.remove('sidebar-resizing');
			document.removeEventListener('mousemove', handleResize);
			document.removeEventListener('mouseup', stopResize);
			document.removeEventListener('touchmove', handleResize);
			document.removeEventListener('touchend', stopResize);
		};

		resizer.addEventListener('mousedown', startResize);
		resizer.addEventListener('touchstart', startResize, { passive: false });
	}

	function setupHorizontalResizer() {
		const resizer = document.getElementById('horizontalResizer');
		const activityCard = document.getElementById('sessionActivityCard');
		if (!resizer || !activityCard) {
			console.warn('Horizontal resizer: resizer or activityCard not found', { resizer, activityCard });
			return;
		}

		console.log('Horizontal resizer: setting up', { resizer, activityCard, isHidden: activityCard.classList.contains('hidden') });

		const updateResizerVisibility = () => {
			const isCardHidden = activityCard.classList.contains('hidden');
			// TEMPORALMENT: sempre visible per depurar
			// if (isCardHidden) {
			// 	resizer.classList.add('hidden');
			// } else {
			// 	resizer.classList.remove('hidden');
			// }
			resizer.classList.remove('hidden'); // TEMPORAL: sempre visible
			console.log('Horizontal resizer: visibility updated', { isCardHidden, resizerHidden: resizer.classList.contains('hidden'), resizerStyles: window.getComputedStyle(resizer) });
		};

		// Update visibility when card visibility changes
		const observer = new MutationObserver(updateResizerVisibility);
		observer.observe(activityCard, { attributes: true, attributeFilter: ['class'] });
		updateResizerVisibility();

		const startResize = (event) => {
			const point = event.touches ? event.touches[0] : event;
			isResizingActivity = true;
			activityResizeStartY = point.clientY;
			activityResizeStartHeight = activityCard.offsetHeight;
			document.body.classList.add('activity-resizing');
			document.addEventListener('mousemove', handleResize);
			document.addEventListener('mouseup', stopResize);
			document.addEventListener('touchmove', handleResize, { passive: false });
			document.addEventListener('touchend', stopResize);
			event.preventDefault();
		};

		const handleResize = (event) => {
			if (!isResizingActivity) {
				return;
			}
			const point = event.touches ? event.touches[0] : event;
			const delta = point.clientY - activityResizeStartY;
			let newHeight = activityResizeStartHeight + delta;
			newHeight = Math.max(190, Math.min(600, newHeight));
			activityCard.style.height = `${newHeight}px`;
			// Redimensionar la gràfica per adaptar-se al nou espai
			if (sessionActivityChart) {
				sessionActivityChart.resize();
			}
		};

		const stopResize = () => {
			if (!isResizingActivity) {
				return;
			}
			isResizingActivity = false;
			document.body.classList.remove('activity-resizing');
			document.removeEventListener('mousemove', handleResize);
			document.removeEventListener('mouseup', stopResize);
			document.removeEventListener('touchmove', handleResize);
			document.removeEventListener('touchend', stopResize);
			// Ensure the chart resizes when resizing ends
			if (sessionActivityChart) {
				setTimeout(() => {
					sessionActivityChart.resize();
				}, 0);
			}
		};

		resizer.addEventListener('mousedown', startResize);
		resizer.addEventListener('touchstart', startResize, { passive: false });
	}

	function initSessionActivityChart() {
		if (sessionActivityChart) {
			return sessionActivityChart;
		}
		const chartEl = document.getElementById('sessionActivityChart');
		if (!chartEl || typeof echarts === 'undefined') {
			return null;
		}
		sessionActivityChart = echarts.init(chartEl);
		window.addEventListener('resize', () => {
			sessionActivityChart?.resize();
		});
		return sessionActivityChart;
	}

	function hideSessionActivityCard() {
		const card = document.getElementById('sessionActivityCard');
		if (card) {
			card.classList.add('hidden');
		}
		const title = document.getElementById('sessionActivityTitle');
		if (title) {
			title.textContent = 'Activity overview';
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
		const card = document.getElementById('sessionActivityCard');
		if (card) {
			card.classList.remove('hidden');
		}
	}

	async function fetchAllSessionsActivityEvents() {
		const params = new URLSearchParams({
			limit: SESSION_ACTIVITY_FETCH_LIMIT.toString(),
			orderBy: 'created_at',
			order: 'ASC'
		});

		const response = await fetch(`/api/events?${params}`, {
			credentials: 'include' // Ensure cookies are sent
		});
		const validResponse = await handleApiResponse(response);
		if (!validResponse) return [];
		const data = await validResponse.json();
		return Array.isArray(data.events) ? data.events : [];
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
		document.querySelectorAll('.server-item').forEach(i => i.classList.remove('active'));
		document.querySelectorAll('[data-session="all"]').forEach(i => i.classList.remove('active'));

		if (savedState.sessionId === 'all') {
			// Restore "All Sessions" as active
			document.querySelectorAll('[data-session="all"]').forEach(item => {
				item.classList.add('active');
			});
		} else {
			// Restore the specific session as active
			const sessionItem = document.querySelector(`.server-item[data-session="${savedState.sessionId}"]`);
			if (sessionItem) {
				sessionItem.classList.add('active');
			}
		}

		// Restore the chart with saved state
		if (savedState.events && savedState.events.length > 0) {
			renderSessionActivityChart(savedState.events, { sessionId: savedState.sessionId, activityDate: savedState.activityDate });
		} else {
			// If no saved events, reload the chart for the saved session
			updateSessionActivityChart({ sessionId: savedState.sessionId });
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
						renderSessionActivityChart(allEvents, { sessionId: 'all', activityDate: sessionDate, enableTransition: true });
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
							renderSessionActivityChart(data.events, { sessionId: sessionId, activityDate: sessionDate, enableTransition: true });
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

		if (eventsOverride && eventsOverride.length > 0) {
			renderSessionActivityChart(eventsOverride, { sessionId: targetSession });
			return;
		}

		if (targetSession === 'all') {
			try {
				const allEvents = await fetchAllSessionsActivityEvents();
				if (allEvents.length === 0) {
					hideSessionActivityCard();
					return;
				}
				renderSessionActivityChart(allEvents, { sessionId: 'all' });
			} catch (error) {
				handleInitializationError('all sessions activity chart', error);
				hideSessionActivityCard();
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
			const response = await fetch(`/api/events?${params}`);
			const validResponse = await handleApiResponse(response);
			if (!validResponse) return;
			const data = await validResponse.json();
			if (!data.events || data.events.length === 0) {
				hideSessionActivityCard();
				return;
			}
			renderSessionActivityChart(data.events, { sessionId: targetSession });
		} catch (error) {
			console.error('Error loading session activity chart:', error);
			hideSessionActivityCard();
		}
	}

	function renderSessionActivityChart(events, options = {}) {
		if (!Array.isArray(events) || events.length === 0) {
			hideSessionActivityCard();
			return;
		}

		const chartInstance = initSessionActivityChart();
		if (!chartInstance) {
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
		const formattedDate = formatHumanDate(referenceDate);

		// Update the title with the date
		const title = document.getElementById('sessionActivityTitle');
		if (title) {
			title.textContent = `Activity for ${formattedDate}`;
		}

		// Update navigation buttons state
		updateDateNavigationButtons(referenceDate);

		const subtitle = document.getElementById('sessionActivitySubtitle');
		if (subtitle) {
			const eventLabel = totalEvents === 1 ? 'event' : 'events';
			if (isAllSessionsView) {
				const sessionLabel = sessionCount === 1 ? 'session' : 'sessions';
				subtitle.textContent = `${formattedDate} · ${sessionCount} ${sessionLabel} · ${totalEvents} ${eventLabel}`;
			} else {
				subtitle.textContent = `${formattedDate} · ${totalEvents} ${eventLabel}`;
			}
		}
		showSessionActivityCard();

		const themeIsDark = document.documentElement.classList.contains('dark');
		const axisColor = themeIsDark ? '#a1a1aa' : '#52525b';
		const splitLineColor = themeIsDark ? 'rgba(63, 63, 70, 0.35)' : 'rgba(228, 228, 231, 0.35)';
		const gradientCap = 70;
		const yAxisMax = Math.max(15, maxBucketCount || 0);
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
			animationDuration: 500,
			animationEasing: 'cubicOut'
		} : {};

		chartInstance.setOption({
			...animationConfig,
			grid: { left: 45, right: 20, top: 15, bottom: 30 },
			xAxis: {
				type: 'time',
				min: windowStart.getTime(),
				max: windowEnd.getTime(),
				axisLabel: {
					color: axisColor,
					formatter: value => formatChartTimeLabel(new Date(value))
				},
				axisLine: { lineStyle: { color: axisColor } },
				splitLine: { show: true, lineStyle: { color: splitLineColor } },
				axisTick: { show: false }
			},
			yAxis: {
				type: 'value',
				min: 0,
				max: yAxisMax,
				minInterval: 1,
				name: 'Events',
				nameGap: 22,
				nameTextStyle: { color: axisColor },
				axisLabel: { color: axisColor },
				axisLine: { show: false },
				splitLine: { lineStyle: { color: splitLineColor } }
			},
			tooltip: {
				trigger: 'axis',
				axisPointer: { type: 'line' },
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
				itemStyle: { color: 'rgba(16,185,129,0.12)' },
				data: [
					[
						{ xAxis: officeStart.getTime() },
						{ xAxis: officeEnd.getTime() }
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
		const { start: windowStart, end: windowEnd } = getExtendedWindow(referenceDate, minEventTime, maxEventTime);
		const officeStart = new Date(referenceDate);
		officeStart.setHours(OFFICE_START.hour, OFFICE_START.minute, 0, 0);
		const officeEnd = new Date(referenceDate);
		officeEnd.setHours(OFFICE_END.hour, OFFICE_END.minute, 0, 0);
		const slotMs = SESSION_ACTIVITY_SLOT_MINUTES * 60 * 1000;
		const slotCount = Math.floor((windowEnd.getTime() - windowStart.getTime()) / slotMs) + 1;
		const buckets = Array.from({ length: slotCount }, () => 0);

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

		return { seriesData, windowStart, windowEnd, referenceDate, officeStart, officeEnd, maxBucketCount };
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
		const { start: windowStart, end: windowEnd } = getExtendedWindow(referenceDate, minEventTime, maxEventTime);
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
				sessionBuckets.set(sessionId, Array.from({ length: slotCount }, () => 0));
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

		return { seriesList, windowStart, windowEnd, referenceDate, officeStart, officeEnd, maxBucketCount };
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

		return { start, end };
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
		renderSessionActivityChart(lastSessionActivityEvents, { sessionId: selectedSession });
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
		renderSessionActivityChart(lastSessionActivityEvents, { sessionId: selectedSession });
	}

	function updateDateNavigationButtons(referenceDate) {
		const prevBtn = document.getElementById('prevDayBtn');
		const nextBtn = document.getElementById('nextDayBtn');

		if (!prevBtn || !nextBtn) return;

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

	function padNumber(value) {
		return String(value).padStart(2, '0');
	}

	function showGlobalError(message) {
		const banner = document.getElementById('globalErrorBanner');
		if (!banner || !message) {
			return;
		}
		const formattedMessage = typeof message === 'string'
			? message
			: (message?.message || 'Unexpected error');
		globalErrorMessages.unshift(formattedMessage);
		if (globalErrorMessages.length > MAX_GLOBAL_ERROR_MESSAGES) {
			globalErrorMessages.length = MAX_GLOBAL_ERROR_MESSAGES;
		}
		banner.innerHTML = globalErrorMessages
			.map(msg => `<div>${escapeHtml(msg)}</div>`)
			.join('');
		banner.classList.remove('hidden');
	}

	function handleInitializationError(context, error) {
		const details = error?.message || error || 'Unknown error';
		console.error(`Initialization error (${context}):`, error);
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
			lineStyle: { width: 3, color: hexToRgba('#53cf98', 0.5) }, // More transparent line
			areaStyle: {
				color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
					{ offset: 0, color: 'rgba(133,230,185,0.45)' },
					{ offset: warmOffset, color: 'rgba(197,241,221,0.35)' },
					{ offset: 1, color: 'rgba(216,247,232,0.16)' }
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
			lineStyle: { width: 2.5, color: hexToRgba(color, 0.5) }, // More transparent line
			areaStyle: {
				color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
					{ offset: 0, color: startColor },
					{ offset: 1, color: endColor }
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
		const bigint = parseInt(sanitized, 16);
		if (Number.isNaN(bigint)) {
			return `rgba(83, 207, 152, ${alpha})`;
		}
		const r = (bigint >> 16) & 255;
		const g = (bigint >> 8) & 255;
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
			return { html: fallbackHtml, text: fallbackShort };
		}

		const parsedDate = new Date(session.first_event);
		if (Number.isNaN(parsedDate.getTime())) {
			return { html: fallbackHtml, text: fallbackShort };
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
			return { html: dateHtml, text: dateStr };
		}

		const userHtml = `<span class="session-user"> • ${escapeHtml(userText)}</span>`;
		return { html: `${dateHtml}${userHtml}`, text: `${dateStr} • ${userText}` };
	}

	function escapeHtml(str) {
		return String(str ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
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
			sessionActivityChart.resize();
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
			const url = queryString ? `/api/event-types?${queryString}` : '/api/event-types';
			const response = await fetch(url, {
				credentials: 'include' // Ensure cookies are sent
			});
			const validResponse = await handleApiResponse(response);
			if (!validResponse) return;
			const stats = await validResponse.json();

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
			const queryString = params.toString();
			const url = queryString ? `/api/sessions?${queryString}` : '/api/sessions';
			const response = await fetch(url, {
				credentials: 'include' // Ensure cookies are sent
			});
			const validResponse = await handleApiResponse(response);
			if (!validResponse) return;
			const sessions = await validResponse.json();
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
					li.className = 'server-item';
					li.setAttribute('data-session', session.session_id);

					// Format session display: date and user
					const { html: sessionDisplayHtml, text: sessionLabelText } = formatSessionDisplay(session);
					sessionDisplayMap.set(session.session_id, sessionLabelText);

					const activeIndicator = session.is_active ? '<span class="session-active-indicator"></span>' : '';
					li.innerHTML = `
						<div class="server-item-left">
							${activeIndicator}
							<span class="server-name text-sm">${sessionDisplayHtml}</span>
						</div>
						<div class="server-item-right">
							<span class="server-size text-xs">${session.count || 0}</span>
							<div class="server-item-actions">
								<button class="actions-btn" onclick="event.stopPropagation(); toggleSessionActionsDropdown(event, '${session.session_id}')">
									<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
										<circle cx="8" cy="3" r="1.5"/>
										<circle cx="8" cy="8" r="1.5"/>
										<circle cx="8" cy="13" r="1.5"/>
									</svg>
								</button>
								<div class="actions-dropdown" id="session-dropdown-${session.session_id}">
									<div class="actions-dropdown-item delete" onclick="event.stopPropagation(); confirmDeleteSession('${session.session_id}')">
										<span>🗑️</span>
										<span>Delete</span>
									</div>
								</div>
							</div>
						</div>
					`;

					li.addEventListener('click', (e) => {
						// Don't activate session if clicking on actions button
						if (e.target.closest('.server-item-actions')) {
							return;
						}
						// Cancel hover preview when clicking
						if (isHoverPreviewActive) {
							hoverPreviewState = null;
							isHoverPreviewActive = false;
						}
						// Avoid flickering if clicking on the same session that's already selected
						if (selectedSession === session.session_id && li.classList.contains('active')) {
							return;
						}
						document.querySelectorAll('.server-item').forEach(i => i.classList.remove('active'));
						li.classList.add('active');
						selectedSession = session.session_id;
						// Pin activity chart to this session's day (prefer last event, fall back to first)
						const sessionDay = session.last_event || session.first_event || null;
						const parsedSessionDate = sessionDay ? new Date(sessionDay) : null;
						selectedActivityDate = parsedSessionDate && !Number.isNaN(parsedSessionDate.getTime())
							? parsedSessionDate
							: null;
						// When a session is selected, default to ASC order (oldest first)
						if (selectedSession !== 'all') {
							sortOrder = 'ASC';
							document.getElementById('sortSelect').value = 'ASC';
						} else {
							sortOrder = 'DESC';
							document.getElementById('sortSelect').value = 'DESC';
						}
						currentOffset = 0;
						loadEvents();
						loadEventTypeStats(selectedSession);
					});

					// Add hover preview functionality
					li.addEventListener('mouseenter', (e) => {
						// Don't preview if hovering over actions button
						if (e.target.closest('.server-item-actions')) {
							return;
						}
						handleSessionHover(session.session_id, session);
					});

					li.addEventListener('mouseleave', (e) => {
						// Don't restore if mouse is moving to actions button
						if (e.relatedTarget && e.relatedTarget.closest('.server-item-actions')) {
							return;
						}
						// Don't restore if mouse is still within the sessions area (sidebar-content)
						// This includes gaps between buttons
						if (e.relatedTarget && (
							e.relatedTarget.closest('.sidebar-content') ||
							e.relatedTarget.closest('.all-sessions-container') ||
							e.relatedTarget.closest('#sessionList') ||
							e.relatedTarget.closest('.server-list') ||
							e.relatedTarget.closest('.server-item')
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

				// Update total size
				const total = sessions.reduce((sum, session) => sum + (session.count || 0), 0);
				const totalSizeEl = document.getElementById('totalSize');
				if (totalSizeEl) {
					totalSizeEl.textContent = total;
				}
			} else {
				// Update total size to 0 if no sessions
				const totalSizeEl = document.getElementById('totalSize');
				if (totalSizeEl) {
					totalSizeEl.textContent = '0';
				}
			}
		} catch (error) {
			console.error('Error loading sessions:', error);
			// Show error in console but don't break the UI
		}
	}

	async function loadEvents(options = {}) {
		const triggeredByNotification = Boolean(options.triggeredByNotification);
		const skipUiReset = Boolean(options.skipUiReset);
		startTime = performance.now();
		const loadingMessageEl = document.getElementById('loadingMessage');
		const logsTableEl = document.getElementById('logsTable');
		const paginationEl = document.getElementById('pagination');
		const tableControlsEl = document.getElementById('tableControls');
		const errorMessageEl = document.getElementById('errorMessage');
		const emptyStateEl = document.getElementById('emptyState');

		if (loadingMessageEl) {
			loadingMessageEl.style.display = 'none';
		}
		if (!skipUiReset) {
			if (logsTableEl) {
				logsTableEl.style.display = 'none';
			}
			if (paginationEl) {
				paginationEl.style.display = 'none';
			}
			if (tableControlsEl) {
				tableControlsEl.style.display = 'none';
			}
		}

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

			// Apply level filters
			if (activeFilters.size > 0 && activeFilters.size < 4) {
				Array.from(activeFilters).forEach(level => {
					params.append('eventType', level);
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
			if (!validResponse) return;
			const data = await validResponse.json();

			const duration = Math.round(performance.now() - startTime);
			document.getElementById('durationInfo').textContent = `${duration}ms`;

			if (data.events && data.events.length > 0) {
				displayEvents(data.events);
				updatePagination(data);
				document.getElementById('logsTable').style.display = 'table';
				document.getElementById('pagination').style.display = 'flex';
				document.getElementById('tableControls').style.display = 'flex';
				handleNotificationState(data.events, triggeredByNotification);
				updateSessionActivityChart({ sessionId: selectedSession });
			} else {
				document.getElementById('emptyState').style.display = 'block';
				document.getElementById('tableControls').style.display = 'none';
				hideSessionActivityCard();
			}
		} catch (error) {
			console.error('Error loading events:', error);
			document.getElementById('errorMessage').textContent = 'Error loading events: ' + error.message;
			document.getElementById('errorMessage').style.display = 'block';
		} finally {
			if (loadingMessageEl) {
				loadingMessageEl.style.display = 'none';
			}
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
		} catch (_error) {
			return {};
		}
	}

	function extractClientName(eventData) {
		if (!eventData || typeof eventData !== 'object') {
			return '';
		}
		try {
			// New format: data.state.org.companyDetails.Name
			const nestedCompanyName = eventData.state
				&& eventData.state.org
				&& eventData.state.org.companyDetails
				&& typeof eventData.state.org.companyDetails.Name === 'string'
				&& eventData.state.org.companyDetails.Name.trim() !== ''
				? eventData.state.org.companyDetails.Name.trim()
				: null;

			if (nestedCompanyName) {
				return nestedCompanyName;
			}

			// Legacy format: data.companyDetails.Name
			if (eventData.companyDetails
				&& typeof eventData.companyDetails.Name === 'string'
				&& eventData.companyDetails.Name.trim() !== '') {
				return eventData.companyDetails.Name.trim();
			}
		} catch (_error) {
			// Ignore and fall through to default
		}
		return '';
	}

	function displayEvents(events) {
		const tbody = document.getElementById('logsBody');
		tbody.innerHTML = '';

		// Reset keyboard navigation for events when new events are loaded
		if (keyboardNavigationMode === 'events') {
			selectedEventIndex = -1;
		}

		events.forEach(event => {
			const levelClass = getLevelClass(event.event);
			const description = formatDescription(event);
			const descriptionPretty = formatDescriptionPretty(event);
			const eventData = normalizeEventData(event.data);
			const clientName = extractClientName(eventData);
			const dataStatus = typeof eventData.status === 'string'
				? eventData.status.toLowerCase()
				: null;
			const isToolFailure = event.event === 'tool_call' && (
				dataStatus === 'error' ||
				dataStatus === 'failed' ||
				eventData.success === false ||
				Boolean(eventData.error)
			);
			const isError = event.event === 'tool_error' || event.event === 'error' || isToolFailure;
			const statusClass = isError ? 'ko' : 'ok';
			const statusLabel = isError ? 'KO' : 'OK';

			// Main row
			const row = document.createElement('tr');
			row.className = `log-item-${levelClass}`;
			row.setAttribute('data-event-id', event.id);
			// Store event data in the row element to avoid API call when copying payload
			row.setAttribute('data-event', JSON.stringify(event));
			row.innerHTML = `
				<td style="text-align: center; padding: 2px 8px;">
					<button class="expand-btn" type="button" id="expand-btn-${event.id}">
						<i class="fa-solid fa-chevron-right"></i>
					</button>
				</td>
				<td style="text-align: center; padding: 2px 8px;">
					<span class="status-indicator ${statusClass}">${statusLabel}</span>
				</td>
				<td class="log-time">${formatDate(event.timestamp)}</td>
				<td>
					<span class="level-badge ${levelClass}">
						${event.event.replace('_', ' ')}
					</span>
				</td>
				<td class="log-client">${escapeHtml(clientName)}</td>
				<td class="log-description">${description}</td>
				<td class="actions-cell">
					<button class="actions-btn" onclick="toggleActionsDropdown(event, ${event.id})">
						<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
							<circle cx="8" cy="3" r="1.5"/>
							<circle cx="8" cy="8" r="1.5"/>
							<circle cx="8" cy="13" r="1.5"/>
						</svg>
					</button>
					<div class="actions-dropdown" id="dropdown-${event.id}">
						<div class="actions-dropdown-item" onclick="copyEventPayload(${event.id})">
							<span>📋</span>
							<span>Copy payload</span>
						</div>
						<div class="actions-dropdown-item delete" onclick="confirmDeleteEvent(${event.id})">
							<span>🗑️</span>
							<span>Delete</span>
						</div>
					</div>
				</td>
			`;
			const descriptionCell = row.querySelector('.log-description');
			if (descriptionCell) {
				descriptionCell.textContent = description;
				descriptionCell.removeAttribute('title');
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
			expandedTd.colSpan = 6;
			expandedTd.className = 'log-description-expanded';

			const pre = document.createElement('pre');
			pre.className = 'json-pretty';
			pre.textContent = descriptionPretty;

			expandedTd.appendChild(pre);
			expandedRow.appendChild(document.createElement('td')); // Empty first cell
			expandedRow.appendChild(expandedTd);
			tbody.appendChild(expandedRow);
		});
	}

	function getLevelClass(eventType) {
		const levelMap = {
			'tool_call': 'debug',
			'session_start': 'info',
			'session_end': 'info',
			'tool_error': 'error',
			'error': 'error',
			'custom': 'warning'
		};
		return levelMap[eventType] || 'info';
	}

	function getLevelIcon(eventType) {
		const iconMap = {
			'tool_call': '🐛',
			'session_start': 'ℹ️',
			'session_end': 'ℹ️',
			'tool_error': '❌',
			'error': '❌',
			'custom': '⚠️'
		};
		return iconMap[eventType] || 'ℹ️';
	}

	function formatDescription(event) {
		// Reconstruct the full payload as it was received
		const payload = {
			event: event.event,
			timestamp: event.timestamp,
			serverId: event.server_id || null,
			version: event.version || null,
			sessionId: event.session_id || null,
			userId: event.user_id || null,
			data: event.data || {}
		};

		// Remove null values to keep the JSON clean
		Object.keys(payload).forEach(key => {
			if (payload[key] === null) {
				delete payload[key];
			}
		});

		// Return as single line JSON (no indentation)
		return JSON.stringify(payload);
	}

	function formatDescriptionPretty(event) {
		// Reconstruct the full payload as it was received
		const payload = {
			event: event.event,
			timestamp: event.timestamp,
			serverId: event.server_id || null,
			version: event.version || null,
			sessionId: event.session_id || null,
			userId: event.user_id || null,
			data: event.data || {}
		};

		// Remove null values to keep the JSON clean
		Object.keys(payload).forEach(key => {
			if (payload[key] === null) {
				delete payload[key];
			}
		});

		// Return as pretty formatted JSON (with indentation)
		return JSON.stringify(payload, null, 2);
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
		if (!dateString) return '';
		const date = new Date(dateString);
		const day = date.getDate();
		const month = date.getMonth() + 1;
		const year = date.getFullYear().toString().slice(-2);
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		return `${day}/${month}/${year} ${hours}:${minutes}`;
	}

	function formatSize(bytes) {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
	}

	function updatePagination(data) {
		const pageInfo = document.getElementById('pageInfo');
		const currentPage = Math.floor(data.offset / data.limit) + 1;
		const totalPages = Math.ceil(data.total / data.limit);
		pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${data.total} total)`;

		document.getElementById('prevBtn').disabled = currentOffset === 0;
		document.getElementById('nextBtn').disabled = !data.hasMore;
	}

	function previousPage() {
		if (currentOffset >= limit) {
			currentOffset -= limit;
			loadEvents();
		}
	}

	function nextPage() {
		currentOffset += limit;
		loadEvents();
	}

	function refreshLogs(event) {
		if (event?.preventDefault) {
			event.preventDefault();
		}
		currentOffset = 0;
		loadEventTypeStats(selectedSession);
		loadSessions();
		loadEvents({ skipUiReset: true });
	}

	let deleteAllConfirmed = false;

	function confirmDeleteAll() {
		if (!deleteAllConfirmed) {
			deleteAllConfirmed = true;
			const confirmed = confirm('Are you sure you want to delete ALL events? This action cannot be undone.\n\nClick OK to confirm, or Cancel to abort.');
			if (!confirmed) {
				deleteAllConfirmed = false;
				return;
			}
			// Second confirmation
			const secondConfirmed = confirm('FINAL WARNING: This will permanently delete ALL events from the database.\n\nAre you absolutely sure?');
			if (!secondConfirmed) {
				deleteAllConfirmed = false;
				return;
			}
		}

		// Perform deletion
		deleteAllEvents();
	}

	async function deleteAllEvents() {
		try {
			const response = await fetch('/api/events', {
				method: 'DELETE',
				credentials: 'include' // Ensure cookies are sent
			});
			const validResponse = await handleApiResponse(response);
			if (!validResponse) return;

			const data = await validResponse.json();
			alert(`Successfully deleted ${data.deletedCount || 0} events.`);

			// Reset confirmation flag
			deleteAllConfirmed = false;

			// Refresh the view
			currentOffset = 0;
			loadEventTypeStats(selectedSession);
			loadSessions();
			loadEvents();
		} catch (error) {
			console.error('Error deleting events:', error);
			alert('Error deleting events: ' + error.message);
			deleteAllConfirmed = false;
		}
	}

	function toggleNotificationMode() {
		if (notificationModeEnabled) {
			disableNotificationMode();
		} else {
			enableNotificationMode();
		}
	}

	async function enableNotificationMode() {
		if (!('Notification' in window)) {
			alert('Your browser does not support desktop notifications.');
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
			alert('You must allow browser notifications to enable this mode.');
			return;
		}

		notificationModeEnabled = true;
		updateNotificationButtonState();
		scheduleNotificationRefresh();
	}

	function disableNotificationMode() {
		notificationModeEnabled = false;
		updateNotificationButtonState();
		clearNotificationInterval();
	}

	function updateNotificationButtonState() {
		const button = document.querySelector('.notification-toggle');
		if (!button) {
			return;
		}
		button.classList.toggle('active', notificationModeEnabled);
		button.setAttribute('title', notificationModeEnabled ? 'Disable notifications' : 'Enable notifications');
		button.innerHTML = notificationModeEnabled
			? '<i class="fa-solid fa-bell"></i>'
			: '<i class="fa-regular fa-bell"></i>';
	}

	function scheduleNotificationRefresh() {
		clearNotificationInterval();
		notificationRefreshIntervalId = setInterval(() => {
			loadEvents({ triggeredByNotification: true });
		}, NOTIFICATION_REFRESH_INTERVAL);
		loadEvents({ triggeredByNotification: true });
	}

	function clearNotificationInterval() {
		if (notificationRefreshIntervalId) {
			clearInterval(notificationRefreshIntervalId);
			notificationRefreshIntervalId = null;
		}
	}

	function handleNotificationState(events, triggeredByNotification) {
		if (!Array.isArray(events) || events.length === 0) {
			return;
		}

		const newestTimestamp = getNewestTimestampFromEvents(events);

		if (notificationModeEnabled && triggeredByNotification && lastKnownEventTimestamp) {
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
		const body = newSessionsCount === 1
			? '1 new session started.'
			: `${newSessionsCount} new sessions started.`;

		try {
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
	const searchInputEl = document.getElementById('searchInput');
	if (searchInputEl) {
		searchInputEl.addEventListener('input', (e) => {
			clearTimeout(searchDebounceTimer);
			searchDebounceTimer = setTimeout(() => {
				searchQuery = e.target.value;
				currentOffset = 0;
				loadEvents();
			}, 500);
		});
	} else {
		handleInitializationError('search input binding', new Error('Search input not found'));
	}

	// Sort order change
	const sortSelectEl = document.getElementById('sortSelect');
	if (sortSelectEl) {
		sortSelectEl.addEventListener('change', (e) => {
			sortOrder = e.target.value;
			currentOffset = 0;
			loadEvents();
		});
	} else {
		handleInitializationError('sort select binding', new Error('Sort select not found'));
	}

	// Limit change
	const limitSelectEl = document.getElementById('limitSelect');
	if (limitSelectEl) {
		limitSelectEl.addEventListener('change', (e) => {
			limit = parseInt(e.target.value);
			currentOffset = 0;
			loadEvents();
		});
	} else {
		handleInitializationError('limit select binding', new Error('Items-per-page select not found'));
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
			document.querySelectorAll('.server-item').forEach(i => i.classList.remove('active'));
			item.classList.add('active');
			selectedSession = 'all';
			selectedActivityDate = null; // Reset to default when selecting all sessions
			sortOrder = 'DESC';
			document.getElementById('sortSelect').value = 'DESC';
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
				e.relatedTarget.closest('.server-list') ||
				e.relatedTarget.closest('.server-item')
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
		document.querySelectorAll('.server-item').forEach(item => {
			item.classList.remove('dropdown-open');
		});
	}

	// Close dropdowns when clicking outside
	document.addEventListener('click', (e) => {
		if (!e.target.closest('.actions-cell') && !e.target.closest('.server-item-actions')) {
			closeAllDropdowns();
		}
	});

	function registerDropdownScrollClose(target) {
		if (!target) return;
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
		}, { passive: true });
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
		document.querySelectorAll('.server-item.keyboard-selected').forEach(item => {
			item.classList.remove('keyboard-selected');
		});
		document.querySelectorAll('.logs-table tbody tr.keyboard-selected').forEach(row => {
			row.classList.remove('keyboard-selected');
		});
	}

	// Get all session items (including "All Sessions")
	function getAllSessionItems() {
		const allSessionsItem = document.querySelector('.server-item[data-session="all"]');
		const sessionItems = Array.from(document.querySelectorAll('#sessionList .server-item'));
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
		if (sessions.length === 0) return;

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
			selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	}

	// Navigate events with keyboard
	function navigateEvents(direction) {
		const events = getAllEventRows();
		if (events.length === 0) return;

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
			selectedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
				toggleRowExpand(parseInt(eventId));
			}
		}
	}

	// Keyboard event handler
	document.addEventListener('keydown', (e) => {
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
		const dropdown = document.getElementById(`session-dropdown-${sessionId}`);
		if (!dropdown) return;
		const isShowing = dropdown.classList.contains('show');
		const button = e.currentTarget || e.target.closest('.actions-btn') || e.target.closest('button');
		const serverItem = dropdown.closest('.server-item');

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

			if (serverItem) {
				serverItem.classList.add('dropdown-open');
			}
		}
	}

	async function copyEventPayload(eventId) {
		try {
			// Get event data from the DOM element (already loaded, no API call needed)
			const row = document.querySelector(`tr[data-event-id="${eventId}"]`);
			if (!row) {
				alert('Event not found');
				return;
			}

			const eventDataStr = row.getAttribute('data-event');
			if (!eventDataStr) {
				alert('Event data not available');
				return;
			}

			const event = JSON.parse(eventDataStr);

			// Reconstruct the full payload as it was received
			const payload = {
				event: event.event,
				timestamp: event.timestamp,
				serverId: event.server_id || null,
				version: event.version || null,
				sessionId: event.session_id || null,
				userId: event.user_id || null,
				data: event.data || {}
			};

			// Remove null values to keep the JSON clean
			Object.keys(payload).forEach(key => {
				if (payload[key] === null) {
					delete payload[key];
				}
			});

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
			alert('Error copying payload: ' + error.message);
		}
	}

	function confirmDeleteEvent(eventId) {
		const confirmed = confirm('Are you sure you want to delete this event? This action cannot be undone.');
		if (confirmed) {
			deleteEvent(eventId);
		}
	}

	async function deleteEvent(eventId) {
		try {
			const response = await fetch(`/api/events/${eventId}`, {
				method: 'DELETE',
				credentials: 'include' // Ensure cookies are sent
			});
			const validResponse = await handleApiResponse(response);
			if (!validResponse) return;

			const data = await validResponse.json();

			// Close dropdown
			closeAllDropdowns();

			// Refresh the view
			loadEventTypeStats(selectedSession);
			loadSessions();
			loadEvents();
		} catch (error) {
			console.error('Error deleting event:', error);
			alert('Error deleting the event: ' + error.message);
		}
	}

	function confirmDeleteSession(sessionId) {
		const confirmed = confirm('Are you sure you want to delete all events from this session? This action cannot be undone.');
		if (confirmed) {
			deleteSession(sessionId);
		}
	}

	async function deleteSession(sessionId) {
		try {
			const response = await fetch(`/api/events?sessionId=${encodeURIComponent(sessionId)}`, {
				method: 'DELETE',
				credentials: 'include' // Ensure cookies are sent
			});
			const validResponse = await handleApiResponse(response);
			if (!validResponse) return;

			const data = await validResponse.json();

			// Close dropdown
			closeAllDropdowns();

			// If we were viewing this session, switch to "all"
			if (selectedSession === sessionId) {
				selectedSession = 'all';
				selectedActivityDate = null; // Reset to default when selecting all sessions
				document.querySelectorAll('.server-item').forEach(i => i.classList.remove('active'));
				const allSessionsItem = document.querySelector('[data-session="all"]');
				if (allSessionsItem) {
					allSessionsItem.classList.add('active');
				}
				sortOrder = 'DESC';
				document.getElementById('sortSelect').value = 'DESC';
			}

			// Refresh the view
			loadEventTypeStats(selectedSession);
			loadSessions();
			loadEvents();
		} catch (error) {
			console.error('Error deleting session:', error);
			alert('Error deleting the session: ' + error.message);
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
			const response = await fetch('/api/database-size', {
				credentials: 'include' // Ensure cookies are sent
			});
			const validResponse = await handleApiResponse(response);
			if (!validResponse) return;
			const data = await validResponse.json();
			if (data.status === 'ok') {
				const displayText = data.displayText || data.sizeFormatted;
				if (displayText) {
					const dbSizeElement = document.getElementById('dbSize');
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
		} catch (error) {
			// Silently fail if database size is not available
			console.debug('Database size not available:', error);
		}
	}

	// User filter dropdown management
	async function loadUsers() {
		try {
			const response = await fetch('/api/telemetry-users', {
				credentials: 'include'
			});
			const validResponse = await handleApiResponse(response);
			if (!validResponse) return;
			const data = await validResponse.json();

			// Check if response is an error object
			if (data && data.status === 'error') {
				console.error('Error loading users:', data.message);
				const dropdownContent = document.getElementById('userFilterDropdownContent');
				if (dropdownContent) {
					dropdownContent.innerHTML = '<div class="user-filter-empty">Error loading users</div>';
				}
				return;
			}

			// Ensure data is an array
			const userIds = Array.isArray(data) ? data : [];

			const dropdownContent = document.getElementById('userFilterDropdownContent');
			if (!dropdownContent) return;

			dropdownContent.innerHTML = '';

			if (userIds.length === 0) {
				dropdownContent.innerHTML = '<div class="user-filter-empty">No users found</div>';
				return;
			}

			// Update allUserIds and select all users by default if this is the first load
			allUserIds = new Set(userIds);
			const isFirstLoad = selectedUserIds.size === 0;
			if (isFirstLoad) {
				// Select all users by default
				selectedUserIds = new Set(userIds);
			}

			// Add "Select all" button at the top
			const selectAllButton = document.createElement('button');
			selectAllButton.className = 'user-filter-action-btn';
			selectAllButton.textContent = 'Select all';
			selectAllButton.addEventListener('click', (e) => {
				e.stopPropagation();
				// Select all users
				selectedUserIds = new Set(userIds);
				// Update all individual checkboxes
				userIds.forEach(userId => {
					const checkbox = document.getElementById(`user-filter-${userId}`);
					if (checkbox) {
						checkbox.checked = true;
					}
				});
				currentOffset = 0;
				loadEvents();
				loadEventTypeStats(selectedSession);
				loadSessions();
			});

			dropdownContent.appendChild(selectAllButton);

			// Add "Deselect all" button
			const deselectAllButton = document.createElement('button');
			deselectAllButton.className = 'user-filter-action-btn';
			deselectAllButton.textContent = 'Deselect all';
			deselectAllButton.addEventListener('click', (e) => {
				e.stopPropagation();
				// Deselect all users
				selectedUserIds.clear();
				// Update all individual checkboxes
				userIds.forEach(userId => {
					const checkbox = document.getElementById(`user-filter-${userId}`);
					if (checkbox) {
						checkbox.checked = false;
					}
				});
				currentOffset = 0;
				loadEvents();
				loadEventTypeStats(selectedSession);
				loadSessions();
			});

			dropdownContent.appendChild(deselectAllButton);

			// Add separator
			const separator = document.createElement('div');
			separator.className = 'user-filter-separator';
			dropdownContent.appendChild(separator);

			userIds.forEach(userId => {
				const userItem = document.createElement('div');
				userItem.className = 'user-filter-item';
				userItem.innerHTML = `
					<input type="checkbox" id="user-filter-${userId}" class="user-filter-checkbox" data-user-id="${userId}">
					<label for="user-filter-${userId}" class="user-filter-label">${escapeHtml(userId)}</label>
				`;

				const checkbox = userItem.querySelector('input[type="checkbox"]');
				// Check if user is selected (default to true on first load)
				checkbox.checked = selectedUserIds.has(userId);

				checkbox.addEventListener('change', (e) => {
					if (e.target.checked) {
						selectedUserIds.add(userId);
					} else {
						selectedUserIds.delete(userId);
					}
					// No need to update button states - they're always available
					currentOffset = 0;
					loadEvents();
					loadEventTypeStats(selectedSession);
					loadSessions();
				});

				dropdownContent.appendChild(userItem);
			});
		} catch (error) {
			console.error('Error loading users:', error);
		}
	}

	window.toggleUserFilterDropdown = function(event) {
		event.stopPropagation();
		const dropdown = document.getElementById('userFilterDropdown');
		const chevron = document.getElementById('userFilterChevron');
		if (!dropdown || !chevron) return;

		const isVisible = dropdown.classList.contains('show');
		if (isVisible) {
			dropdown.classList.remove('show');
			chevron.classList.remove('fa-chevron-up');
			chevron.classList.add('fa-chevron-down');
		} else {
			dropdown.classList.add('show');
			chevron.classList.remove('fa-chevron-down');
			chevron.classList.add('fa-chevron-up');
			// Load users if not already loaded
			const dropdownContent = document.getElementById('userFilterDropdownContent');
			if (dropdownContent && dropdownContent.children.length === 0) {
				loadUsers();
			}
		}
	}

	// Close user filter dropdown when clicking outside
	document.addEventListener('click', function(event) {
		const dropdown = document.getElementById('userFilterDropdown');
		const dropdownBtn = document.getElementById('userFilterDropdownBtn');
		const dropdownContainer = event.target.closest('.user-filter-dropdown-container');

		if (dropdown && dropdown.classList.contains('show')) {
			if (!dropdownContainer && !dropdown.contains(event.target)) {
				dropdown.classList.remove('show');
				const chevron = document.getElementById('userFilterChevron');
				if (chevron) {
					chevron.classList.remove('fa-chevron-up');
					chevron.classList.add('fa-chevron-down');
				}
			}
		}
	});

	function initializeApp() {
		runSafeInitStep('notification button state', updateNotificationButtonState);
		runSafeInitStep('theme initialization', initTheme);
		runSafeInitStep('level filters setup', setupLevelFilters);
		runSafeInitStep('sidebar resizer setup', setupSidebarResizer);
		runSafeInitStep('horizontal resizer setup', setupHorizontalResizer);
		runSafeInitStep('session legend hover', setupSessionLegendHover);
		runSafeAsyncInitStep('event type stats', () => loadEventTypeStats(selectedSession));
		runSafeAsyncInitStep('sessions list', () => loadSessions());
		runSafeAsyncInitStep('events table', () => loadEvents());
		runSafeAsyncInitStep('database size', () => loadDatabaseSize());
		runSafeAsyncInitStep('users list', () => loadUsers());
	}

	initializeApp();
	// Handle smooth hover animation for icon buttons group
	(function() {
		const iconButtonsGroup = document.querySelector('.icon-buttons-group');
		if (!iconButtonsGroup) return;

		let isInsideGroup = false;
		let currentHoveredButton = null;
		let hasEnteredFromOutside = false;

		iconButtonsGroup.addEventListener('mouseenter', (e) => {
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
			button.addEventListener('mouseenter', (e) => {
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
					void iconButtonsGroup.offsetHeight;

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
	})();
