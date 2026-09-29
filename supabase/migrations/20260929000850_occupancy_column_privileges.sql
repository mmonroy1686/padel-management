-- Members see when and how a court is taken, not why or by whom. Column privileges keep note and
-- created_by out of both the API and Realtime (which applies the same privileges to the rows it
-- streams). Staff read block notes through occupancy_notes.

revoke select on public.court_occupancy from authenticated;
grant select (id, club_id, court_id, kind, period, starts_at, ends_at, created_at)
  on public.court_occupancy to authenticated;

create function public.occupancy_notes(p_club_id uuid, p_from timestamptz, p_to timestamptz)
returns table (id uuid, note text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff(p_club_id) then
    perform private.fail('forbidden');
  end if;
  return query
    select o.id, o.note
    from public.court_occupancy o
    where o.club_id = p_club_id
      and o.starts_at < p_to
      and o.ends_at > p_from
      and o.note is not null;
end;
$$;

revoke execute on function public.occupancy_notes(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.occupancy_notes(uuid, timestamptz, timestamptz) to authenticated;
