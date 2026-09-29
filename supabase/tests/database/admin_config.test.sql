begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(9);

-- Dani, admin
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select lives_ok(
  $$ update public.clubs set slot_minutes = 60 where id = 'a0000000-0000-0000-0000-000000000001' $$,
  'admin updates the club settings');

reset role;
select is((select slot_minutes::int from public.clubs where id = 'a0000000-0000-0000-0000-000000000001'), 60,
  'the new slot length is stored');

-- Carla, reception: RLS filters her update out.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
update public.clubs set slot_minutes = 120 where id = 'a0000000-0000-0000-0000-000000000001';

reset role;
select is((select slot_minutes::int from public.clubs where id = 'a0000000-0000-0000-0000-000000000001'), 60,
  'reception cannot change the club settings');

-- Dani manages prices and courts.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.pricing_rules (club_id, weekdays, from_time, to_time, price)
     values ('a0000000-0000-0000-0000-000000000001', '{6}', '09:30', '12:00', 1500) $$,
  'admin adds a price band');
select lives_ok(
  $$ delete from public.pricing_rules
     where club_id = 'a0000000-0000-0000-0000-000000000001' and weekdays = '{6}' $$,
  'admin deletes a price band');
select lives_ok(
  $$ insert into public.courts (club_id, name) values ('a0000000-0000-0000-0000-000000000001', 'Cancha 3') $$,
  'admin adds a court');

-- Carla cannot.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.pricing_rules (club_id, weekdays, from_time, to_time, price)
     values ('a0000000-0000-0000-0000-000000000001', '{6}', '09:30', '12:00', 1) $$,
  '42501', null, 'reception cannot add price bands');
select throws_ok(
  $$ insert into public.courts (club_id, name) values ('a0000000-0000-0000-0000-000000000001', 'Cancha 4') $$,
  '42501', null, 'reception cannot add courts');

reset role;
select is((select count(*)::int from public.pricing_rules where club_id = 'a0000000-0000-0000-0000-000000000001'), 2,
  'only the admin changes left a trace');

select * from finish();
rollback;
