/* ========================================
   APP - Main Application (PWA + Push Edition)
   ======================================== */

const App = {
    initialized: false,
    pushSubscription: null,

    init: function() {
        if (this.initialized) return;
        this.initialized = true;

        console.log('[App] SoundAlert initializing...');
        console.log('[App] Version:', this.getVersion());
        console.log('[App] Protocol:', window.location.protocol);
        console.log('[App] URL:', window.location.href);
        console.log('[App] Device ID:', CONFIG.DEVICE_ID);

        this.registerSW();
        this.requestNotificationPermission();
        this.setupInstallPrompt();
        this.updateStatus();
        this.setupAlarmListener();
        this.checkUrlAlarmTrigger();
    },

    registerSW: async function() {
        if (!('serviceWorker' in navigator)) {
            console.error('[App] FATAL: Service Worker not supported');
            return;
        }

        try {
            console.log('[App] Starting SW registration...');

            // Get existing registrations
            const oldRegistrations = await navigator.serviceWorker.getRegistrations();
            console.log('[App] Found', oldRegistrations.length, 'existing SW registrations');

            // Check if we need to update (new version)
            let needsUpdate = false;
            for (let reg of oldRegistrations) {
                console.log('[App] Existing SW:', reg.scope, 'active:', !!reg.active);

                // If there's no active SW, or scope is wrong, unregister
                if (!reg.active) {
                    console.log('[App] Unregistering inactive SW');
                    await reg.unregister();
                    needsUpdate = true;
                }
            }

            // Register with explicit scope
            console.log('[App] Registering SW...');
            const registration = await navigator.serviceWorker.register('/sw.js', { 
                scope: '/' 
            });

            console.log('[App] SW registered. Scope:', registration.scope);
            console.log('[App] SW active:', !!registration.active);
            console.log('[App] SW installing:', !!registration.installing);
            console.log('[App] SW waiting:', !!registration.waiting);

            // Wait for SW to be ready
            await navigator.serviceWorker.ready;
            console.log('[App] SW is ready');

            // Subscribe to push
            await this.subscribeToPush(registration);

        } catch (err) {
            console.error('[App] SW registration failed:', err);
            console.error('[App] Error details:', err.message);
        }
    },

    subscribeToPush: async function(registration) {
        try {
            console.log('[App] Checking push subscription...');

            // Check existing subscription
            const existingSub = await registration.pushManager.getSubscription();

            if (existingSub) {
                console.log('[App] Existing subscription found');
                console.log('[App] Endpoint:', existingSub.endpoint.substring(0, 50) + '...');
                this.pushSubscription = existingSub;
                await this.syncSubscriptionWithServer(existingSub);
                return;
            }

            console.log('[App] No existing subscription, creating new one...');

            // Fetch VAPID key
            const response = await fetch('/vapid-public-key');
            if (!response.ok) {
                throw new Error('VAPID fetch failed: ' + response.status);
            }

            const { publicKey } = await response.json();
            console.log('[App] VAPID key received');

            // Subscribe
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(publicKey)
            });

            console.log('[App] Push subscription created!');
            console.log('[App] New endpoint:', subscription.endpoint.substring(0, 50) + '...');

            this.pushSubscription = subscription;
            await this.syncSubscriptionWithServer(subscription);

        } catch (err) {
            console.error('[App] Push subscription failed:', err.message);
            console.error('[App] Full error:', err);
        }
    },

    syncSubscriptionWithServer: async function(subscription) {
        try {
            console.log('[App] Syncing subscription with server...');
            console.log('[App] Tagging with deviceId:', CONFIG.DEVICE_ID);

            // Send deviceId alongside the subscription so the server can
            // exclude THIS device when broadcasting alerts THIS device sends.
            // Without this, a device receives a push notification (and plays
            // the alarm) for its own emergency alert — which is dangerous,
            // e.g. if the person is hiding the phone during an active threat.
            const subResponse = await fetch('/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    deviceId: CONFIG.DEVICE_ID,
                    subscription: subscription
                })
            });

            if (!subResponse.ok) {
                throw new Error('Server rejected: ' + subResponse.status);
            }

            const result = await subResponse.json();
            console.log('[App] Subscription synced. Server total:', result.total);

        } catch (err) {
            console.error('[App] Sync failed:', err.message);
        }
    },

    urlBase64ToUint8Array: function(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    },

    requestNotificationPermission: async function() {
        if (!('Notification' in window)) {
            console.log('[App] Notifications not supported');
            return;
        }

        console.log('[App] Notification permission:', Notification.permission);

        if (Notification.permission === 'default') {
            // Don't auto-request — wait for user gesture
            console.log('[App] Notification permission not decided yet');
            this.showPermissionButton();
        } else if (Notification.permission === 'denied') {
            console.warn('[App] Notifications blocked by user');
            this.showPermissionButton();
        } else if (Notification.permission === 'granted') {
            console.log('[App] Notifications already granted');
        }
    },

    showPermissionButton: function() {
        if (document.getElementById('permBtn')) return;

        const btn = document.createElement('button');
        btn.id = 'permBtn';
        btn.textContent = '🔔 Enable Notifications';
        btn.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;background:#E24B4A;color:white;border:none;padding:10px 16px;border-radius:8px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
        btn.onclick = async () => {
            const result = await Notification.requestPermission();
            console.log('[App] Permission result:', result);
            if (result === 'granted') {
                btn.remove();
                // Re-run push subscription now that we have permission
                const reg = await navigator.serviceWorker.ready;
                await this.subscribeToPush(reg);
            } else {
                btn.textContent = '❌ Notifications Blocked';
                btn.style.background = '#666';
            }
        };
        document.body.appendChild(btn);
    },

    setupInstallPrompt: function() {
        let deferredPrompt;

        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('[App] Install prompt available');
            e.preventDefault();
            deferredPrompt = e;
            this.showInstallBanner(deferredPrompt);
        });

        window.addEventListener('appinstalled', () => {
            console.log('[App] App installed');
            deferredPrompt = null;
            this.hideInstallBanner();
        });
    },

    showInstallBanner: function(deferredPrompt) {
        let banner = document.getElementById('installBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'installBanner';
            banner.innerHTML = `
                <div style="position:fixed;bottom:0;left:0;right:0;background:var(--red);color:white;padding:16px;text-align:center;z-index:9999;display:flex;align-items:center;justify-content:center;gap:12px;">
                    <span>Install SoundAlert for emergency alerts even when closed</span>
                    <button id="installBtn" style="background:white;color:var(--red);border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;">Install</button>
                    <button id="dismissInstall" style="background:transparent;color:white;border:1px solid white;padding:8px 12px;border-radius:8px;cursor:pointer;">X</button>
                </div>
            `;
            document.body.appendChild(banner);

            document.getElementById('installBtn').addEventListener('click', () => {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then(() => {
                    this.hideInstallBanner();
                });
            });

            document.getElementById('dismissInstall').addEventListener('click', () => {
                this.hideInstallBanner();
            });
        }
    },

    hideInstallBanner: function() {
        const banner = document.getElementById('installBanner');
        if (banner) banner.remove();
    },

    setupAlarmListener: function() {
        if (!('serviceWorker' in navigator)) return;

        navigator.serviceWorker.addEventListener('message', (event) => {
            console.log('[App] Message from SW:', event.data);
            if (event.data && event.data.type === 'TRIGGER_EMERGENCY_ALARM') {
                this.triggerIncomingAlarm(event.data.data);
            }
        });
    },

    checkUrlAlarmTrigger: function() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('alarm') !== '1') return;

        console.log('[App] Opened from alarm notification');

        const alertData = {
            id: params.get('id') || null,
            alertType: params.get('alertType') || null,
            alertTypeLabel: params.get('alertTypeLabel') || null,
            alertTypeShort: params.get('alertTypeShort') || null,
            alertTypeColor: params.get('alertTypeColor') || null,
            lat: params.get('lat') || null,
            lng: params.get('lng') || null,
            location: params.get('location')
                ? decodeURIComponent(params.get('location'))
                : (params.get('lat') ? `${params.get('lat')}, ${params.get('lng')}` : 'Location unknown'),
            timestamp: params.get('ts') || new Date().toISOString(),
            type: 'push'
        };

        setTimeout(() => {
            this.triggerIncomingAlarm(alertData);
        }, 800);

        window.history.replaceState({}, document.title, '/');
    },

    triggerIncomingAlarm: function(alertData) {
        console.log('[App] triggerIncomingAlarm:', alertData);
        if (window.Emergency && Emergency.handleIncomingAlert) {
            Emergency.handleIncomingAlert(alertData);
        } else {
            setTimeout(() => {
                if (window.Emergency && Emergency.handleIncomingAlert) {
                    Emergency.handleIncomingAlert(alertData);
                }
            }, 500);
        }
    },

    updateStatus: function() {
        const statusText = document.getElementById('statusText');
        const statusDot = document.getElementById('statusDot');
        if (statusText) statusText.textContent = Emergency.isAlerting ? 'Alerting...' : 'Ready';
        if (statusDot) statusDot.className = Emergency.isAlerting ? 'status-dot alerting' : 'status-dot ready';
    },

    testPushNotification: async function() {
        console.log('[App] Testing push...');
        if (!this.pushSubscription) {
            alert('No push subscription. Check console for errors.');
            return;
        }

        try {
            const response = await fetch('/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: Date.now().toString(36),
                    alertType: 'TEST',
                    alertTypeLabel: 'Test Alert',
                    alertTypeShort: 'TEST',
                    alertTypeColor: '#3B82F6',
                    timestamp: new Date().toISOString(),
                    timeFormatted: new Date().toLocaleString(),
                    location: 'Test notification',
                    message: 'TEST NOTIFICATION'
                    // Note: deviceId intentionally omitted here so the test
                    // button still pushes back to this device for verification.
                })
            });
            const result = await response.json();
            console.log('[App] Test result:', result);
            alert(`Push sent to ${result.sent} devices`);
        } catch (err) {
            console.error('[App] Test failed:', err);
            alert('Test failed: ' + err.message);
        }
    },

    forceReRegisterSW: async function() {
        console.log('[App] Force re-registering...');
        const regs = await navigator.serviceWorker.getRegistrations();
        for (let reg of regs) {
            await reg.unregister();
        }
        window.location.reload();
    },

    getVersion: function() {
        return '4.7-sender-excluded';
    }
};

window.App = App;

document.addEventListener('DOMContentLoaded', function() {
    App.init();
});

setInterval(function() {
    App.updateStatus();
}, 1000);