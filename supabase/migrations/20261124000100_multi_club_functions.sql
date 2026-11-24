-- Multi-club: one club per subdomain. Three functions learn which club a row belongs to.
--
-- 1. claim_notification_emails also returns the club's slug: one central job mails every club's avisos, and each link
--    must open that club's subdomain. The new column goes last, so the code still deployed reads the rest as before.
-- 2. public_championship returns the owner club's slug: a championship opened on another club's host redirects there.
-- 3. mark_notifications_read(p_club_id): opening the bell in one club marks only that club's avisos. The version without
--    arguments stays for the code deployed during the migration; the new app does not call it.

drop function public.claim_notification_emails(integer);

create function public.claim_notification_emails(p_limit integer default 20)
returns table (
  notification_id uuid,
  kind public.notification_kind,
  data jsonb,
  link text,
  email text,
  player_name text,
  club_name text,
  club_timezone text,
  club_logo_path text,
  club_brand_primary text,
  club_brand_background text,
  club_slug text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The mail of a hold that is no longer active would offer a slot that is gone.
  update public.notifications n
     set email_status = 'skipped', email_locked_until = null
   where n.kind = 'slot_held' and n.email_status in ('pending', 'failed')
     and not exists (
       select 1 from public.slot_holds h where h.id = (n.data ->> 'hold_id')::uuid and h.status = 'active'
     );

  return query
  with picked as (
    select n.id
    from public.notifications n
    where n.email_status in ('pending', 'failed') and n.email_attempts < 3
      and (n.email_locked_until is null or n.email_locked_until < now())
    order by n.created_at
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    for update skip locked
  ), claimed as (
    update public.notifications n
       set email_attempts = n.email_attempts + 1, email_locked_until = now() + interval '5 minutes'
      from picked
     where n.id = picked.id
    returning n.id, n.kind, n.data, n.link, n.user_id, n.club_id, n.created_at
  )
  select c.id, c.kind, c.data, c.link, u.email::text, p.display_name, cl.name, cl.timezone, cl.logo_path,
         cl.brand_primary, cl.brand_background, cl.slug
  from claimed c
  join auth.users u on u.id = c.user_id
  join public.profiles p on p.id = c.user_id
  join public.clubs cl on cl.id = c.club_id
  order by c.created_at;
end;
$$;

revoke execute on function public.claim_notification_emails(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_emails(integer) to service_role;

create or replace function public.public_championship(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'club', jsonb_build_object('name', cl.name, 'slug', cl.slug, 'logo_path', cl.logo_path, 'timezone', cl.timezone),
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

create function public.mark_notifications_read(p_club_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    perform private.fail('forbidden');
  end if;
  update public.notifications set read_at = now()
   where user_id = (select auth.uid()) and club_id = p_club_id and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.mark_notifications_read(uuid) from public, anon;
grant execute on function public.mark_notifications_read(uuid) to authenticated;
