-- Fase 3a data model: americano tournaments. The club creates a tournament and blocks its courts;
-- players sign up themselves and reception adds guests; start_tournament builds the fixture in the
-- database. Every write goes through the functions of the next migrations: authenticated only reads.

create type public.tournament_status as enum ('registration', 'closed', 'in_progress', 'finished', 'cancelled');

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  -- From the start to the end its maximum size needs (private.tournament_minutes).
  period tstzrange not null,
  starts_at timestamptz generated always as (lower(period)) stored,
  ends_at timestamptz generated always as (upper(period)) stored,
  -- The courts it blocks, in the order games are assigned to them. Array elements take no FK:
  -- the occupancies and private.guard_court_delete keep them honest.
  court_ids uuid[] not null check (cardinality(court_ids) >= 1),
  max_players smallint not null check (max_players in (8, 12, 16)),
  points_per_game smallint not null default 24 check (points_per_game between 1 and 99),
  round_minutes smallint not null default 20 check (round_minutes between 5 and 90),
  rounds smallint not null default 7,
  category_min smallint not null check (category_min between 1 and 8),
  category_max smallint not null check (category_max between 1 and 8),
  match_type public.match_type not null,
  price integer not null check (price between 0 and 10000000),
  status public.tournament_status not null default 'registration',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  -- Target for the composite FKs of entries and games.
  unique (id, club_id),
  constraint tournaments_rounds check (rounds between 1 and max_players - 1),
  constraint tournaments_courts_fit check (cardinality(court_ids) <= max_players / 4),
  constraint tournaments_categories check (category_min <= category_max),
  constraint tournaments_period_shape check (
    not isempty(period) and not lower_inf(period) and not upper_inf(period)
    and lower_inc(period) and not upper_inc(period)
  ),
  constraint tournaments_cancelled check ((status = 'cancelled') = (cancelled_at is not null))
);
create index tournaments_club_starts_idx on public.tournaments (club_id, starts_at);
alter table public.tournaments enable row level security;

-- A member or a guest name. Leaving or being taken out keeps the row (removed_at): its payments
-- may still need a refund.
create table public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  tournament_id uuid not null,
  player_id uuid references public.profiles (id),
  guest_name text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.profiles (id) on delete set null,
  -- Target for the composite FK in payments.
  unique (id, club_id),
  constraint tournament_entries_tournament_in_club
    foreign key (tournament_id, club_id) references public.tournaments (id, club_id) on delete cascade,
  constraint tournament_entries_holder check (
    num_nonnulls(player_id, guest_name) = 1 and (guest_name is null or length(trim(guest_name)) between 1 and 60)
  )
);
create unique index tournament_entries_one_per_player on public.tournament_entries (tournament_id, player_id)
  where removed_at is null and player_id is not null;
create index tournament_entries_tournament_id_idx on public.tournament_entries (tournament_id);
create index tournament_entries_player_id_idx on public.tournament_entries (player_id);
alter table public.tournament_entries enable row level security;

-- The fixture. Team A is a1 + a2, team B is b1 + b2. score_a is team A's points; team B has
-- points_per_game minus them. null until reception records it.
create table public.tournament_games (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  tournament_id uuid not null,
  round smallint not null check (round >= 1),
  wave smallint not null check (wave >= 1),
  court_id uuid not null,
  starts_at timestamptz not null,
  a1_entry_id uuid not null references public.tournament_entries (id) on delete cascade,
  a2_entry_id uuid not null references public.tournament_entries (id) on delete cascade,
  b1_entry_id uuid not null references public.tournament_entries (id) on delete cascade,
  b2_entry_id uuid not null references public.tournament_entries (id) on delete cascade,
  score_a smallint check (score_a >= 0),
  recorded_by uuid references public.profiles (id) on delete set null,
  recorded_at timestamptz,
  constraint tournament_games_tournament_in_club
    foreign key (tournament_id, club_id) references public.tournaments (id, club_id) on delete cascade,
  constraint tournament_games_court_in_club
    foreign key (court_id, club_id) references public.courts (id, club_id) on delete cascade,
  constraint tournament_games_one_game_per_court unique (tournament_id, round, wave, court_id),
  constraint tournament_games_four_players check (
    a1_entry_id <> a2_entry_id and a1_entry_id <> b1_entry_id and a1_entry_id <> b2_entry_id
    and a2_entry_id <> b1_entry_id and a2_entry_id <> b2_entry_id and b1_entry_id <> b2_entry_id
  )
);
create index tournament_games_tournament_id_idx on public.tournament_games (tournament_id);
alter table public.tournament_games enable row level security;

-- Each court a tournament blocks points at it; cancelling the tournament deletes them.
alter table public.court_occupancy
  add column tournament_id uuid references public.tournaments (id) on delete cascade,
  add constraint court_occupancy_tournament_kind check (tournament_id is null or kind = 'tournament');
create index court_occupancy_tournament_id_idx on public.court_occupancy (tournament_id);
-- Members read which tournament holds a court (never note, which stays for staff).
grant select (tournament_id) on public.court_occupancy to authenticated;

-- A payment is for a booking or for a tournament entry.
alter table public.payments
  alter column booking_id drop not null,
  add column tournament_entry_id uuid,
  add constraint payments_entry_in_club
    foreign key (tournament_entry_id, club_id) references public.tournament_entries (id, club_id) on delete cascade,
  add constraint payments_one_target check (num_nonnulls(booking_id, tournament_entry_id) = 1);
create index payments_tournament_entry_id_idx on public.payments (tournament_entry_id);
create unique index payments_one_reported_per_entry on public.payments (tournament_entry_id)
  where status = 'reported' and tournament_entry_id is not null;

-- "Busy" now also means an active entry in a tournament that was not cancelled, so book_slot,
-- create_match, join_match and join_tournament all respect it.
create or replace function private.is_busy(p_user_id uuid, p_period tstzrange)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b
    where b.player_id = p_user_id and b.status = 'confirmed' and b.period && p_period
  ) or exists (
    select 1 from public.match_slots s
    join public.open_matches m on m.id = s.match_id
    where s.player_id = p_user_id and m.status <> 'cancelled' and m.period && p_period
  ) or exists (
    select 1 from public.tournament_entries e
    join public.tournaments t on t.id = e.tournament_id
    where e.player_id = p_user_id and e.removed_at is null and t.status <> 'cancelled' and t.period && p_period
  );
$$;

-- A court a tournament uses (even a cancelled one, which lost its occupancies) has history too.
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
  ) then
    perform private.fail('court_has_history');
  end if;
  return old;
end;
$$;

revoke all on public.tournaments, public.tournament_entries, public.tournament_games from anon, authenticated;
grant select on public.tournaments, public.tournament_entries, public.tournament_games to authenticated;

create policy tournaments_select_members on public.tournaments
  for select to authenticated using (private.is_club_member(club_id));
create policy tournament_entries_select_members on public.tournament_entries
  for select to authenticated using (private.is_club_member(club_id));
create policy tournament_games_select_members on public.tournament_games
  for select to authenticated using (private.is_club_member(club_id));
