-- Fase 2, slice 1: what open matches need to know about a player. Gender decides which matches
-- she can join; availability ("cuándo solés poder jugar") and preferred courts feed "Partidos
-- para vos" and the suggestions. Both lists are private: the player reads her own and writes them
-- through the functions below; nobody else reads them.

create type public.gender as enum ('male', 'female');
create type public.day_band as enum ('morning', 'afternoon', 'night');

alter table public.profiles add column gender public.gender;

-- Hours before the slot when a match that is still forming is cancelled.
alter table public.clubs
  add column match_close_hours smallint not null default 3,
  add constraint clubs_match_close_hours check (match_close_hours between 0 and 48);

-- Bands on the club's clock: morning before 13:00, afternoon 13:00 to 18:00, night from 18:00.
create table public.player_availability (
  user_id uuid not null references public.profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  band public.day_band not null,
  primary key (user_id, weekday, band)
);
alter table public.player_availability enable row level security;

create table public.player_preferred_courts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  court_id uuid not null references public.courts (id) on delete cascade,
  primary key (user_id, court_id)
);
create index player_preferred_courts_court_id_idx on public.player_preferred_courts (court_id);
alter table public.player_preferred_courts enable row level security;

revoke all on public.player_availability, public.player_preferred_courts from anon, authenticated;
grant select on public.player_availability, public.player_preferred_courts to authenticated;

create policy player_availability_select_own on public.player_availability
  for select to authenticated using (user_id = (select auth.uid()));
create policy player_preferred_courts_select_own on public.player_preferred_courts
  for select to authenticated using (user_id = (select auth.uid()));

-- The welcome form and the profile screen now also save the gender (required).
drop function public.save_my_profile(uuid, text, public.player_side, public.dominant_hand, boolean, integer);

create function public.save_my_profile(
  p_club_id uuid,
  p_display_name text,
  p_side public.player_side,
  p_hand public.dominant_hand,
  p_gender public.gender,
  p_is_public boolean,
  p_category integer
)
returns public.club_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := trim(p_display_name);
  v_member public.club_members;
begin
  if v_uid is null then
    perform private.fail('forbidden');
  end if;
  if v_name is null or length(v_name) not between 1 and 60
     or p_side is null or p_hand is null or p_gender is null or p_is_public is null
     or p_category is null or p_category not between 1 and 8 then
    perform private.fail('invalid_input');
  end if;
  if not exists (select 1 from public.clubs where id = p_club_id) then
    perform private.fail('not_found');
  end if;

  update public.profiles
     set display_name = v_name, side = p_side, hand = p_hand, gender = p_gender, is_public = p_is_public
   where id = v_uid;

  insert into public.club_members (club_id, user_id, role, category, category_validated)
  values (p_club_id, v_uid, 'player', p_category, false)
  on conflict (club_id, user_id) do update
    set category = excluded.category,
        category_validated = public.club_members.category_validated
                             and public.club_members.category is not distinct from excluded.category
  returning * into v_member;
  return v_member;
end;
$$;

-- Replaces the caller's bands. Each element is '<weekday>-<band>', like '4-night'.
create function public.save_my_availability(p_slots text[])
returns setof public.player_availability
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
  if p_slots is null or cardinality(p_slots) > 21
     or exists (select 1 from unnest(p_slots) as s (slot) where s.slot is null
                or s.slot !~ '^[0-6]-(morning|afternoon|night)$') then
    perform private.fail('invalid_input');
  end if;

  delete from public.player_availability where user_id = v_uid;
  insert into public.player_availability (user_id, weekday, band)
  select distinct v_uid, split_part(s.slot, '-', 1)::smallint, split_part(s.slot, '-', 2)::public.day_band
  from unnest(p_slots) as s (slot);

  return query select * from public.player_availability where user_id = v_uid order by weekday, band;
end;
$$;

-- Replaces the caller's preferred courts in one club. Only active courts of that club.
create function public.save_my_preferred_courts(p_club_id uuid, p_court_ids uuid[])
returns setof public.player_preferred_courts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not private.is_club_member(p_club_id) then
    perform private.fail('forbidden');
  end if;
  if p_court_ids is null or cardinality(p_court_ids) > 20 or array_position(p_court_ids, null) is not null
     or exists (
       select 1 from unnest(p_court_ids) as u (court_id)
       where not exists (
         select 1 from public.courts c where c.id = u.court_id and c.club_id = p_club_id and c.is_active
       )
     ) then
    perform private.fail('invalid_input');
  end if;

  delete from public.player_preferred_courts p
   using public.courts c
   where p.user_id = v_uid and c.id = p.court_id and c.club_id = p_club_id;
  insert into public.player_preferred_courts (user_id, court_id)
  select distinct v_uid, u.court_id from unnest(p_court_ids) as u (court_id);

  return query
    select p.* from public.player_preferred_courts p
    join public.courts c on c.id = p.court_id
    where p.user_id = v_uid and c.club_id = p_club_id;
end;
$$;

revoke execute on function public.save_my_profile(uuid, text, public.player_side, public.dominant_hand, public.gender,
  boolean, integer) from public, anon;
revoke execute on function public.save_my_availability(text[]) from public, anon;
revoke execute on function public.save_my_preferred_courts(uuid, uuid[]) from public, anon;
grant execute on function public.save_my_profile(uuid, text, public.player_side, public.dominant_hand, public.gender,
  boolean, integer) to authenticated;
grant execute on function public.save_my_availability(text[]) to authenticated;
grant execute on function public.save_my_preferred_courts(uuid, uuid[]) to authenticated;
