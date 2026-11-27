-- Americano con parejas fijas. The club picks the format when it creates the americano: partners rotate every round
-- (as before) or each pair plays the whole tournament together, every pair against every other. A player signs up
-- with a member of the club as partner, or alone ("busca pareja") for the club to pair her before the start; staff
-- pair, split and add guests as partners. Each player still pays her own entry.

create type public.tournament_format as enum ('rotating', 'fixed_pairs');

alter table public.tournaments add column format public.tournament_format not null default 'rotating';
-- With fixed pairs, every pair meets every other at most once: pairs − 1 rounds.
alter table public.tournaments drop constraint tournaments_rounds;
alter table public.tournaments add constraint tournaments_rounds check (
  rounds between 1 and (case when format = 'fixed_pairs' then max_players / 2 else max_players end) - 1
);

-- Two active entries of a tournament share it; null is someone looking for a partner. Only the functions write it.
alter table public.tournament_entries add column pair_id uuid;
create index tournament_entries_pair_id_idx on public.tournament_entries (pair_id) where pair_id is not null;

-- The name an entry shows: the guest's, or the member's.
create function private.tournament_entry_name(p_entry public.tournament_entries)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(p_entry.guest_name, (select p.display_name from public.profiles p where p.id = p_entry.player_id), 'Jugador');
$$;

-- An aviso to the member of an entry about her partner (event: added, paired or left). Not to whoever did it, and
-- not to guests.
create function private.notify_tournament_pair(p_entry public.tournament_entries, p_partner_name text, p_event text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_tournament public.tournaments;
begin
  if p_entry.player_id is null or p_entry.player_id is not distinct from (select auth.uid()) then
    return;
  end if;
  select * into v_tournament from public.tournaments where id = p_entry.tournament_id;
  insert into public.notifications (club_id, user_id, kind, data, link)
  values (v_tournament.club_id, p_entry.player_id, 'tournament_pair',
          jsonb_build_object('tournament_id', v_tournament.id, 'tournament_name', v_tournament.name,
                             'partner_name', p_partner_name, 'event', p_event, 'starts_at', v_tournament.starts_at),
          '/torneos/' || v_tournament.id);
end;
$$;

drop function public.create_tournament(text, timestamptz, uuid[], integer, integer, integer, integer, integer, integer,
  public.match_type, integer);

create function public.create_tournament(
  p_name text,
  p_starts_at timestamptz,
  p_court_ids uuid[],
  p_max_players integer,
  p_points_per_game integer,
  p_round_minutes integer,
  p_rounds integer,
  p_category_min integer,
  p_category_max integer,
  p_type public.match_type,
  p_price integer,
  p_format public.tournament_format default 'rotating'
)
returns public.tournaments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(p_name);
  v_club public.clubs;
  v_period tstzrange;
  v_local_start timestamp;
  v_tournament public.tournaments;
  v_court_id uuid;
begin
  if p_court_ids is null or cardinality(p_court_ids) = 0 then
    perform private.fail('invalid_input');
  end if;
  select * into v_club from public.clubs where id = private.active_court_club(p_court_ids[1]);
  if not private.is_staff(v_club.id) then
    perform private.fail('forbidden');
  end if;
  if v_name is null or length(v_name) not between 1 and 60
     or p_starts_at is null
     or p_format is null
     or p_max_players is null or p_max_players not in (8, 12, 16)
     or array_position(p_court_ids, null) is not null
     or cardinality(p_court_ids) > p_max_players / 4
     or (select count(distinct u.court_id) from unnest(p_court_ids) as u (court_id)) <> cardinality(p_court_ids)
     or exists (
       select 1 from unnest(p_court_ids) as u (court_id)
       where not exists (
         select 1 from public.courts c where c.id = u.court_id and c.club_id = v_club.id and c.is_active
       )
     )
     or p_points_per_game is null or p_points_per_game not between 1 and 99
     or p_round_minutes is null or p_round_minutes not between 5 and 90
     or p_rounds is null
     or p_rounds not between 1 and (case when p_format = 'fixed_pairs' then p_max_players / 2 else p_max_players end) - 1
     or p_category_min is null or p_category_max is null
     or p_category_min not between 1 and 8 or p_category_max not between 1 and 8
     or p_category_min > p_category_max
     or p_type is null
     or p_price is null or p_price not between 0 and 10000000 then
    perform private.fail('invalid_input');
  end if;
  if p_starts_at <= now() then
    perform private.fail('in_the_past');
  end if;

  v_period := tstzrange(
    p_starts_at,
    p_starts_at + make_interval(mins => private.tournament_minutes(p_max_players, cardinality(p_court_ids),
                                                                   p_rounds, p_round_minutes))
  );
  -- Inside the club's hours on its clock, start and end on the same day.
  v_local_start := p_starts_at at time zone v_club.timezone;
  if v_local_start < v_local_start::date + v_club.opens_at
     or (upper(v_period) at time zone v_club.timezone) > v_local_start::date + v_club.closes_at then
    perform private.fail('outside_hours');
  end if;

  insert into public.tournaments (club_id, name, period, court_ids, max_players, points_per_game, round_minutes,
                                  rounds, category_min, category_max, match_type, price, format, created_by)
  values (v_club.id, v_name, v_period, p_court_ids, p_max_players, p_points_per_game, p_round_minutes, p_rounds,
          p_category_min, p_category_max, p_type, p_price, p_format, (select auth.uid()))
  returning * into v_tournament;

  -- The exclusion constraint has the last word on double booking.
  foreach v_court_id in array p_court_ids loop
    begin
      insert into public.court_occupancy (club_id, court_id, kind, period, note, tournament_id, created_by)
      values (v_club.id, v_court_id, 'tournament', v_period, v_name, v_tournament.id, (select auth.uid()));
    exception when exclusion_violation then
      perform private.fail('courts_busy');
    end;
  end loop;

  return v_tournament;
end;
$$;

-- The player signs up with a member of the club as partner. The partner goes through the same rules as she does
-- (category, gender, not already in, nothing else at that time) and gets an aviso. Both spots are taken at once.
create function public.join_tournament_pair(p_tournament_id uuid, p_partner_id uuid)
returns public.tournament_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tournament public.tournaments;
  v_fit text;
  v_pair uuid := gen_random_uuid();
  v_entry public.tournament_entries;
  v_partner_entry public.tournament_entries;
begin
  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null or not private.is_club_member(v_tournament.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_tournament.format <> 'fixed_pairs' or p_partner_id is null or p_partner_id = v_uid then
    perform private.fail('invalid_input');
  end if;
  if not exists (select 1 from public.club_members where club_id = v_tournament.club_id and user_id = p_partner_id) then
    perform private.fail('partner_mismatch');
  end if;
  -- Both players' locks, always in the same order, like book_slot's.
  perform pg_advisory_xact_lock(hashtextextended('book_slot:' || least(v_uid, p_partner_id)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('book_slot:' || greatest(v_uid, p_partner_id)::text, 0));

  if v_tournament.status <> 'registration' or v_tournament.starts_at <= now() then
    perform private.fail('tournament_closed');
  end if;
  if exists (
    select 1 from public.tournament_entries
    where tournament_id = v_tournament.id and player_id = v_uid and removed_at is null
  ) then
    perform private.fail('already_in_tournament');
  end if;
  if exists (
    select 1 from public.tournament_entries
    where tournament_id = v_tournament.id and player_id = p_partner_id and removed_at is null
  ) then
    perform private.fail('partner_already_in');
  end if;
  if private.active_entry_count(v_tournament.id) + 2 > v_tournament.max_players then
    perform private.fail('tournament_full');
  end if;
  v_fit := private.tournament_fit(v_uid, v_tournament);
  if v_fit is not null then
    perform private.fail(v_fit);
  end if;
  if private.tournament_fit(p_partner_id, v_tournament) is not null then
    perform private.fail('partner_mismatch');
  end if;
  if private.is_busy(v_uid, v_tournament.period) then
    perform private.fail('busy_at_that_time');
  end if;
  if private.is_busy(p_partner_id, v_tournament.period) then
    perform private.fail('partner_busy');
  end if;

  insert into public.tournament_entries (club_id, tournament_id, player_id, pair_id, created_by)
  values (v_tournament.club_id, v_tournament.id, v_uid, v_pair, v_uid)
  returning * into v_entry;
  insert into public.tournament_entries (club_id, tournament_id, player_id, pair_id, created_by)
  values (v_tournament.club_id, v_tournament.id, p_partner_id, v_pair, v_uid)
  returning * into v_partner_entry;
  perform private.notify_tournament_pair(v_partner_entry, private.tournament_entry_name(v_entry), 'added');
  return v_entry;
end;
$$;

-- Leaving or being taken out: the partner stays in, looking for a partner again, and gets an aviso.
create or replace function private.drop_entry(p_entry public.tournament_entries, p_reason text)
returns public.tournament_entries
language plpgsql
set search_path = ''
as $$
declare
  v_entry public.tournament_entries;
  v_partner public.tournament_entries;
begin
  if p_entry.removed_at is not null then
    perform private.fail('invalid_state');
  end if;
  -- Payments before the entry, the same order as confirm_payment, so the two cannot deadlock.
  perform 1 from public.payments where tournament_entry_id = p_entry.id and status = 'reported' for update;
  update public.tournament_entries set removed_at = now(), removed_by = (select auth.uid()), pair_id = null
   where id = p_entry.id
  returning * into v_entry;
  update public.payments
     set status = 'rejected', rejection_reason = p_reason,
         confirmed_by = (select auth.uid()), confirmed_at = now()
   where tournament_entry_id = p_entry.id and status = 'reported';
  if p_entry.pair_id is not null then
    for v_partner in
      update public.tournament_entries set pair_id = null
       where pair_id = p_entry.pair_id and removed_at is null
      returning *
    loop
      perform private.notify_tournament_pair(v_partner, private.tournament_entry_name(v_entry), 'left');
    end loop;
  end if;
  return v_entry;
end;
$$;

-- Staff pair two players who were looking for a partner. Both get an aviso.
create function public.pair_tournament_entries(p_entry_a uuid, p_entry_b uuid)
returns public.tournament_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.tournament_entries;
  v_b public.tournament_entries;
  v_tournament public.tournaments;
  v_pair uuid := gen_random_uuid();
begin
  select * into v_a from public.tournament_entries where id = p_entry_a;
  if not found then
    perform private.fail('not_found');
  end if;
  v_tournament := private.staff_tournament(v_a.tournament_id);
  if v_tournament.format <> 'fixed_pairs' or v_tournament.status not in ('registration', 'closed') then
    perform private.fail('invalid_state');
  end if;
  select * into v_a from public.tournament_entries where id = p_entry_a for update;
  select * into v_b from public.tournament_entries where id = p_entry_b for update;
  if not found or v_a.id = v_b.id or v_b.tournament_id <> v_a.tournament_id
     or v_a.removed_at is not null or v_b.removed_at is not null then
    perform private.fail('invalid_input');
  end if;
  if v_a.pair_id is not null or v_b.pair_id is not null then
    perform private.fail('already_paired');
  end if;

  update public.tournament_entries set pair_id = v_pair where id in (v_a.id, v_b.id);
  perform private.notify_tournament_pair(v_a, private.tournament_entry_name(v_b), 'paired');
  perform private.notify_tournament_pair(v_b, private.tournament_entry_name(v_a), 'paired');
  select * into v_a from public.tournament_entries where id = v_a.id;
  return v_a;
end;
$$;

-- Staff split a pair until the fixture is built: both look for a partner again.
create function public.split_tournament_pair(p_entry_id uuid)
returns public.tournament_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.tournament_entries;
  v_tournament public.tournaments;
begin
  select * into v_entry from public.tournament_entries where id = p_entry_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_tournament := private.staff_tournament(v_entry.tournament_id);
  if v_tournament.status not in ('registration', 'closed') or v_entry.pair_id is null or v_entry.removed_at is not null then
    perform private.fail('invalid_state');
  end if;
  update public.tournament_entries set pair_id = null where pair_id = v_entry.pair_id;
  select * into v_entry from public.tournament_entries where id = p_entry_id;
  return v_entry;
end;
$$;

-- A guest, optionally straight in as the partner of someone looking for one (who gets an aviso).
drop function public.add_tournament_guest(uuid, text);

create function public.add_tournament_guest(p_tournament_id uuid, p_name text, p_partner_entry_id uuid default null)
returns public.tournament_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament public.tournaments := private.staff_tournament(p_tournament_id);
  v_name text := trim(p_name);
  v_partner public.tournament_entries;
  v_pair uuid;
  v_entry public.tournament_entries;
begin
  if v_name is null or length(v_name) not between 1 and 60 then
    perform private.fail('invalid_input');
  end if;
  if v_tournament.status not in ('registration', 'closed') then
    perform private.fail('invalid_state');
  end if;
  if private.active_entry_count(v_tournament.id) >= v_tournament.max_players then
    perform private.fail('tournament_full');
  end if;
  if p_partner_entry_id is not null then
    select * into v_partner from public.tournament_entries where id = p_partner_entry_id for update;
    if not found or v_partner.tournament_id <> v_tournament.id or v_partner.removed_at is not null
       or v_tournament.format <> 'fixed_pairs' then
      perform private.fail('invalid_input');
    end if;
    if v_partner.pair_id is not null then
      perform private.fail('already_paired');
    end if;
    v_pair := gen_random_uuid();
    update public.tournament_entries set pair_id = v_pair where id = v_partner.id returning * into v_partner;
  end if;

  insert into public.tournament_entries (club_id, tournament_id, guest_name, pair_id, created_by)
  values (v_tournament.club_id, v_tournament.id, v_name, v_pair, (select auth.uid()))
  returning * into v_entry;
  if v_partner.id is not null then
    perform private.notify_tournament_pair(v_partner, v_name, 'paired');
  end if;
  return v_entry;
end;
$$;

-- The fixture. Partners rotate (circle method over the players, as before), or with fixed pairs every pair plays
-- every other: the same circle method over the pairs, each game pair against pair. The order is shuffled.
create or replace function public.start_tournament(p_tournament_id uuid)
returns public.tournaments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament public.tournaments := private.staff_tournament(p_tournament_id);
  v_entries uuid[];
  v_teams uuid[];
  v_order uuid[];
  v_n integer;
  v_t integer;
  v_rounds integer;
  v_courts integer;
  v_games integer;
  v_waves integer;
  v_pairs uuid[];
  v_round integer;
  v_game integer;
  v_k integer;
  v_team uuid;
begin
  if v_tournament.status <> 'closed' then
    perform private.fail('invalid_state');
  end if;

  select array_agg(e.id order by random()) into v_entries
  from public.tournament_entries e
  where e.tournament_id = v_tournament.id and e.removed_at is null;
  v_n := coalesce(cardinality(v_entries), 0);
  if v_n not in (8, 12, 16) then
    perform private.fail('not_enough_players');
  end if;

  v_courts := cardinality(v_tournament.court_ids);
  v_games := v_n / 4;
  v_waves := ceil(v_games::numeric / v_courts)::integer;

  if v_tournament.format = 'fixed_pairs' then
    if exists (
      select 1 from public.tournament_entries
      where tournament_id = v_tournament.id and removed_at is null and pair_id is null
    ) then
      perform private.fail('unpaired_players');
    end if;
    select array_agg(s.pair_id order by random()) into v_teams
    from (
      select pair_id from public.tournament_entries
      where tournament_id = v_tournament.id and removed_at is null
      group by pair_id
      having count(*) = 2
    ) s;
    v_t := coalesce(cardinality(v_teams), 0);
    if v_t * 2 <> v_n then
      perform private.fail('invalid_state');
    end if;
    v_rounds := least(v_tournament.rounds, v_t - 1);
  else
    v_rounds := least(v_tournament.rounds, v_n - 1);
  end if;

  for v_round in 0 .. v_rounds - 1 loop
    -- Flat list of entries, four per game: a1, a2, b1, b2.
    if v_tournament.format = 'fixed_pairs' then
      -- The rotating circle, over the pairs: consecutive pairs play each other.
      v_order := array[v_teams[v_round + 1], v_teams[v_t]];
      for v_k in 1 .. v_t / 2 - 1 loop
        v_order := v_order
          || v_teams[(v_round + v_k) % (v_t - 1) + 1]
          || v_teams[(v_round - v_k + v_t - 1) % (v_t - 1) + 1];
      end loop;
      v_pairs := array[]::uuid[];
      foreach v_team in array v_order loop
        v_pairs := v_pairs || array(
          select e.id from public.tournament_entries e
          where e.pair_id = v_team and e.removed_at is null
          order by e.created_at, e.id
        );
      end loop;
    else
      -- Pair k is (v_pairs[2k + 1], v_pairs[2k + 2]); consecutive pairs play each other.
      v_pairs := array[v_entries[v_round + 1], v_entries[v_n]];
      for v_k in 1 .. v_n / 2 - 1 loop
        v_pairs := v_pairs
          || v_entries[(v_round + v_k) % (v_n - 1) + 1]
          || v_entries[(v_round - v_k + v_n - 1) % (v_n - 1) + 1];
      end loop;
    end if;

    for v_game in 0 .. v_games - 1 loop
      insert into public.tournament_games (club_id, tournament_id, round, wave, court_id, starts_at,
                                           a1_entry_id, a2_entry_id, b1_entry_id, b2_entry_id)
      values (
        v_tournament.club_id, v_tournament.id, v_round + 1, v_game / v_courts + 1,
        v_tournament.court_ids[v_game % v_courts + 1],
        lower(v_tournament.period)
          + make_interval(mins => (v_round * v_waves + v_game / v_courts) * v_tournament.round_minutes),
        v_pairs[4 * v_game + 1], v_pairs[4 * v_game + 2], v_pairs[4 * v_game + 3], v_pairs[4 * v_game + 4]
      );
    end loop;
  end loop;

  -- The period was sized for the maximum; with fewer players or rounds it ends earlier, so the courts
  -- and the players are free again after the real end.
  update public.tournaments
     set status = 'in_progress', rounds = v_rounds,
         period = tstzrange(lower(period), lower(period) + make_interval(
           mins => private.tournament_minutes(v_n, v_courts, v_rounds, round_minutes)))
   where id = v_tournament.id
  returning * into v_tournament;
  update public.court_occupancy set period = v_tournament.period where tournament_id = v_tournament.id;
  return v_tournament;
end;
$$;

revoke all on function private.tournament_entry_name(public.tournament_entries) from public;
revoke all on function private.notify_tournament_pair(public.tournament_entries, text, text) from public;
revoke execute on function public.create_tournament(text, timestamptz, uuid[], integer, integer, integer, integer,
  integer, integer, public.match_type, integer, public.tournament_format) from public, anon;
revoke execute on function public.join_tournament_pair(uuid, uuid) from public, anon;
revoke execute on function public.pair_tournament_entries(uuid, uuid) from public, anon;
revoke execute on function public.split_tournament_pair(uuid) from public, anon;
revoke execute on function public.add_tournament_guest(uuid, text, uuid) from public, anon;
grant execute on function public.create_tournament(text, timestamptz, uuid[], integer, integer, integer, integer,
  integer, integer, public.match_type, integer, public.tournament_format) to authenticated;
grant execute on function public.join_tournament_pair(uuid, uuid) to authenticated;
grant execute on function public.pair_tournament_entries(uuid, uuid) to authenticated;
grant execute on function public.split_tournament_pair(uuid) to authenticated;
grant execute on function public.add_tournament_guest(uuid, text, uuid) to authenticated;
