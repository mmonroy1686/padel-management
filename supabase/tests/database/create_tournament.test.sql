begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/tournament.psql
select plan(21);

-- Ana's booking takes Cancha 1 on day 4 from 18:30 to 20:00.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(4, '18:30', 90), '00000000-0000-0000-0000-0000000000a1', 1600);

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.create_tournament('Americano de octubre', test_helpers.at(5, '18:00'),
       array['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002']::uuid[],
       8, 24, 20, 7, 4, 6, 'mixed', 400) $$,
  'reception creates an americano');
select results_eq(
  $$ select status::text, ends_at - starts_at, court_ids from public.tournaments
     where name = 'Americano de octubre' $$,
  $$ values ('registration', interval '140 minutes',
             array['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002']::uuid[]) $$,
  'registration opens and it lasts 7 rounds of 20 minutes');
select results_eq(
  $$ select o.court_id, o.kind::text from public.court_occupancy o
     join public.tournaments t on t.id = o.tournament_id
     where t.name = 'Americano de octubre' and o.period = t.period
     order by o.court_id $$,
  $$ values ('c0000000-0000-0000-0000-000000000001'::uuid, 'tournament'),
            ('c0000000-0000-0000-0000-000000000002'::uuid, 'tournament') $$,
  'it blocks each of its courts for the whole tournament');
select lives_ok(
  $$ select public.create_tournament('Americano de 12', test_helpers.at(6, '10:00'),
       array['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002']::uuid[],
       12, 24, 20, 7, 1, 8, 'male', 500) $$,
  'twelve players on two courts');
select is((select ends_at - starts_at from public.tournaments where name = 'Americano de 12'),
  interval '280 minutes', 'three games per round on two courts take two waves');
select throws_ok(
  $$ select public.create_tournament('Choca', test_helpers.at(4, '18:00'),
       array['c0000000-0000-0000-0000-000000000001']::uuid[], 8, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  'P0001', 'courts_busy', 'a court that is already taken stops it');
select is((select count(*)::int from public.tournaments where name = 'Choca'), 0, 'and nothing is left behind');
select throws_ok(
  $$ select public.create_tournament('Tarde', test_helpers.at(5, '22:00'),
       array['c0000000-0000-0000-0000-000000000002']::uuid[], 8, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  'P0001', 'outside_hours', 'it has to end before the club closes');
select throws_ok(
  $$ select public.create_tournament('Temprano', test_helpers.at(5, '07:00'),
       array['c0000000-0000-0000-0000-000000000002']::uuid[], 8, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  'P0001', 'outside_hours', 'and start after it opens');
select throws_ok(
  $$ select public.create_tournament('Ayer', test_helpers.at(-1, '18:00'),
       array['c0000000-0000-0000-0000-000000000002']::uuid[], 8, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  'P0001', 'in_the_past', 'not in the past');
select throws_ok(
  $$ select public.create_tournament('Diez', test_helpers.at(7, '10:00'),
       array['c0000000-0000-0000-0000-000000000002']::uuid[], 10, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  'P0001', 'invalid_input', 'the size is 8, 12 or 16');
select throws_ok(
  $$ select public.create_tournament('Muchas rondas', test_helpers.at(7, '10:00'),
       array['c0000000-0000-0000-0000-000000000002']::uuid[], 8, 24, 20, 8, 1, 8, 'mixed', 400) $$,
  'P0001', 'invalid_input', 'at most one round less than players');
select throws_ok(
  $$ select public.create_tournament('Repetida', test_helpers.at(7, '10:00'),
       array['c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002']::uuid[],
       8, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  'P0001', 'invalid_input', 'each court once');
select throws_ok(
  $$ select public.create_tournament('Al revés', test_helpers.at(7, '10:00'),
       array['c0000000-0000-0000-0000-000000000002']::uuid[], 8, 24, 20, 7, 6, 4, 'mixed', 400) $$,
  'P0001', 'invalid_input', 'the category range goes from low to high');
select throws_ok(
  $$ select public.create_tournament('Otra cancha', test_helpers.at(7, '10:00'),
       array['c0000000-0000-0000-0000-00000000dead']::uuid[], 8, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  'P0001', 'not_found', 'only active courts of the club');

select lives_ok(
  $$ select public.cancel_tournament((select id from public.tournaments where name = 'Americano de octubre')) $$,
  'reception cancels it');
select results_eq(
  $$ select t.status::text, (select count(*)::int from public.court_occupancy o where o.tournament_id = t.id)
     from public.tournaments t where t.name = 'Americano de octubre' $$,
  $$ values ('cancelled', 0) $$,
  'cancelled, and its courts are free again');
select throws_ok(
  $$ select public.cancel_tournament((select id from public.tournaments where name = 'Americano de octubre')) $$,
  'P0001', 'invalid_state', 'a tournament is cancelled once');

-- Ana, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.create_tournament('Mío', test_helpers.at(7, '10:00'),
       array['c0000000-0000-0000-0000-000000000002']::uuid[], 8, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  'P0001', 'forbidden', 'players do not create tournaments');
select throws_ok(
  $$ select public.cancel_tournament((select id from public.tournaments where name = 'Americano de 12')) $$,
  'P0001', 'forbidden', 'players do not cancel tournaments');

-- Anonymous visitor
set local role anon;
select throws_ok(
  $$ select public.create_tournament('Anónimo', now() + interval '7 days',
       array['c0000000-0000-0000-0000-000000000002']::uuid[], 8, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  '42501', null, 'anon cannot call create_tournament');

select * from finish();
rollback;
