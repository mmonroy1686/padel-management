-- Local data only (supabase start / db reset). Production is not seeded.
-- Placeholder until Rustic sends its real courts and opening hours.
insert into public.clubs (id, slug, name, timezone, cancellation_notice_hours) values
  ('11111111-1111-1111-1111-111111111111', 'rustic', 'Rustic Pádel', 'America/Montevideo', 24)
on conflict (id) do nothing;

insert into public.courts (id, club_id, name, is_covered, sort_order) values
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111', 'Cancha 1', true, 1),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111111', 'Cancha 2', true, 2),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111111', 'Cancha 3', false, 3)
on conflict (id) do nothing;
