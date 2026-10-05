begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/waitlist.psql
select plan(24);

select has_table('public', 'slot_waits', 'slot_waits exists');
select has_table('public', 'slot_holds', 'slot_holds exists');
select has_table('public', 'notifications', 'notifications exists');
select ok('hold' = any (enum_range(null::public.occupancy_kind)::text[]), 'a hold is one more kind of occupancy');

select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'hold',
             test_helpers.slot(1, '08:00', 90)) $$,
  '23514', null, 'a hold always expires');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, expires_at)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'block',
             test_helpers.slot(1, '08:00', 90), now()) $$,
  '23514', null, 'only holds expire');
select throws_ok(
  $$ insert into public.slot_waits (club_id, player_id, on_date, from_time, to_time)
     values ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1',
             test_helpers.today() + 1, '21:00', '18:00') $$,
  '23514', null, 'a wait starts before it ends');

-- Ana waits tomorrow evening, Bruno the day after; Ana holds Cancha 1 tomorrow at 19:00.
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1');
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 2);
call test_helpers.make_hold('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001', test_helpers.slot(1, '19:00', 90));

select is(
  (select starts_at from public.slot_holds where id = 'e1000000-0000-0000-0000-000000000001'),
  test_helpers.at(1, '19:00'), 'a hold knows when its slot starts');
select is(
  (select note from public.court_occupancy
   where id = test_helpers.hold_occupancy('e1000000-0000-0000-0000-000000000001')),
  'Ana', 'the held court carries the player''s name, for staff');
select throws_ok(
  $$ call test_helpers.make_hold('e1000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001',
       'c0000000-0000-0000-0000-000000000002', test_helpers.slot(1, '20:30', 90)) $$,
  '23505', null, 'a player has one active hold at a time');
select throws_ok(
  $$ call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
       test_helpers.slot(1, '19:00', 90), '00000000-0000-0000-0000-0000000000b1') $$,
  '23P01', null, 'a held court cannot be taken');

insert into public.notifications (id, club_id, user_id, kind, link) values
  ('e2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 'slot_held', '/'),
  ('e2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000b1', 'slot_free_now', '/reservar');
select is(
  (select email_status::text from public.notifications where id = 'e2000000-0000-0000-0000-000000000001'),
  'pending', 'a new aviso waits to be mailed');
select throws_ok(
  $$ insert into public.notifications (club_id, user_id, kind, link)
     values ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'slot_held',
             'https://otro.test') $$,
  '23514', null, 'an aviso links inside the app');

-- Ana, player
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select results_eq(
  'select id from public.slot_waits',
  $$ values ('e0000000-0000-0000-0000-000000000001'::uuid) $$,
  'a player reads her own waits');
select results_eq(
  'select id from public.slot_holds',
  $$ values ('e1000000-0000-0000-0000-000000000001'::uuid) $$,
  'and her own holds');
select results_eq(
  'select id from public.notifications',
  $$ values ('e2000000-0000-0000-0000-000000000001'::uuid) $$,
  'and her own avisos');
select throws_ok(
  $$ insert into public.slot_waits (club_id, player_id, on_date, from_time, to_time)
     values ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1',
             test_helpers.today() + 3, '18:30', '23:00') $$,
  '42501', null, 'nobody writes waits directly');
select throws_ok(
  $$ update public.notifications set read_at = now() $$,
  '42501', null, 'nor marks avisos read directly');
select ok(
  (select expires_at is not null from public.court_occupancy where kind = 'hold'),
  'members read until when a court is held');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is((select count(*)::int from public.slot_waits), 2, 'reception reads every wait of the club');
select is((select count(*)::int from public.slot_holds), 1, 'and every hold');
select is((select count(*)::int from public.notifications), 0, 'but not the players'' avisos');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';

select is(
  (select count(*)::int from public.slot_waits) + (select count(*)::int from public.slot_holds), 0,
  'staff of another club reads no waits or holds');

-- Anonymous visitor
set local role anon;

select throws_ok($$ select count(*) from public.slot_waits $$, '42501', null, 'anon reads no waits');

select * from finish();
rollback;
