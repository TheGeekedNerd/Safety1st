/* ========================================
   APP - Main Application (PWA + Push Edition)
   ======================================== */

const App = {
    initialized: false,
    pushSubscription: null,

    init: function() {
        if (this.initialized) return;
        this.initialized = true;

        console.log('🚨 SoundAlert initializing...');

        // Register Service Worker with push support
        this.registerSW();

        // Request notification permission
        this.requestNotificationPermission();

        // Add install prompt
        this.setupInstallPrompt();

        // Update status
        this.updateStatus();

        // Touch feedback
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

    /**
     * Register Service Worker
     */
    registerSW: async function() {
        if (!('serviceWorker' in navigator)) {
            console.log('Service Worker not supported');
            return;
        }

        try {
            const registration = await navigator.serviceWorker.register('sw.js');
            console.log('✅ SW registered');

            // Subscribe to push notifications
            await this.subscribeToPush(registration);

        } catch (err) {
            console.error('SW registration failed:', err);
        }
    },

    /**
     * Subscribe to push notifications
     */
    subscribeToPush: async function(registration) {
        try {
            // Get VAPID public key from server
            const response = await fetch('/vapid-public-key');
            const { publicKey } = await response.json();

            // Subscribe
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(publicKey)
            });

            console.log('🔔 Push subscription:', subscription);
            this.pushSubscription = subscription;

            // Send subscription to server
            await fetch('/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription)
            });

            console.log('🔔 Push subscription saved to server');
            this.showInstallPrompt();

        } catch (err) {
            console.error('Push subscription failed:', err);
        }
    },

    /**
     * Convert VAPID key
     */
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

    /**
     * Request notification permission
     */
    requestNotificationPermission: async function() {
        if (!('Notification' in window)) return;

        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            console.log('Notification permission:', permission);
        }
    },

    /**
     * Setup PWA install prompt
     */
    setupInstallPrompt: function() {
        let deferredPrompt;

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            this.showInstallBanner(deferredPrompt);
        });

        window.addEventListener('appinstalled', () => {
            console.log('✅ PWA installed');
            deferredPrompt = null;
            this.hideInstallBanner();
        });
    },

    /**
     * Show install banner
     */
    showInstallBanner: function(deferredPrompt) {
        // Create install banner if not exists
        let banner = document.getElementById('installBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'installBanner';
            banner.innerHTML = `
                <div style="position:fixed;bottom:0;left:0;right:0;background:var(--red);color:white;padding:16px;text-align:center;z-index:9999;display:flex;align-items:center;justify-content:center;gap:12px;">
                    <span>📲 Install SoundAlert for emergency alerts even when closed</span>
                    <button id="installBtn" style="background:white;color:var(--red);border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;">Install</button>
                    <button id="dismissInstall" style="background:transparent;color:white;border:1px solid white;padding:8px 12px;border-radius:8px;cursor:pointer;">✕</button>
                </div>
            `;
            document.body.appendChild(banner);

            document.getElementById('installBtn').addEventListener('click', () => {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((choice) => {
                    if (choice.outcome === 'accepted') {
                        console.log('User installed PWA');
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

    showInstallPrompt: function() {
        // Also show a subtle prompt in the UI
        const liveUsers = document.getElementById('liveUsers');
        if (liveUsers && !window.matchMedia('(display-mode: standalone)').matches) {
            // Not installed yet
        }
    },

    /**
     * Update status display
     */
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
        return '4.0-pwa';
    }
};

window.App = App;

document.addEventListener('DOMContentLoaded', function() {
    App.init();
});

setInterval(function() {
    App.updateStatus();
}, 1000);
