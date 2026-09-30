-- Fase 2 data model: open matches and their four spots. A match that is still forming holds no
-- court; when the fourth player joins, a booking with match_id (and an occupancy of kind 'match')
-- takes one. Every write goes through the functions of the next migrations: authenticated only reads.

create type public.match_type as enum ('male', 'female', 'mixed');
create type public.match_status as enum ('forming', 'confirmed', 'cancelled');

create table public.open_matches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  period tstzrange not null,
  starts_at timestamptz generated always as (lower(period)) stored,
  ends_at timestamptz generated always as (upper(period)) stored,
  preferred_court_id uuid not null,
  allow_other_court boolean not null default true,
  -- The court it got when it filled up; members read it, the booking only its players and staff.
  court_id uuid,
  category_min smallint not null check (category_min between 1 and 8),
  category_max smallint not null check (category_max between 1 and 8),
  match_type public.match_type not null,
  status public.match_status not null default 'forming',
  cancel_reason text check (cancel_reason in ('no_court', 'not_filled', 'empty', 'by_club')),
  cancel_note text check (cancel_note is null or length(trim(cancel_note)) between 1 and 120),
  -- Kept when a player leaves a confirmed match: the court stays held until closing time.
  booking_id uuid unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  -- Target for the composite FK in match_slots.
  unique (id, club_id),
  constraint open_matches_preferred_court_fkey
    foreign key (preferred_court_id, club_id) references public.courts (id, club_id) on delete cascade,
  constraint open_matches_court_fkey
    foreign key (court_id, club_id) references public.courts (id, club_id) on delete cascade,
  constraint open_matches_booking_fkey
    foreign key (booking_id) references public.bookings (id) on delete set null,
  constraint open_matches_categories check (category_min <= category_max),
  constraint open_matches_period_shape check (
    not isempty(period) and not lower_inf(period) and not upper_inf(period)
    and lower_inc(period) and not upper_inc(period)
  ),
  constraint open_matches_cancelled check (
    (status = 'cancelled') = (cancelled_at is not null and cancel_reason is not null)
  )
);
create index open_matches_club_starts_idx on public.open_matches (club_id, starts_at);
alter table public.open_matches enable row level security;

-- Spots: 1 = team A drive, 2 = team A backhand, 3 = team B drive, 4 = team B backhand.
create table public.match_slots (
  match_id uuid not null,
  club_id uuid not null,
  position smallint not null check (position between 1 and 4),
  team text not null check (team in ('A', 'B')),
  side public.player_side not null check (side in ('drive', 'backhand')),
  player_id uuid references public.profiles (id) on delete set null,
  joined_at timestamptz,
  primary key (match_id, position),
  constraint match_slots_match_in_club
    foreign key (match_id, club_id) references public.open_matches (id, club_id) on delete cascade,
  constraint match_slots_one_spot_per_player unique (match_id, player_id)
);
create index match_slots_player_id_idx on public.match_slots (player_id);
alter table public.match_slots enable row level security;

-- A booking belongs to exactly one of: a player, a name, a match.
alter table public.bookings
  add column match_id uuid references public.open_matches (id) on delete cascade,
  drop constraint bookings_holder,
  add constraint bookings_holder check (
    num_nonnulls(player_id, guest_name, match_id) = 1
    and (guest_name is null or length(trim(guest_name)) between 1 and 60)
  );
create index bookings_match_id_idx on public.bookings (match_id);

-- In a match each player pays his own share.
alter table public.payments add column payer_id uuid references public.profiles (id) on delete set null;
create index payments_payer_id_idx on public.payments (payer_id);
drop index public.payments_one_reported_per_booking;
create unique index payments_one_reported_per_booking on public.payments (booking_id)
  where status = 'reported' and payer_id is null;
create unique index payments_one_reported_per_payer on public.payments (booking_id, payer_id)
  where status = 'reported' and payer_id is not null;

-- Whether the caller has a spot in the match. security definer so RLS policies can use it
-- without going through match_slots' own policy.
create function private.is_match_player(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.match_slots s
    where s.match_id = p_match_id and s.player_id = (select auth.uid())
  );
$$;
revoke all on function private.is_match_player(uuid) from public;
grant execute on function private.is_match_player(uuid) to authenticated;

revoke all on public.open_matches, public.match_slots from anon, authenticated;
grant select on public.open_matches, public.match_slots to authenticated;

create policy open_matches_select_members on public.open_matches
  for select to authenticated using (private.is_club_member(club_id));
create policy match_slots_select_members on public.match_slots
  for select to authenticated using (private.is_club_member(club_id));

-- A match's booking is read by its players and by staff.
drop policy bookings_select_own_or_staff on public.bookings;
create policy bookings_select_own_or_staff on public.bookings
  for select to authenticated
  using (
    player_id = (select auth.uid())
    or (match_id is not null and private.is_match_player(match_id))
    or private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
  );

-- A match player reads only her own payments; a booking of one player, all of its payments.
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
  );
