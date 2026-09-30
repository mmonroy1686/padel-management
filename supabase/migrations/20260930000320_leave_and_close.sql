-- Open matches, part 3: leaving, the staff actions and the automatic closing. A confirmed match that
-- loses a player goes back to forming and keeps its court until closing time; if nobody fills the
-- spot by then, the job cancels it and frees the court.

-- Frees the spot of p_player_id and rejects his reported transfer. Callers lock the match first.
create function private.free_match_slot(p_match public.open_matches, p_player_id uuid)
returns public.open_matches
language plpgsql
set search_path = ''
as $$
declare
  v_match public.open_matches;
begin
  update public.match_slots set player_id = null, joined_at = null
   where match_id = p_match.id and player_id = p_player_id;
  if not found then
    perform private.fail('not_found');
  end if;

  if p_match.booking_id is not null then
    update public.payments
       set status = 'rejected', rejection_reason = 'Salió del partido',
           confirmed_by = (select auth.uid()), confirmed_at = now()
     where booking_id = p_match.booking_id and payer_id = p_player_id and status = 'reported';
  end if;

  if not exists (select 1 from public.match_slots where match_id = p_match.id and player_id is not null) then
    return private.cancel_match_row(p_match, 'empty');
  end if;
  if now() >= private.match_closes_at(p_match) then
    return private.cancel_match_row(p_match, 'not_filled');
  end if;

  update public.open_matches set status = 'forming' where id = p_match.id returning * into v_match;
  return v_match;
end;
$$;

-- Forming: whenever. Confirmed: with the club's cancellation notice. Someone who already paid asks
-- the club, which takes him out and gives the money back.
create function public.leave_match(p_match_id uuid)
returns public.open_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_match public.open_matches;
  v_notice_hours smallint;
begin
  select * into v_match from public.open_matches where id = p_match_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null
     or not exists (select 1 from public.match_slots where match_id = v_match.id and player_id = v_uid) then
    perform private.fail('forbidden');
  end if;
  if v_match.status = 'cancelled' or v_match.starts_at <= now() then
    perform private.fail('invalid_state');
  end if;
  if v_match.status = 'confirmed' then
    select cancellation_notice_hours into v_notice_hours from public.clubs where id = v_match.club_id;
    if v_match.starts_at - now() < make_interval(hours => v_notice_hours) then
      perform private.fail('notice_period');
    end if;
  end if;
  if exists (
    select 1 from public.payments
    where booking_id = v_match.booking_id and payer_id = v_uid and status = 'confirmed'
  ) then
    perform private.fail('already_paid');
  end if;

  return private.free_match_slot(v_match, v_uid);
end;
$$;

-- Reception and admin cancel any match of their club, with its booking.
create function public.cancel_match(p_match_id uuid, p_note text default null)
returns public.open_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.open_matches;
begin
  select * into v_match from public.open_matches where id = p_match_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_match.club_id) then
    perform private.fail('forbidden');
  end if;
  if length(trim(p_note)) > 120 then
    perform private.fail('invalid_input');
  end if;
  return private.cancel_match_row(v_match, 'by_club', p_note);
end;
$$;

-- Reception and admin take a player out, with no notice period (his payments stay for a refund).
create function public.remove_from_match(p_match_id uuid, p_player_id uuid)
returns public.open_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.open_matches;
begin
  select * into v_match from public.open_matches where id = p_match_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_match.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_match.status = 'cancelled' then
    perform private.fail('invalid_state');
  end if;
  return private.free_match_slot(v_match, p_player_id);
end;
$$;

-- A match's booking goes with its match: cancelling it from the grid cancels the match.
-- Locks the match before the booking, in the same order as cancel_match.
create or replace function public.cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_match public.open_matches;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_booking.club_id) then
    perform private.fail('forbidden');
  end if;

  if v_booking.match_id is not null then
    select * into v_match from public.open_matches where id = v_booking.match_id for update;
    if v_match.status <> 'cancelled' and v_match.booking_id = v_booking.id then
      perform private.cancel_match_row(v_match, 'by_club');
      select * into v_booking from public.bookings where id = p_booking_id;
      return v_booking;
    end if;
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  return private.cancel_booking_row(v_booking);
end;
$$;

-- Cancels the forming matches that reached their closing time, and frees the court they held.
-- Each match runs in its own subtransaction: an unexpected error is logged and retried next run.
-- Returns how many it closed.
create function public.close_matches()
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
    where m.status = 'forming' and now() >= m.starts_at - make_interval(hours => c.match_close_hours)
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

revoke all on function private.free_match_slot(public.open_matches, uuid) from public;
revoke execute on function public.leave_match(uuid) from public, anon;
revoke execute on function public.cancel_match(uuid, text) from public, anon;
revoke execute on function public.remove_from_match(uuid, uuid) from public, anon;
revoke execute on function public.close_matches() from public, anon, authenticated;
grant execute on function public.leave_match(uuid) to authenticated;
grant execute on function public.cancel_match(uuid, text) to authenticated;
grant execute on function public.remove_from_match(uuid, uuid) to authenticated;
-- The e2e test of the closing calls it with the service role key (local stack only).
grant execute on function public.close_matches() to service_role;

-- Every 10 minutes.
select cron.schedule('close-open-matches', '*/10 * * * *', 'select public.close_matches()');
