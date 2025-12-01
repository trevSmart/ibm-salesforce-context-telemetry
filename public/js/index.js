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

		const eventLogLink = document.getElementById('eventLogLink');
		if (eventLogLink) {
			if (data.role === 'advanced') {
				eventLogLink.style.display = '';
			} else {
				eventLogLink.style.display = 'none';
			}
		}

		// Hide "Delete all events" option for basic users
		const deleteAllMenuItem = document.querySelector('.delete-all-menu-item');
		if (deleteAllMenuItem) {
			if (data.role === 'advanced') {
				deleteAllMenuItem.style.display = '';
			} else {
				deleteAllMenuItem.style.display = 'none';
			}
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
let userMenuHideTimeout = null;
const USER_MENU_HIDE_DELAY_MS = 300;

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

				// Hide "Delete all events" option for basic users
				const deleteAllMenuItem = document.querySelector('.delete-all-menu-item');
				if (deleteAllMenuItem) {
					if (data.role === 'advanced') {
						deleteAllMenuItem.style.display = '';
					} else {
						deleteAllMenuItem.style.display = 'none';
					}
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

function setupUserMenuHover() {
	const container = document.querySelector('.user-menu-container');
	if (!container) {
		return;
	}

	container.addEventListener('mouseenter', (event) => {
		const userMenu = document.getElementById('userMenu');
		if (!userMenu) {
			return;
		}

		if (userMenuHideTimeout) {
			clearTimeout(userMenuHideTimeout);
			userMenuHideTimeout = null;
		}

		// Only open if it's not already visible
		if (!userMenu.classList.contains('show')) {
			showUserMenu(event);
		}
	});

	container.addEventListener('mouseleave', () => {
		const userMenu = document.getElementById('userMenu');
		if (!userMenu) {
			return;
		}

		if (userMenuHideTimeout) {
			clearTimeout(userMenuHideTimeout);
		}
		userMenuHideTimeout = setTimeout(() => {
			userMenu.classList.remove('show');
			userMenuHideTimeout = null;
		}, USER_MENU_HIDE_DELAY_MS);
	});
}

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

function handleDeleteAll() {
	// Close menu
	const userMenu = document.getElementById('userMenu');
	if (userMenu) {
		userMenu.classList.remove('show');
	}
	// Call delete all confirmation
	confirmDeleteAll();
}

let deleteAllConfirmed = false;

function confirmDeleteAll() {
	if (!deleteAllConfirmed) {
		deleteAllConfirmed = true;
		openConfirmModal({
			title: 'Delete all events',
			message: 'Are you sure you want to delete ALL events? This action cannot be undone.',
			confirmLabel: 'Delete all events',
			destructive: true
		}).then((firstConfirmed) => {
			if (!firstConfirmed) {
				deleteAllConfirmed = false;
				return;
			}

			openConfirmModal({
				title: 'Final warning',
				message: 'This will permanently delete ALL events from the database.\nAre you absolutely sure?',
				confirmLabel: 'Yes, delete everything',
				destructive: true
			}).then((secondConfirmed) => {
				if (!secondConfirmed) {
					deleteAllConfirmed = false;
					return;
				}
				// Perform deletion
				deleteAllEvents();
			});
		});
	} else {
		deleteAllEvents();
	}
}

async function deleteAllEvents() {
	try {
		const response = await fetch('/api/events', {
			method: 'DELETE',
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
		alert(`Successfully deleted ${data.deletedCount || 0} events.`);

		// Reset confirmation flag
		deleteAllConfirmed = false;

		// Refresh chart data
		loadChartData(currentDays);
	} catch (error) {
		console.error('Error deleting events:', error);
		alert('Error deleting events: ' + error.message);
		deleteAllConfirmed = false;
	}
}

// Detect system theme
function getSystemTheme() {
	return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
	if (theme === 'dark') {
		document.documentElement.classList.add('dark');
	} else {
		document.documentElement.classList.remove('dark');
	}
	updateThemeMenuItem(theme);
}

function initTheme() {
	const savedTheme = localStorage.getItem('theme');
	const theme = savedTheme || getSystemTheme();
	applyTheme(theme);
}

function toggleTheme() {
	const isDark = document.documentElement.classList.contains('dark');
	const newTheme = isDark ? 'light' : 'dark';
	localStorage.setItem('theme', newTheme);
	applyTheme(newTheme);
}

function updateThemeMenuItem(theme) {
	const btn = document.getElementById('themeToggleMenuItem');
	if (!btn) {
		return;
	}

	const isDark = theme === 'dark';
	const iconClass = isDark ? 'fa-regular fa-sun' : 'fa-regular fa-moon';
	const label = isDark ? 'Light theme' : 'Dark theme';
	btn.innerHTML = `<i class="${iconClass} user-menu-icon"></i>${label}`;
}

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

function openConfirmModal({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive = false }) {
	return new Promise((resolve) => {
		const existing = document.querySelector('.confirm-modal-backdrop');
		if (existing) {
			existing.remove();
		}

		const backdrop = document.createElement('div');
		backdrop.className = 'confirm-modal-backdrop';

		const modal = document.createElement('div');
		modal.className = 'confirm-modal';
		modal.innerHTML = `
			<div class="confirm-modal-title">${escapeHtml(title || 'Confirm action')}</div>
			<div class="confirm-modal-message">${escapeHtml(message || '')}</div>
			<div class="confirm-modal-actions">
				<button type="button" class="confirm-modal-btn confirm-modal-btn-cancel">${escapeHtml(cancelLabel)}</button>
				<button type="button" class="confirm-modal-btn ${destructive ? 'confirm-modal-btn-destructive' : 'confirm-modal-btn-confirm'}">${escapeHtml(confirmLabel)}</button>
			</div>
		`;

		backdrop.appendChild(modal);
		document.body.appendChild(backdrop);

		// Trigger enter transition on next frame
		requestAnimationFrame(() => {
			backdrop.classList.add('visible');
		});

		function animateAndResolve(result) {
			const handleTransitionEnd = () => {
				backdrop.removeEventListener('transitionend', handleTransitionEnd);
				backdrop.remove();
			};

			backdrop.addEventListener('transitionend', handleTransitionEnd);
			backdrop.classList.remove('visible');
			backdrop.classList.add('hiding');

			// Fallback in case transitionend does not fire
			setTimeout(() => {
				if (document.body.contains(backdrop)) {
					backdrop.removeEventListener('transitionend', handleTransitionEnd);
					backdrop.remove();
				}
			}, 220);

			resolve(result);
		}

		const [cancelBtn, confirmBtn] = modal.querySelectorAll('.confirm-modal-btn');
		cancelBtn.addEventListener('click', () => animateAndResolve(false));
		confirmBtn.addEventListener('click', () => animateAndResolve(true));

		backdrop.addEventListener('click', (e) => {
			if (e.target === backdrop) {
				animateAndResolve(false);
			}
		});

		document.addEventListener(
			'keydown',
			function handleKeydown(e) {
				if (e.key === 'Escape') {
					document.removeEventListener('keydown', handleKeydown);
					if (document.body.contains(backdrop)) {
						animateAndResolve(false);
					}
				}
			}
		);
	});
}

// Initialize theme
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => {
		initTheme();
		setupUserMenuHover();
		setupIconButtonsGroupHover();
	});
} else {
	initTheme();
	setupUserMenuHover();
	setupIconButtonsGroupHover();
}

// Handle smooth hover animation for icon buttons group
function setupIconButtonsGroupHover() {
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
				currentHoveredButton = null;
			}
		});
	});
}

// Refresh dashboard function
function refreshDashboard(event) {
	if (event) {
		event.stopPropagation();
	}
	// Reload chart data with current days setting
	loadChartData(currentDays);
}

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
		const gridColor = isDark ? '#3f3f46' : '#f4f4f5';

		// Colors for start sessions without end (match session badge blue)
		const startSessionsBorderColor = '#2195cf';
		const startSessionsBackgroundColor = 'rgba(33, 149, 207, 0.15)';

		// Colors for tool events (match tool badge purple)
		const toolEventsBorderColor = '#8e81ea';
		const toolEventsBackgroundColor = 'rgba(142, 129, 234, 0.15)';

		// Colors for error events (red)
		const errorEventsBorderColor = '#f97373';
		const errorEventsBackgroundColor = 'rgba(248, 113, 113, 0.18)';

		const totalEventsBorderColor = toolEventsBorderColor;
		const totalEventsBackgroundColor = toolEventsBackgroundColor;

		if (chart) {
			chart.destroy();
		}

		let datasets;

		if (hasBreakdown) {
			const startSessionsData = data.map(item => Number(item.startSessionsWithoutEnd) || 0);
			const toolEventsData = data.map(item => Number(item.toolEvents) || 0);
			const errorEventsData = data.map(item => Number(item.errorEvents) || 0);

			datasets = [
				{
					label: 'Start Sessions',
					data: startSessionsData,
					borderColor: startSessionsBorderColor,
					backgroundColor: startSessionsBackgroundColor,
					borderWidth: 2,
					fill: true,
					tension: 0.25,
					pointRadius: 2,
					pointHoverRadius: 4,
					pointBackgroundColor: startSessionsBorderColor,
					pointBorderColor: '#ffffff',
					pointBorderWidth: 1,
					spanGaps: false
				},
				{
					label: 'Tool Events',
					data: toolEventsData,
					borderColor: toolEventsBorderColor,
					backgroundColor: toolEventsBackgroundColor,
					borderWidth: 2,
					fill: true,
					tension: 0.25,
					pointRadius: 2,
					pointHoverRadius: 4,
					pointBackgroundColor: toolEventsBorderColor,
					pointBorderColor: '#ffffff',
					pointBorderWidth: 1,
					spanGaps: false
				},
				{
					label: 'Errors',
					data: errorEventsData,
					borderColor: errorEventsBorderColor,
					backgroundColor: errorEventsBackgroundColor,
					borderWidth: 2,
					fill: true,
					tension: 0.25,
					pointRadius: 2,
					pointHoverRadius: 4,
					pointBackgroundColor: errorEventsBorderColor,
					pointBorderColor: '#ffffff',
					pointBorderWidth: 1,
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
					tension: 0.1,
					pointRadius: 2,
					pointHoverRadius: 4,
					pointBackgroundColor: totalEventsBorderColor,
					pointBorderColor: '#ffffff',
					pointBorderWidth: 1,
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
				elements: {
					point: {
						radius: 1.5,
						hoverRadius: 3,
						borderWidth: 1
					}
				},
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
							padding: 15,
							boxWidth: 12,
							boxPadding: 8
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
