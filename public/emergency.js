const Emergency = {
  isAlerting: false,
  alertCountdown: null,
  lastTriggerTime: 0,
  audioContext: null,

  initAudio: function() {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } catch(e) {
        console.log('Audio not supported');
      }
    }
  },

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

    // Use GPS.getFormattedLocation() which now returns building name/address
    const locationText = GPS.isAvailable() ?
      GPS.getFormattedLocation() :
      'No GPS';

    const alertDetail = document.getElementById('alertDetail');
    if (alertDetail) {
      alertDetail.innerHTML = `
        ${locationText}<br>
        <small style="color:#888;">${new Date().toLocaleString()}</small>
      `;
    }

    const alertData = {
      id: Date.now().toString(36),
      timestamp: new Date().toISOString(),
      location: locationText,
      lat: GPS.currentLocation ? GPS.currentLocation.lat : null,
      lng: GPS.currentLocation ? GPS.currentLocation.lng : null,
      message: 'EMERGENCY!'
    };

    console.log('EMERGENCY TRIGGERED');
    console.log('Location:', locationText);
    console.log('Starting 3-channel broadcast...');

    // CHANNEL 1: Sonic
    if (window.SonicAlert) {
      console.log('Channel 1: Sonic transmit starting...');
      SonicAlert.transmit(alertData);
    } else {
      console.log('Channel 1: SonicAlert not available');
    }

    // CHANNEL 2: P2P
    if (window.P2P) {
      const peerCount = P2P.broadcastAlert(alertData);
      console.log(`Channel 2: P2P sent to ${peerCount} peers`);
    } else {
      console.log('Channel 2: P2P not available');
    }

    // CHANNEL 3: Push
    console.log('Channel 3: Push notification starting...');
    this.sendPushNotification(alertData);

    // Backup: Web Share
    if (navigator.share) {
      navigator.share({
        title: 'Emergency Alert',
        text: `EMERGENCY!
${locationText}
Time: ${new Date().toLocaleString()}`,
        url: window.location.href
      }).catch(() => {});
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(
        `EMERGENCY!
${locationText}
Time: ${new Date().toLocaleString()}`
      ).catch(() => {});
    }

    History.save(locationText);

    // Sound + vibration
    console.log('Playing alert sound...');
    this.playAlertSound();

    if (navigator.vibrate) {
      console.log('Vibrating...');
      navigator.vibrate([200, 100, 200, 100, 400]);
    }

    if (this.alertCountdown) clearTimeout(this.alertCountdown);
    this.alertCountdown = setTimeout(() => {
      this.cancel();
    }, CONFIG.EMERGENCY.AUTO_CANCEL_DELAY);
  },

  sendPushNotification: async function(alertData) {
    try {
      console.log('Sending push to server...');
      const response = await fetch('/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertData)
      });

      const result = await response.json();
      console.log(`Push sent to ${result.sent} devices`);

    } catch (err) {
      console.error('Push broadcast failed:', err);
    }
  },

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

  handleIncomingAlert: function(alert) {
    console.log('INCOMING ALERT:', alert);

    const overlay = document.getElementById('incomingAlert');
    const locationEl = document.getElementById('incomingLocation');
    const timeEl = document.getElementById('incomingTime');
    const mapLink = document.getElementById('incomingMap');

    if (overlay) {
      locationEl.textContent = alert.location || 'Location unknown';
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

    console.log('Playing incoming alert sound...');
    this.playAlertSound();

    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('EMERGENCY ALERT!', {
        body: `Someone needs help! ${alert.location}`,
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
      Emergency.trigger();
    }
  }

  if (e.key === 'Escape') {
    Emergency.cancel();
    Emergency.dismissIncoming();
  }
});
