begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(33);

-- C1: a draft with a day of play on day 10 (08:00 to 14:00, both courts) and 'Libre', where Ana and Pedro
-- (with a reported transfer) and Bruno and Lucía are already in.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001', 'draft', null);
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
insert into public.payments (club_id, championship_entry_id, method, amount, status, payer_id) values
  ('a0000000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000001', 'transfer', 2000, 'reported',
   '00000000-0000-0000-0000-0000000000a1');
-- C2: a draft with nothing. C3: a draft whose day of play clashes with Bruno's booking on day 11.
-- C4: a draft whose deadline is after its first match.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000002', 'draft', null);
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000003', 'draft', null);
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000003', 11, '08:00', '14:00',
  array['c0000000-0000-0000-0000-000000000001']::uuid[]);
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000006', 'c1a00000-0000-0000-0000-000000000003');
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(11, '11:00', 90), '00000000-0000-0000-0000-0000000000b1');
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000004', 'draft', now() + interval '30 days');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000004', 12, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000007', 'c1a00000-0000-0000-0000-000000000004');
-- C5: registration closed. '5ta' (2 pairs) has only Gabi and Marta; '6ta' (2 pairs) is full with Hugo and
-- Nico (paid in cash) and Iván and Olga (transfer reported), and Juli and Raúl wait.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000005', 'closed');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000005', 13, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000005',
  '5ta', 2);
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000003', 'c1a00000-0000-0000-0000-000000000005',
  '6ta', 2);
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-000000000f04');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a4', 'c4a00000-0000-0000-0000-000000000f05');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000006', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a5', 'c4a00000-0000-0000-0000-000000000f06', 'waiting');
insert into public.payments (club_id, championship_entry_id, method, amount, status, payer_id, confirmed_at) values
  ('a0000000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000004', 'cash', 2000, 'confirmed', null,
   now());
insert into public.payments (club_id, championship_entry_id, method, amount, status, payer_id) values
  ('a0000000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000005', 'transfer', 2000, 'reported',
   '00000000-0000-0000-0000-0000000000a4');

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok($$ select public.open_championship_registration('c1a00000-0000-0000-0000-000000000002') $$,
  'P0001', 'championship_incomplete', 'registration opens with days of play and categories');
select throws_ok($$ select public.open_championship_registration('c1a00000-0000-0000-0000-000000000004') $$,
  'P0001', 'invalid_input', 'registration closes before the first match');
select throws_ok($$ select public.open_championship_registration('c1a00000-0000-0000-0000-000000000003') $$,
  'P0001', 'courts_busy', 'a day of play cannot take a court that is already taken');
select is((select status::text from public.championships where id = 'c1a00000-0000-0000-0000-000000000003'), 'draft',
  'and the championship stays a draft');
select is((select count(*)::int from public.court_occupancy where championship_id = 'c1a00000-0000-0000-0000-000000000003'),
  0, 'with no court blocked');
select lives_ok($$ select public.open_championship_registration('c1a00000-0000-0000-0000-000000000001') $$,
  'staff open registration');
select results_eq(
  $$ select status::text, registration_closes_at from public.championships
     where id = 'c1a00000-0000-0000-0000-000000000001' $$,
  $$ values ('registration', test_helpers.at(10, '08:00') - interval '24 hours') $$,
  'until 24 hours before the first match');
select is(
  (select count(*)::int from public.court_occupancy
   where championship_id = 'c1a00000-0000-0000-0000-000000000001' and kind = 'championship'),
  2, 'each day of play blocks its courts');
select throws_ok($$ select public.open_championship_registration('c1a00000-0000-0000-0000-000000000001') $$,
  'P0001', 'invalid_state', 'registration opens once');
select throws_ok(
  $$ select public.add_championship_window('c1a00000-0000-0000-0000-000000000001', test_helpers.today() + 12,
       '08:00', '11:00', array['c0000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'P0001', 'invalid_state', 'its days of play stay as they are');
select lives_ok($$ select public.close_championship_registration('c1a00000-0000-0000-0000-000000000001') $$,
  'staff close registration');
select throws_ok($$ select public.close_championship_registration('c1a00000-0000-0000-0000-000000000001') $$,
  'P0001', 'invalid_state', 'once');

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(10, '11:00')) $$,
  'P0001', 'slot_taken', 'nobody books a court the championship holds');
select throws_ok($$ select public.cancel_championship('c1a00000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'a player cancels no championships');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.merge_championship_category('c2a00000-0000-0000-0000-000000000002',
       'c2a00000-0000-0000-0000-000000000003') $$,
  'staff merge a category with too few pairs into another');
select results_eq(
  $$ select status::text, merged_into from public.championship_categories
     where id = 'c2a00000-0000-0000-0000-000000000002' $$,
  $$ values ('merged', 'c2a00000-0000-0000-0000-000000000003'::uuid) $$,
  'the small category points at the one it went into');
select results_eq(
  $$ select category_id, status::text from public.championship_entries
     where id = 'c3a00000-0000-0000-0000-000000000003' $$,
  $$ values ('c2a00000-0000-0000-0000-000000000003'::uuid, 'waiting') $$,
  'its pair waits there: the other one was full');
select is(test_helpers.last_notice('00000000-0000-0000-0000-0000000000a2', 'championship_moved') ->> 'waiting',
  'true', 'with an aviso that says so');
select throws_ok(
  $$ select public.merge_championship_category('c2a00000-0000-0000-0000-000000000003',
       'c2a00000-0000-0000-0000-000000000003') $$,
  'P0001', 'invalid_state', 'a category does not merge into itself');
select throws_ok(
  $$ select public.merge_championship_category('c2a00000-0000-0000-0000-000000000002',
       'c2a00000-0000-0000-0000-000000000003') $$,
  'P0001', 'invalid_state', 'nor merges twice');
select lives_ok($$ select public.cancel_championship_category('c2a00000-0000-0000-0000-000000000003') $$,
  'staff cancel a category');
select is(
  (select count(*)::int from public.championship_entries
   where category_id = 'c2a00000-0000-0000-0000-000000000003' and status = 'removed'),
  4, 'its pairs are out, with a place or waiting');
select results_eq(
  $$ select status::text, rejection_reason from public.payments
     where championship_entry_id = 'c3a00000-0000-0000-0000-000000000005' $$,
  $$ values ('rejected', 'Categoría cancelada') $$,
  'a reported transfer is rejected');
select is(
  (select status::text from public.payments where championship_entry_id = 'c3a00000-0000-0000-0000-000000000004'),
  'confirmed', 'money already taken stays, to give back');
select is(test_helpers.last_notice('00000000-0000-0000-0000-0000000000a3', 'championship_cancelled') ->> 'category_name',
  '6ta', 'its members get an aviso naming the category');
select lives_ok($$ select public.cancel_championship('c1a00000-0000-0000-0000-000000000001') $$,
  'staff cancel a championship');
select results_eq(
  $$ select status::text, cancelled_at is not null from public.championships
     where id = 'c1a00000-0000-0000-0000-000000000001' $$,
  $$ values ('cancelled', true) $$,
  'it is cancelled');
select is((select count(*)::int from public.court_occupancy where championship_id = 'c1a00000-0000-0000-0000-000000000001'),
  0, 'and its courts are free');
select is(
  (select rejection_reason from public.payments where championship_entry_id = 'c3a00000-0000-0000-0000-000000000001'),
  'Campeonato cancelado', 'reported transfers are rejected');
select ok((test_helpers.last_notice('00000000-0000-0000-0000-0000000000a1', 'championship_cancelled')
  ->> 'category_name') is null, 'the aviso is about the whole championship');
select is(
  test_helpers.notices('00000000-0000-0000-0000-0000000000a1', 'championship_cancelled')
    + test_helpers.notices('00000000-0000-0000-0000-0000000000b1', 'championship_cancelled'),
  2, 'every member signed up gets it');
select throws_ok($$ select public.cancel_championship('c1a00000-0000-0000-0000-000000000001') $$,
  'P0001', 'invalid_state', 'a championship is cancelled once');
select lives_ok($$ select public.cancel_championship('c1a00000-0000-0000-0000-000000000002') $$,
  'a draft can be cancelled too');

select * from finish();
rollback;
