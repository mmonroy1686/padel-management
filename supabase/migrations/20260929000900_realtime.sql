-- The club grid and the booking screen listen for occupancy changes and reload the day.
-- Inserts go through the table's select policy and column privileges, so members only hear about
-- their own club and never receive note or created_by. Realtime cannot apply RLS to deletes: with
-- the default replica identity (checked in security_fixes.test.sql) a delete carries only the id.
alter publication supabase_realtime add table public.court_occupancy;
