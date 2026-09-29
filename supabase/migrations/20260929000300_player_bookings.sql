-- Bookings a player makes and cancels from the app, plus the staff cancellation.
-- Every function checks permissions explicitly and writes booking and occupancy in one transaction.

-- Creates the occupancy and its booking. The exclusion constraint has the last word on double
-- booking: its violation (23P01) becomes slot_taken.
create function private.insert_booking(
  p_club_id uuid,
  p_court_id uuid,
  p_period tstzrange,
  p_kind public.occupancy_kind,
  p_player_id uuid,
  p_guest_name text,
  p_source public.booking_source,
  p_series_id uuid,
  p_price integer
)
returns public.bookings
language plpgsql
set search_path = ''
as $$
declare
  v_occupancy_id uuid;
  v_booking public.bookings;
begin
  begin
    insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
    values (p_club_id, p_court_id, p_kind, p_period, (select auth.uid()))
    returning id into v_occupancy_id;
  exception when exclusion_violation then
    perform private.fail('slot_taken');
  end;

  insert into public.bookings (club_id, court_id, period, player_id, guest_name, source, series_id, price,
                               occupancy_id, created_by)
  values (p_club_id, p_court_id, p_period, p_player_id, nullif(trim(p_guest_name), ''), p_source, p_series_id,
          p_price, v_occupancy_id, (select auth.uid()))
  returning * into v_booking;

  return v_booking;
end;
$$;

-- Marks a confirmed booking cancelled and frees its court. Callers lock the row first.
create function private.cancel_booking_row(p_booking public.bookings)
returns public.bookings
language plpgsql
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  if p_booking.status <> 'confirmed' then
    perform private.fail('invalid_state');
  end if;

  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = (select auth.uid()), occupancy_id = null
   where id = p_booking.id
  returning * into v_booking;

  delete from public.court_occupancy where id = p_booking.occupancy_id;
  return v_booking;
end;
$$;

create function public.book_slot(p_court_id uuid, p_starts_at timestamptz)
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
  -- One booking at a time per player, so the limit and the same-time checks cannot race.
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

  if exists (
    select 1 from public.bookings b
    where b.player_id = v_uid and b.status = 'confirmed' and b.period && v_period
  ) then
    perform private.fail('busy_at_that_time');
  end if;

  -- Recurring series are loaded by reception and do not count toward the limit.
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

create function public.cancel_my_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_notice_hours smallint;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_booking.player_id is distinct from (select auth.uid()) then
    perform private.fail('forbidden');
  end if;
  if v_booking.status <> 'confirmed' then
    perform private.fail('invalid_state');
  end if;

  select cancellation_notice_hours into v_notice_hours from public.clubs where id = v_booking.club_id;
  if v_booking.starts_at - now() < make_interval(hours => v_notice_hours) then
    perform private.fail('notice_period');
  end if;

  return private.cancel_booking_row(v_booking);
end;
$$;

-- Reception and admin cancel any booking of their club, with no notice period.
create function public.cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_booking.club_id) then
    perform private.fail('forbidden');
  end if;

  return private.cancel_booking_row(v_booking);
end;
$$;

-- Supabase grants EXECUTE on new public functions to anon explicitly, so revoke it by name.
revoke all on function private.insert_booking(uuid, uuid, tstzrange, public.occupancy_kind, uuid, text,
  public.booking_source, uuid, integer) from public;
revoke all on function private.cancel_booking_row(public.bookings) from public;
revoke execute on function public.book_slot(uuid, timestamptz) from public, anon;
revoke execute on function public.cancel_my_booking(uuid) from public, anon;
revoke execute on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.book_slot(uuid, timestamptz) to authenticated;
grant execute on function public.cancel_my_booking(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
