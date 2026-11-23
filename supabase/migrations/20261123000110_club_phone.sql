-- Asistente del club, part 1: the club's WhatsApp, for the free-slots flyer and its text. Digits only, the way
-- private.normalize_phone writes them (lib/domain/championships.ts normalizePhone does the same in the app).
-- Admins edit it in Ajustes, like the name (the clubs update policy already limits it to them).
alter table public.clubs
  add column phone text constraint clubs_phone_digits check (phone ~ '^[0-9]{8,15}$');
