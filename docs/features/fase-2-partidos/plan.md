---
feature: fase-2-partidos
type: plan
status: in-progress
date: 2026-09-29
branch: feat/fase-2-partidos
references: ./design.md, ../fase-1-reservas/plan.md, ../fase-1-reservas/notes.md, ../../prototipo.html
---

# Fase 2 (partidos abiertos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/team-setup:execute` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un jugador de Rustic arme un partido abierto, que otros se sumen en el lado que falta (también desde un link compartido por WhatsApp) y que la cancha se reserve sola cuando están los cuatro, con cancelación automática, cobro por jugador y sugerencias de a quién invitar.

**Architecture:** Igual que la fase 1: cada escritura es una función `security definer` de Postgres con `search_path = ''` y códigos de error estables (`private.fail`). El cuarto jugador reserva la cancha en la misma transacción que ocupa el último lugar (la restricción de exclusión de `court_occupancy` sigue teniendo la última palabra); `pg_cron` cierra cada 10 minutos los partidos que no se completaron. Next.js lee con la sesión del usuario (RLS y permisos por columna), las reglas que la pantalla explica salen de módulos puros de `lib/domain` que replican las de la base, y las Server Actions validan con `lib/domain/input.ts` y traducen el error con `lib/actions/result.ts`.

**Tech Stack:** Next.js 16.3 (App Router, `proxy.ts`), React 19, TypeScript, Tailwind 4, Supabase (Postgres 17, Auth, Realtime, `pg_cron`), `@supabase/ssr`, Vitest + Testing Library, pgTAP, Playwright con Mailpit.

---

## Antes de empezar

- Rama: `feat/fase-2-partidos` (sale de `main` con la fase 1 mergeada). Commits chicos; cada corte termina en verde.
- Docker Desktop corriendo. El CLI de Supabase es devDependency: `npx supabase …` o los scripts de npm (`npm run test:db`, `npm run db:reset`, `npm run db:types`). No hay CLI global.
- Windows: **los archivos con barras invertidas (`\ir` en los tests pgTAP, regex) se escriben con la herramienta Write**, nunca con heredoc ni `sed`.
- Next 16: antes de usar una API de Next, leer su guía en `node_modules/next/dist/docs/01-app/` (ver `AGENTS.md`). Las usadas acá: rutas dinámicas con `params` como Promise (`03-api-reference/03-file-conventions/dynamic-routes.md`), `notFound` (`03-api-reference/04-functions/not-found.md`), `redirect`, Server Actions (`01-getting-started/07-mutating-data.md`), `searchParams` como Promise.
- Producción: las migraciones llegan con el merge (`migrate.yml`). **Nunca** correr `supabase link`, `db push` ni nada contra producción desde la máquina local. Las migraciones ya aplicadas **no se editan**: todo cambio es una migración nueva (`create or replace`, o `drop` + `create` cuando cambia la firma).
- Migraciones nuevas: `supabase/migrations/202609300001xx_*.sql` … `202609300006xx_*.sql` (todas posteriores a `20260929000900`).
- Docs en español; identificadores, comentarios de SQL y de código en inglés.
- pgTAP: un test se corre con `npx supabase test db supabase/tests/database/<archivo>.test.sql`; todos con `npm run test:db`. Los tests incluyen `\ir helpers/slot.psql`, `\ir helpers/club.psql` y, desde esta fase, `\ir helpers/match.psql`.
- Cada migración nueva se aplica con `npm run db:reset` y después `npm run db:types` regenera `lib/supabase/database.types.ts`, que CI compara byte a byte.
- Datos del fixture pgTAP (club T, `helpers/club.psql`): grilla 08:00–23:00 cada 90 min, ventana de 14 días, 24 h de aviso, 2 reservas activas, precios 1200 y 1600 desde 18:30, canchas `c0000000-0000-0000-0000-000000000001` (Cancha 1) y `…0002` (Cancha 2). Personas: Ana `…a1` (jugadora, 5ª validada), Bruno `…b1` (jugador, 6ª), Carla `…c1` (recepción), Dani `…d1` (admin), Omar `…f1` (no es miembro). En este documento `…a1` abrevia `00000000-0000-0000-0000-0000000000a1`, y así con los demás; **en los archivos va siempre el uuid completo**.
- Soporte e2e (`tests/e2e/support`): `createMember`, `signedInClient`, `bookFirstFreeSlot`, `signInWithMagicLink`; `localSupabase()` se niega a correr contra un Supabase que no sea local.
- jsdom: los file inputs se leen por `ref`; los `input type="date"` se cambian con `fireEvent.change`.

## Decisiones que este plan toma (y que el diseño no fijaba)

| Tema | Decisión | Por qué |
| --- | --- | --- |
| Lugares | Posiciones fijas: 1 = pareja A drive, 2 = pareja A revés, 3 = pareja B drive, 4 = pareja B revés. El creador toma la 1 o la 2 según su lado | Un solo dibujo de cancha y una sola regla de "resto al lugar 1" |
| Cancha reservada | Columna `open_matches.court_id` (además de `booking_id`) | La reserva de un partido solo la leen sus jugadores y el staff; la tarjeta ("Confirmado, Cancha 2") la ve cualquier miembro |
| Motivo de cancelación | `cancel_reason` con códigos `no_court`, `not_filled`, `empty`, `by_club` y `cancel_note` libre (staff, hasta 120) | La app traduce los códigos (`CANCEL_REASON_TEXT`) como con los errores |
| Errores extra | `spot_taken` (el lugar se ocupó) y `already_paid` (quien ya pagó no se baja solo), además de los cinco del diseño | `slot_taken` habla de canchas; bajarse después de pagar necesita al club para devolver |
| Bajarse habiendo pagado | `leave_match` falla con `already_paid`; recepción lo saca con `remove_from_match` y lo pagado aparece "a devolver" en Cobros. Salir o ser sacado rechaza la transferencia informada ("Salió del partido") | La app no mueve plata; así nunca queda un pago confirmado sin nadie que lo reclame |
| Mismo candado | `create_match`, `join_match` y `book_slot` toman `pg_advisory_xact_lock('book_slot:' \|\| uid)`. `book_slot` pasa a usar `private.is_busy` (reservas **y** partidos) | "No tener dos cosas a la misma hora" vale en los dos sentidos y sin carreras |
| Cancelar la reserva de un partido | `cancel_booking` sobre una reserva de partido cancela el partido (`by_club`) | La reserva nunca queda cancelada con el partido confirmado |
| Cierre automático | `public.close_matches()` ejecutable solo por `service_role` (y `pg_cron` como `postgres`), job `close-open-matches` cada 10 min | El e2e del cierre la llama con la clave de servicio; `authenticated` y `anon` no |
| Nombres privados | En un partido, el jugador con perfil privado figura como "Jugador" para los demás miembros (RLS de `profiles`); nunca aparece en sugerencias | Respeta "Otros jugadores pueden ver mi perfil" de la fase 1 |
| Sugerencias | `match_suggestions` devuelve nombre, lado, categoría, lugar sugerido y **banderas** (`exact_side`, `times_played`, `usually_free`, `prefers_court`) con el puntaje; el texto de los motivos lo arma TypeScript | Códigos en la base, español en la app |
| Disponibilidad | `save_my_availability(p_slots text[])` con elementos `'<weekday>-<band>'` (`'4-night'`) | Un solo argumento tipado en los tipos generados; misma clave que usa el dominio |
| Módulos de dominio | El diseño pide `lib/domain/matches.ts`; se parte por responsabilidad: `matches.ts` (tipos, textos, `toMatch`), `match-join.ts` (`canJoin`), `match-risk.ts`, `match-share.ts`, `matches-for-me.ts`, `match-payments.ts`, `match-suggestions.ts`, `availability.ts` | Archivos chicos, uno por regla |
| Sumarse desde la tarjeta | "Sumarme de revés" es un link a `/partidos/<id>?sumarme=<posición>`, que abre la hoja de confirmar | La lista queda como Server Component; el aviso "Sos el cuarto" vive en un solo lugar |
| Armar partido | La hoja manda `date` y `time`; la Server Action arma el instante con la zona del club (`zonedTime`) | Evita calcular zonas horarias en el navegador |
| Tiempo real | `LiveOccupancy` también escucha `open_matches` y `match_slots` (filtro `club_id`) y se monta en las pantallas de partidos | Un solo componente con `setAuth` antes de suscribirse (lección de la fase 1) |
| Firmas que cambian | `save_my_profile` suma `p_gender` y `record_cash` suma `p_payer_id`: `drop function` de la firma vieja + `create` | Dos firmas sobrecargadas confunden a PostgREST y a los tipos generados |
| PR | Un PR borrador desde el corte 1 (Task 7), listo al final | Igual que la fase 1: CI corre en cada push |

## Mapa de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `supabase/migrations/20260930000100_player_match_profile.sql` | Género, disponibilidad, canchas preferidas, `match_close_hours`, `save_my_profile` con género, `save_my_availability`, `save_my_preferred_courts` |
| `supabase/migrations/20260930000200_open_matches.sql` | `open_matches`, `match_slots`, `bookings.match_id`, `payments.payer_id`, RLS y `private.is_match_player` |
| `supabase/migrations/20260930000300_create_match.sql` | `is_busy`, `match_closes_at`, `match_fit`, `create_match`; `book_slot` mira partidos |
| `supabase/migrations/20260930000310_join_match.sql` | `book_match_court`, `cancel_match_row`, `join_match` |
| `supabase/migrations/20260930000320_leave_and_close.sql` | `free_match_slot`, `leave_match`, `cancel_match`, `remove_from_match`, `close_matches` + cron; `cancel_booking` cancela el partido |
| `supabase/migrations/20260930000400_match_payments.sql` | Parte por jugador: `report_transfer`, `record_cash(…, p_payer_id)`, `confirm_payment` |
| `supabase/migrations/20260930000500_match_suggestions.sql` | `day_band_of`, `match_suggestions` |
| `supabase/migrations/20260930000600_realtime_matches.sql` | `open_matches` y `match_slots` en Realtime |
| `supabase/tests/database/helpers/match.psql` | Géneros y lados del fixture, cuatro jugadores más, `make_match`, `hold_court`, `match_at` |
| `supabase/tests/database/*.test.sql` | pgTAP nuevos: `player_match_profile`, `open_matches_schema`, `create_match`, `join_match`, `leave_match`, `match_staff`, `match_payments`, `match_suggestions`, `realtime_matches` |
| `lib/domain/availability.ts` | Franjas del día, clave `weekday-band`, lectura del formulario |
| `lib/domain/matches.ts` | Tipos, etiquetas, `toMatch`, lo que falta, estado, plazo para bajarse, "¿Cómo funciona?" |
| `lib/domain/match-join.ts` | `canJoin` y `joinStatus` (mismas reglas que `join_match`) |
| `lib/domain/match-risk.ts` | Canchas libres y riesgo de quedarse sin cancha |
| `lib/domain/match-share.ts` | Texto para WhatsApp y link `wa.me` |
| `lib/domain/matches-for-me.ts` | "Partidos para vos" |
| `lib/domain/match-payments.ts` | Parte por lugar y estado de pago por jugador |
| `lib/domain/match-suggestions.ts` | Motivos de cada sugerencia |
| `lib/data/matches.ts` | Carga partidos, contexto del jugador y canchas libres |
| `lib/actions/profile.ts` | `saveProfile` con género, `saveAvailability`, `savePreferredCourts` |
| `app/(jugador)/partidos/…` | Lista, detalle (`[id]`), acciones |
| `components/matches/*` | `MatchCourt`, `MatchCard`, `CreateMatchSheet`, `JoinSheet`, `ShareSheet`, `SuggestionsList` |
| `components/profile/*` | Formulario de perfil con género, disponibilidad, canchas preferidas |
| `components/club/forming-matches-panel.tsx` | Panel "Partidos armándose" de la grilla |
| `lib/domain/grid.ts`, `lib/data/day.ts` | Partidos en la grilla ("Falta N", celdas de partido, pago por jugador) |
| `lib/domain/my-bookings.ts`, `lib/domain/payments-overview.ts`, `lib/data/payments.ts` | Parte propia en Mis reservas; cobros por jugador |
| `lib/domain/settings.ts`, `app/(club)/club/ajustes/*` | "Horas antes para cerrar partidos incompletos" |
| `components/live/live-occupancy.tsx` | Escucha también partidos y lugares |
| `tests/e2e/support/{admin,matches,global-setup}.ts` | Miembros con género y lado, partidos por API, limpieza |
| `tests/e2e/{open-match,match-link,match-close}.spec.ts` | Los tres flujos |

## Secuencia por cortes

| Corte | Tasks | Resultado | Cómo se prueba |
| --- | --- | --- | --- |
| 1. Modelo y perfil | 1–7 | Tablas de partidos; perfil con género, disponibilidad y canchas preferidas | pgTAP + Vitest + e2e existentes |
| 2. RPCs de partidos y cierre | 8–11 | Armar, sumarse, salir, staff, cierre automático | pgTAP |
| 3. Pagos por jugador | 12 | Parte por jugador en transferencia y efectivo | pgTAP |
| 4. Dominio TS | 13–18 | Reglas y textos de partidos | Vitest |
| 5. Pantallas de partidos | 19–26 | `/partidos` y `/partidos/<id>` | Vitest |
| 6. Integración | 27–34 | Inicio, Reservar, Mis reservas, grilla, Cobros, Ajustes | Vitest |
| 7. Sugerencias | 35–36 | "Invitá a quien le puede servir" | pgTAP + Vitest |
| 8. Realtime y e2e | 37–42 | Todo en vivo; tres flujos e2e; PR listo | pgTAP + Vitest + Playwright |

---

## Corte 1: Modelo y perfil

### Task 1: Punto de partida en verde

**Files:** ninguno.

- [ ] **Step 1: Rama y stack local**

Run:
```bash
git branch --show-current
npx supabase start
npm run db:reset
```
Expected: `feat/fase-2-partidos`; Supabase levantado; `db reset` aplica las migraciones hasta `20260929000900_realtime.sql` y `seed.sql`.

- [ ] **Step 2: Todo en verde antes de tocar nada**

Run:
```bash
npm run test:db
npm test
npm run lint
npm run typecheck
```
Expected: todo PASS. Si algo falla, parar y avisar: no se empieza sobre rojo.

---

### Task 2: Perfil para partidos en la base

**Files:**
- Create: `supabase/tests/database/player_match_profile.test.sql`
- Create: `supabase/migrations/20260930000100_player_match_profile.sql`
- Modify: `supabase/tests/database/save_my_profile.test.sql` (las cinco llamadas a `save_my_profile`)

- [ ] **Step 1: Write the failing test** (con la herramienta Write: tiene `\ir`)

`supabase/tests/database/player_match_profile.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(16);

select is((select match_close_hours::int from public.clubs where slug = 'test-club'), 3,
  'incomplete matches close 3 hours before by default');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'save_my_profile'),
  1, 'save_my_profile has a single signature, the one with gender');

-- Ana, player
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.save_my_profile('a0000000-0000-0000-0000-000000000001', 'Ana', 'drive', 'right', 'female', true, 5) $$,
  'a player saves her gender with the profile');
select is((select gender::text from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'female',
  'the gender is stored');
select throws_ok(
  $$ select public.save_my_profile('a0000000-0000-0000-0000-000000000001', 'Ana', 'drive', 'right', null, true, 5) $$,
  'P0001', 'invalid_input', 'gender is required');

select lives_ok(
  $$ select * from public.save_my_availability(array['1-night', '3-night', '6-morning', '1-night']) $$,
  'a player saves when she usually can play');
select results_eq(
  $$ select weekday::int, band::text from public.player_availability order by weekday, band $$,
  $$ values (1, 'night'), (3, 'night'), (6, 'morning') $$,
  'she reads her own bands, without duplicates');
select lives_ok(
  $$ select * from public.save_my_availability(array['2-afternoon']) $$,
  'saving again replaces the bands');
select results_eq(
  $$ select weekday::int, band::text from public.player_availability $$,
  $$ values (2, 'afternoon') $$,
  'only the new bands are left');
select throws_ok(
  $$ select * from public.save_my_availability(array['7-night']) $$,
  'P0001', 'invalid_input', 'weekdays go from 0 to 6 and bands are morning, afternoon or night');

select lives_ok(
  $$ select * from public.save_my_preferred_courts('a0000000-0000-0000-0000-000000000001',
       array['c0000000-0000-0000-0000-000000000002']::uuid[]) $$,
  'a player picks her preferred courts');
select throws_ok(
  $$ select * from public.save_my_preferred_courts('a0000000-0000-0000-0000-000000000001',
       array['c0000000-0000-0000-0000-00000000dead']::uuid[]) $$,
  'P0001', 'invalid_input', 'only active courts of the club');

-- Bruno cannot see Ana's lists.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select is(
  (select count(*)::int from public.player_availability) + (select count(*)::int from public.player_preferred_courts),
  0, 'nobody else reads a player''s availability or preferred courts');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select throws_ok(
  $$ select * from public.save_my_preferred_courts('a0000000-0000-0000-0000-000000000001',
       array['c0000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'P0001', 'forbidden', 'only members pick preferred courts of a club');

-- Anonymous visitor
set local role anon;
select throws_ok(
  $$ select * from public.save_my_availability(array['1-night']) $$,
  '42501', null, 'anon cannot call save_my_availability');

reset role;
select results_eq(
  $$ select court_id from public.player_preferred_courts where user_id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('c0000000-0000-0000-0000-000000000002'::uuid) $$,
  'the preferred court is stored');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/player_match_profile.test.sql`
Expected: FAIL (`column "match_close_hours" does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260930000100_player_match_profile.sql`:
```sql
-- Fase 2, slice 1: what open matches need to know about a player. Gender decides which matches
-- she can join; availability ("cuándo solés poder jugar") and preferred courts feed "Partidos
-- para vos" and the suggestions. Both lists are private: the player reads her own and writes them
-- through the functions below; nobody else reads them.

create type public.gender as enum ('male', 'female');
create type public.day_band as enum ('morning', 'afternoon', 'night');

alter table public.profiles add column gender public.gender;

-- Hours before the slot when a match that is still forming is cancelled.
alter table public.clubs
  add column match_close_hours smallint not null default 3,
  add constraint clubs_match_close_hours check (match_close_hours between 0 and 48);

-- Bands on the club's clock: morning before 13:00, afternoon 13:00 to 18:00, night from 18:00.
create table public.player_availability (
  user_id uuid not null references public.profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  band public.day_band not null,
  primary key (user_id, weekday, band)
);
alter table public.player_availability enable row level security;

create table public.player_preferred_courts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  court_id uuid not null references public.courts (id) on delete cascade,
  primary key (user_id, court_id)
);
create index player_preferred_courts_court_id_idx on public.player_preferred_courts (court_id);
alter table public.player_preferred_courts enable row level security;

revoke all on public.player_availability, public.player_preferred_courts from anon, authenticated;
grant select on public.player_availability, public.player_preferred_courts to authenticated;

create policy player_availability_select_own on public.player_availability
  for select to authenticated using (user_id = (select auth.uid()));
create policy player_preferred_courts_select_own on public.player_preferred_courts
  for select to authenticated using (user_id = (select auth.uid()));

-- The welcome form and the profile screen now also save the gender (required).
drop function public.save_my_profile(uuid, text, public.player_side, public.dominant_hand, boolean, integer);

create function public.save_my_profile(
  p_club_id uuid,
  p_display_name text,
  p_side public.player_side,
  p_hand public.dominant_hand,
  p_gender public.gender,
  p_is_public boolean,
  p_category integer
)
returns public.club_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := trim(p_display_name);
  v_member public.club_members;
begin
  if v_uid is null then
    perform private.fail('forbidden');
  end if;
  if v_name is null or length(v_name) not between 1 and 60
     or p_side is null or p_hand is null or p_gender is null or p_is_public is null
     or p_category is null or p_category not between 1 and 8 then
    perform private.fail('invalid_input');
  end if;
  if not exists (select 1 from public.clubs where id = p_club_id) then
    perform private.fail('not_found');
  end if;

  update public.profiles
     set display_name = v_name, side = p_side, hand = p_hand, gender = p_gender, is_public = p_is_public
   where id = v_uid;

  insert into public.club_members (club_id, user_id, role, category, category_validated)
  values (p_club_id, v_uid, 'player', p_category, false)
  on conflict (club_id, user_id) do update
    set category = excluded.category,
        category_validated = public.club_members.category_validated
                             and public.club_members.category is not distinct from excluded.category
  returning * into v_member;
  return v_member;
end;
$$;

-- Replaces the caller's bands. Each element is '<weekday>-<band>', like '4-night'.
create function public.save_my_availability(p_slots text[])
returns setof public.player_availability
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    perform private.fail('forbidden');
  end if;
  if p_slots is null or cardinality(p_slots) > 21
     or exists (select 1 from unnest(p_slots) as s (slot) where s.slot is null
                or s.slot !~ '^[0-6]-(morning|afternoon|night)$') then
    perform private.fail('invalid_input');
  end if;

  delete from public.player_availability where user_id = v_uid;
  insert into public.player_availability (user_id, weekday, band)
  select distinct v_uid, split_part(s.slot, '-', 1)::smallint, split_part(s.slot, '-', 2)::public.day_band
  from unnest(p_slots) as s (slot);

  return query select * from public.player_availability where user_id = v_uid order by weekday, band;
end;
$$;

-- Replaces the caller's preferred courts in one club. Only active courts of that club.
create function public.save_my_preferred_courts(p_club_id uuid, p_court_ids uuid[])
returns setof public.player_preferred_courts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not private.is_club_member(p_club_id) then
    perform private.fail('forbidden');
  end if;
  if p_court_ids is null or cardinality(p_court_ids) > 20 or array_position(p_court_ids, null) is not null
     or exists (
       select 1 from unnest(p_court_ids) as u (court_id)
       where not exists (
         select 1 from public.courts c where c.id = u.court_id and c.club_id = p_club_id and c.is_active
       )
     ) then
    perform private.fail('invalid_input');
  end if;

  delete from public.player_preferred_courts p
   using public.courts c
   where p.user_id = v_uid and c.id = p.court_id and c.club_id = p_club_id;
  insert into public.player_preferred_courts (user_id, court_id)
  select distinct v_uid, u.court_id from unnest(p_court_ids) as u (court_id);

  return query
    select p.* from public.player_preferred_courts p
    join public.courts c on c.id = p.court_id
    where p.user_id = v_uid and c.club_id = p_club_id;
end;
$$;

revoke execute on function public.save_my_profile(uuid, text, public.player_side, public.dominant_hand, public.gender,
  boolean, integer) from public, anon;
revoke execute on function public.save_my_availability(text[]) from public, anon;
revoke execute on function public.save_my_preferred_courts(uuid, uuid[]) from public, anon;
grant execute on function public.save_my_profile(uuid, text, public.player_side, public.dominant_hand, public.gender,
  boolean, integer) to authenticated;
grant execute on function public.save_my_availability(text[]) to authenticated;
grant execute on function public.save_my_preferred_courts(uuid, uuid[]) to authenticated;
```

- [ ] **Step 4: Update the fase 1 profile test to the new signature**

In `supabase/tests/database/save_my_profile.test.sql`, every call gains the gender right after the hand. Replace exactly:
- `'  Omar Pérez ', 'backhand', 'left', true, 4)` → `'  Omar Pérez ', 'backhand', 'left', 'male', true, 4)`
- `'Ana P', 'drive', 'right', false, 5)` → `'Ana P', 'drive', 'right', 'female', false, 5)`
- `'Ana P', 'drive', 'right', false, 3)` → `'Ana P', 'drive', 'right', 'female', false, 3)`
- `'Ana Nueva', 'drive', 'right', true, 9)` → `'Ana Nueva', 'drive', 'right', 'female', true, 9)`
- `'   ', 'drive', 'right', true, 5)` → `'   ', 'drive', 'right', 'female', true, 5)`

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/player_match_profile.test.sql
npx supabase test db supabase/tests/database/save_my_profile.test.sql
npm run test:db
```
Expected: PASS en los tres (el catálogo de `integrity.test.sql` confirma que `anon` no ejecuta las funciones nuevas).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260930000100_player_match_profile.sql supabase/tests/database/player_match_profile.test.sql supabase/tests/database/save_my_profile.test.sql
git commit -m "feat(db): gender, availability and preferred courts for open matches"
```
(`lib/supabase/database.types.ts` se regenera en la Task 4, junto con el código que usa la firma nueva.)

---

### Task 3: Partidos en la base (tablas y lectura)

**Files:**
- Create: `supabase/tests/database/helpers/match.psql`
- Create: `supabase/tests/database/open_matches_schema.test.sql`
- Create: `supabase/migrations/20260930000200_open_matches.sql`

- [ ] **Step 1: Write the match fixture** (con Write)

`supabase/tests/database/helpers/match.psql`:
```sql
-- Fase 2 fixture. Include it after slot.psql and club.psql:
--   \ir helpers/match.psql
-- Genders and sides for the club T players, four more players, and helpers to build matches.
-- Ana (a1): female, drive, 5. Bruno (b1): male, backhand, 6.
-- Gabi (a2): female, both, 5. Hugo (a3): male, drive, 4. Iván (a4): male, backhand, 5.
-- Juli (a5): female, backhand, 6.
-- Spots: 1 = team A drive, 2 = team A backhand, 3 = team B drive, 4 = team B backhand.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a2', 'gabi@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'hugo@test.local'),
  ('00000000-0000-0000-0000-0000000000a4', 'ivan@test.local'),
  ('00000000-0000-0000-0000-0000000000a5', 'juli@test.local');

update public.profiles p
   set display_name = v.name, gender = v.gender::public.gender, side = v.side::public.player_side, hand = 'right'
  from (values
    ('00000000-0000-0000-0000-0000000000a1', 'Ana', 'female', 'drive'),
    ('00000000-0000-0000-0000-0000000000b1', 'Bruno', 'male', 'backhand'),
    ('00000000-0000-0000-0000-0000000000a2', 'Gabi', 'female', 'both'),
    ('00000000-0000-0000-0000-0000000000a3', 'Hugo', 'male', 'drive'),
    ('00000000-0000-0000-0000-0000000000a4', 'Iván', 'male', 'backhand'),
    ('00000000-0000-0000-0000-0000000000a5', 'Juli', 'female', 'backhand')
  ) as v (id, name, gender, side)
 where p.id = v.id::uuid;

insert into public.club_members (club_id, user_id, role, category, category_validated) values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'player', 5, true),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'player', 4, true),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', 'player', 5, true),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a5', 'player', 6, true);

-- A forming match with its four spots, inserted as postgres (skips the RPC rules on purpose).
-- p_players has four elements (null = free spot); the first one is recorded as the creator.
create procedure test_helpers.make_match(
  p_id uuid,
  p_court_id uuid,
  p_period tstzrange,
  p_players uuid[],
  p_type public.match_type default 'mixed',
  p_min integer default 1,
  p_max integer default 8,
  p_allow_other_court boolean default true
)
language plpgsql
as $$
begin
  insert into public.open_matches (id, club_id, period, preferred_court_id, allow_other_court, category_min,
                                   category_max, match_type, created_by)
  values (p_id, 'a0000000-0000-0000-0000-000000000001', p_period, p_court_id, p_allow_other_court, p_min, p_max,
          p_type, p_players[1]);

  insert into public.match_slots (match_id, club_id, position, team, side, player_id, joined_at)
  select p_id, 'a0000000-0000-0000-0000-000000000001', pos, case when pos <= 2 then 'A' else 'B' end,
         (case when pos % 2 = 1 then 'drive' else 'backhand' end)::public.player_side,
         p_players[pos], case when p_players[pos] is not null then now() end
  from generate_series(1, 4) as pos;
end;
$$;

-- Gives a match a court: an occupancy of kind 'match' and its booking. Confirms it unless told not
-- to (a match that lost a player keeps its court while it looks for another one).
create procedure test_helpers.hold_court(
  p_match_id uuid, p_court_id uuid, p_price integer default 1600, p_confirm boolean default true
)
language plpgsql
as $$
declare
  v_period tstzrange;
  v_occupancy_id uuid;
  v_booking_id uuid;
begin
  select period into v_period from public.open_matches where id = p_match_id;
  insert into public.court_occupancy (club_id, court_id, kind, period)
  values ('a0000000-0000-0000-0000-000000000001', p_court_id, 'match', v_period)
  returning id into v_occupancy_id;
  insert into public.bookings (club_id, court_id, period, match_id, source, price, occupancy_id)
  values ('a0000000-0000-0000-0000-000000000001', p_court_id, v_period, p_match_id, 'online', p_price, v_occupancy_id)
  returning id into v_booking_id;
  update public.open_matches
     set booking_id = v_booking_id, court_id = p_court_id,
         status = case when p_confirm then 'confirmed'::public.match_status else status end
   where id = p_match_id;
end;
$$;

-- The match that starts at that time (tests keep one per time).
create function test_helpers.match_at(days_ahead int, start_time time)
returns uuid
language sql
stable
as $$
  select id from public.open_matches where starts_at = test_helpers.at(days_ahead, start_time) limit 1;
$$;
```

- [ ] **Step 2: Write the failing test** (con Write)

`supabase/tests/database/open_matches_schema.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(15);

select has_table('public', 'open_matches', 'open_matches exists');
select has_table('public', 'match_slots', 'match_slots exists');

-- A confirmed match at day 3 20:00 on court 1: Ana, Bruno, Hugo and Iván.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '20:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4']::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001');

select throws_ok(
  $$ insert into public.match_slots (match_id, club_id, position, team, side)
     values ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 5, 'A', 'drive') $$,
  '23514', null, 'a match has four spots');
select throws_ok(
  $$ update public.match_slots set side = 'both'
     where match_id = 'e1000000-0000-0000-0000-000000000001' and position = 1 $$,
  '23514', null, 'every spot is drive or backhand');
select throws_ok(
  $$ update public.match_slots set player_id = '00000000-0000-0000-0000-0000000000a1'
     where match_id = 'e1000000-0000-0000-0000-000000000001' and position = 2 $$,
  '23505', null, 'a player takes one spot per match');
select throws_ok(
  $$ update public.bookings set player_id = '00000000-0000-0000-0000-0000000000a1'
     where match_id = 'e1000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a match booking has no other holder');
select throws_ok(
  $$ update public.open_matches set category_min = 7, category_max = 3
     where id = 'e1000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'the category range goes from low to high');

-- Each player pays his share (inserted as postgres).
insert into public.payments (club_id, booking_id, method, amount, status, payer_id, confirmed_at)
select 'a0000000-0000-0000-0000-000000000001', booking_id, 'cash', 400, 'confirmed', payer, now()
from public.open_matches,
     unnest(array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1']::uuid[]) as payer
where id = 'e1000000-0000-0000-0000-000000000001';

-- Ana, in the match
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select is((select count(*)::int from public.match_slots where match_id = 'e1000000-0000-0000-0000-000000000001'), 4,
  'members read the spots of a match');
select is((select count(*)::int from public.bookings where match_id = 'e1000000-0000-0000-0000-000000000001'), 1,
  'a player of the match reads its booking');
select is((select count(*)::int from public.payments), 1, 'a player of the match reads only her own payments');

-- Juli, member but not in the match
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';

select is((select count(*)::int from public.open_matches), 1, 'members read the matches of their club');
select is((select count(*)::int from public.bookings where match_id = 'e1000000-0000-0000-0000-000000000001'), 0,
  'members outside the match do not read its booking');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select is((select count(*)::int from public.open_matches), 0, 'non-members read no matches');

-- Anonymous visitor
set local role anon;
select throws_ok($$ select * from public.open_matches $$, '42501', null, 'anon cannot read matches');
select throws_ok($$ select * from public.match_slots $$, '42501', null, 'anon cannot read match spots');

select * from finish();
rollback;
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/open_matches_schema.test.sql`
Expected: FAIL (`type "public.match_type" does not exist` al incluir `match.psql`).

- [ ] **Step 4: Write the migration**

`supabase/migrations/20260930000200_open_matches.sql`:
```sql
-- Fase 2 data model: open matches and their four spots. A match that is still forming holds no
-- court; when the fourth player joins, a booking with match_id (and an occupancy of kind 'match')
-- takes one. Every write goes through the functions of the next migrations: authenticated only reads.

create type public.match_type as enum ('male', 'female', 'mixed');
create type public.match_status as enum ('forming', 'confirmed', 'cancelled');

create table public.open_matches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  period tstzrange not null,
  starts_at timestamptz generated always as (lower(period)) stored,
  ends_at timestamptz generated always as (upper(period)) stored,
  preferred_court_id uuid not null,
  allow_other_court boolean not null default true,
  -- The court it got when it filled up; members read it, the booking only its players and staff.
  court_id uuid,
  category_min smallint not null check (category_min between 1 and 8),
  category_max smallint not null check (category_max between 1 and 8),
  match_type public.match_type not null,
  status public.match_status not null default 'forming',
  cancel_reason text check (cancel_reason in ('no_court', 'not_filled', 'empty', 'by_club')),
  cancel_note text check (cancel_note is null or length(trim(cancel_note)) between 1 and 120),
  -- Kept when a player leaves a confirmed match: the court stays held until closing time.
  booking_id uuid unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  -- Target for the composite FK in match_slots.
  unique (id, club_id),
  constraint open_matches_preferred_court_fkey
    foreign key (preferred_court_id, club_id) references public.courts (id, club_id) on delete cascade,
  constraint open_matches_court_fkey
    foreign key (court_id, club_id) references public.courts (id, club_id) on delete cascade,
  constraint open_matches_booking_fkey
    foreign key (booking_id) references public.bookings (id) on delete set null,
  constraint open_matches_categories check (category_min <= category_max),
  constraint open_matches_period_shape check (
    not isempty(period) and not lower_inf(period) and not upper_inf(period)
    and lower_inc(period) and not upper_inc(period)
  ),
  constraint open_matches_cancelled check (
    (status = 'cancelled') = (cancelled_at is not null and cancel_reason is not null)
  )
);
create index open_matches_club_starts_idx on public.open_matches (club_id, starts_at);
alter table public.open_matches enable row level security;

-- Spots: 1 = team A drive, 2 = team A backhand, 3 = team B drive, 4 = team B backhand.
create table public.match_slots (
  match_id uuid not null,
  club_id uuid not null,
  position smallint not null check (position between 1 and 4),
  team text not null check (team in ('A', 'B')),
  side public.player_side not null check (side in ('drive', 'backhand')),
  player_id uuid references public.profiles (id) on delete set null,
  joined_at timestamptz,
  primary key (match_id, position),
  constraint match_slots_match_in_club
    foreign key (match_id, club_id) references public.open_matches (id, club_id) on delete cascade,
  constraint match_slots_one_spot_per_player unique (match_id, player_id)
);
create index match_slots_player_id_idx on public.match_slots (player_id);
alter table public.match_slots enable row level security;

-- A booking belongs to exactly one of: a player, a name, a match.
alter table public.bookings
  add column match_id uuid references public.open_matches (id) on delete cascade,
  drop constraint bookings_holder,
  add constraint bookings_holder check (
    num_nonnulls(player_id, guest_name, match_id) = 1
    and (guest_name is null or length(trim(guest_name)) between 1 and 60)
  );
create index bookings_match_id_idx on public.bookings (match_id);

-- In a match each player pays his own share.
alter table public.payments add column payer_id uuid references public.profiles (id) on delete set null;
create index payments_payer_id_idx on public.payments (payer_id);
drop index public.payments_one_reported_per_booking;
create unique index payments_one_reported_per_booking on public.payments (booking_id)
  where status = 'reported' and payer_id is null;
create unique index payments_one_reported_per_payer on public.payments (booking_id, payer_id)
  where status = 'reported' and payer_id is not null;

-- Whether the caller has a spot in the match. security definer so RLS policies can use it
-- without going through match_slots' own policy.
create function private.is_match_player(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.match_slots s
    where s.match_id = p_match_id and s.player_id = (select auth.uid())
  );
$$;
revoke all on function private.is_match_player(uuid) from public;
grant execute on function private.is_match_player(uuid) to authenticated;

revoke all on public.open_matches, public.match_slots from anon, authenticated;
grant select on public.open_matches, public.match_slots to authenticated;

create policy open_matches_select_members on public.open_matches
  for select to authenticated using (private.is_club_member(club_id));
create policy match_slots_select_members on public.match_slots
  for select to authenticated using (private.is_club_member(club_id));

-- A match's booking is read by its players and by staff.
drop policy bookings_select_own_or_staff on public.bookings;
create policy bookings_select_own_or_staff on public.bookings
  for select to authenticated
  using (
    player_id = (select auth.uid())
    or (match_id is not null and private.is_match_player(match_id))
    or private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
  );

-- A match player reads only her own payments; a booking of one player, all of its payments.
drop policy payments_select_own_or_staff on public.payments;
create policy payments_select_own_or_staff on public.payments
  for select to authenticated
  using (
    private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
    or payer_id = (select auth.uid())
    or (
      payer_id is null
      and exists (select 1 from public.bookings b where b.id = booking_id and b.player_id = (select auth.uid()))
    )
  );
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/open_matches_schema.test.sql
npm run test:db
```
Expected: PASS (incluye `schema.test.sql`: todas las tablas de `public` con RLS; `payments.test.sql` e `integrity.test.sql` siguen en verde con los índices nuevos).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260930000200_open_matches.sql supabase/tests/database/helpers/match.psql supabase/tests/database/open_matches_schema.test.sql
git commit -m "feat(db): open matches, spots, match bookings and payments by player"
```

---

### Task 4: Tipos generados y perfil completo con género

**Files:**
- Modify: `lib/supabase/database.types.ts` (generado)
- Modify: `lib/domain/profile.ts`
- Create: `lib/domain/availability.ts`
- Test: `tests/unit/lib/domain/profile.test.ts`, `tests/unit/lib/domain/availability.test.ts`

- [ ] **Step 1: Regenerate the types**

Run: `npm run db:types`
Expected: aparecen `open_matches`, `match_slots`, `player_availability`, `player_preferred_courts`, los enums `gender`, `day_band`, `match_type`, `match_status` y la firma nueva de `save_my_profile`. `npm run typecheck` ahora falla en `lib/actions/profile.ts` (falta `p_gender`): se arregla en la Task 5.

- [ ] **Step 2: Write the failing tests**

In `tests/unit/lib/domain/profile.test.ts`, replace the `isProfileComplete` describe and add the gender labels:
```ts
describe('isProfileComplete', () => {
  const profile = { side: 'drive', hand: 'right', gender: 'female' }

  it('needs side, hand, gender and a category in the club', () => {
    expect(isProfileComplete(profile, { category: 5 })).toBe(true)
  })

  it('sends people without them to the welcome form, also those who joined before gender existed', () => {
    expect(isProfileComplete({ ...profile, side: null }, { category: 5 })).toBe(false)
    expect(isProfileComplete({ ...profile, gender: null }, { category: 5 })).toBe(false)
    expect(isProfileComplete(profile, { category: null })).toBe(false)
    expect(isProfileComplete(profile, null)).toBe(false)
  })
})

describe('GENDER_LABELS', () => {
  it('names genders in Spanish', () => {
    expect(GENDER_LABELS).toEqual({ male: 'Masculino', female: 'Femenino' })
  })
})
```
and add `GENDER_LABELS` to the import from `@/lib/domain/profile`.

`tests/unit/lib/domain/availability.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { availabilityKey, dayBandOf, parseAvailability } from '@/lib/domain/availability'

describe('dayBandOf', () => {
  it('splits the day like the database: before 13, 13 to 18, from 18', () => {
    expect(dayBandOf(8 * 60)).toBe('morning')
    expect(dayBandOf(12 * 60 + 59)).toBe('morning')
    expect(dayBandOf(13 * 60)).toBe('afternoon')
    expect(dayBandOf(17 * 60 + 30)).toBe('afternoon')
    expect(dayBandOf(18 * 60)).toBe('night')
  })
})

describe('availabilityKey', () => {
  it('is the same key save_my_availability takes', () => {
    expect(availabilityKey(4, 'night')).toBe('4-night')
  })
})

describe('parseAvailability', () => {
  it('keeps valid keys once', () => {
    expect(parseAvailability(['1-night', '4-morning', '1-night'])).toEqual(['1-night', '4-morning'])
    expect(parseAvailability([])).toEqual([])
  })

  it('rejects anything else', () => {
    expect(parseAvailability(['7-night'])).toBeNull()
    expect(parseAvailability(['1-noon'])).toBeNull()
    expect(parseAvailability([new File([], 'x')])).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/domain/profile.test.ts tests/unit/lib/domain/availability.test.ts`
Expected: FAIL (`GENDER_LABELS` no existe; no existe `@/lib/domain/availability`).

- [ ] **Step 4: Write the implementation**

In `lib/domain/profile.ts`, add after `CATEGORIES`:
```ts
export const GENDERS = ['male', 'female'] as const
export type Gender = (typeof GENDERS)[number]
export const GENDER_LABELS: Record<Gender, string> = { male: 'Masculino', female: 'Femenino' }
```
and replace `isProfileComplete`:
```ts
// Before booking or joining a match, a player needs side, hand, gender and a category in the club
// (design: "alta obligatoria"; fase 2 adds gender, so older accounts see the welcome form again).
export function isProfileComplete(
  profile: { side: string | null; hand: string | null; gender: string | null },
  membership: { category: number | null } | null,
): boolean {
  return Boolean(profile.side && profile.hand && profile.gender && membership?.category)
}
```

`lib/domain/availability.ts`:
```ts
// When a player usually can play: weekday (0 = Sunday) by band of the day, on the club's clock.
export const DAY_BANDS = ['morning', 'afternoon', 'night'] as const
export type DayBand = (typeof DAY_BANDS)[number]

export const DAY_BAND_LABELS: Record<DayBand, string> = { morning: 'Mañana', afternoon: 'Tarde', night: 'Noche' }
export const DAY_BAND_WORDS: Record<DayBand, string> = { morning: 'de mañana', afternoon: 'de tarde', night: 'de noche' }

const KEY = /^[0-6]-(morning|afternoon|night)$/

// Same split as private.day_band_of: before 13:00, 13:00 to 18:00, from 18:00.
export function dayBandOf(minutes: number): DayBand {
  if (minutes < 13 * 60) return 'morning'
  if (minutes < 18 * 60) return 'afternoon'
  return 'night'
}

// '<weekday>-<band>', the format save_my_availability takes.
export function availabilityKey(weekday: number, band: DayBand): string {
  return `${weekday}-${band}`
}

export function parseAvailability(values: FormDataEntryValue[]): string[] | null {
  if (values.some((value) => typeof value !== 'string' || !KEY.test(value))) return null
  const unique = [...new Set(values as string[])]
  return unique.length <= 21 ? unique : null
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/lib/domain/profile.test.ts tests/unit/lib/domain/availability.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/supabase/database.types.ts lib/domain/profile.ts lib/domain/availability.ts tests/unit/lib/domain/profile.test.ts tests/unit/lib/domain/availability.test.ts
git commit -m "feat(domain): gender completes the profile; availability bands"
```

---

### Task 5: Género en la bienvenida y el perfil

**Files:**
- Modify: `components/profile/player-profile-form.tsx`
- Modify: `lib/actions/profile.ts`
- Modify: `app/(jugador)/perfil/page.tsx`, `app/bienvenida/page.tsx`
- Modify: `tests/unit/components/profile/player-profile-form.test.tsx`, `tests/unit/lib/actions/server-actions.test.ts`
- Modify: `tests/e2e/support/admin.ts`, `tests/e2e/player-booking.spec.ts`, `scripts/demo-users.mjs`

- [ ] **Step 1: Update the failing tests**

In `tests/unit/components/profile/player-profile-form.test.tsx`:
- `NEW_PLAYER` gains `gender: null`; the profile-mode `initial` gains `gender: 'female'`.
- In "asks for name, side, hand and category when joining" add `expect(screen.getByLabelText('Género')).toBeRequired()` and rename it to `'asks for name, side, hand, gender and category when joining'`.
- In "sends the choices and where to go next" add `await userEvent.selectOptions(screen.getByLabelText('Género'), 'Femenino')` before the submit and `gender: 'female'` in the expected entries.

In `tests/unit/lib/actions/server-actions.test.ts`, inside `describe('saveProfile')`:
```ts
  const valid = { displayName: ' Lucía ', side: 'backhand', hand: 'left', gender: 'female', category: '5', isPublic: 'on' }

  it('rejects unknown sides, genders and categories', async () => {
    expect(await saveProfile(IDLE, form({ ...valid, side: 'center' }))).toEqual(INVALID_INPUT)
    expect(await saveProfile(IDLE, form({ ...valid, gender: 'x' }))).toEqual(INVALID_INPUT)
    expect(await saveProfile(IDLE, form({ ...valid, category: '9' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })
```
(replacing the old "rejects unknown sides and categories" test) and add `p_gender: 'female',` after `p_hand: 'left',` in the expected `save_my_profile` call.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/profile/player-profile-form.test.tsx tests/unit/lib/actions/server-actions.test.ts`
Expected: FAIL (no hay campo "Género"; `saveProfile` no manda `p_gender`).

- [ ] **Step 3: Write the implementation**

`components/profile/player-profile-form.tsx`: import `GENDER_LABELS, GENDERS, type Gender` from `@/lib/domain/profile`; add `gender: Gender | null` to `ProfileValues`; add this field between "Mano" and "Categoría":
```tsx
      <Field label="Género" htmlFor="gender">
        <select id="gender" name="gender" required defaultValue={initial.gender ?? ''} className={inputClasses}>
          <option value="" disabled>
            Elegí tu género
          </option>
          {GENDERS.map((gender) => (
            <option key={gender} value={gender}>
              {GENDER_LABELS[gender]}
            </option>
          ))}
        </select>
      </Field>
```
and below the category hint (only in onboarding) `<p className="text-sm text-fg-muted">El género define a qué partidos masculinos o femeninos te podés sumar. A los mixtos se suma cualquiera.</p>`.

`lib/actions/profile.ts` (`saveProfile`): import `GENDERS`; read `const gender = readEnum(form, 'gender', GENDERS)`; add `!gender` to the guard; pass `p_gender: gender` after `p_hand`.

`app/(jugador)/perfil/page.tsx` and `app/bienvenida/page.tsx`: add `gender: profile.gender` (`viewer.profile.gender`) to `initial`.

`tests/e2e/support/admin.ts` (`createMember`): accept `side?: 'drive' | 'backhand' | 'both'`, `gender?: 'male' | 'female'` and `category?: number` in `options`, and change the profile update and membership to:
```ts
  const profile = await admin
    .from('profiles')
    .update({ side: options.side ?? 'drive', hand: 'right', gender: options.gender ?? 'male' })
    .eq('id', id)
```
```ts
    category: options.category ?? 5,
```

`tests/e2e/player-booking.spec.ts`: after selecting "Mano" add `await page.getByLabel('Género').selectOption('Femenino')`.

`scripts/demo-users.mjs`: add `gender: 'female'` to the admin and player entries and `gender: 'male'` to reception, and `gender: demo.gender` to the profile update.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/components/profile/player-profile-form.test.tsx tests/unit/lib/actions/server-actions.test.ts
npm run typecheck
```
Expected: PASS; typecheck sin errores.

- [ ] **Step 5: Commit**

```bash
git add components/profile/player-profile-form.tsx lib/actions/profile.ts "app/(jugador)/perfil/page.tsx" app/bienvenida/page.tsx tests/unit/components/profile/player-profile-form.test.tsx tests/unit/lib/actions/server-actions.test.ts tests/e2e/support/admin.ts tests/e2e/player-booking.spec.ts scripts/demo-users.mjs
git commit -m "feat(profile): gender in the welcome form and the profile"
```

---

### Task 6: Disponibilidad y canchas preferidas en Perfil

**Files:**
- Create: `components/profile/availability-form.tsx`, `components/profile/preferred-courts-form.tsx`
- Modify: `lib/actions/profile.ts`, `app/(jugador)/perfil/page.tsx`
- Test: `tests/unit/components/profile/availability-form.test.tsx`, `tests/unit/lib/actions/server-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/profile/availability-form.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AvailabilityForm } from '@/components/profile/availability-form'
import { PreferredCourtsForm } from '@/components/profile/preferred-courts-form'
import type { FormAction } from '@/components/ui/action-form'

describe('AvailabilityForm', () => {
  it('shows days by band, Monday first, with the saved ones checked', () => {
    render(<AvailabilityForm action={vi.fn<FormAction>()} selected={['4-night']} />)
    expect(screen.getByRole('checkbox', { name: 'Jueves, noche' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Lunes, mañana' })).not.toBeChecked()
    expect(screen.getAllByRole('checkbox')).toHaveLength(21)
  })

  it('sends one key per checked box', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: '' }))
    render(<AvailabilityForm action={action} selected={['4-night']} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sábado, mañana' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar horarios' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(action.mock.calls[0][1].getAll('availability')).toEqual(['4-night', '6-morning'])
  })
})

describe('PreferredCourtsForm', () => {
  it('sends the checked courts', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: '' }))
    render(
      <PreferredCourtsForm
        action={action}
        courts={[{ id: 'c1', name: 'Cancha 1' }, { id: 'c2', name: 'Cancha 2' }]}
        selected={['c2']}
      />,
    )
    await userEvent.click(screen.getByRole('checkbox', { name: 'Cancha 1' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar canchas' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(action.mock.calls[0][1].getAll('courtIds')).toEqual(['c1', 'c2'])
  })
})
```

In `tests/unit/lib/actions/server-actions.test.ts`, change the profile import to `const { saveAvailability, savePreferredCourts, saveProfile } = await import('@/lib/actions/profile')` and add:
```ts
describe('availability and preferred courts', () => {
  it('rejects keys and courts with the wrong shape before any RPC', async () => {
    const bad = new FormData()
    bad.append('availability', '9-night')
    expect(await saveAvailability(IDLE, bad)).toEqual(INVALID_INPUT)
    const courts = new FormData()
    courts.append('courtIds', 'cancha-1')
    expect(await savePreferredCourts(IDLE, courts)).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('saves the checked keys and courts, or none', async () => {
    const data = new FormData()
    data.append('availability', '4-night')
    await saveAvailability(IDLE, data)
    expect(rpc).toHaveBeenCalledWith('save_my_availability', { p_slots: ['4-night'] })
    await savePreferredCourts(IDLE, new FormData())
    expect(rpc).toHaveBeenCalledWith('save_my_preferred_courts', { p_club_id: 'club-1', p_court_ids: [] })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/profile/availability-form.test.tsx tests/unit/lib/actions/server-actions.test.ts`
Expected: FAIL (los componentes y acciones no existen).

- [ ] **Step 3: Write the implementation**

`components/profile/availability-form.tsx`:
```tsx
'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { availabilityKey, DAY_BAND_LABELS, DAY_BANDS } from '@/lib/domain/availability'
import { WEEKDAYS_LONG } from '@/lib/domain/format'

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0]
const capitalize = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`

// "Cuándo solés poder jugar": feeds "Partidos para vos" and the suggestions. Only the player sees it.
export function AvailabilityForm({ action, selected }: { action: FormAction; selected: string[] }) {
  const checked = new Set(selected)
  return (
    <ActionForm action={action} submitLabel="Guardar horarios" variant="secondary">
      <table className="w-full text-sm">
        <caption className="sr-only">Días y franjas en que solés poder jugar</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Día</span>
            </th>
            {DAY_BANDS.map((band) => (
              <th key={band} scope="col" className="font-semibold">
                {DAY_BAND_LABELS[band]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MONDAY_FIRST.map((weekday) => (
            <tr key={weekday}>
              <th scope="row" className="py-1 text-left font-normal">
                {capitalize(WEEKDAYS_LONG[weekday])}
              </th>
              {DAY_BANDS.map((band) => (
                <td key={band} className="text-center">
                  <input
                    type="checkbox"
                    name="availability"
                    value={availabilityKey(weekday, band)}
                    defaultChecked={checked.has(availabilityKey(weekday, band))}
                    aria-label={`${capitalize(WEEKDAYS_LONG[weekday])}, ${DAY_BAND_LABELS[band].toLowerCase()}`}
                    className="size-5 accent-accent"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ActionForm>
  )
}
```

`components/profile/preferred-courts-form.tsx`:
```tsx
'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'

export function PreferredCourtsForm({
  action,
  courts,
  selected,
}: {
  action: FormAction
  courts: { id: string; name: string }[]
  selected: string[]
}) {
  const checked = new Set(selected)
  return (
    <ActionForm action={action} submitLabel="Guardar canchas" variant="secondary">
      <fieldset className="flex flex-col gap-1">
        <legend className="sr-only">Canchas preferidas</legend>
        {courts.map((court) => (
          <label key={court.id} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              name="courtIds"
              value={court.id}
              defaultChecked={checked.has(court.id)}
              className="size-5 accent-accent"
            />
            {court.name}
          </label>
        ))}
      </fieldset>
    </ActionForm>
  )
}
```

`lib/actions/profile.ts`, add (importing `isUuid` from `@/lib/domain/input` and `parseAvailability` from `@/lib/domain/availability`):
```ts
export async function saveAvailability(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return failed('Tu sesión venció. Volvé a ingresar.')
  const slots = parseAvailability(form.getAll('availability'))
  if (!slots) return INVALID_INPUT

  const supabase = await createClient()
  const { error } = await supabase.rpc('save_my_availability', { p_slots: slots })
  revalidateBookings()
  return fromRpc(error, 'Guardamos tus horarios.')
}

export async function savePreferredCourts(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return failed('Tu sesión venció. Volvé a ingresar.')
  const courtIds = form.getAll('courtIds')
  if (!courtIds.every(isUuid)) return INVALID_INPUT

  const supabase = await createClient()
  const { error } = await supabase.rpc('save_my_preferred_courts', {
    p_club_id: viewer.club.id,
    p_court_ids: courtIds.map((id) => id.toLowerCase()),
  })
  revalidateBookings()
  return fromRpc(error, 'Guardamos tus canchas preferidas.')
}
```
(`courtIds.every(isUuid)` narrows `FormDataEntryValue[]` to `string[]`; if TypeScript does not narrow it, write `const ids = courtIds.filter(isUuid); if (ids.length !== courtIds.length) return INVALID_INPUT` and use `ids`.)

`app/(jugador)/perfil/page.tsx`: load the lists with the viewer's session and add two cards after the profile card:
```tsx
  const supabase = await createClient()
  const [availability, preferred, courts] = await Promise.all([
    supabase.from('player_availability').select('weekday, band').eq('user_id', viewer.userId),
    supabase.from('player_preferred_courts').select('court_id').eq('user_id', viewer.userId),
    supabase.from('courts').select('id, name').eq('club_id', viewer.club.id).eq('is_active', true).order('sort_order'),
  ])
  if (availability.error) throw availability.error
  if (preferred.error) throw preferred.error
  if (courts.error) throw courts.error
```
```tsx
      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold uppercase">Cuándo solés poder jugar</h2>
        <p className="text-sm text-fg-muted">Lo usamos para mostrarte partidos y sugerirte a otros. Nadie más lo ve.</p>
        <AvailabilityForm
          action={saveAvailability}
          selected={availability.data.map((row) => availabilityKey(row.weekday, row.band))}
        />
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold uppercase">Canchas preferidas</h2>
        <PreferredCourtsForm action={savePreferredCourts} courts={courts.data} selected={preferred.data.map((row) => row.court_id)} />
      </Card>
```
(imports: `createClient` from `@/lib/supabase/server`, `availabilityKey` from `@/lib/domain/availability`, the two forms, and `saveAvailability`, `savePreferredCourts` from `@/lib/actions/profile`).

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/components/profile tests/unit/lib/actions/server-actions.test.ts
npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/profile lib/actions/profile.ts "app/(jugador)/perfil/page.tsx" tests/unit/components/profile/availability-form.test.tsx tests/unit/lib/actions/server-actions.test.ts
git commit -m "feat(profile): availability and preferred courts"
```

---

### Task 7: Verificación del corte 1 y PR borrador

**Files:** ninguno.

- [ ] **Step 1: Todo en verde**

Run:
```bash
npm run test:db
npm test
npm run lint
npm run typecheck
npm run test:e2e
```
Expected: todo PASS. Los tres flujos e2e de la fase 1 siguen en verde (la bienvenida pide género; `createMember` lo completa).

- [ ] **Step 2: Push y PR borrador**

Run:
```bash
git push -u origin feat/fase-2-partidos
gh pr create --draft --base main --title "Fase 2: partidos abiertos" --body "Plan: docs/features/fase-2-partidos/plan.md. Se marca listo al final (Task 42).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
Expected: PR borrador creado; CI corre en cada push.

---

## Corte 2: RPCs de partidos y cierre automático

### Task 8: Armar un partido (`create_match`)

**Files:**
- Create: `supabase/tests/database/create_match.test.sql`
- Create: `supabase/migrations/20260930000300_create_match.sql`

- [ ] **Step 1: Write the failing test** (con Write)

`supabase/tests/database/create_match.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(15);

-- Ana: female, drive, 5th category.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(3, '20:15'), true, 4, 6, 'mixed', 'drive') $$,
  'P0001', 'not_aligned', 'a match starts on the grid');
select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(-1, '20:00'), true, 4, 6, 'mixed', 'drive') $$,
  'P0001', 'in_the_past', 'no matches in the past');
select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(15, '20:00'), true, 4, 6, 'mixed', 'drive') $$,
  'P0001', 'outside_window', 'no matches beyond the booking window');
select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(3, '20:00'), true, 6, 8, 'mixed', 'drive') $$,
  'P0001', 'category_mismatch', 'the creator fits the category range');
select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(3, '20:00'), true, 4, 6, 'male', 'drive') $$,
  'P0001', 'type_mismatch', 'the creator fits the match type');
select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(3, '20:00'), true, 4, 6, 'mixed', 'backhand') $$,
  'P0001', 'side_mismatch', 'the creator takes the side she plays');
select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(3, '20:00'), true, 4, 6, 'mixed', 'both') $$,
  'P0001', 'invalid_input', 'the creator takes drive or backhand');
select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(3, '20:00'), true, 6, 4, 'mixed', 'drive') $$,
  'P0001', 'invalid_input', 'the range goes from low to high');

select lives_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(3, '20:00'), true, 4, 6, 'mixed', 'drive') $$,
  'a player creates an open match');
select results_eq(
  $$ select position::int, team, side::text, player_id from public.match_slots
     where match_id = test_helpers.match_at(3, '20:00') order by position $$,
  $$ values (1, 'A', 'drive', '00000000-0000-0000-0000-0000000000a1'::uuid), (2, 'A', 'backhand', null::uuid),
            (3, 'B', 'drive', null::uuid), (4, 'B', 'backhand', null::uuid) $$,
  'four spots, the creator in team A on her side');
select is((select count(*)::int from public.court_occupancy where starts_at = test_helpers.at(3, '20:00')), 0,
  'a forming match holds no court');
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000002', test_helpers.at(3, '20:00')) $$,
  'P0001', 'busy_at_that_time', 'a player in a match cannot book another court at that time');

-- Court 2 is booked at day 4 10:00, and for a moment the club closes matches 48 h before.
reset role;
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(4, '10:00', 90), '00000000-0000-0000-0000-0000000000d1');
update public.clubs set match_close_hours = 48 where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;

select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(1, '20:00'), true, 4, 6, 'mixed', 'drive') $$,
  'P0001', 'match_closed', 'no new matches after the closing time');

reset role;
update public.clubs set match_close_hours = 3 where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;

select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000002', test_helpers.at(4, '10:00'), false, 4, 6, 'mixed', 'drive') $$,
  'P0001', 'slot_taken', 'with no other court allowed, the preferred court has to be free');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select throws_ok(
  $$ select public.create_match('c0000000-0000-0000-0000-000000000001', test_helpers.at(5, '10:00'), true, 1, 8, 'mixed', 'drive') $$,
  'P0001', 'forbidden', 'only members create matches');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/create_match.test.sql`
Expected: FAIL (`function public.create_match(...) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260930000300_create_match.sql`:
```sql
-- Open matches, part 1: the rules every match function shares, and creating a match. A player's
-- bookings and matches take the same advisory lock ('book_slot:' || uid), so "nothing else at that
-- time" holds without races, and book_slot now also looks at matches.

-- Whether the person already has something at that time: a confirmed booking of hers, or a spot in
-- a match that is not cancelled.
create function private.is_busy(p_user_id uuid, p_period tstzrange)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b
    where b.player_id = p_user_id and b.status = 'confirmed' and b.period && p_period
  ) or exists (
    select 1 from public.match_slots s
    join public.open_matches m on m.id = s.match_id
    where s.player_id = p_user_id and m.status <> 'cancelled' and m.period && p_period
  );
$$;

-- When a forming match stops taking players: match_close_hours before it starts.
create function private.match_closes_at(p_match public.open_matches)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select lower(p_match.period) - make_interval(hours => c.match_close_hours)
  from public.clubs c
  where c.id = p_match.club_id;
$$;

-- null when the person fits the spot; otherwise the error code, checked in this order:
-- category (her current one, validated or not), match type, side.
create function private.match_fit(p_user_id uuid, p_match public.open_matches, p_side public.player_side)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when m.category is null or m.category not between p_match.category_min and p_match.category_max
      then 'category_mismatch'
    when p_match.match_type <> 'mixed' and p.gender::text is distinct from p_match.match_type::text
      then 'type_mismatch'
    when p.side is distinct from 'both' and p.side is distinct from p_side
      then 'side_mismatch'
  end
  from public.profiles p
  left join public.club_members m on m.user_id = p.id and m.club_id = p_match.club_id
  where p.id = p_user_id;
$$;

-- Creates the match and its four spots; the creator takes the team A spot of her side.
-- It takes no court: that happens when the fourth player joins.
create function public.create_match(
  p_court_id uuid,
  p_starts_at timestamptz,
  p_allow_other_court boolean,
  p_category_min integer,
  p_category_max integer,
  p_match_type public.match_type,
  p_side public.player_side
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
  v_fit text;
begin
  if v_uid is null or not private.is_club_member(v_club_id) then
    perform private.fail('forbidden');
  end if;
  if p_allow_other_court is null or p_match_type is null or p_side is null or p_side = 'both'
     or p_category_min is null or p_category_max is null
     or p_category_min not between 1 and 8 or p_category_max not between 1 and 8
     or p_category_min > p_category_max then
    perform private.fail('invalid_input');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('book_slot:' || v_uid::text, 0));
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
  v_fit := private.match_fit(v_uid, v_match, p_side);
  if v_fit is not null then
    perform private.fail(v_fit);
  end if;
  if private.is_busy(v_uid, v_match.period) then
    perform private.fail('busy_at_that_time');
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
         (case when pos % 2 = 1 then 'drive' else 'backhand' end)::public.player_side,
         case when pos = (case when p_side = 'drive' then 1 else 2 end) then v_uid end,
         case when pos = (case when p_side = 'drive' then 1 else 2 end) then now() end
  from generate_series(1, 4) as pos;

  return v_match;
end;
$$;

-- Same as fase 1, but "busy" now also means a spot in a match at that time.
create or replace function public.book_slot(p_court_id uuid, p_starts_at timestamptz)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_club_id uuid;
  v_club public.clubs;
  v_period tstzrange;
  v_price integer;
begin
  v_club_id := private.active_court_club(p_court_id);
  if v_uid is null or not private.is_club_member(v_club_id) then
    perform private.fail('forbidden');
  end if;
  -- One booking or match at a time per player, so the limit and the same-time checks cannot race.
  perform pg_advisory_xact_lock(hashtextextended('book_slot:' || v_uid::text, 0));
  select * into v_club from public.clubs where id = v_club_id;

  v_period := private.slot_period(v_club_id, p_starts_at);
  if lower(v_period) <= now() then
    perform private.fail('in_the_past');
  end if;
  if lower(v_period) > now() + make_interval(days => v_club.booking_window_days) then
    perform private.fail('outside_window');
  end if;

  v_price := private.slot_price(v_club_id, lower(v_period));
  if v_price is null then
    perform private.fail('no_price');
  end if;

  if private.is_busy(v_uid, v_period) then
    perform private.fail('busy_at_that_time');
  end if;

  -- Recurring series and matches do not count toward the limit.
  if (
    select count(*) from public.bookings b
    where b.club_id = v_club_id and b.player_id = v_uid and b.status = 'confirmed'
      and b.series_id is null and b.starts_at > now()
  ) >= v_club.max_active_bookings then
    perform private.fail('too_many_bookings');
  end if;

  return private.insert_booking(v_club_id, p_court_id, v_period, 'booking', v_uid, null, 'online', null, v_price);
end;
$$;

revoke all on function private.is_busy(uuid, tstzrange) from public;
revoke all on function private.match_closes_at(public.open_matches) from public;
revoke all on function private.match_fit(uuid, public.open_matches, public.player_side) from public;
revoke execute on function public.create_match(uuid, timestamptz, boolean, integer, integer, public.match_type,
  public.player_side) from public, anon;
grant execute on function public.create_match(uuid, timestamptz, boolean, integer, integer, public.match_type,
  public.player_side) to authenticated;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/create_match.test.sql
npx supabase test db supabase/tests/database/player_bookings.test.sql
```
Expected: PASS en los dos (`book_slot` conserva el comportamiento de la fase 1).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260930000300_create_match.sql supabase/tests/database/create_match.test.sql
git commit -m "feat(db): create_match; bookings and matches share the busy rule"
```

---

### Task 9: Sumarse y completar (`join_match`)

**Files:**
- Create: `supabase/tests/database/join_match.test.sql`
- Create: `supabase/migrations/20260930000310_join_match.sql`

- [ ] **Step 1: Write the failing test** (con Write)

`supabase/tests/database/join_match.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(17);

-- M1: day 3 20:00, court 1 preferred (another court allowed), mixed 4th to 6th, Ana on spot 1.
-- Built as postgres: create_match has its own test.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '20:00', 90), array['00000000-0000-0000-0000-0000000000a1', null, null, null]::uuid[],
  'mixed', 4, 6);

set local role authenticated;

-- Bruno: male, backhand, 6th.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000001', 3) $$,
  'P0001', 'side_mismatch', 'a backhand player cannot take a drive spot');
select lives_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000001', 2) $$,
  'a player joins on his side');
select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000001', 4) $$,
  'P0001', 'already_in_match', 'a player takes one spot per match');

-- Juli: female, backhand, 6th.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000001', 2) $$,
  'P0001', 'spot_taken', 'a taken spot cannot be joined');
select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000001', 5) $$,
  'P0001', 'invalid_input', 'spots go from 1 to 4');

-- Hugo: male, drive, 4th.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';
select lives_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000001', 3) $$, 'the third player joins');
select is((select status::text from public.open_matches where id = 'e1000000-0000-0000-0000-000000000001'), 'forming',
  'with three players the match is still forming');

-- Meanwhile someone books court 1 at that time.
reset role;
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '20:00', 90), '00000000-0000-0000-0000-0000000000d1', 1600);
set local role authenticated;

-- Iván: male, backhand, 5th. The fourth player books the court in the same transaction.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a4", "role": "authenticated"}';
select lives_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000001', 4) $$, 'the fourth player joins');

reset role;
select results_eq(
  $$ select m.status::text, m.court_id, b.court_id, b.price, b.player_id is null, o.kind::text
     from public.open_matches m
     join public.bookings b on b.id = m.booking_id
     join public.court_occupancy o on o.id = b.occupancy_id
     where m.id = 'e1000000-0000-0000-0000-000000000001' $$,
  $$ values ('confirmed', 'c0000000-0000-0000-0000-000000000002'::uuid, 'c0000000-0000-0000-0000-000000000002'::uuid,
             1600, true, 'match') $$,
  'with four the match is confirmed and books another free court, at the slot price');
set local role authenticated;

-- Juli again: a confirmed match takes nobody else.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000001', 2) $$,
  'P0001', 'match_closed', 'a confirmed match is no longer open');

-- M2: day 5 10:00, only court 1, which is taken; three players in.
reset role;
call test_helpers.make_match('e1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(5, '10:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', null]::uuid[],
  'mixed', 1, 8, false);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(5, '10:00', 90), '00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a4", "role": "authenticated"}';

select lives_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000002', 4) $$,
  'the fourth player gets an answer even when no court is left');
select results_eq(
  $$ select status::text, cancel_reason, booking_id is null from public.open_matches
     where id = 'e1000000-0000-0000-0000-000000000002' $$,
  $$ values ('cancelled', 'no_court', true) $$,
  'without a court the match is cancelled and says why');

-- M3 is for men, M4 for 4th to 5th, M5 closes within the hour, M6 clashes with Juli's booking.
reset role;
call test_helpers.make_match('e1000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(6, '10:00', 90), array['00000000-0000-0000-0000-0000000000a3', null, null, null]::uuid[], 'male');
call test_helpers.make_match('e1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(6, '11:30', 90), array['00000000-0000-0000-0000-0000000000a3', null, null, null]::uuid[],
  'mixed', 4, 5);
call test_helpers.make_match('e1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002',
  tstzrange(now() + interval '1 hour', now() + interval '150 minutes'),
  array['00000000-0000-0000-0000-0000000000a3', null, null, null]::uuid[]);
call test_helpers.make_match('e1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(6, '13:00', 90), array['00000000-0000-0000-0000-0000000000a3', null, null, null]::uuid[]);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(6, '13:00', 90), '00000000-0000-0000-0000-0000000000a5');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';

select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000003', 2) $$,
  'P0001', 'type_mismatch', 'a woman cannot join a men''s match');
select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000004', 2) $$,
  'P0001', 'category_mismatch', 'a 6th category player cannot join a 4th to 5th match');
select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000005', 2) $$,
  'P0001', 'match_closed', 'nobody joins after the closing time');
select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000006', 2) $$,
  'P0001', 'busy_at_that_time', 'a player cannot be in two places at once');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select throws_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000006', 2) $$,
  'P0001', 'forbidden', 'only members join');

select * from finish();
rollback;
```

The race for the last spot is settled by `select … for update` on the match row: two joins run one after the other, and the second sees the match `confirmed` (`match_closed`) or the spot taken (`spot_taken`) — the sequential version of that race is what this test checks.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/join_match.test.sql`
Expected: FAIL (`function public.join_match(...) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260930000310_join_match.sql`:
```sql
-- Open matches, part 2: joining. The fourth player fills the match and, in the same transaction,
-- it takes the court it held or books one (the preferred court, or the first free one if the
-- creator allowed it). Without a court the match is cancelled, and that is an answer, not an error.

-- Books a court for a full match. Returns the booking, or null when no court is free.
create function private.book_match_court(p_match public.open_matches)
returns public.bookings
language plpgsql
set search_path = ''
as $$
declare
  v_price integer := private.slot_price(p_match.club_id, lower(p_match.period));
  v_court_id uuid;
  v_occupancy_id uuid;
  v_booking public.bookings;
begin
  if v_price is null then
    perform private.fail('no_price');
  end if;

  for v_court_id in
    select c.id from public.courts c
    where c.club_id = p_match.club_id and c.is_active
      and (c.id = p_match.preferred_court_id or p_match.allow_other_court)
    order by c.id = p_match.preferred_court_id desc, c.sort_order, c.name
  loop
    v_occupancy_id := null;
    begin
      insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
      values (p_match.club_id, v_court_id, 'match', p_match.period, (select auth.uid()))
      returning id into v_occupancy_id;
    exception when exclusion_violation then
      v_occupancy_id := null;
    end;

    if v_occupancy_id is not null then
      insert into public.bookings (club_id, court_id, period, match_id, source, price, occupancy_id, created_by)
      values (p_match.club_id, v_court_id, p_match.period, p_match.id, 'online', v_price, v_occupancy_id,
              (select auth.uid()))
      returning * into v_booking;
      return v_booking;
    end if;
  end loop;

  return null;
end;
$$;

-- Cancels a match and the booking it holds, if any. Callers lock the match first.
create function private.cancel_match_row(p_match public.open_matches, p_reason text, p_note text default null)
returns public.open_matches
language plpgsql
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_match public.open_matches;
begin
  if p_match.status = 'cancelled' then
    perform private.fail('invalid_state');
  end if;

  if p_match.booking_id is not null then
    select * into v_booking from public.bookings where id = p_match.booking_id for update;
    if found and v_booking.status = 'confirmed' then
      perform private.cancel_booking_row(v_booking);
    end if;
  end if;

  update public.open_matches
     set status = 'cancelled', cancel_reason = p_reason, cancel_note = nullif(trim(p_note), ''), cancelled_at = now()
   where id = p_match.id
  returning * into v_match;
  return v_match;
end;
$$;

create function public.join_match(p_match_id uuid, p_position integer)
returns public.open_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_match public.open_matches;
  v_slot public.match_slots;
  v_fit text;
  v_booking public.bookings;
begin
  -- Locking the match serializes joins: in a race for the last spot only one gets in.
  select * into v_match from public.open_matches where id = p_match_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null or not private.is_club_member(v_match.club_id) then
    perform private.fail('forbidden');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('book_slot:' || v_uid::text, 0));

  if v_match.status <> 'forming' or now() >= private.match_closes_at(v_match) then
    perform private.fail('match_closed');
  end if;
  if exists (select 1 from public.match_slots where match_id = v_match.id and player_id = v_uid) then
    perform private.fail('already_in_match');
  end if;
  select * into v_slot from public.match_slots where match_id = v_match.id and position = p_position;
  if not found then
    perform private.fail('invalid_input');
  end if;
  if v_slot.player_id is not null then
    perform private.fail('spot_taken');
  end if;
  v_fit := private.match_fit(v_uid, v_match, v_slot.side);
  if v_fit is not null then
    perform private.fail(v_fit);
  end if;
  if private.is_busy(v_uid, v_match.period) then
    perform private.fail('busy_at_that_time');
  end if;

  update public.match_slots set player_id = v_uid, joined_at = now()
   where match_id = v_match.id and position = p_position;

  if exists (select 1 from public.match_slots where match_id = v_match.id and player_id is null) then
    return v_match;
  end if;

  -- The fourth player: the match keeps the court it held, or books one now.
  if v_match.booking_id is not null
     and exists (select 1 from public.bookings where id = v_match.booking_id and status = 'confirmed') then
    update public.open_matches set status = 'confirmed' where id = v_match.id returning * into v_match;
    return v_match;
  end if;

  v_booking := private.book_match_court(v_match);
  if v_booking.id is null then
    return private.cancel_match_row(v_match, 'no_court');
  end if;

  update public.open_matches
     set status = 'confirmed', booking_id = v_booking.id, court_id = v_booking.court_id
   where id = v_match.id
  returning * into v_match;
  return v_match;
end;
$$;

revoke all on function private.book_match_court(public.open_matches) from public;
revoke all on function private.cancel_match_row(public.open_matches, text, text) from public;
revoke execute on function public.join_match(uuid, integer) from public, anon;
grant execute on function public.join_match(uuid, integer) to authenticated;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/join_match.test.sql
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260930000310_join_match.sql supabase/tests/database/join_match.test.sql
git commit -m "feat(db): join_match books the court when the fourth player joins"
```

---

### Task 10: Salir, staff y cierre automático

**Files:**
- Create: `supabase/tests/database/leave_match.test.sql`, `supabase/tests/database/match_staff.test.sql`
- Create: `supabase/migrations/20260930000320_leave_and_close.sql`

- [ ] **Step 1: Write the failing tests** (con Write)

`supabase/tests/database/leave_match.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(13);

-- F: forming, day 3 10:00, Ana and Bruno.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '10:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', null, null]::uuid[]);
-- C: confirmed, day 3 20:00 on court 1: Ana, Bruno, Hugo, Iván. Bruno reported a transfer, Hugo paid cash.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '20:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4']::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001');
insert into public.payments (club_id, booking_id, method, amount, status, payer_id)
select club_id, booking_id, 'transfer', 400, 'reported', '00000000-0000-0000-0000-0000000000b1'
from public.open_matches where id = 'e1000000-0000-0000-0000-000000000002';
insert into public.payments (club_id, booking_id, method, amount, status, payer_id, confirmed_at)
select club_id, booking_id, 'cash', 400, 'confirmed', '00000000-0000-0000-0000-0000000000a3', now()
from public.open_matches where id = 'e1000000-0000-0000-0000-000000000002';

set local role authenticated;

-- Bruno leaves F.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select lives_ok($$ select public.leave_match('e1000000-0000-0000-0000-000000000001') $$,
  'a player leaves a forming match whenever he wants');
select results_eq(
  $$ select m.status::text, (select count(*)::int from public.match_slots s where s.match_id = m.id and s.player_id is not null)
     from public.open_matches m where m.id = 'e1000000-0000-0000-0000-000000000001' $$,
  $$ values ('forming', 1) $$,
  'his spot is free again');

-- Ana, the last one, leaves F.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok($$ select public.leave_match('e1000000-0000-0000-0000-000000000001') $$, 'the last player leaves');
select results_eq(
  $$ select status::text, cancel_reason from public.open_matches where id = 'e1000000-0000-0000-0000-000000000001' $$,
  $$ values ('cancelled', 'empty') $$,
  'a match with nobody left is cancelled');
select throws_ok($$ select public.leave_match('e1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'only players of the match leave it');

-- Bruno leaves C, three days ahead (24 h notice).
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select lives_ok($$ select public.leave_match('e1000000-0000-0000-0000-000000000002') $$,
  'with enough notice a player leaves a confirmed match');

reset role;
select results_eq(
  $$ select m.status::text, b.status::text,
            (select count(*)::int from public.court_occupancy o where o.id = b.occupancy_id)
     from public.open_matches m join public.bookings b on b.id = m.booking_id
     where m.id = 'e1000000-0000-0000-0000-000000000002' $$,
  $$ values ('forming', 'confirmed', 1) $$,
  'the match looks for someone else and keeps its court');
select results_eq(
  $$ select status::text, rejection_reason from public.payments where payer_id = '00000000-0000-0000-0000-0000000000b1' $$,
  $$ values ('rejected', 'Salió del partido') $$,
  'his reported transfer is rejected');
set local role authenticated;

-- Hugo already paid: the club has to take him out and give the money back.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';
select throws_ok($$ select public.leave_match('e1000000-0000-0000-0000-000000000002') $$,
  'P0001', 'already_paid', 'a player who paid asks the club to leave');

-- Juli takes Bruno's spot: the match is confirmed again with the court it kept.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
select lives_ok($$ select public.join_match('e1000000-0000-0000-0000-000000000002', 2) $$,
  'a new fourth player joins');
reset role;
select results_eq(
  $$ select m.status::text, (select count(*)::int from public.bookings b where b.match_id = m.id)
     from public.open_matches m where m.id = 'e1000000-0000-0000-0000-000000000002' $$,
  $$ values ('confirmed', 1) $$,
  'the match is confirmed again without a second booking');

-- The club now asks for 96 h of notice.
update public.clubs set cancellation_notice_hours = 96 where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a4", "role": "authenticated"}';
select throws_ok($$ select public.leave_match('e1000000-0000-0000-0000-000000000002') $$,
  'P0001', 'notice_period', 'inside the notice period nobody leaves a confirmed match');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select throws_ok($$ select public.leave_match('e1000000-0000-0000-0000-000000000002') $$,
  'P0001', 'forbidden', 'strangers cannot leave a match');

select * from finish();
rollback;
```

`supabase/tests/database/match_staff.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(17);

-- A: forming, day 3 10:00. B: confirmed, day 3 20:00, court 1. C: confirmed, day 4 20:00, court 2.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '10:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', null, null]::uuid[]);
call test_helpers.make_match('e1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '20:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4']::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001');
call test_helpers.make_match('e1000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(4, '20:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4']::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002');
-- D: forming, closes within the hour. E: lost a player, still holds court 2, also past closing.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001',
  tstzrange(now() + interval '1 hour', now() + interval '150 minutes'),
  array['00000000-0000-0000-0000-0000000000a1', null, null, null]::uuid[]);
call test_helpers.make_match('e1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002',
  tstzrange(now() + interval '2 hours', now() + interval '210 minutes'),
  array['00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4',
        '00000000-0000-0000-0000-0000000000b1', null]::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 1600, false);

set local role authenticated;

-- Bruno, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok($$ select public.cancel_match('e1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'players cannot cancel a match');
select throws_ok(
  $$ select public.remove_from_match('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1') $$,
  'P0001', 'forbidden', 'players cannot take others out');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.remove_from_match('e1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1') $$,
  'reception takes a player out of a confirmed match, with no notice period');
select results_eq(
  $$ select m.status::text, (select count(*)::int from public.match_slots s where s.match_id = m.id and s.player_id is not null)
     from public.open_matches m where m.id = 'e1000000-0000-0000-0000-000000000002' $$,
  $$ values ('forming', 3) $$,
  'the match looks for someone else');
select throws_ok(
  $$ select public.remove_from_match('e1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a5') $$,
  'P0001', 'not_found', 'only players of the match can be taken out');
select lives_ok($$ select public.cancel_match('e1000000-0000-0000-0000-000000000002', 'Lluvia') $$,
  'reception cancels a match');
select results_eq(
  $$ select m.status::text, m.cancel_reason, m.cancel_note, b.status::text
     from public.open_matches m join public.bookings b on b.id = m.booking_id
     where m.id = 'e1000000-0000-0000-0000-000000000002' $$,
  $$ values ('cancelled', 'by_club', 'Lluvia', 'cancelled') $$,
  'the match and its booking are cancelled, with the reason');
select is(
  (select count(*)::int from public.court_occupancy
   where court_id = 'c0000000-0000-0000-0000-000000000001' and starts_at = test_helpers.at(3, '20:00')),
  0, 'the court is free again');
select throws_ok($$ select public.cancel_match('e1000000-0000-0000-0000-000000000002') $$,
  'P0001', 'invalid_state', 'a cancelled match cannot be cancelled again');
select lives_ok(
  $$ select public.cancel_booking((select booking_id from public.open_matches where id = 'e1000000-0000-0000-0000-000000000003')) $$,
  'reception cancels a match booking from the grid');
select results_eq(
  $$ select status::text, cancel_reason from public.open_matches where id = 'e1000000-0000-0000-0000-000000000003' $$,
  $$ values ('cancelled', 'by_club') $$,
  'cancelling the booking cancels its match');

-- The job, as postgres.
reset role;
select is(public.close_matches(), 2, 'the job closes the forming matches that reached their closing time');
select results_eq(
  $$ select id, status::text, cancel_reason from public.open_matches
     where id in ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000004',
                  'e1000000-0000-0000-0000-000000000005')
     order by id $$,
  $$ values ('e1000000-0000-0000-0000-000000000001'::uuid, 'forming', null::text),
            ('e1000000-0000-0000-0000-000000000004'::uuid, 'cancelled', 'not_filled'),
            ('e1000000-0000-0000-0000-000000000005'::uuid, 'cancelled', 'not_filled') $$,
  'matches far from closing time are left alone');
select is((select status::text from public.bookings where match_id = 'e1000000-0000-0000-0000-000000000005'), 'cancelled',
  'a court held by a closed match is freed');

select ok(not has_function_privilege('authenticated', 'public.close_matches()', 'execute'),
  'only the job and the service role close matches');
select is((select count(*)::int from cron.job where jobname = 'close-open-matches'), 1,
  'pg_cron runs close_matches');
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in ('is_busy', 'match_fit', 'match_closes_at', 'book_match_court', 'cancel_match_row',
                         'free_match_slot')
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot execute the private match writers');

select * from finish();
rollback;
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx supabase test db supabase/tests/database/leave_match.test.sql
npx supabase test db supabase/tests/database/match_staff.test.sql
```
Expected: FAIL (`function public.leave_match(uuid) does not exist`, `function public.cancel_match(...) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260930000320_leave_and_close.sql`:
```sql
-- Open matches, part 3: leaving, the staff actions and the automatic closing. A confirmed match that
-- loses a player goes back to forming and keeps its court until closing time; if nobody fills the
-- spot by then, the job cancels it and frees the court.

-- Frees the spot of p_player_id and rejects his reported transfer. Callers lock the match first.
create function private.free_match_slot(p_match public.open_matches, p_player_id uuid)
returns public.open_matches
language plpgsql
set search_path = ''
as $$
declare
  v_match public.open_matches;
begin
  update public.match_slots set player_id = null, joined_at = null
   where match_id = p_match.id and player_id = p_player_id;
  if not found then
    perform private.fail('not_found');
  end if;

  if p_match.booking_id is not null then
    update public.payments
       set status = 'rejected', rejection_reason = 'Salió del partido',
           confirmed_by = (select auth.uid()), confirmed_at = now()
     where booking_id = p_match.booking_id and payer_id = p_player_id and status = 'reported';
  end if;

  if not exists (select 1 from public.match_slots where match_id = p_match.id and player_id is not null) then
    return private.cancel_match_row(p_match, 'empty');
  end if;
  if now() >= private.match_closes_at(p_match) then
    return private.cancel_match_row(p_match, 'not_filled');
  end if;

  update public.open_matches set status = 'forming' where id = p_match.id returning * into v_match;
  return v_match;
end;
$$;

-- Forming: whenever. Confirmed: with the club's cancellation notice. Someone who already paid asks
-- the club, which takes him out and gives the money back.
create function public.leave_match(p_match_id uuid)
returns public.open_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_match public.open_matches;
  v_notice_hours smallint;
begin
  select * into v_match from public.open_matches where id = p_match_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null
     or not exists (select 1 from public.match_slots where match_id = v_match.id and player_id = v_uid) then
    perform private.fail('forbidden');
  end if;
  if v_match.status = 'cancelled' or v_match.starts_at <= now() then
    perform private.fail('invalid_state');
  end if;
  if v_match.status = 'confirmed' then
    select cancellation_notice_hours into v_notice_hours from public.clubs where id = v_match.club_id;
    if v_match.starts_at - now() < make_interval(hours => v_notice_hours) then
      perform private.fail('notice_period');
    end if;
  end if;
  if exists (
    select 1 from public.payments
    where booking_id = v_match.booking_id and payer_id = v_uid and status = 'confirmed'
  ) then
    perform private.fail('already_paid');
  end if;

  return private.free_match_slot(v_match, v_uid);
end;
$$;

-- Reception and admin cancel any match of their club, with its booking.
create function public.cancel_match(p_match_id uuid, p_note text default null)
returns public.open_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.open_matches;
begin
  select * into v_match from public.open_matches where id = p_match_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_match.club_id) then
    perform private.fail('forbidden');
  end if;
  if length(trim(p_note)) > 120 then
    perform private.fail('invalid_input');
  end if;
  return private.cancel_match_row(v_match, 'by_club', p_note);
end;
$$;

-- Reception and admin take a player out, with no notice period (his payments stay for a refund).
create function public.remove_from_match(p_match_id uuid, p_player_id uuid)
returns public.open_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.open_matches;
begin
  select * into v_match from public.open_matches where id = p_match_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_match.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_match.status = 'cancelled' then
    perform private.fail('invalid_state');
  end if;
  return private.free_match_slot(v_match, p_player_id);
end;
$$;

-- A match's booking goes with its match: cancelling it from the grid cancels the match.
-- Locks the match before the booking, in the same order as cancel_match.
create or replace function public.cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_match public.open_matches;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_booking.club_id) then
    perform private.fail('forbidden');
  end if;

  if v_booking.match_id is not null then
    select * into v_match from public.open_matches where id = v_booking.match_id for update;
    if v_match.status <> 'cancelled' and v_match.booking_id = v_booking.id then
      perform private.cancel_match_row(v_match, 'by_club');
      select * into v_booking from public.bookings where id = p_booking_id;
      return v_booking;
    end if;
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  return private.cancel_booking_row(v_booking);
end;
$$;

-- Cancels the forming matches that reached their closing time, and frees the court they held.
-- Each match runs in its own subtransaction: an unexpected error is logged and retried next run.
-- Returns how many it closed.
create function public.close_matches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.open_matches;
  v_count integer := 0;
begin
  for v_match in
    select m.* from public.open_matches m
    join public.clubs c on c.id = m.club_id
    where m.status = 'forming' and now() >= m.starts_at - make_interval(hours => c.match_close_hours)
    for update of m skip locked
  loop
    begin
      perform private.cancel_match_row(v_match, 'not_filled');
      v_count := v_count + 1;
    exception when others then
      raise warning 'close_matches: match % failed: %', v_match.id, sqlerrm;
    end;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.free_match_slot(public.open_matches, uuid) from public;
revoke execute on function public.leave_match(uuid) from public, anon;
revoke execute on function public.cancel_match(uuid, text) from public, anon;
revoke execute on function public.remove_from_match(uuid, uuid) from public, anon;
revoke execute on function public.close_matches() from public, anon, authenticated;
grant execute on function public.leave_match(uuid) to authenticated;
grant execute on function public.cancel_match(uuid, text) to authenticated;
grant execute on function public.remove_from_match(uuid, uuid) to authenticated;
-- The e2e test of the closing calls it with the service role key (local stack only).
grant execute on function public.close_matches() to service_role;

-- Every 10 minutes.
select cron.schedule('close-open-matches', '*/10 * * * *', 'select public.close_matches()');
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/leave_match.test.sql
npx supabase test db supabase/tests/database/match_staff.test.sql
npm run test:db
```
Expected: PASS en todo (incluye `staff_bookings.test.sql`, que sigue usando `cancel_booking` con reservas comunes).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260930000320_leave_and_close.sql supabase/tests/database/leave_match.test.sql supabase/tests/database/match_staff.test.sql
git commit -m "feat(db): leave, staff cancel and remove, automatic closing of matches"
```

---

### Task 11: Tipos y verificación del corte 2

**Files:**
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: Regenerate types and check**

Run:
```bash
npm run db:types
npm run typecheck
npm test
```
Expected: aparecen `create_match`, `join_match`, `leave_match`, `cancel_match`, `remove_from_match`, `close_matches` en `Functions`; typecheck y Vitest en verde.

- [ ] **Step 2: Commit and push**

```bash
git add lib/supabase/database.types.ts
git commit -m "chore(types): match functions"
git push
```

---

## Corte 3: Pagos por jugador

### Task 12: Parte por jugador en transferencias y efectivo

**Files:**
- Create: `supabase/tests/database/match_payments.test.sql`
- Create: `supabase/migrations/20260930000400_match_payments.sql`
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: Write the failing test** (con Write)

`supabase/tests/database/match_payments.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(17);

-- A confirmed match at day 3 20:00 whose booking costs 1602: 402 for spot 1 (Ana), 400 for the rest.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '20:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4']::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 1602);

create function test_helpers.match_booking()
returns uuid
language sql
stable
as $$
  select booking_id from public.open_matches where id = 'e1000000-0000-0000-0000-000000000001';
$$;

insert into storage.objects (bucket_id, name) values
  ('receipts', '00000000-0000-0000-0000-0000000000a1/r.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000b1/r.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000a5/r.png');

set local role authenticated;

-- Ana, spot 1
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.report_transfer(test_helpers.match_booking(), '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'a match player reports the transfer of her share');
select results_eq(
  $$ select amount, payer_id from public.payments where payer_id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values (402, '00000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'spot 1 pays the price divided by four plus the remainder');
select throws_ok(
  $$ select public.report_transfer(test_helpers.match_booking(), '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'P0001', 'invalid_state', 'one reported transfer per player');

-- Bruno, spot 2
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select lives_ok(
  $$ select public.report_transfer(test_helpers.match_booking(), '00000000-0000-0000-0000-0000000000b1/r.png') $$,
  'another player reports his share while hers is pending');
select results_eq(
  $$ select amount from public.payments where payer_id = '00000000-0000-0000-0000-0000000000b1' $$,
  $$ values (400) $$,
  'the other spots pay a quarter');
select is((select count(*)::int from public.payments), 1, 'a match player sees only his own payments');

-- Juli, not in the match
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
select throws_ok(
  $$ select public.report_transfer(test_helpers.match_booking(), '00000000-0000-0000-0000-0000000000a5/r.png') $$,
  'P0001', 'forbidden', 'only players of the match report a share');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.record_cash(test_helpers.match_booking(), 400, '00000000-0000-0000-0000-0000000000a3') $$,
  'reception records cash for one player');
select throws_ok(
  $$ select public.record_cash(test_helpers.match_booking(), 400, '00000000-0000-0000-0000-0000000000a3') $$,
  'P0001', 'invalid_input', 'nobody pays more than his share');
select throws_ok(
  $$ select public.record_cash(test_helpers.match_booking(), 400) $$,
  'P0001', 'invalid_input', 'cash for a match says who pays');
select throws_ok(
  $$ select public.record_cash(test_helpers.match_booking(), 400, '00000000-0000-0000-0000-0000000000a5') $$,
  'P0001', 'invalid_input', 'only players of the match pay a share');
select throws_ok(
  $$ select public.record_cash(test_helpers.match_booking(), 400, '00000000-0000-0000-0000-0000000000b1') $$,
  'P0001', 'invalid_input', 'cash does not cover a share a reported transfer already covers');
select lives_ok(
  $$ select public.confirm_payment((select id from public.payments
       where payer_id = '00000000-0000-0000-0000-0000000000a1')) $$,
  'reception confirms a share');

-- Someone recorded cash for Bruno meanwhile (as postgres): his transfer would go past his share.
reset role;
insert into public.payments (club_id, booking_id, method, amount, status, payer_id, confirmed_at)
values ('a0000000-0000-0000-0000-000000000001', test_helpers.match_booking(), 'cash', 400, 'confirmed',
        '00000000-0000-0000-0000-0000000000b1', now());
set local role authenticated;
select throws_ok(
  $$ select public.confirm_payment((select id from public.payments
       where payer_id = '00000000-0000-0000-0000-0000000000b1' and status = 'reported')) $$,
  'P0001', 'invalid_state', 'a share cannot be confirmed past what the player owes');

-- A booking of one player works as in fase 1.
reset role;
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(4, '10:00', 90), '00000000-0000-0000-0000-0000000000a5', 1200);
set local role authenticated;
select throws_ok(
  $$ select public.record_cash('b0000000-0000-0000-0000-000000000001', 1200, '00000000-0000-0000-0000-0000000000a5') $$,
  'P0001', 'invalid_input', 'a booking of one player has no payer per share');
select lives_ok($$ select public.record_cash('b0000000-0000-0000-0000-000000000001', 1200) $$,
  'cash for a whole booking still works');

select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname in ('match_share', 'share_due', 'reported_amount')
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot execute the share helpers');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/match_payments.test.sql`
Expected: FAIL (`report_transfer` da `forbidden` para Ana: la reserva no tiene `player_id`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260930000400_match_payments.sql`:
```sql
-- Payments by player: in a match each player pays his share (price / 4, the remainder on spot 1),
-- at the club or by transfer. What a player owes is his share minus his confirmed payments; the match
-- is paid when the four shares are. Bookings of one player keep the fase 1 rules.

-- A match player's share of the booking; null when the person is not in the match.
create function private.match_share(p_booking public.bookings, p_payer_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select p_booking.price / 4 + case when s.position = 1 then p_booking.price % 4 else 0 end
  from public.match_slots s
  where s.match_id = p_booking.match_id and s.player_id = p_payer_id;
$$;

-- His share minus his confirmed payments; null when he is not in the match.
create function private.share_due(p_booking public.bookings, p_payer_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select private.match_share(p_booking, p_payer_id) - coalesce((
    select sum(p.amount) from public.payments p
    where p.booking_id = p_booking.id and p.payer_id = p_payer_id and p.status = 'confirmed'
  ), 0)::integer;
$$;

-- What reported transfers already cover, for one payer (null = a booking of one player).
create function private.reported_amount(p_booking_id uuid, p_payer_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(amount), 0)::integer from public.payments
  where booking_id = p_booking_id and payer_id is not distinct from p_payer_id and status = 'reported';
$$;

create or replace function public.report_transfer(p_booking_id uuid, p_receipt_path text default null)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_booking public.bookings;
  v_club public.clubs;
  v_path text := nullif(trim(p_receipt_path), '');
  v_payer uuid;
  v_due integer;
  v_payment public.payments;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null then
    perform private.fail('forbidden');
  end if;
  if v_booking.match_id is not null then
    -- In a match each player reports his own share.
    if not private.is_match_player(v_booking.match_id) then
      perform private.fail('forbidden');
    end if;
    v_payer := v_uid;
  elsif v_booking.player_id is distinct from v_uid then
    perform private.fail('forbidden');
  end if;
  if v_booking.status <> 'confirmed' then
    perform private.fail('invalid_state');
  end if;

  select * into v_club from public.clubs where id = v_booking.club_id;
  if not v_club.accepts_transfer then
    perform private.fail('method_disabled');
  end if;
  if v_path is null and v_club.transfer_receipt_required then
    perform private.fail('receipt_required');
  end if;
  if v_path is not null and (
    private.folder_owner(v_path) is distinct from v_uid
    or position('..' in v_path) > 0
    or not exists (select 1 from storage.objects o where o.bucket_id = 'receipts' and o.name = v_path)
  ) then
    perform private.fail('forbidden');
  end if;
  if exists (
    select 1 from public.payments
    where booking_id = v_booking.id and status = 'reported' and payer_id is not distinct from v_payer
  ) then
    perform private.fail('invalid_state');
  end if;

  v_due := case
    when v_payer is null then v_booking.price - private.confirmed_amount(v_booking.id)
    else private.share_due(v_booking, v_payer)
  end;
  if v_due is null or v_due <= 0 then
    perform private.fail('invalid_state');
  end if;

  insert into public.payments (club_id, booking_id, method, amount, status, receipt_path, reported_by, payer_id)
  values (v_booking.club_id, v_booking.id, 'transfer', v_due, 'reported', v_path, v_uid, v_payer)
  returning * into v_payment;
  return v_payment;
end;
$$;

-- Cash for a match says who pays; cash for a booking of one player does not.
drop function public.record_cash(uuid, integer);

create function public.record_cash(p_booking_id uuid, p_amount integer, p_payer_id uuid default null)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_booking public.bookings;
  v_left integer;
  v_payment public.payments;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_booking.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_booking.status <> 'confirmed' then
    perform private.fail('invalid_state');
  end if;
  if not (select accepts_cash from public.clubs where id = v_booking.club_id) then
    perform private.fail('method_disabled');
  end if;

  if v_booking.match_id is null then
    if p_payer_id is not null then
      perform private.fail('invalid_input');
    end if;
    v_left := v_booking.price - private.confirmed_amount(v_booking.id) - private.reported_amount(v_booking.id, null);
  else
    if p_payer_id is null then
      perform private.fail('invalid_input');
    end if;
    v_left := private.share_due(v_booking, p_payer_id) - private.reported_amount(v_booking.id, p_payer_id);
  end if;
  if p_amount is null or p_amount <= 0 or v_left is null or p_amount > v_left then
    perform private.fail('invalid_input');
  end if;

  insert into public.payments (club_id, booking_id, method, amount, status, payer_id, reported_by, confirmed_by,
                               confirmed_at)
  values (v_booking.club_id, v_booking.id, 'cash', p_amount, 'confirmed', p_payer_id, v_uid, v_uid, now())
  returning * into v_payment;
  return v_payment;
end;
$$;

-- A reported share is confirmed only up to what that player still owes.
create or replace function public.confirm_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments := private.staff_payment(p_payment_id);
  v_booking public.bookings;
  v_left integer;
begin
  if v_payment.status <> 'reported' then
    perform private.fail('invalid_state');
  end if;

  select * into v_booking from public.bookings where id = v_payment.booking_id for update;
  v_left := case
    when v_payment.payer_id is null then v_booking.price - private.confirmed_amount(v_booking.id)
    else private.share_due(v_booking, v_payment.payer_id)
  end;
  if v_booking.status <> 'confirmed' or v_left is null or v_payment.amount > v_left then
    perform private.fail('invalid_state');
  end if;

  update public.payments
     set status = 'confirmed', confirmed_by = (select auth.uid()), confirmed_at = now()
   where id = v_payment.id
  returning * into v_payment;
  return v_payment;
end;
$$;

revoke all on function private.match_share(public.bookings, uuid) from public;
revoke all on function private.share_due(public.bookings, uuid) from public;
revoke all on function private.reported_amount(uuid, uuid) from public;
revoke execute on function public.record_cash(uuid, integer, uuid) from public, anon;
grant execute on function public.record_cash(uuid, integer, uuid) to authenticated;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/match_payments.test.sql
npm run test:db
```
Expected: PASS en todo (`payments.test.sql` e `integrity.test.sql` de la fase 1 siguen en verde con la firma nueva de `record_cash`).

- [ ] **Step 5: Regenerate types, check and commit**

Run:
```bash
npm run db:types
npm run typecheck
npm test
```
Expected: `record_cash` tiene `p_payer_id?: string`; las llamadas existentes (`recordCash` en `app/(club)/club/grilla/actions.ts`) siguen compilando.

```bash
git add supabase/migrations/20260930000400_match_payments.sql supabase/tests/database/match_payments.test.sql lib/supabase/database.types.ts
git commit -m "feat(db): each match player pays his share"
git push
```

---

## Corte 4: Dominio TS

Reglas puras, sin Supabase ni React. Cada módulo replica una regla de la base; la base tiene la última palabra.

### Task 13: Errores nuevos

**Files:**
- Modify: `lib/domain/errors.ts`
- Test: `tests/unit/lib/domain/errors.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/unit/lib/domain/errors.test.ts`, change the comment above `DATABASE_CODES` to `// Every code the database functions raise (supabase/migrations/*.sql).` and extend the list:
```ts
const DATABASE_CODES = [
  'slot_taken', 'not_aligned', 'in_the_past', 'outside_window', 'notice_period', 'no_price',
  'too_many_bookings', 'busy_at_that_time', 'receipt_required', 'forbidden', 'not_found',
  'invalid_state', 'invalid_input', 'method_disabled',
  'category_mismatch', 'type_mismatch', 'side_mismatch', 'match_closed', 'already_in_match', 'spot_taken',
  'already_paid',
]
```
and add:
```ts
  it('explains the match rules in words', () => {
    expect(errorMessage('side_mismatch')).toBe('Ese lugar es para el otro lado de la cancha.')
    expect(errorMessage('busy_at_that_time')).toBe('Ya tenés una reserva o un partido a esa hora.')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/errors.test.ts`
Expected: FAIL (`translates category_mismatch`).

- [ ] **Step 3: Write minimal implementation**

In `lib/domain/errors.ts`, replace `busy_at_that_time` and add after `method_disabled`:
```ts
  busy_at_that_time: 'Ya tenés una reserva o un partido a esa hora.',
```
```ts
  category_mismatch: 'Tu categoría no entra en la de este partido.',
  type_mismatch: 'Este partido es para otro género. A los mixtos se suma cualquiera.',
  side_mismatch: 'Ese lugar es para el otro lado de la cancha.',
  match_closed: 'El partido ya no está abierto: se completó, se canceló o llegó la hora de cierre.',
  already_in_match: 'Ya estás en este partido.',
  spot_taken: 'Ese lugar se acaba de ocupar. Elegí otro.',
  already_paid: 'Ya pagaste tu parte: pedile al club que te saque del partido y te devuelva el pago.',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/errors.ts tests/unit/lib/domain/errors.test.ts
git commit -m "feat(domain): Spanish text for the match errors"
```

---

### Task 14: Partidos: tipos, textos y lectura (`lib/domain/matches.ts`)

**Files:**
- Create: `lib/domain/matches.ts`
- Create: `tests/unit/fixtures/matches.ts`
- Test: `tests/unit/lib/domain/matches.test.ts`

- [ ] **Step 1: Write the fixture**

`tests/unit/fixtures/matches.ts`:
```ts
import type { JoinContext, Match, MatchPlayer } from '@/lib/domain/matches'
import { at } from './grid'

// Thursday 2026-10-01 20:00 (the grid fixture's day), Cancha 1, mixed 4ª a 6ª, $1.600.
// Ana is on spot 1 (team A drive); spots 2, 3 and 4 are free.
export function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    startsAt: at('20:00'),
    endsAt: at('21:30'),
    preferredCourtId: 'court-1',
    preferredCourtName: 'Cancha 1',
    courtId: null,
    courtName: null,
    allowOtherCourt: true,
    categoryMin: 4,
    categoryMax: 6,
    type: 'mixed',
    status: 'forming',
    cancelReason: null,
    bookingId: null,
    price: 1600,
    slots: [
      { position: 1, side: 'drive', playerId: 'ana', playerName: 'Ana Pérez' },
      { position: 2, side: 'backhand', playerId: null, playerName: null },
      { position: 3, side: 'drive', playerId: null, playerName: null },
      { position: 4, side: 'backhand', playerId: null, playerName: null },
    ],
    ...overrides,
  }
}

// Fills spots by position: players[0] goes to spot 1, and so on; null leaves it free.
export function withPlayers(match: Match, players: (string | null)[]): Match {
  return {
    ...match,
    slots: match.slots.map((slot, index) => ({
      ...slot,
      playerId: players[index] ?? null,
      playerName: players[index] ? `Jugador ${players[index]}` : null,
    })),
  }
}

export const BRUNO: MatchPlayer = { id: 'bruno', category: 5, gender: 'male', side: 'backhand' }
export const CONTEXT: JoinContext = { now: at('08:00'), closeHours: 3, busy: [] }
```

- [ ] **Step 2: Write the failing test**

`tests/unit/lib/domain/matches.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { at, RULES, TIMEZONE } from '../../fixtures/grid'
import { makeMatch, withPlayers } from '../../fixtures/matches'
import {
  categoryRangeLabel,
  defaultCategoryRange,
  howItWorks,
  joinResultMessage,
  leaveStatus,
  matchFormDefaults,
  missingText,
  perPlayerPrice,
  statusLabel,
  toMatch,
  type MatchRow,
} from '@/lib/domain/matches'

const ROW: MatchRow = {
  id: 'm1',
  starts_at: at('20:00').toISOString(),
  ends_at: at('21:30').toISOString(),
  preferred_court_id: 'court-1',
  court_id: null,
  allow_other_court: true,
  category_min: 4,
  category_max: 6,
  match_type: 'mixed',
  status: 'forming',
  cancel_reason: null,
  booking_id: null,
  booking: null,
  slots: [
    { position: 2, side: 'backhand', player_id: 'priv', player: null },
    { position: 1, side: 'drive', player_id: 'ana', player: { display_name: 'Ana Pérez' } },
    { position: 4, side: 'backhand', player_id: null, player: null },
    { position: 3, side: 'drive', player_id: null, player: null },
  ],
}
const LOOKUPS = { courtNames: new Map([['court-1', 'Cancha 1'], ['court-2', 'Cancha 2']]), rules: RULES, timezone: TIMEZONE }

describe('toMatch', () => {
  it('reads a match row with its spots in order and the estimated price', () => {
    const match = toMatch(ROW, LOOKUPS)
    expect(match).toMatchObject({ preferredCourtName: 'Cancha 1', courtName: null, price: 1600, type: 'mixed' })
    expect(match.slots.map((slot) => [slot.position, slot.playerName])).toEqual([
      [1, 'Ana Pérez'],
      [2, 'Jugador'],
      [3, null],
      [4, null],
    ])
  })

  it('uses the frozen price and the booked court once confirmed', () => {
    const match = toMatch({ ...ROW, status: 'confirmed', court_id: 'court-2', booking: { price: 1500 } }, LOOKUPS)
    expect(match).toMatchObject({ status: 'confirmed', courtName: 'Cancha 2', price: 1500 })
  })

  it('ignores cancel reasons it does not know', () => {
    expect(toMatch({ ...ROW, status: 'cancelled', cancel_reason: 'boom' }, LOOKUPS).cancelReason).toBeNull()
    expect(toMatch({ ...ROW, status: 'cancelled', cancel_reason: 'no_court' }, LOOKUPS).cancelReason).toBe('no_court')
  })
})

describe('missingText', () => {
  it('says what is missing in words', () => {
    expect(missingText(withPlayers(makeMatch(), ['a', 'b', 'c', null]))).toBe('Falta 1 de revés')
    expect(missingText(withPlayers(makeMatch(), ['a', null, 'c', null]))).toBe('Faltan 2 de revés')
    expect(missingText(makeMatch())).toBe('Faltan 3: 1 de drive y 2 de revés')
    expect(missingText(withPlayers(makeMatch(), ['a', 'b', 'c', 'd']))).toBe('Completo')
  })
})

describe('labels', () => {
  it('names category ranges', () => {
    expect(categoryRangeLabel(4, 6)).toBe('4ª a 6ª')
    expect(categoryRangeLabel(5, 5)).toBe('5ª')
  })

  it('names the state of a match', () => {
    expect(statusLabel(makeMatch())).toBe('Armándose, 1 de 4')
    expect(statusLabel(makeMatch({ status: 'confirmed', courtName: 'Cancha 2' }))).toBe('Confirmado, Cancha 2')
    expect(statusLabel(makeMatch({ status: 'cancelled' }))).toBe('Cancelado')
  })

  it('splits the price among four', () => {
    expect(perPlayerPrice(1600)).toBe(400)
    expect(perPlayerPrice(1602)).toBe(400)
  })

  it('suggests the player category plus and minus one', () => {
    expect(defaultCategoryRange(5)).toEqual({ min: 4, max: 6 })
    expect(defaultCategoryRange(1)).toEqual({ min: 1, max: 2 })
    expect(defaultCategoryRange(null)).toEqual({ min: 1, max: 8 })
  })

  it('proposes the player category range, gender and side for a new match', () => {
    expect(matchFormDefaults({ id: 'x', category: 5, gender: 'female', side: 'both' })).toEqual({
      categoryMin: 4,
      categoryMax: 6,
      type: 'female',
      side: 'drive',
    })
    expect(matchFormDefaults({ id: 'x', category: null, gender: null, side: 'backhand' })).toMatchObject({
      type: 'mixed',
      side: 'backhand',
    })
  })

  it('explains how open matches work with the club numbers', () => {
    expect(howItWorks(3, 24)).toBe(
      'La cancha se reserva recién cuando están los 4. Si 3 h antes no se completó, el partido se cancela solo y no pagás nada. Cada jugador paga su parte. Para bajarte de un partido confirmado, avisá con 24 h de anticipación.',
    )
  })
})

describe('leaveStatus', () => {
  const now = at('08:00')

  it('lets a player leave a forming match whenever', () => {
    expect(leaveStatus(makeMatch(), 'ana', 24, now)).toEqual({ allowed: true })
  })

  it('asks for the notice period in a confirmed match', () => {
    const confirmed = makeMatch({ status: 'confirmed' })
    expect(leaveStatus(confirmed, 'ana', 6, now)).toEqual({ allowed: true })
    expect(leaveStatus(confirmed, 'ana', 24, now)).toEqual({
      allowed: false,
      reason: 'Ya no podés bajarte: faltan menos de 24 h. Avisá al club.',
    })
  })

  it('is nothing for someone who is not in the match or a cancelled one', () => {
    expect(leaveStatus(makeMatch(), 'bruno', 24, now)).toBeNull()
    expect(leaveStatus(makeMatch({ status: 'cancelled' }), 'ana', 24, now)).toBeNull()
  })
})

describe('joinResultMessage', () => {
  it('tells the fourth player what happened', () => {
    expect(joinResultMessage({ status: 'confirmed', cancelReason: null }, 'Cancha 2')).toBe(
      'Partido confirmado en la Cancha 2.',
    )
    expect(joinResultMessage({ status: 'cancelled', cancelReason: 'no_court' }, null)).toBe(
      'El partido se canceló. Se completaron los 4, pero no quedaba ninguna cancha libre a esa hora.',
    )
    expect(joinResultMessage({ status: 'forming', cancelReason: null }, null)).toBe('Te sumaste al partido.')
  })
})
```
- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/matches.test.ts`
Expected: FAIL (no existe `@/lib/domain/matches`).

- [ ] **Step 4: Write the implementation**

`lib/domain/matches.ts`:
```ts
import type { Gender, Side } from './profile'
import { priceFor, type PricingRule } from './slots'
import { localDateOf, minutesOfDay, toDate, type LocalDate } from './time'

export const MATCH_TYPES = ['male', 'female', 'mixed'] as const
export const SLOT_SIDES = ['drive', 'backhand'] as const
export const CANCEL_REASONS = ['no_court', 'not_filled', 'empty', 'by_club'] as const

export type MatchType = (typeof MATCH_TYPES)[number]
export type SlotSide = (typeof SLOT_SIDES)[number]
export type CancelReason = (typeof CANCEL_REASONS)[number]
export type MatchStatus = 'forming' | 'confirmed' | 'cancelled'

export const MATCH_TYPE_LABELS: Record<MatchType, string> = { male: 'Masculino', female: 'Femenino', mixed: 'Mixto' }
export const SLOT_SIDE_LABELS: Record<SlotSide, string> = { drive: 'Drive', backhand: 'Revés' }
// For sentences: "Falta 1 de revés", "Sumarme de drive".
export const SLOT_SIDE_WORDS: Record<SlotSide, string> = { drive: 'drive', backhand: 'revés' }
export const CANCEL_REASON_TEXT: Record<CancelReason, string> = {
  no_court: 'Se completaron los 4, pero no quedaba ninguna cancha libre a esa hora.',
  not_filled: 'No se completó a tiempo.',
  empty: 'Todos salieron del partido.',
  by_club: 'Lo canceló el club.',
}

export type Period = { startsAt: Date; endsAt: Date }
// Spots: 1 = team A drive, 2 = team A backhand, 3 = team B drive, 4 = team B backhand.
export type MatchSlot = { position: number; side: SlotSide; playerId: string | null; playerName: string | null }
export type Match = Period & {
  id: string
  preferredCourtId: string
  preferredCourtName: string
  courtId: string | null
  courtName: string | null
  allowOtherCourt: boolean
  categoryMin: number
  categoryMax: number
  type: MatchType
  status: MatchStatus
  cancelReason: CancelReason | null
  bookingId: string | null
  // Frozen when the match filled up; before that, the estimate for its slot.
  price: number | null
  slots: MatchSlot[]
}

export type MatchPlayer = { id: string; category: number | null; gender: Gender | null; side: Side | null }
export type JoinContext = { now: Date; closeHours: number; busy: Period[] }
// Keys: habitKey(weekday, minutes) for past games; availabilityKey(weekday, band) for bands.
export type Habits = { playedAt: Map<string, number>; availability: Set<string>; preferredCourtIds: Set<string> }
export type PlayerContext = { player: MatchPlayer; busy: Period[]; habits: Habits }

// What lib/data/matches.ts reads. If supabase-js infers a slightly different shape for the embeds,
// adjust this type to match; never cast the query result.
export type MatchRow = {
  id: string
  starts_at: string | null
  ends_at: string | null
  preferred_court_id: string
  court_id: string | null
  allow_other_court: boolean
  category_min: number
  category_max: number
  match_type: MatchType
  status: MatchStatus
  cancel_reason: string | null
  booking_id: string | null
  booking: { price: number } | null
  slots: {
    position: number
    side: 'drive' | 'backhand' | 'both'
    player_id: string | null
    player: { display_name: string } | null
  }[]
}

export type MatchLookups = { courtNames: Map<string, string>; rules: PricingRule[]; timezone: string }

export function isCancelReason(value: string | null): value is CancelReason {
  return value !== null && (CANCEL_REASONS as readonly string[]).includes(value)
}

export function toMatch(row: MatchRow, lookups: MatchLookups): Match {
  const startsAt = toDate(row.starts_at)
  const estimated = priceFor(lookups.rules, localDateOf(startsAt, lookups.timezone), minutesOfDay(startsAt, lookups.timezone))
  return {
    id: row.id,
    startsAt,
    endsAt: toDate(row.ends_at),
    preferredCourtId: row.preferred_court_id,
    preferredCourtName: lookups.courtNames.get(row.preferred_court_id) ?? 'Cancha',
    courtId: row.court_id,
    courtName: row.court_id ? (lookups.courtNames.get(row.court_id) ?? 'Cancha') : null,
    allowOtherCourt: row.allow_other_court,
    categoryMin: row.category_min,
    categoryMax: row.category_max,
    type: row.match_type,
    status: row.status,
    cancelReason: isCancelReason(row.cancel_reason) ? row.cancel_reason : null,
    bookingId: row.booking_id,
    price: row.booking?.price ?? estimated,
    slots: [...row.slots]
      .sort((a, b) => a.position - b.position)
      .map((slot) => ({
        position: slot.position,
        side: slot.side === 'backhand' ? 'backhand' : 'drive',
        playerId: slot.player_id,
        // A private profile is not readable by other members (RLS): the spot shows it is taken.
        playerName: slot.player_id ? (slot.player?.display_name ?? 'Jugador') : null,
      })),
  }
}

export function openSlots(match: Pick<Match, 'slots'>): MatchSlot[] {
  return match.slots.filter((slot) => slot.playerId === null)
}

export function filledCount(match: Pick<Match, 'slots'>): number {
  return match.slots.length - openSlots(match).length
}

export function isInMatch(match: Pick<Match, 'slots'>, playerId: string): boolean {
  return match.slots.some((slot) => slot.playerId === playerId)
}

export function overlaps(a: Period, b: Period): boolean {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt
}

// Same as private.match_closes_at.
export function closesAt(match: Pick<Match, 'startsAt'>, closeHours: number): Date {
  return new Date(match.startsAt.getTime() - closeHours * 3_600_000)
}

export function categoryRangeLabel(min: number, max: number): string {
  return min === max ? `${min}ª` : `${min}ª a ${max}ª`
}

export function missingText(match: Pick<Match, 'slots'>): string {
  const open = openSlots(match)
  if (open.length === 0) return 'Completo'
  const groups = SLOT_SIDES.map((side) => [side, open.filter((slot) => slot.side === side).length] as const).filter(
    ([, count]) => count > 0,
  )
  const verb = open.length === 1 ? 'Falta' : 'Faltan'
  if (groups.length === 1) return `${verb} ${open.length} de ${SLOT_SIDE_WORDS[groups[0][0]]}`
  return `${verb} ${open.length}: ${groups.map(([side, count]) => `${count} de ${SLOT_SIDE_WORDS[side]}`).join(' y ')}`
}

export function statusLabel(match: Match): string {
  if (match.status === 'confirmed') return `Confirmado, ${match.courtName ?? match.preferredCourtName}`
  if (match.status === 'cancelled') return 'Cancelado'
  return `Armándose, ${filledCount(match)} de 4`
}

// What each player pays, for "$400 c/u"; spot 1 also pays the remainder (match-payments.ts).
export function perPlayerPrice(price: number): number {
  return Math.floor(price / 4)
}

export function defaultCategoryRange(category: number | null): { min: number; max: number } {
  if (category === null) return { min: 1, max: 8 }
  return { min: Math.max(1, category - 1), max: Math.min(8, category + 1) }
}

// What the "Armar partido" sheet proposes: the player's category plus and minus one, his gender, his side.
export function matchFormDefaults(player: MatchPlayer): {
  categoryMin: number
  categoryMax: number
  type: MatchType
  side: SlotSide
} {
  const range = defaultCategoryRange(player.category)
  return {
    categoryMin: range.min,
    categoryMax: range.max,
    type: player.gender ?? 'mixed',
    side: player.side === 'backhand' ? 'backhand' : 'drive',
  }
}

// Choices for the "Armar partido" sheet (lib/data/matches.ts builds them).
export type MatchFormOptions = {
  days: { date: LocalDate; label: string }[]
  times: string[]
  courts: { id: string; name: string }[]
  defaults: ReturnType<typeof matchFormDefaults>
}

export function howItWorks(closeHours: number, noticeHours: number): string {
  return (
    `La cancha se reserva recién cuando están los 4. Si ${closeHours} h antes no se completó, el partido se cancela ` +
    `solo y no pagás nada. Cada jugador paga su parte. Para bajarte de un partido confirmado, avisá con ` +
    `${noticeHours} h de anticipación.`
  )
}

export type LeaveStatus = { allowed: true } | { allowed: false; reason: string } | null

// Same rule as leave_match (the database also stops someone who already paid).
export function leaveStatus(match: Match, playerId: string, noticeHours: number, now: Date): LeaveStatus {
  if (!isInMatch(match, playerId) || match.status === 'cancelled' || match.startsAt <= now) return null
  if (match.status === 'confirmed' && match.startsAt.getTime() - now.getTime() < noticeHours * 3_600_000) {
    return { allowed: false, reason: `Ya no podés bajarte: faltan menos de ${noticeHours} h. Avisá al club.` }
  }
  return { allowed: true }
}

export function joinResultMessage(
  result: { status: MatchStatus; cancelReason: CancelReason | null },
  courtName: string | null,
): string {
  if (result.status === 'confirmed') return `Partido confirmado en la ${courtName ?? 'cancha'}.`
  if (result.status === 'cancelled') return `El partido se canceló. ${CANCEL_REASON_TEXT[result.cancelReason ?? 'no_court']}`
  return 'Te sumaste al partido.'
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/matches.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/matches.ts tests/unit/fixtures/matches.ts tests/unit/lib/domain/matches.test.ts
git commit -m "feat(domain): open match model and texts"
```

---

### Task 15: Quién se puede sumar (`lib/domain/match-join.ts`)

**Files:**
- Create: `lib/domain/match-join.ts`
- Test: `tests/unit/lib/domain/match-join.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/match-join.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { at } from '../../fixtures/grid'
import { BRUNO, CONTEXT, makeMatch, withPlayers } from '../../fixtures/matches'
import { canJoin, joinStatus } from '@/lib/domain/match-join'

describe('canJoin', () => {
  it('lets a player take a free spot of his side', () => {
    expect(canJoin(makeMatch(), 2, BRUNO, CONTEXT)).toEqual({ ok: true })
  })

  it('checks the same things as join_match, in the same order', () => {
    expect(canJoin(makeMatch({ status: 'confirmed' }), 2, BRUNO, CONTEXT)).toEqual({ ok: false, reason: 'El partido ya no está abierto.' })
    expect(canJoin(makeMatch(), 2, BRUNO, { ...CONTEXT, now: at('17:00') })).toEqual({ ok: false, reason: 'El partido ya no está abierto.' })
    expect(canJoin(withPlayers(makeMatch(), ['bruno', null, null, null]), 2, BRUNO, CONTEXT)).toEqual({ ok: false, reason: 'Ya estás en este partido.' })
    expect(canJoin(withPlayers(makeMatch(), ['ana', 'x', null, null]), 2, BRUNO, CONTEXT)).toEqual({ ok: false, reason: 'Ese lugar ya está ocupado.' })
    expect(canJoin(makeMatch({ categoryMin: 6, categoryMax: 7 }), 2, BRUNO, CONTEXT)).toEqual({ ok: false, reason: 'Es para 6ª a 7ª y vos sos 5ª.' })
    expect(canJoin(makeMatch(), 2, { ...BRUNO, category: null }, CONTEXT)).toEqual({ ok: false, reason: 'Es para 4ª a 6ª y todavía no tenés categoría.' })
    expect(canJoin(makeMatch({ type: 'female' }), 2, BRUNO, CONTEXT)).toEqual({ ok: false, reason: 'Es un partido femenino.' })
    expect(canJoin(makeMatch(), 3, BRUNO, CONTEXT)).toEqual({ ok: false, reason: 'Este lugar es de drive.' })
    expect(canJoin(makeMatch(), 2, BRUNO, { ...CONTEXT, busy: [{ startsAt: at('21:00'), endsAt: at('22:30') }] })).toEqual({
      ok: false,
      reason: 'Ya tenés una reserva o un partido a esa hora.',
    })
  })

  it('lets someone who plays both sides take any spot', () => {
    expect(canJoin(makeMatch(), 3, { ...BRUNO, side: 'both' }, CONTEXT)).toEqual({ ok: true })
  })
})

describe('joinStatus', () => {
  it('points at the first spot the player can take', () => {
    expect(joinStatus(makeMatch(), BRUNO, CONTEXT)).toEqual({ ok: true, position: 2, text: 'Podés sumarte de revés.' })
  })

  it('says why not otherwise', () => {
    expect(joinStatus(makeMatch(), { ...BRUNO, id: 'ana' }, CONTEXT)).toEqual({ ok: false, text: 'Ya estás anotado.' })
    expect(joinStatus(makeMatch({ type: 'female' }), BRUNO, CONTEXT)).toEqual({ ok: false, text: 'Es un partido femenino.' })
    expect(joinStatus(withPlayers(makeMatch({ status: 'confirmed' }), ['a', 'b', 'c', 'd']), BRUNO, CONTEXT)).toEqual({
      ok: false,
      text: 'El partido ya no está abierto.',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/match-join.test.ts`
Expected: FAIL (no existe `@/lib/domain/match-join`).

- [ ] **Step 3: Write the implementation**

`lib/domain/match-join.ts`:
```ts
import {
  categoryRangeLabel,
  closesAt,
  isInMatch,
  MATCH_TYPE_LABELS,
  openSlots,
  overlaps,
  SLOT_SIDE_WORDS,
  type JoinContext,
  type Match,
  type MatchPlayer,
} from './matches'

export type JoinCheck = { ok: true } | { ok: false; reason: string }
export type JoinStatus = { ok: true; position: number; text: string } | { ok: false; text: string }

const no = (reason: string): JoinCheck => ({ ok: false, reason })

// Same rules and order as join_match: open, not in it, free spot, category, type, side, busy.
export function canJoin(match: Match, position: number, player: MatchPlayer, context: JoinContext): JoinCheck {
  if (match.status !== 'forming' || context.now >= closesAt(match, context.closeHours)) {
    return no('El partido ya no está abierto.')
  }
  if (isInMatch(match, player.id)) return no('Ya estás en este partido.')
  const slot = match.slots.find((candidate) => candidate.position === position)
  if (!slot || slot.playerId !== null) return no('Ese lugar ya está ocupado.')
  const range = categoryRangeLabel(match.categoryMin, match.categoryMax)
  if (player.category === null) return no(`Es para ${range} y todavía no tenés categoría.`)
  if (player.category < match.categoryMin || player.category > match.categoryMax) {
    return no(`Es para ${range} y vos sos ${player.category}ª.`)
  }
  if (match.type !== 'mixed' && player.gender !== match.type) {
    return no(`Es un partido ${MATCH_TYPE_LABELS[match.type].toLowerCase()}.`)
  }
  if (player.side !== 'both' && player.side !== slot.side) return no(`Este lugar es de ${SLOT_SIDE_WORDS[slot.side]}.`)
  if (context.busy.some((period) => overlaps(period, match))) return no('Ya tenés una reserva o un partido a esa hora.')
  return { ok: true }
}

// For cards: the first spot the player can take, or the reason he cannot.
export function joinStatus(match: Match, player: MatchPlayer, context: JoinContext): JoinStatus {
  if (isInMatch(match, player.id)) return { ok: false, text: 'Ya estás anotado.' }
  const checks = openSlots(match).map((slot) => ({ slot, check: canJoin(match, slot.position, player, context) }))
  const first = checks.find(({ check }) => check.ok)
  if (first) return { ok: true, position: first.slot.position, text: `Podés sumarte de ${SLOT_SIDE_WORDS[first.slot.side]}.` }
  for (const { check } of checks) if (!check.ok) return { ok: false, text: check.reason }
  return { ok: false, text: 'El partido ya no está abierto.' }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/match-join.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/match-join.ts tests/unit/lib/domain/match-join.test.ts
git commit -m "feat(domain): canJoin with the same rules as join_match"
```

---

### Task 16: Riesgo de cancha y texto para compartir

**Files:**
- Create: `lib/domain/match-risk.ts`, `lib/domain/match-share.ts`
- Test: `tests/unit/lib/domain/match-risk.test.ts`, `tests/unit/lib/domain/match-share.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/lib/domain/match-risk.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { at } from '../../fixtures/grid'
import { makeMatch } from '../../fixtures/matches'
import { freeCourtIds, riskOf } from '@/lib/domain/match-risk'

describe('freeCourtIds', () => {
  it('keeps the courts with nothing overlapping the slot', () => {
    const taken = [{ courtId: 'court-1', startsAt: at('19:00'), endsAt: at('20:30') }]
    expect(freeCourtIds(['court-1', 'court-2'], taken, { startsAt: at('20:00'), endsAt: at('21:30') })).toEqual(['court-2'])
    expect(freeCourtIds(['court-1', 'court-2'], taken, { startsAt: at('20:30'), endsAt: at('22:00') })).toEqual(['court-1', 'court-2'])
  })
})

describe('riskOf', () => {
  it('is nothing while the preferred court is free', () => {
    expect(riskOf(makeMatch(), ['court-1', 'court-2'])).toBeNull()
  })

  it('warns when the preferred court was taken but another one is left', () => {
    expect(riskOf(makeMatch(), ['court-2'])).toEqual({
      level: 'warn',
      text: 'La Cancha 1 ya se reservó. Si el partido se completa, se asigna otra cancha libre (queda 1).',
    })
  })

  it('says the match falls through when no court is left for it', () => {
    expect(riskOf(makeMatch(), [])).toEqual({
      level: 'bad',
      text: 'No quedan canchas libres a esa hora. Si nadie libera una, el partido se cae.',
    })
    expect(riskOf(makeMatch({ allowOtherCourt: false }), ['court-2'])).toEqual({
      level: 'bad',
      text: 'La Cancha 1 ya se reservó y el partido no acepta otra cancha. Si nadie la libera, el partido se cae.',
    })
  })

  it('is nothing for a match that holds its court or is no longer forming', () => {
    expect(riskOf(makeMatch({ bookingId: 'b1' }), [])).toBeNull()
    expect(riskOf(makeMatch({ status: 'confirmed' }), [])).toBeNull()
  })
})
```

`tests/unit/lib/domain/match-share.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { makeMatch, withPlayers } from '../../fixtures/matches'
import { shareText, whatsappUrl } from '@/lib/domain/match-share'

describe('shareText', () => {
  it('writes the message for the club WhatsApp group', () => {
    const match = withPlayers(makeMatch(), ['ana', 'b', 'c', null])
    expect(
      shareText({ match, clubName: 'Rustic Pádel', dayText: 'jueves 1 de octubre', time: '20:00', url: 'https://x.uy/partidos/m1' }),
    ).toBe(
      [
        '🎾 Falta 1 para el jueves 1 de octubre a las 20:00',
        'Rustic Pádel, Cancha 1',
        'Categoría 4ª a 6ª, mixto',
        'Falta: revés',
        '$400 por persona',
        '',
        'Sumate acá: https://x.uy/partidos/m1',
      ].join('\n'),
    )
  })

  it('counts every missing spot', () => {
    const text = shareText({ match: makeMatch(), clubName: 'Rustic', dayText: 'jueves 1 de octubre', time: '20:00', url: 'u' })
    expect(text).toContain('Faltan 3 para')
    expect(text).toContain('Falta: revés, drive, revés')
  })
})

describe('whatsappUrl', () => {
  it('opens WhatsApp with the message', () => {
    expect(whatsappUrl('Hola, ¿jugás?')).toBe('https://wa.me/?text=Hola%2C%20%C2%BFjug%C3%A1s%3F')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/domain/match-risk.test.ts tests/unit/lib/domain/match-share.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Write the implementation**

`lib/domain/match-risk.ts`:
```ts
import { overlaps, type Match, type Period } from './matches'

export type Risk = { level: 'warn' | 'bad'; text: string }

// Active courts with nothing overlapping the period.
export function freeCourtIds(courtIds: string[], taken: (Period & { courtId: string })[], period: Period): string[] {
  return courtIds.filter((courtId) => !taken.some((item) => item.courtId === courtId && overlaps(item, period)))
}

// A forming match holds no court: someone may book its preferred one meanwhile.
export function riskOf(match: Match, free: string[]): Risk | null {
  if (match.status !== 'forming' || match.bookingId !== null) return null
  if (free.includes(match.preferredCourtId)) return null
  const name = match.preferredCourtName
  if (match.allowOtherCourt && free.length > 0) {
    const left = free.length === 1 ? 'queda 1' : `quedan ${free.length}`
    return { level: 'warn', text: `La ${name} ya se reservó. Si el partido se completa, se asigna otra cancha libre (${left}).` }
  }
  if (!match.allowOtherCourt && free.length > 0) {
    return {
      level: 'bad',
      text: `La ${name} ya se reservó y el partido no acepta otra cancha. Si nadie la libera, el partido se cae.`,
    }
  }
  return { level: 'bad', text: 'No quedan canchas libres a esa hora. Si nadie libera una, el partido se cae.' }
}
```

`lib/domain/match-share.ts`:
```ts
import { formatPrice } from './format'
import { categoryRangeLabel, MATCH_TYPE_LABELS, openSlots, perPlayerPrice, SLOT_SIDE_WORDS, type Match } from './matches'

// The message players paste in the club's WhatsApp group (prototype: shareText).
export function shareText(input: { match: Match; clubName: string; dayText: string; time: string; url: string }): string {
  const { match } = input
  const open = openSlots(match)
  const lines = [
    `🎾 ${open.length === 1 ? 'Falta 1' : `Faltan ${open.length}`} para el ${input.dayText} a las ${input.time}`,
    `${input.clubName}, ${match.courtName ?? match.preferredCourtName}`,
    `Categoría ${categoryRangeLabel(match.categoryMin, match.categoryMax)}, ${MATCH_TYPE_LABELS[match.type].toLowerCase()}`,
    `Falta: ${open.map((slot) => SLOT_SIDE_WORDS[slot.side]).join(', ')}`,
  ]
  if (match.price !== null) lines.push(`${formatPrice(perPlayerPrice(match.price))} por persona`)
  return [...lines, '', `Sumate acá: ${input.url}`].join('\n')
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/lib/domain/match-risk.test.ts tests/unit/lib/domain/match-share.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/match-risk.ts lib/domain/match-share.ts tests/unit/lib/domain/match-risk.test.ts tests/unit/lib/domain/match-share.test.ts
git commit -m "feat(domain): court risk and the WhatsApp message of a match"
```

---

### Task 17: "Partidos para vos" (`lib/domain/matches-for-me.ts`)

**Files:**
- Create: `lib/domain/matches-for-me.ts`
- Test: `tests/unit/lib/domain/matches-for-me.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/matches-for-me.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { at, TIMEZONE } from '../../fixtures/grid'
import { BRUNO, CONTEXT, makeMatch } from '../../fixtures/matches'
import type { Habits } from '@/lib/domain/matches'
import { habitKey, matchesForMe } from '@/lib/domain/matches-for-me'

// 2026-10-01 is a Thursday (4); 20:00 is minute 1200 (night), 12:30 is still morning.
const NONE: Habits = { playedAt: new Map(), availability: new Set(), preferredCourtIds: new Set() }
const context = (habits: Partial<Habits>) => ({ ...CONTEXT, timezone: TIMEZONE, habits: { ...NONE, ...habits } })

describe('matchesForMe', () => {
  it('puts the usual time first, then being free, and adds the preferred court', () => {
    const usual = makeMatch({ id: 'usual' })
    const free = makeMatch({ id: 'free', startsAt: at('12:30'), endsAt: at('14:00'), preferredCourtId: 'court-2' })
    const result = matchesForMe([free, usual], BRUNO, context({
      playedAt: new Map([[habitKey(4, 1200), 3]]),
      availability: new Set(['4-morning']),
      preferredCourtIds: new Set(['court-1']),
    }))
    expect(result).toEqual([
      { match: usual, reasons: ['Tu horario de siempre', 'Tu cancha preferida'] },
      { match: free, reasons: ['Estás libre a esa hora'] },
    ])
  })

  it('leaves out matches he cannot join or has no reason to', () => {
    const forWomen = makeMatch({ id: 'women', type: 'female' })
    const noReason = makeMatch({ id: 'plain' })
    expect(matchesForMe([forWomen, noReason], BRUNO, context({ availability: new Set(['4-night']) }))).toEqual([
      { match: noReason, reasons: ['Estás libre a esa hora'] },
    ])
    expect(matchesForMe([noReason], BRUNO, context({}))).toEqual([])
  })

  it('shows at most two', () => {
    const matches = ['a', 'b', 'c'].map((id) => makeMatch({ id }))
    expect(matchesForMe(matches, BRUNO, context({ availability: new Set(['4-night']) }))).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/matches-for-me.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`lib/domain/matches-for-me.ts`:
```ts
import { availabilityKey, dayBandOf } from './availability'
import { joinStatus } from './match-join'
import type { Habits, JoinContext, Match, MatchPlayer } from './matches'
import { localDateOf, minutesOfDay, weekdayOf } from './time'

export type ForMe = { match: Match; reasons: string[] }

// Weekday (0 = Sunday) and start minute of a game, on the club's clock.
export function habitKey(weekday: number, minutes: number): string {
  return `${weekday}|${minutes}`
}

// Up to two matches the player can join and has a reason to: his usual time (3 or more games on that
// weekday and time), being usually free then, or his preferred court. Prototype: forMe.
export function matchesForMe(
  matches: Match[],
  player: MatchPlayer,
  context: JoinContext & { timezone: string; habits: Habits },
): ForMe[] {
  return matches
    .filter((match) => joinStatus(match, player, context).ok)
    .map((match) => {
      const minutes = minutesOfDay(match.startsAt, context.timezone)
      const weekday = weekdayOf(localDateOf(match.startsAt, context.timezone))
      const played = context.habits.playedAt.get(habitKey(weekday, minutes)) ?? 0
      const free = context.habits.availability.has(availabilityKey(weekday, dayBandOf(minutes)))
      const reasons: string[] = []
      let score = 0
      if (played >= 3) {
        score += 30
        reasons.push('Tu horario de siempre')
      } else if (free) {
        score += 18
        reasons.push('Estás libre a esa hora')
      }
      if (context.habits.preferredCourtIds.has(match.preferredCourtId)) {
        score += 10
        reasons.push('Tu cancha preferida')
      }
      return { match, reasons, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.match.startsAt.getTime() - b.match.startsAt.getTime())
    .slice(0, 2)
    .map(({ match, reasons }) => ({ match, reasons }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/matches-for-me.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/matches-for-me.ts tests/unit/lib/domain/matches-for-me.test.ts
git commit -m "feat(domain): matches for the player"
```

---

### Task 18: Parte por jugador (`lib/domain/match-payments.ts`)

**Files:**
- Create: `lib/domain/match-payments.ts`
- Test: `tests/unit/lib/domain/match-payments.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/match-payments.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { matchPlayerPayments, shareFor } from '@/lib/domain/match-payments'

describe('shareFor', () => {
  it('splits the price among four, the remainder on spot 1 (like private.match_share)', () => {
    expect([1, 2, 3, 4].map((position) => shareFor(1602, position))).toEqual([402, 400, 400, 400])
    expect(shareFor(1600, 1)).toBe(400)
  })
})

describe('matchPlayerPayments', () => {
  const slots = [
    { position: 2, player_id: 'b', player: { display_name: 'Bruno' } },
    { position: 1, player_id: 'a', player: { display_name: 'Ana' } },
    { position: 3, player_id: null, player: null },
  ]

  it('gives each player his share, what he owes and his payment state', () => {
    const payments = [
      { payer_id: 'a', status: 'confirmed' as const, amount: 402 },
      { payer_id: 'b', status: 'reported' as const, amount: 400 },
    ]
    expect(matchPlayerPayments({ price: 1602, status: 'confirmed' }, slots, payments)).toEqual([
      { playerId: 'a', name: 'Ana', position: 1, share: 402, due: 0, state: 'paid' },
      { playerId: 'b', name: 'Bruno', position: 2, share: 400, due: 400, state: 'reported' },
    ])
  })

  it('shows a refund when the match was cancelled after someone paid', () => {
    const [ana] = matchPlayerPayments({ price: 1600, status: 'cancelled' }, slots, [
      { payer_id: 'a', status: 'confirmed', amount: 400 },
    ])
    expect(ana).toMatchObject({ state: 'refund_due' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/match-payments.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`lib/domain/match-payments.ts`:
```ts
import { amountDue, paymentState, type PaymentState, type PaymentStatus } from './payments'

export type SharePayment = { payer_id: string | null; status: PaymentStatus; amount: number }
export type SlotHolder = { position: number; player_id: string | null; player: { display_name: string } | null }
export type MatchPlayerPayment = {
  playerId: string
  name: string
  position: number
  share: number
  due: number
  state: PaymentState
}

// Same as private.match_share: price / 4, the remainder on spot 1.
export function shareFor(price: number, position: number): number {
  return Math.floor(price / 4) + (position === 1 ? price % 4 : 0)
}

// Each player's share of a match booking, from his own payments only.
export function matchPlayerPayments(
  booking: { price: number; status: 'confirmed' | 'cancelled' },
  slots: SlotHolder[],
  payments: SharePayment[],
): MatchPlayerPayment[] {
  return [...slots]
    .sort((a, b) => a.position - b.position)
    .flatMap((slot) => {
      if (!slot.player_id) return []
      const playerId = slot.player_id
      const share = shareFor(booking.price, slot.position)
      const own = payments.filter((payment) => payment.payer_id === playerId)
      return [
        {
          playerId,
          name: slot.player?.display_name ?? 'Jugador',
          position: slot.position,
          share,
          due: amountDue(share, own),
          state: paymentState({ price: share, status: booking.status }, own),
        },
      ]
    })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/match-payments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```bash
git add lib/domain/match-payments.ts tests/unit/lib/domain/match-payments.test.ts
git commit -m "feat(domain): share and payment state per match player"
git push
```

---

## Corte 5: Pantallas de partidos

### Task 19: Carga de partidos (`lib/data/matches.ts`)

**Files:**
- Create: `lib/data/matches.ts`

`# (no test — lectura con la sesión del usuario sobre funciones puras ya probadas; la cubren typecheck y los e2e del corte 8)`

- [ ] **Step 1: Write the loader**

`lib/data/matches.ts`:
```ts
import 'server-only'
import type { Club, MemberViewer } from '@/lib/auth/viewer'
import { availabilityKey } from '@/lib/domain/availability'
import { dayLabel } from '@/lib/domain/format'
import { freeCourtIds } from '@/lib/domain/match-risk'
import {
  matchFormDefaults,
  toMatch,
  type Match,
  type MatchFormOptions,
  type MatchLookups,
  type MatchRow,
  type MatchStatus,
  type Period,
  type PlayerContext,
} from '@/lib/domain/matches'
import { habitKey } from '@/lib/domain/matches-for-me'
import { daySlots } from '@/lib/domain/slots'
import { addDays, localDateOf, minutesOfDay, toDate, weekdayOf, type LocalDate } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'

const MATCH_SELECT =
  'id, starts_at, ends_at, preferred_court_id, court_id, allow_other_court, category_min, category_max, match_type, status, cancel_reason, booking_id, booking:bookings!open_matches_booking_fkey(price), slots:match_slots(position, side, player_id, player:profiles(display_name))'

async function lookups(club: Club): Promise<MatchLookups> {
  const supabase = await createClient()
  const [courts, rules] = await Promise.all([
    supabase.from('courts').select('id, name').eq('club_id', club.id),
    supabase.from('pricing_rules').select('weekdays, from_time, to_time, price').eq('club_id', club.id),
  ])
  if (courts.error) throw courts.error
  if (rules.error) throw rules.error
  return {
    courtNames: new Map(courts.data.map((court) => [court.id, court.name])),
    rules: rules.data.map((rule) => ({ weekdays: rule.weekdays, fromTime: rule.from_time, toTime: rule.to_time, price: rule.price })),
    timezone: club.timezone,
  }
}

// Matches that start inside the range, read with the viewer's session (members read every match
// of their club; the booking price only comes back to its players and staff).
export async function loadMatches(
  club: Club,
  range: { from: Date; to: Date },
  statuses: MatchStatus[] = ['forming', 'confirmed'],
): Promise<Match[]> {
  const supabase = await createClient()
  const [names, matches] = await Promise.all([
    lookups(club),
    supabase
      .from('open_matches')
      .select(MATCH_SELECT)
      .eq('club_id', club.id)
      .in('status', statuses)
      .gte('starts_at', range.from.toISOString())
      .lt('starts_at', range.to.toISOString())
      .order('starts_at'),
  ])
  if (matches.error) throw matches.error
  return matches.data.map((row: MatchRow) => toMatch(row, names))
}

export async function loadMatch(club: Club, id: string): Promise<Match | null> {
  const supabase = await createClient()
  const [names, match] = await Promise.all([
    lookups(club),
    supabase.from('open_matches').select(MATCH_SELECT).eq('club_id', club.id).eq('id', id).maybeSingle(),
  ])
  if (match.error) throw match.error
  return match.data ? toMatch(match.data, names) : null
}

// Where each match could still get a court: active courts with nothing overlapping its slot.
export async function loadFreeCourts(club: Club, matches: Match[]): Promise<Map<string, string[]>> {
  if (matches.length === 0) return new Map()
  const from = new Date(Math.min(...matches.map((match) => match.startsAt.getTime()))).toISOString()
  const to = new Date(Math.max(...matches.map((match) => match.endsAt.getTime()))).toISOString()
  const supabase = await createClient()
  const [courts, occupancies] = await Promise.all([
    supabase.from('courts').select('id').eq('club_id', club.id).eq('is_active', true).order('sort_order'),
    supabase
      .from('court_occupancy')
      .select('court_id, starts_at, ends_at')
      .eq('club_id', club.id)
      .lt('starts_at', to)
      .gt('ends_at', from),
  ])
  if (courts.error) throw courts.error
  if (occupancies.error) throw occupancies.error
  const courtIds = courts.data.map((court) => court.id)
  const taken = occupancies.data.map((row) => ({ courtId: row.court_id, startsAt: toDate(row.starts_at), endsAt: toDate(row.ends_at) }))
  return new Map(matches.map((match) => [match.id, freeCourtIds(courtIds, taken, match)]))
}

// What the join rules, the cards and "Partidos para vos" need to know about the viewer: what he
// has booked or joined (busy), where and when he usually plays (habits, last 120 days).
export async function loadPlayerContext(viewer: MemberViewer, now = new Date()): Promise<PlayerContext> {
  const supabase = await createClient()
  const since = new Date(now.getTime() - 120 * 86_400_000).toISOString()
  const [bookings, spots, availability, preferred] = await Promise.all([
    supabase
      .from('bookings')
      .select('starts_at, ends_at')
      .eq('player_id', viewer.userId)
      .eq('status', 'confirmed')
      .gt('ends_at', since),
    supabase.from('match_slots').select('match:open_matches(starts_at, ends_at, status)').eq('player_id', viewer.userId),
    supabase.from('player_availability').select('weekday, band').eq('user_id', viewer.userId),
    supabase.from('player_preferred_courts').select('court_id').eq('user_id', viewer.userId),
  ])
  if (bookings.error) throw bookings.error
  if (spots.error) throw spots.error
  if (availability.error) throw availability.error
  if (preferred.error) throw preferred.error

  const timezone = viewer.club.timezone
  const booked: Period[] = bookings.data.map((row) => ({ startsAt: toDate(row.starts_at), endsAt: toDate(row.ends_at) }))
  const inMatches = spots.data.flatMap((row) =>
    row.match && row.match.status !== 'cancelled'
      ? [{ startsAt: toDate(row.match.starts_at), endsAt: toDate(row.match.ends_at), confirmed: row.match.status === 'confirmed' }]
      : [],
  )
  const playedAt = new Map<string, number>()
  for (const game of [...booked, ...inMatches.filter((match) => match.confirmed)]) {
    if (game.startsAt >= now) continue
    const key = habitKey(weekdayOf(localDateOf(game.startsAt, timezone)), minutesOfDay(game.startsAt, timezone))
    playedAt.set(key, (playedAt.get(key) ?? 0) + 1)
  }

  return {
    player: {
      id: viewer.userId,
      category: viewer.membership.category,
      gender: viewer.profile.gender,
      side: viewer.profile.side,
    },
    busy: [...booked, ...inMatches]
      .filter((period) => period.endsAt > now)
      .map(({ startsAt, endsAt }) => ({ startsAt, endsAt })),
    habits: {
      playedAt,
      availability: new Set(availability.data.map((row) => availabilityKey(row.weekday, row.band))),
      preferredCourtIds: new Set(preferred.data.map((row) => row.court_id)),
    },
  }
}

// Choices for the "Armar partido" sheet: the next seven days, the club's slots, its active courts.
export async function loadMatchFormOptions(viewer: MemberViewer, context: PlayerContext, today: LocalDate): Promise<MatchFormOptions> {
  const supabase = await createClient()
  const courts = await supabase
    .from('courts')
    .select('id, name')
    .eq('club_id', viewer.club.id)
    .eq('is_active', true)
    .order('sort_order')
  if (courts.error) throw courts.error
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index))
  return {
    days: days.map((date) => ({ date, label: dayLabel(date, today) })),
    // Same schedule as scheduleOf in ./day, inlined: day.ts imports this module.
    times: daySlots(
      {
        timezone: viewer.club.timezone,
        opensAt: viewer.club.opens_at,
        closesAt: viewer.club.closes_at,
        slotMinutes: viewer.club.slot_minutes,
      },
      today,
    ).map((slot) => slot.label),
    courts: courts.data,
    defaults: matchFormDefaults(context.player),
  }
}
```

- [ ] **Step 2: Check it compiles**

Run: `npm run typecheck`
Expected: sin errores. Si supabase-js infiere otra forma para los embeds, ajustar `MatchRow` en `lib/domain/matches.ts` (nunca castear).

- [ ] **Step 3: Commit**

```bash
git add lib/data/matches.ts
git commit -m "feat(data): load matches, player context and free courts"
```

---

### Task 20: Cancha dibujada y tarjeta del partido

**Files:**
- Create: `components/matches/match-court.tsx`, `components/matches/match-card.tsx`
- Test: `tests/unit/components/matches/match-court.test.tsx`, `tests/unit/components/matches/match-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/matches/match-court.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MatchCourt } from '@/components/matches/match-court'
import { makeMatch, withPlayers } from '../../fixtures/matches'

describe('MatchCourt', () => {
  it('draws the four spots with first names, "Vos" and what is missing', () => {
    render(<MatchCourt match={withPlayers(makeMatch(), ['ana', 'me', null, null])} viewerId="me" />)
    const court = screen.getByRole('group', { name: 'Cancha con 2 de 4 jugadores' })
    expect(court).toHaveTextContent('Jugador')
    expect(court).toHaveTextContent('Vos')
    expect(screen.getAllByText('Falta')).toHaveLength(2)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('lets the viewer tap a spot he can take', async () => {
    const onJoin = vi.fn()
    render(<MatchCourt match={makeMatch()} viewerId="me" joinable={[2, 4]} onJoin={onJoin} />)
    const buttons = screen.getAllByRole('button', { name: 'Sumarme de revés' })
    expect(buttons).toHaveLength(2)
    await userEvent.click(buttons[1])
    expect(onJoin).toHaveBeenCalledWith(4)
  })
})
```

`tests/unit/components/matches/match-card.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MatchCard } from '@/components/matches/match-card'
import { makeMatch } from '../../fixtures/matches'

describe('MatchCard', () => {
  it('shows when, where, category, price per person and what is missing', () => {
    render(
      <MatchCard
        match={makeMatch()}
        viewerId="me"
        whenText="jue 1 20:00"
        status={{ ok: true, position: 2, text: 'Podés sumarte de revés.' }}
        risk={null}
      />,
    )
    expect(screen.getByText('jue 1 20:00')).toBeInTheDocument()
    expect(screen.getByText('Armándose, 1 de 4')).toBeInTheDocument()
    expect(screen.getByText(/4ª a 6ª, mixto/)).toBeInTheDocument()
    expect(screen.getByText(/\$400 por persona/)).toBeInTheDocument()
    expect(screen.getByText('Faltan 3: 1 de drive y 2 de revés')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sumarme de revés' })).toHaveAttribute('href', '/partidos/m1?sumarme=2')
    expect(screen.getByRole('link', { name: 'Detalle' })).toHaveAttribute('href', '/partidos/m1')
  })

  it('says why the viewer cannot join, the court risk and the reasons it is shown', () => {
    const { rerender } = render(
      <MatchCard
        match={makeMatch()}
        viewerId="me"
        whenText="jue 1 20:00"
        status={{ ok: false, text: 'Es un partido femenino.' }}
        risk={{ level: 'bad', text: 'No quedan canchas libres a esa hora. Si nadie libera una, el partido se cae.' }}
      />,
    )
    expect(screen.getByText('Es un partido femenino.')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('No quedan canchas libres')
    expect(screen.getByRole('link', { name: 'Ver partido' })).toBeInTheDocument()

    rerender(
      <MatchCard
        match={makeMatch()}
        viewerId="me"
        whenText="jue 1 20:00"
        status={{ ok: true, position: 2, text: 'Podés sumarte de revés.' }}
        risk={null}
        reasons={['Tu horario de siempre']}
      />,
    )
    expect(screen.getByRole('list', { name: 'Por qué te lo mostramos' })).toHaveTextContent('Tu horario de siempre')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/matches`
Expected: FAIL (componentes inexistentes).

- [ ] **Step 3: Write the components**

`components/matches/match-court.tsx`:
```tsx
import { cn } from '@/lib/cn'
import { filledCount, SLOT_SIDE_LABELS, SLOT_SIDE_WORDS, type Match, type MatchSlot } from '@/lib/domain/matches'
import { firstName } from '@/lib/domain/profile'

export type MatchCourtProps = {
  match: Pick<Match, 'slots'>
  viewerId: string
  joinable?: number[]
  onJoin?: (position: number) => void
  compact?: boolean
}

const SPOT = 'flex min-h-14 flex-col items-start justify-center rounded-xl px-2 py-1 text-left text-sm'

// The court seen from above: team A on top (spots 1 and 2), the net, team B below (3 and 4).
export function MatchCourt({ match, viewerId, joinable = [], onJoin, compact = false }: MatchCourtProps) {
  const spot = (position: number) => {
    const slot = match.slots.find((candidate) => candidate.position === position)
    return slot ? (
      <Spot slot={slot} viewerId={viewerId} onJoin={onJoin && joinable.includes(position) ? onJoin : undefined} />
    ) : null
  }
  return (
    <div
      role="group"
      aria-label={`Cancha con ${filledCount(match)} de 4 jugadores`}
      className={cn('flex flex-col gap-1 rounded-2xl bg-court p-2 text-on-court', compact ? 'w-40 shrink-0' : 'w-full')}
    >
      {compact ? null : <p className="text-xs font-semibold uppercase">Pareja 1</p>}
      <div className="grid grid-cols-2 gap-1">
        {spot(1)}
        {spot(2)}
      </div>
      <div aria-hidden="true" className="border-t-2 border-on-court" />
      <div className="grid grid-cols-2 gap-1">
        {spot(3)}
        {spot(4)}
      </div>
      {compact ? null : <p className="text-xs font-semibold uppercase">Pareja 2</p>}
    </div>
  )
}

function Spot({ slot, viewerId, onJoin }: { slot: MatchSlot; viewerId: string; onJoin?: (position: number) => void }) {
  const side = SLOT_SIDE_LABELS[slot.side]
  if (slot.playerId) {
    const name = slot.playerId === viewerId ? 'Vos' : firstName(slot.playerName ?? 'Jugador')
    return (
      <div className={cn(SPOT, 'border border-on-court')}>
        <b className="line-clamp-1">{name}</b>
        <span className="text-xs">{side}</span>
      </div>
    )
  }
  if (onJoin) {
    return (
      <button
        type="button"
        aria-label={`Sumarme de ${SLOT_SIDE_WORDS[slot.side]}`}
        onClick={() => onJoin(slot.position)}
        className={cn(SPOT, 'bg-accent text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent')}
      >
        <b>Sumarme</b>
        <span className="text-xs">{side}</span>
      </button>
    )
  }
  return (
    <div className={cn(SPOT, 'border border-dashed border-on-court')}>
      <b>Falta</b>
      <span className="text-xs">{side}</span>
    </div>
  )
}
```

`components/matches/match-card.tsx`:
```tsx
import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/domain/format'
import type { JoinStatus } from '@/lib/domain/match-join'
import type { Risk } from '@/lib/domain/match-risk'
import {
  categoryRangeLabel,
  MATCH_TYPE_LABELS,
  missingText,
  perPlayerPrice,
  SLOT_SIDE_WORDS,
  statusLabel,
  type Match,
} from '@/lib/domain/matches'
import { MatchCourt } from './match-court'

export type MatchCardProps = {
  match: Match
  viewerId: string
  whenText: string
  status: JoinStatus
  risk: Risk | null
  reasons?: string[]
}

// Prototype: matchCard. Joining goes through the detail page, which explains the rules first.
export function MatchCard({ match, viewerId, whenText, status, risk, reasons = [] }: MatchCardProps) {
  const href = `/partidos/${match.id}`
  const joinSide = status.ok ? match.slots.find((slot) => slot.position === status.position)?.side : undefined
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-xl font-bold uppercase">{whenText}</p>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold">{statusLabel(match)}</span>
      </div>
      <div className="flex gap-3">
        <MatchCourt match={match} viewerId={viewerId} compact />
        <p className="text-sm">
          {match.courtName ?? match.preferredCourtName}
          <br />
          {categoryRangeLabel(match.categoryMin, match.categoryMax)}, {MATCH_TYPE_LABELS[match.type].toLowerCase()}
          <br />
          {match.price !== null ? `${formatPrice(perPlayerPrice(match.price))} por persona` : 'Precio a confirmar'}
        </p>
      </div>
      {match.status === 'forming' ? <p className="font-semibold">{missingText(match)}</p> : null}
      {reasons.length > 0 ? (
        <ul aria-label="Por qué te lo mostramos" className="flex flex-wrap gap-2">
          {reasons.map((reason) => (
            <li key={reason} className="rounded-full border border-court-ink px-2 py-0.5 text-xs text-court-ink">
              {reason}
            </li>
          ))}
        </ul>
      ) : status.ok ? null : (
        <p className="text-sm text-fg-muted">{status.text}</p>
      )}
      {risk ? (
        <p role="note" className={cn('rounded-xl border p-2 text-sm', risk.level === 'bad' ? 'border-accent' : 'border-border')}>
          {risk.text}
        </p>
      ) : null}
      <div className="flex gap-2">
        {status.ok && joinSide ? (
          <Link href={`${href}?sumarme=${status.position}`} className={buttonClasses({ className: 'flex-1' })}>
            Sumarme de {SLOT_SIDE_WORDS[joinSide]}
          </Link>
        ) : null}
        <Link href={href} className={buttonClasses({ variant: 'secondary', className: status.ok ? undefined : 'flex-1' })}>
          {status.ok ? 'Detalle' : 'Ver partido'}
        </Link>
      </div>
    </Card>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/components/matches`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/matches/match-court.tsx components/matches/match-card.tsx tests/unit/components/matches
git commit -m "feat(matches): court drawing and match card"
```

---

### Task 21: Hoja "Armar partido abierto"

**Files:**
- Create: `components/matches/create-match-sheet.tsx`
- Test: `tests/unit/components/matches/create-match-sheet.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/matches/create-match-sheet.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CreateMatchSheet } from '@/components/matches/create-match-sheet'
import type { FormAction } from '@/components/ui/action-form'
import type { MatchFormOptions } from '@/lib/domain/matches'

const OPTIONS: MatchFormOptions = {
  days: [
    { date: '2026-10-01', label: 'Hoy' },
    { date: '2026-10-02', label: 'Mañana' },
  ],
  times: ['18:30', '20:00', '21:30'],
  courts: [
    { id: 'c1', name: 'Cancha 1' },
    { id: 'c2', name: 'Cancha 2' },
  ],
  defaults: { categoryMin: 4, categoryMax: 6, type: 'male', side: 'backhand' },
}

describe('CreateMatchSheet', () => {
  it('proposes the player category range, gender and side, at 20:00', () => {
    render(<CreateMatchSheet open onClose={vi.fn()} action={vi.fn<FormAction>()} options={OPTIONS} />)
    expect(screen.getByRole('dialog', { name: 'Armar partido abierto' })).toBeInTheDocument()
    expect(screen.getByLabelText('Hora')).toHaveValue('20:00')
    expect(screen.getByLabelText('Categoría desde')).toHaveValue('4')
    expect(screen.getByLabelText('hasta')).toHaveValue('6')
    expect(screen.getByLabelText('Partido')).toHaveValue('male')
    expect(screen.getByLabelText('Vos jugás de')).toHaveValue('backhand')
    expect(screen.getByLabelText('Si mi cancha se ocupa, usar otra libre')).toBeChecked()
  })

  it('starts from the slot chosen on the grid and sends every choice', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: '' }))
    render(
      <CreateMatchSheet
        open
        onClose={vi.fn()}
        action={action}
        options={OPTIONS}
        initial={{ date: '2026-10-02', time: '21:30', courtId: 'c2' }}
      />,
    )
    await userEvent.selectOptions(screen.getByLabelText('Partido'), 'Mixto')
    await userEvent.click(screen.getByRole('button', { name: 'Publicar partido' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(action.mock.calls[0][1].entries())).toEqual({
      date: '2026-10-02',
      time: '21:30',
      courtId: 'c2',
      matchType: 'mixed',
      categoryMin: '4',
      categoryMax: '6',
      side: 'backhand',
      allowOtherCourt: 'on',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/matches/create-match-sheet.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write the component**

`components/matches/create-match-sheet.tsx`:
```tsx
'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'
import { MATCH_TYPE_LABELS, MATCH_TYPES, SLOT_SIDE_LABELS, SLOT_SIDES, type MatchFormOptions } from '@/lib/domain/matches'
import { CATEGORIES } from '@/lib/domain/profile'
import type { LocalDate } from '@/lib/domain/time'

export type MatchFormInitial = { date?: LocalDate; time?: string; courtId?: string }

// Prototype: sheet "create". The server turns date and time into an instant on the club's clock.
export function CreateMatchSheet({
  open,
  onClose,
  action,
  options,
  initial = {},
}: {
  open: boolean
  onClose: () => void
  action: FormAction
  options: MatchFormOptions
  initial?: MatchFormInitial
}) {
  const { defaults } = options
  const categoryOptions = CATEGORIES.map((category) => (
    <option key={category} value={category}>
      {category}ª
    </option>
  ))
  return (
    <BottomSheet open={open} onClose={onClose} title="Armar partido abierto">
      <ActionForm
        key={`${initial.date}-${initial.time}-${initial.courtId}`}
        action={action}
        submitLabel="Publicar partido"
        pendingLabel="Publicando…"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Día" htmlFor="match-date">
            <select id="match-date" name="date" defaultValue={initial.date ?? options.days[0]?.date} className={inputClasses}>
              {options.days.map((day) => (
                <option key={day.date} value={day.date}>
                  {day.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Hora" htmlFor="match-time">
            <select
              id="match-time"
              name="time"
              defaultValue={initial.time ?? (options.times.includes('20:00') ? '20:00' : options.times[0])}
              className={inputClasses}
            >
              {options.times.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cancha preferida" htmlFor="match-court">
            <select id="match-court" name="courtId" defaultValue={initial.courtId ?? options.courts[0]?.id} className={inputClasses}>
              {options.courts.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Partido" htmlFor="match-type">
            <select id="match-type" name="matchType" defaultValue={defaults.type} className={inputClasses}>
              {MATCH_TYPES.map((type) => (
                <option key={type} value={type}>
                  {MATCH_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Categoría desde" htmlFor="match-min">
            <select id="match-min" name="categoryMin" defaultValue={defaults.categoryMin} className={inputClasses}>
              {categoryOptions}
            </select>
          </Field>
          <Field label="hasta" htmlFor="match-max">
            <select id="match-max" name="categoryMax" defaultValue={defaults.categoryMax} className={inputClasses}>
              {categoryOptions}
            </select>
          </Field>
        </div>
        <Field label="Vos jugás de" htmlFor="match-side">
          <select id="match-side" name="side" defaultValue={defaults.side} className={inputClasses}>
            {SLOT_SIDES.map((side) => (
              <option key={side} value={side}>
                {SLOT_SIDE_LABELS[side]}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="allowOtherCourt" defaultChecked className="size-5 accent-accent" />
          Si mi cancha se ocupa, usar otra libre
        </label>
        <p className="text-sm text-fg-muted">La cancha se reserva recién cuando están los 4. Mientras tanto no se bloquea.</p>
      </ActionForm>
    </BottomSheet>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/components/matches/create-match-sheet.test.tsx
npm run typecheck
```
Expected: PASS; typecheck en verde.

- [ ] **Step 5: Commit**

```bash
git add components/matches/create-match-sheet.tsx tests/unit/components/matches/create-match-sheet.test.tsx
git commit -m "feat(matches): create match sheet"
```

---

### Task 22: Hojas "Sumarte" y "Compartir"

**Files:**
- Create: `components/matches/join-sheet.tsx`, `components/matches/share-sheet.tsx`
- Test: `tests/unit/components/matches/join-sheet.test.tsx`, `tests/unit/components/matches/share-sheet.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/matches/join-sheet.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { JoinSheet } from '@/components/matches/join-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { makeMatch, withPlayers } from '../../fixtures/matches'

const props = {
  whenText: 'jueves 1 de octubre, 20:00',
  paymentNote: 'Se paga en el club o por transferencia.',
  closeHours: 3,
  onClose: vi.fn(),
  onDone: vi.fn(),
}

describe('JoinSheet', () => {
  it('explains where, with whom, the price and what happens if it does not fill up', () => {
    render(<JoinSheet {...props} match={makeMatch()} position={2} action={vi.fn<FormAction>()} />)
    const sheet = screen.getByRole('dialog', { name: 'Sumarte de revés' })
    expect(sheet).toHaveTextContent('Cancha 1 (o la que quede libre)')
    expect(sheet).toHaveTextContent('Ana Pérez')
    expect(sheet).toHaveTextContent('$400 c/u')
    expect(sheet).toHaveTextContent('Si 3 h antes no se completa, se cancela solo y no pagás nada.')
  })

  it('warns the fourth player that the court gets booked, and sends the spot', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Partido confirmado en la Cancha 1.' }))
    render(<JoinSheet {...props} match={withPlayers(makeMatch(), ['a', 'b', 'c', null])} position={4} action={action} />)
    expect(screen.getByRole('note')).toHaveTextContent('Sos el cuarto: al confirmar se reserva la cancha')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar lugar' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(action.mock.calls[0][1].entries())).toEqual({ matchId: 'm1', position: '4' })
    expect(props.onDone).toHaveBeenCalledWith('Partido confirmado en la Cancha 1.')
  })
})
```

`tests/unit/components/matches/share-sheet.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ShareSheet } from '@/components/matches/share-sheet'

describe('ShareSheet', () => {
  it('shows the message, opens WhatsApp with it and copies it', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ShareSheet text="Falta 1" onClose={vi.fn()} />)
    expect(screen.getByLabelText('Mensaje')).toHaveValue('Falta 1')
    expect(screen.getByRole('link', { name: 'Abrir WhatsApp' })).toHaveAttribute('href', 'https://wa.me/?text=Falta%201')
    fireEvent.click(screen.getByRole('button', { name: 'Copiar mensaje' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Mensaje copiado.'))
    expect(writeText).toHaveBeenCalledWith('Falta 1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/matches/join-sheet.test.tsx tests/unit/components/matches/share-sheet.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write the components**

`components/matches/join-sheet.tsx`:
```tsx
'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { formatPrice } from '@/lib/domain/format'
import { openSlots, perPlayerPrice, SLOT_SIDE_WORDS, type Match } from '@/lib/domain/matches'

// Prototype: sheet "join". Every rule that affects the player is said before confirming.
export function JoinSheet({
  match,
  position,
  whenText,
  paymentNote,
  closeHours,
  action,
  onClose,
  onDone,
}: {
  match: Match
  position: number
  whenText: string
  paymentNote: string
  closeHours: number
  action: FormAction
  onClose: () => void
  onDone: (message: string) => void
}) {
  const slot = match.slots.find((candidate) => candidate.position === position)
  if (!slot) return null
  const last = openSlots(match).length === 1
  const players = match.slots.flatMap((candidate) => (candidate.playerName ? [candidate.playerName] : [])).join(', ')
  const where = match.allowOtherCourt ? `${match.preferredCourtName} (o la que quede libre)` : match.preferredCourtName

  return (
    <BottomSheet open onClose={onClose} title={`Sumarte de ${SLOT_SIDE_WORDS[slot.side]}`}>
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-fg-muted">Cuándo</dt>
          <dd>{whenText}</dd>
          <dt className="text-fg-muted">Dónde</dt>
          <dd>{where}</dd>
          <dt className="text-fg-muted">Con quién</dt>
          <dd>{players || 'Todavía nadie'}</dd>
          <dt className="text-fg-muted">Precio</dt>
          <dd>{match.price !== null ? `${formatPrice(perPlayerPrice(match.price))} c/u` : 'A confirmar'}</dd>
        </dl>
        <p>{paymentNote}</p>
        {last ? (
          <p role="note" className="rounded-xl border border-accent p-3">
            Sos el cuarto: al confirmar se reserva la cancha y el partido queda confirmado.
          </p>
        ) : (
          <p className="text-sm text-fg-muted">Si {closeHours} h antes no se completa, se cancela solo y no pagás nada.</p>
        )}
        <ActionForm action={action} submitLabel="Confirmar lugar" pendingLabel="Sumándote…" onDone={onDone}>
          <input type="hidden" name="matchId" value={match.id} />
          <input type="hidden" name="position" value={position} />
        </ActionForm>
      </div>
    </BottomSheet>
  )
}
```

`components/matches/share-sheet.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button, buttonClasses } from '@/components/ui/button'
import { inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { whatsappUrl } from '@/lib/domain/match-share'

// Prototype: sheet "share". The link in the message leads straight to the match.
export function ShareSheet({ text, onClose }: { text: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <BottomSheet open onClose={onClose} title="Compartir en el grupo">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-muted">
          Pegalo en el grupo de WhatsApp del club. Quien toque el link se suma directo en la app.
        </p>
        <label htmlFor="share-text" className="sr-only">
          Mensaje
        </label>
        <textarea id="share-text" readOnly value={text} rows={8} className={cn(inputClasses, 'py-2')} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={copy}>Copiar mensaje</Button>
          <a href={whatsappUrl(text)} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'secondary' })}>
            Abrir WhatsApp
          </a>
        </div>
        {copied ? <p role="status">Mensaje copiado.</p> : null}
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/components/matches`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/matches/join-sheet.tsx components/matches/share-sheet.tsx tests/unit/components/matches/join-sheet.test.tsx tests/unit/components/matches/share-sheet.test.tsx
git commit -m "feat(matches): join and share sheets"
```

---

### Task 23: Acciones de partidos

**Files:**
- Create: `app/(jugador)/partidos/actions.ts`
- Test: `tests/unit/lib/actions/server-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/lib/actions/server-actions.test.ts`:
- change `type RpcResult = { data: null; error: … }` to `type RpcResult = { data: unknown; error: { message: string } | null }`;
- in the `@/lib/auth/viewer` mock, make the club `{ id: 'club-1', timezone: 'America/Montevideo' }`;
- add `const { createMatch, joinMatch, leaveMatch } = await import('@/app/(jugador)/partidos/actions')` next to the other imports;
- add:
```ts
describe('match actions', () => {
  const MATCH = '55555555-5555-5555-5555-555555555555'
  const valid = {
    date: '2026-10-01',
    time: '20:00',
    courtId: COURT,
    matchType: 'mixed',
    categoryMin: '4',
    categoryMax: '6',
    side: 'backhand',
    allowOtherCourt: 'on',
  }

  it('rejects a bad match before any RPC', async () => {
    expect(await createMatch(IDLE, form({ ...valid, matchType: 'kids' }))).toEqual(INVALID_INPUT)
    expect(await createMatch(IDLE, form({ ...valid, side: 'both' }))).toEqual(INVALID_INPUT)
    expect(await createMatch(IDLE, form({ ...valid, time: '8pm' }))).toEqual(INVALID_INPUT)
    expect(await createMatch(IDLE, form({ ...valid, categoryMin: '7' }))).toEqual({
      status: 'error',
      message: 'La categoría "desde" tiene que ser menor o igual que "hasta".',
    })
    expect(await joinMatch(IDLE, form({ matchId: MATCH, position: '5' }))).toEqual(INVALID_INPUT)
    expect(await leaveMatch(IDLE, form({ matchId: 'm1' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('creates the match at the club time and opens it', async () => {
    rpc.mockResolvedValueOnce({ data: { id: MATCH }, error: null })
    await expect(createMatch(IDLE, form(valid))).rejects.toThrow(`NEXT_REDIRECT /partidos/${MATCH}`)
    expect(rpc).toHaveBeenCalledWith('create_match', {
      p_court_id: COURT,
      p_starts_at: '2026-10-01T23:00:00.000Z',
      p_allow_other_court: true,
      p_category_min: 4,
      p_category_max: 6,
      p_match_type: 'mixed',
      p_side: 'backhand',
    })
  })

  it('tells the player he joined, and translates the errors', async () => {
    rpc.mockResolvedValueOnce({ data: { status: 'forming', court_id: null, cancel_reason: null }, error: null })
    expect(await joinMatch(IDLE, form({ matchId: MATCH, position: '2' }))).toEqual({ status: 'ok', message: 'Te sumaste al partido.' })
    expect(rpc).toHaveBeenCalledWith('join_match', { p_match_id: MATCH, p_position: 2 })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'side_mismatch' } })
    expect(await joinMatch(IDLE, form({ matchId: MATCH, position: '3' }))).toMatchObject({ status: 'error' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/actions/server-actions.test.ts`
Expected: FAIL (no existe `@/app/(jugador)/partidos/actions`).

- [ ] **Step 3: Write the actions**

`app/(jugador)/partidos/actions.ts`:
```ts
'use server'

import { redirect } from 'next/navigation'
import { failed, fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { getViewer } from '@/lib/auth/viewer'
import { readBoolean, readEnum, readInt, readLocalDate, readTime, readUuid } from '@/lib/domain/input'
import { isCancelReason, joinResultMessage, MATCH_TYPES, SLOT_SIDES } from '@/lib/domain/matches'
import { parseTime, zonedTime } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'

export async function createMatch(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return failed('Tu sesión venció. Volvé a ingresar.')
  const date = readLocalDate(form, 'date')
  const time = readTime(form, 'time')
  const courtId = readUuid(form, 'courtId')
  const matchType = readEnum(form, 'matchType', MATCH_TYPES)
  const side = readEnum(form, 'side', SLOT_SIDES)
  const categoryMin = readInt(form, 'categoryMin', { min: 1, max: 8 })
  const categoryMax = readInt(form, 'categoryMax', { min: 1, max: 8 })
  if (!date || !time || !courtId || !matchType || !side || categoryMin === null || categoryMax === null) {
    return INVALID_INPUT
  }
  if (categoryMin > categoryMax) return failed('La categoría "desde" tiene que ser menor o igual que "hasta".')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_match', {
    p_court_id: courtId,
    p_starts_at: zonedTime(date, parseTime(time), viewer.club.timezone).toISOString(),
    p_allow_other_court: readBoolean(form, 'allowOtherCourt'),
    p_category_min: categoryMin,
    p_category_max: categoryMax,
    p_match_type: matchType,
    p_side: side,
  })
  if (error) return fromRpc(error, '')
  revalidateBookings()
  redirect(`/partidos/${data.id}`)
}

export async function joinMatch(_previous: ActionState, form: FormData): Promise<ActionState> {
  const matchId = readUuid(form, 'matchId')
  const position = readInt(form, 'position', { min: 1, max: 4 })
  if (!matchId || position === null) return INVALID_INPUT

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('join_match', { p_match_id: matchId, p_position: position })
  revalidateBookings()
  if (error) return fromRpc(error, '')

  let courtName: string | null = null
  if (data.court_id) {
    const court = await supabase.from('courts').select('name').eq('id', data.court_id).maybeSingle()
    courtName = court.data?.name ?? null
  }
  const cancelReason = isCancelReason(data.cancel_reason) ? data.cancel_reason : null
  return ok(joinResultMessage({ status: data.status, cancelReason }, courtName))
}

export async function leaveMatch(_previous: ActionState, form: FormData): Promise<ActionState> {
  const matchId = readUuid(form, 'matchId')
  if (!matchId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('leave_match', { p_match_id: matchId })
  revalidateBookings()
  return fromRpc(error, 'Saliste del partido. Tu lugar quedó libre.')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/lib/actions/server-actions.test.ts
npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(jugador)/partidos/actions.ts" tests/unit/lib/actions/server-actions.test.ts
git commit -m "feat(matches): create, join and leave actions"
```

---

### Task 24: Pantalla `/partidos` y pestaña

**Files:**
- Create: `app/(jugador)/partidos/page.tsx`, `app/(jugador)/partidos/create-match-button.tsx`
- Modify: `app/(jugador)/layout.tsx`

`# (no test de página — compone componentes y funciones ya probados; los flujos e2e 1 y 2 la recorren)`

- [ ] **Step 1: Write the client button**

`app/(jugador)/partidos/create-match-button.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { CreateMatchSheet } from '@/components/matches/create-match-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import type { MatchFormOptions } from '@/lib/domain/matches'

export function CreateMatchButton({ options, action }: { options: MatchFormOptions; action: FormAction }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Armar partido</Button>
      <CreateMatchSheet open={open} onClose={() => setOpen(false)} action={action} options={options} />
    </>
  )
}
```

- [ ] **Step 2: Write the page**

`app/(jugador)/partidos/page.tsx`:
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { MatchCard } from '@/components/matches/match-card'
import { requirePlayer } from '@/lib/auth/viewer'
import { cn } from '@/lib/cn'
import { loadFreeCourts, loadMatches, loadMatchFormOptions, loadPlayerContext } from '@/lib/data/matches'
import { dayLabel, timeIn } from '@/lib/domain/format'
import { joinStatus } from '@/lib/domain/match-join'
import { riskOf } from '@/lib/domain/match-risk'
import { isInMatch, type Match } from '@/lib/domain/matches'
import { addDays, localDateOf, zonedTime } from '@/lib/domain/time'
import { createMatch } from './actions'
import { CreateMatchButton } from './create-match-button'

export const metadata: Metadata = { title: 'Partidos' }

type SearchParams = Promise<{ ver?: string }>

const filterClasses = (current: boolean) =>
  cn(
    'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold',
    current ? 'border-accent bg-accent text-on-accent' : 'border-border text-fg',
  )

export default async function MatchesPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requirePlayer('/partidos')
  const { club } = viewer
  const { ver } = await searchParams
  const showAll = ver === 'todos'
  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const until = zonedTime(addDays(today, club.booking_window_days + 1), 0, club.timezone)

  const [matches, context] = await Promise.all([
    loadMatches(club, { from: now, to: until }, ['forming']),
    loadPlayerContext(viewer, now),
  ])
  const [freeCourts, formOptions] = await Promise.all([
    loadFreeCourts(club, matches),
    loadMatchFormOptions(viewer, context, today),
  ])
  const joinContext = { now, closeHours: club.match_close_hours, busy: context.busy }
  const cards = matches.map((match) => ({ match, status: joinStatus(match, context.player, joinContext) }))
  const shown = showAll ? cards : cards.filter(({ match, status }) => status.ok || isInMatch(match, viewer.userId))
  const whenText = (match: Match) =>
    `${dayLabel(localDateOf(match.startsAt, club.timezone), today)} ${timeIn(match.startsAt, club.timezone)}`

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold uppercase">Partidos abiertos</h1>
          <p className="text-fg-muted">Sumate a un partido al que le falta gente.</p>
        </div>
        <CreateMatchButton options={formOptions} action={createMatch} />
      </div>
      <nav aria-label="Filtro" className="flex gap-2">
        <Link href="/partidos" aria-current={showAll ? undefined : 'page'} className={filterClasses(!showAll)}>
          Donde puedo sumarme
        </Link>
        <Link href="/partidos?ver=todos" aria-current={showAll ? 'page' : undefined} className={filterClasses(showAll)}>
          Todos
        </Link>
      </nav>
      {shown.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {shown.map(({ match, status }) => (
            <li key={match.id}>
              <MatchCard
                match={match}
                viewerId={viewer.userId}
                whenText={whenText(match)}
                status={status}
                risk={riskOf(match, freeCourts.get(match.id) ?? [])}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-border p-4 text-fg-muted">
          No hay partidos armándose para tu categoría y lado. Armá uno y compartilo en el grupo del club.
        </p>
      )}
    </>
  )
}
```

- [ ] **Step 3: Add the tab**

In `app/(jugador)/layout.tsx`, `PLAYER_TABS` becomes:
```ts
const PLAYER_TABS = [
  { href: '/', label: 'Inicio' },
  { href: '/reservar', label: 'Reservar' },
  { href: '/partidos', label: 'Partidos' },
  { href: '/reservas', label: 'Mis reservas' },
  { href: '/perfil', label: 'Perfil' },
]
```

- [ ] **Step 4: Check**

Run:
```bash
npm run typecheck
npm run lint
npm test
```
Expected: todo en verde.

- [ ] **Step 5: Commit**

```bash
git add "app/(jugador)/partidos/page.tsx" "app/(jugador)/partidos/create-match-button.tsx" "app/(jugador)/layout.tsx"
git commit -m "feat(matches): open matches screen and tab"
```

---

### Task 25: Pantalla `/partidos/<id>` (también el link para compartir)

**Files:**
- Create: `app/(jugador)/partidos/[id]/page.tsx`, `app/(jugador)/partidos/[id]/match-board.tsx`
- Test: `tests/unit/app/partidos/match-board.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/app/partidos/match-board.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MatchBoard, type MatchBoardProps } from '@/app/(jugador)/partidos/[id]/match-board'
import type { FormAction } from '@/components/ui/action-form'
import { makeMatch } from '../../fixtures/matches'

function renderBoard(overrides: Partial<MatchBoardProps> = {}) {
  const props: MatchBoardProps = {
    match: makeMatch(),
    viewerId: 'me',
    whenText: 'jueves 1 de octubre, 20:00',
    status: { ok: true, position: 2, text: 'Podés sumarte de revés.' },
    joinable: [2, 4],
    initialJoin: null,
    risk: null,
    howItWorks: 'La cancha se reserva recién cuando están los 4.',
    paymentNote: 'Se paga en el club o por transferencia.',
    closeHours: 3,
    leave: null,
    shareText: 'Falta 3',
    joinAction: vi.fn<FormAction>(),
    leaveAction: vi.fn<FormAction>(),
    ...overrides,
  }
  render(<MatchBoard {...props} />)
}

describe('MatchBoard', () => {
  it('opens the join sheet from a spot on the court', async () => {
    renderBoard()
    await userEvent.click(screen.getAllByRole('button', { name: 'Sumarme de revés' })[0])
    expect(screen.getByRole('dialog', { name: 'Sumarte de revés' })).toBeInTheDocument()
  })

  it('opens it straight away from a shared "Sumarme" link', () => {
    renderBoard({ initialJoin: 4 })
    expect(screen.getByRole('dialog', { name: 'Sumarte de revés' })).toBeInTheDocument()
  })

  it('says why the viewer cannot join or leave', () => {
    renderBoard({
      status: { ok: false, text: 'Es un partido femenino.' },
      joinable: [],
      leave: { allowed: false, reason: 'Ya no podés bajarte: faltan menos de 24 h. Avisá al club.' },
    })
    expect(screen.getByText('No podés sumarte: es un partido femenino.')).toBeInTheDocument()
    expect(screen.getByText('Ya no podés bajarte: faltan menos de 24 h. Avisá al club.')).toBeInTheDocument()
  })

  it('tells why a match was cancelled', () => {
    renderBoard({ match: makeMatch({ status: 'cancelled', cancelReason: 'not_filled' }), status: { ok: false, text: '' } })
    expect(screen.getByText('Se canceló. No se completó a tiempo.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Compartir en WhatsApp' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/app/partidos/match-board.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write the board**

`app/(jugador)/partidos/[id]/match-board.tsx`:
```tsx
'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { JoinSheet } from '@/components/matches/join-sheet'
import { MatchCourt } from '@/components/matches/match-court'
import { ShareSheet } from '@/components/matches/share-sheet'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/domain/format'
import type { JoinStatus } from '@/lib/domain/match-join'
import type { Risk } from '@/lib/domain/match-risk'
import {
  CANCEL_REASON_TEXT,
  categoryRangeLabel,
  isInMatch,
  MATCH_TYPE_LABELS,
  missingText,
  perPlayerPrice,
  statusLabel,
  type LeaveStatus,
  type Match,
} from '@/lib/domain/matches'

export type MatchBoardProps = {
  match: Match
  viewerId: string
  whenText: string
  status: JoinStatus
  joinable: number[]
  initialJoin: number | null
  risk: Risk | null
  howItWorks: string
  paymentNote: string
  closeHours: number
  leave: LeaveStatus
  shareText: string
  joinAction: FormAction
  leaveAction: FormAction
  children?: ReactNode
}

const lowerFirst = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`

// Prototype: sheet "match", as a page: it is also where the shared link lands.
export function MatchBoard(props: MatchBoardProps) {
  const { match, viewerId, status, risk, leave } = props
  const [joinPosition, setJoinPosition] = useState<number | null>(props.initialJoin)
  const [sheet, setSheet] = useState<'share' | 'leave' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setSheet(null), [])
  const done = useCallback((message: string) => {
    setJoinPosition(null)
    setSheet(null)
    setNotice(message)
  }, [])
  const forming = match.status === 'forming'
  const court =
    match.status === 'confirmed'
      ? (match.courtName ?? match.preferredCourtName)
      : `${match.preferredCourtName}${match.allowOtherCourt ? ', o la que quede libre' : ''}`

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-3xl font-bold uppercase">{props.whenText}</h1>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold">{statusLabel(match)}</span>
      </div>
      {notice ? (
        <p role="status" className="rounded-xl border border-accent bg-surface p-3">
          {notice}
        </p>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-fg-muted">Cancha</dt>
        <dd>{court}</dd>
        <dt className="text-fg-muted">Categoría</dt>
        <dd>
          {categoryRangeLabel(match.categoryMin, match.categoryMax)}, {MATCH_TYPE_LABELS[match.type].toLowerCase()}
        </dd>
        <dt className="text-fg-muted">Precio</dt>
        <dd>
          {match.price !== null ? `${formatPrice(perPlayerPrice(match.price))} c/u. ` : ''}
          {props.paymentNote}
        </dd>
      </dl>
      {forming ? <p className="font-semibold">{missingText(match)}</p> : null}
      {forming && status.ok ? <p className="text-sm">Tocá un lugar amarillo para sumarte.</p> : null}
      <MatchCourt match={match} viewerId={viewerId} joinable={props.joinable} onJoin={setJoinPosition} />
      {forming && !status.ok && !isInMatch(match, viewerId) && status.text ? (
        <p role="note" className="rounded-xl border border-border p-3">
          No podés sumarte: {lowerFirst(status.text)}
        </p>
      ) : null}
      {risk ? (
        <p role="note" className="rounded-xl border border-accent p-3">
          {risk.text}
        </p>
      ) : null}
      {match.status === 'cancelled' && match.cancelReason ? (
        <p role="note" className="rounded-xl border border-accent p-3">
          Se canceló. {CANCEL_REASON_TEXT[match.cancelReason]}
        </p>
      ) : null}
      {match.status === 'confirmed' && match.courtId && match.courtId !== match.preferredCourtId ? (
        <p className="text-sm">
          La {match.preferredCourtName} estaba reservada, así que el partido pasó a la {match.courtName}.
        </p>
      ) : null}
      {forming ? (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">¿Cómo funciona?</summary>
          <p className="mt-2 text-sm text-fg-muted">{props.howItWorks}</p>
        </details>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {forming ? <Button onClick={() => setSheet('share')}>Compartir en WhatsApp</Button> : null}
        {leave?.allowed ? (
          <Button variant="ghost" onClick={() => setSheet('leave')}>
            Salir del partido
          </Button>
        ) : leave ? (
          <p className="text-sm text-fg-muted">{leave.reason}</p>
        ) : null}
      </div>
      {props.children}

      {joinPosition !== null ? (
        <JoinSheet
          match={match}
          position={joinPosition}
          whenText={props.whenText}
          paymentNote={props.paymentNote}
          closeHours={props.closeHours}
          action={props.joinAction}
          onClose={() => setJoinPosition(null)}
          onDone={done}
        />
      ) : null}
      {sheet === 'share' ? <ShareSheet text={props.shareText} onClose={close} /> : null}
      <BottomSheet open={sheet === 'leave'} onClose={close} title="Salir del partido">
        <p className="mb-4">
          {match.status === 'confirmed'
            ? 'Tu lugar queda libre y el partido vuelve a buscar gente. La cancha sigue reservada hasta la hora de cierre.'
            : 'Tu lugar queda libre para otro.'}
        </p>
        <ActionForm action={props.leaveAction} submitLabel="Sí, salir" pendingLabel="Saliendo…" onDone={done}>
          <input type="hidden" name="matchId" value={match.id} />
        </ActionForm>
      </BottomSheet>
    </div>
  )
}
```

- [ ] **Step 4: Write the page**

`app/(jugador)/partidos/[id]/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { getSiteUrl } from '@/lib/auth/redirect'
import { requirePlayer } from '@/lib/auth/viewer'
import { loadFreeCourts, loadMatch, loadPlayerContext } from '@/lib/data/matches'
import { dayLongLabel, timeIn } from '@/lib/domain/format'
import { isUuid } from '@/lib/domain/input'
import { canJoin, joinStatus } from '@/lib/domain/match-join'
import { riskOf } from '@/lib/domain/match-risk'
import { shareText } from '@/lib/domain/match-share'
import { howItWorks, leaveStatus, openSlots } from '@/lib/domain/matches'
import { paymentMethodsNote } from '@/lib/domain/payments'
import { localDateOf } from '@/lib/domain/time'
import { joinMatch, leaveMatch } from '../actions'
import { MatchBoard } from './match-board'

export const metadata: Metadata = { title: 'Partido' }

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ sumarme?: string }>

export default async function MatchPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  // Without a session: sign in, the welcome form if needed, and back here (requirePlayer keeps the path).
  const viewer = await requirePlayer(`/partidos/${id}`)
  const { club } = viewer
  const match = await loadMatch(club, id)
  if (!match) notFound()

  const now = new Date()
  const { sumarme } = await searchParams
  const [context, freeCourts] = await Promise.all([loadPlayerContext(viewer, now), loadFreeCourts(club, [match])])
  const joinContext = { now, closeHours: club.match_close_hours, busy: context.busy }
  const joinable = openSlots(match)
    .filter((slot) => canJoin(match, slot.position, context.player, joinContext).ok)
    .map((slot) => slot.position)
  const requested = Number(sumarme)
  const dayText = dayLongLabel(localDateOf(match.startsAt, club.timezone))
  const time = timeIn(match.startsAt, club.timezone)

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <MatchBoard
        match={match}
        viewerId={viewer.userId}
        whenText={`${dayText}, ${time}`}
        status={joinStatus(match, context.player, joinContext)}
        joinable={joinable}
        initialJoin={joinable.includes(requested) ? requested : null}
        risk={riskOf(match, freeCourts.get(match.id) ?? [])}
        howItWorks={howItWorks(club.match_close_hours, club.cancellation_notice_hours)}
        paymentNote={paymentMethodsNote(club)}
        closeHours={club.match_close_hours}
        leave={leaveStatus(match, viewer.userId, club.cancellation_notice_hours, now)}
        shareText={shareText({ match, clubName: club.name, dayText, time, url: `${getSiteUrl()}/partidos/${match.id}` })}
        joinAction={joinMatch}
        leaveAction={leaveMatch}
      />
    </>
  )
}
```

- [ ] **Step 5: Run tests and checks**

Run:
```bash
npx vitest run tests/unit/app/partidos/match-board.test.tsx
npm run typecheck
npm run lint
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(jugador)/partidos/[id]" tests/unit/app/partidos/match-board.test.tsx
git commit -m "feat(matches): match detail, join, leave and share"
```

---

### Task 26: Verificación del corte 5

**Files:** ninguno.

- [ ] **Step 1: Todo en verde y push**

Run:
```bash
npm test
npm run lint
npm run typecheck
npm run build
git push
```
Expected: todo en verde; `next build` lista `/partidos` y `/partidos/[id]` como dinámicas.

---

## Corte 6: Integración

### Task 27: Partidos en la grilla (dominio y carga del día)

**Files:**
- Modify: `lib/domain/grid.ts`, `lib/data/day.ts`, `tests/unit/fixtures/grid.ts`
- Test: `tests/unit/lib/domain/grid.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/unit/fixtures/grid.ts`, `makeGrid` accepts matches and passes them on:
```ts
export function makeGrid({
  occupancies = [],
  bookings = [],
  matches = [],
  now = at('07:00'),
  rules = RULES,
}: { occupancies?: Occupancy[]; bookings?: GridBooking[]; matches?: Match[]; now?: Date; rules?: PricingRule[] } = {}): DayGrid {
  return buildDayGrid({ date: DATE, slots: daySlots(SCHEDULE, DATE), courts: COURTS, rules, occupancies, bookings, matches, now })
}
```
(with `import type { Match } from '@/lib/domain/matches'`).

Append to `tests/unit/lib/domain/grid.test.ts` (importing `makeMatch` from `'../../fixtures/matches'`):
```ts
describe('forming matches on the grid', () => {
  const at20 = (grid: ReturnType<typeof makeGrid>) => grid.rows.find((row) => row.slot.label === '20:00')

  it('marks the free cell of the preferred court and slot, which stays free', () => {
    const row = at20(makeGrid({ matches: [makeMatch()] }))
    expect(row?.cells.map((cell) => cell.formingMatch ?? null)).toEqual([{ id: 'm1', filled: 1 }, null])
    expect(row?.cells[0].state).toBe('free')
  })

  it('leaves out taken cells and matches that already hold a court', () => {
    const taken = makeGrid({ matches: [makeMatch()], occupancies: [occupancy('o1', 'court-1', '20:00', '21:30')] })
    expect(at20(taken)?.cells[0].formingMatch ?? null).toBeNull()
    const held = makeGrid({ matches: [makeMatch({ bookingId: 'b1' })] })
    expect(at20(held)?.cells[0].formingMatch ?? null).toBeNull()
  })

  it('keeps the matches of the day for the club panel', () => {
    expect(makeGrid({ matches: [makeMatch()] }).matches.map((match) => match.id)).toEqual(['m1'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/grid.test.ts`
Expected: FAIL (`formingMatch` undefined; `matches` no existe en `DayGrid`).

- [ ] **Step 3: Write the implementation**

`lib/domain/grid.ts`:
- imports: `import type { MatchPlayerPayment } from './match-payments'` and `import { filledCount, type Match } from './matches'`;
- `GridBooking` gains `matchId?: string | null` and `matchPlayers?: MatchPlayerPayment[]`;
- new type and `GridCell` field:
```ts
// A forming match that wants this court at this time. It does not block it.
export type FormingMatchRef = { id: string; filled: number }
```
```ts
  formingMatch?: FormingMatchRef | null
```
- `DayGrid` gains `matches: Match[]`;
- `buildDayGrid` input gains `matches?: Match[]`; add the helper and use it:
```ts
function formingAt(matches: Match[], courtId: string, slot: Slot): FormingMatchRef | null {
  const match = matches.find(
    (candidate) =>
      candidate.status === 'forming' &&
      candidate.bookingId === null &&
      candidate.preferredCourtId === courtId &&
      candidate.startsAt.getTime() === slot.startsAt.getTime(),
  )
  return match ? { id: match.id, filled: filledCount(match) } : null
}
```
```ts
  const matches = input.matches ?? []
```
in each cell: `formingMatch: occupancy ? null : formingAt(matches, court.id, slot),` and return `{ date: input.date, courts: input.courts, rows, outside, matches }`.

`lib/data/day.ts`:
- `BookingRow` gains `match_id: string | null` and `match: { slots: SlotHolder[] } | null`, and its payments become `{ status: PaymentStatus; amount: number; payer_id: string | null }[]` (import `matchPlayerPayments, type SlotHolder` from `@/lib/domain/match-payments`);
- the bookings select becomes:
```ts
        'id, occupancy_id, player_id, guest_name, price, status, source, series_id, match_id, player:profiles!bookings_player_id_fkey(display_name), match:open_matches!bookings_match_id_fkey(slots:match_slots(position, player_id, player:profiles(display_name))), payments(status, amount, payer_id)',
```
- `toGridBooking` becomes:
```ts
function toGridBooking(row: BookingRow, occupancyId: string, viewerId: string): GridBooking {
  const slots = row.match?.slots ?? []
  return {
    id: row.id,
    occupancyId,
    isMine: row.player_id === viewerId || slots.some((slot) => slot.player_id === viewerId),
    holderName: holderName(row.guest_name, row.player?.display_name ?? null) ?? (row.match_id ? 'Partido abierto' : null),
    playerId: row.player_id,
    price: row.price,
    source: row.source,
    seriesId: row.series_id,
    paymentState: paymentState(row, row.payments),
    amountDue: amountDue(row.price, row.payments),
    matchId: row.match_id,
    matchPlayers: row.match ? matchPlayerPayments(row, slots, row.payments) : [],
  }
}
```
- `loadDayGrid` also loads the day's matches: add `loadMatches(club, { from: new Date(dayStart), to: new Date(dayEnd) })` (import from `./matches`) to the `Promise.all` and pass `matches` to `buildDayGrid`.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/lib/domain
npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/grid.ts lib/data/day.ts tests/unit/fixtures/grid.ts tests/unit/lib/domain/grid.test.ts
git commit -m "feat(grid): forming matches and match bookings on the day grid"
```

---

### Task 28: Reservar: "Falta N" y "Armar partido abierto"

**Files:**
- Modify: `components/booking/slot-grid.tsx`, `components/booking/booking-sheet.tsx`
- Modify: `app/(jugador)/reservar/reservar-board.tsx`, `app/(jugador)/reservar/page.tsx`
- Test: `tests/unit/components/booking/slot-grid.test.tsx`, `tests/unit/components/booking/booking-sheet.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/components/booking/slot-grid.test.tsx` (adding `import { makeMatch } from '../../fixtures/matches'`):
```tsx
describe('open matches on the grid', () => {
  it('shows a forming match on the player grid and opens it', () => {
    const grid = makeGrid({ matches: [makeMatch()] })
    render(<SlotGrid courts={grid.courts} rows={grid.rows} variant="player" onSelect={vi.fn()} />)
    const link = screen.getByRole('link', { name: 'Partido armándose en Cancha 1 a las 20:00: faltan 3' })
    expect(link).toHaveAttribute('href', '/partidos/m1')
    expect(link).toHaveTextContent('Faltan 3')
  })

  it('tells reception the match does not block the court', () => {
    const grid = makeGrid({ matches: [makeMatch()] })
    render(<SlotGrid courts={grid.courts} rows={grid.rows} variant="club" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Cargar Cancha 1, 20:00' })).toHaveTextContent('Armándose 1/4 · no bloquea')
  })
})
```

Append to `tests/unit/components/booking/booking-sheet.test.tsx` (it already defines `CHOICE`, $1.600):
```tsx
  it('offers an open match at a quarter of the price', async () => {
    const onCreateMatch = vi.fn()
    render(
      <BookingSheet
        choice={CHOICE}
        dayText="jueves 1 de octubre"
        paymentNote="Se paga en el club."
        cancellationRule="Podés cancelar."
        action={vi.fn<FormAction>()}
        onClose={vi.fn()}
        onBooked={vi.fn()}
        onCreateMatch={onCreateMatch}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Armar partido abierto, $400 c/u' }))
    expect(onCreateMatch).toHaveBeenCalledWith(CHOICE)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/booking`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`components/booking/slot-grid.tsx`:
- import `Link from 'next/link'`;
- at the top of `PlayerCell`:
```tsx
  if (cell.state === 'free' && cell.formingMatch) {
    const missing = 4 - cell.formingMatch.filled
    const text = missing === 1 ? 'Falta 1' : `Faltan ${missing}`
    return (
      <Link
        href={`/partidos/${cell.formingMatch.id}`}
        aria-label={`Partido armándose en ${cell.court.name} a las ${cell.slot.label}: ${text.toLowerCase()}`}
        className={cn(CELL, 'border-2 border-dashed border-accent bg-bg text-fg', FOCUS)}
      >
        <b>{text}</b>
        <span>Partido abierto</span>
      </Link>
    )
  }
```
- in the `mine` branch: `<span>{cell.booking?.matchId ? 'Partido' : 'Reserva'}</span>`;
- in `ClubCell`, match occupancies look like bookings: `occupancy.kind === 'booking' || occupancy.kind === 'match' ? CELL_STYLES.booking : CELL_STYLES.other` (keep the block and recurring branches), and the free "+ Cargar" button adds, after the "Sin precio" line:
```tsx
      {cell.formingMatch ? <span className="text-xs">Armándose {cell.formingMatch.filled}/4 · no bloquea</span> : null}
```

`components/booking/booking-sheet.tsx`: add `onCreateMatch?: (choice: BookingChoice) => void` to the props and, after the `ActionForm`:
```tsx
          {onCreateMatch ? (
            <>
              <Button variant="secondary" fullWidth onClick={() => onCreateMatch(choice)}>
                Armar partido abierto, {formatPrice(perPlayerPrice(choice.price))} c/u
              </Button>
              <p className="text-sm text-fg-muted">
                Con el partido abierto la cancha no se bloquea hasta que estén los 4. Cada uno paga su parte.
              </p>
            </>
          ) : null}
```
(imports: `Button` from `@/components/ui/button`, `perPlayerPrice` from `@/lib/domain/matches`).

`app/(jugador)/reservar/reservar-board.tsx`: new props `date: LocalDate`, `matchOptions: MatchFormOptions`, `createMatchAction: FormAction`; state `const [matchInitial, setMatchInitial] = useState<MatchFormInitial | null>(null)`; pass `onCreateMatch={(picked) => { setChoice(null); setMatchInitial({ date, time: picked.timeLabel, courtId: picked.courtId }) }}` to `BookingSheet`, and render:
```tsx
      <CreateMatchSheet
        open={matchInitial !== null}
        onClose={() => setMatchInitial(null)}
        action={createMatchAction}
        options={matchOptions}
        initial={matchInitial ?? undefined}
      />
```

`app/(jugador)/reservar/page.tsx`: load `const context = await loadPlayerContext(viewer, now)` and `const matchOptions = await loadMatchFormOptions(viewer, context, today)`, and pass `date={date}`, `matchOptions={matchOptions}`, `createMatchAction={createMatch}` (from `../partidos/actions`) to `ReservarBoard`.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/components/booking
npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/booking/slot-grid.tsx components/booking/booking-sheet.tsx "app/(jugador)/reservar" tests/unit/components/booking
git commit -m "feat(reservar): forming matches on the grid and open match from a free slot"
```

---

### Task 29: Inicio: "Partidos para vos" y "Tu próximo partido"

**Files:**
- Modify: `app/(jugador)/page.tsx`

`# (no test de página — usa matchesForMe y MatchCard, ya probados)`

- [ ] **Step 1: Load the matches and the player context**

In `HomePage`, after the profile check, build the member viewer and load everything in parallel:
```tsx
  const member = { ...viewer, membership }
  const windowEnd = zonedTime(addDays(localDateOf(now, club.timezone), club.booking_window_days + 1), 0, club.timezone)
  const [grid, next, matches, context] = await Promise.all([
    loadDayGrid(club, localDateOf(now, club.timezone), { userId: viewer.userId, audience: 'player' }, now),
    supabase
      .from('bookings')
      .select('id, starts_at, ends_at, court:courts(name)')
      .eq('player_id', viewer.userId)
      .eq('status', 'confirmed')
      .gt('ends_at', now.toISOString())
      .order('starts_at')
      .limit(1)
      .maybeSingle(),
    loadMatches(club, { from: now, to: windowEnd }),
    loadPlayerContext(member, now),
  ])
  const forMe = matchesForMe(
    matches.filter((match) => match.status === 'forming'),
    context.player,
    { now, closeHours: club.match_close_hours, busy: context.busy, timezone: club.timezone, habits: context.habits },
  )
  const myMatches = matches.filter((match) => isInMatch(match, viewer.userId)).slice(0, 3)
  const freeCourts = await loadFreeCourts(club, forMe.map((item) => item.match))
  const today = localDateOf(now, club.timezone)
  const whenText = (start: Date) => `${dayLabel(localDateOf(start, club.timezone), today)} ${timeIn(start, club.timezone)}`
```

- [ ] **Step 2: Render the two sections** (after "Tu próxima reserva")

```tsx
      <Card className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-bold uppercase">Tu próximo partido</h2>
        {myMatches.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {myMatches.map((match) => (
              <li key={match.id}>
                <Link href={`/partidos/${match.id}`} className="font-semibold text-accent-ink underline">
                  {whenText(match.startsAt)}
                </Link>{' '}
                <span className="text-fg-muted">{statusLabel(match)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">No estás anotado en ningún partido.</p>
        )}
      </Card>
      <section aria-labelledby="para-vos" className="flex flex-col gap-3">
        <h2 id="para-vos" className="font-display text-2xl font-bold uppercase">
          Partidos para vos
        </h2>
        {forMe.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {forMe.map(({ match, reasons }) => (
              <li key={match.id}>
                <MatchCard
                  match={match}
                  viewerId={viewer.userId}
                  whenText={whenText(match.startsAt)}
                  status={joinStatus(match, context.player, { now, closeHours: club.match_close_hours, busy: context.busy })}
                  risk={riskOf(match, freeCourts.get(match.id) ?? [])}
                  reasons={reasons}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">
            Ahora no hay partidos armándose para tu categoría y lado.{' '}
            <Link href="/partidos" className="font-semibold text-accent-ink underline">
              Armá uno
            </Link>
            .
          </p>
        )}
      </section>
```
(imports: `MatchCard`, `loadFreeCourts`, `loadMatches`, `loadPlayerContext` from `@/lib/data/matches`, `dayLabel` from `@/lib/domain/format`, `joinStatus`, `riskOf`, `matchesForMe`, `isInMatch`, `statusLabel`, `addDays`, `zonedTime`).

- [ ] **Step 3: Check and commit**

Run:
```bash
npm run typecheck
npm run lint
```
Expected: sin errores.

```bash
git add "app/(jugador)/page.tsx"
git commit -m "feat(inicio): matches for you and your next match"
```

---

### Task 30: Mis reservas: la parte propia de un partido

**Files:**
- Modify: `lib/domain/my-bookings.ts`, `app/(jugador)/reservas/page.tsx`, `app/(jugador)/reservas/my-booking-card.tsx`
- Test: `tests/unit/lib/domain/my-bookings.test.ts`, `tests/unit/app/reservas/my-booking-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/lib/domain/my-bookings.test.ts` (reusing its `row()`, `CLUB` and `NOW` helpers):
```ts
describe('toMyMatchBookingView', () => {
  it('shows the player his share and his own payments only', () => {
    const view = toMyMatchBookingView(
      {
        ...row({ price: 1602 }),
        match_id: 'm1',
        payments: [
          { status: 'confirmed', amount: 402, rejection_reason: null, created_at: '2026-09-29T10:00:00Z', payer_id: 'me' },
          { status: 'reported', amount: 400, rejection_reason: null, created_at: '2026-09-29T10:00:00Z', payer_id: 'other' },
        ],
      },
      1,
      'me',
      CLUB,
      NOW,
    )
    expect(view).toMatchObject({ price: 402, amountDue: 0, paymentState: 'paid', matchId: 'm1' })
    expect(view.cancel).toEqual({ allowed: false, reason: 'Para bajarte, entrá al partido.' })
  })
})
```
(add `toMyMatchBookingView` to the import).

Append to `tests/unit/app/reservas/my-booking-card.test.tsx`:
```tsx
  it('links a match share to its match instead of cancelling', () => {
    renderCard({ ...BOOKING, matchId: 'm1', cancel: { allowed: false, reason: 'Para bajarte, entrá al partido.' } })
    expect(screen.getByText('Partido abierto, tu parte')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver partido' })).toHaveAttribute('href', '/partidos/m1')
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/domain/my-bookings.test.ts tests/unit/app/reservas/my-booking-card.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`lib/domain/my-bookings.ts`: `MyBookingView` gains `matchId?: string | null`; add (importing `shareFor` from `./match-payments`):
```ts
export type MyMatchBookingRow = Omit<MyBookingRow, 'payments'> & {
  match_id: string
  payments: (MyBookingRow['payments'][number] & { payer_id: string | null })[]
}

// A match booking seen by one of its players: his share, his payments. He leaves from the match page.
export function toMyMatchBookingView(
  row: MyMatchBookingRow,
  position: number,
  userId: string,
  club: ClubRules,
  now: Date,
): MyBookingView {
  const own = {
    ...row,
    price: shareFor(row.price, position),
    payments: row.payments.filter((payment) => payment.payer_id === userId),
  }
  return {
    ...toMyBookingView(own, club, now),
    matchId: row.match_id,
    cancel: { allowed: false, reason: 'Para bajarte, entrá al partido.' },
  }
}
```

`app/(jugador)/reservas/my-booking-card.tsx`: under the court line, `{booking.matchId ? <p className="text-sm font-semibold">Partido abierto, tu parte</p> : null}`; in the upcoming actions, replace the cancel branch with:
```tsx
          {booking.matchId ? (
            <Link href={`/partidos/${booking.matchId}`} className="font-semibold text-accent-ink underline">
              Ver partido
            </Link>
          ) : booking.cancel.allowed ? (
            <Button variant="ghost" onClick={() => setSheet('cancel')}>
              Cancelar reserva
            </Button>
          ) : (
            <p className="text-sm text-fg-muted">{booking.cancel.reason}</p>
          )}
```
(import `Link from 'next/link'`).

`app/(jugador)/reservas/page.tsx`: also read the match bookings the viewer plays in, and merge them in start order:
```tsx
  const spots = await supabase.from('match_slots').select('position, match:open_matches(booking_id)').eq('player_id', viewer.userId)
  if (spots.error) throw spots.error
  const positionByBooking = new Map(
    spots.data.flatMap((spot) => (spot.match?.booking_id ? [[spot.match.booking_id, spot.position] as const] : [])),
  )
  const matchBookings =
    positionByBooking.size > 0
      ? await supabase
          .from('bookings')
          .select(
            'id, starts_at, ends_at, price, status, match_id, court:courts(name), payments(status, amount, rejection_reason, created_at, payer_id)',
          )
          .in('id', [...positionByBooking.keys()])
      : { data: [], error: null }
  if (matchBookings.error) throw matchBookings.error

  const now = new Date()
  const rows = [
    ...data.map((row) => ({ startsAt: row.starts_at ?? '', view: toMyBookingView(row, club, now) })),
    ...matchBookings.data.flatMap((row) =>
      row.match_id
        ? [{
            startsAt: row.starts_at ?? '',
            view: toMyMatchBookingView({ ...row, match_id: row.match_id }, positionByBooking.get(row.id) ?? 2, viewer.userId, club, now),
          }]
        : [],
    ),
  ].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  const { upcoming, past } = splitMyBookings(rows.map((item) => item.view))
```
(replacing the previous `now` and `splitMyBookings` lines).

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/lib/domain/my-bookings.test.ts tests/unit/app/reservas/my-booking-card.test.tsx
npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/my-bookings.ts "app/(jugador)/reservas" tests/unit/lib/domain/my-bookings.test.ts tests/unit/app/reservas/my-booking-card.test.tsx
git commit -m "feat(reservas): the player's share of a confirmed match"
```

---

### Task 31: Grilla del club: partidos, cobro por jugador y panel "Partidos armándose"

**Files:**
- Create: `components/club/match-staff-actions.tsx`, `components/club/forming-matches-panel.tsx`
- Modify: `components/club/occupancy-detail-sheet.tsx`, `app/(club)/club/grilla/actions.ts`, `app/(club)/club/grilla/page.tsx`, `app/(club)/club/grilla/club-board.tsx`
- Test: `tests/unit/components/club/forming-matches-panel.test.tsx`, `tests/unit/components/club/occupancy-detail-sheet.test.tsx`, `tests/unit/lib/actions/server-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/club/forming-matches-panel.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FormingMatchesPanel } from '@/components/club/forming-matches-panel'
import type { FormAction } from '@/components/ui/action-form'
import { makeMatch, withPlayers } from '../../fixtures/matches'

describe('FormingMatchesPanel', () => {
  it('lists what each forming match is missing and its court risk', () => {
    render(
      <FormingMatchesPanel
        items={[{ match: makeMatch(), timeText: '20:00', risk: { level: 'warn', text: 'La Cancha 1 ya se reservó.' } }]}
        actions={{ cancelMatch: vi.fn<FormAction>(), removeFromMatch: vi.fn<FormAction>() }}
      />,
    )
    expect(screen.getByText('20:00, Cancha 1')).toBeInTheDocument()
    expect(screen.getByText(/Faltan 3: 1 de drive y 2 de revés/)).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('La Cancha 1 ya se reservó.')
  })

  it('lets reception take a player out or cancel the match', async () => {
    const removeFromMatch = vi.fn<FormAction>(async () => ({ status: 'ok', message: '' }))
    render(
      <FormingMatchesPanel
        items={[{ match: withPlayers(makeMatch(), ['ana', 'bruno', null, null]), timeText: '20:00', risk: null }]}
        actions={{ cancelMatch: vi.fn<FormAction>(), removeFromMatch }}
      />,
    )
    await userEvent.click(screen.getByText('Jugadores y acciones'))
    await userEvent.click(screen.getAllByRole('button', { name: 'Sacar del partido' })[1])
    await waitFor(() => expect(removeFromMatch).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(removeFromMatch.mock.calls[0][1].entries())).toEqual({ matchId: 'm1', playerId: 'bruno' })
    expect(screen.getByRole('button', { name: 'Cancelar partido' })).toBeInTheDocument()
  })
})
```

In `tests/unit/components/club/occupancy-detail-sheet.test.tsx`, the `actions` object of `renderDetail` gains `cancelMatch: vi.fn<FormAction>(done),` and `removeFromMatch: vi.fn<FormAction>(done),`; add a match cell next to `booked` and `blocked`:
```tsx
const matchCell = makeGrid({
  occupancies: [occupancy('om', 'court-1', '20:00', '21:30', 'match')],
  bookings: [
    booking('om', {
      holderName: 'Partido abierto',
      source: 'online',
      price: 1600,
      amountDue: 1200,
      matchId: 'm1',
      matchPlayers: [
        { playerId: 'a', name: 'Ana', position: 1, share: 400, due: 0, state: 'paid' },
        { playerId: 'b', name: 'Bruno', position: 2, share: 400, due: 400, state: 'pending' },
      ],
    }),
  ],
}).rows.find((row) => row.slot.label === '20:00')!.cells[0]
```
and the case:
```tsx
  it('shows a match booking by player, with cash per player and the match actions', async () => {
    const { actions, sent } = renderDetail(matchCell)
    expect(screen.getByText('Ana')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar $400' }))
    await waitFor(() => expect(actions.cash).toHaveBeenCalledTimes(1))
    expect(sent(actions.cash)).toEqual({ bookingId: 'b-om', payerId: 'b', amount: '400' })
    expect(screen.getByRole('button', { name: 'Cancelar partido' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument()
  })
```

In `tests/unit/lib/actions/server-actions.test.ts`, import `cancelMatch, recordCash, removeFromMatch` from the grilla actions and add:
```ts
describe('club match actions', () => {
  const MATCH = '55555555-5555-5555-5555-555555555555'
  const PLAYER = '66666666-6666-6666-6666-666666666666'

  it('rejects bad ids and a payer that is not a uuid', async () => {
    expect(await cancelMatch(IDLE, form({ matchId: 'm1' }))).toEqual(INVALID_INPUT)
    expect(await removeFromMatch(IDLE, form({ matchId: MATCH, playerId: 'ana' }))).toEqual(INVALID_INPUT)
    expect(await recordCash(IDLE, form({ bookingId: BOOKING, amount: '400', payerId: 'ana' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('records cash for one player of a match', async () => {
    await recordCash(IDLE, form({ bookingId: BOOKING, amount: '400', payerId: PLAYER }))
    expect(rpc).toHaveBeenCalledWith('record_cash', { p_booking_id: BOOKING, p_amount: 400, p_payer_id: PLAYER })
    await cancelMatch(IDLE, form({ matchId: MATCH, note: ' Lluvia ' }))
    expect(rpc).toHaveBeenCalledWith('cancel_match', { p_match_id: MATCH, p_note: 'Lluvia' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/club tests/unit/lib/actions/server-actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`components/club/match-staff-actions.tsx`:
```tsx
'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'

export function RemovePlayerForm({
  matchId,
  playerId,
  action,
  onDone,
}: {
  matchId: string
  playerId: string
  action: FormAction
  onDone?: (message: string) => void
}) {
  return (
    <ActionForm action={action} submitLabel="Sacar del partido" pendingLabel="Sacando…" variant="ghost" onDone={onDone}>
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="playerId" value={playerId} />
    </ActionForm>
  )
}

export function CancelMatchForm({
  matchId,
  action,
  onDone,
}: {
  matchId: string
  action: FormAction
  onDone?: (message: string) => void
}) {
  return (
    <ActionForm action={action} submitLabel="Cancelar partido" pendingLabel="Cancelando…" variant="secondary" onDone={onDone}>
      <input type="hidden" name="matchId" value={matchId} />
      <Field label="Motivo (opcional)" htmlFor={`note-${matchId}`}>
        <input id={`note-${matchId}`} name="note" maxLength={120} className={inputClasses} />
      </Field>
    </ActionForm>
  )
}
```

`components/club/forming-matches-panel.tsx`:
```tsx
import type { FormAction } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import type { Risk } from '@/lib/domain/match-risk'
import { categoryRangeLabel, MATCH_TYPE_LABELS, missingText, type Match } from '@/lib/domain/matches'
import { CancelMatchForm, RemovePlayerForm } from './match-staff-actions'

export type FormingMatchItem = { match: Match; timeText: string; risk: Risk | null }

// Next to the grid: matches still looking for players, which do not block courts yet.
export function FormingMatchesPanel({
  items,
  actions,
}: {
  items: FormingMatchItem[]
  actions: { cancelMatch: FormAction; removeFromMatch: FormAction }
}) {
  return (
    <section aria-labelledby="armandose" className="flex flex-col gap-3">
      <h2 id="armandose" className="font-display text-2xl font-bold uppercase">
        Partidos armándose
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-fg-muted">Ninguno este día.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map(({ match, timeText, risk }) => (
            <li key={match.id}>
              <Card className="flex flex-col gap-2">
                <p className="font-semibold">
                  {timeText}, {match.preferredCourtName}
                </p>
                <p className="text-sm">
                  {missingText(match)} · {categoryRangeLabel(match.categoryMin, match.categoryMax)},{' '}
                  {MATCH_TYPE_LABELS[match.type].toLowerCase()}
                </p>
                {risk ? (
                  <p role="note" className="text-sm">
                    {risk.text}
                  </p>
                ) : (
                  <p className="text-sm text-fg-muted">No bloquea la cancha.</p>
                )}
                <details>
                  <summary className="cursor-pointer text-sm font-semibold">Jugadores y acciones</summary>
                  <ul className="mt-2 flex flex-col gap-2">
                    {match.slots.flatMap((slot) =>
                      slot.playerId
                        ? [
                            <li key={slot.position} className="flex items-center justify-between gap-2">
                              <span>{slot.playerName}</span>
                              <RemovePlayerForm matchId={match.id} playerId={slot.playerId} action={actions.removeFromMatch} />
                            </li>,
                          ]
                        : [],
                    )}
                  </ul>
                  <CancelMatchForm matchId={match.id} action={actions.cancelMatch} />
                </details>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

`components/club/occupancy-detail-sheet.tsx`:
- `DetailActions` gains `cancelMatch: FormAction; removeFromMatch: FormAction`;
- the `{booking ? (...) : null}` block becomes `{booking?.matchId ? <MatchBookingDetail … /> : booking ? (/* existing content */) : null}` with, in the same file:
```tsx
function MatchBookingDetail({
  booking,
  acceptsCash,
  actions,
  onDone,
}: {
  booking: GridBooking
  acceptsCash: boolean
  actions: DetailActions
  onDone: (message: string) => void
}) {
  const matchId = booking.matchId ?? ''
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <PaymentBadge state={booking.paymentState} />
        <span>{formatPrice(booking.price)}, cada jugador paga su parte</span>
      </div>
      <ul className="flex flex-col gap-2">
        {(booking.matchPlayers ?? []).map((player) => (
          <li key={player.playerId} className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{player.name}</span>
              <PaymentBadge state={player.state} />
            </div>
            <p className="text-sm text-fg-muted">
              Parte {formatPrice(player.share)}
              {player.due > 0 ? `, debe ${formatPrice(player.due)}` : ''}
            </p>
            {acceptsCash && player.due > 0 ? (
              <ActionForm action={actions.cash} submitLabel={`Cobrar ${formatPrice(player.due)}`} pendingLabel="Registrando…" variant="secondary" onDone={onDone}>
                <input type="hidden" name="bookingId" value={booking.id} />
                <input type="hidden" name="payerId" value={player.playerId} />
                <input type="hidden" name="amount" value={player.due} />
              </ActionForm>
            ) : null}
            <RemovePlayerForm matchId={matchId} playerId={player.playerId} action={actions.removeFromMatch} onDone={onDone} />
          </li>
        ))}
      </ul>
      <CancelMatchForm matchId={matchId} action={actions.cancelMatch} onDone={onDone} />
    </div>
  )
}
```
(imports: `type GridBooking` from `@/lib/domain/grid`, `CancelMatchForm, RemovePlayerForm` from `./match-staff-actions`).

`app/(club)/club/grilla/actions.ts`:
```ts
export async function recordCash(_previous: ActionState, form: FormData): Promise<ActionState> {
  const bookingId = readUuid(form, 'bookingId')
  const amount = readInt(form, 'amount', { min: 1, max: 10_000_000 })
  const hasPayer = form.get('payerId') !== null
  const payerId = hasPayer ? readUuid(form, 'payerId') : null
  if (!bookingId || amount === null || (hasPayer && !payerId)) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('record_cash', {
    p_booking_id: bookingId,
    p_amount: amount,
    ...(payerId ? { p_payer_id: payerId } : {}),
  })
  revalidateBookings()
  return fromRpc(error, 'Pago en efectivo registrado.')
}

export async function cancelMatch(_previous: ActionState, form: FormData): Promise<ActionState> {
  const matchId = readUuid(form, 'matchId')
  if (!matchId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_match', {
    p_match_id: matchId,
    p_note: readText(form, 'note', { maxLength: 120 }) ?? undefined,
  })
  revalidateBookings()
  return fromRpc(error, 'Partido cancelado. Si tenía cancha, quedó libre.')
}

export async function removeFromMatch(_previous: ActionState, form: FormData): Promise<ActionState> {
  const matchId = readUuid(form, 'matchId')
  const playerId = readUuid(form, 'playerId')
  if (!matchId || !playerId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('remove_from_match', { p_match_id: matchId, p_player_id: playerId })
  revalidateBookings()
  return fromRpc(error, 'Sacamos al jugador. El partido vuelve a buscar gente.')
}
```
(the old `recordCash` is replaced).

`app/(club)/club/grilla/page.tsx`: import `cancelMatch` and `removeFromMatch` from `./actions`, `FormingMatchesPanel`, `loadFreeCourts` (`@/lib/data/matches`), `riskOf` and `timeIn`; compute the panel items and replace the `<ClubBoard … />` element with the board and the panel side by side:
```tsx
  const forming = grid.matches.filter((match) => match.status === 'forming')
  const freeCourts = await loadFreeCourts(club, forming)
  const panelItems = forming.map((match) => ({
    match,
    timeText: timeIn(match.startsAt, club.timezone),
    risk: riskOf(match, freeCourts.get(match.id) ?? []),
  }))
```
```tsx
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <ClubBoard
          key={date}
          date={date}
          dayText={dayLongLabel(date)}
          timezone={club.timezone}
          grid={grid}
          members={members}
          acceptsCash={club.accepts_cash}
          loadAction={loadSlot}
          detailActions={{
            cancel: cancelBooking,
            unblock: unblockCourt,
            cash: recordCash,
            endSeries,
            cancelMatch,
            removeFromMatch,
          }}
        />
        <FormingMatchesPanel items={panelItems} actions={{ cancelMatch, removeFromMatch }} />
      </div>
```
`app/(club)/club/grilla/club-board.tsx` needs no change beyond the `DetailActions` type it already forwards.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/components/club tests/unit/lib/actions/server-actions.test.ts
npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/club "app/(club)/club/grilla" tests/unit/components/club tests/unit/lib/actions/server-actions.test.ts
git commit -m "feat(grilla): open matches, cash per player and forming matches panel"
```

---

### Task 32: Cobros por jugador

**Files:**
- Modify: `lib/domain/payments-overview.ts`, `lib/data/payments.ts`, `app/(club)/club/cobros/page.tsx`
- Test: `tests/unit/lib/domain/payments-overview.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/lib/domain/payments-overview.test.ts`:
```ts
describe('open matches in Cobros', () => {
  const slots = [
    { position: 1, player_id: 'a', player: { display_name: 'Ana' } },
    { position: 2, player_id: 'b', player: { display_name: 'Bruno' } },
  ]
  const matchBooking = (overrides: Partial<OverviewBooking> = {}): OverviewBooking => ({
    id: 'mb',
    starts_at: '2026-09-28T23:00:00Z',
    price: 1600,
    status: 'confirmed',
    guest_name: null,
    player: null,
    court: { name: 'Cancha 2' },
    match_id: 'm1',
    match: { slots },
    payments: [{ id: 'p1', status: 'confirmed', amount: 400, payer_id: 'a', payer: { display_name: 'Ana' } }],
    ...overrides,
  })

  it('lists each player who still owes his share', () => {
    expect(unpaidBookings([matchBooking()])).toEqual([
      { bookingId: 'mb', holder: 'Bruno', startsAt: new Date('2026-09-28T23:00:00Z'), courtName: 'Cancha 2', due: 400, payerId: 'b' },
    ])
  })

  it('names who paid what the club has to give back', () => {
    expect(refundsDue([matchBooking({ status: 'cancelled' })])).toEqual([
      { paymentId: 'p1', holder: 'Ana', startsAt: new Date('2026-09-28T23:00:00Z'), courtName: 'Cancha 2', amount: 400 },
    ])
  })

  it('gives back what a player paid before the club took him out', () => {
    const left = matchBooking({ match: { slots: [{ position: 2, player_id: 'b', player: { display_name: 'Bruno' } }] } })
    expect(leftPlayerRefunds([left])).toEqual([
      { paymentId: 'p1', holder: 'Ana', startsAt: new Date('2026-09-28T23:00:00Z'), courtName: 'Cancha 2', amount: 400 },
    ])
    expect(leftPlayerRefunds([matchBooking()])).toEqual([])
  })
})
```
(add `leftPlayerRefunds` to the import).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/domain/payments-overview.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`lib/domain/payments-overview.ts` (import `matchPlayerPayments, type SlotHolder` from `./match-payments`):
```ts
export type OverviewPayment = {
  id: string
  status: PaymentStatus
  amount: number
  payer_id?: string | null
  payer?: { display_name: string } | null
}

export type OverviewBooking = HolderRow & {
  id: string
  starts_at: string | null
  price: number
  status: 'confirmed' | 'cancelled'
  court: { name: string } | null
  match_id?: string | null
  match?: { slots: SlotHolder[] } | null
  payments: OverviewPayment[]
}

export type UnpaidItem = { bookingId: string; holder: string; startsAt: Date; courtName: string; due: number; payerId?: string }

const payerName = (payment: OverviewPayment, booking: OverviewBooking) => payment.payer?.display_name ?? holderLabel(booking)

// Played bookings whose confirmed payments do not cover the price yet; in a match, each player
// who has not covered his share.
export function unpaidBookings(played: OverviewBooking[]): UnpaidItem[] {
  return played.flatMap((booking) => {
    const base = { bookingId: booking.id, startsAt: toDate(booking.starts_at), courtName: booking.court?.name ?? '' }
    if (booking.match_id && booking.match) {
      const payments = booking.payments.map((payment) => ({ ...payment, payer_id: payment.payer_id ?? null }))
      return matchPlayerPayments(booking, booking.match.slots, payments)
        .filter((player) => player.state === 'pending')
        .map((player) => ({ ...base, holder: player.name, due: player.due, payerId: player.playerId }))
    }
    if (paymentState(booking, booking.payments) !== 'pending') return []
    return [{ ...base, holder: holderLabel(booking), due: amountDue(booking.price, booking.payments) }]
  })
}

// Money the club took for bookings that were cancelled afterwards: reception gives it back by hand.
export function refundsDue(cancelled: OverviewBooking[]): RefundItem[] {
  return cancelled.flatMap((booking) =>
    booking.payments
      .filter((payment) => payment.status === 'confirmed')
      .map((payment) => ({
        paymentId: payment.id,
        holder: payerName(payment, booking),
        startsAt: toDate(booking.starts_at),
        courtName: booking.court?.name ?? '',
        amount: payment.amount,
      })),
  )
}

// Confirmed payments of players who are no longer in a match that still goes on.
export function leftPlayerRefunds(matchBookings: OverviewBooking[]): RefundItem[] {
  return matchBookings.flatMap((booking) => {
    const inMatch = new Set((booking.match?.slots ?? []).flatMap((slot) => (slot.player_id ? [slot.player_id] : [])))
    return booking.payments
      .filter((payment) => payment.status === 'confirmed' && payment.payer_id && !inMatch.has(payment.payer_id))
      .map((payment) => ({
        paymentId: payment.id,
        holder: payerName(payment, booking),
        startsAt: toDate(booking.starts_at),
        courtName: booking.court?.name ?? '',
        amount: payment.amount,
      }))
  })
}
```

`lib/data/payments.ts`:
- one select for both booking lists:
```ts
const BOOKING_SELECT =
  'id, starts_at, price, status, guest_name, match_id, court:courts(name), player:profiles!bookings_player_id_fkey(display_name), match:open_matches!bookings_match_id_fkey(slots:match_slots(position, player_id, player:profiles(display_name))), payments(id, status, amount, payer_id, payer:profiles!payments_payer_id_fkey(display_name))'
```
used by `played` and `cancelled`;
- the reported-transfers select adds `payer:profiles!payments_payer_id_fkey(display_name)` and `holder` becomes `payment.payer?.display_name ?? (payment.booking ? holderLabel(payment.booking) : 'Sin nombre')`;
- a fourth query for confirmed match bookings:
```ts
    supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('club_id', club.id)
      .eq('status', 'confirmed')
      .not('match_id', 'is', null)
      .gt('starts_at', since),
```
and `refunds: [...refundsDue(cancelled.data), ...leftPlayerRefunds(matchBookings.data)]`.

`app/(club)/club/cobros/page.tsx`: the unpaid list uses `key={`${item.bookingId}-${item.payerId ?? ''}`}` and adds `{item.payerId ? <input type="hidden" name="payerId" value={item.payerId} /> : null}` inside its cash form.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/lib/domain/payments-overview.test.ts tests/unit/app/cobros
npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/payments-overview.ts lib/data/payments.ts "app/(club)/club/cobros/page.tsx" tests/unit/lib/domain/payments-overview.test.ts
git commit -m "feat(cobros): shares, transfers and refunds per match player"
```

---

### Task 33: Ajustes: horas para cerrar partidos incompletos

**Files:**
- Modify: `lib/domain/settings.ts`, `app/(club)/club/ajustes/page.tsx`
- Test: `tests/unit/lib/domain/settings.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/unit/lib/domain/settings.test.ts`: add `['match_close_hours', '3'],` to `PROTOTYPE`, `match_close_hours: 3,` to the expected value of "reads the prototype settings", and:
```ts
  it('keeps the closing time of incomplete matches between 0 and 48 hours', () => {
    expect(parseClubSettings(form(replacing('match_close_hours', '49')))).toEqual({
      ok: false,
      message: 'Las horas para cerrar partidos van de 0 a 48.',
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/settings.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`lib/domain/settings.ts`: `ClubSettings` gains `match_close_hours: number`; in `parseClubSettings`, after `maxActive`:
```ts
  const matchCloseHours = readInt(form, 'match_close_hours', { min: 0, max: 48 })
  if (matchCloseHours === null) return fail('Las horas para cerrar partidos van de 0 a 48.')
```
and `match_close_hours: matchCloseHours,` in the returned value.

`app/(club)/club/ajustes/page.tsx`: inside the settings grid, after "Reservas activas por jugador":
```tsx
              <Field label="Horas antes para cerrar partidos incompletos" htmlFor="match_close_hours">
                <input id="match_close_hours" name="match_close_hours" type="number" min={0} max={48}
                  defaultValue={club.match_close_hours} className={inputClasses} />
              </Field>
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/lib/domain/settings.test.ts
npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/settings.ts "app/(club)/club/ajustes/page.tsx" tests/unit/lib/domain/settings.test.ts
git commit -m "feat(ajustes): closing time of incomplete matches"
```

---

### Task 34: Verificación del corte 6

**Files:** ninguno.

- [ ] **Step 1: Todo en verde y push**

Run:
```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
git push
```
Expected: todo en verde (los tres flujos de la fase 1 siguen pasando con la grilla y los cobros nuevos).

---

## Corte 7: Sugerencias

### Task 35: `match_suggestions` en la base

**Files:**
- Create: `supabase/tests/database/match_suggestions.test.sql`
- Create: `supabase/migrations/20260930000500_match_suggestions.sql`
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: Write the failing test** (con Write)

`supabase/tests/database/match_suggestions.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(7);

-- S: a week from today at 20:00 (same weekday as today), court 1, mixed 4th to 6th; Ana on spot 1.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(7, '20:00', 90), array['00000000-0000-0000-0000-0000000000a1', null, null, null]::uuid[],
  'mixed', 4, 6);
-- S2: a confirmed match, nothing to suggest.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(8, '20:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4']::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002');

-- Bruno is usually free on that weekday at night.
insert into public.player_availability (user_id, weekday, band)
values ('00000000-0000-0000-0000-0000000000b1', extract(dow from test_helpers.today())::smallint, 'night');
-- Hugo played there a week ago at 20:00 and prefers court 1.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(-7, '20:00', 90), '00000000-0000-0000-0000-0000000000a3');
insert into public.player_preferred_courts (user_id, court_id)
values ('00000000-0000-0000-0000-0000000000a3', 'c0000000-0000-0000-0000-000000000001');
-- Iván would fit and is usually free, but he has a booking at that time.
insert into public.player_availability (user_id, weekday, band)
values ('00000000-0000-0000-0000-0000000000a4', extract(dow from test_helpers.today())::smallint, 'night');
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(7, '20:00', 90), '00000000-0000-0000-0000-0000000000a4');
-- Juli would fit and is usually free, but her profile is private.
update public.profiles set is_public = false where id = '00000000-0000-0000-0000-0000000000a5';
insert into public.player_availability (user_id, weekday, band)
values ('00000000-0000-0000-0000-0000000000a5', extract(dow from test_helpers.today())::smallint, 'night');
-- Gabi fits but has no history and no availability: no reason to suggest her.

set local role authenticated;

-- Ana, in the match
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select results_eq(
  $$ select display_name, spot::int, exact_side, times_played, usually_free, prefers_court, score
     from public.match_suggestions('e1000000-0000-0000-0000-000000000001') $$,
  $$ values ('Bruno', 2, true, 0, true, false, 50), ('Hugo', 3, true, 1, false, true, 43) $$,
  'members who fit a free spot, are free and have a reason, best first');
select is_empty(
  $$ select * from public.match_suggestions('e1000000-0000-0000-0000-000000000002') $$,
  'a confirmed match has no suggestions');
select throws_ok(
  $$ select * from public.match_suggestions('e1000000-0000-0000-0000-00000000dead') $$,
  'P0001', 'not_found', 'the match has to exist');

-- Juli, member outside the match
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
select throws_ok(
  $$ select * from public.match_suggestions('e1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'only the players of the match and staff ask for suggestions');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select is((select count(*)::int from public.match_suggestions('e1000000-0000-0000-0000-000000000001')), 2,
  'staff get them too');

-- Anonymous visitor
set local role anon;
select throws_ok(
  $$ select * from public.match_suggestions('e1000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'anon cannot ask for suggestions');

reset role;
select is(
  (select proargnames from pg_proc where proname = 'match_suggestions'),
  array['p_match_id', 'player_id', 'display_name', 'side', 'category', 'spot', 'exact_side', 'times_played',
        'usually_free', 'prefers_court', 'score'],
  'the answer carries names and reasons, never the availability or history rows');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/match_suggestions.test.sql`
Expected: FAIL (`function public.match_suggestions(uuid) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260930000500_match_suggestions.sql`:
```sql
-- "Invitá a quien le puede servir": members who fit a free spot of a forming match (category, type,
-- side), are free at that time and are not in it, and who usually play then (same weekday and time,
-- bookings and confirmed matches already played) or said they are usually free then. Only the
-- players of the match and staff ask. The answer carries a name, side, category, the suggested spot
-- and the reasons as flags with a score, never the availability or history rows. Private profiles are
-- never suggested.

-- Same split as dayBandOf in lib/domain/availability.ts.
create function private.day_band_of(p_time time)
returns public.day_band
language sql
immutable
set search_path = ''
as $$
  select case
    when p_time < '13:00' then 'morning'
    when p_time < '18:00' then 'afternoon'
    else 'night'
  end::public.day_band;
$$;

create function public.match_suggestions(p_match_id uuid)
returns table (
  player_id uuid,
  display_name text,
  side public.player_side,
  category smallint,
  spot smallint,
  exact_side boolean,
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
  v_match public.open_matches;
  v_timezone text;
  v_local timestamp;
  v_band public.day_band;
begin
  select * into v_match from public.open_matches where id = p_match_id;
  if not found then
    perform private.fail('not_found');
  end if;
  if not (private.is_match_player(v_match.id) or private.is_staff(v_match.club_id)) then
    perform private.fail('forbidden');
  end if;
  if v_match.status <> 'forming' then
    return;
  end if;

  select timezone into v_timezone from public.clubs where id = v_match.club_id;
  v_local := v_match.starts_at at time zone v_timezone;
  v_band := private.day_band_of(v_local::time);

  return query
  with open_spots as (
    select s.position, s.side from public.match_slots s
    where s.match_id = v_match.id and s.player_id is null
  ),
  candidates as (
    select p.id, p.display_name, p.side, m.category,
      (select o.position from open_spots o
        where private.match_fit(p.id, v_match, o.side) is null
        order by (o.side = p.side) desc, o.position
        limit 1) as spot
    from public.club_members m
    join public.profiles p on p.id = m.user_id
    where m.club_id = v_match.club_id
      and p.is_public
      and not exists (select 1 from public.match_slots s where s.match_id = v_match.id and s.player_id = p.id)
      and not private.is_busy(p.id, v_match.period)
  ),
  scored as (
    select c.id, c.display_name, c.side, c.category, c.spot,
      c.side = (select o.side from open_spots o where o.position = c.spot) as exact_side,
      ((select count(*) from public.bookings b
         where b.player_id = c.id and b.club_id = v_match.club_id and b.status = 'confirmed' and b.starts_at < now()
           and extract(dow from b.starts_at at time zone v_timezone) = extract(dow from v_local)
           and (b.starts_at at time zone v_timezone)::time = v_local::time)
       + (select count(*) from public.match_slots s
         join public.open_matches om on om.id = s.match_id
         where s.player_id = c.id and om.club_id = v_match.club_id and om.status = 'confirmed' and om.starts_at < now()
           and extract(dow from om.starts_at at time zone v_timezone) = extract(dow from v_local)
           and (om.starts_at at time zone v_timezone)::time = v_local::time))::integer as times_played,
      exists (
        select 1 from public.player_availability a
        where a.user_id = c.id and a.weekday = extract(dow from v_local)::smallint and a.band = v_band
      ) as usually_free,
      exists (
        select 1 from public.player_preferred_courts pc
        where pc.user_id = c.id and pc.court_id = v_match.preferred_court_id
      ) as prefers_court
    from candidates c
    where c.spot is not null
  )
  select s.id, s.display_name, s.side, s.category, s.spot, s.exact_side, s.times_played, s.usually_free,
         s.prefers_court,
         (case when s.exact_side then 30 else 18 end
          + least(25, s.times_played * 5)
          + case when s.usually_free then 20 else 0 end
          + case when s.prefers_court then 8 else 0 end)::integer
  from scored s
  where s.times_played > 0 or s.usually_free
  order by 10 desc, s.display_name
  limit 6;
end;
$$;

revoke all on function private.day_band_of(time) from public;
revoke execute on function public.match_suggestions(uuid) from public, anon;
grant execute on function public.match_suggestions(uuid) to authenticated;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/match_suggestions.test.sql
npm run test:db
npm run db:types
npm run typecheck
```
Expected: PASS; `match_suggestions` aparece en `Functions` con sus columnas.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260930000500_match_suggestions.sql supabase/tests/database/match_suggestions.test.sql lib/supabase/database.types.ts
git commit -m "feat(db): match suggestions for players and staff"
```

---

### Task 36: "Invitá a quien le puede servir"

**Files:**
- Create: `lib/domain/match-suggestions.ts`, `components/matches/suggestions-list.tsx`
- Modify: `lib/data/matches.ts`, `app/(jugador)/partidos/[id]/page.tsx`
- Test: `tests/unit/lib/domain/match-suggestions.test.ts`, `tests/unit/components/matches/suggestions-list.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/unit/lib/domain/match-suggestions.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { TIMEZONE } from '../../fixtures/grid'
import { makeMatch } from '../../fixtures/matches'
import { inviteText, toSuggestion, type SuggestionRow } from '@/lib/domain/match-suggestions'

const ROW: SuggestionRow = {
  player_id: 'b',
  display_name: 'Bruno Díaz',
  category: 6,
  spot: 2,
  exact_side: true,
  times_played: 3,
  usually_free: true,
  prefers_court: true,
  score: 83,
}

describe('toSuggestion', () => {
  it('turns the flags into reasons, in Spanish', () => {
    expect(toSuggestion(ROW, { match: makeMatch(), timezone: TIMEZONE })).toEqual({
      playerId: 'b',
      name: 'Bruno Díaz',
      score: 83,
      chips: [
        { text: 'Juega de revés', hit: true },
        { text: '6ª categoría', hit: false },
        { text: 'Jugó 3 veces los jueves a las 20:00', hit: true },
        { text: 'Suele estar libre los jueves de noche', hit: true },
        { text: 'Prefiere la Cancha 1', hit: false },
      ],
    })
  })

  it('says when he plays both sides or played once', () => {
    const view = toSuggestion(
      { ...ROW, exact_side: false, times_played: 1, usually_free: false, prefers_court: false },
      { match: makeMatch(), timezone: TIMEZONE },
    )
    expect(view.chips.map((chip) => chip.text)).toEqual([
      'Juega en los dos lados',
      '6ª categoría',
      'Jugó 1 vez los jueves a las 20:00',
    ])
  })
})

describe('inviteText', () => {
  it('greets by first name before the match message', () => {
    expect(inviteText('Bruno Díaz', 'Falta 1')).toBe('Hola Bruno! Te paso este partido, por si te sirve:\n\nFalta 1')
  })
})
```

`tests/unit/components/matches/suggestions-list.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SuggestionsList } from '@/components/matches/suggestions-list'

describe('SuggestionsList', () => {
  it('shows each suggestion with its reasons and a WhatsApp invite', () => {
    render(
      <SuggestionsList
        shareText="Falta 1"
        suggestions={[{ playerId: 'b', name: 'Bruno Díaz', score: 50, chips: [{ text: 'Juega de revés', hit: true }] }]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Invitá a quien le puede servir' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Por qué Bruno Díaz' })).toHaveTextContent('Juega de revés')
    expect(screen.getByRole('link', { name: 'Invitar a Bruno Díaz por WhatsApp' }).getAttribute('href')).toContain(
      encodeURIComponent('Hola Bruno!'),
    )
  })

  it('suggests sharing in the group when nobody fits', () => {
    render(<SuggestionsList shareText="Falta 1" suggestions={[]} />)
    expect(screen.getByText(/Compartilo en el grupo del club/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/domain/match-suggestions.test.ts tests/unit/components/matches/suggestions-list.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`lib/domain/match-suggestions.ts`:
```ts
import { DAY_BAND_WORDS, dayBandOf } from './availability'
import { SLOT_SIDE_WORDS, type Match } from './matches'
import { firstName } from './profile'
import { formatMinutes, localDateOf, minutesOfDay, weekdayOf } from './time'

export const WEEKDAYS_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'] as const

// A row of match_suggestions (the columns this module reads).
export type SuggestionRow = {
  player_id: string
  display_name: string
  category: number
  spot: number
  exact_side: boolean
  times_played: number
  usually_free: boolean
  prefers_court: boolean
  score: number
}
export type Chip = { text: string; hit: boolean }
export type SuggestionView = { playerId: string; name: string; score: number; chips: Chip[] }

// Prototype: suggestions. "hit" marks the reasons that weigh the most.
export function toSuggestion(row: SuggestionRow, context: { match: Match; timezone: string }): SuggestionView {
  const { match, timezone } = context
  const minutes = minutesOfDay(match.startsAt, timezone)
  const days = WEEKDAYS_PLURAL[weekdayOf(localDateOf(match.startsAt, timezone))]
  const spotSide = match.slots.find((slot) => slot.position === row.spot)?.side ?? 'drive'
  const chips: Chip[] = [
    row.exact_side ? { text: `Juega de ${SLOT_SIDE_WORDS[spotSide]}`, hit: true } : { text: 'Juega en los dos lados', hit: false },
    { text: `${row.category}ª categoría`, hit: false },
  ]
  if (row.times_played > 0) {
    const times = row.times_played === 1 ? '1 vez' : `${row.times_played} veces`
    chips.push({ text: `Jugó ${times} los ${days} a las ${formatMinutes(minutes)}`, hit: row.times_played >= 3 })
  }
  if (row.usually_free) chips.push({ text: `Suele estar libre los ${days} ${DAY_BAND_WORDS[dayBandOf(minutes)]}`, hit: true })
  if (row.prefers_court) chips.push({ text: `Prefiere la ${match.preferredCourtName}`, hit: false })
  return { playerId: row.player_id, name: row.display_name, score: row.score, chips }
}

// The app has no phone numbers: WhatsApp opens with the message and the player picks the contact.
export function inviteText(name: string, share: string): string {
  return `Hola ${firstName(name)}! Te paso este partido, por si te sirve:\n\n${share}`
}
```

`components/matches/suggestions-list.tsx`:
```tsx
import { buttonClasses } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { whatsappUrl } from '@/lib/domain/match-share'
import { inviteText, type SuggestionView } from '@/lib/domain/match-suggestions'

export function SuggestionsList({ suggestions, shareText }: { suggestions: SuggestionView[]; shareText: string }) {
  return (
    <section aria-labelledby="invita" className="flex flex-col gap-3">
      <h2 id="invita" className="font-display text-2xl font-bold uppercase">
        Invitá a quien le puede servir
      </h2>
      <p className="text-sm text-fg-muted">
        Cumplen la categoría y el lado que falta, y suelen jugar o estar libres a esta hora.
      </p>
      {suggestions.length === 0 ? (
        <p className="rounded-xl border border-border p-4 text-fg-muted">
          No encontramos jugadores disponibles con ese perfil. Compartilo en el grupo del club.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {suggestions.map((suggestion) => (
            <li key={suggestion.playerId} className="flex flex-col gap-2 rounded-xl border border-border p-3">
              <p className="font-semibold">{suggestion.name}</p>
              <ul aria-label={`Por qué ${suggestion.name}`} className="flex flex-wrap gap-1">
                {suggestion.chips.map((chip) => (
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
              <a
                href={whatsappUrl(inviteText(suggestion.name, shareText))}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Invitar a ${suggestion.name} por WhatsApp`}
                className={buttonClasses({ variant: 'secondary' })}
              >
                Invitar por WhatsApp
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

`lib/data/matches.ts`, add (importing `toSuggestion, type SuggestionView` from `@/lib/domain/match-suggestions`):
```ts
export async function loadSuggestions(club: Club, match: Match): Promise<SuggestionView[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('match_suggestions', { p_match_id: match.id })
  if (error) throw error
  return data.map((row) => toSuggestion(row, { match, timezone: club.timezone }))
}
```

`app/(jugador)/partidos/[id]/page.tsx`: compute the share text once, load suggestions for players of the match and staff, and pass the list as the board's children:
```tsx
  const share = shareText({ match, clubName: club.name, dayText, time, url: `${getSiteUrl()}/partidos/${match.id}` })
  const suggestions =
    match.status === 'forming' && (isInMatch(match, viewer.userId) || isStaffRole(viewer.membership.role))
      ? await loadSuggestions(club, match)
      : null
```
```tsx
        shareText={share}
        …
      >
        {suggestions ? <SuggestionsList suggestions={suggestions} shareText={share} /> : null}
      </MatchBoard>
```
(imports: `isInMatch` from `@/lib/domain/matches`, `isStaffRole` from `@/lib/domain/profile`, `loadSuggestions`, `SuggestionsList`).

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/lib/domain/match-suggestions.test.ts tests/unit/components/matches
npm run typecheck
npm run lint
```
Expected: PASS.

- [ ] **Step 5: Commit and push**

```bash
git add lib/domain/match-suggestions.ts components/matches/suggestions-list.tsx lib/data/matches.ts "app/(jugador)/partidos/[id]/page.tsx" tests/unit/lib/domain/match-suggestions.test.ts tests/unit/components/matches/suggestions-list.test.tsx
git commit -m "feat(matches): suggest who to invite"
git push
```

---

## Corte 8: Realtime y e2e

### Task 37: Partidos en vivo

**Files:**
- Create: `supabase/tests/database/realtime_matches.test.sql`
- Create: `supabase/migrations/20260930000600_realtime_matches.sql`
- Modify: `components/live/live-occupancy.tsx`
- Test: `tests/unit/components/live/live-occupancy.test.tsx`

- [ ] **Step 1: Write the failing tests**

`supabase/tests/database/realtime_matches.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('open_matches', 'match_slots')),
  2, 'match and spot changes are published to Realtime');
select is(
  (select array_agg(relreplident::text order by relname) from pg_class
   where oid in ('public.open_matches'::regclass, 'public.match_slots'::regclass)),
  array['d', 'd'], 'both keep the default replica identity');

select * from finish();
rollback;
```

In `tests/unit/components/live/live-occupancy.test.tsx`, rename "listens to new occupancies of its club and to any removal" to "listens to occupancies, matches and spots of its club" and add:
```ts
    expect(mocks.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'open_matches', filter: 'club_id=eq.club-1' },
      expect.any(Function),
    )
    expect(mocks.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'match_slots', filter: 'club_id=eq.club-1' },
      expect.any(Function),
    )
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx supabase test db supabase/tests/database/realtime_matches.test.sql
npx vitest run tests/unit/components/live/live-occupancy.test.tsx
```
Expected: FAIL en los dos.

- [ ] **Step 3: Write the migration and the listener**

`supabase/migrations/20260930000600_realtime_matches.sql`:
```sql
-- The match screens, Inicio, Reservar and the club grid reload when a match or one of its spots
-- changes. Realtime applies the select policies (members of the club) to the rows it streams; these
-- tables carry nothing a member may not read. Matches and spots are never deleted by the app.
alter publication supabase_realtime add table public.open_matches, public.match_slots;
```

`components/live/live-occupancy.tsx`: update the comment ("…when a court is taken or freed, or a match changes…") and add after the `DELETE` listener:
```ts
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'open_matches', filter: `club_id=eq.${clubId}` },
          reload,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'match_slots', filter: `club_id=eq.${clubId}` },
          reload,
        )
```
(`setAuth` before `subscribe` stays exactly as it is: without it the channel joins as `anon`, which reads none of these tables.)

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/realtime_matches.test.sql
npx vitest run tests/unit/components/live/live-occupancy.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260930000600_realtime_matches.sql supabase/tests/database/realtime_matches.test.sql components/live/live-occupancy.tsx tests/unit/components/live/live-occupancy.test.tsx
git commit -m "feat(realtime): reload on match and spot changes"
```

---

### Task 38: Soporte e2e para partidos

**Files:**
- Create: `tests/e2e/support/matches.ts`
- Modify: `tests/e2e/support/global-setup.ts`

`# (no test — soporte de los e2e; lo ejercitan las Tasks 39–41)`

- [ ] **Step 1: Write the helpers**

`tests/e2e/support/matches.ts`:
```ts
import { parseTime, zonedTime, type LocalDate } from '../../../lib/domain/time'
import { adminClient, clubRow, signedInClient, type TestUser } from './admin'

// Creates, as the player and through create_match, a match on the club's first active court.
export async function createMatchAs(
  user: TestUser,
  input: {
    day: LocalDate
    time: string
    side: 'drive' | 'backhand'
    type?: 'male' | 'female' | 'mixed'
    categoryMin?: number
    categoryMax?: number
  },
): Promise<string> {
  const admin = adminClient()
  const club = await clubRow(admin)
  const { data: courts, error } = await admin
    .from('courts')
    .select('id')
    .eq('club_id', club.id)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  const client = await signedInClient(user)
  const created = await client.rpc('create_match', {
    p_court_id: courts[0].id,
    p_starts_at: zonedTime(input.day, parseTime(input.time), club.timezone).toISOString(),
    p_allow_other_court: true,
    p_category_min: input.categoryMin ?? 1,
    p_category_max: input.categoryMax ?? 8,
    p_match_type: input.type ?? 'mixed',
    p_side: input.side,
  })
  if (created.error) throw created.error
  return created.data.id
}

export async function joinMatchAs(user: TestUser, matchId: string, position: number): Promise<void> {
  const client = await signedInClient(user)
  const { error } = await client.rpc('join_match', { p_match_id: matchId, p_position: position })
  if (error) throw error
}

// The simulated clock of the closing test: the match now starts in `minutes`, inside its closing window.
export async function moveMatchStart(matchId: string, minutes: number): Promise<void> {
  const start = new Date(Date.now() + minutes * 60_000)
  const end = new Date(start.getTime() + 90 * 60_000)
  const { error } = await adminClient()
    .from('open_matches')
    .update({ period: `[${start.toISOString()},${end.toISOString()})` })
    .eq('id', matchId)
  if (error) throw error
}
```

- [ ] **Step 2: Clean up matches between runs**

In `tests/e2e/support/global-setup.ts`, after reading `seriesIds`:
```ts
  const [spots, created] = await Promise.all([
    admin.from('match_slots').select('match_id').in('player_id', ids),
    admin.from('open_matches').select('id').in('created_by', ids),
  ])
  if (spots.error) throw spots.error
  if (created.error) throw created.error
  const matchIds = [...new Set([...spots.data.map((row) => row.match_id), ...created.data.map((row) => row.id)])]
```
add `if (matchIds.length > 0) filters.push(`match_id.in.(${matchIds.join(',')})`)` next to the series filter, and after deleting the series:
```ts
  if (matchIds.length > 0) await check(admin.from('open_matches').delete().in('id', matchIds))
```
(Bookings go first, which clears `open_matches.booking_id`; then the matches, whose spots go with them; then the occupancies, as before.)

- [ ] **Step 3: Check and commit**

Run: `npm run typecheck && npm run test:e2e`
Expected: typecheck en verde; los flujos existentes siguen pasando y la limpieza no falla.

```bash
git add tests/e2e/support/matches.ts tests/e2e/support/global-setup.ts
git commit -m "test(e2e): match helpers and cleanup"
```

---

### Task 39: Flujo 1: armar, completar y ver la cancha en la grilla

**Files:**
- Create: `tests/e2e/open-match.spec.ts`

- [ ] **Step 1: Write the test**

`tests/e2e/open-match.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { joinMatchAs } from './support/matches'

test('a player creates a match, three more join and the court gets booked', async ({ page }) => {
  const club = await clubRow()
  const day = addDays(localDateOf(new Date(), club.timezone), 5)
  const ana = await createMember({ name: 'Ana Partido', prefix: 'partido-ana', side: 'drive' })
  const bruno = await createMember({ name: 'Bruno Partido', prefix: 'partido-bruno', side: 'backhand' })
  const carlos = await createMember({ name: 'Carlos Partido', prefix: 'partido-carlos', side: 'drive' })
  const diego = await createMember({ name: 'Diego Partido', prefix: 'partido-diego', side: 'backhand' })
  const reception = await createMember({ name: 'Recepción Partido', prefix: 'partido-recepcion', role: 'reception' })

  // Ana creates it from the app.
  await signInWithMagicLink(page, ana.email, '/partidos')
  await page.getByRole('button', { name: 'Armar partido' }).click()
  const sheet = page.getByRole('dialog', { name: 'Armar partido abierto' })
  await sheet.getByLabel('Día').selectOption(day)
  await sheet.getByLabel('Hora').selectOption('20:00')
  await sheet.getByRole('button', { name: 'Publicar partido' }).click()
  await expect(page).toHaveURL(/\/partidos\/[0-9a-f-]{36}$/)
  const matchId = new URL(page.url()).pathname.split('/').pop() ?? ''
  await expect(page.getByText('Faltan 3: 1 de drive y 2 de revés')).toBeVisible()

  // Two more join through the API.
  await joinMatchAs(bruno, matchId, 2)
  await joinMatchAs(carlos, matchId, 3)

  // Diego is the fourth, from the app: the court gets booked.
  await page.context().clearCookies()
  await signInWithMagicLink(page, diego.email, `/partidos/${matchId}`)
  await page.getByRole('button', { name: 'Sumarme de revés' }).click()
  const join = page.getByRole('dialog', { name: 'Sumarte de revés' })
  await expect(join).toContainText('Sos el cuarto')
  await join.getByRole('button', { name: 'Confirmar lugar' }).click()
  await expect(page.getByRole('status')).toContainText('Partido confirmado en la Cancha')

  // Reception sees the court taken by the match.
  await page.context().clearCookies()
  await signInWithMagicLink(page, reception.email, `/club/grilla?dia=${day}`)
  await expect(page.getByRole('button', { name: /, 20:00: Partido abierto$/ })).toBeVisible()
})
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/open-match.spec.ts`
Expected: PASS. Si falla, depurar con `/team-setup:execute` (systematic debugging), sin tocar el test salvo que el texto de la app haya cambiado a propósito.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/open-match.spec.ts
git commit -m "test(e2e): create a match, fill it and see the court booked"
```

---

### Task 40: Flujo 2: el link compartido sin sesión

**Files:**
- Create: `tests/e2e/match-link.spec.ts`

- [ ] **Step 1: Write the test**

`tests/e2e/match-link.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember, uniqueEmail } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { createMatchAs } from './support/matches'

test('someone opens a shared match link without a session, signs up and joins', async ({ page }) => {
  const club = await clubRow()
  const day = addDays(localDateOf(new Date(), club.timezone), 6)
  const pablo = await createMember({ name: 'Pablo Link', prefix: 'link-pablo', side: 'drive' })
  const matchId = await createMatchAs(pablo, { day, time: '20:00', side: 'drive' })

  // The link asks to sign in first.
  await page.goto(`/partidos/${matchId}`)
  await expect(page).toHaveURL(/\/auth\/ingreso/)
  await signInWithMagicLink(page, uniqueEmail('link-sofia'), `/partidos/${matchId}`)

  // A new account goes through the welcome form and comes back to the match.
  await expect(page).toHaveURL(/\/bienvenida/)
  await page.getByLabel('Nombre').fill('Sofía Link')
  await page.getByLabel('Lado').selectOption('Revés')
  await page.getByLabel('Mano').selectOption('Diestro')
  await page.getByLabel('Género').selectOption('Femenino')
  await page.getByLabel('Categoría').selectOption('5ª')
  await page.getByRole('button', { name: 'Guardar y seguir' }).click()
  await expect(page).toHaveURL(new RegExp(`/partidos/${matchId}$`))

  await page.getByRole('button', { name: 'Sumarme de revés' }).first().click()
  const join = page.getByRole('dialog', { name: 'Sumarte de revés' })
  await expect(join).toContainText('Pablo Link')
  await join.getByRole('button', { name: 'Confirmar lugar' }).click()
  await expect(page.getByRole('status')).toContainText('Te sumaste al partido.')
  await expect(page.getByRole('group', { name: 'Cancha con 2 de 4 jugadores' })).toContainText('Vos')
})
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/match-link.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/match-link.spec.ts
git commit -m "test(e2e): join a match from a shared link without a session"
```

---

### Task 41: Flujo 3: cierre automático de un partido incompleto

**Files:**
- Create: `tests/e2e/match-close.spec.ts`

- [ ] **Step 1: Write the test**

`tests/e2e/match-close.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { CANCEL_REASON_TEXT } from '../../lib/domain/matches'
import { addDays, localDateOf } from '../../lib/domain/time'
import { adminClient, clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { createMatchAs, moveMatchStart } from './support/matches'

test('an incomplete match is cancelled on its own at closing time', async ({ page }) => {
  const club = await clubRow()
  const day = addDays(localDateOf(new Date(), club.timezone), 2)
  const lucas = await createMember({ name: 'Lucas Cierre', prefix: 'cierre-lucas', side: 'drive' })
  const matchId = await createMatchAs(lucas, { day, time: '20:00', side: 'drive' })

  // Simulated clock: the match now starts in an hour, past its closing time; the job runs.
  await moveMatchStart(matchId, 60)
  const closed = await adminClient().rpc('close_matches')
  expect(closed.error).toBeNull()

  await signInWithMagicLink(page, lucas.email, `/partidos/${matchId}`)
  await expect(page.getByText(`Se canceló. ${CANCEL_REASON_TEXT.not_filled}`)).toBeVisible()
  await expect(page.getByText('Cancelado', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Compartir en WhatsApp' })).toHaveCount(0)
})
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/match-close.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit and push**

```bash
git add tests/e2e/match-close.spec.ts
git commit -m "test(e2e): incomplete matches close on their own"
git push
```

---

### Task 42: Cierre de la fase

**Files:**
- Modify: `docs/features/fase-2-partidos/notes.md`, `docs/features/fase-2-partidos/plan.md` (revisiones)

- [ ] **Step 1: Todo en verde**

Run:
```bash
npm run db:reset
npm run test:db
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```
Expected: todo PASS (pgTAP completo, Vitest, los seis flujos e2e).

- [ ] **Step 2: Revisión de disciplina**

Run `/team-setup:discipline-check` sobre la rama y arreglar lo que encuentre en commits aparte (con su test). Si algún arreglo toca la base, va en una migración nueva `20260930000700_*.sql`.

- [ ] **Step 3: Notas de ejecución**

Append to `docs/features/fase-2-partidos/notes.md` one dated entry per slice with the deviations from this plan (as in `../fase-1-reservas/notes.md`), and to the "Plan revisions" section of this file a `v3` line if the plan changed during execution.

```bash
git add docs/features/fase-2-partidos/notes.md docs/features/fase-2-partidos/plan.md
git commit -m "docs: fase 2 execution notes"
git push
```

- [ ] **Step 4: PR listo**

Run: `gh pr ready` y esperar CI en verde (`gh pr checks --watch`).
Expected: `quality` y `db-and-e2e` en verde.

- [ ] **Step 5: MANUAL (producción, después del merge)**

- MANUAL: SMTP propio en Supabase producción (p. ej. Resend) antes de probar con jugadores reales: sin él no llegan los enlaces de ingreso de quien abre el link compartido.
- MANUAL: confirmar que `migrate.yml` aplicó `20260930000100` a `20260930000600` y que existe el job (`select jobname, schedule from cron.job where jobname = 'close-open-matches'`).
- MANUAL: responder con Rustic las preguntas abiertas del diseño (3 h de cierre, tipos de partido) y ajustar "Horas antes para cerrar partidos incompletos" en Ajustes si hace falta.

---

## Acceptance criteria

- [ ] Un jugador arma un partido desde Partidos o desde una celda libre de Reservar; mientras se arma no ocupa cancha.
- [ ] Otro jugador se suma solo en un lugar de su lado si cumple categoría y tipo y no tiene nada a esa hora; si no puede, la pantalla dice por qué.
- [ ] Con el cuarto jugador la cancha se reserva en la misma transacción (la preferida u otra libre si el creador lo permitió); sin cancha, el partido se cancela y lo explica.
- [ ] Salir: armándose, cuando quiera; confirmado, con el aviso del club (vuelve a armarse y conserva la cancha hasta el cierre); quien ya pagó lo gestiona el club.
- [ ] Los partidos incompletos se cancelan solos a la hora de cierre (`match_close_hours`, 3 h por defecto, editable en Ajustes) y liberan la cancha retenida.
- [ ] El link compartido lleva a `/partidos/<id>` pasando por ingreso y bienvenida cuando hace falta.
- [ ] Cada jugador paga su parte (precio / 4, el resto en el lugar 1) en efectivo o por transferencia; Mis reservas y Cobros lo muestran por jugador.
- [ ] Inicio muestra "Partidos para vos" y "Tu próximo partido"; Perfil guarda género, disponibilidad y canchas preferidas.
- [ ] La grilla del club muestra partidos confirmados, "Armándose N/4 · no bloquea", el panel con el riesgo de cada partido, y permite cancelar un partido y sacar a un jugador.
- [ ] Las sugerencias solo las ven los jugadores del partido y el staff, y no exponen disponibilidad ni historial.
- [ ] Lista, detalle y grillas se actualizan en vivo; `anon` no ejecuta ninguna función.
- [ ] pgTAP, Vitest, lint, typecheck, build y los seis flujos e2e en verde en CI.

## Plan revisions

(append-only)

- **v1 (2026-09-29)**: scaffold.
- **v2 (2026-09-29)**: plan completo en 8 cortes (Tasks 1–42) sobre el diseño aprobado. Decisiones propias en "Decisiones que este plan toma".
