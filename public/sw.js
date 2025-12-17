// Service Worker for IBM Salesforce Context Telemetry
// Implements modern caching strategies for optimal performance

const CACHE_NAME = 'ibm-salesforce-telemetry-v1.1.0';
const API_CACHE_NAME = 'api-cache-v1.1.0';

// Resources to cache immediately on install - only critical, publicly accessible resources
const STATIC_CACHE_URLS = [
  '/css/input.css',
  '/js/navigation.js',
  '/resources/favicon.svg',
  '/resources/favicon.png',
  '/resources/telemetry.png',
  '/resources/bg-01.jpg'
];

// API endpoints that should be cached (with different strategies)
const API_ENDPOINTS = {
  // Cache for longer (images and static data)
  cacheFirst: [
    '/api/teams/', // Team logos
    '/api/settings'
  ],
  // Try network first, fallback to cache (dynamic data)
  networkFirst: [
    '/api/events',
    '/api/telemetry-users',
    '/api/top-teams-today',
    '/api/top-users-today',
    '/api/daily-stats',
    '/api/database-size',
    '/api/auth/status'
  ]
};

self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static resources');
        // Cache resources individually to handle failures gracefully
        return Promise.allSettled(
          STATIC_CACHE_URLS.map(url => {
            return cache.add(url).catch(error => {
              console.warn(`[SW] Failed to cache ${url}:`, error);
              // Continue with other resources
            });
          })
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Cache First Strategy - for static assets like images
function cacheFirst(request) {
  return caches.match(request)
    .then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request, { credentials: 'include' })
        .then((response) => {
          // Only cache successful responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response before caching
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(request, responseToCache);
            });

          return response;
        })
        .catch((error) => {
          console.log('[SW] Cache First fetch failed:', error);
          // Return offline fallback if available
          return caches.match('/offline.html');
        });
    });
}

// Network First Strategy - for dynamic API data
function networkFirst(request) {
  return fetch(request, { credentials: 'include' })
    .then((response) => {
      // Cache successful responses
      if (response && response.status === 200) {
        const responseClone = response.clone();
        caches.open(API_CACHE_NAME)
          .then((cache) => {
            cache.put(request, responseClone);
          });
      }
      return response;
    })
    .catch(() => {
      // Network failed, try cache
      return caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[SW] Serving from cache:', request.url);
            return cachedResponse;
          }
          // No cache available
          throw new Error('Network and cache both failed');
        });
    });
}

// Stale While Revalidate Strategy - for some API calls
function staleWhileRevalidate(request) {
  return caches.match(request)
    .then((cachedResponse) => {
      // Always try to update the cache in background
      const fetchPromise = fetch(request, { credentials: 'include' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(API_CACHE_NAME)
              .then((cache) => {
                cache.put(request, networkResponse.clone());
              });
          }
          return networkResponse;
        })
        .catch(() => {
          // Network failed, cache remains as is
        });

      // Return cached version immediately if available
      if (cachedResponse) {
        return cachedResponse;
      }

      // No cache, wait for network
      return fetchPromise;
    });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and external domains
  if (request.method !== 'GET' || !url.pathname.startsWith('/')) {
    return;
  }

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    // Check if it's a cache-first endpoint (like images)
    const isCacheFirst = API_ENDPOINTS.cacheFirst.some(endpoint =>
      url.pathname.startsWith(endpoint)
    );

    if (isCacheFirst) {
      event.respondWith(cacheFirst(request));
      return;
    }

    // Check if it's a network-first endpoint
    const isNetworkFirst = API_ENDPOINTS.networkFirst.some(endpoint =>
      url.pathname.startsWith(endpoint)
    );

    if (isNetworkFirst) {
      event.respondWith(networkFirst(request));
      return;
    }

    // Default to stale-while-revalidate for other API calls
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Handle static assets - use cache first strategy
  event.respondWith(cacheFirst(request));
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME);
    caches.delete(API_CACHE_NAME);
  }
});