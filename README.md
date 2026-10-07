# HawkNav

UHCL campus mobility — this clone focuses on the **Shuttle** module.

Mobile client is **Expo** under [`mobile/`](mobile/). Earlier Flutter work is archived at [`archive/mobile-flutter/`](archive/mobile-flutter/).

Everyday boot guide below. Don’t commit `.env` files. Node/npm must be on your `PATH`.

## Phase 1A — API only (no Supabase)

Schedules live in [`data/shuttle/`](data/shuttle/). The Bun API serves them locally.

```bash
cd api
bun install
bun run check       # validate CSVs
bun run dev:local   # http://localhost:8787 (no Cloudflare)
```

Try:

```bash
curl http://localhost:8787/health
curl 'http://localhost:8787/stops?route=on_campus'
curl 'http://localhost:8787/schedules?route=off_campus&day_group=mon_thu'
curl 'http://localhost:8787/eta?stop_id=bayou_student_entrance'
```

### Layout

```text
data/shuttle/              # CSV schedules + stops
api/                       # Bun + Hono (CSV loader + routes)
supabase/                  # schema.sql — run after you create a project
mobile/                    # Expo Driver + Rider (+ indoor GeoJSON)
archive/mobile-flutter/    # Previous Flutter / ArcGIS experiment
.env.example               # placeholders only (root)
```

## Phase 1B — Supabase setup gate (before live GPS)

You need a free Supabase project before Driver/Rider realtime works:

1. Create a project at [supabase.com](https://supabase.com)
2. Copy **Project URL** and **anon key** into `mobile/.env` (from [`mobile/.env.example`](mobile/.env.example)) as `EXPO_PUBLIC_SUPABASE_*` — never commit secrets
3. In the SQL editor, run [`supabase/schema.sql`](supabase/schema.sql) (creates `shuttle_positions`, RLS demo policies, Realtime)
4. Confirm Realtime is enabled for `shuttle_positions` (Dashboard → Database → Publications, or the SQL already adds it)

Then use **Phone (physical device)** below, or `bun run dev:local` for simulator-only.

- **Driver** tab streams GPS every ~4s into `shuttle_positions`
- **Rider** tab subscribes via Realtime and can call `GET /eta`

Requires [Node/npm](https://nodejs.org/), [Expo Go](https://expo.dev/go), and `cloudflared` for phone testing.

---

## How to run

### Install Cloudflare quick tunnel (`cloudflared`) — macOS or Windows

Phone testing needs a public HTTPS URL for the local API. Works on **both macOS and Windows**. `bun run dev` starts Cloudflare’s **quick tunnel** — no Cloudflare account or dashboard login required, just the `cloudflared` CLI plus the matching tunnel script for your OS.

| Your OS | Install `cloudflared` | Tunnel script | Set `api/package.json` `"dev"` to |
| --- | --- | --- | --- |
| **macOS / Linux** | Homebrew (below) | [`api/dev-with-tunnel.sh`](api/dev-with-tunnel.sh) | `"./dev-with-tunnel.sh"` |
| **Windows** | winget + PATH (below) | [`api/dev-with-tunnel.ps1`](api/dev-with-tunnel.ps1) | `"powershell -NoProfile -ExecutionPolicy Bypass -File ./dev-with-tunnel.ps1"` |

You do **not** run `cloudflared tunnel ...` by hand — the `.sh` or `.ps1` does that when you `bun run dev`.

**1. Install `cloudflared`**

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

**2. Point `bun run dev` at the right script**

Edit [`api/package.json`](api/package.json) so the `"dev"` script matches your machine.

macOS / Linux — use the shell script:

```json
"dev": "./dev-with-tunnel.sh"
```

Windows — use the PowerShell script:

```json
"dev": "powershell -NoProfile -ExecutionPolicy Bypass -File ./dev-with-tunnel.ps1"
```

If you switch machines (Mac ↔ Windows), update `"dev"` to the matching line above before running.

### Phone (physical device) — recommended

`cd api && bun run dev` starts a **Cloudflare quick tunnel** (`cloudflared`) to local port `8787`, writes the public `https://….trycloudflare.com` URL into `mobile/.env` as `EXPO_PUBLIC_API_URL`, then starts the Bun API. Expo reads that env — no copy/paste.

**Prerequisite:** `cloudflared` on your `PATH`, and `api/package.json` `"dev"` set to `.sh` (macOS/Linux) or `.ps1` (Windows) as above.

**Terminal 1 — API + Cloudflare tunnel**

```bash
cd api
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
npm install
npx expo start
```

Scan the QR code with Expo Go (or press `i` / `a` for simulator).

When you stop the API (`Ctrl+C`), the script tears down the Cloudflare tunnel and restores `EXPO_PUBLIC_API_URL` to `http://localhost:8787`.

### Without Cloudflare (localhost only)

Use this after a fresh clone if you **don’t** install `cloudflared` and don’t need a public API URL. Simulator / Expo on the same machine can reach `http://localhost:8787`. A physical phone **cannot** use `localhost` (use Cloudflare above, or set `EXPO_PUBLIC_API_URL` to your machine’s LAN IP on the same Wi‑Fi).

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
| `bun run dev` | Cloudflare tunnel + write `EXPO_PUBLIC_API_URL` + Bun API (needs `cloudflared`; runs `.sh` on Mac or `.ps1` on Windows per `package.json`) |
| `bun run dev:local` | Bun API on localhost only — **no** Cloudflare |
| `bun run start` | Bun API on localhost (no hot reload) |

### Test checklist

1. **Get Started** → **Sign In** → bottom nav
2. **Shuttle** → map shows campus; **Driver** → Start / Check in → green marker tracks live GPS
3. **Rider** → same map updates via Realtime; pick a stop for ETA
4. **Find** → Delta floor plan on standard map
5. **News & Alerts** → placeholder

Live GPS uses Supabase. Stops/ETA use the API (`EXPO_PUBLIC_API_URL`).

### Shut down

- Expo: `Ctrl+C` in the Expo terminal
- API (`bun run dev`): `Ctrl+C` (stops Bun **and** the Cloudflare tunnel, restores localhost `EXPO_PUBLIC_API_URL`)
- API (`bun run dev:local` / raw `bun`): `Ctrl+C` (API only)

---

## Docs

- Archived Flutter notes: [`archive/mobile-flutter/FLUTTER_STACK.md`](archive/mobile-flutter/FLUTTER_STACK.md)
- Shuttle CSV format: [`data/shuttle/README.md`](data/shuttle/README.md)
