// @ts-nocheck
// Tool usage chart renderer
import {timerRegistry} from './utils/timerRegistry.js';
import {awaitECharts, safeInit, bindWindowResize, getChartTheme} from './echarts-core.js';

const TOOL_USAGE_MAX_TOOLS = 6;
const TOOL_USAGE_DEFAULT_DAYS = 30;
let toolUsageChartInstance = null;
let toolUsageUnbindResize = null; // Store unbind function to clean up properly
let toolUsageChartInitialized = false;
let savedToolUsageOption = null; // Store chart option when pausing for cache restoration

// Global cache is now handled by global-cache.js

export function cleanupToolUsageChart() {
	// Save chart option before disposing to restore it later
	if (toolUsageChartInstance && typeof toolUsageChartInstance.getOption === 'function') {
		try {
			savedToolUsageOption = toolUsageChartInstance.getOption();
		} catch (error) {
			console.warn('Failed to save tool usage chart option:', error);
			savedToolUsageOption = null;
		}
	}

	if (toolUsageChartInstance) {
		try {
			toolUsageChartInstance.dispose();
		} catch (error) {
			console.warn('Error disposing tool usage chart:', error);
		}
		toolUsageChartInstance = null;
	}
	if (toolUsageUnbindResize) {
		try {
			toolUsageUnbindResize();
		} catch (error) {
			console.warn('Error unbinding tool usage resize handler:', error);
		}
		toolUsageUnbindResize = null;
	}
	toolUsageChartInitialized = false;
}

function getToolUsageChartTheme() {
	const theme = getChartTheme();
	return {
		text: theme.text,
		muted: theme.muted,
		grid: theme.grid,
		axis: theme.axis,
		success: theme.success,
		error: theme.error,
		bg: theme.bg
	};
}

export async function mountToolUsageChart() {
	if (toolUsageChartInstance) {
		return toolUsageChartInstance;
	}
	const el = document.getElementById('toolUsageChart');
	if (!el) {return null;}

	// Wait for ECharts if not loaded
	await awaitECharts();

	// Safe initialization with cleanup
	toolUsageChartInstance = safeInit(el);
	if (!toolUsageChartInstance) {
		return null;
	}

	// Bind resize handler with cleanup function
	toolUsageUnbindResize = bindWindowResize(toolUsageChartInstance, {chartName: 'tool usage'});
	
	return toolUsageChartInstance;
}

function renderToolUsageEmpty(message = 'No tool usage recorded yet.') {
	const chartEl = document.getElementById('toolUsageChart');
	if (chartEl) {
		chartEl.innerHTML = `<div class="tool-usage-empty">${message}</div>`;
	}
}

function setToolUsageLoading(isLoading) {
	const card = document.getElementById('toolUsageChart');
	if (!card) {return;}
	card.setAttribute('data-loading', isLoading ? 'true' : 'false');
}

export function renderToolUsageChart(tools, _days) {
	// Clean up any existing chart first
	cleanupToolUsageChart();

	// Small delay to ensure cleanup is complete
	timerRegistry.setTimeout('toolUsageChart.render', async () => {
		const chart = await mountToolUsageChart();
		if (!chart) {return;}

		if (tools.length === 0) {
			renderToolUsageEmpty('No tool usage recorded yet.');
			return;
		}

		const theme = getToolUsageChartTheme();

		// Color palette based on brand strategy (softened for chart use)
		const brandColors = [
			'#7DD3C0', // Teal/Turquoise (Dark Blue - softened)
			'#FFD93D', // Gold/Yellow (softened)
			'#FF6B6B', // Red (softened)
			'#9B7EDE', // Purple (softened)
			'#FFA07A', // Orange (softened)
			'#95A5A6', // Medium Gray
			'#6C7A89', // Dark Gray
			'#BDC3C7'  // Light Gray
		];

		// Prepare data for pie chart - combine success and errors for each tool
		const pieData = tools.map((t, index) => {
			const total = (t.successful || 0) + (t.errors || 0);
			const success = t.successful || 0;
			const errors = t.errors || 0;
			const name = t.tool || 'Unknown';

			return {
				name: name,
				value: total,
				itemStyle: {
					color: brandColors[index % brandColors.length]
				},
				label: {
					formatter: `{b}\n{success|${success}} {error|${errors}}`,
					fontFamily: 'Manrope',
					rich: {
						success: {color: '#2195cf', fontWeight: 600},
						error: {color: theme.error, fontWeight: 600}
					}
				}
			};
		}).filter(item => item.value > 0); // Only show tools with usage

		const option = {
			backgroundColor: theme.bg,
			textStyle: {
				fontFamily: 'Manrope'
			},
			tooltip: {
				trigger: 'item',
				formatter: '{a} <br/>{b}: {c} ({d}%)',
				backgroundColor: theme.bg,
				borderColor: theme.axis,
				textStyle: {color: theme.text, fontFamily: 'Manrope'}
			},
			series: [
				{
					name: 'Tool Usage',
					type: 'pie',
					radius: '50%',
					center: ['50%', '50%'],
					data: pieData,
					label: {
						show: true,
						position: 'outside',
						formatter: '{b}\n{d}%',
						fontSize: 11,
						fontFamily: 'Manrope',
						overflow: 'truncate'
					},
					labelLine: {
						show: true,
						length: 20,
						length2: 10,
						smooth: true
					},
					emphasis: {
						label: {
							show: true,
							fontSize: 14,
							fontWeight: 'bold',
							fontFamily: 'Manrope'
						},
						labelLine: {
							show: true
						}
					},
					itemStyle: {
						borderRadius: 4,
						borderColor: theme.bg,
						borderWidth: 2
					}
				}
			]
		};

		chart.setOption(option, true);
		try {
			if (typeof chart.resize === 'function') {
				chart.resize();
			}
		} catch (error) {
			console.warn('Error resizing tool usage chart:', error);
		}
		toolUsageChartInitialized = true;
	}, 10);
}

export function refreshToolUsageTheme() {
	if (!toolUsageChartInstance || !toolUsageChartInitialized) {
		return;
	}
	// Re-render the chart with updated theme
	cleanupToolUsageChart();
	loadToolUsageChart();
}

async function loadToolUsageChart(days = TOOL_USAGE_DEFAULT_DAYS) {
	// Check if we have valid cached data for the same days parameter
	const cacheKey = `toolUsageStats_${days}`;
	const cachedData = window.getCachedData(cacheKey);
	if (cachedData) {
		// Use cached data
		renderToolUsageChart(cachedData, days);
		return;
	}

	// Clean up any existing chart first
	cleanupToolUsageChart();

	// Small delay to ensure cleanup is complete
	await new Promise(resolve => {
		timerRegistry.setTimeout('toolUsageChart.load', resolve, 10);
	});

	const chart = await mountToolUsageChart();
	if (!chart) {return;}

	setToolUsageLoading(true);

	try {
		const response = await fetch(`/api/tool-usage-stats?days=${days}`, {credentials: 'include'});
		if (response.status === 401) {
			window.location.href = '/login';
			return;
		}
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const payload = await response.json();
		const tools = Array.isArray(payload?.tools) ? payload.tools.slice(0, TOOL_USAGE_MAX_TOOLS) : [];

		// Cache the data
		const cacheKey = `toolUsageStats_${days}`;
		window.updateCache(cacheKey, tools);

		// Render using the shared function
		renderToolUsageChart(tools, days);
	} catch (error) {
		console.error('Error fetching tool usage stats:', error);
		renderToolUsageEmpty('Unable to load tool usage right now.');
	} finally {
		setToolUsageLoading(false);
	}
}

// Kick off once the dashboard loads
window.addEventListener('DOMContentLoaded', async () => {
	// Wait for echarts to be ready
	await awaitECharts();
	loadToolUsageChart();
});

// Also listen for soft navigation back to dashboard
window.addEventListener('softNav:pageMounted', async (event) => {
	if (event.detail.path === '/') {
		const fromCache = event?.detail?.fromCache === true;

		if (fromCache && savedToolUsageOption && toolUsageChartInstance === null) {
			// Page was restored from cache - restore chart from saved option
			const chartEl = document.getElementById('toolUsageChart');
			if (chartEl) {
				await awaitECharts();
				toolUsageChartInstance = safeInit(chartEl);
				if (toolUsageChartInstance) {
					toolUsageUnbindResize = bindWindowResize(toolUsageChartInstance, {chartName: 'tool usage'});
					// Restore the saved option
					toolUsageChartInstance.setOption(savedToolUsageOption, true);
					toolUsageChartInstance.resize();
					toolUsageChartInitialized = true;
					// Clear saved option after restoration
					savedToolUsageOption = null;
				}
			}
		} else if (!fromCache || toolUsageChartInstance === null) {
			// New page load or no saved option - load chart data normally
			await awaitECharts();
			loadToolUsageChart();
		}
	}
});

// Listen for soft navigation pausing to cleanup
window.addEventListener('softNav:pagePausing', (event) => {
	if (event.detail.path === '/') {
		cleanupToolUsageChart();
	}
});

// Handle theme toggles (class on html)
const observer = new MutationObserver((mutations) => {
	if (!toolUsageChartInitialized || !toolUsageChartInstance) {return;}
	for (const mutation of mutations) {
		if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
			refreshToolUsageTheme();
			break;
		}
	}
});
observer.observe(document.documentElement, {attributes: true});
