// @ts-nocheck
// Test page functionality

const REFRESH_ICON_ANIMATION_DURATION_MS = 700;

// Test page content with event log table structure
const sampleData = [
		{id: 1, name: 'Lindsay Walton', date: '15 jan 14:30', company: 'Acme Corp', area: 'Salesforce', event: 'tool_call', tool: 'executeQuery', status: 'success', error: '', payload: 'Query executed successfully'},
		{id: 2, name: 'Courtney Henry', date: '15 jan 15:45', company: 'Tech Solutions', area: 'Apex', event: 'session_start', tool: '', status: 'success', error: '', payload: 'Session initialized'},
		{id: 3, name: 'Tom Cook', date: '15 jan 16:20', company: 'Acme Corp', area: 'Salesforce', event: 'tool_call', tool: 'getMetadata', status: 'error', error: 'Connection timeout', payload: 'Failed to fetch metadata'},
		{id: 4, name: 'Whitney Francis', date: '15 jan 17:10', company: 'Tech Solutions', area: 'Apex', event: 'custom', tool: '', status: 'success', error: '', payload: 'Custom event logged'},
		{id: 5, name: 'Leonard Krasner', date: '15 jan 18:00', company: 'Acme Corp', area: 'Salesforce', event: 'tool_call', tool: 'executeQuery', status: 'success', error: '', payload: 'Query executed successfully'},
		{id: 6, name: 'Floyd Miles', date: '15 jan 19:15', company: 'Tech Solutions', area: 'Apex', event: 'session_start', tool: '', status: 'success', error: '', payload: 'Session initialized'},
		{id: 7, name: 'Emily Selman', date: '15 jan 20:30', company: 'Acme Corp', area: 'Salesforce', event: 'tool_call', tool: 'getMetadata', status: 'error', error: 'Connection timeout', payload: 'Failed to fetch metadata'},
		{id: 8, name: 'Kristin Watson', date: '15 jan 21:45', company: 'Tech Solutions', area: 'Apex', event: 'custom', tool: '', status: 'success', error: '', payload: 'Custom event logged'},
		{id: 9, name: 'Emma Dorsey', date: '15 jan 22:00', company: 'Acme Corp', area: 'Salesforce', event: 'tool_call', tool: 'executeQuery', status: 'success', error: '', payload: 'Query executed successfully'},
		{id: 10, name: 'Alicia Bell', date: '15 jan 23:20', company: 'Tech Solutions', area: 'Apex', event: 'session_start', tool: '', status: 'success', error: '', payload: 'Session initialized'},
		{id: 11, name: 'Jenny Wilson', date: '16 jan 09:10', company: 'Acme Corp', area: 'Salesforce', event: 'tool_call', tool: 'getMetadata', status: 'error', error: 'Connection timeout', payload: 'Failed to fetch metadata'},
		{id: 12, name: 'Anna Roberts', date: '16 jan 10:30', company: 'Tech Solutions', area: 'Apex', event: 'custom', tool: '', status: 'success', error: '', payload: 'Custom event logged'},
		{id: 13, name: 'Benjamin Russel', date: '16 jan 11:45', company: 'Acme Corp', area: 'Salesforce', event: 'tool_call', tool: 'executeQuery', status: 'success', error: '', payload: 'Query executed successfully'},
		{id: 14, name: 'Jeffrey Webb', date: '16 jan 12:00', company: 'Tech Solutions', area: 'Apex', event: 'session_start', tool: '', status: 'success', error: '', payload: 'Session initialized'},
		{id: 15, name: 'Kathryn Murphy', date: '16 jan 13:15', company: 'Acme Corp', area: 'Salesforce', event: 'tool_call', tool: 'getMetadata', status: 'error', error: 'Connection timeout', payload: 'Failed to fetch metadata'}
];

// Generate sample payload based on event data
function generateSamplePayload(event) {
	const now = new Date();
	const basePayload = {
		id: event.id,
		timestamp: now.toISOString(),
		received_at: new Date(now.getTime() - 100).toISOString(), // 100ms abans del timestamp
		telemetry_schema_version: 2,
		area: event.area,
		event: event.event,
		success: event.status === 'success',
		version: '1.0.0',
		error_message: event.error || null
	};

	return basePayload;
}

// Create event details form HTML
function createEventDetailsFormHTML(event) {
	const payload = generateSamplePayload(event);

	const formatDate = (dateString) => {
		if (!dateString) {return '';}
		try {
			const date = new Date(dateString);
			if (isNaN(date.getTime())) {return dateString;}

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
		} catch (e) {
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

	const createTextareaHTML = (id, name, label, value, placeholder = '') => {
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
	const getLevelBadgeClass = (area) => {
		const levelMap = {
			'Salesforce': 'tool',
			'Apex': 'session',
			'general': 'general'
		};
		const levelClass = levelMap[area] || 'session';
		return `level-badge ${levelClass}`;
	};

	const getEventBadgeClass = (eventType) => {
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
	};

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
				value="${formatDate(payload.timestamp).replace(/"/g, '&quot;')}"
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
				value="${formatDate(payload.received_at).replace(/"/g, '&quot;')}"
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

	const statusIcon = (status) => {
		if (status === 'success') {
			return '<img src="/resources/ok.png" alt="OK" class="status-indicator ok" loading="lazy">';
		} else if (status === 'error') {
			return '<img src="/resources/ko.png" alt="KO" class="status-indicator ko" loading="lazy">';
		}
		return '<img src="/resources/ok.png" alt="OK" class="status-indicator ok" loading="lazy">';
	};

	const payloadIcon = (eventId) => {
		return `<button type="button" onclick="loadEventPayload(${eventId})" class="text-gray-500 hover:text-[#2195cf] dark:text-white dark:hover:text-[#2195cf] p-1 rounded" title="View payload">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
				<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
			</svg>
		</button>`;
	};

	const getLevelClass = (area) => {
		const levelMap = {
			'Salesforce': 'tool',
			'Apex': 'session',
			'general': 'general'
		};
		return levelMap[area] || 'session';
	};

	const getLevelBadgeClass = (area) => {
		const levelClass = getLevelClass(area);
		return `level-badge ${levelClass}`;
	};

	const getEventBadgeClass = (eventType) => {
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
	};

	const rows = sampleData.map((row, index) => {
		const isLast = index === sampleData.length - 1;
		const borderClass = isLast ? '' : 'border-b border-gray-200 dark:border-white/10';
		return `
		<tr data-event-id="${row.id}" class="test-table-row" style="height: 46px;">
			<td class="${borderClass} pl-4 pr-2 text-center font-medium text-gray-500 dark:text-gray-400" style="height: 46px; vertical-align: middle;">
				<button type="button" id="expand-btn-${row.id}" class="expand-btn" onclick="toggleRowExpand(${row.id})" style="background: none; border: none; cursor: pointer; padding: 4px;">
					<i class="fa-solid fa-chevron-right text-gray-400"></i>
				</button>
			</td>
			<td class="${borderClass} pr-3 pl-4 whitespace-nowrap text-gray-700 dark:text-gray-300 sm:pl-6 " style="height: 46px; vertical-align: middle;">${row.date}</td>
			<td class="${borderClass} px-3 font-medium whitespace-nowrap text-gray-500 dark:text-gray-400" style="height: 46px; vertical-align: middle;">${row.name}</td>
			<td class="hidden ${borderClass} px-3 whitespace-nowrap text-gray-500 dark:text-gray-400 md:table-cell" style="height: 46px; vertical-align: middle;">${row.company}</td>
			<td class="${borderClass} px-3 whitespace-nowrap text-gray-500 dark:text-gray-400" style="height: 46px; vertical-align: middle;">
				<span class="${getLevelBadgeClass(row.area)}">${row.area}</span>
			</td>
			<td class="${borderClass} px-3 whitespace-nowrap text-gray-500 dark:text-gray-400" style="height: 46px; vertical-align: middle;">
				<span class="${getEventBadgeClass(row.event)}">${row.event}</span>
			</td>
			<td class="hidden ${borderClass} px-3 whitespace-nowrap text-gray-500 dark:text-gray-400 lg:table-cell" style="height: 46px; vertical-align: middle;">${row.tool || 'N/A'}</td>
			<td class="${borderClass} px-3 whitespace-nowrap text-center" style="height: 46px; vertical-align: middle;">${statusIcon(row.status)}</td>
			<td class="hidden ${borderClass} px-3 whitespace-nowrap text-gray-500 dark:text-gray-400 xl:table-cell overflow-hidden text-ellipsis max-w-48" style="height: 46px; vertical-align: middle;">${row.error || ''}</td>
			<td class="${borderClass} px-3 text-center text-gray-500 dark:text-gray-400" style="height: 46px; vertical-align: middle;">${payloadIcon(row.id)}</td>
			<td class="${borderClass} pr-4 pl-3 text-right font-medium whitespace-nowrap sm:pr-8 lg:pr-8" style="height: 46px; vertical-align: middle;">
				<button type="button" class="actions-btn hover:text-indigo-900 dark:hover:text-indigo-400" onclick="toggleActionsDropdown(event, ${row.id})" style="background: none; border: none; cursor: pointer; padding: 4px;">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
						<circle cx="8" cy="3" r="1.5"/>
						<circle cx="8" cy="8" r="1.5"/>
						<circle cx="8" cy="13" r="1.5"/>
					</svg>
				</button>
				<div class="actions-dropdown actions-dropdown-left" id="dropdown-${row.id}">
					<div class="actions-dropdown-item" onclick="copyEventPayload(${row.id})">
						<span>Copy payload</span>
					</div>
					<div class="actions-dropdown-item delete" onclick="confirmDeleteEvent(${row.id})">
						<span>Move to trash</span>
					</div>
				</div>
			</td>
		</tr>
		<tr class="test-item-expanded" id="expanded-${row.id}">
			<td colspan="11" class="log-description-expanded px-3 py-4">
				${createEventDetailsFormHTML(row)}
			</td>
		</tr>
	`;
	}).join('');


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

	// Add click handlers to rows for expansion
	const tbody = testContent.querySelector('tbody');
	if (tbody) {
		const mainRows = tbody.querySelectorAll('tr[data-event-id]');
		mainRows.forEach(row => {
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

	// Listen for soft navigation events
	window.addEventListener('softNav:pageMounted', (event) => {
		if (event.detail.path === '/test') {
			// Re-initialize if needed
		}
	});
}());

// Payload modal functions
function loadEventPayload(eventId) {
	const event = sampleData.find(e => e.id === eventId);
	if (!event) {
		console.error('Event not found:', eventId);
		return;
	}
	const payload = generateSamplePayload(event);
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
				hljs.highlightElement(codeElement);
			} else {
				setTimeout(() => {
					if (window.hljs && typeof window.hljs.highlightElement === 'function') {
						hljs.highlightElement(codeElement);
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

	// Close modal on Escape key
	const handleKeydown = function (e) {
		if (e.key === 'Escape') {
			closePayloadModal();
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
			void dropdown.offsetHeight;

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
	const event = sampleData.find(e => e.id === eventId);
	if (!event) {
		console.error('Event not found:', eventId);
		return;
	}
	const payload = generateSamplePayload(event);
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
window.refreshTest = function refreshTest(event) {
	if (event?.preventDefault) {
		event.preventDefault();
	}
	const button = event?.currentTarget;
	const icon = button?.querySelector('.refresh-icon');
	if (icon) {
		icon.classList.add('rotating');
	}
	try {
		// For test page, we can just reload the content or do nothing
		// Since it's static content, we just show the animation
		console.log('Test page refreshed');
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
