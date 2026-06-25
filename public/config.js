/* ========================================
   CONFIGURATION
   ======================================== */
const CONFIG = {
    // Emergency settings
    EMERGENCY: {
        AUTO_CANCEL_DELAY: 30000,      // 30 seconds
        COOLDOWN: 3000,                 // 3 seconds between triggers
        MAX_HISTORY: 50                 // Keep last 50 alerts
    },
    // GPS settings
    GPS: {
        ENABLE_HIGH_ACCURACY: true,
        TIMEOUT: 10000,                 // 10 seconds
        MAXIMUM_AGE: 60000              // 1 minute
    },
    // Notification settings
    NOTIFICATIONS: {
        ENABLED: true,
        SOUND: true
    },
    // Nearby devices
    NEARBY: {
        SCAN_INTERVAL: 5000,            // 5 seconds
        MAX_DEVICES: 10
    }
};

// ─── DEVICE IDENTITY ────────────────────────────────────────────────────────
// Persistent per-install identifier. Used so the server can exclude the
// sending device when broadcasting an alert (the sender must never receive
// its own emergency notification/sound back).
const DeviceIdentity = {
    STORAGE_KEY: 'safety1st-device-id',

    getId: function() {
        try {
            let id = localStorage.getItem(this.STORAGE_KEY);
            if (!id) {
                id = (window.crypto && crypto.randomUUID)
                    ? crypto.randomUUID()
                    : 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
                localStorage.setItem(this.STORAGE_KEY, id);
            }
            return id;
        } catch (e) {
            // localStorage unavailable (private mode, etc.) — fall back to
            // an in-memory id for this session only.
            if (!this._memId) {
                this._memId = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
            }
            return this._memId;
        }
    }
};

CONFIG.DEVICE_ID = DeviceIdentity.getId();

// Make globally available
window.CONFIG = CONFIG;
window.DeviceIdentity = DeviceIdentity;