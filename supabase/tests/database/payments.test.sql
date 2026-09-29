begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(23);

call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '20:00', 90), '00000000-0000-0000-0000-0000000000a1', 1600);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(3, '20:00', 90), '00000000-0000-0000-0000-0000000000b1', 1600);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(4, '20:00', 90), '00000000-0000-0000-0000-0000000000a1', 1600);

insert into storage.objects (bucket_id, name) values
  ('receipts', '00000000-0000-0000-0000-0000000000a1/r1.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000a1/r3.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000b1/r2.png');

-- Ana, player
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.report_transfer('b0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'receipt_required', 'the club asks for a receipt');
select throws_ok(
  $$ select public.report_transfer('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1/r2.png') $$,
  'P0001', 'forbidden', 'the receipt has to be in her own folder');
select throws_ok(
  $$ select public.report_transfer('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1/missing.png') $$,
  'P0001', 'forbidden', 'the receipt has to exist');
select throws_ok(
  $$ select public.report_transfer('b0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1/r1.png') $$,
  'P0001', 'forbidden', 'only for her own bookings');
select lives_ok(
  $$ select public.report_transfer('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1/r1.png') $$,
  'a player reports her transfer with the receipt');
select results_eq(
  $$ select method::text, amount, status::text, receipt_path from public.payments
     where booking_id = 'b0000000-0000-0000-0000-000000000001' $$,
  $$ values ('transfer', 1600, 'reported', '00000000-0000-0000-0000-0000000000a1/r1.png') $$,
  'the transfer is reported for the whole amount due');
select throws_ok(
  $$ select public.report_transfer('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1/r1.png') $$,
  'P0001', 'invalid_state', 'one reported transfer at a time');
select throws_ok(
  $$ select public.confirm_payment((select id from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000001')) $$,
  'P0001', 'forbidden', 'players cannot confirm payments');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.confirm_payment((select id from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000001')) $$,
  'reception confirms a reported transfer');
select results_eq(
  $$ select status::text, confirmed_by from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000001' $$,
  $$ values ('confirmed', '00000000-0000-0000-0000-0000000000c1'::uuid) $$,
  'the payment records who confirmed it');
select throws_ok(
  $$ select public.confirm_payment((select id from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000001')) $$,
  'P0001', 'invalid_state', 'a payment is confirmed once');
select throws_ok(
  $$ select public.record_cash('b0000000-0000-0000-0000-000000000002', 0) $$,
  'P0001', 'invalid_input', 'cash is a positive amount');
select throws_ok(
  $$ select public.record_cash('b0000000-0000-0000-0000-000000000002', 2000) $$,
  'P0001', 'invalid_input', 'cash cannot exceed what is due');
select lives_ok(
  $$ select public.record_cash('b0000000-0000-0000-0000-000000000002', 1600) $$,
  'reception records a cash payment');
select is(
  (select status::text from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000002'), 'confirmed',
  'cash is confirmed on the spot');
select lives_ok(
  $$ select public.refund_payment((select id from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000001')) $$,
  'reception marks a payment as refunded');
select is(
  (select status::text from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000001'), 'refunded',
  'the refund is recorded');

-- Ana again
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select is((select count(*)::int from public.payments), 1, 'a player sees only the payments of her bookings');
select lives_ok(
  $$ select public.report_transfer('b0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1/r3.png') $$,
  'she reports another transfer');

-- Carla rejects it
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.reject_payment((select id from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000003'),
       'No llegó') $$,
  'reception rejects a transfer with a reason');
select results_eq(
  $$ select status::text, rejection_reason from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000003' $$,
  $$ values ('rejected', 'No llegó') $$,
  'the rejection keeps its reason');

-- Ana reports again; then the club stops taking transfers.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.report_transfer('b0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1/r3.png') $$,
  'after a rejection the player can report again');

reset role;
update public.clubs set accepts_transfer = false where id = 'a0000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.report_transfer('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1/r1.png') $$,
  'P0001', 'method_disabled', 'no transfers when the club does not take them');

select * from finish();
rollback;
