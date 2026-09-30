-- Tournaments, part 3: the fixture, the results and the end. The fixture is built here, in the same
-- transaction that puts the tournament in progress, so nobody can send one made up.

-- Circle method: players 1..n-1 turn one place each round around player n, who stays put. Round r
-- pairs (r, n) and ((r + k), (r - k)) mod (n - 1) for k = 1 .. n/2 - 1, so over n - 1 rounds every
-- two players are partners exactly once. Consecutive pairs play each other; game i of a round goes
-- to court (i mod courts) in wave (i div courts). The starting order is shuffled.
create function public.start_tournament(p_tournament_id uuid)
returns public.tournaments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament public.tournaments := private.staff_tournament(p_tournament_id);
  v_entries uuid[];
  v_n integer;
  v_rounds integer;
  v_courts integer;
  v_games integer;
  v_waves integer;
  v_pairs uuid[];
  v_round integer;
  v_game integer;
  v_k integer;
begin
  if v_tournament.status <> 'closed' then
    perform private.fail('invalid_state');
  end if;

  select array_agg(e.id order by random()) into v_entries
  from public.tournament_entries e
  where e.tournament_id = v_tournament.id and e.removed_at is null;
  v_n := coalesce(cardinality(v_entries), 0);
  if v_n not in (8, 12, 16) then
    perform private.fail('not_enough_players');
  end if;

  v_rounds := least(v_tournament.rounds, v_n - 1);
  v_courts := cardinality(v_tournament.court_ids);
  v_games := v_n / 4;
  v_waves := ceil(v_games::numeric / v_courts)::integer;

  for v_round in 0 .. v_rounds - 1 loop
    -- Flat list of pairs: pair k is (v_pairs[2k + 1], v_pairs[2k + 2]).
    v_pairs := array[v_entries[v_round + 1], v_entries[v_n]];
    for v_k in 1 .. v_n / 2 - 1 loop
      v_pairs := v_pairs
        || v_entries[(v_round + v_k) % (v_n - 1) + 1]
        || v_entries[(v_round - v_k + v_n - 1) % (v_n - 1) + 1];
    end loop;

    for v_game in 0 .. v_games - 1 loop
      insert into public.tournament_games (club_id, tournament_id, round, wave, court_id, starts_at,
                                           a1_entry_id, a2_entry_id, b1_entry_id, b2_entry_id)
      values (
        v_tournament.club_id, v_tournament.id, v_round + 1, v_game / v_courts + 1,
        v_tournament.court_ids[v_game % v_courts + 1],
        lower(v_tournament.period)
          + make_interval(mins => (v_round * v_waves + v_game / v_courts) * v_tournament.round_minutes),
        v_pairs[4 * v_game + 1], v_pairs[4 * v_game + 2], v_pairs[4 * v_game + 3], v_pairs[4 * v_game + 4]
      );
    end loop;
  end loop;

  update public.tournaments set status = 'in_progress', rounds = v_rounds
   where id = v_tournament.id
  returning * into v_tournament;
  return v_tournament;
end;
$$;

-- Team A's points; team B gets the rest. Reception can correct it while the tournament is on.
create function public.record_tournament_score(p_game_id uuid, p_score_a integer)
returns public.tournament_games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.tournament_games;
  v_tournament public.tournaments;
begin
  select * into v_game from public.tournament_games where id = p_game_id;
  if not found then
    perform private.fail('not_found');
  end if;
  -- The tournament first, like finish_tournament, so a result and the end cannot cross.
  v_tournament := private.staff_tournament(v_game.tournament_id);
  if v_tournament.status <> 'in_progress' then
    perform private.fail('invalid_state');
  end if;
  if p_score_a is null or p_score_a not between 0 and v_tournament.points_per_game then
    perform private.fail('invalid_score');
  end if;

  update public.tournament_games
     set score_a = p_score_a, recorded_by = (select auth.uid()), recorded_at = now()
   where id = v_game.id
  returning * into v_game;
  return v_game;
end;
$$;

create function public.finish_tournament(p_tournament_id uuid)
returns public.tournaments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament public.tournaments := private.staff_tournament(p_tournament_id);
begin
  if v_tournament.status <> 'in_progress' then
    perform private.fail('invalid_state');
  end if;
  if exists (select 1 from public.tournament_games where tournament_id = v_tournament.id and score_a is null) then
    perform private.fail('scores_missing');
  end if;
  update public.tournaments set status = 'finished' where id = v_tournament.id returning * into v_tournament;
  return v_tournament;
end;
$$;

revoke execute on function public.start_tournament(uuid) from public, anon;
revoke execute on function public.record_tournament_score(uuid, integer) from public, anon;
revoke execute on function public.finish_tournament(uuid) from public, anon;
grant execute on function public.start_tournament(uuid) to authenticated;
grant execute on function public.record_tournament_score(uuid, integer) to authenticated;
grant execute on function public.finish_tournament(uuid) to authenticated;
