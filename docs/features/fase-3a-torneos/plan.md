---
feature: fase-3a-torneos
type: plan
status: in-progress
date: 2026-09-30
branch: feat/fase-3a-torneos
references: ./design.md, ../fase-2-partidos/plan.md, ../fase-2-partidos/notes.md, ../../plan-general.md
---

# Fase 3a (torneos americanos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/team-setup:execute` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que recepción cree un americano corto en Rustic bloqueando sus canchas, que los jugadores se anoten solos (con filtro de categoría y género) y paguen como una reserva, que recepción arme el fixture en la base, cargue los resultados y que todos vean el ranking en vivo.

**Architecture:** Igual que las fases 1 y 2: cada escritura es una función `security definer` de Postgres con `search_path = ''` y códigos de error estables (`private.fail`). `create_tournament` crea el torneo y una `court_occupancy` de tipo `tournament` por cancha en la misma transacción (la restricción de exclusión tiene la última palabra: `courts_busy`); `start_tournament` arma el fixture con el método del círculo en la misma transacción que pone el torneo en juego. Los pagos de inscripción usan la tabla `payments` (con `tournament_entry_id` en lugar de `booking_id`). Next.js lee con la sesión del usuario (RLS), el ranking y los textos salen de módulos puros de `lib/domain`, y las Server Actions validan con `lib/domain/input.ts` y traducen el error con `lib/actions/result.ts`.

**Tech Stack:** Next.js 16.3 (App Router, `proxy.ts`), React 19, TypeScript, Tailwind 4, Supabase (Postgres 17, Auth, Realtime, Storage), `@supabase/ssr`, Vitest + Testing Library, pgTAP, Playwright con Mailpit.

---

## Antes de empezar

- Rama: `feat/fase-3a-torneos` (sale de `main` con la fase 2 y el PR #6 mergeados). Commits chicos; cada corte termina en verde.
- Docker Desktop corriendo. El CLI de Supabase es devDependency: `npx supabase …` o los scripts de npm (`npm run test:db`, `npm run db:reset`, `npm run db:types`). No hay CLI global.
- Windows: **los archivos con barras invertidas (`\ir` en los tests pgTAP, regex) se escriben con la herramienta Write**, nunca con heredoc ni `sed`. Las rutas con paréntesis (`app/(jugador)/…`) van entre comillas en bash.
- Next 16: antes de usar una API de Next, leer su guía en `node_modules/next/dist/docs/01-app/` (ver `AGENTS.md`). Las usadas acá: rutas dinámicas con `params` como Promise (`03-api-reference/03-file-conventions/dynamic-routes.md`), `searchParams` como Promise (`03-api-reference/03-file-conventions/page.md`), `notFound` (`03-api-reference/04-functions/not-found.md`), `redirect` (`03-api-reference/04-functions/redirect.md`), Server Actions (`01-getting-started/07-mutating-data.md`).
- Producción: las migraciones llegan con el merge (`migrate.yml`). **Nunca** correr `supabase link`, `db push` ni nada contra producción desde la máquina local (Miguel corre los comandos de producción). Las migraciones ya aplicadas **no se editan**: todo cambio es una migración nueva (`create or replace`, o `drop` + `create` cuando cambia la firma).
- Migraciones nuevas: `supabase/migrations/20261001000200_*.sql` … `20261001000250_*.sql` (todas posteriores a `20261001000100_court_delete_guard.sql`).
- Docs en español; identificadores, comentarios de SQL y de código en inglés.
- pgTAP: un test se corre con `npx supabase test db supabase/tests/database/<archivo>.test.sql`; todos con `npm run test:db`. Los tests de torneos incluyen `\ir helpers/slot.psql`, `\ir helpers/club.psql`, `\ir helpers/match.psql` (géneros y más jugadores) y, desde esta fase, `\ir helpers/tournament.psql`.
- Cada migración nueva se aplica con `npm run db:reset` y después `npm run db:types` regenera `lib/supabase/database.types.ts`, que CI compara byte a byte.
- Datos del fixture pgTAP (club T, `helpers/club.psql` + `helpers/match.psql`): grilla 08:00–23:00 cada 90 min (08:00, 09:30 … 18:30 … 21:30), ventana de 14 días, 24 h de aviso, 2 reservas activas, precios 1200 y 1600 desde 18:30, zona `America/Montevideo`, canchas `c0000000-0000-0000-0000-000000000001` (Cancha 1) y `…0002` (Cancha 2). Personas: Ana `…a1` (jugadora, femenino, 5ª), Bruno `…b1` (masculino, 6ª), Gabi `…a2` (femenino, 5ª), Hugo `…a3` (masculino, 4ª), Iván `…a4` (masculino, 5ª), Juli `…a5` (femenino, 6ª), Carla `…c1` (recepción), Dani `…d1` (admin), Omar `…f1` (no es miembro). En este documento `…a1` abrevia `00000000-0000-0000-0000-0000000000a1`, `c…01` abrevia `c0000000-0000-0000-0000-000000000001`, y así con los demás; **en los archivos va siempre el uuid completo**.
- Soporte e2e (`tests/e2e/support`): `createMember`, `signedInClient`, `clubRow`, `signInWithMagicLink`; `localSupabase()` se niega a correr contra un Supabase que no sea local.
- jsdom: los file inputs se leen por `ref`; los `input type="date"` se cambian con `fireEvent.change`.

## Decisiones que este plan toma (y que el diseño no fijaba)

| Tema | Decisión | Por qué |
| --- | --- | --- |
| Horario del torneo | Columna `period tstzrange` con `starts_at` y `ends_at` generados (como `open_matches`), en lugar de solo `starts_at` | El fin queda guardado (lo calcula `create_tournament` con el cupo máximo) y `private.is_busy` y la grilla comparan rangos |
| Género | La columna se llama `match_type` (tipo `public.match_type`), igual que en `open_matches` | Un solo nombre para lo mismo en la base y en TypeScript (`type` en el dominio) |
| Parejas de cada partido | Cuatro columnas con FK: `a1_entry_id`, `a2_entry_id`, `b1_entry_id`, `b2_entry_id` (el diseño decía "dos `entry_id` cada uno") | Las FK garantizan que cada jugador del fixture es una inscripción del torneo; un array no se puede validar así |
| Hora de cada partido | `tournament_games.starts_at`, calculado por `start_tournament`: inicio + ((ronda − 1) × tandas + tanda − 1) × minutos por ronda | La pantalla muestra "18:20, Cancha 2" sin repetir la cuenta |
| Rondas al armar | `start_tournament` guarda `rounds = least(rounds, anotados − 1)` | Con 8 anotados en un torneo de cupo 16 no hay más de 7 rondas posibles |
| Canchas | `cardinality(court_ids) <= max_players / 4` | Con 8 jugadores hay 2 partidos por ronda: una tercera cancha quedaría bloqueada sin uso |
| Ocupación | La ocupación de cada cancha lleva `tournament_id` (FK, `on delete cascade`) y `note` = nombre del torneo | La grilla del club muestra el nombre sin cambios (usa `note`) y enlaza a la gestión; los miembros leen `tournament_id` (privilegio por columna), nunca `note` |
| Bajas | `tournament_entries.removed_at` / `removed_by` (baja lógica); índice único parcial "un jugador activo por torneo" | Los pagos de una inscripción dada de baja tienen que seguir existiendo para "A devolver" |
| Ocupado en los dos sentidos | `private.is_busy` también mira inscripciones activas en torneos no cancelados; `join_tournament` toma el mismo candado (`'book_slot:' \|\| uid`) | Nadie queda anotado en un torneo y en una reserva o partido a la misma hora, y `book_slot`, `create_match` y `join_match` lo respetan sin cambios |
| Errores extra | `outside_hours` ("el torneo tiene que empezar y terminar dentro del horario del club"), además de los siete del diseño | `not_aligned` habla de turnos de la grilla, que un torneo no sigue |
| Staff fuera de estado | `add_tournament_guest`, `remove_tournament_entry`, cerrar, reabrir, armar, cargar y finalizar fuera de su estado fallan con `invalid_state`; `tournament_closed` es para el jugador | El staff ve "cambió mientras tanto, recargá"; el jugador, que la inscripción cerró |
| Informar transferencia | `report_tournament_transfer(p_entry_id, p_receipt_path)`: el monto es lo que falta (precio − confirmados), como `report_transfer` (el diseño listaba un `amount`) | El jugador no tipea montos; una sola transferencia informada por inscripción |
| Efectivo | RPC propia `record_tournament_cash(p_entry_id, p_amount)`; `confirm_payment` se reescribe para aceptar pagos de inscripción | `record_cash` ya tiene dos formas (reserva y partido); una tercera con parámetros opcionales sería frágil |
| Pagos a devolver | Pagos confirmados de inscripciones dadas de baja o de torneos cancelados (últimos 30 días) | Misma regla que las reservas canceladas |
| Sin cobrar | Inscripciones activas de torneos que ya empezaron (últimos 30 días) sin pagar ni transferencia informada | Igual que "reservas jugadas sin pagar"; antes de empezar se cobra desde la gestión del torneo |
| Tiempo real | `tournaments`, `tournament_entries` y `tournament_games` en Realtime; `LiveOccupancy` los escucha con filtro `club_id` | El diseño pedía `tournament_games`; con las otras dos la lista ("5 de 8") y la gestión también se actualizan, sin costo extra |
| Mis reservas en Inicio | `MyBookingCard` pasa a `components/booking/`; la carga a `lib/data/my-bookings.ts`; Inicio muestra las próximas y, plegadas, "Pasadas y canceladas"; `/reservas` redirige a `/` | Cinco pestañas (Inicio, Reservar, Partidos, Torneos, Perfil) sin perder los pagos pendientes de reservas pasadas |
| Anotarse desde la tarjeta | "Inscribirme, $400" es un link a `/torneos/<id>?anotarme=1`, que abre la hoja de confirmar | La lista queda como Server Component (igual que "Sumarme" en partidos) |
| Pestaña del club | Torneos va después de Calendario | Es una tarea del día a día de recepción, como la grilla |
| PR | Un PR borrador desde el corte 1 (Task 3), listo al final | Igual que las fases 1 y 2: CI corre en cada push |

## Mapa de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `supabase/migrations/20261001000200_tournaments.sql` | Tipo `tournament_status`, tablas `tournaments`, `tournament_entries`, `tournament_games`, RLS, `court_occupancy.tournament_id`, `payments.tournament_entry_id`, `is_busy` y `guard_court_delete` con torneos |
| `supabase/migrations/20261001000210_create_tournament.sql` | `tournament_minutes`, `create_tournament`, `cancel_tournament` |
| `supabase/migrations/20261001000220_tournament_entries.sql` | `active_entry_count`, `tournament_fit`, `drop_entry`, `join_tournament`, `leave_tournament`, `add_tournament_guest`, `remove_tournament_entry`, `close_tournament_registration`, `reopen_tournament_registration` |
| `supabase/migrations/20261001000230_tournament_fixture.sql` | `start_tournament` (método del círculo), `record_tournament_score`, `finish_tournament` |
| `supabase/migrations/20261001000240_tournament_payments.sql` | `entry_due`, `report_tournament_transfer`, `record_tournament_cash`, `confirm_payment` con inscripciones |
| `supabase/migrations/20261001000250_realtime_tournaments.sql` | Las tres tablas en Realtime |
| `supabase/tests/database/helpers/tournament.psql` | `make_tournament`, `add_entry`, `add_guests`, `entry_of` |
| `supabase/tests/database/*.test.sql` | pgTAP nuevos: `tournament_schema`, `create_tournament`, `tournament_entries`, `tournament_fixture`, `tournament_payments`, `realtime_tournaments` |
| `lib/domain/tournaments.ts` | Tipos, etiquetas, `toTournament`, duración, cupo, quién se puede anotar, baja, rondas |
| `lib/domain/tournament-ranking.ts` | `scoreB`, `ranking` con desempates |
| `lib/domain/tournament-form.ts` | Lectura del formulario "Nuevo americano", canchas ocupadas, horario del club |
| `lib/domain/tournament-payments.ts` | Estado de pago de una inscripción, "Sin cobrar" y "A devolver" de torneos |
| `lib/domain/tournament-share.ts` | Texto para WhatsApp |
| `lib/data/tournaments.ts` | Carga de torneos, canchas activas y ocupaciones |
| `lib/data/my-bookings.ts` | Reservas y partes de partido del jugador (antes en `/reservas`) |
| `lib/data/matches.ts`, `lib/data/payments.ts` | "Ocupado" con torneos; Cobros con inscripciones |
| `app/(jugador)/torneos/…` | Lista, detalle (`[id]`, con `tournament-board.tsx`), acciones |
| `app/(club)/club/torneos/…` | Lista, `nuevo`, gestión (`[id]`), acciones |
| `components/tournaments/*` | `TournamentCard`, `FixtureList`, `RankingTable`, `NewTournamentForm`, `ScoreForm`, `ScoreBoard`, `EntriesManager`, `TournamentControls` |
| `components/booking/my-booking-card.tsx` | Tarjeta de reserva (movida desde `app/(jugador)/reservas/`) |
| `app/(jugador)/page.tsx`, `app/(jugador)/layout.tsx`, `app/(jugador)/reservas/page.tsx` | Inicio con las reservas y el acceso a torneos; pestaña Torneos; redirección |
| `lib/club/tabs.ts`, `components/ui/icon.tsx` | Pestaña Torneos del club; ícono trofeo |
| `lib/domain/grid.ts`, `lib/data/day.ts`, `components/booking/{cell-styles,slot-grid,legend}.tsx`, `components/club/occupancy-detail-sheet.tsx` | Bloque de torneo en la grilla |
| `app/(club)/club/cobros/page.tsx` | Inscripciones sin cobrar y a devolver |
| `components/live/live-occupancy.tsx` | Escucha también torneos |
| `tests/e2e/support/{tournaments,global-setup}.ts`, `tests/e2e/tournament.spec.ts` | El flujo e2e y su limpieza |

## Secuencia por cortes

| Corte | Tasks | Resultado | Cómo se prueba |
| --- | --- | --- | --- |
| 1. Modelo | 1–3 | Tablas de torneos, lectura, pagos por inscripción y "ocupado" | pgTAP |
| 2. RPCs | 4–9 | Crear, cancelar, anotarse, invitados, fixture, resultados, pagos, en vivo | pgTAP |
| 3. Dominio TS | 10–15 | Reglas y textos de torneos | Vitest |
| 4. Datos y acciones | 16–17 | Carga y Server Actions | Vitest + typecheck |
| 5. Pantallas del jugador | 18–22 | `/torneos`, `/torneos/<id>`, Inicio con Mis reservas | Vitest + e2e existentes |
| 6. Pantallas del club | 23–31 | Lista, nuevo, gestión, resultados, grilla, Cobros, en vivo | Vitest |
| 7. e2e y cierre | 32–34 | Flujo completo del americano; PR listo | Playwright |

---

## Corte 1: Modelo

### Task 1: Punto de partida en verde

**Files:** ninguno.

- [ ] **Step 1: Rama y stack local**

Run:
```bash
git branch --show-current
git log --oneline -1 main
npx supabase start
npm run db:reset
```
Expected: `feat/fase-3a-torneos` (si no existe: `git switch main && git pull && git switch -c feat/fase-3a-torneos`); `db reset` aplica las migraciones hasta `20261001000100_court_delete_guard.sql` y `seed.sql`.

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

### Task 2: Torneos en la base (tablas, lectura, pagos y "ocupado")

**Files:**
- Create: `supabase/tests/database/helpers/tournament.psql`
- Create: `supabase/tests/database/tournament_schema.test.sql`
- Create: `supabase/migrations/20261001000200_tournaments.sql`

- [ ] **Step 1: Test helper** (con la herramienta Write)

`supabase/tests/database/helpers/tournament.psql`:
```sql
-- Fase 3a fixture. Include it after slot.psql, club.psql and match.psql:
--   \ir helpers/tournament.psql
-- Tournaments and entries inserted as postgres (skips the RPC rules on purpose). Unless told
-- otherwise a tournament is mixed, 1ª a 8ª, for 8 players, 7 rounds, $400, on Cancha 1 and 2.
create procedure test_helpers.make_tournament(
  p_id uuid,
  p_period tstzrange,
  p_max integer default 8,
  p_status public.tournament_status default 'registration',
  p_type public.match_type default 'mixed',
  p_category_min integer default 1,
  p_category_max integer default 8,
  p_price integer default 400,
  p_courts uuid[] default array['c0000000-0000-0000-0000-000000000001',
                                'c0000000-0000-0000-0000-000000000002']::uuid[]
)
language plpgsql
as $$
begin
  insert into public.tournaments (id, club_id, name, period, court_ids, max_players, rounds, category_min,
                                  category_max, match_type, price, status, cancelled_at)
  values (p_id, 'a0000000-0000-0000-0000-000000000001', 'Americano T', p_period, p_courts, p_max, 7,
          p_category_min, p_category_max, p_type, p_price, p_status,
          case when p_status = 'cancelled' then now() end);
end;
$$;

-- Signs a member up.
create procedure test_helpers.add_entry(p_tournament_id uuid, p_player_id uuid)
language sql
as $$
  insert into public.tournament_entries (club_id, tournament_id, player_id)
  values ('a0000000-0000-0000-0000-000000000001', p_tournament_id, p_player_id);
$$;

-- Adds p_count guests: 'Invitado 1', 'Invitado 2', ...
create procedure test_helpers.add_guests(p_tournament_id uuid, p_count integer)
language sql
as $$
  insert into public.tournament_entries (club_id, tournament_id, guest_name)
  select 'a0000000-0000-0000-0000-000000000001', p_tournament_id, 'Invitado ' || n
  from generate_series(1, p_count) as n;
$$;

-- The active entry of a member in a tournament (null once she left).
create function test_helpers.entry_of(p_tournament_id uuid, p_player_id uuid)
returns uuid
language sql
stable
as $$
  select id from public.tournament_entries
  where tournament_id = p_tournament_id and player_id = p_player_id and removed_at is null;
$$;
```

- [ ] **Step 2: Write the failing test** (con la herramienta Write)

`supabase/tests/database/tournament_schema.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/tournament.psql
select plan(22);

select has_table('public', 'tournaments', 'tournaments exists');
select has_table('public', 'tournament_entries', 'tournament_entries exists');
select has_table('public', 'tournament_games', 'tournament_games exists');

-- Day 3, 18:00 to 20:20, on Cancha 1 and 2: Ana and three guests, and one game with the four of them.
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000001', test_helpers.slot(3, '18:00', 140));
call test_helpers.add_entry('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1');
call test_helpers.add_guests('e3000000-0000-0000-0000-000000000001', 3);
insert into public.tournament_games (club_id, tournament_id, round, wave, court_id, starts_at, a1_entry_id,
                                     a2_entry_id, b1_entry_id, b2_entry_id)
select 'a0000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 1, 1,
       'c0000000-0000-0000-0000-000000000001', test_helpers.at(3, '18:00'), ids[1], ids[2], ids[3], ids[4]
from (select array_agg(id) as ids from public.tournament_entries
      where tournament_id = 'e3000000-0000-0000-0000-000000000001') as e;

select throws_ok(
  $$ update public.tournaments set max_players = 10 where id = 'e3000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a tournament is for 8, 12 or 16 players');
select throws_ok(
  $$ update public.tournaments set rounds = 8 where id = 'e3000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'at most one round less than players');
select throws_ok(
  $$ update public.tournaments
        set court_ids = array['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
                              'c0000000-0000-0000-0000-000000000001']::uuid[]
      where id = 'e3000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'eight players use at most two courts');
select throws_ok(
  $$ insert into public.tournament_entries (club_id, tournament_id, player_id)
     values ('a0000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001',
             '00000000-0000-0000-0000-0000000000a1') $$,
  '23505', null, 'a player signs up once');

update public.tournament_entries set removed_at = now()
 where tournament_id = 'e3000000-0000-0000-0000-000000000001'
   and player_id = '00000000-0000-0000-0000-0000000000a1';
select lives_ok(
  $$ insert into public.tournament_entries (club_id, tournament_id, player_id)
     values ('a0000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001',
             '00000000-0000-0000-0000-0000000000a1') $$,
  'after leaving, she can sign up again');
select throws_ok(
  $$ insert into public.tournament_entries (club_id, tournament_id, player_id, guest_name)
     values ('a0000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001',
             '00000000-0000-0000-0000-0000000000b1', 'Bruno') $$,
  '23514', null, 'an entry is a member or a guest name');
select throws_ok(
  $$ update public.tournament_games set a2_entry_id = a1_entry_id $$,
  '23514', null, 'four different players per game');
select throws_ok(
  $$ insert into public.payments (club_id, method, amount, status)
     values ('a0000000-0000-0000-0000-000000000001', 'cash', 400, 'confirmed') $$,
  '23514', null, 'a payment is for a booking or an entry');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, tournament_id)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'block',
             test_helpers.slot(9, '10:00', 60), 'e3000000-0000-0000-0000-000000000001') $$,
  '23514', null, 'only tournament occupancies point at a tournament');

-- Ana, member
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select is((select count(*)::int from public.tournaments), 1, 'members read the tournaments of their club');
select is((select count(*)::int from public.tournament_entries), 5,
  'members read every entry, also the ones that left');
select is((select count(*)::int from public.tournament_games), 1, 'members read the games');
select lives_ok($$ select tournament_id from public.court_occupancy $$,
  'members read which tournament holds a court');
select throws_ok(
  $$ insert into public.tournaments (club_id, name, period, court_ids, max_players, category_min, category_max,
                                     match_type, price)
     values ('a0000000-0000-0000-0000-000000000001', 'Mío', test_helpers.slot(8, '10:00', 140),
             array['c0000000-0000-0000-0000-000000000001']::uuid[], 8, 1, 8, 'mixed', 0) $$,
  '42501', null, 'players cannot write tournaments directly');
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000002', test_helpers.at(3, '18:30')) $$,
  'P0001', 'busy_at_that_time', 'a player in a tournament cannot book at that time');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select is((select count(*)::int from public.tournaments), 0, 'non-members read no tournaments');

-- Dani, admin
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select throws_ok(
  $$ delete from public.courts where id = 'c0000000-0000-0000-0000-000000000001' $$,
  'P0001', 'court_has_history', 'a court a tournament uses cannot be deleted');

-- Anonymous visitor
set local role anon;
select throws_ok($$ select * from public.tournaments $$, '42501', null, 'anon cannot read tournaments');
select throws_ok($$ select * from public.tournament_games $$, '42501', null, 'anon cannot read games');

select * from finish();
rollback;
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/tournament_schema.test.sql`
Expected: FAIL (`type "public.tournament_status" does not exist` al incluir el helper).

- [ ] **Step 4: Write the migration**

`supabase/migrations/20261001000200_tournaments.sql`:
```sql
-- Fase 3a data model: americano tournaments. The club creates a tournament and blocks its courts;
-- players sign up themselves and reception adds guests; start_tournament builds the fixture in the
-- database. Every write goes through the functions of the next migrations: authenticated only reads.

create type public.tournament_status as enum ('registration', 'closed', 'in_progress', 'finished', 'cancelled');

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  -- From the start to the end its maximum size needs (private.tournament_minutes).
  period tstzrange not null,
  starts_at timestamptz generated always as (lower(period)) stored,
  ends_at timestamptz generated always as (upper(period)) stored,
  -- The courts it blocks, in the order games are assigned to them. Array elements take no FK:
  -- the occupancies and private.guard_court_delete keep them honest.
  court_ids uuid[] not null check (cardinality(court_ids) >= 1),
  max_players smallint not null check (max_players in (8, 12, 16)),
  points_per_game smallint not null default 24 check (points_per_game between 1 and 99),
  round_minutes smallint not null default 20 check (round_minutes between 5 and 90),
  rounds smallint not null default 7,
  category_min smallint not null check (category_min between 1 and 8),
  category_max smallint not null check (category_max between 1 and 8),
  match_type public.match_type not null,
  price integer not null check (price between 0 and 10000000),
  status public.tournament_status not null default 'registration',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  -- Target for the composite FKs of entries and games.
  unique (id, club_id),
  constraint tournaments_rounds check (rounds between 1 and max_players - 1),
  constraint tournaments_courts_fit check (cardinality(court_ids) <= max_players / 4),
  constraint tournaments_categories check (category_min <= category_max),
  constraint tournaments_period_shape check (
    not isempty(period) and not lower_inf(period) and not upper_inf(period)
    and lower_inc(period) and not upper_inc(period)
  ),
  constraint tournaments_cancelled check ((status = 'cancelled') = (cancelled_at is not null))
);
create index tournaments_club_starts_idx on public.tournaments (club_id, starts_at);
alter table public.tournaments enable row level security;

-- A member or a guest name. Leaving or being taken out keeps the row (removed_at): its payments
-- may still need a refund.
create table public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  tournament_id uuid not null,
  player_id uuid references public.profiles (id),
  guest_name text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.profiles (id) on delete set null,
  -- Target for the composite FK in payments.
  unique (id, club_id),
  constraint tournament_entries_tournament_in_club
    foreign key (tournament_id, club_id) references public.tournaments (id, club_id) on delete cascade,
  constraint tournament_entries_holder check (
    num_nonnulls(player_id, guest_name) = 1 and (guest_name is null or length(trim(guest_name)) between 1 and 60)
  )
);
create unique index tournament_entries_one_per_player on public.tournament_entries (tournament_id, player_id)
  where removed_at is null and player_id is not null;
create index tournament_entries_tournament_id_idx on public.tournament_entries (tournament_id);
create index tournament_entries_player_id_idx on public.tournament_entries (player_id);
alter table public.tournament_entries enable row level security;

-- The fixture. Team A is a1 + a2, team B is b1 + b2. score_a is team A's points; team B has
-- points_per_game minus them. null until reception records it.
create table public.tournament_games (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  tournament_id uuid not null,
  round smallint not null check (round >= 1),
  wave smallint not null check (wave >= 1),
  court_id uuid not null,
  starts_at timestamptz not null,
  a1_entry_id uuid not null references public.tournament_entries (id) on delete cascade,
  a2_entry_id uuid not null references public.tournament_entries (id) on delete cascade,
  b1_entry_id uuid not null references public.tournament_entries (id) on delete cascade,
  b2_entry_id uuid not null references public.tournament_entries (id) on delete cascade,
  score_a smallint check (score_a >= 0),
  recorded_by uuid references public.profiles (id) on delete set null,
  recorded_at timestamptz,
  constraint tournament_games_tournament_in_club
    foreign key (tournament_id, club_id) references public.tournaments (id, club_id) on delete cascade,
  constraint tournament_games_court_in_club
    foreign key (court_id, club_id) references public.courts (id, club_id) on delete cascade,
  constraint tournament_games_one_game_per_court unique (tournament_id, round, wave, court_id),
  constraint tournament_games_four_players check (
    a1_entry_id <> a2_entry_id and a1_entry_id <> b1_entry_id and a1_entry_id <> b2_entry_id
    and a2_entry_id <> b1_entry_id and a2_entry_id <> b2_entry_id and b1_entry_id <> b2_entry_id
  )
);
create index tournament_games_tournament_id_idx on public.tournament_games (tournament_id);
alter table public.tournament_games enable row level security;

-- Each court a tournament blocks points at it; cancelling the tournament deletes them.
alter table public.court_occupancy
  add column tournament_id uuid references public.tournaments (id) on delete cascade,
  add constraint court_occupancy_tournament_kind check (tournament_id is null or kind = 'tournament');
create index court_occupancy_tournament_id_idx on public.court_occupancy (tournament_id);
-- Members read which tournament holds a court (never note, which stays for staff).
grant select (tournament_id) on public.court_occupancy to authenticated;

-- A payment is for a booking or for a tournament entry.
alter table public.payments
  alter column booking_id drop not null,
  add column tournament_entry_id uuid,
  add constraint payments_entry_in_club
    foreign key (tournament_entry_id, club_id) references public.tournament_entries (id, club_id) on delete cascade,
  add constraint payments_one_target check (num_nonnulls(booking_id, tournament_entry_id) = 1);
create index payments_tournament_entry_id_idx on public.payments (tournament_entry_id);
create unique index payments_one_reported_per_entry on public.payments (tournament_entry_id)
  where status = 'reported' and tournament_entry_id is not null;

-- "Busy" now also means an active entry in a tournament that was not cancelled, so book_slot,
-- create_match, join_match and join_tournament all respect it.
create or replace function private.is_busy(p_user_id uuid, p_period tstzrange)
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
  ) or exists (
    select 1 from public.tournament_entries e
    join public.tournaments t on t.id = e.tournament_id
    where e.player_id = p_user_id and e.removed_at is null and t.status <> 'cancelled' and t.period && p_period
  );
$$;

-- A court a tournament uses (even a cancelled one, which lost its occupancies) has history too.
create or replace function private.guard_court_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Depth 1 is a DELETE on courts itself. Deeper means a cascade (e.g. the whole club is being
  -- removed), which is allowed to take everything with it.
  if pg_trigger_depth() = 1 and (
    exists (select 1 from public.court_occupancy where court_id = old.id)
    or exists (select 1 from public.bookings where court_id = old.id)
    or exists (select 1 from public.recurring_series where court_id = old.id)
    or exists (select 1 from public.open_matches where court_id = old.id or preferred_court_id = old.id)
    or exists (select 1 from public.tournaments where old.id = any (court_ids))
  ) then
    perform private.fail('court_has_history');
  end if;
  return old;
end;
$$;

revoke all on public.tournaments, public.tournament_entries, public.tournament_games from anon, authenticated;
grant select on public.tournaments, public.tournament_entries, public.tournament_games to authenticated;

create policy tournaments_select_members on public.tournaments
  for select to authenticated using (private.is_club_member(club_id));
create policy tournament_entries_select_members on public.tournament_entries
  for select to authenticated using (private.is_club_member(club_id));
create policy tournament_games_select_members on public.tournament_games
  for select to authenticated using (private.is_club_member(club_id));
```

The `payments_select_own_or_staff` policy does not change: an entry payment carries `payer_id` = the player (null for a guest), so `payer_id = auth.uid()` already covers the player.

- [ ] **Step 5: Apply and run the test**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/tournament_schema.test.sql
```
Expected: PASS (22 tests).

- [ ] **Step 6: Run the whole pgTAP suite**

Run: `npm run test:db`
Expected: PASS. `integrity.test.sql` sigue en verde (ninguna función nueva ejecutable por `anon`), `schema.test.sql` también (las tres tablas tienen RLS).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261001000200_tournaments.sql supabase/tests/database/helpers/tournament.psql supabase/tests/database/tournament_schema.test.sql
git commit -m "feat(db): tournaments, entries and games"
```

---

### Task 3: Tipos generados y PR borrador

**Files:**
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: Regenerate types and check**

Run:
```bash
npm run db:types
npm run typecheck
npm test
```
Expected: aparecen `tournaments`, `tournament_entries`, `tournament_games` y el enum `tournament_status`; `payments.Row.booking_id` pasa a `string | null`. Typecheck y Vitest en verde. Si `typecheck` marca un uso de `payment.booking_id` como `string`, no hay ninguno en `lib/` ni `app/` hoy; si aparece, se corrige leyendo el valor como nullable, sin cast.

- [ ] **Step 2: Commit, push y PR borrador**

```bash
git add lib/supabase/database.types.ts
git commit -m "chore(types): tournament tables"
git push -u origin feat/fase-3a-torneos
gh pr create --draft --base main --title "Fase 3a: torneos americanos" --body "Plan: docs/features/fase-3a-torneos/plan.md. Se marca listo al final (Task 34).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
Expected: PR borrador creado; CI corre en cada push. Si `gh` no está instalado (nota de la fase 2), anotarlo en `notes.md` y abrir el PR desde GitHub.

---

## Corte 2: RPCs de torneos

### Task 4: Crear y cancelar (`create_tournament`, `cancel_tournament`)

**Files:**
- Create: `supabase/tests/database/create_tournament.test.sql`
- Create: `supabase/migrations/20261001000210_create_tournament.sql`

- [ ] **Step 1: Write the failing test** (con la herramienta Write)

`supabase/tests/database/create_tournament.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/tournament.psql
select plan(21);

-- Ana's booking takes Cancha 1 on day 4 from 18:30 to 20:00.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(4, '18:30', 90), '00000000-0000-0000-0000-0000000000a1', 1600);

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.create_tournament('Americano de octubre', test_helpers.at(5, '18:00'),
       array['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002']::uuid[],
       8, 24, 20, 7, 4, 6, 'mixed', 400) $$,
  'reception creates an americano');
select results_eq(
  $$ select status::text, ends_at - starts_at, court_ids from public.tournaments
     where name = 'Americano de octubre' $$,
  $$ values ('registration', interval '140 minutes',
             array['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002']::uuid[]) $$,
  'registration opens and it lasts 7 rounds of 20 minutes');
select results_eq(
  $$ select o.court_id, o.kind::text from public.court_occupancy o
     join public.tournaments t on t.id = o.tournament_id
     where t.name = 'Americano de octubre' and o.period = t.period
     order by o.court_id $$,
  $$ values ('c0000000-0000-0000-0000-000000000001'::uuid, 'tournament'),
            ('c0000000-0000-0000-0000-000000000002'::uuid, 'tournament') $$,
  'it blocks each of its courts for the whole tournament');
select lives_ok(
  $$ select public.create_tournament('Americano de 12', test_helpers.at(6, '10:00'),
       array['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002']::uuid[],
       12, 24, 20, 7, 1, 8, 'male', 500) $$,
  'twelve players on two courts');
select is((select ends_at - starts_at from public.tournaments where name = 'Americano de 12'),
  interval '280 minutes', 'three games per round on two courts take two waves');
select throws_ok(
  $$ select public.create_tournament('Choca', test_helpers.at(4, '18:00'),
       array['c0000000-0000-0000-0000-000000000001']::uuid[], 8, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  'P0001', 'courts_busy', 'a court that is already taken stops it');
select is((select count(*)::int from public.tournaments where name = 'Choca'), 0, 'and nothing is left behind');
select throws_ok(
  $$ select public.create_tournament('Tarde', test_helpers.at(5, '22:00'),
       array['c0000000-0000-0000-0000-000000000002']::uuid[], 8, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  'P0001', 'outside_hours', 'it has to end before the club closes');
select throws_ok(
  $$ select public.create_tournament('Temprano', test_helpers.at(5, '07:00'),
       array['c0000000-0000-0000-0000-000000000002']::uuid[], 8, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  'P0001', 'outside_hours', 'and start after it opens');
select throws_ok(
  $$ select public.create_tournament('Ayer', test_helpers.at(-1, '18:00'),
       array['c0000000-0000-0000-0000-000000000002']::uuid[], 8, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  'P0001', 'in_the_past', 'not in the past');
select throws_ok(
  $$ select public.create_tournament('Diez', test_helpers.at(7, '10:00'),
       array['c0000000-0000-0000-0000-000000000002']::uuid[], 10, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  'P0001', 'invalid_input', 'the size is 8, 12 or 16');
select throws_ok(
  $$ select public.create_tournament('Muchas rondas', test_helpers.at(7, '10:00'),
       array['c0000000-0000-0000-0000-000000000002']::uuid[], 8, 24, 20, 8, 1, 8, 'mixed', 400) $$,
  'P0001', 'invalid_input', 'at most one round less than players');
select throws_ok(
  $$ select public.create_tournament('Repetida', test_helpers.at(7, '10:00'),
       array['c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002']::uuid[],
       8, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  'P0001', 'invalid_input', 'each court once');
select throws_ok(
  $$ select public.create_tournament('Al revés', test_helpers.at(7, '10:00'),
       array['c0000000-0000-0000-0000-000000000002']::uuid[], 8, 24, 20, 7, 6, 4, 'mixed', 400) $$,
  'P0001', 'invalid_input', 'the category range goes from low to high');
select throws_ok(
  $$ select public.create_tournament('Otra cancha', test_helpers.at(7, '10:00'),
       array['c0000000-0000-0000-0000-00000000dead']::uuid[], 8, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  'P0001', 'not_found', 'only active courts of the club');

select lives_ok(
  $$ select public.cancel_tournament((select id from public.tournaments where name = 'Americano de octubre')) $$,
  'reception cancels it');
select results_eq(
  $$ select t.status::text, (select count(*)::int from public.court_occupancy o where o.tournament_id = t.id)
     from public.tournaments t where t.name = 'Americano de octubre' $$,
  $$ values ('cancelled', 0) $$,
  'cancelled, and its courts are free again');
select throws_ok(
  $$ select public.cancel_tournament((select id from public.tournaments where name = 'Americano de octubre')) $$,
  'P0001', 'invalid_state', 'a tournament is cancelled once');

-- Ana, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.create_tournament('Mío', test_helpers.at(7, '10:00'),
       array['c0000000-0000-0000-0000-000000000002']::uuid[], 8, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  'P0001', 'forbidden', 'players do not create tournaments');
select throws_ok(
  $$ select public.cancel_tournament((select id from public.tournaments where name = 'Americano de 12')) $$,
  'P0001', 'forbidden', 'players do not cancel tournaments');

-- Anonymous visitor
set local role anon;
select throws_ok(
  $$ select public.create_tournament('Anónimo', now() + interval '7 days',
       array['c0000000-0000-0000-0000-000000000002']::uuid[], 8, 24, 20, 7, 1, 8, 'mixed', 400) $$,
  '42501', null, 'anon cannot call create_tournament');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/create_tournament.test.sql`
Expected: FAIL (`function public.create_tournament(...) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261001000210_create_tournament.sql`:
```sql
-- Tournaments, part 1: creating one (it blocks its courts from the start until the end its maximum
-- size needs) and cancelling it (frees them; confirmed payments stay for a refund).

-- rounds × waves × round_minutes, where waves spread the games of a round (players / 4) over the courts.
create function private.tournament_minutes(p_players integer, p_courts integer, p_rounds integer,
                                           p_round_minutes integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select p_rounds * ceil((p_players / 4)::numeric / p_courts)::integer * p_round_minutes;
$$;

create function public.create_tournament(
  p_name text,
  p_starts_at timestamptz,
  p_court_ids uuid[],
  p_max_players integer,
  p_points_per_game integer,
  p_round_minutes integer,
  p_rounds integer,
  p_category_min integer,
  p_category_max integer,
  p_type public.match_type,
  p_price integer
)
returns public.tournaments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(p_name);
  v_club public.clubs;
  v_period tstzrange;
  v_local_start timestamp;
  v_tournament public.tournaments;
  v_court_id uuid;
begin
  if p_court_ids is null or cardinality(p_court_ids) = 0 then
    perform private.fail('invalid_input');
  end if;
  select * into v_club from public.clubs where id = private.active_court_club(p_court_ids[1]);
  if not private.is_staff(v_club.id) then
    perform private.fail('forbidden');
  end if;
  if v_name is null or length(v_name) not between 1 and 60
     or p_starts_at is null
     or p_max_players is null or p_max_players not in (8, 12, 16)
     or array_position(p_court_ids, null) is not null
     or cardinality(p_court_ids) > p_max_players / 4
     or (select count(distinct u.court_id) from unnest(p_court_ids) as u (court_id)) <> cardinality(p_court_ids)
     or exists (
       select 1 from unnest(p_court_ids) as u (court_id)
       where not exists (
         select 1 from public.courts c where c.id = u.court_id and c.club_id = v_club.id and c.is_active
       )
     )
     or p_points_per_game is null or p_points_per_game not between 1 and 99
     or p_round_minutes is null or p_round_minutes not between 5 and 90
     or p_rounds is null or p_rounds not between 1 and p_max_players - 1
     or p_category_min is null or p_category_max is null
     or p_category_min not between 1 and 8 or p_category_max not between 1 and 8
     or p_category_min > p_category_max
     or p_type is null
     or p_price is null or p_price not between 0 and 10000000 then
    perform private.fail('invalid_input');
  end if;
  if p_starts_at <= now() then
    perform private.fail('in_the_past');
  end if;

  v_period := tstzrange(
    p_starts_at,
    p_starts_at + make_interval(mins => private.tournament_minutes(p_max_players, cardinality(p_court_ids),
                                                                   p_rounds, p_round_minutes))
  );
  -- Inside the club's hours on its clock, start and end on the same day.
  v_local_start := p_starts_at at time zone v_club.timezone;
  if v_local_start < v_local_start::date + v_club.opens_at
     or (upper(v_period) at time zone v_club.timezone) > v_local_start::date + v_club.closes_at then
    perform private.fail('outside_hours');
  end if;

  insert into public.tournaments (club_id, name, period, court_ids, max_players, points_per_game, round_minutes,
                                  rounds, category_min, category_max, match_type, price, created_by)
  values (v_club.id, v_name, v_period, p_court_ids, p_max_players, p_points_per_game, p_round_minutes, p_rounds,
          p_category_min, p_category_max, p_type, p_price, (select auth.uid()))
  returning * into v_tournament;

  -- The exclusion constraint has the last word on double booking.
  foreach v_court_id in array p_court_ids loop
    begin
      insert into public.court_occupancy (club_id, court_id, kind, period, note, tournament_id, created_by)
      values (v_club.id, v_court_id, 'tournament', v_period, v_name, v_tournament.id, (select auth.uid()));
    exception when exclusion_violation then
      perform private.fail('courts_busy');
    end;
  end loop;

  return v_tournament;
end;
$$;

-- Reception and admin cancel a tournament that has not finished: its courts go free, its reported
-- transfers are rejected, and confirmed payments stay so Cobros lists them to refund.
create function public.cancel_tournament(p_tournament_id uuid)
returns public.tournaments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament public.tournaments;
begin
  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_tournament.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_tournament.status in ('finished', 'cancelled') then
    perform private.fail('invalid_state');
  end if;

  delete from public.court_occupancy where tournament_id = v_tournament.id;
  update public.payments
     set status = 'rejected', rejection_reason = 'Torneo cancelado',
         confirmed_by = (select auth.uid()), confirmed_at = now()
   where status = 'reported'
     and tournament_entry_id in (select id from public.tournament_entries where tournament_id = v_tournament.id);

  update public.tournaments set status = 'cancelled', cancelled_at = now()
   where id = v_tournament.id
  returning * into v_tournament;
  return v_tournament;
end;
$$;

revoke all on function private.tournament_minutes(integer, integer, integer, integer) from public;
revoke execute on function public.create_tournament(text, timestamptz, uuid[], integer, integer, integer, integer,
  integer, integer, public.match_type, integer) from public, anon;
revoke execute on function public.cancel_tournament(uuid) from public, anon;
grant execute on function public.create_tournament(text, timestamptz, uuid[], integer, integer, integer, integer,
  integer, integer, public.match_type, integer) to authenticated;
grant execute on function public.cancel_tournament(uuid) to authenticated;
```

- [ ] **Step 4: Apply and run the test**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/create_tournament.test.sql
```
Expected: PASS (21 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261001000210_create_tournament.sql supabase/tests/database/create_tournament.test.sql
git commit -m "feat(db): create and cancel a tournament"
```

---

### Task 5: Inscripciones (anotarse, bajarse, invitados, cerrar y reabrir)

**Files:**
- Create: `supabase/tests/database/tournament_entries.test.sql`
- Create: `supabase/migrations/20261001000220_tournament_entries.sql`

- [ ] **Step 1: Write the failing test** (con la herramienta Write)

`supabase/tests/database/tournament_entries.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/tournament.psql
select plan(25);

-- T1: mixed, 5ª a 6ª, day 3 18:00. T2: female, day 4. T3: registration closed, day 6.
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000001', test_helpers.slot(3, '18:00', 140),
  p_category_min => 5, p_category_max => 6);
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000002', test_helpers.slot(4, '18:00', 140),
  p_type => 'female');
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000003', test_helpers.slot(6, '18:00', 140),
  p_status => 'closed');
-- Bruno already has a booking during T1.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(3, '18:30', 90), '00000000-0000-0000-0000-0000000000b1', 1600);

set local role authenticated;

-- Ana: female, 5ª
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000001') $$, 'a player signs up');
select results_eq(
  $$ select player_id, guest_name from public.tournament_entries
     where tournament_id = 'e3000000-0000-0000-0000-000000000001' $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, null::text) $$,
  'her entry is in');
select throws_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000001') $$,
  'P0001', 'already_in_tournament', 'once per tournament');

-- Hugo: male, 4ª
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';
select throws_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000001') $$,
  'P0001', 'category_mismatch', 'the category has to be in the range');

-- Bruno: male, 6ª, busy during T1
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000002') $$,
  'P0001', 'type_mismatch', 'a female tournament is for women');
select throws_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000001') $$,
  'P0001', 'busy_at_that_time', 'nobody signs up while having something else at that time');

-- Juli: female, 6ª
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
select throws_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000003') $$,
  'P0001', 'tournament_closed', 'not once registration closed');

-- Six guests: T1 has 7.
reset role;
call test_helpers.add_guests('e3000000-0000-0000-0000-000000000001', 6);
set local role authenticated;

-- Gabi: female, 5ª
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select lives_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000001') $$, 'the eighth one gets in');

-- Iván: male, 5ª
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a4", "role": "authenticated"}';
select throws_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000001') $$,
  'P0001', 'tournament_full', 'no room for a ninth');

-- Ana leaves while registration is open.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok($$ select public.leave_tournament('e3000000-0000-0000-0000-000000000001') $$,
  'a player leaves while registration is open');
select is(
  (select removed_at is not null from public.tournament_entries
   where tournament_id = 'e3000000-0000-0000-0000-000000000001'
     and player_id = '00000000-0000-0000-0000-0000000000a1'),
  true, 'her entry stays, marked as removed');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a4", "role": "authenticated"}';
select lives_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000001') $$,
  'her spot is free for someone else');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
select throws_ok($$ select public.leave_tournament('e3000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'only players who signed up leave');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok($$ select public.add_tournament_guest('e3000000-0000-0000-0000-000000000001', 'Pepe') $$,
  'P0001', 'tournament_full', 'guests need room too');
select lives_ok($$ select public.close_tournament_registration('e3000000-0000-0000-0000-000000000001') $$,
  'reception closes registration');
select is((select status::text from public.tournaments where id = 'e3000000-0000-0000-0000-000000000001'),
  'closed', 'registration is closed');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select throws_ok($$ select public.leave_tournament('e3000000-0000-0000-0000-000000000001') $$,
  'P0001', 'tournament_closed', 'players cannot leave once registration closed');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.remove_tournament_entry(test_helpers.entry_of('e3000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-0000000000a2')) $$,
  'reception takes a player out until it starts');
select lives_ok($$ select public.add_tournament_guest('e3000000-0000-0000-0000-000000000001', ' Pepe ') $$,
  'and adds a guest');
select throws_ok($$ select public.add_tournament_guest('e3000000-0000-0000-0000-000000000001', '   ') $$,
  'P0001', 'invalid_input', 'a guest has a name');
select throws_ok(
  $$ select public.remove_tournament_entry((select id from public.tournament_entries
       where tournament_id = 'e3000000-0000-0000-0000-000000000001'
         and player_id = '00000000-0000-0000-0000-0000000000a2')) $$,
  'P0001', 'invalid_state', 'an entry is removed once');
select lives_ok($$ select public.reopen_tournament_registration('e3000000-0000-0000-0000-000000000001') $$,
  'reception reopens registration');
select throws_ok($$ select public.reopen_tournament_registration('e3000000-0000-0000-0000-000000000001') $$,
  'P0001', 'invalid_state', 'only a closed registration reopens');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok($$ select public.close_tournament_registration('e3000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'players do not close registration');

-- Anonymous visitor
set local role anon;
select throws_ok($$ select public.join_tournament('e3000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'anon cannot call join_tournament');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/tournament_entries.test.sql`
Expected: FAIL (`function public.join_tournament(unknown) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261001000220_tournament_entries.sql`:
```sql
-- Tournaments, part 2: who plays. Players sign up and leave while registration is open; reception
-- adds guests and takes people out until the tournament starts, and closes or reopens registration.
-- Joining takes the same per-player lock as bookings and matches ('book_slot:' || uid).

create function private.active_entry_count(p_tournament_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.tournament_entries
  where tournament_id = p_tournament_id and removed_at is null;
$$;

-- null when the person fits the tournament; otherwise the error code: category (her current one,
-- validated or not), then gender.
create function private.tournament_fit(p_user_id uuid, p_tournament public.tournaments)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when m.category is null or m.category not between p_tournament.category_min and p_tournament.category_max
      then 'category_mismatch'
    when p_tournament.match_type <> 'mixed' and p.gender::text is distinct from p_tournament.match_type::text
      then 'type_mismatch'
  end
  from public.profiles p
  left join public.club_members m on m.user_id = p.id and m.club_id = p_tournament.club_id
  where p.id = p_user_id;
$$;

-- Marks an entry removed and rejects its reported transfer. Confirmed payments stay for a refund.
-- Callers lock the tournament first.
create function private.drop_entry(p_entry public.tournament_entries, p_reason text)
returns public.tournament_entries
language plpgsql
set search_path = ''
as $$
declare
  v_entry public.tournament_entries;
begin
  if p_entry.removed_at is not null then
    perform private.fail('invalid_state');
  end if;
  update public.tournament_entries set removed_at = now(), removed_by = (select auth.uid())
   where id = p_entry.id
  returning * into v_entry;
  update public.payments
     set status = 'rejected', rejection_reason = p_reason,
         confirmed_by = (select auth.uid()), confirmed_at = now()
   where tournament_entry_id = p_entry.id and status = 'reported';
  return v_entry;
end;
$$;

-- Locks a tournament and checks the caller is staff of its club.
create function private.staff_tournament(p_tournament_id uuid)
returns public.tournaments
language plpgsql
set search_path = ''
as $$
declare
  v_tournament public.tournaments;
begin
  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_tournament.club_id) then
    perform private.fail('forbidden');
  end if;
  return v_tournament;
end;
$$;

create function public.join_tournament(p_tournament_id uuid)
returns public.tournament_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tournament public.tournaments;
  v_fit text;
  v_entry public.tournament_entries;
begin
  -- Locking the tournament serializes sign-ups: in a race for the last spot only one gets in.
  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null or not private.is_club_member(v_tournament.club_id) then
    perform private.fail('forbidden');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('book_slot:' || v_uid::text, 0));

  if v_tournament.status <> 'registration' or v_tournament.starts_at <= now() then
    perform private.fail('tournament_closed');
  end if;
  if exists (
    select 1 from public.tournament_entries
    where tournament_id = v_tournament.id and player_id = v_uid and removed_at is null
  ) then
    perform private.fail('already_in_tournament');
  end if;
  if private.active_entry_count(v_tournament.id) >= v_tournament.max_players then
    perform private.fail('tournament_full');
  end if;
  v_fit := private.tournament_fit(v_uid, v_tournament);
  if v_fit is not null then
    perform private.fail(v_fit);
  end if;
  if private.is_busy(v_uid, v_tournament.period) then
    perform private.fail('busy_at_that_time');
  end if;

  insert into public.tournament_entries (club_id, tournament_id, player_id, created_by)
  values (v_tournament.club_id, v_tournament.id, v_uid, v_uid)
  returning * into v_entry;
  return v_entry;
end;
$$;

-- Only while registration is open. Someone who already paid gets it back from the club (Cobros).
create function public.leave_tournament(p_tournament_id uuid)
returns public.tournament_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tournament public.tournaments;
  v_entry public.tournament_entries;
begin
  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  select * into v_entry from public.tournament_entries
   where tournament_id = v_tournament.id and player_id = v_uid and removed_at is null;
  if v_uid is null or not found then
    perform private.fail('forbidden');
  end if;
  if v_tournament.status <> 'registration' then
    perform private.fail('tournament_closed');
  end if;
  return private.drop_entry(v_entry, 'Saliste del torneo');
end;
$$;

create function public.add_tournament_guest(p_tournament_id uuid, p_name text)
returns public.tournament_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament public.tournaments := private.staff_tournament(p_tournament_id);
  v_name text := trim(p_name);
  v_entry public.tournament_entries;
begin
  if v_name is null or length(v_name) not between 1 and 60 then
    perform private.fail('invalid_input');
  end if;
  if v_tournament.status not in ('registration', 'closed') then
    perform private.fail('invalid_state');
  end if;
  if private.active_entry_count(v_tournament.id) >= v_tournament.max_players then
    perform private.fail('tournament_full');
  end if;

  insert into public.tournament_entries (club_id, tournament_id, guest_name, created_by)
  values (v_tournament.club_id, v_tournament.id, v_name, (select auth.uid()))
  returning * into v_entry;
  return v_entry;
end;
$$;

-- Until it starts. A player who paid keeps the payment for a refund.
create function public.remove_tournament_entry(p_entry_id uuid)
returns public.tournament_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.tournament_entries;
  v_tournament public.tournaments;
begin
  select * into v_entry from public.tournament_entries where id = p_entry_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_tournament := private.staff_tournament(v_entry.tournament_id);
  if v_tournament.status not in ('registration', 'closed') then
    perform private.fail('invalid_state');
  end if;
  select * into v_entry from public.tournament_entries where id = p_entry_id for update;
  return private.drop_entry(v_entry, 'Salió del torneo');
end;
$$;

create function public.close_tournament_registration(p_tournament_id uuid)
returns public.tournaments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament public.tournaments := private.staff_tournament(p_tournament_id);
begin
  if v_tournament.status <> 'registration' then
    perform private.fail('invalid_state');
  end if;
  update public.tournaments set status = 'closed' where id = v_tournament.id returning * into v_tournament;
  return v_tournament;
end;
$$;

create function public.reopen_tournament_registration(p_tournament_id uuid)
returns public.tournaments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament public.tournaments := private.staff_tournament(p_tournament_id);
begin
  if v_tournament.status <> 'closed' then
    perform private.fail('invalid_state');
  end if;
  update public.tournaments set status = 'registration' where id = v_tournament.id returning * into v_tournament;
  return v_tournament;
end;
$$;

revoke all on function private.active_entry_count(uuid) from public;
revoke all on function private.tournament_fit(uuid, public.tournaments) from public;
revoke all on function private.drop_entry(public.tournament_entries, text) from public;
revoke all on function private.staff_tournament(uuid) from public;
revoke execute on function public.join_tournament(uuid) from public, anon;
revoke execute on function public.leave_tournament(uuid) from public, anon;
revoke execute on function public.add_tournament_guest(uuid, text) from public, anon;
revoke execute on function public.remove_tournament_entry(uuid) from public, anon;
revoke execute on function public.close_tournament_registration(uuid) from public, anon;
revoke execute on function public.reopen_tournament_registration(uuid) from public, anon;
grant execute on function public.join_tournament(uuid) to authenticated;
grant execute on function public.leave_tournament(uuid) to authenticated;
grant execute on function public.add_tournament_guest(uuid, text) to authenticated;
grant execute on function public.remove_tournament_entry(uuid) to authenticated;
grant execute on function public.close_tournament_registration(uuid) to authenticated;
grant execute on function public.reopen_tournament_registration(uuid) to authenticated;
```

- [ ] **Step 4: Apply and run the test**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/tournament_entries.test.sql
```
Expected: PASS (25 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261001000220_tournament_entries.sql supabase/tests/database/tournament_entries.test.sql
git commit -m "feat(db): sign up, leave and guests in a tournament"
```

---

### Task 6: Fixture, resultados y cierre (`start_tournament`, `record_tournament_score`, `finish_tournament`)

**Files:**
- Create: `supabase/tests/database/tournament_fixture.test.sql`
- Create: `supabase/migrations/20261001000230_tournament_fixture.sql`

- [ ] **Step 1: Write the failing test** (con la herramienta Write)

`supabase/tests/database/tournament_fixture.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/tournament.psql
select plan(26);

-- Every pair of partners, one row per team per game.
create function test_helpers.partners(p_tournament_id uuid)
returns table (x uuid, y uuid)
language sql
stable
as $$
  select least(a1_entry_id, a2_entry_id), greatest(a1_entry_id, a2_entry_id)
  from public.tournament_games where tournament_id = p_tournament_id
  union all
  select least(b1_entry_id, b2_entry_id), greatest(b1_entry_id, b2_entry_id)
  from public.tournament_games where tournament_id = p_tournament_id;
$$;

-- One row per player per game.
create function test_helpers.appearances(p_tournament_id uuid)
returns table (round smallint, wave smallint, entry_id uuid)
language sql
stable
as $$
  select g.round, g.wave, e.entry_id
  from public.tournament_games g
  cross join lateral unnest(array[g.a1_entry_id, g.a2_entry_id, g.b1_entry_id, g.b2_entry_id]) as e (entry_id)
  where g.tournament_id = p_tournament_id;
$$;

create function test_helpers.first_game(p_tournament_id uuid)
returns uuid
language sql
stable
as $$
  select id from public.tournament_games where tournament_id = p_tournament_id
  order by round, wave, court_id limit 1;
$$;

-- Closed, on Cancha 1 and 2, full of guests: 8, 12 and 16 players. F10 has 10 of 12; FR is still
-- in registration.
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000008', test_helpers.slot(3, '18:00', 140),
  p_status => 'closed');
call test_helpers.add_guests('e3000000-0000-0000-0000-000000000008', 8);
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000012', test_helpers.slot(4, '10:00', 280),
  p_max => 12, p_status => 'closed');
call test_helpers.add_guests('e3000000-0000-0000-0000-000000000012', 12);
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000016', test_helpers.slot(5, '10:00', 280),
  p_max => 16, p_status => 'closed');
call test_helpers.add_guests('e3000000-0000-0000-0000-000000000016', 16);
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000010', test_helpers.slot(6, '10:00', 280),
  p_max => 12, p_status => 'closed');
call test_helpers.add_guests('e3000000-0000-0000-0000-000000000010', 10);
call test_helpers.make_tournament('e3000000-0000-0000-0000-0000000000ff', test_helpers.slot(7, '10:00', 140));
call test_helpers.add_guests('e3000000-0000-0000-0000-0000000000ff', 8);

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok($$ select public.start_tournament('e3000000-0000-0000-0000-000000000008') $$,
  'reception builds the fixture for 8');
select lives_ok($$ select public.start_tournament('e3000000-0000-0000-0000-000000000012') $$,
  'and for 12');
select lives_ok($$ select public.start_tournament('e3000000-0000-0000-0000-000000000016') $$,
  'and for 16');

reset role;
select results_eq(
  $$ select status::text, rounds::int from public.tournaments
     where id in ('e3000000-0000-0000-0000-000000000008', 'e3000000-0000-0000-0000-000000000012',
                  'e3000000-0000-0000-0000-000000000016')
     order by max_players $$,
  $$ values ('in_progress', 7), ('in_progress', 7), ('in_progress', 7) $$,
  'the three are in progress, with 7 rounds');
select results_eq(
  $$ select t.max_players::int, count(g.id)::int from public.tournaments t
     join public.tournament_games g on g.tournament_id = t.id
     group by t.max_players order by t.max_players $$,
  $$ values (8, 14), (12, 21), (16, 28) $$,
  'one game per four players in each round');
select is_empty(
  $$ select t.id, p.x, p.y
     from unnest(array['e3000000-0000-0000-0000-000000000008', 'e3000000-0000-0000-0000-000000000012',
                       'e3000000-0000-0000-0000-000000000016']::uuid[]) as t (id)
     cross join lateral test_helpers.partners(t.id) as p
     group by t.id, p.x, p.y having count(*) > 1 $$,
  'two players are partners at most once');
select is(
  (select count(distinct (x, y))::int from test_helpers.partners('e3000000-0000-0000-0000-000000000008')),
  28, 'with 8 players and 7 rounds, everyone partners everyone');
select is_empty(
  $$ select t.id, a.round, a.entry_id
     from unnest(array['e3000000-0000-0000-0000-000000000008', 'e3000000-0000-0000-0000-000000000012',
                       'e3000000-0000-0000-0000-000000000016']::uuid[]) as t (id)
     cross join lateral test_helpers.appearances(t.id) as a
     group by t.id, a.round, a.entry_id having count(*) > 1 $$,
  'nobody plays twice in the same round (so never twice in the same wave)');
select is_empty(
  $$ select t.id, a.entry_id
     from unnest(array['e3000000-0000-0000-0000-000000000008', 'e3000000-0000-0000-0000-000000000012',
                       'e3000000-0000-0000-0000-000000000016']::uuid[]) as t (id)
     cross join lateral test_helpers.appearances(t.id) as a
     group by t.id, a.entry_id having count(*) <> 7 $$,
  'everyone plays every round');
select results_eq(
  $$ select wave::int, count(*)::int from public.tournament_games
     where tournament_id = 'e3000000-0000-0000-0000-000000000012' and round = 1
     group by wave order by wave $$,
  $$ values (1, 2), (2, 1) $$,
  'three games on two courts: two in the first wave, one in the second');
select is_empty(
  $$ select g.id from public.tournament_games g join public.tournaments t on t.id = g.tournament_id
     where not (g.court_id = any (t.court_ids)) $$,
  'games only use the tournament courts');
select is_empty(
  $$ with w as (select tournament_id, max(wave) as waves from public.tournament_games group by tournament_id)
     select g.id from public.tournament_games g
     join public.tournaments t on t.id = g.tournament_id
     join w on w.tournament_id = g.tournament_id
     where g.starts_at <> t.starts_at
       + make_interval(mins => ((g.round - 1) * w.waves + g.wave - 1) * t.round_minutes) $$,
  'each game starts when its round and wave do');

set local role authenticated;
select throws_ok($$ select public.start_tournament('e3000000-0000-0000-0000-000000000010') $$,
  'P0001', 'not_enough_players', 'ten players do not make an americano');
select throws_ok($$ select public.start_tournament('e3000000-0000-0000-0000-0000000000ff') $$,
  'P0001', 'invalid_state', 'registration has to be closed first');
select throws_ok($$ select public.start_tournament('e3000000-0000-0000-0000-000000000008') $$,
  'P0001', 'invalid_state', 'the fixture is built once');

select throws_ok(
  $$ select public.record_tournament_score(test_helpers.first_game('e3000000-0000-0000-0000-000000000008'), 25) $$,
  'P0001', 'invalid_score', 'a team cannot score more than the game has');
select throws_ok(
  $$ select public.record_tournament_score(test_helpers.first_game('e3000000-0000-0000-0000-000000000008'), -1) $$,
  'P0001', 'invalid_score', 'nor less than zero');
select lives_ok(
  $$ select public.record_tournament_score(test_helpers.first_game('e3000000-0000-0000-0000-000000000008'), 14) $$,
  'reception records team A''s points');
select lives_ok(
  $$ select public.record_tournament_score(test_helpers.first_game('e3000000-0000-0000-0000-000000000008'), 10) $$,
  'and corrects them');
select is(
  (select score_a::int from public.tournament_games
   where id = test_helpers.first_game('e3000000-0000-0000-0000-000000000008')),
  10, 'the correction is what stays');
select throws_ok($$ select public.finish_tournament('e3000000-0000-0000-0000-000000000008') $$,
  'P0001', 'scores_missing', 'it finishes with every result in');

reset role;
update public.tournament_games set score_a = 12
 where tournament_id = 'e3000000-0000-0000-0000-000000000008' and score_a is null;
set local role authenticated;

select lives_ok($$ select public.finish_tournament('e3000000-0000-0000-0000-000000000008') $$,
  'reception finishes the tournament');
select is((select status::text from public.tournaments where id = 'e3000000-0000-0000-0000-000000000008'),
  'finished', 'it is finished');
select throws_ok(
  $$ select public.record_tournament_score(test_helpers.first_game('e3000000-0000-0000-0000-000000000008'), 12) $$,
  'P0001', 'invalid_state', 'results are fixed once it finished');

-- Ana, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.record_tournament_score(test_helpers.first_game('e3000000-0000-0000-0000-000000000012'), 12) $$,
  'P0001', 'forbidden', 'players do not record results');

-- Anonymous visitor
set local role anon;
select throws_ok($$ select public.start_tournament('e3000000-0000-0000-0000-000000000012') $$,
  '42501', null, 'anon cannot call start_tournament');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/tournament_fixture.test.sql`
Expected: FAIL (`function public.start_tournament(unknown) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261001000230_tournament_fixture.sql`:
```sql
-- Tournaments, part 3: the fixture, the results and the end. The fixture is built here, in the same
-- transaction that puts the tournament in progress, so nobody can send one made up.

-- Circle method: players 1..n-1 turn one place each round around player n, who stays put. Round r
-- pairs (r, n) and ((r + k), (r - k)) mod (n - 1) for k = 1 .. n/2 - 1, so over n - 1 rounds every
-- two players are partners exactly once. Consecutive pairs play each other; game i of a round goes
-- to court (i mod courts) in wave (i div courts). The starting order is shuffled.
create function public.start_tournament(p_tournament_id uuid)
returns public.tournaments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament public.tournaments := private.staff_tournament(p_tournament_id);
  v_entries uuid[];
  v_n integer;
  v_rounds integer;
  v_courts integer;
  v_games integer;
  v_waves integer;
  v_pairs uuid[];
  v_round integer;
  v_game integer;
  v_k integer;
begin
  if v_tournament.status <> 'closed' then
    perform private.fail('invalid_state');
  end if;

  select array_agg(e.id order by random()) into v_entries
  from public.tournament_entries e
  where e.tournament_id = v_tournament.id and e.removed_at is null;
  v_n := coalesce(cardinality(v_entries), 0);
  if v_n not in (8, 12, 16) then
    perform private.fail('not_enough_players');
  end if;

  v_rounds := least(v_tournament.rounds, v_n - 1);
  v_courts := cardinality(v_tournament.court_ids);
  v_games := v_n / 4;
  v_waves := ceil(v_games::numeric / v_courts)::integer;

  for v_round in 0 .. v_rounds - 1 loop
    -- Flat list of pairs: pair k is (v_pairs[2k + 1], v_pairs[2k + 2]).
    v_pairs := array[v_entries[v_round + 1], v_entries[v_n]];
    for v_k in 1 .. v_n / 2 - 1 loop
      v_pairs := v_pairs
        || v_entries[(v_round + v_k) % (v_n - 1) + 1]
        || v_entries[(v_round - v_k + v_n - 1) % (v_n - 1) + 1];
    end loop;

    for v_game in 0 .. v_games - 1 loop
      insert into public.tournament_games (club_id, tournament_id, round, wave, court_id, starts_at,
                                           a1_entry_id, a2_entry_id, b1_entry_id, b2_entry_id)
      values (
        v_tournament.club_id, v_tournament.id, v_round + 1, v_game / v_courts + 1,
        v_tournament.court_ids[v_game % v_courts + 1],
        lower(v_tournament.period)
          + make_interval(mins => (v_round * v_waves + v_game / v_courts) * v_tournament.round_minutes),
        v_pairs[4 * v_game + 1], v_pairs[4 * v_game + 2], v_pairs[4 * v_game + 3], v_pairs[4 * v_game + 4]
      );
    end loop;
  end loop;

  update public.tournaments set status = 'in_progress', rounds = v_rounds
   where id = v_tournament.id
  returning * into v_tournament;
  return v_tournament;
end;
$$;

-- Team A's points; team B gets the rest. Reception can correct it while the tournament is on.
create function public.record_tournament_score(p_game_id uuid, p_score_a integer)
returns public.tournament_games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.tournament_games;
  v_tournament public.tournaments;
begin
  select * into v_game from public.tournament_games where id = p_game_id;
  if not found then
    perform private.fail('not_found');
  end if;
  -- The tournament first, like finish_tournament, so a result and the end cannot cross.
  v_tournament := private.staff_tournament(v_game.tournament_id);
  if v_tournament.status <> 'in_progress' then
    perform private.fail('invalid_state');
  end if;
  if p_score_a is null or p_score_a not between 0 and v_tournament.points_per_game then
    perform private.fail('invalid_score');
  end if;

  update public.tournament_games
     set score_a = p_score_a, recorded_by = (select auth.uid()), recorded_at = now()
   where id = v_game.id
  returning * into v_game;
  return v_game;
end;
$$;

create function public.finish_tournament(p_tournament_id uuid)
returns public.tournaments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament public.tournaments := private.staff_tournament(p_tournament_id);
begin
  if v_tournament.status <> 'in_progress' then
    perform private.fail('invalid_state');
  end if;
  if exists (select 1 from public.tournament_games where tournament_id = v_tournament.id and score_a is null) then
    perform private.fail('scores_missing');
  end if;
  update public.tournaments set status = 'finished' where id = v_tournament.id returning * into v_tournament;
  return v_tournament;
end;
$$;

revoke execute on function public.start_tournament(uuid) from public, anon;
revoke execute on function public.record_tournament_score(uuid, integer) from public, anon;
revoke execute on function public.finish_tournament(uuid) from public, anon;
grant execute on function public.start_tournament(uuid) to authenticated;
grant execute on function public.record_tournament_score(uuid, integer) to authenticated;
grant execute on function public.finish_tournament(uuid) to authenticated;
```

- [ ] **Step 4: Apply and run the test**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/tournament_fixture.test.sql
```
Expected: PASS (26 tests). Correr el archivo tres veces seguidas: el orden inicial es al azar y las propiedades tienen que valer siempre.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261001000230_tournament_fixture.sql supabase/tests/database/tournament_fixture.test.sql
git commit -m "feat(db): build the americano fixture and record results"
```

---

### Task 7: Pagos de inscripción

**Files:**
- Create: `supabase/tests/database/tournament_payments.test.sql`
- Create: `supabase/migrations/20261001000240_tournament_payments.sql`

- [ ] **Step 1: Write the failing test** (con la herramienta Write)

`supabase/tests/database/tournament_payments.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/tournament.psql
select plan(23);

-- P1: $400, day 3. Ana, Bruno, Gabi and a guest.
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000001', test_helpers.slot(3, '18:00', 140));
call test_helpers.add_entry('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1');
call test_helpers.add_entry('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1');
call test_helpers.add_entry('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2');
call test_helpers.add_guests('e3000000-0000-0000-0000-000000000001', 1);
-- P2: $400, day 5. Juli paid cash; Hugo reported a transfer.
call test_helpers.make_tournament('e3000000-0000-0000-0000-000000000002', test_helpers.slot(5, '18:00', 140));
call test_helpers.add_entry('e3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a5');
call test_helpers.add_entry('e3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a3');
insert into public.payments (club_id, tournament_entry_id, method, amount, status, payer_id, confirmed_at) values
  ('a0000000-0000-0000-0000-000000000001',
   test_helpers.entry_of('e3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a5'),
   'cash', 400, 'confirmed', '00000000-0000-0000-0000-0000000000a5', now());
insert into public.payments (club_id, tournament_entry_id, method, amount, status, payer_id) values
  ('a0000000-0000-0000-0000-000000000001',
   test_helpers.entry_of('e3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a3'),
   'transfer', 400, 'reported', '00000000-0000-0000-0000-0000000000a3');

insert into storage.objects (bucket_id, name) values
  ('receipts', '00000000-0000-0000-0000-0000000000a1/r.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000a2/r.png');

set local role authenticated;

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.report_tournament_transfer(
       test_helpers.entry_of('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1'),
       '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'a player reports the transfer of her entry');
select results_eq(
  $$ select amount, payer_id, booking_id from public.payments
     where tournament_entry_id = test_helpers.entry_of('e3000000-0000-0000-0000-000000000001',
                                                       '00000000-0000-0000-0000-0000000000a1') $$,
  $$ values (400, '00000000-0000-0000-0000-0000000000a1'::uuid, null::uuid) $$,
  'for the whole price, as hers, with no booking');
select throws_ok(
  $$ select public.report_tournament_transfer(
       test_helpers.entry_of('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1'),
       '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'P0001', 'invalid_state', 'one reported transfer per entry');
select throws_ok(
  $$ select public.report_tournament_transfer(
       test_helpers.entry_of('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1'),
       '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'P0001', 'forbidden', 'only for her own entry');
select is((select count(*)::int from public.payments), 1, 'a player reads only her own payments');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.record_tournament_cash(
       test_helpers.entry_of('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1'), 400) $$,
  'reception records cash for an entry');
select throws_ok(
  $$ select public.record_tournament_cash(
       test_helpers.entry_of('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1'), 400) $$,
  'P0001', 'invalid_input', 'nobody pays more than the price');
select throws_ok(
  $$ select public.record_tournament_cash(
       test_helpers.entry_of('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1'), 400) $$,
  'P0001', 'invalid_input', 'cash does not cover what a reported transfer already covers');
select lives_ok(
  $$ select public.record_tournament_cash((select id from public.tournament_entries
       where tournament_id = 'e3000000-0000-0000-0000-000000000001' and guest_name = 'Invitado 1'), 400) $$,
  'a guest pays cash too');
select results_eq(
  $$ select p.payer_id from public.payments p join public.tournament_entries e on e.id = p.tournament_entry_id
     where e.guest_name = 'Invitado 1' $$,
  $$ values (null::uuid) $$,
  'with no payer');
select lives_ok(
  $$ select public.confirm_payment((select id from public.payments
       where payer_id = '00000000-0000-0000-0000-0000000000a1')) $$,
  'reception confirms the transfer');

-- Gabi reports, then leaves: her transfer is rejected.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ select public.report_tournament_transfer(
       test_helpers.entry_of('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2'),
       '00000000-0000-0000-0000-0000000000a2/r.png') $$,
  'another player reports hers');
select lives_ok($$ select public.leave_tournament('e3000000-0000-0000-0000-000000000001') $$, 'and leaves');
select results_eq(
  $$ select status::text, rejection_reason from public.payments
     where payer_id = '00000000-0000-0000-0000-0000000000a2' $$,
  $$ values ('rejected', 'Saliste del torneo') $$,
  'leaving rejects the reported transfer');

-- Ana paid and leaves: the payment stays, to be refunded.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok($$ select public.leave_tournament('e3000000-0000-0000-0000-000000000001') $$,
  'a player who paid can still leave while registration is open');
select is(
  (select status::text from public.payments where payer_id = '00000000-0000-0000-0000-0000000000a1'),
  'confirmed', 'her payment stays confirmed until the club gives it back');

-- Carla cancels P2.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok($$ select public.cancel_tournament('e3000000-0000-0000-0000-000000000002') $$,
  'reception cancels a tournament with payments');
select results_eq(
  $$ select p.status::text, p.rejection_reason from public.payments p
     join public.tournament_entries e on e.id = p.tournament_entry_id
     where e.tournament_id = 'e3000000-0000-0000-0000-000000000002'
     order by p.status $$,
  $$ values ('confirmed', null::text), ('rejected', 'Torneo cancelado') $$,
  'reported transfers are rejected, confirmed payments stay for a refund');

-- A transfer reported on an entry that left (as postgres) cannot be confirmed.
reset role;
insert into public.payments (club_id, tournament_entry_id, method, amount, status, payer_id)
select 'a0000000-0000-0000-0000-000000000001', id, 'transfer', 400, 'reported', '00000000-0000-0000-0000-0000000000a1'
from public.tournament_entries
where tournament_id = 'e3000000-0000-0000-0000-000000000001' and player_id = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;
select throws_ok(
  $$ select public.confirm_payment((select id from public.payments
       where payer_id = '00000000-0000-0000-0000-0000000000a1' and status = 'reported')) $$,
  'P0001', 'invalid_state', 'nothing is confirmed for an entry that left');
select lives_ok(
  $$ select public.refund_payment((select id from public.payments
       where payer_id = '00000000-0000-0000-0000-0000000000a1' and status = 'confirmed')) $$,
  'reception marks the refund');
select is(
  (select count(*)::int from public.payments
   where payer_id = '00000000-0000-0000-0000-0000000000a1' and status = 'refunded'),
  1, 'the payment is refunded');

select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in ('entry_due', 'drop_entry', 'tournament_fit', 'active_entry_count', 'staff_tournament',
                         'tournament_minutes')
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot execute the tournament helpers');

-- Anonymous visitor
set local role anon;
select throws_ok(
  $$ select public.report_tournament_transfer('e3000000-0000-0000-0000-000000000001', null) $$,
  '42501', null, 'anon cannot call report_tournament_transfer');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/tournament_payments.test.sql`
Expected: FAIL (`function public.report_tournament_transfer(uuid, unknown) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261001000240_tournament_payments.sql`:
```sql
-- Payments of tournament entries: like a booking of one player. What an entry owes is the price
-- minus its confirmed payments. The player reports a transfer with its receipt; reception confirms
-- or rejects it, records cash, and marks refunds (reject_payment and refund_payment work as they are).

-- The price minus confirmed payments; null for an unknown entry.
create function private.entry_due(p_entry_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select t.price - coalesce((
    select sum(p.amount) from public.payments p
    where p.tournament_entry_id = e.id and p.status = 'confirmed'
  ), 0)::integer
  from public.tournament_entries e
  join public.tournaments t on t.id = e.tournament_id
  where e.id = p_entry_id;
$$;

create function public.report_tournament_transfer(p_entry_id uuid, p_receipt_path text default null)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_entry public.tournament_entries;
  v_status public.tournament_status;
  v_club public.clubs;
  v_path text := nullif(trim(p_receipt_path), '');
  v_due integer;
  v_payment public.payments;
begin
  select * into v_entry from public.tournament_entries where id = p_entry_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null or v_entry.player_id is distinct from v_uid then
    perform private.fail('forbidden');
  end if;
  select status into v_status from public.tournaments where id = v_entry.tournament_id;
  if v_entry.removed_at is not null or v_status = 'cancelled' then
    perform private.fail('invalid_state');
  end if;

  select * into v_club from public.clubs where id = v_entry.club_id;
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
  if exists (select 1 from public.payments where tournament_entry_id = v_entry.id and status = 'reported') then
    perform private.fail('invalid_state');
  end if;

  v_due := private.entry_due(v_entry.id);
  if v_due <= 0 then
    perform private.fail('invalid_state');
  end if;

  insert into public.payments (club_id, tournament_entry_id, method, amount, status, receipt_path, reported_by,
                               payer_id)
  values (v_entry.club_id, v_entry.id, 'transfer', v_due, 'reported', v_path, v_uid, v_uid)
  returning * into v_payment;
  return v_payment;
end;
$$;

-- What a reported transfer already covers counts as spoken for: cash only takes the rest.
create function public.record_tournament_cash(p_entry_id uuid, p_amount integer)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_entry public.tournament_entries;
  v_status public.tournament_status;
  v_reported integer;
  v_payment public.payments;
begin
  select * into v_entry from public.tournament_entries where id = p_entry_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_entry.club_id) then
    perform private.fail('forbidden');
  end if;
  select status into v_status from public.tournaments where id = v_entry.tournament_id;
  if v_entry.removed_at is not null or v_status = 'cancelled' then
    perform private.fail('invalid_state');
  end if;
  if not (select accepts_cash from public.clubs where id = v_entry.club_id) then
    perform private.fail('method_disabled');
  end if;

  select coalesce(sum(amount), 0)::integer into v_reported
  from public.payments where tournament_entry_id = v_entry.id and status = 'reported';
  if p_amount is null or p_amount <= 0 or p_amount > private.entry_due(v_entry.id) - v_reported then
    perform private.fail('invalid_input');
  end if;

  insert into public.payments (club_id, tournament_entry_id, method, amount, status, payer_id, reported_by,
                               confirmed_by, confirmed_at)
  values (v_entry.club_id, v_entry.id, 'cash', p_amount, 'confirmed', v_entry.player_id, v_uid, v_uid, now())
  returning * into v_payment;
  return v_payment;
end;
$$;

-- A reported transfer is confirmed only up to what is still owed: for a booking (its price, or the
-- player's share in a match), or for an active entry of a tournament that was not cancelled.
create or replace function public.confirm_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments := private.staff_payment(p_payment_id);
  v_booking public.bookings;
  v_entry public.tournament_entries;
  v_tournament_status public.tournament_status;
  v_left integer;
begin
  if v_payment.status <> 'reported' then
    perform private.fail('invalid_state');
  end if;

  if v_payment.tournament_entry_id is not null then
    select * into v_entry from public.tournament_entries where id = v_payment.tournament_entry_id for update;
    select status into v_tournament_status from public.tournaments where id = v_entry.tournament_id;
    v_left := private.entry_due(v_entry.id);
    if v_entry.removed_at is not null or v_tournament_status = 'cancelled' or v_left is null
       or v_payment.amount > v_left then
      perform private.fail('invalid_state');
    end if;
  else
    select * into v_booking from public.bookings where id = v_payment.booking_id for update;
    v_left := case
      when v_payment.payer_id is null then v_booking.price - private.confirmed_amount(v_booking.id)
      else private.share_due(v_booking, v_payment.payer_id)
    end;
    if v_booking.status <> 'confirmed' or v_left is null or v_payment.amount > v_left then
      perform private.fail('invalid_state');
    end if;
  end if;

  update public.payments
     set status = 'confirmed', confirmed_by = (select auth.uid()), confirmed_at = now()
   where id = v_payment.id
  returning * into v_payment;
  return v_payment;
end;
$$;

revoke all on function private.entry_due(uuid) from public;
revoke execute on function public.report_tournament_transfer(uuid, text) from public, anon;
revoke execute on function public.record_tournament_cash(uuid, integer) from public, anon;
grant execute on function public.report_tournament_transfer(uuid, text) to authenticated;
grant execute on function public.record_tournament_cash(uuid, integer) to authenticated;
```

- [ ] **Step 4: Apply and run the tests**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/tournament_payments.test.sql
npx supabase test db supabase/tests/database/match_payments.test.sql
npx supabase test db supabase/tests/database/payments.test.sql
```
Expected: PASS (23 tests en el nuevo; los de pagos de reservas y partidos siguen en verde con el `confirm_payment` nuevo).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261001000240_tournament_payments.sql supabase/tests/database/tournament_payments.test.sql
git commit -m "feat(db): tournament entry payments"
```

---

### Task 8: Torneos en vivo (Realtime)

**Files:**
- Create: `supabase/tests/database/realtime_tournaments.test.sql`
- Create: `supabase/migrations/20261001000250_realtime_tournaments.sql`

- [ ] **Step 1: Write the failing test**

`supabase/tests/database/realtime_tournaments.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'
     and tablename in ('tournaments', 'tournament_entries', 'tournament_games')),
  3, 'tournament, entry and game changes are published to Realtime');
select is(
  (select array_agg(relreplident::text order by relname) from pg_class
   where oid in ('public.tournaments'::regclass, 'public.tournament_entries'::regclass,
                 'public.tournament_games'::regclass)),
  array['d', 'd', 'd'], 'the three keep the default replica identity');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/realtime_tournaments.test.sql`
Expected: FAIL (`have: 0, want: 3`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261001000250_realtime_tournaments.sql`:
```sql
-- The tournament screens, the lists and the club grid reload when a tournament, an entry or a game
-- changes. Realtime applies the select policies (members of the club) to the rows it streams; these
-- tables carry nothing a member may not read. The app never deletes them (entries are marked removed).
alter publication supabase_realtime add table public.tournaments, public.tournament_entries, public.tournament_games;
```

- [ ] **Step 4: Apply and run the test**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/realtime_tournaments.test.sql
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261001000250_realtime_tournaments.sql supabase/tests/database/realtime_tournaments.test.sql
git commit -m "feat(db): tournaments in realtime"
```

---

### Task 9: Tipos y verificación del corte 2

**Files:**
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: Regenerate types and check**

Run:
```bash
npm run db:types
npm run test:db
npm run typecheck
npm test
```
Expected: aparecen en `Functions` `create_tournament`, `cancel_tournament`, `join_tournament`, `leave_tournament`, `add_tournament_guest`, `remove_tournament_entry`, `close_tournament_registration`, `reopen_tournament_registration`, `start_tournament`, `record_tournament_score`, `finish_tournament`, `report_tournament_transfer`, `record_tournament_cash`. pgTAP completo, typecheck y Vitest en verde.

- [ ] **Step 2: Commit and push**

```bash
git add lib/supabase/database.types.ts
git commit -m "chore(types): tournament functions"
git push
```

---

## Corte 3: Dominio TS

Reglas puras, sin Supabase ni React. Cada módulo replica una regla de la base; la base tiene la última palabra.

### Task 10: Errores nuevos

**Files:**
- Modify: `lib/domain/errors.ts`
- Test: `tests/unit/lib/domain/errors.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/unit/lib/domain/errors.test.ts`, extend `DATABASE_CODES` (after `'already_paid', 'court_has_history',`):
```ts
  'tournament_closed', 'tournament_full', 'already_in_tournament', 'not_enough_players', 'scores_missing',
  'invalid_score', 'courts_busy', 'outside_hours',
```
replace the expectation of `busy_at_that_time` in `'explains the match rules in words'` with:
```ts
    expect(errorMessage('busy_at_that_time')).toBe('Ya tenés una reserva, un partido o un torneo a esa hora.')
```
and add:
```ts
  it('explains the tournament rules in words', () => {
    expect(errorMessage('not_enough_players')).toBe('Para armar el fixture tiene que haber 8, 12 o 16 anotados.')
    expect(errorMessage('courts_busy')).toBe('Alguna de esas canchas ya está ocupada en ese horario. Elegí otras u otro horario.')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/errors.test.ts`
Expected: FAIL (`translates tournament_closed`).

- [ ] **Step 3: Write minimal implementation**

In `lib/domain/errors.ts`, replace the `busy_at_that_time` line with:
```ts
  busy_at_that_time: 'Ya tenés una reserva, un partido o un torneo a esa hora.',
```
and add after `already_paid`:
```ts
  tournament_closed: 'La inscripción de este torneo está cerrada.',
  tournament_full: 'El torneo ya no tiene lugares.',
  already_in_tournament: 'Ya estás anotado en este torneo.',
  not_enough_players: 'Para armar el fixture tiene que haber 8, 12 o 16 anotados.',
  scores_missing: 'Faltan cargar resultados. Completalos antes de finalizar.',
  invalid_score: 'Ese resultado no puede ser: va de 0 a los puntos del partido.',
  courts_busy: 'Alguna de esas canchas ya está ocupada en ese horario. Elegí otras u otro horario.',
  outside_hours: 'El torneo tiene que empezar y terminar dentro del horario del club.',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/errors.ts tests/unit/lib/domain/errors.test.ts
git commit -m "feat(domain): Spanish text for the tournament errors"
```

---

### Task 11: Torneos: tipos, lectura y reglas (`lib/domain/tournaments.ts`)

**Files:**
- Create: `lib/domain/tournaments.ts`
- Create: `tests/unit/fixtures/tournaments.ts`
- Test: `tests/unit/lib/domain/tournaments.test.ts`

- [ ] **Step 1: Test fixture**

`tests/unit/fixtures/tournaments.ts`:
```ts
import type { Tournament, TournamentEntry, TournamentGame } from '@/lib/domain/tournaments'
import { at } from './grid'

// Players 1..count, all members, nobody paid yet.
export function makeEntries(count: number): TournamentEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `e${index + 1}`,
    playerId: `p${index + 1}`,
    name: `Jugador ${index + 1}`,
    isGuest: false,
    payments: [],
  }))
}

// Thursday 2026-10-01 (the grid fixture's day) 18:00 to 20:20, Cancha 1 and 2, mixed 4ª a 6ª,
// 8 players, 7 rounds of 20 minutes to 24 points, $400. Five signed up.
export function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 't1',
    name: 'Americano de octubre',
    startsAt: at('18:00'),
    endsAt: at('20:20'),
    courtIds: ['court-1', 'court-2'],
    courtNames: ['Cancha 1', 'Cancha 2'],
    maxPlayers: 8,
    pointsPerGame: 24,
    roundMinutes: 20,
    rounds: 7,
    categoryMin: 4,
    categoryMax: 6,
    type: 'mixed',
    price: 400,
    status: 'registration',
    entries: makeEntries(5),
    games: [],
    ...overrides,
  }
}

export function makeGame(
  id: string,
  teamA: [string, string],
  teamB: [string, string],
  scoreA: number | null,
  overrides: Partial<TournamentGame> = {},
): TournamentGame {
  return { id, round: 1, wave: 1, courtId: 'court-1', courtName: 'Cancha 1', startsAt: at('18:00'), teamA, teamB, scoreA, ...overrides }
}
```

- [ ] **Step 2: Write the failing test**

`tests/unit/lib/domain/tournaments.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  courtsText,
  entryNames,
  entryStatus,
  formatText,
  gamesByRound,
  missingScores,
  myEntry,
  openTournamentsText,
  spotsLabel,
  teamName,
  toTournament,
  tournamentLeaveStatus,
  tournamentMinutes,
  type TournamentRow,
} from '@/lib/domain/tournaments'
import { at } from '../../fixtures/grid'
import { BRUNO } from '../../fixtures/matches'
import { makeEntries, makeGame, makeTournament } from '../../fixtures/tournaments'

const ROW: TournamentRow = {
  id: 't1',
  name: 'Americano de octubre',
  starts_at: '2026-10-01T21:00:00+00:00',
  ends_at: '2026-10-01T23:20:00+00:00',
  court_ids: ['court-2', 'court-1'],
  max_players: 8,
  points_per_game: 24,
  round_minutes: 20,
  rounds: 7,
  category_min: 4,
  category_max: 6,
  match_type: 'mixed',
  price: 400,
  status: 'in_progress',
  entries: [
    { id: 'e2', player_id: null, guest_name: 'Pepe', removed_at: null, created_at: '2026-09-30T12:00:02Z', player: null, payments: [] },
    { id: 'e1', player_id: 'p1', guest_name: null, removed_at: null, created_at: '2026-09-30T12:00:01Z', player: { display_name: 'Ana Pérez' }, payments: [] },
    { id: 'e3', player_id: 'p3', guest_name: null, removed_at: null, created_at: '2026-09-30T12:00:03Z', player: null, payments: [] },
    { id: 'e4', player_id: 'p4', guest_name: null, removed_at: '2026-09-30T13:00:00Z', created_at: '2026-09-30T12:00:04Z', player: { display_name: 'Se fue' }, payments: [] },
  ],
  games: [
    { id: 'g2', round: 1, wave: 1, court_id: 'court-1', starts_at: '2026-10-01T21:00:00+00:00', a1_entry_id: 'e1', a2_entry_id: 'e2', b1_entry_id: 'e3', b2_entry_id: 'e5', score_a: null },
    { id: 'g1', round: 1, wave: 1, court_id: 'court-2', starts_at: '2026-10-01T21:00:00+00:00', a1_entry_id: 'e6', a2_entry_id: 'e7', b1_entry_id: 'e8', b2_entry_id: 'e9', score_a: 14 },
  ],
}
const COURT_NAMES = new Map([['court-1', 'Cancha 1'], ['court-2', 'Cancha 2']])
const CONTEXT = { now: at('08:00'), busy: [] }

describe('toTournament', () => {
  it('keeps who is still in, in sign-up order, with guest names and private profiles as "Jugador"', () => {
    const tournament = toTournament(ROW, COURT_NAMES)
    expect(tournament.entries.map((entry) => [entry.id, entry.name, entry.isGuest])).toEqual([
      ['e1', 'Ana Pérez', false],
      ['e2', 'Pepe', true],
      ['e3', 'Jugador', false],
    ])
    expect(tournament.startsAt).toEqual(new Date('2026-10-01T21:00:00Z'))
    expect(tournament.type).toBe('mixed')
  })

  it('names the courts and sorts the games by round, wave and court order', () => {
    const tournament = toTournament(ROW, COURT_NAMES)
    expect(tournament.courtNames).toEqual(['Cancha 2', 'Cancha 1'])
    expect(tournament.games.map((game) => [game.id, game.courtName, game.teamA, game.scoreA])).toEqual([
      ['g1', 'Cancha 2', ['e6', 'e7'], 14],
      ['g2', 'Cancha 1', ['e1', 'e2'], null],
    ])
  })
})

describe('tournamentMinutes', () => {
  it('is rounds times waves times minutes per round', () => {
    expect(tournamentMinutes({ players: 8, courts: 2, rounds: 7, roundMinutes: 20 })).toBe(140)
    expect(tournamentMinutes({ players: 12, courts: 2, rounds: 7, roundMinutes: 20 })).toBe(280)
    expect(tournamentMinutes({ players: 16, courts: 4, rounds: 7, roundMinutes: 20 })).toBe(140)
    expect(tournamentMinutes({ players: 16, courts: 3, rounds: 7, roundMinutes: 20 })).toBe(280)
  })
})

describe('labels', () => {
  it('shows how full it is while signing up, and the stage after', () => {
    expect(spotsLabel(makeTournament())).toBe('5 de 8')
    expect(spotsLabel(makeTournament({ status: 'closed', entries: makeEntries(8) }))).toBe('8 de 8')
    expect(spotsLabel(makeTournament({ status: 'in_progress' }))).toBe('En juego')
    expect(spotsLabel(makeTournament({ status: 'finished' }))).toBe('Finalizado')
  })

  it('lists courts and the format in words', () => {
    expect(courtsText(['Cancha 1'])).toBe('Cancha 1')
    expect(courtsText(['Cancha 1', 'Cancha 2'])).toBe('Cancha 1 y Cancha 2')
    expect(courtsText(['Cancha 1', 'Cancha 2', 'Cancha 3'])).toBe('Cancha 1, Cancha 2 y Cancha 3')
    expect(formatText(makeTournament())).toBe('7 rondas de 20 min, a 24 puntos')
  })

  it('counts the tournaments open for sign-up', () => {
    expect(openTournamentsText(0)).toBe('Ahora no hay torneos con inscripción abierta.')
    expect(openTournamentsText(1)).toBe('Torneos: 1 con inscripción abierta')
    expect(openTournamentsText(3)).toBe('Torneos: 3 con inscripción abierta')
  })
})

describe('entryStatus', () => {
  it('lets a player in the category sign up, with the price', () => {
    expect(entryStatus(makeTournament(), BRUNO, CONTEXT)).toEqual({ ok: true, text: 'Inscribirme, $400' })
    expect(entryStatus(makeTournament({ price: 0 }), BRUNO, CONTEXT)).toEqual({ ok: true, text: 'Inscribirme' })
  })

  it('says why not, in the same order as join_tournament', () => {
    const entered = makeTournament({ entries: [...makeEntries(2), { id: 'eb', playerId: 'bruno', name: 'Bruno', isGuest: false, payments: [] }] })
    expect(entryStatus(entered, BRUNO, CONTEXT).text).toBe('Ya estás anotado.')
    expect(entryStatus(makeTournament({ status: 'closed' }), BRUNO, CONTEXT).text).toBe('La inscripción está cerrada.')
    expect(entryStatus(makeTournament(), BRUNO, { ...CONTEXT, now: at('18:00') }).text).toBe('La inscripción está cerrada.')
    expect(entryStatus(makeTournament({ entries: makeEntries(8) }), BRUNO, CONTEXT).text).toBe('Ya no quedan lugares.')
    expect(entryStatus(makeTournament(), { ...BRUNO, category: null }, CONTEXT).text).toBe('Es para 4ª a 6ª y todavía no tenés categoría.')
    expect(entryStatus(makeTournament(), { ...BRUNO, category: 7 }, CONTEXT).text).toBe('Es para 4ª a 6ª y vos sos 7ª.')
    expect(entryStatus(makeTournament({ type: 'female' }), BRUNO, CONTEXT).text).toBe('Es un torneo femenino.')
    expect(
      entryStatus(makeTournament(), BRUNO, { ...CONTEXT, busy: [{ startsAt: at('19:00'), endsAt: at('20:30') }] }).text,
    ).toBe('Ya tenés una reserva, un partido o un torneo a esa hora.')
  })
})

describe('tournamentLeaveStatus', () => {
  it('lets a player leave only while registration is open', () => {
    const entries = [...makeEntries(2), { id: 'eb', playerId: 'bruno', name: 'Bruno', isGuest: false, payments: [] }]
    expect(tournamentLeaveStatus(makeTournament({ entries }), 'bruno')).toEqual({ allowed: true })
    expect(tournamentLeaveStatus(makeTournament({ entries, status: 'closed' }), 'bruno')).toEqual({
      allowed: false,
      reason: 'La inscripción ya cerró: para bajarte, avisá al club.',
    })
    expect(tournamentLeaveStatus(makeTournament({ entries, status: 'finished' }), 'bruno')).toBeNull()
    expect(tournamentLeaveStatus(makeTournament(), 'bruno')).toBeNull()
  })
})

describe('entries and games', () => {
  it('finds the viewer and names each team', () => {
    const tournament = makeTournament()
    expect(myEntry(tournament, 'p2')?.id).toBe('e2')
    expect(myEntry(tournament, 'nobody')).toBeNull()
    expect(teamName(['e1', 'e2'], entryNames(tournament))).toBe('Jugador 1 y Jugador 2')
    expect(teamName(['e1', 'gone'], entryNames(tournament))).toBe('Jugador 1 y Jugador')
  })

  it('groups games by round and counts the missing results', () => {
    const games = [
      makeGame('g1', ['e1', 'e2'], ['e3', 'e4'], 14),
      makeGame('g2', ['e5', 'e6'], ['e7', 'e8'], null),
      makeGame('g3', ['e1', 'e3'], ['e2', 'e4'], null, { round: 2 }),
    ]
    expect(gamesByRound(games).map(({ round, games: inRound }) => [round, inRound.map((game) => game.id)])).toEqual([
      [1, ['g1', 'g2']],
      [2, ['g3']],
    ])
    expect(missingScores(games)).toBe(2)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/tournaments.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/domain/tournaments"`).

- [ ] **Step 4: Write minimal implementation**

`lib/domain/tournaments.ts`:
```ts
import { formatPrice } from './format'
import { categoryRangeLabel, MATCH_TYPE_LABELS, overlaps, type MatchPlayer, type MatchType, type Period } from './matches'
import type { PaymentStatus } from './payments'
import { toDate } from './time'

export const TOURNAMENT_SIZES = [8, 12, 16] as const
export type TournamentStatus = 'registration' | 'closed' | 'in_progress' | 'finished' | 'cancelled'

// What "Nuevo americano" proposes (design, open question: Rustic's real numbers).
export const TOURNAMENT_DEFAULTS = { maxPlayers: 8, pointsPerGame: 24, roundMinutes: 20, rounds: 7, price: 400 } as const

export const TOURNAMENT_STATUS_LABELS: Record<TournamentStatus, string> = {
  registration: 'Inscripción abierta',
  closed: 'Inscripción cerrada',
  in_progress: 'En juego',
  finished: 'Finalizado',
  cancelled: 'Cancelado',
}

export type EntryPayment = { status: PaymentStatus; amount: number; rejection_reason: string | null; created_at: string }
export type TournamentEntry = { id: string; playerId: string | null; name: string; isGuest: boolean; payments: EntryPayment[] }
// Team A is teamA[0] + teamA[1]; scoreA is their points, team B has the rest (tournament-ranking.ts).
export type TournamentGame = {
  id: string
  round: number
  wave: number
  courtId: string
  courtName: string
  startsAt: Date
  teamA: [string, string]
  teamB: [string, string]
  scoreA: number | null
}
export type Tournament = Period & {
  id: string
  name: string
  courtIds: string[]
  courtNames: string[]
  maxPlayers: number
  pointsPerGame: number
  roundMinutes: number
  rounds: number
  categoryMin: number
  categoryMax: number
  type: MatchType
  price: number
  status: TournamentStatus
  // Only the ones still in; payments come back only to their payer and to staff (RLS).
  entries: TournamentEntry[]
  games: TournamentGame[]
}

// What lib/data/tournaments.ts reads. If supabase-js infers a slightly different shape for the
// embeds, adjust this type to match; never cast the query result.
export type TournamentRow = {
  id: string
  name: string
  starts_at: string | null
  ends_at: string | null
  court_ids: string[]
  max_players: number
  points_per_game: number
  round_minutes: number
  rounds: number
  category_min: number
  category_max: number
  match_type: MatchType
  price: number
  status: TournamentStatus
  entries: {
    id: string
    player_id: string | null
    guest_name: string | null
    removed_at: string | null
    created_at: string
    player: { display_name: string } | null
    payments: EntryPayment[]
  }[]
  games: {
    id: string
    round: number
    wave: number
    court_id: string
    starts_at: string
    a1_entry_id: string
    a2_entry_id: string
    b1_entry_id: string
    b2_entry_id: string
    score_a: number | null
  }[]
}

export function toTournament(row: TournamentRow, courtNames: Map<string, string>): Tournament {
  const courtName = (id: string) => courtNames.get(id) ?? 'Cancha'
  const courtOrder = (id: string) => row.court_ids.indexOf(id)
  return {
    id: row.id,
    name: row.name,
    startsAt: toDate(row.starts_at),
    endsAt: toDate(row.ends_at),
    courtIds: row.court_ids,
    courtNames: row.court_ids.map(courtName),
    maxPlayers: row.max_players,
    pointsPerGame: row.points_per_game,
    roundMinutes: row.round_minutes,
    rounds: row.rounds,
    categoryMin: row.category_min,
    categoryMax: row.category_max,
    type: row.match_type,
    price: row.price,
    status: row.status,
    entries: row.entries
      .filter((entry) => entry.removed_at === null)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((entry) => ({
        id: entry.id,
        playerId: entry.player_id,
        // A private profile is not readable by other members (RLS): the entry shows it is taken.
        name: entry.guest_name ?? entry.player?.display_name ?? 'Jugador',
        isGuest: entry.player_id === null,
        payments: entry.payments,
      })),
    games: row.games
      .map((game) => ({
        id: game.id,
        round: game.round,
        wave: game.wave,
        courtId: game.court_id,
        courtName: courtName(game.court_id),
        startsAt: toDate(game.starts_at),
        teamA: [game.a1_entry_id, game.a2_entry_id] as [string, string],
        teamB: [game.b1_entry_id, game.b2_entry_id] as [string, string],
        scoreA: game.score_a,
      }))
      .sort((a, b) => a.round - b.round || a.wave - b.wave || courtOrder(a.courtId) - courtOrder(b.courtId)),
  }
}

// Same as private.tournament_minutes: the games of a round (players / 4) spread over the courts in waves.
export function wavesFor(players: number, courts: number): number {
  return Math.ceil(players / 4 / Math.max(1, courts))
}

export function tournamentMinutes(shape: { players: number; courts: number; rounds: number; roundMinutes: number }): number {
  return shape.rounds * wavesFor(shape.players, shape.courts) * shape.roundMinutes
}

export function spotsLabel(tournament: Pick<Tournament, 'status' | 'entries' | 'maxPlayers'>): string {
  if (tournament.status === 'registration' || tournament.status === 'closed') {
    return `${tournament.entries.length} de ${tournament.maxPlayers}`
  }
  return TOURNAMENT_STATUS_LABELS[tournament.status]
}

export function courtsText(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

export function formatText(tournament: Pick<Tournament, 'rounds' | 'roundMinutes' | 'pointsPerGame'>): string {
  return `${tournament.rounds} rondas de ${tournament.roundMinutes} min, a ${tournament.pointsPerGame} puntos`
}

export function openTournamentsText(count: number): string {
  if (count === 0) return 'Ahora no hay torneos con inscripción abierta.'
  return `Torneos: ${count} con inscripción abierta`
}

export function myEntry(tournament: Pick<Tournament, 'entries'>, playerId: string): TournamentEntry | null {
  return tournament.entries.find((entry) => entry.playerId === playerId) ?? null
}

export function entryNames(tournament: Pick<Tournament, 'entries'>): Map<string, string> {
  return new Map(tournament.entries.map((entry) => [entry.id, entry.name]))
}

export function teamName(team: [string, string], names: Map<string, string>): string {
  return team.map((id) => names.get(id) ?? 'Jugador').join(' y ')
}

export function gamesByRound(games: TournamentGame[]): { round: number; games: TournamentGame[] }[] {
  const rounds = new Map<number, TournamentGame[]>()
  for (const game of games) rounds.set(game.round, [...(rounds.get(game.round) ?? []), game])
  return [...rounds.entries()].sort(([a], [b]) => a - b).map(([round, inRound]) => ({ round, games: inRound }))
}

export function missingScores(games: TournamentGame[]): number {
  return games.filter((game) => game.scoreA === null).length
}

export type EntryContext = { now: Date; busy: Period[] }
export type EntryStatus = { ok: true; text: string } | { ok: false; text: string }

const no = (text: string): EntryStatus => ({ ok: false, text })

// Same rules and order as join_tournament (with "already in" first, as the cards need it).
export function entryStatus(tournament: Tournament, player: MatchPlayer, context: EntryContext): EntryStatus {
  if (myEntry(tournament, player.id)) return no('Ya estás anotado.')
  if (tournament.status !== 'registration' || tournament.startsAt <= context.now) return no('La inscripción está cerrada.')
  if (tournament.entries.length >= tournament.maxPlayers) return no('Ya no quedan lugares.')
  const range = categoryRangeLabel(tournament.categoryMin, tournament.categoryMax)
  if (player.category === null) return no(`Es para ${range} y todavía no tenés categoría.`)
  if (player.category < tournament.categoryMin || player.category > tournament.categoryMax) {
    return no(`Es para ${range} y vos sos ${player.category}ª.`)
  }
  if (tournament.type !== 'mixed' && player.gender !== tournament.type) {
    return no(`Es un torneo ${MATCH_TYPE_LABELS[tournament.type].toLowerCase()}.`)
  }
  if (context.busy.some((period) => overlaps(period, tournament))) {
    return no('Ya tenés una reserva, un partido o un torneo a esa hora.')
  }
  return { ok: true, text: tournament.price > 0 ? `Inscribirme, ${formatPrice(tournament.price)}` : 'Inscribirme' }
}

export type TournamentLeaveStatus = { allowed: true } | { allowed: false; reason: string } | null

// Same rule as leave_tournament: only while registration is open.
export function tournamentLeaveStatus(tournament: Tournament, playerId: string): TournamentLeaveStatus {
  if (!myEntry(tournament, playerId) || tournament.status === 'finished' || tournament.status === 'cancelled') return null
  if (tournament.status !== 'registration') {
    return { allowed: false, reason: 'La inscripción ya cerró: para bajarte, avisá al club.' }
  }
  return { allowed: true }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/tournaments.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/tournaments.ts tests/unit/fixtures/tournaments.ts tests/unit/lib/domain/tournaments.test.ts
git commit -m "feat(domain): tournaments, sign-up rules and labels"
```

---

### Task 12: Ranking (`lib/domain/tournament-ranking.ts`)

**Files:**
- Create: `lib/domain/tournament-ranking.ts`
- Test: `tests/unit/lib/domain/tournament-ranking.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/tournament-ranking.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { ranking, scoreB } from '@/lib/domain/tournament-ranking'
import { makeGame } from '../../fixtures/tournaments'

const entry = (id: string, name: string) => ({ id, name })

describe('scoreB', () => {
  it('is what is left of the game', () => {
    expect(scoreB(14, 24)).toBe(10)
    expect(scoreB(0, 24)).toBe(24)
  })
})

describe('ranking', () => {
  const entries = [entry('e1', 'Ana'), entry('e2', 'Bruno'), entry('e3', 'Carla'), entry('e4', 'Dani')]

  it('adds points, games played, games won and difference; unrecorded games do not count', () => {
    const rows = ranking(
      entries,
      [
        makeGame('g1', ['e1', 'e2'], ['e3', 'e4'], 13),
        makeGame('g2', ['e1', 'e3'], ['e2', 'e4'], 11),
        makeGame('g3', ['e1', 'e4'], ['e2', 'e3'], 12),
        makeGame('g4', ['e1', 'e2'], ['e3', 'e4'], null),
      ],
      24,
    )
    expect(rows).toEqual([
      { entryId: 'e2', name: 'Bruno', position: 1, points: 38, played: 3, won: 2, diff: 4 },
      { entryId: 'e1', name: 'Ana', position: 2, points: 36, played: 3, won: 1, diff: 0 },
      { entryId: 'e4', name: 'Dani', position: 2, points: 36, played: 3, won: 1, diff: 0 },
      { entryId: 'e3', name: 'Carla', position: 4, points: 34, played: 3, won: 0, diff: -4 },
    ])
  })

  it('breaks ties by games won, then by difference', () => {
    const people = [entry('zoe', 'Zoe'), entry('ana', 'Ana'), entry('bea', 'Bea'), ...['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].map((id) => entry(id, id))]
    const rows = ranking(
      people,
      [
        makeGame('g1', ['zoe', 'f1'], ['f2', 'f3'], 13),
        makeGame('g2', ['zoe', 'f4'], ['f5', 'f6'], 11),
        makeGame('g3', ['ana', 'f1'], ['f2', 'f4'], 12),
        makeGame('g4', ['ana', 'f5'], ['f3', 'f6'], 12),
        makeGame('g5', ['bea', 'f2'], ['f3', 'f4'], 24),
      ],
      24,
    )
    const order = rows.filter((row) => ['zoe', 'ana', 'bea'].includes(row.entryId)).map((row) => row.entryId)
    expect(order).toEqual(['bea', 'zoe', 'ana'])
  })

  it('lists everyone at zero before the first result', () => {
    expect(ranking(entries, [], 24).map((row) => [row.name, row.position, row.points])).toEqual([
      ['Ana', 1, 0],
      ['Bruno', 1, 0],
      ['Carla', 1, 0],
      ['Dani', 1, 0],
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/tournament-ranking.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/domain/tournament-ranking"`).

- [ ] **Step 3: Write minimal implementation**

`lib/domain/tournament-ranking.ts`:
```ts
import type { TournamentEntry, TournamentGame } from './tournaments'

export type RankingRow = {
  entryId: string
  name: string
  position: number
  points: number
  played: number
  won: number
  diff: number
}

// Team B's points: what is left of the game (the database stores only team A's).
export function scoreB(scoreA: number, pointsPerGame: number): number {
  return pointsPerGame - scoreA
}

// Design: points, then games won, then difference. Ties on all three share the position; the name
// only keeps the order stable. Games without a result do not count yet.
export function ranking(
  entries: Pick<TournamentEntry, 'id' | 'name'>[],
  games: TournamentGame[],
  pointsPerGame: number,
): RankingRow[] {
  const rows = new Map(
    entries.map((entry) => [entry.id, { entryId: entry.id, name: entry.name, position: 0, points: 0, played: 0, won: 0, diff: 0 }]),
  )
  const add = (team: [string, string], own: number, other: number) => {
    for (const id of team) {
      const row = rows.get(id)
      if (!row) continue
      row.points += own
      row.played += 1
      row.won += own > other ? 1 : 0
      row.diff += own - other
    }
  }
  for (const game of games) {
    if (game.scoreA === null) continue
    const b = scoreB(game.scoreA, pointsPerGame)
    add(game.teamA, game.scoreA, b)
    add(game.teamB, b, game.scoreA)
  }

  const sorted = [...rows.values()].sort(
    (a, b) => b.points - a.points || b.won - a.won || b.diff - a.diff || a.name.localeCompare(b.name, 'es'),
  )
  sorted.forEach((row, index) => {
    const previous = sorted[index - 1]
    const tied = previous && previous.points === row.points && previous.won === row.won && previous.diff === row.diff
    row.position = tied ? previous.position : index + 1
  })
  return sorted
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/tournament-ranking.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/tournament-ranking.ts tests/unit/lib/domain/tournament-ranking.test.ts
git commit -m "feat(domain): americano ranking with tie-breaks"
```

---

### Task 13: Formulario "Nuevo americano" (`lib/domain/tournament-form.ts`)

**Files:**
- Create: `lib/domain/tournament-form.ts`
- Test: `tests/unit/lib/domain/tournament-form.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/tournament-form.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { busyCourtIds, fitsOpeningHours, parseTournamentForm, tournamentPeriod } from '@/lib/domain/tournament-form'
import { at, TIMEZONE } from '../../fixtures/grid'

const C1 = '22222222-2222-2222-2222-222222222201'
const C2 = '22222222-2222-2222-2222-222222222202'
const C3 = '22222222-2222-2222-2222-222222222203'
const VALID: Record<string, string | string[]> = {
  name: ' Americano de octubre ',
  date: '2026-10-01',
  time: '18:00',
  courtIds: [C1, C2],
  maxPlayers: '8',
  pointsPerGame: '24',
  roundMinutes: '20',
  rounds: '7',
  categoryMin: '4',
  categoryMax: '6',
  type: 'mixed',
  price: '400',
}

function tournamentForm(overrides: Record<string, string | string[]> = {}): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries({ ...VALID, ...overrides })) {
    for (const item of Array.isArray(value) ? value : [value]) form.append(key, item)
  }
  return form
}

const messageOf = (overrides: Record<string, string | string[]>) => {
  const result = parseTournamentForm(tournamentForm(overrides), TIMEZONE)
  return result.ok ? null : result.message
}

describe('parseTournamentForm', () => {
  it('reads a valid americano, with the start on the club clock', () => {
    expect(parseTournamentForm(tournamentForm(), TIMEZONE)).toEqual({
      ok: true,
      value: {
        name: 'Americano de octubre',
        startsAt: '2026-10-01T21:00:00.000Z',
        courtIds: [C1, C2],
        maxPlayers: 8,
        pointsPerGame: 24,
        roundMinutes: 20,
        rounds: 7,
        categoryMin: 4,
        categoryMax: 6,
        type: 'mixed',
        price: 400,
      },
    })
  })

  it('explains each mistake in Spanish', () => {
    expect(messageOf({ name: '' })).toBe('Poné un nombre de hasta 60 letras.')
    expect(messageOf({ date: '2026-02-30' })).toBe('Elegí el día y la hora.')
    expect(messageOf({ courtIds: [] })).toBe('Elegí las canchas.')
    expect(messageOf({ courtIds: [C1, C1] })).toBe('Elegí las canchas.')
    expect(messageOf({ courtIds: [C1, 'cancha-2'] })).toBe('Elegí las canchas.')
    expect(messageOf({ maxPlayers: '10' })).toBe('El cupo es de 8, 12 o 16 jugadores.')
    expect(messageOf({ courtIds: [C1, C2, C3] })).toBe('Con 8 jugadores se usan hasta 2 canchas.')
    expect(messageOf({ pointsPerGame: '0' })).toBe('Los puntos por partido van de 1 a 99.')
    expect(messageOf({ roundMinutes: '120' })).toBe('Los minutos por ronda van de 5 a 90.')
    expect(messageOf({ rounds: '8' })).toBe('Con 8 jugadores se juegan de 1 a 7 rondas.')
    expect(messageOf({ categoryMin: '6', categoryMax: '4' })).toBe('La categoría "desde" tiene que ser menor o igual que "hasta".')
    expect(messageOf({ type: 'kids' })).toBe('Elegí el género.')
    expect(messageOf({ price: 'mil' })).toBe('Ingresá el precio en pesos, sin puntos.')
  })
})

describe('tournamentPeriod and the checks around it', () => {
  const shape = { players: 8, courts: 2, rounds: 7, roundMinutes: 20 }
  const schedule = { timezone: TIMEZONE, opensAt: '08:00:00', closesAt: '23:00:00' }

  it('ends after all its rounds and waves', () => {
    expect(tournamentPeriod(at('18:00'), shape)).toEqual({ startsAt: at('18:00'), endsAt: at('20:20') })
  })

  it('has to fit in the club hours', () => {
    expect(fitsOpeningHours(tournamentPeriod(at('18:00'), shape), schedule)).toBe(true)
    expect(fitsOpeningHours(tournamentPeriod(at('21:30'), shape), schedule)).toBe(false)
    expect(fitsOpeningHours(tournamentPeriod(at('07:00'), shape), schedule)).toBe(false)
  })

  it('finds which chosen courts are already taken at that time', () => {
    const taken = [
      { courtId: C1, startsAt: at('19:00'), endsAt: at('20:30') },
      { courtId: C2, startsAt: at('20:20'), endsAt: at('21:50') },
      { courtId: C3, startsAt: at('18:00'), endsAt: at('19:30') },
    ]
    expect(busyCourtIds(taken, [C1, C2], tournamentPeriod(at('18:00'), shape))).toEqual([C1])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/tournament-form.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/domain/tournament-form"`).

- [ ] **Step 3: Write minimal implementation**

`lib/domain/tournament-form.ts`:
```ts
import { isUuid, readEnum, readInt, readLocalDate, readText, readTime } from './input'
import { MATCH_TYPES, overlaps, type MatchType, type Period } from './matches'
import type { ParseResult } from './settings'
import { localDateOf, parseTime, zonedTime } from './time'
import { TOURNAMENT_SIZES, tournamentMinutes } from './tournaments'

export type TournamentInput = {
  name: string
  startsAt: string
  courtIds: string[]
  maxPlayers: number
  pointsPerGame: number
  roundMinutes: number
  rounds: number
  categoryMin: number
  categoryMax: number
  type: MatchType
  price: number
}

export type TakenPeriod = { courtId: string; startsAt: Date; endsAt: Date }

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message }
}

// Same limits as create_tournament, with a Spanish message for each. The date and time are on the
// club's clock; the instant goes to the database.
export function parseTournamentForm(form: FormData, timezone: string): ParseResult<TournamentInput> {
  const name = readText(form, 'name', { maxLength: 60 })
  if (!name) return fail('Poné un nombre de hasta 60 letras.')
  const date = readLocalDate(form, 'date')
  const time = readTime(form, 'time')
  if (!date || !time) return fail('Elegí el día y la hora.')

  const rawCourts = form.getAll('courtIds')
  const courtIds = [...new Set(rawCourts.filter(isUuid).map((id) => id.toLowerCase()))]
  if (courtIds.length === 0 || courtIds.length !== rawCourts.length) return fail('Elegí las canchas.')

  const maxPlayers = readInt(form, 'maxPlayers', { min: 8, max: 16 })
  if (maxPlayers === null || !(TOURNAMENT_SIZES as readonly number[]).includes(maxPlayers)) {
    return fail('El cupo es de 8, 12 o 16 jugadores.')
  }
  if (courtIds.length > maxPlayers / 4) return fail(`Con ${maxPlayers} jugadores se usan hasta ${maxPlayers / 4} canchas.`)

  const pointsPerGame = readInt(form, 'pointsPerGame', { min: 1, max: 99 })
  if (pointsPerGame === null) return fail('Los puntos por partido van de 1 a 99.')
  const roundMinutes = readInt(form, 'roundMinutes', { min: 5, max: 90 })
  if (roundMinutes === null) return fail('Los minutos por ronda van de 5 a 90.')
  const rounds = readInt(form, 'rounds', { min: 1, max: maxPlayers - 1 })
  if (rounds === null) return fail(`Con ${maxPlayers} jugadores se juegan de 1 a ${maxPlayers - 1} rondas.`)

  const categoryMin = readInt(form, 'categoryMin', { min: 1, max: 8 })
  const categoryMax = readInt(form, 'categoryMax', { min: 1, max: 8 })
  if (categoryMin === null || categoryMax === null || categoryMin > categoryMax) {
    return fail('La categoría "desde" tiene que ser menor o igual que "hasta".')
  }
  const type = readEnum(form, 'type', MATCH_TYPES)
  if (!type) return fail('Elegí el género.')
  const price = readInt(form, 'price', { min: 0, max: 10_000_000 })
  if (price === null) return fail('Ingresá el precio en pesos, sin puntos.')

  return {
    ok: true,
    value: {
      name,
      startsAt: zonedTime(date, parseTime(time), timezone).toISOString(),
      courtIds,
      maxPlayers,
      pointsPerGame,
      roundMinutes,
      rounds,
      categoryMin,
      categoryMax,
      type,
      price,
    },
  }
}

// From the start to the end its maximum size needs, like create_tournament.
export function tournamentPeriod(
  startsAt: Date,
  shape: { players: number; courts: number; rounds: number; roundMinutes: number },
): Period {
  return { startsAt, endsAt: new Date(startsAt.getTime() + tournamentMinutes(shape) * 60_000) }
}

// Same rule as create_tournament (outside_hours): starts after opening, ends before closing, same day.
export function fitsOpeningHours(period: Period, schedule: { timezone: string; opensAt: string; closesAt: string }): boolean {
  const date = localDateOf(period.startsAt, schedule.timezone)
  const opens = zonedTime(date, parseTime(schedule.opensAt), schedule.timezone)
  const closes = zonedTime(date, parseTime(schedule.closesAt), schedule.timezone)
  return period.startsAt >= opens && period.endsAt <= closes
}

// The chosen courts that already have something at that time (the database answers courts_busy).
export function busyCourtIds(taken: TakenPeriod[], courtIds: string[], period: Period): string[] {
  return courtIds.filter((id) => taken.some((item) => item.courtId === id && overlaps(item, period)))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/tournament-form.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/tournament-form.ts tests/unit/lib/domain/tournament-form.test.ts
git commit -m "feat(domain): read and check the new tournament form"
```

---

### Task 14: Pagos de inscripción (`lib/domain/tournament-payments.ts`)

**Files:**
- Create: `lib/domain/tournament-payments.ts`
- Test: `tests/unit/lib/domain/tournament-payments.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/tournament-payments.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { entryPaymentView, entryRefunds, unpaidEntries, type OverviewEntry, type OverviewTournament } from '@/lib/domain/tournament-payments'

const pay = (status: 'reported' | 'confirmed' | 'rejected' | 'refunded', created_at = '2026-09-30T12:00:00Z', rejection_reason: string | null = null) => ({
  status,
  amount: 400,
  rejection_reason,
  created_at,
})

describe('entryPaymentView', () => {
  it('owes the price until a payment is confirmed', () => {
    expect(entryPaymentView(400, [], true)).toEqual({ state: 'pending', due: 400, canReportTransfer: true, rejectionReason: null })
    expect(entryPaymentView(400, [pay('reported')], true)).toMatchObject({ state: 'reported', due: 400, canReportTransfer: false })
    expect(entryPaymentView(400, [pay('confirmed')], true)).toMatchObject({ state: 'paid', due: 0, canReportTransfer: false })
    expect(entryPaymentView(0, [], true)).toMatchObject({ state: 'paid', due: 0 })
  })

  it('shows why the club rejected the last transfer, and hides the button if the club takes no transfers', () => {
    expect(entryPaymentView(400, [pay('rejected', '2026-09-30T12:00:00Z', 'No llegó')], true).rejectionReason).toBe('No llegó')
    expect(entryPaymentView(400, [], false).canReportTransfer).toBe(false)
  })
})

describe('Cobros for tournaments', () => {
  const NOW = new Date('2026-10-02T12:00:00Z')
  const tournaments: OverviewTournament[] = [
    { id: 't1', name: 'Americano', starts_at: '2026-10-01T21:00:00+00:00', price: 400, status: 'finished' },
    { id: 't2', name: 'Suspendido', starts_at: '2026-10-01T21:00:00+00:00', price: 400, status: 'cancelled' },
    { id: 't3', name: 'Próximo', starts_at: '2026-10-05T21:00:00+00:00', price: 400, status: 'registration' },
  ]
  const entry = (overrides: Partial<OverviewEntry>): OverviewEntry => ({
    id: 'e',
    tournament_id: 't1',
    guest_name: null,
    removed_at: null,
    player: { display_name: 'Ana' },
    payments: [],
    ...overrides,
  })
  const entries: OverviewEntry[] = [
    entry({ id: 'e1' }),
    entry({ id: 'e2', guest_name: 'Pepe', player: null, payments: [{ id: 'p2', status: 'confirmed', amount: 400 }] }),
    entry({ id: 'e3', removed_at: '2026-09-30T12:00:00Z', payments: [{ id: 'p3', status: 'confirmed', amount: 400 }] }),
    entry({ id: 'e4', tournament_id: 't2', payments: [{ id: 'p4', status: 'confirmed', amount: 400 }] }),
    entry({ id: 'e5', tournament_id: 't3' }),
    entry({ id: 'e6', player: { display_name: 'Bruno' }, payments: [{ id: 'p6', status: 'reported', amount: 400 }] }),
  ]

  it('lists entries of tournaments already played that still owe, without a reported transfer', () => {
    expect(unpaidEntries(tournaments, entries, NOW)).toEqual([
      { entryId: 'e1', holder: 'Ana', startsAt: new Date('2026-10-01T21:00:00Z'), tournamentName: 'Americano', due: 400 },
    ])
  })

  it('lists what was paid by who left or for a cancelled tournament', () => {
    expect(entryRefunds(tournaments, entries)).toEqual([
      { paymentId: 'p3', holder: 'Ana', startsAt: new Date('2026-10-01T21:00:00Z'), courtName: 'Torneo Americano', amount: 400 },
      { paymentId: 'p4', holder: 'Ana', startsAt: new Date('2026-10-01T21:00:00Z'), courtName: 'Torneo Suspendido', amount: 400 },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/tournament-payments.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/domain/tournament-payments"`).

- [ ] **Step 3: Write minimal implementation**

`lib/domain/tournament-payments.ts`:
```ts
import type { OverviewPayment, RefundItem } from './payments-overview'
import { amountDue, paymentState, type PaymentLike, type PaymentState } from './payments'
import { toDate } from './time'
import type { EntryPayment, TournamentStatus } from './tournaments'

export type EntryPaymentView = { state: PaymentState; due: number; canReportTransfer: boolean; rejectionReason: string | null }

// Same rule as private.entry_due: the price minus confirmed payments. A free tournament is paid.
export function entryPaymentView(price: number, payments: EntryPayment[], acceptsTransfer: boolean): EntryPaymentView {
  const state = paymentState({ price, status: 'confirmed' }, payments)
  const latest = [...payments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  return {
    state,
    due: amountDue(price, payments),
    canReportTransfer: acceptsTransfer && state === 'pending',
    rejectionReason: state === 'pending' && latest?.status === 'rejected' ? (latest.rejection_reason ?? 'sin motivo') : null,
  }
}

// What lib/data/payments.ts reads for Cobros.
export type OverviewTournament = { id: string; name: string; starts_at: string | null; price: number; status: TournamentStatus }
export type OverviewEntry = {
  id: string
  tournament_id: string
  guest_name: string | null
  removed_at: string | null
  player: { display_name: string } | null
  payments: OverviewPayment[]
}
export type UnpaidEntryItem = { entryId: string; holder: string; startsAt: Date; tournamentName: string; due: number }

const holderOf = (entry: OverviewEntry) => entry.guest_name ?? entry.player?.display_name ?? 'Jugador'

// Entries of tournaments that already started (not cancelled) that still owe and have no transfer
// waiting for review. Before it starts, reception charges from the tournament page.
export function unpaidEntries(tournaments: OverviewTournament[], entries: OverviewEntry[], now: Date): UnpaidEntryItem[] {
  const byId = new Map(tournaments.map((tournament) => [tournament.id, tournament]))
  return entries.flatMap((entry) => {
    const tournament = byId.get(entry.tournament_id)
    if (!tournament || tournament.status === 'cancelled' || entry.removed_at !== null) return []
    const startsAt = toDate(tournament.starts_at)
    const payments: PaymentLike[] = entry.payments
    if (startsAt > now || paymentState({ price: tournament.price, status: 'confirmed' }, payments) !== 'pending') return []
    return [{ entryId: entry.id, holder: holderOf(entry), startsAt, tournamentName: tournament.name, due: amountDue(tournament.price, payments) }]
  })
}

// Money the club took for an entry that left or a tournament that was cancelled: given back by hand.
export function entryRefunds(tournaments: OverviewTournament[], entries: OverviewEntry[]): RefundItem[] {
  const byId = new Map(tournaments.map((tournament) => [tournament.id, tournament]))
  return entries.flatMap((entry) => {
    const tournament = byId.get(entry.tournament_id)
    if (!tournament || (entry.removed_at === null && tournament.status !== 'cancelled')) return []
    return entry.payments
      .filter((payment) => payment.status === 'confirmed')
      .map((payment) => ({
        paymentId: payment.id,
        holder: holderOf(entry),
        startsAt: toDate(tournament.starts_at),
        courtName: `Torneo ${tournament.name}`,
        amount: payment.amount,
      }))
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/tournament-payments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/tournament-payments.ts tests/unit/lib/domain/tournament-payments.test.ts
git commit -m "feat(domain): tournament entry payments and Cobros lists"
```

---

### Task 15: Texto para compartir (`lib/domain/tournament-share.ts`)

**Files:**
- Create: `lib/domain/tournament-share.ts`
- Test: `tests/unit/lib/domain/tournament-share.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/tournament-share.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { tournamentShareText } from '@/lib/domain/tournament-share'
import { makeEntries, makeTournament } from '../../fixtures/tournaments'

const input = { clubName: 'Rustic Pádel', dayText: 'jueves 1 de octubre', timeText: '18:00 a 20:20', url: 'https://app.test/torneos/t1' }

describe('tournamentShareText', () => {
  it('says what, when, where, for whom, how many spots are left and how much', () => {
    expect(tournamentShareText({ ...input, tournament: makeTournament() })).toBe(
      [
        '🏆 Americano de octubre',
        'jueves 1 de octubre, 18:00 a 20:20',
        'Rustic Pádel, Cancha 1 y Cancha 2',
        'Categoría 4ª a 6ª, mixto',
        'Quedan 3 lugares (5 de 8)',
        '$400 por persona',
        '',
        'Anotate acá: https://app.test/torneos/t1',
      ].join('\n'),
    )
  })

  it('handles the last spot, a full tournament and a free one', () => {
    expect(tournamentShareText({ ...input, tournament: makeTournament({ entries: makeEntries(7) }) })).toContain('Queda 1 lugar (7 de 8)')
    const full = tournamentShareText({ ...input, tournament: makeTournament({ entries: makeEntries(8), price: 0 }) })
    expect(full).toContain('Cupo completo')
    expect(full).not.toContain('por persona')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/tournament-share.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/domain/tournament-share"`).

- [ ] **Step 3: Write minimal implementation**

`lib/domain/tournament-share.ts`:
```ts
import { formatPrice } from './format'
import { categoryRangeLabel, MATCH_TYPE_LABELS } from './matches'
import { courtsText, type Tournament } from './tournaments'

// The message players paste in the club's WhatsApp group; the link leads straight to the tournament.
export function tournamentShareText(input: {
  tournament: Tournament
  clubName: string
  dayText: string
  timeText: string
  url: string
}): string {
  const { tournament } = input
  const signedUp = tournament.entries.length
  const left = tournament.maxPlayers - signedUp
  const spots =
    left <= 0 ? 'Cupo completo' : `${left === 1 ? 'Queda 1 lugar' : `Quedan ${left} lugares`} (${signedUp} de ${tournament.maxPlayers})`
  const lines = [
    `🏆 ${tournament.name}`,
    `${input.dayText}, ${input.timeText}`,
    `${input.clubName}, ${courtsText(tournament.courtNames)}`,
    `Categoría ${categoryRangeLabel(tournament.categoryMin, tournament.categoryMax)}, ${MATCH_TYPE_LABELS[tournament.type].toLowerCase()}`,
    spots,
  ]
  if (tournament.price > 0) lines.push(`${formatPrice(tournament.price)} por persona`)
  return [...lines, '', `Anotate acá: ${input.url}`].join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/tournament-share.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/tournament-share.ts tests/unit/lib/domain/tournament-share.test.ts
git commit -m "feat(domain): tournament text for WhatsApp"
```

---

## Corte 4: Datos y acciones

### Task 16: Carga de torneos y "ocupado" con torneos

**Files:**
- Create: `lib/data/tournaments.ts`
- Modify: `lib/data/matches.ts` (`loadPlayerContext`)

(no unit test — lectura con la sesión del usuario, como `lib/data/matches.ts`; la cubren typecheck, las pantallas y el e2e)

- [ ] **Step 1: Write the loader**

`lib/data/tournaments.ts`:
```ts
import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import type { TakenPeriod } from '@/lib/domain/tournament-form'
import { toTournament, type Tournament, type TournamentRow } from '@/lib/domain/tournaments'
import { toDate } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'

// FK hints: tournament_games also points at tournament_entries, and profiles is reached through
// three columns of tournament_entries.
const TOURNAMENT_SELECT =
  'id, name, starts_at, ends_at, court_ids, max_players, points_per_game, round_minutes, rounds, category_min, category_max, match_type, price, status, entries:tournament_entries!tournament_entries_tournament_in_club(id, player_id, guest_name, removed_at, created_at, player:profiles!tournament_entries_player_id_fkey(display_name), payments!payments_entry_in_club(status, amount, rejection_reason, created_at)), games:tournament_games!tournament_games_tournament_in_club(id, round, wave, court_id, starts_at, a1_entry_id, a2_entry_id, b1_entry_id, b2_entry_id, score_a)'

async function courtNames(club: Club): Promise<Map<string, string>> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('courts').select('id, name').eq('club_id', club.id)
  if (error) throw error
  return new Map(data.map((court) => [court.id, court.name]))
}

// Tournaments of the club that end after the given instant, cancelled ones left out, read with the
// viewer's session: members read every tournament, entry and game of their club; payments come back
// only to their payer and to staff.
export async function loadTournaments(club: Club, range: { endsAfter: Date }): Promise<Tournament[]> {
  const supabase = await createClient()
  const [names, rows] = await Promise.all([
    courtNames(club),
    supabase
      .from('tournaments')
      .select(TOURNAMENT_SELECT)
      .eq('club_id', club.id)
      .neq('status', 'cancelled')
      .gt('ends_at', range.endsAfter.toISOString())
      .order('starts_at'),
  ])
  if (rows.error) throw rows.error
  return rows.data.map((row: TournamentRow) => toTournament(row, names))
}

export async function loadTournament(club: Club, id: string): Promise<Tournament | null> {
  const supabase = await createClient()
  const [names, row] = await Promise.all([
    courtNames(club),
    supabase.from('tournaments').select(TOURNAMENT_SELECT).eq('club_id', club.id).eq('id', id).maybeSingle(),
  ])
  if (row.error) throw row.error
  return row.data ? toTournament(row.data, names) : null
}

export async function loadActiveCourts(club: Club): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('courts')
    .select('id, name')
    .eq('club_id', club.id)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  return data
}

// Everything that takes a court in the next `days`, so "Nuevo americano" warns before saving.
export async function loadTakenPeriods(club: Club, from: Date, days: number): Promise<TakenPeriod[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('court_occupancy')
    .select('court_id, starts_at, ends_at')
    .eq('club_id', club.id)
    .gt('ends_at', from.toISOString())
    .lt('starts_at', new Date(from.getTime() + days * 86_400_000).toISOString())
  if (error) throw error
  return data.map((row) => ({ courtId: row.court_id, startsAt: toDate(row.starts_at), endsAt: toDate(row.ends_at) }))
}
```

- [ ] **Step 2: "Ocupado" también con torneos**

In `lib/data/matches.ts`, `loadPlayerContext`, replace:
```ts
  const [bookings, spots, availability, preferred] = await Promise.all([
```
with:
```ts
  const [bookings, spots, availability, preferred, entries] = await Promise.all([
```
add as the last element of that `Promise.all` array (after the `player_preferred_courts` query):
```ts
    supabase
      .from('tournament_entries')
      .select('tournament:tournaments!tournament_entries_tournament_in_club(starts_at, ends_at, status)')
      .eq('player_id', viewer.userId)
      .is('removed_at', null),
```
after `if (preferred.error) throw preferred.error` add:
```ts
  if (entries.error) throw entries.error
```
after the `inMatches` declaration add:
```ts
  // Same as private.is_busy: an active entry in a tournament that was not cancelled.
  const inTournaments: Period[] = entries.data.flatMap((row) =>
    row.tournament && row.tournament.status !== 'cancelled'
      ? [{ startsAt: toDate(row.tournament.starts_at), endsAt: toDate(row.tournament.ends_at) }]
      : [],
  )
```
and replace:
```ts
    busy: [...booked, ...inMatches]
```
with:
```ts
    busy: [...booked, ...inMatches, ...inTournaments]
```
Finally, replace the comment above `loadPlayerContext`:
```ts
// What the join rules, the cards and "Partidos para vos" need to know about the viewer: what he
// has booked or joined (busy), where and when he usually plays (habits, last 120 days).
```
with:
```ts
// What the join rules, the cards and "Partidos para vos" need to know about the viewer: what he
// has booked, joined or signed up for (busy), where and when he usually plays (habits, last 120 days).
```

- [ ] **Step 3: Typecheck and tests**

Run:
```bash
npm run typecheck
npm test
```
Expected: PASS. Si supabase-js infiere para los embeds una forma distinta de `TournamentRow`, ajustar el tipo en `lib/domain/tournaments.ts` (nunca castear el resultado).

- [ ] **Step 4: Commit**

```bash
git add lib/data/tournaments.ts lib/data/matches.ts
git commit -m "feat(data): load tournaments and count them as busy time"
```

---

### Task 17: Acciones del jugador y del club

**Files:**
- Create: `app/(jugador)/torneos/actions.ts`
- Create: `app/(club)/club/torneos/actions.ts`
- Test: `tests/unit/lib/actions/tournament-actions.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/actions/tournament-actions.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INVALID_INPUT } from '@/lib/actions/result'

// Server Actions are reachable by any POST: bad input must stop before any RPC.
type RpcResult = { data: unknown; error: { message: string } | null }
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<RpcResult>>(async () => ({
  data: { id: 't-new' },
  error: null,
}))
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`)
})

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path) }))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('@/lib/auth/viewer', () => ({
  getViewer: async () => ({ userId: 'u1', club: { id: 'club-1', timezone: 'America/Montevideo' } }),
}))

const club = await import('@/app/(club)/club/torneos/actions')
const player = await import('@/app/(jugador)/torneos/actions')
const { errorMessage } = await import('@/lib/domain/errors')

const ID = '55555555-5555-5555-5555-555555555555'
const C1 = '22222222-2222-2222-2222-222222222201'
const C2 = '22222222-2222-2222-2222-222222222202'
const IDLE = { status: 'idle' as const }
const VALID = {
  name: 'Americano de octubre',
  date: '2026-10-01',
  time: '18:00',
  courtIds: [C1, C2],
  maxPlayers: '8',
  pointsPerGame: '24',
  roundMinutes: '20',
  rounds: '7',
  categoryMin: '4',
  categoryMax: '6',
  type: 'mixed',
  price: '400',
}

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item)
  }
  return data
}

beforeEach(() => {
  rpc.mockClear()
  redirect.mockClear()
})

describe('createTournament', () => {
  it('explains bad input without calling the database', async () => {
    expect(await club.createTournament(IDLE, form({ ...VALID, maxPlayers: '10' }))).toEqual({
      status: 'error',
      message: 'El cupo es de 8, 12 o 16 jugadores.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('creates it with the club clock and opens its page', async () => {
    await expect(club.createTournament(IDLE, form(VALID))).rejects.toThrow('NEXT_REDIRECT /club/torneos/t-new')
    expect(rpc).toHaveBeenCalledWith('create_tournament', {
      p_name: 'Americano de octubre',
      p_starts_at: '2026-10-01T21:00:00.000Z',
      p_court_ids: [C1, C2],
      p_max_players: 8,
      p_points_per_game: 24,
      p_round_minutes: 20,
      p_rounds: 7,
      p_category_min: 4,
      p_category_max: 6,
      p_type: 'mixed',
      p_price: 400,
    })
  })

  it('translates what the database says', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'courts_busy' } })
    expect(await club.createTournament(IDLE, form(VALID))).toEqual({ status: 'error', message: errorMessage('courts_busy') })
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('tournament actions', () => {
  it('reject ids and numbers that do not have the right shape', async () => {
    const bad = form({ tournamentId: 't1', entryId: 'e1', gameId: 'g1' })
    for (const action of [
      club.closeRegistration,
      club.reopenRegistration,
      club.startTournament,
      club.finishTournament,
      club.cancelTournament,
      club.addGuest,
      club.removeEntry,
      club.recordScore,
      club.recordTournamentCash,
      player.joinTournament,
      player.leaveTournament,
    ]) {
      expect(await action(IDLE, bad)).toEqual(INVALID_INPUT)
    }
    expect(await club.recordScore(IDLE, form({ gameId: ID, scoreA: 'diez' }))).toEqual(INVALID_INPUT)
    expect(await club.recordTournamentCash(IDLE, form({ entryId: ID, amount: '0' }))).toEqual(INVALID_INPUT)
    expect(await club.addGuest(IDLE, form({ tournamentId: ID, guestName: '' }))).toEqual(INVALID_INPUT)
    expect(await player.reportTournamentTransfer('e1', null)).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('call each function with its arguments', async () => {
    await club.closeRegistration(IDLE, form({ tournamentId: ID }))
    await club.startTournament(IDLE, form({ tournamentId: ID }))
    await club.addGuest(IDLE, form({ tournamentId: ID, guestName: 'Pepe' }))
    await club.removeEntry(IDLE, form({ entryId: ID }))
    await club.recordScore(IDLE, form({ gameId: ID, scoreA: '14' }))
    await club.recordTournamentCash(IDLE, form({ entryId: ID, amount: '400' }))
    await player.joinTournament(IDLE, form({ tournamentId: ID }))
    await player.reportTournamentTransfer(ID, 'u1/recibo.png')
    expect(rpc.mock.calls).toEqual([
      ['close_tournament_registration', { p_tournament_id: ID }],
      ['start_tournament', { p_tournament_id: ID }],
      ['add_tournament_guest', { p_tournament_id: ID, p_name: 'Pepe' }],
      ['remove_tournament_entry', { p_entry_id: ID }],
      ['record_tournament_score', { p_game_id: ID, p_score_a: 14 }],
      ['record_tournament_cash', { p_entry_id: ID, p_amount: 400 }],
      ['join_tournament', { p_tournament_id: ID }],
      ['report_tournament_transfer', { p_entry_id: ID, p_receipt_path: 'u1/recibo.png' }],
    ])
  })

  it('say what happened', async () => {
    expect(await club.startTournament(IDLE, form({ tournamentId: ID }))).toEqual({ status: 'ok', message: 'Fixture armado. ¡A jugar!' })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'not_enough_players' } })
    expect(await club.startTournament(IDLE, form({ tournamentId: ID }))).toEqual({
      status: 'error',
      message: errorMessage('not_enough_players'),
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/actions/tournament-actions.test.ts`
Expected: FAIL (`Failed to resolve import "@/app/(club)/club/torneos/actions"`).

- [ ] **Step 3: Write the player actions**

`app/(jugador)/torneos/actions.ts`:
```ts
'use server'

import { fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { isUuid, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

export async function joinTournament(_previous: ActionState, form: FormData): Promise<ActionState> {
  const tournamentId = readUuid(form, 'tournamentId')
  if (!tournamentId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('join_tournament', { p_tournament_id: tournamentId })
  revalidateBookings()
  return fromRpc(error, 'Listo, estás anotado. Pagá cuando quieras: queda en tu inscripción.')
}

export async function leaveTournament(_previous: ActionState, form: FormData): Promise<ActionState> {
  const tournamentId = readUuid(form, 'tournamentId')
  if (!tournamentId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('leave_tournament', { p_tournament_id: tournamentId })
  revalidateBookings()
  return fromRpc(error, 'Te diste de baja. Tu lugar quedó libre.')
}

// Called after the browser uploaded the receipt; report_tournament_transfer checks the path is hers.
export async function reportTournamentTransfer(entryId: string, receiptPath: string | null): Promise<ActionState> {
  if (!isUuid(entryId)) return INVALID_INPUT
  if (receiptPath !== null && (typeof receiptPath !== 'string' || receiptPath.length > 300)) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('report_tournament_transfer', {
    p_entry_id: entryId,
    p_receipt_path: receiptPath ?? undefined,
  })
  revalidateBookings()
  return fromRpc(error, 'Listo, le avisamos al club. Te confirma el pago cuando lo vea.')
}
```

- [ ] **Step 4: Write the club actions**

`app/(club)/club/torneos/actions.ts`:
```ts
'use server'

import { redirect } from 'next/navigation'
import { failed, fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { getViewer } from '@/lib/auth/viewer'
import { readInt, readText, readUuid } from '@/lib/domain/input'
import { parseTournamentForm } from '@/lib/domain/tournament-form'
import { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>
type RpcCall = PromiseLike<{ error: { message: string } | null }>

// The database checks the caller is staff; these only check the shape of what comes in.
async function run(call: (supabase: Supabase) => RpcCall, okMessage: string): Promise<ActionState> {
  const supabase = await createClient()
  const { error } = await call(supabase)
  revalidateBookings()
  return fromRpc(error, okMessage)
}

async function onTournament(
  form: FormData,
  call: (supabase: Supabase, tournamentId: string) => RpcCall,
  okMessage: string,
): Promise<ActionState> {
  const tournamentId = readUuid(form, 'tournamentId')
  if (!tournamentId) return INVALID_INPUT
  return run((supabase) => call(supabase, tournamentId), okMessage)
}

export async function createTournament(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return failed('Tu sesión venció. Volvé a ingresar.')
  const parsed = parseTournamentForm(form, viewer.club.timezone)
  if (!parsed.ok) return failed(parsed.message)
  const input = parsed.value

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_tournament', {
    p_name: input.name,
    p_starts_at: input.startsAt,
    p_court_ids: input.courtIds,
    p_max_players: input.maxPlayers,
    p_points_per_game: input.pointsPerGame,
    p_round_minutes: input.roundMinutes,
    p_rounds: input.rounds,
    p_category_min: input.categoryMin,
    p_category_max: input.categoryMax,
    p_type: input.type,
    p_price: input.price,
  })
  if (error) return fromRpc(error, '')
  revalidateBookings()
  redirect(`/club/torneos/${data.id}`)
}

export async function closeRegistration(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onTournament(
    form,
    (supabase, id) => supabase.rpc('close_tournament_registration', { p_tournament_id: id }),
    'Inscripción cerrada. Podés reabrirla hasta armar el fixture.',
  )
}

export async function reopenRegistration(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onTournament(
    form,
    (supabase, id) => supabase.rpc('reopen_tournament_registration', { p_tournament_id: id }),
    'Inscripción abierta de nuevo.',
  )
}

export async function startTournament(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onTournament(form, (supabase, id) => supabase.rpc('start_tournament', { p_tournament_id: id }), 'Fixture armado. ¡A jugar!')
}

export async function finishTournament(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onTournament(
    form,
    (supabase, id) => supabase.rpc('finish_tournament', { p_tournament_id: id }),
    'Torneo finalizado. El ranking quedó fijo.',
  )
}

export async function cancelTournament(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onTournament(
    form,
    (supabase, id) => supabase.rpc('cancel_tournament', { p_tournament_id: id }),
    'Torneo cancelado. Las canchas quedaron libres.',
  )
}

export async function addGuest(_previous: ActionState, form: FormData): Promise<ActionState> {
  const name = readText(form, 'guestName', { maxLength: 60 })
  if (!name) return INVALID_INPUT
  return onTournament(
    form,
    (supabase, id) => supabase.rpc('add_tournament_guest', { p_tournament_id: id, p_name: name }),
    'Invitado agregado.',
  )
}

export async function removeEntry(_previous: ActionState, form: FormData): Promise<ActionState> {
  const entryId = readUuid(form, 'entryId')
  if (!entryId) return INVALID_INPUT
  return run(
    (supabase) => supabase.rpc('remove_tournament_entry', { p_entry_id: entryId }),
    'Lo sacaste del torneo. Si había pagado, aparece en Cobros para devolver.',
  )
}

export async function recordScore(_previous: ActionState, form: FormData): Promise<ActionState> {
  const gameId = readUuid(form, 'gameId')
  const scoreA = readInt(form, 'scoreA', { min: 0, max: 99 })
  if (!gameId || scoreA === null) return INVALID_INPUT
  return run((supabase) => supabase.rpc('record_tournament_score', { p_game_id: gameId, p_score_a: scoreA }), 'Resultado guardado.')
}

export async function recordTournamentCash(_previous: ActionState, form: FormData): Promise<ActionState> {
  const entryId = readUuid(form, 'entryId')
  const amount = readInt(form, 'amount', { min: 1, max: 10_000_000 })
  if (!entryId || amount === null) return INVALID_INPUT
  return run((supabase) => supabase.rpc('record_tournament_cash', { p_entry_id: entryId, p_amount: amount }), 'Pago en efectivo registrado.')
}
```

Order matters in `addGuest`: the test sends `tournamentId: 't1'` with no `guestName`, and `INVALID_INPUT` comes back from either check before any RPC.

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
npx vitest run tests/unit/lib/actions/tournament-actions.test.ts
npm run typecheck
```
Expected: PASS. Si typecheck no acepta `supabase.rpc(...)` como `RpcCall` (el builder de supabase-js es `PromiseLike` de `{ error, data, … }`), ajustar `RpcCall` al tipo que infiere, sin cast.

- [ ] **Step 6: Commit**

```bash
git add "app/(jugador)/torneos/actions.ts" "app/(club)/club/torneos/actions.ts" tests/unit/lib/actions/tournament-actions.test.ts
git commit -m "feat(actions): tournament actions for players and the club"
```

---

## Corte 5: Pantallas del jugador

### Task 18: Ícono trofeo y tarjeta del torneo

**Files:**
- Modify: `components/ui/icon.tsx`
- Create: `components/tournaments/tournament-card.tsx`
- Test: `tests/unit/components/tournaments/tournament-card.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/tournaments/tournament-card.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TournamentCard } from '@/components/tournaments/tournament-card'
import { Icon } from '@/components/ui/icon'
import { makeTournament } from '../../fixtures/tournaments'

describe('TournamentCard', () => {
  it('shows when, what, for whom, where, the format, the price and how full it is', () => {
    render(<TournamentCard tournament={makeTournament()} whenText="jue 1 18:00 a 20:20" status={{ ok: true, text: 'Inscribirme, $400' }} />)
    expect(screen.getByText('jue 1 18:00 a 20:20')).toBeInTheDocument()
    expect(screen.getByText('Americano de octubre')).toBeInTheDocument()
    expect(screen.getByText('5 de 8')).toBeInTheDocument()
    expect(screen.getByText(/4ª a 6ª, mixto/)).toBeInTheDocument()
    expect(screen.getByText(/Cancha 1 y Cancha 2/)).toBeInTheDocument()
    expect(screen.getByText(/7 rondas de 20 min, a 24 puntos/)).toBeInTheDocument()
    expect(screen.getByText(/\$400 por persona/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Inscribirme, $400' })).toHaveAttribute('href', '/torneos/t1?anotarme=1')
  })

  it('says why the player cannot sign up while registration is open', () => {
    render(<TournamentCard tournament={makeTournament()} whenText="jue 1" status={{ ok: false, text: 'Es un torneo femenino.' }} />)
    expect(screen.getByText('Es un torneo femenino.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver torneo' })).toHaveAttribute('href', '/torneos/t1')
  })

  it('only links to the tournament once it is being played', () => {
    render(
      <TournamentCard
        tournament={makeTournament({ status: 'in_progress' })}
        whenText="jue 1"
        status={{ ok: false, text: 'La inscripción está cerrada.' }}
      />,
    )
    expect(screen.getByText('En juego')).toBeInTheDocument()
    expect(screen.queryByText('La inscripción está cerrada.')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver torneo' })).toBeInTheDocument()
  })
})

describe('Icon', () => {
  it('has a trophy for the tournaments tab', () => {
    const { container } = render(<Icon name="trophy" />)
    expect(container.querySelector('svg[data-icon="trophy"]')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/tournaments/tournament-card.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/tournaments/tournament-card"`).

- [ ] **Step 3: Add the icon**

In `components/ui/icon.tsx`, add inside `PATHS` after `pin`:
```tsx
  trophy: (
    <>
      <path d="M8 21h8M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
    </>
  ),
```

- [ ] **Step 4: Write the card**

`components/tournaments/tournament-card.tsx`:
```tsx
import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatPrice } from '@/lib/domain/format'
import { categoryRangeLabel, MATCH_TYPE_LABELS } from '@/lib/domain/matches'
import { courtsText, formatText, spotsLabel, type EntryStatus, type Tournament } from '@/lib/domain/tournaments'

// Design: "Lista /torneos". Signing up goes through the detail page, which explains the rules first.
export function TournamentCard({ tournament, whenText, status }: { tournament: Tournament; whenText: string; status: EntryStatus }) {
  const href = `/torneos/${tournament.id}`
  const signingUp = tournament.status === 'registration' || tournament.status === 'closed'
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-bold uppercase">{whenText}</p>
          <p className="font-semibold">{tournament.name}</p>
        </div>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold">{spotsLabel(tournament)}</span>
      </div>
      <p className="text-sm">
        {categoryRangeLabel(tournament.categoryMin, tournament.categoryMax)}, {MATCH_TYPE_LABELS[tournament.type].toLowerCase()}
        <br />
        {courtsText(tournament.courtNames)}
        <br />
        {formatText(tournament)}
        <br />
        {tournament.price > 0 ? `${formatPrice(tournament.price)} por persona` : 'Sin costo'}
      </p>
      {status.ok ? (
        <Link href={`${href}?anotarme=1`} className={buttonClasses({ fullWidth: true })}>
          {status.text}
        </Link>
      ) : (
        <>
          {signingUp ? <p className="text-sm text-fg-muted">{status.text}</p> : null}
          <Link href={href} className={buttonClasses({ variant: 'secondary', fullWidth: true })}>
            Ver torneo
          </Link>
        </>
      )}
    </Card>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/tournaments/tournament-card.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/ui/icon.tsx components/tournaments/tournament-card.tsx tests/unit/components/tournaments/tournament-card.test.tsx
git commit -m "feat(ui): tournament card and trophy icon"
```

---

### Task 19: Fixture y ranking

**Files:**
- Create: `components/tournaments/fixture-list.tsx`
- Create: `components/tournaments/ranking-table.tsx`
- Test: `tests/unit/components/tournaments/fixture-and-ranking.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/tournaments/fixture-and-ranking.test.tsx`:
```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FixtureList } from '@/components/tournaments/fixture-list'
import { RankingTable } from '@/components/tournaments/ranking-table'
import { at, TIMEZONE } from '../../fixtures/grid'
import { makeEntries, makeGame, makeTournament } from '../../fixtures/tournaments'

describe('FixtureList', () => {
  it('shows each round with its games, courts, times and results', () => {
    const tournament = makeTournament({
      status: 'in_progress',
      entries: makeEntries(8),
      games: [
        makeGame('g1', ['e1', 'e2'], ['e3', 'e4'], 14),
        makeGame('g2', ['e5', 'e6'], ['e7', 'e8'], null, { courtName: 'Cancha 2' }),
        makeGame('g3', ['e1', 'e3'], ['e5', 'e7'], null, { round: 2, startsAt: at('18:20') }),
      ],
    })
    render(<FixtureList tournament={tournament} timezone={TIMEZONE} />)
    const first = screen.getByRole('region', { name: 'Ronda 1' })
    expect(within(first).getAllByRole('listitem')).toHaveLength(2)
    expect(first).toHaveTextContent('18:00, Cancha 1')
    expect(first).toHaveTextContent('Jugador 1 y Jugador 2 14 a 10 Jugador 3 y Jugador 4')
    expect(first).toHaveTextContent('Jugador 5 y Jugador 6 vs Jugador 7 y Jugador 8')
    expect(screen.getByRole('region', { name: 'Ronda 2' })).toHaveTextContent('18:20, Cancha 1')
  })
})

describe('RankingTable', () => {
  it('lists position, name, points, games played, won and difference, marking the viewer', () => {
    render(
      <RankingTable
        rows={[
          { entryId: 'e2', name: 'Bruno', position: 1, points: 38, played: 3, won: 2, diff: 4 },
          { entryId: 'e1', name: 'Ana', position: 2, points: 36, played: 3, won: 1, diff: 0 },
          { entryId: 'e3', name: 'Carla', position: 3, points: 34, played: 3, won: 0, diff: -4 },
        ]}
        highlightEntryId="e1"
      />,
    )
    const rows = within(screen.getByRole('table', { name: 'Ranking' })).getAllByRole('row')
    expect(rows).toHaveLength(4)
    expect(rows[1]).toHaveTextContent('1Bruno3832+4')
    expect(rows[2]).toHaveAttribute('aria-current', 'true')
    expect(rows[3]).toHaveTextContent('3Carla3430-4')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/tournaments/fixture-and-ranking.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/tournaments/fixture-list"`).

- [ ] **Step 3: Write the components**

`components/tournaments/fixture-list.tsx`:
```tsx
import { timeIn } from '@/lib/domain/format'
import { scoreB } from '@/lib/domain/tournament-ranking'
import { entryNames, gamesByRound, teamName, type Tournament } from '@/lib/domain/tournaments'

// Every round with its games: when, where, who against whom and the result once it is in.
export function FixtureList({ tournament, timezone }: { tournament: Tournament; timezone: string }) {
  const names = entryNames(tournament)
  return (
    <div className="flex flex-col gap-4">
      {gamesByRound(tournament.games).map(({ round, games }) => (
        <section key={round} aria-labelledby={`ronda-${round}`} className="flex flex-col gap-2">
          <h3 id={`ronda-${round}`} className="font-display text-xl font-bold uppercase">
            Ronda {round}
          </h3>
          <ul className="flex flex-col gap-2">
            {games.map((game) => (
              <li key={game.id} className="rounded-xl border border-border p-3 text-sm">
                <p className="text-fg-muted">
                  {timeIn(game.startsAt, timezone)}, {game.courtName}
                </p>
                <p>
                  <span className="font-semibold">{teamName(game.teamA, names)}</span>{' '}
                  {game.scoreA === null ? 'vs' : `${game.scoreA} a ${scoreB(game.scoreA, tournament.pointsPerGame)}`}{' '}
                  <span className="font-semibold">{teamName(game.teamB, names)}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
```

`components/tournaments/ranking-table.tsx`:
```tsx
import { cn } from '@/lib/cn'
import type { RankingRow } from '@/lib/domain/tournament-ranking'

const CELL = 'py-2 pr-3 text-right tabular-nums'

// Points, then games won, then difference (tournament-ranking.ts). The viewer's row stands out.
export function RankingTable({ rows, highlightEntryId = null }: { rows: RankingRow[]; highlightEntryId?: string | null }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table aria-label="Ranking" className="w-full min-w-[18rem] text-sm">
        <thead>
          <tr className="text-fg-muted">
            <th scope="col" className="py-2 pr-3 text-left">#</th>
            <th scope="col" className="py-2 pr-3 text-left">Jugador</th>
            <th scope="col" className={CELL}><abbr title="Puntos">Pts</abbr></th>
            <th scope="col" className={CELL}><abbr title="Partidos jugados">PJ</abbr></th>
            <th scope="col" className={CELL}><abbr title="Partidos ganados">PG</abbr></th>
            <th scope="col" className={CELL}><abbr title="Diferencia de puntos">Dif</abbr></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const mine = row.entryId === highlightEntryId
            return (
              <tr key={row.entryId} aria-current={mine ? 'true' : undefined} className={cn('border-t border-border', mine && 'font-semibold text-accent-ink')}>
                <td className="py-2 pr-3 tabular-nums">{row.position}</td>
                <th scope="row" className={cn('py-2 pr-3 text-left', mine ? 'font-semibold' : 'font-normal')}>
                  {row.name}
                </th>
                <td className={CELL}>{row.points}</td>
                <td className={CELL}>{row.played}</td>
                <td className={CELL}>{row.won}</td>
                <td className={CELL}>{row.diff > 0 ? `+${row.diff}` : row.diff}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/tournaments/fixture-and-ranking.test.tsx`
Expected: PASS. (El texto de una fila junta las celdas sin espacios: `1` `Bruno` `38` `3` `2` `+4`.)

- [ ] **Step 5: Commit**

```bash
git add components/tournaments/fixture-list.tsx components/tournaments/ranking-table.tsx tests/unit/components/tournaments/fixture-and-ranking.test.tsx
git commit -m "feat(ui): tournament fixture and ranking table"
```

---

### Task 20: Detalle del torneo para el jugador (`TournamentBoard`)

**Files:**
- Create: `app/(jugador)/torneos/[id]/tournament-board.tsx`
- Test: `tests/unit/app/torneos/tournament-board.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/app/torneos/tournament-board.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TournamentBoard, type TournamentBoardProps } from '@/app/(jugador)/torneos/[id]/tournament-board'
import type { ReportTransfer } from '@/components/booking/transfer-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { TIMEZONE } from '../../fixtures/grid'
import { makeEntries, makeGame, makeTournament } from '../../fixtures/tournaments'

function renderBoard(overrides: Partial<TournamentBoardProps> = {}) {
  const props: TournamentBoardProps = {
    tournament: makeTournament(),
    viewerId: 'me',
    myEntryId: null,
    whenText: 'jueves 1 de octubre, 18:00 a 20:20',
    timezone: TIMEZONE,
    status: { ok: true, text: 'Inscribirme, $400' },
    leave: null,
    payment: null,
    paymentNote: 'Se paga en el club o por transferencia.',
    transfer: { details: 'Banco Ejemplo', receiptRequired: true },
    shareText: 'Americano',
    ranking: [],
    initialJoin: false,
    joinAction: vi.fn<FormAction>(),
    leaveAction: vi.fn<FormAction>(),
    reportAction: vi.fn<ReportTransfer>(),
    ...overrides,
  }
  render(<TournamentBoard {...props} />)
  return props
}

describe('TournamentBoard', () => {
  it('shows the tournament and who signed up, and asks before signing up', async () => {
    renderBoard()
    expect(screen.getByRole('heading', { name: 'Americano de octubre' })).toBeInTheDocument()
    expect(screen.getByText('jueves 1 de octubre, 18:00 a 20:20')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Anotados (5 de 8)' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme, $400' }))
    expect(screen.getByRole('dialog', { name: 'Inscribirme' })).toHaveTextContent('Podés darte de baja mientras la inscripción esté abierta')
    expect(screen.getByRole('button', { name: 'Confirmar inscripción' })).toBeInTheDocument()
  })

  it('opens the sign-up sheet straight from the card link', () => {
    renderBoard({ initialJoin: true })
    expect(screen.getByRole('dialog', { name: 'Inscribirme' })).toBeInTheDocument()
  })

  it('says why the player cannot sign up', () => {
    renderBoard({ status: { ok: false, text: 'Es un torneo femenino.' } })
    expect(screen.getByRole('note')).toHaveTextContent('No podés anotarte: es un torneo femenino.')
    expect(screen.queryByRole('button', { name: /Inscribirme/ })).not.toBeInTheDocument()
  })

  it('lets a signed-up player pay by transfer and leave', async () => {
    renderBoard({
      myEntryId: 'e1',
      status: { ok: false, text: 'Ya estás anotado.' },
      leave: { allowed: true },
      payment: { state: 'pending', due: 400, canReportTransfer: true, rejectionReason: null },
    })
    expect(screen.getByText('Pendiente de pago')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ya transferí' }))
    expect(screen.getByRole('dialog', { name: 'Ya transferí' })).toHaveTextContent('Banco Ejemplo')
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Darme de baja' }))
    expect(screen.getByRole('dialog', { name: 'Darme de baja' })).toBeInTheDocument()
  })

  it('shows the live ranking and the fixture while it is played', () => {
    renderBoard({
      tournament: makeTournament({ status: 'in_progress', entries: makeEntries(8), games: [makeGame('g1', ['e1', 'e2'], ['e3', 'e4'], 14)] }),
      status: { ok: false, text: 'La inscripción está cerrada.' },
      ranking: [{ entryId: 'e1', name: 'Jugador 1', position: 1, points: 14, played: 1, won: 1, diff: 4 }],
    })
    expect(screen.getByRole('heading', { name: 'Ranking en vivo' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Ranking' })).toHaveTextContent('Jugador 1')
    expect(screen.getByRole('heading', { name: 'Ronda 1' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Anotados/ })).not.toBeInTheDocument()
  })

  it('shows the final ranking once it finished', () => {
    renderBoard({ tournament: makeTournament({ status: 'finished' }), status: { ok: false, text: 'La inscripción está cerrada.' } })
    expect(screen.getByRole('heading', { name: 'Ranking final' })).toBeInTheDocument()
  })

  it('offers sharing while registration is open', async () => {
    renderBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Compartir en WhatsApp' }))
    expect(screen.getByRole('dialog', { name: 'Compartir en el grupo' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/app/torneos/tournament-board.test.tsx`
Expected: FAIL (`Failed to resolve import "@/app/(jugador)/torneos/[id]/tournament-board"`).

- [ ] **Step 3: Write the component**

`app/(jugador)/torneos/[id]/tournament-board.tsx`:
```tsx
'use client'

import { useCallback, useState } from 'react'
import { PaymentBadge } from '@/components/booking/payment-badge'
import { TransferSheet, type ReportTransfer } from '@/components/booking/transfer-sheet'
import { ShareSheet } from '@/components/matches/share-sheet'
import { FixtureList } from '@/components/tournaments/fixture-list'
import { RankingTable } from '@/components/tournaments/ranking-table'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/domain/format'
import { categoryRangeLabel, MATCH_TYPE_LABELS } from '@/lib/domain/matches'
import type { RankingRow } from '@/lib/domain/tournament-ranking'
import type { EntryPaymentView } from '@/lib/domain/tournament-payments'
import {
  courtsText,
  formatText,
  TOURNAMENT_STATUS_LABELS,
  type EntryStatus,
  type Tournament,
  type TournamentLeaveStatus,
} from '@/lib/domain/tournaments'

export type TournamentBoardProps = {
  tournament: Tournament
  viewerId: string
  myEntryId: string | null
  whenText: string
  timezone: string
  status: EntryStatus
  leave: TournamentLeaveStatus
  payment: EntryPaymentView | null
  paymentNote: string
  transfer: { details: string | null; receiptRequired: boolean }
  shareText: string
  ranking: RankingRow[]
  initialJoin: boolean
  joinAction: FormAction
  leaveAction: FormAction
  reportAction: ReportTransfer
}

type Sheet = 'join' | 'leave' | 'share' | 'transfer'

const lowerFirst = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`

// Design: "Detalle /torneos/[id]". It is also where the shared link lands.
export function TournamentBoard(props: TournamentBoardProps) {
  const { tournament, status, leave, payment } = props
  const [sheet, setSheet] = useState<Sheet | null>(props.initialJoin && status.ok ? 'join' : null)
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setSheet(null), [])
  const done = useCallback((message: string) => {
    setSheet(null)
    setNotice(message)
  }, [])
  const signingUp = tournament.status === 'registration' || tournament.status === 'closed'
  const played = tournament.status === 'in_progress' || tournament.status === 'finished'
  const entered = props.myEntryId !== null
  const price = tournament.price > 0 ? `${formatPrice(tournament.price)} por persona. ${props.paymentNote}` : 'Sin costo.'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-3xl font-bold uppercase">{tournament.name}</h1>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
          {TOURNAMENT_STATUS_LABELS[tournament.status]}
        </span>
      </div>
      {notice ? (
        <p role="status" className="rounded-xl border border-accent bg-surface p-3">
          {notice}
        </p>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-fg-muted">Cuándo</dt>
        <dd>{props.whenText}</dd>
        <dt className="text-fg-muted">Canchas</dt>
        <dd>{courtsText(tournament.courtNames)}</dd>
        <dt className="text-fg-muted">Categoría</dt>
        <dd>
          {categoryRangeLabel(tournament.categoryMin, tournament.categoryMax)}, {MATCH_TYPE_LABELS[tournament.type].toLowerCase()}
        </dd>
        <dt className="text-fg-muted">Formato</dt>
        <dd>Americano: cada ronda cambiás de pareja. {formatText(tournament)}.</dd>
        <dt className="text-fg-muted">Precio</dt>
        <dd>{price}</dd>
      </dl>

      {payment ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
          <span className="font-semibold">Tu inscripción</span>
          <PaymentBadge state={payment.state} />
          {payment.canReportTransfer ? (
            <Button variant="secondary" onClick={() => setSheet('transfer')}>
              Ya transferí
            </Button>
          ) : null}
          {payment.rejectionReason ? (
            <p className="w-full text-sm">El club rechazó la transferencia: {payment.rejectionReason}.</p>
          ) : null}
        </div>
      ) : null}

      {signingUp ? (
        <section aria-labelledby="anotados" className="flex flex-col gap-2">
          <h2 id="anotados" className="font-display text-2xl font-bold uppercase">
            Anotados ({tournament.entries.length} de {tournament.maxPlayers})
          </h2>
          {tournament.entries.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {tournament.entries.map((entry) => (
                <li key={entry.id} className="rounded-full border border-border px-3 py-1 text-sm">
                  {entry.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-fg-muted">Todavía no se anotó nadie.</p>
          )}
        </section>
      ) : null}

      {!status.ok && !entered && tournament.status === 'registration' ? (
        <p role="note" className="rounded-xl border border-border p-3">
          No podés anotarte: {lowerFirst(status.text)}
        </p>
      ) : null}
      {tournament.status === 'cancelled' ? (
        <p role="note" className="rounded-xl border border-accent p-3">
          El club canceló este torneo.{entered ? ' Si pagaste, te devuelve la plata.' : ''}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {status.ok ? <Button onClick={() => setSheet('join')}>{status.text}</Button> : null}
        {tournament.status === 'registration' ? (
          <Button variant="secondary" onClick={() => setSheet('share')}>
            Compartir en WhatsApp
          </Button>
        ) : null}
        {leave?.allowed ? (
          <Button variant="ghost" onClick={() => setSheet('leave')}>
            Darme de baja
          </Button>
        ) : leave ? (
          <p className="text-sm text-fg-muted">{leave.reason}</p>
        ) : null}
      </div>

      {played ? (
        <>
          <section aria-labelledby="ranking" className="flex flex-col gap-2">
            <h2 id="ranking" className="font-display text-2xl font-bold uppercase">
              {tournament.status === 'finished' ? 'Ranking final' : 'Ranking en vivo'}
            </h2>
            <RankingTable rows={props.ranking} highlightEntryId={props.myEntryId} />
          </section>
          <section aria-labelledby="fixture" className="flex flex-col gap-2">
            <h2 id="fixture" className="font-display text-2xl font-bold uppercase">
              Fixture
            </h2>
            <FixtureList tournament={tournament} timezone={props.timezone} />
          </section>
        </>
      ) : null}

      <BottomSheet open={sheet === 'join'} onClose={close} title="Inscribirme">
        <p className="mb-4">
          Te anotás en {tournament.name}, {props.whenText}. {price} Podés darte de baja mientras la inscripción esté abierta.
        </p>
        <ActionForm action={props.joinAction} submitLabel="Confirmar inscripción" pendingLabel="Anotando…" onDone={done}>
          <input type="hidden" name="tournamentId" value={tournament.id} />
        </ActionForm>
      </BottomSheet>
      <BottomSheet open={sheet === 'leave'} onClose={close} title="Darme de baja">
        <p className="mb-4">
          Tu lugar queda libre para otro.{payment?.state === 'paid' && tournament.price > 0 ? ' Ya pagaste: el club te devuelve la plata.' : ''}
        </p>
        <ActionForm action={props.leaveAction} submitLabel="Sí, darme de baja" pendingLabel="Saliendo…" onDone={done}>
          <input type="hidden" name="tournamentId" value={tournament.id} />
        </ActionForm>
      </BottomSheet>
      {sheet === 'share' ? <ShareSheet text={props.shareText} onClose={close} /> : null}
      {sheet === 'transfer' && props.myEntryId && payment ? (
        <TransferSheet
          bookingId={props.myEntryId}
          userId={props.viewerId}
          amount={payment.due}
          details={props.transfer.details}
          receiptRequired={props.transfer.receiptRequired}
          reportAction={props.reportAction}
          onClose={close}
          onDone={done}
        />
      ) : null}
    </div>
  )
}
```

`TransferSheet` takes the entry id as `bookingId`: it only uses it to name the receipt file and to call `reportAction`, which here is `reportTournamentTransfer(entryId, path)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/app/torneos/tournament-board.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(jugador)/torneos/[id]/tournament-board.tsx" tests/unit/app/torneos/tournament-board.test.tsx
git commit -m "feat(torneos): tournament detail for players"
```

---

### Task 21: Pantallas `/torneos` y `/torneos/<id>`

**Files:**
- Create: `app/(jugador)/torneos/page.tsx`
- Create: `app/(jugador)/torneos/[id]/page.tsx`

(no unit test — Server Components que componen piezas ya probadas; los cubre el e2e de la Task 33)

- [ ] **Step 1: Read the Next guides**

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` (params as a Promise) and `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md`.

- [ ] **Step 2: Write the list page**

`app/(jugador)/torneos/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { TournamentCard } from '@/components/tournaments/tournament-card'
import { requirePlayer } from '@/lib/auth/viewer'
import { loadPlayerContext } from '@/lib/data/matches'
import { loadTournaments } from '@/lib/data/tournaments'
import { dayLabel, timeIn } from '@/lib/domain/format'
import { localDateOf } from '@/lib/domain/time'
import { entryStatus, type Tournament } from '@/lib/domain/tournaments'

export const metadata: Metadata = { title: 'Torneos' }

export default async function TournamentsPage() {
  const viewer = await requirePlayer('/torneos')
  const { club } = viewer
  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const [tournaments, context] = await Promise.all([
    loadTournaments(club, { endsAfter: new Date(now.getTime() - 7 * 86_400_000) }),
    loadPlayerContext(viewer, now),
  ])
  const upcoming = tournaments.filter((tournament) => tournament.status !== 'finished')
  const finished = tournaments.filter((tournament) => tournament.status === 'finished').reverse()
  const card = (tournament: Tournament) => (
    <li key={tournament.id}>
      <TournamentCard
        tournament={tournament}
        whenText={`${dayLabel(localDateOf(tournament.startsAt, club.timezone), today)} ${timeIn(tournament.startsAt, club.timezone)} a ${timeIn(tournament.endsAt, club.timezone)}`}
        status={entryStatus(tournament, context.player, { now, busy: context.busy })}
      />
    </li>
  )

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">Torneos</h1>
        <p className="text-fg-muted">Americanos del club: te anotás solo y en cada ronda cambiás de pareja.</p>
      </div>
      {upcoming.length > 0 ? (
        <ul className="flex flex-col gap-3">{upcoming.map(card)}</ul>
      ) : (
        <p className="rounded-xl border border-border p-4 text-fg-muted">
          Ahora no hay torneos. Cuando el club arme uno, aparece acá.
        </p>
      )}
      {finished.length > 0 ? (
        <section aria-labelledby="finalizados" className="flex flex-col gap-3">
          <h2 id="finalizados" className="font-display text-2xl font-bold uppercase">
            Finalizados
          </h2>
          <ul className="flex flex-col gap-3">{finished.map(card)}</ul>
        </section>
      ) : null}
    </>
  )
}
```

- [ ] **Step 3: Write the detail page**

`app/(jugador)/torneos/[id]/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { getSiteUrl } from '@/lib/auth/redirect'
import { requirePlayer } from '@/lib/auth/viewer'
import { loadPlayerContext } from '@/lib/data/matches'
import { loadTournament } from '@/lib/data/tournaments'
import { dayLongLabel, timeIn } from '@/lib/domain/format'
import { isUuid } from '@/lib/domain/input'
import { paymentMethodsNote } from '@/lib/domain/payments'
import { localDateOf } from '@/lib/domain/time'
import { entryPaymentView } from '@/lib/domain/tournament-payments'
import { ranking } from '@/lib/domain/tournament-ranking'
import { tournamentShareText } from '@/lib/domain/tournament-share'
import { entryStatus, myEntry, tournamentLeaveStatus } from '@/lib/domain/tournaments'
import { joinTournament, leaveTournament, reportTournamentTransfer } from '../actions'
import { TournamentBoard } from './tournament-board'

export const metadata: Metadata = { title: 'Torneo' }

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ anotarme?: string }>

export default async function TournamentPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  // Without a session: sign in, the welcome form if needed, and back here (requirePlayer keeps the path).
  const viewer = await requirePlayer(`/torneos/${id}`)
  const { club } = viewer
  const tournament = await loadTournament(club, id)
  if (!tournament) notFound()

  const now = new Date()
  const { anotarme } = await searchParams
  const context = await loadPlayerContext(viewer, now)
  const entry = myEntry(tournament, viewer.userId)
  const dayText = dayLongLabel(localDateOf(tournament.startsAt, club.timezone))
  const timeText = `${timeIn(tournament.startsAt, club.timezone)} a ${timeIn(tournament.endsAt, club.timezone)}`

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <TournamentBoard
        tournament={tournament}
        viewerId={viewer.userId}
        myEntryId={entry?.id ?? null}
        whenText={`${dayText}, ${timeText}`}
        timezone={club.timezone}
        status={entryStatus(tournament, context.player, { now, busy: context.busy })}
        leave={tournamentLeaveStatus(tournament, viewer.userId)}
        payment={entry ? entryPaymentView(tournament.price, entry.payments, club.accepts_transfer) : null}
        paymentNote={paymentMethodsNote(club)}
        transfer={{ details: club.transfer_details, receiptRequired: club.transfer_receipt_required }}
        shareText={tournamentShareText({ tournament, clubName: club.name, dayText, timeText, url: `${getSiteUrl()}/torneos/${tournament.id}` })}
        ranking={ranking(tournament.entries, tournament.games, tournament.pointsPerGame)}
        initialJoin={anotarme === '1'}
        joinAction={joinTournament}
        leaveAction={leaveTournament}
        reportAction={reportTournamentTransfer}
      />
    </>
  )
}
```

- [ ] **Step 4: Typecheck and lint**

Run:
```bash
npm run typecheck
npm run lint
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(jugador)/torneos/page.tsx" "app/(jugador)/torneos/[id]/page.tsx"
git commit -m "feat(torneos): tournament list and detail pages"
```

---

### Task 22: Inicio con Mis reservas y pestaña Torneos

**Files:**
- Move: `app/(jugador)/reservas/my-booking-card.tsx` → `components/booking/my-booking-card.tsx`
- Move: `tests/unit/app/reservas/my-booking-card.test.tsx` → `tests/unit/components/booking/my-booking-card.test.tsx`
- Create: `lib/data/my-bookings.ts`
- Modify: `app/(jugador)/page.tsx`, `app/(jugador)/layout.tsx`, `app/(jugador)/reservas/page.tsx`
- Modify: `tests/e2e/player-booking.spec.ts`, `tests/e2e/late-cancel.spec.ts`

- [ ] **Step 1: Move the booking card and its test**

Run:
```bash
git mv "app/(jugador)/reservas/my-booking-card.tsx" components/booking/my-booking-card.tsx
mkdir -p tests/unit/components/booking
git mv tests/unit/app/reservas/my-booking-card.test.tsx tests/unit/components/booking/my-booking-card.test.tsx
```
In `tests/unit/components/booking/my-booking-card.test.tsx`, replace:
```tsx
import { MyBookingCard } from '@/app/(jugador)/reservas/my-booking-card'
```
with:
```tsx
import { MyBookingCard } from '@/components/booking/my-booking-card'
```

Run: `npx vitest run tests/unit/components/booking/my-booking-card.test.tsx`
Expected: PASS (solo se movió el archivo; el comportamiento no cambia).

- [ ] **Step 2: Move the loading out of the page**

`lib/data/my-bookings.ts`:
```ts
import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import { splitMyBookings, toMyBookingView, toMyMatchBookingView, type MyBookingView } from '@/lib/domain/my-bookings'
import { createClient } from '@/lib/supabase/server'

// The player's bookings and his share of each match booking, what Inicio lists (fase 3a moved
// "Mis reservas" there). Upcoming ones in start order; past and cancelled, newest first.
export async function loadMyBookings(
  viewer: { userId: string; club: Club },
  now = new Date(),
): Promise<{ upcoming: MyBookingView[]; past: MyBookingView[] }> {
  const { club } = viewer
  const supabase = await createClient()
  const [own, spots] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, starts_at, ends_at, price, status, court:courts(name), payments(status, amount, rejection_reason, created_at)')
      .eq('player_id', viewer.userId)
      .order('starts_at', { ascending: true }),
    supabase.from('match_slots').select('position, match:open_matches(booking_id)').eq('player_id', viewer.userId),
  ])
  if (own.error) throw own.error
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

  const rows = [
    ...own.data.map((row) => ({ startsAt: row.starts_at ?? '', view: toMyBookingView(row, club, now) })),
    ...matchBookings.data.flatMap((row) =>
      row.match_id
        ? [
            {
              startsAt: row.starts_at ?? '',
              view: toMyMatchBookingView({ ...row, match_id: row.match_id }, positionByBooking.get(row.id) ?? 2, viewer.userId, club, now),
            },
          ]
        : [],
    ),
  ].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  return splitMyBookings(rows.map((item) => item.view))
}
```

- [ ] **Step 3: `/reservas` goes to Inicio**

Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md`, then replace the whole of `app/(jugador)/reservas/page.tsx` with:
```tsx
import { redirect } from 'next/navigation'

// Mis reservas lives in Inicio since fase 3a: old links and bookmarks land there.
export default function MyBookingsPage() {
  redirect('/')
}
```
`app/(jugador)/reservas/actions.ts` stays where it is (Inicio imports it; `tests/unit/lib/actions/server-actions.test.ts` too).

- [ ] **Step 4: Five tabs**

In `app/(jugador)/layout.tsx`, replace `PLAYER_TABS` with:
```tsx
const PLAYER_TABS: TabItem[] = [
  { href: '/', label: 'Inicio', icon: 'home' },
  { href: '/reservar', label: 'Reservar', icon: 'calendar-plus' },
  { href: '/partidos', label: 'Partidos', icon: 'racket' },
  { href: '/torneos', label: 'Torneos', icon: 'trophy' },
  { href: '/perfil', label: 'Perfil', icon: 'user' },
]
```

- [ ] **Step 5: Inicio lists the bookings and the tournaments**

Replace the whole of `app/(jugador)/page.tsx` with:
```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/brand/logo'
import { MyBookingCard } from '@/components/booking/my-booking-card'
import { MatchCard } from '@/components/matches/match-card'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { getViewer } from '@/lib/auth/viewer'
import { loadDayGrid } from '@/lib/data/day'
import { loadFreeCourts, loadMatches, loadPlayerContext } from '@/lib/data/matches'
import { loadMyBookings } from '@/lib/data/my-bookings'
import { loadTournaments } from '@/lib/data/tournaments'
import { dayLabel, timeIn } from '@/lib/domain/format'
import { countFree } from '@/lib/domain/grid'
import { joinStatus } from '@/lib/domain/match-join'
import { riskOf } from '@/lib/domain/match-risk'
import { isInMatch, statusLabel } from '@/lib/domain/matches'
import { matchesForMe } from '@/lib/domain/matches-for-me'
import { categoryLabel, firstName, isProfileComplete, isStaffRole, SIDE_LABELS } from '@/lib/domain/profile'
import { addDays, localDateOf, zonedTime } from '@/lib/domain/time'
import { openTournamentsText } from '@/lib/domain/tournaments'
import { cancelMyBooking, reportTransfer } from './reservas/actions'

export default async function HomePage() {
  const viewer = await getViewer()
  if (!viewer) return <Landing />
  const { club, profile, membership } = viewer
  if (!membership || !isProfileComplete(profile, membership)) redirect('/bienvenida')

  const now = new Date()
  const member = { ...viewer, membership }
  const windowEnd = zonedTime(addDays(localDateOf(now, club.timezone), club.booking_window_days + 1), 0, club.timezone)
  const [grid, bookings, matches, context, tournaments] = await Promise.all([
    loadDayGrid(club, localDateOf(now, club.timezone), { userId: viewer.userId, audience: 'player' }, now),
    loadMyBookings(viewer, now),
    loadMatches(club, { from: now, to: windowEnd }),
    loadPlayerContext(member, now),
    loadTournaments(club, { endsAfter: now }),
  ])
  const freeToday = countFree(grid.rows)
  const forMe = matchesForMe(
    matches.filter((match) => match.status === 'forming'),
    context.player,
    { now, closeHours: club.match_close_hours, busy: context.busy, timezone: club.timezone, habits: context.habits },
  )
  const myMatches = matches.filter((match) => isInMatch(match, viewer.userId)).slice(0, 3)
  const freeCourts = await loadFreeCourts(club, forMe.map((item) => item.match))
  const openTournaments = tournaments.filter((tournament) => tournament.status === 'registration' && tournament.startsAt > now).length
  const today = localDateOf(now, club.timezone)
  const whenText = (start: Date) => `${dayLabel(localDateOf(start, club.timezone), today)} ${timeIn(start, club.timezone)}`
  const transfer = { details: club.transfer_details, receiptRequired: club.transfer_receipt_required }
  const bookingCard = (booking: (typeof bookings.upcoming)[number]) => (
    <li key={booking.id}>
      <MyBookingCard booking={booking} userId={viewer.userId} transfer={transfer} cancelAction={cancelMyBooking} reportAction={reportTransfer} />
    </li>
  )

  return (
    <>
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">Hola, {firstName(profile.display_name)}</h1>
        <p className="text-fg-muted">
          {categoryLabel(membership.category, membership.category_validated)}.
          {profile.side ? ` ${SIDE_LABELS[profile.side]}.` : ''}
        </p>
      </div>
      <section aria-labelledby="tus-reservas" className="flex flex-col gap-3">
        <h2 id="tus-reservas" className="font-display text-2xl font-bold uppercase">
          Tus reservas
        </h2>
        {bookings.upcoming.length > 0 ? (
          <ul className="flex flex-col gap-3">{bookings.upcoming.map(bookingCard)}</ul>
        ) : (
          <p className="text-fg-muted">
            No tenés reservas.{' '}
            <Link href="/reservar" className="font-semibold text-accent-ink underline">
              Reservá una cancha
            </Link>
            .
          </p>
        )}
      </section>
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
      <Link
        href="/torneos"
        className="flex min-h-11 items-center gap-3 rounded-2xl border border-border bg-surface p-4 font-semibold hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Icon name="trophy" className="text-accent-ink" />
        {openTournamentsText(openTournaments)}
      </Link>
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
      <Link href="/reservar" className={buttonClasses({ fullWidth: true })}>
        {freeToday === 1 ? '1 turno libre hoy' : `${freeToday} turnos libres hoy`}
      </Link>
      {bookings.past.length > 0 ? (
        <details className="flex flex-col gap-3">
          <summary className="cursor-pointer font-display text-xl font-bold uppercase">Pasadas y canceladas</summary>
          <ul className="mt-3 flex flex-col gap-3">{bookings.past.map(bookingCard)}</ul>
        </details>
      ) : null}
      {isStaffRole(membership.role) ? (
        <Link href="/club/grilla" className={buttonClasses({ variant: 'secondary', fullWidth: true })}>
          Panel del club
        </Link>
      ) : null}
    </>
  )
}

function Landing() {
  return (
    <>
      <Logo className="size-16" />
      <h1 className="font-display text-4xl font-bold uppercase">Rustic Pádel</h1>
      <Card>
        <p className="mb-4 text-fg-muted">Reservá cancha, armá partido y anotate en los torneos desde el celular.</p>
        <Link href="/auth/ingreso" className={buttonClasses({ fullWidth: true })}>
          Ingresar
        </Link>
      </Card>
    </>
  )
}
```

- [ ] **Step 6: The two e2e flows that went through Mis reservas**

In `tests/e2e/player-booking.spec.ts`, replace:
```ts
  // The booking shows up in Mis reservas, pending payment.
  await page.getByRole('link', { name: 'Mis reservas' }).click()
```
with:
```ts
  // The booking shows up in Inicio, pending payment.
  await page.getByRole('link', { name: 'Inicio' }).click()
  await expect(page.getByRole('heading', { name: 'Tus reservas' })).toBeVisible()
```

In `tests/e2e/late-cancel.spec.ts`, replace:
```ts
  await signInWithMagicLink(page, player.email, '/reservas')
  await expect(page).toHaveURL(/\/reservas/)
```
with:
```ts
  await signInWithMagicLink(page, player.email, '/')
  await expect(page.getByRole('heading', { name: 'Tus reservas' })).toBeVisible()
```

- [ ] **Step 7: Verify**

Run:
```bash
npm test
npm run typecheck
npm run lint
npx playwright test tests/e2e/player-booking.spec.ts tests/e2e/late-cancel.spec.ts --workers=1
```
Expected: todo PASS.

- [ ] **Step 8: Commit**

```bash
git add components/booking/my-booking-card.tsx "app/(jugador)/reservas/page.tsx" tests/unit/components/booking/my-booking-card.test.tsx lib/data/my-bookings.ts "app/(jugador)/page.tsx" "app/(jugador)/layout.tsx" tests/e2e/player-booking.spec.ts tests/e2e/late-cancel.spec.ts
git status --short
git commit -m "feat(inicio): bookings on Inicio and a Torneos tab"
```
Expected before the commit: `git status --short` shows the two moves (`R`) and the modified files staged, nothing left unstaged.

---

## Corte 6: Pantallas del club

### Task 23: Pestaña Torneos y lista del club

**Files:**
- Modify: `lib/club/tabs.ts`
- Test: `tests/unit/lib/club/tabs.test.ts`
- Create: `app/(club)/club/torneos/page.tsx`

- [ ] **Step 1: Write the failing test**

Replace the three expectations in `tests/unit/lib/club/tabs.test.ts` with:
```ts
  it('shows the day-to-day screens to reception', () => {
    expect(clubTabs('reception').map((tab) => tab.label)).toEqual(['Grilla', 'Calendario', 'Torneos', 'Cobros', 'Jugadores'])
  })

  it('adds the settings to admins', () => {
    expect(clubTabs('admin').map((tab) => tab.href)).toEqual([
      '/club/grilla', '/club/calendario', '/club/torneos', '/club/cobros', '/club/jugadores', '/club/ajustes',
    ])
  })

  it('gives every tab an icon', () => {
    expect(clubTabs('admin').map((tab) => tab.icon)).toEqual(['grid', 'calendar', 'trophy', 'cash', 'users', 'sliders'])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/club/tabs.test.ts`
Expected: FAIL (no `Torneos`).

- [ ] **Step 3: Add the tab**

In `lib/club/tabs.ts`, add after the Calendario tab:
```ts
    { href: '/club/torneos', label: 'Torneos', icon: 'trophy' },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/club/tabs.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the club list page**

(no unit test — Server Component que compone piezas probadas; lo recorre el e2e)

`app/(club)/club/torneos/page.tsx`:
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { requireStaff } from '@/lib/auth/viewer'
import { loadTournaments } from '@/lib/data/tournaments'
import { dayLabel, timeIn } from '@/lib/domain/format'
import { localDateOf } from '@/lib/domain/time'
import { courtsText, spotsLabel, TOURNAMENT_STATUS_LABELS } from '@/lib/domain/tournaments'

export const metadata: Metadata = { title: 'Torneos' }

export default async function ClubTournamentsPage() {
  const viewer = await requireStaff('/club/torneos')
  const { club } = viewer
  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const tournaments = await loadTournaments(club, { endsAfter: new Date(now.getTime() - 30 * 86_400_000) })

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold uppercase">Torneos</h2>
        <Link href="/club/torneos/nuevo" className={buttonClasses()}>
          Nuevo americano
        </Link>
      </div>
      {tournaments.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {tournaments.map((tournament) => (
            <li key={tournament.id}>
              <Card className="flex h-full flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{tournament.name}</p>
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
                    {spotsLabel(tournament)}
                  </span>
                </div>
                <p className="text-sm text-fg-muted">
                  {dayLabel(localDateOf(tournament.startsAt, club.timezone), today)} {timeIn(tournament.startsAt, club.timezone)} a{' '}
                  {timeIn(tournament.endsAt, club.timezone)}, {courtsText(tournament.courtNames)}
                </p>
                <p className="text-sm">{TOURNAMENT_STATUS_LABELS[tournament.status]}</p>
                <Link href={`/club/torneos/${tournament.id}`} className={buttonClasses({ variant: 'secondary', className: 'mt-auto' })}>
                  Gestionar
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-4 text-fg-muted">
          Todavía no hay torneos. Armá el primero con &quot;Nuevo americano&quot;.
        </p>
      )}
    </>
  )
}
```

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add lib/club/tabs.ts tests/unit/lib/club/tabs.test.ts "app/(club)/club/torneos/page.tsx"
git commit -m "feat(club): tournaments tab and list"
```

---

### Task 24: "Nuevo americano"

**Files:**
- Create: `components/tournaments/new-tournament-form.tsx`
- Create: `app/(club)/club/torneos/nuevo/page.tsx`
- Test: `tests/unit/components/tournaments/new-tournament-form.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/tournaments/new-tournament-form.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NewTournamentForm } from '@/components/tournaments/new-tournament-form'
import type { FormAction } from '@/components/ui/action-form'
import { at, TIMEZONE } from '../../fixtures/grid'

const COURTS = [
  { id: 'c1', name: 'Cancha 1' },
  { id: 'c2', name: 'Cancha 2' },
]

function renderForm() {
  const action = vi.fn<FormAction>(async () => ({ status: 'idle' as const }))
  render(
    <NewTournamentForm
      courts={COURTS}
      times={['08:00', '18:00', '21:30']}
      today="2026-10-01"
      timezone={TIMEZONE}
      opensAt="08:00:00"
      closesAt="23:00:00"
      taken={[{ courtId: 'c1', startsAt: at('19:00'), endsAt: at('20:30') }]}
      action={action}
    />,
  )
  return action
}

describe('NewTournamentForm', () => {
  it('proposes 8 players, 24 points, 20 minutes, 7 rounds and $400 on the first two courts', () => {
    renderForm()
    expect(screen.getByLabelText('Jugadores')).toHaveValue('8')
    expect(screen.getByLabelText('Puntos por partido')).toHaveValue(24)
    expect(screen.getByLabelText('Minutos por ronda')).toHaveValue(20)
    expect(screen.getByLabelText('Rondas')).toHaveValue(7)
    expect(screen.getByLabelText('Precio por jugador')).toHaveValue(400)
    expect(screen.getByLabelText('Cancha 1')).toBeChecked()
    expect(screen.getByLabelText('Cancha 2')).toBeChecked()
  })

  it('says when it ends and warns about taken courts before saving', () => {
    renderForm()
    expect(screen.getByRole('note')).toHaveTextContent('Termina a las 20:20')
    expect(screen.getByRole('note')).toHaveTextContent('Cancha 1 ya tiene algo a esa hora.')
  })

  it('updates the end and the warnings as the choices change', async () => {
    renderForm()
    await userEvent.selectOptions(screen.getByLabelText('Hora'), '08:00')
    expect(screen.getByRole('note')).toHaveTextContent('Termina a las 10:20')
    expect(screen.getByRole('note')).not.toHaveTextContent('ya tiene')
    await userEvent.selectOptions(screen.getByLabelText('Jugadores'), '12')
    expect(screen.getByRole('note')).toHaveTextContent('Termina a las 12:40')
    await userEvent.click(screen.getByLabelText('Cancha 2'))
    expect(screen.getByRole('note')).toHaveTextContent('Termina a las 15:00')
    await userEvent.selectOptions(screen.getByLabelText('Hora'), '21:30')
    expect(screen.getByRole('note')).toHaveTextContent('Queda fuera del horario del club.')
  })

  it('checks the warnings again on another day', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-10-02' } })
    expect(screen.getByRole('note')).not.toHaveTextContent('ya tiene')
  })

  it('sends every field to the action', async () => {
    const action = renderForm()
    await userEvent.type(screen.getByLabelText('Nombre'), 'Americano de octubre')
    await userEvent.click(screen.getByRole('button', { name: 'Crear americano' }))
    await waitFor(() => expect(action).toHaveBeenCalled())
    const form = action.mock.calls[0][1]
    expect(form.get('name')).toBe('Americano de octubre')
    expect(form.get('date')).toBe('2026-10-01')
    expect(form.get('time')).toBe('18:00')
    expect(form.getAll('courtIds')).toEqual(['c1', 'c2'])
    expect(form.get('maxPlayers')).toBe('8')
    expect(form.get('type')).toBe('mixed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/tournaments/new-tournament-form.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/tournaments/new-tournament-form"`).

- [ ] **Step 3: Write the form**

`components/tournaments/new-tournament-form.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import { timeIn } from '@/lib/domain/format'
import { isLocalDate } from '@/lib/domain/input'
import { MATCH_TYPE_LABELS, MATCH_TYPES } from '@/lib/domain/matches'
import { CATEGORIES } from '@/lib/domain/profile'
import { parseTime, zonedTime, type LocalDate } from '@/lib/domain/time'
import { busyCourtIds, fitsOpeningHours, tournamentPeriod, type TakenPeriod } from '@/lib/domain/tournament-form'
import { courtsText, TOURNAMENT_DEFAULTS, TOURNAMENT_SIZES } from '@/lib/domain/tournaments'

export type NewTournamentFormProps = {
  courts: { id: string; name: string }[]
  times: string[]
  today: LocalDate
  timezone: string
  opensAt: string
  closesAt: string
  taken: TakenPeriod[]
  action: FormAction
}

// Design: "Nuevo americano". Shows when it ends and which chosen courts are already taken before
// saving; create_tournament has the last word (courts_busy, outside_hours).
export function NewTournamentForm({ courts, times, today, timezone, opensAt, closesAt, taken, action }: NewTournamentFormProps) {
  const [date, setDate] = useState<string>(today)
  const [time, setTime] = useState(times.includes('18:00') ? '18:00' : (times[0] ?? '08:00'))
  const [maxPlayers, setMaxPlayers] = useState<number>(TOURNAMENT_DEFAULTS.maxPlayers)
  const [courtIds, setCourtIds] = useState(courts.slice(0, TOURNAMENT_DEFAULTS.maxPlayers / 4).map((court) => court.id))
  const [rounds, setRounds] = useState<number>(TOURNAMENT_DEFAULTS.rounds)
  const [roundMinutes, setRoundMinutes] = useState<number>(TOURNAMENT_DEFAULTS.roundMinutes)

  const period =
    isLocalDate(date) && courtIds.length > 0 && rounds > 0 && roundMinutes > 0
      ? tournamentPeriod(zonedTime(date, parseTime(time), timezone), { players: maxPlayers, courts: courtIds.length, rounds, roundMinutes })
      : null
  const busy = period ? busyCourtIds(taken, courtIds, period) : []
  const busyNames = courts.filter((court) => busy.includes(court.id)).map((court) => court.name)
  const toggleCourt = (courtId: string, checked: boolean) =>
    setCourtIds((current) =>
      checked
        ? courts.map((court) => court.id).filter((id) => id === courtId || current.includes(id))
        : current.filter((id) => id !== courtId),
    )

  return (
    <ActionForm action={action} submitLabel="Crear americano" pendingLabel="Creando…">
      <Field label="Nombre" htmlFor="name">
        <input id="name" name="name" required maxLength={60} placeholder="Americano de los jueves" className={inputClasses} />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Fecha" htmlFor="date">
          <input id="date" name="date" type="date" min={today} required value={date} onChange={(event) => setDate(event.target.value)} className={inputClasses} />
        </Field>
        <Field label="Hora" htmlFor="time">
          <select id="time" name="time" value={time} onChange={(event) => setTime(event.target.value)} className={inputClasses}>
            {times.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Jugadores" htmlFor="maxPlayers">
          <select
            id="maxPlayers"
            name="maxPlayers"
            value={maxPlayers}
            onChange={(event) => {
              const players = Number(event.target.value)
              setMaxPlayers(players)
              setRounds((current) => Math.min(current, players - 1))
            }}
            className={inputClasses}
          >
            {TOURNAMENT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} jugadores
              </option>
            ))}
          </select>
        </Field>
        <Field label="Rondas" htmlFor="rounds">
          <input id="rounds" name="rounds" type="number" inputMode="numeric" min={1} max={maxPlayers - 1} required value={rounds}
            onChange={(event) => setRounds(Number(event.target.value))} className={inputClasses} />
        </Field>
        <Field label="Minutos por ronda" htmlFor="roundMinutes">
          <input id="roundMinutes" name="roundMinutes" type="number" inputMode="numeric" min={5} max={90} required value={roundMinutes}
            onChange={(event) => setRoundMinutes(Number(event.target.value))} className={inputClasses} />
        </Field>
        <Field label="Puntos por partido" htmlFor="pointsPerGame">
          <input id="pointsPerGame" name="pointsPerGame" type="number" inputMode="numeric" min={1} max={99} required
            defaultValue={TOURNAMENT_DEFAULTS.pointsPerGame} className={inputClasses} />
        </Field>
        <Field label="Categoría desde" htmlFor="categoryMin">
          <select id="categoryMin" name="categoryMin" defaultValue={1} className={inputClasses}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}ª
              </option>
            ))}
          </select>
        </Field>
        <Field label="Categoría hasta" htmlFor="categoryMax">
          <select id="categoryMax" name="categoryMax" defaultValue={8} className={inputClasses}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}ª
              </option>
            ))}
          </select>
        </Field>
        <Field label="Género" htmlFor="type">
          <select id="type" name="type" defaultValue="mixed" className={inputClasses}>
            {MATCH_TYPES.map((type) => (
              <option key={type} value={type}>
                {MATCH_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Precio por jugador" htmlFor="price">
          <input id="price" name="price" type="number" inputMode="numeric" min={0} required defaultValue={TOURNAMENT_DEFAULTS.price}
            className={inputClasses} />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Canchas</legend>
        <div className="flex flex-wrap gap-4">
          {courts.map((court) => (
            <label key={court.id} className="inline-flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                name="courtIds"
                value={court.id}
                checked={courtIds.includes(court.id)}
                onChange={(event) => toggleCourt(court.id, event.target.checked)}
                className="size-5 accent-accent"
              />
              {court.name}
            </label>
          ))}
        </div>
        <p className="text-sm text-fg-muted">
          Con {maxPlayers} jugadores se usan hasta {maxPlayers / 4} canchas.
        </p>
      </fieldset>
      {period ? (
        <div role="note" className="flex flex-col gap-1 rounded-xl border border-border p-3 text-sm">
          <p className="font-semibold">Termina a las {timeIn(period.endsAt, timezone)}</p>
          {!fitsOpeningHours(period, { timezone, opensAt, closesAt }) ? <p>Queda fuera del horario del club.</p> : null}
          {busyNames.length > 0 ? (
            <p>
              {courtsText(busyNames)} {busyNames.length === 1 ? 'ya tiene' : 'ya tienen'} algo a esa hora.
            </p>
          ) : null}
        </div>
      ) : null}
    </ActionForm>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/tournaments/new-tournament-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the page**

`app/(club)/club/torneos/nuevo/page.tsx`:
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { NewTournamentForm } from '@/components/tournaments/new-tournament-form'
import { Card } from '@/components/ui/card'
import { requireStaff } from '@/lib/auth/viewer'
import { loadActiveCourts, loadTakenPeriods } from '@/lib/data/tournaments'
import { TIME_OPTIONS } from '@/lib/domain/settings'
import { localDateOf, parseTime } from '@/lib/domain/time'
import { createTournament } from '../actions'

export const metadata: Metadata = { title: 'Nuevo americano' }

export default async function NewTournamentPage() {
  const viewer = await requireStaff('/club/torneos/nuevo')
  const { club } = viewer
  const now = new Date()
  const [courts, taken] = await Promise.all([loadActiveCourts(club), loadTakenPeriods(club, now, 60)])
  const opens = parseTime(club.opens_at)
  const closes = parseTime(club.closes_at)
  const times = TIME_OPTIONS.filter((time) => parseTime(time) >= opens && parseTime(time) < closes)

  return (
    <>
      <Link href="/club/torneos" className="text-sm font-semibold text-accent-ink underline">
        Volver a torneos
      </Link>
      <h2 className="font-display text-2xl font-bold uppercase">Nuevo americano</h2>
      <Card>
        <NewTournamentForm
          courts={courts}
          times={times}
          today={localDateOf(now, club.timezone)}
          timezone={club.timezone}
          opensAt={club.opens_at}
          closesAt={club.closes_at}
          taken={taken}
          action={createTournament}
        />
      </Card>
    </>
  )
}
```

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add components/tournaments/new-tournament-form.tsx "app/(club)/club/torneos/nuevo/page.tsx" tests/unit/components/tournaments/new-tournament-form.test.tsx
git commit -m "feat(club): new americano form"
```

---

### Task 25: Carga de resultados (`ScoreForm`, `ScoreBoard`)

**Files:**
- Create: `components/tournaments/score-form.tsx`
- Create: `components/tournaments/score-board.tsx`
- Test: `tests/unit/components/tournaments/score-form.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/tournaments/score-form.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ScoreBoard } from '@/components/tournaments/score-board'
import { ScoreForm } from '@/components/tournaments/score-form'
import type { FormAction } from '@/components/ui/action-form'
import { TIMEZONE } from '../../fixtures/grid'
import { makeEntries, makeGame, makeTournament } from '../../fixtures/tournaments'

describe('ScoreForm', () => {
  it('fills team B with what is left and sends team A points', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok' as const, message: 'Resultado guardado.' }))
    render(<ScoreForm gameId="g1" teamA="Ana y Bruno" teamB="Carla y Dani" pointsPerGame={24} scoreA={null} action={action} />)
    expect(screen.getByText('Carla y Dani: –')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Puntos de Ana y Bruno'), '15')
    expect(screen.getByText('Carla y Dani: 9')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(action).toHaveBeenCalled())
    const form = action.mock.calls[0][1]
    expect(form.get('gameId')).toBe('g1')
    expect(form.get('scoreA')).toBe('15')
    expect(await screen.findByRole('status')).toHaveTextContent('Resultado guardado.')
  })

  it('starts from the recorded result and does not guess an impossible one', async () => {
    render(<ScoreForm gameId="g1" teamA="Ana y Bruno" teamB="Carla y Dani" pointsPerGame={24} scoreA={14} action={vi.fn<FormAction>()} />)
    const input = screen.getByLabelText('Puntos de Ana y Bruno')
    expect(input).toHaveValue(14)
    expect(screen.getByText('Carla y Dani: 10')).toBeInTheDocument()
    await userEvent.clear(input)
    await userEvent.type(input, '30')
    expect(screen.getByText('Carla y Dani: –')).toBeInTheDocument()
  })
})

describe('ScoreBoard', () => {
  it('has one form per game, by round, and counts what is missing', () => {
    const tournament = makeTournament({
      status: 'in_progress',
      entries: makeEntries(8),
      games: [
        makeGame('g1', ['e1', 'e2'], ['e3', 'e4'], 14),
        makeGame('g2', ['e5', 'e6'], ['e7', 'e8'], null, { courtName: 'Cancha 2' }),
        makeGame('g3', ['e1', 'e3'], ['e5', 'e7'], null, { round: 2 }),
      ],
    })
    render(<ScoreBoard tournament={tournament} timezone={TIMEZONE} action={vi.fn<FormAction>()} />)
    expect(screen.getByText('Faltan 2 de 3.')).toBeInTheDocument()
    const first = screen.getByRole('region', { name: 'Ronda 1' })
    expect(within(first).getAllByRole('button', { name: 'Guardar' })).toHaveLength(2)
    expect(within(first).getByLabelText('Puntos de Jugador 1 y Jugador 2')).toHaveValue(14)
    expect(screen.getByRole('region', { name: 'Ronda 2' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/tournaments/score-form.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/tournaments/score-board"`).

- [ ] **Step 3: Write the components**

`components/tournaments/score-form.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import { scoreB } from '@/lib/domain/tournament-ranking'

// Reception types team A's points; team B's are the rest of the game (record_tournament_score).
export function ScoreForm({
  gameId,
  teamA,
  teamB,
  pointsPerGame,
  scoreA,
  action,
}: {
  gameId: string
  teamA: string
  teamB: string
  pointsPerGame: number
  scoreA: number | null
  action: FormAction
}) {
  const [value, setValue] = useState(scoreA === null ? '' : String(scoreA))
  const typed = /^\d+$/.test(value) ? Number(value) : null
  const other = typed !== null && typed <= pointsPerGame ? scoreB(typed, pointsPerGame) : null
  const id = `score-${gameId}`

  return (
    <ActionForm action={action} submitLabel="Guardar" pendingLabel="Guardando…" variant="secondary">
      <input type="hidden" name="gameId" value={gameId} />
      <Field label={`Puntos de ${teamA}`} htmlFor={id}>
        <input
          id={id}
          name="scoreA"
          type="number"
          inputMode="numeric"
          min={0}
          max={pointsPerGame}
          required
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className={inputClasses}
        />
      </Field>
      <p className="text-sm" aria-live="polite">
        {teamB}: {other ?? '–'}
      </p>
    </ActionForm>
  )
}
```

`components/tournaments/score-board.tsx`:
```tsx
import type { FormAction } from '@/components/ui/action-form'
import { timeIn } from '@/lib/domain/format'
import { entryNames, gamesByRound, missingScores, teamName, type Tournament } from '@/lib/domain/tournaments'
import { ScoreForm } from './score-form'

// Design: "Resultados". One form per game, round by round; each one can be corrected until it finishes.
export function ScoreBoard({ tournament, timezone, action }: { tournament: Tournament; timezone: string; action: FormAction }) {
  const names = entryNames(tournament)
  const missing = missingScores(tournament.games)
  return (
    <section aria-labelledby="resultados" className="flex flex-col gap-4">
      <div>
        <h2 id="resultados" className="font-display text-2xl font-bold uppercase">
          Resultados
        </h2>
        <p className="text-sm text-fg-muted">
          {missing === 0 ? 'Están todos cargados.' : `Faltan ${missing} de ${tournament.games.length}.`}
        </p>
      </div>
      {gamesByRound(tournament.games).map(({ round, games }) => (
        <section key={round} aria-labelledby={`ronda-${round}`} className="flex flex-col gap-2">
          <h3 id={`ronda-${round}`} className="font-display text-xl font-bold uppercase">
            Ronda {round}
          </h3>
          <ul className="grid gap-3 md:grid-cols-2">
            {games.map((game) => (
              <li key={game.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <p className="text-sm text-fg-muted">
                  {timeIn(game.startsAt, timezone)}, {game.courtName}
                </p>
                <ScoreForm
                  gameId={game.id}
                  teamA={teamName(game.teamA, names)}
                  teamB={teamName(game.teamB, names)}
                  pointsPerGame={tournament.pointsPerGame}
                  scoreA={game.scoreA}
                  action={action}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/tournaments/score-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/tournaments/score-form.tsx components/tournaments/score-board.tsx tests/unit/components/tournaments/score-form.test.tsx
git commit -m "feat(club): record tournament results"
```

---

### Task 26: Anotados y acciones del torneo (`EntriesManager`, `TournamentControls`)

**Files:**
- Create: `components/tournaments/entries-manager.tsx`
- Create: `components/tournaments/tournament-controls.tsx`
- Test: `tests/unit/components/tournaments/tournament-management.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/tournaments/tournament-management.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EntriesManager, type EntryActions } from '@/components/tournaments/entries-manager'
import { TournamentControls, type TournamentStepActions } from '@/components/tournaments/tournament-controls'
import type { FormAction } from '@/components/ui/action-form'
import type { TournamentEntry } from '@/lib/domain/tournaments'
import { makeEntries, makeGame, makeTournament } from '../../fixtures/tournaments'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })
const paid = (status: 'confirmed' | 'reported') => [{ status, amount: 400, rejection_reason: null, created_at: '2026-09-30T12:00:00Z' }]
const ENTRIES: TournamentEntry[] = [
  { id: 'e1', playerId: 'p1', name: 'Ana', isGuest: false, payments: [] },
  { id: 'e2', playerId: null, name: 'Pepe', isGuest: true, payments: paid('confirmed') },
  { id: 'e3', playerId: 'p3', name: 'Bruno', isGuest: false, payments: paid('reported') },
]

function entryActions(): EntryActions {
  return { cash: vi.fn<FormAction>(ok), remove: vi.fn<FormAction>(ok), addGuest: vi.fn<FormAction>(ok) }
}

function stepActions(): TournamentStepActions {
  return {
    close: vi.fn<FormAction>(ok),
    reopen: vi.fn<FormAction>(ok),
    start: vi.fn<FormAction>(ok),
    finish: vi.fn<FormAction>(ok),
    cancel: vi.fn<FormAction>(ok),
  }
}

describe('EntriesManager', () => {
  it('shows who is in, whether each one paid, and charges cash to whoever owes', async () => {
    const actions = entryActions()
    render(<EntriesManager tournament={makeTournament({ entries: ENTRIES })} acceptsCash actions={actions} />)
    expect(screen.getByRole('heading', { name: 'Anotados (3 de 8)' })).toBeInTheDocument()
    const [ana, pepe, bruno] = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(ana).toHaveTextContent('Pendiente de pago')
    expect(pepe).toHaveTextContent('Pepe (invitado)')
    expect(pepe).toHaveTextContent('Pagada')
    expect(bruno).toHaveTextContent('Transferencia informada')
    expect(within(pepe).queryByRole('button', { name: /Cobrar/ })).not.toBeInTheDocument()
    expect(within(bruno).queryByRole('button', { name: /Cobrar/ })).not.toBeInTheDocument()
    await userEvent.click(within(ana).getByRole('button', { name: 'Cobrar $400' }))
    await waitFor(() => expect(actions.cash).toHaveBeenCalled())
    const form = vi.mocked(actions.cash).mock.calls[0][1]
    expect(form.get('entryId')).toBe('e1')
    expect(form.get('amount')).toBe('400')
  })

  it('lets reception take people out and add guests until it starts', () => {
    render(<EntriesManager tournament={makeTournament({ entries: ENTRIES, status: 'closed' })} acceptsCash actions={entryActions()} />)
    expect(screen.getAllByRole('button', { name: 'Sacar del torneo' })).toHaveLength(3)
    expect(screen.getByLabelText('Nombre del invitado')).toBeInTheDocument()
  })

  it('stops that once it is on, and asks for no guests when it is full', () => {
    const { unmount } = render(
      <EntriesManager tournament={makeTournament({ entries: ENTRIES, status: 'in_progress' })} acceptsCash actions={entryActions()} />,
    )
    expect(screen.queryByRole('button', { name: 'Sacar del torneo' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre del invitado')).not.toBeInTheDocument()
    unmount()
    render(<EntriesManager tournament={makeTournament({ entries: makeEntries(8) })} acceptsCash={false} actions={entryActions()} />)
    expect(screen.queryByLabelText('Nombre del invitado')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cobrar/ })).not.toBeInTheDocument()
  })
})

describe('TournamentControls', () => {
  it('closes registration while it is open', () => {
    render(<TournamentControls tournament={makeTournament()} actions={stepActions()} />)
    expect(screen.getByRole('button', { name: 'Cerrar inscripción' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Armar fixture' })).not.toBeInTheDocument()
  })

  it('builds the fixture or reopens once closed, saying how many signed up', async () => {
    const actions = stepActions()
    render(<TournamentControls tournament={makeTournament({ status: 'closed' })} actions={actions} />)
    expect(screen.getByText('El fixture se arma con 8, 12 o 16 anotados. Hay 5.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reabrir inscripción' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Armar fixture' }))
    await waitFor(() => expect(actions.start).toHaveBeenCalled())
    expect(vi.mocked(actions.start).mock.calls[0][1].get('tournamentId')).toBe('t1')
  })

  it('finishes once it is on, saying how many results are missing', () => {
    const games = [makeGame('g1', ['e1', 'e2'], ['e3', 'e4'], 14), makeGame('g2', ['e5', 'e1'], ['e2', 'e3'], null)]
    render(<TournamentControls tournament={makeTournament({ status: 'in_progress', games })} actions={stepActions()} />)
    expect(screen.getByText('Falta cargar 1 resultado.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finalizar torneo' })).toBeInTheDocument()
  })

  it('asks before cancelling, and not once it finished', async () => {
    const actions = stepActions()
    const { unmount } = render(<TournamentControls tournament={makeTournament()} actions={actions} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar torneo' }))
    const sheet = screen.getByRole('dialog', { name: 'Cancelar torneo' })
    expect(sheet).toHaveTextContent('Libera las canchas')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Sí, cancelar el torneo' }))
    await waitFor(() => expect(actions.cancel).toHaveBeenCalled())
    unmount()
    render(<TournamentControls tournament={makeTournament({ status: 'finished' })} actions={stepActions()} />)
    expect(screen.queryByRole('button', { name: 'Cancelar torneo' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/tournaments/tournament-management.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/tournaments/entries-manager"`).

- [ ] **Step 3: Write the components**

`components/tournaments/entries-manager.tsx`:
```tsx
import { PaymentBadge } from '@/components/booking/payment-badge'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import { formatPrice } from '@/lib/domain/format'
import { entryPaymentView } from '@/lib/domain/tournament-payments'
import type { Tournament } from '@/lib/domain/tournaments'

export type EntryActions = { cash: FormAction; remove: FormAction; addGuest: FormAction }

// Design: "Gestión". Who is in and whether each one paid; until it starts, reception takes people
// out and adds guests. Cash for whoever owes, as long as no transfer is waiting for review.
export function EntriesManager({ tournament, acceptsCash, actions }: { tournament: Tournament; acceptsCash: boolean; actions: EntryActions }) {
  const editable = tournament.status === 'registration' || tournament.status === 'closed'
  const full = tournament.entries.length >= tournament.maxPlayers

  return (
    <section aria-labelledby="anotados" className="flex flex-col gap-3">
      <h2 id="anotados" className="font-display text-2xl font-bold uppercase">
        Anotados ({tournament.entries.length} de {tournament.maxPlayers})
      </h2>
      {tournament.entries.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {tournament.entries.map((entry) => {
            const payment = entryPaymentView(tournament.price, entry.payments, false)
            return (
              <li key={entry.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {entry.name}
                    {entry.isGuest ? <span className="font-normal text-fg-muted"> (invitado)</span> : null}
                  </span>
                  <PaymentBadge state={payment.state} />
                </div>
                {acceptsCash && payment.state === 'pending' && tournament.status !== 'cancelled' ? (
                  <ActionForm action={actions.cash} submitLabel={`Cobrar ${formatPrice(payment.due)}`} pendingLabel="Registrando…" variant="secondary">
                    <input type="hidden" name="entryId" value={entry.id} />
                    <input type="hidden" name="amount" value={payment.due} />
                  </ActionForm>
                ) : null}
                {editable ? (
                  <ActionForm action={actions.remove} submitLabel="Sacar del torneo" pendingLabel="Sacando…" variant="ghost">
                    <input type="hidden" name="entryId" value={entry.id} />
                  </ActionForm>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-fg-muted">Todavía no se anotó nadie.</p>
      )}
      {editable && !full ? (
        <ActionForm action={actions.addGuest} submitLabel="Agregar invitado" pendingLabel="Agregando…" variant="secondary">
          <input type="hidden" name="tournamentId" value={tournament.id} />
          <Field label="Nombre del invitado" htmlFor="guestName">
            <input id="guestName" name="guestName" required maxLength={60} className={inputClasses} />
          </Field>
        </ActionForm>
      ) : null}
    </section>
  )
}
```

`components/tournaments/tournament-controls.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button, type ButtonVariant } from '@/components/ui/button'
import { missingScores, type Tournament } from '@/lib/domain/tournaments'

export type TournamentStepActions = { close: FormAction; reopen: FormAction; start: FormAction; finish: FormAction; cancel: FormAction }

function Step({
  action,
  tournamentId,
  label,
  pendingLabel,
  variant,
}: {
  action: FormAction
  tournamentId: string
  label: string
  pendingLabel: string
  variant?: ButtonVariant
}) {
  return (
    <ActionForm action={action} submitLabel={label} pendingLabel={pendingLabel} variant={variant}>
      <input type="hidden" name="tournamentId" value={tournamentId} />
    </ActionForm>
  )
}

// Design: "Gestión". Only the step that fits the current state: close, reopen or build the fixture,
// finish; and cancel until it finished.
export function TournamentControls({ tournament, actions }: { tournament: Tournament; actions: TournamentStepActions }) {
  const [confirmCancel, setConfirmCancel] = useState(false)
  const { status, id } = tournament
  const missing = missingScores(tournament.games)

  return (
    <section aria-label="Acciones del torneo" className="flex flex-col gap-3">
      {status === 'registration' ? (
        <Step action={actions.close} tournamentId={id} label="Cerrar inscripción" pendingLabel="Cerrando…" />
      ) : null}
      {status === 'closed' ? (
        <>
          <p className="text-sm text-fg-muted">
            El fixture se arma con 8, 12 o 16 anotados. Hay {tournament.entries.length}.
          </p>
          <Step action={actions.start} tournamentId={id} label="Armar fixture" pendingLabel="Armando…" />
          <Step action={actions.reopen} tournamentId={id} label="Reabrir inscripción" pendingLabel="Abriendo…" variant="secondary" />
        </>
      ) : null}
      {status === 'in_progress' ? (
        <>
          {missing > 0 ? (
            <p className="text-sm text-fg-muted">
              {missing === 1 ? 'Falta cargar 1 resultado.' : `Faltan cargar ${missing} resultados.`}
            </p>
          ) : null}
          <Step action={actions.finish} tournamentId={id} label="Finalizar torneo" pendingLabel="Finalizando…" />
        </>
      ) : null}
      {status !== 'finished' && status !== 'cancelled' ? (
        <Button variant="danger" onClick={() => setConfirmCancel(true)}>
          Cancelar torneo
        </Button>
      ) : null}
      <BottomSheet open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancelar torneo">
        <p className="mb-4">
          Libera las canchas y los anotados lo ven en la app. Lo que ya se cobró queda en Cobros para devolver.
        </p>
        <Step action={actions.cancel} tournamentId={id} label="Sí, cancelar el torneo" pendingLabel="Cancelando…" variant="danger" />
      </BottomSheet>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/tournaments/tournament-management.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/tournaments/entries-manager.tsx components/tournaments/tournament-controls.tsx tests/unit/components/tournaments/tournament-management.test.tsx
git commit -m "feat(club): tournament entries, payments and steps"
```

---

### Task 27: Gestión `/club/torneos/<id>`

**Files:**
- Create: `app/(club)/club/torneos/[id]/page.tsx`

(no unit test — Server Component que compone piezas probadas; lo recorre el e2e de la Task 33)

- [ ] **Step 1: Write the page**

`app/(club)/club/torneos/[id]/page.tsx`:
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { EntriesManager } from '@/components/tournaments/entries-manager'
import { FixtureList } from '@/components/tournaments/fixture-list'
import { RankingTable } from '@/components/tournaments/ranking-table'
import { ScoreBoard } from '@/components/tournaments/score-board'
import { TournamentControls } from '@/components/tournaments/tournament-controls'
import { requireStaff } from '@/lib/auth/viewer'
import { loadTournament } from '@/lib/data/tournaments'
import { dayLongLabel, formatPrice, timeIn } from '@/lib/domain/format'
import { isUuid } from '@/lib/domain/input'
import { categoryRangeLabel, MATCH_TYPE_LABELS } from '@/lib/domain/matches'
import { localDateOf } from '@/lib/domain/time'
import { ranking } from '@/lib/domain/tournament-ranking'
import { courtsText, formatText, spotsLabel, TOURNAMENT_STATUS_LABELS } from '@/lib/domain/tournaments'
import {
  addGuest,
  cancelTournament,
  closeRegistration,
  finishTournament,
  recordScore,
  recordTournamentCash,
  removeEntry,
  reopenRegistration,
  startTournament,
} from '../actions'

export const metadata: Metadata = { title: 'Torneo' }

type Params = Promise<{ id: string }>

export default async function ManageTournamentPage({ params }: { params: Params }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const viewer = await requireStaff(`/club/torneos/${id}`)
  const { club } = viewer
  const tournament = await loadTournament(club, id)
  if (!tournament) notFound()

  const when = `${dayLongLabel(localDateOf(tournament.startsAt, club.timezone))}, ${timeIn(tournament.startsAt, club.timezone)} a ${timeIn(tournament.endsAt, club.timezone)}`
  const played = tournament.status === 'in_progress' || tournament.status === 'finished'

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <Link href="/club/torneos" className="text-sm font-semibold text-accent-ink underline">
        Volver a torneos
      </Link>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-display text-3xl font-bold uppercase">{tournament.name}</h2>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
            {TOURNAMENT_STATUS_LABELS[tournament.status]} · {spotsLabel(tournament)}
          </span>
        </div>
        <p className="text-fg-muted">
          {when}, {courtsText(tournament.courtNames)}
        </p>
        <p className="text-sm">
          {categoryRangeLabel(tournament.categoryMin, tournament.categoryMax)}, {MATCH_TYPE_LABELS[tournament.type].toLowerCase()}.{' '}
          {formatText(tournament)}. {tournament.price > 0 ? `${formatPrice(tournament.price)} por persona.` : 'Sin costo.'}
        </p>
      </header>
      <TournamentControls
        tournament={tournament}
        actions={{ close: closeRegistration, reopen: reopenRegistration, start: startTournament, finish: finishTournament, cancel: cancelTournament }}
      />
      {tournament.status === 'in_progress' ? <ScoreBoard tournament={tournament} timezone={club.timezone} action={recordScore} /> : null}
      {played ? (
        <section aria-labelledby="ranking" className="flex flex-col gap-2">
          <h2 id="ranking" className="font-display text-2xl font-bold uppercase">
            {tournament.status === 'finished' ? 'Ranking final' : 'Ranking'}
          </h2>
          <RankingTable rows={ranking(tournament.entries, tournament.games, tournament.pointsPerGame)} />
        </section>
      ) : null}
      {tournament.status === 'finished' ? <FixtureList tournament={tournament} timezone={club.timezone} /> : null}
      <EntriesManager
        tournament={tournament}
        acceptsCash={club.accepts_cash}
        actions={{ cash: recordTournamentCash, remove: removeEntry, addGuest }}
      />
    </>
  )
}
```

- [ ] **Step 2: Typecheck, lint and commit**

Run:
```bash
npm run typecheck
npm run lint
```
Expected: PASS.

```bash
git add "app/(club)/club/torneos/[id]/page.tsx"
git commit -m "feat(club): manage a tournament"
```

---

### Task 28: El torneo en la grilla

**Files:**
- Modify: `lib/domain/grid.ts` (`Occupancy`, `OccupancyRow`, `toOccupancy`)
- Modify: `lib/data/day.ts` (select de `court_occupancy`)
- Modify: `components/booking/cell-styles.ts`, `components/booking/slot-grid.tsx`, `components/booking/legend.tsx`
- Modify: `components/club/occupancy-detail-sheet.tsx`
- Test: `tests/unit/lib/domain/grid-occupancy.test.ts`, `tests/unit/components/booking/legend.test.tsx`, `tests/unit/components/club/occupancy-detail-sheet.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/lib/domain/grid-occupancy.test.ts`, add inside `describe('toOccupancy', …)`:
```ts
  it('keeps the tournament an occupancy belongs to', () => {
    expect(toOccupancy({ ...ROW, kind: 'tournament', tournament_id: 't1' }, 'player')).toMatchObject({
      kind: 'tournament',
      tournamentId: 't1',
    })
  })
```

In `tests/unit/components/booking/legend.test.tsx`, replace `'ReservaTurno fijoBloqueo'` with `'ReservaTurno fijoBloqueoTorneo'`.

In `tests/unit/components/club/occupancy-detail-sheet.test.tsx`, add inside `describe('OccupancyDetailSheet', …)`:
```tsx
  it('links a tournament block to its page', () => {
    const tournamentCell = makeGrid({
      occupancies: [{ ...occupancy('tt', 'court-1', '18:00', '20:20', 'tournament', 'Americano de octubre'), tournamentId: 't1' }],
    }).rows.find((row) => row.slot.label === '18:30')!.cells[0]
    renderDetail(tournamentCell)
    expect(screen.getByRole('dialog', { name: 'Americano de octubre' })).toHaveTextContent('Torneo, Cancha 1')
    expect(screen.getByRole('link', { name: 'Gestionar torneo' })).toHaveAttribute('href', '/club/torneos/t1')
    expect(screen.queryByRole('button', { name: 'Liberar cancha' })).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/domain/grid-occupancy.test.ts tests/unit/components/booking/legend.test.tsx tests/unit/components/club/occupancy-detail-sheet.test.tsx`
Expected: FAIL (typecheck of `tournament_id`/`tournamentId` in the tests, no `Torneo` in the legend, no link).

- [ ] **Step 3: Carry the tournament in the occupancy**

In `lib/domain/grid.ts`, in `Occupancy` add after `note: string | null`:
```ts
  // The tournament that blocks the court (kind 'tournament'); members may read it.
  tournamentId?: string | null
```
in `OccupancyRow` add after `note: string | null`:
```ts
  tournament_id?: string | null
```
and in `toOccupancy`, after `endsAt: toDate(row.ends_at),` add:
```ts
    ...(row.tournament_id ? { tournamentId: row.tournament_id } : {}),
```

In `lib/data/day.ts`, replace `.select('id, court_id, kind, starts_at, ends_at')` with `.select('id, court_id, kind, starts_at, ends_at, tournament_id')`.

- [ ] **Step 4: A color for tournaments in the grid and the legend**

In `components/booking/cell-styles.ts`, add to `CELL_STYLES` after `block`:
```ts
  tournament: 'border-2 border-accent bg-surface text-fg',
```

In `components/booking/slot-grid.tsx` (`ClubCell`), replace the whole `const style = …` expression with:
```tsx
    const style =
      occupancy.kind === 'block'
        ? CELL_STYLES.block
        : occupancy.kind === 'tournament'
          ? CELL_STYLES.tournament
          : occupancy.kind === 'recurring'
            ? CELL_STYLES.recurring
            : occupancy.kind === 'booking' || occupancy.kind === 'match'
              ? CELL_STYLES.booking
              : CELL_STYLES.other
```
The cell title already reads `occupancy.note`, which `create_tournament` fills with the tournament name.

In `components/booking/legend.tsx`, add `['tournament', 'Torneo'],` as the last item of `club`.

- [ ] **Step 5: Link from the detail sheet**

In `components/club/occupancy-detail-sheet.tsx`, add `import Link from 'next/link'` at the top and, right after the line `{cell.offGrid ? <p className="text-sm">No coincide con la grilla actual del club.</p> : null}`, add:
```tsx
        {occupancy.tournamentId ? (
          <Link href={`/club/torneos/${occupancy.tournamentId}`} className="font-semibold text-accent-ink underline">
            Gestionar torneo
          </Link>
        ) : null}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/lib/domain/grid-occupancy.test.ts tests/unit/components/booking tests/unit/components/club tests/unit/app/design-tokens.test.ts
npm run typecheck
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/domain/grid.ts lib/data/day.ts components/booking/cell-styles.ts components/booking/slot-grid.tsx components/booking/legend.tsx components/club/occupancy-detail-sheet.tsx tests/unit/lib/domain/grid-occupancy.test.ts tests/unit/components/booking/legend.test.tsx tests/unit/components/club/occupancy-detail-sheet.test.tsx
git commit -m "feat(grilla): tournament blocks with their name and a link"
```

---

### Task 29: Cobros con inscripciones

**Files:**
- Modify: `lib/data/payments.ts`
- Modify: `app/(club)/club/cobros/page.tsx`

(no unit test nuevo — las listas salen de `unpaidEntries` y `entryRefunds`, probadas en la Task 14; la carga y la página las cubren typecheck y el e2e de Cobros existente)

- [ ] **Step 1: Load entries with the overview**

Replace the whole of `lib/data/payments.ts` with:
```ts
import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import {
  holderLabel,
  leftPlayerRefunds,
  refundsDue,
  unpaidBookings,
  type RefundItem,
  type UnpaidItem,
} from '@/lib/domain/payments-overview'
import { toDate } from '@/lib/domain/time'
import { entryRefunds, unpaidEntries, type UnpaidEntryItem } from '@/lib/domain/tournament-payments'
import { createClient } from '@/lib/supabase/server'

export type ReportedTransfer = {
  id: string
  amount: number
  holder: string
  startsAt: Date | null
  courtName: string
  receiptUrl: string | null
}

export type PaymentsOverview = {
  transfers: ReportedTransfer[]
  unpaid: UnpaidItem[]
  unpaidEntries: UnpaidEntryItem[]
  refunds: RefundItem[]
}

const RECEIPT_URL_SECONDS = 300

const BOOKING_SELECT =
  'id, starts_at, price, status, guest_name, match_id, court:courts(name), player:profiles!bookings_player_id_fkey(display_name), match:open_matches!bookings_match_id_fkey(slots:match_slots(position, player_id, player:profiles(display_name))), payments(id, status, amount, payer_id, payer:profiles!payments_payer_id_fkey(display_name))'

// Everything the Cobros screen needs, read with the staff session.
export async function loadPaymentsOverview(club: Club, now = new Date()): Promise<PaymentsOverview> {
  const supabase = await createClient()
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString()

  const [reported, played, cancelled, matchBookings, tournaments] = await Promise.all([
    supabase
      .from('payments')
      .select(
        'id, amount, receipt_path, payer:profiles!payments_payer_id_fkey(display_name), booking:bookings(starts_at, guest_name, court:courts(name), player:profiles!bookings_player_id_fkey(display_name)), entry:tournament_entries!payments_entry_in_club(tournament:tournaments!tournament_entries_tournament_in_club(name, starts_at))',
      )
      .eq('club_id', club.id)
      .eq('status', 'reported')
      .order('created_at'),
    supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('club_id', club.id)
      .eq('status', 'confirmed')
      .lt('ends_at', now.toISOString())
      .gt('ends_at', since)
      .order('starts_at', { ascending: false }),
    supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('club_id', club.id)
      .eq('status', 'cancelled')
      .gt('starts_at', since)
      .order('starts_at', { ascending: false }),
    supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('club_id', club.id)
      .eq('status', 'confirmed')
      .not('match_id', 'is', null)
      .gt('starts_at', since),
    supabase.from('tournaments').select('id, name, starts_at, price, status').eq('club_id', club.id).gt('starts_at', since),
  ])
  if (reported.error) throw reported.error
  if (played.error) throw played.error
  if (cancelled.error) throw cancelled.error
  if (matchBookings.error) throw matchBookings.error
  if (tournaments.error) throw tournaments.error

  const entries =
    tournaments.data.length > 0
      ? await supabase
          .from('tournament_entries')
          .select(
            'id, tournament_id, guest_name, removed_at, player:profiles!tournament_entries_player_id_fkey(display_name), payments!payments_entry_in_club(id, status, amount)',
          )
          .in('tournament_id', tournaments.data.map((tournament) => tournament.id))
      : { data: [], error: null }
  if (entries.error) throw entries.error

  // Receipts are private: short-lived signed URLs, made with the staff session.
  const signedUrls = new Map<string, string>()
  const paths = reported.data.flatMap((payment) => (payment.receipt_path ? [payment.receipt_path] : []))
  if (paths.length > 0) {
    const { data: signed, error } = await supabase.storage.from('receipts').createSignedUrls(paths, RECEIPT_URL_SECONDS)
    if (error) throw error
    for (const item of signed ?? []) if (item.path && item.signedUrl) signedUrls.set(item.path, item.signedUrl)
  }

  return {
    transfers: reported.data.map((payment) => {
      const tournament = payment.entry?.tournament ?? null
      return {
        id: payment.id,
        amount: payment.amount,
        holder: payment.payer?.display_name ?? (payment.booking ? holderLabel(payment.booking) : 'Sin nombre'),
        startsAt: payment.booking ? toDate(payment.booking.starts_at) : tournament ? toDate(tournament.starts_at) : null,
        courtName: payment.booking?.court?.name ?? (tournament ? `Torneo ${tournament.name}` : ''),
        receiptUrl: payment.receipt_path ? (signedUrls.get(payment.receipt_path) ?? null) : null,
      }
    }),
    unpaid: unpaidBookings(played.data),
    unpaidEntries: unpaidEntries(tournaments.data, entries.data, now),
    refunds: [
      ...refundsDue(cancelled.data),
      ...leftPlayerRefunds(matchBookings.data),
      ...entryRefunds(tournaments.data, entries.data),
    ],
  }
}
```

- [ ] **Step 2: Show them in Cobros**

In `app/(club)/club/cobros/page.tsx`:

Add the import:
```tsx
import { recordTournamentCash } from '../torneos/actions'
```
Replace:
```tsx
  const { transfers, unpaid, refunds } = await loadPaymentsOverview(club)
```
with:
```tsx
  const { transfers, unpaid, unpaidEntries, refunds } = await loadPaymentsOverview(club)
```
Replace:
```tsx
    unpaid: totalsOf(unpaid, (item) => item.due),
```
with:
```tsx
    unpaid: totalsOf([...unpaid, ...unpaidEntries], (item) => item.due),
```
In the `sin-pagar` section, replace:
```tsx
        title="Reservas jugadas sin pagar"
        hint="Turnos de los últimos 30 días que todavía deben plata."
```
with:
```tsx
        title="Jugado sin pagar"
        hint="Turnos y torneos de los últimos 30 días que todavía deben plata."
```
and right after the closing `))}` of `unpaid.map(…)` (still inside that `PaymentsSection`), add:
```tsx
        {unpaidEntries.map((item) => (
          <li key={item.entryId}>
            <Card className="flex h-full flex-col gap-3">
              <PaymentItemHead holder={item.holder} when={when(item.startsAt)} courtName={`Torneo ${item.tournamentName}`}
                amount={item.due} amountLabel="Debe" />
              {club.accepts_cash ? (
                <ActionForm action={recordTournamentCash} submitLabel="Cobrar en efectivo" pendingLabel="Registrando…" variant="secondary"
                  className="mt-auto">
                  <input type="hidden" name="entryId" value={item.entryId} />
                  <input type="hidden" name="amount" value={item.due} />
                </ActionForm>
              ) : null}
            </Card>
          </li>
        ))}
```
In the `devolver` section, replace:
```tsx
        hint="Reservas canceladas o jugadores que salieron de un partido después de pagar."
```
with:
```tsx
        hint="Reservas o torneos cancelados, o jugadores que se bajaron después de pagar."
```

- [ ] **Step 3: Verify**

Run:
```bash
npm run typecheck
npm test
npm run lint
```
Expected: PASS. Si supabase-js tipa `payment.booking` o `payment.entry` distinto (ahora ambas FK son opcionales), leerlos como nullable, sin cast.

- [ ] **Step 4: Commit**

```bash
git add lib/data/payments.ts "app/(club)/club/cobros/page.tsx"
git commit -m "feat(cobros): tournament entries to charge and to refund"
```

---

### Task 30: Torneos en vivo en las pantallas

**Files:**
- Modify: `components/live/live-occupancy.tsx`
- Test: `tests/unit/components/live/live-occupancy.test.tsx`

- [ ] **Step 1: Write the failing test**

In `tests/unit/components/live/live-occupancy.test.tsx`, rename the test `'listens to occupancies, matches and spots of its club'` to `'listens to occupancies, matches, spots and tournaments of its club'` and add at its end:
```tsx
    for (const table of ['tournaments', 'tournament_entries', 'tournament_games']) {
      expect(mocks.channel.on).toHaveBeenCalledWith(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: 'club_id=eq.club-1' },
        expect.any(Function),
      )
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/live/live-occupancy.test.tsx`
Expected: FAIL (no subscription to `tournaments`).

- [ ] **Step 3: Listen to the three tables**

In `components/live/live-occupancy.tsx`, replace the header comment's first sentence with:
```tsx
// Reloads the current screen when a court is taken or freed anywhere in the club, or a match, one of
// its spots, a tournament, an entry or a game changes. It does not patch state by hand: the server
// renders the screen again.
```
(keeping the Realtime/deletes sentence that follows), and replace:
```tsx
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'match_slots', filter: `club_id=eq.${clubId}` },
          reload,
        )
        .subscribe()
```
with:
```tsx
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'match_slots', filter: `club_id=eq.${clubId}` },
          reload,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tournaments', filter: `club_id=eq.${clubId}` },
          reload,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tournament_entries', filter: `club_id=eq.${clubId}` },
          reload,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tournament_games', filter: `club_id=eq.${clubId}` },
          reload,
        )
        .subscribe()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/live/live-occupancy.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/live/live-occupancy.tsx tests/unit/components/live/live-occupancy.test.tsx
git commit -m "feat(live): reload on tournament, entry and game changes"
```

---

### Task 31: Verificación del corte 6

**Files:** ninguno.

- [ ] **Step 1: Todo en verde**

Run:
```bash
npm run test:db
npm test
npm run lint
npm run typecheck
npm run build
npx playwright test --workers=1
```
Expected: todo PASS (los siete flujos e2e de las fases 1 y 2 siguen en verde con Inicio y la pestaña nueva).

- [ ] **Step 2: Push**

```bash
git push
```

---

## Corte 7: e2e y cierre

### Task 32: Soporte e2e para torneos y limpieza

**Files:**
- Create: `tests/e2e/support/tournaments.ts`
- Modify: `tests/e2e/support/global-setup.ts`

(no unit test — soporte de Playwright; lo ejercita la Task 33)

- [ ] **Step 1: Helpers**

`tests/e2e/support/tournaments.ts`:
```ts
import { signedInClient, type TestUser } from './admin'

// Signs the player up through join_tournament, with his own session.
export async function joinTournamentAs(user: TestUser, tournamentId: string): Promise<void> {
  const client = await signedInClient(user)
  const { error } = await client.rpc('join_tournament', { p_tournament_id: tournamentId })
  if (error) throw error
}

// Records every missing result as staff (team A 14, team B 10). Returns how many it recorded.
export async function recordMissingScoresAs(staff: TestUser, tournamentId: string, scoreA = 14): Promise<number> {
  const client = await signedInClient(staff)
  const { data, error } = await client
    .from('tournament_games')
    .select('id')
    .eq('tournament_id', tournamentId)
    .is('score_a', null)
  if (error) throw error
  for (const game of data) {
    const recorded = await client.rpc('record_tournament_score', { p_game_id: game.id, p_score_a: scoreA })
    if (recorded.error) throw recorded.error
  }
  return data.length
}
```

- [ ] **Step 2: Clean up tournaments before deleting the users**

In `tests/e2e/support/global-setup.ts`, update the header comment to end with `…, the matches they created or joined, and the tournaments they created or signed up for.` and, right after the line that deletes `open_matches`, add:
```ts
  // Tournaments take their entries, games, payments and occupancies with them (on delete cascade).
  // Entries of e2e players in other tournaments go too, so the users can be deleted.
  await check(admin.from('tournaments').delete().in('created_by', ids))
  await check(admin.from('tournament_entries').delete().in('player_id', ids))
```

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add tests/e2e/support/tournaments.ts tests/e2e/support/global-setup.ts
git commit -m "test(e2e): tournament helpers and cleanup"
```

---

### Task 33: Flujo e2e: el americano completo

**Files:**
- Create: `tests/e2e/tournament.spec.ts`

- [ ] **Step 1: Write the flow**

`tests/e2e/tournament.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { joinTournamentAs, recordMissingScoresAs } from './support/tournaments'

test('reception runs an americano: players and guests fill it, fixture, results and ranking', async ({ page }) => {
  test.setTimeout(120_000)
  const club = await clubRow()
  // Day 10 at 08:00: no other flow books then.
  const day = addDays(localDateOf(new Date(), club.timezone), 10)
  const reception = await createMember({ name: 'Recepción Torneo', prefix: 'torneo-recepcion', role: 'reception' })
  const players = await Promise.all(
    ['Ana', 'Bruno', 'Carla', 'Diego', 'Eva', 'Facu'].map((name, index) =>
      createMember({ name: `${name} Torneo`, prefix: `torneo-${index}`, gender: index % 2 === 0 ? 'female' : 'male' }),
    ),
  )

  // Reception creates it from the club panel: 8 players on the first two courts, 7 rounds of 20 min.
  await signInWithMagicLink(page, reception.email, '/club/torneos/nuevo')
  await page.getByLabel('Nombre').fill('Americano E2E')
  await page.getByLabel('Fecha').fill(day)
  await page.getByLabel('Hora').selectOption('08:00')
  await expect(page.getByText('Termina a las 10:20')).toBeVisible()
  await page.getByRole('button', { name: 'Crear americano' }).click()
  await expect(page).toHaveURL(/\/club\/torneos\/[0-9a-f-]{36}$/)
  const tournamentId = new URL(page.url()).pathname.split('/').pop() ?? ''

  // Six players sign up themselves (API); reception adds two guests from the screen.
  for (const player of players) await joinTournamentAs(player, tournamentId)
  await page.reload()
  for (const guest of ['Invitado Uno', 'Invitado Dos']) {
    await page.getByLabel('Nombre del invitado').fill(guest)
    await page.getByRole('button', { name: 'Agregar invitado' }).click()
    await expect(page.getByText(guest)).toBeVisible()
  }
  await expect(page.getByRole('heading', { name: 'Anotados (8 de 8)' })).toBeVisible()

  // Close registration and build the fixture.
  await page.getByRole('button', { name: 'Cerrar inscripción' }).click()
  await page.getByRole('button', { name: 'Armar fixture' }).click()
  await expect(page.getByRole('heading', { name: 'Ronda 1' })).toBeVisible()

  // The first result from the screen (team B fills itself), the rest through the API.
  const firstGame = page.locator('form').filter({ has: page.getByLabel(/^Puntos de /) }).first()
  await firstGame.getByLabel(/^Puntos de /).fill('15')
  await expect(firstGame).toContainText(': 9')
  await firstGame.getByRole('button', { name: 'Guardar' }).click()
  await expect(firstGame.getByRole('status')).toHaveText('Resultado guardado.')
  expect(await recordMissingScoresAs(reception, tournamentId)).toBe(13)
  await page.reload()
  await page.getByRole('button', { name: 'Finalizar torneo' }).click()
  await expect(page.getByRole('heading', { name: 'Ranking final' })).toBeVisible()

  // A player sees the final ranking, all eight in it.
  await page.context().clearCookies()
  await signInWithMagicLink(page, players[0].email, `/torneos/${tournamentId}`)
  await expect(page.getByRole('heading', { name: 'Ranking final' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Ranking' }).getByRole('row')).toHaveCount(9)
})
```

- [ ] **Step 2: Run it**

Run:
```bash
npx playwright test tests/e2e/tournament.spec.ts --workers=1
npx playwright test tests/e2e/tournament.spec.ts --workers=1
```
Expected: PASS dos veces seguidas (la segunda corrida prueba la limpieza del global setup: sin ella, las canchas del día 10 a las 08:00 darían `courts_busy`).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/tournament.spec.ts
git commit -m "test(e2e): reception runs an americano end to end"
```

---

### Task 34: Cierre de la fase

**Files:**
- Modify: `docs/features/fase-3a-torneos/notes.md`, `docs/features/fase-3a-torneos/plan.md` (revisiones)

- [ ] **Step 1: Todo en verde**

Run:
```bash
npm run db:reset
npm run test:db
npm test
npm run lint
npm run typecheck
npm run build
npx playwright test --workers=1
```
Expected: todo PASS (pgTAP completo, Vitest, los ocho flujos e2e).

- [ ] **Step 2: Revisión de disciplina**

Run `/team-setup:discipline-check` sobre la rama y arreglar lo que encuentre en commits aparte (con su test). Si algún arreglo toca la base, va en una migración nueva `20261001000260_*.sql`.

- [ ] **Step 3: Notas de ejecución**

Append to `docs/features/fase-3a-torneos/notes.md` one dated entry per slice with the deviations from this plan (as in `../fase-2-partidos/notes.md`), and to the "Plan revisions" section of this file a `v3` line if the plan changed during execution.

```bash
git add docs/features/fase-3a-torneos/notes.md docs/features/fase-3a-torneos/plan.md
git commit -m "docs: fase 3a execution notes"
git push
```

- [ ] **Step 4: PR listo**

Run: `gh pr ready` y esperar CI en verde (`gh pr checks --watch`). Si `gh` no está instalado, marcar el PR como listo desde GitHub.
Expected: `quality` y `db-and-e2e` en verde.

- [ ] **Step 5: MANUAL (producción, después del merge)**

- MANUAL (Miguel): confirmar que `migrate.yml` aplicó `20261001000200` a `20261001000250` en producción (`select version from supabase_migrations.schema_migrations order by version desc limit 6`).
- MANUAL: responder con Rustic la pregunta abierta del diseño (precio y reglas reales de sus americanos: $400, 24 puntos, 20 min por ronda son los valores por defecto del formulario) y, si cambian, ajustar `TOURNAMENT_DEFAULTS` en `lib/domain/tournaments.ts`.

---

## Acceptance criteria

- [ ] Recepción o admin crea un americano (nombre, día y hora, canchas, cupo de 8, 12 o 16, puntos, minutos y rondas, categorías, género, precio); el formulario muestra la hora de fin y avisa canchas ocupadas; las canchas quedan bloqueadas en la grilla con el nombre del torneo, y un choque se rechaza con `courts_busy`.
- [ ] Un jugador se anota solo si la inscripción está abierta, hay lugar, su categoría y género entran y no tiene otra reserva, partido o torneo a esa hora; si no puede, la pantalla dice por qué. Nadie queda anotado dos veces.
- [ ] El jugador se da de baja solo con la inscripción abierta; lo que pagó aparece en Cobros como "a devolver" y su transferencia informada se rechaza.
- [ ] Recepción agrega invitados y saca anotados hasta que empieza; cierra y reabre la inscripción.
- [ ] "Armar fixture" funciona con 8, 12 o 16 anotados: cada par de jugadores es pareja a lo sumo una vez, nadie juega dos veces en la misma tanda, los partidos se reparten en las canchas del torneo por tandas.
- [ ] Recepción carga los puntos de la pareja A (B se completa sola) y los puede corregir hasta finalizar; finalizar exige todos los resultados.
- [ ] Todos ven el ranking (puntos, ganados, diferencia) en vivo mientras se juega y el final al terminar.
- [ ] La inscripción se paga como una reserva: transferencia con comprobante o efectivo; recepción confirma; las impagas aparecen en "Sin cobrar" y las devoluciones en "A devolver", con el nombre del torneo.
- [ ] Cancelar un torneo libera las canchas y deja lo cobrado para devolver.
- [ ] Inicio lista las próximas reservas y partidos con sus acciones y el acceso "Torneos: N con inscripción abierta"; `/reservas` redirige a Inicio; el jugador tiene 5 pestañas y el club una pestaña Torneos.
- [ ] `anon` no ejecuta ninguna función; las escrituras de torneos son solo por RPC.
- [ ] pgTAP, Vitest, lint, typecheck, build y los ocho flujos e2e en verde en CI.

## Plan revisions

(append-only)

- **v1 (2026-09-30)**: scaffold.
- **v2 (2026-09-30)**: plan completo en 7 cortes (Tasks 1–34) sobre el diseño aprobado. Decisiones propias en "Decisiones que este plan toma".
- **v3 (2026-09-30)**: ejecutado. Desvíos en `notes.md`; arreglos de la revisión en la migración `20261001000260`.
