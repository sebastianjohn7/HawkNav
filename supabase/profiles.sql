-- HawkNav roles / profiles (RBAC)
-- Run in the Supabase SQL editor (after schema.sql). Safe to re-run.
-- Roles: visitor, student, faculty, driver, admin.
-- The role is decided on the server at signup and can only be changed by an admin.

do $$
begin
  create type public.app_role as enum ('visitor', 'student', 'faculty', 'driver', 'admin');
exception
  when duplicate_object then null;
end $$;

-- One row per auth user.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role public.app_role not null default 'visitor',
  created_at timestamptz not null default now()
);

-- Emails with a fixed role (faculty, drivers, admins). Checked before the domain rule.
-- Only admins can read or edit it; users never see it.
create table if not exists public.role_allowlist (
  email text primary key,
  role public.app_role not null
);

-- FR-1: record login activity. The app inserts one row after each successful sign-in.
create table if not exists public.login_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_in_at timestamptz not null default now()
);

-- Helpers. security definer so RLS policies can call them without recursing into profiles.
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

-- On signup: allowlist wins, then @uhcl.edu = student, everyone else = visitor.
-- Only the email is used; anything the client sends in signup metadata is ignored.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  picked public.app_role;
begin
  select role into picked
    from public.role_allowlist
    where lower(email) = lower(new.email);

  if picked is null then
    picked := case
      when lower(new.email) like '%@uhcl.edu' then 'student'::public.app_role
      else 'visitor'::public.app_role
    end;
  end if;

  insert into public.profiles (id, email, role)
  values (new.id, new.email, picked);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS can't limit which columns a user edits, so block role changes in a trigger.
-- auth.uid() is null in the SQL editor / service key, which is how you seed admins.
create or replace function public.block_role_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'only an admin can change a role';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_block_role_change on public.profiles;
create trigger profiles_block_role_change
  before update on public.profiles
  for each row execute function public.block_role_change();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.role_allowlist enable row level security;
alter table public.login_log enable row level security;

-- Users read their own profile (this is how the app learns the role); admins read all.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Users may edit their own row (role changes are blocked by the trigger above).
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "allowlist_admin_all" on public.role_allowlist;
create policy "allowlist_admin_all" on public.role_allowlist
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "login_log_insert_own" on public.login_log;
create policy "login_log_insert_own" on public.login_log
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "login_log_select" on public.login_log;
create policy "login_log_select" on public.login_log
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Test accounts: add emails here BEFORE the person signs up, e.g.
--   insert into public.role_allowlist (email, role) values
--     ('driver@example.com', 'driver'),
--     ('admin@example.com',  'admin'),
--     ('prof@uhcl.edu',      'faculty');
-- For an account that already exists, promote it from the SQL editor:
--   update public.profiles set role = 'admin' where email = 'you@example.com';
