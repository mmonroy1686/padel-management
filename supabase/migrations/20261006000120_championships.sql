-- Campeonatos, part 1: the data. A championship has days of play (windows: a date, hours and courts) and
-- categories; pairs of players sign up to a category, and a pair without room waits in line. A player is
-- a member or someone from outside (a phone is one player). Every write goes through the functions of the
-- next migrations: authenticated only reads.

create type public.championship_status as enum
  ('draft', 'registration', 'closed', 'drawn', 'published', 'in_progress', 'finished', 'cancelled');
create type public.championship_gender as enum ('men', 'women', 'mixed', 'open');
create type public.championship_format as enum ('groups_knockout', 'knockout', 'round_robin');
create type public.championship_seeding as enum ('ranking', 'manual');
create type public.championship_category_status as enum ('open', 'cancelled', 'merged');
create type public.championship_entry_status as enum ('active', 'waiting', 'withdrawn', 'removed');

-- The people of the championships. A member has one row linked to her profile (made the first time she
-- plays one); someone from outside is a name and a phone.
create table public.players (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  -- Digits only (private.normalize_phone): 099123456, never +598 99 123 456.
  phone text check (phone ~ '^[0-9]{8,15}$'),
  email text check (email is null or (length(email) <= 254 and email ~ '^[^@ ]+@[^@ ]+$')),
  profile_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Target for the composite FKs of entries.
  unique (id, club_id),
  unique (club_id, profile_id)
);
create unique index players_one_per_phone on public.players (club_id, phone) where phone is not null;
create index players_profile_id_idx on public.players (profile_id);
alter table public.players enable row level security;

create table public.championships (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  rules text not null default '' check (length(rules) <= 5000),
  -- championship-posters/<club_id>/<file>, public like the club logo.
  poster_path text,
  status public.championship_status not null default 'draft',
  registration_opens_at timestamptz,
  -- By default 24 hours before the first day of play (open_championship_registration fills it in).
  registration_closes_at timestamptz,
  max_categories_per_player smallint not null default 2 check (max_categories_per_player between 1 and 5),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  -- Target for the composite FKs of windows and categories.
  unique (id, club_id),
  constraint championships_poster_in_own_folder check (
    poster_path is null or (split_part(poster_path, '/', 1) = club_id::text and length(poster_path) <= 200)
  ),
  constraint championships_open_has_deadline check (status in ('draft', 'cancelled') or registration_closes_at is not null),
  constraint championships_cancelled check ((status = 'cancelled') = (cancelled_at is not null))
);
create index championships_club_id_idx on public.championships (club_id);
alter table public.championships enable row level security;

-- A day and hours of play and the courts it takes. From the opening of registration each window blocks its
-- courts (court_occupancy of kind 'championship'); cancelling frees them.
create table public.championship_windows (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  championship_id uuid not null,
  on_date date not null,
  from_time time not null,
  to_time time not null,
  -- Array elements take no FK: the occupancies and private.guard_court_delete keep them honest.
  court_ids uuid[] not null,
  constraint championship_windows_championship_in_club
    foreign key (championship_id, club_id) references public.championships (id, club_id) on delete cascade,
  constraint championship_windows_times check (from_time < to_time),
  constraint championship_windows_courts check (
    cardinality(court_ids) between 1 and 20 and array_position(court_ids, null) is null
  )
);
create index championship_windows_championship_id_idx on public.championship_windows (championship_id);
alter table public.championship_windows enable row level security;

create table public.championship_categories (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  championship_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 40),
  gender public.championship_gender not null default 'open',
  -- The categories it is meant for (1ª a 8ª), as a reference: nobody checks the declared ones.
  level_min smallint check (level_min between 1 and 8),
  level_max smallint check (level_max between 1 and 8),
  min_pairs smallint not null default 4 check (min_pairs between 2 and 64),
  max_pairs smallint not null default 16 check (max_pairs between 2 and 64),
  -- Per pair.
  price integer not null check (price between 0 and 10000000),
  format public.championship_format not null default 'groups_knockout',
  group_size smallint not null default 4 check (group_size in (3, 4)),
  qualifiers_per_group smallint not null default 2,
  -- Sets, games, tie-break, the third set (a super tie-break to 10 by default) and golden point.
  match_rules jsonb not null default
    '{"sets": 3, "games": 6, "tiebreak": true, "third_set": "super_tiebreak", "super_tiebreak_points": 10, "golden_point": false}',
  match_minutes smallint not null default 90 check (match_minutes between 30 and 240),
  seeding public.championship_seeding not null default 'ranking',
  status public.championship_category_status not null default 'open',
  merged_into uuid references public.championship_categories (id) on delete set null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  -- Target for the composite FK of entries.
  unique (id, club_id),
  unique (championship_id, name),
  constraint championship_categories_championship_in_club
    foreign key (championship_id, club_id) references public.championships (id, club_id) on delete cascade,
  constraint championship_categories_levels check (
    (level_min is null) = (level_max is null) and (level_min is null or level_min <= level_max)
  ),
  constraint championship_categories_pairs check (min_pairs <= max_pairs),
  constraint championship_categories_qualifiers check (qualifiers_per_group between 1 and group_size - 1),
  constraint championship_categories_rules check (jsonb_typeof(match_rules) = 'object'),
  constraint championship_categories_merged check ((status = 'merged') = (merged_into is not null))
);
create index championship_categories_championship_id_idx on public.championship_categories (championship_id);
alter table public.championship_categories enable row level security;

-- A pair in a category. Leaving or being taken out keeps the row: its payments may need a refund.
create table public.championship_entries (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  category_id uuid not null,
  player1_id uuid not null,
  player2_id uuid not null,
  -- The category each one declares (1ª a 8ª); nobody checks it.
  player1_level smallint not null check (player1_level between 1 and 8),
  player2_level smallint not null check (player2_level between 1 and 8),
  status public.championship_entry_status not null default 'active',
  seed smallint check (seed >= 1),
  note text check (length(note) <= 300),
  unavailability_note text check (length(unavailability_note) <= 300),
  -- The organizer saved more than 40 % of the blocks for this pair.
  unavailability_approved boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  -- Also the order of the waiting line.
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.profiles (id) on delete set null,
  -- Target for the composite FKs of unavailability and payments.
  unique (id, club_id),
  constraint championship_entries_category_in_club
    foreign key (category_id, club_id) references public.championship_categories (id, club_id) on delete cascade,
  constraint championship_entries_player1_in_club
    foreign key (player1_id, club_id) references public.players (id, club_id),
  constraint championship_entries_player2_in_club
    foreign key (player2_id, club_id) references public.players (id, club_id),
  constraint championship_entries_two_players check (player1_id <> player2_id),
  constraint championship_entries_ended check ((status in ('withdrawn', 'removed')) = (ended_at is not null))
);
create index championship_entries_category_status_idx
  on public.championship_entries (category_id, status, created_at);
create index championship_entries_player1_id_idx on public.championship_entries (player1_id);
create index championship_entries_player2_id_idx on public.championship_entries (player2_id);
alter table public.championship_entries enable row level security;

-- The 2-hour blocks of the days of play a pair cannot play (private.championship_blocks makes them).
create table public.entry_unavailability (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  entry_id uuid not null,
  on_date date not null,
  from_time time not null,
  to_time time not null,
  constraint entry_unavailability_entry_in_club
    foreign key (entry_id, club_id) references public.championship_entries (id, club_id) on delete cascade,
  constraint entry_unavailability_times check (from_time < to_time),
  unique (entry_id, on_date, from_time)
);
alter table public.entry_unavailability enable row level security;

-- Each court a championship blocks points at it; cancelling deletes them.
alter table public.court_occupancy
  add column championship_id uuid references public.championships (id) on delete cascade,
  add constraint court_occupancy_championship_kind check (championship_id is null or kind = 'championship');
create index court_occupancy_championship_id_idx on public.court_occupancy (championship_id);
-- Members read which championship holds a court (never note, which stays for staff).
grant select (championship_id) on public.court_occupancy to authenticated;

-- A payment is for a booking, a tournament entry, a day use pass or a championship pair: exactly one.
alter table public.payments
  add column championship_entry_id uuid,
  add constraint payments_championship_entry_in_club
    foreign key (championship_entry_id, club_id) references public.championship_entries (id, club_id) on delete cascade;
alter table public.payments drop constraint payments_one_target;
alter table public.payments
  add constraint payments_one_target
    check (num_nonnulls(booking_id, tournament_entry_id, day_use_pass_id, championship_entry_id) = 1);
create index payments_championship_entry_id_idx on public.payments (championship_entry_id);
create unique index payments_one_reported_per_championship_entry on public.payments (championship_entry_id)
  where status = 'reported' and championship_entry_id is not null;

-- True when the caller is one of the two players of a pair (through her member row).
create function private.is_entry_player(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.championship_entries e
    join public.players p on p.id in (e.player1_id, e.player2_id)
    where e.id = p_entry_id and p.profile_id = (select auth.uid())
  );
$$;

-- A court a championship uses has history too.
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
    or exists (select 1 from public.championship_windows where old.id = any (court_ids))
  ) then
    perform private.fail('court_has_history');
  end if;
  return old;
end;
$$;

-- The pair's two players read its payments too, whoever paid.
drop policy payments_select_own_or_staff on public.payments;
create policy payments_select_own_or_staff on public.payments
  for select to authenticated
  using (
    private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
    or payer_id = (select auth.uid())
    or (
      payer_id is null
      and exists (select 1 from public.bookings b where b.id = booking_id and b.player_id = (select auth.uid()))
    )
    or (championship_entry_id is not null and private.is_entry_player(championship_entry_id))
  );

-- The poster: a public bucket, one folder per club (championship-posters/<club_id>/<file>). Staff upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('championship-posters', 'championship-posters', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy championship_posters_insert_staff on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'championship-posters'
    and private.has_club_role(private.folder_owner(name), array['admin', 'reception']::public.club_role[])
  );
create policy championship_posters_delete_staff on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'championship-posters'
    and private.has_club_role(private.folder_owner(name), array['admin', 'reception']::public.club_role[])
  );

revoke all on function private.is_entry_player(uuid) from public;
grant execute on function private.is_entry_player(uuid) to authenticated;

revoke all on public.players, public.championships, public.championship_windows, public.championship_categories,
  public.championship_entries, public.entry_unavailability from anon, authenticated;
grant select on public.championships, public.championship_windows, public.championship_categories,
  public.championship_entries, public.entry_unavailability to authenticated;
-- A phone or an email is for staff and the partner only (public.championship_contacts).
grant select (id, club_id, name, profile_id, created_at) on public.players to authenticated;

create policy players_select_members on public.players
  for select to authenticated using (private.is_club_member(club_id));
-- Staff read their drafts; members, every championship out of draft.
create policy championships_select on public.championships
  for select to authenticated
  using (
    private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
    or (status <> 'draft' and private.is_club_member(club_id))
  );
-- Days, categories and pairs follow their championship (the subquery goes through its RLS).
create policy championship_windows_select on public.championship_windows
  for select to authenticated
  using (exists (select 1 from public.championships ch where ch.id = championship_id));
create policy championship_categories_select on public.championship_categories
  for select to authenticated
  using (exists (select 1 from public.championships ch where ch.id = championship_id));
create policy championship_entries_select on public.championship_entries
  for select to authenticated
  using (exists (select 1 from public.championship_categories c where c.id = category_id));
-- When a pair cannot play is for the pair and for staff.
create policy entry_unavailability_select on public.entry_unavailability
  for select to authenticated
  using (
    private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
    or private.is_entry_player(entry_id)
  );
