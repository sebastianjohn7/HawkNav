# HawkNav

UHCL campus mobility — this clone focuses on the **Shuttle** module..

Mobile client is **Expo** under [`mobile/`](mobile/). Earlier Flutter work is archived at [`archive/mobile-flutter/`](archive/mobile-flutter/).

Don’t commit `.env` files. Node/npm must be on your `PATH`.

## Layout

```text
data/shuttle/              # CSV schedules + stops
api/                       # Bun + Hono (CSV loader + routes)
supabase/                  # schema.sql — run after you create a project
mobile/                    # Expo Driver + Rider (+ indoor GeoJSON)
archive/mobile-flutter/    # Previous Flutter / ArcGIS experiment
.env.example               # placeholders only (root)
```

---

## How to run

Do these in order the first time. After that, jump to **step 5** (phone) or **step 6** (localhost).

### 1. Prerequisites

- [Node/npm](https://nodejs.org/)
- [Bun](https://bun.sh) (for the API)
- Phone testing also needs Expo + `cloudflared` (steps 2–3)

### 2. Expo account and CLI

1. Sign up at [expo.dev/signup](https://expo.dev/signup)
2. Install **Expo Go** on your phone from the [App Store / Play Store](https://expo.dev/go)
3. Log in with the Expo CLI (`npx` — no global install required):

```bash
cd mobile
npm install
npx expo login
npx expo whoami    # confirm you’re logged in
```

Useful Expo commands:

```bash
cd mobile
npx expo start           # start Metro; scan QR with Expo Go
npx expo start --clear   # clear Metro cache if something’s stuck
npx expo start --ios     # iOS simulator (macOS)
npx expo start --android # Android emulator
npx expo logout          # sign out of the CLI
```

`npm start` / `npm run ios` / `npm run android` in `mobile/` map to the same scripts in [`mobile/package.json`](mobile/package.json).

### 3. Cloudflare quick tunnel (`cloudflared`) — macOS or Windows

Phone testing needs a public HTTPS URL for the local API. Works on **both macOS and Windows**. `bun run dev` starts Cloudflare’s **quick tunnel** — no Cloudflare account required, just the CLI plus the matching tunnel script for your OS.

| Your OS | Install `cloudflared` | Tunnel script | Set `api/package.json` `"dev"` to |
| --- | --- | --- | --- |
| **macOS / Linux** | Homebrew (below) | [`api/dev-with-tunnel.sh`](api/dev-with-tunnel.sh) | `"./dev-with-tunnel.sh"` |
| **Windows** | winget + PATH (below) | [`api/dev-with-tunnel.ps1`](api/dev-with-tunnel.ps1) | `"powershell -NoProfile -ExecutionPolicy Bypass -File ./dev-with-tunnel.ps1"` |

You do **not** run `cloudflared tunnel ...` by hand — the `.sh` or `.ps1` does that when you `bun run dev`.

**3a. Install `cloudflared`**

macOS (Homebrew):

```bash
brew install cloudflared
cloudflared --version
```

Windows:

1. Open PowerShell or Command Prompt and install:

```powershell
winget install --id Cloudflare.cloudflared
```

2. Add `cloudflared` to your system `Path`:
   - Press the Windows key, type `env`, open **Edit the system environment variables**
   - Click **Environment Variables…**
   - Under **System variables**, select **Path** → **Edit…**
   - Click **New** and paste:

```text
C:\Program Files (x86)\Cloudflared
```

   - Click **OK** on each window to save

3. Open a **new** terminal and verify:

```powershell
cloudflared --version
```

Other OS: download from [Cloudflare’s install docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/), put `cloudflared` on your `PATH`, then run `cloudflared --version`.

**3b. Point `bun run dev` at the right script**

Edit [`api/package.json`](api/package.json) so `"dev"` matches your machine.

macOS / Linux:

```json
"dev": "./dev-with-tunnel.sh"
```

Windows:

```json
"dev": "powershell -NoProfile -ExecutionPolicy Bypass -File ./dev-with-tunnel.ps1"
```

If you switch machines (Mac ↔ Windows), update `"dev"` to the matching line before running.

### 4. Supabase (sign-in, roles, live GPS)

Skip this if you only need schedules. You need a free Supabase project for sign-in, Driver/Rider realtime, and parking metrics:

1. Create a project at [supabase.com](https://supabase.com)
2. Copy `mobile/.env.example` → `mobile/.env` and set `EXPO_PUBLIC_SUPABASE_*` from the project **URL** and **publishable (anon) key**. Copy `api/.env.example` → `api/.env` and set `SUPABASE_URL` and `SUPABASE_ANON_KEY` for the backend API. Never commit `.env` files or put a secret / `service_role` key in the mobile app.
3. In the SQL editor, run these **in order**: [`schema.sql`](supabase/schema.sql), [`profiles.sql`](supabase/profiles.sql), [`shuttle_rls.sql`](supabase/shuttle_rls.sql), [`admin_roles.sql`](supabase/admin_roles.sql), [`parking_metrics.sql`](supabase/parking_metrics.sql). Import `data/parking_lots.csv` into `public.parking_lots` after the parking SQL if the lot rows are not already there. They are not carried over by git, so every project needs them. Full details (roles, first admin, allowlist, test accounts per role) are in [`supabase/SETUP.md`](supabase/SETUP.md)
4. Confirm Realtime is enabled for `shuttle_positions` and `parking_spot_updates` (Dashboard → Database → Publications, or the SQL already adds them)

- **Sign in** with email + password, or **Continue as Visitor** (Delta map only, no account)
- **Driver** tab (drivers and admins only) streams GPS every ~4s into `shuttle_positions`
- **Rider** tab subscribes via Realtime and can call `GET /eta`
- **Parking** tab reads `GET /parking/metrics`, grouped by lot and spot type, and refreshes on Realtime spot updates

### 5. Phone (physical device) — recommended everyday boot

Starts a Cloudflare quick tunnel to port `8787`, writes `https://….trycloudflare.com` into `mobile/.env` as `EXPO_PUBLIC_API_URL`, then runs the Bun API. Expo reads that env — no copy/paste.

**Before this:** steps 2–3 done (`cloudflared` on `PATH`, `"dev"` set to `.sh` or `.ps1`).

**Terminal 1 — API + Cloudflare tunnel**

```bash
cd api
bun install          # first time only
bun run dev          # → dev-with-tunnel.sh (Mac) or .ps1 (Windows)
```

Wait until you see:

```text
Tunnel Active: https://….trycloudflare.com
Wrote EXPO_PUBLIC_API_URL into mobile/.env
```

**Terminal 2 — Expo**

```bash
cd mobile
npm install          # first time only
npx expo login       # first time only (step 2)
npx expo start
```

Scan the QR code with Expo Go (or press `i` / `a` for simulator).

When you stop the API (`Ctrl+C`), the script tears down the tunnel and restores `EXPO_PUBLIC_API_URL` to `http://localhost:8787`.

### 6. Without Cloudflare (localhost / API-only)

Use this if you **don’t** need a public API URL (simulator on the same machine, or curl-only). A physical phone **cannot** use `localhost` — use step 5, or set `EXPO_PUBLIC_API_URL` to your machine’s LAN IP on the same Wi‑Fi.

**Terminal 1 — API on localhost**

```bash
cd api
bun install
bun run check        # optional: validate CSVs
bun run dev:local    # → bun run --hot src/index.ts (no tunnel)
```

Same thing without the npm script name:

```bash
cd api
bun run --hot src/index.ts
# or (no hot reload): bun run src/index.ts
# or: bun run start
```

API smoke checks:

```bash
curl http://localhost:8787/health
curl 'http://localhost:8787/stops?route=on_campus'
curl 'http://localhost:8787/schedules?route=off_campus&day_group=mon_thu'
curl 'http://localhost:8787/eta?stop_id=bayou_student_entrance'
```

Do **not** run `bun run dev` unless you have `cloudflared` — that script starts the Cloudflare tunnel.

**Terminal 2 — Expo (optional)**

```bash
cd mobile
cp .env.example .env   # first time only
# set EXPO_PUBLIC_SUPABASE_* if you use live GPS
# set:
#   EXPO_PUBLIC_API_URL=http://localhost:8787
npm install
npx expo start
```

### Script reference

| Script | What it does |
| --- | --- |
| `bun run dev` | Cloudflare tunnel + write `EXPO_PUBLIC_API_URL` + Bun API (needs `cloudflared`; runs `.sh` on Mac or `.ps1` on Windows per `package.json`) |
| `bun run dev:local` | Bun API on localhost only — **no** Cloudflare |
| `bun run start` | Bun API on localhost (no hot reload) |

### 7. Test checklist

1. **Get Started** → **Sign In** → bottom nav
2. **Shuttle** → map shows campus; **Driver** → Start / Check in → green marker tracks live GPS
3. **Rider** → same map updates via Realtime; pick a stop for ETA
4. **Find** → Delta floor plan on standard map
5. **News & Alerts** → placeholder

Live GPS uses Supabase. Stops/ETA use the API (`EXPO_PUBLIC_API_URL`).

### 8. Shut down

- Expo: `Ctrl+C` in the Expo terminal
- API (`bun run dev`): `Ctrl+C` (stops Bun **and** the Cloudflare tunnel, restores localhost `EXPO_PUBLIC_API_URL`)
- API (`bun run dev:local` / raw `bun`): `Ctrl+C` (API only)

---

## Docs

- Archived Flutter notes: [`archive/mobile-flutter/FLUTTER_STACK.md`](archive/mobile-flutter/FLUTTER_STACK.md)
- Shuttle CSV format: [`data/shuttle/README.md`](data/shuttle/README.md)
