// @ts-nocheck
// People management page
import {showToast} from './notifications.js';

const REFRESH_ICON_ANIMATION_DURATION_MS = 700;
// Transition duration in milliseconds (matches navigation.js)
const PEOPLE_TRANSITION_DURATION_MS = 150;
let currentView = 'list'; // 'list' or 'detail'
let people = [];
let _currentPersonId = null;

function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

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

		// Icon for destructive vs normal actions
		const iconHtml = destructive ? `
			<div class="mx-auto flex shrink-0 items-center justify-center rounded-full ${isDark ? 'bg-red-500/10' : 'bg-red-100'} sm:mx-0 sm:size-10" style="width: 3rem; height: 3rem;">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" data-slot="icon" aria-hidden="true" class="size-6 ${isDark ? 'text-red-400' : 'text-red-600'}">
					<path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</div>
		` : `
			<div class="mx-auto flex size-12 items-center justify-center rounded-full ${isDark ? 'bg-green-500/10' : 'bg-green-100'}">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" data-slot="icon" aria-hidden="true" class="size-6 ${isDark ? 'text-green-400' : 'text-green-600'}">
					<path d="m4.5 12.75 6 6 9-13.5" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</div>
		`;

		// Create dialog HTML
		const dialogHtml = `
			<div class="confirm-modal-backdrop" style="position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background-color: ${isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.25)'};">
				<div class="confirm-modal" style="background: ${isDark ? '#1f2937' : 'white'}; border-radius: 8px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); max-width: 420px; width: 100%; margin: 16px; position: relative;">
					<div style="padding: 24px;">
						${destructive ? `
							<div style="display: flex; align-items: flex-start;">
								${iconHtml}
								<div style="margin-left: 16px; flex: 1;">
									<h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: ${isDark ? 'white' : '#111827'};">${escapeHtml(title)}</h3>
									<div style="margin-top: 8px;">
										<p style="margin: 0; font-size: 14px; color: ${isDark ? '#d1d5db' : '#6b7280'};">${escapeHtml(message)}</p>
									</div>
								</div>
							</div>
							<div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
								<button type="button" data-action="cancel" style="padding: 8px 16px; border: 1px solid ${isDark ? '#374151' : '#d1d5db'}; border-radius: 6px; background: ${isDark ? '#374151' : 'white'}; color: ${isDark ? '#d1d5db' : '#374151'}; font-size: 14px; font-weight: 500; cursor: pointer;">${escapeHtml(cancelText)}</button>
								<button type="button" data-action="confirm" style="padding: 8px 16px; border: none; border-radius: 6px; background: #dc2626; color: white; font-size: 14px; font-weight: 500; cursor: pointer;">${escapeHtml(confirmText)}</button>
							</div>
						` : `
							<div style="text-align: center;">
								${iconHtml}
								<div style="margin-top: 16px;">
									<h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: ${isDark ? 'white' : '#111827'};">${escapeHtml(title)}</h3>
									<div style="margin-top: 8px;">
										<p style="margin: 0; font-size: 14px; color: ${isDark ? '#d1d5db' : '#6b7280'};">${escapeHtml(message)}</p>
									</div>
								</div>
							</div>
							<div style="display: flex; justify-content: center; gap: 12px; margin-top: 24px;">
								<button type="button" data-action="cancel" style="padding: 8px 16px; border: 1px solid ${isDark ? '#374151' : '#d1d5db'}; border-radius: 6px; background: ${isDark ? '#374151' : 'white'}; color: ${isDark ? '#d1d5db' : '#374151'}; font-size: 14px; font-weight: 500; cursor: pointer;">${escapeHtml(cancelText)}</button>
								<button type="button" data-action="confirm" style="padding: 8px 16px; border: none; border-radius: 6px; background: ${isDark ? '#3b82f6' : '#2563eb'}; color: white; font-size: 14px; font-weight: 500; cursor: pointer;">${escapeHtml(confirmText)}</button>
							</div>
						`}
					</div>
				</div>
			</div>
		`;

		// Append to body
		const container = document.createElement('div');
		container.innerHTML = dialogHtml;
		document.body.appendChild(container);
		console.log('Modal container added to body');

		const backdrop = container.firstElementChild;
		const modal = backdrop.firstElementChild;
		const confirmBtn = modal.querySelector('[data-action="confirm"]');
		const cancelBtn = modal.querySelector('[data-action="cancel"]');
		console.log('Modal elements found:', {backdrop, modal, confirmBtn, cancelBtn});

		let resolved = false;

		// Resolve helper to prevent multiple resolutions
		const resolveOnce = (value) => {
			if (!resolved) {
				resolved = true;
				document.removeEventListener('keydown', handleKeydown);
				container.remove();
				resolve(value);
			}
		};

		// Handle ESC key
		const handleKeydown = (e) => {
			if (e.key === 'Escape') {resolveOnce(false);}
		};
		document.addEventListener('keydown', handleKeydown);

		// Handle confirm
		confirmBtn.addEventListener('click', () => resolveOnce(true));

		// Handle cancel
		cancelBtn.addEventListener('click', () => resolveOnce(false));

		// Handle backdrop click
		backdrop.addEventListener('click', (e) => {
			if (e.target === backdrop) {resolveOnce(false);}
		});
	});
}

// Transition functions
async function transitionPeopleContent(newContent) {
	const container = document.getElementById('peopleContent');
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
	currentContent.style.transition = `opacity ${PEOPLE_TRANSITION_DURATION_MS}ms ease-out`;
	currentContent.style.pointerEvents = 'none';
	currentContent.style.opacity = '0';
	newContent.style.transition = `opacity ${PEOPLE_TRANSITION_DURATION_MS}ms ease-in`;
	newContent.style.opacity = '1';
	newContent.style.pointerEvents = 'auto';

	// Wait for transition to complete
	await new Promise((resolve) => setTimeout(resolve, PEOPLE_TRANSITION_DURATION_MS));

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

async function renderPersonDetail(personId) {
	const contentContainer = document.createElement('div');
	contentContainer.innerHTML = `
    <div>
      <div id="personDetailHeader" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <button id="backToPeopleBtn" style="background: none; border: none; padding: 4px; cursor: pointer; color: inherit; display: flex; align-items: center; justify-content: center; transition: opacity 0.2s; opacity: 0.7; width: 28px;" aria-label="Back to people" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div>
            <h1 id="personDetailName" style="margin: 0; font-size: 1.5rem; font-weight: 600;">Loading...</h1>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="deletePersonBtn" class="btn btn-destructive">
            <i class="fas fa-trash" style="margin-right: 6px;"></i>Delete
          </button>
        </div>
      </div>
      <div id="personDetailContent">
        <div class="p-6 text-center text-gray-500 dark:text-gray-400">Loading person details...</div>
      </div>
    </div>
  `;

	const person = await fetchPerson(personId);
	if (!person) {
		showToast('Person not found', 'error');
		currentView = 'list';
		_currentPersonId = null;
		const listContent = renderPeopleList();
		await transitionPeopleContent(listContent);
		return contentContainer.firstElementChild;
	}

	// Get person initials for avatar
	const initials = getPersonInitials(person);

	// Logo or avatar
	const logoOrAvatar = `<span class="card-avatar" style="width: 32px; height: 32px; margin-right: 8px;">
		${initials}
	</span>`;

	contentContainer.querySelector('#personDetailName').innerHTML = `<span class="text-gray-900 dark:text-white" style="display: flex; align-items: center;">${logoOrAvatar}${person.name}</span>`;

	const detailContent = contentContainer.querySelector('#personDetailContent');
	detailContent.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
      <div class="divide-y divide-gray-200 dark:divide-gray-700 overflow-hidden rounded-lg bg-white dark:bg-gray-800/50 dark:outline dark:-outline-offset-1 dark:outline-white/10 shadow-sm">
        <div class="px-4 py-5 sm:px-6" style="display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; font-size: 1.1rem; font-weight: 600;">Details</h2>
        </div>
        <div class="px-4 py-5 sm:p-6">
          <div id="personInfo" class="space-y-4">
            <!-- Person information will be populated here -->
          </div>
        </div>
      </div>
      <div class="divide-y divide-gray-200 dark:divide-gray-700 overflow-hidden rounded-lg bg-white dark:bg-gray-800/50 dark:outline dark:-outline-offset-1 dark:outline-white/10 shadow-sm">
        <div class="px-4 py-5 sm:px-6" style="display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; font-size: 1.1rem; font-weight: 600;">Usernames</h2>
          <button id="addUsernameBtn" class="btn" onclick="showAddUsernameModal()">
            <i class="fas fa-plus" style="margin-right: 4px;"></i>Add Username
          </button>
        </div>
        <div class="px-4 py-5 sm:p-6">
          <div id="usernamesList" class="flex flex-col gap-2">
            <!-- Usernames will be populated here -->
          </div>
        </div>
      </div>
    </div>
  `;

	// Render person information
	const personInfo = contentContainer.querySelector('#personInfo');
	personInfo.innerHTML = `
    <div class="space-y-3">
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
        <input type="text" id="personNameInput" value="${person.name || ''}" class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
        <input type="email" id="personEmailInput" value="${person.email || ''}" class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Initials</label>
        <input type="text" id="personInitialsInput" value="${person.initials || ''}" maxlength="3" class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Created</label>
        <div class="text-sm text-gray-500 dark:text-gray-400">${new Date(person.created_at).toLocaleDateString()}</div>
      </div>
      <div class="flex justify-end gap-2 pt-4">
        <button type="button" onclick="savePersonChanges()" class="btn">
          Save Changes
        </button>
      </div>
    </div>
  `;

	// Load and render usernames
	await loadPersonUsernames(personId, contentContainer);

	// Event listeners
	contentContainer.querySelector('#backToPeopleBtn')?.addEventListener('click', async () => {
		currentView = 'list';
		_currentPersonId = null;
		const listContent = renderPeopleList();
		await transitionPeopleContent(listContent);
	});
	contentContainer.querySelector('#deletePersonBtn')?.addEventListener('click', () => {
		console.log('Delete button clicked for person:', person);
		window.showDeletePersonConfirm(person);
	});

	return contentContainer.firstElementChild;
}

async function fetchPerson(personId) {
	try {
		const response = await fetch(`/api/people/${personId}`, {
			credentials: 'same-origin'
		});
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
		const data = await response.json();
		return data.person || null;
	} catch (error) {
		console.error('Error fetching person:', error);
		showToast('Failed to load person', 'error');
		return null;
	}
}

// Global functions for onclick handlers
window.viewPersonDetail = async (personId) => {
	currentView = 'detail';
	_currentPersonId = personId;
	const detailContent = await renderPersonDetail(personId);
	await transitionPeopleContent(detailContent);
};

window.showCreatePersonModal = function() {
	showPersonFormModal(null);
};


window.showDeletePersonConfirm = async function(person) {
	console.log('showDeletePersonConfirm called with person:', person);
	try {
		const confirmed = await showConfirmDialog({
			title: 'Delete person',
			message: `Are you sure you want to delete "${person.name}" and all their associated usernames?`,
			confirmText: 'Delete person',
			cancelText: 'Cancel',
			destructive: true
		});
		console.log('showConfirmDialog returned:', confirmed);

		if (!confirmed) {
			return;
		}

		await deletePerson(person.id, person.name);
		showToast('Person deleted successfully', 'success');
		currentView = 'list';
		_currentPersonId = null;
		await loadPeople();
		const listContent = renderPeopleList();
		await transitionPeopleContent(listContent);
	} catch (error) {
		console.error('Error in showDeletePersonConfirm:', error);
		showToast((error && error.message) ? error.message : 'Failed to delete person', 'error');
	}
};

function showPersonFormModal(person = null) {
	const isEdit = person !== null;
	const backdrop = document.createElement('div');
	backdrop.className = 'confirm-modal-backdrop';

	const modal = document.createElement('div');
	modal.className = 'confirm-modal';
	modal.innerHTML = `
    <h2 style="margin: 0 0 16px 0;">${isEdit ? 'Edit Person' : 'Create Person'}</h2>
    <form id="personForm" enctype="multipart/form-data">
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <label>
          <div style="margin-bottom: 4px; font-weight: 500;">Name *</div>
          <input type="text" id="personNameInput" value="${person ? person.name : ''}"
                 class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100">
        </label>
        <label>
          <div style="margin-bottom: 4px; font-weight: 500;">Email (optional)</div>
          <input type="email" id="personEmailInput" value="${person ? person.email || '' : ''}"
                 class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100">
        </label>
        <label>
          <div style="margin-bottom: 4px; font-weight: 500;">Initials (optional)</div>
          <input type="text" id="personInitialsInput" value="${person ? person.initials || '' : ''}" maxlength="3" placeholder="e.g. JD, ABC"
                 class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100">
        </label>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 20px; justify-content: flex-end;">
        <button type="button" class="btn" id="cancelPersonFormBtn">
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
	document.getElementById('cancelPersonFormBtn')?.addEventListener('click', closeModal);
	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) {closeModal();}
	});

	document.getElementById('personForm')?.addEventListener('submit', async (e) => {
		e.preventDefault();
		const name = document.getElementById('personNameInput').value.trim();
		const email = document.getElementById('personEmailInput').value.trim() || null;
		const initials = document.getElementById('personInitialsInput').value.trim() || null;

		if (!name) {
			showToast('Person name is required', 'error');
			return;
		}

		try {
			if (isEdit) {
				await updatePerson(person.id, {name, email, initials});
				showToast('Person updated successfully', 'success');
			} else {
				await createPerson({name, email, initials});
				showToast('Person created successfully', 'success');
			}
			closeModal();
			await loadPeople();
			if (currentView === 'detail' && isEdit) {
				const detailContent = await renderPersonDetail(person.id);
				await transitionPeopleContent(detailContent);
			} else {
				const listContent = renderPeopleList();
				await transitionPeopleContent(listContent);
			}
		} catch (error) {
			showToast(error.message || 'Failed to save person', 'error');
		}
	});
}

async function createPerson(personData) {
	const headers = await getRequestHeaders(true);
	const response = await fetch('/api/people', {
		method: 'POST',
		headers,
		credentials: 'same-origin',
		body: JSON.stringify(personData)
	});

	if (!response.ok) {
		const data = await response.json();
		throw new Error(data.message || `HTTP ${response.status}`);
	}

	const data = await response.json();
	return data.person;
}

async function updatePerson(personId, updates) {
	const headers = await getRequestHeaders(true);
	const response = await fetch(`/api/people/${personId}`, {
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
	return data.person;
}

async function deletePerson(personId, _personName) {
	const headers = await getRequestHeaders(false);
	const response = await fetch(`/api/people/${personId}`, {
		method: 'DELETE',
		headers,
		credentials: 'same-origin'
	});

	if (!response.ok) {
		const data = await response.json();
		throw new Error(data.message || `HTTP ${response.status}`);
	}

	return true;
}

// Get request headers with CSRF token
async function getRequestHeaders(includeJson = true) {
	const headers = includeJson ? {'Content-Type': 'application/json'} : {};

	try {
		// Add CSRF token if available
		if (window.getCsrfToken) {
			const csrfToken = await window.getCsrfToken();
			if (csrfToken) {
				headers['X-CSRF-Token'] = csrfToken;
			} else {
				console.warn('No CSRF token available');
			}
		} else {
			console.warn('getCsrfToken function not available');
		}
	} catch (error) {
		console.warn('Failed to get CSRF token:', error);
	}

	return headers;
}

// Initialize the people page
async function initPeoplePage() {
	try {
		await loadPeople();
		const listContent = renderPeopleList();
		const peopleContent = document.getElementById('peopleContent');
		if (peopleContent && listContent) {
			// Clear any existing content (like loading message)
			peopleContent.innerHTML = '';
			peopleContent.appendChild(listContent);
		}
	} catch (error) {
		console.error('Error loading people:', error);
		showToast(`Error loading people page: ${error.message || 'Unknown error'}`, 'error');
		const container = document.getElementById('peopleContent');
		if (container) {
			container.innerHTML = '';
		}
	}
}

// Load and render people data
async function loadPeople() {
	try {
		if (window.location.pathname === '/people-debug') {
			// Use mock data for debugging
			people = [
				{
					id: 1,
					name: 'Marc Pla',
					email: 'marc@example.com',
					initials: 'MP',
					username_count: 2,
					created_at: '2025-12-23T15:30:00Z'
				},
				{
					id: 2,
					name: 'Test User',
					email: 'test@example.com',
					initials: null, // Will auto-generate to 'TU'
					username_count: 1,
					created_at: '2025-12-23T14:20:00Z'
				},
				{
					id: 3,
					name: 'Another Person',
					email: null,
					initials: 'AP',
					username_count: 0,
					created_at: '2025-12-23T13:10:00Z'
				}
			];
		} else {
			// Fetch people from API
			const response = await fetch('/api/people', {
				headers: await getRequestHeaders()
			});

			if (!response.ok) {
				throw new Error('Failed to load people');
			}

			const data = await response.json();
			people = data.people || [];
		}
	} catch (error) {
		console.error('Error loading people:', error);
		showToast('Failed to load people', 'error');
		people = [];
	}
}

// Function to get person initials (custom or auto-generated)
function getPersonInitials(person) {
	// If custom initials are defined, use them
	if (person.initials && person.initials.trim()) {
		return person.initials.trim().toUpperCase();
	}

	// Otherwise, auto-generate from name (first 2 words or first word)
	const nameParts = person.name.trim().split(/\s+/);
	if (nameParts.length >= 2) {
		// Take first letter of first two words
		return (nameParts[0].charAt(0) + nameParts[1].charAt(0)).toUpperCase();
	}
		// Take first letter of single word
		return nameParts[0].charAt(0).toUpperCase();

}

function renderPeopleList() {
	const container = document.createElement('div');
	container.innerHTML = `
    <div class="people-list-container">
      <div id="peopleList" class="grid grid-cols-1 gap-px overflow-hidden rounded-lg sm:grid-cols-2 lg:grid-cols-3 dark:bg-gray-900 dark:outline dark:-outline-offset-1 dark:outline-white/20">
        <div class="bg-white p-6 text-center text-sm text-gray-500 sm:col-span-2 lg:col-span-3">Loading people...</div>
      </div>
    </div>
  `;

	const peopleList = container.querySelector('#peopleList');

	if (people.length === 0) {
		peopleList.innerHTML = `
      <div class="bg-white dark:bg-gray-800/50 dark:outline dark:-outline-offset-1 dark:outline-white/10 px-8 py-10 text-center sm:col-span-2 lg:col-span-3">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" aria-hidden="true" class="mx-auto size-12 text-gray-400">
          <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
        </svg>
        <h3 class="mt-3 text-base font-semibold text-gray-900">No people</h3>
        <p class="mt-2 text-sm text-gray-500">Get started by creating a new person.</p>
        <div class="mt-6">
          <button type="button" class="btn" onclick="showCreatePersonModal()">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="mr-2 size-5">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5z" />
            </svg>
            New person
          </button>
        </div>
      </div>
    `;
		return container.firstElementChild;
	}

	peopleList.innerHTML = people.map(person => {
		// Get person initials for fallback avatar
		const initials = getPersonInitials(person);

		// Logo or avatar with cache busting for proper caching
		const logoOrAvatar = `<span class="card-avatar">
        ${initials}
      </span>`;

		return `
      <div class="cursor-pointer group relative bg-white dark:bg-gray-800/50 dark:outline dark:-outline-offset-1 dark:outline-white/10 p-6 transition hover:bg-gray-50 dark:hover:bg-gray-700/50 focus:outline-none focus-visible:outline-none dark:focus-within:outline-2 dark:focus-within:-outline-offset-2 dark:focus-within:outline-indigo-500" role="button" tabindex="0" onclick="viewPersonDetail(${person.id})" onkeypress="if(event.key==='Enter'||event.key===' '){event.preventDefault();viewPersonDetail(${person.id});}">
        <div>
          ${logoOrAvatar}
        </div>
        <div class="mt-8 space-y-2">
          <h3 class="text-base font-semibold text-gray-900 dark:text-white">
            <span aria-hidden="true" class="absolute inset-0"></span>
            ${person.name}
          </h3>
          <div class="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span class="inline-flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="size-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
              ${person.username_count || 0} username${(person.username_count || 0) !== 1 ? 's' : ''}
            </span>
            <span class="inline-flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="size-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
              ${person.email ? 'Has email' : 'No email'}
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


// Initialize when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initPeoplePage);
} else {
	initPeoplePage();
}

// Listen for soft navigation events
window.addEventListener('softNav:pagePausing', (event) => {
	if (event?.detail?.path === '/people') {
		pausePeoplePage();
		// Reset state when leaving people page
		currentView = 'list';
		_currentPersonId = null;
	}
});

// Handle soft navigation
window.addEventListener('softNav:pageMounted', async (event) => {
	if (event.detail.path === '/people') {
		const fromCache = event?.detail?.fromCache === true;
		// Always reset to list view when entering people page
		currentView = 'list';
		_currentPersonId = null;

		if (fromCache) {
			// Page was restored from cache - always show list view
			await loadPeople();
			const listContent = renderPeopleList();
			const peopleContent = document.getElementById('peopleContent');
			if (peopleContent && listContent) {
				await transitionPeopleContent(listContent);
			}
		} else {
			// New page load - full initialization
			await loadPeople();
			const listContent = renderPeopleList();
			const peopleContent = document.getElementById('peopleContent');
			if (peopleContent && listContent) {
				// Clear any existing content (like loading message)
				peopleContent.innerHTML = '';
				peopleContent.appendChild(listContent);
			}
		}
	}
});


// Legacy functions for backward compatibility
async function showPersonDetails(personId) {
	await window.viewPersonDetail(personId);
}

// Function to load usernames for a person in detail view
async function loadPersonUsernames(personId, contentContainer) {
	try {
		let usernames = [];

		if (window.location.pathname === '/people-debug') {
			// Return mock usernames for debugging
			usernames = [
				{username: 'marc.pla', org_id: 'salesforce', is_primary: true, person_id: personId},
				{username: 'mpladev', org_id: 'github', is_primary: false, person_id: personId},
				{username: 'marc_admin', org_id: null, is_primary: false, person_id: personId}
			];
		} else {
			const response = await fetch(`/api/people/${personId}/usernames`, {
				headers: await getRequestHeaders()
			});

			if (!response.ok) {
				throw new Error('Failed to load usernames');
			}

			const data = await response.json();
			usernames = data.usernames || [];
		}

		renderUsernamesList(usernames, contentContainer);

	} catch (error) {
		console.error('Error loading usernames:', error);
		showToast('Error loading usernames', 'error');
		const usernamesListElement = contentContainer.querySelector('#usernamesList');
		if (usernamesListElement) {
			usernamesListElement.innerHTML = '';
		}
	}
}

// Function to render usernames list in detail view
function renderUsernamesList(usernames, contentContainer) {
	const usernamesListElement = contentContainer.querySelector('#usernamesList');
	if (!usernamesListElement) {return;}

	if (usernames.length === 0) {
		usernamesListElement.innerHTML = '<p class="text-sm text-gray-500">No usernames associated yet</p>';
		return;
	}

	const usernamesHTML = usernames.map(username => {
		const isPrimaryBadge = username.is_primary ? '<span class="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">Primary</span>' : '';
		const orgBadge = username.org_id ? `<span class="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-700/10">${username.org_id}</span>` : '';

		return `
		<div class="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md">
			<div class="flex items-center gap-2">
				<code class="text-sm font-mono text-gray-900 dark:text-gray-100">${username.username}</code>
				${isPrimaryBadge}
				${orgBadge}
			</div>
			<button class="btn btn-compact btn-destructive" onclick="removeUsernameFromPerson('${username.username}', ${username.person_id})">
				<i class="fas fa-times"></i>
			</button>
		</div>
		`;
	}).join('');

	usernamesListElement.innerHTML = usernamesHTML;
}

// Function to show add username modal
window.showAddUsernameModal = function() {
	showAddUsernameModalForPerson(_currentPersonId);
};

async function showAddUsernameModalForPerson(personId) {
	const backdrop = document.createElement('div');
	backdrop.className = 'confirm-modal-backdrop';

	const modal = document.createElement('div');
	modal.className = 'confirm-modal';
	modal.innerHTML = `
    <h2 style="margin: 0 0 16px 0;">Add Username</h2>
    <form id="addUsernameForm">
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <label>
          <div style="margin-bottom: 4px; font-weight: 500;">Usernames *</div>
          <textarea id="usernamesInput" rows="3" placeholder="Enter usernames, one per line"
                   class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100"></textarea>
        </label>
        <label>
          <div style="margin-bottom: 4px; font-weight: 500;">Organization (optional)</div>
          <input type="text" id="orgIdInput" placeholder="e.g. salesforce, github"
                 class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100">
        </label>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 20px; justify-content: flex-end;">
        <button type="button" class="btn" id="cancelAddUsernameBtn">
          Cancel
        </button>
        <button type="submit" class="btn confirm-modal-btn-confirm">
          Add Usernames
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
	document.getElementById('cancelAddUsernameBtn')?.addEventListener('click', closeModal);
	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) {closeModal();}
	});

	document.getElementById('addUsernameForm')?.addEventListener('submit', async (e) => {
		e.preventDefault();
		const usernamesText = document.getElementById('usernamesInput').value.trim();
		const orgId = document.getElementById('orgIdInput').value.trim() || null;

		if (!usernamesText) {
			showToast('Please enter at least one username', 'error');
			return;
		}

		// Parse usernames (one per line)
		const usernames = usernamesText.split('\n')
			.map(username => username.trim())
			.filter(username => username.length > 0);

		if (usernames.length === 0) {
			showToast('Please enter at least one valid username', 'error');
			return;
		}

		// Remove duplicates
		const uniqueUsernames = [...new Set(usernames)];

		try {
			let successCount = 0;
			let errorCount = 0;

			// Add each username
			for (const username of uniqueUsernames) {
				try {
					const response = await fetch(`/api/people/${personId}/usernames`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							...(await getRequestHeaders())
						},
						body: JSON.stringify({
							username: username,
							org_id: orgId
						})
					});

					if (response.ok) {
						successCount++;
					} else {
						errorCount++;
						console.error(`Failed to add username ${username}:`, await response.text());
					}
				} catch (error) {
					errorCount++;
					console.error(`Error adding username ${username}:`, error);
				}
			}

			closeModal();

			// Show result message
			if (successCount > 0) {
				showToast(`Successfully added ${successCount} username${successCount > 1 ? 's' : ''}`, 'success');
				// Refresh the person details and people list
				await loadPeople();
				if (currentView === 'detail') {
					const detailContent = await renderPersonDetail(personId);
					await transitionPeopleContent(detailContent);
				} else {
					const listContent = renderPeopleList();
					await transitionPeopleContent(listContent);
				}
			}

			if (errorCount > 0) {
				showToast(`Failed to add ${errorCount} username${errorCount > 1 ? 's' : ''}`, 'error');
			}

		} catch (error) {
			console.error('Error adding usernames:', error);
			showToast('Error adding usernames', 'error');
		}
	});
}

// Function to remove a username from a person
async function removeUsernameFromPerson(username, _personId) {
	const confirmed = await showConfirmDialog({
		title: 'Remove username',
		message: `Remove the username "${username}" from this person?`,
		confirmText: 'Remove',
		cancelText: 'Cancel',
		destructive: true
	});

	if (!confirmed) {
		return;
	}

	try {
		// Note: This would require a DELETE endpoint, but it's not implemented yet in the API
		// For now, we'll show a message that this feature is not available
		showToast('Username removal - feature not yet implemented', 'info');
	} catch (error) {
		console.error('Error removing username:', error);
		showToast('Error removing username', 'error');
	}
}

// Function to save person changes from detail view
async function savePersonChanges() {
	try {
		const personId = _currentPersonId;
		if (!personId) {
			showToast('No person selected for editing', 'error');
			return;
		}

		const nameInput = document.getElementById('personNameInput');
		const emailInput = document.getElementById('personEmailInput');
		const initialsInput = document.getElementById('personInitialsInput');

		const personData = {
			name: nameInput?.value?.trim() || '',
			email: emailInput?.value?.trim() || null,
			initials: initialsInput?.value?.trim() || null
		};

		if (!personData.name) {
			showToast('Please enter a name', 'error');
			return;
		}

		await updatePerson(personId, personData);

		// Refresh the people list and current detail view
		await loadPeople();
		const detailContent = await renderPersonDetail(personId);
		await transitionPeopleContent(detailContent);

		// Show success message
		showToast('Person updated successfully', 'success');

	} catch (error) {
		console.error('Error updating person:', error);
		const errorMessage = error.message || 'An unexpected error occurred';
		showToast(`Error updating person: ${errorMessage}`, 'error');
	}
}



// Refresh function for the header button
function refreshPeople(event) {
	if (event?.preventDefault) {
		event.preventDefault();
	}
	const button = event?.currentTarget;
	const icon = button?.querySelector('.refresh-icon');
	if (icon) {
		icon.classList.add('rotating');
	}
	try {
		loadPeople().then(() => {
			if (currentView === 'detail') {
				const detailContent = renderPersonDetail(_currentPersonId);
				transitionPeopleContent(detailContent);
			} else {
				const listContent = renderPeopleList();
				transitionPeopleContent(listContent);
			}
		});
		// Update cache buster when manually refreshing
	} catch (error) {
		console.error('Error refreshing people:', error);
		showToast('Failed to refresh people', 'error');
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
}

// Pause/resume functions for soft navigation
function pausePeoplePage() {
	// People page doesn't have intervals, but we can clear any pending timeouts if needed
	// Currently no cleanup needed
}

async function resumePeoplePage() {
	// People page doesn't have intervals to resume
	// But we need to ensure event listeners are re-bound when returning from other pages
	await loadPeople();
}

// Export functions to window for global access
window.refreshPeople = refreshPeople;
window.showPersonDetails = showPersonDetails;
window.savePersonChanges = savePersonChanges;
window.removeUsernameFromPerson = removeUsernameFromPerson;

// Expose pause/resume hooks
window.pausePeoplePage = pausePeoplePage;
window.resumePeoplePage = resumePeoplePage;
