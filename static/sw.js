// Service Worker for Weather Dashboard PWA
const CACHE_NAME = 'weather-dashboard-v1';
const STATIC_CACHE_NAME = 'weather-dashboard-static-v1';

// Files to cache for offline functionality
const STATIC_FILES = [
  '/',
  '/static/css/weather-components.css',
  '/static/js/weather-components.js',
  '/static/js/realtime-weather.js',
  '/static/manifest.json',
  '/static/icons/app-icon.svg'
];

// Weather icons that should be cached
const WEATHER_ICONS = [
  '/static/icons/weather/static/clear-day.svg',
  '/static/icons/weather/static/clear-night.svg',
  '/static/icons/weather/static/cloudy.svg',
  '/static/icons/weather/static/rain.svg',
  '/static/icons/weather/static/partly-cloudy-day.svg',
  '/static/icons/weather/static/partly-cloudy-night.svg',
  '/static/icons/weather/static/fog.svg',
  '/static/icons/weather/static/wind.svg',
  '/static/icons/weather/static/thunderstorm.svg'
];

// Install event - cache static files
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        console.log('Service Worker: Caching static files');
        return cache.addAll(STATIC_FILES);
      }),
      caches.open(CACHE_NAME).then((cache) => {
        console.log('Service Worker: Caching weather icons');
        return cache.addAll(WEATHER_ICONS.map(icon => {
          return fetch(icon).then(response => {
            if (response.ok) {
              return cache.put(icon, response);
            }
            return Promise.resolve();
          }).catch(() => Promise.resolve());
        }));
      })
    ])
  );
  
  // Force the service worker to activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Handle API requests with network-first strategy
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // If successful, cache the response for short-term offline use
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // If network fails, try to serve from cache
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // Return a fallback response for weather API
            if (url.pathname === '/api/weather') {
              return new Response(
                JSON.stringify({
                  error: 'Offline - Unable to fetch current weather data',
                  current: {
                    temperature: '--',
                    feels_like: '--',
                    humidity: '--',
                    wind_speed: '--',
                    uv_index: '--',
                    icon: 'clear-day',
                    summary: 'Offline Mode'
                  },
                  hourly: [],
                  daily: [],
                  location: 'Offline'
                }),
                {
                  headers: { 'Content-Type': 'application/json' },
                  status: 200
                }
              );
            }
            
            return new Response('Offline', { status: 503 });
          });
        })
    );
    return;
  }
  
  // Handle static files with cache-first strategy
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(request).then((response) => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        
        // Cache successful responses
        const responseClone = response.clone();
        const cacheToUse = url.pathname.startsWith('/static/') ? STATIC_CACHE_NAME : CACHE_NAME;
        
        caches.open(cacheToUse).then((cache) => {
          cache.put(request, responseClone);
        });
        
        return response;
      });
    })
  );
});

// Handle background sync for weather updates
self.addEventListener('sync', (event) => {
  if (event.tag === 'weather-update') {
    event.waitUntil(
      // Attempt to fetch fresh weather data
      fetch('/api/weather')
        .then((response) => response.json())
        .then((data) => {
          // Notify clients of updated weather data
          self.clients.matchAll().then((clients) => {
            clients.forEach((client) => {
              client.postMessage({
                type: 'weather-update',
                data: data
              });
            });
          });
        })
        .catch((error) => {
          console.log('Background sync failed:', error);
        })
    );
  }
});

// Handle push notifications (for future weather alerts)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body || 'Weather alert!',
      icon: '/static/icons/icon-192x192.png',
      badge: '/static/icons/icon-72x72.png',
      tag: 'weather-alert',
      renotify: true,
      actions: [
        {
          action: 'view',
          title: 'View Weather'
        },
        {
          action: 'dismiss',
          title: 'Dismiss'
        }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Weather Dashboard', options)
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});