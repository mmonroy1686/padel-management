begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(38);

-- Club T: Dani (d1) admin, Carla (c1) reception, Ana (a1) and Bruno (b1) players, Omar (f1) not a member.
set local role authenticated;

-- Carla, reception: she sees the invitations but cannot manage them.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated", "email": "carla@test.local"}';
select throws_ok(
  $$ select public.invite_staff('a0000000-0000-0000-0000-000000000001', 'omar@test.local', 'reception') $$,
  'P0001', 'forbidden', 'reception cannot invite');
select throws_ok(
  $$ select public.club_staff('a0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'reception cannot list the staff');

-- Dani, admin.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated", "email": "dani@test.local"}';
select lives_ok(
  $$ select public.invite_staff('a0000000-0000-0000-0000-000000000001', '  Omar@Test.Local ', 'admin') $$,
  'an admin invites an email');
select results_eq(
  $$ select email, role::text, email_status::text, expires_at > now() + interval '6 days'
     from public.club_invitations $$,
  $$ values ('omar@test.local', 'admin', 'pending', true) $$,
  'the email is stored trimmed and in lower case, for 7 days, queued for mail');
select lives_ok(
  $$ select public.invite_staff('a0000000-0000-0000-0000-000000000001', 'omar@test.local', 'reception') $$,
  'inviting the same email again renews it');
select results_eq(
  $$ select count(*)::int, min(role::text) from public.club_invitations $$,
  $$ values (1, 'reception') $$,
  'one open invitation per email, with the last role');
select throws_ok(
  $$ select public.invite_staff('a0000000-0000-0000-0000-000000000001', 'no-es-un-mail', 'reception') $$,
  'P0001', 'invalid_email', 'the email is checked');
select throws_ok(
  $$ select public.invite_staff('a0000000-0000-0000-0000-000000000001', 'carla@test.local', 'admin') $$,
  'P0001', 'already_staff', 'staff are not invited again');
select throws_ok(
  $$ select public.invite_staff('a0000000-0000-0000-0000-000000000001', 'omar@test.local', 'player') $$,
  'P0001', 'invalid_input', 'only admin or reception');
select throws_ok(
  $$ insert into public.club_invitations (club_id, email, role)
     values ('a0000000-0000-0000-0000-000000000001', 'x@test.local', 'admin') $$,
  '42501', null, 'nobody writes invitations directly');
select results_eq(
  $$ select email, role::text from public.club_staff('a0000000-0000-0000-0000-000000000001') order by email $$,
  $$ values ('carla@test.local', 'reception'), ('dani@test.local', 'admin') $$,
  'the admin lists the staff with their emails');

-- Ana, a player: sees no invitation and has none.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated", "email": "ana@test.local"}';
select is((select count(*)::int from public.club_invitations), 0, 'players do not see invitations');
select throws_ok(
  $$ select public.accept_staff_invitation('a0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'invitation_not_found', 'someone else''s invitation is not hers');

-- Omar accepts his.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated", "email": "omar@test.local"}';
select is(
  public.accept_staff_invitation('a0000000-0000-0000-0000-000000000001')::text, 'reception',
  'accepting gives the invited role');
select results_eq(
  $$ select role::text, category from public.club_members where user_id = '00000000-0000-0000-0000-0000000000f1' $$,
  $$ values ('reception', null::smallint) $$,
  'he joins as reception, without a category (no player welcome)');
select throws_ok(
  $$ select public.accept_staff_invitation('a0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'invitation_not_found', 'an accepted invitation is used up');

-- Ana is invited as reception: she keeps her category.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated", "email": "dani@test.local"}';
select lives_ok(
  $$ select public.invite_staff('a0000000-0000-0000-0000-000000000001', 'ana@test.local', 'reception') $$,
  'an existing player is invited');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated", "email": "ana@test.local"}';
select lives_ok(
  $$ select public.accept_staff_invitation('a0000000-0000-0000-0000-000000000001') $$,
  'the player accepts');
select results_eq(
  $$ select role::text, category::int, category_validated from public.club_members
     where user_id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('reception', 5, true) $$,
  'she is reception and keeps her validated category');

-- Bruno: expired, then renewed by "Reenviar"; and a cancelled one.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated", "email": "dani@test.local"}';
select lives_ok(
  $$ select public.invite_staff('a0000000-0000-0000-0000-000000000001', 'bruno@test.local', 'reception') $$,
  'Bruno is invited');
reset role;
update public.club_invitations set expires_at = now() - interval '1 minute' where email = 'bruno@test.local';
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated", "email": "bruno@test.local"}';
select throws_ok(
  $$ select public.accept_staff_invitation('a0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'invitation_not_found', 'an expired invitation gives no access');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated", "email": "carla@test.local"}';
select throws_ok(
  format('select public.resend_staff_invitation(%L)', (select id from public.club_invitations where email = 'bruno@test.local')),
  'P0001', 'not_found', 'reception cannot resend');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated", "email": "dani@test.local"}';
select lives_ok(
  format('select public.resend_staff_invitation(%L)', (select id from public.club_invitations where email = 'bruno@test.local')),
  'the admin resends it');
select lives_ok(
  format('select public.cancel_staff_invitation(%L)', (select id from public.club_invitations where email = 'bruno@test.local')),
  'and then cancels it');
select throws_ok(
  format('select public.cancel_staff_invitation(%L)', (select id from public.club_invitations where email = 'bruno@test.local')),
  'P0001', 'invalid_state', 'a cancelled invitation is closed');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated", "email": "bruno@test.local"}';
select throws_ok(
  $$ select public.accept_staff_invitation('a0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'invitation_not_found', 'a cancelled invitation gives no access');

-- The last admin stays: by function and by a direct write.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated", "email": "dani@test.local"}';
select throws_ok(
  $$ select public.set_member_role('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'reception') $$,
  'P0001', 'last_admin', 'the only admin cannot lower their role');
select throws_ok(
  $$ select public.remove_staff('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1') $$,
  'P0001', 'last_admin', 'nor remove their access');
select throws_ok(
  $$ update public.club_members set role = 'player' where user_id = '00000000-0000-0000-0000-0000000000d1' $$,
  'P0001', 'last_admin', 'nor through a direct update');
select throws_ok(
  $$ delete from public.club_members where user_id = '00000000-0000-0000-0000-0000000000d1' $$,
  'P0001', 'last_admin', 'nor through a direct delete');

-- With a second admin, Dani hands the club over and steps down; Carla loses her access.
select lives_ok(
  $$ select public.set_member_role('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'admin') $$,
  'Omar becomes admin');
select lives_ok(
  $$ select public.remove_staff('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1') $$,
  'an admin removes reception');
select lives_ok(
  $$ select public.set_member_role('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'reception') $$,
  'with another admin, an admin can step down');
select results_eq(
  $$ select user_id::text, role::text from public.club_members
     where user_id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1',
                       '00000000-0000-0000-0000-0000000000f1')
     order by user_id $$,
  $$ values ('00000000-0000-0000-0000-0000000000c1', 'player'), ('00000000-0000-0000-0000-0000000000d1', 'reception'),
            ('00000000-0000-0000-0000-0000000000f1', 'admin') $$,
  'Carla is a player again, Dani reception and Omar admin');

-- The mail queue: only the service role claims it, and each invitation once.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated", "email": "omar@test.local"}';
select lives_ok(
  $$ select public.invite_staff('a0000000-0000-0000-0000-000000000001', 'nuevo@test.local', 'reception') $$,
  'Omar invites someone new');
select throws_ok(
  $$ select * from public.claim_invitation_emails(10) $$,
  '42501', null, 'members cannot claim the mails');
reset role;
set local role service_role;
select results_eq(
  $$ select email, role::text, club_slug from public.claim_invitation_emails(10) $$,
  $$ values ('nuevo@test.local', 'reception', 'test-club') $$,
  'only the open invitation is claimed, with its club');
select is((select count(*)::int from public.claim_invitation_emails(10)), 0, 'and not twice');

select * from finish();
rollback;
