-- Limits on the bookings players make and cancel themselves. Staff (admin, reception)
-- are not limited: they block courts, load recurring slots and fix mistakes.
-- Enforced in RLS so a player calling the API directly gets the same rules as the app.

alter table public.clubs
  add column opens_at time not null default '08:00',
  add column closes_at time not null default '24:00',
  add column min_booking_minutes smallint not null default 60,
  add column max_booking_minutes smallint not null default 120,
  add column booking_window_days smallint not null default 14,
  add constraint clubs_opening_hours check (opens_at < closes_at),
  add constraint clubs_booking_minutes check (min_booking_minutes > 0 and max_booking_minutes >= min_booking_minutes),
  add constraint clubs_booking_window check (booking_window_days > 0);

-- Starts in the future and inside the booking window, lasts between the club's
-- minimum and maximum, and fits within opening hours in the club's timezone.
create function private.player_can_book(p_club_id uuid, p_period tstzrange)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.clubs c
    cross join lateral (
      select lower(p_period) at time zone c.timezone as local_start,
             upper(p_period) at time zone c.timezone as local_end
    ) l
    where c.id = p_club_id
      and lower(p_period) > now()
      and lower(p_period) <= now() + make_interval(days => c.booking_window_days)
      and upper(p_period) - lower(p_period)
        between make_interval(mins => c.min_booking_minutes) and make_interval(mins => c.max_booking_minutes)
      and l.local_start >= l.local_start::date + c.opens_at
      and l.local_end <= l.local_start::date + c.closes_at
  );
$$;

-- A player may cancel only with at least cancellation_notice_hours to go.
create function private.player_can_cancel(p_club_id uuid, p_period tstzrange)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.clubs c
    where c.id = p_club_id
      and lower(p_period) - now() >= make_interval(hours => c.cancellation_notice_hours)
  );
$$;

revoke all on function private.player_can_book(uuid, tstzrange) from public;
revoke all on function private.player_can_cancel(uuid, tstzrange) from public;
grant execute on function private.player_can_book(uuid, tstzrange) to authenticated;
grant execute on function private.player_can_cancel(uuid, tstzrange) to authenticated;

drop policy court_occupancy_insert_own_booking on public.court_occupancy;
create policy court_occupancy_insert_own_booking on public.court_occupancy
  for insert to authenticated
  with check (
    kind = 'booking'
    and created_by = (select auth.uid())
    and private.is_club_member(club_id)
    and private.player_can_book(club_id, period)
  );

drop policy court_occupancy_delete_staff_or_own_booking on public.court_occupancy;
create policy court_occupancy_delete_staff_or_own_booking on public.court_occupancy
  for delete to authenticated
  using (
    private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
    or (
      kind = 'booking'
      and created_by = (select auth.uid())
      and private.player_can_cancel(club_id, period)
    )
  );
