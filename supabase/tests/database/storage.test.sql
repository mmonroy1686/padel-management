begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(7);

insert into storage.objects (bucket_id, name) values
  ('receipts', '00000000-0000-0000-0000-0000000000a1/r1.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000b1/r2.png');

select is((select public from storage.buckets where id = 'receipts'), false, 'receipts is a private bucket');

-- Ana, player
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select is(
  (select count(*)::int from storage.objects where name like '00000000-0000-0000-0000-0000000000a1/%'), 1,
  'a player reads her own receipts');
select is(
  (select count(*)::int from storage.objects where name like '00000000-0000-0000-0000-0000000000b1/%'), 0,
  'a player cannot read someone else''s receipts');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('receipts', '00000000-0000-0000-0000-0000000000a1/r3.png') $$,
  'a player uploads into her own folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('receipts', '00000000-0000-0000-0000-0000000000b1/r4.png') $$,
  '42501', null, 'a player cannot upload into someone else''s folder');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is((select count(*)::int from storage.objects where bucket_id = 'receipts'), 3,
  'reception reads the receipts of club members');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';

select is((select count(*)::int from storage.objects where bucket_id = 'receipts'), 0,
  'someone outside the club reads none of them');

select * from finish();
rollback;
