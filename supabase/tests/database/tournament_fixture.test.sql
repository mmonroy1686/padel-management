begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/tournament.psql
select plan(26);

-- Every pair of partners, one row per team per game.
create function test_helpers.partners(p_tournament_id uuid)
returns table (x uuid, y uuid)
language sql
stable
as $$
  select least(a1_entry_id, a2_entry_id), greatest(a1_entry_id, a2_entry_id)
  from public.tournament_games where tournament_id = p_tournament_id
  union all
  select least(b1_entry_id, b2_entry_id), greatest(b1_entry_id, b2_entry_id)
  from public.tournament_games where tournament_id = p_tournament_id;
$$;

-- One row per player per game.
create function test_helpers.appearances(p_tournament_id uuid)
returns table (round smallint, wave smallint, entry_id uuid)
language sql
stable
as $$
  select g.round, g.wave, e.entry_id
  from public.tournament_games g
  cross join lateral unnest(array[g.a1_entry_id, g.a2_entry_id, g.b1_entry_id, g.b2_entry_id]) as e (entry_id)
  where g.tournament_id = p_tournament_id;
$$;

create function test_helpers.first_game(p_tournament_id uuid)
returns uuid
language sql
stable
as $$
  select id from public.tournament_games where tournament_id = p_tournament_id
  order by round, wave, court_id limit 1;
$$;

-- Closed, on Cancha 1 and 2, full of guests: 8, 12 and 16 players. F10 has 10 of 12; FR is still
-- in registration.
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000008', test_helpers.slot(3, '18:00', 140),
  p_status => 'closed');
call test_helpers.add_guests('e3000000-0000-0000-0000-000000000008', 8);
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000012', test_helpers.slot(4, '10:00', 280),
  p_max => 12, p_status => 'closed');
call test_helpers.add_guests('e3000000-0000-0000-0000-000000000012', 12);
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000016', test_helpers.slot(5, '10:00', 280),
  p_max => 16, p_status => 'closed');
call test_helpers.add_guests('e3000000-0000-0000-0000-000000000016', 16);
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000010', test_helpers.slot(6, '10:00', 280),
  p_max => 12, p_status => 'closed');
call test_helpers.add_guests('e3000000-0000-0000-0000-000000000010', 10);
call test_helpers.make_tournament('e3000000-0000-0000-0000-0000000000ff', test_helpers.slot(7, '10:00', 140));
call test_helpers.add_guests('e3000000-0000-0000-0000-0000000000ff', 8);

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok($$ select public.start_tournament('e3000000-0000-0000-0000-000000000008') $$,
  'reception builds the fixture for 8');
select lives_ok($$ select public.start_tournament('e3000000-0000-0000-0000-000000000012') $$,
  'and for 12');
select lives_ok($$ select public.start_tournament('e3000000-0000-0000-0000-000000000016') $$,
  'and for 16');

reset role;
select results_eq(
  $$ select status::text, rounds::int from public.tournaments
     where id in ('e3000000-0000-0000-0000-000000000008', 'e3000000-0000-0000-0000-000000000012',
                  'e3000000-0000-0000-0000-000000000016')
     order by max_players $$,
  $$ values ('in_progress', 7), ('in_progress', 7), ('in_progress', 7) $$,
  'the three are in progress, with 7 rounds');
select results_eq(
  $$ select t.max_players::int, count(g.id)::int from public.tournaments t
     join public.tournament_games g on g.tournament_id = t.id
     group by t.max_players order by t.max_players $$,
  $$ values (8, 14), (12, 21), (16, 28) $$,
  'one game per four players in each round');
select is_empty(
  $$ select t.id, p.x, p.y
     from unnest(array['e3000000-0000-0000-0000-000000000008', 'e3000000-0000-0000-0000-000000000012',
                       'e3000000-0000-0000-0000-000000000016']::uuid[]) as t (id)
     cross join lateral test_helpers.partners(t.id) as p
     group by t.id, p.x, p.y having count(*) > 1 $$,
  'two players are partners at most once');
select is(
  (select count(distinct (x, y))::int from test_helpers.partners('e3000000-0000-0000-0000-000000000008')),
  28, 'with 8 players and 7 rounds, everyone partners everyone');
select is_empty(
  $$ select t.id, a.round, a.entry_id
     from unnest(array['e3000000-0000-0000-0000-000000000008', 'e3000000-0000-0000-0000-000000000012',
                       'e3000000-0000-0000-0000-000000000016']::uuid[]) as t (id)
     cross join lateral test_helpers.appearances(t.id) as a
     group by t.id, a.round, a.entry_id having count(*) > 1 $$,
  'nobody plays twice in the same round (so never twice in the same wave)');
select is_empty(
  $$ select t.id, a.entry_id
     from unnest(array['e3000000-0000-0000-0000-000000000008', 'e3000000-0000-0000-0000-000000000012',
                       'e3000000-0000-0000-0000-000000000016']::uuid[]) as t (id)
     cross join lateral test_helpers.appearances(t.id) as a
     group by t.id, a.entry_id having count(*) <> 7 $$,
  'everyone plays every round');
select results_eq(
  $$ select wave::int, count(*)::int from public.tournament_games
     where tournament_id = 'e3000000-0000-0000-0000-000000000012' and round = 1
     group by wave order by wave $$,
  $$ values (1, 2), (2, 1) $$,
  'three games on two courts: two in the first wave, one in the second');
select is_empty(
  $$ select g.id from public.tournament_games g join public.tournaments t on t.id = g.tournament_id
     where not (g.court_id = any (t.court_ids)) $$,
  'games only use the tournament courts');
select is_empty(
  $$ with w as (select tournament_id, max(wave) as waves from public.tournament_games group by tournament_id)
     select g.id from public.tournament_games g
     join public.tournaments t on t.id = g.tournament_id
     join w on w.tournament_id = g.tournament_id
     where g.starts_at <> t.starts_at
       + make_interval(mins => ((g.round - 1) * w.waves + g.wave - 1) * t.round_minutes) $$,
  'each game starts when its round and wave do');

set local role authenticated;
select throws_ok($$ select public.start_tournament('e3000000-0000-0000-0000-000000000010') $$,
  'P0001', 'not_enough_players', 'ten players do not make an americano');
select throws_ok($$ select public.start_tournament('e3000000-0000-0000-0000-0000000000ff') $$,
  'P0001', 'invalid_state', 'registration has to be closed first');
select throws_ok($$ select public.start_tournament('e3000000-0000-0000-0000-000000000008') $$,
  'P0001', 'invalid_state', 'the fixture is built once');

select throws_ok(
  $$ select public.record_tournament_score(test_helpers.first_game('e3000000-0000-0000-0000-000000000008'), 25) $$,
  'P0001', 'invalid_score', 'a team cannot score more than the game has');
select throws_ok(
  $$ select public.record_tournament_score(test_helpers.first_game('e3000000-0000-0000-0000-000000000008'), -1) $$,
  'P0001', 'invalid_score', 'nor less than zero');
select lives_ok(
  $$ select public.record_tournament_score(test_helpers.first_game('e3000000-0000-0000-0000-000000000008'), 14) $$,
  'reception records team A''s points');
select lives_ok(
  $$ select public.record_tournament_score(test_helpers.first_game('e3000000-0000-0000-0000-000000000008'), 10) $$,
  'and corrects them');
select is(
  (select score_a::int from public.tournament_games
   where id = test_helpers.first_game('e3000000-0000-0000-0000-000000000008')),
  10, 'the correction is what stays');
select throws_ok($$ select public.finish_tournament('e3000000-0000-0000-0000-000000000008') $$,
  'P0001', 'scores_missing', 'it finishes with every result in');

reset role;
update public.tournament_games set score_a = 12
 where tournament_id = 'e3000000-0000-0000-0000-000000000008' and score_a is null;
set local role authenticated;

select lives_ok($$ select public.finish_tournament('e3000000-0000-0000-0000-000000000008') $$,
  'reception finishes the tournament');
select is((select status::text from public.tournaments where id = 'e3000000-0000-0000-0000-000000000008'),
  'finished', 'it is finished');
select throws_ok(
  $$ select public.record_tournament_score(test_helpers.first_game('e3000000-0000-0000-0000-000000000008'), 12) $$,
  'P0001', 'invalid_state', 'results are fixed once it finished');

-- Ana, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.record_tournament_score(test_helpers.first_game('e3000000-0000-0000-0000-000000000012'), 12) $$,
  'P0001', 'forbidden', 'players do not record results');

-- Anonymous visitor
set local role anon;
select throws_ok($$ select public.start_tournament('e3000000-0000-0000-0000-000000000012') $$,
  '42501', null, 'anon cannot call start_tournament');

select * from finish();
rollback;
