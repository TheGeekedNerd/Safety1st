const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const webpush = require('web-push');

const PORT = process.env.PORT || 3000;

// ============================================
// VAPID KEYS for Push Notifications
// Generate once with: npx web-push generate-vapid-keys
// ============================================
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BEl62iSMf-VZBdg3Zp5DzR7U8C4r-KB0fG0x_1f0x_1f0x_1f0x_1f0x_1f0x_1f0x';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'x_1f0x_1f0x_1f0x_1f0x_1f0x_1f0x_1f0x_1f0x';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:soundalert@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Store push subscriptions
const subscriptions = new Set();

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', subscribers: subscriptions.size }));
    return;
  }

  // Get VAPID public key
  if (req.url === '/vapid-public-key') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ publicKey: VAPID_PUBLIC_KEY }));
    return;
  }

  // Subscribe to push notifications
  if (req.url === '/subscribe' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const subscription = JSON.parse(body);
        subscriptions.add(JSON.stringify(subscription));
        console.log('🔔 New push subscriber! Total:', subscriptions.size);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400);
        res.end('Invalid subscription');
      }
    });
    return;
  }

  // Send push notification to all subscribers
  if (req.url === '/broadcast' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const alert = JSON.parse(body);
        console.log('📡 Broadcasting push to', subscriptions.size, 'subscribers');

        const payload = JSON.stringify({
          title: '🚨 EMERGENCY ALERT!',
          body: alert.location || 'Someone needs help nearby!',
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          tag: 'emergency-' + alert.id,
          requireInteraction: true,
          actions: [
            { action: 'open', title: 'View Location' },
            { action: 'dismiss', title: 'Dismiss' }
          ],
          data: {
            lat: alert.lat,
            lng: alert.lng,
            url: alert.lat && alert.lng 
              ? `https://www.google.com/maps?q=${alert.lat},${alert.lng}`
              : '/'
          }
        });

        // Send to all subscribers
        const promises = Array.from(subscriptions).map(subStr => {
          const sub = JSON.parse(subStr);
          return webpush.sendNotification(sub, payload).catch(err => {
            console.error('Push failed:', err.statusCode);
            // Remove invalid subscriptions
            if (err.statusCode === 410 || err.statusCode === 404) {
              subscriptions.delete(subStr);
            }
          });
        });

        Promise.all(promises).then(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, sent: subscriptions.size }));
        });

      } catch (e) {
        res.writeHead(400);
        res.end('Invalid alert data');
      }
    });
    return;
  }

  // Static files
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, 'public', filePath);

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
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

// WebSocket for real-time (P2P signaling + Sonic is client-side)
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const clientId = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
  console.log(`🔌 Client connected: ${clientId} (${wss.clients.size} total)`);

  ws.clientId = clientId;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      data.from = clientId;

      // Forward to all other clients (P2P signaling)
      const msg = JSON.stringify(data);
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      });
    } catch (e) {
      console.error('Invalid message:', e.message);
    }
  });

  ws.on('close', () => {
    console.log(`🔌 Client disconnected: ${clientId}`);
  });
});

server.listen(PORT, () => {
  console.log(`🚨 SoundAlert server running on port ${PORT}`);
  console.log(`📡 WebSocket ready for P2P signaling`);
  console.log(`🔔 Push notifications: ${subscriptions.size} subscribers`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});
