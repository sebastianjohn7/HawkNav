# Supabase setup

Do this once per Supabase project (ideally one shared project for the team).

## Setup

1. Create a free project at [supabase.com](https://supabase.com).
2. Project Settings → API Keys → copy the **Project URL** and **publishable key** into `mobile/.env` as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. Also copy those two into `api/.env`. Then copy the **service_role** secret (or “secret” key) into `api/.env` only as `SUPABASE_SERVICE_ROLE_KEY`. The API uses that key to write shuttle GPS. Do not put the service role key in `mobile/.env` or commit it.
4. SQL Editor → paste all of [`schema.sql`](schema.sql) → **Run** (confirm any warning). It includes the MFA policies and is safe to re-run. Re-running also migrates alert audience from `students|staff|all` → `staff|all` (any old `students` rows become `all`).
5. Authentication → Sign In / Providers → Email → password **minimum 8**, require **lowercase, uppercase, digits, symbols**.
6. Authentication → Providers → Email → **Confirm email**: off while testing, **on** for the demo and real use. The built-in sender allows only ~2 emails/hour, so real use needs custom SMTP.
7. Database → Publications → confirm `shuttle_positions`, `alerts`, and `alert_comments` are in `supabase_realtime` (the SQL tries to add them)

## If driver check-in says Supabase upsert 401 / permission denied

The Bun API must write with the service role key in `api/.env`:

```env
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret
```

Restart `bun run dev` after saving. Do not grant insert/update on `shuttle_positions` to `anon` just to make the API work.

If the status says **Supabase read 403** after that key is set, grant the service role table access in the SQL editor:

```sql
grant select, insert, update, delete on table public.shuttle_positions to service_role;
```
## Accounts and roles

Everyone uses a real `@uhcl.edu` email. No preset or test accounts.

| Who | How they get in |
| --- | --- |
| Visitor | **Continue as Visitor** (no account); Delta map only |
| Student | Create account; name has digits (ex. `amerr0500@uhcl.edu`) |
| Faculty | Create account; name has no digits |
| Driver | An admin promotes a UHCL account |
| Admin | First one via SQL below, then admins promote others |

The database sets the role from the email, and only admins can change it.
**First admin:** sign up in the app, then run:
```sql
update public.profiles set role = 'admin' where email = 'you@uhcl.edu';
```
After that, use **Settings → Admin tools → Manage users** to promote or demote. Admins can't change their own role.

## Check it worked

```sql
select email, role from public.profiles;                  -- accounts and roles
select * from public.login_log order by logged_in_at desc; -- every sign-in
select * from public.role_changes;                        -- every promotion/demotion
select id, title, audience, status, urgency, effective_at, expires_at from public.alerts;
select alert_id, body, created_at from public.alert_comments order by created_at desc;
```

## Start over

Wipes everything (**including all accounts**). Run it, then run `schema.sql` again.
Use this only if you ran older versions of these files (`profiles.sql`, `shuttle_rls.sql`), since they left shuttle GPS writable by anyone.

```sql
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_signed_in on auth.users;
drop table if exists public.alert_comments, public.alerts, public.login_log, public.role_changes, public.profiles,
  public.shuttle_positions, public.shuttle_stops, public.role_allowlist cascade;
drop function if exists public.change_role(uuid, text);
drop function if exists public.set_admin(uuid, boolean);
drop function if exists public.is_admin();
drop function if exists public.is_alert_staff();
drop function if exists public.can_read_alert(bigint);
drop function if exists public.current_role_name();
drop function if exists public.base_role_for(text);
drop function if exists public.handle_new_user();
drop function if exists public.guard_role_change();
drop function if exists public.block_role_change();
drop function if exists public.log_sign_in();
drop function if exists public.set_login_role();
drop type if exists public.alert_urgency;
drop type if exists public.alert_status;
drop type if exists public.alert_audience;
drop type if exists public.app_role;
delete from auth.users;
```

## If the app says "permission denied for table profiles"

The table exists, but the signed-in role was never granted access. In the SQL editor run:

```sql
grant usage on schema public to anon, authenticated;
grant usage on type public.app_role to authenticated;
grant usage on type public.alert_audience to authenticated;
grant usage on type public.alert_status to authenticated;
grant usage on type public.alert_urgency to authenticated;
grant select on table public.profiles to authenticated;
grant select on table public.login_log to authenticated;
grant select on table public.role_changes to authenticated;
grant select, insert, update on table public.shuttle_positions to authenticated;
grant select, insert, update on table public.alerts to authenticated;
grant select, insert on table public.alert_comments to authenticated;
grant execute on function public.current_role_name() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_read_alert(bigint) to authenticated;
grant execute on function public.is_alert_staff() to authenticated;
grant execute on function public.base_role_for(text) to authenticated;
```

Or re-run all of `schema.sql` (it now includes these grants).

## MFA verification

For an existing database using the current schema, re-run schema.sql to install the MFA policies.
The mobile changes alone do not install database policies.

1. Sign in with an account without an authenticator. Start enrollment and add
   the displayed setup key to Duo Mobile. An incorrect code must stay on setup;
   a correct code must open the app.
2. Restart the app midway through enrollment. Start enrollment again and use the
   new setup key, replacing the old unfinished entry in Duo.
3. Sign out and sign back in. The app should request a code without enrolling again.
4. Use "Back to sign in" from enrollment and verification to return to login.
5. With a signed-in client before MFA (aal1), shuttle and alerts reads should return no
   rows and writes should fail. After MFA (aal2), existing role restrictions
   still apply: students can read shuttle/alerts feed; drivers/admins write shuttle;
   faculty/drivers insert pending alerts; admins approve or post alerts live.
6. Profile reads remain available before MFA, and the sign-in trigger records logins because
   startup and password sign-in happen before MFA verification. The login log records password sign-in,
   not proof that MFA was completed.

Run database access checks with ordinary user tokens, not the SQL editor or a
service-role key, which bypass row-level security.
