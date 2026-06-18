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

// Make globally available
window.CONFIG = CONFIG;
