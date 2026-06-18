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

        const btn = document.getElementById('emergencyBtn');
        if (btn) {
            btn.addEventListener('touchstart', function() {
                this.style.transform = 'scale(0.96)';
            }, { passive: true });

            btn.addEventListener('touchend', function() {
                this.style.transform = '';
            }, { passive: true });
        }
    },

    registerSW: async function() {
        if (!('serviceWorker' in navigator)) {
            console.log('[App] Service Worker not supported');
            return;
        }

        try {
            // Unregister old SWs first to force update
            console.log('[App] Checking for old SWs...');
            const oldRegistrations = await navigator.serviceWorker.getRegistrations();
            for (let reg of oldRegistrations) {
                console.log('[App] Unregistering old SW:', reg.scope);
                await reg.unregister();
            }

            const registration = await navigator.serviceWorker.register('sw.js');
            console.log('[App] SW registered, scope:', registration.scope);

            // Force update check
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
            console.log('[App] Fetching VAPID key...');
            const response = await fetch('/vapid-public-key');
            if (!response.ok) {
                throw new Error('Failed to fetch VAPID key: ' + response.status);
            }
            const { publicKey } = await response.json();
            console.log('[App] Got VAPID key');

            console.log('[App] Subscribing to push...');
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(publicKey)
            });

            console.log('[App] Push subscription created');
            this.pushSubscription = subscription;

            console.log('[App] Sending subscription to server...');
            const subResponse = await fetch('/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription)
            });

            if (!subResponse.ok) {
                throw new Error('Server rejected subscription: ' + subResponse.status);
            }

            const subResult = await subResponse.json();
            console.log('[App] Subscription saved:', subResult);
            this.showInstallPrompt();

        } catch (err) {
            console.error('[App] Push subscription failed:', err);
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
        if (!('Notification' in window)) return;

        console.log('[App] Notification permission:', Notification.permission);
        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            console.log('[App] Permission result:', permission);
        }
    },

    setupInstallPrompt: function() {
        let deferredPrompt;

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            this.showInstallBanner(deferredPrompt);
        });

        window.addEventListener('appinstalled', () => {
            console.log('[App] PWA installed');
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
                deferredPrompt.userChoice.then((choice) => {
                    if (choice.outcome === 'accepted') {
                        console.log('[App] User installed PWA');
                    }
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

        console.log('[App] Setting up SW message listener');
        navigator.serviceWorker.addEventListener('message', (event) => {
            console.log('[App] Message from SW:', event.data);
            if (event.data && event.data.type === 'TRIGGER_EMERGENCY_ALARM') {
                console.log('[App] SW triggered alarm!');
                this.triggerIncomingAlarm(event.data.data);
            }
        });
    },

    checkUrlAlarmTrigger: function() {
        const params = new URLSearchParams(window.location.search);
        console.log('[App] URL params:', window.location.search);

        if (params.get('alarm') === '1') {
            console.log('[App] App opened from alarm notification!');
            const alertData = {
                lat: params.get('lat'),
                lng: params.get('lng'),
                timestamp: new Date().toISOString(),
                location: params.get('lat')
                    ? `${params.get('lat')}, ${params.get('lng')}`
                    : 'Location unknown',
                type: 'push'
            };
            setTimeout(() => {
                this.triggerIncomingAlarm(alertData);
            }, 800);

            window.history.replaceState({}, document.title, '/');
        }
    },

    triggerIncomingAlarm: function(alertData) {
        console.log('[App] triggerIncomingAlarm:', alertData);
        if (window.Emergency && Emergency.handleIncomingAlert) {
            Emergency.handleIncomingAlert(alertData);
        } else {
            console.error('[App] Emergency not loaded, retrying...');
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

        if (statusText) {
            statusText.textContent = Emergency.isAlerting ? 'Alerting...' : 'Ready';
        }

        if (statusDot) {
            statusDot.className = Emergency.isAlerting ? 'status-dot alerting' : 'status-dot ready';
        }
    },

    getVersion: function() {
        return '4.2-pwa';
    }
};

window.App = App;

document.addEventListener('DOMContentLoaded', function() {
    App.init();
});

setInterval(function() {
    App.updateStatus();
}, 1000);
