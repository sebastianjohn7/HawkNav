# How to run HawkNav (Shuttle MVP)

Everyday boot guide. Don’t commit `.env` files. Node/npm must be on your `PATH`.

---

## Install Cloudflare quick tunnel (`cloudflared`)

Phone testing needs a public HTTPS URL for the local API. `bun run dev` starts that via Cloudflare’s **quick tunnel** — no Cloudflare account or dashboard login required, just the `cloudflared` CLI.

**macOS (Homebrew):**

```bash
brew install cloudflared
cloudflared --version
```

**Other OS:** download for your platform from [Cloudflare’s install docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/), put `cloudflared` on your `PATH`, then run `cloudflared --version`.

You do **not** run `cloudflared tunnel ...` by hand for day-to-day HawkNav work — [`api/dev-with-tunnel.sh`](api/dev-with-tunnel.sh) does that when you `bun run dev`.

---

## Phone (physical device) — recommended

`cd api && bun run dev` runs [`api/dev-with-tunnel.sh`](api/dev-with-tunnel.sh): it starts a **Cloudflare quick tunnel** (`cloudflared`) to local port `8787`, writes the public `https://….trycloudflare.com` URL into `mobile/.env` as `EXPO_PUBLIC_API_URL`, then starts the Bun API. Expo reads that env — no copy/paste.

**Prerequisite:** `cloudflared` on your `PATH` (see above).

**Terminal 1 — API + Cloudflare tunnel**

```bash
cd api
bun run dev          # → ./dev-with-tunnel.sh (tunnel + API)
```

Wait until you see:

```text
Tunnel Active: https://….trycloudflare.com
Wrote EXPO_PUBLIC_API_URL into mobile/.env
```

**Terminal 2 — Expo**

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go (or press `i` / `a` for simulator).

When you stop the API (`Ctrl+C`), the script tears down the Cloudflare tunnel and restores `EXPO_PUBLIC_API_URL` to `http://localhost:8787`.

---

## Without Cloudflare (localhost only)

Use this after a fresh clone if you **don’t** install `cloudflared` and don’t need a public API URL. Simulator / Expo on the same machine can reach `http://localhost:8787`. A physical phone **cannot** use `localhost` (use Cloudflare above, or set `EXPO_PUBLIC_API_URL` to your Mac’s LAN IP on the same Wi‑Fi).

**Terminal 1 — API on localhost**

```bash
cd api
bun install
bun run dev:local    # → bun run --hot src/index.ts (no tunnel)
```

Same thing without the npm script name:

```bash
cd api
bun run --hot src/index.ts
# or (no hot reload): bun run src/index.ts
# or: bun run start
```

You should see the API on `http://localhost:8787`. Do **not** run `bun run dev` unless you have `cloudflared` — that script starts the Cloudflare tunnel.

**Terminal 2 — Expo**

```bash
cd mobile
cp .env.example .env   # first time only
# set EXPO_PUBLIC_SUPABASE_* if you use live GPS
# set:
#   EXPO_PUBLIC_API_URL=http://localhost:8787
npm install
npx expo start
```

| Script | What it does |
| --- | --- |
| `bun run dev` | Cloudflare tunnel + write `EXPO_PUBLIC_API_URL` + Bun API (needs `cloudflared`) |
| `bun run dev:local` | Bun API on localhost only — **no** Cloudflare |
| `bun run start` | Bun API on localhost (no hot reload) |

---

## Test checklist

1. **Get Started** → **Sign In** → bottom nav  
2. **Shuttle** → map shows campus; **Driver** → Start / Check in → green marker tracks live GPS  
3. **Rider** → same map updates via Realtime; pick a stop for ETA  
4. **Find** → Delta floor plan on standard map  
5. **News & Alerts** → placeholder  

Live GPS uses Supabase. Stops/ETA use the API (`EXPO_PUBLIC_API_URL`).

---

## Shut down

- Expo: `Ctrl+C` in the Expo terminal  
- API (`bun run dev`): `Ctrl+C` (stops Bun **and** the Cloudflare tunnel, restores localhost `EXPO_PUBLIC_API_URL`)  
- API (`bun run dev:local` / raw `bun`): `Ctrl+C` (API only)
