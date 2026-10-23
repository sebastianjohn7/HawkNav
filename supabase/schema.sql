-- HawkNav database setup. Run once in the Supabase SQL editor (after creating the project).
-- Safe to re-run. Schedules stay in data/shuttle CSVs; this file is accounts, roles, and live GPS.
--
-- Who gets an account: only @uhcl.edu emails. Visitors use "Continue as Visitor" (no account).
-- Roles:
--   student  - UHCL email whose name part has digits (the student ID), e.g. amerr0500@uhcl.edu
--   faculty  - UHCL email with no digits, e.g. jsmith@uhcl.edu
--   driver   - promoted by an admin
--   admin    - the first one is made in the SQL editor, the rest are promoted by an admin
--   visitor  - guests only; never stored on an account (kept in the enum for the app)

do $$
begin
  create type public.app_role as enum ('visitor', 'student', 'faculty', 'driver', 'admin');
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------- tables

-- One row per auth user. email is copied here because the app can't read auth.users.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role public.app_role not null,
  created_at timestamptz not null default now()
);

-- FR-1: one row per sign-in, written by a trigger (below), with the role at that moment.
create table if not exists public.login_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role,
  logged_in_at timestamptz not null default now()
);
-- Upgrade older installations: CREATE TABLE IF NOT EXISTS does not add columns.
-- Historical entries remain null because their role at sign-in is unknown.
alter table public.login_log
  add column if not exists role public.app_role;

create index if not exists login_log_user_idx on public.login_log (user_id);

-- Every role change (who changed whom). changed_by is null for SQL-editor changes.
create table if not exists public.role_changes (
  id bigint generated always as identity primary key,
  changed_by uuid references auth.users (id) on delete set null,
  target_id uuid not null references auth.users (id) on delete cascade,
  old_role public.app_role not null,
  new_role public.app_role not null,
  changed_at timestamptz not null default now()
);
create index if not exists role_changes_target_idx on public.role_changes (target_id);

-- Live shuttle GPS: one row per shuttle, upserted by shuttle_id.
create table if not exists public.shuttle_positions (
  id bigint generated always as identity primary key,
  shuttle_id text not null,
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  updated_at timestamptz not null default now()
);
create unique index if not exists shuttle_positions_shuttle_id_uidx
  on public.shuttle_positions (shuttle_id);

-- Realtime: ignore if the table is already in the publication.
do $$
begin
  alter publication supabase_realtime add table public.shuttle_positions;
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------- helpers

-- security definer so RLS policies can call these without recursing into profiles.
create or replace function public.current_role_name()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_role_name() = 'admin', false);
$$;

-- The role an email gets by default (and returns to when demoted): digits in the name = student.
create or replace function public.base_role_for(email text)
returns public.app_role
language sql immutable
as $$
  select case
    when split_part(lower(email), '@', 1) ~ '[0-9]' then 'student'::public.app_role
    else 'faculty'::public.app_role
  end;
$$;

-- ---------------------------------------------------------------- triggers

-- On signup: only @uhcl.edu, and the role comes from the email alone.
-- Anything the client sends in signup metadata is ignored.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.email is null or lower(new.email) not like '%@uhcl.edu' then
    raise exception 'Only @uhcl.edu emails can create an account';
  end if;

  insert into public.profiles (id, email, role)
  values (new.id, new.email, public.base_role_for(new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Every role change goes through here, however it is made.
-- Signed-in users: only an admin, never on themselves, and only to admin, driver, or the
-- email's base role (a demotion). auth.uid() is null in the SQL editor / service key, which
-- is how you make the first admin and recover from a lockout.
create or replace function public.guard_role_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  if auth.uid() is not null then
    -- change_role() is SECURITY DEFINER and bypasses RLS, so enforce MFA here too.
    if (auth.jwt()->>'aal') is distinct from 'aal2' then
      raise exception 'complete MFA before changing roles';
    end if;
    if not public.is_admin() then
      raise exception 'only an admin can change a role';
    end if;
    if new.id = auth.uid() then
      raise exception 'you cannot change your own role';
    end if;
    if new.role not in ('admin', 'driver') and new.role <> public.base_role_for(new.email) then
      raise exception 'that role is not allowed for this account';
    end if;
  end if;

  insert into public.role_changes (changed_by, target_id, old_role, new_role)
  values (auth.uid(), new.id, old.role, new.role);
  return new;
end;
$$;

drop trigger if exists profiles_guard_role_change on public.profiles;
create trigger profiles_guard_role_change
  before update on public.profiles
  for each row execute function public.guard_role_change();

-- Log each sign-in. Supabase sets last_sign_in_at on every sign-in (not on token refresh),
-- so the app needs no extra request and the log can't be skipped or forged.
create or replace function public.log_sign_in()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.login_log (user_id, role)
  values (new.id, (select role from public.profiles where id = new.id));
  return new;
end;
$$;

drop trigger if exists on_auth_user_signed_in on auth.users;
create trigger on_auth_user_signed_in
  after update of last_sign_in_at on auth.users
  for each row when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function public.log_sign_in();

-- ---------------------------------------------------------------- admin action

-- What the admin screen calls. action: 'make_admin', 'make_driver', or 'demote'.
-- The guard trigger enforces who may do what; this only picks the new role.
create or replace function public.change_role(target uuid, action text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  target_email text;
begin
  if action not in ('make_admin', 'make_driver', 'demote') then
    raise exception 'unknown action';
  end if;

  select email into target_email from public.profiles where id = target;
  if target_email is null then
    raise exception 'account not found';
  end if;

  update public.profiles
  set role = case action
    when 'make_admin' then 'admin'::public.app_role
    when 'make_driver' then 'driver'::public.app_role
    else public.base_role_for(target_email)
  end
  where id = target;
end;
$$;

revoke execute on function public.change_role(uuid, text) from public, anon;
grant execute on function public.change_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------- Row Level Security
-- (select ...) around the helpers lets Postgres evaluate them once per query, not per row.

alter table public.profiles enable row level security;
alter table public.login_log enable row level security;
alter table public.role_changes enable row level security;
alter table public.shuttle_positions enable row level security;

-- Users read their own profile (this is how the app learns the role); admins read all.
-- No one can write profiles or login_log from the app: roles change only through
-- change_role() or the SQL editor, and login_log is written by the trigger above.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "login_log_select" on public.login_log;
create policy "login_log_select" on public.login_log
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "role_changes_admin_select" on public.role_changes;
create policy "role_changes_admin_select" on public.role_changes
  for select to authenticated
  using ((select public.is_admin()));

-- Shuttle GPS: any signed-in user reads (guests get no shuttle data);
-- only drivers and admins write, so nobody can fake the shuttle's location.
-- To let guests see the shuttle later, change the select policy to: to anon, authenticated.
drop policy if exists "shuttle_positions_select_signed_in" on public.shuttle_positions;
create policy "shuttle_positions_select_signed_in" on public.shuttle_positions
  for select to authenticated
  using (true);

drop policy if exists "shuttle_positions_insert_driver" on public.shuttle_positions;
create policy "shuttle_positions_insert_driver" on public.shuttle_positions
  for insert to authenticated
  with check ((select public.current_role_name()) in ('driver', 'admin'));

drop policy if exists "shuttle_positions_update_driver" on public.shuttle_positions;
create policy "shuttle_positions_update_driver" on public.shuttle_positions
  for update to authenticated
  using ((select public.current_role_name()) in ('driver', 'admin'))
  with check ((select public.current_role_name()) in ('driver', 'admin'));


-- ---------------------------------------------------------------- MFA enforcement
-- Restrictive policies combine with the role/ownership rules above.
-- Profile reads remain available before MFA so the app can load the user's role.
-- Login records are created by the sign-in trigger, even before MFA is complete.
drop policy if exists "shuttle_requires_mfa" on public.shuttle_positions;
create policy "shuttle_requires_mfa" on public.shuttle_positions
  as restrictive for all to public
  using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');

drop policy if exists "profile_changes_require_mfa" on public.profiles;
create policy "profile_changes_require_mfa" on public.profiles
  as restrictive for update to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');

-- Older installations may still have this table; fresh installations do not.
do $mfa$
begin
  if to_regclass('public.role_allowlist') is not null then
    execute 'alter table public.role_allowlist enable row level security';
    execute 'drop policy if exists "allowlist_requires_mfa" on public.role_allowlist';
    execute 'create policy "allowlist_requires_mfa" on public.role_allowlist
      as restrictive for all to public
      using ((select auth.jwt()->>''aal'') = ''aal2'')
      with check ((select auth.jwt()->>''aal'') = ''aal2'')';
  end if;
end;
$mfa$;

drop policy if exists "login_history_requires_mfa" on public.login_log;
create policy "login_history_requires_mfa" on public.login_log
  as restrictive for select to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2');
