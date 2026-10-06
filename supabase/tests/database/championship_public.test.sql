begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(14);

-- C1 is published at campeonato-t-ab12: 'Libre' with Ana and Pedro (a desk note on them) and Bruno and Lucía,
-- their match played; Gabi and Marta wait. C2 is a draft, C3 was cancelled, C4 was drawn but not published.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001', 'published');
update public.championships set public_code = 'campeonato-t-ab12' where id = 'c1a00000-0000-0000-0000-000000000001';
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03', 'waiting');
update public.championship_entries set note = 'Nota secreta' where id = 'c3a00000-0000-0000-0000-000000000001';
call test_helpers.make_group('c5a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'Zona A', array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002']::uuid[]);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001', p_court => 'c0000000-0000-0000-0000-000000000001',
  p_starts => test_helpers.at(10, '08:00'));
call test_helpers.finish_cmatch('c6a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000001');
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000002', 'draft', null);
update public.championships set public_code = 'borrador-t-cd34' where id = 'c1a00000-0000-0000-0000-000000000002';
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000003', 'cancelled');
update public.championships set public_code = 'cancelado-t-ef56' where id = 'c1a00000-0000-0000-0000-000000000003';
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000004', 'drawn');
update public.championships set public_code = 'sorteado-t-0a1b' where id = 'c1a00000-0000-0000-0000-000000000004';
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000004', 'c1a00000-0000-0000-0000-000000000004');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000004',
  'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-000000000f04');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000004',
  'c4a00000-0000-0000-0000-0000000000a4', 'c4a00000-0000-0000-0000-000000000f05');
call test_helpers.make_group('c5a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000004',
  'Zona A', array['c3a00000-0000-0000-0000-000000000004', 'c3a00000-0000-0000-0000-000000000005']::uuid[]);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000004',
  'c3a00000-0000-0000-0000-000000000004', 'c3a00000-0000-0000-0000-000000000005',
  p_group_id => 'c5a00000-0000-0000-0000-000000000004');

-- Someone with the link and no session.
set local role anon;

select ok(public.public_championship('campeonato-t-ab12') is not null,
  'anyone with the link reads a published championship');
select is(public.public_championship('campeonato-t-ab12') -> 'championship' ->> 'name', 'Campeonato T', 'its name');
select is(jsonb_array_length(public.public_championship('campeonato-t-ab12') -> 'categories' -> 0 -> 'entries'), 2,
  'the pairs with a place, not the ones waiting');
select is(jsonb_array_length(public.public_championship('campeonato-t-ab12') -> 'matches' -> 0 -> 'sets'), 2,
  'the matches with their sets');
select is(public.public_championship('campeonato-t-ab12') -> 'groups' -> 0 ->> 'name', 'Zona A', 'and the groups');
select is(position('099111001' in public.public_championship('campeonato-t-ab12')::text), 0, 'no phones');
select is(position('00000000-0000-0000-0000-0000000000a1' in public.public_championship('campeonato-t-ab12')::text),
  0, 'no profile ids');
select is(position('Nota secreta' in public.public_championship('campeonato-t-ab12')::text), 0, 'no notes');
select ok(public.public_championship('borrador-t-cd34') is null, 'nothing of a draft');
select ok(public.public_championship('cancelado-t-ef56') is null, 'nothing of a cancelled championship');
select is(jsonb_array_length(public.public_championship('sorteado-t-0a1b') -> 'matches'), 0,
  'no fixture before it is published');
select ok(public.public_championship('no-existe') is null, 'nothing for a code nobody has');
select throws_ok($$ select count(*) from public.championships $$, '42501', null, 'and no table');

-- Ana, a member
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select ok(public.public_championship('campeonato-t-ab12') is not null, 'members read it too');

select * from finish();
rollback;
