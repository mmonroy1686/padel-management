begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(24);

-- Omar (f1) runs the platform; he is not a member of club T.
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000f1');
insert into public.clubs (id, slug, name) values ('a0000000-0000-0000-0000-000000000002', 'otro-club', 'Otro');

select is(
  (select array_agg(attname::text order by attname) from pg_catalog.pg_attribute
    where attrelid = 'public.clubs'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'UPDATE')),
  array['accepts_card', 'accepts_cash', 'accepts_transfer', 'booking_window_days', 'cancellation_notice_hours',
        'closes_at', 'flyer_background_path', 'logo_path', 'loyalty_discount_percent', 'loyalty_enabled',
        'loyalty_every', 'loyalty_expiry_months', 'match_close_minutes', 'max_active_bookings', 'name', 'opens_at',
        'phone', 'slot_minutes', 'transfer_details', 'transfer_receipt_required'],
  'the API updates only the columns Ajustes writes');
select ok(
  not exists (select 1 from pg_catalog.pg_attribute
               where attrelid = 'public.clubs'::regclass and attnum > 0 and not attisdropped
                 and has_column_privilege('anon', attrelid, attnum, 'UPDATE')),
  'a visitor updates nothing');

-- Any writer, even postgres: the timezone is one Postgres knows.
select throws_ok(
  $$ update public.clubs set timezone = 'Mars/Olympus' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  'P0001', 'invalid_timezone', 'an unknown timezone fails for anyone');
select throws_ok(
  $$ insert into public.clubs (slug, name, timezone) values ('nuevo', 'Nuevo', 'nope') $$,
  'P0001', 'invalid_timezone', 'also on a new club');
select lives_ok(
  $$ update public.clubs set timezone = 'America/Argentina/Buenos_Aires' where id = 'a0000000-0000-0000-0000-000000000002' $$,
  'a real one is fine');

set local role authenticated;

-- Dani, admin of club T.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select throws_ok(
  $$ update public.clubs set slug = 'plataforma' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'the admin does not take a reserved slug');
select throws_ok(
  $$ update public.clubs set slug = 'mi-club' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'nor any other slug');
select throws_ok(
  $$ update public.clubs set timezone = 'America/Santiago' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'nor changes the timezone');
select throws_ok(
  $$ update public.clubs set setup_completed_at = null where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'nor reopens the setup');
select throws_ok(
  $$ update public.clubs set id = gen_random_uuid() where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'nor the id');
select throws_ok(
  $$ update public.clubs set created_at = now() where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'nor when it was created');
select throws_ok(
  $$ update public.clubs set brand_primary = '#fcb021' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'the brand goes through save_club_brand');

-- Everything Ajustes writes, at once.
select results_eq(
  $$ update public.clubs
        set name = 'Club T2', phone = '092369558', opens_at = '09:00', closes_at = '22:00', slot_minutes = 60,
            booking_window_days = 7, cancellation_notice_hours = 12, max_active_bookings = 3, match_close_minutes = 120,
            accepts_cash = true, accepts_transfer = true, accepts_card = true, transfer_receipt_required = false,
            transfer_details = 'Otra cuenta', loyalty_enabled = true, loyalty_every = 5, loyalty_discount_percent = 50,
            loyalty_expiry_months = 6, logo_path = 'a0000000-0000-0000-0000-000000000001/logo-1.png',
            flyer_background_path = 'a0000000-0000-0000-0000-000000000001/flyer-1700000000000.jpg'
      where id = 'a0000000-0000-0000-0000-000000000001'
      returning name, slot_minutes::int, accepts_card $$,
  $$ values ('Club T2', 60, true) $$,
  'the admin saves every column of Ajustes');
select is_empty(
  $$ update public.clubs set name = 'Mío' where id = 'a0000000-0000-0000-0000-000000000002' returning id $$,
  'not in another club');
select throws_ok(
  $$ select public.rename_club('a0000000-0000-0000-0000-000000000001', 'mi-club') $$,
  'P0001', 'forbidden', 'renaming is for the platform');

-- Carla, reception; Ana, a player: nothing.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select is_empty(
  $$ update public.clubs set name = 'Recepción' where id = 'a0000000-0000-0000-0000-000000000001' returning id $$,
  'reception changes nothing');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select is_empty(
  $$ update public.clubs set name = 'Jugadora' where id = 'a0000000-0000-0000-0000-000000000001' returning id $$,
  'a player changes nothing');

-- Omar, platform admin: rename_club with the rules of a new club.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select is((public.rename_club('a0000000-0000-0000-0000-000000000001', ' Club-Nuevo ')).slug, 'club-nuevo',
  'the platform moves the club to another address');
select is((public.rename_club('a0000000-0000-0000-0000-000000000001', 'club-nuevo')).slug, 'club-nuevo',
  'the same address is no change');
select throws_ok($$ select public.rename_club('a0000000-0000-0000-0000-000000000001', 'www') $$,
  'P0001', 'slug_reserved', 'not a reserved one');
select throws_ok($$ select public.rename_club('a0000000-0000-0000-0000-000000000001', 'otro-club') $$,
  'P0001', 'slug_taken', 'nor one in use');
select throws_ok($$ select public.rename_club('a0000000-0000-0000-0000-000000000001', 'Con Espacios') $$,
  'P0001', 'invalid_slug', 'nor a malformed one');
select throws_ok($$ select public.rename_club('a0000000-0000-0000-0000-0000000000ff', 'libre') $$,
  'P0001', 'not_found', 'the club exists');

reset role;
set local role anon;
select throws_ok($$ select public.rename_club('a0000000-0000-0000-0000-000000000001', 'libre') $$,
  '42501', null, 'not without signing in');

select * from finish();
rollback;
