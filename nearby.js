/* ========================================
   NEARBY MODULE
   ======================================== */

const Nearby = {
    devices: [],
    isScanning: false,
    scanInterval: null,

    /**
     * Notify nearby devices
     */
    notify: function(locationText) {
        const alertText = this.buildAlertMessage(locationText);

        // Try Web Share API
        if (navigator.share) {
            navigator.share({
                title: '🚨 Emergency Alert',
                text: alertText,
                url: window.location.href
            }).catch(function(err) {
                console.log('Share cancelled:', err);
            });
        }

        // Also copy to clipboard as backup
        if (navigator.clipboard) {
            navigator.clipboard.writeText(alertText).catch(() => {});
        }

        // Add current device
        this.addDevice('📱 This device (You)', 'online');
    },

    /**
     * Build alert message
     */
    buildAlertMessage: function(locationText) {
        return `🚨 EMERGENCY ALERT!\n\n` +
               `Someone needs help!\n` +
               `${locationText}\n` +
               `Time: ${new Date().toLocaleString()}\n\n` +
               `📲 Get help now!`;
    },

    /**
     * Scan for nearby devices (simulated)
     */
    scan: function() {
        if (this.isScanning) return;
        this.isScanning = true;

        // Simulate finding nearby devices
        const simulatedDevices = [
            { name: '📱 Phone A', status: 'online' },
            { name: '📱 Phone B', status: 'online' },
            { name: '📱 Phone C', status: 'online' }
        ];

        // Only add if we don't have many
        if (this.devices.length < 3) {
            simulatedDevices.forEach(d => {
                this.addDevice(d.name, d.status);
            });
        }

        this.isScanning = false;
        this.updateDisplay();
    },

    /**
     * Add a nearby device
     */
    addDevice: function(name, status) {
        // Check if already exists
        const exists = this.devices.find(d => d.name === name);
        if (!exists) {
            this.devices.push({ name, status, timestamp: Date.now() });
            this.updateDisplay();
        } else {
            // Update status
            exists.status = status;
            exists.timestamp = Date.now();
            this.updateDisplay();
        }
    },

    /**
     * Update the display
     */
    updateDisplay: function() {
        const list = document.getElementById('nearbyList');
        if (!list) return;

        if (this.devices.length === 0) {
            list.innerHTML = `
                <div class="device-row">
                    <span class="device-name">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                        Scanning for devices…
                    </span>
                    <span class="badge offline">Scanning</span>
                </div>
            `;
            return;
        }

        list.innerHTML = this.devices.slice(0, CONFIG.NEARBY.MAX_DEVICES).map(d => `
            <div class="device-row">
                <span class="device-name">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                    ${d.name}
                </span>
                <span class="badge ${d.status}">
                    ${d.status === 'online' ? 'Alerted' : 'Offline'}
                </span>
            </div>
        `).join('');
    },

    /**
     * Clear nearby devices
     */
    clear: function() {
        this.devices = [];
        this.updateDisplay();
    },

    /**
     * Start periodic scanning
     */
    startScanning: function() {
        if (this.scanInterval) return;
        this.scan();
        this.scanInterval = setInterval(() => {
            this.scan();
        }, CONFIG.NEARBY.SCAN_INTERVAL);
    },

    /**
     * Stop scanning
     */
    stopScanning: function() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
    }
};

// Make globally available
window.Nearby = Nearby;

// Start scanning after a delay
setTimeout(function() {
    Nearby.startScanning();
}, 2000);
