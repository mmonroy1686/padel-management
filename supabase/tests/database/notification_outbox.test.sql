begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/waitlist.psql
select plan(14);

-- Ana's aviso is about a hold still active (the outbox skips the mail of one that is not).
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-0000000000a1');
call test_helpers.make_hold('e1000000-0000-0000-0000-000000000041', 'e0000000-0000-0000-0000-000000000041',
  'c0000000-0000-0000-0000-000000000001', test_helpers.slot(1, '18:30', 90));

insert into public.notifications (id, club_id, user_id, kind, data, link, created_at) values
  ('e2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 'slot_held',
   '{"court_name": "Cancha 1", "hold_id": "e1000000-0000-0000-0000-000000000041"}', '/', now() - interval '2 minutes'),
  ('e2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000b1', 'slot_free_now', '{"court_name": "Cancha 2"}', '/reservar',
   now() - interval '1 minute');

-- Ana, player
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok($$ select * from public.claim_notification_emails(10) $$, '42501', null,
  'players cannot read the outbox');
select throws_ok($$ select public.finish_notification_email('e2000000-0000-0000-0000-000000000001', 'sent') $$,
  '42501', null, 'nor mark it');

-- The service role (lib/notify/outbox.ts)
set local role service_role;
select results_eq(
  $$ select notification_id, kind::text, email, player_name, club_name, club_timezone, link
     from public.claim_notification_emails(10) $$,
  $$ values ('e2000000-0000-0000-0000-000000000001'::uuid, 'slot_held', 'ana@test.local', 'Ana', 'Club T',
             'America/Montevideo', '/'),
            ('e2000000-0000-0000-0000-000000000002'::uuid, 'slot_free_now', 'bruno@test.local', 'Bruno', 'Club T',
             'America/Montevideo', '/reservar') $$,
  'the service role takes the pending avisos, oldest first, with each player''s email');
select results_eq(
  $$ select email_attempts::int, email_locked_until > now() from public.notifications order by created_at $$,
  $$ values (1, true), (1, true) $$,
  'each one counts an attempt and stays taken for a while');
select is_empty($$ select * from public.claim_notification_emails(10) $$, 'a second run does not take them again');
select lives_ok($$ select public.finish_notification_email('e2000000-0000-0000-0000-000000000001', 'sent') $$,
  'a mail that went out is marked sent');
select results_eq(
  $$ select email_status::text, emailed_at is not null, email_locked_until is null
     from public.notifications where id = 'e2000000-0000-0000-0000-000000000001' $$,
  $$ values ('sent', true, true) $$,
  'with when it went out');
select lives_ok($$ select public.finish_notification_email('e2000000-0000-0000-0000-000000000002', 'failed') $$,
  'a mail that failed is marked failed');
select results_eq($$ select notification_id from public.claim_notification_emails(10) $$,
  $$ values ('e2000000-0000-0000-0000-000000000002'::uuid) $$, 'a failed one is retried');
select public.finish_notification_email('e2000000-0000-0000-0000-000000000002', 'failed');
select results_eq($$ select notification_id from public.claim_notification_emails(10) $$,
  $$ values ('e2000000-0000-0000-0000-000000000002'::uuid) $$, 'and retried a third time');
select public.finish_notification_email('e2000000-0000-0000-0000-000000000002', 'failed');
select is_empty($$ select * from public.claim_notification_emails(10) $$, 'after three failed attempts it is left alone');
select throws_ok($$ select public.finish_notification_email('e2000000-0000-0000-0000-000000000001', 'pending') $$,
  'P0001', 'invalid_input', 'nothing goes back to pending');

reset role;
select ok(
  not has_function_privilege('authenticated', 'public.claim_notification_emails(integer)', 'execute')
  and not has_function_privilege('anon', 'public.finish_notification_email(uuid, public.email_status)', 'execute'),
  'only the service role runs the outbox');
select ok(has_function_privilege('service_role', 'public.claim_notification_emails(integer)', 'execute'),
  'the service role does');

select * from finish();
rollback;
