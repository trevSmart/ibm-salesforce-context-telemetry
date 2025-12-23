// @ts-nocheck
// Global data cache to avoid redundant API calls between page navigations
// This module provides a centralized caching system for API responses

if (!window.__globalDataCache) {
	window.__globalDataCache = {
		auth: null,
		sessions: null,
		telemetryUsers: null,
		eventTypes: null,
		teamStats: null,
		databaseSize: null,
		topUsersToday: null,
		topTeamsToday: null,
		toolUsageStats: null,
		lastUpdated: {}
	};
}

// Helper function to check if cached data is still fresh (less than 5 minutes old)
window.isCacheFresh = function(cacheKey) {
	const lastUpdated = window.__globalDataCache.lastUpdated[cacheKey];
	if (!lastUpdated) {return false;}
	const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
	return lastUpdated > fiveMinutesAgo;
};

// Helper function to update cache
window.updateCache = function(cacheKey, data) {
	window.__globalDataCache[cacheKey] = data;
	window.__globalDataCache.lastUpdated[cacheKey] = Date.now();
};

// Helper function to get cached data if fresh
window.getCachedData = function(cacheKey) {
	if (window.isCacheFresh(cacheKey)) {
		return window.__globalDataCache[cacheKey];
	}
	return null;
};