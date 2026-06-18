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
            const oldRegistrations = await navigator.serviceWorker.getRegistrations();
            for (let reg of oldRegistrations) {
                await reg.unregister();
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
            const response = await fetch('/vapid-public-key');
            if (!response.ok) throw new Error('Failed to fetch VAPID key: ' + response.status);
            const { publicKey } = await response.json();

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(publicKey)
            });

            this.pushSubscription = subscription;

            const subResponse = await fetch('/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription)
            });

            if (!subResponse.ok) throw new Error('Server rejected subscription: ' + subResponse.status);
            console.log('[App] Push subscription saved');
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
        if (Notification.permission === 'default') {
            await Notification.requestPermission();
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

        // Reconstruct full alertData from URL params — including alertType
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

    getVersion: function() {
        return '4.3-pwa';
    }
};

window.App = App;

document.addEventListener('DOMContentLoaded', function() {
    App.init();
});

setInterval(function() {
    App.updateStatus();
}, 1000);