/**
 * Performance utilities for caching and optimization
 */

/**
 * Simple in-memory cache with TTL
 */
class Cache {
	constructor(ttlMs = 60000) {
		this.cache = new Map();
		this.ttl = ttlMs;
	}

	get(key) {
		const item = this.cache.get(key);
		if (!item) {return null;}
    
		if (Date.now() > item.expiry) {
			this.cache.delete(key);
			return null;
		}
    
		return item.value;
	}

	set(key, value) {
		this.cache.set(key, {
			value,
			expiry: Date.now() + this.ttl
		});
	}

	clear() {
		this.cache.clear();
	}

	size() {
		return this.cache.size;
	}
  
	/**
   * Clean up expired entries
   */
	cleanup() {
		const now = Date.now();
		for (const [key, item] of this.cache.entries()) {
			if (now > item.expiry) {
				this.cache.delete(key);
			}
		}
	}
}

/**
 * Debounce function calls
 */
function debounce(func, wait) {
	let timeout;
	return function executedFunction(...args) {
		const context = this;
		const later = () => {
			func.apply(context, args);
		};
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
	};
}

/**
 * Throttle function calls
 */
function throttle(func, limit) {
	let inThrottle = false;
	return function executedFunction(...args) {
		const context = this;
		if (!inThrottle) {
			const result = func.apply(context, args);
			inThrottle = true;
			const resetThrottle = () => {
				inThrottle = false;
			};
			setTimeout(resetThrottle, limit);
			return result;
		}
	};
}

export {
	Cache,
	debounce,
	throttle
};
