-- Campeonatos, part 0 bis: the avisos of a championship go through the waitlist outbox. Alone in its file
-- for the same reason as 20261006000100.
alter type public.notification_kind add value 'championship_added';
alter type public.notification_kind add value 'championship_promoted';
alter type public.notification_kind add value 'championship_moved';
alter type public.notification_kind add value 'championship_cancelled';
