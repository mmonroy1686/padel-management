-- Asistente del club, part 3: reception or admin open a match on a free slot, with its four spots free, and then
-- invite players to it (invite_to_match). Same rules as create_match except the ones about the creator playing
-- (fit, busy): the staff member does not take a spot. created_by is the staff member. Nothing else reads
-- created_by as "a player of the match": leaving, the avisos and "Mis partidos" all go by match_slots.
-- A lock per court and slot keeps a double submit (or two receptionists at once) from opening two forming
-- matches on the same court and time: a forming match does not hold the court, so court_occupancy alone
-- would not see it.
create function public.staff_create_match(
  p_court_id uuid,
  p_starts_at timestamptz,
  p_allow_other_court boolean,
  p_category_min integer,
  p_category_max integer,
  p_match_type public.match_type
)
returns public.open_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_club_id uuid := private.active_court_club(p_court_id);
  v_club public.clubs;
  v_match public.open_matches;
begin
  if v_uid is null or not private.is_staff(v_club_id) then
    perform private.fail('forbidden');
  end if;
  if p_allow_other_court is null or p_match_type is null
     or p_category_min is null or p_category_max is null
     or p_category_min not between 1 and 8 or p_category_max not between 1 and 8
     or p_category_min > p_category_max then
    perform private.fail('invalid_input');
  end if;
  select * into v_club from public.clubs where id = v_club_id;

  v_match.id := gen_random_uuid();
  v_match.club_id := v_club_id;
  v_match.period := private.slot_period(v_club_id, p_starts_at);
  v_match.preferred_court_id := p_court_id;
  v_match.allow_other_court := p_allow_other_court;
  v_match.category_min := p_category_min;
  v_match.category_max := p_category_max;
  v_match.match_type := p_match_type;

  if lower(v_match.period) <= now() then
    perform private.fail('in_the_past');
  end if;
  if lower(v_match.period) > now() + make_interval(days => v_club.booking_window_days) then
    perform private.fail('outside_window');
  end if;
  if now() >= private.match_closes_at(v_match) then
    perform private.fail('match_closed');
  end if;
  if private.slot_price(v_club_id, lower(v_match.period)) is null then
    perform private.fail('no_price');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('staff_match:' || p_court_id::text || ':' || lower(v_match.period)::text, 0));
  if exists (
    select 1 from public.open_matches om
    where om.preferred_court_id = p_court_id and om.status = 'forming' and om.period && v_match.period
  ) then
    perform private.fail('slot_taken');
  end if;
  if not p_allow_other_court and exists (
    select 1 from public.court_occupancy o where o.court_id = p_court_id and o.period && v_match.period
  ) then
    perform private.fail('slot_taken');
  end if;

  insert into public.open_matches (id, club_id, period, preferred_court_id, allow_other_court, category_min,
                                   category_max, match_type, created_by)
  values (v_match.id, v_club_id, v_match.period, p_court_id, p_allow_other_court, p_category_min, p_category_max,
          p_match_type, v_uid)
  returning * into v_match;

  insert into public.match_slots (match_id, club_id, position, team, side, player_id, joined_at)
  select v_match.id, v_club_id, pos, case when pos <= 2 then 'A' else 'B' end,
         (case when pos % 2 = 1 then 'drive' else 'backhand' end)::public.player_side, null, null
  from generate_series(1, 4) as pos;

  return v_match;
end;
$$;

revoke execute on function public.staff_create_match(uuid, timestamptz, boolean, integer, integer,
  public.match_type) from public, anon;
grant execute on function public.staff_create_match(uuid, timestamptz, boolean, integer, integer,
  public.match_type) to authenticated;
