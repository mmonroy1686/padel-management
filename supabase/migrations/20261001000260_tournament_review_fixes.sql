-- Fase 3a review fixes. drop_entry locks the reported payments before the entry (confirm_payment
-- locks the payment first), leaving needs a tournament that has not started, and start_tournament
-- trims the period and the courts it blocks to what the real players and rounds need.

create or replace function private.drop_entry(p_entry public.tournament_entries, p_reason text)
returns public.tournament_entries
language plpgsql
set search_path = ''
as $$
declare
  v_entry public.tournament_entries;
begin
  if p_entry.removed_at is not null then
    perform private.fail('invalid_state');
  end if;
  -- Payments before the entry, the same order as confirm_payment, so the two cannot deadlock.
  perform 1 from public.payments where tournament_entry_id = p_entry.id and status = 'reported' for update;
  update public.tournament_entries set removed_at = now(), removed_by = (select auth.uid())
   where id = p_entry.id
  returning * into v_entry;
  update public.payments
     set status = 'rejected', rejection_reason = p_reason,
         confirmed_by = (select auth.uid()), confirmed_at = now()
   where tournament_entry_id = p_entry.id and status = 'reported';
  return v_entry;
end;
$$;

-- Only while registration is open and the tournament has not started. Someone who already paid gets it back from the club (Cobros).
create or replace function public.leave_tournament(p_tournament_id uuid)
returns public.tournament_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tournament public.tournaments;
  v_entry public.tournament_entries;
begin
  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  select * into v_entry from public.tournament_entries
   where tournament_id = v_tournament.id and player_id = v_uid and removed_at is null;
  if v_uid is null or not found then
    perform private.fail('forbidden');
  end if;
  if v_tournament.status <> 'registration' or v_tournament.starts_at <= now() then
    perform private.fail('tournament_closed');
  end if;
  return private.drop_entry(v_entry, 'Saliste del torneo');
end;
$$;

create or replace function public.start_tournament(p_tournament_id uuid)
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

  -- The period was sized for the maximum; with fewer players or rounds it ends earlier, so the courts
  -- and the players are free again after the real end.
  update public.tournaments
     set status = 'in_progress', rounds = v_rounds,
         period = tstzrange(lower(period), lower(period) + make_interval(
           mins => private.tournament_minutes(v_n, v_courts, v_rounds, round_minutes)))
   where id = v_tournament.id
  returning * into v_tournament;
  update public.court_occupancy set period = v_tournament.period where tournament_id = v_tournament.id;
  return v_tournament;
end;
$$;
