begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/tournament.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(19);

-- Club T takes cash and transfers; POS is off until the admin turns it on.
select is((select accepts_card from public.clubs where id = 'a0000000-0000-0000-0000-000000000001'), false,
  'a club does not take POS until it says so');

-- A $1.200 booking of Ana, another one of Bruno, a $400 tournament with Ana, a $450 day use pass of Ana and a $2.000
-- championship pair.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(1, '11:00', 90), '00000000-0000-0000-0000-0000000000a1');
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(1, '11:00', 90), '00000000-0000-0000-0000-0000000000b1');
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000001', test_helpers.slot(3, '18:00', 140));
call test_helpers.add_entry('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1');
call test_helpers.make_product('d0000000-0000-0000-0000-000000000001', 'Day use completo',
  p_from => '00:00', p_to => '24:00');
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 2,
  '00000000-0000-0000-0000-0000000000a1');
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');

create function test_helpers.methods_of(p_column text, p_id uuid)
returns table (method text, amount integer, status text)
language plpgsql
stable
as $$
begin
  return query execute format(
    'select method::text, amount, status::text from public.payments where %I = $1 order by created_at', p_column)
    using p_id;
end;
$$;

set local role authenticated;

-- Carla, reception, while POS is off: every desk charge with card is refused.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok($$ select public.record_cash('b0000000-0000-0000-0000-000000000001', 1200, null, 'card') $$,
  'P0001', 'method_disabled', 'no POS for a booking while the club does not take it');
select throws_ok($$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000001', 1, 'card') $$,
  'P0001', 'method_disabled', 'nor for a share from Inicio');
select throws_ok(
  $$ select public.record_tournament_cash(test_helpers.entry_of('e3000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-0000000000a1'), 400, 'card') $$,
  'P0001', 'method_disabled', 'nor for a tournament');
select throws_ok($$ select public.record_day_use_cash('dd000000-0000-0000-0000-000000000001', 450, 'card') $$,
  'P0001', 'method_disabled', 'nor for a day use pass');
select throws_ok($$ select public.record_championship_cash('c3a00000-0000-0000-0000-000000000001', 2000, 'card') $$,
  'P0001', 'method_disabled', 'nor for a championship pair');

-- The desk functions take cash or card: a transfer is reported by the player and confirmed in Cobros.
select throws_ok($$ select public.record_cash('b0000000-0000-0000-0000-000000000001', 1200, null, 'transfer') $$,
  'P0001', 'invalid_input', 'a transfer is not a desk charge');

-- Dani, the admin, turns POS on.
reset role;
update public.clubs set accepts_card = true where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok($$ select public.record_cash('b0000000-0000-0000-0000-000000000001', 1200, null, 'card') $$,
  'reception charges a booking with POS');
select results_eq($$ select * from test_helpers.methods_of('booking_id', 'b0000000-0000-0000-0000-000000000001') $$,
  $$ values ('card', 1200, 'confirmed') $$, 'confirmed at once, as POS');
select lives_ok($$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000002', 1, 'card') $$,
  'and a share from Inicio');
select results_eq($$ select * from test_helpers.methods_of('booking_id', 'b0000000-0000-0000-0000-000000000002') $$,
  $$ values ('card', 300, 'confirmed') $$, 'a quarter of the price, as POS');
select lives_ok(
  $$ select public.record_tournament_cash(test_helpers.entry_of('e3000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-0000000000a1'), 400, 'card') $$,
  'and a tournament');
select lives_ok($$ select public.record_day_use_cash('dd000000-0000-0000-0000-000000000001', 450, 'card') $$,
  'and a day use pass');
select lives_ok($$ select public.record_championship_cash('c3a00000-0000-0000-0000-000000000001', 2000, 'card') $$,
  'and a championship pair');
reset role;
select results_eq(
  $$ select method::text, status::text, count(*)::int from public.payments
      where tournament_entry_id is not null or day_use_pass_id is not null or championship_entry_id is not null
      group by 1, 2 $$,
  $$ values ('card', 'confirmed', 3) $$, 'all of them confirmed as POS');
set local role authenticated;

-- Without a method the desk still takes cash, as before.
select lives_ok($$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000002', 2, 'cash') $$,
  'cash still works next to POS');

-- Ana, a player, cannot record a POS charge.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok($$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000002', 3, 'card') $$,
  'P0001', 'forbidden', 'a player cannot record a POS charge');

-- A club can take only POS, but not nothing.
reset role;
select lives_ok(
  $$ update public.clubs set accepts_cash = false, accepts_transfer = false
      where id = 'a0000000-0000-0000-0000-000000000001' $$,
  'a club can take POS only');
select throws_ok(
  $$ update public.clubs set accepts_card = false where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'but not no method at all');

select * from finish();
rollback;
