-- Tournaments, part 1: creating one (it blocks its courts from the start until the end its maximum
-- size needs) and cancelling it (frees them; confirmed payments stay for a refund).

-- rounds × waves × round_minutes, where waves spread the games of a round (players / 4) over the courts.
create function private.tournament_minutes(p_players integer, p_courts integer, p_rounds integer,
                                           p_round_minutes integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select p_rounds * ceil((p_players / 4)::numeric / p_courts)::integer * p_round_minutes;
$$;

create function public.create_tournament(
  p_name text,
  p_starts_at timestamptz,
  p_court_ids uuid[],
  p_max_players integer,
  p_points_per_game integer,
  p_round_minutes integer,
  p_rounds integer,
  p_category_min integer,
  p_category_max integer,
  p_type public.match_type,
  p_price integer
)
returns public.tournaments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(p_name);
  v_club public.clubs;
  v_period tstzrange;
  v_local_start timestamp;
  v_tournament public.tournaments;
  v_court_id uuid;
begin
  if p_court_ids is null or cardinality(p_court_ids) = 0 then
    perform private.fail('invalid_input');
  end if;
  select * into v_club from public.clubs where id = private.active_court_club(p_court_ids[1]);
  if not private.is_staff(v_club.id) then
    perform private.fail('forbidden');
  end if;
  if v_name is null or length(v_name) not between 1 and 60
     or p_starts_at is null
     or p_max_players is null or p_max_players not in (8, 12, 16)
     or array_position(p_court_ids, null) is not null
     or cardinality(p_court_ids) > p_max_players / 4
     or (select count(distinct u.court_id) from unnest(p_court_ids) as u (court_id)) <> cardinality(p_court_ids)
     or exists (
       select 1 from unnest(p_court_ids) as u (court_id)
       where not exists (
         select 1 from public.courts c where c.id = u.court_id and c.club_id = v_club.id and c.is_active
       )
     )
     or p_points_per_game is null or p_points_per_game not between 1 and 99
     or p_round_minutes is null or p_round_minutes not between 5 and 90
     or p_rounds is null or p_rounds not between 1 and p_max_players - 1
     or p_category_min is null or p_category_max is null
     or p_category_min not between 1 and 8 or p_category_max not between 1 and 8
     or p_category_min > p_category_max
     or p_type is null
     or p_price is null or p_price not between 0 and 10000000 then
    perform private.fail('invalid_input');
  end if;
  if p_starts_at <= now() then
    perform private.fail('in_the_past');
  end if;

  v_period := tstzrange(
    p_starts_at,
    p_starts_at + make_interval(mins => private.tournament_minutes(p_max_players, cardinality(p_court_ids),
                                                                   p_rounds, p_round_minutes))
  );
  -- Inside the club's hours on its clock, start and end on the same day.
  v_local_start := p_starts_at at time zone v_club.timezone;
  if v_local_start < v_local_start::date + v_club.opens_at
     or (upper(v_period) at time zone v_club.timezone) > v_local_start::date + v_club.closes_at then
    perform private.fail('outside_hours');
  end if;

  insert into public.tournaments (club_id, name, period, court_ids, max_players, points_per_game, round_minutes,
                                  rounds, category_min, category_max, match_type, price, created_by)
  values (v_club.id, v_name, v_period, p_court_ids, p_max_players, p_points_per_game, p_round_minutes, p_rounds,
          p_category_min, p_category_max, p_type, p_price, (select auth.uid()))
  returning * into v_tournament;

  -- The exclusion constraint has the last word on double booking.
  foreach v_court_id in array p_court_ids loop
    begin
      insert into public.court_occupancy (club_id, court_id, kind, period, note, tournament_id, created_by)
      values (v_club.id, v_court_id, 'tournament', v_period, v_name, v_tournament.id, (select auth.uid()));
    exception when exclusion_violation then
      perform private.fail('courts_busy');
    end;
  end loop;

  return v_tournament;
end;
$$;

-- Reception and admin cancel a tournament that has not finished: its courts go free, its reported
-- transfers are rejected, and confirmed payments stay so Cobros lists them to refund.
create function public.cancel_tournament(p_tournament_id uuid)
returns public.tournaments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament public.tournaments;
begin
  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_tournament.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_tournament.status in ('finished', 'cancelled') then
    perform private.fail('invalid_state');
  end if;

  delete from public.court_occupancy where tournament_id = v_tournament.id;
  update public.payments
     set status = 'rejected', rejection_reason = 'Torneo cancelado',
         confirmed_by = (select auth.uid()), confirmed_at = now()
   where status = 'reported'
     and tournament_entry_id in (select id from public.tournament_entries where tournament_id = v_tournament.id);

  update public.tournaments set status = 'cancelled', cancelled_at = now()
   where id = v_tournament.id
  returning * into v_tournament;
  return v_tournament;
end;
$$;

revoke all on function private.tournament_minutes(integer, integer, integer, integer) from public;
revoke execute on function public.create_tournament(text, timestamptz, uuid[], integer, integer, integer, integer,
  integer, integer, public.match_type, integer) from public, anon;
revoke execute on function public.cancel_tournament(uuid) from public, anon;
grant execute on function public.create_tournament(text, timestamptz, uuid[], integer, integer, integer, integer,
  integer, integer, public.match_type, integer) to authenticated;
grant execute on function public.cancel_tournament(uuid) to authenticated;
