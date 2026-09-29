-- Local data only (supabase start / db reset). Production is not seeded: Rustic's real data
-- arrives as a data migration (see the fase 1 plan).
-- Prototype values: 3 courts, 08:00-23:00, 90-minute slots (08:00 ... 21:30),
-- $1.200 and $1.600 from 18:30, cash and transfer.
insert into public.clubs (id, slug, name, timezone, opens_at, closes_at, slot_minutes, booking_window_days,
                          cancellation_notice_hours, max_active_bookings, accepts_cash, accepts_transfer,
                          transfer_details, transfer_receipt_required) values
  ('11111111-1111-1111-1111-111111111111', 'rustic', 'Rustic Pádel', 'America/Montevideo', '08:00', '23:00', 90, 14,
   24, 2, true, true,
   'Datos de prueba: Banco Ejemplo, caja de ahorro 000-000000, a nombre de Rustic Pádel.', true)
on conflict (id) do nothing;

insert into public.courts (id, club_id, name, is_covered, sort_order) values
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111', 'Cancha 1', true, 1),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111111', 'Cancha 2', true, 2),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111111', 'Cancha 3', false, 3)
on conflict (id) do nothing;

insert into public.pricing_rules (id, club_id, weekdays, from_time, to_time, price) values
  ('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111111', '{0,1,2,3,4,5,6}', '08:00', '18:30', 1200),
  ('33333333-3333-3333-3333-333333333302', '11111111-1111-1111-1111-111111111111', '{0,1,2,3,4,5,6}', '18:30', '24:00', 1600)
on conflict (id) do nothing;
