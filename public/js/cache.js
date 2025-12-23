// @ts-nocheck
/**
 * Shared API response cache to avoid duplicate requests across page navigation.
 * Uses in-memory cache that persists during browser session but not across reloads.
 */

// Cache entry structure: { data, timestamp, ttl }
const cache = new Map();
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a cached entry is still valid
 * @param {Object} entry - Cache entry with timestamp and ttl
 * @returns {boolean} - Whether the entry is still valid
 */
function isCacheEntryValid(entry) {
	const now = Date.now();
	const age = now - entry.timestamp;
	return age < entry.ttl;
}

/**
 * Get cached data if available and valid
 * @param {string} key - Cache key
 * @returns {*} - Cached data or undefined if not found/invalid
 */
function getCached(key) {
	const entry = cache.get(key);
	if (entry && isCacheEntryValid(entry)) {
		return entry.data;
	}
	// Remove invalid entries
	if (entry) {
		cache.delete(key);
	}
	return undefined;
}

/**
 * Store data in cache
 * @param {string} key - Cache key
 * @param {*} data - Data to cache
 * @param {number} ttlMs - Time to live in milliseconds (optional)
 */
function setCached(key, data, ttlMs = DEFAULT_TTL_MS) {
	cache.set(key, {
		data: data,
		timestamp: Date.now(),
		ttl: ttlMs
	});
}

/**
 * Clear all cached data
 */
function clearCache() {
	cache.clear();
}

/**
 * Clear expired cache entries
 */
function clearExpired() {
	const now = Date.now();
	for (const [key, entry] of cache.entries()) {
		if (!isCacheEntryValid(entry)) {
			cache.delete(key);
		}
	}
}

/**
 * Fetch with caching - checks cache first, then makes HTTP request if needed
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} ttlMs - Cache TTL in milliseconds (optional)
 * @returns {Promise<Response>} - Fetch response
 */
async function cachedFetch(url, options = {}, ttlMs = DEFAULT_TTL_MS) {
	// Create cache key from URL and relevant options
	const cacheKey = `${url}|${JSON.stringify({
		method: options.method || 'GET',
		body: options.body,
		headers: options.headers
	})}`;

	// Check cache first
	const cachedData = getCached(cacheKey);
	if (cachedData) {
		// Return a Response-like object with cached data
		return new Response(JSON.stringify(cachedData), {
			status: 200,
			statusText: 'OK (cached)',
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Make the actual request
	const response = await fetch(url, options);

	// Cache successful JSON responses
	if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
		try {
			const clonedResponse = response.clone();
			const data = await clonedResponse.json();
			setCached(cacheKey, data, ttlMs);
		} catch (error) {
			// If we can't parse JSON, don't cache
			console.warn('Failed to cache response for', url, error);
		}
	}

	return response;
}

// Clean up expired entries periodically
setInterval(clearExpired, 60000); // Every minute

// Clear cache on page unload to avoid stale data
window.addEventListener('beforeunload', clearCache);

// Export functions to global scope for use by other modules
window.ApiCache = {
	get: getCached,
	set: setCached,
	clear: clearCache,
	clearExpired: clearExpired,
	cachedFetch: cachedFetch,
	DEFAULT_TTL_MS: DEFAULT_TTL_MS
};