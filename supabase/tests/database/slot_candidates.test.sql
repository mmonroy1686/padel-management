begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(6);

-- The slot: a week from today at 20:00 (same weekday as today), court 1.
-- Bruno is usually free that weekday at night.
insert into public.player_availability (user_id, weekday, band)
values ('00000000-0000-0000-0000-0000000000b1', extract(dow from test_helpers.today())::smallint, 'night');
-- Hugo played that weekday at 20:00 a week ago (counts) and at 21:30 two weeks ago (90 minutes off: does not),
-- and prefers court 1.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(-7, '20:00', 90), '00000000-0000-0000-0000-0000000000a3');
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(-14, '21:30', 90), '00000000-0000-0000-0000-0000000000a3');
insert into public.player_preferred_courts (user_id, court_id)
values ('00000000-0000-0000-0000-0000000000a3', 'c0000000-0000-0000-0000-000000000001');
-- Gabi played a confirmed match that weekday at 20:00 a week ago.
call test_helpers.make_match('e3000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(-7, '20:00', 90), array['00000000-0000-0000-0000-0000000000a2', null, null, null]::uuid[]);
call test_helpers.hold_court('e3000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001');
-- Iván is usually free then too, but he has a booking at that time.
insert into public.player_availability (user_id, weekday, band)
values ('00000000-0000-0000-0000-0000000000a4', extract(dow from test_helpers.today())::smallint, 'night');
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(7, '20:00', 90), '00000000-0000-0000-0000-0000000000a4');
-- Juli is usually free then too, but her profile is private.
update public.profiles set is_public = false where id = '00000000-0000-0000-0000-0000000000a5';
insert into public.player_availability (user_id, weekday, band)
values ('00000000-0000-0000-0000-0000000000a5', extract(dow from test_helpers.today())::smallint, 'night');
-- Ana has no reason to be there. Carla and Dani (staff) have no category.

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select results_eq(
  $$ select display_name, category::int, side::text, gender::text, times_played, usually_free, prefers_court, score
     from public.slot_candidates('c0000000-0000-0000-0000-000000000001', test_helpers.at(7, '20:00')) $$,
  $$ values ('Bruno', 6, 'backhand', 'male', 0, true, false, 20),
            ('Hugo', 4, 'drive', 'male', 1, false, true, 13),
            ('Gabi', 5, 'both', 'female', 1, false, false, 5) $$,
  'free members with a reason, best first; never the busy, the private or the ones without a reason');
select throws_ok(
  $$ select * from public.slot_candidates('c0000000-0000-0000-0000-000000000001', test_helpers.at(7, '20:15')) $$,
  'P0001', 'not_aligned', 'only a slot of the grid');
select throws_ok(
  $$ select * from public.slot_candidates('c0000000-0000-0000-0000-00000000dead', test_helpers.at(7, '20:00')) $$,
  'P0001', 'not_found', 'only an active court');

-- Ana, a player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select * from public.slot_candidates('c0000000-0000-0000-0000-000000000001', test_helpers.at(7, '20:00')) $$,
  'P0001', 'forbidden', 'only staff look at who could play');

reset role;
select ok(not has_function_privilege('anon', 'public.slot_candidates(uuid, timestamptz)', 'execute'),
  'anon cannot ask');
select is(
  (select proargnames from pg_proc where proname = 'slot_candidates'),
  array['p_court_id', 'p_starts_at', 'player_id', 'display_name', 'category', 'side', 'gender', 'times_played',
        'usually_free', 'prefers_court', 'score'],
  'the answer carries names and reasons, never the availability or history rows');

select * from finish();
rollback;
