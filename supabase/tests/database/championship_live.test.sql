begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(30);

select has_table('public', 'championship_live_games', 'championship_live_games exists');
select has_column('public', 'championship_match_sets', 'in_progress', 'a set says whether it is being played');

-- C1 is published at campeonato-t-ab12. 'Libre' (third set a super tie-break): Ana and Pedro (E1) against Bruno
-- and Lucía (E2) in the semifinal S1, being played; its winner meets Gabi and Marta (E3) in the final F, not
-- started. 'Completo' (a full third set): Hugo and Nico (E4) against Iván and Olga (E5) in M4, being played.
-- 'Corto' (50 minutes of play): Juli and Raúl (E6) against Bruno and Nico (E7) in M5, being played.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001', 'published');
update public.championships set public_code = 'campeonato-t-ab12' where id = 'c1a00000-0000-0000-0000-000000000001';
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000001',
  'Completo');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000003', 'c1a00000-0000-0000-0000-000000000001',
  'Corto');
update public.championship_categories set match_rules = match_rules || '{"third_set": "full"}'
 where id = 'c2a00000-0000-0000-0000-000000000002';
update public.championship_categories set match_rules = match_rules || '{"time_limit_minutes": 50}'
 where id = 'c2a00000-0000-0000-0000-000000000003';
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-000000000f04');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a4', 'c4a00000-0000-0000-0000-000000000f05');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000006', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a5', 'c4a00000-0000-0000-0000-000000000f06');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000007', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f04');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002', p_round => 2, p_position => 1);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  null, 'c3a00000-0000-0000-0000-000000000003', p_round => 1, p_position => 1,
  p_source_a => jsonb_build_object('winner_of', 'c6a00000-0000-0000-0000-000000000001'));
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000002',
  'c3a00000-0000-0000-0000-000000000004', 'c3a00000-0000-0000-0000-000000000005', p_round => 1, p_position => 1);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000003',
  'c3a00000-0000-0000-0000-000000000006', 'c3a00000-0000-0000-0000-000000000007', p_round => 1, p_position => 1);
update public.championship_matches set status = 'playing'
 where id in ('c6a00000-0000-0000-0000-000000000001', 'c6a00000-0000-0000-0000-000000000004',
              'c6a00000-0000-0000-0000-000000000005');

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  $$ select public.score_live_game('c6a00000-0000-0000-0000-000000000002', 'a') $$,
  'P0001', 'invalid_state', 'a match that is not being played takes no game');
select throws_ok(
  $$ select public.score_live_game('c6a00000-0000-0000-0000-000000000001', 'x') $$,
  'P0001', 'invalid_input', 'a game goes to side a or b');
select throws_ok(
  $$ select public.undo_live_game('c6a00000-0000-0000-0000-000000000001') $$,
  'P0001', 'invalid_state', 'nothing to take back before the first game');

-- S1, set 1: 4-4, then Ana and Pedro win two games: 6-4.
select is(test_helpers.score('c6a00000-0000-0000-0000-000000000001', 'aaaabbbbaa'),
  '{"sets": [[6, 4]], "current": [0, 0], "decided": false}'::jsonb,
  '6-4 closes the first set and the second starts');
select results_eq(
  $$ select set_number::int, games_a::int, games_b::int, super_tiebreak, in_progress
     from public.championship_match_sets where match_id = 'c6a00000-0000-0000-0000-000000000001'
     order by set_number $$,
  $$ values (1, 6, 4, false, false), (2, 0, 0, false, true) $$,
  'the sets are written again, the one being played marked');
-- Set 2: 0-5, 5-5, then Bruno and Lucía win two: 5-7.
select is(test_helpers.score('c6a00000-0000-0000-0000-000000000001', 'bbbbbaaaaabb'),
  '{"sets": [[6, 4], [5, 7]], "current": [0, 0], "decided": false}'::jsonb,
  '7-5 closes a set');
-- Set 3, a super tie-break: 9-9, then 10-9.
select is(test_helpers.score('c6a00000-0000-0000-0000-000000000001', 'aaaaaaaaabbbbbbbbba'),
  '{"sets": [[6, 4], [5, 7]], "current": [10, 9], "decided": false}'::jsonb,
  'the third set is a super tie-break: 10-9 is not over');
select results_eq(
  $$ select games_a::int, games_b::int, super_tiebreak, in_progress from public.championship_match_sets
     where match_id = 'c6a00000-0000-0000-0000-000000000001' and set_number = 3 $$,
  $$ values (10, 9, true, true) $$,
  'the super tie-break is the set being played');
select is(test_helpers.score('c6a00000-0000-0000-0000-000000000001', 'a'),
  '{"sets": [[6, 4], [5, 7], [11, 9]], "current": null, "decided": true}'::jsonb,
  '11-9 wins it by 2: the match is decided');
select throws_ok(
  $$ select public.score_live_game('c6a00000-0000-0000-0000-000000000001', 'b') $$,
  'P0001', 'invalid_state', 'a decided match takes no more games');
select is(public.undo_live_game('c6a00000-0000-0000-0000-000000000001'),
  '{"sets": [[6, 4], [5, 7]], "current": [10, 9], "decided": false}'::jsonb,
  '"Deshacer" takes the last game back');
select lives_ok(
  $$ select public.score_live_game('c6a00000-0000-0000-0000-000000000001', 'a') $$,
  'and the game is loaded again');

-- M4 ('Completo'): 5-5, 6-5, 6-6, and the next game is the tie-break.
select is(test_helpers.score('c6a00000-0000-0000-0000-000000000004', 'aaaaabbbbbab'),
  '{"sets": [], "current": [6, 6], "decided": false}'::jsonb,
  'at 6-6 the set goes on');
select is(test_helpers.score('c6a00000-0000-0000-0000-000000000004', 'a'),
  '{"sets": [[7, 6]], "current": [0, 0], "decided": false}'::jsonb,
  'the next game is the tie-break: 7-6');
select is(test_helpers.score('c6a00000-0000-0000-0000-000000000004', 'bbbbbbaaaaaa'),
  '{"sets": [[7, 6], [0, 6], [6, 0]], "current": null, "decided": true}'::jsonb,
  'a full third set is played to 6');

-- M5 ('Corto', time limit): 3-1 when the time runs out.
select is(test_helpers.score('c6a00000-0000-0000-0000-000000000005', 'aaab'),
  '{"sets": [], "current": [3, 1], "decided": false}'::jsonb,
  'a time-limited match is loaded the same way');
set local role anon;
select results_eq(
  $$ select (s.item ->> 'games_a')::int, (s.item ->> 'games_b')::int, (s.item ->> 'in_progress')::boolean
     from jsonb_array_elements(public.public_championship('campeonato-t-ab12') -> 'matches') as m (item)
     cross join lateral jsonb_array_elements(m.item -> 'sets') as s (item)
     where m.item ->> 'id' = 'c6a00000-0000-0000-0000-000000000005' $$,
  $$ values (3, 1, true) $$,
  'the public page shows the set being played');
set local role authenticated;
select lives_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000005', '[[3,1]]') $$,
  'with a time limit the match ends as it stands');

-- "Terminar partido" on S1, and a W.O. on M4.
select lives_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000001', '[[6,4],[5,7],[11,9]]') $$,
  '"Terminar partido" saves the result');
select lives_ok(
  $$ select public.record_walkover('c6a00000-0000-0000-0000-000000000004', 'c3a00000-0000-0000-0000-000000000005') $$,
  'a W.O. is saved over a live score');

reset role;
select is((select count(*)::int from public.championship_live_games), 0,
  'the final result clears the live games');
select results_eq(
  $$ select set_number::int, games_a::int, games_b::int, super_tiebreak, in_progress
     from public.championship_match_sets where match_id = 'c6a00000-0000-0000-0000-000000000001'
     order by set_number $$,
  $$ values (1, 6, 4, false, false), (2, 5, 7, false, false), (3, 11, 9, true, false) $$,
  'the match keeps its sets, none being played');
select is((select entry_a_id from public.championship_matches where id = 'c6a00000-0000-0000-0000-000000000002'),
  'c3a00000-0000-0000-0000-000000000001'::uuid, 'and its winner goes on to the final');

set local role authenticated;

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  $$ select public.score_live_game('c6a00000-0000-0000-0000-000000000001', 'a') $$,
  'P0001', 'forbidden', 'staff of another club load no games');

-- Ana, a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.undo_live_game('c6a00000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'players do not load the score');
select throws_ok(
  $$ select * from public.championship_live_games $$,
  '42501', null, 'nobody reads the live games directly');

reset role;
select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname in ('live_sets', 'write_live_sets')
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot execute the live score helpers');
select ok(
  has_function_privilege('authenticated', 'public.score_live_game(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.score_live_game(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.undo_live_game(uuid)', 'execute'),
  'staff run the live score through authenticated; anon never');

select * from finish();
rollback;
