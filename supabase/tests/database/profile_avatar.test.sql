begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(9);

-- Ana signed in with Google once; Bruno did not.
update auth.users set raw_user_meta_data = '{"avatar_url": "https://lh3.googleusercontent.com/a/ana"}'
 where id = '00000000-0000-0000-0000-0000000000a1';
insert into storage.objects (bucket_id, name, owner)
values ('avatars', '00000000-0000-0000-0000-0000000000a1/avatar-1700000000000.jpg', '00000000-0000-0000-0000-0000000000a1');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok($$ update public.profiles set avatar_url = 'https://evil.test/x.png' where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'the photo cannot be set by hand');
select lives_ok($$ update public.profiles set display_name = 'Ana P' where id = '00000000-0000-0000-0000-0000000000a1' $$,
  'the rest of the profile still can');

select public.sync_google_avatar();
select is((select avatar_url from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'https://lh3.googleusercontent.com/a/ana', 'a player who never chose gets the Google photo');

select public.set_profile_avatar('00000000-0000-0000-0000-0000000000a1/avatar-1700000000000.jpg');
select is((select avatar_source::text from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'upload',
  'an uploaded photo takes its place');
select public.sync_google_avatar();
select is((select avatar_source::text from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'upload',
  'and signing in with Google again does not replace it');

select throws_ok($$ select public.set_profile_avatar('00000000-0000-0000-0000-0000000000b1/avatar-1.jpg') $$,
  'P0001', 'invalid_input', 'a file in someone else''s folder is refused');
select throws_ok($$ select public.set_profile_avatar('00000000-0000-0000-0000-0000000000a1/avatar-2.jpg') $$,
  'P0001', 'photo_missing', 'a file that was not uploaded is refused');

select public.clear_profile_avatar();
select public.sync_google_avatar();
select is((select avatar_source::text from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'none',
  'a photo removed on purpose stays removed');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select public.sync_google_avatar();
select is((select avatar_source from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), null,
  'without a Google photo nothing changes');

select * from finish();
rollback;
