-- Campeonatos, día del torneo, part 0: "the fixture is out" goes through the same outbox as the other avisos.
-- Alone in its file: Postgres does not let a transaction use an enum value it just added, and the CLI runs each
-- migration in one transaction.
alter type public.notification_kind add value 'championship_fixture';
