// @ts-nocheck
// Tool usage chart renderer

const TOOL_USAGE_MAX_TOOLS = 6;
const TOOL_USAGE_DEFAULT_DAYS = 30;
let toolUsageChartInstance = null;
let toolUsageResizeHandler = null; // Store resize handler to clean up properly
let toolUsageChartInitialized = false;

// Global cache is now handled by global-cache.js

function cleanupToolUsageChart() {
	if (toolUsageChartInstance) {
		try {
			toolUsageChartInstance.dispose();
		} catch (error) {
			console.warn('Error disposing tool usage chart:', error);
		}
		toolUsageChartInstance = null;
	}
	if (toolUsageResizeHandler) {
		try {
			window.removeEventListener('resize', toolUsageResizeHandler);
		} catch (error) {
			console.warn('Error removing tool usage resize handler:', error);
		}
		toolUsageResizeHandler = null;
	}
	toolUsageChartInitialized = false;
}

function getToolUsageChartTheme() {
	const isDark = document.documentElement.classList.contains('dark');
	return {
		text: isDark ? '#e4e4e7' : '#18181b',
		muted: isDark ? '#a1a1aa' : '#6b7280',
		grid: isDark ? '#2f3340' : '#e5e7eb',
		axis: isDark ? '#52525b' : '#d1d5db',
		success: '#14becb',
		error: '#dc2626',
		bg: isDark ? '#111827' : '#ffffff'
	};
}

function initToolUsageChart() {
	if (toolUsageChartInstance) {
		return toolUsageChartInstance;
	}
	const el = document.getElementById('toolUsageChart');
	if (!el) {return null;}

	if (typeof echarts === 'undefined') {
		window.addEventListener('echartsLoaded', () => {
			initToolUsageChart();
		}, {once: true});
		return null;
	}

	// Clear any existing content and dispose any existing chart on this element
	el.innerHTML = '';
	try {
		// Try to dispose any existing chart on this element
		if (typeof echarts.getInstanceByDom === 'function') {
			const existingChart = echarts.getInstanceByDom(el);
			if (existingChart && existingChart !== toolUsageChartInstance) {
				existingChart.dispose();
			}
		}
	} catch (error) {
		console.warn('Error disposing existing chart on tool usage element:', error);
	}

	try {
		toolUsageChartInstance = echarts.init(el);
	toolUsageResizeHandler = () => {
		try {
			if (toolUsageChartInstance && typeof toolUsageChartInstance.resize === 'function') {
				toolUsageChartInstance.resize();
			}
		} catch (error) {
			console.warn('Error resizing tool usage chart:', error);
			// If resize fails, remove the handler to prevent further errors
			try {
				window.removeEventListener('resize', toolUsageResizeHandler);
				toolUsageResizeHandler = null;
			} catch (removeError) {
				console.warn('Error removing tool usage resize handler:', removeError);
			}
		}
	};
		window.addEventListener('resize', toolUsageResizeHandler);
		return toolUsageChartInstance;
	} catch (error) {
		console.error('Error initializing tool usage chart:', error);
		// Clear the element on initialization failure
		el.innerHTML = '';
		return null;
	}
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

function renderToolUsageChart(tools, days) {
	// Clean up any existing chart first
	cleanupToolUsageChart();

	// Small delay to ensure cleanup is complete
	setTimeout(() => {
		const chart = initToolUsageChart();
		if (!chart) {return;}

		if (tools.length === 0) {
			renderToolUsageEmpty('No tool usage recorded yet.');
			return;
		}

		const theme = getToolUsageChartTheme();
		const names = tools.map(t => t.tool || 'Unknown');
		const successData = tools.map(t => t.successful || 0);
		const errorData = tools.map(t => t.errors || 0);

		const option = {
			backgroundColor: theme.bg,
			textStyle: {
				fontFamily:
					'Manrope, \'Manrope\', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif'
			},
			tooltip: {
				trigger: 'axis',
				axisPointer: {type: 'shadow'},
				backgroundColor: theme.tooltipBg,
				borderColor: theme.tooltipBorder,
				textStyle: {color: theme.tooltipText}
			},
			legend: {
				data: ['Success', 'Errors'],
				textStyle: {color: theme.text},
				top: 10
			},
			grid: {
				left: '3%',
				right: '4%',
				bottom: '3%',
				containLabel: true
			},
			xAxis: {
				type: 'category',
				data: names,
				axisLabel: {
					color: theme.text,
					rotate: 45,
					interval: 0
				},
				axisLine: {lineStyle: {color: theme.axis}},
				axisTick: {lineStyle: {color: theme.axis}}
			},
			yAxis: {
				type: 'value',
				axisLabel: {color: theme.text},
				axisLine: {lineStyle: {color: theme.axis}},
				axisTick: {lineStyle: {color: theme.axis}},
				splitLine: {lineStyle: {color: theme.grid}}
			},
			series: [
				{
					name: 'Success',
					type: 'bar',
					stack: 'total',
					label: {show: false},
					itemStyle: {color: theme.success, borderRadius: [0, 0, 0, 0]},
					data: successData
				},
				{
					name: 'Errors',
					type: 'bar',
					stack: 'total',
					label: {
						show: true,
						position: 'right',
						distance: 8,
						formatter: (params) => {
							const idx = params.dataIndex;
							return `{success|${successData[idx]}}/{error|${errorData[idx]}}`;
						},
						rich: {
							success: {color: theme.success, fontWeight: 600},
							error: {color: theme.error, fontWeight: 600}
						}
					},
					itemStyle: {color: theme.error, borderRadius: [0, 10, 10, 0]},
					data: errorData
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
	await new Promise(resolve => setTimeout(resolve, 10));

	const chart = initToolUsageChart();
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
window.addEventListener('DOMContentLoaded', () => {
	// Wait for echarts to be ready
	if (typeof echarts === 'undefined') {
		window.addEventListener('echartsLoaded', () => loadToolUsageChart(), {once: true});
	} else {
		loadToolUsageChart();
	}
});

// Also listen for soft navigation back to dashboard
window.addEventListener('softNav:pageMounted', (event) => {
	if (event.detail.path === '/') {
		// Clean up existing chart and reload
		cleanupToolUsageChart();
		// Wait for echarts to be ready
		if (typeof echarts === 'undefined') {
			window.addEventListener('echartsLoaded', () => loadToolUsageChart(), {once: true});
		} else {
			loadToolUsageChart();
		}
	}
});

// Handle theme toggles (class on html)
const observer = new MutationObserver((mutations) => {
	if (!toolUsageChartInitialized || !toolUsageChartInstance) {return;}
	for (const mutation of mutations) {
		if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
			cleanupToolUsageChart();
			loadToolUsageChart();
			break;
		}
	}
});
observer.observe(document.documentElement, {attributes: true});
