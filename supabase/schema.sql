-- HawkNav shuttle_positions (Phase 1B)
-- Run in the Supabase SQL editor after creating a project.
-- Schedules stay in data/shuttle CSVs; this table is live GPS only.

create table if not exists public.shuttle_positions (
  id bigint generated always as identity primary key,
  shuttle_id text not null,
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  updated_at timestamptz not null default now()
);

-- One row per shuttle for upsert-by-shuttle_id demos
create unique index if not exists shuttle_positions_shuttle_id_uidx
  on public.shuttle_positions (shuttle_id);

-- Optional stub for later seed from stops.csv (unused by Phase 1A API)
create table if not exists public.shuttle_stops (
  stop_id text primary key,
  name text not null,
  lat double precision,
  lng double precision,
  routes text,
  status text not null default 'active'
);

-- Realtime: add table to publication (ignore if already added)
do $$
begin
  alter publication supabase_realtime add table public.shuttle_positions;
exception
  when duplicate_object then null;
end $$;

-- MVP RLS: allow anon insert/select for demo.
-- Production should tighten to driver write / student read via authenticated roles.
alter table public.shuttle_positions enable row level security;

drop policy if exists "shuttle_positions_anon_select" on public.shuttle_positions;
create policy "shuttle_positions_anon_select"
  on public.shuttle_positions
  for select
  to anon, authenticated
  using (true);

drop policy if exists "shuttle_positions_anon_insert" on public.shuttle_positions;
create policy "shuttle_positions_anon_insert"
  on public.shuttle_positions
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "shuttle_positions_anon_update" on public.shuttle_positions;
create policy "shuttle_positions_anon_update"
  on public.shuttle_positions
  for update
  to anon, authenticated
  using (true)
  with check (true);
