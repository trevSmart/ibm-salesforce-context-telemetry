// @ts-nocheck
// Global header component - single source of truth for the navigation header
(function initGlobalHeader() {
	/**
	 * Dynamic refresh dispatcher - calls the appropriate refresh function based on current page
	 * This ensures the correct refresh function is called even after soft navigation
	 */
	function handleRefreshClick(event) {
		if (event?.preventDefault) {
			event.preventDefault();
		}

		// Determine which refresh function to call based on current path at click time
		const currentPath = window.location.pathname;

		if (currentPath === '/' || currentPath.startsWith('/?')) {
			// Dashboard page
			if (typeof window.refreshDashboard === 'function') {
				window.refreshDashboard(event);
			}
		} else if (currentPath.startsWith('/logs')) {
			// Event log page
			if (typeof window.refreshLogs === 'function') {
				window.refreshLogs(event);
			}
		} else if (currentPath.startsWith('/teams')) {
			// Teams page
			if (typeof window.refreshTeams === 'function') {
				window.refreshTeams(event);
			}
		} else if (currentPath.startsWith('/people')) {
			// People page
			if (typeof window.refreshPeople === 'function') {
				window.refreshPeople(event);
			}
		} else if (currentPath.startsWith('/test')) {
			// Test page
			if (typeof window.refreshTest === 'function') {
				window.refreshTest(event);
			}
		}
	}

	/**
	 * Unified refresh handler - fetches latest event data
	 * This is the same handler used across all pages
	 */
	async function refreshEvents(event) {
		if (event?.preventDefault) {
			event.preventDefault();
		}

		// Get the refresh button and icon
		const button = event?.target?.closest('.icon-btn') || event?.currentTarget || document.getElementById('refreshButton');
		const refreshIcon = button?.querySelector('.refresh-icon');

		// Start rotation animation
		if (refreshIcon) {
			refreshIcon.classList.add('rotating');
		}

		try {
			// Fetch latest events from the API
			const response = await fetch('/api/events?limit=100');
			if (!response.ok) {
				throw new Error('Failed to fetch events');
			}
			const data = await response.json();

			// Dispatch a custom event that pages can listen to if they want to update their UI
			window.dispatchEvent(new CustomEvent('eventsRefreshed', {detail: data}));
		} catch (error) {
			console.error('Error refreshing events:', error);
		} finally {
			// Stop rotation with smooth finish animation
			if (refreshIcon) {
				refreshIcon.classList.remove('rotating');
				refreshIcon.classList.add('rotating-finish');
				setTimeout(() => {
					refreshIcon.classList.remove('rotating-finish');
				}, 700); // REFRESH_ICON_ANIMATION_DURATION_MS
			}
		}
	}

	/**
   * Build the global header HTML - automatically detects page context
   * @param {string} userRole - User role to determine visibility of certain links
   * @returns {string} Header HTML
   */
	function buildHeaderHTML(userRole = null) {
		// Auto-detect active page from current URL
		const currentPath = window.location.pathname;
		const activePage = currentPath === '/' ? '/' :currentPath.startsWith('/logs') ? '/logs' :currentPath.startsWith('/teams') ? '/teams' :currentPath.startsWith('/people') ? '/people' :currentPath.startsWith('/test') ? '/test' :currentPath.startsWith('/users') ? '/users' : '/';

		// Refresh button properties - use dynamic handler for all pages
		const showBadge = currentPath.startsWith('/logs');
		const refreshId = currentPath.startsWith('/logs') ? 'refreshButton' : '';
		const refreshAriaLabel = 'Refresh';
		const refreshTitle = 'Refresh';

		// Use dynamic refresh handler that determines which function to call at click time
		// This ensures correct behavior even after soft navigation between pages
		const refreshOnClick = 'handleRefreshClick(event)';

		const refreshButtonId = refreshId ? `id="${refreshId}"` : '';
		const refreshBadge = showBadge? '<span class="refresh-badge" id="autoRefreshBadge" aria-hidden="true"></span>': '';

		// Secondary button content (always settings)
		const secondaryButtonHTML = ``;

		// Only show Test link if user has "god" role
		const testLinkHTML = userRole === 'god'? `<a href="/test" class="top-nav-link${activePage === '/test' ? ' active' : ''}">Test</a>`: '';

		return `
      <nav class="top-nav">
        <a href="/" class="top-nav-logo">
          <div class="top-nav-logo-icon">
            <img src="/resources/ibm.webp" alt="IBM SF CTXT TELEMETRY" class="top-nav-logo-img">
          </div>
          <span style="position: relative; top: 1px;">TELEMETRY</span>
        </a>
        <div class="top-nav-links">
          <a href="/" class="top-nav-link${activePage === '/' ? ' active' : ''}">Dashboard</a>
          <a href="/logs" class="top-nav-link${activePage === '/logs' ? ' active' : ''}">Logs</a>
          <a href="/teams" class="top-nav-link${activePage === '/teams' ? ' active' : ''}">Teams</a>
          <a href="/people" class="top-nav-link${activePage === '/people' ? ' active' : ''}">People</a>
          ${testLinkHTML}
          <div class="top-nav-animation"></div>
        </div>
        <div class="top-nav-actions">
          <button type="button" class="icon-btn navbar-btn-icon" aria-label="Command Palette" data-tooltip="Command Palette" data-tooltip-position="top" onclick="window.showCommandPalette && window.showCommandPalette()">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </button>
          <button type="button" class="icon-btn navbar-btn-icon" ${refreshButtonId} aria-label="${refreshAriaLabel}" data-tooltip="${refreshTitle}" data-tooltip-position="top" onclick="${refreshOnClick}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="refresh-icon" width="18" height="18" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
            </svg>
            ${refreshBadge}
          </button>
          ${secondaryButtonHTML}
          <div class="inline-flex rounded-md shadow-xs mr-2 button-group">
            <button type="button" class="relative inline-flex items-center rounded-l-md bg-[var(--button-bg)] px-2 py-2 text-gray-400 inset-ring-1 inset-ring-gray-300 hover:bg-gray-50 focus:z-10" style="padding-left: 10px; --radius-md: 99px;" data-action="open-settings" aria-label="Settings" data-tooltip="Settings" data-tooltip-position="top">
              <span class="sr-only">Settings</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="var(--text-regular)" stroke-width="1.5" aria-hidden="true" class="size-[18px]">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </button>
            <el-dropdown class="user-menu-container inline-block -ml-px">
              <button class="relative inline-flex items-center rounded-r-md bg-[var(--button-bg)] px-3 py-2 text-sm text-gray-900 inset-ring-1 inset-ring-gray-300 hover:bg-gray-50 focus:z-10" style="--radius-md: 99px;" onclick="showUserMenu(event)">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--text-regular)" width="18" height="18" aria-hidden="true" class="size-[18px]">
                  <path fill-rule="evenodd" d="M12 2.25a5.25 5.25 0 0 0-3.717 8.966 8.252 8.252 0 0 0-4.367 7.284.75.75 0 0 0 1.5 0 6.75 6.75 0 1 1 13.5 0 .75.75 0 0 0 1.5 0 8.252 8.252 0 0 0-4.366-7.284A5.25 5.25 0 0 0 12 2.25Zm0 1.5a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5Z" clip-rule="evenodd"></path>
                </svg>
                <svg viewBox="0 0 20 20" fill="currentColor" data-slot="icon" aria-hidden="true" class="ml-1 size-4">
                  <path d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
                </svg>
              </button>
              <el-menu id="userMenu" anchor="bottom end" popover class="	origin-top-right divide-y divide-gray-100 rounded-md bg-white/70 dark:bg-gray-800/70 text-gray-900 shadow-lg outline-1 outline-black/5 dark:outline-white/10 backdrop-blur-sm backdrop-filter transition transition-discrete dark:divide-white/10 dark:text-gray-50 [--anchor-gap:--spacing(2)] data-closed:-translate-y-2 data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-250 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"></el-menu>
            </el-dropdown>
          </div>
        </div>
      </nav>
    `;
	}

	/**
   * Initialize the header on the page - automatically detects page context
   * Fetches user role to conditionally show certain links (e.g., Test link for god users)
   */
	async function initHeader() {
		// Get user role from cached auth data or API
		let userRole = null;
		try {
			if (window.__cachedAuthData && window.__cachedAuthData.authenticated) {
				userRole = window.__cachedAuthData.role || null;
			} else {
				const response = await fetch('/api/auth/status', {
					credentials: 'include'
				});
				if (response.ok) {
					const data = await response.json();
					userRole = data.role || null;
					// Cache for future use
					if (!window.__cachedAuthData) {
						window.__cachedAuthData = data;
					}
				}
			}
		} catch (error) {
			console.warn('Could not fetch user role for header:', error);
		}

		// Find the header placeholder or existing nav element
		const headerPlaceholder = document.getElementById('global-header-placeholder');
		const existingNav = document.querySelector('nav.top-nav');

		if (headerPlaceholder) {
			// Replace placeholder with header
			headerPlaceholder.outerHTML = buildHeaderHTML(userRole);
		} else if (existingNav) {
			// Replace existing nav (for backward compatibility during migration)
			existingNav.outerHTML = buildHeaderHTML(userRole);
		} else {
			console.warn('No header placeholder or existing nav found');

		}

		// Initialize navigation animation positions
		initNavAnimation();

	}

	/**
	 * Initialize the sliding animation for navigation links with physics-based movement
	 * Implements acceleration, deceleration, and inertia for realistic movement
	 */
	function initNavAnimation() {
		const linksContainer = document.querySelector('.top-nav-links');
		const animation = document.querySelector('.top-nav-animation');

		if (!animation || !linksContainer) {return;}

		// Physics state
		let currentLeft = 0;
		let currentWidth = 0;
		let targetLeft = 0;
		let targetWidth = 0;
		let velocity = 0; // pixels per frame
		let animationFrameId = null;
		let isAnimating = false;
		let isBouncing = false; // whether we're in a bounce state
		let isSlowReturn = false; // whether we're in slow return mode (returning to active link)
		let isPointerInside = false;
		let deferHoverUntilIdle = false;
		let pendingHoverLink = null;

		// Track start positions for width interpolation tied to movement
		let animationStartLeft = 0;
		let animationStartWidth = 0;

		// Physics constants
		const SPEED_MULTIPLIER = 3; // global speed control
		const ACCELERATION = 1.3 * SPEED_MULTIPLIER; // acceleration rate (faster transitions)
		const DECELERATION = 0.32 * SPEED_MULTIPLIER; // deceleration rate (keeps braking feel consistent at higher speed)
		const MAX_VELOCITY = 18 * SPEED_MULTIPLIER; // base speed scale for normalization
		const MIN_VELOCITY = 0.1; // minimum velocity to consider stopped
		const DELAY_BEFORE_MOVE = 40 / SPEED_MULTIPLIER; // ms delay before starting movement
		const DELAY_BEFORE_RETURN_TO_ACTIVE = 300 / SPEED_MULTIPLIER; // ms delay before returning to active link when leaving container
		const BOUNCE_DAMPING = 0.3; // how much velocity is preserved on bounce (reduced to half for less overshoot)
		const BOUNCE_THRESHOLD = 20; // distance threshold to trigger bounce (allow more overshoot)
		const BOUNCE_MULTIPLIER = 0.65; // multiply bounce effect based on speed (reduced to half)
		const BRAKING_DISTANCE = 16; // distance from target where we start braking/decelerating (later braking)

		// Slow return physics constants (for gentle return to active link)
		const SLOW_ACCELERATION = 0.18 * SPEED_MULTIPLIER; // slower acceleration for gentle return
		const SLOW_DECELERATION = 0.002 * SPEED_MULTIPLIER; // slower deceleration for smoother return
		const SLOW_MAX_VELOCITY = 10 * SPEED_MULTIPLIER; // slower max speed for gentle return

		// Get all navigation links dynamically
		const getNavLinks = () => {
			return Array.from(linksContainer.querySelectorAll('.top-nav-link'));
		};

		// Get target position for a link
		const getLinkPosition = (link) => {
			if (!link) {return null;}
			const linkRect = link.getBoundingClientRect();
			const containerRect = linksContainer.getBoundingClientRect();
			return {
				left: linkRect.left - containerRect.left,
				width: linkRect.width
			};
		};

		const easeInOutCubic = (t) => {
			if (t < 0.5) {return 4 * t * t * t;}
			return 1 - Math.pow(-2 * t + 2, 3) / 2;
		};

		// Update animation element position
		const updateAnimationElement = () => {
			animation.style.left = `${currentLeft}px`;
			animation.style.width = `${currentWidth}px`;
		};

		const handleAnimationComplete = () => {
			isAnimating = false;
			isSlowReturn = false;
			if (deferHoverUntilIdle) {
				deferHoverUntilIdle = false;
				if (pendingHoverLink && isPointerInside) {
					const nextLink = pendingHoverLink;
					pendingHoverLink = null;
					moveToTarget(nextLink);
					return;
				}
			}
			pendingHoverLink = null;
		};

		// Physics-based animation loop
		const animate = () => {
			const distance = targetLeft - currentLeft;
			const distanceAbs = Math.abs(distance);
			const direction = distance > 0 ? 1 : -1;
			const totalDistance = Math.abs(targetLeft - animationStartLeft);

			// Use slow constants if in slow return mode
			const currentAcceleration = isSlowReturn ? SLOW_ACCELERATION : ACCELERATION;
			const currentDeceleration = isSlowReturn ? SLOW_DECELERATION : DECELERATION;
			const currentMaxVelocity = isSlowReturn ? SLOW_MAX_VELOCITY : MAX_VELOCITY;

			// Check if we've overshot the target (passed it)
			const hasOvershot = (velocity > 0 && currentLeft > targetLeft) || (velocity < 0 && currentLeft < targetLeft);

			// If we've overshot and we're not already bouncing, start the bounce
			if (hasOvershot && !isBouncing && Math.abs(velocity) > MIN_VELOCITY) {
				// Start bounce: the velocity when crossing determines the bounce
				// Higher velocity = traveled longer distance = more acceleration = bigger overshoot
				isBouncing = true;
				const currentSpeed = Math.abs(velocity);
				// Speed factor: normalize to 0-1, but allow values > 1 for very fast movements
				const speedFactor = Math.min(currentSpeed / currentMaxVelocity, 1.2); // Can go up to 1.2 for very fast
				const distanceFactor = Math.min(totalDistance / 220, 1);
				// Bounce strength: grows with speed and travel distance, minimal on short hops
				const bounceStrength = BOUNCE_DAMPING
					* (0.2 + speedFactor * 0.8)
					* (0.25 + distanceFactor * 0.75)
					* BOUNCE_MULTIPLIER;
				velocity = -velocity * bounceStrength;
			}

			if (isBouncing) {
				// During bounce, check if we've passed back through the target
				const nowOvershootingOtherWay = (velocity < 0 && currentLeft <= targetLeft) || (velocity > 0 && currentLeft >= targetLeft);

				if (nowOvershootingOtherWay || Math.abs(velocity) < MIN_VELOCITY) {
					// Bounce complete, settle at target
					isBouncing = false;
					currentLeft = targetLeft;
					currentWidth = targetWidth;
					velocity = 0;
					updateAnimationElement();
					handleAnimationComplete();
					return;
				} 
					// Continue bouncing, apply lighter deceleration to maintain bounce effect
					velocity *= (1 - currentDeceleration * 0.3); // Even slower deceleration during bounce
				
			} else {
				// Normal movement logic
				// Check if we need to change direction (opposite to current velocity)
				const needsDirectionChange = (velocity > 0 && direction < 0) || (velocity < 0 && direction > 0);

				if (needsDirectionChange && Math.abs(velocity) > MIN_VELOCITY) {
					// Decelerate current velocity first (changing direction)
					velocity *= (1 - currentDeceleration);
					if (Math.abs(velocity) < MIN_VELOCITY) {
						velocity = 0;
					}
				} else if (distanceAbs > BRAKING_DISTANCE) {
					// Far from target: strong initial burst, then gentler acceleration
					const distanceFactor = Math.min(distanceAbs / 240, 1.25);
					const travelProgress = totalDistance > 0 ? 1 - (distanceAbs / totalDistance) : 1;
					const burstFactor = Math.max(0.4, Math.pow(1 - travelProgress, 0.5));
					const accelerationForce = currentAcceleration * distanceFactor * burstFactor * direction;
					velocity += accelerationForce;
				} else if (distanceAbs > MIN_VELOCITY) {
					// Within braking distance: decelerate a bit more to reduce overshoot
					const brakingFactor = 1 - (distanceAbs / BRAKING_DISTANCE); // 0 to 1 as we approach
					const decelRate = currentDeceleration * 0.08 * brakingFactor; // Later, lighter braking for more overshoot
					velocity *= (1 - decelRate);

					// Don't settle early - let it overshoot (but less)
				} else {
					// At target, stop
					currentLeft = targetLeft;
					currentWidth = targetWidth;
					velocity = 0;
					updateAnimationElement();
					handleAnimationComplete();
					return;
				}
			}

			// Ensure we don't start from a dead stop
			if (Math.abs(velocity) < 0.01 && distanceAbs > BRAKING_DISTANCE) {
				velocity = direction * (1.3 * SPEED_MULTIPLIER);
			}

			// Update position based on velocity
			currentLeft += velocity;

			// Interpolate width based on travel progress so it doesn't jump ahead
			const rawProgress = totalDistance > 0 ? Math.abs(currentLeft - animationStartLeft) / totalDistance : 1;
			const clampedProgress = Math.min(Math.max(rawProgress, 0), 1);
			const easedProgress = easeInOutCubic(clampedProgress);
			currentWidth = animationStartWidth + (targetWidth - animationStartWidth) * easedProgress;

			updateAnimationElement();

			if (isAnimating) {
				animationFrameId = requestAnimationFrame(animate);
			}
		};

		// Start animation if not already running
		const startAnimation = () => {
			if (!isAnimating) {
				isAnimating = true;
				animationFrameId = requestAnimationFrame(animate);
			}
		};

		// Set target and start moving
		const moveToTarget = (link, slow = false) => {
			const position = getLinkPosition(link);
			if (!position) {return;}

			targetLeft = position.left;
			targetWidth = position.width;
			isSlowReturn = slow; // Set slow return mode

			// Reset debug state for new animation
			animationStartLeft = currentLeft;
			animationStartWidth = currentWidth;

			startAnimation();
		};

		// Add hover listeners to all links
		const addHoverListeners = () => {
			const navLinks = getNavLinks();
			navLinks.forEach((link) => {
				link.removeEventListener('mouseenter', handleLinkHover);
				link.removeEventListener('mouseleave', handleLinkLeave);
				link.addEventListener('mouseenter', handleLinkHover);
				link.addEventListener('mouseleave', handleLinkLeave);
			});
		};

		// Handle hover on any link - with small delay
		const handleLinkHover = (event) => {
			const link = event.currentTarget;

			timerRegistry.clearTimeout('header.hoverMove');

			if (deferHoverUntilIdle && isAnimating) {
				pendingHoverLink = link;
				return;
			}

			timerRegistry.setTimeout('header.hoverMove', () => {
				moveToTarget(link);
			}, DELAY_BEFORE_MOVE);
		};

		// Handle mouse leave from link
		const handleLinkLeave = () => {
			timerRegistry.clearTimeout('header.hoverMove');
		};

		// Handle mouse leave from container
		const handleContainerLeave = () => {
			isPointerInside = false;
			deferHoverUntilIdle = isAnimating;
			timerRegistry.clearTimeout('header.returnToActive');

			timerRegistry.setTimeout('header.returnToActive', () => {
				const navLinks = getNavLinks();
				const activeLink = navLinks.find(link => link.classList.contains('active'));
				if (activeLink) {
					moveToTarget(activeLink, true); // Use slow return mode for gentle return
				}
			}, DELAY_BEFORE_RETURN_TO_ACTIVE);
		};

		// Handle mouse enter to container
		const handleContainerEnter = () => {
			isPointerInside = true;
			timerRegistry.clearTimeout('header.returnToActive');
			timerRegistry.clearTimeout('header.hoverMove');
		};

		// Set initial position
		const setInitialPosition = () => {
			const navLinks = getNavLinks();
			if (navLinks.length === 0) {return;}

			const activeLink = navLinks.find(link => link.classList.contains('active')) || navLinks[0];
			const position = getLinkPosition(activeLink);

			if (position) {
				currentLeft = position.left;
				currentWidth = position.width;
				targetLeft = position.left;
				targetWidth = position.width;
				animationStartLeft = position.left;
				animationStartWidth = position.width;
				updateAnimationElement();
				animation.style.opacity = '1';
			}
		};

		// Watch for active class changes
		const observer = new MutationObserver(() => {
			const navLinks = getNavLinks();
			const activeLink = navLinks.find(link => link.classList.contains('active'));
			if (activeLink) {
				moveToTarget(activeLink);
			}
		});

		// Observe all links for class changes
		const observeLinks = () => {
			const navLinks = getNavLinks();
			navLinks.forEach((link) => {
				observer.observe(link, {attributes: true, attributeFilter: ['class']});
			});
		};

		// Add mouse leave and enter listeners
		linksContainer.addEventListener('mouseleave', handleContainerLeave);
		linksContainer.addEventListener('mouseenter', handleContainerEnter);

		// Initialize
		requestAnimationFrame(() => {
			addHoverListeners();
			setInitialPosition();
			observeLinks();
		});

		// Update on window resize
		const handleResize = () => {
			timerRegistry.clearTimeout('header.resize');
			timerRegistry.setTimeout('header.resize', () => {
				const navLinks = getNavLinks();
				const activeLink = navLinks.find(link => link.classList.contains('active')) || navLinks[0];
				if (activeLink) {
					moveToTarget(activeLink);
				}
			}, 100);
		};

		// Update when maximize mode changes
		const handleMaximizeChange = () => {
			const navLinks = getNavLinks();
			const activeLink = navLinks.find(link => link.classList.contains('active')) || navLinks[0];
			if (activeLink) {
				// Force immediate recalculation without animation delay
				const position = getLinkPosition(activeLink);
				if (position) {
					currentLeft = position.left;
					currentWidth = position.width;
					targetLeft = position.left;
					targetWidth = position.width;
					animationStartLeft = position.left;
					animationStartWidth = position.width;
					updateAnimationElement();
				}
			}
		};

		window.addEventListener('resize', handleResize);

		// Observe maximize mode changes
		const mainContainer = document.querySelector('.main-container');
		if (mainContainer) {
			const maximizeObserver = new MutationObserver((mutations) => {
				mutations.forEach((mutation) => {
					if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
						// Check if maximized class was added or removed
						const hasMaximized = mainContainer.classList.contains('maximized');
						const hadMaximized = mutation.oldValue && mutation.oldValue.includes('maximized');

						if (hasMaximized !== hadMaximized) {
							// Maximize state changed, recalculate animation position
							setTimeout(handleMaximizeChange, 50); // Small delay to ensure DOM has updated
						}
					}
				});
			});

			maximizeObserver.observe(mainContainer, {
				attributes: true,
				attributeOldValue: true,
				attributeFilter: ['class']
			});
		}

		// Re-initialize if links are added/removed
		const linksObserver = new MutationObserver(() => {
			addHoverListeners();
			observeLinks();
		});

		linksObserver.observe(linksContainer, {childList: true, subtree: true});
	}


	// Expose globally
	window.initGlobalHeader = initHeader;
	window.buildGlobalHeaderHTML = buildHeaderHTML;
	window.refreshEvents = refreshEvents;
	window.handleRefreshClick = handleRefreshClick;
}());
