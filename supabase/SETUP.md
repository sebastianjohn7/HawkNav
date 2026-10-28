# Supabase setup

Do this once per Supabase project (ideally one shared project for the team).

## Setup

1. Create a free project at [supabase.com](https://supabase.com).
2. Project Settings → API Keys → copy the **Project URL** and **publishable key** into `mobile/.env` as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` 
3. SQL Editor → paste all of [`schema.sql`](schema.sql) → **Run** (confirm any warning). 
4. Authentication → Sign In / Providers → Email → password **minimum 8**, require **lowercase, uppercase, digits, symbols**.
5. Authentication → Email → **Confirm email**: off while testing, **on** for real use. The built-in sender allows only ~2 emails/hour, so real use needs custom SMTP.

   schema.sql includes the MFA policies and is safe to re-run.
   
6. Database → Publications → confirm `shuttle_positions` is in `supabase_realtime` (the SQL tries to add it)
7. For testing, turn off Authentication → Providers → Email → **Confirm email** (turn it back on for the demo).
## Accounts and roles

Everyone uses a real `@uhcl.edu` email. No preset or test accounts.

| Who | How they get in |
| --- | --- | --- |
| Visitor | **Continue as Visitor** (no account) | Delta map only |
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
```

## Start over

Wipes everything (**including all accounts**). Run it, then run `schema.sql` again.
Use this only if you ran older versions of these files (`profiles.sql`, `shuttle_rls.sql`), since they left shuttle GPS writable by anyone.

```sql
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_signed_in on auth.users;
drop table if exists public.login_log, public.role_changes, public.profiles,
  public.shuttle_positions, public.shuttle_stops, public.role_allowlist cascade;
drop function if exists public.change_role(uuid, text);
drop function if exists public.set_admin(uuid, boolean);
drop function if exists public.is_admin();
drop function if exists public.current_role_name();
drop function if exists public.base_role_for(text);
drop function if exists public.handle_new_user();
drop function if exists public.guard_role_change();
drop function if exists public.block_role_change();
drop function if exists public.log_sign_in();
drop function if exists public.set_login_role();
drop type if exists public.app_role;
delete from auth.users;
```

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
5. With a signed-in client before MFA (aal1), shuttle reads should return no
   rows and writes should fail. After MFA (aal2), existing role restrictions
   still apply: students can read, drivers/admins can write.
6. Profile reads remain available before MFA, and the sign-in trigger records logins because
   startup and password sign-in happen before MFA verification. The login log records password sign-in,
   not proof that MFA was completed.

Run database access checks with ordinary user tokens, not the SQL editor or a
service-role key, which bypass row-level security.
