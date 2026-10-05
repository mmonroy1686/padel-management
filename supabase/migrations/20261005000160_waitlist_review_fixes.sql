-- Lista de espera, review fixes.
-- 1. The rules of an online booking (not past, inside the booking window, priced, not busy at that
--    time, under the active bookings limit) live in one function, used by book_slot and by
--    claim_slot_hold. A claim also checks that the court is still active.
-- 2. The engine only offers slots inside the booking window.
-- 3. The outbox skips the mail of a hold that is no longer active (claimed, declined, passed on) and
--    stops retrying any mail after its third attempt.

-- Checks an online booking of p_player for p_period at p_club and returns its price. Takes the
-- per-player lock, so the limit and the same-time checks never race.
create function private.check_online_booking(p_club public.clubs, p_player uuid, p_period tstzrange)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_price integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('book_slot:' || p_player::text, 0));
  if lower(p_period) <= now() then
    perform private.fail('in_the_past');
  end if;
  if lower(p_period) > now() + make_interval(days => p_club.booking_window_days) then
    perform private.fail('outside_window');
  end if;
  v_price := private.slot_price(p_club.id, lower(p_period));
  if v_price is null then
    perform private.fail('no_price');
  end if;
  if private.is_busy(p_player, p_period) then
    perform private.fail('busy_at_that_time');
  end if;
  -- Recurring series and matches do not count toward the limit.
  if (
    select count(*) from public.bookings b
    where b.club_id = p_club.id and b.player_id = p_player and b.status = 'confirmed'
      and b.series_id is null and b.starts_at > now()
  ) >= p_club.max_active_bookings then
    perform private.fail('too_many_bookings');
  end if;
  return v_price;
end;
$$;

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
  select * into v_club from public.clubs where id = v_club_id;
  v_period := private.slot_period(v_club_id, p_starts_at);
  v_price := private.check_online_booking(v_club, v_uid, v_period);
  return private.insert_booking(v_club_id, p_court_id, v_period, 'booking', v_uid, null, 'online', null, v_price);
end;
$$;

create or replace function public.claim_slot_hold(p_hold_id uuid)
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

  -- The court must still be active, and the rules of any online booking apply.
  perform private.active_court_club(v_hold.court_id);
  select * into v_club from public.clubs where id = v_hold.club_id;
  v_price := private.check_online_booking(v_club, v_uid, v_hold.period);

  delete from public.court_occupancy where id = v_hold.occupancy_id;
  v_booking := private.insert_booking(v_hold.club_id, v_hold.court_id, v_hold.period, 'booking', v_uid, null,
                                      'online', null, v_price);

  update public.slot_holds set status = 'claimed', booking_id = v_booking.id, ended_at = now() where id = v_hold.id;
  update public.slot_waits set status = 'booked', ended_at = now() where id = v_hold.wait_id;
  return v_booking;
end;
$$;

create or replace function private.offer_freed(
  p_club_id uuid,
  p_court_id uuid,
  p_period tstzrange,
  p_now timestamptz default now()
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_club public.clubs;
  v_court public.courts;
  v_date date;
  v_slot tstzrange;
  v_minutes integer;
  v_wait public.slot_waits;
  v_occupancy_id uuid;
  v_hold_id uuid;
  v_expires timestamptz;
  v_offers integer := 0;
begin
  select * into v_club from public.clubs where id = p_club_id;
  select * into v_court from public.courts where id = p_court_id and club_id = p_club_id and is_active;
  if v_club.id is null or v_court.id is null then
    return 0;
  end if;
  -- One offer at a time per club: two courts freed together never hand two holds to the same player.
  perform pg_advisory_xact_lock(hashtextextended('waitlist:' || p_club_id::text, 0));

  for v_date in
    select d::date
    from generate_series((lower(p_period) at time zone v_club.timezone)::date,
                         (upper(p_period) at time zone v_club.timezone)::date, interval '1 day') as d
  loop
    for v_slot in
      select s.period from private.day_slots(p_club_id, v_date) as s (period)
      where s.period && p_period and lower(s.period) > p_now
        and lower(s.period) <= p_now + make_interval(days => v_club.booking_window_days)
      order by s.period
    loop
      if exists (select 1 from public.court_occupancy o where o.court_id = p_court_id and o.period && v_slot)
         or private.slot_price(p_club_id, lower(v_slot)) is null then
        continue;
      end if;

      v_minutes := private.hold_minutes(lower(v_slot), p_now);
      if v_minutes is null then
        v_offers := v_offers + private.announce_free_slot(v_club, v_court, v_slot);
        continue;
      end if;

      select w.* into v_wait
      from public.slot_waits w
      where w.club_id = p_club_id and w.on_date = v_date
        and private.wait_fits(w, p_court_id, v_slot, v_club.timezone)
        and not exists (select 1 from public.slot_holds h where h.player_id = w.player_id and h.status = 'active')
        and not exists (
          select 1 from public.slot_holds h
          where h.player_id = w.player_id and h.court_id = p_court_id and h.period = v_slot
        )
        and not private.is_busy(w.player_id, v_slot)
      order by w.created_at, w.id
      limit 1;
      if not found then
        continue;
      end if;

      v_expires := p_now + make_interval(mins => v_minutes);
      begin
        insert into public.court_occupancy (club_id, court_id, kind, period, expires_at, note)
        values (p_club_id, p_court_id, 'hold', v_slot, v_expires,
                (select nullif(trim(left(p.display_name, 80)), '') from public.profiles p where p.id = v_wait.player_id))
        returning id into v_occupancy_id;
      exception when exclusion_violation then
        continue;
      end;

      insert into public.slot_holds (club_id, wait_id, player_id, occupancy_id, court_id, period, expires_at)
      values (p_club_id, v_wait.id, v_wait.player_id, v_occupancy_id, p_court_id, v_slot, v_expires)
      returning id into v_hold_id;

      insert into public.notifications (club_id, user_id, kind, data, link)
      values (p_club_id, v_wait.player_id, 'slot_held',
              jsonb_build_object('hold_id', v_hold_id, 'court_id', p_court_id, 'court_name', v_court.name,
                                 'starts_at', lower(v_slot), 'expires_at', v_expires),
              '/');
      v_offers := v_offers + 1;
    end loop;
  end loop;
  return v_offers;
end;
$$;

create or replace function public.claim_notification_emails(p_limit integer default 20)
returns table (
  notification_id uuid,
  kind public.notification_kind,
  data jsonb,
  link text,
  email text,
  player_name text,
  club_name text,
  club_timezone text,
  club_logo_path text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The mail of a hold that is no longer active would offer a slot that is gone.
  update public.notifications n
     set email_status = 'skipped', email_locked_until = null
   where n.kind = 'slot_held' and n.email_status in ('pending', 'failed')
     and not exists (
       select 1 from public.slot_holds h where h.id = (n.data ->> 'hold_id')::uuid and h.status = 'active'
     );

  return query
  with picked as (
    select n.id
    from public.notifications n
    where n.email_status in ('pending', 'failed') and n.email_attempts < 3
      and (n.email_locked_until is null or n.email_locked_until < now())
    order by n.created_at
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    for update skip locked
  ), claimed as (
    update public.notifications n
       set email_attempts = n.email_attempts + 1, email_locked_until = now() + interval '5 minutes'
      from picked
     where n.id = picked.id
    returning n.id, n.kind, n.data, n.link, n.user_id, n.club_id, n.created_at
  )
  select c.id, c.kind, c.data, c.link, u.email::text, p.display_name, cl.name, cl.timezone, cl.logo_path
  from claimed c
  join auth.users u on u.id = c.user_id
  join public.profiles p on p.id = c.user_id
  join public.clubs cl on cl.id = c.club_id
  order by c.created_at;
end;
$$;

revoke all on function private.check_online_booking(public.clubs, uuid, tstzrange) from public;
revoke execute on function public.claim_notification_emails(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_emails(integer) to service_role;
