begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(6);

-- Ana (drive) and Gabi and Hugo in team B: one backhand missing in team A.
call test_helpers.make_match('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(2, '20:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', null, '00000000-0000-0000-0000-0000000000a2',
        '00000000-0000-0000-0000-0000000000a3']::uuid[]);
-- Only Ana: three missing.
call test_helpers.make_match('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(3, '18:30', 90),
  array['00000000-0000-0000-0000-0000000000a1', null, null, null]::uuid[]);
-- Cancelled by the club.
call test_helpers.make_match('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(4, '20:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', null, null, null]::uuid[]);
update public.open_matches set status = 'cancelled', cancel_reason = 'by_club', cancelled_at = now()
 where id = 'd0000000-0000-0000-0000-000000000003';

-- WhatsApp, without a session
set local role anon;
select is(
  public.match_preview('d0000000-0000-0000-0000-000000000001'),
  jsonb_build_object('starts_at', test_helpers.at(2, '20:00'), 'open_sides', '["backhand"]'::jsonb),
  'anon reads when the match starts and the side that is missing');
select is(
  public.match_preview('d0000000-0000-0000-0000-000000000002') -> 'open_sides',
  '["backhand", "drive", "backhand"]'::jsonb,
  'every free spot, in order');
select ok(
  position('Ana' in public.match_preview('d0000000-0000-0000-0000-000000000001')::text) = 0
    and position('Cancha' in public.match_preview('d0000000-0000-0000-0000-000000000001')::text) = 0,
  'no names and no court');
select is(public.match_preview('d0000000-0000-0000-0000-000000000003'), null, 'nothing for a cancelled match');
select is(public.match_preview('d0000000-0000-0000-0000-0000000000ff'), null, 'nor for one that does not exist');
reset role;

-- Still ahead only: the same match, moved to yesterday.
update public.open_matches set period = test_helpers.slot(-1, '20:00', 90)
 where id = 'd0000000-0000-0000-0000-000000000001';
select is(public.match_preview('d0000000-0000-0000-0000-000000000001'), null, 'nor for one already played');

select * from finish();
rollback;
