# How to run HawkNav (Shuttle MVP)

Everyday boot guide. Don’t commit `.env` files. Node/npm must be on your `PATH`.

---

## Phone (physical device) — recommended

`bun run dev` starts the API **and** a Cloudflare quick tunnel, then writes the public URL into `mobile/.env` as `EXPO_PUBLIC_API_URL`. Expo reads that file — no copy/paste.

**Terminal 1 — API + tunnel**

```bash
cd api
bun run dev
```

Wait until you see `Tunnel Active: https://….trycloudflare.com`.

**Terminal 2 — Expo**

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go (or press `i` / `a` for simulator).

When you stop the API (`Ctrl+C`), the tunnel stops and `EXPO_PUBLIC_API_URL` is restored to `http://localhost:8787`.

---

## Simulator / Mac only (no tunnel)

```bash
cd api
bun run dev:local
```

```bash
cd mobile
npx expo start
```

`EXPO_PUBLIC_API_URL=http://localhost:8787` in `mobile/.env` is fine for the simulator.

---

## Test checklist

1. **Get Started** → **Sign In** → bottom nav  
2. **Shuttle** → map shows campus; **Driver** → Start / Check in → green marker tracks live GPS  
3. **Rider** → same map updates via Realtime; pick a stop for ETA  
4. **Find** → Delta corridor overlay on standard map  
5. **News & Alerts** → placeholder  

Live GPS uses Supabase. Stops/ETA use the API (`EXPO_PUBLIC_API_URL`).

---

## Shut down

- Expo: `Ctrl+C` in the Expo terminal  
- API: `Ctrl+C` (also stops the tunnel)
