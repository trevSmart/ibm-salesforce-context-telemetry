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

		// Set up time range selector
		const timeRangeSelect = document.getElementById('timeRangeSelect');
		if (timeRangeSelect) {
			timeRangeSelect.addEventListener('change', (e) => {
				const days = parseInt(e.target.value);
				loadChartData(days);
			});
		}
	} catch (error) {
		console.error('Auth check failed:', error);
		window.location.href = '/login';
	}
})();

// Helper function to escape HTML
function escapeHtml(str) {
	return String(str ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

// User menu functions
function showUserMenu(e) {
	e.stopPropagation();
	const userMenu = document.getElementById('userMenu');
	const isVisible = userMenu.style.display !== 'none';

	// Toggle menu visibility
	if (isVisible) {
		userMenu.style.display = 'none';
	} else {
		userMenu.style.display = 'block';
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

	if (userMenu && userMenu.style.display !== 'none') {
		if (!userMenuContainer && !userMenu.contains(event.target)) {
			userMenu.style.display = 'none';
		}
	}
});

async function handleLogout() {
	// Close menu
	const userMenu = document.getElementById('userMenu');
	if (userMenu) {
		userMenu.style.display = 'none';
	}

	try {
		const response = await fetch('/logout', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			credentials: 'include' // Ensure cookies are sent
		});
		if (response.ok) {
			window.location.href = '/login';
		}
	} catch (error) {
		console.error('Logout error:', error);
		window.location.href = '/login';
	}
}

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
let currentDays = 7;

async function loadChartData(days = currentDays) {
	try {
		currentDays = days;
		const response = await fetch(`/api/daily-stats?days=${days}&byEventType=true`, {
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

		if (!Array.isArray(data)) {
			throw new Error('Invalid stats response');
		}

		const labels = data.map(item => {
			const date = new Date(item.date);
			return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		});

		const hasBreakdown = data.length > 0 &&
			(data[0].startSessionsWithoutEnd !== undefined || data[0].toolEvents !== undefined);

		const isDark = document.documentElement.classList.contains('dark');
		const textColor = isDark ? '#a1a1aa' : '#52525b';
		const gridColor = isDark ? '#3f3f46' : '#e4e4e7';

		// Colors for start sessions without end
		const startSessionsBorderColor = isDark ? '#10b981' : '#059669';
		const startSessionsBackgroundColor = isDark ? 'rgba(16, 185, 129, 0.1)' : 'rgba(5, 150, 105, 0.1)';

		// Colors for tool events
		const toolEventsBorderColor = isDark ? '#0ea5e9' : '#0284c7';
		const toolEventsBackgroundColor = isDark ? 'rgba(14, 165, 233, 0.1)' : 'rgba(2, 132, 199, 0.1)';
		const totalEventsBorderColor = toolEventsBorderColor;
		const totalEventsBackgroundColor = toolEventsBackgroundColor;

		if (chart) {
			chart.destroy();
		}

		let datasets;

		if (hasBreakdown) {
			const startSessionsData = data.map(item => Number(item.startSessionsWithoutEnd) || 0);
			const toolEventsData = data.map(item => Number(item.toolEvents) || 0);

			datasets = [
				{
					label: 'Start Sessions',
					data: startSessionsData,
					borderColor: startSessionsBorderColor,
					backgroundColor: startSessionsBackgroundColor,
					borderWidth: 2,
					fill: true,
					tension: 0.4,
					pointRadius: 3,
					pointHoverRadius: 5,
					pointBackgroundColor: startSessionsBorderColor,
					pointBorderColor: '#ffffff',
					pointBorderWidth: 2,
					spanGaps: false
				},
				{
					label: 'Tool Events',
					data: toolEventsData,
					borderColor: toolEventsBorderColor,
					backgroundColor: toolEventsBackgroundColor,
					borderWidth: 2,
					fill: true,
					tension: 0.4,
					pointRadius: 3,
					pointHoverRadius: 5,
					pointBackgroundColor: toolEventsBorderColor,
					pointBorderColor: '#ffffff',
					pointBorderWidth: 2,
					spanGaps: false
				}
			];
		} else {
			const totalEventsData = data.map(item => Number(item.count ?? item.total ?? 0));

			datasets = [
				{
					label: 'Events',
					data: totalEventsData,
					borderColor: totalEventsBorderColor,
					backgroundColor: totalEventsBackgroundColor,
					borderWidth: 2,
					fill: true,
					tension: 0.4,
					pointRadius: 3,
					pointHoverRadius: 5,
					pointBackgroundColor: totalEventsBorderColor,
					pointBorderColor: '#ffffff',
					pointBorderWidth: 2,
					spanGaps: false
				}
			];
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
						display: true,
						position: 'top',
						labels: {
							color: textColor,
							font: {
								size: 12
							},
							usePointStyle: true,
							padding: 15
						}
					},
					tooltip: {
						backgroundColor: isDark ? '#27272a' : '#ffffff',
						titleColor: isDark ? '#e4e4e7' : '#18181b',
						bodyColor: isDark ? '#a1a1aa' : '#52525b',
						borderColor: gridColor,
						borderWidth: 1,
						padding: 12,
						displayColors: true,
						callbacks: {
							label: function(context) {
								return `${context.dataset.label}: ${context.parsed.y}`;
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
