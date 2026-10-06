-- Campeonatos, part 2: the draft. Staff create a championship and add its days of play, its categories and
-- its poster; members find a partner among the club's members; phones go only to staff and to the pair.

-- Locks a championship.
create function private.lock_championship(p_championship_id uuid)
returns public.championships
language plpgsql
set search_path = ''
as $$
declare
  v_championship public.championships;
begin
  select * into v_championship from public.championships where id = p_championship_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  return v_championship;
end;
$$;

-- Locks a championship and checks the caller is staff of its club.
create function private.staff_championship(p_championship_id uuid)
returns public.championships
language plpgsql
set search_path = ''
as $$
declare
  v_championship public.championships := private.lock_championship(p_championship_id);
begin
  if not private.is_staff(v_championship.club_id) then
    perform private.fail('forbidden');
  end if;
  return v_championship;
end;
$$;

-- A day of play as an instant range, on the club's clock.
create function private.window_period(p_window public.championship_windows, p_timezone text)
returns tstzrange
language sql
stable
set search_path = ''
as $$
  select tstzrange((p_window.on_date + p_window.from_time) at time zone p_timezone,
                   (p_window.on_date + p_window.to_time) at time zone p_timezone);
$$;

-- When the first match can start: the start of the first day of play (null without days).
create function private.championship_starts_at(p_championship_id uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select min(lower(private.window_period(w, c.timezone)))
  from public.championship_windows w
  join public.clubs c on c.id = w.club_id
  where w.championship_id = p_championship_id;
$$;

create function public.create_championship(
  p_club_id uuid,
  p_name text,
  p_rules text default '',
  p_max_categories integer default 2,
  p_registration_closes_at timestamptz default null
)
returns public.championships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(p_name);
  v_rules text := coalesce(trim(p_rules), '');
  v_championship public.championships;
begin
  if not private.is_staff(p_club_id) then
    perform private.fail('forbidden');
  end if;
  if v_name is null or length(v_name) not between 1 and 80 or length(v_rules) > 5000
     or p_max_categories is null or p_max_categories not between 1 and 5 then
    perform private.fail('invalid_input');
  end if;
  if p_registration_closes_at is not null and p_registration_closes_at <= now() then
    perform private.fail('in_the_past');
  end if;

  insert into public.championships (club_id, name, rules, max_categories_per_player, registration_closes_at, created_by)
  values (p_club_id, v_name, v_rules, p_max_categories, p_registration_closes_at, (select auth.uid()))
  returning * into v_championship;
  return v_championship;
end;
$$;

-- Name, rules, the categories limit and the deadline. Once registration opened there is always a deadline
-- (an empty one keeps the current one), and it is not after the first match.
create function public.update_championship(
  p_championship_id uuid,
  p_name text,
  p_rules text default '',
  p_max_categories integer default 2,
  p_registration_closes_at timestamptz default null
)
returns public.championships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
  v_name text := trim(p_name);
  v_rules text := coalesce(trim(p_rules), '');
  v_closes timestamptz;
begin
  if v_championship.status in ('finished', 'cancelled') then
    perform private.fail('invalid_state');
  end if;
  if v_name is null or length(v_name) not between 1 and 80 or length(v_rules) > 5000
     or p_max_categories is null or p_max_categories not between 1 and 5 then
    perform private.fail('invalid_input');
  end if;
  v_closes := case
    when v_championship.status = 'draft' then p_registration_closes_at
    else coalesce(p_registration_closes_at, v_championship.registration_closes_at)
  end;
  if v_closes is distinct from v_championship.registration_closes_at and v_closes <= now() then
    perform private.fail('in_the_past');
  end if;
  if v_championship.status <> 'draft' and v_closes > private.championship_starts_at(v_championship.id) then
    perform private.fail('invalid_input');
  end if;

  update public.championships
     set name = v_name, rules = v_rules, max_categories_per_player = p_max_categories,
         registration_closes_at = v_closes
   where id = v_championship.id
  returning * into v_championship;
  return v_championship;
end;
$$;

-- A day of play of a draft: a future date, inside the club's hours, on active courts of the club, and not
-- over another day of the same championship on a shared court.
create function public.add_championship_window(
  p_championship_id uuid,
  p_date date,
  p_from time,
  p_to time,
  p_court_ids uuid[]
)
returns public.championship_windows
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
  v_club public.clubs;
  v_window public.championship_windows;
begin
  if v_championship.status <> 'draft' then
    perform private.fail('invalid_state');
  end if;
  select * into v_club from public.clubs where id = v_championship.club_id;
  if p_date is null or p_from is null or p_to is null or p_from >= p_to
     or p_court_ids is null or cardinality(p_court_ids) not between 1 and 20
     or array_position(p_court_ids, null) is not null
     or (select count(distinct u.court_id) from unnest(p_court_ids) as u (court_id)) <> cardinality(p_court_ids)
     or exists (
       select 1 from unnest(p_court_ids) as u (court_id)
       where not exists (
         select 1 from public.courts c where c.id = u.court_id and c.club_id = v_club.id and c.is_active
       )
     ) then
    perform private.fail('invalid_input');
  end if;
  if p_from < v_club.opens_at or p_to > v_club.closes_at then
    perform private.fail('outside_hours');
  end if;
  if (p_date + p_from) at time zone v_club.timezone <= now() then
    perform private.fail('in_the_past');
  end if;
  if exists (
    select 1 from public.championship_windows w
    where w.championship_id = v_championship.id and w.on_date = p_date
      and w.from_time < p_to and w.to_time > p_from and w.court_ids && p_court_ids
  ) then
    perform private.fail('courts_busy');
  end if;

  insert into public.championship_windows (club_id, championship_id, on_date, from_time, to_time, court_ids)
  values (v_championship.club_id, v_championship.id, p_date, p_from, p_to, p_court_ids)
  returning * into v_window;
  return v_window;
end;
$$;

create function public.delete_championship_window(p_window_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window public.championship_windows;
  v_championship public.championships;
begin
  select * into v_window from public.championship_windows where id = p_window_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.staff_championship(v_window.championship_id);
  if v_championship.status <> 'draft' then
    perform private.fail('invalid_state');
  end if;
  delete from public.championship_windows where id = v_window.id;
end;
$$;

-- The levels go last, with defaults: a category without them leaves them out.
create function public.add_championship_category(
  p_championship_id uuid,
  p_name text,
  p_gender public.championship_gender,
  p_min_pairs integer,
  p_max_pairs integer,
  p_price integer,
  p_format public.championship_format,
  p_group_size integer,
  p_qualifiers integer,
  p_match_minutes integer,
  p_seeding public.championship_seeding,
  p_third_set text,
  p_golden_point boolean,
  p_level_min integer default null,
  p_level_max integer default null
)
returns public.championship_categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
  v_name text := trim(p_name);
  v_category public.championship_categories;
begin
  if v_championship.status <> 'draft' then
    perform private.fail('invalid_state');
  end if;
  if v_name is null or length(v_name) not between 1 and 40
     or p_gender is null or p_format is null or p_seeding is null
     or (p_level_min is null) <> (p_level_max is null)
     or (p_level_min is not null
         and (p_level_min not between 1 and 8 or p_level_max not between 1 and 8 or p_level_min > p_level_max))
     or p_min_pairs is null or p_max_pairs is null
     or p_min_pairs not between 2 and 64 or p_max_pairs not between 2 and 64 or p_min_pairs > p_max_pairs
     or p_price is null or p_price not between 0 and 10000000
     or p_group_size is null or p_group_size not in (3, 4)
     or p_qualifiers is null or p_qualifiers not between 1 and p_group_size - 1
     or p_match_minutes is null or p_match_minutes not between 30 and 240
     or p_third_set is null or p_third_set not in ('super_tiebreak', 'full')
     or p_golden_point is null then
    perform private.fail('invalid_input');
  end if;

  begin
    insert into public.championship_categories (club_id, championship_id, name, gender, level_min, level_max,
                                                min_pairs, max_pairs, price, format, group_size,
                                                qualifiers_per_group, match_rules, match_minutes, seeding,
                                                sort_order)
    values (v_championship.club_id, v_championship.id, v_name, p_gender, p_level_min, p_level_max, p_min_pairs,
            p_max_pairs, p_price, p_format, p_group_size, p_qualifiers,
            jsonb_build_object('sets', 3, 'games', 6, 'tiebreak', true, 'third_set', p_third_set,
                               'super_tiebreak_points', 10, 'golden_point', p_golden_point),
            p_match_minutes, p_seeding,
            coalesce((select max(c.sort_order) + 1 from public.championship_categories c
                      where c.championship_id = v_championship.id), 0))
    returning * into v_category;
  exception when unique_violation then
    perform private.fail('category_exists');
  end;
  return v_category;
end;
$$;

create function public.delete_championship_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category public.championship_categories;
  v_championship public.championships;
begin
  select * into v_category from public.championship_categories where id = p_category_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.staff_championship(v_category.championship_id);
  if v_championship.status <> 'draft' then
    perform private.fail('invalid_state');
  end if;
  delete from public.championship_categories where id = v_category.id;
end;
$$;

-- The poster is uploaded from the browser (championship-posters/<club_id>/...); this points at it, or
-- removes it with an empty path.
create function public.set_championship_poster(p_championship_id uuid, p_path text)
returns public.championships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
  v_path text := nullif(trim(p_path), '');
begin
  if v_championship.status = 'cancelled' then
    perform private.fail('invalid_state');
  end if;
  if v_path is not null and (
    split_part(v_path, '/', 1) <> v_championship.club_id::text
    or position('..' in v_path) > 0
    or length(v_path) > 200
    or not exists (select 1 from storage.objects o where o.bucket_id = 'championship-posters' and o.name = v_path)
  ) then
    perform private.fail('invalid_input');
  end if;
  update public.championships set poster_path = v_path where id = v_championship.id returning * into v_championship;
  return v_championship;
end;
$$;

-- To pick a partner: the other members of the club whose profile is public. Nobody else gets a row.
create function public.member_directory(p_club_id uuid)
returns table (user_id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, p.display_name
  from public.club_members m
  join public.profiles p on p.id = m.user_id
  where m.club_id = p_club_id
    and private.is_club_member(p_club_id)
    and m.user_id <> (select auth.uid())
    and p.is_public
  order by p.display_name;
$$;

-- The phones and emails of a championship's players: every one for staff; for a member, those of her pairs.
create function public.championship_contacts(p_championship_id uuid)
returns table (player_id uuid, phone text, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct pl.id, pl.phone, pl.email
  from public.championship_entries e
  join public.championship_categories c on c.id = e.category_id
  join public.championships ch on ch.id = c.championship_id
  join public.players pl on pl.id in (e.player1_id, e.player2_id)
  where ch.id = p_championship_id
    and (private.is_staff(ch.club_id) or private.is_entry_player(e.id));
$$;

revoke all on function private.lock_championship(uuid) from public;
revoke all on function private.staff_championship(uuid) from public;
revoke all on function private.window_period(public.championship_windows, text) from public;
revoke all on function private.championship_starts_at(uuid) from public;
revoke execute on function public.create_championship(uuid, text, text, integer, timestamptz) from public, anon;
revoke execute on function public.update_championship(uuid, text, text, integer, timestamptz) from public, anon;
revoke execute on function public.add_championship_window(uuid, date, time, time, uuid[]) from public, anon;
revoke execute on function public.delete_championship_window(uuid) from public, anon;
revoke execute on function public.add_championship_category(uuid, text, public.championship_gender, integer, integer,
  integer, public.championship_format, integer, integer, integer, public.championship_seeding, text, boolean,
  integer, integer) from public, anon;
revoke execute on function public.delete_championship_category(uuid) from public, anon;
revoke execute on function public.set_championship_poster(uuid, text) from public, anon;
revoke execute on function public.member_directory(uuid) from public, anon;
revoke execute on function public.championship_contacts(uuid) from public, anon;
grant execute on function public.create_championship(uuid, text, text, integer, timestamptz) to authenticated;
grant execute on function public.update_championship(uuid, text, text, integer, timestamptz) to authenticated;
grant execute on function public.add_championship_window(uuid, date, time, time, uuid[]) to authenticated;
grant execute on function public.delete_championship_window(uuid) to authenticated;
grant execute on function public.add_championship_category(uuid, text, public.championship_gender, integer, integer,
  integer, public.championship_format, integer, integer, integer, public.championship_seeding, text, boolean,
  integer, integer) to authenticated;
grant execute on function public.delete_championship_category(uuid) to authenticated;
grant execute on function public.set_championship_poster(uuid, text) to authenticated;
grant execute on function public.member_directory(uuid) to authenticated;
grant execute on function public.championship_contacts(uuid) to authenticated;
