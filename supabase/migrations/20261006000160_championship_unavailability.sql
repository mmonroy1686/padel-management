-- Campeonatos, part 5: when a pair cannot play. The days of play are cut in 2-hour blocks from their start
-- (the last one ends with the day); a player of the pair or staff mark the blocks it cannot play, plus a note.
-- A pair marks up to 40 % of the blocks; more needs the organizer, who saves it for them.

-- Every block of a championship, keyed 'YYYY-MM-DD@HH:MM' (lib/domain/championships.ts makes the same keys).
create function private.championship_blocks(p_championship_id uuid)
returns table (block_key text, on_date date, from_time time, to_time time)
language sql
stable
set search_path = ''
as $$
  select distinct on (w.on_date, s.minute)
    w.on_date::text || '@' || to_char(make_interval(mins => s.minute), 'HH24:MI'),
    w.on_date,
    time '00:00' + make_interval(mins => s.minute),
    case
      when s.minute + 120 >= extract(epoch from w.to_time)::integer / 60 then w.to_time
      else time '00:00' + make_interval(mins => s.minute + 120)
    end
  from public.championship_windows w
  cross join lateral generate_series(
    extract(epoch from w.from_time)::integer / 60,
    extract(epoch from w.to_time)::integer / 60 - 1,
    120
  ) as s (minute)
  where w.championship_id = p_championship_id
  order by w.on_date, s.minute, w.to_time desc;
$$;

-- Replaces the blocks a pair cannot play. A player of the pair, while registration is open and up to 40 %;
-- staff until the draw, any amount (more than 40 % marks it approved).
create function public.set_entry_unavailability(p_entry_id uuid, p_blocks text[], p_note text default null)
returns public.championship_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.championship_entries;
  v_championship public.championships;
  v_staff boolean;
  v_note text := nullif(trim(p_note), '');
  v_blocks text[] := coalesce(p_blocks, '{}');
  v_total integer;
  v_count integer;
  v_over boolean;
begin
  select * into v_entry from public.championship_entries where id = p_entry_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.lock_championship(
    (select c.championship_id from public.championship_categories c where c.id = v_entry.category_id)
  );
  v_staff := private.is_staff(v_championship.club_id);
  if not v_staff and not private.is_entry_player(v_entry.id) then
    perform private.fail('forbidden');
  end if;
  if v_entry.status not in ('active', 'waiting') or v_championship.status not in ('registration', 'closed') then
    perform private.fail('invalid_state');
  end if;
  if not v_staff and (v_championship.status <> 'registration' or v_championship.registration_closes_at <= now()) then
    perform private.fail('championship_closed');
  end if;
  if length(v_note) > 300 or cardinality(v_blocks) > 200 or array_position(v_blocks, null) is not null
     or exists (
       select 1 from unnest(v_blocks) as u (block_key)
       where u.block_key not in (select b.block_key from private.championship_blocks(v_championship.id) as b)
     ) then
    perform private.fail('invalid_input');
  end if;

  select count(*) into v_total from private.championship_blocks(v_championship.id);
  select count(distinct u.block_key) into v_count from unnest(v_blocks) as u (block_key);
  v_over := v_count * 5 > v_total * 2;
  if v_over and not v_staff then
    perform private.fail('too_many_unavailable');
  end if;

  delete from public.entry_unavailability where entry_id = v_entry.id;
  insert into public.entry_unavailability (club_id, entry_id, on_date, from_time, to_time)
  select v_entry.club_id, v_entry.id, b.on_date, b.from_time, b.to_time
  from private.championship_blocks(v_championship.id) as b
  where b.block_key = any (v_blocks);
  update public.championship_entries
     set unavailability_note = v_note, unavailability_approved = v_over
   where id = v_entry.id
  returning * into v_entry;
  return v_entry;
end;
$$;

revoke all on function private.championship_blocks(uuid) from public;
revoke execute on function public.set_entry_unavailability(uuid, text[], text) from public, anon;
grant execute on function public.set_entry_unavailability(uuid, text[], text) to authenticated;
