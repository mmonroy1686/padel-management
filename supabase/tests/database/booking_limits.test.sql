begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
select plan(13);

-- Club with explicit limits: open 08:00-24:00, bookings of 60-120 minutes,
-- up to 14 days ahead, cancel with 24 hours notice.
insert into public.clubs (id, slug, name, opens_at, closes_at, min_booking_minutes, max_booking_minutes,
                          booking_window_days, cancellation_notice_hours) values
  ('a0000000-0000-0000-0000-000000000001', 'test-club-limits', 'Club L', '08:00', '24:00', 60, 120, 14, 24);

insert into public.courts (id, club_id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Cancha 1');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'carla@test.local');

insert into public.club_members (club_id, user_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'player'),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'reception');

-- Ana's existing bookings, inserted as postgres: one starts in 2 hours, one in 3 days.
insert into public.court_occupancy (id, club_id, court_id, kind, period, created_by) values
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'booking', tstzrange(now() + interval '2 hours', now() + interval '3 hours 30 minutes'), '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'booking', test_helpers.slot(3, '19:00', 90), '00000000-0000-0000-0000-0000000000a1');

select throws_ok(
  $$ insert into public.clubs (slug, name, opens_at, closes_at) values ('test-club-bad', 'Club Bad', '23:00', '08:00') $$,
  '23514', null, 'a club cannot close before it opens');

-- Ana, player
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             test_helpers.slot(1, '19:00', 90), '00000000-0000-0000-0000-0000000000a1') $$,
  'player books tomorrow within hours and limits');
select lives_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             test_helpers.slot(1, '22:30', 90), '00000000-0000-0000-0000-0000000000a1') $$,
  'player books the last slot, ending exactly at closing time');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             test_helpers.slot(-1, '19:00', 90), '00000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'player cannot book in the past');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             test_helpers.slot(15, '19:00', 90), '00000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'player cannot book beyond the booking window');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             test_helpers.slot(2, '10:00', 150), '00000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'player cannot book longer than the maximum');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             test_helpers.slot(2, '10:00', 30), '00000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'player cannot book shorter than the minimum');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             test_helpers.slot(2, '07:00', 90), '00000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'player cannot book before opening time');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             test_helpers.slot(2, '23:00', 90), '00000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'player cannot book past closing time');

delete from public.court_occupancy where id = 'e0000000-0000-0000-0000-000000000001';
delete from public.court_occupancy where id = 'e0000000-0000-0000-0000-000000000002';

reset role;
select is((select count(*)::int from public.court_occupancy where id = 'e0000000-0000-0000-0000-000000000001'), 1,
  'player cannot cancel inside the notice period');
select is((select count(*)::int from public.court_occupancy where id = 'e0000000-0000-0000-0000-000000000002'), 0,
  'player cancels their own booking with enough notice');

-- Carla, reception: staff are not limited
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'block',
             test_helpers.slot(-1, '06:00', 180), '00000000-0000-0000-0000-0000000000c1') $$,
  'reception can load an occupancy outside the player limits');

delete from public.court_occupancy where id = 'e0000000-0000-0000-0000-000000000001';

reset role;
select is((select count(*)::int from public.court_occupancy where id = 'e0000000-0000-0000-0000-000000000001'), 0,
  'reception can cancel inside the notice period');

select * from finish();
rollback;
