begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(9);

-- M1: a week from today at 20:00, court 1, Ana on spot 1. M2: confirmed, nobody else gets in.
call test_helpers.make_match('e2000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(7, '20:00', 90), array['00000000-0000-0000-0000-0000000000a1', null, null, null]::uuid[]);
call test_helpers.make_match('e2000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(8, '20:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4']::uuid[]);
call test_helpers.hold_court('e2000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002');

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select is(
  public.invite_to_match('e2000000-0000-0000-0000-000000000001',
    array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-0000000000f1']::uuid[]),
  2, 'invites members not in the match yet, once each (Ana plays, Omar is not a member)');
select is(
  public.invite_to_match('e2000000-0000-0000-0000-000000000001',
    array['00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3']::uuid[]),
  1, 'never twice to the same match');
select is(
  (select count(*)::int from public.match_invites where invited_by = '00000000-0000-0000-0000-0000000000c1'),
  3, 'staff read the club''s invitations, with who sent them');
select throws_ok(
  $$ select public.invite_to_match('e2000000-0000-0000-0000-000000000002',
       array['00000000-0000-0000-0000-0000000000a2']::uuid[]) $$,
  'P0001', 'match_closed', 'only a match that is still forming');
select throws_ok(
  $$ select public.invite_to_match('e2000000-0000-0000-0000-00000000dead',
       array['00000000-0000-0000-0000-0000000000a2']::uuid[]) $$,
  'P0001', 'not_found', 'the match has to exist');

-- Bruno, a player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$ select public.invite_to_match('e2000000-0000-0000-0000-000000000001',
       array['00000000-0000-0000-0000-0000000000a5']::uuid[]) $$,
  'P0001', 'forbidden', 'only staff invite');
select is_empty($$ select * from public.match_invites $$, 'players do not read the invitations');

reset role;
select results_eq(
  $$ select user_id, data->>'court_name', data->>'match_type', (data->>'category_min')::int, link
     from public.notifications where kind = 'match_invite' order by user_id $$,
  $$ values ('00000000-0000-0000-0000-0000000000a2'::uuid, 'Cancha 1', 'mixed', 1,
             '/partidos/e2000000-0000-0000-0000-000000000001'),
            ('00000000-0000-0000-0000-0000000000a3'::uuid, 'Cancha 1', 'mixed', 1,
             '/partidos/e2000000-0000-0000-0000-000000000001'),
            ('00000000-0000-0000-0000-0000000000b1'::uuid, 'Cancha 1', 'mixed', 1,
             '/partidos/e2000000-0000-0000-0000-000000000001') $$,
  'each new guest gets one aviso with the court, the type, the range and the link to the match');
select ok(not has_function_privilege('anon', 'public.invite_to_match(uuid, uuid[])', 'execute'),
  'anon cannot invite');

select * from finish();
rollback;
