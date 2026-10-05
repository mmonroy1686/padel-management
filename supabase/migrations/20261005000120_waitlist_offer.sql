-- Lista de espera, part 2: the engine. When a court is freed (a booking cancelled, a block lifted, a
-- match that falls through, a hold passed on or expired) a deferred constraint trigger offers the slots
-- it left free to the waiting line once the transaction commits: it holds the slot for the first in line
-- or, when it is too close to start, tells the whole line. pg_cron expires holds and waits.

-- The club's grid for a date: opens_at + n * slot_minutes, ending no later than closes_at. The same grid
-- as private.slot_period and lib/domain/slots.ts daySlots.
create function private.day_slots(p_club_id uuid, p_date date)
returns setof tstzrange
language sql
stable
set search_path = ''
as $$
  select tstzrange(
    (p_date + c.opens_at + make_interval(mins => n * c.slot_minutes)) at time zone c.timezone,
    (p_date + c.opens_at + make_interval(mins => (n + 1) * c.slot_minutes)) at time zone c.timezone)
  from public.clubs c
  cross join lateral generate_series(
    0, floor(extract(epoch from (c.closes_at - c.opens_at)) / 60 / c.slot_minutes)::integer - 1) as n
  where c.id = p_club_id
  order by n;
$$;

-- How long a freed slot is held for the first in line: 15 minutes; 5 when it starts in less than two
-- hours; none (null) at 45 minutes or less, when the whole line is told instead.
create function private.hold_minutes(p_starts_at timestamptz, p_now timestamptz)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_starts_at - p_now <= interval '45 minutes' then null
    when p_starts_at - p_now < interval '2 hours' then 5
    else 15
  end;
$$;

-- Whether a waiting wait takes that slot on that court: inside its range, one of its courts (none = any).
create function private.wait_fits(p_wait public.slot_waits, p_court_id uuid, p_slot tstzrange, p_timezone text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_wait.status = 'waiting'
    and lower(p_slot) >= (p_wait.on_date + p_wait.from_time) at time zone p_timezone
    and upper(p_slot) <= (p_wait.on_date + p_wait.to_time) at time zone p_timezone
    and (cardinality(p_wait.court_ids) = 0 or p_court_id = any (p_wait.court_ids));
$$;

-- Too close to hold: everyone whose wait takes the slot hears about it, once per player, court and
-- slot; the first one to book it gets it. Skips who already had it held and who is busy at that time.
-- Returns how many avisos it wrote.
create function private.announce_free_slot(p_club public.clubs, p_court public.courts, p_slot tstzrange)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.notifications (club_id, user_id, kind, data, link)
  select distinct on (w.player_id)
         p_club.id, w.player_id, 'slot_free_now',
         jsonb_build_object('court_id', p_court.id, 'court_name', p_court.name, 'starts_at', lower(p_slot)),
         '/reservar?dia=' || to_char(lower(p_slot) at time zone p_club.timezone, 'YYYY-MM-DD')
  from public.slot_waits w
  where w.club_id = p_club.id
    and private.wait_fits(w, p_court.id, p_slot, p_club.timezone)
    and not exists (
      select 1 from public.slot_holds h
      where h.player_id = w.player_id and h.court_id = p_court.id and h.period = p_slot
    )
    and not private.is_busy(w.player_id, p_slot)
    and not exists (
      select 1 from public.notifications n
      where n.user_id = w.player_id and n.kind = 'slot_free_now'
        and n.data ->> 'court_id' = p_court.id::text
        and (n.data ->> 'starts_at')::timestamptz = lower(p_slot)
    )
  order by w.player_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Offers the grid slots of a freed period that are still free, priced and ahead. More than 45 minutes
-- ahead: holds it for the first waiting wait (oldest first) that takes it, whose player has no other
-- active hold, never had this slot held on this court and is not busy then, and writes her aviso.
-- Closer than that: announce_free_slot. Returns how many holds and avisos it made. p_now is a
-- parameter so tests can fix the clock.
create function private.offer_freed(
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

-- Runs when the transaction that freed the court commits, so it sees whether the court is still free
-- (claiming and regenerating a day use free and take it again in the same transaction).
create function private.on_occupancy_freed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.offer_freed(old.club_id, old.court_id, old.period);
  exception when others then
    -- Freeing a court never fails because of the waitlist.
    raise warning 'offer_freed: occupancy % failed: %', old.id, sqlerrm;
  end;
  return null;
end;
$$;

create constraint trigger court_occupancy_offer_freed
  after delete on public.court_occupancy
  deferrable initially deferred
  for each row execute function private.on_occupancy_freed();

-- Holds whose time ran out go free (the trigger offers them to the next in line when this commits),
-- with any hold occupancy left behind; waits whose range is over expire. Returns how many holds expired.
create function private.expire_waitlist(p_now timestamptz default now())
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.slot_holds set status = 'expired', ended_at = p_now
   where status = 'active' and expires_at <= p_now;
  get diagnostics v_count = row_count;

  delete from public.court_occupancy where kind = 'hold' and expires_at <= p_now;

  update public.slot_waits w set status = 'expired', ended_at = p_now
    from public.clubs c
   where c.id = w.club_id and w.status = 'waiting'
     and (w.on_date + w.to_time) at time zone c.timezone <= p_now;
  return v_count;
end;
$$;

revoke all on function private.day_slots(uuid, date) from public;
revoke all on function private.hold_minutes(timestamptz, timestamptz) from public;
revoke all on function private.wait_fits(public.slot_waits, uuid, tstzrange, text) from public;
revoke all on function private.announce_free_slot(public.clubs, public.courts, tstzrange) from public;
revoke all on function private.offer_freed(uuid, uuid, tstzrange, timestamptz) from public;
revoke all on function private.on_occupancy_freed() from public;
revoke all on function private.expire_waitlist(timestamptz) from public;

-- Every minute: holds and waits run out on time.
select cron.schedule('expire-waitlist', '* * * * *', 'select private.expire_waitlist()');
