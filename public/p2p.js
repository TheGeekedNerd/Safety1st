/* ========================================
   P2P MODULE - WebRTC Peer-to-Peer Alerts
   ======================================== */

const P2P = {
    peerConnections: new Map(),   // peerId → RTCPeerConnection
    dataChannels: new Map(),      // peerId → RTCDataChannel
    localId: null,
    signalingSocket: null,
    connectedPeers: new Set(),
    pendingCandidates: new Map(), // peerId → RTCIceCandidate[] (queued before remote desc is set)
    debug: true,

    log: function(...args) {
        if (this.debug) console.log('[P2P]', ...args);
    },

    init: function() {
        if (window.crypto && crypto.randomUUID) {
            this.localId = crypto.randomUUID().split('-')[0];
        } else {
            this.localId = 'user_' + Math.random().toString(36).substr(2, 6);
        }

        this.showMyId();
        this.log('Init with ID:', this.localId);
        this.connectSignaling();
    },

    showMyId: function() {
        let idDisplay = document.getElementById('myDeviceId');
        if (!idDisplay) {
            idDisplay = document.createElement('div');
            idDisplay.id = 'myDeviceId';
            idDisplay.style.cssText = 'text-align:center;font-size:11px;color:var(--text-muted);margin-bottom:8px;';
            const card = document.querySelector('.card');
            if (card) card.insertBefore(idDisplay, card.children[2]);
        }
        idDisplay.textContent = `This device: ${this.localId.toUpperCase()}`;
    },

    connectSignaling: function() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl    = `${protocol}//${window.location.host}`;

        this.log('Connecting to signaling:', wsUrl);

        try {
            this.signalingSocket = new WebSocket(wsUrl);

            this.signalingSocket.onopen = () => {
                this.log('Signaling connected');
                this.updateConnectionStatus('connected');
                // Announce ourselves to all existing peers
                setTimeout(() => {
                    this.sendSignal({ type: 'peer-hello', from: this.localId });
                }, 500);
            };

            this.signalingSocket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    this.log('Received:', msg.type, 'from', msg.from);
                    this.handleSignalingMessage(msg);
                } catch (e) {
                    console.error('[P2P] Invalid msg:', e);
                }
            };

            this.signalingSocket.onclose = () => {
                this.log('Signaling disconnected, reconnecting in 3s...');
                this.updateConnectionStatus('disconnected');
                setTimeout(() => this.connectSignaling(), 3000);
            };

            this.signalingSocket.onerror = (err) => {
                console.error('[P2P] Signaling error:', err);
                this.updateConnectionStatus('error');
            };

        } catch (e) {
            console.error('[P2P] Failed to connect:', e);
        }
    },

    sendSignal: function(data) {
        if (this.signalingSocket && this.signalingSocket.readyState === WebSocket.OPEN) {
            this.signalingSocket.send(JSON.stringify(data));
            return true;
        }
        this.log('Cannot send signal — socket not open');
        return false;
    },

    handleSignalingMessage: function(msg) {
        const from = msg.from;

        // Ignore messages with no sender or messages from ourselves
        if (!from || from === this.localId) return;

        // For targeted messages, ignore if we're not the intended recipient
        if (msg.to && msg.to !== this.localId) return;

        switch (msg.type) {
            case 'peer-hello':
                // A new peer joined — we initiate the offer
                this.log('Peer hello from:', from);
                if (!this.peerConnections.has(from)) {
                    this.sendOffer(from);
                }
                break;

            case 'offer':
                this.log('Offer from:', from);
                this.handleOffer(from, msg.sdp);
                break;

            case 'answer':
                this.log('Answer from:', from);
                this.handleAnswer(from, msg.sdp);
                break;

            case 'ice-candidate':
                this.handleIceCandidate(from, msg.candidate);
                break;
        }
    },

    createPeerConnection: function(peerId) {
        if (this.peerConnections.has(peerId)) {
            return this.peerConnections.get(peerId);
        }

        this.log('Creating peer connection for:', peerId);

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302'  },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.log('Sending ICE candidate to:', peerId);
                this.sendSignal({
                    type: 'ice-candidate',
                    to:   peerId,
                    from: this.localId,
                    candidate: event.candidate
                });
            }
        };

        pc.onconnectionstatechange = () => {
            this.log(`Peer ${peerId} connection state:`, pc.connectionState);
            if (pc.connectionState === 'connected') {
                this.connectedPeers.add(peerId);
                this.updatePeerDisplay();
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                this.cleanupPeer(peerId);
            }
        };

        // Receiver side: data channel comes in via this event
        pc.ondatachannel = (event) => {
            this.log('Data channel received from:', peerId);
            this.setupDataChannel(peerId, event.channel);
        };

        this.peerConnections.set(peerId, pc);
        this.pendingCandidates.set(peerId, []);
        return pc;
    },

    setupDataChannel: function(peerId, channel) {
        this.dataChannels.set(peerId, channel);

        channel.onopen = () => {
            this.log('Data channel OPEN with:', peerId);
            this.connectedPeers.add(peerId);
            this.updatePeerDisplay();
        };

        channel.onmessage = (event) => {
            this.log('P2P message from:', peerId);
            try {
                const data = JSON.parse(event.data);
                this.handleP2PMessage(data, peerId);
            } catch (e) {
                console.error('[P2P] Invalid message:', e);
            }
        };

        channel.onclose = () => {
            this.log('Data channel CLOSED with:', peerId);
            this.cleanupPeer(peerId);
        };

        channel.onerror = (err) => {
            console.error(`[P2P] Data channel error with ${peerId}:`, err);
        };
    },

    cleanupPeer: function(peerId) {
        this.connectedPeers.delete(peerId);
        this.dataChannels.delete(peerId);
        this.peerConnections.delete(peerId);
        this.pendingCandidates.delete(peerId);
        this.updatePeerDisplay();
        this.log('Cleaned up peer:', peerId);
    },

    sendOffer: async function(peerId) {
        const pc      = this.createPeerConnection(peerId);
        const channel = pc.createDataChannel('alerts', { ordered: true });
        this.setupDataChannel(peerId, channel);

        try {
            this.log('Creating offer for:', peerId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            this.sendSignal({
                type: 'offer',
                to:   peerId,
                from: this.localId,
                sdp:  pc.localDescription
            });
            this.log('Offer sent to:', peerId);
        } catch (e) {
            console.error('[P2P] Failed to create offer:', e);
            this.cleanupPeer(peerId);
        }
    },

    handleOffer: async function(peerId, sdp) {
        const pc = this.createPeerConnection(peerId);

        try {
            this.log('Setting remote description (offer) for:', peerId);
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));

            // Flush any ICE candidates that arrived before the remote desc was set
            await this.flushPendingCandidates(peerId);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.sendSignal({
                type: 'answer',
                to:   peerId,
                from: this.localId,
                sdp:  pc.localDescription
            });
            this.log('Answer sent to:', peerId);
        } catch (e) {
            console.error('[P2P] Failed to handle offer:', e);
            this.cleanupPeer(peerId);
        }
    },

    handleAnswer: async function(peerId, sdp) {
        const pc = this.peerConnections.get(peerId);
        if (!pc) {
            this.log('No peer connection found for answer from:', peerId);
            return;
        }

        try {
            this.log('Setting remote description (answer) for:', peerId);
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));

            // Flush any ICE candidates that arrived before the remote desc was set
            await this.flushPendingCandidates(peerId);
        } catch (e) {
            console.error('[P2P] Failed to handle answer:', e);
        }
    },

    handleIceCandidate: async function(peerId, candidate) {
        const pc = this.peerConnections.get(peerId);
        if (!pc) return;

        // If remote description isn't set yet, queue the candidate
        if (!pc.remoteDescription) {
            this.log('Queuing ICE candidate for:', peerId);
            const queue = this.pendingCandidates.get(peerId) || [];
            queue.push(candidate);
            this.pendingCandidates.set(peerId, queue);
            return;
        }

        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error('[P2P] Failed to add ICE candidate:', e);
        }
    },

    flushPendingCandidates: async function(peerId) {
        const pc        = this.peerConnections.get(peerId);
        const candidates = this.pendingCandidates.get(peerId) || [];

        if (!pc || candidates.length === 0) return;

        this.log(`Flushing ${candidates.length} queued ICE candidates for:`, peerId);
        for (const candidate of candidates) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.error('[P2P] Failed to flush ICE candidate:', e);
            }
        }
        this.pendingCandidates.set(peerId, []);
    },

    broadcastAlert: function(alertData) {
        const message  = JSON.stringify({ type: 'emergency', data: alertData });
        let sentCount  = 0;

        this.dataChannels.forEach((channel, peerId) => {
            if (channel.readyState === 'open') {
                try {
                    channel.send(message);
                    sentCount++;
                    this.log('Alert sent to peer:', peerId);
                } catch (e) {
                    console.error(`[P2P] Failed to send to ${peerId}:`, e);
                }
            } else {
                this.log('Channel not open for peer:', peerId, '— state:', channel.readyState);
            }
        });

        this.log(`Total peers alerted via P2P: ${sentCount}`);
        return sentCount;
    },

    handleP2PMessage: function(data, fromPeerId) {
        switch (data.type) {
            case 'emergency':
                this.log('INCOMING ALERT from peer:', fromPeerId);
                if (window.Emergency) {
                    Emergency.handleIncomingAlert(data.data);
                }
                break;
            default:
                this.log('Unknown P2P message type:', data.type);
        }
    },

    updatePeerDisplay: function() {
        const count    = this.connectedPeers.size;
        const el       = document.getElementById('userCount');
        const liveUsers = document.getElementById('liveUsers');

        this.log('Connected peers:', count);

        if (el) {
            el.textContent = count === 0
                ? '1 user (you)'
                : `${count + 1} users connected`;
        }

        if (liveUsers) {
            const isConnected = this.signalingSocket?.readyState === WebSocket.OPEN;
            liveUsers.classList.toggle('connected', isConnected);
        }

        this.updateNearbyList();
    },

    updateConnectionStatus: function(status) {
        const el = document.getElementById('userCount');
        if (!el) return;
        if (status === 'disconnected' || status === 'error') {
            el.textContent = 'Reconnecting...';
        }
    },

    updateNearbyList: function() {
        const list = document.getElementById('nearbyList');
        if (!list) return;

        if (this.connectedPeers.size === 0) {
            list.innerHTML = `
                <div class="device-row">
                    <span class="device-name">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                            <line x1="12" y1="18" x2="12.01" y2="18"/>
                        </svg>
                        No peers connected
                    </span>
                    <span class="badge offline">Waiting</span>
                </div>`;
            return;
        }

        let html = '';
        this.connectedPeers.forEach(peerId => {
            html += `
                <div class="device-row">
                    <span class="device-name">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                            <line x1="12" y1="18" x2="12.01" y2="18"/>
                        </svg>
                        User ${peerId.substr(-4).toUpperCase()}
                    </span>
                    <span class="badge online">Connected</span>
                </div>`;
        });
        list.innerHTML = html;
    },

    getPeerCount: function() {
        return this.connectedPeers.size;
    }
};

window.P2P = P2P;

document.addEventListener('DOMContentLoaded', () => {
    P2P.init();
});