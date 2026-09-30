begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(17);

-- A confirmed match at day 3 20:00 whose booking costs 1602: 402 for spot 1 (Ana), 400 for the rest.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '20:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4']::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 1602);

create function test_helpers.match_booking()
returns uuid
language sql
stable
as $$
  select booking_id from public.open_matches where id = 'e1000000-0000-0000-0000-000000000001';
$$;

insert into storage.objects (bucket_id, name) values
  ('receipts', '00000000-0000-0000-0000-0000000000a1/r.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000b1/r.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000a5/r.png');

set local role authenticated;

-- Ana, spot 1
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.report_transfer(test_helpers.match_booking(), '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'a match player reports the transfer of her share');
select results_eq(
  $$ select amount, payer_id from public.payments where payer_id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values (402, '00000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'spot 1 pays the price divided by four plus the remainder');
select throws_ok(
  $$ select public.report_transfer(test_helpers.match_booking(), '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'P0001', 'invalid_state', 'one reported transfer per player');

-- Bruno, spot 2
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select lives_ok(
  $$ select public.report_transfer(test_helpers.match_booking(), '00000000-0000-0000-0000-0000000000b1/r.png') $$,
  'another player reports his share while hers is pending');
select results_eq(
  $$ select amount from public.payments where payer_id = '00000000-0000-0000-0000-0000000000b1' $$,
  $$ values (400) $$,
  'the other spots pay a quarter');
select is((select count(*)::int from public.payments), 1, 'a match player sees only his own payments');

-- Juli, not in the match
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
select throws_ok(
  $$ select public.report_transfer(test_helpers.match_booking(), '00000000-0000-0000-0000-0000000000a5/r.png') $$,
  'P0001', 'forbidden', 'only players of the match report a share');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.record_cash(test_helpers.match_booking(), 400, '00000000-0000-0000-0000-0000000000a3') $$,
  'reception records cash for one player');
select throws_ok(
  $$ select public.record_cash(test_helpers.match_booking(), 400, '00000000-0000-0000-0000-0000000000a3') $$,
  'P0001', 'invalid_input', 'nobody pays more than his share');
select throws_ok(
  $$ select public.record_cash(test_helpers.match_booking(), 400) $$,
  'P0001', 'invalid_input', 'cash for a match says who pays');
select throws_ok(
  $$ select public.record_cash(test_helpers.match_booking(), 400, '00000000-0000-0000-0000-0000000000a5') $$,
  'P0001', 'invalid_input', 'only players of the match pay a share');
select throws_ok(
  $$ select public.record_cash(test_helpers.match_booking(), 400, '00000000-0000-0000-0000-0000000000b1') $$,
  'P0001', 'invalid_input', 'cash does not cover a share a reported transfer already covers');
select lives_ok(
  $$ select public.confirm_payment((select id from public.payments
       where payer_id = '00000000-0000-0000-0000-0000000000a1')) $$,
  'reception confirms a share');

-- Someone recorded cash for Bruno meanwhile (as postgres): his transfer would go past his share.
reset role;
insert into public.payments (club_id, booking_id, method, amount, status, payer_id, confirmed_at)
values ('a0000000-0000-0000-0000-000000000001', test_helpers.match_booking(), 'cash', 400, 'confirmed',
        '00000000-0000-0000-0000-0000000000b1', now());
set local role authenticated;
select throws_ok(
  $$ select public.confirm_payment((select id from public.payments
       where payer_id = '00000000-0000-0000-0000-0000000000b1' and status = 'reported')) $$,
  'P0001', 'invalid_state', 'a share cannot be confirmed past what the player owes');

-- A booking of one player works as in fase 1.
reset role;
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(4, '10:00', 90), '00000000-0000-0000-0000-0000000000a5', 1200);
set local role authenticated;
select throws_ok(
  $$ select public.record_cash('b0000000-0000-0000-0000-000000000001', 1200, '00000000-0000-0000-0000-0000000000a5') $$,
  'P0001', 'invalid_input', 'a booking of one player has no payer per share');
select lives_ok($$ select public.record_cash('b0000000-0000-0000-0000-000000000001', 1200) $$,
  'cash for a whole booking still works');

select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname in ('match_share', 'share_due', 'reported_amount')
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot execute the share helpers');

select * from finish();
rollback;
