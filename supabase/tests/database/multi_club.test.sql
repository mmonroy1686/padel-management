begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(8);

-- A second club, Club N, where Ana (a player of Club T) is a member too.
insert into public.clubs (id, slug, name, opens_at, closes_at, slot_minutes) values
  ('a0000000-0000-0000-0000-0000000000f2', 'test-norte', 'Club N', '09:00', '23:00', 60);
insert into public.club_members (club_id, user_id, role, category, category_validated) values
  ('a0000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a1', 'player', 4, true);

-- One aviso of each club for Ana.
insert into public.notifications (id, club_id, user_id, kind, data, link, created_at) values
  ('e3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 'slot_free_now', '{"court_name": "Cancha 1"}', '/reservar',
   now() - interval '2 minutes'),
  ('e3000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000f2',
   '00000000-0000-0000-0000-0000000000a1', 'slot_free_now', '{"court_name": "Central"}', '/reservar',
   now() - interval '1 minute');

-- The outbox: each email knows its club's subdomain.
set local role service_role;
select results_eq(
  $$ select notification_id, club_name, club_slug from public.claim_notification_emails(10) $$,
  $$ values ('e3000000-0000-0000-0000-000000000001'::uuid, 'Club T', 'test-club'),
            ('e3000000-0000-0000-0000-000000000002'::uuid, 'Club N', 'test-norte') $$,
  'each aviso comes with the slug of its club, for the link in the email');

-- Ana opens the bell in Club T.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select is(public.mark_notifications_read('a0000000-0000-0000-0000-000000000001'), 1,
  'marking the avisos of one club marks that club''s');
select results_eq(
  $$ select id, read_at is not null from public.notifications order by created_at $$,
  $$ values ('e3000000-0000-0000-0000-000000000001'::uuid, true), ('e3000000-0000-0000-0000-000000000002'::uuid, false) $$,
  'and leaves the other club''s unread');
select is(public.mark_notifications_read('a0000000-0000-0000-0000-000000000001'), 0, 'a second time there is nothing left');

-- Bruno is not in Club N and has no avisos there: marking them changes nothing of Ana's.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select is(public.mark_notifications_read('a0000000-0000-0000-0000-0000000000f2'), 0, 'nobody marks someone else''s avisos');
reset role;
select ok((select read_at is null from public.notifications where id = 'e3000000-0000-0000-0000-000000000002'),
  'Ana''s aviso in Club N is still unread');

-- Without a session.
set local role anon;
select throws_ok($$ select public.mark_notifications_read('a0000000-0000-0000-0000-000000000001') $$, '42501', null,
  'anonymous visitors cannot call it');
reset role;

-- The version without a club (the app deployed during the migration) still works.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select is(public.mark_notifications_read(), 1, 'the old version still marks every club''s, until the old app is gone');

select * from finish();
rollback;
