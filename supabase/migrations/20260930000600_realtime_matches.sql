-- The match screens, Inicio, Reservar and the club grid reload when a match or one of its spots
-- changes. Realtime applies the select policies (members of the club) to the rows it streams; these
-- tables carry nothing a member may not read. Matches and spots are never deleted by the app.
alter publication supabase_realtime add table public.open_matches, public.match_slots;
