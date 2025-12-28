// @ts-nocheck
// Test page functionality

const REFRESH_ICON_ANIMATION_DURATION_MS = 700;

// Store loaded events
let loadedEvents = [];

// Pagination state
let currentOffset = 0;
let hasMoreEvents = true;
let isLoadingMore = false;
const limit = 100; // Increased from 50 to reduce number of API calls

// Helper functions
function escapeHtml(unsafe) {
	return String(unsafe)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

function formatDate(dateString) {
	if (!dateString) {return '';}
	const date = new Date(dateString);
	const day = date.getDate();
	const month = date.toLocaleString('default', {month: 'short'}).toLowerCase();
	const hours = String(date.getHours());
	const minutes = String(date.getMinutes()).padStart(2, '0');
	return `${day} ${month} ${hours}:${minutes}`;
}

function normalizeEventData(rawData) {
	if (!rawData) {
		return {};
	}
	if (typeof rawData === 'object') {
		return rawData;
	}
	try {
		return JSON.parse(rawData);
	} catch {
		return {};
	}
}

function extractUserLabelFromEvent(event, eventData) {
	if (!event) {
		return '';
	}

	// Prefer explicit user name fields from event data when available
	if (eventData && typeof eventData === 'object') {
		try {
			const fromData =
				(typeof eventData.userName === 'string' && eventData.userName.trim()) ||
				(typeof eventData.user_name === 'string' && eventData.user_name.trim()) ||
				(eventData.user &&
					typeof eventData.user.name === 'string' &&
					eventData.user.name.trim());

			if (fromData) {
				return String(fromData);
			}
		} catch {
			// Ignore and fall through to other sources
		}
	}

	// Fallback to user_id from the event itself
	if (event.user_id) {
		return String(event.user_id);
	}

	return '';
}

async function handleApiResponse(response) {
	if (response.status === 401) {
		window.location.href = '/login';
		return null;
	}
	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}
	return response;
}

function getLevelClass(area) {
	const levelMap = {
		'tool': 'tool',
		'session': 'session',
		'general': 'general'
	};
	return levelMap[area] || 'session';
}

function getLevelBadgeClass(area) {
	const levelClass = getLevelClass(area);
	return `level-badge ${levelClass}`;
}

function getEventBadgeClass(eventType) {
	const eventColorMap = {
		'tool_call': 'green',
		'tool_error': 'indigo',
		'session_start': 'pink',
		'session_end': 'yellow',
		'error': 'green',
		'custom': 'indigo'
	};
	const colorClass = eventColorMap[eventType] || 'green';
	return `event-badge ${colorClass}`;
}

function buildStatusIcon(isError) {
	const statusClass = isError ? 'ko' : 'ok';
	const statusLabel = isError ? 'KO' : 'OK';
	const src = isError ? '/resources/ko.png' : '/resources/ok.png';
	return `<img src="${src}" alt="${statusLabel}" class="status-indicator ${statusClass}" loading="lazy">`;
}

// Create event details form HTML
function createEventDetailsFormHTML(event) {
	// event.data now contains the original payload exactly as received
	const payload = event.data || {};

	const formatDateForForm = (dateString) => {
		if (!dateString) {return '';}
		try {
			const date = new Date(dateString);
			if (Number.isNaN(date.getTime())) {return dateString;}

			// Format: "15 Jan 2024, 14:30:45" (day month year, hour:minute:second)
			const options = {
				day: 'numeric',
				month: 'short',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: false
			};
			return date.toLocaleDateString('en-GB', options);
		} catch {
			return dateString;
		}
	};

	const formatValue = (value) => {
		if (value === null || value === undefined) {
			return '';
		}
		if (typeof value === 'object') {
			return JSON.stringify(value, null, 2);
		}
		return String(value);
	};

	const createInputHTML = (id, name, label, value, placeholder = '', type = 'text', roundedClasses = '') => {
		return `
			<div class="bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700 focus-within:relative focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 dark:focus-within:outline-indigo-500 ${roundedClasses}">
				<label for="${id}" class="block text-xs font-medium text-gray-900 dark:text-white">${label}</label>
				<input
					id="${id}"
					name="${name}"
					type="${type}"
					value="${formatValue(value).replace(/"/g, '&quot;')}"
					placeholder="${placeholder}"
					aria-label="${label}"
					readonly
					class="block w-full text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
					style="font-size: 13.5px;"
				/>
			</div>
		`;
	};

	const _createTextareaHTML = (id, name, label, value, placeholder = '') => {
		return `
			<div class="rounded-md bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700 focus-within:relative focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 dark:focus-within:outline-indigo-500">
				<label for="${id}" class="block text-xs font-medium text-gray-900 dark:text-white">${label}</label>
				<textarea
					id="${id}"
					name="${name}"
					placeholder="${placeholder}"
					aria-label="${label}"
					readonly
					rows="8"
					class="block w-full text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none resize-y"
					style="font-size: 13.5px;"
				>${formatValue(value).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
			</div>
		`;
	};

	let formHTML = '<div style="max-width: 700px; margin: 0 auto; padding-left: 30px; padding-right: 30px;">';

	// Event Information fieldset
	formHTML += '<fieldset>';
	formHTML += '<legend class="block text-sm/6 font-semibold text-gray-900 dark:text-white">Event Information</legend>';
	formHTML += '<div class="mt-2 -space-y-px">';

	// Request ID (top, full width)
	formHTML += createInputHTML(
		`event-id-${event.id}`,
		'id',
		'Request ID',
		payload.id,
		'Request ID',
		'text',
		'rounded-t-md'
	);

	// Area and Event (side by side as badges) - Second row

	formHTML += '<div class="grid grid-cols-2 gap-0">';
	formHTML += `
		<div class="bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700 -mr-px">
			<label class="block text-xs font-medium text-gray-900 dark:text-white mb-1.5">Area</label>
			<div class="flex items-center">
				<span class="${getLevelBadgeClass(payload.area)}">${formatValue(payload.area)}</span>
			</div>
		</div>
		<div class="bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700">
			<label class="block text-xs font-medium text-gray-900 dark:text-white mb-1.5">Event</label>
			<div class="flex items-center">
				<span class="${getEventBadgeClass(payload.event)}">${formatValue(payload.event)}</span>
			</div>
		</div>
	`;
	formHTML += '</div>';

	// Timestamp and Received At (side by side)
	formHTML += '<div class="grid grid-cols-2 gap-0">';
	formHTML += `
		<div class="bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700 focus-within:relative focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 dark:focus-within:outline-indigo-500 -mr-px">
			<label for="event-timestamp-${event.id}" class="block text-xs font-medium text-gray-900 dark:text-white">Timestamp</label>
			<input
				id="event-timestamp-${event.id}"
				name="timestamp"
				type="text"
				value="${formatDateForForm(payload.timestamp).replace(/"/g, '&quot;')}"
				placeholder="Timestamp"
				aria-label="Timestamp"
				readonly
				class="block w-full text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
				style="font-size: 13.5px;"
			/>
		</div>
		<div class="bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700 focus-within:relative focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 dark:focus-within:outline-indigo-500">
			<label for="event-received-at-${event.id}" class="block text-xs font-medium text-gray-900 dark:text-white">Received At</label>
			<input
				id="event-received-at-${event.id}"
				name="received_at"
				type="text"
				value="${formatDateForForm(payload.received_at).replace(/"/g, '&quot;')}"
				placeholder="Received At"
				aria-label="Received At"
				readonly
				class="block w-full text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
				style="font-size: 13.5px;"
			/>
		</div>
	`;
	formHTML += '</div>';

	// Schema Version and Success (side by side)
	formHTML += '<div class="grid grid-cols-2 gap-0">';
	formHTML += `
		<div class="bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700 focus-within:relative focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 dark:focus-within:outline-indigo-500 -mr-px">
			<label for="event-schema-version-${event.id}" class="block text-xs font-medium text-gray-900 dark:text-white">Request schema version</label>
			<input
				id="event-schema-version-${event.id}"
				name="telemetry_schema_version"
				type="text"
				value="${formatValue(payload.telemetry_schema_version).replace(/"/g, '&quot;')}"
				placeholder="Request schema version"
				aria-label="Request schema version"
				readonly
				class="block w-full text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
				style="font-size: 13.5px;"
			/>
		</div>
		<div class="bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700">
			<label class="block text-xs font-medium text-gray-900 dark:text-white mb-1.5">Success</label>
			<div class="flex items-center">
				${payload.success === true || payload.success === 'true'? '<img src="/resources/ok.png" alt="OK" class="status-indicator ok" loading="lazy">': '<img src="/resources/ko.png" alt="KO" class="status-indicator ko" loading="lazy">'}
			</div>
		</div>
	`;
	formHTML += '</div>';

	// Version and Error Message (side by side)
	formHTML += '<div class="grid grid-cols-2 gap-0">';
	formHTML += `
		<div class="bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700 focus-within:relative focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 dark:focus-within:outline-indigo-500 rounded-bl-md -mr-px">
			<label for="event-version-${event.id}" class="block text-xs font-medium text-gray-900 dark:text-white">Server version</label>
			<input
				id="event-version-${event.id}"
				name="version"
				type="text"
				value="${formatValue(payload.version).replace(/"/g, '&quot;')}"
				placeholder="Server version"
				aria-label="Server version"
				readonly
				class="block w-full text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
				style="font-size: 13.5px;"
			/>
		</div>
		<div class="bg-white dark:bg-white/5 px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-700 focus-within:relative focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 dark:focus-within:outline-indigo-500 rounded-br-md">
			<label for="event-error-message-${event.id}" class="block text-xs font-medium text-gray-900 dark:text-white">Error Message</label>
			<input
				id="event-error-message-${event.id}"
				name="error_message"
				type="text"
				value="${formatValue(payload.error_message).replace(/"/g, '&quot;')}"
				placeholder="Error Message"
				aria-label="Error Message"
				readonly
				class="block w-full text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
				style="font-size: 13.5px;"
			/>
		</div>
	`;
	formHTML += '</div>';

	formHTML += '</div>';
	formHTML += '</fieldset>';

	formHTML += '</div>';
	return formHTML;
}

(async function initTestPage() {
	const testContent = document.getElementById('testContent');
	if (!testContent) {
		return;
	}

	// Load events from API
	await loadEvents();
	
	// Setup infinite scroll after initial load
	// Use setTimeout to ensure DOM is fully rendered
	setTimeout(() => {
		setupInfiniteScroll();
	}, 100);
}());

async function loadEvents(options = {}) {
	const append = Boolean(options.append); // If true, append events instead of replacing

	// Prevent multiple simultaneous loads
	if (isLoadingMore && append) {
		return;
	}

	if (append) {
		isLoadingMore = true;
	} else {
		currentOffset = 0;
		hasMoreEvents = true;
		loadedEvents = [];
	}

	const testContent = document.getElementById('testContent');
	if (!testContent) {
		return;
	}

	try {
		const params = new URLSearchParams({
			limit: limit.toString(),
			offset: currentOffset.toString(),
			orderBy: 'created_at',
			order: 'desc'
		});

		const response = await fetch(`/api/events?${params}`);
		const validResponse = await handleApiResponse(response);
		if (!validResponse) {
			isLoadingMore = false;
			return;
		}
		const data = await validResponse.json();

		const events = Array.isArray(data.events) ? data.events : [];

		if (events.length > 0) {
			displayEvents(events, append);
			// Calculate hasMore: if we got fewer events than requested, there are no more
			// Also use data.hasMore if available (when total is computed)
			hasMoreEvents = data.hasMore !== undefined? data.hasMore: events.length >= limit; // If we got a full page, assume there might be more
			currentOffset += events.length;
			
			// After appending, check if we need to load more immediately
			// (in case the new content doesn't fill the viewport)
			if (append) {
				// Use requestAnimationFrame to ensure DOM is updated
				requestAnimationFrame(() => {
					const testContent = document.getElementById('testContent');
					if (testContent) {
						const hasOwnScroll = testContent.scrollHeight > testContent.clientHeight;
						const needsMore = !hasOwnScroll || (testContent.scrollHeight - testContent.clientHeight < 100);
						
						if (needsMore && shouldLoadMoreOnScroll() && hasMoreEvents && !isLoadingMore) {
							loadEvents({append: true});
						}
					}
				});
			}
		} else {
			hasMoreEvents = false;
			console.log('[Test Page] No more events to load');
			if (!append) {
				testContent.innerHTML = `
					<div class="teams-loading">
						<p>No events found</p>
					</div>
				`;
			}
		}
	} catch (error) {
		console.error('Error loading events:', error);
		if (!append) {
			if (testContent) {
				testContent.innerHTML = `
					<div class="teams-loading">
						<p>Error loading events: ${escapeHtml(error.message)}</p>
					</div>
				`;
			}
		}
	} finally {
		isLoadingMore = false;
	}
}

function displayEvents(events, append = false) {
	const testContent = document.getElementById('testContent');
	if (!testContent) {
		return;
	}

	// If appending, find the tbody and add rows to it
	// If not appending, replace the entire content
	let tbody;
	if (append) {
		tbody = testContent.querySelector('tbody');
		if (!tbody) {
			return;
		}
	} else {
		// Clear existing content and create new table structure
		testContent.innerHTML = '';
	}

	// Create rows as DOM elements instead of HTML strings
	const rowElements = [];
	
	events.forEach((event) => {
		// When appending, we don't know if it's the last event overall, so always show border
		const borderClass = 'border-b border-gray-200 dark:border-white/10';
		
		const eventData = normalizeEventData(event.data);
		const userLabel = extractUserLabelFromEvent(event, eventData);
		const clientName = event.company_name || '';
		const dataStatus = typeof eventData.status === 'string'? eventData.status.toLowerCase(): null;
		const isToolFailure = event.event === 'tool_call' && (
			dataStatus === 'error' ||
			dataStatus === 'failed' ||
			eventData.success === false ||
			Boolean(eventData.error)
		);
		const isError = event.event === 'tool_error' || event.event === 'error' || isToolFailure;
		const statusIcon = buildStatusIcon(isError);

		// Extract tool name for tool events
		const isToolEvent = event.event === 'tool_call' || event.event === 'tool_error';
		const rawToolName = isToolEvent? (event.tool_name || event.toolName || ''): '';
		const toolName = rawToolName ? escapeHtml(String(rawToolName)) : 'N/A';

		// Extract error message for tool_error events
		const errorMessage = event.event === 'tool_error'? (event.error_message || ''): '';
		const escapedErrorMessage = errorMessage ? escapeHtml(String(errorMessage)) : '';

		// Main row
		const row = document.createElement('tr');
		row.className = 'logs-table-row';
		row.setAttribute('data-event-id', event.id);
		row.style.height = '46px';
		
		row.innerHTML = `
			<td class="${borderClass} pl-4 pr-2 text-center font-medium text-gray-500 dark:text-gray-400" style="height: 46px; vertical-align: middle;">
				<button type="button" id="expand-btn-${event.id}" class="expand-btn" onclick="toggleRowExpand(${event.id})" style="background: none; border: none; cursor: pointer; padding: 4px;">
					<i class="fa-solid fa-chevron-right text-gray-400"></i>
				</button>
			</td>
			<td class="${borderClass} pr-3 pl-4 whitespace-nowrap text-gray-700 dark:text-gray-300 sm:pl-6 " style="height: 46px; vertical-align: middle;">${formatDate(event.timestamp)}</td>
			<td class="${borderClass} px-3 font-medium whitespace-nowrap text-gray-500 dark:text-gray-400" style="height: 46px; vertical-align: middle;">${escapeHtml(userLabel)}</td>
			<td class="hidden ${borderClass} px-3 whitespace-nowrap text-gray-500 dark:text-gray-400 md:table-cell" style="height: 46px; vertical-align: middle;">${escapeHtml(clientName)}</td>
			<td class="${borderClass} px-3 whitespace-nowrap text-gray-500 dark:text-gray-400" style="height: 46px; vertical-align: middle;">
				<span class="${getLevelBadgeClass(event.area)}${!event.area ? ' na' : ''}">${escapeHtml(event.area || 'N/A')}</span>
			</td>
			<td class="${borderClass} px-3 whitespace-nowrap text-gray-500 dark:text-gray-400" style="height: 46px; vertical-align: middle;">
				<span class="${getEventBadgeClass(event.event)}">${escapeHtml(event.event || 'N/A')}</span>
			</td>
			<td class="hidden ${borderClass} px-3 whitespace-nowrap text-gray-500 dark:text-gray-400 lg:table-cell" style="height: 46px; vertical-align: middle;">${toolName}</td>
			<td class="${borderClass} px-3 whitespace-nowrap text-center" style="height: 46px; vertical-align: middle;">${statusIcon}</td>
			<td class="hidden ${borderClass} px-3 whitespace-nowrap text-gray-500 dark:text-gray-400 xl:table-cell overflow-hidden text-ellipsis max-w-48" style="height: 46px; vertical-align: middle;" title="${escapedErrorMessage}">${escapedErrorMessage}</td>
			<td class="${borderClass} px-3 text-center text-gray-500 dark:text-gray-400" style="height: 46px; vertical-align: middle;">
				<button type="button" onclick="loadEventPayload(${event.id})" class="text-gray-500 hover:text-[#2195cf] dark:text-white dark:hover:text-[#2195cf] p-1 rounded" title="View payload">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
					</svg>
				</button>
			</td>
			<td class="${borderClass} pr-4 pl-3 text-right font-medium whitespace-nowrap sm:pr-8 lg:pr-8" style="height: 46px; vertical-align: middle;">
				<button type="button" class="actions-btn hover:text-indigo-900 dark:hover:text-indigo-400" onclick="toggleActionsDropdown(event, ${event.id})" style="background: none; border: none; cursor: pointer; padding: 4px;">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
						<circle cx="8" cy="3" r="1.5"/>
						<circle cx="8" cy="8" r="1.5"/>
						<circle cx="8" cy="13" r="1.5"/>
					</svg>
				</button>
				<div class="actions-dropdown actions-dropdown-left" id="dropdown-${event.id}">
					<div class="actions-dropdown-item" onclick="copyEventPayload(${event.id})">
						<span>Copy payload</span>
					</div>
					<div class="actions-dropdown-item delete" onclick="confirmDeleteEvent(${event.id})">
						<span>Move to trash</span>
					</div>
				</div>
			</td>
		`;
		
		// Expanded row
		const expandedRow = document.createElement('tr');
		expandedRow.className = 'logs-item-expanded';
		expandedRow.id = `expanded-${event.id}`;
		expandedRow.innerHTML = `
			<td colspan="11" class="log-description-expanded px-3 py-4">
				${createEventDetailsFormHTML(event)}
			</td>
		`;
		
		rowElements.push(row);
		rowElements.push(expandedRow);
	});
	
	// For non-append mode, we still need the HTML string
	const rows = append ? null : rowElements.map(row => row.outerHTML).join('');

	if (append) {
		// Append rows directly as DOM elements
		rowElements.forEach(row => {
			tbody.appendChild(row);
		});
		// Add events to loadedEvents array
		loadedEvents.push(...events);
	} else {
		// Create new table structure
		testContent.innerHTML = `
			<div>
				<div class="flow-root">
					<div class="-mx-4 -my-2 sm:-mx-6 lg:-mx-8">
						<div class="inline-block min-w-full py-2 align-middle">
							<table class="min-w-full border-separate border-spacing-0 bg-white dark:bg-gray-900" style="font-size: 13.5px !important;">
								<thead class="bg-gray-50 dark:bg-gray-800/75">
									<tr>
										<th scope="col" class="sticky top-0 z-10 border-b border-gray-300 dark:border-white/15 dark:bg-gray-900/75 py-3.5 pl-4 pr-2 text-left font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter">
											<span class="sr-only">Expand</span>
										</th>
										<th scope="col" class="sticky top-0 z-10 border-b border-gray-300 dark:border-white/15 dark:bg-gray-900/75 py-3.5 pr-3 pl-4 text-left font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter sm:pl-6">Date</th>
										<th scope="col" class="sticky top-0 z-10 border-b border-gray-300 dark:border-white/15 dark:bg-gray-900/75 px-3 py-3.5 text-left font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter">User</th>
										<th scope="col" class="sticky top-0 z-10 hidden border-b border-gray-300 dark:border-white/15 dark:bg-gray-900/75 px-3 py-3.5 text-left font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter md:table-cell">Company</th>
										<th scope="col" class="sticky top-0 z-10 border-b border-gray-300 dark:border-white/15 dark:bg-gray-900/75 px-3 py-3.5 text-left font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter">Area</th>
										<th scope="col" class="sticky top-0 z-10 border-b border-gray-300 dark:border-white/15 dark:bg-gray-900/75 px-3 py-3.5 text-left font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter">Event</th>
										<th scope="col" class="sticky top-0 z-10 hidden border-b border-gray-300 dark:border-white/15 dark:bg-gray-900/75 px-3 py-3.5 text-left font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter lg:table-cell">Tool</th>
										<th scope="col" class="sticky top-0 z-10 border-b border-gray-300 dark:border-white/15 dark:bg-gray-900/75 px-3 py-3.5 text-center font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter">Status</th>
										<th scope="col" class="sticky top-0 z-10 hidden border-b border-gray-300 dark:border-white/15 dark:bg-gray-900/75 px-3 py-3.5 text-left font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter xl:table-cell">Error</th>
										<th scope="col" class="sticky top-0 z-10 border-b border-gray-300 dark:border-white/15 dark:bg-gray-900/75 px-3 py-3.5 text-center font-semibold text-gray-900 dark:text-white backdrop-blur-sm backdrop-filter">Payload</th>
										<th scope="col" class="sticky top-0 z-10 border-b border-gray-300 dark:border-white/15 dark:bg-gray-900/75 py-3.5 pr-4 pl-3 backdrop-blur-sm backdrop-filter sm:pr-6 lg:pr-8">
											<span class="sr-only">Actions</span>
										</th>
									</tr>
								</thead>
								<tbody>
									${rows}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</div>
		`;
		// Store events in loadedEvents array
		loadedEvents = [...events];
		// Get the tbody for adding event listeners
		tbody = testContent.querySelector('tbody');
	}

	// Add click handlers to newly added rows for expansion
	if (tbody) {
		const newRows = append ? Array.from(tbody.querySelectorAll('tr[data-event-id]')).slice(-events.length) : tbody.querySelectorAll('tr[data-event-id]'); // Get only the newly added main rows (not expanded rows)
		
		newRows.forEach(row => {
			// Check if event listener already exists
			if (row.hasAttribute('data-listener-attached')) {
				return;
			}
			row.setAttribute('data-listener-attached', 'true');
			row.addEventListener('click', (evt) => {
				// Don't expand if clicking on actions button or dropdown
				if (evt.target.closest('.actions-btn') || evt.target.closest('.actions-dropdown') || evt.target.closest('.expand-btn')) {
					return;
				}
				const eventId = row.getAttribute('data-event-id');
				if (eventId) {
					toggleRowExpand(Number.parseInt(eventId, 10));
				}
			});
		});
	}
}

// Infinite scroll handler
function shouldLoadMoreOnScroll() {
	const testContent = document.getElementById('testContent');
	if (!testContent) {
		return false;
	}

	// Check if testContent has its own scroll (overflow-y: auto)
	const hasOwnScroll = testContent.scrollHeight > testContent.clientHeight;
	
	if (hasOwnScroll) {
		// testContent has its own scroll container
		const scrollTop = testContent.scrollTop;
		const scrollHeight = testContent.scrollHeight;
		const clientHeight = testContent.clientHeight;
		const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
		return distanceFromBottom < 300; // Load more when 300px from bottom
	} 
		// Use page scroll
		const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
		const windowHeight = window.innerHeight || document.documentElement.clientHeight;
		const documentHeight = Math.max(
			document.body.scrollHeight,
			document.body.offsetHeight,
			document.documentElement.clientHeight,
			document.documentElement.scrollHeight,
			document.documentElement.offsetHeight
		);

		const distanceFromBottom = documentHeight - (scrollTop + windowHeight);
		return distanceFromBottom < 300; // Load more when 300px from bottom
	
}

function handleScroll() {
	if (isLoadingMore) {
		return;
	}

	if (!hasMoreEvents) {
		return;
	}

	if (shouldLoadMoreOnScroll()) {
		loadEvents({append: true});
	}
}

function setupInfiniteScroll() {
	const testContent = document.getElementById('testContent');
	if (!testContent) {
		console.error('[Test Page] testContent not found for infinite scroll setup');
		return;
	}

	// Remove any existing scroll listeners to avoid duplicates
	if (window._testPageScrollHandler) {
		window.removeEventListener('scroll', window._testPageScrollHandler, {passive: true});
		testContent.removeEventListener('scroll', window._testPageScrollHandler, {passive: true});
		clearTimeout(window._testPageScrollTimeout);
		window._testPageScrollTimeout = null;
	}

	// Create new scroll handler with debouncing
	window._testPageScrollHandler = () => {
		// Clear existing timeout
		if (window._testPageScrollTimeout) {
			clearTimeout(window._testPageScrollTimeout);
		}
		
		// Set new timeout
		window._testPageScrollTimeout = setTimeout(() => {
			handleScroll();
			window._testPageScrollTimeout = null;
		}, 150);
	};

	// Check if testContent has its own scroll
	const hasOwnScroll = testContent.scrollHeight > testContent.clientHeight;
	
	if (hasOwnScroll) {
		// Listen to testContent scroll
		testContent.addEventListener('scroll', window._testPageScrollHandler, {passive: true});
		console.log(`[Test Page] Infinite scroll setup on testContent container (scrollHeight: ${testContent.scrollHeight}, clientHeight: ${testContent.clientHeight}, hasMore: ${hasMoreEvents}, offset: ${currentOffset})`);
	} else {
		// Listen to page scroll
		window.addEventListener('scroll', window._testPageScrollHandler, {passive: true});
		console.log(`[Test Page] Infinite scroll setup on window (scrollHeight: ${document.documentElement.scrollHeight}, innerHeight: ${window.innerHeight}, hasMore: ${hasMoreEvents}, offset: ${currentOffset})`);
	}
	
	// Also listen to wheel events for better detection
	testContent.addEventListener('wheel', window._testPageScrollHandler, {passive: true});
}

// Listen for soft navigation events
window.addEventListener('softNav:pageMounted', (event) => {
	if (event.detail.path === '/test') {
		// Re-initialize if needed
		loadEvents();
		setupInfiniteScroll();
	}
});

// Payload modal functions
async function loadEventPayload(eventId) {
	// Try to find event in loaded events first
	let event = loadedEvents.find(e => e.id === eventId);
	
	// If not found, fetch from API
	if (!event) {
		try {
			const response = await fetch(`/api/events/${eventId}`);
			const validResponse = await handleApiResponse(response);
			if (!validResponse) {return;}
			event = await validResponse.json();
		} catch (error) {
			console.error('Error loading event:', error);
			return;
		}
	}
	
	if (!event) {
		console.error('Event not found:', eventId);
		return;
	}
	
	// event.data contains the original payload
	const payload = event.data || event;
	showPayloadModal(payload, eventId);
}

function showPayloadModal(payload, eventId) {
	// Remove existing payload modal if any
	const existingModal = document.querySelector('.payload-modal-backdrop');
	if (existingModal) {
		existingModal.remove();
	}

	// Create backdrop
	const backdrop = document.createElement('div');
	backdrop.className = 'confirm-modal-backdrop payload-modal-backdrop';

	// Create modal
	const modal = document.createElement('div');
	modal.className = 'confirm-modal payload-modal';

	// Format payload as pretty JSON
	const formattedPayload = JSON.stringify(payload, null, 2);

	modal.innerHTML = `
		<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 dark:bg-gray-800">
			<div class="payload-modal-header">
				<h3 id="payload-modal-title" class="text-base font-semibold text-gray-900 dark:text-white">Payload</h3>
			</div>
			<div class="payload-modal-content">
				<div class="mt-4 rounded-lg outline-1 -outline-offset-1 outline-gray-300 dark:outline-white/10">
					<label for="payload-code" class="sr-only">Event Payload JSON</label>
					<pre class="payload-modal-code"><code id="payload-code" class="language-json" aria-label="Event payload JSON"></code></pre>
				</div>
			</div>
		</div>
		<div class="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 dark:bg-gray-800/50">
			<button type="button" class="inline-flex w-full justify-center items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 sm:ml-3 sm:w-auto" data-action="copy">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 mr-1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
				</svg>
				<span data-copy-text>Copy</span>
			</button>
			<button type="button" class="mt-3 inline-flex w-full justify-center items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto dark:bg-gray-700 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-600" data-action="save">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 mr-1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
				</svg>
				Save
			</button>
			<button type="button" class="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:ml-3 sm:w-auto dark:bg-gray-700 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-600" data-action="close-modal">Close</button>
		</div>
	`;

	backdrop.appendChild(modal);
	document.body.appendChild(backdrop);
	requestAnimationFrame(() => {
		backdrop.classList.add('visible');
	});

	const codeElement = modal.querySelector('#payload-code');
	if (codeElement) {
		codeElement.textContent = formattedPayload;
		// Apply Highlight.js syntax highlighting
		requestAnimationFrame(() => {
			if (window.hljs && typeof window.hljs.highlightElement === 'function') {
				window.hljs.highlightElement(codeElement);
			} else {
				setTimeout(() => {
					if (window.hljs && typeof window.hljs.highlightElement === 'function') {
						window.hljs.highlightElement(codeElement);
					}
				}, 100);
			}
		});
	}

	const closeAction = modal.querySelector('[data-action="close-modal"]');
	const copyBtn = modal.querySelector('[data-action="copy"]');
	const saveBtn = modal.querySelector('[data-action="save"]');

	const handleClose = () => closePayloadModal();
	if (closeAction) { closeAction.addEventListener('click', handleClose); }
	if (copyBtn) {
		copyBtn.addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(formattedPayload);
				const textSpan = copyBtn.querySelector('[data-copy-text]');
				if (textSpan) {
					const originalText = textSpan.textContent;
					textSpan.textContent = 'Copied!';
					copyBtn.disabled = true;
					setTimeout(() => {
						textSpan.textContent = originalText;
						copyBtn.disabled = false;
					}, 1600);
				}
			} catch (error) {
				console.error('Error copying payload:', error);
			}
		});
	}
	if (saveBtn) {
		saveBtn.addEventListener('click', () => {
			const blob = new Blob([formattedPayload], {type: 'application/json'});
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `event-payload-${eventId}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		});
	}

	// Close modal when clicking backdrop
	backdrop.addEventListener('click', (e) => {
		if (e.target === backdrop) {
			closePayloadModal();
		}
	});

	// Close modal on Escape key and handle Cmd+A/Ctrl+A
	const handleKeydown = function (e) {
		if (e.key === 'Escape') {
			closePayloadModal();
		} else if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
			// Check if focus is within the payload modal
			const activeElement = document.activeElement;
			const isInModal = backdrop.contains(activeElement) || backdrop === activeElement;
			
			if (isInModal) {
				e.preventDefault();
				// Select all text in the code element
				const codeEl = modal.querySelector('#payload-code');
				if (codeEl) {
					const range = document.createRange();
					range.selectNodeContents(codeEl);
					const selection = window.getSelection();
					selection.removeAllRanges();
					selection.addRange(range);
				}
			}
		}
	};
	modal._payloadKeydownHandler = handleKeydown;
	document.addEventListener('keydown', handleKeydown);
}

function closePayloadModal() {
	const modal = document.querySelector('.payload-modal-backdrop');
	if (modal) {
		const dialog = modal.querySelector('.payload-modal');
		if (dialog?._payloadKeydownHandler) {
			document.removeEventListener('keydown', dialog._payloadKeydownHandler);
		}
		modal.classList.remove('visible');
		modal.classList.add('hiding');
		setTimeout(() => {
			modal.remove();
		}, 150);
	}
}

// Actions dropdown functions
let dropdownScrollPosition = null;
let scrollHandler = null;
let scrollListeners = [];

function closeAllDropdowns() {
	document.querySelectorAll('.actions-dropdown').forEach(dropdown => {
		dropdown.classList.remove('show');
	});
	// Clean up scroll listeners
	if (scrollHandler) {
		window.removeEventListener('scroll', scrollHandler, true);
		document.removeEventListener('scroll', scrollHandler, true);

		// Remove listeners from all tracked containers
		scrollListeners.forEach(({element, handler}) => {
			if (element && element.removeEventListener) {
				element.removeEventListener('scroll', handler, true);
			}
		});

		scrollHandler = null;
		scrollListeners = [];
	}
	dropdownScrollPosition = null;
}

function toggleActionsDropdown(e, eventId) {
	e.stopPropagation();
	const dropdown = document.getElementById(`dropdown-${eventId}`);
	if (!dropdown) {return;}

	const isShowing = dropdown.classList.contains('show');
	const button = e.target.closest('.actions-btn');

	// Close all other dropdowns
	closeAllDropdowns();

	// Toggle this dropdown
	if (!isShowing) {
		// Calculate position relative to the button
		if (button) {
			const rect = button.getBoundingClientRect();

			// Ensure dropdown doesn't go off-screen
			// First, make it visible with opacity 0 to measure its size accurately
			dropdown.style.opacity = '0';
			dropdown.style.display = 'block';
			dropdown.style.pointerEvents = 'none';

			// Force a reflow to ensure the element is laid out
			const _ = dropdown.offsetHeight; // eslint-disable-line no-unused-vars

			const dropdownRect = dropdown.getBoundingClientRect();

			// Position dropdown to the left of the button, vertically centered
			let left = rect.left - dropdownRect.width - 8 - (dropdownRect.width / 2) - 13;
			let top = rect.top + (rect.height / 2) - (dropdownRect.height / 2) - (dropdownRect.height / 2) - 18;

			// Check if dropdown would go off the left edge
			if (left < 4) {
				left = 4;
			}

			// Check if dropdown would go off the top of the screen
			if (top < 4) {
				top = 4;
			}

			// Check if dropdown would go off the bottom of the screen
			if (top + dropdownRect.height > window.innerHeight - 4) {
				top = window.innerHeight - dropdownRect.height - 4;
			}

			dropdown.style.top = `${Math.max(4, top)}px`;
			dropdown.style.left = `${Math.max(4, left)}px`;
			dropdown.style.right = 'auto';
			dropdown.style.bottom = 'auto';
			dropdown.style.zIndex = '10000';
			dropdown.style.opacity = '';
			dropdown.style.pointerEvents = '';
		}

		// Use requestAnimationFrame to ensure the positioning is applied before transition
		requestAnimationFrame(() => {
			dropdown.classList.add('show');

			// Set up scroll listener to close dropdown when table scrolls
			dropdownScrollPosition = {
				windowScrollY: window.scrollY || window.pageYOffset,
				windowScrollX: window.scrollX || window.pageXOffset
			};

			// Find scrollable container (could be window or a container element)
			const containerContent = document.querySelector('.container-content');
			const testContent = document.getElementById('testContent');

			if (containerContent) {
				dropdownScrollPosition.containerScrollTop = containerContent.scrollTop;
				dropdownScrollPosition.containerScrollLeft = containerContent.scrollLeft;
			}

			if (testContent) {
				dropdownScrollPosition.testContentScrollTop = testContent.scrollTop;
				dropdownScrollPosition.testContentScrollLeft = testContent.scrollLeft;
			}

			// Create scroll handler
			scrollHandler = () => {
				if (!dropdownScrollPosition) {return;}

				let scrollDelta = 0;

				// Check window scroll
				const currentWindowScrollY = window.scrollY || window.pageYOffset;
				const currentWindowScrollX = window.scrollX || window.pageXOffset;
				const windowDeltaY = Math.abs(currentWindowScrollY - dropdownScrollPosition.windowScrollY);
				const windowDeltaX = Math.abs(currentWindowScrollX - dropdownScrollPosition.windowScrollX);
				scrollDelta = Math.max(windowDeltaY, windowDeltaX);

				// Check container scroll if it exists
				if (containerContent && dropdownScrollPosition.containerScrollTop !== undefined) {
					const containerDeltaY = Math.abs(containerContent.scrollTop - dropdownScrollPosition.containerScrollTop);
					const containerDeltaX = Math.abs(containerContent.scrollLeft - dropdownScrollPosition.containerScrollLeft);
					scrollDelta = Math.max(scrollDelta, containerDeltaY, containerDeltaX);
				}

				// Check testContent scroll if it exists
				if (testContent && dropdownScrollPosition.testContentScrollTop !== undefined) {
					const testContentDeltaY = Math.abs(testContent.scrollTop - dropdownScrollPosition.testContentScrollTop);
					const testContentDeltaX = Math.abs(testContent.scrollLeft - dropdownScrollPosition.testContentScrollLeft);
					scrollDelta = Math.max(scrollDelta, testContentDeltaY, testContentDeltaX);
				}

				// Close dropdown if scroll has moved 3px or more
				if (scrollDelta >= 3) {
					closeAllDropdowns();
				}
			};

			// Add scroll listeners to window and document
			window.addEventListener('scroll', scrollHandler, true);
			document.addEventListener('scroll', scrollHandler, true);

			// Also listen to scroll on container elements
			if (containerContent) {
				containerContent.addEventListener('scroll', scrollHandler, true);
				scrollListeners.push({element: containerContent, handler: scrollHandler});
			}
			if (testContent) {
				testContent.addEventListener('scroll', scrollHandler, true);
				scrollListeners.push({element: testContent, handler: scrollHandler});
			}
		});
	} else {
		// Close dropdown if clicking to close
		closeAllDropdowns();
	}
}

async function copyEventPayload(eventId) {
	// Try to find event in loaded events first
	let event = loadedEvents.find(e => e.id === eventId);
	
	// If not found, fetch from API
	if (!event) {
		try {
			const response = await fetch(`/api/events/${eventId}`);
			const validResponse = await handleApiResponse(response);
			if (!validResponse) {return;}
			event = await validResponse.json();
		} catch (error) {
			console.error('Error loading event:', error);
			return;
		}
	}
	
	if (!event) {
		console.error('Event not found:', eventId);
		return;
	}
	
	// event.data contains the original payload
	const payload = event.data || event;
	const formattedPayload = JSON.stringify(payload, null, 2);

	try {
		await navigator.clipboard.writeText(formattedPayload);
		console.log('Payload copied to clipboard');
	} catch (error) {
		console.error('Error copying payload:', error);
	}

	// Close dropdown
	closeAllDropdowns();
}

function confirmDeleteEvent(eventId) {
	// For test page, just log the action
	console.log('Delete event:', eventId);

	// Close dropdown
	closeAllDropdowns();
}

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
	if (!e.target.closest('.actions-btn') && !e.target.closest('.actions-dropdown')) {
		closeAllDropdowns();
	}
});

// Toggle row expansion
function toggleRowExpand(eventId) {
	const expandedRow = document.getElementById(`expanded-${eventId}`);
	const mainRow = document.querySelector(`tr[data-event-id="${eventId}"]`);
	const expandBtn = document.getElementById(`expand-btn-${eventId}`);

	if (!expandedRow || !mainRow || !expandBtn) {
		return;
	}

	if (expandedRow.classList.contains('expanded')) {
		// Collapse
		expandedRow.classList.remove('expanded');
		expandBtn.classList.remove('expanded');
		mainRow.classList.remove('expanded');
	} else {
		// Expand
		expandedRow.classList.add('expanded');
		expandBtn.classList.add('expanded');
		mainRow.classList.add('expanded');
	}
}

// Make functions globally available
window.loadEventPayload = loadEventPayload;
window.closePayloadModal = closePayloadModal;
window.toggleActionsDropdown = toggleActionsDropdown;
window.copyEventPayload = copyEventPayload;
window.confirmDeleteEvent = confirmDeleteEvent;
window.toggleRowExpand = toggleRowExpand;

// Refresh function for the header button
window.refreshTest = async function refreshTest(event) {
	if (event?.preventDefault) {
		event.preventDefault();
	}
	const button = event?.currentTarget;
	const icon = button?.querySelector('.refresh-icon');
	if (icon) {
		icon.classList.add('rotating');
	}
	try {
		// Reset pagination state and reload events from API
		currentOffset = 0;
		hasMoreEvents = true;
		isLoadingMore = false;
		await loadEvents();
		// Re-setup infinite scroll after refresh
		setupInfiniteScroll();
	} catch (error) {
		console.error('Error refreshing test page:', error);
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
