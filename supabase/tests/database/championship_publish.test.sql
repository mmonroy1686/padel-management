begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(13);

-- C1 was drawn and scheduled: 'Libre', Ana and Pedro against Bruno and Lucía on day 10 at 08:00, court 1. Its
-- day of play (08:00 to 14:00, court 1) holds the court since registration opened.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001', 'drawn');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '14:00',
  array['c0000000-0000-0000-0000-000000000001']::uuid[]);
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
call test_helpers.make_group('c5a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'Zona A', array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002']::uuid[]);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001', p_court => 'c0000000-0000-0000-0000-000000000001',
  p_starts => test_helpers.at(10, '08:00'));
insert into public.court_occupancy (club_id, court_id, kind, period, note, championship_id) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'championship',
   test_helpers.slot(10, '08:00', 360), 'Campeonato T', 'c1a00000-0000-0000-0000-000000000001');
-- C2 was drawn but its match has no court yet (Gabi and Marta against Hugo and Nico).
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000002', 'drawn');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000002');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-000000000f04');
call test_helpers.make_group('c5a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000002',
  'Zona A', array['c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[]);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000002',
  'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004',
  p_group_id => 'c5a00000-0000-0000-0000-000000000002');
-- C3 like C1, on day 11 on court 2 (Iván and Olga against Juli and Raúl).
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000003', 'drawn');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000003', 11, '08:00', '14:00',
  array['c0000000-0000-0000-0000-000000000002']::uuid[]);
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000003', 'c1a00000-0000-0000-0000-000000000003');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a4', 'c4a00000-0000-0000-0000-000000000f05');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000006', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a5', 'c4a00000-0000-0000-0000-000000000f06');
call test_helpers.make_group('c5a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000003',
  'Zona A', array['c3a00000-0000-0000-0000-000000000005', 'c3a00000-0000-0000-0000-000000000006']::uuid[]);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000003',
  'c3a00000-0000-0000-0000-000000000005', 'c3a00000-0000-0000-0000-000000000006',
  p_group_id => 'c5a00000-0000-0000-0000-000000000003', p_court => 'c0000000-0000-0000-0000-000000000002',
  p_starts => test_helpers.at(11, '08:00'));
insert into public.court_occupancy (club_id, court_id, kind, period, note, championship_id) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'championship',
   test_helpers.slot(11, '08:00', 360), 'Campeonato T', 'c1a00000-0000-0000-0000-000000000003');

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  $$ select public.publish_championship('c1a00000-0000-0000-0000-000000000002') $$,
  'P0001', 'schedule_incomplete', 'every match needs a court and a start before publishing');
select lives_ok(
  $$ select public.publish_championship('c1a00000-0000-0000-0000-000000000001', true) $$,
  'the organizer publishes the fixture, giving back what the matches do not use');
select is((select status::text from public.championships where id = 'c1a00000-0000-0000-0000-000000000001'),
  'published', 'the championship is published');
select ok((select public_code ~ '^campeonato-t-[0-9a-f]{4}$' from public.championships
           where id = 'c1a00000-0000-0000-0000-000000000001'),
  'with a short public code made from its name');
select is(test_helpers.notices('00000000-0000-0000-0000-0000000000a1', 'championship_fixture'), 1,
  'each member of a pair hears the fixture is out');
select is(test_helpers.notices('00000000-0000-0000-0000-0000000000b1', 'championship_fixture'), 1,
  'both pairs');
select is(test_helpers.last_notice('00000000-0000-0000-0000-0000000000a1', 'championship_fixture')
            ->> 'category_name', 'Libre', 'about her category');
select is((select count(*)::int from public.court_occupancy
           where championship_id = 'c1a00000-0000-0000-0000-000000000001'), 1,
  'only the slot with a match keeps the court');
select is((select period from public.court_occupancy
           where championship_id = 'c1a00000-0000-0000-0000-000000000001'),
  test_helpers.slot(10, '08:00', 90), 'the club slot of that match');
select throws_ok(
  $$ select public.publish_championship('c1a00000-0000-0000-0000-000000000001') $$,
  'P0001', 'invalid_state', 'a fixture is published once');
select lives_ok(
  $$ select public.publish_championship('c1a00000-0000-0000-0000-000000000003') $$,
  'publishing keeps the courts unless told otherwise');
select is((select period from public.court_occupancy
           where championship_id = 'c1a00000-0000-0000-0000-000000000003'),
  test_helpers.slot(11, '08:00', 360), 'the whole day of play stays blocked');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  $$ select public.publish_championship('c1a00000-0000-0000-0000-000000000002') $$,
  'P0001', 'forbidden', 'staff of another club cannot publish');

select * from finish();
rollback;
