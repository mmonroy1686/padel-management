begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(7);

insert into public.court_occupancy (id, club_id, court_id, kind, period, note, created_by) values
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'block', test_helpers.slot(2, '10:00', 120), 'Clase de Pablo', '00000000-0000-0000-0000-0000000000c1');

-- Ana, player: sees that the court is taken, not why or by whom.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select is(
  (select kind::text from public.court_occupancy where id = 'e0000000-0000-0000-0000-000000000001'), 'block',
  'a member reads when and how a court is taken');
select throws_ok(
  $$ select note from public.court_occupancy $$,
  '42501', null, 'a member cannot read block notes');
select throws_ok(
  $$ select created_by from public.court_occupancy $$,
  '42501', null, 'a member cannot read who created an occupancy');
select throws_ok(
  format('select * from public.occupancy_notes(%L, %L, %L)', 'a0000000-0000-0000-0000-000000000001',
         test_helpers.at(0, '00:00'), test_helpers.at(7, '00:00')),
  'P0001', 'forbidden', 'players cannot ask for the notes');

-- Carla, reception: gets the notes through the RPC.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select results_eq(
  format('select id, note from public.occupancy_notes(%L, %L, %L)', 'a0000000-0000-0000-0000-000000000001',
         test_helpers.at(0, '00:00'), test_helpers.at(7, '00:00')),
  $$ values ('e0000000-0000-0000-0000-000000000001'::uuid, 'Clase de Pablo') $$,
  'reception reads the notes of the club for a period');
select is_empty(
  format('select id from public.occupancy_notes(%L, %L, %L)', 'a0000000-0000-0000-0000-000000000001',
         test_helpers.at(3, '00:00'), test_helpers.at(7, '00:00')),
  'only occupancies inside the period come back');

-- Anonymous visitor
set local role anon;
select throws_ok(
  format('select * from public.occupancy_notes(%L, %L, %L)', 'a0000000-0000-0000-0000-000000000001',
         test_helpers.at(0, '00:00'), test_helpers.at(7, '00:00')),
  '42501', null, 'anon cannot call occupancy_notes');

select * from finish();
rollback;
