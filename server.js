const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

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
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', type: 'signaling-server' }));
    return;
  }

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

// WebSocket signaling server - just forwards messages between peers
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const clientId = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
  console.log(`🔌 Signaling client connected: ${clientId} (${wss.clients.size} total)`);

  ws.clientId = clientId;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      data.from = clientId; // Tag with sender ID

      // Broadcast to ALL other clients (not sender)
      const msg = JSON.stringify(data);
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      });

    } catch (e) {
      console.error('Invalid signaling message:', e.message);
    }
  });

  ws.on('close', () => {
    console.log(`🔌 Client disconnected: ${clientId}`);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
});

server.listen(PORT, () => {
  console.log(`🚨 SoundAlert Signaling Server running on port ${PORT}`);
  console.log(`📡 This server only exchanges connection info - data flows P2P!`);
});
