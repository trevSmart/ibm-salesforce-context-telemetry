// @ts-nocheck
// Teams management page

let currentView = 'list'; // 'list' or 'detail'
let _currentTeamId = null;
let teams = [];
let _allOrgs = [];
let _allUsers = [];

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Global functions needed by HTML
function showUserMenu(e) {
  if (e) {
    e.stopPropagation();
  }
  const userMenu = document.getElementById('userMenu');
  if (!userMenu) {
    return;
  }

  if (!userMenu.classList.contains('show')) {
    userMenu.classList.add('show');
    fetch('/api/auth/status', {
      credentials: 'include'
    })
      .then(response => response.json())
      .then(data => {
        const usernameElement = document.getElementById('userMenuUsername');
        if (usernameElement) {
          if (data.authenticated && data.username) {
            usernameElement.innerHTML = '<i class="fa-regular fa-user user-menu-icon"></i>' + escapeHtml(data.username);
          } else {
            usernameElement.innerHTML = '<i class="fa-regular fa-user user-menu-icon"></i>Not authenticated';
          }
        }
      })
      .catch(() => {
        const usernameElement = document.getElementById('userMenuUsername');
        if (usernameElement) {
          usernameElement.innerHTML = '<i class="fa-regular fa-user user-menu-icon"></i>Error loading user';
        }
      });
  }
}

// Close user menu when clicking outside
document.addEventListener('click', function (event) {
  const userMenu = document.getElementById('userMenu');
  const userMenuContainer = event.target.closest('.user-menu-container');

  if (userMenu && userMenu.classList.contains('show')) {
    if (!userMenuContainer && !userMenu.contains(event.target)) {
      userMenu.classList.remove('show');
    }
  }
});

async function handleLogout() {
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
      credentials: 'include'
    });
    if (response.ok) {
      window.location.href = '/login';
    }
  } catch (error) {
    console.error('Logout error:', error);
    window.location.href = '/login';
  }
}

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

async function openSettingsModal() {
  // For now, just show a simple message since settings modal is complex
  // In the future, this could be extracted to a shared module
  alert('Settings modal is not yet available on the Teams page. Please use the Dashboard or Logs page to access settings.');
}

// Make functions available globally
window.showUserMenu = showUserMenu;
window.handleLogout = handleLogout;
window.toggleTheme = toggleTheme;
window.clearLocalData = clearLocalData;
window.openSettingsModal = openSettingsModal;

// Utility functions
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

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

async function fetchUsers() {
  try {
    const response = await fetch('/api/users', {
      credentials: 'same-origin'
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    return data.users || [];
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
}

async function createTeam(name, color) {
  try {
    const response = await fetch('/api/teams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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

async function updateTeam(teamId, updates) {
  try {
    const response = await fetch(`/api/teams/${teamId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
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

async function deleteTeam(teamId) {
  try {
    const response = await fetch(`/api/teams/${teamId}`, {
      method: 'DELETE',
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
    const response = await fetch(`/api/orgs/${encodeURIComponent(orgId)}/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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

async function assignUserToTeam(userId, teamId) {
  try {
    const response = await fetch(`/api/users/${userId}/assign-team`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin',
      body: JSON.stringify({ team_id: teamId })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || `HTTP ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Error assigning user:', error);
    throw error;
  }
}

async function upsertOrg(orgId, orgData) {
  try {
    const response = await fetch('/api/orgs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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
    <div style="padding: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <h1 style="margin: 0; font-size: 1.5rem; font-weight: 600;">Teams</h1>
        <button id="createTeamBtn" type="button" class="confirm-modal-btn confirm-modal-btn-cancel" onclick="showCreateTeamModal()">
          <i class="fas fa-plus" style="margin-right: 6px;"></i>New team
        </button>
      </div>
      <div id="teamsList" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
        <div style="padding: 16px; text-align: center; color: var(--text-secondary);">Loading teams...</div>
      </div>
    </div>
  `;

  const teamsList = document.getElementById('teamsList');

  if (teams.length === 0) {
    teamsList.innerHTML = `
      <div style="grid-column: 1 / -1; display: flex; justify-content: center; padding: 32px 0;">
        <div class="text-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" class="mx-auto size-12 text-gray-400">
            <path d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <h3 class="mt-2 text-sm font-semibold text-gray-900">No teams</h3>
          <p class="mt-1 text-sm text-gray-500">Get started by creating a new team.</p>
          <div class="mt-6">
            <button type="button" class="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" onclick="showCreateTeamModal()">
              <svg viewBox="0 0 20 20" fill="currentColor" data-slot="icon" aria-hidden="true" class="mr-1.5 -ml-0.5 size-5">
                <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
              </svg>
              New Team
            </button>
          </div>
        </div>
      </div>
    `;
    return;
  }

  teamsList.innerHTML = teams.map(team => {
    const colorStyle = team.color ? `background: ${team.color};` : '';
    const colorDot = team.color ? `<span style="display: inline-block; width: 12px; height: 12px; border-radius: 999px; ${colorStyle} margin-right: 8px; border: 1px solid var(--border-color);"></span>` : '';

    return `
      <div class="overflow-hidden rounded-lg bg-white shadow-sm cursor-pointer transition duration-150 ease-in-out hover:-translate-y-0.5 hover:shadow-md" onclick="viewTeamDetail(${team.id})">
        <div class="px-4 py-5 sm:p-6">
          <div style="display: flex; align-items: center; margin-bottom: 12px;">
            ${colorDot}
            <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600; flex: 1;">${escapeHtml(team.name)}</h3>
          </div>
          <div style="display: flex; gap: 16px; color: var(--text-secondary); font-size: 0.9rem;">
            <span><i class="fas fa-building" style="margin-right: 4px;"></i>${team.org_count} org${team.org_count !== 1 ? 's' : ''}</span>
            <span><i class="fas fa-users" style="margin-right: 4px;"></i>${team.user_count} user${team.user_count !== 1 ? 's' : ''}</span>
          </div>
          <div style="margin-top: 12px; display: flex; gap: 8px;">
            <button class="btn-secondary" onclick="event.stopPropagation(); viewTeamDetail(${team.id})" style="flex: 1; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); cursor: pointer;">
              Manage
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function renderTeamDetail(teamId) {
  const container = document.getElementById('teamsContent');
  if (!container) return;

  container.innerHTML = `
    <div style="padding: 24px;">
      <div style="margin-bottom: 24px;">
        <button id="backBtn" class="btn-secondary" style="padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); cursor: pointer; margin-bottom: 16px;">
          <i class="fas fa-arrow-left" style="margin-right: 6px;"></i>Back to Teams
        </button>
        <div id="teamDetailHeader" style="display: flex; justify-content: space-between; align-items: start;">
          <div>
            <h1 id="teamDetailName" style="margin: 0 0 8px 0; font-size: 1.5rem; font-weight: 600;">Loading...</h1>
            <div id="teamDetailMeta" style="color: var(--text-secondary); font-size: 0.9rem;"></div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="editTeamBtn" class="btn-secondary" style="padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); cursor: pointer;">
              <i class="fas fa-pen" style="margin-right: 6px;"></i>Edit
            </button>
            <button id="deleteTeamBtn" class="btn-danger" style="padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border-color); background: #dc3545; color: white; cursor: pointer;">
              <i class="fas fa-trash" style="margin-right: 6px;"></i>Delete
            </button>
          </div>
        </div>
      </div>
      <div id="teamDetailContent">
        <div style="padding: 24px; text-align: center; color: var(--text-secondary);">Loading team details...</div>
      </div>
    </div>
  `;

  document.getElementById('backBtn')?.addEventListener('click', () => {
    currentView = 'list';
    _currentTeamId = null;
    renderTeamsList();
  });

  const team = await fetchTeam(teamId);
  if (!team) {
    showToast('Team not found', 'error');
    currentView = 'list';
    renderTeamsList();
    return;
  }

  const colorDot = team.color ? `<span style="display: inline-block; width: 16px; height: 16px; border-radius: 999px; background: ${team.color}; margin-right: 8px; border: 1px solid var(--border-color);"></span>` : '';

  document.getElementById('teamDetailName').innerHTML = `${colorDot}${escapeHtml(team.name)}`;
  document.getElementById('teamDetailMeta').textContent = `${team.orgs.length} org${team.orgs.length !== 1 ? 's' : ''} · ${team.users.length} user${team.users.length !== 1 ? 's' : ''}`;

  const detailContent = document.getElementById('teamDetailContent');
  detailContent.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
      <div class="divide-y divide-gray-200 overflow-hidden rounded-lg bg-white shadow-sm">
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
      <div class="divide-y divide-gray-200 overflow-hidden rounded-lg bg-white shadow-sm">
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
      const colorDot = org.color ? `<span style="display: inline-block; width: 10px; height: 10px; border-radius: 999px; background: ${org.color}; margin-right: 6px; border: 1px solid var(--border-color);"></span>` : '';
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary);">
          <div>
            <div style="font-weight: 500;">${colorDot}${escapeHtml(org.alias || org.id)}</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(org.id)}</div>
          </div>
          <button class="btn-danger" onclick="removeOrgFromTeam('${escapeHtml(org.id)}', ${teamId})" style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); background: #dc3545; color: white; cursor: pointer; font-size: 0.85rem;">
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
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary);">
          <div>
            <div style="font-weight: 500;">${escapeHtml(user.username)}</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(user.role)}</div>
          </div>
          <button class="btn-danger" onclick="removeUserFromTeam(${user.id}, ${teamId})" style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); background: #dc3545; color: white; cursor: pointer; font-size: 0.85rem;">
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
  modal.innerHTML = `
    <h2 style="margin: 0 0 16px 0;">${isEdit ? 'Edit Team' : 'Create Team'}</h2>
    <form id="teamForm">
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <label>
          <div style="margin-bottom: 4px; font-weight: 500;">Team Name *</div>
          <input type="text" id="teamNameInput" value="${team ? escapeHtml(team.name) : ''}"
                 style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary);">
        </label>
        <label>
          <div style="margin-bottom: 4px; font-weight: 500;">Color</div>
          <input type="text" id="teamColorInput" value="${team ? escapeHtml(team.color || '') : ''}" placeholder="#2195cf"
                 style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary);">
        </label>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 20px; justify-content: flex-end;">
        <button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" id="cancelTeamFormBtn">
          Cancel
        </button>
        <button type="submit" class="confirm-modal-btn confirm-modal-btn-cancel">
          ${isEdit ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  // Trigger enter transition on next frame
  requestAnimationFrame(() => {
    backdrop.classList.add('visible');
  });

  const closeModal = () => {
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
  };
  document.getElementById('cancelTeamFormBtn')?.addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

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
        await updateTeam(team.id, { name, color });
        showToast('Team updated successfully', 'success');
      } else {
        await createTeam(name, color);
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
               style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary);">
      </label>
    </div>
    <div style="margin-bottom: 16px;">
      <label>
        <div style="margin-bottom: 4px; font-weight: 500;">Alias (optional)</div>
        <input type="text" id="newOrgAliasInput" placeholder="Friendly name for this org"
               style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary);">
      </label>
    </div>
    <div style="margin-bottom: 16px;">
      <label>
        <div style="margin-bottom: 4px; font-weight: 500;">Color (optional)</div>
        <input type="text" id="newOrgColorInput" placeholder="#2195cf"
               style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary);">
      </label>
    </div>
    ${unassignedOrgs.length > 0 ? `
      <div style="margin-bottom: 16px;">
        <div style="margin-bottom: 8px; font-weight: 500;">Or select existing org:</div>
        <el-autocomplete class="relative existing-org-combo">
          <input id="existingOrgSelect" name="existingOrgSelect" type="text" value=""
            class="block w-full rounded-md bg-white py-1.5 pr-12 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
            placeholder="-- Select an org --">
          <button type="button" class="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="size-5 text-gray-400">
              <path d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
            </svg>
          </button>
          <el-options anchor="bottom end" popover class="max-h-60 w-(--input-width) overflow-auto rounded-md bg-white py-1 text-base shadow-lg outline outline-black/5 transition-discrete [--anchor-gap:--spacing(1)] data-leave:transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0 sm:text-sm">
            <el-option value="" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">-- Select an org --</el-option>
            ${unassignedOrgs.map(org => `<el-option value="${escapeHtml(org.id)}" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">${escapeHtml(org.alias || org.id)}</el-option>`).join('')}
          </el-options>
        </el-autocomplete>
      </div>
    ` : ''}
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" id="cancelAddOrgBtn">
        Cancel
      </button>
      <button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" id="saveAddOrgBtn">
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

  const closeModal = () => {
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
  };
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
  const users = await fetchUsers();
  const team = await fetchTeam(teamId);
  const teamUserIds = new Set(team.users.map(u => u.id));
  const availableUsers = users.filter(u => !teamUserIds.has(u.id));

  if (availableUsers.length === 0) {
    showToast('No available users to add', 'info');
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
        <el-autocomplete class="relative user-select-combo">
          <input id="userSelect" name="userSelect" type="text" value=""
            class="block w-full rounded-md bg-white py-1.5 pr-12 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
            placeholder="-- Select a user --">
          <button type="button" class="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="size-5 text-gray-400">
              <path d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
            </svg>
          </button>
          <el-options anchor="bottom end" popover class="max-h-60 w-(--input-width) overflow-auto rounded-md bg-white py-1 text-base shadow-lg outline outline-black/5 transition-discrete [--anchor-gap:--spacing(1)] data-leave:transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0 sm:text-sm">
            <el-option value="" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">-- Select a user --</el-option>
            ${availableUsers.map(user => `<el-option value="${user.id}" class="block truncate px-3 py-2 text-gray-900 select-none aria-selected:bg-indigo-600 aria-selected:text-white">${escapeHtml(user.username)} (${escapeHtml(user.role)})</el-option>`).join('')}
          </el-options>
        </el-autocomplete>
      </label>
    </div>
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" id="cancelAddUserBtn">
        Cancel
      </button>
      <button type="button" class="confirm-modal-btn confirm-modal-btn-cancel" id="saveAddUserBtn">
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

  const closeModal = () => {
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
  };
  document.getElementById('cancelAddUserBtn')?.addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  document.getElementById('saveAddUserBtn')?.addEventListener('click', async () => {
    const userValue = document.getElementById('userSelect').value;
    const userId = parseInt(userValue, 10);
    if (!userId || Number.isNaN(userId)) {
      showToast('Please select a user', 'error');
      return;
    }

    try {
      await assignUserToTeam(userId, teamId);
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

async function removeUserFromTeam(userId, teamId) {
  if (!confirm('Remove this user from the team?')) {
    return;
  }

  try {
    await assignUserToTeam(userId, null);
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
window.showAddOrgModal = showAddOrgModal;
window.showAddUserModal = showAddUserModal;
window.removeOrgFromTeam = removeOrgFromTeam;
window.removeUserFromTeam = removeUserFromTeam;

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
    console.log('Initializing teams page...');
    const container = document.getElementById('teamsContent');
    if (!container) {
      console.error('teamsContent container not found');
      // Try again after a short delay in case DOM isn't ready
      setTimeout(() => {
        const retryContainer = document.getElementById('teamsContent');
        if (retryContainer) {
          console.log('Found container on retry, initializing...');
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
    console.log('Teams page initialized successfully');
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
console.log('teams.js loaded, readyState:', document.readyState);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded fired, calling init()');
    init();
  });
} else {
  console.log('DOM already ready, calling init() immediately');
  init();
}

// Handle soft navigation
window.addEventListener('softNav:pageMounted', (event) => {
  if (event.detail.path === '/teams') {
    init();
  }
});
