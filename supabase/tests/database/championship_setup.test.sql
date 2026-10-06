begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(28);

-- Juli keeps her profile private; a poster was already uploaded; C1 is a draft for Ana to try.
update public.profiles set is_public = false where id = '00000000-0000-0000-0000-0000000000a5';
insert into storage.objects (bucket_id, name)
values ('championship-posters', 'a0000000-0000-0000-0000-000000000001/poster-1.png');
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001', 'draft', null);

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.create_championship('a0000000-0000-0000-0000-000000000001', 'Primavera',
       'Se juega al mejor de 3 sets.', 2) $$,
  'staff create a championship');
select results_eq(
  $$ select status::text, created_by, rules from public.championships where name = 'Primavera' $$,
  $$ values ('draft', '00000000-0000-0000-0000-0000000000c1'::uuid, 'Se juega al mejor de 3 sets.') $$,
  'as a draft, with its rules');
select throws_ok(
  $$ select public.create_championship('a0000000-0000-0000-0000-000000000001', '   ') $$,
  'P0001', 'invalid_input', 'a championship has a name');
select throws_ok(
  $$ select public.create_championship('a0000000-0000-0000-0000-000000000001', 'Pasado', '', 2,
       now() - interval '1 hour') $$,
  'P0001', 'in_the_past', 'its registration cannot close in the past');

select lives_ok(
  $$ select public.add_championship_window((select id from public.championships where name = 'Primavera'),
       test_helpers.today() + 10, '08:00', '14:00',
       array['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002']::uuid[]) $$,
  'staff add a day of play');
select throws_ok(
  $$ select public.add_championship_window((select id from public.championships where name = 'Primavera'),
       test_helpers.today() + 10, '11:00', '17:00', array['c0000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'P0001', 'courts_busy', 'two days of play do not overlap on a court');
select throws_ok(
  $$ select public.add_championship_window((select id from public.championships where name = 'Primavera'),
       test_helpers.today() + 10, '21:30', '24:00', array['c0000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'P0001', 'outside_hours', 'a day of play fits the club''s hours');
select throws_ok(
  $$ select public.add_championship_window((select id from public.championships where name = 'Primavera'),
       test_helpers.today() - 1, '08:00', '14:00', array['c0000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'P0001', 'in_the_past', 'and is in the future');
select throws_ok(
  $$ select public.add_championship_window((select id from public.championships where name = 'Primavera'),
       test_helpers.today() + 11, '08:00', '14:00', array['cb000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'P0001', 'invalid_input', 'on courts of the club');
select lives_ok(
  $$ select public.add_championship_window((select id from public.championships where name = 'Primavera'),
       test_helpers.today() + 11, '14:00', '20:00', array['c0000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'a second day of play');
select is((select count(*)::int from public.championship_windows), 2, 'two days of play');

select lives_ok(
  $$ select public.add_championship_category(
       p_championship_id => (select id from public.championships where name = 'Primavera'), p_name => 'Libre',
       p_gender => 'open', p_level_min => null, p_level_max => null, p_min_pairs => 4, p_max_pairs => 12,
       p_price => 2000, p_format => 'groups_knockout', p_group_size => 4, p_qualifiers => 2, p_match_minutes => 90,
       p_seeding => 'ranking', p_third_set => 'super_tiebreak', p_golden_point => false) $$,
  'staff add a category');
select results_eq(
  $$ select sort_order::int, match_rules ->> 'third_set', price from public.championship_categories
     where name = 'Libre' $$,
  $$ values (0, 'super_tiebreak', 2000) $$,
  'with its rules of play and its price per pair');
select throws_ok(
  $$ select public.add_championship_category(
       p_championship_id => (select id from public.championships where name = 'Primavera'), p_name => 'Libre',
       p_gender => 'open', p_level_min => null, p_level_max => null, p_min_pairs => 4, p_max_pairs => 12,
       p_price => 2000, p_format => 'groups_knockout', p_group_size => 4, p_qualifiers => 2, p_match_minutes => 90,
       p_seeding => 'ranking', p_third_set => 'super_tiebreak', p_golden_point => false) $$,
  'P0001', 'category_exists', 'two categories of a championship have different names');
select throws_ok(
  $$ select public.add_championship_category(
       p_championship_id => (select id from public.championships where name = 'Primavera'), p_name => 'Al revés',
       p_gender => 'open', p_level_min => null, p_level_max => null, p_min_pairs => 8, p_max_pairs => 4,
       p_price => 2000, p_format => 'groups_knockout', p_group_size => 4, p_qualifiers => 2, p_match_minutes => 90,
       p_seeding => 'ranking', p_third_set => 'super_tiebreak', p_golden_point => false) $$,
  'P0001', 'invalid_input', 'the minimum of pairs is not over the maximum');
select lives_ok(
  $$ select public.add_championship_category(
       p_championship_id => (select id from public.championships where name = 'Primavera'), p_name => 'Damas',
       p_gender => 'women', p_level_min => 5, p_level_max => 6, p_min_pairs => 4, p_max_pairs => 8,
       p_price => 1800, p_format => 'round_robin', p_group_size => 3, p_qualifiers => 1, p_match_minutes => 60,
       p_seeding => 'manual', p_third_set => 'full', p_golden_point => true) $$,
  'a second category');
select is((select sort_order::int from public.championship_categories where name = 'Damas'), 1,
  'listed after the first one');
select lives_ok(
  $$ select public.delete_championship_category((select id from public.championship_categories where name = 'Damas')) $$,
  'a draft category can be deleted');
select is((select count(*)::int from public.championship_categories), 1, 'one category left');
select lives_ok(
  $$ select public.delete_championship_window((select id from public.championship_windows
       where on_date = test_helpers.today() + 11)) $$,
  'a draft day of play can be deleted');
select lives_ok(
  $$ select public.update_championship((select id from public.championships where name = 'Primavera'),
       'Primavera 2026', 'Se juega al mejor de 3 sets.', 1) $$,
  'staff edit the championship');
select throws_ok(
  $$ select public.set_championship_poster((select id from public.championships where name = 'Primavera 2026'),
       'a0000000-0000-0000-0000-000000000001/poster-2.png') $$,
  'P0001', 'invalid_input', 'a poster that was not uploaded is refused');
select lives_ok(
  $$ select public.set_championship_poster((select id from public.championships where name = 'Primavera 2026'),
       'a0000000-0000-0000-0000-000000000001/poster-1.png') $$,
  'staff set the poster');
select is((select poster_path from public.championships where name = 'Primavera 2026'),
  'a0000000-0000-0000-0000-000000000001/poster-1.png', 'the championship points at it');

-- Ana, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.create_championship('a0000000-0000-0000-0000-000000000001', 'Mío') $$,
  'P0001', 'forbidden', 'a player creates no championships');
select throws_ok(
  $$ select public.add_championship_window('c1a00000-0000-0000-0000-000000000001', test_helpers.today() + 10,
       '08:00', '14:00', array['c0000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'P0001', 'forbidden', 'nor edits them');
select set_eq(
  $$ select name from public.member_directory('a0000000-0000-0000-0000-000000000001') $$,
  array['Bruno', 'carla', 'dani', 'Gabi', 'Hugo', 'Iván'],
  'a member finds the other members with a public profile, to pick a partner');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';

select is((select count(*)::int from public.member_directory('a0000000-0000-0000-0000-000000000001')), 0,
  'someone outside the club finds nobody');

select * from finish();
rollback;
