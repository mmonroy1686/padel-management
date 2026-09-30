begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
select plan(30);

-- Day offsets of the future occupancies of a product, in order.
create function test_helpers.day_use_days(p_name text)
returns setof integer
language sql
stable
as $$
  select ((o.starts_at at time zone 'America/Montevideo')::date - test_helpers.today())::integer
  from public.court_occupancy o
  join public.day_use_products p on p.id = o.day_use_product_id
  where p.name = p_name
  order by o.starts_at;
$$;

-- Bruno's booking takes Cancha 1 on day 3 from 09:30 to 11:00.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '09:30', 90), '00000000-0000-0000-0000-0000000000b1', 1200);

set local role authenticated;

-- Dani, admin
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select is(
  (select skipped_count from public.save_day_use_product('a0000000-0000-0000-0000-000000000001', 'Day use completo',
     450, array['Vestuarios', ' Pileta ', ''], array[0, 1, 2, 3, 4, 5, 6], '08:00', '12:30', 30,
     array['c0000000-0000-0000-0000-000000000001']::uuid[], 1)),
  1, 'admin creates a pass that blocks Cancha 1; the day it is taken is skipped and counted');
select results_eq(
  $$ select name, price, includes, weekdays, capacity::int, court_ids, is_active from public.day_use_products
     where name = 'Day use completo' $$,
  $$ values ('Day use completo', 450, array['Vestuarios', 'Pileta'], array[0, 1, 2, 3, 4, 5, 6]::smallint[], 30,
             array['c0000000-0000-0000-0000-000000000001']::uuid[], true) $$,
  'with its price, what it includes, its days, capacity and courts');

reset role;
select ok(
  exists (select 1 from public.court_occupancy o join public.day_use_products p on p.id = o.day_use_product_id
          where p.name = 'Day use completo' and o.court_id = 'c0000000-0000-0000-0000-000000000001'
            and o.kind = 'day_use' and o.note = 'Day use completo' and o.period = test_helpers.slot(2, '08:00', 270)),
  'it blocks Cancha 1 while it runs, with its name for the grid');
select ok(
  not exists (select 1 from public.court_occupancy o join public.day_use_products p on p.id = o.day_use_product_id
              where p.name = 'Day use completo' and o.starts_at = test_helpers.at(3, '08:00')),
  'the day Cancha 1 is taken is skipped');
select is((select generated_until from public.day_use_products where name = 'Day use completo'),
  test_helpers.today() + 14, 'generated up to the booking window');
-- Under RLS, Eva (club B) cannot look the id up.
select id as product_id from public.day_use_products where name = 'Day use completo' \gset

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select lives_ok(
  $$ select * from public.save_day_use_product('a0000000-0000-0000-0000-000000000001', 'Pileta', 200, array[]::text[],
       array[6, 0], '13:00', '18:00', 40, array[]::uuid[]) $$,
  'a pass that blocks no court');
select lives_ok(
  $$ select * from public.save_day_use_product('a0000000-0000-0000-0000-000000000001', 'Day use completo', 500,
       array['Vestuarios'], array[extract(dow from test_helpers.today() + 2)::integer], '08:00', '12:30', 30,
       array['c0000000-0000-0000-0000-000000000001']::uuid[], 1,
       (select id from public.day_use_products where name = 'Day use completo')) $$,
  'admin edits it: one weekday only, new price');

reset role;
select results_eq($$ select * from test_helpers.day_use_days('Day use completo') $$, $$ values (2), (9) $$,
  'editing moves its courts to the new days');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select lives_ok(
  $$ select public.set_day_use_override((select id from public.day_use_products where name = 'Day use completo'),
       test_helpers.today() + 4, true) $$,
  'admin opens a date it does not run');
select lives_ok(
  $$ select public.set_day_use_override((select id from public.day_use_products where name = 'Day use completo'),
       test_helpers.today() + 9, false) $$,
  'and closes a date it runs');

reset role;
select results_eq($$ select * from test_helpers.day_use_days('Day use completo') $$, $$ values (2), (4) $$,
  'the courts follow the exceptions');
select is(
  (select count(*)::int from public.day_use_overrides o join public.day_use_products p on p.id = o.product_id
   where p.name = 'Day use completo'),
  2, 'both exceptions are kept');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select lives_ok(
  $$ select public.set_day_use_override((select id from public.day_use_products where name = 'Day use completo'),
       test_helpers.today() + 4, false) $$,
  'admin takes an exception back');

reset role;
select is(
  (select count(*)::int from public.day_use_overrides o join public.day_use_products p on p.id = o.product_id
   where p.name = 'Day use completo'),
  1, 'going back to the weekly rule removes the exception');
select results_eq($$ select * from test_helpers.day_use_days('Day use completo') $$, $$ values (2) $$,
  'and frees the court that day');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select throws_ok(
  $$ select public.set_day_use_override((select id from public.day_use_products where name = 'Day use completo'),
       test_helpers.today() - 1, true) $$,
  'P0001', 'in_the_past', 'no exceptions for days that passed');
select lives_ok(
  $$ select public.set_day_use_product_active((select id from public.day_use_products where name = 'Day use completo'),
       false) $$,
  'admin deactivates a pass');

reset role;
select is_empty($$ select * from test_helpers.day_use_days('Day use completo') $$,
  'a deactivated pass frees its courts');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select lives_ok(
  $$ select public.set_day_use_product_active((select id from public.day_use_products where name = 'Day use completo'),
       true) $$,
  'and activates it again');

reset role;
select results_eq($$ select * from test_helpers.day_use_days('Day use completo') $$, $$ values (2) $$,
  'reactivating blocks its courts again, exceptions included');

-- The daily job: every day again, and pretend it was generated only up to day 10.
update public.day_use_products set weekdays = array[0, 1, 2, 3, 4, 5, 6]::smallint[],
                                   generated_until = test_helpers.today() + 10
 where name = 'Day use completo';
select is(private.extend_all_day_use(), 1, 'the daily job extends the passes that need it');
select results_eq(
  $$ select d from test_helpers.day_use_days('Day use completo') as d where d > 10 $$,
  $$ values (11), (12), (13), (14) $$,
  'up to the booking window');
select is((select count(*)::int from cron.job where jobname = 'extend-day-use'), 1, 'pg_cron runs it every day');

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  $$ select * from public.save_day_use_product('a0000000-0000-0000-0000-000000000001', 'Mío', 100, array[]::text[],
       array[6], '08:00', '10:00', 10, array[]::uuid[]) $$,
  'P0001', 'forbidden', 'reception does not configure passes');
select throws_ok(
  $$ select public.set_day_use_override((select id from public.day_use_products where name = 'Pileta'),
       test_helpers.today() + 5, true) $$,
  'P0001', 'forbidden', 'nor their exceptions');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  $$ select * from public.save_day_use_product('a0000000-0000-0000-0000-000000000001', 'Ajeno', 100, array[]::text[],
       array[6], '08:00', '10:00', 10, array[]::uuid[]) $$,
  'P0001', 'forbidden', 'an admin of another club cannot create passes here');
select throws_ok(
  format('select public.set_day_use_product_active(%L, false)', :'product_id'),
  'P0001', 'forbidden', 'nor deactivate one of this club');

-- Dani, admin: bad input
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select throws_ok(
  $$ select * from public.save_day_use_product('a0000000-0000-0000-0000-000000000001', 'Al revés', 100,
       array[]::text[], array[6], '12:30', '08:00', 10, array[]::uuid[]) $$,
  'P0001', 'invalid_input', 'a pass ends after it starts');
select throws_ok(
  $$ select * from public.save_day_use_product('a0000000-0000-0000-0000-000000000001', 'Otra cancha', 100,
       array[]::text[], array[6], '08:00', '10:00', 10, array['cb000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'P0001', 'invalid_input', 'only active courts of the club');

-- Anonymous visitor
set local role anon;
select throws_ok(
  $$ select * from public.save_day_use_product('a0000000-0000-0000-0000-000000000001', 'Anónimo', 100,
       array[]::text[], array[6], '08:00', '10:00', 10, array[]::uuid[]) $$,
  '42501', null, 'anon cannot call save_day_use_product');

select * from finish();
rollback;
