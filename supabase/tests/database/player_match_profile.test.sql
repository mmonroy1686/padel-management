begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(16);

select is((select match_close_hours::int from public.clubs where slug = 'test-club'), 3,
  'incomplete matches close 3 hours before by default');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'save_my_profile'),
  1, 'save_my_profile has a single signature, the one with gender');

-- Ana, player
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.save_my_profile('a0000000-0000-0000-0000-000000000001', 'Ana', 'drive', 'right', 'female', true, 5) $$,
  'a player saves her gender with the profile');
select is((select gender::text from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'female',
  'the gender is stored');
select throws_ok(
  $$ select public.save_my_profile('a0000000-0000-0000-0000-000000000001', 'Ana', 'drive', 'right', null, true, 5) $$,
  'P0001', 'invalid_input', 'gender is required');

select lives_ok(
  $$ select * from public.save_my_availability(array['1-night', '3-night', '6-morning', '1-night']) $$,
  'a player saves when she usually can play');
select results_eq(
  $$ select weekday::int, band::text from public.player_availability order by weekday, band $$,
  $$ values (1, 'night'), (3, 'night'), (6, 'morning') $$,
  'she reads her own bands, without duplicates');
select lives_ok(
  $$ select * from public.save_my_availability(array['2-afternoon']) $$,
  'saving again replaces the bands');
select results_eq(
  $$ select weekday::int, band::text from public.player_availability $$,
  $$ values (2, 'afternoon') $$,
  'only the new bands are left');
select throws_ok(
  $$ select * from public.save_my_availability(array['7-night']) $$,
  'P0001', 'invalid_input', 'weekdays go from 0 to 6 and bands are morning, afternoon or night');

select lives_ok(
  $$ select * from public.save_my_preferred_courts('a0000000-0000-0000-0000-000000000001',
       array['c0000000-0000-0000-0000-000000000002']::uuid[]) $$,
  'a player picks her preferred courts');
select throws_ok(
  $$ select * from public.save_my_preferred_courts('a0000000-0000-0000-0000-000000000001',
       array['c0000000-0000-0000-0000-00000000dead']::uuid[]) $$,
  'P0001', 'invalid_input', 'only active courts of the club');

-- Bruno cannot see Ana's lists.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select is(
  (select count(*)::int from public.player_availability) + (select count(*)::int from public.player_preferred_courts),
  0, 'nobody else reads a player''s availability or preferred courts');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select throws_ok(
  $$ select * from public.save_my_preferred_courts('a0000000-0000-0000-0000-000000000001',
       array['c0000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'P0001', 'forbidden', 'only members pick preferred courts of a club');

-- Anonymous visitor
set local role anon;
select throws_ok(
  $$ select * from public.save_my_availability(array['1-night']) $$,
  '42501', null, 'anon cannot call save_my_availability');

reset role;
select results_eq(
  $$ select court_id from public.player_preferred_courts where user_id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('c0000000-0000-0000-0000-000000000002'::uuid) $$,
  'the preferred court is stored');

select * from finish();
rollback;
