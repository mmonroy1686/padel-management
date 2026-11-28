begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(14);

-- Ana (a1) booked tomorrow with a guest; Bruno (b1) is a player of the club; Zoe (e9) is not a member.
call test_helpers.make_booking('b6000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(1, '10:00', 90), '00000000-0000-0000-0000-0000000000a1');
call test_helpers.make_booking('b6000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(-1, '10:00', 90), '00000000-0000-0000-0000-0000000000a1');
insert into public.booking_players (booking_id, club_id, position, name)
values ('b6000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 2, 'Pedro');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e9', 'zoe@test.local');

set local role authenticated;

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e9", "role": "authenticated"}';
select throws_ok($$ select * from public.booking_invite('b6000000-0000-0000-0000-000000000001') $$,
  'P0001', 'not_found', 'someone outside the club does not see it');
select throws_ok($$ select public.join_booking('b6000000-0000-0000-0000-000000000001') $$,
  'P0001', 'not_found', 'nor joins');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select results_eq(
  $$ select free, is_participant, jsonb_array_length(players) from public.booking_invite('b6000000-0000-0000-0000-000000000001') $$,
  $$ values (2, false, 2) $$, 'a member sees who plays and the room left');
select is(public.join_booking('b6000000-0000-0000-0000-000000000001'), 3::smallint, 'Bruno joins in the first free spot');
select throws_ok($$ select public.join_booking('b6000000-0000-0000-0000-000000000001') $$,
  'P0001', 'already_in_booking', 'only once');
select results_eq(
  $$ select free, is_participant from public.booking_invite('b6000000-0000-0000-0000-000000000001') $$,
  $$ values (1, true) $$, 'one spot left, and he is in');
select throws_ok($$ select public.join_booking('b6000000-0000-0000-0000-000000000002') $$,
  'P0001', 'invalid_state', 'not a booking that already started');

reset role;
select results_eq(
  $$ select user_id, kind::text, data ->> 'joiner_name', (data ->> 'free')::int, link from public.notifications
     where kind = 'booking_join' $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, 'booking_join', 'bruno', 1,
             '/turno/b6000000-0000-0000-0000-000000000001') $$,
  'the holder gets an aviso with who joined and how many are missing');

-- Carla (reception, a member) takes the last spot; then it is full.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select is(public.join_booking('b6000000-0000-0000-0000-000000000001'), 4::smallint, 'the last spot');
reset role;
insert into public.club_members (club_id, user_id, role)
values ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e9', 'player');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e9", "role": "authenticated"}';
select results_eq(
  $$ select free from public.booking_invite('b6000000-0000-0000-0000-000000000001') $$,
  $$ values (0) $$, 'full');
select throws_ok($$ select public.join_booking('b6000000-0000-0000-0000-000000000001') $$,
  'P0001', 'booking_full', 'nobody else fits');

-- The holder joining her own booking is already in.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select results_eq(
  $$ select is_participant from public.booking_invite('b6000000-0000-0000-0000-000000000001') $$,
  $$ values (true) $$, 'the holder is a participant');
select throws_ok($$ select public.join_booking('b6000000-0000-0000-0000-000000000001') $$,
  'P0001', 'already_in_booking', 'and does not join twice');
reset role;
select is((select count(*)::int from public.notifications where kind = 'booking_join'), 2, 'one aviso per join');

select finish();
rollback;
