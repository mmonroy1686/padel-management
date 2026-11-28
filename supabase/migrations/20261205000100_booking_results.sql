-- The result of a court booking that was played (design: docs/features/historial-jugador/design.md).
--
-- A booking's players are its positions 1 to 4: the holder and booking_players, or the open match's slots. Any of
-- them who has an account, or the club's staff, writes the result (pairs and sets); no confirmation. It feeds the
-- player's own history, nothing else.

create table public.booking_results (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  -- The two positions (1 to 4) of pair A; pair B is the other two.
  team_a smallint[] not null,
  games_a smallint[] not null,
  games_b smallint[] not null,
  recorded_by uuid references public.profiles (id) on delete set null,
  recorded_at timestamptz not null default now()
);

-- Everyone who played a booking, by position: the open match's slots, or the holder and the players added to it.
create function private.booking_participants(p_booking_id uuid)
returns table (pos smallint, player_id uuid, name text, team text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.position, s.player_id, p.display_name, s.team
  from public.bookings b
  join public.match_slots s on s.match_id = b.match_id
  left join public.profiles p on p.id = s.player_id
  where b.id = p_booking_id and b.match_id is not null and s.player_id is not null
  union all
  select 1::smallint, b.player_id, coalesce(p.display_name, b.guest_name), null
  from public.bookings b
  left join public.profiles p on p.id = b.player_id
  where b.id = p_booking_id and b.match_id is null and (b.player_id is not null or b.guest_name is not null)
  union all
  select bp.position, bp.player_id, coalesce(p.display_name, bp.name), null
  from public.bookings b
  join public.booking_players bp on bp.booking_id = b.id
  left join public.profiles p on p.id = bp.player_id
  where b.id = p_booking_id and b.match_id is null;
$$;

create function private.is_booking_participant(p_booking_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
     and exists (select 1 from private.booking_participants(p_booking_id) where player_id = p_user_id);
$$;

alter table public.booking_results enable row level security;
revoke all on public.booking_results from public, anon, authenticated;
grant select on public.booking_results to authenticated;

create policy booking_results_read on public.booking_results
for select to authenticated
using (private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
       or private.is_booking_participant(booking_id, (select auth.uid())));

-- Who may write a booking's result: its staff, or one of its players.
create function private.checked_result_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    perform private.fail('not_found');
  end if;
  if not (private.is_staff(v_booking.club_id) or private.is_booking_participant(p_booking_id, (select auth.uid()))) then
    perform private.fail('forbidden');
  end if;
  if v_booking.status <> 'confirmed' then
    perform private.fail('invalid_state');
  end if;
  if v_booking.starts_at > now() then
    perform private.fail('not_played_yet');
  end if;
  return v_booking;
end;
$$;

create function public.save_booking_result(
  p_booking_id uuid, p_team_a smallint[], p_games_a smallint[], p_games_b smallint[]
)
returns public.booking_results
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_result public.booking_results;
  v_sets integer := coalesce(array_length(p_games_a, 1), 0);
  v_won_a integer := 0;
  v_won_b integer := 0;
begin
  v_booking := private.checked_result_booking(p_booking_id);
  if (select count(distinct pos) from private.booking_participants(p_booking_id) where pos between 1 and 4) < 4 then
    perform private.fail('incomplete_players');
  end if;
  if coalesce(array_length(p_team_a, 1), 0) <> 2 or p_team_a[1] = p_team_a[2]
     or p_team_a[1] not between 1 and 4 or p_team_a[2] not between 1 and 4 then
    perform private.fail('invalid_input');
  end if;
  if v_sets not between 1 and 3 or coalesce(array_length(p_games_b, 1), 0) <> v_sets then
    perform private.fail('invalid_sets');
  end if;
  for i in 1 .. v_sets loop
    if p_games_a[i] is null or p_games_b[i] is null or p_games_a[i] not between 0 and 30
       or p_games_b[i] not between 0 and 30 or p_games_a[i] = p_games_b[i] then
      perform private.fail('invalid_sets');
    end if;
    if p_games_a[i] > p_games_b[i] then v_won_a := v_won_a + 1; else v_won_b := v_won_b + 1; end if;
  end loop;
  if v_won_a = v_won_b then
    perform private.fail('invalid_sets');
  end if;

  insert into public.booking_results (booking_id, club_id, team_a, games_a, games_b, recorded_by)
  values (p_booking_id, v_booking.club_id, array(select unnest(p_team_a) order by 1), p_games_a, p_games_b,
          (select auth.uid()))
  on conflict (booking_id) do update
    set team_a = excluded.team_a, games_a = excluded.games_a, games_b = excluded.games_b,
        recorded_by = excluded.recorded_by, recorded_at = now()
  returning * into v_result;
  return v_result;
end;
$$;

create function public.clear_booking_result(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.checked_result_booking(p_booking_id);
  delete from public.booking_results where booking_id = p_booking_id;
end;
$$;

-- Perfil → "Partidos jugados": the viewer's played bookings in the club, newest first, with their 4 players and the
-- result if there is one.
create function public.my_played_bookings(p_club_id uuid, p_limit integer default 30)
returns table (
  booking_id uuid,
  starts_at timestamptz,
  court_name text,
  players jsonb,
  team_a smallint[],
  games_a smallint[],
  games_b smallint[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select b.id, b.starts_at, b.court_id
    from public.bookings b
    where b.club_id = p_club_id and b.status = 'confirmed' and b.starts_at < now()
      and private.is_booking_participant(b.id, (select auth.uid()))
    order by b.starts_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  )
  select m.id, m.starts_at, c.name,
         (select coalesce(jsonb_agg(jsonb_build_object('position', p.pos, 'name', p.name, 'team', p.team,
                                                       'isMe', p.player_id = (select auth.uid()))
                                    order by p.pos), '[]'::jsonb)
            from private.booking_participants(m.id) p),
         r.team_a, r.games_a, r.games_b
  from mine m
  join public.courts c on c.id = m.court_id
  left join public.booking_results r on r.booking_id = m.id
  order by m.starts_at desc;
$$;

revoke all on function private.booking_participants(uuid) from public;
revoke all on function private.is_booking_participant(uuid, uuid) from public;
-- The read policy calls it as the reader.
grant execute on function private.is_booking_participant(uuid, uuid) to authenticated;
revoke all on function private.checked_result_booking(uuid) from public;
revoke execute on function public.save_booking_result(uuid, smallint[], smallint[], smallint[]) from public, anon;
revoke execute on function public.clear_booking_result(uuid) from public, anon;
revoke execute on function public.my_played_bookings(uuid, integer) from public, anon;
grant execute on function public.save_booking_result(uuid, smallint[], smallint[], smallint[]) to authenticated;
grant execute on function public.clear_booking_result(uuid) to authenticated;
grant execute on function public.my_played_bookings(uuid, integer) to authenticated;
