begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(11);

-- Court 2 is booked in 8 days at 20:00.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(8, '20:00', 90), '00000000-0000-0000-0000-0000000000b1');

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.staff_create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(7, '20:00'), true,
       5, 6, 'mixed') $$,
  'reception creates a match');
select throws_ok(
  $$ select public.staff_create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(-1, '20:00'), true,
       5, 6, 'mixed') $$,
  'P0001', 'in_the_past', 'not in the past');
select throws_ok(
  $$ select public.staff_create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(20, '20:00'), true,
       5, 6, 'mixed') $$,
  'P0001', 'outside_window', 'not past the booking window');
select throws_ok(
  $$ select public.staff_create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(7, '21:30'), true,
       6, 5, 'mixed') $$,
  'P0001', 'invalid_input', 'the range goes from low to high');
select throws_ok(
  $$ select public.staff_create_match('c0000000-0000-0000-0000-000000000002', test_helpers.at(8, '20:00'), false,
       1, 8, 'mixed') $$,
  'P0001', 'slot_taken', 'not on a taken court when it cannot move');

reset role;
select results_eq(
  $$ select status::text, created_by, category_min::int, category_max::int, match_type::text, preferred_court_id
     from public.open_matches where id = test_helpers.match_at(7, '20:00') $$,
  $$ values ('forming', '00000000-0000-0000-0000-0000000000c1'::uuid, 5, 6, 'mixed',
             'c0000000-0000-0000-0000-000000000001'::uuid) $$,
  'a forming match, created by the staff member');
select is(
  (select count(*)::int from public.match_slots where match_id = test_helpers.match_at(7, '20:00') and player_id is null),
  4, 'with its four spots free');

-- Past its closing time a match cannot be created.
update public.clubs set match_close_hours = 48 where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok(
  $$ select public.staff_create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(1, '20:00'), true,
       5, 6, 'mixed') $$,
  'P0001', 'match_closed', 'not past its closing time');
reset role;
update public.clubs set match_close_hours = 3 where id = 'a0000000-0000-0000-0000-000000000001';

-- Without a price the slot cannot be played.
delete from public.pricing_rules where club_id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok(
  $$ select public.staff_create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(9, '20:00'), true,
       5, 6, 'mixed') $$,
  'P0001', 'no_price', 'not on a slot without a price');

-- Ana, a player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.staff_create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(10, '20:00'), true,
       5, 6, 'mixed') $$,
  'P0001', 'forbidden', 'players create their matches with create_match');

reset role;
select ok(not has_function_privilege('anon',
  'public.staff_create_match(uuid, timestamptz, boolean, integer, integer, public.match_type)', 'execute'),
  'anon cannot create matches');

select * from finish();
rollback;
