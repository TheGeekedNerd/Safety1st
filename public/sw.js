const CACHE_NAME = 'soundalert-v7';
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

const API_ROUTES = ['/health', '/vapid-public-key', '/subscribe', '/broadcast'];

self.addEventListener('install', function(event) {
    console.log('[SW] Install v7');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
            .catch(err => console.error('[SW] Install failed:', err))
    );
});

self.addEventListener('activate', function(event) {
    console.log('[SW] Activate v7');
    event.waitUntil(
        caches.keys().then(cacheNames => Promise.all(
            cacheNames.map(name => {
                if (name !== CACHE_NAME) {
                    console.log('[SW] Deleting old cache:', name);
                    return caches.delete(name);
                }
            })
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', function(event) {
    const url = new URL(event.request.url);

    if (API_ROUTES.includes(url.pathname)) {
        event.respondWith(
            fetch(event.request).catch(() =>
                new Response(JSON.stringify({ error: 'Network unavailable' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                })
            )
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) return cachedResponse;
            return fetch(event.request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200) {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return networkResponse;
            }).catch(() =>
                new Response('[SW] Offline', {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 'Content-Type': 'text/plain' }
                })
            );
        })
    );
});

// ============================================
// PUSH NOTIFICATIONS
// ============================================

self.addEventListener('push', function(event) {
    console.log('[SW] Push received');

    let data = {};
    try {
        data = event.data.json();
    } catch (e) {
        data = {
            title: 'Emergency Alert',
            body: 'Someone needs help nearby!'
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
        data: data.data || {},
        silent: false
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Emergency Alert!', options)
    );
});

self.addEventListener('notificationclick', function(event) {
    console.log('[SW] Notification click. Action:', event.action);
    event.notification.close();

    const alertData = event.notification.data || {};
    if (event.action === 'dismiss') return;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                // If app is already open, post message directly
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

                // App not open — build URL with all alertType fields so
                // checkUrlAlarmTrigger can reconstruct the full alert
                if (clients.openWindow) {
                    const params = new URLSearchParams({ alarm: '1' });
                    if (alertData.alertType)      params.set('alertType', alertData.alertType);
                    if (alertData.alertTypeLabel)  params.set('alertTypeLabel', alertData.alertTypeLabel);
                    if (alertData.alertTypeShort)  params.set('alertTypeShort', alertData.alertTypeShort);
                    if (alertData.alertTypeColor)  params.set('alertTypeColor', alertData.alertTypeColor);
                    if (alertData.lat)             params.set('lat', alertData.lat);
                    if (alertData.lng)             params.set('lng', alertData.lng);
                    if (alertData.location)        params.set('location', encodeURIComponent(alertData.location));
                    if (alertData.id)              params.set('id', alertData.id);
                    if (alertData.timestamp)       params.set('ts', alertData.timestamp);

                    return clients.openWindow('/?' + params.toString());
                }
            })
    );
});

self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'KEEP_ALIVE') {
        event.ports[0]?.postMessage({ status: 'alive' });
    }
});