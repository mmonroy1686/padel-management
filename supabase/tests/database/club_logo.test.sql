begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
select plan(9);

select is((select public from storage.buckets where id = 'club-logos'), true,
  'club logos are public: they show on the sign-in page too');
select ok(
  (select 'image/svg+xml' = any (allowed_mime_types) and 'image/png' = any (allowed_mime_types)
     and not 'application/pdf' = any (allowed_mime_types) from storage.buckets where id = 'club-logos'),
  'the bucket takes images only');

select throws_ok(
  $$ update public.clubs set logo_path = 'a0000000-0000-0000-0000-000000000002/logo.png'
      where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a club logo lives in the club''s own folder');

set local role authenticated;

-- Dani, admin of club T
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('club-logos', 'a0000000-0000-0000-0000-000000000001/logo-1.png') $$,
  'the admin uploads the club logo');
select lives_ok(
  $$ update public.clubs set logo_path = 'a0000000-0000-0000-0000-000000000001/logo-1.png'
      where id = 'a0000000-0000-0000-0000-000000000001' $$,
  'and points the club at it');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('club-logos', 'a0000000-0000-0000-0000-000000000002/logo-1.png') $$,
  '42501', null, 'not into another club''s folder');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('club-logos', 'a0000000-0000-0000-0000-000000000001/logo-2.png') $$,
  '42501', null, 'reception cannot change the logo');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('club-logos', 'a0000000-0000-0000-0000-000000000001/logo-3.png') $$,
  '42501', null, 'the admin of another club cannot either');

reset role;
select is((select logo_path from public.clubs where id = 'a0000000-0000-0000-0000-000000000001'),
  'a0000000-0000-0000-0000-000000000001/logo-1.png', 'the club keeps its logo');

select * from finish();
rollback;
