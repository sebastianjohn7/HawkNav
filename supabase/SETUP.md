# Supabase setup

Do this once per Supabase project. Sign-in, roles, and live Driver/Rider GPS all need it. The Phase 1A API alone does not.

Each teammate runs these in their **own** project. The SQL is not carried over by git, so a project that skips a file will be missing that part of the app.

1. Create a free project at https://supabase.com
2. Project Settings → API Keys → copy the **Project URL** and the **publishable key** (older projects call it the **anon public** key) into `mobile/.env` as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (see `mobile/.env.example`). Never use the secret / `service_role` key, and never commit `.env`.
3. SQL Editor → paste each file's contents and run, **in this order**:
   1. [`schema.sql`](schema.sql) — `shuttle_positions` (live GPS) and a `shuttle_stops` stub
   2. [`profiles.sql`](profiles.sql) — `profiles`, `role_allowlist`, `login_log`, and the signup trigger that assigns roles
   3. [`shuttle_rls.sql`](shuttle_rls.sql) — shuttle GPS: any signed-in user reads, only drivers/admins write

   All three are safe to re-run. If Supabase warns about destructive operations (the `drop policy` lines), confirm; if it offers to enable RLS on `shuttle_stops`, choose **Run and enable RLS**.
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

## What each role sees

Defined in [`mobile/lib/roles.ts`](../mobile/lib/roles.ts).

| Who | Access |
| --- | --- |
| Guest (**Continue as Visitor**, no account) and `visitor` accounts | Delta indoor map only |
| `student`, `faculty` | Shuttle (rider view), Find, Alerts |
| `driver`, `admin` | Everything above, plus the Driver GPS screen |

Shuttle GPS is locked in the database, not just hidden in the app: only `driver` and `admin` accounts can write `shuttle_positions`, so streaming GPS now needs a signed-in driver or admin account.

To require UHCL emails for sign-up later, set `UHCL_ONLY_SIGNUP = true` in `mobile/lib/roles.ts` and add the matching check to `handle_new_user()` in `profiles.sql`.

## Checking it worked

```sql
select email, role from public.profiles order by created_at;
select p.email, l.logged_in_at from public.login_log l
  join public.profiles p on p.id = l.user_id order by l.logged_in_at desc;
```
