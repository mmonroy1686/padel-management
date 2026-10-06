begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(5);

call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001', 'draft');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.add_championship_category(
       p_championship_id => 'c1a00000-0000-0000-0000-000000000001', p_name => 'Libre',
       p_gender => 'open', p_min_pairs => 4, p_max_pairs => 12, p_price => 2000, p_format => 'groups_knockout',
       p_group_size => 4, p_qualifiers => 2, p_match_minutes => 90, p_seeding => 'ranking',
       p_third_set => 'super_tiebreak', p_golden_point => false) $$,
  'a category without a time limit: best of 3 sets');
select lives_ok(
  $$ select public.add_championship_category(
       p_championship_id => 'c1a00000-0000-0000-0000-000000000001', p_name => 'Express',
       p_gender => 'mixed', p_min_pairs => 4, p_max_pairs => 12, p_price => 1500, p_format => 'round_robin',
       p_group_size => 4, p_qualifiers => 2, p_match_minutes => 60, p_seeding => 'manual',
       p_third_set => 'super_tiebreak', p_golden_point => true, p_time_limit => 50) $$,
  'a category with a time limit');
select results_eq(
  $$ select name, match_rules -> 'time_limit_minutes' from public.championship_categories order by name $$,
  $$ values ('Express', '50'::jsonb), ('Libre', 'null'::jsonb) $$,
  'the limit is part of the rules of play; none means no limit');
select throws_ok(
  $$ select public.add_championship_category(
       p_championship_id => 'c1a00000-0000-0000-0000-000000000001', p_name => 'Corto',
       p_gender => 'mixed', p_min_pairs => 4, p_max_pairs => 12, p_price => 1500, p_format => 'round_robin',
       p_group_size => 4, p_qualifiers => 2, p_match_minutes => 60, p_seeding => 'manual',
       p_third_set => 'super_tiebreak', p_golden_point => true, p_time_limit => 10) $$,
  'P0001', 'invalid_input', 'a limit goes from 20 to 180 minutes');
select throws_ok(
  $$ select public.add_championship_category(
       p_championship_id => 'c1a00000-0000-0000-0000-000000000001', p_name => 'Largo',
       p_gender => 'mixed', p_min_pairs => 4, p_max_pairs => 12, p_price => 1500, p_format => 'round_robin',
       p_group_size => 4, p_qualifiers => 2, p_match_minutes => 60, p_seeding => 'manual',
       p_third_set => 'super_tiebreak', p_golden_point => true, p_time_limit => 90) $$,
  'P0001', 'invalid_input', 'and fits in the time planned for a match');

select * from finish();
rollback;
