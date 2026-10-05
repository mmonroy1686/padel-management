-- Lista de espera, part 4: the outbox. The database never calls anyone: it writes each aviso to
-- notifications and Next (lib/notify/outbox.ts) mails it with the service role. Claiming takes a batch
-- with skip locked and leases it for five minutes, so two runs never mail the same aviso; a failed mail
-- is retried up to its third attempt. The player's address comes from auth.users and goes nowhere else.
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
  club_logo_path text
)
language sql
security definer
set search_path = ''
as $$
  with picked as (
    select n.id
    from public.notifications n
    where (n.email_status = 'pending' or (n.email_status = 'failed' and n.email_attempts < 3))
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
  select c.id, c.kind, c.data, c.link, u.email::text, p.display_name, cl.name, cl.timezone, cl.logo_path
  from claimed c
  join auth.users u on u.id = c.user_id
  join public.profiles p on p.id = c.user_id
  join public.clubs cl on cl.id = c.club_id
  order by c.created_at;
$$;

-- What happened to one mail: sent, failed (retried while it has attempts left) or skipped (no mail
-- configured, no address, or the hold already ran out).
create function public.finish_notification_email(p_id uuid, p_status public.email_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status is null or p_status = 'pending' then
    perform private.fail('invalid_input');
  end if;
  update public.notifications
     set email_status = p_status,
         email_locked_until = null,
         emailed_at = case when p_status = 'sent' then now() end
   where id = p_id;
end;
$$;

revoke execute on function public.claim_notification_emails(integer) from public, anon, authenticated;
revoke execute on function public.finish_notification_email(uuid, public.email_status) from public, anon, authenticated;
grant execute on function public.claim_notification_emails(integer) to service_role;
grant execute on function public.finish_notification_email(uuid, public.email_status) to service_role;
