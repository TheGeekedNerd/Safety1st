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

    const alertData = {
      id: Date.now().toString(36),
      timestamp: new Date().toISOString(),
      location: locationText,
      lat: GPS.currentLocation ? GPS.currentLocation.lat : null,
      lng: GPS.currentLocation ? GPS.currentLocation.lng : null,
      message: '🚨 EMERGENCY!'
    };

    console.log('🚨 EMERGENCY TRIGGERED');
    console.log('📍 Location:', locationText);
    console.log('📡 Starting 3-channel broadcast...');

    // CHANNEL 1: Sonic
    if (window.SonicAlert) {
      console.log('📡 Channel 1: Sonic transmit starting...');
      SonicAlert.transmit(alertData);
    } else {
      console.log('❌ Channel 1: SonicAlert not available');
    }

    // CHANNEL 2: P2P
    if (window.P2P) {
      const peerCount = P2P.broadcastAlert(alertData);
      console.log(`📡 Channel 2: P2P sent to ${peerCount} peers`);
    } else {
      console.log('❌ Channel 2: P2P not available');
    }

    // CHANNEL 3: Push
    console.log('📡 Channel 3: Push notification starting...');
    this.sendPushNotification(alertData);

    // Backup: Web Share
    if (navigator.share) {
      navigator.share({
        title: '🚨 Emergency Alert',
        text: `🚨 EMERGENCY!
${locationText}
Time: ${new Date().toLocaleString()}`,
        url: window.location.href
      }).catch(() => {});
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(
        `🚨 EMERGENCY!
${locationText}
Time: ${new Date().toLocaleString()}`
      ).catch(() => {});
    }

    History.save(locationText);

    // Sound + vibration
    console.log('🔊 Playing alert sound...');
    this.playAlertSound();

    if (navigator.vibrate) {
      console.log('📳 Vibrating...');
      navigator.vibrate([200, 100, 200, 100, 400]);
    }

    if (this.alertCountdown) clearTimeout(this.alertCountdown);
    this.alertCountdown = setTimeout(() => {
      this.cancel();
    }, CONFIG.EMERGENCY.AUTO_CANCEL_DELAY);
  },

  sendPushNotification: async function(alertData) {
    try {
      console.log('📡 Sending push to server...');
      const response = await fetch('/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertData)
      });

      const result = await response.json();
      console.log(`✅ Push sent to ${result.sent} devices`);

    } catch (err) {
      console.error('❌ Push broadcast failed:', err);
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
    console.log('🚨 INCOMING ALERT:', alert);

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

    console.log('🔊 Playing incoming alert sound...');
    this.playAlertSound();

    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🚨 EMERGENCY ALERT!', {
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
    console.log('🔊 playAlertSound called');
    if (!CONFIG.NOTIFICATIONS.SOUND) {
      console.log('❌ Sound disabled in config');
      return;
    }

    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const ctx = this.audioContext;
      const now = ctx.currentTime;

      // MASTER GAIN - Start at 0 to avoid click, then ramp up
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0, now);
      masterGain.gain.linearRampToValueAtTime(1.0, now + 0.05); // Full volume
      masterGain.connect(ctx.destination);

      // COMPRESSOR - Makes it louder and more aggressive
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-24, now);
      compressor.knee.setValueAtTime(0, now);
      compressor.ratio.setValueAtTime(20, now);
      compressor.attack.setValueAtTime(0.003, now);
      compressor.release.setValueAtTime(0.1, now);
      compressor.connect(masterGain);

      // DISTORTION - For aggressive alarm sound
      const distortion = ctx.createWaveShaper();
      distortion.curve = this.makeDistortionCurve(50);
      distortion.oversample = '4x';
      distortion.connect(compressor);

      // MAIN OSCILLATOR 1 - Siren sweep
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sawtooth';
      osc1.connect(gain1);
      gain1.connect(distortion);

      // Siren pattern: 800Hz → 1200Hz → 800Hz (classic alarm)
      const sirenDuration = 0.6;
      for (let i = 0; i < 5; i++) { // 5 siren cycles
        const t = now + (i * sirenDuration);
        osc1.frequency.setValueAtTime(800, t);
        osc1.frequency.linearRampToValueAtTime(1200, t + 0.3);
        osc1.frequency.linearRampToValueAtTime(800, t + 0.6);
      }

      gain1.gain.setValueAtTime(0.4, now);
      gain1.gain.setValueAtTime(0.4, now + 3.0);
      gain1.gain.linearRampToValueAtTime(0, now + 3.5);

      // MAIN OSCILLATOR 2 - Square wave for buzzer effect
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'square';
      osc2.connect(gain2);
      gain2.connect(distortion);

      // Lower tone for depth
      for (let i = 0; i < 5; i++) {
        const t = now + (i * sirenDuration);
        osc2.frequency.setValueAtTime(400, t);
        osc2.frequency.linearRampToValueAtTime(600, t + 0.3);
        osc2.frequency.linearRampToValueAtTime(400, t + 0.6);
      }

      gain2.gain.setValueAtTime(0.3, now);
      gain2.gain.setValueAtTime(0.3, now + 3.0);
      gain2.gain.linearRampToValueAtTime(0, now + 3.5);

      // HIGH PITCHED BEEP - Penetrating tone
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'sine';
      osc3.connect(gain3);
      gain3.connect(compressor); // Skip distortion for clarity

      // Rapid beeping
      for (let i = 0; i < 30; i++) {
        const t = now + (i * 0.1);
        gain3.gain.setValueAtTime(0.5, t);
        gain3.gain.setValueAtTime(0, t + 0.05);
      }
      osc3.frequency.setValueAtTime(2000, now);

      // NOISE - For texture (white noise burst)
      const bufferSize = ctx.sampleRate * 3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.1, now);
      noiseGain.gain.linearRampToValueAtTime(0, now + 1.0);
      noise.connect(noiseGain);
      noiseGain.connect(compressor);

      // Start everything
      osc1.start(now);
      osc1.stop(now + 3.5);
      osc2.start(now);
      osc2.stop(now + 3.5);
      osc3.start(now);
      osc3.stop(now + 3.0);
      noise.start(now);

      // Fade out master
      masterGain.gain.setValueAtTime(1.0, now + 3.0);
      masterGain.gain.linearRampToValueAtTime(0, now + 3.5);

      console.log('✅ LOUD ALARM sound played (3.5s)');

    } catch(e) {
      console.error('❌ Failed to play sound:', e);
    }
  },

  makeDistortionCurve: function(amount) {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  },

  /**
   * Test alarm sound (for debugging)
   */
  testSound: function() {
    console.log('🔊 Testing alarm sound...');
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
