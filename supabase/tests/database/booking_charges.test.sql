begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
select plan(30);

-- Tomorrow at 11:00. Booking 1 (Ana, $1.202): 302 for player 1, 300 for the rest. Booking 2 (Bruno, $1.200) got
-- $1.000 without position at the desk. Booking 3 (Ana, $1.200) has her transfer reported from the app. Booking 4
-- got cancelled.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(1, '11:00', 90), '00000000-0000-0000-0000-0000000000a1', 1202);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(1, '11:00', 90), '00000000-0000-0000-0000-0000000000b1', 1200);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(1, '12:30', 90), '00000000-0000-0000-0000-0000000000a1', 1200);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(1, '12:30', 90), '00000000-0000-0000-0000-0000000000b1', 1200);
insert into public.payments (club_id, booking_id, method, amount, status, confirmed_at) values
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'cash', 1000, 'confirmed', now());
insert into public.payments (club_id, booking_id, method, amount, status, reported_by) values
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'transfer', 1200, 'reported',
   '00000000-0000-0000-0000-0000000000a1');
update public.bookings set status = 'cancelled', occupancy_id = null, cancelled_at = now()
 where id = 'b0000000-0000-0000-0000-000000000004';

-- A confirmed match the day after at 14:00 ($1.602: 402 for Ana, 400 for Bruno, Hugo and Iván), and another one at
-- 15:30 that lost its fourth player.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(2, '14:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4']::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 1602);
call test_helpers.make_match('e1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(2, '15:30', 90),
  array['00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a5',
        '00000000-0000-0000-0000-0000000000a3', null]::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 1600);

create function test_helpers.match_booking(p_match_id uuid)
returns uuid
language sql
stable
as $$
  select booking_id from public.open_matches where id = p_match_id;
$$;

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000001', 2, 'cash') $$,
  'reception charges player 2 in cash');
select results_eq(
  $$ select amount, method::text, status::text, payer_position::int, payer_id, confirmed_by from public.payments
      where booking_id = 'b0000000-0000-0000-0000-000000000001' $$,
  $$ values (300, 'cash', 'confirmed', 2, null::uuid, '00000000-0000-0000-0000-0000000000c1'::uuid) $$,
  'a quarter of the price, confirmed by her, with his position');
select throws_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000001', 2, 'cash') $$,
  'P0001', 'already_paid', 'nobody pays his share twice');
select lives_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000001', 1, 'transfer') $$,
  'player 1 says he transferred');
select results_eq(
  $$ select amount, status::text, receipt_path, confirmed_by from public.payments
      where booking_id = 'b0000000-0000-0000-0000-000000000001' and payer_position = 1 $$,
  $$ values (302, 'confirmed', null::text, '00000000-0000-0000-0000-0000000000c1'::uuid) $$,
  'player 1 pays the remainder too; reception''s transfer is confirmed, with no receipt');
select lives_ok(
  $$ select public.charge_booking_rest('b0000000-0000-0000-0000-000000000001', 'cash') $$,
  'reception charges everything left');
select results_eq(
  $$ select amount, payer_position from public.payments
      where booking_id = 'b0000000-0000-0000-0000-000000000001' and payer_position is null $$,
  $$ values (600, null::smallint) $$,
  'one payment without position for the rest');
select throws_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000001', 3, 'cash') $$,
  'P0001', 'already_paid', 'a booking paid in full leaves no share to charge');
select throws_ok(
  $$ select public.charge_booking_rest('b0000000-0000-0000-0000-000000000001', 'cash') $$,
  'P0001', 'already_paid', 'nor anything left');

select lives_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000002', 2, 'cash') $$,
  'a share on a booking that got money without position');
select results_eq(
  $$ select amount from public.payments
      where booking_id = 'b0000000-0000-0000-0000-000000000002' and payer_position = 2 $$,
  $$ values (200) $$,
  'only what the booking still owes, not the whole share');
select throws_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000002', 3, 'cash') $$,
  'P0001', 'already_paid', 'then nothing is left');
select throws_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000003', 1, 'cash') $$,
  'P0001', 'already_paid', 'a transfer reported from the app covers it while it waits');
select throws_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000004', 1, 'cash') $$,
  'P0001', 'invalid_state', 'not on a cancelled booking');
select throws_ok(
  $$ select public.charge_booking_rest('b0000000-0000-0000-0000-000000000004', 'cash') $$,
  'P0001', 'invalid_state', 'nor its rest');
select throws_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000003', 5, 'cash') $$,
  'P0001', 'invalid_input', 'positions go from 1 to 4');
select throws_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000003', 1, null) $$,
  'P0001', 'invalid_input', 'it says how it was paid');

-- In a match each player pays his own share, now by transfer too.
select lives_ok(
  $$ select public.charge_booking_share(test_helpers.match_booking('e1000000-0000-0000-0000-000000000001'), 2,
       'transfer') $$,
  'reception records the transfer of a match player');
select results_eq(
  $$ select amount, method::text, status::text, payer_id, payer_position from public.payments
      where booking_id = test_helpers.match_booking('e1000000-0000-0000-0000-000000000001') $$,
  $$ values (400, 'transfer', 'confirmed', '00000000-0000-0000-0000-0000000000b1'::uuid, null::smallint) $$,
  'his share, under his name');
select throws_ok(
  $$ select public.charge_booking_share(test_helpers.match_booking('e1000000-0000-0000-0000-000000000001'), 2,
       'cash') $$,
  'P0001', 'already_paid', 'not twice');
select lives_ok(
  $$ select public.charge_booking_rest(test_helpers.match_booking('e1000000-0000-0000-0000-000000000001'), 'cash') $$,
  'the rest of a match');
select results_eq(
  $$ select payer_id, amount from public.payments
      where booking_id = test_helpers.match_booking('e1000000-0000-0000-0000-000000000001') and method = 'cash'
      order by amount desc, payer_id $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, 402),
            ('00000000-0000-0000-0000-0000000000a3'::uuid, 400),
            ('00000000-0000-0000-0000-0000000000a4'::uuid, 400) $$,
  'one payment per player who still owed');
select throws_ok(
  $$ select public.charge_booking_share(test_helpers.match_booking('e1000000-0000-0000-0000-000000000002'), 4,
       'cash') $$,
  'P0001', 'invalid_input', 'an empty spot pays nothing');

-- The club stops taking cash (as postgres).
reset role;
update public.clubs set accepts_cash = false where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  $$ select public.charge_booking_share(test_helpers.match_booking('e1000000-0000-0000-0000-000000000002'), 1,
       'cash') $$,
  'P0001', 'method_disabled', 'only the methods the club takes');
select throws_ok(
  $$ select public.charge_booking_rest(test_helpers.match_booking('e1000000-0000-0000-0000-000000000002'), 'cash') $$,
  'P0001', 'method_disabled', 'for the rest too');

-- Ana, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000003', 1, 'transfer') $$,
  'P0001', 'forbidden', 'a player does not record payments');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000003', 1, 'transfer') $$,
  'P0001', 'forbidden', 'nor the staff of another club');
select throws_ok(
  $$ select public.charge_booking_rest('b0000000-0000-0000-0000-000000000003', 'transfer') $$,
  'P0001', 'forbidden', 'nor its rest');

reset role;
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in ('position_due', 'booking_left', 'chargeable_booking', 'record_charge')
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot execute the charge helpers');
select is(
  array(select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('charge_booking_share', 'charge_booking_rest')
          and has_function_privilege('anon', p.oid, 'execute')),
  array[]::text[],
  'anon cannot charge');

select * from finish();
rollback;
