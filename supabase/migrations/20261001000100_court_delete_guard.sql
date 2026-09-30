-- Admins may delete a court (RLS courts_delete_admin), but every table that points at a court
-- cascades, so deleting one with history would silently wipe bookings, payments, recurring slots
-- and matches. Only a court with no history can go; any other is deactivated instead.
create function private.guard_court_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Depth 1 is a DELETE on courts itself. Deeper means a cascade (e.g. the whole club is being
  -- removed), which is allowed to take everything with it.
  if pg_trigger_depth() = 1 and (
    exists (select 1 from public.court_occupancy where court_id = old.id)
    or exists (select 1 from public.bookings where court_id = old.id)
    or exists (select 1 from public.recurring_series where court_id = old.id)
    or exists (select 1 from public.open_matches where court_id = old.id or preferred_court_id = old.id)
  ) then
    perform private.fail('court_has_history');
  end if;
  return old;
end;
$$;

revoke execute on function private.guard_court_delete() from public, anon, authenticated;

create trigger courts_guard_delete
  before delete on public.courts
  for each row execute function private.guard_court_delete();
