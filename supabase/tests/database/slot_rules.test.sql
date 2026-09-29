begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(12);

select is(private.slot_period('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '08:00')),
  test_helpers.slot(1, '08:00', 90), 'the first slot starts at opening time and lasts slot_minutes');
select is(private.slot_period('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '21:30')),
  test_helpers.slot(1, '21:30', 90), 'the last slot ends exactly at closing time');
select throws_ok(
  $$ select private.slot_period('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '08:15')) $$,
  'P0001', 'not_aligned', 'a start between two slots is not on the grid');
select throws_ok(
  $$ select private.slot_period('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '06:30')) $$,
  'P0001', 'not_aligned', 'a start before opening is not on the grid');
select throws_ok(
  $$ select private.slot_period('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '23:00')) $$,
  'P0001', 'not_aligned', 'a slot that would end after closing is not on the grid');
select throws_ok(
  $$ select private.slot_period('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '08:00') + interval '30 seconds') $$,
  'P0001', 'not_aligned', 'slots start on whole minutes');

update public.clubs set opens_at = '09:00', closes_at = '24:00' where id = 'a0000000-0000-0000-0000-000000000001';
select is(private.slot_period('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '22:30')),
  test_helpers.slot(1, '22:30', 90), 'with closing at 24:00 the last slot ends at midnight');
update public.clubs set opens_at = '08:00', closes_at = '23:00' where id = 'a0000000-0000-0000-0000-000000000001';

select is(private.slot_price('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '08:00')), 1200,
  'daytime price');
select is(private.slot_price('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '17:00')), 1200,
  'a slot that starts before 18:30 keeps the daytime price');
select is(private.slot_price('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '18:30')), 1600,
  'the evening price starts at 18:30');

insert into public.pricing_rules (club_id, weekdays, from_time, to_time, price) values
  ('a0000000-0000-0000-0000-000000000001', array[extract(dow from test_helpers.today() + 2)::smallint], '20:00', '24:00', 2000);
select is(private.slot_price('a0000000-0000-0000-0000-000000000001', test_helpers.at(2, '20:00')), 2000,
  'on its weekday, the band that starts latest wins');

delete from public.pricing_rules where club_id = 'a0000000-0000-0000-0000-000000000001';
select is(private.slot_price('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '08:00')), null::integer,
  'without a band there is no price');

select * from finish();
rollback;
