# 🚨 SoundAlert — Offline-Resilient Emergency Alert System

A one-tap emergency alert system designed to keep working when the network doesn't. Built for community safety in areas where internet, cell data, and signal coverage can't be relied on.

---

## 🏆 About This Project

SoundAlert was built for the **Youth Tech Expo G13 Hackathon** (18–19 June 2026), part of the Gauteng Department of e-Government's province-wide Youth Tech Expo G13 Hackathon Series — a series tackling Gauteng's priority service-delivery challenges under the G13 priorities of the 7th Administration. SoundAlert addresses community safety: fast, multi-channel emergency response for GBV and crime incidents in areas where you can't assume connectivity.

🥉 **Placed 4th out of 17 teams** at the Soweto leg, held at YCWA on 18–19 June 2026.

Since the hackathon, the project has been extended well past the original weekend build — most of what's below didn't exist at expo time and was added afterward as a personal/portfolio project.

---

## ⚙️ How an alert actually gets out

Most emergency apps assume you have a stable connection. SoundAlert doesn't make that assumption — every alert tries multiple channels, some at the same time, some as fallbacks if earlier ones fail.

**Fired immediately, in parallel, regardless of connection:**
- **WebRTC P2P broadcast** — direct peer-to-peer alert via `RTCDataChannel`, signaled over WebSocket, with STUN/TURN for cross-network NAT traversal
- **Ultrasonic sound broadcast** — alert data encoded as a sequence of tones in the 18–20kHz range and played through the device speaker; any nearby phone with the app open and listening can decode it through its microphone, no Bluetooth or WiFi required

**Then, in order, as a fallback chain:**

| Tier | Condition | Mechanism |
|------|-----------|-----------|
| 1 | Full internet | Push broadcast via the server's `/broadcast` endpoint → Web Push to all subscribed devices |
| 2 | Offline / unstable | Alert queued in IndexedDB, retried automatically on reconnect or via Background Sync |
| 3 | Cell signal, no data | SMS sent to trusted contacts via Twilio (works on the cheapest plans, no data required) |
| 4 | No signal, devices nearby | BLE relay — receive-side is live (Web Bluetooth GATT), hopping packet-to-packet between phones until one reaches signal and relays it to the backend |

Tier 3 is attempted on every alert regardless of whether Tier 1 succeeded — it's not a last resort, it's a parallel guarantee that trusted contacts get reached even if the push broadcast already went out.

**Tier 4 honesty note:** browsers can *scan/receive* BLE advertisements but cannot *advertise* them — that's a platform limitation, not an implementation gap. So the receive-and-relay half of the mesh is fully working in the PWA; broadcasting from a phone with zero signal needs a native wrapper (Capacitor + a BLE plugin, or an SDK like Bridgefy) and is the one piece intentionally left as a stub (`Mesh.noteSend`) until that native layer exists.

---

## 🌍 What this version actually assumes — and an honest "ideal world" check

This is an offline-*resilient* system, not an offline-*proof* one — that distinction matters and is worth stating plainly rather than leaving a reader to discover it under pressure.

**In its current form, this version works reliably under what we'd call "ideal-world" conditions:**

- **At least one of the following is true at the moment of the alert:** the sender has working mobile data, OR the sender has cell signal sufficient for SMS, OR another app user is within Bluetooth/ultrasonic range with the app open.
- **No total infrastructure collapse** — i.e. not a scenario where cell towers themselves are down (no power, no battery backup left, physically damaged), since SMS still depends on a functioning tower even though it doesn't need mobile data.
- **The backend (Render + MongoDB + Twilio) is reachable** for Tiers 1–3, since all three currently route through `server.js` — including Tier 3's SMS dispatch, which is server-mediated via Twilio rather than sent natively from the device. This means Tier 3, despite "not needing data," still needs the *sender's* device to reach the internet to ask the server to send the SMS. It is not yet a true internet-independent path.
- **A genuine loadshedding-style outage** (mobile data drops for minutes to hours, signal returns later) is well covered by Tier 2's offline queue — that's the realistic, common case this app is built for, and it holds up.
- **A true blackout** — no internet anywhere nearby for anyone, AND no cell tower capacity, AND no other app user within physical range — has no path out in this version. That's not a bug to patch; it's a hard floor set by physics and infrastructure, the same floor anyone without a working phone signal would face regardless of which app they used.

**Where this is heading, to close that gap in later versions:**
- Moving Tier 3 off the server and onto a native SMS intent (via a Capacitor/TWA wrapper) so SMS works even if the sender's own internet is fully down — true cellular-only delivery.
- Completing Tier 4's send-side (the native BLE advertising stub above) so multi-hop mesh relay works without needing any internet or cell signal at all, given other nearby devices.

Presenting it this way — rather than claiming it "always works" — is a deliberate choice: a safety tool earns more trust by being precise about its own limits than by overselling a guarantee it can't keep.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔴 One-tap emergency | GBV/Femicide and Crime/Lawlessness alert types, triggered instantly |
| 📡 WebRTC P2P | Direct peer-to-peer alert + chat over `RTCDataChannel`, with a self-built WebSocket signaling layer |
| 🔊 Sonic alerts | Ultrasonic tone encoding/decoding for silent, infrastructure-free signaling |
| 📲 Push notifications | Web Push via VAPID, delivered even when the app is closed |
| 📍 Live GPS + reverse geocoding | Coordinates resolved to a human-readable address (Nominatim, with a BigDataCloud fallback) |
| 👥 Trusted contacts | CRUD-backed contact list (MongoDB) — SMS fallback alerts go to specific people |
| 📶 Offline queueing | IndexedDB-backed store-and-forward, auto-flushed on reconnect or Background Sync |
| 📱 SMS fallback | Twilio-backed SMS to trusted contacts when there's signal but no data |
| 🛰️ BLE mesh (receive) | Web Bluetooth GATT scanning + hop relay toward a connected device |
| 🔋 Battery + tier metadata | Every alert carries the sender's battery level and which tier it went out on |
| 🗒️ Alert history | Local log of sent and received alerts, with map links |
| 💬 P2P chat | Real-time messaging over the same WebRTC data channel |

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vanilla JS, CSS3, HTML5 — no framework, no build step |
| P2P | WebRTC (`RTCPeerConnection` + `RTCDataChannel`), STUN + TURN |
| Signaling | Native WebSocket (`ws`), hand-rolled offer/answer/ICE protocol |
| Push | Web Push API, VAPID, Service Worker, Background Sync |
| Offline storage | IndexedDB (alert queue) |
| Mesh | Web Bluetooth (GATT notify, receive-side) |
| Audio | Web Audio API (ultrasonic encode/decode), MediaRecorder |
| GPS | Geolocation API, Nominatim + BigDataCloud reverse geocoding |
| Backend | Node.js, Express-style raw `http` server |
| Database | MongoDB via Mongoose (contacts, alert history) |
| SMS | Twilio |
| Hosting | Render.com |

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- A modern browser (Chrome/Edge for full P2P + Bluetooth support; Safari/Firefox work for push + SMS paths)

### Install & Run

```bash
git clone https://github.com/TheGeekedNerd/Safety1st.git
cd Safety1st
npm install
npm start
```

Open **http://localhost:3000**.

> ⚠️ P2P, push, and Bluetooth all require a secure context — **HTTPS or `localhost` only**.

### Environment variables

Create a `.env` in the project root:

```env
# Required — push notifications
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
VAPID_SUBJECT=mailto:you@example.com

# Optional — enables trusted contacts + alert history
MONGO_URI=your_mongodb_connection_string

# Optional — enables SMS fallback (Tier 3)
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+1xxxxxxxxxx

PORT=3000
```

Generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```

Mongo and Twilio are optional — the server runs without them, with contacts/history/SMS disabled and a console warning rather than a crash.

---

## 📁 Project Structure

```
Safety1st/
├── public/
│   ├── index.html          # App shell
│   ├── style.css            # Styles
│   ├── app.js                # PWA bootstrap, SW registration, push subscription
│   ├── config.js              # Tunable constants (cooldowns, timeouts, limits)
│   ├── emergency.js           # Alert trigger + tiered fallback orchestration
│   ├── p2p.js                  # WebRTC signaling + data channel P2P
│   ├── sonic.js                  # Ultrasonic encode/decode
│   ├── mesh.js                    # BLE mesh (Tier 4, receive-side)
│   ├── queue.js                     # IndexedDB store-and-forward (Tier 2)
│   ├── contacts.js                   # Trusted contacts CRUD UI
│   ├── status-indicator.js            # Connection/tier status badge
│   ├── nearby.js                       # Nearby devices display
│   ├── gps.js                           # Geolocation + reverse geocoding
│   ├── history.js                        # Alert history log
│   └── sw.js                              # Service Worker
├── server.js                # HTTP + WebSocket signaling + push + SMS + Mongo backend
├── package.json
├── render.yaml               # Render.com deploy config
└── DEPLOY_CHECKLIST.md
```

---

## 🧪 Testing locally

**P2P + chat:** open two tabs/browsers at `localhost:3000`, wait for "Connected," send a chat message — it goes peer-to-peer, server only handled signaling.

**Push:** click **📡 Test Push** in the header, minimize the browser, confirm the system notification fires.

**Sonic:** click **🔊 Test Alarm** on one device, enable sonic listening on another nearby device, then trigger an alert — the second device should decode the tone sequence and surface the alert.

**Offline queue:** trigger DevTools → Network → Offline, fire an alert, confirm it lands in IndexedDB (Application tab), then go back online and watch it flush.

**SMS:** add a trusted contact with a Twilio-verified number, trigger an alert, confirm delivery (subject to Twilio trial restrictions if not upgraded).

---

## 🚢 Deployment

Deployed on **Render.com** — `render.yaml` handles build/start config. Add the same environment variables from `.env` to the Render dashboard; they don't carry over from local automatically.

---

## 🛣️ Roadmap / what's intentionally unfinished

- **BLE mesh send-side** — needs a native wrapper (Capacitor) to advertise from a zero-signal device; currently a stub
- **Native SMS dispatch** — move Tier 3 off the server-mediated Twilio call onto a native SMS intent, so it works even when the sender's own internet is down
- **Duress cancel PIN** — two-PIN system (real cancel vs. silent fake-cancel) — planned, not yet built
- **Continuous location during an active alert** — currently a single GPS snapshot per alert
- **Alert escalation timer** — auto-retry/escalate if an alert goes unacknowledged

---

## 📄 License

MIT — built for community safety. Use responsibly.
