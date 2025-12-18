// @ts-nocheck
// Tool usage chart renderer

const TOOL_USAGE_MAX_TOOLS = 6;
const TOOL_USAGE_DEFAULT_DAYS = 30;
let toolUsageChartInstance = null;
let toolUsageChartInitialized = false;

function getToolUsageChartTheme() {
	const isDark = document.documentElement.classList.contains('dark');
	return {
		text: isDark ? '#e4e4e7' : '#18181b',
		muted: isDark ? '#a1a1aa' : '#6b7280',
		grid: isDark ? '#2f3340' : '#e5e7eb',
		axis: isDark ? '#52525b' : '#d1d5db',
		success: '#0ea5e9',
		error: '#ef4444',
		bg: isDark ? '#111827' : '#ffffff'
	};
}

function initToolUsageChart() {
	if (toolUsageChartInstance) {
		return toolUsageChartInstance;
	}
	const el = document.getElementById('toolUsageChart');
	if (!el) return null;

	if (typeof echarts === 'undefined') {
		window.addEventListener('echartsLoaded', () => {
			initToolUsageChart();
		}, { once: true });
		return null;
	}

	toolUsageChartInstance = echarts.init(el);
	window.addEventListener('resize', () => toolUsageChartInstance?.resize());
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
	if (!card) return;
	card.setAttribute('data-loading', isLoading ? 'true' : 'false');
}

async function loadToolUsageChart(days = TOOL_USAGE_DEFAULT_DAYS) {
	const chart = initToolUsageChart();
	if (!chart) return;

	setToolUsageLoading(true);

	try {
		const response = await fetch(`/api/tool-usage-stats?days=${days}`, { credentials: 'include' });
		if (response.status === 401) {
			window.location.href = '/login';
			return;
		}
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const payload = await response.json();
		const tools = Array.isArray(payload?.tools) ? payload.tools.slice(0, TOOL_USAGE_MAX_TOOLS) : [];

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
			tooltip: {
				trigger: 'axis',
				axisPointer: { type: 'shadow' }
			},
			legend: {
				data: ['Successful', 'Errors'],
				textStyle: { color: theme.text }
			},
			grid: {
				left: '3%',
				right: '4%',
				bottom: '6%',
				containLabel: true
			},
			xAxis: {
				type: 'value',
				minInterval: 1,
				axisLabel: { color: theme.muted },
				splitLine: {
					show: true,
					lineStyle: { color: theme.grid }
				}
			},
			yAxis: {
				type: 'category',
				data: names,
				axisTick: { alignWithLabel: true },
				axisLabel: { color: theme.text }
			},
			series: [
				{
					name: 'Successful',
					type: 'bar',
					stack: 'total',
					label: { show: true, color: theme.text },
					itemStyle: { color: theme.success },
					data: successData
				},
				{
					name: 'Errors',
					type: 'bar',
					stack: 'total',
					label: { show: true, color: theme.text },
					itemStyle: { color: theme.error },
					data: errorData
				}
			]
		};

		chart.setOption(option, true);
		chart.resize();
		toolUsageChartInitialized = true;
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
		window.addEventListener('echartsLoaded', () => loadToolUsageChart(), { once: true });
	} else {
		loadToolUsageChart();
	}
});

// Handle theme toggles (class on html)
const observer = new MutationObserver((mutations) => {
	if (!toolUsageChartInitialized || !toolUsageChartInstance) return;
	for (const mutation of mutations) {
		if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
			loadToolUsageChart();
			break;
		}
	}
});
observer.observe(document.documentElement, { attributes: true });
