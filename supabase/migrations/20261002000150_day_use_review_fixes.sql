-- Fase 3b review fixes. A reward used takes the oldest stamps that earned it, so a stamp expiring
-- later no longer takes an unused reward away; a player cancels a pass only before its day use ends;
-- the daily job locks a product before generating its courts, like the admin functions do.

-- Stamps and rewards of a member (lib/domain/loyalty.ts mirrors it). Check-ins without a reward are
-- stamps; passes bought with a reward (not cancelled) use one, on the day they were bought. Going
-- through both in date order, a stamp drops once it is older than the expiry on that day, and each
-- use takes the loyalty_every oldest stamps left. What remains today makes the progress and the
-- rewards available. All zeros while the club has stamps off.
create or replace function private.loyalty_of(p_club_id uuid, p_user_id uuid)
returns table (stamps integer, earned integer, used integer, available integer, progress integer)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_club public.clubs;
  v_today date;
  v_stamps date[] := '{}';
  v_used integer := 0;
  v_event record;
  v_left integer;
begin
  select * into v_club from public.clubs where id = p_club_id;
  if not found or not v_club.loyalty_enabled then
    return query select 0, 0, 0, 0, 0;
    return;
  end if;
  v_today := private.club_today(v_club.id);

  for v_event in
    select p.on_date as day, 0 as kind
    from public.day_use_passes p
    where p.club_id = v_club.id and p.player_id = p_user_id and p.status = 'inside' and not p.used_reward
    union all
    select (p.created_at at time zone v_club.timezone)::date, 1
    from public.day_use_passes p
    where p.club_id = v_club.id and p.player_id = p_user_id and p.status <> 'cancelled' and p.used_reward
    order by 1, 2
  loop
    if v_club.loyalty_expiry_months is not null then
      v_stamps := array(
        select s from unnest(v_stamps) as s
        where s >= (v_event.day - make_interval(months => v_club.loyalty_expiry_months))::date
        order by s
      );
    end if;
    if v_event.kind = 0 then
      v_stamps := v_stamps || v_event.day;
    else
      v_stamps := coalesce(v_stamps[v_club.loyalty_every + 1:], '{}');
      if v_club.loyalty_expiry_months is null
         or v_event.day >= (v_today - make_interval(months => v_club.loyalty_expiry_months))::date then
        v_used := v_used + 1;
      end if;
    end if;
  end loop;

  if v_club.loyalty_expiry_months is not null then
    v_stamps := array(
      select s from unnest(v_stamps) as s
      where s >= (v_today - make_interval(months => v_club.loyalty_expiry_months))::date
      order by s
    );
  end if;
  v_left := cardinality(v_stamps);
  return query select v_left, v_left / v_club.loyalty_every + v_used, v_used, v_left / v_club.loyalty_every,
                      v_left % v_club.loyalty_every;
end;
$$;

create or replace function public.cancel_day_use(p_pass_id uuid)
returns public.day_use_passes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_pass public.day_use_passes;
  v_staff boolean;
begin
  select * into v_pass from public.day_use_passes where id = p_pass_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_staff := private.is_staff(v_pass.club_id);
  if not v_staff and (v_uid is null or v_pass.player_id is distinct from v_uid) then
    perform private.fail('forbidden');
  end if;

  -- Payments before the pass, the same order as confirm_payment.
  perform 1 from public.payments where day_use_pass_id = v_pass.id and status = 'reported' for update;
  select * into v_pass from public.day_use_passes where id = p_pass_id for update;
  if v_pass.status = 'inside' then
    perform private.fail('already_checked_in');
  end if;
  if v_pass.status = 'cancelled' then
    perform private.fail('invalid_state');
  end if;
  -- A player cancels only before the day use of the pass ends; reception can after (a no-show).
  if not v_staff and upper(private.day_use_period(
       (select pr from public.day_use_products pr where pr.id = v_pass.product_id), v_pass.on_date)) <= now() then
    perform private.fail('in_the_past');
  end if;

  update public.day_use_passes set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid
   where id = v_pass.id
  returning * into v_pass;
  update public.payments
     set status = 'rejected', rejection_reason = 'Pase cancelado', confirmed_by = v_uid, confirmed_at = now()
   where day_use_pass_id = v_pass.id and status = 'reported';
  return v_pass;
end;
$$;

create or replace function private.extend_all_day_use()
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
        -- The product first, like save_day_use_product and set_day_use_override.
        select * into v_product from public.day_use_products where id = v_product.id for update;
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
