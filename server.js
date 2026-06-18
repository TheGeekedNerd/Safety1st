const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const webpush = require('web-push');

const PORT = process.env.PORT || 3000;

// ─── VAPID ────────────────────────────────────────────────────────────────────
// Run once to generate:  npx web-push generate-vapid-keys
// Then set in .env / Render env vars.
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT || 'mailto:soundalert@example.com';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('[FATAL] VAPID keys missing. Run: npx web-push generate-vapid-keys');
  console.error('        Then add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to your .env');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ─── PERSISTENT SUBSCRIPTIONS ─────────────────────────────────────────────────
// Survives server restarts. Use a real DB (Mongo/Redis) for production.
const SUBS_FILE = path.join(__dirname, 'subscriptions.json');

let subscriptions = new Set();

function loadSubs() {
  try {
    const raw = fs.readFileSync(SUBS_FILE, 'utf8');
    const arr = JSON.parse(raw);
    subscriptions = new Set(arr);
    console.log(`[Push] Loaded ${subscriptions.size} saved subscriptions`);
  } catch (e) {
    subscriptions = new Set();
    console.log('[Push] No saved subscriptions found, starting fresh');
  }
}

function saveSubs() {
  try {
    fs.writeFileSync(SUBS_FILE, JSON.stringify([...subscriptions]));
  } catch (e) {
    console.error('[Push] Failed to save subscriptions:', e.message);
  }
}

loadSubs();

// ─── MIME TYPES ───────────────────────────────────────────────────────────────
const mimeTypes = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.mp3':  'audio/mpeg',
  '.webmanifest': 'application/manifest+json'
};

// ─── HTTP SERVER ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // ── Health check ────────────────────────────────────────────────────────────
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      subscribers: subscriptions.size,
      peers: wss ? wss.clients.size : 0
    }));
    return;
  }

  // ── VAPID public key (needed by client to subscribe) ────────────────────────
  if (req.url === '/vapid-public-key') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ publicKey: VAPID_PUBLIC_KEY }));
    return;
  }

  // ── Push subscription ────────────────────────────────────────────────────────
  if (req.url === '/subscribe' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const subscription = JSON.parse(body);

        // Basic validation
        if (!subscription.endpoint || !subscription.keys) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid subscription object' }));
          return;
        }

        const subStr = JSON.stringify(subscription);
        const isNew  = !subscriptions.has(subStr);
        subscriptions.add(subStr);
        if (isNew) saveSubs();

        console.log(`[Push] ${isNew ? 'New' : 'Re-registered'} subscriber. Total: ${subscriptions.size}`);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, total: subscriptions.size }));
      } catch (e) {
        console.error('[Push] Bad subscription body:', e.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // ── Broadcast emergency to all push subscribers ──────────────────────────────
  if (req.url === '/broadcast' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const alert = JSON.parse(body);
        console.log(`[Push] Broadcasting to ${subscriptions.size} subscribers. Type: ${alert.alertType}`);

        const typeLabel  = alert.alertTypeLabel || 'EMERGENCY';
        const notifTitle = `🚨 ${typeLabel.toUpperCase()} ALERT!`;
        const notifBody  = alert.location || 'Someone needs help nearby!';

        const payload = JSON.stringify({
          title: notifTitle,
          body:  notifBody,
          icon:  '/icon-192.png',
          badge: '/badge-72.png',
          tag:   'emergency-' + (alert.id || Date.now()),
          requireInteraction: true,
          actions: [
            { action: 'open',    title: 'OPEN ALARM' },
            { action: 'dismiss', title: 'Dismiss'    }
          ],
          data: {
            alertType:      alert.alertType      || null,
            alertTypeLabel: alert.alertTypeLabel || null,
            alertTypeShort: alert.alertTypeShort || null,
            alertTypeColor: alert.alertTypeColor || null,
            lat:            alert.lat            || null,
            lng:            alert.lng            || null,
            location:       alert.location       || 'Unknown location',
            id:             alert.id             || null,
            timestamp:      alert.timestamp      || new Date().toISOString(),
            timeFormatted:  alert.timeFormatted  || null,
            message:        alert.message        || notifTitle,
            description:    alert.description    || null,
            url: alert.lat && alert.lng
              ? `https://www.google.com/maps?q=${alert.lat},${alert.lng}`
              : '/'
          }
        });

        const deadSubs  = [];
        const promises  = [...subscriptions].map(subStr => {
          const sub = JSON.parse(subStr);
          return webpush.sendNotification(sub, payload).catch(err => {
            console.error('[Push] Send failed:', err.statusCode, err.message);
            // 410 Gone / 404 Not Found = subscription is expired, remove it
            if (err.statusCode === 410 || err.statusCode === 404) {
              deadSubs.push(subStr);
            }
          });
        });

        Promise.all(promises).then(() => {
          if (deadSubs.length > 0) {
            deadSubs.forEach(s => subscriptions.delete(s));
            saveSubs();
            console.log(`[Push] Removed ${deadSubs.length} expired subscriptions`);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, sent: subscriptions.size - deadSubs.length }));
        });

      } catch (e) {
        console.error('[Push] Broadcast error:', e.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid alert data' }));
      }
    });
    return;
  }

  // ── Static files ─────────────────────────────────────────────────────────────
  let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  filePath = path.join(__dirname, 'public', filePath);

  const ext         = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // SPA fallback
        const indexPath = path.join(__dirname, 'public', 'index.html');
        fs.readFile(indexPath, (err2, indexContent) => {
          if (err2) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(indexContent);
          }
        });
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

// ─── WEBSOCKET — P2P SIGNALING ────────────────────────────────────────────────
// FIX 1: Don't overwrite the client's own `from` field.
// FIX 2: Route targeted messages (offer/answer/ice) only to their intended peer.
// FIX 3: Track peerId → ws so targeted delivery is O(1) not O(n).

const wss = new WebSocket.Server({ server });

// Map of peerId (string) → WebSocket
const peerMap = new Map();

wss.on('connection', (ws) => {
  console.log(`[WS] Client connected. Total: ${wss.clients.size}`);

  ws.on('message', (rawMessage) => {
    let data;
    try {
      data = JSON.parse(rawMessage);
    } catch (e) {
      console.error('[WS] Invalid JSON:', e.message);
      return;
    }

    // Register peerId when we first hear from this client
    if (data.from && !ws.peerId) {
      ws.peerId = data.from;
      peerMap.set(data.from, ws);
      console.log(`[WS] Registered peer: ${data.from}. Known peers: ${peerMap.size}`);
    }

    const msgStr = rawMessage.toString();

    if (data.to) {
      // ── Targeted message (offer / answer / ice-candidate) ──────────────────
      const targetWs = peerMap.get(data.to);
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(msgStr);
      } else {
        console.warn(`[WS] Target peer not found or closed: ${data.to}`);
      }
    } else {
      // ── Broadcast message (peer-hello) ─────────────────────────────────────
      wss.clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(msgStr);
        }
      });
    }
  });

  ws.on('close', () => {
    if (ws.peerId) {
      peerMap.delete(ws.peerId);
      console.log(`[WS] Peer disconnected: ${ws.peerId}. Known peers: ${peerMap.size}`);
    } else {
      console.log('[WS] Unregistered client disconnected');
    }
  });

  ws.on('error', (err) => {
    console.error('[WS] Socket error:', err.message);
  });
});

// ─── START ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[Server] WebSocket signaling ready`);
  console.log(`[Server] Push subscribers loaded: ${subscriptions.size}`);
  console.log(`[Server] Health: http://localhost:${PORT}/health`);
});