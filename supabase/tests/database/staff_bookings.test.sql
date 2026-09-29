begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(20);

-- Carla, reception
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000001', test_helpers.at(20, '08:00'),
       p_player_id => '00000000-0000-0000-0000-0000000000a1') $$,
  'reception books for a player, even beyond the booking window');
select results_eq(
  $$ select source::text, price, player_id, guest_name from public.bookings where starts_at = test_helpers.at(20, '08:00') $$,
  $$ values ('reception', 1200, '00000000-0000-0000-0000-0000000000a1'::uuid, null::text) $$,
  'the booking is loaded by reception, for Ana, at the grid price');
select lives_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000002', test_helpers.at(1, '21:30'),
       p_guest_name => '  Rodríguez ') $$,
  'reception books under a name');
select is((select guest_name from public.bookings where starts_at = test_helpers.at(1, '21:30')), 'Rodríguez',
  'the name is stored trimmed');
select throws_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000001', test_helpers.at(5, '08:00'),
       p_player_id => '00000000-0000-0000-0000-0000000000a1', p_guest_name => 'Otro') $$,
  'P0001', 'invalid_input', 'a booking has exactly one holder');
select throws_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000001', test_helpers.at(5, '08:00')) $$,
  'P0001', 'invalid_input', 'a booking needs a holder');
select throws_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000001', test_helpers.at(5, '08:10'), p_guest_name => 'X') $$,
  'P0001', 'not_aligned', 'reception also books on the grid');
select throws_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000001', test_helpers.at(20, '08:00'), p_guest_name => 'X') $$,
  'P0001', 'slot_taken', 'reception cannot double book either');
select throws_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000001', test_helpers.at(5, '08:00'),
       p_player_id => '00000000-0000-0000-0000-0000000000f1') $$,
  'P0001', 'invalid_input', 'the player has to be a member of the club');
select lives_ok(
  $$ select public.block_court('c0000000-0000-0000-0000-000000000001', test_helpers.at(2, '10:00'),
       test_helpers.at(2, '13:00'), 'Clase de Pablo') $$,
  'reception blocks a court for any length');
select results_eq(
  $$ select kind::text, note from public.court_occupancy
     where court_id = 'c0000000-0000-0000-0000-000000000001' and starts_at = test_helpers.at(2, '10:00') $$,
  $$ values ('block', 'Clase de Pablo') $$,
  'the block keeps its reason');
select throws_ok(
  $$ select public.block_court('c0000000-0000-0000-0000-000000000001', test_helpers.at(2, '12:00'),
       test_helpers.at(2, '14:00'), null) $$,
  'P0001', 'slot_taken', 'a block cannot overlap another occupancy');
select throws_ok(
  $$ select public.block_court('c0000000-0000-0000-0000-000000000001', test_helpers.at(2, '15:00'),
       test_helpers.at(2, '14:00'), null) $$,
  'P0001', 'invalid_input', 'a block ends after it starts');
select throws_ok(
  $$ select public.unblock((select occupancy_id from public.bookings where starts_at = test_helpers.at(20, '08:00'))) $$,
  'P0001', 'invalid_state', 'bookings are cancelled, not unblocked');
select lives_ok(
  $$ select public.unblock((select id from public.court_occupancy
       where court_id = 'c0000000-0000-0000-0000-000000000001' and starts_at = test_helpers.at(2, '10:00'))) $$,
  'reception frees a blocked court');

-- Ana, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000001', test_helpers.at(5, '08:00'), p_guest_name => 'X') $$,
  'P0001', 'forbidden', 'players cannot book in someone else''s name');
select throws_ok(
  $$ select public.block_court('c0000000-0000-0000-0000-000000000001', test_helpers.at(5, '10:00'),
       test_helpers.at(5, '11:00'), null) $$,
  'P0001', 'forbidden', 'players cannot block courts');
select throws_ok(
  $$ select public.unblock((select occupancy_id from public.bookings where starts_at = test_helpers.at(20, '08:00'))) $$,
  'P0001', 'forbidden', 'players cannot free courts');

-- Dani, admin
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select lives_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000002', test_helpers.at(5, '08:00'), p_guest_name => 'Admin') $$,
  'admin can do everything reception does');

reset role;
select is((select count(*)::int from public.court_occupancy where kind = 'block'), 0, 'the block is gone');

select * from finish();
rollback;
