-- Fase 3b data model: day use. The club defines the passes it offers (products) with their weekdays,
-- hours, daily capacity and the courts they block; overrides open or close one date; players and
-- reception buy passes, reception checks them in, and every check-in is a stamp towards a reward.
-- Every write goes through the functions of the next migrations: authenticated only reads.

-- The stamps rule, off until the club sets it up (Ajustes → Sellos). Stamps are never stored:
-- private.loyalty_of counts them from the passes.
alter table public.clubs
  add column loyalty_enabled boolean not null default false,
  add column loyalty_every smallint not null default 5,
  add column loyalty_discount_percent smallint not null default 100,
  add column loyalty_expiry_months smallint default 6,
  add constraint clubs_loyalty_every check (loyalty_every between 1 and 50),
  add constraint clubs_loyalty_discount check (loyalty_discount_percent between 1 and 100),
  add constraint clubs_loyalty_expiry check (loyalty_expiry_months is null or loyalty_expiry_months between 1 and 36);

-- "Ya están en el club": everyone shows by default; each player can hide from it.
alter table public.profiles add column show_in_club boolean not null default true;

create type public.day_use_pass_status as enum ('bought', 'inside', 'cancelled');

create table public.day_use_products (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  price integer not null check (price between 0 and 10000000),
  includes text[] not null default '{}',
  -- 0 = Sunday ... 6 = Saturday, like extract(dow). Empty: only the dates an override opens.
  weekdays smallint[] not null,
  from_time time not null,
  to_time time not null,
  capacity smallint not null check (capacity between 1 and 500),
  -- The courts it blocks while it runs (none is fine). Array elements take no FK: the occupancies
  -- and private.guard_court_delete keep them honest.
  court_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  -- Last date whose occupancies were generated; the daily job goes on from there.
  generated_until date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Target for the composite FKs of overrides and passes.
  unique (id, club_id),
  constraint day_use_products_weekdays check (weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  constraint day_use_products_times check (from_time < to_time),
  constraint day_use_products_includes check (cardinality(includes) <= 8 and array_position(includes, null) is null)
);
create index day_use_products_club_id_idx on public.day_use_products (club_id);
alter table public.day_use_products enable row level security;

-- One date that differs from the weekly rule: opens a day it does not run, or closes one it does.
create table public.day_use_overrides (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  product_id uuid not null,
  on_date date not null,
  enabled boolean not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint day_use_overrides_product_in_club
    foreign key (product_id, club_id) references public.day_use_products (id, club_id) on delete cascade,
  unique (product_id, on_date)
);
alter table public.day_use_overrides enable row level security;

-- A pass for one day, for a member or a name. Cancelling keeps the row: its payments may need a refund.
create table public.day_use_passes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  product_id uuid not null,
  on_date date not null,
  player_id uuid references public.profiles (id),
  guest_name text,
  -- The product's price when it was sold.
  price integer not null check (price between 0 and 10000000),
  discount_percent smallint not null default 0 check (discount_percent between 0 and 100),
  used_reward boolean not null default false,
  -- What it costs after the reward; payments cover this (lib/domain/day-use.ts passTotal).
  total integer generated always as ((price * (100 - discount_percent)) / 100) stored,
  code text not null check (code ~ '^DU-[0-9]{6}$'),
  status public.day_use_pass_status not null default 'bought',
  source public.booking_source not null,
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Target for the composite FK in payments.
  unique (id, club_id),
  unique (club_id, code),
  constraint day_use_passes_product_in_club
    foreign key (product_id, club_id) references public.day_use_products (id, club_id) on delete cascade,
  constraint day_use_passes_holder check (
    num_nonnulls(player_id, guest_name) = 1 and (guest_name is null or length(trim(guest_name)) between 1 and 60)
  ),
  -- A reward is the only discount, and only a member has rewards.
  constraint day_use_passes_reward check (used_reward = (discount_percent > 0) and (not used_reward or player_id is not null)),
  constraint day_use_passes_checked_in check ((status = 'inside') = (checked_in_at is not null)),
  constraint day_use_passes_cancelled check ((status = 'cancelled') = (cancelled_at is not null))
);
create unique index day_use_passes_one_per_player on public.day_use_passes (product_id, on_date, player_id)
  where status <> 'cancelled' and player_id is not null;
create index day_use_passes_club_date_idx on public.day_use_passes (club_id, on_date);
create index day_use_passes_player_id_idx on public.day_use_passes (player_id);
alter table public.day_use_passes enable row level security;

-- Each court a product blocks points at it; deleting the product (never done by the app) takes them.
alter table public.court_occupancy
  add column day_use_product_id uuid references public.day_use_products (id) on delete cascade,
  add constraint court_occupancy_day_use_kind check (day_use_product_id is null or kind = 'day_use');
create index court_occupancy_day_use_product_id_idx on public.court_occupancy (day_use_product_id);
-- Members read which pass holds a court (never note, which stays for staff).
grant select (day_use_product_id) on public.court_occupancy to authenticated;

-- A payment is for a booking, a tournament entry or a day use pass: exactly one.
alter table public.payments
  add column day_use_pass_id uuid,
  add constraint payments_pass_in_club
    foreign key (day_use_pass_id, club_id) references public.day_use_passes (id, club_id) on delete cascade;
alter table public.payments drop constraint payments_one_target;
alter table public.payments
  add constraint payments_one_target check (num_nonnulls(booking_id, tournament_entry_id, day_use_pass_id) = 1);
create index payments_day_use_pass_id_idx on public.payments (day_use_pass_id);
create unique index payments_one_reported_per_pass on public.payments (day_use_pass_id)
  where status = 'reported' and day_use_pass_id is not null;

-- A court a day use pass blocks has history too.
create or replace function private.guard_court_delete()
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
    or exists (select 1 from public.tournaments where old.id = any (court_ids))
    or exists (select 1 from public.day_use_products where old.id = any (court_ids))
  ) then
    perform private.fail('court_has_history');
  end if;
  return old;
end;
$$;

revoke all on public.day_use_products, public.day_use_overrides, public.day_use_passes from anon, authenticated;
grant select on public.day_use_products, public.day_use_overrides, public.day_use_passes to authenticated;

create policy day_use_products_select_members on public.day_use_products
  for select to authenticated using (private.is_club_member(club_id));
create policy day_use_overrides_select_members on public.day_use_overrides
  for select to authenticated using (private.is_club_member(club_id));
-- Who bought what is private: each player reads her own passes; staff read every pass of the club.
-- Totals for everyone come from day_use_sold and day_use_inside.
create policy day_use_passes_select_own_or_staff on public.day_use_passes
  for select to authenticated
  using (
    player_id = (select auth.uid())
    or private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
  );
