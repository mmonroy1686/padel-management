begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(15);

-- Omar joins the club by declaring his category.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';

select lives_ok(
  $$ select public.set_my_category('a0000000-0000-0000-0000-000000000001', 4) $$,
  'someone new joins the club by declaring a category');
select results_eq(
  $$ select role::text, category::int, category_validated from public.club_members
     where user_id = '00000000-0000-0000-0000-0000000000f1' $$,
  $$ values ('player', 4, false) $$,
  'he joins as a player, with the category pending validation');

-- Ana, validated category 5
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.set_my_category('a0000000-0000-0000-0000-000000000001', 3) $$,
  'a player changes her category');
select results_eq(
  $$ select category::int, category_validated from public.club_members
     where user_id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values (3, false) $$,
  'changing the category sends it back to validation');
select throws_ok(
  $$ select public.set_my_category('a0000000-0000-0000-0000-000000000001', 9) $$,
  'P0001', 'invalid_input', 'categories go from 1 to 8');
select throws_ok(
  $$ select public.validate_category('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 6) $$,
  'P0001', 'forbidden', 'players cannot validate categories');
select throws_ok(
  $$ select public.set_member_role('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'reception') $$,
  'P0001', 'forbidden', 'players cannot change roles');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.validate_category('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 6) $$,
  'reception validates categories');
select results_eq(
  $$ select category::int, category_validated from public.club_members
     where user_id = '00000000-0000-0000-0000-0000000000b1' $$,
  $$ values (6, true) $$,
  'the category is now validated');
select throws_ok(
  $$ select public.set_member_role('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'reception') $$,
  'P0001', 'forbidden', 'only admins change roles');

-- Dani, admin
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select lives_ok(
  $$ select public.set_member_role('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'reception') $$,
  'an admin changes a role');
select is(
  (select role::text from public.club_members where user_id = '00000000-0000-0000-0000-0000000000b1'), 'reception',
  'the new role is stored');
select throws_ok(
  $$ select public.set_member_role('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'player') $$,
  'P0001', 'forbidden', 'an admin cannot change their own role');
select throws_ok(
  $$ select public.set_member_role('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000dead', 'player') $$,
  'P0001', 'not_found', 'the member has to exist');
select throws_ok(
  $$ select public.validate_category('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 0) $$,
  'P0001', 'invalid_input', 'validated categories go from 1 to 8 too');

select * from finish();
rollback;
