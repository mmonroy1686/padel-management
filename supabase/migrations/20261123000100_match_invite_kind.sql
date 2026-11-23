-- Asistente del club, part 0: "te invitan a un partido" goes through the same outbox as the other avisos.
-- Alone in its file: Postgres does not let a transaction use an enum value it just added, and the CLI runs each
-- migration in one transaction.
alter type public.notification_kind add value 'match_invite';
