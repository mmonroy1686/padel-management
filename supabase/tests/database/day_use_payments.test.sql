begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
select plan(24);

-- $450 passes: Ana and Bruno on day 2, Gabi on day 3, Hugo on day 4 with a 100 % reward, and Pepe
-- (no account) on day 2.
call test_helpers.make_product('d0000000-0000-0000-0000-000000000001', 'Day use completo',
  p_from => '00:00', p_to => '24:00');
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 2,
  '00000000-0000-0000-0000-0000000000a1');
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 2,
  '00000000-0000-0000-0000-0000000000b1');
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 3,
  '00000000-0000-0000-0000-0000000000a2');
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', 4,
  '00000000-0000-0000-0000-0000000000a3', 'bought', true);
insert into public.day_use_passes (id, club_id, product_id, on_date, guest_name, price, code, source)
values ('dd000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 2, 'Pepe', 450,
        'DU-' || nextval('test_helpers.pass_code'), 'reception');

insert into storage.objects (bucket_id, name) values
  ('receipts', '00000000-0000-0000-0000-0000000000a1/r.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000a2/r.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000a3/r.png');

set local role authenticated;

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.report_day_use_transfer('dd000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'a player reports the transfer of her pass');
select results_eq(
  $$ select amount, payer_id, booking_id, tournament_entry_id from public.payments
     where day_use_pass_id = 'dd000000-0000-0000-0000-000000000001' $$,
  $$ values (450, '00000000-0000-0000-0000-0000000000a1'::uuid, null::uuid, null::uuid) $$,
  'for what the pass costs, as hers, and for nothing else');
select throws_ok(
  $$ select public.report_day_use_transfer('dd000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'P0001', 'invalid_state', 'one reported transfer per pass');
select throws_ok(
  $$ select public.report_day_use_transfer('dd000000-0000-0000-0000-000000000002',
       '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'P0001', 'forbidden', 'only for her own pass');
select is((select count(*)::int from public.payments), 1, 'a player reads only her own payments');

-- Hugo's pass is free.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';
select throws_ok(
  $$ select public.report_day_use_transfer('dd000000-0000-0000-0000-000000000004',
       '00000000-0000-0000-0000-0000000000a3/r.png') $$,
  'P0001', 'invalid_state', 'a free pass has nothing to pay');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok($$ select public.record_day_use_cash('dd000000-0000-0000-0000-000000000002', 450) $$,
  'reception records cash for a pass');
select throws_ok($$ select public.record_day_use_cash('dd000000-0000-0000-0000-000000000002', 450) $$,
  'P0001', 'invalid_input', 'nobody pays more than the pass costs');
select throws_ok($$ select public.record_day_use_cash('dd000000-0000-0000-0000-000000000001', 450) $$,
  'P0001', 'invalid_input', 'cash does not cover what a reported transfer already covers');
select lives_ok($$ select public.record_day_use_cash('dd000000-0000-0000-0000-000000000005', 450) $$,
  'someone without an account pays cash too');
select results_eq(
  $$ select payer_id from public.payments where day_use_pass_id = 'dd000000-0000-0000-0000-000000000005' $$,
  $$ values (null::uuid) $$,
  'with no payer');
select lives_ok(
  $$ select public.confirm_payment((select id from public.payments
       where day_use_pass_id = 'dd000000-0000-0000-0000-000000000001')) $$,
  'reception confirms the transfer');

-- Gabi reports, then cancels: her transfer is rejected.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ select public.report_day_use_transfer('dd000000-0000-0000-0000-000000000003',
       '00000000-0000-0000-0000-0000000000a2/r.png') $$,
  'another player reports hers');
select lives_ok($$ select public.cancel_day_use('dd000000-0000-0000-0000-000000000003') $$, 'and cancels the pass');
select results_eq(
  $$ select status::text, rejection_reason from public.payments
     where day_use_pass_id = 'dd000000-0000-0000-0000-000000000003' $$,
  $$ values ('rejected', 'Pase cancelado') $$,
  'cancelling rejects the reported transfer');

-- Ana paid and cancels: the payment stays, to be refunded.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok($$ select public.cancel_day_use('dd000000-0000-0000-0000-000000000001') $$,
  'a player who paid can still cancel before check-in');
select is(
  (select status::text from public.payments where day_use_pass_id = 'dd000000-0000-0000-0000-000000000001'),
  'confirmed', 'her payment stays confirmed until the club gives it back');

-- A transfer reported on a cancelled pass (as postgres) cannot be confirmed.
reset role;
insert into public.payments (id, club_id, day_use_pass_id, method, amount, status, payer_id)
values ('ea000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
        'dd000000-0000-0000-0000-000000000001', 'transfer', 450, 'reported', '00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok($$ select public.confirm_payment('ea000000-0000-0000-0000-000000000001') $$,
  'P0001', 'invalid_state', 'nothing is confirmed for a cancelled pass');
select lives_ok(
  $$ select public.refund_payment((select id from public.payments
       where day_use_pass_id = 'dd000000-0000-0000-0000-000000000001' and status = 'confirmed')) $$,
  'reception marks the refund');
select is(
  (select count(*)::int from public.payments
   where day_use_pass_id = 'dd000000-0000-0000-0000-000000000001' and status = 'refunded'),
  1, 'the payment is refunded');

select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in ('day_use_horizon', 'day_use_open_on', 'day_use_period', 'generate_day_use',
                         'regenerate_day_use', 'extend_all_day_use', 'loyalty_of', 'new_day_use_code', 'sell_pass',
                         'pass_due')
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot execute the day use helpers');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok($$ select public.record_day_use_cash('dd000000-0000-0000-0000-000000000002', 1) $$,
  'P0001', 'forbidden', 'staff of another club cannot charge cash');
select throws_ok($$ select public.confirm_payment('ea000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'nor confirm a transfer');

-- Anonymous visitor
set local role anon;
select throws_ok(
  $$ select public.report_day_use_transfer('dd000000-0000-0000-0000-000000000001', null) $$,
  '42501', null, 'anon cannot call report_day_use_transfer');

select * from finish();
rollback;
