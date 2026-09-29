-- Categories and roles. The player declares her category (and joins the club doing so); staff
-- validate it; only admins change roles.

create function public.set_my_category(p_club_id uuid, p_category integer)
returns public.club_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_member public.club_members;
begin
  if v_uid is null then
    perform private.fail('forbidden');
  end if;
  if p_category is null or p_category not between 1 and 8 then
    perform private.fail('invalid_input');
  end if;
  if not exists (select 1 from public.clubs where id = p_club_id) then
    perform private.fail('not_found');
  end if;

  insert into public.club_members (club_id, user_id, role, category, category_validated)
  values (p_club_id, v_uid, 'player', p_category, false)
  on conflict (club_id, user_id)
    do update set category = excluded.category, category_validated = false
  returning * into v_member;
  return v_member;
end;
$$;

create function public.validate_category(p_club_id uuid, p_user_id uuid, p_category integer)
returns public.club_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.club_members;
begin
  if not private.is_staff(p_club_id) then
    perform private.fail('forbidden');
  end if;
  if p_category is null or p_category not between 1 and 8 then
    perform private.fail('invalid_input');
  end if;

  update public.club_members
     set category = p_category, category_validated = true
   where club_id = p_club_id and user_id = p_user_id
  returning * into v_member;
  if not found then
    perform private.fail('not_found');
  end if;
  return v_member;
end;
$$;

create function public.set_member_role(p_club_id uuid, p_user_id uuid, p_role public.club_role)
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
  -- Keeps the club from losing its only admin by accident.
  if p_user_id = (select auth.uid()) then
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

revoke execute on function public.set_my_category(uuid, integer) from public, anon;
revoke execute on function public.validate_category(uuid, uuid, integer) from public, anon;
revoke execute on function public.set_member_role(uuid, uuid, public.club_role) from public, anon;
grant execute on function public.set_my_category(uuid, integer) to authenticated;
grant execute on function public.validate_category(uuid, uuid, integer) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, public.club_role) to authenticated;
