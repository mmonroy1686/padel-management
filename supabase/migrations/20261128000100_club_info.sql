-- Datos del club: what a player sees about the club at the end of Inicio (address, map pin, Google Maps link, contact,
-- services and photos). Admins edit them in Ajustes → "Datos del club" through save_club_info; the checks below have the
-- last word even on a direct update of clubs. WhatsApp is clubs.phone, the same as the flyer's.
alter table public.clubs
  add column address text constraint clubs_address_length check (length(address) between 1 and 200),
  add column latitude double precision constraint clubs_latitude_range check (latitude between -90 and 90),
  add column longitude double precision constraint clubs_longitude_range check (longitude between -180 and 180),
  add column google_maps_url text constraint clubs_google_maps_url_shape check (
    length(google_maps_url) <= 500
    and google_maps_url ~* '^https://((www\.)?google\.(com|[a-z]{2}|com?\.[a-z]{2})/maps([/?]|$)|maps\.google\.(com|[a-z]{2}|com?\.[a-z]{2})/|maps\.app\.goo\.gl/|goo\.gl/maps/)'
  ),
  add column instagram text constraint clubs_instagram_shape check (instagram ~ '^[a-z0-9._]{1,30}$'),
  add column contact_email text constraint clubs_contact_email_shape check (
    length(contact_email) <= 200 and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  add column amenities text[] not null default '{}' constraint clubs_amenities_known check (
    amenities <@ array['lockers', 'showers', 'parking', 'bar', 'racket_rental', 'balls', 'covered', 'wifi', 'accessible']
  ),
  add constraint clubs_location_both check ((latitude is null) = (longitude is null));

-- Up to 8 photos per club, in the club's folder of the public club-logos bucket. position 0 is the cover. Anyone reads
-- them (the bucket is public too); writes go through the functions below, which lock the club so the limit and the
-- order hold with two tabs open.
create table public.club_photos (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  path text not null unique,
  position smallint not null constraint club_photos_position_range check (position between 0 and 7),
  created_at timestamptz not null default now(),
  constraint club_photos_in_own_folder check (
    split_part(path, '/', 1) = club_id::text and split_part(path, '/', 2) ~ '^photo-[0-9]{1,15}\.jpg$'
    and split_part(path, '/', 3) = ''
  ),
  constraint club_photos_position_unique unique (club_id, position) deferrable initially deferred
);

alter table public.club_photos enable row level security;
revoke all on public.club_photos from anon, authenticated;
grant select on public.club_photos to anon, authenticated;
create policy club_photos_select_all on public.club_photos for select to anon, authenticated using (true);

create function private.require_club_admin(p_club_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_club_id is null or not private.has_club_role(p_club_id, array['admin']::public.club_role[]) then
    perform private.fail('forbidden');
  end if;
end;
$$;

revoke all on function private.require_club_admin(uuid) from public;

-- Ajustes → "Datos del club", all at once. Empty texts are null; services are kept once each, in a stable order.
create function public.save_club_info(
  p_club_id uuid,
  p_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_google_maps_url text,
  p_phone text,
  p_instagram text,
  p_contact_email text,
  p_amenities text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_address text := nullif(btrim(p_address), '');
  v_maps text := nullif(btrim(p_google_maps_url), '');
  v_phone_raw text := nullif(btrim(p_phone), '');
  v_phone text := private.normalize_phone(p_phone);
  v_instagram text := nullif(lower(ltrim(btrim(p_instagram), '@')), '');
  v_email text := nullif(lower(btrim(p_contact_email)), '');
  v_amenities text[];
begin
  perform private.require_club_admin(p_club_id);
  if v_address is not null and length(v_address) > 200 then
    perform private.fail('invalid_input');
  end if;
  if (p_latitude is null) <> (p_longitude is null)
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    perform private.fail('invalid_location');
  end if;
  if v_maps is not null and (
    length(v_maps) > 500
    or v_maps !~* '^https://((www\.)?google\.(com|[a-z]{2}|com?\.[a-z]{2})/maps([/?]|$)|maps\.google\.(com|[a-z]{2}|com?\.[a-z]{2})/|maps\.app\.goo\.gl/|goo\.gl/maps/)'
  ) then
    perform private.fail('invalid_maps_url');
  end if;
  if v_phone_raw is not null and v_phone is null then
    perform private.fail('invalid_phone');
  end if;
  if v_instagram is not null and v_instagram !~ '^[a-z0-9._]{1,30}$' then
    perform private.fail('invalid_instagram');
  end if;
  if v_email is not null and (length(v_email) > 200 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    perform private.fail('invalid_email');
  end if;
  select coalesce(array_agg(known.key order by known.ord), '{}') into v_amenities
    from unnest(array['lockers', 'showers', 'parking', 'bar', 'racket_rental', 'balls', 'covered', 'wifi', 'accessible'])
         with ordinality as known (key, ord)
   where known.key = any (coalesce(p_amenities, '{}'));
  if exists (select 1 from unnest(coalesce(p_amenities, '{}')) as given (key) where given.key is null or not given.key = any (v_amenities)) then
    perform private.fail('invalid_amenity');
  end if;

  update public.clubs
     set address = v_address, latitude = p_latitude, longitude = p_longitude, google_maps_url = v_maps,
         phone = v_phone, instagram = v_instagram, contact_email = v_email, amenities = v_amenities
   where id = p_club_id;
end;
$$;

-- A photo already uploaded to the club's folder goes last.
create function public.add_club_photo(p_club_id uuid, p_path text)
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
  insert into public.club_photos (club_id, path, position) values (p_club_id, p_path, v_count) returning id into v_id;
  return v_id;
end;
$$;

-- Takes a photo out and closes the gap; returns its path so the app deletes the file.
create function public.remove_club_photo(p_photo_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo public.club_photos;
begin
  select * into v_photo from public.club_photos where id = p_photo_id;
  if not found then
    perform private.fail('not_found');
  end if;
  perform private.require_club_admin(v_photo.club_id);
  perform 1 from public.clubs where id = v_photo.club_id for update;
  -- Again under the lock: a move may have changed its place meanwhile.
  select * into v_photo from public.club_photos where id = p_photo_id;
  if not found then
    perform private.fail('not_found');
  end if;
  delete from public.club_photos where id = p_photo_id;
  update public.club_photos set position = position - 1
   where club_id = v_photo.club_id and position > v_photo.position;
  return v_photo.path;
end;
$$;

-- Swaps a photo with the one before (-1) or after (+1) it. At either end it stays where it is.
create function public.move_club_photo(p_photo_id uuid, p_step integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo public.club_photos;
begin
  if p_step is null or p_step not in (-1, 1) then
    perform private.fail('invalid_input');
  end if;
  select * into v_photo from public.club_photos where id = p_photo_id;
  if not found then
    perform private.fail('not_found');
  end if;
  perform private.require_club_admin(v_photo.club_id);
  perform 1 from public.clubs where id = v_photo.club_id for update;
  select * into v_photo from public.club_photos where id = p_photo_id;
  update public.club_photos
     set position = case when id = p_photo_id then position + p_step else position - p_step end
   where club_id = v_photo.club_id
     and (id = p_photo_id or position = v_photo.position + p_step)
     and exists (select 1 from public.club_photos where club_id = v_photo.club_id and position = v_photo.position + p_step);
end;
$$;

revoke execute on function public.save_club_info(uuid, text, double precision, double precision, text, text, text, text, text[])
  from public, anon;
revoke execute on function public.add_club_photo(uuid, text) from public, anon;
revoke execute on function public.remove_club_photo(uuid) from public, anon;
revoke execute on function public.move_club_photo(uuid, integer) from public, anon;
grant execute on function public.save_club_info(uuid, text, double precision, double precision, text, text, text, text, text[])
  to authenticated;
grant execute on function public.add_club_photo(uuid, text) to authenticated;
grant execute on function public.remove_club_photo(uuid) to authenticated;
grant execute on function public.move_club_photo(uuid, integer) to authenticated;
