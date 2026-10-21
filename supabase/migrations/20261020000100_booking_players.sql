-- Inicio del club, part 1: the players of a booking and whose share a payment is. Player 1 is whoever booked
-- (bookings.player_id or guest_name) and is not repeated here; reception adds players 2 to 4, each a member of the
-- club or just a name. A position without a row is shown as "Jugador 3". An open match keeps its players in
-- match_slots and never uses this table. Written only by set_booking_players.
create table public.booking_players (
  booking_id uuid not null,
  club_id uuid not null references public.clubs (id) on delete cascade,
  position smallint not null check (position between 2 and 4),
  player_id uuid references public.profiles (id) on delete cascade,
  name text check (name is null or length(trim(name)) between 1 and 60),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (booking_id, position),
  constraint booking_players_booking_in_club
    foreign key (booking_id, club_id) references public.bookings (id, club_id) on delete cascade,
  constraint booking_players_member_or_name check (num_nonnulls(player_id, name) = 1)
);
create unique index booking_players_one_spot_per_member on public.booking_players (booking_id, player_id)
  where player_id is not null;
create index booking_players_club_id_idx on public.booking_players (club_id);
create index booking_players_player_id_idx on public.booking_players (player_id);
alter table public.booking_players enable row level security;

revoke all on public.booking_players from anon, authenticated;
grant select on public.booking_players to authenticated;

create policy booking_players_select_staff on public.booking_players
  for select to authenticated
  using (private.has_club_role(club_id, array['admin', 'reception']::public.club_role[]));

-- Whose share a payment of a booking (not a match) pays: 1 to 4. Null = the booking as a whole (paid from the app,
-- a transfer of whoever booked, "Cobrar todo lo que falta", or a payment from before this column).
alter table public.payments
  add column payer_position smallint,
  add constraint payments_payer_position check (payer_position between 1 and 4),
  add constraint payments_position_only_for_bookings
    check (payer_position is null or (booking_id is not null and payer_id is null));
