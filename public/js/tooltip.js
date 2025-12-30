// @ts-nocheck
// Custom tooltip component - reusable across the application
import {timerRegistry} from './utils/timerRegistry.js';

(function initCustomTooltip() {
	'use strict';

	/**
	 * Creates and manages custom tooltips for elements
	 * @class CustomTooltip
	 */
	class CustomTooltip {
		constructor() {
			this.tooltip = null;
			this.currentTarget = null;
			this.init();
		}

		/**
		 * Initialize tooltip system
		 */
		init() {
			// Create tooltip element
			this.tooltip = document.createElement('div');
			this.tooltip.className = 'custom-tooltip';
			this.tooltip.setAttribute('role', 'tooltip');
			this.tooltip.setAttribute('aria-hidden', 'true');
			document.body.appendChild(this.tooltip);

			// Use event delegation for better performance
			document.addEventListener('mouseenter', this.handleMouseEnter.bind(this), true);
			document.addEventListener('mouseleave', this.handleMouseLeave.bind(this), true);
			document.addEventListener('focus', this.handleFocus.bind(this), true);
			document.addEventListener('blur', this.handleBlur.bind(this), true);
			
			// Listen for mouse leave on tooltip itself
			this.tooltip.addEventListener('mouseleave', (event) => {
				if (this.currentTarget && this.tooltip.classList.contains('visible')) {
					const relatedTarget = event.relatedTarget;
					// If not moving back to the target element, hide tooltip
					if (!relatedTarget || (!this.currentTarget.contains(relatedTarget) && relatedTarget !== this.currentTarget)) {
						this.hide();
					}
				}
			});
		}

		/**
		 * Check if element has tooltip data attribute
		 * @param {HTMLElement} element
		 * @returns {boolean}
		 */
		hasTooltip(element) {
			return element && element.hasAttribute('data-tooltip');
		}

		/**
		 * Get tooltip text from element
		 * @param {HTMLElement} element
		 * @returns {string|null}
		 */
		getTooltipText(element) {
			if (!this.hasTooltip(element)) {
				return null;
			}
			return element.getAttribute('data-tooltip') || null;
		}

		/**
		 * Get tooltip position preference from element
		 * @param {HTMLElement} element
		 * @returns {string} Position: 'top', 'right', 'bottom', 'left'
		 */
		getTooltipPosition(element) {
			if (!element) {
				return 'top';
			}
			const position = element.getAttribute('data-tooltip-position');
			if (['top', 'right', 'bottom', 'left'].includes(position)) {
				return position;
			}
			return 'top'; // Default position
		}

		/**
		 * Show tooltip for element
		 * @param {HTMLElement} element
		 */
		show(element) {
			const text = this.getTooltipText(element);
			if (!text) {
				return;
			}

			// Clear any pending hide timeout
			timerRegistry.clearTimeout('tooltip.hide');

			// Clear any pending show timeout
			timerRegistry.clearTimeout('tooltip.show');

			// Small delay before showing tooltip for better UX
			timerRegistry.setTimeout('tooltip.show', () => {
				this.currentTarget = element;
				this.tooltip.textContent = text;
				this.tooltip.setAttribute('aria-hidden', 'false');

				// Set position class for nubbin styling and transform direction
				const position = this.getTooltipPosition(element);
				this.tooltip.className = `custom-tooltip custom-tooltip-${position}`;

				this.positionTooltip(element);

				// Use requestAnimationFrame to ensure smooth transition
				requestAnimationFrame(() => {
					this.tooltip.classList.add('visible');
				});
			}, 100); // 100ms delay before showing
		}

		/**
		 * Hide tooltip
		 */
		hide() {
			// Clear any pending show timeout
			timerRegistry.clearTimeout('tooltip.show');

			// Small delay before hiding to allow moving mouse to tooltip
			timerRegistry.setTimeout('tooltip.hide', () => {
				if (this.tooltip) {
					this.tooltip.classList.remove('visible');
					// Set visibility hidden after transition completes
					timerRegistry.setTimeout('tooltip.ariaHidden', () => {
						if (this.tooltip && !this.tooltip.classList.contains('visible')) {
							this.tooltip.setAttribute('aria-hidden', 'true');
						}
					}, 200); // Match transition duration
					this.currentTarget = null;
				}
			}, 100);
		}

		/**
		 * Position tooltip relative to element
		 * @param {HTMLElement} element
		 */
		positionTooltip(element) {
			if (!this.tooltip || !element) {
				return;
			}

			const rect = element.getBoundingClientRect();
			const tooltipRect = this.tooltip.getBoundingClientRect();
			const spacing = 8; // Space between element and tooltip (including nubbin)
			const nubbinSize = 6; // Size of the nubbin triangle
			const position = this.getTooltipPosition(element);

			let top, left;

			// Calculate position based on preference
			switch (position) {
				case 'top':
					top = rect.top - tooltipRect.height - spacing - nubbinSize;
					left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
					break;
				case 'bottom':
					top = rect.bottom + spacing + nubbinSize;
					left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
					break;
				case 'left':
					top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
					left = rect.left - tooltipRect.width - spacing - nubbinSize;
					break;
				case 'right':
					top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
					left = rect.right + spacing + nubbinSize;
					break;
				default:
					top = rect.top - tooltipRect.height - spacing - nubbinSize;
					left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
			}

			// Check if tooltip would go off screen and adjust
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const margin = 8;

			// Adjust horizontal position if tooltip goes off screen
			if (left < margin) {
				left = margin;
			} else if (left + tooltipRect.width > viewportWidth - margin) {
				left = viewportWidth - tooltipRect.width - margin;
			}

			// Adjust vertical position if tooltip goes off screen
			if (top < margin) {
				// If preferred position is top but no space, try bottom
				if (position === 'top') {
					top = rect.bottom + spacing + nubbinSize;
				} else {
					top = margin;
				}
			} else if (top + tooltipRect.height > viewportHeight - margin) {
				// If preferred position is bottom but no space, try top
				if (position === 'bottom') {
					top = rect.top - tooltipRect.height - spacing - nubbinSize;
				} else {
					top = viewportHeight - tooltipRect.height - margin;
				}
			}

			// Apply position
			this.tooltip.style.top = `${top + window.scrollY}px`;
			this.tooltip.style.left = `${left + window.scrollX}px`;
		}

		/**
		 * Safely get closest element with tooltip
		 * @param {EventTarget|null} target
		 * @returns {HTMLElement|null}
		 */
		getClosestTooltipElement(target) {
			if (!target || typeof target.closest !== 'function') {
				return null;
			}
			return target.closest('[data-tooltip]');
		}

		/**
		 * Handle mouse enter event
		 * @param {MouseEvent} event
		 */
		handleMouseEnter(event) {
			const target = this.getClosestTooltipElement(event.target);
			if (target && this.hasTooltip(target)) {
				// If we're already showing a tooltip for this target, don't re-show it
				if (this.currentTarget === target && this.tooltip.classList.contains('visible')) {
					return;
				}
				this.show(target);
			}
		}

		/**
		 * Handle mouse leave event
		 * @param {MouseEvent} event
		 */
		handleMouseLeave(event) {
			const target = this.getClosestTooltipElement(event.target);
			const relatedTarget = event.relatedTarget;
			
			if (target && this.currentTarget === target) {
				// If moving to a child of the target, don't hide
				if (relatedTarget && target.contains && target.contains(relatedTarget)) {
					return;
				}
				// If moving to the tooltip itself, don't hide
				if (relatedTarget && this.tooltip && this.tooltip.contains(relatedTarget)) {
					return;
				}
				// If relatedTarget is null (mouse left window or moved too fast), hide immediately
				if (!relatedTarget) {
					this.hide();
					return;
				}
				// For other cases, verify we're actually leaving
				// Use a small delay to handle rapid mouse movements and verify the mouse position
				const mouseX = event.clientX;
				const mouseY = event.clientY;
				const checkLeave = () => {
					if (!this.currentTarget || !this.tooltip.classList.contains('visible')) {
						return; // Already hidden
					}
					// Get current element at mouse position
					const elementAtPoint = document.elementFromPoint(mouseX, mouseY);
					if (elementAtPoint) {
						const closestTooltip = this.getClosestTooltipElement(elementAtPoint);
						// If still over target or tooltip, don't hide
						if (closestTooltip === target || (this.tooltip && this.tooltip.contains(elementAtPoint))) {
							return;
						}
						// Verify we're not over the target by checking if it contains the element at point
						if (target.contains && target.contains(elementAtPoint)) {
							return;
						}
					}
					// If we get here, we're actually leaving - hide the tooltip
					this.hide();
				};
				// Small delay to handle edge cases and rapid movements
				setTimeout(checkLeave, 10);
			}
		}

		/**
		 * Handle focus event for keyboard navigation
		 * @param {FocusEvent} event
		 */
		handleFocus(event) {
			const target = this.getClosestTooltipElement(event.target);
			if (target && this.hasTooltip(target)) {
				this.show(target);
			}
		}

		/**
		 * Handle blur event for keyboard navigation
		 * @param {FocusEvent} event
		 */
		handleBlur(event) {
			const target = this.getClosestTooltipElement(event.target);
			if (target && this.currentTarget === target) {
				this.hide();
			}
		}

		/**
		 * Update tooltip position on scroll/resize
		 */
		updatePosition() {
			if (this.currentTarget && this.tooltip.classList.contains('visible')) {
				this.positionTooltip(this.currentTarget);
			}
		}

		/**
		 * Cleanup tooltip system
		 */
		destroy() {
			if (this.hideTimeout) {
				clearTimeout(this.hideTimeout);
			}
			if (this.showTimeout) {
				clearTimeout(this.showTimeout);
			}
			if (this.tooltip && this.tooltip.parentNode) {
				this.tooltip.parentNode.removeChild(this.tooltip);
			}
		}
	}

	// Initialize tooltip system when DOM is ready
	let tooltipInstance = null;

	function initTooltip() {
		if (!tooltipInstance) {
			tooltipInstance = new CustomTooltip();

			// Update position on scroll and resize
			window.addEventListener('scroll', () => {
				timerRegistry.clearTimeout('tooltip.scroll');
				timerRegistry.setTimeout('tooltip.scroll', () => {
					tooltipInstance.updatePosition();
				}, 10);
			}, {passive: true});

			window.addEventListener('resize', () => {
				timerRegistry.clearTimeout('tooltip.resize');
				timerRegistry.setTimeout('tooltip.resize', () => {
					tooltipInstance.updatePosition();
				}, 10);
			});
		}
		return tooltipInstance;
	}

	// Initialize when DOM is ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initTooltip);
	} else {
		initTooltip();
	}

	// Expose globally for manual initialization if needed
	window.initCustomTooltip = initTooltip;
}());
