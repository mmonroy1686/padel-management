-- The organizer's day board, the member's championship page and the club grid reload when a match or a set
-- changes. Realtime applies the select policies (private.fixture_visible) to the rows it streams.
alter publication supabase_realtime add table public.championship_matches, public.championship_match_sets;
