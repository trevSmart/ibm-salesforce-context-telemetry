/**
 * Settings Modal Module
 * Centralized implementation of the Settings modal
 * Used across all pages: Dashboard, Event Log, Teams
 */

import {showToast} from './notifications.js';

/* Custom styles for settings modal */
const settingsModalStyles = `
<style>
/* Table scroll styling */
.settings-users-table-container::-webkit-scrollbar,
.settings-users-table-wrapper::-webkit-scrollbar {
	height: 8px;
}

.settings-users-table-container::-webkit-scrollbar-track,
.settings-users-table-wrapper::-webkit-scrollbar-track {
	background: var(--bg-secondary);
	border-radius: 4px;
}

.settings-users-table-container::-webkit-scrollbar-thumb,
.settings-users-table-wrapper::-webkit-scrollbar-thumb {
	background: var(--border-color);
	border-radius: 4px;
}

.settings-users-table-container::-webkit-scrollbar-thumb:hover,
.settings-users-table-wrapper::-webkit-scrollbar-thumb:hover {
	background: var(--text-secondary);
}

/* Ensure tables don't break layout */
.settings-users-table-container,
.settings-users-table-wrapper {
	max-width: 100%;
}

/* Wide modal for sections that need more space */
.settings-modal-wide {
	max-width: 1000px !important;
}
</style>
`;

// Utility function to escape HTML and prevent XSS
function escapeHtml(unsafe) {
	return String(unsafe)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

// Confirm modal for dangerous operations
function openConfirmModal({title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive = false}) {
	return new Promise((resolve) => {
		const existing = document.querySelector('.confirm-dialog-backdrop');
		if (existing) {
			existing.remove();
		}

		const backdrop = document.createElement('div');
		backdrop.className = 'confirm-modal-backdrop confirm-dialog-backdrop';

		const modal = document.createElement('div');
		modal.className = 'confirm-modal confirm-dialog';
		modal.innerHTML = `
			<div class="confirm-dialog-header">
				${destructive ? `<div class="mx-auto flex size-12 shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:size-10">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" data-slot="icon" aria-hidden="true" class="size-6 text-red-600">
						<path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" stroke-linecap="round" stroke-linejoin="round"></path>
					</svg>
				</div>` : ''}
				<div>
					<div class="confirm-modal-title">${escapeHtml(title || 'Confirm action')}</div>
					<div>${escapeHtml(message || '')}</div>
				</div>
			</div>
			<div class="confirm-dialog-actions">
				<button type="button" class="text-sm btn">${escapeHtml(cancelLabel)}</button>
				<button type="button" class="btn ${destructive ? 'inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-red-500 sm:ml-3 sm:w-auto' : 'confirm-modal-btn-confirm'}">${escapeHtml(confirmLabel)}</button>
			</div>
		`;

		backdrop.appendChild(modal);
		document.body.appendChild(backdrop);

		// Trigger enter transition on next frame
		requestAnimationFrame(() => {
			backdrop.classList.add('visible');
		});

		function animateAndResolve(result) {
			const handleTransitionEnd = (event) => {
				if (event.target !== backdrop) {
					return;
				}
				backdrop.ontransitionend = null;
				backdrop.remove();
			};

			backdrop.addEventListener('transitionend', handleTransitionEnd);
			backdrop.classList.remove('visible');
			backdrop.classList.add('hiding');

			resolve(result);
		}

		const [cancelBtn, confirmBtn] = modal.querySelectorAll('.btn');
		cancelBtn.addEventListener('click', () => animateAndResolve(false));
		confirmBtn.addEventListener('click', () => animateAndResolve(true));

		document.addEventListener(
			'keydown',
			function handleKeydown(e) {
				if (e.key === 'Escape') {
					e.stopImmediatePropagation();
					e.preventDefault();
					document.removeEventListener('keydown', handleKeydown);
					if (document.body.contains(backdrop)) {
						animateAndResolve(false);
					}
				}
			}
		);
	});
}

// Danger zone functionality - Delete all events
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
			headers: window.getRequestHeaders ? window.getRequestHeaders(false) : {},
			credentials: 'include'
		});

		if (response.status === 401) {
			window.location.href = '/login';
			return;
		}
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();
		showToast(`Successfully deleted ${data.deletedCount || 0} events.`, 'success');

		// Reset confirmation flag
		deleteAllConfirmed = false;

		// Note: Events deleted - page may need to refresh its data
	} catch (error) {
		console.error('Error deleting events:', error);
		showToast(`Error deleting events: ${  error.message}`, 'error');
		deleteAllConfirmed = false;
	}
}

// Empty trash functionality
function confirmEmptyTrash() {
	openConfirmModal({
		title: 'Empty trash',
		message: 'Are you sure you want to permanently delete ALL events in the trash? This action cannot be undone.',
		confirmLabel: 'Empty trash',
		destructive: true
	}).then((confirmed) => {
		if (confirmed) {
			emptyTrash();
		}
	});
}

async function emptyTrash() {
	try {
		const response = await fetch('/api/events/deleted', {
			method: 'DELETE',
			headers: window.getRequestHeaders ? window.getRequestHeaders(false) : {},
			credentials: 'include'
		});

		if (response.status === 401) {
			window.location.href = '/login';
			return;
		}
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();
		showToast(`Successfully deleted ${data.deletedCount || 0} events from trash.`, 'success');

		// Refresh trash info
		loadTrashInfo();

		// Note: Trash emptied - page may need to refresh its data
	} catch (error) {
		console.error('Error emptying trash:', error);
		showToast(`Error emptying trash: ${  error.message}`, 'error');
	}
}

// Load trash info
async function loadTrashInfo() {
	try {
		const response = await fetch('/api/events/deleted?limit=0', {
			method: 'GET',
			headers: window.getRequestHeaders ? window.getRequestHeaders(false) : {},
			credentials: 'include'
		});

		if (response.status === 401) {
			// User doesn't have permission, hide the trash info
			return;
		}
		if (response.status === 403) {
			return;
		}
		if (!response.ok) {
			console.warn('Could not load trash info:', response.status);
			return;
		}

		const data = await response.json();
		const trashInfo = document.getElementById('trashInfo');
		if (trashInfo && data.total !== undefined) {
			if (data.total > 0) {
				trashInfo.textContent = `Permanently delete all ${data.total} events currently in the trash. This action cannot be undone.`;
			} else {
				trashInfo.textContent = 'Permanently delete all events currently in the trash. This action cannot be undone.';
			}
		}
	} catch (error) {
		console.warn('Error loading trash info:', error);
		// Don't show error to user, just leave default text
	}
}

async function openSettingsModal() {
	const existing = document.querySelector('.confirm-modal-backdrop.settings-backdrop');
	if (existing) {
		return;
	}

	// Check user role to determine if admin-only sections should be shown
	// Reuse cached auth data if available to avoid redundant API call
	let userRole = 'basic';
	try {
		let authData = null;
		if (window.__cachedAuthData) {
			authData = window.__cachedAuthData;
		} else {
			const authResponse = await fetch('/api/auth/status', {
				credentials: 'include'
			});
			if (authResponse.ok) {
				authData = await authResponse.json();
				// Cache for future use
				window.__cachedAuthData = authData;
			} else {
			}
		}
		if (authData) {
			userRole = authData.role || 'basic';
		} else {
		}
	} catch (error) {
		console.error('[TRACE] openSettingsModal: Error checking auth status:', error);
	}

	const isAdministrator = userRole === 'administrator' || userRole === 'god';
	const isGod = userRole === 'god';
	const canDeleteAllEvents = userRole === 'advanced' || userRole === 'administrator' || userRole === 'god';
	const usersLoadingRow = `
      <tr>
        <td colspan="4" class="settings-users-empty">
          <div class="settings-users-loading" role="status" aria-live="polite">
            <span class="settings-users-spinner" aria-hidden="true"></span>
            <span class="settings-users-loading-text">Loading users...</span>
          </div>
        </td>
      </tr>
    `;

	const backdrop = document.createElement('div');
	backdrop.className = 'confirm-modal-backdrop settings-backdrop';

	const modal = document.createElement('div');
	modal.className = 'settings-modal';

	// Get current settings
	const savedTheme = localStorage.getItem('theme') || 'light';
	const isDarkTheme = savedTheme === 'dark';
	const autoRefreshInterval = localStorage.getItem('autoRefreshIntervalMinutes') || '';

	const sidebarNav = `
    <a href="#settings-general" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-[color:var(--text-primary)] hover:text-[color:var(--text-primary)] hover:bg-(--bg-secondary)">
      <span class="w-5 h-5 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      </span>
      <span>General</span>
    </a>
    ${isAdministrator ? `
    <a href="#settings-users" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-(--text-primary) hover:text-(--text-primary) hover:bg-(--bg-secondary)">
      <span class="w-5 h-5 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        </svg>
      </span>
      <span>Users</span>
    </a>
    ` : ''}
    ${isAdministrator ? `
    <a href="#settings-import-export" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-[color:var(--text-primary)] hover:text-(--text-primary) hover:bg-[color:var(--bg-secondary)]">
      <span class="w-5 h-5 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>
      </span>
      <span>Database</span>
    </a>
    ` : ''}
    ${isGod ? `
    <a href="#settings-login-history" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-[color:var(--text-primary)] hover:text-(--text-primary) hover:bg-[color:var(--bg-secondary)]">
      <span class="w-5 h-5 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
        </svg>
      </span>
      <span>Login history</span>
    </a>
    ` : ''}
    <a href="#settings-danger" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-[color:var(--text-primary)] hover:text-(--text-primary) hover:bg-(--bg-secondary)">
      <span class="w-5 h-5 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.25-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z" />
        </svg>
      </span>
      <span>Danger zone</span>
    </a>
  `;

	modal.innerHTML = `
		<div class="settings-modal-header">
		</div>
			<div class="settings-layout flex flex-col md:flex-row md:gap-8 mt-2 flex-1 overflow-hidden">
				<aside class="settings-sidebar-nav md:w-44 border-b md:border-b-0 md:border-r border-(--border-color) pb-3 md:pb-0 md:pr-3">
					<nav class="flex md:flex-col gap-2 text-sm" aria-label="Settings sections">
						${sidebarNav}
					</nav>
				</aside>
				<div class="settings-main flex-1 flex flex-col gap-4 mt-3 md:mt-0">
            <section id="settings-general" class="settings-section">
              <div class="settings-modal-placeholder-title">General</div>
							<label class="flex items-center justify-between cursor-pointer py-2">
								<div class="flex flex-col">
									<span class="settings-toggle-title">Dark theme</span>
									<span class="text-xs text-(--text-primary)">Switch between light and dark color scheme.</span>
								</div>
								<div class="group relative inline-flex w-11 shrink-0 rounded-full bg-gray-200 p-0.5 inset-ring inset-ring-gray-900/5 outline-offset-2 outline-indigo-600 transition-colors duration-200 ease-in-out has-checked:bg-indigo-600 has-focus-visible:outline-2">
									<span class="size-5 rounded-full bg-white shadow-xs ring-1 ring-gray-900/5 transition-transform duration-200 ease-in-out group-has-checked:translate-x-5"></span>
									<input type="checkbox" id="darkThemeToggle" ${isDarkTheme ? 'checked' : ''} aria-label="Dark theme" class="absolute inset-0 appearance-none focus:outline-hidden">
								</div>
							</label>
							<div class="settings-toggle-row" style="margin-top: 16px;">
								<div class="settings-toggle-text" style="flex: 1;">
									<div class="settings-toggle-title">Automatic refresh</div>
									<div class="settings-toggle-description">
										Automatically refresh the events list at the specified interval.
									</div>
								</div>
								<div style="display: flex; align-items: center; gap: 8px;">
									<div class="relative">
										<select id="autoRefreshInterval" name="autoRefreshInterval"
											class="block w-full appearance-none rounded-md bg-white dark:bg-white/5 py-1.5 pr-12 pl-3 text-base text-gray-900 dark:text-white outline-1 -outline-offset-1 outline-gray-300 dark:outline-white/10 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 dark:focus:outline-indigo-500 sm:text-sm/6">
											<option value="" ${autoRefreshInterval === '' ? 'selected' : ''}>Off</option>
											<option value="3" ${autoRefreshInterval === '3' ? 'selected' : ''}>3 minutes</option>
											<option value="5" ${autoRefreshInterval === '5' ? 'selected' : ''}>5 minutes</option>
											<option value="10" ${autoRefreshInterval === '10' ? 'selected' : ''}>10 minutes</option>
											<option value="15" ${autoRefreshInterval === '15' ? 'selected' : ''}>15 minutes</option>
										</select>
										<div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
											<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="size-5 text-gray-400">
												<path d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
											</svg>
										</div>
									</div>
								</div>
							</div>
						</section>
						${isAdministrator ? `
						<section id="settings-users" class="settings-section settings-users-section" style="display: none;">
							<div class="settings-modal-placeholder-title">
								<div style="display: flex; justify-content: space-between; align-items: center;">
									<div>User Management</div>
									<div>
										<button type="button" class="btn" id="addUserBtn">
											<i class="fa-solid fa-plus"></i>
											Add User
										</button>
									</div>
								</div>
							</div>

							<div class="settings-users-table-wrapper">
								<table id="usersTable" class="settings-users-table" style="min-width: 600px;">
									<thead>
										<tr>
											<th>Username</th>
											<th>Created</th>
											<th>Last Login</th>
											<th class="settings-users-actions-column">Actions</th>
										</tr>
									</thead>
									<div class="table-body-scroll">
										<tbody id="usersTableBody">
											${usersLoadingRow}
										</tbody>
									</div>
								</table>
							</div>
							<div id="userFormContainer" class="settings-users-inline-form" style="display: none;"></div>
						</section>
						` : ''}
						${isAdministrator ? `
						<section id="settings-import-export" class="settings-section" style="display: none;">
							<div class="settings-modal-placeholder-title">Import/Export</div>
							<div class="settings-modal-placeholder-text">
								<div class="settings-toggle-row" style="flex-direction: column; align-items: flex-start; justify-content: flex-start;">
									<div class="settings-toggle-text">
										<div class="settings-toggle-title">Export database</div>
										<div class="settings-toggle-description">
											Download a complete backup of the database as a JSON file. This includes all telemetry events, users, teams, organizations, and settings.
										</div>
									</div>
									<div class="settings-toggle-actions" style="display: flex; width: 100%; justify-content: flex-start;">
										<button type="button" class="btn" id="exportDatabaseBtn">
											<i class="fa-solid fa-download"></i>
											Export database
										</button>
									</div>
								</div>
								<div class="settings-toggle-row" style="flex-direction: column; align-items: flex-start; justify-content: flex-start; margin-top: 8px;">
									<div class="settings-toggle-text">
										<div class="settings-toggle-title">Import database</div>
										<div class="settings-toggle-description">
											Import data from a previously exported database JSON file. This will merge the imported data with the existing database. Existing records with the same ID will be replaced.
										</div>
									</div>
									<div class="settings-toggle-actions" style="display: flex; width: 100%; justify-content: flex-start;">
										<input type="file" id="importDatabaseInput" accept=".json" style="display: none;">
										<button type="button" class="btn" id="importDatabaseBtn">
											<i class="fa-solid fa-upload"></i>
											Import database
										</button>
									</div>
								</div>
								<div id="importProgressContainer" style="display: none; margin-top: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 6px;">
									<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
										<span class="settings-users-spinner" style="width: 16px; height: 16px;"></span>
										<span id="importProgressText" style="font-size: 14px; color: var(--text-primary);">Importing database...</span>
									</div>
									<div style="width: 100%; height: 4px; background: var(--border-color); border-radius: 2px; overflow: hidden;">
										<div id="importProgressBar" style="width: 0%; height: 100%; background: var(--color-primary); transition: width 0.3s ease;"></div>
									</div>
								</div>
							</div>
						</section>
						` : ''}
						${isGod ? `
						<section id="settings-login-history" class="settings-section" style="display: none;">
							<div class="settings-modal-placeholder-title">Login history</div>
							<div class="mt-4">
								<div class="overflow-x-auto overflow-y-auto max-h-96 border border-gray-300 rounded-md">
									<table id="loginHistoryTable" class="min-w-full border-separate border-spacing-0">
												<thead>
													<tr>
														<th scope="col" class="sticky top-0 z-10 border-b border-gray-300 bg-white/75 py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-gray-900 backdrop-blur-sm backdrop-filter dark:bg-gray-800/75 dark:text-gray-100">Username</th>
														<th scope="col" class="sticky top-0 z-10 border-b border-gray-300 bg-white/75 px-3 py-3.5 text-left text-sm font-semibold text-gray-900 backdrop-blur-sm backdrop-filter dark:bg-gray-800/75 dark:text-gray-100">IP Address</th>
														<th scope="col" class="sticky top-0 z-10 border-b border-gray-300 bg-white/75 px-3 py-3.5 text-left text-sm font-semibold text-gray-900 backdrop-blur-sm backdrop-filter dark:bg-gray-800/75 dark:text-gray-100">User Agent</th>
														<th scope="col" class="sticky top-0 z-10 border-b border-gray-300 bg-white/75 px-3 py-3.5 text-left text-sm font-semibold text-gray-900 backdrop-blur-sm backdrop-filter dark:bg-gray-800/75 dark:text-gray-100">Status</th>
														<th scope="col" class="sticky top-0 z-10 border-b border-gray-300 bg-white/75 px-3 py-3.5 text-left text-sm font-semibold text-gray-900 backdrop-blur-sm backdrop-filter dark:bg-gray-800/75 dark:text-gray-100">Time</th>
														<th scope="col" class="sticky top-0 z-10 border-b border-gray-300 bg-white/75 py-3.5 pr-4 pl-3 text-left text-sm font-semibold text-gray-900 backdrop-blur-sm backdrop-filter dark:bg-gray-800/75 dark:text-gray-100">Error</th>
													</tr>
												</thead>
												<tbody id="loginHistoryTableBody">
												<tr>
													<td colspan="6" class="border-b border-gray-200 py-4 px-4 text-center text-sm text-gray-500">
														<div class="settings-users-loading" role="status" aria-live="polite">
															<span class="settings-users-spinner" aria-hidden="true"></span>
															<span class="settings-users-loading-text">Loading login history...</span>
														</div>
													</td>
												</tr>
												</tbody>
											</table>
										</div>
									</div>
						</section>
						` : ''}
						<section id="settings-danger" class="settings-danger-section">
							<div class="settings-modal-placeholder-title">Danger zone</div>
							<div class="settings-modal-placeholder-text">
								<div class="settings-toggle-row" style="align-items: flex-start;">
									<div class="settings-toggle-text">
										<div class="settings-toggle-title">Clear local data</div>
										<div class="settings-toggle-description">
											Remove all local preferences and cached data stored in this browser for the telemetry dashboard (theme, filters, mappings, etc.).
										</div>
									</div>
								<div class="settings-toggle-actions">
									<button type="button" class="btn" id="clearLocalDataBtn">
										<i class="fa-solid fa-broom"></i>
										Clear local data
									</button>
								</div>
								</div>
								<div class="settings-toggle-row" style="align-items: flex-start; margin-top: 8px;">
									<div class="settings-toggle-text">
										<div class="settings-toggle-title">Delete all events</div>
										<div class="settings-toggle-description">
											Move all telemetry events to trash. Events can be restored or permanently deleted later.
										</div>
									</div>
                <div class="settings-toggle-actions">
                  ${canDeleteAllEvents ? `
                    <button type="button" class="btn" id="deleteAllEventsBtn">
                      <i class="fa-solid fa-trash-can"></i>
                      Delete all events
                    </button>
                  ` : `
                    <div class="settings-toggle-description">Only advanced or administrator users can delete all events.</div>
                  `}
                </div>
								</div>
								<div class="settings-toggle-row" style="align-items: flex-start; margin-top: 8px;">
									<div class="settings-toggle-text">
										<div class="settings-toggle-title">Empty trash</div>
										<div class="settings-toggle-description" id="trashInfo">
											Permanently delete all events currently in the trash. This action cannot be undone.
										</div>
									</div>
                <div class="settings-toggle-actions">
                  ${canDeleteAllEvents ? `
                    <button type="button" class="btn" id="emptyTrashBtn">
                      <i class="fa-solid fa-dumpster-fire"></i>
                      Empty trash
                    </button>
                  ` : `
                    <div class="settings-toggle-description">Only advanced or administrator users can empty trash.</div>
                  `}
                </div>
								</div>
							</div>
						</section>
					</div>
				</div>
		<div class="settings-modal-footer">
			<div class="confirm-modal-actions">
				<button type="button" class="btn" id="settingsCloseBtn">
					Close
				</button>
			</div>
		</div>
	`;

	backdrop.appendChild(modal);

	// Inject custom styles for table scrolling
	if (!document.querySelector('#settings-modal-custom-styles')) {
		const styleElement = document.createElement('div');
		styleElement.id = 'settings-modal-custom-styles';
		styleElement.innerHTML = settingsModalStyles;
		document.head.appendChild(styleElement);
	} else {
	}

	document.body.appendChild(backdrop);

	requestAnimationFrame(() => {
		backdrop.classList.add('visible');
	});

	// Define closeSettingsModal function
	function closeSettingsModal() {

		backdrop.classList.remove('visible');
		backdrop.classList.add('hiding');
		const handleTransitionEnd = () => {
			backdrop.removeEventListener('transitionend', handleTransitionEnd);
			backdrop.remove();
		};
		backdrop.addEventListener('transitionend', handleTransitionEnd);
		setTimeout(() => {
			if (document.body.contains(backdrop)) {
				backdrop.removeEventListener('transitionend', handleTransitionEnd);
				backdrop.remove();
			}
		}, 220);
	}

	const closeBtn = modal.querySelector('#settingsCloseBtn');
	if (closeBtn) {
		closeBtn.addEventListener('click', closeSettingsModal);
	}

	// ESC key handling is configured via `escHandler` earlier; no additional listener needed here.
	const darkThemeToggle = modal.querySelector('#darkThemeToggle');
	if (darkThemeToggle) {
		darkThemeToggle.addEventListener('change', (e) => {
			const newTheme = e.target.checked ? 'dark' : 'light';
			localStorage.setItem('theme', newTheme);

			// Apply theme directly
			if (newTheme === 'dark') {
				document.documentElement.classList.add('dark');
			} else {
				document.documentElement.classList.remove('dark');
			}

			// Update theme menu item if it exists
			if (typeof window.updateThemeMenuItem === 'function') {
				window.updateThemeMenuItem(newTheme);
			} else {
			}
		});
	}

	const autoRefreshIntervalSelect = modal.querySelector('#autoRefreshInterval');
	if (autoRefreshIntervalSelect) {
		const handleAutoRefreshChange = (e) => {
			const interval = (e.target.value || '').trim();

			// Store in localStorage for persistence
			localStorage.setItem('autoRefreshIntervalMinutes', interval);
			localStorage.setItem('autoRefreshEnabledState', interval !== '' ? 'true' : 'false');

			// Update global variables if they exist (for backward compatibility)
			if (typeof window.autoRefreshIntervalMinutes !== 'undefined') {
				window.autoRefreshIntervalMinutes = interval;
			}
			if (typeof window.autoRefreshEnabledState !== 'undefined') {
				window.autoRefreshEnabledState = interval !== '';
			}

			// Notify page of auto-refresh change if callback exists
			if (typeof window.onAutoRefreshChanged === 'function') {
				window.onAutoRefreshChanged(interval !== '', interval);
			}
		};

		autoRefreshIntervalSelect.addEventListener('change', handleAutoRefreshChange);
	}

	// Navigation between settings sections
	const sidebarLinks = modal.querySelectorAll('.settings-sidebar-link');
	const sections = modal.querySelectorAll('.settings-section, .settings-danger-section');

	function showSection(sectionId) {
		sections.forEach(section => {
			section.style.display = 'none';
		});
		const targetSection = modal.querySelector(sectionId);
		if (targetSection) {
			targetSection.style.display = 'block';
		}

		// Adjust modal size based on section
		if (sectionId === '#settings-login-history') {
			modal.className = 'settings-modal settings-modal-wide';
		} else {
			modal.className = 'settings-modal';
		}

		sidebarLinks.forEach(link => {
			link.classList.remove('active');
			if (link.getAttribute('href') === sectionId) {
				link.classList.add('active');
			}
		});
	}

	sidebarLinks.forEach(link => {
		link.addEventListener('click', (e) => {
			e.preventDefault();
			const sectionId = link.getAttribute('href');
			showSection(sectionId);
		});
	});

	if (sidebarLinks.length > 0) {
		const firstSectionId = sidebarLinks[0].getAttribute('href');
		showSection(firstSectionId);
	}

	// Users section functionality
	if (isAdministrator) {
		const usersSection = modal.querySelector('#settings-users');
		if (usersSection) {
			const usersTableBody = modal.querySelector('#usersTableBody');
			const addUserBtn = modal.querySelector('#addUserBtn');
			const userFormContainer = modal.querySelector('#userFormContainer');

			function closeUserForm() {
				if (!userFormContainer) {return;}
				userFormContainer.innerHTML = '';
				userFormContainer.style.display = 'none';
			}

			function renderUserForm({title, description, fieldsHtml, submitLabel, onSubmit}) {
				if (!userFormContainer) {return;}

				userFormContainer.innerHTML = `
            <div class="settings-users-form-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <div class="settings-modal-placeholder-title" style="margin: 0;">${title}</div>
              <button type="button" class="btn" data-action="cancel-user-form" style="padding: 6px 10px;">
                Close
              </button>
            </div>
            ${description ? `<p class="settings-modal-placeholder-text" style="margin-top: 6px; margin-bottom: 4px;">${description}</p>` : ''}
            <form class="settings-users-form" style="display: flex; flex-direction: column; gap: 12px; margin-top: 10px;">
              ${fieldsHtml}
              <div class="settings-users-form-error" style="color: #dc2626; font-size: 13px; display: none;"></div>
              <div class="confirm-modal-actions">
                <button type="button" class="btn" data-action="cancel-user-form">
                  Cancel
                </button>
                <button type="submit" class="btn">
                  ${submitLabel}
                </button>
              </div>
            </form>
          `;
				userFormContainer.style.display = 'block';

				const form = userFormContainer.querySelector('form');
				const errorDiv = userFormContainer.querySelector('.settings-users-form-error');
				const cancelButtons = userFormContainer.querySelectorAll('[data-action="cancel-user-form"]');

				const setError = (message) => {
					if (!errorDiv) {return;}
					if (!message) {
						errorDiv.textContent = '';
						errorDiv.style.display = 'none';
						return;
					}
					if (typeof window.showToast === 'function') {
						window.showToast(message, 'error');
						errorDiv.textContent = '';
						errorDiv.style.display = 'none';
						return;
					}
					errorDiv.textContent = message;
					errorDiv.style.display = 'block';
				};

				cancelButtons.forEach((button) => {
					button.addEventListener('click', () => {
						closeUserForm();
					});
				});

				if (form) {
					form.addEventListener('submit', async (e) => {
						e.preventDefault();
						setError('');
						try {
							const formData = new window.FormData(form);
							await onSubmit(formData, setError);
						} catch (error) {
							setError(error.message || 'Operation failed');
						}
					});
				}

				userFormContainer.scrollIntoView({behavior: 'smooth', block: 'start'});
			}

			async function loadUsers() {
				if (usersTableBody) {
					usersTableBody.innerHTML = usersLoadingRow;
				}
				try {
					const response = await fetch('/api/users', {
						credentials: 'include'
					});
					if (response.status === 401) {
						window.location.href = '/login';
						return;
					}
					if (!response.ok) {
						throw new Error(`HTTP error! status: ${response.status}`);
					}
					const data = await response.json();
					await renderUsers(data.users || []);
				} catch (error) {
					console.error('Error loading users:', error);
					if (typeof window.showToast === 'function') {
						window.showToast(`Error loading users: ${error.message}`, 'error');
					}
					await renderUsers([]);
				}
			}

			function formatDate(dateString) {
				if (!dateString) {return '-';}
				const date = new Date(dateString);

				// Format: DD/MM/YY HH24:MM
				const day = date.getDate().toString().padStart(2, '0');
				const month = (date.getMonth() + 1).toString().padStart(2, '0');
				const year = date.getFullYear().toString().slice(-2); // Last 2 digits of year
				const hours = date.getHours().toString().padStart(2, '0');
				const minutes = date.getMinutes().toString().padStart(2, '0');

				return `${day}/${month}/${year} ${hours}:${minutes}`;
			}

			function getRoleBadgeClasses(role) {
				const isDark = localStorage.getItem('theme') === 'dark';
				switch (role) {
				case 'administrator':
					return isDark? 'inline-flex items-center rounded-md bg-red-400/10 px-1.5 py-0.5 text-xs font-medium text-red-400 inset-ring inset-ring-red-400/20': 'inline-flex items-center rounded-md bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 inset-ring inset-ring-red-600/10';
				case 'advanced':
					return isDark? 'inline-flex items-center rounded-md bg-blue-400/10 px-1.5 py-0.5 text-xs font-medium text-blue-400 inset-ring inset-ring-blue-400/30': 'inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 inset-ring inset-ring-blue-700/10';
				case 'basic':
					return isDark? 'inline-flex items-center rounded-md bg-green-400/10 px-1.5 py-0.5 text-xs font-medium text-green-400 inset-ring inset-ring-green-500/20': 'inline-flex items-center rounded-md bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-700 inset-ring inset-ring-green-600/20';
				default:
					return isDark? 'inline-flex items-center rounded-md bg-gray-400/10 px-1.5 py-0.5 text-xs font-medium text-gray-400 inset-ring inset-ring-gray-400/20': 'inline-flex items-center rounded-md bg-gray-50 px-1.5 py-0.5 text-xs font-medium text-gray-600 inset-ring inset-ring-gray-500/10';
				}
			}

			function openCreateUserForm() {
				renderUserForm({
					title: 'Create New User',
					description: 'Add a user to access the telemetry UI.',
					submitLabel: 'Create User',
					fieldsHtml: `
              <div>
                <label class="settings-modal-placeholder-text" style="display: block; margin-bottom: 6px;">
                  Username
                  <input type="text" name="username" required
                    style="margin-top: 4px; width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 14px;"
                    placeholder="Enter username">
                </label>
              </div>
              <div>
                <label class="settings-modal-placeholder-text" style="display: block; margin-bottom: 6px;">
                  Password
                  <input type="password" name="password" required
                    style="margin-top: 4px; width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 14px;"
                    placeholder="Enter password">
                </label>
              </div>
              <div>
                <label class="settings-modal-placeholder-text" style="display: block; margin-bottom: 6px;">
                  Role
                  <div class="relative" style="margin-top: 4px;">
                    <select id="createUserRole" name="role"
                      class="block w-full appearance-none rounded-md bg-white dark:bg-white/5 py-1.5 pr-12 pl-3 text-base text-gray-900 dark:text-white outline-1 -outline-offset-1 outline-gray-300 dark:outline-white/10 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 dark:focus:outline-indigo-500 sm:text-sm/6">
                      <option value="basic" selected>Basic</option>
                      <option value="advanced">Advanced</option>
                      <option value="administrator">Administrator</option>
                      ${isGod ? '<option value="god">God</option>' : ''}
                    </select>
                    <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="size-5 text-gray-400">
                        <path d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
                      </svg>
                    </div>
                  </div>
                </label>
              </div>
            `,
					onSubmit: async (formData, setError) => {
						const username = (formData.get('username') || '').trim();
						const password = formData.get('password') || '';
						const role = formData.get('role') || 'basic';

						if (!username || !password) {
							setError('Username and password are required');
							return;
						}

						const response = await fetch('/api/users', {
							method: 'POST',
							headers: window.getRequestHeaders(true),
							credentials: 'include',
							body: JSON.stringify({username, password, role})
						});

						const data = await response.json();
						if (!response.ok) {
							throw new Error(data.message || 'Failed to create user');
						}

						closeUserForm();
						await loadUsers();
					}
				});
			}

			function openEditPasswordForm(username) {
				renderUserForm({
					title: 'Change Password',
					description: `Change password for user: <strong>${escapeHtml(username)}</strong>`,
					submitLabel: 'Update Password',
					fieldsHtml: `
              <div>
                <label class="settings-modal-placeholder-text" style="display: block; margin-bottom: 6px;">
                  New Password
                  <input type="password" name="password" required
                    style="margin-top: 4px; width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 14px;"
                    placeholder="Enter new password">
                </label>
              </div>
            `,
					onSubmit: async (formData, setError) => {
						const password = formData.get('password') || '';
						if (!password) {
							setError('Password is required');
							return;
						}

						const response = await fetch(`/api/users/${encodeURIComponent(username)}/password`, {
							method: 'PUT',
							headers: window.getRequestHeaders(true),
							credentials: 'include',
							body: JSON.stringify({password})
						});

						const data = await response.json();
						if (!response.ok) {
							throw new Error(data.message || 'Failed to update password');
						}

						closeUserForm();
						await loadUsers();
					}
				});
			}

			function openEditRoleForm(username, currentRole) {
				renderUserForm({
					title: 'Change Role',
					description: `Change role for user: <strong>${escapeHtml(username)}</strong>`,
					submitLabel: 'Update Role',
					fieldsHtml: `
              <div>
                <label class="settings-modal-placeholder-text" style="display: block; margin-bottom: 6px;">
                  Role
                  <div class="relative" style="margin-top: 4px;">
                    <select id="editUserRole" name="role"
                      class="block w-full appearance-none rounded-md bg-white dark:bg-white/5 py-1.5 pr-12 pl-3 text-base text-gray-900 dark:text-white outline-1 -outline-offset-1 outline-gray-300 dark:outline-white/10 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 dark:focus:outline-indigo-500 sm:text-sm/6">
                      <option value="basic" ${currentRole === 'basic' ? 'selected' : ''}>Basic</option>
                      <option value="advanced" ${currentRole === 'advanced' ? 'selected' : ''}>Advanced</option>
                      <option value="administrator" ${currentRole === 'administrator' ? 'selected' : ''}>Administrator</option>
                      ${isGod ? `<option value="god" ${currentRole === 'god' ? 'selected' : ''}>God</option>` : ''}
                    </select>
                    <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="size-5 text-gray-400">
                        <path d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
                      </svg>
                    </div>
                  </div>
                </label>
              </div>
            `,
					onSubmit: async (formData, setError) => {
						const role = formData.get('role') || '';
						if (!role) {
							setError('Role is required');
							return;
						}

						const response = await fetch(`/api/users/${encodeURIComponent(username)}/role`, {
							method: 'PUT',
							headers: window.getRequestHeaders(true),
							credentials: 'include',
							body: JSON.stringify({role})
						});

						const data = await response.json();
						if (!response.ok) {
							throw new Error(data.message || 'Failed to update role');
						}

						closeUserForm();
						await loadUsers();
					}
				});
			}

			async function handleDeleteUser(username) {
				const confirmed = await window.openConfirmModal({
					title: 'Delete User',
					message: `Are you sure you want to delete user "${escapeHtml(username)}"? This action cannot be undone.`,
					confirmLabel: 'Delete User',
					destructive: true
				});

				if (!confirmed) {
					return;
				}

				try {
					const response = await fetch(`/api/users/${encodeURIComponent(username)}`, {
						method: 'DELETE',
						headers: window.getRequestHeaders(false),
						credentials: 'include'
					});
					const data = await response.json();
					if (data.status === 'ok') {
						await loadUsers();
					} else {
						throw new Error(data.message || 'Failed to delete user');
					}
				} catch (error) {
					console.error('Error deleting user:', error);
					showToast(`Error deleting user: ${  error.message}`, 'error');
				}
			}

			async function renderUsers(users) {
				if (!usersTableBody) {return;}

				if (!users || users.length === 0) {
					usersTableBody.innerHTML = `
            <tr>
              <td colspan="4" class="settings-users-empty">No users found</td>
            </tr>
          `;
					return;
				}

				usersTableBody.innerHTML = users.map(user => {
					const roleBadgeClasses = getRoleBadgeClasses(user.role);
					return `
            <tr>
              <td>
                <div style="display: flex; flex-direction: column; gap: 4px;">
                  <span style="font-weight: 500;">${escapeHtml(user.username)}</span>
                  <span class="${roleBadgeClasses}" style="width: fit-content;">
                    ${escapeHtml(user.role)}
                  </span>
                </div>
              </td>
              <td>${formatDate(user.created_at)}</td>
              <td>${formatDate(user.last_login)}</td>
              <td class="settings-users-actions-cell">
                <div class="settings-users-actions">
                  <button type="button" class="settings-users-action-btn" data-action="edit-password" data-username="${escapeHtml(user.username)}" title="Change password">
                    <i class="fa-solid fa-key"></i>
                  </button>
                  <button type="button" class="settings-users-action-btn" data-action="edit-role" data-username="${escapeHtml(user.username)}" data-role="${escapeHtml(user.role)}" title="Change role">
                    <i class="fa-solid fa-user-tag"></i>
                  </button>
                  <button type="button" class="settings-users-action-btn settings-users-action-btn-danger" data-action="delete" data-username="${escapeHtml(user.username)}" title="Delete user">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>
              </td>
            </tr>
          `;
				}).join('');

				const actionButtons = usersTableBody.querySelectorAll('.settings-users-action-btn');
				actionButtons.forEach(button => {
					button.addEventListener('click', () => {
						const action = button.dataset.action;
						const username = button.dataset.username;

						if (action === 'edit-password') {
							openEditPasswordForm(username);
						} else if (action === 'edit-role') {
							const currentRole = button.dataset.role;
							openEditRoleForm(username, currentRole);
						} else if (action === 'delete') {
							handleDeleteUser(username);
						}
					});
				});
			}

			if (addUserBtn) {
				addUserBtn.addEventListener('click', () => {
					openCreateUserForm();
				});
			}

			loadUsers();
		}
	}

	// Login history functionality (God only)
	if (isGod) {
		async function loadLoginHistory() {
			const tableBody = modal.querySelector('#loginHistoryTableBody');
			const refreshBtn = modal.querySelector('#refreshLoginHistoryBtn');

			if (!tableBody) {return;}

			try {
				if (refreshBtn) {
					refreshBtn.disabled = true;
					refreshBtn.innerHTML = '<span class="settings-users-spinner" style="width: 14px; height: 14px; margin-right: 6px;"></span>Loading...';
				}

				const response = await fetch('/api/user-login-logs?limit=50', {
					method: 'GET',
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-Token': await window.getCsrfToken()
					},
					credentials: 'include'
				});

				if (!response.ok) {
					const error = await response.json();
					throw new Error(error.message || 'Failed to load login history');
				}

				const data = await response.json();

				if (data.logs && data.logs.length > 0) {
					const rows = data.logs.map(log => {
						const timestamp = new Date(log.created_at).toLocaleString();
						const statusClass = log.successful ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
						const statusText = log.successful ? 'Success' : 'Failed';
						const errorText = log.error_message ? escapeHtml(log.error_message) : '';

						return `
							<tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
								<td class="border-b border-gray-200 py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-gray-900 dark:text-gray-100">${escapeHtml(log.username)}</td>
								<td class="border-b border-gray-200 px-3 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400 font-mono">${escapeHtml(log.ip_address || 'N/A')}</td>
								<td class="border-b border-gray-200 px-3 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate" title="${escapeHtml(log.user_agent || '')}">${escapeHtml(log.user_agent || 'N/A')}</td>
								<td class="border-b border-gray-200 px-3 py-4 text-sm whitespace-nowrap ${statusClass} font-medium">${statusText}</td>
								<td class="border-b border-gray-200 px-3 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">${timestamp}</td>
								<td class="border-b border-gray-200 py-4 pr-4 pl-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate" title="${escapeHtml(log.error_message || '')}">${errorText}</td>
							</tr>
						`;
					}).join('');

					tableBody.innerHTML = rows;
				} else {
					tableBody.innerHTML = `
						<tr>
							<td colspan="6" class="border-b border-gray-200 py-8 px-4 text-center text-sm text-gray-500">
								<div class="settings-users-empty-content">
									<i class="fa-solid fa-clock-rotate-left settings-users-empty-icon"></i>
									<div class="settings-users-empty-title">No login history</div>
									<div class="settings-users-empty-subtitle">Login attempts will appear here</div>
								</div>
							</td>
						</tr>
					`;
				}

			} catch (error) {
				console.error('Error loading login history:', error);
				if (typeof window.showToast === 'function') {
					window.showToast(`Failed to load login history: ${error.message}`, 'error');
				}
				tableBody.innerHTML = `
					<tr>
						<td colspan="6" class="border-b border-gray-200 py-8 px-4 text-center text-sm text-gray-500">
							<div class="settings-users-empty-content">
								<i class="fa-solid fa-clock-rotate-left settings-users-empty-icon"></i>
								<div class="settings-users-empty-title">No login history</div>
								<div class="settings-users-empty-subtitle">Login attempts will appear here</div>
							</div>
						</td>
					</tr>
				`;
			} finally {
				if (refreshBtn) {
					refreshBtn.disabled = false;
					refreshBtn.innerHTML = '<i class="fa-solid fa-refresh"></i> Refresh';
				}
			}
		}

		const refreshLoginHistoryBtn = modal.querySelector('#refreshLoginHistoryBtn');
		if (refreshLoginHistoryBtn) {
			refreshLoginHistoryBtn.addEventListener('click', () => {
				loadLoginHistory();
			});
		}

		loadLoginHistory();
	}

	// Import/Export functionality
	if (isAdministrator) {
		const exportDatabaseBtn = modal.querySelector('#exportDatabaseBtn');
		if (exportDatabaseBtn) {
			exportDatabaseBtn.addEventListener('click', async () => {
				try {
					exportDatabaseBtn.disabled = true;
					exportDatabaseBtn.innerHTML = '<span class="settings-users-spinner" style="width: 14px; height: 14px; margin-right: 6px;"></span>Exporting...';

					const response = await fetch('/api/database/export', {
						method: 'GET',
						headers: {
							'Content-Type': 'application/json',
							'X-CSRF-Token': await window.getCsrfToken()
						},
						credentials: 'include'
					});

					if (!response.ok) {
						const error = await response.json();
						throw new Error(error.message || 'Failed to export database');
					}

					const blob = await response.blob();
					const url = window.URL.createObjectURL(blob);
					const a = document.createElement('a');
					a.href = url;
					a.download = `database-export-${new Date().toISOString().split('T')[0]}.json`;
					document.body.appendChild(a);
					a.click();
					window.URL.revokeObjectURL(url);
					document.body.removeChild(a);

					if (typeof window.showToast === 'function') {
						window.showToast('Database exported successfully', 'success');
					}
				} catch (error) {
					console.error('Error exporting database:', error);
					if (typeof window.showToast === 'function') {
						window.showToast(`Failed to export database: ${  error.message}`, 'error');
					}
				} finally {
					exportDatabaseBtn.disabled = false;
					exportDatabaseBtn.innerHTML = '<i class="fa-solid fa-download" style="margin-right: 6px;"></i>Export database';
				}
			});
		}

		const importDatabaseBtn = modal.querySelector('#importDatabaseBtn');
		const importDatabaseInput = modal.querySelector('#importDatabaseInput');
		if (importDatabaseBtn && importDatabaseInput) {
			importDatabaseBtn.addEventListener('click', () => {
				importDatabaseInput.click();
			});

			importDatabaseInput.addEventListener('change', async (e) => {
				const file = e.target.files[0];
				if (!file) {return;}

				if (!file.name.endsWith('.json')) {
					if (typeof window.showToast === 'function') {
						window.showToast('Please select a valid JSON file', 'error');
					}
					importDatabaseInput.value = '';
					return;
				}

				try {
					const progressContainer = modal.querySelector('#importProgressContainer');
					const progressText = modal.querySelector('#importProgressText');
					const progressBar = modal.querySelector('#importProgressBar');

					progressContainer.style.display = 'block';
					progressText.textContent = 'Reading file...';
					progressBar.style.width = '10%';
					importDatabaseBtn.disabled = true;

					const fileContent = await file.text();
					let importData;
					try {
						importData = JSON.parse(fileContent);
					} catch (_parseError) {
						throw new Error('Invalid JSON file format');
					}

					progressText.textContent = 'Uploading to server...';
					progressBar.style.width = '30%';

					const response = await fetch('/api/database/import', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'X-CSRF-Token': await window.getCsrfToken()
						},
						credentials: 'include',
						body: JSON.stringify(importData)
					});

					progressBar.style.width = '60%';
					progressText.textContent = 'Processing import...';

					if (!response.ok) {
						const error = await response.json();
						throw new Error(error.message || 'Failed to import database');
					}

					const result = await response.json();
					progressBar.style.width = '100%';
					progressText.textContent = 'Import completed!';

					const errorMsg = result.errors && result.errors.length > 0? ` (${result.errors.length} errors)`: '';
					if (typeof window.showToast === 'function') {
						window.showToast(`Database imported successfully: ${result.imported} records imported${errorMsg}`, 'success');
					}

					if (result.errors && result.errors.length > 0) {
						console.warn('Import errors:', result.errors);
					}

					setTimeout(() => {
						progressContainer.style.display = 'none';
						progressBar.style.width = '0%';
					}, 2000);

					setTimeout(() => {
						window.location.reload();
					}, 2500);
				} catch (error) {
					console.error('Error importing database:', error);
					if (typeof window.showToast === 'function') {
						window.showToast(`Failed to import database: ${  error.message}`, 'error');
					}
					const progressContainer = modal.querySelector('#importProgressContainer');
					if (progressContainer) {
						progressContainer.style.display = 'none';
					}
				} finally {
					importDatabaseInput.value = '';
					importDatabaseBtn.disabled = false;
				}
			});
		}
	}

	// Danger zone functionality
	const clearLocalDataBtn = modal.querySelector('#clearLocalDataBtn');
	if (clearLocalDataBtn) {
		clearLocalDataBtn.addEventListener('click', () => {
			if (typeof window.clearLocalData === 'function') {
				window.clearLocalData();
			}
		});
	}

	const deleteAllEventsBtn = modal.querySelector('#deleteAllEventsBtn');
	if (deleteAllEventsBtn) {
		deleteAllEventsBtn.addEventListener('click', () => {
			confirmDeleteAll();
		});
	}

	const emptyTrashBtn = modal.querySelector('#emptyTrashBtn');
	if (emptyTrashBtn) {
		emptyTrashBtn.addEventListener('click', () => {
			confirmEmptyTrash();
		});
	}

	// Load trash info when settings modal opens (only for users with delete permissions)
	if (canDeleteAllEvents) {
		loadTrashInfo();
	}
}

// Export the openSettingsModal function for use by other modules
export {openSettingsModal};
