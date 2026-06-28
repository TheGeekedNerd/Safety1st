#  SoundAlert: Local-Network Emergency Alert System

A one-tap emergency alert system built for community safety on a shared local network. Alerts go out instantly to every other device on the same WiFi, with location attached.

---

##  About This Project

SoundAlert was built for the **Youth Tech Expo G13 Hackathon** (18 to 19 June 2026), part of the Gauteng Department of e-Government's province-wide Youth Tech Expo G13 Hackathon Series. The series tackles Gauteng's priority service-delivery challenges under the G13 priorities of the 7th Administration. SoundAlert addresses community safety: fast emergency response for GBV and crime incidents within a shared local network.

 **Placed 4th out of 17 teams** at the Soweto leg, held at YCWA on 18 to 19 June 2026.

Since the hackathon, the project has been extended well past the original weekend build. Most of what's below didn't exist at expo time and was added afterward as a personal/portfolio project.

---

##  How an alert actually gets out

SoundAlert is built around a shared local WiFi network. Every device on that network is reachable through the server, and an alert reaches all of them in real time, with the sender's location attached.

**On trigger:**
- The sender's GPS location is captured and reverse-geocoded to a human-readable address (Nominatim, with a BigDataCloud fallback)
- The alert is sent to the server, which pushes it out to every other connected device on the network. The sender is deliberately excluded from receiving their own alert back (see the safety note below)
- **WebRTC P2P broadcast:** a direct peer-to-peer copy of the alert is also sent via `RTCDataChannel`, signaled over WebSocket, for devices already peer-connected on the same network
- **Ultrasonic sound broadcast:** the alert is also encoded as a sequence of tones in the 18 to 20kHz range and played through the device speaker, so any nearby phone with the app open and listening can decode it through its microphone alone, without needing to be on the same WiFi

**If the network connection drops mid-send:**
- The alert is queued in IndexedDB and automatically retried as soon as the device reconnects to the network, including via Background Sync if the app is closed

---

## What this version actually assumes, and an honest "ideal world" check

This version is built around one core assumption, stated plainly rather than left for someone to discover under pressure: **everyone is on the same local WiFi network.** There is no SMS, no cellular fallback, and no internet-wide delivery in this version. It is a local-network-and-location tool, not a wide-area one.

**For this version to work as designed, the following all need to be true:**

- The sender's device and the recipients' devices are connected to **the same local WiFi network** (e.g. a shared community/event network, a home router, a campus network).
- The server (and, if used, the signaling/WebSocket layer for P2P) is reachable on that same network.
- Location services are enabled and granted on the sender's device, since the location attached to the alert depends entirely on the Geolocation API succeeding.
- For the ultrasonic path specifically: recipient devices have the app open with listening active, and are within normal speaker to microphone range (a few meters, no major background noise or barriers).

**What this version genuinely does well within that scope:**
- Real-time delivery to every other device on the network the moment an alert fires. No polling delay, no waiting for connectivity to "come back," since the network is assumed present throughout.
- The sender never receives their own alert back, and never hears or feels anything on their own device when sending. Confirmed safe for scenarios where the phone needs to stay silent and hidden.
- A brief WiFi hiccup (not a full network outage) is handled gracefully by the offline queue, which retries automatically the moment the connection returns.

**What this version does not cover, and isn't trying to:**
- Anyone not on the same local network cannot receive an alert through the server or push path. There's no cellular or wide-area path in scope here.
- If the local network itself goes down entirely (router failure, no power to the access point), the server-routed and P2P-signaled paths are both unreachable until it's restored. The ultrasonic path is the one channel that doesn't depend on the network at all, but it's short-range and condition-sensitive by nature.
- If location services are off or denied, the alert still sends, but without a location attached. Recipients get notified that help is needed, without knowing where.

Scoping it this way, one network, with location, done well, is a deliberate and honest choice for this version, rather than a claim of broader coverage the system doesn't actually have.

---

##  Features

| Feature | Description |
|---------|-------------|
|  One-tap emergency | GBV/Femicide and Crime/Lawlessness alert types, triggered instantly |
|  WebRTC P2P | Direct peer-to-peer alert + chat over `RTCDataChannel`, with a self-built WebSocket signaling layer |
|  Sonic alerts | Ultrasonic tone encoding/decoding for silent, network-free signaling between nearby devices |
|  Push notifications | Web Push via VAPID, delivered to every other device on the network even when the app is closed |
|  Live GPS + reverse geocoding | Coordinates resolved to a human-readable address (Nominatim, with a BigDataCloud fallback) |
|  Trusted contacts | CRUD-backed contact list (MongoDB) for reference during an incident |
|  Offline queueing | IndexedDB-backed store-and-forward, auto-flushed on reconnect or Background Sync if the network briefly drops |
|  Alert history | Local log of sent and received alerts, with map links |
| 💬 P2P chat | Real-time messaging over the same WebRTC data channel |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vanilla JS, CSS3, HTML5. No framework, no build step |
| P2P | WebRTC (`RTCPeerConnection` + `RTCDataChannel`), STUN + TURN |
| Signaling | Native WebSocket (`ws`), hand-rolled offer/answer/ICE protocol |
| Push | Web Push API, VAPID, Service Worker, Background Sync |
| Offline storage | IndexedDB (alert queue) |
| Audio | Web Audio API (ultrasonic encode/decode), MediaRecorder |
| GPS | Geolocation API, Nominatim + BigDataCloud reverse geocoding |
| Backend | Node.js, Express-style raw `http` server |
| Database | MongoDB via Mongoose (contacts, alert history) |
| Hosting | Render.com |

---

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- A modern browser (Chrome/Edge for full P2P support; Safari/Firefox work for the push path)
- All devices on the **same local WiFi network**

### Install & Run

```bash
git clone https://github.com/TheGeekedNerd/Safety1st.git
cd Safety1st
npm install
npm start
```

Open **http://localhost:3000** on each device connected to the same network.

> P2P and push both require a secure context: **HTTPS or `localhost` only**.

### Environment variables

Create a `.env` in the project root:

```env
# Required: push notifications
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
VAPID_SUBJECT=mailto:you@example.com

# Optional: enables trusted contacts + alert history
MONGO_URI=your_mongodb_connection_string

PORT=3000
```

Generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```

Mongo is optional. The server runs without it, with contacts/history disabled and a console warning rather than a crash.

---

## Project Structure

```
Safety1st/
├── Demonstration/             # Screenshots and demo images for the pitch/README
│   ├── icon-512.png
│   ├── Screenshot 2026-06-19 030935.png
│   ├── Screenshot 2026-06-19 030941.png
│   ├── Screenshot 2026-06-19 030948.png
│   ├── Screenshot 2026-06-19 031012.png
│   ├── WhatsApp Image 2026-06-19 at 03.12.14.jpeg
│   ├── WhatsApp Image 2026-06-19 at 03.12.15.jpeg
│   └── WhatsApp Image 2026-06-19 at 04.46.43.jpeg
├── public/
│   ├── index.html              # App shell
│   ├── style.css                # Styles
│   ├── chat-styles.css           # P2P chat panel styles
│   ├── app.js                     # PWA bootstrap, SW registration, push subscription
│   ├── config.js                   # Tunable constants (cooldowns, timeouts, limits)
│   ├── emergency.js                 # Alert trigger + tiered fallback orchestration
│   ├── p2p.js                        # WebRTC signaling + data channel P2P
│   ├── chat.js                        # P2P chat UI, sends over the WebRTC data channel
│   ├── sonic.js                        # Ultrasonic encode/decode
│   ├── mesh.js                          # BLE mesh (receive-side)
│   ├── queue.js                          # IndexedDB store-and-forward (reconnect retry)
│   ├── contacts.js                        # Trusted contacts CRUD UI
│   ├── status-indicator.js                 # Connection/tier status badge
│   ├── nearby.js                            # Nearby devices display
│   ├── gps.js                                # Geolocation + reverse geocoding
│   ├── history.js                             # Alert history log
│   ├── sw.js                                   # Service Worker
│   ├── webmanifest.json                          # PWA manifest
│   ├── emergency_alarm.mp3                        # Alarm sound (receiving devices only)
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── badge-72.png
│   └── DEPLOY_CHECKLIST.md                          # Pre-deploy checklist for this folder
├── server.js                   # HTTP + WebSocket signaling + push + Mongo backend
├── subscriptions.json           # Persisted push subscriptions (deviceId + endpoint pairs)
├── package.json
├── package-lock.json
├── render.yaml                   # Render.com deploy config
├── Safety1st_Presentation.pdf      # Hackathon pitch deck
├── .env                              # Local secrets (VAPID keys, Mongo URI). Not committed
└── .gitignore
```

---

## Testing locally

**P2P + chat:** open two tabs/browsers at `localhost:3000`, wait for "Connected," send a chat message. It goes peer-to-peer; the server only handled signaling.

**Push:** click **📡 Test Push** in the header, minimize the browser, confirm the system notification fires.

**Sonic:** click **🔊 Test Alarm** on one device, enable sonic listening on another nearby device, then trigger an alert. The second device should decode the tone sequence and surface the alert.

**Offline queue:** open DevTools, go to Network, set it to Offline, fire an alert, confirm it lands in IndexedDB (Application tab), then go back online and watch it flush.

---

## Deployment

Deployed on **Render.com**. `render.yaml` handles build/start config. Add the same environment variables from `.env` to the Render dashboard; they don't carry over from local automatically.

---

## 🛣️ Roadmap / what's intentionally unfinished

- **Wide-area delivery beyond the local network:** currently out of scope; this version is local-WiFi-only by design
- **Duress cancel PIN:** two-PIN system (real cancel vs. silent fake-cancel), planned but not yet built
- **Continuous location during an active alert:** currently a single GPS snapshot per alert
- **Alert escalation timer:** auto-retry/escalate if an alert goes unacknowledged

---

## 📄 License

MIT. Built for community safety. Use responsibly.
