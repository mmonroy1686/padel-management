-- The player's WhatsApp and their consent to be written to by the club (one consent for all clubs, Miguel's call on
-- 26/11). Not in profiles: public profiles are readable by every player, a phone must not be. Only the player and the
-- staff of a club where they are a member read it; only the player writes it, through save_player_contact.
create table public.player_contacts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Normalized like private.normalize_phone: digits, the local 0 (098123456).
  phone text check (phone is null or phone ~ '^[0-9]{8,15}$'),
  whatsapp_consent boolean not null default false,
  whatsapp_consent_at timestamptz,
  updated_at timestamptz not null default now(),
  -- Consent needs a number, and says when it was given.
  constraint player_contacts_consent_needs_phone check (not whatsapp_consent or phone is not null),
  constraint player_contacts_consent_when check (whatsapp_consent = (whatsapp_consent_at is not null))
);
alter table public.player_contacts enable row level security;

revoke all on public.player_contacts from anon, authenticated;
grant select on public.player_contacts to authenticated;

create policy player_contacts_select on public.player_contacts
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff_of_user(user_id));

-- "Tu WhatsApp" and "Acepto que el club me escriba por WhatsApp" in Perfil. An empty phone clears it (and the
-- consent with it); consenting without a phone is invalid_input. The consent date is kept while it stays on.
create function public.save_player_contact(p_phone text, p_consent boolean)
returns public.player_contacts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_phone text;
  v_row public.player_contacts;
begin
  if v_uid is null then
    perform private.fail('forbidden');
  end if;
  if p_phone is null or trim(p_phone) = '' then
    v_phone := null;
  else
    if length(p_phone) > 30 then
      perform private.fail('invalid_input');
    end if;
    v_phone := private.normalize_phone(p_phone);
    if v_phone is null or v_phone !~ '^[0-9]{8,15}$' then
      perform private.fail('invalid_input');
    end if;
  end if;
  if coalesce(p_consent, false) and v_phone is null then
    perform private.fail('invalid_input');
  end if;

  insert into public.player_contacts (user_id, phone, whatsapp_consent, whatsapp_consent_at, updated_at)
  values (v_uid, v_phone, coalesce(p_consent, false), case when coalesce(p_consent, false) then now() end, now())
  on conflict (user_id) do update
    set phone = excluded.phone,
        whatsapp_consent = excluded.whatsapp_consent,
        -- Keep the first date while the consent stays on.
        whatsapp_consent_at = case
          when not excluded.whatsapp_consent then null
          else coalesce(public.player_contacts.whatsapp_consent_at, excluded.whatsapp_consent_at)
        end,
        updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.save_player_contact(text, boolean) from public, anon;
grant execute on function public.save_player_contact(text, boolean) to authenticated;
