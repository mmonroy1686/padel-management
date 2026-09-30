begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
select plan(5);

update public.clubs
   set loyalty_enabled = true, loyalty_every = 5, loyalty_discount_percent = 100, loyalty_expiry_months = 6
 where id = 'a0000000-0000-0000-0000-000000000001';
call test_helpers.make_product('d1000000-0000-0000-0000-000000000001');

-- Ana: five stamps, the oldest already past the six months; the reward they earned, used the next
-- day; then five stamps more, still unused.
insert into public.day_use_passes (club_id, product_id, on_date, player_id, price, discount_percent, used_reward,
                                   code, status, source, checked_in_at, created_at)
select 'a0000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', test_helpers.today() - d,
       '00000000-0000-0000-0000-0000000000a1', 450, case when d = 171 then 100 else 0 end, d = 171,
       'DU-9' || lpad(d::text, 5, '0'), 'inside', 'online', now(), now() - make_interval(days => d)
from unnest(array[190, 175, 174, 173, 172, 171, 100, 99, 98, 97, 96]) as d;

select results_eq(
  $$ select stamps, earned, used, available, progress
     from private.loyalty_of('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1') $$,
  $$ values (5, 2, 1, 1, 0) $$,
  'a used reward takes its own stamps: an old one expiring does not take the next reward away');

-- Bruno: three stamps, one expired; nothing used yet.
call test_helpers.add_visits('d1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 2, 10);
insert into public.day_use_passes (club_id, product_id, on_date, player_id, price, code, status, source, checked_in_at)
values ('a0000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', test_helpers.today() - 200,
        '00000000-0000-0000-0000-0000000000b1', 450, 'DU-800200', 'inside', 'online', now());
select results_eq(
  $$ select stamps, available, progress
     from private.loyalty_of('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1') $$,
  $$ values (2, 0, 2) $$,
  'stamps older than the expiry do not count');

-- Gabi bought today's pass of a day use that already ended (00:00 to 00:01).
call test_helpers.make_product('d1000000-0000-0000-0000-000000000002', 'Madrugada', p_from => '00:00', p_to => '00:01');
call test_helpers.make_pass('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 0,
  '00000000-0000-0000-0000-0000000000a2');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select throws_ok(
  $$ select public.cancel_day_use('d2000000-0000-0000-0000-000000000001') $$,
  'P0001', 'in_the_past', 'a player cannot cancel a pass once its hours are over');

-- Carla, reception, still can (e.g. the player never came).
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.cancel_day_use('d2000000-0000-0000-0000-000000000001') $$,
  'reception can cancel it');
reset role;
select is((select status::text from public.day_use_passes where id = 'd2000000-0000-0000-0000-000000000001'),
  'cancelled', 'and it is cancelled');

select * from finish();
rollback;
