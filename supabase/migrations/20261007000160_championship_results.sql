-- Campeonatos, día del torneo, part 5: the tournament day. Staff start matches and record results (checked
-- against the category's rules, the same as lib/domain/championship-results.ts) or a W.O.; a knockout winner goes
-- on by itself; a closed group sends its places to the bracket; the championship finishes when all is played.

-- A set that ended: 6-0 to 6-4, 7-5 or 7-6 (tie-break at 6-6); a super tie-break to 10 by 2 (11-9, 12-10...).
create function private.set_done(p_a integer, p_b integer, p_super boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_super then greatest(p_a, p_b) >= 10 and abs(p_a - p_b) >= 2
                      and (greatest(p_a, p_b) = 10 or abs(p_a - p_b) = 2)
    else (greatest(p_a, p_b) = 6 and least(p_a, p_b) <= 4)
         or (greatest(p_a, p_b) = 7 and least(p_a, p_b) in (5, 6))
  end;
$$;

-- A set cut by the time limit: not over and still possible (6-5, 6-6, 9-8 in a super tie-break).
create function private.set_partial(p_a integer, p_b integer, p_super boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not private.set_done(p_a, p_b, p_super)
    and case when p_super then greatest(p_a, p_b) < 10 or abs(p_a - p_b) <= 1 else p_a <= 6 and p_b <= 6 end;
$$;

-- 'a' or 'b': who won a match with these sets ([[6,4],[3,6],[10,8]]) under the category's rules. Without a time
-- limit somebody wins 2 sets; with one, the last set may be cut and the leader in sets, then in games, wins (a
-- super tie-break counts as one game). Anything else fails with invalid_result.
create function private.match_winner(p_sets jsonb, p_rules jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_limit boolean := (p_rules ->> 'time_limit_minutes') is not null;
  v_super_third boolean := coalesce(p_rules ->> 'third_set', 'super_tiebreak') = 'super_tiebreak';
  v_count integer;
  v_set jsonb;
  v_a integer;
  v_b integer;
  v_super boolean;
  v_won_a integer := 0;
  v_won_b integer := 0;
  v_games_a integer := 0;
  v_games_b integer := 0;
begin
  if p_sets is null or jsonb_typeof(p_sets) <> 'array' then
    perform private.fail('invalid_result');
  end if;
  v_count := jsonb_array_length(p_sets);
  if v_count not between 1 and 3 then
    perform private.fail('invalid_result');
  end if;
  for i in 0 .. v_count - 1 loop
    v_set := p_sets -> i;
    if jsonb_typeof(v_set) <> 'array' then
      perform private.fail('invalid_result');
    end if;
    if jsonb_array_length(v_set) <> 2
       or coalesce(v_set ->> 0, '') !~ '^[0-9]{1,2}$' or coalesce(v_set ->> 1, '') !~ '^[0-9]{1,2}$' then
      perform private.fail('invalid_result');
    end if;
    v_a := (v_set ->> 0)::integer;
    v_b := (v_set ->> 1)::integer;
    v_super := i = 2 and v_super_third;
    if v_won_a = 2 or v_won_b = 2 then
      perform private.fail('invalid_result');
    end if;
    if private.set_done(v_a, v_b, v_super) then
      if v_a > v_b then
        v_won_a := v_won_a + 1;
      else
        v_won_b := v_won_b + 1;
      end if;
    elsif not (i = v_count - 1 and v_limit and private.set_partial(v_a, v_b, v_super)) then
      perform private.fail('invalid_result');
    end if;
    if v_super then
      v_games_a := v_games_a + (v_a > v_b)::integer;
      v_games_b := v_games_b + (v_b > v_a)::integer;
    else
      v_games_a := v_games_a + v_a;
      v_games_b := v_games_b + v_b;
    end if;
  end loop;
  if not v_limit and greatest(v_won_a, v_won_b) < 2 then
    perform private.fail('invalid_result');
  end if;
  if v_won_a <> v_won_b then
    return case when v_won_a > v_won_b then 'a' else 'b' end;
  end if;
  if v_games_a <> v_games_b then
    return case when v_games_a > v_games_b then 'a' else 'b' end;
  end if;
  perform private.fail('invalid_result');
end;
$$;

-- Locks the championship of a match, checks the caller is its staff and that it is being played (published or
-- in progress), and reads the match again under the lock.
create function private.staff_match(p_match_id uuid)
returns public.championship_matches
language plpgsql
set search_path = ''
as $$
declare
  v_match public.championship_matches;
  v_championship public.championships;
begin
  select * into v_match from public.championship_matches where id = p_match_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.staff_championship(v_match.championship_id);
  if v_championship.status not in ('published', 'in_progress') then
    perform private.fail('invalid_state');
  end if;
  select * into v_match from public.championship_matches where id = p_match_id;
  return v_match;
end;
$$;

-- The first match started or result recorded puts a published championship in progress.
create function private.mark_in_progress(p_championship_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.championships set status = 'in_progress' where id = p_championship_id and status = 'published';
$$;

-- The knockout matches waiting for this one: for its winner or, for a group match, for its group's places.
create function private.next_matches(p_match_id uuid)
returns setof public.championship_matches
language sql
stable
set search_path = ''
as $$
  select n.* from public.championship_matches m
  join public.championship_matches n
    on n.championship_id = m.championship_id and n.stage = 'knockout'
   and (n.source_a ->> 'winner_of' = m.id::text or n.source_b ->> 'winner_of' = m.id::text
        or (m.group_id is not null
            and (n.source_a ->> 'group' = m.group_id::text or n.source_b ->> 'group' = m.group_id::text)))
  where m.id = p_match_id;
$$;

-- Saves a result (or a W.O., with p_absent): its sets, the winner and the state. A result is corrected while
-- what comes next has not started; a knockout winner goes on by itself; a corrected group result opens its
-- group again (places and the pairs it sent on are cleared until it closes again).
create function private.apply_result(
  p_match public.championship_matches,
  p_sets jsonb,
  p_winner uuid,
  p_absent uuid
)
returns public.championship_matches
language plpgsql
set search_path = ''
as $$
declare
  v_category public.championship_categories;
  v_match public.championship_matches;
begin
  if p_match.status in ('finished', 'walkover')
     and exists (select 1 from private.next_matches(p_match.id) n where n.status <> 'scheduled') then
    perform private.fail('invalid_state');
  end if;
  select * into v_category from public.championship_categories where id = p_match.category_id;

  delete from public.championship_match_sets where match_id = p_match.id;
  insert into public.championship_match_sets (match_id, club_id, set_number, games_a, games_b, super_tiebreak)
  select p_match.id, p_match.club_id, s.n, (s.item ->> 0)::smallint, (s.item ->> 1)::smallint,
         s.n = 3 and coalesce(v_category.match_rules ->> 'third_set', 'super_tiebreak') = 'super_tiebreak'
  from jsonb_array_elements(p_sets) with ordinality as s (item, n);

  update public.championship_matches
     set status = (case when p_absent is null then 'finished' else 'walkover' end)::public.championship_match_status,
         winner_entry_id = p_winner, walkover_entry_id = p_absent,
         recorded_by = (select auth.uid()), recorded_at = now()
   where id = p_match.id
  returning * into v_match;

  if v_match.stage = 'knockout' then
    update public.championship_matches set entry_a_id = p_winner where source_a ->> 'winner_of' = v_match.id::text;
    update public.championship_matches set entry_b_id = p_winner where source_b ->> 'winner_of' = v_match.id::text;
  elsif p_match.status in ('finished', 'walkover') then
    update public.championship_group_members set place = null where group_id = v_match.group_id;
    update public.championship_matches set entry_a_id = null where source_a ->> 'group' = v_match.group_id::text;
    update public.championship_matches set entry_b_id = null where source_b ->> 'group' = v_match.group_id::text;
  end if;
  perform private.mark_in_progress(v_match.championship_id);
  return v_match;
end;
$$;

-- "Empezar": the match is being played (both pairs known).
create function public.start_match(p_match_id uuid)
returns public.championship_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.championship_matches := private.staff_match(p_match_id);
begin
  if v_match.status <> 'scheduled' or v_match.entry_a_id is null or v_match.entry_b_id is null then
    perform private.fail('invalid_state');
  end if;
  update public.championship_matches set status = 'playing' where id = v_match.id returning * into v_match;
  perform private.mark_in_progress(v_match.championship_id);
  return v_match;
end;
$$;

-- "Cargar resultado": the sets as [[games a, games b], ...].
create function public.record_match_result(p_match_id uuid, p_sets jsonb)
returns public.championship_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.championship_matches := private.staff_match(p_match_id);
  v_rules jsonb;
  v_side text;
begin
  if v_match.entry_a_id is null or v_match.entry_b_id is null then
    perform private.fail('invalid_state');
  end if;
  select match_rules into v_rules from public.championship_categories where id = v_match.category_id;
  v_side := private.match_winner(p_sets, v_rules);
  return private.apply_result(v_match, p_sets,
                              case when v_side = 'a' then v_match.entry_a_id else v_match.entry_b_id end, null);
end;
$$;

-- "W.O.": the pair that did not show up loses 6-0 6-0.
create function public.record_walkover(p_match_id uuid, p_absent_entry_id uuid)
returns public.championship_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.championship_matches := private.staff_match(p_match_id);
  v_winner uuid;
begin
  if v_match.entry_a_id is null or v_match.entry_b_id is null then
    perform private.fail('invalid_state');
  end if;
  if p_absent_entry_id is null or p_absent_entry_id not in (v_match.entry_a_id, v_match.entry_b_id) then
    perform private.fail('invalid_input');
  end if;
  v_winner := case when p_absent_entry_id = v_match.entry_a_id then v_match.entry_b_id else v_match.entry_a_id end;
  return private.apply_result(v_match,
    case when v_winner = v_match.entry_a_id then '[[6,0],[6,0]]' else '[[0,6],[0,6]]' end::jsonb,
    v_winner, p_absent_entry_id);
end;
$$;

-- Closes a group with its final order (lib/domain/championship-standings.ts computes it; a tie that remains is
-- the organizer's): every match played, every pair once, nobody above a pair that won more. Its places go to the
-- bracket.
create function public.close_championship_group(p_group_id uuid, p_entry_ids uuid[])
returns public.championship_groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.championship_groups;
  v_championship public.championships;
begin
  select * into v_group from public.championship_groups where id = p_group_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.staff_championship(v_group.championship_id);
  if v_championship.status not in ('published', 'in_progress') then
    perform private.fail('invalid_state');
  end if;
  if exists (select 1 from public.championship_matches
             where group_id = v_group.id and status not in ('finished', 'walkover')) then
    perform private.fail('scores_missing');
  end if;
  if p_entry_ids is null
     or cardinality(p_entry_ids) <> (select count(*) from public.championship_group_members where group_id = v_group.id)
     or (select count(distinct e) from unnest(p_entry_ids) as e) <> cardinality(p_entry_ids)
     or exists (
       select 1 from unnest(p_entry_ids) as e (id)
       where not exists (select 1 from public.championship_group_members gm
                         where gm.group_id = v_group.id and gm.entry_id = e.id)
     ) then
    perform private.fail('invalid_input');
  end if;
  if exists (
    with wins as (
      select s.id, s.n,
             (select count(*) from public.championship_matches m
              where m.group_id = v_group.id and m.winner_entry_id = s.id) as won
      from unnest(p_entry_ids) with ordinality as s (id, n)
    )
    select 1 from wins a join wins b on b.n = a.n + 1 where b.won > a.won
  ) then
    perform private.fail('invalid_input');
  end if;
  if exists (
    select 1 from public.championship_matches n
    where n.championship_id = v_group.championship_id and n.status <> 'scheduled'
      and (n.source_a ->> 'group' = v_group.id::text or n.source_b ->> 'group' = v_group.id::text)
  ) then
    perform private.fail('invalid_state');
  end if;

  update public.championship_group_members set place = null where group_id = v_group.id;
  update public.championship_group_members gm set place = s.n
    from unnest(p_entry_ids) with ordinality as s (id, n)
   where gm.group_id = v_group.id and gm.entry_id = s.id;
  update public.championship_matches n
     set entry_a_id = (select gm.entry_id from public.championship_group_members gm
                       where gm.group_id = v_group.id and gm.place = (n.source_a ->> 'place')::integer)
   where n.championship_id = v_group.championship_id and n.source_a ->> 'group' = v_group.id::text;
  update public.championship_matches n
     set entry_b_id = (select gm.entry_id from public.championship_group_members gm
                       where gm.group_id = v_group.id and gm.place = (n.source_b ->> 'place')::integer)
   where n.championship_id = v_group.championship_id and n.source_b ->> 'group' = v_group.id::text;
  perform private.mark_in_progress(v_group.championship_id);
  return v_group;
end;
$$;

-- "Finalizar": every match played and every group closed.
create function public.finish_championship(p_championship_id uuid)
returns public.championships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
begin
  if v_championship.status <> 'in_progress' then
    perform private.fail('invalid_state');
  end if;
  if exists (select 1 from public.championship_matches
             where championship_id = v_championship.id and status not in ('finished', 'walkover'))
     or exists (select 1 from public.championship_group_members gm
                join public.championship_groups g on g.id = gm.group_id
                where g.championship_id = v_championship.id and gm.place is null) then
    perform private.fail('scores_missing');
  end if;
  update public.championships set status = 'finished' where id = v_championship.id returning * into v_championship;
  return v_championship;
end;
$$;

revoke all on function private.set_done(integer, integer, boolean) from public;
revoke all on function private.set_partial(integer, integer, boolean) from public;
revoke all on function private.match_winner(jsonb, jsonb) from public;
revoke all on function private.staff_match(uuid) from public;
revoke all on function private.mark_in_progress(uuid) from public;
revoke all on function private.next_matches(uuid) from public;
revoke all on function private.apply_result(public.championship_matches, jsonb, uuid, uuid) from public;
revoke execute on function public.start_match(uuid) from public, anon;
revoke execute on function public.record_match_result(uuid, jsonb) from public, anon;
revoke execute on function public.record_walkover(uuid, uuid) from public, anon;
revoke execute on function public.close_championship_group(uuid, uuid[]) from public, anon;
revoke execute on function public.finish_championship(uuid) from public, anon;
grant execute on function public.start_match(uuid) to authenticated;
grant execute on function public.record_match_result(uuid, jsonb) to authenticated;
grant execute on function public.record_walkover(uuid, uuid) to authenticated;
grant execute on function public.close_championship_group(uuid, uuid[]) to authenticated;
grant execute on function public.finish_championship(uuid) to authenticated;
