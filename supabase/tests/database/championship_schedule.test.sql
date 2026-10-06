begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(19);

-- C1 was drawn. 'Libre' (90 minutes): Ana and Pedro (E1), Bruno and Lucía (E2), Gabi and Marta (E3) and Hugo and
-- Nico (E4) in Zona A, with its six matches (M1 E1-E2, M2 E3-E4, M3 E1-E3, M4 E2-E4, M5 E1-E4, M6 E2-E3) and the
-- final F between its 1st and its 2nd. '5ta': Ana again, with Raúl (E5), against Iván and Olga (E6) in M7. Day 10,
-- 08:00 to 23:00, both courts. Bruno and Lucía cannot play the first block of the day.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001', 'drawn');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '23:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000001',
  '5ta');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-000000000f04');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f06');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000006', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a4', 'c4a00000-0000-0000-0000-000000000f05');
call test_helpers.make_group('c5a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'Zona A', array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
                  'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[]);
call test_helpers.make_group('c5a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000002',
  'Zona A', array['c3a00000-0000-0000-0000-000000000005', 'c3a00000-0000-0000-0000-000000000006']::uuid[]);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000003',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000002', 'c3a00000-0000-0000-0000-000000000004',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000004',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000006', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000002', 'c3a00000-0000-0000-0000-000000000003',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000007', 'c2a00000-0000-0000-0000-000000000002',
  'c3a00000-0000-0000-0000-000000000005', 'c3a00000-0000-0000-0000-000000000006',
  p_group_id => 'c5a00000-0000-0000-0000-000000000002');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000008', 'c2a00000-0000-0000-0000-000000000001',
  null, null, p_round => 1, p_position => 1,
  p_source_a => jsonb_build_object('group', 'c5a00000-0000-0000-0000-000000000001', 'place', 1),
  p_source_b => jsonb_build_object('group', 'c5a00000-0000-0000-0000-000000000001', 'place', 2));
insert into public.entry_unavailability (club_id, entry_id, on_date, from_time, to_time)
select 'a0000000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002', b.on_date, b.from_time,
       b.to_time
from private.championship_blocks('c1a00000-0000-0000-0000-000000000001') as b
order by b.block_key
limit 1;

-- A match on court 1 or 2 at a time of day 10 (or of another day), as save_championship_schedule takes it.
create function test_helpers.slot_of(p_match_id uuid, p_court integer, p_time time, p_days integer default 10)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object('match_id', p_match_id,
    'court_id', ('c0000000-0000-0000-0000-00000000000' || p_court)::uuid,
    'starts_at', test_helpers.at(p_days, p_time));
$$;

-- A schedule that keeps every rule: 08:00 M2 and M7, 11:00 M3 and M4, 14:00 M5 and M6, 17:00 M1, 20:00 the final.
create function test_helpers.good_schedule()
returns jsonb
language sql
stable
as $$
  select jsonb_build_array(
    test_helpers.slot_of('c6a00000-0000-0000-0000-000000000002', 1, '08:00'),
    test_helpers.slot_of('c6a00000-0000-0000-0000-000000000007', 2, '08:00'),
    test_helpers.slot_of('c6a00000-0000-0000-0000-000000000003', 1, '11:00'),
    test_helpers.slot_of('c6a00000-0000-0000-0000-000000000004', 2, '11:00'),
    test_helpers.slot_of('c6a00000-0000-0000-0000-000000000005', 1, '14:00'),
    test_helpers.slot_of('c6a00000-0000-0000-0000-000000000006', 2, '14:00'),
    test_helpers.slot_of('c6a00000-0000-0000-0000-000000000001', 1, '17:00'),
    test_helpers.slot_of('c6a00000-0000-0000-0000-000000000008', 1, '20:00'));
$$;

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  format('select public.save_championship_schedule(%L, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.slot_of('c6a00000-0000-0000-0000-000000000001', 1, '08:00'))),
  'P0001', 'unavailable_pair', 'no match when a pair said it cannot play');
select throws_ok(
  format('select public.save_championship_schedule(%L, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.slot_of('c6a00000-0000-0000-0000-000000000003', 1, '11:00'),
                           test_helpers.slot_of('c6a00000-0000-0000-0000-000000000005', 2, '11:00'))),
  'P0001', 'pair_busy', 'a pair never plays two matches at once');
select throws_ok(
  format('select public.save_championship_schedule(%L, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.slot_of('c6a00000-0000-0000-0000-000000000003', 1, '11:00'),
                           test_helpers.slot_of('c6a00000-0000-0000-0000-000000000005', 1, '12:30'))),
  'P0001', 'pair_busy', 'and rests 45 minutes between matches');
select throws_ok(
  format('select public.save_championship_schedule(%L, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.slot_of('c6a00000-0000-0000-0000-000000000003', 1, '11:00'),
                           test_helpers.slot_of('c6a00000-0000-0000-0000-000000000007', 2, '11:00'))),
  'P0001', 'pair_busy', 'a player of two categories is never in two places at once');
select throws_ok(
  format('select public.save_championship_schedule(%L, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.slot_of('c6a00000-0000-0000-0000-000000000002', 1, '08:00'),
                           test_helpers.slot_of('c6a00000-0000-0000-0000-000000000007', 1, '08:00'))),
  'P0001', 'courts_busy', 'one court, one match');
select throws_ok(
  format('select public.save_championship_schedule(%L, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.slot_of('c6a00000-0000-0000-0000-000000000002', 1, '08:00', 11))),
  'P0001', 'outside_play_days', 'every match inside a day of play');
select throws_ok(
  format('select public.save_championship_schedule(%L, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_set(test_helpers.good_schedule(), '{7}',
                   test_helpers.slot_of('c6a00000-0000-0000-0000-000000000008', 2, '17:00'))),
  'P0001', 'too_early', 'the final starts after the group ends, plus the rest');
select lives_ok(
  format('select public.save_championship_schedule(%L, %L)', 'c1a00000-0000-0000-0000-000000000001',
         test_helpers.good_schedule()),
  'a schedule that keeps every rule is saved');
select is((select count(*)::int from public.championship_matches
           where championship_id = 'c1a00000-0000-0000-0000-000000000001' and court_id is not null), 8,
  'every match has a court and a start');
select is((select ends_at - starts_at from public.championship_matches
           where id = 'c6a00000-0000-0000-0000-000000000001'), interval '90 minutes',
  'and lasts the minutes of its category');
select lives_ok(
  $$ select public.set_match_pinned('c6a00000-0000-0000-0000-000000000007', true) $$,
  'the organizer pins a match');
select lives_ok(
  $$ select public.save_championship_schedule('c1a00000-0000-0000-0000-000000000001', '[]') $$,
  'scheduling again places the rest from scratch');
select ok(
  (select court_id is not null from public.championship_matches where id = 'c6a00000-0000-0000-0000-000000000007')
  and (select court_id is null from public.championship_matches where id = 'c6a00000-0000-0000-0000-000000000001'),
  'and leaves the pinned one where it was');
select lives_ok(
  format('select public.set_match_slot(%L, %L, %L)', 'c6a00000-0000-0000-0000-000000000001',
         'c0000000-0000-0000-0000-000000000001', test_helpers.at(10, '17:00')),
  'the organizer moves a match by hand');
select ok((select pinned from public.championship_matches where id = 'c6a00000-0000-0000-0000-000000000001'),
  'a match moved by hand stays put');
select throws_ok(
  format('select public.set_match_slot(%L, %L, %L)', 'c6a00000-0000-0000-0000-000000000002',
         'c0000000-0000-0000-0000-000000000002', test_helpers.at(10, '08:00')),
  'P0001', 'courts_busy', 'not onto a court that is taken');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  format('select public.set_match_slot(%L, %L, %L)', 'c6a00000-0000-0000-0000-000000000002',
         'c0000000-0000-0000-0000-000000000001', test_helpers.at(10, '08:00')),
  'P0001', 'forbidden', 'staff of another club cannot move a match');

-- Ana, a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.save_championship_schedule('c1a00000-0000-0000-0000-000000000001', '[]') $$,
  'P0001', 'forbidden', 'nor can a member schedule');

-- M2 is being played.
reset role;
update public.championship_matches set status = 'playing' where id = 'c6a00000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  format('select public.set_match_slot(%L, %L, %L)', 'c6a00000-0000-0000-0000-000000000002',
         'c0000000-0000-0000-0000-000000000001', test_helpers.at(10, '11:00')),
  'P0001', 'invalid_state', 'a match being played does not move');

select * from finish();
rollback;
