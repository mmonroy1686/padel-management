begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/waitlist.psql
select plan(44);

-- Tomorrow at 18:30 both courts are taken: Bruno has Cancha 1, Gabi Cancha 2.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(1, '18:30', 90), '00000000-0000-0000-0000-0000000000b1', 1600);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(1, '18:30', 90), '00000000-0000-0000-0000-0000000000a2', 1600);

-- Ana signs up
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '18:30', '20:00') $$,
  'Ana waits for tomorrow at 18:30 on any court');
select results_eq(
  $$ select on_date, from_time, to_time, court_ids, status::text from public.slot_waits $$,
  $$ values (test_helpers.today() + 1, '18:30'::time, '20:00'::time, '{}'::uuid[], 'waiting') $$,
  'the wait is hers, waiting');
select lives_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '18:30', '20:00',
       array['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002']::uuid[]) $$,
  'she can pick the courts');
select is((select count(*)::int from public.slot_waits where court_ids = '{}'), 2,
  'picking every court means any court, including one the club adds later');
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '08:00', '09:30') $$,
  'P0001', 'slot_available', 'when a slot in the range is free, she books it instead');
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '20:00', '18:30') $$,
  'P0001', 'invalid_input', 'the range starts before it ends');
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '07:00', '09:30') $$,
  'P0001', 'invalid_input', 'the range is inside the club''s hours');
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '18:30', '19:30') $$,
  'P0001', 'invalid_input', 'the range holds at least one whole slot');
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '18:30', '20:00',
       array['cb000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'P0001', 'invalid_input', 'the courts are the club''s');
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() - 1, '18:30', '20:00') $$,
  'P0001', 'in_the_past', 'no waits for the past');
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 15, '18:30', '20:00') $$,
  'P0001', 'outside_window', 'no waits beyond the booking window');
select lives_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '18:30', '20:00',
       array['c0000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'a third wait is fine');
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '18:30', '20:00') $$,
  'P0001', 'too_many_waits', 'a fourth active wait goes over the limit');

-- Omar, not a member; then an anonymous visitor
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '18:30', '20:00') $$,
  'P0001', 'forbidden', 'only members wait');
set local role anon;
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '18:30', '20:00') $$,
  '42501', null, 'anon cannot call create_slot_wait');

-- Cancelling: Hugo's wait
reset role;
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000a3', 1,
  '18:30', '20:00');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok($$ select public.cancel_slot_wait('e0000000-0000-0000-0000-000000000021') $$,
  'P0001', 'forbidden', 'only the player cancels her wait');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';
select lives_ok($$ select public.cancel_slot_wait('e0000000-0000-0000-0000-000000000021') $$, 'Hugo cancels his wait');
select is((select status::text from public.slot_waits where id = 'e0000000-0000-0000-0000-000000000021'), 'cancelled',
  'it is cancelled');
select throws_ok($$ select public.cancel_slot_wait('e0000000-0000-0000-0000-000000000021') $$,
  'P0001', 'invalid_state', 'a cancelled wait cannot be cancelled again');

-- Claiming: Juli signed up before Ana, so Bruno's freed court is held for her.
reset role;
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-0000000000a5',
  p_created_at => now() - interval '1 hour');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok($$ select public.cancel_booking('b0000000-0000-0000-0000-000000000001') $$,
  'reception cancels Bruno''s booking');
set constraints all immediate;
set constraints all deferred;

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok($$ select public.claim_slot_hold(test_helpers.active_hold('00000000-0000-0000-0000-0000000000a5')) $$,
  'P0001', 'forbidden', 'only the player books her hold');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
select lives_ok($$ select public.claim_slot_hold(test_helpers.active_hold('00000000-0000-0000-0000-0000000000a5')) $$,
  'Juli books the slot held for her');
reset role;
select results_eq(
  $$ select b.price, b.source::text, b.player_id, o.kind::text
     from public.bookings b join public.court_occupancy o on o.id = b.occupancy_id
     where b.court_id = 'c0000000-0000-0000-0000-000000000001' and b.period = test_helpers.slot(1, '18:30', 90)
       and b.status = 'confirmed' $$,
  $$ values (1600, 'online', '00000000-0000-0000-0000-0000000000a5'::uuid, 'booking') $$,
  'it is an online booking of hers at the slot''s price, holding the court');
select results_eq(
  $$ select h.status::text, h.booking_id = b.id, w.status::text
     from public.slot_holds h
     join public.slot_waits w on w.id = h.wait_id
     join public.bookings b on b.player_id = h.player_id and b.period = h.period and b.status = 'confirmed'
     where h.id = test_helpers.hold_of('e0000000-0000-0000-0000-000000000022', test_helpers.slot(1, '18:30', 90)) $$,
  $$ values ('claimed', true, 'booked') $$,
  'the hold is claimed with its booking, and her wait is booked');
select is(
  (select count(*)::int from public.payments p join public.bookings b on b.id = p.booking_id
   where b.player_id = '00000000-0000-0000-0000-0000000000a5'),
  0, 'it waits for payment like any booking (cash or transfer, in Cobros)');
set local role authenticated;
select throws_ok(
  $$ select public.claim_slot_hold(test_helpers.hold_of('e0000000-0000-0000-0000-000000000022',
       test_helpers.slot(1, '18:30', 90))) $$,
  'P0001', 'invalid_state', 'a claimed hold cannot be claimed again');

-- Passing: Juli waits again (oldest), but she is busy at 18:30 now; Iván signed up after Ana.
reset role;
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-0000000000a5',
  p_created_at => now() - interval '2 hours');
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-0000000000a4', 1,
  '18:30', '20:00', p_created_at => now() + interval '1 minute');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok($$ select public.cancel_booking('b0000000-0000-0000-0000-000000000002') $$,
  'reception cancels Gabi''s booking');
set constraints all immediate;
set constraints all deferred;
reset role;
select results_eq(
  $$ select court_id, period from public.slot_holds
     where id = test_helpers.active_hold('00000000-0000-0000-0000-0000000000a1') $$,
  $$ values ('c0000000-0000-0000-0000-000000000002'::uuid, test_helpers.slot(1, '18:30', 90)) $$,
  'Juli is busy at that time, so Cancha 2 is held for Ana');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok($$ select public.decline_slot_hold(test_helpers.active_hold('00000000-0000-0000-0000-0000000000a1')) $$,
  'P0001', 'forbidden', 'only the player passes on her hold');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok($$ select public.decline_slot_hold(test_helpers.active_hold('00000000-0000-0000-0000-0000000000a1')) $$,
  'Ana says it does not work for her');
reset role;
select ok(
  (select status = 'declined' and occupancy_id is null from public.slot_holds
   where player_id = '00000000-0000-0000-0000-0000000000a1'
     and court_id = 'c0000000-0000-0000-0000-000000000002' and period = test_helpers.slot(1, '18:30', 90)),
  'her hold is declined and the court went free');
set constraints all immediate;
set constraints all deferred;
select results_eq(
  $$ select court_id, period from public.slot_holds
     where id = test_helpers.active_hold('00000000-0000-0000-0000-0000000000a4') $$,
  $$ values ('c0000000-0000-0000-0000-000000000002'::uuid, test_helpers.slot(1, '18:30', 90)) $$,
  'it goes to Iván, not back to Ana through her other waits');

-- Reception passes it on
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.release_slot_hold(test_helpers.hold_occupancy(test_helpers.active_hold('00000000-0000-0000-0000-0000000000a4'))) $$,
  'P0001', 'forbidden', 'a player cannot pass someone else''s hold on');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  $$ select public.release_slot_hold(test_helpers.hold_occupancy(test_helpers.active_hold('00000000-0000-0000-0000-0000000000a4'))) $$,
  'P0001', 'forbidden', 'nor staff of another club');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.release_slot_hold(test_helpers.hold_occupancy(test_helpers.active_hold('00000000-0000-0000-0000-0000000000a4'))) $$,
  'reception passes Iván''s hold to the next in line');
set constraints all immediate;
set constraints all deferred;
reset role;
select ok(
  (select status = 'released' from public.slot_holds
   where id = test_helpers.hold_of('e0000000-0000-0000-0000-000000000023', test_helpers.slot(1, '18:30', 90)))
  and not exists (select 1 from public.court_occupancy
                  where court_id = 'c0000000-0000-0000-0000-000000000002' and period && test_helpers.slot(1, '18:30', 90)),
  'Iván''s hold is released; nobody else in line takes it, so the court is free');
set local role authenticated;
select throws_ok(
  $$ select public.release_slot_hold('ee000000-0000-0000-0000-00000000dead') $$,
  'P0001', 'not_found', 'a hold that is gone cannot be passed on');

-- A hold whose time ran out (the job has not run yet)
reset role;
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-0000000000a2', 3);
call test_helpers.make_hold('e1000000-0000-0000-0000-000000000025', 'e0000000-0000-0000-0000-000000000025',
  'c0000000-0000-0000-0000-000000000001', test_helpers.slot(3, '18:30', 90), now() - interval '1 minute');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select throws_ok($$ select public.claim_slot_hold('e1000000-0000-0000-0000-000000000025') $$,
  'P0001', 'hold_expired', 'a hold whose time ran out cannot be booked');

-- Cancelling a wait that has a hold frees the court
reset role;
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000026', '00000000-0000-0000-0000-0000000000b1', 3);
call test_helpers.make_hold('e1000000-0000-0000-0000-000000000026', 'e0000000-0000-0000-0000-000000000026',
  'c0000000-0000-0000-0000-000000000002', test_helpers.slot(3, '20:00', 90));
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select lives_ok($$ select public.cancel_slot_wait('e0000000-0000-0000-0000-000000000026') $$,
  'Bruno cancels a wait while it holds a court');
reset role;
select results_eq(
  $$ select w.status::text, h.status::text, h.occupancy_id is null
     from public.slot_waits w join public.slot_holds h on h.wait_id = w.id
     where w.id = 'e0000000-0000-0000-0000-000000000026' $$,
  $$ values ('cancelled', 'declined', true) $$,
  'the wait is cancelled and its hold let go');

-- Avisos read
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
select is(public.mark_notifications_read(), 1, 'opening Avisos marks Juli''s aviso read');
select is((select count(*)::int from public.notifications where read_at is null), 0, 'none left unread');
set local role anon;
select throws_ok($$ select public.mark_notifications_read() $$, '42501', null, 'anon cannot call mark_notifications_read');

reset role;
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'end_hold'
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot end holds directly');

select * from finish();
rollback;
