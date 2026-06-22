/* ========================================
   QUEUE — Store-and-forward (Tier 2)
   IndexedDB-backed pending alert queue.
   Flushed automatically on reconnect and
   by the service worker via Background Sync.
   ======================================== */

const Queue = (() => {
    const DB_NAME    = 'soundalert-queue';
    const DB_VERSION = 1;
    const STORE      = 'pending-alerts';

    let _db       = null;
    let _flushing = false;
    const _listeners = new Set();

    // ── DB bootstrap ──────────────────────────────────────────────────────────

    function openDB() {
        if (_db) return Promise.resolve(_db);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE, { keyPath: 'queueId' });
                }
            };
            req.onsuccess = e => { _db = e.target.result; resolve(_db); };
            req.onerror   = e => reject(e.target.error);
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────

    async function enqueue(alert) {
        const db    = await openDB();
        const entry = {
            queueId  : crypto.randomUUID(),
            tier     : 'queued',
            timestamp: new Date().toISOString(),
            ...alert,
        };
        await new Promise((resolve, reject) => {
            const tx  = db.transaction(STORE, 'readwrite');
            const req = tx.objectStore(STORE).add(entry);
            req.onsuccess = () => resolve();
            req.onerror   = e => reject(e.target.error);
        });
        _notify();
        return entry;
    }

    async function getAll() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx  = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).getAll();
            req.onsuccess = e => resolve(e.target.result);
            req.onerror   = e => reject(e.target.error);
        });
    }

    async function remove(queueId) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx  = db.transaction(STORE, 'readwrite');
            const req = tx.objectStore(STORE).delete(queueId);
            req.onsuccess = () => resolve();
            req.onerror   = e => reject(e.target.error);
        });
    }

    async function count() {
        const items = await getAll();
        return items.length;
    }

    // ── Flush ─────────────────────────────────────────────────────────────────

    async function flush() {
        if (_flushing || !navigator.onLine) return { sent: 0, failed: 0 };
        _flushing = true;

        const pending = await getAll();
        let sent = 0, failed = 0;

        for (const alert of pending) {
            try {
                const payload = { ...alert, tier: 'internet' };
                delete payload.queueId;

                const res = await fetch('/broadcast', {
                    method : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body   : JSON.stringify(payload),
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                await remove(alert.queueId);
                sent++;
            } catch (_) {
                failed++;
            }
        }

        _flushing = false;
        _notify();

        if (sent > 0) {
            console.log(`[Queue] Flushed ${sent} queued alert(s)`);
        }
        return { sent, failed };
    }

    // ── Change listeners (used by StatusIndicator) ─────────────────────────────

    function onChange(fn) {
        _listeners.add(fn);
        return () => _listeners.delete(fn);
    }

    function _notify() {
        count().then(n => _listeners.forEach(fn => fn(n)));
    }

    // ── Auto-flush on reconnect ───────────────────────────────────────────────

    window.addEventListener('online', () => {
        console.log('[Queue] Back online — flushing queue');
        flush();
    });

    return { enqueue, getAll, remove, count, flush, onChange };
})();

window.Queue = Queue;
