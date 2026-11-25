begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(37);

-- A second club, for the "another club" cases.
insert into public.clubs (id, slug, name, timezone) values ('a0000000-0000-0000-0000-000000000002', 'otro', 'Otro', 'America/Montevideo');

-- The files the browser uploaded: photo-1 to photo-9 of club T, and one of the other club.
insert into storage.objects (bucket_id, name)
select 'club-logos', 'a0000000-0000-0000-0000-000000000001/photo-' || n || '.jpg' from generate_series(1, 9) as n
union all select 'club-logos', 'a0000000-0000-0000-0000-000000000002/photo-1.jpg';

create function test_helpers.save_info(
  p_address text default 'Av. Italia 1234',
  p_latitude double precision default -34.9,
  p_longitude double precision default -56.1,
  p_maps text default 'https://maps.app.goo.gl/abc123',
  p_phone text default '+598 92 369 558',
  p_instagram text default '@Rustic.Padel',
  p_email text default 'Hola@Rustic.uy',
  p_amenities text[] default array['wifi', 'bar', 'wifi'],
  p_club uuid default 'a0000000-0000-0000-0000-000000000001'
) returns void language sql as $$
  select public.save_club_info(p_club, p_address, p_latitude, p_longitude, p_maps, p_phone, p_instagram, p_email, p_amenities)
$$;

create function test_helpers.photo_order(p_club uuid default 'a0000000-0000-0000-0000-000000000001')
returns text language sql stable as $$
  select string_agg(split_part(path, '/', 2), ',' order by position) from public.club_photos where club_id = p_club
$$;

-- The direct-update checks.
select throws_ok(
  $$ update public.clubs set latitude = -34.9 where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a latitude without a longitude is not a place');
select throws_ok(
  $$ update public.clubs set amenities = array['pool'] where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'services come from the list');

set local role authenticated;

-- Dani, admin of club T.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select lives_ok($$ select test_helpers.save_info() $$, 'the admin saves the club info');
select results_eq(
  $$ select address, latitude, longitude, google_maps_url, phone, instagram, contact_email, amenities
       from public.clubs where id = 'a0000000-0000-0000-0000-000000000001' $$,
  $$ values ('Av. Italia 1234', -34.9::double precision, -56.1::double precision, 'https://maps.app.goo.gl/abc123',
             '092369558', 'rustic.padel', 'hola@rustic.uy', array['bar', 'wifi']) $$,
  'phone normalized, @ and case dropped, services once each in list order');

select lives_ok(
  $$ select test_helpers.save_info(p_address => '  ', p_latitude => null, p_longitude => null, p_maps => '',
       p_phone => '', p_instagram => '', p_email => '', p_amenities => '{}') $$,
  'everything can be cleared');
select results_eq(
  $$ select address, latitude, google_maps_url, phone, instagram, contact_email, amenities
       from public.clubs where id = 'a0000000-0000-0000-0000-000000000001' $$,
  $$ values (null::text, null::double precision, null::text, null::text, null::text, null::text, '{}'::text[]) $$,
  'and is left empty');

select throws_ok($$ select test_helpers.save_info(p_longitude => null) $$, 'P0001', 'invalid_location',
  'a pin needs both coordinates');
select throws_ok($$ select test_helpers.save_info(p_latitude => 91) $$, 'P0001', 'invalid_location',
  'and real ones');
select throws_ok($$ select test_helpers.save_info(p_maps => 'https://evil.example/maps') $$, 'P0001', 'invalid_maps_url',
  'the map link is a Google Maps one');
select throws_ok($$ select test_helpers.save_info(p_maps => 'http://maps.app.goo.gl/abc') $$, 'P0001', 'invalid_maps_url',
  'over https');
select throws_ok($$ select test_helpers.save_info(p_maps => 'https://google.evil.com/maps/place/x') $$, 'P0001',
  'invalid_maps_url', 'on Google itself, not a look-alike host');
select lives_ok(
  $$ select test_helpers.save_info(p_maps => 'https://www.google.com/maps/place/Rustic/@-34.9,-56.1,17z') $$,
  'a long Google Maps link is fine');
select throws_ok($$ select test_helpers.save_info(p_phone => '12') $$, 'P0001', 'invalid_phone', 'the WhatsApp is a phone');
select throws_ok($$ select test_helpers.save_info(p_instagram => 'no spaces') $$, 'P0001', 'invalid_instagram',
  'Instagram is a user name');
select throws_ok($$ select test_helpers.save_info(p_email => 'nope') $$, 'P0001', 'invalid_email', 'the email is one');
select throws_ok($$ select test_helpers.save_info(p_amenities => array['pool']) $$, 'P0001', 'invalid_amenity',
  'services come from the list');
select throws_ok($$ select test_helpers.save_info(p_address => repeat('a', 201)) $$, 'P0001', 'invalid_input',
  'the address has a limit');
select throws_ok($$ select test_helpers.save_info(p_club => 'a0000000-0000-0000-0000-000000000002') $$, 'P0001',
  'forbidden', 'not for another club');

-- Photos.
select throws_ok(
  $$ select public.add_club_photo('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001/photo-50.jpg') $$,
  'P0001', 'photo_missing', 'a photo whose file was not uploaded');
select is((select count(*)::int from public.club_photos where path like '%/photo-50.jpg'), 0, 'leaves no row');
select lives_ok(
  $$ select public.add_club_photo('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001/photo-' || n || '.jpg')
       from generate_series(1, 8) as n $$,
  'the admin adds 8 photos');
select is(test_helpers.photo_order(),
  'photo-1.jpg,photo-2.jpg,photo-3.jpg,photo-4.jpg,photo-5.jpg,photo-6.jpg,photo-7.jpg,photo-8.jpg', 'each one last');
select throws_ok(
  $$ select public.add_club_photo('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001/photo-9.jpg') $$,
  'P0001', 'too_many_photos', 'not a ninth');
select throws_ok(
  $$ select public.add_club_photo('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002/photo-1.jpg') $$,
  'P0001', 'forbidden', 'nor in another club');

select lives_ok(
  $$ select public.remove_club_photo(id) from public.club_photos where path like '%/photo-3.jpg' $$, 'the admin removes one');
select is(test_helpers.photo_order(),
  'photo-1.jpg,photo-2.jpg,photo-4.jpg,photo-5.jpg,photo-6.jpg,photo-7.jpg,photo-8.jpg', 'and the gap closes');
select throws_ok(
  $$ select public.add_club_photo('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002/photo-9.jpg') $$,
  'P0001', 'invalid_input', 'a photo lives in the club''s folder');

select lives_ok($$ select public.move_club_photo(id, -1) from public.club_photos where path like '%/photo-4.jpg' $$,
  'moves one back');
select lives_ok($$ select public.move_club_photo(id, -1) from public.club_photos where path like '%/photo-1.jpg' $$,
  'the first one stays first');
select is(test_helpers.photo_order(),
  'photo-1.jpg,photo-4.jpg,photo-2.jpg,photo-5.jpg,photo-6.jpg,photo-7.jpg,photo-8.jpg', 'in the new order');
select lives_ok($$ select public.move_club_photo(id, 1) from public.club_photos where path like '%/photo-8.jpg' $$,
  'the last one forward stays last');
select throws_ok($$ select public.move_club_photo(id, 2) from public.club_photos where path like '%/photo-8.jpg' $$,
  'P0001', 'invalid_input', 'a photo moves one place at a time');
select throws_ok(
  $$ select public.add_club_photo('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001/photo-1.jpg') $$,
  '23505', null, 'the same file is not added twice');
select throws_ok(
  $$ insert into public.club_photos (club_id, path, position)
     values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001/photo-99.jpg', 7) $$,
  '42501', null, 'photos are written only through the functions');

-- Carla, reception: not hers to change.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok($$ select test_helpers.save_info() $$, 'P0001', 'forbidden', 'reception does not edit the club info');
select throws_ok($$ select public.remove_club_photo(id) from public.club_photos limit 1 $$, 'P0001', 'forbidden',
  'nor its photos');

-- Anyone, even without signing in, sees the photos.
reset role;
set local role anon;
select is((select count(*)::int from public.club_photos), 7, 'a visitor sees the club photos');

select * from finish();
rollback;
