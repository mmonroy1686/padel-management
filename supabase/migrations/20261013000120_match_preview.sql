-- Marca del club, part 2: the preview WhatsApp shows for a link to an open match ("Falta 1 de revés · jue 20:00").
-- WhatsApp has no session, so anon reads it: only when the match starts and which sides are free, while it is
-- forming and still ahead. Never names, court, category or price. Null for anything else.
create function public.match_preview(p_match_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'starts_at', m.starts_at,
    'open_sides', coalesce((
      select jsonb_agg(s.side order by s.position)
      from public.match_slots s
      where s.match_id = m.id and s.player_id is null), '[]'::jsonb))
  from public.open_matches m
  where m.id = p_match_id and m.status = 'forming' and m.starts_at > now();
$$;

revoke all on function public.match_preview(uuid) from public;
grant execute on function public.match_preview(uuid) to anon, authenticated;
