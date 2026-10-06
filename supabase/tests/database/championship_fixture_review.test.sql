begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(7);

-- C1: closed, a day of play and 'Libre' (groups of 4, 2 qualify) with four pairs (E1..E4).
-- C5: closed, 'Llave' by direct knockout with four pairs (E11..E14).
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
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000005', 'closed');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000005', 'c1a00000-0000-0000-0000-000000000005',
  'Llave');
update public.championship_categories set format = 'knockout' where id = 'c2a00000-0000-0000-0000-000000000005';
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000011', 'c2a00000-0000-0000-0000-000000000005',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000012', 'c2a00000-0000-0000-0000-000000000005',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000013', 'c2a00000-0000-0000-0000-000000000005',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000014', 'c2a00000-0000-0000-0000-000000000005',
  'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-000000000f04');

-- 'Libre' as lib/domain/championship-draw.ts sends it: one group, each pair of its members once, a final between
-- the 1st and the 2nd.
create function test_helpers.libre(p_final jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'category_id', 'c2a00000-0000-0000-0000-000000000001',
    'groups', jsonb_build_array(jsonb_build_object('key', 'A', 'name', 'Zona A', 'entry_ids', to_jsonb(array[
      'c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
      'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[]))),
    'matches', (
      select jsonb_agg(jsonb_build_object('key', 'A' || n, 'stage', 'group', 'group', 'A', 'entry_a', a, 'entry_b', b))
      from (
        select x.a, y.b, row_number() over () as n
        from unnest(array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
                          'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[])
               with ordinality as x (a, i)
        join unnest(array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
                          'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[])
               with ordinality as y (b, j) on y.j > x.i
      ) as pairs
    ) || jsonb_build_array(p_final)
  );
$$;

-- 'Llave' with the matches given.
create function test_helpers.llave(p_matches jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('category_id', 'c2a00000-0000-0000-0000-000000000005', 'groups', '[]'::jsonb,
                            'matches', p_matches);
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  format('select public.save_championship_draw(%L, 1, %L)', 'c1a00000-0000-0000-0000-000000000001',
    jsonb_build_array(test_helpers.libre(jsonb_build_object('key', 'F', 'stage', 'knockout', 'round', 1, 'position', 1,
      'entry_a', 'c3a00000-0000-0000-0000-000000000001',
      'source_b', jsonb_build_object('group', 'A', 'place', 2))))),
  'P0001', 'invalid_input', 'a pair of a group never goes straight into the bracket');
select throws_ok(
  format('select public.save_championship_draw(%L, 1, %L)', 'c1a00000-0000-0000-0000-000000000001',
    jsonb_build_array(test_helpers.libre(jsonb_build_object('key', 'F', 'stage', 'knockout', 'round', 1, 'position', 1,
      'source_a', jsonb_build_object('group', 'A', 'place', 1),
      'source_b', jsonb_build_object('group', 'A', 'place', 3))))),
  'P0001', 'invalid_input', 'the bracket takes exactly the places that qualify');
select lives_ok(
  format('select public.save_championship_draw(%L, 1, %L)', 'c1a00000-0000-0000-0000-000000000001',
    jsonb_build_array(test_helpers.libre(jsonb_build_object('key', 'F', 'stage', 'knockout', 'round', 1, 'position', 1,
      'source_a', jsonb_build_object('group', 'A', 'place', 1),
      'source_b', jsonb_build_object('group', 'A', 'place', 2))))),
  'a draw with the 1st and the 2nd in the final is saved');

select throws_ok(
  format('select public.save_championship_draw(%L, 1, %L)', 'c1a00000-0000-0000-0000-000000000005',
    jsonb_build_array(test_helpers.llave(jsonb_build_array(
      jsonb_build_object('key', 'F', 'stage', 'knockout', 'round', 1, 'position', 1,
        'entry_a', 'c3a00000-0000-0000-0000-000000000011', 'entry_b', 'c3a00000-0000-0000-0000-000000000012'),
      jsonb_build_object('key', 'S', 'stage', 'knockout', 'round', 2, 'position', 1,
        'entry_a', 'c3a00000-0000-0000-0000-000000000013', 'entry_b', 'c3a00000-0000-0000-0000-000000000014'))))),
  'P0001', 'invalid_input', 'every match before the final leads to the next round');
select throws_ok(
  format('select public.save_championship_draw(%L, 1, %L)', 'c1a00000-0000-0000-0000-000000000005',
    jsonb_build_array(test_helpers.llave(jsonb_build_array(
      jsonb_build_object('key', 'S1', 'stage', 'knockout', 'round', 2, 'position', 1,
        'entry_a', 'c3a00000-0000-0000-0000-000000000011', 'entry_b', 'c3a00000-0000-0000-0000-000000000012'),
      jsonb_build_object('key', 'S2', 'stage', 'knockout', 'round', 2, 'position', 1,
        'entry_a', 'c3a00000-0000-0000-0000-000000000013', 'entry_b', 'c3a00000-0000-0000-0000-000000000014'),
      jsonb_build_object('key', 'F', 'stage', 'knockout', 'round', 1, 'position', 1,
        'source_a', jsonb_build_object('winner_of', 'S1'), 'source_b', jsonb_build_object('winner_of', 'S2')))))),
  'P0001', 'invalid_input', 'two matches never share a place in the bracket');
reset role;

-- A court given back to the grid and booked: a match can no longer be moved onto it.
update public.championship_matches
   set court_id = 'c0000000-0000-0000-0000-000000000001',
       starts_at = lower(test_helpers.slot(10, '08:00', 90)), ends_at = upper(test_helpers.slot(10, '08:00', 90))
 where id = (select id from public.championship_matches
             where category_id = 'c2a00000-0000-0000-0000-000000000001' and stage = 'group' limit 1);
insert into public.court_occupancy (club_id, court_id, kind, period, championship_id)
values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'championship',
        test_helpers.slot(10, '08:00', 90), 'c1a00000-0000-0000-0000-000000000001');
select is(
  private.schedule_problem('c1a00000-0000-0000-0000-000000000001',
    (select id from public.championship_matches where court_id is not null limit 1)),
  null, 'the championship''s own days of play do not count as busy');
delete from public.court_occupancy where championship_id = 'c1a00000-0000-0000-0000-000000000001';
insert into public.court_occupancy (club_id, court_id, kind, period, note)
values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'block',
        test_helpers.slot(10, '08:00', 90), 'Clase');
select is(
  private.schedule_problem('c1a00000-0000-0000-0000-000000000001',
    (select id from public.championship_matches where court_id is not null limit 1)),
  'courts_busy', 'a court booked or blocked by anything else is busy');

select * from finish();
rollback;
