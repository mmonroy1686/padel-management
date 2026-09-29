-- Fase 1 data model: a fixed slot grid per club, prices by weekday and time band, bookings,
-- recurring series and payments. From here on bookings, occupancies and payments are written only
-- by the security definer functions of the following migrations: authenticated loses direct writes.

-- Clubs: a fixed grid (opens_at + n * slot_minutes) replaces free-length bookings.
alter table public.clubs
  drop constraint clubs_booking_minutes,
  drop column min_booking_minutes,
  drop column max_booking_minutes,
  add column slot_minutes smallint not null default 90,
  add column max_active_bookings smallint not null default 2,
  add column accepts_cash boolean not null default true,
  add column accepts_transfer boolean not null default true,
  add column transfer_details text,
  add column transfer_receipt_required boolean not null default true,
  add constraint clubs_slot_minutes check (slot_minutes between 15 and 240),
  add constraint clubs_max_active_bookings check (max_active_bookings between 1 and 20),
  add constraint clubs_some_payment_method check (accepts_cash or accepts_transfer),
  add constraint clubs_transfer_details check (transfer_details is null or length(transfer_details) <= 500);

-- Occupancies: no more direct writes. The RPCs create and delete them.
drop policy court_occupancy_insert_staff on public.court_occupancy;
drop policy court_occupancy_insert_own_booking on public.court_occupancy;
drop policy court_occupancy_update_staff on public.court_occupancy;
drop policy court_occupancy_delete_staff_or_own_booking on public.court_occupancy;
revoke insert, update, delete on public.court_occupancy from authenticated;
drop function private.player_can_book(uuid, tstzrange);
drop function private.player_can_cancel(uuid, tstzrange);

alter table public.court_occupancy
  add column note text check (note is null or length(trim(note)) between 1 and 80),
  add column starts_at timestamptz generated always as (lower(period)) stored,
  add column ends_at timestamptz generated always as (upper(period)) stored;
create index court_occupancy_club_starts_idx on public.court_occupancy (club_id, starts_at);

create type public.booking_source as enum ('online', 'reception');
create type public.booking_status as enum ('confirmed', 'cancelled');
create type public.payment_method as enum ('cash', 'transfer');
create type public.payment_status as enum ('reported', 'confirmed', 'rejected', 'refunded');

-- A slot's price comes from the band that covers its start time on its weekday
-- (0 = Sunday ... 6 = Saturday, like extract(dow)). Without a band the slot cannot be booked.
create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  weekdays smallint[] not null,
  from_time time not null,
  to_time time not null,
  price integer not null check (price between 0 and 10000000),
  created_at timestamptz not null default now(),
  constraint pricing_rules_weekdays check (
    cardinality(weekdays) between 1 and 7 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
  ),
  constraint pricing_rules_times check (from_time < to_time)
);
create index pricing_rules_club_id_idx on public.pricing_rules (club_id);
alter table public.pricing_rules enable row level security;

-- A recurring slot ("turno fijo") loaded by reception, for a player or for a name.
create table public.recurring_series (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  court_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  player_id uuid references public.profiles (id),
  guest_name text,
  starts_on date not null,
  ends_on date,
  generated_until date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint recurring_series_court_in_club
    foreign key (court_id, club_id) references public.courts (id, club_id) on delete cascade,
  constraint recurring_series_holder check (
    num_nonnulls(player_id, guest_name) = 1 and (guest_name is null or length(trim(guest_name)) between 1 and 60)
  )
);
create index recurring_series_club_id_idx on public.recurring_series (club_id);
alter table public.recurring_series enable row level security;

-- Dates a series could not book, so reception can sort them out by hand.
create table public.recurring_series_skips (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  series_id uuid not null references public.recurring_series (id) on delete cascade,
  on_date date not null,
  reason text not null check (reason in ('slot_taken', 'no_price', 'not_aligned')),
  created_at timestamptz not null default now(),
  unique (series_id, on_date)
);
alter table public.recurring_series_skips enable row level security;

-- The history of every booking. court_occupancy holds the court today; a cancelled booking
-- keeps its row here and loses its occupancy.
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  court_id uuid not null,
  period tstzrange not null,
  starts_at timestamptz generated always as (lower(period)) stored,
  ends_at timestamptz generated always as (upper(period)) stored,
  player_id uuid references public.profiles (id),
  guest_name text,
  source public.booking_source not null,
  series_id uuid references public.recurring_series (id) on delete set null,
  status public.booking_status not null default 'confirmed',
  price integer not null check (price >= 0),
  occupancy_id uuid unique references public.court_occupancy (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  -- Target for the composite FK in payments.
  unique (id, club_id),
  constraint bookings_court_in_club
    foreign key (court_id, club_id) references public.courts (id, club_id) on delete cascade,
  constraint bookings_holder check (
    num_nonnulls(player_id, guest_name) = 1 and (guest_name is null or length(trim(guest_name)) between 1 and 60)
  ),
  constraint bookings_period_shape check (
    not isempty(period) and not lower_inf(period) and not upper_inf(period)
    and lower_inc(period) and not upper_inc(period)
  ),
  -- A confirmed booking always holds its court; a cancelled one never does.
  constraint bookings_status_consistent check (
    (status = 'confirmed' and occupancy_id is not null and cancelled_at is null)
    or (status = 'cancelled' and occupancy_id is null and cancelled_at is not null)
  )
);
create index bookings_club_starts_idx on public.bookings (club_id, starts_at);
create index bookings_player_starts_idx on public.bookings (player_id, starts_at);
create index bookings_series_id_idx on public.bookings (series_id);
alter table public.bookings enable row level security;

-- The app does not move money: it records who paid, how, how much and who confirmed it.
-- confirmed_by / confirmed_at record whoever reviewed the payment (confirmed, rejected or refunded).
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  booking_id uuid not null,
  method public.payment_method not null,
  amount integer not null check (amount > 0),
  status public.payment_status not null,
  receipt_path text,
  reported_by uuid references public.profiles (id) on delete set null,
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  rejection_reason text check (rejection_reason is null or length(rejection_reason) <= 120),
  created_at timestamptz not null default now(),
  constraint payments_booking_in_club
    foreign key (booking_id, club_id) references public.bookings (id, club_id) on delete cascade,
  constraint payments_cash_is_confirmed check (method = 'transfer' or status in ('confirmed', 'refunded'))
);
create index payments_booking_id_idx on public.payments (booking_id);
create index payments_club_status_idx on public.payments (club_id, status);
alter table public.payments enable row level security;

-- Grants: read what RLS allows; write prices as admin. Everything else goes through the RPCs.
revoke all on public.pricing_rules, public.recurring_series, public.recurring_series_skips,
  public.bookings, public.payments from anon, authenticated;
grant select on public.pricing_rules to anon, authenticated;
grant insert, update, delete on public.pricing_rules to authenticated;
grant select on public.recurring_series, public.recurring_series_skips, public.bookings, public.payments
  to authenticated;

create policy pricing_rules_select_all on public.pricing_rules
  for select to anon, authenticated using (true);
create policy pricing_rules_insert_admin on public.pricing_rules
  for insert to authenticated
  with check (private.has_club_role(club_id, array['admin']::public.club_role[]));
create policy pricing_rules_update_admin on public.pricing_rules
  for update to authenticated
  using (private.has_club_role(club_id, array['admin']::public.club_role[]))
  with check (private.has_club_role(club_id, array['admin']::public.club_role[]));
create policy pricing_rules_delete_admin on public.pricing_rules
  for delete to authenticated
  using (private.has_club_role(club_id, array['admin']::public.club_role[]));

create policy bookings_select_own_or_staff on public.bookings
  for select to authenticated
  using (
    player_id = (select auth.uid())
    or private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
  );

-- The subquery goes through bookings' own RLS: a player reaches only payments of her bookings.
create policy payments_select_own_or_staff on public.payments
  for select to authenticated
  using (
    private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
    or exists (select 1 from public.bookings b where b.id = booking_id and b.player_id = (select auth.uid()))
  );

create policy recurring_series_select_staff on public.recurring_series
  for select to authenticated
  using (private.has_club_role(club_id, array['admin', 'reception']::public.club_role[]));

create policy recurring_series_skips_select_staff on public.recurring_series_skips
  for select to authenticated
  using (private.has_club_role(club_id, array['admin', 'reception']::public.club_role[]));
