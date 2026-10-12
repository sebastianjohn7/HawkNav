-- Admin: promote / demote accounts. Run AFTER profiles.sql. Safe to re-run.
-- Rules enforced here (the app only mirrors them):
--   * only an admin can call set_admin
--   * only @uhcl.edu accounts can be promoted to admin
--   * an admin cannot demote themselves (so there is always an admin who can promote others)
--   * demoting returns the account to its normal role: student (@uhcl.edu) or visitor

-- Audit trail of who changed whom.
create table if not exists public.role_changes (
  id bigint generated always as identity primary key,
  -- Nullable so deleting the admin's account keeps the history.
  changed_by uuid references auth.users (id) on delete set null,
  target_id uuid not null references auth.users (id) on delete cascade,
  old_role public.app_role not null,
  new_role public.app_role not null,
  changed_at timestamptz not null default now()
);

alter table public.role_changes enable row level security;

drop policy if exists "role_changes_admin_select" on public.role_changes;
create policy "role_changes_admin_select" on public.role_changes
  for select to authenticated
  using (public.is_admin());

create or replace function public.set_admin(target uuid, make_admin boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  target_email text;
  old public.app_role;
  new public.app_role;
begin
  if not public.is_admin() then
    raise exception 'only an admin can change roles';
  end if;

  select email, role into target_email, old from public.profiles where id = target;
  if target_email is null then
    raise exception 'account not found';
  end if;

  if make_admin then
    if lower(target_email) not like '%@uhcl.edu' then
      raise exception 'only @uhcl.edu accounts can be made admin';
    end if;
    new := 'admin';
  else
    if target = auth.uid() then
      raise exception 'you cannot demote yourself';
    end if;
    new := case
      when lower(target_email) like '%@uhcl.edu' then 'student'::public.app_role
      else 'visitor'::public.app_role
    end;
  end if;

  update public.profiles set role = new where id = target;
  insert into public.role_changes (changed_by, target_id, old_role, new_role)
  values (auth.uid(), target, old, new);
end;
$$;

-- Callable by signed-in users only; the function itself checks for admin.
revoke execute on function public.set_admin(uuid, boolean) from public, anon;
grant execute on function public.set_admin(uuid, boolean) to authenticated;
