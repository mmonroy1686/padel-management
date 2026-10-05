begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/waitlist.psql
select plan(29);

select is(
  (select count(*)::int from private.day_slots('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1)),
  10, 'the grid has ten slots a day, 08:00 to 21:30');
select is(
  (select d.s from private.day_slots('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1) as d (s)
   order by d.s desc limit 1),
  test_helpers.slot(1, '21:30', 90), 'the last slot ends when the club closes');

select is(private.hold_minutes(now() + interval '3 hours', now()), 15, 'a slot more than two hours away is held 15 minutes');
select is(private.hold_minutes(now() + interval '90 minutes', now()), 5, 'under two hours, 5 minutes');
select is(private.hold_minutes(now() + interval '45 minutes', now()), null::integer,
  'at 45 minutes or less nobody gets it held');

-- The line for tomorrow evening, oldest first: Gabi (Cancha 2 only), Hugo (mornings), Iván (already
-- holding another court), Ana, Juli and Bruno (who has Cancha 1 booked at 18:30).
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a2',
  p_courts => array['c0000000-0000-0000-0000-000000000002']::uuid[], p_created_at => now() - interval '3 hours');
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000a3',
  p_from => '08:00', p_to => '12:30', p_created_at => now() - interval '150 minutes');
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-0000000000a4',
  p_created_at => now() - interval '2 hours');
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-0000000000a1',
  p_created_at => now() - interval '1 hour');
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-0000000000a5',
  p_created_at => now() - interval '30 minutes');
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-0000000000b1',
  p_created_at => now() - interval '10 minutes');
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-0000000000a4', 2,
  '08:00', '12:30');
call test_helpers.make_hold('e1000000-0000-0000-0000-000000000017', 'e0000000-0000-0000-0000-000000000017',
  'c0000000-0000-0000-0000-000000000002', test_helpers.slot(2, '08:00', 90), now() + interval '1 hour');
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(1, '18:30', 90), '00000000-0000-0000-0000-0000000000b1', 1600);

-- A court freed and taken again in the same transaction (claiming, regenerating a day use) is not offered.
insert into public.court_occupancy (id, club_id, court_id, kind, period, note) values
  ('ee000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000002', 'block', test_helpers.slot(1, '21:30', 90), 'Clase');
delete from public.court_occupancy where id = 'ee000000-0000-0000-0000-000000000001';
insert into public.court_occupancy (club_id, court_id, kind, period, note) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'block',
   test_helpers.slot(1, '21:30', 90), 'Clase');
set constraints all immediate;
set constraints all deferred;
select is((select count(*)::int from public.slot_holds where status = 'active'), 1,
  'a court freed and taken again in the same transaction is not offered');

-- Carla cancels Bruno's booking: when the transaction commits, the slot is offered.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok($$ select public.cancel_booking('b0000000-0000-0000-0000-000000000001') $$,
  'reception cancels Bruno''s booking');
set constraints all immediate;
set constraints all deferred;
reset role;

select results_eq(
  $$ select court_id, period from public.slot_holds
     where id = test_helpers.active_hold('00000000-0000-0000-0000-0000000000a1') $$,
  $$ values ('c0000000-0000-0000-0000-000000000001'::uuid, test_helpers.slot(1, '18:30', 90)) $$,
  'the freed slot is held for the first in line that takes that court and time: Ana');
select is(
  (select expires_at from public.court_occupancy
   where id = test_helpers.hold_occupancy(test_helpers.active_hold('00000000-0000-0000-0000-0000000000a1'))),
  now() + interval '15 minutes', 'more than two hours ahead, for 15 minutes');
select is((select count(*)::int from public.slot_holds where status = 'active'), 2,
  'nobody else gets a hold: Gabi wants Cancha 2, Hugo mornings and Iván already has one');
select results_eq(
  $$ select kind::text, link, data ->> 'court_name', (data ->> 'expires_at')::timestamptz
     from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('slot_held', '/', 'Cancha 1', now() + interval '15 minutes') $$,
  'Ana gets an aviso with the court and until when it is hers');

-- Nobody can take a held court.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(1, '18:30')) $$,
  'P0001', 'slot_taken', 'nobody books a held slot online');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000001', test_helpers.at(1, '18:30'),
       p_guest_name => 'Pérez') $$,
  'P0001', 'slot_taken', 'nor reception');
reset role;

-- Ana passes (decline_slot_hold does this in the next migration): the slot goes on, never back to her.
update public.slot_holds set status = 'declined', ended_at = now()
 where player_id = '00000000-0000-0000-0000-0000000000a1' and status = 'active';
delete from public.court_occupancy o using public.slot_holds h
 where h.occupancy_id = o.id and h.player_id = '00000000-0000-0000-0000-0000000000a1' and h.status = 'declined';
set constraints all immediate;
set constraints all deferred;

select results_eq(
  $$ select court_id, period from public.slot_holds
     where id = test_helpers.active_hold('00000000-0000-0000-0000-0000000000a5') $$,
  $$ values ('c0000000-0000-0000-0000-000000000001'::uuid, test_helpers.slot(1, '18:30', 90)) $$,
  'after a pass the slot goes to the next in line: Juli');
select is((select status::text from public.slot_waits where id = 'e0000000-0000-0000-0000-000000000014'), 'waiting',
  'Ana keeps waiting for the other slots of her range');

-- The job, sixteen minutes later.
select is(private.expire_waitlist(now() + interval '16 minutes'), 1, 'the job expires the holds whose time ran out');
select ok(
  test_helpers.active_hold('00000000-0000-0000-0000-0000000000a5') is null
  and not exists (select 1 from public.court_occupancy
                  where kind = 'hold' and court_id = 'c0000000-0000-0000-0000-000000000001'),
  'Juli''s hold expired and its court went free');
set constraints all immediate;
set constraints all deferred;
select results_eq(
  $$ select court_id, period from public.slot_holds
     where id = test_helpers.active_hold('00000000-0000-0000-0000-0000000000b1') $$,
  $$ values ('c0000000-0000-0000-0000-000000000001'::uuid, test_helpers.slot(1, '18:30', 90)) $$,
  'an expired hold goes to the next in line: Bruno, free again at that time');

-- Close to the start: 5 minutes, or nobody gets it held.
select is(
  private.offer_freed('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
    test_helpers.slot(1, '20:00', 90), test_helpers.at(1, '20:00') - interval '90 minutes'),
  1, 'a slot freed 90 minutes before it starts is still held');
select is(
  (select expires_at from public.slot_holds where id = test_helpers.active_hold('00000000-0000-0000-0000-0000000000a2')),
  test_helpers.at(1, '20:00') - interval '85 minutes', 'for 5 minutes, to Gabi, who wants Cancha 2');
select is(
  private.offer_freed('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
    test_helpers.slot(1, '21:30', 90), test_helpers.at(1, '21:30') - interval '30 minutes'),
  4, 'thirty minutes before, nobody gets it held: the whole line hears about it');
select results_eq(
  $$ select user_id, link from public.notifications where kind = 'slot_free_now' order by user_id $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, '/reservar?dia=' || (test_helpers.today() + 1)::text),
            ('00000000-0000-0000-0000-0000000000a4'::uuid, '/reservar?dia=' || (test_helpers.today() + 1)::text),
            ('00000000-0000-0000-0000-0000000000a5'::uuid, '/reservar?dia=' || (test_helpers.today() + 1)::text),
            ('00000000-0000-0000-0000-0000000000b1'::uuid, '/reservar?dia=' || (test_helpers.today() + 1)::text) $$,
  'everyone whose wait takes Cancha 1 at 21:30 (not Gabi nor Hugo), with a link to that day');
select is((select count(*)::int from public.slot_holds where status = 'active'), 3,
  'and no hold is created (Iván, Bruno and Gabi keep theirs)');
select is(
  private.offer_freed('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
    test_helpers.slot(1, '21:30', 90), test_helpers.at(1, '21:30') - interval '20 minutes'),
  0, 'nobody hears about the same slot twice');
select is(
  private.offer_freed('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
    test_helpers.slot(-1, '18:30', 90)),
  0, 'a slot that already started is not offered');

-- Tomorrow at 12:30 Iván's and Bruno's holds have run out (Gabi's lasts until 18:35), and so has
-- Hugo's morning wait.
select is(private.expire_waitlist(test_helpers.at(1, '12:30')), 2, 'by then two holds ran out');
select results_eq(
  $$ select id from public.slot_waits where status = 'expired' $$,
  $$ values ('e0000000-0000-0000-0000-000000000012'::uuid) $$,
  'a wait whose range is over expires; the others keep waiting');

select is((select count(*)::int from cron.job where jobname = 'expire-waitlist'), 1,
  'pg_cron expires holds and waits every minute');
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in ('day_slots', 'hold_minutes', 'wait_fits', 'announce_free_slot', 'offer_freed',
                         'on_occupancy_freed', 'expire_waitlist')
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot execute the waitlist engine');

select * from finish();
rollback;
