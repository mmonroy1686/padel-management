-- Inicio del club, part 2: reception completes players 2 to 4 of a booking. p_players lists the positions that
-- have someone: {"position": 2, "player_id": "<uuid>"} for a member of the club or {"position": 3, "name": "Pepe"}
-- for just a name. A position left out is empty ("Jugador 4"). A player who already paid his share (a confirmed
-- payment with his position) cannot be changed or taken out; a paid position nobody named can still get a name.

-- Whether a confirmed payment already covers part of that position's share.
create function private.position_paid(p_booking_id uuid, p_position integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.payments
    where booking_id = p_booking_id and payer_position = p_position and status = 'confirmed'
  );
$$;

create function public.set_booking_players(p_booking_id uuid, p_players jsonb)
returns setof public.booking_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_booking public.bookings;
  v_item jsonb;
  v_position integer;
  v_player_text text;
  v_player_id uuid;
  v_name text;
  v_ids uuid[] := array[null, null, null, null]::uuid[];
  v_names text[] := array[null, null, null, null]::text[];
  v_current public.booking_players;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_booking.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_booking.status <> 'confirmed' or v_booking.match_id is not null then
    perform private.fail('invalid_state');
  end if;
  if p_players is null or jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) > 3 then
    perform private.fail('invalid_input');
  end if;

  -- Check every item before writing anything.
  for v_item in select value from jsonb_array_elements(p_players) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item ->> 'position', '') !~ '^[2-4]$' then
      perform private.fail('invalid_input');
    end if;
    v_position := (v_item ->> 'position')::integer;
    v_player_text := nullif(trim(v_item ->> 'player_id'), '');
    v_name := nullif(trim(v_item ->> 'name'), '');
    if v_ids[v_position] is not null or v_names[v_position] is not null
       or num_nonnulls(v_player_text, v_name) <> 1
       or (v_player_text is not null
           and v_player_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
       or length(v_name) > 60 then
      perform private.fail('invalid_input');
    end if;
    if v_player_text is not null then
      v_player_id := v_player_text::uuid;
      if v_player_id = v_booking.player_id or v_player_id = any(v_ids) then
        perform private.fail('player_repeated');
      end if;
      if not exists (
        select 1 from public.club_members where club_id = v_booking.club_id and user_id = v_player_id
      ) then
        perform private.fail('partner_not_member');
      end if;
      v_ids[v_position] := v_player_id;
    else
      v_names[v_position] := v_name;
    end if;
  end loop;

  -- A row that changes goes out (and comes back below with its new player); a paid one stays as it is.
  for v_position in 2..4 loop
    select * into v_current from public.booking_players
     where booking_id = v_booking.id and position = v_position;
    if found and (v_current.player_id is distinct from v_ids[v_position]
                  or v_current.name is distinct from v_names[v_position]) then
      if private.position_paid(v_booking.id, v_position) then
        perform private.fail('already_paid');
      end if;
      delete from public.booking_players where booking_id = v_booking.id and position = v_position;
    end if;
  end loop;

  insert into public.booking_players (booking_id, club_id, position, player_id, name, created_by)
  select v_booking.id, v_booking.club_id, p, v_ids[p], v_names[p], v_uid
  from generate_series(2, 4) as p
  where num_nonnulls(v_ids[p], v_names[p]) = 1
  on conflict (booking_id, position) do nothing;

  return query
    select * from public.booking_players where booking_id = v_booking.id order by position;
end;
$$;

revoke all on function private.position_paid(uuid, integer) from public;
revoke execute on function public.set_booking_players(uuid, jsonb) from public, anon;
grant execute on function public.set_booking_players(uuid, jsonb) to authenticated;
