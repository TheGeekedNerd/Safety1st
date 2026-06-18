/* ========================================
   GPS MODULE - Location + Reverse Geocoding
   ======================================== */

const GPS = {
    currentLocation: null,
    formattedAddress: null,
    addressPromise: null,
    lastGeocodeCoords: null,
    geocodeAttempts: 0,
    isAvailable: function() {
        return !!this.currentLocation;
    },

    // Alias for index.html onclick="GPS.getLocation()"
    getLocation: function() {
        console.log('[GPS] getLocation() called (alias for getFormattedLocationAsync)');
        return this.getFormattedLocationAsync();
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

    getFormattedLocationAsync: async function() {
        console.log('[GPS] getFormattedLocationAsync called');
        console.log('[GPS] formattedAddress:', this.formattedAddress);
        console.log('[GPS] addressPromise:', this.addressPromise ? 'exists' : 'null');

        if (this.formattedAddress) {
            console.log('[GPS] Returning cached address:', this.formattedAddress);
            return this.formattedAddress;
        }
        if (this.addressPromise) {
            console.log('[GPS] Waiting for in-flight geocode...');
            await this.addressPromise;
            console.log('[GPS] Geocode finished, address:', this.formattedAddress);
            return this.formattedAddress || this.getFormattedLocation();
        }
        console.log('[GPS] No address or promise, returning:', this.getFormattedLocation());
        return this.getFormattedLocation();
    },

    getAddress: function() {
        return this.formattedAddress || null;
    },

    getCoords: function() {
        return this.currentLocation;
    },

    _updateGPSPill: function(address) {
        const gpsDisplay = document.getElementById('gpsDisplay');
        if (gpsDisplay) {
            const display = address.length > 28 ? address.substring(0, 26) + '…' : address;
            gpsDisplay.textContent = display;
        }
    },

    init: function() {
        console.log('[GPS] GPS.init() called');
        if (!('geolocation' in navigator)) {
            console.log('[GPS] Geolocation not supported');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                this.currentLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: position.timestamp
                };
                console.log('[GPS] Initial location:', this.currentLocation.lat.toFixed(6), this.currentLocation.lng.toFixed(6));
                this.reverseGeocode(this.currentLocation.lat, this.currentLocation.lng);
            },
            (err) => {
                console.error('[GPS] Initial position error:', err.code, err.message);
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            }
        );

        navigator.geolocation.watchPosition(
            (position) => {
                this.currentLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: position.timestamp
                };
                console.log('[GPS] Watch location:', this.currentLocation.lat.toFixed(6), this.currentLocation.lng.toFixed(6));
                this.reverseGeocode(this.currentLocation.lat, this.currentLocation.lng);
            },
            (err) => {
                console.error('[GPS] Watch error:', err.code, err.message);
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 30000
            }
        );
    },

    reverseGeocode: async function(lat, lng) {
        const coordKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        if (this.lastGeocodeCoords === coordKey) {
            console.log('[GPS] Already geocoded these coords, skipping');
            return;
        }
        this.lastGeocodeCoords = coordKey;

        console.log('[GPS] Starting geocode for:', lat, lng);
        const promise = this._doGeocode(lat, lng);
        this.addressPromise = promise;
        await promise;
        this.addressPromise = null;
    },

    _doGeocode: async function(lat, lng) {
        this.geocodeAttempts++;
        console.log('[GPS] Geocode attempt #' + this.geocodeAttempts);

        // Try Nominatim first
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
            console.log('[GPS] Fetching:', url);

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'SoundAlert-Emergency-App/1.0'
                }
            });

            console.log('[GPS] Nominatim response status:', response.status);

            if (!response.ok) {
                throw new Error('Nominatim failed: ' + response.status);
            }

            const data = await response.json();
            console.log('[GPS] Nominatim raw:', JSON.stringify(data).substring(0, 200));

            if (data.error) {
                throw new Error('Nominatim error: ' + data.error);
            }

            const address = this.formatAddress(data);
            this.formattedAddress = address;
            console.log('[GPS] SUCCESS - Address:', address);

            this._updateGPSPill(address);

            const alertDetail = document.getElementById('alertDetail');
            if (alertDetail && window.Emergency && Emergency.isAlerting) {
                console.log('[GPS] Updating alertDetail UI');
                alertDetail.innerHTML = `
                    ${address}<br>
                    <small style="color:#888;">${new Date().toLocaleString()}</small>
                `;
            }
            return;

        } catch (err) {
            console.error('[GPS] Nominatim failed:', err.message);
        }

        // Fallback: BigDataCloud
        try {
            console.log('[GPS] Trying BigDataCloud fallback...');
            const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
            const response = await fetch(url);
            console.log('[GPS] BigDataCloud response status:', response.status);

            if (!response.ok) {
                throw new Error('BigDataCloud failed: ' + response.status);
            }

            const data = await response.json();
            console.log('[GPS] BigDataCloud raw:', JSON.stringify(data).substring(0, 200));

            const address = this.formatBigDataCloud(data);
            this.formattedAddress = address;
            console.log('[GPS] SUCCESS (fallback) - Address:', address);

            this._updateGPSPill(address);

            const alertDetail = document.getElementById('alertDetail');
            if (alertDetail && window.Emergency && Emergency.isAlerting) {
                alertDetail.innerHTML = `
                    ${address}<br>
                    <small style="color:#888;">${new Date().toLocaleString()}</small>
                `;
            }
            return;

        } catch (err2) {
            console.error('[GPS] BigDataCloud also failed:', err2.message);
        }

        console.log('[GPS] All geocoding failed, keeping coords');
        this.formattedAddress = null;
    },

    formatAddress: function(data) {
        if (!data || !data.address) {
            return data?.display_name || 'Unknown location';
        }

        const addr = data.address;
        console.log('[GPS] Formatting address from:', JSON.stringify(addr));

        // Priority 1: named building or place
        const buildingName =
            addr.building ||
            addr['addr:housename'] ||
            addr.amenity ||
            addr.leisure ||
            addr.tourism ||
            addr.historic ||
            addr.shop ||
            addr.office ||
            addr.university ||
            addr.school ||
            addr.hospital ||
            addr.place;

        // Priority 2: street address components
        const houseNumber = addr.house_number || addr['addr:housenumber'];
        const road = addr.road || addr.pedestrian || addr.footway || addr.street || addr.highway;
        const suburb = addr.suburb || addr.neighbourhood || addr.district || addr.borough;
        const city = addr.city || addr.town || addr.village || addr.hamlet || addr.municipality;

        // If we have a building/place name, prefer it: "Building Name, Suburb, City"
        if (buildingName) {
            const parts = [buildingName];
            if (suburb) parts.push(suburb);
            if (city && city !== suburb) parts.push(city);
            return parts.join(', ');
        }

        // Fallback: street address
        const parts = [];
        if (houseNumber && road) {
            parts.push(`${houseNumber} ${road}`);
        } else if (road) {
            parts.push(road);
        }
        if (suburb && !parts.some(p => p.includes(suburb))) parts.push(suburb);
        if (city && !parts.some(p => p.includes(city))) parts.push(city);

        return parts.length > 0 ? parts.join(', ') : (data.display_name || 'Unknown location');
    },

    formatBigDataCloud: function(data) {
        const parts = [];
        if (data.locality) parts.push(data.locality);
        if (data.city) parts.push(data.city);
        if (data.principalSubdivision) parts.push(data.principalSubdivision);
        if (data.countryName) parts.push(data.countryName);

        if (parts.length === 0) {
            return data.localityInfo?.informative?.[0]?.description || 'Unknown location';
        }
        return parts.join(', ');
    }
};

window.GPS = GPS;

document.addEventListener('DOMContentLoaded', () => {
    console.log('[GPS] DOM ready, initializing GPS');
    GPS.init();
});