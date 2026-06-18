/* ========================================
   GPS MODULE
   ======================================== */

const GPS = {
    currentLocation: null,
    gpsEnabled: false,
    watchId: null,

    /**
     * Get current GPS location
     */
    getLocation: function() {
        const gpsDisplay = document.getElementById('gpsDisplay');
        if (!gpsDisplay) return;

        gpsDisplay.textContent = '📍 Getting GPS...';

        if (!navigator.geolocation) {
            gpsDisplay.textContent = '📍 GPS: Not supported';
            gpsDisplay.className = 'gps-error';
            return;
        }

        const options = {
            enableHighAccuracy: CONFIG.GPS.ENABLE_HIGH_ACCURACY,
            timeout: CONFIG.GPS.TIMEOUT,
            maximumAge: CONFIG.GPS.MAXIMUM_AGE
        };

        navigator.geolocation.getCurrentPosition(
            // Success
            function(position) {
                GPS.currentLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    altitude: position.coords.altitude,
                    heading: position.coords.heading,
                    speed: position.coords.speed,
                    timestamp: new Date().toISOString()
                };

                GPS.gpsEnabled = true;
                GPS.updateDisplay(gpsDisplay);

                // Update any listeners
                if (window.onGPSUpdate) {
                    window.onGPSUpdate(GPS.currentLocation);
                }
            },
            // Error
            function(error) {
                let msg = 'GPS error';
                switch(error.code) {
                    case 1: msg = 'GPS: Permission denied'; break;
                    case 2: msg = 'GPS: Unavailable'; break;
                    case 3: msg = 'GPS: Timeout'; break;
                }
                gpsDisplay.textContent = `📍 ${msg}`;
                gpsDisplay.className = 'gps-error';
                GPS.gpsEnabled = false;
            },
            options
        );
    },

    /**
     * Start watching location
     */
    startWatching: function() {
        if (!navigator.geolocation || this.watchId) return;

        this.watchId = navigator.geolocation.watchPosition(
            function(position) {
                GPS.currentLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: new Date().toISOString()
                };
                GPS.gpsEnabled = true;
                const gpsDisplay = document.getElementById('gpsDisplay');
                if (gpsDisplay) GPS.updateDisplay(gpsDisplay);
            },
            function() {
                GPS.gpsEnabled = false;
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 30000
            }
        );
    },

    /**
     * Update GPS display
     */
    updateDisplay: function(element) {
        if (!element || !GPS.currentLocation) return;

        const loc = GPS.currentLocation;
        element.textContent = `📍 ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`;
        element.className = 'gps-pill active';

        // Add accuracy badge if available
        if (loc.accuracy) {
            const accuracyText = loc.accuracy < 10 ? '🟢' :
                                 loc.accuracy < 50 ? '🟡' : '🟠';
            element.textContent += ` ${accuracyText} ${Math.round(loc.accuracy)}m`;
        }
    },

    /**
     * Get location as formatted string
     */
    getFormattedLocation: function() {
        if (!GPS.currentLocation) {
            return '📍 No GPS';
        }
        const loc = GPS.currentLocation;
        return `📍 ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`;
    },

    /**
     * Get Google Maps link
     */
    getMapsLink: function() {
        if (!GPS.currentLocation) return '#';
        const loc = GPS.currentLocation;
        return `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
    },

    /**
     * Check if GPS is available
     */
    isAvailable: function() {
        return GPS.gpsEnabled && GPS.currentLocation !== null;
    }
};

// Make globally available
window.GPS = GPS;

// Auto-get GPS on load
setTimeout(function() {
    GPS.getLocation();
    GPS.startWatching();
}, 1000);
