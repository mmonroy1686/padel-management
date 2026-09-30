begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
select plan(18);

-- Every 3 check-ins, 50 % off the next day use; stamps last 6 months. Ana came twice.
update public.clubs
   set loyalty_enabled = true, loyalty_every = 3, loyalty_discount_percent = 50, loyalty_expiry_months = 6
 where id = 'a0000000-0000-0000-0000-000000000001';
call test_helpers.make_product('d0000000-0000-0000-0000-000000000001', 'Day use completo',
  p_from => '00:00', p_to => '24:00');
call test_helpers.add_visits('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 2, 1);

select results_eq(
  $$ select * from private.loyalty_of('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1') $$,
  $$ values (2, 0, 0, 0, 2) $$,
  'two check-ins are two stamps and no reward yet');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, true) $$,
  'P0001', 'no_reward', 'no reward before the stamps are complete');

reset role;
call test_helpers.add_visits('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 1, 3);
select results_eq(
  $$ select * from private.loyalty_of('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1') $$,
  $$ values (3, 1, 0, 1, 0) $$,
  'the third stamp earns a reward');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, true) $$,
  'she buys with her reward');
select results_eq(
  $$ select discount_percent::int, total, used_reward from public.day_use_passes
     where player_id = '00000000-0000-0000-0000-0000000000a1' and on_date = test_helpers.today() + 1 $$,
  $$ values (50, 225, true) $$,
  'the reward takes the club''s discount off');

reset role;
select results_eq(
  $$ select * from private.loyalty_of('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1') $$,
  $$ values (3, 1, 1, 0, 0) $$,
  'and the reward is used');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 2, true) $$,
  'P0001', 'no_reward', 'a reward is used once');
select lives_ok(
  $$ select public.cancel_day_use(test_helpers.pass_of('00000000-0000-0000-0000-0000000000a1', 1)) $$,
  'she cancels the pass she bought with it');

reset role;
select is(
  (select available from private.loyalty_of('a0000000-0000-0000-0000-000000000001',
                                            '00000000-0000-0000-0000-0000000000a1')),
  1, 'cancelling gives the reward back');

-- A day use with a reward, ten days ago: it uses the reward and adds no stamp.
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000001', -10,
  '00000000-0000-0000-0000-0000000000a1', 'inside', true);
select results_eq(
  $$ select * from private.loyalty_of('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1') $$,
  $$ values (3, 1, 1, 0, 0) $$,
  'a day use with a reward does not add a stamp');

-- Three check-ins about 200 days ago, older than 6 months.
call test_helpers.add_visits('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 3, 200);
select is(
  (select stamps from private.loyalty_of('a0000000-0000-0000-0000-000000000001',
                                         '00000000-0000-0000-0000-0000000000a1')),
  3, 'check-ins older than the expiry do not count');

update public.clubs set loyalty_expiry_months = null where id = 'a0000000-0000-0000-0000-000000000001';
select results_eq(
  $$ select * from private.loyalty_of('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1') $$,
  $$ values (6, 2, 1, 1, 0) $$,
  'without expiry every check-in counts');

update public.clubs set loyalty_enabled = false where id = 'a0000000-0000-0000-0000-000000000001';
select results_eq(
  $$ select * from private.loyalty_of('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1') $$,
  $$ values (0, 0, 0, 0, 0) $$,
  'with stamps off there are no rewards');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 3, true) $$,
  'P0001', 'no_reward', 'nobody uses a reward while stamps are off');

reset role;
update public.clubs set loyalty_enabled = true where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  $$ select public.sell_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 3,
       p_guest_name => 'Pepe', p_use_reward => true) $$,
  'P0001', 'invalid_input', 'someone without an account has no rewards');
select lives_ok(
  $$ select public.sell_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 3,
       p_player_id => '00000000-0000-0000-0000-0000000000a1', p_use_reward => true) $$,
  'reception applies her reward when selling');
select results_eq(
  $$ select source::text, discount_percent::int from public.day_use_passes
     where player_id = '00000000-0000-0000-0000-0000000000a1' and on_date = test_helpers.today() + 3 $$,
  $$ values ('reception', 50) $$,
  'sold at reception with the discount');

-- Bruno never came.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, true) $$,
  'P0001', 'no_reward', 'a player without stamps has no reward');

select * from finish();
rollback;
