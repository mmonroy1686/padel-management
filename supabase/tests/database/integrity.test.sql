begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(21);

-- Grants: Supabase gives EXECUTE on new public functions to anon by default. None of ours may keep it but the
-- public page of a championship, and authenticated never runs the private helpers that write or skip the
-- permission checks.
select is(
  array(select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')
        order by 1),
  array['public.public_championship'],
  'anon executes only public_championship (the read-only public page of a championship)');
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in ('fail', 'slot_period', 'slot_price', 'active_court_club', 'insert_booking',
                         'cancel_booking_row', 'club_today', 'series_horizon', 'generate_series_bookings',
                         'extend_all_series', 'confirmed_amount', 'staff_payment')
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot execute the private writers directly');

call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '20:00', 90), '00000000-0000-0000-0000-0000000000a1', 1600);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(4, '20:00', 90), '00000000-0000-0000-0000-0000000000a1', 1600);

insert into storage.objects (bucket_id, name) values
  ('receipts', '00000000-0000-0000-0000-0000000000a1/r1.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000a1/r2.png');

-- Ana reports both transfers.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select public.report_transfer('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1/r1.png');
select public.report_transfer('b0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1/r2.png');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  $$ select public.record_cash('b0000000-0000-0000-0000-000000000001', 1600) $$,
  'P0001', 'invalid_input', 'cash cannot cover what a reported transfer already covers');

-- Someone else confirmed cash for booking 1 at the same time (inserted as postgres).
reset role;
insert into public.payments (club_id, booking_id, method, amount, status, confirmed_at)
values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cash', 1600, 'confirmed', now());
select throws_ok(
  $$ insert into public.payments (club_id, booking_id, method, amount, status)
     values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'transfer', 1, 'reported') $$,
  '23505', null, 'a booking has at most one reported transfer');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  $$ select public.confirm_payment((select id from public.payments
       where booking_id = 'b0000000-0000-0000-0000-000000000001' and status = 'reported')) $$,
  'P0001', 'invalid_state', 'a transfer cannot be confirmed past the price');

select lives_ok(
  $$ select public.cancel_booking('b0000000-0000-0000-0000-000000000002') $$,
  'reception cancels a booking with a reported transfer');
select results_eq(
  $$ select status::text, rejection_reason from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000002' $$,
  $$ values ('rejected', 'Reserva cancelada') $$,
  'cancelling a booking rejects its reported transfer');

-- A reported transfer on a cancelled booking (inserted as postgres) cannot be confirmed.
reset role;
insert into public.payments (club_id, booking_id, method, amount, status)
values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'transfer', 1600, 'reported');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  $$ select public.confirm_payment((select id from public.payments
       where booking_id = 'b0000000-0000-0000-0000-000000000002' and status = 'reported')) $$,
  'P0001', 'invalid_state', 'payments are confirmed only on confirmed bookings');

-- Series: A (20:00) and B (11:00) on court 1, C (08:00) on court 2, all on today's weekday from tomorrow.
select * from public.create_series('c0000000-0000-0000-0000-000000000001',
  extract(dow from test_helpers.today())::integer, '20:00', test_helpers.today() + 1, p_guest_name => 'Rodríguez');
select * from public.create_series('c0000000-0000-0000-0000-000000000001',
  extract(dow from test_helpers.today())::integer, '11:00', test_helpers.today() + 1, p_guest_name => 'Explota');
select * from public.create_series('c0000000-0000-0000-0000-000000000002',
  extract(dow from test_helpers.today())::integer, '08:00', test_helpers.today() + 1, p_guest_name => 'Pérez');

select throws_ok(
  format('select public.end_series(%L, %L)',
         (select id from public.recurring_series where guest_name = 'Rodríguez'), test_helpers.today() - 1),
  'P0001', 'invalid_input', 'a series cannot be ended in the past');
select lives_ok(
  format('select public.end_series(%L, %L)',
         (select id from public.recurring_series where guest_name = 'Rodríguez'), test_helpers.today() + 57),
  'a series can be ended after its last generated date');
select lives_ok(
  format('select public.end_series(%L, %L)',
         (select id from public.recurring_series where guest_name = 'Rodríguez'), test_helpers.today() + 70),
  'ending it again later is accepted');
select is((select ends_on from public.recurring_series where guest_name = 'Rodríguez'), test_helpers.today() + 56,
  'ending a series later never extends it');

-- Court 2 is turned off.
reset role;
update public.courts set is_active = false where id = 'c0000000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000002', test_helpers.at(5, '08:00'), p_guest_name => 'X') $$,
  'P0001', 'not_found', 'reception cannot book an inactive court');
select throws_ok(
  $$ select public.block_court('c0000000-0000-0000-0000-000000000002', test_helpers.at(5, '10:00'),
       test_helpers.at(5, '11:00'), null) $$,
  'P0001', 'not_found', 'reception cannot block an inactive court');
select throws_ok(
  $$ select * from public.create_series('c0000000-0000-0000-0000-000000000002',
       extract(dow from test_helpers.today())::integer, '09:30', test_helpers.today() + 1, p_guest_name => 'X') $$,
  'P0001', 'not_found', 'reception cannot load a series on an inactive court');

-- The daily job: pretend a week went by, and make series B fail with an unexpected error.
reset role;
with gone as (
  delete from public.bookings where series_id is not null and starts_at >= test_helpers.at(50, '00:00')
  returning occupancy_id
)
delete from public.court_occupancy where id in (select occupancy_id from gone);
update public.recurring_series set generated_until = test_helpers.today() + 49, ends_on = null;

create function test_helpers.explode() returns trigger language plpgsql as $$
begin
  raise division_by_zero;
end;
$$;
create trigger explode before insert on public.bookings
  for each row when (new.guest_name = 'Explota') execute function test_helpers.explode();

select is(private.extend_all_series(), 2, 'a series that fails does not stop the others');
select is(
  (select count(*)::int from public.bookings
   where guest_name = 'Rodríguez' and status = 'confirmed' and starts_at = test_helpers.at(56, '20:00')),
  1, 'the healthy series got its missing week');
select is((select generated_until from public.recurring_series where guest_name = 'Explota'), test_helpers.today() + 49,
  'the failing series is left as it was, to retry tomorrow');
select is(
  (select s.reason from public.recurring_series_skips s join public.recurring_series r on r.id = s.series_id
   where r.guest_name = 'Pérez' and s.on_date = test_helpers.today() + 56),
  'court_inactive', 'dates on an inactive court are skipped and reported');
select is(
  (select count(*)::int from public.bookings where guest_name = 'Pérez' and starts_at = test_helpers.at(56, '08:00')),
  0, 'no booking lands on an inactive court');

select throws_ok(
  $$ update public.recurring_series set ends_on = starts_on - 2 where guest_name = 'Pérez' $$,
  '23514', null, 'a series cannot end before it starts');

select * from finish();
rollback;
