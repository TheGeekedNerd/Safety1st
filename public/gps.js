/* ========================================
   GPS MODULE - Location + Reverse Geocoding
   ======================================== */

const GPS = {
    currentLocation: null,
    formattedAddress: null,
    addressPromise: null,
    lastGeocodeCoords: null,
    isAvailable: function() {
        return !!this.currentLocation;
    },

    getFormattedLocation: function() {
        // Return address if we have it, otherwise coords
        if (this.formattedAddress) {
            return this.formattedAddress;
        }
        if (this.currentLocation) {
            return `${this.currentLocation.lat.toFixed(4)}, ${this.currentLocation.lng.toFixed(4)}`;
        }
        return 'No GPS';
    },

    // Async version - waits for geocode to finish
    getFormattedLocationAsync: async function() {
        // If we already have an address, return it
        if (this.formattedAddress) {
            return this.formattedAddress;
        }
        // If a geocode is in progress, wait for it
        if (this.addressPromise) {
            await this.addressPromise;
            return this.formattedAddress || this.getFormattedLocation();
        }
        // Otherwise return whatever we have now
        return this.getFormattedLocation();
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

        // Get initial position
        navigator.geolocation.getCurrentPosition(
            (position) => {
                this.currentLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: position.timestamp
                };
                console.log('[GPS] Initial location:', this.currentLocation.lat.toFixed(4), this.currentLocation.lng.toFixed(4));
                this.reverseGeocode(this.currentLocation.lat, this.currentLocation.lng);
            },
            (err) => {
                console.error('[GPS] Initial position error:', err.message);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );

        // Watch position continuously
        navigator.geolocation.watchPosition(
            (position) => {
                this.currentLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: position.timestamp
                };
                console.log('[GPS] Location updated:', this.currentLocation.lat.toFixed(4), this.currentLocation.lng.toFixed(4));
                this.reverseGeocode(this.currentLocation.lat, this.currentLocation.lng);
            },
            (err) => {
                console.error('[GPS] Watch error:', err.message);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 30000
            }
        );
    },

    reverseGeocode: async function(lat, lng) {
        // Don't re-geocode if we already did for these exact coords
        const coordKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        if (this.lastGeocodeCoords === coordKey) {
            return;
        }
        this.lastGeocodeCoords = coordKey;

        const promise = this._doGeocode(lat, lng);
        this.addressPromise = promise;
        await promise;
        this.addressPromise = null;
    },

    _doGeocode: async function(lat, lng) {
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;

            console.log('[GPS] Geocoding...');
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'SoundAlert-Emergency-App/1.0'
                }
            });

            if (!response.ok) {
                throw new Error('Geocoding failed: ' + response.status);
            }

            const data = await response.json();
            console.log('[GPS] Geocode result:', data.display_name?.substring(0, 60) + '...');

            const address = this.formatAddress(data);
            this.formattedAddress = address;
            console.log('[GPS] Address:', address);

            // Update UI if currently alerting
            const alertDetail = document.getElementById('alertDetail');
            if (alertDetail && Emergency.isAlerting) {
                alertDetail.innerHTML = `
                    ${address}<br>
                    <small style="color:#888;">${new Date().toLocaleString()}</small>
                `;
            }

        } catch (err) {
            console.error('[GPS] Geocoding failed:', err);
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

        let parts = [];

        if (building) {
            parts.push(building);
        }

        if (houseNumber && road) {
            parts.push(`${houseNumber} ${road}`);
        } else if (road) {
            parts.push(road);
        }

        if (suburb && !parts.some(p => p.includes(suburb))) {
            parts.push(suburb);
        }

        if (city && !parts.some(p => p.includes(city))) {
            parts.push(city);
        }

        if (parts.length === 0) {
            return data.display_name || 'Unknown location';
        }

        return parts.join(', ');
    }
};

window.GPS = GPS;

document.addEventListener('DOMContentLoaded', () => {
    GPS.init();
});
