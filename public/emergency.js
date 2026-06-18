/* ========================================
   EMERGENCY MODULE - P2P Broadcasting
   ======================================== */

const Emergency = {
    isAlerting: false,
    alertCountdown: null,
    lastTriggerTime: 0,
    audioContext: null,

    /**
     * Initialize audio context (must be called after user interaction)
     */
    initAudio: function() {
        if (!this.audioContext) {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            } catch(e) {
                console.log('Audio not supported');
            }
        }
    },

    /**
     * Trigger emergency alert - broadcasts via P2P to ALL peers
     */
    trigger: function() {
        this.initAudio();

        const now = Date.now();
        if (now - this.lastTriggerTime < CONFIG.EMERGENCY.COOLDOWN) {
            return;
        }
        this.lastTriggerTime = now;

        if (this.isAlerting) return;
        this.isAlerting = true;

        const btn = document.getElementById('emergencyBtn');
        const alertMode = document.getElementById('alertMode');
        const statusText = document.getElementById('statusText');
        const statusDot = document.getElementById('statusDot');
        const btnZone = document.querySelector('.btn-zone');

        // Button feedback
        if (btn) {
            btn.classList.add('pressed');
            const btnIcon = btn.querySelector('.btn-icon');
            const btnText = btn.querySelector('.btn-label');
            const btnSub = btn.querySelector('.btn-hint');
            if (btnIcon) btnIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
            if (btnText) btnText.textContent = 'HELPING...';
            if (btnSub) btnSub.textContent = 'Alert sent!';
        }

        if (statusDot) statusDot.className = 'status-dot alerting';
        if (statusText) statusText.textContent = 'Alerting...';

        if (alertMode) {
            alertMode.hidden = false;
            alertMode.classList.add('show');
        }

        if (btnZone) btnZone.classList.add('alerting');

        // Get location
        const locationText = GPS.isAvailable() ? 
            GPS.getFormattedLocation() : 
            '📍 No GPS';

        const alertDetail = document.getElementById('alertDetail');
        if (alertDetail) {
            alertDetail.innerHTML = `
                ${locationText}<br>
                <small style="color:#888;">${new Date().toLocaleString()}</small>
            `;
        }

        // Prepare alert data
        const alertData = {
            id: Date.now().toString(36),
            timestamp: new Date().toISOString(),
            location: locationText,
            lat: GPS.currentLocation ? GPS.currentLocation.lat : null,
            lng: GPS.currentLocation ? GPS.currentLocation.lng : null,
            message: '🚨 EMERGENCY!'
        };

        // --- BROADCAST VIA SONIC (sound) ---
        // This works even without internet, Bluetooth, or WiFi!
        if (window.SonicAlert) {
            SonicAlert.transmit(alertData);
            console.log('📡 Alert broadcast via ULTRASONIC sound');
        }

        // Also try P2P as backup
        if (window.P2P) {
            const peerCount = P2P.broadcastAlert(alertData);
            console.log(`📡 Alert broadcast to ${peerCount} peers via P2P`);
        }

        // Also try Web Share API as backup
        if (navigator.share) {
            navigator.share({
                title: '🚨 Emergency Alert',
                text: `🚨 EMERGENCY!\n${locationText}\nTime: ${new Date().toLocaleString()}`,
                url: window.location.href
            }).catch(() => {});
        }

        // Copy to clipboard
        if (navigator.clipboard) {
            navigator.clipboard.writeText(
                `🚨 EMERGENCY!\n${locationText}\nTime: ${new Date().toLocaleString()}`
            ).catch(() => {});
        }

        // Save to local history
        History.save(locationText);

        // Play sound
        this.playAlertSound();

        // Vibrate
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 400]);
        }

        // Auto-cancel after delay
        if (this.alertCountdown) clearTimeout(this.alertCountdown);
        this.alertCountdown = setTimeout(() => {
            this.cancel();
        }, CONFIG.EMERGENCY.AUTO_CANCEL_DELAY);
    },

    /**
     * Cancel emergency alert
     */
    cancel: function() {
        if (!this.isAlerting) return;

        this.isAlerting = false;

        const btn = document.getElementById('emergencyBtn');
        const alertMode = document.getElementById('alertMode');
        const statusText = document.getElementById('statusText');
        const statusDot = document.getElementById('statusDot');
        const btnZone = document.querySelector('.btn-zone');

        if (btn) {
            btn.classList.remove('pressed');
            const btnIcon = btn.querySelector('.btn-icon');
            const btnText = btn.querySelector('.btn-label');
            const btnSub = btn.querySelector('.btn-hint');
            if (btnIcon) btnIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
            if (btnText) btnText.textContent = 'Emergency';
            if (btnSub) btnSub.textContent = 'Tap to alert';
        }

        if (statusDot) statusDot.className = 'status-dot ready';
        if (statusText) statusText.textContent = 'Ready';

        if (alertMode) {
            alertMode.classList.remove('show');
            setTimeout(() => { alertMode.hidden = true; }, 300);
        }

        if (btnZone) btnZone.classList.remove('alerting');

        if (this.alertCountdown) {
            clearTimeout(this.alertCountdown);
            this.alertCountdown = null;
        }
    },

    /**
     * Handle incoming P2P alert
     */
    handleIncomingAlert: function(alert) {
        console.log('🚨 INCOMING P2P ALERT:', alert);

        // Show incoming alert overlay
        const overlay = document.getElementById('incomingAlert');
        const locationEl = document.getElementById('incomingLocation');
        const timeEl = document.getElementById('incomingTime');
        const mapLink = document.getElementById('incomingMap');

        if (overlay) {
            locationEl.textContent = alert.location || '📍 Location unknown';
            timeEl.textContent = new Date(alert.timestamp).toLocaleString();

            if (alert.lat && alert.lng) {
                mapLink.href = `https://www.google.com/maps?q=${alert.lat},${alert.lng}`;
                mapLink.style.display = 'inline-block';
            } else {
                mapLink.style.display = 'none';
            }

            overlay.hidden = false;
            overlay.classList.add('show');
        }

        // Play alert sound
        this.playAlertSound();

        // Vibrate if supported
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 400]);
        }

        // Browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('🚨 EMERGENCY ALERT!', {
                body: `Someone needs help! ${alert.location}`,
                requireInteraction: true
            });
        }

        // Add to history
        History.addFromServer(alert);
    },

    /**
     * Dismiss incoming alert overlay
     */
    dismissIncoming: function() {
        const overlay = document.getElementById('incomingAlert');
        if (overlay) {
            overlay.classList.remove('show');
            setTimeout(() => { overlay.hidden = true; }, 300);
        }
    },

    /**
     * Play alert sound using Web Audio API
     */
    playAlertSound: function() {
        if (!CONFIG.NOTIFICATIONS.SOUND) return;

        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const ctx = this.audioContext;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'sawtooth';
            const now = ctx.currentTime;

            osc.frequency.setValueAtTime(600, now);
            osc.frequency.linearRampToValueAtTime(900, now + 0.3);
            osc.frequency.linearRampToValueAtTime(600, now + 0.6);
            osc.frequency.linearRampToValueAtTime(900, now + 0.9);
            osc.frequency.linearRampToValueAtTime(600, now + 1.2);

            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0, now + 1.5);

            osc.start(now);
            osc.stop(now + 1.5);

        } catch(e) {
            // Silent fail
        }
    },

    /**
     * Get alert status
     */
    isActive: function() {
        return this.isAlerting;
    }
};

// Make globally available
window.Emergency = Emergency;

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.key === ' ' || e.key === 'Enter') {
        const btn = document.getElementById('emergencyBtn');
        if (document.activeElement !== btn && !Emergency.isAlerting) {
            e.preventDefault();
            Emergency.trigger();
        }
    }

    if (e.key === 'Escape') {
        Emergency.cancel();
        Emergency.dismissIncoming();
    }
});
