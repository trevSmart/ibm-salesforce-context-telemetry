// @ts-nocheck
import {toggleTheme, initializeTheme} from './theme.js';
import {timerRegistry} from './utils/timerRegistry.js';
import {awaitECharts, safeInit, bindWindowResize} from './echarts-core.js';

// Dashboard constants
const SESSION_START_SERIES_COLOR = '#2195cfdd';
const TOP_USERS_LOOKBACK_DAYS = 14;
const TOP_USERS_LIMIT = 3;
const TOP_TEAMS_LOOKBACK_DAYS = 30;
const TOP_TEAMS_LIMIT = 5;
const SERVER_VERSION_LABEL = 'v1.0.0';
const REFRESH_ICON_ANIMATION_DURATION_MS = 700;
const DEFAULT_DASHBOARD_TIME_RANGE_DAYS = 30;
let serverStatsLastFetchTime = null;
let currentDays = DEFAULT_DASHBOARD_TIME_RANGE_DAYS;

// Chart configuration
let chart = null;
let chartUnbindResize = null; // Store unbind function to clean up resize handler
let isInitialChartLoad = true; // Track if this is the initial chart load
let savedChartOption = null; // Store chart option when pausing for cache restoration
let chartResizeObserver = null;

// Global cache is now handled by global-cache.js

// Helper function to escape HTML
function escapeHtml(str) {
	return String(str ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

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

function updateServerStatsLastUpdatedText() {
	const lastUpdatedEl = document.getElementById('serverStatsLastUpdated');
	if (lastUpdatedEl) {
		lastUpdatedEl.textContent = formatTimeAgo(serverStatsLastFetchTime);
	}
}

function startServerStatsInterval() {
	timerRegistry.setInterval('dashboard.serverStatsUpdate', updateServerStatsLastUpdatedText, 60000);
}

function setServerStatsLoadTime(durationMs) {
	const loadTimeEl = document.getElementById('serverStatsLoadTime');
	if (!loadTimeEl) {
		return;
	}
	if (Number.isFinite(durationMs)) {
		const clamped = Math.max(0, Math.round(durationMs));
		loadTimeEl.textContent = `${clamped}ms`;
	} else {
		loadTimeEl.textContent = '-';
	}
}

function setServerStatsVersion() {
	const versionEl = document.getElementById('serverStatsVersion');
	if (versionEl) {
		versionEl.textContent = SERVER_VERSION_LABEL;
	}
}

function resetServerStatsUi() {
	serverStatsLastFetchTime = null;
	timerRegistry.clearInterval('dashboard.serverStatsUpdate');
	updateServerStatsLastUpdatedText();
	setServerStatsLoadTime(null);
	const dbSizeElement = document.getElementById('serverStatsDbSize');
	if (dbSizeElement) {
		dbSizeElement.textContent = '-';
		dbSizeElement.style.color = '';
	}
}

function recordServerStatsFetch(durationMs) {
	serverStatsLastFetchTime = Date.now();
	updateServerStatsLastUpdatedText();
	if (!timerRegistry.has('dashboard.serverStatsUpdate')) {
		startServerStatsInterval();
	}
	if (Number.isFinite(durationMs)) {
		setServerStatsLoadTime(durationMs);
	}
}

async function loadDashboardDatabaseSize() {
	try {
		const response = await fetch('/api/database-size', {
			credentials: 'include'
		});
		if (!response.ok) {
			return;
		}
		const data = await response.json();
		if (data?.status !== 'ok') {
			return;
		}
		const displayText = data.displayText || data.sizeFormatted;
		const dbSizeElement = document.getElementById('serverStatsDbSize');
		if (dbSizeElement && displayText) {
			dbSizeElement.textContent = displayText;
			if (data.percentage !== null && data.percentage !== undefined) {
				if (data.percentage >= 80) {
					dbSizeElement.style.color = 'var(--level-error)';
				} else if (data.percentage >= 70) {
					dbSizeElement.style.color = 'var(--level-warning)';
				} else {
					dbSizeElement.style.color = '';
				}
			}
		}
	} catch {
		// Silently fail if database size is not available
	}
}

function formatUptime(seconds) {
	if (!Number.isFinite(seconds) || seconds < 0) {
		return 'Unknown';
	}

	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);

	if (days > 0) {
		return `${days}d ${hours}h ${minutes}m`;
	} else if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
		return `${minutes}m`;

}

async function loadHealthCheckData() {
	const startTime = performance.now();

	try {
		const response = await fetch('/health?format=json');
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const healthData = await response.json();

		// Update version
		const versionElement = document.getElementById('serverStatsVersion');
		if (versionElement && healthData.version) {
			versionElement.textContent = healthData.version;
		}

		// Update uptime
		const uptimeElement = document.getElementById('serverStatsUptime');
		if (uptimeElement && healthData.uptime !== undefined) {
			uptimeElement.textContent = formatUptime(healthData.uptime);
		}

		// Load database size information
		try {
			await loadDashboardDatabaseSize();
		} catch (error) {
			console.warn('Failed to load database size for server stats:', error);
			const dbSizeElement = document.getElementById('serverStatsDbSize');
			if (dbSizeElement) {dbSizeElement.textContent = 'N/A';}
		}

		const endTime = performance.now();
		const durationMs = endTime - startTime;
		recordServerStatsFetch(durationMs);

	} catch (error) {
		console.warn('Failed to load health check data:', error);

		// Set error states
		const versionElement = document.getElementById('serverStatsVersion');
		if (versionElement) {versionElement.textContent = 'Error';}

		const uptimeElement = document.getElementById('serverStatsUptime');
		if (uptimeElement) {uptimeElement.textContent = 'Error';}

		const dbSizeElement = document.getElementById('serverStatsDbSize');
		if (dbSizeElement) {dbSizeElement.textContent = 'Error';}

		const endTime = performance.now();
		const durationMs = endTime - startTime;
		recordServerStatsFetch(durationMs);
	}
}

// Initial bootstrap
initializeDashboardPage();

// Initialize dashboard; reused on first load and on soft navigation
async function initializeDashboardPage({resetState = false} = {}) {
	// Reset chart state when coming back from another page
	if (resetState && chart) {
		try {
			if (typeof chart.dispose === 'function') {
				chart.dispose();
			}
		} catch (error) {
			console.warn('Error disposing chart:', error);
		}
		if (chartUnbindResize) {
			try {
				chartUnbindResize();
			} catch (error) {
				console.warn('Error unbinding chart resize handler:', error);
			}
			chartUnbindResize = null;
		}
		if (chartResizeObserver) {
			try {
				chartResizeObserver.disconnect();
			} catch (error) {
				console.warn('Error disconnecting chart resize observer:', error);
			}
			chartResizeObserver = null;
		}
		chart = null;
	}

	// Always restore saved time range from localStorage, default to last month if not found
	const savedTimeRange = localStorage.getItem('dashboardTimeRange');
	currentDays = savedTimeRange ? Number.parseInt(savedTimeRange, 10) : DEFAULT_DASHBOARD_TIME_RANGE_DAYS;

	if (resetState) {
		isInitialChartLoad = true;
		resetServerStatsUi();
	}

	// Always set the combobox value to match the current days
	const timeRangeSelect = document.getElementById('timeRangeSelect');
	if (timeRangeSelect) {
		timeRangeSelect.value = String(currentDays);
	}

	setServerStatsVersion();

	try {
		const response = await fetch('/api/auth/status', {
			credentials: 'include' // Ensure cookies are sent
		});
		const data = await response.json();
		if (!data.authenticated) {
			window.location.href = '/login';
			return;
		}

		const eventLogLink = document.getElementById('eventLogLink');
		if (eventLogLink) {
			if (data.role === 'advanced' || data.role === 'administrator' || data.role === 'god') {
				eventLogLink.style.display = '';
			} else {
				eventLogLink.style.display = 'none';
			}
		}

		// Only load chart data if authenticated
		try {
			await loadChartData();
		} catch (error) {
			console.warn('Failed to load initial chart data, will retry on refresh:', error);
		}
		try {
			await loadTopUsersToday();
		} catch (error) {
			console.warn('Failed to load top users data:', error);
		}
		try {
			await loadTopTeamsToday();
		} catch (error) {
			console.warn('Failed to load top teams data:', error);
		}
		try {
			// Load health check data
			await loadHealthCheckData();
		} catch (error) {
			console.warn('Failed to load health check data:', error);
		}
		try {
			// Delay database size load slightly to prioritize critical data
			setTimeout(async () => {
				try {
					await loadDashboardDatabaseSize();
				} catch (error) {
					console.warn('Failed to load database size:', error);
				}
			}, 2000);
		} catch (error) {
			console.warn('Failed to load database size:', error);
		}

		// Set up time range selector (guard against duplicate listeners)
		const timeRangeSelect = document.getElementById('timeRangeSelect');
		if (timeRangeSelect && timeRangeSelect.dataset.dashboardInitialized !== 'true') {
			const handleTimeRangeChange = (e) => {
				const days = Number.parseInt(e.target.value, 10);
				const resolvedDays = Number.isFinite(days) ? days : currentDays;
				// Save selected time range to localStorage
				localStorage.setItem('dashboardTimeRange', resolvedDays.toString());
				loadChartData(resolvedDays);
			};
			timeRangeSelect.addEventListener('change', handleTimeRangeChange);
			timeRangeSelect.addEventListener('input', handleTimeRangeChange);
			timeRangeSelect.dataset.dashboardInitialized = 'true';
		}
	} catch (error) {
		console.error('Auth check failed:', error);
		window.location.href = '/login';
	}
}


// User menu functions are now in user-menu.js

// Page-specific refresh callback for when events are deleted
window.onEventsDeleted = function() {
	loadChartData(currentDays);
};

// Page-specific refresh callback for when trash is emptied
window.onTrashEmptied = function() {
	loadChartData(currentDays);
};





function clearLocalData() {
	openConfirmModal({
		title: 'Clear local data',
		message: 'This will clear all local data stored in this browser for the telemetry UI (theme, filters, etc.).',
		confirmLabel: 'Clear data',
		destructive: true
	}).then((confirmed) => {
		if (!confirmed) {
			return;
		}
		try {
			localStorage.clear();
		} catch (error) {
			console.error('Error clearing local storage:', error);
		}
		window.location.reload();
	});
}

function openConfirmModal({title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive = false}) {
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
				<button type="button" class="text-sm btn">${escapeHtml(cancelLabel)}</button>
				<button type="button" class="btn ${destructive ? 'inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-red-500 sm:ml-3 sm:w-auto' : 'confirm-modal-btn-confirm'}">${escapeHtml(confirmLabel)}</button>
			</div>
		`;

		backdrop.appendChild(modal);
		document.body.appendChild(backdrop);

		// Trigger enter transition on next frame
		requestAnimationFrame(() => {
			backdrop.classList.add('visible');
		});

		function animateAndResolve(result) {
			const handleTransitionEnd = (event) => {
				if (event.target !== backdrop) {
					return;
				}
				backdrop.removeEventListener('transitionend', handleTransitionEnd);
				backdrop.remove();
			};

			backdrop.addEventListener('transitionend', handleTransitionEnd);
			backdrop.classList.remove('visible');
			backdrop.classList.add('hiding');

			resolve(result);
		}

		const [cancelBtn, confirmBtn] = modal.querySelectorAll('.btn');
		cancelBtn.addEventListener('click', () => animateAndResolve(false));
		confirmBtn.addEventListener('click', () => animateAndResolve(true));

		document.addEventListener(
			'keydown',
			function handleKeydown(e) {
				if (e.key === 'Escape') {
					e.stopImmediatePropagation();
					e.preventDefault();
					document.removeEventListener('keydown', handleKeydown);
					if (document.body.contains(backdrop)) {
						animateAndResolve(false);
					}
				}
			}
		);
	});
}

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

// Shared settings modal used by both dashboard and event log pages

// Settings modal moved to settings-modal.js


// Initialize theme
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => {
		initializeTheme();
		ensureUserMenuStructure();
		setupIconButtonsGroupHover();
	});
} else {
	initializeTheme();
	ensureUserMenuStructure();
	setupIconButtonsGroupHover();
}

// Handle smooth hover animation for icon buttons group
function setupIconButtonsGroupHover() {
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
				currentHoveredButton = null;
			}
		});
	});
}

// Refresh dashboard function

async function refreshDashboard(event) {
	if (event) {
		event.stopPropagation();
	}
	// Rotate refresh icon
	const button = event?.target?.closest('.icon-btn') || event?.currentTarget;
	const refreshIcon = button?.querySelector('.fa-refresh, .refresh-icon') || (event?.target?.classList?.contains('fa-refresh') ? event.target : null);
	if (refreshIcon) {
		refreshIcon.classList.add('rotating');
	}
	// Reload chart data with current days setting
	try {
		await Promise.all([
			loadChartData(currentDays),
			loadTopUsersToday(),
			loadTopTeamsToday(),
			loadHealthCheckData(),
			loadDashboardDatabaseSize()
		]);
	} catch (error) {
		// Any errors are already logged inside loadChartData; this catch
		// simply ensures we always stop the spinner.
		console.error('Error refreshing dashboard:', error);
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
	}
}

function revealDashboardShell() {
	const body = document.body;
	if (body.classList.contains('hydrating')) {
		body.classList.remove('hydrating');
	}
	// Container is now visible by default for better LCP
	// Only reveal the chart area when ready
	const chartEl = document.getElementById('eventsChart');
	if (chartEl) {
		chartEl.classList.add('chart-visible');
	}
}

// Function to calculate polynomial regression (degree 2 for curved trend)
function calculatePolynomialRegression(dataPoints, degree = 2) {
	const n = dataPoints.length;
	if (n < degree + 1) {return {coefficients: [0]};}

	// Prepare matrices for polynomial regression
	const X = [];
	const Y = dataPoints;

	for (let i = 0; i < n; i++) {
		const row = [];
		for (let j = 0; j <= degree; j++) {
			row.push(Math.pow(i, j));
		}
		X.push(row);
	}

	// Solve normal equations using Gaussian elimination
	const coefficients = solveNormalEquations(X, Y);
	return {coefficients};
}

// Gaussian elimination for normal equations
function solveNormalEquations(X, Y) {
	const n = X[0].length;
	const m = X.length;

	// Create augmented matrix [X^T * X | X^T * Y]
	const A = Array.from({length: n}, () => Array(n + 1).fill(0));

	// Calculate X^T * X and X^T * Y
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0;
			for (let k = 0; k < m; k++) {
				sum += X[k][i] * X[k][j];
			}
			A[i][j] = sum;
		}
		let sum = 0;
		for (let k = 0; k < m; k++) {
			sum += X[k][i] * Y[k];
		}
		A[i][n] = sum;
	}

	// Gaussian elimination
	for (let i = 0; i < n; i++) {
		// Find pivot
		let maxRow = i;
		for (let k = i + 1; k < n; k++) {
			if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
				maxRow = k;
			}
		}

		// Swap rows
		[A[i], A[maxRow]] = [A[maxRow], A[i]];

		// Make pivot 1
		const pivot = A[i][i];
		if (Math.abs(pivot) < 1e-10) {continue;} // Skip if pivot is too small

		for (let j = i; j <= n; j++) {
			A[i][j] /= pivot;
		}

		// Eliminate
		for (let k = 0; k < n; k++) {
			if (k !== i) {
				const factor = A[k][i];
				for (let j = i; j <= n; j++) {
					A[k][j] -= factor * A[i][j];
				}
			}
		}
	}

	// Extract coefficients
	const coefficients = [];
	for (let i = 0; i < n; i++) {
		coefficients.push(A[i][n]);
	}

	return coefficients;
}

// Function to calculate exponential smoothing
function calculateExponentialSmoothing(dataPoints, alpha = 0.3) {
	if (dataPoints.length === 0) {return [];}

	const smoothed = [dataPoints[0]]; // First value remains the same

	for (let i = 1; i < dataPoints.length; i++) {
		const smoothedValue = alpha * dataPoints[i] + (1 - alpha) * smoothed[i - 1];
		smoothed.push(smoothedValue);
	}

	return smoothed;
}

// Remove trailing zeros so future empty days don't distort the trend fit
function trimTrailingZeros(dataPoints) {
	let lastNonZeroIndex = -1;
	for (let i = dataPoints.length - 1; i >= 0; i--) {
		const value = Number(dataPoints[i]);
		if (Number.isFinite(value) && value !== 0) {
			lastNonZeroIndex = i;
			break;
		}
	}

	if (lastNonZeroIndex === -1 || lastNonZeroIndex === dataPoints.length - 1) {
		return dataPoints;
	}

	return dataPoints.slice(0, lastNonZeroIndex + 1);
}

// Function to generate trend line data using polynomial regression for curved trends
function generateTrendLine(dataPoints, futurePoints = 3, method = 'polynomial') {
	let trendData = [];
	let extrapolatedData = [];

	if (method === 'polynomial') {
		// Use polynomial regression (degree 2) for curved trends
		const {coefficients} = calculatePolynomialRegression(dataPoints, 2);

		// Generate trend line for existing data points
		trendData = dataPoints.map((_, index) => {
			let value = 0;
			for (let i = 0; i < coefficients.length; i++) {
				value += coefficients[i] * Math.pow(index, i);
			}
			return Math.max(0, value); // Ensure non-negative values
		});

		// Extrapolate future points
		for (let i = 0; i < futurePoints; i++) {
			const futureIndex = dataPoints.length + i;
			let value = 0;
			for (let j = 0; j < coefficients.length; j++) {
				value += coefficients[j] * Math.pow(futureIndex, j);
			}
			extrapolatedData.push(Math.max(0, value));
		}
	} else if (method === 'exponential') {
		// Use exponential smoothing for trend following recent patterns
		const smoothed = calculateExponentialSmoothing(dataPoints, 0.55); // menys smoothing
		// Extend smoothing for future points (use last smoothed value)
		const lastSmoothed = smoothed.at(-1);
		trendData = smoothed;
		extrapolatedData = Array(futurePoints).fill(lastSmoothed);
	}

	return {
		trendData,
		extrapolatedData,
		method
	};
}

function attachChartResizeObserver(chartEl) {
	if (typeof ResizeObserver === 'undefined' || !chartEl) {
		return;
	}
	if (chartResizeObserver) {
		chartResizeObserver.disconnect();
	}
	chartResizeObserver = new ResizeObserver(() => {
		try {
			if (chart && typeof chart.resize === 'function') {
				chart.resize();
			}
		} catch (error) {
			console.warn('Error resizing chart via ResizeObserver:', error);
			// If resize fails, disconnect the observer to prevent further errors
			try {
				chartResizeObserver?.disconnect();
				chartResizeObserver = null;
			} catch (disconnectError) {
				console.warn('Error disconnecting ResizeObserver:', disconnectError);
			}
		}
	});
	chartResizeObserver.observe(chartEl);
}

async function initChart() {
	if (chart) {
		return chart;
	}
	const chartEl = document.getElementById('eventsChart');
	if (!chartEl) {
		return null;
	}

	// Wait for ECharts to load if not available yet
	await awaitECharts();

	// Safe initialization with cleanup
	chart = safeInit(chartEl);
	if (!chart) {
		return null;
	}

	// Bind resize handler with cleanup function
	chartUnbindResize = bindWindowResize(chart, {chartName: 'events per day'});
	attachChartResizeObserver(chartEl);
	return chart;
}

function updateChartLegendOverlay(legendItems) {
	const overlay = document.getElementById('chartLegendOverlay');
	if (!overlay) {
		return;
	}

	if (!Array.isArray(legendItems) || legendItems.length === 0) {
		overlay.innerHTML = '';
		overlay.setAttribute('data-state', 'empty');
		return;
	}

	const legendSelected = chart?.getOption()?.legend?.[0]?.selected || {};

	const itemsMarkup = legendItems.map((item) => {
		const name = escapeHtml(item?.name || '');
		const color = escapeHtml(item?.itemStyle?.color || '#94a3b8');
		const icon = item?.icon === 'line' ? 'line' : 'circle';
		const markerClass = icon === 'line'? 'chart-legend-overlay-marker chart-legend-overlay-marker--line': 'chart-legend-overlay-marker';
		const isSelected = legendSelected[item?.name] !== false; // default true when undefined
		const disabledClass = isSelected ? '' : ' is-disabled';
		return `<span class="chart-legend-overlay-item${disabledClass}" data-series-name="${name}"><span class="${markerClass}" style="background:${color};"></span>${name}</span>`;
	}).join('');

	overlay.innerHTML = itemsMarkup;
	overlay.setAttribute('data-state', 'ready');

	// Attach click handlers for toggling series visibility
	overlay.querySelectorAll('.chart-legend-overlay-item').forEach((itemEl) => {
		itemEl.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			const seriesName = itemEl.getAttribute('data-series-name');
			if (!seriesName || !chart) {return;}

			chart.dispatchAction({type: 'legendToggleSelect', name: seriesName});

			const selectedMap = chart.getOption()?.legend?.[0]?.selected || {};
			const isSelected = selectedMap[seriesName] !== false;
			itemEl.classList.toggle('is-disabled', !isSelected);
		});
	});
}

function renderTopUsersPlaceholder(message) {
	const list = document.getElementById('topUsersList');
	if (!list) {
		return;
	}
	list.innerHTML = `<li class="top-users-empty">${escapeHtml(message)}</li>`;
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

function renderTopUsers(users) {
	const list = document.getElementById('topUsersList');
	if (!list) {
		return;
	}

	if (!users || users.length === 0) {
		renderTopUsersPlaceholder('No events recorded in the last 14 days yet.');
		return;
	}

	const items = users.map((user, index) => {
		const name = user.label || user.id || 'Unknown user';
		const initial = getUserInitials(name);
		const eventCount = Number(user.eventCount) || 0;
		const countLabel = eventCount === 1 ? '1 event last 14 days' : `${eventCount} events last 14 days`;
		const badgeBackground = index === 0 ? '#dc2626' : SESSION_START_SERIES_COLOR;

		return `
      <li class="top-users-item">
        <span class="person-avatar">${escapeHtml(initial)}</span>
        <div class="top-users-info">
          <div class="top-users-name-row">
            <strong class="top-users-name" title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
            <span class="top-users-badge" style="background: ${badgeBackground}; color: #ffffff;">${escapeHtml(String(eventCount))} events</span>
          </div>
          <div class="top-users-role">${escapeHtml(countLabel)}</div>
        </div>
        <button type="button" class="top-users-action" aria-label="Open user">
          <i class="fa-solid fa-chevron-right" aria-hidden="true" style="font-size: 11px;"></i>
        </button>
      </li>
    `;
	}).join('');

	list.innerHTML = items;
}

function renderTopTeamsPlaceholder(message) {
	const list = document.getElementById('topTeamsList');
	if (!list) {
		return;
	}
	list.innerHTML = `<li class="top-users-empty">${escapeHtml(message)}</li>`;
}

function renderTopTeams(teams) {
	const list = document.getElementById('topTeamsList');
	if (!list) {
		return;
	}

	if (!teams || teams.length === 0) {
		renderTopTeamsPlaceholder('No team activity recorded in the last 30 days yet.');
		return;
	}

	const items = teams.map((team, index) => {
		const teamName = team.label || team.id || 'Unknown team';
		const eventCount = Number(team.eventCount) || 0;
		// const countLabel = eventCount === 1 ? '1 event last 30 days' : `${eventCount} events last 30 days`;
		const clientName = team.clientName ? team.clientName : '';
		const orgNames = Array.isArray(team.orgs)? team.orgs
				.map(name => typeof name === 'string' ? name.trim() : '')
				.filter(name => name.length > 0): [];
		const orgText = orgNames.length > 0? orgNames.map(name => escapeHtml(name)).join(' · '): (clientName ? escapeHtml(clientName) : escapeHtml('No org events recorded yet'));
		const orgSubtitle = `
			<span class="top-teams-orgs" style="display: inline-flex; align-items: center; gap: 6px;">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="size-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z" />
				</svg>
				<span>${orgText}</span>
			</span>
		`.trim();
		const badgeBackground = index === 0 ? '#dc2626' : SESSION_START_SERIES_COLOR;
		const logoUrl = team.logoUrl || (team.teamId && team.hasLogo ? `/api/teams/${team.teamId}/logo` : '');
		const initials = teamName.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase();

		const avatar = logoUrl? `
        <span class="top-users-avatar top-users-avatar--team" style="padding: 0; background: transparent; border-radius: 7px;">
          <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(teamName)} logo" class="team-logo" style="width: 32px; height: 32px; aspect-ratio: 1;" onerror="this.style.display='none'; const fallback=this.nextElementSibling; if (fallback) { fallback.style.display='flex'; }">
          <span class="top-users-avatar top-users-avatar--team" style="background: ${team.color || badgeBackground}; display:none; width: 32px; height: 32px; aspect-ratio: 1;">
            ${escapeHtml(initials)}
          </span>
        </span>
      `: `
        <span class="top-users-avatar top-users-avatar--team" style="background: ${team.color || badgeBackground};">
          ${escapeHtml(initials)}
        </span>
      `;

		return `
      <li class="top-users-item">
        ${avatar}
        <div class="top-users-info">
          <div class="top-users-name-row">
            <strong class="top-users-name" title="${escapeHtml(teamName)}">${escapeHtml(teamName)}</strong>
            <span class="top-users-badge" style="background: ${badgeBackground}; color: #ffffff;">${escapeHtml(String(eventCount))} events</span>
          </div>
          <div class="top-users-role">
						${orgSubtitle}
					</div>
        </div>
        <button type="button" class="top-users-action" aria-label="Open team">
          <i class="fa-solid fa-chevron-right" aria-hidden="true" style="font-size: 11px;"></i>
        </button>
      </li>
    `;
	}).join('');

	list.innerHTML = items;
}

async function loadTopUsersToday() {
	const list = document.getElementById('topUsersList');
	if (!list) {
		return;
	}

	// Check if we have valid cached data
	const cachedData = window.getCachedData('topUsersToday');
	if (cachedData) {
		renderTopUsers(cachedData);
		return;
	}

	renderTopUsersPlaceholder('Loading top users…');

	try {
		const response = await fetch(`/api/top-users-today?days=${TOP_USERS_LOOKBACK_DAYS}&limit=${TOP_USERS_LIMIT}`, {
			credentials: 'include'
		});

		if (response.status === 401) {
			window.location.href = '/login';
			return;
		}

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const payload = await response.json();
		const users = Array.isArray(payload?.users) ? payload.users : [];
		window.updateCache('topUsersToday', users);
		renderTopUsers(users);
	} catch (error) {
		console.error('Error loading top users:', error);
		renderTopUsersPlaceholder('Unable to load top users right now.');
	}
}

async function loadTopTeamsToday() {
	const list = document.getElementById('topTeamsList');
	if (!list) {
		return;
	}

	// Check if we have valid cached data
	const cachedData = window.getCachedData('topTeamsToday');
	if (cachedData) {
		renderTopTeams(cachedData);
		return;
	}

	renderTopTeamsPlaceholder('Loading top teams…');

	try {
		const params = new URLSearchParams({
			days: TOP_TEAMS_LOOKBACK_DAYS.toString(),
			limit: TOP_TEAMS_LIMIT.toString()
		});

		const response = await fetch(`/api/top-teams-today?${params}`, {
			credentials: 'include'
		});

		if (response.status === 401) {
			window.location.href = '/login';
			return;
		}

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const payload = await response.json();
		const teams = Array.isArray(payload?.teams) ? payload.teams : [];
		window.updateCache('topTeamsToday', teams);
		renderTopTeams(teams);
	} catch (error) {
		console.error('Error loading top teams:', error);
		renderTopTeamsPlaceholder('Unable to load top teams right now.');
	}
}

async function loadChartData(days = currentDays) {
	const fetchStartTime = performance.now();
	let chartInstance;
	try {
		currentDays = days;
		const response = await fetch(`/api/daily-stats?days=${days}&byEventType=true`, {
			credentials: 'include'
		});

		if (response.status === 401) {
			window.location.href = '/login';
			return;
		}
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();
		if (!Array.isArray(data)) {
			throw new Error('Invalid stats response');
		}

		recordServerStatsFetch(performance.now() - fetchStartTime);

		if (data.length === 0 && isInitialChartLoad) {
			isInitialChartLoad = false;
			revealDashboardShell();
		}

		chartInstance = await initChart();
		if (!chartInstance) {
			return;
		}

		const hasBreakdown =
		data.length > 0 &&
		(data[0].startSessionsWithoutEnd !== undefined || data[0].toolEvents !== undefined);

		const isDark = document.documentElement.classList.contains('dark');
		const textColor = isDark ? '#a1a1aa' : '#52525b';
		const gridColor = isDark ? '#50515c' : '#eaecf2';
		const faintGridColor = isDark ? 'rgba(255,255,255,0.046)' : 'rgba(0,0,0,0.038)';
		const axisPointerBg = isDark ? '#27272a' : '#ffffff';

		const startSessionsColor = SESSION_START_SERIES_COLOR;
		const toolEventsColor = '#8e81eadd';
		const errorEventsColor = '#ef4444dd';
		const totalEventsColor = toolEventsColor;

		const FUTURE_POINTS = 0;

		const _dates = data.map(item => item.date);
		const weekdayLabels = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
		const labels = data.map(item => {
			const date = new Date(item.date);
			const dayIndex = date.getDay();
			const dayNumber = date.getDate();
			return `${weekdayLabels[dayIndex] || ''} ${dayNumber}`;
		});

		const futureLabels = [];
		for (let i = 1; i <= FUTURE_POINTS; i++) {
			const futureDate = new Date(_dates.at(-1));
			futureDate.setDate(futureDate.getDate() + i);
			const dayIndex = futureDate.getDay();
			const dayNumber = futureDate.getDate();
			// Mostrar etiqueta només per als dilluns
			futureLabels.push(dayIndex === 1 ? `DL ${dayNumber}` : '');
		}
		const extendedLabels = [...labels, ...futureLabels];

		// -------------------------
		// Helpers (spline + densify)
		// -------------------------
		function naturalCubicSplineYs(y) {
			const n = y.length;
			if (n < 3) {return (x) => y[Math.round(Math.max(0, Math.min(n - 1, x)))];}

			const a = y.slice();
			const b = new Array(n - 1).fill(0);
			const d = new Array(n - 1).fill(0);

			const alpha = new Array(n).fill(0);
			for (let i = 1; i < n - 1; i++) {
				alpha[i] = 3 * (a[i + 1] - 2 * a[i] + a[i - 1]);
			}

			const l = new Array(n).fill(0);
			const mu = new Array(n).fill(0);
			const z = new Array(n).fill(0);
			const c = new Array(n).fill(0);

			l[0] = 1;
			for (let i = 1; i < n - 1; i++) {
				l[i] = 4 - mu[i - 1];
				mu[i] = 1 / l[i];
				z[i] = (alpha[i] - z[i - 1]) / l[i];
			}
			l[n - 1] = 1;

			for (let j = n - 2; j >= 0; j--) {
				c[j] = z[j] - mu[j] * c[j + 1];
				b[j] = (a[j + 1] - a[j]) - (2 * c[j] + c[j + 1]) / 3;
				d[j] = (c[j + 1] - c[j]) / 3;
			}

			return function evalSpline(x) {
				const i = Math.min(n - 2, Math.max(0, Math.floor(x)));
				const dx = x - i;
				return a[i] + b[i] * dx + c[i] * dx * dx + d[i] * dx * dx * dx;
			};
		}

		function densifyTrendY(yValues, samplesPerSegment = 25) {
			const f = naturalCubicSplineYs(yValues);
			const n = yValues.length;
			if (n === 0) {return [];}

			const out = [];
			for (let i = 0; i < n - 1; i++) {
				for (let s = 0; s < samplesPerSegment; s++) {
					const x = i + s / samplesPerSegment;
					out.push([x, Math.max(0, f(x))]);
				}
			}
			out.push([n - 1, Math.max(0, f(n - 1))]);
			return out;
		}

		function weightedMovingAverage(y, weights = [1, 2, 3, 2, 1]) {
			const half = Math.floor(weights.length / 2);
			return y.map((_, i) => {
				let acc = 0;
				let wAcc = 0;
				for (let k = -half; k <= half; k++) {
					const idx = i + k;
					if (idx >= 0 && idx < y.length) {
						const w = weights[k + half];
						acc += y[idx] * w;
						wAcc += w;
					}
				}
				return wAcc ? acc / wAcc : y[i];
			});
		}

		function smoothSeries(y, passes = 2, weights = [1, 2, 3, 2, 1]) {
			let out = y.slice();
			for (let p = 0; p < passes; p++) {
				out = weightedMovingAverage(out, weights);
			}
			return out;
		}

		function buildDenseTrendSeries(trendLineSource, fullLen, trendLine, samplesPerSegment = 100) {
			const yTrendRaw = [...trendLine.trendData, ...trendLine.extrapolatedData];

			// ⭐️ Important: if we trimmed trailing zeros for fitting, the trend array can end earlier
			// than the number of categories we still display (because we still show those zero days).
			// Extend the trend to the full displayed length so the line reaches the last label.
			const safeLast = yTrendRaw.length ? yTrendRaw.at(-1) : 0;
			const missing = Math.max(0, (fullLen || 0) - yTrendRaw.length);
			const yTrendFull = missing > 0 ? [...yTrendRaw, ...Array(missing).fill(safeLast)] : yTrendRaw;

			// ⭐️ Nou: suavitzat per evitar zig-zag amb petites variacions
			// - passes: 1..3 (2 és un bon punt dolç)
			// - weights: pots provar [1,2,3,4,3,2,1] per encara més suavitat
			const yTrend = smoothSeries(yTrendFull, 1, [1, 2, 1]);
			const dense = densifyTrendY(yTrend, samplesPerSegment);

			// Align slightly to the left so it feels centered on category ticks
			const CATEGORY_CENTER_SHIFT = -0.35;
			const TREND_FUTURE_OFFSET = 0.14; // shift the whole trend line slightly to the right (towards the future)
			return dense.map(([x, y]) => [x + CATEGORY_CENTER_SHIFT + TREND_FUTURE_OFFSET, y]);		}

		function compressYAroundMean(points, factor = 0.88) {
			if (!points?.length) {return points;}
			let sum = 0;
			for (const [, y] of points) {sum += y;}
			const mean = sum / points.length;
			return points.map(([x, y]) => [x, mean + (y - mean) * factor]);
		}

		function makeRightFadeGradient(opacityBase = 0.3, fadeStart = 0) {
			const o = Math.max(0, Math.min(1, opacityBase));
			const fs = Math.max(0, Math.min(1, fadeStart));
			return new echarts.graphic.LinearGradient(0, 1, 1, 0, [
				{offset: 0, color: `rgba(255, 183, 0, ${o})`},
				{offset: fs, color: `rgba(255, 105, 0, ${o})`},
				{offset: 1, color: 'rgba(255, 105, 0, 0)'}
			]);
		}

		// Badge micro-upsize
		const BADGE_FONT = 11; // abans 9.8
		const BADGE_PAD = [2, 6]; // abans [2,5]

		// Blur (hover) tuning
		const BAR_BLUR_OPACITY = 0.38;   // no tan bèstia
		const LABEL_BLUR_OPACITY = 0.35; // badges visibles
		const TREND_BLUR_OPACITY = 0.18; // trend no desapareix

		let series = [];
		let legendData = [];

		if (hasBreakdown) {
			const startSessionsData = data.map(item => {
				const value = Number(item.startSessionsWithoutEnd);
				return Number.isFinite(value) ? value : 0;
			});
			const toolEventsData = data.map(item => {
				const value = Number(item.toolEvents);
				return Number.isFinite(value) ? value : 0;
			});
			const errorEventsData = data.map(item => {
				const value = Number(item.errorEvents);
				return Number.isFinite(value) ? value : 0;
			});

			series = [
				{
					name: 'Tool Calls',
					type: 'bar',
					barWidth: 2,
					barGap: '2px',
					data: toolEventsData,
					z: 3,
					itemStyle: {
						color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
							{offset: 0, color: 'rgba(142, 129, 234, 0.16)'},
							{offset: 1, color: toolEventsColor}
						]),
						borderRadius: [4, 4, 0, 0]
					},
					label: {
						show: true,
						position: 'top',
						formatter: (params) => {
							const value = Number(params.value);
							if (!Number.isFinite(value)) {return '';}
							if (value === 0) {return '{zero| }';}
							return `{val|${value}}`;
						},
						rich: {
							val: {
								fontSize: BADGE_FONT,
								color: '#ffffff',
								backgroundColor: toolEventsColor,
								padding: BADGE_PAD,
								borderRadius: 999
							},
							zero: {
								fontSize: 1,
								lineHeight: 1,
								height: 1,
								color: 'transparent',
								backgroundColor: toolEventsColor,
								padding: [0, 3],
								borderRadius: 1
							}
						},
						distance: 1,
						offset: [0, -2]
					},
					emphasis: {
						focus: 'series',
						itemStyle: {opacity: 1}
					},
					blur: {
						itemStyle: {opacity: BAR_BLUR_OPACITY},
						label: {opacity: LABEL_BLUR_OPACITY}
					}
				},
				{
					name: 'New Sessions',
					type: 'bar',
					barWidth: 2,
					barGap: '2px',
					data: startSessionsData,
					z: 2,
					itemStyle: {
						color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
							{offset: 0, color: 'rgba(33, 149, 207, 0.16)'},
							{offset: 1, color: startSessionsColor}
						]),
						borderRadius: [4, 4, 0, 0]
					},
					label: {
						show: true,
						position: 'top',
						formatter: (params) => {
							const value = Number(params.value);
							if (!Number.isFinite(value)) {return '';}
							if (value === 0) {return '{zero| }';}
							return `{val|${value}}`;
						},
						rich: {
							val: {
								fontSize: BADGE_FONT,
								color: '#ffffff',
								backgroundColor: startSessionsColor,
								padding: BADGE_PAD,
								borderRadius: 999
							},
							zero: {
								fontSize: 1,
								lineHeight: 1,
								height: 1,
								color: 'transparent',
								backgroundColor: startSessionsColor,
								padding: [0, 3],
								borderRadius: 1
							}
						},
						distance: 1,
						offset: [-9, -2]
					},
					emphasis: {
						focus: 'series',
						itemStyle: {opacity: 1}
					},
					blur: {
						itemStyle: {opacity: BAR_BLUR_OPACITY},
						label: {opacity: LABEL_BLUR_OPACITY}
					}
				},
				{
					name: 'Errors',
					type: 'bar',
					barWidth: 2,
					barGap: '2px',
					data: errorEventsData,
					z: 1,
					itemStyle: {
						color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
							{offset: 0, color: 'rgba(239, 68, 68, 0.16)'},
							{offset: 1, color: errorEventsColor}
						]),
						borderRadius: [4, 4, 0, 0]
					},
					label: {
						show: true,
						position: 'top',
						formatter: (params) => {
							const value = Number(params.value);
							if (!Number.isFinite(value)) {return '';}
							if (value === 0) {return '{zero| }';}
							return `{val|${value}}`;
						},
						rich: {
							val: {
								fontSize: BADGE_FONT,
								color: '#ffffff',
								backgroundColor: errorEventsColor,
								padding: BADGE_PAD,
								borderRadius: 999
							},
							zero: {
								fontSize: 1,
								lineHeight: 1,
								height: 1,
								color: 'transparent',
								backgroundColor: errorEventsColor,
								padding: [0, 3],
								borderRadius: 1
							}
						},
						distance: 1,
						offset: [9, -2]
					},
					emphasis: {
						focus: 'series',
						itemStyle: {opacity: 1}
					},
					blur: {
						itemStyle: {opacity: BAR_BLUR_OPACITY},
						label: {opacity: LABEL_BLUR_OPACITY}
					}
				}
			];

			const trimmedToolEvents = trimTrailingZeros(toolEventsData);
			const trendLineSource = trimmedToolEvents.length >= 2 ? trimmedToolEvents : toolEventsData;
			// Use exponential smoothing for a more stable trend line when there are sparse days
			const trendLine = generateTrendLine(trendLineSource, FUTURE_POINTS, 'exponential');

			const denseTrendRaw = buildDenseTrendSeries(
				toolEventsData,
				extendedLabels.length,
				trendLine,
				30
			);

			const TREND_Y_COMPRESSION = 0.92;
			const denseTrend = compressYAroundMean(denseTrendRaw, TREND_Y_COMPRESSION);

			const BASE_OPACITY = 0.18;
			const FADE_START = 0.78;
			const trendLineGradient = new echarts.graphic.LinearGradient(0, 1, 1, 0, [
				{offset: 0, color: `rgba(142, 129, 234, ${BASE_OPACITY})`}, // toolEventsColor with opacity
				{offset: FADE_START, color: `rgba(142, 129, 234, ${BASE_OPACITY})`},
				{offset: 1, color: 'rgba(142, 129, 234, 0)'}
			]);

			series.push({
				name: 'Trend',
				type: 'line',
				xAxisIndex: 1,
				data: denseTrend,
				smooth: false,
				symbol: 'none',
				zlevel: 0,
				z: -1,
				lineStyle: {
					width: 1,
					type: 'solid',
					color: trendLineGradient,
					shadowColor: 'rgba(142, 129, 234, 0.35)', // toolEventsColor shadow
					shadowBlur: 8,
					shadowOffsetY: 4
				},
				emphasis: {
					focus: 'series',
					lineStyle: {width: 3, opacity: 0.9}
				},
				blur: {
					lineStyle: {opacity: TREND_BLUR_OPACITY}
				}
			});

			// Add trend line for Start Sessions (blue series)
			const trimmedStartSessions = trimTrailingZeros(startSessionsData);
			const startSessionsTrendLineSource = trimmedStartSessions.length >= 2 ? trimmedStartSessions : startSessionsData;
			const startSessionsTrendLine = generateTrendLine(startSessionsTrendLineSource, FUTURE_POINTS, 'exponential');

			const startSessionsDenseTrendRaw = buildDenseTrendSeries(
				startSessionsData,
				extendedLabels.length,
				startSessionsTrendLine,
				30
			);

			const startSessionsDenseTrendScaled = startSessionsDenseTrendRaw.map(([x, y]) => [x, y * 3]);

			const startSessionsDenseTrend = compressYAroundMean(startSessionsDenseTrendScaled, TREND_Y_COMPRESSION);

			const startSessionsBaseOpacity = 0.35;
			const startSessionsTrendLineGradient = new echarts.graphic.LinearGradient(0, 1, 1, 0, [
				{offset: 0, color: `rgba(33, 149, 207, ${startSessionsBaseOpacity})`},
				{offset: FADE_START, color: `rgba(33, 149, 207, ${startSessionsBaseOpacity})`},
				{offset: 1, color: 'rgba(33, 149, 207, 0)'}
			]);

			series.push({
				name: 'New Sessions Trend',
				type: 'line',
				xAxisIndex: 1,
				data: startSessionsDenseTrend,
				smooth: false,
				symbol: 'none',
				zlevel: 0,
				z: -2,
				lineStyle: {
					width: 1,
					type: 'solid',
					color: startSessionsTrendLineGradient,
					opacity: startSessionsBaseOpacity,
					shadowColor: 'rgba(33, 149, 207, 0.35)',
					shadowBlur: 8,
					shadowOffsetY: 4
				},
				emphasis: {
					focus: 'series',
					lineStyle: {width: 3, opacity: 0.9}
				},
				blur: {
					lineStyle: {opacity: TREND_BLUR_OPACITY}
				}
			});

			// Add trend line for Errors (red series)
			const trimmedErrors = trimTrailingZeros(errorEventsData);
			const errorsTrendLineSource = trimmedErrors.length >= 2 ? trimmedErrors : errorEventsData;
			const errorsTrendLine = generateTrendLine(errorsTrendLineSource, FUTURE_POINTS, 'exponential');

			const errorsDenseTrend = buildDenseTrendSeries(
				errorEventsData,
				extendedLabels.length,
				errorsTrendLine,
				30
			);

			// Triple the Y values for errors trend line visibility
			const errorsDenseTrendScaled = errorsDenseTrend.map(([x, y]) => {
				const scaled = (y || 0) * 3;
				return [x, Number.isFinite(scaled) ? scaled : 0];
			});
			const errorsDenseTrendCompressed = compressYAroundMean(errorsDenseTrendScaled, TREND_Y_COMPRESSION);

			const ERRORS_BASE_OPACITY = 0.36;
			const errorsTrendLineGradient = new echarts.graphic.LinearGradient(0, 1, 1, 0, [
				{offset: 0, color: `rgba(239, 68, 68, ${ERRORS_BASE_OPACITY})`}, // errorEventsColor with opacity
				{offset: 0.78, color: `rgba(239, 68, 68, ${ERRORS_BASE_OPACITY})`},
				{offset: 1, color: 'rgba(239, 68, 68, 0)'}
			]);

			series.push({
				name: 'Errors Trend',
				type: 'line',
				xAxisIndex: 1,
				data: errorsDenseTrendCompressed,
				smooth: false,
				symbol: 'none',
				zlevel: 0,
				z: -1,
				lineStyle: {
					width: 1,
					type: 'solid',
					color: errorsTrendLineGradient,
					opacity: ERRORS_BASE_OPACITY,
					shadowColor: 'rgba(239, 68, 68, 0.35)', // errorEventsColor shadow
					shadowBlur: 8,
					shadowOffsetY: 4
				},
				emphasis: {
					focus: 'series',
					lineStyle: {width: 3, opacity: 0.9}
				},
				blur: {
					lineStyle: {opacity: TREND_BLUR_OPACITY}
				}
			});

			legendData = [
				{name: 'New Sessions', icon: 'circle', itemStyle: {color: startSessionsColor}},
				{name: 'Tool Calls', icon: 'circle', itemStyle: {color: toolEventsColor}},
				{name: 'Errors', icon: 'circle', itemStyle: {color: errorEventsColor}}
			];
		} else {
			const totalEventsData = data.map(item => Number(item.count ?? item.total ?? 0));
			const totalEventsDataWithZeroes = totalEventsData.map(v => (Number.isFinite(Number(v)) ? Number(v) : 0));
			const trimmedTotalEvents = trimTrailingZeros(totalEventsDataWithZeroes);

			series = [
				{
					name: 'Events',
					type: 'bar',
					barWidth: 2,
					barGap: '2px',
					data: totalEventsDataWithZeroes,
					itemStyle: {
						color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
							{offset: 0, color: 'rgba(142, 129, 234, 0.16)'},
							{offset: 1, color: totalEventsColor}
						]),
						borderRadius: [4, 4, 0, 0]
					},
					label: {
						show: true,
						position: 'top',
						formatter: (params) => {
							const value = Number(params.value);
							if (!Number.isFinite(value)) {return '';}
							if (value === 0) {return '{zero| }';}
							return `{val|${value}}`;
						},
						rich: {
							val: {
								fontSize: BADGE_FONT,
								color: '#ffffff',
								backgroundColor: totalEventsColor,
								padding: BADGE_PAD,
								borderRadius: 999
							},
							zero: {
								fontSize: 1,
								lineHeight: 1,
								height: 1,
								color: 'transparent',
								backgroundColor: totalEventsColor,
								padding: [0, 3],
								borderRadius: 1
							}
						},
						distance: 1
					},
					emphasis: {
						focus: 'series',
						itemStyle: {opacity: 1}
					},
					blur: {
						itemStyle: {opacity: BAR_BLUR_OPACITY},
						label: {opacity: LABEL_BLUR_OPACITY}
					}
				}
			];

			const trendLineSource = trimmedTotalEvents.length >= 2 ? trimmedTotalEvents : totalEventsDataWithZeroes;
			// Use exponential smoothing for a more stable trend line when there are sparse days
			const trendLine = generateTrendLine(trendLineSource, FUTURE_POINTS, 'exponential');

			const denseTrendRaw = buildDenseTrendSeries(
				totalEventsDataWithZeroes,
				extendedLabels.length,
				trendLine,
				30
			);

			const TREND_Y_COMPRESSION = 0.88;
			const denseTrend = compressYAroundMean(denseTrendRaw, TREND_Y_COMPRESSION);

			const BASE_OPACITY = 0.18;
			const FADE_START = 0.78;
			const trendLineGradient = makeRightFadeGradient(BASE_OPACITY, FADE_START);

			series.push({
				name: 'Trend',
				type: 'line',
				xAxisIndex: 1,
				data: denseTrend,
				smooth: false,
				symbol: 'none',
				zlevel: 0,
				z: -1,
				lineStyle: {
					width: 1,
					type: 'solid',
					color: trendLineGradient,
					shadowColor: 'rgba(249, 115, 22, 0.35)',
					shadowBlur: 8,
					shadowOffsetY: 4
				},
				emphasis: {
					focus: 'series',
					lineStyle: {width: 1, opacity: 0.9}
				},
				blur: {
					lineStyle: {opacity: TREND_BLUR_OPACITY}
				}
			});

			legendData = [
				{name: 'Events', icon: 'circle', itemStyle: {color: totalEventsColor}}
			];
		}

		updateChartLegendOverlay(legendData);

		// Calculate label interval based on number of days to prevent overlapping
		let labelInterval = 0;
		if (days > 14) {
			labelInterval = Math.max(1, Math.floor(days / 10)); // Show ~10 labels max
		}

		const option = {
			textStyle: {
				fontFamily:
				'Manrope, \'Manrope\', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif'
			},
			animation: true,
			animationDuration: 350,

			// ⭐️ hover/blur transition més ràpida
			stateAnimation: {
				duration: 140
			},

			grid: {
				left: '3%',
				right: '0%',
				bottom: '14%',
				top: '5%',
				containLabel: false,
				width: 'auto',
				height: 'auto'
			},
			tooltip: {
				trigger: 'axis',
				backgroundColor: 'rgba(15, 23, 42, 0.86)',
				borderColor: 'rgba(148, 163, 184, 0.5)',
				borderWidth: 1,
				textStyle: {
					color: '#f1f5f9',
					fontFamily: 'Manrope',
					fontSize: 12
				},
				axisPointer: {
					type: 'line',
					lineStyle: {
						color: 'rgba(148, 163, 184, 0.5)',
						width: 1,
						opacity: 0
					},
					label: {show: false}
				},
				formatter: (params) => {
					if (!Array.isArray(params) || params.length === 0) {
						return '';
					}
					const filtered = params.filter((entry) => ![
						'Trend',
						'New Sessions Trend',
						'Errors Trend'
					].includes(entry.seriesName));
					if (filtered.length === 0) {
						return '';
					}
					const axisIndex = Number.isFinite(filtered[0]?.dataIndex) ? filtered[0].dataIndex : null;
					let axisLabel = filtered[0]?.axisValueLabel ?? filtered[0]?.axisValue ?? '';
					if (axisIndex !== null && _dates?.[axisIndex]) {
						const dateObj = new Date(_dates[axisIndex]);
						const weekdayFullLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
						const fullWeekday = weekdayFullLabels[dateObj.getDay()] || '';
						axisLabel = `${fullWeekday} ${dateObj.getDate()}`;
					}
					const seriesColors = {
						'Tool Calls': toolEventsColor,
						'New Sessions': startSessionsColor,
						'Errors': errorEventsColor,
						'Events': totalEventsColor
					};
					const rows = filtered.map((entry) => {
						const rawValue = Array.isArray(entry.value) ? entry.value[1] : entry.value;
						const value = Number.isFinite(rawValue) ? rawValue : (rawValue ?? '-');
						const color = seriesColors[entry.seriesName] || '#94a3b8';
						const marker = `<span style="display:inline-block;width:8px;height:8px;margin-right:6px;border-radius:50%;background:${color};opacity:1;vertical-align:middle;"></span>`;
						return `<div style="margin: 2px 0;">${marker}${entry.seriesName} <span style="float:right;margin-left:12px;font-weight:600;">${value}</span></div>`;
					}).join('');
					return `<div style="margin-bottom: 6px; font-weight: 600;">${axisLabel}</div>${rows}`;
				}
			},
			legend: {show: false, data: legendData},

			xAxis: [
				{
					type: 'category',
					data: extendedLabels,
					boundaryGap: ['5%', '10%'],
					axisLabel: {
						color: textColor,
						fontSize: 12,
						interval: labelInterval,
						margin: 18
					},
					axisLine: {show: false},
					axisTick: {show: false},
					splitLine: {show: false}
				},
				{
					type: 'value',
					min: -0.5,
					max: Math.max(-0.5, extendedLabels.length - 0.5 + 0.25),					show: false
				}
			],

			yAxis: {
				type: 'value',
				min: 0,
				axisLabel: {show: false},
				axisLine: {show: false},
				axisTick: {show: false},
				splitLine: {
					show: true,
					lineStyle: {color: faintGridColor, width: 1}
				}
			},

			series
		};

		chartInstance.setOption(option, true);
		try {
			if (typeof chartInstance.resize === 'function') {
				chartInstance.resize();
			}
		} catch (error) {
			console.warn('Error resizing chart after loading data:', error);
		}

		const onChartFinished = () => {
			chartInstance.off('finished', onChartFinished);

			if (isInitialChartLoad) {
				isInitialChartLoad = false;
				revealDashboardShell();
			}
		};

		chartInstance.on('finished', onChartFinished);
		try {
			if (typeof chartInstance.resize === 'function') {
				chartInstance.resize();
			}
		} catch (error) {
			console.warn('Error resizing chart after setting finished handler:', error);
		}
	} catch (error) {
		console.error('Error loading chart data:', error);

		// Check if it's a network error (Failed to fetch)
		const isNetworkError = error.message.includes('Failed to fetch') || error.name === 'TypeError';

		if (isNetworkError) {
			console.warn('Network error: Could not connect to API server. Chart will show empty state.');
			// For network errors, show empty chart instead of crashing
			if (chartInstance) {
				chartInstance.setOption({
					series: [{
						data: [],
						type: 'line',
						smooth: true,
						symbol: 'none',
						lineStyle: {color: '#94a3b8'},
						areaStyle: {color: 'rgba(148, 163, 184, 0.1)'}
					}]
				}, true);
			}
		}

		if (isInitialChartLoad) {
			isInitialChartLoad = false;
			revealDashboardShell();
		}
	}
}

// Expose functions used by inline handlers / shared markup
// Note: showUserMenu and handleLogout are now exposed by user-menu.js
// Note: openSettingsModal is now exposed by settings-modal.js
Object.assign(window, {
	clearLocalData,
	toggleTheme,
	refreshDashboard
});

// Chart will be loaded after authentication check

// Pause/resume functions for soft navigation
function pauseDashboardPage() {
	timerRegistry.clearAll();
	if (chartResizeObserver) {
		chartResizeObserver.disconnect();
		chartResizeObserver = null;
	}
	// Save chart option before disposing to restore it later
	if (chart && typeof chart.getOption === 'function') {
		try {
			savedChartOption = chart.getOption();
		} catch (error) {
			console.warn('Failed to save chart option:', error);
			savedChartOption = null;
		}
	}
	// Dispose chart when leaving page to avoid stale references
	if (chart) {
		try {
			if (typeof chart.dispose === 'function') {
				chart.dispose();
			}
		} catch (error) {
			console.warn('Error disposing chart:', error);
		}
		if (chartUnbindResize) {
			try {
				chartUnbindResize();
			} catch (error) {
				console.warn('Error unbinding chart resize handler:', error);
			}
			chartUnbindResize = null;
		}
		if (chartResizeObserver) {
			try {
				chartResizeObserver.disconnect();
			} catch (error) {
				console.warn('Error disconnecting chart resize observer:', error);
			}
			chartResizeObserver = null;
		}
		chart = null;
	}
}

async function resumeDashboardPage() {
	// Restart server stats interval if it was running
	if (!timerRegistry.has('dashboard.serverStatsUpdate') && serverStatsLastFetchTime) {
		startServerStatsInterval();
	}
	// Restore chart from saved option if available
	if (savedChartOption && chart === null) {
		const chartEl = document.getElementById('eventsChart');
		if (chartEl) {
			// Wait for ECharts to load if not available yet
			await awaitECharts();

			// Initialize new chart instance
			chart = safeInit(chartEl);
			if (chart) {
				// Bind resize handler with cleanup function
				chartUnbindResize = bindWindowResize(chart, {chartName: 'events per day'});
				attachChartResizeObserver(chartEl);
				// Restore the saved option (notMerge: true to replace entirely)
				chart.setOption(savedChartOption, true);
				chart.resize();
				// Clear saved option after restoration
				savedChartOption = null;
			}

			// Always refresh top users and teams data when returning to dashboard
			try {
				await loadTopUsersToday();
			} catch (error) {
				console.warn('Failed to refresh top users data on resume:', error);
			}
			try {
				await loadTopTeamsToday();
			} catch (error) {
				console.warn('Failed to refresh top teams data on resume:', error);
			}
		}
	} else if (chart === null) {
		// No saved option, load chart data normally
		await loadChartData();
	}
}

// Expose pause/resume hooks
window.pauseDashboardPage = pauseDashboardPage;
window.resumeDashboardPage = resumeDashboardPage;
window.refreshDashboard = refreshDashboard;

// Listen for soft navigation events
window.addEventListener('softNav:pagePausing', (event) => {
	if (event?.detail?.path === '/') {
		pauseDashboardPage();
	}
});

// Rehydrate dashboard when returning via soft navigation
window.addEventListener('softNav:pageMounted', async (event) => {
	if (event?.detail?.path === '/') {
		const fromCache = event?.detail?.fromCache === true;
		if (fromCache) {
			// Page was restored from cache - resume intervals and reinitialize chart
			await resumeDashboardPage();
		} else {
			// New page load - full initialization
			initializeDashboardPage({resetState: true});
		}
	}
});

// Global ESC key handler for modals (except settings modal)
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape') {
		// Close confirm dialog if open
		const confirmModal = document.querySelector('.confirm-dialog-backdrop');
		if (confirmModal) {
			confirmModal.remove();

		}
	}
});
