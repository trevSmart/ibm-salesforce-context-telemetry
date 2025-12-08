// @ts-nocheck
/* eslint-env browser */

/**
 * Shared CSRF token helper module
 * This module provides CSRF token management for all frontend JavaScript files
 */

// CSRF token storage
let csrfToken = null;

/**
 * Get CSRF token from API or cache
 * @returns {Promise<string|null>} CSRF token or null if unavailable
 */
async function getCsrfToken() {
  if (csrfToken) {
    return csrfToken;
  }
  try {
    const response = await fetch('/api/auth/status', {
      credentials: 'include'
    });
    const data = await response.json();
    csrfToken = data.csrfToken;
    return csrfToken;
  } catch (error) {
    console.error('Failed to get CSRF token:', error);
    return null;
  }
}

/**
 * Set CSRF token (useful when token is already available from another API call)
 * @param {string} token - CSRF token to store
 */
function setCsrfToken(token) {
  csrfToken = token;
}

/**
 * Get request headers with CSRF token
 * @param {boolean} includeJson - Whether to include Content-Type: application/json header
 * @returns {Object} Headers object with CSRF token
 */
function getRequestHeaders(includeJson = true) {
  const headers = {};
  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  return headers;
}

/**
 * Get CSRF token from cookie (fallback method)
 * @returns {string|null} CSRF token from cookie or null
 */
function getCsrfTokenFromCookie() {
  try {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'csrf-token') {
        return decodeURIComponent(value);
      }
    }
    return null;
  } catch (error) {
    console.error('Failed to get CSRF token from cookie:', error);
    return null;
  }
}

// Export functions to global scope for use in other scripts
if (typeof window !== 'undefined') {
  window.getCsrfToken = getCsrfToken;
  window.setCsrfToken = setCsrfToken;
  window.getRequestHeaders = getRequestHeaders;
  window.getCsrfTokenFromCookie = getCsrfTokenFromCookie;
}
