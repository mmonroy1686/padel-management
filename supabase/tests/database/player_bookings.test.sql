begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(24);

-- Ana, player
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(2, '20:00')) $$,
  'player books a free slot on the grid');
select results_eq(
  $$ select price, source::text, status::text, player_id, upper(period) - lower(period)
     from public.bookings
     where court_id = 'c0000000-0000-0000-0000-000000000001' and starts_at = test_helpers.at(2, '20:00') $$,
  $$ values (1600, 'online', 'confirmed', '00000000-0000-0000-0000-0000000000a1'::uuid, interval '90 minutes') $$,
  'the booking is hers, online, at the evening price and one slot long');
select is(
  (select o.kind::text from public.court_occupancy o join public.bookings b on b.occupancy_id = o.id
   where b.starts_at = test_helpers.at(2, '20:00')),
  'booking', 'the booking holds the court with an occupancy');
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000002', test_helpers.at(2, '20:00')) $$,
  'P0001', 'busy_at_that_time', 'a player cannot hold two courts at the same time');
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(2, '08:15')) $$,
  'P0001', 'not_aligned', 'the start has to be on the grid');
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(-1, '08:00')) $$,
  'P0001', 'in_the_past', 'no bookings in the past');
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(15, '08:00')) $$,
  'P0001', 'outside_window', 'no bookings beyond the booking window');
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-00000000dead', test_helpers.at(2, '08:00')) $$,
  'P0001', 'not_found', 'the court has to exist and be active');
select lives_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(3, '08:00')) $$,
  'a second active booking is fine');
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(4, '08:00')) $$,
  'P0001', 'too_many_bookings', 'a third active booking goes over the club limit');

-- Bruno, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(2, '20:00')) $$,
  'P0001', 'slot_taken', 'a taken slot cannot be booked twice, whoever tries');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';

select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000002', test_helpers.at(2, '08:00')) $$,
  'P0001', 'forbidden', 'only club members book');

-- Anonymous visitor
set local role anon;

select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000002', test_helpers.at(2, '08:00')) $$,
  '42501', null, 'anon cannot call book_slot');

-- Ana cancels
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.cancel_my_booking((select id from public.bookings
       where starts_at = test_helpers.at(3, '08:00') and status = 'confirmed')) $$,
  'player cancels her own booking with enough notice');
select results_eq(
  $$ select status::text, occupancy_id is null, cancelled_by from public.bookings
     where starts_at = test_helpers.at(3, '08:00') $$,
  $$ values ('cancelled', true, '00000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'the booking stays in history as cancelled, without its occupancy');
select is(
  (select count(*)::int from public.court_occupancy
   where court_id = 'c0000000-0000-0000-0000-000000000001' and starts_at = test_helpers.at(3, '08:00')),
  0, 'cancelling frees the court');
select throws_ok(
  $$ select public.cancel_my_booking((select id from public.bookings where starts_at = test_helpers.at(3, '08:00'))) $$,
  'P0001', 'invalid_state', 'a cancelled booking cannot be cancelled again');
select lives_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(4, '08:00')) $$,
  'a cancelled booking no longer counts toward the limit');

-- A booking of Ana's that starts in two hours, inserted as postgres.
reset role;
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000002',
  tstzrange(now() + interval '2 hours', now() + interval '3 hours 30 minutes'), '00000000-0000-0000-0000-0000000000a1');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.cancel_my_booking('b0000000-0000-0000-0000-000000000009') $$,
  'P0001', 'notice_period', 'a player cannot cancel inside the notice period');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select throws_ok(
  $$ select public.cancel_my_booking('b0000000-0000-0000-0000-000000000009') $$,
  'P0001', 'forbidden', 'a player cannot cancel someone else''s booking');
select throws_ok(
  $$ select public.cancel_booking('b0000000-0000-0000-0000-000000000009') $$,
  'P0001', 'forbidden', 'players cannot use the staff cancellation');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.cancel_booking('b0000000-0000-0000-0000-000000000009') $$,
  'reception cancels any booking, even inside the notice period');
select throws_ok(
  $$ select public.cancel_booking('b0000000-0000-0000-0000-00000000dead') $$,
  'P0001', 'not_found', 'cancelling a missing booking says so');

reset role;
select is((select status::text from public.bookings where id = 'b0000000-0000-0000-0000-000000000009'), 'cancelled',
  'the staff cancellation is recorded');

select * from finish();
rollback;
