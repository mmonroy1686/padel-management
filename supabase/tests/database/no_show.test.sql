begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(17);

-- Played (started an hour and a half ago), still to come, and cancelled, all Ana's.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  tstzrange(now() - interval '90 minutes', now(), '[)'), '00000000-0000-0000-0000-0000000000a1');
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  tstzrange(now() + interval '1 day', now() + interval '1 day 90 minutes', '[)'), '00000000-0000-0000-0000-0000000000a1');
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002',
  tstzrange(now() - interval '3 hours', now() - interval '90 minutes', '[)'), '00000000-0000-0000-0000-0000000000a1');
update public.bookings set status = 'cancelled', cancelled_at = now() - interval '4 hours', occupancy_id = null
 where id = 'b0000000-0000-0000-0000-000000000003';
delete from public.court_occupancy o where not exists (select 1 from public.bookings b where b.occupancy_id = o.id) and o.kind = 'booking';

-- An open match's booking (the FK skipped on purpose: only match_id matters here).
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002',
  tstzrange(now() - interval '6 hours', now() - interval '270 minutes', '[)'), '00000000-0000-0000-0000-0000000000a1');
set local session_replication_role = replica;
update public.bookings set match_id = gen_random_uuid(), player_id = null where id = 'b0000000-0000-0000-0000-000000000004';
set local session_replication_role = origin;

-- Omar is reception of another club.
insert into public.clubs (id, slug, name) values ('a0000000-0000-0000-0000-000000000002', 'otro-club', 'Otro');
insert into public.club_members (club_id, user_id, role)
values ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', 'reception');

select throws_ok(
  $$ update public.bookings set no_show_at = null, no_show_by = '00000000-0000-0000-0000-0000000000c1'
      where id = 'b0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'who marked it goes with when');

set local role authenticated;

-- Ana, the player: not hers to mark.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok($$ select public.mark_no_show('b0000000-0000-0000-0000-000000000001', true) $$,
  'P0001', 'forbidden', 'a player does not mark no-shows');

-- Omar, reception elsewhere.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select throws_ok($$ select public.mark_no_show('b0000000-0000-0000-0000-000000000001', true) $$,
  'P0001', 'forbidden', 'nor the staff of another club');

-- Carla, reception of club T.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok($$ select public.mark_no_show('b0000000-0000-0000-0000-000000000001', true) $$,
  'reception marks a booking that already started');
select results_eq(
  $$ select no_show_at is not null, no_show_by, status::text from public.bookings where id = 'b0000000-0000-0000-0000-000000000001' $$,
  $$ values (true, '00000000-0000-0000-0000-0000000000c1'::uuid, 'confirmed') $$,
  'marked by her, and still a confirmed booking');
select is(
  (select count(*)::int from public.court_occupancy o join public.bookings b on b.occupancy_id = o.id
    where b.id = 'b0000000-0000-0000-0000-000000000001'),
  1, 'the court stays taken');

-- Marking again keeps the first time.
create temporary table first_mark on commit drop as
  select no_show_at from public.bookings where id = 'b0000000-0000-0000-0000-000000000001';
select lives_ok($$ select public.mark_no_show('b0000000-0000-0000-0000-000000000001', true) $$, 'twice is fine');
select is(
  (select no_show_at from public.bookings where id = 'b0000000-0000-0000-0000-000000000001'),
  (select no_show_at from first_mark), 'and keeps the first mark');

select throws_ok($$ select public.mark_no_show('b0000000-0000-0000-0000-000000000002', true) $$,
  'P0001', 'invalid_state', 'not before it starts');
select throws_ok($$ select public.mark_no_show('b0000000-0000-0000-0000-000000000004', true) $$,
  'P0001', 'invalid_state', 'nor on an open match: its players come one by one');
select throws_ok($$ select public.mark_no_show('b0000000-0000-0000-0000-0000000000ff', true) $$,
  'P0001', 'not_found', 'the booking exists');
select throws_ok($$ select public.mark_no_show('b0000000-0000-0000-0000-000000000001', null) $$,
  'P0001', 'invalid_input', 'it says which way');
select throws_ok($$ select public.mark_no_show('b0000000-0000-0000-0000-000000000003', true) $$,
  'P0001', 'invalid_state', 'nor on a cancelled booking');

-- Dani, admin: takes it back.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select lives_ok($$ select public.mark_no_show('b0000000-0000-0000-0000-000000000001', false) $$, 'the admin undoes it');
select results_eq(
  $$ select no_show_at, no_show_by from public.bookings where id = 'b0000000-0000-0000-0000-000000000001' $$,
  $$ values (null::timestamptz, null::uuid) $$,
  'and nothing is left');
select lives_ok($$ select public.mark_no_show('b0000000-0000-0000-0000-000000000001', false) $$,
  'undoing an unmarked booking is no change');
select throws_ok(
  $$ update public.bookings set no_show_at = now() where id = 'b0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'only through mark_no_show');

select * from finish();
rollback;
