-- "Deshacer" after charging everything a person owed at once: void all the payments it made in one go. It runs each
-- one through void_desk_payment (same rules: staff of the club, cash or POS, confirmed today), inside a single
-- transaction, so either every payment is voided or none is: no half-undone charge.
create function public.void_desk_payments(p_payment_ids uuid[])
returns setof public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_payment_ids is null or cardinality(p_payment_ids) = 0 or cardinality(p_payment_ids) > 50 then
    perform private.fail('invalid_input');
  end if;
  foreach v_id in array (select array_agg(distinct id) from unnest(p_payment_ids) as id) loop
    return next public.void_desk_payment(v_id);
  end loop;
end;
$$;

revoke execute on function public.void_desk_payments(uuid[]) from public, anon;
grant execute on function public.void_desk_payments(uuid[]) to authenticated;
