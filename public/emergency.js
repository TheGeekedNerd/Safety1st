const Emergency = {
  isAlerting: false,
  alertCountdown: null,
  lastTriggerTime: 0,
  audioContext: null,

  // Alert types
  ALERT_TYPES: {
    GBV: {
      id: 'gbv',
      label: 'GBV & Femicide',
      shortLabel: 'GBV',
      color: '#E24B4A', // red
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      message: 'GBV & FEMICIDE EMERGENCY!',
      description: 'Gender-based violence or femicide incident reported'
    },
    CRIME: {
      id: 'crime',
      label: 'Crime & Lawlessness',
      shortLabel: 'CRIME',
      color: '#F59E0B', // amber/orange
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      message: 'CRIME & LAWLESSNESS EMERGENCY!',
      description: 'Crime or lawlessness incident reported'
    }
  },

  currentAlertType: null,

  initAudio: function() {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } catch(e) {
        console.log('Audio not supported');
      }
    }
  },

  // Show the alert type selection modal
  showAlertTypeModal: function() {
    console.log('[Emergency] Showing alert type modal');

    let modal = document.getElementById('alertTypeModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'alertTypeModal';
      modal.innerHTML = `
        <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);">
          <div style="background:#1a1a2e;border-radius:20px;padding:28px;width:100%;max-width:360px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
            <h2 style="color:white;margin:0 0 8px;font-size:20px;">Select Emergency Type</h2>
            <p style="color:#888;margin:0 0 24px;font-size:14px;">What kind of emergency are you reporting?</p>

            <button id="btnGbv" style="width:100%;padding:18px 16px;margin-bottom:12px;border-radius:14px;border:2px solid #E24B4A;background:rgba(226,75,74,0.1);color:#E24B4A;font-size:16px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:12px;transition:all 0.2s;">
              <span style="width:40px;height:40px;border-radius:10px;background:#E24B4A;display:flex;align-items:center;justify-content:center;color:white;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </span>
              <span style="text-align:left;">
                <div>GBV & Femicide</div>
                <div style="font-size:12px;font-weight:400;opacity:0.7;">Gender-based violence</div>
              </span>
            </button>

            <button id="btnCrime" style="width:100%;padding:18px 16px;margin-bottom:20px;border-radius:14px;border:2px solid #F59E0B;background:rgba(245,158,11,0.1);color:#F59E0B;font-size:16px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:12px;transition:all 0.2s;">
              <span style="width:40px;height:40px;border-radius:10px;background:#F59E0B;display:flex;align-items:center;justify-content:center;color:white;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </span>
              <span style="text-align:left;">
                <div>Crime & Lawlessness</div>
                <div style="font-size:12px;font-weight:400;opacity:0.7;">Theft, assault, disorder</div>
              </span>
            </button>

            <button id="btnCancelType" style="width:100%;padding:14px;border-radius:12px;border:none;background:rgba(255,255,255,0.1);color:#888;font-size:14px;cursor:pointer;">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // Hover effects
      const btnGbv = document.getElementById('btnGbv');
      const btnCrime = document.getElementById('btnCrime');

      btnGbv.addEventListener('mouseenter', () => btnGbv.style.background = 'rgba(226,75,74,0.2)');
      btnGbv.addEventListener('mouseleave', () => btnGbv.style.background = 'rgba(226,75,74,0.1)');
      btnCrime.addEventListener('mouseenter', () => btnCrime.style.background = 'rgba(245,158,11,0.2)');
      btnCrime.addEventListener('mouseleave', () => btnCrime.style.background = 'rgba(245,158,11,0.1)');

      document.getElementById('btnGbv').addEventListener('click', () => {
        this.hideAlertTypeModal();
        this.trigger('GBV');
      });

      document.getElementById('btnCrime').addEventListener('click', () => {
        this.hideAlertTypeModal();
        this.trigger('CRIME');
      });

      document.getElementById('btnCancelType').addEventListener('click', () => {
        this.hideAlertTypeModal();
      });
    }

    modal.hidden = false;
  },

  hideAlertTypeModal: function() {
    const modal = document.getElementById('alertTypeModal');
    if (modal) modal.hidden = true;
  },

  trigger: async function(alertType) {
    this.initAudio();

    const now = Date.now();
    if (now - this.lastTriggerTime < CONFIG.EMERGENCY.COOLDOWN) {
      return;
    }
    this.lastTriggerTime = now;

    if (this.isAlerting) return;
    this.isAlerting = true;

    const typeConfig = this.ALERT_TYPES[alertType] || this.ALERT_TYPES.GBV;
    this.currentAlertType = alertType;

    const btn = document.getElementById('emergencyBtn');
    const alertMode = document.getElementById('alertMode');
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');
    const btnZone = document.querySelector('.btn-zone');

    if (btn) {
      btn.classList.add('pressed');
      const btnIcon = btn.querySelector('.btn-icon');
      const btnText = btn.querySelector('.btn-label');
      const btnSub = btn.querySelector('.btn-hint');
      if (btnIcon) btnIcon.innerHTML = typeConfig.icon;
      if (btnText) btnText.textContent = typeConfig.shortLabel + ' ALERT SENT';
      if (btnSub) btnSub.textContent = typeConfig.label;
    }

    if (statusDot) statusDot.className = 'status-dot alerting';
    if (statusText) statusText.textContent = typeConfig.shortLabel + ' Alerting...';

    if (alertMode) {
      alertMode.hidden = false;
      alertMode.classList.add('show');
    }

    if (btnZone) btnZone.classList.add('alerting');

    // Get location
    console.log('[Emergency] Getting location...');
    let locationText = 'No GPS';
    try {
      const locationPromise = GPS.getFormattedLocationAsync();
      const timeoutPromise = new Promise(resolve => setTimeout(() => {
        console.log('[Emergency] Geocode timeout, using fallback');
        resolve(GPS.getFormattedLocation());
      }, 3000));

      locationText = await Promise.race([locationPromise, timeoutPromise]);
    } catch (err) {
      console.error('[Emergency] Location error:', err);
      locationText = GPS.getFormattedLocation();
    }
    console.log('[Emergency] Final location:', locationText);

    // Build timestamp
    const alertTime = new Date();
    const timeString = alertTime.toLocaleString();
    const timeISO = alertTime.toISOString();

    const alertDetail = document.getElementById('alertDetail');
    if (alertDetail) {
      alertDetail.innerHTML = `
        <div style="display:inline-block;padding:4px 10px;border-radius:6px;background:${typeConfig.color}22;color:${typeConfig.color};font-size:11px;font-weight:600;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">${typeConfig.label}</div>
        <div style="font-weight:600;margin-bottom:4px;">${locationText}</div>
        <div style="font-size:12px;color:#888;">${timeString}</div>
      `;
    }

    const alertData = {
      id: Date.now().toString(36),
      alertType: alertType,
      alertTypeLabel: typeConfig.label,
      alertTypeShort: typeConfig.shortLabel,
      alertTypeColor: typeConfig.color,
      timestamp: timeISO,
      timeFormatted: timeString,
      location: locationText,
      lat: GPS.currentLocation ? GPS.currentLocation.lat : null,
      lng: GPS.currentLocation ? GPS.currentLocation.lng : null,
      message: typeConfig.message,
      description: typeConfig.description
    };

    console.log('[Emergency] EMERGENCY TRIGGERED');
    console.log('[Emergency] Type:', alertType);
    console.log('[Emergency] Data:', JSON.stringify(alertData));

    // CHANNEL 1: Sonic
    if (window.SonicAlert) {
      console.log('[Emergency] Channel 1: Sonic');
      SonicAlert.transmit(alertData);
    }

    // CHANNEL 2: P2P
    if (window.P2P) {
      const peerCount = P2P.broadcastAlert(alertData);
      console.log(`[Emergency] Channel 2: P2P sent to ${peerCount} peers`);
    }

    // CHANNEL 3: Push
    console.log('[Emergency] Channel 3: Push');
    this.sendPushNotification(alertData);

    // Backup: Web Share
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

    History.save(typeConfig.shortLabel + ' | ' + locationText + ' | ' + timeString);

    // Sound + vibration
    this.playAlertSound();

    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }

    if (this.alertCountdown) clearTimeout(this.alertCountdown);
    this.alertCountdown = setTimeout(() => {
      this.cancel();
    }, CONFIG.EMERGENCY.AUTO_CANCEL_DELAY);
  },

  sendPushNotification: async function(alertData) {
    try {
      console.log('[Emergency] Sending push to server...');
      const response = await fetch('/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertData)
      });

      const result = await response.json();
      console.log(`[Emergency] Push sent to ${result.sent} devices`);

    } catch (err) {
      console.error('[Emergency] Push broadcast failed:', err);
    }
  },

  cancel: function() {
    if (!this.isAlerting) return;

    this.isAlerting = false;
    this.currentAlertType = null;

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

  handleIncomingAlert: function(alert) {
    console.log('[Emergency] INCOMING ALERT:', alert);

    const typeConfig = this.ALERT_TYPES[alert.alertType] || {
      label: alert.alertTypeLabel || 'EMERGENCY',
      color: '#E24B4A',
      shortLabel: 'ALERT'
    };

    const overlay = document.getElementById('incomingAlert');
    const locationEl = document.getElementById('incomingLocation');
    const timeEl = document.getElementById('incomingTime');
    const mapLink = document.getElementById('incomingMap');

    if (overlay) {
      // Add alert type badge if not present
      let typeBadge = document.getElementById('incomingTypeBadge');
      if (!typeBadge) {
        typeBadge = document.createElement('div');
        typeBadge.id = 'incomingTypeBadge';
        locationEl.parentNode.insertBefore(typeBadge, locationEl);
      }
      typeBadge.innerHTML = `
        <div style="display:inline-block;padding:4px 10px;border-radius:6px;background:${typeConfig.color}22;color:${typeConfig.color};font-size:11px;font-weight:600;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">
          ${typeConfig.label}
        </div>
      `;

      locationEl.textContent = alert.location || 'Location unknown';

      const displayTime = alert.timeFormatted || new Date(alert.timestamp).toLocaleString();
      timeEl.textContent = displayTime;

      if (alert.lat && alert.lng) {
        mapLink.href = `https://www.google.com/maps?q=${alert.lat},${alert.lng}`;
        mapLink.style.display = 'inline-block';
      } else {
        mapLink.style.display = 'none';
      }

      overlay.hidden = false;
      overlay.classList.add('show');
    }

    this.playAlertSound();

    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(typeConfig.message || 'EMERGENCY ALERT!', {
        body: `[${typeConfig.shortLabel}] Someone needs help! ${alert.location}`,
        requireInteraction: true
      });
    }

    History.addFromServer(alert);
  },

  dismissIncoming: function() {
    const overlay = document.getElementById('incomingAlert');
    if (overlay) {
      overlay.classList.remove('show');
      setTimeout(() => { overlay.hidden = true; }, 300);
    }
  },

  playAlertSound: function() {
    console.log('playAlertSound called');
    if (!CONFIG.NOTIFICATIONS.SOUND) {
      console.log('Sound disabled in config');
      return;
    }

    try {
      const audio = new Audio('emergency_alarm.mp3');
      audio.volume = 1.0;

      let playCount = 0;
      const maxPlays = 3;

      audio.onended = () => {
        playCount++;
        if (playCount < maxPlays) {
          audio.currentTime = 0;
          audio.play().catch(e => console.log('Audio replay failed:', e));
        } else {
          console.log('Alarm finished (played ' + maxPlays + ' times)');
        }
      };

      audio.play().then(() => {
        console.log('LOUD ALARM playing from MP3');
      }).catch(err => {
        console.error('Audio play failed:', err);
        this.playFallbackSound();
      });

    } catch(e) {
      console.error('Failed to play sound:', e);
      this.playFallbackSound();
    }
  },

  playFallbackSound: function() {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const ctx = this.audioContext;
      const now = ctx.currentTime;
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

      const osc1 = ctx.createOscillator();
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

      console.log('Fallback alarm played');

    } catch(e) {
      console.error('Fallback sound failed:', e);
    }
  },

  testSound: function() {
    console.log('Testing alarm sound...');
    this.initAudio();
    this.playAlertSound();
  },

  isActive: function() {
    return this.isAlerting;
  }
};

window.Emergency = Emergency;

document.addEventListener('keydown', function(e) {
  if (e.key === ' ' || e.key === 'Enter') {
    const btn = document.getElementById('emergencyBtn');
    if (document.activeElement !== btn && !Emergency.isAlerting) {
      e.preventDefault();
      Emergency.showAlertTypeModal();
    }
  }

  if (e.key === 'Escape') {
    Emergency.cancel();
    Emergency.dismissIncoming();
    Emergency.hideAlertTypeModal();
  }
});
