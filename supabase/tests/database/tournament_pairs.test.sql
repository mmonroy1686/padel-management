begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/tournament.psql
select plan(24);

create function test_helpers.pair_notices(p_user_id uuid, p_event text)
returns integer
language sql
stable
as $$
  select count(*)::integer from public.notifications
  where user_id = p_user_id and kind = 'tournament_pair' and data ->> 'event' = p_event;
$$;

create function test_helpers.pair_of(p_entry_id uuid)
returns uuid
language sql
stable
as $$
  select pair_id from public.tournament_entries where id = p_entry_id;
$$;

-- P1: fixed pairs, registration. R1: rotating. P2: fixed pairs, closed, 8 guests without partners. P3: fixed pairs,
-- closed, 8 guests in 4 pairs.
call test_helpers.make_tournament('e4000000-0000-0000-0000-000000000001', test_helpers.slot(3, '18:00', 140));
call test_helpers.make_tournament('e4000000-0000-0000-0000-000000000002', test_helpers.slot(4, '18:00', 140));
call test_helpers.make_tournament('e4000000-0000-0000-0000-000000000003', test_helpers.slot(5, '10:00', 140),
  p_status => 'closed');
call test_helpers.add_guests('e4000000-0000-0000-0000-000000000003', 8);
call test_helpers.make_tournament('e4000000-0000-0000-0000-000000000004', test_helpers.slot(6, '10:00', 140),
  p_status => 'closed');
call test_helpers.add_guests('e4000000-0000-0000-0000-000000000004', 8);
update public.tournaments set format = 'fixed_pairs', rounds = 3
 where id in ('e4000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000003',
              'e4000000-0000-0000-0000-000000000004');
-- P3: Invitado 1 + 2, 3 + 4, 5 + 6, 7 + 8.
update public.tournament_entries e
   set pair_id = ('f4000000-0000-0000-0000-00000000000' || ceil(substring(e.guest_name from 10)::int / 2.0)::int)::uuid
 where e.tournament_id = 'e4000000-0000-0000-0000-000000000004';

set local role authenticated;

-- Ana signs up with Bruno.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.join_tournament_pair('e4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1') $$,
  'a player signs up with her partner');
select throws_ok(
  $$ select public.join_tournament_pair('e4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3') $$,
  'P0001', 'already_in_tournament', 'once per tournament');
select throws_ok(
  $$ select public.join_tournament_pair('e4000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1') $$,
  'P0001', 'invalid_input', 'only in a fixed-pairs americano');
select throws_ok(
  $$ select public.join_tournament_pair('e4000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000f1') $$,
  'P0001', 'partner_mismatch', 'the partner has to be a member of the club');

reset role;
select is(
  test_helpers.pair_of(test_helpers.entry_of('e4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1')),
  test_helpers.pair_of(test_helpers.entry_of('e4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1')),
  'both entries share the pair');
select isnt(
  test_helpers.pair_of(test_helpers.entry_of('e4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1')),
  null, 'and it is set');
select is(test_helpers.pair_notices('00000000-0000-0000-0000-0000000000b1', 'added'), 1, 'Bruno gets an aviso');
select is(test_helpers.pair_notices('00000000-0000-0000-0000-0000000000a1', 'added'), 0, 'Ana does not');

-- Bruno, already in, cannot be signed up again by Hugo.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';
select throws_ok(
  $$ select public.join_tournament_pair('e4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1') $$,
  'P0001', 'partner_already_in', 'a partner already in');

-- Ana leaves: Bruno stays, looking for a partner.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok($$ select public.leave_tournament('e4000000-0000-0000-0000-000000000001') $$, 'Ana leaves');
reset role;
select is(
  test_helpers.pair_of(test_helpers.entry_of('e4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1')),
  null, 'Bruno stays without a partner');
select is(test_helpers.pair_notices('00000000-0000-0000-0000-0000000000b1', 'left'), 1, 'and gets an aviso');

-- Carla, reception: a guest as Bruno's partner, split them, pair them again.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.add_tournament_guest('e4000000-0000-0000-0000-000000000001', 'Pedro',
       test_helpers.entry_of('e4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1')) $$,
  'reception adds a guest as his partner');
reset role;
select is(
  (select pair_id from public.tournament_entries where guest_name = 'Pedro'),
  test_helpers.pair_of(test_helpers.entry_of('e4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1')),
  'they are a pair');
select is(test_helpers.pair_notices('00000000-0000-0000-0000-0000000000b1', 'paired'), 1, 'Bruno hears about it');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.split_tournament_pair(
       test_helpers.entry_of('e4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1')) $$,
  'reception splits the pair');
select lives_ok(
  $$ select public.pair_tournament_entries(
       test_helpers.entry_of('e4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1'),
       (select id from public.tournament_entries where guest_name = 'Pedro')) $$,
  'and pairs them again');
select throws_ok(
  $$ select public.pair_tournament_entries(
       test_helpers.entry_of('e4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1'),
       (select id from public.tournament_entries where guest_name = 'Pedro')) $$,
  'P0001', 'already_paired', 'not twice');

-- The fixture.
select throws_ok($$ select public.start_tournament('e4000000-0000-0000-0000-000000000003') $$,
  'P0001', 'unpaired_players', 'not with players without a partner');
select lives_ok($$ select public.start_tournament('e4000000-0000-0000-0000-000000000004') $$,
  'with 4 pairs it starts');

reset role;
select results_eq(
  $$ select rounds::int, (select count(*)::int from public.tournament_games where tournament_id = t.id)
     from public.tournaments t where id = 'e4000000-0000-0000-0000-000000000004' $$,
  $$ values (3, 6) $$,
  '3 rounds of 2 games');
select is(
  (select count(*)::int from public.tournament_games g
   where g.tournament_id = 'e4000000-0000-0000-0000-000000000004'
     and (test_helpers.pair_of(g.a1_entry_id) <> test_helpers.pair_of(g.a2_entry_id)
          or test_helpers.pair_of(g.b1_entry_id) <> test_helpers.pair_of(g.b2_entry_id))),
  0, 'every team is a pair');
select is(
  (select count(distinct (least(test_helpers.pair_of(a1_entry_id), test_helpers.pair_of(b1_entry_id)),
                          greatest(test_helpers.pair_of(a1_entry_id), test_helpers.pair_of(b1_entry_id))))::int
   from public.tournament_games where tournament_id = 'e4000000-0000-0000-0000-000000000004'),
  6, 'every pair meets every other once');

-- Creating one: rounds up to pairs − 1.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select throws_ok(
  $$ select public.create_tournament('Parejas', test_helpers.at(9, '10:00'), array['c0000000-0000-0000-0000-000000000001']::uuid[],
       8, 24, 20, 7, 1, 8, 'mixed', 400, 'fixed_pairs') $$,
  'P0001', 'invalid_input', '4 pairs play at most 3 rounds');

select finish();
rollback;
