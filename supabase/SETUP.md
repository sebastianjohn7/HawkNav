# Supabase setup gate (Phase 1B)

Do this once before live Driver/Rider GPS works. Phase 1A API does not need it.

1. Create a free project at https://supabase.com
2. Project Settings → API → copy **Project URL** and **anon public** key into repo-root `.env` and/or `mobile/.env` (see `.env.example`)
3. SQL Editor → paste and run [`schema.sql`](schema.sql)
4. Database → Publications → confirm `shuttle_positions` is in `supabase_realtime` (the SQL tries to add it)

Then start the API (`cd api && bun run dev`) and Expo (`cd mobile && npx expo start`).
