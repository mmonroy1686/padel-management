begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(17);

-- C1: open, with days of play on day 10 (08:00 to 14:00) and day 11 (14:00 to 20:00): 6 blocks of 2 hours,
-- so a pair marks up to 2 by itself. Ana and Pedro, and Bruno and Lucía, are in.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '14:00');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 11, '14:00', '20:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
-- C2: its deadline passed; Ana and Gabi are in. C3 was drawn; Hugo and Nico are in.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000002', 'registration', now() - interval '1 hour');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000002', 12, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000002');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-0000000000a2');
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000003', 'drawn');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000003', 13, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000003', 'c1a00000-0000-0000-0000-000000000003');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-000000000f04');

select is((select count(*)::int from private.championship_blocks('c1a00000-0000-0000-0000-000000000001')), 6,
  'the days of play are cut in 2-hour blocks');
select results_eq(
  $$ select block_key, to_time - from_time from private.championship_blocks('c1a00000-0000-0000-0000-000000000001')
     order by block_key limit 1 $$,
  $$ values ((test_helpers.today() + 10)::text || '@08:00', interval '2 hours') $$,
  'from the start of each day');
select results_eq(
  $$ select to_time from private.championship_blocks('c1a00000-0000-0000-0000-000000000001')
     order by block_key desc limit 1 $$,
  $$ values ('20:00'::time) $$,
  'the last one ends with the day');

set local role authenticated;

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.set_entry_unavailability('c3a00000-0000-0000-0000-000000000001',
       test_helpers.blocks('c1a00000-0000-0000-0000-000000000001', 2), 'Trabajo de mañana') $$,
  'a player marks when her pair cannot play');
select is(
  (select count(*)::int from public.entry_unavailability where entry_id = 'c3a00000-0000-0000-0000-000000000001'),
  2, 'two blocks');
select is(
  (select unavailability_note from public.championship_entry_notes('c1a00000-0000-0000-0000-000000000001')
   where entry_id = 'c3a00000-0000-0000-0000-000000000001'),
  'Trabajo de mañana', 'and a note');
select throws_ok(
  $$ select public.set_entry_unavailability('c3a00000-0000-0000-0000-000000000001',
       test_helpers.blocks('c1a00000-0000-0000-0000-000000000001', 3)) $$,
  'P0001', 'too_many_unavailable', 'a pair marks up to 40 % of the blocks');
select throws_ok(
  $$ select public.set_entry_unavailability('c3a00000-0000-0000-0000-000000000001', array['2020-01-01@08:00']) $$,
  'P0001', 'invalid_input', 'only blocks of the championship');
select throws_ok(
  $$ select public.set_entry_unavailability('c3a00000-0000-0000-0000-000000000002',
       test_helpers.blocks('c1a00000-0000-0000-0000-000000000001', 1)) $$,
  'P0001', 'forbidden', 'only for her own pairs');
select throws_ok(
  $$ select public.set_entry_unavailability('c3a00000-0000-0000-0000-000000000003',
       test_helpers.blocks('c1a00000-0000-0000-0000-000000000002', 1)) $$,
  'P0001', 'championship_closed', 'and until the deadline');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.set_entry_unavailability('c3a00000-0000-0000-0000-000000000001',
       test_helpers.blocks('c1a00000-0000-0000-0000-000000000001', 4)) $$,
  'the organizer saves more than 40 % for a pair');
select results_eq(
  $$ select e.unavailability_approved, n.unavailability_note
     from public.championship_entries e
     join public.championship_entry_notes('c1a00000-0000-0000-0000-000000000001') n on n.entry_id = e.id
     where e.id = 'c3a00000-0000-0000-0000-000000000001' $$,
  $$ values (true, null::text) $$,
  'which approves it');
select is(
  (select count(*)::int from public.entry_unavailability where entry_id = 'c3a00000-0000-0000-0000-000000000001'),
  4, 'the blocks are replaced');
select lives_ok(
  $$ select public.set_entry_unavailability('c3a00000-0000-0000-0000-000000000003',
       test_helpers.blocks('c1a00000-0000-0000-0000-000000000002', 1)) $$,
  'the organizer saves them after the deadline too');
select throws_ok(
  $$ select public.set_entry_unavailability('c3a00000-0000-0000-0000-000000000004',
       test_helpers.blocks('c1a00000-0000-0000-0000-000000000003', 1)) $$,
  'P0001', 'invalid_state', 'but not once the draw is done');

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.set_entry_unavailability('c3a00000-0000-0000-0000-000000000001',
       test_helpers.blocks('c1a00000-0000-0000-0000-000000000001', 1)) $$,
  'the player marks fewer again');
select is(
  (select unavailability_approved from public.championship_entries where id = 'c3a00000-0000-0000-0000-000000000001'),
  false, 'and there is nothing to approve');

select * from finish();
rollback;
