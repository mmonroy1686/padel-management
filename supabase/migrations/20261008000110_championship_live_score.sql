-- Campeonatos, gestión en vivo, part 2: "+1" and "Deshacer". The sets of a match being played are worked out from
-- its live games, in order, under its category's rules (private.set_done): a set closes at 6 with 2 ahead, 7-5 or
-- 7-6 (at 6-6 the next game is the tie-break); a super tie-break third set goes to 10 by 2. Once a pair won 2 sets
-- the match is decided and takes no more games. "Terminar partido" sends the sets to record_match_result; the
-- final result (or a W.O.) clears the live games. The public page gets the set being played.

-- {"sets": [[6,4]], "current": [2,1], "decided": false}: the closed sets and the one being played (null once
-- decided, or before the first game).
create function private.live_sets(p_match_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_super_third boolean;
  v_sets jsonb := '[]'::jsonb;
  v_a integer := 0;
  v_b integer := 0;
  v_won_a integer := 0;
  v_won_b integer := 0;
  v_game record;
begin
  select coalesce(c.match_rules ->> 'third_set', 'super_tiebreak') = 'super_tiebreak' into v_super_third
  from public.championship_matches m
  join public.championship_categories c on c.id = m.category_id
  where m.id = p_match_id;
  for v_game in
    select g.side from public.championship_live_games g where g.match_id = p_match_id order by g.seq
  loop
    if v_won_a = 2 or v_won_b = 2 then
      perform private.fail('invalid_state');
    end if;
    if v_game.side = 'a' then
      v_a := v_a + 1;
    else
      v_b := v_b + 1;
    end if;
    if private.set_done(v_a, v_b, jsonb_array_length(v_sets) = 2 and v_super_third) then
      v_sets := v_sets || jsonb_build_array(jsonb_build_array(v_a, v_b));
      if v_a > v_b then
        v_won_a := v_won_a + 1;
      else
        v_won_b := v_won_b + 1;
      end if;
      v_a := 0;
      v_b := 0;
    end if;
  end loop;
  return jsonb_build_object(
    'sets', v_sets,
    'current', case when v_won_a < 2 and v_won_b < 2 and (v_a + v_b > 0 or jsonb_array_length(v_sets) > 0)
                    then jsonb_build_array(v_a, v_b) end,
    'decided', v_won_a = 2 or v_won_b = 2);
end;
$$;

-- Writes the sets of a match again from its live games (the one being played marked) and returns them.
create function private.write_live_sets(p_match public.championship_matches)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_live jsonb := private.live_sets(p_match.id);
  v_super_third boolean;
  v_closed integer := jsonb_array_length(v_live -> 'sets');
begin
  select coalesce(match_rules ->> 'third_set', 'super_tiebreak') = 'super_tiebreak' into v_super_third
  from public.championship_categories where id = p_match.category_id;
  delete from public.championship_match_sets where match_id = p_match.id;
  insert into public.championship_match_sets (match_id, club_id, set_number, games_a, games_b, super_tiebreak,
                                              in_progress)
  select p_match.id, p_match.club_id, s.n, (s.item ->> 0)::smallint, (s.item ->> 1)::smallint,
         s.n = 3 and v_super_third, s.n > v_closed
  from jsonb_array_elements(
         (v_live -> 'sets')
         || case when jsonb_typeof(v_live -> 'current') = 'array' then jsonb_build_array(v_live -> 'current')
                 else '[]'::jsonb end
       ) with ordinality as s (item, n);
  return v_live;
end;
$$;

-- "+1": a game for side 'a' or 'b' of a match being played.
create function public.score_live_game(p_match_id uuid, p_side text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.championship_matches := private.staff_match(p_match_id);
begin
  if p_side is null or p_side not in ('a', 'b') then
    perform private.fail('invalid_input');
  end if;
  if v_match.status <> 'playing' or (private.live_sets(v_match.id) ->> 'decided')::boolean then
    perform private.fail('invalid_state');
  end if;
  insert into public.championship_live_games (match_id, club_id, seq, side, created_by)
  values (v_match.id, v_match.club_id,
          coalesce((select max(seq) from public.championship_live_games where match_id = v_match.id), 0) + 1,
          p_side, (select auth.uid()));
  return private.write_live_sets(v_match);
end;
$$;

-- "Deshacer": the last game loaded goes away.
create function public.undo_live_game(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.championship_matches := private.staff_match(p_match_id);
begin
  if v_match.status <> 'playing' then
    perform private.fail('invalid_state');
  end if;
  delete from public.championship_live_games
   where match_id = v_match.id
     and seq = (select max(seq) from public.championship_live_games where match_id = v_match.id);
  if not found then
    perform private.fail('invalid_state');
  end if;
  return private.write_live_sets(v_match);
end;
$$;

-- As in 20261007000180, and the final result (or a W.O.) clears the live games: the result has the last word.
create or replace function private.apply_result(
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

  delete from public.championship_live_games where match_id = p_match.id;
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
    update public.championship_matches set entry_a_id = p_winner
     where championship_id = v_match.championship_id and source_a ->> 'winner_of' = v_match.id::text;
    update public.championship_matches set entry_b_id = p_winner
     where championship_id = v_match.championship_id and source_b ->> 'winner_of' = v_match.id::text;
  elsif p_match.status in ('finished', 'walkover') then
    update public.championship_group_members set place = null where group_id = v_match.group_id;
    update public.championship_matches set entry_a_id = null where source_a ->> 'group' = v_match.group_id::text;
    update public.championship_matches set entry_b_id = null where source_b ->> 'group' = v_match.group_id::text;
  end if;
  perform private.mark_in_progress(v_match.championship_id);
  return v_match;
end;
$$;

-- As in 20261007000170, with in_progress on every set (create or replace keeps its grants: anon still runs it).
create or replace function public.public_championship(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'club', jsonb_build_object('name', cl.name, 'logo_path', cl.logo_path, 'timezone', cl.timezone),
    'championship', jsonb_build_object('id', ch.id, 'name', ch.name, 'rules', ch.rules, 'status', ch.status,
                                       'public_code', ch.public_code, 'poster_path', ch.poster_path),
    'windows', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'on_date', w.on_date, 'from_time', w.from_time,
                                          'to_time', w.to_time, 'court_ids', w.court_ids)
                       order by w.on_date, w.from_time)
      from public.championship_windows w where w.championship_id = ch.id), '[]'::jsonb),
    'courts', coalesce((
      select jsonb_agg(jsonb_build_object('id', co.id, 'name', co.name) order by co.sort_order)
      from public.courts co where co.club_id = ch.club_id), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.name, 'gender', c.gender, 'format', c.format, 'group_size', c.group_size,
               'qualifiers_per_group', c.qualifiers_per_group, 'match_minutes', c.match_minutes,
               'match_rules', c.match_rules, 'sort_order', c.sort_order,
               'entries', coalesce((
                 select jsonb_agg(jsonb_build_object('id', e.id, 'player1_name', p1.name, 'player2_name', p2.name)
                                  order by e.created_at, e.id)
                 from public.championship_entries e
                 join public.players p1 on p1.id = e.player1_id
                 join public.players p2 on p2.id = e.player2_id
                 where e.category_id = c.id and e.status = 'active'), '[]'::jsonb))
             order by c.sort_order, c.name)
      from public.championship_categories c where c.championship_id = ch.id and c.status = 'open'), '[]'::jsonb),
    'groups', case when ch.status in ('published', 'in_progress', 'finished') then coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'category_id', g.category_id, 'name', g.name, 'sort_order', g.sort_order,
               'members', coalesce((
                 select jsonb_agg(jsonb_build_object('entry_id', gm.entry_id, 'draw_position', gm.draw_position,
                                                     'place', gm.place) order by gm.draw_position)
                 from public.championship_group_members gm where gm.group_id = g.id), '[]'::jsonb))
             order by g.sort_order)
      from public.championship_groups g where g.championship_id = ch.id), '[]'::jsonb) else '[]'::jsonb end,
    'matches', case when ch.status in ('published', 'in_progress', 'finished') then coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'category_id', m.category_id, 'stage', m.stage, 'group_id', m.group_id,
               'round', m.round, 'bracket_position', m.bracket_position, 'entry_a_id', m.entry_a_id,
               'entry_b_id', m.entry_b_id, 'source_a', m.source_a, 'source_b', m.source_b,
               'court_id', m.court_id, 'starts_at', m.starts_at, 'ends_at', m.ends_at, 'pinned', m.pinned,
               'status', m.status, 'winner_entry_id', m.winner_entry_id,
               'walkover_entry_id', m.walkover_entry_id,
               'sets', coalesce((
                 select jsonb_agg(jsonb_build_object('set_number', s.set_number, 'games_a', s.games_a,
                                                     'games_b', s.games_b, 'super_tiebreak', s.super_tiebreak,
                                                     'in_progress', s.in_progress)
                                  order by s.set_number)
                 from public.championship_match_sets s where s.match_id = m.id), '[]'::jsonb))
             order by m.starts_at nulls last, m.id)
      from public.championship_matches m where m.championship_id = ch.id), '[]'::jsonb) else '[]'::jsonb end
  )
  from public.championships ch
  join public.clubs cl on cl.id = ch.club_id
  where ch.public_code = p_code and ch.status not in ('draft', 'cancelled');
$$;

revoke all on function private.live_sets(uuid) from public;
revoke all on function private.write_live_sets(public.championship_matches) from public;
revoke execute on function public.score_live_game(uuid, text) from public, anon;
revoke execute on function public.undo_live_game(uuid) from public, anon;
grant execute on function public.score_live_game(uuid, text) to authenticated;
grant execute on function public.undo_live_game(uuid) to authenticated;
