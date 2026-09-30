-- Tournaments, part 2: who plays. Players sign up and leave while registration is open; reception
-- adds guests and takes people out until the tournament starts, and closes or reopens registration.
-- Joining takes the same per-player lock as bookings and matches ('book_slot:' || uid).

create function private.active_entry_count(p_tournament_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.tournament_entries
  where tournament_id = p_tournament_id and removed_at is null;
$$;

-- null when the person fits the tournament; otherwise the error code: category (her current one,
-- validated or not), then gender.
create function private.tournament_fit(p_user_id uuid, p_tournament public.tournaments)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when m.category is null or m.category not between p_tournament.category_min and p_tournament.category_max
      then 'category_mismatch'
    when p_tournament.match_type <> 'mixed' and p.gender::text is distinct from p_tournament.match_type::text
      then 'type_mismatch'
  end
  from public.profiles p
  left join public.club_members m on m.user_id = p.id and m.club_id = p_tournament.club_id
  where p.id = p_user_id;
$$;

-- Marks an entry removed and rejects its reported transfer. Confirmed payments stay for a refund.
-- Callers lock the tournament first.
create function private.drop_entry(p_entry public.tournament_entries, p_reason text)
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

-- Locks a tournament and checks the caller is staff of its club.
create function private.staff_tournament(p_tournament_id uuid)
returns public.tournaments
language plpgsql
set search_path = ''
as $$
declare
  v_tournament public.tournaments;
begin
  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_tournament.club_id) then
    perform private.fail('forbidden');
  end if;
  return v_tournament;
end;
$$;

create function public.join_tournament(p_tournament_id uuid)
returns public.tournament_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tournament public.tournaments;
  v_fit text;
  v_entry public.tournament_entries;
begin
  -- Locking the tournament serializes sign-ups: in a race for the last spot only one gets in.
  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null or not private.is_club_member(v_tournament.club_id) then
    perform private.fail('forbidden');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('book_slot:' || v_uid::text, 0));

  if v_tournament.status <> 'registration' or v_tournament.starts_at <= now() then
    perform private.fail('tournament_closed');
  end if;
  if exists (
    select 1 from public.tournament_entries
    where tournament_id = v_tournament.id and player_id = v_uid and removed_at is null
  ) then
    perform private.fail('already_in_tournament');
  end if;
  if private.active_entry_count(v_tournament.id) >= v_tournament.max_players then
    perform private.fail('tournament_full');
  end if;
  v_fit := private.tournament_fit(v_uid, v_tournament);
  if v_fit is not null then
    perform private.fail(v_fit);
  end if;
  if private.is_busy(v_uid, v_tournament.period) then
    perform private.fail('busy_at_that_time');
  end if;

  insert into public.tournament_entries (club_id, tournament_id, player_id, created_by)
  values (v_tournament.club_id, v_tournament.id, v_uid, v_uid)
  returning * into v_entry;
  return v_entry;
end;
$$;

-- Only while registration is open. Someone who already paid gets it back from the club (Cobros).
create function public.leave_tournament(p_tournament_id uuid)
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
  if v_tournament.status <> 'registration' then
    perform private.fail('tournament_closed');
  end if;
  return private.drop_entry(v_entry, 'Saliste del torneo');
end;
$$;

create function public.add_tournament_guest(p_tournament_id uuid, p_name text)
returns public.tournament_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament public.tournaments := private.staff_tournament(p_tournament_id);
  v_name text := trim(p_name);
  v_entry public.tournament_entries;
begin
  if v_name is null or length(v_name) not between 1 and 60 then
    perform private.fail('invalid_input');
  end if;
  if v_tournament.status not in ('registration', 'closed') then
    perform private.fail('invalid_state');
  end if;
  if private.active_entry_count(v_tournament.id) >= v_tournament.max_players then
    perform private.fail('tournament_full');
  end if;

  insert into public.tournament_entries (club_id, tournament_id, guest_name, created_by)
  values (v_tournament.club_id, v_tournament.id, v_name, (select auth.uid()))
  returning * into v_entry;
  return v_entry;
end;
$$;

-- Until it starts. A player who paid keeps the payment for a refund.
create function public.remove_tournament_entry(p_entry_id uuid)
returns public.tournament_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.tournament_entries;
  v_tournament public.tournaments;
begin
  select * into v_entry from public.tournament_entries where id = p_entry_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_tournament := private.staff_tournament(v_entry.tournament_id);
  if v_tournament.status not in ('registration', 'closed') then
    perform private.fail('invalid_state');
  end if;
  select * into v_entry from public.tournament_entries where id = p_entry_id for update;
  return private.drop_entry(v_entry, 'Salió del torneo');
end;
$$;

create function public.close_tournament_registration(p_tournament_id uuid)
returns public.tournaments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament public.tournaments := private.staff_tournament(p_tournament_id);
begin
  if v_tournament.status <> 'registration' then
    perform private.fail('invalid_state');
  end if;
  update public.tournaments set status = 'closed' where id = v_tournament.id returning * into v_tournament;
  return v_tournament;
end;
$$;

create function public.reopen_tournament_registration(p_tournament_id uuid)
returns public.tournaments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament public.tournaments := private.staff_tournament(p_tournament_id);
begin
  if v_tournament.status <> 'closed' then
    perform private.fail('invalid_state');
  end if;
  update public.tournaments set status = 'registration' where id = v_tournament.id returning * into v_tournament;
  return v_tournament;
end;
$$;

revoke all on function private.active_entry_count(uuid) from public;
revoke all on function private.tournament_fit(uuid, public.tournaments) from public;
revoke all on function private.drop_entry(public.tournament_entries, text) from public;
revoke all on function private.staff_tournament(uuid) from public;
revoke execute on function public.join_tournament(uuid) from public, anon;
revoke execute on function public.leave_tournament(uuid) from public, anon;
revoke execute on function public.add_tournament_guest(uuid, text) from public, anon;
revoke execute on function public.remove_tournament_entry(uuid) from public, anon;
revoke execute on function public.close_tournament_registration(uuid) from public, anon;
revoke execute on function public.reopen_tournament_registration(uuid) from public, anon;
grant execute on function public.join_tournament(uuid) to authenticated;
grant execute on function public.leave_tournament(uuid) to authenticated;
grant execute on function public.add_tournament_guest(uuid, text) to authenticated;
grant execute on function public.remove_tournament_entry(uuid) to authenticated;
grant execute on function public.close_tournament_registration(uuid) to authenticated;
grant execute on function public.reopen_tournament_registration(uuid) to authenticated;
