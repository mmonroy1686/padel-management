-- Fixes from the slice 1 review:
-- * payments can never be confirmed past a booking's price, and cancelling a booking rejects its
--   reported transfer;
-- * staff functions and the series generator respect inactive courts;
-- * end_series cannot rewrite the past or extend a series;
-- * one failing series no longer stops the daily extension of the others;
-- * the fase 0 trigger function loses its default EXECUTE for PUBLIC.

revoke all on function private.handle_new_user() from public;

-- At most one reported transfer per booking, even if two requests race.
create unique index payments_one_reported_per_booking on public.payments (booking_id) where status = 'reported';

alter table public.recurring_series
  add constraint recurring_series_ends_after_start check (ends_on is null or ends_on >= starts_on - 1);

alter table public.recurring_series_skips drop constraint recurring_series_skips_reason_check;
alter table public.recurring_series_skips
  add constraint recurring_series_skips_reason_check
    check (reason in ('slot_taken', 'no_price', 'not_aligned', 'court_inactive'));

-- What a reported transfer already covers counts as spoken for: cash only takes the rest.
create or replace function public.record_cash(p_booking_id uuid, p_amount integer)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_booking public.bookings;
  v_reported integer;
  v_payment public.payments;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_booking.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_booking.status <> 'confirmed' then
    perform private.fail('invalid_state');
  end if;
  if not (select accepts_cash from public.clubs where id = v_booking.club_id) then
    perform private.fail('method_disabled');
  end if;

  select coalesce(sum(amount), 0)::integer into v_reported
  from public.payments where booking_id = v_booking.id and status = 'reported';
  if p_amount is null or p_amount <= 0
     or p_amount > v_booking.price - private.confirmed_amount(v_booking.id) - v_reported then
    perform private.fail('invalid_input');
  end if;

  insert into public.payments (club_id, booking_id, method, amount, status, reported_by, confirmed_by, confirmed_at)
  values (v_booking.club_id, v_booking.id, 'cash', p_amount, 'confirmed', v_uid, v_uid, now())
  returning * into v_payment;
  return v_payment;
end;
$$;

-- Locks the booking too, so cash and a confirmation cannot both slip in, and re-checks the balance.
create or replace function public.confirm_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments := private.staff_payment(p_payment_id);
  v_booking public.bookings;
begin
  if v_payment.status <> 'reported' then
    perform private.fail('invalid_state');
  end if;

  select * into v_booking from public.bookings where id = v_payment.booking_id for update;
  if v_booking.status <> 'confirmed'
     or v_payment.amount > v_booking.price - private.confirmed_amount(v_booking.id) then
    perform private.fail('invalid_state');
  end if;

  update public.payments
     set status = 'confirmed', confirmed_by = (select auth.uid()), confirmed_at = now()
   where id = v_payment.id
  returning * into v_payment;
  return v_payment;
end;
$$;

-- Cancelling also rejects a reported transfer; confirmed payments stay so reception can refund them.
create or replace function private.cancel_booking_row(p_booking public.bookings)
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

  update public.payments
     set status = 'rejected', rejection_reason = 'Reserva cancelada',
         confirmed_by = (select auth.uid()), confirmed_at = now()
   where booking_id = p_booking.id and status = 'reported';

  delete from public.court_occupancy where id = p_booking.occupancy_id;
  return v_booking;
end;
$$;

create or replace function public.staff_book(
  p_court_id uuid,
  p_starts_at timestamptz,
  p_player_id uuid default null,
  p_guest_name text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club_id uuid := private.active_court_club(p_court_id);
  v_guest text := nullif(trim(p_guest_name), '');
  v_period tstzrange;
  v_price integer;
begin
  if not private.is_staff(v_club_id) then
    perform private.fail('forbidden');
  end if;
  if num_nonnulls(p_player_id, v_guest) <> 1 or length(v_guest) > 60 then
    perform private.fail('invalid_input');
  end if;
  if p_player_id is not null and not exists (
    select 1 from public.club_members where club_id = v_club_id and user_id = p_player_id
  ) then
    perform private.fail('invalid_input');
  end if;

  v_period := private.slot_period(v_club_id, p_starts_at);
  v_price := private.slot_price(v_club_id, p_starts_at);
  if v_price is null then
    perform private.fail('no_price');
  end if;

  return private.insert_booking(v_club_id, p_court_id, v_period, 'booking', p_player_id, v_guest, 'reception',
                                null, v_price);
end;
$$;

create or replace function public.block_court(
  p_court_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_note text default null
)
returns public.court_occupancy
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club_id uuid := private.active_court_club(p_court_id);
  v_block public.court_occupancy;
begin
  if not private.is_staff(v_club_id) then
    perform private.fail('forbidden');
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at or length(trim(p_note)) > 80 then
    perform private.fail('invalid_input');
  end if;

  begin
    insert into public.court_occupancy (club_id, court_id, kind, period, note, created_by)
    values (v_club_id, p_court_id, 'block', tstzrange(p_starts_at, p_ends_at), nullif(trim(p_note), ''),
            (select auth.uid()))
    returning * into v_block;
  exception when exclusion_violation then
    perform private.fail('slot_taken');
  end;

  return v_block;
end;
$$;

-- Dates on a court that was turned off are skipped as court_inactive.
create or replace function private.generate_series_bookings(p_series public.recurring_series, p_from date, p_until date)
returns setof public.recurring_series_skips
language plpgsql
set search_path = ''
as $$
declare
  v_timezone text;
  v_court_active boolean;
  v_date date;
  v_starts_at timestamptz;
  v_price integer;
  v_reason text;
  v_skip public.recurring_series_skips;
begin
  select timezone into v_timezone from public.clubs where id = p_series.club_id;
  select is_active into v_court_active from public.courts where id = p_series.court_id;
  -- First date on or after p_from that falls on the series weekday.
  v_date := p_from + ((p_series.weekday - extract(dow from p_from)::integer + 7) % 7);

  while v_date <= p_until loop
    v_starts_at := (v_date + p_series.start_time) at time zone v_timezone;
    v_reason := null;

    if v_starts_at > now() then
      if not v_court_active then
        v_reason := 'court_inactive';
      else
        begin
          v_price := private.slot_price(p_series.club_id, v_starts_at);
          if v_price is null then
            v_reason := 'no_price';
          else
            perform private.insert_booking(
              p_series.club_id, p_series.court_id, private.slot_period(p_series.club_id, v_starts_at), 'recurring',
              p_series.player_id, p_series.guest_name, 'reception', p_series.id, v_price
            );
          end if;
        exception when raise_exception then
          -- slot_taken, or not_aligned when the club changed its grid after the series was created.
          v_reason := sqlerrm;
        end;
      end if;

      if v_reason is not null then
        insert into public.recurring_series_skips (club_id, series_id, on_date, reason)
        values (p_series.club_id, p_series.id, v_date, v_reason)
        on conflict (series_id, on_date) do update set reason = excluded.reason
        returning * into v_skip;
        return next v_skip;
      end if;
    end if;

    v_date := v_date + 7;
  end loop;

  update public.recurring_series
     set generated_until = greatest(coalesce(generated_until, p_until), p_until)
   where id = p_series.id;
  return;
end;
$$;

create or replace function public.create_series(
  p_court_id uuid,
  p_weekday integer,
  p_start_time time,
  p_starts_on date,
  p_ends_on date default null,
  p_player_id uuid default null,
  p_guest_name text default null
)
returns setof public.recurring_series_skips
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club public.clubs;
  v_guest text := nullif(trim(p_guest_name), '');
  v_series public.recurring_series;
begin
  select * into v_club from public.clubs where id = private.active_court_club(p_court_id);
  if not private.is_staff(v_club.id) then
    perform private.fail('forbidden');
  end if;
  if num_nonnulls(p_player_id, v_guest) <> 1 or length(v_guest) > 60
     or p_weekday is null or p_weekday not between 0 and 6
     or p_start_time is null or p_starts_on is null
     or (p_ends_on is not null and p_ends_on < p_starts_on) then
    perform private.fail('invalid_input');
  end if;
  if p_player_id is not null and not exists (
    select 1 from public.club_members where club_id = v_club.id and user_id = p_player_id
  ) then
    perform private.fail('invalid_input');
  end if;
  -- The start time has to be on the grid; any date works to check it.
  perform private.slot_period(v_club.id, (p_starts_on + p_start_time) at time zone v_club.timezone);

  insert into public.recurring_series (club_id, court_id, weekday, start_time, player_id, guest_name, starts_on,
                                       ends_on, created_by)
  values (v_club.id, p_court_id, p_weekday, p_start_time, p_player_id, v_guest, p_starts_on, p_ends_on,
          (select auth.uid()))
  returning * into v_series;

  return query
    select * from private.generate_series_bookings(
      v_series,
      greatest(p_starts_on, private.club_today(v_club.id)),
      least(coalesce(p_ends_on, 'infinity'::date), private.series_horizon(v_club.id))
    );
end;
$$;

-- Only from today on, and it can only shorten a series, never extend it.
create or replace function public.end_series(p_series_id uuid, p_from_date date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series public.recurring_series;
  v_timezone text;
  v_booking public.bookings;
  v_count integer := 0;
begin
  select * into v_series from public.recurring_series where id = p_series_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_series.club_id) then
    perform private.fail('forbidden');
  end if;
  if p_from_date is null or p_from_date < private.club_today(v_series.club_id) then
    perform private.fail('invalid_input');
  end if;
  select timezone into v_timezone from public.clubs where id = v_series.club_id;

  update public.recurring_series
     set ends_on = greatest(least(coalesce(ends_on, p_from_date - 1), p_from_date - 1), starts_on - 1)
   where id = v_series.id;

  for v_booking in
    select * from public.bookings
    where series_id = v_series.id
      and status = 'confirmed'
      and starts_at >= (p_from_date::timestamp at time zone v_timezone)
    for update
  loop
    perform private.cancel_booking_row(v_booking);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Each series runs in its own subtransaction: an unexpected error rolls back only that series,
-- is logged as a warning, and the job retries it the next day.
create or replace function private.extend_all_series()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_series public.recurring_series;
  v_until date;
  v_count integer := 0;
begin
  for v_series in
    select * from public.recurring_series s
    where s.ends_on is null or s.ends_on >= private.club_today(s.club_id)
  loop
    v_until := least(coalesce(v_series.ends_on, 'infinity'::date), private.series_horizon(v_series.club_id));
    if v_series.generated_until is null or v_series.generated_until < v_until then
      begin
        perform * from private.generate_series_bookings(
          v_series,
          greatest(coalesce(v_series.generated_until + 1, v_series.starts_on), private.club_today(v_series.club_id)),
          v_until
        );
        v_count := v_count + 1;
      exception when others then
        raise warning 'extend_all_series: series % failed: %', v_series.id, sqlerrm;
      end;
    end if;
  end loop;
  return v_count;
end;
$$;
