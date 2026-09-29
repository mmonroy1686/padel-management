begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(8);

-- A second club where Bruno is also a member, with its own receptionist Eva.
insert into public.clubs (id, slug, name) values ('a0000000-0000-0000-0000-000000000002', 'test-club-b', 'Club B');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'eva@test.local');
insert into public.club_members (club_id, user_id, role) values
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'player'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e1', 'reception');

-- Bruno reported a transfer to club T with this receipt; he also has a file no payment uses.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '20:00', 90), '00000000-0000-0000-0000-0000000000b1', 1600);
insert into storage.objects (bucket_id, name) values
  ('receipts', '00000000-0000-0000-0000-0000000000b1/for-club-t.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000b1/unused.png');
insert into public.payments (club_id, booking_id, method, amount, status, receipt_path, reported_by) values
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'transfer', 1600, 'reported',
   '00000000-0000-0000-0000-0000000000b1/for-club-t.png', '00000000-0000-0000-0000-0000000000b1');

set local role authenticated;

-- Carla, reception of club T: sees the receipt of a payment to her club, nothing else.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select results_eq(
  $$ select name from storage.objects where bucket_id = 'receipts' order by name $$,
  $$ values ('00000000-0000-0000-0000-0000000000b1/for-club-t.png') $$,
  'staff read only the receipts of payments to their club');

-- Eva, reception of club B, where Bruno is also a member: sees none of them.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select is((select count(*)::int from storage.objects where bucket_id = 'receipts'), 0,
  'staff of another club cannot read a member''s receipts');

-- Bruno still reads his own.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select is((select count(*)::int from storage.objects where bucket_id = 'receipts'), 2, 'a player reads all her own receipts');

-- Price bands: two bands for the same weekday cannot start at the same time.
reset role;
select throws_ok(
  $$ insert into public.pricing_rules (club_id, weekdays, from_time, to_time, price)
     values ('a0000000-0000-0000-0000-000000000001', '{3}', '18:30', '22:00', 1800) $$,
  '23514', null, 'a band that starts with another one on the same weekday is rejected');
select lives_ok(
  $$ insert into public.pricing_rules (club_id, weekdays, from_time, to_time, price)
     values ('a0000000-0000-0000-0000-000000000001', '{3}', '20:00', '24:00', 2000) $$,
  'a band that starts later on the same weekday is fine');
select lives_ok(
  $$ insert into public.pricing_rules (club_id, weekdays, from_time, to_time, price)
     values ('a0000000-0000-0000-0000-000000000002', '{3}', '18:30', '24:00', 1000) $$,
  'another club can use the same start time');
select lives_ok(
  $$ update public.pricing_rules set price = 1700
     where club_id = 'a0000000-0000-0000-0000-000000000001' and from_time = '18:30' $$,
  'changing the price of a band does not clash with itself');

-- Realtime streams only what members may read: with the default replica identity a delete
-- carries just the primary key, never note or created_by.
select is((select relreplident::text from pg_class where oid = 'public.court_occupancy'::regclass), 'd',
  'court_occupancy keeps the default replica identity');

select * from finish();
rollback;
