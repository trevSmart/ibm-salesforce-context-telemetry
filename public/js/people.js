// @ts-nocheck
// People management page

import {showToast} from './notifications.js';

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
		// Fetch people from API
		const response = await fetch('/api/people', {
			headers: await getRequestHeaders()
		});

		if (!response.ok) {
			throw new Error('Failed to load people');
		}

		const data = await response.json();
		const people = data.people || [];

		// Always render the people list (may be empty)
		renderPeopleList(people);

	} catch (error) {
		console.error('Error loading people:', error);
		// Show error in the people list
		const peopleListElement = document.getElementById('peopleList');
		if (peopleListElement) {
			peopleListElement.innerHTML = `
				<li class="py-4 text-center text-red-600">
					<p>Error loading people. <button onclick="initPeoplePage()" class="underline hover:no-underline">Retry</button></p>
				</li>
			`;
		}
	}
}

// Render people list following the provided design
function renderPeopleList(people) {
	const peopleListElement = document.getElementById('peopleList');
	if (!peopleListElement) {return;}

	if (people.length === 0) {
		peopleListElement.innerHTML = `
			<li class="py-8 text-center text-gray-500">
				<p class="text-sm">No people added yet. Use the form above to add your first person.</p>
			</li>
		`;
		return;
	}

	const peopleHTML = people.map(person => `
		<li class="flex items-center justify-between space-x-3 py-4">
			<div class="flex min-w-0 flex-1 items-center space-x-3">
				<div class="shrink-0">
					<div class="size-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-semibold">
						${person.name.charAt(0).toUpperCase()}
					</div>
				</div>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium text-gray-900">${person.name}</p>
					<p class="truncate text-sm font-medium text-gray-500">Person</p>
				</div>
			</div>
			<div class="shrink-0">
				<button type="button" onclick="showPersonDetails(${person.id})" class="inline-flex items-center gap-x-1.5 text-sm/6 font-semibold text-gray-900">
					<svg viewBox="0 0 20 20" fill="currentColor" data-slot="icon" aria-hidden="true" class="size-5 text-gray-400">
						<path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
					</svg>
					Add username <span class="sr-only">${person.name}</span>
				</button>
			</div>
		</li>
	`).join('');

	peopleListElement.innerHTML = peopleHTML;
}

// Refresh function for the header button
function refreshPeople(event) {
	if (event) {
		event.preventDefault();
	}

	// Add refresh animation to button
	const button = event?.target?.closest('button');
	if (button) {
		button.classList.add('refreshing');
		setTimeout(() => {
			button.classList.remove('refreshing');
		}, 1000);
	}

	// Reinitialize the page
	initPeoplePage();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initPeoplePage);
} else {
	initPeoplePage();
}


// Function to handle person creation
async function handleCreatePerson(event) {
	event.preventDefault();

	const formData = new FormData(event.target);
	const personData = {
		name: formData.get('name').trim(),
		email: formData.get('email')?.trim() || null
	};

	if (!personData.name) {
		showToast('Please enter a name', 'error');
		return;
	}

	try {
		const response = await fetch('/api/people', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(await getRequestHeaders())
			},
			body: JSON.stringify(personData)
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.message || 'Failed to create person');
		}

		await response.json();

		// Close the modal
		closeCreatePersonModal();

		// Refresh the people list
		await initPeoplePage();

		// Show success message
		showToast('Person added successfully', 'success');

	} catch (error) {
		console.error('Error creating person:', error);
		showToast(`Error creating person: ${  error.message}`, 'error');
	}
}

// Function to show person details (placeholder)
function showPersonDetails(personId) {
	// TODO: Implement person details modal with usernames
	showToast('Person details - feature coming soon!', 'info');
}

// Function to show create person modal
function showCreatePersonModal() {
	const modal = document.getElementById('createPersonModal');
	if (modal) {
		modal.style.display = 'flex';
		// Focus on the name input
		const nameInput = document.getElementById('personName');
		if (nameInput) {
			setTimeout(() => nameInput.focus(), 100);
		}
	}
}

// Function to close create person modal
function closeCreatePersonModal() {
	const modal = document.getElementById('createPersonModal');
	if (modal) {
		modal.style.display = 'none';
		// Clear the form
		const form = modal.querySelector('form');
		if (form) {
			form.reset();
		}
	}
}

// Export functions to window for global access
window.refreshPeople = refreshPeople;
window.handleCreatePerson = handleCreatePerson;
window.showPersonDetails = showPersonDetails;
window.showCreatePersonModal = showCreatePersonModal;
window.closeCreatePersonModal = closeCreatePersonModal;