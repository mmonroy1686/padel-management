begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- Fixture as postgres (bypasses RLS).
-- Club X: Ana (player), Bruno (player, private profile), Carla (reception).
-- Club Y: Diego (player, private profile).
insert into public.clubs (id, slug, name) values
  ('a0000000-0000-0000-0000-000000000001', 'test-club-x', 'Club X'),
  ('a0000000-0000-0000-0000-000000000002', 'test-club-y', 'Club Y');

insert into public.courts (id, club_id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Cancha 1'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Cancha 1');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'bruno@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'carla@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'diego@test.local');

update public.profiles set is_public = false
where id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1');

insert into public.club_members (club_id, user_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'player'),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'player'),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'reception'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d1', 'player');

insert into public.court_occupancy (id, club_id, court_id, kind, period, created_by) values
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'booking', tstzrange('2026-10-01 19:00-03', '2026-10-01 20:30-03'), '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
   'booking', tstzrange('2026-10-01 19:00-03', '2026-10-01 20:30-03'), '00000000-0000-0000-0000-0000000000d1');

-- Anonymous visitor
set local role anon;

select is((select count(*)::int from public.courts where id in (
  'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002')), 2,
  'anon can read courts');
select throws_ok($$ select * from public.court_occupancy $$, '42501', null, 'anon cannot read occupancy');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');

-- Ana, player in club X
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 1,
  'player reads own profile');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'player cannot read another private profile');
select is((select count(*)::int from public.club_members where club_id = 'a0000000-0000-0000-0000-000000000001'), 1,
  'player sees only their own membership');
select is((select count(*)::int from public.court_occupancy where club_id = 'a0000000-0000-0000-0000-000000000001'), 1,
  'player sees the occupancy of their club');
select is((select count(*)::int from public.court_occupancy where club_id = 'a0000000-0000-0000-0000-000000000002'), 0,
  'player cannot see the occupancy of another club');

update public.profiles set display_name = 'hacked' where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set display_name = 'Ana P' where id = '00000000-0000-0000-0000-0000000000a1';
update public.club_members set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000000a1';

select lives_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             tstzrange('2026-10-01 21:00-03', '2026-10-01 22:30-03'), '00000000-0000-0000-0000-0000000000a1') $$,
  'player books for themselves');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             tstzrange('2026-10-01 23:00-03', '2026-10-02 00:30-03'), '00000000-0000-0000-0000-0000000000b1') $$,
  '42501', null, 'player cannot book in someone else''s name');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'block',
             tstzrange('2026-10-02 08:00-03', '2026-10-02 09:00-03'), '00000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'player cannot block a court');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'booking',
             tstzrange('2026-10-02 19:00-03', '2026-10-02 20:30-03'), '00000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'player cannot book in a club they do not belong to');
select throws_ok(
  $$ insert into public.club_members (club_id, user_id, role)
     values ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'admin') $$,
  '42501', null, 'player cannot join a club as admin');
select lives_ok(
  $$ insert into public.club_members (club_id, user_id)
     values ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1') $$,
  'player can join a club as an unvalidated player');

-- Bruno, player in club X
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

delete from public.court_occupancy where id = 'e0000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             tstzrange('2026-10-01 21:30-03', '2026-10-01 22:00-03'), '00000000-0000-0000-0000-0000000000b1') $$,
  '23P01', null, 'double booking fails across players');

-- Carla, reception in club X
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is((select count(*)::int from public.club_members where club_id = 'a0000000-0000-0000-0000-000000000001'), 3,
  'reception sees every member of their club');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), 1,
  'reception reads private profiles of their club members');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'), 0,
  'reception cannot read private profiles outside their club');
select lives_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'block',
             tstzrange('2026-10-02 08:00-03', '2026-10-02 09:00-03'), '00000000-0000-0000-0000-0000000000c1') $$,
  'reception can block a court');

-- Back to postgres: the writes RLS filtered out left no trace.
reset role;

select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), 'bruno',
  'player could not rename another profile');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'Ana P',
  'player renamed their own profile');
select is((select role from public.club_members
           where club_id = 'a0000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-0000000000a1'),
  'player'::public.club_role, 'player could not promote themselves');
select is((select count(*)::int from public.court_occupancy where id = 'e0000000-0000-0000-0000-000000000001'), 1,
  'player could not delete another player''s booking');

select * from finish();
rollback;
