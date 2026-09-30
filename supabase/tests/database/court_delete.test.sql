begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(6);

-- Cancha 3 was added by mistake and never used; Cancha 1 has a booking.
insert into public.courts (id, club_id, name, sort_order) values
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Cancha 3', 3);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  tstzrange('2026-10-05 20:00-03', '2026-10-05 21:30-03'), '00000000-0000-0000-0000-0000000000a1');

-- Carla, reception: RLS filters her delete out.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
delete from public.courts where id = 'c0000000-0000-0000-0000-000000000003';
reset role;
select ok(exists (select 1 from public.courts where id = 'c0000000-0000-0000-0000-000000000003'),
  'reception cannot delete courts');

-- Dani, admin
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select lives_ok(
  $$ delete from public.courts where id = 'c0000000-0000-0000-0000-000000000003' $$,
  'admin deletes a court with no history');

select throws_ok(
  $$ delete from public.courts where id = 'c0000000-0000-0000-0000-000000000001' $$,
  'P0001', 'court_has_history', 'a court with bookings cannot be deleted');

reset role;
select ok(not exists (select 1 from public.courts where id = 'c0000000-0000-0000-0000-000000000003'),
  'the unused court is gone');
select ok(exists (select 1 from public.bookings where id = 'b0000000-0000-0000-0000-000000000001'),
  'the booking survives the refused delete');

-- Removing the whole club still cascades through its courts.
delete from public.clubs where id = 'a0000000-0000-0000-0000-000000000001';
select ok(not exists (select 1 from public.courts where club_id = 'a0000000-0000-0000-0000-000000000001'),
  'deleting the club takes its courts and their history');

select * from finish();
rollback;
