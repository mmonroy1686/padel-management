begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(12);

-- Ana's booking, played today, with: cash charged today, POS charged yesterday, a transfer confirmed today.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  tstzrange(now() - interval '2 hours', now() - interval '30 minutes', '[)'), '00000000-0000-0000-0000-0000000000a1');
insert into public.payments (id, club_id, booking_id, method, amount, status, confirmed_by, confirmed_at) values
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'cash', 600, 'confirmed', '00000000-0000-0000-0000-0000000000c1', now()),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'card', 300, 'confirmed', '00000000-0000-0000-0000-0000000000c1', now() - interval '1 day'),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'transfer', 300, 'confirmed', '00000000-0000-0000-0000-0000000000c1', now());

-- Omar is reception of another club.
insert into public.clubs (id, slug, name) values ('a0000000-0000-0000-0000-000000000002', 'otro-club', 'Otro');
insert into public.club_members (club_id, user_id, role)
values ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', 'reception');

select throws_ok(
  $$ update public.payments set status = 'voided' where id = 'e0000000-0000-0000-0000-000000000003' $$,
  '23514', null, 'a voided payment says when');

set local role authenticated;

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok($$ select public.void_desk_payment('e0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'a player does not void payments');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select throws_ok($$ select public.void_desk_payment('e0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'nor the staff of another club');

-- Carla, reception of club T.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select is((select public.void_desk_payment('e0000000-0000-0000-0000-000000000001')).status::text, 'voided',
  'reception voids a cash charge of today');
select results_eq(
  $$ select voided_at is not null, voided_by, amount from public.payments where id = 'e0000000-0000-0000-0000-000000000001' $$,
  $$ values (true, '00000000-0000-0000-0000-0000000000c1'::uuid, 600) $$,
  'it stays, with who and when');
select is(
  (select coalesce(sum(amount), 0)::int from public.payments
    where booking_id = 'b0000000-0000-0000-0000-000000000001' and status = 'confirmed'),
  600, 'and no longer counts as paid (POS 300 + transfer 300 remain)');
select throws_ok($$ select public.void_desk_payment('e0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'invalid_state', 'not twice');
select throws_ok($$ select public.void_desk_payment('e0000000-0000-0000-0000-000000000002') $$,
  'P0001', 'invalid_state', 'not one charged another day');
select throws_ok($$ select public.void_desk_payment('e0000000-0000-0000-0000-000000000003') $$,
  'P0001', 'invalid_state', 'not a transfer: it is rejected or refunded instead');
select throws_ok($$ select public.void_desk_payment('e0000000-0000-0000-0000-0000000000ff') $$,
  'P0001', 'not_found', 'the payment exists');
select throws_ok(
  $$ update public.payments set status = 'voided', voided_at = now() where id = 'e0000000-0000-0000-0000-000000000002' $$,
  '42501', null, 'only through void_desk_payment');

reset role;
set local role anon;
select throws_ok($$ select public.void_desk_payment('e0000000-0000-0000-0000-000000000002') $$,
  '42501', null, 'not without signing in');

select * from finish();
rollback;
