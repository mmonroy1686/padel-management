-- Marca del club, part 3: the avisos mails take the club's colors. claim_notification_emails also returns the
-- club's two brand colors; a new column in its result needs drop and create. The body is the one of
-- 20261005000160_waitlist_review_fixes.sql, with cl.brand_primary and cl.brand_background at the end.
drop function public.claim_notification_emails(integer);

create function public.claim_notification_emails(p_limit integer default 20)
returns table (
  notification_id uuid,
  kind public.notification_kind,
  data jsonb,
  link text,
  email text,
  player_name text,
  club_name text,
  club_timezone text,
  club_logo_path text,
  club_brand_primary text,
  club_brand_background text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The mail of a hold that is no longer active would offer a slot that is gone.
  update public.notifications n
     set email_status = 'skipped', email_locked_until = null
   where n.kind = 'slot_held' and n.email_status in ('pending', 'failed')
     and not exists (
       select 1 from public.slot_holds h where h.id = (n.data ->> 'hold_id')::uuid and h.status = 'active'
     );

  return query
  with picked as (
    select n.id
    from public.notifications n
    where n.email_status in ('pending', 'failed') and n.email_attempts < 3
      and (n.email_locked_until is null or n.email_locked_until < now())
    order by n.created_at
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    for update skip locked
  ), claimed as (
    update public.notifications n
       set email_attempts = n.email_attempts + 1, email_locked_until = now() + interval '5 minutes'
      from picked
     where n.id = picked.id
    returning n.id, n.kind, n.data, n.link, n.user_id, n.club_id, n.created_at
  )
  select c.id, c.kind, c.data, c.link, u.email::text, p.display_name, cl.name, cl.timezone, cl.logo_path,
         cl.brand_primary, cl.brand_background
  from claimed c
  join auth.users u on u.id = c.user_id
  join public.profiles p on p.id = c.user_id
  join public.clubs cl on cl.id = c.club_id
  order by c.created_at;
end;
$$;

revoke execute on function public.claim_notification_emails(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_emails(integer) to service_role;
