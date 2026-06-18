/* ========================================
   EMERGENCY MODULE
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
     * Trigger emergency alert
     */
    trigger: function() {
        // Initialize audio on first interaction
        this.initAudio();

        // Prevent spam
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

        // Update status
        if (statusDot) statusDot.className = 'status-dot alerting';
        if (statusText) statusText.textContent = 'Alerting...';

        // Show alert mode
        if (alertMode) {
            alertMode.hidden = false;
            alertMode.classList.add('show');
        }

        // Add alerting class to btn-zone for ring animation
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

        // --- SEND ALERTS ---

        // 1. Notify nearby devices
        Nearby.notify(locationText);

        // 2. Browser notification
        if (CONFIG.NOTIFICATIONS.ENABLED && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('🚨 EMERGENCY ALERT', {
                body: `Someone needs help! ${locationText}`,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚨</text></svg>',
                requireInteraction: true
            });
        }

        // 3. Save to history
        History.save(locationText);

        // 4. Update nearby list
        Nearby.scan();

        // 5. Auto-cancel after delay
        if (this.alertCountdown) clearTimeout(this.alertCountdown);
        this.alertCountdown = setTimeout(() => {
            this.cancel();
        }, CONFIG.EMERGENCY.AUTO_CANCEL_DELAY);

        // 6. Play alert sound
        this.playAlertSound();
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

        // Reset button
        if (btn) {
            btn.classList.remove('pressed');
            const btnIcon = btn.querySelector('.btn-icon');
            const btnText = btn.querySelector('.btn-label');
            const btnSub = btn.querySelector('.btn-hint');
            if (btnIcon) btnIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
            if (btnText) btnText.textContent = 'Emergency';
            if (btnSub) btnSub.textContent = 'Tap to alert';
        }

        // Reset status
        if (statusDot) statusDot.className = 'status-dot ready';
        if (statusText) statusText.textContent = 'Ready';

        // Hide alert mode
        if (alertMode) {
            alertMode.classList.remove('show');
            setTimeout(() => { alertMode.hidden = true; }, 300);
        }

        // Remove alerting class from btn-zone
        if (btnZone) btnZone.classList.remove('alerting');

        if (this.alertCountdown) {
            clearTimeout(this.alertCountdown);
            this.alertCountdown = null;
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

            // Create oscillator for siren sound
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            // Siren effect: sweep frequency
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
            // Fallback: try Audio element
            try {
                const audio = new Audio('data:audio/wav;base64,UklGRnoAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoAAACBhYqFhYWFiYyNjY2NjI2MhIeFh4aHhoWGhoWGh4WIh4iIiImJiYuLi4yLi4uKi4mIh4eIh4iIiImJiYqLi42OjoyMioiHhoSFhoaGhoWGhYaHhoeHh4eHh4eIiIeHh4aGh4aIiIiIiIeGhoYAAAA=');
                audio.play();
            } catch(e2) {
                // Silent fail
            }
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
    // Space or Enter to trigger
    if (e.key === ' ' || e.key === 'Enter') {
        const btn = document.getElementById('emergencyBtn');
        if (document.activeElement !== btn && !Emergency.isAlerting) {
            e.preventDefault();
            Emergency.trigger();
        }
    }

    // Escape to cancel
    if (e.key === 'Escape') {
        Emergency.cancel();
    }
});
