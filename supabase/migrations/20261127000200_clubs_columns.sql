-- Corte A of the 24/11 audit (docs/handoff/2026-11-24-auditoria.md): what a club admin may change in clubs.
--
-- 20260928000300 granted update on the whole table, so an admin could move the club to another slug (reserved,
-- `www`, someone's links), set a timezone the booking functions cannot read, or reopen the setup. Now the API only
-- updates the columns Ajustes writes directly (app/(club)/club/ajustes/actions.ts). Everything else changes through
-- security definer functions: the brand (save_club_brand), the setup (finish_club_setup), the slug (rename_club,
-- platform admins only), and id, created_at and timezone never.
--
-- A new clubs column the admin edits straight from the table needs its own grant here: without it Ajustes gets
-- "permission denied" (README, «Cómo trabajamos»).
revoke update on public.clubs from authenticated;
grant update (
  name,
  phone,
  opens_at,
  closes_at,
  slot_minutes,
  booking_window_days,
  cancellation_notice_hours,
  max_active_bookings,
  match_close_minutes,
  accepts_cash,
  accepts_transfer,
  accepts_card,
  transfer_receipt_required,
  transfer_details,
  loyalty_enabled,
  loyalty_every,
  loyalty_discount_percent,
  loyalty_expiry_months,
  logo_path,
  flyer_background_path
) on public.clubs to authenticated;

-- Before closing the door, nothing already got through it: stop here if a club has an unknown timezone or a reserved
-- slug, so it gets fixed by hand instead of staying broken.
do $$
begin
  if exists (select 1 from public.clubs c
              where not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = c.timezone)
                 or c.slug = any (array['www', 'app', 'api', 'plataforma', 'admin', 'mail', 'static', 'assets', 'staging', 'status'])) then
    raise exception 'a club has an unknown timezone or a reserved slug: fix it before this migration';
  end if;
end;
$$;

-- A timezone Postgres knows, whoever writes it (the service role and superusers too). A trigger, not a check: a check
-- may only call immutable functions, and the timezone list can change with a server update. The trigger checks each
-- write; an immutable check would make a restore fail if a zone name were removed.
create function private.check_club_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    perform private.fail('invalid_timezone');
  end if;
  return new;
end;
$$;

revoke all on function private.check_club_timezone() from public;

create trigger clubs_timezone_known
  before insert or update of timezone on public.clubs
  for each row execute function private.check_club_timezone();

-- /plataforma → "Cambiar dirección": the club moves to another subdomain. Old links, invitations and installed apps
-- stop working, which the page says before asking. Same rules as a new club's slug (private.checked_slug).
create function public.rename_club(p_club_id uuid, p_slug text)
returns public.clubs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club public.clubs;
  v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  if not private.is_platform_admin() then
    perform private.fail('forbidden');
  end if;
  select * into v_club from public.clubs where id = p_club_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_club.slug = v_slug then
    return v_club;
  end if;
  v_slug := private.checked_slug(v_slug);
  begin
    update public.clubs set slug = v_slug where id = p_club_id returning * into v_club;
  exception when unique_violation then
    -- Another club took it at the same time.
    perform private.fail('slug_taken');
  end;
  return v_club;
end;
$$;

revoke execute on function public.rename_club(uuid, text) from public, anon;
grant execute on function public.rename_club(uuid, text) to authenticated;
