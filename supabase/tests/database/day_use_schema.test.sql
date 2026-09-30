begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
select plan(28);

select has_table('public', 'day_use_products', 'day_use_products exists');
select has_table('public', 'day_use_overrides', 'day_use_overrides exists');
select has_table('public', 'day_use_passes', 'day_use_passes exists');

-- P runs every day; P3 blocks a court nobody else uses. Ana and Bruno bought P for tomorrow.
call test_helpers.make_product('d0000000-0000-0000-0000-000000000001');
insert into public.courts (id, club_id, name, sort_order) values
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Cancha 3', 3);
call test_helpers.make_product('d0000000-0000-0000-0000-000000000003', 'Con cancha',
  p_courts => array['c0000000-0000-0000-0000-000000000003']::uuid[]);
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 1,
  '00000000-0000-0000-0000-0000000000a1');
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 1,
  '00000000-0000-0000-0000-0000000000b1');
insert into public.day_use_overrides (club_id, product_id, on_date, enabled) values
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 2, false);

select throws_ok(
  $$ update public.day_use_passes set status = 'inside' where id = 'dd000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a pass inside has a check-in time');
select throws_ok(
  $$ insert into public.day_use_passes (club_id, product_id, on_date, player_id, guest_name, price, code, source)
     values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 3,
             '00000000-0000-0000-0000-0000000000a1', 'Ana', 450, 'DU-' || nextval('test_helpers.pass_code'), 'online') $$,
  '23514', null, 'a pass is for a member or a name');
select throws_ok(
  $$ insert into public.day_use_passes (club_id, product_id, on_date, guest_name, price, discount_percent, used_reward,
                                        code, source)
     values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 3,
             'Pepe', 450, 100, true, 'DU-' || nextval('test_helpers.pass_code'), 'reception') $$,
  '23514', null, 'only members use rewards');
select throws_ok(
  $$ insert into public.day_use_passes (club_id, product_id, on_date, player_id, price, code, source)
     values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 1,
             '00000000-0000-0000-0000-0000000000a1', 450, 'DU-' || nextval('test_helpers.pass_code'), 'online') $$,
  '23505', null, 'one active pass per member, pass and day');

update public.day_use_passes set status = 'cancelled', cancelled_at = now()
 where id = 'dd000000-0000-0000-0000-000000000001';
select lives_ok(
  $$ insert into public.day_use_passes (club_id, product_id, on_date, player_id, price, code, source)
     values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 1,
             '00000000-0000-0000-0000-0000000000a1', 450, 'DU-' || nextval('test_helpers.pass_code'), 'online') $$,
  'after cancelling she can buy it again');

insert into public.day_use_passes (id, club_id, product_id, on_date, player_id, price, discount_percent, used_reward,
                                   code, source)
values ('dd000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '00000000-0000-0000-0000-0000000000a2', 450,
        50, true, 'DU-' || nextval('test_helpers.pass_code'), 'online');
select is((select total from public.day_use_passes where id = 'dd000000-0000-0000-0000-000000000009'), 225,
  'the total takes the reward off');

select throws_ok(
  $$ insert into public.day_use_passes (club_id, product_id, on_date, player_id, price, code, source)
     values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 4,
             '00000000-0000-0000-0000-0000000000a3', 450, 'X-1', 'online') $$,
  '23514', null, 'a code is DU- and six digits');
select throws_ok(
  $$ insert into public.day_use_passes (club_id, product_id, on_date, player_id, price, code, source)
     select 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 4,
            '00000000-0000-0000-0000-0000000000a3', 450, code, 'online'
     from public.day_use_passes where id = 'dd000000-0000-0000-0000-000000000002' $$,
  '23505', null, 'a code is unique in the club');
select throws_ok(
  $$ insert into public.payments (club_id, method, amount, status)
     values ('a0000000-0000-0000-0000-000000000001', 'cash', 450, 'confirmed') $$,
  '23514', null, 'a payment is for a booking, an entry or a pass');

call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(5, '18:30', 90), '00000000-0000-0000-0000-0000000000a1', 1600);
select throws_ok(
  $$ insert into public.payments (club_id, booking_id, day_use_pass_id, method, amount, status)
     values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
             'dd000000-0000-0000-0000-000000000002', 'cash', 450, 'confirmed') $$,
  '23514', null, 'and only one of them');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, day_use_product_id)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'block',
             test_helpers.slot(9, '10:00', 60), 'd0000000-0000-0000-0000-000000000001') $$,
  '23514', null, 'only day use occupancies point at a pass');
select throws_ok(
  $$ update public.clubs set loyalty_every = 0 where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a reward takes at least one stamp');
select throws_ok(
  $$ insert into public.day_use_products (club_id, name, price, weekdays, from_time, to_time, capacity)
     values ('a0000000-0000-0000-0000-000000000001', 'Al revés', 450, '{6}', '12:30', '08:00', 30) $$,
  '23514', null, 'a pass ends after it starts');

-- Ana, member
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select is((select count(*)::int from public.day_use_products), 2, 'members read the passes the club offers');
select is((select count(*)::int from public.day_use_overrides), 1, 'and its exceptions');
select is((select count(*)::int from public.day_use_passes), 2, 'a player reads only her own passes');
select lives_ok($$ select day_use_product_id from public.court_occupancy $$,
  'members read which pass holds a court');
select throws_ok(
  $$ insert into public.day_use_passes (club_id, product_id, on_date, player_id, price, code, source)
     values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 6,
             '00000000-0000-0000-0000-0000000000a1', 0, 'DU-999999', 'online') $$,
  '42501', null, 'players cannot write passes directly');
select is((select show_in_club from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), true,
  'everyone shows in "Ya están en el club" by default');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select is((select count(*)::int from public.day_use_passes), 4, 'staff read every pass of the club');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select is((select count(*)::int from public.day_use_products), 0, 'staff of another club read no passes offered here');
select is((select count(*)::int from public.day_use_passes), 0, 'nor any pass sold here');

-- Dani, admin
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select throws_ok(
  $$ delete from public.courts where id = 'c0000000-0000-0000-0000-000000000003' $$,
  'P0001', 'court_has_history', 'a court a day use pass blocks cannot be deleted');

-- Anonymous visitor
set local role anon;
select throws_ok($$ select * from public.day_use_products $$, '42501', null, 'anon cannot read the passes offered');
select throws_ok($$ select * from public.day_use_passes $$, '42501', null, 'anon cannot read passes');

select * from finish();
rollback;
