-- Open matches, part 2: joining. The fourth player fills the match and, in the same transaction,
-- it takes the court it held or books one (the preferred court, or the first free one if the
-- creator allowed it). Without a court the match is cancelled, and that is an answer, not an error.

-- Books a court for a full match. Returns the booking, or null when no court is free.
create function private.book_match_court(p_match public.open_matches)
returns public.bookings
language plpgsql
set search_path = ''
as $$
declare
  v_price integer := private.slot_price(p_match.club_id, lower(p_match.period));
  v_court_id uuid;
  v_occupancy_id uuid;
  v_booking public.bookings;
begin
  if v_price is null then
    perform private.fail('no_price');
  end if;

  for v_court_id in
    select c.id from public.courts c
    where c.club_id = p_match.club_id and c.is_active
      and (c.id = p_match.preferred_court_id or p_match.allow_other_court)
    order by c.id = p_match.preferred_court_id desc, c.sort_order, c.name
  loop
    v_occupancy_id := null;
    begin
      insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
      values (p_match.club_id, v_court_id, 'match', p_match.period, (select auth.uid()))
      returning id into v_occupancy_id;
    exception when exclusion_violation then
      v_occupancy_id := null;
    end;

    if v_occupancy_id is not null then
      insert into public.bookings (club_id, court_id, period, match_id, source, price, occupancy_id, created_by)
      values (p_match.club_id, v_court_id, p_match.period, p_match.id, 'online', v_price, v_occupancy_id,
              (select auth.uid()))
      returning * into v_booking;
      return v_booking;
    end if;
  end loop;

  return null;
end;
$$;

-- Cancels a match and the booking it holds, if any. Callers lock the match first.
create function private.cancel_match_row(p_match public.open_matches, p_reason text, p_note text default null)
returns public.open_matches
language plpgsql
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_match public.open_matches;
begin
  if p_match.status = 'cancelled' then
    perform private.fail('invalid_state');
  end if;

  if p_match.booking_id is not null then
    select * into v_booking from public.bookings where id = p_match.booking_id for update;
    if found and v_booking.status = 'confirmed' then
      perform private.cancel_booking_row(v_booking);
    end if;
  end if;

  update public.open_matches
     set status = 'cancelled', cancel_reason = p_reason, cancel_note = nullif(trim(p_note), ''), cancelled_at = now()
   where id = p_match.id
  returning * into v_match;
  return v_match;
end;
$$;

create function public.join_match(p_match_id uuid, p_position integer)
returns public.open_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_match public.open_matches;
  v_slot public.match_slots;
  v_fit text;
  v_booking public.bookings;
begin
  -- Locking the match serializes joins: in a race for the last spot only one gets in.
  select * into v_match from public.open_matches where id = p_match_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null or not private.is_club_member(v_match.club_id) then
    perform private.fail('forbidden');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('book_slot:' || v_uid::text, 0));

  if v_match.status <> 'forming' or now() >= private.match_closes_at(v_match) then
    perform private.fail('match_closed');
  end if;
  if exists (select 1 from public.match_slots where match_id = v_match.id and player_id = v_uid) then
    perform private.fail('already_in_match');
  end if;
  select * into v_slot from public.match_slots where match_id = v_match.id and position = p_position;
  if not found then
    perform private.fail('invalid_input');
  end if;
  if v_slot.player_id is not null then
    perform private.fail('spot_taken');
  end if;
  v_fit := private.match_fit(v_uid, v_match, v_slot.side);
  if v_fit is not null then
    perform private.fail(v_fit);
  end if;
  if private.is_busy(v_uid, v_match.period) then
    perform private.fail('busy_at_that_time');
  end if;

  update public.match_slots set player_id = v_uid, joined_at = now()
   where match_id = v_match.id and position = p_position;

  if exists (select 1 from public.match_slots where match_id = v_match.id and player_id is null) then
    return v_match;
  end if;

  -- The fourth player: the match keeps the court it held, or books one now.
  if v_match.booking_id is not null
     and exists (select 1 from public.bookings where id = v_match.booking_id and status = 'confirmed') then
    update public.open_matches set status = 'confirmed' where id = v_match.id returning * into v_match;
    return v_match;
  end if;

  v_booking := private.book_match_court(v_match);
  if v_booking.id is null then
    return private.cancel_match_row(v_match, 'no_court');
  end if;

  update public.open_matches
     set status = 'confirmed', booking_id = v_booking.id, court_id = v_booking.court_id
   where id = v_match.id
  returning * into v_match;
  return v_match;
end;
$$;

revoke all on function private.book_match_court(public.open_matches) from public;
revoke all on function private.cancel_match_row(public.open_matches, text, text) from public;
revoke execute on function public.join_match(uuid, integer) from public, anon;
grant execute on function public.join_match(uuid, integer) to authenticated;
