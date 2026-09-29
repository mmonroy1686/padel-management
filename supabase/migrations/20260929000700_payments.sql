-- Payments: the player reports a transfer with its receipt, reception confirms or rejects it,
-- records cash, and marks refunds. A booking is pending while its confirmed payments do not add
-- up to its price.

create function private.confirmed_amount(p_booking_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(amount), 0)::integer
  from public.payments
  where booking_id = p_booking_id and status = 'confirmed';
$$;

-- Locks a payment and checks the caller is staff of its club.
create function private.staff_payment(p_payment_id uuid)
returns public.payments
language plpgsql
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_payment.club_id) then
    perform private.fail('forbidden');
  end if;
  return v_payment;
end;
$$;

create function public.report_transfer(p_booking_id uuid, p_receipt_path text default null)
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
  v_due integer;
  v_payment public.payments;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null or v_booking.player_id is distinct from v_uid then
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
  if exists (select 1 from public.payments where booking_id = v_booking.id and status = 'reported') then
    perform private.fail('invalid_state');
  end if;

  v_due := v_booking.price - private.confirmed_amount(v_booking.id);
  if v_due <= 0 then
    perform private.fail('invalid_state');
  end if;

  insert into public.payments (club_id, booking_id, method, amount, status, receipt_path, reported_by)
  values (v_booking.club_id, v_booking.id, 'transfer', v_due, 'reported', v_path, v_uid)
  returning * into v_payment;
  return v_payment;
end;
$$;

create function public.record_cash(p_booking_id uuid, p_amount integer)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_booking public.bookings;
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
  if p_amount is null or p_amount <= 0 or p_amount > v_booking.price - private.confirmed_amount(v_booking.id) then
    perform private.fail('invalid_input');
  end if;

  insert into public.payments (club_id, booking_id, method, amount, status, reported_by, confirmed_by, confirmed_at)
  values (v_booking.club_id, v_booking.id, 'cash', p_amount, 'confirmed', v_uid, v_uid, now())
  returning * into v_payment;
  return v_payment;
end;
$$;

create function public.confirm_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments := private.staff_payment(p_payment_id);
begin
  if v_payment.status <> 'reported' then
    perform private.fail('invalid_state');
  end if;
  update public.payments
     set status = 'confirmed', confirmed_by = (select auth.uid()), confirmed_at = now()
   where id = v_payment.id
  returning * into v_payment;
  return v_payment;
end;
$$;

create function public.reject_payment(p_payment_id uuid, p_reason text default null)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments := private.staff_payment(p_payment_id);
begin
  if v_payment.status <> 'reported' then
    perform private.fail('invalid_state');
  end if;
  if length(trim(p_reason)) > 120 then
    perform private.fail('invalid_input');
  end if;
  update public.payments
     set status = 'rejected', rejection_reason = nullif(trim(p_reason), ''),
         confirmed_by = (select auth.uid()), confirmed_at = now()
   where id = v_payment.id
  returning * into v_payment;
  return v_payment;
end;
$$;

-- The app does not move money: reception returns it by hand and records it here.
create function public.refund_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments := private.staff_payment(p_payment_id);
begin
  if v_payment.status <> 'confirmed' then
    perform private.fail('invalid_state');
  end if;
  update public.payments
     set status = 'refunded', confirmed_by = (select auth.uid()), confirmed_at = now()
   where id = v_payment.id
  returning * into v_payment;
  return v_payment;
end;
$$;

revoke all on function private.confirmed_amount(uuid) from public;
revoke all on function private.staff_payment(uuid) from public;
revoke execute on function public.report_transfer(uuid, text) from public, anon;
revoke execute on function public.record_cash(uuid, integer) from public, anon;
revoke execute on function public.confirm_payment(uuid) from public, anon;
revoke execute on function public.reject_payment(uuid, text) from public, anon;
revoke execute on function public.refund_payment(uuid) from public, anon;
grant execute on function public.report_transfer(uuid, text) to authenticated;
grant execute on function public.record_cash(uuid, integer) to authenticated;
grant execute on function public.confirm_payment(uuid) to authenticated;
grant execute on function public.reject_payment(uuid, text) to authenticated;
grant execute on function public.refund_payment(uuid) to authenticated;
