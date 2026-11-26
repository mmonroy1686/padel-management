begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(5);

-- Ana's booking, played today: two cash charges of today and a transfer.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  tstzrange(now() - interval '2 hours', now() - interval '30 minutes', '[)'), '00000000-0000-0000-0000-0000000000a1');
insert into public.payments (id, club_id, booking_id, method, amount, status, confirmed_by, confirmed_at) values
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'cash', 600, 'confirmed', '00000000-0000-0000-0000-0000000000c1', now()),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'cash', 300, 'confirmed', '00000000-0000-0000-0000-0000000000c1', now()),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'transfer', 300, 'confirmed', '00000000-0000-0000-0000-0000000000c1', now());

set local role authenticated;
-- Carla, reception of club T.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  $$ select public.void_desk_payments(array['e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003']::uuid[]) $$,
  'P0001', 'invalid_state', 'one payment that cannot be voided (a transfer) stops all of them');
select is((select status::text from public.payments where id = 'e0000000-0000-0000-0000-000000000001'), 'confirmed',
  'and the others stay charged: nothing half-undone');

select is((select count(*)::int from public.void_desk_payments(
  array['e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002']::uuid[])),
  2, 'voids every cash charge of today at once, each one once');
select is((select count(*)::int from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000001' and status = 'voided'),
  2, 'both are voided');

select throws_ok($$ select public.void_desk_payments(array[]::uuid[]) $$, 'P0001', 'invalid_input', 'an empty list is refused');

select * from finish();
rollback;
