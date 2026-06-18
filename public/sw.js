const CACHE_NAME = 'soundalert-v4';
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
    '/webmanifest.json',
    '/emergency_alarm.mp3'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('[SW] Caching assets...');
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
                        return new Response('[SW] Offline', {
                            status: 503,
                            statusText: 'Service Unavailable',
                            headers: { 'Content-Type': 'text/plain' }
                        });
                    });
            })
    );
});

// ============================================
// PUSH NOTIFICATIONS + ALARM TRIGGER
// ============================================

self.addEventListener('push', function(event) {
    console.log('[SW] Push received:', event);

    let data = {};
    try {
        data = event.data.json();
    } catch (e) {
        data = {
            title: 'Emergency Alert',
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
            { action: 'open', title: 'OPEN ALARM' },
            { action: 'dismiss', title: 'Dismiss' }
        ],
        data: data.data || {}
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Emergency Alert!', options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', function(event) {
    console.log('[SW] Notification clicked:', event.action);
    event.notification.close();

    const alertData = event.notification.data || {};

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(function(clientList) {
                // If app is already open, focus it and trigger alarm
                for (let client of clientList) {
                    if ('focus' in client) {
                        client.focus();
                        client.postMessage({
                            type: 'TRIGGER_EMERGENCY_ALARM',
                            data: alertData
                        });
                        return;
                    }
                }
                // Otherwise open new window with alarm flag
                if (clients.openWindow) {
                    const alarmUrl = alertData.lat && alertData.lng
                        ? `/?alarm=1&lat=${alertData.lat}&lng=${alertData.lng}&time=${Date.now()}`
                        : '/?alarm=1';
                    return clients.openWindow(alarmUrl);
                }
            })
    );
});

// Listen for messages from the page
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'KEEP_ALIVE') {
        event.ports[0]?.postMessage({ status: 'alive' });
    }
});
