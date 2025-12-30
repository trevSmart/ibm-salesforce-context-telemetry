// @ts-nocheck
// Teams management page
import {showToast} from './notifications.js';
import {timerRegistry} from './utils/timerRegistry.js';

const REFRESH_ICON_ANIMATION_DURATION_MS = 700;
// Transition duration in milliseconds (matches navigation.js)
const TEAMS_TRANSITION_DURATION_MS = 150;
let currentView = 'list'; // 'list' or 'detail'
let teams = [];
// Cache busting timestamp for team logos - updated when teams data changes
let teamsCacheBuster = Date.now();

// Transition functions
async function transitionTeamsContent(newContent) {
	const container = document.getElementById('teamsContent');
	if (!container) {
		return;
	}

	// Ensure container has relative positioning for absolute children
	if (window.getComputedStyle(container).position === 'static') {
		container.style.position = 'relative';
	}

	// Remove all existing children except the first one (in case there are multiple)
	// This ensures we only transition from one content to another
	while (container.children.length > 1) {
		container.removeChild(container.lastChild);
	}

	// Get the current content
	const currentContent = container.firstElementChild;
	if (!currentContent) {
		container.appendChild(newContent);
		return;
	}

	// Position the new content absolutely over the old one
	const containerRect = container.getBoundingClientRect();
	const currentRect = currentContent.getBoundingClientRect();

	newContent.style.position = 'absolute';
	newContent.style.top = `${currentRect.top - containerRect.top}px`;
	newContent.style.left = `${currentRect.left - containerRect.left}px`;
	newContent.style.width = `${currentRect.width}px`;
	newContent.style.height = `${currentRect.height}px`;
	newContent.style.zIndex = '1';
	newContent.style.opacity = '0';
	newContent.style.pointerEvents = 'none';

	// Insert new content after current content
	container.appendChild(newContent);

	// Trigger reflow to ensure opacity:0 is applied
	// eslint-disable-next-line no-unused-expressions
	newContent.offsetHeight;

	// Start crossfade: fade out old, fade in new
	currentContent.style.transition = `opacity ${TEAMS_TRANSITION_DURATION_MS}ms ease-out`;
	currentContent.style.pointerEvents = 'none';
	currentContent.style.opacity = '0';
	newContent.style.transition = `opacity ${TEAMS_TRANSITION_DURATION_MS}ms ease-in`;
	newContent.style.opacity = '1';
	newContent.style.pointerEvents = 'auto';

	// Wait for transition to complete
	await new Promise((resolve) => { timerRegistry.setTimeout("teams.transition", resolve, TEAMS_TRANSITION_DURATION_MS); });

	// Remove old content and reset positioning on new content
	currentContent.remove();
	newContent.style.position = '';
	newContent.style.top = '';
	newContent.style.left = '';
	newContent.style.width = '';
	newContent.style.height = '';
	newContent.style.zIndex = '';
	newContent.style.transition = '';
	newContent.style.opacity = '';
	newContent.style.pointerEvents = '';
}

// Utility functions
async function buildCsrfHeaders(includeJson = true) {
	// Start with shared helper headers if available
	const baseHeaders = (typeof window !== 'undefined' && window.getRequestHeaders)? window.getRequestHeaders(includeJson): (includeJson ? {'Content-Type': 'application/json'} : {});

	// If helper already provided token, return early
	if (baseHeaders['X-CSRF-Token']) {
		return baseHeaders;
	}

	// Try to fetch/store token using shared helper functions
	try {
		const token = (typeof window !== 'undefined' && window.getCsrfToken)? await window.getCsrfToken(): null;
		const fallbackToken = (!token && typeof window !== 'undefined' && window.getCsrfTokenFromCookie)? window.getCsrfTokenFromCookie(): null;
		const finalToken = token || fallbackToken;

		if (finalToken) {
			baseHeaders['X-CSRF-Token'] = finalToken;
			if (typeof window !== 'undefined' && window.setCsrfToken) {
				window.setCsrfToken(finalToken);
			}
		}
	} catch (error) {
		console.error('Failed to build CSRF headers:', error);
	}

	return baseHeaders;
}

function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

/**
 * Sanitize CSS color values to prevent XSS
 * Allows valid hex colors (#RGB or #RRGGBB format) and CSS color names
 * @param {string} color - Color value to sanitize
 * @returns {string|null} - Sanitized color or null if invalid
 */
function sanitizeCssColor(color) {
	if (!color || typeof color !== 'string') {
		return null;
	}

	const trimmedColor = color.trim();

	// Allow hex colors in format #RGB or #RRGGBB
	const hexColorPattern = /^#(?:[\dA-Fa-f]{3}|[\dA-Fa-f]{6})$/;
	if (hexColorPattern.test(trimmedColor)) {
		return trimmedColor;
	}

	// Allow CSS color names (basic set for security)
	const cssColorNames = new Set([
		'aliceblue',
'antiquewhite',
'aqua',
'aquamarine',
'azure',
'beige',
'bisque',
'black',
'blanchedalmond',
		'blue',
'blueviolet',
'brown',
'burlywood',
'cadetblue',
'chartreuse',
'chocolate',
'coral',
'cornflowerblue',
		'cornsilk',
'crimson',
'cyan',
'darkblue',
'darkcyan',
'darkgoldenrod',
'darkgray',
'darkgreen',
'darkgrey',
		'darkkhaki',
'darkmagenta',
'darkolivegreen',
'darkorange',
'darkorchid',
'darkred',
'darksalmon',
		'darkseagreen',
'darkslateblue',
'darkslategray',
'darkslategrey',
'darkturquoise',
'darkviolet',
		'deeppink',
'deepskyblue',
'dimgray',
'dimgrey',
'dodgerblue',
'firebrick',
'floralwhite',
'forestgreen',
		'fuchsia',
'gainsboro',
'ghostwhite',
'gold',
'goldenrod',
'gray',
'grey',
'green',
'greenyellow',
		'honeydew',
'hotpink',
'indianred',
'indigo',
'ivory',
'khaki',
'lavender',
'lavenderblush',
'lawngreen',
		'lemonchiffon',
'lightblue',
'lightcoral',
'lightcyan',
'lightgoldenrodyellow',
'lightgray',
'lightgreen',
		'lightgrey',
'lightpink',
'lightsalmon',
'lightseagreen',
'lightskyblue',
'lightslategray',
'lightslategrey',
		'lightsteelblue',
'lightyellow',
'lime',
'limegreen',
'linen',
'magenta',
'maroon',
'mediumaquamarine',
		'mediumblue',
'mediumorchid',
'mediumpurple',
'mediumseagreen',
'mediumslateblue',
'mediumspringgreen',
		'mediumturquoise',
'mediumvioletred',
'midnightblue',
'mintcream',
'mistyrose',
'moccasin',
'navajowhite',
		'navy',
'oldlace',
'olive',
'olivedrab',
'orange',
'orangered',
'orchid',
'palegoldenrod',
'palegreen',
		'paleturquoise',
'palevioletred',
'papayawhip',
'peachpuff',
'peru',
'pink',
'plum',
'powderblue',
		'purple',
'rebeccapurple',
'red',
'rosybrown',
'royalblue',
'saddlebrown',
'salmon',
'sandybrown',
		'seagreen',
'seashell',
'sienna',
'silver',
'skyblue',
'slateblue',
'slategray',
'slategrey',
'snow',
		'springgreen',
'steelblue',
'tan',
'teal',
'thistle',
'tomato',
'turquoise',
'violet',
'wheat',
'white',
		'whitesmoke',
'yellow',
'yellowgreen'
	]);

	// Check if it's a valid CSS color name (case insensitive)
	if (cssColorNames.has(trimmedColor.toLowerCase())) {
		return trimmedColor.toLowerCase();
	}

	return null;
}

// User menu functions (showUserMenu, handleLogout) are now in user-menu.js

/**
 * Show a confirmation dialog using Tailwind modal
 * @param {Object} options - Configuration options
 * @param {string} options.title - Dialog title
 * @param {string} options.message - Dialog message
 * @param {string} options.confirmText - Confirm button text (default: "Confirm")
 * @param {string} options.cancelText - Cancel button text (default: "Cancel")
 * @param {boolean} options.destructive - Whether this is a destructive action (default: false)
 * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
 */
function showConfirmDialog({title, message, confirmText = 'Confirm', cancelText = 'Cancel', destructive = false}) {
	return new Promise((resolve) => {
		const isDark = document.documentElement.classList.contains('dark');
		const dialogId = `confirm-dialog-${Date.now()}`;

		// Create dialog HTML using native <dialog> element
		const dialogHtml = `
			<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" id="${dialogId}-backdrop">
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 transform transition-all">
					<div class="flex items-start">
						<div class="mx-auto flex shrink-0 items-center justify-center rounded-full ${destructive ? (isDark ? 'bg-red-500/10' : 'bg-red-100') : (isDark ? 'bg-green-500/10' : 'bg-green-100')} sm:mx-0 sm:size-10" style="width: 3rem; height: 3rem;">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-6 ${destructive ? (isDark ? 'text-red-400' : 'text-red-600') : (isDark ? 'text-green-400' : 'text-green-600')}">
								${destructive ?'<path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" stroke-linecap="round" stroke-linejoin="round" />' :'<path d="m4.5 12.75 6 6 9-13.5" stroke-linecap="round" stroke-linejoin="round" />'
								}
							</svg>
						</div>
						<div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
							<h3 class="text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}">${escapeHtml(title)}</h3>
							<div class="mt-2">
								<p class="text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}">${escapeHtml(message)}</p>
							</div>
						</div>
					</div>
					<div class="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse gap-3">
						<button type="button" data-action="confirm" class="inline-flex w-full justify-center rounded-md ${destructive ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'} px-3 py-2 text-sm font-semibold text-white shadow-xs sm:ml-3 sm:w-auto">${escapeHtml(confirmText)}</button>
						<button type="button" data-action="cancel" class="mt-3 inline-flex w-full justify-center rounded-md ${isDark ? 'bg-white/10 hover:bg-white/20 text-white inset-ring-1 inset-ring-white/5' : 'bg-white hover:bg-gray-50 text-gray-900 shadow-xs inset-ring-1 inset-ring-gray-300'} px-3 py-2 text-sm font-semibold sm:mt-0 sm:w-auto">${escapeHtml(cancelText)}</button>
					</div>
				</div>
			</div>
		`;

		// Append to body
		const container = document.createElement('div');
		container.innerHTML = dialogHtml;
		document.body.appendChild(container);

		const backdrop = document.getElementById(`${dialogId}-backdrop`);
		const confirmBtn = container.querySelector('[data-action="confirm"]');
		const cancelBtn = container.querySelector('[data-action="cancel"]');

		let resolved = false;

		// Cleanup function
		const cleanup = () => {
			// Add fade out animation
			backdrop.style.opacity = '0';
			timerRegistry.setTimeout('modal.fadeOut', () => {
				container.remove();
			}, 200);
		};

		// Resolve helper to prevent multiple resolutions
		const resolveOnce = (value) => {
			if (!resolved) {
				resolved = true;
				// Cleanup event listener
				document.removeEventListener('keydown', handleKeydown);
				cleanup();
				resolve(value);
			}
		};

		// Handle confirm
		confirmBtn.addEventListener('click', () => {
			resolveOnce(true);
		});

		// Handle cancel
		cancelBtn.addEventListener('click', () => {
			resolveOnce(false);
		});

		// Handle backdrop click
		backdrop.addEventListener('click', (e) => {
			if (e.target === backdrop) {
				resolveOnce(false);
			}
		});

		// Handle ESC key
		const handleKeydown = (e) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				resolveOnce(false);
			}
		};
		document.addEventListener('keydown', handleKeydown);

		// Animate in
		requestAnimationFrame(() => {
			backdrop.style.opacity = '1';
		});
	});
}


async function clearLocalData() {
	const confirmed = await showConfirmDialog({
		title: 'Clear local data',
		message: 'Clear all local data stored in this browser for the telemetry UI (theme, filters, etc.)?',
		confirmText: 'Clear data',
		cancelText: 'Cancel',
		destructive: false
	});

	if (confirmed) {
		localStorage.clear();
		showToast('Local data cleared. Page will reload.', 'info');
		window.location.reload();
	}
}

// Settings modal is now in settings-modal.js and will be available globally

// Make functions available globally
// Note: showUserMenu and handleLogout are now exposed by user-menu.js
// Note: openSettingsModal is now exposed by settings-modal.js
window.clearLocalData = clearLocalData;

// API functions
async function fetchTeams() {
	try {
		const response = await fetch('/api/teams', {
			credentials: 'same-origin'
		});

		if (response.status === 401 || response.status === 403) {
			console.error('Authentication error:', response.status);
			window.location.href = '/login';
			return [];
		}

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Error fetching teams:', response.status, errorText);
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json();
		return data.teams || [];
	} catch (error) {
		console.error('Error fetching teams:', error);
		showToast(`Failed to load teams: ${  error.message}`, 'error');
		return [];
	}
}

async function fetchTeam(teamId) {
	try {
		const response = await fetch(`/api/teams/${teamId}`, {
			credentials: 'same-origin'
		});
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
		const data = await response.json();
		return data.team || null;
	} catch (error) {
		console.error('Error fetching team:', error);
		showToast('Failed to load team', 'error');
		return null;
	}
}

async function fetchOrgs() {
	try {
		const response = await fetch('/api/orgs', {
			credentials: 'same-origin'
		});
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
		const data = await response.json();
		return data.orgs || [];
	} catch (error) {
		console.error('Error fetching orgs:', error);
		return [];
	}
}

async function fetchEventUsers() {
	try {
		const response = await fetch('/api/event-users', {
			credentials: 'same-origin'
		});
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
		const data = await response.json();
		return data.users || [];
	} catch (error) {
		console.error('Error fetching event users:', error);
		return [];
	}
}

async function createTeamWithLogo(name, color, logoFile) {
	try {
		const headers = await buildCsrfHeaders(false);
		const formData = new FormData();
		formData.append('name', name);
		if (color) {
			formData.append('color', color);
		}
		if (logoFile) {
			formData.append('logo', logoFile);
		}

		const response = await fetch('/api/teams', {
			method: 'POST',
			headers,
			credentials: 'same-origin',
			body: formData
		});

		if (!response.ok) {
			const data = await response.json();
			throw new Error(data.message || `HTTP ${response.status}`);
		}

		const data = await response.json();
		return data.team;
	} catch (error) {
		console.error('Error creating team:', error);
		throw error;
	}
}

async function updateTeamWithLogo(teamId, updates, logoFile, removeLogo) {
	try {
		const headers = await buildCsrfHeaders(false);
		const formData = new FormData();
		if (updates.name !== undefined) {
			formData.append('name', updates.name);
		}
		if (updates.color !== undefined) {
			formData.append('color', updates.color || '');
		}
		if (logoFile) {
			formData.append('logo', logoFile);
		}
		if (removeLogo) {
			formData.append('remove_logo', 'true');
		}

		const response = await fetch(`/api/teams/${teamId}`, {
			method: 'PUT',
			headers,
			credentials: 'same-origin',
			body: formData
		});

		if (!response.ok) {
			const data = await response.json();
			throw new Error(data.message || `HTTP ${response.status}`);
		}

		const data = await response.json();
		return data.team;
	} catch (error) {
		console.error('Error updating team:', error);
		throw error;
	}
}

async function deleteTeam(teamId) {
	try {
		const headers = await buildCsrfHeaders(false);
		console.log('Delete team headers:', headers); // Debug logging

		const response = await fetch(`/api/teams/${teamId}`, {
			method: 'DELETE',
			headers,
			credentials: 'same-origin'
		});

		console.log('Delete team response:', response.status, response.statusText); // Debug logging

		if (!response.ok) {
			let errorMessage = `HTTP ${response.status}`;
			try {
				const data = await response.json();
				errorMessage = data.message || errorMessage;
			} catch (e) {
				// If we can't parse JSON, use the status text
				errorMessage = response.statusText || errorMessage;
			}
			throw new Error(errorMessage);
		}

		return true;
	} catch (error) {
		console.error('Error deleting team:', error);
		throw error;
	}
}

async function moveOrgToTeam(orgId, teamId) {
	try {
		const headers = await buildCsrfHeaders(true);
		const response = await fetch(`/api/orgs/${encodeURIComponent(orgId)}/move`, {
			method: 'POST',
			headers,
			credentials: 'same-origin',
			body: JSON.stringify({team_id: teamId})
		});

		if (!response.ok) {
			const data = await response.json();
			throw new Error(data.message || `HTTP ${response.status}`);
		}

		return true;
	} catch (error) {
		console.error('Error moving org:', error);
		throw error;
	}
}

async function addEventUserToTeam(userName, teamId) {
	try {
		const headers = await buildCsrfHeaders(true);
		const response = await fetch(`/api/teams/${teamId}/event-users`, {
			method: 'POST',
			headers,
			credentials: 'same-origin',
			body: JSON.stringify({user_name: userName})
		});

		if (!response.ok) {
			const data = await response.json();
			throw new Error(data.message || `HTTP ${response.status}`);
		}

		return true;
	} catch (error) {
		console.error('Error adding event user:', error);
		throw error;
	}
}

async function upsertOrg(orgId, orgData) {
	try {
		const headers = await buildCsrfHeaders(true);
		const response = await fetch('/api/orgs', {
			method: 'POST',
			headers,
			credentials: 'same-origin',
			body: JSON.stringify({id: orgId, ...orgData})
		});

		if (!response.ok) {
			const data = await response.json();
			throw new Error(data.message || `HTTP ${response.status}`);
		}

		const data = await response.json();
		return data.org;
	} catch (error) {
		console.error('Error upserting org:', error);
		throw error;
	}
}

// UI rendering functions
function renderTeamsList() {
	const container = document.createElement('div');
	container.innerHTML = `
    <div class="teams-list-container">
      <div id="teamsList" class="grid grid-cols-1 gap-px overflow-hidden rounded-lg sm:grid-cols-2 lg:grid-cols-3 dark:bg-gray-900 dark:outline dark:-outline-offset-1 dark:outline-white/20">
        <div class="bg-white p-6 text-center text-sm text-gray-500 sm:col-span-2 lg:col-span-3">Loading teams...</div>
      </div>
    </div>
  `;

	const teamsList = container.querySelector('#teamsList');

	if (teams.length === 0) {
		teamsList.innerHTML = `
      <div class="bg-white dark:bg-gray-800/50 dark:outline dark:-outline-offset-1 dark:outline-white/10 px-8 py-10 text-center sm:col-span-2 lg:col-span-3">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" aria-hidden="true" class="mx-auto size-12 text-gray-400">
          <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
        </svg>
        <h3 class="mt-3 text-base font-semibold text-gray-900">No teams</h3>
        <p class="mt-2 text-sm text-gray-500">Get started by creating a new team.</p>
        <div class="mt-6">
          <button type="button" class="btn" onclick="showCreateTeamModal()">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="mr-2 size-5">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5z" />
            </svg>
            New team
          </button>
        </div>
      </div>
    `;
		return container.firstElementChild;
	}

	teamsList.innerHTML = teams.map(team => {
		// Get team initials for fallback avatar
		const initials = team.name.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase();

		// Logo or avatar with cache busting for proper caching
		const logoOrAvatar = team.has_logo? `<img src="/api/teams/${team.id}/logo?t=${teamsCacheBuster}" alt="${escapeHtml(team.name)} logo" class="size-12 team-logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
        <span class="card-avatar" style="display: none; background: ${team.color || '#6b7280'};">
          ${escapeHtml(initials)}
        </span>`: `<span class="card-avatar" style="background: ${team.color || '#6b7280'};">
          ${escapeHtml(initials)}
        </span>`;

		return `
      <div class="group relative bg-white dark:bg-gray-800/50 dark:outline dark:-outline-offset-1 dark:outline-white/10 p-6 transition hover:bg-gray-50 dark:hover:bg-gray-700/50 focus:outline-none focus-visible:outline-none dark:focus-within:outline-2 dark:focus-within:-outline-offset-2 dark:focus-within:outline-indigo-500" role="button" tabindex="0" onclick="viewTeamDetail(${team.id})" onkeypress="if(event.key==='Enter'||event.key===' '){event.preventDefault();viewTeamDetail(${team.id});}">
        <div>
          ${logoOrAvatar}
        </div>
        <div class="mt-8 space-y-2">
          <h3 class="text-base font-semibold text-gray-900 dark:text-white">
            <span aria-hidden="true" class="absolute inset-0"></span>
            ${escapeHtml(team.name)}
          </h3>
          <div class="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span class="inline-flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="size-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z" />
              </svg>
              ${team.org_count} org${team.org_count !== 1 ? 's' : ''}
            </span>
            <span class="inline-flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="size-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
              ${team.user_count} user${team.user_count !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <span aria-hidden="true" class="pointer-events-none absolute top-6 right-6 text-gray-300 dark:text-gray-500 opacity-0 transition duration-150 group-hover:opacity-100 group-hover:text-gray-400 dark:group-hover:text-gray-200">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
          </svg>
        </span>
      </div>
    `;
	}).join('');

	return container.firstElementChild;
}

async function renderTeamDetail(teamId) {
	const contentContainer = document.createElement('div');
	contentContainer.innerHTML = `
    <div>
      <div id="teamDetailHeader" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <button id="backToTeamsBtn" style="background: none; border: none; padding: 4px; cursor: pointer; color: inherit; display: flex; align-items: center; justify-content: center; transition: opacity 0.2s; opacity: 0.7; width: 28px;" aria-label="Back to teams" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div>
            <h1 id="teamDetailName" style="margin: 0; font-size: 1.5rem; font-weight: 600;">Loading...</h1>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="deleteTeamBtn" class="btn btn-destructive">
            <i class="fas fa-trash" style="margin-right: 6px;"></i>Delete
          </button>
        </div>
      </div>
      <div id="teamDetailContent">
        <div class="p-6 text-center text-gray-500 dark:text-gray-400">Loading team details...</div>
      </div>
    </div>
  `;

	const team = await fetchTeam(teamId);
	if (!team) {
		showToast('Team not found', 'error');
		currentView = 'list';
		const listContent = renderTeamsList();
		await transitionTeamsContent(listContent);
		return contentContainer.firstElementChild;
	}

	// Sanitize team color to prevent XSS
	const sanitizedTeamColor = sanitizeCssColor(team.color);

	// Get team initials for fallback avatar
	const initials = team.name.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase();

	// Logo or avatar with cache busting
	const logoOrAvatar = team.has_logo ? `<img src="/api/teams/${team.id}/logo?t=${teamsCacheBuster}" alt="${escapeHtml(team.name)} logo" style="width: 32px; height: 32px; margin-right: 8px;" class="team-logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
		<span class="card-avatar" style="display: none; width: 32px; height: 32px; margin-right: 8px;">
			${escapeHtml(initials)}
		</span>` : `<span class="card-avatar" style="width: 32px; height: 32px; margin-right: 8px; background: ${sanitizedTeamColor || '#6b7280'};">
			${escapeHtml(initials)}
		</span>`;

	contentContainer.querySelector('#teamDetailName').innerHTML = `<span class="text-gray-900 dark:text-white" style="display: flex; align-items: center;">${logoOrAvatar}${escapeHtml(team.name)}</span>`;

	const detailContent = contentContainer.querySelector('#teamDetailContent');
	detailContent.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
      <div class="divide-y divide-gray-200 dark:divide-gray-700 overflow-hidden rounded-lg bg-white dark:bg-gray-800/50 dark:outline dark:-outline-offset-1 dark:outline-white/10 shadow-sm">
        <div class="px-4 py-5 sm:px-6">
          <h2 style="margin: 0; font-size: 1.1rem; font-weight: 600;">Details</h2>
        </div>
        <div class="px-4 py-5 sm:p-6">
          <form id="teamEditForm" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Team Name *</label>
              <input type="text" id="teamNameInput" value="${escapeHtml(team.name)}"
                     class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color</label>
              <div class="input-color">
                <button class="color-preview-btn" style="--preview-color: ${team.color || '#2195cf'}"></button>
                <input type="text" id="teamColorInput" value="${escapeHtml(team.color || '')}" placeholder="#2195cf"
                       class="p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100 coloris"
                       data-coloris>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Logo</label>
              <div class="space-y-2">
                ${team.has_logo ? `
                  <div id="currentLogoContainer" class="bg-gray-50 dark:bg-gray-700/50 flex items-center gap-3 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-colors">
                    <img src="/api/teams/${team.id}/logo?t=${teamsCacheBuster}" alt="Current logo" class="team-logo-modal" style="width: 48px; height: 48px;">
                    <div style="flex: 1;">
                      <div style="font-size: 0.875rem; color: var(--text-secondary);">Click to change logo</div>
                    </div>
                    <button type="button" id="removeLogoBtn" class="top-users-action" onclick="event.stopPropagation();" title="Remove logo">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </div>
                ` : `
                  <div id="currentLogoContainer" class="bg-gray-50 dark:bg-gray-700/50 flex items-center justify-center p-6 border border-dashed border-gray-300 dark:border-gray-600 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-colors">
                    <div class="text-center">
                      <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                      <div class="mt-2 text-sm text-gray-500 dark:text-gray-400">Click to upload logo</div>
                      <div class="text-xs text-gray-400 dark:text-gray-500">PNG, JPEG, or WebP (max 500KB)</div>
                    </div>
                  </div>
                `}
                <input type="file" id="teamLogoInput" accept="image/png,image/jpeg,image/jpg,image/webp" style="display: none;">
                <div id="logoPreviewNew" style="display: none; margin-top: 8px;">
                  <div class="bg-gray-50 dark:bg-gray-700/50 flex items-center gap-3 p-3 border border-gray-300 dark:border-gray-600 rounded-md">
                    <img id="logoPreviewImg" src="" alt="Logo preview" class="team-logo-modal" style="width: 48px; height: 48px; border: 1px solid var(--border-color);">
                    <div style="flex: 1;">
                      <div style="font-size: 0.875rem; color: var(--text-secondary);">New logo selected</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Created</label>
              <div class="text-sm text-gray-500 dark:text-gray-400">${new Date(team.created_at).toLocaleDateString()}</div>
            </div>
            <div class="flex justify-end gap-2 pt-4">
              <button type="submit" class="btn">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
      <div class="space-y-6">
        <div class="divide-y divide-gray-200 dark:divide-gray-700 overflow-hidden rounded-lg bg-white dark:bg-gray-800/50 dark:outline dark:-outline-offset-1 dark:outline-white/10 shadow-sm">
          <div class="px-4 py-5 sm:px-6" style="display: flex; justify-content: space-between; align-items: center;">
            <h2 style="margin: 0; font-size: 1.1rem; font-weight: 600;">Organizations</h2>
            <button id="addOrgBtn" class="btn" onclick="showAddOrgModalForTeam(${teamId})">
              <i class="fas fa-plus" style="margin-right: 4px;"></i>Add Org
            </button>
          </div>
          <div class="px-4 py-5 sm:p-6">
            <div id="orgsList" class="flex flex-col gap-2">
              ${team.orgs.length === 0 ? '<p class="text-gray-500 dark:text-gray-400 text-center p-4">No organizations assigned</p>' : ''}
            </div>
          </div>
        </div>
        <div class="divide-y divide-gray-200 dark:divide-gray-700 overflow-hidden rounded-lg bg-white dark:bg-gray-800/50 dark:outline dark:-outline-offset-1 dark:outline-white/10 shadow-sm">
          <div class="px-4 py-5 sm:px-6" style="display: flex; justify-content: space-between; align-items: center;">
            <h2 style="margin: 0; font-size: 1.1rem; font-weight: 600;">Users</h2>
            <button id="addUserBtn" class="btn" onclick="showAddUserModalForTeam(${teamId})">
              <i class="fas fa-plus" style="margin-right: 4px;"></i>Add User
            </button>
          </div>
          <div class="px-4 py-5 sm:p-6">
            <div id="usersList" class="flex flex-col gap-2">
              ${team.users.length === 0 ? '<p class="text-gray-500 dark:text-gray-400 text-center p-4">No users assigned</p>' : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

	// Render orgs
	const orgsList = contentContainer.querySelector('#orgsList');
	if (team.orgs.length > 0) {
		orgsList.innerHTML = team.orgs.map(org => {
			return `
        <div class="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md p-2.5 flex justify-between items-center">
          <div>
            <div style="font-weight: 500;">${escapeHtml(org.alias || org.id)}</div>
            <div class="text-gray-500 dark:text-gray-400 text-xs">${escapeHtml(org.id)}</div>
          </div>
          <button class="btn btn-compact btn-destructive" onclick="removeOrgFromTeam('${escapeHtml(org.id)}', ${teamId})">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;
		}).join('');
	}

	// Render users
	const usersList = contentContainer.querySelector('#usersList');
	if (team.users.length > 0) {
		usersList.innerHTML = team.users.map(user => {
			return `
        <div class="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md p-2.5 flex justify-between items-center">
          <div>
            <div style="font-weight: 500;">${escapeHtml(user.user_name)}</div>
            <div class="text-gray-500 dark:text-gray-400 text-xs">Event log user</div>
          </div>
          <button class="btn btn-compact btn-destructive" onclick="removeUserFromTeam('${escapeHtml(user.user_name)}', ${teamId})">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;
		}).join('');
	}

	// Event listeners
	contentContainer.querySelector('#backToTeamsBtn')?.addEventListener('click', async () => {
		currentView = 'list';
		const listContent = renderTeamsList();
		await transitionTeamsContent(listContent);
	});
	contentContainer.querySelector('#deleteTeamBtn')?.addEventListener('click', () => showDeleteTeamConfirm(team));

	// Team edit form listeners
	contentContainer.querySelector('#teamEditForm')?.addEventListener('submit', async (e) => {
		e.preventDefault();
		await handleTeamEditFormSubmit(teamId);
	});

	// Logo container click to select file
	const logoContainer = contentContainer.querySelector('#currentLogoContainer');
	const logoInput = contentContainer.querySelector('#teamLogoInput');
	if (logoContainer && logoInput) {
		logoContainer.addEventListener('click', () => {
			logoInput.click();
		});
	}

	// Logo preview for new uploads
	if (logoInput) {
		logoInput.addEventListener('change', (e) => {
			handleLogoFileChange(e.target);
		});
	}

	// Initialize remove logo button state
	const removeLogoBtn = contentContainer.querySelector('#removeLogoBtn');
	if (removeLogoBtn) {
		removeLogoBtn.dataset.removeLogo = 'false';
		removeLogoBtn.addEventListener('click', async (e) => {
			e.stopPropagation(); // Prevent triggering logo container click
			await handleRemoveLogo(teamId);
		});
	}

	return contentContainer.firstElementChild;
}

// Modal functions
function showCreateTeamModal() {
	showTeamFormModal(null);
}

// Note: showEditTeamModal is kept for potential future use or API compatibility
// eslint-disable-next-line no-unused-vars
function showEditTeamModal(team) {
	showTeamFormModal(team);
}

function showTeamFormModal(team = null) {
	const isEdit = team !== null;
	const backdrop = document.createElement('div');
	backdrop.className = 'confirm-modal-backdrop';

	const modal = document.createElement('div');
	modal.className = 'confirm-modal';
	const logoPreviewUrl = team && team.has_logo ? `/api/teams/${team.id}/logo?t=${teamsCacheBuster}` : null;
	modal.innerHTML = `
    <h2 style="margin: 0 0 16px 0;">${isEdit ? 'Edit Team' : 'Create Team'}</h2>
    <form id="teamForm" enctype="multipart/form-data">
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <label>
          <div style="margin-bottom: 4px; font-weight: 500;">Team Name *</div>
          <input type="text" id="teamNameInput" value="${team ? escapeHtml(team.name) : ''}"
                 class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100">
        </label>
        <label>
          <div style="margin-bottom: 4px; font-weight: 500;">Color</div>
          <div class="input-color">
            <button class="color-preview-btn" style="--preview-color: ${team ? (team.color || '#2195cf') : '#2195cf'}"></button>
            <input type="text" id="teamColorInput" value="${team ? escapeHtml(team.color || '') : ''}" placeholder="#2195cf"
                   class="p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100 coloris"
                   data-coloris>
          </div>
        </label>
        <label>
          <div style="margin-bottom: 4px; font-weight: 500;">Logo</div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${logoPreviewUrl ? `
              <div id="currentLogoContainer" class="bg-gray-50 dark:bg-gray-700/50 flex items-center gap-3 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-colors">
                <img id="logoPreview" src="${logoPreviewUrl}" alt="Current logo" class="team-logo-modal" style="width: 48px; height: 48px;">
                <div style="flex: 1;">
                  <div style="font-size: 0.875rem; color: var(--text-secondary);">Click to change logo</div>
                </div>
                <button type="button" id="removeLogoBtn" class="top-users-action" onclick="event.stopPropagation();" title="Remove logo">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              </div>
            ` : `
              <div id="currentLogoContainer" class="bg-gray-50 dark:bg-gray-700/50 flex items-center justify-center p-6 border border-dashed border-gray-300 dark:border-gray-600 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-colors">
                <div class="text-center">
                  <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <div class="mt-2 text-sm text-gray-500 dark:text-gray-400">Click to upload logo</div>
                  <div class="text-xs text-gray-400 dark:text-gray-500">PNG, JPEG, or WebP (max 500KB)</div>
                </div>
              </div>
            `}
            <input type="file" id="teamLogoInput" accept="image/png,image/jpeg,image/jpg,image/webp" style="display: none;">
            <div id="logoPreviewNew" style="display: none; margin-top: 8px;">
              <div class="bg-gray-50 dark:bg-gray-700/50 flex items-center gap-3 p-3 border border-gray-300 dark:border-gray-600 rounded-md">
                <img id="logoPreviewImg" src="" alt="Logo preview" class="team-logo-modal" style="width: 48px; height: 48px; border: 1px solid var(--border-color);">
                <div style="flex: 1;">
                  <div style="font-size: 0.875rem; color: var(--text-secondary);">New logo selected</div>
                </div>
              </div>
            </div>
          </div>
        </label>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 20px; justify-content: flex-end;">
        <button type="button" class="btn" id="cancelTeamFormBtn">
          Cancel
        </button>
        <button type="submit" class="btn confirm-modal-btn-confirm">
          ${isEdit ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  `;

	backdrop.appendChild(modal);
	document.body.appendChild(backdrop);

	// Re-initialize Coloris for the new color picker inputs
	initializeColoris();

	// Focus name input once modal is in the DOM
	timerRegistry.setTimeout('modal.focusInput', () => {
		document.getElementById('teamNameInput')?.focus();
	}, 0);

	// Trigger enter transition on next frame
	requestAnimationFrame(() => {
		backdrop.classList.add('visible');
	});

	function closeModal() {
		document.removeEventListener('keydown', handleKeydown);
		const handleTransitionEnd = () => {
			backdrop.removeEventListener('transitionend', handleTransitionEnd);
			backdrop.remove();
		};
		backdrop.addEventListener('transitionend', handleTransitionEnd);
		backdrop.classList.remove('visible');
		backdrop.classList.add('hiding');
		// Fallback in case transitionend does not fire
		timerRegistry.setTimeout('modal.transitionFallback', () => {
			if (document.body.contains(backdrop)) {
				backdrop.removeEventListener('transitionend', handleTransitionEnd);
				backdrop.remove();
			}
		}, 220);
	}

	function handleKeydown(e) {
		if (e.key === 'Escape') {
			e.preventDefault();
			closeModal();
		}
	}

	document.addEventListener('keydown', handleKeydown);
	document.getElementById('cancelTeamFormBtn')?.addEventListener('click', closeModal);
	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) {closeModal();}
	});

	// Handle logo container click
	const logoContainer = document.getElementById('currentLogoContainer');
	const logoInput = document.getElementById('teamLogoInput');
	const logoPreviewNew = document.getElementById('logoPreviewNew');
	const logoPreviewImg = document.getElementById('logoPreviewImg');
	let removeLogo = false;

	if (logoContainer && logoInput) {
		// Remove any existing click handler to prevent duplicates
		const existingHandler = logoContainer._logoClickHandler;
		if (existingHandler) {
			logoContainer.removeEventListener('click', existingHandler);
		}

		// Create and store the click handler
		const clickHandler = () => {
			logoInput.click();
		};
		logoContainer._logoClickHandler = clickHandler;
		logoContainer.addEventListener('click', clickHandler);
	}

	if (logoInput) {
		// Remove any existing change handler to prevent duplicates
		const existingChangeHandler = logoInput._logoChangeHandler;
		if (existingChangeHandler) {
			logoInput.removeEventListener('change', existingChangeHandler);
		}

		// Create and store the change handler
		const changeHandler = (e) => {
			const file = e.target.files[0];
			if (file) {
				// Validate file size (500KB max)
				if (file.size > 500 * 1024) {
					showToast('Logo file is too large. Maximum size is 500KB.', 'error');
					// Clear input after a short delay to prevent re-triggering change event
					timerRegistry.setTimeout('logo.clearSizeError', () => {
						if (logoInput) {logoInput.value = '';}
					}, 100);
					return;
				}

				// Validate file type
				const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
				if (!allowedTypes.includes(file.type)) {
					showToast('Invalid file type. Only PNG, JPEG, and WebP images are allowed.', 'error');
					// Clear input after a short delay to prevent re-triggering change event
					timerRegistry.setTimeout('logo.clearTypeError', () => {
						if (logoInput) {logoInput.value = '';}
					}, 100);
					return;
				}

				// Show preview
				const reader = new FileReader();
				reader.addEventListener('load', (event) => {
					logoPreviewImg.src = event.target.result;
					logoPreviewNew.style.display = 'block';
				});
				reader.readAsDataURL(file);
				removeLogo = false;
			} else {
				logoPreviewNew.style.display = 'none';
			}
		};
		logoInput._logoChangeHandler = changeHandler;
		logoInput.addEventListener('change', changeHandler);
	}

	// Handle remove logo button
	const removeLogoBtn = document.getElementById('removeLogoBtn');
	if (removeLogoBtn) {
		removeLogoBtn.addEventListener('click', async () => {
			const confirmed = await showConfirmDialog({
				title: 'Remove logo',
				message: 'Remove the current logo?',
				confirmText: 'Remove',
				cancelText: 'Cancel',
				destructive: false
			});

			if (confirmed) {
				removeLogo = true;
				const logoPreview = document.getElementById('logoPreview');
				const logoPreviewContainer = logoPreview?.closest('div');
				if (logoPreviewContainer) {
					logoPreviewContainer.style.display = 'none';
				}
				if (logoInput) {
					logoInput.value = '';
				}
				logoPreviewNew.style.display = 'none';
			}
		});
	}

	document.getElementById('teamForm')?.addEventListener('submit', async (e) => {
		e.preventDefault();
		const name = document.getElementById('teamNameInput').value.trim();
		const color = document.getElementById('teamColorInput').value.trim() || null;

		if (!name) {
			showToast('Team name is required', 'error');
			return;
		}

		try {
			if (isEdit) {
				await updateTeamWithLogo(team.id, {name, color}, logoInput?.files[0] || null, removeLogo);
				showToast('Team updated successfully', 'success');
			} else {
				await createTeamWithLogo(name, color, logoInput?.files[0] || null);
				showToast('Team created successfully', 'success');
			}
			closeModal();
			await loadTeams();
			if (currentView === 'detail' && isEdit) {
				const detailContent = await renderTeamDetail(team.id);
				await transitionTeamsContent(detailContent);
			} else {
				const listContent = renderTeamsList();
				await transitionTeamsContent(listContent);
			}
		} catch (error) {
			showToast(error.message || 'Failed to save team', 'error');
		}
	});
}

async function showDeleteTeamConfirm(team) {
	try {
		const confirmed = await showConfirmDialog({
			title: 'Delete team',
			message: `Are you sure you want to delete "${team.name}"? This will unassign all orgs and users from this team.`,
			confirmText: 'Delete team',
			cancelText: 'Cancel',
			destructive: true
		});

		if (!confirmed) {
			return;
		}

		await deleteTeam(team.id);
		showToast('Team deleted successfully', 'success');
		currentView = 'list';
		await loadTeams();
		const listContent = renderTeamsList();
		await transitionTeamsContent(listContent);
	} catch (error) {
		console.error('Delete team error:', error);
		showToast(error.message || 'Failed to delete team', 'error');
	}
}

async function showAddOrgModal(teamId) {
	const orgs = await fetchOrgs();
	const unassignedOrgs = orgs.filter(org => !org.team_id || org.team_id !== teamId);

	const backdrop = document.createElement('div');
	backdrop.className = 'confirm-modal-backdrop';

	const modal = document.createElement('div');
	modal.className = 'confirm-modal';
	modal.innerHTML = `
    <h2 style="margin: 0 0 16px 0;">Add Organization</h2>
    <div style="margin-bottom: 16px;">
      <label>
        <div style="margin-bottom: 4px; font-weight: 500;">Org ID *</div>
        <input type="text" id="newOrgIdInput" placeholder="Enter org identifier"
               class="bg-gray-50 dark:bg-gray-700/50"
               style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); color: var(--text-primary);">
      </label>
    </div>
    <div style="margin-bottom: 16px;">
      <label>
        <div style="margin-bottom: 4px; font-weight: 500;">Alias (optional)</div>
        <input type="text" id="newOrgAliasInput" placeholder="Friendly name for this org"
               class="bg-gray-50 dark:bg-gray-700/50"
               style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); color: var(--text-primary);">
      </label>
    </div>
    ${unassignedOrgs.length > 0 ? `
      <div style="margin-bottom: 16px;">
        <div style="margin-bottom: 8px; font-weight: 500;">Or select existing org:</div>
        <div class="relative existing-org-combo">
          <select id="existingOrgSelect" name="existingOrgSelect"
            class="block w-full appearance-none rounded-md bg-white dark:bg-white/5 py-1.5 pr-12 pl-3 text-base text-gray-900 dark:text-white outline-1 -outline-offset-1 outline-gray-300 dark:outline-white/10 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 dark:focus:outline-indigo-500 sm:text-sm/6">
            <option value="" selected>-- Select an org --</option>
            ${unassignedOrgs.map(org => `<option value="${escapeHtml(org.id)}">${escapeHtml(org.alias || org.id)}</option>`).join('')}
          </select>
          <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="size-5 text-gray-400">
              <path d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
            </svg>
          </div>
        </div>
      </div>
    ` : ''}
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button type="button" class="btn" id="cancelAddOrgBtn">
        Cancel
      </button>
      <button type="button" class="btn confirm-modal-btn-confirm" id="saveAddOrgBtn">
        Add Org
      </button>
    </div>
  `;

	backdrop.appendChild(modal);
	document.body.appendChild(backdrop);

	// Trigger enter transition on next frame
	requestAnimationFrame(() => {
		backdrop.classList.add('visible');
	});

	function closeModal() {
		document.removeEventListener('keydown', handleKeydown);
		backdrop.classList.remove('visible');
		backdrop.classList.add('hiding');
		// Wait for transition to complete before removing
		const onTransitionEnd = (e) => {
			if (e.target === backdrop) {
				backdrop.removeEventListener('transitionend', onTransitionEnd);
				backdrop.remove();
			}
		};
		backdrop.addEventListener('transitionend', onTransitionEnd);
	}

	function handleKeydown(e) {
		if (e.key === 'Escape') {
			e.preventDefault();
			closeModal();
		}
	}

	document.addEventListener('keydown', handleKeydown);
	document.getElementById('cancelAddOrgBtn')?.addEventListener('click', closeModal);
	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) {closeModal();}
	});

	const existingSelect = document.getElementById('existingOrgSelect');
	if (existingSelect) {
		const handleExistingOrgChange = (value) => {
			const selectedOrg = unassignedOrgs.find(org => org.id === value);
			if (selectedOrg) {
				document.getElementById('newOrgIdInput').value = selectedOrg.id;
				document.getElementById('newOrgAliasInput').value = selectedOrg.alias || '';
				document.getElementById('newOrgColorInput').value = selectedOrg.color || '';
			}
		};
		existingSelect.addEventListener('change', (e) => handleExistingOrgChange(e.target.value));
		existingSelect.addEventListener('input', (e) => handleExistingOrgChange(e.target.value));
	}

	document.getElementById('saveAddOrgBtn')?.addEventListener('click', async () => {
		const orgId = document.getElementById('newOrgIdInput').value.trim();
		const alias = document.getElementById('newOrgAliasInput').value.trim() || null;

		if (!orgId) {
			showToast('Org ID is required', 'error');
			return;
		}

		try {
			await upsertOrg(orgId, {alias, team_id: teamId});
			showToast('Org added successfully', 'success');
			closeModal();
			renderTeamDetail(teamId);
		} catch (error) {
			showToast(error.message || 'Failed to add org', 'error');
		}
	});
}

async function showAddUserModal(teamId) {
	const eventUsers = await fetchEventUsers();
	const team = await fetchTeam(teamId);
	const teamUserNames = new Set(team.users.map(u => u.user_name));
	const availableUsers = eventUsers.filter(userName => !teamUserNames.has(userName));

	if (availableUsers.length === 0) {
		if (eventUsers.length === 0) {
			showToast('No event log users found. Users will appear here once telemetry events with user data are received.', 'info');
		} else {
			showToast(`All ${eventUsers.length} event user${eventUsers.length !== 1 ? 's' : ''} ${eventUsers.length !== 1 ? 'are' : 'is'} already assigned to this team.`, 'info');
		}
		return;
	}

	const backdrop = document.createElement('div');
	backdrop.className = 'confirm-modal-backdrop';

	const modal = document.createElement('div');
	modal.className = 'confirm-modal';
	modal.innerHTML = `
    <h2 style="margin: 0 0 16px 0;">Add User</h2>
    <div style="margin-bottom: 16px;">
      <label>
        <div style="margin-bottom: 4px; font-weight: 500;">Select User</div>
        <div class="relative">
          <select id="userSelect" name="userSelect"
            class="block w-full appearance-none rounded-md bg-white dark:bg-white/5 py-2 pr-12 pl-3 text-base text-gray-900 dark:text-white outline-1 -outline-offset-1 outline-gray-300 dark:outline-white/10 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 dark:focus:outline-indigo-500 sm:text-sm/6">
            <option value="">-- Select a user --</option>
            ${availableUsers.map(userName => `<option value="${escapeHtml(userName)}">${escapeHtml(userName)}</option>`).join('')}
          </select>
          <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="size-5 text-gray-400">
              <path d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
            </svg>
          </div>
        </div>
      </label>
    </div>
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button type="button" class="btn" id="cancelAddUserBtn">
        Cancel
      </button>
      <button type="button" class="btn confirm-modal-btn-confirm" id="saveAddUserBtn">
        Add User
      </button>
    </div>
  `;

	backdrop.appendChild(modal);
	document.body.appendChild(backdrop);

	// Trigger enter transition on next frame
	requestAnimationFrame(() => {
		backdrop.classList.add('visible');
	});

	function closeModal() {
		document.removeEventListener('keydown', handleKeydown);
		backdrop.classList.remove('visible');
		backdrop.classList.add('hiding');
		// Wait for transition to complete before removing
		const onTransitionEnd = (e) => {
			if (e.target === backdrop) {
				backdrop.removeEventListener('transitionend', onTransitionEnd);
				backdrop.remove();
			}
		};
		backdrop.addEventListener('transitionend', onTransitionEnd);
	}

	function handleKeydown(e) {
		if (e.key === 'Escape') {
			e.preventDefault();
			closeModal();
		}
	}

	document.addEventListener('keydown', handleKeydown);
	document.getElementById('cancelAddUserBtn')?.addEventListener('click', closeModal);
	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) {closeModal();}
	});

	document.getElementById('saveAddUserBtn')?.addEventListener('click', async () => {
		const userName = document.getElementById('userSelect').value;
		if (!userName || userName.trim() === '') {
			showToast('Please select a user', 'error');
			return;
		}

		try {
			await addEventUserToTeam(userName, teamId);
			showToast('User added successfully', 'success');
			closeModal();
			renderTeamDetail(teamId);
		} catch (error) {
			showToast(error.message || 'Failed to add user', 'error');
		}
	});
}

async function removeOrgFromTeam(orgId, teamId) {
	const confirmed = await showConfirmDialog({
		title: 'Remove organization',
		message: 'Remove this organization from the team?',
		confirmText: 'Remove',
		cancelText: 'Cancel',
		destructive: true
	});

	if (!confirmed) {
		return;
	}

	try {
		await moveOrgToTeam(orgId, null);
		showToast('Org removed successfully', 'success');
		renderTeamDetail(teamId);
	} catch (error) {
		showToast(error.message || 'Failed to remove org', 'error');
	}
}

async function removeUserFromTeam(userName, teamId) {
	const confirmed = await showConfirmDialog({
		title: 'Remove user',
		message: 'Remove this user from the team?',
		confirmText: 'Remove',
		cancelText: 'Cancel',
		destructive: true
	});

	if (!confirmed) {
		return;
	}

	try {
		const response = await fetch(`/api/teams/${teamId}/event-users/${encodeURIComponent(userName)}`, {
			method: 'DELETE',
			credentials: 'same-origin'
		});

		if (!response.ok) {
			const data = await response.json();
			throw new Error(data.message || `HTTP ${response.status}`);
		}

		showToast('User removed successfully', 'success');
		renderTeamDetail(teamId);
	} catch (error) {
		showToast(error.message || 'Failed to remove user', 'error');
	}
}

// Inline team edit form handlers
async function handleTeamEditFormSubmit(teamId) {
	const name = document.getElementById('teamNameInput').value.trim();
	const color = document.getElementById('teamColorInput').value.trim() || null;
	const logoInput = document.getElementById('teamLogoInput');
	const removeLogoBtn = document.getElementById('removeLogoBtn');

	if (!name) {
		showToast('Team name is required', 'error');
		return;
	}

	try {
		// Check if remove logo was clicked
		const shouldRemoveLogo = removeLogoBtn && removeLogoBtn.dataset.removeLogo === 'true';

		await updateTeamWithLogo(teamId, {name, color}, logoInput?.files[0] || null, shouldRemoveLogo);
		showToast('Team updated successfully', 'success');

		// Reload team data and refresh the detail view
		await loadTeams();
		const detailContent = await renderTeamDetail(teamId);
		await transitionTeamsContent(detailContent);
	} catch (error) {
		showToast(error.message || 'Failed to update team', 'error');
	}
}

function handleLogoFileChange(fileInput) {
	const file = fileInput.files[0];
	const logoPreviewNew = document.getElementById('logoPreviewNew');
	const logoPreviewImg = document.getElementById('logoPreviewImg');

	if (file) {
		// Validate file size (500KB max)
		if (file.size > 500 * 1024) {
			showToast('Logo file is too large. Maximum size is 500KB.', 'error');
			fileInput.value = '';
			return;
		}

		// Validate file type
		const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
		if (!allowedTypes.includes(file.type)) {
			showToast('Invalid file type. Only PNG, JPEG, and WebP images are allowed.', 'error');
			fileInput.value = '';
			return;
		}

		// Show preview
		const reader = new FileReader();
		reader.addEventListener('load', (event) => {
			logoPreviewImg.src = event.target.result;
			logoPreviewNew.style.display = 'block';
		});
		reader.readAsDataURL(file);

		// Reset remove logo flag
		const removeLogoBtn = document.getElementById('removeLogoBtn');
		if (removeLogoBtn) {
			removeLogoBtn.dataset.removeLogo = 'false';
		}
	} else {
		logoPreviewNew.style.display = 'none';
	}
}

async function handleRemoveLogo(_teamId) {
	const confirmed = await showConfirmDialog({
		title: 'Remove logo',
		message: 'Remove the current logo?',
		confirmText: 'Remove',
		cancelText: 'Cancel',
		destructive: false
	});

	if (confirmed) {
		// Mark for removal
		const removeLogoBtn = document.getElementById('removeLogoBtn');
		if (removeLogoBtn) {
			removeLogoBtn.dataset.removeLogo = 'true';
		}

		// Hide current logo preview
		const logoContainer = removeLogoBtn.closest('.bg-gray-50');
		if (logoContainer) {
			logoContainer.style.display = 'none';
		}

		// Clear file input
		const logoInput = document.getElementById('teamLogoInput');
		if (logoInput) {
			logoInput.value = '';
		}

		// Hide new logo preview
		const logoPreviewNew = document.getElementById('logoPreviewNew');
		if (logoPreviewNew) {
			logoPreviewNew.style.display = 'none';
		}
	}
}

// Global functions for onclick handlers
window.viewTeamDetail = async (teamId) => {
	currentView = 'detail';
	const detailContent = await renderTeamDetail(teamId);
	await transitionTeamsContent(detailContent);
};

window.showCreateTeamModal = showCreateTeamModal;
window.showAddOrgModalForTeam = showAddOrgModal;
window.showAddUserModalForTeam = showAddUserModal;
window.removeOrgFromTeam = removeOrgFromTeam;
window.removeUserFromTeam = removeUserFromTeam;
window.refreshTeams = async function refreshTeams(event) {
	if (event?.preventDefault) {
		event.preventDefault();
	}
	const button = event?.currentTarget;
	const icon = button?.querySelector('.refresh-icon');
	if (icon) {
		icon.classList.add('rotating');
	}
	try {
		await loadTeams();
		const listContent = renderTeamsList();
		await transitionTeamsContent(listContent);
		// Update cache buster when manually refreshing to ensure any logo changes are visible
		teamsCacheBuster = Date.now();
	} catch (error) {
		console.error('Error refreshing teams:', error);
		showToast('Failed to refresh teams', 'error');
	} finally {
		if (icon) {
			// Smooth transition: replace infinite animation with a finishing one
			icon.classList.remove('rotating');
			icon.classList.add('rotating-finish');

			// Remove the finish class after animation completes
			timerRegistry.setTimeout('refreshIcon.finishAnimation', () => {
				icon.classList.remove('rotating-finish');
			}, REFRESH_ICON_ANIMATION_DURATION_MS);
		}
	}
};

// Load and render
async function loadTeams() {
	try {
		teams = await fetchTeams();
		// Update cache buster when teams data changes to ensure logos refresh
		teamsCacheBuster = Date.now();
	} catch (error) {
		console.error('Error loading teams:', error);
		showToast('Failed to load teams', 'error');
		teams = [];
	}
}

async function init() {
	try {
		const container = document.getElementById('teamsContent');
		if (!container) {
			console.error('teamsContent container not found');
			// Try again after a short delay in case DOM isn't ready
			timerRegistry.setTimeout('teams.domRetry', () => {
				const retryContainer = document.getElementById('teamsContent');
				if (retryContainer) {
					loadTeams().then(() => renderTeamsList());
				} else {
					console.error('Container still not found after retry');
					showToast('Teams content container not found', 'error');
				}
			}, 100);
			return;
		}
		await loadTeams();
		const listContent = renderTeamsList();
		const teamsContent = document.getElementById('teamsContent');
		if (teamsContent && listContent) {
			// Clear any existing content (like loading message)
			teamsContent.innerHTML = '';
			teamsContent.appendChild(listContent);
		}
	} catch (error) {
		console.error('Error initializing teams page:', error);
		const container = document.getElementById('teamsContent');
		showToast(`Error loading teams page: ${error.message || 'Unknown error'}`, 'error');
		if (container) {
			container.innerHTML = '';
		}
	}
}

// Initialize when page loads
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => {
		init();
	});
} else {
	init();
}

// Pause/resume functions for soft navigation
function pauseTeamsPage() {
	// Clear all timers (just in case any timeouts/intervals were added)
	timerRegistry.clearAll();
}

async function resumeTeamsPage() {
	// Teams page doesn't have intervals to resume
	// But we need to ensure event listeners are re-bound when returning from other pages
	await loadTeams();
}

// Initialize Coloris color picker
function initializeColoris() {
	if (typeof Coloris !== 'undefined') {
		Coloris({
			el: '.coloris',
			theme: 'pill',
			themeMode: 'auto',
			alpha: false,
			focusInput: false, // Allow manual typing/pasting in input field
			selectInput: false, // Don't auto-select text on focus
			swatches: [
				'DarkSlateGray',
				'#2a9d8f',
				'#e9c46a',
				'coral',
				'rgb(231, 111, 81)',
				'Crimson',
				'#023e8a',
				'#0077b6',
				'hsl(194, 100%, 39%)',
				'#00b4d8',
				'#48cae4'
			],
			onInput: (color, inputEl) => {
				console.log(`Color input: ${color}`);
				updateColorPreview(color, inputEl);
			},
			onChange: (color, inputEl) => {
				console.log(`Color changed to: ${color}`);
				updateColorPreview(color, inputEl);
			}
		});

		// Prevent Enter key in color inputs and Coloris picker from submitting forms
		// Use capture phase to intercept before the event reaches the form
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				// Check if the event originated from a coloris input or the picker itself
				const target = e.target;
				const isColorisInput = target && target.classList && target.classList.contains('coloris');
				const isInsidePicker = target && target.closest('.clr-picker');
				
				if (isColorisInput || isInsidePicker) {
					// Prevent the Enter key from bubbling up to the form
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
				}
			}
		}, true); // Use capture phase
	}
}

// Update color preview when color changes
function updateColorPreview(color, inputEl = null) {
	// Find the active input if not provided
	const activeInput = inputEl || document.querySelector('.coloris[data-coloris-open]');
	if (activeInput && activeInput.classList.contains('coloris')) {
		// Update the preview button
		const wrapper = activeInput.closest('.input-color');
		if (wrapper) {
			const previewBtn = wrapper.querySelector('.color-preview-btn');
			if (previewBtn) {
				previewBtn.style.setProperty('--preview-color', color);
			}
		}

		// Update the input value if it's different (this ensures the input reflects picker selection)
		if (activeInput.value !== color) {
			activeInput.value = color;
		}
	}
}

// Initialize Coloris when page loads
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeColoris);
} else {
	initializeColoris();
}

// Expose pause/resume hooks
window.pauseTeamsPage = pauseTeamsPage;
window.resumeTeamsPage = resumeTeamsPage;

// Expose team detail function for global access (used by command palette)
window.showTeamDetail = viewTeamDetail;

// Listen for soft navigation events
window.addEventListener('softNav:pagePausing', (event) => {
	if (event?.detail?.path === '/teams') {
		pauseTeamsPage();
		// Reset state when leaving teams page
		currentView = 'list';
	}
});

// Handle soft navigation
window.addEventListener('softNav:pageMounted', async (event) => {
	if (event.detail.path === '/teams') {
		const fromCache = event?.detail?.fromCache === true;
		// Always reset to list view when entering teams page
		currentView = 'list';

		if (fromCache) {
			// Page was restored from cache - always show list view
			await loadTeams();
			const listContent = renderTeamsList();
			const teamsContent = document.getElementById('teamsContent');
			if (teamsContent && listContent) {
				await transitionTeamsContent(listContent);
			}
		} else {
			// New page load - full initialization
			await loadTeams();
			const listContent = renderTeamsList();
			const teamsContent = document.getElementById('teamsContent');
			if (teamsContent && listContent) {
				// Clear any existing content (like loading message)
				teamsContent.innerHTML = '';
				teamsContent.appendChild(listContent);
			}
		}

		// Check for team ID in URL hash and show details if present
		checkForTeamDetailInURL();
	}
});

// Check URL hash for team detail request
function checkForTeamDetailInURL() {
	const hash = window.location.hash;
	if (hash && hash.startsWith('#team-')) {
		const teamId = hash.replace('#team-', '');
		if (teamId && !isNaN(Number(teamId))) {
			// Small delay to ensure teams are loaded
			timerRegistry.setTimeout('teams.viewDetailDelay', () => {
				viewTeamDetail(Number(teamId));
			}, 100);
		}
	}
}
