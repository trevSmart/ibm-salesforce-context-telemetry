/**
 * Settings Modal Module
 * Centralized implementation of the Settings modal
 * Used across all pages: Dashboard, Event Log, Teams
 */

// Utility function to escape HTML and prevent XSS
function escapeHtml(unsafe) {
	return String(unsafe)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
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
			}
		}
		if (authData) {
			userRole = authData.role || 'basic';
		}
	} catch (error) {
		console.error('Error checking auth status:', error);
	}

	const isAdministrator = userRole === 'administrator';
	const canDeleteAllEvents = userRole === 'advanced' || userRole === 'administrator';
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
	modal.className = 'confirm-modal settings-modal';

	// Get current settings
	const savedTheme = localStorage.getItem('theme') || 'light';
	const isDarkTheme = savedTheme === 'dark';
	const autoRefreshInterval = window.autoRefreshIntervalMinutes || '';

	const sidebarNav = `
    <a href="#settings-general" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-[color:var(--text-primary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-secondary)]">
      <span class="w-5 h-5 flex items-center justify-center rounded-full border border-(--border-color) bg-(--bg-secondary)">
        <i class="fa-solid fa-gear text-[12px]"></i>
      </span>
      <span class="font-medium">General</span>
    </a>
    ${isAdministrator ? `
    <a href="#settings-users" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-[color:var(--text-primary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-secondary)]">
      <span class="w-5 h-5 flex items-center justify-center rounded-full border border-[color:var(--border-color)] bg-[color:var(--bg-secondary)]">
        <i class="fa-solid fa-user-gear text-[12px]"></i>
      </span>
      <span class="font-medium">Users</span>
    </a>
    ` : ''}
    ${isAdministrator ? `
    <a href="#settings-import-export" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-[color:var(--text-primary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-secondary)]">
      <span class="w-5 h-5 flex items-center justify-center rounded-full border border-[color:var(--border-color)] bg-[color:var(--bg-secondary)]">
        <i class="fa-solid fa-database text-[12px]"></i>
      </span>
      <span class="font-medium">Import/Export</span>
    </a>
    ` : ''}
    <a href="#settings-danger" class="settings-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-[color:var(--text-primary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-secondary)]">
      <span class="w-5 h-5 flex items-center justify-center rounded-full border border-[color:var(--border-color)] bg-[color:var(--bg-secondary)]">
        <i class="fa-solid fa-triangle-exclamation text-[12px]"></i>
      </span>
      <span class="font-medium">Danger zone</span>
    </a>
  `;

	modal.innerHTML = `
		<div class="settings-modal-header">
			<div class="confirm-modal-title">Settings</div>
		</div>
		<div class="settings-modal-content">
			<div class="settings-layout flex flex-col md:flex-row md:gap-8 mt-2">
				<aside class="settings-sidebar-nav md:w-56 border-b md:border-b-0 md:border-r border-[color:var(--border-color)] pb-3 md:pb-0 md:pr-3">
					<nav class="flex md:flex-col gap-2 text-sm" aria-label="Settings sections">
						${sidebarNav}
					</nav>
				</aside>
				<div class="settings-main flex-1 flex flex-col gap-4 mt-3 md:mt-0">
            <section id="settings-general" class="settings-section">
              <div class="settings-modal-placeholder-title">General</div>
							<label class="flex items-center justify-between cursor-pointer py-2">
								<div class="flex flex-col">
									<span class="text-sm font-medium text-[color:var(--text-primary)]">Dark theme</span>
									<span class="text-xs text-[color:var(--text-primary)]">Switch between light and dark color scheme.</span>
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
									<select id="autoRefreshInterval" name="autoRefreshInterval"
										class="auto-refresh-interval block w-full rounded-md bg-white py-1.5 pr-3 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6">
										<option value="" ${autoRefreshInterval === '' ? 'selected' : ''}>Off</option>
										<option value="3" ${autoRefreshInterval === '3' ? 'selected' : ''}>3 minutes</option>
										<option value="5" ${autoRefreshInterval === '5' ? 'selected' : ''}>5 minutes</option>
										<option value="10" ${autoRefreshInterval === '10' ? 'selected' : ''}>10 minutes</option>
										<option value="15" ${autoRefreshInterval === '15' ? 'selected' : ''}>15 minutes</option>
									</select>
								</div>
							</div>
						</section>
						${isAdministrator ? `
						<section id="settings-users" class="settings-section settings-users-section" style="display: none;">
							<div class="settings-users-header">
								<div class="settings-modal-placeholder-title settings-users-title">User Management</div>
								<button type="button" class="confirm-modal-btn settings-users-add-btn" id="addUserBtn">
									<i class="fa-solid fa-plus"></i>
									Add User
								</button>
							</div>
							<div class="settings-users-table-wrapper">
								<table id="usersTable" class="settings-users-table">
									<thead>
										<tr>
											<th>Username</th>
											<th>Created</th>
											<th>Last Login</th>
											<th class="settings-users-actions-column">Actions</th>
										</tr>
									</thead>
									<tbody id="usersTableBody">
										${usersLoadingRow}
									</tbody>
								</table>
							</div>
							<div id="userFormContainer" class="settings-users-inline-form" style="display: none;"></div>
						</section>
						` : ''}
						${isAdministrator ? `
						<section id="settings-import-export" class="settings-section" style="display: none;">
							<div class="settings-modal-placeholder-title">Import/Export</div>
							<div class="settings-modal-placeholder-text">
								<div class="settings-toggle-row" style="align-items: flex-start;">
									<div class="settings-toggle-text">
										<div class="settings-toggle-title">Export database</div>
										<div class="settings-toggle-description">
											Download a complete backup of the database as a JSON file. This includes all telemetry events, users, teams, organizations, and settings.
										</div>
									</div>
									<div class="settings-toggle-actions">
										<button type="button" class="confirm-modal-btn" id="exportDatabaseBtn">
											<i class="fa-solid fa-download"></i>
											Export database
										</button>
									</div>
								</div>
								<div class="settings-toggle-row" style="align-items: flex-start; margin-top: 8px;">
									<div class="settings-toggle-text">
										<div class="settings-toggle-title">Import database</div>
										<div class="settings-toggle-description">
											Import data from a previously exported database JSON file. This will merge the imported data with the existing database. Existing records with the same ID will be replaced.
										</div>
									</div>
									<div class="settings-toggle-actions">
										<input type="file" id="importDatabaseInput" accept=".json" style="display: none;">
										<button type="button" class="confirm-modal-btn" id="importDatabaseBtn">
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
									<button type="button" class="confirm-modal-btn confirm-modal-btn-destructive" id="clearLocalDataBtn">
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
                    <button type="button" class="confirm-modal-btn confirm-modal-btn-destructive" id="deleteAllEventsBtn">
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
                    <button type="button" class="confirm-modal-btn confirm-modal-btn-destructive" id="emptyTrashBtn">
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
			</div>
		<div class="settings-modal-footer">
			<div class="confirm-modal-actions">
				<button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" id="settingsCloseBtn">
					Close
				</button>
			</div>
		</div>
	`;

	backdrop.appendChild(modal);
	document.body.appendChild(backdrop);

	requestAnimationFrame(() => {
		backdrop.classList.add('visible');
	});

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

	const darkThemeToggle = modal.querySelector('#darkThemeToggle');
	if (darkThemeToggle) {
		darkThemeToggle.addEventListener('change', (e) => {
			const newTheme = e.target.checked ? 'dark' : 'light';
			localStorage.setItem('theme', newTheme);
			if (typeof window.applyTheme === 'function') {
				window.applyTheme(newTheme);
			}
		});
	}

	const autoRefreshIntervalInput = modal.querySelector('#autoRefreshInterval');
	if (autoRefreshIntervalInput) {
		const handleAutoRefreshChange = (e) => {
			let interval = (e.target.value || '').trim();
			if (!interval) {
				interval = '';
			}
			if (typeof window.autoRefreshIntervalMinutes !== 'undefined') {
				window.autoRefreshIntervalMinutes = interval;
			}
			if (typeof window.autoRefreshEnabledState !== 'undefined') {
				window.autoRefreshEnabledState = interval !== '';
			}
		};
		autoRefreshIntervalInput.addEventListener('change', handleAutoRefreshChange);
		autoRefreshIntervalInput.addEventListener('input', handleAutoRefreshChange);
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
				if (!userFormContainer) return;
				userFormContainer.innerHTML = '';
				userFormContainer.style.display = 'none';
			}

			function renderUserForm({ title, description, fieldsHtml, submitLabel, onSubmit }) {
				if (!userFormContainer) return;

				userFormContainer.innerHTML = `
            <div class="settings-users-form-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <div class="settings-modal-placeholder-title" style="margin: 0;">${title}</div>
              <button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" data-action="cancel-user-form" style="padding: 6px 10px;">
                Close
              </button>
            </div>
            ${description ? `<p class="settings-modal-placeholder-text" style="margin-top: 6px; margin-bottom: 4px;">${description}</p>` : ''}
            <form class="settings-users-form" style="display: flex; flex-direction: column; gap: 12px; margin-top: 10px;">
              ${fieldsHtml}
              <div class="settings-users-form-error" style="color: #dc2626; font-size: 13px; display: none;"></div>
              <div class="confirm-modal-actions">
                <button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" data-action="cancel-user-form">
                  Cancel
                </button>
                <button type="submit" class="confirm-modal-btn confirm-modal-btn-confirm">
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
					if (!errorDiv) return;
					if (message) {
						errorDiv.textContent = message;
						errorDiv.style.display = 'block';
					} else {
						errorDiv.textContent = '';
						errorDiv.style.display = 'none';
					}
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

				userFormContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
					if (usersTableBody) {
						usersTableBody.innerHTML = `
              <tr>
                <td colspan="4" class="settings-users-empty">
                  Error loading users: ${escapeHtml(error.message)}
                </td>
              </tr>
            `;
					}
				}
			}

			function formatDate(dateString) {
				if (!dateString) return '-';
				const date = new Date(dateString);
				return date.toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'short',
					day: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				});
			}

			function getRoleBadgeColor(role) {
				switch (role) {
				case 'administrator':
					return '#dc2626';
				case 'advanced':
					return '#2563eb';
				case 'basic':
					return '#16a34a';
				default:
					return '#6b7280';
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
                  <el-autocomplete class="relative" style="margin-top: 4px;">
                    <input id="createUserRole" name="role" type="text" value="basic"
                      class="block w-full rounded-md bg-white py-1.5 pr-12 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6">
                    <button type="button" class="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2">
                      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="size-5 text-gray-400">
                        <path d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
                      </svg>
                    </button>
                    <el-options anchor="bottom end" popover class="max-h-60 w-(--input-width) overflow-auto rounded-md bg-white py-1 text-base shadow-lg outline outline-black/5 transition-discrete [--anchor-gap:--spacing(1)] data-leave:transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0 sm:text-sm">
                      <el-option value="basic" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">Basic</el-option>
                      <el-option value="advanced" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">Advanced</el-option>
                      <el-option value="administrator" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">Administrator</el-option>
                    </el-options>
                  </el-autocomplete>
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
							body: JSON.stringify({ username, password, role })
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
							body: JSON.stringify({ password })
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
                  <el-autocomplete class="relative" style="margin-top: 4px;">
                    <input id="editUserRole" name="role" type="text" value="${currentRole}"
                      class="block w-full rounded-md bg-white py-1.5 pr-12 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6">
                    <button type="button" class="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2">
                      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="size-5 text-gray-400">
                        <path d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
                      </svg>
                    </button>
                    <el-options anchor="bottom end" popover class="max-h-60 w-(--input-width) overflow-auto rounded-md bg-white py-1 text-base shadow-lg outline outline-black/5 transition-discrete [--anchor-gap:--spacing(1)] data-leave:transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0 sm:text-sm">
                      <el-option value="basic" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">Basic</el-option>
                      <el-option value="advanced" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">Advanced</el-option>
                      <el-option value="administrator" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">Administrator</el-option>
                    </el-options>
                  </el-autocomplete>
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
							body: JSON.stringify({ role })
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
					alert('Error deleting user: ' + error.message);
				}
			}

			async function renderUsers(users) {
				if (!usersTableBody) return;

				if (!users || users.length === 0) {
					usersTableBody.innerHTML = `
            <tr>
              <td colspan="4" class="settings-users-empty">No users found</td>
            </tr>
          `;
					return;
				}

				usersTableBody.innerHTML = users.map(user => {
					const roleBadgeColor = getRoleBadgeColor(user.role);
					return `
            <tr>
              <td>
                <div style="display: flex; flex-direction: column; gap: 4px;">
                  <span style="font-weight: 500;">${escapeHtml(user.username)}</span>
                  <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; color: white; background-color: ${roleBadgeColor}; width: fit-content;">
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
						window.showToast('Failed to export database: ' + error.message, 'error');
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
				if (!file) return;

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

					const errorMsg = result.errors && result.errors.length > 0
						? ` (${result.errors.length} errors)`
						: '';
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
						window.showToast('Failed to import database: ' + error.message, 'error');
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
			if (typeof window.confirmDeleteAll === 'function') {
				window.confirmDeleteAll();
			}
		});
	}

	const emptyTrashBtn = modal.querySelector('#emptyTrashBtn');
	if (emptyTrashBtn) {
		emptyTrashBtn.addEventListener('click', () => {
			if (typeof window.confirmEmptyTrash === 'function') {
				window.confirmEmptyTrash();
			}
		});
	}

	// Load trash info when settings modal opens (only for users with delete permissions)
	if (canDeleteAllEvents && typeof window.loadTrashInfo === 'function') {
		window.loadTrashInfo();
	}
}
