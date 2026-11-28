-- Avisos (and mails) for everything that happens to a player's bookings and matches
-- (docs/features/avisos-de-reservas/design.md).
--
-- Each table writes its own avisos from a trigger, so every path is covered: the player's app, reception, a match that
-- fills up and the cron jobs. Next shows them in /avisos and mails them (lib/notify), as with every other aviso.
-- Recipients are the participants with an account: the holder and booking_players, or the match's slots. Whoever did
-- it gets it too, as a receipt; `actor` in the data says who that was.

-- The club picks how many hours before a booking the reminder goes out (null: none).
alter table public.clubs
  add column reminder_hours smallint default 24 check (reminder_hours is null or reminder_hours between 1 and 72);
grant update (reminder_hours) on public.clubs to authenticated;

-- A booking is reminded once.
alter table public.bookings add column reminded_at timestamptz;

-- The player can turn the reminders off (the rest of the avisos always come).
alter table public.profiles add column booking_reminders boolean not null default true;

create function public.set_booking_reminders(p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    perform private.fail('forbidden');
  end if;
  if p_on is null then
    perform private.fail('invalid_input');
  end if;
  update public.profiles set booking_reminders = p_on where id = (select auth.uid());
end;
$$;
revoke execute on function public.set_booking_reminders(boolean) from public, anon;
grant execute on function public.set_booking_reminders(boolean) to authenticated;

-- Who did it, as the recipient reads it: herself, the club (its staff), another player by name, or nobody (a cron).
create function private.notice_actor(p_club_id uuid, p_recipient uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return jsonb_build_object('actor', 'system');
  end if;
  if v_uid = p_recipient then
    return jsonb_build_object('actor', 'self');
  end if;
  if private.has_club_role(p_club_id, array['reception', 'admin']::public.club_role[]) then
    return jsonb_build_object('actor', 'club');
  end if;
  return jsonb_build_object('actor', 'player',
                            'actor_name', (select display_name from public.profiles where id = v_uid));
end;
$$;

-- When and where, and what each one pays: what every booking aviso says.
create function private.booking_notice_data(p_booking public.bookings)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'starts_at', p_booking.starts_at,
    'court_name', (select c.name from public.courts c where c.id = p_booking.court_id),
    'share', p_booking.price / 4
  );
$$;

-- The app's page for a booking: its match, or the booking's own page.
create function private.booking_notice_link(p_booking public.bookings)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_booking.match_id is not null then '/partidos/' || p_booking.match_id else '/turno/' || p_booking.id end;
$$;

create function private.notify(p_club_id uuid, p_user_id uuid, p_kind public.notification_kind, p_data jsonb, p_link text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (club_id, user_id, kind, data, link)
  select p_club_id, p_user_id, p_kind, p_data, p_link
  where p_user_id is not null;
$$;

-- bookings: a new booking (not a match's, not a weekly series', which have their own avisos) and a cancellation.
create function private.on_booking_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player record;
  v_series_ended boolean;
begin
  if tg_op = 'INSERT' then
    -- A booking loaded after the fact (it already started) is not news.
    if new.status = 'confirmed' and new.match_id is null and new.series_id is null and new.starts_at > now() then
      perform private.notify(new.club_id, new.player_id, 'booking_confirmed',
                             private.booking_notice_data(new) || private.notice_actor(new.club_id, new.player_id),
                             private.booking_notice_link(new));
    end if;
    return null;
  end if;

  -- A match's booking is cancelled with its match (match_cancelled says it).
  if old.status = 'confirmed' and new.status = 'cancelled' and new.match_id is null then
    -- Ending a weekly series cancels every booking after it: one aviso for the series (on_series_notice), not one a week.
    select exists (
      select 1 from public.recurring_series s join public.clubs c on c.id = s.club_id
      where s.id = new.series_id and s.ends_on is not null
        and s.ends_on < (new.starts_at at time zone c.timezone)::date
    ) into v_series_ended;
    if not v_series_ended then
      for v_player in
        select distinct p.player_id from private.booking_participants(new.id) p where p.player_id is not null
      loop
        perform private.notify(new.club_id, v_player.player_id, 'booking_cancelled',
                               private.booking_notice_data(new) || private.notice_actor(new.club_id, v_player.player_id),
                               private.booking_notice_link(new));
      end loop;
    end if;
  end if;
  return null;
end;
$$;

create trigger bookings_notice_insert after insert on public.bookings
  for each row execute function private.on_booking_notice();
create trigger bookings_notice_cancel after update of status on public.bookings
  for each row execute function private.on_booking_notice();

-- booking_players: someone with an account is added to a booking (or joins it), or taken out by someone else.
create function private.on_booking_player_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.booking_players := case when tg_op = 'INSERT' then new else old end;
  v_booking public.bookings;
begin
  if v_row.player_id is null then
    return null;
  end if;
  select * into v_booking from public.bookings where id = v_row.booking_id;
  if not found or v_booking.status <> 'confirmed' or v_booking.starts_at <= now() then
    return null;
  end if;

  if tg_op = 'INSERT' then
    perform private.notify(v_booking.club_id, v_row.player_id, 'booking_confirmed',
                           private.booking_notice_data(v_booking)
                           || private.notice_actor(v_booking.club_id, v_row.player_id)
                           || jsonb_build_object('joined', true, 'holder_name',
                                                 (select display_name from public.profiles where id = v_booking.player_id)),
                           private.booking_notice_link(v_booking));
  elsif (select auth.uid()) is distinct from v_row.player_id then
    perform private.notify(v_booking.club_id, v_row.player_id, 'booking_removed',
                           private.booking_notice_data(v_booking) || private.notice_actor(v_booking.club_id, v_row.player_id),
                           private.booking_notice_link(v_booking));
  end if;
  return null;
end;
$$;

create trigger booking_players_notice after insert or delete on public.booking_players
  for each row execute function private.on_booking_player_notice();

-- recurring_series: a weekly booking starts, or ends.
create function private.on_series_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if new.player_id is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    v_status := 'created';
  elsif new.ends_on is not null and (old.ends_on is null or new.ends_on < old.ends_on) then
    v_status := 'ended';
  else
    return null;
  end if;
  perform private.notify(new.club_id, new.player_id, 'booking_series',
                         jsonb_build_object('status', v_status, 'weekday', new.weekday,
                                            'start_time', to_char(new.start_time, 'HH24:MI'),
                                            'court_name', (select c.name from public.courts c where c.id = new.court_id),
                                            'starts_on', new.starts_on, 'ends_on', new.ends_on)
                         || private.notice_actor(new.club_id, new.player_id),
                         '/');
  return null;
end;
$$;

create trigger recurring_series_notice_insert after insert on public.recurring_series
  for each row execute function private.on_series_notice();
create trigger recurring_series_notice_end after update of ends_on on public.recurring_series
  for each row execute function private.on_series_notice();

-- open_matches: the fourth joined and the court is booked, or the match was cancelled (by the club, or by the cron
-- because it did not fill up or no court was left).
create function private.on_match_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_player record;
  v_kind public.notification_kind;
  v_data jsonb;
begin
  if new.status = old.status then
    return null;
  end if;
  if new.status = 'confirmed' and old.status = 'forming' then
    v_kind := 'match_confirmed';
    select * into v_booking from public.bookings where id = new.booking_id;
    v_data := private.booking_notice_data(v_booking);
  elsif new.status = 'cancelled' then
    v_kind := 'match_cancelled';
    v_data := jsonb_build_object('starts_at', new.starts_at, 'reason', new.cancel_reason, 'note', new.cancel_note);
  else
    return null;
  end if;

  for v_player in
    select s.player_id from public.match_slots s where s.match_id = new.id and s.player_id is not null
  loop
    perform private.notify(new.club_id, v_player.player_id, v_kind,
                           v_data || private.notice_actor(new.club_id, v_player.player_id), '/partidos/' || new.id);
  end loop;
  return null;
end;
$$;

create trigger open_matches_notice after update of status on public.open_matches
  for each row execute function private.on_match_notice();

-- match_slots: a player left (or was taken out of) a match that is still on. The rest hear who and how many are
-- missing; the one taken out by someone else hears it too.
create function private.on_match_slot_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.open_matches;
  v_player record;
  v_name text;
  v_data jsonb;
begin
  if old.player_id is null or new.player_id is not null then
    return null;
  end if;
  select * into v_match from public.open_matches where id = new.match_id;
  if not found or v_match.status = 'cancelled' or v_match.starts_at <= now() then
    return null;
  end if;

  select display_name into v_name from public.profiles where id = old.player_id;
  v_data := jsonb_build_object(
    'starts_at', v_match.starts_at,
    'player_name', v_name,
    'side', new.side,
    'free', (select count(*)::int from public.match_slots s where s.match_id = v_match.id and s.player_id is null)
  );
  for v_player in
    select s.player_id from public.match_slots s where s.match_id = v_match.id and s.player_id is not null
  loop
    perform private.notify(v_match.club_id, v_player.player_id, 'match_left', v_data, '/partidos/' || v_match.id);
  end loop;

  if (select auth.uid()) is distinct from old.player_id then
    perform private.notify(v_match.club_id, old.player_id, 'booking_removed',
                           jsonb_build_object('starts_at', v_match.starts_at, 'match', true)
                           || private.notice_actor(v_match.club_id, old.player_id),
                           '/partidos/' || v_match.id);
  end if;
  return null;
end;
$$;

create trigger match_slots_notice after update of player_id on public.match_slots
  for each row execute function private.on_match_slot_notice();

-- payments of a booking: who paid it. A match's share names its player; a booking's share, its position (1 is the
-- holder); a payment without either is the holder's. A guest's position has nobody to tell.
create function private.payment_recipient(p_payment public.payments, p_booking public.bookings)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_payment.payer_id,
    case
      when p_booking.match_id is not null then null
      when p_payment.payer_position is null or p_payment.payer_position = 1 then p_booking.player_id
      else (select bp.player_id from public.booking_players bp
            where bp.booking_id = p_booking.id and bp.position = p_payment.payer_position)
    end
  );
$$;

-- Paid (cash or card on the spot, a transfer when reception confirms it), a transfer rejected, a payment refunded.
-- Voiding a charge is reception correcting itself: no aviso.
create function private.on_payment_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_kind public.notification_kind;
  v_to uuid;
begin
  if new.booking_id is null or (tg_op = 'UPDATE' and new.status = old.status) then
    return null;
  end if;
  select * into v_booking from public.bookings where id = new.booking_id;
  if not found then
    return null;
  end if;

  if new.status = 'confirmed' then
    v_kind := 'payment_confirmed';
    v_to := private.payment_recipient(new, v_booking);
  elsif tg_op = 'UPDATE' and new.status = 'rejected' then
    v_kind := 'payment_rejected';
    v_to := coalesce(new.reported_by, private.payment_recipient(new, v_booking));
  elsif tg_op = 'UPDATE' and new.status = 'refunded' then
    v_kind := 'payment_refunded';
    v_to := private.payment_recipient(new, v_booking);
  else
    return null;
  end if;

  perform private.notify(new.club_id, v_to, v_kind,
                         private.booking_notice_data(v_booking)
                         || jsonb_build_object('amount', new.amount, 'method', new.method, 'reason', new.rejection_reason),
                         private.booking_notice_link(v_booking));
  return null;
end;
$$;

create trigger payments_notice after insert or update of status on public.payments
  for each row execute function private.on_payment_notice();

-- The reminder: every 10 minutes, the confirmed bookings that start within the club's hours and were booked before
-- that window opened (someone who books two hours ahead does not need it). Each one once.
create function private.send_booking_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due record;
  v_booking public.bookings;
  v_player record;
  v_count integer := 0;
begin
  for v_due in
    select b.id, c.reminder_hours
    from public.bookings b
    join public.clubs c on c.id = b.club_id
    where b.status = 'confirmed' and b.reminded_at is null and c.reminder_hours is not null
      and b.starts_at > now()
      and b.starts_at <= now() + make_interval(hours => c.reminder_hours)
      and b.created_at < b.starts_at - make_interval(hours => c.reminder_hours)
    for update of b skip locked
  loop
    update public.bookings set reminded_at = now() where id = v_due.id returning * into v_booking;
    for v_player in
      select distinct p.player_id
      from private.booking_participants(v_booking.id) p
      join public.profiles pr on pr.id = p.player_id
      where pr.booking_reminders
    loop
      perform private.notify(v_booking.club_id, v_player.player_id, 'booking_reminder',
                             private.booking_notice_data(v_booking)
                             || jsonb_build_object('hours', v_due.reminder_hours, 'match', v_booking.match_id is not null),
                             private.booking_notice_link(v_booking));
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end;
$$;

select cron.schedule('booking-reminders', '*/10 * * * *', 'select private.send_booking_reminders()');

revoke all on function private.notice_actor(uuid, uuid) from public;
revoke all on function private.booking_notice_data(public.bookings) from public;
revoke all on function private.booking_notice_link(public.bookings) from public;
revoke all on function private.notify(uuid, uuid, public.notification_kind, jsonb, text) from public;
revoke all on function private.payment_recipient(public.payments, public.bookings) from public;
revoke all on function private.send_booking_reminders() from public;
revoke all on function private.on_booking_notice() from public;
revoke all on function private.on_booking_player_notice() from public;
revoke all on function private.on_series_notice() from public;
revoke all on function private.on_match_notice() from public;
revoke all on function private.on_match_slot_notice() from public;
revoke all on function private.on_payment_notice() from public;
