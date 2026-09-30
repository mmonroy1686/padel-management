-- The tournament screens, the lists and the club grid reload when a tournament, an entry or a game
-- changes. Realtime applies the select policies (members of the club) to the rows it streams; these
-- tables carry nothing a member may not read. The app never deletes them (entries are marked removed).
alter publication supabase_realtime add table public.tournaments, public.tournament_entries, public.tournament_games;
