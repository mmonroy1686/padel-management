begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(10);

-- C1 open; K1 'Libre'. Ana and Pedro are in, with a note from the desk and their own note on the hours.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
update public.championship_entries set note = 'Paga el viernes', unavailability_note = 'Ana trabaja hasta las 18'
 where id = 'c3a00000-0000-0000-0000-000000000001';

-- A phone without its leading 0 is the same player.
select is(private.normalize_phone('99 222 333'), '099222333', 'a mobile number without its 0 gets it');
select is(private.normalize_phone('+598 99 222 333'), private.normalize_phone('99222333'),
  'with or without the country code, one phone');

set local role authenticated;

-- Bruno, another member: the pairs, yes; their notes, no.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select lives_ok($$ select id, status from public.championship_entries $$, 'members read the pairs');
select throws_ok($$ select note from public.championship_entries $$, '42501', null,
  'but not the desk''s note through the API');
select throws_ok($$ select unavailability_note from public.championship_entries $$, '42501', null,
  'nor the pair''s note on its hours');
select is_empty($$ select * from public.championship_entry_notes('c1a00000-0000-0000-0000-000000000001') $$,
  'and the notes function gives him nothing');

-- Ana reads her pair's notes.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select results_eq(
  $$ select entry_id, unavailability_note from public.championship_entry_notes('c1a00000-0000-0000-0000-000000000001') $$,
  $$ values ('c3a00000-0000-0000-0000-000000000001'::uuid, 'Ana trabaja hasta las 18') $$,
  'the pair reads its own notes');

-- Carla, reception, reads them all.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select results_eq(
  $$ select note from public.championship_entry_notes('c1a00000-0000-0000-0000-000000000001') $$,
  $$ values ('Paga el viernes') $$,
  'staff read every note');

-- Eva, admin of another club: staff, but not of this club.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok($$ select public.close_championship_registration('c1a00000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'staff of another club cannot manage this championship');
reset role;

select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in ('category_active_count', 'championship_blocks', 'championship_entry_due',
                         'championship_notice_data', 'championship_starts_at', 'end_championship_entry',
                         'entry_payable', 'fill_category', 'in_category', 'insert_championship_entry',
                         'lock_championship', 'move_entry', 'normalize_phone', 'notify_championship_entry',
                         'pair_player', 'player_for_phone', 'player_for_profile', 'staff_championship',
                         'window_period')
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot execute the championship helpers');

select * from finish();
rollback;
