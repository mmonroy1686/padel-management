begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(35);

-- C1 is published. 'Libre' (third set a super tie-break, no time limit): Ana and Pedro (E1), Bruno and Lucía
-- (E2), Gabi and Marta (E3) and Hugo and Nico (E4) in Zona A, its six matches (M1 E1-E2, M2 E3-E4, M3 E1-E3,
-- M4 E2-E4, M5 E1-E4, M6 E2-E3) and the final F between its 1st and its 2nd. 'Corto' (50 minutes of play): Iván
-- and Olga (E5) against Juli and Raúl (E6) in M7. 'Llave': Bruno and Olga (E7) against Gabi and Raúl (E8) in
-- the semifinal S1, whose winner meets Iván and Pedro (E9) in the final F3.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001', 'published');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000001',
  'Corto');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000003', 'c1a00000-0000-0000-0000-000000000001',
  'Llave');
update public.championship_categories set match_rules = match_rules || '{"time_limit_minutes": 50}'
 where id = 'c2a00000-0000-0000-0000-000000000002';
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-000000000f04');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a4', 'c4a00000-0000-0000-0000-000000000f05');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000006', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a5', 'c4a00000-0000-0000-0000-000000000f06');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000007', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f05');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000008', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f06');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000009', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a4', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_group('c5a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'Zona A', array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
                  'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[]);
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
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000008', 'c2a00000-0000-0000-0000-000000000001',
  null, null, p_round => 1, p_position => 1,
  p_source_a => jsonb_build_object('group', 'c5a00000-0000-0000-0000-000000000001', 'place', 1),
  p_source_b => jsonb_build_object('group', 'c5a00000-0000-0000-0000-000000000001', 'place', 2));
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000007', 'c2a00000-0000-0000-0000-000000000002',
  'c3a00000-0000-0000-0000-000000000005', 'c3a00000-0000-0000-0000-000000000006', p_round => 1, p_position => 1);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000009', 'c2a00000-0000-0000-0000-000000000003',
  'c3a00000-0000-0000-0000-000000000007', 'c3a00000-0000-0000-0000-000000000008', p_round => 2, p_position => 1);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-00000000000a', 'c2a00000-0000-0000-0000-000000000003',
  null, 'c3a00000-0000-0000-0000-000000000009', p_round => 1, p_position => 1,
  p_source_a => jsonb_build_object('winner_of', 'c6a00000-0000-0000-0000-000000000009'));

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000001', '[[6,5],[6,4]]') $$,
  'P0001', 'invalid_result', '6-5 is not a set: at 6-6 there is a tie-break');
select throws_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000001', '[[6,4],[3,6],[10,9]]') $$,
  'P0001', 'invalid_result', 'a super tie-break is won by 2');
select throws_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000001', '[[6,4],[3,6]]') $$,
  'P0001', 'invalid_result', 'without a time limit somebody wins 2 sets');
select throws_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000001', '[[6,4],[6,3],[6,2]]') $$,
  'P0001', 'invalid_result', 'no set after the match is won');
select lives_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000001', '[[6,4],[3,6],[10,8]]') $$,
  'reception records a result decided in the super tie-break');
select results_eq(
  $$ select status::text, winner_entry_id from public.championship_matches
     where id = 'c6a00000-0000-0000-0000-000000000001' $$,
  $$ values ('finished', 'c3a00000-0000-0000-0000-000000000001'::uuid) $$,
  'the match is finished with its winner');
select results_eq(
  $$ select set_number::int, games_a::int, games_b::int, super_tiebreak from public.championship_match_sets
     where match_id = 'c6a00000-0000-0000-0000-000000000001' order by set_number $$,
  $$ values (1, 6, 4, false), (2, 3, 6, false), (3, 10, 8, true) $$,
  'and its sets');
select is((select status::text from public.championships where id = 'c1a00000-0000-0000-0000-000000000001'),
  'in_progress', 'the first result starts the championship');
select lives_ok(
  $$ select public.record_walkover('c6a00000-0000-0000-0000-000000000007', 'c3a00000-0000-0000-0000-000000000006') $$,
  'a pair that did not show up loses by W.O.');
select results_eq(
  $$ select status::text, winner_entry_id, walkover_entry_id,
            (select count(*)::int from public.championship_match_sets where match_id = m.id)
     from public.championship_matches m where id = 'c6a00000-0000-0000-0000-000000000007' $$,
  $$ values ('walkover', 'c3a00000-0000-0000-0000-000000000005'::uuid, 'c3a00000-0000-0000-0000-000000000006'::uuid, 2) $$,
  'counted 6-0 6-0');
select lives_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000007', '[[6,4],[3,3]]') $$,
  'with a time limit the last set may stay as it was');
select throws_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000007', '[[4,4]]') $$,
  'P0001', 'invalid_result', 'but a draw is no result');
select lives_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000009', '[[6,1],[6,2]]') $$,
  'reception records a semifinal');
select is((select entry_a_id from public.championship_matches where id = 'c6a00000-0000-0000-0000-00000000000a'),
  'c3a00000-0000-0000-0000-000000000007'::uuid, 'its winner goes on to the final');
select lives_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000009', '[[1,6],[2,6]]') $$,
  'a result is corrected while the next match has not started');
select is((select entry_a_id from public.championship_matches where id = 'c6a00000-0000-0000-0000-00000000000a'),
  'c3a00000-0000-0000-0000-000000000008'::uuid, 'and the new winner takes the place');
select lives_ok(
  $$ select public.start_match('c6a00000-0000-0000-0000-00000000000a') $$,
  'the final is being played');
select throws_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000009', '[[6,1],[6,2]]') $$,
  'P0001', 'invalid_state', 'no correction once the next match started');
select throws_ok(
  $$ select public.start_match('c6a00000-0000-0000-0000-000000000008') $$,
  'P0001', 'invalid_state', 'a match does not start before its pairs are known');

-- M2 to M5 are played (Gabi and Marta, Ana and Pedro, Bruno and Lucía, Ana and Pedro win).
reset role;
call test_helpers.finish_cmatch('c6a00000-0000-0000-0000-000000000002', 'c3a00000-0000-0000-0000-000000000003');
call test_helpers.finish_cmatch('c6a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000001');
call test_helpers.finish_cmatch('c6a00000-0000-0000-0000-000000000004', 'c3a00000-0000-0000-0000-000000000002');
call test_helpers.finish_cmatch('c6a00000-0000-0000-0000-000000000005', 'c3a00000-0000-0000-0000-000000000001');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  $$ select public.close_championship_group('c5a00000-0000-0000-0000-000000000001',
       array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
             'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[]) $$,
  'P0001', 'scores_missing', 'a group closes when all its matches are played');

-- M6 too (Bruno and Lucía win): Ana and Pedro won 3, Bruno and Lucía 2, Gabi and Marta 1, Hugo and Nico 0.
reset role;
call test_helpers.finish_cmatch('c6a00000-0000-0000-0000-000000000006', 'c3a00000-0000-0000-0000-000000000002');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  $$ select public.close_championship_group('c5a00000-0000-0000-0000-000000000001',
       array['c3a00000-0000-0000-0000-000000000002', 'c3a00000-0000-0000-0000-000000000001',
             'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[]) $$,
  'P0001', 'invalid_input', 'nobody goes above a pair that won more');
select lives_ok(
  $$ select public.close_championship_group('c5a00000-0000-0000-0000-000000000001',
       array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
             'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[]) $$,
  'the group closes in the order of its table');
select results_eq(
  $$ select entry_a_id, entry_b_id from public.championship_matches
     where id = 'c6a00000-0000-0000-0000-000000000008' $$,
  $$ values ('c3a00000-0000-0000-0000-000000000001'::uuid, 'c3a00000-0000-0000-0000-000000000002'::uuid) $$,
  'its 1st and its 2nd go to the final');
select results_eq(
  $$ select entry_id, place::int from public.championship_group_members
     where group_id = 'c5a00000-0000-0000-0000-000000000001' order by place $$,
  $$ values ('c3a00000-0000-0000-0000-000000000001'::uuid, 1), ('c3a00000-0000-0000-0000-000000000002'::uuid, 2),
            ('c3a00000-0000-0000-0000-000000000003'::uuid, 3), ('c3a00000-0000-0000-0000-000000000004'::uuid, 4) $$,
  'with every place saved');
select lives_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000006', '[[6,2],[6,2]]') $$,
  'a group result is corrected while its final has not started');
select ok(
  not exists (select 1 from public.championship_group_members
              where group_id = 'c5a00000-0000-0000-0000-000000000001' and place is not null)
  and (select entry_a_id is null and entry_b_id is null from public.championship_matches
       where id = 'c6a00000-0000-0000-0000-000000000008'),
  'which opens the group again and takes its pairs out of the final');
select throws_ok(
  $$ select public.finish_championship('c1a00000-0000-0000-0000-000000000001') $$,
  'P0001', 'scores_missing', 'a championship finishes when everything is played');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000002', '[[6,1],[6,1]]') $$,
  'P0001', 'forbidden', 'staff of another club record nothing');

-- Ana, a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.start_match('c6a00000-0000-0000-0000-000000000002') $$,
  'P0001', 'forbidden', 'players do not record their own matches');

-- Carla, reception, plays it to the end.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.close_championship_group('c5a00000-0000-0000-0000-000000000001',
       array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
             'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[]) $$,
  'the group closes again');
select lives_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000008', '[[6,3],[6,3]]') $$,
  'the final of Libre is played');
select lives_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-00000000000a', '[[6,3],[6,3]]') $$,
  'and the final of Llave');
select lives_ok(
  $$ select public.finish_championship('c1a00000-0000-0000-0000-000000000001') $$,
  'the organizer finishes the championship');
select is((select status::text from public.championships where id = 'c1a00000-0000-0000-0000-000000000001'),
  'finished', 'it is finished');

reset role;
select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in ('json_uuid', 'draw_source', 'draw_problem', 'schedule_problem', 'championship_code',
                         'release_free_windows', 'set_done', 'set_partial', 'match_winner', 'staff_match',
                         'mark_in_progress', 'next_matches', 'apply_result')
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot execute the fixture helpers');

select * from finish();
rollback;
