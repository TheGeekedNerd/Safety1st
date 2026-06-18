# SoundAlert Deployment Checklist

## Files to Update

Replace these files in your public/ folder:

1. index.html
2. app.js
3. p2p.js
4. emergency.js
5. sw.js
6. server.js
7. webmanifest.json
8. nearby.js

## New Files to Add

Copy these to your public/ folder:

- icon-192.png
- icon-512.png
- badge-72.png

## Critical: HTTPS Required

Android Chrome REQUIRES HTTPS for:
- Service Worker registration
- Push notifications
- PWA install prompt

If testing locally, use ngrok:
    npx ngrok http 3000

Then open the https:// URL on your phone.

## Steps After Deploy

1. Clear ALL site data on phones:
   Chrome → Settings → Privacy → Clear browsing data → Advanced → Select All time → Clear

2. Reload the app via HTTPS URL

3. Check DevTools Console for:
   [App] PWA Requirements Check:
     - HTTPS: true
     - Service Worker: true
     - Push Manager: true
     - Manifest: true
     - Has 192x192 icon: true
     - Has 512x512 icon: true

4. If all checks pass, wait 30 seconds of interaction, then:
   - Install prompt should appear OR
   - Chrome menu → "Add to Home screen"

5. Grant notification permission when prompted

6. Press "📡 Test Push" button
   - Should show notification on ALL devices

## If Install Prompt Still Doesn't Show

- Chrome requires 30 seconds of user engagement before showing prompt
- User must have interacted with page (scrolled, clicked)
- If user previously dismissed prompt, Chrome won't show again for a while
- Check chrome://flags/#enable-desktop-pwas on desktop for testing

## If Notifications Still Don't Show on Phone

1. Check phone's Android Settings → Apps → Chrome → Notifications → Allow
2. Check Android Settings → Battery → Battery Optimization → Chrome → Don't optimize
3. Check that phone is not in Do Not Disturb mode
4. Try sending test push from laptop while phone screen is ON
5. Check server logs for subscriber count and send status
