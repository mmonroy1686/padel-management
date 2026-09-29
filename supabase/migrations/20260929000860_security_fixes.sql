-- Fixes from the final security and discipline reviews.

-- Receipts: staff read a receipt only when a payment to their own club uses it. Before, staff of
-- any club where the uploader was a member could read all of that person's receipts.
drop policy receipts_select_own_or_staff on storage.objects;

create function private.is_staff_for_receipt(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.payments p
    where p.receipt_path = p_name and private.is_staff(p.club_id)
  );
$$;

revoke all on function private.is_staff_for_receipt(text) from public;
grant execute on function private.is_staff_for_receipt(text) to authenticated;

create policy receipts_select_own_or_staff on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and (
      private.folder_owner(name) = (select auth.uid())
      or private.is_staff_for_receipt(name)
    )
  );

-- Price bands: a slot's price is the band that starts latest on its weekday, so two bands of the
-- same club, sharing a weekday and a start time, would make the price depend on row order.
create function private.check_pricing_rule_start()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.pricing_rules r
    where r.club_id = new.club_id
      and r.id <> new.id
      and r.from_time = new.from_time
      and r.weekdays && new.weekdays
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'pricing_rule_overlap',
      detail = 'Another band of this club starts at the same time on one of these weekdays.';
  end if;
  return new;
end;
$$;

revoke all on function private.check_pricing_rule_start() from public;

create trigger pricing_rules_unique_start
  before insert or update of club_id, weekdays, from_time on public.pricing_rules
  for each row execute function private.check_pricing_rule_start();
