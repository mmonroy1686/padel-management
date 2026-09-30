begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(13);

-- F: forming, day 3 10:00, Ana and Bruno.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '10:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', null, null]::uuid[]);
-- C: confirmed, day 3 20:00 on court 1: Ana, Bruno, Hugo, Iván. Bruno reported a transfer, Hugo paid cash.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '20:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4']::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001');
insert into public.payments (club_id, booking_id, method, amount, status, payer_id)
select club_id, booking_id, 'transfer', 400, 'reported', '00000000-0000-0000-0000-0000000000b1'
from public.open_matches where id = 'e1000000-0000-0000-0000-000000000002';
insert into public.payments (club_id, booking_id, method, amount, status, payer_id, confirmed_at)
select club_id, booking_id, 'cash', 400, 'confirmed', '00000000-0000-0000-0000-0000000000a3', now()
from public.open_matches where id = 'e1000000-0000-0000-0000-000000000002';

set local role authenticated;

-- Bruno leaves F.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select lives_ok($$ select public.leave_match('e1000000-0000-0000-0000-000000000001') $$,
  'a player leaves a forming match whenever he wants');
select results_eq(
  $$ select m.status::text, (select count(*)::int from public.match_slots s where s.match_id = m.id and s.player_id is not null)
     from public.open_matches m where m.id = 'e1000000-0000-0000-0000-000000000001' $$,
  $$ values ('forming', 1) $$,
  'his spot is free again');

-- Ana, the last one, leaves F.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok($$ select public.leave_match('e1000000-0000-0000-0000-000000000001') $$, 'the last player leaves');
select results_eq(
  $$ select status::text, cancel_reason from public.open_matches where id = 'e1000000-0000-0000-0000-000000000001' $$,
  $$ values ('cancelled', 'empty') $$,
  'a match with nobody left is cancelled');
select throws_ok($$ select public.leave_match('e1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'only players of the match leave it');

-- Bruno leaves C, three days ahead (24 h notice).
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select lives_ok($$ select public.leave_match('e1000000-0000-0000-0000-000000000002') $$,
  'with enough notice a player leaves a confirmed match');

reset role;
select results_eq(
  $$ select m.status::text, b.status::text,
            (select count(*)::int from public.court_occupancy o where o.id = b.occupancy_id)
     from public.open_matches m join public.bookings b on b.id = m.booking_id
     where m.id = 'e1000000-0000-0000-0000-000000000002' $$,
  $$ values ('forming', 'confirmed', 1) $$,
  'the match looks for someone else and keeps its court');
select results_eq(
  $$ select status::text, rejection_reason from public.payments where payer_id = '00000000-0000-0000-0000-0000000000b1' $$,
  $$ values ('rejected', 'Salió del partido') $$,
  'his reported transfer is rejected');
set local role authenticated;

-- Hugo already paid: the club has to take him out and give the money back.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';
select throws_ok($$ select public.leave_match('e1000000-0000-0000-0000-000000000002') $$,
  'P0001', 'already_paid', 'a player who paid asks the club to leave');

-- Juli takes Bruno's spot: the match is confirmed again with the court it kept.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
select lives_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000002', 2) $$,
  'a new fourth player joins');
reset role;
select results_eq(
  $$ select m.status::text, (select count(*)::int from public.bookings b where b.match_id = m.id)
     from public.open_matches m where m.id = 'e1000000-0000-0000-0000-000000000002' $$,
  $$ values ('confirmed', 1) $$,
  'the match is confirmed again without a second booking');

-- The club now asks for 96 h of notice.
update public.clubs set cancellation_notice_hours = 96 where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a4", "role": "authenticated"}';
select throws_ok($$ select public.leave_match('e1000000-0000-0000-0000-000000000002') $$,
  'P0001', 'notice_period', 'inside the notice period nobody leaves a confirmed match');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select throws_ok($$ select public.leave_match('e1000000-0000-0000-0000-000000000002') $$,
  'P0001', 'forbidden', 'strangers cannot leave a match');

select * from finish();
rollback;
