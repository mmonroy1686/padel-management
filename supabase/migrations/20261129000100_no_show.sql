-- «No vino» (docs/features/metricas-piloto/design.md): reception marks a booking whose player did not show up, to
-- count no-shows in the pilot's metrics (docs/piloto/metricas.sql). Not a booking_status: the court was taken and
-- charged all the same, so every function that looks at status = 'confirmed' stays as it is. Payments and the
-- occupancy do not change.
alter table public.bookings
  add column no_show_at timestamptz,
  add column no_show_by uuid references public.profiles (id) on delete set null,
  add constraint bookings_no_show_both check (no_show_at is not null or no_show_by is null);

-- Staff of the club, on a confirmed booking that already started. p_no_show false takes the mark back (a mistap).
create function public.mark_no_show(p_booking_id uuid, p_no_show boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.has_club_role(v_booking.club_id, array['admin', 'reception']::public.club_role[]) then
    perform private.fail('forbidden');
  end if;
  if p_no_show is null then
    perform private.fail('invalid_input');
  end if;
  if v_booking.status <> 'confirmed' or v_booking.starts_at > now() then
    perform private.fail('invalid_state');
  end if;
  if p_no_show and v_booking.no_show_at is not null then
    return;
  end if;
  update public.bookings
     set no_show_at = case when p_no_show then now() end,
         no_show_by = case when p_no_show then (select auth.uid()) end
   where id = p_booking_id;
end;
$$;

revoke execute on function public.mark_no_show(uuid, boolean) from public, anon;
grant execute on function public.mark_no_show(uuid, boolean) to authenticated;
