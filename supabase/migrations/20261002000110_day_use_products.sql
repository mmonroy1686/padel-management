-- Day use, part 1: the passes the club offers. Each one blocks its courts on the days it runs,
-- generated up to the club's booking window and extended by a daily pg_cron job, like recurring
-- slots. A court already taken at that time is skipped (the configuration screen lists them), and
-- the exclusion constraint has the last word. Only admins configure passes.

-- Up to where occupancies are generated: as far as players can book.
create function private.day_use_horizon(p_club_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select private.club_today(c.id) + c.booking_window_days from public.clubs c where c.id = p_club_id;
$$;

-- Whether the product runs on that date: an override decides; otherwise its weekdays.
-- lib/domain/day-use.ts isOpenOn mirrors it.
create function private.day_use_open_on(p_product public.day_use_products, p_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_product.is_active and coalesce(
    (select o.enabled from public.day_use_overrides o where o.product_id = p_product.id and o.on_date = p_date),
    extract(dow from p_date)::smallint = any (p_product.weekdays)
  );
$$;

-- The product's hours on that date, on the club's clock.
create function private.day_use_period(p_product public.day_use_products, p_date date)
returns tstzrange
language sql
stable
set search_path = ''
as $$
  select tstzrange((p_date + p_product.from_time) at time zone c.timezone,
                   (p_date + p_product.to_time) at time zone c.timezone)
  from public.clubs c where c.id = p_product.club_id;
$$;

-- Blocks the product's courts from p_from to p_until (inclusive) on the dates it runs that have not
-- started yet. Returns how many court-dates it had to skip (court taken or inactive). It does not
-- move generated_until: callers do.
create function private.generate_day_use(p_product public.day_use_products, p_from date, p_until date)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_date date := p_from;
  v_period tstzrange;
  v_court_id uuid;
  v_skipped integer := 0;
begin
  while v_date <= p_until loop
    if private.day_use_open_on(p_product, v_date) then
      v_period := private.day_use_period(p_product, v_date);
      if lower(v_period) > now() then
        foreach v_court_id in array p_product.court_ids loop
          if not exists (
            select 1 from public.courts c where c.id = v_court_id and c.club_id = p_product.club_id and c.is_active
          ) then
            v_skipped := v_skipped + 1;
          elsif not exists (
            select 1 from public.court_occupancy o
            where o.day_use_product_id = p_product.id and o.court_id = v_court_id and o.period = v_period
          ) then
            begin
              insert into public.court_occupancy (club_id, court_id, kind, period, note, day_use_product_id, created_by)
              values (p_product.club_id, v_court_id, 'day_use', v_period, p_product.name, p_product.id,
                      (select auth.uid()));
            exception when exclusion_violation then
              v_skipped := v_skipped + 1;
            end;
          end if;
        end loop;
      end if;
    end if;
    v_date := v_date + 1;
  end loop;
  return v_skipped;
end;
$$;

-- Frees what has not started yet and blocks it again from today to the horizon, with the product
-- as it is now (an inactive one blocks nothing). Returns how many court-dates were skipped.
create function private.regenerate_day_use(p_product public.day_use_products)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_until date := private.day_use_horizon(p_product.club_id);
  v_skipped integer;
begin
  delete from public.court_occupancy where day_use_product_id = p_product.id and starts_at > now();
  v_skipped := private.generate_day_use(p_product, private.club_today(p_product.club_id), v_until);
  update public.day_use_products set generated_until = v_until where id = p_product.id;
  return v_skipped;
end;
$$;

-- Creates (p_product_id null) or edits a pass. Passes already sold keep their price and date; only
-- the courts follow the new rule.
create function public.save_day_use_product(
  p_club_id uuid,
  p_name text,
  p_price integer,
  p_includes text[],
  p_weekdays integer[],
  p_from_time time,
  p_to_time time,
  p_capacity integer,
  p_court_ids uuid[],
  p_sort_order integer default 0,
  p_product_id uuid default null
)
returns table (saved_id uuid, skipped_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(p_name);
  v_includes text[];
  v_weekdays smallint[];
  v_courts uuid[] := coalesce(p_court_ids, '{}');
  v_product public.day_use_products;
begin
  if p_club_id is null or not private.has_club_role(p_club_id, array['admin']::public.club_role[]) then
    perform private.fail('forbidden');
  end if;
  if p_product_id is not null then
    select * into v_product from public.day_use_products
     where id = p_product_id and club_id = p_club_id
       for update;
    if not found then
      perform private.fail('not_found');
    end if;
  end if;

  select coalesce(array_agg(trim(u.item) order by u.n), '{}') into v_includes
  from unnest(coalesce(p_includes, '{}')) with ordinality as u (item, n)
  where trim(u.item) <> '';
  select coalesce(array_agg(distinct u.wd order by u.wd), '{}')::smallint[] into v_weekdays
  from unnest(coalesce(p_weekdays, '{}')) as u (wd);

  if v_name is null or length(v_name) not between 1 and 60
     or p_price is null or p_price not between 0 and 10000000
     or cardinality(v_includes) > 8
     or exists (select 1 from unnest(v_includes) as u (item) where length(u.item) > 40)
     or exists (select 1 from unnest(coalesce(p_weekdays, '{}')) as u (wd) where u.wd is null or u.wd not between 0 and 6)
     or p_from_time is null or p_to_time is null or p_from_time >= p_to_time
     or p_capacity is null or p_capacity not between 1 and 500
     or coalesce(p_sort_order, 0) not between 0 and 100
     or array_position(v_courts, null) is not null
     or (select count(distinct u.court_id) from unnest(v_courts) as u (court_id)) <> cardinality(v_courts)
     or exists (
       select 1 from unnest(v_courts) as u (court_id)
       where not exists (
         select 1 from public.courts c where c.id = u.court_id and c.club_id = p_club_id and c.is_active
       )
     ) then
    perform private.fail('invalid_input');
  end if;

  if p_product_id is null then
    insert into public.day_use_products (club_id, name, price, includes, weekdays, from_time, to_time, capacity,
                                         court_ids, sort_order, created_by)
    values (p_club_id, v_name, p_price, v_includes, v_weekdays, p_from_time, p_to_time, p_capacity, v_courts,
            coalesce(p_sort_order, 0), (select auth.uid()))
    returning * into v_product;
  else
    update public.day_use_products
       set name = v_name, price = p_price, includes = v_includes, weekdays = v_weekdays, from_time = p_from_time,
           to_time = p_to_time, capacity = p_capacity, court_ids = v_courts, sort_order = coalesce(p_sort_order, 0)
     where id = v_product.id
    returning * into v_product;
  end if;

  return query select v_product.id, private.regenerate_day_use(v_product);
end;
$$;

-- Deactivating stops sales and frees the courts from now on; passes already sold stay valid.
-- Activating blocks them again. Returns how many court-dates were skipped.
create function public.set_day_use_product_active(p_product_id uuid, p_active boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.day_use_products;
begin
  select * into v_product from public.day_use_products where id = p_product_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.has_club_role(v_product.club_id, array['admin']::public.club_role[]) then
    perform private.fail('forbidden');
  end if;
  if p_active is null then
    perform private.fail('invalid_input');
  end if;
  update public.day_use_products set is_active = p_active where id = v_product.id returning * into v_product;
  return private.regenerate_day_use(v_product);
end;
$$;

-- Opens or closes one date. An exception equal to the weekly rule is removed. Passes already sold
-- for that date stay (reception cancels them if needed). Returns how many courts were skipped.
create function public.set_day_use_override(p_product_id uuid, p_date date, p_enabled boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.day_use_products;
  v_timezone text;
  v_skipped integer := 0;
begin
  select * into v_product from public.day_use_products where id = p_product_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.has_club_role(v_product.club_id, array['admin']::public.club_role[]) then
    perform private.fail('forbidden');
  end if;
  if p_date is null or p_enabled is null then
    perform private.fail('invalid_input');
  end if;
  if p_date < private.club_today(v_product.club_id) then
    perform private.fail('in_the_past');
  end if;

  if p_enabled = (extract(dow from p_date)::smallint = any (v_product.weekdays)) then
    delete from public.day_use_overrides where product_id = v_product.id and on_date = p_date;
  else
    insert into public.day_use_overrides (club_id, product_id, on_date, enabled, created_by)
    values (v_product.club_id, v_product.id, p_date, p_enabled, (select auth.uid()))
    on conflict (product_id, on_date) do update set enabled = excluded.enabled, created_by = excluded.created_by;
  end if;

  select timezone into v_timezone from public.clubs where id = v_product.club_id;
  delete from public.court_occupancy
   where day_use_product_id = v_product.id
     and starts_at > now()
     and starts_at >= p_date::timestamp at time zone v_timezone
     and starts_at < (p_date + 1)::timestamp at time zone v_timezone;
  if p_date <= private.day_use_horizon(v_product.club_id) then
    v_skipped := private.generate_day_use(v_product, p_date, p_date);
  end if;
  return v_skipped;
end;
$$;

-- Keeps every active pass blocked up to its horizon. One failing pass does not stop the others.
-- Returns how many passes it extended.
create function private.extend_all_day_use()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_product public.day_use_products;
  v_today date;
  v_until date;
  v_count integer := 0;
begin
  for v_product in select * from public.day_use_products where is_active loop
    v_today := private.club_today(v_product.club_id);
    v_until := private.day_use_horizon(v_product.club_id);
    if v_product.generated_until is null or v_product.generated_until < v_until then
      begin
        perform private.generate_day_use(v_product, greatest(coalesce(v_product.generated_until + 1, v_today), v_today),
                                         v_until);
        update public.day_use_products set generated_until = v_until where id = v_product.id;
        v_count := v_count + 1;
      exception when others then
        raise warning 'extend_all_day_use: product % failed: %', v_product.id, sqlerrm;
      end;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.day_use_horizon(uuid) from public;
revoke all on function private.day_use_open_on(public.day_use_products, date) from public;
revoke all on function private.day_use_period(public.day_use_products, date) from public;
revoke all on function private.generate_day_use(public.day_use_products, date, date) from public;
revoke all on function private.regenerate_day_use(public.day_use_products) from public;
revoke all on function private.extend_all_day_use() from public;
revoke execute on function public.save_day_use_product(uuid, text, integer, text[], integer[], time, time, integer,
  uuid[], integer, uuid) from public, anon;
revoke execute on function public.set_day_use_product_active(uuid, boolean) from public, anon;
revoke execute on function public.set_day_use_override(uuid, date, boolean) from public, anon;
grant execute on function public.save_day_use_product(uuid, text, integer, text[], integer[], time, time, integer,
  uuid[], integer, uuid) to authenticated;
grant execute on function public.set_day_use_product_active(uuid, boolean) to authenticated;
grant execute on function public.set_day_use_override(uuid, date, boolean) to authenticated;

-- Every day at 07:10 UTC (04:10 in Montevideo), after the recurring slots.
select cron.schedule('extend-day-use', '10 7 * * *', 'select private.extend_all_day_use()');
