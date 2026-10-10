-- Lock down shuttle_positions by role. Run AFTER schema.sql and profiles.sql. Safe to re-run.
-- Replaces the open demo policies from schema.sql:
--   read:  any signed-in user (visitors browse as guests, so they get no shuttle data)
--   write: drivers and admins only (stops anyone with the app key spoofing shuttle GPS)

drop policy if exists "shuttle_positions_anon_select" on public.shuttle_positions;
drop policy if exists "shuttle_positions_anon_insert" on public.shuttle_positions;
drop policy if exists "shuttle_positions_anon_update" on public.shuttle_positions;

drop policy if exists "shuttle_positions_select_signed_in" on public.shuttle_positions;
create policy "shuttle_positions_select_signed_in" on public.shuttle_positions
  for select to authenticated
  using (true);

drop policy if exists "shuttle_positions_insert_driver" on public.shuttle_positions;
create policy "shuttle_positions_insert_driver" on public.shuttle_positions
  for insert to authenticated
  with check (public.current_role_name() in ('driver', 'admin'));

drop policy if exists "shuttle_positions_update_driver" on public.shuttle_positions;
create policy "shuttle_positions_update_driver" on public.shuttle_positions
  for update to authenticated
  using (public.current_role_name() in ('driver', 'admin'))
  with check (public.current_role_name() in ('driver', 'admin'));

-- To let visitors see the shuttle later, change the select policy to: to anon, authenticated.
