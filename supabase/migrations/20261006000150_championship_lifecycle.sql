-- Campeonatos, part 4: the life of a championship until the draw. Opening registration blocks the courts of
-- its days of play; closing it stops sign-ups; cancelling frees the courts, rejects reported transfers and
-- leaves confirmed payments to give back. A category with too few pairs is merged into another or cancelled.

create function public.open_championship_registration(p_championship_id uuid)
returns public.championships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
  v_club public.clubs;
  v_starts timestamptz;
  v_closes timestamptz;
  v_window public.championship_windows;
  v_court_id uuid;
begin
  if v_championship.status <> 'draft' then
    perform private.fail('invalid_state');
  end if;
  if not exists (select 1 from public.championship_windows where championship_id = v_championship.id)
     or not exists (
       select 1 from public.championship_categories where championship_id = v_championship.id and status = 'open'
     ) then
    perform private.fail('championship_incomplete');
  end if;
  select * into v_club from public.clubs where id = v_championship.club_id;
  v_starts := private.championship_starts_at(v_championship.id);
  if v_starts <= now() then
    perform private.fail('in_the_past');
  end if;
  v_closes := coalesce(v_championship.registration_closes_at, v_starts - interval '24 hours');
  if v_closes > v_starts then
    perform private.fail('invalid_input');
  end if;
  if v_closes <= now() then
    perform private.fail('in_the_past');
  end if;

  -- The exclusion constraint has the last word on double booking.
  for v_window in
    select * from public.championship_windows where championship_id = v_championship.id order by on_date, from_time
  loop
    foreach v_court_id in array v_window.court_ids loop
      begin
        insert into public.court_occupancy (club_id, court_id, kind, period, note, championship_id, created_by)
        values (v_championship.club_id, v_court_id, 'championship', private.window_period(v_window, v_club.timezone),
                left(v_championship.name, 80), v_championship.id, (select auth.uid()));
      exception when exclusion_violation then
        perform private.fail('courts_busy');
      end;
    end loop;
  end loop;

  update public.championships
     set status = 'registration', registration_opens_at = now(), registration_closes_at = v_closes
   where id = v_championship.id
  returning * into v_championship;
  return v_championship;
end;
$$;

create function public.close_championship_registration(p_championship_id uuid)
returns public.championships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
begin
  if v_championship.status <> 'registration' then
    perform private.fail('invalid_state');
  end if;
  update public.championships set status = 'closed' where id = v_championship.id returning * into v_championship;
  return v_championship;
end;
$$;

-- Any time before it finished. Pairs keep their status; Cobros lists their confirmed payments to give back.
create function public.cancel_championship(p_championship_id uuid)
returns public.championships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
  v_entry public.championship_entries;
begin
  if v_championship.status in ('finished', 'cancelled') then
    perform private.fail('invalid_state');
  end if;

  delete from public.court_occupancy where championship_id = v_championship.id;
  update public.payments
     set status = 'rejected', rejection_reason = 'Campeonato cancelado',
         confirmed_by = (select auth.uid()), confirmed_at = now()
   where status = 'reported'
     and championship_entry_id in (
       select e.id from public.championship_entries e
       join public.championship_categories c on c.id = e.category_id
       where c.championship_id = v_championship.id
     );
  for v_entry in
    select e.* from public.championship_entries e
    join public.championship_categories c on c.id = e.category_id
    where c.championship_id = v_championship.id and e.status in ('active', 'waiting')
  loop
    perform private.notify_championship_entry(v_entry, 'championship_cancelled', null, true);
  end loop;

  update public.championships set status = 'cancelled', cancelled_at = now()
   where id = v_championship.id
  returning * into v_championship;
  return v_championship;
end;
$$;

-- Moves the pairs of a category into another one of the championship (with a place first, then the line,
-- each in its order): with a place while there is room, waiting after that. A pair with someone already in
-- the other category is taken out (its payments to give back).
create function public.merge_championship_category(p_category_id uuid, p_into_id uuid)
returns public.championship_categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.championship_categories;
  v_into public.championship_categories;
  v_championship public.championships;
  v_entry public.championship_entries;
begin
  select * into v_from from public.championship_categories where id = p_category_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.staff_championship(v_from.championship_id);
  if v_championship.status not in ('registration', 'closed') then
    perform private.fail('invalid_state');
  end if;
  select * into v_from from public.championship_categories where id = p_category_id;
  select * into v_into from public.championship_categories
   where id = p_into_id and championship_id = v_championship.id;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_from.status <> 'open' or v_into.status <> 'open' or v_into.id = v_from.id then
    perform private.fail('invalid_state');
  end if;

  for v_entry in
    select * from public.championship_entries
    where category_id = v_from.id and status in ('active', 'waiting')
    order by (status = 'waiting'), created_at, id
  loop
    if private.in_category(v_into.id, v_entry.player1_id, v_entry.player2_id) then
      v_entry := private.end_championship_entry(v_entry.id, 'removed', 'Categoría fusionada');
      perform private.notify_championship_entry(v_entry, 'championship_cancelled', null);
    else
      perform private.move_entry(v_entry.id, v_into);
    end if;
  end loop;

  update public.championship_categories set status = 'merged', merged_into = v_into.id
   where id = v_from.id
  returning * into v_from;
  return v_from;
end;
$$;

-- Its pairs are taken out (payments to give back) with an aviso.
create function public.cancel_championship_category(p_category_id uuid)
returns public.championship_categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category public.championship_categories;
  v_championship public.championships;
  v_entry public.championship_entries;
begin
  select * into v_category from public.championship_categories where id = p_category_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.staff_championship(v_category.championship_id);
  select * into v_category from public.championship_categories where id = p_category_id;
  if v_championship.status not in ('registration', 'closed') or v_category.status <> 'open' then
    perform private.fail('invalid_state');
  end if;

  for v_entry in
    select * from public.championship_entries
    where category_id = v_category.id and status in ('active', 'waiting')
    order by created_at, id
  loop
    v_entry := private.end_championship_entry(v_entry.id, 'removed', 'Categoría cancelada');
    perform private.notify_championship_entry(v_entry, 'championship_cancelled', null);
  end loop;

  update public.championship_categories set status = 'cancelled' where id = v_category.id returning * into v_category;
  return v_category;
end;
$$;

revoke execute on function public.open_championship_registration(uuid) from public, anon;
revoke execute on function public.close_championship_registration(uuid) from public, anon;
revoke execute on function public.cancel_championship(uuid) from public, anon;
revoke execute on function public.merge_championship_category(uuid, uuid) from public, anon;
revoke execute on function public.cancel_championship_category(uuid) from public, anon;
grant execute on function public.open_championship_registration(uuid) to authenticated;
grant execute on function public.close_championship_registration(uuid) to authenticated;
grant execute on function public.cancel_championship(uuid) to authenticated;
grant execute on function public.merge_championship_category(uuid, uuid) to authenticated;
grant execute on function public.cancel_championship_category(uuid) to authenticated;
