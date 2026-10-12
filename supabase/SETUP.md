# Supabase setup

Do this once per Supabase project. Sign-in, roles, and live Driver/Rider GPS all need it. The Phase 1A API alone does not.

Each teammate runs these in their **own** project. The SQL is not carried over by git, so a project that skips a file will be missing that part of the app.

1. Create a free project at https://supabase.com
2. Project Settings → API Keys → copy the **Project URL** and the **publishable key** (older projects call it the **anon public** key) into `mobile/.env` as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (see `mobile/.env.example`). Never use the secret / `service_role` key, and never commit `.env`.
3. SQL Editor → paste each file's contents and run, **in this order**:
   1. [`schema.sql`](schema.sql) — `shuttle_positions` (live GPS) and a `shuttle_stops` stub
   2. [`profiles.sql`](profiles.sql) — `profiles`, `role_allowlist`, `login_log`, and the signup trigger that assigns roles
   3. [`shuttle_rls.sql`](shuttle_rls.sql) — shuttle GPS: any signed-in user reads, only drivers/admins write
   4. [`admin_roles.sql`](admin_roles.sql) — `set_admin()` so admins can promote / demote accounts from the app, plus a `role_changes` log

   All four are safe to re-run. If Supabase warns about destructive operations (the `drop policy` lines), confirm; if it offers to enable RLS on `shuttle_stops`, choose **Run and enable RLS**.
4. Database → Publications → confirm `shuttle_positions` is in `supabase_realtime` (the SQL tries to add it)
5. For testing, turn off Authentication → Providers → Email → **Confirm email** (turn it back on for the demo).

Then start the API (`cd api && bun run dev`, optional — only the ETA needs it) and Expo (`cd mobile && npx expo start`).

## Roles

Roles: `visitor`, `student`, `faculty`, `driver`, `admin`.

At signup the role is set by a database trigger from the email only:

1. Email in `role_allowlist` → that role
2. Ends with `@uhcl.edu` → `student`
3. Anything else → `visitor`

Roles are set when the account is created, so add driver / admin / faculty emails to `role_allowlist` **before** they sign up:

```sql
insert into public.role_allowlist (email, role) values
  ('driver@example.com', 'driver'),
  ('you@uhcl.edu', 'admin')
on conflict (email) do nothing;
```

To change an account that already exists, or to make the **first admin** (nobody else can promote one yet):

```sql
update public.profiles set role = 'admin' where email = 'you@uhcl.edu';
```

Only admins (or the SQL editor) can change roles; the app can't. Faculty have `@uhcl.edu` emails, so they come out as `student` unless allowlisted; they have the same access as students.

## Test accounts (one per role)

Create these to try every role. First add the allowlist rows (SQL editor), **then** sign up each account in the app (**Get Started → New here? Create an account**) with a password you choose.

```sql
insert into public.role_allowlist (email, role) values
  ('faculty.test@uhcl.edu', 'faculty'),
  ('driver.test@uhcl.edu',  'driver'),
  ('admin.test@uhcl.edu',   'admin')
on conflict (email) do nothing;
```

| Email to sign up with | Role you get | Why |
| --- | --- | --- |
| `visitor.test@example.com` | `visitor` | Non-UHCL email, not allowlisted |
| `student.test@uhcl.edu` | `student` | `@uhcl.edu`, not allowlisted |
| `faculty.test@uhcl.edu` | `faculty` | Allowlisted |
| `driver.test@uhcl.edu` | `driver` | Allowlisted |
| `admin.test@uhcl.edu` | `admin` | Allowlisted; `@uhcl.edu`, so it can also be demoted/promoted from Admin tools |

With **Confirm email** off (step 5 above) these made-up addresses sign up instantly; with it on, only real inboxes work. You can also try **Continue as Visitor** with no account.

Accounts and passwords live only in your Supabase project, not in git. If the team shares one project, share the passwords privately (never in the repo). Delete test accounts from Authentication → Users before the demo.

## Checking it worked

```sql
select email, role from public.profiles order by created_at;
select p.email, l.logged_in_at from public.login_log l
  join public.profiles p on p.id = l.user_id order by l.logged_in_at desc;
```
