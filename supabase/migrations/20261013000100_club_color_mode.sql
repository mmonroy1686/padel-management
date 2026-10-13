-- Marca del club, part 0: how the club shows, following the device, always dark or always light. Alone in its
-- file, like every enum change in this project (see 20261007000100_championship_fixture_kind.sql).
create type public.club_color_mode as enum ('system', 'dark', 'light');
