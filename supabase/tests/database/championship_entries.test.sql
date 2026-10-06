begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(36);

-- C1: open until 5 days from now, 2 categories per player, a day of play on day 10. K1 'Libre' takes 2 pairs
-- (Bruno and Lucía are in); K2 '5ta' and K3 '6ta' take 4.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001',
  'Libre', 2);
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000001', '5ta');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000003', 'c1a00000-0000-0000-0000-000000000001', '6ta');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
-- C2: still 'registration', but its deadline passed; Juli and Raúl are in.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000002', 'registration', now() - interval '1 hour');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000004', 'c1a00000-0000-0000-0000-000000000002');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000004',
  'c4a00000-0000-0000-0000-0000000000a5', 'c4a00000-0000-0000-0000-000000000f06');
-- C3 was drawn: too late for any change; Iván and Olga are in.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000003', 'drawn');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000005', 'c1a00000-0000-0000-0000-000000000003');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000005',
  'c4a00000-0000-0000-0000-0000000000a4', 'c4a00000-0000-0000-0000-000000000f05');

set local role authenticated;

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000001', 5, 6,
       p_partner_name => 'Sofía', p_partner_phone => '+598 99 222 333') $$,
  'a member signs up with a partner from outside');
select results_eq(
  $$ select player1_id, status::text from public.championship_entries
     where category_id = 'c2a00000-0000-0000-0000-000000000001'
       and player1_id = 'c4a00000-0000-0000-0000-0000000000a1' $$,
  $$ values ('c4a00000-0000-0000-0000-0000000000a1'::uuid, 'active') $$,
  'as her own player row, with a place');
select ok(
  exists (select 1 from public.championship_contacts('c1a00000-0000-0000-0000-000000000001') where phone = '099222333'),
  'the partner''s phone, normalized, goes to the pair');
select ok(
  not exists (select 1 from public.championship_contacts('c1a00000-0000-0000-0000-000000000001') where phone = '099111002'),
  'but not the phones of other pairs');
select throws_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000001', 5, 5,
       p_partner_name => 'Pedro', p_partner_phone => '099111001') $$,
  'P0001', 'already_in_category', 'nobody is in two pairs of a category');
select lives_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000002', 5, 5,
       p_partner_profile_id => '00000000-0000-0000-0000-0000000000a5') $$,
  'a member signs up with a member');
select throws_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000003', 5, 5,
       p_partner_profile_id => '00000000-0000-0000-0000-0000000000a4') $$,
  'P0001', 'too_many_categories', 'nobody plays more categories than the championship allows');
select throws_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000003', 5, 5,
       p_partner_profile_id => '00000000-0000-0000-0000-0000000000a1') $$,
  'P0001', 'same_player', 'a pair is two different players');
select throws_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000003', 5, 5,
       p_partner_name => 'Corto', p_partner_phone => '123') $$,
  'P0001', 'invalid_phone', 'a phone has 8 to 15 digits');
select throws_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000003', 5, 5,
       p_partner_profile_id => '00000000-0000-0000-0000-0000000000f1') $$,
  'P0001', 'partner_not_member', 'a partner picked as a member is one');
select throws_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000004', 5, 5,
       p_partner_name => 'Pedro', p_partner_phone => '099111001') $$,
  'P0001', 'championship_closed', 'nobody signs up after the deadline');
select is(test_helpers.notices('00000000-0000-0000-0000-0000000000a5', 'championship_added'), 1,
  'the member partner gets an aviso');
select is(test_helpers.last_notice('00000000-0000-0000-0000-0000000000a5', 'championship_added') ->> 'partner_name',
  'Ana', 'that says with whom');
select is(test_helpers.notices('00000000-0000-0000-0000-0000000000a1', 'championship_added'), 0,
  'whoever signed up gets none');

-- Gabi
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';

select lives_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000001', 5, 4,
       p_partner_profile_id => '00000000-0000-0000-0000-0000000000a3') $$,
  'a pair signs up to a full category');
select is(
  test_helpers.entry_status((select id from public.championship_entries
    where category_id = 'c2a00000-0000-0000-0000-000000000001'
      and player1_id = 'c4a00000-0000-0000-0000-0000000000a2')),
  'waiting', 'and waits in line');
select is(test_helpers.last_notice('00000000-0000-0000-0000-0000000000a3', 'championship_added') ->> 'waiting',
  'true', 'the partner''s aviso says they are waiting');

-- Iván
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a4", "role": "authenticated"}';

select lives_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000002', 5, 5,
       p_partner_name => 'Otro nombre', p_partner_phone => '099 111 001') $$,
  'a member signs up with a phone that is already a player');
select results_eq(
  $$ select player2_id from public.championship_entries
     where category_id = 'c2a00000-0000-0000-0000-000000000002'
       and player1_id = 'c4a00000-0000-0000-0000-0000000000a4' $$,
  $$ values ('c4a00000-0000-0000-0000-000000000f01'::uuid) $$,
  'a phone is one player: Pedro');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';

select throws_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000002', 5, 5,
       p_partner_name => 'Alguien', p_partner_phone => '099777888') $$,
  'P0001', 'forbidden', 'only members sign up');

-- Bruno
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select throws_ok(
  $$ select public.withdraw_championship_entry((select id from public.championship_entries
       where category_id = 'c2a00000-0000-0000-0000-000000000002'
         and player1_id = 'c4a00000-0000-0000-0000-0000000000a1')) $$,
  'P0001', 'forbidden', 'a player withdraws only her own pairs');

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.withdraw_championship_entry((select id from public.championship_entries
       where category_id = 'c2a00000-0000-0000-0000-000000000001'
         and player1_id = 'c4a00000-0000-0000-0000-0000000000a1')) $$,
  'a player withdraws before the deadline');
select is(
  test_helpers.entry_status((select id from public.championship_entries
    where category_id = 'c2a00000-0000-0000-0000-000000000001'
      and player1_id = 'c4a00000-0000-0000-0000-0000000000a1')),
  'withdrawn', 'her pair is out');
select is(
  test_helpers.entry_status((select id from public.championship_entries
    where category_id = 'c2a00000-0000-0000-0000-000000000001'
      and player1_id = 'c4a00000-0000-0000-0000-0000000000a2')),
  'active', 'and the first in line gets in');
select is(
  test_helpers.notices('00000000-0000-0000-0000-0000000000a2', 'championship_promoted')
    + test_helpers.notices('00000000-0000-0000-0000-0000000000a3', 'championship_promoted'),
  2, 'both of them get an aviso');

-- Juli
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';

select throws_ok(
  $$ select public.withdraw_championship_entry('c3a00000-0000-0000-0000-000000000004') $$,
  'P0001', 'championship_closed', 'after the deadline only the organizer takes a pair out');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.remove_championship_entry('c3a00000-0000-0000-0000-000000000004') $$,
  'staff take a pair out after the deadline');
select lives_ok(
  $$ select public.add_championship_pair('c2a00000-0000-0000-0000-000000000001', 5, 5,
       p_player1_name => 'Marta', p_player1_phone => '099111003',
       p_player2_name => 'Tomás', p_player2_phone => '099555666') $$,
  'staff load a whole pair from outside');
select is(
  test_helpers.entry_status((select id from public.championship_entries
    where category_id = 'c2a00000-0000-0000-0000-000000000001'
      and player1_id = 'c4a00000-0000-0000-0000-000000000f03')),
  'waiting', 'it waits: the category is full again');
select lives_ok(
  $$ select public.move_championship_entry((select id from public.championship_entries
       where player1_id = 'c4a00000-0000-0000-0000-000000000f03'), 'c2a00000-0000-0000-0000-000000000003') $$,
  'staff move a pair to another category');
select results_eq(
  $$ select category_id, status::text from public.championship_entries
     where player1_id = 'c4a00000-0000-0000-0000-000000000f03' $$,
  $$ values ('c2a00000-0000-0000-0000-000000000003'::uuid, 'active') $$,
  'with a place there');
select lives_ok(
  $$ select public.move_championship_entry((select id from public.championship_entries
       where player1_id = 'c4a00000-0000-0000-0000-0000000000a2'), 'c2a00000-0000-0000-0000-000000000002') $$,
  'a pair of members moves too');
select is(test_helpers.notices('00000000-0000-0000-0000-0000000000a2', 'championship_moved'), 1,
  'and its members get an aviso');
select throws_ok(
  $$ select public.move_championship_entry((select id from public.championship_entries
       where player1_id = 'c4a00000-0000-0000-0000-0000000000a2'), 'c2a00000-0000-0000-0000-000000000002') $$,
  'P0001', 'invalid_state', 'nobody moves to the category they are in');
select throws_ok(
  $$ select public.remove_championship_entry('c3a00000-0000-0000-0000-000000000005') $$,
  'P0001', 'invalid_state', 'nothing changes once the draw is done');

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.add_championship_pair('c2a00000-0000-0000-0000-000000000003', 5, 5,
       p_player1_name => 'Nico', p_player1_phone => '099111004',
       p_player2_name => 'Olga', p_player2_phone => '099111005') $$,
  'P0001', 'forbidden', 'a player loads no whole pairs');

select * from finish();
rollback;
