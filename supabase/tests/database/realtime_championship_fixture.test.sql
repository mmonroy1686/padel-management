begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'
     and tablename in ('championship_matches', 'championship_match_sets')),
  2, 'match and set changes are published to Realtime');
select is(
  (select array_agg(relreplident::text order by relname) from pg_class
   where oid in ('public.championship_matches'::regclass, 'public.championship_match_sets'::regclass)),
  array['d', 'd'], 'both keep the default replica identity');

select * from finish();
rollback;
