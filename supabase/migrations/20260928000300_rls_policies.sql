-- Permissions. We revoke first so we never depend on Supabase's default
-- grants, then grant exactly what each role may attempt. RLS narrows it to rows.

revoke all on public.clubs, public.courts, public.profiles, public.club_members, public.court_occupancy
  from anon, authenticated;

grant select on public.clubs, public.courts to anon, authenticated;
grant update on public.clubs to authenticated;
grant insert, update, delete on public.courts to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.club_members to authenticated;
grant select, insert, update, delete on public.court_occupancy to authenticated;

-- Helpers. security definer so they read club_members without going through
-- its own RLS (that would recurse). They live in private, which the API does not expose.

create function private.is_club_member(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id and m.user_id = (select auth.uid())
  );
$$;

create function private.has_club_role(p_club_id uuid, p_roles public.club_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

-- True when the caller is admin or reception in a club where p_user_id is a member.
create function private.is_staff_of_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.club_members staff
    join public.club_members target on target.club_id = staff.club_id
    where staff.user_id = (select auth.uid())
      and staff.role in ('admin', 'reception')
      and target.user_id = p_user_id
  );
$$;

revoke all on function private.is_club_member(uuid) from public;
revoke all on function private.has_club_role(uuid, public.club_role[]) from public;
revoke all on function private.is_staff_of_user(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_club_member(uuid) to authenticated;
grant execute on function private.has_club_role(uuid, public.club_role[]) to authenticated;
grant execute on function private.is_staff_of_user(uuid) to authenticated;

-- clubs
create policy clubs_select_all on public.clubs
  for select to anon, authenticated using (true);
create policy clubs_update_admin on public.clubs
  for update to authenticated
  using (private.has_club_role(id, array['admin']::public.club_role[]))
  with check (private.has_club_role(id, array['admin']::public.club_role[]));

-- courts
create policy courts_select_all on public.courts
  for select to anon, authenticated using (true);
create policy courts_insert_admin on public.courts
  for insert to authenticated
  with check (private.has_club_role(club_id, array['admin']::public.club_role[]));
create policy courts_update_admin on public.courts
  for update to authenticated
  using (private.has_club_role(club_id, array['admin']::public.club_role[]))
  with check (private.has_club_role(club_id, array['admin']::public.club_role[]));
create policy courts_delete_admin on public.courts
  for delete to authenticated
  using (private.has_club_role(club_id, array['admin']::public.club_role[]));

-- profiles (created only by the auth trigger, so there is no insert policy)
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or is_public or private.is_staff_of_user(id));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- club_members
create policy club_members_select on public.club_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
  );
create policy club_members_insert_self_as_player on public.club_members
  for insert to authenticated
  with check (user_id = (select auth.uid()) and role = 'player' and not category_validated);
create policy club_members_insert_admin on public.club_members
  for insert to authenticated
  with check (private.has_club_role(club_id, array['admin']::public.club_role[]));
create policy club_members_update_admin on public.club_members
  for update to authenticated
  using (private.has_club_role(club_id, array['admin']::public.club_role[]))
  with check (private.has_club_role(club_id, array['admin']::public.club_role[]));
create policy club_members_delete_admin on public.club_members
  for delete to authenticated
  using (private.has_club_role(club_id, array['admin']::public.club_role[]));

-- court_occupancy
create policy court_occupancy_select_members on public.court_occupancy
  for select to authenticated
  using (private.is_club_member(club_id));
create policy court_occupancy_insert_staff on public.court_occupancy
  for insert to authenticated
  with check (private.has_club_role(club_id, array['admin', 'reception']::public.club_role[]));
create policy court_occupancy_insert_own_booking on public.court_occupancy
  for insert to authenticated
  with check (
    kind = 'booking'
    and created_by = (select auth.uid())
    and private.is_club_member(club_id)
  );
create policy court_occupancy_update_staff on public.court_occupancy
  for update to authenticated
  using (private.has_club_role(club_id, array['admin', 'reception']::public.club_role[]))
  with check (private.has_club_role(club_id, array['admin', 'reception']::public.club_role[]));
create policy court_occupancy_delete_staff_or_own_booking on public.court_occupancy
  for delete to authenticated
  using (
    private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
    or (kind = 'booking' and created_by = (select auth.uid()))
  );
