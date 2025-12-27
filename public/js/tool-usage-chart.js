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
		bg: 'transparent'
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

function renderToolUsageChart(tools, _days) {
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
