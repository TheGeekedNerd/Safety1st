const CACHE_NAME = 'soundalert-v5';
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

// API routes that should NEVER be cached
const API_ROUTES = ['/health', '/vapid-public-key', '/subscribe', '/broadcast'];

self.addEventListener('install', function(event) {
    console.log('[SW] Install event v5');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('[SW] Caching assets...');
                return cache.addAll(ASSETS);
            })
            .then(function() {
                console.log('[SW] Skip waiting');
                return self.skipWaiting();
            })
            .catch(err => console.error('[SW] Install failed:', err))
    );
});

self.addEventListener('activate', function(event) {
    console.log('[SW] Activate event v5');
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Claiming clients');
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function(event) {
    const url = new URL(event.request.url);

    // NEVER cache API routes - always go to network
    if (API_ROUTES.includes(url.pathname)) {
        console.log('[SW] API route, fetching from network:', url.pathname);
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response(JSON.stringify({ error: 'Network unavailable' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // For static assets, use cache-first
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
    console.log('[SW] PUSH EVENT RECEIVED');

    let data = {};
    try {
        data = event.data.json();
        console.log('[SW] Push data:', JSON.stringify(data));
    } catch (e) {
        console.error('[SW] Failed to parse push data:', e);
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
        renotify: true,
        vibrate: [200, 100, 200, 100, 400, 100, 200],
        actions: [
            { action: 'open', title: 'OPEN ALARM' },
            { action: 'dismiss', title: 'Dismiss' }
        ],
        data: data.data || data || {},
        silent: false
    };

    console.log('[SW] Showing notification');

    event.waitUntil(
        self.registration.showNotification(data.title || 'Emergency Alert!', options)
            .then(() => console.log('[SW] Notification shown'))
            .catch(err => console.error('[SW] Failed to show notification:', err))
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', function(event) {
    console.log('[SW] NOTIFICATION CLICK. Action:', event.action);
    event.notification.close();

    const alertData = event.notification.data || {};
    console.log('[SW] Notification data:', JSON.stringify(alertData));

    if (event.action === 'dismiss') {
        console.log('[SW] User dismissed');
        return;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(function(clientList) {
                console.log('[SW] Found clients:', clientList.length);

                for (let client of clientList) {
                    console.log('[SW] Client:', client.url);
                    if ('focus' in client) {
                        client.focus();
                        client.postMessage({
                            type: 'TRIGGER_EMERGENCY_ALARM',
                            data: alertData
                        });
                        console.log('[SW] Message posted to client');
                        return;
                    }
                }

                console.log('[SW] No open client, opening new window');
                if (clients.openWindow) {
                    const alarmUrl = alertData.lat && alertData.lng
                        ? `/?alarm=1&lat=${alertData.lat}&lng=${alertData.lng}&time=${Date.now()}`
                        : '/?alarm=1';
                    console.log('[SW] Opening:', alarmUrl);
                    return clients.openWindow(alarmUrl);
                }
            })
            .catch(err => console.error('[SW] Error:', err))
    );
});

self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'KEEP_ALIVE') {
        event.ports[0]?.postMessage({ status: 'alive' });
    }
});
