-- Share a booking to fill it (design: docs/features/compartir-turno/design.md).
--
-- Any of a booking's players shares /turno/<id> by WhatsApp. A member of the club who opens it sees the day, the
-- court and who plays (booking_invite) and, while there is room, joins (join_booking): the first free position of
-- 2 to 4 is theirs, and the holder gets an aviso. An open match has its own page and its own way in (/partidos).

create function public.booking_invite(p_booking_id uuid)
returns table (
  booking_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  court_name text,
  status public.booking_status,
  match_id uuid,
  players jsonb,
  free integer,
  is_participant boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  -- Only for members of its club; anyone else gets the same answer as a booking that does not exist.
  if not found or not private.has_club_role(v_booking.club_id, array['player', 'reception', 'admin']::public.club_role[]) then
    perform private.fail('not_found');
  end if;
  return query
  select v_booking.id, v_booking.starts_at, v_booking.ends_at, c.name, v_booking.status, v_booking.match_id,
         (select coalesce(jsonb_agg(jsonb_build_object('position', p.pos, 'name', p.name) order by p.pos), '[]'::jsonb)
            from private.booking_participants(v_booking.id) p),
         case when v_booking.match_id is null
              then 4 - (select count(*)::int from private.booking_participants(v_booking.id) p where p.pos between 1 and 4)
              else 0 end,
         private.is_booking_participant(v_booking.id, (select auth.uid()))
  from public.courts c
  where c.id = v_booking.court_id;
end;
$$;

-- "Me sumo": the first free position of the booking, for a member of its club, while it has not started.
create function public.join_booking(p_booking_id uuid)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_position smallint;
  v_name text;
  v_court text;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or not private.has_club_role(v_booking.club_id, array['player', 'reception', 'admin']::public.club_role[]) then
    perform private.fail('not_found');
  end if;
  if v_booking.status <> 'confirmed' or v_booking.match_id is not null or v_booking.starts_at <= now() then
    perform private.fail('invalid_state');
  end if;
  if private.is_booking_participant(p_booking_id, v_user) then
    perform private.fail('already_in_booking');
  end if;
  select min(free.pos)::smallint into v_position
  from generate_series(2, 4) as free(pos)
  where not exists (select 1 from public.booking_players bp where bp.booking_id = p_booking_id and bp.position = free.pos);
  if v_position is null then
    perform private.fail('booking_full');
  end if;

  insert into public.booking_players (booking_id, club_id, position, player_id, created_by)
  values (p_booking_id, v_booking.club_id, v_position, v_user, v_user);

  if v_booking.player_id is not null and v_booking.player_id <> v_user then
    select display_name into v_name from public.profiles where id = v_user;
    select name into v_court from public.courts where id = v_booking.court_id;
    insert into public.notifications (club_id, user_id, kind, data, link)
    values (v_booking.club_id, v_booking.player_id, 'booking_join',
            jsonb_build_object('joiner_name', v_name, 'starts_at', v_booking.starts_at, 'court_name', v_court,
                               'free', 4 - (select count(*)::int from private.booking_participants(p_booking_id))),
            '/turno/' || p_booking_id);
  end if;
  return v_position;
end;
$$;

revoke execute on function public.booking_invite(uuid) from public, anon;
revoke execute on function public.join_booking(uuid) from public, anon;
grant execute on function public.booking_invite(uuid) to authenticated;
grant execute on function public.join_booking(uuid) to authenticated;
