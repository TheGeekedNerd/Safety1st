const CACHE_NAME = 'soundalert-v12';
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
    '/queue.js',
    '/status-indicator.js',
    '/contacts.js',
    '/mesh.js',
    '/webmanifest.json',
    '/emergency_alarm.mp3',
    '/icon-192.png',
    '/icon-512.png',
    '/badge-72.png'
];

const API_ROUTES = [
    '/health', '/vapid-public-key', '/subscribe', '/broadcast', '/debug-subs',
    '/api/contacts', '/api/alerts/sms', '/api/alerts/history'
];

// ─── INSTALL ──────────────────────────────────────────────────────────────────
self.addEventListener('install', function(event) {
    console.log('[SW] Install', CACHE_NAME);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching', ASSETS.length, 'assets');
                return cache.addAll(ASSETS);
            })
            .then(() => self.skipWaiting())
            .catch(err => console.error('[SW] Install failed:', err))
    );
});

// ─── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', function(event) {
    console.log('[SW] Activate', CACHE_NAME);
    event.waitUntil(
        caches.keys()
            .then(cacheNames => Promise.all(
                cacheNames.map(name => {
                    if (name !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    }
                })
            ))
            .then(() => self.clients.claim())
    );
});

// ─── FETCH ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', function(event) {
    const url = new URL(event.request.url);

    // Always hit the network for API routes (including new ones)
    if (API_ROUTES.some(r => url.pathname.startsWith(r))) {
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

    // Cache-first for all other assets
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

// ─── BACKGROUND SYNC ─────────────────────────────────────────────────────────
// Fires when the device regains connectivity, even if the page is closed.
// Reads the IndexedDB queue and flushes it to /broadcast.
self.addEventListener('sync', function(event) {
    if (event.tag !== 'flush-alert-queue') return;

    console.log('[SW] Background Sync: flush-alert-queue');

    event.waitUntil(
        flushQueueFromSW().then(({ sent, failed }) => {
            console.log(`[SW] BG Sync flush: sent=${sent} failed=${failed}`);
            // Notify any open tabs
            return self.clients.matchAll({ type: 'window' }).then(clients => {
                clients.forEach(client =>
                    client.postMessage({ type: 'QUEUE_FLUSHED', sent, failed })
                );
            });
        })
    );
});

// ── SW-side queue flush (mirrors queue.js logic without the module system) ────
function openQueueDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('soundalert-queue', 1);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('pending-alerts')) {
                db.createObjectStore('pending-alerts', { keyPath: 'queueId' });
            }
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

async function flushQueueFromSW() {
    const db = await openQueueDB();

    const pending = await new Promise((resolve, reject) => {
        const tx  = db.transaction('pending-alerts', 'readonly');
        const req = tx.objectStore('pending-alerts').getAll();
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });

    let sent = 0, failed = 0;

    for (const alert of pending) {
        try {
            const payload = { ...alert, tier: 'internet' };
            delete payload.queueId;

            const res = await fetch('/broadcast', {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            // Remove from queue
            await new Promise((resolve, reject) => {
                const tx  = db.transaction('pending-alerts', 'readwrite');
                const req = tx.objectStore('pending-alerts').delete(alert.queueId);
                req.onsuccess = () => resolve();
                req.onerror   = e => reject(e.target.error);
            });

            sent++;
        } catch (_) {
            failed++;
        }
    }

    return { sent, failed };
}

// ─── PUSH ─────────────────────────────────────────────────────────────────────
self.addEventListener('push', function(event) {
    console.log('[SW] Push received');

    let data = {};
    try {
        data = event.data.json();
    } catch (e) {
        data = { title: 'Emergency Alert', body: 'Someone needs help nearby!' };
    }

    const options = {
        body              : data.body || 'Emergency alert received',
        icon              : data.icon || '/icon-192.png',
        badge             : data.badge || '/badge-72.png',
        tag               : data.tag || 'emergency',
        requireInteraction: true,
        renotify          : true,
        vibrate           : [200, 100, 200, 100, 400, 100, 200],
        actions           : [
            { action: 'open',    title: 'OPEN ALARM' },
            { action: 'dismiss', title: 'Dismiss'    }
        ],
        data  : data.data || {},
        silent: false
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Emergency Alert!', options)
            .then(() => console.log('[SW] Notification shown'))
            .catch(err => console.error('[SW] Notification failed:', err))
    );
});

// ─── NOTIFICATION CLICK ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', function(event) {
    console.log('[SW] Notification click. Action:', event.action);
    event.notification.close();

    const alertData = event.notification.data || {};
    if (event.action === 'dismiss') return;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                for (const client of clientList) {
                    if ('focus' in client) {
                        client.focus();
                        client.postMessage({ type: 'TRIGGER_EMERGENCY_ALARM', data: alertData });
                        return;
                    }
                }
                if (clients.openWindow) {
                    const params = new URLSearchParams({ alarm: '1' });
                    if (alertData.alertType)      params.set('alertType',      alertData.alertType);
                    if (alertData.alertTypeLabel) params.set('alertTypeLabel', alertData.alertTypeLabel);
                    if (alertData.alertTypeShort) params.set('alertTypeShort', alertData.alertTypeShort);
                    if (alertData.alertTypeColor) params.set('alertTypeColor', alertData.alertTypeColor);
                    if (alertData.lat)            params.set('lat',            alertData.lat);
                    if (alertData.lng)            params.set('lng',            alertData.lng);
                    if (alertData.location)       params.set('location',       encodeURIComponent(alertData.location));
                    if (alertData.id)             params.set('id',             alertData.id);
                    if (alertData.timestamp)      params.set('ts',             alertData.timestamp);
                    return clients.openWindow('/?' + params.toString());
                }
            })
    );
});

// ─── PUSH SUBSCRIPTION CHANGE ─────────────────────────────────────────────────
self.addEventListener('pushsubscriptionchange', function(event) {
    console.log('[SW] Push subscription changed');
    event.waitUntil(
        fetch('/subscribe', {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify(event.newSubscription)
        }).then(() => console.log('[SW] New subscription sent to server'))
          .catch(err => console.error('[SW] Failed to send new subscription:', err))
    );
});

// ─── MESSAGE HANDLER ──────────────────────────────────────────────────────────
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'KEEP_ALIVE') {
        event.ports[0]?.postMessage({ status: 'alive' });
        return;
    }

    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const { title, body, data } = event.data;
        self.registration.showNotification(title || 'Emergency Alert', {
            body              : body || 'Someone needs help!',
            icon              : '/icon-192.png',
            badge             : '/badge-72.png',
            tag               : 'emergency-' + (data?.id || Date.now()),
            requireInteraction: true,
            renotify          : true,
            vibrate           : [200, 100, 200, 100, 400, 100, 200],
            actions           : [
                { action: 'open',    title: 'OPEN ALARM' },
                { action: 'dismiss', title: 'Dismiss'    }
            ],
            data: data || {}
        });
    }
});