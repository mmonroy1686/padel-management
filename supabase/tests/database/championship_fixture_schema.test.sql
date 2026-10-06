begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(18);

select has_table('public', 'championship_groups', 'championship_groups exists');
select has_table('public', 'championship_group_members', 'championship_group_members exists');
select has_table('public', 'championship_matches', 'championship_matches exists');
select has_table('public', 'championship_match_sets', 'championship_match_sets exists');
select ok('championship_fixture' = any (enum_range(null::public.notification_kind)::text[]),
  'the fixture aviso is one more kind of aviso');
select has_column('public', 'championships', 'public_code', 'a championship has a public code');
select has_column('public', 'championships', 'draw_seed', 'and the seed of its draw');
select ok((select condeferrable from pg_constraint where conname = 'championship_matches_one_court'),
  'one court, one match: checked when the transaction commits');

-- C1 is published: 'Libre' with Ana and Pedro, Bruno and Lucía in Zona A, their match on day 10 at 08:00 with
-- its two sets. C2 was drawn but not published: Gabi and Marta against Hugo and Nico.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001', 'published');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
call test_helpers.make_group('c5a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'Zona A', array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002']::uuid[]);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001', p_court => 'c0000000-0000-0000-0000-000000000001',
  p_starts => test_helpers.at(10, '08:00'));
call test_helpers.finish_cmatch('c6a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000001');

call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000002', 'drawn');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000002');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-000000000f04');
call test_helpers.make_group('c5a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000002',
  'Zona A', array['c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[]);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000002',
  'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004',
  p_group_id => 'c5a00000-0000-0000-0000-000000000002');

select throws_ok(
  $$ insert into public.championship_matches (club_id, championship_id, category_id, stage, group_id, court_id)
     values ('a0000000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001',
             'c2a00000-0000-0000-0000-000000000001', 'group', 'c5a00000-0000-0000-0000-000000000001',
             'c0000000-0000-0000-0000-000000000001') $$,
  '23514', null, 'a match on a court has its start and its end');

set local role authenticated;

-- Ana, a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select is((select count(*)::int from public.championship_matches), 1,
  'a member reads the matches of a published championship, not of one only drawn');
select is((select count(*)::int from public.championship_groups), 1, 'and its groups');
select is((select count(*)::int from public.championship_group_members), 2, 'with their pairs');
select is((select count(*)::int from public.championship_match_sets), 2, 'and the sets of its matches');
select throws_ok($$ update public.championship_matches set pinned = true $$, '42501', null,
  'nobody writes the fixture directly');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select is((select count(*)::int from public.championship_matches), 2, 'staff read the drawn one too');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select is((select count(*)::int from public.championship_matches), 0, 'staff of another club read nothing');

reset role;
select ok(has_function_privilege('authenticated', 'private.fixture_visible(uuid)', 'execute'),
  'the read policies can ask who sees a fixture');

set local role anon;
select throws_ok($$ select count(*) from public.championship_matches $$, '42501', null,
  'anon reads no table of the fixture');

select * from finish();
rollback;
