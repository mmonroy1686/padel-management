-- The player's photo: one they upload (bucket avatars, their own folder), the Google one, or none (their initials).
-- avatar_source null = never decided: the Google photo is copied on sign-in. 'none' = removed on purpose: it is not
-- copied again. The columns change only through these functions, so nobody points a profile at any URL.
create type public.avatar_source as enum ('upload', 'google', 'none');

alter table public.profiles
  add column avatar_source public.avatar_source,
  -- upload: <user_id>/<file> in the avatars bucket.
  add column avatar_path text,
  -- google: the picture URL from the Google account.
  add column avatar_url text,
  add constraint profiles_avatar_path_own_folder check (
    avatar_path is null or (split_part(avatar_path, '/', 1) = id::text and length(avatar_path) <= 200)
  ),
  add constraint profiles_avatar_url_https check (avatar_url is null or (avatar_url ~ '^https://' and length(avatar_url) <= 500)),
  add constraint profiles_avatar_consistent check (
    (avatar_source is distinct from 'upload' or avatar_path is not null)
    and (avatar_source is distinct from 'google' or avatar_url is not null)
  );

-- Players keep editing their own data, column by column; the photo only through the functions below.
revoke update on public.profiles from authenticated;
grant update (display_name, side, hand, is_public, gender, show_in_club) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and private.folder_owner(name) = (select auth.uid()));

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and private.folder_owner(name) = (select auth.uid()));

-- "Cambiar foto": the file is already in the player's folder (the browser uploads first).
create function public.set_profile_avatar(p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    perform private.fail('forbidden');
  end if;
  if p_path is null or split_part(p_path, '/', 1) <> v_uid::text or split_part(p_path, '/', 3) <> ''
     or split_part(p_path, '/', 2) !~ '^avatar-[0-9]{1,15}\.(jpg|png|webp)$' then
    perform private.fail('invalid_input');
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = p_path) then
    perform private.fail('photo_missing');
  end if;
  update public.profiles set avatar_source = 'upload', avatar_path = p_path, avatar_url = null where id = v_uid;
end;
$$;

-- "Quitar foto": initials from now on, and the Google photo is not copied back.
create function public.clear_profile_avatar()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    perform private.fail('forbidden');
  end if;
  update public.profiles set avatar_source = 'none', avatar_path = null, avatar_url = null where id = (select auth.uid());
end;
$$;

-- On sign-in: a player who never chose gets the photo of their Google account (avatar_url or picture in its
-- metadata). Read from auth.users here, never from the browser.
create function public.sync_google_avatar()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_url text;
begin
  if v_uid is null then
    return;
  end if;
  select coalesce(nullif(u.raw_user_meta_data ->> 'avatar_url', ''), nullif(u.raw_user_meta_data ->> 'picture', ''))
    into v_url
    from auth.users u where u.id = v_uid;
  if v_url is null or v_url !~ '^https://' or length(v_url) > 500 then
    return;
  end if;
  update public.profiles set avatar_source = 'google', avatar_url = v_url
   where id = v_uid and avatar_source is null;
end;
$$;

revoke execute on function public.set_profile_avatar(text) from public, anon;
revoke execute on function public.clear_profile_avatar() from public, anon;
revoke execute on function public.sync_google_avatar() from public, anon;
grant execute on function public.set_profile_avatar(text) to authenticated;
grant execute on function public.clear_profile_avatar() to authenticated;
grant execute on function public.sync_google_avatar() to authenticated;
