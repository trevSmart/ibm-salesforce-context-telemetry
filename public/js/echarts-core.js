// @ts-nocheck
// ECharts core utilities - shared helpers for chart management

/**
 * Wait for ECharts library to be loaded
 * @returns {Promise<void>} Resolves when echarts is available
 */
export function awaitECharts() {
	if (typeof echarts !== 'undefined') {
		return Promise.resolve();
	}
	if (window.__echartsLoadingPromise) {
		return window.__echartsLoadingPromise;
	}

	window.__echartsLoadingPromise = new Promise((resolve) => {
		const existingScript = document.querySelector('script[src="/vendor/echarts/echarts.min.js"]');
		if (!existingScript) {
			// Load ECharts on-demand for soft navigation paths.
			const script = document.createElement('script');
			script.src = '/vendor/echarts/echarts.min.js';
			script.async = true;
			script.onload = () => {
				window.dispatchEvent(new CustomEvent('echartsLoaded'));
				resolve();
			};
			script.onerror = () => {
				console.warn('Failed to load ECharts library');
				resolve();
			};
			document.head.appendChild(script);
		}
		window.addEventListener('echartsLoaded', resolve, {once: true});
	});
	return window.__echartsLoadingPromise;
}

/**
 * Safely initialize a chart, cleaning up any existing instances
 * @param {HTMLElement} el - The DOM element for the chart
 * @returns {object|null} The initialized chart instance or null
 */
export function safeInit(el) {
	if (!el) {
		return null;
	}

	// Clear any existing content
	el.innerHTML = '';

	try {
		// Dispose any existing chart on this element
		if (typeof echarts !== 'undefined' && typeof echarts.getInstanceByDom === 'function') {
			const existingChart = echarts.getInstanceByDom(el);
			if (existingChart) {
				existingChart.dispose();
			}
		}
	} catch (error) {
		console.warn('Error disposing existing chart:', error);
	}

	try {
		if (typeof echarts === 'undefined') {
			console.warn('ECharts not loaded yet');
			return null;
		}
		return echarts.init(el);
	} catch (error) {
		console.error('Error initializing chart:', error);
		el.innerHTML = '';
		return null;
	}
}

/**
 * Bind window resize handler to chart with cleanup function
 * @param {object} chart - The chart instance
 * @param {object} options - Options for resize binding
 * @param {string} options.chartName - Name of chart for error logging
 * @returns {Function} Unbind function to remove the resize listener
 */
export function bindWindowResize(chart, options = {}) {
	const chartName = options.chartName || 'chart';
	
	const resizeHandler = () => {
		try {
			if (chart && typeof chart.resize === 'function') {
				chart.resize();
			}
		} catch (error) {
			console.warn(`Error resizing ${chartName}:`, error);
		}
	};

	window.addEventListener('resize', resizeHandler);

	// Return unbind function
	return () => {
		try {
			window.removeEventListener('resize', resizeHandler);
		} catch (error) {
			console.warn(`Error removing ${chartName} resize handler:`, error);
		}
	};
}

/**
 * Get chart theme colors based on current dark/light mode
 * @returns {object} Theme color object
 */
export function getChartTheme() {
	const isDark = document.documentElement.classList.contains('dark');
	return {
		text: isDark ? '#e4e4e7' : '#18181b',
		muted: isDark ? '#a1a1aa' : '#6b7280',
		grid: isDark ? '#2f3340' : '#e5e7eb',
		axis: isDark ? '#52525b' : '#d1d5db',
		axisLabel: isDark ? '#a1a1aa' : '#52525b',
		splitLine: isDark ? 'rgba(63, 63, 70, 0.35)' : 'rgba(228, 228, 231, 0.35)',
		success: '#14becb',
		error: '#dc2626',
		bg: 'transparent',
		isDark
	};
}
