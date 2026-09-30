-- Open matches, part 1: the rules every match function shares, and creating a match. A player's
-- bookings and matches take the same advisory lock ('book_slot:' || uid), so "nothing else at that
-- time" holds without races, and book_slot now also looks at matches.

-- Whether the person already has something at that time: a confirmed booking of hers, or a spot in
-- a match that is not cancelled.
create function private.is_busy(p_user_id uuid, p_period tstzrange)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b
    where b.player_id = p_user_id and b.status = 'confirmed' and b.period && p_period
  ) or exists (
    select 1 from public.match_slots s
    join public.open_matches m on m.id = s.match_id
    where s.player_id = p_user_id and m.status <> 'cancelled' and m.period && p_period
  );
$$;

-- When a forming match stops taking players: match_close_hours before it starts.
create function private.match_closes_at(p_match public.open_matches)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select lower(p_match.period) - make_interval(hours => c.match_close_hours)
  from public.clubs c
  where c.id = p_match.club_id;
$$;

-- null when the person fits the spot; otherwise the error code, checked in this order:
-- category (her current one, validated or not), match type, side.
create function private.match_fit(p_user_id uuid, p_match public.open_matches, p_side public.player_side)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when m.category is null or m.category not between p_match.category_min and p_match.category_max
      then 'category_mismatch'
    when p_match.match_type <> 'mixed' and p.gender::text is distinct from p_match.match_type::text
      then 'type_mismatch'
    when p.side is distinct from 'both' and p.side is distinct from p_side
      then 'side_mismatch'
  end
  from public.profiles p
  left join public.club_members m on m.user_id = p.id and m.club_id = p_match.club_id
  where p.id = p_user_id;
$$;

-- Creates the match and its four spots; the creator takes the team A spot of her side.
-- It takes no court: that happens when the fourth player joins.
create function public.create_match(
  p_court_id uuid,
  p_starts_at timestamptz,
  p_allow_other_court boolean,
  p_category_min integer,
  p_category_max integer,
  p_match_type public.match_type,
  p_side public.player_side
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
  v_fit text;
begin
  if v_uid is null or not private.is_club_member(v_club_id) then
    perform private.fail('forbidden');
  end if;
  if p_allow_other_court is null or p_match_type is null or p_side is null or p_side = 'both'
     or p_category_min is null or p_category_max is null
     or p_category_min not between 1 and 8 or p_category_max not between 1 and 8
     or p_category_min > p_category_max then
    perform private.fail('invalid_input');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('book_slot:' || v_uid::text, 0));
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
  v_fit := private.match_fit(v_uid, v_match, p_side);
  if v_fit is not null then
    perform private.fail(v_fit);
  end if;
  if private.is_busy(v_uid, v_match.period) then
    perform private.fail('busy_at_that_time');
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
         (case when pos % 2 = 1 then 'drive' else 'backhand' end)::public.player_side,
         case when pos = (case when p_side = 'drive' then 1 else 2 end) then v_uid end,
         case when pos = (case when p_side = 'drive' then 1 else 2 end) then now() end
  from generate_series(1, 4) as pos;

  return v_match;
end;
$$;

-- Same as fase 1, but "busy" now also means a spot in a match at that time.
create or replace function public.book_slot(p_court_id uuid, p_starts_at timestamptz)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_club_id uuid;
  v_club public.clubs;
  v_period tstzrange;
  v_price integer;
begin
  v_club_id := private.active_court_club(p_court_id);
  if v_uid is null or not private.is_club_member(v_club_id) then
    perform private.fail('forbidden');
  end if;
  -- One booking or match at a time per player, so the limit and the same-time checks cannot race.
  perform pg_advisory_xact_lock(hashtextextended('book_slot:' || v_uid::text, 0));
  select * into v_club from public.clubs where id = v_club_id;

  v_period := private.slot_period(v_club_id, p_starts_at);
  if lower(v_period) <= now() then
    perform private.fail('in_the_past');
  end if;
  if lower(v_period) > now() + make_interval(days => v_club.booking_window_days) then
    perform private.fail('outside_window');
  end if;

  v_price := private.slot_price(v_club_id, lower(v_period));
  if v_price is null then
    perform private.fail('no_price');
  end if;

  if private.is_busy(v_uid, v_period) then
    perform private.fail('busy_at_that_time');
  end if;

  -- Recurring series and matches do not count toward the limit.
  if (
    select count(*) from public.bookings b
    where b.club_id = v_club_id and b.player_id = v_uid and b.status = 'confirmed'
      and b.series_id is null and b.starts_at > now()
  ) >= v_club.max_active_bookings then
    perform private.fail('too_many_bookings');
  end if;

  return private.insert_booking(v_club_id, p_court_id, v_period, 'booking', v_uid, null, 'online', null, v_price);
end;
$$;

revoke all on function private.is_busy(uuid, tstzrange) from public;
revoke all on function private.match_closes_at(public.open_matches) from public;
revoke all on function private.match_fit(uuid, public.open_matches, public.player_side) from public;
revoke execute on function public.create_match(uuid, timestamptz, boolean, integer, integer, public.match_type,
  public.player_side) from public, anon;
grant execute on function public.create_match(uuid, timestamptz, boolean, integer, integer, public.match_type,
  public.player_side) to authenticated;
