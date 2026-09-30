begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/tournament.psql
select plan(25);

-- T1: mixed, 5ª a 6ª, day 3 18:00. T2: female, day 4. T3: registration closed, day 6.
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000001', test_helpers.slot(3, '18:00', 140),
  p_category_min => 5, p_category_max => 6);
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000002', test_helpers.slot(4, '18:00', 140),
  p_type => 'female');
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000003', test_helpers.slot(6, '18:00', 140),
  p_status => 'closed');
-- Bruno already has a booking during T1.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(3, '18:30', 90), '00000000-0000-0000-0000-0000000000b1', 1600);

set local role authenticated;

-- Ana: female, 5ª
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000001') $$, 'a player signs up');
select results_eq(
  $$ select player_id, guest_name from public.tournament_entries
     where tournament_id = 'e3000000-0000-0000-0000-000000000001' $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, null::text) $$,
  'her entry is in');
select throws_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000001') $$,
  'P0001', 'already_in_tournament', 'once per tournament');

-- Hugo: male, 4ª
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';
select throws_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000001') $$,
  'P0001', 'category_mismatch', 'the category has to be in the range');

-- Bruno: male, 6ª, busy during T1
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000002') $$,
  'P0001', 'type_mismatch', 'a female tournament is for women');
select throws_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000001') $$,
  'P0001', 'busy_at_that_time', 'nobody signs up while having something else at that time');

-- Juli: female, 6ª
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
select throws_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000003') $$,
  'P0001', 'tournament_closed', 'not once registration closed');

-- Six guests: T1 has 7.
reset role;
call test_helpers.add_guests('e3000000-0000-0000-0000-000000000001', 6);
set local role authenticated;

-- Gabi: female, 5ª
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select lives_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000001') $$, 'the eighth one gets in');

-- Iván: male, 5ª
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a4", "role": "authenticated"}';
select throws_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000001') $$,
  'P0001', 'tournament_full', 'no room for a ninth');

-- Ana leaves while registration is open.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok($$ select public.leave_tournament('e3000000-0000-0000-0000-000000000001') $$,
  'a player leaves while registration is open');
select is(
  (select removed_at is not null from public.tournament_entries
   where tournament_id = 'e3000000-0000-0000-0000-000000000001'
     and player_id = '00000000-0000-0000-0000-0000000000a1'),
  true, 'her entry stays, marked as removed');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a4", "role": "authenticated"}';
select lives_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000001') $$,
  'her spot is free for someone else');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
select throws_ok($$ select public.leave_tournament('e3000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'only players who signed up leave');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok($$ select public.add_tournament_guest('e3000000-0000-0000-0000-000000000001', 'Pepe') $$,
  'P0001', 'tournament_full', 'guests need room too');
select lives_ok($$ select public.close_tournament_registration('e3000000-0000-0000-0000-000000000001') $$,
  'reception closes registration');
select is((select status::text from public.tournaments where id = 'e3000000-0000-0000-0000-000000000001'),
  'closed', 'registration is closed');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select throws_ok($$ select public.leave_tournament('e3000000-0000-0000-0000-000000000001') $$,
  'P0001', 'tournament_closed', 'players cannot leave once registration closed');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.remove_tournament_entry(test_helpers.entry_of('e3000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-0000000000a2')) $$,
  'reception takes a player out until it starts');
select lives_ok($$ select public.add_tournament_guest('e3000000-0000-0000-0000-000000000001', ' Pepe ') $$,
  'and adds a guest');
select throws_ok($$ select public.add_tournament_guest('e3000000-0000-0000-0000-000000000001', '   ') $$,
  'P0001', 'invalid_input', 'a guest has a name');
select throws_ok(
  $$ select public.remove_tournament_entry((select id from public.tournament_entries
       where tournament_id = 'e3000000-0000-0000-0000-000000000001'
         and player_id = '00000000-0000-0000-0000-0000000000a2')) $$,
  'P0001', 'invalid_state', 'an entry is removed once');
select lives_ok($$ select public.reopen_tournament_registration('e3000000-0000-0000-0000-000000000001') $$,
  'reception reopens registration');
select throws_ok($$ select public.reopen_tournament_registration('e3000000-0000-0000-0000-000000000001') $$,
  'P0001', 'invalid_state', 'only a closed registration reopens');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok($$ select public.close_tournament_registration('e3000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'players do not close registration');

-- Anonymous visitor
set local role anon;
select throws_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'anon cannot call join_tournament');

select * from finish();
rollback;
