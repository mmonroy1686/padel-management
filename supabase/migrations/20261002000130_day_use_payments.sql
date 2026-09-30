-- Payments of day use passes: like a booking of one player. What a pass owes is its total (the price
-- after the reward) minus its confirmed payments; a free pass owes nothing and never reaches Cobros.
-- The player reports a transfer with its receipt; reception confirms or rejects it, records cash, and
-- marks refunds (reject_payment and refund_payment work as they are).

-- The total minus confirmed payments; null for an unknown pass.
create function private.pass_due(p_pass_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select d.total - coalesce((
    select sum(p.amount) from public.payments p
    where p.day_use_pass_id = d.id and p.status = 'confirmed'
  ), 0)::integer
  from public.day_use_passes d
  where d.id = p_pass_id;
$$;

create function public.report_day_use_transfer(p_pass_id uuid, p_receipt_path text default null)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_pass public.day_use_passes;
  v_club public.clubs;
  v_path text := nullif(trim(p_receipt_path), '');
  v_due integer;
  v_payment public.payments;
begin
  select * into v_pass from public.day_use_passes where id = p_pass_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null or v_pass.player_id is distinct from v_uid then
    perform private.fail('forbidden');
  end if;
  if v_pass.status = 'cancelled' then
    perform private.fail('invalid_state');
  end if;

  select * into v_club from public.clubs where id = v_pass.club_id;
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
  if exists (select 1 from public.payments where day_use_pass_id = v_pass.id and status = 'reported') then
    perform private.fail('invalid_state');
  end if;

  v_due := private.pass_due(v_pass.id);
  if v_due <= 0 then
    perform private.fail('invalid_state');
  end if;

  insert into public.payments (club_id, day_use_pass_id, method, amount, status, receipt_path, reported_by, payer_id)
  values (v_pass.club_id, v_pass.id, 'transfer', v_due, 'reported', v_path, v_uid, v_uid)
  returning * into v_payment;
  return v_payment;
end;
$$;

-- What a reported transfer already covers counts as spoken for: cash only takes the rest.
create function public.record_day_use_cash(p_pass_id uuid, p_amount integer)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_pass public.day_use_passes;
  v_reported integer;
  v_payment public.payments;
begin
  select * into v_pass from public.day_use_passes where id = p_pass_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_pass.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_pass.status = 'cancelled' then
    perform private.fail('invalid_state');
  end if;
  if not (select accepts_cash from public.clubs where id = v_pass.club_id) then
    perform private.fail('method_disabled');
  end if;

  select coalesce(sum(amount), 0)::integer into v_reported
  from public.payments where day_use_pass_id = v_pass.id and status = 'reported';
  if p_amount is null or p_amount <= 0 or p_amount > private.pass_due(v_pass.id) - v_reported then
    perform private.fail('invalid_input');
  end if;

  insert into public.payments (club_id, day_use_pass_id, method, amount, status, payer_id, reported_by,
                               confirmed_by, confirmed_at)
  values (v_pass.club_id, v_pass.id, 'cash', p_amount, 'confirmed', v_pass.player_id, v_uid, v_uid, now())
  returning * into v_payment;
  return v_payment;
end;
$$;

-- A reported transfer is confirmed only up to what is still owed: for a booking (its price, or the
-- player's share in a match), for an active entry of a tournament that was not cancelled, or for a
-- day use pass that was not cancelled. The payment is locked first (staff_payment), then its target.
create or replace function public.confirm_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments := private.staff_payment(p_payment_id);
  v_booking public.bookings;
  v_entry public.tournament_entries;
  v_tournament_status public.tournament_status;
  v_pass public.day_use_passes;
  v_left integer;
begin
  if v_payment.status <> 'reported' then
    perform private.fail('invalid_state');
  end if;

  if v_payment.day_use_pass_id is not null then
    select * into v_pass from public.day_use_passes where id = v_payment.day_use_pass_id for update;
    v_left := private.pass_due(v_pass.id);
    if v_pass.status = 'cancelled' or v_left is null or v_payment.amount > v_left then
      perform private.fail('invalid_state');
    end if;
  elsif v_payment.tournament_entry_id is not null then
    select * into v_entry from public.tournament_entries where id = v_payment.tournament_entry_id for update;
    select status into v_tournament_status from public.tournaments where id = v_entry.tournament_id;
    v_left := private.entry_due(v_entry.id);
    if v_entry.removed_at is not null or v_tournament_status = 'cancelled' or v_left is null
       or v_payment.amount > v_left then
      perform private.fail('invalid_state');
    end if;
  else
    select * into v_booking from public.bookings where id = v_payment.booking_id for update;
    v_left := case
      when v_payment.payer_id is null then v_booking.price - private.confirmed_amount(v_booking.id)
      else private.share_due(v_booking, v_payment.payer_id)
    end;
    if v_booking.status <> 'confirmed' or v_left is null or v_payment.amount > v_left then
      perform private.fail('invalid_state');
    end if;
  end if;

  update public.payments
     set status = 'confirmed', confirmed_by = (select auth.uid()), confirmed_at = now()
   where id = v_payment.id
  returning * into v_payment;
  return v_payment;
end;
$$;

revoke all on function private.pass_due(uuid) from public;
revoke execute on function public.report_day_use_transfer(uuid, text) from public, anon;
revoke execute on function public.record_day_use_cash(uuid, integer) from public, anon;
grant execute on function public.report_day_use_transfer(uuid, text) to authenticated;
grant execute on function public.record_day_use_cash(uuid, integer) to authenticated;
