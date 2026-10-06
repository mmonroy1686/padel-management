-- Campeonatos, día del torneo, part 1: the draw and the fixture. A category is drawn into groups (its pairs in
-- draw order) and a bracket; every match has a court, a start and a state, and its result is a list of sets. A
-- side not known yet says where it comes from: {"group": <group id>, "place": 1} or {"winner_of": <match id>}.
-- Every write goes through the functions of the next migrations: authenticated only reads.

alter table public.championships
  add column public_code text unique
    check (public_code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(public_code) between 3 and 40),
  add column draw_seed integer;

create type public.championship_stage as enum ('group', 'knockout');
create type public.championship_match_status as enum ('scheduled', 'playing', 'finished', 'walkover');

create table public.championship_groups (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  championship_id uuid not null,
  category_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 40),
  sort_order smallint not null default 0,
  -- Target for the composite FKs of members and matches.
  unique (id, club_id),
  unique (category_id, name),
  constraint championship_groups_championship_in_club
    foreign key (championship_id, club_id) references public.championships (id, club_id) on delete cascade,
  constraint championship_groups_category_in_club
    foreign key (category_id, club_id) references public.championship_categories (id, club_id) on delete cascade
);
create index championship_groups_championship_id_idx on public.championship_groups (championship_id);
create index championship_groups_category_id_idx on public.championship_groups (category_id);
alter table public.championship_groups enable row level security;

create table public.championship_group_members (
  group_id uuid not null,
  club_id uuid not null,
  entry_id uuid not null,
  draw_position smallint not null check (draw_position >= 1),
  -- Its final place, once the organizer closed the group (close_championship_group).
  place smallint check (place >= 1),
  primary key (group_id, entry_id),
  unique (group_id, draw_position),
  unique (group_id, place),
  constraint championship_group_members_group_in_club
    foreign key (group_id, club_id) references public.championship_groups (id, club_id) on delete cascade,
  constraint championship_group_members_entry_in_club
    foreign key (entry_id, club_id) references public.championship_entries (id, club_id) on delete cascade
);
create index championship_group_members_entry_id_idx on public.championship_group_members (entry_id);
alter table public.championship_group_members enable row level security;

create table public.championship_matches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  championship_id uuid not null,
  category_id uuid not null,
  stage public.championship_stage not null,
  group_id uuid,
  -- Knockout: 1 = final, 2 = semifinals, 4 = quarterfinals...; bracket_position goes from 1 to round.
  round smallint check (round >= 1),
  bracket_position smallint check (bracket_position >= 1),
  entry_a_id uuid,
  entry_b_id uuid,
  source_a jsonb,
  source_b jsonb,
  court_id uuid references public.courts (id),
  starts_at timestamptz,
  ends_at timestamptz,
  -- "Volver a programar" leaves a pinned match where it is.
  pinned boolean not null default false,
  status public.championship_match_status not null default 'scheduled',
  winner_entry_id uuid,
  -- W.O.: the pair that did not show up.
  walkover_entry_id uuid,
  recorded_by uuid references public.profiles (id) on delete set null,
  recorded_at timestamptz,
  -- Target for the composite FK of sets.
  unique (id, club_id),
  constraint championship_matches_championship_in_club
    foreign key (championship_id, club_id) references public.championships (id, club_id) on delete cascade,
  constraint championship_matches_category_in_club
    foreign key (category_id, club_id) references public.championship_categories (id, club_id) on delete cascade,
  constraint championship_matches_group_in_club
    foreign key (group_id, club_id) references public.championship_groups (id, club_id) on delete cascade,
  constraint championship_matches_entry_a_in_club
    foreign key (entry_a_id, club_id) references public.championship_entries (id, club_id) on delete cascade,
  constraint championship_matches_entry_b_in_club
    foreign key (entry_b_id, club_id) references public.championship_entries (id, club_id) on delete cascade,
  constraint championship_matches_winner_in_club
    foreign key (winner_entry_id, club_id) references public.championship_entries (id, club_id) on delete cascade,
  constraint championship_matches_stage check (
    (stage = 'group' and group_id is not null and round is null and bracket_position is null)
    or (stage = 'knockout' and group_id is null and round is not null and bracket_position is not null
        and bracket_position <= round)
  ),
  constraint championship_matches_two_pairs check (entry_a_id is null or entry_b_id is null or entry_a_id <> entry_b_id),
  constraint championship_matches_slot check (
    (court_id is null) = (starts_at is null) and (starts_at is null) = (ends_at is null)
    and (starts_at is null or starts_at < ends_at)
  ),
  constraint championship_matches_pinned check (not pinned or court_id is not null),
  constraint championship_matches_result check (
    (status in ('finished', 'walkover')) = (winner_entry_id is not null)
    and (status = 'walkover') = (walkover_entry_id is not null)
  ),
  -- Deferred: a whole schedule is saved at once, and two matches may swap courts on the way.
  constraint championship_matches_one_court
    exclude using gist (court_id with =, (tstzrange(starts_at, ends_at)) with &&)
    where (court_id is not null) deferrable initially deferred
);
create index championship_matches_championship_id_idx on public.championship_matches (championship_id);
create index championship_matches_category_id_idx on public.championship_matches (category_id);
create index championship_matches_group_id_idx on public.championship_matches (group_id);
create index championship_matches_entry_a_id_idx on public.championship_matches (entry_a_id);
create index championship_matches_entry_b_id_idx on public.championship_matches (entry_b_id);
alter table public.championship_matches enable row level security;

create table public.championship_match_sets (
  match_id uuid not null,
  club_id uuid not null,
  set_number smallint not null check (set_number between 1 and 3),
  games_a smallint not null check (games_a between 0 and 99),
  games_b smallint not null check (games_b between 0 and 99),
  super_tiebreak boolean not null default false,
  primary key (match_id, set_number),
  constraint championship_match_sets_match_in_club
    foreign key (match_id, club_id) references public.championship_matches (id, club_id) on delete cascade
);
alter table public.championship_match_sets enable row level security;

-- Staff see the fixture of their club's championships from the draw on; members, once it is published (until
-- then the organizer may draw again).
create function private.fixture_visible(p_championship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.championships ch
    where ch.id = p_championship_id
      and (
        private.has_club_role(ch.club_id, array['admin', 'reception']::public.club_role[])
        or (ch.status in ('published', 'in_progress', 'finished') and private.is_club_member(ch.club_id))
      )
  );
$$;

revoke all on function private.fixture_visible(uuid) from public;
grant execute on function private.fixture_visible(uuid) to authenticated;

revoke all on public.championship_groups, public.championship_group_members, public.championship_matches,
  public.championship_match_sets from anon, authenticated;
grant select on public.championship_groups, public.championship_group_members, public.championship_matches,
  public.championship_match_sets to authenticated;

create policy championship_groups_select on public.championship_groups
  for select to authenticated using (private.fixture_visible(championship_id));
-- Members and sets follow their group and match (the subquery goes through their RLS).
create policy championship_group_members_select on public.championship_group_members
  for select to authenticated
  using (exists (select 1 from public.championship_groups g where g.id = group_id));
create policy championship_matches_select on public.championship_matches
  for select to authenticated using (private.fixture_visible(championship_id));
create policy championship_match_sets_select on public.championship_match_sets
  for select to authenticated
  using (exists (select 1 from public.championship_matches m where m.id = match_id));
