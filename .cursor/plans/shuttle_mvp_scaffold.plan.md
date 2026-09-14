---
name: Shuttle MVP scaffold
overview: "API-first Shuttle MVP without requiring Supabase yet: fill stop coords, Bun CSV loader + schedule/ETA routes, then a clear Supabase setup gate before live driver/rider GPS."
todos:
  - id: repo-plan-copy
    content: Write expanded plan to HawkNav-seb/.cursor/plans/shuttle_mvp_scaffold.plan.md
    status: completed
  - id: fill-stop-coords
    content: Fill missing lat/lng for bay_area_park_ride, united_way_houston, coastal_flow, anytime_fitness, heb; bump meta.csv
    status: pending
  - id: hono-csv-api
    content: Scaffold api/ with CSV loader/validator + GET /health /stops /schedules /eta (next-departure); no Supabase client required
    status: pending
  - id: env-readme-api
    content: Add .env.example + README for API-only run (Bun); document Supabase as Phase 1B prerequisite
    status: pending
  - id: supabase-setup-gate
    content: "Manual: create free Supabase project; copy URL + anon key to .env; run schema.sql; enable Realtime on shuttle_positions"
    status: pending
  - id: supabase-schema
    content: Add supabase/schema.sql for shuttle_positions + realtime (+ optional shuttle_stops stub)
    status: pending
  - id: expo-mobile
    content: Scaffold mobile/ Driver GPS upsert + Rider realtime + ETA stop picker (after Supabase keys exist)
    status: pending
isProject: false
---

# Shuttle MVP scaffold (deepened, API-first)

Continues where you left off: **step 0 CSVs are done**. You do **not** have a Supabase project yet — so this plan ships value without it first, then gates live GPS on setup.

**Plan home:** [`HawkNav-seb/.cursor/plans/shuttle_mvp_scaffold.plan.md`](shuttle_mvp_scaffold.plan.md) (repo copy).

## Already done

[`data/shuttle/`](../../data/shuttle/) lean CSVs:

- `meta.csv` — `term`, `updated_at`, `name`, `email`
- `stops.csv` — `stop_id`, `name`, `lat`, `lng`, `routes`, `status`
- `off_campus.csv` / `on_campus.csv` / `pearland.csv` — `day_group`, `stop_id`, `times`
- Loader/validator belongs in the Bun API ([`data/shuttle/README.md`](../../data/shuttle/README.md))

## Constraint

**No Supabase project yet.** Phase 1A does not call Supabase. Phase 1B starts only after you create a project and paste keys into gitignored `.env`.

## Layout (shallow)

```text
HawkNav-seb/
  .cursor/plans/shuttle_mvp_scaffold.plan.md
  data/shuttle/     # DONE (+ fill missing coords)
  api/              # Phase 1A — Bun + Hono (CSV only)
  supabase/         # Phase 1B — schema.sql (ready before or at gate)
  mobile/           # Phase 1B — Expo after keys exist
  .env.example
  README.md
```

## Data flow

```mermaid
flowchart LR
  subgraph phase1a [Phase1A_no_Supabase]
    CSVs["data/shuttle CSVs"] --> HonoApi["Bun Hono api"]
    Client["curl_or_later_Expo"] -->|"GET /stops /schedules /eta"| HonoApi
  end
  subgraph phase1b [Phase1B_after_setup]
    DriverPhone["Driver Expo"] -->|"upsert every 3-5s"| Supabase["shuttle_positions"]
    Supabase -->|"Realtime WS"| RiderApp["Rider Expo"]
    RiderApp -->|"GET /eta"| HonoApi
  end
```

---

## Phase 1A — no Supabase required

### 0. Stop coordinates

- Fill empty lat/lng: `bay_area_park_ride`, `united_way_houston`, `coastal_flow`, `anytime_fitness`, `heb`
- Leave `tmc` inactive; bump `meta.csv` `updated_at`

### 1. API — `api/`

Bun + Hono, shallow `src/`. **CSV only** — no Supabase client in this phase.

- **`csv.ts`** — parse + validate `meta`, `stops`, route CSVs
- **`GET /health`** — ok + `term` / `updated_at`
- **`GET /stops`** — active stops (optional `?route=`)
- **`GET /schedules`** — `?route=off_campus|on_campus|pearland` + optional `day_group`
- **`GET /eta?stop_id=`** — next departure for today in `America/Chicago`
- `bun run dev`

### 2. Docs for API-only

- `.env.example` + `README.md` for API-only; Supabase marked Phase 1B

**Exit criteria:** curl `/health`, `/stops`, `/schedules`, `/eta` work with no cloud account.

---

## Phase 1B — Supabase setup gate, then live GPS

### 3. Manual setup (you do this once)

1. Create a free project at supabase.com
2. Copy Project URL + anon key into `.env` (never commit)
3. Run `supabase/schema.sql` in the SQL editor
4. Enable Realtime for `shuttle_positions`

### 4. Schema — `supabase/schema.sql`

- Table `shuttle_positions` + Realtime + MVP RLS
- Optional empty `shuttle_stops` stub; schedules stay on CSVs

### 5. Expo — `mobile/`

Driver GPS upsert + Rider realtime + ETA stop picker after keys exist.

---

## Out of scope (later)

Mapbox / nearest-stop UI, background GPS hardening, multi-shuttle shifts, historical moving-average ETA, Cloudflare tunnels, Auth/2FA.
