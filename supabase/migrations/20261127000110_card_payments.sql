-- Cobro con POS: reception charges a card at the desk the way it takes cash. Confirmed at once, no receipt, only if
-- the club takes it (clubs.accepts_card). The desk functions that took cash now take the method (cash or card,
-- cash by default, so the current calls keep working); a transfer still goes through the player's report.

alter table public.clubs
  add column accepts_card boolean not null default false,
  drop constraint clubs_some_payment_method,
  add constraint clubs_some_payment_method check (accepts_cash or accepts_transfer or accepts_card);

-- Fails with method_disabled unless the club takes that method.
create function private.check_club_method(p_club_id uuid, p_method public.payment_method)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_club public.clubs;
begin
  select * into v_club from public.clubs where id = p_club_id;
  if (p_method = 'cash' and not v_club.accepts_cash)
     or (p_method = 'transfer' and not v_club.accepts_transfer)
     or (p_method = 'card' and not v_club.accepts_card) then
    perform private.fail('method_disabled');
  end if;
end;
$$;

-- What reception takes at the desk without a receipt: cash or card. A transfer is invalid_input here.
create function private.check_desk_method(p_club_id uuid, p_method public.payment_method)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_method is null or p_method not in ('cash', 'card') then
    perform private.fail('invalid_input');
  end if;
  perform private.check_club_method(p_club_id, p_method);
end;
$$;

-- Inicio's charges (charge_booking_share, charge_booking_rest): cash, card, or a transfer shown at the desk.
create or replace function private.chargeable_booking(p_booking_id uuid, p_method public.payment_method)
returns public.bookings
language plpgsql
set search_path = ''
as $$
declare
  v_booking public.bookings;
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
  perform private.check_club_method(v_booking.club_id, p_method);
  return v_booking;
end;
$$;

-- Bookings: cash for a match says who pays; cash for a booking of one player does not.
drop function public.record_cash(uuid, integer, uuid);

create function public.record_cash(
  p_booking_id uuid,
  p_amount integer,
  p_payer_id uuid default null,
  p_method public.payment_method default 'cash'
)
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
  perform private.check_desk_method(v_booking.club_id, p_method);

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
  values (v_booking.club_id, v_booking.id, p_method, p_amount, 'confirmed', p_payer_id, v_uid, v_uid, now())
  returning * into v_payment;
  return v_payment;
end;
$$;

-- Tournaments: what a reported transfer already covers counts as spoken for; the desk only takes the rest.
drop function public.record_tournament_cash(uuid, integer);

create function public.record_tournament_cash(
  p_entry_id uuid,
  p_amount integer,
  p_method public.payment_method default 'cash'
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_entry public.tournament_entries;
  v_status public.tournament_status;
  v_reported integer;
  v_payment public.payments;
begin
  select * into v_entry from public.tournament_entries where id = p_entry_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_entry.club_id) then
    perform private.fail('forbidden');
  end if;
  select status into v_status from public.tournaments where id = v_entry.tournament_id;
  if v_entry.removed_at is not null or v_status = 'cancelled' then
    perform private.fail('invalid_state');
  end if;
  perform private.check_desk_method(v_entry.club_id, p_method);

  select coalesce(sum(amount), 0)::integer into v_reported
  from public.payments where tournament_entry_id = v_entry.id and status = 'reported';
  if p_amount is null or p_amount <= 0 or p_amount > private.entry_due(v_entry.id) - v_reported then
    perform private.fail('invalid_input');
  end if;

  insert into public.payments (club_id, tournament_entry_id, method, amount, status, payer_id, reported_by,
                               confirmed_by, confirmed_at)
  values (v_entry.club_id, v_entry.id, p_method, p_amount, 'confirmed', v_entry.player_id, v_uid, v_uid, now())
  returning * into v_payment;
  return v_payment;
end;
$$;

-- Day use: the same, for a pass that was not cancelled.
drop function public.record_day_use_cash(uuid, integer);

create function public.record_day_use_cash(
  p_pass_id uuid,
  p_amount integer,
  p_method public.payment_method default 'cash'
)
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
  perform private.check_desk_method(v_pass.club_id, p_method);

  select coalesce(sum(amount), 0)::integer into v_reported
  from public.payments where day_use_pass_id = v_pass.id and status = 'reported';
  if p_amount is null or p_amount <= 0 or p_amount > private.pass_due(v_pass.id) - v_reported then
    perform private.fail('invalid_input');
  end if;

  insert into public.payments (club_id, day_use_pass_id, method, amount, status, payer_id, reported_by,
                               confirmed_by, confirmed_at)
  values (v_pass.club_id, v_pass.id, p_method, p_amount, 'confirmed', v_pass.player_id, v_uid, v_uid, now())
  returning * into v_payment;
  return v_payment;
end;
$$;

-- Championships: the same, paid by the pair (payer_id null).
drop function public.record_championship_cash(uuid, integer);

create function public.record_championship_cash(
  p_entry_id uuid,
  p_amount integer,
  p_method public.payment_method default 'cash'
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_entry public.championship_entries;
  v_reported integer;
  v_payment public.payments;
begin
  select * into v_entry from public.championship_entries where id = p_entry_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_entry.club_id) then
    perform private.fail('forbidden');
  end if;
  if not private.entry_payable(v_entry) then
    perform private.fail('invalid_state');
  end if;
  perform private.check_desk_method(v_entry.club_id, p_method);

  select coalesce(sum(amount), 0)::integer into v_reported
  from public.payments where championship_entry_id = v_entry.id and status = 'reported';
  if p_amount is null or p_amount <= 0 or p_amount > private.championship_entry_due(v_entry.id) - v_reported then
    perform private.fail('invalid_input');
  end if;

  insert into public.payments (club_id, championship_entry_id, method, amount, status, payer_id, reported_by,
                               confirmed_by, confirmed_at)
  values (v_entry.club_id, v_entry.id, p_method, p_amount, 'confirmed', null, v_uid, v_uid, now())
  returning * into v_payment;
  return v_payment;
end;
$$;

revoke all on function private.check_club_method(uuid, public.payment_method) from public;
revoke all on function private.check_desk_method(uuid, public.payment_method) from public;
revoke execute on function public.record_cash(uuid, integer, uuid, public.payment_method) from public, anon;
revoke execute on function public.record_tournament_cash(uuid, integer, public.payment_method) from public, anon;
revoke execute on function public.record_day_use_cash(uuid, integer, public.payment_method) from public, anon;
revoke execute on function public.record_championship_cash(uuid, integer, public.payment_method) from public, anon;
grant execute on function public.record_cash(uuid, integer, uuid, public.payment_method) to authenticated;
grant execute on function public.record_tournament_cash(uuid, integer, public.payment_method) to authenticated;
grant execute on function public.record_day_use_cash(uuid, integer, public.payment_method) to authenticated;
grant execute on function public.record_championship_cash(uuid, integer, public.payment_method) to authenticated;
