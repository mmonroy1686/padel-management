---
feature: asistente-del-club
type: plan
status: done
date: 2026-11-23
branch: feat/asistente-del-club
references: ./design.md
---

# Asistente del club Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/team-setup:execute` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user asked to run every task without stopping for confirmation between them.

**Goal:** A guided screen for reception and admin (`/club/asistente`) that shows a day's free slots, proposes where a match is worth building from the players' habits, creates that match with its four spots free, invites the suggested players (aviso, mail and WhatsApp), and makes the "Turnos libres" flyer (1080×1920 image + text).

**Architecture:** Rules only, no AI. The database answers who could play a slot (`slot_candidates`), creates a staff match (`staff_create_match`) and records invitations with their aviso (`invite_to_match` + `match_invites`). Pure, tested logic in `lib/domain/slot-planner.ts` (proposal, candidates), `lib/domain/assistant-board.ts` (board, recommendations) and `lib/domain/free-slots-flyer.ts` (flyer). The page reads with `lib/data/assistant.ts` (reuses `loadDayGrid`), the flyer image is a route handler with `next/og`.

**Tech Stack:** Next.js 16 (App Router, Server Actions, `next/og` ImageResponse), Supabase Postgres (security definer RPCs, RLS, pgTAP), Vitest + Testing Library, Playwright.

---

## Implementation decisions (on top of design.md)

These follow the design's intent; they settle details the design left open. Record them in `notes.md` in Task 25.

1. **The invite list comes from `candidatesFor` (the `slot_candidates` rows), not `match_suggestions`.** `match_suggestions` stops at 6 and needs a spot fit; the sheet already has the scored rows for the chosen range and type, and "Invitar a los mejores 8" needs more than 6.
2. **`slot_candidates` only returns members with a reason** (`times_played > 0 or usually_free`) and a category. It keeps the ~40 calls per day light; nobody without a reason is a useful candidate.
3. **`flyerLayout(grid)` drops past times** (the grid already knows them), so a flyer cell is `free`, `taken` or `none`; there is no `past` state.
4. **`match_invites` also stores `club_id`**, like every other table, so its RLS reads `private.has_club_role(club_id, …)`.
5. **`clubs.phone` is checked with `^[0-9]{8,15}$`**; the app normalizes with `normalizePhone` (same rules as `private.normalize_phone`).
6. **A free slot past the match closing time** still shows as free on the board (people can still book it) but cannot be tapped to build a match.
7. **The board logic lives in `lib/domain/assistant-board.ts`** (board, buildable slots, recommendations) so `slot-planner.ts` stays about one slot's candidates.
8. **The e2e test taps the board cell**, not a recommendation: recommendations depend on every member in the shared e2e database.
9. **The tab "Asistente"** goes right after "Grilla", with the existing `racket` icon.

## File map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20261123000100_match_invite_kind.sql` | Adds `match_invite` to `notification_kind` (alone: enum values cannot be used in the transaction that adds them). |
| `supabase/migrations/20261123000110_club_phone.sql` | `clubs.phone`. |
| `supabase/migrations/20261123000120_slot_candidates.sql` | `public.slot_candidates(court, starts_at)`. |
| `supabase/migrations/20261123000130_staff_create_match.sql` | `public.staff_create_match(...)`. |
| `supabase/migrations/20261123000140_match_invites.sql` | `public.match_invites` + `public.invite_to_match(...)`. |
| `supabase/tests/database/assistant_schema.test.sql`, `slot_candidates.test.sql`, `staff_create_match.test.sql`, `invite_to_match.test.sql` | pgTAP. |
| `lib/supabase/database.types.ts` | Regenerated. |
| `lib/domain/format.ts` | + `shortDate`, `formatPhone`, `capitalize`. |
| `lib/domain/matches.ts` | + `categorySlashLabel`. |
| `lib/domain/match-invite-notifications.ts` | The `match_invite` aviso: read its data, its words, `matchLine`. |
| `lib/domain/notifications.ts` | Knows `match_invite`. |
| `lib/domain/slot-planner.ts` | `CandidateRow`, `propose`, `candidatesFor`, `sideWarning`, `demandText`. |
| `lib/domain/assistant-board.ts` | `BoardSlot`, `boardOf`, `buildableSlots`, `recommendedSlots`, `recommendationText`. |
| `lib/domain/free-slots-flyer.ts` | `flyerLayout`, `flyerText`, `flyerDayText`, `flyerContact`, `hasFreeSlots`. |
| `lib/brand/brand-images.tsx` | Exports `Mark`. |
| `lib/brand/free-slots-image.tsx` | The 1080×1920 ImageResponse. |
| `app/(club)/club/asistente/flyer/route.ts` | GET the flyer image (staff only). |
| `lib/domain/settings.ts`, `app/(club)/club/ajustes/actions.ts`, `app/(club)/club/ajustes/page.tsx` | "WhatsApp del club". |
| `lib/club/tabs.ts` | Tab "Asistente". |
| `lib/actions/result.ts` | + `CreatedState`, `InviteResult`, `CreateMatchAction`, `InviteAction`. |
| `app/(club)/club/asistente/actions.ts` | `createStaffMatch`, `inviteToMatch`. |
| `lib/data/assistant.ts` | `loadAssistantDay`. |
| `components/assistant/reason-chips.tsx`, `free-board.tsx`, `recommended-slots.tsx`, `invite-list.tsx`, `build-match-sheet.tsx`, `flyer-share.tsx`, `assistant-screen.tsx` | UI. |
| `app/(club)/club/asistente/page.tsx` | The screen. |
| `tests/unit/fixtures/assistant.ts` | Candidate rows and board slots for tests. |
| `tests/e2e/support/assistant.ts`, `tests/e2e/club-assistant.spec.ts` | E2E. |

---

### Task 0: Preflight

- [ ] **Step 1: Check the branch and the local stack**

Run: `git branch --show-current` → Expected: `feat/asistente-del-club`
Run: `npx supabase status` → Expected: the local stack is running (if not: `npx supabase start`).

- [ ] **Step 2: Read the Next docs this plan uses**

Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/image-response.md` and `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`. Only flexbox and inline styles work in `ImageResponse`; a route handler exports `GET(request: Request)`.

---

### Task 1: The `match_invite` aviso kind and `clubs.phone`

**Files:**
- Create: `supabase/migrations/20261123000100_match_invite_kind.sql`
- Create: `supabase/migrations/20261123000110_club_phone.sql`
- Test: `supabase/tests/database/assistant_schema.test.sql`

- [ ] **Step 1: Write the failing test**

`supabase/tests/database/assistant_schema.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(5);

select ok('match_invite' = any (enum_range(null::public.notification_kind)::text[]),
  'an invitation to a match is one more aviso');
select ok((select phone from public.clubs where id = 'a0000000-0000-0000-0000-000000000001') is null,
  'a club starts without a WhatsApp');
select lives_ok(
  $$ update public.clubs set phone = '092369558' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  'the WhatsApp is stored as digits');
select throws_ok(
  $$ update public.clubs set phone = '092 369 558' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'never with spaces or signs');
select throws_ok(
  $$ update public.clubs set phone = '1234' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'and with 8 to 15 digits');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx supabase test db supabase/tests/database/assistant_schema.test.sql`
Expected: FAIL (`column "phone" does not exist` / the enum check fails).

- [ ] **Step 3: Write the migrations**

`supabase/migrations/20261123000100_match_invite_kind.sql`:

```sql
-- Asistente del club, part 0: "te invitan a un partido" goes through the same outbox as the other avisos.
-- Alone in its file: Postgres does not let a transaction use an enum value it just added, and the CLI runs each
-- migration in one transaction.
alter type public.notification_kind add value 'match_invite';
```

`supabase/migrations/20261123000110_club_phone.sql`:

```sql
-- Asistente del club, part 1: the club's WhatsApp, for the free-slots flyer and its text. Digits only, the way
-- private.normalize_phone writes them (lib/domain/championships.ts normalizePhone does the same in the app).
-- Admins edit it in Ajustes, like the name (the clubs update policy already limits it to them).
alter table public.clubs
  add column phone text constraint clubs_phone_digits check (phone ~ '^[0-9]{8,15}$');
```

- [ ] **Step 4: Apply and run the test**

Run: `npx supabase migration up`
Run: `npx supabase test db supabase/tests/database/assistant_schema.test.sql`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261123000100_match_invite_kind.sql supabase/migrations/20261123000110_club_phone.sql supabase/tests/database/assistant_schema.test.sql
git commit -m "feat(asistente): the club's WhatsApp and the match invitation aviso kind"
```

---

### Task 2: `slot_candidates` — who could play a free slot

**Files:**
- Create: `supabase/migrations/20261123000120_slot_candidates.sql`
- Test: `supabase/tests/database/slot_candidates.test.sql`

- [ ] **Step 1: Write the failing test**

`supabase/tests/database/slot_candidates.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(6);

-- The slot: a week from today at 20:00 (same weekday as today), court 1.
-- Bruno is usually free that weekday at night.
insert into public.player_availability (user_id, weekday, band)
values ('00000000-0000-0000-0000-0000000000b1', extract(dow from test_helpers.today())::smallint, 'night');
-- Hugo played that weekday at 20:00 a week ago (counts) and at 21:30 two weeks ago (90 minutes off: does not),
-- and prefers court 1.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(-7, '20:00', 90), '00000000-0000-0000-0000-0000000000a3');
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(-14, '21:30', 90), '00000000-0000-0000-0000-0000000000a3');
insert into public.player_preferred_courts (user_id, court_id)
values ('00000000-0000-0000-0000-0000000000a3', 'c0000000-0000-0000-0000-000000000001');
-- Gabi played a confirmed match that weekday at 20:00 a week ago.
call test_helpers.make_match('e3000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(-7, '20:00', 90), array['00000000-0000-0000-0000-0000000000a2', null, null, null]::uuid[]);
call test_helpers.hold_court('e3000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001');
-- Iván is usually free then too, but he has a booking at that time.
insert into public.player_availability (user_id, weekday, band)
values ('00000000-0000-0000-0000-0000000000a4', extract(dow from test_helpers.today())::smallint, 'night');
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(7, '20:00', 90), '00000000-0000-0000-0000-0000000000a4');
-- Juli is usually free then too, but her profile is private.
update public.profiles set is_public = false where id = '00000000-0000-0000-0000-0000000000a5';
insert into public.player_availability (user_id, weekday, band)
values ('00000000-0000-0000-0000-0000000000a5', extract(dow from test_helpers.today())::smallint, 'night');
-- Ana has no reason to be there. Carla and Dani (staff) have no category.

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select results_eq(
  $$ select display_name, category::int, side::text, gender::text, times_played, usually_free, prefers_court, score
     from public.slot_candidates('c0000000-0000-0000-0000-000000000001', test_helpers.at(7, '20:00')) $$,
  $$ values ('Bruno', 6, 'backhand', 'male', 0, true, false, 20),
            ('Hugo', 4, 'drive', 'male', 1, false, true, 13),
            ('Gabi', 5, 'both', 'female', 1, false, false, 5) $$,
  'free members with a reason, best first; never the busy, the private or the ones without a reason');
select throws_ok(
  $$ select * from public.slot_candidates('c0000000-0000-0000-0000-000000000001', test_helpers.at(7, '20:15')) $$,
  'P0001', 'not_aligned', 'only a slot of the grid');
select throws_ok(
  $$ select * from public.slot_candidates('c0000000-0000-0000-0000-00000000dead', test_helpers.at(7, '20:00')) $$,
  'P0001', 'not_found', 'only an active court');

-- Ana, a player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select * from public.slot_candidates('c0000000-0000-0000-0000-000000000001', test_helpers.at(7, '20:00')) $$,
  'P0001', 'forbidden', 'only staff look at who could play');

reset role;
select ok(not has_function_privilege('anon', 'public.slot_candidates(uuid, timestamptz)', 'execute'),
  'anon cannot ask');
select is(
  (select proargnames from pg_proc where proname = 'slot_candidates'),
  array['p_court_id', 'p_starts_at', 'player_id', 'display_name', 'category', 'side', 'gender', 'times_played',
        'usually_free', 'prefers_court', 'score'],
  'the answer carries names and reasons, never the availability or history rows');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx supabase test db supabase/tests/database/slot_candidates.test.sql`
Expected: FAIL (`function public.slot_candidates(...) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261123000120_slot_candidates.sql`:

```sql
-- Asistente del club, part 2: who could play a free slot that has no match yet. Staff only. Like
-- match_suggestions, without a spot: members with a category and a public profile, free at that time, who played
-- that weekday within 30 minutes of that time (bookings and confirmed matches already played) or said they are
-- usually free in that band. Same weights as match_suggestions minus the side (there is no spot yet).
-- lib/domain/slot-planner.ts turns the rows into a proposal; lib/data/assistant.ts calls it once per free slot.
create function public.slot_candidates(p_court_id uuid, p_starts_at timestamptz)
returns table (
  player_id uuid,
  display_name text,
  category smallint,
  side public.player_side,
  gender public.gender,
  times_played integer,
  usually_free boolean,
  prefers_court boolean,
  score integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_club_id uuid := private.active_court_club(p_court_id);
  v_timezone text;
  v_period tstzrange;
  v_local timestamp;
  v_band public.day_band;
begin
  if not private.is_staff(v_club_id) then
    perform private.fail('forbidden');
  end if;
  select timezone into v_timezone from public.clubs where id = v_club_id;
  v_period := private.slot_period(v_club_id, p_starts_at);
  v_local := lower(v_period) at time zone v_timezone;
  v_band := private.day_band_of(v_local::time);

  return query
  with members as (
    select p.id, p.display_name, m.category, p.side, p.gender
    from public.club_members m
    join public.profiles p on p.id = m.user_id
    where m.club_id = v_club_id
      and m.category is not null
      and p.is_public
      and not private.is_busy(p.id, v_period)
  ),
  played as (
    select b.player_id as id, b.starts_at
    from public.bookings b
    where b.club_id = v_club_id and b.status = 'confirmed' and b.starts_at < now() and b.player_id is not null
    union all
    select s.player_id, om.starts_at
    from public.match_slots s
    join public.open_matches om on om.id = s.match_id
    where om.club_id = v_club_id and om.status = 'confirmed' and om.starts_at < now() and s.player_id is not null
  ),
  scored as (
    select mb.id, mb.display_name, mb.category, mb.side, mb.gender,
      (select count(*) from played g
        where g.id = mb.id
          and extract(dow from g.starts_at at time zone v_timezone) = extract(dow from v_local)
          and abs(extract(epoch from ((g.starts_at at time zone v_timezone)::time - v_local::time))) <= 1800
      )::integer as times_played,
      exists (
        select 1 from public.player_availability a
        where a.user_id = mb.id and a.weekday = extract(dow from v_local)::smallint and a.band = v_band
      ) as usually_free,
      exists (
        select 1 from public.player_preferred_courts pc
        where pc.user_id = mb.id and pc.court_id = p_court_id
      ) as prefers_court
    from members mb
  )
  select s.id, s.display_name, s.category, s.side, s.gender, s.times_played, s.usually_free, s.prefers_court,
         (least(25, s.times_played * 5)
          + case when s.usually_free then 20 else 0 end
          + case when s.prefers_court then 8 else 0 end)::integer
  from scored s
  where s.times_played > 0 or s.usually_free
  order by 9 desc, s.display_name;
end;
$$;

revoke execute on function public.slot_candidates(uuid, timestamptz) from public, anon;
grant execute on function public.slot_candidates(uuid, timestamptz) to authenticated;
```

- [ ] **Step 4: Apply and run the test**

Run: `npx supabase migration up`
Run: `npx supabase test db supabase/tests/database/slot_candidates.test.sql`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261123000120_slot_candidates.sql supabase/tests/database/slot_candidates.test.sql
git commit -m "feat(asistente): slot_candidates, who usually plays a free slot"
```

---

### Task 3: `staff_create_match` — a match with its four spots free

**Files:**
- Create: `supabase/migrations/20261123000130_staff_create_match.sql`
- Test: `supabase/tests/database/staff_create_match.test.sql`

- [ ] **Step 1: Write the failing test**

`supabase/tests/database/staff_create_match.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(11);

-- Court 2 is booked in 8 days at 20:00.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(8, '20:00', 90), '00000000-0000-0000-0000-0000000000b1');

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.staff_create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(7, '20:00'), true,
       5, 6, 'mixed') $$,
  'reception creates a match');
select throws_ok(
  $$ select public.staff_create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(-1, '20:00'), true,
       5, 6, 'mixed') $$,
  'P0001', 'in_the_past', 'not in the past');
select throws_ok(
  $$ select public.staff_create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(20, '20:00'), true,
       5, 6, 'mixed') $$,
  'P0001', 'outside_window', 'not past the booking window');
select throws_ok(
  $$ select public.staff_create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(7, '21:30'), true,
       6, 5, 'mixed') $$,
  'P0001', 'invalid_input', 'the range goes from low to high');
select throws_ok(
  $$ select public.staff_create_match('c0000000-0000-0000-0000-000000000002', test_helpers.at(8, '20:00'), false,
       1, 8, 'mixed') $$,
  'P0001', 'slot_taken', 'not on a taken court when it cannot move');

reset role;
select results_eq(
  $$ select status::text, created_by, category_min::int, category_max::int, match_type::text, preferred_court_id
     from public.open_matches where id = test_helpers.match_at(7, '20:00') $$,
  $$ values ('forming', '00000000-0000-0000-0000-0000000000c1'::uuid, 5, 6, 'mixed',
             'c0000000-0000-0000-0000-000000000001'::uuid) $$,
  'a forming match, created by the staff member');
select is(
  (select count(*)::int from public.match_slots where match_id = test_helpers.match_at(7, '20:00') and player_id is null),
  4, 'with its four spots free');

-- Past its closing time a match cannot be created.
update public.clubs set match_close_hours = 48 where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok(
  $$ select public.staff_create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(1, '20:00'), true,
       5, 6, 'mixed') $$,
  'P0001', 'match_closed', 'not past its closing time');
reset role;
update public.clubs set match_close_hours = 3 where id = 'a0000000-0000-0000-0000-000000000001';

-- Without a price the slot cannot be played.
delete from public.pricing_rules where club_id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok(
  $$ select public.staff_create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(9, '20:00'), true,
       5, 6, 'mixed') $$,
  'P0001', 'no_price', 'not on a slot without a price');

-- Ana, a player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.staff_create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(10, '20:00'), true,
       5, 6, 'mixed') $$,
  'P0001', 'forbidden', 'players create their matches with create_match');

reset role;
select ok(not has_function_privilege('anon',
  'public.staff_create_match(uuid, timestamptz, boolean, integer, integer, public.match_type)', 'execute'),
  'anon cannot create matches');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx supabase test db supabase/tests/database/staff_create_match.test.sql`
Expected: FAIL (`function public.staff_create_match(...) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261123000130_staff_create_match.sql`:

```sql
-- Asistente del club, part 3: reception or admin open a match on a free slot, with its four spots free, and then
-- invite players to it (invite_to_match). Same rules as create_match except the ones about the creator playing
-- (fit, busy): the staff member does not take a spot. created_by is the staff member. Nothing else reads
-- created_by as "a player of the match": leaving, the avisos and "Mis partidos" all go by match_slots.
create function public.staff_create_match(
  p_court_id uuid,
  p_starts_at timestamptz,
  p_allow_other_court boolean,
  p_category_min integer,
  p_category_max integer,
  p_match_type public.match_type
)
returns public.open_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_club_id uuid := private.active_court_club(p_court_id);
  v_club public.clubs;
  v_match public.open_matches;
begin
  if v_uid is null or not private.is_staff(v_club_id) then
    perform private.fail('forbidden');
  end if;
  if p_allow_other_court is null or p_match_type is null
     or p_category_min is null or p_category_max is null
     or p_category_min not between 1 and 8 or p_category_max not between 1 and 8
     or p_category_min > p_category_max then
    perform private.fail('invalid_input');
  end if;
  select * into v_club from public.clubs where id = v_club_id;

  v_match.id := gen_random_uuid();
  v_match.club_id := v_club_id;
  v_match.period := private.slot_period(v_club_id, p_starts_at);
  v_match.preferred_court_id := p_court_id;
  v_match.allow_other_court := p_allow_other_court;
  v_match.category_min := p_category_min;
  v_match.category_max := p_category_max;
  v_match.match_type := p_match_type;

  if lower(v_match.period) <= now() then
    perform private.fail('in_the_past');
  end if;
  if lower(v_match.period) > now() + make_interval(days => v_club.booking_window_days) then
    perform private.fail('outside_window');
  end if;
  if now() >= private.match_closes_at(v_match) then
    perform private.fail('match_closed');
  end if;
  if private.slot_price(v_club_id, lower(v_match.period)) is null then
    perform private.fail('no_price');
  end if;
  if not p_allow_other_court and exists (
    select 1 from public.court_occupancy o where o.court_id = p_court_id and o.period && v_match.period
  ) then
    perform private.fail('slot_taken');
  end if;

  insert into public.open_matches (id, club_id, period, preferred_court_id, allow_other_court, category_min,
                                   category_max, match_type, created_by)
  values (v_match.id, v_club_id, v_match.period, p_court_id, p_allow_other_court, p_category_min, p_category_max,
          p_match_type, v_uid)
  returning * into v_match;

  insert into public.match_slots (match_id, club_id, position, team, side, player_id, joined_at)
  select v_match.id, v_club_id, pos, case when pos <= 2 then 'A' else 'B' end,
         (case when pos % 2 = 1 then 'drive' else 'backhand' end)::public.player_side, null, null
  from generate_series(1, 4) as pos;

  return v_match;
end;
$$;

revoke execute on function public.staff_create_match(uuid, timestamptz, boolean, integer, integer,
  public.match_type) from public, anon;
grant execute on function public.staff_create_match(uuid, timestamptz, boolean, integer, integer,
  public.match_type) to authenticated;
```

- [ ] **Step 4: Apply and run the test**

Run: `npx supabase migration up`
Run: `npx supabase test db supabase/tests/database/staff_create_match.test.sql`
Expected: PASS (11 tests).

- [ ] **Step 5: Check that nothing assumes the creator plays**

Run: `git grep -n "created_by" -- lib app components | grep -v database.types`
Expected: no line reads `open_matches.created_by` (the app never uses it).
Run: `git grep -n "created_by" -- supabase/migrations | grep -i "open_matches\|v_match.created_by\|m.created_by"`
Expected: only the inserts in `create_match` / `staff_create_match` and the column definition. `leave_match`, `free_match_slot`, `close_matches` and `loadPlayerContext` go by `match_slots`. If a line does read it as a player, stop and fix it before going on.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261123000130_staff_create_match.sql supabase/tests/database/staff_create_match.test.sql
git commit -m "feat(asistente): staff_create_match, a match with its four spots free"
```

---

### Task 4: `match_invites` and `invite_to_match`

**Files:**
- Create: `supabase/migrations/20261123000140_match_invites.sql`
- Test: `supabase/tests/database/invite_to_match.test.sql`

- [ ] **Step 1: Write the failing test**

`supabase/tests/database/invite_to_match.test.sql`:

```sql
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx supabase test db supabase/tests/database/invite_to_match.test.sql`
Expected: FAIL (`function public.invite_to_match(...) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261123000140_match_invites.sql`:

```sql
-- Asistente del club, part 4: reception invites players to a forming match. Each invitation is kept once per
-- player and match, and writes an aviso (match_invite) that /avisos shows and lib/notify mails. Staff read the
-- club's invitations; players do not (the aviso is theirs, the list is not).
create table public.match_invites (
  match_id uuid not null references public.open_matches (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (match_id, player_id)
);
create index match_invites_player_id_idx on public.match_invites (player_id);
create index match_invites_club_id_idx on public.match_invites (club_id);
alter table public.match_invites enable row level security;

revoke all on public.match_invites from anon, authenticated;
grant select on public.match_invites to authenticated;
create policy match_invites_select_staff on public.match_invites
  for select to authenticated
  using (private.has_club_role(club_id, array['admin', 'reception']::public.club_role[]));

-- Invites members of the club who are not in the match and were not invited to it yet; returns how many.
-- Only staff, only a forming match before its closing time.
create function public.invite_to_match(p_match_id uuid, p_player_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_match public.open_matches;
  v_court_name text;
  v_count integer;
begin
  select * into v_match from public.open_matches where id = p_match_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null or not private.is_staff(v_match.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_match.status <> 'forming' or now() >= private.match_closes_at(v_match) then
    perform private.fail('match_closed');
  end if;
  if p_player_ids is null or cardinality(p_player_ids) = 0 or cardinality(p_player_ids) > 50 then
    perform private.fail('invalid_input');
  end if;
  select name into v_court_name from public.courts where id = v_match.preferred_court_id;

  with wanted as (
    select distinct unnest(p_player_ids) as id
  ),
  invited as (
    insert into public.match_invites (match_id, player_id, club_id, invited_by)
    select v_match.id, m.user_id, v_match.club_id, v_uid
    from wanted w
    join public.club_members m on m.club_id = v_match.club_id and m.user_id = w.id
    where not exists (select 1 from public.match_slots s where s.match_id = v_match.id and s.player_id = m.user_id)
    on conflict (match_id, player_id) do nothing
    returning player_id
  ),
  noticed as (
    insert into public.notifications (club_id, user_id, kind, data, link)
    select v_match.club_id, i.player_id, 'match_invite',
           jsonb_build_object('court_name', v_court_name, 'starts_at', v_match.starts_at,
                              'category_min', v_match.category_min, 'category_max', v_match.category_max,
                              'match_type', v_match.match_type),
           '/partidos/' || v_match.id
    from invited i
    returning 1
  )
  select count(*)::integer into v_count from noticed;
  return v_count;
end;
$$;

revoke execute on function public.invite_to_match(uuid, uuid[]) from public, anon;
grant execute on function public.invite_to_match(uuid, uuid[]) to authenticated;
```

- [ ] **Step 4: Apply and run the test**

Run: `npx supabase migration up`
Run: `npx supabase test db supabase/tests/database/invite_to_match.test.sql`
Expected: PASS (9 tests).

- [ ] **Step 5: Run the whole database suite**

Run: `npm run test:db`
Expected: PASS (nothing else broke: e.g. schema tests that count tables or kinds).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261123000140_match_invites.sql supabase/tests/database/invite_to_match.test.sql
git commit -m "feat(asistente): invite_to_match, invitations with an aviso"
```

---

### Task 5: Short labels the assistant shares

**Files:**
- Modify: `lib/domain/format.ts` (append)
- Modify: `lib/domain/matches.ts` (after `categoryRangeLabel`)
- Test: `tests/unit/lib/domain/assistant-labels.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/assistant-labels.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { capitalize, formatPhone, shortDate } from '@/lib/domain/format'
import { categorySlashLabel } from '@/lib/domain/matches'

describe('assistant labels', () => {
  it('writes a day as day/month', () => {
    expect(shortDate('2026-11-24')).toBe('24/11')
    expect(shortDate('2026-10-01')).toBe('1/10')
  })

  it('groups the phone digits the way people write them', () => {
    expect(formatPhone('092369558')).toBe('092 369 558')
    expect(formatPhone('29001234')).toBe('2900 1234')
    expect(formatPhone('59899123456')).toBe('59899123456')
  })

  it('capitalizes the first letter', () => {
    expect(capitalize('martes')).toBe('Martes')
    expect(capitalize('')).toBe('')
  })

  it('writes a range of categories in short', () => {
    expect(categorySlashLabel(5, 6)).toBe('5ª/6ª')
    expect(categorySlashLabel(5, 5)).toBe('5ª')
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/lib/domain/assistant-labels.test.ts`
Expected: FAIL (`shortDate is not a function` / not exported).

- [ ] **Step 3: Implement**

Append to `lib/domain/format.ts`:

```ts
// '24/11': the day and the month, for the flyer and the invitations.
export function shortDate(date: LocalDate): string {
  const { day, month } = parseLocalDate(date)
  return `${day}/${String(month).padStart(2, '0')}`
}

// The club's phone as people write it: 092 369 558 (9 digits) or 2900 1234 (8). Other lengths go as they are.
export function formatPhone(digits: string): string {
  if (/^\d{9}$/.test(digits)) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  if (/^\d{8}$/.test(digits)) return `${digits.slice(0, 4)} ${digits.slice(4)}`
  return digits
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
```

In `lib/domain/matches.ts`, right after the `categoryRangeLabel` function, add:

```ts
// "5ª/6ª": a range of categories in short, for the assistant and its invitations.
export function categorySlashLabel(min: number, max: number): string {
  return min === max ? `${min}ª` : `${min}ª/${max}ª`
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/lib/domain/assistant-labels.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/format.ts lib/domain/matches.ts tests/unit/lib/domain/assistant-labels.test.ts
git commit -m "feat(asistente): short day, phone and category labels"
```

---

### Task 6: The `match_invite` aviso in the app and the mail

**Files:**
- Create: `lib/domain/match-invite-notifications.ts`
- Modify: `lib/domain/notifications.ts`
- Test: `tests/unit/lib/domain/notifications.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/lib/domain/notifications.test.ts`:

```ts
describe('the club inviting a player to a match', () => {
  // Tuesday 2026-11-24: 22:00 UTC is 19:00 in Montevideo.
  const INVITE = {
    court_name: 'Cancha 2',
    starts_at: '2026-11-24T22:00:00Z',
    category_min: 5,
    category_max: 6,
    match_type: 'mixed',
  }

  it('says the day, the time, the court and who it is for', () => {
    expect(notificationContent('match_invite', INVITE, TIMEZONE)).toEqual({
      title: 'Te invitan a un partido',
      body: 'Martes 24/11 19:00 · Cancha 2 · 5ª/6ª mixto',
      button: 'Ver el partido',
      reason: 'te escribimos porque el club te invitó a un partido.',
    })
  })

  it('is not mailed once the match started, nor when its data cannot be read', () => {
    expect(isNotificationStale('match_invite', INVITE, new Date('2026-11-24T21:00:00Z'))).toBe(false)
    expect(isNotificationStale('match_invite', INVITE, new Date('2026-11-24T22:00:00Z'))).toBe(true)
    expect(isNotificationStale('match_invite', { court_name: 'Cancha 2' }, new Date('2026-11-24T21:00:00Z'))).toBe(true)
    expect(notificationContent('match_invite', { ...INVITE, match_type: 'doubles' }, TIMEZONE)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/lib/domain/notifications.test.ts`
Expected: FAIL (type error / `notificationContent` returns the waitlist reading: null or wrong words).

- [ ] **Step 3: Implement the aviso module**

`lib/domain/match-invite-notifications.ts`:

```ts
import { capitalize, shortDate, timeIn, WEEKDAYS_LONG } from './format'
import { categorySlashLabel, MATCH_TYPE_LABELS, MATCH_TYPES, type MatchType } from './matches'
import { localDateOf, weekdayOf } from './time'

// "Te invitan a un partido": public.invite_to_match writes it; the app shows it in /avisos and mails it with the
// same words.
export const MATCH_INVITE_KIND = 'match_invite' as const
export type MatchInviteKind = typeof MATCH_INVITE_KIND

export type MatchInviteData = {
  courtName: string
  startsAt: Date
  categoryMin: number
  categoryMax: number
  type: MatchType
}

function isMatchType(value: unknown): value is MatchType {
  return typeof value === 'string' && (MATCH_TYPES as readonly string[]).includes(value)
}

function readCategory(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 8 ? value : null
}

// The jsonb invite_to_match writes; anything else reads as null.
export function readMatchInviteData(data: unknown): MatchInviteData | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const record = data as Record<string, unknown>
  const startsAt = typeof record.starts_at === 'string' ? new Date(record.starts_at) : null
  const categoryMin = readCategory(record.category_min)
  const categoryMax = readCategory(record.category_max)
  if (typeof record.court_name !== 'string' || record.court_name.trim() === '') return null
  if (!startsAt || Number.isNaN(startsAt.getTime()) || categoryMin === null || categoryMax === null) return null
  if (!isMatchType(record.match_type)) return null
  return { courtName: record.court_name, startsAt, categoryMin, categoryMax, type: record.match_type }
}

// "Martes 24/11 19:00 · Cancha 2 · 5ª/6ª mixto": the aviso's body and the WhatsApp invitation's first line.
export function matchLine(data: MatchInviteData, timezone: string): string {
  const date = localDateOf(data.startsAt, timezone)
  return [
    `${capitalize(WEEKDAYS_LONG[weekdayOf(date)])} ${shortDate(date)} ${timeIn(data.startsAt, timezone)}`,
    data.courtName,
    `${categorySlashLabel(data.categoryMin, data.categoryMax)} ${MATCH_TYPE_LABELS[data.type].toLowerCase()}`,
  ].join(' · ')
}

export function matchInviteText(data: MatchInviteData, timezone: string): { title: string; body: string } {
  return { title: 'Te invitan a un partido', body: matchLine(data, timezone) }
}
```

- [ ] **Step 4: Teach `notifications.ts` the new kind**

In `lib/domain/notifications.ts`:

Replace

```ts
import { notificationText, readNotificationData, type NotificationKind as WaitlistNotificationKind } from './waitlist'

// Every aviso the app shows in /avisos and mails: the waitlist's and the championships'.
export type NotificationKind = WaitlistNotificationKind | ChampionshipNotificationKind
```

with

```ts
import { MATCH_INVITE_KIND, matchInviteText, readMatchInviteData, type MatchInviteKind } from './match-invite-notifications'
import { notificationText, readNotificationData, type NotificationKind as WaitlistNotificationKind } from './waitlist'

// Every aviso the app shows in /avisos and mails: the waitlist's, the championships' and the club's invitations.
export type NotificationKind = WaitlistNotificationKind | ChampionshipNotificationKind | MatchInviteKind
```

Replace

```ts
export function notificationContent(kind: NotificationKind, data: unknown, timezone: string): NotificationContent | null {
  if (isChampionshipNotificationKind(kind)) {
```

with

```ts
export function notificationContent(kind: NotificationKind, data: unknown, timezone: string): NotificationContent | null {
  if (kind === MATCH_INVITE_KIND) {
    const read = readMatchInviteData(data)
    if (!read) return null
    return {
      ...matchInviteText(read, timezone),
      button: 'Ver el partido',
      reason: 'te escribimos porque el club te invitó a un partido.',
    }
  }
  if (isChampionshipNotificationKind(kind)) {
```

Replace

```ts
export function isNotificationStale(kind: NotificationKind, data: unknown, now: Date): boolean {
  if (isChampionshipNotificationKind(kind)) {
```

with

```ts
export function isNotificationStale(kind: NotificationKind, data: unknown, now: Date): boolean {
  if (kind === MATCH_INVITE_KIND) {
    const read = readMatchInviteData(data)
    return !read || read.startsAt.getTime() <= now.getTime()
  }
  if (isChampionshipNotificationKind(kind)) {
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/lib/domain/notifications.test.ts tests/unit/lib/notify`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/match-invite-notifications.ts lib/domain/notifications.ts tests/unit/lib/domain/notifications.test.ts
git commit -m "feat(asistente): the match invitation aviso, in the app and the mail"
```

---

### Task 7: Regenerate the database types

**Files:**
- Modify: `lib/supabase/database.types.ts` (generated)

# (no test — generated file; the typecheck is the check)

- [ ] **Step 1: Generate**

Run: `npm run db:types`
Expected: `lib/supabase/database.types.ts` now has `clubs.phone`, `match_invites`, `slot_candidates`, `staff_create_match`, `invite_to_match` and `"match_invite"` in `notification_kind`.

Run: `git diff --stat lib/supabase/database.types.ts`
Expected: one file changed. If the generator's formatting differs wildly from the committed file (whole-file rewrite), check `git log -1 -- lib/supabase/database.types.ts` for how it was generated last and match that.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (the app's `NotificationKind` already includes `match_invite` from Task 6).

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/database.types.ts
git commit -m "chore(asistente): regenerate the database types"
```

---

### Task 8: `slot-planner` — the proposal for a slot

**Files:**
- Create: `lib/domain/slot-planner.ts`
- Create: `tests/unit/fixtures/assistant.ts`
- Test: `tests/unit/lib/domain/slot-planner.test.ts`

- [ ] **Step 1: Write the fixture**

`tests/unit/fixtures/assistant.ts`:

```ts
import type { CandidateRow } from '@/lib/domain/slot-planner'

// A strong candidate by default: category 5, male, drive, usually free, score 20.
export function candidate(id: string, overrides: Partial<CandidateRow> = {}): CandidateRow {
  return {
    player_id: id,
    display_name: `Jugador ${id}`,
    category: 5,
    side: 'drive',
    gender: 'male',
    times_played: 0,
    usually_free: true,
    prefers_court: false,
    score: 20,
    ...overrides,
  }
}

// n strong men of category 5, drive and backhand in turns.
export function strongRows(n: number, prefix = 'p'): CandidateRow[] {
  return Array.from({ length: n }, (_, index) =>
    candidate(`${prefix}${index + 1}`, { side: index % 2 === 0 ? 'drive' : 'backhand' }),
  )
}
```

- [ ] **Step 2: Write the failing test**

`tests/unit/lib/domain/slot-planner.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { demandOf, demandText, isStrong, propose, sideWarning } from '@/lib/domain/slot-planner'
import { candidate, strongRows } from '../../fixtures/assistant'

describe('isStrong', () => {
  it('counts who played there twice or says she is usually free', () => {
    expect(isStrong(candidate('a', { times_played: 2, usually_free: false }))).toBe(true)
    expect(isStrong(candidate('b', { times_played: 1, usually_free: false }))).toBe(false)
    expect(isStrong(candidate('c', { times_played: 0, usually_free: true }))).toBe(true)
  })
})

describe('propose', () => {
  it('proposes one category when it fills a match on its own', () => {
    const rows = [...strongRows(4), candidate('six', { category: 6 })]
    expect(propose(rows)).toEqual({
      categoryMin: 5,
      categoryMax: 5,
      type: 'male',
      demand: 'medium',
      strong: 4,
      sideWarning: null,
    })
  })

  it('otherwise joins the two neighbouring categories with the most strong candidates', () => {
    const rows = [
      candidate('a', { category: 5 }),
      candidate('b', { category: 5, side: 'backhand' }),
      candidate('c', { category: 6 }),
      candidate('d', { category: 6, side: 'backhand' }),
      candidate('e', { category: 3 }),
      // Played there once: not strong, does not weigh.
      ...Array.from({ length: 5 }, (_, index) =>
        candidate(`w${index}`, { category: 8, usually_free: false, times_played: 1 }),
      ),
    ]
    expect(propose(rows)).toMatchObject({ categoryMin: 5, categoryMax: 6, strong: 4 })
  })

  it('breaks a tie by the score, then by the lower category', () => {
    const low = [candidate('a', { category: 3 }), candidate('b', { category: 3, side: 'backhand' })]
    const high = [
      candidate('c', { category: 6, score: 30 }),
      candidate('d', { category: 6, side: 'backhand', score: 30 }),
    ]
    expect(propose([...low, ...high])).toMatchObject({ categoryMin: 5, categoryMax: 6 })
    const even = [candidate('c', { category: 6 }), candidate('d', { category: 6, side: 'backhand' })]
    expect(propose([...low, ...even])).toMatchObject({ categoryMin: 2, categoryMax: 3 })
  })

  it("proposes a men's or women's match when four of one gender would play", () => {
    const women = Array.from({ length: 4 }, (_, index) =>
      candidate(`f${index}`, { gender: 'female', side: index % 2 ? 'backhand' : 'drive' }),
    )
    expect(propose([...women, candidate('m')])).toMatchObject({ type: 'female', strong: 4 })
    expect(propose([...strongRows(3), ...women.slice(0, 3)])).toMatchObject({ type: 'mixed', strong: 6, demand: 'high' })
    expect(propose([...strongRows(4), ...women])).toMatchObject({ type: 'mixed', strong: 8 })
  })

  it('warns when a side is short, counting those who play both', () => {
    const drives = Array.from({ length: 4 }, (_, index) => candidate(`d${index}`))
    expect(propose(drives)?.sideWarning).toBe('Pocos de revés')
    expect(
      propose([...drives.slice(0, 2), candidate('x', { side: 'both' }), candidate('y', { side: 'both' })])?.sideWarning,
    ).toBeNull()
  })

  it('has nothing to propose without strong candidates', () => {
    expect(propose([])).toBeNull()
    expect(propose([candidate('a', { usually_free: false, times_played: 1 })])).toBeNull()
  })
})

describe('sideWarning', () => {
  it('names the short side', () => {
    expect(sideWarning([candidate('a', { side: 'backhand' }), candidate('b', { side: 'backhand' })])).toBe('Pocos de drive')
    expect(sideWarning([candidate('a')])).toBe('Pocos de drive y de revés')
  })
})

describe('demand', () => {
  it('is high from 6 strong candidates and medium from 3', () => {
    expect([6, 5, 3, 2].map((strong) => demandOf(strong))).toEqual(['high', 'medium', 'medium', 'low'])
  })

  it('shows the count, with a flame when it is high', () => {
    const high = propose(strongRows(8))
    const medium = propose(strongRows(5))
    const low = propose(strongRows(2))
    expect(high && demandText(high)).toBe('🔥 8 posibles')
    expect(medium && demandText(medium)).toBe('5 posibles')
    expect(low && demandText(low)).toBeNull()
  })
})
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run tests/unit/lib/domain/slot-planner.test.ts`
Expected: FAIL (`Cannot find module '@/lib/domain/slot-planner'`).

- [ ] **Step 4: Implement**

`lib/domain/slot-planner.ts`:

```ts
import type { MatchType } from './matches'

// The assistant's rules (no AI): which category range and match type a free slot is worth, from the members who
// could play it (public.slot_candidates). A strong candidate played that weekday and time at least twice, or says
// she is usually free then.

// A row of public.slot_candidates.
export type CandidateRow = {
  player_id: string
  display_name: string
  category: number
  side: 'drive' | 'backhand' | 'both' | null
  gender: 'male' | 'female' | null
  times_played: number
  usually_free: boolean
  prefers_court: boolean
  score: number
}
export type Demand = 'high' | 'medium' | 'low'
export type Choice = { categoryMin: number; categoryMax: number; type: MatchType }
export type Proposal = Choice & { demand: Demand; strong: number; sideWarning: string | null }

// What the sheet starts with when nobody stands out: every category, mixed.
export const DEFAULT_CHOICE: Choice = { categoryMin: 1, categoryMax: 8, type: 'mixed' }

const CATEGORIES = [1, 2, 3, 4, 5, 6, 7, 8]
const FULL_MATCH = 4

export function isStrong(row: CandidateRow): boolean {
  return row.times_played >= 2 || row.usually_free
}

function inRange(row: CandidateRow, min: number, max: number): boolean {
  return row.category >= min && row.category <= max
}

export function fitsType(row: CandidateRow, type: MatchType): boolean {
  return type === 'mixed' || row.gender === type
}

export function fits(row: CandidateRow, choice: Choice): boolean {
  return inRange(row, choice.categoryMin, choice.categoryMax) && fitsType(row, choice.type)
}

type Range = { min: number; max: number; count: number; score: number }

function rangeOf(strong: CandidateRow[], min: number, max: number): Range {
  const rows = strong.filter((row) => inRange(row, min, max))
  return { min, max, count: rows.length, score: rows.reduce((total, row) => total + row.score, 0) }
}

// More strong candidates, then more score, then the lower category.
function better(a: Range, b: Range): boolean {
  if (a.count !== b.count) return a.count > b.count
  if (a.score !== b.score) return a.score > b.score
  return a.min < b.min
}

function bestRange(ranges: Range[]): Range {
  return ranges.reduce((best, range) => (better(range, best) ? range : best))
}

// A men's or women's match when four of one gender (and not of the other) would play; otherwise mixed.
function typeFor(rows: CandidateRow[]): MatchType {
  const male = rows.filter((row) => row.gender === 'male').length
  const female = rows.filter((row) => row.gender === 'female').length
  if (male >= FULL_MATCH && female < FULL_MATCH) return 'male'
  if (female >= FULL_MATCH && male < FULL_MATCH) return 'female'
  return 'mixed'
}

// Fewer than two for a side (those who play both count on each).
export function sideWarning(rows: CandidateRow[]): string | null {
  const drive = rows.filter((row) => row.side === 'drive' || row.side === 'both').length
  const backhand = rows.filter((row) => row.side === 'backhand' || row.side === 'both').length
  if (drive < 2 && backhand < 2) return 'Pocos de drive y de revés'
  if (drive < 2) return 'Pocos de drive'
  if (backhand < 2) return 'Pocos de revés'
  return null
}

export function demandOf(strong: number): Demand {
  if (strong >= 6) return 'high'
  if (strong >= 3) return 'medium'
  return 'low'
}

// One category when it fills a match on its own; otherwise the two neighbouring categories with the most strong
// candidates. null when nobody stands out.
export function propose(rows: CandidateRow[]): Proposal | null {
  const strong = rows.filter(isStrong)
  if (strong.length === 0) return null
  const single = bestRange(CATEGORIES.map((category) => rangeOf(strong, category, category)))
  const range =
    single.count >= FULL_MATCH
      ? single
      : bestRange(CATEGORIES.slice(0, -1).map((category) => rangeOf(strong, category, category + 1)))
  const inside = strong.filter((row) => inRange(row, range.min, range.max))
  const type = typeFor(inside)
  const fitting = inside.filter((row) => fitsType(row, type))
  return {
    categoryMin: range.min,
    categoryMax: range.max,
    type,
    demand: demandOf(fitting.length),
    strong: fitting.length,
    sideWarning: sideWarning(fitting),
  }
}

// "🔥 8 posibles" (high), "5 posibles" (medium), nothing when low.
export function demandText(proposal: Proposal): string | null {
  if (proposal.demand === 'high') return `🔥 ${proposal.strong} posibles`
  if (proposal.demand === 'medium') return `${proposal.strong} posibles`
  return null
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/unit/lib/domain/slot-planner.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/slot-planner.ts tests/unit/fixtures/assistant.ts tests/unit/lib/domain/slot-planner.test.ts
git commit -m "feat(asistente): propose a category range, type and demand for a free slot"
```

---

### Task 9: `slot-planner` — `candidatesFor` with its reasons

**Files:**
- Modify: `lib/domain/slot-planner.ts`
- Test: `tests/unit/lib/domain/slot-planner.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/unit/lib/domain/slot-planner.test.ts`, replace

```ts
import { demandOf, demandText, isStrong, propose, sideWarning } from '@/lib/domain/slot-planner'
import { candidate, strongRows } from '../../fixtures/assistant'
```

with

```ts
import { candidatesFor, demandOf, demandText, isStrong, propose, sideWarning } from '@/lib/domain/slot-planner'
import { candidate, strongRows } from '../../fixtures/assistant'
import { at, TIMEZONE } from '../../fixtures/grid'
```

and append:

```ts
describe('candidatesFor', () => {
  // Thursday 2026-10-01 at 20:00 (night).
  const context = { startsAt: at('20:00'), courtName: 'Cancha 2', timezone: TIMEZONE }
  const rows = [
    candidate('b', { display_name: 'Bruno', category: 6, side: 'backhand', times_played: 4, usually_free: false, score: 20 }),
    candidate('a', { display_name: 'Ana', gender: 'female', prefers_court: true, score: 28 }),
    candidate('h', { display_name: 'Hugo', category: 4 }),
  ]

  it('lists who fits the range and type, best first, with the reasons', () => {
    expect(candidatesFor(rows, { categoryMin: 5, categoryMax: 6, type: 'mixed' }, context)).toEqual([
      {
        playerId: 'a',
        name: 'Ana',
        score: 28,
        strong: true,
        chips: [
          { text: 'Suele estar libre los jueves de noche', hit: true },
          { text: '5ª, entra en 5ª/6ª', hit: false },
          { text: 'Prefiere la Cancha 2', hit: false },
        ],
      },
      {
        playerId: 'b',
        name: 'Bruno',
        score: 20,
        strong: true,
        chips: [
          { text: 'Jugó 4 veces los jueves 20:00', hit: true },
          { text: '6ª, entra en 5ª/6ª', hit: false },
        ],
      },
    ])
  })

  it('narrows with the choice', () => {
    expect(candidatesFor(rows, { categoryMin: 5, categoryMax: 6, type: 'male' }, context).map((row) => row.name)).toEqual(['Bruno'])
    expect(candidatesFor(rows, { categoryMin: 5, categoryMax: 5, type: 'mixed' }, context)[0].chips[1]).toEqual({
      text: '5ª categoría',
      hit: false,
    })
  })

  it('says one game in the singular and does not mark it', () => {
    const [once] = candidatesFor(
      [candidate('o', { times_played: 1, usually_free: false })],
      { categoryMin: 5, categoryMax: 5, type: 'mixed' },
      context,
    )
    expect(once.chips[0]).toEqual({ text: 'Jugó 1 vez los jueves 20:00', hit: false })
    expect(once.strong).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/lib/domain/slot-planner.test.ts`
Expected: FAIL (`candidatesFor` is not exported).

- [ ] **Step 3: Implement**

In `lib/domain/slot-planner.ts`, replace

```ts
import type { MatchType } from './matches'
```

with

```ts
import { DAY_BAND_WORDS, dayBandOf } from './availability'
import { WEEKDAYS_PLURAL, type Chip } from './match-suggestions'
import { categorySlashLabel, type MatchType } from './matches'
import { formatMinutes, localDateOf, minutesOfDay, weekdayOf } from './time'
```

and append:

```ts
export type SlotContext = { startsAt: Date; courtName: string; timezone: string }
export type CandidateView = { playerId: string; name: string; score: number; strong: boolean; chips: Chip[] }

// Who fits the chosen range and type, best first, with why: "Jugó 4 veces los martes 19:00", "Suele estar libre los
// martes de noche", "6ª, entra en 5ª/6ª". "hit" marks the reasons that make a strong candidate.
export function candidatesFor(rows: CandidateRow[], choice: Choice, context: SlotContext): CandidateView[] {
  const minutes = minutesOfDay(context.startsAt, context.timezone)
  const days = WEEKDAYS_PLURAL[weekdayOf(localDateOf(context.startsAt, context.timezone))]
  const range = categorySlashLabel(choice.categoryMin, choice.categoryMax)
  return rows
    .filter((row) => fits(row, choice))
    .sort((a, b) => b.score - a.score || a.display_name.localeCompare(b.display_name, 'es'))
    .map((row) => {
      const chips: Chip[] = []
      if (row.times_played > 0) {
        const times = row.times_played === 1 ? '1 vez' : `${row.times_played} veces`
        chips.push({ text: `Jugó ${times} los ${days} ${formatMinutes(minutes)}`, hit: row.times_played >= 2 })
      }
      if (row.usually_free) chips.push({ text: `Suele estar libre los ${days} ${DAY_BAND_WORDS[dayBandOf(minutes)]}`, hit: true })
      chips.push({
        text: choice.categoryMin === choice.categoryMax ? `${row.category}ª categoría` : `${row.category}ª, entra en ${range}`,
        hit: false,
      })
      if (row.prefers_court) chips.push({ text: `Prefiere la ${context.courtName}`, hit: false })
      return { playerId: row.player_id, name: row.display_name, score: row.score, strong: isStrong(row), chips }
    })
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/lib/domain/slot-planner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/slot-planner.ts tests/unit/lib/domain/slot-planner.test.ts
git commit -m "feat(asistente): the candidates of a slot with their reasons"
```

---

### Task 10: `assistant-board` — the board and the recommendations

**Files:**
- Create: `lib/domain/assistant-board.ts`
- Modify: `tests/unit/fixtures/assistant.ts` (full replace)
- Test: `tests/unit/lib/domain/assistant-board.test.ts`

- [ ] **Step 1: Extend the fixture**

Replace the whole of `tests/unit/fixtures/assistant.ts` with:

```ts
import { slotKey, type BoardSlot } from '@/lib/domain/assistant-board'
import { propose, type CandidateRow } from '@/lib/domain/slot-planner'
import { at } from './grid'

// A strong candidate by default: category 5, male, drive, usually free, score 20.
export function candidate(id: string, overrides: Partial<CandidateRow> = {}): CandidateRow {
  return {
    player_id: id,
    display_name: `Jugador ${id}`,
    category: 5,
    side: 'drive',
    gender: 'male',
    times_played: 0,
    usually_free: true,
    prefers_court: false,
    score: 20,
    ...overrides,
  }
}

// n strong men of category 5, drive and backhand in turns.
export function strongRows(n: number, prefix = 'p'): CandidateRow[] {
  return Array.from({ length: n }, (_, index) =>
    candidate(`${prefix}${index + 1}`, { side: index % 2 === 0 ? 'drive' : 'backhand' }),
  )
}

// A free slot of the grid fixture's day (Thursday 2026-10-01) with its candidates and proposal.
export function boardSlot(courtId: string, hhmm: string, rows: CandidateRow[]): BoardSlot {
  return {
    key: slotKey(courtId, at(hhmm)),
    courtId,
    courtName: courtId === 'court-1' ? 'Cancha 1' : 'Cancha 2',
    startsAt: at(hhmm),
    label: hhmm,
    rows,
    proposal: propose(rows),
  }
}
```

- [ ] **Step 2: Write the failing test**

`tests/unit/lib/domain/assistant-board.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  boardOf,
  buildableSlots,
  recommendationText,
  recommendedSlots,
  slotKey,
  type AssistantBoard,
  type BoardSlot,
} from '@/lib/domain/assistant-board'
import { boardSlot, candidate, strongRows } from '../../fixtures/assistant'
import { at, COURTS, makeGrid, occupancy, RULES, TIMEZONE } from '../../fixtures/grid'
import { makeMatch } from '../../fixtures/matches'

describe('buildableSlots', () => {
  it('takes the free slots that still accept a match, without the taken and the forming ones', () => {
    const grid = makeGrid({ occupancies: [occupancy('o1', 'court-1', '11:00', '12:30')], matches: [makeMatch()] })
    const slots = buildableSlots(grid, at('07:00'), 3)
    // 11:00 onwards closes after 07:00: 8 times on 2 courts, minus the taken one and the forming one.
    expect(slots).toHaveLength(14)
    expect(slots[0]).toEqual({ courtId: 'court-2', startsAt: at('11:00') })
    expect(slots).not.toContainEqual({ courtId: 'court-1', startsAt: at('20:00') })
  })
})

describe('boardOf', () => {
  it('drops the past times and tells free, taken and forming apart', () => {
    const grid = makeGrid({
      occupancies: [occupancy('o1', 'court-2', '11:00', '12:30')],
      matches: [makeMatch()],
      now: at('09:00'),
    })
    const rows = [candidate('a')]
    const board = boardOf(grid, new Map([[slotKey('court-2', at('09:30')), rows]]))
    expect(board.courts).toEqual([
      { id: 'court-1', name: 'Cancha 1' },
      { id: 'court-2', name: 'Cancha 2' },
    ])
    expect(board.rows).toHaveLength(9)
    expect(board.rows[0].label).toBe('09:30')
    expect(board.rows[0].cells[0]).toEqual({ state: 'free', slot: null })
    expect(board.rows[0].cells[1]).toMatchObject({ state: 'free', slot: { courtName: 'Cancha 2', label: '09:30', rows } })
    expect(board.rows[1].cells[1]).toEqual({ state: 'taken' })
    expect(board.rows[7].cells[0]).toEqual({ state: 'forming', matchId: 'm1', filled: 1 })
  })

  it('shows a time without a price as no slot', () => {
    const board = boardOf(makeGrid({ rules: [RULES[0]] }), new Map())
    expect(board.rows.at(-1)?.cells).toEqual([{ state: 'none' }, { state: 'none' }])
  })
})

describe('recommendedSlots', () => {
  const board = (slots: BoardSlot[]): AssistantBoard => ({
    courts: COURTS.map(({ id, name }) => ({ id, name })),
    rows: [{ label: 'todos', cells: slots.map((slot) => ({ state: 'free' as const, slot })) }],
  })
  const a = boardSlot('court-1', '20:00', strongRows(8, 'a'))
  const b = boardSlot('court-2', '20:00', strongRows(7, 'b'))
  const c = boardSlot('court-1', '18:30', strongRows(4, 'c'))
  const d = boardSlot('court-2', '17:00', strongRows(5, 'd'))
  const e = boardSlot('court-1', '15:30', strongRows(2, 'e'))
  // High demand, but it closed at 06:30.
  const f = boardSlot('court-2', '09:30', strongRows(8, 'f'))
  const g = boardSlot('court-2', '14:00', strongRows(3, 'g'))

  it('takes up to three by demand, never two at the same time, never a closed or a quiet one', () => {
    expect(recommendedSlots(board([a, b, c, d, e, f, g]), at('07:00'), 3).map((slot) => slot.key)).toEqual([
      a.key,
      d.key,
      c.key,
    ])
  })

  it('says the day, the time, the court, the proposal and how many could play', () => {
    const [first] = recommendedSlots(board([a]), at('07:00'), 3)
    expect(recommendationText(first, TIMEZONE)).toBe('Jueves 20:00 · Cancha 1 · 5ª masculino · 8 posibles')
  })
})
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run tests/unit/lib/domain/assistant-board.test.ts`
Expected: FAIL (`Cannot find module '@/lib/domain/assistant-board'`).

- [ ] **Step 4: Implement**

`lib/domain/assistant-board.ts`:

```ts
import { capitalize, WEEKDAYS_LONG } from './format'
import type { DayGrid } from './grid'
import { categorySlashLabel, MATCH_TYPE_LABELS } from './matches'
import { propose, type CandidateRow, type Demand, type Proposal } from './slot-planner'
import { localDateOf, weekdayOf } from './time'

// The assistant's board: the day's times still to come, court by court, and the free slots worth a match.

// A free slot that still takes a match, with who could play it.
export type BoardSlot = {
  key: string
  courtId: string
  courtName: string
  startsAt: Date
  label: string
  rows: CandidateRow[]
  proposal: Proposal | null
}
export type RecommendedSlot = BoardSlot & { proposal: Proposal }
// free with slot null: still free to book, but past the match closing time.
export type BoardCell =
  | { state: 'free'; slot: BoardSlot | null }
  | { state: 'taken' }
  | { state: 'forming'; matchId: string; filled: number }
  | { state: 'none' }
export type AssistantBoard = { courts: { id: string; name: string }[]; rows: { label: string; cells: BoardCell[] }[] }

const DEMAND_RANK: Record<Demand, number> = { high: 0, medium: 1, low: 2 }
const MAX_RECOMMENDED = 3

export function slotKey(courtId: string, startsAt: Date): string {
  return `${courtId}|${startsAt.toISOString()}`
}

// Same as private.match_closes_at: a match takes players until close_hours before it starts.
export function acceptsMatch(startsAt: Date, now: Date, closeHours: number): boolean {
  return now.getTime() < startsAt.getTime() - closeHours * 3_600_000
}

// The slots lib/data/assistant.ts asks slot_candidates about: free, no match forming there, not closed yet.
export function buildableSlots(grid: DayGrid, now: Date, closeHours: number): { courtId: string; startsAt: Date }[] {
  return grid.rows.flatMap((row) =>
    row.cells.flatMap((cell) =>
      cell.state === 'free' && !cell.formingMatch && acceptsMatch(cell.slot.startsAt, now, closeHours)
        ? [{ courtId: cell.court.id, startsAt: cell.slot.startsAt }]
        : [],
    ),
  )
}

// candidates: the slot_candidates rows of each buildable slot, by slotKey.
export function boardOf(grid: DayGrid, candidates: Map<string, CandidateRow[]>): AssistantBoard {
  return {
    courts: grid.courts.map((court) => ({ id: court.id, name: court.name })),
    rows: grid.rows
      .filter((row) => !row.past)
      .map((row) => ({
        label: row.slot.label,
        cells: row.cells.map((cell): BoardCell => {
          if (cell.state === 'mine' || cell.state === 'taken') return { state: 'taken' }
          if (cell.state !== 'free') return { state: 'none' }
          if (cell.formingMatch) return { state: 'forming', matchId: cell.formingMatch.id, filled: cell.formingMatch.filled }
          const key = slotKey(cell.court.id, cell.slot.startsAt)
          const rows = candidates.get(key)
          if (!rows) return { state: 'free', slot: null }
          return {
            state: 'free',
            slot: {
              key,
              courtId: cell.court.id,
              courtName: cell.court.name,
              startsAt: cell.slot.startsAt,
              label: cell.slot.label,
              rows,
              proposal: propose(rows),
            },
          }
        }),
      })),
  }
}

// Up to three free slots with medium or high demand that still take a match: by demand, strong candidates and
// time, and never two at the same time.
export function recommendedSlots(board: AssistantBoard, now: Date, closeHours: number): RecommendedSlot[] {
  const open = board.rows.flatMap((row) =>
    row.cells.flatMap((cell): RecommendedSlot[] => {
      if (cell.state !== 'free' || !cell.slot) return []
      const { proposal } = cell.slot
      if (!proposal || proposal.demand === 'low' || !acceptsMatch(cell.slot.startsAt, now, closeHours)) return []
      return [{ ...cell.slot, proposal }]
    }),
  )
  open.sort(
    (a, b) =>
      DEMAND_RANK[a.proposal.demand] - DEMAND_RANK[b.proposal.demand] ||
      b.proposal.strong - a.proposal.strong ||
      a.startsAt.getTime() - b.startsAt.getTime(),
  )
  const picked: RecommendedSlot[] = []
  for (const slot of open) {
    if (picked.length === MAX_RECOMMENDED) break
    if (picked.some((other) => other.startsAt.getTime() === slot.startsAt.getTime())) continue
    picked.push(slot)
  }
  return picked
}

// "Martes 19:00 · Cancha 2 · 5ª/6ª mixto · 8 posibles"
export function recommendationText(slot: RecommendedSlot, timezone: string): string {
  const { proposal } = slot
  const weekday = WEEKDAYS_LONG[weekdayOf(localDateOf(slot.startsAt, timezone))]
  return [
    `${capitalize(weekday)} ${slot.label}`,
    slot.courtName,
    `${categorySlashLabel(proposal.categoryMin, proposal.categoryMax)} ${MATCH_TYPE_LABELS[proposal.type].toLowerCase()}`,
    `${proposal.strong} posibles`,
  ].join(' · ')
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/lib/domain/assistant-board.test.ts tests/unit/lib/domain/slot-planner.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/assistant-board.ts tests/unit/fixtures/assistant.ts tests/unit/lib/domain/assistant-board.test.ts
git commit -m "feat(asistente): the free-slots board and the recommended slots"
```

---

### Task 11: `free-slots-flyer` — layout and text

**Files:**
- Create: `lib/domain/free-slots-flyer.ts`
- Test: `tests/unit/lib/domain/free-slots-flyer.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/free-slots-flyer.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { flyerContact, flyerDayText, flyerLayout, flyerText, hasFreeSlots } from '@/lib/domain/free-slots-flyer'
import { buildDayGrid } from '@/lib/domain/grid'
import { daySlots } from '@/lib/domain/slots'
import { at, DATE, makeGrid, occupancy, RULES, SCHEDULE } from '../../fixtures/grid'

describe('flyerLayout', () => {
  it('has the active courts as columns and the times still to come as rows', () => {
    const layout = flyerLayout(makeGrid({ occupancies: [occupancy('o1', 'court-2', '17:00', '18:30')], now: at('12:00') }))
    expect(layout.columns).toEqual([
      { courtId: 'court-1', name: 'Cancha 1' },
      { courtId: 'court-2', name: 'Cancha 2' },
    ])
    expect(layout.rows.map((row) => row.label)).toEqual(['12:30', '14:00', '15:30', '17:00', '18:30', '20:00', '21:30'])
    expect(layout.rows[3].cells).toEqual(['free', 'taken'])
    expect(layout).toMatchObject({ narrow: false, compact: false })
  })

  it('marks a time without a price as no slot', () => {
    expect(flyerLayout(makeGrid({ rules: [RULES[0]] })).rows.at(-1)?.cells).toEqual(['none', 'none'])
  })

  it('uses smaller pills past 8 times and narrow columns from 6 courts', () => {
    expect(flyerLayout(makeGrid()).compact).toBe(true)
    const courts = Array.from({ length: 6 }, (_, index) => ({ id: `court-${index + 1}`, name: `Cancha ${index + 1}`, isCovered: true }))
    const wide = buildDayGrid({ date: DATE, slots: daySlots(SCHEDULE, DATE), courts, rules: RULES, occupancies: [], bookings: [], now: at('07:00') })
    expect(flyerLayout(wide).narrow).toBe(true)
  })
})

describe('flyerText', () => {
  const layout = flyerLayout(makeGrid({ occupancies: [occupancy('o1', 'court-2', '20:00', '21:30')], now: at('17:30') }))

  it('lists only the free times of each court, with the link and the WhatsApp', () => {
    expect(flyerText({ date: DATE, layout, url: 'https://rustic.app', phone: '092369558' })).toBe(
      [
        '🎾 Turnos libres — jueves 1/10',
        'Cancha 1: 18:30 · 20:00 · 21:30',
        'Cancha 2: 18:30 · 21:30',
        'Reservá: https://rustic.app · WhatsApp 092 369 558',
      ].join('\n'),
    )
  })

  it('goes without the WhatsApp when the club has none, and says when nothing is left', () => {
    const none = flyerLayout(makeGrid({ now: at('22:00') }))
    expect(hasFreeSlots(none)).toBe(false)
    expect(hasFreeSlots(layout)).toBe(true)
    expect(flyerText({ date: DATE, layout: none, url: 'https://rustic.app', phone: null })).toBe(
      ['🎾 Turnos libres — jueves 1/10', 'No quedan turnos libres este día.', 'Reservá: https://rustic.app'].join('\n'),
    )
  })
})

describe('flyer words', () => {
  it('names the day and the contact', () => {
    expect(flyerDayText(DATE)).toBe('jueves 1/10')
    expect(flyerContact('092369558', 'https://rustic.app')).toBe('Consultanos: 092 369 558')
    expect(flyerContact(null, 'https://rustic.app')).toBe('https://rustic.app')
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/lib/domain/free-slots-flyer.test.ts`
Expected: FAIL (`Cannot find module '@/lib/domain/free-slots-flyer'`).

- [ ] **Step 3: Implement**

`lib/domain/free-slots-flyer.ts`:

```ts
import { formatPhone, shortDate, WEEKDAYS_LONG } from './format'
import type { DayGrid } from './grid'
import { weekdayOf, type LocalDate } from './time'

// The "Turnos libres" flyer clubs post on WhatsApp: courts in columns, the day's times still to come in rows.
export type FlyerCell = 'free' | 'taken' | 'none'
export type FlyerLayout = {
  columns: { courtId: string; name: string }[]
  rows: { label: string; cells: FlyerCell[] }[]
  // From 6 courts the columns get narrow; past 8 times the pills get smaller.
  narrow: boolean
  compact: boolean
}

const NARROW_FROM_COURTS = 6
const COMPACT_PAST_TIMES = 8

export function flyerLayout(grid: DayGrid): FlyerLayout {
  const rows = grid.rows
    .filter((row) => !row.past)
    .map((row) => ({
      label: row.slot.label,
      cells: row.cells.map((cell): FlyerCell => {
        if (cell.state === 'free') return 'free'
        if (cell.state === 'mine' || cell.state === 'taken') return 'taken'
        return 'none'
      }),
    }))
  return {
    columns: grid.courts.map((court) => ({ courtId: court.id, name: court.name })),
    rows,
    narrow: grid.courts.length >= NARROW_FROM_COURTS,
    compact: rows.length > COMPACT_PAST_TIMES,
  }
}

export function hasFreeSlots(layout: FlyerLayout): boolean {
  return layout.rows.some((row) => row.cells.includes('free'))
}

// "lunes 24/11"
export function flyerDayText(date: LocalDate): string {
  return `${WEEKDAYS_LONG[weekdayOf(date)]} ${shortDate(date)}`
}

// The flyer's last line: the club's WhatsApp, or the app's link when it has none.
export function flyerContact(phone: string | null, url: string): string {
  return phone ? `Consultanos: ${formatPhone(phone)}` : url
}

// The same flyer as text, for WhatsApp: only the free times of each court.
export function flyerText(input: { date: LocalDate; layout: FlyerLayout; url: string; phone: string | null }): string {
  const { layout } = input
  const courts = layout.columns.flatMap((column, index) => {
    const times = layout.rows.filter((row) => row.cells[index] === 'free').map((row) => row.label)
    return times.length > 0 ? [`${column.name}: ${times.join(' · ')}`] : []
  })
  return [
    `🎾 Turnos libres — ${flyerDayText(input.date)}`,
    ...(courts.length > 0 ? courts : ['No quedan turnos libres este día.']),
    `Reservá: ${input.url}${input.phone ? ` · WhatsApp ${formatPhone(input.phone)}` : ''}`,
  ].join('\n')
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/lib/domain/free-slots-flyer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/free-slots-flyer.ts tests/unit/lib/domain/free-slots-flyer.test.ts
git commit -m "feat(asistente): the free-slots flyer layout and its WhatsApp text"
```

---

### Task 12: The flyer image (1080×1920)

**Files:**
- Modify: `lib/brand/brand-images.tsx` (export `Mark`)
- Create: `lib/brand/free-slots-image.tsx`
- Test: `tests/unit/lib/brand/free-slots-image.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/brand/free-slots-image.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { FLYER_SIZE, freeSlotsImage } from '@/lib/brand/free-slots-image'
import { clubTheme } from '@/lib/domain/club-theme'
import { flyerLayout } from '@/lib/domain/free-slots-flyer'
import { at, makeGrid, occupancy } from '../../fixtures/grid'

const BRAND = { name: 'Rustic Pádel', colors: clubTheme({ primary: '#FCB021', background: '#021716' }).dark, logo: null }
const TEXT = { day: 'JUEVES 1/10', contact: 'Consultanos: 092 369 558' }

describe('freeSlotsImage', () => {
  it('draws a vertical PNG that no CDN keeps', async () => {
    const layout = flyerLayout(makeGrid({ occupancies: [occupancy('o1', 'court-2', '20:00', '21:30')], now: at('12:00') }))
    const image = freeSlotsImage(BRAND, layout, TEXT)
    expect(FLYER_SIZE).toEqual({ width: 1080, height: 1920 })
    expect(image.headers.get('content-type')).toBe('image/png')
    expect(image.headers.get('cache-control')).toBe('private, no-store')
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })

  it('still draws a day with nothing free', async () => {
    const image = freeSlotsImage(BRAND, flyerLayout(makeGrid({ now: at('22:00') })), TEXT)
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/lib/brand/free-slots-image.test.ts`
Expected: FAIL (`Cannot find module '@/lib/brand/free-slots-image'`).

- [ ] **Step 3: Export `Mark`**

In `lib/brand/brand-images.tsx`, replace

```tsx
function Mark({ brand, size }: { brand: LoadedBrand; size: number }) {
```

with

```tsx
export function Mark({ brand, size }: { brand: LoadedBrand; size: number }) {
```

- [ ] **Step 4: Implement the image**

`lib/brand/free-slots-image.tsx`:

```tsx
import { ImageResponse } from 'next/og'
import { hasFreeSlots, type FlyerLayout } from '@/lib/domain/free-slots-flyer'
import { Mark } from './brand-images'
import type { LoadedBrand } from './load-brand'

export const FLYER_SIZE = { width: 1080, height: 1920 }
// Staff only and drawn from the day's grid: never kept by a CDN.
const HEADERS = { 'cache-control': 'private, no-store' }

// The cross over a taken time: two lines from side to side. ImageResponse has no glyph we can trust for it.
function Cross({ color }: { color: string }) {
  const line = { position: 'absolute' as const, left: '8%', top: '50%', width: '84%', height: 4, background: color }
  return (
    <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div style={{ ...line, transform: 'rotate(18deg)' }} />
      <div style={{ ...line, transform: 'rotate(-18deg)' }} />
    </div>
  )
}

// The free slots of a day as clubs post them: the title, the day, the courts in columns with the times in pills of
// the club's color (the taken ones crossed out), and the mark with the WhatsApp at the bottom. ImageResponse only
// knows flexbox and inline styles.
export function freeSlotsImage(brand: LoadedBrand, layout: FlyerLayout, text: { day: string; contact: string }): ImageResponse {
  const { colors } = brand
  const pillHeight = layout.compact ? 64 : 88
  const pillFont = layout.compact ? 34 : 46
  const columnWidth = layout.narrow ? 150 : 230
  return new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: 72, gap: 56, background: colors.bg, color: colors.fg }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', fontSize: 124, fontWeight: 700, color: colors.accent }}>TURNOS LIBRES</div>
          <div style={{ display: 'flex', fontSize: 56, fontWeight: 700 }}>{text.day}</div>
        </div>
        {hasFreeSlots(layout) ? (
          <div style={{ display: 'flex', flex: 1, justifyContent: 'center', gap: layout.narrow ? 16 : 28 }}>
            {layout.columns.map((column, index) => (
              <div key={column.courtId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: columnWidth }}>
                <div style={{ display: 'flex', fontSize: layout.narrow ? 30 : 40, fontWeight: 700, textAlign: 'center' }}>{column.name}</div>
                {layout.rows.map((row) => {
                  const cell = row.cells[index]
                  if (cell === 'none') return <div key={row.label} style={{ display: 'flex', height: pillHeight }} />
                  const free = cell === 'free'
                  return (
                    <div
                      key={row.label}
                      style={{
                        display: 'flex',
                        position: 'relative',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: pillHeight,
                        borderRadius: pillHeight / 2,
                        fontSize: pillFont,
                        fontWeight: 700,
                        background: free ? colors.accent : 'transparent',
                        color: free ? colors['on-accent'] : colors['fg-muted'],
                        border: `3px solid ${free ? colors.accent : colors['fg-muted']}`,
                      }}
                    >
                      {row.label}
                      {free ? null : <Cross color={colors['fg-muted']} />}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', fontSize: 56, textAlign: 'center' }}>
            No quedan turnos libres este día.
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
          <Mark brand={brand} size={140} />
          <div style={{ display: 'flex', fontSize: 48, fontWeight: 700 }}>{text.contact}</div>
        </div>
      </div>
    ),
    { ...FLYER_SIZE, headers: HEADERS },
  )
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/lib/brand`
Expected: PASS (the new test and `brand-images.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add lib/brand/brand-images.tsx lib/brand/free-slots-image.tsx tests/unit/lib/brand/free-slots-image.test.ts
git commit -m "feat(asistente): the vertical free-slots flyer image"
```

---

### Task 13: The flyer route

**Files:**
- Create: `app/(club)/club/asistente/flyer/route.ts`

# (no unit test — wiring of tested parts; the e2e in Task 24 fetches it)

- [ ] **Step 1: Implement**

`app/(club)/club/asistente/flyer/route.ts`:

```ts
import { getSiteUrl } from '@/lib/auth/redirect'
import { getViewer } from '@/lib/auth/viewer'
import { freeSlotsImage } from '@/lib/brand/free-slots-image'
import { loadBrand } from '@/lib/brand/load-brand'
import { loadDayGrid } from '@/lib/data/day'
import { flyerContact, flyerDayText, flyerLayout } from '@/lib/domain/free-slots-flyer'
import { isLocalDate } from '@/lib/domain/input'
import { isStaffRole } from '@/lib/domain/profile'
import { localDateOf } from '@/lib/domain/time'

// GET /club/asistente/flyer?date=YYYY-MM-DD: the free-slots flyer of that day (today without a date), for
// reception to post. Staff only: it is drawn from the club's grid.
export async function GET(request: Request) {
  const viewer = await getViewer()
  if (!viewer?.membership || !isStaffRole(viewer.membership.role)) {
    return new Response('No tenés permiso para ver esto.', { status: 403 })
  }
  const { club } = viewer
  const now = new Date()
  const requested = new URL(request.url).searchParams.get('date')
  const date = isLocalDate(requested) ? requested : localDateOf(now, club.timezone)
  const [brand, grid] = await Promise.all([
    loadBrand(),
    loadDayGrid(club, date, { userId: viewer.userId, audience: 'staff' }, now),
  ])
  return freeSlotsImage(brand, flyerLayout(grid), {
    day: flyerDayText(date).toUpperCase(),
    contact: flyerContact(club.phone, getSiteUrl()),
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(club)/club/asistente/flyer/route.ts"
git commit -m "feat(asistente): serve the free-slots flyer of a day to staff"
```

---

### Task 14: "WhatsApp del club" in Ajustes

**Files:**
- Modify: `lib/domain/settings.ts` (append)
- Modify: `app/(club)/club/ajustes/actions.ts`
- Modify: `app/(club)/club/ajustes/page.tsx`
- Test: `tests/unit/lib/domain/settings.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/unit/lib/domain/settings.test.ts`, replace

```ts
import { describeDays, parseClubName, parseClubSettings, parsePricingRule, TIME_OPTIONS } from '@/lib/domain/settings'
```

with

```ts
import { describeDays, parseClubName, parseClubPhone, parseClubSettings, parsePricingRule, TIME_OPTIONS } from '@/lib/domain/settings'
```

and append:

```ts
describe('parseClubPhone', () => {
  const form = (phone: string) => {
    const data = new FormData()
    data.set('phone', phone)
    return data
  }

  it('keeps only the digits, the way the flyer reads them', () => {
    expect(parseClubPhone(form(' 092 369 558 '))).toEqual({ ok: true, value: { phone: '092369558' } })
    expect(parseClubPhone(form('+598 92 369 558'))).toEqual({ ok: true, value: { phone: '092369558' } })
  })

  it('clears it when left empty', () => {
    expect(parseClubPhone(form('  '))).toEqual({ ok: true, value: { phone: null } })
  })

  it('asks for 8 to 15 digits', () => {
    expect(parseClubPhone(form('123'))).toEqual({ ok: false, message: 'Revisá el teléfono: tiene que tener entre 8 y 15 números.' })
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/lib/domain/settings.test.ts`
Expected: FAIL (`parseClubPhone` is not exported).

- [ ] **Step 3: Implement the parser**

In `lib/domain/settings.ts`, replace

```ts
import { WEEKDAYS_SHORT } from './format'
```

with

```ts
import { normalizePhone } from './championships'
import { WEEKDAYS_SHORT } from './format'
```

and append:

```ts
// Ajustes → "WhatsApp del club": what the free-slots flyer and its text show. Empty clears it. Digits only, like
// private.normalize_phone; the clubs check constraint has the last word.
export function parseClubPhone(form: FormData): ParseResult<{ phone: string | null }> {
  const raw = form.get('phone')
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (text === '') return { ok: true, value: { phone: null } }
  const phone = text.length <= 30 ? normalizePhone(text) : null
  return phone ? { ok: true, value: { phone } } : fail('Revisá el teléfono: tiene que tener entre 8 y 15 números.')
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/lib/domain/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the action**

In `app/(club)/club/ajustes/actions.ts`, replace

```ts
import { parseClubName, parseClubSettings, parsePricingRule } from '@/lib/domain/settings'
```

with

```ts
import { parseClubName, parseClubPhone, parseClubSettings, parsePricingRule } from '@/lib/domain/settings'
```

and right after the `updateClubName` function add:

```ts
// Ajustes → "WhatsApp del club": the free-slots flyer shows it. The clubs check constraint has the last word.
export async function updateClubPhone(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  const parsed = parseClubPhone(form)
  if (!parsed.ok) return failed(parsed.message)

  const supabase = await createClient()
  const { data, error } = await supabase.from('clubs').update(parsed.value).eq('id', clubId).select('id')
  if (error) return failed('No pudimos guardar el WhatsApp. Revisá el número.')
  if (data.length === 0) return FORBIDDEN
  revalidateBookings()
  return ok(
    parsed.value.phone
      ? 'WhatsApp guardado. Sale en el flyer de turnos libres.'
      : 'Sacamos el WhatsApp. El flyer muestra el link de la app.',
  )
}
```

# (no unit test for the action — same shape as updateClubName; the parser is tested)

- [ ] **Step 6: Add the section**

In `app/(club)/club/ajustes/page.tsx`, replace

```tsx
import { addCourt, addPricingRule, deleteCourt, deletePricingRule, updateClubName, updateClubSettings, updateCourt, updateLoyalty, removeClubLogo, saveClubBrand, saveClubLogo } from './actions'
```

with

```tsx
import { addCourt, addPricingRule, deleteCourt, deletePricingRule, updateClubName, updateClubPhone, updateClubSettings, updateCourt, updateLoyalty, removeClubLogo, saveClubBrand, saveClubLogo } from './actions'
```

and replace

```tsx
            <p className="text-sm text-fg-muted">Se ve arriba en todas las pantallas, en la pestaña y al compartir links.</p>
          </ActionForm>
        </Card>
      </section>
```

with

```tsx
            <p className="text-sm text-fg-muted">Se ve arriba en todas las pantallas, en la pestaña y al compartir links.</p>
          </ActionForm>
        </Card>
      </section>

      <section aria-labelledby="whatsapp" className="flex flex-col gap-3">
        <h2 id="whatsapp" className="font-display text-2xl font-bold uppercase">
          WhatsApp del club
        </h2>
        <Card>
          <ActionForm action={updateClubPhone} submitLabel="Guardar WhatsApp">
            <Field label="WhatsApp" htmlFor="club-phone">
              <input
                id="club-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                maxLength={30}
                defaultValue={club.phone ?? ''}
                placeholder="092 369 558"
                className={inputClasses}
              />
            </Field>
            <p className="text-sm text-fg-muted">
              Sale en el flyer de turnos libres del Asistente. Dejalo vacío para mostrar el link de la app.
            </p>
          </ActionForm>
        </Card>
      </section>
```

- [ ] **Step 7: Typecheck and test**

Run: `npm run typecheck && npx vitest run tests/unit/lib/domain/settings.test.ts tests/unit/app/ajustes`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/domain/settings.ts tests/unit/lib/domain/settings.test.ts "app/(club)/club/ajustes/actions.ts" "app/(club)/club/ajustes/page.tsx"
git commit -m "feat(ajustes): the club's WhatsApp, for the free-slots flyer"
```

---

### Task 15: The "Asistente" tab

**Files:**
- Modify: `lib/club/tabs.ts`
- Test: `tests/unit/lib/club/tabs.test.ts`

- [ ] **Step 1: Update the test**

Replace the body of `tests/unit/lib/club/tabs.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { clubTabs } from '@/lib/club/tabs'

describe('clubTabs', () => {
  it('shows the day-to-day screens to reception', () => {
    expect(clubTabs('reception').map((tab) => tab.label)).toEqual([
      'Inicio', 'Grilla', 'Asistente', 'Calendario', 'Torneos', 'Day use', 'Cobros', 'Jugadores',
    ])
  })

  it('adds the settings to admins', () => {
    expect(clubTabs('admin').map((tab) => tab.href)).toEqual([
      '/club/inicio', '/club/grilla', '/club/asistente', '/club/calendario', '/club/torneos', '/club/day-use', '/club/cobros', '/club/jugadores', '/club/ajustes',
    ])
  })

  it('gives every tab an icon', () => {
    expect(clubTabs('admin').map((tab) => tab.icon)).toEqual(['home', 'grid', 'racket', 'calendar', 'trophy', 'ticket', 'cash', 'users', 'sliders'])
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/lib/club/tabs.test.ts`
Expected: FAIL (no "Asistente").

- [ ] **Step 3: Implement**

In `lib/club/tabs.ts`, replace

```ts
    { href: '/club/grilla', label: 'Grilla', icon: 'grid' },
```

with

```ts
    { href: '/club/grilla', label: 'Grilla', icon: 'grid' },
    { href: '/club/asistente', label: 'Asistente', icon: 'racket' },
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/lib/club tests/unit/components/nav`
Expected: PASS. If a nav test counts the club tabs, update its expected list the same way.

- [ ] **Step 5: Commit**

```bash
git add lib/club/tabs.ts tests/unit/lib/club/tabs.test.ts
git commit -m "feat(asistente): the Asistente tab in the club's panel"
```

---

### Task 16: Server actions — create the match, invite

**Files:**
- Modify: `lib/actions/result.ts` (append)
- Create: `app/(club)/club/asistente/actions.ts`
- Test: `tests/unit/lib/actions/assistant-actions.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/actions/assistant-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>>(
  async () => ({ data: null, error: null }),
)
const revalidateBookings = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))

const { createStaffMatch, inviteToMatch } = await import('@/app/(club)/club/asistente/actions')
const { errorMessage } = await import('@/lib/domain/errors')
const IDLE = { status: 'idle' as const }
const COURT = 'c0000000-0000-0000-0000-000000000001'
const MATCH = 'e0000000-0000-0000-0000-000000000001'
const PLAYER = '00000000-0000-0000-0000-0000000000b1'
const VALID = {
  courtId: COURT,
  startsAt: '2026-11-24T22:00:00.000Z',
  categoryMin: '5',
  categoryMax: '6',
  matchType: 'mixed',
  allowOtherCourt: 'on',
}

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null })
  revalidateBookings.mockClear()
})

describe('createStaffMatch', () => {
  it('creates the match with its four spots free and hands back its id', async () => {
    rpc.mockResolvedValueOnce({ data: { id: MATCH }, error: null })
    expect(await createStaffMatch(IDLE, form(VALID))).toEqual({
      status: 'ok',
      message: 'Partido creado con los 4 lugares libres. Invitá a los que suelen jugar.',
      matchId: MATCH,
    })
    expect(rpc).toHaveBeenCalledWith('staff_create_match', {
      p_court_id: COURT,
      p_starts_at: '2026-11-24T22:00:00.000Z',
      p_allow_other_court: true,
      p_category_min: 5,
      p_category_max: 6,
      p_match_type: 'mixed',
    })
    expect(revalidateBookings).toHaveBeenCalled()
  })

  it('checks the form before the database', async () => {
    expect(await createStaffMatch(IDLE, form({ ...VALID, categoryMin: '6', categoryMax: '5' }))).toEqual({
      status: 'error',
      message: 'La categoría "desde" tiene que ser menor o igual que "hasta".',
    })
    expect(await createStaffMatch(IDLE, form({ ...VALID, matchType: 'doubles' }))).toEqual({
      status: 'error',
      message: errorMessage('invalid_input'),
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('shows what the database refused', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'slot_taken' } })
    expect(await createStaffMatch(IDLE, form(VALID))).toEqual({ status: 'error', message: errorMessage('slot_taken') })
    expect(revalidateBookings).not.toHaveBeenCalled()
  })
})

describe('inviteToMatch', () => {
  it('invites and says how many', async () => {
    rpc.mockResolvedValueOnce({ data: 1, error: null })
    expect(await inviteToMatch(MATCH, [PLAYER])).toEqual({ ok: true, invited: 1 })
    expect(rpc).toHaveBeenCalledWith('invite_to_match', { p_match_id: MATCH, p_player_ids: [PLAYER] })
    expect(revalidateBookings).toHaveBeenCalled()
  })

  it('refuses ids that are not uuids, an empty list, and what the database refused', async () => {
    expect(await inviteToMatch(MATCH, ['nope'])).toEqual({ ok: false, message: errorMessage('invalid_input') })
    expect(await inviteToMatch(MATCH, [])).toEqual({ ok: false, message: errorMessage('invalid_input') })
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'match_closed' } })
    expect(await inviteToMatch(MATCH, [PLAYER])).toEqual({ ok: false, message: errorMessage('match_closed') })
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/lib/actions/assistant-actions.test.ts`
Expected: FAIL (`Cannot find module '@/app/(club)/club/asistente/actions'`).

- [ ] **Step 3: Add the result types**

Append to `lib/actions/result.ts`:

```ts
// The assistant's "Crear partido": the state also carries the new match, so the sheet moves on to inviting.
export type CreatedState = ActionState & { matchId?: string }
export type CreateMatchAction = (previous: CreatedState, form: FormData) => Promise<CreatedState>
// The assistant's "Invitar": called with arguments, not a form, from the invite list.
export type InviteResult = { ok: true; invited: number } | { ok: false; message: string }
export type InviteAction = (matchId: string, playerIds: string[]) => Promise<InviteResult>
```

- [ ] **Step 4: Implement the actions**

`app/(club)/club/asistente/actions.ts`:

```ts
'use server'

import { failed, ok, type CreatedState, type InviteResult } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { errorMessage } from '@/lib/domain/errors'
import { isUuid, readBoolean, readEnum, readInstant, readInt, readUuid } from '@/lib/domain/input'
import { MATCH_TYPES } from '@/lib/domain/matches'
import { createClient } from '@/lib/supabase/server'

// Same cap as public.invite_to_match.
const MAX_INVITES = 50

// Asistente → "Crear partido": the match with its four spots free. The RPC checks staff and every rule.
export async function createStaffMatch(_previous: CreatedState, form: FormData): Promise<CreatedState> {
  const courtId = readUuid(form, 'courtId')
  const startsAt = readInstant(form, 'startsAt')
  const matchType = readEnum(form, 'matchType', MATCH_TYPES)
  const categoryMin = readInt(form, 'categoryMin', { min: 1, max: 8 })
  const categoryMax = readInt(form, 'categoryMax', { min: 1, max: 8 })
  if (!courtId || !startsAt || !matchType || categoryMin === null || categoryMax === null) {
    return failed(errorMessage('invalid_input'))
  }
  if (categoryMin > categoryMax) return failed('La categoría "desde" tiene que ser menor o igual que "hasta".')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('staff_create_match', {
    p_court_id: courtId,
    p_starts_at: startsAt,
    p_allow_other_court: readBoolean(form, 'allowOtherCourt'),
    p_category_min: categoryMin,
    p_category_max: categoryMax,
    p_match_type: matchType,
  })
  if (error) return failed(errorMessage(error.message))
  revalidateBookings()
  return { ...ok('Partido creado con los 4 lugares libres. Invitá a los que suelen jugar.'), matchId: data.id }
}

// Asistente → "Invitar": an aviso and a mail to each player (the outbox mails it after the response).
export async function inviteToMatch(matchId: string, playerIds: string[]): Promise<InviteResult> {
  if (!isUuid(matchId) || playerIds.length === 0 || playerIds.length > MAX_INVITES || !playerIds.every(isUuid)) {
    return { ok: false, message: errorMessage('invalid_input') }
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('invite_to_match', { p_match_id: matchId, p_player_ids: playerIds })
  if (error) return { ok: false, message: errorMessage(error.message) }
  revalidateBookings()
  return { ok: true, invited: data }
}
```

- [ ] **Step 5: Run the test and typecheck**

Run: `npx vitest run tests/unit/lib/actions/assistant-actions.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/result.ts "app/(club)/club/asistente/actions.ts" tests/unit/lib/actions/assistant-actions.test.ts
git commit -m "feat(asistente): actions to create a staff match and invite players"
```

---

### Task 17: The day's data — `loadAssistantDay`

**Files:**
- Create: `lib/data/assistant.ts`

# (no unit test — reads Supabase; the logic it calls is tested, and the e2e covers the screen)

- [ ] **Step 1: Implement**

`lib/data/assistant.ts`:

```ts
import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import { boardOf, buildableSlots, slotKey, type AssistantBoard } from '@/lib/domain/assistant-board'
import type { DayGrid } from '@/lib/domain/grid'
import type { CandidateRow } from '@/lib/domain/slot-planner'
import type { LocalDate } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'
import { loadDayGrid } from './day'

export type AssistantDay = { grid: DayGrid; board: AssistantBoard }

// The assistant's day, read with staff's session: the grid (with its forming matches) and, for each free slot that
// still takes a match, who could play it. One slot_candidates call per slot (about 40 on a full day); if that ever
// weighs, join them in one RPC per day.
export async function loadAssistantDay(
  club: Club,
  date: LocalDate,
  viewer: { userId: string },
  now = new Date(),
): Promise<AssistantDay> {
  const grid = await loadDayGrid(club, date, { userId: viewer.userId, audience: 'staff' }, now)
  const supabase = await createClient()
  const answers = await Promise.all(
    buildableSlots(grid, now, club.match_close_hours).map(async (slot): Promise<[string, CandidateRow[]]> => {
      const { data, error } = await supabase.rpc('slot_candidates', {
        p_court_id: slot.courtId,
        p_starts_at: slot.startsAt.toISOString(),
      })
      if (error) throw error
      return [slotKey(slot.courtId, slot.startsAt), data]
    }),
  )
  return { grid, board: boardOf(grid, new Map(answers)) }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. If supabase-js types the RPC rows slightly differently from `CandidateRow` (for example `side` without `null`), that is still assignable; if it is not, adjust `CandidateRow` to match the generated type — never cast.

- [ ] **Step 3: Commit**

```bash
git add lib/data/assistant.ts
git commit -m "feat(asistente): load the assistant's day"
```

---

### Task 18: The free-slots board

**Files:**
- Create: `components/assistant/reason-chips.tsx`
- Create: `components/assistant/free-board.tsx`
- Test: `tests/unit/components/assistant/free-board.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/assistant/free-board.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FreeBoard } from '@/components/assistant/free-board'
import type { AssistantBoard } from '@/lib/domain/assistant-board'
import { boardSlot, strongRows } from '../../fixtures/assistant'

const hot = boardSlot('court-1', '16:00', strongRows(8))
const quiet = boardSlot('court-2', '17:30', [])
const BOARD: AssistantBoard = {
  courts: [
    { id: 'court-1', name: 'Cancha 1' },
    { id: 'court-2', name: 'Cancha 2' },
  ],
  rows: [
    { label: '16:00', cells: [{ state: 'free', slot: hot }, { state: 'taken' }] },
    { label: '17:30', cells: [{ state: 'forming', matchId: 'm1', filled: 2 }, { state: 'free', slot: quiet }] },
    { label: '19:00', cells: [{ state: 'free', slot: null }, { state: 'none' }] },
  ],
}

describe('FreeBoard', () => {
  it('shows the demand on a free slot and opens it', async () => {
    const onPick = vi.fn()
    render(<FreeBoard board={BOARD} onPick={onPick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Armar partido · Cancha 1 · 16:00 · 🔥 8 posibles' }))
    expect(onPick).toHaveBeenCalledWith(hot)
    expect(screen.getByRole('button', { name: 'Armar partido · Cancha 2 · 17:30' })).toBeInTheDocument()
  })

  it('says a taken slot with words, not only with a strike', () => {
    render(<FreeBoard board={BOARD} onPick={vi.fn()} />)
    const court2 = screen.getByRole('region', { name: 'Cancha 2' })
    expect(within(court2).getByText('16:00', { selector: 's' })).toBeInTheDocument()
    expect(within(court2).getByText('Ocupado')).toBeInTheDocument()
  })

  it('links a forming match and does not offer a slot past the match closing time', () => {
    render(<FreeBoard board={BOARD} onPick={vi.fn()} />)
    expect(screen.getByRole('link', { name: '17:30 · Armándose 2/4' })).toHaveAttribute('href', '/partidos/m1')
    expect(within(screen.getByRole('region', { name: 'Cancha 1' })).getByText('19:00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /19:00/ })).not.toBeInTheDocument()
  })

  it('says when nothing is free', () => {
    render(<FreeBoard board={{ courts: BOARD.courts, rows: [{ label: '16:00', cells: [{ state: 'taken' }, { state: 'taken' }] }] }} onPick={vi.fn()} />)
    expect(screen.getByText('No quedan turnos libres este día.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/components/assistant/free-board.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the chips**

`components/assistant/reason-chips.tsx`:

```tsx
import { cn } from '@/lib/cn'
import type { Chip } from '@/lib/domain/match-suggestions'

// Why someone is a candidate: "Jugó 4 veces los martes 19:00". The strong reasons stand out.
export function ReasonChips({ name, chips }: { name: string; chips: Chip[] }) {
  if (chips.length === 0) return null
  return (
    <ul aria-label={`Por qué ${name}`} className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <li
          key={chip.text}
          className={cn(
            'rounded-full border px-2 py-0.5 text-xs',
            chip.hit ? 'border-court-ink text-court-ink' : 'border-border text-fg-muted',
          )}
        >
          {chip.text}
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Implement the board**

`components/assistant/free-board.tsx`:

```tsx
'use client'

import Link from 'next/link'
import type { AssistantBoard, BoardCell, BoardSlot } from '@/lib/domain/assistant-board'
import { demandText } from '@/lib/domain/slot-planner'

const CHIP = 'flex min-h-11 w-full items-center rounded-xl px-3 py-2'

function Cell({ cell, courtName, label, onPick }: { cell: BoardCell; courtName: string; label: string; onPick: (slot: BoardSlot) => void }) {
  if (cell.state === 'taken') {
    return (
      <span className={`${CHIP} text-fg-muted`}>
        <s>{label}</s>
        <span className="sr-only"> Ocupado</span>
      </span>
    )
  }
  if (cell.state === 'forming') {
    return (
      <Link href={`/partidos/${cell.matchId}`} className={`${CHIP} border border-border bg-surface font-semibold text-accent-ink`}>
        {label} · Armándose {cell.filled}/4
      </Link>
    )
  }
  if (cell.state === 'none') return null
  const { slot } = cell
  if (!slot) {
    return (
      <span className={`${CHIP} border border-border`}>
        <span>{label}</span>
        <span className="sr-only">, libre</span>
      </span>
    )
  }
  const demand = slot.proposal ? demandText(slot.proposal) : null
  return (
    <button
      type="button"
      onClick={() => onPick(slot)}
      aria-label={`Armar partido · ${courtName} · ${label}${demand ? ` · ${demand}` : ''}`}
      className={`${CHIP} flex-col items-start border-2 border-accent bg-surface text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
    >
      <span className="font-semibold">{label}</span>
      {demand ? <span className="text-sm text-fg-muted">{demand}</span> : null}
    </button>
  )
}

// Courts in columns, the times still to come in chips: a free one opens "Armar partido", a taken one is struck out
// and says so, a forming match leads to it.
export function FreeBoard({ board, onPick }: { board: AssistantBoard; onPick: (slot: BoardSlot) => void }) {
  const anyFree = board.rows.some((row) => row.cells.some((cell) => cell.state === 'free'))
  return (
    <section aria-labelledby="libres" className="flex flex-col gap-3">
      <h2 id="libres" className="font-display text-2xl font-bold uppercase">
        Tablero de libres
      </h2>
      {anyFree ? null : <p className="rounded-xl border border-border p-4 text-fg-muted">No quedan turnos libres este día.</p>}
      {board.rows.length > 0 ? (
        <div className="-mx-4 overflow-x-auto px-4">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${board.courts.length}, minmax(8.5rem, 1fr))` }}>
            {board.courts.map((court, index) => (
              <section key={court.id} aria-label={court.name} className="flex flex-col gap-2">
                <h3 className="font-semibold">{court.name}</h3>
                <ul className="flex flex-col gap-2">
                  {board.rows.map((row) => {
                    const cell = row.cells[index]
                    if (!cell || cell.state === 'none') return null
                    return (
                      <li key={row.label}>
                        <Cell cell={cell} courtName={court.name} label={row.label} onPick={onPick} />
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/unit/components/assistant/free-board.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/assistant/reason-chips.tsx components/assistant/free-board.tsx tests/unit/components/assistant/free-board.test.tsx
git commit -m "feat(asistente): the free-slots board"
```

---

### Task 19: "Recomendados para armar"

**Files:**
- Create: `components/assistant/recommended-slots.tsx`
- Test: `tests/unit/components/assistant/recommended-slots.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/assistant/recommended-slots.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RecommendedSlots } from '@/components/assistant/recommended-slots'
import { boardSlot, strongRows } from '../../fixtures/assistant'

describe('RecommendedSlots', () => {
  it('lists the slots worth a match and opens one', async () => {
    const onPick = vi.fn()
    const slot = boardSlot('court-2', '20:00', strongRows(8))
    const text = 'Jueves 20:00 · Cancha 2 · 5ª masculino · 8 posibles'
    render(<RecommendedSlots items={[{ slot, text }]} onPick={onPick} />)
    expect(screen.getByRole('heading', { name: 'Recomendados para armar' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: `Armar ${text}` }))
    expect(onPick).toHaveBeenCalledWith(slot)
  })

  it('is not there when no slot has demand', () => {
    const { container } = render(<RecommendedSlots items={[]} onPick={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/components/assistant/recommended-slots.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`components/assistant/recommended-slots.tsx`:

```tsx
'use client'

import { Button } from '@/components/ui/button'
import type { BoardSlot } from '@/lib/domain/assistant-board'

// Up to three slots where a match is likely to fill, with "Armar". Nothing when no slot has demand.
export function RecommendedSlots({ items, onPick }: { items: { slot: BoardSlot; text: string }[]; onPick: (slot: BoardSlot) => void }) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby="recomendados" className="flex flex-col gap-3">
      <h2 id="recomendados" className="font-display text-2xl font-bold uppercase">
        Recomendados para armar
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map(({ slot, text }) => (
          <li key={slot.key} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
            <p className="font-semibold">{text}</p>
            <Button size="sm" onClick={() => onPick(slot)} aria-label={`Armar ${text}`}>
              Armar
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/components/assistant/recommended-slots.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/assistant/recommended-slots.tsx tests/unit/components/assistant/recommended-slots.test.tsx
git commit -m "feat(asistente): the recommended slots"
```

---

### Task 20: The invite list

**Files:**
- Create: `components/assistant/invite-list.tsx`
- Test: `tests/unit/components/assistant/invite-list.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/assistant/invite-list.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InviteList } from '@/components/assistant/invite-list'
import type { InviteAction } from '@/lib/actions/result'
import type { CandidateView } from '@/lib/domain/slot-planner'

const CANDIDATES: CandidateView[] = [
  { playerId: 'b', name: 'Bruno Díaz', score: 28, strong: true, chips: [{ text: 'Suele estar libre los jueves de noche', hit: true }] },
  { playerId: 'h', name: 'Hugo Paz', score: 20, strong: true, chips: [] },
]
const MESSAGE = '🎾 Jueves 1/10 20:00 · Cancha 2 · 5ª/6ª mixto\nSumate acá: https://rustic.app/partidos/m9'

describe('InviteList', () => {
  it('invites one player, marks her and does not offer it again', async () => {
    const inviteAction = vi.fn<InviteAction>(async (_matchId, ids) => ({ ok: true, invited: ids.length }))
    render(<InviteList matchId="m9" candidates={CANDIDATES} message={MESSAGE} inviteAction={inviteAction} />)
    expect(screen.getByRole('list', { name: 'Por qué Bruno Díaz' })).toHaveTextContent('Suele estar libre')
    await userEvent.click(screen.getByRole('button', { name: 'Invitar a Bruno Díaz' }))
    expect(inviteAction).toHaveBeenCalledWith('m9', ['b'])
    expect(await screen.findByText('Invitado ✓')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Invitar a Bruno Díaz' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Le avisamos en la app y por mail.')
  })

  it('invites the best ones at once', async () => {
    const inviteAction = vi.fn<InviteAction>(async (_matchId, ids) => ({ ok: true, invited: ids.length }))
    render(<InviteList matchId="m9" candidates={CANDIDATES} message={MESSAGE} inviteAction={inviteAction} />)
    await userEvent.click(screen.getByRole('button', { name: 'Invitar a los mejores 2' }))
    expect(inviteAction).toHaveBeenCalledWith('m9', ['b', 'h'])
    await waitFor(() => expect(screen.getAllByText('Invitado ✓')).toHaveLength(2))
  })

  it('opens WhatsApp with the invitation and the match link', () => {
    render(<InviteList matchId="m9" candidates={CANDIDATES} message={MESSAGE} inviteAction={vi.fn<InviteAction>()} />)
    const href = screen.getByRole('link', { name: 'WhatsApp a Hugo Paz' }).getAttribute('href') ?? ''
    expect(href).toContain(encodeURIComponent('Hola Hugo!'))
    expect(href).toContain(encodeURIComponent('https://rustic.app/partidos/m9'))
  })

  it('says why an invitation failed', async () => {
    const inviteAction = vi.fn<InviteAction>(async () => ({ ok: false, message: 'El partido ya no está abierto.' }))
    render(<InviteList matchId="m9" candidates={CANDIDATES} message={MESSAGE} inviteAction={inviteAction} />)
    await userEvent.click(screen.getByRole('button', { name: 'Invitar a Hugo Paz' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El partido ya no está abierto.')
    expect(screen.queryByText('Invitado ✓')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/components/assistant/invite-list.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`components/assistant/invite-list.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { ReasonChips } from '@/components/assistant/reason-chips'
import { Button, buttonClasses } from '@/components/ui/button'
import type { InviteAction } from '@/lib/actions/result'
import { whatsappUrl } from '@/lib/domain/match-share'
import { inviteText } from '@/lib/domain/match-suggestions'
import type { CandidateView } from '@/lib/domain/slot-planner'

const BEST = 8

// The match is out: invite each candidate (an aviso in the app and a mail), or send her the message by WhatsApp.
// Whoever was invited is marked and cannot be invited again to this match.
export function InviteList({
  matchId,
  candidates,
  message,
  inviteAction,
}: {
  matchId: string
  candidates: CandidateView[]
  message: string
  inviteAction: InviteAction
}) {
  const [invited, setInvited] = useState<ReadonlySet<string>>(new Set())
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const best = candidates.filter((candidate) => !invited.has(candidate.playerId)).slice(0, BEST)

  function invite(ids: string[]) {
    startTransition(async () => {
      const answer = await inviteAction(matchId, ids)
      if (!answer.ok) {
        setResult({ ok: false, text: answer.message })
        return
      }
      setInvited((previous) => new Set([...previous, ...ids]))
      setResult({
        ok: true,
        text: ids.length === 1 ? 'Le avisamos en la app y por mail.' : `Les avisamos a ${ids.length} en la app y por mail.`,
      })
    })
  }

  return (
    <section aria-labelledby="invitar" className="flex flex-col gap-3">
      <h3 id="invitar" className="font-display text-xl font-bold uppercase">
        Invitá a los que suelen jugar
      </h3>
      {candidates.length === 0 ? (
        <p className="text-fg-muted">Nadie suele jugar a esta hora con esa categoría. Compartí el partido en el grupo del club.</p>
      ) : null}
      {best.length >= 2 ? (
        <Button onClick={() => invite(best.map((candidate) => candidate.playerId))} disabled={pending}>
          {`Invitar a los mejores ${best.length}`}
        </Button>
      ) : null}
      <ul className="flex flex-col gap-2">
        {candidates.map((candidate) => (
          <li key={candidate.playerId} className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <p className="font-semibold">{candidate.name}</p>
            <ReasonChips name={candidate.name} chips={candidate.chips} />
            <div className="flex flex-wrap gap-2">
              {invited.has(candidate.playerId) ? (
                <p className="inline-flex min-h-11 items-center font-semibold text-court-ink">Invitado ✓</p>
              ) : (
                <Button size="sm" onClick={() => invite([candidate.playerId])} disabled={pending} aria-label={`Invitar a ${candidate.name}`}>
                  Invitar
                </Button>
              )}
              <a
                href={whatsappUrl(inviteText(candidate.name, message))}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`WhatsApp a ${candidate.name}`}
                className={buttonClasses({ variant: 'secondary', size: 'sm' })}
              >
                WhatsApp
              </a>
            </div>
          </li>
        ))}
      </ul>
      {result ? (
        <p role={result.ok ? 'status' : 'alert'} className="text-sm">
          {result.text}
        </p>
      ) : null}
    </section>
  )
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/components/assistant/invite-list.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/assistant/invite-list.tsx tests/unit/components/assistant/invite-list.test.tsx
git commit -m "feat(asistente): invite the candidates by aviso and WhatsApp"
```

---

### Task 21: The "Armar partido" sheet

**Files:**
- Create: `components/assistant/build-match-sheet.tsx`
- Test: `tests/unit/components/assistant/build-match-sheet.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/assistant/build-match-sheet.test.tsx`:

```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BuildMatchSheet } from '@/components/assistant/build-match-sheet'
import type { CreateMatchAction, InviteAction } from '@/lib/actions/result'
import { boardSlot, candidate } from '../../fixtures/assistant'
import { at, TIMEZONE } from '../../fixtures/grid'

const ROWS = [
  candidate('a', { display_name: 'Ana' }),
  candidate('b', { display_name: 'Bruno', side: 'backhand' }),
  candidate('c', { display_name: 'Carlos' }),
  candidate('d', { display_name: 'Diego', side: 'backhand' }),
  candidate('e', { display_name: 'Eva', category: 6, gender: 'female', side: 'both' }),
]
const SLOT = boardSlot('court-2', '20:00', ROWS)

function renderSheet(createAction: CreateMatchAction, inviteAction: InviteAction = vi.fn<InviteAction>()) {
  return render(
    <BuildMatchSheet
      slot={SLOT}
      timezone={TIMEZONE}
      siteUrl="https://rustic.app"
      createAction={createAction}
      inviteAction={inviteAction}
      onClose={vi.fn()}
    />,
  )
}

describe('BuildMatchSheet', () => {
  it('starts with the proposal, and changing it changes who can play', async () => {
    renderSheet(vi.fn<CreateMatchAction>())
    const sheet = screen.getByRole('dialog', { name: 'Armar partido · Cancha 2 · 20:00' })
    expect(within(sheet).getByLabelText('Desde')).toHaveValue('5')
    expect(within(sheet).getByLabelText('Hasta')).toHaveValue('5')
    expect(within(sheet).getByLabelText('Tipo')).toHaveValue('male')
    expect(within(sheet).getByRole('heading', { name: 'Pueden jugar: 4' })).toBeInTheDocument()

    await userEvent.selectOptions(within(sheet).getByLabelText('Hasta'), '6')
    await userEvent.selectOptions(within(sheet).getByLabelText('Tipo'), 'mixed')
    expect(within(sheet).getByRole('heading', { name: 'Pueden jugar: 5' })).toBeInTheDocument()
    expect(within(sheet).getByText('Eva')).toBeInTheDocument()
  })

  it('creates the match with the choice and moves on to inviting', async () => {
    const createAction = vi.fn<CreateMatchAction>(async () => ({
      status: 'ok',
      message: 'Partido creado con los 4 lugares libres. Invitá a los que suelen jugar.',
      matchId: 'm9',
    }))
    renderSheet(createAction)
    await userEvent.selectOptions(screen.getByLabelText('Hasta'), '6')
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'mixed')
    await userEvent.click(screen.getByRole('button', { name: 'Crear partido' }))

    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1))
    const sent = createAction.mock.calls[0][1]
    expect(Object.fromEntries(sent.entries())).toEqual({
      courtId: 'court-2',
      startsAt: at('20:00').toISOString(),
      categoryMin: '5',
      categoryMax: '6',
      matchType: 'mixed',
      allowOtherCourt: 'on',
    })
    expect(await screen.findByRole('heading', { name: 'Invitá a los que suelen jugar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Invitar a Eva' })).toBeInTheDocument()
  })

  it('keeps the form with the reason when the database refuses', async () => {
    renderSheet(vi.fn<CreateMatchAction>(async () => ({ status: 'error', message: 'Esa cancha se acaba de ocupar. Elegí otro horario.' })))
    await userEvent.click(screen.getByRole('button', { name: 'Crear partido' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Esa cancha se acaba de ocupar.')
    expect(screen.getByRole('button', { name: 'Crear partido' })).toBeInTheDocument()
  })

  it('warns when a side is short', () => {
    render(
      <BuildMatchSheet
        slot={boardSlot('court-1', '20:00', [candidate('x'), candidate('y'), candidate('z'), candidate('w')])}
        timezone={TIMEZONE}
        siteUrl="https://rustic.app"
        createAction={vi.fn<CreateMatchAction>()}
        inviteAction={vi.fn<InviteAction>()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Pocos de revés')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/components/assistant/build-match-sheet.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`components/assistant/build-match-sheet.tsx`:

```tsx
'use client'

import { useActionState, useMemo, useState } from 'react'
import { InviteList } from '@/components/assistant/invite-list'
import { ReasonChips } from '@/components/assistant/reason-chips'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Field, inputClasses } from '@/components/ui/field'
import { IDLE, type CreateMatchAction, type CreatedState, type InviteAction } from '@/lib/actions/result'
import type { BoardSlot } from '@/lib/domain/assistant-board'
import { matchLine } from '@/lib/domain/match-invite-notifications'
import { MATCH_TYPE_LABELS, MATCH_TYPES } from '@/lib/domain/matches'
import { candidatesFor, DEFAULT_CHOICE, fits, isStrong, sideWarning, type Choice } from '@/lib/domain/slot-planner'

const CATEGORIES = [1, 2, 3, 4, 5, 6, 7, 8]

// "Armar partido" on a free slot: the proposal preloaded, who fits the choice and why, then "Crear partido". Once
// created, the same sheet invites.
export function BuildMatchSheet({
  slot,
  timezone,
  siteUrl,
  createAction,
  inviteAction,
  onClose,
}: {
  slot: BoardSlot
  timezone: string
  siteUrl: string
  createAction: CreateMatchAction
  inviteAction: InviteAction
  onClose: () => void
}) {
  const { proposal } = slot
  const [choice, setChoice] = useState<Choice>(
    proposal ? { categoryMin: proposal.categoryMin, categoryMax: proposal.categoryMax, type: proposal.type } : DEFAULT_CHOICE,
  )
  const [state, formAction, pending] = useActionState<CreatedState, FormData>(createAction, IDLE)
  const candidates = useMemo(
    () => candidatesFor(slot.rows, choice, { startsAt: slot.startsAt, courtName: slot.courtName, timezone }),
    [slot, choice, timezone],
  )
  const warning = sideWarning(slot.rows.filter((row) => fits(row, choice) && isStrong(row)))
  const matchId = state.status === 'ok' ? (state.matchId ?? null) : null

  return (
    <BottomSheet open onClose={onClose} title={`Armar partido · ${slot.courtName} · ${slot.label}`}>
      {matchId ? (
        <div className="flex flex-col gap-4">
          <p role="status">{state.message}</p>
          <InviteList
            matchId={matchId}
            candidates={candidates}
            message={`🎾 ${matchLine({ courtName: slot.courtName, startsAt: slot.startsAt, ...choice }, timezone)}\nSumate acá: ${siteUrl}/partidos/${matchId}`}
            inviteAction={inviteAction}
          />
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="courtId" value={slot.courtId} />
          <input type="hidden" name="startsAt" value={slot.startsAt.toISOString()} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Desde" htmlFor="build-min">
              <select
                id="build-min"
                name="categoryMin"
                value={choice.categoryMin}
                onChange={(event) => setChoice({ ...choice, categoryMin: Number(event.target.value) })}
                className={inputClasses}
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}ª
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hasta" htmlFor="build-max">
              <select
                id="build-max"
                name="categoryMax"
                value={choice.categoryMax}
                onChange={(event) => setChoice({ ...choice, categoryMax: Number(event.target.value) })}
                className={inputClasses}
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}ª
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Tipo" htmlFor="build-type">
            <select
              id="build-type"
              name="matchType"
              value={choice.type}
              onChange={(event) => {
                const type = MATCH_TYPES.find((value) => value === event.target.value)
                if (type) setChoice({ ...choice, type })
              }}
              className={inputClasses}
            >
              {MATCH_TYPES.map((type) => (
                <option key={type} value={type}>
                  {MATCH_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="allowOtherCourt" defaultChecked className="size-5 accent-accent" />
            Puede ir a otra cancha
          </label>

          <section aria-labelledby="build-candidates" className="flex flex-col gap-2">
            <h3 id="build-candidates" className="font-semibold">
              {candidates.length === 0 ? 'Nadie suele jugar a esta hora con esa categoría' : `Pueden jugar: ${candidates.length}`}
            </h3>
            {warning ? <p className="text-sm font-semibold text-court-ink">{warning}</p> : null}
            <ul className="flex flex-col gap-2">
              {candidates.map((candidate) => (
                <li key={candidate.playerId} className="flex flex-col gap-1 rounded-xl border border-border p-3">
                  <p className="font-semibold">{candidate.name}</p>
                  <ReasonChips name={candidate.name} chips={candidate.chips} />
                </li>
              ))}
            </ul>
          </section>

          {state.status === 'error' ? <p role="alert">{state.message}</p> : null}
          <Button type="submit" fullWidth disabled={pending}>
            {pending ? 'Creando…' : 'Crear partido'}
          </Button>
        </form>
      )}
    </BottomSheet>
  )
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/components/assistant/build-match-sheet.test.tsx`
Expected: PASS. If `useActionState` does not resolve in the test the way `ActionForm` tests expect, look at `tests/unit/app/ajustes/delete-court-button.test.tsx` for the pattern (`waitFor` on the action call, `findBy…` on the result).

- [ ] **Step 5: Commit**

```bash
git add components/assistant/build-match-sheet.tsx tests/unit/components/assistant/build-match-sheet.test.tsx
git commit -m "feat(asistente): the Armar partido sheet"
```

---

### Task 22: "Difundir libres" — preview and share

**Files:**
- Create: `components/assistant/flyer-share.tsx`
- Test: `tests/unit/components/assistant/flyer-share.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/assistant/flyer-share.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FlyerShare } from '@/components/assistant/flyer-share'
import { whatsappUrl } from '@/lib/domain/match-share'

const IMAGE = '/club/asistente/flyer?date=2026-10-01'
const TEXT = '🎾 Turnos libres — jueves 1/10\nCancha 1: 18:30'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) })))
  URL.createObjectURL = vi.fn(() => 'blob:flyer')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'share')
  Reflect.deleteProperty(navigator, 'canShare')
})

describe('FlyerShare', () => {
  it('shows the preview and downloads the image when the phone cannot share files', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<FlyerShare imageUrl={IMAGE} fileName="turnos-libres-2026-10-01.png" text={TEXT} />)
    expect(screen.getByRole('img', { name: 'Flyer de turnos libres' })).toHaveAttribute('src', IMAGE)
    await userEvent.click(screen.getByRole('button', { name: 'Compartir imagen' }))
    expect(fetch).toHaveBeenCalledWith(IMAGE)
    expect(await screen.findByRole('status')).toHaveTextContent('Bajamos la imagen.')
    expect(click).toHaveBeenCalled()
  })

  it('shares the image with the text when the phone can', async () => {
    const share = vi.fn(async () => {})
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    render(<FlyerShare imageUrl={IMAGE} fileName="turnos-libres-2026-10-01.png" text={TEXT} />)
    await userEvent.click(screen.getByRole('button', { name: 'Compartir imagen' }))
    expect(share).toHaveBeenCalledWith({ files: [expect.any(File)], text: TEXT })
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('copies the text and opens WhatsApp with it', async () => {
    const user = userEvent.setup()
    render(<FlyerShare imageUrl={IMAGE} fileName="turnos-libres-2026-10-01.png" text={TEXT} />)
    await user.click(screen.getByRole('button', { name: 'Copiar texto' }))
    await expect(navigator.clipboard.readText()).resolves.toBe(TEXT)
    expect(screen.getByRole('status')).toHaveTextContent('Texto copiado.')
    expect(screen.getByRole('link', { name: 'Abrir WhatsApp' })).toHaveAttribute('href', whatsappUrl(TEXT))
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/components/assistant/flyer-share.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`components/assistant/flyer-share.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button, buttonClasses } from '@/components/ui/button'
import { whatsappUrl } from '@/lib/domain/match-share'

type Status = 'idle' | 'downloaded' | 'copied' | 'failed'
const MESSAGES: Record<Exclude<Status, 'idle'>, string> = {
  downloaded: 'Bajamos la imagen. Adjuntala en WhatsApp o en tus historias.',
  copied: 'Texto copiado. Pegalo en el grupo del club.',
  failed: 'No pudimos hacerlo. Probá de nuevo en un momento.',
}

// "Difundir libres": the flyer's preview, "Compartir imagen" (the phone's share sheet with the file, or a download
// where there is none), "Copiar texto" and "Abrir WhatsApp".
export function FlyerShare({ imageUrl, fileName, text }: { imageUrl: string; fileName: string; text: string }) {
  const [status, setStatus] = useState<Status>('idle')

  async function shareImage() {
    try {
      const response = await fetch(imageUrl)
      if (!response.ok) throw new Error('No se pudo bajar el flyer')
      const blob = await response.blob()
      const file = new File([blob], fileName, { type: 'image/png' })
      if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text })
          return
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return
        }
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.click()
      URL.revokeObjectURL(url)
      setStatus('downloaded')
    } catch {
      setStatus('failed')
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
  }

  return (
    <section aria-labelledby="difundir" className="flex flex-col gap-3">
      <h2 id="difundir" className="font-display text-2xl font-bold uppercase">
        Difundir libres
      </h2>
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn per request by our route, not a static asset */}
      <img
        src={imageUrl}
        alt="Flyer de turnos libres"
        width={270}
        height={480}
        className="h-auto w-full max-w-xs self-center rounded-xl border border-border"
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={shareImage}>Compartir imagen</Button>
        <Button variant="secondary" onClick={copyText}>
          Copiar texto
        </Button>
        <a href={whatsappUrl(text)} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'secondary' })}>
          Abrir WhatsApp
        </a>
      </div>
      {status === 'idle' ? null : (
        <p role={status === 'failed' ? 'alert' : 'status'} className="text-sm">
          {MESSAGES[status]}
        </p>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/components/assistant/flyer-share.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/assistant/flyer-share.tsx tests/unit/components/assistant/flyer-share.test.tsx
git commit -m "feat(asistente): share the free-slots flyer and its text"
```

---

### Task 23: The screen `/club/asistente`

**Files:**
- Create: `components/assistant/assistant-screen.tsx`
- Create: `app/(club)/club/asistente/page.tsx`

# (no unit test — composition of tested components; the e2e in Task 24 covers it)

- [ ] **Step 1: The client composition**

`components/assistant/assistant-screen.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { BuildMatchSheet } from '@/components/assistant/build-match-sheet'
import { FreeBoard } from '@/components/assistant/free-board'
import { RecommendedSlots } from '@/components/assistant/recommended-slots'
import type { CreateMatchAction, InviteAction } from '@/lib/actions/result'
import type { AssistantBoard, BoardSlot } from '@/lib/domain/assistant-board'

// The recommendations and the board open the same sheet. The sheet keeps its slot while the page refreshes
// after creating or inviting.
export function AssistantScreen({
  board,
  recommended,
  timezone,
  siteUrl,
  createAction,
  inviteAction,
}: {
  board: AssistantBoard
  recommended: { slot: BoardSlot; text: string }[]
  timezone: string
  siteUrl: string
  createAction: CreateMatchAction
  inviteAction: InviteAction
}) {
  const [picked, setPicked] = useState<BoardSlot | null>(null)
  return (
    <>
      <RecommendedSlots items={recommended} onPick={setPicked} />
      <FreeBoard board={board} onPick={setPicked} />
      {picked ? (
        <BuildMatchSheet
          key={picked.key}
          slot={picked}
          timezone={timezone}
          siteUrl={siteUrl}
          createAction={createAction}
          inviteAction={inviteAction}
          onClose={() => setPicked(null)}
        />
      ) : null}
    </>
  )
}
```

- [ ] **Step 2: The page**

`app/(club)/club/asistente/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { AssistantScreen } from '@/components/assistant/assistant-screen'
import { FlyerShare } from '@/components/assistant/flyer-share'
import { DayStrip } from '@/components/booking/day-strip'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { getSiteUrl } from '@/lib/auth/redirect'
import { requireStaff } from '@/lib/auth/viewer'
import { loadAssistantDay } from '@/lib/data/assistant'
import { recommendationText, recommendedSlots } from '@/lib/domain/assistant-board'
import { dayLabel } from '@/lib/domain/format'
import { flyerLayout, flyerText } from '@/lib/domain/free-slots-flyer'
import { isLocalDate } from '@/lib/domain/input'
import { addDays, localDateOf } from '@/lib/domain/time'
import { createStaffMatch, inviteToMatch } from './actions'

export const metadata: Metadata = { title: 'Asistente' }

type SearchParams = Promise<{ dia?: string }>

// Reception's guide to fill the courts: the day's free slots, where a match is worth building and the flyer.
export default async function AssistantPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireStaff('/club/asistente')
  const { club } = viewer
  const { dia } = await searchParams
  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const date = isLocalDate(dia) && dia >= today ? dia : today
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index))

  const { grid, board } = await loadAssistantDay(club, date, viewer, now)
  const siteUrl = getSiteUrl()
  const recommended = recommendedSlots(board, now, club.match_close_hours).map((slot) => ({
    slot,
    text: recommendationText(slot, club.timezone),
  }))

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <p className="text-fg-muted">
        Mirá qué turnos quedan libres, armá partidos donde hay gente que suele jugar y difundí los libres.
      </p>
      <DayStrip days={days.map((day) => ({ date: day, label: dayLabel(day, today) }))} selected={date} basePath="/club/asistente" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          <AssistantScreen
            board={board}
            recommended={recommended}
            timezone={club.timezone}
            siteUrl={siteUrl}
            createAction={createStaffMatch}
            inviteAction={inviteToMatch}
          />
        </div>
        <FlyerShare
          imageUrl={`/club/asistente/flyer?date=${date}`}
          fileName={`turnos-libres-${date}.png`}
          text={flyerText({ date, layout: flyerLayout(grid), url: siteUrl, phone: club.phone })}
        />
      </div>
    </>
  )
}
```

- [ ] **Step 3: Typecheck, lint and look at it**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

Run: `npm run dev`, sign in as the demo reception user and open `http://localhost:3000/club/asistente`. Check on a 390 px wide viewport: one column, buttons 44 px tall, the board scrolls sideways when the courts do not fit, the flyer preview loads. On a wide screen the flyer sits on the right.

- [ ] **Step 4: Commit**

```bash
git add components/assistant/assistant-screen.tsx "app/(club)/club/asistente/page.tsx"
git commit -m "feat(asistente): the assistant screen"
```

---

### Task 24: End to end

**Files:**
- Create: `tests/e2e/support/assistant.ts`
- Create: `tests/e2e/club-assistant.spec.ts`

- [ ] **Step 1: Write the support helpers**

`tests/e2e/support/assistant.ts`:

```ts
import { parseTime, zonedTime, type LocalDate } from '../../../lib/domain/time'
import { adminClient, clubRow, type TestUser } from './admin'

// The player says she is usually free that weekday in that band (what slot_candidates reads).
export async function setUsuallyFree(user: TestUser, weekday: number, band: 'morning' | 'afternoon' | 'night'): Promise<void> {
  const { error } = await adminClient().from('player_availability').insert({ user_id: user.id, weekday, band })
  if (error) throw error
}

// A rerun on the same database: cancel what an earlier run left forming at that time, so the slot is free again.
export async function clearMatchesAt(day: LocalDate, time: string): Promise<void> {
  const admin = adminClient()
  const club = await clubRow(admin)
  const { error } = await admin
    .from('open_matches')
    .update({ status: 'cancelled', cancel_reason: 'by_club', cancelled_at: new Date().toISOString() })
    .eq('club_id', club.id)
    .eq('status', 'forming')
    .eq('starts_at', zonedTime(day, parseTime(time), club.timezone).toISOString())
  if (error) throw error
}
```

- [ ] **Step 2: Write the spec**

`tests/e2e/club-assistant.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { addDays, localDateOf, weekdayOf } from '../../lib/domain/time'
import { clubRow, createMember } from './support/admin'
import { clearMatchesAt, setUsuallyFree } from './support/assistant'
import { signInWithMagicLink } from './support/auth'

test('reception builds a match on a free slot, invites a player and she gets the aviso', async ({ page }) => {
  const club = await clubRow()
  // Day 8, 17:00, Cancha 3: no other spec books it.
  const day = addDays(localDateOf(new Date(), club.timezone), 8)
  const reception = await createMember({ name: 'Recepción Asistente', prefix: 'asistente-recepcion', role: 'reception' })
  const lucia = await createMember({ name: 'Lucía Asistente', prefix: 'asistente-lucia', side: 'backhand', gender: 'female', category: 5 })
  await setUsuallyFree(lucia, weekdayOf(day), 'afternoon')
  await clearMatchesAt(day, '17:00')

  await signInWithMagicLink(page, reception.email, `/club/asistente?dia=${day}`)
  await expect(page.getByRole('heading', { name: 'Tablero de libres' })).toBeVisible()
  const flyer = await page.request.get(`/club/asistente/flyer?date=${day}`)
  expect(flyer.status()).toBe(200)
  expect(flyer.headers()['content-type']).toBe('image/png')

  await page.getByRole('button', { name: /^Armar partido · Cancha 3 · 17:00/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Armar partido · Cancha 3 · 17:00' })
  await sheet.getByLabel('Desde').selectOption('5')
  await sheet.getByLabel('Hasta').selectOption('5')
  await sheet.getByLabel('Tipo').selectOption('mixed')
  await expect(sheet.getByText('Lucía Asistente', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Crear partido' }).click()
  await sheet.getByRole('button', { name: 'Invitar a Lucía Asistente' }).click()
  await expect(sheet.getByText('Invitado ✓')).toBeVisible()

  await page.context().clearCookies()
  await signInWithMagicLink(page, lucia.email, '/avisos')
  await expect(page.getByText('Te invitan a un partido')).toBeVisible()
})
```

- [ ] **Step 3: Run it**

Run: `npx playwright test tests/e2e/club-assistant.spec.ts`
Expected: PASS. If "Cancha 3 · 17:00" is not free in the local data (a demo booking), pick another time the seed leaves free on day 8 and change both the helper call and the names.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/support/assistant.ts tests/e2e/club-assistant.spec.ts
git commit -m "test(asistente): reception builds a match and invites from the assistant"
```

---

### Task 25: Full verification and notes

**Files:**
- Modify: `docs/features/asistente-del-club/notes.md`

- [ ] **Step 1: Run everything**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS.
Run: `npm run test:db`
Expected: PASS.
Run: `npm run test:e2e`
Expected: PASS (the whole suite: the new tab and the new aviso kind must not break other specs).

- [ ] **Step 2: Record the implementation decisions**

Append to `docs/features/asistente-del-club/notes.md`:

```markdown
## Decisiones de implementación (2026-11-23)

- La lista para invitar sale de `candidatesFor` (las filas de `slot_candidates`), no de `match_suggestions`: esa corta en 6 y pide un lugar que encaje, y "Invitar a los mejores 8" necesita más.
- `slot_candidates` solo devuelve socios con categoría y con un motivo (jugó ese día y hora o suele estar libre), para que las ~40 llamadas del día sean livianas.
- El flyer no muestra los horarios pasados: sus celdas son libre, ocupado o sin turno.
- `match_invites` guarda también `club_id`, para su RLS como el resto de las tablas.
- `clubs.phone` se valida con `^[0-9]{8,15}$`; la app normaliza con `normalizePhone`.
- Un libre pasado el cierre de partidos se ve libre en el tablero, pero no se puede tocar para armar.
- El tablero y los recomendados viven en `lib/domain/assistant-board.ts`; `slot-planner.ts` queda para los candidatos de un hueco.
- El e2e toca la celda del tablero, no un recomendado: los recomendados dependen de todos los socios de la base compartida.
- La pestaña "Asistente" va después de "Grilla", con el ícono `racket`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/features/asistente-del-club/notes.md
git commit -m "docs(asistente): implementation decisions"
```

- [ ] **Step 4: Review**

Run `/team-setup:discipline-check` on the branch's changes and fix what it finds.
