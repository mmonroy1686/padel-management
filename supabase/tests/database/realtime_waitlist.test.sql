begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('notifications', 'slot_waits')),
  2, 'avisos and waits are published to Realtime');
select is(
  (select relreplident::text from pg_class where oid = 'public.notifications'::regclass),
  'd', 'avisos keep the default replica identity');
select is(
  (select relreplident::text from pg_class where oid = 'public.slot_waits'::regclass),
  'd', 'waits keep the default replica identity');

select * from finish();
rollback;
