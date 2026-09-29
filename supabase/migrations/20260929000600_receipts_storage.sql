-- Transfer receipts. Private bucket, one folder per user: receipts/<user_id>/<file>.
-- A player uploads and reads her own; reception and admin read the receipts of their club's members.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

-- The user a receipt belongs to: the first folder of its name, when it is a uuid.
create function private.folder_owner(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

revoke all on function private.folder_owner(text) from public;
grant execute on function private.folder_owner(text) to authenticated;

create policy receipts_insert_own_folder on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and private.folder_owner(name) = (select auth.uid()));

create policy receipts_select_own_or_staff on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and (
      private.folder_owner(name) = (select auth.uid())
      or private.is_staff_of_user(private.folder_owner(name))
    )
  );
