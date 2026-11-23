-- Asistente del club, part 5: a background photo for the free-slots flyer, set in Ajustes. The browser blurs and
-- shrinks it before uploading it to the club's folder of the club-logos bucket (same admin-only policies as the
-- logo); clubs.flyer_background_path points at the current file. Admins update clubs directly, like the logo.
alter table public.clubs
  add column flyer_background_path text,
  add constraint clubs_flyer_background_in_own_folder check (
    flyer_background_path is null
    or (split_part(flyer_background_path, '/', 1) = id::text and length(flyer_background_path) <= 200)
  );
