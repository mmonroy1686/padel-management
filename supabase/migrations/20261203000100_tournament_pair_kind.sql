-- Americano con parejas fijas, part 0: the aviso to a player about her partner. Alone in its file: Postgres does not
-- let a transaction use an enum value it just added, and the CLI runs each migration in one transaction.
alter type public.notification_kind add value 'tournament_pair';
