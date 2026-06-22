/* ========================================
   MESH — Tier 4 BLE relay
   Receive side: Web Bluetooth (Android Chrome only)
   Send side: queued for native wrapper (Capacitor)

   WHY WEB BLUETOOTH ONLY FOR RECEIVING:
   Browsers cannot advertise BLE — only scan.
   So Phone A (no internet) queues the alert in
   IndexedDB. Phone B scans, receives via GATT
   characteristic notify, then relays to backend
   if it has signal, or re-queues if it doesn't.
   Full send-side advertising requires a native
   wrapper (Capacitor + @capacitor-community/bluetooth-le)
   or Bridgefy SDK. This module is the PWA-possible
   subset: receive + relay.
   ======================================== */

const Mesh = (() => {
    // SoundAlert custom GATT profile
    const SERVICE_UUID        = '0000ffe0-0000-1000-8000-00805f9b34fb';
    const CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';
    const MAX_HOPS = 5;

    let _device   = null;
    let _scanning = false;

    // ── Support check ─────────────────────────────────────────────────────────

    function isSupported() {
        return typeof navigator.bluetooth !== 'undefined';
    }

    // ── Scan (receive side) ───────────────────────────────────────────────────

    /**
     * Start scanning for nearby SoundAlert BLE advertisements.
     * MUST be called from a user gesture (button click).
     */
    async function startScan() {
        if (!isSupported()) {
            console.warn('[Mesh] Web Bluetooth not available on this device/browser.');
            return false;
        }
        if (_scanning) return true;

        try {
            _device = await navigator.bluetooth.requestDevice({
                filters          : [{ services: [SERVICE_UUID] }],
                optionalServices : [SERVICE_UUID],
            });

            const server  = await _device.gatt.connect();
            const service = await server.getPrimaryService(SERVICE_UUID);
            const char    = await service.getCharacteristic(CHARACTERISTIC_UUID);

            char.addEventListener('characteristicvaluechanged', _onIncoming);
            await char.startNotifications();

            _scanning = true;
            console.log('[Mesh] Scanning on device:', _device.name || '(unnamed)');

            _device.addEventListener('gattserverdisconnected', () => {
                _scanning = false;
                console.log('[Mesh] Device disconnected');
                // Auto-reconnect after 3 s
                setTimeout(startScan, 3000);
            });

            return true;
        } catch (err) {
            // User cancelled the picker → NotFoundError; not worth logging loudly
            if (err.name !== 'NotFoundError') {
                console.error('[Mesh] Scan error:', err.name, err.message);
            }
            return false;
        }
    }

    function stopScan() {
        if (_device?.gatt?.connected) _device.gatt.disconnect();
        _scanning = false;
    }

    // ── Incoming packet handler ───────────────────────────────────────────────

    async function _onIncoming(event) {
        const raw = new TextDecoder().decode(event.target.value);
        let alert;
        try {
            alert = JSON.parse(raw);
        } catch (_) {
            console.warn('[Mesh] Malformed BLE packet:', raw.slice(0, 80));
            return;
        }

        const hopCount = (alert.hopCount || 0) + 1;
        if (hopCount > MAX_HOPS) {
            console.warn('[Mesh] Max hops reached — dropping');
            return;
        }

        console.log('[Mesh] Received alert via BLE. Hops so far:', hopCount, alert);

        const relay = {
            ...alert,
            hopCount,
            tier      : 'mesh',
            relayedAt : new Date().toISOString(),
        };

        if (navigator.onLine) {
            try {
                const res = await fetch('/broadcast', {
                    method : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body   : JSON.stringify(relay),
                });
                if (res.ok) {
                    console.log('[Mesh] Alert relayed to backend');
                    if (window.StatusIndicator) StatusIndicator.setTierMesh();
                    return;
                }
            } catch (_) { /* fall through to queue */ }
        }

        // No signal — queue and let the flush loop handle it
        await Queue.enqueue(relay);
        console.log('[Mesh] No signal — relay queued');
    }

    // ── Send-side stub (hook for native wrapper) ──────────────────────────────

    function noteSend(alert) {
        // When Capacitor is added, it reads the queue from IndexedDB and
        // advertises via GATT server. This is the log point for that handoff.
        console.log('[Mesh] Alert queued for BLE broadcast (needs native layer):', alert);
        if (window.StatusIndicator) StatusIndicator.setTierMesh();
    }

    function isScanning() { return _scanning; }

    return { isSupported, startScan, stopScan, noteSend, isScanning };
})();

window.Mesh = Mesh;
