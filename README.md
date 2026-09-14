# HawkNav

UHCL campus mobility — this clone focuses on the **Shuttle** module.

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
data/shuttle/   # CSV schedules + stops
api/            # Bun + Hono (CSV loader + routes)
supabase/       # schema.sql — run after you create a project
mobile/         # Expo Driver + Rider — needs Supabase keys
.env.example    # placeholders only
```

## Phase 1B — Supabase setup gate (before live GPS)

You need a free Supabase project before Driver/Rider realtime works:

1. Create a project at [supabase.com](https://supabase.com)
2. Copy **Project URL** and **anon key** into a local `.env` (from [`.env.example`](.env.example)) — never commit secrets
3. In the SQL editor, run [`supabase/schema.sql`](supabase/schema.sql) (creates `shuttle_positions`, RLS demo policies, Realtime)
4. Confirm Realtime is enabled for `shuttle_positions` (Dashboard → Database → Publications, or the SQL already adds it)

Then:

```bash
cd mobile
npm install
# set EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_API_URL
npx expo start
```

- **Driver** screen streams GPS every ~4s into `shuttle_positions`
- **Rider** screen subscribes via Realtime and can call `GET /eta`

## Docs

- **Day-to-day boot:** [`RUN.md`](RUN.md)
- Shuttle CSV format: [`data/shuttle/README.md`](data/shuttle/README.md)
- Build plan: [`.cursor/plans/shuttle_mvp_scaffold.plan.md`](.cursor/plans/shuttle_mvp_scaffold.plan.md)
