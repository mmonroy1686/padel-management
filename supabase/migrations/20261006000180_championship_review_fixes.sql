-- Campeonatos, review fixes.
-- 1. A mobile number written without its leading 0 (99 222 333) is the same player as 099 222 333.
-- 2. The desk's note and the pair's note on its hours stay out of the API: members read the pairs without
--    them; staff and the pair read them through public.championship_entry_notes.
-- 3. move_championship_entry reads the pair's category again under the championship lock, so two moves at
--    once refill the category the pair really left.

create or replace function private.normalize_phone(p_phone text)
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
      when cleaned ~ '^9[0-9]{7}$' then '0' || cleaned
      else cleaned
    end as phone
    from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as cleaned) as raw
  ) as normalized;
$$;

revoke select on public.championship_entries from authenticated;
grant select (id, club_id, category_id, player1_id, player2_id, player1_level, player2_level, status, seed,
              unavailability_approved, created_by, created_at, ended_at, ended_by)
  on public.championship_entries to authenticated;

-- The notes of a championship's pairs: every pair's for staff, her own pairs' for a member.
create function public.championship_entry_notes(p_championship_id uuid)
returns table (entry_id uuid, note text, unavailability_note text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.note, e.unavailability_note
  from public.championship_entries e
  join public.championship_categories c on c.id = e.category_id
  join public.championships ch on ch.id = c.championship_id
  where ch.id = p_championship_id
    and (private.is_staff(ch.club_id) or private.is_entry_player(e.id));
$$;

create or replace function public.move_championship_entry(p_entry_id uuid, p_category_id uuid)
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
  -- Read again under the lock: another move may have changed its category meanwhile.
  select * into v_entry from public.championship_entries where id = p_entry_id for update;
  select * into v_from from public.championship_categories where id = v_entry.category_id;
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
revoke execute on function public.championship_entry_notes(uuid) from public, anon;
grant execute on function public.championship_entry_notes(uuid) to authenticated;
