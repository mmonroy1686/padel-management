-- The club grid and the booking screen listen for occupancy changes and reload the day.
-- Realtime applies the table's select policy, so members only hear about their own club.
alter publication supabase_realtime add table public.court_occupancy;
