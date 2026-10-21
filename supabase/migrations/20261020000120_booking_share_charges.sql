-- Inicio del club, part 3: reception charges each player his share (price / 4, the remainder on player 1, the rule
-- of the matches), or what is left of the booking, in cash or by a transfer the player shows at the desk. Reception's
-- transfer is confirmed at once, with no receipt, by whoever records it. Both go to Cobros like any other payment.
-- In a booking (not a match) a share counts its own payments first (payer_position); a payment without position
-- covers what is left in general, so nobody is charged past the price. In a match each player owes his own share
-- (private.share_due), as in fase 2.

-- What the player in that position of a booking still owes of his share, counting only his own payments.
create function private.position_due(p_booking public.bookings, p_position integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select p_booking.price / 4 + case when p_position = 1 then p_booking.price % 4 else 0 end - coalesce((
    select sum(p.amount) from public.payments p
    where p.booking_id = p_booking.id and p.payer_position = p_position and p.status = 'confirmed'
  ), 0)::integer;
$$;

-- What the booking still owes as a whole, minus a transfer its holder already reported from the app.
create function private.booking_left(p_booking public.bookings)
returns integer
language sql
stable
set search_path = ''
as $$
  select p_booking.price - private.confirmed_amount(p_booking.id) - private.reported_amount(p_booking.id, null);
$$;

-- Locks the booking and checks the caller (staff of its club), the booking and the method.
create function private.chargeable_booking(p_booking_id uuid, p_method public.payment_method)
returns public.bookings
language plpgsql
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_club public.clubs;
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
  if p_method is null then
    perform private.fail('invalid_input');
  end if;
  select * into v_club from public.clubs where id = v_booking.club_id;
  if (p_method = 'cash' and not v_club.accepts_cash) or (p_method = 'transfer' and not v_club.accepts_transfer) then
    perform private.fail('method_disabled');
  end if;
  return v_booking;
end;
$$;

-- A payment reception takes at the desk: confirmed by whoever records it, no receipt.
create function private.record_charge(
  p_booking public.bookings,
  p_method public.payment_method,
  p_amount integer,
  p_payer_id uuid,
  p_position integer
)
returns public.payments
language sql
set search_path = ''
as $$
  insert into public.payments (club_id, booking_id, method, amount, status, payer_id, payer_position, reported_by,
                               confirmed_by, confirmed_at)
  values (p_booking.club_id, p_booking.id, p_method, p_amount, 'confirmed', p_payer_id, p_position,
          (select auth.uid()), (select auth.uid()), now())
  returning *;
$$;

-- "Cobrar $400": what that player still owes.
create function public.charge_booking_share(p_booking_id uuid, p_position integer, p_method public.payment_method)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings := private.chargeable_booking(p_booking_id, p_method);
  v_payer uuid;
  v_amount integer;
begin
  if p_position is null or p_position not between 1 and 4 then
    perform private.fail('invalid_input');
  end if;

  if v_booking.match_id is not null then
    select player_id into v_payer from public.match_slots
     where match_id = v_booking.match_id and position = p_position;
    if v_payer is null then
      perform private.fail('invalid_input');
    end if;
    v_amount := private.share_due(v_booking, v_payer) - private.reported_amount(v_booking.id, v_payer);
    if v_amount <= 0 then
      perform private.fail('already_paid');
    end if;
    return private.record_charge(v_booking, p_method, v_amount, v_payer, null);
  end if;

  v_amount := least(private.position_due(v_booking, p_position), private.booking_left(v_booking));
  if v_amount <= 0 then
    perform private.fail('already_paid');
  end if;
  return private.record_charge(v_booking, p_method, v_amount, null, p_position);
end;
$$;

-- "Cobrar todo lo que falta": one payment without position for what the booking still owes; in a match, one
-- payment per player who still owes, so each share stays his.
create function public.charge_booking_rest(p_booking_id uuid, p_method public.payment_method)
returns setof public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings := private.chargeable_booking(p_booking_id, p_method);
  v_player_id uuid;
  v_amount integer;
  v_payment public.payments;
  v_charged boolean := false;
begin
  if v_booking.match_id is null then
    v_amount := private.booking_left(v_booking);
    if v_amount <= 0 then
      perform private.fail('already_paid');
    end if;
    v_payment := private.record_charge(v_booking, p_method, v_amount, null, null);
    return next v_payment;
    return;
  end if;

  for v_player_id in
    select player_id from public.match_slots
     where match_id = v_booking.match_id and player_id is not null
     order by position
  loop
    v_amount := private.share_due(v_booking, v_player_id) - private.reported_amount(v_booking.id, v_player_id);
    if v_amount > 0 then
      v_payment := private.record_charge(v_booking, p_method, v_amount, v_player_id, null);
      v_charged := true;
      return next v_payment;
    end if;
  end loop;
  if not v_charged then
    perform private.fail('already_paid');
  end if;
end;
$$;

revoke all on function private.position_due(public.bookings, integer) from public;
revoke all on function private.booking_left(public.bookings) from public;
revoke all on function private.chargeable_booking(uuid, public.payment_method) from public;
revoke all on function private.record_charge(public.bookings, public.payment_method, integer, uuid, integer) from public;
revoke execute on function public.charge_booking_share(uuid, integer, public.payment_method) from public, anon;
revoke execute on function public.charge_booking_rest(uuid, public.payment_method) from public, anon;
grant execute on function public.charge_booking_share(uuid, integer, public.payment_method) to authenticated;
grant execute on function public.charge_booking_rest(uuid, public.payment_method) to authenticated;
