-- Asistente del club, part 2: who could play a free slot that has no match yet. Staff only. Like
-- match_suggestions, without a spot: members with a category and a public profile, free at that time, who played
-- that weekday within 30 minutes of that time (bookings and confirmed matches already played) or said they are
-- usually free in that band. Same weights as match_suggestions minus the side (there is no spot yet).
-- lib/domain/slot-planner.ts turns the rows into a proposal; lib/data/assistant.ts calls it once per free slot.
create function public.slot_candidates(p_court_id uuid, p_starts_at timestamptz)
returns table (
  player_id uuid,
  display_name text,
  category smallint,
  side public.player_side,
  gender public.gender,
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
  v_club_id uuid := private.active_court_club(p_court_id);
  v_timezone text;
  v_period tstzrange;
  v_local timestamp;
  v_band public.day_band;
begin
  if not private.is_staff(v_club_id) then
    perform private.fail('forbidden');
  end if;
  select timezone into v_timezone from public.clubs where id = v_club_id;
  v_period := private.slot_period(v_club_id, p_starts_at);
  v_local := lower(v_period) at time zone v_timezone;
  v_band := private.day_band_of(v_local::time);

  return query
  with members as (
    select p.id, p.display_name, m.category, p.side, p.gender
    from public.club_members m
    join public.profiles p on p.id = m.user_id
    where m.club_id = v_club_id
      and m.category is not null
      and p.is_public
      and not private.is_busy(p.id, v_period)
  ),
  played as (
    select b.player_id as id, b.starts_at
    from public.bookings b
    where b.club_id = v_club_id and b.status = 'confirmed' and b.starts_at < now() and b.player_id is not null
    union all
    select s.player_id, om.starts_at
    from public.match_slots s
    join public.open_matches om on om.id = s.match_id
    where om.club_id = v_club_id and om.status = 'confirmed' and om.starts_at < now() and s.player_id is not null
  ),
  scored as (
    select mb.id, mb.display_name, mb.category, mb.side, mb.gender,
      (select count(*) from played g
        where g.id = mb.id
          and extract(dow from g.starts_at at time zone v_timezone) = extract(dow from v_local)
          and abs(extract(epoch from ((g.starts_at at time zone v_timezone)::time - v_local::time))) <= 1800
      )::integer as times_played,
      exists (
        select 1 from public.player_availability a
        where a.user_id = mb.id and a.weekday = extract(dow from v_local)::smallint and a.band = v_band
      ) as usually_free,
      exists (
        select 1 from public.player_preferred_courts pc
        where pc.user_id = mb.id and pc.court_id = p_court_id
      ) as prefers_court
    from members mb
  )
  select s.id, s.display_name, s.category, s.side, s.gender, s.times_played, s.usually_free, s.prefers_court,
         (least(25, s.times_played * 5)
          + case when s.usually_free then 20 else 0 end
          + case when s.prefers_court then 8 else 0 end)::integer
  from scored s
  where s.times_played > 0 or s.usually_free
  order by 9 desc, s.display_name;
end;
$$;

revoke execute on function public.slot_candidates(uuid, timestamptz) from public, anon;
grant execute on function public.slot_candidates(uuid, timestamptz) to authenticated;
