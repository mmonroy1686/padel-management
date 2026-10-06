begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(28);

select has_table('public', 'players', 'players exists');
select has_table('public', 'championships', 'championships exists');
select has_table('public', 'championship_windows', 'championship_windows exists');
select has_table('public', 'championship_categories', 'championship_categories exists');
select has_table('public', 'championship_entries', 'championship_entries exists');
select has_table('public', 'entry_unavailability', 'entry_unavailability exists');
select ok('championship' = any (enum_range(null::public.occupancy_kind)::text[]),
  'a championship is one more kind of occupancy');
select ok(
  array['championship_added', 'championship_promoted', 'championship_moved', 'championship_cancelled']
    <@ enum_range(null::public.notification_kind)::text[],
  'and its avisos are four more kinds of aviso');

-- C1 is open for registration, with a day of play, a category and two pairs; C2 is a draft.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000002', 'draft', null);
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000002',
  'Borrador');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03');
insert into public.entry_unavailability (club_id, entry_id, on_date, from_time, to_time) values
  ('a0000000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000001', test_helpers.today() + 10,
   '08:00', '09:30'),
  ('a0000000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002', test_helpers.today() + 10,
   '08:00', '09:30');

select throws_ok(
  $$ insert into public.players (club_id, name, phone)
     values ('a0000000-0000-0000-0000-000000000001', 'Otro Pedro', '099111001') $$,
  '23505', null, 'a phone is one player');
select throws_ok(
  $$ insert into public.players (club_id, name, phone)
     values ('a0000000-0000-0000-0000-000000000001', 'Sin formato', '099-111') $$,
  '23514', null, 'a phone is stored as digits only');
select throws_ok(
  $$ call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000009', 'c2a00000-0000-0000-0000-000000000001',
       'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-0000000000a3') $$,
  '23514', null, 'a pair is two different players');
select throws_ok(
  $$ call test_helpers.make_category('c2a00000-0000-0000-0000-000000000009', 'c1a00000-0000-0000-0000-000000000001',
       'Al revés', 4, 8) $$,
  '23514', null, 'the minimum of pairs is not over the maximum');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, championship_id)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'block',
             test_helpers.slot(12, '08:00', 90), 'c1a00000-0000-0000-0000-000000000001') $$,
  '23514', null, 'only a championship occupancy points at a championship');
select throws_ok(
  $$ insert into public.payments (club_id, championship_entry_id, day_use_pass_id, method, amount, status)
     values ('a0000000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000001', gen_random_uuid(),
             'cash', 2000, 'confirmed') $$,
  '23514', null, 'a payment is for one thing only');
select throws_ok(
  $$ call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000009', 'registration', null) $$,
  '23514', null, 'an open registration has a deadline');

-- Ana, player
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select results_eq('select id from public.championships',
  $$ values ('c1a00000-0000-0000-0000-000000000001'::uuid) $$, 'a member reads the championships out of draft');
select results_eq('select id from public.championship_categories',
  $$ values ('c2a00000-0000-0000-0000-000000000001'::uuid) $$, 'and their categories');
select is((select count(*)::int from public.championship_windows), 1, 'and their days of play');
select is((select count(*)::int from public.championship_entries), 2, 'and their pairs');
select is((select name from public.players where id = 'c4a00000-0000-0000-0000-000000000f01'), 'Pedro',
  'a member reads the names of the players');
select throws_ok($$ select phone from public.players $$, '42501', null, 'but not their phones');
select throws_ok(
  $$ insert into public.championships (club_id, name) values ('a0000000-0000-0000-0000-000000000001', 'Mío') $$,
  '42501', null, 'nobody writes championships directly');
select is((select count(*)::int from public.entry_unavailability), 1, 'a member reads the hours of her own pairs only');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is((select count(*)::int from public.championships), 2, 'staff read the drafts too');
select is((select count(*)::int from public.championship_entries), 3, 'and every pair');
select is((select count(*)::int from public.entry_unavailability), 2, 'and every pair''s hours');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';

select is((select count(*)::int from public.championships) + (select count(*)::int from public.players), 0,
  'staff of another club read no championships or players');

-- Anonymous visitor
set local role anon;

select throws_ok($$ select count(*) from public.championships $$, '42501', null, 'anon reads no championships');

select * from finish();
rollback;
