begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(18);

call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(14, '20:00', 90), '00000000-0000-0000-0000-0000000000b1', 1600);

-- Carla, reception
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select results_eq(
  $$ select on_date, reason from public.create_series('c0000000-0000-0000-0000-000000000001',
       extract(dow from test_helpers.today() + 7)::integer, '20:00', test_helpers.today() + 1,
       p_guest_name => 'Rodríguez') $$,
  $$ values (test_helpers.today() + 14, 'slot_taken') $$,
  'creating a series reports the dates that clash');
select is((select count(*)::int from public.bookings where series_id is not null and status = 'confirmed'), 7,
  'the series books every week for 8 weeks, except the clash');
select is(
  (select count(*)::int from public.bookings b join public.court_occupancy o on o.id = b.occupancy_id
   where b.series_id is not null and o.kind = 'recurring'),
  7, 'series bookings hold the court as recurring');
select results_eq(
  $$ select distinct price, source::text, guest_name from public.bookings where series_id is not null $$,
  $$ values (1600, 'reception', 'Rodríguez') $$,
  'series bookings are loaded by reception, for the name, at the grid price');
select is((select generated_until from public.recurring_series), test_helpers.today() + 56,
  'the series is generated 8 weeks ahead');
select is((select count(*)::int from public.recurring_series_skips), 1, 'the clash is recorded for reception');
select throws_ok(
  $$ select * from public.create_series('c0000000-0000-0000-0000-000000000001',
       extract(dow from test_helpers.today())::integer, '20:15', test_helpers.today() + 1, p_guest_name => 'X') $$,
  'P0001', 'not_aligned', 'a series starts on the grid');
select throws_ok(
  $$ select * from public.create_series('c0000000-0000-0000-0000-000000000002',
       extract(dow from test_helpers.today())::integer, '20:00', test_helpers.today() + 1,
       p_player_id => '00000000-0000-0000-0000-0000000000a1', p_guest_name => 'X') $$,
  'P0001', 'invalid_input', 'a series has exactly one holder');
select throws_ok(
  $$ select * from public.create_series('c0000000-0000-0000-0000-000000000002',
       extract(dow from test_helpers.today())::integer, '20:00', test_helpers.today() + 10,
       test_helpers.today() + 3, p_guest_name => 'X') $$,
  'P0001', 'invalid_input', 'a series cannot end before it starts');

-- Ana, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select * from public.create_series('c0000000-0000-0000-0000-000000000002',
       extract(dow from test_helpers.today())::integer, '20:00', test_helpers.today() + 1, p_guest_name => 'X') $$,
  'P0001', 'forbidden', 'players cannot load recurring slots');

-- The daily job, as postgres.
reset role;
select id as series_id from public.recurring_series \gset

select is(private.extend_all_series(), 0, 'extending does nothing while the series is 8 weeks ahead');

-- Pretend a week went by: drop the last week (booking first, then its occupancy) and move
-- generated_until back.
select occupancy_id as last_occupancy from public.bookings
where series_id = :'series_id' and starts_at = test_helpers.at(56, '20:00') \gset
delete from public.bookings where occupancy_id = :'last_occupancy';
delete from public.court_occupancy where id = :'last_occupancy';
update public.recurring_series set generated_until = test_helpers.today() + 49;

select is(private.extend_all_series(), 1, 'the daily job extends a series that fell behind');
select is((select count(*)::int from public.bookings where series_id is not null and status = 'confirmed'), 7,
  'the extension books the missing week');
select is((select count(*)::int from cron.job where jobname = 'extend-recurring-series'), 1,
  'a daily job keeps the series 8 weeks ahead');

-- Carla ends the series from 3 weeks on.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is(public.end_series(:'series_id', test_helpers.today() + 21), 6,
  'ending a series cancels its bookings from that date on');
select is((select count(*)::int from public.bookings where series_id is not null and status = 'confirmed'), 1,
  'the week before the end date stays');
select is((select ends_on from public.recurring_series), test_helpers.today() + 20,
  'the series ends the day before');

-- Ana cannot end it.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  format('select public.end_series(%L, %L)', :'series_id', test_helpers.today() + 7),
  'P0001', 'forbidden', 'players cannot end a series');

select * from finish();
rollback;
