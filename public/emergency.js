/* ========================================
   EMERGENCY MODULE — v2 (Offline Resilient)

   Alert send hierarchy:
     Tier 1 — Full internet: /broadcast immediately
     Tier 2 — Offline/weak: queue in IndexedDB, retry on reconnect
     Tier 3 — Cell signal, no data: SMS via /api/alerts/sms
     Tier 4 — No signal, devices nearby: BLE mesh relay

   SAFETY NOTE: The device that SENDS an alert must never play the alarm
   sound or vibrate as a result of sending it. Someone triggering this
   while concealing their phone (e.g. held at gunpoint) cannot have the
   device give them away with sound/vibration. The sender gets a silent,
   visual-only confirmation instead (see showSentConfirmation). The alarm
   sound/vibration is reserved exclusively for devices RECEIVING someone
   else's alert (handleIncomingAlert), where audibility is the entire point.
   ======================================== */

const Emergency = {
    isAlerting: false,
    alertCountdown: null,
    lastTriggerTime: 0,
    audioContext: null,

    ALERT_TYPES: {
        GBV: {
            id: 'gbv',
            label: 'GBV & Femicide',
            shortLabel: 'GBV',
            color: '#E24B4A',
            message: 'GBV & FEMICIDE EMERGENCY!',
            description: 'Gender-based violence or femicide incident reported'
        },
        CRIME: {
            id: 'crime',
            label: 'Crime & Lawlessness',
            shortLabel: 'CRIME',
            color: '#F59E0B',
            message: 'CRIME & LAWLESSNESS EMERGENCY!',
            description: 'Crime or lawlessness incident reported'
        }
    },

    currentAlertType: null,

    initServiceWorkerListener: function() {
        if (!('serviceWorker' in navigator)) return;

        navigator.serviceWorker.addEventListener('message', (event) => {
            const msg = event.data;
            if (!msg) return;

            console.log('[Emergency] SW message received:', msg.type);

            if (msg.type === 'TRIGGER_EMERGENCY_ALARM') {
                console.log('[Emergency] Triggering alarm from push notification tap');
                this.handleIncomingAlert(msg.data);
            }

            // Service worker signals that a queued alert was flushed via Background Sync
            if (msg.type === 'QUEUE_FLUSHED') {
                console.log('[Emergency] SW flushed queued alerts:', msg.sent);
            }
        });

        console.log('[Emergency] Service worker message listener registered');
    },

    initAudio: function() {
        if (!this.audioContext) {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.log('[Emergency] Audio not supported');
            }
        }
    },

    trigger: async function(alertType) {
        this.initAudio();

        const now = Date.now();
        if (now - this.lastTriggerTime < CONFIG.EMERGENCY.COOLDOWN) {
            console.log('[Emergency] Cooldown active, ignoring trigger');
            return;
        }
        this.lastTriggerTime = now;

        if (this.isAlerting) {
            console.log('[Emergency] Already alerting');
            return;
        }
        this.isAlerting = true;

        const typeConfig = this.ALERT_TYPES[alertType] || this.ALERT_TYPES.GBV;
        this.currentAlertType = alertType;

        document.querySelectorAll('.alert-type-btn').forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.4';
        });

        const alertMode = document.getElementById('alertMode');
        const statusText = document.getElementById('statusText');
        const statusDot = document.getElementById('statusDot');
        const btnZone = document.querySelector('.alert-type-zone');

        if (statusDot) statusDot.className = 'status-dot alerting';
        if (statusText) statusText.textContent = typeConfig.shortLabel + ' Alerting...';

        if (alertMode) {
            alertMode.hidden = false;
            alertMode.classList.add('show');
        }

        if (btnZone) btnZone.classList.add('alerting');

        console.log('[Emergency] Getting location...');
        let locationText = 'No GPS';
        try {
            const locationPromise = GPS.getFormattedLocationAsync();
            const timeoutPromise = new Promise(resolve =>
                setTimeout(() => resolve(GPS.getFormattedLocation()), 3000)
            );
            locationText = await Promise.race([locationPromise, timeoutPromise]);
        } catch (err) {
            locationText = GPS.getFormattedLocation();
        }
        console.log('[Emergency] Location:', locationText);

        const alertTime = new Date();
        const timeString = alertTime.toLocaleString();
        const timeISO = alertTime.toISOString();

        // Attach battery level if available
        let batteryPct = null;
        try {
            if (navigator.getBattery) {
                const bat = await navigator.getBattery();
                batteryPct = Math.round(bat.level * 100);
            }
        } catch (_) { /* optional */ }

        const alertData = {
            id              : Date.now().toString(36),
            deviceId        : (window.CONFIG && CONFIG.DEVICE_ID) || null,
            alertType       : alertType,
            alertTypeLabel  : typeConfig.label,
            alertTypeShort  : typeConfig.shortLabel,
            alertTypeColor  : typeConfig.color,
            timestamp       : timeISO,
            timeFormatted   : timeString,
            location        : locationText,
            lat             : GPS.currentLocation ? GPS.currentLocation.lat  : null,
            lng             : GPS.currentLocation ? GPS.currentLocation.lng  : null,
            message         : typeConfig.message,
            description     : typeConfig.description,
            battery         : batteryPct,
            hopCount        : 0,
        };

        const alertDetail = document.getElementById('alertDetail');
        if (alertDetail) {
            alertDetail.innerHTML = `
                <div style="display:inline-block;padding:3px 8px;border-radius:5px;background:${typeConfig.color}22;color:${typeConfig.color};font-size:11px;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">${typeConfig.label}</div>
                <div style="font-weight:600;margin-bottom:2px;">${locationText}</div>
                <div style="font-size:12px;color:#888;">${timeString}</div>
            `;
        }

        console.log('[Emergency] Dispatching alert. Type:', alertType, '| Location:', locationText);

        // Existing channels (unchanged)
        if (window.SonicAlert) SonicAlert.transmit(alertData);

        if (window.P2P) {
            const peerCount = P2P.broadcastAlert(alertData);
            console.log(`[Emergency] P2P sent to ${peerCount} peers`);
        }

        if (navigator.share) {
            navigator.share({
                title: typeConfig.message,
                text: `${typeConfig.message}\nType: ${typeConfig.label}\nLocation: ${locationText}\nTime: ${timeString}`,
                url: window.location.href
            }).catch(() => {});
        }

        if (navigator.clipboard) {
            navigator.clipboard.writeText(
                `${typeConfig.message}\nType: ${typeConfig.label}\nLocation: ${locationText}\nTime: ${timeString}`
            ).catch(() => {});
        }

        History.save(locationText, alertType, typeConfig.label);

        // ── Tiered send ───────────────────────────────────────────────────────
        await this.sendWithFallback(alertData);
        // ─────────────────────────────────────────────────────────────────────

        // SAFETY: do NOT play the alarm sound or vibrate here. This is the
        // sender's own device — sounding off here is what we're fixing.
        // The sender gets a quiet, visual-only confirmation instead.
        this.showSentConfirmation(typeConfig);

        if (this.alertCountdown) clearTimeout(this.alertCountdown);
        this.alertCountdown = setTimeout(() => {
            this.cancel();
        }, CONFIG.EMERGENCY.AUTO_CANCEL_DELAY);
    },

    // ── Tier 1 + 2 + 3 + 4 ───────────────────────────────────────────────────

    sendWithFallback: async function(alertData) {
        // Tier 1 — full internet
        if (navigator.onLine) {
            const sent = await this.sendPushNotification(alertData);
            if (sent) {
                console.log('[Emergency] Tier 1: sent via internet');
                if (window.StatusIndicator) StatusIndicator.init(); // refresh badge
                return;
            }
        }

        // Tier 2 — offline: queue in IndexedDB (will flush on reconnect / BG sync)
        if (window.Queue) {
            console.log('[Emergency] Tier 2: internet unavailable — queuing alert');
            await Queue.enqueue(alertData);
            // Ask SW to register a Background Sync so it retries even when page is closed
            this.registerBackgroundSync();
        }

        // Tier 3 — try SMS if we have cell signal (no data needed server-side)
        const smsOk = await this.sendViaSms(alertData);
        if (smsOk) {
            console.log('[Emergency] Tier 3: sent via SMS fallback');
            return;
        }

        // Tier 4 — BLE mesh relay (queue for native layer; also triggers scan if available)
        console.log('[Emergency] Tier 4: no internet or SMS — signalling mesh');
        if (window.Mesh) Mesh.noteSend(alertData);
    },

    // ── Tier 1 helper ─────────────────────────────────────────────────────────

    sendPushNotification: async function(alertData) {
        try {
            // alertData.deviceId travels with the payload so the server can
            // exclude this device from the push fan-out (see server.js /broadcast).
            const response = await fetch('/broadcast', {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify(alertData),
            });

            if (!response.ok) throw new Error(`Server returned ${response.status}`);

            const result = await response.json();
            console.log(`[Emergency] Push broadcast sent to ${result.sent} devices` +
                (typeof result.excluded === 'number' ? ` (excluded ${result.excluded} sender device(s))` : ''));
            return true;
        } catch (err) {
            console.warn('[Emergency] Push broadcast failed:', err.message);
            return false;
        }
    },

    // ── Tier 3 helper ─────────────────────────────────────────────────────────

    sendViaSms: async function(alertData) {
        // SMS only makes sense if we have cell signal (navigator.onLine can be
        // false even when SMS works, since data and voice are independent).
        // We attempt it optimistically and treat an error as "unavailable".
        try {
            const res = await fetch('/api/alerts/sms', {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify({ ...alertData, tier: 'sms' }),
            });
            if (!res.ok) return false;
            const data = await res.json();
            if (data.sent > 0 && window.StatusIndicator) StatusIndicator.setTierSms();
            return data.sent > 0;
        } catch (_) {
            return false;
        }
    },

    // ── Background Sync registration ──────────────────────────────────────────

    registerBackgroundSync: function() {
        if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;
        navigator.serviceWorker.ready
            .then(reg => reg.sync.register('flush-alert-queue'))
            .then(() => console.log('[Emergency] Background Sync registered'))
            .catch(err => console.warn('[Emergency] Background Sync registration failed:', err.message));
    },

    // ── Cancel ────────────────────────────────────────────────────────────────

    cancel: function() {
        if (!this.isAlerting) return;

        this.isAlerting = false;
        this.currentAlertType = null;

        document.querySelectorAll('.alert-type-btn').forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
        });

        const alertMode = document.getElementById('alertMode');
        const statusText = document.getElementById('statusText');
        const statusDot = document.getElementById('statusDot');
        const btnZone = document.querySelector('.alert-type-zone');

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

        this.hideSentConfirmation();
    },

    // ── Sent confirmation (sender-side, silent) ──────────────────────────────
    // Visual-only acknowledgement that the alert went out. No sound, no
    // vibration — this is what replaced playAlertSound() in trigger().

    showSentConfirmation: function(typeConfig) {
        let badge = document.getElementById('sentConfirmation');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'sentConfirmation';
            badge.style.cssText = `
                position: fixed;
                top: 14px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 99999;
                padding: 6px 14px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
                letter-spacing: 0.3px;
                background: rgba(20,20,20,0.85);
                color: #fff;
                display: flex;
                align-items: center;
                gap: 6px;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.25s ease;
            `;
            document.body.appendChild(badge);
        }

        const color = (typeConfig && typeConfig.color) || '#2ecc71';
        badge.innerHTML = `<span style="color:${color};">●</span> Alert sent`;
        badge.style.opacity = '1';
    },

    hideSentConfirmation: function() {
        const badge = document.getElementById('sentConfirmation');
        if (badge) badge.style.opacity = '0';
    },

    // ── Incoming (from push / P2P) ────────────────────────────────────────────
    // This fires on devices RECEIVING someone else's alert. Sound and
    // vibration here are intentional and unchanged — audibility on the
    // receiving end is the entire point of the app.

    handleIncomingAlert: function(alert) {
        if (!alert) return;
        console.log('[Emergency] INCOMING ALERT:', alert);

        const typeConfig = this.ALERT_TYPES[alert.alertType] || {
            label     : alert.alertTypeLabel || 'EMERGENCY',
            color     : alert.alertTypeColor || '#E24B4A',
            shortLabel: alert.alertTypeShort || 'ALERT',
            message   : alert.message || 'EMERGENCY ALERT!'
        };

        const overlay    = document.getElementById('incomingAlert');
        const locationEl = document.getElementById('incomingLocation');
        const timeEl     = document.getElementById('incomingTime');
        const mapLink    = document.getElementById('incomingMap');

        if (overlay) {
            let typeBadge = document.getElementById('incomingTypeBadge');
            if (!typeBadge) {
                typeBadge = document.createElement('div');
                typeBadge.id = 'incomingTypeBadge';
                if (locationEl && locationEl.parentNode) {
                    locationEl.parentNode.insertBefore(typeBadge, locationEl);
                }
            }
            typeBadge.innerHTML = `
                <div style="display:inline-block;padding:3px 10px;border-radius:5px;background:${typeConfig.color}22;color:${typeConfig.color};font-size:11px;font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">
                    ${typeConfig.label}
                </div>
            `;

            if (locationEl) locationEl.textContent = alert.location || 'Location unknown';
            if (timeEl)     timeEl.textContent     = alert.timeFormatted || new Date(alert.timestamp).toLocaleString();

            if (mapLink) {
                if (alert.lat && alert.lng) {
                    mapLink.href = `https://www.google.com/maps?q=${alert.lat},${alert.lng}`;
                    mapLink.style.display = 'inline-block';
                } else {
                    mapLink.style.display = 'none';
                }
            }

            overlay.hidden = false;
            overlay.classList.add('show');
        }

        this.playAlertSound();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);

        if ('Notification' in window && Notification.permission === 'granted') {
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type : 'SHOW_NOTIFICATION',
                    title: typeConfig.message,
                    body : `[${typeConfig.shortLabel}] Someone needs help! ${alert.location || ''}`,
                    data : alert
                });
            } else {
                try {
                    new Notification(typeConfig.message, {
                        body: `[${typeConfig.shortLabel}] Someone needs help! ${alert.location || ''}`,
                        requireInteraction: true
                    });
                } catch (e) {
                    console.warn('[Emergency] Notification failed:', e);
                }
            }
        }

        if (window.History) History.addFromServer(alert);
    },

    dismissIncoming: function() {
        const overlay = document.getElementById('incomingAlert');
        if (overlay) {
            overlay.classList.remove('show');
            setTimeout(() => { overlay.hidden = true; }, 300);
        }
    },

    // ── Sound (receiving devices only — see note above) ──────────────────────

    playAlertSound: function() {
        if (!CONFIG.NOTIFICATIONS.SOUND) return;

        try {
            const audio = new Audio('emergency_alarm.mp3');
            audio.volume = 1.0;
            let playCount = 0;
            const maxPlays = 3;
            audio.onended = () => {
                playCount++;
                if (playCount < maxPlays) {
                    audio.currentTime = 0;
                    audio.play().catch(() => {});
                }
            };
            audio.play().catch(() => this.playFallbackSound());
        } catch (e) {
            this.playFallbackSound();
        }
    },

    playFallbackSound: function() {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioContext.state === 'suspended') this.audioContext.resume();

            const ctx        = this.audioContext;
            const now        = ctx.currentTime;
            const masterGain = ctx.createGain();
            masterGain.gain.setValueAtTime(0, now);
            masterGain.gain.linearRampToValueAtTime(1.0, now + 0.05);
            masterGain.connect(ctx.destination);

            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(-24, now);
            compressor.knee.setValueAtTime(0, now);
            compressor.ratio.setValueAtTime(20, now);
            compressor.attack.setValueAtTime(0.003, now);
            compressor.release.setValueAtTime(0.1, now);
            compressor.connect(masterGain);

            const osc1  = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sawtooth';
            osc1.connect(gain1);
            gain1.connect(compressor);

            for (let i = 0; i < 5; i++) {
                const t = now + (i * 0.6);
                osc1.frequency.setValueAtTime(800, t);
                osc1.frequency.linearRampToValueAtTime(1200, t + 0.3);
                osc1.frequency.linearRampToValueAtTime(800, t + 0.6);
            }

            gain1.gain.setValueAtTime(0.5, now);
            gain1.gain.setValueAtTime(0.5, now + 3.0);
            gain1.gain.linearRampToValueAtTime(0, now + 3.5);

            osc1.start(now);
            osc1.stop(now + 3.5);

            masterGain.gain.setValueAtTime(1.0, now + 3.0);
            masterGain.gain.linearRampToValueAtTime(0, now + 3.5);
        } catch (e) {
            console.error('[Emergency] Fallback sound failed:', e);
        }
    },

    testSound: function() {
        this.initAudio();
        this.playAlertSound();
    },

    isActive: function() { return this.isAlerting; }
};

window.Emergency = Emergency;

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        Emergency.cancel();
        Emergency.dismissIncoming();
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Emergency.initServiceWorkerListener());
} else {
    Emergency.initServiceWorkerListener();
}