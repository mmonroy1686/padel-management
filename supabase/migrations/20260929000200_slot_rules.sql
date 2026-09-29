-- Grid and price rules shared by every booking function. They live in private: the API does
-- not expose them, and only the security definer functions (running as their owner) call them.

-- Stops with a stable error code. The app translates codes into Spanish (lib/domain/errors.ts).
create function private.fail(p_code text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using message = p_code, errcode = 'P0001';
end;
$$;

create function private.is_staff(p_club_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.has_club_role(p_club_id, array['admin', 'reception']::public.club_role[]);
$$;

-- The slot that starts at p_starts_at on the club's fixed grid: opens_at + n * slot_minutes,
-- ending no later than closes_at, on the club's clock. Anything else is not_aligned.
create function private.slot_period(p_club_id uuid, p_starts_at timestamptz)
returns tstzrange
language plpgsql
stable
set search_path = ''
as $$
declare
  v_club public.clubs;
  v_local timestamp;
  v_local_end timestamp;
  v_offset_minutes numeric;
begin
  select * into v_club from public.clubs where id = p_club_id;
  if not found then
    perform private.fail('not_found');
  end if;

  v_local := p_starts_at at time zone v_club.timezone;
  v_offset_minutes := extract(epoch from (v_local - (v_local::date + v_club.opens_at))) / 60;
  v_local_end := v_local + make_interval(mins => v_club.slot_minutes);

  if v_offset_minutes < 0
     or v_offset_minutes <> trunc(v_offset_minutes)
     or mod(v_offset_minutes::integer, v_club.slot_minutes) <> 0
     or v_local_end > v_local::date + v_club.closes_at then
    perform private.fail('not_aligned');
  end if;

  return tstzrange(p_starts_at, v_local_end at time zone v_club.timezone);
end;
$$;

-- The price of the band that covers the slot's start on its weekday; the band that starts
-- latest wins. null when no band covers it.
create function private.slot_price(p_club_id uuid, p_starts_at timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select r.price
  from public.clubs c
  cross join lateral (select p_starts_at at time zone c.timezone as local_start) l
  join public.pricing_rules r on r.club_id = c.id
  where c.id = p_club_id
    and extract(dow from l.local_start)::smallint = any (r.weekdays)
    and l.local_start::time >= r.from_time
    and l.local_start::time < r.to_time
  order by r.from_time desc
  limit 1;
$$;

-- The club of an active court, or not_found.
create function private.active_court_club(p_court_id uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_club_id uuid;
begin
  select club_id into v_club_id from public.courts where id = p_court_id and is_active;
  if v_club_id is null then
    perform private.fail('not_found');
  end if;
  return v_club_id;
end;
$$;

revoke all on function private.fail(text) from public;
revoke all on function private.is_staff(uuid) from public;
revoke all on function private.slot_period(uuid, timestamptz) from public;
revoke all on function private.slot_price(uuid, timestamptz) from public;
revoke all on function private.active_court_club(uuid) from public;
