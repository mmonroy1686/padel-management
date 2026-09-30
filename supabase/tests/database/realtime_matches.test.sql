begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('open_matches', 'match_slots')),
  2, 'match and spot changes are published to Realtime');
select is(
  (select array_agg(relreplident::text order by relname) from pg_class
   where oid in ('public.open_matches'::regclass, 'public.match_slots'::regclass)),
  array['d', 'd'], 'both keep the default replica identity');

select * from finish();
rollback;
