// @ts-nocheck
// Teams management page
import { showToast } from './notifications.js';

const REFRESH_ICON_ANIMATION_DURATION_MS = 700;
let currentView = 'list'; // 'list' or 'detail'
let _currentTeamId = null;
let teams = [];
let _allOrgs = [];
let _allUsers = [];
let hasLoadedTeamsOnce = false;

// Utility functions
async function buildCsrfHeaders(includeJson = true) {
	// Start with shared helper headers if available
	const baseHeaders = (typeof window !== 'undefined' && window.getRequestHeaders)
		? window.getRequestHeaders(includeJson)
		: (includeJson ? { 'Content-Type': 'application/json' } : {});

	// If helper already provided token, return early
	if (baseHeaders['X-CSRF-Token']) {
		return baseHeaders;
	}

	// Try to fetch/store token using shared helper functions
	try {
		const token = (typeof window !== 'undefined' && window.getCsrfToken)
			? await window.getCsrfToken()
			: null;
		const fallbackToken = (!token && typeof window !== 'undefined' && window.getCsrfTokenFromCookie)
			? window.getCsrfTokenFromCookie()
			: null;
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
 * Only allows valid hex colors (#RGB or #RRGGBB format)
 * @param {string} color - Color value to sanitize
 * @returns {string|null} - Sanitized color or null if invalid
 */
function sanitizeCssColor(color) {
	if (!color || typeof color !== 'string') {
		return null;
	}
	// Only allow hex colors in format #RGB or #RRGGBB
	const hexColorPattern = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/;
	if (hexColorPattern.test(color.trim())) {
		return color.trim();
	}
	return null;
}

function hexToRgba(hex, alpha = 0.12) {
	if (!hex || typeof hex !== 'string') return null;
	const normalized = hex.replace('#', '');
	if (normalized.length !== 3 && normalized.length !== 6) return null;
	const full = normalized.length === 3 ? normalized.split('').map(c => c + c).join('') : normalized;
	const intVal = parseInt(full, 16);
	if (Number.isNaN(intVal)) return null;
	const r = (intVal >> 16) & 255;
	const g = (intVal >> 8) & 255;
	const b = intVal & 255;
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// User menu functions (showUserMenu, handleLogout) are now in user-menu.js

function toggleTheme() {
	const isDark = document.documentElement.classList.contains('dark');
	const newTheme = isDark ? 'light' : 'dark';
	localStorage.setItem('theme', newTheme);

	if (newTheme === 'dark') {
		document.documentElement.classList.add('dark');
	} else {
		document.documentElement.classList.remove('dark');
	}

	// Update theme menu item if it exists
	const btn = document.getElementById('themeToggleMenuItem');
	if (btn) {
		const lightThemeIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="user-menu-icon" width="16" height="16" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
      </svg>
    `;
		const darkThemeIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="user-menu-icon" width="16" height="16" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
      </svg>
    `;
		const label = newTheme === 'dark' ? 'Light theme' : 'Dark theme';
		btn.innerHTML = `${newTheme === 'dark' ? darkThemeIcon : lightThemeIcon}${label}`;
	}
}

function clearLocalData() {
	if (confirm('Clear all local data stored in this browser for the telemetry UI (theme, filters, etc.)?')) {
		localStorage.clear();
		alert('Local data cleared. Page will reload.');
		window.location.reload();
	}
}

// Settings modal is now in settings-modal.js and will be available globally

// Make functions available globally
// Note: showUserMenu and handleLogout are now exposed by user-menu.js
// Note: openSettingsModal is now exposed by settings-modal.js
window.toggleTheme = toggleTheme;
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
		showToast('Failed to load teams: ' + error.message, 'error');
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

async function createTeam(name, color) {
	try {
		const headers = await buildCsrfHeaders(true);
		const response = await fetch('/api/teams', {
			method: 'POST',
			headers,
			credentials: 'same-origin',
			body: JSON.stringify({ name, color })
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

async function updateTeam(teamId, updates) {
	try {
		const headers = await buildCsrfHeaders(true);
		const response = await fetch(`/api/teams/${teamId}`, {
			method: 'PUT',
			headers,
			credentials: 'same-origin',
			body: JSON.stringify(updates)
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
		const response = await fetch(`/api/teams/${teamId}`, {
			method: 'DELETE',
			headers,
			credentials: 'same-origin'
		});

		if (!response.ok) {
			const data = await response.json();
			throw new Error(data.message || `HTTP ${response.status}`);
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
			body: JSON.stringify({ team_id: teamId })
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
			body: JSON.stringify({ user_name: userName })
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
			body: JSON.stringify({ id: orgId, ...orgData })
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
	const container = document.getElementById('teamsContent');
	if (!container) return;

	container.innerHTML = `
    <div class="px-6 sm:px-8 teams-list-container">

      <div id="teamsList" class="grid grid-cols-1 gap-px overflow-hidden rounded-lg sm:grid-cols-2 lg:grid-cols-3">
        <div class="bg-white p-6 text-center text-sm text-gray-500 sm:col-span-2 lg:col-span-3">Loading teams...</div>
      </div>
    </div>
  `;

	const teamsList = document.getElementById('teamsList');

	if (teams.length === 0) {
		teamsList.innerHTML = `
      <div class="bg-white px-8 py-10 text-center sm:col-span-2 lg:col-span-3">
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
		return;
	}

	teamsList.innerHTML = teams.map(team => {
		// Sanitize color values to prevent XSS
		const sanitizedColor = sanitizeCssColor(team.color);
		const accentColor = sanitizedColor || '#4f46e5';
		const accentBg = sanitizedColor ? (hexToRgba(sanitizedColor, 0.14) || 'rgba(79, 70, 229, 0.12)') : 'rgba(79, 70, 229, 0.12)';

		// Get team initials for fallback avatar
		const initials = team.name.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase();

		// Logo or avatar
		const logoOrAvatar = team.has_logo
			? `<img src="/api/teams/${team.id}/logo" alt="${escapeHtml(team.name)} logo" class="size-12 object-contain" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
         <span class="inline-flex items-center justify-center rounded-lg text-sm font-semibold size-12" style="display: none; color: ${accentColor}; background-color: ${accentBg};">
           ${escapeHtml(initials)}
         </span>`
			: `<span class="inline-flex items-center justify-center rounded-lg text-sm font-semibold size-12" style="color: ${accentColor}; background-color: ${accentBg};">
           ${escapeHtml(initials)}
         </span>`;

		return `
      <div class="group relative bg-white dark:bg-gray-800/50 dark:outline dark:-outline-offset-1 dark:outline-white/10 p-6 transition hover:bg-gray-50 dark:hover:bg-gray-700/50 focus:outline-none focus-visible:outline-none" role="button" tabindex="0" onclick="viewTeamDetail(${team.id})" onkeypress="if(event.key==='Enter'||event.key===' '){event.preventDefault();viewTeamDetail(${team.id});}">
        <div>
          ${logoOrAvatar}
        </div>
        <div class="mt-8 space-y-2">
          <h3 class="text-base font-semibold text-gray-900">
            <span aria-hidden="true" class="absolute inset-0"></span>
            ${escapeHtml(team.name)}
          </h3>
          <div class="flex items-center gap-4 text-sm text-gray-500">
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
        <span aria-hidden="true" class="pointer-events-none absolute top-6 right-6 text-gray-300 opacity-0 transition duration-150 group-hover:opacity-100 group-hover:text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
          </svg>
        </span>
      </div>
    `;
	}).join('');
}

async function renderTeamDetail(teamId) {
	const container = document.getElementById('teamsContent');
	if (!container) return;

	container.innerHTML = `
    <div style="padding: 24px;">
      <div id="teamDetailHeader" style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 24px;">
        <div>
          <h1 id="teamDetailName" style="margin: 0 0 8px 0; font-size: 1.5rem; font-weight: 600;">Loading...</h1>
          <div id="teamDetailMeta" style="color: var(--text-secondary); font-size: 0.9rem;"></div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="editTeamBtn" class="btn">
            <i class="fas fa-pen" style="margin-right: 6px;"></i>Edit
          </button>
          <button id="deleteTeamBtn" class="btn btn-destructive">
            <i class="fas fa-trash" style="margin-right: 6px;"></i>Delete
          </button>
        </div>
      </div>
      <div id="teamDetailContent">
        <div style="padding: 24px; text-align: center; color: var(--text-secondary);">Loading team details...</div>
      </div>
    </div>
  `;

	const team = await fetchTeam(teamId);
	if (!team) {
		showToast('Team not found', 'error');
		currentView = 'list';
		renderTeamsList();
		return;
	}

	// Sanitize team color to prevent XSS
	const sanitizedTeamColor = sanitizeCssColor(team.color);
	const colorDot = sanitizedTeamColor ? `<span style="display: inline-block; width: 16px; height: 16px; border-radius: 999px; background: ${sanitizedTeamColor}; margin-right: 8px; border: 1px solid var(--border-color);"></span>` : '';

	document.getElementById('teamDetailName').innerHTML = `${colorDot}${escapeHtml(team.name)}`;
	document.getElementById('teamDetailMeta').textContent = `${team.orgs.length} org${team.orgs.length !== 1 ? 's' : ''} · ${team.users.length} user${team.users.length !== 1 ? 's' : ''}`;

	const detailContent = document.getElementById('teamDetailContent');
	detailContent.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
      <div class="divide-y divide-gray-200 dark:divide-gray-700 overflow-hidden rounded-lg bg-white dark:bg-gray-800/50 dark:outline dark:-outline-offset-1 dark:outline-white/10 shadow-sm">
        <div class="px-4 py-5 sm:px-6" style="display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; font-size: 1.1rem; font-weight: 600;">Organizations</h2>
          <button id="addOrgBtn" class="confirm-modal-btn confirm-modal-btn-cancel" onclick="showAddOrgModalForTeam(${teamId})">
            <i class="fas fa-plus" style="margin-right: 4px;"></i>Add Org
          </button>
        </div>
        <div class="px-4 py-5 sm:p-6">
          <div id="orgsList" style="display: flex; flex-direction: column; gap: 8px;">
            ${team.orgs.length === 0 ? '<p style="color: var(--text-secondary); text-align: center; padding: 16px;">No organizations assigned</p>' : ''}
          </div>
        </div>
      </div>
      <div class="divide-y divide-gray-200 dark:divide-gray-700 overflow-hidden rounded-lg bg-white dark:bg-gray-800/50 dark:outline dark:-outline-offset-1 dark:outline-white/10 shadow-sm">
        <div class="px-4 py-5 sm:px-6" style="display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; font-size: 1.1rem; font-weight: 600;">Users</h2>
          <button id="addUserBtn" class="confirm-modal-btn confirm-modal-btn-cancel" onclick="showAddUserModalForTeam(${teamId})">
            <i class="fas fa-plus" style="margin-right: 4px;"></i>Add User
          </button>
        </div>
        <div class="px-4 py-5 sm:p-6">
          <div id="usersList" style="display: flex; flex-direction: column; gap: 8px;">
            ${team.users.length === 0 ? '<p style="color: var(--text-secondary); text-align: center; padding: 16px;">No users assigned</p>' : ''}
          </div>
        </div>
      </div>
    </div>
  `;

	// Render orgs
	const orgsList = document.getElementById('orgsList');
	if (team.orgs.length > 0) {
		orgsList.innerHTML = team.orgs.map(org => {
			// Sanitize org color to prevent XSS
			const sanitizedOrgColor = sanitizeCssColor(org.color);
			const colorDot = sanitizedOrgColor ? `<span style="display: inline-block; width: 10px; height: 10px; border-radius: 999px; background: ${sanitizedOrgColor}; margin-right: 6px; border: 1px solid var(--border-color);"></span>` : '';
			return `
        <div class="bg-gray-50 dark:bg-gray-700/50" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px;">
          <div>
            <div style="font-weight: 500;">${colorDot}${escapeHtml(org.alias || org.id)}</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(org.id)}</div>
          </div>
          <button class="btn btn-compact btn-destructive" onclick="removeOrgFromTeam('${escapeHtml(org.id)}', ${teamId})">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;
		}).join('');
	}

	// Render users
	const usersList = document.getElementById('usersList');
	if (team.users.length > 0) {
		usersList.innerHTML = team.users.map(user => {
			return `
        <div class="bg-gray-50 dark:bg-gray-700/50" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px;">
          <div>
            <div style="font-weight: 500;">${escapeHtml(user.user_name)}</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">Event log user</div>
          </div>
          <button class="btn btn-compact btn-destructive" onclick="removeUserFromTeam('${escapeHtml(user.user_name)}', ${teamId})">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;
		}).join('');
	}

	// Event listeners
	document.getElementById('editTeamBtn')?.addEventListener('click', () => showEditTeamModal(team));
	document.getElementById('deleteTeamBtn')?.addEventListener('click', () => showDeleteTeamConfirm(team));
}

// Modal functions
function showCreateTeamModal() {
	showTeamFormModal(null);
}

function showEditTeamModal(team) {
	showTeamFormModal(team);
}

function showTeamFormModal(team = null) {
	const isEdit = team !== null;
	const backdrop = document.createElement('div');
	backdrop.className = 'confirm-modal-backdrop';

	const modal = document.createElement('div');
	modal.className = 'confirm-modal';
	const logoPreviewUrl = team && team.has_logo ? `/api/teams/${team.id}/logo` : null;
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
          <input type="text" id="teamColorInput" value="${team ? escapeHtml(team.color || '') : ''}" placeholder="#2195cf"
                 class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100">
        </label>
        <label>
          <div style="margin-bottom: 4px; font-weight: 500;">Logo</div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${logoPreviewUrl ? `
              <div class="bg-gray-50 dark:bg-gray-700/50 flex items-center gap-3 p-2 border border-gray-300 dark:border-gray-600 rounded-md">
                <img id="logoPreview" src="${logoPreviewUrl}" alt="Current logo" style="width: 48px; height: 48px; object-fit: contain; border-radius: 4px; background: white;">
                <div style="flex: 1;">
                  <div style="font-size: 0.875rem; color: var(--text-secondary);">Current logo</div>
                  <button type="button" id="removeLogoBtn" class="btn btn-compact btn-destructive" style="margin-top: 4px;">Remove logo</button>
                </div>
              </div>
            ` : ''}
            <input type="file" id="teamLogoInput" accept="image/png,image/jpeg,image/jpg,image/webp"
                   class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100">
            <div style="font-size: 0.75rem; color: var(--text-secondary);">PNG, JPEG, or WebP (max 500KB)</div>
            <div id="logoPreviewNew" style="display: none; margin-top: 8px;">
              <img id="logoPreviewImg" src="" alt="Logo preview" style="width: 48px; height: 48px; object-fit: contain; border-radius: 4px; background: white; border: 1px solid var(--border-color);">
            </div>
          </div>
        </label>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 20px; justify-content: flex-end;">
        <button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" id="cancelTeamFormBtn">
          Cancel
        </button>
        <button type="submit" class="confirm-modal-btn confirm-modal-btn-confirm">
          ${isEdit ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  `;

	backdrop.appendChild(modal);
	document.body.appendChild(backdrop);

	// Focus name input once modal is in the DOM
	setTimeout(() => {
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
		setTimeout(() => {
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
		if (e.target === backdrop) closeModal();
	});

	// Handle logo file input preview
	const logoInput = document.getElementById('teamLogoInput');
	const logoPreviewNew = document.getElementById('logoPreviewNew');
	const logoPreviewImg = document.getElementById('logoPreviewImg');
	let removeLogo = false;

	if (logoInput) {
		logoInput.addEventListener('change', (e) => {
			const file = e.target.files[0];
			if (file) {
				// Validate file size (500KB max)
				if (file.size > 500 * 1024) {
					showToast('Logo file is too large. Maximum size is 500KB.', 'error');
					e.target.value = '';
					return;
				}

				// Validate file type
				const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
				if (!allowedTypes.includes(file.type)) {
					showToast('Invalid file type. Only PNG, JPEG, and WebP images are allowed.', 'error');
					e.target.value = '';
					return;
				}

				// Show preview
				const reader = new FileReader();
				reader.onload = (event) => {
					logoPreviewImg.src = event.target.result;
					logoPreviewNew.style.display = 'block';
				};
				reader.readAsDataURL(file);
				removeLogo = false;
			} else {
				logoPreviewNew.style.display = 'none';
			}
		});
	}

	// Handle remove logo button
	const removeLogoBtn = document.getElementById('removeLogoBtn');
	if (removeLogoBtn) {
		removeLogoBtn.addEventListener('click', () => {
			if (confirm('Remove the current logo?')) {
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
				await updateTeamWithLogo(team.id, { name, color }, logoInput?.files[0] || null, removeLogo);
				showToast('Team updated successfully', 'success');
			} else {
				await createTeamWithLogo(name, color, logoInput?.files[0] || null);
				showToast('Team created successfully', 'success');
			}
			closeModal();
			await loadTeams();
			if (currentView === 'detail' && isEdit) {
				renderTeamDetail(team.id);
			} else {
				renderTeamsList();
			}
		} catch (error) {
			showToast(error.message || 'Failed to save team', 'error');
		}
	});
}

function showDeleteTeamConfirm(team) {
	if (!confirm(`Are you sure you want to delete "${team.name}"? This will unassign all orgs and users from this team.`)) {
		return;
	}

	deleteTeam(team.id).then(() => {
		showToast('Team deleted successfully', 'success');
		currentView = 'list';
		_currentTeamId = null;
		loadTeams().then(() => renderTeamsList());
	}).catch(error => {
		showToast(error.message || 'Failed to delete team', 'error');
	});
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
               style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); class="bg-gray-50 dark:bg-gray-700/50" color: var(--text-primary);">
      </label>
    </div>
    <div style="margin-bottom: 16px;">
      <label>
        <div style="margin-bottom: 4px; font-weight: 500;">Alias (optional)</div>
        <input type="text" id="newOrgAliasInput" placeholder="Friendly name for this org"
               style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); class="bg-gray-50 dark:bg-gray-700/50" color: var(--text-primary);">
      </label>
    </div>
    <div style="margin-bottom: 16px;">
      <label>
        <div style="margin-bottom: 4px; font-weight: 500;">Color (optional)</div>
        <input type="text" id="newOrgColorInput" placeholder="#2195cf"
               style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); class="bg-gray-50 dark:bg-gray-700/50" color: var(--text-primary);">
      </label>
    </div>
    ${unassignedOrgs.length > 0 ? `
      <div style="margin-bottom: 16px;">
        <div style="margin-bottom: 8px; font-weight: 500;">Or select existing org:</div>
        <el-autocomplete class="relative existing-org-combo">
          <input id="existingOrgSelect" name="existingOrgSelect" type="text" value=""
            class="block w-full rounded-md bg-white dark:bg-white/5 py-1.5 pr-12 pl-3 text-base text-gray-900 dark:text-white outline-1 -outline-offset-1 outline-gray-300 dark:outline-white/10 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 dark:focus:outline-indigo-500 sm:text-sm/6"
            placeholder="-- Select an org --">
          <button type="button" class="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="size-5 text-gray-400">
              <path d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
            </svg>
          </button>
          <el-options anchor="bottom end" popover class="max-h-60 w-(--input-width) overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-base shadow-lg outline outline-black/5 dark:outline dark:-outline-offset-1 dark:outline-white/10 transition-discrete [--anchor-gap:--spacing(1)] data-leave:transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0 sm:text-sm">
            <el-option value="" class="block truncate px-3 py-2 text-gray-900 dark:text-gray-300 select-none aria-selected:bg-indigo-600 dark:aria-selected:bg-indigo-500 aria-selected:text-white">-- Select an org --</el-option>
            ${unassignedOrgs.map(org => `<el-option value="${escapeHtml(org.id)}" class="block truncate px-3 py-2 text-gray-900 dark:text-gray-300 select-none aria-selected:bg-indigo-600 dark:aria-selected:bg-indigo-500 aria-selected:text-white">${escapeHtml(org.alias || org.id)}</el-option>`).join('')}
          </el-options>
        </el-autocomplete>
      </div>
    ` : ''}
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" id="cancelAddOrgBtn">
        Cancel
      </button>
      <button type="button" class="confirm-modal-btn confirm-modal-btn-confirm" id="saveAddOrgBtn">
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
		if (e.target === backdrop) closeModal();
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
		const color = document.getElementById('newOrgColorInput').value.trim() || null;

		if (!orgId) {
			showToast('Org ID is required', 'error');
			return;
		}

		try {
			await upsertOrg(orgId, { alias, color, team_id: teamId });
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
        <select id="userSelect" name="userSelect"
          class="block w-full rounded-md bg-white dark:bg-white/5 py-2 pr-3 pl-3 text-base text-gray-900 dark:text-white outline-1 -outline-offset-1 outline-gray-300 dark:outline-white/10 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 dark:focus:outline-indigo-500 sm:text-sm/6">
          <option value="">-- Select a user --</option>
          ${availableUsers.map(userName => `<option value="${escapeHtml(userName)}">${escapeHtml(userName)}</option>`).join('')}
        </select>
      </label>
    </div>
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" id="cancelAddUserBtn">
        Cancel
      </button>
      <button type="button" class="confirm-modal-btn confirm-modal-btn-confirm" id="saveAddUserBtn">
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
		if (e.target === backdrop) closeModal();
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
	if (!confirm('Remove this organization from the team?')) {
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
	if (!confirm('Remove this user from the team?')) {
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

// Global functions for onclick handlers
window.viewTeamDetail = (teamId) => {
	currentView = 'detail';
	_currentTeamId = teamId;
	renderTeamDetail(teamId);
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
		renderTeamsList();
	} catch (error) {
		console.error('Error refreshing teams:', error);
		showToast('Failed to refresh teams', 'error');
	} finally {
		if (icon) {
			// Smooth transition: replace infinite animation with a finishing one
			icon.classList.remove('rotating');
			icon.classList.add('rotating-finish');

			// Remove the finish class after animation completes
			setTimeout(() => {
				icon.classList.remove('rotating-finish');
			}, REFRESH_ICON_ANIMATION_DURATION_MS);
		}
	}
};

// Load and render
async function loadTeams() {
	try {
		teams = await fetchTeams();
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
			setTimeout(() => {
				const retryContainer = document.getElementById('teamsContent');
				if (retryContainer) {
					loadTeams().then(() => renderTeamsList());
				} else {
					console.error('Container still not found after retry');
					document.body.innerHTML = '<div style="padding: 24px;"><p>Error: teamsContent container not found</p></div>';
				}
			}, 100);
			return;
		}
		await loadTeams();
		renderTeamsList();
	} catch (error) {
		console.error('Error initializing teams page:', error);
		const container = document.getElementById('teamsContent');
		if (container) {
			container.innerHTML = `
        <div style="padding: 24px; text-align: center;">
          <p style="color: red;">Error loading teams page. Please check the console for details.</p>
          <p style="color: #666; margin-top: 8px;">${escapeHtml(error.message || 'Unknown error')}</p>
        </div>
      `;
		} else {
			document.body.innerHTML = `
        <div style="padding: 24px;">
          <p style="color: red;">Critical error: ${escapeHtml(error.message || 'Unknown error')}</p>
        </div>
      `;
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
	// Teams page doesn't have intervals, but we can clear any pending timeouts if needed
	// Currently no cleanup needed
}

function resumeTeamsPage() {
	// Teams page doesn't have intervals to resume
	// UI is preserved, no action needed
}

// Expose pause/resume hooks
window.pauseTeamsPage = pauseTeamsPage;
window.resumeTeamsPage = resumeTeamsPage;

// Listen for soft navigation events
window.addEventListener('softNav:pagePausing', (event) => {
	if (event?.detail?.path === '/teams') {
		pauseTeamsPage();
	}
});

// Handle soft navigation
window.addEventListener('softNav:pageMounted', (event) => {
	if (event.detail.path === '/teams') {
		const fromCache = event?.detail?.fromCache === true;
		if (fromCache) {
			// Page was restored from cache - no re-initialization needed
			resumeTeamsPage();
		} else {
			// New page load - full initialization
			init();
		}
	}
});
