begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(27);

-- Club T (test-club): Ana (a1) and Bruno (b1) players, Carla (c1) reception, Dani (d1) admin. Omar (f1) runs the
-- platform.
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000f1');
insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-0000000000f1', 'Omar')
on conflict (id) do nothing;

select is(
  (select trial_ends_on - (now() at time zone 'America/Montevideo')::date from public.club_accounts
    where club_id = 'a0000000-0000-0000-0000-000000000001'),
  60, 'a club starts a 60-day trial');

set local role authenticated;

-- Dani, a club admin: none of this is hers.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select throws_ok($$ select * from public.club_accounts $$, '42501', null, 'nobody reads club_accounts');
select throws_ok($$ select * from public.platform_support_sessions $$, '42501', null, 'nor the support sessions');
select throws_ok($$ select * from public.platform_club_weeks('a0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'a club admin does not see the weeks');
select throws_ok($$ select public.platform_club_account('a0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'nor the account');
select throws_ok(
  $$ select public.set_club_account_status('a0000000-0000-0000-0000-000000000001', 'active', null) $$,
  'P0001', 'forbidden', 'nor changes the status');
select throws_ok(
  $$ select public.save_club_account_contact('a0000000-0000-0000-0000-000000000001', 'x', '', '', '') $$,
  'P0001', 'forbidden', 'nor the contact');
select throws_ok($$ select public.join_club_as_support('a0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'nor joins as support');

-- Omar.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select lives_ok(
  $$ select public.set_club_account_status('a0000000-0000-0000-0000-000000000001', 'active', '2027-03-01') $$,
  'Omar moves the club to active');
select results_eq(
  $$ select status::text, trial_ends_on from public.platform_club_account('a0000000-0000-0000-0000-000000000001') $$,
  $$ values ('active', date '2027-03-01') $$, 'with the end of the trial he chose');
select throws_ok(
  $$ select public.set_club_account_status('a0000000-0000-0000-0000-000000000001', null, null) $$,
  'P0001', 'invalid_status', 'a status is required');
select lives_ok(
  $$ select public.save_club_account_contact('a0000000-0000-0000-0000-000000000001', ' Raúl ', '099 123', ' Raul@Club.UY ',
       'Quiere probar torneos') $$,
  'he saves the owner and a note');
select results_eq(
  $$ select owner_name, owner_phone, owner_email, notes from public.platform_club_account('a0000000-0000-0000-0000-000000000001') $$,
  $$ values ('Raúl', '099 123', 'raul@club.uy', 'Quiere probar torneos') $$, 'trimmed, the email lowercased');
select throws_ok(
  $$ select public.save_club_account_contact('a0000000-0000-0000-0000-000000000001', '', '', 'no-es-mail', '') $$,
  'P0001', 'invalid_email', 'the email is checked');

-- Milestones: the club has courts and prices, reception, one online booking and one from reception.
reset role;
-- Today, so they fall in the current week whatever day the test runs.
call test_helpers.make_booking('b4000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(0, '08:00', 90), '00000000-0000-0000-0000-0000000000a1');
call test_helpers.make_booking('b4000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(0, '08:00', 90), '00000000-0000-0000-0000-0000000000b1');
update public.bookings set source = 'reception' where id = 'b4000000-0000-0000-0000-000000000002';
set local role authenticated;
select results_eq(
  $$ select status::text, players, staff, bookings_last_week, online_last_week, courts_and_prices_at is not null,
            reception_joined_at is not null, first_online_booking_at is not null, first_reception_booking_at is not null,
            twentieth_player_at is null, first_payment_at is null, is_support
     from public.platform_clubs() where slug = 'test-club' $$,
  $$ values ('active', 2, 2, 2, 1, true, true, true, true, true, true, false) $$,
  'the list brings the status and the milestones');
select results_eq(
  $$ select bookings_online, bookings_reception from public.platform_club_weeks('a0000000-0000-0000-0000-000000000001', 2)
     order by week desc limit 1 $$,
  $$ values (1, 1) $$, 'the weeks count the bookings by source');
select is((select count(*)::int from public.platform_club_weeks('a0000000-0000-0000-0000-000000000001', 3)), 3,
  'one row per week asked');

-- Support: Omar was not a member; he joins as admin and Dani sees him as support.
select lives_ok($$ select public.join_club_as_support('a0000000-0000-0000-0000-000000000001') $$, 'Omar joins as support');
select lives_ok($$ select public.join_club_as_support('a0000000-0000-0000-0000-000000000001') $$, 'twice is fine');
select results_eq(
  $$ select staff, is_support from public.platform_clubs() where slug = 'test-club' $$,
  $$ values (2, true) $$, 'support does not count as staff');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select results_eq(
  $$ select role::text, support from public.club_staff('a0000000-0000-0000-0000-000000000001')
     where user_id = '00000000-0000-0000-0000-0000000000f1' $$,
  $$ values ('admin', true) $$, 'the club sees him as support');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select lives_ok($$ select public.leave_club_support('a0000000-0000-0000-0000-000000000001') $$, 'and he leaves');
reset role;
select is(
  (select count(*)::int from public.club_members
    where club_id = 'a0000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-0000000000f1'),
  0, 'without a membership, as before');
select results_eq(
  $$ select previous_role is null, ended_at is not null from public.platform_support_sessions
     where club_id = 'a0000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-0000000000f1' $$,
  $$ values (true, true) $$, 'the session is logged and closed');

-- A player of the club goes back to player.
update public.club_members set role = 'player' where user_id = '00000000-0000-0000-0000-0000000000f1';
insert into public.club_members (club_id, user_id, role)
values ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'player');
set local role authenticated;
select lives_ok($$ select public.join_club_as_support('a0000000-0000-0000-0000-000000000001') $$, 'a player joins');
select lives_ok($$ select public.leave_club_support('a0000000-0000-0000-0000-000000000001') $$, 'and leaves');
select throws_ok($$ select public.leave_club_support('a0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'not_support', 'leaving twice says so');

select finish();
rollback;
