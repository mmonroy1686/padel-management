-- The welcome form and the profile screen save name, side, hand, visibility and category in one
-- transaction: a failure leaves nothing half saved, and a new player joins the club with it.
-- Keeping the same category keeps its validation; a different one goes back to pending.

create function public.save_my_profile(
  p_club_id uuid,
  p_display_name text,
  p_side public.player_side,
  p_hand public.dominant_hand,
  p_is_public boolean,
  p_category integer
)
returns public.club_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := trim(p_display_name);
  v_member public.club_members;
begin
  if v_uid is null then
    perform private.fail('forbidden');
  end if;
  if v_name is null or length(v_name) not between 1 and 60
     or p_side is null or p_hand is null or p_is_public is null
     or p_category is null or p_category not between 1 and 8 then
    perform private.fail('invalid_input');
  end if;
  if not exists (select 1 from public.clubs where id = p_club_id) then
    perform private.fail('not_found');
  end if;

  update public.profiles
     set display_name = v_name, side = p_side, hand = p_hand, is_public = p_is_public
   where id = v_uid;

  insert into public.club_members (club_id, user_id, role, category, category_validated)
  values (p_club_id, v_uid, 'player', p_category, false)
  on conflict (club_id, user_id) do update
    set category = excluded.category,
        category_validated = public.club_members.category_validated
                             and public.club_members.category is not distinct from excluded.category
  returning * into v_member;
  return v_member;
end;
$$;

revoke execute on function public.save_my_profile(uuid, text, public.player_side, public.dominant_hand, boolean, integer)
  from public, anon;
grant execute on function public.save_my_profile(uuid, text, public.player_side, public.dominant_hand, boolean, integer)
  to authenticated;
