/* ========================================
   GPS MODULE - Location + Reverse Geocoding
   ======================================== */

const GPS = {
    currentLocation: null,
    formattedAddress: null,
    addressPromise: null,
    lastGeocodeCoords: null,
    geocodeAttempts: 0,

    watchId: null,
    permissionState: 'unknown', // 'unknown' | 'granted' | 'denied' | 'prompt'

    // Tuning constants
    STALE_AFTER_MS: 20000,      // a fix older than this is "stale" — accept a worse-accuracy replacement
    MIN_MOVE_METERS: 15,        // ignore new fixes that haven't moved further than this (kills GPS jitter)
    ACCURACY_WORSE_TOLERANCE_M: 10, // allow slightly worse accuracy without rejecting, to avoid flapping

    isAvailable: function() {
        return !!this.currentLocation;
    },

    // ── Button handler — index.html onclick="GPS.getLocation()" ─────────────
    // This now actually DOES something when tapped: forces a fresh, high
    // accuracy read, and surfaces permission problems clearly instead of
    // doing nothing. (Previously this only read cached state and never
    // touched navigator.geolocation at all.)
    getLocation: function() {
        console.log('[GPS] getLocation() called — forcing fresh read');

        if (!('geolocation' in navigator)) {
            this._setPill('GPS not supported');
            return Promise.resolve(this.getFormattedLocation());
        }

        if (this.permissionState === 'denied') {
            this._setPill('GPS blocked — tap to fix');
            this._explainBlockedPermission();
            return Promise.resolve(this.getFormattedLocation());
        }

        this._setPill('Locating…');

        return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this._handleFix(position, { force: true });
                    resolve(this.getFormattedLocationAsync());
                },
                (err) => {
                    this._handleError(err);
                    resolve(this.getFormattedLocation());
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        });
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
        if (this.formattedAddress) {
            return this.formattedAddress;
        }
        if (this.addressPromise) {
            await this.addressPromise;
            return this.formattedAddress || this.getFormattedLocation();
        }
        return this.getFormattedLocation();
    },

    getAddress: function() {
        return this.formattedAddress || null;
    },

    getCoords: function() {
        return this.currentLocation;
    },

    _setPill: function(text) {
        const gpsDisplay = document.getElementById('gpsDisplay');
        if (gpsDisplay) gpsDisplay.textContent = text;
    },

    _updateGPSPill: function(address) {
        const display = address.length > 28 ? address.substring(0, 26) + '…' : address;
        this._setPill(display);
    },

    _explainBlockedPermission: function() {
        // JS cannot re-trigger the native permission prompt once a site has
        // been denied — the only way back is the user re-enabling it in
        // their browser's site settings. Tell them that plainly.
        if (document.getElementById('gpsBlockedNotice')) return;

        const notice = document.createElement('div');
        notice.id = 'gpsBlockedNotice';
        notice.style.cssText = `
            position: fixed; bottom: 16px; left: 16px; right: 16px;
            background: #2a2a2a; color: #fff; padding: 12px 14px;
            border-radius: 10px; font-size: 13px; line-height: 1.4;
            z-index: 99999; box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        `;
        notice.innerHTML = `
            <strong>Location is blocked for this app.</strong><br>
            Open your browser's site settings for this page and set
            Location to "Allow", then reload.
            <button id="gpsBlockedDismiss" style="margin-top:8px;display:block;background:transparent;border:1px solid #666;color:#ccc;border-radius:6px;padding:4px 10px;cursor:pointer;">Got it</button>
        `;
        document.body.appendChild(notice);
        document.getElementById('gpsBlockedDismiss').onclick = () => notice.remove();
    },

    // ── Distance helper (Haversine, meters) ──────────────────────────────────
    _distanceMeters: function(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const toRad = d => d * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(a));
    },

    // ── Core fix-acceptance logic ─────────────────────────────────────────────
    // Decides whether a new geolocation reading should replace the current
    // one. Filters out GPS jitter so the displayed location stops flickering
    // between nearby points, while still tracking genuine movement.
    _handleFix: function(position, opts = {}) {
        const next = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
        };

        const prev = this.currentLocation;

        if (!prev || opts.force) {
            this._acceptFix(next, opts.force ? 'forced refresh' : 'first fix');
            return;
        }

        const age = Date.now() - prev.timestamp;
        const moved = this._distanceMeters(prev.lat, prev.lng, next.lat, next.lng);
        const accuracyDelta = next.accuracy - prev.accuracy; // positive = worse

        // Reject readings that are both basically in the same spot AND
        // meaningfully less accurate than what we already have — classic
        // GPS jitter, not real movement.
        if (moved < this.MIN_MOVE_METERS && accuracyDelta > this.ACCURACY_WORSE_TOLERANCE_M && age < this.STALE_AFTER_MS) {
            console.log(`[GPS] Rejected fix — jitter (moved ${moved.toFixed(1)}m, accuracy ${prev.accuracy.toFixed(0)}m → ${next.accuracy.toFixed(0)}m)`);
            return;
        }

        // Accept if: real movement happened, OR accuracy improved/held, OR
        // our previous fix has gone stale and we need something newer.
        if (moved >= this.MIN_MOVE_METERS || accuracyDelta <= 0 || age >= this.STALE_AFTER_MS) {
            this._acceptFix(next, `moved ${moved.toFixed(1)}m, accuracy ${next.accuracy.toFixed(0)}m`);
        }
    },

    _acceptFix: function(next, reason) {
        this.currentLocation = next;
        console.log(`[GPS] Fix accepted (${reason}):`, next.lat.toFixed(6), next.lng.toFixed(6), `±${Math.round(next.accuracy)}m`);
        this.reverseGeocode(next.lat, next.lng);
    },

    _handleError: function(err) {
        console.error('[GPS] Position error:', err.code, err.message);
        if (err.code === err.PERMISSION_DENIED) {
            this.permissionState = 'denied';
            this._setPill('GPS blocked — tap to fix');
            this._explainBlockedPermission();
        } else if (err.code === err.TIMEOUT) {
            this._setPill('GPS timeout — retrying');
        } else {
            this._setPill('GPS unavailable');
        }
    },

    // ── Init ──────────────────────────────────────────────────────────────────
    init: async function() {
        console.log('[GPS] GPS.init() called');
        if (!('geolocation' in navigator)) {
            console.log('[GPS] Geolocation not supported');
            this._setPill('GPS not supported');
            return;
        }

        // Check current permission state up front (where supported) so we
        // can show an honest pill instead of silently doing nothing.
        if (navigator.permissions && navigator.permissions.query) {
            try {
                const status = await navigator.permissions.query({ name: 'geolocation' });
                this.permissionState = status.state; // 'granted' | 'denied' | 'prompt'
                console.log('[GPS] Permission state:', status.state);

                status.onchange = () => {
                    console.log('[GPS] Permission changed to:', status.state);
                    this.permissionState = status.state;
                    if (status.state === 'granted') this._startWatch();
                };

                if (status.state === 'denied') {
                    this._setPill('GPS blocked — tap to fix');
                    return; // don't bother starting watch; it'll just error
                }
            } catch (e) {
                console.log('[GPS] Permissions API query failed, proceeding anyway:', e.message);
            }
        }

        this._startWatch();
    },

    // Single source of truth for live tracking — no duplicate
    // getCurrentPosition() race against watchPosition() like before.
    _startWatch: function() {
        if (this.watchId !== null) return; // already watching

        this._setPill('Locating…');

        this.watchId = navigator.geolocation.watchPosition(
            (position) => {
                this.permissionState = 'granted';
                this._handleFix(position);
            },
            (err) => this._handleError(err),
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 10000
            }
        );
    },

    reverseGeocode: async function(lat, lng) {
        // Tied to the same movement threshold as fix acceptance, so jitter
        // that's filtered out up there doesn't sneak back in here and
        // trigger pointless re-geocoding / flickering addresses.
        if (this.lastGeocodeCoords) {
            const moved = this._distanceMeters(
                this.lastGeocodeCoords.lat, this.lastGeocodeCoords.lng, lat, lng
            );
            if (moved < this.MIN_MOVE_METERS) {
                console.log(`[GPS] Skipping geocode — only moved ${moved.toFixed(1)}m`);
                return;
            }
        }
        this.lastGeocodeCoords = { lat, lng };

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
            const response = await fetch(url, {
                headers: { 'User-Agent': 'SoundAlert-Emergency-App/1.0' }
            });

            if (!response.ok) throw new Error('Nominatim failed: ' + response.status);

            const data = await response.json();
            if (data.error) throw new Error('Nominatim error: ' + data.error);

            const address = this.formatAddress(data);
            this.formattedAddress = address;
            console.log('[GPS] SUCCESS - Address:', address);

            this._updateGPSPill(address);

            const alertDetail = document.getElementById('alertDetail');
            if (alertDetail && window.Emergency && Emergency.isAlerting) {
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
            if (!response.ok) throw new Error('BigDataCloud failed: ' + response.status);

            const data = await response.json();
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
        if (this.currentLocation) {
            this._setPill(`${this.currentLocation.lat.toFixed(4)}, ${this.currentLocation.lng.toFixed(4)}`);
        }
    },

    formatAddress: function(data) {
        if (!data || !data.address) {
            return data?.display_name || 'Unknown location';
        }

        const addr = data.address;

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

        const houseNumber = addr.house_number || addr['addr:housenumber'];
        const road = addr.road || addr.pedestrian || addr.footway || addr.street || addr.highway;
        const suburb = addr.suburb || addr.neighbourhood || addr.district || addr.borough;
        const city = addr.city || addr.town || addr.village || addr.hamlet || addr.municipality;

        if (buildingName) {
            const parts = [buildingName];
            if (suburb) parts.push(suburb);
            if (city && city !== suburb) parts.push(city);
            return parts.join(', ');
        }

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