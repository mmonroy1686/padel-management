-- Campeonatos, gestión en vivo, part 1: the live score. Reception loads the games of a match being played one by
-- one ("+1"); its sets are worked out again from them after every game (next migration) and
-- championship_match_sets marks the one being played. Nobody reads the games directly: the screens show the sets.

create table public.championship_live_games (
  match_id uuid not null,
  club_id uuid not null,
  -- The order the games were loaded in: 1, 2, 3...
  seq integer not null check (seq >= 1),
  side text not null check (side in ('a', 'b')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (match_id, seq),
  constraint championship_live_games_match_in_club
    foreign key (match_id, club_id) references public.championship_matches (id, club_id) on delete cascade
);
alter table public.championship_live_games enable row level security;
revoke all on public.championship_live_games from anon, authenticated;

-- The set being played (at most one per match); the others are closed.
alter table public.championship_match_sets add column in_progress boolean not null default false;
create unique index championship_match_sets_one_in_progress
  on public.championship_match_sets (match_id) where in_progress;
