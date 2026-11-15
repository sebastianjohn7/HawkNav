# HawkNav

UHCL campus mobility app with three modules:

- **Shuttle**: live shuttle map, stops, schedules and ETAs (Rider), plus driver check-in (Driver).
- **Map**: Delta Hall indoor floor plans (Level 1 and 2) with room info, routing between rooms, and 360° photos from a room's Location card.
- **Alerts**: campus alerts. Faculty and drivers submit them for admin approval; admins post them live.

Sign-in uses Supabase with role-based access (visitor, student, faculty, driver, admin) and MFA.

Mobile client is **Expo** under [`mobile/`](mobile/). The API is **Bun + Hono** under [`api/`](api/).

Don’t commit `.env` files or secrets. Node/npm must be on your `PATH`.

## Layout

```text
data/shuttle/              # CSV schedules + stops
api/                       # Bun + Hono (CSV loader, shuttle check-in, Verizon GPS polling, ETA)
  env                      # template: copy to api/.env (see "Environment files")
supabase/                  # schema.sql + SETUP.md: run once per Supabase project
mobile/                    # Expo app: sign-in, Shuttle, Map (Delta + 360° photos), Alerts, Admin tools
  env                      # template: copy to mobile/.env
  scripts/                 # floor plan extraction + 360° photo helper scripts
PROJECT_CONTEXT.md         # full technical context for the project
```

---

## How to run

Do these in order the first time. After that, jump to **step 6** (phone) or **step 7** (localhost).

### 1. Prerequisites

- [Node/npm](https://nodejs.org/)
- [Bun](https://bun.sh) (for the API)
- Phone testing also needs Expo + `cloudflared` (steps 2 and 4)

### 2. Expo account and CLI

1. Sign up at [expo.dev/signup](https://expo.dev/signup)
2. Install **Expo Go** on your phone from the [App Store / Play Store](https://expo.dev/go)
3. Log in with the Expo CLI (`npx`, no global install required):

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

### 3. Environment files

Two template files are committed (named `env`, no dot). Copy each to a real `.env`, which git ignores:

```bash
cp mobile/env mobile/.env
cp api/env api/.env
```

| File | Variables |
| --- | --- |
| `mobile/.env` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL` (the tunnel script in step 6 sets this for you) |
| `api/.env` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (API only, never in `mobile/.env`), and the `VERIZON_*` values for live shuttle GPS (`VERIZON_APP_ID`, `VERIZON_USERNAME`, `VERIZON_PASSWORD`, `VERIZON_VEHICLE_MAP`). Ask a teammate for the Verizon values. |

Only fill in the `.env` copies, never the committed templates.

### 4. Cloudflare quick tunnel (`cloudflared`): macOS or Windows

Phone testing needs a public HTTPS URL for the local API. Works on **both macOS and Windows**. `bun run dev` starts Cloudflare’s **quick tunnel** (no Cloudflare account required, just the CLI plus the matching tunnel script for your OS).

| Your OS | Install `cloudflared` | Tunnel script | Set `api/package.json` `"dev"` to |
| --- | --- | --- | --- |
| **macOS / Linux** | Homebrew (below) | [`api/dev-with-tunnel.sh`](api/dev-with-tunnel.sh) | `"./dev-with-tunnel.sh"` |
| **Windows** | winget + PATH (below) | [`api/dev-with-tunnel.ps1`](api/dev-with-tunnel.ps1) | `"powershell -NoProfile -ExecutionPolicy Bypass -File ./dev-with-tunnel.ps1"` |

You do **not** run `cloudflared tunnel ...` by hand; the `.sh` or `.ps1` does that when you `bun run dev`.

**4a. Install `cloudflared`**

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

**4b. Point `bun run dev` at the right script**

Edit [`api/package.json`](api/package.json) so `"dev"` matches your machine (this is a local edit, don’t commit it).

macOS / Linux:

```json
"dev": "./dev-with-tunnel.sh"
```

Windows:

```json
"dev": "powershell -NoProfile -ExecutionPolicy Bypass -File ./dev-with-tunnel.ps1"
```

If you switch machines (Mac ↔ Windows), update `"dev"` to the matching line before running.

### 5. Supabase (sign-in, roles, MFA, alerts, live GPS)

Skip this if you only need schedules. You need a free Supabase project for sign-in, Driver/Rider realtime, and parking metrics:

1. Create a project at [supabase.com](https://supabase.com)
2. Copy `mobile/.env.example` → `mobile/.env` and set `EXPO_PUBLIC_SUPABASE_*` from the project **URL** and **publishable (anon) key**. Copy `api/.env.example` → `api/.env` and set `SUPABASE_URL` and `SUPABASE_ANON_KEY` for the backend API. Never commit `.env` files or put a secret / `service_role` key in the mobile app.
3. In the SQL editor, run these **in order**: [`schema.sql`](supabase/schema.sql), [`profiles.sql`](supabase/profiles.sql), [`shuttle_rls.sql`](supabase/shuttle_rls.sql), [`admin_roles.sql`](supabase/admin_roles.sql), [`parking_metrics.sql`](supabase/parking_metrics.sql). Import `data/parking_lots.csv` into `public.parking_lots` after the parking SQL if the lot rows are not already there. They are not carried over by git, so every project needs them. Full details (roles, first admin, allowlist, test accounts per role) are in [`supabase/SETUP.md`](supabase/SETUP.md)
4. Confirm Realtime is enabled for `shuttle_positions` and `parking_spot_updates` (Dashboard → Database → Publications, or the SQL already adds them)

- **Sign in** with email + password, or **Continue as Visitor** (Delta map only, no account)
- **Driver** tab (drivers and admins only) streams GPS every ~4s into `shuttle_positions`
- **Rider** tab subscribes via Realtime and can call `GET /eta`
- **Parking** tab reads `GET /parking/metrics`, grouped by lot and spot type, and refreshes on Realtime spot updates
What each role can do:

- **Visitor** (**Continue as Visitor**, no account): Map tab only
- **Student**: Shuttle, Map and Alerts (read)
- **Faculty**: same as student, plus submit alerts for admin approval
- **Driver**: same as faculty, plus the Driver screen inside the Shuttle tab
- **Admin**: everything, plus approving or posting alerts live, and **Settings → Admin tools** to promote or demote users

Accounts use a real `@uhcl.edu` email and password, then **MFA** (authenticator app) is enrolled and required at sign-in. Shuttle GPS comes from Verizon Connect: when a driver **checks in**, the API polls the shuttle’s vehicle location every 5 seconds and writes it to `shuttle_positions`. The **Rider** view subscribes via Realtime, and can call `GET /eta`.

### 6. Phone (physical device): recommended everyday boot

Starts a Cloudflare quick tunnel to port `8787`, writes `https://….trycloudflare.com` into `mobile/.env` as `EXPO_PUBLIC_API_URL`, then runs the Bun API. Expo reads that env, so there is no copy/paste.

**Before this:** steps 2 to 4 done (`cloudflared` on `PATH`, `"dev"` set to `.sh` or `.ps1`, both `.env` files created).

**Terminal 1: API + Cloudflare tunnel**

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

**Terminal 2: Expo**

```bash
cd mobile
npm install          # first time only
npx expo login       # first time only (step 2)
npx expo start
```

Scan the QR code with Expo Go (or press `i` / `a` for simulator).

When you stop the API (`Ctrl+C`), the script tears down the tunnel and restores `EXPO_PUBLIC_API_URL` to `http://localhost:8787`.

On campus wifi (`uhcl.edu`) the phone often can’t reach the dev machine. Use the phone’s hotspot instead.

### 7. Without Cloudflare (localhost / API-only)

Use this if you **don’t** need a public API URL (simulator on the same machine, or curl-only). A physical phone **cannot** use `localhost`. Use step 6, or set `EXPO_PUBLIC_API_URL` to your machine’s LAN IP on the same Wi‑Fi.

**Terminal 1: API on localhost**

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

API routes: `GET /health`, `GET /stops`, `GET /schedules`, `GET /eta`, `GET /shuttles`, `POST /shuttles/checkin`, `POST /shuttles/checkout`.

API smoke checks:

```bash
curl http://localhost:8787/health
curl 'http://localhost:8787/stops?route=on_campus'
curl 'http://localhost:8787/schedules?route=off_campus&day_group=mon_thu'
curl 'http://localhost:8787/eta?stop_id=bayou_student_entrance'
curl http://localhost:8787/shuttles
```

Do **not** run `bun run dev` unless you have `cloudflared`, since that script starts the Cloudflare tunnel.

**Terminal 2: Expo (optional)**

```bash
cd mobile
cp env .env   # first time only
# set EXPO_PUBLIC_SUPABASE_* (sign-in, alerts, live GPS)
# set:
#   EXPO_PUBLIC_API_URL=http://localhost:8787
npm install
npx expo start
```

### Script reference

| Script | What it does |
| --- | --- |
| `bun run dev` | Cloudflare tunnel + write `EXPO_PUBLIC_API_URL` + Bun API (needs `cloudflared`; runs `.sh` on Mac or `.ps1` on Windows per `package.json`) |
| `bun run dev:local` | Bun API on localhost only, **no** Cloudflare |
| `bun run start` | Bun API on localhost (no hot reload) |
| `bun run check` | Validate the shuttle CSVs |

### 8. Test checklist

1. **Get Started** → **Sign In** (or **Continue as Visitor**) → complete MFA → bottom nav
2. **Shuttle** → map shows campus; as a driver or admin, open **Driver** → **Check in** → the shuttle marker tracks live GPS
3. **Rider** → same map updates via Realtime; pick a stop for ETA
4. **Map** → Delta floor plan; switch Level 1 / Level 2, tap a room, **Route To** it, and open its 360° photos from the Location card
5. **Alerts** → faculty/driver submit an alert; admin approves it and it appears in the feed
6. **Settings** → role shown; admins see **Admin tools**

Live GPS and alerts use Supabase. Stops, schedules, ETA and check-in use the API (`EXPO_PUBLIC_API_URL`).

### 9. Shut down

- Expo: `Ctrl+C` in the Expo terminal
- API (`bun run dev`): `Ctrl+C` (stops Bun **and** the Cloudflare tunnel, restores localhost `EXPO_PUBLIC_API_URL`)
- API (`bun run dev:local` / raw `bun`): `Ctrl+C` (API only)

---

## Docs

- Supabase setup, roles and first admin: [`supabase/SETUP.md`](supabase/SETUP.md)
- Full project context: [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md)
- Mobile app notes: [`mobile/README.md`](mobile/README.md)
- Shuttle CSV format: [`data/shuttle/README.md`](data/shuttle/README.md)
