/* ========================================
   APP - Main Application
   ======================================== */

const App = {
    initialized: false,

    /**
     * Initialize the application
     */
    init: function() {
        if (this.initialized) return;
        this.initialized = true;

        console.log('🚨 SoundAlert initialized');
        console.log(`📋 History: ${History.count()} alerts`);
        console.log(`📡 GPS: ${GPS.isAvailable() ? 'Available' : 'Not available'}`);

        // Request notification permission
        if (CONFIG.NOTIFICATIONS.ENABLED && 'Notification' in window && Notification.permission === 'default') {
            setTimeout(() => {
                Notification.requestPermission().catch(() => {});
            }, 3000);
        }

        // Update status
        this.updateStatus();

        // Add touch feedback to emergency button
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

    /**
     * Get app version
     */
    getVersion: function() {
        return '1.0';
    }
};

// Make globally available
window.App = App;

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
    App.init();
});

// Update status periodically
setInterval(function() {
    App.updateStatus();
}, 1000);
