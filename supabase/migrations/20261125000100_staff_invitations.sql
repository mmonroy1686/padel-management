-- Staff by invitation (design: docs/features/staff-invitaciones/design.md).
--
-- An admin invites an email as admin or reception. The person signs in with that email and accept_staff_invitation
-- gives them the role, without the player's welcome. No token travels in the link: the invitation is found by the
-- session's email, so the session must prove the person owns it: a magic link or Google (the JWT's amr). A password
-- session does not count: with email confirmations off, anyone could sign up with an invited address that has no
-- account yet.
--
-- A club never loses its last admin: a trigger on club_members refuses it (last_admin), whatever the path.
-- set_member_role lets an admin change their own role (the trigger keeps the last admin), so the club can be handed over.

create table public.club_invitations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254),
  role public.club_role not null check (role in ('admin', 'reception')),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  email_status public.email_status not null default 'pending',
  email_attempts smallint not null default 0,
  email_locked_until timestamptz,
  emailed_at timestamptz,
  constraint club_invitations_one_end check (accepted_at is null or cancelled_at is null)
);

-- One open invitation per club and email (expired ones stay open: inviting again renews them).
create unique index club_invitations_open_idx on public.club_invitations (club_id, email)
  where accepted_at is null and cancelled_at is null;
create index club_invitations_email_queue_idx on public.club_invitations (created_at)
  where email_status in ('pending', 'failed');

alter table public.club_invitations enable row level security;
revoke all on public.club_invitations from public, anon, authenticated;
grant select on public.club_invitations to authenticated;

-- Only admins manage the staff, so only they see who is invited.
create policy club_invitations_select_admin on public.club_invitations
  for select to authenticated
  using (private.has_club_role(club_id, array['admin']::public.club_role[]));

-- The last admin of a club stays. Deletes only count when a user asks (auth.uid() set) and the club is still there:
-- deleting an account (service role) or the club itself cascades and must go through.
create function private.keep_an_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'admin' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- Still admin of the same club. Moving the row to another club or user leaves this club, like a delete.
  if tg_op = 'UPDATE' and new.role = 'admin' and new.club_id = old.club_id and new.user_id = old.user_id then
    return new;
  end if;
  if tg_op = 'DELETE' and (select auth.uid()) is null then
    return old;
  end if;
  -- Two admins demoting each other at once: the second waits and sees the first. No club row: the club itself is
  -- being deleted, and its members go with it.
  perform 1 from public.clubs where id = old.club_id for update;
  if not found then
    return old;
  end if;
  if not exists (
    select 1 from public.club_members m
    where m.club_id = old.club_id and m.role = 'admin' and m.user_id <> old.user_id
  ) then
    perform private.fail('last_admin');
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger club_members_keep_an_admin
  before update of role, club_id, user_id or delete on public.club_members
  for each row execute function private.keep_an_admin();

create or replace function public.set_member_role(p_club_id uuid, p_user_id uuid, p_role public.club_role)
returns public.club_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.club_members;
begin
  if not private.has_club_role(p_club_id, array['admin']::public.club_role[]) then
    perform private.fail('forbidden');
  end if;
  if p_role is null then
    perform private.fail('invalid_input');
  end if;

  update public.club_members set role = p_role
   where club_id = p_club_id and user_id = p_user_id
  returning * into v_member;
  if not found then
    perform private.fail('not_found');
  end if;
  return v_member;
end;
$$;

-- "Quitar acceso": back to player, keeping the category and the history.
create function public.remove_staff(p_club_id uuid, p_user_id uuid)
returns public.club_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.club_members;
begin
  if not private.has_club_role(p_club_id, array['admin']::public.club_role[]) then
    perform private.fail('forbidden');
  end if;
  update public.club_members set role = 'player'
   where club_id = p_club_id and user_id = p_user_id and role in ('admin', 'reception')
  returning * into v_member;
  if not found then
    perform private.fail('not_found');
  end if;
  return v_member;
end;
$$;

-- Ajustes → Staff: the club's admins and reception, with the email they sign in with (staff without a player
-- profile may have no name yet).
create function public.club_staff(p_club_id uuid)
returns table (user_id uuid, role public.club_role, display_name text, email text)
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
  select m.user_id, m.role, p.display_name, u.email::text
  from public.club_members m
  join public.profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  where m.club_id = p_club_id and m.role in ('admin', 'reception')
  order by m.role, lower(p.display_name), u.email;
end;
$$;

create function private.normalized_email(p_email text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    perform private.fail('invalid_email');
  end if;
  return v_email;
end;
$$;

-- Invites an email, or renews the open invitation for it (new role, 7 more days, mailed again).
create function public.invite_staff(p_club_id uuid, p_email text, p_role public.club_role)
returns public.club_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_invitation public.club_invitations;
begin
  if not private.has_club_role(p_club_id, array['admin']::public.club_role[]) then
    perform private.fail('forbidden');
  end if;
  if p_role is null or p_role not in ('admin', 'reception') then
    perform private.fail('invalid_input');
  end if;
  v_email := private.normalized_email(p_email);
  if exists (
    select 1 from public.club_members m join auth.users u on u.id = m.user_id
    where m.club_id = p_club_id and m.role in ('admin', 'reception') and lower(u.email) = v_email
  ) then
    perform private.fail('already_staff');
  end if;

  update public.club_invitations
     set role = p_role, invited_by = (select auth.uid()), expires_at = now() + interval '7 days',
         email_status = 'pending', email_attempts = 0, email_locked_until = null
   where club_id = p_club_id and email = v_email and accepted_at is null and cancelled_at is null
  returning * into v_invitation;
  if not found then
    insert into public.club_invitations (club_id, email, role, invited_by)
    values (p_club_id, v_email, p_role, (select auth.uid()))
    returning * into v_invitation;
  end if;
  return v_invitation;
end;
$$;

-- The open invitation p_id, locked, for an admin of its club.
create function private.open_invitation_for_admin(p_id uuid)
returns public.club_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.club_invitations;
begin
  select * into v_invitation from public.club_invitations where id = p_id for update;
  if not found or not private.has_club_role(v_invitation.club_id, array['admin']::public.club_role[]) then
    perform private.fail('not_found');
  end if;
  if v_invitation.accepted_at is not null or v_invitation.cancelled_at is not null then
    perform private.fail('invalid_state');
  end if;
  return v_invitation;
end;
$$;

create function public.resend_staff_invitation(p_id uuid)
returns public.club_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.club_invitations;
begin
  perform private.open_invitation_for_admin(p_id);
  update public.club_invitations
     set expires_at = now() + interval '7 days', email_status = 'pending', email_attempts = 0,
         email_locked_until = null
   where id = p_id
  returning * into v_invitation;
  return v_invitation;
end;
$$;

create function public.cancel_staff_invitation(p_id uuid)
returns public.club_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.club_invitations;
begin
  perform private.open_invitation_for_admin(p_id);
  update public.club_invitations set cancelled_at = now() where id = p_id
  returning * into v_invitation;
  return v_invitation;
end;
$$;

-- /invitacion: the session's email takes its open, unexpired invitation to the club. The membership gets the role
-- (an admin is never lowered by it) and keeps its category; someone new joins without one.
create function public.accept_staff_invitation(p_club_id uuid)
returns public.club_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text := lower(btrim(coalesce((select auth.jwt()) ->> 'email', '')));
  v_invitation public.club_invitations;
  v_member public.club_members;
begin
  if v_user is null then
    perform private.fail('forbidden');
  end if;
  -- The session came from a link or a code mailed to the address, or from Google: it owns the email. A password
  -- session may not (signing up with someone else's address needs no confirmation when confirmations are off).
  if not exists (
    select 1 from jsonb_array_elements(coalesce((select auth.jwt()) -> 'amr', '[]'::jsonb)) as amr(entry)
    where amr.entry ->> 'method' in ('otp', 'magiclink', 'oauth', 'email/signup', 'invite', 'recovery')
  ) then
    perform private.fail('sign_in_with_link');
  end if;
  select * into v_invitation from public.club_invitations
   where club_id = p_club_id and email = v_email and accepted_at is null and cancelled_at is null
     and expires_at > now()
   for update;
  if not found then
    perform private.fail('invitation_not_found');
  end if;

  insert into public.club_members (club_id, user_id, role)
  values (p_club_id, v_user, v_invitation.role)
  on conflict (club_id, user_id) do update
    set role = case when public.club_members.role = 'admin' then 'admin'::public.club_role else excluded.role end
  returning * into v_member;

  update public.club_invitations
     set accepted_at = now(), accepted_by = v_user, email_status =
           case when email_status in ('pending', 'failed') then 'skipped'::public.email_status else email_status end
   where id = v_invitation.id;
  return v_member.role;
end;
$$;

-- The invitation mails, like claim_notification_emails: open, unexpired ones, at most 3 attempts, locked 5 minutes.
create function public.claim_invitation_emails(p_limit integer default 20)
returns table (
  invitation_id uuid,
  email text,
  role public.club_role,
  inviter_name text,
  club_name text,
  club_logo_path text,
  club_brand_primary text,
  club_brand_background text,
  club_slug text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select i.id
    from public.club_invitations i
    where i.email_status in ('pending', 'failed') and i.email_attempts < 3
      and (i.email_locked_until is null or i.email_locked_until < now())
      and i.accepted_at is null and i.cancelled_at is null and i.expires_at > now()
    order by i.created_at
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    for update skip locked
  ), claimed as (
    update public.club_invitations i
       set email_attempts = i.email_attempts + 1, email_locked_until = now() + interval '5 minutes'
      from picked
     where i.id = picked.id
    returning i.id, i.email, i.role, i.invited_by, i.club_id, i.created_at
  )
  select c.id, c.email, c.role, p.display_name, cl.name, cl.logo_path, cl.brand_primary, cl.brand_background,
         cl.slug
  from claimed c
  join public.clubs cl on cl.id = c.club_id
  left join public.profiles p on p.id = c.invited_by
  order by c.created_at;
end;
$$;

create function public.finish_invitation_email(p_id uuid, p_status public.email_status)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.club_invitations
     set email_status = p_status,
         email_locked_until = null,
         emailed_at = case when p_status = 'sent' then now() else emailed_at end
   where id = p_id;
$$;

revoke execute on function public.remove_staff(uuid, uuid) from public, anon;
revoke execute on function public.club_staff(uuid) from public, anon;
revoke execute on function public.invite_staff(uuid, text, public.club_role) from public, anon;
revoke execute on function public.resend_staff_invitation(uuid) from public, anon;
revoke execute on function public.cancel_staff_invitation(uuid) from public, anon;
revoke execute on function public.accept_staff_invitation(uuid) from public, anon;
grant execute on function public.remove_staff(uuid, uuid) to authenticated;
grant execute on function public.club_staff(uuid) to authenticated;
grant execute on function public.invite_staff(uuid, text, public.club_role) to authenticated;
grant execute on function public.resend_staff_invitation(uuid) to authenticated;
grant execute on function public.cancel_staff_invitation(uuid) to authenticated;
grant execute on function public.accept_staff_invitation(uuid) to authenticated;

revoke execute on function public.claim_invitation_emails(integer) from public, anon, authenticated;
revoke execute on function public.finish_invitation_email(uuid, public.email_status) from public, anon, authenticated;
grant execute on function public.claim_invitation_emails(integer) to service_role;
grant execute on function public.finish_invitation_email(uuid, public.email_status) to service_role;

revoke all on function private.keep_an_admin() from public;
revoke all on function private.normalized_email(text) from public;
revoke all on function private.open_invitation_for_admin(uuid) from public;
