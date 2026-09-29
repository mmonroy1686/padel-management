-- Recurring slots ("turnos fijos") loaded by reception. A series books the same court, weekday and
-- time every week, 8 weeks ahead, and a daily pg_cron job keeps extending it. Dates that clash
-- with another occupancy (or lost their price or grid) are skipped and recorded for reception.

create function private.club_today(p_club_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone c.timezone)::date from public.clubs c where c.id = p_club_id;
$$;

create function private.series_horizon(p_club_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select private.club_today(p_club_id) + 56;
$$;

-- Books the series from p_from to p_until (inclusive). Returns the dates it had to skip.
create function private.generate_series_bookings(p_series public.recurring_series, p_from date, p_until date)
returns setof public.recurring_series_skips
language plpgsql
set search_path = ''
as $$
declare
  v_timezone text;
  v_date date;
  v_starts_at timestamptz;
  v_price integer;
  v_reason text;
  v_skip public.recurring_series_skips;
begin
  select timezone into v_timezone from public.clubs where id = p_series.club_id;
  -- First date on or after p_from that falls on the series weekday.
  v_date := p_from + ((p_series.weekday - extract(dow from p_from)::integer + 7) % 7);

  while v_date <= p_until loop
    v_starts_at := (v_date + p_series.start_time) at time zone v_timezone;
    v_reason := null;

    if v_starts_at > now() then
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

-- The holder is p_player_id or p_guest_name (exactly one); both default to null so the generated
-- types let the app pass only the one it has.
create function public.create_series(
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
  select c.* into v_club from public.clubs c join public.courts ct on ct.club_id = c.id where ct.id = p_court_id;
  if not found then
    perform private.fail('not_found');
  end if;
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

-- Ends a series the day before p_from_date and cancels its bookings from that date on.
-- Returns how many bookings it cancelled.
create function public.end_series(p_series_id uuid, p_from_date date)
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
  if p_from_date is null then
    perform private.fail('invalid_input');
  end if;
  select timezone into v_timezone from public.clubs where id = v_series.club_id;

  update public.recurring_series set ends_on = p_from_date - 1 where id = v_series.id;

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

-- Keeps every active series booked up to its horizon. Returns how many series it extended.
create function private.extend_all_series()
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
      perform * from private.generate_series_bookings(
        v_series,
        greatest(coalesce(v_series.generated_until + 1, v_series.starts_on), private.club_today(v_series.club_id)),
        v_until
      );
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.club_today(uuid) from public;
revoke all on function private.series_horizon(uuid) from public;
revoke all on function private.generate_series_bookings(public.recurring_series, date, date) from public;
revoke all on function private.extend_all_series() from public;
revoke execute on function public.create_series(uuid, integer, time, date, date, uuid, text) from public, anon;
revoke execute on function public.end_series(uuid, date) from public, anon;
grant execute on function public.create_series(uuid, integer, time, date, date, uuid, text) to authenticated;
grant execute on function public.end_series(uuid, date) to authenticated;

-- Every day at 07:00 UTC (04:00 in Montevideo), outside club hours.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.schedule('extend-recurring-series', '0 7 * * *', 'select private.extend_all_series()');
