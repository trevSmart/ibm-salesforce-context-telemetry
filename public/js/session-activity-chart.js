// @ts-nocheck
// Session Activity Chart - Timeline chart for event log page
import {awaitECharts, safeInit, bindWindowResize} from './echarts-core.js';
import {timerRegistry} from './utils/timerRegistry.js';

// Chart configuration
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

// Chart state
let sessionActivityChart = null;
let sessionActivityUnbindResize = null;
let lastSessionActivityEvents = [];
let selectedActivityDate = null;

// Helper to escape HTML
function escapeHtml(unsafe) {
	return String(unsafe)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

// === Date/Time Formatting Helpers ===

function padNumber(value) {
	return String(value).padStart(2, '0');
}

export function formatChartTimeLabel(dateObj) {
	if (!(dateObj instanceof Date)) {
		return '';
	}
	return `${padNumber(dateObj.getHours())}:${padNumber(dateObj.getMinutes())}`;
}

export function formatHumanDate(dateObj) {
	if (!(dateObj instanceof Date)) {
		return '';
	}
	const day = padNumber(dateObj.getDate());
	const month = padNumber(dateObj.getMonth() + 1);
	const year = dateObj.getFullYear();
	return `${day}/${month}/${year}`;
}

export function getRelativeDateLabel(dateObj) {
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

// === Color Helpers ===

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

// === Series Building Helpers ===

function getExtendedWindow(referenceDate, minEventTime, maxEventTime) {
	// Start with office hours as base
	const officeStart = new Date(referenceDate);
	officeStart.setHours(OFFICE_START.hour, OFFICE_START.minute, 0, 0);
	const officeEnd = new Date(referenceDate);
	officeEnd.setHours(OFFICE_END.hour, OFFICE_END.minute, 0, 0);

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
		return [ts, count];
	});

	const maxBucketCount = buckets.length ? Math.max(...buckets) : 0;

	return {seriesData, windowStart, windowEnd, referenceDate, officeStart, officeEnd, maxBucketCount};
}

function buildMultiSessionActivitySeries(events, useCurrentDay = false, customDate = null, sessionDisplayMap = new Map()) {
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

function createSingleSessionSeriesOption(seriesData, warmOffset) {
	return {
		name: 'Events',
		type: 'line',
		smooth: 0.55,
		smoothMonotone: 'x',
		showSymbol: false,
		connectNulls: true,
		lineStyle: {width: 3, color: hexToRgba('#53cf98', 0.5)},
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

function createMultiSessionSeriesOption(sessionId, seriesData, color, sessionDisplayMap = new Map()) {
	const startColor = hexToRgba(color, 0.35);
	const endColor = hexToRgba(color, 0.05);
	return {
		name: formatSessionLabel(sessionId, sessionDisplayMap),
		type: 'line',
		smooth: 0.65,
		smoothMonotone: 'x',
		showSymbol: false,
		connectNulls: true,
		lineStyle: {width: 2.5, color: hexToRgba(color, 0.5)},
		areaStyle: {
			color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
				{offset: 0, color: startColor},
				{offset: 1, color: endColor}
			])
		},
		data: seriesData
	};
}

function formatSessionLabel(sessionId, sessionDisplayMap = new Map()) {
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

// === Legend Rendering ===

export function renderSessionActivityLegend(seriesEntries, isAllSessionsView = false) {
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
		// Hide legend button
		legendWrapper.classList.add('hidden');
	}
}

// === Date Navigation ===

export function navigateToPreviousDay(onNavigate) {
	if (!lastSessionActivityEvents || lastSessionActivityEvents.length === 0) {
		return;
	}

	const currentDate = selectedActivityDate || new Date();
	const previousDate = new Date(currentDate);
	previousDate.setDate(previousDate.getDate() - 1);

	selectedActivityDate = previousDate;
	if (typeof onNavigate === 'function') {
		onNavigate(selectedActivityDate);
	}
}

export function navigateToNextDay(onNavigate) {
	if (!lastSessionActivityEvents || lastSessionActivityEvents.length === 0) {
		return;
	}

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
	if (typeof onNavigate === 'function') {
		onNavigate(selectedActivityDate);
	}
}

export function updateDateNavigationButtons(referenceDate) {
	const prevBtn = document.getElementById('prevDayBtn');
	const nextBtn = document.getElementById('nextDayBtn');

	if (!prevBtn || !nextBtn) {return;}

	// Disable next button if we're at today
	const today = new Date();
	today.setHours(23, 59, 59, 999);
	const refDate = new Date(referenceDate);
	refDate.setHours(23, 59, 59, 999);

	nextBtn.disabled = refDate >= today;
	prevBtn.disabled = false;
}

export function setSelectedActivityDate(date) {
	selectedActivityDate = date;
}

export function getSelectedActivityDate() {
	return selectedActivityDate;
}

// === Chart Visibility ===

export function hideChart() {
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

export function showChart() {
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
		const chartEl = document.getElementById('sessionActivityChart');
		if (chartEl) {
			sessionActivityChart.resize();
		}
	}
}

// === Core Chart Functions ===

export async function mountSessionActivityChart() {
	if (sessionActivityChart) {
		return sessionActivityChart;
	}
	const chartEl = document.getElementById('sessionActivityChart');
	if (!chartEl) {
		return null;
	}

	// Wait for ECharts to load
	await awaitECharts();

	// Safe initialization
	sessionActivityChart = safeInit(chartEl);
	if (!sessionActivityChart) {
		return null;
	}

	// Bind resize handler
	sessionActivityUnbindResize = bindWindowResize(sessionActivityChart, {chartName: 'session activity'});

	return sessionActivityChart;
}

export async function renderSessionActivityChart(events, options = {}) {
	const sessionDisplayMap = options.sessionDisplayMap || new Map();
	const selectedSession = options.sessionId || 'all';
	
	if (!Array.isArray(events) || events.length === 0) {
		hideChart();
		return;
	}

	const chartInstance = await mountSessionActivityChart();
	if (!chartInstance) {
		return;
	}

	lastSessionActivityEvents = events.slice();
	const targetSession = selectedSession;
	const uniqueSessions = Array.from(new Set(events.map(evt => evt.session_id || 'Unknown session')));
	const isAllSessionsView = targetSession === 'all' && uniqueSessions.length > 0;

	// Use activityDate from options if provided
	const overrideDate = options.activityDate ? new Date(options.activityDate) : null;

	// Enable smooth transitions when hovering
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
		const useCurrentDay = false;
		let dateToUse = overrideDate || selectedActivityDate;
		if (!dateToUse) {
			dateToUse = new Date();
		}
		const multiSeries = buildMultiSessionActivitySeries(events, useCurrentDay, dateToUse, sessionDisplayMap);
		windowStart = multiSeries.windowStart;
		windowEnd = multiSeries.windowEnd;
		referenceDate = multiSeries.referenceDate;
		officeStart = multiSeries.officeStart;
		officeEnd = multiSeries.officeEnd;
		maxBucketCount = multiSeries.maxBucketCount;
		multiSeriesEntries = multiSeries.seriesList;
	} else {
		const useCurrentDay = true;
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
			return createMultiSessionSeriesOption(entry.sessionId, entry.seriesData, color, sessionDisplayMap);
		});
	} else {
		chartSeries = [createSingleSessionSeriesOption(seriesData, warmOffset)];
	}

	// Configure animation
	const animationConfig = {
		animation: true,
		animationDuration: enableTransition ? 200 : 200,
		animationEasing: 'cubicOut'
	};

	let finishedHandled = false;

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
		timerRegistry.clearTimeout('sessionActivityChart.renderFallback');
		chartInstance.off('finished', onChartFinished);
		ensureChartVisible();
		showChart();

		// Call the callback if provided
		if (options.onRenderComplete && typeof options.onRenderComplete === 'function') {
			options.onRenderComplete();
		}

		// Dispatch event for external listeners
		const event = new CustomEvent('chartRenderComplete', {
			detail: {
				sessionId: targetSession,
				eventCount: totalEvents,
				timestamp: Date.now()
			}
		});
		window.dispatchEvent(event);
	};

	const onChartFinished = () => finalizeChartRender(false);

	chartInstance.off('finished', onChartFinished);
	chartInstance.on('finished', onChartFinished);

	// Fallback timeout
	timerRegistry.setTimeout('sessionActivityChart.renderFallback', () => finalizeChartRender(true), 800);

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
					let value = param.value;
					if (Array.isArray(value) && value.length >= 2) {
						value = value[1];
					}
					return value !== null && value !== undefined && value !== 0;
				});
				if (filteredParams.length === 0) {
					return '';
				}
				let result = '';
				if (filteredParams.length > 0 && filteredParams[0].axisValue) {
					const date = new Date(filteredParams[0].axisValue);
					result += `<div style="margin-bottom: 4px; font-weight: 500;">${formatHumanDate(date)} ${formatChartTimeLabel(date)}</div>`;
				}
				filteredParams.forEach(param => {
					let value = param.value;
					if (Array.isArray(value) && value.length >= 2) {
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
	}, !enableTransition);

	chartInstance.resize();

	// Filter legend to only show series with data during the displayed day
	let legendEntries = null;
	if (isAllSessionsView) {
		const dayStart = new Date(referenceDate);
		dayStart.setHours(0, 0, 0, 0);
		const dayEnd = new Date(referenceDate);
		dayEnd.setHours(23, 59, 59, 999);

		const filteredSeries = chartSeries.filter(series => {
			if (!series.data || !Array.isArray(series.data)) {
				return false;
			}
			return series.data.some(point => {
				if (!Array.isArray(point) || point.length < 2) {
					return false;
				}
				const timestamp = point[0];
				const value = point[1];
				return value > 0 && timestamp >= dayStart.getTime() && timestamp <= dayEnd.getTime();
			});
		});

		legendEntries = filteredSeries.map(series => ({
			name: series.name,
			color: series.lineStyle?.color || '#53cf98'
		}));

		if (legendEntries.length === 0 && chartSeries.length > 0) {
			legendEntries = chartSeries.map(series => ({
				name: series.name,
				color: series.lineStyle?.color || '#53cf98'
			}));
		}
	} else {
		if (chartSeries.length > 0) {
			const series = chartSeries[0];
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

export function cleanupSessionActivityChart() {
	if (sessionActivityChart) {
		try {
			sessionActivityChart.dispose();
		} catch (error) {
			console.warn('Error disposing session activity chart:', error);
		}
		sessionActivityChart = null;
	}
	if (sessionActivityUnbindResize) {
		try {
			sessionActivityUnbindResize();
		} catch (error) {
			console.warn('Error unbinding session activity resize handler:', error);
		}
		sessionActivityUnbindResize = null;
	}
	lastSessionActivityEvents = [];
	selectedActivityDate = null;
}

export function refreshTheme() {
	if (!sessionActivityChart || lastSessionActivityEvents.length === 0) {
		return;
	}
	// Re-render with current events to apply new theme
	renderSessionActivityChart(lastSessionActivityEvents, {
		sessionId: 'all' // Default to all sessions for theme refresh
	});
}
