-- What reception and admin load on the grid: bookings for a member or a name, and blocks.
-- Staff bookings still follow the grid and need a price, but skip the booking window and may
-- start in the past (someone who shows up without a booking).

create function public.staff_book(
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
  v_club_id uuid;
  v_guest text := nullif(trim(p_guest_name), '');
  v_period tstzrange;
  v_price integer;
begin
  select club_id into v_club_id from public.courts where id = p_court_id;
  if v_club_id is null then
    perform private.fail('not_found');
  end if;
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

-- Blocks have any length (a class, maintenance) and do not follow the grid.
create function public.block_court(
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
  v_club_id uuid;
  v_block public.court_occupancy;
begin
  select club_id into v_club_id from public.courts where id = p_court_id;
  if v_club_id is null then
    perform private.fail('not_found');
  end if;
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

-- Frees a blocked court. Bookings are cancelled with cancel_booking so their history stays.
create function public.unblock(p_occupancy_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occupancy public.court_occupancy;
begin
  select * into v_occupancy from public.court_occupancy where id = p_occupancy_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_occupancy.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_occupancy.kind <> 'block' then
    perform private.fail('invalid_state');
  end if;

  delete from public.court_occupancy where id = v_occupancy.id;
end;
$$;

revoke execute on function public.staff_book(uuid, timestamptz, uuid, text) from public, anon;
revoke execute on function public.block_court(uuid, timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.unblock(uuid) from public, anon;
grant execute on function public.staff_book(uuid, timestamptz, uuid, text) to authenticated;
grant execute on function public.block_court(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.unblock(uuid) to authenticated;
