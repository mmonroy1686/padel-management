-- Day use, part 2: buying, selling, checking in and cancelling passes, the stamps, who is in and how
-- many passes are sold. Sales of a product are serialized by locking it: in a race for the last spot
-- only one gets in; using a reward takes a per-player lock too.

-- Stamps and rewards of a member (lib/domain/loyalty.ts mirrors it). A stamp is a check-in without a
-- reward inside the expiry window; every loyalty_every stamps earn a reward, and every pass bought
-- with one (not cancelled) in the same window uses it. All zeros while the club has stamps off.
create function private.loyalty_of(p_club_id uuid, p_user_id uuid)
returns table (stamps integer, earned integer, used integer, available integer, progress integer)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_club public.clubs;
  v_since date := '-infinity';
  v_stamps integer;
  v_used integer;
begin
  select * into v_club from public.clubs where id = p_club_id;
  if not found or not v_club.loyalty_enabled then
    return query select 0, 0, 0, 0, 0;
    return;
  end if;
  if v_club.loyalty_expiry_months is not null then
    v_since := (private.club_today(v_club.id) - make_interval(months => v_club.loyalty_expiry_months))::date;
  end if;

  select count(*) filter (where p.status = 'inside' and not p.used_reward)::integer,
         count(*) filter (where p.status <> 'cancelled' and p.used_reward)::integer
    into v_stamps, v_used
  from public.day_use_passes p
  where p.club_id = v_club.id and p.player_id = p_user_id and p.on_date >= v_since;

  return query select v_stamps, v_stamps / v_club.loyalty_every, v_used,
                      greatest(v_stamps / v_club.loyalty_every - v_used, 0), v_stamps % v_club.loyalty_every;
end;
$$;

-- DU- and six random digits, unused in the club. The unique constraint has the last word if two
-- sales pick the same one at the same time.
create function private.new_day_use_code(p_club_id uuid)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_code text;
begin
  loop
    v_code := 'DU-' || lpad(floor(random() * 1000000)::integer::text, 6, '0');
    exit when not exists (select 1 from public.day_use_passes where club_id = p_club_id and code = v_code);
  end loop;
  return v_code;
end;
$$;

-- The rules of a sale, online or at reception (lib/domain/day-use.ts buyStatus mirrors the order).
-- Callers lock the product and check who may sell.
create function private.sell_pass(
  p_product public.day_use_products,
  p_date date,
  p_player_id uuid,
  p_guest_name text,
  p_use_reward boolean,
  p_source public.booking_source
)
returns public.day_use_passes
language plpgsql
set search_path = ''
as $$
declare
  v_club public.clubs;
  v_today date;
  v_discount integer := 0;
  v_pass public.day_use_passes;
begin
  select * into v_club from public.clubs where id = p_product.club_id;
  v_today := private.club_today(v_club.id);
  if p_date is null or p_use_reward is null then
    perform private.fail('invalid_input');
  end if;
  if p_date < v_today then
    perform private.fail('in_the_past');
  end if;
  if p_date > v_today + v_club.booking_window_days then
    perform private.fail('outside_window');
  end if;
  if not private.day_use_open_on(p_product, p_date) then
    perform private.fail('day_use_closed');
  end if;
  if upper(private.day_use_period(p_product, p_date)) <= now() then
    perform private.fail('in_the_past');
  end if;
  if p_player_id is not null and exists (
    select 1 from public.day_use_passes
    where product_id = p_product.id and on_date = p_date and player_id = p_player_id and status <> 'cancelled'
  ) then
    perform private.fail('already_has_pass');
  end if;
  if (select count(*) from public.day_use_passes
      where product_id = p_product.id and on_date = p_date and status <> 'cancelled') >= p_product.capacity then
    perform private.fail('day_use_full');
  end if;

  if p_use_reward then
    if p_player_id is null then
      perform private.fail('invalid_input');
    end if;
    -- Two sales with the same reward, even of different passes, cannot both slip in.
    perform pg_advisory_xact_lock(hashtextextended('day_use_reward:' || p_player_id::text, 0));
    if (select l.available from private.loyalty_of(v_club.id, p_player_id) l) < 1 then
      perform private.fail('no_reward');
    end if;
    v_discount := v_club.loyalty_discount_percent;
  end if;

  insert into public.day_use_passes (club_id, product_id, on_date, player_id, guest_name, price, discount_percent,
                                     used_reward, code, source, created_by)
  values (v_club.id, p_product.id, p_date, p_player_id, p_guest_name, p_product.price, v_discount, p_use_reward,
          private.new_day_use_code(v_club.id), p_source, (select auth.uid()))
  returning * into v_pass;
  return v_pass;
end;
$$;

create function public.buy_day_use(p_product_id uuid, p_date date, p_use_reward boolean default false)
returns public.day_use_passes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_product public.day_use_products;
begin
  select * into v_product from public.day_use_products where id = p_product_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null or not private.is_club_member(v_product.club_id) then
    perform private.fail('forbidden');
  end if;
  return private.sell_pass(v_product, p_date, v_uid, null, coalesce(p_use_reward, false), 'online');
end;
$$;

-- Reception sells to a member (who may use her reward) or to a name.
create function public.sell_day_use(
  p_product_id uuid,
  p_date date,
  p_player_id uuid default null,
  p_guest_name text default null,
  p_use_reward boolean default false
)
returns public.day_use_passes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.day_use_products;
  v_guest text := nullif(trim(p_guest_name), '');
begin
  select * into v_product from public.day_use_products where id = p_product_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_product.club_id) then
    perform private.fail('forbidden');
  end if;
  if num_nonnulls(p_player_id, v_guest) <> 1 or length(v_guest) > 60 then
    perform private.fail('invalid_input');
  end if;
  if p_player_id is not null and not exists (
    select 1 from public.club_members where club_id = v_product.club_id and user_id = p_player_id
  ) then
    perform private.fail('invalid_input');
  end if;
  return private.sell_pass(v_product, p_date, p_player_id, v_guest, coalesce(p_use_reward, false), 'reception');
end;
$$;

-- The player cancels her own pass of today or a coming day; reception, any pass not checked in.
-- The spot is free again, a reward comes back (a cancelled pass does not use it), a reported
-- transfer is rejected and confirmed payments stay so Cobros lists them to refund.
create function public.cancel_day_use(p_pass_id uuid)
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

  -- Payments before the pass, the same order as confirm_payment, so the two cannot deadlock.
  perform 1 from public.payments where day_use_pass_id = v_pass.id and status = 'reported' for update;
  select * into v_pass from public.day_use_passes where id = p_pass_id for update;
  if v_pass.status = 'inside' then
    perform private.fail('already_checked_in');
  end if;
  if v_pass.status = 'cancelled' then
    perform private.fail('invalid_state');
  end if;
  if not v_staff and v_pass.on_date < private.club_today(v_pass.club_id) then
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

-- Reception registers the entrance: on the day of the pass, once. Paying is not required (Cobros
-- lists what is owed). Every check-in without a reward is a stamp.
create function public.check_in_day_use(p_pass_id uuid)
returns public.day_use_passes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass public.day_use_passes;
begin
  select * into v_pass from public.day_use_passes where id = p_pass_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_pass.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_pass.status = 'cancelled' then
    perform private.fail('invalid_state');
  end if;
  if v_pass.status = 'inside' then
    perform private.fail('already_checked_in');
  end if;
  if v_pass.on_date <> private.club_today(v_pass.club_id) then
    perform private.fail('not_today');
  end if;

  update public.day_use_passes set status = 'inside', checked_in_at = now(), checked_in_by = (select auth.uid())
   where id = v_pass.id
  returning * into v_pass;
  return v_pass;
end;
$$;

-- "Ya están en el club": name and pass of who checked in that day. Players see members who did not
-- hide; staff see everyone, guests included.
create function public.day_use_inside(p_club_id uuid, p_date date)
returns table (name text, product_name text, checked_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff boolean;
begin
  if not private.is_club_member(p_club_id) then
    perform private.fail('forbidden');
  end if;
  v_staff := private.is_staff(p_club_id);
  return query
    select coalesce(pr.display_name, p.guest_name), d.name, p.checked_in_at
    from public.day_use_passes p
    join public.day_use_products d on d.id = p.product_id
    left join public.profiles pr on pr.id = p.player_id
    where p.club_id = p_club_id and p.on_date = p_date and p.status = 'inside'
      and (v_staff or (p.player_id is not null and pr.show_in_club))
    order by p.checked_in_at;
end;
$$;

-- How many passes are sold (not cancelled) and in, per pass and day: the capacity bars and "Hoy: N en
-- el club". Only totals, never who. At most a month at a time.
create function public.day_use_sold(p_club_id uuid, p_from date, p_to date)
returns table (product_id uuid, on_date date, sold integer, inside integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_club_member(p_club_id) then
    perform private.fail('forbidden');
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 31 then
    perform private.fail('invalid_input');
  end if;
  return query
    select p.product_id, p.on_date, count(*)::integer, (count(*) filter (where p.status = 'inside'))::integer
    from public.day_use_passes p
    where p.club_id = p_club_id and p.on_date between p_from and p_to and p.status <> 'cancelled'
    group by p.product_id, p.on_date;
end;
$$;

create function public.set_show_in_club(p_show boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    perform private.fail('forbidden');
  end if;
  if p_show is null then
    perform private.fail('invalid_input');
  end if;
  update public.profiles set show_in_club = p_show where id = (select auth.uid());
end;
$$;

revoke all on function private.loyalty_of(uuid, uuid) from public;
revoke all on function private.new_day_use_code(uuid) from public;
revoke all on function private.sell_pass(public.day_use_products, date, uuid, text, boolean, public.booking_source)
  from public;
revoke execute on function public.buy_day_use(uuid, date, boolean) from public, anon;
revoke execute on function public.sell_day_use(uuid, date, uuid, text, boolean) from public, anon;
revoke execute on function public.cancel_day_use(uuid) from public, anon;
revoke execute on function public.check_in_day_use(uuid) from public, anon;
revoke execute on function public.day_use_inside(uuid, date) from public, anon;
revoke execute on function public.day_use_sold(uuid, date, date) from public, anon;
revoke execute on function public.set_show_in_club(boolean) from public, anon;
grant execute on function public.buy_day_use(uuid, date, boolean) to authenticated;
grant execute on function public.sell_day_use(uuid, date, uuid, text, boolean) to authenticated;
grant execute on function public.cancel_day_use(uuid) to authenticated;
grant execute on function public.check_in_day_use(uuid) to authenticated;
grant execute on function public.day_use_inside(uuid, date) to authenticated;
grant execute on function public.day_use_sold(uuid, date, date) to authenticated;
grant execute on function public.set_show_in_club(boolean) to authenticated;
