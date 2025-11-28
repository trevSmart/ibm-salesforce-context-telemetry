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
		// Only load chart data if authenticated
		loadChartData();
	} catch (error) {
		console.error('Auth check failed:', error);
		window.location.href = '/login';
	}
})();

// Detect system theme
function getSystemTheme() {
	return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initTheme() {
	const savedTheme = localStorage.getItem('theme');
	const theme = savedTheme || getSystemTheme();
	if (theme === 'dark') {
		document.documentElement.classList.add('dark');
	} else {
		document.documentElement.classList.remove('dark');
	}
}

// Initialize theme
initTheme();

// Chart configuration
let chart = null;

async function loadChartData() {
	try {
		const response = await fetch('/api/daily-stats?days=30', {
			credentials: 'include' // Ensure cookies are sent
		});
		if (response.status === 401) {
			window.location.href = '/login';
			return;
		}
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const data = await response.json();

		const labels = data.map(item => {
			const date = new Date(item.date);
			return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		});
		const counts = data.map(item => item.count);

		const isDark = document.documentElement.classList.contains('dark');
		const textColor = isDark ? '#a1a1aa' : '#52525b';
		const gridColor = isDark ? '#3f3f46' : '#e4e4e7';
		const borderColor = isDark ? '#0ea5e9' : '#0284c7';
		const backgroundColor = isDark ? 'rgba(14, 165, 233, 0.1)' : 'rgba(14, 165, 233, 0.1)';

		if (chart) {
			chart.destroy();
		}

		// Check if there are multiple series (datasets)
		// For now, we only have one dataset, but this prepares for future multi-series support
		const datasets = [{
			label: 'Events',
			data: counts,
			borderColor: borderColor,
			backgroundColor: backgroundColor,
			borderWidth: 2,
			fill: true,
			tension: 0.4,
			pointRadius: 3,
			pointHoverRadius: 5,
			pointBackgroundColor: borderColor,
			pointBorderColor: '#ffffff',
			pointBorderWidth: 2,
			spanGaps: false
		}];

		// Check if there are multiple series
		const hasMultipleSeries = datasets.length > 1;

		// If multiple series, convert 0 values to null so lines don't draw
		if (hasMultipleSeries) {
			datasets.forEach(dataset => {
				dataset.data = dataset.data.map(value => value === 0 ? null : value);
				// Hide points where value is null
				dataset.pointRadius = (ctx) => {
					const value = ctx.parsed.y;
					return (value === null || value === undefined) ? 0 : 3;
				};
			});
		}

		const ctx = document.getElementById('eventsChart').getContext('2d');
		chart = new Chart(ctx, {
			type: 'line',
			data: {
				labels: labels,
				datasets: datasets
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: false
					},
					tooltip: {
						backgroundColor: isDark ? '#27272a' : '#ffffff',
						titleColor: isDark ? '#e4e4e7' : '#18181b',
						bodyColor: isDark ? '#a1a1aa' : '#52525b',
						borderColor: gridColor,
						borderWidth: 1,
						padding: 12,
						displayColors: false,
						callbacks: {
							label: function(context) {
								return `Events: ${context.parsed.y}`;
							}
						}
					}
				},
				scales: {
					y: {
						beginAtZero: true,
						ticks: {
							color: textColor,
							font: {
								size: 12
							}
						},
						grid: {
							color: gridColor
						}
					},
					x: {
						ticks: {
							color: textColor,
							font: {
								size: 11
							},
							maxRotation: 45,
							minRotation: 45
						},
						grid: {
							color: gridColor,
							display: false
						}
					}
				}
			}
		});
	} catch (error) {
		console.error('Error loading chart data:', error);
	}
}

// Chart will be loaded after authentication check
