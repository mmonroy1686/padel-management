-- Campeonatos, día del torneo, part 4: publishing. Every match has a court and a start and the hard rules hold;
-- the championship gets its public link, each pair hears the fixture is out, and the organizer may give back to
-- the grid what the matches do not use.

-- A short, readable code for the public link: the name in lower case without accents (up to 24 characters), a
-- dash and 4 random ones ("campeonato-de-primavera-7k2f").
create function private.championship_code(p_name text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_base text;
  v_code text;
begin
  v_base := regexp_replace(translate(lower(p_name), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '-', 'g');
  v_base := trim(both '-' from left(trim(both '-' from v_base), 24));
  if v_base = '' then
    v_base := 'campeonato';
  end if;
  loop
    v_code := v_base || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
    exit when not exists (select 1 from public.championships where public_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- Each occupancy of the championship becomes the club's grid slots of that court that have a match. The
-- waitlist (court_occupancy_offer_freed) offers the rest when the transaction commits. Returns the slots kept.
create function private.release_free_windows(p_championship_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_occupancy public.court_occupancy;
  v_timezone text;
  v_slot tstzrange;
  v_kept integer := 0;
begin
  select c.timezone into v_timezone
  from public.championships ch join public.clubs c on c.id = ch.club_id
  where ch.id = p_championship_id;
  for v_occupancy in
    select * from public.court_occupancy where championship_id = p_championship_id order by period
  loop
    delete from public.court_occupancy where id = v_occupancy.id;
    for v_slot in
      select s.period
      from generate_series((lower(v_occupancy.period) at time zone v_timezone)::date,
                           (upper(v_occupancy.period) at time zone v_timezone)::date, interval '1 day') as d (day)
      cross join lateral private.day_slots(v_occupancy.club_id, d.day::date) as s (period)
      where s.period && v_occupancy.period
      order by s.period
    loop
      if exists (
        select 1 from public.championship_matches m
        where m.championship_id = p_championship_id and m.court_id = v_occupancy.court_id
          and tstzrange(m.starts_at, m.ends_at) && v_slot
      ) then
        insert into public.court_occupancy (club_id, court_id, kind, period, note, championship_id, created_by)
        values (v_occupancy.club_id, v_occupancy.court_id, 'championship', v_slot * v_occupancy.period,
                v_occupancy.note, p_championship_id, v_occupancy.created_by);
        v_kept := v_kept + 1;
      end if;
    end loop;
  end loop;
  return v_kept;
end;
$$;

-- "Publicar": drawn, every match placed and the hard rules kept. The fixture becomes visible to members and on
-- the public page; each member of a pair with a place gets the aviso 'championship_fixture'.
create function public.publish_championship(p_championship_id uuid, p_release_free boolean default false)
returns public.championships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
  v_problem text;
  v_entry public.championship_entries;
begin
  if v_championship.status <> 'drawn' then
    perform private.fail('invalid_state');
  end if;
  if not exists (select 1 from public.championship_matches where championship_id = v_championship.id)
     or exists (select 1 from public.championship_matches
                where championship_id = v_championship.id and court_id is null) then
    perform private.fail('schedule_incomplete');
  end if;
  v_problem := private.schedule_problem(v_championship.id);
  if v_problem is not null then
    perform private.fail(v_problem);
  end if;
  if coalesce(p_release_free, false) then
    perform private.release_free_windows(v_championship.id);
  end if;

  update public.championships
     set status = 'published', public_code = coalesce(public_code, private.championship_code(name))
   where id = v_championship.id
  returning * into v_championship;
  for v_entry in
    select e.* from public.championship_entries e
    join public.championship_categories c on c.id = e.category_id
    where c.championship_id = v_championship.id and c.status = 'open' and e.status = 'active'
    order by c.sort_order, e.created_at, e.id
  loop
    perform private.notify_championship_entry(v_entry, 'championship_fixture', null);
  end loop;
  return v_championship;
end;
$$;

revoke all on function private.championship_code(text) from public;
revoke all on function private.release_free_windows(uuid) from public;
revoke execute on function public.publish_championship(uuid, boolean) from public, anon;
grant execute on function public.publish_championship(uuid, boolean) to authenticated;
