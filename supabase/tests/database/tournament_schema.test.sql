begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/tournament.psql
select plan(22);

select has_table('public', 'tournaments', 'tournaments exists');
select has_table('public', 'tournament_entries', 'tournament_entries exists');
select has_table('public', 'tournament_games', 'tournament_games exists');

-- Day 3, 18:00 to 20:20, on Cancha 1 and 2: Ana and three guests, and one game with the four of them.
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000001', test_helpers.slot(3, '18:00', 140));
call test_helpers.add_entry('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1');
call test_helpers.add_guests('e3000000-0000-0000-0000-000000000001', 3);
insert into public.tournament_games (club_id, tournament_id, round, wave, court_id, starts_at, a1_entry_id,
                                     a2_entry_id, b1_entry_id, b2_entry_id)
select 'a0000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 1, 1,
       'c0000000-0000-0000-0000-000000000001', test_helpers.at(3, '18:00'), ids[1], ids[2], ids[3], ids[4]
from (select array_agg(id) as ids from public.tournament_entries
      where tournament_id = 'e3000000-0000-0000-0000-000000000001') as e;

select throws_ok(
  $$ update public.tournaments set max_players = 10 where id = 'e3000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a tournament is for 8, 12 or 16 players');
select throws_ok(
  $$ update public.tournaments set rounds = 8 where id = 'e3000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'at most one round less than players');
select throws_ok(
  $$ update public.tournaments
        set court_ids = array['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
                              'c0000000-0000-0000-0000-000000000001']::uuid[]
      where id = 'e3000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'eight players use at most two courts');
select throws_ok(
  $$ insert into public.tournament_entries (club_id, tournament_id, player_id)
     values ('a0000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001',
             '00000000-0000-0000-0000-0000000000a1') $$,
  '23505', null, 'a player signs up once');

update public.tournament_entries set removed_at = now()
 where tournament_id = 'e3000000-0000-0000-0000-000000000001'
   and player_id = '00000000-0000-0000-0000-0000000000a1';
select lives_ok(
  $$ insert into public.tournament_entries (club_id, tournament_id, player_id)
     values ('a0000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001',
             '00000000-0000-0000-0000-0000000000a1') $$,
  'after leaving, she can sign up again');
select throws_ok(
  $$ insert into public.tournament_entries (club_id, tournament_id, player_id, guest_name)
     values ('a0000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001',
             '00000000-0000-0000-0000-0000000000b1', 'Bruno') $$,
  '23514', null, 'an entry is a member or a guest name');
select throws_ok(
  $$ update public.tournament_games set a2_entry_id = a1_entry_id $$,
  '23514', null, 'four different players per game');
select throws_ok(
  $$ insert into public.payments (club_id, method, amount, status)
     values ('a0000000-0000-0000-0000-000000000001', 'cash', 400, 'confirmed') $$,
  '23514', null, 'a payment is for a booking or an entry');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, tournament_id)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'block',
             test_helpers.slot(9, '10:00', 60), 'e3000000-0000-0000-0000-000000000001') $$,
  '23514', null, 'only tournament occupancies point at a tournament');

-- Ana, member
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select is((select count(*)::int from public.tournaments), 1, 'members read the tournaments of their club');
select is((select count(*)::int from public.tournament_entries), 5,
  'members read every entry, also the ones that left');
select is((select count(*)::int from public.tournament_games), 1, 'members read the games');
select lives_ok($$ select tournament_id from public.court_occupancy $$,
  'members read which tournament holds a court');
select throws_ok(
  $$ insert into public.tournaments (club_id, name, period, court_ids, max_players, category_min, category_max,
                                     match_type, price)
     values ('a0000000-0000-0000-0000-000000000001', 'Mío', test_helpers.slot(8, '10:00', 140),
             array['c0000000-0000-0000-0000-000000000001']::uuid[], 8, 1, 8, 'mixed', 0) $$,
  '42501', null, 'players cannot write tournaments directly');
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000002', test_helpers.at(3, '18:30')) $$,
  'P0001', 'busy_at_that_time', 'a player in a tournament cannot book at that time');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select is((select count(*)::int from public.tournaments), 0, 'non-members read no tournaments');

-- Dani, admin
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select throws_ok(
  $$ delete from public.courts where id = 'c0000000-0000-0000-0000-000000000001' $$,
  'P0001', 'court_has_history', 'a court a tournament uses cannot be deleted');

-- Anonymous visitor
set local role anon;
select throws_ok($$ select * from public.tournaments $$, '42501', null, 'anon cannot read tournaments');
select throws_ok($$ select * from public.tournament_games $$, '42501', null, 'anon cannot read games');

select * from finish();
rollback;
