---
feature: lista-de-espera
type: plan
status: in-progress
date: 2026-10-05
branch: feat/lista-de-espera
references: ./design.md, ../fase-3b-day-use/plan.md, ../fase-1-reservas/design.md, ../fase-2-partidos/design.md
---

# Lista de espera Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/team-setup:execute` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un jugador se anote para que le avisen si se libera un turno (día, rango y canchas), que al liberarse el turno quede retenido para el primero de la lista con un aviso en la app y por mail, que lo reserve o lo pase, y que recepción vea los turnos retenidos y la demanda del día.

**Architecture:** Igual que las fases anteriores: cada escritura es una función `security definer` de Postgres con `search_path = ''` y códigos de error estables (`private.fail`). Una retención es una ocupación más (`kind = 'hold'`, con `expires_at`), así que la restricción de exclusión impide reservarla. Un *constraint trigger* diferido (`after delete` en `court_occupancy`) corre al confirmar la transacción y llama a `private.offer_freed`, que retiene el turno para el primero de la lista (o avisa a todos si falta poco); `pg_cron` vence retenciones y esperas cada minuto. La base no llama a nadie: escribe los avisos en `notifications` (una *outbox*) y Next los manda por mail (Resend con `fetch`, detrás de `EmailSender`) desde `after()` en cada acción y desde `POST /api/avisos/enviar`, que un cron externo llama cada minuto con un secreto. Next lee con la sesión del usuario (RLS); la *outbox* usa la service role solo a través de dos funciones que nadie más puede ejecutar.

**Tech Stack:** Next.js 16.3 (App Router, Route Handlers, `after`), React 19, TypeScript, Tailwind 4, Supabase (Postgres 17, Auth, Realtime, `pg_cron`), `@supabase/ssr`, `@supabase/supabase-js` (service role, solo en el servidor), Resend por HTTP (`fetch`, sin SDK), Vitest + Testing Library, pgTAP, Playwright con Mailpit.

---

## Antes de empezar

- Rama: `feat/lista-de-espera` (ya existe, con el diseño commiteado en `cdc7612` sobre el merge del PR #17). Commits chicos; cada corte termina en verde. Se ejecuta de corrido, sin pedir confirmación entre cortes.
- Docker Desktop corriendo. El CLI de Supabase es devDependency: `npx supabase …` o los scripts de npm (`npm run test:db`, `npm run db:reset`, `npm run db:types`). No hay CLI global. `gh` no está instalado: el PR se abre y se marca listo desde GitHub.
- Windows: **los archivos con barras invertidas (`\ir` en los tests pgTAP, regex en TypeScript) se escriben con la herramienta Write**, nunca con heredoc ni `sed`. Las rutas con paréntesis o corchetes (`app/(jugador)/…`) van entre comillas en bash.
- Next 16: antes de usar una API de Next, leer su guía en `node_modules/next/dist/docs/01-app/` (ver `AGENTS.md`). Las usadas acá: `after` (`03-api-reference/04-functions/after.md`), Route Handlers (`03-api-reference/03-file-conventions/route.md`), Server Actions (`01-getting-started/07-mutating-data.md`), `searchParams` como Promise (`03-api-reference/03-file-conventions/page.md`).
- Producción: las migraciones llegan con el merge (`migrate.yml`). **Nunca** correr `supabase link`, `db push` ni nada contra producción desde la máquina local (Miguel corre los comandos de producción). Las migraciones ya aplicadas **no se editan**: todo cambio es una migración nueva.
- Migraciones nuevas: `supabase/migrations/20261005000100_*.sql` … `20261005000150_*.sql` (todas posteriores a `20261003000100_club_logo.sql`). Un arreglo de la revisión final va en `20261005000160_*.sql`. **El valor nuevo del enum (`hold`) va solo en `20261005000100`**: Postgres no deja usar un valor de enum en la misma transacción que lo agrega, y el CLI aplica cada archivo en su propia transacción. Si `db reset` falla con `unsafe use of new value "hold"`, es que algo de `…110` en adelante quedó en el archivo `…100`.
- Docs en español; identificadores, comentarios de SQL y de código en inglés.
- pgTAP: un test se corre con `npx supabase test db supabase/tests/database/<archivo>.test.sql`; todos con `npm run test:db`. Los tests de la lista de espera incluyen `\ir helpers/slot.psql`, `\ir helpers/club.psql`, `\ir helpers/match.psql`, `\ir helpers/day_use.psql` y, desde esta fase, `\ir helpers/waitlist.psql`.
- Cada migración nueva se aplica con `npm run db:reset` y después `npm run db:types` regenera `lib/supabase/database.types.ts`, que CI compara byte a byte.
- Datos del fixture pgTAP (club T, `helpers/club.psql` + `helpers/match.psql` + `helpers/day_use.psql`): grilla 08:00–23:00 cada 90 min (08:00, 09:30 … 21:30; 10 turnos), ventana de 14 días, zona `America/Montevideo`, máximo 2 reservas activas, precios $1.200 y $1.600 desde las 18:30; canchas `c0000000-0000-0000-0000-000000000001` (Cancha 1) y `…0002` (Cancha 2). Personas: Ana `…a1`, Bruno `…b1`, Gabi `…a2`, Hugo `…a3`, Iván `…a4`, Juli `…a5` (jugadores), Carla `…c1` (recepción), Dani `…d1` (admin), Omar `…f1` (no es miembro), Eva `…e1` (admin del club B, "staff de otro club"). En este documento `…a1` abrevia `00000000-0000-0000-0000-0000000000a1`; **en los archivos va siempre el uuid completo**.
- **El trigger diferido en los tests pgTAP**: cada test corre en una transacción que termina en `rollback`, así que un *constraint trigger* `initially deferred` nunca dispararía solo. Para que corra en el medio del test se fuerza con dos líneas, siempre juntas:
  ```sql
  set constraints all immediate;
  set constraints all deferred;
  ```
  La primera corre ahí mismo los eventos pendientes (la regla de `SET CONSTRAINTS`: el cambio a `IMMEDIATE` es retroactivo); la segunda vuelve al modo normal, para que lo que sigue (por ejemplo reclamar, que borra la retención y crea la reserva en la misma transacción) se comporte como en producción. No hay otras restricciones diferibles en el esquema (se verificó con `grep -ri deferrable supabase/migrations`).
- `now()` es fijo dentro de la transacción de cada test. Las reglas que dependen de la hora (cuánto falta para el turno, vencimientos) reciben `p_now` con `now()` por defecto, así los tests las prueban con horas fijas sin depender de cuándo corren.
- Soporte e2e (`tests/e2e/support`): `createMember`, `signedInClient`, `clubRow`, `adminClient`, `signInWithMagicLink`, `bookFirstFreeSlot`. Lección de la fase 3a: **en e2e se navega con `page.goto`, nunca con clicks en las pestañas** (el indicador de Next tapa la de abajo a la izquierda).
- jsdom: los `select` se cambian con `userEvent.selectOptions`; las cuentas regresivas se prueban con `vi.useFakeTimers()` y `act(() => vi.advanceTimersByTime(…))`.

## Decisiones que este plan toma (y que el diseño no fijaba)

| Tema | Decisión | Por qué |
| --- | --- | --- |
| Cuándo corre `offer_freed` | *Constraint trigger* `after delete` en `court_occupancy`, `deferrable initially deferred`: corre al confirmar la transacción y mira si el turno **sigue** libre | Reclamar (borra la retención y crea la reserva) y regenerar un day use (borra y vuelve a crear ocupaciones) liberan y ocupan en la misma transacción: un trigger inmediato retendría un turno que un instante después se ocupa y haría fallar la escritura. Diferido, solo ve lo que de verdad quedó libre |
| Si `offer_freed` falla | El trigger atrapa el error y deja un `warning`: liberar nunca falla por la lista de espera | Cancelar una reserva no puede romperse por un aviso |
| Rango de una espera | `from_time` = primer inicio aceptado, `to_time` = último fin aceptado: un turno sirve si empieza a `from_time` o después y termina a `to_time` o antes. "Desde" ofrece inicios de turno; "Hasta", fines de turno | "Entre 18 y 21" se lee como la franja en la que quiere jugar |
| Todas las canchas marcadas | `create_slot_wait` guarda `court_ids = '{}'` (cualquier cancha) | Una cancha que el club agrega después también cuenta |
| Tocar una celda "Ocupada" | Abre la ventana con ese día, ese turno y **esa cancha** | Es "avisame si se libera esta" |
| Turno libre al anotarse | `create_slot_wait` responde `slot_available` si en el rango y canchas hay un turno futuro, con precio y libre | Diseño: "Hay un turno libre, reservalo" |
| Rango sin turnos | Un rango que no contiene ningún turno entero y futuro de la grilla es `invalid_input` | No hay nada que esperar |
| Orden de la lista | `created_at`, desempatado por `id` | Diseño: el primero que se anotó |
| A quién no se le retiene | Al que ya tiene una retención activa, al que ya tuvo **ese** turno en **esa** cancha (lo rechazó, venció o recepción lo pasó) y al que está ocupado a esa hora (`private.is_busy`) | Si no, "No me sirve" se lo devolvería a la misma persona |
| Una retención por jugador | Índice único parcial `slot_holds (player_id) where status = 'active'` y candado por club (`pg_advisory_xact_lock('waitlist:' || club)`) en `offer_freed` | Dos canchas liberadas juntas nunca le dan dos retenciones al mismo |
| Cuánto dura | `private.hold_minutes(inicio, ahora)`: más de 2 h → 15 min; entre 45 min y 2 h → 5 min; 45 min o menos → sin retención (`slot_free_now` a toda la lista, una vez por jugador, cancha y turno) | Diseño |
| Quién la tiene, en la grilla | La ocupación `hold` lleva en `note` el nombre del jugador | `note` ya es solo para el staff (privilegios de columna y `occupancy_notes`); el jugador ve "Ocupada" |
| `slot_holds` | Suma `player_id` (para RLS y para el índice de una activa por jugador) y `starts_at` generada; `ended_at` en esperas y retenciones | RLS simple, y las pantallas no leen rangos de Postgres |
| "Pasar al siguiente" | `release_slot_hold(p_occupancy_id)` | La grilla conoce la ocupación, no la retención |
| Precio al reclamar | `private.slot_price` del turno, con las mismas reglas que `book_slot` (ocupado a esa hora, máximo de reservas activas, sin precio); vencida responde `hold_expired` | Diseño: "una reserva más" |
| Orden de bloqueo | Espera y después retención (`claim_slot_hold` y `cancel_slot_wait`) | Que nunca se traben entre ellas |
| Tope de 3 | Cuenta las esperas `waiting` cuyo horario no terminó; `create_slot_wait` responde `too_many_waits` | Diseño |
| Vencimientos | `private.expire_waitlist(p_now)` cada minuto (`pg_cron`, `expire-waitlist`): retenciones vencidas → `expired` y se borra su ocupación (y cualquier ocupación `hold` vencida que haya quedado suelta); esperas cuyo `to_time` pasó → `expired` | Diseño |
| Envío de mails | `claim_notification_emails(p_limit)` toma pendientes y fallidos con menos de 3 intentos, con `for update skip locked`, suma un intento y los reserva 5 minutos; `finish_notification_email(id, status)` los marca. Las dos solo para `service_role` | Dos corridas nunca mandan el mismo; el mail del jugador sale de `auth.users` sin pasar por la API |
| Cuándo se manda | `revalidateBookings()` (que llaman todas las escrituras) agenda `flushOutbox()` con `after()`; además `POST /api/avisos/enviar` con `Authorization: Bearer <NOTIFY_SECRET>` | Cualquier escritura puede liberar un turno; el cron externo cubre lo que libera `pg_cron` |
| Sin configurar | Sin `SUPABASE_SERVICE_ROLE_KEY`, `flushOutbox` no hace nada; sin `RESEND_API_KEY` o `EMAIL_FROM`, marca los avisos `skipped`; una retención que ya venció o un turno que ya empezó tampoco se manda (`skipped`) | La espera funciona igual con el aviso en la app |
| Colores del mail | Los de Rustic (`#021716`, `#FCB021`) y el logo del club si tiene | El club no guarda colores propios; app de un solo club |
| /avisos | Abrirla llama a la acción `markNotificationsRead` desde el cliente (`MarkRead`), que revalida y apaga la campana | Una página no escribe mientras se renderiza |
| Tiempo real | `notifications` y `slot_waits` en Realtime. `LiveNotifications` (layout del jugador) recarga cuando le llega un aviso; `LiveOccupancy` escucha también `slot_waits` (panel "En espera") | Banner y campana sin recargar |
| Estilo de la retención | `CELL_STYLES.hold`: borde punteado ámbar (`border-dotted border-accent`) y "Retenido" en la leyenda del club | Diseño |
| PR | Un PR borrador desde el corte 1 (Task 3), listo al final | Igual que las fases anteriores |

## Mapa de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `supabase/migrations/20261005000100_hold_kind.sql` | `occupancy_kind` suma `hold` (solo eso) |
| `supabase/migrations/20261005000110_waitlist.sql` | `court_occupancy.expires_at`, enums, tablas `slot_waits`, `slot_holds`, `notifications`, RLS y permisos |
| `supabase/migrations/20261005000120_waitlist_offer.sql` | `day_slots`, `hold_minutes`, `wait_fits`, `announce_free_slot`, `offer_freed`, el trigger diferido, `expire_waitlist` y su cron |
| `supabase/migrations/20261005000130_waitlist_rpcs.sql` | `end_hold`, `create_slot_wait`, `cancel_slot_wait`, `claim_slot_hold`, `decline_slot_hold`, `release_slot_hold`, `mark_notifications_read` |
| `supabase/migrations/20261005000140_notification_outbox.sql` | `claim_notification_emails`, `finish_notification_email` (service role) |
| `supabase/migrations/20261005000150_realtime_waitlist.sql` | `notifications` y `slot_waits` en Realtime |
| `supabase/tests/database/helpers/waitlist.psql` | `make_wait`, `make_hold`, `active_hold`, `hold_occupancy` |
| `supabase/tests/database/waitlist_*.test.sql`, `notification_outbox.test.sql`, `realtime_waitlist.test.sql` | pgTAP |
| `lib/domain/errors.ts` | `slot_available`, `too_many_waits`, `hold_expired` |
| `lib/domain/grid.ts` | Tipo `hold`, su etiqueta y `expiresAt` |
| `lib/domain/waitlist.ts` | Esperas, rangos, retención, cuenta regresiva, textos de los avisos |
| `lib/notify/email.ts` | `EmailSender`, `resendSender`, `emailSenderFromEnv` |
| `lib/notify/messages.ts` | `PendingEmail`, `buildEmail` (asunto, HTML y texto) |
| `lib/notify/send-pending.ts` | `sendPending`: toma, manda y marca (con dependencias inyectadas) |
| `lib/notify/outbox.ts` | `flushOutbox`: conecta `sendPending` con Supabase (service role) y Resend |
| `lib/supabase/admin.ts` | Cliente con la service role (servidor, o `null` sin la clave) |
| `lib/actions/revalidate.ts` | `after(flushOutbox)` en cada escritura |
| `app/api/avisos/enviar/route.ts` | El envío con secreto, para el cron externo |
| `lib/data/waitlist.ts` | Esperas y retención del jugador, esperas del día, avisos y no leídos |
| `lib/data/day.ts` | `expires_at` en la grilla |
| `lib/actions/waitlist.ts` | Acciones del jugador: anotarse, cancelar, reservar, no me sirve, marcar leídos |
| `app/(club)/club/grilla/actions.ts` | `releaseSlotHold` |
| `components/waitlist/*` | `WaitSheet`, `WaitingCard`, `HoldBanner`, `NotificationBell`, `NotificationList` |
| `components/club/waiting-panel.tsx` | Panel "En espera" |
| `components/live/live-notifications.tsx`, `components/live/live-occupancy.tsx` | Avisos y esperas en vivo |
| `components/booking/{slot-grid,cell-styles,legend}.tsx`, `components/club/occupancy-detail-sheet.tsx` | La retención en la grilla, "Avisame" en celdas ocupadas, "Pasar al siguiente" |
| `components/brand/club-header.tsx`, `components/ui/icon.tsx` | Lugar para la campana; ícono `bell` |
| `app/(jugador)/{layout,page}.tsx`, `app/(jugador)/reservar/{page,reservar-board}.tsx`, `app/(jugador)/avisos/{page,mark-read}.tsx` | Pantallas del jugador |
| `app/(club)/club/grilla/{page,club-board}.tsx` | Grilla del club con retenciones y "En espera" |
| `tests/e2e/support/global-setup.ts`, `tests/e2e/waitlist.spec.ts` | Limpieza y flujo e2e |
| `.env.example` | Variables nuevas |

## Secuencia por cortes

| Corte | Tasks | Resultado | Cómo se prueba |
| --- | --- | --- | --- |
| 1. Modelo | 1–3 | Tipo `hold`, esperas, retenciones y avisos con RLS | pgTAP |
| 2. Motor y RPCs | 4–7 | Retener al liberar, vencer, anotarse, reservar, pasar, outbox, en vivo | pgTAP |
| 3. Dominio TS | 8–12 | Errores, reglas y textos, mail con Resend, envío | Vitest |
| 4. Datos, acciones y envío | 13–16 | Service role, `after`, ruta con secreto, carga y Server Actions | Vitest + typecheck |
| 5. Pantallas del jugador | 17–22 | Ventana para anotarse, /reservar, Inicio (banner y "Esperando turno"), campana, /avisos | Vitest |
| 6. Pantallas del club | 23–25 | Retención en la grilla, "Pasar al siguiente", "En espera" | Vitest |
| 7. e2e y cierre | 26–28 | Flujo completo; variables; PR listo | Playwright |

---

## Corte 1: Modelo

### Task 1: Punto de partida en verde

**Files:** ninguno.

- [ ] **Step 1: Rama y stack local**

Run:
```bash
git branch --show-current
git log --oneline -2
npx supabase start
npm run db:reset
```
Expected: `feat/lista-de-espera`; el último commit es `docs: design the slot waitlist` sobre el merge del PR #17; `db reset` aplica las migraciones hasta `20261003000100_club_logo.sql` y `seed.sql`.

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

### Task 2: Esperas, retenciones y avisos en la base

**Files:**
- Create: `supabase/tests/database/helpers/waitlist.psql`
- Create: `supabase/tests/database/waitlist_schema.test.sql`
- Create: `supabase/migrations/20261005000100_hold_kind.sql`
- Create: `supabase/migrations/20261005000110_waitlist.sql`

- [ ] **Step 1: Test helper** (con la herramienta Write)

`supabase/tests/database/helpers/waitlist.psql`:
```sql
-- Lista de espera fixture. Include it after slot.psql, club.psql, match.psql and day_use.psql:
--   \ir helpers/waitlist.psql
-- Waits and holds are inserted as postgres (skips the RPC rules on purpose). Unless told otherwise a
-- wait is for tomorrow from 18:30 to 23:00 on any court of club T. Pass p_created_at to set the order
-- of the line (now() is the same for the whole test).
create procedure test_helpers.make_wait(
  p_id uuid,
  p_player_id uuid,
  p_days integer default 1,
  p_from time default '18:30',
  p_to time default '23:00',
  p_courts uuid[] default array[]::uuid[],
  p_created_at timestamptz default now()
)
language sql
as $$
  insert into public.slot_waits (id, club_id, player_id, on_date, from_time, to_time, court_ids, created_at)
  values (p_id, 'a0000000-0000-0000-0000-000000000001', p_player_id, test_helpers.today() + p_days, p_from, p_to,
          p_courts, p_created_at);
$$;

-- A hold for the wait's player, as private.offer_freed leaves it: the occupancy (with the player's
-- name as its note) and the hold row.
create procedure test_helpers.make_hold(
  p_id uuid,
  p_wait_id uuid,
  p_court_id uuid,
  p_period tstzrange,
  p_expires_at timestamptz default now() + interval '15 minutes'
)
language plpgsql
as $$
declare
  v_player_id uuid;
  v_occupancy_id uuid;
begin
  select player_id into v_player_id from public.slot_waits where id = p_wait_id;
  insert into public.court_occupancy (club_id, court_id, kind, period, expires_at, note)
  values ('a0000000-0000-0000-0000-000000000001', p_court_id, 'hold', p_period, p_expires_at,
          (select display_name from public.profiles where id = v_player_id))
  returning id into v_occupancy_id;
  insert into public.slot_holds (id, club_id, wait_id, player_id, occupancy_id, court_id, period, expires_at)
  values (p_id, 'a0000000-0000-0000-0000-000000000001', p_wait_id, v_player_id, v_occupancy_id, p_court_id,
          p_period, p_expires_at);
end;
$$;

-- The active hold of a player (null when she has none). Call it as postgres: RLS applies otherwise.
create function test_helpers.active_hold(p_player_id uuid)
returns uuid
language sql
stable
as $$
  select id from public.slot_holds where player_id = p_player_id and status = 'active';
$$;

-- The occupancy that holds the court for a hold.
create function test_helpers.hold_occupancy(p_hold_id uuid)
returns uuid
language sql
stable
as $$
  select occupancy_id from public.slot_holds where id = p_hold_id;
$$;
```

- [ ] **Step 2: Write the failing test** (con la herramienta Write)

`supabase/tests/database/waitlist_schema.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/waitlist.psql
select plan(24);

select has_table('public', 'slot_waits', 'slot_waits exists');
select has_table('public', 'slot_holds', 'slot_holds exists');
select has_table('public', 'notifications', 'notifications exists');
select ok('hold' = any (enum_range(null::public.occupancy_kind)::text[]), 'a hold is one more kind of occupancy');

select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'hold',
             test_helpers.slot(1, '08:00', 90)) $$,
  '23514', null, 'a hold always expires');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, expires_at)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'block',
             test_helpers.slot(1, '08:00', 90), now()) $$,
  '23514', null, 'only holds expire');
select throws_ok(
  $$ insert into public.slot_waits (club_id, player_id, on_date, from_time, to_time)
     values ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1',
             test_helpers.today() + 1, '21:00', '18:00') $$,
  '23514', null, 'a wait starts before it ends');

-- Ana waits tomorrow evening, Bruno the day after; Ana holds Cancha 1 tomorrow at 19:00.
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1');
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 2);
call test_helpers.make_hold('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001', test_helpers.slot(1, '19:00', 90));

select is(
  (select starts_at from public.slot_holds where id = 'e1000000-0000-0000-0000-000000000001'),
  test_helpers.at(1, '19:00'), 'a hold knows when its slot starts');
select is(
  (select note from public.court_occupancy
   where id = test_helpers.hold_occupancy('e1000000-0000-0000-0000-000000000001')),
  'Ana', 'the held court carries the player''s name, for staff');
select throws_ok(
  $$ call test_helpers.make_hold('e1000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001',
       'c0000000-0000-0000-0000-000000000002', test_helpers.slot(1, '20:30', 90)) $$,
  '23505', null, 'a player has one active hold at a time');
select throws_ok(
  $$ call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
       test_helpers.slot(1, '19:00', 90), '00000000-0000-0000-0000-0000000000b1') $$,
  '23P01', null, 'a held court cannot be taken');

insert into public.notifications (id, club_id, user_id, kind, link) values
  ('e2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 'slot_held', '/'),
  ('e2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000b1', 'slot_free_now', '/reservar');
select is(
  (select email_status::text from public.notifications where id = 'e2000000-0000-0000-0000-000000000001'),
  'pending', 'a new aviso waits to be mailed');
select throws_ok(
  $$ insert into public.notifications (club_id, user_id, kind, link)
     values ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'slot_held',
             'https://otro.test') $$,
  '23514', null, 'an aviso links inside the app');

-- Ana, player
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select results_eq(
  'select id from public.slot_waits',
  $$ values ('e0000000-0000-0000-0000-000000000001'::uuid) $$,
  'a player reads her own waits');
select results_eq(
  'select id from public.slot_holds',
  $$ values ('e1000000-0000-0000-0000-000000000001'::uuid) $$,
  'and her own holds');
select results_eq(
  'select id from public.notifications',
  $$ values ('e2000000-0000-0000-0000-000000000001'::uuid) $$,
  'and her own avisos');
select throws_ok(
  $$ insert into public.slot_waits (club_id, player_id, on_date, from_time, to_time)
     values ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1',
             test_helpers.today() + 3, '18:30', '23:00') $$,
  '42501', null, 'nobody writes waits directly');
select throws_ok(
  $$ update public.notifications set read_at = now() $$,
  '42501', null, 'nor marks avisos read directly');
select ok(
  (select expires_at is not null from public.court_occupancy where kind = 'hold'),
  'members read until when a court is held');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is((select count(*)::int from public.slot_waits), 2, 'reception reads every wait of the club');
select is((select count(*)::int from public.slot_holds), 1, 'and every hold');
select is((select count(*)::int from public.notifications), 0, 'but not the players'' avisos');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';

select is(
  (select count(*)::int from public.slot_waits) + (select count(*)::int from public.slot_holds), 0,
  'staff of another club reads no waits or holds');

-- Anonymous visitor
set local role anon;

select throws_ok($$ select count(*) from public.slot_waits $$, '42501', null, 'anon reads no waits');

select * from finish();
rollback;
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/waitlist_schema.test.sql`
Expected: FAIL (`type "public.slot_waits" does not exist` al cargar el helper, o `relation "public.slot_waits" does not exist`).

- [ ] **Step 4: El valor nuevo del enum, en su propia migración**

`supabase/migrations/20261005000100_hold_kind.sql`:
```sql
-- Lista de espera, part 0: a hold is one more kind of occupancy. Alone in its file: Postgres does not
-- let a transaction use an enum value it just added, and the CLI runs each migration in one transaction.
alter type public.occupancy_kind add value 'hold';
```

- [ ] **Step 5: Tablas, RLS y permisos**

`supabase/migrations/20261005000110_waitlist.sql`:
```sql
-- Lista de espera, part 1: the data. A player waits for a slot (a date, a range and some courts); when
-- one frees up, the first in line gets it held for a few minutes (an occupancy of kind 'hold', so the
-- exclusion constraint keeps everyone else out) and an aviso, in the app and by mail. Every write goes
-- through the functions of the next migrations: authenticated only reads.

-- A hold expires; nothing else does.
alter table public.court_occupancy
  add column expires_at timestamptz,
  add constraint court_occupancy_hold_expires check ((kind = 'hold') = (expires_at is not null));
create index court_occupancy_hold_expires_idx on public.court_occupancy (expires_at) where kind = 'hold';
-- Members see until when a court is held (the grid, Realtime). Who holds it goes in note: staff only.
grant select (expires_at) on public.court_occupancy to authenticated;

create type public.slot_wait_status as enum ('waiting', 'booked', 'expired', 'cancelled');
create type public.slot_hold_status as enum ('active', 'claimed', 'declined', 'expired', 'released');
create type public.notification_kind as enum ('slot_held', 'slot_free_now');
create type public.email_status as enum ('pending', 'sent', 'failed', 'skipped');

-- "Avisame si se libera": one date, a range of the grid and some courts (none = any court).
-- A slot fits when it starts at from_time or later and ends at to_time or earlier.
create table public.slot_waits (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  on_date date not null,
  from_time time not null,
  to_time time not null,
  court_ids uuid[] not null default '{}',
  status public.slot_wait_status not null default 'waiting',
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  -- Target for the composite FK in slot_holds.
  unique (id, club_id),
  constraint slot_waits_times check (from_time < to_time),
  constraint slot_waits_courts check (cardinality(court_ids) <= 20 and array_position(court_ids, null) is null)
);
-- Who waits for a freed slot: the club's waiting line for a date.
create index slot_waits_club_date_idx on public.slot_waits (club_id, on_date) where status = 'waiting';
create index slot_waits_player_id_idx on public.slot_waits (player_id);
alter table public.slot_waits enable row level security;

-- Each time a slot was held for someone: the history of the waitlist and the base of the demand panel.
create table public.slot_holds (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  wait_id uuid not null,
  player_id uuid not null references public.profiles (id) on delete cascade,
  occupancy_id uuid unique references public.court_occupancy (id) on delete set null,
  court_id uuid not null,
  period tstzrange not null,
  starts_at timestamptz generated always as (lower(period)) stored,
  expires_at timestamptz not null,
  status public.slot_hold_status not null default 'active',
  booking_id uuid references public.bookings (id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint slot_holds_wait_in_club
    foreign key (wait_id, club_id) references public.slot_waits (id, club_id) on delete cascade,
  constraint slot_holds_court_in_club
    foreign key (court_id, club_id) references public.courts (id, club_id) on delete cascade,
  -- Only a claimed hold points at the booking it became.
  constraint slot_holds_booking check (status = 'claimed' or booking_id is null)
);
-- One active hold per player: a freed slot goes to the next one in line instead.
create unique index slot_holds_one_active_per_player on public.slot_holds (player_id) where status = 'active';
create index slot_holds_wait_id_idx on public.slot_holds (wait_id);
create index slot_holds_club_status_idx on public.slot_holds (club_id, status);
alter table public.slot_holds enable row level security;

-- The outbox: the database writes each aviso here and never calls anyone; Next shows it in the app
-- and mails it (lib/notify). Championships and last-minute offers will reuse it.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  -- Court name, slot start and, for a hold, until when it is held (lib/domain/waitlist.ts reads it).
  data jsonb not null default '{}',
  -- A path inside the app.
  link text not null check (link ~ '^/' and length(link) <= 200),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  email_status public.email_status not null default 'pending',
  email_attempts smallint not null default 0,
  -- While a run is mailing it, nobody else takes it.
  email_locked_until timestamptz,
  emailed_at timestamptz
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_email_queue_idx on public.notifications (created_at) where email_status in ('pending', 'failed');
alter table public.notifications enable row level security;

revoke all on public.slot_waits, public.slot_holds, public.notifications from anon, authenticated;
grant select on public.slot_waits, public.slot_holds, public.notifications to authenticated;

-- Each player reads her own waits and holds; staff read every one of the club (the demand panel).
create policy slot_waits_select_own_or_staff on public.slot_waits
  for select to authenticated
  using (
    player_id = (select auth.uid())
    or private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
  );
create policy slot_holds_select_own_or_staff on public.slot_holds
  for select to authenticated
  using (
    player_id = (select auth.uid())
    or private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
  );
-- An aviso is personal: not even staff read another person's.
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));
```

- [ ] **Step 6: Run test to verify it passes**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/waitlist_schema.test.sql
```
Expected: PASS (24 tests).

- [ ] **Step 7: Nada se rompió**

Run: `npm run test:db`
Expected: PASS (todos; `integrity.test.sql` sigue en verde porque estas migraciones no crean funciones).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261005000100_hold_kind.sql supabase/migrations/20261005000110_waitlist.sql supabase/tests/database/helpers/waitlist.psql supabase/tests/database/waitlist_schema.test.sql
git commit -m "feat(db): waits, holds and avisos tables"
```

---

### Task 3: Tipos generados, la retención en la grilla y PR borrador

**Files:**
- Modify: `lib/supabase/database.types.ts` (generado)
- Modify: `lib/domain/grid.ts:7-58`, `lib/domain/grid.ts:124-147`
- Test: `tests/unit/lib/domain/grid.test.ts`

- [ ] **Step 1: Regenerate types**

Run: `npm run db:types`
Expected: aparecen `slot_waits`, `slot_holds`, `notifications`, los enums `slot_wait_status`, `slot_hold_status`, `notification_kind`, `email_status`, `expires_at` en `court_occupancy` y `"hold"` en `occupancy_kind`.

- [ ] **Step 2: Write the failing test**

In `tests/unit/lib/domain/grid.test.ts`, replace the import from `@/lib/domain/grid` with:
```ts
import { blockEnd, blockEndOptions, continuesAbove, countFree, dayStats, holderName, KIND_LABELS, rowsCovered, toOccupancy, visibleRows } from '@/lib/domain/grid'
```
and append at the end of the file:
```ts
describe('holds', () => {
  it('names a held court', () => {
    expect(KIND_LABELS.hold).toBe('Retenido')
  })

  it('reads until when a court is held; only staff learn for whom', () => {
    const row = {
      id: 'h1',
      court_id: 'court-1',
      kind: 'hold' as const,
      starts_at: '2026-10-01T22:00:00Z',
      ends_at: '2026-10-01T23:30:00Z',
      note: 'Ana',
      expires_at: '2026-10-01T20:42:00Z',
    }
    expect(toOccupancy(row, 'player')).toMatchObject({ kind: 'hold', note: null, expiresAt: new Date('2026-10-01T20:42:00Z') })
    expect(toOccupancy(row, 'staff').note).toBe('Ana')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/grid.test.ts`
Expected: FAIL (`expected undefined to be 'Retenido'` y `expiresAt` ausente). `npm run typecheck` también falla: `occupancy_kind` de la base trae `"hold"` y `OccupancyKind` no.

- [ ] **Step 4: Write minimal implementation**

In `lib/domain/grid.ts`, replace the `OccupancyKind` line, the `Occupancy` type and `KIND_LABELS`:
```ts
export type OccupancyKind = 'booking' | 'recurring' | 'tournament' | 'block' | 'match' | 'day_use' | 'hold'
```
```ts
export type Occupancy = {
  id: string
  courtId: string
  kind: OccupancyKind
  startsAt: Date
  endsAt: Date
  note: string | null
  // The tournament that blocks the court (kind 'tournament'); members may read it.
  tournamentId?: string | null
  // Until when a court is held for the waitlist (kind 'hold').
  expiresAt?: Date | null
}
```
```ts
export const KIND_LABELS: Record<OccupancyKind, string> = {
  booking: 'Reserva',
  recurring: 'Turno fijo',
  tournament: 'Torneo',
  block: 'Bloqueo',
  match: 'Partido',
  day_use: 'Day use',
  hold: 'Retenido',
}
```
In the same file, replace `OccupancyRow` and `toOccupancy`:
```ts
export type OccupancyRow = {
  id: string
  court_id: string
  kind: OccupancyKind
  starts_at: string | null
  ends_at: string | null
  note: string | null
  tournament_id?: string | null
  expires_at?: string | null
}

// Block reasons and who holds a court are for staff only: a player's grid never carries them.
export function toOccupancy(row: OccupancyRow, audience: 'player' | 'staff'): Occupancy {
  return {
    id: row.id,
    courtId: row.court_id,
    kind: row.kind,
    note: audience === 'staff' ? row.note : null,
    startsAt: toDate(row.starts_at),
    endsAt: toDate(row.ends_at),
    ...(row.tournament_id ? { tournamentId: row.tournament_id } : {}),
    ...(row.expires_at ? { expiresAt: new Date(row.expires_at) } : {}),
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/lib/domain/grid.test.ts
npm run typecheck
npm test
```
Expected: PASS.

- [ ] **Step 6: Commit, push y PR borrador**

```bash
git add lib/supabase/database.types.ts lib/domain/grid.ts tests/unit/lib/domain/grid.test.ts
git commit -m "chore(types): waitlist tables and the hold kind"
git push -u origin feat/lista-de-espera
```
Abrir el PR borrador desde GitHub (`gh` no está instalado): base `main`, título "Lista de espera", cuerpo:
```text
Plan: docs/features/lista-de-espera/plan.md. Se marca listo al final (Task 28).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
Expected: PR borrador creado; CI corre en cada push.

---

## Corte 2: Motor y RPCs

### Task 4: Retener al liberar, avisar y vencer (el motor)

**Files:**
- Modify: `supabase/tests/database/helpers/waitlist.psql` (helpers `security definer`)
- Create: `supabase/tests/database/waitlist_offer.test.sql`
- Create: `supabase/migrations/20261005000120_waitlist_offer.sql`

- [ ] **Step 1: Los helpers leen sin RLS**

In `supabase/tests/database/helpers/waitlist.psql`, replace the two functions at the end with (so a test can ask for another player's hold while it acts as Bruno or Carla):
```sql
-- The active hold of a player (null when she has none). security definer: it reads past RLS, so a
-- test can pass another player's hold to an RPC while acting as someone else.
create function test_helpers.active_hold(p_player_id uuid)
returns uuid
language sql
stable
security definer
as $$
  select id from public.slot_holds where player_id = p_player_id and status = 'active';
$$;

-- The occupancy that holds the court for a hold.
create function test_helpers.hold_occupancy(p_hold_id uuid)
returns uuid
language sql
stable
security definer
as $$
  select occupancy_id from public.slot_holds where id = p_hold_id;
$$;

-- The hold a wait got for one slot (whatever its status now).
create function test_helpers.hold_of(p_wait_id uuid, p_period tstzrange)
returns uuid
language sql
stable
security definer
as $$
  select id from public.slot_holds where wait_id = p_wait_id and period = p_period;
$$;
```

- [ ] **Step 2: Write the failing test** (con la herramienta Write)

`supabase/tests/database/waitlist_offer.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/waitlist.psql
select plan(29);

select is(
  (select count(*)::int from private.day_slots('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1)),
  10, 'the grid has ten slots a day, 08:00 to 21:30');
select is(
  (select d.s from private.day_slots('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1) as d (s)
   order by d.s desc limit 1),
  test_helpers.slot(1, '21:30', 90), 'the last slot ends when the club closes');

select is(private.hold_minutes(now() + interval '3 hours', now()), 15, 'a slot more than two hours away is held 15 minutes');
select is(private.hold_minutes(now() + interval '90 minutes', now()), 5, 'under two hours, 5 minutes');
select is(private.hold_minutes(now() + interval '45 minutes', now()), null::integer,
  'at 45 minutes or less nobody gets it held');

-- The line for tomorrow evening, oldest first: Gabi (Cancha 2 only), Hugo (mornings), Iván (already
-- holding another court), Ana, Juli and Bruno (who has Cancha 1 booked at 18:30).
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a2',
  p_courts => array['c0000000-0000-0000-0000-000000000002']::uuid[], p_created_at => now() - interval '3 hours');
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000a3',
  p_from => '08:00', p_to => '12:30', p_created_at => now() - interval '150 minutes');
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-0000000000a4',
  p_created_at => now() - interval '2 hours');
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-0000000000a1',
  p_created_at => now() - interval '1 hour');
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-0000000000a5',
  p_created_at => now() - interval '30 minutes');
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-0000000000b1',
  p_created_at => now() - interval '10 minutes');
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-0000000000a4', 2,
  '08:00', '12:30');
call test_helpers.make_hold('e1000000-0000-0000-0000-000000000017', 'e0000000-0000-0000-0000-000000000017',
  'c0000000-0000-0000-0000-000000000002', test_helpers.slot(2, '08:00', 90), now() + interval '1 hour');
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(1, '18:30', 90), '00000000-0000-0000-0000-0000000000b1', 1600);

-- A court freed and taken again in the same transaction (claiming, regenerating a day use) is not offered.
insert into public.court_occupancy (id, club_id, court_id, kind, period, note) values
  ('ee000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000002', 'block', test_helpers.slot(1, '21:30', 90), 'Clase');
delete from public.court_occupancy where id = 'ee000000-0000-0000-0000-000000000001';
insert into public.court_occupancy (club_id, court_id, kind, period, note) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'block',
   test_helpers.slot(1, '21:30', 90), 'Clase');
set constraints all immediate;
set constraints all deferred;
select is((select count(*)::int from public.slot_holds where status = 'active'), 1,
  'a court freed and taken again in the same transaction is not offered');

-- Carla cancels Bruno's booking: when the transaction commits, the slot is offered.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok($$ select public.cancel_booking('b0000000-0000-0000-0000-000000000001') $$,
  'reception cancels Bruno''s booking');
set constraints all immediate;
set constraints all deferred;
reset role;

select results_eq(
  $$ select court_id, period from public.slot_holds
     where id = test_helpers.active_hold('00000000-0000-0000-0000-0000000000a1') $$,
  $$ values ('c0000000-0000-0000-0000-000000000001'::uuid, test_helpers.slot(1, '18:30', 90)) $$,
  'the freed slot is held for the first in line that takes that court and time: Ana');
select is(
  (select expires_at from public.court_occupancy
   where id = test_helpers.hold_occupancy(test_helpers.active_hold('00000000-0000-0000-0000-0000000000a1'))),
  now() + interval '15 minutes', 'more than two hours ahead, for 15 minutes');
select is((select count(*)::int from public.slot_holds where status = 'active'), 2,
  'nobody else gets a hold: Gabi wants Cancha 2, Hugo mornings and Iván already has one');
select results_eq(
  $$ select kind::text, link, data ->> 'court_name', (data ->> 'expires_at')::timestamptz
     from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('slot_held', '/', 'Cancha 1', now() + interval '15 minutes') $$,
  'Ana gets an aviso with the court and until when it is hers');

-- Nobody can take a held court.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(1, '18:30')) $$,
  'P0001', 'slot_taken', 'nobody books a held slot online');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000001', test_helpers.at(1, '18:30'),
       p_guest_name => 'Pérez') $$,
  'P0001', 'slot_taken', 'nor reception');
reset role;

-- Ana passes (decline_slot_hold does this in the next migration): the slot goes on, never back to her.
update public.slot_holds set status = 'declined', ended_at = now()
 where player_id = '00000000-0000-0000-0000-0000000000a1' and status = 'active';
delete from public.court_occupancy o using public.slot_holds h
 where h.occupancy_id = o.id and h.player_id = '00000000-0000-0000-0000-0000000000a1' and h.status = 'declined';
set constraints all immediate;
set constraints all deferred;

select results_eq(
  $$ select court_id, period from public.slot_holds
     where id = test_helpers.active_hold('00000000-0000-0000-0000-0000000000a5') $$,
  $$ values ('c0000000-0000-0000-0000-000000000001'::uuid, test_helpers.slot(1, '18:30', 90)) $$,
  'after a pass the slot goes to the next in line: Juli');
select is((select status::text from public.slot_waits where id = 'e0000000-0000-0000-0000-000000000014'), 'waiting',
  'Ana keeps waiting for the other slots of her range');

-- The job, sixteen minutes later.
select is(private.expire_waitlist(now() + interval '16 minutes'), 1, 'the job expires the holds whose time ran out');
select ok(
  test_helpers.active_hold('00000000-0000-0000-0000-0000000000a5') is null
  and not exists (select 1 from public.court_occupancy
                  where kind = 'hold' and court_id = 'c0000000-0000-0000-0000-000000000001'),
  'Juli''s hold expired and its court went free');
set constraints all immediate;
set constraints all deferred;
select results_eq(
  $$ select court_id, period from public.slot_holds
     where id = test_helpers.active_hold('00000000-0000-0000-0000-0000000000b1') $$,
  $$ values ('c0000000-0000-0000-0000-000000000001'::uuid, test_helpers.slot(1, '18:30', 90)) $$,
  'an expired hold goes to the next in line: Bruno, free again at that time');

-- Close to the start: 5 minutes, or nobody gets it held.
select is(
  private.offer_freed('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
    test_helpers.slot(1, '20:00', 90), test_helpers.at(1, '20:00') - interval '90 minutes'),
  1, 'a slot freed 90 minutes before it starts is still held');
select is(
  (select expires_at from public.slot_holds where id = test_helpers.active_hold('00000000-0000-0000-0000-0000000000a2')),
  test_helpers.at(1, '20:00') - interval '85 minutes', 'for 5 minutes, to Gabi, who wants Cancha 2');
select is(
  private.offer_freed('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
    test_helpers.slot(1, '21:30', 90), test_helpers.at(1, '21:30') - interval '30 minutes'),
  4, 'thirty minutes before, nobody gets it held: the whole line hears about it');
select results_eq(
  $$ select user_id, link from public.notifications where kind = 'slot_free_now' order by user_id $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, '/reservar?dia=' || (test_helpers.today() + 1)::text),
            ('00000000-0000-0000-0000-0000000000a4'::uuid, '/reservar?dia=' || (test_helpers.today() + 1)::text),
            ('00000000-0000-0000-0000-0000000000a5'::uuid, '/reservar?dia=' || (test_helpers.today() + 1)::text),
            ('00000000-0000-0000-0000-0000000000b1'::uuid, '/reservar?dia=' || (test_helpers.today() + 1)::text) $$,
  'everyone whose wait takes Cancha 1 at 21:30 (not Gabi nor Hugo), with a link to that day');
select is((select count(*)::int from public.slot_holds where status = 'active'), 3,
  'and no hold is created (Iván, Bruno and Gabi keep theirs)');
select is(
  private.offer_freed('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
    test_helpers.slot(1, '21:30', 90), test_helpers.at(1, '21:30') - interval '20 minutes'),
  0, 'nobody hears about the same slot twice');
select is(
  private.offer_freed('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
    test_helpers.slot(-1, '18:30', 90)),
  0, 'a slot that already started is not offered');

-- Tomorrow at 12:30 Iván's and Bruno's holds have run out (Gabi's lasts until 18:35), and so has
-- Hugo's morning wait.
select is(private.expire_waitlist(test_helpers.at(1, '12:30')), 2, 'by then two holds ran out');
select results_eq(
  $$ select id from public.slot_waits where status = 'expired' $$,
  $$ values ('e0000000-0000-0000-0000-000000000012'::uuid) $$,
  'a wait whose range is over expires; the others keep waiting');

select is((select count(*)::int from cron.job where jobname = 'expire-waitlist'), 1,
  'pg_cron expires holds and waits every minute');
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in ('day_slots', 'hold_minutes', 'wait_fits', 'announce_free_slot', 'offer_freed',
                         'on_occupancy_freed', 'expire_waitlist')
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot execute the waitlist engine');

select * from finish();
rollback;
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/waitlist_offer.test.sql`
Expected: FAIL (`function private.day_slots(unknown, date) does not exist`).

- [ ] **Step 4: Write the engine**

`supabase/migrations/20261005000120_waitlist_offer.sql`:
```sql
-- Lista de espera, part 2: the engine. When a court is freed (a booking cancelled, a block lifted, a
-- match that falls through, a hold passed on or expired) a deferred constraint trigger offers the slots
-- it left free to the waiting line once the transaction commits: it holds the slot for the first in line
-- or, when it is too close to start, tells the whole line. pg_cron expires holds and waits.

-- The club's grid for a date: opens_at + n * slot_minutes, ending no later than closes_at. The same grid
-- as private.slot_period and lib/domain/slots.ts daySlots.
create function private.day_slots(p_club_id uuid, p_date date)
returns setof tstzrange
language sql
stable
set search_path = ''
as $$
  select tstzrange(
    (p_date + c.opens_at + make_interval(mins => n * c.slot_minutes)) at time zone c.timezone,
    (p_date + c.opens_at + make_interval(mins => (n + 1) * c.slot_minutes)) at time zone c.timezone)
  from public.clubs c
  cross join lateral generate_series(
    0, floor(extract(epoch from (c.closes_at - c.opens_at)) / 60 / c.slot_minutes)::integer - 1) as n
  where c.id = p_club_id
  order by n;
$$;

-- How long a freed slot is held for the first in line: 15 minutes; 5 when it starts in less than two
-- hours; none (null) at 45 minutes or less, when the whole line is told instead.
create function private.hold_minutes(p_starts_at timestamptz, p_now timestamptz)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_starts_at - p_now <= interval '45 minutes' then null
    when p_starts_at - p_now < interval '2 hours' then 5
    else 15
  end;
$$;

-- Whether a waiting wait takes that slot on that court: inside its range, one of its courts (none = any).
create function private.wait_fits(p_wait public.slot_waits, p_court_id uuid, p_slot tstzrange, p_timezone text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_wait.status = 'waiting'
    and lower(p_slot) >= (p_wait.on_date + p_wait.from_time) at time zone p_timezone
    and upper(p_slot) <= (p_wait.on_date + p_wait.to_time) at time zone p_timezone
    and (cardinality(p_wait.court_ids) = 0 or p_court_id = any (p_wait.court_ids));
$$;

-- Too close to hold: everyone whose wait takes the slot hears about it, once per player, court and
-- slot; the first one to book it gets it. Skips who already had it held and who is busy at that time.
-- Returns how many avisos it wrote.
create function private.announce_free_slot(p_club public.clubs, p_court public.courts, p_slot tstzrange)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.notifications (club_id, user_id, kind, data, link)
  select distinct on (w.player_id)
         p_club.id, w.player_id, 'slot_free_now',
         jsonb_build_object('court_id', p_court.id, 'court_name', p_court.name, 'starts_at', lower(p_slot)),
         '/reservar?dia=' || to_char(lower(p_slot) at time zone p_club.timezone, 'YYYY-MM-DD')
  from public.slot_waits w
  where w.club_id = p_club.id
    and private.wait_fits(w, p_court.id, p_slot, p_club.timezone)
    and not exists (
      select 1 from public.slot_holds h
      where h.player_id = w.player_id and h.court_id = p_court.id and h.period = p_slot
    )
    and not private.is_busy(w.player_id, p_slot)
    and not exists (
      select 1 from public.notifications n
      where n.user_id = w.player_id and n.kind = 'slot_free_now'
        and n.data ->> 'court_id' = p_court.id::text
        and (n.data ->> 'starts_at')::timestamptz = lower(p_slot)
    )
  order by w.player_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Offers the grid slots of a freed period that are still free, priced and ahead. More than 45 minutes
-- ahead: holds it for the first waiting wait (oldest first) that takes it, whose player has no other
-- active hold, never had this slot held on this court and is not busy then, and writes her aviso.
-- Closer than that: announce_free_slot. Returns how many holds and avisos it made. p_now is a
-- parameter so tests can fix the clock.
create function private.offer_freed(
  p_club_id uuid,
  p_court_id uuid,
  p_period tstzrange,
  p_now timestamptz default now()
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_club public.clubs;
  v_court public.courts;
  v_date date;
  v_slot tstzrange;
  v_minutes integer;
  v_wait public.slot_waits;
  v_occupancy_id uuid;
  v_hold_id uuid;
  v_expires timestamptz;
  v_offers integer := 0;
begin
  select * into v_club from public.clubs where id = p_club_id;
  select * into v_court from public.courts where id = p_court_id and club_id = p_club_id and is_active;
  if v_club.id is null or v_court.id is null then
    return 0;
  end if;
  -- One offer at a time per club: two courts freed together never hand two holds to the same player.
  perform pg_advisory_xact_lock(hashtextextended('waitlist:' || p_club_id::text, 0));

  for v_date in
    select d::date
    from generate_series((lower(p_period) at time zone v_club.timezone)::date,
                         (upper(p_period) at time zone v_club.timezone)::date, interval '1 day') as d
  loop
    for v_slot in
      select s.period from private.day_slots(p_club_id, v_date) as s (period)
      where s.period && p_period and lower(s.period) > p_now
      order by s.period
    loop
      if exists (select 1 from public.court_occupancy o where o.court_id = p_court_id and o.period && v_slot)
         or private.slot_price(p_club_id, lower(v_slot)) is null then
        continue;
      end if;

      v_minutes := private.hold_minutes(lower(v_slot), p_now);
      if v_minutes is null then
        v_offers := v_offers + private.announce_free_slot(v_club, v_court, v_slot);
        continue;
      end if;

      select w.* into v_wait
      from public.slot_waits w
      where w.club_id = p_club_id and w.on_date = v_date
        and private.wait_fits(w, p_court_id, v_slot, v_club.timezone)
        and not exists (select 1 from public.slot_holds h where h.player_id = w.player_id and h.status = 'active')
        and not exists (
          select 1 from public.slot_holds h
          where h.player_id = w.player_id and h.court_id = p_court_id and h.period = v_slot
        )
        and not private.is_busy(w.player_id, v_slot)
      order by w.created_at, w.id
      limit 1;
      if not found then
        continue;
      end if;

      v_expires := p_now + make_interval(mins => v_minutes);
      begin
        insert into public.court_occupancy (club_id, court_id, kind, period, expires_at, note)
        values (p_club_id, p_court_id, 'hold', v_slot, v_expires,
                (select nullif(trim(left(p.display_name, 80)), '') from public.profiles p where p.id = v_wait.player_id))
        returning id into v_occupancy_id;
      exception when exclusion_violation then
        continue;
      end;

      insert into public.slot_holds (club_id, wait_id, player_id, occupancy_id, court_id, period, expires_at)
      values (p_club_id, v_wait.id, v_wait.player_id, v_occupancy_id, p_court_id, v_slot, v_expires)
      returning id into v_hold_id;

      insert into public.notifications (club_id, user_id, kind, data, link)
      values (p_club_id, v_wait.player_id, 'slot_held',
              jsonb_build_object('hold_id', v_hold_id, 'court_id', p_court_id, 'court_name', v_court.name,
                                 'starts_at', lower(v_slot), 'expires_at', v_expires),
              '/');
      v_offers := v_offers + 1;
    end loop;
  end loop;
  return v_offers;
end;
$$;

-- Runs when the transaction that freed the court commits, so it sees whether the court is still free
-- (claiming and regenerating a day use free and take it again in the same transaction).
create function private.on_occupancy_freed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.offer_freed(old.club_id, old.court_id, old.period);
  exception when others then
    -- Freeing a court never fails because of the waitlist.
    raise warning 'offer_freed: occupancy % failed: %', old.id, sqlerrm;
  end;
  return null;
end;
$$;

create constraint trigger court_occupancy_offer_freed
  after delete on public.court_occupancy
  deferrable initially deferred
  for each row execute function private.on_occupancy_freed();

-- Holds whose time ran out go free (the trigger offers them to the next in line when this commits),
-- with any hold occupancy left behind; waits whose range is over expire. Returns how many holds expired.
create function private.expire_waitlist(p_now timestamptz default now())
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.slot_holds set status = 'expired', ended_at = p_now
   where status = 'active' and expires_at <= p_now;
  get diagnostics v_count = row_count;

  delete from public.court_occupancy where kind = 'hold' and expires_at <= p_now;

  update public.slot_waits w set status = 'expired', ended_at = p_now
    from public.clubs c
   where c.id = w.club_id and w.status = 'waiting'
     and (w.on_date + w.to_time) at time zone c.timezone <= p_now;
  return v_count;
end;
$$;

revoke all on function private.day_slots(uuid, date) from public;
revoke all on function private.hold_minutes(timestamptz, timestamptz) from public;
revoke all on function private.wait_fits(public.slot_waits, uuid, tstzrange, text) from public;
revoke all on function private.announce_free_slot(public.clubs, public.courts, tstzrange) from public;
revoke all on function private.offer_freed(uuid, uuid, tstzrange, timestamptz) from public;
revoke all on function private.on_occupancy_freed() from public;
revoke all on function private.expire_waitlist(timestamptz) from public;

-- Every minute: holds and waits run out on time.
select cron.schedule('expire-waitlist', '* * * * *', 'select private.expire_waitlist()');
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/waitlist_offer.test.sql
npx supabase test db supabase/tests/database/waitlist_schema.test.sql
```
Expected: PASS (29 y 24 tests). `to_jsonb(timestamptz)` guarda la hora con microsegundos, así que `(data ->> 'expires_at')::timestamptz` vuelve exactamente a `now() + interval '15 minutes'`.

- [ ] **Step 6: Nada se rompió**

Run: `npm run test:db`
Expected: PASS (el trigger es diferido y los tests existentes terminan en `rollback`, así que no lo disparan).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261005000120_waitlist_offer.sql supabase/tests/database/helpers/waitlist.psql supabase/tests/database/waitlist_offer.test.sql
git commit -m "feat(db): hold a freed slot for the first in line, or tell the line"
```

---

### Task 5: Anotarse, cancelar, reservar, pasar y marcar leídos (RPCs)

**Files:**
- Create: `supabase/tests/database/waitlist_rpcs.test.sql`
- Create: `supabase/migrations/20261005000130_waitlist_rpcs.sql`

- [ ] **Step 1: Write the failing test** (con la herramienta Write)

`supabase/tests/database/waitlist_rpcs.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/waitlist.psql
select plan(44);

-- Tomorrow at 19:00 both courts are taken: Bruno has Cancha 1, Gabi Cancha 2.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(1, '19:00', 90), '00000000-0000-0000-0000-0000000000b1', 1600);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(1, '19:00', 90), '00000000-0000-0000-0000-0000000000a2', 1600);

-- Ana signs up
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '19:00', '20:30') $$,
  'Ana waits for tomorrow at 19:00 on any court');
select results_eq(
  $$ select on_date, from_time, to_time, court_ids, status::text from public.slot_waits $$,
  $$ values (test_helpers.today() + 1, '19:00'::time, '20:30'::time, '{}'::uuid[], 'waiting') $$,
  'the wait is hers, waiting');
select lives_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '19:00', '20:30',
       array['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002']::uuid[]) $$,
  'she can pick the courts');
select is((select count(*)::int from public.slot_waits where court_ids = '{}'), 2,
  'picking every court means any court, including one the club adds later');
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '08:00', '09:30') $$,
  'P0001', 'slot_available', 'when a slot in the range is free, she books it instead');
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '20:30', '19:00') $$,
  'P0001', 'invalid_input', 'the range starts before it ends');
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '07:00', '09:30') $$,
  'P0001', 'invalid_input', 'the range is inside the club''s hours');
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '19:00', '20:00') $$,
  'P0001', 'invalid_input', 'the range holds at least one whole slot');
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '19:00', '20:30',
       array['cb000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'P0001', 'invalid_input', 'the courts are the club''s');
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() - 1, '19:00', '20:30') $$,
  'P0001', 'in_the_past', 'no waits for the past');
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 15, '19:00', '20:30') $$,
  'P0001', 'outside_window', 'no waits beyond the booking window');
select lives_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '19:00', '20:30',
       array['c0000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'a third wait is fine');
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '19:00', '20:30') $$,
  'P0001', 'too_many_waits', 'a fourth active wait goes over the limit');

-- Omar, not a member; then an anonymous visitor
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '19:00', '20:30') $$,
  'P0001', 'forbidden', 'only members wait');
set local role anon;
select throws_ok(
  $$ select public.create_slot_wait('a0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '19:00', '20:30') $$,
  '42501', null, 'anon cannot call create_slot_wait');

-- Cancelling: Hugo's wait
reset role;
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000a3', 1,
  '19:00', '20:30');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok($$ select public.cancel_slot_wait('e0000000-0000-0000-0000-000000000021') $$,
  'P0001', 'forbidden', 'only the player cancels her wait');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';
select lives_ok($$ select public.cancel_slot_wait('e0000000-0000-0000-0000-000000000021') $$, 'Hugo cancels his wait');
select is((select status::text from public.slot_waits where id = 'e0000000-0000-0000-0000-000000000021'), 'cancelled',
  'it is cancelled');
select throws_ok($$ select public.cancel_slot_wait('e0000000-0000-0000-0000-000000000021') $$,
  'P0001', 'invalid_state', 'a cancelled wait cannot be cancelled again');

-- Claiming: Juli signed up before Ana, so Bruno's freed court is held for her.
reset role;
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-0000000000a5',
  p_created_at => now() - interval '1 hour');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok($$ select public.cancel_booking('b0000000-0000-0000-0000-000000000001') $$,
  'reception cancels Bruno''s booking');
set constraints all immediate;
set constraints all deferred;

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok($$ select public.claim_slot_hold(test_helpers.active_hold('00000000-0000-0000-0000-0000000000a5')) $$,
  'P0001', 'forbidden', 'only the player books her hold');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
select lives_ok($$ select public.claim_slot_hold(test_helpers.active_hold('00000000-0000-0000-0000-0000000000a5')) $$,
  'Juli books the slot held for her');
reset role;
select results_eq(
  $$ select b.price, b.source::text, b.player_id, o.kind::text
     from public.bookings b join public.court_occupancy o on o.id = b.occupancy_id
     where b.court_id = 'c0000000-0000-0000-0000-000000000001' and b.period = test_helpers.slot(1, '19:00', 90)
       and b.status = 'confirmed' $$,
  $$ values (1600, 'online', '00000000-0000-0000-0000-0000000000a5'::uuid, 'booking') $$,
  'it is an online booking of hers at the slot''s price, holding the court');
select results_eq(
  $$ select h.status::text, h.booking_id = b.id, w.status::text
     from public.slot_holds h
     join public.slot_waits w on w.id = h.wait_id
     join public.bookings b on b.player_id = h.player_id and b.period = h.period and b.status = 'confirmed'
     where h.id = test_helpers.hold_of('e0000000-0000-0000-0000-000000000022', test_helpers.slot(1, '19:00', 90)) $$,
  $$ values ('claimed', true, 'booked') $$,
  'the hold is claimed with its booking, and her wait is booked');
select is(
  (select count(*)::int from public.payments p join public.bookings b on b.id = p.booking_id
   where b.player_id = '00000000-0000-0000-0000-0000000000a5'),
  0, 'it waits for payment like any booking (cash or transfer, in Cobros)');
set local role authenticated;
select throws_ok(
  $$ select public.claim_slot_hold(test_helpers.hold_of('e0000000-0000-0000-0000-000000000022',
       test_helpers.slot(1, '19:00', 90))) $$,
  'P0001', 'invalid_state', 'a claimed hold cannot be claimed again');

-- Passing: Juli waits again (oldest), but she is busy at 19:00 now; Iván signed up after Ana.
reset role;
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-0000000000a5',
  p_created_at => now() - interval '2 hours');
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-0000000000a4', 1,
  '19:00', '20:30', p_created_at => now() + interval '1 minute');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok($$ select public.cancel_booking('b0000000-0000-0000-0000-000000000002') $$,
  'reception cancels Gabi''s booking');
set constraints all immediate;
set constraints all deferred;
reset role;
select results_eq(
  $$ select court_id, period from public.slot_holds
     where id = test_helpers.active_hold('00000000-0000-0000-0000-0000000000a1') $$,
  $$ values ('c0000000-0000-0000-0000-000000000002'::uuid, test_helpers.slot(1, '19:00', 90)) $$,
  'Juli is busy at that time, so Cancha 2 is held for Ana');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok($$ select public.decline_slot_hold(test_helpers.active_hold('00000000-0000-0000-0000-0000000000a1')) $$,
  'P0001', 'forbidden', 'only the player passes on her hold');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok($$ select public.decline_slot_hold(test_helpers.active_hold('00000000-0000-0000-0000-0000000000a1')) $$,
  'Ana says it does not work for her');
reset role;
select ok(
  (select status = 'declined' and occupancy_id is null from public.slot_holds
   where player_id = '00000000-0000-0000-0000-0000000000a1'
     and court_id = 'c0000000-0000-0000-0000-000000000002' and period = test_helpers.slot(1, '19:00', 90)),
  'her hold is declined and the court went free');
set constraints all immediate;
set constraints all deferred;
select results_eq(
  $$ select court_id, period from public.slot_holds
     where id = test_helpers.active_hold('00000000-0000-0000-0000-0000000000a4') $$,
  $$ values ('c0000000-0000-0000-0000-000000000002'::uuid, test_helpers.slot(1, '19:00', 90)) $$,
  'it goes to Iván, not back to Ana through her other waits');

-- Reception passes it on
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.release_slot_hold(test_helpers.hold_occupancy(test_helpers.active_hold('00000000-0000-0000-0000-0000000000a4'))) $$,
  'P0001', 'forbidden', 'a player cannot pass someone else''s hold on');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  $$ select public.release_slot_hold(test_helpers.hold_occupancy(test_helpers.active_hold('00000000-0000-0000-0000-0000000000a4'))) $$,
  'P0001', 'forbidden', 'nor staff of another club');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.release_slot_hold(test_helpers.hold_occupancy(test_helpers.active_hold('00000000-0000-0000-0000-0000000000a4'))) $$,
  'reception passes Iván''s hold to the next in line');
set constraints all immediate;
set constraints all deferred;
reset role;
select ok(
  (select status = 'released' from public.slot_holds
   where id = test_helpers.hold_of('e0000000-0000-0000-0000-000000000023', test_helpers.slot(1, '19:00', 90)))
  and not exists (select 1 from public.court_occupancy
                  where court_id = 'c0000000-0000-0000-0000-000000000002' and period && test_helpers.slot(1, '19:00', 90)),
  'Iván''s hold is released; nobody else in line takes it, so the court is free');
set local role authenticated;
select throws_ok(
  $$ select public.release_slot_hold('ee000000-0000-0000-0000-00000000dead') $$,
  'P0001', 'not_found', 'a hold that is gone cannot be passed on');

-- A hold whose time ran out (the job has not run yet)
reset role;
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-0000000000a2', 3);
call test_helpers.make_hold('e1000000-0000-0000-0000-000000000025', 'e0000000-0000-0000-0000-000000000025',
  'c0000000-0000-0000-0000-000000000001', test_helpers.slot(3, '19:00', 90), now() - interval '1 minute');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select throws_ok($$ select public.claim_slot_hold('e1000000-0000-0000-0000-000000000025') $$,
  'P0001', 'hold_expired', 'a hold whose time ran out cannot be booked');

-- Cancelling a wait that has a hold frees the court
reset role;
call test_helpers.make_wait('e0000000-0000-0000-0000-000000000026', '00000000-0000-0000-0000-0000000000b1', 3);
call test_helpers.make_hold('e1000000-0000-0000-0000-000000000026', 'e0000000-0000-0000-0000-000000000026',
  'c0000000-0000-0000-0000-000000000002', test_helpers.slot(3, '20:30', 90));
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select lives_ok($$ select public.cancel_slot_wait('e0000000-0000-0000-0000-000000000026') $$,
  'Bruno cancels a wait while it holds a court');
reset role;
select results_eq(
  $$ select w.status::text, h.status::text, h.occupancy_id is null
     from public.slot_waits w join public.slot_holds h on h.wait_id = w.id
     where w.id = 'e0000000-0000-0000-0000-000000000026' $$,
  $$ values ('cancelled', 'declined', true) $$,
  'the wait is cancelled and its hold let go');

-- Avisos read
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';
select is(public.mark_notifications_read(), 1, 'opening Avisos marks Juli''s aviso read');
select is((select count(*)::int from public.notifications where read_at is null), 0, 'none left unread');
set local role anon;
select throws_ok($$ select public.mark_notifications_read() $$, '42501', null, 'anon cannot call mark_notifications_read');

reset role;
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'end_hold'
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot end holds directly');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/waitlist_rpcs.test.sql`
Expected: FAIL (`function public.create_slot_wait(…) does not exist`).

- [ ] **Step 3: Write the RPCs**

`supabase/migrations/20261005000130_waitlist_rpcs.sql`:
```sql
-- Lista de espera, part 3: what players and staff do. Signing up for a slot, cancelling, booking a held
-- slot, passing on it, reception passing it to the next in line, and marking avisos read.
-- Lock order: the wait, then the hold (claim_slot_hold and cancel_slot_wait), so they never deadlock.

-- Ends an active hold and frees its court; the deferred trigger offers it to the next in line.
-- Callers lock the hold and check it is active.
create function private.end_hold(p_hold public.slot_holds, p_status public.slot_hold_status)
returns public.slot_holds
language plpgsql
set search_path = ''
as $$
declare
  v_hold public.slot_holds;
begin
  update public.slot_holds set status = p_status, ended_at = now() where id = p_hold.id returning * into v_hold;
  delete from public.court_occupancy where id = p_hold.occupancy_id;
  return v_hold;
end;
$$;

-- "Avisame si se libera". The range has to hold a whole slot of the grid still ahead, within the
-- booking window; every court picked means any court. At most 3 active waits per player. When a slot
-- in the range is free right now the answer is slot_available: book it instead.
create function public.create_slot_wait(
  p_club_id uuid,
  p_date date,
  p_from time,
  p_to time,
  p_court_ids uuid[] default '{}'
)
returns public.slot_waits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_club public.clubs;
  v_courts uuid[] := coalesce(p_court_ids, '{}');
  v_starts timestamptz;
  v_ends timestamptz;
  v_wait public.slot_waits;
begin
  if v_uid is null or not private.is_club_member(p_club_id) then
    perform private.fail('forbidden');
  end if;
  select * into v_club from public.clubs where id = p_club_id;
  if p_date is null or p_from is null or p_to is null or p_from >= p_to
     or p_from < v_club.opens_at or p_to > v_club.closes_at
     or cardinality(v_courts) > 20 or array_position(v_courts, null) is not null
     or exists (
       select 1 from unnest(v_courts) as picked (id)
       where not exists (
         select 1 from public.courts c where c.id = picked.id and c.club_id = p_club_id and c.is_active
       )
     ) then
    perform private.fail('invalid_input');
  end if;
  -- Every court picked: any court, including one the club adds later.
  if not exists (
    select 1 from public.courts c where c.club_id = p_club_id and c.is_active and not (c.id = any (v_courts))
  ) then
    v_courts := '{}';
  end if;

  v_starts := (p_date + p_from) at time zone v_club.timezone;
  v_ends := (p_date + p_to) at time zone v_club.timezone;
  if v_ends <= now() then
    perform private.fail('in_the_past');
  end if;
  if p_date > private.club_today(p_club_id) + v_club.booking_window_days then
    perform private.fail('outside_window');
  end if;
  if not exists (
    select 1 from private.day_slots(p_club_id, p_date) as s (period)
    where lower(s.period) >= v_starts and upper(s.period) <= v_ends and lower(s.period) > now()
  ) then
    perform private.fail('invalid_input');
  end if;

  -- One sign-up at a time per player, so the limit cannot race.
  perform pg_advisory_xact_lock(hashtextextended('slot_wait:' || v_uid::text, 0));
  if (
    select count(*) from public.slot_waits w
    where w.player_id = v_uid and w.status = 'waiting'
      and (w.on_date + w.to_time) at time zone v_club.timezone > now()
  ) >= 3 then
    perform private.fail('too_many_waits');
  end if;

  if exists (
    select 1
    from private.day_slots(p_club_id, p_date) as s (period)
    join public.courts c
      on c.club_id = p_club_id and c.is_active and (cardinality(v_courts) = 0 or c.id = any (v_courts))
    where lower(s.period) >= v_starts and upper(s.period) <= v_ends and lower(s.period) > now()
      and private.slot_price(p_club_id, lower(s.period)) is not null
      and not exists (select 1 from public.court_occupancy o where o.court_id = c.id and o.period && s.period)
  ) then
    perform private.fail('slot_available');
  end if;

  insert into public.slot_waits (club_id, player_id, on_date, from_time, to_time, court_ids)
  values (p_club_id, v_uid, p_date, p_from, p_to, v_courts)
  returning * into v_wait;
  return v_wait;
end;
$$;

-- The player cancels her wait; a court it holds goes to the next in line.
create function public.cancel_slot_wait(p_wait_id uuid)
returns public.slot_waits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wait public.slot_waits;
  v_hold public.slot_holds;
begin
  select * into v_wait from public.slot_waits where id = p_wait_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_wait.player_id is distinct from (select auth.uid()) then
    perform private.fail('forbidden');
  end if;
  if v_wait.status <> 'waiting' then
    perform private.fail('invalid_state');
  end if;

  select * into v_hold from public.slot_holds where wait_id = v_wait.id and status = 'active' for update;
  if found then
    perform private.end_hold(v_hold, 'declined');
  end if;

  update public.slot_waits set status = 'cancelled', ended_at = now() where id = v_wait.id returning * into v_wait;
  return v_wait;
end;
$$;

-- "Reservar": the hold becomes a booking like any online one (same price, same rules as book_slot),
-- in one transaction. The deferred trigger then finds the court taken and offers nothing.
create function public.claim_slot_hold(p_hold_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_hold public.slot_holds;
  v_club public.clubs;
  v_price integer;
  v_booking public.bookings;
begin
  -- Lock order: the wait, then the hold.
  perform 1 from public.slot_waits w join public.slot_holds h on h.wait_id = w.id where h.id = p_hold_id
    for update of w;
  select * into v_hold from public.slot_holds where id = p_hold_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null or v_hold.player_id is distinct from v_uid or not private.is_club_member(v_hold.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_hold.status <> 'active' then
    perform private.fail('invalid_state');
  end if;
  if v_hold.expires_at <= now() then
    perform private.fail('hold_expired');
  end if;

  -- The rules of book_slot, under its per-player lock.
  perform pg_advisory_xact_lock(hashtextextended('book_slot:' || v_uid::text, 0));
  select * into v_club from public.clubs where id = v_hold.club_id;
  if private.is_busy(v_uid, v_hold.period) then
    perform private.fail('busy_at_that_time');
  end if;
  if (
    select count(*) from public.bookings b
    where b.club_id = v_hold.club_id and b.player_id = v_uid and b.status = 'confirmed'
      and b.series_id is null and b.starts_at > now()
  ) >= v_club.max_active_bookings then
    perform private.fail('too_many_bookings');
  end if;
  v_price := private.slot_price(v_hold.club_id, lower(v_hold.period));
  if v_price is null then
    perform private.fail('no_price');
  end if;

  delete from public.court_occupancy where id = v_hold.occupancy_id;
  v_booking := private.insert_booking(v_hold.club_id, v_hold.court_id, v_hold.period, 'booking', v_uid, null,
                                      'online', null, v_price);

  update public.slot_holds set status = 'claimed', booking_id = v_booking.id, ended_at = now() where id = v_hold.id;
  update public.slot_waits set status = 'booked', ended_at = now() where id = v_hold.wait_id;
  return v_booking;
end;
$$;

-- "No me sirve": the slot goes to the next in line. The wait keeps waiting for the rest of its range.
create function public.decline_slot_hold(p_hold_id uuid)
returns public.slot_holds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold public.slot_holds;
begin
  select * into v_hold from public.slot_holds where id = p_hold_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_hold.player_id is distinct from (select auth.uid()) then
    perform private.fail('forbidden');
  end if;
  if v_hold.status <> 'active' then
    perform private.fail('invalid_state');
  end if;
  return private.end_hold(v_hold, 'declined');
end;
$$;

-- "Pasar al siguiente", from the grid: reception and admin pass a held court to the next in line.
create function public.release_slot_hold(p_occupancy_id uuid)
returns public.slot_holds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold public.slot_holds;
begin
  select * into v_hold from public.slot_holds where occupancy_id = p_occupancy_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_hold.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_hold.status <> 'active' then
    perform private.fail('invalid_state');
  end if;
  return private.end_hold(v_hold, 'released');
end;
$$;

-- Opening Avisos marks every aviso of the viewer read. Returns how many.
create function public.mark_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    perform private.fail('forbidden');
  end if;
  update public.notifications set read_at = now() where user_id = (select auth.uid()) and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.end_hold(public.slot_holds, public.slot_hold_status) from public;
revoke execute on function public.create_slot_wait(uuid, date, time, time, uuid[]) from public, anon;
revoke execute on function public.cancel_slot_wait(uuid) from public, anon;
revoke execute on function public.claim_slot_hold(uuid) from public, anon;
revoke execute on function public.decline_slot_hold(uuid) from public, anon;
revoke execute on function public.release_slot_hold(uuid) from public, anon;
revoke execute on function public.mark_notifications_read() from public, anon;
grant execute on function public.create_slot_wait(uuid, date, time, time, uuid[]) to authenticated;
grant execute on function public.cancel_slot_wait(uuid) to authenticated;
grant execute on function public.claim_slot_hold(uuid) to authenticated;
grant execute on function public.decline_slot_hold(uuid) to authenticated;
grant execute on function public.release_slot_hold(uuid) to authenticated;
grant execute on function public.mark_notifications_read() to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/waitlist_rpcs.test.sql
npm run test:db
```
Expected: PASS (44 tests; el resto en verde, incluido `integrity.test.sql`: ninguna función nueva es ejecutable por `anon`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261005000130_waitlist_rpcs.sql supabase/tests/database/waitlist_rpcs.test.sql
git commit -m "feat(db): sign up, cancel, book, pass on and release a held slot"
```

---

### Task 6: La *outbox* de avisos (solo service role)

**Files:**
- Create: `supabase/tests/database/notification_outbox.test.sql`
- Create: `supabase/migrations/20261005000140_notification_outbox.sql`

- [ ] **Step 1: Write the failing test** (con la herramienta Write)

`supabase/tests/database/notification_outbox.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(14);

insert into public.notifications (id, club_id, user_id, kind, data, link, created_at) values
  ('e2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 'slot_held', '{"court_name": "Cancha 1"}', '/', now() - interval '2 minutes'),
  ('e2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000b1', 'slot_free_now', '{"court_name": "Cancha 2"}', '/reservar',
   now() - interval '1 minute');

-- Ana, player
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok($$ select * from public.claim_notification_emails(10) $$, '42501', null,
  'players cannot read the outbox');
select throws_ok($$ select public.finish_notification_email('e2000000-0000-0000-0000-000000000001', 'sent') $$,
  '42501', null, 'nor mark it');

-- The service role (lib/notify/outbox.ts)
set local role service_role;
select results_eq(
  $$ select notification_id, kind::text, email, player_name, club_name, club_timezone, link
     from public.claim_notification_emails(10) $$,
  $$ values ('e2000000-0000-0000-0000-000000000001'::uuid, 'slot_held', 'ana@test.local', 'Ana', 'Club T',
             'America/Montevideo', '/'),
            ('e2000000-0000-0000-0000-000000000002'::uuid, 'slot_free_now', 'bruno@test.local', 'Bruno', 'Club T',
             'America/Montevideo', '/reservar') $$,
  'the service role takes the pending avisos, oldest first, with each player''s email');
select results_eq(
  $$ select email_attempts::int, email_locked_until > now() from public.notifications order by created_at $$,
  $$ values (1, true), (1, true) $$,
  'each one counts an attempt and stays taken for a while');
select is_empty($$ select * from public.claim_notification_emails(10) $$, 'a second run does not take them again');
select lives_ok($$ select public.finish_notification_email('e2000000-0000-0000-0000-000000000001', 'sent') $$,
  'a mail that went out is marked sent');
select results_eq(
  $$ select email_status::text, emailed_at is not null, email_locked_until is null
     from public.notifications where id = 'e2000000-0000-0000-0000-000000000001' $$,
  $$ values ('sent', true, true) $$,
  'with when it went out');
select lives_ok($$ select public.finish_notification_email('e2000000-0000-0000-0000-000000000002', 'failed') $$,
  'a mail that failed is marked failed');
select results_eq($$ select notification_id from public.claim_notification_emails(10) $$,
  $$ values ('e2000000-0000-0000-0000-000000000002'::uuid) $$, 'a failed one is retried');
select public.finish_notification_email('e2000000-0000-0000-0000-000000000002', 'failed');
select results_eq($$ select notification_id from public.claim_notification_emails(10) $$,
  $$ values ('e2000000-0000-0000-0000-000000000002'::uuid) $$, 'and retried a third time');
select public.finish_notification_email('e2000000-0000-0000-0000-000000000002', 'failed');
select is_empty($$ select * from public.claim_notification_emails(10) $$, 'after three failed attempts it is left alone');
select throws_ok($$ select public.finish_notification_email('e2000000-0000-0000-0000-000000000001', 'pending') $$,
  'P0001', 'invalid_input', 'nothing goes back to pending');

reset role;
select ok(
  not has_function_privilege('authenticated', 'public.claim_notification_emails(integer)', 'execute')
  and not has_function_privilege('anon', 'public.finish_notification_email(uuid, public.email_status)', 'execute'),
  'only the service role runs the outbox');
select ok(has_function_privilege('service_role', 'public.claim_notification_emails(integer)', 'execute'),
  'the service role does');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/notification_outbox.test.sql`
Expected: FAIL (`function public.claim_notification_emails(integer) does not exist`).

- [ ] **Step 3: Write the outbox functions**

`supabase/migrations/20261005000140_notification_outbox.sql`:
```sql
-- Lista de espera, part 4: the outbox. The database never calls anyone: it writes each aviso to
-- notifications and Next (lib/notify/outbox.ts) mails it with the service role. Claiming takes a batch
-- with skip locked and leases it for five minutes, so two runs never mail the same aviso; a failed mail
-- is retried up to its third attempt. The player's address comes from auth.users and goes nowhere else.
create function public.claim_notification_emails(p_limit integer default 20)
returns table (
  notification_id uuid,
  kind public.notification_kind,
  data jsonb,
  link text,
  email text,
  player_name text,
  club_name text,
  club_timezone text,
  club_logo_path text
)
language sql
security definer
set search_path = ''
as $$
  with picked as (
    select n.id
    from public.notifications n
    where (n.email_status = 'pending' or (n.email_status = 'failed' and n.email_attempts < 3))
      and (n.email_locked_until is null or n.email_locked_until < now())
    order by n.created_at
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    for update skip locked
  ), claimed as (
    update public.notifications n
       set email_attempts = n.email_attempts + 1, email_locked_until = now() + interval '5 minutes'
      from picked
     where n.id = picked.id
    returning n.id, n.kind, n.data, n.link, n.user_id, n.club_id, n.created_at
  )
  select c.id, c.kind, c.data, c.link, u.email::text, p.display_name, cl.name, cl.timezone, cl.logo_path
  from claimed c
  join auth.users u on u.id = c.user_id
  join public.profiles p on p.id = c.user_id
  join public.clubs cl on cl.id = c.club_id
  order by c.created_at;
$$;

-- What happened to one mail: sent, failed (retried while it has attempts left) or skipped (no mail
-- configured, no address, or the hold already ran out).
create function public.finish_notification_email(p_id uuid, p_status public.email_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status is null or p_status = 'pending' then
    perform private.fail('invalid_input');
  end if;
  update public.notifications
     set email_status = p_status,
         email_locked_until = null,
         emailed_at = case when p_status = 'sent' then now() end
   where id = p_id;
end;
$$;

revoke execute on function public.claim_notification_emails(integer) from public, anon, authenticated;
revoke execute on function public.finish_notification_email(uuid, public.email_status) from public, anon, authenticated;
grant execute on function public.claim_notification_emails(integer) to service_role;
grant execute on function public.finish_notification_email(uuid, public.email_status) to service_role;
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/notification_outbox.test.sql
```
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261005000140_notification_outbox.sql supabase/tests/database/notification_outbox.test.sql
git commit -m "feat(db): notification outbox for the mailer"
```

---

### Task 7: Avisos y esperas en vivo, y tipos del corte 2

**Files:**
- Create: `supabase/tests/database/realtime_waitlist.test.sql`
- Create: `supabase/migrations/20261005000150_realtime_waitlist.sql`
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: Write the failing test** (con la herramienta Write)

`supabase/tests/database/realtime_waitlist.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('notifications', 'slot_waits')),
  2, 'avisos and waits are published to Realtime');
select is(
  (select relreplident::text from pg_class where oid = 'public.notifications'::regclass),
  'd', 'avisos keep the default replica identity');
select is(
  (select relreplident::text from pg_class where oid = 'public.slot_waits'::regclass),
  'd', 'waits keep the default replica identity');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/realtime_waitlist.test.sql`
Expected: FAIL (`have: 0, want: 2`).

- [ ] **Step 3: Publish them**

`supabase/migrations/20261005000150_realtime_waitlist.sql`:
```sql
-- The player's bell and banner reload when an aviso arrives (LiveNotifications, filtered by user_id);
-- the club's "En espera" panel when someone signs up or a wait ends (LiveOccupancy). Realtime applies
-- the select policies: each player hears her own avisos and waits, staff every wait of the club.
-- The app never deletes either (a wait ends with a status).
alter publication supabase_realtime add table public.notifications, public.slot_waits;
```

- [ ] **Step 4: Run tests and regenerate types**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/realtime_waitlist.test.sql
npm run test:db
npm run db:types
npm run typecheck
npm test
```
Expected: pgTAP completo en verde (correrlo dos veces seguidas para descartar dependencias del orden). En `Functions` aparecen `create_slot_wait`, `cancel_slot_wait`, `claim_slot_hold`, `decline_slot_hold`, `release_slot_hold`, `mark_notifications_read`, `claim_notification_emails` (devuelve `{ notification_id: string; kind: "slot_held" | "slot_free_now"; data: Json; link: string; email: string; player_name: string; club_name: string; club_timezone: string; club_logo_path: string }[]`) y `finish_notification_email`. Typecheck y Vitest en verde.

- [ ] **Step 5: Commit and push**

```bash
git add supabase/migrations/20261005000150_realtime_waitlist.sql supabase/tests/database/realtime_waitlist.test.sql lib/supabase/database.types.ts
git commit -m "feat(db): avisos and waits on Realtime"
git push
```

---

## Corte 3: Dominio TS

Reglas puras, sin Supabase ni React (salvo el `fetch` de Resend, inyectable). La base tiene la última palabra.

### Task 8: Errores nuevos

**Files:**
- Modify: `lib/domain/errors.ts`
- Test: `tests/unit/lib/domain/errors.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/unit/lib/domain/errors.test.ts`, extend `DATABASE_CODES` (after `'day_use_closed', 'day_use_full', 'already_has_pass', 'no_reward', 'already_checked_in', 'not_today',`):
```ts
  'slot_available', 'too_many_waits', 'hold_expired',
```
and add inside `describe('errorMessage', …)`:
```ts
  it('explains the waitlist rules in words', () => {
    expect(errorMessage('slot_available')).toBe('Hay un turno libre en ese horario: reservalo desde la grilla.')
    expect(errorMessage('too_many_waits')).toBe('Ya estás esperando 3 turnos. Cancelá una espera para anotarte en otra.')
    expect(errorMessage('hold_expired')).toBe('Se terminó el tiempo para reservarlo y el turno pasó al siguiente de la lista.')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/errors.test.ts`
Expected: FAIL (`translates slot_available`).

- [ ] **Step 3: Write minimal implementation**

In `lib/domain/errors.ts`, add after `not_today`:
```ts
  slot_available: 'Hay un turno libre en ese horario: reservalo desde la grilla.',
  too_many_waits: 'Ya estás esperando 3 turnos. Cancelá una espera para anotarte en otra.',
  hold_expired: 'Se terminó el tiempo para reservarlo y el turno pasó al siguiente de la lista.',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/errors.ts tests/unit/lib/domain/errors.test.ts
git commit -m "feat(domain): Spanish text for the waitlist errors"
```

---

### Task 9: Esperas, retención y avisos (`lib/domain/waitlist.ts`)

**Files:**
- Create: `lib/domain/waitlist.ts`
- Test: `tests/unit/lib/domain/waitlist.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/waitlist.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { daySlots } from '@/lib/domain/slots'
import {
  countdownText,
  courtsText,
  holdText,
  notificationText,
  readNotificationData,
  shortTime,
  toNotificationView,
  toWait,
  unreadLabel,
  waitItems,
  waitRangeOptions,
  waitRangeText,
  waitText,
} from '@/lib/domain/waitlist'
import { at, COURTS, DATE, SCHEDULE, TIMEZONE } from '../../fixtures/grid'

// DATE is Thursday 2026-10-01; 2026-10-03 is a Saturday.
const SATURDAY = '2026-10-03'
const THREE_COURTS = [...COURTS, { id: 'court-3', name: 'Cancha 3', isCovered: true }]
const WAIT = toWait({ id: 'w1', on_date: SATURDAY, from_time: '18:30:00', to_time: '21:30:00', court_ids: [] })

describe('waits', () => {
  it('reads Postgres times as HH:MM, midnight included', () => {
    expect(shortTime('18:30:00')).toBe('18:30')
    expect(toWait({ id: 'w2', on_date: SATURDAY, from_time: '20:00:00', to_time: '24:00:00', court_ids: ['court-1'] })).toEqual({
      id: 'w2',
      date: SATURDAY,
      fromTime: '20:00',
      toTime: '24:00',
      courtIds: ['court-1'],
    })
  })

  it('names the courts a player waits for', () => {
    expect(courtsText([], COURTS)).toBe('cualquier cancha')
    expect(courtsText(['court-2'], COURTS)).toBe('Cancha 2')
    expect(courtsText(['court-2', 'court-1'], COURTS)).toBe('Cancha 1 y Cancha 2')
    expect(courtsText(['court-1', 'court-2', 'court-3'], THREE_COURTS)).toBe('Cancha 1, Cancha 2 y Cancha 3')
  })

  it('describes a wait for the player and for the club', () => {
    expect(waitText(WAIT, COURTS, DATE)).toBe('sáb 3, de 18:30 a 21:30, cualquier cancha')
    expect(waitText(WAIT, COURTS, SATURDAY)).toBe('Hoy, de 18:30 a 21:30, cualquier cancha')
    expect(waitRangeText({ ...WAIT, courtIds: ['court-2'] }, COURTS)).toBe('de 18:30 a 21:30, Cancha 2')
    expect(waitItems([WAIT], COURTS, DATE)).toEqual([{ id: 'w1', text: 'sáb 3, de 18:30 a 21:30, cualquier cancha' }])
  })

  it('offers the starts and ends of the slots still ahead', () => {
    expect(waitRangeOptions(daySlots(SCHEDULE, DATE), at('19:00'))).toEqual({
      from: [
        { value: '20:00', label: '20:00' },
        { value: '21:30', label: '21:30' },
      ],
      to: [
        { value: '21:30', label: '21:30' },
        { value: '23:00', label: '23:00' },
      ],
    })
  })
})

describe('holds', () => {
  const hold = { courtName: 'Cancha 2', startsAt: at('19:00', SATURDAY) }

  it('says which court was freed and when', () => {
    expect(holdText(hold, TIMEZONE, DATE)).toBe('Se liberó la Cancha 2, sáb 3 a las 19:00.')
    expect(holdText(hold, TIMEZONE, SATURDAY)).toBe('Se liberó la Cancha 2, hoy a las 19:00.')
  })

  it('counts down in minutes and seconds, never below zero', () => {
    const now = new Date('2026-10-03T20:00:00Z')
    expect(countdownText(new Date(now.getTime() + 754_000), now)).toBe('12:34')
    expect(countdownText(new Date(now.getTime() + 59_500), now)).toBe('00:59')
    expect(countdownText(new Date(now.getTime() - 1_000), now)).toBe('00:00')
  })
})

describe('avisos', () => {
  const held = {
    court_name: 'Cancha 2',
    starts_at: at('19:00', SATURDAY).toISOString(),
    expires_at: at('17:42', SATURDAY).toISOString(),
  }

  it('reads what the database wrote, and nothing else', () => {
    expect(readNotificationData(held)).toEqual({
      courtName: 'Cancha 2',
      startsAt: at('19:00', SATURDAY),
      expiresAt: at('17:42', SATURDAY),
    })
    expect(readNotificationData({ court_name: 'Cancha 2', starts_at: held.starts_at })?.expiresAt).toBeNull()
    expect(readNotificationData({ court_name: 'Cancha 2' })).toBeNull()
    expect(readNotificationData(['Cancha 2'])).toBeNull()
    expect(readNotificationData(null)).toBeNull()
  })

  it('words a held slot and a slot free right now', () => {
    const data = readNotificationData(held)!
    expect(notificationText('slot_held', data, TIMEZONE)).toEqual({
      title: 'Se liberó tu turno: sáb 3, 19:00, Cancha 2',
      body: 'Te lo guardamos hasta las 17:42. Reservalo desde Inicio antes de que pase al siguiente de la lista.',
    })
    expect(notificationText('slot_free_now', data, TIMEZONE)).toEqual({
      title: 'Se liberó la Cancha 2 a las 19:00: el primero que reserva se la queda',
      body: 'Falta poco para el turno, así que no se guarda para nadie. Si lo querés, reservalo ya.',
    })
  })

  it('turns a row into what /avisos shows', () => {
    const row = { id: 'n1', kind: 'slot_held' as const, data: held, link: '/', created_at: '2026-10-03T20:27:00Z', read_at: null }
    expect(toNotificationView(row, TIMEZONE)).toEqual({
      id: 'n1',
      title: 'Se liberó tu turno: sáb 3, 19:00, Cancha 2',
      body: 'Te lo guardamos hasta las 17:42. Reservalo desde Inicio antes de que pase al siguiente de la lista.',
      link: '/',
      createdAt: new Date('2026-10-03T20:27:00Z'),
      unread: true,
    })
    expect(toNotificationView({ ...row, read_at: '2026-10-03T20:30:00Z' }, TIMEZONE)?.unread).toBe(false)
    expect(toNotificationView({ ...row, data: {} }, TIMEZONE)).toBeNull()
  })

  it('labels the bell with what is unread', () => {
    expect(unreadLabel(0)).toBe('Avisos')
    expect(unreadLabel(1)).toBe('Avisos, 1 sin leer')
    expect(unreadLabel(3)).toBe('Avisos, 3 sin leer')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/waitlist.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/domain/waitlist"`).

- [ ] **Step 3: Write minimal implementation**

`lib/domain/waitlist.ts`:
```ts
import { dayLabel, timeIn, WEEKDAYS_SHORT } from './format'
import type { Slot } from './slots'
import { formatMinutes, localDateOf, parseLocalDate, weekdayOf, type LocalDate } from './time'

// A player waits for at most this many slots at once; create_slot_wait checks it too (too_many_waits).
export const MAX_ACTIVE_WAITS = 3

export type WaitRow = { id: string; on_date: string; from_time: string; to_time: string; court_ids: string[] }
export type Wait = { id: string; date: LocalDate; fromTime: string; toTime: string; courtIds: string[] }
// A wait as a line of text: Inicio's "Esperando turno" and the full-waits list of the sheet.
export type WaitItem = { id: string; text: string }
// A wait in the club's "En espera" panel.
export type DayWait = { id: string; playerName: string; text: string }
export type CourtName = { id: string; name: string }
export type TimeOption = { value: string; label: string }
export type Hold = { id: string; courtName: string; startsAt: Date; expiresAt: Date; price: number | null }

export type NotificationKind = 'slot_held' | 'slot_free_now'
export type NotificationData = { courtName: string; startsAt: Date; expiresAt: Date | null }
export type NotificationRow = {
  id: string
  kind: NotificationKind
  data: unknown
  link: string
  created_at: string
  read_at: string | null
}
export type NotificationView = { id: string; title: string; body: string; link: string; createdAt: Date; unread: boolean }

// Postgres time comes as 'HH:MM:SS'; the screens use 'HH:MM' ('24:00:00' stays '24:00').
export function shortTime(value: string): string {
  return value.slice(0, 5)
}

export function toWait(row: WaitRow): Wait {
  return {
    id: row.id,
    date: row.on_date,
    fromTime: shortTime(row.from_time),
    toTime: shortTime(row.to_time),
    courtIds: row.court_ids,
  }
}

// "cualquier cancha", "Cancha 2", "Cancha 1 y Cancha 2", "Cancha 1, Cancha 2 y Cancha 3", in the
// club's order.
export function courtsText(courtIds: string[], courts: CourtName[]): string {
  const names = courts.filter((court) => courtIds.includes(court.id)).map((court) => court.name)
  if (names.length === 0) return 'cualquier cancha'
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

// "de 18:30 a 21:30, cualquier cancha" (the club's panel already shows the day).
export function waitRangeText(wait: Wait, courts: CourtName[]): string {
  return `de ${wait.fromTime} a ${wait.toTime}, ${courtsText(wait.courtIds, courts)}`
}

// "sáb 3, de 18:30 a 21:30, cualquier cancha" (Hoy and Mañana for the next two days).
export function waitText(wait: Wait, courts: CourtName[], today: LocalDate): string {
  return `${dayLabel(wait.date, today)}, ${waitRangeText(wait, courts)}`
}

// The player's waits as lines of text (Inicio and the wait sheet).
export function waitItems(waits: Wait[], courts: CourtName[], today: LocalDate): WaitItem[] {
  return waits.map((wait) => ({ id: wait.id, text: waitText(wait, courts, today) }))
}

export function slotEndLabel(slot: Slot): string {
  return formatMinutes(slot.startMinutes + Math.round((slot.endsAt.getTime() - slot.startsAt.getTime()) / 60_000))
}

// What the wait sheet offers: "Desde" any start still ahead, "Hasta" any end of those slots.
// create_slot_wait reads the range the same way: a slot fits when it starts at "Desde" or later and
// ends at "Hasta" or earlier.
export function waitRangeOptions(slots: Slot[], now: Date): { from: TimeOption[]; to: TimeOption[] } {
  const ahead = slots.filter((slot) => slot.startsAt.getTime() > now.getTime())
  return {
    from: ahead.map((slot) => ({ value: slot.label, label: slot.label })),
    to: ahead.map((slot) => {
      const end = slotEndLabel(slot)
      return { value: end, label: end }
    }),
  }
}

// "Se liberó la Cancha 2, sáb 3 a las 19:00."
export function holdText(hold: Pick<Hold, 'courtName' | 'startsAt'>, timezone: string, today: LocalDate): string {
  const day = dayLabel(localDateOf(hold.startsAt, timezone), today).toLowerCase()
  return `Se liberó la ${hold.courtName}, ${day} a las ${timeIn(hold.startsAt, timezone)}.`
}

// "12:34": minutes and seconds left, never below zero.
export function countdownText(expiresAt: Date, now: Date): string {
  const seconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000))
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`
}

// "sáb 3": the day without Hoy or Mañana, for a mail that may be read later.
export function shortDay(date: LocalDate): string {
  return `${WEEKDAYS_SHORT[weekdayOf(date)]} ${parseLocalDate(date).day}`
}

function readDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// The jsonb private.offer_freed writes; anything else reads as null.
export function readNotificationData(data: unknown): NotificationData | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const record = data as Record<string, unknown>
  const startsAt = readDate(record.starts_at)
  if (typeof record.court_name !== 'string' || !startsAt) return null
  return { courtName: record.court_name, startsAt, expiresAt: readDate(record.expires_at) }
}

// The same words in /avisos and in the mail (subject and body).
export function notificationText(
  kind: NotificationKind,
  data: NotificationData,
  timezone: string,
): { title: string; body: string } {
  const time = timeIn(data.startsAt, timezone)
  if (kind === 'slot_held') {
    const until = data.expiresAt ? `hasta las ${timeIn(data.expiresAt, timezone)}` : 'unos minutos'
    return {
      title: `Se liberó tu turno: ${shortDay(localDateOf(data.startsAt, timezone))}, ${time}, ${data.courtName}`,
      body: `Te lo guardamos ${until}. Reservalo desde Inicio antes de que pase al siguiente de la lista.`,
    }
  }
  return {
    title: `Se liberó la ${data.courtName} a las ${time}: el primero que reserva se la queda`,
    body: 'Falta poco para el turno, así que no se guarda para nadie. Si lo querés, reservalo ya.',
  }
}

export function toNotificationView(row: NotificationRow, timezone: string): NotificationView | null {
  const data = readNotificationData(row.data)
  if (!data) return null
  return {
    id: row.id,
    ...notificationText(row.kind, data, timezone),
    link: row.link,
    createdAt: new Date(row.created_at),
    unread: row.read_at === null,
  }
}

// The bell's accessible name.
export function unreadLabel(count: number): string {
  if (count === 0) return 'Avisos'
  return count === 1 ? 'Avisos, 1 sin leer' : `Avisos, ${count} sin leer`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/waitlist.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/waitlist.ts tests/unit/lib/domain/waitlist.test.ts
git commit -m "feat(domain): waits, holds and avisos in words"
```

---

### Task 10: El mail, intercambiable (`lib/notify/email.ts`)

**Files:**
- Create: `lib/notify/email.ts`
- Test: `tests/unit/lib/notify/email.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/notify/email.test.ts`:
```ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { emailSenderFromEnv, resendSender } from '@/lib/notify/email'

const MESSAGE = { to: 'ana@test.local', subject: 'Se liberó tu turno', html: '<p>Hola</p>', text: 'Hola' }

describe('resendSender', () => {
  it('posts the mail to Resend with the key and the sender', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => ({ ok: true, status: 200 }) as Response)
    await resendSender({ apiKey: 're_test', from: 'Rustic <avisos@rustic.test>', fetchImpl })(MESSAGE)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ Authorization: 'Bearer re_test', 'Content-Type': 'application/json' })
    expect(JSON.parse(String(init?.body))).toEqual({
      from: 'Rustic <avisos@rustic.test>',
      to: ['ana@test.local'],
      subject: 'Se liberó tu turno',
      html: '<p>Hola</p>',
      text: 'Hola',
    })
  })

  it('throws when Resend does not take it', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => ({ ok: false, status: 422 }) as Response)
    await expect(resendSender({ apiKey: 're_test', from: 'a@b.test', fetchImpl })(MESSAGE)).rejects.toThrow(
      'Resend respondió 422',
    )
  })
})

describe('emailSenderFromEnv', () => {
  it('needs both the key and the sender address', () => {
    expect(emailSenderFromEnv({})).toBeNull()
    expect(emailSenderFromEnv({ RESEND_API_KEY: 're_test' })).toBeNull()
    expect(emailSenderFromEnv({ RESEND_API_KEY: ' ', EMAIL_FROM: 'Rustic <a@b.test>' })).toBeNull()
    expect(emailSenderFromEnv({ RESEND_API_KEY: 're_test', EMAIL_FROM: 'Rustic <a@b.test>' })).toEqual(expect.any(Function))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/notify/email.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/notify/email"`).

- [ ] **Step 3: Write minimal implementation**

`lib/notify/email.ts`:
```ts
export type EmailMessage = { to: string; subject: string; html: string; text: string }

// Sends one mail or throws. Resend is the first implementation; another provider only has to match it.
export type EmailSender = (message: EmailMessage) => Promise<void>

const RESEND_URL = 'https://api.resend.com/emails'

// Resend's HTTP API with fetch: no SDK needed.
export function resendSender({
  apiKey,
  from,
  fetchImpl = fetch,
}: {
  apiKey: string
  from: string
  fetchImpl?: typeof fetch
}): EmailSender {
  return async (message) => {
    const response = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
    })
    if (!response.ok) throw new Error(`Resend respondió ${response.status}`)
  }
}

// Without RESEND_API_KEY and EMAIL_FROM nothing is mailed: avisos stay in the app.
export function emailSenderFromEnv(env: Record<string, string | undefined> = process.env): EmailSender | null {
  const apiKey = env.RESEND_API_KEY?.trim()
  const from = env.EMAIL_FROM?.trim()
  return apiKey && from ? resendSender({ apiKey, from }) : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/notify/email.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/notify/email.ts tests/unit/lib/notify/email.test.ts
git commit -m "feat(notify): mail through Resend behind EmailSender"
```

---

### Task 11: El mail de cada aviso (`lib/notify/messages.ts`)

**Files:**
- Create: `lib/notify/messages.ts`
- Test: `tests/unit/lib/notify/messages.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/notify/messages.test.ts`:
```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildEmail, type PendingEmail } from '@/lib/notify/messages'

// Saturday 2026-10-03: 22:00 UTC is 19:00 in Montevideo; 20:42 UTC is 17:42.
const HELD: PendingEmail = {
  id: 'n1',
  kind: 'slot_held',
  data: { court_name: 'Cancha 2', starts_at: '2026-10-03T22:00:00Z', expires_at: '2026-10-03T20:42:00Z' },
  link: '/',
  email: 'ana@test.local',
  playerName: 'Ana Pérez',
  clubName: 'Rustic Pádel',
  clubTimezone: 'America/Montevideo',
  clubLogoPath: 'club-1/logo-1.png',
}
const URLS = { siteUrl: 'https://rustic.test', supabaseUrl: 'https://db.test' }

describe('buildEmail', () => {
  it('mails a held slot in castellano, with the logo, the colors and the link', () => {
    const mail = buildEmail(HELD, URLS)!
    expect(mail.to).toBe('ana@test.local')
    expect(mail.subject).toBe('Se liberó tu turno: sáb 3, 19:00, Cancha 2')
    expect(mail.text).toContain('Hola, Ana:')
    expect(mail.text).toContain('Te lo guardamos hasta las 17:42.')
    expect(mail.text).toContain('Reservar ahora: https://rustic.test/')
    expect(mail.html).toContain('src="https://db.test/storage/v1/object/public/club-logos/club-1/logo-1.png"')
    expect(mail.html).toContain('#FCB021')
    expect(mail.html).toContain('href="https://rustic.test/"')
  })

  it('mails a slot free right now with the link to that day', () => {
    const mail = buildEmail({ ...HELD, kind: 'slot_free_now', link: '/reservar?dia=2026-10-03', clubLogoPath: null }, URLS)!
    expect(mail.subject).toBe('Se liberó la Cancha 2 a las 19:00: el primero que reserva se la queda')
    expect(mail.html).toContain('href="https://rustic.test/reservar?dia=2026-10-03"')
    expect(mail.html).toContain('Ver el turno')
    expect(mail.html).not.toContain('<img')
    expect(mail.html).toContain('Rustic Pádel')
  })

  it('escapes what people typed', () => {
    const mail = buildEmail({ ...HELD, playerName: '<b>Ana</b>' }, URLS)!
    expect(mail.html).toContain('&lt;b&gt;Ana&lt;/b&gt;')
    expect(mail.html).not.toContain('<b>Ana')
  })

  it('builds nothing without an address or with data it cannot read', () => {
    expect(buildEmail({ ...HELD, email: null }, URLS)).toBeNull()
    expect(buildEmail({ ...HELD, data: {} }, URLS)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/notify/messages.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/notify/messages"`).

- [ ] **Step 3: Write minimal implementation**

`lib/notify/messages.ts`:
```ts
import { clubLogoUrl } from '@/lib/domain/club-logo'
import { firstName } from '@/lib/domain/profile'
import { notificationText, readNotificationData, type NotificationKind } from '@/lib/domain/waitlist'
import type { EmailMessage } from './email'

// One aviso waiting to be mailed, as claim_notification_emails returns it.
export type PendingEmail = {
  id: string
  kind: NotificationKind
  data: unknown
  link: string
  email: string | null
  playerName: string
  clubName: string
  clubTimezone: string
  clubLogoPath: string | null
}

// Rustic's colors (app/globals.css, dark mode): the club does not store its own yet.
const COLORS = {
  background: '#021716',
  surface: '#0A2624',
  text: '#FFFFFF',
  muted: '#B8C4C3',
  accent: '#FCB021',
  onAccent: '#000000',
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

// The mail for one aviso: the same words as /avisos, the club's logo and a button to the app.
// null when it cannot be built (no address, data it cannot read).
export function buildEmail(item: PendingEmail, urls: { siteUrl: string; supabaseUrl: string }): EmailMessage | null {
  const data = readNotificationData(item.data)
  if (!item.email || !data) return null
  const { title, body } = notificationText(item.kind, data, item.clubTimezone)
  const link = `${urls.siteUrl}${item.link}`
  const logo = clubLogoUrl(urls.supabaseUrl, item.clubLogoPath)
  const button = item.kind === 'slot_held' ? 'Reservar ahora' : 'Ver el turno'
  const greeting = `Hola, ${firstName(item.playerName)}:`
  const footer = `${item.clubName}: te escribimos porque te anotaste en la lista de espera.`
  const brand = logo
    ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(item.clubName)}" width="56" height="56" style="display:block;border-radius:12px;margin:0 0 16px">`
    : `<p style="margin:0 0 16px;font-weight:bold;color:${COLORS.accent}">${escapeHtml(item.clubName)}</p>`

  const html = [
    '<!doctype html>',
    `<html lang="es"><body style="margin:0;background:${COLORS.background};font-family:Arial,Helvetica,sans-serif;color:${COLORS.text}">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.background}"><tr><td align="center" style="padding:24px 16px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${COLORS.surface};border-radius:16px"><tr><td style="padding:24px">`,
    brand,
    `<p style="margin:0 0 8px;color:${COLORS.muted}">${escapeHtml(greeting)}</p>`,
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:${COLORS.text}">${escapeHtml(title)}</h1>`,
    `<p style="margin:0 0 20px;line-height:1.5;color:${COLORS.muted}">${escapeHtml(body)}</p>`,
    `<a href="${escapeHtml(link)}" style="display:inline-block;background:${COLORS.accent};color:${COLORS.onAccent};font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:12px">${button}</a>`,
    '</td></tr></table>',
    `<p style="margin:16px 0 0;font-size:12px;color:${COLORS.muted}">${escapeHtml(footer)}</p>`,
    '</td></tr></table></body></html>',
  ].join('')

  const text = `${greeting}\n\n${title}.\n${body}\n\n${button}: ${link}\n\n${footer}`
  return { to: item.email, subject: title, html, text }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/notify/messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/notify/messages.ts tests/unit/lib/notify/messages.test.ts
git commit -m "feat(notify): the mail of each aviso, with the club's logo"
```

---

### Task 12: Mandar lo pendiente (`lib/notify/send-pending.ts`)

**Files:**
- Create: `lib/notify/send-pending.ts`
- Test: `tests/unit/lib/notify/send-pending.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/notify/send-pending.test.ts`:
```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EmailSender } from '@/lib/notify/email'
import type { PendingEmail } from '@/lib/notify/messages'
import { sendPending, type OutboxStore } from '@/lib/notify/send-pending'

// 20:30 UTC: the hold (until 20:42 UTC) is still on; the slot starts at 22:00 UTC.
const NOW = new Date('2026-10-03T20:30:00Z')
const OPTIONS = { siteUrl: 'https://rustic.test', supabaseUrl: 'https://db.test', now: NOW }

function pending(id: string, overrides: Partial<PendingEmail> = {}): PendingEmail {
  return {
    id,
    kind: 'slot_held',
    data: { court_name: 'Cancha 2', starts_at: '2026-10-03T22:00:00Z', expires_at: '2026-10-03T20:42:00Z' },
    link: '/',
    email: `${id}@test.local`,
    playerName: 'Ana',
    clubName: 'Rustic Pádel',
    clubTimezone: 'America/Montevideo',
    clubLogoPath: null,
    ...overrides,
  }
}

function fakeStore(items: PendingEmail[]) {
  const claim = vi.fn<OutboxStore['claim']>(async () => items)
  const finish = vi.fn<OutboxStore['finish']>(async () => {})
  return { store: { claim, finish }, claim, finish }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sendPending', () => {
  it('mails each claimed aviso and marks it sent', async () => {
    const { store, claim, finish } = fakeStore([pending('n1'), pending('n2')])
    const sender = vi.fn<EmailSender>(async () => {})
    expect(await sendPending(store, sender, OPTIONS)).toEqual({ sent: 2, failed: 0, skipped: 0 })
    expect(claim).toHaveBeenCalledWith(20)
    expect(sender.mock.calls[0][0]).toMatchObject({ to: 'n1@test.local', subject: 'Se liberó tu turno: sáb 3, 19:00, Cancha 2' })
    expect(finish.mock.calls).toEqual([
      ['n1', 'sent'],
      ['n2', 'sent'],
    ])
  })

  it('marks a mail that did not go out as failed, so it is retried', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { store, finish } = fakeStore([pending('n1'), pending('n2')])
    const sender = vi.fn<EmailSender>(async (message) => {
      if (message.to === 'n1@test.local') throw new Error('Resend respondió 500')
    })
    expect(await sendPending(store, sender, OPTIONS)).toEqual({ sent: 1, failed: 1, skipped: 0 })
    expect(finish.mock.calls).toEqual([
      ['n1', 'failed'],
      ['n2', 'sent'],
    ])
  })

  it('skips everything without a sender: the aviso stays in the app', async () => {
    const { store, finish } = fakeStore([pending('n1')])
    expect(await sendPending(store, null, OPTIONS)).toEqual({ sent: 0, failed: 0, skipped: 1 })
    expect(finish).toHaveBeenCalledWith('n1', 'skipped')
  })

  it('skips a hold that already ran out, a slot that already started and an aviso without an address', async () => {
    const { store, finish } = fakeStore([
      pending('n1', { data: { court_name: 'Cancha 2', starts_at: '2026-10-03T22:00:00Z', expires_at: '2026-10-03T20:00:00Z' } }),
      pending('n2', { kind: 'slot_free_now', data: { court_name: 'Cancha 2', starts_at: '2026-10-03T20:00:00Z' } }),
      pending('n3', { email: null }),
    ])
    const sender = vi.fn<EmailSender>(async () => {})
    expect(await sendPending(store, sender, OPTIONS)).toEqual({ sent: 0, failed: 0, skipped: 3 })
    expect(sender).not.toHaveBeenCalled()
    expect(finish.mock.calls.map(([, outcome]) => outcome)).toEqual(['skipped', 'skipped', 'skipped'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/notify/send-pending.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/notify/send-pending"`).

- [ ] **Step 3: Write minimal implementation**

`lib/notify/send-pending.ts`:
```ts
import { readNotificationData } from '@/lib/domain/waitlist'
import type { EmailSender } from './email'
import { buildEmail, type PendingEmail } from './messages'

export type EmailOutcome = 'sent' | 'failed' | 'skipped'

// Where the avisos wait to be mailed (the notifications table, through the service role).
export type OutboxStore = {
  claim: (limit: number) => Promise<PendingEmail[]>
  finish: (id: string, outcome: EmailOutcome) => Promise<void>
}

export type OutboxReport = Record<EmailOutcome, number>

const BATCH = 20

// Too late to be useful: the hold ran out, or the slot already started.
function isStale(item: PendingEmail, now: Date): boolean {
  const data = readNotificationData(item.data)
  if (!data) return true
  const deadline = item.kind === 'slot_held' ? data.expiresAt : data.startsAt
  return !deadline || deadline.getTime() <= now.getTime()
}

// Claims a batch (two runs never take the same aviso), mails each one and marks how it went. Without a
// sender everything is skipped: the player still has the aviso in the app.
export async function sendPending(
  store: OutboxStore,
  sender: EmailSender | null,
  options: { siteUrl: string; supabaseUrl: string; now?: Date },
): Promise<OutboxReport> {
  const report: OutboxReport = { sent: 0, failed: 0, skipped: 0 }
  const now = options.now ?? new Date()
  for (const item of await store.claim(BATCH)) {
    const message = sender && !isStale(item, now) ? buildEmail(item, options) : null
    let outcome: EmailOutcome = 'skipped'
    if (sender && message) {
      try {
        await sender(message)
        outcome = 'sent'
      } catch (error) {
        console.error(`No se pudo mandar el aviso ${item.id}`, error)
        outcome = 'failed'
      }
    }
    await store.finish(item.id, outcome)
    report[outcome] += 1
  }
  return report
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/notify/send-pending.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/notify/send-pending.ts tests/unit/lib/notify/send-pending.test.ts
git commit -m "feat(notify): mail what is pending and mark how it went"
```

---

## Corte 4: Datos, acciones y envío

### Task 13: La *outbox* desde Next (service role, `after`)

**Files:**
- Create: `lib/supabase/admin.ts`
- Create: `lib/notify/outbox.ts`
- Modify: `lib/actions/revalidate.ts`
- Test: `tests/unit/lib/notify/outbox.test.ts`, `tests/unit/lib/actions/revalidate.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/lib/notify/outbox.test.ts`:
```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ admin: null as unknown, sender: null as unknown }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mocks.admin }))
vi.mock('@/lib/notify/email', () => ({ emailSenderFromEnv: () => mocks.sender }))

const { flushOutbox } = await import('@/lib/notify/outbox')

// A hold far in the future, so the run never finds it stale.
const ROW = {
  notification_id: 'n1',
  kind: 'slot_held',
  data: { court_name: 'Cancha 2', starts_at: '2099-10-03T22:00:00Z', expires_at: '2099-10-03T20:42:00Z' },
  link: '/',
  email: 'ana@test.local',
  player_name: 'Ana',
  club_name: 'Rustic Pádel',
  club_timezone: 'America/Montevideo',
  club_logo_path: null,
}

beforeEach(() => {
  mocks.admin = null
  mocks.sender = null
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.test')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://rustic.test')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('flushOutbox', () => {
  it('does nothing without the service role key', async () => {
    expect(await flushOutbox()).toEqual({ sent: 0, failed: 0, skipped: 0 })
  })

  it('claims through the database, mails each aviso and marks it', async () => {
    const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: null }>>(
      async (name) => ({ data: name === 'claim_notification_emails' ? [ROW] : null, error: null }),
    )
    const sender = vi.fn<(message: { to: string; text: string }) => Promise<void>>(async () => {})
    mocks.admin = { rpc }
    mocks.sender = sender
    expect(await flushOutbox()).toEqual({ sent: 1, failed: 0, skipped: 0 })
    expect(rpc).toHaveBeenCalledWith('claim_notification_emails', { p_limit: 20 })
    expect(sender).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ana@test.local', text: expect.stringContaining('https://rustic.test/') }),
    )
    expect(rpc).toHaveBeenCalledWith('finish_notification_email', { p_id: 'n1', p_status: 'sent' })
  })
})
```

`tests/unit/lib/actions/revalidate.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  after: vi.fn<(callback: () => Promise<void>) => void>(),
  flushOutbox: vi.fn<() => Promise<unknown>>(async () => ({ sent: 0, failed: 0, skipped: 0 })),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/server', () => ({ after: mocks.after }))
vi.mock('@/lib/notify/outbox', () => ({ flushOutbox: mocks.flushOutbox }))

const { revalidateBookings } = await import('@/lib/actions/revalidate')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('revalidateBookings', () => {
  it('refreshes every screen and mails the queued avisos once the response is out', async () => {
    revalidateBookings()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(mocks.after).toHaveBeenCalledTimes(1)
    expect(mocks.flushOutbox).not.toHaveBeenCalled()
    await mocks.after.mock.calls[0][0]()
    expect(mocks.flushOutbox).toHaveBeenCalledTimes(1)
  })

  it('never lets a failed mail run break the write', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.flushOutbox.mockRejectedValueOnce(new Error('sin red'))
    revalidateBookings()
    await expect(mocks.after.mock.calls[0][0]()).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/notify/outbox.test.ts tests/unit/lib/actions/revalidate.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/notify/outbox"`).

- [ ] **Step 3: Write the service role client**

`lib/supabase/admin.ts`:
```ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { getSupabaseEnv } from './env'

// Service role: skips RLS. Only the outbox uses it, and only through claim_notification_emails and
// finish_notification_email. null without SUPABASE_SERVICE_ROLE_KEY: the avisos stay in the app.
// The key never gets a NEXT_PUBLIC_ prefix and this file never reaches the browser.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!key) return null
  return createClient<Database>(getSupabaseEnv().url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

- [ ] **Step 4: Write the outbox**

`lib/notify/outbox.ts`:
```ts
import 'server-only'
import { getSiteUrl } from '@/lib/auth/redirect'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { emailSenderFromEnv } from './email'
import { sendPending, type OutboxReport, type OutboxStore } from './send-pending'

const NOTHING: OutboxReport = { sent: 0, failed: 0, skipped: 0 }

// The notifications table through the two service-role functions.
function databaseStore(): OutboxStore | null {
  const admin = createAdminClient()
  if (!admin) return null
  return {
    async claim(limit) {
      const { data, error } = await admin.rpc('claim_notification_emails', { p_limit: limit })
      if (error) throw error
      return (data ?? []).map((row) => ({
        id: row.notification_id,
        kind: row.kind,
        data: row.data,
        link: row.link,
        email: row.email,
        playerName: row.player_name,
        clubName: row.club_name,
        clubTimezone: row.club_timezone,
        clubLogoPath: row.club_logo_path,
      }))
    },
    async finish(id, outcome) {
      const { error } = await admin.rpc('finish_notification_email', { p_id: id, p_status: outcome })
      if (error) throw error
    },
  }
}

// Mails the queued avisos. Runs after every write (revalidateBookings) and from POST
// /api/avisos/enviar, which an external cron calls every minute for what pg_cron frees.
export async function flushOutbox(): Promise<OutboxReport> {
  const store = databaseStore()
  if (!store) return NOTHING
  return sendPending(store, emailSenderFromEnv(), { siteUrl: getSiteUrl(), supabaseUrl: getSupabaseEnv().url })
}
```

- [ ] **Step 5: Mail after every write**

Replace `lib/actions/revalidate.ts` with:
```ts
import 'server-only'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { flushOutbox } from '@/lib/notify/outbox'

// Every screen reads bookings and occupancies, so any write refreshes the whole app. Any write may also
// free a court and queue an aviso (the waitlist): it is mailed once the response is out.
export function revalidateBookings(): void {
  revalidatePath('/', 'layout')
  after(async () => {
    try {
      await flushOutbox()
    } catch (error) {
      console.error('No se pudieron mandar los avisos', error)
    }
  })
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/lib/notify/outbox.test.ts tests/unit/lib/actions/revalidate.test.ts
npm run typecheck
npm test
```
Expected: PASS. Si el tipo generado de `claim_notification_emails` difiere (por ejemplo `email: string | null`), ajustar `PendingEmail`, nunca castear.

- [ ] **Step 7: Commit**

```bash
git add lib/supabase/admin.ts lib/notify/outbox.ts lib/actions/revalidate.ts tests/unit/lib/notify/outbox.test.ts tests/unit/lib/actions/revalidate.test.ts
git commit -m "feat(notify): mail the queued avisos after every write"
```

---

### Task 14: `POST /api/avisos/enviar` con secreto

**Files:**
- Create: `app/api/avisos/enviar/route.ts`
- Test: `tests/unit/app/api/avisos-enviar.test.ts`

- [ ] **Step 1: Leer la guía**

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (métodos, `Request`/`Response`, sin caché en `POST`).

- [ ] **Step 2: Write the failing test**

`tests/unit/app/api/avisos-enviar.test.ts`:
```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const flushOutbox = vi.fn(async () => ({ sent: 1, failed: 0, skipped: 2 }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/notify/outbox', () => ({ flushOutbox: () => flushOutbox() }))

const { POST } = await import('@/app/api/avisos/enviar/route')

function request(authorization?: string): Request {
  return new Request('http://localhost:3000/api/avisos/enviar', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  })
}

beforeEach(() => {
  flushOutbox.mockClear()
  vi.stubEnv('NOTIFY_SECRET', 'secreto-del-cron')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/avisos/enviar', () => {
  it('mails the pending avisos when the cron brings the secret', async () => {
    const response = await POST(request('Bearer secreto-del-cron'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ sent: 1, failed: 0, skipped: 2 })
    expect(flushOutbox).toHaveBeenCalledTimes(1)
  })

  it('rejects a call without the secret or with another one', async () => {
    expect((await POST(request())).status).toBe(401)
    expect((await POST(request('Bearer otro'))).status).toBe(401)
    expect((await POST(request('secreto-del-cron'))).status).toBe(401)
    expect(flushOutbox).not.toHaveBeenCalled()
  })

  it('rejects everything while the server has no secret', async () => {
    vi.stubEnv('NOTIFY_SECRET', '')
    expect((await POST(request('Bearer '))).status).toBe(401)
    expect(flushOutbox).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/app/api/avisos-enviar.test.ts`
Expected: FAIL (`Failed to resolve import "@/app/api/avisos/enviar/route"`).

- [ ] **Step 4: Write minimal implementation**

`app/api/avisos/enviar/route.ts`:
```ts
import { timingSafeEqual } from 'node:crypto'
import { flushOutbox } from '@/lib/notify/outbox'

function hasSecret(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(header ?? '')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

// An external cron (cron-job.org; the system cron on a VPS) calls this every minute with
// "Authorization: Bearer <NOTIFY_SECRET>", for the avisos of what pg_cron frees. Writes from the app mail
// their own avisos with after() (lib/actions/revalidate.ts). Without NOTIFY_SECRET nobody gets in.
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.NOTIFY_SECRET?.trim()
  if (!secret || !hasSecret(request.headers.get('authorization'), secret)) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }
  return Response.json(await flushOutbox())
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
npx vitest run tests/unit/app/api/avisos-enviar.test.ts
npm run typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/avisos/enviar/route.ts tests/unit/app/api/avisos-enviar.test.ts
git commit -m "feat(notify): secret endpoint for the external mail cron"
```

---

### Task 15: Carga de esperas, retención y avisos

**Files:**
- Create: `lib/data/waitlist.ts`
- Modify: `lib/data/day.ts:74` (la grilla lee `expires_at`)

- [ ] **Step 1: La grilla lee hasta cuándo está retenida una cancha**

In `lib/data/day.ts`, in the `court_occupancy` query, replace:
```ts
      .select('id, court_id, kind, starts_at, ends_at, tournament_id')
```
with:
```ts
      .select('id, court_id, kind, starts_at, ends_at, tournament_id, expires_at')
```
(`toOccupancy` ya lo lee desde la Task 3.)

- [ ] **Step 2: Write the loaders** (no test — lecturas de Supabase con la sesión del usuario; las reglas están en `lib/domain/waitlist.ts`, con sus tests, y el flujo lo cubre el e2e)

`lib/data/waitlist.ts`:
```ts
import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import { priceFor } from '@/lib/domain/slots'
import { localDateOf, minutesOfDay, toDate, type LocalDate } from '@/lib/domain/time'
import {
  toNotificationView,
  toWait,
  waitRangeText,
  type CourtName,
  type DayWait,
  type Hold,
  type NotificationView,
  type Wait,
} from '@/lib/domain/waitlist'
import { createClient } from '@/lib/supabase/server'

export type MyWaitlist = { waits: Wait[]; hold: Hold | null; courts: CourtName[] }

// The player's waiting waits, her active hold (with the slot's price, the same rule as
// private.slot_price) and the club's active courts to name them. RLS returns only hers.
// If supabase-js infers a slightly different shape for the court embed, adjust the code; never cast.
export async function loadMyWaitlist(viewer: { userId: string; club: Club }, now = new Date()): Promise<MyWaitlist> {
  const { club } = viewer
  const supabase = await createClient()
  const [waits, holds, courts, rules] = await Promise.all([
    supabase
      .from('slot_waits')
      .select('id, on_date, from_time, to_time, court_ids')
      .eq('player_id', viewer.userId)
      .eq('status', 'waiting')
      .order('on_date')
      .order('from_time'),
    supabase
      .from('slot_holds')
      .select('id, starts_at, expires_at, court:courts(name)')
      .eq('player_id', viewer.userId)
      .eq('status', 'active')
      .gt('expires_at', now.toISOString())
      .limit(1),
    supabase.from('courts').select('id, name').eq('club_id', club.id).eq('is_active', true).order('sort_order'),
    supabase.from('pricing_rules').select('weekdays, from_time, to_time, price').eq('club_id', club.id),
  ])
  if (waits.error) throw waits.error
  if (holds.error) throw holds.error
  if (courts.error) throw courts.error
  if (rules.error) throw rules.error

  const row = holds.data[0]
  let hold: Hold | null = null
  if (row) {
    const startsAt = toDate(row.starts_at)
    const pricing = rules.data.map((rule) => ({
      weekdays: rule.weekdays,
      fromTime: rule.from_time,
      toTime: rule.to_time,
      price: rule.price,
    }))
    hold = {
      id: row.id,
      courtName: row.court?.name ?? 'Cancha',
      startsAt,
      expiresAt: toDate(row.expires_at),
      price: priceFor(pricing, localDateOf(startsAt, club.timezone), minutesOfDay(startsAt, club.timezone)),
    }
  }
  return { waits: waits.data.map(toWait), hold, courts: courts.data }
}

// The club's "En espera" panel: who waits on that date and for what, first in line first.
export async function loadDayWaits(club: Club, date: LocalDate): Promise<DayWait[]> {
  const supabase = await createClient()
  const [waits, courts] = await Promise.all([
    supabase
      .from('slot_waits')
      .select('id, on_date, from_time, to_time, court_ids, player:profiles!slot_waits_player_id_fkey(display_name)')
      .eq('club_id', club.id)
      .eq('on_date', date)
      .eq('status', 'waiting')
      .order('created_at'),
    supabase.from('courts').select('id, name').eq('club_id', club.id).eq('is_active', true).order('sort_order'),
  ])
  if (waits.error) throw waits.error
  if (courts.error) throw courts.error
  return waits.data.map((row) => ({
    id: row.id,
    playerName: row.player?.display_name ?? 'Sin nombre',
    text: waitRangeText(toWait(row), courts.data),
  }))
}

// The bell: avisos not read yet.
export async function countUnreadNotifications(userId: string): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)
  if (error) throw error
  return count ?? 0
}

// /avisos: the latest 50, newest first.
export async function loadNotifications(viewer: { userId: string; club: Club }): Promise<NotificationView[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, data, link, created_at, read_at')
    .eq('user_id', viewer.userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data.flatMap((row) => {
    const view = toNotificationView(row, viewer.club.timezone)
    return view ? [view] : []
  })
}
```

- [ ] **Step 3: Typecheck and tests**

Run:
```bash
npm run typecheck
npm test
npm run lint
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/data/waitlist.ts lib/data/day.ts
git commit -m "feat(data): load waits, holds and avisos"
```

---

### Task 16: Acciones de la lista de espera

**Files:**
- Create: `lib/actions/waitlist.ts`
- Modify: `app/(club)/club/grilla/actions.ts` (agrega `releaseSlotHold` al final)
- Test: `tests/unit/lib/actions/waitlist-actions.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/actions/waitlist-actions.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INVALID_INPUT } from '@/lib/actions/result'

// Server Actions are reachable by any POST: bad input must stop before any RPC.
type RpcResult = { data: unknown; error: { message: string } | null }
const rpc = vi.fn<(name: string, args?: Record<string, unknown>) => Promise<RpcResult>>(async () => ({
  data: null,
  error: null,
}))
const state = vi.hoisted(() => ({ signedIn: true }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('@/lib/auth/viewer', () => ({
  getViewer: async () => (state.signedIn ? { userId: 'u1', club: { id: 'club-1', timezone: 'America/Montevideo' } } : null),
}))

const { cancelSlotWait, claimSlotHold, createSlotWait, declineSlotHold, markNotificationsRead } = await import(
  '@/lib/actions/waitlist'
)
const { releaseSlotHold } = await import('@/app/(club)/club/grilla/actions')
const { errorMessage } = await import('@/lib/domain/errors')

const C1 = '22222222-2222-2222-2222-222222222201'
const C2 = '22222222-2222-2222-2222-222222222202'
const ID = '55555555-5555-5555-5555-555555555555'
const IDLE = { status: 'idle' as const }
const WAIT = { date: '2026-10-03', fromTime: '18:30', toTime: '21:30', courtIds: [C1, C2] }

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item)
  }
  return data
}

beforeEach(() => {
  rpc.mockClear()
  state.signedIn = true
})

describe('createSlotWait', () => {
  it('rejects bad input without calling the database', async () => {
    expect(await createSlotWait(IDLE, form({ ...WAIT, date: '2026-02-30' }))).toEqual(INVALID_INPUT)
    expect(await createSlotWait(IDLE, form({ ...WAIT, fromTime: '21:30', toTime: '18:30' }))).toEqual(INVALID_INPUT)
    expect(await createSlotWait(IDLE, form({ ...WAIT, toTime: '25:00' }))).toEqual(INVALID_INPUT)
    expect(await createSlotWait(IDLE, form({ ...WAIT, courtIds: [] }))).toEqual(INVALID_INPUT)
    expect(await createSlotWait(IDLE, form({ ...WAIT, courtIds: [C1, 'cancha-2'] }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('signs up for the club with the range and the courts picked', async () => {
    expect(await createSlotWait(IDLE, form(WAIT))).toEqual({
      status: 'ok',
      message: 'Listo, te anotamos. Si se libera un turno, te lo guardamos unos minutos y te avisamos acá y por mail.',
    })
    expect(rpc).toHaveBeenCalledWith('create_slot_wait', {
      p_club_id: 'club-1',
      p_date: '2026-10-03',
      p_from: '18:30',
      p_to: '21:30',
      p_court_ids: [C1, C2],
    })
  })

  it('says why it could not', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'slot_available' } })
    expect(await createSlotWait(IDLE, form(WAIT))).toEqual({ status: 'error', message: errorMessage('slot_available') })
  })

  it('asks to sign in again when the session ran out', async () => {
    state.signedIn = false
    expect((await createSlotWait(IDLE, form(WAIT))).status).toBe('error')
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('waits and holds', () => {
  it('rejects a bad id without calling the database', async () => {
    const bad = form({ waitId: 'w1', holdId: 'h1', occupancyId: 'o1' })
    for (const action of [cancelSlotWait, claimSlotHold, declineSlotHold, releaseSlotHold]) {
      expect(await action(IDLE, bad)).toEqual(INVALID_INPUT)
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('calls each function with its id', async () => {
    expect((await cancelSlotWait(IDLE, form({ waitId: ID }))).message).toBe('Cancelaste la espera.')
    expect((await claimSlotHold(IDLE, form({ holdId: ID }))).message).toBe('Listo, reservaste la cancha. La ves en Tus reservas.')
    expect((await declineSlotHold(IDLE, form({ holdId: ID }))).message).toBe('Listo, se lo pasamos al siguiente de la lista.')
    expect((await releaseSlotHold(IDLE, form({ occupancyId: ID }))).message).toBe('Listo, el turno pasó al siguiente de la lista.')
    expect(rpc.mock.calls).toEqual([
      ['cancel_slot_wait', { p_wait_id: ID }],
      ['claim_slot_hold', { p_hold_id: ID }],
      ['decline_slot_hold', { p_hold_id: ID }],
      ['release_slot_hold', { p_occupancy_id: ID }],
    ])
  })

  it('tells the player when the hold ran out', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'hold_expired' } })
    expect(await claimSlotHold(IDLE, form({ holdId: ID }))).toEqual({ status: 'error', message: errorMessage('hold_expired') })
  })

  it('marks the avisos read', async () => {
    await markNotificationsRead()
    expect(rpc).toHaveBeenCalledWith('mark_notifications_read')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/actions/waitlist-actions.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/actions/waitlist"`).

- [ ] **Step 3: Write the player actions**

`lib/actions/waitlist.ts`:
```ts
'use server'

import { failed, fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { getViewer } from '@/lib/auth/viewer'
import { isUuid, readLocalDate, readTime, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

// "Avisame si se libera": a date, a range of the grid and at least one court (every court picked is
// stored as any court by create_slot_wait).
export async function createSlotWait(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return failed('Tu sesión venció. Volvé a ingresar.')
  const date = readLocalDate(form, 'date')
  const fromTime = readTime(form, 'fromTime')
  const toTime = readTime(form, 'toTime')
  const picked = form.getAll('courtIds')
  const courtIds = picked.filter(isUuid).map((id) => id.toLowerCase())
  if (
    !date ||
    !fromTime ||
    !toTime ||
    fromTime >= toTime ||
    courtIds.length === 0 ||
    courtIds.length !== picked.length ||
    courtIds.length > 20
  ) {
    return INVALID_INPUT
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_slot_wait', {
    p_club_id: viewer.club.id,
    p_date: date,
    p_from: fromTime,
    p_to: toTime,
    p_court_ids: courtIds,
  })
  revalidateBookings()
  return fromRpc(error, 'Listo, te anotamos. Si se libera un turno, te lo guardamos unos minutos y te avisamos acá y por mail.')
}

export async function cancelSlotWait(_previous: ActionState, form: FormData): Promise<ActionState> {
  const waitId = readUuid(form, 'waitId')
  if (!waitId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_slot_wait', { p_wait_id: waitId })
  revalidateBookings()
  return fromRpc(error, 'Cancelaste la espera.')
}

// "Reservar" on the banner: the held slot becomes her booking, to pay like any other.
export async function claimSlotHold(_previous: ActionState, form: FormData): Promise<ActionState> {
  const holdId = readUuid(form, 'holdId')
  if (!holdId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('claim_slot_hold', { p_hold_id: holdId })
  revalidateBookings()
  return fromRpc(error, 'Listo, reservaste la cancha. La ves en Tus reservas.')
}

// "No me sirve": the slot goes to the next in line.
export async function declineSlotHold(_previous: ActionState, form: FormData): Promise<ActionState> {
  const holdId = readUuid(form, 'holdId')
  if (!holdId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('decline_slot_hold', { p_hold_id: holdId })
  revalidateBookings()
  return fromRpc(error, 'Listo, se lo pasamos al siguiente de la lista.')
}

// Called by /avisos once it is open; the bell goes quiet on the next render.
export async function markNotificationsRead(): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_notifications_read')
  if (!error) revalidateBookings()
}
```

- [ ] **Step 4: Write the staff action**

Append to `app/(club)/club/grilla/actions.ts`:
```ts
// "Pasar al siguiente" on a held court.
export async function releaseSlotHold(_previous: ActionState, form: FormData): Promise<ActionState> {
  const occupancyId = readUuid(form, 'occupancyId')
  if (!occupancyId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('release_slot_hold', { p_occupancy_id: occupancyId })
  revalidateBookings()
  return fromRpc(error, 'Listo, el turno pasó al siguiente de la lista.')
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
npx vitest run tests/unit/lib/actions/waitlist-actions.test.ts
npm run typecheck
npm run lint
```
Expected: PASS.

- [ ] **Step 6: Commit and push**

```bash
git add lib/actions/waitlist.ts "app/(club)/club/grilla/actions.ts" tests/unit/lib/actions/waitlist-actions.test.ts
git commit -m "feat(actions): sign up, cancel, book, pass on and release"
git push
```

---

## Corte 5: Pantallas del jugador

### Task 17: La ventana "Avisame si se libera" (`WaitSheet`)

**Files:**
- Create: `components/waitlist/wait-sheet.tsx`
- Test: `tests/unit/components/waitlist/wait-sheet.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/waitlist/wait-sheet.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { FormAction } from '@/components/ui/action-form'
import { WaitSheet } from '@/components/waitlist/wait-sheet'
import { daySlots } from '@/lib/domain/slots'
import { waitRangeOptions } from '@/lib/domain/waitlist'
import { at, COURTS, DATE, SCHEDULE } from '../../fixtures/grid'

// Before the club opens: every slot of the day is ahead (08:00 ... 21:30).
const OPTIONS = waitRangeOptions(daySlots(SCHEDULE, DATE), at('07:00'))
const done = async () => ({ status: 'ok' as const, message: 'Listo, te anotamos.' })

function renderSheet(overrides: Partial<ComponentProps<typeof WaitSheet>> = {}) {
  const createAction = vi.fn<FormAction>(done)
  const cancelAction = vi.fn<FormAction>(done)
  const onDone = vi.fn()
  render(
    <WaitSheet
      open
      onClose={vi.fn()}
      date={DATE}
      dayText="jueves 1 de octubre"
      courts={COURTS}
      options={OPTIONS}
      initial={null}
      activeWaits={[]}
      createAction={createAction}
      cancelAction={cancelAction}
      onDone={onDone}
      {...overrides}
    />,
  )
  const sent = () => {
    const data = createAction.mock.calls[0][1]
    return { date: data.get('date'), fromTime: data.get('fromTime'), toTime: data.get('toTime'), courtIds: data.getAll('courtIds') }
  }
  return { createAction, cancelAction, onDone, sent }
}

describe('WaitSheet', () => {
  it('waits for the whole day on every court unless told otherwise', async () => {
    const { createAction, onDone, sent } = renderSheet()
    const dialog = screen.getByRole('dialog', { name: 'Avisame si se libera' })
    expect(within(dialog).getByLabelText('Desde')).toHaveValue('08:00')
    expect(within(dialog).getByLabelText('Hasta')).toHaveValue('23:00')
    expect(within(dialog).getByLabelText('Cancha 1')).toBeChecked()
    expect(within(dialog).getByLabelText('Cancha 2')).toBeChecked()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anotarme' }))
    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1))
    expect(sent()).toEqual({ date: DATE, fromTime: '08:00', toTime: '23:00', courtIds: ['court-1', 'court-2'] })
    expect(onDone).toHaveBeenCalledWith('Listo, te anotamos.')
  })

  it('starts from the taken slot the player tapped, on that court', async () => {
    const { createAction, sent } = renderSheet({ initial: { fromTime: '18:30', toTime: '20:00', courtIds: ['court-2'] } })
    expect(screen.getByLabelText('Desde')).toHaveValue('18:30')
    expect(screen.getByLabelText('Hasta')).toHaveValue('20:00')
    expect(screen.getByLabelText('Cancha 1')).not.toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Anotarme' }))
    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1))
    expect(sent()).toEqual({ date: DATE, fromTime: '18:30', toTime: '20:00', courtIds: ['court-2'] })
  })

  it('only offers ends after the start', async () => {
    renderSheet()
    await userEvent.selectOptions(screen.getByLabelText('Desde'), '20:00')
    const ends = within(screen.getByLabelText('Hasta')).getAllByRole('option').map((option) => option.textContent)
    expect(ends).toEqual(['21:30', '23:00'])
  })

  it('asks for at least one court', async () => {
    renderSheet()
    await userEvent.click(screen.getByLabelText('Cancha 1'))
    await userEvent.click(screen.getByLabelText('Cancha 2'))
    expect(screen.getByText('Marcá al menos una cancha.')).toBeInTheDocument()
  })

  it('with three waits already, offers to cancel one instead', async () => {
    const activeWaits = [
      { id: 'w1', text: 'sáb 3, de 18:30 a 21:30, cualquier cancha' },
      { id: 'w2', text: 'dom 4, de 08:00 a 12:30, Cancha 1' },
      { id: 'w3', text: 'lun 5, de 20:00 a 23:00, cualquier cancha' },
    ]
    const { cancelAction } = renderSheet({ activeWaits })
    expect(screen.getByText(/Ya estás esperando 3 turnos/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Anotarme' })).not.toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Cancelar espera' })[1])
    await waitFor(() => expect(cancelAction).toHaveBeenCalledTimes(1))
    expect(cancelAction.mock.calls[0][1].get('waitId')).toBe('w2')
  })

  it('says so when no slot is left that day', () => {
    renderSheet({ options: { from: [], to: [] } })
    expect(screen.getByText('Ya no quedan turnos por jugar este día.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/waitlist/wait-sheet.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/waitlist/wait-sheet"`).

- [ ] **Step 3: Write minimal implementation**

`components/waitlist/wait-sheet.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'
import type { LocalDate } from '@/lib/domain/time'
import { MAX_ACTIVE_WAITS, type CourtName, type TimeOption, type WaitItem } from '@/lib/domain/waitlist'

export type WaitInitial = { fromTime: string; toTime: string; courtIds: string[] }

type WaitSheetProps = {
  open: boolean
  onClose: () => void
  date: LocalDate
  dayText: string
  courts: CourtName[]
  options: { from: TimeOption[]; to: TimeOption[] }
  // A taken slot the player tapped; null opens the whole day on every court.
  initial: WaitInitial | null
  activeWaits: WaitItem[]
  createAction: FormAction
  cancelAction: FormAction
  onDone: (message: string) => void
}

// Design: "/reservar", the sheet behind "Avisame si se libera" and behind a taken slot.
export function WaitSheet({ open, onClose, options, activeWaits, cancelAction, ...form }: WaitSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Avisame si se libera">
      {activeWaits.length >= MAX_ACTIVE_WAITS ? (
        <FullWaits waits={activeWaits} cancelAction={cancelAction} />
      ) : options.from.length === 0 ? (
        <p className="text-fg-muted">Ya no quedan turnos por jugar este día.</p>
      ) : (
        <WaitForm options={options} {...form} />
      )}
    </BottomSheet>
  )
}

function WaitForm({
  date,
  dayText,
  courts,
  options,
  initial,
  createAction,
  onDone,
}: Pick<WaitSheetProps, 'date' | 'dayText' | 'courts' | 'options' | 'initial' | 'createAction' | 'onDone'>) {
  const [from, setFrom] = useState(initial?.fromTime ?? options.from[0].value)
  const [to, setTo] = useState(initial?.toTime ?? options.to[options.to.length - 1].value)
  const [checked, setChecked] = useState<string[]>(initial?.courtIds ?? courts.map((court) => court.id))
  const ends = options.to.filter((option) => option.value > from)
  const end = ends.some((option) => option.value === to) ? to : (ends[0]?.value ?? '')

  return (
    <ActionForm action={createAction} submitLabel="Anotarme" pendingLabel="Anotando…" onDone={onDone}>
      <input type="hidden" name="date" value={date} />
      <p className="text-fg-muted">
        {dayText}. Si se libera un turno en ese horario, te lo guardamos unos minutos y te avisamos acá y por mail.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde" htmlFor="wait-from">
          <select id="wait-from" name="fromTime" value={from} onChange={(event) => setFrom(event.target.value)} className={inputClasses}>
            {options.from.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hasta" htmlFor="wait-to">
          <select id="wait-to" name="toTime" value={end} onChange={(event) => setTo(event.target.value)} className={inputClasses}>
            {ends.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-semibold">Canchas</legend>
        {courts.map((court) => (
          <label key={court.id} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              name="courtIds"
              value={court.id}
              checked={checked.includes(court.id)}
              onChange={(event) =>
                setChecked((ids) => (event.target.checked ? [...ids, court.id] : ids.filter((id) => id !== court.id)))
              }
              className="size-5 accent-accent"
            />
            {court.name}
          </label>
        ))}
      </fieldset>
      {checked.length === 0 ? <p className="text-sm">Marcá al menos una cancha.</p> : null}
    </ActionForm>
  )
}

function FullWaits({ waits, cancelAction }: { waits: WaitItem[]; cancelAction: FormAction }) {
  return (
    <div className="flex flex-col gap-3">
      <p>Ya estás esperando {MAX_ACTIVE_WAITS} turnos, el máximo. Cancelá una espera para anotarte en otra.</p>
      <ul className="flex flex-col gap-2">
        {waits.map((wait) => (
          <li key={wait.id} className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-3">
            <span>{wait.text}</span>
            <ActionForm action={cancelAction} submitLabel="Cancelar espera" pendingLabel="Cancelando…" variant="secondary">
              <input type="hidden" name="waitId" value={wait.id} />
            </ActionForm>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/waitlist/wait-sheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/waitlist/wait-sheet.tsx tests/unit/components/waitlist/wait-sheet.test.tsx
git commit -m "feat(ui): the sheet to wait for a slot"
```

---

### Task 18: "Avisame si se libera" en /reservar

**Files:**
- Modify: `components/booking/slot-grid.tsx` (prop `onWait`; celda ocupada con botón)
- Modify: `app/(jugador)/reservar/reservar-board.tsx`
- Modify: `app/(jugador)/reservar/page.tsx`
- Test: `tests/unit/components/booking/slot-grid.test.tsx`

- [ ] **Step 1: Write the failing test**

In `tests/unit/components/booking/slot-grid.test.tsx`, add inside `describe('SlotGrid for players', …)`:
```tsx
  it('offers to wait for a taken slot that is still ahead', async () => {
    const grid = makeGrid({
      now: at('09:00'),
      occupancies: [occupancy('o1', 'court-1', '08:00', '09:30'), occupancy('o2', 'court-1', '11:00', '12:30')],
    })
    const onWait = vi.fn()
    render(<SlotGrid courts={COURTS} rows={grid.rows} variant="player" onSelect={vi.fn()} onWait={onWait} />)
    expect(screen.queryByRole('button', { name: 'Avisame si se libera Cancha 1 a las 08:00' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Avisame si se libera Cancha 1 a las 11:00' }))
    expect(onWait).toHaveBeenCalledWith(grid.rows[2].cells[0])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/booking/slot-grid.test.tsx`
Expected: FAIL (no button named "Avisame si se libera Cancha 1 a las 11:00").

- [ ] **Step 3: The grid offers it**

In `components/booking/slot-grid.tsx`:

Replace `SlotGridProps` with:
```tsx
export type SlotGridProps = {
  courts: Court[]
  rows: GridRow[]
  variant: 'player' | 'club'
  onSelect: (cell: GridCell) => void
  // Players: a taken slot still ahead offers "Avisame si se libera".
  onWait?: (cell: GridCell) => void
}
```
Replace the signature line `export function SlotGrid({ courts, rows, variant, onSelect }: SlotGridProps) {` with:
```tsx
export function SlotGrid({ courts, rows, variant, onSelect, onWait }: SlotGridProps) {
```
Replace `<PlayerCell cell={cell} onSelect={onSelect} />` with:
```tsx
                      <PlayerCell cell={cell} past={row.past} onSelect={onSelect} onWait={onWait} />
```
Replace the `PlayerCell` signature line with:
```tsx
function PlayerCell({
  cell,
  past,
  onSelect,
  onWait,
}: {
  cell: GridCell
  past: boolean
  onSelect: (cell: GridCell) => void
  onWait?: (cell: GridCell) => void
}) {
```
and, inside `PlayerCell`, right before `const text = cell.state === 'taken' ? …`, add:
```tsx
  if (cell.state === 'taken' && !past && onWait) {
    return (
      <button
        type="button"
        aria-label={`Avisame si se libera ${cell.court.name} a las ${cell.slot.label}`}
        onClick={() => onWait(cell)}
        className={cn(CELL, CELL_STYLES.taken, FOCUS, 'hover:text-fg')}
      >
        <span>Ocupada</span>
        <span className="text-xs font-semibold text-accent-ink">Avisame</span>
      </button>
    )
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/booking/slot-grid.test.tsx`
Expected: PASS (los tests anteriores siguen en verde: sin `onWait` la celda ocupada no es un botón).

- [ ] **Step 5: The booking screen** (no test — composición de `SlotGrid` y `WaitSheet`, que tienen los suyos; el e2e de la Task 26 recorre el flujo)

Replace `app/(jugador)/reservar/reservar-board.tsx` with:
```tsx
'use client'

import { useCallback, useState } from 'react'
import { BookingSheet, type BookingChoice } from '@/components/booking/booking-sheet'
import { Legend } from '@/components/booking/legend'
import { SlotGrid } from '@/components/booking/slot-grid'
import { CreateMatchSheet, type MatchFormInitial } from '@/components/matches/create-match-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { WaitSheet, type WaitInitial } from '@/components/waitlist/wait-sheet'
import { cn } from '@/lib/cn'
import { visibleRows, type Court, type GridCell, type GridRow } from '@/lib/domain/grid'
import type { MatchFormOptions } from '@/lib/domain/matches'
import type { LocalDate } from '@/lib/domain/time'
import { slotEndLabel, type TimeOption, type WaitItem } from '@/lib/domain/waitlist'

export function ReservarBoard({
  courts,
  rows,
  dayText,
  paymentNote,
  cancellationRule,
  bookAction,
  date,
  matchOptions,
  createMatchAction,
  waitOptions,
  activeWaits,
  waitAction,
  cancelWaitAction,
}: {
  courts: Court[]
  rows: GridRow[]
  dayText: string
  paymentNote: string
  cancellationRule: string
  bookAction: FormAction
  date: LocalDate
  matchOptions: MatchFormOptions
  createMatchAction: FormAction
  waitOptions: { from: TimeOption[]; to: TimeOption[] }
  activeWaits: WaitItem[]
  waitAction: FormAction
  cancelWaitAction: FormAction
}) {
  const [choice, setChoice] = useState<BookingChoice | null>(null)
  const [onlyFree, setOnlyFree] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [matchInitial, setMatchInitial] = useState<MatchFormInitial | null>(null)
  const [waitOpen, setWaitOpen] = useState(false)
  const [waitInitial, setWaitInitial] = useState<WaitInitial | null>(null)
  const close = useCallback(() => setChoice(null), [])
  const booked = useCallback((message: string) => {
    setChoice(null)
    setNotice(message)
  }, [])
  const closeWait = useCallback(() => setWaitOpen(false), [])
  const waited = useCallback((message: string) => {
    setWaitOpen(false)
    setNotice(message)
  }, [])

  const pastCount = rows.filter((row) => row.past).length
  const shown = visibleRows(rows, { onlyFree, showPast })

  function select(cell: GridCell) {
    if (cell.state !== 'free' || cell.price === null) return
    setNotice(null)
    setChoice({
      courtId: cell.court.id,
      courtName: cell.court.name,
      startsAt: cell.slot.startsAt.toISOString(),
      timeLabel: cell.slot.label,
      price: cell.price,
    })
  }

  function openWait(initial: WaitInitial | null) {
    setNotice(null)
    setWaitInitial(initial)
    setWaitOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <p role="status" className="rounded-xl border border-accent bg-surface p-3">
          {notice}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Legend variant="player" />
        <button
          type="button"
          aria-pressed={onlyFree}
          onClick={() => setOnlyFree((value) => !value)}
          className={cn(
            'min-h-11 rounded-full border px-4 text-sm font-semibold',
            onlyFree ? 'border-accent bg-accent text-on-accent' : 'border-border text-fg',
          )}
        >
          Solo libres
        </button>
      </div>
      {pastCount > 0 && !showPast ? (
        <p className="text-sm text-fg-muted">
          Ocultamos {pastCount} {pastCount === 1 ? 'horario que ya pasó' : 'horarios que ya pasaron'}.{' '}
          <button
            type="button"
            className="inline-flex min-h-11 items-center px-1 align-middle font-semibold text-accent-ink underline"
            onClick={() => setShowPast(true)}
          >
            Mostrar
          </button>
        </p>
      ) : null}
      {shown.length > 0 ? (
        <SlotGrid
          courts={courts}
          rows={shown}
          variant="player"
          onSelect={select}
          onWait={(cell) => openWait({ fromTime: cell.slot.label, toTime: slotEndLabel(cell.slot), courtIds: [cell.court.id] })}
        />
      ) : (
        <p className="rounded-xl border border-border p-4 text-fg-muted">No quedan horarios libres este día. Probá con otro día.</p>
      )}
      <div className="flex flex-col gap-2">
        <Button variant="secondary" fullWidth onClick={() => openWait(null)}>
          Avisame si se libera
        </Button>
        <p className="text-sm text-fg-muted">
          ¿No encontrás lugar? Anotate y, si se libera un turno, te lo guardamos unos minutos. También podés tocar una cancha ocupada.
        </p>
      </div>
      <BookingSheet
        choice={choice}
        dayText={dayText}
        paymentNote={paymentNote}
        cancellationRule={cancellationRule}
        action={bookAction}
        onClose={close}
        onBooked={booked}
        onCreateMatch={(picked) => {
          setChoice(null)
          setMatchInitial({ date, time: picked.timeLabel, courtId: picked.courtId })
        }}
      />
      <CreateMatchSheet
        open={matchInitial !== null}
        onClose={() => setMatchInitial(null)}
        action={createMatchAction}
        options={matchOptions}
        initial={matchInitial ?? undefined}
      />
      <WaitSheet
        open={waitOpen}
        onClose={closeWait}
        date={date}
        dayText={dayText}
        courts={courts}
        options={waitOptions}
        initial={waitInitial}
        activeWaits={activeWaits}
        createAction={waitAction}
        cancelAction={cancelWaitAction}
        onDone={waited}
      />
    </div>
  )
}
```

In `app/(jugador)/reservar/page.tsx`, add the imports:
```tsx
import { cancelSlotWait, createSlotWait } from '@/lib/actions/waitlist'
import { loadMyWaitlist } from '@/lib/data/waitlist'
import { waitItems, waitRangeOptions } from '@/lib/domain/waitlist'
```
after `const matchOptions = await loadMatchFormOptions(viewer, context, today)` add:
```tsx
  const waitlist = await loadMyWaitlist(viewer, now)
```
and add these props to `<ReservarBoard … />` (after `createMatchAction={createMatch}`):
```tsx
        waitOptions={waitRangeOptions(grid.rows.map((row) => row.slot), now)}
        activeWaits={waitItems(waitlist.waits, waitlist.courts, today)}
        waitAction={createSlotWait}
        cancelWaitAction={cancelSlotWait}
```

- [ ] **Step 6: Typecheck, lint and tests**

Run:
```bash
npm run typecheck
npm run lint
npm test
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/booking/slot-grid.tsx "app/(jugador)/reservar/reservar-board.tsx" "app/(jugador)/reservar/page.tsx" tests/unit/components/booking/slot-grid.test.tsx
git commit -m "feat(reservar): wait for a taken slot"
```

---

### Task 19: "Esperando turno" y el banner de la retención

**Files:**
- Create: `components/waitlist/waiting-card.tsx`
- Create: `components/waitlist/hold-banner.tsx`
- Test: `tests/unit/components/waitlist/waiting-card.test.tsx`, `tests/unit/components/waitlist/hold-banner.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/waitlist/waiting-card.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { FormAction } from '@/components/ui/action-form'
import { WaitingCard } from '@/components/waitlist/waiting-card'

const done = async () => ({ status: 'ok' as const, message: 'Cancelaste la espera.' })

describe('WaitingCard', () => {
  it('lists each wait with a way to cancel it', async () => {
    const cancelAction = vi.fn<FormAction>(done)
    render(
      <WaitingCard
        waits={[
          { id: 'w1', text: 'sáb 3, de 18:30 a 21:30, cualquier cancha' },
          { id: 'w2', text: 'Mañana, de 08:00 a 12:30, Cancha 1' },
        ]}
        cancelAction={cancelAction}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Esperando turno' })).toBeInTheDocument()
    const items = within(screen.getByRole('list', { name: 'Tus esperas' })).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('sáb 3, de 18:30 a 21:30, cualquier cancha')
    await userEvent.click(within(items[1]).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(cancelAction).toHaveBeenCalledTimes(1))
    expect(cancelAction.mock.calls[0][1].get('waitId')).toBe('w2')
  })

  it('shows nothing without waits', () => {
    const { container } = render(<WaitingCard waits={[]} cancelAction={vi.fn<FormAction>()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

`tests/unit/components/waitlist/hold-banner.test.tsx`:
```tsx
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FormAction } from '@/components/ui/action-form'
import { HoldBanner } from '@/components/waitlist/hold-banner'

const EXPIRES = new Date('2026-10-03T20:42:00Z')
const done = async () => ({ status: 'ok' as const, message: 'Listo.' })

function renderBanner(expiresAt: Date = EXPIRES) {
  const claimAction = vi.fn<FormAction>(done)
  const declineAction = vi.fn<FormAction>(done)
  render(
    <HoldBanner
      holdId="h1"
      text="Se liberó la Cancha 2, sáb 3 a las 19:00."
      expiresAt={expiresAt.toISOString()}
      price={1600}
      paymentNote="Pagás en efectivo o por transferencia."
      claimAction={claimAction}
      declineAction={declineAction}
    />,
  )
  return { claimAction, declineAction }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('HoldBanner', () => {
  it('counts down the time left', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(EXPIRES.getTime() - 754_000))
    renderBanner()
    expect(screen.getByRole('region', { name: 'Turno retenido' })).toHaveTextContent('Se liberó la Cancha 2, sáb 3 a las 19:00.')
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(screen.getByTestId('hold-countdown')).toHaveTextContent('12:34')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByTestId('hold-countdown')).toHaveTextContent('12:33')
  })

  it('says so when the time ran out, without the buttons', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(EXPIRES.getTime() - 500))
    renderBanner()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('Se terminó el tiempo: el turno pasó al siguiente de la lista.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reservar' })).not.toBeInTheDocument()
  })

  it('books after showing the price and how to pay', async () => {
    const { claimAction } = renderBanner(new Date(Date.now() + 600_000))
    await userEvent.click(screen.getByRole('button', { name: 'Reservar' }))
    const dialog = screen.getByRole('dialog', { name: 'Reservar turno' })
    expect(dialog).toHaveTextContent('$1.600')
    expect(dialog).toHaveTextContent('Pagás en efectivo o por transferencia.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar reserva' }))
    await waitFor(() => expect(claimAction).toHaveBeenCalledTimes(1))
    expect(claimAction.mock.calls[0][1].get('holdId')).toBe('h1')
  })

  it('passes it on to the next in line', async () => {
    const { declineAction } = renderBanner(new Date(Date.now() + 600_000))
    await userEvent.click(screen.getByRole('button', { name: 'No me sirve' }))
    await waitFor(() => expect(declineAction).toHaveBeenCalledTimes(1))
    expect(declineAction.mock.calls[0][1].get('holdId')).toBe('h1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/waitlist/waiting-card.test.tsx tests/unit/components/waitlist/hold-banner.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/waitlist/waiting-card"`).

- [ ] **Step 3: Write the card**

`components/waitlist/waiting-card.tsx`:
```tsx
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import type { WaitItem } from '@/lib/domain/waitlist'

// Design: "Inicio", the "Esperando turno" card under "Tus reservas".
export function WaitingCard({ waits, cancelAction }: { waits: WaitItem[]; cancelAction: FormAction }) {
  if (waits.length === 0) return null
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-display text-2xl font-bold uppercase">Esperando turno</h2>
      <ul aria-label="Tus esperas" className="flex flex-col gap-2">
        {waits.map((wait) => (
          <li key={wait.id} className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-3">
            <span>{wait.text}</span>
            <ActionForm action={cancelAction} submitLabel="Cancelar" pendingLabel="Cancelando…" variant="ghost">
              <input type="hidden" name="waitId" value={wait.id} />
            </ActionForm>
          </li>
        ))}
      </ul>
    </Card>
  )
}
```

- [ ] **Step 4: Write the banner**

`components/waitlist/hold-banner.tsx`:
```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/domain/format'
import { countdownText } from '@/lib/domain/waitlist'

export type HoldBannerProps = {
  holdId: string
  // "Se liberó la Cancha 2, sáb 3 a las 19:00." (holdText)
  text: string
  expiresAt: string
  price: number | null
  paymentNote: string
  claimAction: FormAction
  declineAction: FormAction
}

// Design: "Inicio", on top while a slot is held for the player: what was freed, the time left, and
// "Reservar" (price and how to pay first) or "No me sirve".
export function HoldBanner({ holdId, text, expiresAt, price, paymentNote, claimAction, declineAction }: HoldBannerProps) {
  const expires = new Date(expiresAt)
  // The clock starts once mounted: the server's second and the browser's never match.
  const [now, setNow] = useState<Date | null>(null)
  const [confirming, setConfirming] = useState(false)
  // Stable, so the sheet does not grab the focus again on every tick.
  const closeSheet = useCallback(() => setConfirming(false), [])

  useEffect(() => {
    const tick = () => setNow(new Date())
    const first = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [])

  const over = now !== null && now.getTime() >= expires.getTime()

  return (
    <section aria-label="Turno retenido" className="flex flex-col gap-3 rounded-2xl border-2 border-accent bg-surface p-4">
      <p className="font-semibold">{text}</p>
      {over ? (
        <p>Se terminó el tiempo: el turno pasó al siguiente de la lista.</p>
      ) : (
        <>
          <p className="flex items-baseline gap-2">
            Te la guardamos
            <span data-testid="hold-countdown" className="font-display text-3xl font-bold tabular-nums">
              {now ? countdownText(expires, now) : '--:--'}
            </span>
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button fullWidth onClick={() => setConfirming(true)}>
              Reservar
            </Button>
            <ActionForm action={declineAction} submitLabel="No me sirve" pendingLabel="Pasando…" variant="secondary">
              <input type="hidden" name="holdId" value={holdId} />
            </ActionForm>
          </div>
        </>
      )}
      <BottomSheet open={confirming && !over} onClose={closeSheet} title="Reservar turno">
        <div className="flex flex-col gap-4">
          <p>{text}</p>
          {price !== null ? <p className="font-display text-3xl font-bold">{formatPrice(price)}</p> : null}
          <p>{paymentNote}</p>
          <ActionForm action={claimAction} submitLabel="Confirmar reserva" pendingLabel="Reservando…" onDone={closeSheet}>
            <input type="hidden" name="holdId" value={holdId} />
          </ActionForm>
        </div>
      </BottomSheet>
    </section>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/components/waitlist/waiting-card.test.tsx tests/unit/components/waitlist/hold-banner.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/waitlist/waiting-card.tsx components/waitlist/hold-banner.tsx tests/unit/components/waitlist/waiting-card.test.tsx tests/unit/components/waitlist/hold-banner.test.tsx
git commit -m "feat(ui): waiting card and the held-slot banner"
```

---

### Task 20: Inicio con el banner y "Esperando turno"

**Files:**
- Modify: `app/(jugador)/page.tsx`

- [ ] **Step 1: Wire them in** (no test — composición; `HoldBanner` y `WaitingCard` tienen los suyos y el e2e recorre Inicio)

In `app/(jugador)/page.tsx`, add the imports:
```tsx
import { HoldBanner } from '@/components/waitlist/hold-banner'
import { WaitingCard } from '@/components/waitlist/waiting-card'
import { cancelSlotWait, claimSlotHold, declineSlotHold } from '@/lib/actions/waitlist'
import { loadMyWaitlist } from '@/lib/data/waitlist'
import { paymentMethodsNote } from '@/lib/domain/payments'
import { holdText, waitItems } from '@/lib/domain/waitlist'
```
Replace the `Promise.all`:
```tsx
  const [grid, bookings, matches, context, tournaments, dayUse] = await Promise.all([
    loadDayGrid(club, localDateOf(now, club.timezone), { userId: viewer.userId, audience: 'player' }, now),
    loadMyBookings(viewer, now),
    loadMatches(club, { from: now, to: windowEnd }),
    loadPlayerContext(member, now),
    loadTournaments(club, { endsAfter: now }),
    loadDayUseHome(viewer, now),
  ])
```
with:
```tsx
  const [grid, bookings, matches, context, tournaments, dayUse, waitlist] = await Promise.all([
    loadDayGrid(club, localDateOf(now, club.timezone), { userId: viewer.userId, audience: 'player' }, now),
    loadMyBookings(viewer, now),
    loadMatches(club, { from: now, to: windowEnd }),
    loadPlayerContext(member, now),
    loadTournaments(club, { endsAfter: now }),
    loadDayUseHome(viewer, now),
    loadMyWaitlist(viewer, now),
  ])
```
Right after `<>` (before the greeting `<div>` with "Hola, …"), add:
```tsx
      {waitlist.hold ? (
        <HoldBanner
          holdId={waitlist.hold.id}
          text={holdText(waitlist.hold, club.timezone, today)}
          expiresAt={waitlist.hold.expiresAt.toISOString()}
          price={waitlist.hold.price}
          paymentNote={paymentMethodsNote(club)}
          claimAction={claimSlotHold}
          declineAction={declineSlotHold}
        />
      ) : null}
```
Right after the closing `</section>` of "Tus reservas" (inside the left column, before the "Tu próximo partido" `<Card>`), add:
```tsx
          <WaitingCard waits={waitItems(waitlist.waits, waitlist.courts, today)} cancelAction={cancelSlotWait} />
```

- [ ] **Step 2: Typecheck, lint, tests and build**

Run:
```bash
npm run typecheck
npm run lint
npm test
npm run build
```
Expected: PASS (`today` ya está definido en la página antes del `return`).

- [ ] **Step 3: Commit**

```bash
git add "app/(jugador)/page.tsx"
git commit -m "feat(inicio): held-slot banner and waiting card"
```

---

### Task 21: La campana y los avisos en vivo

**Files:**
- Modify: `components/ui/icon.tsx` (ícono `bell`)
- Modify: `components/brand/club-header.tsx` (lugar a la derecha)
- Create: `components/waitlist/notification-bell.tsx`
- Create: `components/live/live-notifications.tsx`
- Modify: `app/(jugador)/layout.tsx`
- Test: `tests/unit/components/waitlist/notification-bell.test.tsx`, `tests/unit/components/live/live-notifications.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/waitlist/notification-bell.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NotificationBell } from '@/components/waitlist/notification-bell'

describe('NotificationBell', () => {
  it('leads to Avisos and says how many are unread', () => {
    render(<NotificationBell unread={2} />)
    const bell = screen.getByRole('link', { name: 'Avisos, 2 sin leer' })
    expect(bell).toHaveAttribute('href', '/avisos')
    expect(bell).toHaveTextContent('2')
  })

  it('has no badge when everything was read, and caps it at 9+', () => {
    const { rerender } = render(<NotificationBell unread={0} />)
    expect(screen.getByRole('link', { name: 'Avisos' }).querySelector('span')).toBeNull()
    rerender(<NotificationBell unread={12} />)
    expect(screen.getByRole('link', { name: 'Avisos, 12 sin leer' })).toHaveTextContent('9+')
  })
})
```

`tests/unit/components/live/live-notifications.test.tsx`:
```tsx
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveNotifications } from '@/components/live/live-notifications'

const mocks = vi.hoisted(() => {
  const handlers: Array<() => void> = []
  const calls: string[] = []
  const channel = { on: vi.fn(), subscribe: vi.fn() }
  channel.on.mockImplementation((_type: string, _filter: unknown, handler: () => void) => {
    handlers.push(handler)
    return channel
  })
  channel.subscribe.mockImplementation(() => {
    calls.push('subscribe')
    return channel
  })
  return {
    handlers,
    calls,
    channel,
    setAuth: vi.fn(async (token: string) => {
      calls.push(`setAuth ${token}`)
    }),
    getSession: vi.fn(async () => ({ data: { session: { access_token: 'user-token' } } })),
    createChannel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    refresh: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getSession: mocks.getSession },
    realtime: { setAuth: mocks.setAuth },
    channel: mocks.createChannel,
    removeChannel: mocks.removeChannel,
  }),
}))

async function settle() {
  await act(async () => {
    await vi.runAllTimersAsync()
  })
}

describe('LiveNotifications', () => {
  beforeEach(() => {
    mocks.handlers.length = 0
    mocks.calls.length = 0
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('listens to the viewer\'s new avisos with her token', async () => {
    render(<LiveNotifications userId="u1" />)
    await settle()
    expect(mocks.calls).toEqual(['setAuth user-token', 'subscribe'])
    expect(mocks.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.u1' },
      expect.any(Function),
    )
  })

  it('reloads the screen once when avisos arrive', async () => {
    render(<LiveNotifications userId="u1" />)
    await settle()
    act(() => {
      mocks.handlers[0]()
      mocks.handlers[0]()
      vi.advanceTimersByTime(300)
    })
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('stops listening when it goes away', async () => {
    const { unmount } = render(<LiveNotifications userId="u1" />)
    await settle()
    unmount()
    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channel)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/waitlist/notification-bell.test.tsx tests/unit/components/live/live-notifications.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/waitlist/notification-bell"`).

- [ ] **Step 3: The bell icon**

In `components/ui/icon.tsx`, add inside `PATHS` after `trophy`:
```tsx
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
```

- [ ] **Step 4: Write the bell**

`components/waitlist/notification-bell.tsx`:
```tsx
import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import { unreadLabel } from '@/lib/domain/waitlist'

// Design: the header's bell, with how many avisos are unread; it leads to /avisos.
export function NotificationBell({ unread }: { unread: number }) {
  return (
    <Link
      href="/avisos"
      aria-label={unreadLabel(unread)}
      className="relative inline-flex size-11 items-center justify-center rounded-full text-fg hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Icon name="bell" className="size-6" />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-on-accent"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </Link>
  )
}
```

- [ ] **Step 5: Write the live listener**

`components/live/live-notifications.tsx`:
```tsx
'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// Reloads the current screen when an aviso arrives for the viewer (the bell's count, Inicio's banner),
// like LiveOccupancy does for the courts. Realtime applies the select policy: only her own avisos.
export function LiveNotifications({ userId, debounceMs = 300 }: { userId: string; debounceMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | undefined
    let channel: RealtimeChannel | undefined
    let stopped = false
    const reload = () => {
      clearTimeout(timer)
      timer = setTimeout(() => router.refresh(), debounceMs)
    }

    async function start() {
      // Join with the viewer's token, so RLS applies (otherwise the channel runs as anon).
      const { data } = await supabase.auth.getSession()
      if (data.session) await supabase.realtime.setAuth(data.session.access_token)
      if (stopped) return
      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          reload,
        )
        .subscribe()
    }
    void start()

    return () => {
      stopped = true
      clearTimeout(timer)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [userId, debounceMs, router])

  return null
}
```

- [ ] **Step 6: The header makes room and the layout puts them in**

Replace `components/brand/club-header.tsx` with:
```tsx
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Club } from '@/lib/auth/viewer'
import { ClubLogo } from './club-logo'

// The club's logo and name on top of every player screen; children go on the right (the bell).
export function ClubHeader({ club, children }: { club: Pick<Club, 'name' | 'logo_path'>; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between gap-3 px-4 md:max-w-3xl md:px-6 lg:max-w-5xl">
        <Link href="/" className="inline-flex min-h-11 items-center gap-3 font-display text-xl font-bold uppercase">
          <ClubLogo club={club} className="size-9" />
          {club.name}
        </Link>
        {children}
      </div>
    </header>
  )
}
```

Replace `app/(jugador)/layout.tsx` with:
```tsx
import { ClubHeader } from '@/components/brand/club-header'
import { LiveNotifications } from '@/components/live/live-notifications'
import { TabNav, type TabItem } from '@/components/nav/tab-nav'
import { NotificationBell } from '@/components/waitlist/notification-bell'
import { getClub, getViewer } from '@/lib/auth/viewer'
import { countUnreadNotifications } from '@/lib/data/waitlist'

const PLAYER_TABS: TabItem[] = [
  { href: '/', label: 'Inicio', icon: 'home' },
  { href: '/reservar', label: 'Reservar', icon: 'calendar-plus' },
  { href: '/partidos', label: 'Partidos', icon: 'racket' },
  { href: '/torneos', label: 'Torneos', icon: 'trophy' },
  { href: '/perfil', label: 'Perfil', icon: 'user' },
]

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const [viewer, club] = await Promise.all([getViewer(), getClub()])
  const unread = viewer ? await countUnreadNotifications(viewer.userId) : 0

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col md:max-w-3xl lg:max-w-5xl">
      <ClubHeader club={club}>{viewer ? <NotificationBell unread={unread} /> : null}</ClubHeader>
      {viewer ? <LiveNotifications userId={viewer.userId} /> : null}
      <main className="flex flex-1 flex-col gap-6 px-4 pb-28 pt-5 md:px-6">{children}</main>
      {viewer ? <TabNav label="Secciones" items={PLAYER_TABS} variant="bottom" /> : null}
    </div>
  )
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/components/waitlist/notification-bell.test.tsx tests/unit/components/live/live-notifications.test.tsx
npm run typecheck
npm test
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/ui/icon.tsx components/brand/club-header.tsx components/waitlist/notification-bell.tsx components/live/live-notifications.tsx "app/(jugador)/layout.tsx" tests/unit/components/waitlist/notification-bell.test.tsx tests/unit/components/live/live-notifications.test.tsx
git commit -m "feat(ui): the avisos bell, live"
```

---

### Task 22: La pantalla /avisos

**Files:**
- Create: `components/waitlist/notification-list.tsx`
- Create: `app/(jugador)/avisos/mark-read.tsx`
- Create: `app/(jugador)/avisos/page.tsx`
- Test: `tests/unit/components/waitlist/notification-list.test.tsx`, `tests/unit/app/avisos/mark-read.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/waitlist/notification-list.test.tsx`:
```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NotificationList } from '@/components/waitlist/notification-list'
import type { NotificationView } from '@/lib/domain/waitlist'

const ITEMS: NotificationView[] = [
  {
    id: 'n1',
    title: 'Se liberó tu turno: sáb 3, 19:00, Cancha 2',
    body: 'Te lo guardamos hasta las 17:42. Reservalo desde Inicio antes de que pase al siguiente de la lista.',
    link: '/',
    createdAt: new Date('2026-10-03T20:27:00Z'),
    unread: true,
  },
  {
    id: 'n2',
    title: 'Se liberó la Cancha 1 a las 21:30: el primero que reserva se la queda',
    body: 'Falta poco para el turno, así que no se guarda para nadie. Si lo querés, reservalo ya.',
    link: '/reservar?dia=2026-10-02',
    createdAt: new Date('2026-10-02T23:50:00Z'),
    unread: false,
  },
]

describe('NotificationList', () => {
  it('lists each aviso with its link, when it came and whether it is new', () => {
    render(<NotificationList items={ITEMS} timezone="America/Montevideo" today="2026-10-03" />)
    const links = within(screen.getByRole('list', { name: 'Tus avisos' })).getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', '/')
    expect(links[0]).toHaveTextContent('Se liberó tu turno: sáb 3, 19:00, Cancha 2')
    expect(links[0]).toHaveTextContent('Nuevo')
    expect(links[0]).toHaveTextContent('Hoy 17:27')
    expect(links[1]).toHaveAttribute('href', '/reservar?dia=2026-10-02')
    expect(links[1]).not.toHaveTextContent('Nuevo')
    expect(links[1]).toHaveTextContent('vie 2 20:50')
  })

  it('explains what will show up here when there is nothing', () => {
    render(<NotificationList items={[]} timezone="America/Montevideo" today="2026-10-03" />)
    expect(screen.getByText(/No tenés avisos/)).toBeInTheDocument()
  })
})
```

`tests/unit/app/avisos/mark-read.test.tsx`:
```tsx
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkRead } from '@/app/(jugador)/avisos/mark-read'

describe('MarkRead', () => {
  it('marks the avisos read once the screen is open', async () => {
    const action = vi.fn(async () => {})
    render(<MarkRead action={action} />)
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/waitlist/notification-list.test.tsx tests/unit/app/avisos/mark-read.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/waitlist/notification-list"`).

- [ ] **Step 3: Write the list**

`components/waitlist/notification-list.tsx`:
```tsx
import Link from 'next/link'
import { cn } from '@/lib/cn'
import { dayLabel, timeIn } from '@/lib/domain/format'
import { localDateOf, type LocalDate } from '@/lib/domain/time'
import type { NotificationView } from '@/lib/domain/waitlist'

// Design: "/avisos", newest first; each one leads where it says (Inicio's banner, or /reservar that day).
export function NotificationList({ items, timezone, today }: { items: NotificationView[]; timezone: string; today: LocalDate }) {
  if (items.length === 0) {
    return <p className="text-fg-muted">No tenés avisos. Si se libera un turno que esperás, te avisamos acá y por mail.</p>
  }
  return (
    <ul aria-label="Tus avisos" className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.link}
            className={cn(
              'flex flex-col gap-1 rounded-2xl border bg-surface p-4 hover:border-accent focus-visible:outline-2 focus-visible:outline-accent',
              item.unread ? 'border-accent' : 'border-border',
            )}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="font-semibold">{item.title}</span>
              {item.unread ? (
                <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-on-accent">Nuevo</span>
              ) : null}
            </span>
            <span className="text-sm text-fg-muted">{item.body}</span>
            <span className="text-xs text-fg-muted">
              {dayLabel(localDateOf(item.createdAt, timezone), today)} {timeIn(item.createdAt, timezone)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Write the page**

`app/(jugador)/avisos/mark-read.tsx`:
```tsx
'use client'

import { useEffect } from 'react'

// Opening /avisos marks them read (a page does not write while it renders). The action revalidates,
// so the bell goes quiet.
export function MarkRead({ action }: { action: () => Promise<void> }) {
  useEffect(() => {
    void action()
  }, [action])
  return null
}
```

`app/(jugador)/avisos/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { NotificationList } from '@/components/waitlist/notification-list'
import { markNotificationsRead } from '@/lib/actions/waitlist'
import { requirePlayer } from '@/lib/auth/viewer'
import { loadNotifications } from '@/lib/data/waitlist'
import { localDateOf } from '@/lib/domain/time'
import { MarkRead } from './mark-read'

export const metadata: Metadata = { title: 'Avisos' }

export default async function AvisosPage() {
  const viewer = await requirePlayer('/avisos')
  const notifications = await loadNotifications(viewer)
  const today = localDateOf(new Date(), viewer.club.timezone)

  return (
    <>
      {notifications.some((item) => item.unread) ? <MarkRead action={markNotificationsRead} /> : null}
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">Avisos</h1>
        <p className="text-fg-muted">Lo que te avisamos de la lista de espera.</p>
      </div>
      <NotificationList items={notifications} timezone={viewer.club.timezone} today={today} />
    </>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/components/waitlist/notification-list.test.tsx tests/unit/app/avisos/mark-read.test.tsx
npm run typecheck
npm run lint
npm test
```
Expected: PASS.

- [ ] **Step 6: Commit and push**

```bash
git add components/waitlist/notification-list.tsx "app/(jugador)/avisos/mark-read.tsx" "app/(jugador)/avisos/page.tsx" tests/unit/components/waitlist/notification-list.test.tsx tests/unit/app/avisos/mark-read.test.tsx
git commit -m "feat(avisos): the avisos screen"
git push
```

---

## Corte 6: Pantallas del club

### Task 23: La retención en la grilla del club

**Files:**
- Modify: `components/booking/cell-styles.ts`
- Modify: `components/booking/legend.tsx`
- Modify: `components/booking/slot-grid.tsx` (prop `timezone`; `ClubCell`)
- Modify: `app/(club)/club/grilla/club-board.tsx` (pasa `timezone`)
- Test: `tests/unit/components/booking/slot-grid.test.tsx`, `tests/unit/components/booking/legend.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/components/booking/slot-grid.test.tsx`, change the fixtures import to:
```tsx
import { at, booking, COURTS, makeGrid, occupancy, TIMEZONE } from '../../fixtures/grid'
```
and add inside `describe('SlotGrid for the club', …)`:
```tsx
  it('shows a held court, for whom and until when', async () => {
    const hold = { ...occupancy('h1', 'court-1', '20:00', '21:30', 'hold', 'Ana'), expiresAt: at('17:42') }
    const grid = makeGrid({ occupancies: [hold] })
    const onSelect = vi.fn()
    render(<SlotGrid courts={COURTS} rows={grid.rows} variant="club" timezone={TIMEZONE} onSelect={onSelect} />)
    const cell = screen.getByRole('button', { name: 'Cancha 1, 20:00: Ana' })
    expect(cell).toHaveTextContent('Retenido, lista de espera')
    expect(cell).toHaveTextContent('Hasta las 17:42')
    await userEvent.click(cell)
    expect(onSelect).toHaveBeenCalledWith(grid.rows[8].cells[0])
  })
```
In `tests/unit/components/booking/legend.test.tsx`, replace the club expectation with:
```tsx
    expect(screen.getByRole('list', { name: 'Referencias' })).toHaveTextContent('ReservaTurno fijoBloqueoTorneoDay useRetenido')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/booking/slot-grid.test.tsx tests/unit/components/booking/legend.test.tsx`
Expected: FAIL (`Retenido, lista de espera` y `Retenido` ausentes).

- [ ] **Step 3: Write minimal implementation**

In `components/booking/cell-styles.ts`, add after `day_use`:
```ts
  hold: 'border-2 border-dotted border-accent bg-surface text-fg',
```

In `components/booking/legend.tsx`, replace the `club` list with:
```tsx
  club: [
    ['booking', 'Reserva'],
    ['recurring', 'Turno fijo'],
    ['block', 'Bloqueo'],
    ['tournament', 'Torneo'],
    ['day_use', 'Day use'],
    ['hold', 'Retenido'],
  ],
```

In `components/booking/slot-grid.tsx`:

Replace the imports from `@/lib/domain/format`, `@/lib/domain/grid` and `./cell-styles` with:
```tsx
import { formatPrice, timeIn } from '@/lib/domain/format'
import {
  blockEnd,
  continuesAbove,
  KIND_LABELS,
  rowsCovered,
  type Court,
  type GridCell,
  type GridRow,
  type OccupancyKind,
} from '@/lib/domain/grid'
import { CELL_STYLES, type CellStyle } from './cell-styles'
```
Add to `SlotGridProps` (after `onWait`):
```tsx
  // Club: the club's clock, to show until when a court is held.
  timezone?: string
```
Replace the signature line with:
```tsx
export function SlotGrid({ courts, rows, variant, onSelect, onWait, timezone }: SlotGridProps) {
```
Replace `<ClubCell cell={cell} until={blockEnd(rows, rowIndex, courtIndex)} onSelect={onSelect} />` with:
```tsx
                      <ClubCell cell={cell} until={blockEnd(rows, rowIndex, courtIndex)} timezone={timezone} onSelect={onSelect} />
```
Replace the whole `ClubCell` function with:
```tsx
// The look each kind of occupancy takes on the club's grid.
const CLUB_STYLES: Record<OccupancyKind, CellStyle> = {
  booking: 'booking',
  match: 'booking',
  recurring: 'recurring',
  block: 'block',
  tournament: 'tournament',
  day_use: 'day_use',
  hold: 'hold',
}

function ClubCell({
  cell,
  until,
  timezone,
  onSelect,
}: {
  cell: GridCell
  until: string | null
  timezone?: string
  onSelect: (cell: GridCell) => void
}) {
  const { court, slot, occupancy, booking } = cell
  if (occupancy) {
    const kindLabel = KIND_LABELS[occupancy.kind]
    const title = booking?.holderName ?? occupancy.note ?? kindLabel
    const heldUntil =
      occupancy.kind === 'hold' && occupancy.expiresAt && timezone ? timeIn(occupancy.expiresAt, timezone) : null
    const ends = heldUntil ?? until
    return (
      <button
        type="button"
        aria-label={`${court.name}, ${slot.label}${until ? ` a ${until}` : ''}: ${title}`}
        onClick={() => onSelect(cell)}
        className={cn(CELL, CELL_STYLES[CLUB_STYLES[occupancy.kind]], FOCUS, cell.state === 'past' && 'opacity-60')}
      >
        <b className="line-clamp-1">{title}</b>
        <span className="text-xs">
          {occupancy.kind === 'hold' ? `${kindLabel}, lista de espera` : kindLabel}
          {booking ? `, ${booking.source === 'online' ? 'online' : 'en recepción'}` : ''}
        </span>
        {ends ? <span className="text-xs tabular-nums">Hasta las {ends}</span> : null}
        {booking ? <PaymentBadge state={booking.paymentState} className="mt-1" /> : null}
        {cell.offGrid ? <span className="text-xs">Fuera de la grilla</span> : null}
      </button>
    )
  }
  if (cell.state === 'past') return <div className={cn(CELL, CELL_STYLES.taken, 'opacity-50')}>Sin uso</div>
  return (
    <button
      type="button"
      aria-label={`Cargar ${court.name}, ${slot.label}`}
      onClick={() => onSelect(cell)}
      className={cn(CELL, FOCUS, 'border border-dashed border-border text-fg-muted hover:border-accent')}
    >
      <span>+ Cargar</span>
      {cell.price === null ? <span className="text-xs">Sin precio</span> : null}
      {cell.formingMatch ? <span className="text-xs">Armándose {cell.formingMatch.filled}/4 · no bloquea</span> : null}
    </button>
  )
}
```

In `app/(club)/club/grilla/club-board.tsx`, add `timezone={timezone}` to `<SlotGrid … variant="club" … />`.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/components/booking/slot-grid.test.tsx tests/unit/components/booking/legend.test.tsx
npx vitest run tests/unit/app/design-tokens.test.ts
npm run typecheck
```
Expected: PASS (`CELL_STYLES.other` queda sin usar en la grilla; se deja porque es parte del contrato de `CellStyle`).

- [ ] **Step 5: Commit**

```bash
git add components/booking/cell-styles.ts components/booking/legend.tsx components/booking/slot-grid.tsx "app/(club)/club/grilla/club-board.tsx" tests/unit/components/booking/slot-grid.test.tsx tests/unit/components/booking/legend.test.tsx
git commit -m "feat(grilla): held courts on the club's grid"
```

---

### Task 24: "Pasar al siguiente" desde el detalle

**Files:**
- Modify: `components/club/occupancy-detail-sheet.tsx`
- Modify: `app/(club)/club/grilla/page.tsx` (`detailActions.release`)
- Test: `tests/unit/components/club/occupancy-detail-sheet.test.tsx`

- [ ] **Step 1: Write the failing test**

In `tests/unit/components/club/occupancy-detail-sheet.test.tsx`:

change the fixtures import to:
```tsx
import { at, booking, makeGrid, occupancy, TIMEZONE } from '../../fixtures/grid'
```
add after the `matchCell` constant:
```tsx
const held = makeGrid({
  occupancies: [{ ...occupancy('h1', 'court-1', '20:00', '21:30', 'hold', 'Ana'), expiresAt: at('17:42') }],
}).rows.find((row) => row.slot.label === '20:00')!.cells[0]
```
add `release: vi.fn<FormAction>(done),` to the `actions` object in `renderDetail` (after `removeFromMatch`), and add a test at the end of the file's main `describe`:
```tsx
  it('says for whom a court is held and passes it to the next in line', async () => {
    const { actions, onDone, sent } = renderDetail(held)
    expect(screen.getByRole('dialog', { name: 'Ana' })).toHaveTextContent('Retenido para Ana hasta las 17:42.')
    await userEvent.click(screen.getByRole('button', { name: 'Pasar al siguiente' }))
    await waitFor(() => expect(actions.release).toHaveBeenCalledTimes(1))
    expect(sent(actions.release)).toEqual({ occupancyId: 'h1' })
    expect(onDone).toHaveBeenCalledWith('Listo.')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/club/occupancy-detail-sheet.test.tsx`
Expected: FAIL (el detalle no muestra `Retenido para Ana hasta las 17:42.` ni el botón "Pasar al siguiente").

- [ ] **Step 3: Write minimal implementation**

In `components/club/occupancy-detail-sheet.tsx`, replace `DetailActions` with:
```tsx
export type DetailActions = {
  cancel: FormAction
  unblock: FormAction
  cash: FormAction
  endSeries: FormAction
  cancelMatch: FormAction
  removeFromMatch: FormAction
  release: FormAction
}
```
and add, right before the `{occupancy.kind === 'block' ? (` block:
```tsx
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
```

In `app/(club)/club/grilla/page.tsx`, add `releaseSlotHold` to the import from `./actions`:
```tsx
import { cancelBooking, cancelMatch, endSeries, loadSlot, recordCash, releaseSlotHold, removeFromMatch, unblockCourt } from './actions'
```
and `release: releaseSlotHold,` to `detailActions` (after `removeFromMatch,`).

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/components/club/occupancy-detail-sheet.test.tsx
npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/club/occupancy-detail-sheet.tsx "app/(club)/club/grilla/page.tsx" tests/unit/components/club/occupancy-detail-sheet.test.tsx
git commit -m "feat(grilla): pass a held court to the next in line"
```

---

### Task 25: El panel "En espera" y las esperas en vivo

**Files:**
- Create: `components/club/waiting-panel.tsx`
- Modify: `app/(club)/club/grilla/page.tsx`
- Modify: `components/live/live-occupancy.tsx`
- Test: `tests/unit/components/club/waiting-panel.test.tsx`, `tests/unit/components/live/live-occupancy.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/club/waiting-panel.test.tsx`:
```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WaitingPanel } from '@/components/club/waiting-panel'

describe('WaitingPanel', () => {
  it('lists who waits that day and for what, first in line first', () => {
    render(
      <WaitingPanel
        waits={[
          { id: 'w1', playerName: 'Ana', text: 'de 18:30 a 21:30, cualquier cancha' },
          { id: 'w2', playerName: 'Bruno', text: 'de 20:00 a 23:00, Cancha 2' },
        ]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'En espera' })).toBeInTheDocument()
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'Anade 18:30 a 21:30, cualquier cancha',
      'Brunode 20:00 a 23:00, Cancha 2',
    ])
  })

  it('says when nobody is waiting', () => {
    render(<WaitingPanel waits={[]} />)
    expect(screen.getByText('Nadie espera turno este día.')).toBeInTheDocument()
  })
})
```

In `tests/unit/components/live/live-occupancy.test.tsx`, rename the second test to `'listens to occupancies, matches, spots, tournaments, day use passes and waits of its club'` and change its loop list to:
```tsx
    for (const table of ['tournaments', 'tournament_entries', 'tournament_games', 'day_use_passes', 'slot_waits']) {
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/club/waiting-panel.test.tsx tests/unit/components/live/live-occupancy.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/club/waiting-panel"`; `slot_waits` no escuchada).

- [ ] **Step 3: Write the panel**

`components/club/waiting-panel.tsx`:
```tsx
import { Card } from '@/components/ui/card'
import type { DayWait } from '@/lib/domain/waitlist'

// Design: next to the grid, like "Partidos armándose": who waits that day and for what. The demand the
// club could not serve.
export function WaitingPanel({ waits }: { waits: DayWait[] }) {
  return (
    <section aria-labelledby="en-espera" className="flex flex-col gap-3">
      <h2 id="en-espera" className="font-display text-2xl font-bold uppercase">
        En espera
      </h2>
      {waits.length === 0 ? (
        <p className="text-sm text-fg-muted">Nadie espera turno este día.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {waits.map((wait) => (
            <li key={wait.id}>
              <Card className="flex flex-col gap-1">
                <p className="font-semibold">{wait.playerName}</p>
                <p className="text-sm">{wait.text}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Listen to the waits**

In `components/live/live-occupancy.tsx`, update the header comment's first sentence to "…a tournament, an entry, a game, a day use pass or a wait changes." and add, after the `day_use_passes` listener:
```tsx
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'slot_waits', filter: `club_id=eq.${clubId}` },
          reload,
        )
```

- [ ] **Step 5: The grid page shows the panel**

In `app/(club)/club/grilla/page.tsx`, add the imports:
```tsx
import { WaitingPanel } from '@/components/club/waiting-panel'
import { loadDayWaits } from '@/lib/data/waitlist'
```
replace:
```tsx
  const [grid, members] = await Promise.all([loadDayGrid(club, date, { userId: viewer.userId, audience: 'staff' }, now), loadMemberOptions(club.id)])
```
with:
```tsx
  const [grid, members, waits] = await Promise.all([
    loadDayGrid(club, date, { userId: viewer.userId, audience: 'staff' }, now),
    loadMemberOptions(club.id),
    loadDayWaits(club, date),
  ])
```
and replace:
```tsx
        <FormingMatchesPanel items={panelItems} actions={{ cancelMatch, removeFromMatch }} />
```
with:
```tsx
        <div className="flex flex-col gap-6">
          <FormingMatchesPanel items={panelItems} actions={{ cancelMatch, removeFromMatch }} />
          <WaitingPanel waits={waits} />
        </div>
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/components/club/waiting-panel.test.tsx tests/unit/components/live/live-occupancy.test.tsx
npm run typecheck
npm run lint
npm test
npm run build
```
Expected: PASS.

- [ ] **Step 7: Commit and push**

```bash
git add components/club/waiting-panel.tsx components/live/live-occupancy.tsx "app/(club)/club/grilla/page.tsx" tests/unit/components/club/waiting-panel.test.tsx tests/unit/components/live/live-occupancy.test.tsx
git commit -m "feat(grilla): waiting panel next to the grid, live"
git push
```

---

## Corte 7: e2e y cierre

### Task 26: Flujo e2e: de la espera a la reserva

**Files:**
- Modify: `tests/e2e/support/global-setup.ts`
- Create: `tests/e2e/waitlist.spec.ts`

- [ ] **Step 1: La limpieza suelta las canchas retenidas**

In `tests/e2e/support/global-setup.ts`, extend the header comment with "…and the courts held for them on the waitlist (their waits, holds and avisos go with the users, on delete cascade)." and add, right after `const occupancyIds = bookings.data.flatMap(…)`:
```ts
  // Waitlist: courts held for e2e players go free too.
  const holds = await admin.from('slot_holds').select('occupancy_id').in('player_id', ids).eq('status', 'active')
  if (holds.error) throw holds.error
  occupancyIds.push(...holds.data.flatMap((row) => (row.occupancy_id ? [row.occupancy_id] : [])))
```

- [ ] **Step 2: Write the flow**

`tests/e2e/waitlist.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember, signedInClient } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { bookFirstFreeSlot } from './support/booking'

// Next's dev indicator covers the bottom-left tab on mobile (fase 3a notes): navigate with page.goto.
test('waitlist: a player waits for a taken slot, it is held for her when it frees up, and she books it', async ({ page }) => {
  test.setTimeout(120_000)
  const club = await clubRow()
  const day = addDays(localDateOf(new Date(), club.timezone), 3)
  const holder = await createMember({ name: 'Titular Espera', prefix: 'espera-titular' })
  const waiter = await createMember({ name: 'Paula Espera', prefix: 'espera-paula', gender: 'female' })
  const reception = await createMember({ name: 'Recepción Espera', prefix: 'espera-recepcion', role: 'reception' })
  const booked = await bookFirstFreeSlot(holder, day)

  // The waiter taps the taken slot and signs up for it.
  await signInWithMagicLink(page, waiter.email, `/reservar?dia=${day}`)
  await page.getByRole('button', { name: `Avisame si se libera ${booked.courtName} a las ${booked.time}` }).click()
  const sheet = page.getByRole('dialog', { name: 'Avisame si se libera' })
  await expect(sheet.getByLabel('Desde')).toHaveValue(booked.time)
  await expect(sheet.getByLabel(booked.courtName)).toBeChecked()
  await sheet.getByRole('button', { name: 'Anotarme' }).click()
  await expect(page.getByRole('status')).toContainText('te anotamos')

  // Reception cancels the booking: the slot is held for her, with an aviso.
  const desk = await signedInClient(reception)
  const cancelled = await desk.rpc('cancel_booking', { p_booking_id: booked.bookingId })
  expect(cancelled.error).toBeNull()

  await page.goto('/')
  const banner = page.getByRole('region', { name: 'Turno retenido' })
  await expect(banner).toContainText(`Se liberó la ${booked.courtName}`)
  await expect(banner).toContainText(`a las ${booked.time}`)
  await expect(page.getByRole('link', { name: 'Avisos, 1 sin leer' })).toBeVisible()

  // She books it: one more booking, waiting for payment.
  await banner.getByRole('button', { name: 'Reservar' }).click()
  await page.getByRole('dialog', { name: 'Reservar turno' }).getByRole('button', { name: 'Confirmar reserva' }).click()
  await expect(banner).toHaveCount(0)
  const mine = page.getByRole('region', { name: 'Tus reservas' })
  await expect(mine).toContainText(booked.courtName)
  await expect(mine).toContainText('Pendiente de pago')

  // The aviso stays in Avisos, and opening it quiets the bell.
  await page.goto('/avisos')
  await expect(page.getByRole('link', { name: new RegExp(`Se liberó tu turno: .*${booked.time}, ${booked.courtName}`) })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Avisos', exact: true })).toBeVisible()
})
```

- [ ] **Step 3: Run it**

Run:
```bash
npx playwright test tests/e2e/waitlist.spec.ts --workers=1
npx playwright test tests/e2e/waitlist.spec.ts --workers=1
```
Expected: PASS dos veces seguidas (la segunda prueba la limpieza del global setup). Si el banner no aparece, mirar los `warning` de Postgres (`npx supabase db logs` o `docker logs supabase_db_padel-management`): `offer_freed` deja ahí el error sin romper la cancelación.

- [ ] **Step 4: Todos los e2e juntos**

Run: `npx playwright test --workers=1`
Expected: PASS (los diez flujos; las retenciones nuevas no tocan los turnos de los otros tests porque nadie más se anota en la lista).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/support/global-setup.ts tests/e2e/waitlist.spec.ts
git commit -m "test(e2e): from the waitlist to the booking"
```

---

### Task 27: Variables de entorno

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Document them** (no test — documentación)

In `.env.example`, replace the last line (`# The service role key never gets a NEXT_PUBLIC_ prefix and is not used in fase 0.`) with:
```bash
# Lista de espera: avisos por mail. Without these the waitlist still works, with the avisos in the app.
# Service role (server only, never NEXT_PUBLIC_): the outbox reads the players' addresses with it.
# Local: SERVICE_ROLE_KEY (or SECRET_KEY) from `supabase status -o env`.
# SUPABASE_SERVICE_ROLE_KEY=
# Resend: an API key and a sender on a domain verified in Resend.
# RESEND_API_KEY=
# EMAIL_FROM="Rustic Pádel <avisos@example.com>"
# Shared secret for the external cron that calls POST /api/avisos/enviar every minute with
# "Authorization: Bearer <NOTIFY_SECRET>". Use a long random string (openssl rand -hex 32).
# NOTIFY_SECRET=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(env): waitlist mail variables"
```

---

### Task 28: Cierre

**Files:**
- Modify: `docs/features/lista-de-espera/notes.md`, `docs/features/lista-de-espera/plan.md` (revisiones)

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
Expected: todo PASS (pgTAP completo, Vitest, los diez flujos e2e).

- [ ] **Step 2: Revisión de disciplina**

Run `/team-setup:discipline-check` sobre la rama y arreglar lo que encuentre en commits aparte (con su test). Si algún arreglo toca la base, va en una migración nueva `20261005000160_*.sql` con su pgTAP. Mirar en especial: que ninguna función nueva sea ejecutable por `anon` (lo cubre `integrity.test.sql`), staff de otro club en `release_slot_hold`, el orden de bloqueo espera → retención, que el trigger diferido nunca haga fallar la escritura que libera, y que la service role solo se use en `lib/supabase/admin.ts` y `lib/notify/outbox.ts` (`grep -rn SUPABASE_SERVICE_ROLE_KEY app lib components` no debe mostrar otros archivos).

- [ ] **Step 3: Notas de ejecución**

Append to `docs/features/lista-de-espera/notes.md` one dated entry per slice with the deviations from this plan (as in `../fase-3b-day-use/notes.md`), and to the "Plan revisions" section of this file a `v3` line if the plan changed during execution.

```bash
git add docs/features/lista-de-espera/notes.md docs/features/lista-de-espera/plan.md
git commit -m "docs: lista de espera execution notes"
git push
```

- [ ] **Step 4: PR listo**

Marcar el PR como listo desde GitHub y esperar CI en verde.
Expected: `quality` y `db-and-e2e` en verde.

- [ ] **Step 5: MANUAL (producción, después del merge)**

- MANUAL (Miguel): confirmar que `migrate.yml` aplicó `20261005000100` a `20261005000150` (`select version from supabase_migrations.schema_migrations order by version desc limit 6`) y que el cron existe (`select jobname, schedule from cron.job where jobname = 'expire-waitlist'`).
- MANUAL (Miguel): verificar el dominio del remitente en Resend (registros DNS) y cargar en Vercel, entorno Production, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM` y `NOTIFY_SECRET`; redeploy.
- MANUAL (Miguel): crear en cron-job.org un trabajo cada minuto, `POST https://<dominio de producción>/api/avisos/enviar` con el header `Authorization: Bearer <NOTIFY_SECRET>`; la primera corrida tiene que responder 200 con `{"sent":…,"failed":…,"skipped":…}`.
- MANUAL: prueba en producción con dos cuentas: una reserva, la otra se anota, se cancela la reserva y llega el banner y el mail.

---

## Acceptance criteria

- [ ] Desde /reservar, "Avisame si se libera" (y tocar una celda "Ocupada" que todavía no pasó) abre la ventana con el día, desde y hasta de la grilla y las canchas; el jugador se anota si el rango tiene un turno futuro, está en la ventana de reservas y no tiene ya 3 esperas activas; si hay un turno libre en ese rango, se le dice que lo reserve. Con 3 esperas, la ventana ofrece cancelar una.
- [ ] Inicio muestra "Esperando turno" con cada espera ("sáb 3, de 18:30 a 21:30, cualquier cancha") y "Cancelar".
- [ ] Cuando un turno se libera (reserva cancelada, bloqueo levantado, partido que se cae, retención rechazada, pasada o vencida), si faltan más de 45 minutos queda retenido para el primero de la lista que acepta ese horario y esa cancha, no tiene otra retención, no lo tuvo antes y no está ocupado a esa hora: 15 minutos, o 5 si faltan menos de 2 horas. Con 45 minutos o menos, toda la lista recibe "slot_free_now" una sola vez.
- [ ] Nadie (ni el jugador ni recepción) reserva un turno retenido.
- [ ] El jugador ve el banner con la cuenta regresiva; "Reservar" muestra el precio y cómo pagar y crea una reserva online con el precio del turno, pendiente de pago (aparece en Cobros como cualquier otra); "No me sirve" lo pasa al siguiente. Una retención vencida responde que se terminó el tiempo.
- [ ] La campana del encabezado muestra los avisos sin leer y lleva a /avisos; abrir /avisos los marca leídos. Banner y campana se actualizan sin recargar.
- [ ] Los avisos salen por mail con Resend (asunto y cuerpo en castellano, con el logo del club y el link) desde `after()` y desde `POST /api/avisos/enviar` con el secreto; sin `RESEND_API_KEY` se marcan `skipped`, un mail fallido se reintenta hasta 3 veces y dos corridas nunca mandan el mismo.
- [ ] `pg_cron` vence cada minuto las retenciones (y pasa el turno) y las esperas cuyo horario terminó.
- [ ] En la grilla del club el turno retenido se ve con borde ámbar punteado, para quién y hasta cuándo, con "Pasar al siguiente"; el panel "En espera" muestra quién espera ese día.
- [ ] RLS: cada jugador ve sus esperas, retenciones y avisos; el staff del club ve todas las esperas y retenciones, no los avisos; el staff de otro club no ve nada y recibe `forbidden`; nadie escribe directo; `anon` no ejecuta ninguna función; la *outbox* solo la corre la service role.
- [ ] pgTAP, Vitest, lint, typecheck, build y los diez flujos e2e en verde en CI.

## Plan revisions

(append-only)

- **v1 (2026-10-05)**: scaffold.
- **v2 (2026-10-05)**: plan completo en 7 cortes (Tasks 1–28) sobre el diseño aprobado. Decisiones propias en "Decisiones que este plan toma".
