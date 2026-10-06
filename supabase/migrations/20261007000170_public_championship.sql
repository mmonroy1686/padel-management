-- Campeonatos, día del torneo, part 6: the public page (/c/<code>), for anyone with the link. The only function
-- anon may run (integrity.test.sql pins it): read-only, and only public data. Names, dates, rules, categories,
-- pairs (names only), and once published the groups and matches with their results. Nothing for a draft or a
-- cancelled championship; never phones, payments, notes or profile ids.
create function public.public_championship(p_code text)
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
                                                     'games_b', s.games_b, 'super_tiebreak', s.super_tiebreak)
                                  order by s.set_number)
                 from public.championship_match_sets s where s.match_id = m.id), '[]'::jsonb))
             order by m.starts_at nulls last, m.id)
      from public.championship_matches m where m.championship_id = ch.id), '[]'::jsonb) else '[]'::jsonb end
  )
  from public.championships ch
  join public.clubs cl on cl.id = ch.club_id
  where ch.public_code = p_code and ch.status not in ('draft', 'cancelled');
$$;

revoke all on function public.public_championship(text) from public;
grant execute on function public.public_championship(text) to anon, authenticated;
