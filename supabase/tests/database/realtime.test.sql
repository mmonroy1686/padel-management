begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'court_occupancy'),
  1, 'occupancy changes are published to Realtime');

select * from finish();
rollback;
