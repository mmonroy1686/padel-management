begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select has_extension('extensions', 'btree_gist', 'btree_gist is installed for the occupancy constraint');
select has_table('public', 'clubs', 'clubs exists');
select has_table('public', 'courts', 'courts exists');
select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'club_members', 'club_members exists');

select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  $$,
  'every table in public has RLS enabled'
);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'lucia@test.local', '{"full_name": "Lucía Gómez"}'),
  ('00000000-0000-0000-0000-0000000000f2', 'mateo@test.local', '{}');

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000f1'),
  'Lucía Gómez',
  'new user gets a profile named after the provider full name'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000f2'),
  'mateo',
  'without a full name the profile falls back to the email user'
);

select * from finish();
rollback;
