const CACHE_NAME = 'soundalert-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/emergency.js',
  '/gps.js',
  '/history.js',
  '/nearby.js',
  '/sonic.js',
  '/p2p.js',
  '/config.js',
  '/webmanifest.json'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(ASSETS);
      })
      .then(function() {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(cachedResponse) {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request)
          .then(function(networkResponse) {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(function(cache) {
                  cache.put(event.request, responseClone);
                });
            }
            return networkResponse;
          })
          .catch(function() {
            return new Response('⚠️ Offline', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
});

self.addEventListener('push', function(event) {
  console.log('🔔 Push received:', event);

  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = {
      title: '🚨 Emergency Alert',
      body: 'Someone needs help nearby!',
      icon: '/icon-192.png'
    };
  }

  const options = {
    body: data.body || 'Emergency alert received',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    tag: data.tag || 'emergency',
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 400, 100, 200],
    actions: data.actions || [
      { action: 'open', title: 'View Location' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '🚨 Emergency Alert!', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  console.log('🔔 Notification clicked:', event.action);
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        for (let client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});