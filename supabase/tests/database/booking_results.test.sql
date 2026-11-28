begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(16);

-- Ana (a1) booked yesterday with Bruno (b1) and two guests; one more booking tomorrow. Carla (c1) is reception.
call test_helpers.make_booking('b5000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(-1, '10:00', 90), '00000000-0000-0000-0000-0000000000a1');
call test_helpers.make_booking('b5000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(1, '10:00', 90), '00000000-0000-0000-0000-0000000000a1');
insert into public.booking_players (booking_id, club_id, position, player_id, name) values
  ('b5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 2, '00000000-0000-0000-0000-0000000000b1', null),
  ('b5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 3, null, 'Pedro');

set local role authenticated;

-- Bruno played: he writes it, but not before the 4 are there.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$ select public.save_booking_result('b5000000-0000-0000-0000-000000000001', '{1,2}', '{6}', '{4}') $$,
  'P0001', 'incomplete_players', 'the 4 players are needed');
reset role;
insert into public.booking_players (booking_id, club_id, position, name)
values ('b5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 4, 'Juan');
set local role authenticated;
select throws_ok(
  $$ select public.save_booking_result('b5000000-0000-0000-0000-000000000001', '{1,1}', '{6}', '{4}') $$,
  'P0001', 'invalid_input', 'a pair is two different players');
select throws_ok(
  $$ select public.save_booking_result('b5000000-0000-0000-0000-000000000001', '{1,2}', '{6,3}', '{4,6}') $$,
  'P0001', 'invalid_sets', 'someone has to win');
select throws_ok(
  $$ select public.save_booking_result('b5000000-0000-0000-0000-000000000001', '{1,2}', '{6}', '{6}') $$,
  'P0001', 'invalid_sets', 'a set has a winner');
select throws_ok(
  $$ select public.save_booking_result('b5000000-0000-0000-0000-000000000001', '{1,2}', '{6,3,7,6}', '{4,6,5,4}') $$,
  'P0001', 'invalid_sets', 'three sets at most');
select lives_ok(
  $$ select public.save_booking_result('b5000000-0000-0000-0000-000000000001', '{2,1}', '{6,3,7}', '{4,6,5}') $$,
  'Bruno writes the result');
select throws_ok(
  $$ select public.save_booking_result('b5000000-0000-0000-0000-000000000002', '{1,2}', '{6}', '{4}') $$,
  'P0001', 'forbidden', 'not for a booking he is not in');

-- Ana reads it and her history.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select results_eq(
  $$ select team_a, games_a, games_b from public.booking_results $$,
  $$ values ('{1,2}'::smallint[], '{6,3,7}'::smallint[], '{4,6,5}'::smallint[]) $$,
  'a player of the booking reads it, the pair sorted');
select throws_ok(
  $$ select public.save_booking_result('b5000000-0000-0000-0000-000000000002', '{1,2}', '{6}', '{4}') $$,
  'P0001', 'not_played_yet', 'a booking that did not start yet has no result');
select results_eq(
  $$ select count(*)::int, (select jsonb_array_length(players) from public.my_played_bookings('a0000000-0000-0000-0000-000000000001'))
     from public.my_played_bookings('a0000000-0000-0000-0000-000000000001') $$,
  $$ values (1, 4) $$, 'her history: the played booking, with its 4 players');
select is(
  (select games_a from public.my_played_bookings('a0000000-0000-0000-0000-000000000001')),
  '{6,3,7}'::smallint[], 'and its result');

-- Dani (admin) is staff: she corrects it. Somebody else does not see it.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select lives_ok(
  $$ select public.save_booking_result('b5000000-0000-0000-0000-000000000001', '{1,3}', '{6}', '{2}') $$,
  'staff corrects it');
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e9', 'eva@test.local');
insert into public.club_members (club_id, user_id, role)
values ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e9', 'player');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e9", "role": "authenticated"}';
select is((select count(*)::int from public.booking_results), 0, 'a player who was not there does not read it');
select throws_ok($$ select public.clear_booking_result('b5000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'nor clears it');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok($$ select public.clear_booking_result('b5000000-0000-0000-0000-000000000001') $$, 'Ana clears it');
select is((select count(*)::int from public.booking_results), 0, 'gone');

select finish();
rollback;
