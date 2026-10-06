begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(21);

-- C1: registration closed, a day of play and 'Libre' (groups of 4, 2 qualify) with four pairs with a place:
-- Ana and Pedro (E1), Bruno and Lucía (E2), Gabi and Marta (E3), Hugo and Nico (E4); Iván and Olga (E5) wait.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001', 'closed');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '23:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-000000000f04');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a4', 'c4a00000-0000-0000-0000-000000000f05', 'waiting');
-- C2: closed, its only category has one pair (Juli and Raúl). C3: still taking sign-ups.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000002', 'closed');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000002',
  '5ta');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000006', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a5', 'c4a00000-0000-0000-0000-000000000f06');
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000003');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000003', 'c1a00000-0000-0000-0000-000000000003');
-- C4: closed, 'Llave' by direct knockout with three pairs (E7, E8, E9).
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000004', 'closed');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000004', 'c1a00000-0000-0000-0000-000000000004',
  'Llave');
update public.championship_categories set format = 'knockout' where id = 'c2a00000-0000-0000-0000-000000000004';
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000007', 'c2a00000-0000-0000-0000-000000000004',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000008', 'c2a00000-0000-0000-0000-000000000004',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000009', 'c2a00000-0000-0000-0000-000000000004',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03');

-- A draw of one group 'A' with p_entries, each pair of them once and (unless told otherwise) a final between
-- its 1st and its 2nd, as lib/domain/championship-draw.ts sends it.
create function test_helpers.group_draw(p_category_id uuid, p_entries uuid[], p_final boolean default true)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'category_id', p_category_id,
    'groups', jsonb_build_array(jsonb_build_object('key', 'A', 'name', 'Zona A', 'entry_ids', to_jsonb(p_entries))),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object('key', 'A' || n, 'stage', 'group', 'group', 'A', 'entry_a', a,
                                          'entry_b', b) order by n)
      from (
        select x.a, y.b, row_number() over (order by x.i, y.j) as n
        from unnest(p_entries) with ordinality as x (a, i)
        join unnest(p_entries) with ordinality as y (b, j) on y.j > x.i
      ) as pairs
    ), '[]'::jsonb) || case when p_final then jsonb_build_array(jsonb_build_object(
      'key', 'F', 'stage', 'knockout', 'round', 1, 'position', 1,
      'source_a', jsonb_build_object('group', 'A', 'place', 1),
      'source_b', jsonb_build_object('group', 'A', 'place', 2))) else '[]'::jsonb end
  );
$$;

-- 'Libre' with its four pairs with a place.
create function test_helpers.libre_draw()
returns jsonb
language sql
immutable
as $$
  select test_helpers.group_draw('c2a00000-0000-0000-0000-000000000001',
    array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
          'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[]);
$$;

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  format('select public.save_championship_draw(%L, 1, %L)', 'c1a00000-0000-0000-0000-000000000003',
         jsonb_build_array(test_helpers.group_draw('c2a00000-0000-0000-0000-000000000003', array[]::uuid[], false))),
  'P0001', 'invalid_state', 'nothing is drawn while registration is open');
select throws_ok(
  $$ select public.save_championship_draw('c1a00000-0000-0000-0000-000000000002', 1, '[]') $$,
  'P0001', 'category_too_small', 'a category with fewer than 2 pairs is merged or cancelled first');
select throws_ok(
  $$ select public.set_championship_seeds('c2a00000-0000-0000-0000-000000000001',
       array['c3a00000-0000-0000-0000-000000000005']::uuid[]) $$,
  'P0001', 'invalid_input', 'a pair in line is no seed');
select lives_ok(
  $$ select public.set_championship_seeds('c2a00000-0000-0000-0000-000000000001',
       array['c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000001']::uuid[]) $$,
  'the organizer sets the seeds before the draw');
select results_eq(
  $$ select id, seed::int from public.championship_entries
     where category_id = 'c2a00000-0000-0000-0000-000000000001' and seed is not null order by seed $$,
  $$ values ('c3a00000-0000-0000-0000-000000000003'::uuid, 1), ('c3a00000-0000-0000-0000-000000000001'::uuid, 2) $$,
  'in the order given');
select throws_ok(
  $$ select public.save_championship_draw('c1a00000-0000-0000-0000-000000000001', 1, '[]') $$,
  'P0001', 'invalid_input', 'every open category is drawn');
select throws_ok(
  format('select public.save_championship_draw(%L, 1, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.group_draw('c2a00000-0000-0000-0000-000000000001',
           array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
                 'c3a00000-0000-0000-0000-000000000003']::uuid[]))),
  'P0001', 'invalid_input', 'no pair with a place is left out');
select throws_ok(
  format('select public.save_championship_draw(%L, 1, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.group_draw('c2a00000-0000-0000-0000-000000000001',
           array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
                 'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000005']::uuid[]))),
  'P0001', 'invalid_input', 'and a pair in line does not play');
select throws_ok(
  format('select public.save_championship_draw(%L, 1, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(jsonb_set(test_helpers.libre_draw(), '{matches}',
                                     (test_helpers.libre_draw() -> 'matches') - 0))),
  'P0001', 'invalid_input', 'each pair of a group plays the others once');
select throws_ok(
  format('select public.save_championship_draw(%L, 1, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(jsonb_set(test_helpers.libre_draw(), '{matches,6,source_b,place}', '9'))),
  'P0001', 'invalid_input', 'the bracket only waits for places the group has');
select lives_ok(
  format('select public.save_championship_draw(%L, 42, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.libre_draw())),
  'a draw that keeps the rules is saved');
select is((select status::text || ' ' || draw_seed from public.championships
           where id = 'c1a00000-0000-0000-0000-000000000001'),
  'drawn 42', 'the championship is drawn, with its seed');
select is((select count(*)::int from public.championship_groups
           where category_id = 'c2a00000-0000-0000-0000-000000000001'), 1, 'one group');
select is((select count(*)::int from public.championship_matches
           where category_id = 'c2a00000-0000-0000-0000-000000000001' and stage = 'group'), 6, 'six group matches');
select results_eq(
  $$ select m.source_a ->> 'place', m.source_b ->> 'place', (m.source_a ->> 'group')::uuid = g.id
     from public.championship_matches m
     join public.championship_groups g on g.category_id = m.category_id
     where m.category_id = 'c2a00000-0000-0000-0000-000000000001' and m.stage = 'knockout' $$,
  $$ values ('1', '2', true) $$,
  'the final waits for the 1st and the 2nd of the group');
select lives_ok(
  format('select public.save_championship_draw(%L, 7, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.libre_draw())),
  'drawing again replaces the draw while it is not published');
select is((select count(*)::int from public.championship_matches
           where championship_id = 'c1a00000-0000-0000-0000-000000000001'), 7,
  'with nothing left of the first one');
select lives_ok(
  format('select public.save_championship_draw(%L, 3, %L)', 'c1a00000-0000-0000-0000-000000000004',
    jsonb_build_array(jsonb_build_object(
      'category_id', 'c2a00000-0000-0000-0000-000000000004', 'groups', '[]'::jsonb,
      'matches', jsonb_build_array(
        jsonb_build_object('key', 'SF2', 'stage', 'knockout', 'round', 2, 'position', 2,
                           'entry_a', 'c3a00000-0000-0000-0000-000000000008',
                           'entry_b', 'c3a00000-0000-0000-0000-000000000009'),
        jsonb_build_object('key', 'F', 'stage', 'knockout', 'round', 1, 'position', 1,
                           'entry_a', 'c3a00000-0000-0000-0000-000000000007',
                           'source_b', jsonb_build_object('winner_of', 'SF2')))))),
  'a direct knockout puts the top seed straight into the final when it has a bye');
select results_eq(
  $$ select entry_a_id, (source_b ->> 'winner_of')::uuid = (
       select id from public.championship_matches
       where category_id = 'c2a00000-0000-0000-0000-000000000004' and round = 2)
     from public.championship_matches
     where category_id = 'c2a00000-0000-0000-0000-000000000004' and round = 1 $$,
  $$ values ('c3a00000-0000-0000-0000-000000000007'::uuid, true) $$,
  'and the final waits for the winner of the semifinal');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  format('select public.save_championship_draw(%L, 1, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.libre_draw())),
  'P0001', 'forbidden', 'staff of another club cannot draw');

-- Ana, a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  format('select public.save_championship_draw(%L, 1, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.libre_draw())),
  'P0001', 'forbidden', 'nor can a member');

select * from finish();
rollback;
