---
feature: fase-1-reservas
type: plan
status: in-progress
date: 2026-09-29
branch: feat/fase-1-reservas
references: ./design.md, ../fase-0-base/plan.md, ../fase-0-base/notes.md, ../../prototipo.html
---

# Fase 1 (reservas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/team-setup:execute` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un jugador de Rustic reserve, cancele e informe su transferencia desde el celular, y que recepción y admin manejen grilla, cobros, turnos fijos, jugadores y ajustes, con las reglas garantizadas por la base.

**Architecture:** Cada escritura de reservas, ocupaciones y pagos es una función `security definer` de Postgres (RPC) que valida permisos y reglas y escribe todo en una transacción; `authenticated` pierde las escrituras directas. Next.js lee con Server Components (RLS con la sesión) y escribe con Server Actions que validan la forma, llaman a la RPC, traducen el código de error y revalidan. La grilla sale de funciones puras en `lib/domain` (Intl, sin librerías) y se refresca en vivo con Supabase Realtime.

**Tech Stack:** Next.js 16.3 (App Router, `proxy.ts`), React 19, TypeScript, Tailwind 4, Supabase (Postgres 17, Auth, Storage, Realtime, `pg_cron`), `@supabase/ssr`, Vitest + Testing Library, pgTAP, Playwright con Mailpit.

---

## Antes de empezar

- Rama: `feat/fase-1-reservas`. Todo el trabajo va en commits chicos sobre esta rama; cada corte termina en verde.
- Docker Desktop corriendo. El CLI de Supabase es devDependency: usar `npx supabase …` o los scripts de npm (`npm run test:db`, `npm run db:reset`, `npm run db:types`). No hay CLI global.
- Shell: PowerShell 7 o Git Bash. En Windows, **los archivos con barras invertidas (regex, `\ir`, `\gset`) se escriben con la herramienta Write**, nunca con heredoc ni `sed`.
- Next 16: antes de usar una API de Next, leer su guía en `node_modules/next/dist/docs/01-app/` (ver `AGENTS.md`). Las usadas acá: Server Actions (`01-getting-started/07-mutating-data.md`), `revalidatePath` (`03-api-reference/04-functions/revalidatePath.md`), `redirect`, route groups (`03-api-reference/03-file-conventions/route-groups.md`), `searchParams` como Promise.
- Producción: las migraciones las aplica `migrate.yml` después del merge con CI en verde. **Nunca** correr `supabase link`, `db push` ni nada contra producción desde la máquina local.
- Docs en español, identificadores de código en inglés. Comentarios de SQL y código en inglés, como en la fase 0.
- Un test pgTAP se corre solo con `npx supabase test db supabase/tests/database/<archivo>.test.sql`; todos con `npm run test:db`.
- Cada migración nueva se aplica con `npm run db:reset` (recrea la base local y corre `seed.sql`) y después `npm run db:types` regenera `lib/supabase/database.types.ts`, que CI compara byte a byte.

## Decisiones que este plan toma (y que el diseño no fijaba)

| Tema | Decisión | Por qué |
| --- | --- | --- |
| Categoría y alta | `set_my_category(club_id, category)` crea la membresía si no existe (alta como `player`) o cambia la categoría y la deja sin validar. `validate_category` y `set_member_role` también reciben `club_id` | Las funciones necesitan saber el club; la bienvenida resuelve alta y categoría con una sola llamada |
| Quién valida categorías | `validate_category`: recepción y admin. `set_member_role`: solo admin | El propósito del diseño y la pantalla Jugadores dicen que recepción valida; la tabla de RPCs decía solo admin. **Confirmar con Miguel** |
| Códigos de error extra | `not_found`, `invalid_state`, `invalid_input`, `method_disabled`, además de los diez del diseño | Hacen falta para "no existe", "ya está cancelada / ya confirmada", entrada inválida y medio de pago apagado |
| Devolución | RPC `refund_payment(payment_id)` para staff: `confirmed` → `refunded` | El diseño dice que recepción marca `refunded`; con las escrituras directas cerradas necesita función |
| Fechas salteadas de turnos fijos | Tabla `recurring_series_skips` (fecha, motivo). `create_series` devuelve las filas nuevas; el cron también las registra | El cron no tiene a quién devolverle nada; Calendario las muestra a recepción |
| Día de la semana | `0` = domingo … `6` = sábado, igual que `extract(dow)` y `Date#getUTCDay()` | Una sola convención en SQL y TypeScript |
| Columnas generadas | `starts_at` y `ends_at` (`lower`/`upper` de `period`) en `court_occupancy` y `bookings` | PostgREST filtra por día con `lt`/`gt` sin parsear rangos en TypeScript |
| Turnos fijos y el límite | Las reservas de una serie son `source = reception`, ocupación `recurring`, y **no** cuentan para `max_active_bookings` | Un jugador con turno fijo tendría 8 reservas futuras y nunca podría reservar online |
| Recepción y el pasado | `staff_book` exige turno en la grilla y precio, pero permite turnos ya empezados | Recepción carga al que llega sin reservar |
| Pagos | `report_transfer` informa el saldo completo; una transferencia `reported` a la vez; `record_cash` no puede superar el saldo | Evita duplicados y errores de tipeo; el saldo es precio − pagos confirmados |
| Comprobante | `receipt_path` es el nombre del objeto dentro del bucket `receipts`: `<user_id>/<booking_id>-<timestamp>.<ext>`. La RPC exige carpeta propia, sin `..`, y que el objeto exista | Es lo que devuelve `storage.upload` y lo que chequean las políticas |
| Realtime | `INSERT` filtrado por `club_id`; `DELETE` sin filtro (Realtime no filtra borrados). Ante cualquier evento, `router.refresh()` con 300 ms de debounce | El diseño pide recargar, no parchear estado |
| Revalidación | Cada Server Action llama `revalidatePath('/', 'layout')` | Todas las pantallas leen reservas; son dinámicas y la revalidación solo refresca el router |
| Club actual | Se resuelve por slug `rustic` (`lib/club/config.ts`) | Un solo club (notas de la fase 0); `club_id` sigue en el modelo |
| Cron | `pg_cron` diario a las 07:00 UTC (04:00 en Montevideo), job `extend-recurring-series` | Fuera del horario del club |
| Tests e2e | Usuarios `@e2e.test` creados con la clave de servicio (con contraseña) para preparar datos; el ingreso por UI es con enlace mágico leído de Mailpit. Un `globalSetup` borra lo que dejaron corridas anteriores | Flujos reales y deterministas sin tocar producción. CI exporta `SUPABASE_SERVICE_ROLE_KEY` y `MAILPIT_URL` del stack local |
| Tests viejos | Se borra `booking_limits.test.sql` (sus casos pasan a `player_bookings.test.sql`); `rls.test.sql` pasa a exigir "sin escrituras directas" | Las políticas de escritura directa desaparecen |
| Pestañas del club | Cada pestaña aparece en el corte que crea su pantalla | Nunca hay links rotos en la rama |
| Un PR | Un PR borrador desde el corte 1, para que CI corra en cada push; se marca listo al final | Resuelve la pregunta abierta del diseño sin frenar el trabajo. Si Miguel prefiere un PR por corte, se parte en la Task 12 |

## Mapa de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `supabase/migrations/20260929000100_booking_model.sql` | Columnas nuevas de `clubs`, `pricing_rules`, `recurring_series`, `recurring_series_skips`, `bookings`, `payments`, grants, RLS de lectura, cierre de escrituras directas |
| `supabase/migrations/20260929000200_slot_rules.sql` | `private.fail`, `is_staff`, `slot_period`, `slot_price`, `active_court_club` |
| `supabase/migrations/20260929000300_player_bookings.sql` | `insert_booking`, `cancel_booking_row`, `book_slot`, `cancel_my_booking`, `cancel_booking` |
| `supabase/migrations/20260929000400_staff_bookings.sql` | `staff_book`, `block_court`, `unblock` |
| `supabase/migrations/20260929000500_recurring_series.sql` | Series, generación, `create_series`, `end_series`, cron |
| `supabase/migrations/20260929000600_receipts_storage.sql` | Bucket `receipts`, `private.folder_owner`, políticas de Storage |
| `supabase/migrations/20260929000700_payments.sql` | `report_transfer`, `record_cash`, `confirm_payment`, `reject_payment`, `refund_payment` |
| `supabase/migrations/20260929000800_members.sql` | `set_my_category`, `validate_category`, `set_member_role` |
| `supabase/migrations/20260929000900_realtime.sql` | `court_occupancy` en la publicación de Realtime |
| `supabase/seed.sql` | Rustic con los valores del prototipo (solo local) |
| `supabase/tests/database/helpers/slot.psql` | `slot()`, `at()`, `today()` relativos a `now()` |
| `supabase/tests/database/helpers/club.psql` | Club, canchas, precios, personas y `make_booking` de prueba |
| `supabase/tests/database/*.test.sql` | pgTAP por función y regla |
| `lib/domain/time.ts` | Reloj del club con `Intl` |
| `lib/domain/format.ts` | Precios, días y horas en español |
| `lib/domain/slots.ts` | Turnos del día y precio por franja |
| `lib/domain/grid.ts` | Grilla canchas × turnos, filtros, estadísticas, fin de bloqueos |
| `lib/domain/errors.ts` | Código de error → texto |
| `lib/domain/payments.ts` | Estado de pago, saldo, texto de medios de pago |
| `lib/domain/cancellation.ts` | Si se puede cancelar y por qué |
| `lib/domain/input.ts` | Lectura y validación de `FormData` |
| `lib/domain/profile.ts` | Perfil completo, etiquetas de lado, mano, rol y categoría |
| `lib/domain/my-bookings.ts` | Vista de "Mis reservas" |
| `lib/domain/receipts.ts` | Nombre del archivo del comprobante |
| `lib/domain/members.ts` | Buscador de jugadores |
| `lib/domain/calendar.ts` | Mes, semana y resumen por día |
| `lib/domain/settings.ts` | Validación de ajustes y precios |
| `lib/actions/result.ts` | `ActionState` y traducción de errores de RPC |
| `lib/actions/revalidate.ts` | Revalidación tras una escritura |
| `lib/actions/profile.ts` | Server Actions de perfil y cerrar sesión |
| `lib/auth/viewer.ts` | Sesión, perfil, club y membresía; `require*` |
| `lib/club/config.ts` | Slug del club |
| `lib/data/day.ts` | Carga la grilla de un día |
| `lib/data/members.ts` | Carga jugadores del club |
| `lib/storage/receipts.ts` | Sube el comprobante desde el navegador |
| `components/ui/action-form.tsx`, `components/ui/field.tsx` | Formulario con Server Action y campos |
| `components/nav/tab-nav.tsx` | Barra inferior del jugador y pestañas del club |
| `components/booking/*` | `DayStrip`, `Legend`, `SlotGrid`, `BookingSheet`, `PaymentBadge`, `TransferSheet`, estilos de celda |
| `components/club/*` | `LoadSheet`, `OccupancyDetailSheet` |
| `components/profile/player-profile-form.tsx` | Formulario de bienvenida y perfil |
| `components/live/live-occupancy.tsx` | Suscripción Realtime |
| `app/(jugador)/…` | Inicio, Reservar, Mis reservas, Perfil |
| `app/bienvenida/page.tsx` | Alta obligatoria |
| `app/(club)/club/…` | Grilla, Calendario, Cobros, Jugadores, Ajustes |
| `tests/unit/**` | Vitest |
| `tests/e2e/support/*` | Entorno local, cliente de servicio, Mailpit, limpieza |
| `tests/e2e/{player-booking,reception-grid,late-cancel}.spec.ts` | Los tres flujos |

## Secuencia por cortes

| Corte | Tasks | Resultado | Cómo se prueba |
| --- | --- | --- | --- |
| 1. Modelo y RPCs | 1–12 | Tablas, reglas y funciones en la base | pgTAP |
| 2. Dominio de turnos | 13–20 | `lib/domain` de turnos, grilla, errores, pagos y perfil | Vitest |
| 3. Reservar y Mis reservas | 21–34 | Bienvenida, Inicio, Reservar, Mis reservas, Perfil | Vitest + flujos 1 y 3 |
| 4. Grilla del club y cobros | 35–41 | Panel con Grilla y Cobros | Vitest + flujo 2 (sin turno fijo) |
| 5. Turnos fijos y calendario | 42–45 | Turno fijo desde la grilla, Calendario | Vitest + flujo 2 completo |
| 6. Jugadores y ajustes | 46–49 | Jugadores y Ajustes | pgTAP + Vitest |
| 7. Realtime | 50–52 | Grilla y Reservar en vivo | pgTAP + Vitest + flujo 2 |
| Cierre | 53–57 | README, PR listo, datos reales, producción | Todo en verde + preview |

---
## Corte 1: Modelo y RPCs

### Task 1: Punto de partida en verde

**Files:** ninguno.

- [ ] **Step 1: Rama y stack local**

Run:
```bash
git branch --show-current
npx supabase start
npm run db:reset
```
Expected: `feat/fase-1-reservas`; Supabase levantado; `db reset` aplica las cuatro migraciones de la fase 0 y `seed.sql`.

- [ ] **Step 2: Todo en verde antes de tocar nada**

Run:
```bash
npm run lint
npm run typecheck
npm test
npm run test:db
```
Expected: todo pasa (`All tests successful` en pgTAP). Si algo falla, parar y arreglarlo antes de seguir: el resto del plan asume esta base.

---

### Task 2: Modelo de datos de reservas

Crea las tablas, cierra las escrituras directas y deja los tests viejos alineados con la regla nueva ("solo por RPC").

**Files:**
- Modify: `supabase/tests/database/helpers/slot.psql`
- Create: `supabase/tests/database/helpers/club.psql`
- Create: `supabase/tests/database/booking_schema.test.sql`
- Create: `supabase/migrations/20260929000100_booking_model.sql`
- Modify: `supabase/tests/database/rls.test.sql`
- Delete: `supabase/tests/database/booking_limits.test.sql`
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: Helpers de fecha**

Reemplazar `supabase/tests/database/helpers/slot.psql` completo (Write tool):
```sql
-- Test helper, included with \ir. Lives inside each test's transaction, so it is rolled back.
-- slot(1, '19:00', 90) = tomorrow 19:00-20:30 in the club timezone, relative to now(),
-- so tests never go stale as the calendar moves.
create schema if not exists test_helpers;
grant usage on schema test_helpers to anon, authenticated;

create function test_helpers.slot(days_ahead int, start_time time, minutes int)
returns tstzrange
language sql
stable
as $$
  select tstzrange(s, s + make_interval(mins => minutes))
  from (
    select ((now() at time zone 'America/Montevideo')::date + days_ahead + start_time)
      at time zone 'America/Montevideo' as s
  ) start;
$$;

-- at(1, '20:00') = tomorrow at 20:00 in the club timezone: where a slot starts.
create function test_helpers.at(days_ahead int, start_time time)
returns timestamptz
language sql
stable
as $$
  select lower(test_helpers.slot(days_ahead, start_time, 1));
$$;

-- The club's today, for date arguments.
create function test_helpers.today()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Montevideo')::date;
$$;
```

- [ ] **Step 2: Fixture compartido**

`supabase/tests/database/helpers/club.psql` (Write tool):
```sql
-- Shared fixture for the fase 1 booking tests. Include it after slot.psql:
--   \ir helpers/slot.psql
--   \ir helpers/club.psql
-- Club T: grid 08:00-23:00 every 90 minutes (08:00 ... 21:30), 14-day window, 24 h notice,
-- 2 active bookings, cash and transfer with receipt. Prices: 1200, and 1600 from 18:30.
-- Ana (a1, category 5 validated) and Bruno (b1) are players, Carla (c1) is reception,
-- Dani (d1) is admin, Omar (f1) is not a member.
insert into public.clubs (id, slug, name, opens_at, closes_at, slot_minutes, booking_window_days,
                          cancellation_notice_hours, max_active_bookings, transfer_details) values
  ('a0000000-0000-0000-0000-000000000001', 'test-club', 'Club T', '08:00', '23:00', 90, 14, 24, 2,
   'Banco Test, cuenta 123, a nombre de Club T');

insert into public.courts (id, club_id, name, sort_order) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Cancha 1', 1),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Cancha 2', 2);

insert into public.pricing_rules (club_id, weekdays, from_time, to_time, price) values
  ('a0000000-0000-0000-0000-000000000001', '{0,1,2,3,4,5,6}', '08:00', '18:30', 1200),
  ('a0000000-0000-0000-0000-000000000001', '{0,1,2,3,4,5,6}', '18:30', '24:00', 1600);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'bruno@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'carla@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'dani@test.local'),
  ('00000000-0000-0000-0000-0000000000f1', 'omar@test.local');

insert into public.club_members (club_id, user_id, role, category, category_validated) values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'player', 5, true),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'player', 6, false),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'reception', null, false),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'admin', null, false);

-- A confirmed booking and its occupancy, inserted as postgres (skips the RPC rules on purpose).
create procedure test_helpers.make_booking(
  p_id uuid, p_court_id uuid, p_period tstzrange, p_player_id uuid, p_price integer default 1200
)
language plpgsql
as $$
declare
  v_occupancy_id uuid;
begin
  insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
  values ('a0000000-0000-0000-0000-000000000001', p_court_id, 'booking', p_period, p_player_id)
  returning id into v_occupancy_id;

  insert into public.bookings (id, club_id, court_id, period, player_id, source, price, occupancy_id, created_by)
  values (p_id, 'a0000000-0000-0000-0000-000000000001', p_court_id, p_period, p_player_id, 'online', p_price,
          v_occupancy_id, p_player_id);
end;
$$;
```

- [ ] **Step 3: Test pgTAP que falla**

`supabase/tests/database/booking_schema.test.sql` (Write tool):
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(23);

select has_table('public', 'pricing_rules', 'pricing_rules exists');
select has_table('public', 'bookings', 'bookings exists');
select has_table('public', 'recurring_series', 'recurring_series exists');
select has_table('public', 'recurring_series_skips', 'recurring_series_skips exists');
select has_table('public', 'payments', 'payments exists');
select has_column('public', 'clubs', 'slot_minutes', 'clubs have a slot length');
select hasnt_column('public', 'clubs', 'min_booking_minutes', 'free-length bookings are gone (minimum)');
select hasnt_column('public', 'clubs', 'max_booking_minutes', 'free-length bookings are gone (maximum)');
select has_column('public', 'court_occupancy', 'note', 'occupancies carry a note for blocks');

insert into public.clubs (id, slug, name) values
  ('a0000000-0000-0000-0000-000000000009', 'test-defaults', 'Club D');

select results_eq(
  $$ select slot_minutes::int, max_active_bookings::int, accepts_cash, accepts_transfer, transfer_receipt_required
     from public.clubs where slug = 'test-defaults' $$,
  $$ values (90, 2, true, true, true) $$,
  'new clubs get 90-minute slots, 2 active bookings and both payment methods');
select throws_ok(
  $$ insert into public.clubs (slug, name, opens_at, closes_at) values ('test-club-bad', 'Club Bad', '23:00', '08:00') $$,
  '23514', null, 'a club cannot close before it opens');
select throws_ok(
  $$ update public.clubs set accepts_cash = false, accepts_transfer = false where slug = 'test-defaults' $$,
  '23514', null, 'a club accepts at least one payment method');
select throws_ok(
  $$ insert into public.pricing_rules (club_id, weekdays, from_time, to_time, price)
     values ('a0000000-0000-0000-0000-000000000001', '{7}', '08:00', '10:00', 100) $$,
  '23514', null, 'weekdays go from 0 (Sunday) to 6 (Saturday)');
select throws_ok(
  $$ insert into public.pricing_rules (club_id, weekdays, from_time, to_time, price)
     values ('a0000000-0000-0000-0000-000000000001', '{1}', '18:00', '10:00', 100) $$,
  '23514', null, 'a price band ends after it starts');
select throws_ok(
  $$ insert into public.bookings (club_id, court_id, period, player_id, guest_name, source, price)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
             test_helpers.slot(2, '08:00', 90), '00000000-0000-0000-0000-0000000000a1', 'Otro', 'reception', 1200) $$,
  '23514', null, 'a booking has exactly one holder: a player or a name');

call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(2, '08:00', 90), '00000000-0000-0000-0000-0000000000a1');
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(2, '08:00', 90), '00000000-0000-0000-0000-0000000000b1');

-- Ana, player: no direct writes, reads only her own bookings.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.bookings (club_id, court_id, period, player_id, source, price)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
             test_helpers.slot(3, '08:00', 90), '00000000-0000-0000-0000-0000000000a1', 'online', 0) $$,
  '42501', null, 'players cannot insert bookings directly');
select throws_ok(
  $$ insert into public.payments (club_id, booking_id, method, amount, status)
     values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cash', 1200, 'confirmed') $$,
  '42501', null, 'players cannot insert payments directly');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             test_helpers.slot(3, '08:00', 90), '00000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'players cannot insert occupancies directly');
select is((select count(*)::int from public.bookings), 1, 'a player sees only her own bookings');

-- Carla, reception: no direct writes either, reads every booking of her club.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'block',
             test_helpers.slot(3, '10:00', 60), '00000000-0000-0000-0000-0000000000c1') $$,
  '42501', null, 'reception writes occupancies through the RPCs too');
select is((select count(*)::int from public.bookings), 2, 'reception sees every booking of the club');

-- Anonymous visitor
set local role anon;

select throws_ok($$ select * from public.bookings $$, '42501', null, 'anon cannot read bookings');
select is((select count(*)::int from public.pricing_rules where club_id = 'a0000000-0000-0000-0000-000000000001'), 2,
  'anon can read prices');

select * from finish();
rollback;
```

- [ ] **Step 4: Correr y ver que falla**

Run: `npx supabase test db supabase/tests/database/booking_schema.test.sql`
Expected: FAIL: el fixture no puede insertar en `public.pricing_rules` (`relation "public.pricing_rules" does not exist`).

- [ ] **Step 5: Migración**

`supabase/migrations/20260929000100_booking_model.sql` (Write tool):
```sql
-- Fase 1 data model: a fixed slot grid per club, prices by weekday and time band, bookings,
-- recurring series and payments. From here on bookings, occupancies and payments are written only
-- by the security definer functions of the following migrations: authenticated loses direct writes.

-- Clubs: a fixed grid (opens_at + n * slot_minutes) replaces free-length bookings.
alter table public.clubs
  drop constraint clubs_booking_minutes,
  drop column min_booking_minutes,
  drop column max_booking_minutes,
  add column slot_minutes smallint not null default 90,
  add column max_active_bookings smallint not null default 2,
  add column accepts_cash boolean not null default true,
  add column accepts_transfer boolean not null default true,
  add column transfer_details text,
  add column transfer_receipt_required boolean not null default true,
  add constraint clubs_slot_minutes check (slot_minutes between 15 and 240),
  add constraint clubs_max_active_bookings check (max_active_bookings between 1 and 20),
  add constraint clubs_some_payment_method check (accepts_cash or accepts_transfer),
  add constraint clubs_transfer_details check (transfer_details is null or length(transfer_details) <= 500);

-- Occupancies: no more direct writes. The RPCs create and delete them.
drop policy court_occupancy_insert_staff on public.court_occupancy;
drop policy court_occupancy_insert_own_booking on public.court_occupancy;
drop policy court_occupancy_update_staff on public.court_occupancy;
drop policy court_occupancy_delete_staff_or_own_booking on public.court_occupancy;
revoke insert, update, delete on public.court_occupancy from authenticated;
drop function private.player_can_book(uuid, tstzrange);
drop function private.player_can_cancel(uuid, tstzrange);

alter table public.court_occupancy
  add column note text check (note is null or length(trim(note)) between 1 and 80),
  add column starts_at timestamptz generated always as (lower(period)) stored,
  add column ends_at timestamptz generated always as (upper(period)) stored;
create index court_occupancy_club_starts_idx on public.court_occupancy (club_id, starts_at);

create type public.booking_source as enum ('online', 'reception');
create type public.booking_status as enum ('confirmed', 'cancelled');
create type public.payment_method as enum ('cash', 'transfer');
create type public.payment_status as enum ('reported', 'confirmed', 'rejected', 'refunded');

-- A slot's price comes from the band that covers its start time on its weekday
-- (0 = Sunday ... 6 = Saturday, like extract(dow)). Without a band the slot cannot be booked.
create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  weekdays smallint[] not null,
  from_time time not null,
  to_time time not null,
  price integer not null check (price between 0 and 10000000),
  created_at timestamptz not null default now(),
  constraint pricing_rules_weekdays check (
    cardinality(weekdays) between 1 and 7 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
  ),
  constraint pricing_rules_times check (from_time < to_time)
);
create index pricing_rules_club_id_idx on public.pricing_rules (club_id);
alter table public.pricing_rules enable row level security;

-- A recurring slot ("turno fijo") loaded by reception, for a player or for a name.
create table public.recurring_series (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  court_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  player_id uuid references public.profiles (id),
  guest_name text,
  starts_on date not null,
  ends_on date,
  generated_until date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint recurring_series_court_in_club
    foreign key (court_id, club_id) references public.courts (id, club_id) on delete cascade,
  constraint recurring_series_holder check (
    num_nonnulls(player_id, guest_name) = 1 and (guest_name is null or length(trim(guest_name)) between 1 and 60)
  )
);
create index recurring_series_club_id_idx on public.recurring_series (club_id);
alter table public.recurring_series enable row level security;

-- Dates a series could not book, so reception can sort them out by hand.
create table public.recurring_series_skips (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  series_id uuid not null references public.recurring_series (id) on delete cascade,
  on_date date not null,
  reason text not null check (reason in ('slot_taken', 'no_price', 'not_aligned')),
  created_at timestamptz not null default now(),
  unique (series_id, on_date)
);
alter table public.recurring_series_skips enable row level security;

-- The history of every booking. court_occupancy holds the court today; a cancelled booking
-- keeps its row here and loses its occupancy.
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  court_id uuid not null,
  period tstzrange not null,
  starts_at timestamptz generated always as (lower(period)) stored,
  ends_at timestamptz generated always as (upper(period)) stored,
  player_id uuid references public.profiles (id),
  guest_name text,
  source public.booking_source not null,
  series_id uuid references public.recurring_series (id) on delete set null,
  status public.booking_status not null default 'confirmed',
  price integer not null check (price >= 0),
  occupancy_id uuid unique references public.court_occupancy (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  -- Target for the composite FK in payments.
  unique (id, club_id),
  constraint bookings_court_in_club
    foreign key (court_id, club_id) references public.courts (id, club_id) on delete cascade,
  constraint bookings_holder check (
    num_nonnulls(player_id, guest_name) = 1 and (guest_name is null or length(trim(guest_name)) between 1 and 60)
  ),
  constraint bookings_period_shape check (
    not isempty(period) and not lower_inf(period) and not upper_inf(period)
    and lower_inc(period) and not upper_inc(period)
  ),
  -- A confirmed booking always holds its court; a cancelled one never does.
  constraint bookings_status_consistent check (
    (status = 'confirmed' and occupancy_id is not null and cancelled_at is null)
    or (status = 'cancelled' and occupancy_id is null and cancelled_at is not null)
  )
);
create index bookings_club_starts_idx on public.bookings (club_id, starts_at);
create index bookings_player_starts_idx on public.bookings (player_id, starts_at);
create index bookings_series_id_idx on public.bookings (series_id);
alter table public.bookings enable row level security;

-- The app does not move money: it records who paid, how, how much and who confirmed it.
-- confirmed_by / confirmed_at record whoever reviewed the payment (confirmed, rejected or refunded).
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  booking_id uuid not null,
  method public.payment_method not null,
  amount integer not null check (amount > 0),
  status public.payment_status not null,
  receipt_path text,
  reported_by uuid references public.profiles (id) on delete set null,
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  rejection_reason text check (rejection_reason is null or length(rejection_reason) <= 120),
  created_at timestamptz not null default now(),
  constraint payments_booking_in_club
    foreign key (booking_id, club_id) references public.bookings (id, club_id) on delete cascade,
  constraint payments_cash_is_confirmed check (method = 'transfer' or status in ('confirmed', 'refunded'))
);
create index payments_booking_id_idx on public.payments (booking_id);
create index payments_club_status_idx on public.payments (club_id, status);
alter table public.payments enable row level security;

-- Grants: read what RLS allows; write prices as admin. Everything else goes through the RPCs.
revoke all on public.pricing_rules, public.recurring_series, public.recurring_series_skips,
  public.bookings, public.payments from anon, authenticated;
grant select on public.pricing_rules to anon, authenticated;
grant insert, update, delete on public.pricing_rules to authenticated;
grant select on public.recurring_series, public.recurring_series_skips, public.bookings, public.payments
  to authenticated;

create policy pricing_rules_select_all on public.pricing_rules
  for select to anon, authenticated using (true);
create policy pricing_rules_insert_admin on public.pricing_rules
  for insert to authenticated
  with check (private.has_club_role(club_id, array['admin']::public.club_role[]));
create policy pricing_rules_update_admin on public.pricing_rules
  for update to authenticated
  using (private.has_club_role(club_id, array['admin']::public.club_role[]))
  with check (private.has_club_role(club_id, array['admin']::public.club_role[]));
create policy pricing_rules_delete_admin on public.pricing_rules
  for delete to authenticated
  using (private.has_club_role(club_id, array['admin']::public.club_role[]));

create policy bookings_select_own_or_staff on public.bookings
  for select to authenticated
  using (
    player_id = (select auth.uid())
    or private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
  );

-- The subquery goes through bookings' own RLS: a player reaches only payments of her bookings.
create policy payments_select_own_or_staff on public.payments
  for select to authenticated
  using (
    private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
    or exists (select 1 from public.bookings b where b.id = booking_id and b.player_id = (select auth.uid()))
  );

create policy recurring_series_select_staff on public.recurring_series
  for select to authenticated
  using (private.has_club_role(club_id, array['admin', 'reception']::public.club_role[]));

create policy recurring_series_skips_select_staff on public.recurring_series_skips
  for select to authenticated
  using (private.has_club_role(club_id, array['admin', 'reception']::public.club_role[]));
```

- [ ] **Step 6: Alinear `rls.test.sql` con "sin escrituras directas"**

Reemplazar `supabase/tests/database/rls.test.sql` completo (Write tool). Cambian tres aserciones: el jugador ya no inserta ocupaciones propias, ni borra, y recepción tampoco escribe directo. La doble reserva entre jugadores pasa a `player_bookings.test.sql` (Task 4).
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
select plan(23);

-- Fixture as postgres (bypasses RLS).
-- Club X: Ana (player), Bruno (player, private profile), Carla (reception).
-- Club Y: Diego (player, private profile).
insert into public.clubs (id, slug, name) values
  ('a0000000-0000-0000-0000-000000000001', 'test-club-x', 'Club X'),
  ('a0000000-0000-0000-0000-000000000002', 'test-club-y', 'Club Y');

insert into public.courts (id, club_id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Cancha 1'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Cancha 1');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'bruno@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'carla@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'diego@test.local');

update public.profiles set is_public = false
where id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1');

insert into public.club_members (club_id, user_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'player'),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'player'),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'reception'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d1', 'player');

insert into public.court_occupancy (id, club_id, court_id, kind, period, created_by) values
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'booking', test_helpers.slot(1, '19:00', 90), '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
   'booking', test_helpers.slot(1, '19:00', 90), '00000000-0000-0000-0000-0000000000d1');

-- Anonymous visitor
set local role anon;

select is((select count(*)::int from public.courts where id in (
  'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002')), 2,
  'anon can read courts');
select throws_ok($$ select * from public.court_occupancy $$, '42501', null, 'anon cannot read occupancy');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');

-- Ana, player in club X
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 1,
  'player reads own profile');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'player cannot read another private profile');
select is((select count(*)::int from public.club_members where club_id = 'a0000000-0000-0000-0000-000000000001'), 1,
  'player sees only their own membership');
select is((select count(*)::int from public.court_occupancy where club_id = 'a0000000-0000-0000-0000-000000000001'), 1,
  'player sees the occupancy of their club');
select is((select count(*)::int from public.court_occupancy where club_id = 'a0000000-0000-0000-0000-000000000002'), 0,
  'player cannot see the occupancy of another club');

update public.profiles set display_name = 'hacked' where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set display_name = 'Ana P' where id = '00000000-0000-0000-0000-0000000000a1';
update public.club_members set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000000a1';

select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             test_helpers.slot(1, '21:00', 90), '00000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'player cannot write occupancies directly, not even their own (book_slot does it)');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             test_helpers.slot(2, '19:00', 90), '00000000-0000-0000-0000-0000000000b1') $$,
  '42501', null, 'player cannot book in someone else''s name');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'block',
             test_helpers.slot(2, '08:00', 60), '00000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'player cannot block a court');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'booking',
             test_helpers.slot(2, '19:00', 90), '00000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'player cannot book in a club they do not belong to');
select throws_ok(
  $$ insert into public.club_members (club_id, user_id, role)
     values ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'admin') $$,
  '42501', null, 'player cannot join a club as admin');
select lives_ok(
  $$ insert into public.club_members (club_id, user_id)
     values ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1') $$,
  'player can join a club as an unvalidated player');

-- Bruno, player in club X
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select throws_ok(
  $$ delete from public.court_occupancy where id = 'e0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'player cannot delete occupancies directly');

-- Carla, reception in club X
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is((select count(*)::int from public.club_members where club_id = 'a0000000-0000-0000-0000-000000000001'), 3,
  'reception sees every member of their club');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), 1,
  'reception reads private profiles of their club members');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'), 0,
  'reception cannot read private profiles outside their club');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'block',
             test_helpers.slot(2, '08:00', 60), '00000000-0000-0000-0000-0000000000c1') $$,
  '42501', null, 'reception cannot write occupancies directly either (block_court does it)');

-- Back to postgres: the writes RLS filtered out left no trace.
reset role;

select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), 'bruno',
  'player could not rename another profile');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'Ana P',
  'player renamed their own profile');
select is((select role from public.club_members
           where club_id = 'a0000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-0000000000a1'),
  'player'::public.club_role, 'player could not promote themselves');
select is((select count(*)::int from public.court_occupancy where id = 'e0000000-0000-0000-0000-000000000001'), 1,
  'player could not delete another player''s booking');

select * from finish();
rollback;
```

- [ ] **Step 7: Borrar el test de límites por RLS**

Sus reglas ya no viven en RLS; `player_bookings.test.sql` (Task 4) las cubre en `book_slot` y `cancel_my_booking`.

Run: `git rm supabase/tests/database/booking_limits.test.sql`

- [ ] **Step 8: Aplicar y correr todo pgTAP**

Run:
```bash
npm run db:reset
npm run test:db
```
Expected: `booking_schema.test.sql .. ok`, `rls.test.sql .. ok`, `schema.test.sql .. ok` (incluye "every table in public has RLS enabled" con las tablas nuevas), `occupancy.test.sql .. ok`. `All tests successful`.

- [ ] **Step 9: Tipos**

Run:
```bash
npm run db:types
npm run typecheck
```
Expected: `database.types.ts` suma `pricing_rules`, `bookings`, `recurring_series`, `recurring_series_skips`, `payments` y los enums nuevos; `clubs` pierde `min_booking_minutes`/`max_booking_minutes`. Typecheck pasa (el código de la fase 0 no usa esas columnas).

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/20260929000100_booking_model.sql supabase/tests/database lib/supabase/database.types.ts
git commit -m "feat(db): add booking model and close direct writes"
```

---

### Task 3: Grilla fija y precio por franja en la base

**Files:**
- Create: `supabase/migrations/20260929000200_slot_rules.sql`
- Test: `supabase/tests/database/slot_rules.test.sql`

- [ ] **Step 1: Test que falla**

`supabase/tests/database/slot_rules.test.sql` (Write tool). Corre como `postgres` porque prueba funciones de `private`.
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(12);

select is(private.slot_period('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '08:00')),
  test_helpers.slot(1, '08:00', 90), 'the first slot starts at opening time and lasts slot_minutes');
select is(private.slot_period('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '21:30')),
  test_helpers.slot(1, '21:30', 90), 'the last slot ends exactly at closing time');
select throws_ok(
  $$ select private.slot_period('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '08:15')) $$,
  'P0001', 'not_aligned', 'a start between two slots is not on the grid');
select throws_ok(
  $$ select private.slot_period('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '06:30')) $$,
  'P0001', 'not_aligned', 'a start before opening is not on the grid');
select throws_ok(
  $$ select private.slot_period('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '23:00')) $$,
  'P0001', 'not_aligned', 'a slot that would end after closing is not on the grid');
select throws_ok(
  $$ select private.slot_period('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '08:00') + interval '30 seconds') $$,
  'P0001', 'not_aligned', 'slots start on whole minutes');

update public.clubs set opens_at = '09:00', closes_at = '24:00' where id = 'a0000000-0000-0000-0000-000000000001';
select is(private.slot_period('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '22:30')),
  test_helpers.slot(1, '22:30', 90), 'with closing at 24:00 the last slot ends at midnight');
update public.clubs set opens_at = '08:00', closes_at = '23:00' where id = 'a0000000-0000-0000-0000-000000000001';

select is(private.slot_price('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '08:00')), 1200,
  'daytime price');
select is(private.slot_price('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '17:00')), 1200,
  'a slot that starts before 18:30 keeps the daytime price');
select is(private.slot_price('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '18:30')), 1600,
  'the evening price starts at 18:30');

insert into public.pricing_rules (club_id, weekdays, from_time, to_time, price) values
  ('a0000000-0000-0000-0000-000000000001', array[extract(dow from test_helpers.today() + 2)::smallint], '20:00', '24:00', 2000);
select is(private.slot_price('a0000000-0000-0000-0000-000000000001', test_helpers.at(2, '20:00')), 2000,
  'on its weekday, the band that starts latest wins');

delete from public.pricing_rules where club_id = 'a0000000-0000-0000-0000-000000000001';
select is(private.slot_price('a0000000-0000-0000-0000-000000000001', test_helpers.at(1, '08:00')), null::integer,
  'without a band there is no price');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx supabase test db supabase/tests/database/slot_rules.test.sql`
Expected: FAIL con `function private.slot_period(unknown, timestamp with time zone) does not exist`.

- [ ] **Step 3: Migración**

`supabase/migrations/20260929000200_slot_rules.sql` (Write tool):
```sql
-- Grid and price rules shared by every booking function. They live in private: the API does
-- not expose them, and only the security definer functions (running as their owner) call them.

-- Stops with a stable error code. The app translates codes into Spanish (lib/domain/errors.ts).
create function private.fail(p_code text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using message = p_code, errcode = 'P0001';
end;
$$;

create function private.is_staff(p_club_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.has_club_role(p_club_id, array['admin', 'reception']::public.club_role[]);
$$;

-- The slot that starts at p_starts_at on the club's fixed grid: opens_at + n * slot_minutes,
-- ending no later than closes_at, on the club's clock. Anything else is not_aligned.
create function private.slot_period(p_club_id uuid, p_starts_at timestamptz)
returns tstzrange
language plpgsql
stable
set search_path = ''
as $$
declare
  v_club public.clubs;
  v_local timestamp;
  v_local_end timestamp;
  v_offset_minutes numeric;
begin
  select * into v_club from public.clubs where id = p_club_id;
  if not found then
    perform private.fail('not_found');
  end if;

  v_local := p_starts_at at time zone v_club.timezone;
  v_offset_minutes := extract(epoch from (v_local - (v_local::date + v_club.opens_at))) / 60;
  v_local_end := v_local + make_interval(mins => v_club.slot_minutes);

  if v_offset_minutes < 0
     or v_offset_minutes <> trunc(v_offset_minutes)
     or mod(v_offset_minutes::integer, v_club.slot_minutes) <> 0
     or v_local_end > v_local::date + v_club.closes_at then
    perform private.fail('not_aligned');
  end if;

  return tstzrange(p_starts_at, v_local_end at time zone v_club.timezone);
end;
$$;

-- The price of the band that covers the slot's start on its weekday; the band that starts
-- latest wins. null when no band covers it.
create function private.slot_price(p_club_id uuid, p_starts_at timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select r.price
  from public.clubs c
  cross join lateral (select p_starts_at at time zone c.timezone as local_start) l
  join public.pricing_rules r on r.club_id = c.id
  where c.id = p_club_id
    and extract(dow from l.local_start)::smallint = any (r.weekdays)
    and l.local_start::time >= r.from_time
    and l.local_start::time < r.to_time
  order by r.from_time desc
  limit 1;
$$;

-- The club of an active court, or not_found.
create function private.active_court_club(p_court_id uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_club_id uuid;
begin
  select club_id into v_club_id from public.courts where id = p_court_id and is_active;
  if v_club_id is null then
    perform private.fail('not_found');
  end if;
  return v_club_id;
end;
$$;

revoke all on function private.fail(text) from public;
revoke all on function private.is_staff(uuid) from public;
revoke all on function private.slot_period(uuid, timestamptz) from public;
revoke all on function private.slot_price(uuid, timestamptz) from public;
revoke all on function private.active_court_club(uuid) from public;
```

- [ ] **Step 4: Aplicar y correr**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/slot_rules.test.sql
```
Expected: `ok`, 12 tests.

- [ ] **Step 5: Commit**

`private` no aparece en los tipos generados; igual correr `npm run db:types` y verificar con `git status` que el archivo no cambió.
```bash
git add supabase/migrations/20260929000200_slot_rules.sql supabase/tests/database/slot_rules.test.sql
git commit -m "feat(db): add fixed slot grid and price band rules"
```

---

### Task 4: Reserva del jugador y cancelaciones

**Files:**
- Create: `supabase/migrations/20260929000300_player_bookings.sql`
- Test: `supabase/tests/database/player_bookings.test.sql`
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: Test que falla**

`supabase/tests/database/player_bookings.test.sql` (Write tool). Los turnos 08:00 y 20:00 están en la grilla del fixture (08:00 + n × 90).
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(24);

-- Ana, player
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(2, '20:00')) $$,
  'player books a free slot on the grid');
select results_eq(
  $$ select price, source::text, status::text, player_id, upper(period) - lower(period)
     from public.bookings
     where court_id = 'c0000000-0000-0000-0000-000000000001' and starts_at = test_helpers.at(2, '20:00') $$,
  $$ values (1600, 'online', 'confirmed', '00000000-0000-0000-0000-0000000000a1'::uuid, interval '90 minutes') $$,
  'the booking is hers, online, at the evening price and one slot long');
select is(
  (select o.kind::text from public.court_occupancy o join public.bookings b on b.occupancy_id = o.id
   where b.starts_at = test_helpers.at(2, '20:00')),
  'booking', 'the booking holds the court with an occupancy');
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000002', test_helpers.at(2, '20:00')) $$,
  'P0001', 'busy_at_that_time', 'a player cannot hold two courts at the same time');
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(2, '08:15')) $$,
  'P0001', 'not_aligned', 'the start has to be on the grid');
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(-1, '08:00')) $$,
  'P0001', 'in_the_past', 'no bookings in the past');
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(15, '08:00')) $$,
  'P0001', 'outside_window', 'no bookings beyond the booking window');
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-00000000dead', test_helpers.at(2, '08:00')) $$,
  'P0001', 'not_found', 'the court has to exist and be active');
select lives_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(3, '08:00')) $$,
  'a second active booking is fine');
select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(4, '08:00')) $$,
  'P0001', 'too_many_bookings', 'a third active booking goes over the club limit');

-- Bruno, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(2, '20:00')) $$,
  'P0001', 'slot_taken', 'a taken slot cannot be booked twice, whoever tries');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';

select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000002', test_helpers.at(2, '08:00')) $$,
  'P0001', 'forbidden', 'only club members book');

-- Anonymous visitor
set local role anon;

select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000002', test_helpers.at(2, '08:00')) $$,
  '42501', null, 'anon cannot call book_slot');

-- Ana cancels
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.cancel_my_booking((select id from public.bookings
       where starts_at = test_helpers.at(3, '08:00') and status = 'confirmed')) $$,
  'player cancels her own booking with enough notice');
select results_eq(
  $$ select status::text, occupancy_id is null, cancelled_by from public.bookings
     where starts_at = test_helpers.at(3, '08:00') $$,
  $$ values ('cancelled', true, '00000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'the booking stays in history as cancelled, without its occupancy');
select is(
  (select count(*)::int from public.court_occupancy
   where court_id = 'c0000000-0000-0000-0000-000000000001' and starts_at = test_helpers.at(3, '08:00')),
  0, 'cancelling frees the court');
select throws_ok(
  $$ select public.cancel_my_booking((select id from public.bookings where starts_at = test_helpers.at(3, '08:00'))) $$,
  'P0001', 'invalid_state', 'a cancelled booking cannot be cancelled again');
select lives_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(4, '08:00')) $$,
  'a cancelled booking no longer counts toward the limit');

-- A booking of Ana's that starts in two hours, inserted as postgres.
reset role;
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000002',
  tstzrange(now() + interval '2 hours', now() + interval '3 hours 30 minutes'), '00000000-0000-0000-0000-0000000000a1');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.cancel_my_booking('b0000000-0000-0000-0000-000000000009') $$,
  'P0001', 'notice_period', 'a player cannot cancel inside the notice period');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select throws_ok(
  $$ select public.cancel_my_booking('b0000000-0000-0000-0000-000000000009') $$,
  'P0001', 'forbidden', 'a player cannot cancel someone else''s booking');
select throws_ok(
  $$ select public.cancel_booking('b0000000-0000-0000-0000-000000000009') $$,
  'P0001', 'forbidden', 'players cannot use the staff cancellation');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.cancel_booking('b0000000-0000-0000-0000-000000000009') $$,
  'reception cancels any booking, even inside the notice period');
select throws_ok(
  $$ select public.cancel_booking('b0000000-0000-0000-0000-00000000dead') $$,
  'P0001', 'not_found', 'cancelling a missing booking says so');

reset role;
select is((select status::text from public.bookings where id = 'b0000000-0000-0000-0000-000000000009'), 'cancelled',
  'the staff cancellation is recorded');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx supabase test db supabase/tests/database/player_bookings.test.sql`
Expected: FAIL con `function public.book_slot(unknown, timestamp with time zone) does not exist`.

- [ ] **Step 3: Migración**

`supabase/migrations/20260929000300_player_bookings.sql` (Write tool):
```sql
-- Bookings a player makes and cancels from the app, plus the staff cancellation.
-- Every function checks permissions explicitly and writes booking and occupancy in one transaction.

-- Creates the occupancy and its booking. The exclusion constraint has the last word on double
-- booking: its violation (23P01) becomes slot_taken.
create function private.insert_booking(
  p_club_id uuid,
  p_court_id uuid,
  p_period tstzrange,
  p_kind public.occupancy_kind,
  p_player_id uuid,
  p_guest_name text,
  p_source public.booking_source,
  p_series_id uuid,
  p_price integer
)
returns public.bookings
language plpgsql
set search_path = ''
as $$
declare
  v_occupancy_id uuid;
  v_booking public.bookings;
begin
  begin
    insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
    values (p_club_id, p_court_id, p_kind, p_period, (select auth.uid()))
    returning id into v_occupancy_id;
  exception when exclusion_violation then
    perform private.fail('slot_taken');
  end;

  insert into public.bookings (club_id, court_id, period, player_id, guest_name, source, series_id, price,
                               occupancy_id, created_by)
  values (p_club_id, p_court_id, p_period, p_player_id, nullif(trim(p_guest_name), ''), p_source, p_series_id,
          p_price, v_occupancy_id, (select auth.uid()))
  returning * into v_booking;

  return v_booking;
end;
$$;

-- Marks a confirmed booking cancelled and frees its court. Callers lock the row first.
create function private.cancel_booking_row(p_booking public.bookings)
returns public.bookings
language plpgsql
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  if p_booking.status <> 'confirmed' then
    perform private.fail('invalid_state');
  end if;

  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = (select auth.uid()), occupancy_id = null
   where id = p_booking.id
  returning * into v_booking;

  delete from public.court_occupancy where id = p_booking.occupancy_id;
  return v_booking;
end;
$$;

create function public.book_slot(p_court_id uuid, p_starts_at timestamptz)
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
  -- One booking at a time per player, so the limit and the same-time checks cannot race.
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

  if exists (
    select 1 from public.bookings b
    where b.player_id = v_uid and b.status = 'confirmed' and b.period && v_period
  ) then
    perform private.fail('busy_at_that_time');
  end if;

  -- Recurring series are loaded by reception and do not count toward the limit.
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

create function public.cancel_my_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_notice_hours smallint;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_booking.player_id is distinct from (select auth.uid()) then
    perform private.fail('forbidden');
  end if;
  if v_booking.status <> 'confirmed' then
    perform private.fail('invalid_state');
  end if;

  select cancellation_notice_hours into v_notice_hours from public.clubs where id = v_booking.club_id;
  if v_booking.starts_at - now() < make_interval(hours => v_notice_hours) then
    perform private.fail('notice_period');
  end if;

  return private.cancel_booking_row(v_booking);
end;
$$;

-- Reception and admin cancel any booking of their club, with no notice period.
create function public.cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_booking.club_id) then
    perform private.fail('forbidden');
  end if;

  return private.cancel_booking_row(v_booking);
end;
$$;

-- Supabase grants EXECUTE on new public functions to anon explicitly, so revoke it by name.
revoke all on function private.insert_booking(uuid, uuid, tstzrange, public.occupancy_kind, uuid, text,
  public.booking_source, uuid, integer) from public;
revoke all on function private.cancel_booking_row(public.bookings) from public;
revoke execute on function public.book_slot(uuid, timestamptz) from public, anon;
revoke execute on function public.cancel_my_booking(uuid) from public, anon;
revoke execute on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.book_slot(uuid, timestamptz) to authenticated;
grant execute on function public.cancel_my_booking(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
```

- [ ] **Step 4: Aplicar y correr**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/player_bookings.test.sql
```
Expected: `ok`, 24 tests. Si `cancel_my_booking` con `invalid_state` falla por el orden de chequeos, revisar que el chequeo de estado vaya antes del de aviso.

- [ ] **Step 5: Tipos y commit**

Run: `npm run db:types` (aparecen `book_slot`, `cancel_my_booking`, `cancel_booking` en `Functions`).
```bash
git add supabase/migrations/20260929000300_player_bookings.sql supabase/tests/database/player_bookings.test.sql lib/supabase/database.types.ts
git commit -m "feat(db): add book_slot and cancellations"
```

---

### Task 5: Recepción: reservas a nombre de otro y bloqueos

**Files:**
- Create: `supabase/migrations/20260929000400_staff_bookings.sql`
- Test: `supabase/tests/database/staff_bookings.test.sql`
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: Test que falla**

`supabase/tests/database/staff_bookings.test.sql` (Write tool):
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(20);

-- Carla, reception
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000001', test_helpers.at(20, '08:00'),
       p_player_id => '00000000-0000-0000-0000-0000000000a1') $$,
  'reception books for a player, even beyond the booking window');
select results_eq(
  $$ select source::text, price, player_id, guest_name from public.bookings where starts_at = test_helpers.at(20, '08:00') $$,
  $$ values ('reception', 1200, '00000000-0000-0000-0000-0000000000a1'::uuid, null::text) $$,
  'the booking is loaded by reception, for Ana, at the grid price');
select lives_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000002', test_helpers.at(1, '21:30'),
       p_guest_name => '  Rodríguez ') $$,
  'reception books under a name');
select is((select guest_name from public.bookings where starts_at = test_helpers.at(1, '21:30')), 'Rodríguez',
  'the name is stored trimmed');
select throws_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000001', test_helpers.at(5, '08:00'),
       p_player_id => '00000000-0000-0000-0000-0000000000a1', p_guest_name => 'Otro') $$,
  'P0001', 'invalid_input', 'a booking has exactly one holder');
select throws_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000001', test_helpers.at(5, '08:00')) $$,
  'P0001', 'invalid_input', 'a booking needs a holder');
select throws_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000001', test_helpers.at(5, '08:10'), p_guest_name => 'X') $$,
  'P0001', 'not_aligned', 'reception also books on the grid');
select throws_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000001', test_helpers.at(20, '08:00'), p_guest_name => 'X') $$,
  'P0001', 'slot_taken', 'reception cannot double book either');
select throws_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000001', test_helpers.at(5, '08:00'),
       p_player_id => '00000000-0000-0000-0000-0000000000f1') $$,
  'P0001', 'invalid_input', 'the player has to be a member of the club');
select lives_ok(
  $$ select public.block_court('c0000000-0000-0000-0000-000000000001', test_helpers.at(2, '10:00'),
       test_helpers.at(2, '13:00'), 'Clase de Pablo') $$,
  'reception blocks a court for any length');
select results_eq(
  $$ select kind::text, note from public.court_occupancy
     where court_id = 'c0000000-0000-0000-0000-000000000001' and starts_at = test_helpers.at(2, '10:00') $$,
  $$ values ('block', 'Clase de Pablo') $$,
  'the block keeps its reason');
select throws_ok(
  $$ select public.block_court('c0000000-0000-0000-0000-000000000001', test_helpers.at(2, '12:00'),
       test_helpers.at(2, '14:00'), null) $$,
  'P0001', 'slot_taken', 'a block cannot overlap another occupancy');
select throws_ok(
  $$ select public.block_court('c0000000-0000-0000-0000-000000000001', test_helpers.at(2, '15:00'),
       test_helpers.at(2, '14:00'), null) $$,
  'P0001', 'invalid_input', 'a block ends after it starts');
select throws_ok(
  $$ select public.unblock((select occupancy_id from public.bookings where starts_at = test_helpers.at(20, '08:00'))) $$,
  'P0001', 'invalid_state', 'bookings are cancelled, not unblocked');
select lives_ok(
  $$ select public.unblock((select id from public.court_occupancy
       where court_id = 'c0000000-0000-0000-0000-000000000001' and starts_at = test_helpers.at(2, '10:00'))) $$,
  'reception frees a blocked court');

-- Ana, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000001', test_helpers.at(5, '08:00'), p_guest_name => 'X') $$,
  'P0001', 'forbidden', 'players cannot book in someone else''s name');
select throws_ok(
  $$ select public.block_court('c0000000-0000-0000-0000-000000000001', test_helpers.at(5, '10:00'),
       test_helpers.at(5, '11:00'), null) $$,
  'P0001', 'forbidden', 'players cannot block courts');
select throws_ok(
  $$ select public.unblock((select occupancy_id from public.bookings where starts_at = test_helpers.at(20, '08:00'))) $$,
  'P0001', 'forbidden', 'players cannot free courts');

-- Dani, admin
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select lives_ok(
  $$ select public.staff_book('c0000000-0000-0000-0000-000000000002', test_helpers.at(5, '08:00'), p_guest_name => 'Admin') $$,
  'admin can do everything reception does');

reset role;
select is((select count(*)::int from public.court_occupancy where kind = 'block'), 0, 'the block is gone');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx supabase test db supabase/tests/database/staff_bookings.test.sql`
Expected: FAIL con `function public.staff_book(...) does not exist`.

- [ ] **Step 3: Migración**

`supabase/migrations/20260929000400_staff_bookings.sql` (Write tool):
```sql
-- What reception and admin load on the grid: bookings for a member or a name, and blocks.
-- Staff bookings still follow the grid and need a price, but skip the booking window and may
-- start in the past (someone who shows up without a booking).

create function public.staff_book(
  p_court_id uuid,
  p_starts_at timestamptz,
  p_player_id uuid default null,
  p_guest_name text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club_id uuid;
  v_guest text := nullif(trim(p_guest_name), '');
  v_period tstzrange;
  v_price integer;
begin
  select club_id into v_club_id from public.courts where id = p_court_id;
  if v_club_id is null then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_club_id) then
    perform private.fail('forbidden');
  end if;
  if num_nonnulls(p_player_id, v_guest) <> 1 or length(v_guest) > 60 then
    perform private.fail('invalid_input');
  end if;
  if p_player_id is not null and not exists (
    select 1 from public.club_members where club_id = v_club_id and user_id = p_player_id
  ) then
    perform private.fail('invalid_input');
  end if;

  v_period := private.slot_period(v_club_id, p_starts_at);
  v_price := private.slot_price(v_club_id, p_starts_at);
  if v_price is null then
    perform private.fail('no_price');
  end if;

  return private.insert_booking(v_club_id, p_court_id, v_period, 'booking', p_player_id, v_guest, 'reception',
                                null, v_price);
end;
$$;

-- Blocks have any length (a class, maintenance) and do not follow the grid.
create function public.block_court(
  p_court_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_note text default null
)
returns public.court_occupancy
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club_id uuid;
  v_block public.court_occupancy;
begin
  select club_id into v_club_id from public.courts where id = p_court_id;
  if v_club_id is null then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_club_id) then
    perform private.fail('forbidden');
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at or length(trim(p_note)) > 80 then
    perform private.fail('invalid_input');
  end if;

  begin
    insert into public.court_occupancy (club_id, court_id, kind, period, note, created_by)
    values (v_club_id, p_court_id, 'block', tstzrange(p_starts_at, p_ends_at), nullif(trim(p_note), ''),
            (select auth.uid()))
    returning * into v_block;
  exception when exclusion_violation then
    perform private.fail('slot_taken');
  end;

  return v_block;
end;
$$;

-- Frees a blocked court. Bookings are cancelled with cancel_booking so their history stays.
create function public.unblock(p_occupancy_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occupancy public.court_occupancy;
begin
  select * into v_occupancy from public.court_occupancy where id = p_occupancy_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_occupancy.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_occupancy.kind <> 'block' then
    perform private.fail('invalid_state');
  end if;

  delete from public.court_occupancy where id = v_occupancy.id;
end;
$$;

revoke execute on function public.staff_book(uuid, timestamptz, uuid, text) from public, anon;
revoke execute on function public.block_court(uuid, timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.unblock(uuid) from public, anon;
grant execute on function public.staff_book(uuid, timestamptz, uuid, text) to authenticated;
grant execute on function public.block_court(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.unblock(uuid) to authenticated;
```

- [ ] **Step 4: Aplicar y correr**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/staff_bookings.test.sql
```
Expected: `ok`, 20 tests.

- [ ] **Step 5: Tipos y commit**

```bash
npm run db:types
git add supabase/migrations/20260929000400_staff_bookings.sql supabase/tests/database/staff_bookings.test.sql lib/supabase/database.types.ts
git commit -m "feat(db): add staff bookings and court blocks"
```

---
### Task 6: Turnos fijos y su extensión diaria

**Files:**
- Create: `supabase/migrations/20260929000500_recurring_series.sql`
- Test: `supabase/tests/database/recurring_series.test.sql`
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: Test que falla**

`supabase/tests/database/recurring_series.test.sql` (Write tool). La serie cae el mismo día de la semana que hoy, a las 20:00, desde mañana: genera hoy+7 … hoy+56 (8 fechas). Bruno ya ocupa hoy+14, así que se reservan 7 y se saltea 1. `\gset` guarda el id de la serie en una variable de psql; se usa fuera de los `$$` con `format`.
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(18);

call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(14, '20:00', 90), '00000000-0000-0000-0000-0000000000b1', 1600);

-- Carla, reception
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select results_eq(
  $$ select on_date, reason from public.create_series('c0000000-0000-0000-0000-000000000001',
       extract(dow from test_helpers.today() + 7)::integer, '20:00', test_helpers.today() + 1,
       p_guest_name => 'Rodríguez') $$,
  $$ values (test_helpers.today() + 14, 'slot_taken') $$,
  'creating a series reports the dates that clash');
select is((select count(*)::int from public.bookings where series_id is not null and status = 'confirmed'), 7,
  'the series books every week for 8 weeks, except the clash');
select is(
  (select count(*)::int from public.bookings b join public.court_occupancy o on o.id = b.occupancy_id
   where b.series_id is not null and o.kind = 'recurring'),
  7, 'series bookings hold the court as recurring');
select results_eq(
  $$ select distinct price, source::text, guest_name from public.bookings where series_id is not null $$,
  $$ values (1600, 'reception', 'Rodríguez') $$,
  'series bookings are loaded by reception, for the name, at the grid price');
select is((select generated_until from public.recurring_series), test_helpers.today() + 56,
  'the series is generated 8 weeks ahead');
select is((select count(*)::int from public.recurring_series_skips), 1, 'the clash is recorded for reception');
select throws_ok(
  $$ select * from public.create_series('c0000000-0000-0000-0000-000000000001',
       extract(dow from test_helpers.today())::integer, '20:15', test_helpers.today() + 1, p_guest_name => 'X') $$,
  'P0001', 'not_aligned', 'a series starts on the grid');
select throws_ok(
  $$ select * from public.create_series('c0000000-0000-0000-0000-000000000002',
       extract(dow from test_helpers.today())::integer, '20:00', test_helpers.today() + 1,
       p_player_id => '00000000-0000-0000-0000-0000000000a1', p_guest_name => 'X') $$,
  'P0001', 'invalid_input', 'a series has exactly one holder');
select throws_ok(
  $$ select * from public.create_series('c0000000-0000-0000-0000-000000000002',
       extract(dow from test_helpers.today())::integer, '20:00', test_helpers.today() + 10,
       test_helpers.today() + 3, p_guest_name => 'X') $$,
  'P0001', 'invalid_input', 'a series cannot end before it starts');

-- Ana, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select * from public.create_series('c0000000-0000-0000-0000-000000000002',
       extract(dow from test_helpers.today())::integer, '20:00', test_helpers.today() + 1, p_guest_name => 'X') $$,
  'P0001', 'forbidden', 'players cannot load recurring slots');

-- The daily job, as postgres.
reset role;
select id as series_id from public.recurring_series \gset

select is(private.extend_all_series(), 0, 'extending does nothing while the series is 8 weeks ahead');

-- Pretend a week went by: drop the last week (booking first, then its occupancy) and move
-- generated_until back.
select occupancy_id as last_occupancy from public.bookings
where series_id = :'series_id' and starts_at = test_helpers.at(56, '20:00') \gset
delete from public.bookings where occupancy_id = :'last_occupancy';
delete from public.court_occupancy where id = :'last_occupancy';
update public.recurring_series set generated_until = test_helpers.today() + 49;

select is(private.extend_all_series(), 1, 'the daily job extends a series that fell behind');
select is((select count(*)::int from public.bookings where series_id is not null and status = 'confirmed'), 7,
  'the extension books the missing week');
select is((select count(*)::int from cron.job where jobname = 'extend-recurring-series'), 1,
  'a daily job keeps the series 8 weeks ahead');

-- Carla ends the series from 3 weeks on.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is(public.end_series(:'series_id', test_helpers.today() + 21), 6,
  'ending a series cancels its bookings from that date on');
select is((select count(*)::int from public.bookings where series_id is not null and status = 'confirmed'), 1,
  'the week before the end date stays');
select is((select ends_on from public.recurring_series), test_helpers.today() + 20,
  'the series ends the day before');

-- Ana cannot end it.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  format('select public.end_series(%L, %L)', :'series_id', test_helpers.today() + 7),
  'P0001', 'forbidden', 'players cannot end a series');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx supabase test db supabase/tests/database/recurring_series.test.sql`
Expected: FAIL con `function public.create_series(...) does not exist`.

- [ ] **Step 3: Migración**

`supabase/migrations/20260929000500_recurring_series.sql` (Write tool):
```sql
-- Recurring slots ("turnos fijos") loaded by reception. A series books the same court, weekday and
-- time every week, 8 weeks ahead, and a daily pg_cron job keeps extending it. Dates that clash
-- with another occupancy (or lost their price or grid) are skipped and recorded for reception.

create function private.club_today(p_club_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone c.timezone)::date from public.clubs c where c.id = p_club_id;
$$;

create function private.series_horizon(p_club_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select private.club_today(p_club_id) + 56;
$$;

-- Books the series from p_from to p_until (inclusive). Returns the dates it had to skip.
create function private.generate_series_bookings(p_series public.recurring_series, p_from date, p_until date)
returns setof public.recurring_series_skips
language plpgsql
set search_path = ''
as $$
declare
  v_timezone text;
  v_date date;
  v_starts_at timestamptz;
  v_price integer;
  v_reason text;
  v_skip public.recurring_series_skips;
begin
  select timezone into v_timezone from public.clubs where id = p_series.club_id;
  -- First date on or after p_from that falls on the series weekday.
  v_date := p_from + ((p_series.weekday - extract(dow from p_from)::integer + 7) % 7);

  while v_date <= p_until loop
    v_starts_at := (v_date + p_series.start_time) at time zone v_timezone;
    v_reason := null;

    if v_starts_at > now() then
      begin
        v_price := private.slot_price(p_series.club_id, v_starts_at);
        if v_price is null then
          v_reason := 'no_price';
        else
          perform private.insert_booking(
            p_series.club_id, p_series.court_id, private.slot_period(p_series.club_id, v_starts_at), 'recurring',
            p_series.player_id, p_series.guest_name, 'reception', p_series.id, v_price
          );
        end if;
      exception when raise_exception then
        -- slot_taken, or not_aligned when the club changed its grid after the series was created.
        v_reason := sqlerrm;
      end;

      if v_reason is not null then
        insert into public.recurring_series_skips (club_id, series_id, on_date, reason)
        values (p_series.club_id, p_series.id, v_date, v_reason)
        on conflict (series_id, on_date) do update set reason = excluded.reason
        returning * into v_skip;
        return next v_skip;
      end if;
    end if;

    v_date := v_date + 7;
  end loop;

  update public.recurring_series
     set generated_until = greatest(coalesce(generated_until, p_until), p_until)
   where id = p_series.id;
  return;
end;
$$;

-- The holder is p_player_id or p_guest_name (exactly one); both default to null so the generated
-- types let the app pass only the one it has.
create function public.create_series(
  p_court_id uuid,
  p_weekday integer,
  p_start_time time,
  p_starts_on date,
  p_ends_on date default null,
  p_player_id uuid default null,
  p_guest_name text default null
)
returns setof public.recurring_series_skips
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club public.clubs;
  v_guest text := nullif(trim(p_guest_name), '');
  v_series public.recurring_series;
begin
  select c.* into v_club from public.clubs c join public.courts ct on ct.club_id = c.id where ct.id = p_court_id;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_club.id) then
    perform private.fail('forbidden');
  end if;
  if num_nonnulls(p_player_id, v_guest) <> 1 or length(v_guest) > 60
     or p_weekday is null or p_weekday not between 0 and 6
     or p_start_time is null or p_starts_on is null
     or (p_ends_on is not null and p_ends_on < p_starts_on) then
    perform private.fail('invalid_input');
  end if;
  if p_player_id is not null and not exists (
    select 1 from public.club_members where club_id = v_club.id and user_id = p_player_id
  ) then
    perform private.fail('invalid_input');
  end if;
  -- The start time has to be on the grid; any date works to check it.
  perform private.slot_period(v_club.id, (p_starts_on + p_start_time) at time zone v_club.timezone);

  insert into public.recurring_series (club_id, court_id, weekday, start_time, player_id, guest_name, starts_on,
                                       ends_on, created_by)
  values (v_club.id, p_court_id, p_weekday, p_start_time, p_player_id, v_guest, p_starts_on, p_ends_on,
          (select auth.uid()))
  returning * into v_series;

  return query
    select * from private.generate_series_bookings(
      v_series,
      greatest(p_starts_on, private.club_today(v_club.id)),
      least(coalesce(p_ends_on, 'infinity'::date), private.series_horizon(v_club.id))
    );
end;
$$;

-- Ends a series the day before p_from_date and cancels its bookings from that date on.
-- Returns how many bookings it cancelled.
create function public.end_series(p_series_id uuid, p_from_date date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series public.recurring_series;
  v_timezone text;
  v_booking public.bookings;
  v_count integer := 0;
begin
  select * into v_series from public.recurring_series where id = p_series_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_series.club_id) then
    perform private.fail('forbidden');
  end if;
  if p_from_date is null then
    perform private.fail('invalid_input');
  end if;
  select timezone into v_timezone from public.clubs where id = v_series.club_id;

  update public.recurring_series set ends_on = p_from_date - 1 where id = v_series.id;

  for v_booking in
    select * from public.bookings
    where series_id = v_series.id
      and status = 'confirmed'
      and starts_at >= (p_from_date::timestamp at time zone v_timezone)
    for update
  loop
    perform private.cancel_booking_row(v_booking);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Keeps every active series booked up to its horizon. Returns how many series it extended.
create function private.extend_all_series()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_series public.recurring_series;
  v_until date;
  v_count integer := 0;
begin
  for v_series in
    select * from public.recurring_series s
    where s.ends_on is null or s.ends_on >= private.club_today(s.club_id)
  loop
    v_until := least(coalesce(v_series.ends_on, 'infinity'::date), private.series_horizon(v_series.club_id));
    if v_series.generated_until is null or v_series.generated_until < v_until then
      perform * from private.generate_series_bookings(
        v_series,
        greatest(coalesce(v_series.generated_until + 1, v_series.starts_on), private.club_today(v_series.club_id)),
        v_until
      );
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.club_today(uuid) from public;
revoke all on function private.series_horizon(uuid) from public;
revoke all on function private.generate_series_bookings(public.recurring_series, date, date) from public;
revoke all on function private.extend_all_series() from public;
revoke execute on function public.create_series(uuid, integer, time, date, date, uuid, text) from public, anon;
revoke execute on function public.end_series(uuid, date) from public, anon;
grant execute on function public.create_series(uuid, integer, time, date, date, uuid, text) to authenticated;
grant execute on function public.end_series(uuid, date) to authenticated;

-- Every day at 07:00 UTC (04:00 in Montevideo), outside club hours.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.schedule('extend-recurring-series', '0 7 * * *', 'select private.extend_all_series()');
```

- [ ] **Step 4: Aplicar y correr**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/recurring_series.test.sql
```
Expected: `ok`, 18 tests. Si `db reset` falla en `create extension pg_cron`, verificar con `docker exec supabase_db_padel-management psql -U postgres -c "select name from pg_available_extensions where name = 'pg_cron'"` que la imagen lo trae (la 2.118 trae 1.6.4).

- [ ] **Step 5: Tipos y commit**

```bash
npm run db:types
git add supabase/migrations/20260929000500_recurring_series.sql supabase/tests/database/recurring_series.test.sql lib/supabase/database.types.ts
git commit -m "feat(db): add recurring series with daily extension"
```

---

### Task 7: Comprobantes en Storage

**Files:**
- Create: `supabase/migrations/20260929000600_receipts_storage.sql`
- Test: `supabase/tests/database/storage.test.sql`

- [ ] **Step 1: Test que falla**

`supabase/tests/database/storage.test.sql` (Write tool). Los objetos se insertan como `postgres` para simular subidas previas.
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(7);

insert into storage.objects (bucket_id, name) values
  ('receipts', '00000000-0000-0000-0000-0000000000a1/r1.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000b1/r2.png');

select is((select public from storage.buckets where id = 'receipts'), false, 'receipts is a private bucket');

-- Ana, player
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select is(
  (select count(*)::int from storage.objects where name like '00000000-0000-0000-0000-0000000000a1/%'), 1,
  'a player reads her own receipts');
select is(
  (select count(*)::int from storage.objects where name like '00000000-0000-0000-0000-0000000000b1/%'), 0,
  'a player cannot read someone else''s receipts');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('receipts', '00000000-0000-0000-0000-0000000000a1/r3.png') $$,
  'a player uploads into her own folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('receipts', '00000000-0000-0000-0000-0000000000b1/r4.png') $$,
  '42501', null, 'a player cannot upload into someone else''s folder');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is((select count(*)::int from storage.objects where bucket_id = 'receipts'), 3,
  'reception reads the receipts of club members');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';

select is((select count(*)::int from storage.objects where bucket_id = 'receipts'), 0,
  'someone outside the club reads none of them');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx supabase test db supabase/tests/database/storage.test.sql`
Expected: FAIL: el insert inicial falla por la FK a `storage.buckets` (el bucket `receipts` no existe).

- [ ] **Step 3: Migración**

`supabase/migrations/20260929000600_receipts_storage.sql` (Write tool):
```sql
-- Transfer receipts. Private bucket, one folder per user: receipts/<user_id>/<file>.
-- A player uploads and reads her own; reception and admin read the receipts of their club's members.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

-- The user a receipt belongs to: the first folder of its name, when it is a uuid.
create function private.folder_owner(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

revoke all on function private.folder_owner(text) from public;
grant execute on function private.folder_owner(text) to authenticated;

create policy receipts_insert_own_folder on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and private.folder_owner(name) = (select auth.uid()));

create policy receipts_select_own_or_staff on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and (
      private.folder_owner(name) = (select auth.uid())
      or private.is_staff_of_user(private.folder_owner(name))
    )
  );
```

- [ ] **Step 4: Aplicar y correr**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/storage.test.sql
```
Expected: `ok`, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260929000600_receipts_storage.sql supabase/tests/database/storage.test.sql
git commit -m "feat(db): add private receipts bucket and policies"
```

---

### Task 8: Pagos

**Files:**
- Create: `supabase/migrations/20260929000700_payments.sql`
- Test: `supabase/tests/database/payments.test.sql`
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: Test que falla**

`supabase/tests/database/payments.test.sql` (Write tool):
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(23);

call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '20:00', 90), '00000000-0000-0000-0000-0000000000a1', 1600);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(3, '20:00', 90), '00000000-0000-0000-0000-0000000000b1', 1600);
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(4, '20:00', 90), '00000000-0000-0000-0000-0000000000a1', 1600);

insert into storage.objects (bucket_id, name) values
  ('receipts', '00000000-0000-0000-0000-0000000000a1/r1.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000a1/r3.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000b1/r2.png');

-- Ana, player
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.report_transfer('b0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'receipt_required', 'the club asks for a receipt');
select throws_ok(
  $$ select public.report_transfer('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1/r2.png') $$,
  'P0001', 'forbidden', 'the receipt has to be in her own folder');
select throws_ok(
  $$ select public.report_transfer('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1/missing.png') $$,
  'P0001', 'forbidden', 'the receipt has to exist');
select throws_ok(
  $$ select public.report_transfer('b0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1/r1.png') $$,
  'P0001', 'forbidden', 'only for her own bookings');
select lives_ok(
  $$ select public.report_transfer('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1/r1.png') $$,
  'a player reports her transfer with the receipt');
select results_eq(
  $$ select method::text, amount, status::text, receipt_path from public.payments
     where booking_id = 'b0000000-0000-0000-0000-000000000001' $$,
  $$ values ('transfer', 1600, 'reported', '00000000-0000-0000-0000-0000000000a1/r1.png') $$,
  'the transfer is reported for the whole amount due');
select throws_ok(
  $$ select public.report_transfer('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1/r1.png') $$,
  'P0001', 'invalid_state', 'one reported transfer at a time');
select throws_ok(
  $$ select public.confirm_payment((select id from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000001')) $$,
  'P0001', 'forbidden', 'players cannot confirm payments');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.confirm_payment((select id from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000001')) $$,
  'reception confirms a reported transfer');
select results_eq(
  $$ select status::text, confirmed_by from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000001' $$,
  $$ values ('confirmed', '00000000-0000-0000-0000-0000000000c1'::uuid) $$,
  'the payment records who confirmed it');
select throws_ok(
  $$ select public.confirm_payment((select id from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000001')) $$,
  'P0001', 'invalid_state', 'a payment is confirmed once');
select throws_ok(
  $$ select public.record_cash('b0000000-0000-0000-0000-000000000002', 0) $$,
  'P0001', 'invalid_input', 'cash is a positive amount');
select throws_ok(
  $$ select public.record_cash('b0000000-0000-0000-0000-000000000002', 2000) $$,
  'P0001', 'invalid_input', 'cash cannot exceed what is due');
select lives_ok(
  $$ select public.record_cash('b0000000-0000-0000-0000-000000000002', 1600) $$,
  'reception records a cash payment');
select is(
  (select status::text from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000002'), 'confirmed',
  'cash is confirmed on the spot');
select lives_ok(
  $$ select public.refund_payment((select id from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000001')) $$,
  'reception marks a payment as refunded');
select is(
  (select status::text from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000001'), 'refunded',
  'the refund is recorded');

-- Ana again
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select is((select count(*)::int from public.payments), 1, 'a player sees only the payments of her bookings');
select lives_ok(
  $$ select public.report_transfer('b0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1/r3.png') $$,
  'she reports another transfer');

-- Carla rejects it
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.reject_payment((select id from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000003'),
       'No llegó') $$,
  'reception rejects a transfer with a reason');
select results_eq(
  $$ select status::text, rejection_reason from public.payments where booking_id = 'b0000000-0000-0000-0000-000000000003' $$,
  $$ values ('rejected', 'No llegó') $$,
  'the rejection keeps its reason');

-- Ana reports again; then the club stops taking transfers.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.report_transfer('b0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1/r3.png') $$,
  'after a rejection the player can report again');

reset role;
update public.clubs set accepts_transfer = false where id = 'a0000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.report_transfer('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1/r1.png') $$,
  'P0001', 'method_disabled', 'no transfers when the club does not take them');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx supabase test db supabase/tests/database/payments.test.sql`
Expected: FAIL con `function public.report_transfer(unknown) does not exist`.

- [ ] **Step 3: Migración**

`supabase/migrations/20260929000700_payments.sql` (Write tool):
```sql
-- Payments: the player reports a transfer with its receipt, reception confirms or rejects it,
-- records cash, and marks refunds. A booking is pending while its confirmed payments do not add
-- up to its price.

create function private.confirmed_amount(p_booking_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(amount), 0)::integer
  from public.payments
  where booking_id = p_booking_id and status = 'confirmed';
$$;

-- Locks a payment and checks the caller is staff of its club.
create function private.staff_payment(p_payment_id uuid)
returns public.payments
language plpgsql
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_payment.club_id) then
    perform private.fail('forbidden');
  end if;
  return v_payment;
end;
$$;

create function public.report_transfer(p_booking_id uuid, p_receipt_path text default null)
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
  v_due integer;
  v_payment public.payments;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null or v_booking.player_id is distinct from v_uid then
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
  if exists (select 1 from public.payments where booking_id = v_booking.id and status = 'reported') then
    perform private.fail('invalid_state');
  end if;

  v_due := v_booking.price - private.confirmed_amount(v_booking.id);
  if v_due <= 0 then
    perform private.fail('invalid_state');
  end if;

  insert into public.payments (club_id, booking_id, method, amount, status, receipt_path, reported_by)
  values (v_booking.club_id, v_booking.id, 'transfer', v_due, 'reported', v_path, v_uid)
  returning * into v_payment;
  return v_payment;
end;
$$;

create function public.record_cash(p_booking_id uuid, p_amount integer)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_booking public.bookings;
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
  if p_amount is null or p_amount <= 0 or p_amount > v_booking.price - private.confirmed_amount(v_booking.id) then
    perform private.fail('invalid_input');
  end if;

  insert into public.payments (club_id, booking_id, method, amount, status, reported_by, confirmed_by, confirmed_at)
  values (v_booking.club_id, v_booking.id, 'cash', p_amount, 'confirmed', v_uid, v_uid, now())
  returning * into v_payment;
  return v_payment;
end;
$$;

create function public.confirm_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments := private.staff_payment(p_payment_id);
begin
  if v_payment.status <> 'reported' then
    perform private.fail('invalid_state');
  end if;
  update public.payments
     set status = 'confirmed', confirmed_by = (select auth.uid()), confirmed_at = now()
   where id = v_payment.id
  returning * into v_payment;
  return v_payment;
end;
$$;

create function public.reject_payment(p_payment_id uuid, p_reason text default null)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments := private.staff_payment(p_payment_id);
begin
  if v_payment.status <> 'reported' then
    perform private.fail('invalid_state');
  end if;
  if length(trim(p_reason)) > 120 then
    perform private.fail('invalid_input');
  end if;
  update public.payments
     set status = 'rejected', rejection_reason = nullif(trim(p_reason), ''),
         confirmed_by = (select auth.uid()), confirmed_at = now()
   where id = v_payment.id
  returning * into v_payment;
  return v_payment;
end;
$$;

-- The app does not move money: reception returns it by hand and records it here.
create function public.refund_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments := private.staff_payment(p_payment_id);
begin
  if v_payment.status <> 'confirmed' then
    perform private.fail('invalid_state');
  end if;
  update public.payments
     set status = 'refunded', confirmed_by = (select auth.uid()), confirmed_at = now()
   where id = v_payment.id
  returning * into v_payment;
  return v_payment;
end;
$$;

revoke all on function private.confirmed_amount(uuid) from public;
revoke all on function private.staff_payment(uuid) from public;
revoke execute on function public.report_transfer(uuid, text) from public, anon;
revoke execute on function public.record_cash(uuid, integer) from public, anon;
revoke execute on function public.confirm_payment(uuid) from public, anon;
revoke execute on function public.reject_payment(uuid, text) from public, anon;
revoke execute on function public.refund_payment(uuid) from public, anon;
grant execute on function public.report_transfer(uuid, text) to authenticated;
grant execute on function public.record_cash(uuid, integer) to authenticated;
grant execute on function public.confirm_payment(uuid) to authenticated;
grant execute on function public.reject_payment(uuid, text) to authenticated;
grant execute on function public.refund_payment(uuid) to authenticated;
```

- [ ] **Step 4: Aplicar y correr**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/payments.test.sql
```
Expected: `ok`, 23 tests.

- [ ] **Step 5: Tipos y commit**

```bash
npm run db:types
git add supabase/migrations/20260929000700_payments.sql supabase/tests/database/payments.test.sql lib/supabase/database.types.ts
git commit -m "feat(db): add transfer reports, cash, confirmations and refunds"
```

---

### Task 9: Categorías y roles

**Files:**
- Create: `supabase/migrations/20260929000800_members.sql`
- Test: `supabase/tests/database/members.test.sql`
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: Test que falla**

`supabase/tests/database/members.test.sql` (Write tool):
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(15);

-- Omar joins the club by declaring his category.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';

select lives_ok(
  $$ select public.set_my_category('a0000000-0000-0000-0000-000000000001', 4) $$,
  'someone new joins the club by declaring a category');
select results_eq(
  $$ select role::text, category::int, category_validated from public.club_members
     where user_id = '00000000-0000-0000-0000-0000000000f1' $$,
  $$ values ('player', 4, false) $$,
  'he joins as a player, with the category pending validation');

-- Ana, validated category 5
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.set_my_category('a0000000-0000-0000-0000-000000000001', 3) $$,
  'a player changes her category');
select results_eq(
  $$ select category::int, category_validated from public.club_members
     where user_id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values (3, false) $$,
  'changing the category sends it back to validation');
select throws_ok(
  $$ select public.set_my_category('a0000000-0000-0000-0000-000000000001', 9) $$,
  'P0001', 'invalid_input', 'categories go from 1 to 8');
select throws_ok(
  $$ select public.validate_category('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 6) $$,
  'P0001', 'forbidden', 'players cannot validate categories');
select throws_ok(
  $$ select public.set_member_role('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'reception') $$,
  'P0001', 'forbidden', 'players cannot change roles');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.validate_category('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 6) $$,
  'reception validates categories');
select results_eq(
  $$ select category::int, category_validated from public.club_members
     where user_id = '00000000-0000-0000-0000-0000000000b1' $$,
  $$ values (6, true) $$,
  'the category is now validated');
select throws_ok(
  $$ select public.set_member_role('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'reception') $$,
  'P0001', 'forbidden', 'only admins change roles');

-- Dani, admin
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select lives_ok(
  $$ select public.set_member_role('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'reception') $$,
  'an admin changes a role');
select is(
  (select role::text from public.club_members where user_id = '00000000-0000-0000-0000-0000000000b1'), 'reception',
  'the new role is stored');
select throws_ok(
  $$ select public.set_member_role('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'player') $$,
  'P0001', 'forbidden', 'an admin cannot change their own role');
select throws_ok(
  $$ select public.set_member_role('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000dead', 'player') $$,
  'P0001', 'not_found', 'the member has to exist');
select throws_ok(
  $$ select public.validate_category('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 0) $$,
  'P0001', 'invalid_input', 'validated categories go from 1 to 8 too');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx supabase test db supabase/tests/database/members.test.sql`
Expected: FAIL con `function public.set_my_category(unknown, integer) does not exist`.

- [ ] **Step 3: Migración**

`supabase/migrations/20260929000800_members.sql` (Write tool):
```sql
-- Categories and roles. The player declares her category (and joins the club doing so); staff
-- validate it; only admins change roles.

create function public.set_my_category(p_club_id uuid, p_category integer)
returns public.club_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_member public.club_members;
begin
  if v_uid is null then
    perform private.fail('forbidden');
  end if;
  if p_category is null or p_category not between 1 and 8 then
    perform private.fail('invalid_input');
  end if;
  if not exists (select 1 from public.clubs where id = p_club_id) then
    perform private.fail('not_found');
  end if;

  insert into public.club_members (club_id, user_id, role, category, category_validated)
  values (p_club_id, v_uid, 'player', p_category, false)
  on conflict (club_id, user_id)
    do update set category = excluded.category, category_validated = false
  returning * into v_member;
  return v_member;
end;
$$;

create function public.validate_category(p_club_id uuid, p_user_id uuid, p_category integer)
returns public.club_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.club_members;
begin
  if not private.is_staff(p_club_id) then
    perform private.fail('forbidden');
  end if;
  if p_category is null or p_category not between 1 and 8 then
    perform private.fail('invalid_input');
  end if;

  update public.club_members
     set category = p_category, category_validated = true
   where club_id = p_club_id and user_id = p_user_id
  returning * into v_member;
  if not found then
    perform private.fail('not_found');
  end if;
  return v_member;
end;
$$;

create function public.set_member_role(p_club_id uuid, p_user_id uuid, p_role public.club_role)
returns public.club_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.club_members;
begin
  if not private.has_club_role(p_club_id, array['admin']::public.club_role[]) then
    perform private.fail('forbidden');
  end if;
  -- Keeps the club from losing its only admin by accident.
  if p_user_id = (select auth.uid()) then
    perform private.fail('forbidden');
  end if;
  if p_role is null then
    perform private.fail('invalid_input');
  end if;

  update public.club_members set role = p_role
   where club_id = p_club_id and user_id = p_user_id
  returning * into v_member;
  if not found then
    perform private.fail('not_found');
  end if;
  return v_member;
end;
$$;

revoke execute on function public.set_my_category(uuid, integer) from public, anon;
revoke execute on function public.validate_category(uuid, uuid, integer) from public, anon;
revoke execute on function public.set_member_role(uuid, uuid, public.club_role) from public, anon;
grant execute on function public.set_my_category(uuid, integer) to authenticated;
grant execute on function public.validate_category(uuid, uuid, integer) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, public.club_role) to authenticated;
```

- [ ] **Step 4: Aplicar y correr**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/members.test.sql
```
Expected: `ok`, 15 tests.

- [ ] **Step 5: Tipos y commit**

```bash
npm run db:types
git add supabase/migrations/20260929000800_members.sql supabase/tests/database/members.test.sql lib/supabase/database.types.ts
git commit -m "feat(db): add category declaration, validation and roles"
```

---

### Task 10: Seed local con los valores del prototipo

**Files:**
- Modify: `supabase/seed.sql`

# (no test — datos locales; los flujos e2e del corte 3 los usan)

- [ ] **Step 1: Seed**

Reemplazar `supabase/seed.sql` completo (Write tool):
```sql
-- Local data only (supabase start / db reset). Production is not seeded: Rustic's real data
-- arrives as a data migration (see the fase 1 plan).
-- Prototype values: 3 courts, 08:00-23:00, 90-minute slots (08:00 ... 21:30),
-- $1.200 and $1.600 from 18:30, cash and transfer.
insert into public.clubs (id, slug, name, timezone, opens_at, closes_at, slot_minutes, booking_window_days,
                          cancellation_notice_hours, max_active_bookings, accepts_cash, accepts_transfer,
                          transfer_details, transfer_receipt_required) values
  ('11111111-1111-1111-1111-111111111111', 'rustic', 'Rustic Pádel', 'America/Montevideo', '08:00', '23:00', 90, 14,
   24, 2, true, true,
   'Datos de prueba: Banco Ejemplo, caja de ahorro 000-000000, a nombre de Rustic Pádel.', true)
on conflict (id) do nothing;

insert into public.courts (id, club_id, name, is_covered, sort_order) values
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111', 'Cancha 1', true, 1),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111111', 'Cancha 2', true, 2),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111111', 'Cancha 3', false, 3)
on conflict (id) do nothing;

insert into public.pricing_rules (id, club_id, weekdays, from_time, to_time, price) values
  ('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111111', '{0,1,2,3,4,5,6}', '08:00', '18:30', 1200),
  ('33333333-3333-3333-3333-333333333302', '11111111-1111-1111-1111-111111111111', '{0,1,2,3,4,5,6}', '18:30', '24:00', 1600)
on conflict (id) do nothing;
```

- [ ] **Step 2: Aplicar y mirar**

Run:
```bash
npm run db:reset
docker exec supabase_db_padel-management psql -U postgres -At -c "select slug, opens_at, closes_at, slot_minutes from public.clubs; select count(*) from public.pricing_rules;"
```
Expected: `rustic|08:00:00|23:00:00|90` y `2`.

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "chore(db): seed Rustic with the prototype grid and prices"
```

---

### Task 11: Verificación del corte 1

**Files:** ninguno.

- [ ] **Step 1: Todo pgTAP y tipos estables**

Run:
```bash
npm run db:reset
npm run test:db
npm run db:types
git status --short lib/supabase/database.types.ts
npm run typecheck
npm test
```
Expected: pgTAP `All tests successful` (schema, occupancy, rls, booking_schema, slot_rules, player_bookings, staff_bookings, recurring_series, storage, payments, members). `git status` no muestra cambios en los tipos. Typecheck y Vitest en verde.

- [ ] **Step 2: Revisión de disciplina**

Correr `/team-setup:discipline-check` sobre las migraciones del corte. Arreglar lo que marque (commits aparte, `fix(db): …`).

---

### Task 12: Push y PR borrador

**Files:** ninguno.

- [ ] **Step 1: Push**

Run: `git push -u origin feat/fase-1-reservas`
Expected: la rama sube.

- [ ] **Step 2: PR borrador (MANUAL si `gh` no está instalado)**

Con `gh`:
```bash
gh pr create --draft --base main --title "Fase 1: reservas" --body "Implementa docs/features/fase-1-reservas/design.md por cortes. Plan: docs/features/fase-1-reservas/plan.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
Sin `gh` (notas de la fase 0): abrir `https://github.com/mmonroy1686/padel-management/compare/main...feat/fase-1-reservas`, elegir **Create draft pull request** con el mismo título y cuerpo.
Expected: CI corre en el PR; `quality` y `db-and-e2e` en verde (el smoke e2e sigue pasando).

---
## Corte 2: Dominio de turnos

Funciones puras, sin Supabase ni React. Todo lo que depende de la hora recibe `now` o el instante como parámetro.

### Task 13: Reloj del club (`lib/domain/time.ts`)

**Files:**
- Create: `lib/domain/time.ts`
- Test: `tests/unit/lib/domain/time.test.ts`

- [ ] **Step 1: Test que falla**

`tests/unit/lib/domain/time.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  addDays,
  formatMinutes,
  localDateOf,
  minutesOfDay,
  parseTime,
  toDate,
  weekdayOf,
  zonedTime,
} from '@/lib/domain/time'

const MONTEVIDEO = 'America/Montevideo'

describe('zonedTime', () => {
  it('turns the club wall clock into an instant', () => {
    expect(zonedTime('2026-10-01', 8 * 60, MONTEVIDEO).toISOString()).toBe('2026-10-01T11:00:00.000Z')
  })

  it('treats 24:00 as the next midnight', () => {
    expect(zonedTime('2026-10-01', 24 * 60, MONTEVIDEO).toISOString()).toBe('2026-10-02T03:00:00.000Z')
  })

  it('follows daylight saving time', () => {
    expect(zonedTime('2026-07-01', 10 * 60, 'Europe/Madrid').toISOString()).toBe('2026-07-01T08:00:00.000Z')
    expect(zonedTime('2026-12-01', 10 * 60, 'Europe/Madrid').toISOString()).toBe('2026-12-01T09:00:00.000Z')
  })
})

describe('reading an instant on the club clock', () => {
  it('uses the club date, not the UTC date', () => {
    expect(localDateOf(new Date('2026-10-02T02:30:00Z'), MONTEVIDEO)).toBe('2026-10-01')
  })

  it('counts minutes from local midnight', () => {
    expect(minutesOfDay(new Date('2026-10-01T23:30:00Z'), MONTEVIDEO)).toBe(20 * 60 + 30)
  })
})

describe('calendar arithmetic', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('numbers weekdays like Postgres: 0 is Sunday', () => {
    expect(weekdayOf('2026-10-04')).toBe(0)
    expect(weekdayOf('2026-10-01')).toBe(4)
  })
})

describe('times of day', () => {
  it('parses Postgres times, including 24:00', () => {
    expect(parseTime('08:00')).toBe(480)
    expect(parseTime('18:30:00')).toBe(1110)
    expect(parseTime('24:00:00')).toBe(1440)
  })

  it('rejects anything else', () => {
    expect(() => parseTime('8am')).toThrow(/Hora inválida/)
  })

  it('formats minutes as HH:MM', () => {
    expect(formatMinutes(1290)).toBe('21:30')
    expect(formatMinutes(1440)).toBe('24:00')
  })
})

describe('toDate', () => {
  it('reads timestamps from the database', () => {
    expect(toDate('2026-10-01T11:00:00+00:00').toISOString()).toBe('2026-10-01T11:00:00.000Z')
  })

  it('refuses a missing value instead of inventing a date', () => {
    expect(() => toDate(null)).toThrow()
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/unit/lib/domain/time.test.ts`
Expected: FAIL con `Failed to resolve import "@/lib/domain/time"`.

- [ ] **Step 3: Implementación**

`lib/domain/time.ts`:
```ts
// The club's wall clock, with Intl only (no date library).
// A LocalDate is 'YYYY-MM-DD' on the club's calendar. Minutes count from local midnight;
// 1440 is the next midnight, so a club that closes at 24:00 fits.

export type LocalDate = string

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number }

function wallClock(instant: Date, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value)
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  }
}

// How far the club's clock is ahead of UTC at that instant, in milliseconds.
function offsetMs(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone)
  const wallAsUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function parseLocalDate(date: LocalDate): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error(`Fecha inválida: ${date}`)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

// The instant when the club's clock shows `date` at `minutes` after midnight.
export function zonedTime(date: LocalDate, minutes: number, timeZone: string): Date {
  const { year, month, day } = parseLocalDate(date)
  const wallAsUtc = Date.UTC(year, month - 1, day, 0, minutes)
  // Two passes settle the offset even across a daylight saving change.
  const firstGuess = wallAsUtc - offsetMs(new Date(wallAsUtc), timeZone)
  return new Date(wallAsUtc - offsetMs(new Date(firstGuess), timeZone))
}

export function localDateOf(instant: Date, timeZone: string): LocalDate {
  const w = wallClock(instant, timeZone)
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`
}

export function minutesOfDay(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone)
  return w.hour * 60 + w.minute
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseLocalDate(date)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

// 0 = Sunday ... 6 = Saturday, like Postgres extract(dow).
export function weekdayOf(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

// 'HH:MM' or 'HH:MM:SS' (Postgres time) to minutes after midnight. '24:00' is 1440.
export function parseTime(value: string): number {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value)
  if (!match) throw new Error(`Hora inválida: ${value}`)
  return Number(match[1]) * 60 + Number(match[2])
}

export function formatMinutes(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

// Timestamps from the database. Generated columns come typed as nullable, but they never are.
export function toDate(value: string | null | undefined): Date {
  if (!value) throw new Error('Falta una fecha que la base siempre completa')
  return new Date(value)
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run tests/unit/lib/domain/time.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/time.ts tests/unit/lib/domain/time.test.ts
git commit -m "feat(domain): add club wall clock helpers"
```

---

### Task 14: Textos de precio, día y hora (`lib/domain/format.ts`)

**Files:**
- Create: `lib/domain/format.ts`
- Test: `tests/unit/lib/domain/format.test.ts`

- [ ] **Step 1: Test que falla**

`tests/unit/lib/domain/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { dayLabel, dayLongLabel, formatPrice, monthLabel, timeIn } from '@/lib/domain/format'

describe('formatPrice', () => {
  it('writes pesos with a dot every three digits', () => {
    expect(formatPrice(1200)).toBe('$1.200')
    expect(formatPrice(1600000)).toBe('$1.600.000')
    expect(formatPrice(0)).toBe('$0')
  })
})

describe('day labels', () => {
  const today = '2026-09-29'

  it('says today and tomorrow in words', () => {
    expect(dayLabel(today, today)).toBe('Hoy')
    expect(dayLabel('2026-09-30', today)).toBe('Mañana')
  })

  it('uses the short weekday and the day of the month after that', () => {
    expect(dayLabel('2026-10-01', today)).toBe('jue 1')
  })

  it('has a long form for sheets and cards', () => {
    expect(dayLongLabel('2026-10-01')).toBe('jueves 1 de octubre')
  })

  it('names months for the calendar', () => {
    expect(monthLabel('2026-10')).toBe('Octubre 2026')
  })
})

describe('timeIn', () => {
  it('shows the time on the club clock', () => {
    expect(timeIn(new Date('2026-10-01T23:30:00Z'), 'America/Montevideo')).toBe('20:30')
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/unit/lib/domain/format.test.ts`
Expected: FAIL con `Failed to resolve import "@/lib/domain/format"`.

- [ ] **Step 3: Implementación**

`lib/domain/format.ts`:
```ts
import { addDays, formatMinutes, minutesOfDay, parseLocalDate, weekdayOf, type LocalDate } from './time'

// Fixed Spanish names instead of Intl: the output is the same on every server and browser.
export const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const
export const WEEKDAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

export function formatPrice(pesos: number): string {
  const sign = pesos < 0 ? '-' : ''
  const digits = String(Math.abs(Math.round(pesos))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}$${digits}`
}

export function dayLabel(date: LocalDate, today: LocalDate): string {
  if (date === today) return 'Hoy'
  if (date === addDays(today, 1)) return 'Mañana'
  return `${WEEKDAYS_SHORT[weekdayOf(date)]} ${parseLocalDate(date).day}`
}

export function dayLongLabel(date: LocalDate): string {
  const { day, month } = parseLocalDate(date)
  return `${WEEKDAYS_LONG[weekdayOf(date)]} ${day} de ${MONTHS[month - 1]}`
}

// month is 'YYYY-MM'.
export function monthLabel(month: string): string {
  const [year, number] = month.split('-').map(Number)
  const name = MONTHS[number - 1]
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`
}

export function timeIn(instant: Date, timeZone: string): string {
  return formatMinutes(minutesOfDay(instant, timeZone))
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run tests/unit/lib/domain/format.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/format.ts tests/unit/lib/domain/format.test.ts
git commit -m "feat(domain): add Spanish price, day and time labels"
```

---

### Task 15: Turnos del día y precio (`lib/domain/slots.ts`)

**Files:**
- Create: `lib/domain/slots.ts`
- Test: `tests/unit/lib/domain/slots.test.ts`

- [ ] **Step 1: Test que falla**

`tests/unit/lib/domain/slots.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { daySlots, priceFor, type ClubSchedule, type PricingRule } from '@/lib/domain/slots'

const PROTOTYPE: ClubSchedule = {
  timezone: 'America/Montevideo',
  opensAt: '08:00:00',
  closesAt: '23:00:00',
  slotMinutes: 90,
}
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
const RULES: PricingRule[] = [
  { weekdays: EVERY_DAY, fromTime: '08:00:00', toTime: '18:30:00', price: 1200 },
  { weekdays: EVERY_DAY, fromTime: '18:30:00', toTime: '24:00:00', price: 1600 },
]
const THURSDAY = '2026-10-01'

describe('daySlots', () => {
  it('builds the prototype grid: 08:00 to 21:30 every 90 minutes', () => {
    expect(daySlots(PROTOTYPE, THURSDAY).map((slot) => slot.label)).toEqual([
      '08:00', '09:30', '11:00', '12:30', '14:00', '15:30', '17:00', '18:30', '20:00', '21:30',
    ])
  })

  it('places each slot on the club clock', () => {
    const [first] = daySlots(PROTOTYPE, THURSDAY)
    expect(first.startsAt.toISOString()).toBe('2026-10-01T11:00:00.000Z')
    expect(first.endsAt.toISOString()).toBe('2026-10-01T12:30:00.000Z')
    expect(first.startMinutes).toBe(480)
  })

  it('keeps a last slot that ends exactly at 24:00', () => {
    const last = daySlots({ ...PROTOTYPE, opensAt: '09:00', closesAt: '24:00:00' }, THURSDAY).at(-1)
    expect(last?.label).toBe('22:30')
    expect(last?.endsAt.toISOString()).toBe('2026-10-02T03:00:00.000Z')
  })

  it('drops a slot that would end after closing', () => {
    expect(daySlots({ ...PROTOTYPE, closesAt: '22:59' }, THURSDAY).at(-1)?.label).toBe('20:00')
  })

  it('returns no slots for a broken schedule', () => {
    expect(daySlots({ ...PROTOTYPE, slotMinutes: 0 }, THURSDAY)).toEqual([])
  })
})

describe('priceFor', () => {
  it('uses the daytime price before 18:30', () => {
    expect(priceFor(RULES, THURSDAY, 17 * 60)).toBe(1200)
  })

  it('switches to the evening price at 18:30', () => {
    expect(priceFor(RULES, THURSDAY, 18 * 60 + 30)).toBe(1600)
  })

  it('lets the band that starts latest win on its weekday', () => {
    const rules = [...RULES, { weekdays: [4], fromTime: '20:00', toTime: '24:00', price: 2000 }]
    expect(priceFor(rules, THURSDAY, 20 * 60)).toBe(2000)
    expect(priceFor(rules, '2026-10-02', 20 * 60)).toBe(1600)
  })

  it('has no price when no band covers that weekday', () => {
    const weekdaysOnly = [{ weekdays: [1, 2, 3, 4, 5], fromTime: '08:00', toTime: '24:00', price: 1000 }]
    expect(priceFor(weekdaysOnly, '2026-10-04', 10 * 60)).toBeNull()
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/unit/lib/domain/slots.test.ts`
Expected: FAIL con `Failed to resolve import "@/lib/domain/slots"`.

- [ ] **Step 3: Implementación**

`lib/domain/slots.ts`:
```ts
import { formatMinutes, parseTime, weekdayOf, zonedTime, type LocalDate } from './time'

export type ClubSchedule = { timezone: string; opensAt: string; closesAt: string; slotMinutes: number }
export type PricingRule = { weekdays: number[]; fromTime: string; toTime: string; price: number }
export type Slot = { startMinutes: number; label: string; startsAt: Date; endsAt: Date }

// Same grid as private.slot_period: opens_at + n * slot_minutes, ending no later than closes_at.
export function daySlots(schedule: ClubSchedule, date: LocalDate): Slot[] {
  if (schedule.slotMinutes <= 0) return []
  const open = parseTime(schedule.opensAt)
  const close = parseTime(schedule.closesAt)
  const slots: Slot[] = []
  for (let start = open; start + schedule.slotMinutes <= close; start += schedule.slotMinutes) {
    slots.push({
      startMinutes: start,
      label: formatMinutes(start),
      startsAt: zonedTime(date, start, schedule.timezone),
      endsAt: zonedTime(date, start + schedule.slotMinutes, schedule.timezone),
    })
  }
  return slots
}

// Same rule as private.slot_price: the band that covers the start on that weekday; the band that
// starts latest wins. null means the slot cannot be booked.
export function priceFor(rules: PricingRule[], date: LocalDate, startMinutes: number): number | null {
  const weekday = weekdayOf(date)
  const covering = rules
    .filter(
      (rule) =>
        rule.weekdays.includes(weekday) &&
        parseTime(rule.fromTime) <= startMinutes &&
        startMinutes < parseTime(rule.toTime),
    )
    .sort((a, b) => parseTime(b.fromTime) - parseTime(a.fromTime))
  return covering[0]?.price ?? null
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run tests/unit/lib/domain/slots.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/slots.ts tests/unit/lib/domain/slots.test.ts
git commit -m "feat(domain): generate the day's slots and prices"
```

---

### Task 16: Pagos y cancelación (`lib/domain/payments.ts`, `lib/domain/cancellation.ts`)

**Files:**
- Create: `lib/domain/payments.ts`, `lib/domain/cancellation.ts`
- Test: `tests/unit/lib/domain/payments.test.ts`, `tests/unit/lib/domain/cancellation.test.ts`

- [ ] **Step 1: Tests que fallan**

`tests/unit/lib/domain/payments.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { amountDue, PAYMENT_LABELS, paymentMethodsNote, paymentState } from '@/lib/domain/payments'

const booking = { price: 1200, status: 'confirmed' as const }

describe('paymentState', () => {
  it('is pending with nothing paid', () => {
    expect(paymentState(booking, [])).toBe('pending')
  })

  it('is reported while a transfer waits for the club', () => {
    expect(paymentState(booking, [{ status: 'reported', amount: 1200 }])).toBe('reported')
  })

  it('is paid once confirmed payments cover the price', () => {
    expect(paymentState(booking, [
      { status: 'confirmed', amount: 600 },
      { status: 'confirmed', amount: 600 },
    ])).toBe('paid')
  })

  it('stays pending after a rejection or a refund', () => {
    expect(paymentState(booking, [{ status: 'rejected', amount: 1200 }])).toBe('pending')
    expect(paymentState(booking, [{ status: 'refunded', amount: 1200 }])).toBe('pending')
  })

  it('asks for a refund when a paid booking is cancelled', () => {
    expect(paymentState({ price: 1200, status: 'cancelled' }, [{ status: 'confirmed', amount: 1200 }])).toBe('refund_due')
  })

  it('has nothing left to do for a cancelled unpaid booking', () => {
    expect(paymentState({ price: 1200, status: 'cancelled' }, [])).toBe('none')
  })

  it('has a Spanish label for every state', () => {
    expect(PAYMENT_LABELS).toEqual({
      paid: 'Pagada',
      reported: 'Transferencia informada',
      pending: 'Pendiente de pago',
      refund_due: 'A devolver',
      none: 'Sin pagos',
    })
  })
})

describe('amountDue', () => {
  it('subtracts only confirmed payments', () => {
    expect(amountDue(1600, [{ status: 'confirmed', amount: 600 }, { status: 'reported', amount: 1000 }])).toBe(1000)
  })

  it('never goes below zero', () => {
    expect(amountDue(1200, [{ status: 'confirmed', amount: 1500 }])).toBe(0)
  })
})

describe('paymentMethodsNote', () => {
  it('tells the player how to pay', () => {
    expect(paymentMethodsNote({ accepts_cash: true, accepts_transfer: true })).toBe('Se paga en el club o por transferencia.')
    expect(paymentMethodsNote({ accepts_cash: true, accepts_transfer: false })).toBe('Se paga en el club.')
    expect(paymentMethodsNote({ accepts_cash: false, accepts_transfer: true })).toBe('Se paga por transferencia.')
  })
})
```

`tests/unit/lib/domain/cancellation.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { cancellationRule, cancellationStatus } from '@/lib/domain/cancellation'

const now = new Date('2026-10-01T12:00:00Z')
const hoursFromNow = (hours: number) => new Date(now.getTime() + hours * 3_600_000)

describe('cancellationStatus', () => {
  it('allows cancelling with enough notice', () => {
    expect(cancellationStatus(hoursFromNow(30), 24, now)).toEqual({ allowed: true })
  })

  it('allows it exactly at the limit, like the database', () => {
    expect(cancellationStatus(hoursFromNow(24), 24, now)).toEqual({ allowed: true })
  })

  it('explains why inside the notice period', () => {
    expect(cancellationStatus(hoursFromNow(2), 24, now)).toEqual({
      allowed: false,
      reason: 'Ya no se puede cancelar: faltan menos de 24 h. Avisá al club.',
    })
  })

  it('explains why once the slot started', () => {
    expect(cancellationStatus(hoursFromNow(-1), 24, now)).toEqual({ allowed: false, reason: 'Este turno ya empezó.' })
  })
})

describe('cancellationRule', () => {
  it('states the rule before booking', () => {
    expect(cancellationRule(24)).toBe('Podés cancelar desde la app hasta 24 h antes. Después, avisá al club.')
    expect(cancellationRule(0)).toBe('Podés cancelar desde la app hasta que empiece el turno.')
  })
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/unit/lib/domain/payments.test.ts tests/unit/lib/domain/cancellation.test.ts`
Expected: FAIL, ambos por imports que no resuelven.

- [ ] **Step 3: Implementación**

`lib/domain/payments.ts`:
```ts
export type PaymentStatus = 'reported' | 'confirmed' | 'rejected' | 'refunded'
export type PaymentState = 'paid' | 'reported' | 'pending' | 'refund_due' | 'none'
export type PaymentLike = { status: PaymentStatus; amount: number }
export type BookingLike = { price: number; status: 'confirmed' | 'cancelled' }

export const PAYMENT_LABELS: Record<PaymentState, string> = {
  paid: 'Pagada',
  reported: 'Transferencia informada',
  pending: 'Pendiente de pago',
  refund_due: 'A devolver',
  none: 'Sin pagos',
}

function confirmedTotal(payments: PaymentLike[]): number {
  return payments.filter((p) => p.status === 'confirmed').reduce((sum, p) => sum + p.amount, 0)
}

// Same rule as the database: a booking is pending while its confirmed payments do not add up to its price.
export function amountDue(price: number, payments: PaymentLike[]): number {
  return Math.max(0, price - confirmedTotal(payments))
}

export function paymentState(booking: BookingLike, payments: PaymentLike[]): PaymentState {
  const confirmed = confirmedTotal(payments)
  if (booking.status === 'cancelled') return confirmed > 0 ? 'refund_due' : 'none'
  if (confirmed >= booking.price) return 'paid'
  if (payments.some((p) => p.status === 'reported')) return 'reported'
  return 'pending'
}

export function paymentMethodsNote(club: { accepts_cash: boolean; accepts_transfer: boolean }): string {
  if (club.accepts_cash && club.accepts_transfer) return 'Se paga en el club o por transferencia.'
  if (club.accepts_transfer) return 'Se paga por transferencia.'
  return 'Se paga en el club.'
}
```

`lib/domain/cancellation.ts`:
```ts
export type CancellationStatus = { allowed: true } | { allowed: false; reason: string }

// Same rule as cancel_my_booking: at least noticeHours before the start.
export function cancellationStatus(startsAt: Date, noticeHours: number, now: Date): CancellationStatus {
  const left = startsAt.getTime() - now.getTime()
  if (left <= 0) return { allowed: false, reason: 'Este turno ya empezó.' }
  if (left < noticeHours * 3_600_000) {
    return { allowed: false, reason: `Ya no se puede cancelar: faltan menos de ${noticeHours} h. Avisá al club.` }
  }
  return { allowed: true }
}

export function cancellationRule(noticeHours: number): string {
  if (noticeHours === 0) return 'Podés cancelar desde la app hasta que empiece el turno.'
  return `Podés cancelar desde la app hasta ${noticeHours} h antes. Después, avisá al club.`
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/unit/lib/domain/payments.test.ts tests/unit/lib/domain/cancellation.test.ts`
Expected: PASS, 10 + 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/payments.ts lib/domain/cancellation.ts tests/unit/lib/domain/payments.test.ts tests/unit/lib/domain/cancellation.test.ts
git commit -m "feat(domain): add payment state and cancellation rules"
```

---

### Task 17: Grilla del día (`lib/domain/grid.ts`)

**Files:**
- Create: `lib/domain/grid.ts`
- Create: `tests/unit/fixtures/grid.ts` (fixture compartido; no es un test)
- Test: `tests/unit/lib/domain/grid.test.ts`

- [ ] **Step 1: Fixture**

`tests/unit/fixtures/grid.ts`:
```ts
import { buildDayGrid, type Court, type DayGrid, type GridBooking, type Occupancy, type OccupancyKind } from '@/lib/domain/grid'
import { daySlots, type ClubSchedule, type PricingRule } from '@/lib/domain/slots'
import { zonedTime } from '@/lib/domain/time'

// The prototype club on Thursday 2026-10-01: 08:00 ... 21:30, $1.200 and $1.600 from 18:30.
export const TIMEZONE = 'America/Montevideo'
export const DATE = '2026-10-01'
export const SCHEDULE: ClubSchedule = { timezone: TIMEZONE, opensAt: '08:00', closesAt: '23:00', slotMinutes: 90 }
export const RULES: PricingRule[] = [
  { weekdays: [0, 1, 2, 3, 4, 5, 6], fromTime: '08:00', toTime: '18:30', price: 1200 },
  { weekdays: [0, 1, 2, 3, 4, 5, 6], fromTime: '18:30', toTime: '24:00', price: 1600 },
]
export const COURTS: Court[] = [
  { id: 'court-1', name: 'Cancha 1', isCovered: true },
  { id: 'court-2', name: 'Cancha 2', isCovered: false },
]

export function at(hhmm: string, date = DATE): Date {
  const [hours, minutes] = hhmm.split(':').map(Number)
  return zonedTime(date, hours * 60 + minutes, TIMEZONE)
}

export function occupancy(
  id: string,
  courtId: string,
  from: string,
  to: string,
  kind: OccupancyKind = 'booking',
  note: string | null = null,
): Occupancy {
  return { id, courtId, kind, note, startsAt: at(from), endsAt: at(to) }
}

export function booking(occupancyId: string, overrides: Partial<GridBooking> = {}): GridBooking {
  return {
    id: `b-${occupancyId}`,
    occupancyId,
    isMine: false,
    holderName: 'Rodríguez',
    playerId: null,
    price: 1200,
    source: 'reception',
    seriesId: null,
    paymentState: 'pending',
    amountDue: 1200,
    ...overrides,
  }
}

export function makeGrid({
  occupancies = [],
  bookings = [],
  now = at('07:00'),
  rules = RULES,
}: { occupancies?: Occupancy[]; bookings?: GridBooking[]; now?: Date; rules?: PricingRule[] } = {}): DayGrid {
  return buildDayGrid({ date: DATE, slots: daySlots(SCHEDULE, DATE), courts: COURTS, rules, occupancies, bookings, now })
}
```

- [ ] **Step 2: Test que falla**

`tests/unit/lib/domain/grid.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { blockEndOptions, countFree, dayStats, holderName, visibleRows } from '@/lib/domain/grid'
import { at, booking, makeGrid, occupancy } from '../../fixtures/grid'

describe('buildDayGrid', () => {
  it('offers every future slot on every court, with its price', () => {
    const grid = makeGrid()
    expect(grid.rows).toHaveLength(10)
    expect(grid.rows[0].cells.map((cell) => [cell.state, cell.price])).toEqual([['free', 1200], ['free', 1200]])
    expect(grid.rows[7].cells[0].price).toBe(1600)
  })

  it('shows an occupancy as taken and the viewer\'s own booking as mine', () => {
    const grid = makeGrid({
      occupancies: [occupancy('o1', 'court-1', '08:00', '09:30'), occupancy('o2', 'court-2', '08:00', '09:30')],
      bookings: [booking('o2', { isMine: true })],
    })
    expect(grid.rows[0].cells.map((cell) => cell.state)).toEqual(['taken', 'mine'])
    expect(grid.rows[0].cells[1].booking?.id).toBe('b-o2')
  })

  it('marks slots that already started as past', () => {
    const grid = makeGrid({ now: at('09:30') })
    expect(grid.rows.slice(0, 3).map((row) => row.past)).toEqual([true, true, false])
    expect(grid.rows[0].cells[0].state).toBe('past')
  })

  it('covers every slot a long block touches, without calling it off the grid', () => {
    const grid = makeGrid({ occupancies: [occupancy('blk', 'court-1', '09:30', '12:30', 'block', 'Clase')] })
    expect(grid.rows.slice(0, 4).map((row) => row.cells[0].state)).toEqual(['free', 'taken', 'taken', 'free'])
    expect(grid.rows[1].cells[0].offGrid).toBe(false)
  })

  it('flags a booking that no longer matches the grid', () => {
    const grid = makeGrid({ occupancies: [occupancy('o1', 'court-1', '08:30', '10:00')] })
    expect(grid.rows[0].cells[0].offGrid).toBe(true)
    expect(grid.rows[1].cells[0].offGrid).toBe(true)
  })

  it('lists occupancies that fall outside every slot', () => {
    const grid = makeGrid({ occupancies: [occupancy('late', 'court-1', '23:00', '23:59')] })
    expect(grid.outside.map((o) => o.id)).toEqual(['late'])
  })

  it('does not offer slots without a price', () => {
    const grid = makeGrid({ rules: [] })
    expect(grid.rows[0].cells[0]).toMatchObject({ state: 'no_price', price: null })
  })
})

describe('visibleRows', () => {
  it('hides past rows unless asked', () => {
    const grid = makeGrid({ now: at('10:00') })
    expect(visibleRows(grid.rows, { onlyFree: false, showPast: false })).toHaveLength(8)
    expect(visibleRows(grid.rows, { onlyFree: false, showPast: true })).toHaveLength(10)
  })

  it('keeps only rows with a free court when filtering', () => {
    const grid = makeGrid({
      occupancies: [occupancy('o1', 'court-1', '08:00', '09:30'), occupancy('o2', 'court-2', '08:00', '09:30')],
    })
    expect(visibleRows(grid.rows, { onlyFree: true, showPast: false })[0].slot.label).toBe('09:30')
  })
})

describe('countFree', () => {
  it('counts free cells', () => {
    expect(countFree(makeGrid().rows)).toBe(20)
    expect(countFree(makeGrid({ now: at('21:00') }).rows)).toBe(2)
  })
})

describe('dayStats', () => {
  it('computes occupancy over every cell and revenue from distinct bookings', () => {
    const grid = makeGrid({
      occupancies: [occupancy('o1', 'court-1', '08:00', '09:30'), occupancy('blk', 'court-2', '08:00', '11:00', 'block')],
      bookings: [booking('o1', { price: 1200 })],
    })
    expect(dayStats(grid)).toEqual({ occupancyPercent: 15, revenue: 1200 })
  })
})

describe('blockEndOptions', () => {
  it('offers every end time until the next occupancy on that court', () => {
    const grid = makeGrid({ occupancies: [occupancy('o1', 'court-1', '12:30', '14:00')] })
    const options = blockEndOptions(grid.rows, grid.rows[0].cells[0])
    expect(options.map((option) => option.label)).toEqual(['09:30', '11:00', '12:30'])
    expect(options[0].value).toBe(at('09:30').toISOString())
  })
})

describe('holderName', () => {
  it('prefers the name reception typed, then the player\'s name', () => {
    expect(holderName('Rodríguez', 'Ana')).toBe('Rodríguez')
    expect(holderName(null, 'Ana')).toBe('Ana')
    expect(holderName(null, null)).toBeNull()
  })
})
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run tests/unit/lib/domain/grid.test.ts`
Expected: FAIL con `Failed to resolve import "@/lib/domain/grid"`.

- [ ] **Step 4: Implementación**

`lib/domain/grid.ts`:
```ts
import type { PaymentState } from './payments'
import { priceFor, type PricingRule, type Slot } from './slots'
import { formatMinutes, type LocalDate } from './time'

export type OccupancyKind = 'booking' | 'recurring' | 'tournament' | 'block' | 'match' | 'day_use'
export type Court = { id: string; name: string; isCovered: boolean }
export type Occupancy = {
  id: string
  courtId: string
  kind: OccupancyKind
  startsAt: Date
  endsAt: Date
  note: string | null
}
// What the viewer may know about the booking behind an occupancy. Players only get their own.
export type GridBooking = {
  id: string
  occupancyId: string
  isMine: boolean
  holderName: string | null
  playerId: string | null
  price: number
  source: 'online' | 'reception'
  seriesId: string | null
  paymentState: PaymentState
  amountDue: number
}
export type CellState = 'free' | 'mine' | 'taken' | 'past' | 'no_price'
export type GridCell = {
  court: Court
  slot: Slot
  state: CellState
  price: number | null
  occupancy: Occupancy | null
  booking: GridBooking | null
  offGrid: boolean
}
export type GridRow = { slot: Slot; past: boolean; cells: GridCell[] }
export type DayGrid = { date: LocalDate; courts: Court[]; rows: GridRow[]; outside: Occupancy[] }

export const KIND_LABELS: Record<OccupancyKind, string> = {
  booking: 'Reserva',
  recurring: 'Turno fijo',
  tournament: 'Torneo',
  block: 'Bloqueo',
  match: 'Partido',
  day_use: 'Day use',
}

function overlaps(occupancy: Occupancy, slot: Slot): boolean {
  return occupancy.startsAt < slot.endsAt && occupancy.endsAt > slot.startsAt
}

// A booking that no longer lines up with the grid (the club changed its hours or slot length).
function isOffGrid(occupancy: Occupancy | null, slot: Slot): boolean {
  if (!occupancy || (occupancy.kind !== 'booking' && occupancy.kind !== 'recurring')) return false
  return (
    occupancy.startsAt.getTime() !== slot.startsAt.getTime() || occupancy.endsAt.getTime() !== slot.endsAt.getTime()
  )
}

function cellState(occupancy: Occupancy | null, booking: GridBooking | null, past: boolean, price: number | null): CellState {
  if (occupancy) return booking?.isMine ? 'mine' : 'taken'
  if (past) return 'past'
  if (price === null) return 'no_price'
  return 'free'
}

export function buildDayGrid(input: {
  date: LocalDate
  slots: Slot[]
  courts: Court[]
  rules: PricingRule[]
  occupancies: Occupancy[]
  bookings: GridBooking[]
  now: Date
}): DayGrid {
  const bookingByOccupancy = new Map(input.bookings.map((booking) => [booking.occupancyId, booking]))
  const rows = input.slots.map((slot) => {
    const past = slot.startsAt.getTime() <= input.now.getTime()
    const price = priceFor(input.rules, input.date, slot.startMinutes)
    const cells = input.courts.map((court) => {
      const occupancy = input.occupancies.find((o) => o.courtId === court.id && overlaps(o, slot)) ?? null
      const booking = occupancy ? (bookingByOccupancy.get(occupancy.id) ?? null) : null
      return {
        court,
        slot,
        price,
        occupancy,
        booking,
        state: cellState(occupancy, booking, past, price),
        offGrid: isOffGrid(occupancy, slot),
      }
    })
    return { slot, past, cells }
  })
  const outside = input.occupancies.filter((o) => !input.slots.some((slot) => overlaps(o, slot)))
  return { date: input.date, courts: input.courts, rows, outside }
}

export function visibleRows(rows: GridRow[], options: { onlyFree: boolean; showPast: boolean }): GridRow[] {
  return rows.filter(
    (row) => (options.showPast || !row.past) && (!options.onlyFree || row.cells.some((cell) => cell.state === 'free')),
  )
}

export function countFree(rows: GridRow[]): number {
  return rows.reduce((total, row) => total + row.cells.filter((cell) => cell.state === 'free').length, 0)
}

export function dayStats(grid: DayGrid): { occupancyPercent: number; revenue: number } {
  const cells = grid.rows.flatMap((row) => row.cells)
  if (cells.length === 0) return { occupancyPercent: 0, revenue: 0 }
  const occupied = cells.filter((cell) => cell.occupancy).length
  const prices = new Map(cells.flatMap((cell) => (cell.booking ? [[cell.booking.id, cell.booking.price] as const] : [])))
  const revenue = [...prices.values()].reduce((sum, price) => sum + price, 0)
  return { occupancyPercent: Math.round((occupied / cells.length) * 100), revenue }
}

// End times reception can pick for a block that starts at `cell`: slot ends on the same court,
// until the next occupancy.
export function blockEndOptions(rows: GridRow[], cell: GridCell): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  const start = rows.findIndex((row) => row.slot.startsAt.getTime() === cell.slot.startsAt.getTime())
  if (start < 0) return options
  for (const row of rows.slice(start)) {
    const sameCourt = row.cells.find((c) => c.court.id === cell.court.id)
    if (!sameCourt || sameCourt.occupancy) break
    const minutes = (row.slot.endsAt.getTime() - row.slot.startsAt.getTime()) / 60_000
    options.push({ value: row.slot.endsAt.toISOString(), label: formatMinutes(row.slot.startMinutes + minutes) })
  }
  return options
}

export function holderName(guestName: string | null, playerName: string | null): string | null {
  return guestName ?? playerName ?? null
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `npx vitest run tests/unit/lib/domain/grid.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/grid.ts tests/unit/fixtures/grid.ts tests/unit/lib/domain/grid.test.ts
git commit -m "feat(domain): build the day grid of courts and slots"
```

---

### Task 18: Errores y resultado de las acciones

**Files:**
- Create: `lib/domain/errors.ts`, `lib/actions/result.ts`
- Test: `tests/unit/lib/domain/errors.test.ts`, `tests/unit/lib/actions/result.test.ts`

- [ ] **Step 1: Tests que fallan**

`tests/unit/lib/domain/errors.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { errorMessage, FALLBACK_MESSAGE, isErrorCode } from '@/lib/domain/errors'

// Every code the database functions raise (supabase/migrations/20260929000*.sql).
const DATABASE_CODES = [
  'slot_taken', 'not_aligned', 'in_the_past', 'outside_window', 'notice_period', 'no_price',
  'too_many_bookings', 'busy_at_that_time', 'receipt_required', 'forbidden', 'not_found',
  'invalid_state', 'invalid_input', 'method_disabled',
]

describe('errorMessage', () => {
  it.each(DATABASE_CODES)('translates %s', (code) => {
    expect(isErrorCode(code)).toBe(true)
    expect(errorMessage(code)).not.toBe(FALLBACK_MESSAGE)
  })

  it('tells the player the court was just taken', () => {
    expect(errorMessage('slot_taken')).toBe('Esa cancha se acaba de ocupar. Elegí otro horario.')
  })

  it('falls back for unknown codes and inherited object keys', () => {
    expect(errorMessage('boom')).toBe(FALLBACK_MESSAGE)
    expect(errorMessage('constructor')).toBe(FALLBACK_MESSAGE)
    expect(errorMessage(undefined)).toBe(FALLBACK_MESSAGE)
  })
})
```

`tests/unit/lib/actions/result.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { failed, fromRpc, IDLE, INVALID_INPUT, ok } from '@/lib/actions/result'
import { errorMessage } from '@/lib/domain/errors'

describe('action results', () => {
  it('starts idle', () => {
    expect(IDLE).toEqual({ status: 'idle' })
  })

  it('turns an RPC error into its Spanish message', () => {
    expect(fromRpc({ message: 'slot_taken' }, 'Reservado')).toEqual({ status: 'error', message: errorMessage('slot_taken') })
  })

  it('returns the success message when the RPC worked', () => {
    expect(fromRpc(null, 'Reservado')).toEqual({ status: 'ok', message: 'Reservado' })
  })

  it('has helpers for the other outcomes', () => {
    expect(ok('Listo')).toEqual({ status: 'ok', message: 'Listo' })
    expect(failed('Mal')).toEqual({ status: 'error', message: 'Mal' })
    expect(INVALID_INPUT).toEqual({ status: 'error', message: errorMessage('invalid_input') })
  })
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/unit/lib/domain/errors.test.ts tests/unit/lib/actions/result.test.ts`
Expected: FAIL por imports que no resuelven.

- [ ] **Step 3: Implementación**

`lib/domain/errors.ts`:
```ts
// Stable codes raised by the database functions (private.fail) and their Spanish text.
const MESSAGES = {
  slot_taken: 'Esa cancha se acaba de ocupar. Elegí otro horario.',
  not_aligned: 'Ese horario no coincide con los turnos del club.',
  in_the_past: 'Ese turno ya pasó.',
  outside_window: 'Todavía no se puede reservar para esa fecha.',
  notice_period: 'Ya no se puede cancelar: el plazo de aviso terminó. Avisá al club.',
  no_price: 'Ese turno no tiene precio cargado. Consultá en el club.',
  too_many_bookings: 'Llegaste al máximo de reservas activas. Cancelá una o esperá a jugarla.',
  busy_at_that_time: 'Ya tenés una reserva a esa hora.',
  receipt_required: 'Subí el comprobante de la transferencia.',
  forbidden: 'No tenés permiso para hacer eso.',
  not_found: 'No encontramos lo que buscabas. Puede que ya no exista.',
  invalid_state: 'Eso ya no se puede hacer: cambió mientras tanto. Recargá la página.',
  invalid_input: 'Revisá los datos ingresados.',
  method_disabled: 'El club no acepta ese medio de pago.',
} as const

export type ErrorCode = keyof typeof MESSAGES

export const FALLBACK_MESSAGE = 'Algo salió mal. Probá de nuevo en un momento.'

export function isErrorCode(value: string): value is ErrorCode {
  // hasOwn so "constructor" does not pick up Object.prototype.
  return Object.hasOwn(MESSAGES, value)
}

export function errorMessage(raw: string | null | undefined): string {
  const code = raw?.trim() ?? ''
  return isErrorCode(code) ? MESSAGES[code] : FALLBACK_MESSAGE
}
```

`lib/actions/result.ts`:
```ts
import { errorMessage } from '@/lib/domain/errors'

// What a Server Action returns to its form: shown in place, without closing the sheet.
export type ActionState = { status: 'idle' | 'ok' | 'error'; message?: string }

export const IDLE: ActionState = { status: 'idle' }

export function ok(message: string): ActionState {
  return { status: 'ok', message }
}

export function failed(message: string): ActionState {
  return { status: 'error', message }
}

export const INVALID_INPUT: ActionState = failed(errorMessage('invalid_input'))

// Supabase puts the code raised by private.fail in error.message.
export function fromRpc(error: { message: string } | null, okMessage: string): ActionState {
  return error ? failed(errorMessage(error.message)) : ok(okMessage)
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/unit/lib/domain/errors.test.ts tests/unit/lib/actions/result.test.ts`
Expected: PASS, 16 + 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/errors.ts lib/actions/result.ts tests/unit/lib/domain/errors.test.ts tests/unit/lib/actions/result.test.ts
git commit -m "feat(domain): translate database error codes for the app"
```

---

### Task 19: Lectura de formularios (`lib/domain/input.ts`)

**Files:**
- Create: `lib/domain/input.ts`
- Test: `tests/unit/lib/domain/input.test.ts`

- [ ] **Step 1: Test que falla**

`tests/unit/lib/domain/input.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  isLocalDate,
  isUuid,
  readBoolean,
  readEnum,
  readInstant,
  readInt,
  readLocalDate,
  readText,
  readTime,
  readUuid,
} from '@/lib/domain/input'

function form(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

const ID = '22222222-2222-2222-2222-222222222201'

describe('readUuid', () => {
  it('accepts a uuid and normalizes its case', () => {
    expect(readUuid(form({ id: ID.toUpperCase() }), 'id')).toBe(ID)
  })

  it('rejects anything else', () => {
    expect(readUuid(form({ id: 'cancha-1' }), 'id')).toBeNull()
    expect(readUuid(form({}), 'id')).toBeNull()
    expect(isUuid(42)).toBe(false)
  })
})

describe('readInstant', () => {
  it('accepts ISO instants with a zone and returns them in UTC', () => {
    expect(readInstant(form({ at: '2026-10-01T11:00:00.000Z' }), 'at')).toBe('2026-10-01T11:00:00.000Z')
    expect(readInstant(form({ at: '2026-10-01T08:00:00-03:00' }), 'at')).toBe('2026-10-01T11:00:00.000Z')
  })

  it('rejects instants without a zone and text', () => {
    expect(readInstant(form({ at: '2026-10-01T08:00' }), 'at')).toBeNull()
    expect(readInstant(form({ at: 'mañana' }), 'at')).toBeNull()
  })
})

describe('readInt', () => {
  it('reads whole numbers inside the range', () => {
    expect(readInt(form({ n: '1600' }), 'n', { min: 1, max: 10000 })).toBe(1600)
  })

  it('rejects out of range, decimals and text', () => {
    expect(readInt(form({ n: '0' }), 'n', { min: 1, max: 10 })).toBeNull()
    expect(readInt(form({ n: '3.5' }), 'n', { min: 1, max: 10 })).toBeNull()
    expect(readInt(form({ n: 'tres' }), 'n', { min: 1, max: 10 })).toBeNull()
  })
})

describe('readText', () => {
  it('trims and limits length', () => {
    expect(readText(form({ name: '  Rodríguez ' }), 'name', { maxLength: 60 })).toBe('Rodríguez')
    expect(readText(form({ name: '   ' }), 'name', { maxLength: 60 })).toBeNull()
    expect(readText(form({ name: 'x'.repeat(61) }), 'name', { maxLength: 60 })).toBeNull()
  })
})

describe('readEnum, readTime and readBoolean', () => {
  it('accepts only listed values', () => {
    expect(readEnum(form({ side: 'drive' }), 'side', ['drive', 'backhand'] as const)).toBe('drive')
    expect(readEnum(form({ side: 'center' }), 'side', ['drive', 'backhand'] as const)).toBeNull()
  })

  it('reads HH:MM times up to 24:00', () => {
    expect(readTime(form({ t: '08:00' }), 't')).toBe('08:00')
    expect(readTime(form({ t: '24:00' }), 't')).toBe('24:00')
    expect(readTime(form({ t: '24:30' }), 't')).toBeNull()
    expect(readTime(form({ t: '8:00' }), 't')).toBeNull()
  })

  it('reads checkboxes', () => {
    expect(readBoolean(form({ cash: 'on' }), 'cash')).toBe(true)
    expect(readBoolean(form({}), 'cash')).toBe(false)
  })
})

describe('local dates', () => {
  it('accepts real calendar dates only', () => {
    expect(isLocalDate('2026-10-01')).toBe(true)
    expect(isLocalDate('2026-02-30')).toBe(false)
    expect(isLocalDate('hoy')).toBe(false)
    expect(isLocalDate(undefined)).toBe(false)
    expect(readLocalDate(form({ d: '2026-10-01' }), 'd')).toBe('2026-10-01')
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/unit/lib/domain/input.test.ts`
Expected: FAIL con `Failed to resolve import "@/lib/domain/input"`.

- [ ] **Step 3: Implementación**

`lib/domain/input.ts`:
```ts
import type { LocalDate } from './time'

// Server Actions are reachable by any POST: every field is read and checked here before it
// reaches an RPC. They return null for anything that does not have the expected shape.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ZONED_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/
const TIME = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

function raw(form: FormData, name: string): string | null {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : null
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export function readUuid(form: FormData, name: string): string | null {
  const value = raw(form, name)
  return isUuid(value) ? value.toLowerCase() : null
}

export function readInstant(form: FormData, name: string): string | null {
  const value = raw(form, name)
  if (!value || !ZONED_INSTANT.test(value)) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

export function readInt(form: FormData, name: string, range: { min: number; max: number }): number | null {
  const value = raw(form, name)
  if (!value || !/^-?\d+$/.test(value)) return null
  const number = Number(value)
  return number >= range.min && number <= range.max ? number : null
}

export function readText(form: FormData, name: string, options: { maxLength: number }): string | null {
  const value = raw(form, name)
  return value && value.length <= options.maxLength ? value : null
}

export function readEnum<T extends string>(form: FormData, name: string, values: readonly T[]): T | null {
  const value = raw(form, name)
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : null
}

export function readTime(form: FormData, name: string): string | null {
  const value = raw(form, name)
  return value && TIME.test(value) ? value : null
}

export function readBoolean(form: FormData, name: string): boolean {
  return form.get(name) === 'on'
}

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string' || !DATE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function readLocalDate(form: FormData, name: string): LocalDate | null {
  const value = raw(form, name)
  return isLocalDate(value) ? value : null
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run tests/unit/lib/domain/input.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/input.ts tests/unit/lib/domain/input.test.ts
git commit -m "feat(domain): validate form input for server actions"
```

---

### Task 20: Perfil del jugador (`lib/domain/profile.ts`)

**Files:**
- Create: `lib/domain/profile.ts`
- Test: `tests/unit/lib/domain/profile.test.ts`

- [ ] **Step 1: Test que falla**

`tests/unit/lib/domain/profile.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { categoryLabel, firstName, isProfileComplete, isStaffRole, SIDE_LABELS } from '@/lib/domain/profile'

describe('isProfileComplete', () => {
  const profile = { side: 'drive', hand: 'right' }

  it('needs side, hand and a category in the club', () => {
    expect(isProfileComplete(profile, { category: 5 })).toBe(true)
  })

  it('sends people without them to the welcome form', () => {
    expect(isProfileComplete({ side: null, hand: 'right' }, { category: 5 })).toBe(false)
    expect(isProfileComplete(profile, { category: null })).toBe(false)
    expect(isProfileComplete(profile, null)).toBe(false)
  })
})

describe('labels', () => {
  it('names categories and whether the club validated them', () => {
    expect(categoryLabel(5, true)).toBe('5ª categoría, validada')
    expect(categoryLabel(5, false)).toBe('5ª categoría, pendiente de validación')
    expect(categoryLabel(null, false)).toBe('Sin categoría')
  })

  it('names sides in Spanish', () => {
    expect(SIDE_LABELS).toEqual({ drive: 'Drive', backhand: 'Revés', both: 'Ambos lados' })
  })

  it('greets by first name', () => {
    expect(firstName('Lucía Gómez')).toBe('Lucía')
    expect(firstName('  ')).toBe('')
  })
})

describe('isStaffRole', () => {
  it('is true for reception and admin only', () => {
    expect(isStaffRole('admin')).toBe(true)
    expect(isStaffRole('reception')).toBe(true)
    expect(isStaffRole('player')).toBe(false)
    expect(isStaffRole(null)).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/unit/lib/domain/profile.test.ts`
Expected: FAIL con `Failed to resolve import "@/lib/domain/profile"`.

- [ ] **Step 3: Implementación**

`lib/domain/profile.ts`:
```ts
export const SIDES = ['drive', 'backhand', 'both'] as const
export const HANDS = ['right', 'left'] as const
export const ROLES = ['admin', 'reception', 'player'] as const
export const CATEGORIES = [1, 2, 3, 4, 5, 6, 7, 8] as const

export type Side = (typeof SIDES)[number]
export type Hand = (typeof HANDS)[number]
export type Role = (typeof ROLES)[number]

export const SIDE_LABELS: Record<Side, string> = { drive: 'Drive', backhand: 'Revés', both: 'Ambos lados' }
export const HAND_LABELS: Record<Hand, string> = { right: 'Diestro', left: 'Zurdo' }
export const ROLE_LABELS: Record<Role, string> = { admin: 'Admin', reception: 'Recepción', player: 'Jugador' }

// Before booking, a player needs side, hand and a category in the club (design: "alta obligatoria").
export function isProfileComplete(
  profile: { side: string | null; hand: string | null },
  membership: { category: number | null } | null,
): boolean {
  return Boolean(profile.side && profile.hand && membership?.category)
}

export function isStaffRole(role: Role | null | undefined): boolean {
  return role === 'admin' || role === 'reception'
}

export function categoryLabel(category: number | null, validated: boolean): string {
  if (category === null) return 'Sin categoría'
  return `${category}ª categoría, ${validated ? 'validada' : 'pendiente de validación'}`
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? ''
}
```

- [ ] **Step 4: Correr y ver que pasa, y cerrar el corte**

Run:
```bash
npx vitest run tests/unit/lib/domain/profile.test.ts
npm test
npm run lint
npm run typecheck
```
Expected: PASS (6 tests en el archivo) y toda la suite, lint y typecheck en verde.

- [ ] **Step 5: Commit y push**

```bash
git add lib/domain/profile.ts tests/unit/lib/domain/profile.test.ts
git commit -m "feat(domain): add player profile rules and labels"
git push
```

---
## Corte 3: Reservar y Mis reservas

### Task 21: Soporte e2e (Supabase local, Mailpit y limpieza)

**Files:**
- Create: `tests/e2e/support/env.ts`, `tests/e2e/support/admin.ts`, `tests/e2e/support/auth.ts`, `tests/e2e/support/files.ts`, `tests/e2e/support/global-setup.ts`
- Modify: `playwright.config.ts`
- Modify: `.github/workflows/ci.yml`

# (no test propio — es infraestructura de los flujos; se verifica corriendo el smoke con el global setup)

- [ ] **Step 1: Entorno local compartido**

`tests/e2e/support/env.ts`:
```ts
import { execSync } from 'node:child_process'

export type LocalSupabase = { apiUrl: string; publishableKey: string; serviceRoleKey: string; mailpitUrl: string }

let cached: LocalSupabase | undefined

// E2E always runs against the local Supabase stack, never production. CI exports these
// variables itself (.github/workflows/ci.yml); locally they come from `supabase status`.
export function localSupabase(): LocalSupabase {
  if (cached) return cached
  if (process.env.CI) {
    cached = {
      apiUrl: required('NEXT_PUBLIC_SUPABASE_URL'),
      publishableKey: required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
      serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
      mailpitUrl: required('MAILPIT_URL'),
    }
    return cached
  }
  const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }))
  cached = {
    apiUrl: status.API_URL,
    publishableKey: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY ?? status.SECRET_KEY,
    mailpitUrl: status.MAILPIT_URL ?? status.INBUCKET_URL,
  }
  return cached
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Falta ${name} para los tests e2e`)
  return value
}
```

- [ ] **Step 2: Cliente de servicio y usuarios de prueba**

`tests/e2e/support/admin.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../lib/supabase/database.types'
import { localSupabase } from './env'

export const E2E_DOMAIN = 'e2e.test'
const CLUB_SLUG = 'rustic'
const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } }

export type Client = SupabaseClient<Database>
export type TestUser = { id: string; email: string; password: string; name: string }

// Service role: bypasses RLS. Only for preparing and cleaning test data on the local stack.
export function adminClient(): Client {
  const { apiUrl, serviceRoleKey } = localSupabase()
  return createClient<Database>(apiUrl, serviceRoleKey, NO_SESSION)
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@${E2E_DOMAIN}`
}

export async function clubRow(admin: Client = adminClient()) {
  const { data, error } = await admin.from('clubs').select('*').eq('slug', CLUB_SLUG).single()
  if (error) throw error
  return data
}

// A confirmed member of Rustic with a complete profile. It also has a password, so tests can
// prepare data through the API as that person; the UI still signs in with the magic link.
export async function createMember(options: {
  name: string
  prefix: string
  role?: 'player' | 'reception' | 'admin'
}): Promise<TestUser> {
  const admin = adminClient()
  const club = await clubRow(admin)
  const email = uniqueEmail(options.prefix)
  const password = `Clave-${Date.now()}!`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: options.name },
  })
  if (error) throw error
  const id = data.user.id

  const profile = await admin.from('profiles').update({ side: 'drive', hand: 'right' }).eq('id', id)
  if (profile.error) throw profile.error
  const member = await admin.from('club_members').insert({
    club_id: club.id,
    user_id: id,
    role: options.role ?? 'player',
    category: 5,
    category_validated: true,
  })
  if (member.error) throw member.error

  return { id, email, password, name: options.name }
}

export async function signedInClient(user: TestUser): Promise<Client> {
  const { apiUrl, publishableKey } = localSupabase()
  const client = createClient<Database>(apiUrl, publishableKey, NO_SESSION)
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password })
  if (error) throw error
  return client
}

// A booking that starts in a couple of hours, inserted directly (the service role skips the grid
// and the notice period). Tries each court until one is free at that time.
export async function insertBookingSoon(user: TestUser, hoursAhead = 2): Promise<{ bookingId: string; courtName: string }> {
  const admin = adminClient()
  const club = await clubRow(admin)
  const { data: courts, error } = await admin
    .from('courts')
    .select('id, name')
    .eq('club_id', club.id)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error

  const start = new Date(Date.now() + hoursAhead * 3_600_000)
  start.setUTCSeconds(0, 0)
  const end = new Date(start.getTime() + club.slot_minutes * 60_000)
  const period = `[${start.toISOString()},${end.toISOString()})`

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
        price: 1200,
        occupancy_id: occupancy.data.id,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (booking.error) throw booking.error
    return { bookingId: booking.data.id, courtName: court.name }
  }
  throw new Error('No hay ninguna cancha libre en las próximas horas para preparar el test')
}
```

- [ ] **Step 3: Ingreso con enlace mágico desde Mailpit**

`tests/e2e/support/auth.ts` (Write tool: tiene regex con barras):
```ts
import { expect, type Page } from '@playwright/test'
import { localSupabase } from './env'

type MailpitSearch = { messages: { ID: string }[] }
type MailpitMessage = { HTML: string; Text: string }

// Signs in through the real UI: asks for a magic link and follows it from Mailpit, in the same
// browser that asked for it (the PKCE verifier lives in its cookies).
export async function signInWithMagicLink(page: Page, email: string, next = '/'): Promise<void> {
  await page.goto(`/auth/ingreso?next=${encodeURIComponent(next)}`)
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Enviarme el enlace' }).click()
  await expect(page.getByRole('status')).toContainText('Revisá tu email')
  await page.goto(await magicLinkFor(email))
}

async function magicLinkFor(email: string): Promise<string> {
  const { mailpitUrl } = localSupabase()
  const query = encodeURIComponent(`to:"${email}"`)
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = (await (await fetch(`${mailpitUrl}/api/v1/search?query=${query}`)).json()) as MailpitSearch
    const [latest] = search.messages
    if (latest) {
      const message = (await (await fetch(`${mailpitUrl}/api/v1/message/${latest.ID}`)).json()) as MailpitMessage
      const match =
        /href="([^"]*\/auth\/v1\/verify[^"]*)"/.exec(message.HTML) ??
        /(https?:\/\/\S*\/auth\/v1\/verify\S*)/.exec(message.Text)
      if (match) return match[1].replaceAll('&amp;', '&')
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`No llegó el enlace mágico para ${email}`)
}
```

- [ ] **Step 4: Comprobante de prueba**

`tests/e2e/support/files.ts`:
```ts
// A 1x1 PNG: enough for Storage to accept it as a receipt.
export const RECEIPT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

export const RECEIPT_FILE = { name: 'comprobante.png', mimeType: 'image/png', buffer: RECEIPT_PNG }
```

- [ ] **Step 5: Limpieza antes de cada corrida**

`tests/e2e/support/global-setup.ts`:
```ts
import { adminClient, E2E_DOMAIN } from './admin'

// Removes what earlier e2e runs left in the local database: users @e2e.test and everything they
// booked, loaded or uploaded (including series bookings the daily job created with no author).
// adminClient only ever points at the local stack.
export default async function globalSetup(): Promise<void> {
  const admin = adminClient()
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  const ids = data.users.filter((user) => user.email?.endsWith(`@${E2E_DOMAIN}`)).map((user) => user.id)
  if (ids.length === 0) return
  const idList = `(${ids.join(',')})`

  const series = await admin.from('recurring_series').select('id').in('created_by', ids)
  if (series.error) throw series.error
  const seriesIds = series.data.map((row) => row.id)

  const filters = [`player_id.in.${idList}`, `created_by.in.${idList}`]
  if (seriesIds.length > 0) filters.push(`series_id.in.(${seriesIds.join(',')})`)
  const bookings = await admin.from('bookings').select('id, occupancy_id').or(filters.join(','))
  if (bookings.error) throw bookings.error
  const occupancyIds = bookings.data.flatMap((row) => (row.occupancy_id ? [row.occupancy_id] : []))

  // Payments go with their bookings (on delete cascade).
  if (bookings.data.length > 0) await check(admin.from('bookings').delete().in('id', bookings.data.map((row) => row.id)))
  if (seriesIds.length > 0) await check(admin.from('recurring_series').delete().in('id', seriesIds))
  const occupancyFilter = [`created_by.in.${idList}`]
  if (occupancyIds.length > 0) occupancyFilter.push(`id.in.(${occupancyIds.join(',')})`)
  await check(admin.from('court_occupancy').delete().or(occupancyFilter.join(',')))

  for (const id of ids) {
    const files = await admin.storage.from('receipts').list(id)
    if (files.data && files.data.length > 0) {
      await admin.storage.from('receipts').remove(files.data.map((file) => `${id}/${file.name}`))
    }
    const deleted = await admin.auth.admin.deleteUser(id)
    if (deleted.error) throw deleted.error
  }
}

async function check(query: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await query
  if (error) throw error
}
```

- [ ] **Step 6: Playwright usa el soporte**

Reemplazar `playwright.config.ts` completo:
```ts
import { defineConfig, devices } from '@playwright/test'
import { localSupabase } from './tests/e2e/support/env'

const PORT = 3000

// E2E always runs against the local Supabase stack, even when .env.local points at production:
// the tests send magic links to fake addresses and write bookings.
// Next does not override variables already set in process.env, so these win over .env.local.
// CI exports them itself before running the tests.
function webServerEnv(): Record<string, string> {
  if (process.env.CI) return {}
  const { apiUrl, publishableKey } = localSupabase()
  return { NEXT_PUBLIC_SUPABASE_URL: apiUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey }
}

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/support/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  // Mobile first: the club's players use the app from their phones.
  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }],
  webServer: {
    // CI builds before running the tests; locally the dev server is enough.
    command: process.env.CI ? 'npm run start' : 'npm run dev',
    url: `http://localhost:${PORT}`,
    // Never reuse a running dev server: it may be pointing at production.
    reuseExistingServer: false,
    env: webServerEnv(),
    timeout: 120_000,
  },
})
```

- [ ] **Step 7: CI exporta la clave de servicio local y Mailpit**

En `.github/workflows/ci.yml`, reemplazar el step `Expose local Supabase to the app` por:
```yaml
      - name: Expose local Supabase to the app and the e2e tests
        # Local stack only: these keys exist just inside this job's Docker containers.
        run: |
          supabase status -o json | jq -r '
            "NEXT_PUBLIC_SUPABASE_URL=\(.API_URL)",
            "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\(.PUBLISHABLE_KEY // .ANON_KEY)",
            "SUPABASE_SERVICE_ROLE_KEY=\(.SERVICE_ROLE_KEY // .SECRET_KEY)",
            "MAILPIT_URL=\(.MAILPIT_URL // .INBUCKET_URL)"' >> "$GITHUB_ENV"
```

- [ ] **Step 8: Verificar**

Run:
```bash
npm run typecheck
npm run lint
npx playwright test tests/e2e/smoke.spec.ts
```
Expected: typecheck y lint en verde; el smoke pasa y el global setup corre sin error (no hay usuarios `@e2e.test` todavía).

- [ ] **Step 9: Commit**

```bash
git add tests/e2e/support playwright.config.ts .github/workflows/ci.yml
git commit -m "test(e2e): add local Supabase, Mailpit and cleanup support"
```

---

### Task 22: Flujo 1 en rojo (jugador: alta, reserva, Mis reservas, transferencia)

**Files:**
- Create: `tests/e2e/player-booking.spec.ts`

- [ ] **Step 1: El flujo**

`tests/e2e/player-booking.spec.ts` (Write tool):
```ts
import { expect, test } from '@playwright/test'
import { cancellationRule } from '../../lib/domain/cancellation'
import { paymentMethodsNote } from '../../lib/domain/payments'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, uniqueEmail } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { RECEIPT_FILE } from './support/files'

// Reads the club's own settings, so the flow keeps passing when Rustic's real data replaces the seed.
test('a new player signs up, books a court, sees it and reports the transfer', async ({ page }) => {
  const club = await clubRow()
  await signInWithMagicLink(page, uniqueEmail('flujo1'), '/reservar')

  // Mandatory welcome form before booking.
  await expect(page).toHaveURL(/\/bienvenida/)
  await page.getByLabel('Nombre').fill('Lucía E2E')
  await page.getByLabel('Lado').selectOption('Revés')
  await page.getByLabel('Mano').selectOption('Diestro')
  await page.getByLabel('Categoría').selectOption('5ª')
  await page.getByRole('button', { name: 'Guardar y seguir' }).click()
  await expect(page).toHaveURL(/\/reservar/)

  // Book the first free slot three days ahead.
  const day = addDays(localDateOf(new Date(), club.timezone), 3)
  await page.goto(`/reservar?dia=${day}`)
  const slot = page.getByRole('button', { name: /^Reservar / }).first()
  const [, court, time] = /^Reservar (.+) a las (\d\d:\d\d)/.exec((await slot.getAttribute('aria-label')) ?? '') ?? []
  await slot.click()

  const sheet = page.getByRole('dialog', { name: 'Reservar cancha' })
  await expect(sheet).toContainText(paymentMethodsNote(club))
  await expect(sheet).toContainText(cancellationRule(club.cancellation_notice_hours))
  await sheet.getByRole('button', { name: 'Reservar', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Listo, reservaste la cancha')

  // The booking shows up in Mis reservas, pending payment.
  await page.getByRole('link', { name: 'Mis reservas' }).click()
  const card = page.getByRole('listitem').filter({ hasText: `${time} a` }).filter({ hasText: court })
  await expect(card).toContainText('Pendiente de pago')

  // Report the transfer with the receipt.
  await card.getByRole('button', { name: 'Ya transferí' }).click()
  const transfer = page.getByRole('dialog', { name: 'Ya transferí' })
  await expect(transfer).toContainText(club.transfer_details ?? 'El club todavía no cargó')
  await transfer.getByLabel('Comprobante').setInputFiles(RECEIPT_FILE)
  await transfer.getByRole('button', { name: 'Informar transferencia' }).click()
  await expect(card).toContainText('Transferencia informada')
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx playwright test tests/e2e/player-booking.spec.ts`
Expected: FAIL en `toHaveURL(/\/bienvenida/)`: `/reservar` todavía no existe (404).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/player-booking.spec.ts
git commit -m "test(e2e): add player booking flow (red)"
```

---

### Task 23: Formulario con Server Action, campos y navegación por pestañas

**Files:**
- Create: `components/ui/action-form.tsx`, `components/ui/field.tsx`, `components/nav/tab-nav.tsx`
- Test: `tests/unit/components/ui/action-form.test.tsx`, `tests/unit/components/nav/tab-nav.test.tsx`

- [ ] **Step 1: Tests que fallan**

`tests/unit/components/ui/action-form.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import type { ActionState } from '@/lib/actions/result'

function actionReturning(result: ActionState) {
  return vi.fn<FormAction>(async () => result)
}

describe('ActionForm', () => {
  it('sends its fields to the action', async () => {
    const action = actionReturning({ status: 'ok', message: 'Hecho' })
    render(
      <ActionForm action={action} submitLabel="Guardar">
        <input type="hidden" name="bookingId" value="b1" />
      </ActionForm>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(action.mock.calls[0][1].get('bookingId')).toBe('b1')
  })

  it('shows an error in place and keeps the form', async () => {
    render(<ActionForm action={actionReturning({ status: 'error', message: 'Esa cancha se acaba de ocupar.' })} submitLabel="Reservar" />)
    await userEvent.click(screen.getByRole('button', { name: 'Reservar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Esa cancha se acaba de ocupar.')
    expect(screen.getByRole('button', { name: 'Reservar' })).toBeEnabled()
  })

  it('hands a success to onDone', async () => {
    const onDone = vi.fn()
    render(<ActionForm action={actionReturning({ status: 'ok', message: 'Reservado' })} submitLabel="Reservar" onDone={onDone} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reservar' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Reservado'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows a success itself when nobody handles it', async () => {
    render(<ActionForm action={actionReturning({ status: 'ok', message: 'Guardamos tus cambios.' })} submitLabel="Guardar" />)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Guardamos tus cambios.')
  })
})
```

`tests/unit/components/nav/tab-nav.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { isCurrent, TabNav } from '@/components/nav/tab-nav'

vi.mock('next/navigation', () => ({ usePathname: () => '/reservas' }))

const ITEMS = [
  { href: '/', label: 'Inicio' },
  { href: '/reservas', label: 'Mis reservas' },
]

describe('TabNav', () => {
  it('is a named navigation landmark', () => {
    render(<TabNav label="Secciones" items={ITEMS} variant="bottom" />)
    expect(screen.getByRole('navigation', { name: 'Secciones' })).toBeInTheDocument()
  })

  it('marks the current section', () => {
    render(<TabNav label="Secciones" items={ITEMS} variant="bottom" />)
    expect(screen.getByRole('link', { name: 'Mis reservas' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current')
  })

  it('matches nested paths but keeps the home tab exact', () => {
    expect(isCurrent('/club/grilla', '/club/grilla')).toBe(true)
    expect(isCurrent('/reservas/algo', '/reservas')).toBe(true)
    expect(isCurrent('/reservar', '/')).toBe(false)
    expect(isCurrent('/reservar', '/reservas')).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/unit/components/ui/action-form.test.tsx tests/unit/components/nav/tab-nav.test.tsx`
Expected: FAIL por imports que no resuelven.

- [ ] **Step 3: Implementación**

`components/ui/field.tsx`:
```tsx
import type { ReactNode } from 'react'

export const inputClasses =
  'min-h-11 w-full rounded-xl border border-border bg-bg px-4 text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent'

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {children}
    </div>
  )
}
```

`components/ui/action-form.tsx`:
```tsx
'use client'

import { useActionState, type ReactNode } from 'react'
import { Button, type ButtonVariant } from '@/components/ui/button'
import { IDLE, type ActionState } from '@/lib/actions/result'
import { cn } from '@/lib/cn'

export type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>

export type ActionFormProps = {
  action: FormAction
  submitLabel: string
  pendingLabel?: string
  variant?: ButtonVariant
  onDone?: (message: string) => void
  className?: string
  children?: ReactNode
}

// Runs a Server Action and shows its outcome in place. An error keeps the form (and its sheet)
// open; a success goes to onDone, or is shown here when nobody handles it.
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = 'Guardando…',
  variant = 'primary',
  onDone,
  className,
  children,
}: ActionFormProps) {
  const [state, formAction, pending] = useActionState(async (previous: ActionState, formData: FormData) => {
    // A Server Action that redirects does not come back with a state.
    const result = (await action(previous, formData)) ?? previous
    if (result.status === 'ok') onDone?.(result.message ?? '')
    return result
  }, IDLE)

  return (
    <form action={formAction} className={cn('flex flex-col gap-3', className)}>
      {children}
      {state.status === 'error' ? (
        <p role="alert" className="rounded-xl border border-accent bg-bg p-3 text-sm">
          {state.message}
        </p>
      ) : null}
      {state.status === 'ok' && !onDone ? (
        <p role="status" className="text-sm">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" variant={variant} fullWidth disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  )
}
```

`components/nav/tab-nav.tsx`:
```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'

export type TabItem = { href: string; label: string }

export function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

// The player's bottom bar and the club's tabs.
export function TabNav({ label, items, variant }: { label: string; items: TabItem[]; variant: 'bottom' | 'top' }) {
  const pathname = usePathname()
  const bottom = variant === 'bottom'
  return (
    <nav
      aria-label={label}
      className={cn(
        bottom
          ? 'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)]'
          : 'overflow-x-auto border-b border-border',
      )}
    >
      <ul className={cn('mx-auto flex', bottom ? 'max-w-lg justify-around' : 'max-w-5xl gap-1 px-4')}>
        {items.map((item) => {
          const current = isCurrent(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-12 items-center whitespace-nowrap px-3 text-sm font-semibold',
                  current ? 'text-accent-ink' : 'text-fg-muted hover:text-fg',
                  !bottom && current && 'border-b-2 border-accent',
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/unit/components/ui/action-form.test.tsx tests/unit/components/nav/tab-nav.test.tsx`
Expected: PASS, 4 + 3 tests.

- [ ] **Step 5: Commit**

```bash
git add components/ui/action-form.tsx components/ui/field.tsx components/nav/tab-nav.tsx tests/unit/components/ui/action-form.test.tsx tests/unit/components/nav/tab-nav.test.tsx
git commit -m "feat(ui): add action form, field and tab navigation"
```

---

### Task 24: Quién mira (sesión, club y membresía)

**Files:**
- Create: `lib/club/config.ts`, `lib/auth/viewer.ts`, `lib/actions/revalidate.ts`

# (no unit test — son lecturas de Supabase con `server-only`; los flujos e2e las recorren y las reglas puras ya están probadas en `lib/domain/profile.ts`)

- [ ] **Step 1: Leer la guía de Next**

Leer `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md` y `…/revalidatePath.md`: `redirect` corta la ejecución (tipo `never`) y `revalidatePath('/', 'layout')` invalida todo el árbol.

- [ ] **Step 2: Código**

`lib/club/config.ts`:
```ts
// The app serves one club for now (fase 0 notes). club_id stays in the model for later.
export const CLUB_SLUG = 'rustic'
```

`lib/auth/viewer.ts`:
```ts
import 'server-only'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { CLUB_SLUG } from '@/lib/club/config'
import { isProfileComplete, isStaffRole } from '@/lib/domain/profile'
import type { Tables } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'

export type Club = Tables<'clubs'>
export type Membership = Tables<'club_members'>
export type Viewer = {
  userId: string
  email: string | null
  profile: Tables<'profiles'>
  club: Club
  membership: Membership | null
}
export type MemberViewer = Viewer & { membership: Membership }

export const getClub = cache(async (): Promise<Club> => {
  const supabase = await createClient()
  const { data, error } = await supabase.from('clubs').select('*').eq('slug', CLUB_SLUG).maybeSingle()
  if (error) throw error
  if (!data) {
    throw new Error(`No existe el club "${CLUB_SLUG}". Local: npm run db:reset. Producción: falta la migración de datos.`)
  }
  return data
})

// Who is looking, read once per request.
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const club = await getClub()
  const [profile, membership] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('club_members').select('*').eq('club_id', club.id).eq('user_id', user.id).maybeSingle(),
  ])
  if (profile.error) throw profile.error
  if (membership.error) throw membership.error

  return { userId: user.id, email: user.email ?? null, profile: profile.data, club, membership: membership.data }
})

export async function requireViewer(nextPath: string): Promise<Viewer> {
  const viewer = await getViewer()
  if (!viewer) redirect(`/auth/ingreso?next=${encodeURIComponent(nextPath)}`)
  return viewer
}

// A player needs side, hand and category before booking.
export async function requirePlayer(nextPath: string): Promise<MemberViewer> {
  const viewer = await requireViewer(nextPath)
  const { membership } = viewer
  if (!membership || !isProfileComplete(viewer.profile, membership)) {
    redirect(`/bienvenida?next=${encodeURIComponent(nextPath)}`)
  }
  return { ...viewer, membership }
}

// Every club page checks this itself, not only the layout.
export async function requireStaff(nextPath: string): Promise<MemberViewer> {
  const viewer = await requireViewer(nextPath)
  const { membership } = viewer
  if (!membership || !isStaffRole(membership.role)) redirect('/')
  return { ...viewer, membership }
}

export async function requireAdmin(nextPath: string): Promise<MemberViewer> {
  const viewer = await requireStaff(nextPath)
  if (viewer.membership.role !== 'admin') redirect('/club/grilla')
  return viewer
}
```

`lib/actions/revalidate.ts`:
```ts
import 'server-only'
import { revalidatePath } from 'next/cache'

// Every screen reads bookings and occupancies, so any write refreshes the whole app.
export function revalidateBookings(): void {
  revalidatePath('/', 'layout')
}
```

- [ ] **Step 3: Verificar y commit**

Run: `npm run typecheck && npm run lint`
Expected: verde.
```bash
git add lib/club/config.ts lib/auth/viewer.ts lib/actions/revalidate.ts
git commit -m "feat(auth): resolve viewer, club and membership per request"
```

---

### Task 25: Área del jugador (layout con barra inferior)

**Files:**
- Move: `app/page.tsx` → `app/(jugador)/page.tsx`
- Create: `app/(jugador)/layout.tsx`

# (no unit test — el smoke e2e cubre la portada; `TabNav` ya está probado)

- [ ] **Step 1: Leer la guía de route groups**

Leer `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md`: `(jugador)` no cambia la URL; `/` pasa a vivir en `app/(jugador)/page.tsx` y no puede quedar también en `app/page.tsx`.

- [ ] **Step 2: Mover la portada**

Run: `git mv app/page.tsx "app/(jugador)/page.tsx"`

Reemplazar `app/(jugador)/page.tsx` completo (el `<main>` pasa al layout):
```tsx
import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getViewer } from '@/lib/auth/viewer'

export default async function HomePage() {
  const viewer = await getViewer()

  return (
    <>
      <Logo className="size-16" />
      <h1 className="font-display text-4xl font-bold uppercase">Rustic Pádel</h1>
      <Card>
        {viewer ? (
          <p>
            Sesión iniciada como <strong>{viewer.email}</strong>.
          </p>
        ) : (
          <>
            <p className="mb-4 text-fg-muted">Reservá cancha y armá partido desde el celular.</p>
            <Link href="/auth/ingreso" className={buttonClasses({ fullWidth: true })}>
              Ingresar
            </Link>
          </>
        )}
      </Card>
    </>
  )
}
```

- [ ] **Step 3: Layout**

`app/(jugador)/layout.tsx`:
```tsx
import { TabNav } from '@/components/nav/tab-nav'
import { getViewer } from '@/lib/auth/viewer'

const PLAYER_TABS = [
  { href: '/', label: 'Inicio' },
  { href: '/reservar', label: 'Reservar' },
  { href: '/reservas', label: 'Mis reservas' },
  { href: '/perfil', label: 'Perfil' },
]

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer()

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <main className="flex flex-1 flex-col gap-6 px-4 pb-28 pt-6">{children}</main>
      {viewer ? <TabNav label="Secciones" items={PLAYER_TABS} variant="bottom" /> : null}
    </div>
  )
}
```

- [ ] **Step 4: Verificar**

Run:
```bash
npm run typecheck
npm run lint
npx playwright test tests/e2e/smoke.spec.ts
```
Expected: verde; el smoke sigue viendo "Rustic Pádel" e "Ingresar".

- [ ] **Step 5: Commit**

```bash
git add "app/(jugador)"
git commit -m "feat(app): add player area layout with bottom tabs"
```

---

### Task 26: Bienvenida (alta obligatoria) y formulario de perfil

**Files:**
- Create: `components/profile/player-profile-form.tsx`
- Create: `lib/actions/profile.ts`
- Create: `app/bienvenida/page.tsx`
- Test: `tests/unit/components/profile/player-profile-form.test.tsx`

- [ ] **Step 1: Test que falla**

`tests/unit/components/profile/player-profile-form.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlayerProfileForm, type ProfileValues } from '@/components/profile/player-profile-form'
import type { FormAction } from '@/components/ui/action-form'

const NEW_PLAYER: ProfileValues = { displayName: 'Lucía', side: null, hand: null, category: null, isPublic: true }

describe('PlayerProfileForm', () => {
  it('asks for name, side, hand and category when joining', () => {
    render(<PlayerProfileForm mode="onboarding" action={vi.fn<FormAction>()} initial={NEW_PLAYER} next="/reservar" />)
    expect(screen.getByLabelText('Nombre')).toHaveValue('Lucía')
    expect(screen.getByLabelText('Lado')).toBeRequired()
    expect(screen.getByLabelText('Mano')).toBeRequired()
    expect(screen.getByLabelText('Categoría')).toBeRequired()
    expect(screen.getByText(/El club valida tu categoría/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar y seguir' })).toBeInTheDocument()
  })

  it('sends the choices and where to go next', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: '' }))
    render(<PlayerProfileForm mode="onboarding" action={action} initial={NEW_PLAYER} next="/reservar" />)
    await userEvent.selectOptions(screen.getByLabelText('Lado'), 'Revés')
    await userEvent.selectOptions(screen.getByLabelText('Mano'), 'Zurdo')
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), '5ª')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y seguir' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(action.mock.calls[0][1].entries())).toMatchObject({
      displayName: 'Lucía',
      side: 'backhand',
      hand: 'left',
      category: '5',
      next: '/reservar',
      isPublic: 'on',
    })
  })

  it('lets a player choose who sees her profile later on', () => {
    render(
      <PlayerProfileForm
        mode="profile"
        action={vi.fn<FormAction>()}
        initial={{ displayName: 'Lucía', side: 'drive', hand: 'right', category: 5, isPublic: false }}
      />,
    )
    expect(screen.getByLabelText('Otros jugadores pueden ver mi perfil')).not.toBeChecked()
    expect(screen.getByText(/el club la vuelve a validar/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/unit/components/profile/player-profile-form.test.tsx`
Expected: FAIL con `Failed to resolve import "@/components/profile/player-profile-form"`.

- [ ] **Step 3: Formulario**

`components/profile/player-profile-form.tsx`:
```tsx
'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import { CATEGORIES, HAND_LABELS, HANDS, SIDE_LABELS, SIDES, type Hand, type Side } from '@/lib/domain/profile'

export type ProfileValues = {
  displayName: string
  side: Side | null
  hand: Hand | null
  category: number | null
  isPublic: boolean
}

// The welcome form (mode "onboarding") and the profile screen share it.
export function PlayerProfileForm({
  mode,
  action,
  initial,
  next,
}: {
  mode: 'onboarding' | 'profile'
  action: FormAction
  initial: ProfileValues
  next?: string
}) {
  const onboarding = mode === 'onboarding'

  return (
    <ActionForm action={action} submitLabel={onboarding ? 'Guardar y seguir' : 'Guardar cambios'}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="Nombre" htmlFor="displayName">
        <input
          id="displayName"
          name="displayName"
          required
          maxLength={60}
          autoComplete="name"
          defaultValue={initial.displayName}
          className={inputClasses}
        />
      </Field>
      <Field label="Lado" htmlFor="side">
        <select id="side" name="side" required defaultValue={initial.side ?? ''} className={inputClasses}>
          <option value="" disabled>
            Elegí tu lado
          </option>
          {SIDES.map((side) => (
            <option key={side} value={side}>
              {SIDE_LABELS[side]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Mano" htmlFor="hand">
        <select id="hand" name="hand" required defaultValue={initial.hand ?? ''} className={inputClasses}>
          <option value="" disabled>
            Elegí tu mano
          </option>
          {HANDS.map((hand) => (
            <option key={hand} value={hand}>
              {HAND_LABELS[hand]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Categoría" htmlFor="category">
        <select id="category" name="category" required defaultValue={initial.category ?? ''} className={inputClasses}>
          <option value="" disabled>
            Elegí tu categoría
          </option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}ª
            </option>
          ))}
        </select>
      </Field>
      <p className="text-sm text-fg-muted">
        {onboarding
          ? 'El club valida tu categoría. Hasta entonces figura como pendiente.'
          : 'Si cambiás la categoría, el club la vuelve a validar.'}
      </p>
      {onboarding ? (
        <input type="hidden" name="isPublic" value="on" />
      ) : (
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="isPublic" defaultChecked={initial.isPublic} className="size-5 accent-accent" />
          Otros jugadores pueden ver mi perfil
        </label>
      )}
    </ActionForm>
  )
}
```

- [ ] **Step 4: Server Actions de perfil**

`lib/actions/profile.ts`:
```ts
'use server'

import { redirect } from 'next/navigation'
import { failed, fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { safeNextPath } from '@/lib/auth/redirect'
import { getViewer } from '@/lib/auth/viewer'
import { readBoolean, readEnum, readInt, readText } from '@/lib/domain/input'
import { HANDS, SIDES } from '@/lib/domain/profile'
import { createClient } from '@/lib/supabase/server'

// Saves name, side, hand and visibility (direct update, RLS: own profile only) and, when it
// changed, the category through set_my_category, which also joins the club the first time.
export async function saveProfile(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return failed('Tu sesión venció. Volvé a ingresar.')

  const displayName = readText(form, 'displayName', { maxLength: 60 })
  const side = readEnum(form, 'side', SIDES)
  const hand = readEnum(form, 'hand', HANDS)
  const category = readInt(form, 'category', { min: 1, max: 8 })
  if (!displayName || !side || !hand || category === null) return INVALID_INPUT

  const supabase = await createClient()
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ display_name: displayName, side, hand, is_public: readBoolean(form, 'isPublic') })
    .eq('id', viewer.userId)
  if (profileError) return failed('No pudimos guardar tu perfil. Probá de nuevo.')

  if (viewer.membership?.category !== category) {
    const { error } = await supabase.rpc('set_my_category', { p_club_id: viewer.club.id, p_category: category })
    if (error) return fromRpc(error, '')
  }

  revalidateBookings()
  const next = form.get('next')
  if (typeof next === 'string' && next) redirect(safeNextPath(next))
  return ok('Guardamos tus cambios.')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}
```

- [ ] **Step 5: Página de bienvenida**

`app/bienvenida/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/brand/logo'
import { PlayerProfileForm } from '@/components/profile/player-profile-form'
import { Card } from '@/components/ui/card'
import { saveProfile } from '@/lib/actions/profile'
import { safeNextPath } from '@/lib/auth/redirect'
import { requireViewer } from '@/lib/auth/viewer'
import { isProfileComplete } from '@/lib/domain/profile'

export const metadata: Metadata = { title: 'Bienvenida' }

type SearchParams = Promise<{ next?: string }>

export default async function WelcomePage({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams
  const nextPath = safeNextPath(next)
  const viewer = await requireViewer(`/bienvenida?next=${encodeURIComponent(nextPath)}`)
  if (isProfileComplete(viewer.profile, viewer.membership)) redirect(nextPath)

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-10">
      <Logo className="size-14" />
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">Bienvenida</h1>
        <p className="text-fg-muted">Contanos cómo jugás. Lo usamos para armar partidos parejos.</p>
      </div>
      <Card>
        <PlayerProfileForm
          mode="onboarding"
          action={saveProfile}
          next={nextPath}
          initial={{
            displayName: viewer.profile.display_name,
            side: viewer.profile.side,
            hand: viewer.profile.hand,
            category: viewer.membership?.category ?? null,
            isPublic: viewer.profile.is_public,
          }}
        />
      </Card>
    </main>
  )
}
```

- [ ] **Step 6: Correr y ver que pasa**

Run:
```bash
npx vitest run tests/unit/components/profile/player-profile-form.test.tsx
npm run typecheck
npm run lint
```
Expected: PASS (3 tests), typecheck y lint en verde.

- [ ] **Step 7: Commit**

```bash
git add components/profile lib/actions/profile.ts app/bienvenida tests/unit/components/profile
git commit -m "feat(app): add mandatory welcome form and profile actions"
```

---

### Task 27: Tira de días, leyenda y estado de pago

**Files:**
- Create: `components/booking/cell-styles.ts`, `components/booking/day-strip.tsx`, `components/booking/legend.tsx`, `components/booking/payment-badge.tsx`
- Test: `tests/unit/components/booking/day-strip.test.tsx`, `tests/unit/components/booking/legend.test.tsx`, `tests/unit/components/booking/payment-badge.test.tsx`

- [ ] **Step 1: Tests que fallan**

`tests/unit/components/booking/day-strip.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DayStrip } from '@/components/booking/day-strip'

const DAYS = [
  { date: '2026-09-29', label: 'Hoy' },
  { date: '2026-09-30', label: 'Mañana' },
  { date: '2026-10-01', label: 'jue 1' },
]

describe('DayStrip', () => {
  it('links every day to the same screen', () => {
    render(<DayStrip days={DAYS} selected="2026-09-30" basePath="/reservar" />)
    expect(screen.getByRole('navigation', { name: 'Día' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'jue 1' })).toHaveAttribute('href', '/reservar?dia=2026-10-01')
  })

  it('marks the selected day', () => {
    render(<DayStrip days={DAYS} selected="2026-09-30" basePath="/reservar" />)
    expect(screen.getByRole('link', { name: 'Mañana' })).toHaveAttribute('aria-current', 'date')
    expect(screen.getByRole('link', { name: 'Hoy' })).not.toHaveAttribute('aria-current')
  })
})
```

`tests/unit/components/booking/legend.test.tsx`:
```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Legend } from '@/components/booking/legend'

describe('Legend', () => {
  it('explains the player grid', () => {
    render(<Legend variant="player" />)
    const items = within(screen.getByRole('list', { name: 'Referencias' })).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['Libre', 'Tuya', 'Ocupada'])
  })

  it('explains the club grid', () => {
    render(<Legend variant="club" />)
    expect(screen.getByRole('list', { name: 'Referencias' })).toHaveTextContent('ReservaTurno fijoBloqueo')
  })
})
```

`tests/unit/components/booking/payment-badge.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaymentBadge } from '@/components/booking/payment-badge'

describe('PaymentBadge', () => {
  it.each([
    ['paid', 'Pagada'],
    ['reported', 'Transferencia informada'],
    ['pending', 'Pendiente de pago'],
    ['refund_due', 'A devolver'],
  ] as const)('shows %s as "%s"', (state, label) => {
    render(<PaymentBadge state={state} />)
    expect(screen.getByText(label)).toHaveAttribute('data-state', state)
  })
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/unit/components/booking`
Expected: FAIL por imports que no resuelven.

- [ ] **Step 3: Implementación**

`components/booking/cell-styles.ts`:
```ts
// One look per kind of cell, shared by the grid and its legend. Only token pairs that pass
// the contrast test in tests/unit/app/design-tokens.test.ts.
export const CELL_STYLES = {
  free: 'border-2 border-court bg-bg text-fg',
  mine: 'bg-court text-on-court',
  taken: 'bg-surface text-fg-muted',
  booking: 'bg-court text-on-court',
  recurring: 'bg-accent text-on-accent',
  block: 'border-2 border-dashed border-fg-muted bg-surface text-fg',
  other: 'bg-surface text-fg',
} as const

export type CellStyle = keyof typeof CELL_STYLES
```

`components/booking/day-strip.tsx`:
```tsx
import Link from 'next/link'
import { cn } from '@/lib/cn'
import type { LocalDate } from '@/lib/domain/time'

export type DayStripProps = { days: { date: LocalDate; label: string }[]; selected: LocalDate; basePath: string }

export function DayStrip({ days, selected, basePath }: DayStripProps) {
  return (
    <nav aria-label="Día" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2">
        {days.map(({ date, label }) => {
          const current = date === selected
          return (
            <li key={date}>
              <Link
                href={`${basePath}?dia=${date}`}
                aria-current={current ? 'date' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 font-semibold',
                  current ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface text-fg',
                )}
              >
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

`components/booking/legend.tsx`:
```tsx
import { cn } from '@/lib/cn'
import { CELL_STYLES, type CellStyle } from './cell-styles'

const ITEMS: Record<'player' | 'club', [CellStyle, string][]> = {
  player: [
    ['free', 'Libre'],
    ['mine', 'Tuya'],
    ['taken', 'Ocupada'],
  ],
  club: [
    ['booking', 'Reserva'],
    ['recurring', 'Turno fijo'],
    ['block', 'Bloqueo'],
  ],
}

export function Legend({ variant }: { variant: 'player' | 'club' }) {
  return (
    <ul aria-label="Referencias" className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
      {ITEMS[variant].map(([style, label]) => (
        <li key={style} className="flex items-center gap-2">
          <span aria-hidden="true" className={cn('size-3 rounded-sm', CELL_STYLES[style])} />
          {label}
        </li>
      ))}
    </ul>
  )
}
```

`components/booking/payment-badge.tsx`:
```tsx
import { cn } from '@/lib/cn'
import { PAYMENT_LABELS, type PaymentState } from '@/lib/domain/payments'

const STYLES: Record<PaymentState, string> = {
  paid: 'border-court-ink text-court-ink',
  reported: 'border-accent-ink text-accent-ink',
  pending: 'border-fg-muted text-fg',
  refund_due: 'border-accent-ink text-accent-ink',
  none: 'border-border text-fg-muted',
}

// Always on the page background, so it reads the same inside a blue or amber cell.
export function PaymentBadge({ state, className }: { state: PaymentState; className?: string }) {
  return (
    <span
      data-state={state}
      className={cn('inline-flex items-center rounded-full border bg-bg px-2 py-0.5 text-xs font-semibold', STYLES[state], className)}
    >
      {PAYMENT_LABELS[state]}
    </span>
  )
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/unit/components/booking`
Expected: PASS (2 + 2 + 4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/booking tests/unit/components/booking
git commit -m "feat(ui): add day strip, legend and payment badge"
```

---
### Task 28: Grilla de turnos (variante jugador y variante club)

**Files:**
- Create: `components/booking/slot-grid.tsx`
- Test: `tests/unit/components/booking/slot-grid.test.tsx`

- [ ] **Step 1: Test que falla**

`tests/unit/components/booking/slot-grid.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SlotGrid } from '@/components/booking/slot-grid'
import { at, booking, COURTS, makeGrid, occupancy } from '../../fixtures/grid'

describe('SlotGrid for players', () => {
  it('offers free slots with court, time and price', async () => {
    const grid = makeGrid()
    const onSelect = vi.fn()
    render(<SlotGrid courts={COURTS} rows={grid.rows} variant="player" onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reservar Cancha 1 a las 08:00, $1.200' }))
    expect(onSelect).toHaveBeenCalledWith(grid.rows[0].cells[0])
  })

  it('shows taken, own and past slots without a button', () => {
    const grid = makeGrid({
      now: at('09:00'),
      occupancies: [occupancy('o1', 'court-1', '09:30', '11:00'), occupancy('o2', 'court-2', '09:30', '11:00')],
      bookings: [booking('o2', { isMine: true })],
    })
    render(<SlotGrid courts={COURTS} rows={grid.rows} variant="player" onSelect={vi.fn()} />)
    expect(screen.getAllByText('Ya pasó')).toHaveLength(2)
    expect(screen.getByText('Ocupada')).toBeInTheDocument()
    expect(screen.getByText('Tuya')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /09:30/ })).not.toBeInTheDocument()
  })

  it('names each court and whether it is covered', () => {
    render(<SlotGrid courts={COURTS} rows={makeGrid().rows} variant="player" onSelect={vi.fn()} />)
    expect(screen.getByRole('columnheader', { name: /Cancha 1/ })).toHaveTextContent('Techada')
    expect(screen.getByRole('columnheader', { name: /Cancha 2/ })).toHaveTextContent('Al aire libre')
  })
})

describe('SlotGrid for the club', () => {
  it('shows who holds each court and how it is paid', async () => {
    const grid = makeGrid({
      occupancies: [occupancy('o1', 'court-1', '08:00', '09:30')],
      bookings: [booking('o1', { holderName: 'Rodríguez', paymentState: 'reported' })],
    })
    const onSelect = vi.fn()
    render(<SlotGrid courts={COURTS} rows={grid.rows} variant="club" onSelect={onSelect} />)
    const cell = screen.getByRole('button', { name: 'Cancha 1, 08:00: Rodríguez' })
    expect(cell).toHaveTextContent('Reserva, en recepción')
    expect(cell).toHaveTextContent('Transferencia informada')
    await userEvent.click(cell)
    expect(onSelect).toHaveBeenCalledWith(grid.rows[0].cells[0])
  })

  it('labels blocks with their reason', () => {
    const grid = makeGrid({ occupancies: [occupancy('blk', 'court-2', '08:00', '09:30', 'block', 'Clase de Pablo')] })
    render(<SlotGrid courts={COURTS} rows={grid.rows} variant="club" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Cancha 2, 08:00: Clase de Pablo' })).toHaveTextContent('Bloqueo')
  })

  it('lets reception load a free slot, and warns when it has no price', () => {
    render(<SlotGrid courts={COURTS} rows={makeGrid({ rules: [] }).rows} variant="club" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Cargar Cancha 1, 08:00' })).toHaveTextContent('Sin precio')
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/unit/components/booking/slot-grid.test.tsx`
Expected: FAIL con `Failed to resolve import "@/components/booking/slot-grid"`.

- [ ] **Step 3: Implementación**

`components/booking/slot-grid.tsx`:
```tsx
'use client'

import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/domain/format'
import { KIND_LABELS, type Court, type GridCell, type GridRow } from '@/lib/domain/grid'
import { CELL_STYLES } from './cell-styles'
import { PaymentBadge } from './payment-badge'

export type SlotGridProps = {
  courts: Court[]
  rows: GridRow[]
  variant: 'player' | 'club'
  onSelect: (cell: GridCell) => void
}

const CELL = 'flex min-h-14 w-full flex-col items-start justify-center rounded-xl px-3 py-2 text-left text-sm'
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

// One grid for both sides: players see free, taken and their own; the club sees who and how paid.
export function SlotGrid({ courts, rows, variant, onSelect }: SlotGridProps) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[18rem] border-separate border-spacing-1">
        <caption className="sr-only">Turnos por cancha</caption>
        <thead>
          <tr>
            <th scope="col" className="w-16">
              <span className="sr-only">Hora</span>
            </th>
            {courts.map((court) => (
              <th key={court.id} scope="col" className="text-left text-sm font-semibold">
                {court.name}
                <span className="block text-xs font-normal text-fg-muted">
                  {court.isCovered ? 'Techada' : 'Al aire libre'}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.slot.label}>
              <th scope="row" className={cn('pr-1 text-left font-display text-lg font-bold', row.past && 'opacity-50')}>
                {row.slot.label}
              </th>
              {row.cells.map((cell) => (
                <td key={cell.court.id} className="min-w-28">
                  {variant === 'player' ? (
                    <PlayerCell cell={cell} onSelect={onSelect} />
                  ) : (
                    <ClubCell cell={cell} onSelect={onSelect} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PlayerCell({ cell, onSelect }: { cell: GridCell; onSelect: (cell: GridCell) => void }) {
  if (cell.state === 'free' && cell.price !== null) {
    const price = formatPrice(cell.price)
    return (
      <button
        type="button"
        aria-label={`Reservar ${cell.court.name} a las ${cell.slot.label}, ${price}`}
        onClick={() => onSelect(cell)}
        className={cn(CELL, CELL_STYLES.free, FOCUS, 'hover:bg-surface')}
      >
        <b className="font-display text-lg">{price}</b>
        <span>Libre</span>
      </button>
    )
  }
  if (cell.state === 'mine') {
    return (
      <div className={cn(CELL, CELL_STYLES.mine)}>
        <b>Tuya</b>
        <span>Reserva</span>
      </div>
    )
  }
  const text = cell.state === 'taken' ? 'Ocupada' : cell.state === 'past' ? 'Ya pasó' : 'No disponible'
  return <div className={cn(CELL, CELL_STYLES.taken, cell.state === 'past' && 'opacity-50')}>{text}</div>
}

function ClubCell({ cell, onSelect }: { cell: GridCell; onSelect: (cell: GridCell) => void }) {
  const { court, slot, occupancy, booking } = cell
  if (occupancy) {
    const kindLabel = KIND_LABELS[occupancy.kind]
    const title = booking?.holderName ?? occupancy.note ?? kindLabel
    const style =
      occupancy.kind === 'block'
        ? CELL_STYLES.block
        : occupancy.kind === 'recurring'
          ? CELL_STYLES.recurring
          : occupancy.kind === 'booking'
            ? CELL_STYLES.booking
            : CELL_STYLES.other
    return (
      <button
        type="button"
        aria-label={`${court.name}, ${slot.label}: ${title}`}
        onClick={() => onSelect(cell)}
        className={cn(CELL, style, FOCUS, cell.state === 'past' && 'opacity-60')}
      >
        <b className="line-clamp-1">{title}</b>
        <span className="text-xs">
          {kindLabel}
          {booking ? `, ${booking.source === 'online' ? 'online' : 'en recepción'}` : ''}
        </span>
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
    </button>
  )
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run tests/unit/components/booking/slot-grid.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add components/booking/slot-grid.tsx tests/unit/components/booking/slot-grid.test.tsx
git commit -m "feat(ui): add slot grid for players and the club"
```

---

### Task 29: Hoja de reserva

**Files:**
- Create: `components/booking/booking-sheet.tsx`
- Test: `tests/unit/components/booking/booking-sheet.test.tsx`

- [ ] **Step 1: Test que falla**

`tests/unit/components/booking/booking-sheet.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BookingSheet, type BookingChoice } from '@/components/booking/booking-sheet'
import type { FormAction } from '@/components/ui/action-form'

const CHOICE: BookingChoice = {
  courtId: 'court-1',
  courtName: 'Cancha 1',
  startsAt: '2026-10-01T23:00:00.000Z',
  timeLabel: '20:00',
  price: 1600,
}

function renderSheet(action: FormAction, choice: BookingChoice | null = CHOICE) {
  const onBooked = vi.fn()
  render(
    <BookingSheet
      choice={choice}
      dayText="jueves 1 de octubre"
      paymentNote="Se paga en el club o por transferencia."
      cancellationRule="Podés cancelar desde la app hasta 24 h antes. Después, avisá al club."
      action={action}
      onClose={vi.fn()}
      onBooked={onBooked}
    />,
  )
  return { onBooked }
}

describe('BookingSheet', () => {
  it('explains court, time, price, how to pay and the cancellation rule', () => {
    renderSheet(vi.fn<FormAction>())
    const dialog = screen.getByRole('dialog', { name: 'Reservar cancha' })
    expect(dialog).toHaveTextContent('Cancha 1')
    expect(dialog).toHaveTextContent('jueves 1 de octubre, 20:00')
    expect(dialog).toHaveTextContent('$1.600')
    expect(dialog).toHaveTextContent('Se paga en el club o por transferencia.')
    expect(dialog).toHaveTextContent('24 h antes')
  })

  it('books the chosen court and time', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Listo' }))
    const { onBooked } = renderSheet(action)
    await userEvent.click(screen.getByRole('button', { name: 'Reservar' }))
    await waitFor(() => expect(onBooked).toHaveBeenCalledWith('Listo'))
    const form = action.mock.calls[0][1]
    expect(form.get('courtId')).toBe('court-1')
    expect(form.get('startsAt')).toBe(CHOICE.startsAt)
  })

  it('stays open with the reason when the court was just taken', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'error', message: 'Esa cancha se acaba de ocupar. Elegí otro horario.' }))
    const { onBooked } = renderSheet(action)
    await userEvent.click(screen.getByRole('button', { name: 'Reservar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Esa cancha se acaba de ocupar')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onBooked).not.toHaveBeenCalled()
  })

  it('renders nothing without a choice', () => {
    renderSheet(vi.fn<FormAction>(), null)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/unit/components/booking/booking-sheet.test.tsx`
Expected: FAIL con `Failed to resolve import "@/components/booking/booking-sheet"`.

- [ ] **Step 3: Implementación**

`components/booking/booking-sheet.tsx`:
```tsx
'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { formatPrice } from '@/lib/domain/format'

export type BookingChoice = { courtId: string; courtName: string; startsAt: string; timeLabel: string; price: number }

export type BookingSheetProps = {
  choice: BookingChoice | null
  dayText: string
  paymentNote: string
  cancellationRule: string
  action: FormAction
  onClose: () => void
  onBooked: (message: string) => void
}

// Every rule that affects the player is explained before she books: price, how to pay, cancelling.
export function BookingSheet({ choice, dayText, paymentNote, cancellationRule, action, onClose, onBooked }: BookingSheetProps) {
  return (
    <BottomSheet open={choice !== null} onClose={onClose} title="Reservar cancha">
      {choice ? (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-fg-muted">Cancha</dt>
            <dd>{choice.courtName}</dd>
            <dt className="text-fg-muted">Horario</dt>
            <dd>
              {dayText}, {choice.timeLabel}
            </dd>
            <dt className="text-fg-muted">Precio</dt>
            <dd className="font-display text-2xl font-bold">{formatPrice(choice.price)}</dd>
          </dl>
          <p>{paymentNote}</p>
          <p className="text-sm text-fg-muted">{cancellationRule}</p>
          <ActionForm
            key={`${choice.courtId}-${choice.startsAt}`}
            action={action}
            submitLabel="Reservar"
            pendingLabel="Reservando…"
            onDone={onBooked}
          >
            <input type="hidden" name="courtId" value={choice.courtId} />
            <input type="hidden" name="startsAt" value={choice.startsAt} />
          </ActionForm>
        </div>
      ) : null}
    </BottomSheet>
  )
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run tests/unit/components/booking/booking-sheet.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add components/booking/booking-sheet.tsx tests/unit/components/booking/booking-sheet.test.tsx
git commit -m "feat(ui): add booking sheet"
```

---

### Task 30: Pantalla Reservar

**Files:**
- Create: `lib/data/day.ts`
- Create: `app/(jugador)/reservar/page.tsx`, `app/(jugador)/reservar/actions.ts`, `app/(jugador)/reservar/reservar-board.tsx`

# (no unit test nuevo — la carga lee Supabase y las piezas ya están probadas; el flujo 1 la recorre)

- [ ] **Step 1: Carga del día**

`lib/data/day.ts`:
```ts
import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import { buildDayGrid, holderName, type DayGrid, type GridBooking } from '@/lib/domain/grid'
import { amountDue, paymentState, type PaymentStatus } from '@/lib/domain/payments'
import { daySlots, type ClubSchedule } from '@/lib/domain/slots'
import { addDays, toDate, zonedTime, type LocalDate } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'

export function scheduleOf(club: Club): ClubSchedule {
  return { timezone: club.timezone, opensAt: club.opens_at, closesAt: club.closes_at, slotMinutes: club.slot_minutes }
}

// If supabase-js infers a slightly different shape for the embeds, adjust this type to match;
// never cast the query result.
type BookingRow = {
  id: string
  occupancy_id: string | null
  player_id: string | null
  guest_name: string | null
  price: number
  status: 'confirmed' | 'cancelled'
  source: 'online' | 'reception'
  series_id: string | null
  player: { display_name: string } | null
  payments: { status: PaymentStatus; amount: number }[]
}

function toGridBooking(row: BookingRow, occupancyId: string, viewerId: string): GridBooking {
  return {
    id: row.id,
    occupancyId,
    isMine: row.player_id === viewerId,
    holderName: holderName(row.guest_name, row.player?.display_name ?? null),
    playerId: row.player_id,
    price: row.price,
    source: row.source,
    seriesId: row.series_id,
    paymentState: paymentState(row, row.payments),
    amountDue: amountDue(row.price, row.payments),
  }
}

// Everything the grid needs for one day, read with the viewer's session: RLS decides whose
// bookings come back (a player gets only hers; staff get the whole club).
export async function loadDayGrid(club: Club, date: LocalDate, viewerId: string, now = new Date()): Promise<DayGrid> {
  const supabase = await createClient()
  const dayStart = zonedTime(date, 0, club.timezone).toISOString()
  const dayEnd = zonedTime(addDays(date, 1), 0, club.timezone).toISOString()

  const [courts, rules, occupancies, bookings] = await Promise.all([
    supabase
      .from('courts')
      .select('id, name, is_covered')
      .eq('club_id', club.id)
      .eq('is_active', true)
      .order('sort_order'),
    supabase.from('pricing_rules').select('weekdays, from_time, to_time, price').eq('club_id', club.id),
    supabase
      .from('court_occupancy')
      .select('id, court_id, kind, starts_at, ends_at, note')
      .eq('club_id', club.id)
      .lt('starts_at', dayEnd)
      .gt('ends_at', dayStart),
    supabase
      .from('bookings')
      .select(
        'id, occupancy_id, player_id, guest_name, price, status, source, series_id, player:profiles!bookings_player_id_fkey(display_name), payments(status, amount)',
      )
      .eq('club_id', club.id)
      .eq('status', 'confirmed')
      .lt('starts_at', dayEnd)
      .gt('ends_at', dayStart),
  ])
  if (courts.error) throw courts.error
  if (rules.error) throw rules.error
  if (occupancies.error) throw occupancies.error
  if (bookings.error) throw bookings.error

  return buildDayGrid({
    date,
    now,
    slots: daySlots(scheduleOf(club), date),
    courts: courts.data.map((court) => ({ id: court.id, name: court.name, isCovered: court.is_covered })),
    rules: rules.data.map((rule) => ({
      weekdays: rule.weekdays,
      fromTime: rule.from_time,
      toTime: rule.to_time,
      price: rule.price,
    })),
    occupancies: occupancies.data.map((o) => ({
      id: o.id,
      courtId: o.court_id,
      kind: o.kind,
      note: o.note,
      startsAt: toDate(o.starts_at),
      endsAt: toDate(o.ends_at),
    })),
    bookings: bookings.data.flatMap((row: BookingRow) =>
      row.occupancy_id ? [toGridBooking(row, row.occupancy_id, viewerId)] : [],
    ),
  })
}
```

- [ ] **Step 2: Server Action**

`app/(jugador)/reservar/actions.ts`:
```ts
'use server'

import { fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { readInstant, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

export async function bookSlot(_previous: ActionState, form: FormData): Promise<ActionState> {
  const courtId = readUuid(form, 'courtId')
  const startsAt = readInstant(form, 'startsAt')
  if (!courtId || !startsAt) return INVALID_INPUT

  const supabase = await createClient()
  const { error } = await supabase.rpc('book_slot', { p_court_id: courtId, p_starts_at: startsAt })
  // Refresh even on error: after slot_taken the grid has to show the court as taken.
  revalidateBookings()
  return fromRpc(error, 'Listo, reservaste la cancha. La ves en Mis reservas.')
}
```

- [ ] **Step 3: Tablero (cliente)**

`app/(jugador)/reservar/reservar-board.tsx`:
```tsx
'use client'

import { useCallback, useState } from 'react'
import { BookingSheet, type BookingChoice } from '@/components/booking/booking-sheet'
import { Legend } from '@/components/booking/legend'
import { SlotGrid } from '@/components/booking/slot-grid'
import type { FormAction } from '@/components/ui/action-form'
import { cn } from '@/lib/cn'
import { visibleRows, type Court, type GridCell, type GridRow } from '@/lib/domain/grid'

export function ReservarBoard({
  courts,
  rows,
  dayText,
  paymentNote,
  cancellationRule,
  bookAction,
}: {
  courts: Court[]
  rows: GridRow[]
  dayText: string
  paymentNote: string
  cancellationRule: string
  bookAction: FormAction
}) {
  const [choice, setChoice] = useState<BookingChoice | null>(null)
  const [onlyFree, setOnlyFree] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setChoice(null), [])
  const booked = useCallback((message: string) => {
    setChoice(null)
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
          <button type="button" className="font-semibold text-accent-ink underline" onClick={() => setShowPast(true)}>
            Mostrar
          </button>
        </p>
      ) : null}
      {shown.length > 0 ? (
        <SlotGrid courts={courts} rows={shown} variant="player" onSelect={select} />
      ) : (
        <p className="rounded-xl border border-border p-4 text-fg-muted">No quedan horarios libres este día. Probá con otro día.</p>
      )}
      <BookingSheet
        choice={choice}
        dayText={dayText}
        paymentNote={paymentNote}
        cancellationRule={cancellationRule}
        action={bookAction}
        onClose={close}
        onBooked={booked}
      />
    </div>
  )
}
```

- [ ] **Step 4: Página**

`app/(jugador)/reservar/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { DayStrip } from '@/components/booking/day-strip'
import { requirePlayer } from '@/lib/auth/viewer'
import { loadDayGrid } from '@/lib/data/day'
import { cancellationRule } from '@/lib/domain/cancellation'
import { dayLabel, dayLongLabel } from '@/lib/domain/format'
import { isLocalDate } from '@/lib/domain/input'
import { paymentMethodsNote } from '@/lib/domain/payments'
import { addDays, localDateOf } from '@/lib/domain/time'
import { bookSlot } from './actions'
import { ReservarBoard } from './reservar-board'

export const metadata: Metadata = { title: 'Reservar' }

type SearchParams = Promise<{ dia?: string }>

export default async function ReservarPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requirePlayer('/reservar')
  const { club } = viewer
  const { dia } = await searchParams
  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index))
  const date = isLocalDate(dia) && days.includes(dia) ? dia : today
  const grid = await loadDayGrid(club, date, viewer.userId, now)

  return (
    <>
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">Reservar cancha</h1>
        <p className="text-fg-muted">
          Elegí el día y tocá un horario libre. Turnos de {club.slot_minutes} minutos, precio por cancha completa.
        </p>
      </div>
      <DayStrip days={days.map((day) => ({ date: day, label: dayLabel(day, today) }))} selected={date} basePath="/reservar" />
      <ReservarBoard
        key={date}
        courts={grid.courts}
        rows={grid.rows}
        dayText={dayLongLabel(date)}
        paymentNote={paymentMethodsNote(club)}
        cancellationRule={cancellationRule(club.cancellation_notice_hours)}
        bookAction={bookSlot}
      />
    </>
  )
}
```

- [ ] **Step 5: Verificar**

Run:
```bash
npm run typecheck
npm run lint
npx playwright test tests/e2e/player-booking.spec.ts
```
Expected: typecheck y lint en verde. El flujo 1 avanza hasta reservar y falla recién en `getByRole('link', { name: 'Mis reservas' })` → la página `/reservas` no existe (404).

- [ ] **Step 6: Commit**

```bash
git add lib/data/day.ts "app/(jugador)/reservar"
git commit -m "feat(app): add booking screen with day grid"
```

---

### Task 31: Vista de "Mis reservas" y nombre del comprobante

**Files:**
- Create: `lib/domain/my-bookings.ts`, `lib/domain/receipts.ts`
- Test: `tests/unit/lib/domain/my-bookings.test.ts`, `tests/unit/lib/domain/receipts.test.ts`

- [ ] **Step 1: Tests que fallan**

`tests/unit/lib/domain/my-bookings.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { splitMyBookings, toMyBookingView, type MyBookingRow } from '@/lib/domain/my-bookings'

const CLUB = { timezone: 'America/Montevideo', cancellation_notice_hours: 24, accepts_transfer: true }
const NOW = new Date('2026-10-01T12:00:00Z')

function row(overrides: Partial<MyBookingRow> = {}): MyBookingRow {
  return {
    id: 'b1',
    starts_at: '2026-10-03T23:00:00+00:00',
    ends_at: '2026-10-04T00:30:00+00:00',
    price: 1600,
    status: 'confirmed',
    court: { name: 'Cancha 2' },
    payments: [],
    ...overrides,
  }
}

describe('toMyBookingView', () => {
  it('describes the booking on the club clock', () => {
    expect(toMyBookingView(row(), CLUB, NOW)).toMatchObject({
      dateText: 'sábado 3 de octubre',
      timeText: '20:00 a 21:30',
      courtName: 'Cancha 2',
      upcoming: true,
      cancelled: false,
      paymentState: 'pending',
      amountDue: 1600,
      canReportTransfer: true,
      cancel: { allowed: true },
      rejectionReason: null,
    })
  })

  it('explains why it cannot be cancelled anymore', () => {
    const view = toMyBookingView(row({ starts_at: '2026-10-01T14:00:00+00:00', ends_at: '2026-10-01T15:30:00+00:00' }), CLUB, NOW)
    expect(view.cancel).toEqual({ allowed: false, reason: 'Ya no se puede cancelar: faltan menos de 24 h. Avisá al club.' })
  })

  it('stops offering the transfer once it is reported', () => {
    const view = toMyBookingView(
      row({ payments: [{ status: 'reported', amount: 1600, rejection_reason: null, created_at: '2026-10-01T10:00:00+00:00' }] }),
      CLUB,
      NOW,
    )
    expect(view).toMatchObject({ paymentState: 'reported', canReportTransfer: false })
  })

  it('shows why the club rejected the last transfer and lets her try again', () => {
    const view = toMyBookingView(
      row({ payments: [{ status: 'rejected', amount: 1600, rejection_reason: 'No llegó', created_at: '2026-10-01T10:00:00+00:00' }] }),
      CLUB,
      NOW,
    )
    expect(view).toMatchObject({ rejectionReason: 'No llegó', canReportTransfer: true })
  })

  it('does not offer transfers when the club does not take them', () => {
    expect(toMyBookingView(row(), { ...CLUB, accepts_transfer: false }, NOW).canReportTransfer).toBe(false)
  })

  it('keeps cancelled and played bookings out of the upcoming list', () => {
    expect(toMyBookingView(row({ status: 'cancelled' }), CLUB, NOW)).toMatchObject({ upcoming: false, cancelled: true })
    expect(
      toMyBookingView(row({ starts_at: '2026-09-30T23:00:00+00:00', ends_at: '2026-10-01T00:30:00+00:00' }), CLUB, NOW).upcoming,
    ).toBe(false)
  })
})

describe('splitMyBookings', () => {
  it('lists upcoming soonest first and past latest first', () => {
    const view = (id: string, upcoming: boolean) => ({ ...toMyBookingView(row({ id }), CLUB, NOW), upcoming })
    const { upcoming, past } = splitMyBookings([view('a', false), view('b', false), view('c', true), view('d', true)])
    expect(upcoming.map((v) => v.id)).toEqual(['c', 'd'])
    expect(past.map((v) => v.id)).toEqual(['b', 'a'])
  })
})
```

`tests/unit/lib/domain/receipts.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { receiptPath } from '@/lib/domain/receipts'

describe('receiptPath', () => {
  it('puts the receipt in the user folder, named after the booking', () => {
    expect(receiptPath('u1', 'b1', 'Comprobante.JPG', 123)).toBe('u1/b1-123.jpg')
  })

  it('ignores whatever the file name tries to do', () => {
    expect(receiptPath('u1', 'b1', '../../otro/x.png', 123)).toBe('u1/b1-123.png')
    expect(receiptPath('u1', 'b1', 'captura', 123)).toBe('u1/b1-123.bin')
  })
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/unit/lib/domain/my-bookings.test.ts tests/unit/lib/domain/receipts.test.ts`
Expected: FAIL por imports que no resuelven.

- [ ] **Step 3: Implementación**

`lib/domain/my-bookings.ts`:
```ts
import { cancellationStatus, type CancellationStatus } from './cancellation'
import { dayLongLabel, timeIn } from './format'
import { amountDue, paymentState, type PaymentState, type PaymentStatus } from './payments'
import { localDateOf, toDate } from './time'

export type MyBookingRow = {
  id: string
  starts_at: string | null
  ends_at: string | null
  price: number
  status: 'confirmed' | 'cancelled'
  court: { name: string } | null
  payments: { status: PaymentStatus; amount: number; rejection_reason: string | null; created_at: string }[]
}

export type MyBookingView = {
  id: string
  dateText: string
  timeText: string
  courtName: string
  price: number
  upcoming: boolean
  cancelled: boolean
  paymentState: PaymentState
  amountDue: number
  cancel: CancellationStatus
  canReportTransfer: boolean
  rejectionReason: string | null
}

type ClubRules = { timezone: string; cancellation_notice_hours: number; accepts_transfer: boolean }

export function toMyBookingView(row: MyBookingRow, club: ClubRules, now: Date): MyBookingView {
  const startsAt = toDate(row.starts_at)
  const endsAt = toDate(row.ends_at)
  const state = paymentState(row, row.payments)
  const latest = [...row.payments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const confirmed = row.status === 'confirmed'

  return {
    id: row.id,
    dateText: dayLongLabel(localDateOf(startsAt, club.timezone)),
    timeText: `${timeIn(startsAt, club.timezone)} a ${timeIn(endsAt, club.timezone)}`,
    courtName: row.court?.name ?? 'Cancha',
    price: row.price,
    upcoming: confirmed && endsAt > now,
    cancelled: !confirmed,
    paymentState: state,
    amountDue: amountDue(row.price, row.payments),
    cancel: cancellationStatus(startsAt, club.cancellation_notice_hours, now),
    canReportTransfer: confirmed && club.accepts_transfer && state === 'pending',
    rejectionReason: state === 'pending' && latest?.status === 'rejected' ? (latest.rejection_reason ?? 'sin motivo') : null,
  }
}

// Expects views in ascending start order (as the query returns them).
export function splitMyBookings(views: MyBookingView[]): { upcoming: MyBookingView[]; past: MyBookingView[] } {
  return {
    upcoming: views.filter((view) => view.upcoming),
    past: views.filter((view) => !view.upcoming).reverse().slice(0, 20),
  }
}
```

`lib/domain/receipts.ts`:
```ts
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024

const EXTENSION = /\.([a-z0-9]{1,5})$/i

// Object name inside the receipts bucket: <user_id>/<booking_id>-<timestamp>.<ext>.
// The first folder is what the Storage policy and report_transfer check; the user's file name
// only contributes its extension.
export function receiptPath(userId: string, bookingId: string, fileName: string, now = Date.now()): string {
  const extension = EXTENSION.exec(fileName)?.[1]?.toLowerCase() ?? 'bin'
  return `${userId}/${bookingId}-${now}.${extension}`
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/unit/lib/domain/my-bookings.test.ts tests/unit/lib/domain/receipts.test.ts`
Expected: PASS, 7 + 2 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/my-bookings.ts lib/domain/receipts.ts tests/unit/lib/domain/my-bookings.test.ts tests/unit/lib/domain/receipts.test.ts
git commit -m "feat(domain): describe my bookings and name receipts"
```

---

### Task 32: Hoja "Ya transferí" y subida del comprobante

**Files:**
- Create: `lib/storage/receipts.ts`, `components/booking/transfer-sheet.tsx`
- Test: `tests/unit/components/booking/transfer-sheet.test.tsx`

- [ ] **Step 1: Test que falla**

`tests/unit/components/booking/transfer-sheet.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  TransferSheet,
  type ReportTransfer,
  type TransferSheetProps,
  type UploadReceipt,
} from '@/components/booking/transfer-sheet'

const FILE = new File(['png'], 'comprobante.png', { type: 'image/png' })

function renderSheet(overrides: Partial<TransferSheetProps> = {}) {
  const props: TransferSheetProps = {
    bookingId: 'b1',
    userId: 'u1',
    amount: 1600,
    details: 'Banco Ejemplo, cuenta 123',
    receiptRequired: true,
    reportAction: vi.fn<ReportTransfer>(async () => ({ status: 'ok', message: 'Listo, le avisamos al club.' })),
    upload: vi.fn<UploadReceipt>(async () => ({ path: 'u1/b1-1.png' })),
    onClose: vi.fn(),
    onDone: vi.fn(),
    ...overrides,
  }
  render(<TransferSheet {...props} />)
  return props
}

describe('TransferSheet', () => {
  it('shows the amount and where to transfer', () => {
    renderSheet()
    const dialog = screen.getByRole('dialog', { name: 'Ya transferí' })
    expect(dialog).toHaveTextContent('$1.600')
    expect(dialog).toHaveTextContent('Banco Ejemplo, cuenta 123')
  })

  it('uploads the receipt and reports the transfer', async () => {
    const props = renderSheet()
    await userEvent.upload(screen.getByLabelText('Comprobante'), FILE)
    await userEvent.click(screen.getByRole('button', { name: 'Informar transferencia' }))
    await waitFor(() => expect(props.onDone).toHaveBeenCalledWith('Listo, le avisamos al club.'))
    expect(props.upload).toHaveBeenCalledWith('u1', 'b1', FILE)
    expect(props.reportAction).toHaveBeenCalledWith('b1', 'u1/b1-1.png')
  })

  it('does not report when the upload fails', async () => {
    const props = renderSheet({
      upload: vi.fn<UploadReceipt>(async () => ({ error: 'No pudimos subir el comprobante. Probá de nuevo.' })),
    })
    await userEvent.upload(screen.getByLabelText('Comprobante'), FILE)
    await userEvent.click(screen.getByRole('button', { name: 'Informar transferencia' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos subir el comprobante')
    expect(props.reportAction).not.toHaveBeenCalled()
  })

  it('reports without a receipt when the club does not ask for one', async () => {
    const props = renderSheet({ receiptRequired: false })
    expect(screen.getByLabelText('Comprobante (opcional)')).not.toBeRequired()
    await userEvent.click(screen.getByRole('button', { name: 'Informar transferencia' }))
    await waitFor(() => expect(props.reportAction).toHaveBeenCalledWith('b1', null))
    expect(props.upload).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/unit/components/booking/transfer-sheet.test.tsx`
Expected: FAIL con `Failed to resolve import "@/components/booking/transfer-sheet"`.

- [ ] **Step 3: Subida desde el navegador**

`lib/storage/receipts.ts`:
```ts
import { MAX_RECEIPT_BYTES, receiptPath } from '@/lib/domain/receipts'
import { createClient } from '@/lib/supabase/client'

export type UploadResult = { path: string } | { error: string }

// Uploads straight from the browser to Storage; the policy only lets the user write in her folder.
export async function uploadReceipt(userId: string, bookingId: string, file: File): Promise<UploadResult> {
  if (file.size > MAX_RECEIPT_BYTES) return { error: 'El comprobante pesa más de 5 MB. Probá con una captura de pantalla.' }
  const path = receiptPath(userId, bookingId, file.name)
  const { error } = await createClient()
    .storage.from('receipts')
    .upload(path, file, { upsert: false, contentType: file.type || undefined })
  return error ? { error: 'No pudimos subir el comprobante. Probá de nuevo.' } : { path }
}
```

- [ ] **Step 4: Hoja**

`components/booking/transfer-sheet.tsx`:
```tsx
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { failed, IDLE, type ActionState } from '@/lib/actions/result'
import { errorMessage } from '@/lib/domain/errors'
import { formatPrice } from '@/lib/domain/format'
import { uploadReceipt, type UploadResult } from '@/lib/storage/receipts'

export type ReportTransfer = (bookingId: string, receiptPath: string | null) => Promise<ActionState>
export type UploadReceipt = (userId: string, bookingId: string, file: File) => Promise<UploadResult>

export type TransferSheetProps = {
  bookingId: string
  userId: string
  amount: number
  details: string | null
  receiptRequired: boolean
  reportAction: ReportTransfer
  upload?: UploadReceipt
  onClose: () => void
  onDone: (message: string) => void
}

// The app does not move money: it shows where to transfer and tells the club it was done.
export function TransferSheet({
  bookingId,
  userId,
  amount,
  details,
  receiptRequired,
  reportAction,
  upload = uploadReceipt,
  onClose,
  onDone,
}: TransferSheetProps) {
  const [state, formAction, pending] = useActionState(async (_previous: ActionState, form: FormData) => {
    const file = form.get('receipt')
    let path: string | null = null
    if (file instanceof File && file.size > 0) {
      const uploaded = await upload(userId, bookingId, file)
      if ('error' in uploaded) return failed(uploaded.error)
      path = uploaded.path
    } else if (receiptRequired) {
      return failed(errorMessage('receipt_required'))
    }
    const result = (await reportAction(bookingId, path)) ?? IDLE
    if (result.status === 'ok') onDone(result.message ?? '')
    return result
  }, IDLE)

  return (
    <BottomSheet open onClose={onClose} title="Ya transferí">
      <div className="flex flex-col gap-4">
        <p>
          Transferí <strong>{formatPrice(amount)}</strong> a esta cuenta y subí el comprobante. El club confirma el pago
          cuando lo ve.
        </p>
        <p className="whitespace-pre-line rounded-xl border border-border bg-bg p-3">
          {details ?? 'El club todavía no cargó sus datos de transferencia. Consultá en recepción.'}
        </p>
        <form action={formAction} className="flex flex-col gap-3">
          <label htmlFor="receipt" className="text-sm font-semibold">
            {receiptRequired ? 'Comprobante' : 'Comprobante (opcional)'}
          </label>
          <input id="receipt" name="receipt" type="file" accept="image/*,application/pdf" required={receiptRequired} />
          {state.status === 'error' ? (
            <p role="alert" className="rounded-xl border border-accent bg-bg p-3 text-sm">
              {state.message}
            </p>
          ) : null}
          <Button type="submit" fullWidth disabled={pending}>
            {pending ? 'Enviando…' : 'Informar transferencia'}
          </Button>
        </form>
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `npx vitest run tests/unit/components/booking/transfer-sheet.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/storage/receipts.ts components/booking/transfer-sheet.tsx tests/unit/components/booking/transfer-sheet.test.tsx
git commit -m "feat(ui): add transfer sheet with receipt upload"
```

---

### Task 33: Pantalla Mis reservas

**Files:**
- Create: `app/(jugador)/reservas/page.tsx`, `app/(jugador)/reservas/actions.ts`, `app/(jugador)/reservas/my-booking-card.tsx`
- Test: `tests/unit/app/reservas/my-booking-card.test.tsx`

- [ ] **Step 1: Test que falla**

`tests/unit/app/reservas/my-booking-card.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MyBookingCard } from '@/app/(jugador)/reservas/my-booking-card'
import type { ReportTransfer } from '@/components/booking/transfer-sheet'
import type { FormAction } from '@/components/ui/action-form'
import type { MyBookingView } from '@/lib/domain/my-bookings'

const BOOKING: MyBookingView = {
  id: 'b1',
  dateText: 'sábado 3 de octubre',
  timeText: '20:00 a 21:30',
  courtName: 'Cancha 2',
  price: 1600,
  upcoming: true,
  cancelled: false,
  paymentState: 'pending',
  amountDue: 1600,
  cancel: { allowed: true },
  canReportTransfer: true,
  rejectionReason: null,
}

function renderCard(booking: MyBookingView = BOOKING) {
  render(
    <MyBookingCard
      booking={booking}
      userId="u1"
      transfer={{ details: 'Banco Ejemplo', receiptRequired: true }}
      cancelAction={vi.fn<FormAction>()}
      reportAction={vi.fn<ReportTransfer>()}
    />,
  )
}

describe('MyBookingCard', () => {
  it('shows when, where, how much and the payment state', () => {
    renderCard()
    expect(screen.getByText('sábado 3 de octubre')).toBeInTheDocument()
    expect(screen.getByText(/20:00 a 21:30, Cancha 2/)).toBeInTheDocument()
    expect(screen.getByText('Pendiente de pago')).toBeInTheDocument()
  })

  it('asks before cancelling', async () => {
    renderCard()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }))
    expect(screen.getByRole('dialog', { name: 'Cancelar reserva' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sí, cancelar' })).toBeInTheDocument()
  })

  it('explains why it can no longer be cancelled', () => {
    renderCard({ ...BOOKING, cancel: { allowed: false, reason: 'Ya no se puede cancelar: faltan menos de 24 h. Avisá al club.' } })
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument()
    expect(screen.getByText(/faltan menos de 24 h/)).toBeInTheDocument()
  })

  it('opens the transfer sheet', async () => {
    renderCard()
    await userEvent.click(screen.getByRole('button', { name: 'Ya transferí' }))
    expect(screen.getByRole('dialog', { name: 'Ya transferí' })).toHaveTextContent('Banco Ejemplo')
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/unit/app/reservas/my-booking-card.test.tsx`
Expected: FAIL con `Failed to resolve import "@/app/(jugador)/reservas/my-booking-card"`.

- [ ] **Step 3: Tarjeta**

`app/(jugador)/reservas/my-booking-card.tsx`:
```tsx
'use client'

import { useCallback, useState } from 'react'
import { PaymentBadge } from '@/components/booking/payment-badge'
import { TransferSheet, type ReportTransfer } from '@/components/booking/transfer-sheet'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatPrice } from '@/lib/domain/format'
import type { MyBookingView } from '@/lib/domain/my-bookings'

export function MyBookingCard({
  booking,
  userId,
  transfer,
  cancelAction,
  reportAction,
}: {
  booking: MyBookingView
  userId: string
  transfer: { details: string | null; receiptRequired: boolean }
  cancelAction: FormAction
  reportAction: ReportTransfer
}) {
  const [sheet, setSheet] = useState<'cancel' | 'transfer' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setSheet(null), [])
  const done = useCallback((message: string) => {
    setSheet(null)
    setNotice(message)
  }, [])

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-bold uppercase">{booking.dateText}</p>
          <p>
            {booking.timeText}, {booking.courtName}
          </p>
          <p className="text-fg-muted">{formatPrice(booking.price)}</p>
        </div>
        <PaymentBadge state={booking.paymentState} />
      </div>
      {booking.cancelled ? <p className="text-sm text-fg-muted">Cancelada</p> : null}
      {booking.rejectionReason ? (
        <p className="text-sm">El club rechazó la transferencia: {booking.rejectionReason}.</p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
      {booking.upcoming ? (
        <div className="flex flex-wrap items-center gap-2">
          {booking.canReportTransfer ? (
            <Button variant="secondary" onClick={() => setSheet('transfer')}>
              Ya transferí
            </Button>
          ) : null}
          {booking.cancel.allowed ? (
            <Button variant="ghost" onClick={() => setSheet('cancel')}>
              Cancelar reserva
            </Button>
          ) : (
            <p className="text-sm text-fg-muted">{booking.cancel.reason}</p>
          )}
        </div>
      ) : null}

      <BottomSheet open={sheet === 'cancel'} onClose={close} title="Cancelar reserva">
        <p className="mb-4">
          {booking.dateText}, {booking.timeText}, {booking.courtName}. La cancha queda libre para otro.
        </p>
        <ActionForm action={cancelAction} submitLabel="Sí, cancelar" pendingLabel="Cancelando…" onDone={done}>
          <input type="hidden" name="bookingId" value={booking.id} />
        </ActionForm>
      </BottomSheet>
      {sheet === 'transfer' ? (
        <TransferSheet
          bookingId={booking.id}
          userId={userId}
          amount={booking.amountDue}
          details={transfer.details}
          receiptRequired={transfer.receiptRequired}
          reportAction={reportAction}
          onClose={close}
          onDone={done}
        />
      ) : null}
    </Card>
  )
}
```

- [ ] **Step 4: Server Actions**

`app/(jugador)/reservas/actions.ts`:
```ts
'use server'

import { fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { isUuid, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

export async function cancelMyBooking(_previous: ActionState, form: FormData): Promise<ActionState> {
  const bookingId = readUuid(form, 'bookingId')
  if (!bookingId) return INVALID_INPUT

  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_my_booking', { p_booking_id: bookingId })
  revalidateBookings()
  return fromRpc(error, 'Cancelaste la reserva. La cancha quedó libre.')
}

// Called after the browser uploaded the receipt; report_transfer checks the path is hers.
export async function reportTransfer(bookingId: string, receiptPath: string | null): Promise<ActionState> {
  if (!isUuid(bookingId)) return INVALID_INPUT
  if (receiptPath !== null && (typeof receiptPath !== 'string' || receiptPath.length > 300)) return INVALID_INPUT

  const supabase = await createClient()
  const { error } = await supabase.rpc('report_transfer', {
    p_booking_id: bookingId,
    p_receipt_path: receiptPath ?? undefined,
  })
  revalidateBookings()
  return fromRpc(error, 'Listo, le avisamos al club. Te confirma el pago cuando lo vea.')
}
```

- [ ] **Step 5: Página**

`app/(jugador)/reservas/page.tsx`:
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePlayer } from '@/lib/auth/viewer'
import { splitMyBookings, toMyBookingView } from '@/lib/domain/my-bookings'
import { createClient } from '@/lib/supabase/server'
import { cancelMyBooking, reportTransfer } from './actions'
import { MyBookingCard } from './my-booking-card'

export const metadata: Metadata = { title: 'Mis reservas' }

export default async function MyBookingsPage() {
  const viewer = await requirePlayer('/reservas')
  const { club } = viewer
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bookings')
    .select('id, starts_at, ends_at, price, status, court:courts(name), payments(status, amount, rejection_reason, created_at)')
    .eq('player_id', viewer.userId)
    .order('starts_at', { ascending: true })
  if (error) throw error

  const now = new Date()
  const { upcoming, past } = splitMyBookings(data.map((row) => toMyBookingView(row, club, now)))
  const transfer = { details: club.transfer_details, receiptRequired: club.transfer_receipt_required }
  const card = (booking: (typeof upcoming)[number]) => (
    <li key={booking.id}>
      <MyBookingCard
        booking={booking}
        userId={viewer.userId}
        transfer={transfer}
        cancelAction={cancelMyBooking}
        reportAction={reportTransfer}
      />
    </li>
  )

  return (
    <>
      <h1 className="font-display text-4xl font-bold uppercase">Mis reservas</h1>
      <section aria-labelledby="proximas" className="flex flex-col gap-3">
        <h2 id="proximas" className="font-display text-2xl font-bold uppercase">
          Próximas
        </h2>
        {upcoming.length > 0 ? (
          <ul className="flex flex-col gap-3">{upcoming.map(card)}</ul>
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
      {past.length > 0 ? (
        <section aria-labelledby="pasadas" className="flex flex-col gap-3">
          <h2 id="pasadas" className="font-display text-2xl font-bold uppercase">
            Pasadas y canceladas
          </h2>
          <ul className="flex flex-col gap-3">{past.map(card)}</ul>
        </section>
      ) : null}
    </>
  )
}
```

- [ ] **Step 6: Correr y ver que pasa**

Run:
```bash
npx vitest run tests/unit/app/reservas/my-booking-card.test.tsx
npm run typecheck
npm run lint
npx playwright test tests/e2e/player-booking.spec.ts
```
Expected: PASS (4 tests), typecheck y lint en verde, flujo 1 en verde. Si el typecheck marca el `row` de `toMyBookingView`, ajustar `MyBookingRow` a lo que infiere supabase-js (sin `as`).

- [ ] **Step 7: Commit**

```bash
git add "app/(jugador)/reservas" tests/unit/app/reservas
git commit -m "feat(app): add my bookings with cancel and transfer report"
```

---

### Task 34: Inicio y Perfil; flujos 1 y 3 en verde

**Files:**
- Modify: `app/(jugador)/page.tsx`
- Create: `app/(jugador)/perfil/page.tsx`
- Create: `tests/e2e/late-cancel.spec.ts`

- [ ] **Step 1: Flujo 3 en rojo**

`tests/e2e/late-cancel.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { createMember, insertBookingSoon } from './support/admin'
import { signInWithMagicLink } from './support/auth'

test('a player cannot cancel inside the notice period and sees why', async ({ page }) => {
  const player = await createMember({ name: 'Tomás E2E', prefix: 'flujo3' })
  const { courtName } = await insertBookingSoon(player)

  await signInWithMagicLink(page, player.email, '/reservas')
  await expect(page).toHaveURL(/\/reservas/)

  const card = page.getByRole('listitem').filter({ hasText: courtName }).filter({ hasText: 'Pendiente de pago' })
  await expect(card).toContainText('Ya no se puede cancelar: faltan menos de 24 h')
  await expect(card.getByRole('button', { name: 'Cancelar reserva' })).toHaveCount(0)
})
```

Run: `npx playwright test tests/e2e/late-cancel.spec.ts`
Expected: PASS ya (Mis reservas existe). Si pasa, está bien: el flujo documenta la regla; la lógica se probó en rojo en Vitest (Task 16) y pgTAP (Task 4).

- [ ] **Step 2: Inicio**

Reemplazar `app/(jugador)/page.tsx` completo:
```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/brand/logo'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getViewer } from '@/lib/auth/viewer'
import { loadDayGrid } from '@/lib/data/day'
import { dayLongLabel, timeIn } from '@/lib/domain/format'
import { countFree } from '@/lib/domain/grid'
import { categoryLabel, firstName, isProfileComplete, isStaffRole, SIDE_LABELS } from '@/lib/domain/profile'
import { localDateOf, toDate } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const viewer = await getViewer()
  if (!viewer) return <Landing />
  const { club, profile, membership } = viewer
  if (!membership || !isProfileComplete(profile, membership)) redirect('/bienvenida')

  const now = new Date()
  const supabase = await createClient()
  const [grid, next] = await Promise.all([
    loadDayGrid(club, localDateOf(now, club.timezone), viewer.userId, now),
    supabase
      .from('bookings')
      .select('id, starts_at, ends_at, court:courts(name)')
      .eq('player_id', viewer.userId)
      .eq('status', 'confirmed')
      .gt('ends_at', now.toISOString())
      .order('starts_at')
      .limit(1)
      .maybeSingle(),
  ])
  if (next.error) throw next.error
  const freeToday = countFree(grid.rows)

  return (
    <>
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">Hola, {firstName(profile.display_name)}</h1>
        <p className="text-fg-muted">
          {categoryLabel(membership.category, membership.category_validated)}.
          {profile.side ? ` ${SIDE_LABELS[profile.side]}.` : ''}
        </p>
      </div>
      <Card className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-bold uppercase">Tu próxima reserva</h2>
        {next.data ? (
          <>
            <p>
              {dayLongLabel(localDateOf(toDate(next.data.starts_at), club.timezone))},{' '}
              {timeIn(toDate(next.data.starts_at), club.timezone)} a {timeIn(toDate(next.data.ends_at), club.timezone)},{' '}
              {next.data.court?.name}
            </p>
            <Link href="/reservas" className="font-semibold text-accent-ink underline">
              Ver mis reservas
            </Link>
          </>
        ) : (
          <p className="text-fg-muted">No tenés reservas.</p>
        )}
      </Card>
      <Link href="/reservar" className={buttonClasses({ fullWidth: true })}>
        {freeToday === 1 ? '1 turno libre hoy' : `${freeToday} turnos libres hoy`}
      </Link>
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
        <p className="mb-4 text-fg-muted">Reservá cancha y armá partido desde el celular.</p>
        <Link href="/auth/ingreso" className={buttonClasses({ fullWidth: true })}>
          Ingresar
        </Link>
      </Card>
    </>
  )
}
```

- [ ] **Step 3: Perfil**

`app/(jugador)/perfil/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { PlayerProfileForm } from '@/components/profile/player-profile-form'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { saveProfile, signOut } from '@/lib/actions/profile'
import { requirePlayer } from '@/lib/auth/viewer'
import { categoryLabel } from '@/lib/domain/profile'

export const metadata: Metadata = { title: 'Perfil' }

export default async function ProfilePage() {
  const viewer = await requirePlayer('/perfil')
  const { profile, membership } = viewer

  return (
    <>
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">{profile.display_name}</h1>
        <p className="text-fg-muted">{categoryLabel(membership.category, membership.category_validated)}</p>
      </div>
      <Card>
        <PlayerProfileForm
          mode="profile"
          action={saveProfile}
          initial={{
            displayName: profile.display_name,
            side: profile.side,
            hand: profile.hand,
            category: membership.category,
            isPublic: profile.is_public,
          }}
        />
      </Card>
      <form action={signOut}>
        <Button type="submit" variant="secondary" fullWidth>
          Cerrar sesión
        </Button>
      </form>
    </>
  )
}
```

- [ ] **Step 4: Correr todo el corte**

Run:
```bash
npm run lint
npm run typecheck
npm test
npx playwright test tests/e2e/smoke.spec.ts tests/e2e/player-booking.spec.ts tests/e2e/late-cancel.spec.ts
```
Expected: todo en verde. Probar a mano en `npm run dev` (Supabase local en `.env.local` o con las variables de `supabase status`): Inicio muestra saludo, próxima reserva y "N turnos libres hoy"; Perfil guarda y "Cerrar sesión" vuelve a la portada.

- [ ] **Step 5: Commit y push**

```bash
git add "app/(jugador)/page.tsx" "app/(jugador)/perfil" tests/e2e/late-cancel.spec.ts
git commit -m "feat(app): add home and profile screens; cover late cancel"
git push
```
Expected: CI en verde en el PR borrador.

---
## Corte 4: Grilla del club y cobros

### Task 35: Panel del club (layout y pestañas)

**Files:**
- Create: `lib/club/tabs.ts`
- Create: `app/(club)/club/layout.tsx`, `app/(club)/club/page.tsx`
- Test: `tests/unit/lib/club/tabs.test.ts`

- [ ] **Step 1: Test que falla**

`tests/unit/lib/club/tabs.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { clubTabs } from '@/lib/club/tabs'

describe('clubTabs', () => {
  it('shows the screens that exist so far to reception and admin', () => {
    expect(clubTabs('reception').map((tab) => tab.label)).toEqual(['Grilla', 'Cobros'])
    expect(clubTabs('admin').map((tab) => tab.href)).toEqual(['/club/grilla', '/club/cobros'])
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/unit/lib/club/tabs.test.ts`
Expected: FAIL con `Failed to resolve import "@/lib/club/tabs"`.

- [ ] **Step 3: Implementación**

`lib/club/tabs.ts`:
```ts
import type { TabItem } from '@/components/nav/tab-nav'
import type { Role } from '@/lib/domain/profile'

// Club screens. Each one is added here in the slice that builds it, so the tabs never lead to a 404.
export function clubTabs(role: Role): TabItem[] {
  void role
  return [
    { href: '/club/grilla', label: 'Grilla' },
    { href: '/club/cobros', label: 'Cobros' },
  ]
}
```

`app/(club)/club/layout.tsx`:
```tsx
import Link from 'next/link'
import { TabNav } from '@/components/nav/tab-nav'
import { requireStaff } from '@/lib/auth/viewer'
import { clubTabs } from '@/lib/club/tabs'

// Reception and admin only. Each page checks it again (layouts do not re-run on every navigation).
export default async function ClubLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireStaff('/club/grilla')

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-end justify-between gap-4 px-4 pt-6">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase">Panel del club</h1>
          <p className="text-fg-muted">{viewer.club.name}</p>
        </div>
        <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink">
          Ir a la app
        </Link>
      </header>
      <TabNav label="Panel" items={clubTabs(viewer.membership.role)} variant="top" />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">{children}</main>
    </div>
  )
}
```

`app/(club)/club/page.tsx`:
```tsx
import { redirect } from 'next/navigation'

export default function ClubHome() {
  redirect('/club/grilla')
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run tests/unit/lib/club/tabs.test.ts && npm run typecheck`
Expected: PASS (1 test) y typecheck en verde.

- [ ] **Step 5: Commit**

```bash
git add lib/club/tabs.ts "app/(club)" tests/unit/lib/club
git commit -m "feat(club): add staff-only club panel layout"
```

---

### Task 36: Flujo 2 en rojo (recepción: cobro, bloqueo, cancelación)

**Files:**
- Create: `tests/e2e/support/booking.ts`
- Create: `tests/e2e/reception-grid.spec.ts`

- [ ] **Step 1: Reservar e informar como jugador, por API**

`tests/e2e/support/booking.ts`:
```ts
import { daySlots } from '../../../lib/domain/slots'
import type { LocalDate } from '../../../lib/domain/time'
import { adminClient, clubRow, signedInClient, type TestUser } from './admin'
import { RECEIPT_PNG } from './files'

export type BookedSlot = { bookingId: string; courtName: string; time: string }

// Books, as the player and through book_slot, the first slot of that day she can take.
export async function bookFirstFreeSlot(user: TestUser, day: LocalDate): Promise<BookedSlot> {
  const admin = adminClient()
  const club = await clubRow(admin)
  const client = await signedInClient(user)
  const { data: courts, error } = await admin
    .from('courts')
    .select('id, name')
    .eq('club_id', club.id)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error

  const schedule = { timezone: club.timezone, opensAt: club.opens_at, closesAt: club.closes_at, slotMinutes: club.slot_minutes }
  for (const slot of daySlots(schedule, day)) {
    for (const court of courts) {
      const booked = await client.rpc('book_slot', { p_court_id: court.id, p_starts_at: slot.startsAt.toISOString() })
      if (booked.error?.message === 'slot_taken' || booked.error?.message === 'busy_at_that_time') continue
      if (booked.error) throw booked.error
      return { bookingId: booked.data.id, courtName: court.name, time: slot.label }
    }
  }
  throw new Error(`No quedó ningún turno libre el ${day}`)
}

// Uploads a receipt and reports the transfer, as the player.
export async function reportTransferAs(user: TestUser, bookingId: string): Promise<void> {
  const client = await signedInClient(user)
  const path = `${user.id}/${bookingId}-e2e.png`
  const upload = await client.storage.from('receipts').upload(path, RECEIPT_PNG, { contentType: 'image/png' })
  if (upload.error) throw upload.error
  const report = await client.rpc('report_transfer', { p_booking_id: bookingId, p_receipt_path: path })
  if (report.error) throw report.error
}
```

- [ ] **Step 2: El flujo**

`tests/e2e/reception-grid.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { bookFirstFreeSlot, reportTransferAs } from './support/booking'

async function openFirstFreeSlot(page: Page): Promise<{ court: string; time: string }> {
  const free = page.getByRole('button', { name: /^Cargar / }).first()
  const [, court, time] = /^Cargar (.+), (\d\d:\d\d)$/.exec((await free.getAttribute('aria-label')) ?? '') ?? []
  await free.click()
  return { court, time }
}

test('reception confirms a transfer, blocks a court and cancels a booking', async ({ page }) => {
  const club = await clubRow()
  const player = await createMember({ name: 'Martina E2E', prefix: 'flujo2-jugadora' })
  const reception = await createMember({ name: 'Recepción E2E', prefix: 'flujo2-recepcion', role: 'reception' })
  const day = addDays(localDateOf(new Date(), club.timezone), 4)
  const booked = await bookFirstFreeSlot(player, day)
  await reportTransferAs(player, booked.bookingId)

  // The booking is on the grid, with the transfer reported.
  await signInWithMagicLink(page, reception.email, `/club/grilla?dia=${day}`)
  const bookedCell = page.getByRole('button', { name: `${booked.courtName}, ${booked.time}: ${player.name}` })
  await expect(bookedCell).toContainText('Transferencia informada')

  // Confirm the payment in Cobros.
  await page.getByRole('link', { name: 'Cobros' }).click()
  const transfer = page
    .getByRole('region', { name: 'Transferencias para confirmar' })
    .getByRole('listitem')
    .filter({ hasText: player.name })
  await expect(transfer.getByRole('link', { name: 'Ver comprobante' })).toBeVisible()
  await transfer.getByRole('button', { name: 'Confirmar' }).click()
  await expect(transfer).toHaveCount(0)

  await page.goto(`/club/grilla?dia=${day}`)
  await expect(bookedCell).toContainText('Pagada')

  // Block the first free slot.
  const load = page.getByRole('dialog', { name: 'Cargar turno' })
  const blocked = await openFirstFreeSlot(page)
  await load.getByLabel('Tipo').selectOption('Bloqueo')
  await load.getByLabel('Motivo').fill('Mantenimiento')
  await load.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('button', { name: `${blocked.court}, ${blocked.time}: Mantenimiento` })).toContainText('Bloqueo')

  // Cancel the player's booking: the slot is free again.
  await bookedCell.click()
  await page.getByRole('dialog', { name: player.name }).getByRole('button', { name: 'Cancelar reserva' }).click()
  await expect(page.getByRole('button', { name: `Cargar ${booked.courtName}, ${booked.time}` })).toBeVisible()
})
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx playwright test tests/e2e/reception-grid.spec.ts`
Expected: FAIL: `/club/grilla` es 404, no aparece la celda de la reserva.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/support/booking.ts tests/e2e/reception-grid.spec.ts
git commit -m "test(e2e): add reception grid flow (red)"
```

---

### Task 37: Hoja "Cargar turno" (reserva y bloqueo)

**Files:**
- Create: `lib/domain/members.ts`
- Create: `components/club/load-sheet.tsx`
- Test: `tests/unit/components/club/load-sheet.test.tsx`

- [ ] **Step 1: Test que falla**

`tests/unit/components/club/load-sheet.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LoadSheet } from '@/components/club/load-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { at, DATE, makeGrid } from '../../fixtures/grid'

const grid = makeGrid()
const cell = grid.rows[0].cells[0]
const MEMBERS = [{ userId: 'u-ana', name: 'Ana' }]

function renderSheet() {
  const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Reserva cargada.' }))
  const onDone = vi.fn()
  render(
    <LoadSheet
      cell={cell}
      date={DATE}
      dayText="jueves 1 de octubre"
      rows={grid.rows}
      members={MEMBERS}
      action={action}
      onClose={vi.fn()}
      onDone={onDone}
    />,
  )
  const sent = () => Object.fromEntries(action.mock.calls[0][1].entries())
  return { action, onDone, sent }
}

describe('LoadSheet', () => {
  it('says which court and time it is loading', () => {
    renderSheet()
    expect(screen.getByRole('dialog', { name: 'Cargar turno' })).toHaveTextContent('Cancha 1, jueves 1 de octubre, 08:00. $1.200')
  })

  it('loads a booking under a name by default', async () => {
    const { action, onDone, sent } = renderSheet()
    await userEvent.type(screen.getByLabelText('A nombre de', { exact: true }), 'Rodríguez')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Reserva cargada.'))
    expect(action).toHaveBeenCalledTimes(1)
    expect(sent()).toMatchObject({
      kind: 'booking',
      holder: 'guest',
      guestName: 'Rodríguez',
      courtId: 'court-1',
      startsAt: cell.slot.startsAt.toISOString(),
    })
  })

  it('loads a booking for a club member', async () => {
    const { action, sent } = renderSheet()
    await userEvent.click(screen.getByRole('radio', { name: 'Jugador del club' }))
    await userEvent.selectOptions(screen.getByLabelText('Jugador', { exact: true }), 'Ana')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(sent()).toMatchObject({ kind: 'booking', holder: 'player', playerId: 'u-ana' })
  })

  it('blocks the court until the chosen time, with a reason', async () => {
    const { action, sent } = renderSheet()
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Bloqueo')
    const until = screen.getByLabelText('Hasta')
    expect([...(until as HTMLSelectElement).options].map((option) => option.textContent)).toEqual([
      '09:30', '11:00', '12:30', '14:00', '15:30', '17:00', '18:30', '20:00', '21:30', '23:00',
    ])
    await userEvent.selectOptions(until, '11:00')
    await userEvent.type(screen.getByLabelText('Motivo'), 'Clase de Pablo')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(sent()).toMatchObject({ kind: 'block', endsAt: at('11:00').toISOString(), note: 'Clase de Pablo' })
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/unit/components/club/load-sheet.test.tsx`
Expected: FAIL con `Failed to resolve import "@/components/club/load-sheet"`.

- [ ] **Step 3: Implementación**

`lib/domain/members.ts`:
```ts
// A club member reception can load a booking for.
export type MemberOption = { userId: string; name: string }
```

`components/club/load-sheet.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'
import { formatPrice } from '@/lib/domain/format'
import { blockEndOptions, type GridCell, type GridRow } from '@/lib/domain/grid'
import type { MemberOption } from '@/lib/domain/members'
import type { LocalDate } from '@/lib/domain/time'

type LoadKind = 'booking' | 'block'

// What reception loads on a free cell: a booking (for a member or a name) or a block.
export function LoadSheet({
  cell,
  date,
  dayText,
  rows,
  members,
  action,
  onClose,
  onDone,
}: {
  cell: GridCell
  date: LocalDate
  dayText: string
  rows: GridRow[]
  members: MemberOption[]
  action: FormAction
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [kind, setKind] = useState<LoadKind>('booking')
  const [holder, setHolder] = useState<'guest' | 'player'>('guest')
  const ends = blockEndOptions(rows, cell)

  return (
    <BottomSheet open onClose={onClose} title="Cargar turno">
      <p className="mb-4 text-fg-muted">
        {cell.court.name}, {dayText}, {cell.slot.label}.{' '}
        {cell.price === null ? 'Este horario no tiene precio: solo se puede bloquear.' : formatPrice(cell.price)}
      </p>
      <ActionForm action={action} submitLabel="Guardar" onDone={onDone}>
        <input type="hidden" name="courtId" value={cell.court.id} />
        <input type="hidden" name="startsAt" value={cell.slot.startsAt.toISOString()} />
        <input type="hidden" name="date" value={date} />
        <Field label="Tipo" htmlFor="kind">
          <select
            id="kind"
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as LoadKind)}
            className={inputClasses}
          >
            <option value="booking">Reserva</option>
            <option value="block">Bloqueo</option>
          </select>
        </Field>
        {kind === 'block' ? (
          <>
            <Field label="Hasta" htmlFor="endsAt">
              <select id="endsAt" name="endsAt" className={inputClasses}>
                {ends.map((end) => (
                  <option key={end.value} value={end.value}>
                    {end.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Motivo" htmlFor="note">
              <input id="note" name="note" maxLength={80} placeholder="Ej: Clase de Pablo" className={inputClasses} />
            </Field>
          </>
        ) : (
          <HolderFields holder={holder} onHolderChange={setHolder} members={members} />
        )}
      </ActionForm>
    </BottomSheet>
  )
}

export function HolderFields({
  holder,
  onHolderChange,
  members,
}: {
  holder: 'guest' | 'player'
  onHolderChange: (holder: 'guest' | 'player') => void
  members: MemberOption[]
}) {
  return (
    <>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-2 text-sm font-semibold">Titular</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="holder" value="guest" checked={holder === 'guest'} onChange={() => onHolderChange('guest')} />
          A nombre de alguien
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="holder" value="player" checked={holder === 'player'} onChange={() => onHolderChange('player')} />
          Jugador del club
        </label>
      </fieldset>
      {holder === 'guest' ? (
        <Field label="A nombre de" htmlFor="guestName">
          <input id="guestName" name="guestName" required maxLength={60} placeholder="Ej: Rodríguez" className={inputClasses} />
        </Field>
      ) : (
        <Field label="Jugador" htmlFor="playerId">
          <select id="playerId" name="playerId" required className={inputClasses}>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
          </select>
        </Field>
      )}
    </>
  )
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run tests/unit/components/club/load-sheet.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/members.ts components/club/load-sheet.tsx tests/unit/components/club/load-sheet.test.tsx
git commit -m "feat(club): add load sheet for bookings and blocks"
```

---

### Task 38: Detalle de una cancha ocupada

**Files:**
- Create: `components/club/occupancy-detail-sheet.tsx`
- Test: `tests/unit/components/club/occupancy-detail-sheet.test.tsx`

- [ ] **Step 1: Test que falla**

`tests/unit/components/club/occupancy-detail-sheet.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OccupancyDetailSheet, type DetailActions } from '@/components/club/occupancy-detail-sheet'
import type { FormAction } from '@/components/ui/action-form'
import type { GridCell } from '@/lib/domain/grid'
import { booking, makeGrid, occupancy, TIMEZONE } from '../../fixtures/grid'

const booked = makeGrid({
  occupancies: [occupancy('o1', 'court-1', '08:00', '09:30')],
  bookings: [booking('o1', { holderName: 'Rodríguez', amountDue: 1200 })],
}).rows[0].cells[0]
const blocked = makeGrid({
  occupancies: [occupancy('blk', 'court-2', '08:00', '11:00', 'block', 'Clase de Pablo')],
}).rows[0].cells[1]

function renderDetail(cell: GridCell, acceptsCash = true) {
  const done = async () => ({ status: 'ok' as const, message: 'Listo.' })
  const actions: DetailActions = {
    cancel: vi.fn<FormAction>(done),
    unblock: vi.fn<FormAction>(done),
    cash: vi.fn<FormAction>(done),
  }
  const onDone = vi.fn()
  render(
    <OccupancyDetailSheet
      cell={cell}
      occupancy={cell.occupancy!}
      dayText="jueves 1 de octubre"
      timezone={TIMEZONE}
      acceptsCash={acceptsCash}
      actions={actions}
      onClose={vi.fn()}
      onDone={onDone}
    />,
  )
  const sent = (action: FormAction) => Object.fromEntries(vi.mocked(action).mock.calls[0][1].entries())
  return { actions, onDone, sent }
}

describe('OccupancyDetailSheet', () => {
  it('shows holder, time, source and payment', () => {
    renderDetail(booked)
    const dialog = screen.getByRole('dialog', { name: 'Rodríguez' })
    expect(dialog).toHaveTextContent('Reserva, Cancha 1, jueves 1 de octubre, 08:00 a 09:30, cargada en recepción')
    expect(dialog).toHaveTextContent('Pendiente de pago')
    expect(dialog).toHaveTextContent('$1.200')
  })

  it('records cash for what is due', async () => {
    const { actions, sent } = renderDetail(booked)
    expect(screen.getByLabelText('Monto')).toHaveValue(1200)
    await userEvent.click(screen.getByRole('button', { name: 'Cobrar en efectivo' }))
    await waitFor(() => expect(actions.cash).toHaveBeenCalledTimes(1))
    expect(sent(actions.cash)).toEqual({ bookingId: 'b-o1', amount: '1200' })
  })

  it('cancels the booking', async () => {
    const { actions, onDone, sent } = renderDetail(booked)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Listo.'))
    expect(sent(actions.cancel)).toEqual({ bookingId: 'b-o1' })
  })

  it('hides cash when the club does not take it', () => {
    renderDetail(booked, false)
    expect(screen.queryByRole('button', { name: 'Cobrar en efectivo' })).not.toBeInTheDocument()
  })

  it('frees a blocked court', async () => {
    const { actions, sent } = renderDetail(blocked)
    expect(screen.getByRole('dialog', { name: 'Clase de Pablo' })).toHaveTextContent('08:00 a 11:00')
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Liberar cancha' }))
    await waitFor(() => expect(actions.unblock).toHaveBeenCalledTimes(1))
    expect(sent(actions.unblock)).toEqual({ occupancyId: 'blk' })
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/unit/components/club/occupancy-detail-sheet.test.tsx`
Expected: FAIL con `Failed to resolve import "@/components/club/occupancy-detail-sheet"`.

- [ ] **Step 3: Implementación**

`components/club/occupancy-detail-sheet.tsx`:
```tsx
'use client'

import { PaymentBadge } from '@/components/booking/payment-badge'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'
import { formatPrice, timeIn } from '@/lib/domain/format'
import { KIND_LABELS, type GridCell, type Occupancy } from '@/lib/domain/grid'

export type DetailActions = { cancel: FormAction; unblock: FormAction; cash: FormAction }

export function OccupancyDetailSheet({
  cell,
  occupancy,
  dayText,
  timezone,
  acceptsCash,
  actions,
  onClose,
  onDone,
}: {
  cell: GridCell
  occupancy: Occupancy
  dayText: string
  timezone: string
  acceptsCash: boolean
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
        {booking ? (
          <>
            <div className="flex items-center gap-3">
              <PaymentBadge state={booking.paymentState} />
              <span>{formatPrice(booking.price)}</span>
            </div>
            {acceptsCash && booking.amountDue > 0 ? (
              <ActionForm action={actions.cash} submitLabel="Cobrar en efectivo" pendingLabel="Registrando…" onDone={onDone}>
                <input type="hidden" name="bookingId" value={booking.id} />
                <Field label="Monto" htmlFor="amount">
                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={booking.amountDue}
                    required
                    defaultValue={booking.amountDue}
                    className={inputClasses}
                  />
                </Field>
              </ActionForm>
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
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run tests/unit/components/club/occupancy-detail-sheet.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add components/club/occupancy-detail-sheet.tsx tests/unit/components/club/occupancy-detail-sheet.test.tsx
git commit -m "feat(club): add occupied court detail with cash, cancel and unblock"
```

---

### Task 39: Pantalla Grilla

**Files:**
- Create: `lib/data/members.ts`
- Create: `app/(club)/club/grilla/page.tsx`, `app/(club)/club/grilla/actions.ts`, `app/(club)/club/grilla/club-board.tsx`

# (no unit test nuevo — piezas ya probadas; el flujo 2 recorre la pantalla)

- [ ] **Step 1: Opciones de jugadores**

`lib/data/members.ts`:
```ts
import 'server-only'
import type { MemberOption } from '@/lib/domain/members'
import { createClient } from '@/lib/supabase/server'

export async function loadMemberOptions(clubId: string): Promise<MemberOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('club_members')
    .select('user_id, profile:profiles(display_name)')
    .eq('club_id', clubId)
  if (error) throw error
  return data
    .map((member) => ({ userId: member.user_id, name: member.profile?.display_name ?? 'Sin nombre' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}
```

- [ ] **Step 2: Server Actions**

`app/(club)/club/grilla/actions.ts`:
```ts
'use server'

import { fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { readEnum, readInstant, readInt, readText, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

const LOAD_KINDS = ['booking', 'block'] as const

function readHolder(form: FormData): { p_player_id: string } | { p_guest_name: string } | null {
  if (form.get('holder') === 'player') {
    const playerId = readUuid(form, 'playerId')
    return playerId ? { p_player_id: playerId } : null
  }
  const guestName = readText(form, 'guestName', { maxLength: 60 })
  return guestName ? { p_guest_name: guestName } : null
}

export async function loadSlot(_previous: ActionState, form: FormData): Promise<ActionState> {
  const kind = readEnum(form, 'kind', LOAD_KINDS)
  const courtId = readUuid(form, 'courtId')
  const startsAt = readInstant(form, 'startsAt')
  if (!kind || !courtId || !startsAt) return INVALID_INPUT
  const supabase = await createClient()

  if (kind === 'block') {
    const endsAt = readInstant(form, 'endsAt')
    if (!endsAt) return INVALID_INPUT
    const { error } = await supabase.rpc('block_court', {
      p_court_id: courtId,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_note: readText(form, 'note', { maxLength: 80 }) ?? undefined,
    })
    revalidateBookings()
    return fromRpc(error, 'Bloqueo cargado.')
  }

  const holder = readHolder(form)
  if (!holder) return INVALID_INPUT
  const { error } = await supabase.rpc('staff_book', { p_court_id: courtId, p_starts_at: startsAt, ...holder })
  revalidateBookings()
  return fromRpc(error, 'Reserva cargada.')
}

export async function cancelBooking(_previous: ActionState, form: FormData): Promise<ActionState> {
  const bookingId = readUuid(form, 'bookingId')
  if (!bookingId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId })
  revalidateBookings()
  return fromRpc(error, 'Reserva cancelada. La cancha quedó libre.')
}

export async function unblockCourt(_previous: ActionState, form: FormData): Promise<ActionState> {
  const occupancyId = readUuid(form, 'occupancyId')
  if (!occupancyId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('unblock', { p_occupancy_id: occupancyId })
  revalidateBookings()
  return fromRpc(error, 'Cancha liberada.')
}

export async function recordCash(_previous: ActionState, form: FormData): Promise<ActionState> {
  const bookingId = readUuid(form, 'bookingId')
  const amount = readInt(form, 'amount', { min: 1, max: 10_000_000 })
  if (!bookingId || amount === null) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('record_cash', { p_booking_id: bookingId, p_amount: amount })
  revalidateBookings()
  return fromRpc(error, 'Pago en efectivo registrado.')
}
```

- [ ] **Step 3: Tablero (cliente)**

`app/(club)/club/grilla/club-board.tsx`:
```tsx
'use client'

import { useCallback, useState } from 'react'
import { Legend } from '@/components/booking/legend'
import { SlotGrid } from '@/components/booking/slot-grid'
import { LoadSheet } from '@/components/club/load-sheet'
import { OccupancyDetailSheet, type DetailActions } from '@/components/club/occupancy-detail-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { timeIn } from '@/lib/domain/format'
import { KIND_LABELS, type DayGrid, type GridCell } from '@/lib/domain/grid'
import type { MemberOption } from '@/lib/domain/members'
import type { LocalDate } from '@/lib/domain/time'

export function ClubBoard({
  date,
  dayText,
  timezone,
  grid,
  members,
  acceptsCash,
  loadAction,
  detailActions,
}: {
  date: LocalDate
  dayText: string
  timezone: string
  grid: DayGrid
  members: MemberOption[]
  acceptsCash: boolean
  loadAction: FormAction
  detailActions: DetailActions
}) {
  const [selected, setSelected] = useState<GridCell | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setSelected(null), [])
  const done = useCallback((message: string) => {
    setSelected(null)
    setNotice(message)
  }, [])
  const courtName = (courtId: string) => grid.courts.find((court) => court.id === courtId)?.name ?? 'Cancha'

  return (
    <section aria-labelledby="grilla" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="grilla" className="font-display text-2xl font-bold uppercase">
          Grilla de canchas
        </h2>
        <Legend variant="club" />
      </div>
      {notice ? (
        <p role="status" className="rounded-xl border border-accent bg-surface p-3">
          {notice}
        </p>
      ) : null}
      <SlotGrid
        courts={grid.courts}
        rows={grid.rows}
        variant="club"
        onSelect={(cell) => {
          setNotice(null)
          setSelected(cell)
        }}
      />
      <p className="text-sm text-fg-muted">Tocá una cancha libre para cargar una reserva, o una ocupada para ver el detalle.</p>
      {grid.outside.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold">Fuera de la grilla</h3>
          <ul className="text-sm">
            {grid.outside.map((o) => (
              <li key={o.id}>
                {courtName(o.courtId)}, {timeIn(o.startsAt, timezone)} a {timeIn(o.endsAt, timezone)}:{' '}
                {o.note ?? KIND_LABELS[o.kind]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {selected && !selected.occupancy ? (
        <LoadSheet
          cell={selected}
          date={date}
          dayText={dayText}
          rows={grid.rows}
          members={members}
          action={loadAction}
          onClose={close}
          onDone={done}
        />
      ) : null}
      {selected?.occupancy ? (
        <OccupancyDetailSheet
          cell={selected}
          occupancy={selected.occupancy}
          dayText={dayText}
          timezone={timezone}
          acceptsCash={acceptsCash}
          actions={detailActions}
          onClose={close}
          onDone={done}
        />
      ) : null}
    </section>
  )
}
```

- [ ] **Step 4: Página**

`app/(club)/club/grilla/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { DayStrip } from '@/components/booking/day-strip'
import { Card } from '@/components/ui/card'
import { requireStaff } from '@/lib/auth/viewer'
import { loadDayGrid } from '@/lib/data/day'
import { loadMemberOptions } from '@/lib/data/members'
import { dayLabel, dayLongLabel, formatPrice } from '@/lib/domain/format'
import { dayStats } from '@/lib/domain/grid'
import { isLocalDate } from '@/lib/domain/input'
import { addDays, localDateOf } from '@/lib/domain/time'
import { cancelBooking, loadSlot, recordCash, unblockCourt } from './actions'
import { ClubBoard } from './club-board'

export const metadata: Metadata = { title: 'Grilla' }

type SearchParams = Promise<{ dia?: string }>

export default async function GridPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireStaff('/club/grilla')
  const { club } = viewer
  const { dia } = await searchParams
  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const date = isLocalDate(dia) ? dia : today
  // The strip starts today; a date picked from the calendar outside it starts its own strip.
  const stripStart = date >= today && date <= addDays(today, 6) ? today : date
  const days = Array.from({ length: 7 }, (_, index) => addDays(stripStart, index))

  const [grid, members] = await Promise.all([loadDayGrid(club, date, viewer.userId, now), loadMemberOptions(club.id)])
  const stats = dayStats(grid)

  return (
    <>
      <DayStrip days={days.map((day) => ({ date: day, label: dayLabel(day, today) }))} selected={date} basePath="/club/grilla" />
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="font-display text-3xl font-bold">{stats.occupancyPercent}%</p>
          <p className="text-sm text-fg-muted">Ocupación del día</p>
        </Card>
        <Card>
          <p className="font-display text-3xl font-bold">{formatPrice(stats.revenue)}</p>
          <p className="text-sm text-fg-muted">Ingresos por canchas</p>
        </Card>
      </div>
      <ClubBoard
        key={date}
        date={date}
        dayText={dayLongLabel(date)}
        timezone={club.timezone}
        grid={grid}
        members={members}
        acceptsCash={club.accepts_cash}
        loadAction={loadSlot}
        detailActions={{ cancel: cancelBooking, unblock: unblockCourt, cash: recordCash }}
      />
    </>
  )
}
```

- [ ] **Step 5: Verificar**

Run:
```bash
npm run typecheck
npm run lint
npx playwright test tests/e2e/reception-grid.spec.ts
```
Expected: typecheck y lint en verde. El flujo 2 ve la celda con "Transferencia informada" y falla en el link "Cobros" (la pestaña apunta a `/club/cobros`, que todavía da 404).

- [ ] **Step 6: Commit**

```bash
git add lib/data/members.ts "app/(club)/club/grilla"
git commit -m "feat(club): add live day grid with load, detail, cash and cancel"
```

---

### Task 40: Pantalla Cobros

**Files:**
- Create: `app/(club)/club/cobros/page.tsx`, `app/(club)/club/cobros/actions.ts`, `app/(club)/club/cobros/transfer-review-card.tsx`
- Test: `tests/unit/app/cobros/transfer-review-card.test.tsx`

- [ ] **Step 1: Test que falla**

`tests/unit/app/cobros/transfer-review-card.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TransferReviewCard, type TransferView } from '@/app/(club)/club/cobros/transfer-review-card'
import type { FormAction } from '@/components/ui/action-form'

const TRANSFER: TransferView = {
  id: 'p1',
  amount: 1600,
  holder: 'Martina',
  when: 'sábado 3 de octubre, 20:00',
  courtName: 'Cancha 2',
  receiptUrl: 'https://example.test/signed',
}

function renderCard(transfer: TransferView = TRANSFER) {
  const confirmAction = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Pago confirmado.' }))
  const rejectAction = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Transferencia rechazada.' }))
  render(<TransferReviewCard transfer={transfer} confirmAction={confirmAction} rejectAction={rejectAction} />)
  return { confirmAction, rejectAction }
}

describe('TransferReviewCard', () => {
  it('shows who, when, how much and the receipt', () => {
    renderCard()
    expect(screen.getByText('Martina')).toBeInTheDocument()
    expect(screen.getByText('sábado 3 de octubre, 20:00, Cancha 2')).toBeInTheDocument()
    expect(screen.getByText('$1.600')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver comprobante' })).toHaveAttribute('href', 'https://example.test/signed')
  })

  it('confirms the payment', async () => {
    const { confirmAction } = renderCard()
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(confirmAction).toHaveBeenCalledTimes(1))
    expect(confirmAction.mock.calls[0][1].get('paymentId')).toBe('p1')
    expect(await screen.findByRole('status')).toHaveTextContent('Pago confirmado.')
  })

  it('asks for a reason before rejecting', async () => {
    const { rejectAction } = renderCard()
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }))
    await userEvent.type(screen.getByLabelText('Motivo'), 'No llegó')
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar transferencia' }))
    await waitFor(() => expect(rejectAction).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(rejectAction.mock.calls[0][1].entries())).toEqual({ paymentId: 'p1', reason: 'No llegó' })
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/unit/app/cobros/transfer-review-card.test.tsx`
Expected: FAIL con `Failed to resolve import "@/app/(club)/club/cobros/transfer-review-card"`.

- [ ] **Step 3: Tarjeta**

`app/(club)/club/cobros/transfer-review-card.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, inputClasses } from '@/components/ui/field'
import { formatPrice } from '@/lib/domain/format'

export type TransferView = {
  id: string
  amount: number
  holder: string
  when: string
  courtName: string
  receiptUrl: string | null
}

export function TransferReviewCard({
  transfer,
  confirmAction,
  rejectAction,
}: {
  transfer: TransferView
  confirmAction: FormAction
  rejectAction: FormAction
}) {
  const [rejecting, setRejecting] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  if (done) {
    return (
      <Card>
        <p role="status">{done}</p>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="font-semibold">{transfer.holder}</p>
        <p className="text-fg-muted">
          {transfer.when}, {transfer.courtName}
        </p>
        <p className="font-display text-2xl font-bold">{formatPrice(transfer.amount)}</p>
      </div>
      {transfer.receiptUrl ? (
        <a href={transfer.receiptUrl} target="_blank" rel="noreferrer" className="font-semibold text-accent-ink underline">
          Ver comprobante
        </a>
      ) : (
        <p className="text-sm text-fg-muted">Sin comprobante</p>
      )}
      <ActionForm action={confirmAction} submitLabel="Confirmar" pendingLabel="Confirmando…" onDone={setDone}>
        <input type="hidden" name="paymentId" value={transfer.id} />
      </ActionForm>
      {rejecting ? (
        <ActionForm action={rejectAction} submitLabel="Rechazar transferencia" variant="secondary" onDone={setDone}>
          <input type="hidden" name="paymentId" value={transfer.id} />
          <Field label="Motivo" htmlFor={`reason-${transfer.id}`}>
            <input
              id={`reason-${transfer.id}`}
              name="reason"
              maxLength={120}
              placeholder="Ej: No llegó a la cuenta"
              className={inputClasses}
            />
          </Field>
        </ActionForm>
      ) : (
        <Button variant="ghost" onClick={() => setRejecting(true)}>
          Rechazar
        </Button>
      )}
    </Card>
  )
}
```

- [ ] **Step 4: Server Actions**

`app/(club)/club/cobros/actions.ts`:
```ts
'use server'

import { fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { readText, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

export async function confirmPayment(_previous: ActionState, form: FormData): Promise<ActionState> {
  const paymentId = readUuid(form, 'paymentId')
  if (!paymentId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('confirm_payment', { p_payment_id: paymentId })
  revalidateBookings()
  return fromRpc(error, 'Pago confirmado.')
}

export async function rejectPayment(_previous: ActionState, form: FormData): Promise<ActionState> {
  const paymentId = readUuid(form, 'paymentId')
  if (!paymentId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('reject_payment', {
    p_payment_id: paymentId,
    p_reason: readText(form, 'reason', { maxLength: 120 }) ?? undefined,
  })
  revalidateBookings()
  return fromRpc(error, 'Transferencia rechazada. El jugador ve el motivo.')
}

export async function refundPayment(_previous: ActionState, form: FormData): Promise<ActionState> {
  const paymentId = readUuid(form, 'paymentId')
  if (!paymentId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('refund_payment', { p_payment_id: paymentId })
  revalidateBookings()
  return fromRpc(error, 'Devolución registrada.')
}
```

- [ ] **Step 5: Página**

`app/(club)/club/cobros/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { ActionForm } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import { requireStaff } from '@/lib/auth/viewer'
import { dayLongLabel, formatPrice, timeIn } from '@/lib/domain/format'
import { holderName } from '@/lib/domain/grid'
import { amountDue, paymentState } from '@/lib/domain/payments'
import { localDateOf, toDate } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'
import { recordCash } from '../grilla/actions'
import { confirmPayment, refundPayment, rejectPayment } from './actions'
import { TransferReviewCard, type TransferView } from './transfer-review-card'

export const metadata: Metadata = { title: 'Cobros' }

const BOOKING_FIELDS =
  'id, starts_at, price, status, guest_name, court:courts(name), player:profiles!bookings_player_id_fkey(display_name), payments(id, status, amount)'

export default async function PaymentsPage() {
  const viewer = await requireStaff('/club/cobros')
  const { club } = viewer
  const supabase = await createClient()
  const now = new Date()
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString()

  const [reported, played, cancelled] = await Promise.all([
    supabase
      .from('payments')
      .select(
        'id, amount, receipt_path, booking:bookings(starts_at, guest_name, court:courts(name), player:profiles!bookings_player_id_fkey(display_name))',
      )
      .eq('club_id', club.id)
      .eq('status', 'reported')
      .order('created_at'),
    supabase
      .from('bookings')
      .select(BOOKING_FIELDS)
      .eq('club_id', club.id)
      .eq('status', 'confirmed')
      .lt('ends_at', now.toISOString())
      .gt('ends_at', since)
      .order('starts_at', { ascending: false }),
    supabase
      .from('bookings')
      .select(BOOKING_FIELDS)
      .eq('club_id', club.id)
      .eq('status', 'cancelled')
      .gt('starts_at', since)
      .order('starts_at', { ascending: false }),
  ])
  if (reported.error) throw reported.error
  if (played.error) throw played.error
  if (cancelled.error) throw cancelled.error

  // Receipts are private: short-lived signed URLs, read with the staff session.
  const signedUrls = new Map<string, string>()
  const paths = reported.data.flatMap((payment) => (payment.receipt_path ? [payment.receipt_path] : []))
  if (paths.length > 0) {
    const { data: signed, error } = await supabase.storage.from('receipts').createSignedUrls(paths, 300)
    if (error) throw error
    for (const item of signed ?? []) if (item.path && item.signedUrl) signedUrls.set(item.path, item.signedUrl)
  }

  const when = (startsAt: string | null) => {
    const start = toDate(startsAt)
    return `${dayLongLabel(localDateOf(start, club.timezone))}, ${timeIn(start, club.timezone)}`
  }
  const transfers: TransferView[] = reported.data.map((payment) => ({
    id: payment.id,
    amount: payment.amount,
    holder: holderName(payment.booking?.guest_name ?? null, payment.booking?.player?.display_name ?? null) ?? 'Sin nombre',
    when: payment.booking ? when(payment.booking.starts_at) : '',
    courtName: payment.booking?.court?.name ?? '',
    receiptUrl: payment.receipt_path ? (signedUrls.get(payment.receipt_path) ?? null) : null,
  }))
  const unpaid = played.data.filter((booking) => paymentState(booking, booking.payments) === 'pending')
  const refunds = cancelled.data.flatMap((booking) =>
    booking.payments
      .filter((payment) => payment.status === 'confirmed')
      .map((payment) => ({ booking, payment })),
  )
  const holderOf = (booking: (typeof played.data)[number]) =>
    holderName(booking.guest_name, booking.player?.display_name ?? null) ?? 'Sin nombre'

  return (
    <>
      <section aria-labelledby="transferencias" className="flex flex-col gap-3">
        <h2 id="transferencias" className="font-display text-2xl font-bold uppercase">
          Transferencias para confirmar
        </h2>
        {transfers.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {transfers.map((transfer) => (
              <li key={transfer.id}>
                <TransferReviewCard transfer={transfer} confirmAction={confirmPayment} rejectAction={rejectPayment} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">No hay transferencias para confirmar.</p>
        )}
      </section>

      <section aria-labelledby="sin-pagar" className="flex flex-col gap-3">
        <h2 id="sin-pagar" className="font-display text-2xl font-bold uppercase">
          Reservas jugadas sin pagar
        </h2>
        {unpaid.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {unpaid.map((booking) => {
              const due = amountDue(booking.price, booking.payments)
              return (
                <li key={booking.id}>
                  <Card className="flex flex-col gap-2">
                    <p className="font-semibold">{holderOf(booking)}</p>
                    <p className="text-fg-muted">
                      {when(booking.starts_at)}, {booking.court?.name}. Debe {formatPrice(due)}.
                    </p>
                    {club.accepts_cash ? (
                      <ActionForm action={recordCash} submitLabel="Cobrar en efectivo" variant="secondary">
                        <input type="hidden" name="bookingId" value={booking.id} />
                        <input type="hidden" name="amount" value={due} />
                      </ActionForm>
                    ) : null}
                  </Card>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-fg-muted">Nada pendiente en los últimos 30 días.</p>
        )}
      </section>

      <section aria-labelledby="devolver" className="flex flex-col gap-3">
        <h2 id="devolver" className="font-display text-2xl font-bold uppercase">
          Pagos a devolver
        </h2>
        {refunds.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {refunds.map(({ booking, payment }) => (
              <li key={payment.id}>
                <Card className="flex flex-col gap-2">
                  <p className="font-semibold">{holderOf(booking)}</p>
                  <p className="text-fg-muted">
                    Canceló {when(booking.starts_at)}, {booking.court?.name}. Pagó {formatPrice(payment.amount)}.
                  </p>
                  <ActionForm action={refundPayment} submitLabel="Marcar devuelto" variant="secondary">
                    <input type="hidden" name="paymentId" value={payment.id} />
                  </ActionForm>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">No hay devoluciones pendientes.</p>
        )}
      </section>
    </>
  )
}
```

- [ ] **Step 6: Correr y ver que pasa**

Run:
```bash
npx vitest run tests/unit/app/cobros/transfer-review-card.test.tsx
npm run typecheck
npm run lint
```
Expected: PASS (3 tests), typecheck y lint en verde.

- [ ] **Step 7: Commit**

```bash
git add "app/(club)/club/cobros" tests/unit/app/cobros
git commit -m "feat(club): add payments screen to confirm, reject, charge and refund"
```

---

### Task 41: Flujo 2 en verde

**Files:** ninguno nuevo.

- [ ] **Step 1: Correr el flujo y la suite**

Run:
```bash
npx playwright test tests/e2e/reception-grid.spec.ts
npm test
npx playwright test
```
Expected: flujo 2 en verde; los cuatro specs (smoke, flujos 1, 2 y 3) pasan juntos en paralelo. Si el flujo 2 choca con datos de una corrida anterior, verificar que el `globalSetup` corrió (lista "Running global setup" en la salida) y que no hay reservas manuales en el día +4 del Supabase local.

- [ ] **Step 2: Revisión y push**

Correr `/team-setup:discipline-check` sobre los cortes 3 y 4, arreglar lo que marque en commits aparte, y:
```bash
git push
```
Expected: CI en verde.

---
## Corte 5: Turnos fijos y calendario

### Task 42: Turno fijo desde la grilla

**Files:**
- Create: `lib/domain/series.ts`
- Test: `tests/unit/lib/domain/series.test.ts`
- Modify: `components/club/load-sheet.tsx`, `tests/unit/components/club/load-sheet.test.tsx`
- Modify: `components/club/occupancy-detail-sheet.tsx`, `tests/unit/components/club/occupancy-detail-sheet.test.tsx`
- Modify: `app/(club)/club/grilla/actions.ts`, `app/(club)/club/grilla/club-board.tsx`, `app/(club)/club/grilla/page.tsx`

- [ ] **Step 1: Test del mensaje de la serie (falla)**

`tests/unit/lib/domain/series.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { seriesCreatedMessage, shortDate, SKIP_REASON_LABELS } from '@/lib/domain/series'

describe('shortDate', () => {
  it('writes the weekday and day/month', () => {
    expect(shortDate('2026-10-15')).toBe('jue 15/10')
  })
})

describe('seriesCreatedMessage', () => {
  it('confirms the series when every date was free', () => {
    expect(seriesCreatedMessage([])).toBe('Turno fijo cargado para las próximas 8 semanas.')
  })

  it('lists the dates it had to skip and why', () => {
    expect(
      seriesCreatedMessage([
        { on_date: '2026-10-15', reason: 'slot_taken' },
        { on_date: '2026-10-22', reason: 'no_price' },
      ]),
    ).toBe('Turno fijo cargado. Salteamos 2 fechas: jue 15/10 (la cancha estaba ocupada), jue 22/10 (no había precio).')
  })

  it('names every skip reason', () => {
    expect(Object.keys(SKIP_REASON_LABELS).sort()).toEqual(['no_price', 'not_aligned', 'slot_taken'])
  })
})
```

Run: `npx vitest run tests/unit/lib/domain/series.test.ts`
Expected: FAIL con `Failed to resolve import "@/lib/domain/series"`.

- [ ] **Step 2: Implementación del mensaje**

`lib/domain/series.ts`:
```ts
import { WEEKDAYS_SHORT } from './format'
import { parseLocalDate, weekdayOf, type LocalDate } from './time'

export type SkipReason = 'slot_taken' | 'no_price' | 'not_aligned'

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  slot_taken: 'la cancha estaba ocupada',
  no_price: 'no había precio',
  not_aligned: 'el horario ya no está en la grilla',
}

export function shortDate(date: LocalDate): string {
  const { day, month } = parseLocalDate(date)
  return `${WEEKDAYS_SHORT[weekdayOf(date)]} ${day}/${month}`
}

function reasonLabel(reason: string): string {
  return Object.hasOwn(SKIP_REASON_LABELS, reason) ? SKIP_REASON_LABELS[reason as SkipReason] : reason
}

// What reception sees after loading a series: create_series returns the dates it skipped.
export function seriesCreatedMessage(skips: { on_date: string; reason: string }[]): string {
  if (skips.length === 0) return 'Turno fijo cargado para las próximas 8 semanas.'
  const dates = skips.map((skip) => `${shortDate(skip.on_date)} (${reasonLabel(skip.reason)})`).join(', ')
  return `Turno fijo cargado. Salteamos ${skips.length} ${skips.length === 1 ? 'fecha' : 'fechas'}: ${dates}.`
}
```

Run: `npx vitest run tests/unit/lib/domain/series.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 3: Tests de las hojas (fallan)**

En `tests/unit/components/club/load-sheet.test.tsx`, cambiar el import de Testing Library a `import { fireEvent, render, screen, waitFor } from '@testing-library/react'` y agregar dentro del `describe('LoadSheet', …)` (la fecha se carga con `fireEvent.change` porque jsdom no tipea en `input[type=date]` como un navegador):
```tsx
  it('loads a recurring slot, optionally with an end date', async () => {
    const { action, sent } = renderSheet()
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Turno fijo')
    await userEvent.type(screen.getByLabelText('A nombre de', { exact: true }), 'Rodríguez')
    fireEvent.change(screen.getByLabelText('Hasta (opcional)'), { target: { value: '2026-12-31' } })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(sent()).toMatchObject({
      kind: 'series',
      guestName: 'Rodríguez',
      date: DATE,
      startTime: '08:00',
      endsOn: '2026-12-31',
    })
  })
```

En `tests/unit/components/club/occupancy-detail-sheet.test.tsx`:
1. Agregar `endSeries: vi.fn<FormAction>(done),` al objeto `actions` de `renderDetail`.
2. Agregar la prop `date="2026-10-01"` al `<OccupancyDetailSheet …>` de `renderDetail`.
3. Agregar este test dentro del `describe`:
```tsx
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
```

Run: `npx vitest run tests/unit/components/club`
Expected: FAIL: no existe la opción "Turno fijo", ni la prop `endSeries` (typecheck de Vitest no corre, pero el test no encuentra el botón).

- [ ] **Step 4: `LoadSheet` con turno fijo**

En `components/club/load-sheet.tsx`:

Cambiar el tipo:
```tsx
type LoadKind = 'booking' | 'series' | 'block'
```

Después de `<input type="hidden" name="date" value={date} />` agregar:
```tsx
        <input type="hidden" name="startTime" value={cell.slot.label} />
```

En el `<select id="kind" …>`, entre las opciones `Reserva` y `Bloqueo`, agregar:
```tsx
            <option value="series">Turno fijo</option>
```

Reemplazar la rama final:
```tsx
        ) : (
          <HolderFields holder={holder} onHolderChange={setHolder} members={members} />
        )}
```
por:
```tsx
        ) : (
          <>
            <HolderFields holder={holder} onHolderChange={setHolder} members={members} />
            {kind === 'series' ? (
              <>
                <Field label="Hasta (opcional)" htmlFor="endsOn">
                  <input id="endsOn" name="endsOn" type="date" min={date} className={inputClasses} />
                </Field>
                <p className="text-sm text-fg-muted">
                  Se repite todas las semanas a esta hora. Reservamos 8 semanas adelante y seguimos cada día.
                </p>
              </>
            ) : null}
          </>
        )}
```

- [ ] **Step 5: Detalle con "Terminar turno fijo"**

En `components/club/occupancy-detail-sheet.tsx`:

Cambiar el tipo:
```tsx
export type DetailActions = { cancel: FormAction; unblock: FormAction; cash: FormAction; endSeries: FormAction }
```

Agregar la prop `date` (import `type LocalDate` de `@/lib/domain/time`): en la desestructuración, después de `occupancy,` agregar `date,`; en el tipo de props, después de `occupancy: Occupancy` agregar `date: LocalDate`.

Después del `ActionForm` de "Cancelar reserva" (dentro del fragmento de `booking`), agregar:
```tsx
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
```

En `app/(club)/club/grilla/club-board.tsx`, agregar `date={date}` al `<OccupancyDetailSheet …>`.

- [ ] **Step 6: Server Actions**

En `app/(club)/club/grilla/actions.ts`:

Reemplazar los imports y `LOAD_KINDS` por:
```ts
import { fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { readEnum, readInstant, readInt, readLocalDate, readText, readTime, readUuid } from '@/lib/domain/input'
import { seriesCreatedMessage } from '@/lib/domain/series'
import { weekdayOf } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'

const LOAD_KINDS = ['booking', 'series', 'block'] as const
```

En `loadSlot`, antes de `const holder = readHolder(form)`, agregar:
```ts
  if (kind === 'series') {
    const date = readLocalDate(form, 'date')
    const startTime = readTime(form, 'startTime')
    const holder = readHolder(form)
    const endsOnRaw = form.get('endsOn')
    const endsOn = endsOnRaw ? readLocalDate(form, 'endsOn') : null
    if (!date || !startTime || !holder || (endsOnRaw && !endsOn)) return INVALID_INPUT
    const { data, error } = await supabase.rpc('create_series', {
      p_court_id: courtId,
      p_weekday: weekdayOf(date),
      p_start_time: startTime,
      p_starts_on: date,
      p_ends_on: endsOn ?? undefined,
      ...holder,
    })
    revalidateBookings()
    if (error) return fromRpc(error, '')
    return ok(seriesCreatedMessage(data ?? []))
  }

```

Al final del archivo, agregar:
```ts
export async function endSeries(_previous: ActionState, form: FormData): Promise<ActionState> {
  const seriesId = readUuid(form, 'seriesId')
  const fromDate = readLocalDate(form, 'fromDate')
  if (!seriesId || !fromDate) return INVALID_INPUT
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('end_series', { p_series_id: seriesId, p_from_date: fromDate })
  revalidateBookings()
  if (error) return fromRpc(error, '')
  return ok(data === 1 ? 'Turno fijo terminado. Cancelamos 1 reserva.' : `Turno fijo terminado. Cancelamos ${data} reservas.`)
}
```

En `app/(club)/club/grilla/page.tsx`, importar `endSeries` desde `./actions` y cambiar `detailActions` por:
```tsx
        detailActions={{ cancel: cancelBooking, unblock: unblockCourt, cash: recordCash, endSeries }}
```

- [ ] **Step 7: Correr y ver que pasa**

Run:
```bash
npx vitest run tests/unit/components/club tests/unit/lib/domain/series.test.ts
npm run typecheck
npm run lint
```
Expected: PASS (5 + 6 + 4 tests), typecheck y lint en verde.

- [ ] **Step 8: Commit**

```bash
git add lib/domain/series.ts components/club "app/(club)/club/grilla" tests/unit
git commit -m "feat(club): load and end recurring slots from the grid"
```

---

### Task 43: Mes y semana (`lib/domain/calendar.ts`)

**Files:**
- Create: `lib/domain/calendar.ts`
- Test: `tests/unit/lib/domain/calendar.test.ts`

- [ ] **Step 1: Test que falla**

`tests/unit/lib/domain/calendar.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { addMonths, isMonth, monthGrid, monthOf, summarizeDays, weekOf } from '@/lib/domain/calendar'

describe('monthGrid', () => {
  it('covers the month in weeks that start on Monday', () => {
    const weeks = monthGrid('2026-10')
    expect(weeks).toHaveLength(5)
    expect(weeks[0][0]).toBe('2026-09-28')
    expect(weeks[4][6]).toBe('2026-11-01')
    expect(weeks.every((week) => week.length === 7)).toBe(true)
  })

  it('starts on the first when the month starts on Monday', () => {
    expect(monthGrid('2026-06')[0][0]).toBe('2026-06-01')
  })
})

describe('weeks and months', () => {
  it('returns Monday to Sunday', () => {
    expect(weekOf('2026-10-01')).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ])
  })

  it('moves between months', () => {
    expect(monthOf('2026-10-01')).toBe('2026-10')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })

  it('recognizes a month parameter', () => {
    expect(isMonth('2026-10')).toBe(true)
    expect(isMonth('2026-13')).toBe(false)
    expect(isMonth(undefined)).toBe(false)
  })
})

describe('summarizeDays', () => {
  it('counts occupancies and recurring slots per day on the club clock', () => {
    const summary = summarizeDays(
      [
        { startsAt: new Date('2026-10-01T11:00:00Z'), kind: 'booking' },
        { startsAt: new Date('2026-10-01T23:00:00Z'), kind: 'recurring' },
        { startsAt: new Date('2026-10-02T02:00:00Z'), kind: 'block' },
      ],
      'America/Montevideo',
      30,
    )
    expect(summary.get('2026-10-01')).toEqual({ occupied: 3, recurring: 1, percent: 10 })
    expect(summary.get('2026-10-02')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/unit/lib/domain/calendar.test.ts`
Expected: FAIL con `Failed to resolve import "@/lib/domain/calendar"`.

- [ ] **Step 3: Implementación**

`lib/domain/calendar.ts`:
```ts
import type { OccupancyKind } from './grid'
import { addDays, localDateOf, weekdayOf, type LocalDate } from './time'

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export function isMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH.test(value)
}

export function monthOf(date: LocalDate): string {
  return date.slice(0, 7)
}

export function addMonths(month: string, count: number): string {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number - 1 + count, 1)).toISOString().slice(0, 7)
}

function mondayOf(date: LocalDate): LocalDate {
  return addDays(date, -((weekdayOf(date) + 6) % 7))
}

export function weekOf(date: LocalDate): LocalDate[] {
  const monday = mondayOf(date)
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}

// Monday-first weeks that cover the whole month.
export function monthGrid(month: string): LocalDate[][] {
  const weeks: LocalDate[][] = []
  let monday = mondayOf(`${month}-01`)
  do {
    weeks.push(weekOf(monday))
    monday = addDays(monday, 7)
  } while (monthOf(monday) === month)
  return weeks
}

export type DaySummary = { occupied: number; recurring: number; percent: number }

// capacityPerDay = slots per day × active courts. A long block counts once.
export function summarizeDays(
  occupancies: { startsAt: Date; kind: OccupancyKind }[],
  timezone: string,
  capacityPerDay: number,
): Map<LocalDate, DaySummary> {
  const summary = new Map<LocalDate, DaySummary>()
  for (const occupancy of occupancies) {
    const day = localDateOf(occupancy.startsAt, timezone)
    const current = summary.get(day) ?? { occupied: 0, recurring: 0, percent: 0 }
    current.occupied += 1
    if (occupancy.kind === 'recurring') current.recurring += 1
    current.percent = capacityPerDay > 0 ? Math.min(100, Math.round((current.occupied / capacityPerDay) * 100)) : 0
    summary.set(day, current)
  }
  return summary
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run tests/unit/lib/domain/calendar.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/calendar.ts tests/unit/lib/domain/calendar.test.ts
git commit -m "feat(domain): add month and week calendar helpers"
```

---

### Task 44: Pantalla Calendario

**Files:**
- Create: `app/(club)/club/calendario/page.tsx`
- Modify: `lib/club/tabs.ts`, `tests/unit/lib/club/tabs.test.ts`

- [ ] **Step 1: Test de pestañas (falla)**

Reemplazar el test de `tests/unit/lib/club/tabs.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { clubTabs } from '@/lib/club/tabs'

describe('clubTabs', () => {
  it('shows the screens that exist so far to reception and admin', () => {
    expect(clubTabs('reception').map((tab) => tab.label)).toEqual(['Grilla', 'Calendario', 'Cobros'])
    expect(clubTabs('admin').map((tab) => tab.href)).toEqual(['/club/grilla', '/club/calendario', '/club/cobros'])
  })
})
```

Run: `npx vitest run tests/unit/lib/club/tabs.test.ts`
Expected: FAIL (falta "Calendario").

- [ ] **Step 2: Pestaña**

En `lib/club/tabs.ts`, reemplazar el array por:
```ts
  return [
    { href: '/club/grilla', label: 'Grilla' },
    { href: '/club/calendario', label: 'Calendario' },
    { href: '/club/cobros', label: 'Cobros' },
  ]
```

- [ ] **Step 3: Página**

`app/(club)/club/calendario/page.tsx`:
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStaff } from '@/lib/auth/viewer'
import { cn } from '@/lib/cn'
import { scheduleOf } from '@/lib/data/day'
import { addMonths, isMonth, monthGrid, monthOf, summarizeDays, weekOf } from '@/lib/domain/calendar'
import { dayLongLabel, monthLabel, WEEKDAYS_LONG } from '@/lib/domain/format'
import { holderName } from '@/lib/domain/grid'
import { isLocalDate } from '@/lib/domain/input'
import { shortDate, SKIP_REASON_LABELS, type SkipReason } from '@/lib/domain/series'
import { daySlots } from '@/lib/domain/slots'
import { addDays, formatMinutes, localDateOf, parseLocalDate, parseTime, toDate, zonedTime } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Calendario' }

const WEEK_HEADERS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
const TOGGLE = 'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold'

type SearchParams = Promise<{ vista?: string; mes?: string; dia?: string }>

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireStaff('/club/calendario')
  const { club } = viewer
  const params = await searchParams
  const today = localDateOf(new Date(), club.timezone)
  const view = params.vista === 'semana' ? 'semana' : 'mes'
  const anchor = isLocalDate(params.dia) ? params.dia : today
  const month = isMonth(params.mes) ? params.mes : monthOf(anchor)
  const weeks = view === 'mes' ? monthGrid(month) : [weekOf(anchor)]
  const from = zonedTime(weeks[0][0], 0, club.timezone).toISOString()
  const to = zonedTime(addDays(weeks[weeks.length - 1][6], 1), 0, club.timezone).toISOString()

  const supabase = await createClient()
  const [occupancies, courts, series, skips] = await Promise.all([
    supabase.from('court_occupancy').select('starts_at, kind').eq('club_id', club.id).gte('starts_at', from).lt('starts_at', to),
    supabase.from('courts').select('id', { count: 'exact', head: true }).eq('club_id', club.id).eq('is_active', true),
    supabase
      .from('recurring_series')
      .select('id, weekday, start_time, guest_name, ends_on, court:courts(name), player:profiles!recurring_series_player_id_fkey(display_name)')
      .eq('club_id', club.id)
      .or(`ends_on.is.null,ends_on.gte.${today}`)
      .order('weekday')
      .order('start_time'),
    supabase
      .from('recurring_series_skips')
      .select(
        'id, on_date, reason, series:recurring_series(start_time, guest_name, court:courts(name), player:profiles!recurring_series_player_id_fkey(display_name))',
      )
      .eq('club_id', club.id)
      .gte('on_date', today)
      .order('on_date'),
  ])
  if (occupancies.error) throw occupancies.error
  if (courts.error) throw courts.error
  if (series.error) throw series.error
  if (skips.error) throw skips.error

  const capacity = daySlots(scheduleOf(club), today).length * (courts.count ?? 0)
  const summary = summarizeDays(
    occupancies.data.map((o) => ({ startsAt: toDate(o.starts_at), kind: o.kind })),
    club.timezone,
    capacity,
  )
  const previous = view === 'mes' ? `vista=mes&mes=${addMonths(month, -1)}` : `vista=semana&dia=${addDays(anchor, -7)}`
  const next = view === 'mes' ? `vista=mes&mes=${addMonths(month, 1)}` : `vista=semana&dia=${addDays(anchor, 7)}`
  const time = (value: string) => formatMinutes(parseTime(value))

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold uppercase">
          {view === 'mes' ? monthLabel(month) : `Semana del ${dayLongLabel(weeks[0][0])}`}
        </h2>
        <nav aria-label="Vista" className="flex gap-2">
          <Link
            href={`/club/calendario?vista=mes&mes=${month}`}
            aria-current={view === 'mes' ? 'page' : undefined}
            className={cn(TOGGLE, view === 'mes' ? 'border-accent bg-accent text-on-accent' : 'border-border')}
          >
            Mes
          </Link>
          <Link
            href={`/club/calendario?vista=semana&dia=${anchor}`}
            aria-current={view === 'semana' ? 'page' : undefined}
            className={cn(TOGGLE, view === 'semana' ? 'border-accent bg-accent text-on-accent' : 'border-border')}
          >
            Semana
          </Link>
        </nav>
      </div>
      <div className="flex justify-between">
        <Link href={`/club/calendario?${previous}`} className="font-semibold text-accent-ink">
          Anterior
        </Link>
        <Link href={`/club/calendario?${next}`} className="font-semibold text-accent-ink">
          Siguiente
        </Link>
      </div>
      <table className="w-full table-fixed border-separate border-spacing-1">
        <caption className="sr-only">Ocupación por día</caption>
        <thead>
          <tr>
            {WEEK_HEADERS.map((day) => (
              <th key={day} scope="col" className="text-xs font-semibold text-fg-muted">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((day) => {
                const daySummary = summary.get(day)
                const percent = daySummary?.percent ?? 0
                const recurring = daySummary?.recurring ?? 0
                const inMonth = view === 'semana' || monthOf(day) === month
                return (
                  <td key={day}>
                    <Link
                      href={`/club/grilla?dia=${day}`}
                      aria-label={`${dayLongLabel(day)}: ${percent}% ocupado${recurring ? `, ${recurring} turnos fijos` : ''}`}
                      className={cn(
                        'flex min-h-16 flex-col rounded-xl border p-2 text-sm hover:border-accent',
                        day === today ? 'border-accent' : 'border-border',
                        !inMonth && 'opacity-40',
                      )}
                    >
                      <span className="font-display text-lg font-bold">{parseLocalDate(day).day}</span>
                      <span>{percent}%</span>
                      {recurring > 0 ? <span className="text-xs text-fg-muted">{recurring} fijos</span> : null}
                    </Link>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <section aria-labelledby="fijos" className="flex flex-col gap-2">
        <h2 id="fijos" className="font-display text-2xl font-bold uppercase">
          Turnos fijos
        </h2>
        {series.data.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {series.data.map((item) => (
              <li key={item.id}>
                {WEEKDAYS_LONG[item.weekday]} {time(item.start_time)}, {item.court?.name}:{' '}
                {holderName(item.guest_name, item.player?.display_name ?? null)}
                {item.ends_on ? `, hasta el ${shortDate(item.ends_on)}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">No hay turnos fijos. Se cargan desde la grilla.</p>
        )}
      </section>

      <section aria-labelledby="salteadas" className="flex flex-col gap-2">
        <h2 id="salteadas" className="font-display text-2xl font-bold uppercase">
          Fechas salteadas
        </h2>
        {skips.data.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {skips.data.map((skip) => (
              <li key={skip.id}>
                {shortDate(skip.on_date)}
                {skip.series ? ` ${time(skip.series.start_time)}, ${skip.series.court?.name}, ` : ' '}
                {skip.series ? holderName(skip.series.guest_name, skip.series.player?.display_name ?? null) : ''}:{' '}
                {SKIP_REASON_LABELS[skip.reason as SkipReason] ?? skip.reason}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">Ningún turno fijo quedó sin reservar.</p>
        )}
      </section>
    </>
  )
}
```

- [ ] **Step 4: Verificar**

Run:
```bash
npx vitest run tests/unit/lib/club/tabs.test.ts
npm run typecheck
npm run lint
```
Expected: PASS y verde. Probar a mano: `/club/calendario` muestra el mes con el % por día; tocar un día abre la grilla de ese día; "Semana" muestra 7 días; un turno fijo cargado aparece en "Turnos fijos".

- [ ] **Step 5: Commit**

```bash
git add "app/(club)/club/calendario" lib/club/tabs.ts tests/unit/lib/club/tabs.test.ts
git commit -m "feat(club): add month and week calendar with recurring slots"
```

---

### Task 45: Flujo 2 con turno fijo

**Files:**
- Modify: `tests/e2e/reception-grid.spec.ts`

- [ ] **Step 1: Agregar el paso**

En `tests/e2e/reception-grid.spec.ts`, cambiar el nombre del test a `'reception confirms a transfer, loads a block and a recurring slot, and cancels a booking'` y, después del `expect` del bloqueo ("Mantenimiento") y antes de `// Cancel the player's booking`, agregar:
```ts
  // Load a recurring slot under a name.
  const recurring = await openFirstFreeSlot(page)
  await load.getByLabel('Tipo').selectOption('Turno fijo')
  await load.getByLabel('A nombre de', { exact: true }).fill('Rodríguez E2E')
  await load.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('status')).toContainText('Turno fijo cargado')
  await expect(page.getByRole('button', { name: `${recurring.court}, ${recurring.time}: Rodríguez E2E` })).toContainText(
    'Turno fijo',
  )
```

- [ ] **Step 2: Correr**

Run: `npx playwright test tests/e2e/reception-grid.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit y push**

```bash
git add tests/e2e/reception-grid.spec.ts
git commit -m "test(e2e): cover recurring slots in the reception flow"
git push
```

---

## Corte 6: Jugadores y ajustes

### Task 46: Políticas de admin (pgTAP)

Cubre el pendiente de la fase 0 ("tests de políticas de admin en `rls.test.sql`") y lo que Ajustes escribe directo.

**Files:**
- Test: `supabase/tests/database/admin_config.test.sql`

- [ ] **Step 1: Test**

`supabase/tests/database/admin_config.test.sql` (Write tool):
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
select plan(9);

-- Dani, admin
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select lives_ok(
  $$ update public.clubs set slot_minutes = 60 where id = 'a0000000-0000-0000-0000-000000000001' $$,
  'admin updates the club settings');

reset role;
select is((select slot_minutes::int from public.clubs where id = 'a0000000-0000-0000-0000-000000000001'), 60,
  'the new slot length is stored');

-- Carla, reception: RLS filters her update out.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
update public.clubs set slot_minutes = 120 where id = 'a0000000-0000-0000-0000-000000000001';

reset role;
select is((select slot_minutes::int from public.clubs where id = 'a0000000-0000-0000-0000-000000000001'), 60,
  'reception cannot change the club settings');

-- Dani manages prices and courts.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.pricing_rules (club_id, weekdays, from_time, to_time, price)
     values ('a0000000-0000-0000-0000-000000000001', '{6}', '08:00', '12:00', 1500) $$,
  'admin adds a price band');
select lives_ok(
  $$ delete from public.pricing_rules
     where club_id = 'a0000000-0000-0000-0000-000000000001' and weekdays = '{6}' $$,
  'admin deletes a price band');
select lives_ok(
  $$ insert into public.courts (club_id, name) values ('a0000000-0000-0000-0000-000000000001', 'Cancha 3') $$,
  'admin adds a court');

-- Carla cannot.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.pricing_rules (club_id, weekdays, from_time, to_time, price)
     values ('a0000000-0000-0000-0000-000000000001', '{6}', '08:00', '12:00', 1) $$,
  '42501', null, 'reception cannot add price bands');
select throws_ok(
  $$ insert into public.courts (club_id, name) values ('a0000000-0000-0000-0000-000000000001', 'Cancha 4') $$,
  '42501', null, 'reception cannot add courts');

reset role;
select is((select count(*)::int from public.pricing_rules where club_id = 'a0000000-0000-0000-0000-000000000001'), 2,
  'only the admin changes left a trace');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr**

Run: `npx supabase test db supabase/tests/database/admin_config.test.sql`
Expected: PASS, 9 tests. (Las políticas existen desde las fases 0 y Task 2; este test las fija antes de construir Ajustes. Si alguno falla, es un bug de política: arreglarlo en una migración nueva.)

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/database/admin_config.test.sql
git commit -m "test(db): cover admin-only club, court and price writes"
```

---

### Task 47: Pantalla Jugadores

**Files:**
- Modify: `lib/domain/members.ts`, `lib/data/members.ts`, `lib/club/tabs.ts`, `tests/unit/lib/club/tabs.test.ts`
- Create: `app/(club)/club/jugadores/page.tsx`, `app/(club)/club/jugadores/actions.ts`, `app/(club)/club/jugadores/members-list.tsx`
- Test: `tests/unit/lib/domain/members.test.ts`, `tests/unit/app/jugadores/members-list.test.tsx`

- [ ] **Step 1: Tests que fallan**

`tests/unit/lib/domain/members.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { filterMembers, normalizeText, type MemberView } from '@/lib/domain/members'

const MEMBERS: MemberView[] = [
  { userId: 'u1', name: 'Martín Pérez', role: 'player', category: 5, validated: true },
  { userId: 'u2', name: 'Ana López', role: 'player', category: 6, validated: false },
  { userId: 'u3', name: 'Carla Ruiz', role: 'reception', category: null, validated: false },
]

describe('filterMembers', () => {
  it('finds people ignoring accents and case', () => {
    expect(filterMembers(MEMBERS, 'martin').map((m) => m.userId)).toEqual(['u1'])
    expect(normalizeText('  LÓPEZ ')).toBe('lopez')
  })

  it('lists categories waiting for validation first, then by name', () => {
    expect(filterMembers(MEMBERS, '').map((m) => m.userId)).toEqual(['u2', 'u3', 'u1'])
  })
})
```

`tests/unit/app/jugadores/members-list.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MembersList } from '@/app/(club)/club/jugadores/members-list'
import type { FormAction } from '@/components/ui/action-form'
import type { MemberView } from '@/lib/domain/members'

const MEMBERS: MemberView[] = [
  { userId: 'u1', name: 'Martín Pérez', role: 'player', category: 5, validated: true },
  { userId: 'u2', name: 'Ana López', role: 'player', category: 6, validated: false },
  { userId: 'admin', name: 'Dani Admin', role: 'admin', category: null, validated: false },
]

function renderList(canChangeRoles: boolean) {
  const validateAction = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Categoría validada.' }))
  const roleAction = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Rol actualizado.' }))
  render(
    <MembersList
      members={MEMBERS}
      viewerId="admin"
      canChangeRoles={canChangeRoles}
      validateAction={validateAction}
      roleAction={roleAction}
    />,
  )
  return { validateAction, roleAction }
}

describe('MembersList', () => {
  it('filters as you type', async () => {
    renderList(false)
    await userEvent.type(screen.getByLabelText('Buscar jugador'), 'ana')
    expect(screen.getByText('Ana López')).toBeInTheDocument()
    expect(screen.queryByText('Martín Pérez')).not.toBeInTheDocument()
  })

  it('validates a pending category', async () => {
    const { validateAction } = renderList(false)
    const ana = screen.getByText('Ana López').closest('li') as HTMLElement
    await userEvent.selectOptions(within(ana).getByLabelText('Categoría de Ana López'), '5ª')
    await userEvent.click(within(ana).getByRole('button', { name: 'Validar categoría' }))
    await waitFor(() => expect(validateAction).toHaveBeenCalledTimes(1))
    expect(Object.fromEntries(validateAction.mock.calls[0][1].entries())).toEqual({ userId: 'u2', category: '5' })
  })

  it('hides role controls from reception', () => {
    renderList(false)
    expect(screen.queryByRole('button', { name: 'Cambiar rol' })).not.toBeInTheDocument()
  })

  it('lets an admin change other people\'s roles', () => {
    renderList(true)
    expect(screen.getAllByRole('button', { name: 'Cambiar rol' })).toHaveLength(2)
    expect(screen.queryByLabelText('Rol de Dani Admin')).not.toBeInTheDocument()
  })
})
```

Run: `npx vitest run tests/unit/lib/domain/members.test.ts tests/unit/app/jugadores`
Expected: FAIL (`filterMembers` no existe; `members-list` no resuelve).

- [ ] **Step 2: Dominio**

Reemplazar `lib/domain/members.ts` completo:
```ts
import type { Role } from './profile'

// A club member reception can load a booking for.
export type MemberOption = { userId: string; name: string }

export type MemberView = { userId: string; name: string; role: Role; category: number | null; validated: boolean }

export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Categories waiting for validation first; then by name.
export function filterMembers(members: MemberView[], query: string): MemberView[] {
  const needle = normalizeText(query)
  return members
    .filter((member) => normalizeText(member.name).includes(needle))
    .sort((a, b) => Number(a.validated) - Number(b.validated) || a.name.localeCompare(b.name, 'es'))
}
```

En `lib/data/members.ts`, cambiar el import del dominio por `import type { MemberOption, MemberView } from '@/lib/domain/members'` y agregar al final:
```ts
export async function loadMembers(clubId: string): Promise<MemberView[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('club_members')
    .select('user_id, role, category, category_validated, profile:profiles(display_name)')
    .eq('club_id', clubId)
  if (error) throw error
  return data.map((member) => ({
    userId: member.user_id,
    name: member.profile?.display_name ?? 'Sin nombre',
    role: member.role,
    category: member.category,
    validated: member.category_validated,
  }))
}
```

- [ ] **Step 3: Lista (cliente)**

`app/(club)/club/jugadores/members-list.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import { Field, inputClasses } from '@/components/ui/field'
import { filterMembers, type MemberView } from '@/lib/domain/members'
import { CATEGORIES, categoryLabel, ROLE_LABELS, ROLES } from '@/lib/domain/profile'

export function MembersList({
  members,
  viewerId,
  canChangeRoles,
  validateAction,
  roleAction,
}: {
  members: MemberView[]
  viewerId: string
  canChangeRoles: boolean
  validateAction: FormAction
  roleAction: FormAction
}) {
  const [query, setQuery] = useState('')
  const shown = filterMembers(members, query)

  return (
    <div className="flex flex-col gap-4">
      <Field label="Buscar jugador" htmlFor="buscar">
        <input id="buscar" type="search" value={query} onChange={(event) => setQuery(event.target.value)} className={inputClasses} />
      </Field>
      {shown.length === 0 ? <p className="text-fg-muted">No encontramos a nadie con ese nombre.</p> : null}
      <ul className="grid gap-3 md:grid-cols-2">
        {shown.map((member) => (
          <li key={member.userId}>
            <Card className="flex flex-col gap-3">
              <div>
                <p className="font-semibold">{member.name}</p>
                <p className="text-sm text-fg-muted">
                  {ROLE_LABELS[member.role]}. {categoryLabel(member.category, member.validated)}.
                </p>
              </div>
              <ActionForm
                action={validateAction}
                submitLabel={member.validated ? 'Corregir categoría' : 'Validar categoría'}
                variant="secondary"
              >
                <input type="hidden" name="userId" value={member.userId} />
                <Field label={`Categoría de ${member.name}`} htmlFor={`category-${member.userId}`}>
                  <select
                    id={`category-${member.userId}`}
                    name="category"
                    defaultValue={member.category ?? 5}
                    className={inputClasses}
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}ª
                      </option>
                    ))}
                  </select>
                </Field>
              </ActionForm>
              {canChangeRoles && member.userId !== viewerId ? (
                <ActionForm action={roleAction} submitLabel="Cambiar rol" variant="ghost">
                  <input type="hidden" name="userId" value={member.userId} />
                  <Field label={`Rol de ${member.name}`} htmlFor={`role-${member.userId}`}>
                    <select id={`role-${member.userId}`} name="role" defaultValue={member.role} className={inputClasses}>
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </Field>
                </ActionForm>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Server Actions y página**

`app/(club)/club/jugadores/actions.ts`:
```ts
'use server'

import { failed, fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { getViewer } from '@/lib/auth/viewer'
import { errorMessage } from '@/lib/domain/errors'
import { readEnum, readInt, readUuid } from '@/lib/domain/input'
import { ROLES } from '@/lib/domain/profile'
import { createClient } from '@/lib/supabase/server'

export async function validateCategory(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return failed(errorMessage('forbidden'))
  const userId = readUuid(form, 'userId')
  const category = readInt(form, 'category', { min: 1, max: 8 })
  if (!userId || category === null) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('validate_category', {
    p_club_id: viewer.club.id,
    p_user_id: userId,
    p_category: category,
  })
  revalidateBookings()
  return fromRpc(error, 'Categoría validada.')
}

export async function setMemberRole(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return failed(errorMessage('forbidden'))
  const userId = readUuid(form, 'userId')
  const role = readEnum(form, 'role', ROLES)
  if (!userId || !role) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_member_role', { p_club_id: viewer.club.id, p_user_id: userId, p_role: role })
  revalidateBookings()
  return fromRpc(error, 'Rol actualizado.')
}
```

`app/(club)/club/jugadores/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { requireStaff } from '@/lib/auth/viewer'
import { loadMembers } from '@/lib/data/members'
import { setMemberRole, validateCategory } from './actions'
import { MembersList } from './members-list'

export const metadata: Metadata = { title: 'Jugadores' }

export default async function PlayersPage() {
  const viewer = await requireStaff('/club/jugadores')
  const members = await loadMembers(viewer.club.id)

  return (
    <section aria-labelledby="jugadores" className="flex flex-col gap-4">
      <h2 id="jugadores" className="font-display text-2xl font-bold uppercase">
        Jugadores
      </h2>
      <MembersList
        members={members}
        viewerId={viewer.userId}
        canChangeRoles={viewer.membership.role === 'admin'}
        validateAction={validateCategory}
        roleAction={setMemberRole}
      />
    </section>
  )
}
```

- [ ] **Step 5: Pestaña**

En `tests/unit/lib/club/tabs.test.ts`, cambiar las expectativas a:
```ts
    expect(clubTabs('reception').map((tab) => tab.label)).toEqual(['Grilla', 'Calendario', 'Cobros', 'Jugadores'])
    expect(clubTabs('admin').map((tab) => tab.href)).toEqual([
      '/club/grilla', '/club/calendario', '/club/cobros', '/club/jugadores',
    ])
```
y en `lib/club/tabs.ts` agregar al final del array `{ href: '/club/jugadores', label: 'Jugadores' },`.

- [ ] **Step 6: Correr y ver que pasa**

Run:
```bash
npx vitest run tests/unit/lib/domain/members.test.ts tests/unit/app/jugadores tests/unit/lib/club/tabs.test.ts
npm run typecheck
npm run lint
```
Expected: PASS (2 + 4 + 1 tests), verde.

- [ ] **Step 7: Commit**

```bash
git add lib/domain/members.ts lib/data/members.ts lib/club/tabs.ts "app/(club)/club/jugadores" tests/unit
git commit -m "feat(club): add players screen to validate categories and roles"
```

---

### Task 48: Validación de ajustes y precios (`lib/domain/settings.ts`)

**Files:**
- Create: `lib/domain/settings.ts`
- Test: `tests/unit/lib/domain/settings.test.ts`

- [ ] **Step 1: Test que falla**

`tests/unit/lib/domain/settings.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { describeRule, parseClubSettings, parsePricingRule, TIME_OPTIONS } from '@/lib/domain/settings'

function form(entries: [string, string][]): FormData {
  const data = new FormData()
  for (const [key, value] of entries) data.append(key, value)
  return data
}

const PROTOTYPE: [string, string][] = [
  ['opens_at', '08:00'],
  ['closes_at', '23:00'],
  ['slot_minutes', '90'],
  ['booking_window_days', '14'],
  ['cancellation_notice_hours', '24'],
  ['max_active_bookings', '2'],
  ['accepts_cash', 'on'],
  ['accepts_transfer', 'on'],
  ['transfer_receipt_required', 'on'],
  ['transfer_details', '  Banco Ejemplo, cuenta 123  '],
]
const without = (key: string) => PROTOTYPE.filter(([name]) => name !== key)
const replacing = (key: string, value: string) => [...without(key), [key, value] as [string, string]]

describe('parseClubSettings', () => {
  it('reads the prototype settings', () => {
    expect(parseClubSettings(form(PROTOTYPE))).toEqual({
      ok: true,
      value: {
        opens_at: '08:00',
        closes_at: '23:00',
        slot_minutes: 90,
        booking_window_days: 14,
        cancellation_notice_hours: 24,
        max_active_bookings: 2,
        accepts_cash: true,
        accepts_transfer: true,
        transfer_receipt_required: true,
        transfer_details: 'Banco Ejemplo, cuenta 123',
      },
    })
  })

  it('rejects closing before opening', () => {
    expect(parseClubSettings(form(replacing('closes_at', '07:00')))).toEqual({
      ok: false,
      message: 'El club tiene que cerrar después de abrir.',
    })
  })

  it('rejects hours where not even one slot fits', () => {
    const settings = [...replacing('opens_at', '22:00')]
    expect(parseClubSettings(form(settings))).toEqual({ ok: false, message: 'En ese horario no entra ni un turno.' })
  })

  it('needs at least one payment method', () => {
    const settings = without('accepts_cash').filter(([name]) => name !== 'accepts_transfer')
    expect(parseClubSettings(form(settings))).toEqual({ ok: false, message: 'Elegí al menos un medio de pago.' })
  })
})

describe('parsePricingRule', () => {
  it('reads days, band and price', () => {
    const data = form([['weekdays', '5'], ['weekdays', '1'], ['weekdays', '1'], ['from_time', '18:30'], ['to_time', '24:00'], ['price', '1600']])
    expect(parsePricingRule(data)).toEqual({
      ok: true,
      value: { weekdays: [1, 5], from_time: '18:30', to_time: '24:00', price: 1600 },
    })
  })

  it('needs at least one day', () => {
    expect(parsePricingRule(form([['from_time', '08:00'], ['to_time', '12:00'], ['price', '1']]))).toEqual({
      ok: false,
      message: 'Elegí al menos un día.',
    })
  })
})

describe('describeRule', () => {
  const band = { fromTime: '18:30:00', toTime: '24:00:00', price: 1600 }

  it('names common day groups', () => {
    expect(describeRule({ ...band, weekdays: [0, 1, 2, 3, 4, 5, 6] })).toBe('Todos los días, 18:30 a 24:00: $1.600')
    expect(describeRule({ ...band, weekdays: [1, 2, 3, 4, 5] })).toBe('Lunes a viernes, 18:30 a 24:00: $1.600')
    expect(describeRule({ ...band, weekdays: [0, 6] })).toBe('Sábados y domingos, 18:30 a 24:00: $1.600')
    expect(describeRule({ ...band, weekdays: [5, 1, 3] })).toBe('lun, mié, vie, 18:30 a 24:00: $1.600')
  })
})

describe('TIME_OPTIONS', () => {
  it('goes from 00:00 to 24:00 every half hour', () => {
    expect(TIME_OPTIONS).toHaveLength(49)
    expect(TIME_OPTIONS[0]).toBe('00:00')
    expect(TIME_OPTIONS.at(-1)).toBe('24:00')
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/unit/lib/domain/settings.test.ts`
Expected: FAIL con `Failed to resolve import "@/lib/domain/settings"`.

- [ ] **Step 3: Implementación**

`lib/domain/settings.ts`:
```ts
import { formatPrice, WEEKDAYS_SHORT } from './format'
import { readBoolean, readInt, readTime } from './input'
import type { PricingRule } from './slots'
import { formatMinutes, parseTime } from './time'

export const SLOT_LENGTHS = [60, 90, 120] as const
export const TIME_OPTIONS: string[] = Array.from({ length: 49 }, (_, index) => formatMinutes(index * 30))

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string }

export type ClubSettings = {
  opens_at: string
  closes_at: string
  slot_minutes: number
  booking_window_days: number
  cancellation_notice_hours: number
  max_active_bookings: number
  accepts_cash: boolean
  accepts_transfer: boolean
  transfer_receipt_required: boolean
  transfer_details: string | null
}

export type PricingRuleInput = { weekdays: number[]; from_time: string; to_time: string; price: number }

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message }
}

// Same limits as the clubs check constraints, with a Spanish message for each.
export function parseClubSettings(form: FormData): ParseResult<ClubSettings> {
  const opensAt = readTime(form, 'opens_at')
  const closesAt = readTime(form, 'closes_at')
  if (!opensAt || !closesAt) return fail('Elegí el horario de apertura y de cierre.')
  if (parseTime(closesAt) <= parseTime(opensAt)) return fail('El club tiene que cerrar después de abrir.')

  const slotMinutes = readInt(form, 'slot_minutes', { min: 15, max: 240 })
  if (slotMinutes === null || !(SLOT_LENGTHS as readonly number[]).includes(slotMinutes)) {
    return fail('Elegí una duración de turno.')
  }
  if (parseTime(closesAt) - parseTime(opensAt) < slotMinutes) return fail('En ese horario no entra ni un turno.')

  const windowDays = readInt(form, 'booking_window_days', { min: 1, max: 60 })
  if (windowDays === null) return fail('Los días para reservar van de 1 a 60.')
  const noticeHours = readInt(form, 'cancellation_notice_hours', { min: 0, max: 72 })
  if (noticeHours === null) return fail('Las horas de aviso van de 0 a 72.')
  const maxActive = readInt(form, 'max_active_bookings', { min: 1, max: 10 })
  if (maxActive === null) return fail('Las reservas activas por jugador van de 1 a 10.')

  const acceptsCash = readBoolean(form, 'accepts_cash')
  const acceptsTransfer = readBoolean(form, 'accepts_transfer')
  if (!acceptsCash && !acceptsTransfer) return fail('Elegí al menos un medio de pago.')

  const rawDetails = form.get('transfer_details')
  const details = typeof rawDetails === 'string' ? rawDetails.trim() : ''
  if (details.length > 500) return fail('Los datos de transferencia tienen hasta 500 caracteres.')

  return {
    ok: true,
    value: {
      opens_at: opensAt,
      closes_at: closesAt,
      slot_minutes: slotMinutes,
      booking_window_days: windowDays,
      cancellation_notice_hours: noticeHours,
      max_active_bookings: maxActive,
      accepts_cash: acceptsCash,
      accepts_transfer: acceptsTransfer,
      transfer_receipt_required: readBoolean(form, 'transfer_receipt_required'),
      transfer_details: details || null,
    },
  }
}

export function parsePricingRule(form: FormData): ParseResult<PricingRuleInput> {
  const weekdays = [...new Set(form.getAll('weekdays').map(Number))]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b)
  if (weekdays.length === 0) return fail('Elegí al menos un día.')

  const from = readTime(form, 'from_time')
  const to = readTime(form, 'to_time')
  if (!from || !to || parseTime(to) <= parseTime(from)) return fail('La franja tiene que terminar después de empezar.')

  const price = readInt(form, 'price', { min: 0, max: 10_000_000 })
  if (price === null) return fail('Ingresá el precio en pesos, sin puntos.')

  return { ok: true, value: { weekdays, from_time: from, to_time: to, price } }
}

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0]

function describeDays(weekdays: number[]): string {
  const days = new Set(weekdays)
  if (days.size === 7) return 'Todos los días'
  if (days.size === 5 && [1, 2, 3, 4, 5].every((day) => days.has(day))) return 'Lunes a viernes'
  if (days.size === 2 && days.has(0) && days.has(6)) return 'Sábados y domingos'
  return MONDAY_FIRST.filter((day) => days.has(day))
    .map((day) => WEEKDAYS_SHORT[day])
    .join(', ')
}

export function describeRule(rule: PricingRule): string {
  const from = formatMinutes(parseTime(rule.fromTime))
  const to = formatMinutes(parseTime(rule.toTime))
  return `${describeDays(rule.weekdays)}, ${from} a ${to}: ${formatPrice(rule.price)}`
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run tests/unit/lib/domain/settings.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/settings.ts tests/unit/lib/domain/settings.test.ts
git commit -m "feat(domain): validate club settings and price bands"
```

---

### Task 49: Pantalla Ajustes (solo admin)

**Files:**
- Create: `app/(club)/club/ajustes/page.tsx`, `app/(club)/club/ajustes/actions.ts`
- Modify: `lib/club/tabs.ts`, `tests/unit/lib/club/tabs.test.ts`

# (la validación ya está probada en Task 48 y las políticas en Task 46; la página es formularios)

- [ ] **Step 1: Pestaña de admin (test que falla)**

Reemplazar `tests/unit/lib/club/tabs.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { clubTabs } from '@/lib/club/tabs'

describe('clubTabs', () => {
  it('shows the day-to-day screens to reception', () => {
    expect(clubTabs('reception').map((tab) => tab.label)).toEqual(['Grilla', 'Calendario', 'Cobros', 'Jugadores'])
  })

  it('adds the settings to admins', () => {
    expect(clubTabs('admin').map((tab) => tab.href)).toEqual([
      '/club/grilla', '/club/calendario', '/club/cobros', '/club/jugadores', '/club/ajustes',
    ])
  })
})
```

Run: `npx vitest run tests/unit/lib/club/tabs.test.ts`
Expected: FAIL en "adds the settings to admins".

Reemplazar `lib/club/tabs.ts`:
```ts
import type { TabItem } from '@/components/nav/tab-nav'
import type { Role } from '@/lib/domain/profile'

export function clubTabs(role: Role): TabItem[] {
  const tabs: TabItem[] = [
    { href: '/club/grilla', label: 'Grilla' },
    { href: '/club/calendario', label: 'Calendario' },
    { href: '/club/cobros', label: 'Cobros' },
    { href: '/club/jugadores', label: 'Jugadores' },
  ]
  return role === 'admin' ? [...tabs, { href: '/club/ajustes', label: 'Ajustes' }] : tabs
}
```

Run: `npx vitest run tests/unit/lib/club/tabs.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 2: Server Actions**

`app/(club)/club/ajustes/actions.ts`:
```ts
'use server'

import { failed, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { getViewer } from '@/lib/auth/viewer'
import { errorMessage } from '@/lib/domain/errors'
import { readBoolean, readInt, readText, readUuid } from '@/lib/domain/input'
import { parseClubSettings, parsePricingRule } from '@/lib/domain/settings'
import { createClient } from '@/lib/supabase/server'

const FORBIDDEN = failed(errorMessage('forbidden'))

// RLS already limits these writes to admins; this gives a clear message instead of a silent no-op.
async function adminClubId(): Promise<string | null> {
  const viewer = await getViewer()
  return viewer?.membership?.role === 'admin' ? viewer.club.id : null
}

export async function updateClubSettings(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  const parsed = parseClubSettings(form)
  if (!parsed.ok) return failed(parsed.message)

  const supabase = await createClient()
  const { data, error } = await supabase.from('clubs').update(parsed.value).eq('id', clubId).select('id')
  if (error) return failed('No pudimos guardar los ajustes. Revisá los datos.')
  if (data.length === 0) return FORBIDDEN
  revalidateBookings()
  return ok('Ajustes guardados. Las reservas ya hechas no cambian.')
}

export async function addCourt(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  const name = readText(form, 'name', { maxLength: 40 })
  if (!name) return INVALID_INPUT

  const supabase = await createClient()
  const { error } = await supabase.from('courts').insert({
    club_id: clubId,
    name,
    is_covered: readBoolean(form, 'is_covered'),
    sort_order: readInt(form, 'sortOrder', { min: 0, max: 100 }) ?? 0,
  })
  if (error?.code === '23505') return failed('Ya hay una cancha con ese nombre.')
  if (error) return failed('No pudimos agregar la cancha.')
  revalidateBookings()
  return ok('Cancha agregada.')
}

export async function updateCourt(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  const courtId = readUuid(form, 'courtId')
  const name = readText(form, 'name', { maxLength: 40 })
  if (!courtId || !name) return INVALID_INPUT

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('courts')
    .update({ name, is_covered: readBoolean(form, 'is_covered'), is_active: readBoolean(form, 'is_active') })
    .eq('id', courtId)
    .eq('club_id', clubId)
    .select('id')
  if (error?.code === '23505') return failed('Ya hay una cancha con ese nombre.')
  if (error) return failed('No pudimos guardar la cancha.')
  if (data.length === 0) return FORBIDDEN
  revalidateBookings()
  return ok('Cancha guardada.')
}

export async function addPricingRule(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  const parsed = parsePricingRule(form)
  if (!parsed.ok) return failed(parsed.message)

  const supabase = await createClient()
  const { error } = await supabase.from('pricing_rules').insert({ club_id: clubId, ...parsed.value })
  if (error) return failed('No pudimos guardar el precio.')
  revalidateBookings()
  return ok('Precio agregado.')
}

export async function deletePricingRule(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  const ruleId = readUuid(form, 'ruleId')
  if (!ruleId) return INVALID_INPUT

  const supabase = await createClient()
  const { data, error } = await supabase.from('pricing_rules').delete().eq('id', ruleId).eq('club_id', clubId).select('id')
  if (error) return failed('No pudimos borrar el precio.')
  if (data.length === 0) return FORBIDDEN
  revalidateBookings()
  return ok('Precio borrado. Los turnos sin precio dejan de ofrecerse.')
}
```

- [ ] **Step 3: Página**

`app/(club)/club/ajustes/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { ActionForm } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import { Field, inputClasses } from '@/components/ui/field'
import { requireAdmin } from '@/lib/auth/viewer'
import { WEEKDAYS_SHORT } from '@/lib/domain/format'
import { describeRule, SLOT_LENGTHS, TIME_OPTIONS } from '@/lib/domain/settings'
import { formatMinutes, parseTime } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'
import { addCourt, addPricingRule, deletePricingRule, updateClubSettings, updateCourt } from './actions'

export const metadata: Metadata = { title: 'Ajustes' }

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0]
const hhmm = (value: string) => formatMinutes(parseTime(value))

function TimeSelect({ id, name, value }: { id: string; name: string; value: string }) {
  return (
    <select id={id} name={name} defaultValue={value} className={inputClasses}>
      {TIME_OPTIONS.map((time) => (
        <option key={time} value={time}>
          {time}
        </option>
      ))}
    </select>
  )
}

export default async function SettingsPage() {
  const viewer = await requireAdmin('/club/ajustes')
  const { club } = viewer
  const supabase = await createClient()
  const [courts, rules] = await Promise.all([
    supabase.from('courts').select('id, name, is_covered, is_active').eq('club_id', club.id).order('sort_order'),
    supabase.from('pricing_rules').select('id, weekdays, from_time, to_time, price').eq('club_id', club.id).order('from_time'),
  ])
  if (courts.error) throw courts.error
  if (rules.error) throw rules.error

  return (
    <>
      <section aria-labelledby="club" className="flex flex-col gap-3">
        <h2 id="club" className="font-display text-2xl font-bold uppercase">
          Horario y reglas
        </h2>
        <Card>
          <ActionForm action={updateClubSettings} submitLabel="Guardar ajustes">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Abre" htmlFor="opens_at">
                <TimeSelect id="opens_at" name="opens_at" value={hhmm(club.opens_at)} />
              </Field>
              <Field label="Cierra" htmlFor="closes_at">
                <TimeSelect id="closes_at" name="closes_at" value={hhmm(club.closes_at)} />
              </Field>
              <Field label="Duración del turno" htmlFor="slot_minutes">
                <select id="slot_minutes" name="slot_minutes" defaultValue={club.slot_minutes} className={inputClasses}>
                  {SLOT_LENGTHS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} minutos
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Días para reservar por adelantado" htmlFor="booking_window_days">
                <input id="booking_window_days" name="booking_window_days" type="number" min={1} max={60}
                  defaultValue={club.booking_window_days} className={inputClasses} />
              </Field>
              <Field label="Horas de aviso para cancelar" htmlFor="cancellation_notice_hours">
                <input id="cancellation_notice_hours" name="cancellation_notice_hours" type="number" min={0} max={72}
                  defaultValue={club.cancellation_notice_hours} className={inputClasses} />
              </Field>
              <Field label="Reservas activas por jugador" htmlFor="max_active_bookings">
                <input id="max_active_bookings" name="max_active_bookings" type="number" min={1} max={10}
                  defaultValue={club.max_active_bookings} className={inputClasses} />
              </Field>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">Medios de pago</legend>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="accepts_cash" defaultChecked={club.accepts_cash} className="size-5 accent-accent" />
                Efectivo en el club
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="accepts_transfer" defaultChecked={club.accepts_transfer} className="size-5 accent-accent" />
                Transferencia
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="transfer_receipt_required" defaultChecked={club.transfer_receipt_required}
                  className="size-5 accent-accent" />
                Pedir comprobante de la transferencia
              </label>
            </fieldset>
            <Field label="Datos para transferir" htmlFor="transfer_details">
              <textarea id="transfer_details" name="transfer_details" rows={3} maxLength={500}
                defaultValue={club.transfer_details ?? ''} className={`${inputClasses} py-2`} />
            </Field>
            <p className="text-sm text-fg-muted">Los cambios no tocan las reservas ya hechas.</p>
          </ActionForm>
        </Card>
      </section>

      <section aria-labelledby="canchas" className="flex flex-col gap-3">
        <h2 id="canchas" className="font-display text-2xl font-bold uppercase">
          Canchas
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {courts.data.map((court) => (
            <li key={court.id}>
              <Card>
                <ActionForm action={updateCourt} submitLabel="Guardar cancha" variant="secondary">
                  <input type="hidden" name="courtId" value={court.id} />
                  <Field label="Nombre" htmlFor={`court-${court.id}`}>
                    <input id={`court-${court.id}`} name="name" required maxLength={40} defaultValue={court.name}
                      className={inputClasses} />
                  </Field>
                  <label className="flex min-h-11 items-center gap-3">
                    <input type="checkbox" name="is_covered" defaultChecked={court.is_covered} className="size-5 accent-accent" />
                    Techada
                  </label>
                  <label className="flex min-h-11 items-center gap-3">
                    <input type="checkbox" name="is_active" defaultChecked={court.is_active} className="size-5 accent-accent" />
                    Activa (se ofrece para reservar)
                  </label>
                </ActionForm>
              </Card>
            </li>
          ))}
        </ul>
        <Card>
          <ActionForm action={addCourt} submitLabel="Agregar cancha" variant="secondary">
            <input type="hidden" name="sortOrder" value={courts.data.length + 1} />
            <Field label="Nombre de la cancha nueva" htmlFor="new-court">
              <input id="new-court" name="name" required maxLength={40} className={inputClasses} />
            </Field>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" name="is_covered" className="size-5 accent-accent" />
              Techada
            </label>
          </ActionForm>
        </Card>
      </section>

      <section aria-labelledby="precios" className="flex flex-col gap-3">
        <h2 id="precios" className="font-display text-2xl font-bold uppercase">
          Precios por franja
        </h2>
        <p className="text-sm text-fg-muted">
          El precio de un turno sale de la franja que cubre su hora de inicio. Un turno sin franja no se ofrece.
        </p>
        <ul className="flex flex-col gap-2">
          {rules.data.map((rule) => (
            <li key={rule.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {describeRule({ weekdays: rule.weekdays, fromTime: rule.from_time, toTime: rule.to_time, price: rule.price })}
                </span>
                <ActionForm action={deletePricingRule} submitLabel="Borrar" variant="ghost">
                  <input type="hidden" name="ruleId" value={rule.id} />
                </ActionForm>
              </Card>
            </li>
          ))}
        </ul>
        <Card>
          <ActionForm action={addPricingRule} submitLabel="Agregar precio" variant="secondary">
            <fieldset className="flex flex-wrap gap-3">
              <legend className="mb-1 text-sm font-semibold">Días</legend>
              {MONDAY_FIRST.map((day) => (
                <label key={day} className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" name="weekdays" value={day} className="size-5 accent-accent" />
                  {WEEKDAYS_SHORT[day]}
                </label>
              ))}
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Desde" htmlFor="from_time">
                <TimeSelect id="from_time" name="from_time" value="18:30" />
              </Field>
              <Field label="Hasta" htmlFor="to_time">
                <TimeSelect id="to_time" name="to_time" value="24:00" />
              </Field>
            </div>
            <Field label="Precio en pesos" htmlFor="price">
              <input id="price" name="price" type="number" inputMode="numeric" min={0} required className={inputClasses} />
            </Field>
          </ActionForm>
        </Card>
      </section>
    </>
  )
}
```

- [ ] **Step 4: Verificar**

Run:
```bash
npm run typecheck
npm run lint
npm test
```
Expected: verde. Probar a mano como admin (ver README, Task 53, para volverse admin en local): cambiar "Cierra" a 22:00 guarda y la grilla deja de ofrecer 21:30; recepción no ve la pestaña "Ajustes" y `/club/ajustes` la manda a la grilla.

- [ ] **Step 5: Commit y push**

```bash
git add "app/(club)/club/ajustes" lib/club/tabs.ts tests/unit/lib/club/tabs.test.ts
git commit -m "feat(club): add admin settings for hours, rules, courts and prices"
git push
```

---

## Corte 7: Realtime

### Task 50: `court_occupancy` en Realtime

**Files:**
- Create: `supabase/migrations/20260929000900_realtime.sql`
- Test: `supabase/tests/database/realtime.test.sql`

- [ ] **Step 1: Test que falla**

`supabase/tests/database/realtime.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'court_occupancy'),
  1, 'occupancy changes are published to Realtime');

select * from finish();
rollback;
```

Run: `npx supabase test db supabase/tests/database/realtime.test.sql`
Expected: FAIL (`have: 0, want: 1`).

- [ ] **Step 2: Migración**

`supabase/migrations/20260929000900_realtime.sql`:
```sql
-- The club grid and the booking screen listen for occupancy changes and reload the day.
-- Realtime applies the table's select policy, so members only hear about their own club.
alter publication supabase_realtime add table public.court_occupancy;
```

- [ ] **Step 3: Aplicar y correr**

Run:
```bash
npm run db:reset
npm run test:db
```
Expected: todo pgTAP en verde, incluido `realtime.test.sql`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260929000900_realtime.sql supabase/tests/database/realtime.test.sql
git commit -m "feat(db): publish court occupancy to Realtime"
```

---

### Task 51: Grilla y Reservar en vivo

**Files:**
- Create: `components/live/live-occupancy.tsx`
- Modify: `app/(jugador)/reservar/page.tsx`, `app/(club)/club/grilla/page.tsx`
- Test: `tests/unit/components/live/live-occupancy.test.tsx`

- [ ] **Step 1: Test que falla**

`tests/unit/components/live/live-occupancy.test.tsx`:
```tsx
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveOccupancy } from '@/components/live/live-occupancy'

const mocks = vi.hoisted(() => {
  const handlers: Array<() => void> = []
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  }
  channel.on.mockImplementation((_type: string, _filter: unknown, handler: () => void) => {
    handlers.push(handler)
    return channel
  })
  channel.subscribe.mockImplementation(() => channel)
  return { handlers, channel, createChannel: vi.fn(() => channel), removeChannel: vi.fn(), refresh: vi.fn() }
})

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ channel: mocks.createChannel, removeChannel: mocks.removeChannel }),
}))

describe('LiveOccupancy', () => {
  beforeEach(() => {
    mocks.handlers.length = 0
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('listens to new occupancies of its club and to any removal', () => {
    render(<LiveOccupancy clubId="club-1" />)
    expect(mocks.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'court_occupancy', filter: 'club_id=eq.club-1' },
      expect.any(Function),
    )
    expect(mocks.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'court_occupancy' },
      expect.any(Function),
    )
    expect(mocks.channel.subscribe).toHaveBeenCalled()
  })

  it('reloads the day once after a burst of changes', () => {
    render(<LiveOccupancy clubId="club-1" />)
    act(() => {
      for (const handler of mocks.handlers) handler()
      vi.advanceTimersByTime(300)
    })
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('stops listening when the screen goes away', () => {
    const { unmount } = render(<LiveOccupancy clubId="club-1" />)
    unmount()
    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channel)
  })
})
```

Run: `npx vitest run tests/unit/components/live/live-occupancy.test.tsx`
Expected: FAIL con `Failed to resolve import "@/components/live/live-occupancy"`.

- [ ] **Step 2: Implementación**

`components/live/live-occupancy.tsx`:
```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// Reloads the current screen when a court is taken or freed anywhere in the club. It does not
// patch state by hand: the server renders the day again. Realtime cannot filter deletes, so those
// come unfiltered (with only the id) and trigger a reload too.
export function LiveOccupancy({ clubId, debounceMs = 300 }: { clubId: string; debounceMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | undefined
    const reload = () => {
      clearTimeout(timer)
      timer = setTimeout(() => router.refresh(), debounceMs)
    }
    const channel = supabase
      .channel(`occupancy:${clubId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'court_occupancy', filter: `club_id=eq.${clubId}` },
        reload,
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'court_occupancy' }, reload)
      .subscribe()

    return () => {
      clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [clubId, debounceMs, router])

  return null
}
```

Run: `npx vitest run tests/unit/components/live/live-occupancy.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 3: Montarlo en las dos pantallas**

En `app/(jugador)/reservar/page.tsx`, importar `import { LiveOccupancy } from '@/components/live/live-occupancy'` y agregar como primer hijo del fragmento:
```tsx
      <LiveOccupancy clubId={club.id} />
```
En `app/(club)/club/grilla/page.tsx`, el mismo import y la misma línea como primer hijo del fragmento.

- [ ] **Step 4: Verificar a mano**

Run: `npm run typecheck && npm run lint && npm run dev`
Con dos navegadores (uno como recepción en `/club/grilla`, otro como jugador en `/reservar` del mismo día): reservar en uno y ver la celda cambiar en el otro sin recargar, en menos de un segundo.

- [ ] **Step 5: Commit**

```bash
git add components/live "app/(jugador)/reservar/page.tsx" "app/(club)/club/grilla/page.tsx" tests/unit/components/live
git commit -m "feat(app): refresh the grid live on occupancy changes"
```

---

### Task 52: Flujo 2 comprueba el vivo

**Files:**
- Modify: `tests/e2e/reception-grid.spec.ts`

- [ ] **Step 1: Agregar el paso**

En `tests/e2e/reception-grid.spec.ts`, después del paso del turno fijo y antes de `// Cancel the player's booking`, agregar:
```ts
  // Live: a booking made elsewhere shows up without reloading the page.
  const other = await bookFirstFreeSlot(player, day)
  await expect(page.getByRole('button', { name: `${other.courtName}, ${other.time}: ${player.name}` })).toBeVisible()
```

- [ ] **Step 2: Correr todo e2e**

Run: `npx playwright test`
Expected: los cuatro specs en verde.

- [ ] **Step 3: Commit y push**

```bash
git add tests/e2e/reception-grid.spec.ts
git commit -m "test(e2e): check the club grid updates live"
git push
```

---
## Cierre

### Task 53: README y notas

**Files:**
- Modify: `README.md`
- Modify: `docs/features/fase-1-reservas/notes.md`

# (no test — documentación)

- [ ] **Step 1: README**

En `README.md`:

1. Después del párrafo de Mailpit en "Primeros pasos", agregar:
````markdown
El seed local trae a Rustic con los valores del prototipo: 3 canchas, 08:00 a 23:00, turnos de 90 minutos, $1.200 y $1.600 desde las 18:30.

Para usar el panel del club en local, ingresá una vez con tu email y date rol de admin:

```bash
docker exec supabase_db_padel-management psql -U postgres -c "update public.club_members set role = 'admin' where user_id = (select id from auth.users where email = 'vos@ejemplo.com');"
```
````
2. En "Cómo trabajamos", agregar:
```markdown
- Reservas, cancelaciones, turnos fijos, bloqueos y pagos se escriben solo con las funciones de Postgres (`book_slot`, `staff_book`, `create_series`, `report_transfer`, …). Nadie escribe directo en `bookings`, `court_occupancy` ni `payments`.
- Cada función falla con un código estable (`slot_taken`, `notice_period`, …); `lib/domain/errors.ts` lo traduce. Un código nuevo va en los dos lados.
- Los e2e crean usuarios `@e2e.test` en el Supabase local y los borran al empezar cada corrida.
```
3. En "Funciones disponibles", agregar:
```markdown
- Fase 1: alta del jugador con categoría a validar, reserva de turnos de la grilla fija con precio por franja, cancelación con aviso, transferencia informada con comprobante, Mis reservas. Panel del club: grilla del día en vivo, carga de reservas, turnos fijos y bloqueos, cobros (confirmar, rechazar, efectivo, devoluciones), calendario, jugadores y ajustes.
```

- [ ] **Step 2: Notas**

Agregar al final de `docs/features/fase-1-reservas/notes.md`:
```markdown
- 2026-09-29: decisiones del plan que el diseño no fijaba (detalle en plan.md): `set_my_category(club_id, …)` también da el alta; `validate_category` la usan recepción y admin (confirmar con Miguel); códigos de error extra `not_found`, `invalid_state`, `invalid_input`, `method_disabled`; `refund_payment`; tabla `recurring_series_skips`; columnas generadas `starts_at`/`ends_at`; las series no cuentan para `max_active_bookings`; un PR borrador desde el corte 1.
```

Durante la ejecución, cada desvío del plan se agrega a `notes.md` en su propia línea con fecha, como en la fase 0.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/features/fase-1-reservas/notes.md
git commit -m "docs: document fase 1 booking and club panel"
```

---

### Task 54: Verificación completa y PR listo

**Files:** ninguno.

- [ ] **Step 1: Todo desde cero**

Run:
```bash
npm run db:reset
npm run db:types
git status --short
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
npx playwright test
```
Expected: `git status` limpio (los tipos no cambian); todo en verde. `npm run build` usa `.env.local`; si apunta a producción está bien, el build no escribe nada.

- [ ] **Step 2: Revisión**

Correr `/team-setup:discipline-check` sobre toda la rama y `/security-review`. Arreglar lo que surja en commits aparte y volver al Step 1.

- [ ] **Step 3: Estado de los docs**

En `docs/features/fase-1-reservas/design.md` cambiar `status: design` → `status: approved`; en este `plan.md` agregar la revisión en "Plan revisions" si el plan cambió durante la ejecución.

- [ ] **Step 4: PR listo para revisar**

Run: `git push`
Usar `/team-setup:write-pr-description` para reescribir la descripción del PR (qué entra por corte, decisiones del plan, cómo probar) y marcarlo **Ready for review** (con `gh pr ready` o desde GitHub). La descripción termina con:
```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
Expected: CI en verde en el PR.

---

### Task 55: MANUAL (usuario) — Datos reales de Rustic

Bloqueado hasta que Rustic pase: canchas (nombre, techada o no), horario (¿cambia por día?), duración del turno, precios por franja, aviso de cancelación, límite de reservas activas y datos de transferencia. Si el horario cambia según el día, **parar**: la grilla fija es una por club y hace falta volver a `/team-setup:brainstorm`.

**Files:**
- Create: `supabase/migrations/20261001000100_rustic_data.sql` (la fecha del nombre es la del día en que se escribe; tiene que ser posterior a `20260929000900`)

- [ ] **Step 1: Migración de datos**

Mismos ids que `seed.sql`, así el seed local queda como no-op y producción recibe las mismas filas. Reemplazar cada valor marcado `-- Rustic:` con el dato confirmado por el club antes de commitear (la plantilla trae los del prototipo):
```sql
-- Rustic's real data. Confirmed by the club on <fecha en que Rustic confirmó>.
insert into public.clubs (id, slug, name, timezone, opens_at, closes_at, slot_minutes, booking_window_days,
                          cancellation_notice_hours, max_active_bookings, accepts_cash, accepts_transfer,
                          transfer_details, transfer_receipt_required) values
  ('11111111-1111-1111-1111-111111111111', 'rustic', 'Rustic Pádel', 'America/Montevideo',
   '08:00',   -- Rustic: apertura
   '23:00',   -- Rustic: cierre
   90,        -- Rustic: minutos por turno
   14,        -- Rustic: días para reservar por adelantado
   24,        -- Rustic: horas de aviso para cancelar
   2,         -- Rustic: reservas activas por jugador
   true, true,
   'Banco, tipo y número de cuenta, titular',  -- Rustic: datos de transferencia
   true)
on conflict (id) do nothing;

insert into public.courts (id, club_id, name, is_covered, sort_order) values
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111', 'Cancha 1', true, 1),   -- Rustic
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111111', 'Cancha 2', true, 2),   -- Rustic
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111111', 'Cancha 3', false, 3)   -- Rustic
on conflict (id) do nothing;

insert into public.pricing_rules (id, club_id, weekdays, from_time, to_time, price) values
  ('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111111', '{0,1,2,3,4,5,6}', '08:00', '18:30', 1200),  -- Rustic
  ('33333333-3333-3333-3333-333333333302', '11111111-1111-1111-1111-111111111111', '{0,1,2,3,4,5,6}', '18:30', '24:00', 1600)   -- Rustic
on conflict (id) do nothing;
```
Si Rustic tiene más o menos canchas o franjas, agregar o quitar filas con ids nuevos del mismo formato (`…204`, `…303`). Hacer lo mismo en `seed.sql` para que local y producción coincidan.

- [ ] **Step 2: Verificar y commit**

Run:
```bash
npm run db:reset
npm run test:db
npx playwright test
```
Expected: verde. Los flujos leen la configuración del club, así que siguen pasando con los datos reales; si Rustic no toma transferencias, el flujo 1 necesita ajustarse (parar y avisar).
```bash
git add supabase/migrations/20261001000100_rustic_data.sql supabase/seed.sql
git commit -m "feat(db): load Rustic's real courts, hours and prices"
git push
```

---

### Task 56: MANUAL (usuario) — Rustic prueba el preview

El preview de Vercel usa el Supabase de producción (decisión de la fase 0), que todavía no tiene las migraciones de la fase 1: sin ellas el preview falla. Las migraciones son compatibles con la app de `main` (la fase 0 no usa las columnas borradas ni escribe ocupaciones), así que se pueden aplicar antes del merge.

- [ ] **Step 1: Migrar producción desde la rama**

En GitHub → Actions → **Migrate production** → **Run workflow** → rama `feat/fase-1-reservas`. Solo con CI en verde en el último commit de la rama. Expected: `db push --dry-run` lista las migraciones `20260929000100` … `20260929000900` (y la de datos si la Task 55 ya entró) y el job termina `success`.

- [ ] **Step 2: Comprobar en Supabase (SQL editor)**

```sql
select jobname, schedule from cron.job;
select id, public from storage.buckets where id = 'receipts';
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
```
Expected: `extend-recurring-series | 0 7 * * *`; `receipts | false`; `court_occupancy` en la lista. Si falta `pg_cron`, habilitarlo en Database → Extensions y volver a correr el workflow.

- [ ] **Step 3: Prueba con Rustic**

Abrir el preview del PR en el celular con alguien de Rustic: alta, reserva, Mis reservas, "Ya transferí"; y en el panel (darle rol admin a la cuenta del club con el SQL del README, en el SQL editor de producción): grilla, cobro, turno fijo, bloqueo, calendario, jugadores y ajustes. Anotar en `notes.md` lo que pidan cambiar; lo que no sea un bug va a la fase siguiente.

---

### Task 57: Merge y producción

- [ ] **Step 1: Merge**

Con el PR aprobado y CI en verde, hacer merge a `main`. `migrate.yml` corre después de CI; si la Task 56 ya migró, `db push` no tiene nada pendiente.

- [ ] **Step 2: Verificar producción**

Run: `gh run list --workflow migrate.yml --limit 1` (o en GitHub → Actions).
Expected: `completed success`. En la URL de producción: ingresar, reservar un turno y cancelarlo desde Mis reservas.

- [ ] **Step 3: Cerrar la fase**

Cambiar `status: in-progress` → `status: done` en este plan y `status: approved` → `status: done` en `design.md`; commitear por PR. Antes del piloto con clientes reales: Vercel Pro (plan general).

---

## Criterios de aceptación

- [ ] Un jugador nuevo no puede reservar sin completar nombre, lado, mano y categoría; la categoría queda "pendiente de validación".
- [ ] Reservar solo acepta turnos de la grilla (`opens_at` + n × `slot_minutes`, terminando a más tardar en `closes_at`), a futuro, dentro de `booking_window_days`, con precio, sin otra reserva propia a esa hora y por debajo de `max_active_bookings`; cada regla tiene su test pgTAP.
- [ ] Dos personas nunca ocupan la misma cancha a la misma hora; el choque llega como `slot_taken` y la hoja lo explica sin cerrarse.
- [ ] El precio se congela al reservar y sale de la franja que cubre la hora de inicio; un turno sin franja no se ofrece al jugador y en la grilla del club dice "Sin precio".
- [ ] El jugador cancela solo con `cancellation_notice_hours` de aviso; si no, ve el motivo. Recepción cancela cualquier reserva.
- [ ] "Ya transferí" muestra los datos de la cuenta, sube el comprobante a `receipts/<user_id>/…` y lo informa; un jugador no puede leer ni subir comprobantes ajenos.
- [ ] Recepción ve la grilla del día en vivo con titular y estado de pago, carga reservas (jugador o nombre), turnos fijos (con fechas salteadas informadas) y bloqueos de cualquier duración, cobra en efectivo, cancela y libera.
- [ ] Cobros lista transferencias para confirmar (con comprobante por URL firmada), reservas jugadas sin pagar y pagos a devolver.
- [ ] `pg_cron` mantiene los turnos fijos 8 semanas adelante.
- [ ] Calendario muestra mes y semana con ocupación y turnos fijos; tocar un día abre su grilla.
- [ ] Jugadores permite validar categorías (recepción y admin) y cambiar roles (admin, nunca el propio).
- [ ] Ajustes (solo admin) cambia horario, duración, ventana, aviso, límite, medios de pago, canchas y precios sin tocar reservas existentes.
- [ ] `authenticated` no tiene INSERT/UPDATE/DELETE sobre `bookings`, `court_occupancy` ni `payments`.
- [ ] En verde: lint, typecheck, Vitest, pgTAP, build y los tres flujos Playwright (más el smoke) en CI.
- [ ] README y notas actualizados; preview probado por Rustic.

## Preguntas abiertas que no bloquean

- ¿Recepción valida categorías (propósito y pantallas del diseño) o solo el admin (tabla de RPCs)? El plan deja a recepción; cambiarlo es una línea en `validate_category`.
- Datos reales de Rustic (Task 55), incluido si el horario cambia según el día.
- ¿`max_active_bookings = 2` es el número correcto para Rustic?
- ¿Un PR al final (lo que hace el plan) o uno por corte?

## Plan revisions

(append-only)

- **v1 (2026-09-29)**: scaffold.
- **v2 (2026-09-29)**: plan completo por los 7 cortes del diseño (57 tasks).
