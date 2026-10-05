-- The player's bell and banner reload when an aviso arrives (LiveNotifications, filtered by user_id);
-- the club's "En espera" panel when someone signs up or a wait ends (LiveOccupancy). Realtime applies
-- the select policies: each player hears her own avisos and waits, staff every wait of the club.
-- The app never deletes either (a wait ends with a status).
alter publication supabase_realtime add table public.notifications, public.slot_waits;
