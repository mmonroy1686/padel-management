-- The avisos of a player's bookings and matches (docs/features/avisos-de-reservas/design.md). A new enum value cannot
-- be used in the transaction that adds it, so they go here and 20261207000110 uses them.
alter type public.notification_kind add value 'booking_confirmed';
alter type public.notification_kind add value 'booking_series';
alter type public.notification_kind add value 'booking_reminder';
alter type public.notification_kind add value 'booking_cancelled';
alter type public.notification_kind add value 'booking_removed';
alter type public.notification_kind add value 'match_confirmed';
alter type public.notification_kind add value 'match_cancelled';
alter type public.notification_kind add value 'match_left';
alter type public.notification_kind add value 'payment_confirmed';
alter type public.notification_kind add value 'payment_rejected';
alter type public.notification_kind add value 'payment_refunded';
