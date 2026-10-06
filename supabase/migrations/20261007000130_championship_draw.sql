-- Campeonatos, día del torneo, part 2: seeds and the draw. lib/domain/championship-draw.ts draws (pure and
-- seeded); save_championship_draw checks that the result keeps the rules and saves it, replacing an earlier draw
-- while the fixture is not published.

-- A uuid from a jsonb string; null for a missing value, invalid_input for anything else.
create function private.json_uuid(p_value jsonb)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) <> 'string'
     or (p_value #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    perform private.fail('invalid_input');
  end if;
  return (p_value #>> '{}')::uuid;
end;
$$;

-- The organizer's seeds of a category, strongest first (1, 2, ...); every other pair goes back to none. With
-- registration closed, or drawn (the next draw uses them).
create function public.set_championship_seeds(p_category_id uuid, p_entry_ids uuid[])
returns integer
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
  if v_championship.status not in ('closed', 'drawn') then
    perform private.fail('invalid_state');
  end if;
  if p_entry_ids is null or cardinality(p_entry_ids) > 64 or array_position(p_entry_ids, null) is not null
     or (select count(distinct e) from unnest(p_entry_ids) as e) <> cardinality(p_entry_ids)
     or exists (
       select 1 from unnest(p_entry_ids) as e (id)
       where not exists (
         select 1 from public.championship_entries ce
         where ce.id = e.id and ce.category_id = v_category.id and ce.status = 'active'
       )
     ) then
    perform private.fail('invalid_input');
  end if;

  update public.championship_entries set seed = null where category_id = v_category.id and seed is not null;
  update public.championship_entries ce set seed = s.n
    from unnest(p_entry_ids) with ordinality as s (id, n)
   where ce.id = s.id;
  return cardinality(p_entry_ids);
end;
$$;

-- A side's source as the draw sends it ({"group": "A", "place": 1} or {"winner_of": "K2-1"}), with the keys
-- turned into the ids just saved.
create function private.draw_source(p_source jsonb, p_groups jsonb, p_matches jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_source is null or jsonb_typeof(p_source) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_source) = 'object' and p_source ? 'group' and p_groups ? (p_source ->> 'group')
     and coalesce(p_source ->> 'place', '') ~ '^[1-9]$' then
    return jsonb_build_object('group', p_groups -> (p_source ->> 'group'), 'place', (p_source ->> 'place')::integer);
  end if;
  if jsonb_typeof(p_source) = 'object' and p_source ? 'winner_of' and p_matches ? (p_source ->> 'winner_of') then
    return jsonb_build_object('winner_of', p_matches -> (p_source ->> 'winner_of'));
  end if;
  perform private.fail('invalid_input');
end;
$$;

-- True when a saved draw breaks a rule (lib/domain/championship-draw.ts never does): each pair with a place is
-- drawn exactly once and nobody else is; a format with groups has them (round robin, one) and each group plays
-- every pair of its members once; a knockout side is a pair or comes from somewhere, never both; a winner comes
-- from the round before, a place from a group that has it; one final; no source is used twice.
create function private.draw_problem(p_category public.championship_categories)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    exists (
      select 1 from public.championship_entries e
      where e.category_id = p_category.id and e.status = 'active'
        and (case
               when p_category.format = 'knockout' then
                 (select count(*) from public.championship_matches m
                  where m.category_id = p_category.id and e.id in (m.entry_a_id, m.entry_b_id))
               else
                 (select count(*) from public.championship_group_members gm
                  join public.championship_groups g on g.id = gm.group_id
                  where g.category_id = p_category.id and gm.entry_id = e.id)
             end) <> 1
    )
    or exists (
      select 1 from public.championship_group_members gm
      join public.championship_groups g on g.id = gm.group_id
      join public.championship_entries e on e.id = gm.entry_id
      where g.category_id = p_category.id and (e.category_id <> p_category.id or e.status <> 'active')
    )
    or exists (
      select 1 from public.championship_matches m
      join public.championship_entries e on e.id in (m.entry_a_id, m.entry_b_id)
      where m.category_id = p_category.id and (e.category_id <> p_category.id or e.status <> 'active')
    )
    or ((p_category.format = 'knockout')
        <> (not exists (select 1 from public.championship_groups g where g.category_id = p_category.id)))
    or (p_category.format = 'round_robin'
        and (select count(*) from public.championship_groups g where g.category_id = p_category.id) <> 1)
    or exists (
      select 1 from public.championship_matches m
      where m.category_id = p_category.id and m.stage = 'group'
        and (m.entry_a_id is null or m.entry_b_id is null
             or not exists (select 1 from public.championship_group_members gm
                            where gm.group_id = m.group_id and gm.entry_id = m.entry_a_id)
             or not exists (select 1 from public.championship_group_members gm
                            where gm.group_id = m.group_id and gm.entry_id = m.entry_b_id))
    )
    or exists (
      select 1 from public.championship_groups g
      cross join lateral (
        select count(*) as size from public.championship_group_members gm where gm.group_id = g.id
      ) as members
      cross join lateral (
        select count(*) as total,
               count(distinct least(m.entry_a_id::text, m.entry_b_id::text)
                              || greatest(m.entry_a_id::text, m.entry_b_id::text)) as pairs
        from public.championship_matches m where m.group_id = g.id
      ) as played
      where g.category_id = p_category.id
        and (played.total <> members.size * (members.size - 1) / 2 or played.pairs <> played.total)
    )
    or (p_category.format = 'round_robin'
        and exists (select 1 from public.championship_matches m
                    where m.category_id = p_category.id and m.stage = 'knockout'))
    or exists (
      select 1 from public.championship_matches m
      cross join lateral (values (m.entry_a_id, m.source_a), (m.entry_b_id, m.source_b)) as s (entry_id, source)
      where m.category_id = p_category.id and m.stage = 'knockout'
        and ((s.entry_id is null) = (s.source is null)
             or (s.source ? 'winner_of' and not exists (
                   select 1 from public.championship_matches f
                   where f.id = (s.source ->> 'winner_of')::uuid and f.category_id = p_category.id
                     and f.stage = 'knockout' and f.round = m.round * 2))
             or (s.source ? 'group' and not exists (
                   select 1 from public.championship_groups g
                   where g.id = (s.source ->> 'group')::uuid and g.category_id = p_category.id
                     and (s.source ->> 'place')::integer
                         < (select count(*) from public.championship_group_members gm where gm.group_id = g.id))))
    )
    or (exists (select 1 from public.championship_matches m
                where m.category_id = p_category.id and m.stage = 'knockout')
        and (select count(*) from public.championship_matches m
             where m.category_id = p_category.id and m.round = 1) <> 1)
    or exists (
      select 1 from public.championship_matches m
      cross join lateral (values (m.source_a), (m.source_b)) as s (source)
      where m.category_id = p_category.id and s.source is not null
      group by s.source
      having count(*) > 1
    );
$$;

-- Saves the draw of every open category: [{category_id, groups: [{key, name, entry_ids}], matches: [{key,
-- stage, group, round, position, entry_a, entry_b, source_a, source_b}]}]. Closed or drawn (a new draw replaces
-- the last one); every open category needs 2 pairs with a place.
create function public.save_championship_draw(p_championship_id uuid, p_seed integer, p_draw jsonb)
returns public.championships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
  v_item jsonb;
  v_category public.championship_categories;
  v_group jsonb;
  v_match jsonb;
  v_groups jsonb;
  v_matches jsonb;
  v_id uuid;
  v_order integer;
begin
  if v_championship.status not in ('closed', 'drawn') then
    perform private.fail('invalid_state');
  end if;
  if exists (
    select 1 from public.championship_categories c
    where c.championship_id = v_championship.id and c.status = 'open' and private.category_active_count(c.id) < 2
  ) then
    perform private.fail('category_too_small');
  end if;
  if p_seed is null or p_draw is null or jsonb_typeof(p_draw) <> 'array' then
    perform private.fail('invalid_input');
  end if;
  -- Every open category exactly once, and nothing else.
  if jsonb_array_length(p_draw) <> (
       select count(*) from public.championship_categories c
       where c.championship_id = v_championship.id and c.status = 'open'
     )
     or exists (
       select 1 from public.championship_categories c
       where c.championship_id = v_championship.id and c.status = 'open'
         and (select count(*) from jsonb_array_elements(p_draw) as d (item)
              where d.item ->> 'category_id' = c.id::text) <> 1
     ) then
    perform private.fail('invalid_input');
  end if;

  delete from public.championship_matches where championship_id = v_championship.id;
  delete from public.championship_groups where championship_id = v_championship.id;

  for v_item in select d.item from jsonb_array_elements(p_draw) as d (item) loop
    select * into v_category from public.championship_categories
     where id = private.json_uuid(v_item -> 'category_id') and championship_id = v_championship.id;
    v_groups := '{}';
    v_matches := '{}';
    v_order := 0;
    for v_group in select g.item from jsonb_array_elements(coalesce(v_item -> 'groups', '[]')) as g (item) loop
      if coalesce(v_group ->> 'key', '') = '' or jsonb_typeof(v_group -> 'entry_ids') is distinct from 'array' then
        perform private.fail('invalid_input');
      end if;
      insert into public.championship_groups (club_id, championship_id, category_id, name, sort_order)
      values (v_championship.club_id, v_championship.id, v_category.id,
              left(coalesce(nullif(trim(v_group ->> 'name'), ''), 'Zona'), 40), v_order)
      returning id into v_id;
      v_groups := v_groups || jsonb_build_object(v_group ->> 'key', v_id);
      insert into public.championship_group_members (group_id, club_id, entry_id, draw_position)
      select v_id, v_championship.club_id, private.json_uuid(e.item), e.n
      from jsonb_array_elements(v_group -> 'entry_ids') with ordinality as e (item, n);
      v_order := v_order + 1;
    end loop;

    for v_match in select m.item from jsonb_array_elements(coalesce(v_item -> 'matches', '[]')) as m (item) loop
      if coalesce(v_match ->> 'stage', '') not in ('group', 'knockout') or coalesce(v_match ->> 'key', '') = '' then
        perform private.fail('invalid_input');
      end if;
      insert into public.championship_matches (club_id, championship_id, category_id, stage, group_id, round,
                                               bracket_position, entry_a_id, entry_b_id)
      values (v_championship.club_id, v_championship.id, v_category.id,
              (v_match ->> 'stage')::public.championship_stage,
              case when v_match ->> 'stage' = 'group' then private.json_uuid(v_groups -> (v_match ->> 'group')) end,
              (v_match ->> 'round')::smallint, (v_match ->> 'position')::smallint,
              private.json_uuid(v_match -> 'entry_a'), private.json_uuid(v_match -> 'entry_b'))
      returning id into v_id;
      v_matches := v_matches || jsonb_build_object(v_match ->> 'key', v_id);
    end loop;
    -- Sources point at matches of the same draw: set once every key has its id.
    for v_match in select m.item from jsonb_array_elements(coalesce(v_item -> 'matches', '[]')) as m (item) loop
      update public.championship_matches
         set source_a = private.draw_source(v_match -> 'source_a', v_groups, v_matches),
             source_b = private.draw_source(v_match -> 'source_b', v_groups, v_matches)
       where id = (v_matches ->> (v_match ->> 'key'))::uuid;
    end loop;

    if private.draw_problem(v_category) then
      perform private.fail('invalid_input');
    end if;
  end loop;

  update public.championships set status = 'drawn', draw_seed = p_seed
   where id = v_championship.id
  returning * into v_championship;
  return v_championship;
end;
$$;

revoke all on function private.json_uuid(jsonb) from public;
revoke all on function private.draw_source(jsonb, jsonb, jsonb) from public;
revoke all on function private.draw_problem(public.championship_categories) from public;
revoke execute on function public.set_championship_seeds(uuid, uuid[]) from public, anon;
revoke execute on function public.save_championship_draw(uuid, integer, jsonb) from public, anon;
grant execute on function public.set_championship_seeds(uuid, uuid[]) to authenticated;
grant execute on function public.save_championship_draw(uuid, integer, jsonb) to authenticated;
