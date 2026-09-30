begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/tournament.psql
select plan(23);

-- P1: $400, day 3. Ana, Bruno, Gabi and a guest.
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000001', test_helpers.slot(3, '18:00', 140));
call test_helpers.add_entry('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1');
call test_helpers.add_entry('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1');
call test_helpers.add_entry('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2');
call test_helpers.add_guests('e3000000-0000-0000-0000-000000000001', 1);
-- P2: $400, day 5. Juli paid cash; Hugo reported a transfer.
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000002', test_helpers.slot(5, '18:00', 140));
call test_helpers.add_entry('e3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a5');
call test_helpers.add_entry('e3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a3');
insert into public.payments (club_id, tournament_entry_id, method, amount, status, payer_id, confirmed_at) values
  ('a0000000-0000-0000-0000-000000000001',
   test_helpers.entry_of('e3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a5'),
   'cash', 400, 'confirmed', '00000000-0000-0000-0000-0000000000a5', now());
insert into public.payments (club_id, tournament_entry_id, method, amount, status, payer_id) values
  ('a0000000-0000-0000-0000-000000000001',
   test_helpers.entry_of('e3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a3'),
   'transfer', 400, 'reported', '00000000-0000-0000-0000-0000000000a3');

insert into storage.objects (bucket_id, name) values
  ('receipts', '00000000-0000-0000-0000-0000000000a1/r.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000a2/r.png');

set local role authenticated;

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.report_tournament_transfer(
       test_helpers.entry_of('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1'),
       '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'a player reports the transfer of her entry');
select results_eq(
  $$ select amount, payer_id, booking_id from public.payments
     where tournament_entry_id = test_helpers.entry_of('e3000000-0000-0000-0000-000000000001',
                                                       '00000000-0000-0000-0000-0000000000a1') $$,
  $$ values (400, '00000000-0000-0000-0000-0000000000a1'::uuid, null::uuid) $$,
  'for the whole price, as hers, with no booking');
select throws_ok(
  $$ select public.report_tournament_transfer(
       test_helpers.entry_of('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1'),
       '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'P0001', 'invalid_state', 'one reported transfer per entry');
select throws_ok(
  $$ select public.report_tournament_transfer(
       test_helpers.entry_of('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1'),
       '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'P0001', 'forbidden', 'only for her own entry');
select is((select count(*)::int from public.payments), 1, 'a player reads only her own payments');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.record_tournament_cash(
       test_helpers.entry_of('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1'), 400) $$,
  'reception records cash for an entry');
select throws_ok(
  $$ select public.record_tournament_cash(
       test_helpers.entry_of('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1'), 400) $$,
  'P0001', 'invalid_input', 'nobody pays more than the price');
select throws_ok(
  $$ select public.record_tournament_cash(
       test_helpers.entry_of('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1'), 400) $$,
  'P0001', 'invalid_input', 'cash does not cover what a reported transfer already covers');
select lives_ok(
  $$ select public.record_tournament_cash((select id from public.tournament_entries
       where tournament_id = 'e3000000-0000-0000-0000-000000000001' and guest_name = 'Invitado 1'), 400) $$,
  'a guest pays cash too');
select results_eq(
  $$ select p.payer_id from public.payments p join public.tournament_entries e on e.id = p.tournament_entry_id
     where e.guest_name = 'Invitado 1' $$,
  $$ values (null::uuid) $$,
  'with no payer');
select lives_ok(
  $$ select public.confirm_payment((select id from public.payments
       where payer_id = '00000000-0000-0000-0000-0000000000a1')) $$,
  'reception confirms the transfer');

-- Gabi reports, then leaves: her transfer is rejected.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ select public.report_tournament_transfer(
       test_helpers.entry_of('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2'),
       '00000000-0000-0000-0000-0000000000a2/r.png') $$,
  'another player reports hers');
select lives_ok($$ select public.leave_tournament('e3000000-0000-0000-0000-000000000001') $$, 'and leaves');
select results_eq(
  $$ select status::text, rejection_reason from public.payments
     where payer_id = '00000000-0000-0000-0000-0000000000a2' $$,
  $$ values ('rejected', 'Saliste del torneo') $$,
  'leaving rejects the reported transfer');

-- Ana paid and leaves: the payment stays, to be refunded.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok($$ select public.leave_tournament('e3000000-0000-0000-0000-000000000001') $$,
  'a player who paid can still leave while registration is open');
select is(
  (select status::text from public.payments where payer_id = '00000000-0000-0000-0000-0000000000a1'),
  'confirmed', 'her payment stays confirmed until the club gives it back');

-- Carla cancels P2.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok($$ select public.cancel_tournament('e3000000-0000-0000-0000-000000000002') $$,
  'reception cancels a tournament with payments');
select results_eq(
  $$ select p.status::text, p.rejection_reason from public.payments p
     join public.tournament_entries e on e.id = p.tournament_entry_id
     where e.tournament_id = 'e3000000-0000-0000-0000-000000000002'
     order by p.status $$,
  $$ values ('confirmed', null::text), ('rejected', 'Torneo cancelado') $$,
  'reported transfers are rejected, confirmed payments stay for a refund');

-- A transfer reported on an entry that left (as postgres) cannot be confirmed.
reset role;
insert into public.payments (club_id, tournament_entry_id, method, amount, status, payer_id)
select 'a0000000-0000-0000-0000-000000000001', id, 'transfer', 400, 'reported', '00000000-0000-0000-0000-0000000000a1'
from public.tournament_entries
where tournament_id = 'e3000000-0000-0000-0000-000000000001' and player_id = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;
select throws_ok(
  $$ select public.confirm_payment((select id from public.payments
       where payer_id = '00000000-0000-0000-0000-0000000000a1' and status = 'reported')) $$,
  'P0001', 'invalid_state', 'nothing is confirmed for an entry that left');
select lives_ok(
  $$ select public.refund_payment((select id from public.payments
       where payer_id = '00000000-0000-0000-0000-0000000000a1' and status = 'confirmed')) $$,
  'reception marks the refund');
select is(
  (select count(*)::int from public.payments
   where payer_id = '00000000-0000-0000-0000-0000000000a1' and status = 'refunded'),
  1, 'the payment is refunded');

select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in ('entry_due', 'drop_entry', 'tournament_fit', 'active_entry_count', 'staff_tournament',
                         'tournament_minutes')
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot execute the tournament helpers');

-- Anonymous visitor
set local role anon;
select throws_ok(
  $$ select public.report_tournament_transfer('e3000000-0000-0000-0000-000000000001', null) $$,
  '42501', null, 'anon cannot call report_tournament_transfer');

select * from finish();
rollback;
