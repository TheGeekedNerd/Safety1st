/* ========================================
   STATUS INDICATOR — Connection / tier badge
   Shows: online | queued | sms | mesh
   Requires <div id="status-indicator"></div> in index.html
   ======================================== */

const StatusIndicator = (() => {
    const TIERS = {
        online : { label: 'Connected',              icon: '🌐', cls: 'status-online'  },
        queued : { label: 'Offline — queuing alerts', icon: '⏳', cls: 'status-queued' },
        sms    : { label: 'SMS fallback active',    icon: '📱', cls: 'status-sms'     },
        mesh   : { label: 'Mesh relay active',      icon: '📡', cls: 'status-mesh'    },
    };

    let _current = 'online';
    let _revertTimer = null;

    // ── Render ────────────────────────────────────────────────────────────────

    function render(tier, queueLen) {
        const el = document.getElementById('status-indicator');
        if (!el) return;

        const cfg = TIERS[tier] || TIERS.online;

        // Swap CSS class
        Object.values(TIERS).forEach(t => el.classList.remove(t.cls));
        el.classList.add('status-badge', cfg.cls);

        const countNote = (tier === 'queued' && queueLen > 0)
            ? ` <span class="status-queue-count">(${queueLen} pending)</span>`
            : '';

        el.innerHTML = `<span class="status-icon">${cfg.icon}</span><span class="status-label">${cfg.label}${countNote}</span>`;
        el.setAttribute('title', cfg.label);
    }

    // ── Tier resolution ───────────────────────────────────────────────────────

    async function resolve() {
        const online = navigator.onLine;
        const n      = await Queue.count();

        if (!online) {
            _current = 'queued';
        } else if (_current === 'queued') {
            // Just came back online
            _current = 'online';
        }

        render(_current, n);
    }

    // ── Public setters (called by SMS/mesh modules) ───────────────────────────

    function setTier(tier, autoRevertMs = 30_000) {
        _current = tier;
        render(tier, 0);
        clearTimeout(_revertTimer);
        _revertTimer = setTimeout(resolve, autoRevertMs);
    }

    function setTierSms()  { setTier('sms');  }
    function setTierMesh() { setTier('mesh'); }

    function getCurrent() { return _current; }

    // ── Init ──────────────────────────────────────────────────────────────────

    function init() {
        resolve();
        window.addEventListener('online',  resolve);
        window.addEventListener('offline', resolve);
        Queue.onChange(() => resolve());
    }

    return { init, setTierSms, setTierMesh, getCurrent };
})();

window.StatusIndicator = StatusIndicator;
