begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(17);

-- C1: open. 'Libre' ($2.000 a pair, 2 pairs): Ana and Pedro, Gabi and Hugo, and Bruno and Lucía waiting.
-- '5ta': Juli and Raúl, with a transfer Juli reported. C2 was cancelled: Iván's reported transfer is left.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001',
  'Libre', 2);
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01', 'active', now() - interval '3 hours');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-0000000000a3', 'active', now() - interval '2 hours');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02', 'waiting', now() - interval '1 hour');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000001', '5ta');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a5', 'c4a00000-0000-0000-0000-000000000f06');
insert into public.payments (club_id, championship_entry_id, method, amount, status, payer_id) values
  ('a0000000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000004', 'transfer', 2000, 'reported',
   '00000000-0000-0000-0000-0000000000a5');
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000002', 'cancelled');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000003', 'c1a00000-0000-0000-0000-000000000002');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a4', 'c4a00000-0000-0000-0000-000000000f05');
insert into public.payments (club_id, championship_entry_id, method, amount, status, payer_id) values
  ('a0000000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000005', 'transfer', 2000, 'reported',
   '00000000-0000-0000-0000-0000000000a4');
insert into storage.objects (bucket_id, name) values
  ('receipts', '00000000-0000-0000-0000-0000000000a1/r.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000b1/r.png');

set local role authenticated;

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.report_championship_transfer('c3a00000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'a player reports the transfer of her pair');
select results_eq(
  $$ select amount, payer_id, booking_id from public.payments
     where championship_entry_id = 'c3a00000-0000-0000-0000-000000000001' $$,
  $$ values (2000, '00000000-0000-0000-0000-0000000000a1'::uuid, null::uuid) $$,
  'for the price of the pair, as hers');
select throws_ok(
  $$ select public.report_championship_transfer('c3a00000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'P0001', 'invalid_state', 'one reported transfer at a time');
select throws_ok(
  $$ select public.report_championship_transfer('c3a00000-0000-0000-0000-000000000002',
       '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'P0001', 'forbidden', 'only for her own pair');

-- Bruno
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select throws_ok(
  $$ select public.report_championship_transfer('c3a00000-0000-0000-0000-000000000003',
       '00000000-0000-0000-0000-0000000000b1/r.png') $$,
  'P0001', 'invalid_state', 'a waiting pair pays when it gets a place');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.confirm_payment((select id from public.payments
       where championship_entry_id = 'c3a00000-0000-0000-0000-000000000001')) $$,
  'reception confirms it');
select throws_ok(
  $$ select public.record_championship_cash('c3a00000-0000-0000-0000-000000000001', 2000) $$,
  'P0001', 'invalid_input', 'nobody pays more than the price');
select lives_ok(
  $$ select public.record_championship_cash('c3a00000-0000-0000-0000-000000000002', 2000) $$,
  'reception records cash for a pair');
select results_eq(
  $$ select payer_id, status::text from public.payments
     where championship_entry_id = 'c3a00000-0000-0000-0000-000000000002' $$,
  $$ values (null::uuid, 'confirmed') $$,
  'paid by the pair, confirmed');
select throws_ok(
  $$ select public.record_championship_cash('c3a00000-0000-0000-0000-000000000003', 2000) $$,
  'P0001', 'invalid_state', 'not for a waiting pair');
select lives_ok($$ select public.remove_championship_entry('c3a00000-0000-0000-0000-000000000004') $$,
  'reception takes out a pair with a transfer to review');
select results_eq(
  $$ select status::text, rejection_reason from public.payments
     where championship_entry_id = 'c3a00000-0000-0000-0000-000000000004' $$,
  $$ values ('rejected', 'El club quitó la pareja') $$,
  'and the transfer is rejected');
select throws_ok(
  $$ select public.confirm_payment((select id from public.payments
       where championship_entry_id = 'c3a00000-0000-0000-0000-000000000005')) $$,
  'P0001', 'invalid_state', 'nothing is confirmed for a cancelled championship');

-- Hugo
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';

select is((select count(*)::int from public.payments), 1, 'a player reads the payment of his pair, whoever paid');

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok($$ select public.withdraw_championship_entry('c3a00000-0000-0000-0000-000000000001') $$,
  'a paid pair withdraws');
select is(
  (select status::text from public.payments where championship_entry_id = 'c3a00000-0000-0000-0000-000000000001'),
  'confirmed', 'its payment stays, to give back');
select is(test_helpers.entry_status('c3a00000-0000-0000-0000-000000000003'), 'active', 'and the line moves');

select * from finish();
rollback;
