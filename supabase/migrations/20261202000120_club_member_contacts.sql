-- Panel → Jugadores: how to reach each member, for the club's staff (admin and reception): the email they sign in
-- with, their WhatsApp and whether they accept being written to. Nobody else gets it.
create function public.club_member_contacts(p_club_id uuid)
returns table (user_id uuid, email text, phone text, whatsapp_consent boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_club_role(p_club_id, array['admin', 'reception']::public.club_role[]) then
    perform private.fail('forbidden');
  end if;
  return query
  select m.user_id, u.email::text, c.phone, coalesce(c.whatsapp_consent, false)
  from public.club_members m
  join auth.users u on u.id = m.user_id
  left join public.player_contacts c on c.user_id = m.user_id
  where m.club_id = p_club_id;
end;
$$;

revoke execute on function public.club_member_contacts(uuid) from public, anon;
grant execute on function public.club_member_contacts(uuid) to authenticated;
