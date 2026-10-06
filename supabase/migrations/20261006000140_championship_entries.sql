-- Campeonatos, part 3: who plays. A member signs up with a partner (a member or someone from outside); staff
-- load whole pairs, take them out and move them. Without room a pair waits; when a pair with a place leaves,
-- the first in line gets in by itself. Every write locks the championship first, so the last spot, the
-- categories limit and the line never race.

-- Digits only; a Uruguayan number with its country code (+598, 00598) becomes the local one (0...).
create function private.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when phone ~ '^[0-9]{8,15}$' then phone end
  from (
    select case
      when cleaned like '00598%' then '0' || substr(cleaned, 6)
      when cleaned like '598%' and length(cleaned) = 11 then '0' || substr(cleaned, 4)
      else cleaned
    end as phone
    from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as cleaned) as raw
  ) as normalized;
$$;

-- The player row of a member, made the first time she plays a championship.
create function private.player_for_profile(p_club_id uuid, p_profile_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.players where club_id = p_club_id and profile_id = p_profile_id;
  if found then
    return v_id;
  end if;
  insert into public.players (club_id, name, profile_id, created_by)
  select p_club_id, coalesce(nullif(trim(left(p.display_name, 60)), ''), 'Jugador'), p.id, (select auth.uid())
  from public.profiles p
  where p.id = p_profile_id
  on conflict (club_id, profile_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.players where club_id = p_club_id and profile_id = p_profile_id;
  end if;
  if v_id is null then
    perform private.fail('not_found');
  end if;
  return v_id;
end;
$$;

-- Someone from outside: the player with that phone if there is one (its name stays), a new one if not.
create function private.player_for_phone(p_club_id uuid, p_name text, p_phone text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_phone text := private.normalize_phone(p_phone);
  v_name text := trim(p_name);
  v_id uuid;
begin
  if v_phone is null then
    perform private.fail('invalid_phone');
  end if;
  select id into v_id from public.players where club_id = p_club_id and phone = v_phone;
  if found then
    return v_id;
  end if;
  if v_name is null or length(v_name) not between 1 and 60 then
    perform private.fail('invalid_input');
  end if;
  insert into public.players (club_id, name, phone, created_by)
  values (p_club_id, v_name, v_phone, (select auth.uid()))
  on conflict (club_id, phone) where phone is not null do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.players where club_id = p_club_id and phone = v_phone;
  end if;
  return v_id;
end;
$$;

-- One player of a pair: a member of the club (by profile) or someone from outside (name and phone).
create function private.pair_player(p_club_id uuid, p_profile_id uuid, p_name text, p_phone text)
returns uuid
language plpgsql
set search_path = ''
as $$
begin
  if p_profile_id is not null then
    if nullif(trim(p_name), '') is not null or nullif(trim(p_phone), '') is not null then
      perform private.fail('invalid_input');
    end if;
    if not exists (select 1 from public.club_members m where m.club_id = p_club_id and m.user_id = p_profile_id) then
      perform private.fail('partner_not_member');
    end if;
    return private.player_for_profile(p_club_id, p_profile_id);
  end if;
  return private.player_for_phone(p_club_id, p_name, p_phone);
end;
$$;

create function private.category_active_count(p_category_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.championship_entries where category_id = p_category_id and status = 'active';
$$;

-- True when one of the two players is already in another pair of the category, with a place or waiting.
create function private.in_category(p_category_id uuid, p_player1 uuid, p_player2 uuid, p_except uuid default null)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.championship_entries e
    where e.category_id = p_category_id and e.status in ('active', 'waiting') and e.id is distinct from p_except
      and (e.player1_id in (p_player1, p_player2) or e.player2_id in (p_player1, p_player2))
  );
$$;

-- What an aviso of a championship carries (lib/domain/championship-notifications.ts reads it).
create function private.championship_notice_data(
  p_championship public.championships,
  p_category_name text,
  p_partner_name text,
  p_waiting boolean
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'championship_id', p_championship.id,
    'championship_name', p_championship.name,
    'category_name', p_category_name,
    'partner_name', p_partner_name,
    'waiting', p_waiting,
    'starts_at', private.championship_starts_at(p_championship.id)
  );
$$;

-- An aviso to each member of the pair but p_except (who did it). p_whole: about the whole championship.
create function private.notify_championship_entry(
  p_entry public.championship_entries,
  p_kind public.notification_kind,
  p_except uuid,
  p_whole boolean default false
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_category public.championship_categories;
  v_championship public.championships;
  v_player1 public.players;
  v_player2 public.players;
  v_category_name text;
  v_count integer := 0;
begin
  select * into v_category from public.championship_categories where id = p_entry.category_id;
  select * into v_championship from public.championships where id = v_category.championship_id;
  select * into v_player1 from public.players where id = p_entry.player1_id;
  select * into v_player2 from public.players where id = p_entry.player2_id;
  v_category_name := case when p_whole then null else v_category.name end;
  if v_player1.profile_id is not null and v_player1.profile_id is distinct from p_except then
    insert into public.notifications (club_id, user_id, kind, data, link)
    values (v_championship.club_id, v_player1.profile_id, p_kind,
            private.championship_notice_data(v_championship, v_category_name, v_player2.name, p_entry.status = 'waiting'),
            '/campeonatos/' || v_championship.id);
    v_count := v_count + 1;
  end if;
  if v_player2.profile_id is not null and v_player2.profile_id is distinct from p_except then
    insert into public.notifications (club_id, user_id, kind, data, link)
    values (v_championship.club_id, v_player2.profile_id, p_kind,
            private.championship_notice_data(v_championship, v_category_name, v_player1.name, p_entry.status = 'waiting'),
            '/campeonatos/' || v_championship.id);
    v_count := v_count + 1;
  end if;
  return v_count;
end;
$$;

-- Lets the first pairs in line in while the category has room, each with an aviso. Callers lock the
-- championship first.
create function private.fill_category(p_category_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_category public.championship_categories;
  v_entry public.championship_entries;
  v_count integer := 0;
begin
  select * into v_category from public.championship_categories where id = p_category_id;
  if v_category.status <> 'open' then
    return 0;
  end if;
  while private.category_active_count(p_category_id) < v_category.max_pairs loop
    select * into v_entry from public.championship_entries
     where category_id = p_category_id and status = 'waiting'
     order by created_at, id
     limit 1
     for update;
    exit when not found;
    update public.championship_entries set status = 'active' where id = v_entry.id returning * into v_entry;
    perform private.notify_championship_entry(v_entry, 'championship_promoted', null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Ends a pair that had a place or was waiting, and rejects its reported transfer. Confirmed payments stay
-- for a refund (Cobros). Callers lock the championship first.
create function private.end_championship_entry(
  p_entry_id uuid,
  p_status public.championship_entry_status,
  p_reason text
)
returns public.championship_entries
language plpgsql
set search_path = ''
as $$
declare
  v_entry public.championship_entries;
begin
  -- Payments before the pair, the same order as confirm_payment, so the two cannot deadlock.
  perform 1 from public.payments where championship_entry_id = p_entry_id and status = 'reported' for update;
  select * into v_entry from public.championship_entries where id = p_entry_id for update;
  if v_entry.status not in ('active', 'waiting') then
    perform private.fail('invalid_state');
  end if;
  update public.championship_entries
     set status = p_status, ended_at = now(), ended_by = (select auth.uid())
   where id = p_entry_id
  returning * into v_entry;
  update public.payments
     set status = 'rejected', rejection_reason = p_reason, confirmed_by = (select auth.uid()), confirmed_at = now()
   where championship_entry_id = p_entry_id and status = 'reported';
  return v_entry;
end;
$$;

-- A new pair: two different players, not already in the category, under the categories limit. With a place
-- if there is room, waiting if not; its members (but whoever signed it up) get an aviso. Callers lock the
-- championship first.
create function private.insert_championship_entry(
  p_category_id uuid,
  p_championship public.championships,
  p_player1 uuid,
  p_player2 uuid,
  p_level1 integer,
  p_level2 integer,
  p_note text
)
returns public.championship_entries
language plpgsql
set search_path = ''
as $$
declare
  v_category public.championship_categories;
  v_entry public.championship_entries;
begin
  select * into v_category from public.championship_categories where id = p_category_id;
  if p_player1 = p_player2 then
    perform private.fail('same_player');
  end if;
  if p_level1 is null or p_level2 is null or p_level1 not between 1 and 8 or p_level2 not between 1 and 8
     or length(p_note) > 300 then
    perform private.fail('invalid_input');
  end if;
  if private.in_category(v_category.id, p_player1, p_player2) then
    perform private.fail('already_in_category');
  end if;
  if exists (
    select 1 from unnest(array[p_player1, p_player2]) as u (player_id)
    where (
      select count(*) from public.championship_entries e
      join public.championship_categories c on c.id = e.category_id
      where c.championship_id = p_championship.id and e.status in ('active', 'waiting')
        and u.player_id in (e.player1_id, e.player2_id)
    ) >= p_championship.max_categories_per_player
  ) then
    perform private.fail('too_many_categories');
  end if;

  insert into public.championship_entries (club_id, category_id, player1_id, player2_id, player1_level,
                                           player2_level, status, note, created_by)
  values (v_category.club_id, v_category.id, p_player1, p_player2, p_level1, p_level2,
          (case when private.category_active_count(v_category.id) < v_category.max_pairs then 'active'
                else 'waiting' end)::public.championship_entry_status,
          p_note, (select auth.uid()))
  returning * into v_entry;
  perform private.notify_championship_entry(v_entry, 'championship_added', (select auth.uid()));
  return v_entry;
end;
$$;

-- Puts a pair in another category of the same championship: with a place if there is room, waiting if not,
-- with an aviso. Callers lock the championship and check the rules.
create function private.move_entry(p_entry_id uuid, p_to public.championship_categories)
returns public.championship_entries
language plpgsql
set search_path = ''
as $$
declare
  v_entry public.championship_entries;
begin
  update public.championship_entries
     set category_id = p_to.id,
         status = (case when private.category_active_count(p_to.id) < p_to.max_pairs then 'active'
                        else 'waiting' end)::public.championship_entry_status
   where id = p_entry_id
  returning * into v_entry;
  perform private.notify_championship_entry(v_entry, 'championship_moved', null);
  return v_entry;
end;
$$;

-- A member signs up with a partner: a member (p_partner_profile_id) or someone from outside (name and phone).
create function public.register_championship_pair(
  p_category_id uuid,
  p_my_level integer,
  p_partner_level integer,
  p_partner_profile_id uuid default null,
  p_partner_name text default null,
  p_partner_phone text default null
)
returns public.championship_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_category public.championship_categories;
  v_championship public.championships;
begin
  select * into v_category from public.championship_categories where id = p_category_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.lock_championship(v_category.championship_id);
  if v_uid is null or not private.is_club_member(v_championship.club_id) then
    perform private.fail('forbidden');
  end if;
  select * into v_category from public.championship_categories where id = p_category_id;
  if v_championship.status <> 'registration' or v_championship.registration_closes_at <= now()
     or v_category.status <> 'open' then
    perform private.fail('championship_closed');
  end if;
  return private.insert_championship_entry(
    v_category.id, v_championship,
    private.player_for_profile(v_championship.club_id, v_uid),
    private.pair_player(v_championship.club_id, p_partner_profile_id, p_partner_name, p_partner_phone),
    p_my_level, p_partner_level, null
  );
end;
$$;

-- Reception loads a whole pair (members, people from outside or one of each) until the draw.
create function public.add_championship_pair(
  p_category_id uuid,
  p_player1_level integer,
  p_player2_level integer,
  p_player1_profile_id uuid default null,
  p_player1_name text default null,
  p_player1_phone text default null,
  p_player2_profile_id uuid default null,
  p_player2_name text default null,
  p_player2_phone text default null,
  p_note text default null
)
returns public.championship_entries
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
  select * into v_category from public.championship_categories where id = p_category_id;
  if v_championship.status not in ('registration', 'closed') or v_category.status <> 'open' then
    perform private.fail('invalid_state');
  end if;
  return private.insert_championship_entry(
    v_category.id, v_championship,
    private.pair_player(v_championship.club_id, p_player1_profile_id, p_player1_name, p_player1_phone),
    private.pair_player(v_championship.club_id, p_player2_profile_id, p_player2_name, p_player2_phone),
    p_player1_level, p_player2_level, nullif(trim(p_note), '')
  );
end;
$$;

-- A player of the pair withdraws it while registration is open. Someone who already paid gets it back from
-- the club (Cobros); the first pair in line gets the place.
create function public.withdraw_championship_entry(p_entry_id uuid)
returns public.championship_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_category_id uuid;
  v_championship_id uuid;
  v_championship public.championships;
  v_entry public.championship_entries;
begin
  select e.category_id, c.championship_id into v_category_id, v_championship_id
  from public.championship_entries e
  join public.championship_categories c on c.id = e.category_id
  where e.id = p_entry_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.lock_championship(v_championship_id);
  if v_uid is null or not private.is_entry_player(p_entry_id) then
    perform private.fail('forbidden');
  end if;
  if v_championship.status <> 'registration' or v_championship.registration_closes_at <= now() then
    perform private.fail('championship_closed');
  end if;
  v_entry := private.end_championship_entry(p_entry_id, 'withdrawn', 'Se dieron de baja');
  perform private.fill_category(v_category_id);
  return v_entry;
end;
$$;

-- The organizer takes a pair out until the draw.
create function public.remove_championship_entry(p_entry_id uuid)
returns public.championship_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category_id uuid;
  v_championship_id uuid;
  v_championship public.championships;
  v_entry public.championship_entries;
begin
  select e.category_id, c.championship_id into v_category_id, v_championship_id
  from public.championship_entries e
  join public.championship_categories c on c.id = e.category_id
  where e.id = p_entry_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.staff_championship(v_championship_id);
  if v_championship.status not in ('registration', 'closed') then
    perform private.fail('invalid_state');
  end if;
  v_entry := private.end_championship_entry(p_entry_id, 'removed', 'El club quitó la pareja');
  perform private.fill_category(v_category_id);
  return v_entry;
end;
$$;

-- The organizer moves a pair to another category of the championship until the draw.
create function public.move_championship_entry(p_entry_id uuid, p_category_id uuid)
returns public.championship_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.championship_entries;
  v_from public.championship_categories;
  v_to public.championship_categories;
  v_championship public.championships;
  v_had_place boolean;
begin
  select * into v_entry from public.championship_entries where id = p_entry_id;
  if not found then
    perform private.fail('not_found');
  end if;
  select * into v_from from public.championship_categories where id = v_entry.category_id;
  v_championship := private.staff_championship(v_from.championship_id);
  if v_championship.status not in ('registration', 'closed') then
    perform private.fail('invalid_state');
  end if;
  select * into v_entry from public.championship_entries where id = p_entry_id for update;
  select * into v_to from public.championship_categories
   where id = p_category_id and championship_id = v_championship.id;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_entry.status not in ('active', 'waiting') or v_to.status <> 'open' or v_to.id = v_entry.category_id then
    perform private.fail('invalid_state');
  end if;
  if private.in_category(v_to.id, v_entry.player1_id, v_entry.player2_id) then
    perform private.fail('already_in_category');
  end if;
  v_had_place := v_entry.status = 'active';
  v_entry := private.move_entry(v_entry.id, v_to);
  if v_had_place then
    perform private.fill_category(v_from.id);
  end if;
  return v_entry;
end;
$$;

revoke all on function private.normalize_phone(text) from public;
revoke all on function private.player_for_profile(uuid, uuid) from public;
revoke all on function private.player_for_phone(uuid, text, text) from public;
revoke all on function private.pair_player(uuid, uuid, text, text) from public;
revoke all on function private.category_active_count(uuid) from public;
revoke all on function private.in_category(uuid, uuid, uuid, uuid) from public;
revoke all on function private.championship_notice_data(public.championships, text, text, boolean) from public;
revoke all on function private.notify_championship_entry(public.championship_entries, public.notification_kind, uuid,
  boolean) from public;
revoke all on function private.fill_category(uuid) from public;
revoke all on function private.end_championship_entry(uuid, public.championship_entry_status, text) from public;
revoke all on function private.insert_championship_entry(uuid, public.championships, uuid, uuid, integer, integer,
  text) from public;
revoke all on function private.move_entry(uuid, public.championship_categories) from public;
revoke execute on function public.register_championship_pair(uuid, integer, integer, uuid, text, text) from public, anon;
revoke execute on function public.add_championship_pair(uuid, integer, integer, uuid, text, text, uuid, text, text, text)
  from public, anon;
revoke execute on function public.withdraw_championship_entry(uuid) from public, anon;
revoke execute on function public.remove_championship_entry(uuid) from public, anon;
revoke execute on function public.move_championship_entry(uuid, uuid) from public, anon;
grant execute on function public.register_championship_pair(uuid, integer, integer, uuid, text, text) to authenticated;
grant execute on function public.add_championship_pair(uuid, integer, integer, uuid, text, text, uuid, text, text, text)
  to authenticated;
grant execute on function public.withdraw_championship_entry(uuid) to authenticated;
grant execute on function public.remove_championship_entry(uuid) to authenticated;
grant execute on function public.move_championship_entry(uuid, uuid) to authenticated;
