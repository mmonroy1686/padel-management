-- A forming match closes some minutes before it starts, not whole hours: a club can take players until 30 minutes
-- before. clubs.match_close_hours becomes match_close_minutes (3 h → 180), from 0 to 48 h like before. The two
-- places that read it (private.match_closes_at and public.close_matches) read minutes now; the rest go through
-- match_closes_at.
alter table public.clubs drop constraint clubs_match_close_hours;
alter table public.clubs rename column match_close_hours to match_close_minutes;
alter table public.clubs alter column match_close_minutes set data type integer using match_close_minutes * 60;
alter table public.clubs alter column match_close_minutes set default 180;
alter table public.clubs
  add constraint clubs_match_close_minutes check (match_close_minutes between 0 and 2880);

create or replace function private.match_closes_at(p_match public.open_matches)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select lower(p_match.period) - make_interval(mins => c.match_close_minutes)
  from public.clubs c
  where c.id = p_match.club_id;
$$;

-- Same as before, with the closing time in minutes.
create or replace function public.close_matches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.open_matches;
  v_count integer := 0;
begin
  for v_match in
    select m.* from public.open_matches m
    join public.clubs c on c.id = m.club_id
    where m.status = 'forming' and now() >= m.starts_at - make_interval(mins => c.match_close_minutes)
    for update of m skip locked
  loop
    begin
      perform private.cancel_match_row(v_match, 'not_filled');
      v_count := v_count + 1;
    exception when others then
      raise warning 'close_matches: match % failed: %', v_match.id, sqlerrm;
    end;
  end loop;
  return v_count;
end;
$$;
