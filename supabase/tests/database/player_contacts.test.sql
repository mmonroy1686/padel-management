begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(11);

set local role authenticated;

-- Ana saves her WhatsApp with the consent.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select is((select phone from public.save_player_contact('+598 99 123 456', true)), '099123456',
  'the phone is normalized to the local number');
select isnt((select whatsapp_consent_at from public.player_contacts), null, 'and the consent says when');
select throws_ok($$ select public.save_player_contact('', true) $$, 'P0001', 'invalid_input',
  'consenting without a phone is refused');
select throws_ok($$ select public.save_player_contact('12', false) $$, 'P0001', 'invalid_input',
  'a number that is not one is refused');
select is((select whatsapp_consent_at from public.save_player_contact('099123456', false)), null,
  'taking the consent back clears its date');
select public.save_player_contact('099123456', true);

-- Bruno, another player of the club, does not see it.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select is((select count(*)::int from public.player_contacts), 0, 'another player does not read it');
select throws_ok($$ insert into public.player_contacts (user_id, phone) values ('00000000-0000-0000-0000-0000000000a1', '099000000') $$,
  '42501', null, 'nor writes it directly');

-- Carla, reception of the club, sees it.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select is((select phone from public.player_contacts where user_id = '00000000-0000-0000-0000-0000000000a1'), '099123456',
  'the staff of her club reads it');
select is((select whatsapp_consent from public.player_contacts where user_id = '00000000-0000-0000-0000-0000000000a1'), true,
  'with the consent');

-- Omar is not a member: he does not see it.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select is((select count(*)::int from public.player_contacts), 0, 'someone outside the club does not read it');

-- Without a session nothing is saved.
reset request.jwt.claims;
set local request.jwt.claims = '{"role": "authenticated"}';
select throws_ok($$ select public.save_player_contact('099123456', false) $$, 'P0001', 'forbidden', 'nobody signed in, nothing saved');

select * from finish();
rollback;
