-- Campeonatos, día del torneo, review fixes.
-- 1. The draw's bracket is checked in full: with groups only group places enter it (exactly the ones that
--    qualify); every match before the final leads to one match of the next round; one match per place.
-- 2. A match is never placed on a court taken by anything else than its own championship (a day of play given
--    back to the grid and booked, a block).
-- 3. Sending a winner on looks only at its championship's matches (uses the index).

create or replace function private.draw_problem(p_category public.championship_categories)
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
    )
    -- With groups, the bracket only takes places from the groups (never a pair straight in), exactly the
    -- places that qualify from each group.
    or (p_category.format = 'groups_knockout' and exists (
          select 1 from public.championship_matches m
          where m.category_id = p_category.id and m.stage = 'knockout'
            and (m.entry_a_id is not null or m.entry_b_id is not null)))
    or (p_category.format = 'groups_knockout' and exists (
          select 1 from public.championship_groups g
          where g.category_id = p_category.id
            and (select count(*) from public.championship_matches m
                 cross join lateral (values (m.source_a), (m.source_b)) as s (source)
                 where m.category_id = p_category.id and s.source ->> 'group' = g.id::text
                   and (s.source ->> 'place')::integer between 1 and p_category.qualifiers_per_group)
                <> p_category.qualifiers_per_group
            or exists (select 1 from public.championship_matches m
                       cross join lateral (values (m.source_a), (m.source_b)) as s (source)
                       where m.category_id = p_category.id and s.source ->> 'group' = g.id::text
                         and (s.source ->> 'place')::integer > p_category.qualifiers_per_group)))
    -- Every match before the final leads to exactly one match of the next round.
    or exists (
      select 1 from public.championship_matches m
      where m.category_id = p_category.id and m.stage = 'knockout' and m.round > 1
        and (select count(*) from public.championship_matches n
             where n.category_id = p_category.id
               and (n.source_a ->> 'winner_of' = m.id::text or n.source_b ->> 'winner_of' = m.id::text)) <> 1
    )
    -- One match per place of the bracket.
    or exists (
      select 1 from public.championship_matches m
      where m.category_id = p_category.id and m.stage = 'knockout'
      group by m.round, m.bracket_position
      having count(*) > 1
    );
$$;

create or replace function private.schedule_problem(p_championship_id uuid, p_match_id uuid default null)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_timezone text;
begin
  select c.timezone into v_timezone
  from public.championships ch join public.clubs c on c.id = ch.club_id
  where ch.id = p_championship_id;

  -- Inside a day of play and on one of its courts, on the category's steps from the start of that day, as long
  -- as the category's matches.
  if exists (
    select 1 from public.championship_matches m
    join public.championship_categories c on c.id = m.category_id
    where m.championship_id = p_championship_id and m.court_id is not null
      and (p_match_id is null or m.id = p_match_id)
      and (m.ends_at - m.starts_at <> make_interval(mins => c.match_minutes)
           or not exists (
             select 1 from public.championship_windows w
             cross join lateral (select private.window_period(w, v_timezone) as period) as p
             where w.championship_id = p_championship_id and m.court_id = any (w.court_ids)
               and p.period @> tstzrange(m.starts_at, m.ends_at)
               and (extract(epoch from m.starts_at - lower(p.period))::integer / 60) % c.match_minutes = 0))
  ) then
    return 'outside_play_days';
  end if;

  -- One court, one match (the deferred exclusion constraint has the last word).
  if exists (
    select 1 from public.championship_matches a
    join public.championship_matches b
      on b.court_id = a.court_id and b.id <> a.id
     and tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)
    where a.championship_id = p_championship_id and a.court_id is not null
      and (p_match_id is null or a.id = p_match_id)
  ) then
    return 'courts_busy';
  end if;
  -- Nor on a court taken by anything else: a day of play given back to the grid and booked, a block.
  if exists (
    select 1 from public.championship_matches m
    join public.court_occupancy o
      on o.court_id = m.court_id and o.period && tstzrange(m.starts_at, m.ends_at)
     and o.championship_id is distinct from p_championship_id
    where m.championship_id = p_championship_id and m.court_id is not null
      and (p_match_id is null or m.id = p_match_id)
  ) then
    return 'courts_busy';
  end if;

  -- A knockout match starts 45 minutes after the matches that define it end (for a group's place, all of them).
  if exists (
    select 1 from public.championship_matches m
    cross join lateral (values (m.source_a), (m.source_b)) as s (source)
    join public.championship_matches f
      on f.id = (s.source ->> 'winner_of')::uuid or f.group_id = (s.source ->> 'group')::uuid
    where m.championship_id = p_championship_id and m.starts_at is not null
      and (p_match_id is null or m.id = p_match_id or f.id = p_match_id)
      and (f.ends_at is null or m.starts_at < f.ends_at + interval '45 minutes')
  ) then
    return 'too_early';
  end if;

  -- A pair rests 45 minutes between matches; a player in two categories is never in two places at once.
  if exists (
    with plays as (
      select m.id, m.starts_at, m.ends_at, s.entry_id
      from public.championship_matches m
      cross join lateral (values (m.entry_a_id), (m.entry_b_id)) as s (entry_id)
      where m.championship_id = p_championship_id and m.starts_at is not null and s.entry_id is not null
    )
    select 1 from plays a join plays b on b.entry_id = a.entry_id and b.id <> a.id
    where (p_match_id is null or a.id = p_match_id)
      and a.starts_at < b.ends_at + interval '45 minutes' and b.starts_at < a.ends_at + interval '45 minutes'
  ) or exists (
    with plays as (
      select m.id, m.starts_at, m.ends_at, p.player_id
      from public.championship_matches m
      join public.championship_entries e on e.id in (m.entry_a_id, m.entry_b_id)
      cross join lateral (values (e.player1_id), (e.player2_id)) as p (player_id)
      where m.championship_id = p_championship_id and m.starts_at is not null
    )
    select 1 from plays a join plays b on b.player_id = a.player_id and b.id <> a.id
    where (p_match_id is null or a.id = p_match_id)
      and a.starts_at < b.ends_at and b.starts_at < a.ends_at
  ) then
    return 'pair_busy';
  end if;

  -- Never when a pair said it cannot play (its "horarios imposibles").
  if exists (
    select 1 from public.championship_matches m
    join public.entry_unavailability u on u.entry_id in (m.entry_a_id, m.entry_b_id)
    where m.championship_id = p_championship_id and m.starts_at is not null
      and (p_match_id is null or m.id = p_match_id)
      and tstzrange(m.starts_at, m.ends_at)
          && tstzrange((u.on_date + u.from_time) at time zone v_timezone,
                       (u.on_date + u.to_time) at time zone v_timezone)
  ) then
    return 'unavailable_pair';
  end if;
  return null;
end;
$$;

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
