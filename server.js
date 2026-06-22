require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const webpush   = require('web-push');
const mongoose  = require('mongoose');
const twilio    = require('twilio');

const PORT = process.env.PORT || 3000;

// ─── ENVIRONMENT ──────────────────────────────────────────────────────────────

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT || 'mailto:soundalert@example.com';

const MONGO_URI         = process.env.MONGO_URI;       // required for contacts + history

const TWILIO_SID        = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH       = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM       = process.env.TWILIO_FROM_NUMBER; // E.164, e.g. +12025551234

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('[FATAL] VAPID keys missing. Run: npx web-push generate-vapid-keys');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Twilio client — optional; SMS fallback is disabled if keys are absent
const twilioClient = (TWILIO_SID && TWILIO_AUTH)
  ? twilio(TWILIO_SID, TWILIO_AUTH)
  : null;

if (!twilioClient) {
  console.warn('[SMS] Twilio credentials not set — SMS fallback disabled');
}

// ─── MONGOOSE MODELS ──────────────────────────────────────────────────────────

// Contact — a trusted person an alert gets SMS'd to
const contactSchema = new mongoose.Schema({
  name     : { type: String, required: true, trim: true },
  phone    : { type: String, required: true, trim: true },
  email    : { type: String, trim: true, default: '' },
  createdAt: { type: Date, default: Date.now },
});
const Contact = mongoose.model('Contact', contactSchema);

// AlertLog — every sent alert (all tiers) for the history view
const alertLogSchema = new mongoose.Schema({
  alertType     : String,
  alertTypeLabel: String,
  alertTypeShort: String,
  location      : String,
  lat           : Number,
  lng           : Number,
  battery       : Number,
  tier          : { type: String, enum: ['internet', 'queued', 'sms', 'mesh'], default: 'internet' },
  hopCount      : { type: Number, default: 0 },
  createdAt     : { type: Date, default: Date.now },
});
const AlertLog = mongoose.model('AlertLog', alertLogSchema);

// ─── MONGO CONNECTION ─────────────────────────────────────────────────────────

if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => console.log('[Mongo] Connected'))
    .catch(err => console.error('[Mongo] Connection failed:', err.message));
} else {
  console.warn('[Mongo] MONGO_URI not set — contacts and alert history disabled');
}

// ─── PERSISTENT PUSH SUBSCRIPTIONS ───────────────────────────────────────────

const SUBS_FILE   = path.join(__dirname, 'subscriptions.json');
let subscriptions = new Set();

function loadSubs() {
  try {
    const arr = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
    subscriptions = new Set(arr);
    console.log(`[Push] Loaded ${subscriptions.size} saved subscriptions`);
  } catch (_) {
    subscriptions = new Set();
    console.log('[Push] No saved subscriptions — starting fresh');
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
  '.html'      : 'text/html',
  '.css'       : 'text/css',
  '.js'        : 'application/javascript',
  '.json'      : 'application/json',
  '.svg'       : 'image/svg+xml',
  '.png'       : 'image/png',
  '.jpg'       : 'image/jpeg',
  '.ico'       : 'image/x-icon',
  '.mp3'       : 'audio/mpeg',
  '.webmanifest': 'application/manifest+json',
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function requireMongo(res) {
  if (!MONGO_URI || mongoose.connection.readyState !== 1) {
    json(res, 503, { error: 'Database not available' });
    return false;
  }
  return true;
}

// ─── HTTP SERVER ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const url    = req.url.split('?')[0];
  const method = req.method;

  console.log('[Server]', method, url);

  // ── Health ─────────────────────────────────────────────────────────────────
  if (url === '/health') {
    json(res, 200, {
      status     : 'ok',
      subscribers: subscriptions.size,
      peers      : wss ? wss.clients.size : 0,
      mongo      : mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      sms        : !!twilioClient,
    });
    return;
  }

  // ── Debug ──────────────────────────────────────────────────────────────────
  if (url === '/debug-subs') {
    const subs = [...subscriptions].map((subStr, idx) => {
      const sub = JSON.parse(subStr);
      return {
        id           : idx + 1,
        endpoint     : sub.endpoint ? sub.endpoint.substring(0, 60) + '...' : 'invalid',
        hasP256dh    : !!sub.keys?.p256dh,
        hasAuth      : !!sub.keys?.auth,
        endpointDomain: sub.endpoint ? new URL(sub.endpoint).hostname : 'unknown',
      };
    });
    json(res, 200, { total: subscriptions.size, subscribers: subs });
    return;
  }

  if (url === '/debug-files') {
    const publicDir = path.join(__dirname, 'public');
    let files = [];
    try { files = fs.readdirSync(publicDir); } catch (e) { files = ['ERROR: ' + e.message]; }
    json(res, 200, {
      __dirname,
      publicDir,
      publicDirExists: fs.existsSync(publicDir),
      filesInPublic  : files,
    });
    return;
  }

  // ── VAPID public key ───────────────────────────────────────────────────────
  if (url === '/vapid-public-key') {
    json(res, 200, { publicKey: VAPID_PUBLIC_KEY });
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

  // ── Broadcast (Tier 1) ─────────────────────────────────────────────────────
  if (url === '/broadcast' && method === 'POST') {
    try {
      const alert = await readBody(req);

      // Log to DB if available
      if (mongoose.connection.readyState === 1) {
        AlertLog.create({
          alertType     : alert.alertType,
          alertTypeLabel: alert.alertTypeLabel,
          alertTypeShort: alert.alertTypeShort,
          location      : alert.location,
          lat           : alert.lat,
          lng           : alert.lng,
          battery       : alert.battery,
          tier          : alert.tier || 'internet',
          hopCount      : alert.hopCount || 0,
        }).catch(e => console.warn('[AlertLog] Save failed:', e.message));
      }

      const typeLabel  = alert.alertTypeLabel || 'EMERGENCY';
      const notifTitle = `🚨 ${typeLabel.toUpperCase()} ALERT!`;
      const notifBody  = alert.location || 'Someone needs help nearby!';

      const tierNote = alert.tier === 'sms'  ? ' [SMS relay]'
                     : alert.tier === 'mesh' ? ' [Mesh relay]'
                     : '';

      const payload = JSON.stringify({
        title: notifTitle,
        body : notifBody + tierNote,
        icon : '/icon-192.png',
        badge: '/badge-72.png',
        tag  : 'emergency-' + (alert.id || Date.now()),
        requireInteraction: true,
        actions: [
          { action: 'open',    title: 'OPEN ALARM' },
          { action: 'dismiss', title: 'Dismiss'    }
        ],
        data: {
          alertType      : alert.alertType       || null,
          alertTypeLabel : alert.alertTypeLabel  || null,
          alertTypeShort : alert.alertTypeShort  || null,
          alertTypeColor : alert.alertTypeColor  || null,
          lat            : alert.lat             || null,
          lng            : alert.lng             || null,
          location       : alert.location        || 'Unknown location',
          id             : alert.id              || null,
          timestamp      : alert.timestamp       || new Date().toISOString(),
          timeFormatted  : alert.timeFormatted   || null,
          message        : alert.message         || notifTitle,
          description    : alert.description     || null,
          url: alert.lat && alert.lng
            ? `https://www.google.com/maps?q=${alert.lat},${alert.lng}`
            : '/',
        }
      });

      const deadSubs  = [];
      const promises  = [...subscriptions].map(subStr => {
        const sub = JSON.parse(subStr);
        return webpush.sendNotification(sub, payload).catch(err => {
          console.error('[Push] Send failed:', err.statusCode, err.message);
          if (err.statusCode === 410 || err.statusCode === 404) deadSubs.push(subStr);
        });
      });

      await Promise.all(promises);
      if (deadSubs.length > 0) {
        deadSubs.forEach(s => subscriptions.delete(s));
        saveSubs();
        console.log(`[Push] Removed ${deadSubs.length} expired subscriptions`);
      }

      const sent = subscriptions.size;
      console.log(`[Push] Broadcast sent to ${sent} devices`);
      json(res, 200, { success: true, sent });
    } catch (e) {
      console.error('[Push] Broadcast error:', e.message);
      json(res, 400, { error: 'Invalid alert data' });
    }
    return;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ── /api/contacts ──────────────────────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────────────────

  // GET /api/contacts — list all
  if (url === '/api/contacts' && method === 'GET') {
    if (!requireMongo(res)) return;
    try {
      const contacts = await Contact.find().sort({ createdAt: 1 });
      json(res, 200, contacts);
    } catch (e) {
      json(res, 500, { error: e.message });
    }
    return;
  }

  // POST /api/contacts — create
  if (url === '/api/contacts' && method === 'POST') {
    if (!requireMongo(res)) return;
    try {
      const { name, phone, email } = await readBody(req);
      if (!name || !phone) { json(res, 400, { error: 'name and phone are required' }); return; }
      const contact = await Contact.create({ name, phone, email });
      json(res, 201, contact);
    } catch (e) {
      json(res, 400, { error: e.message });
    }
    return;
  }

  // PUT /api/contacts/:id — update
  const contactPutMatch = url.match(/^\/api\/contacts\/([a-f0-9]{24})$/);
  if (contactPutMatch && method === 'PUT') {
    if (!requireMongo(res)) return;
    try {
      const { name, phone, email } = await readBody(req);
      const contact = await Contact.findByIdAndUpdate(
        contactPutMatch[1],
        { name, phone, email },
        { new: true, runValidators: true }
      );
      if (!contact) { json(res, 404, { error: 'Contact not found' }); return; }
      json(res, 200, contact);
    } catch (e) {
      json(res, 400, { error: e.message });
    }
    return;
  }

  // DELETE /api/contacts/:id — delete
  const contactDeleteMatch = url.match(/^\/api\/contacts\/([a-f0-9]{24})$/);
  if (contactDeleteMatch && method === 'DELETE') {
    if (!requireMongo(res)) return;
    try {
      const contact = await Contact.findByIdAndDelete(contactDeleteMatch[1]);
      if (!contact) { json(res, 404, { error: 'Contact not found' }); return; }
      json(res, 200, { success: true });
    } catch (e) {
      json(res, 500, { error: e.message });
    }
    return;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ── /api/alerts/sms — Tier 3 SMS fallback ─────────────────────────────────
  // ────────────────────────────────────────────────────────────────────────────

  if (url === '/api/alerts/sms' && method === 'POST') {
    if (!twilioClient) {
      json(res, 503, { error: 'SMS not configured', sent: 0, failed: 0 });
      return;
    }

    try {
      const alert = await readBody(req);

      // Log to DB if possible
      if (mongoose.connection.readyState === 1) {
        AlertLog.create({
          alertType     : alert.alertType,
          alertTypeLabel: alert.alertTypeLabel,
          location      : alert.location,
          lat           : alert.lat,
          lng           : alert.lng,
          battery       : alert.battery,
          tier          : 'sms',
        }).catch(() => {});
      }

      // Fetch trusted contacts
      let contacts = [];
      if (mongoose.connection.readyState === 1) {
        contacts = await Contact.find({ phone: { $exists: true, $ne: '' } });
      }

      if (contacts.length === 0) {
        json(res, 200, { sent: 0, failed: 0, reason: 'No contacts with phone numbers' });
        return;
      }

      const mapsLink = alert.lat && alert.lng
        ? `\nhttps://maps.google.com/?q=${alert.lat},${alert.lng}`
        : '';

      const body = [
        `🚨 SoundAlert EMERGENCY`,
        `Type: ${alert.alertTypeLabel || alert.alertType || 'Alert'}`,
        `Location: ${alert.location || 'Unknown'}`,
        `Time: ${alert.timeFormatted || new Date(alert.timestamp).toLocaleString()}`,
        alert.battery != null ? `Battery: ${alert.battery}%` : '',
        mapsLink,
      ].filter(Boolean).join('\n');

      let sent = 0, failed = 0;

      await Promise.all(contacts.map(async contact => {
        try {
          await twilioClient.messages.create({
            body,
            from: TWILIO_FROM,
            to  : contact.phone,
          });
          sent++;
          console.log(`[SMS] Sent to ${contact.name} (${contact.phone})`);
        } catch (err) {
          failed++;
          console.error(`[SMS] Failed to ${contact.phone}:`, err.message);
        }
      }));

      json(res, 200, { sent, failed });
    } catch (e) {
      console.error('[SMS] Error:', e.message);
      json(res, 500, { error: e.message, sent: 0, failed: 0 });
    }
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

  const filePath    = path.join(__dirname, 'public', urlPath);
  const ext         = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  console.log('[Server] Resolved path:', urlPath, '→', filePath);
  console.log('[Server] __dirname:', __dirname);
  console.log('[Server] File exists check:', fs.existsSync(filePath));

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        if (!ext || ext === '') {
          console.log('[Server] SPA fallback for route:', req.url);
          const indexPath = path.join(__dirname, 'public', 'index.html');
          fs.readFile(indexPath, (err2, indexContent) => {
            if (err2) { res.writeHead(404); res.end('404 Not Found'); }
            else      { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(indexContent); }
          });
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found: ' + req.url);
        }
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

// ─── WEBSOCKET ────────────────────────────────────────────────────────────────
const wss    = new WebSocket.Server({ server });
const peerMap = new Map();

wss.on('connection', (ws) => {
  console.log(`[WS] Client connected. Total: ${wss.clients.size}`);

  ws.on('message', (rawMessage) => {
    let data;
    try { data = JSON.parse(rawMessage); }
    catch (e) { console.error('[WS] Invalid JSON:', e.message); return; }

    if (data.from && !ws.peerId) {
      ws.peerId = data.from;
      peerMap.set(data.from, ws);
    }

    const msgStr = rawMessage.toString();

    if (data.to) {
      const target = peerMap.get(data.to);
      if (target && target.readyState === WebSocket.OPEN) target.send(msgStr);
    } else {
      wss.clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) client.send(msgStr);
      });
    }
  });

  ws.on('close', () => {
    if (ws.peerId) peerMap.delete(ws.peerId);
  });

  ws.on('error', err => console.error('[WS] Socket error:', err.message));
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
