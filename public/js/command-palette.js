// @ts-nocheck
// Command palette functionality for global header search
(function initCommandPalette() {
	let commandPaletteElement = null;
	let searchInput = null;
	let commandList = null;
	let isOpen = false;

	// Define available commands
	const commands = [
		// Navigation commands
		{
			id: 'nav-dashboard',
			type: 'navigation',
			title: 'Dashboard',
			description: 'Go to Dashboard',
			icon: 'chart-bar',
			action: () => navigateTo('/'),
			shortcut: 'D'
		},
		{
			id: 'nav-logs',
			type: 'navigation',
			title: 'Logs',
			description: 'Go to Event Logs',
			icon: 'list-ul',
			action: () => navigateTo('/logs'),
			shortcut: 'L'
		},
		{
			id: 'nav-teams',
			type: 'navigation',
			title: 'Teams',
			description: 'Go to Teams',
			icon: 'users',
			action: () => navigateTo('/teams'),
			shortcut: 'T'
		},
		{
			id: 'nav-people',
			type: 'navigation',
			title: 'People',
			description: 'Go to People',
			icon: 'user-group',
			action: () => navigateTo('/people'),
			shortcut: 'P'
		},
		// Action commands
		{
			id: 'action-refresh',
			type: 'action',
			title: 'Refresh',
			description: 'Refresh current page data',
			icon: 'arrow-path',
			action: () => {
				if (typeof window.handleRefreshClick === 'function') {
					window.handleRefreshClick();
				} else if (typeof window !== 'undefined' && typeof window.location !== 'undefined' && typeof window.location.reload === 'function') {
					// Fallback: perform a full page reload if no custom handler is available
					window.location.reload();
				}
			},
			shortcut: 'R'
		},
		{
			id: 'action-settings',
			type: 'action',
			title: 'Settings',
			description: 'Open settings modal',
			icon: 'cog-6-tooth',
			action: () => openSettingsModal(),
			shortcut: 'S'
		}
	];

	/**
	 * Build command palette HTML
	 */
	function buildCommandPaletteHTML() {
		return `
      <div id="commandPaletteBackdrop" class="fixed inset-0 bg-gray-900/60 backdrop-blur-xs z-50 command-palette-backdrop-hidden">
        <div class="fixed inset-0 w-screen overflow-y-auto p-4 focus:outline-none sm:p-6 md:p-20 flex items-center justify-center">
          <div class="w-full mx-auto block max-w-2xl overflow-hidden rounded-xl bg-white/70 dark:bg-gray-800/70 shadow-2xl outline-1 outline-black/5 dark:outline-white/10 backdrop-blur-lg backdrop-filter command-palette-panel-hidden -mt-32 sm:-mt-36">
            <div class="grid grid-cols-1 border-b border-gray-500/10 dark:border-gray-700/50">
              <input type="text" placeholder="Search commands..." class="col-start-1 row-start-1 h-12 w-full bg-transparent pr-4 pl-11 text-base text-gray-900 dark:text-white outline-hidden placeholder:text-gray-500 dark:placeholder:text-gray-400 sm:text-sm" id="commandPaletteInput" />
              <svg viewBox="0 0 20 20" fill="currentColor" data-slot="icon" aria-hidden="true" class="pointer-events-none col-start-1 row-start-1 ml-4 size-5 self-center text-gray-900/40 dark:text-white/40">
                <path d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clip-rule="evenodd" fill-rule="evenodd" />
              </svg>
            </div>

            <div class="block max-h-80 scroll-py-2 overflow-y-auto scrollbar-transparent" id="commandList">
              <div class="block divide-y divide-gray-500/10 dark:divide-gray-700/50">
                <div class="p-2">
                  <h2 class="mt-4 mb-2 px-3 text-xs font-semibold text-gray-900 dark:text-white">Quick actions</h2>
                  <div class="text-sm text-gray-700 dark:text-gray-300" id="commandItems">
                    ${renderCommandItems(commands)}
                  </div>
                </div>
              </div>

              <div class="hidden block px-6 py-14 text-center sm:px-14" id="noResults">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" data-slot="icon" aria-hidden="true" class="mx-auto size-6 text-gray-900/40 dark:text-white/40">
                  <path d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <p class="mt-4 text-sm text-gray-900 dark:text-white">We couldn't find any commands with that term. Please try again.</p>
              </div>
            </div>

            <div class="flex flex-wrap items-center bg-gray-50/30 dark:bg-gray-800/15 px-4 py-2.5 text-xs text-gray-700 dark:text-gray-300 border-t border-gray-200 dark:border-gray-700/50">
              Type <kbd class="mx-1 flex size-5 items-center justify-center rounded-sm border border-gray-400 dark:border-white/10 bg-white dark:bg-gray-800 font-semibold text-gray-900 dark:text-white in-data-[mode=project]:border-indigo-600 dark:in-data-[mode=project]:border-indigo-500 in-data-[mode=project]:text-indigo-600 dark:in-data-[mode=project]:text-indigo-500 sm:mx-2">#</kbd> <span class="sm:hidden">for projects,</span><span class="hidden sm:inline">to access projects,</span> <kbd class="mx-1 flex size-5 items-center justify-center rounded-sm border border-gray-400 dark:border-white/10 bg-white dark:bg-gray-800 font-semibold text-gray-900 dark:text-white in-data-[mode=user]:border-indigo-600 dark:in-data-[mode=user]:border-indigo-500 in-data-[mode=user]:text-indigo-600 dark:in-data-[mode=user]:text-indigo-500 sm:mx-2">&gt;</kbd> for users, and <kbd class="mx-1 flex size-5 items-center justify-center rounded-sm border border-gray-400 dark:border-white/10 bg-white dark:bg-gray-800 font-semibold text-gray-900 dark:text-white in-data-[mode=help]:border-indigo-600 dark:in-data-[mode=help]:border-indigo-500 in-data-[mode=help]:text-indigo-600 dark:in-data-[mode=help]:text-indigo-500 sm:mx-2">?</kbd> for help.
            </div>
          </div>
        </div>
      </div>
    `;
	}

	/**
	 * Render command items HTML
	 */
	function renderCommandItems(commandsToRender) {
		return commandsToRender.map(command => `
      <a href="#" class="command-item group flex cursor-default items-center rounded-md px-3 py-2 select-none focus:outline-hidden aria-selected:bg-gray-900/5 aria-selected:text-gray-900" data-command-id="${command.id}" data-command-type="${command.type}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" data-slot="icon" aria-hidden="true" class="size-6 flex-none text-gray-900/40 group-aria-selected:text-gray-900">
          <path stroke-linecap="round" stroke-linejoin="round" d="${getIconPath(command.icon)}" />
        </svg>
        <span class="ml-3 flex-auto truncate">${command.title}</span>
        <span class="ml-3 flex-none text-xs font-semibold text-gray-500 group-aria-selected:inline">
          ${command.shortcut ? `<kbd class="font-sans">${command.shortcut}</kbd>` : ''}
        </span>
      </a>
    `).join('');
	}

	/**
	 * Get icon path for different icons
	 */
	function getIconPath(iconName) {
		const icons = {
			'chart-bar': 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C21.496 3 22 3.504 22 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z',
			'list-ul': 'M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
			'users': 'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z',
			'user-group': 'M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z',
			'arrow-path': 'M4.5 12c0-1.232.046-2.453.138-3.662a4.006 4.006 0 0 1 3.7-3.7 48.678 48.678 0 0 1 7.324 0 4.006 4.006 0 0 1 3.7 3.7c.017.22.032.441.046.662M4.5 12l-3-3m3 3 3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 1 3.7 3.7 48.656 48.656 0 0 1 7.324 0 4.006 4.006 0 0 1 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3',
			'cog-6-tooth': 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
			'bell': 'M5.85 3.5a.75.75 0 0 0-1.117-1 9.719 9.719 0 0 0-2.348 4.876.75.75 0 0 0 1.479.248A8.219 8.219 0 0 1 5.85 3.5ZM19.267 2.5a.75.75 0 1 0-1.118 1 8.22 8.22 0 0 1 1.987 4.124.75.75 0 0 0 1.48-.248A9.72 9.72 0 0 0 19.267 2.5Z M12 4.25A3.75 3.75 0 0 0 8.25 8v3.75a.75.75 0 0 1-.22.53l-2.25 2.25a.75.75 0 0 1-1.06-1.06l1.72-1.72A.25.25 0 0 0 6.75 12V8a2.25 2.25 0 0 1 4.5 0v3.75a.75.75 0 0 1-.22.53l-2.25 2.25a.75.75 0 0 1-1.06-1.06l1.72-1.72A.25.25 0 0 0 9.25 12V8A3.75 3.75 0 0 0 12 4.25Z',
			'moon': 'M17.293 13.293A8 8 0 0 1 6.707 2.707a8.001 8.001 0 1 0 10.586 10.586Z',
			'arrow-right-on-rectangle': 'M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z'
		};
		return icons[iconName] || icons['cog-6-tooth'];
	}

	/**
	 * Check if user is currently editing in an input/textarea or if modals are open
	 */
	function isUserEditing() {
		const activeElement = document.activeElement;
		if (!activeElement) {
			return false;
		}

		// Check for input elements (excluding buttons, checkboxes, etc.)
		if (activeElement.tagName === 'INPUT') {
			const inputType = activeElement.type;
			return inputType === 'text' || inputType === 'password' || inputType === 'email' ||
				inputType === 'search' || inputType === 'url' || inputType === 'tel' ||
				!inputType; // default is text
		}

		// Check for textarea elements
		if (activeElement.tagName === 'TEXTAREA') {
			return true;
		}

		// Check for contenteditable elements
		if (activeElement.hasAttribute('contenteditable') &&
			activeElement.getAttribute('contenteditable') !== 'false') {
			return true;
		}

		// Check if inside a contenteditable container
		const contentEditableParent = activeElement.closest('[contenteditable="true"]');
		if (contentEditableParent) {
			return true;
		}

		return false;
	}

	/**
	 * Check if any modals or dialogs are currently open
	 */
	function isModalOrDialogOpen() {
		// Check for elements with aria-modal="true" (exclude command palette)
		const ariaModalElements = document.querySelectorAll('[aria-modal="true"]:not(#commandPaletteBackdrop)');
		if (ariaModalElements.length > 0) {
			return true;
		}

		// Check for elements with role="dialog" (exclude command palette)
		const dialogElements = document.querySelectorAll('[role="dialog"]:not(#commandPaletteBackdrop)');
		if (dialogElements.length > 0) {
			return true;
		}

		// Check for common modal classes/backdrop patterns (exclude command palette)
		const modalSelectors = [
			'.modal[style*="display: block"]:not(#commandPaletteBackdrop)',
			'.modal.show:not(#commandPaletteBackdrop)',
			'.modal.open:not(#commandPaletteBackdrop)',
			'.modal.visible:not(#commandPaletteBackdrop)',
			'.dialog[style*="display: block"]:not(#commandPaletteBackdrop)',
			'.dialog.show:not(#commandPaletteBackdrop)',
			'.dialog.open:not(#commandPaletteBackdrop)',
			'.dialog.visible:not(#commandPaletteBackdrop)',
			'[data-modal-open="true"]:not(#commandPaletteBackdrop)',
			'[data-dialog-open="true"]:not(#commandPaletteBackdrop)',
			// Check for backdrop elements that might indicate modals (exclude command palette)
			'.backdrop:not(#commandPaletteBackdrop)',
			'.modal-backdrop:not(#commandPaletteBackdrop)',
			'.dialog-backdrop:not(#commandPaletteBackdrop)',
			'.overlay[style*="display: block"]:not(#commandPaletteBackdrop)',
			'.overlay.show:not(#commandPaletteBackdrop)',
			'.overlay.visible:not(#commandPaletteBackdrop)',
			// Common framework modal classes (exclude command palette)
			'.MuiModal-root[aria-hidden="false"]:not(#commandPaletteBackdrop)',
			'.chakra-modal__content:not(#commandPaletteBackdrop)',
			'.ant-modal-mask:not(#commandPaletteBackdrop)',
			'.el-overlay:not(#commandPaletteBackdrop)',
			// Fixed positioned elements that might be modals (exclude command palette)
			'.fixed.z-50:not(#commandPaletteBackdrop)',
			'.absolute.z-50:not(#commandPaletteBackdrop)'
		];

		for (const selector of modalSelectors) {
			const elements = document.querySelectorAll(selector);
			if (elements.length > 0) {
				// Additional check: only consider it a modal if it's actually visible
				for (const element of elements) {
					const isVisible = window.getComputedStyle(element).display !== 'none' &&
						window.getComputedStyle(element).visibility !== 'hidden';
					if (isVisible) {
						return true;
					}
				}
			}
		}

		// Additional check: look for VISIBLE elements with very high z-index that might be modals (exclude command palette)
		const allElements = document.querySelectorAll('*:not(#commandPaletteBackdrop)');
		for (const element of allElements) {
			const zIndex = window.getComputedStyle(element).zIndex;
			const isVisible = window.getComputedStyle(element).display !== 'none' &&
				window.getComputedStyle(element).visibility !== 'hidden' &&
				element.offsetWidth > 0 && element.offsetHeight > 0;

			if (zIndex && Number.parseInt(zIndex, 10) > 1000 && isVisible) {
				// Elements with very high z-index that are actually visible are likely modals/overlays
				return true;
			}
		}

		return false;
	}

	/**
	 * Show command palette
	 */
	function showCommandPalette() {
		if (!commandPaletteElement) {
			initializeCommandPalette();
		}

		if (commandPaletteElement) {
			// Make element visible first
			commandPaletteElement.style.display = 'block';
			commandPaletteElement.style.visibility = 'visible';
			commandPaletteElement.setAttribute('data-state', 'open');

			// Use requestAnimationFrame to ensure display change is processed before adding transition classes
			requestAnimationFrame(() => {
				// Add open classes to trigger transition
				commandPaletteElement.classList.remove('command-palette-backdrop-hidden');
				commandPaletteElement.classList.add('command-palette-backdrop-visible');

				const panel = commandPaletteElement.querySelector('.mx-auto');
				if (panel) {
					panel.classList.remove('command-palette-panel-hidden');
					panel.classList.add('command-palette-panel-visible');
				}
			});

			document.body.style.overflow = 'hidden'; // Prevent background scrolling
			isOpen = true;

			// No longer ignore backdrop clicks - let user close immediately if needed

			// Focus after transition starts, using multiple animation frames to ensure rendering
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					if (searchInput && !document.activeElement.closest('#commandPaletteBackdrop')) {
						searchInput.focus();
					}
				});
			});

			// Reset search
			searchInput.value = '';
			filterCommands('');
		}
	}

	/**
	 * Hide command palette
	 */
	function hideCommandPalette() {
		if (commandPaletteElement) {
			// Use requestAnimationFrame to ensure class changes trigger transitions
			requestAnimationFrame(() => {
				// Add closed classes to trigger transition
				commandPaletteElement.classList.remove('command-palette-backdrop-visible');
				commandPaletteElement.classList.add('command-palette-backdrop-hidden');

				const panel = commandPaletteElement.querySelector('.mx-auto');
				if (panel) {
					panel.classList.remove('command-palette-panel-visible');
					panel.classList.add('command-palette-panel-hidden');
				}
			});

			isOpen = false;

			// Wait for transition to complete before hiding element
			const panel = commandPaletteElement.querySelector('.mx-auto');
			let handleTransitionEnd = null;

			if (panel) {
				handleTransitionEnd = (event) => {
					// Only respond to transitionend on the panel (which has the actual transition)
					if (event.target === panel) {
						commandPaletteElement.style.display = 'none';
						document.body.style.overflow = ''; // Restore scrolling
						panel.removeEventListener('transitionend', handleTransitionEnd);
					}
				};
				panel.addEventListener('transitionend', handleTransitionEnd);
			}

			// Fallback: if transition doesn't complete within reasonable time, hide anyway
			setTimeout(() => {
				if (commandPaletteElement && commandPaletteElement.style.display !== 'none') {
					commandPaletteElement.style.display = 'none';
					document.body.style.overflow = '';
					if (handleTransitionEnd && panel) {
						panel.removeEventListener('transitionend', handleTransitionEnd);
					}
				}
			}, 200); // Slightly longer than transition duration (150ms) + buffer

			// Return focus to header search input
			const headerSearchInput = document.getElementById('searchInput');
			if (headerSearchInput) {
				window.__commandPaletteIgnoreNextFocus = true;
				headerSearchInput.focus();
				setTimeout(() => {
					window.__commandPaletteIgnoreNextFocus = false;
				}, 0);
			}
		}
	}

	/**
	 * Add transparent scrollbar styles and custom blur styles
	 */
	function addTransparentScrollbarStyles() {
		// Create style element if it doesn't exist
		let styleElement = document.getElementById('command-palette-scrollbar-styles');
		if (!styleElement) {
			styleElement = document.createElement('style');
			styleElement.id = 'command-palette-scrollbar-styles';
			styleElement.textContent = `
        .scrollbar-transparent {
          scrollbar-color: transparent transparent;
        }
        .scrollbar-transparent::-webkit-scrollbar {
          background: transparent;
        }
        .scrollbar-transparent::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.2);
        }
        .scrollbar-transparent::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.4);
        }
        .scrollbar-transparent::-webkit-scrollbar-track {
          background: transparent;
        }
        .backdrop-blur-xs {
          backdrop-filter: blur(4px);
        }
      `;
			document.head.appendChild(styleElement);
		}
	}

	/**
	 * Initialize command palette
	 */
	function initializeCommandPalette() {
		// Create command palette element
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = buildCommandPaletteHTML();
		commandPaletteElement = tempDiv.firstElementChild;

		// Append to body
		document.body.appendChild(commandPaletteElement);

		// Add transparent scrollbar styles
		addTransparentScrollbarStyles();

		// Get references
		searchInput = commandPaletteElement.querySelector('#commandPaletteInput');
		commandList = commandPaletteElement.querySelector('#commandList');

		// Setup event listeners
		setupEventListeners();
	}

	/**
	 * Setup event listeners
	 */
	function setupEventListeners() {
		// Search input events
		searchInput.addEventListener('input', (e) => {
			filterCommands(e.target.value);
		});

		searchInput.addEventListener('keydown', (e) => {
			handleKeyDown(e);
		});

		// Command item clicks
		commandList.addEventListener('click', (e) => {
			const commandItem = e.target.closest('.command-item');
			if (commandItem) {
				e.preventDefault();
				executeCommand(commandItem.dataset.commandId);
			}
		});

		// Close on backdrop click - detect clicks outside the main panel
		const backdropElement = commandPaletteElement.querySelector('.fixed.inset-0.w-screen');
		if (backdropElement) {
			backdropElement.addEventListener('click', (e) => {
				// Only close if clicking directly on the backdrop, not on the inner panel
				// and not during the ignore period after opening
				if (e.target === backdropElement) {
					hideCommandPalette();
				}
			});
		}

		// Close on escape
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && isOpen) {
				// Don't close if user is editing in the command palette input
				const activeElement = document.activeElement;
				const isEditingInPalette = activeElement && activeElement.id === 'commandPaletteInput';

				if (!isEditingInPalette) {
					hideCommandPalette();
				}
			}
		});
	}

	/**
	 * Filter commands based on search query
	 */
	function filterCommands(query) {
		const filteredCommands = commands.filter(command =>
			command.title.toLowerCase().includes(query.toLowerCase()) ||
			command.description.toLowerCase().includes(query.toLowerCase())
		);

		const commandItemsContainer = commandList.querySelector('#commandItems');
		const noResultsElement = commandList.querySelector('#noResults');

		if (filteredCommands.length > 0) {
			commandItemsContainer.innerHTML = renderCommandItems(filteredCommands);
			commandItemsContainer.style.display = 'block';
			noResultsElement.hidden = true;
		} else {
			commandItemsContainer.style.display = 'none';
			noResultsElement.hidden = false;
		}
	}

	/**
	 * Handle keyboard navigation
	 */
	function handleKeyDown(e) {
		const commandItems = commandList.querySelectorAll('.command-item');
		const visibleItems = Array.from(commandItems).filter(item => item.offsetParent !== null);

		if (visibleItems.length === 0) { return; }

		let currentIndex = -1;
		visibleItems.forEach((item, index) => {
			if (item.classList.contains('aria-selected')) {
				currentIndex = index;
			}
		});

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			const nextIndex = (currentIndex + 1) % visibleItems.length;
			selectCommandItem(visibleItems, nextIndex);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			const prevIndex = currentIndex <= 0 ? visibleItems.length - 1 : currentIndex - 1;
			selectCommandItem(visibleItems, prevIndex);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (currentIndex >= 0 && currentIndex < visibleItems.length) {
				const commandId = visibleItems[currentIndex].dataset.commandId;
				executeCommand(commandId);
			}
		}
	}

	/**
	 * Select command item
	 */
	function selectCommandItem(items, index) {
		items.forEach((item, i) => {
			if (i === index) {
				item.classList.add('aria-selected');
				item.setAttribute('aria-selected', 'true');
				item.scrollIntoView({block: 'nearest'});
			} else {
				item.classList.remove('aria-selected');
				item.setAttribute('aria-selected', 'false');
			}
		});
	}

	/**
	 * Execute command
	 */
	function executeCommand(commandId) {
		const command = commands.find(cmd => cmd.id === commandId);
		if (command && command.action) {
			command.action();
			hideCommandPalette();
		}
	}

	/**
	 * Navigation helper
	 */
	function navigateTo(path) {
		window.location.href = path;
	}

	/**
	 * Action helpers
	 */

	/**
	 * Check if command palette is currently visible
	 */
	function isCommandPaletteVisible() {
		// Use the isOpen variable as the single source of truth
		return isOpen;
	}

	// Global keyboard shortcut (K) - registered immediately on initialization
	document.addEventListener('keydown', (e) => {
		if (e.key === 'k') {

			// If palette is already open, close it (unless user is editing in palette input)
			if (isCommandPaletteVisible()) {
				const activeElement = document.activeElement;
				const isEditingInPalette = activeElement && activeElement.id === 'commandPaletteInput';
				if (!isEditingInPalette) {
					e.preventDefault();
					try {
						hideCommandPalette();
					} catch (error) {
						console.error('Error hiding command palette:', error);
					}
				}
				return;
			}
			// Don't open command palette if user is editing in an input/textarea
			if (isUserEditing()) {
				return;
			}
			// Don't open command palette if any modals or dialogs are open
			if (isModalOrDialogOpen()) {
				return;
			}
			e.preventDefault();
			try {
				showCommandPalette();
			} catch (error) {
				console.error('Error opening command palette:', error);
			}
		}
	});

	// Expose functions globally
	window.showCommandPalette = showCommandPalette;
	window.hideCommandPalette = hideCommandPalette;
	window.isCommandPaletteOpen = () => isOpen;
}());
