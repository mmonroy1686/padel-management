begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(4);

insert into public.player_contacts (user_id, phone, whatsapp_consent, whatsapp_consent_at)
values ('00000000-0000-0000-0000-0000000000a1', '099123456', true, now());

set local role authenticated;

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select is((select email from public.club_member_contacts('a0000000-0000-0000-0000-000000000001') where user_id = '00000000-0000-0000-0000-0000000000a1'),
  'ana@test.local', 'reception gets the member''s email');
select is((select phone || ' ' || whatsapp_consent::text from public.club_member_contacts('a0000000-0000-0000-0000-000000000001') where user_id = '00000000-0000-0000-0000-0000000000a1'),
  '099123456 true', 'with her WhatsApp and consent');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok($$ select * from public.club_member_contacts('a0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'a player does not');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select throws_ok($$ select * from public.club_member_contacts('a0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'nor someone outside the club');

select * from finish();
rollback;
