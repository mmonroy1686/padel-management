begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(17);

-- A: forming, day 3 10:00. B: confirmed, day 3 20:00, court 1. C: confirmed, day 4 20:00, court 2.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '10:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', null, null]::uuid[]);
call test_helpers.make_match('e1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '20:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4']::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001');
call test_helpers.make_match('e1000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(4, '20:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4']::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002');
-- D: forming, closes within the hour. E: lost a player, still holds court 2, also past closing.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001',
  tstzrange(now() + interval '1 hour', now() + interval '150 minutes'),
  array['00000000-0000-0000-0000-0000000000a1', null, null, null]::uuid[]);
call test_helpers.make_match('e1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002',
  tstzrange(now() + interval '2 hours', now() + interval '210 minutes'),
  array['00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4',
        '00000000-0000-0000-0000-0000000000b1', null]::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 1600, false);

set local role authenticated;

-- Bruno, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok($$ select public.cancel_match('e1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'players cannot cancel a match');
select throws_ok(
  $$ select public.remove_from_match('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1') $$,
  'P0001', 'forbidden', 'players cannot take others out');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.remove_from_match('e1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1') $$,
  'reception takes a player out of a confirmed match, with no notice period');
select results_eq(
  $$ select m.status::text, (select count(*)::int from public.match_slots s where s.match_id = m.id and s.player_id is not null)
     from public.open_matches m where m.id = 'e1000000-0000-0000-0000-000000000002' $$,
  $$ values ('forming', 3) $$,
  'the match looks for someone else');
select throws_ok(
  $$ select public.remove_from_match('e1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a5') $$,
  'P0001', 'not_found', 'only players of the match can be taken out');
select lives_ok($$ select public.cancel_match('e1000000-0000-0000-0000-000000000002', 'Lluvia') $$,
  'reception cancels a match');
select results_eq(
  $$ select m.status::text, m.cancel_reason, m.cancel_note, b.status::text
     from public.open_matches m join public.bookings b on b.id = m.booking_id
     where m.id = 'e1000000-0000-0000-0000-000000000002' $$,
  $$ values ('cancelled', 'by_club', 'Lluvia', 'cancelled') $$,
  'the match and its booking are cancelled, with the reason');
select is(
  (select count(*)::int from public.court_occupancy
   where court_id = 'c0000000-0000-0000-0000-000000000001' and starts_at = test_helpers.at(3, '20:00')),
  0, 'the court is free again');
select throws_ok($$ select public.cancel_match('e1000000-0000-0000-0000-000000000002') $$,
  'P0001', 'invalid_state', 'a cancelled match cannot be cancelled again');
select lives_ok(
  $$ select public.cancel_booking((select booking_id from public.open_matches where id = 'e1000000-0000-0000-0000-000000000003')) $$,
  'reception cancels a match booking from the grid');
select results_eq(
  $$ select status::text, cancel_reason from public.open_matches where id = 'e1000000-0000-0000-0000-000000000003' $$,
  $$ values ('cancelled', 'by_club') $$,
  'cancelling the booking cancels its match');

-- The job, as postgres.
reset role;
select is(public.close_matches(), 2, 'the job closes the forming matches that reached their closing time');
select results_eq(
  $$ select id, status::text, cancel_reason from public.open_matches
     where id in ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000004',
                  'e1000000-0000-0000-0000-000000000005')
     order by id $$,
  $$ values ('e1000000-0000-0000-0000-000000000001'::uuid, 'forming', null::text),
            ('e1000000-0000-0000-0000-000000000004'::uuid, 'cancelled', 'not_filled'),
            ('e1000000-0000-0000-0000-000000000005'::uuid, 'cancelled', 'not_filled') $$,
  'matches far from closing time are left alone');
select is((select status::text from public.bookings where match_id = 'e1000000-0000-0000-0000-000000000005'), 'cancelled',
  'a court held by a closed match is freed');

select ok(not has_function_privilege('authenticated', 'public.close_matches()', 'execute'),
  'only the job and the service role close matches');
select is((select count(*)::int from cron.job where jobname = 'close-open-matches'), 1,
  'pg_cron runs close_matches');
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in ('is_busy', 'match_fit', 'match_closes_at', 'book_match_court', 'cancel_match_row',
                         'free_match_slot')
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot execute the private match writers');

select * from finish();
rollback;
