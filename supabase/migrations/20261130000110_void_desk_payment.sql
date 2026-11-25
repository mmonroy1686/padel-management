-- Anular cobro: reception charged the wrong person or the wrong amount, in cash or POS, and takes it back the same day
-- (decision of Miguel, 25/11). The payment stays, marked voided, with who and when: everything that adds up what is
-- paid counts status = 'confirmed' only, so the debt is owed again and the day's cash no longer includes it.
-- Transfers keep their own way back (reject or refund).
alter table public.payments
  add column voided_at timestamptz,
  add column voided_by uuid references public.profiles (id) on delete set null,
  drop constraint payments_cash_is_confirmed,
  add constraint payments_cash_is_confirmed check (method = 'transfer' or status in ('confirmed', 'refunded', 'voided')),
  add constraint payments_voided_when check ((status = 'voided') = (voided_at is not null));

create function public.void_desk_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments := private.staff_payment(p_payment_id);
  v_timezone text;
begin
  select timezone into v_timezone from public.clubs where id = v_payment.club_id;
  if v_payment.status <> 'confirmed' or v_payment.method = 'transfer' or v_payment.confirmed_at is null
     or (v_payment.confirmed_at at time zone v_timezone)::date <> (now() at time zone v_timezone)::date then
    perform private.fail('invalid_state');
  end if;
  update public.payments
     set status = 'voided', voided_at = now(), voided_by = (select auth.uid())
   where id = v_payment.id
  returning * into v_payment;
  return v_payment;
end;
$$;

revoke execute on function public.void_desk_payment(uuid) from public, anon;
grant execute on function public.void_desk_payment(uuid) to authenticated;
