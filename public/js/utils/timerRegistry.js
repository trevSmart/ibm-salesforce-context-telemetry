// @ts-nocheck
/**
 * TimerRegistry - Centralized timer management system
 * 
 * Provides a clean API for managing setTimeout and setInterval timers
 * without the need for global variables and manual cleanup.
 * 
 * Features:
 * - Auto-cleanup on re-registration (no memory leaks)
 * - Named timers for clarity and debugging
 * - Centralized pause/clear all functionality
 * - Testable and mockable
 * 
 * @example
 * import { timerRegistry } from './utils/timerRegistry.js';
 * 
 * // Register a timer
 * timerRegistry.setInterval('autoRefresh', () => fetchData(), 5000);
 * 
 * // Clear a specific timer
 * timerRegistry.clearInterval('autoRefresh');
 * 
 * // Clear all timers
 * timerRegistry.clearAll();
 */
class TimerRegistry {
	constructor() {
		/** @type {Map<string, number>} */
		this.intervals = new Map();
		/** @type {Map<string, number>} */
		this.timeouts = new Map();
	}

	/**
	 * Register a setInterval timer with a name
	 * If a timer with the same name already exists, it will be cleared first
	 * @param {string} name - Unique name for the interval
	 * @param {Function} fn - Function to execute
	 * @param {number} ms - Delay in milliseconds
	 * @returns {number} The interval ID
	 */
	setInterval(name, fn, ms) {
		// Clear existing interval with the same name
		if (this.intervals.has(name)) {
			clearInterval(this.intervals.get(name));
		}

		const id = setInterval(fn, ms);
		this.intervals.set(name, id);
		return id;
	}

	/**
	 * Register a setTimeout timer with a name
	 * If a timer with the same name already exists, it will be cleared first
	 * @param {string} name - Unique name for the timeout
	 * @param {Function} fn - Function to execute
	 * @param {number} ms - Delay in milliseconds
	 * @returns {number} The timeout ID
	 */
	setTimeout(name, fn, ms) {
		// Clear existing timeout with the same name
		if (this.timeouts.has(name)) {
			clearTimeout(this.timeouts.get(name));
		}

		const id = setTimeout(() => {
			// Remove from registry after execution
			this.timeouts.delete(name);
			fn();
		}, ms);
		this.timeouts.set(name, id);
		return id;
	}

	/**
	 * Clear a specific interval by name
	 * @param {string} name - Name of the interval to clear
	 * @returns {boolean} True if the interval was found and cleared
	 */
	clearInterval(name) {
		const id = this.intervals.get(name);
		if (id !== undefined) {
			clearInterval(id);
			this.intervals.delete(name);
			return true;
		}
		return false;
	}

	/**
	 * Clear a specific timeout by name
	 * @param {string} name - Name of the timeout to clear
	 * @returns {boolean} True if the timeout was found and cleared
	 */
	clearTimeout(name) {
		const id = this.timeouts.get(name);
		if (id !== undefined) {
			clearTimeout(id);
			this.timeouts.delete(name);
			return true;
		}
		return false;
	}

	/**
	 * Clear all registered intervals and timeouts
	 * Useful for cleanup on page navigation or component unmount
	 */
	clearAll() {
		// Clear all intervals
		for (const id of this.intervals.values()) {
			clearInterval(id);
		}
		this.intervals.clear();

		// Clear all timeouts
		for (const id of this.timeouts.values()) {
			clearTimeout(id);
		}
		this.timeouts.clear();
	}

	/**
	 * Pause all timers (alias for clearAll)
	 * Useful for soft navigation scenarios where you want to pause the page
	 */
	pauseAll() {
		this.clearAll();
	}

	/**
	 * Check if a timer with the given name exists
	 * @param {string} name - Name of the timer
	 * @returns {boolean} True if the timer exists (as interval or timeout)
	 */
	has(name) {
		return this.intervals.has(name) || this.timeouts.has(name);
	}

	/**
	 * Get the count of active timers
	 * @returns {{intervals: number, timeouts: number, total: number}}
	 */
	getStats() {
		return {
			intervals: this.intervals.size,
			timeouts: this.timeouts.size,
			total: this.intervals.size + this.timeouts.size
		};
	}
}

// Export singleton instance
export const timerRegistry = new TimerRegistry();
