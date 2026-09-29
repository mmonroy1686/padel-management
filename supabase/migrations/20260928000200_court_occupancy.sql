-- Anything that takes a court: booking, recurring slot, tournament, block,
-- open match, day use. The database, not the app, makes double booking impossible.
-- Cancelling means deleting the occupancy; history lives in each feature's own table.

create type public.occupancy_kind as enum ('booking', 'recurring', 'tournament', 'block', 'match', 'day_use');

create table public.court_occupancy (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  court_id uuid not null,
  kind public.occupancy_kind not null,
  period tstzrange not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint court_occupancy_court_in_club
    foreign key (court_id, club_id) references public.courts (id, club_id) on delete cascade,
  -- Finite, non-empty, start included and end excluded: 19:00-20:30 and 20:30-22:00 do not overlap.
  constraint court_occupancy_period_shape check (
    not isempty(period)
    and not lower_inf(period)
    and not upper_inf(period)
    and lower_inc(period)
    and not upper_inc(period)
  ),
  constraint court_occupancy_no_overlap
    exclude using gist (court_id with =, period with &&)
);

create index court_occupancy_club_period_idx on public.court_occupancy using gist (club_id, period);

alter table public.court_occupancy enable row level security;
