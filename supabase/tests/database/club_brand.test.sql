begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
select plan(14);

-- Defaults: Rustic's amber and night green, following the device.
select results_eq(
  $$ select brand_primary, brand_background, color_mode::text from public.clubs
      where id = 'a0000000-0000-0000-0000-000000000001' $$,
  $$ values ('#FCB021', '#021716', 'system') $$,
  'a club starts with the amber, the night green and the device''s mode');
select throws_ok(
  $$ update public.clubs set brand_primary = '#fcb021' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'colors are stored in upper case only');
select throws_ok(
  $$ update public.clubs set brand_background = 'night' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'and only as #RRGGBB');
select ok(not has_function_privilege('anon', 'public.save_club_brand(uuid, text, text, public.club_color_mode)', 'execute'),
  'anon cannot save a brand');

set local role authenticated;

-- Dani, admin of club T
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select lives_ok(
  $$ select public.save_club_brand('a0000000-0000-0000-0000-000000000001', ' #e11d48 ', '#1a1a2e', 'dark') $$,
  'the admin saves the brand');
select results_eq(
  $$ select brand_primary, brand_background, color_mode::text from public.clubs
      where id = 'a0000000-0000-0000-0000-000000000001' $$,
  $$ values ('#E11D48', '#1A1A2E', 'dark') $$,
  'trimmed and in upper case');
select throws_ok(
  $$ select public.save_club_brand('a0000000-0000-0000-0000-000000000001', '#FFF', '#021716', 'system') $$,
  'P0001', 'invalid_color', 'a short hex is not a color');
select throws_ok(
  $$ select public.save_club_brand('a0000000-0000-0000-0000-000000000001', 'rojo', '#021716', 'system') $$,
  'P0001', 'invalid_color', 'nor a name');
select throws_ok(
  $$ select public.save_club_brand('a0000000-0000-0000-0000-000000000001', '#FCB021', '#GGGGGG', 'system') $$,
  'P0001', 'invalid_color', 'nor a hex with letters past F');
select throws_ok(
  $$ select public.save_club_brand('a0000000-0000-0000-0000-000000000002', '#FCB021', '#021716', 'system') $$,
  'P0001', 'forbidden', 'not the brand of another club');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  $$ select public.save_club_brand('a0000000-0000-0000-0000-000000000001', '#FCB021', '#021716', 'system') $$,
  'P0001', 'forbidden', 'reception cannot change the brand');

-- Ana, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.save_club_brand('a0000000-0000-0000-0000-000000000001', '#FCB021', '#021716', 'system') $$,
  'P0001', 'forbidden', 'nor a player');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  $$ select public.save_club_brand('a0000000-0000-0000-0000-000000000001', '#FCB021', '#021716', 'system') $$,
  'P0001', 'forbidden', 'nor the admin of another club');

reset role;
select results_eq(
  $$ select brand_primary, brand_background, color_mode::text from public.clubs
      where id = 'a0000000-0000-0000-0000-000000000001' $$,
  $$ values ('#E11D48', '#1A1A2E', 'dark') $$,
  'the club keeps what its admin saved');

select * from finish();
rollback;
