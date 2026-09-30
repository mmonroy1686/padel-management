-- Reception's "Hoy" list reloads when someone buys or cancels, and the player's pass when reception
-- checks her in. Realtime applies the select policy (own passes, or staff) to the rows it streams.
-- The app never deletes passes (cancelling is a status).
alter publication supabase_realtime add table public.day_use_passes;
