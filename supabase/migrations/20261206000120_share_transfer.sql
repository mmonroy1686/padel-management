-- Each player transfers their own share (design: docs/features/compartir-turno/design.md).
--
-- A court is always split among its 4 players: the app shows the price per person, and a transfer from the app pays
-- the share of the position the player has in the booking (price / 4, the remainder on the holder: the same rule
-- reception charges with, private.position_due). In an open match nothing changes: each player already reported his
-- own share.

-- Where the player sits in a booking that is not a match: 1 the holder, 2 to 4 booking_players; null when not in it.
create function private.booking_position(p_booking public.bookings, p_user_id uuid)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_booking.player_id = p_user_id then 1::smallint
    else (select bp.position from public.booking_players bp where bp.booking_id = p_booking.id and bp.player_id = p_user_id)
  end;
$$;

-- What that position still owes, minus a transfer it already reported.
create function private.position_left(p_booking public.bookings, p_position integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select private.position_due(p_booking, p_position) - coalesce((
    select sum(p.amount) from public.payments p
    where p.booking_id = p_booking.id and p.payer_position = p_position and p.status = 'reported'
  ), 0)::integer;
$$;

create or replace function public.report_transfer(p_booking_id uuid, p_receipt_path text default null)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_booking public.bookings;
  v_club public.clubs;
  v_path text := nullif(trim(p_receipt_path), '');
  v_payer uuid;
  v_position smallint;
  v_due integer;
  v_payment public.payments;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null then
    perform private.fail('forbidden');
  end if;
  if v_booking.match_id is not null then
    -- In a match each player reports his own share.
    if not private.is_match_player(v_booking.match_id) then
      perform private.fail('forbidden');
    end if;
    v_payer := v_uid;
  else
    -- In a booking, the share of the position the player has in it.
    v_position := private.booking_position(v_booking, v_uid);
    if v_position is null then
      perform private.fail('forbidden');
    end if;
  end if;
  if v_booking.status <> 'confirmed' then
    perform private.fail('invalid_state');
  end if;

  select * into v_club from public.clubs where id = v_booking.club_id;
  if not v_club.accepts_transfer then
    perform private.fail('method_disabled');
  end if;
  if v_path is null and v_club.transfer_receipt_required then
    perform private.fail('receipt_required');
  end if;
  if v_path is not null and (
    private.folder_owner(v_path) is distinct from v_uid
    or position('..' in v_path) > 0
    or not exists (select 1 from storage.objects o where o.bucket_id = 'receipts' and o.name = v_path)
  ) then
    perform private.fail('forbidden');
  end if;
  if exists (
    select 1 from public.payments
    where booking_id = v_booking.id and status = 'reported'
      and (case when v_position is null then payer_id is not distinct from v_payer else payer_position = v_position end)
  ) then
    perform private.fail('invalid_state');
  end if;

  v_due := case
    when v_position is not null then private.position_due(v_booking, v_position)
    else private.share_due(v_booking, v_payer)
  end;
  if v_due is null or v_due <= 0 then
    perform private.fail('invalid_state');
  end if;

  insert into public.payments (club_id, booking_id, method, amount, status, receipt_path, reported_by, payer_id,
                               payer_position)
  values (v_booking.club_id, v_booking.id, 'transfer', v_due, 'reported', v_path, v_uid, v_payer, v_position)
  returning * into v_payment;
  return v_payment;
end;
$$;

-- The shared booking's page also says the viewer's share: their position, what it still owes and whether the club
-- takes transfers.
drop function public.booking_invite(uuid);
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
  is_participant boolean,
  share integer,
  my_position smallint,
  my_left integer,
  accepts_transfer boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_position smallint;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  -- Only for members of its club; anyone else gets the same answer as a booking that does not exist.
  if not found or not private.has_club_role(v_booking.club_id, array['player', 'reception', 'admin']::public.club_role[]) then
    perform private.fail('not_found');
  end if;
  v_position := case when v_booking.match_id is null then private.booking_position(v_booking, (select auth.uid())) end;
  return query
  select v_booking.id, v_booking.starts_at, v_booking.ends_at, c.name, v_booking.status, v_booking.match_id,
         (select coalesce(jsonb_agg(jsonb_build_object('position', p.pos, 'name', p.name) order by p.pos), '[]'::jsonb)
            from private.booking_participants(v_booking.id) p),
         case when v_booking.match_id is null
              then 4 - (select count(*)::int from private.booking_participants(v_booking.id) p where p.pos between 1 and 4)
              else 0 end,
         private.is_booking_participant(v_booking.id, (select auth.uid())),
         v_booking.price / 4,
         v_position,
         case when v_position is not null then private.position_left(v_booking, v_position) end,
         cl.accepts_transfer
  from public.courts c
  join public.clubs cl on cl.id = v_booking.club_id
  where c.id = v_booking.court_id;
end;
$$;

revoke all on function private.booking_position(public.bookings, uuid) from public;
revoke all on function private.position_left(public.bookings, integer) from public;
revoke execute on function public.booking_invite(uuid) from public, anon;
grant execute on function public.booking_invite(uuid) to authenticated;
