---
feature: inicio-del-club
type: plan
status: in-progress
date: 2026-10-20
branch: feat/inicio-del-club
references: ./design.md
---

# Inicio del club Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/team-setup:execute` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una pestaña "Inicio", primera del panel y destino de `/club`, donde recepción y el admin ven qué canchas se juegan ahora, qué empieza en la próxima hora y media, qué se jugó hoy y se debe, y lo que pasa hoy; cada turno con sus 4 jugadores y su parte, cobrable en efectivo o "Me transfirió" ahí mismo, con el mismo bloque en el detalle de la Grilla.

**Architecture:** Postgres guarda los jugadores 2 a 4 de un turno (`booking_players`) y de quién es cada pago (`payments.payer_position`); solo se escriben por tres RPC `security definer` (`set_booking_players`, `charge_booking_share`, `charge_booking_rest`), solo staff del club. Una función pura (`lib/domain/club-home.ts`) arma las partes y el estado de cada jugador con la misma regla que las RPC y reparte los turnos del día en los bloques según la hora; `lib/data/club-home.ts` lee todo en paralelo. Un solo componente cliente (`BookingPlayers`) muestra jugadores y cobro en el Inicio y en la Grilla; el Inicio se vuelve a renderizar con Realtime (`LiveOccupancy`) y cada minuto (`AutoRefresh`).

**Tech Stack:** Next.js 16.3 (App Router, Server Actions), React 19, TypeScript, Tailwind 4, Supabase (Postgres 17), Vitest + Testing Library, pgTAP, Playwright.

---

## Antes de empezar

- Rama: `feat/inicio-del-club` (sale de `main`; el diseño aprobado está en `184aaa4`). Commits chicos; cada task termina en verde. Se ejecuta de corrido, sin pedir confirmación entre tasks.
- **Este plan se validó entero una vez antes de escribirse** (ver "Plan revisions"): las migraciones, los 2 pgTAP nuevos y la suite completa (69 archivos), Vitest completo (184 archivos), `tsc`, `lint` y el e2e nuevo pasaron con este mismo código. La validación se descartó: no hay stash ni archivos sueltos; el árbol queda en el commit del plan.
- Docker Desktop corriendo. El CLI de Supabase es devDependency: `npx supabase …` o los scripts de npm (`npm run test:db`, `npm run db:reset`, `npm run db:types`). `gh` no está instalado: el PR se abre y se marca listo desde GitHub.
- Windows: **los archivos con barras invertidas (`\ir` en los tests pgTAP, la regex `/\s+/` de `lib/domain/members.ts`) se escriben con la herramienta Write**, nunca con heredoc ni `sed`. Las rutas con paréntesis (`app/(club)/…`) van entre comillas en bash.
- Next 16: este plan solo usa lo que el repo ya usa (`redirect` en una página, Server Actions con `useActionState`, `revalidatePath` dentro de `revalidateBookings`, `router.refresh()` en `AutoRefresh` y `LiveOccupancy`). Antes de tocar código, leer `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md` y `…/revalidatePath.md`; no hay deprecaciones que afecten a esto.
- Producción: las migraciones llegan con el merge (`migrate.yml`). **Nunca** correr `supabase link`, `db push` ni nada contra producción desde la máquina local. Las migraciones ya aplicadas **no se editan**.
- Migraciones nuevas, posteriores a `20261013000130_notification_emails_brand.sql`: `20261020000100_booking_players.sql`, `20261020000110_set_booking_players.sql`, `20261020000120_booking_share_charges.sql`. No hace falta ningún enum nuevo (si un arreglo lo necesitara, va solo en su archivo). Un arreglo de la revisión final va en `20261020000130_*.sql`.
- Escrituras solo por RPC `security definer` con `set search_path = ''` y errores con `private.fail(code)`. Supabase da `EXECUTE` a `anon` en cada función nueva de `public`: cada RPC nueva hace su `revoke … from public, anon` y su `grant … to authenticated` (lo controla `integrity.test.sql`); los helpers de `private` hacen `revoke all … from public`.
- Docs en español; identificadores, comentarios de SQL y de código en inglés. Textos de la app en castellano rioplatense.
- pgTAP: un test se corre con `npx supabase test db supabase/tests/database/<archivo>.test.sql`; todos con `npm run test:db`. Los tests nuevos incluyen `\ir helpers/slot.psql`, `\ir helpers/club.psql`, `\ir helpers/match.psql` y, para Eva (admin del club B), `\ir helpers/day_use.psql`.
- Datos del fixture pgTAP (club T `a0000000-0000-0000-0000-000000000001`, club B `…000002`): Ana `…a1`, Bruno `…b1`, Gabi `…a2`, Hugo `…a3`, Iván `…a4`, Juli `…a5` (jugadores), Carla `…c1` (recepción), Dani `…d1` (admin), Eva `…e1` (admin del club B), Omar `…f1` (no es socio). Canchas `c0000000-0000-0000-0000-000000000001` y `…002`. En este documento `…a1` abrevia `00000000-0000-0000-0000-0000000000a1`; **en los archivos va siempre el uuid completo**.
- **Horas en pgTAP y en los fixtures de Vitest: solo horas de la grilla** (08:00, 09:30, 11:00, 12:30, 14:00, 15:30, 17:00, 18:30, 20:00, 21:30). Nunca 19:00.
- Cada migración nueva se aplica con `npm run db:reset` y después `npm run db:types` regenera `lib/supabase/database.types.ts`, que CI compara byte a byte: se commitea en la misma tarea.
- e2e en local: primero `node scripts/demo-data.mjs --clean` (la demo ocupa las canchas que usan los flujos) y después `npx playwright test --workers=1`. El e2e nuevo necesita un turno en juego: **fuera del horario del club (08:00 a 23:00 de Montevideo) o con menos de 5 minutos de turno se salta solo** (`test.skip`). Para correrlo de noche en local, ver la Task 13, Step 3.

## Decisiones que este plan toma (y que el diseño no fijaba)

| Tema | Decisión | Por qué |
| --- | --- | --- |
| Firmas | `set_booking_players(p_booking_id uuid, p_players jsonb) returns setof booking_players`; `charge_booking_share(p_booking_id uuid, p_position integer, p_method payment_method) returns payments`; `charge_booking_rest(p_booking_id uuid, p_method payment_method) returns setof payments` | `integer` para la posición: supabase-js manda un `number`. `setof` en el resto: en un partido se cobra un pago por jugador |
| Forma de `p_players` | Un array con las posiciones que tienen a alguien: `{"position": 2, "player_id": "<uuid>"}` o `{"position": 3, "name": "Pepe"}`. **La posición que no está queda vacía** | La hoja manda siempre los 3 lugares; vaciar es no mandarlo |
| "Ya pagó" | Una posición con un pago confirmado con su `payer_position` no se cambia ni se saca (`already_paid`). Una posición pagada **sin nombre** ("Jugador 3" pagó) sí puede recibir un nombre | Completar no es cambiar |
| Códigos de error | Socio repetido o repetir al que reservó: código nuevo `player_repeated` ("Ese jugador ya está en el turno."). Socio de otro club o que no es socio: `partner_not_member` (ya existe: "Ese jugador no es socio del club. Cargalo como de afuera."). Partido abierto: `invalid_state` | El diseño no nombraba esos códigos; el de socio ya decía lo justo |
| `already_paid` en recepción | El mensaje de `errors.ts` le habla al jugador ("Ya pagaste tu parte…"). Las acciones de recepción lo traducen: al cobrar "Ya estaba pagado."; al cambiar jugadores "Ese jugador ya pagó: no se puede cambiar ni sacar." | Diseño: "Ya estaba pagado." en la tarjeta |
| Parte con pagos sin posición | Lo que se le cobra a un jugador es `least(su parte − sus pagos con posición, lo que le falta al turno − una transferencia informada desde la app)` (`private.position_due`, `private.booking_left`). El dominio usa la misma cuenta | Nadie paga de más; si el total llega al precio todos figuran "Pagó" (diseño) |
| Transferencia informada desde la app | Mientras espera, cubre el turno: los jugadores figuran "Transferencia informada" y no hay "Cobrar" (si se rechaza, vuelve a haber) | Igual que `record_cash`, que ya descontaba lo informado |
| Partidos | `charge_booking_share` con `match_id`: la posición es el lugar del partido; el pago lleva `payer_id`, nunca `payer_position` (constraint `payments_position_only_for_bookings`). `charge_booking_rest` cobra un pago por jugador que debe | Así `share_due`, `leave_match` y Cobros siguen viendo cada parte como hasta hoy |
| Cobro de recepción | `status = 'confirmed'`, `reported_by = confirmed_by = auth.uid()`, `confirmed_at = now()`, sin `receipt_path` (`private.record_charge`) | Diseño: confirmada por quien la cargó, sin comprobante |
| Grilla | El detalle de un turno usa `BookingPlayers` (con `onDone`: el éxito cierra la hoja y avisa arriba, como hoy); el formulario "Cobrar en efectivo" con monto se va. En un partido, "Sacar del partido" va dentro de la fila de cada jugador (`playerExtra`). `recordCash` sigue para Cobros | Diseño: "el mismo bloque de jugadores y cobro" |
| Lo que ve recepción del cobro | "Cobrar $400" abre en la misma fila un grupo "Cobrar $400 a Ana" con "Efectivo", "Me transfirió" (solo los medios que el club acepta) y "Volver". El resultado ("Cobramos $300 en efectivo." / "Ya estaba pagado.") queda en la tarjeta: el estado vive en `BookingPlayers`, que sobrevive al refresco | Diseño: "el error se ve en la tarjeta y la tarjeta se refresca" |
| Botón de jugadores | "Completar jugadores" si falta algún nombre; "Cambiar jugadores" si están todos. Nunca en un partido | Poder corregir un nombre mal escrito |
| Campo de jugador | Componente nuevo `PlayerNameField`: busca socios como `MemberPicker` pero acepta texto libre. La búsqueda se extrae a `searchMembers` (`lib/domain/members.ts`) y `MemberPicker` la usa | DRY; `MemberPicker` exige elegir de la lista |
| Bloques | En cancha ahora: `startsAt ≤ ahora < endsAt`. Próximos: `ahora < startsAt ≤ ahora + 90 min`. Pendientes de cobro: turno (no evento) con `endsAt ≤ ahora` y algo por cobrar. Retenidos para la lista de espera (`hold`): no se muestran | El borde de 90 minutos entra (diseño: "próxima hora y media") |
| Eventos | Una línea "Cancha 2 · Clase de menores" con la nota de la ocupación (o el tipo); el torneo y el campeonato linkean a su página, el day use a Day use, el bloqueo no linkea. Sin barra de tiempo | Diseño |
| "Lo que pasa hoy" | Partidos armándose del día → Grilla; cada torneo o campeonato con una cancha hoy (de las ocupaciones, una vez cada uno) → su página; "N en el club hoy" (`day_use_inside`) → Day use; "N esperando turno hoy" (`loadDayWaits`) → Grilla. Lo que es 0 no aparece; sin líneas, el bloque no se muestra | Diseño |
| Transferencias por confirmar | Una consulta liviana (`payments` con `status = 'reported'`, solo `amount`) y `totalsOf`, no `loadPaymentsOverview` (firma URLs de comprobantes) | Lo único que se muestra es cantidad y total |
| Vacíos | "No hay canchas en juego ahora. El próximo turno: Cancha 2 a las 18:30." / "No empieza nada en la próxima hora y media." / "Lo jugado hoy está cobrado." | Diseño: cada bloque dice lo suyo |
| e2e "en Cobros aparece" | Cobros no lista lo cobrado: el e2e verifica las dos filas en `payments` (efectivo con posición 2, transferencia confirmada sin comprobante), que "Transferencias para confirmar" no tiene nada de ese turno, y que la Grilla lo muestra "Pagada" con los mismos jugadores | Es lo que el cobro deja a la vista en Cobros y en la Grilla |
| PR | Push después de la Task 6 y PR borrador desde GitHub; listo al final | Igual que las fases anteriores |

## Mapa de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `supabase/migrations/20261020000100_booking_players.sql` | Tabla `booking_players`, RLS de lectura para staff; `payments.payer_position` |
| `supabase/migrations/20261020000110_set_booking_players.sql` | `set_booking_players`, `private.position_paid` |
| `supabase/migrations/20261020000120_booking_share_charges.sql` | `charge_booking_share`, `charge_booking_rest` y sus helpers |
| `supabase/tests/database/booking_players.test.sql`, `booking_charges.test.sql` | pgTAP nuevos |
| `lib/domain/club-home.ts` | Partes y estado por jugador, items del día, bloques, barra, "Lo que pasa hoy", línea de transferencias |
| `lib/domain/members.ts` | `searchMembers` |
| `lib/domain/errors.ts` | `player_repeated` |
| `lib/domain/grid.ts`, `lib/data/day.ts` | La Grilla lleva `turn` (jugadores y partes) en cada reserva |
| `lib/actions/booking-charges.ts` | Server Actions `chargeShare`, `chargeRest`, `saveBookingPlayers` (Inicio y Grilla) |
| `lib/data/club-home.ts` | `loadClubHome`: todo el Inicio en paralelo |
| `components/club/charge-choice.tsx` | La confirmación chica: Efectivo / Me transfirió / Volver |
| `components/club/player-name-field.tsx` | Un jugador: socio de la lista o nombre libre |
| `components/club/players-sheet.tsx` | Hoja "Jugadores del turno" |
| `components/club/booking-players.tsx` | El bloque de jugadores y cobro (Inicio y Grilla) |
| `components/club/court-card.tsx` | `CourtList` y `CourtTurnCard`: tarjetas y líneas de un bloque del Inicio |
| `components/club/occupancy-detail-sheet.tsx`, `app/(club)/club/grilla/club-board.tsx`, `app/(club)/club/grilla/page.tsx` | La Grilla con el bloque compartido |
| `components/ui/member-picker.tsx` | Usa `searchMembers` |
| `app/(club)/club/inicio/page.tsx` | La pantalla |
| `lib/club/tabs.ts`, `app/(club)/club/page.tsx`, `app/(club)/club/layout.tsx`, `app/(jugador)/page.tsx` | Pestaña "Inicio" primera; `/club` y "Panel del club" van al Inicio |
| `tests/unit/...`, `tests/e2e/club-home.spec.ts`, `tests/e2e/support/club-home.ts` | Vitest y e2e |

## Secuencia por cortes

| Corte | Tasks | Resultado | Cómo se prueba |
| --- | --- | --- | --- |
| 1. Base | 1–3 | Jugadores del turno y cobro por parte en Postgres | pgTAP |
| 2. Dominio y acciones | 4–6 | Partes, bloques, búsqueda de socios, Server Actions | Vitest |
| 3. El bloque de jugadores | 7–10 | Confirmación de cobro, campo de jugador, hoja, bloque; la Grilla lo usa | Vitest + typecheck |
| 4. El Inicio | 11–12 | Datos, tarjetas, página, pestaña y redirects | Vitest + typecheck + build |
| 5. e2e y cierre | 13–14 | Flujo completo, PR listo | Playwright |

---

## Corte 1: Base

### Task 1: Punto de partida en verde

**Files:** ninguno.

- [ ] **Step 1: Rama, plan commiteado y stack local**

Run:
```bash
git branch --show-current
git status --short
git log --oneline -2
```
Expected: `feat/inicio-del-club`, árbol limpio, el último commit es `docs: plan the club home` sobre `184aaa4 docs: design the club home with players per booking and split charges`.

Run:
```bash
npx supabase start
npm run db:reset
```
Expected: `db reset` aplica las migraciones hasta `20261013000130_notification_emails_brand.sql`.

- [ ] **Step 2: Todo en verde antes de tocar nada**

Run:
```bash
npm run test:db
npm test
npm run lint
npm run typecheck
```
Expected: todo PASS (67 archivos pgTAP; 178 archivos de Vitest). Si algo falla, parar y avisar: no se empieza sobre rojo.

---

### Task 2: Los jugadores del turno

**Files:**
- Create: `supabase/tests/database/booking_players.test.sql`
- Create: `supabase/migrations/20261020000100_booking_players.sql`
- Create: `supabase/migrations/20261020000110_set_booking_players.sql`
- Modify: `lib/supabase/database.types.ts` (generado)
- Modify: `lib/domain/errors.ts`
- Modify: `tests/unit/lib/domain/errors.test.ts`

- [ ] **Step 1: El test pgTAP** (con la herramienta Write: tiene `\ir`)

Create `supabase/tests/database/booking_players.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
select plan(26);

select has_table('public', 'booking_players', 'booking_players exists');

-- Ana booked court 1 tomorrow at 11:00 ($1.200); a second booking of hers on court 2 gets cancelled below.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(1, '11:00', 90), '00000000-0000-0000-0000-0000000000a1', 1200);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(1, '11:00', 90), '00000000-0000-0000-0000-0000000000a1', 1200);
update public.bookings set status = 'cancelled', occupancy_id = null, cancelled_at = now()
 where id = 'b0000000-0000-0000-0000-000000000002';

-- A confirmed open match on court 2 the day after: its players live in match_slots.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(2, '12:30', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4']::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 1600);

select throws_ok(
  $$ insert into public.booking_players (booking_id, club_id, position)
     values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 2) $$,
  '23514', null, 'a row is a member or a name, never nobody');
select throws_ok(
  $$ insert into public.booking_players (booking_id, club_id, position, name)
     values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 1, 'Pepe') $$,
  '23514', null, 'player 1 is whoever booked: the table holds 2 to 4');
select throws_ok(
  $$ insert into public.payments (club_id, booking_id, method, amount, status, payer_position)
     values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cash', 300, 'confirmed', 5) $$,
  '23514', null, 'a payment pays position 1 to 4');
select throws_ok(
  $$ insert into public.payments (club_id, booking_id, method, amount, status, payer_id, payer_position)
     values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cash', 300, 'confirmed',
             '00000000-0000-0000-0000-0000000000b1', 2) $$,
  '23514', null, 'a position is for bookings; a match payment says who pays with payer_id');

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       '[{"position": 2, "player_id": "00000000-0000-0000-0000-0000000000b1"}, {"position": 3, "name": " Pepe "}]') $$,
  'reception adds a member and a name');
select results_eq(
  $$ select position::int, player_id, name, created_by from public.booking_players
      where booking_id = 'b0000000-0000-0000-0000-000000000001' order by position $$,
  $$ values (2, '00000000-0000-0000-0000-0000000000b1'::uuid, null::text, '00000000-0000-0000-0000-0000000000c1'::uuid),
            (3, null::uuid, 'Pepe', '00000000-0000-0000-0000-0000000000c1'::uuid) $$,
  'player 2 is Bruno, player 3 is just a name, player 4 stays empty');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       '[{"position": 2, "player_id": "00000000-0000-0000-0000-0000000000a2"},
         {"position": 3, "player_id": "00000000-0000-0000-0000-0000000000a2"}]') $$,
  'P0001', 'player_repeated', 'the same member cannot play twice');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       '[{"position": 2, "player_id": "00000000-0000-0000-0000-0000000000a1"}]') $$,
  'P0001', 'player_repeated', 'whoever booked is player 1 already');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       '[{"position": 2, "player_id": "00000000-0000-0000-0000-0000000000f1"}]') $$,
  'P0001', 'partner_not_member', 'a member has to be a member of the club');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       '[{"position": 2, "player_id": "00000000-0000-0000-0000-0000000000e1"}]') $$,
  'P0001', 'partner_not_member', 'not of another club');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       '[{"position": 2, "player_id": "00000000-0000-0000-0000-0000000000a2", "name": "Gabi"}]') $$,
  'P0001', 'invalid_input', 'a member or a name, not both');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001', '[{"position": 1, "name": "Pepe"}]') $$,
  'P0001', 'invalid_input', 'only positions 2 to 4');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       '[{"position": 2, "name": "Pepe"}, {"position": 2, "name": "Lucho"}]') $$,
  'P0001', 'invalid_input', 'one player per position');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       jsonb_build_array(jsonb_build_object('position', 2, 'name', repeat('a', 61)))) $$,
  'P0001', 'invalid_input', 'a name has up to 60 letters');

-- Bruno paid his share (as postgres): he stays as he is.
reset role;
insert into public.payments (club_id, booking_id, method, amount, status, payer_position, confirmed_at)
values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cash', 300, 'confirmed', 2,
        now());
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       '[{"position": 2, "player_id": "00000000-0000-0000-0000-0000000000a2"}, {"position": 3, "name": "Pepe"}]') $$,
  'P0001', 'already_paid', 'a player who paid cannot be changed');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001', '[{"position": 3, "name": "Pepe"}]') $$,
  'P0001', 'already_paid', 'nor taken out');
select lives_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001',
       '[{"position": 2, "player_id": "00000000-0000-0000-0000-0000000000b1"},
         {"position": 3, "player_id": "00000000-0000-0000-0000-0000000000a2"},
         {"position": 4, "name": "Lucho"}]') $$,
  'the others change around him');
select results_eq(
  $$ select position::int, player_id, name from public.booking_players
      where booking_id = 'b0000000-0000-0000-0000-000000000001' order by position $$,
  $$ values (2, '00000000-0000-0000-0000-0000000000b1'::uuid, null::text),
            (3, '00000000-0000-0000-0000-0000000000a2'::uuid, null::text),
            (4, null::uuid, 'Lucho') $$,
  'Bruno, Gabi and Lucho');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000002', '[{"position": 2, "name": "Pepe"}]') $$,
  'P0001', 'invalid_state', 'not on a cancelled booking');
select throws_ok(
  $$ select public.set_booking_players(
       (select booking_id from public.open_matches where id = 'e1000000-0000-0000-0000-000000000001'),
       '[{"position": 2, "name": "Pepe"}]') $$,
  'P0001', 'invalid_state', 'a match keeps its players in its spots');

-- Dani, admin
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select is(
  (select count(*)::int from public.booking_players where booking_id = 'b0000000-0000-0000-0000-000000000001'), 3,
  'staff read the players');

-- Ana, player (whoever booked)
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select is(
  (select count(*)::int from public.booking_players), 0, 'players do not read the table');
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001', '[]') $$,
  'P0001', 'forbidden', 'only staff complete the players');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  $$ select public.set_booking_players('b0000000-0000-0000-0000-000000000001', '[]') $$,
  'P0001', 'forbidden', 'not the staff of another club');

reset role;
select ok(
  not has_function_privilege('authenticated', 'private.position_paid(uuid, integer)', 'execute'),
  'authenticated cannot execute the helper');

select * from finish();
rollback;
```

- [ ] **Step 2: Verlo fallar**

Run: `npx supabase test db supabase/tests/database/booking_players.test.sql`
Expected: FAIL (`relation "public.booking_players" does not exist`).

- [ ] **Step 3: La tabla y la posición del pago**

Create `supabase/migrations/20261020000100_booking_players.sql`:
```sql
-- Inicio del club, part 1: the players of a booking and whose share a payment is. Player 1 is whoever booked
-- (bookings.player_id or guest_name) and is not repeated here; reception adds players 2 to 4, each a member of the
-- club or just a name. A position without a row is shown as "Jugador 3". An open match keeps its players in
-- match_slots and never uses this table. Written only by set_booking_players.
create table public.booking_players (
  booking_id uuid not null,
  club_id uuid not null references public.clubs (id) on delete cascade,
  position smallint not null check (position between 2 and 4),
  player_id uuid references public.profiles (id) on delete cascade,
  name text check (name is null or length(trim(name)) between 1 and 60),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (booking_id, position),
  constraint booking_players_booking_in_club
    foreign key (booking_id, club_id) references public.bookings (id, club_id) on delete cascade,
  constraint booking_players_member_or_name check (num_nonnulls(player_id, name) = 1)
);
create unique index booking_players_one_spot_per_member on public.booking_players (booking_id, player_id)
  where player_id is not null;
create index booking_players_club_id_idx on public.booking_players (club_id);
create index booking_players_player_id_idx on public.booking_players (player_id);
alter table public.booking_players enable row level security;

revoke all on public.booking_players from anon, authenticated;
grant select on public.booking_players to authenticated;

create policy booking_players_select_staff on public.booking_players
  for select to authenticated
  using (private.has_club_role(club_id, array['admin', 'reception']::public.club_role[]));

-- Whose share a payment of a booking (not a match) pays: 1 to 4. Null = the booking as a whole (paid from the app,
-- a transfer of whoever booked, "Cobrar todo lo que falta", or a payment from before this column).
alter table public.payments
  add column payer_position smallint,
  add constraint payments_payer_position check (payer_position between 1 and 4),
  add constraint payments_position_only_for_bookings
    check (payer_position is null or (booking_id is not null and payer_id is null));
```

- [ ] **Step 4: La RPC**

Create `supabase/migrations/20261020000110_set_booking_players.sql`:
```sql
-- Inicio del club, part 2: reception completes players 2 to 4 of a booking. p_players lists the positions that
-- have someone: {"position": 2, "player_id": "<uuid>"} for a member of the club or {"position": 3, "name": "Pepe"}
-- for just a name. A position left out is empty ("Jugador 4"). A player who already paid his share (a confirmed
-- payment with his position) cannot be changed or taken out; a paid position nobody named can still get a name.

-- Whether a confirmed payment already covers part of that position's share.
create function private.position_paid(p_booking_id uuid, p_position integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.payments
    where booking_id = p_booking_id and payer_position = p_position and status = 'confirmed'
  );
$$;

create function public.set_booking_players(p_booking_id uuid, p_players jsonb)
returns setof public.booking_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_booking public.bookings;
  v_item jsonb;
  v_position integer;
  v_player_text text;
  v_player_id uuid;
  v_name text;
  v_ids uuid[] := array[null, null, null, null]::uuid[];
  v_names text[] := array[null, null, null, null]::text[];
  v_current public.booking_players;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_booking.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_booking.status <> 'confirmed' or v_booking.match_id is not null then
    perform private.fail('invalid_state');
  end if;
  if p_players is null or jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) > 3 then
    perform private.fail('invalid_input');
  end if;

  -- Check every item before writing anything.
  for v_item in select value from jsonb_array_elements(p_players) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item ->> 'position', '') !~ '^[2-4]$' then
      perform private.fail('invalid_input');
    end if;
    v_position := (v_item ->> 'position')::integer;
    v_player_text := nullif(trim(v_item ->> 'player_id'), '');
    v_name := nullif(trim(v_item ->> 'name'), '');
    if v_ids[v_position] is not null or v_names[v_position] is not null
       or num_nonnulls(v_player_text, v_name) <> 1
       or (v_player_text is not null
           and v_player_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
       or length(v_name) > 60 then
      perform private.fail('invalid_input');
    end if;
    if v_player_text is not null then
      v_player_id := v_player_text::uuid;
      if v_player_id = v_booking.player_id or v_player_id = any(v_ids) then
        perform private.fail('player_repeated');
      end if;
      if not exists (
        select 1 from public.club_members where club_id = v_booking.club_id and user_id = v_player_id
      ) then
        perform private.fail('partner_not_member');
      end if;
      v_ids[v_position] := v_player_id;
    else
      v_names[v_position] := v_name;
    end if;
  end loop;

  -- A row that changes goes out (and comes back below with its new player); a paid one stays as it is.
  for v_position in 2..4 loop
    select * into v_current from public.booking_players
     where booking_id = v_booking.id and position = v_position;
    if found and (v_current.player_id is distinct from v_ids[v_position]
                  or v_current.name is distinct from v_names[v_position]) then
      if private.position_paid(v_booking.id, v_position) then
        perform private.fail('already_paid');
      end if;
      delete from public.booking_players where booking_id = v_booking.id and position = v_position;
    end if;
  end loop;

  insert into public.booking_players (booking_id, club_id, position, player_id, name, created_by)
  select v_booking.id, v_booking.club_id, p, v_ids[p], v_names[p], v_uid
  from generate_series(2, 4) as p
  where num_nonnulls(v_ids[p], v_names[p]) = 1
  on conflict (booking_id, position) do nothing;

  return query
    select * from public.booking_players where booking_id = v_booking.id order by position;
end;
$$;

revoke all on function private.position_paid(uuid, integer) from public;
revoke execute on function public.set_booking_players(uuid, jsonb) from public, anon;
grant execute on function public.set_booking_players(uuid, jsonb) to authenticated;
```

- [ ] **Step 5: Aplicar y verlo pasar**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/booking_players.test.sql
```
Expected: `Files=1, Tests=26 … Result: PASS`.

- [ ] **Step 6: Tipos**

Run: `npm run db:types`
Expected: `git diff --stat lib/supabase/database.types.ts` muestra la tabla `booking_players`, `payer_position` en `payments` (Row/Insert/Update y en cada función que devuelve `payments`) y la función `set_booking_players`.

- [ ] **Step 7: El mensaje de `player_repeated`**

In `lib/domain/errors.ts`, replace:
```ts
  invalid_color: 'Ese color no es válido. Usá el formato #RRGGBB, por ejemplo #FCB021.',
} as const
```
with:
```ts
  invalid_color: 'Ese color no es válido. Usá el formato #RRGGBB, por ejemplo #FCB021.',
  player_repeated: 'Ese jugador ya está en el turno.',
} as const
```

In `tests/unit/lib/domain/errors.test.ts`, replace:
```ts
  'invalid_color',
]
```
with:
```ts
  'invalid_color',
  'player_repeated',
]
```

- [ ] **Step 8: Checks**

Run:
```bash
npx vitest run tests/unit/lib/domain/errors.test.ts
npm run typecheck
```
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20261020000100_booking_players.sql supabase/migrations/20261020000110_set_booking_players.sql supabase/tests/database/booking_players.test.sql lib/supabase/database.types.ts lib/domain/errors.ts tests/unit/lib/domain/errors.test.ts
git commit -m "feat(inicio): players 2 to 4 of a booking, set by reception through set_booking_players"
```

---

### Task 3: El cobro por parte

**Files:**
- Create: `supabase/tests/database/booking_charges.test.sql`
- Create: `supabase/migrations/20261020000120_booking_share_charges.sql`
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: El test pgTAP** (con la herramienta Write: tiene `\ir`)

Create `supabase/tests/database/booking_charges.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
select plan(30);

-- Tomorrow at 11:00. Booking 1 (Ana, $1.202): 302 for player 1, 300 for the rest. Booking 2 (Bruno, $1.200) got
-- $1.000 without position at the desk. Booking 3 (Ana, $1.200) has her transfer reported from the app. Booking 4
-- got cancelled.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(1, '11:00', 90), '00000000-0000-0000-0000-0000000000a1', 1202);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(1, '11:00', 90), '00000000-0000-0000-0000-0000000000b1', 1200);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(1, '12:30', 90), '00000000-0000-0000-0000-0000000000a1', 1200);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(1, '12:30', 90), '00000000-0000-0000-0000-0000000000b1', 1200);
insert into public.payments (club_id, booking_id, method, amount, status, confirmed_at) values
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'cash', 1000, 'confirmed', now());
insert into public.payments (club_id, booking_id, method, amount, status, reported_by) values
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'transfer', 1200, 'reported',
   '00000000-0000-0000-0000-0000000000a1');
update public.bookings set status = 'cancelled', occupancy_id = null, cancelled_at = now()
 where id = 'b0000000-0000-0000-0000-000000000004';

-- A confirmed match the day after at 14:00 ($1.602: 402 for Ana, 400 for Bruno, Hugo and Iván), and another one at
-- 15:30 that lost its fourth player.
call test_helpers.make_match('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(2, '14:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4']::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 1602);
call test_helpers.make_match('e1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(2, '15:30', 90),
  array['00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a5',
        '00000000-0000-0000-0000-0000000000a3', null]::uuid[]);
call test_helpers.hold_court('e1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 1600);

create function test_helpers.match_booking(p_match_id uuid)
returns uuid
language sql
stable
as $$
  select booking_id from public.open_matches where id = p_match_id;
$$;

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000001', 2, 'cash') $$,
  'reception charges player 2 in cash');
select results_eq(
  $$ select amount, method::text, status::text, payer_position::int, payer_id, confirmed_by from public.payments
      where booking_id = 'b0000000-0000-0000-0000-000000000001' $$,
  $$ values (300, 'cash', 'confirmed', 2, null::uuid, '00000000-0000-0000-0000-0000000000c1'::uuid) $$,
  'a quarter of the price, confirmed by her, with his position');
select throws_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000001', 2, 'cash') $$,
  'P0001', 'already_paid', 'nobody pays his share twice');
select lives_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000001', 1, 'transfer') $$,
  'player 1 says he transferred');
select results_eq(
  $$ select amount, status::text, receipt_path, confirmed_by from public.payments
      where booking_id = 'b0000000-0000-0000-0000-000000000001' and payer_position = 1 $$,
  $$ values (302, 'confirmed', null::text, '00000000-0000-0000-0000-0000000000c1'::uuid) $$,
  'player 1 pays the remainder too; reception''s transfer is confirmed, with no receipt');
select lives_ok(
  $$ select public.charge_booking_rest('b0000000-0000-0000-0000-000000000001', 'cash') $$,
  'reception charges everything left');
select results_eq(
  $$ select amount, payer_position from public.payments
      where booking_id = 'b0000000-0000-0000-0000-000000000001' and payer_position is null $$,
  $$ values (600, null::smallint) $$,
  'one payment without position for the rest');
select throws_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000001', 3, 'cash') $$,
  'P0001', 'already_paid', 'a booking paid in full leaves no share to charge');
select throws_ok(
  $$ select public.charge_booking_rest('b0000000-0000-0000-0000-000000000001', 'cash') $$,
  'P0001', 'already_paid', 'nor anything left');

select lives_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000002', 2, 'cash') $$,
  'a share on a booking that got money without position');
select results_eq(
  $$ select amount from public.payments
      where booking_id = 'b0000000-0000-0000-0000-000000000002' and payer_position = 2 $$,
  $$ values (200) $$,
  'only what the booking still owes, not the whole share');
select throws_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000002', 3, 'cash') $$,
  'P0001', 'already_paid', 'then nothing is left');
select throws_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000003', 1, 'cash') $$,
  'P0001', 'already_paid', 'a transfer reported from the app covers it while it waits');
select throws_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000004', 1, 'cash') $$,
  'P0001', 'invalid_state', 'not on a cancelled booking');
select throws_ok(
  $$ select public.charge_booking_rest('b0000000-0000-0000-0000-000000000004', 'cash') $$,
  'P0001', 'invalid_state', 'nor its rest');
select throws_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000003', 5, 'cash') $$,
  'P0001', 'invalid_input', 'positions go from 1 to 4');
select throws_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000003', 1, null) $$,
  'P0001', 'invalid_input', 'it says how it was paid');

-- In a match each player pays his own share, now by transfer too.
select lives_ok(
  $$ select public.charge_booking_share(test_helpers.match_booking('e1000000-0000-0000-0000-000000000001'), 2,
       'transfer') $$,
  'reception records the transfer of a match player');
select results_eq(
  $$ select amount, method::text, status::text, payer_id, payer_position from public.payments
      where booking_id = test_helpers.match_booking('e1000000-0000-0000-0000-000000000001') $$,
  $$ values (400, 'transfer', 'confirmed', '00000000-0000-0000-0000-0000000000b1'::uuid, null::smallint) $$,
  'his share, under his name');
select throws_ok(
  $$ select public.charge_booking_share(test_helpers.match_booking('e1000000-0000-0000-0000-000000000001'), 2,
       'cash') $$,
  'P0001', 'already_paid', 'not twice');
select lives_ok(
  $$ select public.charge_booking_rest(test_helpers.match_booking('e1000000-0000-0000-0000-000000000001'), 'cash') $$,
  'the rest of a match');
select results_eq(
  $$ select payer_id, amount from public.payments
      where booking_id = test_helpers.match_booking('e1000000-0000-0000-0000-000000000001') and method = 'cash'
      order by amount desc, payer_id $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, 402),
            ('00000000-0000-0000-0000-0000000000a3'::uuid, 400),
            ('00000000-0000-0000-0000-0000000000a4'::uuid, 400) $$,
  'one payment per player who still owed');
select throws_ok(
  $$ select public.charge_booking_share(test_helpers.match_booking('e1000000-0000-0000-0000-000000000002'), 4,
       'cash') $$,
  'P0001', 'invalid_input', 'an empty spot pays nothing');

-- The club stops taking cash (as postgres).
reset role;
update public.clubs set accepts_cash = false where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  $$ select public.charge_booking_share(test_helpers.match_booking('e1000000-0000-0000-0000-000000000002'), 1,
       'cash') $$,
  'P0001', 'method_disabled', 'only the methods the club takes');
select throws_ok(
  $$ select public.charge_booking_rest(test_helpers.match_booking('e1000000-0000-0000-0000-000000000002'), 'cash') $$,
  'P0001', 'method_disabled', 'for the rest too');

-- Ana, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000003', 1, 'transfer') $$,
  'P0001', 'forbidden', 'a player does not record payments');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  $$ select public.charge_booking_share('b0000000-0000-0000-0000-000000000003', 1, 'transfer') $$,
  'P0001', 'forbidden', 'nor the staff of another club');
select throws_ok(
  $$ select public.charge_booking_rest('b0000000-0000-0000-0000-000000000003', 'transfer') $$,
  'P0001', 'forbidden', 'nor its rest');

reset role;
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in ('position_due', 'booking_left', 'chargeable_booking', 'record_charge')
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot execute the charge helpers');
select is(
  array(select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('charge_booking_share', 'charge_booking_rest')
          and has_function_privilege('anon', p.oid, 'execute')),
  array[]::text[],
  'anon cannot charge');

select * from finish();
rollback;
```

- [ ] **Step 2: Verlo fallar**

Run: `npx supabase test db supabase/tests/database/booking_charges.test.sql`
Expected: FAIL (`function public.charge_booking_share(unknown, integer, unknown) does not exist`).

- [ ] **Step 3: Las RPC**

Create `supabase/migrations/20261020000120_booking_share_charges.sql`:
```sql
-- Inicio del club, part 3: reception charges each player his share (price / 4, the remainder on player 1, the rule
-- of the matches), or what is left of the booking, in cash or by a transfer the player shows at the desk. Reception's
-- transfer is confirmed at once, with no receipt, by whoever records it. Both go to Cobros like any other payment.
-- In a booking (not a match) a share counts its own payments first (payer_position); a payment without position
-- covers what is left in general, so nobody is charged past the price. In a match each player owes his own share
-- (private.share_due), as in fase 2.

-- What the player in that position of a booking still owes of his share, counting only his own payments.
create function private.position_due(p_booking public.bookings, p_position integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select p_booking.price / 4 + case when p_position = 1 then p_booking.price % 4 else 0 end - coalesce((
    select sum(p.amount) from public.payments p
    where p.booking_id = p_booking.id and p.payer_position = p_position and p.status = 'confirmed'
  ), 0)::integer;
$$;

-- What the booking still owes as a whole, minus a transfer its holder already reported from the app.
create function private.booking_left(p_booking public.bookings)
returns integer
language sql
stable
set search_path = ''
as $$
  select p_booking.price - private.confirmed_amount(p_booking.id) - private.reported_amount(p_booking.id, null);
$$;

-- Locks the booking and checks the caller (staff of its club), the booking and the method.
create function private.chargeable_booking(p_booking_id uuid, p_method public.payment_method)
returns public.bookings
language plpgsql
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_club public.clubs;
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
  if p_method is null then
    perform private.fail('invalid_input');
  end if;
  select * into v_club from public.clubs where id = v_booking.club_id;
  if (p_method = 'cash' and not v_club.accepts_cash) or (p_method = 'transfer' and not v_club.accepts_transfer) then
    perform private.fail('method_disabled');
  end if;
  return v_booking;
end;
$$;

-- A payment reception takes at the desk: confirmed by whoever records it, no receipt.
create function private.record_charge(
  p_booking public.bookings,
  p_method public.payment_method,
  p_amount integer,
  p_payer_id uuid,
  p_position integer
)
returns public.payments
language sql
set search_path = ''
as $$
  insert into public.payments (club_id, booking_id, method, amount, status, payer_id, payer_position, reported_by,
                               confirmed_by, confirmed_at)
  values (p_booking.club_id, p_booking.id, p_method, p_amount, 'confirmed', p_payer_id, p_position,
          (select auth.uid()), (select auth.uid()), now())
  returning *;
$$;

-- "Cobrar $400": what that player still owes.
create function public.charge_booking_share(p_booking_id uuid, p_position integer, p_method public.payment_method)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings := private.chargeable_booking(p_booking_id, p_method);
  v_payer uuid;
  v_amount integer;
begin
  if p_position is null or p_position not between 1 and 4 then
    perform private.fail('invalid_input');
  end if;

  if v_booking.match_id is not null then
    select player_id into v_payer from public.match_slots
     where match_id = v_booking.match_id and position = p_position;
    if v_payer is null then
      perform private.fail('invalid_input');
    end if;
    v_amount := private.share_due(v_booking, v_payer) - private.reported_amount(v_booking.id, v_payer);
    if v_amount <= 0 then
      perform private.fail('already_paid');
    end if;
    return private.record_charge(v_booking, p_method, v_amount, v_payer, null);
  end if;

  v_amount := least(private.position_due(v_booking, p_position), private.booking_left(v_booking));
  if v_amount <= 0 then
    perform private.fail('already_paid');
  end if;
  return private.record_charge(v_booking, p_method, v_amount, null, p_position);
end;
$$;

-- "Cobrar todo lo que falta": one payment without position for what the booking still owes; in a match, one
-- payment per player who still owes, so each share stays his.
create function public.charge_booking_rest(p_booking_id uuid, p_method public.payment_method)
returns setof public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings := private.chargeable_booking(p_booking_id, p_method);
  v_player_id uuid;
  v_amount integer;
  v_payment public.payments;
  v_charged boolean := false;
begin
  if v_booking.match_id is null then
    v_amount := private.booking_left(v_booking);
    if v_amount <= 0 then
      perform private.fail('already_paid');
    end if;
    v_payment := private.record_charge(v_booking, p_method, v_amount, null, null);
    return next v_payment;
    return;
  end if;

  for v_player_id in
    select player_id from public.match_slots
     where match_id = v_booking.match_id and player_id is not null
     order by position
  loop
    v_amount := private.share_due(v_booking, v_player_id) - private.reported_amount(v_booking.id, v_player_id);
    if v_amount > 0 then
      v_payment := private.record_charge(v_booking, p_method, v_amount, v_player_id, null);
      v_charged := true;
      return next v_payment;
    end if;
  end loop;
  if not v_charged then
    perform private.fail('already_paid');
  end if;
end;
$$;

revoke all on function private.position_due(public.bookings, integer) from public;
revoke all on function private.booking_left(public.bookings) from public;
revoke all on function private.chargeable_booking(uuid, public.payment_method) from public;
revoke all on function private.record_charge(public.bookings, public.payment_method, integer, uuid, integer) from public;
revoke execute on function public.charge_booking_share(uuid, integer, public.payment_method) from public, anon;
revoke execute on function public.charge_booking_rest(uuid, public.payment_method) from public, anon;
grant execute on function public.charge_booking_share(uuid, integer, public.payment_method) to authenticated;
grant execute on function public.charge_booking_rest(uuid, public.payment_method) to authenticated;
```

- [ ] **Step 4: Aplicar y verlo pasar, con la suite entera**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/booking_charges.test.sql
npm run test:db
```
Expected: `Files=1, Tests=30 … PASS`; después `Files=69 … Result: PASS` (`integrity.test.sql` sigue viendo a `anon` solo con `match_preview` y `public_championship`; `match_payments.test.sql` y `payments.test.sql` no cambian).

- [ ] **Step 5: Tipos**

Run: `npm run db:types`
Expected: el diff suma `charge_booking_share` (devuelve un `payments`) y `charge_booking_rest` (devuelve `payments[]`).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261020000120_booking_share_charges.sql supabase/tests/database/booking_charges.test.sql lib/supabase/database.types.ts
git commit -m "feat(inicio): charge a player's share or what is left, in cash or by a transfer shown at the desk"
```

---

## Corte 2: Dominio y acciones

### Task 4: Partes, bloques y "Lo que pasa hoy"

**Files:**
- Create: `tests/unit/lib/domain/club-home.test.ts`
- Create: `lib/domain/club-home.ts`

- [ ] **Step 1: El test**

Create `tests/unit/lib/domain/club-home.test.ts` (usa `at`, `COURTS` y `occupancy` de `tests/unit/fixtures/grid.ts`: club de prueba el jueves 2026-10-01, Cancha 1 y Cancha 2):
```ts
import { describe, expect, it } from 'vitest'
import {
  competitionsToday,
  courtItems,
  homeSections,
  playerLabel,
  timeLeft,
  todayLines,
  transfersLine,
  turnPlayers,
  type HomePayment,
  type TurnBookingRow,
} from '@/lib/domain/club-home'
import { at, COURTS, occupancy } from '../../fixtures/grid'

function row(overrides: Partial<TurnBookingRow> = {}): TurnBookingRow {
  return {
    id: 'b1',
    price: 1202,
    player_id: 'ana',
    guest_name: null,
    match_id: null,
    player: { display_name: 'Ana' },
    match: null,
    players: [],
    payments: [],
    ...overrides,
  }
}

function paid(amount: number, more: Partial<HomePayment> = {}): HomePayment {
  return { status: 'confirmed', amount, payer_id: null, payer_position: null, ...more }
}

describe('turnPlayers, a booking', () => {
  it('splits the price in four, the remainder on player 1, and names whoever booked', () => {
    const turn = turnPlayers(row())
    expect(turn.players.map((player) => [player.position, player.name, player.share, player.due, player.state])).toEqual([
      [1, 'Ana', 302, 302, 'due'],
      [2, null, 300, 300, 'due'],
      [3, null, 300, 300, 'due'],
      [4, null, 300, 300, 'due'],
    ])
    expect(turn).toMatchObject({ isMatch: false, restDue: 1202, missingNames: true })
    expect(playerLabel(turn.players[2])).toBe('Jugador 3')
  })

  it('names players 2 to 4 by member or by name', () => {
    const turn = turnPlayers(
      row({
        players: [
          { position: 2, player_id: 'bruno', name: null, player: { display_name: 'Bruno' } },
          { position: 3, player_id: null, name: 'Pepe', player: null },
          { position: 4, player_id: null, name: 'Lucho', player: null },
        ],
      }),
    )
    expect(turn.players.map((player) => [player.name, player.playerId])).toEqual([
      ['Ana', 'ana'],
      ['Bruno', 'bruno'],
      ['Pepe', null],
      ['Lucho', null],
    ])
    expect(turn.missingNames).toBe(false)
  })

  it('counts each player\'s own payments first', () => {
    const turn = turnPlayers(row({ payments: [paid(300, { payer_position: 2 })] }))
    expect(turn.players.map((player) => player.state)).toEqual(['due', 'paid', 'due', 'due'])
    expect(turn.players[1]).toMatchObject({ due: 0, locked: true })
    expect(turn.players[2].locked).toBe(false)
    expect(turn.restDue).toBe(902)
  })

  it('a payment without position covers players only up to what the booking still owes', () => {
    const partly = turnPlayers(row({ payments: [paid(1000)] }))
    expect(partly.restDue).toBe(202)
    expect(partly.players.map((player) => player.due)).toEqual([202, 202, 202, 202])

    const whole = turnPlayers(row({ payments: [paid(1000), paid(202)] }))
    expect(whole.players.map((player) => player.state)).toEqual(['paid', 'paid', 'paid', 'paid'])
    expect(whole.restDue).toBe(0)
  })

  it('a transfer reported from the app covers the booking while the club checks it', () => {
    const turn = turnPlayers(row({ payments: [paid(1202, { status: 'reported' })] }))
    expect(turn.players.map((player) => [player.state, player.due])).toEqual([
      ['reported', 0],
      ['reported', 0],
      ['reported', 0],
      ['reported', 0],
    ])
    expect(turn.restDue).toBe(0)
  })

  it('ignores rejected and refunded payments', () => {
    const turn = turnPlayers(
      row({ payments: [paid(1202, { status: 'rejected' }), paid(300, { status: 'refunded', payer_position: 2 })] }),
    )
    expect(turn.restDue).toBe(1202)
    expect(turn.players[1]).toMatchObject({ state: 'due', locked: false })
  })
})

describe('turnPlayers, an open match', () => {
  const slot = (position: number, id: string | null, name: string) => ({
    position,
    player_id: id,
    player: id ? { display_name: name } : null,
  })

  it('takes its players from the spots, each with his own share', () => {
    const turn = turnPlayers(
      row({
        price: 1602,
        player_id: null,
        player: null,
        match_id: 'm1',
        match: { slots: [slot(2, 'bruno', 'Bruno'), slot(1, 'ana', 'Ana'), slot(3, 'hugo', 'Hugo'), slot(4, null, '')] },
        payments: [paid(402, { payer_id: 'ana' }), paid(400, { payer_id: 'bruno', status: 'reported' })],
      }),
    )
    expect(turn.players.map((player) => [player.position, player.name, player.due, player.state])).toEqual([
      [1, 'Ana', 0, 'paid'],
      [2, 'Bruno', 0, 'reported'],
      [3, 'Hugo', 400, 'due'],
    ])
    expect(turn).toMatchObject({ isMatch: true, restDue: 400, missingNames: false })
  })
})

describe('courtItems and homeSections', () => {
  // Court 1: a booking ended at 09:30 without paying, another 11:00-12:30, the Copa de la Casa 12:30-14:00, a
  // hold at 15:30. Court 2: a booking ended at 11:00 without paying, a paid one before it, the class 11:00-14:00.
  const occupancies = [
    occupancy('o-early', 'court-1', '08:00', '09:30'),
    occupancy('o-paid', 'court-2', '08:00', '09:30'),
    occupancy('o-ended', 'court-2', '09:30', '11:00'),
    occupancy('o-now', 'court-1', '11:00', '12:30'),
    occupancy('o-class', 'court-2', '11:00', '14:00', 'block', 'Clase de menores'),
    { ...occupancy('o-cup', 'court-1', '12:30', '14:00', 'tournament', 'Copa de la Casa'), tournamentId: 't1' },
    occupancy('o-hold', 'court-1', '15:30', '17:00', 'hold', 'Ana'),
  ]
  const booking = (id: string, occupancyId: string, payments: HomePayment[] = []) => ({
    ...row({ id, price: 1200, payments }),
    occupancy_id: occupancyId,
  })
  const items = courtItems({
    courts: COURTS,
    occupancies,
    bookings: [
      booking('b-early', 'o-early'),
      booking('b-paid', 'o-paid', [paid(1200)]),
      booking('b-ended', 'o-ended'),
      booking('b-now', 'o-now'),
    ],
  })
  const ids = (list: { id: string }[]) => list.map((item) => item.id)

  it('makes a card per booking and a line per block or tournament, without holds, in time and court order', () => {
    expect(ids(items)).toEqual(['o-early', 'o-paid', 'o-ended', 'o-now', 'o-class', 'o-cup'])
    expect(items.find((item) => item.id === 'o-class')).toMatchObject({
      kind: 'event',
      courtName: 'Cancha 2',
      label: 'Clase de menores',
      href: null,
    })
    expect(items.find((item) => item.id === 'o-cup')).toMatchObject({ label: 'Copa de la Casa', href: '/club/torneos/t1' })
    expect(items.find((item) => item.id === 'o-now')).toMatchObject({ kind: 'turn', bookingId: 'b-now', restDue: 1200 })
  })

  it('a booking is in play from the minute it starts, and pending from the minute it ends', () => {
    const sections = homeSections(items, at('11:00'))
    expect(ids(sections.playing)).toEqual(['o-now', 'o-class'])
    expect(ids(sections.pending)).toEqual(['o-early', 'o-ended'])
  })

  it('Próximos: what starts within the next 90 minutes, the 90th included', () => {
    expect(ids(homeSections(items, at('11:00')).upcoming)).toEqual(['o-cup'])
    expect(ids(homeSections(items, at('10:59')).upcoming)).toEqual(['o-now', 'o-class'])
  })

  it('with nothing in play, the next item', () => {
    const sections = homeSections(items, at('07:00'))
    expect(sections.playing).toEqual([])
    expect(sections.next?.id).toBe('o-early')
    expect(homeSections(items, at('14:00')).next).toBeNull()
  })
})

describe('timeLeft', () => {
  const slot = { startsAt: at('11:00'), endsAt: at('12:30') }

  it('says how much of the slot went by and what is left', () => {
    expect(timeLeft(slot, at('11:30'))).toEqual({ percentDone: 33, text: 'Faltan 60 min' })
    expect(timeLeft(slot, at('12:29'))).toEqual({ percentDone: 99, text: 'Falta 1 min' })
    expect(timeLeft(slot, at('11:00'))).toEqual({ percentDone: 0, text: 'Faltan 90 min' })
  })
})

describe('Lo que pasa hoy', () => {
  it('lists the tournaments and championships of the day once each', () => {
    expect(
      competitionsToday([
        { ...occupancy('a', 'court-1', '12:30', '14:00', 'tournament', 'Copa de la Casa'), tournamentId: 't1' },
        { ...occupancy('b', 'court-2', '12:30', '14:00', 'tournament', 'Copa de la Casa'), tournamentId: 't1' },
        { ...occupancy('c', 'court-1', '18:30', '20:00', 'championship', 'Apertura'), championshipId: 'c1' },
        occupancy('d', 'court-2', '18:30', '20:00'),
      ]),
    ).toEqual([
      { kind: 'tournament', id: 't1', name: 'Copa de la Casa' },
      { kind: 'championship', id: 'c1', name: 'Apertura' },
    ])
  })

  it('writes a short line with a link for each thing that happens', () => {
    expect(
      todayLines({
        forming: 2,
        competitions: [
          { kind: 'tournament', id: 't1', name: 'Copa de la Casa' },
          { kind: 'championship', id: 'c1', name: 'Apertura' },
        ],
        inside: 8,
        waiting: 3,
      }),
    ).toEqual([
      { text: '2 partidos armándose', href: '/club/grilla' },
      { text: 'Torneo Copa de la Casa', href: '/club/torneos/t1' },
      { text: 'Campeonato Apertura', href: '/club/torneos/campeonatos/c1' },
      { text: '8 en el club hoy', href: '/club/day-use' },
      { text: '3 esperando turno hoy', href: '/club/grilla' },
    ])
  })

  it('says one match in singular and leaves out what does not happen', () => {
    expect(todayLines({ forming: 1, competitions: [], inside: 0, waiting: 0 })).toEqual([
      { text: '1 partido armándose', href: '/club/grilla' },
    ])
    expect(todayLines({ forming: 0, competitions: [], inside: 0, waiting: 0 })).toEqual([])
  })
})

describe('transfersLine', () => {
  it('counts the transfers to confirm and their money', () => {
    expect(transfersLine({ count: 3, total: 4800 })).toBe('3 transferencias por confirmar · $4.800')
    expect(transfersLine({ count: 1, total: 1200 })).toBe('1 transferencia por confirmar · $1.200')
    expect(transfersLine({ count: 0, total: 0 })).toBeNull()
  })
})
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run tests/unit/lib/domain/club-home.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/domain/club-home"`).

- [ ] **Step 3: El módulo**

Create `lib/domain/club-home.ts`:
```ts
import { formatPrice } from './format'
import { holderName, KIND_LABELS, type Occupancy } from './grid'
import { shareFor, type SlotHolder } from './match-payments'
import type { PaymentStatus } from './payments'

// The club's Inicio: what is being played now, what comes next, what was played today and is still owed, and
// each player's share of a booking. Same rules as charge_booking_share and charge_booking_rest.

export type HomePayment = {
  status: PaymentStatus
  amount: number
  payer_id: string | null
  payer_position: number | null
}
export type ExtraPlayerRow = {
  position: number
  player_id: string | null
  name: string | null
  player: { display_name: string } | null
}
// A booking as lib/data reads it, with its players 2 to 4 (booking_players) or its match spots.
export type TurnBookingRow = {
  id: string
  price: number
  player_id: string | null
  guest_name: string | null
  match_id: string | null
  player: { display_name: string } | null
  match: { slots: SlotHolder[] } | null
  players: ExtraPlayerRow[]
  payments: HomePayment[]
}

// paid: nothing left of his share. due: reception can charge `due`. reported: a transfer from the app covers it
// while the club checks it.
export type ShareState = 'paid' | 'due' | 'reported'
export type PlayerShare = {
  position: number
  // null: nobody named yet ("Jugador 3").
  name: string | null
  playerId: string | null
  share: number
  due: number
  state: ShareState
  // He paid something with his position: set_booking_players does not change him.
  locked: boolean
}
export type TurnPlayers = { isMatch: boolean; players: PlayerShare[]; restDue: number; missingNames: boolean }

export type CourtTurn = TurnPlayers & {
  kind: 'turn'
  id: string
  bookingId: string
  courtName: string
  startsAt: Date
  endsAt: Date
}
// A block, a tournament or championship, a day use: a line without charges.
export type CourtEvent = {
  kind: 'event'
  id: string
  courtName: string
  startsAt: Date
  endsAt: Date
  label: string
  href: string | null
}
export type CourtItem = CourtTurn | CourtEvent
export type HomeSections = { playing: CourtItem[]; upcoming: CourtItem[]; pending: CourtTurn[]; next: CourtItem | null }
export type Competition = { kind: 'tournament' | 'championship'; id: string; name: string }
export type TodayLine = { text: string; href: string }

// "Próximos": what starts in the next hour and a half.
export const UPCOMING_MINUTES = 90
const POSITIONS = [1, 2, 3, 4] as const
const BOOKING_KINDS = new Set<Occupancy['kind']>(['booking', 'recurring', 'match'])

const total = (payments: HomePayment[]) => payments.reduce((sum, payment) => sum + payment.amount, 0)

export function playerLabel(player: Pick<PlayerShare, 'position' | 'name'>): string {
  return player.name ?? `Jugador ${player.position}`
}

function shareState(owed: number, due: number): ShareState {
  if (owed === 0) return 'paid'
  return due > 0 ? 'due' : 'reported'
}

// A booking of one holder: each share counts its own payments first; what the booking got without position
// covers what is left in general, so nobody is charged past the price (private.position_due, private.booking_left).
function bookingPlayers(booking: TurnBookingRow): TurnPlayers {
  const confirmed = booking.payments.filter((payment) => payment.status === 'confirmed')
  const paid = total(confirmed)
  const reported = total(booking.payments.filter((payment) => payment.status === 'reported' && payment.payer_id === null))
  const left = Math.max(0, booking.price - paid - reported)
  const players = POSITIONS.map((position): PlayerShare => {
    const share = shareFor(booking.price, position)
    const own = confirmed.filter((payment) => payment.payer_position === position)
    const owed = paid >= booking.price ? 0 : Math.max(0, share - total(own))
    const due = Math.min(owed, left)
    const row = booking.players.find((player) => player.position === position)
    const name =
      position === 1
        ? holderName(booking.guest_name, booking.player?.display_name ?? null)
        : row
          ? (row.name ?? row.player?.display_name ?? 'Sin nombre')
          : null
    return {
      position,
      name,
      playerId: position === 1 ? booking.player_id : (row?.player_id ?? null),
      share,
      due,
      state: shareState(owed, due),
      locked: own.length > 0,
    }
  })
  return { isMatch: false, players, restDue: left, missingNames: players.some((player) => player.name === null) }
}

// An open match: its spots are its players and each one owes his own share (private.share_due).
function matchPlayers(booking: TurnBookingRow): TurnPlayers {
  const players = [...(booking.match?.slots ?? [])]
    .sort((a, b) => a.position - b.position)
    .flatMap((slot): PlayerShare[] => {
      if (!slot.player_id) return []
      const playerId = slot.player_id
      const share = shareFor(booking.price, slot.position)
      const own = booking.payments.filter((payment) => payment.payer_id === playerId)
      const owed = Math.max(0, share - total(own.filter((payment) => payment.status === 'confirmed')))
      const due = Math.max(0, owed - total(own.filter((payment) => payment.status === 'reported')))
      return [
        {
          position: slot.position,
          name: slot.player?.display_name ?? 'Jugador',
          playerId,
          share,
          due,
          state: shareState(owed, due),
          locked: false,
        },
      ]
    })
  return { isMatch: true, players, restDue: players.reduce((sum, player) => sum + player.due, 0), missingNames: false }
}

export function turnPlayers(booking: TurnBookingRow): TurnPlayers {
  return booking.match_id ? matchPlayers(booking) : bookingPlayers(booking)
}

function eventHref(occupancy: Occupancy): string | null {
  if (occupancy.tournamentId) return `/club/torneos/${occupancy.tournamentId}`
  if (occupancy.championshipId) return `/club/torneos/campeonatos/${occupancy.championshipId}`
  if (occupancy.kind === 'day_use') return '/club/day-use'
  return null
}

// One item per occupancy of the day, in time order and, at the same time, in the club's court order. A court held
// for the waitlist is not news here.
export function courtItems(input: {
  courts: { id: string; name: string }[]
  occupancies: Occupancy[]
  bookings: (TurnBookingRow & { occupancy_id: string | null })[]
}): CourtItem[] {
  const courtIndex = new Map(input.courts.map((court, index) => [court.id, index]))
  const courtName = new Map(input.courts.map((court) => [court.id, court.name]))
  const bookingByOccupancy = new Map(input.bookings.map((booking) => [booking.occupancy_id, booking]))
  return [...input.occupancies]
    .sort(
      (a, b) =>
        a.startsAt.getTime() - b.startsAt.getTime() ||
        (courtIndex.get(a.courtId) ?? 0) - (courtIndex.get(b.courtId) ?? 0),
    )
    .flatMap((occupancy): CourtItem[] => {
      if (occupancy.kind === 'hold') return []
      const base = {
        id: occupancy.id,
        courtName: courtName.get(occupancy.courtId) ?? 'Cancha',
        startsAt: occupancy.startsAt,
        endsAt: occupancy.endsAt,
      }
      if (BOOKING_KINDS.has(occupancy.kind)) {
        const booking = bookingByOccupancy.get(occupancy.id)
        return booking ? [{ ...base, kind: 'turn', bookingId: booking.id, ...turnPlayers(booking) }] : []
      }
      return [{ ...base, kind: 'event', label: occupancy.note ?? KIND_LABELS[occupancy.kind], href: eventHref(occupancy) }]
    })
}

// En cancha ahora: started (at `now` included) and not ended. Próximos: starts within 90 minutes. Pendientes de
// cobro: a booking that ended (at `now` included) and still owes something.
export function homeSections(items: CourtItem[], now: Date): HomeSections {
  const time = now.getTime()
  const horizon = time + UPCOMING_MINUTES * 60_000
  return {
    playing: items.filter((item) => item.startsAt.getTime() <= time && time < item.endsAt.getTime()),
    upcoming: items.filter((item) => item.startsAt.getTime() > time && item.startsAt.getTime() <= horizon),
    pending: items.filter(
      (item): item is CourtTurn => item.kind === 'turn' && item.endsAt.getTime() <= time && item.restDue > 0,
    ),
    next: items.find((item) => item.startsAt.getTime() > time) ?? null,
  }
}

// The bar of a court in play: how much of the slot went by, and what is left in words.
export function timeLeft(item: { startsAt: Date; endsAt: Date }, now: Date): { percentDone: number; text: string } {
  const length = item.endsAt.getTime() - item.startsAt.getTime()
  const done = Math.min(Math.max(now.getTime() - item.startsAt.getTime(), 0), length)
  const minutes = Math.max(0, Math.ceil((item.endsAt.getTime() - now.getTime()) / 60_000))
  return {
    percentDone: length > 0 ? Math.round((done / length) * 100) : 100,
    text: minutes === 1 ? 'Falta 1 min' : `Faltan ${minutes} min`,
  }
}

// The tournaments and championships that hold a court today, once each.
export function competitionsToday(occupancies: Occupancy[]): Competition[] {
  const found = new Map<string, Competition>()
  for (const occupancy of occupancies) {
    if (occupancy.tournamentId && !found.has(occupancy.tournamentId)) {
      found.set(occupancy.tournamentId, {
        kind: 'tournament',
        id: occupancy.tournamentId,
        name: occupancy.note ?? KIND_LABELS.tournament,
      })
    }
    if (occupancy.championshipId && !found.has(occupancy.championshipId)) {
      found.set(occupancy.championshipId, {
        kind: 'championship',
        id: occupancy.championshipId,
        name: occupancy.note ?? KIND_LABELS.championship,
      })
    }
  }
  return [...found.values()]
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

// "Lo que pasa hoy": short lines with a link; nothing for what does not happen.
export function todayLines(input: {
  forming: number
  competitions: Competition[]
  inside: number
  waiting: number
}): TodayLine[] {
  const lines: TodayLine[] = []
  if (input.forming > 0) {
    lines.push({ text: plural(input.forming, 'partido armándose', 'partidos armándose'), href: '/club/grilla' })
  }
  for (const competition of input.competitions) {
    lines.push(
      competition.kind === 'tournament'
        ? { text: `Torneo ${competition.name}`, href: `/club/torneos/${competition.id}` }
        : { text: `Campeonato ${competition.name}`, href: `/club/torneos/campeonatos/${competition.id}` },
    )
  }
  if (input.inside > 0) lines.push({ text: `${input.inside} en el club hoy`, href: '/club/day-use' })
  if (input.waiting > 0) lines.push({ text: `${input.waiting} esperando turno hoy`, href: '/club/grilla' })
  return lines
}

// "3 transferencias por confirmar · $4.800", or nothing.
export function transfersLine(totals: { count: number; total: number }): string | null {
  if (totals.count === 0) return null
  return `${plural(totals.count, 'transferencia por confirmar', 'transferencias por confirmar')} · ${formatPrice(totals.total)}`
}
```

- [ ] **Step 4: Verlo pasar**

Run:
```bash
npx vitest run tests/unit/lib/domain/club-home.test.ts
npm run typecheck
```
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/club-home.ts tests/unit/lib/domain/club-home.test.ts
git commit -m "feat(inicio): each player's share and state, and which booking goes in each block by the time"
```

---

### Task 5: Buscar socios en un solo lugar

**Files:**
- Modify: `lib/domain/members.ts`
- Modify: `components/ui/member-picker.tsx`
- Test: `tests/unit/lib/domain/members.test.ts`

- [ ] **Step 1: El test** (con la herramienta Write)

Replace the whole `tests/unit/lib/domain/members.test.ts` with:
```ts
import { describe, expect, it } from 'vitest'
import { normalizeText, searchMembers } from '@/lib/domain/members'

describe('normalizeText', () => {
  it('drops accents, case and outer spaces', () => {
    expect(normalizeText('  LÓPEZ ')).toBe('lopez')
    expect(normalizeText('Martín')).toBe('martin')
  })
})

describe('searchMembers', () => {
  const members = [
    { userId: 'u1', name: 'Martín López' },
    { userId: 'u2', name: 'Martina Pérez' },
    { userId: 'u3', name: 'Lucía Martínez' },
  ]

  it('finds every typed word, without accents or case', () => {
    expect(searchMembers(members, 'martin lop', 8).map((member) => member.userId)).toEqual(['u1'])
    expect(searchMembers(members, 'MARTIN', 8).map((member) => member.userId)).toEqual(['u1', 'u2', 'u3'])
  })

  it('stops at the maximum', () => {
    expect(searchMembers(members, 'mart', 2).map((member) => member.userId)).toEqual(['u1', 'u2'])
  })
})
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run tests/unit/lib/domain/members.test.ts`
Expected: FAIL (`searchMembers is not a function`).

- [ ] **Step 3: `searchMembers`** (con la herramienta Edit: tiene `\s`)

At the end of `lib/domain/members.ts`, after `normalizeText`, add:
```ts

// Members whose name has every typed word (accents and case do not matter), at most `max`.
export function searchMembers(members: MemberOption[], query: string, max: number): MemberOption[] {
  const words = normalizeText(query).split(/\s+/).filter(Boolean)
  return members
    .filter((member) => {
      const text = normalizeText(member.name)
      return words.every((word) => text.includes(word))
    })
    .slice(0, max)
}
```

- [ ] **Step 4: `MemberPicker` la usa** (con la herramienta Edit: tiene `\s`)

In `components/ui/member-picker.tsx`, replace:
```tsx
import { normalizeText, type MemberOption } from '@/lib/domain/members'
```
with:
```tsx
import { searchMembers, type MemberOption } from '@/lib/domain/members'
```
and replace:
```tsx
  const matches = useMemo(() => {
    const words = normalizeText(query).split(/\s+/).filter(Boolean)
    const found = members.filter((member) => {
      const text = normalizeText(member.name)
      return words.every((word) => text.includes(word))
    })
    return found.slice(0, MAX_SHOWN)
  }, [members, query])
```
with:
```tsx
  const matches = useMemo(() => searchMembers(members, query, MAX_SHOWN), [members, query])
```

- [ ] **Step 5: Verlo pasar**

Run:
```bash
npx vitest run tests/unit/lib/domain/members.test.ts tests/unit/components/ui/member-picker.test.tsx
npm run typecheck
```
Expected: PASS (`member-picker.test.tsx` sin cambios: la refactorización no cambia el comportamiento).

- [ ] **Step 6: Commit**

```bash
git add lib/domain/members.ts components/ui/member-picker.tsx tests/unit/lib/domain/members.test.ts
git commit -m "refactor(inicio): searchMembers, shared by the member picker and the players of a booking"
```

---

### Task 6: Las Server Actions

**Files:**
- Create: `tests/unit/lib/actions/booking-charges-actions.test.ts`
- Create: `lib/actions/booking-charges.ts`

- [ ] **Step 1: El test**

Create `tests/unit/lib/actions/booking-charges-actions.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INVALID_INPUT } from '@/lib/actions/result'

// Server Actions are reachable by any POST: bad input must stop before any RPC.
type RpcResult = { data: unknown; error: { message: string } | null }
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<RpcResult>>(async () => ({
  data: { amount: 300 },
  error: null,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))

const { chargeRest, chargeShare, saveBookingPlayers } = await import('@/lib/actions/booking-charges')
const { errorMessage } = await import('@/lib/domain/errors')

const BOOKING = '44444444-4444-4444-4444-444444444444'
const MEMBER = '66666666-6666-6666-6666-666666666666'
const IDLE = { status: 'idle' as const }

function form(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

beforeEach(() => {
  rpc.mockClear()
})

describe('chargeShare', () => {
  it('charges a player in cash or by transfer', async () => {
    expect(await chargeShare(IDLE, form({ bookingId: BOOKING, position: '2', method: 'cash' }))).toEqual({
      status: 'ok',
      message: 'Cobramos $300 en efectivo.',
    })
    expect(rpc).toHaveBeenCalledWith('charge_booking_share', { p_booking_id: BOOKING, p_position: 2, p_method: 'cash' })
    expect(await chargeShare(IDLE, form({ bookingId: BOOKING, position: '1', method: 'transfer' }))).toEqual({
      status: 'ok',
      message: 'Cobramos $300 por transferencia.',
    })
  })

  it('rejects a bad booking, position or method before the RPC', async () => {
    expect(await chargeShare(IDLE, form({ bookingId: 'b1', position: '2', method: 'cash' }))).toEqual(INVALID_INPUT)
    expect(await chargeShare(IDLE, form({ bookingId: BOOKING, position: '5', method: 'cash' }))).toEqual(INVALID_INPUT)
    expect(await chargeShare(IDLE, form({ bookingId: BOOKING, position: '2', method: 'card' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('tells reception when someone else charged it first', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'already_paid' } })
    expect(await chargeShare(IDLE, form({ bookingId: BOOKING, position: '2', method: 'cash' }))).toEqual({
      status: 'error',
      message: 'Ya estaba pagado.',
    })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'method_disabled' } })
    expect(await chargeShare(IDLE, form({ bookingId: BOOKING, position: '2', method: 'cash' }))).toEqual({
      status: 'error',
      message: errorMessage('method_disabled'),
    })
  })
})

describe('chargeRest', () => {
  it('adds up what it charged', async () => {
    rpc.mockResolvedValueOnce({ data: [{ amount: 402 }, { amount: 400 }], error: null })
    expect(await chargeRest(IDLE, form({ bookingId: BOOKING, method: 'transfer' }))).toEqual({
      status: 'ok',
      message: 'Cobramos $802 por transferencia.',
    })
    expect(rpc).toHaveBeenCalledWith('charge_booking_rest', { p_booking_id: BOOKING, p_method: 'transfer' })
  })

  it('rejects a bad method before the RPC', async () => {
    expect(await chargeRest(IDLE, form({ bookingId: BOOKING }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('saveBookingPlayers', () => {
  it('sends a member, a name and nobody', async () => {
    const result = await saveBookingPlayers(
      IDLE,
      form({ bookingId: BOOKING, player2Id: MEMBER, player2Name: '', player3Id: '', player3Name: ' Pepe ', player4Id: '', player4Name: '' }),
    )
    expect(result).toEqual({ status: 'ok', message: 'Jugadores guardados.' })
    expect(rpc).toHaveBeenCalledWith('set_booking_players', {
      p_booking_id: BOOKING,
      p_players: [
        { position: 2, player_id: MEMBER },
        { position: 3, name: 'Pepe' },
      ],
    })
  })

  it('rejects a bad member id or a name too long before the RPC', async () => {
    expect(await saveBookingPlayers(IDLE, form({ bookingId: BOOKING, player2Id: 'ana' }))).toEqual(INVALID_INPUT)
    expect(await saveBookingPlayers(IDLE, form({ bookingId: BOOKING, player3Name: 'a'.repeat(61) }))).toEqual(INVALID_INPUT)
    expect(await saveBookingPlayers(IDLE, form({ bookingId: 'b1' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('explains that a player who paid stays', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'already_paid' } })
    expect(await saveBookingPlayers(IDLE, form({ bookingId: BOOKING }))).toEqual({
      status: 'error',
      message: 'Ese jugador ya pagó: no se puede cambiar ni sacar.',
    })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'player_repeated' } })
    expect(await saveBookingPlayers(IDLE, form({ bookingId: BOOKING }))).toEqual({
      status: 'error',
      message: 'Ese jugador ya está en el turno.',
    })
  })
})
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run tests/unit/lib/actions/booking-charges-actions.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/actions/booking-charges"`).

- [ ] **Step 3: Las acciones**

Create `lib/actions/booking-charges.ts`:
```ts
'use server'

import { failed, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { errorMessage } from '@/lib/domain/errors'
import { formatPrice } from '@/lib/domain/format'
import { readEnum, readInt, readText, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

// The players and charges of a booking, from the Inicio and from the Grilla. The rules live in Postgres
// (set_booking_players, charge_booking_share, charge_booking_rest); these only read the form.

const METHODS = ['cash', 'transfer'] as const
const HOW = { cash: 'en efectivo', transfer: 'por transferencia' } as const

// To reception, already_paid means someone else charged it a moment ago.
function staffError(code: string, alreadyPaid: string): ActionState {
  return failed(code === 'already_paid' ? alreadyPaid : errorMessage(code))
}

function readCharge(form: FormData) {
  return { bookingId: readUuid(form, 'bookingId'), method: readEnum(form, 'method', METHODS) }
}

// "Cobrar $400" → Efectivo / Me transfirió.
export async function chargeShare(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { bookingId, method } = readCharge(form)
  const position = readInt(form, 'position', { min: 1, max: 4 })
  if (!bookingId || !method || position === null) return INVALID_INPUT
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('charge_booking_share', {
    p_booking_id: bookingId,
    p_position: position,
    p_method: method,
  })
  revalidateBookings()
  if (error) return staffError(error.message, 'Ya estaba pagado.')
  return ok(`Cobramos ${formatPrice(data?.amount ?? 0)} ${HOW[method]}.`)
}

// "Cobrar todo lo que falta".
export async function chargeRest(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { bookingId, method } = readCharge(form)
  if (!bookingId || !method) return INVALID_INPUT
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('charge_booking_rest', { p_booking_id: bookingId, p_method: method })
  revalidateBookings()
  if (error) return staffError(error.message, 'Ya estaba pagado.')
  const amount = (data ?? []).reduce((sum, payment) => sum + payment.amount, 0)
  return ok(`Cobramos ${formatPrice(amount)} ${HOW[method]}.`)
}

type PlayerInput = { position: number; player_id: string } | { position: number; name: string }

// "Completar jugadores": player{2,3,4}Id (a member) or player{2,3,4}Name (just a name); both empty = nobody.
export async function saveBookingPlayers(_previous: ActionState, form: FormData): Promise<ActionState> {
  const bookingId = readUuid(form, 'bookingId')
  if (!bookingId) return INVALID_INPUT
  const players: PlayerInput[] = []
  for (const position of [2, 3, 4]) {
    const idField = `player${position}Id`
    const nameField = `player${position}Name`
    const rawId = String(form.get(idField) ?? '').trim()
    const rawName = String(form.get(nameField) ?? '').trim()
    if (rawId !== '') {
      const playerId = readUuid(form, idField)
      if (!playerId) return INVALID_INPUT
      players.push({ position, player_id: playerId })
    } else if (rawName !== '') {
      const name = readText(form, nameField, { maxLength: 60 })
      if (!name) return INVALID_INPUT
      players.push({ position, name })
    }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_booking_players', { p_booking_id: bookingId, p_players: players })
  revalidateBookings()
  if (error) return staffError(error.message, 'Ese jugador ya pagó: no se puede cambiar ni sacar.')
  return ok('Jugadores guardados.')
}
```

- [ ] **Step 4: Verlo pasar**

Run:
```bash
npx vitest run tests/unit/lib/actions/booking-charges-actions.test.ts
npm run typecheck
npm run lint
```
Expected: PASS. (`data?.amount` y `data ?? []`: el tipo de supabase-js no se angosta por el `if (error)`; nunca se castea.)

- [ ] **Step 5: Commit y PR borrador**

```bash
git add lib/actions/booking-charges.ts tests/unit/lib/actions/booking-charges-actions.test.ts
git commit -m "feat(inicio): chargeShare, chargeRest and saveBookingPlayers server actions"
git push -u origin feat/inicio-del-club
```
Abrir el PR borrador desde GitHub (`feat/inicio-del-club` → `main`), título `Inicio del club: jugadores por turno y cobro dividido`.

---

## Corte 3: El bloque de jugadores

### Task 7: La confirmación de cobro

**Files:**
- Create: `tests/unit/components/club/charge-choice.test.tsx`
- Create: `components/club/charge-choice.tsx`

- [ ] **Step 1: El test**

Create `tests/unit/components/club/charge-choice.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChargeChoice } from '@/components/club/charge-choice'
import type { FormAction } from '@/components/ui/action-form'
import type { ActionState } from '@/lib/actions/result'

function renderChoice(
  result: ActionState = { status: 'ok', message: 'Cobramos $300 en efectivo.' },
  methods = { cash: true, transfer: true },
) {
  const action = vi.fn<FormAction>(async () => result)
  const onDone = vi.fn()
  const onError = vi.fn()
  const onCancel = vi.fn()
  render(
    <ChargeChoice
      title="Cobrar $300 a Bruno"
      fields={{ bookingId: 'b1', position: '2' }}
      action={action}
      methods={methods}
      onDone={onDone}
      onError={onError}
      onCancel={onCancel}
    />,
  )
  return { action, onDone, onError, onCancel }
}

describe('ChargeChoice', () => {
  it('asks how the player paid and sends the method with the fields', async () => {
    const { action, onDone } = renderChoice()
    const group = screen.getByRole('group', { name: 'Cobrar $300 a Bruno' })
    expect(group).toHaveTextContent('Cobrar $300 a Bruno')
    await userEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Cobramos $300 en efectivo.'))
    expect(Object.fromEntries(action.mock.calls[0][1].entries())).toEqual({
      bookingId: 'b1',
      position: '2',
      method: 'cash',
    })
  })

  it('sends a transfer reception confirms at the desk', async () => {
    const { action } = renderChoice()
    await userEvent.click(screen.getByRole('button', { name: 'Me transfirió' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(action.mock.calls[0][1].get('method')).toBe('transfer')
  })

  it('offers only the methods the club takes', () => {
    renderChoice(undefined, { cash: false, transfer: true })
    expect(screen.queryByRole('button', { name: 'Efectivo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Me transfirió' })).toBeInTheDocument()
  })

  it('passes an error up and can go back', async () => {
    const { onError, onDone, onCancel } = renderChoice({ status: 'error', message: 'Ya estaba pagado.' })
    await userEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Ya estaba pagado.'))
    expect(onDone).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run tests/unit/components/club/charge-choice.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/club/charge-choice"`).

- [ ] **Step 3: El componente**

Create `components/club/charge-choice.tsx`:
```tsx
'use client'

import { useActionState } from 'react'
import type { FormAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import { IDLE, type ActionState } from '@/lib/actions/result'

export type PayMethods = { cash: boolean; transfer: boolean }

// The small confirmation after "Cobrar $400": how the player paid. Only the methods the club takes. The outcome
// goes to the card (onDone, onError), which outlives this choice.
export function ChargeChoice({
  title,
  fields,
  action,
  methods,
  onDone,
  onError,
  onCancel,
}: {
  title: string
  fields: Record<string, string>
  action: FormAction
  methods: PayMethods
  onDone: (message: string) => void
  onError: (message: string) => void
  onCancel: () => void
}) {
  const [, formAction, pending] = useActionState(async (previous: ActionState, formData: FormData) => {
    // A Server Action that redirects does not come back with a state.
    const result = (await action(previous, formData)) ?? previous
    if (result.status === 'ok') onDone(result.message ?? '')
    if (result.status === 'error') onError(result.message ?? '')
    return result
  }, IDLE)
  const options = [
    ...(methods.cash ? [{ value: 'cash', label: 'Efectivo' }] : []),
    ...(methods.transfer ? [{ value: 'transfer', label: 'Me transfirió' }] : []),
  ]

  return (
    <div role="group" aria-label={title} className="flex flex-col gap-2 rounded-xl border border-accent bg-surface p-3">
      <p className="text-sm font-semibold">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <form key={option.value} action={formAction}>
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <input type="hidden" name="method" value={option.value} />
            <SubmitButton label={option.label} pendingLabel="Cobrando…" fullWidth={false} />
          </form>
        ))}
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Volver
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verlo pasar**

Run: `npx vitest run tests/unit/components/club/charge-choice.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/club/charge-choice.tsx tests/unit/components/club/charge-choice.test.tsx
git commit -m "feat(inicio): the small charge confirmation, cash or 'Me transfirió'"
```

---

### Task 8: Un jugador, socio o nombre

**Files:**
- Create: `tests/unit/components/club/player-name-field.test.tsx`
- Create: `components/club/player-name-field.tsx`

- [ ] **Step 1: El test**

Create `tests/unit/components/club/player-name-field.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PlayerNameField } from '@/components/club/player-name-field'

const MEMBERS = [
  { userId: 'u1', name: 'Martín López' },
  { userId: 'u2', name: 'Lucía Pérez' },
]

function renderField(initial: { playerId: string | null; name: string | null } = { playerId: null, name: null }) {
  const { container } = render(
    <form aria-label="Jugadores">
      <label htmlFor="p3">Jugador 3</label>
      <PlayerNameField id="p3" position={3} members={MEMBERS} initial={initial} />
    </form>,
  )
  const form = container.querySelector('form')!
  return { values: () => Object.fromEntries(new FormData(form).entries()) }
}

describe('PlayerNameField', () => {
  it('picks a member from the list', async () => {
    const { values } = renderField()
    await userEvent.type(screen.getByRole('combobox', { name: 'Jugador 3' }), 'martin')
    await userEvent.click(screen.getByRole('option', { name: 'Martín López' }))
    expect(values()).toEqual({ player3Id: 'u1', player3Name: '' })
    expect(screen.getByText('Socio del club.')).toBeInTheDocument()
  })

  it('keeps a typed name of someone without an account', async () => {
    const { values } = renderField()
    await userEvent.type(screen.getByRole('combobox', { name: 'Jugador 3' }), ' Pepe ')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(values()).toEqual({ player3Id: '', player3Name: 'Pepe' })
    expect(screen.getByText('Sin cuenta: queda solo el nombre.')).toBeInTheDocument()
  })

  it('stops being the member once the text changes', async () => {
    const { values } = renderField({ playerId: 'u2', name: 'Lucía Pérez' })
    expect(values()).toEqual({ player3Id: 'u2', player3Name: '' })
    await userEvent.type(screen.getByRole('combobox', { name: 'Jugador 3' }), 'x')
    expect(values()).toEqual({ player3Id: '', player3Name: 'Lucía Pérezx' })
  })

  it('starts empty: nobody yet', () => {
    const { values } = renderField()
    expect(values()).toEqual({ player3Id: '', player3Name: '' })
    expect(screen.getByText('Sin nombre por ahora.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run tests/unit/components/club/player-name-field.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/club/player-name-field"`).

- [ ] **Step 3: El componente**

Create `components/club/player-name-field.tsx`:
```tsx
'use client'

import { useId, useMemo, useState } from 'react'
import { inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { searchMembers, type MemberOption } from '@/lib/domain/members'

const MAX_SHOWN = 6

// One player of a booking: a member picked from the list, or whatever name reception types (someone without an
// account). Empty means nobody yet. The form gets player{n}Id or player{n}Name, never both.
export function PlayerNameField({
  id,
  position,
  members,
  initial,
}: {
  id: string
  position: number
  members: MemberOption[]
  initial: { playerId: string | null; name: string | null }
}) {
  const listId = useId()
  const [query, setQuery] = useState(initial.name ?? '')
  const [picked, setPicked] = useState<MemberOption | null>(
    initial.playerId ? { userId: initial.playerId, name: initial.name ?? '' } : null,
  )
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const matches = useMemo(() => searchMembers(members, query, MAX_SHOWN), [members, query])
  const showList = open && query.trim() !== '' && !picked && matches.length > 0

  const pick = (member: MemberOption) => {
    setPicked(member)
    setQuery(member.name)
    setOpen(false)
  }

  return (
    <div>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && matches[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        maxLength={60}
        placeholder="Buscá un socio o escribí un nombre"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setPicked(null)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
            setActive((index) => Math.min(index + 1, matches.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((index) => Math.max(index - 1, 0))
          } else if (event.key === 'Enter' && showList && matches[active]) {
            event.preventDefault()
            pick(matches[active])
          } else if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
        className={inputClasses}
      />
      <input type="hidden" name={`player${position}Id`} value={picked?.userId ?? ''} />
      <input type="hidden" name={`player${position}Name`} value={picked ? '' : query.trim()} />
      {showList ? (
        <ul id={listId} role="listbox" className="mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-bg p-1">
          {matches.map((member, index) => (
            <li
              key={member.userId}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // mousedown, not click: it runs before the text box loses focus and closes the list.
              onMouseDown={(event) => {
                event.preventDefault()
                pick(member)
              }}
              className={cn(
                'flex min-h-11 cursor-pointer items-center rounded-lg px-3',
                index === active ? 'bg-accent text-on-accent' : 'hover:bg-surface',
              )}
            >
              {member.name}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1 text-xs text-fg-muted">
        {picked ? 'Socio del club.' : query.trim() !== '' ? 'Sin cuenta: queda solo el nombre.' : 'Sin nombre por ahora.'}
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Verlo pasar**

Run: `npx vitest run tests/unit/components/club/player-name-field.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/club/player-name-field.tsx tests/unit/components/club/player-name-field.test.tsx
git commit -m "feat(inicio): a player field that takes a member from the list or just a name"
```

---

### Task 9: El bloque de jugadores y cobro

**Files:**
- Create: `tests/unit/components/club/booking-players.test.tsx`
- Create: `components/club/players-sheet.tsx`
- Create: `components/club/booking-players.tsx`

- [ ] **Step 1: El test** (cubre también la hoja "Jugadores del turno")

Create `tests/unit/components/club/booking-players.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BookingPlayers, type PlayersActions } from '@/components/club/booking-players'
import type { FormAction } from '@/components/ui/action-form'
import type { ActionState } from '@/lib/actions/result'
import { turnPlayers, type HomePayment, type TurnBookingRow } from '@/lib/domain/club-home'

function turnOf(overrides: Partial<TurnBookingRow> = {}) {
  return turnPlayers({
    id: 'b1',
    price: 1200,
    player_id: 'ana',
    guest_name: null,
    match_id: null,
    player: { display_name: 'Ana' },
    match: null,
    players: [{ position: 2, player_id: 'bruno', name: null, player: { display_name: 'Bruno' } }],
    payments: [],
    ...overrides,
  })
}

const ok = (message: string) => async (): Promise<ActionState> => ({ status: 'ok', message })

function renderBlock(
  turn = turnOf(),
  options: { onDone?: (message: string) => void; chargeShare?: FormAction; methods?: { cash: boolean; transfer: boolean } } = {},
) {
  const actions: PlayersActions = {
    chargeShare: options.chargeShare ?? vi.fn<FormAction>(ok('Cobramos $300 en efectivo.')),
    chargeRest: vi.fn<FormAction>(ok('Cobramos $1.200 por transferencia.')),
    savePlayers: vi.fn<FormAction>(ok('Jugadores guardados.')),
  }
  render(
    <BookingPlayers
      bookingId="b1"
      turn={turn}
      methods={options.methods ?? { cash: true, transfer: true }}
      members={[{ userId: 'gabi', name: 'Gabi Ruiz' }]}
      actions={actions}
      onDone={options.onDone}
    />,
  )
  return actions
}

describe('BookingPlayers', () => {
  it('lists the four players, unnamed ones as Jugador N, each with his share', () => {
    renderBlock()
    const rows = within(screen.getByRole('list', { name: 'Jugadores' })).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      'AnaCobrar $300',
      'BrunoCobrar $300',
      'Jugador 3Cobrar $300',
      'Jugador 4Cobrar $300',
    ])
    expect(screen.getByRole('button', { name: 'Completar jugadores' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cobrar todo lo que falta ($1.200)' })).toBeInTheDocument()
  })

  it('shows who paid and who reported a transfer', () => {
    const payments: HomePayment[] = [{ status: 'confirmed', amount: 300, payer_id: null, payer_position: 2 }]
    renderBlock(turnOf({ payments }))
    expect(screen.getByRole('list', { name: 'Jugadores' })).toHaveTextContent('BrunoPagó')
    expect(screen.getByRole('button', { name: 'Cobrar todo lo que falta ($900)' })).toBeInTheDocument()
  })

  it('charges one player and says so in the card', async () => {
    const actions = renderBlock()
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar $300 a Bruno' }))
    const choice = screen.getByRole('group', { name: 'Cobrar $300 a Bruno' })
    await userEvent.click(within(choice).getByRole('button', { name: 'Efectivo' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Cobramos $300 en efectivo.')
    expect(Object.fromEntries(vi.mocked(actions.chargeShare).mock.calls[0][1].entries())).toEqual({
      bookingId: 'b1',
      position: '2',
      method: 'cash',
    })
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('keeps the error in the card when someone else charged first', async () => {
    renderBlock(turnOf(), { chargeShare: vi.fn<FormAction>(async () => ({ status: 'error', message: 'Ya estaba pagado.' })) })
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar $300 a Ana' }))
    await userEvent.click(screen.getByRole('button', { name: 'Me transfirió' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya estaba pagado.')
  })

  it('charges everything left', async () => {
    const actions = renderBlock()
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar todo lo que falta ($1.200)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Me transfirió' }))
    await waitFor(() => expect(actions.chargeRest).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(vi.mocked(actions.chargeRest).mock.calls[0][1].entries())).toEqual({
      bookingId: 'b1',
      method: 'transfer',
    })
  })

  it('hands successes to the Grilla when it asks for them', async () => {
    const onDone = vi.fn()
    renderBlock(turnOf(), { onDone })
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar $300 a Ana' }))
    await userEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Cobramos $300 en efectivo.'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('opens Completar jugadores with players 2 to 4', async () => {
    const actions = renderBlock()
    await userEvent.click(screen.getByRole('button', { name: 'Completar jugadores' }))
    const sheet = screen.getByRole('dialog', { name: 'Jugadores del turno' })
    expect(sheet).toHaveTextContent('Jugador 1: Ana, quien reservó.')
    expect(within(sheet).getByRole('combobox', { name: 'Jugador 2' })).toHaveValue('Bruno')
    await userEvent.type(within(sheet).getByRole('combobox', { name: 'Jugador 3' }), 'Pepe')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Guardar jugadores' }))
    await waitFor(() => expect(actions.savePlayers).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(vi.mocked(actions.savePlayers).mock.calls[0][1].entries())).toEqual({
      bookingId: 'b1',
      player2Id: 'bruno',
      player2Name: '',
      player3Id: '',
      player3Name: 'Pepe',
      player4Id: '',
      player4Name: '',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Jugadores guardados.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('leaves a player who paid as he is', async () => {
    const payments: HomePayment[] = [{ status: 'confirmed', amount: 300, payer_id: null, payer_position: 2 }]
    renderBlock(turnOf({ payments }))
    await userEvent.click(screen.getByRole('button', { name: 'Completar jugadores' }))
    const sheet = screen.getByRole('dialog', { name: 'Jugadores del turno' })
    expect(sheet).toHaveTextContent('Jugador 2: Bruno (ya pagó)')
    expect(within(sheet).queryByRole('combobox', { name: 'Jugador 2' })).not.toBeInTheDocument()
  })

  it('a match has no Completar jugadores', () => {
    renderBlock(
      turnOf({
        match_id: 'm1',
        match: { slots: [{ position: 1, player_id: 'ana', player: { display_name: 'Ana' } }] },
      }),
    )
    expect(screen.queryByRole('button', { name: /jugadores$/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cobrar $300 a Ana' })).toBeInTheDocument()
  })

  it('no charges when the club takes no method', () => {
    renderBlock(turnOf(), { methods: { cash: false, transfer: false } })
    expect(screen.queryByRole('button', { name: /^Cobrar/ })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run tests/unit/components/club/booking-players.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/club/booking-players"`).

- [ ] **Step 3: La hoja "Jugadores del turno"**

Create `components/club/players-sheet.tsx`:
```tsx
'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field } from '@/components/ui/field'
import { playerLabel, type PlayerShare } from '@/lib/domain/club-home'
import type { MemberOption } from '@/lib/domain/members'
import { PlayerNameField } from './player-name-field'

// "Completar jugadores": players 2 to 4. Whoever already paid his share stays as he is (set_booking_players).
export function PlayersSheet({
  bookingId,
  players,
  members,
  action,
  onClose,
  onDone,
}: {
  bookingId: string
  players: PlayerShare[]
  members: MemberOption[]
  action: FormAction
  onClose: () => void
  onDone: (message: string) => void
}) {
  const holder = players.find((player) => player.position === 1)
  return (
    <BottomSheet open onClose={onClose} title="Jugadores del turno">
      <ActionForm action={action} submitLabel="Guardar jugadores" pendingLabel="Guardando…" onDone={onDone}>
        <input type="hidden" name="bookingId" value={bookingId} />
        {holder ? (
          <p className="text-sm text-fg-muted">
            Jugador 1: {playerLabel(holder)}, quien reservó. Si no sabés quién juega, dejalo vacío.
          </p>
        ) : null}
        {players
          .filter((player) => player.position > 1)
          .map((player) =>
            player.locked && player.name !== null ? (
              <div key={player.position} className="flex flex-col gap-1">
                <p>
                  <span className="font-semibold">Jugador {player.position}:</span> {player.name} (ya pagó)
                </p>
                <input type="hidden" name={`player${player.position}Id`} value={player.playerId ?? ''} />
                <input type="hidden" name={`player${player.position}Name`} value={player.playerId ? '' : player.name} />
              </div>
            ) : (
              <Field key={player.position} label={`Jugador ${player.position}`} htmlFor={`player-${bookingId}-${player.position}`}>
                <PlayerNameField
                  id={`player-${bookingId}-${player.position}`}
                  position={player.position}
                  members={members}
                  initial={{ playerId: player.playerId, name: player.name }}
                />
              </Field>
            ),
          )}
      </ActionForm>
    </BottomSheet>
  )
}
```

- [ ] **Step 4: El bloque**

Create `components/club/booking-players.tsx`:
```tsx
'use client'

import { useState, type ReactNode } from 'react'
import type { FormAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { playerLabel, type PlayerShare, type TurnPlayers } from '@/lib/domain/club-home'
import { formatPrice } from '@/lib/domain/format'
import type { MemberOption } from '@/lib/domain/members'
import { ChargeChoice, type PayMethods } from './charge-choice'
import { PlayersSheet } from './players-sheet'

export type PlayersActions = { chargeShare: FormAction; chargeRest: FormAction; savePlayers: FormAction }

type Notice = { tone: 'ok' | 'error'; text: string }

// The players of a booking or an open match, each with "Pagó" or "Cobrar $400", "Completar jugadores" and
// "Cobrar todo lo que falta". The same block on the Inicio and in the Grilla. The outcome of a charge shows here
// (it outlives the row that changed); with onDone the caller takes successes instead (the Grilla closes its sheet).
export function BookingPlayers({
  bookingId,
  turn,
  methods,
  members,
  actions,
  onDone,
  playerExtra,
}: {
  bookingId: string
  turn: TurnPlayers
  methods: PayMethods
  members: MemberOption[]
  actions: PlayersActions
  onDone?: (message: string) => void
  playerExtra?: (player: PlayerShare) => ReactNode
}) {
  const [charging, setCharging] = useState<number | 'rest' | null>(null)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const canCharge = methods.cash || methods.transfer

  const succeed = (text: string) => {
    setCharging(null)
    setEditing(false)
    if (onDone) onDone(text)
    else setNotice({ tone: 'ok', text })
  }
  const fail = (text: string) => {
    setCharging(null)
    setNotice({ tone: 'error', text })
  }
  const startCharge = (target: number | 'rest') => {
    setNotice(null)
    setCharging(target)
  }

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Jugadores" className="flex flex-col gap-2">
        {turn.players.map((player) => {
          const label = playerLabel(player)
          const title = `Cobrar ${formatPrice(player.due)} a ${label}`
          return (
            <li key={player.position} className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={cn('font-semibold', player.name === null && 'text-fg-muted')}>{label}</span>
                {player.state === 'paid' ? (
                  <span className="text-sm font-semibold text-court-ink">Pagó</span>
                ) : player.state === 'reported' ? (
                  <span className="text-sm text-accent-ink">Transferencia informada</span>
                ) : canCharge && charging !== player.position ? (
                  <Button variant="secondary" aria-label={title} onClick={() => startCharge(player.position)}>
                    Cobrar {formatPrice(player.due)}
                  </Button>
                ) : null}
              </div>
              {charging === player.position ? (
                <ChargeChoice
                  title={title}
                  fields={{ bookingId, position: String(player.position) }}
                  action={actions.chargeShare}
                  methods={methods}
                  onDone={succeed}
                  onError={fail}
                  onCancel={() => setCharging(null)}
                />
              ) : null}
              {playerExtra?.(player)}
            </li>
          )
        })}
      </ul>
      {turn.isMatch ? null : (
        <Button
          variant="ghost"
          onClick={() => {
            setNotice(null)
            setEditing(true)
          }}
        >
          {turn.missingNames ? 'Completar jugadores' : 'Cambiar jugadores'}
        </Button>
      )}
      {canCharge && turn.restDue > 0 ? (
        charging === 'rest' ? (
          <ChargeChoice
            title={`Cobrar todo lo que falta (${formatPrice(turn.restDue)})`}
            fields={{ bookingId }}
            action={actions.chargeRest}
            methods={methods}
            onDone={succeed}
            onError={fail}
            onCancel={() => setCharging(null)}
          />
        ) : (
          <Button variant="primary" onClick={() => startCharge('rest')}>
            Cobrar todo lo que falta ({formatPrice(turn.restDue)})
          </Button>
        )
      ) : null}
      {notice ? (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={cn('rounded-xl border bg-bg p-3 text-sm', notice.tone === 'error' ? 'border-accent' : 'border-border')}
        >
          {notice.text}
        </p>
      ) : null}
      {editing ? (
        <PlayersSheet
          bookingId={bookingId}
          players={turn.players}
          members={members}
          action={actions.savePlayers}
          onClose={() => setEditing(false)}
          onDone={succeed}
        />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 5: Verlo pasar**

Run:
```bash
npx vitest run tests/unit/components/club/booking-players.test.tsx
npm run typecheck
npm run lint
```
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add components/club/players-sheet.tsx components/club/booking-players.tsx tests/unit/components/club/booking-players.test.tsx
git commit -m "feat(inicio): the players and charges block, with Completar jugadores"
```

---

### Task 10: La Grilla usa el mismo bloque

**Files:**
- Modify: `lib/domain/grid.ts:1,35-36`
- Modify: `lib/data/day.ts:4-5,29,46,81`
- Modify: `components/club/occupancy-detail-sheet.tsx` (archivo entero)
- Modify: `app/(club)/club/grilla/club-board.tsx`
- Modify: `app/(club)/club/grilla/page.tsx`
- Test: `tests/unit/components/club/occupancy-detail-sheet.test.tsx` (archivo entero)

- [ ] **Step 1: El test** (reemplaza los casos de "Cobrar en efectivo" con monto por el bloque compartido)

Replace the whole `tests/unit/components/club/occupancy-detail-sheet.test.tsx` with:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OccupancyDetailSheet, type DetailActions } from '@/components/club/occupancy-detail-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { turnPlayers } from '@/lib/domain/club-home'
import type { GridCell } from '@/lib/domain/grid'
import { at, booking, makeGrid, occupancy, TIMEZONE } from '../../fixtures/grid'

const bookingTurn = turnPlayers({
  id: 'b-o1',
  price: 1200,
  player_id: null,
  guest_name: 'Rodríguez',
  match_id: null,
  player: null,
  match: null,
  players: [],
  payments: [],
})
const matchTurn = turnPlayers({
  id: 'b-om',
  price: 1600,
  player_id: null,
  guest_name: null,
  match_id: 'm1',
  player: null,
  match: {
    slots: [
      { position: 1, player_id: 'a', player: { display_name: 'Ana' } },
      { position: 2, player_id: 'b', player: { display_name: 'Bruno' } },
    ],
  },
  players: [],
  payments: [{ status: 'confirmed', amount: 400, payer_id: 'a', payer_position: null }],
})

const booked = makeGrid({
  occupancies: [occupancy('o1', 'court-1', '08:00', '09:30')],
  bookings: [booking('o1', { holderName: 'Rodríguez', amountDue: 1200, turn: bookingTurn })],
}).rows[0].cells[0]
const blocked = makeGrid({
  occupancies: [occupancy('blk', 'court-2', '08:00', '11:00', 'block', 'Clase de Pablo')],
}).rows[0].cells[1]
const matchCell = makeGrid({
  occupancies: [occupancy('om', 'court-1', '20:00', '21:30', 'match')],
  bookings: [
    booking('om', {
      holderName: 'Partido abierto',
      source: 'online',
      price: 1600,
      amountDue: 1200,
      matchId: 'm1',
      turn: matchTurn,
    }),
  ],
}).rows.find((row) => row.slot.label === '20:00')!.cells[0]

const held = makeGrid({
  occupancies: [{ ...occupancy('h1', 'court-1', '20:00', '21:30', 'hold', 'Ana'), expiresAt: at('17:42') }],
}).rows.find((row) => row.slot.label === '20:00')!.cells[0]

function renderDetail(cell: GridCell, methods = { cash: true, transfer: true }) {
  const done = async () => ({ status: 'ok' as const, message: 'Listo.' })
  const actions: DetailActions = {
    cancel: vi.fn<FormAction>(done),
    unblock: vi.fn<FormAction>(done),
    chargeShare: vi.fn<FormAction>(done),
    chargeRest: vi.fn<FormAction>(done),
    savePlayers: vi.fn<FormAction>(done),
    endSeries: vi.fn<FormAction>(done),
    cancelMatch: vi.fn<FormAction>(done),
    removeFromMatch: vi.fn<FormAction>(done),
    release: vi.fn<FormAction>(done),
  }
  const onDone = vi.fn()
  render(
    <OccupancyDetailSheet
      cell={cell}
      occupancy={cell.occupancy!}
      date="2026-10-01"
      dayText="jueves 1 de octubre"
      timezone={TIMEZONE}
      methods={methods}
      members={[{ userId: 'u2', name: 'Bruno Díaz' }]}
      actions={actions}
      onClose={vi.fn()}
      onDone={onDone}
    />,
  )
  const sent = (action: FormAction) => Object.fromEntries(vi.mocked(action).mock.calls[0][1].entries())
  return { actions, onDone, sent }
}

describe('OccupancyDetailSheet', () => {
  it('links a tournament block to its page', () => {
    const tournamentCell = makeGrid({
      occupancies: [{ ...occupancy('tt', 'court-1', '18:00', '20:20', 'tournament', 'Americano de octubre'), tournamentId: 't1' }],
    }).rows.find((row) => row.slot.label === '18:30')!.cells[0]
    renderDetail(tournamentCell)
    expect(screen.getByRole('dialog', { name: 'Americano de octubre' })).toHaveTextContent('Torneo, Cancha 1')
    expect(screen.getByRole('link', { name: 'Gestionar torneo' })).toHaveAttribute('href', '/club/torneos/t1')
    expect(screen.queryByRole('button', { name: 'Liberar cancha' })).not.toBeInTheDocument()
  })

  it('shows holder, time, source and payment', () => {
    renderDetail(booked)
    const dialog = screen.getByRole('dialog', { name: 'Rodríguez' })
    expect(dialog).toHaveTextContent('Reserva, Cancha 1, jueves 1 de octubre, 08:00 a 09:30, cargada en recepción')
    expect(dialog).toHaveTextContent('Pendiente de pago')
    expect(dialog).toHaveTextContent('$1.200')
  })

  it('charges a player his share with the same block as the Inicio, and closes on success', async () => {
    const { actions, onDone, sent } = renderDetail(booked)
    expect(screen.getByRole('list', { name: 'Jugadores' })).toHaveTextContent('Jugador 2')
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar $300 a Jugador 2' }))
    const choice = screen.getByRole('group', { name: 'Cobrar $300 a Jugador 2' })
    await userEvent.click(within(choice).getByRole('button', { name: 'Efectivo' }))
    await waitFor(() => expect(actions.chargeShare).toHaveBeenCalledTimes(1))
    expect(sent(actions.chargeShare)).toEqual({ bookingId: 'b-o1', position: '2', method: 'cash' })
    expect(onDone).toHaveBeenCalledWith('Listo.')
  })

  it('charges everything left', async () => {
    const { actions, sent } = renderDetail(booked)
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar todo lo que falta ($1.200)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Me transfirió' }))
    await waitFor(() => expect(actions.chargeRest).toHaveBeenCalledTimes(1))
    expect(sent(actions.chargeRest)).toEqual({ bookingId: 'b-o1', method: 'transfer' })
  })

  it('hides charges when the club takes neither method', () => {
    renderDetail(booked, { cash: false, transfer: false })
    expect(screen.queryByRole('button', { name: /^Cobrar/ })).not.toBeInTheDocument()
  })

  it('cancels the booking', async () => {
    const { actions, onDone, sent } = renderDetail(booked)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Listo.'))
    expect(sent(actions.cancel)).toEqual({ bookingId: 'b-o1' })
  })

  it('ends a recurring slot from this date on', async () => {
    const recurring = makeGrid({
      occupancies: [occupancy('r1', 'court-1', '08:00', '09:30', 'recurring')],
      bookings: [booking('r1', { holderName: 'Rodríguez', seriesId: 's1' })],
    }).rows[0].cells[0]
    const { actions, sent } = renderDetail(recurring)
    await userEvent.click(screen.getByRole('button', { name: 'Terminar turno fijo desde esta fecha' }))
    await waitFor(() => expect(actions.endSeries).toHaveBeenCalledTimes(1))
    expect(sent(actions.endSeries)).toEqual({ seriesId: 's1', fromDate: '2026-10-01' })
  })

  it('frees a blocked court', async () => {
    const { actions, sent } = renderDetail(blocked)
    expect(screen.getByRole('dialog', { name: 'Clase de Pablo' })).toHaveTextContent('08:00 a 11:00')
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Liberar cancha' }))
    await waitFor(() => expect(actions.unblock).toHaveBeenCalledTimes(1))
    expect(sent(actions.unblock)).toEqual({ occupancyId: 'blk' })
  })

  it('shows a match by player, with the same charges, taking a player out and cancelling it', async () => {
    const { actions, sent } = renderDetail(matchCell)
    const players = screen.getByRole('list', { name: 'Jugadores' })
    expect(players).toHaveTextContent('AnaPagó')
    expect(screen.queryByRole('button', { name: 'Completar jugadores' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar $400 a Bruno' }))
    await userEvent.click(screen.getByRole('button', { name: 'Me transfirió' }))
    await waitFor(() => expect(actions.chargeShare).toHaveBeenCalledTimes(1))
    expect(sent(actions.chargeShare)).toEqual({ bookingId: 'b-om', position: '2', method: 'transfer' })
    expect(screen.getAllByRole('button', { name: 'Sacar del partido' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Cancelar partido' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument()
  })

  it('says for whom a court is held and passes it to the next in line', async () => {
    const { actions, onDone, sent } = renderDetail(held)
    expect(screen.getByRole('dialog', { name: 'Ana' })).toHaveTextContent('Retenido para Ana hasta las 17:42.')
    await userEvent.click(screen.getByRole('button', { name: 'Pasar al siguiente' }))
    await waitFor(() => expect(actions.release).toHaveBeenCalledTimes(1))
    expect(sent(actions.release)).toEqual({ occupancyId: 'h1' })
    expect(onDone).toHaveBeenCalledWith('Listo.')
  })
})
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run tests/unit/components/club/occupancy-detail-sheet.test.tsx`
Expected: FAIL (`turn` no existe en `GridBooking`; no hay botón "Cobrar $300 a Jugador 2").

- [ ] **Step 3: `GridBooking` lleva los jugadores**

In `lib/domain/grid.ts`, replace:
```ts
import type { MatchPlayerPayment } from './match-payments'
```
with:
```ts
import type { TurnPlayers } from './club-home'
```
and replace:
```ts
  matchId?: string | null
  matchPlayers?: MatchPlayerPayment[]
}
```
with:
```ts
  matchId?: string | null
  // Its players and their shares (staff only: lib/data/day.ts).
  turn?: TurnPlayers
}
```
(`club-home.ts` importa de `grid.ts` y `grid.ts` importa un tipo de `club-home.ts`: un `import type` no arma un ciclo en runtime.)

- [ ] **Step 4: La Grilla lee jugadores y posiciones**

In `lib/data/day.ts`, replace:
```ts
import { matchPlayerPayments, type SlotHolder } from '@/lib/domain/match-payments'
import { amountDue, paymentState, type PaymentStatus } from '@/lib/domain/payments'
```
with:
```ts
import { turnPlayers, type ExtraPlayerRow, type HomePayment } from '@/lib/domain/club-home'
import type { SlotHolder } from '@/lib/domain/match-payments'
import { amountDue, paymentState } from '@/lib/domain/payments'
```
replace:
```ts
  match: { slots: SlotHolder[] } | null
  payments: { status: PaymentStatus; amount: number; payer_id: string | null }[]
}
```
with:
```ts
  match: { slots: SlotHolder[] } | null
  players: ExtraPlayerRow[]
  payments: HomePayment[]
}
```
replace:
```ts
    matchPlayers: row.match ? matchPlayerPayments(row, slots, row.payments) : [],
```
with:
```ts
    turn: turnPlayers(row),
```
and in the bookings `.select(…)` replace the end of the string:
```ts
, payments(status, amount, payer_id)',
```
with:
```ts
, players:booking_players(position, player_id, name, player:profiles!booking_players_player_id_fkey(display_name)), payments(status, amount, payer_id, payer_position)',
```
(`booking_players` llega a `profiles` por `player_id` y por `created_by`: el hint elige al jugador. A un jugador la RLS le devuelve `players: []`, y su grilla no muestra el bloque.)

- [ ] **Step 5: El detalle** (archivo entero)

Replace the whole `components/club/occupancy-detail-sheet.tsx` with:
```tsx
'use client'

import Link from 'next/link'
import { PaymentBadge } from '@/components/booking/payment-badge'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { formatPrice, timeIn } from '@/lib/domain/format'
import { KIND_LABELS, type GridBooking, type GridCell, type Occupancy } from '@/lib/domain/grid'
import type { MemberOption } from '@/lib/domain/members'
import type { LocalDate } from '@/lib/domain/time'
import { BookingPlayers, type PlayersActions } from './booking-players'
import type { PayMethods } from './charge-choice'
import { CancelMatchForm, RemovePlayerForm } from './match-staff-actions'

export type DetailActions = PlayersActions & {
  cancel: FormAction
  unblock: FormAction
  endSeries: FormAction
  cancelMatch: FormAction
  removeFromMatch: FormAction
  release: FormAction
}

export function OccupancyDetailSheet({
  cell,
  occupancy,
  date,
  dayText,
  timezone,
  methods,
  members,
  actions,
  onClose,
  onDone,
}: {
  cell: GridCell
  occupancy: Occupancy
  date: LocalDate
  dayText: string
  timezone: string
  methods: PayMethods
  members: MemberOption[]
  actions: DetailActions
  onClose: () => void
  onDone: (message: string) => void
}) {
  const { booking } = cell
  const kindLabel = KIND_LABELS[occupancy.kind]
  const title = booking?.holderName ?? occupancy.note ?? kindLabel
  const when = `${dayText}, ${timeIn(occupancy.startsAt, timezone)} a ${timeIn(occupancy.endsAt, timezone)}`
  const source = booking ? `, cargada ${booking.source === 'online' ? 'online' : 'en recepción'}` : ''

  return (
    <BottomSheet open onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <p className="text-fg-muted">
          {kindLabel}, {cell.court.name}, {when}
          {source}.
        </p>
        {cell.offGrid ? <p className="text-sm">No coincide con la grilla actual del club.</p> : null}
        {occupancy.tournamentId ? (
          <Link href={`/club/torneos/${occupancy.tournamentId}`} className="font-semibold text-accent-ink underline">
            Gestionar torneo
          </Link>
        ) : null}
        {occupancy.championshipId ? (
          <Link href={`/club/torneos/campeonatos/${occupancy.championshipId}`} className="font-semibold text-accent-ink underline">
            Gestionar campeonato
          </Link>
        ) : null}
        {booking?.matchId ? (
          <MatchBookingDetail booking={booking} methods={methods} members={members} actions={actions} onDone={onDone} />
        ) : booking ? (
          <>
            <div className="flex items-center gap-3">
              <PaymentBadge state={booking.paymentState} />
              <span>{formatPrice(booking.price)}</span>
            </div>
            {booking.turn ? (
              <BookingPlayers
                bookingId={booking.id}
                turn={booking.turn}
                methods={methods}
                members={members}
                actions={actions}
                onDone={onDone}
              />
            ) : null}
            <ActionForm
              action={actions.cancel}
              submitLabel="Cancelar reserva"
              pendingLabel="Cancelando…"
              variant="secondary"
              onDone={onDone}
            >
              <input type="hidden" name="bookingId" value={booking.id} />
            </ActionForm>
            {booking.seriesId ? (
              <ActionForm
                action={actions.endSeries}
                submitLabel="Terminar turno fijo desde esta fecha"
                pendingLabel="Terminando…"
                variant="ghost"
                onDone={onDone}
              >
                <input type="hidden" name="seriesId" value={booking.seriesId} />
                <input type="hidden" name="fromDate" value={date} />
                <p className="text-sm text-fg-muted">Cancela esta fecha y las siguientes de este turno fijo.</p>
              </ActionForm>
            ) : null}
          </>
        ) : null}
        {occupancy.kind === 'hold' ? (
          <>
            <p>
              Retenido para {occupancy.note ?? 'el primero de la lista de espera'}
              {occupancy.expiresAt ? ` hasta las ${timeIn(occupancy.expiresAt, timezone)}` : ''}. Si no lo reserva a tiempo,
              pasa al siguiente.
            </p>
            <ActionForm
              action={actions.release}
              submitLabel="Pasar al siguiente"
              pendingLabel="Pasando…"
              variant="secondary"
              onDone={onDone}
            >
              <input type="hidden" name="occupancyId" value={occupancy.id} />
            </ActionForm>
          </>
        ) : null}
        {occupancy.kind === 'block' ? (
          <ActionForm
            action={actions.unblock}
            submitLabel="Liberar cancha"
            pendingLabel="Liberando…"
            variant="secondary"
            onDone={onDone}
          >
            <input type="hidden" name="occupancyId" value={occupancy.id} />
          </ActionForm>
        ) : null}
      </div>
    </BottomSheet>
  )
}

function MatchBookingDetail({
  booking,
  methods,
  members,
  actions,
  onDone,
}: {
  booking: GridBooking
  methods: PayMethods
  members: MemberOption[]
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
      {booking.turn ? (
        <BookingPlayers
          bookingId={booking.id}
          turn={booking.turn}
          methods={methods}
          members={members}
          actions={actions}
          onDone={onDone}
          playerExtra={(player) =>
            player.playerId ? (
              <RemovePlayerForm matchId={matchId} playerId={player.playerId} action={actions.removeFromMatch} onDone={onDone} />
            ) : null
          }
        />
      ) : null}
      <CancelMatchForm matchId={matchId} action={actions.cancelMatch} onDone={onDone} />
    </div>
  )
}
```

- [ ] **Step 6: `ClubBoard` pasa medios y socios**

In `app/(club)/club/grilla/club-board.tsx`, replace:
```tsx
import type { FormAction } from '@/components/ui/action-form'
```
with:
```tsx
import type { PayMethods } from '@/components/club/charge-choice'
import type { FormAction } from '@/components/ui/action-form'
```
replace:
```tsx
  members,
  acceptsCash,
  loadAction,
  detailActions,
}: {
```
with:
```tsx
  members,
  methods,
  loadAction,
  detailActions,
}: {
```
replace:
```tsx
  members: MemberOption[]
  acceptsCash: boolean
  loadAction: FormAction
```
with:
```tsx
  members: MemberOption[]
  methods: PayMethods
  loadAction: FormAction
```
and replace:
```tsx
          acceptsCash={acceptsCash}
          actions={detailActions}
```
with:
```tsx
          methods={methods}
          members={members}
          actions={detailActions}
```

- [ ] **Step 7: La página de la Grilla**

In `app/(club)/club/grilla/page.tsx`, replace:
```tsx
import { cancelBooking, cancelMatch, endSeries, loadSlot, recordCash, releaseSlotHold, removeFromMatch, unblockCourt } from './actions'
```
with:
```tsx
import { chargeRest, chargeShare, saveBookingPlayers } from '@/lib/actions/booking-charges'
import { cancelBooking, cancelMatch, endSeries, loadSlot, releaseSlotHold, removeFromMatch, unblockCourt } from './actions'
```
and replace:
```tsx
          acceptsCash={club.accepts_cash}
          loadAction={loadSlot}
          detailActions={{
            cancel: cancelBooking,
            unblock: unblockCourt,
            cash: recordCash,
            endSeries,
```
with:
```tsx
          methods={{ cash: club.accepts_cash, transfer: club.accepts_transfer }}
          loadAction={loadSlot}
          detailActions={{
            cancel: cancelBooking,
            unblock: unblockCourt,
            chargeShare,
            chargeRest,
            savePlayers: saveBookingPlayers,
            endSeries,
```
(`recordCash` sigue en `grilla/actions.ts`: lo usa Cobros.)

- [ ] **Step 8: Verlo pasar**

Run:
```bash
npx vitest run tests/unit/components/club tests/unit/lib
npm run typecheck
npm run lint
```
Expected: PASS (`occupancy-detail-sheet.test.tsx`: 10 tests).

- [ ] **Step 9: Commit**

```bash
git add lib/domain/grid.ts lib/data/day.ts components/club/occupancy-detail-sheet.tsx "app/(club)/club/grilla/club-board.tsx" "app/(club)/club/grilla/page.tsx" tests/unit/components/club/occupancy-detail-sheet.test.tsx
git commit -m "feat(inicio): the Grilla's booking detail uses the same players and charges block"
```

---

## Corte 4: El Inicio

### Task 11: Los datos y las tarjetas

**Files:**
- Create: `lib/data/club-home.ts`
- Create: `tests/unit/components/club/court-card.test.tsx`
- Create: `components/club/court-card.tsx`

- [ ] **Step 1: Los datos** (no tiene test propio: es lectura con la sesión, como `lib/data/day.ts`; las reglas están en `club-home.ts` y lo cubre el e2e)

Create `lib/data/club-home.ts`:
```ts
import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import {
  competitionsToday,
  courtItems,
  todayLines,
  type CourtItem,
  type TodayLine,
  type TurnBookingRow,
} from '@/lib/domain/club-home'
import { toOccupancy } from '@/lib/domain/grid'
import { totalsOf, type PaymentsTotals } from '@/lib/domain/payments-overview'
import { addDays, localDateOf, zonedTime } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'
import { loadInside } from './day-use'
import { loadMatches } from './matches'
import { loadDayWaits } from './waitlist'

export type ClubHomeData = { items: CourtItem[]; today: TodayLine[]; transfers: PaymentsTotals }

// booking_players reaches profiles through player_id and created_by: the hint picks the player.
const TURN_SELECT =
  'id, occupancy_id, price, player_id, guest_name, match_id, player:profiles!bookings_player_id_fkey(display_name), match:open_matches!bookings_match_id_fkey(slots:match_slots(position, player_id, player:profiles(display_name))), players:booking_players(position, player_id, name, player:profiles!booking_players_player_id_fkey(display_name)), payments(status, amount, payer_id, payer_position)'

// If supabase-js infers a slightly different shape for the embeds, adjust this type to match; never cast.
type HomeBookingRow = TurnBookingRow & { occupancy_id: string | null }

// Everything the Inicio shows, read in parallel with the staff session: the club's day (occupancies, bookings with
// their players and payments, notes), forming matches, day use inside, waits and reported transfers.
export async function loadClubHome(club: Club, now = new Date()): Promise<ClubHomeData> {
  const supabase = await createClient()
  const today = localDateOf(now, club.timezone)
  const dayStart = zonedTime(today, 0, club.timezone)
  const dayEnd = zonedTime(addDays(today, 1), 0, club.timezone)
  const from = dayStart.toISOString()
  const to = dayEnd.toISOString()

  const [courts, occupancies, bookings, notes, reported, forming, inside, waits] = await Promise.all([
    supabase.from('courts').select('id, name').eq('club_id', club.id).order('sort_order'),
    supabase
      .from('court_occupancy')
      .select('id, court_id, kind, starts_at, ends_at, tournament_id, championship_id')
      .eq('club_id', club.id)
      .lt('starts_at', to)
      .gt('ends_at', from),
    supabase
      .from('bookings')
      .select(TURN_SELECT)
      .eq('club_id', club.id)
      .eq('status', 'confirmed')
      .lt('starts_at', to)
      .gt('ends_at', from),
    supabase.rpc('occupancy_notes', { p_club_id: club.id, p_from: from, p_to: to }),
    supabase.from('payments').select('amount').eq('club_id', club.id).eq('status', 'reported'),
    loadMatches(club, { from: dayStart, to: dayEnd }, ['forming']),
    loadInside(club, today),
    loadDayWaits(club, today),
  ])
  if (courts.error) throw courts.error
  if (occupancies.error) throw occupancies.error
  if (bookings.error) throw bookings.error
  if (notes.error) throw notes.error
  if (reported.error) throw reported.error

  const noteById = new Map((notes.data ?? []).map((row) => [row.id, row.note]))
  const day = occupancies.data.map((row) => toOccupancy({ ...row, note: noteById.get(row.id) ?? null }, 'staff'))
  const turns: HomeBookingRow[] = bookings.data

  return {
    items: courtItems({ courts: courts.data, occupancies: day, bookings: turns }),
    today: todayLines({
      forming: forming.length,
      competitions: competitionsToday(day),
      inside: inside.length,
      waiting: waits.length,
    }),
    transfers: totalsOf(reported.data, (payment) => payment.amount),
  }
}
```

Run: `npm run typecheck`
Expected: PASS. Si supabase-js infiere otra forma para los embeds, se ajusta `HomeBookingRow` (`const turns: HomeBookingRow[] = bookings.data` es el chequeo), nunca con un cast.

- [ ] **Step 2: El test de las tarjetas**

Create `tests/unit/components/club/court-card.test.tsx`:
```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CourtList } from '@/components/club/court-card'
import type { FormAction } from '@/components/ui/action-form'
import { courtItems } from '@/lib/domain/club-home'
import { at, COURTS, occupancy, TIMEZONE } from '../../fixtures/grid'

const items = courtItems({
  courts: COURTS,
  occupancies: [
    occupancy('o1', 'court-1', '11:00', '12:30'),
    occupancy('o2', 'court-2', '11:00', '14:00', 'block', 'Clase de menores'),
    { ...occupancy('o3', 'court-2', '14:00', '15:30', 'tournament', 'Copa de la Casa'), tournamentId: 't1' },
  ],
  bookings: [
    {
      id: 'b1',
      occupancy_id: 'o1',
      price: 1200,
      player_id: null,
      guest_name: 'Rodríguez',
      match_id: null,
      player: null,
      match: null,
      players: [],
      payments: [],
    },
  ],
})

function renderList(now?: Date) {
  const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Listo.' }))
  render(
    <CourtList
      items={items}
      timezone={TIMEZONE}
      methods={{ cash: true, transfer: true }}
      members={[]}
      actions={{ chargeShare: action, chargeRest: action, savePlayers: action }}
      now={now}
    />,
  )
}

describe('CourtList', () => {
  it('shows a booking as a card with its players and how much is left', () => {
    renderList(at('11:30'))
    const card = screen.getByRole('article', { name: 'Cancha 1, 11:00 a 12:30' })
    expect(within(card).getByRole('progressbar', { name: 'Tiempo de juego en Cancha 1' })).toHaveAttribute(
      'aria-valuenow',
      '33',
    )
    expect(card).toHaveTextContent('Faltan 60 min')
    expect(within(card).getByRole('list', { name: 'Jugadores' })).toHaveTextContent('Rodríguez')
  })

  it('shows blocks and tournaments as a line, a tournament with its link', () => {
    renderList()
    expect(screen.getByText('Cancha 2 · Clase de menores')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cancha 2 · Copa de la Casa' })).toHaveAttribute('href', '/club/torneos/t1')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Verlo fallar**

Run: `npx vitest run tests/unit/components/club/court-card.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/club/court-card"`).

- [ ] **Step 4: Las tarjetas**

Create `components/club/court-card.tsx` (sin `'use client'`: lo renderiza la página en el servidor y adentro va `BookingPlayers`, que es cliente; las Server Actions y las fechas pasan como props):
```tsx
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { timeLeft, type CourtItem, type CourtTurn } from '@/lib/domain/club-home'
import { timeIn } from '@/lib/domain/format'
import type { MemberOption } from '@/lib/domain/members'
import { BookingPlayers, type PlayersActions } from './booking-players'
import type { PayMethods } from './charge-choice'

export type CourtListProps = {
  items: CourtItem[]
  timezone: string
  methods: PayMethods
  members: MemberOption[]
  actions: PlayersActions
  // En cancha ahora: each card shows how much is left.
  now?: Date
}

// The courts of one Inicio block: a card per booking or match, a line per block, tournament or day use.
export function CourtList({ items, timezone, methods, members, actions, now }: CourtListProps) {
  const hours = (item: CourtItem) => `${timeIn(item.startsAt, timezone)} a ${timeIn(item.endsAt, timezone)}`
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((item) =>
        item.kind === 'turn' ? (
          <li key={item.id}>
            <CourtTurnCard
              turn={item}
              hours={hours(item)}
              progress={now ? timeLeft(item, now) : undefined}
              methods={methods}
              members={members}
              actions={actions}
            />
          </li>
        ) : (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface px-4 py-3 md:col-span-2"
          >
            {item.href ? (
              <Link href={item.href} className="font-semibold text-accent-ink underline">
                {item.courtName} · {item.label}
              </Link>
            ) : (
              <span className="font-semibold">
                {item.courtName} · {item.label}
              </span>
            )}
            <span className="text-sm text-fg-muted">{hours(item)}</span>
          </li>
        ),
      )}
    </ul>
  )
}

export function CourtTurnCard({
  turn,
  hours,
  progress,
  methods,
  members,
  actions,
}: {
  turn: CourtTurn
  hours: string
  progress?: { percentDone: number; text: string }
  methods: PayMethods
  members: MemberOption[]
  actions: PlayersActions
}) {
  return (
    <Card role="article" aria-label={`${turn.courtName}, ${hours}`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xl font-bold uppercase">{turn.courtName}</h3>
        <span className="text-sm text-fg-muted">
          {hours}
          {turn.isMatch ? ' · Partido abierto' : ''}
        </span>
      </div>
      {progress ? (
        <div className="flex flex-col gap-1">
          <div
            role="progressbar"
            aria-label={`Tiempo de juego en ${turn.courtName}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percentDone}
            aria-valuetext={progress.text}
            className="h-2 overflow-hidden rounded-full bg-bg"
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${progress.percentDone}%` }} />
          </div>
          <p className="text-sm text-fg-muted">{progress.text}</p>
        </div>
      ) : null}
      <BookingPlayers bookingId={turn.bookingId} turn={turn} methods={methods} members={members} actions={actions} />
    </Card>
  )
}
```

- [ ] **Step 5: Verlo pasar**

Run:
```bash
npx vitest run tests/unit/components/club/court-card.test.tsx
npm run typecheck
npm run lint
```
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/data/club-home.ts components/club/court-card.tsx tests/unit/components/club/court-card.test.tsx
git commit -m "feat(inicio): loadClubHome and the court cards of each block"
```

---

### Task 12: La pantalla, la pestaña y `/club`

**Files:**
- Create: `app/(club)/club/inicio/page.tsx`
- Modify: `lib/club/tabs.ts:6`
- Modify: `app/(club)/club/page.tsx:4`
- Modify: `app/(club)/club/layout.tsx:10`
- Modify: `app/(jugador)/page.tsx:193`
- Test: `tests/unit/lib/club/tabs.test.ts` (archivo entero)

- [ ] **Step 1: El test de las pestañas**

Replace the whole `tests/unit/lib/club/tabs.test.ts` with:
```ts
import { describe, expect, it } from 'vitest'
import { clubTabs } from '@/lib/club/tabs'

describe('clubTabs', () => {
  it('shows the day-to-day screens to reception', () => {
    expect(clubTabs('reception').map((tab) => tab.label)).toEqual([
      'Inicio', 'Grilla', 'Calendario', 'Torneos', 'Day use', 'Cobros', 'Jugadores',
    ])
  })

  it('adds the settings to admins', () => {
    expect(clubTabs('admin').map((tab) => tab.href)).toEqual([
      '/club/inicio', '/club/grilla', '/club/calendario', '/club/torneos', '/club/day-use', '/club/cobros', '/club/jugadores', '/club/ajustes',
    ])
  })

  it('gives every tab an icon', () => {
    expect(clubTabs('admin').map((tab) => tab.icon)).toEqual(['home', 'grid', 'calendar', 'trophy', 'ticket', 'cash', 'users', 'sliders'])
  })
})
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run tests/unit/lib/club/tabs.test.ts`
Expected: FAIL (falta `Inicio` adelante).

- [ ] **Step 3: La pestaña**

In `lib/club/tabs.ts`, replace:
```ts
    { href: '/club/grilla', label: 'Grilla', icon: 'grid' },
```
with:
```ts
    { href: '/club/inicio', label: 'Inicio', icon: 'home' },
    { href: '/club/grilla', label: 'Grilla', icon: 'grid' },
```

- [ ] **Step 4: `/club`, el layout y "Panel del club" van al Inicio**

In `app/(club)/club/page.tsx`, replace `redirect('/club/grilla')` with `redirect('/club/inicio')`.

In `app/(club)/club/layout.tsx`, replace `requireStaff('/club/grilla')` with `requireStaff('/club/inicio')`.

In `app/(jugador)/page.tsx`, replace:
```tsx
          <Link href="/club/grilla" className={buttonClasses({ variant: 'secondary', fullWidth: true, className: 'lg:col-span-2' })}>
```
with:
```tsx
          <Link href="/club/inicio" className={buttonClasses({ variant: 'secondary', fullWidth: true, className: 'lg:col-span-2' })}>
```
(`requireAdmin` sigue mandando a `/club/grilla` a quien no es admin: no cambia.)

- [ ] **Step 5: La página**

Create `app/(club)/club/inicio/page.tsx`:
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { CourtList } from '@/components/club/court-card'
import { AutoRefresh } from '@/components/live/auto-refresh'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { chargeRest, chargeShare, saveBookingPlayers } from '@/lib/actions/booking-charges'
import { requireStaff } from '@/lib/auth/viewer'
import { loadClubHome } from '@/lib/data/club-home'
import { loadMemberOptions } from '@/lib/data/members'
import { homeSections, transfersLine } from '@/lib/domain/club-home'
import { timeIn } from '@/lib/domain/format'

export const metadata: Metadata = { title: 'Inicio' }

function HomeSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-display text-2xl font-bold uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

// Reception's and the admin's first screen: what is played now, what comes next, what is still owed today and what
// else happens. It renders again when an occupancy changes (Realtime) and every minute, so bookings move from
// Próximos to En cancha and to Pendientes on their own.
export default async function ClubHomePage() {
  const viewer = await requireStaff('/club/inicio')
  const { club } = viewer
  const now = new Date()
  const [home, members] = await Promise.all([loadClubHome(club, now), loadMemberOptions(club.id)])
  const { playing, upcoming, pending, next } = homeSections(home.items, now)
  const transfers = transfersLine(home.transfers)
  const list = {
    timezone: club.timezone,
    methods: { cash: club.accepts_cash, transfer: club.accepts_transfer },
    members,
    actions: { chargeShare, chargeRest, savePlayers: saveBookingPlayers },
  }

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <AutoRefresh seconds={60} />

      <HomeSection id="en-cancha" title="En cancha ahora">
        {playing.length > 0 ? (
          <CourtList items={playing} now={now} {...list} />
        ) : (
          <p className="text-fg-muted">
            No hay canchas en juego ahora.
            {next ? ` El próximo turno: ${next.courtName} a las ${timeIn(next.startsAt, club.timezone)}.` : ''}
          </p>
        )}
      </HomeSection>

      <HomeSection id="proximos" title="Próximos">
        {upcoming.length > 0 ? (
          <CourtList items={upcoming} {...list} />
        ) : (
          <p className="text-fg-muted">No empieza nada en la próxima hora y media.</p>
        )}
      </HomeSection>

      <HomeSection id="pendientes" title="Pendientes de cobro">
        {pending.length > 0 ? (
          <CourtList items={pending} {...list} />
        ) : (
          <p className="text-fg-muted">Lo jugado hoy está cobrado.</p>
        )}
        {transfers ? (
          <Link href="/club/cobros#transferencias" className="font-semibold text-accent-ink underline">
            {transfers}
          </Link>
        ) : null}
      </HomeSection>

      {home.today.length > 0 ? (
        <HomeSection id="hoy" title="Lo que pasa hoy">
          <ul className="flex flex-col gap-2">
            {home.today.map((line) => (
              <li key={line.text}>
                <Link href={line.href} className="font-semibold text-accent-ink underline">
                  {line.text}
                </Link>
              </li>
            ))}
          </ul>
        </HomeSection>
      ) : null}
    </>
  )
}
```

- [ ] **Step 6: Checks**

Run:
```bash
npx vitest run tests/unit/lib/club/tabs.test.ts tests/unit/components/nav
npm test
npm run typecheck
npm run lint
npm run build
```
Expected: todo PASS (Vitest: 184 archivos). `build` lista `/club/inicio` como ruta dinámica (`ƒ`).

- [ ] **Step 7: Mirarla** (opcional, local)

Run: `npm run dev:local` y entrar como recepción a `http://localhost:3000/club`: redirige a `/club/inicio`, la pestaña "Inicio" es la primera y "Panel del club · Rustic Pádel" dice "Inicio". Con la demo (`npm run demo:data`) hay turnos en juego de día.

- [ ] **Step 8: Commit**

```bash
git add "app/(club)/club/inicio/page.tsx" lib/club/tabs.ts "app/(club)/club/page.tsx" "app/(club)/club/layout.tsx" "app/(jugador)/page.tsx" tests/unit/lib/club/tabs.test.ts
git commit -m "feat(inicio): the Inicio tab, first in the panel and where /club goes"
```

---

## Corte 5: e2e y cierre

### Task 13: El flujo de recepción

**Files:**
- Create: `tests/e2e/support/club-home.ts`
- Create: `tests/e2e/club-home.spec.ts`

- [ ] **Step 1: El turno de ahora**

Create `tests/e2e/support/club-home.ts`:
```ts
import { daySlots } from '../../../lib/domain/slots'
import { localDateOf } from '../../../lib/domain/time'
import { adminClient, clubRow, type TestUser } from './admin'

export type PlayingBooking = { bookingId: string; courtName: string; time: string }

// A booking of the slot being played right now, inserted directly (the service role skips the rules that keep
// a booking from starting in the past). Null outside the club's hours, or when the slot ends within 5 minutes
// (it would move to "Pendientes de cobro" in the middle of the test).
export async function insertPlayingBooking(user: TestUser, price = 1200): Promise<PlayingBooking | null> {
  const admin = adminClient()
  const club = await clubRow(admin)
  const now = new Date()
  const schedule = { timezone: club.timezone, opensAt: club.opens_at, closesAt: club.closes_at, slotMinutes: club.slot_minutes }
  const slot = daySlots(schedule, localDateOf(now, club.timezone)).find(
    (candidate) => candidate.startsAt <= now && candidate.endsAt.getTime() - now.getTime() > 5 * 60_000,
  )
  if (!slot) return null

  const { data: courts, error } = await admin
    .from('courts')
    .select('id, name')
    .eq('club_id', club.id)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  const period = `[${slot.startsAt.toISOString()},${slot.endsAt.toISOString()})`
  for (const court of courts) {
    const occupancy = await admin
      .from('court_occupancy')
      .insert({ club_id: club.id, court_id: court.id, kind: 'booking', period, created_by: user.id })
      .select('id')
      .single()
    if (occupancy.error?.code === '23P01') continue
    if (occupancy.error) throw occupancy.error

    const booking = await admin
      .from('bookings')
      .insert({
        club_id: club.id,
        court_id: court.id,
        period,
        player_id: user.id,
        source: 'online',
        price,
        occupancy_id: occupancy.data.id,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (booking.error) throw booking.error
    return { bookingId: booking.data.id, courtName: court.name, time: slot.label }
  }
  throw new Error('No hay ninguna cancha libre en el turno de ahora: corré node scripts/demo-data.mjs --clean')
}

export async function paymentsOf(bookingId: string) {
  const { data, error } = await adminClient()
    .from('payments')
    .select('method, amount, status, payer_position, receipt_path')
    .eq('booking_id', bookingId)
    .order('amount')
  if (error) throw error
  return data
}
```

- [ ] **Step 2: El spec**

Create `tests/e2e/club-home.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { insertPlayingBooking, paymentsOf } from './support/club-home'

test('reception charges each player of the court in play from the Inicio', async ({ page }) => {
  const holder = await createMember({ name: 'Lucía Inicio E2E', prefix: 'inicio-titular' })
  const partner = await createMember({ name: 'Tomás Inicio E2E', prefix: 'inicio-companero' })
  const reception = await createMember({ name: 'Recepción Inicio E2E', prefix: 'inicio-recepcion', role: 'reception' })
  const playing = await insertPlayingBooking(holder)
  test.skip(playing === null, 'El club está cerrado o el turno de ahora termina en menos de 5 minutos')
  if (!playing) return

  // /club opens the Inicio, and the court in play is there.
  await signInWithMagicLink(page, reception.email, '/club')
  await expect(page).toHaveURL(/\/club\/inicio$/)
  const inPlay = page.getByRole('region', { name: 'En cancha ahora' })
  const card = inPlay.getByRole('article').filter({ hasText: holder.name })
  await expect(card).toContainText(playing.courtName)
  await expect(card.getByRole('progressbar')).toBeVisible()

  // Completar jugadores: a member and a name; player 4 stays unnamed.
  await card.getByRole('button', { name: 'Completar jugadores' }).click()
  const sheet = page.getByRole('dialog', { name: 'Jugadores del turno' })
  await sheet.getByRole('combobox', { name: 'Jugador 2' }).fill('Tomás Inicio')
  await sheet.getByRole('option', { name: partner.name }).click()
  await sheet.getByRole('combobox', { name: 'Jugador 3' }).fill('Pepe E2E')
  await sheet.getByRole('button', { name: 'Guardar jugadores' }).click()
  await expect(card.getByRole('status')).toHaveText('Jugadores guardados.')
  const players = card.getByRole('list', { name: 'Jugadores' })
  await expect(players).toContainText(partner.name)
  await expect(players).toContainText('Pepe E2E')
  await expect(players).toContainText('Jugador 4')

  // His share in cash.
  await card.getByRole('button', { name: `Cobrar $300 a ${partner.name}` }).click()
  await card.getByRole('group', { name: `Cobrar $300 a ${partner.name}` }).getByRole('button', { name: 'Efectivo' }).click()
  await expect(card.getByRole('status')).toHaveText('Cobramos $300 en efectivo.')
  await expect(players.getByRole('listitem').filter({ hasText: partner.name })).toContainText('Pagó')

  // Everything left by transfer: the card is paid.
  await card.getByRole('button', { name: 'Cobrar todo lo que falta ($900)' }).click()
  await card.getByRole('group', { name: 'Cobrar todo lo que falta ($900)' }).getByRole('button', { name: 'Me transfirió' }).click()
  await expect(card.getByRole('status')).toHaveText('Cobramos $900 por transferencia.')
  await expect(players.getByText('Pagó', { exact: true })).toHaveCount(4)
  await expect(card.getByRole('button', { name: /^Cobrar/ })).toHaveCount(0)

  // Both are confirmed payments, the transfer without a receipt: Cobros has nothing to confirm for them.
  expect(await paymentsOf(playing.bookingId)).toEqual([
    { method: 'cash', amount: 300, status: 'confirmed', payer_position: 2, receipt_path: null },
    { method: 'transfer', amount: 900, status: 'confirmed', payer_position: null, receipt_path: null },
  ])
  await page.getByRole('link', { name: 'Cobros' }).click()
  await expect(page.getByRole('region', { name: 'Transferencias para confirmar' })).not.toContainText(holder.name)

  // The Grilla shows the same booking paid, with the same players.
  await page.getByRole('link', { name: 'Grilla' }).click()
  const cell = page.getByRole('button', { name: `${playing.courtName}, ${playing.time}: ${holder.name}` })
  await expect(cell).toContainText('Pagada')
  await cell.click()
  const detail = page.getByRole('dialog', { name: holder.name })
  await expect(detail.getByRole('list', { name: 'Jugadores' })).toContainText(partner.name)
  await expect(detail.getByText('Pagó', { exact: true })).toHaveCount(4)
})
```

- [ ] **Step 3: Correrlo**

Run:
```bash
node scripts/demo-data.mjs --clean
npx playwright test tests/e2e/club-home.spec.ts --workers=1
```
Expected: `1 passed` entre las 08:00 y las 22:55 de Montevideo; fuera de ese horario `1 skipped`.

De noche, para correrlo igual en local (solo la base local; se deshace al final):
```bash
docker exec supabase_db_padel-management psql -U postgres -c "update public.clubs set opens_at = '00:00', closes_at = '24:00' where slug = 'rustic'"
npx playwright test tests/e2e/club-home.spec.ts --workers=1
docker exec supabase_db_padel-management psql -U postgres -c "update public.clubs set opens_at = '08:00', closes_at = '23:00' where slug = 'rustic'"
```
Expected: `1 passed`; el último comando deja Rustic otra vez de 08:00 a 23:00.

- [ ] **Step 4: Toda la suite e2e en serie**

Run:
```bash
node scripts/demo-data.mjs --clean
npx playwright test --workers=1
```
Expected: todos PASS (o el nuevo `skipped` fuera de horario). `reception-grid.spec.ts` y `open-match.spec.ts` no tocaban el cobro de la Grilla: no cambian.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/support/club-home.ts tests/e2e/club-home.spec.ts
git commit -m "test(inicio): e2e, reception completes the players and charges each share from the Inicio"
```

---

### Task 14: Cierre

**Files:**
- Modify: `docs/features/inicio-del-club/plan.md` (frontmatter `status: done`)
- Modify: `docs/features/inicio-del-club/design.md` (frontmatter `status: done`)

- [ ] **Step 1: Todo en verde**

Run:
```bash
npm run db:reset
npm run test:db
npm test
npm run lint
npm run typecheck
npm run build
git status --short
```
Expected: todo PASS; `git status` vacío salvo lo de esta task.

- [ ] **Step 2: Revisión**

Correr `/team-setup:discipline-check` sobre el diff de la rama (`git diff main...HEAD`). Si un arreglo toca SQL, va en `supabase/migrations/20261020000130_inicio_review_fixes.sql` (nunca se edita una migración aplicada), con su caso en el pgTAP que corresponda.

- [ ] **Step 3: Docs y commit**

En los frontmatter de `docs/features/inicio-del-club/plan.md` y `design.md`, cambiar `status: in-progress` / `status: approved` por `status: done`.

```bash
git add docs/features/inicio-del-club/plan.md docs/features/inicio-del-club/design.md
git commit -m "docs: the club home is done"
git push
```
Marcar el PR como listo desde GitHub.

---

## Acceptance criteria

- [ ] `/club` y "Panel del club" llevan al Inicio; "Inicio" es la primera pestaña para recepción y admin.
- [ ] En cancha ahora: una tarjeta por turno en juego con cancha, horario, barra de lo que falta y los 4 jugadores, cada uno "Pagó" o "Cobrar $X"; bloqueos, torneos, campeonatos y day use como una línea sin cobro; vacío con el próximo turno.
- [ ] Próximos (90 minutos) con el mismo formato; Pendientes de cobro con lo jugado hoy que se debe y la línea de transferencias por confirmar con link a Cobros; Lo que pasa hoy con partidos armándose, torneo o campeonato, day use y lista de espera, cada uno con link, y oculto si no hay nada.
- [ ] Completar jugadores: socio de la lista o nombre libre, 2 a 4; quien pagó no se cambia; ni socio repetido ni el que reservó; socio de otro club no.
- [ ] Cobro por jugador (parte = precio / 4, el resto al jugador 1) y "Cobrar todo lo que falta", en efectivo o "Me transfirió" (confirmada, sin comprobante), solo con los medios habilitados; "Ya estaba pagado." en la tarjeta si otro cobró antes.
- [ ] Partidos abiertos: el mismo formato, cobro por jugador también por transferencia.
- [ ] El detalle de la Grilla usa el mismo bloque.
- [ ] Se refresca con Realtime y cada minuto.
- [ ] pgTAP, Vitest, lint, typecheck, build y e2e en verde.

## Plan revisions

(append-only)

- **v1 (2026-10-20)**: plan inicial. Antes de escribirlo se implementó y validó entero en local: `db reset` con las 3 migraciones, `booking_players.test.sql` (26) y `booking_charges.test.sql` (30) en verde y `npm run test:db` con 69 archivos y 1196 tests; Vitest con 184 archivos y 1025 tests; `tsc` y `lint` limpios; `club-home.spec.ts` pasó con `--workers=1` (de noche, con el horario del club abierto como en la Task 13, Step 3) y la suite e2e entera en serie pasó con 14 specs y el nuevo saltado (eran las 23:30); `npm run build` lista `/club/inicio`. La validación se descartó (`git checkout` + `git clean`, sin stash) y la base local volvió a 08:00–23:00; el árbol queda en el commit de este plan.
