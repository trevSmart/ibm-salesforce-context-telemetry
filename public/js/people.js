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

	const peopleHTML = people.map(person => {
		const initial = person.name.charAt(0).toUpperCase();
		const createdDate = new Date(person.created_at);
		const timeAgo = getTimeAgo(createdDate);

		return `
		<li class="flex justify-between gap-x-6 py-5">
			<div class="flex min-w-0 gap-x-4">
				<div class="size-12 flex-none rounded-full bg-gray-50 flex items-center justify-center text-gray-600 font-semibold text-lg">
					${initial}
				</div>
				<div class="min-w-0 flex-auto">
					<p class="text-sm/6 font-semibold text-gray-900">
						<a href="#" onclick="showPersonDetails(${person.id})" class="hover:underline">${person.name}</a>
					</p>
					<p class="mt-1 flex text-xs/5 text-gray-500">
						${person.email ? `<a href="mailto:${person.email}" class="truncate hover:underline">${person.email}</a>` : '<span class="text-gray-400">No email</span>'}
					</p>
				</div>
			</div>
			<div class="flex shrink-0 items-center gap-x-6">
				<div class="hidden sm:flex sm:flex-col sm:items-end">
					<p class="text-sm/6 text-gray-900">Person</p>
					<p class="mt-1 text-xs/5 text-gray-500">Created ${timeAgo}</p>
				</div>
				<el-dropdown class="relative flex-none">
					<button class="relative block text-gray-500 hover:text-gray-900">
						<span class="absolute -inset-2.5"></span>
						<span class="sr-only">Open options</span>
						<svg viewBox="0 0 20 20" fill="currentColor" data-slot="icon" aria-hidden="true" class="size-5">
							<path d="M10 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM10 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM11.5 15.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z" />
						</svg>
					</button>
					<el-menu anchor="bottom end" popover class="w-32 origin-top-right rounded-md bg-white py-2 shadow-lg outline outline-gray-900/5 transition transition-discrete [--anchor-gap:--spacing(2)] data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in">
						<a href="#" onclick="showPersonDetails(${person.id})" class="block px-3 py-1 text-sm/6 text-gray-900 focus:bg-gray-50 focus:outline-hidden">View profile<span class="sr-only">, ${person.name}</span></a>
						<a href="#" onclick="showAddUsernameModal(${person.id})" class="block px-3 py-1 text-sm/6 text-gray-900 focus:bg-gray-50 focus:outline-hidden">Add username<span class="sr-only">, ${person.name}</span></a>
					</el-menu>
				</el-dropdown>
			</div>
		</li>
		`;
	}).join('');

	peopleListElement.innerHTML = peopleHTML;
}

// Helper function to get time ago string
function getTimeAgo(date) {
	const now = new Date();
	const diffInMs = now - date;
	const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
	const diffInDays = Math.floor(diffInHours / 24);

	if (diffInHours < 1) {
		return 'just now';
	} else if (diffInHours < 24) {
		return `${diffInHours}h ago`;
	} else if (diffInDays < 30) {
		return `${diffInDays}d ago`;
	} else {
		return date.toLocaleDateString();
	}
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

// Function to show person details
function showPersonDetails(personId) {
	// TODO: Implement person details modal with usernames
	showToast('Person details - feature coming soon!', 'info');
}

// Function to show add username modal (placeholder)
function showAddUsernameModal(personId) {
	// TODO: Implement add username functionality
	showToast('Add username - feature coming soon!', 'info');
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
window.showAddUsernameModal = showAddUsernameModal;
window.showCreatePersonModal = showCreatePersonModal;
window.closeCreatePersonModal = closeCreatePersonModal;