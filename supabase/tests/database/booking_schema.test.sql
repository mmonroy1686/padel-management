begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(23);

select has_table('public', 'pricing_rules', 'pricing_rules exists');
select has_table('public', 'bookings', 'bookings exists');
select has_table('public', 'recurring_series', 'recurring_series exists');
select has_table('public', 'recurring_series_skips', 'recurring_series_skips exists');
select has_table('public', 'payments', 'payments exists');
select has_column('public', 'clubs', 'slot_minutes', 'clubs have a slot length');
select hasnt_column('public', 'clubs', 'min_booking_minutes', 'free-length bookings are gone (minimum)');
select hasnt_column('public', 'clubs', 'max_booking_minutes', 'free-length bookings are gone (maximum)');
select has_column('public', 'court_occupancy', 'note', 'occupancies carry a note for blocks');

insert into public.clubs (id, slug, name) values
  ('a0000000-0000-0000-0000-000000000009', 'test-defaults', 'Club D');

select results_eq(
  $$ select slot_minutes::int, max_active_bookings::int, accepts_cash, accepts_transfer, transfer_receipt_required
     from public.clubs where slug = 'test-defaults' $$,
  $$ values (90, 2, true, true, true) $$,
  'new clubs get 90-minute slots, 2 active bookings and both payment methods');
select throws_ok(
  $$ insert into public.clubs (slug, name, opens_at, closes_at) values ('test-club-bad', 'Club Bad', '23:00', '08:00') $$,
  '23514', null, 'a club cannot close before it opens');
select throws_ok(
  $$ update public.clubs set accepts_cash = false, accepts_transfer = false where slug = 'test-defaults' $$,
  '23514', null, 'a club accepts at least one payment method');
select throws_ok(
  $$ insert into public.pricing_rules (club_id, weekdays, from_time, to_time, price)
     values ('a0000000-0000-0000-0000-000000000001', '{7}', '08:00', '10:00', 100) $$,
  '23514', null, 'weekdays go from 0 (Sunday) to 6 (Saturday)');
select throws_ok(
  $$ insert into public.pricing_rules (club_id, weekdays, from_time, to_time, price)
     values ('a0000000-0000-0000-0000-000000000001', '{1}', '18:00', '10:00', 100) $$,
  '23514', null, 'a price band ends after it starts');
select throws_ok(
  $$ insert into public.bookings (club_id, court_id, period, player_id, guest_name, source, price)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
             test_helpers.slot(2, '08:00', 90), '00000000-0000-0000-0000-0000000000a1', 'Otro', 'reception', 1200) $$,
  '23514', null, 'a booking has exactly one holder: a player or a name');

call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(2, '08:00', 90), '00000000-0000-0000-0000-0000000000a1');
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(2, '08:00', 90), '00000000-0000-0000-0000-0000000000b1');

-- Ana, player: no direct writes, reads only her own bookings.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.bookings (club_id, court_id, period, player_id, source, price)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
             test_helpers.slot(3, '08:00', 90), '00000000-0000-0000-0000-0000000000a1', 'online', 0) $$,
  '42501', null, 'players cannot insert bookings directly');
select throws_ok(
  $$ insert into public.payments (club_id, booking_id, method, amount, status)
     values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cash', 1200, 'confirmed') $$,
  '42501', null, 'players cannot insert payments directly');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             test_helpers.slot(3, '08:00', 90), '00000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'players cannot insert occupancies directly');
select is((select count(*)::int from public.bookings), 1, 'a player sees only her own bookings');

-- Carla, reception: no direct writes either, reads every booking of her club.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'block',
             test_helpers.slot(3, '10:00', 60), '00000000-0000-0000-0000-0000000000c1') $$,
  '42501', null, 'reception writes occupancies through the RPCs too');
select is((select count(*)::int from public.bookings), 2, 'reception sees every booking of the club');

-- Anonymous visitor
set local role anon;

select throws_ok($$ select * from public.bookings $$, '42501', null, 'anon cannot read bookings');
select is((select count(*)::int from public.pricing_rules where club_id = 'a0000000-0000-0000-0000-000000000001'), 2,
  'anon can read prices');

select * from finish();
rollback;
