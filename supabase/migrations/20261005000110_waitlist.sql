-- Lista de espera, part 1: the data. A player waits for a slot (a date, a range and some courts); when
-- one frees up, the first in line gets it held for a few minutes (an occupancy of kind 'hold', so the
-- exclusion constraint keeps everyone else out) and an aviso, in the app and by mail. Every write goes
-- through the functions of the next migrations: authenticated only reads.

-- A hold expires; nothing else does.
alter table public.court_occupancy
  add column expires_at timestamptz,
  add constraint court_occupancy_hold_expires check ((kind = 'hold') = (expires_at is not null));
create index court_occupancy_hold_expires_idx on public.court_occupancy (expires_at) where kind = 'hold';
-- Members see until when a court is held (the grid, Realtime). Who holds it goes in note: staff only.
grant select (expires_at) on public.court_occupancy to authenticated;

create type public.slot_wait_status as enum ('waiting', 'booked', 'expired', 'cancelled');
create type public.slot_hold_status as enum ('active', 'claimed', 'declined', 'expired', 'released');
create type public.notification_kind as enum ('slot_held', 'slot_free_now');
create type public.email_status as enum ('pending', 'sent', 'failed', 'skipped');

-- "Avisame si se libera": one date, a range of the grid and some courts (none = any court).
-- A slot fits when it starts at from_time or later and ends at to_time or earlier.
create table public.slot_waits (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  on_date date not null,
  from_time time not null,
  to_time time not null,
  court_ids uuid[] not null default '{}',
  status public.slot_wait_status not null default 'waiting',
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  -- Target for the composite FK in slot_holds.
  unique (id, club_id),
  constraint slot_waits_times check (from_time < to_time),
  constraint slot_waits_courts check (cardinality(court_ids) <= 20 and array_position(court_ids, null) is null)
);
-- Who waits for a freed slot: the club's waiting line for a date.
create index slot_waits_club_date_idx on public.slot_waits (club_id, on_date) where status = 'waiting';
create index slot_waits_player_id_idx on public.slot_waits (player_id);
alter table public.slot_waits enable row level security;

-- Each time a slot was held for someone: the history of the waitlist and the base of the demand panel.
create table public.slot_holds (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  wait_id uuid not null,
  player_id uuid not null references public.profiles (id) on delete cascade,
  occupancy_id uuid unique references public.court_occupancy (id) on delete set null,
  court_id uuid not null,
  period tstzrange not null,
  starts_at timestamptz generated always as (lower(period)) stored,
  expires_at timestamptz not null,
  status public.slot_hold_status not null default 'active',
  booking_id uuid references public.bookings (id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint slot_holds_wait_in_club
    foreign key (wait_id, club_id) references public.slot_waits (id, club_id) on delete cascade,
  constraint slot_holds_court_in_club
    foreign key (court_id, club_id) references public.courts (id, club_id) on delete cascade,
  -- Only a claimed hold points at the booking it became.
  constraint slot_holds_booking check (status = 'claimed' or booking_id is null)
);
-- One active hold per player: a freed slot goes to the next one in line instead.
create unique index slot_holds_one_active_per_player on public.slot_holds (player_id) where status = 'active';
create index slot_holds_wait_id_idx on public.slot_holds (wait_id);
create index slot_holds_club_status_idx on public.slot_holds (club_id, status);
alter table public.slot_holds enable row level security;

-- The outbox: the database writes each aviso here and never calls anyone; Next shows it in the app
-- and mails it (lib/notify). Championships and last-minute offers will reuse it.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  -- Court name, slot start and, for a hold, until when it is held (lib/domain/waitlist.ts reads it).
  data jsonb not null default '{}',
  -- A path inside the app.
  link text not null check (link ~ '^/' and length(link) <= 200),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  email_status public.email_status not null default 'pending',
  email_attempts smallint not null default 0,
  -- While a run is mailing it, nobody else takes it.
  email_locked_until timestamptz,
  emailed_at timestamptz
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_email_queue_idx on public.notifications (created_at) where email_status in ('pending', 'failed');
alter table public.notifications enable row level security;

revoke all on public.slot_waits, public.slot_holds, public.notifications from anon, authenticated;
grant select on public.slot_waits, public.slot_holds, public.notifications to authenticated;

-- Each player reads her own waits and holds; staff read every one of the club (the demand panel).
create policy slot_waits_select_own_or_staff on public.slot_waits
  for select to authenticated
  using (
    player_id = (select auth.uid())
    or private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
  );
create policy slot_holds_select_own_or_staff on public.slot_holds
  for select to authenticated
  using (
    player_id = (select auth.uid())
    or private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
  );
-- An aviso is personal: not even staff read another person's.
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));
