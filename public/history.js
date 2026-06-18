/* ========================================
   HISTORY MODULE
   ======================================== */

const History = {
    entries: [],
    storageKey: 'emergencyHistory',

    /**
     * Load history from localStorage
     */
    load: function() {
        try {
            const data = localStorage.getItem(this.storageKey);
            this.entries = data ? JSON.parse(data) : [];
        } catch (e) {
            this.entries = [];
        }
        this.updateDisplay();
        return this.entries;
    },

    /**
     * Save an alert to history (outgoing)
     */
    save: function(locationText) {
        const entry = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
            timestamp: new Date().toISOString(),
            location: locationText,
            lat: GPS.currentLocation ? GPS.currentLocation.lat : null,
            lng: GPS.currentLocation ? GPS.currentLocation.lng : null,
            type: 'EMERGENCY'
        };

        this.entries.unshift(entry);

        if (this.entries.length > CONFIG.EMERGENCY.MAX_HISTORY) {
            this.entries.length = CONFIG.EMERGENCY.MAX_HISTORY;
        }

        this.saveToStorage();
        this.updateDisplay();
        return entry;
    },

    /**
     * Add an incoming alert from another device/server
     */
    addFromServer: function(alert) {
        const entry = {
            id: alert.id || Date.now().toString(36),
            timestamp: alert.timestamp || new Date().toISOString(),
            location: alert.location || 'Unknown location',
            lat: alert.lat || null,
            lng: alert.lng || null,
            type: 'INCOMING'
        };

        // Avoid duplicates
        if (this.entries.some(e => e.id === entry.id)) return;

        this.entries.unshift(entry);

        if (this.entries.length > CONFIG.EMERGENCY.MAX_HISTORY) {
            this.entries.length = CONFIG.EMERGENCY.MAX_HISTORY;
        }

        this.saveToStorage();
        this.updateDisplay();
        return entry;
    },

    /**
     * Save to localStorage
     */
    saveToStorage: function() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.entries));
        } catch (e) {
            console.error('Failed to save history:', e);
        }
    },

    /**
     * Clear all history
     */
    clear: function() {
        if (confirm('Delete all alert history?')) {
            this.entries = [];
            this.saveToStorage();
            this.updateDisplay();
        }
    },

    /**
     * Update the display
     */
    updateDisplay: function() {
        const list = document.getElementById('historyList');
        if (!list) return;

        if (this.entries.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <p>No alerts sent yet</p>
                </div>
            `;
            return;
        }

        list.innerHTML = this.entries.slice(0, 10).map(item => {
            const time = new Date(item.timestamp).toLocaleString();
            const location = item.location || '📍 No GPS';
            const isIncoming = item.type === 'INCOMING';
            const mapLink = item.lat && item.lng ?
                `<a href="https://www.google.com/maps?q=${item.lat},${item.lng}" target="_blank" style="color:#1D9E75;text-decoration:none;">🗺️</a>` :
                '';

            return `
                <div class="history-item">
                    <div class="history-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                    </div>
                    <div class="history-body">
                        <div class="h-type">${isIncoming ? 'Incoming Alert' : 'Emergency'}</div>
                        <div class="h-location">${location} ${mapLink}</div>
                    </div>
                    <span class="h-time">${time}</span>
                </div>
            `;
        }).join('');
    },

    /**
     * Get all entries
     */
    getAll: function() {
        return this.entries;
    },

    /**
     * Get entry count
     */
    count: function() {
        return this.entries.length;
    }
};

// Make globally available
window.History = History;

// Load history on startup
document.addEventListener('DOMContentLoaded', function() {
    History.load();
});