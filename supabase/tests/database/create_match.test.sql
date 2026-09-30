begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(15);

-- Ana: female, drive, 5th category.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(3, '20:15'), true, 4, 6, 'mixed', 'drive') $$,
  'P0001', 'not_aligned', 'a match starts on the grid');
select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(-1, '20:00'), true, 4, 6, 'mixed', 'drive') $$,
  'P0001', 'in_the_past', 'no matches in the past');
select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(15, '20:00'), true, 4, 6, 'mixed', 'drive') $$,
  'P0001', 'outside_window', 'no matches beyond the booking window');
select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(3, '20:00'), true, 6, 8, 'mixed', 'drive') $$,
  'P0001', 'category_mismatch', 'the creator fits the category range');
select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(3, '20:00'), true, 4, 6, 'male', 'drive') $$,
  'P0001', 'type_mismatch', 'the creator fits the match type');
select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(3, '20:00'), true, 4, 6, 'mixed', 'backhand') $$,
  'P0001', 'side_mismatch', 'the creator takes the side she plays');
select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(3, '20:00'), true, 4, 6, 'mixed', 'both') $$,
  'P0001', 'invalid_input', 'the creator takes drive or backhand');
select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(3, '20:00'), true, 6, 4, 'mixed', 'drive') $$,
  'P0001', 'invalid_input', 'the range goes from low to high');

select lives_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(3, '20:00'), true, 4, 6, 'mixed', 'drive') $$,
  'a player creates an open match');
select results_eq(
  $$ select position::int, team, side::text, player_id from public.match_slots
     where match_id = test_helpers.match_at(3, '20:00') order by position $$,
  $$ values (1, 'A', 'drive', '00000000-0000-0000-0000-0000000000a1'::uuid), (2, 'A', 'backhand', null::uuid),
            (3, 'B', 'drive', null::uuid), (4, 'B', 'backhand', null::uuid) $$,
  'four spots, the creator in team A on her side');
select is((select count(*)::int from public.court_occupancy where starts_at = test_helpers.at(3, '20:00')), 0,
  'a forming match holds no court');
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000002', test_helpers.at(3, '20:00')) $$,
  'P0001', 'busy_at_that_time', 'a player in a match cannot book another court at that time');

-- Court 2 is booked at day 4 11:00, and for a moment the club closes matches 48 h before.
reset role;
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(4, '11:00', 90), '00000000-0000-0000-0000-0000000000d1');
update public.clubs set match_close_hours = 48 where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;

select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(1, '20:00'), true, 4, 6, 'mixed', 'drive') $$,
  'P0001', 'match_closed', 'no new matches after the closing time');

reset role;
update public.clubs set match_close_hours = 3 where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;

select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000002', test_helpers.at(4, '11:00'), false, 4, 6, 'mixed', 'drive') $$,
  'P0001', 'slot_taken', 'with no other court allowed, the preferred court has to be free');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(5, '10:00'), true, 1, 8, 'mixed', 'drive') $$,
  'P0001', 'forbidden', 'only members create matches');

select * from finish();
rollback;
