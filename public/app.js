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

        this.registerSW();
        this.requestNotificationPermission();
        this.setupInstallPrompt();
        this.updateStatus();
        this.setupAlarmListener();
        this.checkUrlAlarmTrigger();
    },

    registerSW: async function() {
        if (!('serviceWorker' in navigator)) {
            console.log('[App] Service Worker not supported');
            return;
        }

        try {
            // FIX: Only unregister outdated SWs, not on every load.
            // Check if existing registration has a different script URL or is dead.
            const oldRegistrations = await navigator.serviceWorker.getRegistrations();
            let hadOld = false;
            for (let reg of oldRegistrations) {
                // Only unregister if the SW is not our current sw.js
                const expectedScope = new URL('sw.js', window.location.href).href.replace('sw.js', '');
                if (!reg.scope.includes(expectedScope) || !reg.active) {
                    console.log('[App] Unregistering stale SW:', reg.scope);
                    await reg.unregister();
                    hadOld = true;
                }
            }

            const registration = await navigator.serviceWorker.register('sw.js');
            console.log('[App] SW registered, scope:', registration.scope);
            registration.update();

            await navigator.serviceWorker.ready;
            console.log('[App] SW is ready');

            await this.subscribeToPush(registration);
        } catch (err) {
            console.error('[App] SW registration failed:', err);
        }
    },

    subscribeToPush: async function(registration) {
        try {
            // Check if we already have a valid subscription
            const existingSub = await registration.pushManager.getSubscription();
            if (existingSub) {
                console.log('[App] Existing push subscription found');
                this.pushSubscription = existingSub;
                // Re-sync with server in case it was lost
                await this.syncSubscriptionWithServer(existingSub);
                return;
            }

            const response = await fetch('/vapid-public-key');
            if (!response.ok) throw new Error('Failed to fetch VAPID key: ' + response.status);
            const { publicKey } = await response.json();

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(publicKey)
            });

            this.pushSubscription = subscription;
            await this.syncSubscriptionWithServer(subscription);

        } catch (err) {
            console.error('[App] Push subscription failed:', err);
        }
    },

    syncSubscriptionWithServer: async function(subscription) {
        try {
            const subResponse = await fetch('/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription)
            });

            if (!subResponse.ok) throw new Error('Server rejected subscription: ' + subResponse.status);
            console.log('[App] Push subscription saved');
        } catch (err) {
            console.error('[App] Failed to sync subscription:', err);
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
            console.log('[App] Notifications not supported on this device');
            this.showNotificationWarning('Notifications not supported');
            return;
        }

        console.log('[App] Notification permission state:', Notification.permission);

        if (Notification.permission === 'default') {
            const result = await Notification.requestPermission();
            console.log('[App] Notification permission result:', result);
            if (result !== 'granted') {
                this.showNotificationWarning('Permission denied — alerts will not show when app is closed');
            }
        } else if (Notification.permission === 'denied') {
            console.warn('[App] Notification permission was previously denied');
            this.showNotificationWarning('Notifications blocked — enable in browser settings');
        }
    },

    showNotificationWarning: function(message) {
        // Show a subtle warning in the UI
        const statusText = document.getElementById('statusText');
        if (statusText && !document.getElementById('notifWarning')) {
            const warning = document.createElement('div');
            warning.id = 'notifWarning';
            warning.style.cssText = 'text-align:center;font-size:11px;color:#F59E0B;margin-top:4px;';
            warning.textContent = '⚠️ ' + message;
            statusText.parentNode.appendChild(warning);
        }
    },

    setupInstallPrompt: function() {
        let deferredPrompt;
        let installPromptFired = false;

        console.log('[App] Setting up install prompt listener...');

        // Check if already installed as PWA
        if (window.matchMedia('(display-mode: standalone)').matches || 
            window.navigator.standalone === true) {
            console.log('[App] App is already running in standalone mode (installed)');
            return;
        }

        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('[App] beforeinstallprompt event fired!');
            installPromptFired = true;
            e.preventDefault();
            deferredPrompt = e;
            this.showInstallBanner(deferredPrompt);
        });

        window.addEventListener('appinstalled', () => {
            console.log('[App] App was installed');
            deferredPrompt = null;
            this.hideInstallBanner();
        });

        // Diagnostic: check why prompt might not fire
        setTimeout(() => {
            if (!installPromptFired) {
                console.log('[App] Install prompt did not fire. Possible reasons:');
                console.log('  - App already installed');
                console.log('  - Not meeting PWA criteria (HTTPS, manifest icons, SW)');
                console.log('  - User previously dismissed install');
                console.log('  - Not enough engagement time (need 30s interaction)');
                this.checkPWARequirements();
            }
        }, 5000);
    },

    checkPWARequirements: function() {
        console.log('[App] PWA Requirements Check:');
        console.log('  - HTTPS:', window.location.protocol === 'https:');
        console.log('  - Service Worker:', 'serviceWorker' in navigator);
        console.log('  - Push Manager:', 'PushManager' in window);
        console.log('  - Manifest:', document.querySelector('link[rel="manifest"]') !== null);
        console.log('  - Display mode:', window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser');

        // Check manifest validity
        fetch('/webmanifest.json')
            .then(r => r.json())
            .then(manifest => {
                console.log('  - Manifest parsed:', !!manifest);
                console.log('  - Manifest name:', manifest.name || manifest.short_name);
                console.log('  - Manifest display:', manifest.display);
                console.log('  - Manifest icons count:', manifest.icons?.length || 0);
                const has192 = manifest.icons?.some(i => i.sizes?.includes('192'));
                const has512 = manifest.icons?.some(i => i.sizes?.includes('512'));
                console.log('  - Has 192x192 icon:', has192);
                console.log('  - Has 512x512 icon:', has512);
                if (!has192 || !has512) {
                    console.warn('[App] MISSING REQUIRED ICONS! Install prompt will not fire.');
                }
            })
            .catch(err => console.error('[App] Manifest fetch failed:', err));
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
                deferredPrompt.userChoice.then((choice) => {
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
        // Manual test: send a push to yourself
        console.log('[App] Testing push notification...');
        if (!this.pushSubscription) {
            console.error('[App] No push subscription available');
            alert('No push subscription. Try reloading the page.');
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
                    message: 'TEST NOTIFICATION',
                    description: 'This is a test'
                })
            });
            const result = await response.json();
            console.log('[App] Test push result:', result);
            alert(`Push sent to ${result.sent} devices`);
        } catch (err) {
            console.error('[App] Test push failed:', err);
            alert('Test push failed: ' + err.message);
        }
    },

    getVersion: function() {
        return '4.5-pwa-push-debug';
    }
};

window.App = App;

document.addEventListener('DOMContentLoaded', function() {
    App.init();
});

setInterval(function() {
    App.updateStatus();
}, 1000);
