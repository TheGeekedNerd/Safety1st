/* ========================================
   CHAT MODULE - P2P Short Messages
   ======================================== */

const Chat = {
    messages: [],
    maxMessages: 50,
    maxLength: 120,

    init: function() {
        this.bindInput();
        this.updateBadge();
    },

    bindInput: function() {
        const input = document.getElementById('chatInput');
        if (!input) return;

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.send();
            }
        });
    },

    // Check if we have any data channels at all (connecting or open)
    hasAnyChannels: function() {
        if (!window.P2P) return false;
        return P2P.dataChannels && P2P.dataChannels.size > 0;
    },

    // Check if at least one channel is actually open
    hasOpenChannels: function() {
        if (!window.P2P || !P2P.dataChannels) return false;
        for (const [peerId, channel] of P2P.dataChannels) {
            if (channel.readyState === 'open') return true;
        }
        return false;
    },

    send: function() {
        const input = document.getElementById('chatInput');
        if (!input) return;

        const text = input.value.trim();
        if (!text) return;

        if (text.length > this.maxLength) {
            alert(`Message too long (max ${this.maxLength} chars)`);
            return;
        }

        const chatData = {
            text: text,
            from: 'User ' + (P2P ? P2P.localId.substr(-4).toUpperCase() : 'YOU'),
            fromId: P2P ? P2P.localId : 'self',
            time: Date.now()
        };

        // Always try to broadcast — P2P.broadcastChat handles "no open channels" gracefully
        if (window.P2P && P2P.broadcastChat) {
            const sent = P2P.broadcastChat(chatData);
            if (sent === 0 && this.hasAnyChannels()) {
                // Channels exist but not open yet — show a subtle hint
                this.renderSystemMessage('Message queued — waiting for peer to connect...');
            }
        }

        // Always show locally
        this.renderMessage({ ...chatData, own: true });
        input.value = '';
        this.updateBadge();
    },

    receive: function(data, fromPeerId) {
        this.renderMessage({
            text: data.text,
            from: data.from || `User ${fromPeerId.substr(-4).toUpperCase()}`,
            fromId: fromPeerId,
            time: data.time || Date.now(),
            own: false
        });
    },

    renderMessage: function(msg) {
        const container = document.getElementById('chatMessages');
        const empty = document.getElementById('chatEmpty');
        if (!container) return;

        if (empty) empty.hidden = true;
        container.hidden = false;

        const el = document.createElement('div');
        el.className = `chat-msg ${msg.own ? 'own' : 'peer'}`;

        const timeStr = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        el.innerHTML = `
            <div class="chat-msg-head">
                <span>${msg.own ? 'You' : msg.from}</span>
                <span>${timeStr}</span>
            </div>
            <div class="chat-msg-body">${this.escapeHtml(msg.text)}</div>
        `;

        container.appendChild(el);
        container.scrollTop = container.scrollHeight;

        this.messages.push(msg);
        if (this.messages.length > this.maxMessages) {
            this.messages.shift();
            if (container.children.length > this.maxMessages) {
                container.removeChild(container.firstChild);
            }
        }
    },

    renderSystemMessage: function(text) {
        const container = document.getElementById('chatMessages');
        const empty = document.getElementById('chatEmpty');
        if (!container) return;

        if (empty) empty.hidden = true;
        container.hidden = false;

        const el = document.createElement('div');
        el.className = 'chat-msg system';
        el.style.cssText = 'align-self:center;background:var(--bg);border:0.5px dashed var(--border-md);color:var(--text-muted);font-size:11px;font-style:italic;padding:4px 10px;';
        el.textContent = text;

        container.appendChild(el);
        container.scrollTop = container.scrollHeight;
    },

    escapeHtml: function(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    updateBadge: function() {
        const badge = document.getElementById('chatBadge');
        const inputRow = document.getElementById('chatInputRow');

        if (!badge) return;

        const peerCount = window.P2P ? P2P.getPeerCount() : 0;
        const hasChannels = this.hasAnyChannels();
        const hasOpen = this.hasOpenChannels();

        // Enable chat input if we have ANY channels (connecting or open)
        // OR if we've ever had a peer connection attempt (signaling connected)
        const signalingConnected = window.P2P && P2P.signalingSocket && P2P.signalingSocket.readyState === WebSocket.OPEN;
        const shouldEnable = hasChannels || (signalingConnected && peerCount > 0);

        if (hasOpen) {
            badge.textContent = `● ${peerCount} PEER${peerCount > 1 ? 'S' : ''}`;
            badge.style.color = 'var(--green)';
        } else if (hasChannels) {
            badge.textContent = `● CONNECTING...`;
            badge.style.color = 'var(--text-secondary)';
        } else if (signalingConnected) {
            badge.textContent = `● ONLINE`;
            badge.style.color = 'var(--text-secondary)';
        } else {
            badge.textContent = '● OFF';
            badge.style.color = 'var(--text-muted)';
        }

        if (inputRow) {
            inputRow.hidden = !shouldEnable;
        }
    }
};

window.Chat = Chat;

document.addEventListener('DOMContentLoaded', () => {
    Chat.init();
});

// Keep badge in sync with peer connections
setInterval(() => {
    Chat.updateBadge();
}, 1000);
