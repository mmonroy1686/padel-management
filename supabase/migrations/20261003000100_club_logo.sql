-- The club's logo, shown on every screen. Public bucket, one folder per club: club-logos/<club_id>/<file>.
-- Only the club's admins upload; clubs.logo_path points at the current file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('club-logos', 'club-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

alter table public.clubs
  add column logo_path text,
  add constraint clubs_logo_in_own_folder check (
    logo_path is null or (split_part(logo_path, '/', 1) = id::text and length(logo_path) <= 200)
  );

create policy club_logos_insert_admin on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'club-logos'
    and private.has_club_role(private.folder_owner(name), array['admin']::public.club_role[])
  );

create policy club_logos_delete_admin on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'club-logos'
    and private.has_club_role(private.folder_owner(name), array['admin']::public.club_role[])
  );
