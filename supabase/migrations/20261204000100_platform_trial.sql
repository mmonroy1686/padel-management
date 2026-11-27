-- The platform follows each club through its trial (design: docs/features/plataforma-trial/design.md).
--
-- club_accounts holds what is commercial (status, end of the trial, the owner's contact, notes): nobody reads it
-- through the API, only the platform functions below. platform_clubs grows the activation milestones,
-- platform_club_weeks brings docs/piloto/metricas.sql to the screen, and a platform admin can join a club as support
-- (an admin membership marked support_since, logged in platform_support_sessions).

create type public.club_account_status as enum ('trial', 'active', 'paused', 'churned');

create table public.club_accounts (
  club_id uuid primary key references public.clubs (id) on delete cascade,
  status public.club_account_status not null default 'trial',
  trial_ends_on date not null,
  owner_name text not null default '' check (length(owner_name) <= 80),
  owner_phone text not null default '' check (length(owner_phone) <= 40),
  owner_email text not null default '' check (length(owner_email) <= 254),
  notes text not null default '' check (length(notes) <= 4000),
  updated_at timestamptz not null default now()
);

alter table public.club_accounts enable row level security;
revoke all on public.club_accounts from public, anon, authenticated;

-- A new club starts its 60-day trial on the day it is created, in its own time zone.
create function private.open_club_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.club_accounts (club_id, trial_ends_on)
  values (new.id, (now() at time zone new.timezone)::date + 60)
  on conflict (club_id) do nothing;
  return new;
end;
$$;

create trigger clubs_open_account
after insert on public.clubs
for each row execute function private.open_club_account();

-- The clubs that already exist start their trial today.
insert into public.club_accounts (club_id, trial_ends_on)
select id, (now() at time zone timezone)::date + 60 from public.clubs
on conflict (club_id) do nothing;

-- Support: the membership a platform admin opened with join_club_as_support.
alter table public.club_members add column support_since timestamptz;

create table public.platform_support_sessions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  previous_role public.club_role,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index platform_support_sessions_open on public.platform_support_sessions (club_id, user_id)
  where ended_at is null;

alter table public.platform_support_sessions enable row level security;
revoke all on public.platform_support_sessions from public, anon, authenticated;

-- /plataforma: every club, its trial and its milestones. One call feeds the list and the club's page.
drop function public.platform_clubs();
create function public.platform_clubs()
returns table (
  id uuid,
  slug text,
  name text,
  timezone text,
  created_at timestamptz,
  setup_completed_at timestamptz,
  active_courts integer,
  staff integer,
  admin_invitation_expires_at timestamptz,
  bookings_last_week integer,
  online_last_week integer,
  last_booking_at timestamptz,
  players integer,
  status public.club_account_status,
  trial_ends_on date,
  is_support boolean,
  courts_and_prices_at timestamptz,
  reception_joined_at timestamptz,
  first_reception_booking_at timestamptz,
  first_online_booking_at timestamptz,
  twentieth_player_at timestamptz,
  first_payment_at timestamptz,
  first_match_at timestamptz,
  first_tournament_at timestamptz,
  first_day_use_at timestamptz
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
  select c.id, c.slug, c.name, c.timezone, c.created_at, c.setup_completed_at,
         (select count(*)::int from public.courts co where co.club_id = c.id and co.is_active),
         (select count(*)::int from public.club_members m
           where m.club_id = c.id and m.role in ('admin', 'reception') and m.support_since is null),
         (select max(i.expires_at) from public.club_invitations i
           where i.club_id = c.id and i.role = 'admin' and i.accepted_at is null and i.cancelled_at is null),
         (select count(*)::int from public.bookings b
           where b.club_id = c.id and b.status = 'confirmed' and b.created_at > now() - interval '7 days'),
         (select count(*)::int from public.bookings b
           where b.club_id = c.id and b.status = 'confirmed' and b.source = 'online'
             and b.created_at > now() - interval '7 days'),
         (select max(b.created_at) from public.bookings b where b.club_id = c.id),
         (select count(*)::int from public.club_members m where m.club_id = c.id and m.role = 'player'),
         a.status, a.trial_ends_on,
         exists (select 1 from public.club_members m
                  where m.club_id = c.id and m.user_id = (select auth.uid()) and m.support_since is not null),
         -- Courts and prices: when the club had both (greatest skips nulls, so each side is checked).
         (select case when co.first_at is not null and pr.first_at is not null then greatest(co.first_at, pr.first_at) end
            from (select min(x.created_at) as first_at from public.courts x where x.club_id = c.id) co,
                 (select min(y.created_at) as first_at from public.pricing_rules y where y.club_id = c.id) pr),
         least(
           (select min(i.accepted_at) from public.club_invitations i where i.club_id = c.id and i.role = 'reception'),
           (select min(m.created_at) from public.club_members m
             where m.club_id = c.id and m.role = 'reception' and m.support_since is null)),
         (select min(b.created_at) from public.bookings b where b.club_id = c.id and b.source = 'reception'),
         (select min(b.created_at) from public.bookings b where b.club_id = c.id and b.source = 'online'),
         (select m.created_at from public.club_members m where m.club_id = c.id and m.role = 'player'
           order by m.created_at offset 19 limit 1),
         (select min(p.confirmed_at) from public.payments p
           where p.club_id = c.id and p.status in ('confirmed', 'refunded')),
         (select min(om.created_at) from public.open_matches om where om.club_id = c.id),
         least((select min(t.created_at) from public.tournaments t where t.club_id = c.id),
               (select min(ch.created_at) from public.championships ch where ch.club_id = c.id)),
         (select min(d.created_at) from public.day_use_passes d where d.club_id = c.id)
  from public.clubs c
  join public.club_accounts a on a.club_id = c.id
  order by c.created_at desc;
end;
$$;

-- The club's page: one row per week (Monday to Sunday in the club's time zone), oldest first, the current one last.
-- The same rules as docs/piloto/metricas.sql: everything counts in the week it starts in.
create function public.platform_club_weeks(p_club_id uuid, p_weeks integer default 8)
returns table (
  week date,
  bookings_online integer,
  bookings_reception integer,
  cancelled integer,
  cancelled_late integer,
  open_hours numeric,
  busy_hours numeric,
  active_players integer,
  new_players integer,
  recovered integer,
  payments integer,
  amount bigint,
  played integer,
  no_shows integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_club public.clubs;
  v_weeks integer := least(greatest(coalesce(p_weeks, 8), 1), 26);
begin
  if not private.is_platform_admin() then
    perform private.fail('forbidden');
  end if;
  select * into v_club from public.clubs where id = p_club_id;
  if not found then
    perform private.fail('not_found');
  end if;

  return query
  with weeks as (
    select ws::date as wk, ws at time zone v_club.timezone as from_ts,
           (ws + interval '7 days') at time zone v_club.timezone as to_ts
    from generate_series(date_trunc('week', now() at time zone v_club.timezone) - make_interval(weeks => v_weeks - 1),
                         date_trunc('week', now() at time zone v_club.timezone), interval '1 week') as ws
  ),
  bands (from_time, to_time) as (
    values (time '00:00', time '14:00'), (time '14:00', time '19:00'), (time '19:00', time '24:00')
  ),
  windows as (
    select w.wk,
           tstzrange((d + greatest(v_club.opens_at, b.from_time)) at time zone v_club.timezone,
                     (d + least(v_club.closes_at, b.to_time)) at time zone v_club.timezone) as span
    from weeks w, bands b,
         generate_series(w.wk::timestamp, w.wk + interval '6 days', interval '1 day') as d
    where greatest(v_club.opens_at, b.from_time) < least(v_club.closes_at, b.to_time)
  ),
  occupancy as (
    select w.wk,
           sum(extract(epoch from upper(w.span) - lower(w.span))) as open_s,
           coalesce(sum(o.busy), 0) as busy_s
    from windows w
    cross join public.courts c
    left join lateral (
      select sum(extract(epoch from upper(o.period * w.span) - lower(o.period * w.span))) as busy
      from public.court_occupancy o
      where o.court_id = c.id and o.period && w.span and o.kind not in ('block', 'hold')
    ) o on true
    where c.club_id = p_club_id and c.is_active
    group by w.wk
  ),
  activity (player_id, at) as (
    select b.player_id, b.starts_at from public.bookings b
     where b.club_id = p_club_id and b.status = 'confirmed' and b.player_id is not null
    union all
    select bp.player_id, b.starts_at from public.booking_players bp join public.bookings b on b.id = bp.booking_id
     where b.club_id = p_club_id and b.status = 'confirmed' and bp.player_id is not null
    union all
    select s.player_id, m.starts_at from public.match_slots s join public.open_matches m on m.id = s.match_id
     where m.club_id = p_club_id and m.cancelled_at is null and s.player_id is not null
    union all
    select d.player_id, (d.on_date::timestamp at time zone v_club.timezone) from public.day_use_passes d
     where d.club_id = p_club_id and d.cancelled_at is null and d.player_id is not null
    union all
    select e.player_id, t.starts_at from public.tournament_entries e join public.tournaments t on t.id = e.tournament_id
     where e.club_id = p_club_id and e.removed_at is null and t.cancelled_at is null and e.player_id is not null
    union all
    select unnest(array[e.player1_id, e.player2_id]), e.created_at from public.championship_entries e
     where e.club_id = p_club_id and e.status in ('active', 'waiting')
  )
  select w.wk,
         (select count(*)::int from public.bookings b where b.club_id = p_club_id and b.status = 'confirmed'
           and b.source = 'online' and b.starts_at >= w.from_ts and b.starts_at < w.to_ts),
         (select count(*)::int from public.bookings b where b.club_id = p_club_id and b.status = 'confirmed'
           and b.source = 'reception' and b.starts_at >= w.from_ts and b.starts_at < w.to_ts),
         (select count(*)::int from public.bookings b where b.club_id = p_club_id and b.status = 'cancelled'
           and b.starts_at >= w.from_ts and b.starts_at < w.to_ts),
         (select count(*)::int from public.bookings b where b.club_id = p_club_id and b.status = 'cancelled'
           and b.cancelled_by = b.player_id
           and b.cancelled_at > b.starts_at - make_interval(hours => v_club.cancellation_notice_hours)
           and b.starts_at >= w.from_ts and b.starts_at < w.to_ts),
         round(coalesce(o.open_s, 0) / 3600, 1),
         round(coalesce(o.busy_s, 0) / 3600, 1),
         (select count(distinct a.player_id)::int from activity a
           where a.player_id is not null and a.at >= w.from_ts and a.at < w.to_ts),
         (select count(*)::int from public.club_members m where m.club_id = p_club_id and m.role = 'player'
           and m.created_at >= w.from_ts and m.created_at < w.to_ts),
         (select count(*)::int from public.slot_holds h join public.bookings b on b.id = h.booking_id
           where h.club_id = p_club_id and h.status = 'claimed' and b.status = 'confirmed'
             and h.starts_at >= w.from_ts and h.starts_at < w.to_ts),
         (select count(*)::int from public.payments p where p.club_id = p_club_id and p.status = 'confirmed'
           and p.confirmed_at >= w.from_ts and p.confirmed_at < w.to_ts),
         (select coalesce(sum(p.amount), 0)::bigint from public.payments p where p.club_id = p_club_id
           and p.status = 'confirmed' and p.confirmed_at >= w.from_ts and p.confirmed_at < w.to_ts),
         (select count(*)::int from public.bookings b where b.club_id = p_club_id and b.status = 'confirmed'
           and b.match_id is null and b.starts_at < now() and b.starts_at >= w.from_ts and b.starts_at < w.to_ts),
         (select count(*)::int from public.bookings b where b.club_id = p_club_id and b.status = 'confirmed'
           and b.match_id is null and b.no_show_at is not null and b.starts_at < now()
           and b.starts_at >= w.from_ts and b.starts_at < w.to_ts)
  from weeks w
  left join occupancy o on o.wk = w.wk
  order by w.wk;
end;
$$;

-- The club's page: the owner's contact and the notes.
create function public.platform_club_account(p_club_id uuid)
returns public.club_accounts
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account public.club_accounts;
begin
  if not private.is_platform_admin() then
    perform private.fail('forbidden');
  end if;
  select * into v_account from public.club_accounts where club_id = p_club_id;
  if not found then
    perform private.fail('not_found');
  end if;
  return v_account;
end;
$$;

-- "Estado": trial, active, paused or churned, and the last day of the trial. Nothing else changes: the club keeps
-- working whatever its status.
create function public.set_club_account_status(
  p_club_id uuid, p_status public.club_account_status, p_trial_ends_on date default null
)
returns public.club_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.club_accounts;
begin
  if not private.is_platform_admin() then
    perform private.fail('forbidden');
  end if;
  if p_status is null then
    perform private.fail('invalid_status');
  end if;
  update public.club_accounts
     set status = p_status, trial_ends_on = coalesce(p_trial_ends_on, trial_ends_on), updated_at = now()
   where club_id = p_club_id
  returning * into v_account;
  if not found then
    perform private.fail('not_found');
  end if;
  return v_account;
end;
$$;

create function public.save_club_account_contact(
  p_club_id uuid, p_owner_name text, p_owner_phone text, p_owner_email text, p_notes text
)
returns public.club_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.club_accounts;
  v_email text := lower(btrim(coalesce(p_owner_email, '')));
begin
  if not private.is_platform_admin() then
    perform private.fail('forbidden');
  end if;
  if v_email <> '' then
    v_email := private.normalized_email(v_email);
  end if;
  if length(btrim(coalesce(p_owner_name, ''))) > 80 or length(btrim(coalesce(p_owner_phone, ''))) > 40
     or length(btrim(coalesce(p_notes, ''))) > 4000 then
    perform private.fail('invalid_input');
  end if;
  update public.club_accounts
     set owner_name = btrim(coalesce(p_owner_name, '')), owner_phone = btrim(coalesce(p_owner_phone, '')),
         owner_email = v_email, notes = btrim(coalesce(p_notes, '')), updated_at = now()
   where club_id = p_club_id
  returning * into v_account;
  if not found then
    perform private.fail('not_found');
  end if;
  return v_account;
end;
$$;

-- "Entrar como soporte": the platform admin becomes an admin of the club, marked as support, and the session is
-- logged with the role they had before (a player of the club stays one after leaving).
create function public.join_club_as_support(p_club_id uuid)
returns public.club_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_member public.club_members;
begin
  if not private.is_platform_admin() then
    perform private.fail('forbidden');
  end if;
  if not exists (select 1 from public.clubs where id = p_club_id) then
    perform private.fail('not_found');
  end if;
  select * into v_member from public.club_members where club_id = p_club_id and user_id = v_user for update;
  if v_member.support_since is not null then
    return v_member;
  end if;
  if v_member.role in ('admin', 'reception') then
    perform private.fail('already_staff');
  end if;

  insert into public.platform_support_sessions (club_id, user_id, previous_role)
  values (p_club_id, v_user, v_member.role);
  if v_member.user_id is not null then
    update public.club_members set role = 'admin', support_since = now()
     where club_id = p_club_id and user_id = v_user
    returning * into v_member;
  else
    insert into public.club_members (club_id, user_id, role, support_since)
    values (p_club_id, v_user, 'admin', now())
    returning * into v_member;
  end if;
  return v_member;
end;
$$;

create function public.leave_club_support(p_club_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_session public.platform_support_sessions;
begin
  if not private.is_platform_admin() then
    perform private.fail('forbidden');
  end if;
  select * into v_session from public.platform_support_sessions
   where club_id = p_club_id and user_id = v_user and ended_at is null
   for update;
  if not found then
    perform private.fail('not_support');
  end if;
  if v_session.previous_role is null then
    delete from public.club_members where club_id = p_club_id and user_id = v_user;
  else
    update public.club_members set role = v_session.previous_role, support_since = null
     where club_id = p_club_id and user_id = v_user;
  end if;
  update public.platform_support_sessions set ended_at = now() where id = v_session.id;
end;
$$;

-- Ajustes → Staff: support shows as «Soporte».
drop function public.club_staff(uuid);
create function public.club_staff(p_club_id uuid)
returns table (user_id uuid, role public.club_role, display_name text, email text, support boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_club_role(p_club_id, array['admin']::public.club_role[]) then
    perform private.fail('forbidden');
  end if;
  return query
  select m.user_id, m.role, p.display_name, u.email::text, m.support_since is not null
  from public.club_members m
  join public.profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  where m.club_id = p_club_id and m.role in ('admin', 'reception')
  order by m.support_since is not null, m.role, lower(p.display_name), u.email;
end;
$$;

revoke all on function private.open_club_account() from public;
revoke execute on function public.platform_clubs() from public, anon;
revoke execute on function public.platform_club_weeks(uuid, integer) from public, anon;
revoke execute on function public.platform_club_account(uuid) from public, anon;
revoke execute on function public.set_club_account_status(uuid, public.club_account_status, date) from public, anon;
revoke execute on function public.save_club_account_contact(uuid, text, text, text, text) from public, anon;
revoke execute on function public.join_club_as_support(uuid) from public, anon;
revoke execute on function public.leave_club_support(uuid) from public, anon;
revoke execute on function public.club_staff(uuid) from public, anon;
grant execute on function public.platform_clubs() to authenticated;
grant execute on function public.platform_club_weeks(uuid, integer) to authenticated;
grant execute on function public.platform_club_account(uuid) to authenticated;
grant execute on function public.set_club_account_status(uuid, public.club_account_status, date) to authenticated;
grant execute on function public.save_club_account_contact(uuid, text, text, text, text) to authenticated;
grant execute on function public.join_club_as_support(uuid) to authenticated;
grant execute on function public.leave_club_support(uuid) to authenticated;
grant execute on function public.club_staff(uuid) to authenticated;
