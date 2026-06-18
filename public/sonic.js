/* ========================================
   SONIC ALERT MODULE - Sound-based emergency signaling
   Uses ultrasonic frequencies (18-20kHz) to broadcast alerts
   No internet, no Bluetooth, no WiFi needed!
   ======================================== */

const SonicAlert = {
    // Audio context for transmitting
    audioCtx: null,

    // For receiving
    analyser: null,
    microphone: null,
    receiveInterval: null,

    // Frequency configuration
    BASE_FREQ: 18500,      // Base ultrasonic frequency (Hz)
    FREQ_STEP: 100,        // Step between tones
    TONE_DURATION: 100,    // ms per tone
    GAP_DURATION: 50,      // ms gap between tones

    // State
    isTransmitting: false,
    isReceiving: false,
    debug: true,

    log: function(...args) {
        if (this.debug) console.log('[SONIC]', ...args);
    },

    /**
     * Initialize audio context (must be user-initiated)
     */
    initAudio: function() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    },

    /**
     * Encode string to frequency sequence
     */
    encode: function(str) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,- ';
        const tones = [];

        // Start tone
        tones.push({ freq: this.BASE_FREQ, duration: 200 });

        for (let char of str.toUpperCase()) {
            const idx = chars.indexOf(char);
            if (idx >= 0) {
                tones.push({
                    freq: this.BASE_FREQ + (idx * this.FREQ_STEP),
                    duration: this.TONE_DURATION
                });
            }
        }

        // End tone
        tones.push({ freq: this.BASE_FREQ + 2000, duration: 200 });

        return tones;
    },

    /**
     * Transmit alert via sound
     */
    transmit: function(alertData) {
        this.initAudio();

        if (this.isTransmitting) return;
        this.isTransmitting = true;

        // Build message: ALERT|LAT|LNG|TIME
        const lat = alertData.lat ? alertData.lat.toFixed(4) : '0';
        const lng = alertData.lng ? alertData.lng.toFixed(4) : '0';
        const time = Date.now().toString().slice(-6); // Last 6 digits

        // Shortened message format
        const message = `ALERT ${lat} ${lng} ${time}`;
        const tones = this.encode(message);

        this.log('Transmitting:', message);
        this.log('Tones:', tones.length);

        // Play tones sequentially
        let currentTime = this.audioCtx.currentTime;

        tones.forEach((tone, i) => {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            osc.type = 'sine';
            osc.frequency.value = tone.freq;

            // Ramp up/down to avoid clicking
            const startTime = currentTime;
            const endTime = startTime + (tone.duration / 1000);

            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.8, startTime + 0.01);
            gain.gain.linearRampToValueAtTime(0.8, endTime - 0.01);
            gain.gain.linearRampToValueAtTime(0, endTime);

            osc.start(startTime);
            osc.stop(endTime);

            currentTime = endTime + (this.GAP_DURATION / 1000);
        });

        // Repeat transmission 3 times for reliability
        setTimeout(() => {
            this.isTransmitting = false;
        }, (currentTime - this.audioCtx.currentTime) * 1000);

        // Transmit again after a short delay
        setTimeout(() => {
            if (!this.isTransmitting) {
                this.transmit(alertData);
            }
        }, 2000);

        // And once more
        setTimeout(() => {
            if (!this.isTransmitting) {
                this.transmit(alertData);
            }
        }, 4000);
    },

    /**
     * Start listening for sonic alerts
     */
    startListening: async function() {
        if (this.isReceiving) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            this.audioCtx = this.audioCtx || new (window.AudioContext || window.webkitAudioContext)();

            this.microphone = this.audioCtx.createMediaStreamSource(stream);
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 4096;
            this.analyser.smoothingTimeConstant = 0.1;

            this.microphone.connect(this.analyser);

            this.isReceiving = true;
            this.log('👂 Listening for sonic alerts...');

            this.detectTones();

        } catch (err) {
            console.error('[SONIC] Microphone access denied:', err);
        }
    },

    /**
     * Detect ultrasonic tones in microphone input
     */
    detectTones: function() {
        if (!this.isReceiving) return;

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteFrequencyData(dataArray);

        const sampleRate = this.audioCtx.sampleRate;
        const binSize = sampleRate / 2 / bufferLength;

        // Look for energy in ultrasonic range (18-20kHz)
        const minBin = Math.floor(18000 / binSize);
        const maxBin = Math.floor(20000 / binSize);

        let maxEnergy = 0;
        let peakBin = -1;

        for (let i = minBin; i <= maxBin && i < bufferLength; i++) {
            if (dataArray[i] > maxEnergy) {
                maxEnergy = dataArray[i];
                peakBin = i;
            }
        }

        // Threshold for detection (adjust based on environment)
        const THRESHOLD = 100;

        if (maxEnergy > THRESHOLD && peakBin >= 0) {
            const detectedFreq = peakBin * binSize;
            this.handleDetectedTone(detectedFreq, maxEnergy);
        }

        requestAnimationFrame(() => this.detectTones());
    },

    // Tone detection state machine
    toneBuffer: [],
    lastToneTime: 0,
    detecting: false,

    handleDetectedTone: function(freq, energy) {
        const now = Date.now();

        // Check for start tone (BASE_FREQ ± 50Hz)
        if (Math.abs(freq - this.BASE_FREQ) < 50) {
            if (!this.detecting) {
                this.detecting = true;
                this.toneBuffer = [];
                this.log('📡 Start tone detected!');
            }
            this.lastToneTime = now;
            return;
        }

        // Check for end tone
        if (this.detecting && Math.abs(freq - (this.BASE_FREQ + 2000)) < 100) {
            this.detecting = false;
            this.processToneBuffer();
            return;
        }

        // Record tone if we're detecting
        if (this.detecting) {
            // Only record if enough time has passed (debounce)
            if (now - this.lastToneTime > this.TONE_DURATION / 2) {
                this.toneBuffer.push(freq);
                this.lastToneTime = now;
            }
        }

        // Timeout if no tone for 500ms
        if (this.detecting && now - this.lastToneTime > 500) {
            this.detecting = false;
            this.toneBuffer = [];
        }
    },

    /**
     * Process detected tones back into message
     */
    processToneBuffer: function() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,- ';
        let message = '';

        for (let freq of this.toneBuffer) {
            const idx = Math.round((freq - this.BASE_FREQ) / this.FREQ_STEP);
            if (idx >= 0 && idx < chars.length) {
                message += chars[idx];
            }
        }

        this.log('📨 Decoded:', message);

        if (message.startsWith('ALERT')) {
            this.handleAlert(message);
        }

        this.toneBuffer = [];
    },

    /**
     * Handle decoded alert message
     */
    handleAlert: function(message) {
        // Parse: ALERT LAT LNG TIME
        const parts = message.split(' ');
        if (parts.length >= 4) {
            const alertData = {
                type: 'sonic',
                lat: parseFloat(parts[1]) || null,
                lng: parseFloat(parts[2]) || null,
                timestamp: new Date().toISOString(),
                location: parts[1] !== '0' ? `📍 ${parts[1]}, ${parts[2]}` : '📍 Location unknown'
            };

            this.log('🚨 SONIC ALERT RECEIVED:', alertData);

            // Trigger emergency UI
            if (window.Emergency) {
                Emergency.handleIncomingAlert(alertData);
            }

            // Also try to forward via P2P if available
            if (window.P2P && P2P.connectedPeers.size > 0) {
                P2P.broadcastAlert(alertData);
            }
        }
    },

    /**
     * Stop listening
     */
    stopListening: function() {
        this.isReceiving = false;
        if (this.microphone) {
            this.microphone.disconnect();
        }
        if (this.analyser) {
            this.analyser.disconnect();
        }
        this.log('👂 Stopped listening');
    }
};

// Make globally available
window.SonicAlert = SonicAlert;

// Auto-start listening when page loads (if permission granted)
document.addEventListener('DOMContentLoaded', () => {
    // Request mic permission on first user interaction
    const startListening = () => {
        SonicAlert.startListening();
        document.removeEventListener('click', startListening);
        document.removeEventListener('touchstart', startListening);
    };
    document.addEventListener('click', startListening);
    document.addEventListener('touchstart', startListening);
});
