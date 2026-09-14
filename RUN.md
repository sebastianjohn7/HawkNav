# How to run HawkNav (Shuttle MVP)

Everyday boot guide. Phone and Mac must be on the **same Wi‑Fi**. Use **Expo Go** on your phone.

You only need to set up Supabase once (keys in `mobile/.env`, schema already run). Don’t commit `.env` files.

---

## 1. Start the API (schedules / ETA)

Open a terminal:

```bash
cd ~/Coding/HawkNav-seb/api
bun run dev
```

Leave it open. You should see it listening on port **8787**.

Optional check on the Mac:

```bash
curl http://localhost:8787/health
```

---

## 2. Start Expo (phone app)

Open a **second** terminal:

```bash
cd ~/Coding/HawkNav-seb/mobile
npx expo start
```

Scan the QR code with Expo Go. Wait for the app to load.

If you changed `mobile/.env`, stop Expo (`Ctrl+C`) and run `npx expo start` again.

---

## 3. Test on the phone

1. **Driver** tab → **Start** → allow location → status should say **Streaming**
2. **Rider** tab → lat/lng should update every few seconds
3. Pick a stop → schedule ETA should appear (needs step 1 still running)

---

## If stops / ETA fail but GPS works

The phone cannot use `localhost`. In [`mobile/.env`](mobile/.env), set:

```text
EXPO_PUBLIC_API_URL=http://YOUR_MAC_LAN_IP:8787
```

Find your Mac’s IP:

```bash
ipconfig getifaddr en0
```

Save `.env`, restart Expo, reload the app.

Driver/Rider live GPS talks to Supabase; only schedules/ETA need the API URL.

---

## Shut down

In each terminal: `Ctrl+C`.

Next time: API → Expo → scan QR → Driver Start → Rider.
