begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(17);

-- M1: day 3 20:00, court 1 preferred (another court allowed), mixed 4th to 6th, Ana on spot 1.
-- Built as postgres: create_match has its own test.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '20:00', 90), array['00000000-0000-0000-0000-0000000000a1', null, null, null]::uuid[],
  'mixed', 4, 6);

set local role authenticated;

-- Bruno: male, backhand, 6th.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000001', 3) $$,
  'P0001', 'side_mismatch', 'a backhand player cannot take a drive spot');
select lives_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000001', 2) $$,
  'a player joins on his side');
select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000001', 4) $$,
  'P0001', 'already_in_match', 'a player takes one spot per match');

-- Juli: female, backhand, 6th.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000001', 2) $$,
  'P0001', 'spot_taken', 'a taken spot cannot be joined');
select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000001', 5) $$,
  'P0001', 'invalid_input', 'spots go from 1 to 4');

-- Hugo: male, drive, 4th.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';
select lives_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000001', 3) $$, 'the third player joins');
select is((select status::text from public.open_matches where id = 'e1000000-0000-0000-0000-000000000001'), 'forming',
  'with three players the match is still forming');

-- Meanwhile someone books court 1 at that time.
reset role;
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '20:00', 90), '00000000-0000-0000-0000-0000000000d1', 1600);
set local role authenticated;

-- Iván: male, backhand, 5th. The fourth player books the court in the same transaction.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a4", "role": "authenticated"}';
select lives_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000001', 4) $$, 'the fourth player joins');

reset role;
select results_eq(
  $$ select m.status::text, m.court_id, b.court_id, b.price, b.player_id is null, o.kind::text
     from public.open_matches m
     join public.bookings b on b.id = m.booking_id
     join public.court_occupancy o on o.id = b.occupancy_id
     where m.id = 'e1000000-0000-0000-0000-000000000001' $$,
  $$ values ('confirmed', 'c0000000-0000-0000-0000-000000000002'::uuid, 'c0000000-0000-0000-0000-000000000002'::uuid,
             1600, true, 'match') $$,
  'with four the match is confirmed and books another free court, at the slot price');
set local role authenticated;

-- Juli again: a confirmed match takes nobody else.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000001', 2) $$,
  'P0001', 'match_closed', 'a confirmed match is no longer open');

-- M2: day 5 10:00, only court 1, which is taken; three players in.
reset role;
call test_helpers.make_match('e1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(5, '10:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', null]::uuid[],
  'mixed', 1, 8, false);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(5, '10:00', 90), '00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a4", "role": "authenticated"}';

select lives_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000002', 4) $$,
  'the fourth player gets an answer even when no court is left');
select results_eq(
  $$ select status::text, cancel_reason, booking_id is null from public.open_matches
     where id = 'e1000000-0000-0000-0000-000000000002' $$,
  $$ values ('cancelled', 'no_court', true) $$,
  'without a court the match is cancelled and says why');

-- M3 is for men, M4 for 4th to 5th, M5 closes within the hour, M6 clashes with Juli's booking.
reset role;
call test_helpers.make_match('e1000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(6, '10:00', 90), array['00000000-0000-0000-0000-0000000000a3', null, null, null]::uuid[], 'male');
call test_helpers.make_match('e1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(6, '11:30', 90), array['00000000-0000-0000-0000-0000000000a3', null, null, null]::uuid[],
  'mixed', 4, 5);
call test_helpers.make_match('e1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002',
  tstzrange(now() + interval '1 hour', now() + interval '150 minutes'),
  array['00000000-0000-0000-0000-0000000000a3', null, null, null]::uuid[]);
call test_helpers.make_match('e1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(6, '13:00', 90), array['00000000-0000-0000-0000-0000000000a3', null, null, null]::uuid[]);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(6, '13:00', 90), '00000000-0000-0000-0000-0000000000a5');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';

select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000003', 2) $$,
  'P0001', 'type_mismatch', 'a woman cannot join a men''s match');
select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000004', 2) $$,
  'P0001', 'category_mismatch', 'a 6th category player cannot join a 4th to 5th match');
select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000005', 2) $$,
  'P0001', 'match_closed', 'nobody joins after the closing time');
select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000006', 2) $$,
  'P0001', 'busy_at_that_time', 'a player cannot be in two places at once');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000006', 2) $$,
  'P0001', 'forbidden', 'only members join');

select * from finish();
rollback;
