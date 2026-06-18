/* ========================================
   GPS MODULE - Location + Reverse Geocoding
   ======================================== */

const GPS = {
    currentLocation: null,
    formattedAddress: null,
    isAvailable: function() {
        return !!this.currentLocation;
    },

    getFormattedLocation: function() {
        if (this.formattedAddress) {
            return this.formattedAddress;
        }
        if (this.currentLocation) {
            return `${this.currentLocation.lat.toFixed(4)}, ${this.currentLocation.lng.toFixed(4)}`;
        }
        return 'No GPS';
    },

    getAddress: function() {
        return this.formattedAddress || null;
    },

    getCoords: function() {
        return this.currentLocation;
    },

    init: function() {
        if (!('geolocation' in navigator)) {
            console.log('[GPS] Geolocation not supported');
            return;
        }

        // Watch position continuously
        navigator.geolocation.watchPosition(
            (position) => {
                this.currentLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: position.timestamp
                };
                console.log('[GPS] Location updated:', this.currentLocation.lat, this.currentLocation.lng);

                // Reverse geocode to get address/building name
                this.reverseGeocode(this.currentLocation.lat, this.currentLocation.lng);
            },
            (err) => {
                console.error('[GPS] Error:', err.message);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 30000
            }
        );
    },

    reverseGeocode: async function(lat, lng) {
        try {
            // Use OpenStreetMap Nominatim (free, no API key needed)
            // Format: lat, lng
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;

            console.log('[GPS] Reverse geocoding...');
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'SoundAlert-Emergency-App/1.0'
                }
            });

            if (!response.ok) {
                throw new Error('Geocoding failed: ' + response.status);
            }

            const data = await response.json();
            console.log('[GPS] Geocode result:', data);

            // Extract the best name/address
            const address = this.formatAddress(data);
            this.formattedAddress = address;
            console.log('[GPS] Formatted address:', address);

            // Update UI if alert detail exists
            const alertDetail = document.getElementById('alertDetail');
            if (alertDetail && Emergency.isAlerting) {
                alertDetail.innerHTML = `
                    ${address}<br>
                    <small style="color:#888;">${new Date().toLocaleString()}</small>
                `;
            }

        } catch (err) {
            console.error('[GPS] Reverse geocoding failed:', err);
            // Fallback to coordinates
            this.formattedAddress = null;
        }
    },

    formatAddress: function(data) {
        if (!data || !data.address) {
            return data?.display_name || 'Unknown location';
        }

        const addr = data.address;

        // Priority: building name > POI > house number + road > road + suburb
        const building = addr.building || addr['addr:housename'] || addr.historic || addr.tourism || addr.amenity;
        const houseNumber = addr.house_number || addr['addr:housenumber'];
        const road = addr.road || addr.pedestrian || addr.footway || addr.street || addr.highway;
        const suburb = addr.suburb || addr.neighbourhood || addr.district || addr.borough;
        const city = addr.city || addr.town || addr.village || addr.hamlet || addr.municipality;
        const state = addr.state || addr.province;
        const country = addr.country;

        let parts = [];

        // Building name is best
        if (building) {
            parts.push(building);
        }

        // Street address
        if (houseNumber && road) {
            parts.push(`${houseNumber} ${road}`);
        } else if (road) {
            parts.push(road);
        }

        // Area
        if (suburb && !parts.some(p => p.includes(suburb))) {
            parts.push(suburb);
        }

        // City
        if (city && !parts.some(p => p.includes(city))) {
            parts.push(city);
        }

        // If we have nothing useful, use display_name (full address)
        if (parts.length === 0) {
            return data.display_name || 'Unknown location';
        }

        return parts.join(', ');
    }
};

window.GPS = GPS;

// Auto-init when DOM ready
document.addEventListener('DOMContentLoaded', () => {
    GPS.init();
});
