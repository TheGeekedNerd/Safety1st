/* ========================================
   CHAT MODULE - P2P Peer Messaging
   ======================================== */

const Chat = {

    init: function() {
        const input = document.getElementById('chatInput');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') Chat.send();
            });
        }
    },

    // Called by P2P when peer count changes
    onPeerCountChange: function(count) {
        const badge       = document.getElementById('chatBadge');
        const inputRow    = document.getElementById('chatInputRow');
        const chatEmpty   = document.getElementById('chatEmpty');
        const chatMessages = document.getElementById('chatMessages');

        if (count > 0) {
            if (badge)        { badge.textContent = '● ON'; badge.style.color = 'var(--green, #4ade80)'; }
            if (inputRow)     inputRow.removeAttribute('hidden');
            if (chatEmpty)    chatEmpty.setAttribute('hidden', '');
            if (chatMessages) chatMessages.removeAttribute('hidden');
        } else {
            if (badge)        { badge.textContent = '● OFF'; badge.style.color = ''; }
            if (inputRow)     inputRow.setAttribute('hidden', '');
            if (chatEmpty)    chatEmpty.removeAttribute('hidden');
            if (chatMessages) chatMessages.setAttribute('hidden', '');
        }
    },

    send: function() {
        const input = document.getElementById('chatInput');
        if (!input) return;

        const text = input.value.trim();
        if (!text) return;

        if (P2P.connectedPeers.size === 0) {
            this._showToast('No peers connected');
            return;
        }

        const chatData = {
            text:      text,
            from:      P2P.localId,
            timestamp: Date.now()
        };

        P2P.broadcastChat(chatData);
        this._renderMessage(chatData, true);

        input.value = '';
        input.focus();
    },

    receive: function(chatData, fromPeerId) {
        this._renderMessage(chatData, false);
        this._flashBadge();
    },

    _renderMessage: function(chatData, isSelf) {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        const time = new Date(chatData.timestamp).toLocaleTimeString([], {
            hour:   '2-digit',
            minute: '2-digit'
        });

        const label = isSelf
            ? 'You'
            : `User ${chatData.from.substr(-4).toUpperCase()}`;

        const div = document.createElement('div');
        div.className = `chat-msg ${isSelf ? 'chat-msg--self' : 'chat-msg--peer'}`;
        div.innerHTML = `
            <span class="chat-msg-meta">${label} · ${time}</span>
            <span class="chat-msg-text">${this._escape(chatData.text)}</span>
        `;

        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },

    _escape: function(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    _flashBadge: function() {
        const badge = document.getElementById('chatBadge');
        if (!badge) return;
        badge.style.color = '#facc15';
        setTimeout(() => { badge.style.color = 'var(--green, #4ade80)'; }, 800);
    },

    _showToast: function(msg) {
        const t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = `
            position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
            background:#333;color:#fff;padding:8px 16px;border-radius:8px;
            font-size:13px;z-index:9999;pointer-events:none;
        `;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2000);
    }
};

window.Chat = Chat;

document.addEventListener('DOMContentLoaded', () => {
    Chat.init();
});