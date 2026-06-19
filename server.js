const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const webpush = require('web-push');

const PORT = process.env.PORT || 3000;

// ─── VAPID ────────────────────────────────────────────────────────────────────
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT || 'mailto:soundalert@example.com';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('[FATAL] VAPID keys missing. Run: npx web-push generate-vapid-keys');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ─── PERSISTENT SUBSCRIPTIONS ─────────────────────────────────────────────────
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

  console.log('[Server] Request:', req.method, req.url);

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

  // ── Debug: list all subscribers ────────────────────────────────────────────
  if (req.url === '/debug-subs') {
    const subs = [...subscriptions].map((subStr, idx) => {
      const sub = JSON.parse(subStr);
      return {
        id: idx + 1,
        endpoint: sub.endpoint ? sub.endpoint.substring(0, 60) + '...' : 'invalid',
        hasP256dh: !!sub.keys?.p256dh,
        hasAuth: !!sub.keys?.auth,
        endpointDomain: sub.endpoint ? new URL(sub.endpoint).hostname : 'unknown'
      };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ total: subscriptions.size, subscribers: subs }));
    return;
  }

  // ── Debug: list files on disk ─────────────────────────────────────────────
  if (req.url === '/debug-files') {
    const publicDir = path.join(__dirname, 'public');
    let files = [];
    try {
      files = fs.readdirSync(publicDir);
    } catch (e) {
      files = ['ERROR: ' + e.message];
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      __dirname: __dirname,
      publicDir: publicDir,
      publicDirExists: fs.existsSync(publicDir),
      filesInPublic: files,
      indexHtmlExists: fs.existsSync(path.join(publicDir, 'index.html')),
      icon192Exists: fs.existsSync(path.join(publicDir, 'icon-192.png'))
    }));
    return;
  }

  // ── VAPID public key ────────────────────────────────────────────────────────
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

  // ── Broadcast emergency ──────────────────────────────────────────────────────
  if (req.url === '/broadcast' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const alert = JSON.parse(body);
        console.log(`[Push] Broadcasting to ${subscriptions.size} subscribers`);

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

        const deadSubs = [];
        const promises = [...subscriptions].map(subStr => {
          const sub = JSON.parse(subStr);
          return webpush.sendNotification(sub, payload).catch(err => {
            console.error('[Push] Send failed:', err.statusCode, err.message);
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
  // CRITICAL FIX: Properly resolve paths to the public directory
  let urlPath = req.url.split('?')[0];

  // Remove leading slash for path.join
  if (urlPath.startsWith('/')) {
    urlPath = urlPath.slice(1);
  }

  // Default to index.html for root
  if (urlPath === '') {
    urlPath = 'index.html';
  }

  const filePath = path.join(__dirname, 'public', urlPath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  console.log('[Server] Resolved path:', urlPath, '→', filePath);
  console.log('[Server] __dirname:', __dirname);
  console.log('[Server] File exists check:', fs.existsSync(filePath));

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Check if it's a route (no extension) → SPA fallback
        if (!ext || ext === '') {
          console.log('[Server] SPA fallback for route:', req.url);
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
          // Real file missing → 404
          console.log('[Server] 404 File not found:', filePath);
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found: ' + req.url);
        }
      } else {
        console.error('[Server] Error reading file:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Server Error');
      }
    } else {
      console.log('[Server] 200 OK:', req.url, '(' + content.length + ' bytes)');
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

// ─── WEBSOCKET ────────────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });
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

    if (data.from && !ws.peerId) {
      ws.peerId = data.from;
      peerMap.set(data.from, ws);
      console.log(`[WS] Registered peer: ${data.from}. Known peers: ${peerMap.size}`);
    }

    const msgStr = rawMessage.toString();

    if (data.to) {
      const targetWs = peerMap.get(data.to);
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(msgStr);
      } else {
        console.warn(`[WS] Target peer not found or closed: ${data.to}`);
      }
    } else {
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
  console.log(`[Server] __dirname: ${__dirname}`);

  // Check multiple possible public directory locations
  const possiblePaths = [
    path.join(__dirname, 'public'),
    path.join(__dirname, '..', 'public'),
    path.join(__dirname, '..', '..', 'public'),
    '/opt/render/project/public',
    '/opt/render/project/src/public',
    path.join(process.cwd(), 'public')
  ];

  console.log('[Server] Checking possible public directories:');
  let foundPublic = null;
  for (const p of possiblePaths) {
    const exists = fs.existsSync(p);
    console.log(`  ${exists ? '✅' : '❌'} ${p}`);
    if (exists && !foundPublic) {
      foundPublic = p;
    }
  }

  if (foundPublic) {
    console.log(`[Server] Using public directory: ${foundPublic}`);
  } else {
    console.error('[Server] WARNING: No public directory found!');
    console.error('[Server] Files will not be served. Check your deployment.');
  }

  console.log(`[Server] WebSocket signaling ready`);
  console.log(`[Server] Push subscribers loaded: ${subscriptions.size}`);
  console.log(`[Server] Health: http://localhost:${PORT}/health`);
});
