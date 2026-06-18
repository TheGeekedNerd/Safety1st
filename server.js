const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

// MIME types for static files
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

// Create HTTP server to serve static files
const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, 'public', filePath);

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
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

// WebSocket server attached to HTTP server
const wss = new WebSocket.Server({ server });

// Connected clients
const clients = new Map();
let alertHistory = [];

wss.on('connection', (ws, req) => {
  const clientId = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  clients.set(ws, {
    id: clientId,
    ip: clientIp,
    connectedAt: new Date().toISOString(),
    alerted: false
  });

  console.log(`🔌 Client connected: ${clientId} (${clients.size} total)`);

  // Send welcome + current user list
  broadcastUserList();

  // Send recent alert history (last 10)
  ws.send(JSON.stringify({
    type: 'history',
    data: alertHistory.slice(-10)
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const client = clients.get(ws);

      switch (data.type) {
        case 'alert':
          // Emergency alert received from a client
          const alert = {
            id: Date.now().toString(36),
            clientId: client.id,
            timestamp: new Date().toISOString(),
            location: data.location || '📍 Unknown location',
            lat: data.lat || null,
            lng: data.lng || null,
            message: data.message || '🚨 EMERGENCY!'
          };

          alertHistory.push(alert);
          // Keep only last 50
          if (alertHistory.length > 50) alertHistory.shift();

          console.log(`🚨 ALERT from ${client.id}: ${alert.location}`);

          // Mark this client as alerted
          client.alerted = true;

          // Broadcast to ALL connected clients (including sender)
          broadcast({
            type: 'emergency',
            data: alert
          });

          // Update user list to show alerted status
          broadcastUserList();
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        case 'cancel':
          // Cancel alert
          broadcast({
            type: 'cancel',
            clientId: client.id
          });
          client.alerted = false;
          broadcastUserList();
          break;
      }
    } catch (e) {
      console.error('Invalid message:', e.message);
    }
  });

  ws.on('close', () => {
    console.log(`🔌 Client disconnected: ${clients.get(ws)?.id}`);
    clients.delete(ws);
    broadcastUserList();
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
});

// Broadcast to all connected clients
function broadcast(message) {
  const msg = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// Broadcast user list to all clients
function broadcastUserList() {
  const userList = Array.from(clients.values()).map(c => ({
    id: c.id,
    alerted: c.alerted,
    connectedAt: c.connectedAt
  }));

  broadcast({
    type: 'users',
    count: clients.size,
    users: userList
  });
}

server.listen(PORT, () => {
  console.log(`🚨 SoundAlert server running on port ${PORT}`);
  console.log(`📡 WebSocket ready for real-time alerts`);
});
