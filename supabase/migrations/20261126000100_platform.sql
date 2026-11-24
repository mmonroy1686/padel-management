-- The platform (design: docs/features/alta-de-club/design.md).
--
-- A platform admin (platform_admins, not a club role) creates clubs from /plataforma: create_club makes the club with
-- its defaults and the corte 2 invitation of its first admin. That admin's first visit to the panel opens the setup
-- assistant until finish_club_setup; clubs that existed before are already set up.

create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Nobody reads or writes it through the API: only the functions below look at it. The first one is inserted by SQL.
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from public, anon, authenticated;

create function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

-- /plataforma asks this to show the panel or a 404.
create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin();
$$;

alter table public.clubs add column setup_completed_at timestamptz;
update public.clubs set setup_completed_at = created_at;

-- The slug of a new club: the subdomain's shape (lib/club/host.ts), not reserved, not used.
create function private.checked_slug(p_slug text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  if length(v_slug) not between 2 and 40 or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    perform private.fail('invalid_slug');
  end if;
  if v_slug = any (array['www', 'app', 'api', 'plataforma', 'admin', 'mail', 'static', 'assets', 'staging', 'status']) then
    perform private.fail('slug_reserved');
  end if;
  if exists (select 1 from public.clubs where slug = v_slug) then
    perform private.fail('slug_taken');
  end if;
  return v_slug;
end;
$$;

create function public.create_club(p_slug text, p_name text, p_timezone text, p_admin_email text)
returns public.clubs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_name text := btrim(coalesce(p_name, ''));
  v_email text;
  v_club public.clubs;
begin
  if not private.is_platform_admin() then
    perform private.fail('forbidden');
  end if;
  v_slug := private.checked_slug(p_slug);
  if length(v_name) not between 1 and 60 then
    perform private.fail('invalid_input');
  end if;
  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    perform private.fail('invalid_timezone');
  end if;
  v_email := private.normalized_email(p_admin_email);

  begin
    insert into public.clubs (slug, name, timezone) values (v_slug, v_name, p_timezone)
    returning * into v_club;
  exception when unique_violation then
    -- Two clubs created at once with the same slug.
    perform private.fail('slug_taken');
  end;
  insert into public.club_invitations (club_id, email, role, invited_by)
  values (v_club.id, v_email, 'admin', (select auth.uid()));
  return v_club;
end;
$$;

-- /plataforma: every club and how far it got.
create function public.platform_clubs()
returns table (
  id uuid,
  slug text,
  name text,
  created_at timestamptz,
  setup_completed_at timestamptz,
  active_courts integer,
  staff integer,
  admin_invitation_expires_at timestamptz,
  bookings_last_week integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    perform private.fail('forbidden');
  end if;
  return query
  select c.id, c.slug, c.name, c.created_at, c.setup_completed_at,
         (select count(*)::int from public.courts co where co.club_id = c.id and co.is_active),
         (select count(*)::int from public.club_members m where m.club_id = c.id and m.role in ('admin', 'reception')),
         (select max(i.expires_at) from public.club_invitations i
           where i.club_id = c.id and i.role = 'admin' and i.accepted_at is null and i.cancelled_at is null),
         (select count(*)::int from public.bookings b
           where b.club_id = c.id and b.status = 'confirmed' and b.created_at > now() - interval '7 days')
  from public.clubs c
  order by c.created_at desc;
end;
$$;

-- The first admin did not use the link in time: 7 more days and the mail again.
create function public.resend_admin_invitation(p_club_id uuid)
returns public.club_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.club_invitations;
begin
  if not private.is_platform_admin() then
    perform private.fail('forbidden');
  end if;
  update public.club_invitations
     set expires_at = now() + interval '7 days', email_status = 'pending', email_attempts = 0,
         email_locked_until = null
   where id = (
     select i.id from public.club_invitations i
     where i.club_id = p_club_id and i.role = 'admin' and i.accepted_at is null and i.cancelled_at is null
     order by i.created_at desc
     limit 1
   )
  returning * into v_invitation;
  if not found then
    perform private.fail('not_found');
  end if;
  return v_invitation;
end;
$$;

-- "Listo" in the setup assistant: an operating club has at least one active court and one price.
create function public.finish_club_setup(p_club_id uuid)
returns public.clubs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club public.clubs;
begin
  if not private.has_club_role(p_club_id, array['admin']::public.club_role[]) then
    perform private.fail('forbidden');
  end if;
  if not exists (select 1 from public.courts where club_id = p_club_id and is_active)
     or not exists (select 1 from public.pricing_rules where club_id = p_club_id) then
    perform private.fail('setup_incomplete');
  end if;
  update public.clubs set setup_completed_at = coalesce(setup_completed_at, now())
   where id = p_club_id
  returning * into v_club;
  return v_club;
end;
$$;

revoke all on function private.is_platform_admin() from public;
revoke all on function private.checked_slug(text) from public;
revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.create_club(text, text, text, text) from public, anon;
revoke execute on function public.platform_clubs() from public, anon;
revoke execute on function public.resend_admin_invitation(uuid) from public, anon;
revoke execute on function public.finish_club_setup(uuid) from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.create_club(text, text, text, text) to authenticated;
grant execute on function public.platform_clubs() to authenticated;
grant execute on function public.resend_admin_invitation(uuid) to authenticated;
grant execute on function public.finish_club_setup(uuid) to authenticated;
