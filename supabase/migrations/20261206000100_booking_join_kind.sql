-- The aviso to a booking's holder when someone joins it from the shared link (design: docs/features/compartir-turno).
-- A value of its own migration: an enum value cannot be used in the transaction that adds it.
alter type public.notification_kind add value 'booking_join';
