begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(9);

-- Omar is not a member yet: the welcome form saves his profile and joins him in one go.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';

select lives_ok(
  $$ select public.save_my_profile('a0000000-0000-0000-0000-000000000001', '  Omar Pérez ', 'backhand', 'left', 'male', true, 4) $$,
  'a new player saves his profile and joins the club');
select results_eq(
  $$ select p.display_name, p.side::text, p.hand::text, m.role::text, m.category::int, m.category_validated
     from public.profiles p join public.club_members m on m.user_id = p.id
     where p.id = '00000000-0000-0000-0000-0000000000f1' $$,
  $$ values ('Omar Pérez', 'backhand', 'left', 'player', 4, false) $$,
  'profile and membership are saved together, the category pending validation');

-- Ana, validated category 5.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.save_my_profile('a0000000-0000-0000-0000-000000000001', 'Ana P', 'drive', 'right', 'female', false, 5) $$,
  'a player edits her profile keeping her category');
select results_eq(
  $$ select m.category::int, m.category_validated, p.is_public from public.club_members m
     join public.profiles p on p.id = m.user_id where m.user_id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values (5, true, false) $$,
  'keeping the category keeps it validated');
select lives_ok(
  $$ select public.save_my_profile('a0000000-0000-0000-0000-000000000001', 'Ana P', 'drive', 'right', 'female', false, 3) $$,
  'a player changes her category');
select is(
  (select category_validated from public.club_members where user_id = '00000000-0000-0000-0000-0000000000a1'), false,
  'a new category goes back to validation');

select throws_ok(
  $$ select public.save_my_profile('a0000000-0000-0000-0000-000000000001', 'Ana Nueva', 'drive', 'right', 'female', true, 9) $$,
  'P0001', 'invalid_input', 'categories go from 1 to 8');
select throws_ok(
  $$ select public.save_my_profile('a0000000-0000-0000-0000-000000000001', '   ', 'drive', 'right', 'female', true, 5) $$,
  'P0001', 'invalid_input', 'the name cannot be blank');

reset role;
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'Ana P',
  'a failed save changes nothing');

select * from finish();
rollback;
