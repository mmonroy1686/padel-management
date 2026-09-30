begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(15);

select has_table('public', 'open_matches', 'open_matches exists');
select has_table('public', 'match_slots', 'match_slots exists');

-- A confirmed match at day 3 20:00 on court 1: Ana, Bruno, Hugo and Iván.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '20:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4']::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001');

select throws_ok(
  $$ insert into public.match_slots (match_id, club_id, position, team, side)
     values ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 5, 'A', 'drive') $$,
  '23514', null, 'a match has four spots');
select throws_ok(
  $$ update public.match_slots set side = 'both'
     where match_id = 'e1000000-0000-0000-0000-000000000001' and position = 1 $$,
  '23514', null, 'every spot is drive or backhand');
select throws_ok(
  $$ update public.match_slots set player_id = '00000000-0000-0000-0000-0000000000a1'
     where match_id = 'e1000000-0000-0000-0000-000000000001' and position = 2 $$,
  '23505', null, 'a player takes one spot per match');
select throws_ok(
  $$ update public.bookings set player_id = '00000000-0000-0000-0000-0000000000a1'
     where match_id = 'e1000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a match booking has no other holder');
select throws_ok(
  $$ update public.open_matches set category_min = 7, category_max = 3
     where id = 'e1000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'the category range goes from low to high');

-- Each player pays his share (inserted as postgres).
insert into public.payments (club_id, booking_id, method, amount, status, payer_id, confirmed_at)
select 'a0000000-0000-0000-0000-000000000001', booking_id, 'cash', 400, 'confirmed', payer, now()
from public.open_matches,
     unnest(array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1']::uuid[]) as payer
where id = 'e1000000-0000-0000-0000-000000000001';

-- Ana, in the match
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select is((select count(*)::int from public.match_slots where match_id = 'e1000000-0000-0000-0000-000000000001'), 4,
  'members read the spots of a match');
select is((select count(*)::int from public.bookings where match_id = 'e1000000-0000-0000-0000-000000000001'), 1,
  'a player of the match reads its booking');
select is((select count(*)::int from public.payments), 1, 'a player of the match reads only her own payments');

-- Juli, member but not in the match
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';

select is((select count(*)::int from public.open_matches), 1, 'members read the matches of their club');
select is((select count(*)::int from public.bookings where match_id = 'e1000000-0000-0000-0000-000000000001'), 0,
  'members outside the match do not read its booking');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select is((select count(*)::int from public.open_matches), 0, 'non-members read no matches');

-- Anonymous visitor
set local role anon;
select throws_ok($$ select * from public.open_matches $$, '42501', null, 'anon cannot read matches');
select throws_ok($$ select * from public.match_slots $$, '42501', null, 'anon cannot read match spots');

select * from finish();
rollback;
