begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(25);

-- Who got what, about one page of the app.
create function pg_temp.notices(p_link text)
returns table (kind text, user_id uuid, actor text)
language sql
as $$
  select n.kind::text, n.user_id, n.data ->> 'actor' from public.notifications n
  where n.link = p_link order by n.created_at, n.kind::text, n.user_id;
$$;

set local role authenticated;

-- Ana books: her receipt.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
create temp table ana_booking on commit drop as
  select id from public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(2, '18:30'));
grant select on ana_booking to authenticated;
reset role;
select results_eq(
  $$ select * from pg_temp.notices('/turno/' || (select id from ana_booking)) $$,
  $$ values ('booking_confirmed', '00000000-0000-0000-0000-0000000000a1'::uuid, 'self') $$,
  'whoever books gets a receipt');
select is((select data ->> 'court_name' from public.notifications where link = '/turno/' || (select id from ana_booking)),
  'Cancha 1', 'it says the court');

-- Carla (reception) books for Bruno, then adds Bruno to Ana's booking and charges his share in cash.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
create temp table bruno_booking on commit drop as
  select id from public.staff_book('c0000000-0000-0000-0000-000000000002', test_helpers.at(2, '11:00'),
                                   '00000000-0000-0000-0000-0000000000b1');
select lives_ok(
  $$ select public.set_booking_players((select id from ana_booking),
       '[{"position": 2, "player_id": "00000000-0000-0000-0000-0000000000b1"}]') $$,
  'reception adds Bruno to Ana''s booking');
select lives_ok($$ select public.charge_booking_share((select id from ana_booking), 2, 'cash') $$, 'and charges his share');
reset role;
select results_eq(
  $$ select * from pg_temp.notices('/turno/' || (select id from bruno_booking)) $$,
  $$ values ('booking_confirmed', '00000000-0000-0000-0000-0000000000b1'::uuid, 'club') $$,
  'a booking reception makes says the club made it');
select results_eq(
  $$ select kind, user_id, actor from pg_temp.notices('/turno/' || (select id from ana_booking)) where user_id = '00000000-0000-0000-0000-0000000000b1' $$,
  $$ values ('booking_confirmed', '00000000-0000-0000-0000-0000000000b1'::uuid, 'club'),
            ('payment_confirmed', '00000000-0000-0000-0000-0000000000b1'::uuid, null) $$,
  'the added player hears he is in, and that he paid');
select results_eq(
  $$ select (data ->> 'amount')::int, data ->> 'method' from public.notifications
     where kind = 'payment_confirmed' and link = '/turno/' || (select id from ana_booking) $$,
  $$ values (400, 'cash') $$,
  'the payment aviso says how much and how');

-- Ana reports her share by transfer; Carla rejects it.
insert into storage.objects (bucket_id, name) values ('receipts', '00000000-0000-0000-0000-0000000000a1/r.png');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok($$ select public.report_transfer((select id from ana_booking), '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'Ana reports her transfer');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.reject_payment((select id from public.payments where booking_id = (select id from ana_booking) and status = 'reported'), 'No llegó') $$,
  'reception rejects it');
reset role;
select results_eq(
  $$ select user_id, data ->> 'reason' from public.notifications where kind = 'payment_rejected' and club_id = 'a0000000-0000-0000-0000-000000000001' $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, 'No llegó') $$,
  'whoever reported it hears why');
select is((select count(*)::int from public.notifications where kind = 'payment_confirmed' and user_id = '00000000-0000-0000-0000-0000000000a1'),
  0, 'a reported transfer is not a payment yet');

-- Reception takes Bruno out of his own booking's partner list: covered below with Ana; here Ana cancels hers.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok($$ select public.cancel_my_booking((select id from ana_booking)) $$, 'Ana cancels');
reset role;
select results_eq(
  $$ select user_id, data ->> 'actor', data ->> 'actor_name' from public.notifications
     where kind = 'booking_cancelled' and link = '/turno/' || (select id from ana_booking) order by user_id $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, 'self', null::text),
            ('00000000-0000-0000-0000-0000000000b1'::uuid, 'player', 'Ana') $$,
  'everyone in the booking hears it, with who cancelled');

-- Reception adds Ana to Bruno's booking and then takes her out.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.set_booking_players((select id from bruno_booking), '[{"position": 2, "player_id": "00000000-0000-0000-0000-0000000000a1"}]') $$,
  'Ana is added');
select lives_ok($$ select public.set_booking_players((select id from bruno_booking), '[]') $$, 'and taken out');
reset role;
select results_eq(
  $$ select kind, actor from pg_temp.notices('/turno/' || (select id from bruno_booking)) where user_id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('booking_confirmed', 'club'), ('booking_removed', 'club') $$,
  'she hears both');

-- A weekly booking: one aviso when it starts and one when it ends, none per week.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
create temp table series on commit drop as
  select id from public.create_series('c0000000-0000-0000-0000-000000000002',
    extract(dow from test_helpers.today() + 3)::int, '20:00', test_helpers.today() + 3, null,
    '00000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select public.end_series((select id from public.recurring_series where player_id = '00000000-0000-0000-0000-0000000000a1'), test_helpers.today() + 9) $$, 'the series ends');
reset role;
select results_eq(
  $$ select data ->> 'status' from public.notifications where kind = 'booking_series' and club_id = 'a0000000-0000-0000-0000-000000000001' order by created_at, data ->> 'status' $$,
  $$ values ('created'), ('ended') $$,
  'the series: started and ended');
select is(
  (select count(*)::int from public.notifications n join public.bookings b on n.link = '/turno/' || b.id
   where b.series_id is not null and b.club_id = 'a0000000-0000-0000-0000-000000000001'),
  0, 'no aviso for each week''s booking');

-- Reminders: the club reminds 48 h before. Bruno turns them off.
update public.clubs set reminder_hours = 48 where id = 'a0000000-0000-0000-0000-000000000001';
call test_helpers.make_booking('b7000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(1, '08:00', 90), '00000000-0000-0000-0000-0000000000a1');
call test_helpers.make_booking('b7000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(1, '08:00', 90), '00000000-0000-0000-0000-0000000000b1');
update public.bookings set created_at = now() - interval '3 days'
 where id in ('b7000000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-000000000002');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select lives_ok($$ select public.set_booking_reminders(false) $$, 'Bruno turns reminders off');
reset role;
select is(private.send_booking_reminders(), 1, 'one reminder: Ana''s (Bruno turned them off)');
select is(private.send_booking_reminders(), 0, 'and never twice');
select is(
  (select (data ->> 'hours')::int from public.notifications where kind = 'booking_reminder'
   and link = '/turno/b7000000-0000-0000-0000-000000000001'),
  48, 'it says how far ahead');

-- A match: confirmed tells the four; someone leaving tells the rest; the club cancelling tells who is left.
call test_helpers.make_match('e7000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '20:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4']::uuid[]);
call test_helpers.hold_court('e7000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select public.leave_match('e7000000-0000-0000-0000-000000000001');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select public.cancel_match('e7000000-0000-0000-0000-000000000001', 'Lluvia');
reset role;
select results_eq(
  $$ select kind, count(*)::int from pg_temp.notices('/partidos/e7000000-0000-0000-0000-000000000001') group by kind order by kind $$,
  $$ values ('match_cancelled', 3), ('match_confirmed', 4), ('match_left', 3) $$,
  'four hear it is on, three hear Bruno left, the three left hear it was cancelled');
select is(
  (select count(*)::int from public.notifications n join public.open_matches m on n.link = '/turno/' || m.booking_id
   where m.id = 'e7000000-0000-0000-0000-000000000001'),
  0, 'the match''s booking does not repeat it');

select finish();
rollback;
