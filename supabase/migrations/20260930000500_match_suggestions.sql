-- "Invitá a quien le puede servir": members who fit a free spot of a forming match (category, type,
-- side), are free at that time and are not in it, and who usually play then (same weekday and time,
-- bookings and confirmed matches already played) or said they are usually free then. Only the
-- players of the match and staff ask. The answer carries a name, side, category, the suggested spot
-- and the reasons as flags with a score, never the availability or history rows. Private profiles are
-- never suggested.

-- Same split as dayBandOf in lib/domain/availability.ts.
create function private.day_band_of(p_time time)
returns public.day_band
language sql
immutable
set search_path = ''
as $$
  select case
    when p_time < '13:00' then 'morning'
    when p_time < '18:00' then 'afternoon'
    else 'night'
  end::public.day_band;
$$;

create function public.match_suggestions(p_match_id uuid)
returns table (
  player_id uuid,
  display_name text,
  side public.player_side,
  category smallint,
  spot smallint,
  exact_side boolean,
  times_played integer,
  usually_free boolean,
  prefers_court boolean,
  score integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_match public.open_matches;
  v_timezone text;
  v_local timestamp;
  v_band public.day_band;
begin
  select * into v_match from public.open_matches where id = p_match_id;
  if not found then
    perform private.fail('not_found');
  end if;
  if not (private.is_match_player(v_match.id) or private.is_staff(v_match.club_id)) then
    perform private.fail('forbidden');
  end if;
  if v_match.status <> 'forming' then
    return;
  end if;

  select timezone into v_timezone from public.clubs where id = v_match.club_id;
  v_local := v_match.starts_at at time zone v_timezone;
  v_band := private.day_band_of(v_local::time);

  return query
  with open_spots as (
    select s.position, s.side from public.match_slots s
    where s.match_id = v_match.id and s.player_id is null
  ),
  candidates as (
    select p.id, p.display_name, p.side, m.category,
      (select o.position from open_spots o
        where private.match_fit(p.id, v_match, o.side) is null
        order by (o.side = p.side) desc, o.position
        limit 1) as spot
    from public.club_members m
    join public.profiles p on p.id = m.user_id
    where m.club_id = v_match.club_id
      and p.is_public
      and not exists (select 1 from public.match_slots s where s.match_id = v_match.id and s.player_id = p.id)
      and not private.is_busy(p.id, v_match.period)
  ),
  scored as (
    select c.id, c.display_name, c.side, c.category, c.spot,
      c.side = (select o.side from open_spots o where o.position = c.spot) as exact_side,
      ((select count(*) from public.bookings b
         where b.player_id = c.id and b.club_id = v_match.club_id and b.status = 'confirmed' and b.starts_at < now()
           and extract(dow from b.starts_at at time zone v_timezone) = extract(dow from v_local)
           and (b.starts_at at time zone v_timezone)::time = v_local::time)
       + (select count(*) from public.match_slots s
         join public.open_matches om on om.id = s.match_id
         where s.player_id = c.id and om.club_id = v_match.club_id and om.status = 'confirmed' and om.starts_at < now()
           and extract(dow from om.starts_at at time zone v_timezone) = extract(dow from v_local)
           and (om.starts_at at time zone v_timezone)::time = v_local::time))::integer as times_played,
      exists (
        select 1 from public.player_availability a
        where a.user_id = c.id and a.weekday = extract(dow from v_local)::smallint and a.band = v_band
      ) as usually_free,
      exists (
        select 1 from public.player_preferred_courts pc
        where pc.user_id = c.id and pc.court_id = v_match.preferred_court_id
      ) as prefers_court
    from candidates c
    where c.spot is not null
  )
  select s.id, s.display_name, s.side, s.category, s.spot, s.exact_side, s.times_played, s.usually_free,
         s.prefers_court,
         (case when s.exact_side then 30 else 18 end
          + least(25, s.times_played * 5)
          + case when s.usually_free then 20 else 0 end
          + case when s.prefers_court then 8 else 0 end)::integer
  from scored s
  where s.times_played > 0 or s.usually_free
  order by 10 desc, s.display_name
  limit 6;
end;
$$;

revoke all on function private.day_band_of(time) from public;
revoke execute on function public.match_suggestions(uuid) from public, anon;
grant execute on function public.match_suggestions(uuid) to authenticated;
