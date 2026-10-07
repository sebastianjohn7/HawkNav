# HawkNav

UHCL campus mobility — this clone focuses on the **Shuttle** module..

Mobile client is **Expo** under [`mobile/`](mobile/). Earlier Flutter work is archived at [`archive/mobile-flutter/`](archive/mobile-flutter/).

## Phase 1A — API only (no Supabase)

Schedules live in [`data/shuttle/`](data/shuttle/). The Bun API serves them locally.

```bash
cd api
bun install
bun run check    # validate CSVs
bun run dev      # http://localhost:8787
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

Then:

```bash
cd api
bun run dev          # API + Cloudflare tunnel; writes EXPO_PUBLIC_API_URL into mobile/.env
# other terminal:
cd mobile
npm install
npx expo start
```

For simulator-only (no tunnel): `bun run dev:local` then `npx expo start`.

- **Driver** tab streams GPS every ~4s into `shuttle_positions`
- **Rider** tab subscribes via Realtime and can call `GET /eta`

Requires [Node/npm](https://nodejs.org/), [Expo Go](https://expo.dev/go), and [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) for phone testing. See [`RUN.md`](RUN.md).

## Docs

- **Day-to-day boot:** [`RUN.md`](RUN.md)
- Archived Flutter notes: [`archive/mobile-flutter/FLUTTER_STACK.md`](archive/mobile-flutter/FLUTTER_STACK.md)
- Shuttle CSV format: [`data/shuttle/README.md`](data/shuttle/README.md)
