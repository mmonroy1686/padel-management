-- Campeonatos, día del torneo, part 3: the schedule. lib/domain/championship-schedule.ts places every match;
-- save_championship_schedule saves it and private.schedule_problem checks the hard rules again. The organizer
-- moves a match by hand (set_match_slot, which also pins it) and pins or unpins matches before publishing.

-- The first hard rule the schedule breaks, as an error code, or null. With p_match_id, only the problems that
-- involve that match (moving one match never fails because of another one).
create function private.schedule_problem(p_championship_id uuid, p_match_id uuid default null)
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

-- Saves where every match goes ([{match_id, court_id, starts_at}], no court for one left out). Pinned matches
-- stay where they are; every other match not listed is left without a court. Only before publishing.
create function public.save_championship_schedule(p_championship_id uuid, p_slots jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
  v_slot jsonb;
  v_match public.championship_matches;
  v_minutes integer;
  v_starts timestamptz;
  v_problem text;
begin
  if v_championship.status <> 'drawn' then
    perform private.fail('invalid_state');
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    perform private.fail('invalid_input');
  end if;

  update public.championship_matches set court_id = null, starts_at = null, ends_at = null
   where championship_id = v_championship.id and not pinned;
  for v_slot in select s.item from jsonb_array_elements(p_slots) as s (item) loop
    select * into v_match from public.championship_matches
     where id = private.json_uuid(v_slot -> 'match_id') and championship_id = v_championship.id;
    if not found then
      perform private.fail('not_found');
    end if;
    if v_match.pinned or v_slot -> 'court_id' is null or jsonb_typeof(v_slot -> 'court_id') = 'null' then
      continue;
    end if;
    if jsonb_typeof(v_slot -> 'starts_at') is distinct from 'string' then
      perform private.fail('invalid_input');
    end if;
    v_starts := (v_slot ->> 'starts_at')::timestamptz;
    select match_minutes into v_minutes from public.championship_categories where id = v_match.category_id;
    update public.championship_matches
       set court_id = private.json_uuid(v_slot -> 'court_id'), starts_at = v_starts,
           ends_at = v_starts + make_interval(mins => v_minutes)
     where id = v_match.id;
  end loop;

  v_problem := private.schedule_problem(v_championship.id);
  if v_problem is not null then
    perform private.fail(v_problem);
  end if;
  return (select count(*)::integer from public.championship_matches
          where championship_id = v_championship.id and court_id is not null);
end;
$$;

-- "Editar": another court and start for a match not played yet, from the drawn fixture to the day of the
-- tournament. It also pins the match.
create function public.set_match_slot(p_match_id uuid, p_court_id uuid, p_starts_at timestamptz)
returns public.championship_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.championship_matches;
  v_championship public.championships;
  v_minutes integer;
  v_problem text;
begin
  select * into v_match from public.championship_matches where id = p_match_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.staff_championship(v_match.championship_id);
  if v_championship.status not in ('drawn', 'published', 'in_progress') then
    perform private.fail('invalid_state');
  end if;
  -- Read again under the championship's lock.
  select * into v_match from public.championship_matches where id = p_match_id;
  if v_match.status <> 'scheduled' then
    perform private.fail('invalid_state');
  end if;
  if p_court_id is null or p_starts_at is null then
    perform private.fail('invalid_input');
  end if;

  select match_minutes into v_minutes from public.championship_categories where id = v_match.category_id;
  update public.championship_matches
     set court_id = p_court_id, starts_at = p_starts_at, ends_at = p_starts_at + make_interval(mins => v_minutes),
         pinned = true
   where id = v_match.id
  returning * into v_match;
  v_problem := private.schedule_problem(v_championship.id, v_match.id);
  if v_problem is not null then
    perform private.fail(v_problem);
  end if;
  return v_match;
end;
$$;

-- "Fijar" / "Soltar", before publishing: "Volver a programar" leaves a pinned match where it is.
create function public.set_match_pinned(p_match_id uuid, p_pinned boolean)
returns public.championship_matches
language plpgsql
security definer
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
  if v_championship.status <> 'drawn' then
    perform private.fail('invalid_state');
  end if;
  select * into v_match from public.championship_matches where id = p_match_id;
  if p_pinned is null or (p_pinned and v_match.court_id is null) then
    perform private.fail('invalid_state');
  end if;
  update public.championship_matches set pinned = p_pinned where id = v_match.id returning * into v_match;
  return v_match;
end;
$$;

revoke all on function private.schedule_problem(uuid, uuid) from public;
revoke execute on function public.save_championship_schedule(uuid, jsonb) from public, anon;
revoke execute on function public.set_match_slot(uuid, uuid, timestamptz) from public, anon;
revoke execute on function public.set_match_pinned(uuid, boolean) from public, anon;
grant execute on function public.save_championship_schedule(uuid, jsonb) to authenticated;
grant execute on function public.set_match_slot(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.set_match_pinned(uuid, boolean) to authenticated;
