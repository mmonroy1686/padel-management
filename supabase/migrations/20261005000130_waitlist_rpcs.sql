-- Lista de espera, part 3: what players and staff do. Signing up for a slot, cancelling, booking a held
-- slot, passing on it, reception passing it to the next in line, and marking avisos read.
-- Lock order: the wait, then the hold (claim_slot_hold and cancel_slot_wait), so they never deadlock.

-- Ends an active hold and frees its court; the deferred trigger offers it to the next in line.
-- Callers lock the hold and check it is active.
create function private.end_hold(p_hold public.slot_holds, p_status public.slot_hold_status)
returns public.slot_holds
language plpgsql
set search_path = ''
as $$
declare
  v_hold public.slot_holds;
begin
  update public.slot_holds set status = p_status, ended_at = now() where id = p_hold.id returning * into v_hold;
  delete from public.court_occupancy where id = p_hold.occupancy_id;
  return v_hold;
end;
$$;

-- "Avisame si se libera". The range has to hold a whole slot of the grid still ahead, within the
-- booking window; every court picked means any court. At most 3 active waits per player. When a slot
-- in the range is free right now the answer is slot_available: book it instead.
create function public.create_slot_wait(
  p_club_id uuid,
  p_date date,
  p_from time,
  p_to time,
  p_court_ids uuid[] default '{}'
)
returns public.slot_waits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_club public.clubs;
  v_courts uuid[] := coalesce(p_court_ids, '{}');
  v_starts timestamptz;
  v_ends timestamptz;
  v_wait public.slot_waits;
begin
  if v_uid is null or not private.is_club_member(p_club_id) then
    perform private.fail('forbidden');
  end if;
  select * into v_club from public.clubs where id = p_club_id;
  if p_date is null or p_from is null or p_to is null or p_from >= p_to
     or p_from < v_club.opens_at or p_to > v_club.closes_at
     or cardinality(v_courts) > 20 or array_position(v_courts, null) is not null
     or exists (
       select 1 from unnest(v_courts) as picked (id)
       where not exists (
         select 1 from public.courts c where c.id = picked.id and c.club_id = p_club_id and c.is_active
       )
     ) then
    perform private.fail('invalid_input');
  end if;
  -- Every court picked: any court, including one the club adds later.
  if not exists (
    select 1 from public.courts c where c.club_id = p_club_id and c.is_active and not (c.id = any (v_courts))
  ) then
    v_courts := '{}';
  end if;

  v_starts := (p_date + p_from) at time zone v_club.timezone;
  v_ends := (p_date + p_to) at time zone v_club.timezone;
  if v_ends <= now() then
    perform private.fail('in_the_past');
  end if;
  if p_date > private.club_today(p_club_id) + v_club.booking_window_days then
    perform private.fail('outside_window');
  end if;
  if not exists (
    select 1 from private.day_slots(p_club_id, p_date) as s (period)
    where lower(s.period) >= v_starts and upper(s.period) <= v_ends and lower(s.period) > now()
  ) then
    perform private.fail('invalid_input');
  end if;

  -- One sign-up at a time per player, so the limit cannot race.
  perform pg_advisory_xact_lock(hashtextextended('slot_wait:' || v_uid::text, 0));
  if (
    select count(*) from public.slot_waits w
    where w.player_id = v_uid and w.status = 'waiting'
      and (w.on_date + w.to_time) at time zone v_club.timezone > now()
  ) >= 3 then
    perform private.fail('too_many_waits');
  end if;

  if exists (
    select 1
    from private.day_slots(p_club_id, p_date) as s (period)
    join public.courts c
      on c.club_id = p_club_id and c.is_active and (cardinality(v_courts) = 0 or c.id = any (v_courts))
    where lower(s.period) >= v_starts and upper(s.period) <= v_ends and lower(s.period) > now()
      and private.slot_price(p_club_id, lower(s.period)) is not null
      and not exists (select 1 from public.court_occupancy o where o.court_id = c.id and o.period && s.period)
  ) then
    perform private.fail('slot_available');
  end if;

  insert into public.slot_waits (club_id, player_id, on_date, from_time, to_time, court_ids)
  values (p_club_id, v_uid, p_date, p_from, p_to, v_courts)
  returning * into v_wait;
  return v_wait;
end;
$$;

-- The player cancels her wait; a court it holds goes to the next in line.
create function public.cancel_slot_wait(p_wait_id uuid)
returns public.slot_waits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wait public.slot_waits;
  v_hold public.slot_holds;
begin
  select * into v_wait from public.slot_waits where id = p_wait_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_wait.player_id is distinct from (select auth.uid()) then
    perform private.fail('forbidden');
  end if;
  if v_wait.status <> 'waiting' then
    perform private.fail('invalid_state');
  end if;

  select * into v_hold from public.slot_holds where wait_id = v_wait.id and status = 'active' for update;
  if found then
    perform private.end_hold(v_hold, 'declined');
  end if;

  update public.slot_waits set status = 'cancelled', ended_at = now() where id = v_wait.id returning * into v_wait;
  return v_wait;
end;
$$;

-- "Reservar": the hold becomes a booking like any online one (same price, same rules as book_slot),
-- in one transaction. The deferred trigger then finds the court taken and offers nothing.
create function public.claim_slot_hold(p_hold_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_hold public.slot_holds;
  v_club public.clubs;
  v_price integer;
  v_booking public.bookings;
begin
  -- Lock order: the wait, then the hold.
  perform 1 from public.slot_waits w join public.slot_holds h on h.wait_id = w.id where h.id = p_hold_id
    for update of w;
  select * into v_hold from public.slot_holds where id = p_hold_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null or v_hold.player_id is distinct from v_uid or not private.is_club_member(v_hold.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_hold.status <> 'active' then
    perform private.fail('invalid_state');
  end if;
  if v_hold.expires_at <= now() then
    perform private.fail('hold_expired');
  end if;

  -- The rules of book_slot, under its per-player lock.
  perform pg_advisory_xact_lock(hashtextextended('book_slot:' || v_uid::text, 0));
  select * into v_club from public.clubs where id = v_hold.club_id;
  if private.is_busy(v_uid, v_hold.period) then
    perform private.fail('busy_at_that_time');
  end if;
  if (
    select count(*) from public.bookings b
    where b.club_id = v_hold.club_id and b.player_id = v_uid and b.status = 'confirmed'
      and b.series_id is null and b.starts_at > now()
  ) >= v_club.max_active_bookings then
    perform private.fail('too_many_bookings');
  end if;
  v_price := private.slot_price(v_hold.club_id, lower(v_hold.period));
  if v_price is null then
    perform private.fail('no_price');
  end if;

  delete from public.court_occupancy where id = v_hold.occupancy_id;
  v_booking := private.insert_booking(v_hold.club_id, v_hold.court_id, v_hold.period, 'booking', v_uid, null,
                                      'online', null, v_price);

  update public.slot_holds set status = 'claimed', booking_id = v_booking.id, ended_at = now() where id = v_hold.id;
  update public.slot_waits set status = 'booked', ended_at = now() where id = v_hold.wait_id;
  return v_booking;
end;
$$;

-- "No me sirve": the slot goes to the next in line. The wait keeps waiting for the rest of its range.
create function public.decline_slot_hold(p_hold_id uuid)
returns public.slot_holds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold public.slot_holds;
begin
  select * into v_hold from public.slot_holds where id = p_hold_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_hold.player_id is distinct from (select auth.uid()) then
    perform private.fail('forbidden');
  end if;
  if v_hold.status <> 'active' then
    perform private.fail('invalid_state');
  end if;
  return private.end_hold(v_hold, 'declined');
end;
$$;

-- "Pasar al siguiente", from the grid: reception and admin pass a held court to the next in line.
create function public.release_slot_hold(p_occupancy_id uuid)
returns public.slot_holds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold public.slot_holds;
begin
  select * into v_hold from public.slot_holds where occupancy_id = p_occupancy_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_hold.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_hold.status <> 'active' then
    perform private.fail('invalid_state');
  end if;
  return private.end_hold(v_hold, 'released');
end;
$$;

-- Opening Avisos marks every aviso of the viewer read. Returns how many.
create function public.mark_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    perform private.fail('forbidden');
  end if;
  update public.notifications set read_at = now() where user_id = (select auth.uid()) and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.end_hold(public.slot_holds, public.slot_hold_status) from public;
revoke execute on function public.create_slot_wait(uuid, date, time, time, uuid[]) from public, anon;
revoke execute on function public.cancel_slot_wait(uuid) from public, anon;
revoke execute on function public.claim_slot_hold(uuid) from public, anon;
revoke execute on function public.decline_slot_hold(uuid) from public, anon;
revoke execute on function public.release_slot_hold(uuid) from public, anon;
revoke execute on function public.mark_notifications_read() from public, anon;
grant execute on function public.create_slot_wait(uuid, date, time, time, uuid[]) to authenticated;
grant execute on function public.cancel_slot_wait(uuid) to authenticated;
grant execute on function public.claim_slot_hold(uuid) to authenticated;
grant execute on function public.decline_slot_hold(uuid) to authenticated;
grant execute on function public.release_slot_hold(uuid) to authenticated;
grant execute on function public.mark_notifications_read() to authenticated;
