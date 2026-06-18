/* ========================================
   P2P MODULE - WebRTC Peer-to-Peer Alerts
   ======================================== */

const P2P = {
    peerConnections: new Map(), // Map of peerId -> RTCPeerConnection
    dataChannels: new Map(),    // Map of peerId -> RTCDataChannel
    localId: null,
    signalingSocket: null,
    connectedPeers: new Set(),

    /**
     * Initialize P2P - connect to signaling server
     */
    init: function() {
        this.localId = 'user_' + Math.random().toString(36).substr(2, 8);
        this.connectSignaling();
    },

    /**
     * Connect to WebSocket signaling server
     */
    connectSignaling: function() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        try {
            this.signalingSocket = new WebSocket(wsUrl);

            this.signalingSocket.onopen = () => {
                console.log('✅ Signaling connected');
                this.updateConnectionStatus('connected');
            };

            this.signalingSocket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    this.handleSignalingMessage(msg);
                } catch (e) {
                    console.error('Invalid signaling msg:', e);
                }
            };

            this.signalingSocket.onclose = () => {
                console.log('🔌 Signaling disconnected');
                this.updateConnectionStatus('disconnected');
                setTimeout(() => this.connectSignaling(), 3000);
            };

            this.signalingSocket.onerror = (err) => {
                console.error('Signaling error:', err);
                this.updateConnectionStatus('error');
            };

        } catch (e) {
            console.error('Failed to connect signaling:', e);
        }
    },

    /**
     * Send message via signaling server
     */
    sendSignal: function(data) {
        if (this.signalingSocket && this.signalingSocket.readyState === WebSocket.OPEN) {
            this.signalingSocket.send(JSON.stringify(data));
            return true;
        }
        return false;
    },

    /**
     * Handle incoming signaling messages
     */
    handleSignalingMessage: function(msg) {
        const from = msg.from;
        if (from === this.localId) return; // Ignore own messages

        switch (msg.type) {
            case 'offer':
                this.handleOffer(from, msg.sdp);
                break;
            case 'answer':
                this.handleAnswer(from, msg.sdp);
                break;
            case 'ice-candidate':
                this.handleIceCandidate(from, msg.candidate);
                break;
            case 'peer-hello':
                // New peer joined, send offer back
                this.createPeerConnection(from);
                this.sendOffer(from);
                break;
        }
    },

    /**
     * Create RTCPeerConnection for a peer
     */
    createPeerConnection: function(peerId) {
        if (this.peerConnections.has(peerId)) {
            return this.peerConnections.get(peerId);
        }

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        });

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal({
                    type: 'ice-candidate',
                    to: peerId,
                    candidate: event.candidate
                });
            }
        };

        // Handle connection state changes
        pc.onconnectionstatechange = () => {
            console.log(`Peer ${peerId} state:`, pc.connectionState);
            if (pc.connectionState === 'connected') {
                this.connectedPeers.add(peerId);
                this.updatePeerDisplay();
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                this.connectedPeers.delete(peerId);
                this.peerConnections.delete(peerId);
                this.dataChannels.delete(peerId);
                this.updatePeerDisplay();
            }
        };

        // Handle incoming data channel
        pc.ondatachannel = (event) => {
            const channel = event.channel;
            this.setupDataChannel(peerId, channel);
        };

        this.peerConnections.set(peerId, pc);
        return pc;
    },

    /**
     * Setup data channel handlers
     */
    setupDataChannel: function(peerId, channel) {
        this.dataChannels.set(peerId, channel);

        channel.onopen = () => {
            console.log(`📡 Data channel open with ${peerId}`);
            this.connectedPeers.add(peerId);
            this.updatePeerDisplay();
        };

        channel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleP2PMessage(data, peerId);
            } catch (e) {
                console.error('Invalid P2P message:', e);
            }
        };

        channel.onclose = () => {
            console.log(`📡 Data channel closed with ${peerId}`);
            this.connectedPeers.delete(peerId);
            this.dataChannels.delete(peerId);
            this.updatePeerDisplay();
        };

        channel.onerror = (err) => {
            console.error(`Data channel error with ${peerId}:`, err);
        };
    },

    /**
     * Send offer to peer
     */
    sendOffer: async function(peerId) {
        const pc = this.createPeerConnection(peerId);

        // Create data channel
        const channel = pc.createDataChannel('alerts', {
            ordered: true
        });
        this.setupDataChannel(peerId, channel);

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            this.sendSignal({
                type: 'offer',
                to: peerId,
                sdp: pc.localDescription
            });
        } catch (e) {
            console.error('Failed to create offer:', e);
        }
    },

    /**
     * Handle incoming offer
     */
    handleOffer: async function(peerId, sdp) {
        const pc = this.createPeerConnection(peerId);

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.sendSignal({
                type: 'answer',
                to: peerId,
                sdp: pc.localDescription
            });
        } catch (e) {
            console.error('Failed to handle offer:', e);
        }
    },

    /**
     * Handle incoming answer
     */
    handleAnswer: async function(peerId, sdp) {
        const pc = this.peerConnections.get(peerId);
        if (!pc) return;

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (e) {
            console.error('Failed to handle answer:', e);
        }
    },

    /**
     * Handle ICE candidate
     */
    handleIceCandidate: async function(peerId, candidate) {
        const pc = this.peerConnections.get(peerId);
        if (!pc) return;

        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error('Failed to add ICE candidate:', e);
        }
    },

    /**
     * Broadcast alert to ALL connected peers via P2P
     */
    broadcastAlert: function(alertData) {
        const message = JSON.stringify({
            type: 'emergency',
            data: alertData
        });

        let sentCount = 0;
        this.dataChannels.forEach((channel, peerId) => {
            if (channel.readyState === 'open') {
                try {
                    channel.send(message);
                    sentCount++;
                } catch (e) {
                    console.error(`Failed to send to ${peerId}:`, e);
                }
            }
        });

        console.log(`📡 Alert sent to ${sentCount} peers via P2P`);
        return sentCount;
    },

    /**
     * Handle incoming P2P message
     */
    handleP2PMessage: function(data, fromPeerId) {
        switch (data.type) {
            case 'emergency':
                console.log(`🚨 P2P ALERT from ${fromPeerId}:`, data.data);
                Emergency.handleIncomingAlert(data.data);
                break;
        }
    },

    /**
     * Update UI with peer count
     */
    updatePeerDisplay: function() {
        const count = this.connectedPeers.size;
        const el = document.getElementById('userCount');
        const liveUsers = document.getElementById('liveUsers');

        if (el) {
            if (count === 0) {
                el.textContent = '1 user (you)';
            } else {
                el.textContent = `${count + 1} users connected`;
            }
        }

        if (liveUsers) {
            liveUsers.classList.toggle('connected', count > 0 || this.signalingSocket?.readyState === WebSocket.OPEN);
        }

        // Update nearby list
        this.updateNearbyList();
    },

    /**
     * Update connection status
     */
    updateConnectionStatus: function(status) {
        const el = document.getElementById('userCount');
        if (el && status === 'disconnected') {
            el.textContent = 'Reconnecting...';
        }
    },

    /**
     * Update nearby devices list with real peers
     */
    updateNearbyList: function() {
        const list = document.getElementById('nearbyList');
        if (!list) return;

        if (this.connectedPeers.size === 0) {
            list.innerHTML = `
                <div class="device-row">
                    <span class="device-name">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                        No peers connected
                    </span>
                    <span class="badge offline">Waiting</span>
                </div>
            `;
            return;
        }

        let html = '';
        this.connectedPeers.forEach(peerId => {
            html += `
                <div class="device-row">
                    <span class="device-name">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                        📱 User ${peerId.substr(-4).toUpperCase()}
                    </span>
                    <span class="badge online">🟢 Connected</span>
                </div>
            `;
        });

        list.innerHTML = html;
    },

    /**
     * Get number of connected peers
     */
    getPeerCount: function() {
        return this.connectedPeers.size;
    }
};

// Make globally available
window.P2P = P2P;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    P2P.init();

    // Announce presence to other peers
    setTimeout(() => {
        P2P.sendSignal({ type: 'peer-hello' });
    }, 1000);
});
