begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'day_use_passes'),
  1, 'pass changes are published to Realtime');
select is(
  (select relreplident::text from pg_class where oid = 'public.day_use_passes'::regclass),
  'd', 'passes keep the default replica identity');

select * from finish();
rollback;
