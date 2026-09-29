begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.clubs (id, slug, name) values
  ('a0000000-0000-0000-0000-000000000001', 'test-club-a', 'Club A'),
  ('a0000000-0000-0000-0000-000000000002', 'test-club-b', 'Club B');

insert into public.courts (id, club_id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Cancha 1'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Cancha 2'),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'Cancha 1');

select has_table('public', 'court_occupancy', 'court_occupancy exists');

select lives_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             tstzrange('2026-10-01 19:00-03', '2026-10-01 20:30-03')) $$,
  'books a free slot'
);

select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'block',
             tstzrange('2026-10-01 20:00-03', '2026-10-01 21:30-03')) $$,
  '23P01', null,
  'rejects any overlapping occupancy on the same court, whatever its kind'
);

select lives_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             tstzrange('2026-10-01 20:30-03', '2026-10-01 22:00-03')) $$,
  'allows back-to-back slots'
);

select lives_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'booking',
             tstzrange('2026-10-01 19:00-03', '2026-10-01 20:30-03')) $$,
  'allows the same time on another court'
);

select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'booking',
             tstzrange('2026-10-02 19:00-03', '2026-10-02 20:30-03')) $$,
  '23503', null,
  'rejects a court that belongs to another club'
);

select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'booking',
             tstzrange('2026-10-02 19:00-03', '2026-10-02 19:00-03')) $$,
  '23514', null,
  'rejects an empty period'
);

select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'block',
             tstzrange('2026-10-02 19:00-03', null)) $$,
  '23514', null,
  'rejects an open-ended period'
);

select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'booking',
             tstzrange('2026-10-03 19:00-03', '2026-10-03 20:30-03', '[]')) $$,
  '23514', null,
  'rejects closed ranges so the end of one slot is free for the next'
);

select * from finish();
rollback;
