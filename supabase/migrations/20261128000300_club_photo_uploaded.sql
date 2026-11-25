-- Audit of 24/11, corte B (docs/handoff/2026-11-24-auditoria.md): add_club_photo took any path with the right shape,
-- even with no file behind it, and Inicio showed a broken photo. Now the file has to be in the club-logos bucket
-- first (as report_transfer does with receipts); otherwise photo_missing, and no row. Same signature and grants.
create or replace function public.add_club_photo(p_club_id uuid, p_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_id uuid;
begin
  perform private.require_club_admin(p_club_id);
  perform 1 from public.clubs where id = p_club_id for update;
  select count(*) into v_count from public.club_photos where club_id = p_club_id;
  if v_count >= 8 then
    perform private.fail('too_many_photos');
  end if;
  if p_path is null or split_part(p_path, '/', 1) <> p_club_id::text
     or split_part(p_path, '/', 2) !~ '^photo-[0-9]{1,15}\.jpg$' or split_part(p_path, '/', 3) <> '' then
    perform private.fail('invalid_input');
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'club-logos' and o.name = p_path) then
    perform private.fail('photo_missing');
  end if;
  insert into public.club_photos (club_id, path, position) values (p_club_id, p_path, v_count) returning id into v_id;
  return v_id;
end;
$$;
