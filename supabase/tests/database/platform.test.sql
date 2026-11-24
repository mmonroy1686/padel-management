begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(24);

-- Club T (test-club): Dani (d1) admin, Carla (c1) reception, 2 courts and prices. Omar (f1) runs the platform.
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000f1');
set local role authenticated;

-- Dani, a club admin, is not a platform admin.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated", "email": "dani@test.local"}';
select is(public.is_platform_admin(), false, 'a club admin is not a platform admin');
select throws_ok(
  $$ select public.create_club('nuevo', 'Nuevo', 'America/Montevideo', 'x@test.local') $$,
  'P0001', 'forbidden', 'only platform admins create clubs');
select throws_ok($$ select * from public.platform_clubs() $$, 'P0001', 'forbidden', 'nor list them');
select throws_ok($$ select * from public.platform_admins $$, '42501', null, 'nobody reads platform_admins');

-- Omar, platform admin.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated", "email": "omar@test.local"}';
select is(public.is_platform_admin(), true, 'Omar runs the platform');
select throws_ok(
  $$ select public.create_club('Club Demo', 'Club Demo', 'America/Montevideo', 'admin@demo.test') $$,
  'P0001', 'invalid_slug', 'a slug has no spaces');
select throws_ok(
  $$ select public.create_club('a', 'Club A', 'America/Montevideo', 'admin@demo.test') $$,
  'P0001', 'invalid_slug', 'a slug has at least 2 characters');
select throws_ok(
  $$ select public.create_club('www', 'Club W', 'America/Montevideo', 'admin@demo.test') $$,
  'P0001', 'slug_reserved', 'reserved slugs are refused');
select throws_ok(
  $$ select public.create_club('test-club', 'Otro', 'America/Montevideo', 'admin@demo.test') $$,
  'P0001', 'slug_taken', 'a used slug is refused');
select throws_ok(
  $$ select public.create_club('demo', 'Club Demo', 'Mars/Olympus', 'admin@demo.test') $$,
  'P0001', 'invalid_timezone', 'the time zone has to exist');
select throws_ok(
  $$ select public.create_club('demo', 'Club Demo', 'America/Montevideo', 'no-es-mail') $$,
  'P0001', 'invalid_email', 'the admin email is checked');
select throws_ok(
  $$ select public.create_club('demo', '  ', 'America/Montevideo', 'admin@demo.test') $$,
  'P0001', 'invalid_input', 'the club needs a name');
select lives_ok(
  $$ select public.create_club(' Demo ', ' Club Demo ', 'America/Argentina/Buenos_Aires', ' Admin@Demo.Test ') $$,
  'a platform admin creates a club');
select results_eq(
  $$ select name, timezone, slot_minutes::int, accepts_cash, setup_completed_at is null from public.clubs where slug = 'demo' $$,
  $$ values ('Club Demo', 'America/Argentina/Buenos_Aires', 90, true, true) $$,
  'with its name, time zone and defaults, its setup still to do');
reset role;
select results_eq(
  $$ select i.email, i.role::text, i.email_status::text, i.invited_by::text
     from public.club_invitations i join public.clubs c on c.id = i.club_id where c.slug = 'demo' $$,
  $$ values ('admin@demo.test', 'admin', 'pending', '00000000-0000-0000-0000-0000000000f1') $$,
  'and the invitation of its first admin, queued for mail');
set local role authenticated;
select results_eq(
  $$ select slug, active_courts, staff, admin_invitation_expires_at is not null, bookings_last_week
     from public.platform_clubs() where slug in ('demo', 'test-club') order by slug $$,
  $$ values ('demo', 0, 0, true, 0), ('test-club', 2, 2, false, 0) $$,
  'the platform lists each club with how far it got');
select lives_ok(
  $$ select public.resend_admin_invitation((select id from public.clubs where slug = 'demo')) $$,
  'the platform admin resends the admin invitation');
select throws_ok(
  $$ select public.resend_admin_invitation('a0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'not_found', 'a club without an open admin invitation has nothing to resend');
select throws_ok(
  $$ select public.finish_club_setup((select id from public.clubs where slug = 'demo')) $$,
  'P0001', 'forbidden', 'the platform admin does not run the club setup');

-- Dani cannot resend the platform's invitations, and finishes his own club's setup (courts and prices are there).
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated", "email": "dani@test.local"}';
select throws_ok(
  $$ select public.resend_admin_invitation('a0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'a club admin cannot use the platform functions');
select lives_ok(
  $$ select public.finish_club_setup('a0000000-0000-0000-0000-000000000001') $$,
  'a club admin finishes the setup of a club with courts and prices');

-- Demo's admin, before courts and prices.
reset role;
insert into public.club_members (club_id, user_id, role)
select id, '00000000-0000-0000-0000-0000000000b1', 'admin' from public.clubs where slug = 'demo';
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated", "email": "bruno@test.local"}';
select throws_ok(
  $$ select public.finish_club_setup((select id from public.clubs where slug = 'demo')) $$,
  'P0001', 'setup_incomplete', 'a club without courts or prices cannot finish');
reset role;
insert into public.courts (club_id, name, sort_order) select id, 'Cancha 1', 1 from public.clubs where slug = 'demo';
insert into public.pricing_rules (club_id, weekdays, from_time, to_time, price)
select id, '{0,1,2,3,4,5,6}', '08:00', '24:00', 1000 from public.clubs where slug = 'demo';
set local role authenticated;
select lives_ok(
  $$ select public.finish_club_setup((select id from public.clubs where slug = 'demo')) $$,
  'with a court and a price it finishes');
select isnt(
  (select setup_completed_at from public.clubs where slug = 'demo'), null,
  'and the club is set up');

select * from finish();
rollback;
