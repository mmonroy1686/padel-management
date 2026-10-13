-- Marca del club, part 1: the club stores two colors and a mode; the app works out every other color when it
-- shows them (lib/domain/club-theme.ts). With the defaults Rustic looks exactly as before. Colors are #RRGGBB in
-- upper case, so the check and the RPC agree on one spelling.
alter table public.clubs
  add column brand_primary text not null default '#FCB021'
    constraint clubs_brand_primary_hex check (brand_primary ~ '^#[0-9A-F]{6}$'),
  add column brand_background text not null default '#021716'
    constraint clubs_brand_background_hex check (brand_background ~ '^#[0-9A-F]{6}$'),
  add column color_mode public.club_color_mode not null default 'system';

-- Ajustes → "Marca del club". Admins of the club only; a color that is not #RRGGBB (any case) is invalid_color.
create function public.save_club_brand(
  p_club_id uuid,
  p_primary text,
  p_background text,
  p_mode public.club_color_mode
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_primary text := upper(trim(p_primary));
  v_background text := upper(trim(p_background));
begin
  if not private.has_club_role(p_club_id, array['admin']::public.club_role[]) then
    perform private.fail('forbidden');
  end if;
  if v_primary is null or v_primary !~ '^#[0-9A-F]{6}$'
     or v_background is null or v_background !~ '^#[0-9A-F]{6}$' then
    perform private.fail('invalid_color');
  end if;
  if p_mode is null then
    perform private.fail('invalid_input');
  end if;
  update public.clubs
     set brand_primary = v_primary, brand_background = v_background, color_mode = p_mode
   where id = p_club_id;
end;
$$;

revoke execute on function public.save_club_brand(uuid, text, text, public.club_color_mode) from public, anon;
grant execute on function public.save_club_brand(uuid, text, text, public.club_color_mode) to authenticated;
