begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(5);

select ok('match_invite' = any (enum_range(null::public.notification_kind)::text[]),
  'an invitation to a match is one more aviso');
select ok((select phone from public.clubs where id = 'a0000000-0000-0000-0000-000000000001') is null,
  'a club starts without a WhatsApp');
select lives_ok(
  $$ update public.clubs set phone = '092369558' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  'the WhatsApp is stored as digits');
select throws_ok(
  $$ update public.clubs set phone = '092 369 558' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'never with spaces or signs');
select throws_ok(
  $$ update public.clubs set phone = '1234' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'and with 8 to 15 digits');

select * from finish();
rollback;
