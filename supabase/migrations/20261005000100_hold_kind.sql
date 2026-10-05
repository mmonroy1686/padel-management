-- Lista de espera, part 0: a hold is one more kind of occupancy. Alone in its file: Postgres does not
-- let a transaction use an enum value it just added, and the CLI runs each migration in one transaction.
alter type public.occupancy_kind add value 'hold';
