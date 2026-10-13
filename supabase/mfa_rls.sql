-- Run after schema.sql, profiles.sql, and shuttle_rls.sql.
-- Restrictive policies AND with existing role/ownership policies.
-- Keep profile reads and login_log inserts available during password sign-in.
begin;

alter table public.shuttle_positions enable row level security;
alter table public.profiles enable row level security;
alter table public.role_allowlist enable row level security;
alter table public.login_log enable row level security;

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

drop policy if exists "allowlist_requires_mfa" on public.role_allowlist;
create policy "allowlist_requires_mfa" on public.role_allowlist
  as restrictive for all to public
  using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');

drop policy if exists "login_history_requires_mfa" on public.login_log;
create policy "login_history_requires_mfa" on public.login_log
  as restrictive for select to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2');

commit;
