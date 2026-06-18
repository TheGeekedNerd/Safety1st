/* ========================================
   NEARBY MODULE - Shows listening status
   ======================================== */

const Nearby = {
    updateDisplay: function() {
        const list = document.getElementById('nearbyList');
        if (!list) return;

        const isListening = window.SonicAlert && SonicAlert.isReceiving;
        const isP2PConnected = window.P2P && P2P.connectedPeers && P2P.connectedPeers.size > 0;

        let html = '';

        // Sonic listening status
        html += `
            <div class="device-row">
                <span class="device-name">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                    🔊 Sonic Alert
                </span>
                <span class="badge ${isListening ? 'online' : 'offline'}">
                    ${isListening ? '🟢 Listening' : '⚪ Off'}
                </span>
            </div>
        `;

        // P2P status
        if (isP2PConnected) {
            P2P.connectedPeers.forEach(peerId => {
                html += `
                    <div class="device-row">
                        <span class="device-name">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                            📱 User ${peerId.substr(-4).toUpperCase()}
                        </span>
                        <span class="badge online">🟢 Online</span>
                    </div>
                `;
            });
        }

        list.innerHTML = html;
    }
};

window.Nearby = Nearby;

// Update display periodically
setInterval(() => {
    Nearby.updateDisplay();
}, 2000);
