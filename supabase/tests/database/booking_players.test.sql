begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
select plan(26);

select has_table('public', 'booking_players', 'booking_players exists');

-- Ana booked court 1 tomorrow at 11:00 ($1.200); a second booking of hers on court 2 gets cancelled below.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(1, '11:00', 90), '00000000-0000-0000-0000-0000000000a1', 1200);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(1, '11:00', 90), '00000000-0000-0000-0000-0000000000a1', 1200);
update public.bookings set status = 'cancelled', occupancy_id = null, cancelled_at = now()
 where id = 'b0000000-0000-0000-0000-000000000002';

-- A confirmed open match on court 2 the day after: its players live in match_slots.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(2, '12:30', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4']::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 1600);

select throws_ok(
  $$ insert into public.booking_players (booking_id, club_id, position)
     values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 2) $$,
  '23514', null, 'a row is a member or a name, never nobody');
select throws_ok(
  $$ insert into public.booking_players (booking_id, club_id, position, name)
     values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 1, 'Pepe') $$,
  '23514', null, 'player 1 is whoever booked: the table holds 2 to 4');
select throws_ok(
  $$ insert into public.payments (club_id, booking_id, method, amount, status, payer_position)
     values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cash', 300, 'confirmed', 5) $$,
  '23514', null, 'a payment pays position 1 to 4');
select throws_ok(
  $$ insert into public.payments (club_id, booking_id, method, amount, status, payer_id, payer_position)
     values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cash', 300, 'confirmed',
             '00000000-0000-0000-0000-0000000000b1', 2) $$,
  '23514', null, 'a position is for bookings; a match payment says who pays with payer_id');

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       '[{"position": 2, "player_id": "00000000-0000-0000-0000-0000000000b1"}, {"position": 3, "name": " Pepe "}]') $$,
  'reception adds a member and a name');
select results_eq(
  $$ select position::int, player_id, name, created_by from public.booking_players
      where booking_id = 'b0000000-0000-0000-0000-000000000001' order by position $$,
  $$ values (2, '00000000-0000-0000-0000-0000000000b1'::uuid, null::text, '00000000-0000-0000-0000-0000000000c1'::uuid),
            (3, null::uuid, 'Pepe', '00000000-0000-0000-0000-0000000000c1'::uuid) $$,
  'player 2 is Bruno, player 3 is just a name, player 4 stays empty');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       '[{"position": 2, "player_id": "00000000-0000-0000-0000-0000000000a2"},
         {"position": 3, "player_id": "00000000-0000-0000-0000-0000000000a2"}]') $$,
  'P0001', 'player_repeated', 'the same member cannot play twice');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       '[{"position": 2, "player_id": "00000000-0000-0000-0000-0000000000a1"}]') $$,
  'P0001', 'player_repeated', 'whoever booked is player 1 already');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       '[{"position": 2, "player_id": "00000000-0000-0000-0000-0000000000f1"}]') $$,
  'P0001', 'partner_not_member', 'a member has to be a member of the club');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       '[{"position": 2, "player_id": "00000000-0000-0000-0000-0000000000e1"}]') $$,
  'P0001', 'partner_not_member', 'not of another club');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       '[{"position": 2, "player_id": "00000000-0000-0000-0000-0000000000a2", "name": "Gabi"}]') $$,
  'P0001', 'invalid_input', 'a member or a name, not both');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001', '[{"position": 1, "name": "Pepe"}]') $$,
  'P0001', 'invalid_input', 'only positions 2 to 4');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       '[{"position": 2, "name": "Pepe"}, {"position": 2, "name": "Lucho"}]') $$,
  'P0001', 'invalid_input', 'one player per position');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       jsonb_build_array(jsonb_build_object('position', 2, 'name', repeat('a', 61)))) $$,
  'P0001', 'invalid_input', 'a name has up to 60 letters');

-- Bruno paid his share (as postgres): he stays as he is.
reset role;
insert into public.payments (club_id, booking_id, method, amount, status, payer_position, confirmed_at)
values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cash', 300, 'confirmed', 2,
        now());
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       '[{"position": 2, "player_id": "00000000-0000-0000-0000-0000000000a2"}, {"position": 3, "name": "Pepe"}]') $$,
  'P0001', 'already_paid', 'a player who paid cannot be changed');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001', '[{"position": 3, "name": "Pepe"}]') $$,
  'P0001', 'already_paid', 'nor taken out');
select lives_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       '[{"position": 2, "player_id": "00000000-0000-0000-0000-0000000000b1"},
         {"position": 3, "player_id": "00000000-0000-0000-0000-0000000000a2"},
         {"position": 4, "name": "Lucho"}]') $$,
  'the others change around him');
select results_eq(
  $$ select position::int, player_id, name from public.booking_players
      where booking_id = 'b0000000-0000-0000-0000-000000000001' order by position $$,
  $$ values (2, '00000000-0000-0000-0000-0000000000b1'::uuid, null::text),
            (3, '00000000-0000-0000-0000-0000000000a2'::uuid, null::text),
            (4, null::uuid, 'Lucho') $$,
  'Bruno, Gabi and Lucho');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000002', '[{"position": 2, "name": "Pepe"}]') $$,
  'P0001', 'invalid_state', 'not on a cancelled booking');
select throws_ok(
  $$ select public.set_booking_players(
       (select booking_id from public.open_matches where id = 'e1000000-0000-0000-0000-000000000001'),
       '[{"position": 2, "name": "Pepe"}]') $$,
  'P0001', 'invalid_state', 'a match keeps its players in its spots');

-- Dani, admin
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select is(
  (select count(*)::int from public.booking_players where booking_id = 'b0000000-0000-0000-0000-000000000001'), 3,
  'staff read the players');

-- Ana, player (whoever booked)
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select is(
  (select count(*)::int from public.booking_players), 0, 'players do not read the table');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001', '[]') $$,
  'P0001', 'forbidden', 'only staff complete the players');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001', '[]') $$,
  'P0001', 'forbidden', 'not the staff of another club');

reset role;
select ok(
  not has_function_privilege('authenticated', 'private.position_paid(uuid, integer)', 'execute'),
  'authenticated cannot execute the helper');

select * from finish();
rollback;
