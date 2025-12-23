// @ts-nocheck
// People management page

// showToast is available globally from notifications.js

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
		let people = [];

		// Check if we're on debug mode (no auth required)
		if (window.location.pathname === '/people-debug') {
			// Use mock data for debugging
			console.log('=== DEBUG MODE: Using mock data ===');
			people = [
				{
					id: 1,
					name: 'Marc Pla',
					email: 'marc@example.com',
					initials: 'MP',
					created_at: '2025-12-23T15:30:00Z'
				},
				{
					id: 2,
					name: 'Test User',
					email: 'test@example.com',
					initials: null, // Will auto-generate to 'TU'
					created_at: '2025-12-23T14:20:00Z'
				},
				{
					id: 3,
					name: 'Another Person',
					email: null,
					initials: 'AP',
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

		// Always render the people list (may be empty)
		await renderPeopleList(people);

	} catch (error) {
		console.error('Error loading people:', error);
		// Show error in the people list
		const peopleListElement = document.getElementById('peopleList');
		if (peopleListElement) {
			peopleListElement.innerHTML = `
				<div class="bg-white px-8 py-10 text-center">
					<p class="text-red-600">Error loading people. <button onclick="initPeoplePage()" class="underline hover:no-underline">Retry</button></p>
				</div>
			`;
		}
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

// Render people list following the provided design
async function renderPeopleList(people) {
	const peopleListElement = document.getElementById('peopleList');
	if (!peopleListElement) {
		console.error('peopleListElement not found');
		return;
	}

	if (people.length === 0) {
		peopleListElement.innerHTML = `
			<div class="bg-white px-8 py-10 text-center sm:col-span-2 lg:col-span-3">
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
		return;
	}

	// Fetch username counts for all people
	const usernameCounts = await fetchUsernameCounts(people);

	const peopleHTML = people.map(person => {
		const initial = getPersonInitials(person);
		const createdDate = new Date(person.created_at);
		const timeAgo = getTimeAgo(createdDate);
		const usernameCount = usernameCounts[person.id] || 0;

		// Get person initials for fallback avatar
		const personInitials = initial;

		// Logo or avatar (simplified for people - just initials)
		// const logoOrAvatar = `<span class="card-avatar">
		// 	${personInitials}
		// </span>`;

		const logoOrAvatar = `<span class="inline-flex items-center justify-center rounded-lg text-sm font-semibold size-12" style="color: #4f46e5; background-color: rgba(79, 70, 229, 0.12);">
			${personInitials}
		</span>`;

		return `
		<div class="group relative bg-white dark:bg-gray-800/50 dark:outline dark:-outline-offset-1 dark:outline-white/10 p-6 transition hover:bg-gray-50 dark:hover:bg-gray-700/50 focus:outline-none focus-visible:outline-none cursor-pointer" role="button" tabindex="0" onclick="showPersonModal(${person.id})" onkeypress="if(event.key==='Enter'||event.key===' '){event.preventDefault();showPersonModal(${person.id});}">
			<div>
				${logoOrAvatar}
			</div>
			<div class="mt-8 space-y-2">
				<h3 class="text-base font-semibold text-gray-900">
					<span aria-hidden="true" class="absolute inset-0"></span>
					${person.name}
				</h3>
				<div class="flex items-center gap-4 text-sm text-gray-500">
					<span class="inline-flex items-center gap-1.5">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="size-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
						</svg>
						${usernameCount} username${usernameCount !== 1 ? 's' : ''}
					</span>
					<span class="inline-flex items-center gap-1.5">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="size-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
						</svg>
						${person.email ? 'Has email' : 'No email'}
					</span>
				</div>
			</div>
			<span aria-hidden="true" class="pointer-events-none absolute top-6 right-6 text-gray-300 opacity-0 transition duration-150 group-hover:opacity-100 group-hover:text-gray-400">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="size-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
				</svg>
			</span>
		</div>
		`;
	}).join('');

	peopleListElement.innerHTML = peopleHTML;
}

// Function to fetch username counts for multiple people
async function fetchUsernameCounts(people) {
	const counts = {};

	if (window.location.pathname === '/people-debug') {
		// Return mock counts for debugging
		people.forEach(person => {
			counts[person.id] = Math.floor(Math.random() * 5); // Random count 0-4
		});
		return counts;
	}

	// Fetch counts for all people in parallel
	const promises = people.map(async (person) => {
		try {
			const response = await fetch(`/api/people/${person.id}/usernames`, {
				headers: await getRequestHeaders()
			});

			if (response.ok) {
				const data = await response.json();
				counts[person.id] = data.usernames ? data.usernames.length : 0;
			} else {
				counts[person.id] = 0;
			}
		} catch (error) {
			console.error(`Error fetching username count for person ${person.id}:`, error);
			counts[person.id] = 0;
		}
	});

	await Promise.all(promises);
	return counts;
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
	} 
		return date.toLocaleDateString();
	
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

// Global ESC key handler for modals
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape') {
		// Don't close modal if user is currently editing text in an input field
		const activeElement = document.activeElement;
		const isEditingText = activeElement && (
			activeElement.tagName === 'INPUT' ||
			activeElement.tagName === 'TEXTAREA' ||
			activeElement.contentEditable === 'true'
		);

		if (isEditingText) {
			return;
		}

		// Close create person modal if open
		const createModal = document.getElementById('createPersonModal');
		if (createModal && createModal.classList.contains('visible')) {
			closeCreatePersonModal();
			return;
		}

		// Close person modal if open
		const personModal = document.getElementById('personModal');
		if (personModal && personModal.classList.contains('visible')) {
			closePersonModal();
			
		}
	}
});


// Function to handle person creation
async function handleCreatePerson(event) {
	event.preventDefault();

	const formData = new FormData(event.target);
	const personData = {
		name: formData.get('name').trim(),
		email: formData.get('email')?.trim() || null,
		initials: formData.get('initials')?.trim() || null
	};

	if (!personData.name) {
		window.showToast('Please enter a name', 'error');
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

// Function to show person modal (all-in-one: view, edit & add usernames)
async function showPersonModal(personId) {
	try {
		// Find the person in the current list to get basic info
		const peopleList = await fetchPeopleList();
		const person = peopleList.find(p => p.id === personId);

		if (!person) {
			window.showToast('Person not found', 'error');
			return;
		}

		// Store current person ID for modal operations
		window.currentPersonId = personId;

		// Populate modal with person data
		const avatarElement = document.querySelector('#personAvatar span');
		const nameInput = document.getElementById('editPersonName');
		const emailInput = document.getElementById('editPersonEmail');
		const initialsInput = document.getElementById('editPersonInitials');
		const createdElement = document.getElementById('personCreated');

		if (avatarElement) {avatarElement.textContent = getPersonInitials(person);}
		if (nameInput) {nameInput.value = person.name;}
		if (emailInput) {emailInput.value = person.email || '';}
		if (initialsInput) {initialsInput.value = person.initials || '';}
		if (createdElement) {
			const createdDate = new Date(person.created_at);
			createdElement.textContent = `Created ${getTimeAgo(createdDate)}`;
		}

		// Load usernames
		await loadPersonUsernames(personId);

		// Hide add username form initially
		const addForm = document.getElementById('addUsernameForm');
		if (addForm) {addForm.classList.add('hidden');}

		// Show the modal
		const modal = document.getElementById('personModal');
		if (modal) {
			modal.classList.add('visible');

			// Add backdrop click handler to close modal
			const handleBackdropClick = (e) => {
				// Close modal when clicking on backdrop (not on modal content)
				if (e.target === modal) {
					closePersonModal();
				}
			};
			modal.addEventListener('click', handleBackdropClick);

			// Store the handler for cleanup
			modal._backdropClickHandler = handleBackdropClick;

			// Prevent clicks on modal content from bubbling to backdrop
			const modalContent = modal.querySelector('.confirm-modal');
			if (modalContent) {
				const handleModalContentClick = (e) => {
					e.stopPropagation();
				};
				modalContent.addEventListener('click', handleModalContentClick);

				// Store the handler for cleanup
				modal._modalContentClickHandler = handleModalContentClick;
			}
		}

	} catch (error) {
		console.error('Error showing person modal:', error);
		window.showToast('Failed to load person details', 'error');
	}
}

// Legacy functions for backward compatibility
async function showPersonDetails(personId) {
	await showPersonModal(personId);
}

// Function to load usernames for a person
async function loadPersonUsernames(personId) {
	try {
		let usernames = [];

		if (window.location.pathname === '/people-debug') {
			// Return mock usernames for debugging
			usernames = [
				{username: 'marc.pla', org_id: 'salesforce', is_primary: true},
				{username: 'mpladev', org_id: 'github', is_primary: false},
				{username: 'marc_admin', org_id: null, is_primary: false}
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

		renderUsernamesList(usernames);

	} catch (error) {
		console.error('Error loading usernames:', error);
		const usernamesListElement = document.getElementById('usernamesList');
		if (usernamesListElement) {
			usernamesListElement.innerHTML = '<p class="text-sm text-red-600">Error loading usernames</p>';
		}
	}
}

// Function to render usernames list
function renderUsernamesList(usernames) {
	const usernamesListElement = document.getElementById('usernamesList');
	if (!usernamesListElement) {return;}

	if (usernames.length === 0) {
		usernamesListElement.innerHTML = '<p class="text-sm text-gray-500">No usernames associated yet</p>';
		return;
	}

	const usernamesHTML = usernames.map(username => {
		const isPrimaryBadge = username.is_primary ? '<span class="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">Primary</span>' : '';
		const orgBadge = username.org_id ? `<span class="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-700/10">${username.org_id}</span>` : '';

		return `
		<div class="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-md">
			<div class="flex items-center gap-2">
				<code class="text-sm font-mono text-gray-900">${username.username}</code>
				${isPrimaryBadge}
				${orgBadge}
			</div>
			<button type="button" onclick="removeUsername(${username.person_id}, '${username.username}')" class="text-red-600 hover:text-red-800 text-sm">
				<svg viewBox="0 0 20 20" fill="currentColor" class="size-4">
					<path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 1 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd" />
				</svg>
			</button>
		</div>
		`;
	}).join('');

	usernamesListElement.innerHTML = usernamesHTML;
}

function showAddUsernameModal(personId) {
	showPersonModal(personId);
}

// Function to toggle add username form visibility
function toggleAddUsernameForm() {
	const form = document.getElementById('addUsernameForm');
	if (form) {
		form.classList.toggle('hidden');
	}
}

// Function to handle adding usernames
async function handleAddUsernames(event) {
	event.preventDefault();

	const formData = new FormData(event.target);
	const usernamesText = formData.get('usernames').trim();
	const orgId = formData.get('org_id')?.trim() || null;

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
				const response = await fetch(`/api/people/${window.currentPersonId}/usernames`, {
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

		// Close the modal
		closeAddUsernameModal();

		// Show result message
		if (successCount > 0) {
			showToast(`Successfully added ${successCount} username${successCount > 1 ? 's' : ''}`, 'success');
			// Refresh the person details if modal is open
			if (document.getElementById('personDetailsModal')?.classList.contains('visible')) {
				await loadPersonUsernames(window.currentPersonId);
			}
			// Refresh the people list to update counts
			await initPeoplePage();
		}

		if (errorCount > 0) {
			showToast(`Failed to add ${errorCount} username${errorCount > 1 ? 's' : ''}`, 'error');
		}

	} catch (error) {
		console.error('Error adding usernames:', error);
		showToast('Error adding usernames', 'error');
	}
}

// Function to remove a username
async function removeUsername(personId, username) {
	if (!confirm(`Are you sure you want to remove the username "${username}" from this person?`)) {
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

// Helper function to fetch people list (for getting person details)
async function fetchPeopleList() {
	if (window.location.pathname === '/people-debug') {
		// Return mock data for debugging
		return [
			{
				id: 1,
				name: 'Marc Pla',
				email: 'marc@example.com',
				initials: 'MP',
				created_at: '2025-12-23T15:30:00Z'
			},
			{
				id: 2,
				name: 'Test User',
				email: 'test@example.com',
				initials: null, // Will auto-generate to 'TU'
				created_at: '2025-12-23T14:20:00Z'
			},
			{
				id: 3,
				name: 'Another Person',
				email: null,
				initials: 'AP',
				created_at: '2025-12-23T13:10:00Z'
			}
		];
	}

	const response = await fetch('/api/people', {
		headers: await getRequestHeaders()
	});

	if (!response.ok) {
		throw new Error('Failed to load people');
	}

	const data = await response.json();
	return data.people || [];
}

// Function to show create person modal
function showCreatePersonModal() {
	const modal = document.getElementById('createPersonModal');
	if (modal) {
		modal.classList.add('visible');

		// Add backdrop click handler to close modal
		const handleBackdropClick = (e) => {
			// Close modal when clicking on backdrop (not on modal content)
			if (e.target === modal) {
				closeCreatePersonModal();
			}
		};
		modal.addEventListener('click', handleBackdropClick);

		// Store the handler for cleanup
		modal._backdropClickHandler = handleBackdropClick;

		// Prevent clicks on modal content from bubbling to backdrop
		const modalContent = modal.querySelector('.confirm-modal');
		if (modalContent) {
			const handleModalContentClick = (e) => {
				e.stopPropagation();
			};
			modalContent.addEventListener('click', handleModalContentClick);

			// Store the handler for cleanup
			modal._modalContentClickHandler = handleModalContentClick;
		}

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
		// Remove backdrop click handler
		if (modal._backdropClickHandler) {
			modal.removeEventListener('click', modal._backdropClickHandler);
			delete modal._backdropClickHandler;
		}

		// Remove modal content click handler
		const modalContent = modal.querySelector('.confirm-modal');
		if (modalContent && modal._modalContentClickHandler) {
			modalContent.removeEventListener('click', modal._modalContentClickHandler);
			delete modal._modalContentClickHandler;
		}

		modal.classList.remove('visible');
		modal.classList.add('hiding');
		// Clear the form after transition
		setTimeout(() => {
			const form = modal.querySelector('form');
			if (form) {
				form.reset();
			}
			modal.classList.remove('hiding');
		}, 200); // Match the faster transition duration
	}
}

// Function to close unified person modal
function closePersonModal() {
	const modal = document.getElementById('personModal');
	if (modal) {
		// Remove backdrop click handler
		if (modal._backdropClickHandler) {
			modal.removeEventListener('click', modal._backdropClickHandler);
			delete modal._backdropClickHandler;
		}

		// Remove modal content click handler
		const modalContent = modal.querySelector('.confirm-modal');
		if (modalContent && modal._modalContentClickHandler) {
			modalContent.removeEventListener('click', modal._modalContentClickHandler);
			delete modal._modalContentClickHandler;
		}

		modal.classList.remove('visible');
		modal.classList.add('hiding');
		setTimeout(() => {
			modal.classList.remove('hiding');
		}, 200);
	}
}

// Legacy function for backward compatibility - redirects to unified modal close
function closeAddUsernameModal() {
	closePersonModal();
}

// Legacy function for backward compatibility - redirects to unified modal
async function showEditPersonModal(personId) {
	await showPersonModal(personId, 'edit');
}

// Function to handle editing a person (inline editing)
async function handleEditPerson() {
	try {
		const personId = window.currentPersonId;
		if (!personId) {
			window.showToast('No person selected for editing', 'error');
			return;
		}

		const nameInput = document.getElementById('editPersonName');
		const emailInput = document.getElementById('editPersonEmail');
		const initialsInput = document.getElementById('editPersonInitials');

		const personData = {
			name: nameInput?.value?.trim() || '',
			email: emailInput?.value?.trim() || null,
			initials: initialsInput?.value?.trim() || null
		};

		if (!personData.name) {
			window.showToast('Please enter a name', 'error');
			return;
		}

		const response = await fetch(`/api/people/${personId}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				...(await getRequestHeaders())
			},
			body: JSON.stringify(personData)
		});

		if (!response.ok) {
			let errorMessage = 'Failed to update person';
			try {
				const errorData = await response.json();
				errorMessage = errorData.message || errorMessage;
			} catch (parseError) {
				errorMessage = response.statusText || errorMessage;
			}
			throw new Error(errorMessage);
		}

		await response.json();

		// Update avatar with new initials
		const avatarElement = document.querySelector('#personAvatar span');
		if (avatarElement) {avatarElement.textContent = getPersonInitials(personData);}

		// Refresh the people list to show changes
		await initPeoplePage();

		// Show success message
		window.showToast('Person updated successfully', 'success');

	} catch (error) {
		console.error('Error updating person:', error);
		const errorMessage = error.message || 'An unexpected error occurred';
		window.showToast(`Error updating person: ${errorMessage}`, 'error');
	}
}

// Function to delete a person
async function deletePerson(personId, personName) {
	if (!confirm(`Are you sure you want to delete "${personName}" and all their associated usernames? This action cannot be undone.`)) {
		return;
	}

	try {
		const response = await fetch(`/api/people/${personId}`, {
			method: 'DELETE',
			headers: await getRequestHeaders()
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.message || 'Failed to delete person');
		}

		// Refresh the people list
		await initPeoplePage();

		// Show success message
		showToast('Person deleted successfully', 'success');

	} catch (error) {
		console.error('Error deleting person:', error);
		showToast(`Error deleting person: ${error.message}`, 'error');
	}
}

// Legacy function for backward compatibility - redirects to unified modal close
function closeEditPersonModal() {
	closePersonModal();
	// Clear the stored person ID
	delete window.currentEditPersonId;
}


// Export functions to window for global access
window.refreshPeople = refreshPeople;
window.handleCreatePerson = handleCreatePerson;
window.showPersonDetails = showPersonDetails;
window.showPersonModal = showPersonModal;
window.showAddUsernameModal = showAddUsernameModal;
window.showCreatePersonModal = showCreatePersonModal;
window.closeCreatePersonModal = closeCreatePersonModal;
window.closePersonModal = closePersonModal;
window.closeAddUsernameModal = closeAddUsernameModal;
window.handleAddUsernames = handleAddUsernames;
window.removeUsername = removeUsername;
window.showEditPersonModal = showEditPersonModal;
window.handleEditPerson = handleEditPerson;
window.closeEditPersonModal = closeEditPersonModal;
window.toggleAddUsernameForm = toggleAddUsernameForm;
window.deletePerson = deletePerson;