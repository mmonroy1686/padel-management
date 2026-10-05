begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/waitlist.psql
select plan(14);

-- Claiming follows every rule of an online booking.
-- Ana holds Cancha 1 tomorrow at 18:30, but she already plays at that time on Cancha 2.
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-0000000000a1');
call test_helpers.make_hold('e1000000-0000-0000-0000-000000000031', 'e0000000-0000-0000-0000-000000000031',
  'c0000000-0000-0000-0000-000000000001', test_helpers.slot(1, '18:30', 90));
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000031', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(1, '18:30', 90), '00000000-0000-0000-0000-0000000000a1', 1600);

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok($$ select public.claim_slot_hold('e1000000-0000-0000-0000-000000000031') $$,
  'P0001', 'busy_at_that_time', 'she cannot claim a slot when she already plays at that time');
reset role;

-- Bruno already has two active bookings: the limit applies to a claim too.
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-0000000000b1');
call test_helpers.make_hold('e1000000-0000-0000-0000-000000000032', 'e0000000-0000-0000-0000-000000000032',
  'c0000000-0000-0000-0000-000000000002', test_helpers.slot(1, '20:00', 90));
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000032', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(2, '08:00', 90), '00000000-0000-0000-0000-0000000000b1', 1200);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000033', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '08:00', 90), '00000000-0000-0000-0000-0000000000b1', 1200);

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok($$ select public.claim_slot_hold('e1000000-0000-0000-0000-000000000032') $$,
  'P0001', 'too_many_bookings', 'the active bookings limit applies to a claim');
reset role;

-- Gabi's hold is beyond the booking window (14 days).
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-0000000000a2', 13);
call test_helpers.make_hold('e1000000-0000-0000-0000-000000000033', 'e0000000-0000-0000-0000-000000000033',
  'c0000000-0000-0000-0000-000000000001', test_helpers.slot(15, '18:30', 90));

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select throws_ok($$ select public.claim_slot_hold('e1000000-0000-0000-0000-000000000033') $$,
  'P0001', 'outside_window', 'a claim stays inside the booking window');
reset role;

-- Hugo's court was turned off while it was held for him.
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-0000000000a3', 2);
call test_helpers.make_hold('e1000000-0000-0000-0000-000000000034', 'e0000000-0000-0000-0000-000000000034',
  'c0000000-0000-0000-0000-000000000002', test_helpers.slot(2, '20:00', 90));
update public.courts set is_active = false where id = 'c0000000-0000-0000-0000-000000000002';

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';
select throws_ok($$ select public.claim_slot_hold('e1000000-0000-0000-0000-000000000034') $$,
  'P0001', 'not_found', 'a court turned off cannot be claimed');
reset role;
update public.courts set is_active = true where id = 'c0000000-0000-0000-0000-000000000002';

-- Iván's slot lost its price.
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-0000000000a4', 2);
call test_helpers.make_hold('e1000000-0000-0000-0000-000000000035', 'e0000000-0000-0000-0000-000000000035',
  'c0000000-0000-0000-0000-000000000001', test_helpers.slot(2, '20:00', 90));
delete from public.pricing_rules where club_id = 'a0000000-0000-0000-0000-000000000001' and from_time = '18:30';

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a4", "role": "authenticated"}';
select throws_ok($$ select public.claim_slot_hold('e1000000-0000-0000-0000-000000000035') $$,
  'P0001', 'no_price', 'a slot without a price cannot be claimed');
reset role;
insert into public.pricing_rules (club_id, weekdays, from_time, to_time, price) values
  ('a0000000-0000-0000-0000-000000000001', '{0,1,2,3,4,5,6}', '18:30', '24:00', 1600);

-- book_slot keeps its rules through the shared check.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000002', test_helpers.at(4, '08:00')) $$,
  'P0001', 'too_many_bookings', 'book_slot still applies the limit');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000002', test_helpers.at(15, '08:00')) $$,
  'P0001', 'outside_window', 'and the booking window');
select lives_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000002', test_helpers.at(4, '08:00')) $$,
  'and books a free slot');
reset role;

-- The engine does not offer a slot beyond the booking window (14 days).
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000036', '00000000-0000-0000-0000-0000000000a5', 15,
  '08:00', '23:00');
select is(
  private.offer_freed('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
    tstzrange(test_helpers.at(15, '08:00'), test_helpers.at(15, '23:00'))),
  0, 'the engine offers nothing beyond the booking window');
select is((select count(*)::int from public.slot_holds where wait_id = 'e0000000-0000-0000-0000-000000000036'), 0,
  'so nobody gets a hold they could not book');

-- A failing offer never makes the write that frees a court fail.
create or replace function private.offer_freed(p_club_id uuid, p_court_id uuid, p_period tstzrange,
  p_now timestamptz default now())
returns integer
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'boom';
end;
$$;
insert into public.court_occupancy (id, club_id, court_id, kind, period, note) values
  ('ee000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000002', 'block', test_helpers.slot(5, '08:00', 90), 'Clase');
set constraints all immediate;
set constraints all deferred;
delete from public.court_occupancy where id = 'ee000000-0000-0000-0000-000000000031';
select lives_ok($$ set constraints all immediate $$, 'freeing a court commits even when the offer fails');
set constraints all deferred;

-- The outbox skips the mail of a hold that is no longer active, and stops after three attempts.
insert into public.notifications (id, club_id, user_id, kind, data, link) values
  ('ff000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 'slot_held',
   jsonb_build_object('hold_id', 'e1000000-0000-0000-0000-000000000031'), '/');
update public.slot_holds set status = 'declined', ended_at = now() where id = 'e1000000-0000-0000-0000-000000000031';
insert into public.notifications (id, club_id, user_id, kind, data, link, email_attempts) values
  ('ff000000-0000-0000-0000-000000000032', 'a0000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000b1', 'slot_free_now', '{}', '/reservar', 3);
delete from public.notifications where id not in ('ff000000-0000-0000-0000-000000000031', 'ff000000-0000-0000-0000-000000000032');

set local role service_role;
select is((select count(*)::int from public.claim_notification_emails(20)), 0,
  'nothing to mail: one hold was declined and the other aviso ran out of attempts');
reset role;
select is((select email_status::text from public.notifications where id = 'ff000000-0000-0000-0000-000000000031'),
  'skipped', 'the mail of a declined hold is skipped');
select is((select email_status::text from public.notifications where id = 'ff000000-0000-0000-0000-000000000032'),
  'pending', 'a pending mail with three attempts is left alone');

select * from finish();
rollback;
