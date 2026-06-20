# 🚨 SoundAlert — Emergency Alert System

A one-tap emergency alert system that works partially **offline** and **peer-to-peer**. Built for safety at events, campuses, and communities.

---

## 🏆 About This Project

SoundAlert was built as a solution to one of the G13 challenges at the **Youth Tech Expo G13 Hackathon**, held on **18–19 June 2026** as part of the Gauteng Department of e-Government's province-wide Youth Tech Expo G13 Hackathon Series 2026. The series brings together young innovators, government institutions, and industry partners to build practical digital solutions for Gauteng's priority service delivery challenges, aligned with the G13 priorities of the 7th Administration. SoundAlert addresses community safety, specifically rapid, peer-to-peer emergency response for GBV and crime incidents in areas where connectivity can't be relied on.

🥉 **Placed 4th out of 17 teams** at the hackathon which was held at YCWA in Soweto on the 18th and 19th of June 2026.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔴 **One-Tap Emergency** | Trigger GBV or Crime alerts instantly |
| 📡 **P2P Alerts** | WebRTC peer-to-peer broadcasts to nearby devices |
| 🔊 **Sonic Alerts** | Ultrasonic tone detection for silent triggering |
| 📲 **Push Notifications** | Web Push alerts even when the app is closed |
| 📍 **GPS Location** | Attach coordinates to every alert |
| 💬 **Team Chat** | Real-time messaging with connected peers |
| 📶 **Offline-First** | PWA works without internet once installed |
| 🔔 **Auto-Retry** | Queues failed alerts and retries when peers reconnect |

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- A modern browser (Chrome, Firefox, Safari, Edge)

### Install & Run

```bash
# Clone or navigate to the project
cd Safety1st

# Install dependencies
npm install

# Start the server
npm start
```

Open **http://localhost:3000** in your browser.

> ⚠️ For full P2P + Push features, the app must be served over **HTTPS** or **localhost**.

---

## 📁 Project Structure

```
Safety1st/
├── public/                     # Frontend assets
│   ├── index.html              # Main app shell
│   ├── style.css               # App styles (light/dark mode)
│   ├── app.js                  # PWA + Push logic
│   ├── p2p.js                  # WebRTC peer-to-peer module
│   ├── chat.js                 # P2P team chat
│   ├── emergency.js            # Emergency trigger & alarm
│   ├── gps.js                  # GPS location handling
│   ├── history.js              # Alert history
│   ├── sonic.js                # Ultrasonic tone detection
│   ├── nearby.js               # Nearby device list
│   ├── config.js                # App configuration
│   ├── sw.js                   # Service Worker
│   ├── webmanifest.json        # PWA manifest
│   └── emergency_alarm.mp3     # Alarm sound asset
│
├── server.js                   # Node.js signaling + push server
├── package.json                # Dependencies
├── render.yaml                 # Render.com deployment config
├── DEPLOY_CHECKLIST.md         # Deployment guide
└── Safety1st_Presentation.pdf  # Expo pitch deck
```

---

## 🔧 Architecture

```
┌─────────────┐      WebSocket       ┌─────────────┐
│   Browser   │ ◄──────────────────► │   Server    │
│  (Client A) │    (Signaling)       │ (Node.js)   │
└──────┬──────┘                      └─────────────┘
       │
       │ WebRTC DataChannel (P2P)
       │
┌──────┴──────┐
│  Browser    │
│  (Client B) │
└─────────────┘
```

1. **Signaling Server** — WebSocket matchmaking to establish peer connections
2. **WebRTC DataChannels** — Direct peer-to-peer alert + chat transmission
3. **Service Worker** — Background push notification handling
4. **Sonic Module** — Microphone-based tone detection for silent alerts

---

## 🛠️ Environment Variables

Create a `.env` file in the project root:

```env
# VAPID keys for Web Push
VAPID_PUBLIC_KEY=your_public_key_here
VAPID_PRIVATE_KEY=your_private_key_here
VAPID_SUBJECT=mailto:admin@example.com

# Server port
PORT=3000
```

Generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```

---

## 📱 PWA Installation

### Android (Chrome)
1. Open the app in Chrome
2. Tap **"Add to Home Screen"** in the menu
3. Launch from the home screen icon

### iOS (Safari)
1. Open the app in Safari
2. Tap the **Share** button
3. Select **"Add to Home Screen"**

### Desktop (Chrome/Edge)
1. Click the **install icon** in the address bar
2. Or use menu → **Install SoundAlert**

---

## 🧪 Testing Locally

### Test P2P Chat
1. Open `http://localhost:3000` in **two browser tabs** (or two different browsers)
2. Wait for "Connected" status on both
3. Type a message in the **Team Chat** section
4. Messages appear on both sides instantly — no server involved

### Test Push Notifications
1. Click **"📡 Test Push"** in the header
2. Minimize the browser
3. You should receive a system notification

### Test Sonic Alert
1. Click **"🔊 Test Alarm"** to verify sound
2. Enable Sonic listening via the UI
3. Play the emergency tone from another device

---

## 🚢 Deployment

### Render.com (Recommended)
1. Push code to GitHub
2. Connect repo to [Render](https://render.com)
3. Use `render.yaml` for automatic configuration
4. Add environment variables in the Render dashboard

### Manual Deployment
```bash
# Set production env vars
export NODE_ENV=production
export PORT=3000

# Start
node server.js
```

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vanilla JS, CSS3, HTML5 |
| P2P | WebRTC (RTCPeerConnection + RTCDataChannel) |
| Signaling | WebSocket (native) |
| Push | Web Push API + Service Workers |
| Audio | Web Audio API, MediaRecorder |
| GPS | Geolocation API |
| Backend | Node.js, Express |
| Hosting | Render.com |

---

## 🤝 Contributing

This project was built for a **youth expo**. To extend it:

- Add **shake-to-trigger** using `devicemotion` events
- Add **audio recording clips** via `MediaRecorder`
- Add **alert acknowledgment** ("I'm responding") pingbacks
- Add **distance filtering** using GPS coordinates

---

## 📄 License

MIT — Built for community safety. Use responsibly.

---

## 🙋 Support

For issues or questions, check:
- Browser console logs (P2P state is verbose)
- `DEPLOY_CHECKLIST.md` for deployment troubleshooting
- The **Reset SW** button in-app to fix service worker issues
