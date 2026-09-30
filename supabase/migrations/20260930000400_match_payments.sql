-- Payments by player: in a match each player pays his share (price / 4, the remainder on spot 1),
-- at the club or by transfer. What a player owes is his share minus his confirmed payments; the match
-- is paid when the four shares are. Bookings of one player keep the fase 1 rules.

-- A match player's share of the booking; null when the person is not in the match.
create function private.match_share(p_booking public.bookings, p_payer_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select p_booking.price / 4 + case when s.position = 1 then p_booking.price % 4 else 0 end
  from public.match_slots s
  where s.match_id = p_booking.match_id and s.player_id = p_payer_id;
$$;

-- His share minus his confirmed payments; null when he is not in the match.
create function private.share_due(p_booking public.bookings, p_payer_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select private.match_share(p_booking, p_payer_id) - coalesce((
    select sum(p.amount) from public.payments p
    where p.booking_id = p_booking.id and p.payer_id = p_payer_id and p.status = 'confirmed'
  ), 0)::integer;
$$;

-- What reported transfers already cover, for one payer (null = a booking of one player).
create function private.reported_amount(p_booking_id uuid, p_payer_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(amount), 0)::integer from public.payments
  where booking_id = p_booking_id and payer_id is not distinct from p_payer_id and status = 'reported';
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
  elsif v_booking.player_id is distinct from v_uid then
    perform private.fail('forbidden');
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
    where booking_id = v_booking.id and status = 'reported' and payer_id is not distinct from v_payer
  ) then
    perform private.fail('invalid_state');
  end if;

  v_due := case
    when v_payer is null then v_booking.price - private.confirmed_amount(v_booking.id)
    else private.share_due(v_booking, v_payer)
  end;
  if v_due is null or v_due <= 0 then
    perform private.fail('invalid_state');
  end if;

  insert into public.payments (club_id, booking_id, method, amount, status, receipt_path, reported_by, payer_id)
  values (v_booking.club_id, v_booking.id, 'transfer', v_due, 'reported', v_path, v_uid, v_payer)
  returning * into v_payment;
  return v_payment;
end;
$$;

-- Cash for a match says who pays; cash for a booking of one player does not.
drop function public.record_cash(uuid, integer);

create function public.record_cash(p_booking_id uuid, p_amount integer, p_payer_id uuid default null)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_booking public.bookings;
  v_left integer;
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

  if v_booking.match_id is null then
    if p_payer_id is not null then
      perform private.fail('invalid_input');
    end if;
    v_left := v_booking.price - private.confirmed_amount(v_booking.id) - private.reported_amount(v_booking.id, null);
  else
    if p_payer_id is null then
      perform private.fail('invalid_input');
    end if;
    v_left := private.share_due(v_booking, p_payer_id) - private.reported_amount(v_booking.id, p_payer_id);
  end if;
  if p_amount is null or p_amount <= 0 or v_left is null or p_amount > v_left then
    perform private.fail('invalid_input');
  end if;

  insert into public.payments (club_id, booking_id, method, amount, status, payer_id, reported_by, confirmed_by,
                               confirmed_at)
  values (v_booking.club_id, v_booking.id, 'cash', p_amount, 'confirmed', p_payer_id, v_uid, v_uid, now())
  returning * into v_payment;
  return v_payment;
end;
$$;

-- A reported share is confirmed only up to what that player still owes.
create or replace function public.confirm_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments := private.staff_payment(p_payment_id);
  v_booking public.bookings;
  v_left integer;
begin
  if v_payment.status <> 'reported' then
    perform private.fail('invalid_state');
  end if;

  select * into v_booking from public.bookings where id = v_payment.booking_id for update;
  v_left := case
    when v_payment.payer_id is null then v_booking.price - private.confirmed_amount(v_booking.id)
    else private.share_due(v_booking, v_payment.payer_id)
  end;
  if v_booking.status <> 'confirmed' or v_left is null or v_payment.amount > v_left then
    perform private.fail('invalid_state');
  end if;

  update public.payments
     set status = 'confirmed', confirmed_by = (select auth.uid()), confirmed_at = now()
   where id = v_payment.id
  returning * into v_payment;
  return v_payment;
end;
$$;

revoke all on function private.match_share(public.bookings, uuid) from public;
revoke all on function private.share_due(public.bookings, uuid) from public;
revoke all on function private.reported_amount(uuid, uuid) from public;
revoke execute on function public.record_cash(uuid, integer, uuid) from public, anon;
grant execute on function public.record_cash(uuid, integer, uuid) to authenticated;
