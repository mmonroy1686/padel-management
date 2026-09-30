begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(13);

-- S: a week from today at 20:00 (same weekday as today), court 1, mixed 4th to 6th; Ana on spot 1.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(7, '20:00', 90), array['00000000-0000-0000-0000-0000000000a1', null, null, null]::uuid[],
  'mixed', 4, 6);
-- S2: a confirmed match, nothing to suggest.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(8, '20:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4']::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002');

-- Bruno is usually free on that weekday at night.
insert into public.player_availability (user_id, weekday, band)
values ('00000000-0000-0000-0000-0000000000b1', extract(dow from test_helpers.today())::smallint, 'night');
-- Hugo played there a week ago at 20:00 and prefers court 1.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(-7, '20:00', 90), '00000000-0000-0000-0000-0000000000a3');
insert into public.player_preferred_courts (user_id, court_id)
values ('00000000-0000-0000-0000-0000000000a3', 'c0000000-0000-0000-0000-000000000001');
-- Iván would fit and is usually free, but he has a booking at that time.
insert into public.player_availability (user_id, weekday, band)
values ('00000000-0000-0000-0000-0000000000a4', extract(dow from test_helpers.today())::smallint, 'night');
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(7, '20:00', 90), '00000000-0000-0000-0000-0000000000a4');
-- Juli would fit and is usually free, but her profile is private.
update public.profiles set is_public = false where id = '00000000-0000-0000-0000-0000000000a5';
insert into public.player_availability (user_id, weekday, band)
values ('00000000-0000-0000-0000-0000000000a5', extract(dow from test_helpers.today())::smallint, 'night');
-- Gabi fits but has no history and no availability that weekday: no reason to suggest her for S.
-- S3: tomorrow at 20:00, Ana on spot 1; Gabi is usually free tomorrow at night.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(1, '20:00', 90), array['00000000-0000-0000-0000-0000000000a1', null, null, null]::uuid[]);
insert into public.player_availability (user_id, weekday, band)
values ('00000000-0000-0000-0000-0000000000a2', extract(dow from test_helpers.today() + 1)::smallint, 'night');

set local role authenticated;

-- Ana, in the match
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select results_eq(
  $$ select display_name, spot::int, exact_side, times_played, usually_free, prefers_court, score
     from public.match_suggestions('e1000000-0000-0000-0000-000000000001') $$,
  $$ values ('Bruno', 2, true, 0, true, false, 50), ('Hugo', 3, true, 1, false, true, 43) $$,
  'members who fit a free spot, are free and have a reason, best first');
select is_empty(
  $$ select * from public.match_suggestions('e1000000-0000-0000-0000-000000000002') $$,
  'a confirmed match has no suggestions');
select throws_ok(
  $$ select * from public.match_suggestions('e1000000-0000-0000-0000-00000000dead') $$,
  'P0001', 'not_found', 'the match has to exist');

-- Juli, member outside the match
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
select throws_ok(
  $$ select * from public.match_suggestions('e1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'only the players of the match and staff ask for suggestions');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select is((select count(*)::int from public.match_suggestions('e1000000-0000-0000-0000-000000000001')), 2,
  'staff get them too');

-- Anonymous visitor
set local role anon;
select throws_ok(
  $$ select * from public.match_suggestions('e1000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'anon cannot ask for suggestions');

-- Past its closing time a forming match takes nobody (join_match says match_closed): no suggestions.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select results_eq(
  $$ select display_name from public.match_suggestions('e1000000-0000-0000-0000-000000000003') $$,
  $$ values ('Gabi') $$,
  'before its closing time the match gets suggestions');
reset role;
update public.clubs set match_close_hours = 48 where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select is_empty(
  $$ select * from public.match_suggestions('e1000000-0000-0000-0000-000000000003') $$,
  'past its closing time the match has no suggestions');
reset role;
update public.clubs set match_close_hours = 3 where id = 'a0000000-0000-0000-0000-000000000001';

-- Hugo, now reception: staff outside the match never get themselves as a suggestion.
update public.club_members set role = 'reception' where user_id = '00000000-0000-0000-0000-0000000000a3';
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';
select results_eq(
  $$ select display_name from public.match_suggestions('e1000000-0000-0000-0000-000000000001') $$,
  $$ values ('Bruno') $$,
  'the one asking is never suggested');

reset role;
select is(
  (select proargnames from pg_proc where proname = 'match_suggestions'),
  array['p_match_id', 'player_id', 'display_name', 'side', 'category', 'spot', 'exact_side', 'times_played',
        'usually_free', 'prefers_court', 'score'],
  'the answer carries names and reasons, never the availability or history rows');

-- Same split as dayBandOf in lib/domain/availability.ts.
select is(private.day_band_of('12:59'), 'morning'::public.day_band, 'before 13:00 is morning');
select is(private.day_band_of('13:00'), 'afternoon'::public.day_band, 'from 13:00 is afternoon');
select is(private.day_band_of('18:00'), 'night'::public.day_band, 'from 18:00 is night');

select * from finish();
rollback;
