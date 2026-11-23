-- Asistente del club, part 4: reception invites players to a forming match. Each invitation is kept once per
-- player and match, and writes an aviso (match_invite) that /avisos shows and lib/notify mails. Staff read the
-- club's invitations; players do not (the aviso is theirs, the list is not).
create table public.match_invites (
  match_id uuid not null references public.open_matches (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (match_id, player_id)
);
create index match_invites_player_id_idx on public.match_invites (player_id);
create index match_invites_club_id_idx on public.match_invites (club_id);
alter table public.match_invites enable row level security;

revoke all on public.match_invites from anon, authenticated;
grant select on public.match_invites to authenticated;
create policy match_invites_select_staff on public.match_invites
  for select to authenticated
  using (private.has_club_role(club_id, array['admin', 'reception']::public.club_role[]));

-- Invites members of the club who are not in the match and were not invited to it yet; returns how many.
-- Only staff, only a forming match before its closing time.
create function public.invite_to_match(p_match_id uuid, p_player_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_match public.open_matches;
  v_court_name text;
  v_count integer;
begin
  select * into v_match from public.open_matches where id = p_match_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null or not private.is_staff(v_match.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_match.status <> 'forming' or now() >= private.match_closes_at(v_match) then
    perform private.fail('match_closed');
  end if;
  if p_player_ids is null or cardinality(p_player_ids) = 0 or cardinality(p_player_ids) > 50 then
    perform private.fail('invalid_input');
  end if;
  select name into v_court_name from public.courts where id = v_match.preferred_court_id;

  with wanted as (
    select distinct unnest(p_player_ids) as id
  ),
  invited as (
    insert into public.match_invites (match_id, player_id, club_id, invited_by)
    select v_match.id, m.user_id, v_match.club_id, v_uid
    from wanted w
    join public.club_members m on m.club_id = v_match.club_id and m.user_id = w.id
    where not exists (select 1 from public.match_slots s where s.match_id = v_match.id and s.player_id = m.user_id)
    on conflict (match_id, player_id) do nothing
    returning player_id
  ),
  noticed as (
    insert into public.notifications (club_id, user_id, kind, data, link)
    select v_match.club_id, i.player_id, 'match_invite',
           jsonb_build_object('court_name', v_court_name, 'starts_at', v_match.starts_at,
                              'category_min', v_match.category_min, 'category_max', v_match.category_max,
                              'match_type', v_match.match_type),
           '/partidos/' || v_match.id
    from invited i
    returning 1
  )
  select count(*)::integer into v_count from noticed;
  return v_count;
end;
$$;

revoke execute on function public.invite_to_match(uuid, uuid[]) from public, anon;
grant execute on function public.invite_to_match(uuid, uuid[]) to authenticated;
