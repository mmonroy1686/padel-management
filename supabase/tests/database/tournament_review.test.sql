begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/tournament.psql
select plan(14);

-- A second club with its own receptionist Eva and court.
insert into public.clubs (id, slug, name) values ('a0000000-0000-0000-0000-000000000002', 'test-club-b', 'Club B');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'eva@test.local');
insert into public.club_members (club_id, user_id, role) values
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e1', 'reception');
insert into public.courts (id, club_id, name, sort_order) values
  ('cb000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Cancha B', 1);

-- T1, day 3: Ana signed up and reported a transfer.
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000001', test_helpers.slot(3, '18:00', 140));
-- Fixed ids: under RLS, Eva cannot look them up.
insert into public.tournament_entries (id, club_id, tournament_id, player_id) values
  ('ee000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1');
insert into public.payments (id, club_id, tournament_entry_id, method, amount, status, payer_id) values
  ('ea000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'ee000000-0000-0000-0000-000000000001', 'transfer', 400, 'reported', '00000000-0000-0000-0000-0000000000a1');
-- T3 started an hour ago and nobody closed its registration; Gabi is in it.
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000003',
  tstzrange(now() - interval '1 hour', now() + interval '1 hour'));
call test_helpers.add_entry('e3000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a2');
-- T4, day 6, cancelled: Bruno was in it.
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000004', test_helpers.slot(6, '18:00', 140),
  p_status => 'cancelled');
call test_helpers.add_entry('e3000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000b1');

set local role authenticated;

-- Carla, reception of club T: a 16-player americano that starts with 8.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select public.create_tournament('Grande', test_helpers.at(8, '10:00'),
  array['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002']::uuid[],
  16, 24, 20, 7, 1, 8, 'mixed', 400);
select public.add_tournament_guest((select id from public.tournaments where name = 'Grande'), 'Invitado ' || n)
from generate_series(1, 8) as n;
select public.close_tournament_registration((select id from public.tournaments where name = 'Grande'));
select public.start_tournament((select id from public.tournaments where name = 'Grande'));

select is((select ends_at - starts_at from public.tournaments where name = 'Grande'), interval '140 minutes',
  'starting with 8 of 16 shortens the tournament to what 8 players need');
select is(
  (select count(*)::int from public.court_occupancy o join public.tournaments t on t.id = o.tournament_id
    where t.name = 'Grande' and o.period = t.period),
  2, 'and its courts are free again after that');
select throws_ok(
  $$ select public.create_tournament('Mezcla', test_helpers.at(9, '10:00'),
       array['c0000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001']::uuid[],
       8, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  'P0001', 'invalid_input', 'a tournament uses courts of one club only');

select g.id as game_id from public.tournament_games g join public.tournaments t on t.id = g.tournament_id
 where t.name = 'Grande' limit 1 \gset

-- Eva, reception of club B, on club T's rows.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  $$ select public.cancel_tournament('e3000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'staff of another club cannot cancel it');
select throws_ok(
  $$ select public.remove_tournament_entry('ee000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'nor take someone out');
select throws_ok(
  $$ select public.record_tournament_cash('ee000000-0000-0000-0000-000000000001', 400) $$,
  'P0001', 'forbidden', 'nor charge cash');
select throws_ok(
  $$ select public.confirm_payment('ea000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'nor confirm a transfer');
select throws_ok(
  format('select public.record_tournament_score(%L, 12)', :'game_id'),
  'P0001', 'forbidden', 'nor record a result');
select throws_ok(
  $$ select public.create_tournament('Ajeno', test_helpers.at(9, '10:00'),
       array['cb000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001']::uuid[],
       8, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  'P0001', 'invalid_input', 'nor block club T courts from club B');

-- Gabi: T3 already started.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select throws_ok(
  $$ select public.leave_tournament('e3000000-0000-0000-0000-000000000003') $$,
  'P0001', 'tournament_closed', 'nobody leaves a tournament that already started');

-- Ana: busy while signed up, free once she leaves.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000002', test_helpers.at(3, '18:30')) $$,
  'P0001', 'busy_at_that_time', 'signed up, she cannot book at that time');
select lives_ok($$ select public.leave_tournament('e3000000-0000-0000-0000-000000000001') $$, 'she leaves');
select lives_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000002', test_helpers.at(3, '18:30')) $$,
  'after leaving she can book at that time');

-- Bruno: a cancelled tournament keeps nobody busy.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select lives_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000002', test_helpers.at(6, '18:30')) $$,
  'a cancelled tournament does not keep him busy');

select * from finish();
rollback;
