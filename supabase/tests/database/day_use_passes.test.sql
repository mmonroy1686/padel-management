begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
select plan(42);

-- P1: every day, all day, for 2 people. P2: only on the weekday of today + 3. P3: inactive.
-- P4: today's hours are over (00:00 to 00:01). P5: every day, all day, for 30.
call test_helpers.make_product('d0000000-0000-0000-0000-000000000001', 'Day use completo',
  p_from => '00:00', p_to => '24:00', p_capacity => 2);
call test_helpers.make_product('d0000000-0000-0000-0000-000000000002', 'Pileta',
  p_weekdays => array[extract(dow from test_helpers.today() + 3)::smallint], p_from => '00:00', p_to => '24:00');
call test_helpers.make_product('d0000000-0000-0000-0000-000000000003', 'Viejo', p_active => false);
call test_helpers.make_product('d0000000-0000-0000-0000-000000000004', 'Madrugada', p_from => '00:00', p_to => '00:01');
call test_helpers.make_product('d0000000-0000-0000-0000-000000000005', 'Pileta libre', p_from => '00:00', p_to => '24:00');
-- Juli bought P1 for day 5; Hugo bought P1 for yesterday and never came; Iván is in today (P5).
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 5,
  '00000000-0000-0000-0000-0000000000a5');
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', -1,
  '00000000-0000-0000-0000-0000000000a3');
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000005', 0,
  '00000000-0000-0000-0000-0000000000a4', 'inside');

set local role authenticated;

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 1) $$,
  'a member buys a pass');
select results_eq(
  $$ select status::text, source::text, price, discount_percent::int, total, code ~ '^DU-[0-9]{6}$', used_reward
     from public.day_use_passes where player_id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('bought', 'online', 450, 0, 450, true, false) $$,
  'bought online at the full price, with its code');
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 1) $$,
  'P0001', 'already_has_pass', 'the same pass once per day');
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000002', test_helpers.today() + 1) $$,
  'P0001', 'day_use_closed', 'not on a day the pass does not run');
select lives_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000002', test_helpers.today() + 3) $$,
  'on its day it sells');
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 15) $$,
  'P0001', 'outside_window', 'not beyond the booking window');
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() - 1) $$,
  'P0001', 'in_the_past', 'not for a day that passed');
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000004', test_helpers.today()) $$,
  'P0001', 'in_the_past', 'not once today''s hours are over');
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000003', test_helpers.today() + 1) $$,
  'P0001', 'day_use_closed', 'an inactive pass is not sold');

-- Bruno and Gabi want P1 for tomorrow too: there is room for two.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select lives_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 1) $$,
  'the second one gets in');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 1) $$,
  'P0001', 'day_use_full', 'no room for a third');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 2) $$,
  'P0001', 'forbidden', 'only members buy passes');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.sell_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 2,
       p_guest_name => ' Pepe ') $$,
  'reception sells to someone without an account');
select results_eq(
  $$ select guest_name, source::text, player_id, created_by from public.day_use_passes where guest_name = 'Pepe' $$,
  $$ values ('Pepe', 'reception', null::uuid, '00000000-0000-0000-0000-0000000000c1'::uuid) $$,
  'with the name trimmed, sold at reception');
select throws_ok(
  $$ select public.sell_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 2) $$,
  'P0001', 'invalid_input', 'a pass needs a member or a name');
select throws_ok(
  $$ select public.sell_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 2,
       p_player_id => '00000000-0000-0000-0000-0000000000f1') $$,
  'P0001', 'invalid_input', 'only to members of the club');
select lives_ok(
  $$ select public.sell_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today(),
       p_player_id => '00000000-0000-0000-0000-0000000000a2') $$,
  'reception sells to a member');
select lives_ok(
  $$ select public.check_in_day_use(test_helpers.pass_of('00000000-0000-0000-0000-0000000000a2', 0)) $$,
  'reception checks in today''s pass');
select results_eq(
  $$ select status::text, checked_in_by from public.day_use_passes
     where player_id = '00000000-0000-0000-0000-0000000000a2' and on_date = test_helpers.today() $$,
  $$ values ('inside', '00000000-0000-0000-0000-0000000000c1'::uuid) $$,
  'she is inside, and reception is recorded');
select throws_ok(
  $$ select public.check_in_day_use(test_helpers.pass_of('00000000-0000-0000-0000-0000000000a2', 0)) $$,
  'P0001', 'already_checked_in', 'a pass is checked in once');
select throws_ok(
  $$ select public.check_in_day_use(test_helpers.pass_of('00000000-0000-0000-0000-0000000000a1', 1)) $$,
  'P0001', 'not_today', 'only on the day of the pass');
select throws_ok(
  $$ select public.cancel_day_use(test_helpers.pass_of('00000000-0000-0000-0000-0000000000a2', 0)) $$,
  'P0001', 'already_checked_in', 'a pass is not cancelled after check-in');

-- Ana cancels hers: her spot is free again.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.cancel_day_use(test_helpers.pass_of('00000000-0000-0000-0000-0000000000a1', 1)) $$,
  'a player cancels her pass before check-in');
select results_eq(
  $$ select status::text, cancelled_by from public.day_use_passes
     where player_id = '00000000-0000-0000-0000-0000000000a1' and on_date = test_helpers.today() + 1 $$,
  $$ values ('cancelled', '00000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'it is cancelled, by her');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 1) $$,
  'her spot is free for someone else');
select throws_ok(
  $$ select public.cancel_day_use('dd000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'a player cancels only her own pass');
select throws_ok(
  $$ select public.check_in_day_use('dd000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'players do not check in');

-- Hugo's pass was for yesterday.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';
select throws_ok(
  $$ select public.cancel_day_use('dd000000-0000-0000-0000-000000000002') $$,
  'P0001', 'in_the_past', 'a player does not cancel a pass of a day that passed');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok($$ select public.cancel_day_use('dd000000-0000-0000-0000-000000000002') $$,
  'reception cancels any pass not checked in');

-- Iván hides; reception sells P5 to a guest and checks her in.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a4", "role": "authenticated"}';
select lives_ok($$ select public.set_show_in_club(false) $$, 'a player hides from "Ya están en el club"');
select is((select show_in_club from public.profiles where id = '00000000-0000-0000-0000-0000000000a4'), false,
  'and it is saved');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select public.sell_day_use('d0000000-0000-0000-0000-000000000005', test_helpers.today(), p_guest_name => 'Rodríguez');
select public.check_in_day_use((select id from public.day_use_passes where guest_name = 'Rodríguez'));

-- Ana, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select results_eq(
  $$ select name, product_name from public.day_use_inside('a0000000-0000-0000-0000-000000000001', test_helpers.today()) $$,
  $$ values ('Gabi', 'Day use completo') $$,
  'players see who is in, without hidden players or guests');
select results_eq(
  $$ select s.on_date - test_helpers.today(), s.sold, s.inside
     from public.day_use_sold('a0000000-0000-0000-0000-000000000001', test_helpers.today(), test_helpers.today() + 3) s
     where s.product_id = 'd0000000-0000-0000-0000-000000000001' order by s.on_date $$,
  $$ values (0, 1, 1), (1, 2, 0), (2, 1, 0) $$,
  'and how many passes are sold and in, per pass and day, cancelled ones left out');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select results_eq(
  $$ select name from public.day_use_inside('a0000000-0000-0000-0000-000000000001', test_helpers.today()) order by name $$,
  $$ values ('Gabi'), ('Iván'), ('Rodríguez') $$,
  'staff see everyone who is in');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select throws_ok(
  $$ select * from public.day_use_inside('a0000000-0000-0000-0000-000000000001', test_helpers.today()) $$,
  'P0001', 'forbidden', 'non-members do not see who is in');
select throws_ok(
  $$ select * from public.day_use_sold('a0000000-0000-0000-0000-000000000001', test_helpers.today(), test_helpers.today()) $$,
  'P0001', 'forbidden', 'nor how many passes are sold');

-- Eva, admin of club B, on club T's rows.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok($$ select public.check_in_day_use('dd000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'staff of another club cannot check in');
select throws_ok($$ select public.cancel_day_use('dd000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'nor cancel');
select throws_ok(
  $$ select public.sell_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 4, p_guest_name => 'X') $$,
  'P0001', 'forbidden', 'nor sell');
select throws_ok(
  $$ select * from public.day_use_inside('a0000000-0000-0000-0000-000000000001', test_helpers.today()) $$,
  'P0001', 'forbidden', 'nor see who is in');

-- Anonymous visitor
set local role anon;
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', current_date) $$,
  '42501', null, 'anon cannot call buy_day_use');
select throws_ok($$ select public.set_show_in_club(true) $$, '42501', null, 'anon cannot call set_show_in_club');

select * from finish();
rollback;
