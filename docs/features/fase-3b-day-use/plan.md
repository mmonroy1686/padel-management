---
feature: fase-3b-day-use
type: plan
status: in-progress
date: 2026-10-01
branch: feat/fase-3b-day-use
references: ./design.md, ../fase-3a-torneos/plan.md, ../fase-3a-torneos/notes.md, ../fase-1-reservas/design.md, ../../plan-general.md
---

# Fase 3b (day use) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/team-setup:execute` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Rustic ofrezca pases diarios (day use) que bloquean sus canchas en sus días y horarios, que el jugador compre su pase, reciba un QR y pague como una reserva, que recepción escanee el QR o lo busque y registre el ingreso, que cada ingreso sume un sello hacia un descuento y que todos vean "Ya están en el club".

**Architecture:** Igual que las fases 1 a 3a: cada escritura es una función `security definer` de Postgres con `search_path = ''` y códigos de error estables (`private.fail`). Las canchas de un pase se bloquean como los turnos fijos: ocupaciones `day_use` generadas hasta la ventana de reservas y extendidas por `pg_cron`, con la restricción de exclusión como última palabra. Los pagos usan la tabla `payments` con `day_use_pass_id` (exactamente uno de reserva, inscripción o pase). Los sellos se calculan (`private.loyalty_of` y su espejo `lib/domain/loyalty.ts`), no se guardan. El QR es un SVG generado en el servidor con `qrcode`, con el link al panel del club. Next.js lee con la sesión del usuario (RLS), las reglas y textos salen de `lib/domain`, y las Server Actions validan con `lib/domain/input.ts` y traducen el error con `lib/actions/result.ts`.

**Tech Stack:** Next.js 16.3 (App Router, `proxy.ts`), React 19, TypeScript, Tailwind 4, Supabase (Postgres 17, Auth, Realtime, Storage, `pg_cron`), `@supabase/ssr`, `qrcode` (nuevo), Vitest + Testing Library, pgTAP, Playwright con Mailpit.

---

## Antes de empezar

- Rama: `feat/fase-3b-day-use` (ya existe, sale de `main` con la fase 3a mergeada y el diseño commiteado en `be04695`). Commits chicos; cada corte termina en verde.
- Docker Desktop corriendo. El CLI de Supabase es devDependency: `npx supabase …` o los scripts de npm (`npm run test:db`, `npm run db:reset`, `npm run db:types`). No hay CLI global. `gh` no está instalado (nota de la fase 3a): el PR se abre y se marca listo desde GitHub.
- Windows: **los archivos con barras invertidas (`\ir` en los tests pgTAP, regex en TypeScript) se escriben con la herramienta Write**, nunca con heredoc ni `sed`. Las rutas con paréntesis o corchetes (`app/(jugador)/…`, `[id]`) van entre comillas en bash.
- Next 16: antes de usar una API de Next, leer su guía en `node_modules/next/dist/docs/01-app/` (ver `AGENTS.md`). Las usadas acá: rutas dinámicas con `params` como Promise (`03-api-reference/03-file-conventions/dynamic-routes.md`), `searchParams` como Promise (`03-api-reference/03-file-conventions/page.md`), `notFound` (`03-api-reference/04-functions/not-found.md`), `redirect` (`03-api-reference/04-functions/redirect.md`), Server Actions (`01-getting-started/07-mutating-data.md`).
- Producción: las migraciones llegan con el merge (`migrate.yml`). **Nunca** correr `supabase link`, `db push` ni nada contra producción desde la máquina local (Miguel corre los comandos de producción). Las migraciones ya aplicadas **no se editan**: todo cambio es una migración nueva.
- Migraciones nuevas: `supabase/migrations/20261002000100_*.sql` … `20261002000140_*.sql` (todas posteriores a `20261001000260_tournament_review_fixes.sql`). Un arreglo de la revisión final va en `20261002000150_*.sql`.
- Docs en español; identificadores, comentarios de SQL y de código en inglés.
- pgTAP: un test se corre con `npx supabase test db supabase/tests/database/<archivo>.test.sql`; todos con `npm run test:db`. Los tests de day use incluyen `\ir helpers/slot.psql`, `\ir helpers/club.psql`, `\ir helpers/match.psql` y, desde esta fase, `\ir helpers/day_use.psql`.
- Cada migración nueva se aplica con `npm run db:reset` y después `npm run db:types` regenera `lib/supabase/database.types.ts`, que CI compara byte a byte.
- Datos del fixture pgTAP (club T, `helpers/club.psql` + `helpers/match.psql`): grilla 08:00–23:00 cada 90 min, **ventana de 14 días**, zona `America/Montevideo`, transferencia con comprobante obligatorio y efectivo, canchas `c0000000-0000-0000-0000-000000000001` (Cancha 1) y `…0002` (Cancha 2). Personas: Ana `…a1`, Bruno `…b1`, Gabi `…a2`, Hugo `…a3`, Iván `…a4`, Juli `…a5` (jugadores), Carla `…c1` (recepción), Dani `…d1` (admin), Omar `…f1` (no es miembro). Desde esta fase `helpers/day_use.psql` agrega el club B (`a0000000-0000-0000-0000-000000000002`) con Eva `…e1` como **admin** y su Cancha B `cb000000-0000-0000-0000-000000000001`: el "staff de otro club" de cada test (lección de la fase 3a). En este documento `…a1` abrevia `00000000-0000-0000-0000-0000000000a1`; **en los archivos va siempre el uuid completo**.
- `now()` es fijo dentro de la transacción de cada test: las cuentas de "ya empezó" son deterministas en un mismo archivo. Los pases de "hoy" usan productos de 00:00 a 24:00 para no depender de la hora en que corre el test; el único que depende de la hora es el de "el horario de hoy ya terminó" (00:00 a 00:01), que solo fallaría si se corre en el primer minuto del día.
- Lección de la fase 3a, **orden de bloqueo**: toda función que toque pagos informados y el pase bloquea **primero los pagos y después el pase**, el mismo orden que `confirm_payment` (`private.staff_payment` bloquea el pago, después el pase).
- Soporte e2e (`tests/e2e/support`): `createMember`, `signedInClient`, `clubRow`, `adminClient`, `signInWithMagicLink`. Lección de la fase 3a: **el indicador de desarrollo de Next tapa la pestaña de abajo a la izquierda en móvil: en e2e se navega con `page.goto`, nunca con clicks en las pestañas.**
- jsdom: los file inputs se leen por `ref`; los `select` se cambian con `userEvent.selectOptions`.

## Decisiones que este plan toma (y que el diseño no fijaba)

| Tema | Decisión | Por qué |
| --- | --- | --- |
| Código del pase | `DU-` y 6 dígitos al azar, único por club (`unique (club_id, code)`; `private.new_day_use_code` reintenta si choca) | Con 4 dígitos (el ejemplo del diseño) se agotan en 9.000 pases; 6 dígitos se leen en voz alta y se tipean igual de fácil |
| Columna de la fecha | `on_date` (como `recurring_series_skips`) en pases y excepciones | `date` es un nombre de tipo: confunde en SQL y en los embeds |
| Lo que cuesta un pase | Columna generada `total = price × (100 − discount_percent) / 100` (división entera) | La base, Cobros y las pantallas leen el mismo número; `lib/domain/day-use.ts` lo replica en `passTotal` |
| Avisos de canchas ocupadas | Se calculan al leer (`unblockedCourts`: días abiertos × canchas del pase sin su ocupación); no hay tabla de saltos. Guardar devuelve cuántos tramos se saltearon, para el mensaje | Siempre al día, también para lo que extiende el cron |
| Horizonte | Hasta hoy + `booking_window_days` (lo mismo que puede reservar un jugador); `generated_until` guarda hasta dónde se generó | Diseño: "hasta la ventana de reservas del club" |
| Regenerar | Guardar, activar/desactivar o cambiar una excepción borra las ocupaciones del pase que **no empezaron** y las crea de nuevo; un tramo que ya empezó queda como está | Nunca se mueve una cancha que ya está en uso |
| Pases vendidos y configuración | Cambiar días, precio, cerrar una fecha o desactivar no cancela ni cambia pases vendidos (guardan su precio); recepción los cancela a mano si hace falta | El pase es un compromiso con el jugador; la config es para lo que viene |
| Cupo para los jugadores | RPC `day_use_sold(club, desde, hasta)`: cantidades por pase y día (vendidos y adentro), sin nombres | Cada jugador solo lee sus pases (RLS); el cupo y "Hoy: N en el club" necesitan los totales |
| "Ya están en el club" | `day_use_inside(club, fecha)`: para jugadores, solo miembros con `show_in_club`; los invitados sin cuenta no aparecen (cuentan en el total). El staff ve a todos | Un invitado nunca eligió aparecer |
| Horario terminado | `buy_day_use` y `sell_day_use` responden `in_the_past` si el horario de ese día ya terminó | Mismo código que un turno que pasó |
| Ventana de venta | Online y en recepción: de hoy a hoy + `booking_window_days` (`outside_window`) | Una sola regla |
| Pases inactivos | No se venden: `day_use_closed` | Para el jugador es "ese día no hay" |
| Ingreso sin pagar | Se puede registrar el ingreso aunque el pase deba; queda en Cobros | Recepción cobra en la puerta sin frenar la fila |
| Cancelar | El jugador cancela su pase comprado de hoy o de un día que viene (`in_the_past` si ya pasó); recepción, cualquier pase comprado. Después del ingreso: `already_checked_in` | Diseño: "mientras no se registró el ingreso" |
| Sin cobrar (Cobros) | Pases no cancelados de hoy o de días anteriores (últimos 30) que deben y no tienen transferencia informada | Los de días que vienen se cobran desde "Hoy" o el link del QR |
| Resumen de "Hoy" | "Ingresos de hoy" = pagos confirmados de los pases de hoy; "Adentro" = ingresos registrados hoy; "Recompensas usadas" = pases con recompensa no cancelados de los últimos 30 días | "Ingresos" en el diseño es plata |
| Recompensa en recepción | Casilla "Usar su recompensa" al vender a un jugador cuando el club tiene sellos; la base responde `no_reward` si no tiene | Recepción no calcula sellos de todos los socios |
| Configuración | `save_day_use_product`, `set_day_use_product_active` y `set_day_use_override` son solo para admin (`has_club_role(..., 'admin')`); recepción recibe `forbidden` | Diseño: "Solo admin" |
| `save_day_use_product` | Recibe `p_club_id` (un pase puede no bloquear canchas, así que el club no sale de ellas) y devuelve `table (saved_id uuid, skipped_count integer)` | La acción necesita el id y la cuenta de tramos salteados |
| Excepción igual a la regla | Si la excepción coincide con la regla semanal, se borra | No quedan excepciones que no cambian nada |
| Sellos en Ajustes | Update directo de `clubs` como admin (como el resto de Ajustes), con `check` en la tabla | Mismo camino que horarios y medios de pago |
| `show_in_club` | RPC `set_show_in_club(boolean)` | Diseño; la acción no toca el resto del perfil |
| Tiempo real | `day_use_passes` en Realtime; `LiveOccupancy` lo escucha | La lista de "Hoy" se actualiza sola cuando alguien compra y la pantalla del pase cuando recepción registra el ingreso |
| Pestaña del club | "Day use" después de Torneos, con el ícono `ticket` que ya existe | Diseño |
| Grilla | Estilo propio `day_use` (borde punteado azul) y "Day use" en la leyenda; la nota de la ocupación es el nombre del pase | La grilla ya sabe el tipo `day_use` y su etiqueta |
| Semana del jugador | 7 días desde hoy en el `DayStrip`, que ahora tacha los días sin day use (`closed`) | Diseño: "tachados sin day use" |
| QR | `lib/qr/pass-qr.ts` (`server-only`) con `qrcode.toString(url, { type: 'svg' })`; el link es `${getSiteUrl()}/club/day-use/pase/<código>` | Diseño: sin escáner en la app, el QR abre el panel |
| PR | Un PR borrador desde el corte 1 (Task 3), listo al final | Igual que las fases anteriores: CI corre en cada push |

## Mapa de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `supabase/migrations/20261002000100_day_use.sql` | Sellos en `clubs`, `profiles.show_in_club`, tablas `day_use_products`, `day_use_overrides`, `day_use_passes`, RLS, `court_occupancy.day_use_product_id`, `payments.day_use_pass_id`, `guard_court_delete` con pases |
| `supabase/migrations/20261002000110_day_use_products.sql` | Horizonte, días abiertos, generación y regeneración de ocupaciones, `save_day_use_product`, `set_day_use_product_active`, `set_day_use_override`, `extend_all_day_use` y el cron |
| `supabase/migrations/20261002000120_day_use_passes.sql` | `loyalty_of`, código, `sell_pass`, `buy_day_use`, `sell_day_use`, `cancel_day_use`, `check_in_day_use`, `day_use_inside`, `day_use_sold`, `set_show_in_club` |
| `supabase/migrations/20261002000130_day_use_payments.sql` | `pass_due`, `report_day_use_transfer`, `record_day_use_cash`, `confirm_payment` con pases |
| `supabase/migrations/20261002000140_realtime_day_use.sql` | `day_use_passes` en Realtime |
| `supabase/tests/database/helpers/day_use.psql` | Club B con Eva, `make_product`, `make_pass`, `add_visits`, `pass_of` |
| `supabase/tests/database/day_use_*.test.sql`, `realtime_day_use.test.sql` | pgTAP: `day_use_schema`, `day_use_products`, `day_use_passes`, `day_use_loyalty`, `day_use_payments`, `realtime_day_use` |
| `lib/domain/day-use.ts` | Tipos, lectura de filas, días abiertos, semana, textos, cupo, compra, cancelación, búsqueda, código, canchas sin bloquear |
| `lib/domain/loyalty.ts` | Regla de sellos, `loyaltyOf` (espejo de `private.loyalty_of`), textos, formulario de Ajustes |
| `lib/domain/day-use-form.ts` | Formulario de un pase (crear y editar) |
| `lib/domain/day-use-payments.ts` | "Sin cobrar", "A devolver" e ingresos del día de los pases |
| `lib/qr/pass-qr.ts` | SVG del QR (servidor) |
| `lib/data/day-use.ts` | Carga de pases, excepciones, cupo, "adentro", pases del jugador y del día, ocupaciones, tarjeta de Inicio |
| `lib/data/payments.ts` | Cobros con pases |
| `app/(jugador)/day-use/…` | `/day-use`, `/day-use/pase/[id]` (con `pass-board.tsx`), acciones |
| `app/(club)/club/day-use/…` | Hoy, `pase/[codigo]`, `configuracion`, acciones |
| `components/day-use/*` | `StampRow`, `InsideList`, `ProductOffer`, `DayUseHomeCard`, `PassStaffCard`, `SellSheet`, `PassesToday`, `ProductForm`, `OverrideCalendar` |
| `components/booking/day-strip.tsx` | Días tachados |
| `app/(jugador)/page.tsx`, `app/(jugador)/perfil/page.tsx`, `lib/actions/profile.ts` | Tarjeta de Inicio; "Aparecer en «Ya están en el club»" |
| `app/(club)/club/ajustes/{page,actions}.tsx` | Sección Sellos |
| `lib/club/tabs.ts` | Pestaña Day use |
| `components/booking/{cell-styles,slot-grid,legend}.tsx` | Bloque de day use en la grilla |
| `app/(club)/club/cobros/page.tsx` | Pases sin cobrar y a devolver |
| `components/live/live-occupancy.tsx`, `app/globals.css` | Escucha pases; animación del sello |
| `tests/e2e/support/{day-use,global-setup}.ts`, `tests/e2e/day-use.spec.ts` | El flujo e2e y su limpieza |

## Secuencia por cortes

| Corte | Tasks | Resultado | Cómo se prueba |
| --- | --- | --- | --- |
| 1. Modelo | 1–3 | Tablas de day use, lectura, pagos por pase | pgTAP |
| 2. RPCs | 4–8 | Pases y canchas, compra, venta, ingreso, sellos, pagos, en vivo | pgTAP |
| 3. Dominio TS | 9–14 | Reglas, sellos, formularios, Cobros, QR | Vitest |
| 4. Datos y acciones | 15–16 | Carga y Server Actions | Vitest + typecheck |
| 5. Pantallas del jugador | 17–23 | `/day-use`, `/day-use/pase/<id>`, Inicio, Perfil | Vitest |
| 6. Pantallas del club | 24–35 | Hoy, link del QR, configuración, Sellos, grilla, Cobros, en vivo | Vitest |
| 7. e2e y cierre | 36–38 | Flujo completo del day use; PR listo | Playwright |

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
Expected: `feat/fase-3b-day-use`; el último commit es `docs: fase 3b day use design` sobre el merge del PR #8; `db reset` aplica las migraciones hasta `20261001000260_tournament_review_fixes.sql` y `seed.sql`.

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

### Task 2: Day use en la base (tablas, lectura y pagos)

**Files:**
- Create: `supabase/tests/database/helpers/day_use.psql`
- Create: `supabase/tests/database/day_use_schema.test.sql`
- Create: `supabase/migrations/20261002000100_day_use.sql`

- [ ] **Step 1: Test helper** (con la herramienta Write)

`supabase/tests/database/helpers/day_use.psql`:
```sql
-- Fase 3b fixture. Include it after slot.psql, club.psql and match.psql:
--   \ir helpers/day_use.psql
-- Club B with its admin Eva (e1) and Cancha B: the "staff of another club" of every day use test.
-- Products and passes inserted as postgres (skips the RPC rules on purpose). Unless told otherwise a
-- product runs every day from 08:00 to 12:30 for 30 people at $450 and blocks no court.
insert into public.clubs (id, slug, name) values ('a0000000-0000-0000-0000-000000000002', 'test-club-b', 'Club B');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'eva@test.local');
insert into public.club_members (club_id, user_id, role) values
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e1', 'admin');
insert into public.courts (id, club_id, name, sort_order) values
  ('cb000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Cancha B', 1);

-- Pass codes for the fixture: DU-100000, DU-100001, ...
create sequence test_helpers.pass_code start 100000;

create procedure test_helpers.make_product(
  p_id uuid,
  p_name text default 'Day use T',
  p_weekdays smallint[] default array[0, 1, 2, 3, 4, 5, 6]::smallint[],
  p_from time default '08:00',
  p_to time default '12:30',
  p_capacity integer default 30,
  p_price integer default 450,
  p_courts uuid[] default array[]::uuid[],
  p_active boolean default true
)
language sql
as $$
  insert into public.day_use_products (id, club_id, name, price, weekdays, from_time, to_time, capacity, court_ids,
                                       is_active)
  values (p_id, 'a0000000-0000-0000-0000-000000000001', p_name, p_price, p_weekdays, p_from, p_to, p_capacity,
          p_courts, p_active);
$$;

-- A member's pass on today + p_days, bought online. A reward pass takes 100 % off.
create procedure test_helpers.make_pass(
  p_id uuid,
  p_product_id uuid,
  p_days integer,
  p_player_id uuid,
  p_status public.day_use_pass_status default 'bought',
  p_used_reward boolean default false
)
language sql
as $$
  insert into public.day_use_passes (id, club_id, product_id, on_date, player_id, price, discount_percent, used_reward,
                                     code, status, source, checked_in_at, cancelled_at)
  values (p_id, 'a0000000-0000-0000-0000-000000000001', p_product_id, test_helpers.today() + p_days, p_player_id, 450,
          case when p_used_reward then 100 else 0 end, p_used_reward,
          'DU-' || nextval('test_helpers.pass_code'), p_status, 'online',
          case when p_status = 'inside' then now() end, case when p_status = 'cancelled' then now() end);
$$;

-- p_count past check-ins of a member, one per day, the newest p_days_ago days back.
create procedure test_helpers.add_visits(p_product_id uuid, p_player_id uuid, p_count integer, p_days_ago integer default 1)
language sql
as $$
  insert into public.day_use_passes (club_id, product_id, on_date, player_id, price, code, status, source, checked_in_at)
  select 'a0000000-0000-0000-0000-000000000001', p_product_id, test_helpers.today() - p_days_ago - n, p_player_id, 450,
         'DU-' || nextval('test_helpers.pass_code'), 'inside', 'online', now()
  from generate_series(0, p_count - 1) as n;
$$;

-- The pass of a member on today + p_days that was not cancelled. Runs as the caller: under RLS a
-- player finds only her own passes and staff every pass of their club.
create function test_helpers.pass_of(p_player_id uuid, p_days integer)
returns uuid
language sql
stable
as $$
  select id from public.day_use_passes
  where player_id = p_player_id and on_date = test_helpers.today() + p_days and status <> 'cancelled'
  limit 1;
$$;
```

- [ ] **Step 2: Write the failing test** (con la herramienta Write)

`supabase/tests/database/day_use_schema.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
select plan(28);

select has_table('public', 'day_use_products', 'day_use_products exists');
select has_table('public', 'day_use_overrides', 'day_use_overrides exists');
select has_table('public', 'day_use_passes', 'day_use_passes exists');

-- P runs every day; P3 blocks a court nobody else uses. Ana and Bruno bought P for tomorrow.
call test_helpers.make_product('d0000000-0000-0000-0000-000000000001');
insert into public.courts (id, club_id, name, sort_order) values
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Cancha 3', 3);
call test_helpers.make_product('d0000000-0000-0000-0000-000000000003', 'Con cancha',
  p_courts => array['c0000000-0000-0000-0000-000000000003']::uuid[]);
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 1,
  '00000000-0000-0000-0000-0000000000a1');
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 1,
  '00000000-0000-0000-0000-0000000000b1');
insert into public.day_use_overrides (club_id, product_id, on_date, enabled) values
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 2, false);

select throws_ok(
  $$ update public.day_use_passes set status = 'inside' where id = 'dd000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a pass inside has a check-in time');
select throws_ok(
  $$ insert into public.day_use_passes (club_id, product_id, on_date, player_id, guest_name, price, code, source)
     values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 3,
             '00000000-0000-0000-0000-0000000000a1', 'Ana', 450, 'DU-' || nextval('test_helpers.pass_code'), 'online') $$,
  '23514', null, 'a pass is for a member or a name');
select throws_ok(
  $$ insert into public.day_use_passes (club_id, product_id, on_date, guest_name, price, discount_percent, used_reward,
                                        code, source)
     values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 3,
             'Pepe', 450, 100, true, 'DU-' || nextval('test_helpers.pass_code'), 'reception') $$,
  '23514', null, 'only members use rewards');
select throws_ok(
  $$ insert into public.day_use_passes (club_id, product_id, on_date, player_id, price, code, source)
     values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 1,
             '00000000-0000-0000-0000-0000000000a1', 450, 'DU-' || nextval('test_helpers.pass_code'), 'online') $$,
  '23505', null, 'one active pass per member, pass and day');

update public.day_use_passes set status = 'cancelled', cancelled_at = now()
 where id = 'dd000000-0000-0000-0000-000000000001';
select lives_ok(
  $$ insert into public.day_use_passes (club_id, product_id, on_date, player_id, price, code, source)
     values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 1,
             '00000000-0000-0000-0000-0000000000a1', 450, 'DU-' || nextval('test_helpers.pass_code'), 'online') $$,
  'after cancelling she can buy it again');

insert into public.day_use_passes (id, club_id, product_id, on_date, player_id, price, discount_percent, used_reward,
                                   code, source)
values ('dd000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, '00000000-0000-0000-0000-0000000000a2', 450,
        50, true, 'DU-' || nextval('test_helpers.pass_code'), 'online');
select is((select total from public.day_use_passes where id = 'dd000000-0000-0000-0000-000000000009'), 225,
  'the total takes the reward off');

select throws_ok(
  $$ insert into public.day_use_passes (club_id, product_id, on_date, player_id, price, code, source)
     values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 4,
             '00000000-0000-0000-0000-0000000000a3', 450, 'X-1', 'online') $$,
  '23514', null, 'a code is DU- and six digits');
select throws_ok(
  $$ insert into public.day_use_passes (club_id, product_id, on_date, player_id, price, code, source)
     select 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 4,
            '00000000-0000-0000-0000-0000000000a3', 450, code, 'online'
     from public.day_use_passes where id = 'dd000000-0000-0000-0000-000000000002' $$,
  '23505', null, 'a code is unique in the club');
select throws_ok(
  $$ insert into public.payments (club_id, method, amount, status)
     values ('a0000000-0000-0000-0000-000000000001', 'cash', 450, 'confirmed') $$,
  '23514', null, 'a payment is for a booking, an entry or a pass');

call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(5, '18:30', 90), '00000000-0000-0000-0000-0000000000a1', 1600);
select throws_ok(
  $$ insert into public.payments (club_id, booking_id, day_use_pass_id, method, amount, status)
     values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
             'dd000000-0000-0000-0000-000000000002', 'cash', 450, 'confirmed') $$,
  '23514', null, 'and only one of them');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, day_use_product_id)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'block',
             test_helpers.slot(9, '10:00', 60), 'd0000000-0000-0000-0000-000000000001') $$,
  '23514', null, 'only day use occupancies point at a pass');
select throws_ok(
  $$ update public.clubs set loyalty_every = 0 where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a reward takes at least one stamp');
select throws_ok(
  $$ insert into public.day_use_products (club_id, name, price, weekdays, from_time, to_time, capacity)
     values ('a0000000-0000-0000-0000-000000000001', 'Al revés', 450, '{6}', '12:30', '08:00', 30) $$,
  '23514', null, 'a pass ends after it starts');

-- Ana, member
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select is((select count(*)::int from public.day_use_products), 2, 'members read the passes the club offers');
select is((select count(*)::int from public.day_use_overrides), 1, 'and its exceptions');
select is((select count(*)::int from public.day_use_passes), 2, 'a player reads only her own passes');
select lives_ok($$ select day_use_product_id from public.court_occupancy $$,
  'members read which pass holds a court');
select throws_ok(
  $$ insert into public.day_use_passes (club_id, product_id, on_date, player_id, price, code, source)
     values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 6,
             '00000000-0000-0000-0000-0000000000a1', 0, 'DU-999999', 'online') $$,
  '42501', null, 'players cannot write passes directly');
select is((select show_in_club from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), true,
  'everyone shows in "Ya están en el club" by default');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select is((select count(*)::int from public.day_use_passes), 4, 'staff read every pass of the club');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select is((select count(*)::int from public.day_use_products), 0, 'staff of another club read no passes offered here');
select is((select count(*)::int from public.day_use_passes), 0, 'nor any pass sold here');

-- Dani, admin
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select throws_ok(
  $$ delete from public.courts where id = 'c0000000-0000-0000-0000-000000000003' $$,
  'P0001', 'court_has_history', 'a court a day use pass blocks cannot be deleted');

-- Anonymous visitor
set local role anon;
select throws_ok($$ select * from public.day_use_products $$, '42501', null, 'anon cannot read the passes offered');
select throws_ok($$ select * from public.day_use_passes $$, '42501', null, 'anon cannot read passes');

select * from finish();
rollback;
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/day_use_schema.test.sql`
Expected: FAIL (`relation "public.day_use_products" does not exist` al incluir el helper).

- [ ] **Step 4: Write the migration**

`supabase/migrations/20261002000100_day_use.sql`:
```sql
-- Fase 3b data model: day use. The club defines the passes it offers (products) with their weekdays,
-- hours, daily capacity and the courts they block; overrides open or close one date; players and
-- reception buy passes, reception checks them in, and every check-in is a stamp towards a reward.
-- Every write goes through the functions of the next migrations: authenticated only reads.

-- The stamps rule, off until the club sets it up (Ajustes → Sellos). Stamps are never stored:
-- private.loyalty_of counts them from the passes.
alter table public.clubs
  add column loyalty_enabled boolean not null default false,
  add column loyalty_every smallint not null default 5,
  add column loyalty_discount_percent smallint not null default 100,
  add column loyalty_expiry_months smallint default 6,
  add constraint clubs_loyalty_every check (loyalty_every between 1 and 50),
  add constraint clubs_loyalty_discount check (loyalty_discount_percent between 1 and 100),
  add constraint clubs_loyalty_expiry check (loyalty_expiry_months is null or loyalty_expiry_months between 1 and 36);

-- "Ya están en el club": everyone shows by default; each player can hide from it.
alter table public.profiles add column show_in_club boolean not null default true;

create type public.day_use_pass_status as enum ('bought', 'inside', 'cancelled');

create table public.day_use_products (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  price integer not null check (price between 0 and 10000000),
  includes text[] not null default '{}',
  -- 0 = Sunday ... 6 = Saturday, like extract(dow). Empty: only the dates an override opens.
  weekdays smallint[] not null,
  from_time time not null,
  to_time time not null,
  capacity smallint not null check (capacity between 1 and 500),
  -- The courts it blocks while it runs (none is fine). Array elements take no FK: the occupancies
  -- and private.guard_court_delete keep them honest.
  court_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  -- Last date whose occupancies were generated; the daily job goes on from there.
  generated_until date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Target for the composite FKs of overrides and passes.
  unique (id, club_id),
  constraint day_use_products_weekdays check (weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  constraint day_use_products_times check (from_time < to_time),
  constraint day_use_products_includes check (cardinality(includes) <= 8 and array_position(includes, null) is null)
);
create index day_use_products_club_id_idx on public.day_use_products (club_id);
alter table public.day_use_products enable row level security;

-- One date that differs from the weekly rule: opens a day it does not run, or closes one it does.
create table public.day_use_overrides (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  product_id uuid not null,
  on_date date not null,
  enabled boolean not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint day_use_overrides_product_in_club
    foreign key (product_id, club_id) references public.day_use_products (id, club_id) on delete cascade,
  unique (product_id, on_date)
);
alter table public.day_use_overrides enable row level security;

-- A pass for one day, for a member or a name. Cancelling keeps the row: its payments may need a refund.
create table public.day_use_passes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  product_id uuid not null,
  on_date date not null,
  player_id uuid references public.profiles (id),
  guest_name text,
  -- The product's price when it was sold.
  price integer not null check (price between 0 and 10000000),
  discount_percent smallint not null default 0 check (discount_percent between 0 and 100),
  used_reward boolean not null default false,
  -- What it costs after the reward; payments cover this (lib/domain/day-use.ts passTotal).
  total integer generated always as ((price * (100 - discount_percent)) / 100) stored,
  code text not null check (code ~ '^DU-[0-9]{6}$'),
  status public.day_use_pass_status not null default 'bought',
  source public.booking_source not null,
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Target for the composite FK in payments.
  unique (id, club_id),
  unique (club_id, code),
  constraint day_use_passes_product_in_club
    foreign key (product_id, club_id) references public.day_use_products (id, club_id) on delete cascade,
  constraint day_use_passes_holder check (
    num_nonnulls(player_id, guest_name) = 1 and (guest_name is null or length(trim(guest_name)) between 1 and 60)
  ),
  -- A reward is the only discount, and only a member has rewards.
  constraint day_use_passes_reward check (used_reward = (discount_percent > 0) and (not used_reward or player_id is not null)),
  constraint day_use_passes_checked_in check ((status = 'inside') = (checked_in_at is not null)),
  constraint day_use_passes_cancelled check ((status = 'cancelled') = (cancelled_at is not null))
);
create unique index day_use_passes_one_per_player on public.day_use_passes (product_id, on_date, player_id)
  where status <> 'cancelled' and player_id is not null;
create index day_use_passes_club_date_idx on public.day_use_passes (club_id, on_date);
create index day_use_passes_player_id_idx on public.day_use_passes (player_id);
alter table public.day_use_passes enable row level security;

-- Each court a product blocks points at it; deleting the product (never done by the app) takes them.
alter table public.court_occupancy
  add column day_use_product_id uuid references public.day_use_products (id) on delete cascade,
  add constraint court_occupancy_day_use_kind check (day_use_product_id is null or kind = 'day_use');
create index court_occupancy_day_use_product_id_idx on public.court_occupancy (day_use_product_id);
-- Members read which pass holds a court (never note, which stays for staff).
grant select (day_use_product_id) on public.court_occupancy to authenticated;

-- A payment is for a booking, a tournament entry or a day use pass: exactly one.
alter table public.payments
  add column day_use_pass_id uuid,
  add constraint payments_pass_in_club
    foreign key (day_use_pass_id, club_id) references public.day_use_passes (id, club_id) on delete cascade;
alter table public.payments drop constraint payments_one_target;
alter table public.payments
  add constraint payments_one_target check (num_nonnulls(booking_id, tournament_entry_id, day_use_pass_id) = 1);
create index payments_day_use_pass_id_idx on public.payments (day_use_pass_id);
create unique index payments_one_reported_per_pass on public.payments (day_use_pass_id)
  where status = 'reported' and day_use_pass_id is not null;

-- A court a day use pass blocks has history too.
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
    or exists (select 1 from public.day_use_products where old.id = any (court_ids))
  ) then
    perform private.fail('court_has_history');
  end if;
  return old;
end;
$$;

revoke all on public.day_use_products, public.day_use_overrides, public.day_use_passes from anon, authenticated;
grant select on public.day_use_products, public.day_use_overrides, public.day_use_passes to authenticated;

create policy day_use_products_select_members on public.day_use_products
  for select to authenticated using (private.is_club_member(club_id));
create policy day_use_overrides_select_members on public.day_use_overrides
  for select to authenticated using (private.is_club_member(club_id));
-- Who bought what is private: each player reads her own passes; staff read every pass of the club.
-- Totals for everyone come from day_use_sold and day_use_inside.
create policy day_use_passes_select_own_or_staff on public.day_use_passes
  for select to authenticated
  using (
    player_id = (select auth.uid())
    or private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
  );
```

The `payments_select_own_or_staff` policy does not change: a pass payment carries `payer_id` = the player (null for a guest), so `payer_id = auth.uid()` already covers the player.

- [ ] **Step 5: Apply and run the test**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/day_use_schema.test.sql
```
Expected: PASS (28 tests).

- [ ] **Step 6: Run the whole pgTAP suite**

Run: `npm run test:db`
Expected: PASS. `integrity.test.sql` sigue en verde (ninguna función nueva ejecutable por `anon`), `schema.test.sql` también (las tres tablas tienen RLS), `court_delete.test.sql` y `tournament_*` con el `guard_court_delete` nuevo.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261002000100_day_use.sql supabase/tests/database/helpers/day_use.psql supabase/tests/database/day_use_schema.test.sql
git commit -m "feat(db): day use passes, overrides and stamps rule"
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
Expected: aparecen `day_use_products`, `day_use_overrides`, `day_use_passes`, el enum `day_use_pass_status`, las columnas `loyalty_*` en `clubs` y `show_in_club` en `profiles`. Typecheck y Vitest en verde.

- [ ] **Step 2: Commit, push y PR borrador**

```bash
git add lib/supabase/database.types.ts
git commit -m "chore(types): day use tables"
git push -u origin feat/fase-3b-day-use
```
Abrir el PR borrador desde GitHub (`gh` no está instalado): base `main`, título "Fase 3b: day use", cuerpo:
```text
Plan: docs/features/fase-3b-day-use/plan.md. Se marca listo al final (Task 38).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
Expected: PR borrador creado; CI corre en cada push.

---
## Corte 2: RPCs de day use

### Task 4: Pases que ofrece el club y sus canchas

**Files:**
- Create: `supabase/tests/database/day_use_products.test.sql`
- Create: `supabase/migrations/20261002000110_day_use_products.sql`

- [ ] **Step 1: Write the failing test** (con la herramienta Write)

`supabase/tests/database/day_use_products.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
select plan(30);

-- Day offsets of the future occupancies of a product, in order.
create function test_helpers.day_use_days(p_name text)
returns setof integer
language sql
stable
as $$
  select ((o.starts_at at time zone 'America/Montevideo')::date - test_helpers.today())::integer
  from public.court_occupancy o
  join public.day_use_products p on p.id = o.day_use_product_id
  where p.name = p_name
  order by o.starts_at;
$$;

-- Bruno's booking takes Cancha 1 on day 3 from 09:30 to 11:00.
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(3, '09:30', 90), '00000000-0000-0000-0000-0000000000b1', 1200);

set local role authenticated;

-- Dani, admin
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select is(
  (select skipped_count from public.save_day_use_product('a0000000-0000-0000-0000-000000000001', 'Day use completo',
     450, array['Vestuarios', ' Pileta ', ''], array[0, 1, 2, 3, 4, 5, 6], '08:00', '12:30', 30,
     array['c0000000-0000-0000-0000-000000000001']::uuid[], 1)),
  1, 'admin creates a pass that blocks Cancha 1; the day it is taken is skipped and counted');
select results_eq(
  $$ select name, price, includes, weekdays, capacity::int, court_ids, is_active from public.day_use_products
     where name = 'Day use completo' $$,
  $$ values ('Day use completo', 450, array['Vestuarios', 'Pileta'], array[0, 1, 2, 3, 4, 5, 6]::smallint[], 30,
             array['c0000000-0000-0000-0000-000000000001']::uuid[], true) $$,
  'with its price, what it includes, its days, capacity and courts');

reset role;
select ok(
  exists (select 1 from public.court_occupancy o join public.day_use_products p on p.id = o.day_use_product_id
          where p.name = 'Day use completo' and o.court_id = 'c0000000-0000-0000-0000-000000000001'
            and o.kind = 'day_use' and o.note = 'Day use completo' and o.period = test_helpers.slot(2, '08:00', 270)),
  'it blocks Cancha 1 while it runs, with its name for the grid');
select ok(
  not exists (select 1 from public.court_occupancy o join public.day_use_products p on p.id = o.day_use_product_id
              where p.name = 'Day use completo' and o.starts_at = test_helpers.at(3, '08:00')),
  'the day Cancha 1 is taken is skipped');
select is((select generated_until from public.day_use_products where name = 'Day use completo'),
  test_helpers.today() + 14, 'generated up to the booking window');
-- Under RLS, Eva (club B) cannot look the id up.
select id as product_id from public.day_use_products where name = 'Day use completo' \gset

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select lives_ok(
  $$ select * from public.save_day_use_product('a0000000-0000-0000-0000-000000000001', 'Pileta', 200, array[]::text[],
       array[6, 0], '13:00', '18:00', 40, array[]::uuid[]) $$,
  'a pass that blocks no court');
select lives_ok(
  $$ select * from public.save_day_use_product('a0000000-0000-0000-0000-000000000001', 'Day use completo', 500,
       array['Vestuarios'], array[extract(dow from test_helpers.today() + 2)::integer], '08:00', '12:30', 30,
       array['c0000000-0000-0000-0000-000000000001']::uuid[], 1,
       (select id from public.day_use_products where name = 'Day use completo')) $$,
  'admin edits it: one weekday only, new price');

reset role;
select results_eq($$ select * from test_helpers.day_use_days('Day use completo') $$, $$ values (2), (9) $$,
  'editing moves its courts to the new days');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select lives_ok(
  $$ select public.set_day_use_override((select id from public.day_use_products where name = 'Day use completo'),
       test_helpers.today() + 4, true) $$,
  'admin opens a date it does not run');
select lives_ok(
  $$ select public.set_day_use_override((select id from public.day_use_products where name = 'Day use completo'),
       test_helpers.today() + 9, false) $$,
  'and closes a date it runs');

reset role;
select results_eq($$ select * from test_helpers.day_use_days('Day use completo') $$, $$ values (2), (4) $$,
  'the courts follow the exceptions');
select is(
  (select count(*)::int from public.day_use_overrides o join public.day_use_products p on p.id = o.product_id
   where p.name = 'Day use completo'),
  2, 'both exceptions are kept');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select lives_ok(
  $$ select public.set_day_use_override((select id from public.day_use_products where name = 'Day use completo'),
       test_helpers.today() + 4, false) $$,
  'admin takes an exception back');

reset role;
select is(
  (select count(*)::int from public.day_use_overrides o join public.day_use_products p on p.id = o.product_id
   where p.name = 'Day use completo'),
  1, 'going back to the weekly rule removes the exception');
select results_eq($$ select * from test_helpers.day_use_days('Day use completo') $$, $$ values (2) $$,
  'and frees the court that day');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select throws_ok(
  $$ select public.set_day_use_override((select id from public.day_use_products where name = 'Day use completo'),
       test_helpers.today() - 1, true) $$,
  'P0001', 'in_the_past', 'no exceptions for days that passed');
select lives_ok(
  $$ select public.set_day_use_product_active((select id from public.day_use_products where name = 'Day use completo'),
       false) $$,
  'admin deactivates a pass');

reset role;
select is_empty($$ select * from test_helpers.day_use_days('Day use completo') $$,
  'a deactivated pass frees its courts');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select lives_ok(
  $$ select public.set_day_use_product_active((select id from public.day_use_products where name = 'Day use completo'),
       true) $$,
  'and activates it again');

reset role;
select results_eq($$ select * from test_helpers.day_use_days('Day use completo') $$, $$ values (2) $$,
  'reactivating blocks its courts again, exceptions included');

-- The daily job: every day again, and pretend it was generated only up to day 10.
update public.day_use_products set weekdays = array[0, 1, 2, 3, 4, 5, 6]::smallint[],
                                   generated_until = test_helpers.today() + 10
 where name = 'Day use completo';
select is(private.extend_all_day_use(), 1, 'the daily job extends the passes that need it');
select results_eq(
  $$ select d from test_helpers.day_use_days('Day use completo') as d where d > 10 $$,
  $$ values (11), (12), (13), (14) $$,
  'up to the booking window');
select is((select count(*)::int from cron.job where jobname = 'extend-day-use'), 1, 'pg_cron runs it every day');

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  $$ select * from public.save_day_use_product('a0000000-0000-0000-0000-000000000001', 'Mío', 100, array[]::text[],
       array[6], '08:00', '10:00', 10, array[]::uuid[]) $$,
  'P0001', 'forbidden', 'reception does not configure passes');
select throws_ok(
  $$ select public.set_day_use_override((select id from public.day_use_products where name = 'Pileta'),
       test_helpers.today() + 5, true) $$,
  'P0001', 'forbidden', 'nor their exceptions');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  $$ select * from public.save_day_use_product('a0000000-0000-0000-0000-000000000001', 'Ajeno', 100, array[]::text[],
       array[6], '08:00', '10:00', 10, array[]::uuid[]) $$,
  'P0001', 'forbidden', 'an admin of another club cannot create passes here');
select throws_ok(
  format('select public.set_day_use_product_active(%L, false)', :'product_id'),
  'P0001', 'forbidden', 'nor deactivate one of this club');

-- Dani, admin: bad input
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select throws_ok(
  $$ select * from public.save_day_use_product('a0000000-0000-0000-0000-000000000001', 'Al revés', 100,
       array[]::text[], array[6], '12:30', '08:00', 10, array[]::uuid[]) $$,
  'P0001', 'invalid_input', 'a pass ends after it starts');
select throws_ok(
  $$ select * from public.save_day_use_product('a0000000-0000-0000-0000-000000000001', 'Otra cancha', 100,
       array[]::text[], array[6], '08:00', '10:00', 10, array['cb000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'P0001', 'invalid_input', 'only active courts of the club');

-- Anonymous visitor
set local role anon;
select throws_ok(
  $$ select * from public.save_day_use_product('a0000000-0000-0000-0000-000000000001', 'Anónimo', 100,
       array[]::text[], array[6], '08:00', '10:00', 10, array[]::uuid[]) $$,
  '42501', null, 'anon cannot call save_day_use_product');

select * from finish();
rollback;
```

Why the days come out like that: the pass runs on the weekday of today + 2, so within the 14-day window only days 2 and 9 match; day 4 opens by exception and day 9 closes by exception. `now()` is the same for the whole transaction, so whether today's 08:00 already started never changes inside the test.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/day_use_products.test.sql`
Expected: FAIL (`function public.save_day_use_product(...) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261002000110_day_use_products.sql`:
```sql
-- Day use, part 1: the passes the club offers. Each one blocks its courts on the days it runs,
-- generated up to the club's booking window and extended by a daily pg_cron job, like recurring
-- slots. A court already taken at that time is skipped (the configuration screen lists them), and
-- the exclusion constraint has the last word. Only admins configure passes.

-- Up to where occupancies are generated: as far as players can book.
create function private.day_use_horizon(p_club_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select private.club_today(c.id) + c.booking_window_days from public.clubs c where c.id = p_club_id;
$$;

-- Whether the product runs on that date: an override decides; otherwise its weekdays.
-- lib/domain/day-use.ts isOpenOn mirrors it.
create function private.day_use_open_on(p_product public.day_use_products, p_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_product.is_active and coalesce(
    (select o.enabled from public.day_use_overrides o where o.product_id = p_product.id and o.on_date = p_date),
    extract(dow from p_date)::smallint = any (p_product.weekdays)
  );
$$;

-- The product's hours on that date, on the club's clock.
create function private.day_use_period(p_product public.day_use_products, p_date date)
returns tstzrange
language sql
stable
set search_path = ''
as $$
  select tstzrange((p_date + p_product.from_time) at time zone c.timezone,
                   (p_date + p_product.to_time) at time zone c.timezone)
  from public.clubs c where c.id = p_product.club_id;
$$;

-- Blocks the product's courts from p_from to p_until (inclusive) on the dates it runs that have not
-- started yet. Returns how many court-dates it had to skip (court taken or inactive). It does not
-- move generated_until: callers do.
create function private.generate_day_use(p_product public.day_use_products, p_from date, p_until date)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_date date := p_from;
  v_period tstzrange;
  v_court_id uuid;
  v_skipped integer := 0;
begin
  while v_date <= p_until loop
    if private.day_use_open_on(p_product, v_date) then
      v_period := private.day_use_period(p_product, v_date);
      if lower(v_period) > now() then
        foreach v_court_id in array p_product.court_ids loop
          if not exists (
            select 1 from public.courts c where c.id = v_court_id and c.club_id = p_product.club_id and c.is_active
          ) then
            v_skipped := v_skipped + 1;
          elsif not exists (
            select 1 from public.court_occupancy o
            where o.day_use_product_id = p_product.id and o.court_id = v_court_id and o.period = v_period
          ) then
            begin
              insert into public.court_occupancy (club_id, court_id, kind, period, note, day_use_product_id, created_by)
              values (p_product.club_id, v_court_id, 'day_use', v_period, p_product.name, p_product.id,
                      (select auth.uid()));
            exception when exclusion_violation then
              v_skipped := v_skipped + 1;
            end;
          end if;
        end loop;
      end if;
    end if;
    v_date := v_date + 1;
  end loop;
  return v_skipped;
end;
$$;

-- Frees what has not started yet and blocks it again from today to the horizon, with the product
-- as it is now (an inactive one blocks nothing). Returns how many court-dates were skipped.
create function private.regenerate_day_use(p_product public.day_use_products)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_until date := private.day_use_horizon(p_product.club_id);
  v_skipped integer;
begin
  delete from public.court_occupancy where day_use_product_id = p_product.id and starts_at > now();
  v_skipped := private.generate_day_use(p_product, private.club_today(p_product.club_id), v_until);
  update public.day_use_products set generated_until = v_until where id = p_product.id;
  return v_skipped;
end;
$$;

-- Creates (p_product_id null) or edits a pass. Passes already sold keep their price and date; only
-- the courts follow the new rule.
create function public.save_day_use_product(
  p_club_id uuid,
  p_name text,
  p_price integer,
  p_includes text[],
  p_weekdays integer[],
  p_from_time time,
  p_to_time time,
  p_capacity integer,
  p_court_ids uuid[],
  p_sort_order integer default 0,
  p_product_id uuid default null
)
returns table (saved_id uuid, skipped_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(p_name);
  v_includes text[];
  v_weekdays smallint[];
  v_courts uuid[] := coalesce(p_court_ids, '{}');
  v_product public.day_use_products;
begin
  if p_club_id is null or not private.has_club_role(p_club_id, array['admin']::public.club_role[]) then
    perform private.fail('forbidden');
  end if;
  if p_product_id is not null then
    select * into v_product from public.day_use_products
     where id = p_product_id and club_id = p_club_id
       for update;
    if not found then
      perform private.fail('not_found');
    end if;
  end if;

  select coalesce(array_agg(trim(u.item) order by u.n), '{}') into v_includes
  from unnest(coalesce(p_includes, '{}')) with ordinality as u (item, n)
  where trim(u.item) <> '';
  select coalesce(array_agg(distinct u.wd order by u.wd), '{}')::smallint[] into v_weekdays
  from unnest(coalesce(p_weekdays, '{}')) as u (wd);

  if v_name is null or length(v_name) not between 1 and 60
     or p_price is null or p_price not between 0 and 10000000
     or cardinality(v_includes) > 8
     or exists (select 1 from unnest(v_includes) as u (item) where length(u.item) > 40)
     or exists (select 1 from unnest(coalesce(p_weekdays, '{}')) as u (wd) where u.wd is null or u.wd not between 0 and 6)
     or p_from_time is null or p_to_time is null or p_from_time >= p_to_time
     or p_capacity is null or p_capacity not between 1 and 500
     or coalesce(p_sort_order, 0) not between 0 and 100
     or array_position(v_courts, null) is not null
     or (select count(distinct u.court_id) from unnest(v_courts) as u (court_id)) <> cardinality(v_courts)
     or exists (
       select 1 from unnest(v_courts) as u (court_id)
       where not exists (
         select 1 from public.courts c where c.id = u.court_id and c.club_id = p_club_id and c.is_active
       )
     ) then
    perform private.fail('invalid_input');
  end if;

  if p_product_id is null then
    insert into public.day_use_products (club_id, name, price, includes, weekdays, from_time, to_time, capacity,
                                         court_ids, sort_order, created_by)
    values (p_club_id, v_name, p_price, v_includes, v_weekdays, p_from_time, p_to_time, p_capacity, v_courts,
            coalesce(p_sort_order, 0), (select auth.uid()))
    returning * into v_product;
  else
    update public.day_use_products
       set name = v_name, price = p_price, includes = v_includes, weekdays = v_weekdays, from_time = p_from_time,
           to_time = p_to_time, capacity = p_capacity, court_ids = v_courts, sort_order = coalesce(p_sort_order, 0)
     where id = v_product.id
    returning * into v_product;
  end if;

  return query select v_product.id, private.regenerate_day_use(v_product);
end;
$$;

-- Deactivating stops sales and frees the courts from now on; passes already sold stay valid.
-- Activating blocks them again. Returns how many court-dates were skipped.
create function public.set_day_use_product_active(p_product_id uuid, p_active boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.day_use_products;
begin
  select * into v_product from public.day_use_products where id = p_product_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.has_club_role(v_product.club_id, array['admin']::public.club_role[]) then
    perform private.fail('forbidden');
  end if;
  if p_active is null then
    perform private.fail('invalid_input');
  end if;
  update public.day_use_products set is_active = p_active where id = v_product.id returning * into v_product;
  return private.regenerate_day_use(v_product);
end;
$$;

-- Opens or closes one date. An exception equal to the weekly rule is removed. Passes already sold
-- for that date stay (reception cancels them if needed). Returns how many courts were skipped.
create function public.set_day_use_override(p_product_id uuid, p_date date, p_enabled boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.day_use_products;
  v_timezone text;
  v_skipped integer := 0;
begin
  select * into v_product from public.day_use_products where id = p_product_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.has_club_role(v_product.club_id, array['admin']::public.club_role[]) then
    perform private.fail('forbidden');
  end if;
  if p_date is null or p_enabled is null then
    perform private.fail('invalid_input');
  end if;
  if p_date < private.club_today(v_product.club_id) then
    perform private.fail('in_the_past');
  end if;

  if p_enabled = (extract(dow from p_date)::smallint = any (v_product.weekdays)) then
    delete from public.day_use_overrides where product_id = v_product.id and on_date = p_date;
  else
    insert into public.day_use_overrides (club_id, product_id, on_date, enabled, created_by)
    values (v_product.club_id, v_product.id, p_date, p_enabled, (select auth.uid()))
    on conflict (product_id, on_date) do update set enabled = excluded.enabled, created_by = excluded.created_by;
  end if;

  select timezone into v_timezone from public.clubs where id = v_product.club_id;
  delete from public.court_occupancy
   where day_use_product_id = v_product.id
     and starts_at > now()
     and starts_at >= p_date::timestamp at time zone v_timezone
     and starts_at < (p_date + 1)::timestamp at time zone v_timezone;
  if p_date <= private.day_use_horizon(v_product.club_id) then
    v_skipped := private.generate_day_use(v_product, p_date, p_date);
  end if;
  return v_skipped;
end;
$$;

-- Keeps every active pass blocked up to its horizon. One failing pass does not stop the others.
-- Returns how many passes it extended.
create function private.extend_all_day_use()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_product public.day_use_products;
  v_today date;
  v_until date;
  v_count integer := 0;
begin
  for v_product in select * from public.day_use_products where is_active loop
    v_today := private.club_today(v_product.club_id);
    v_until := private.day_use_horizon(v_product.club_id);
    if v_product.generated_until is null or v_product.generated_until < v_until then
      begin
        perform private.generate_day_use(v_product, greatest(coalesce(v_product.generated_until + 1, v_today), v_today),
                                         v_until);
        update public.day_use_products set generated_until = v_until where id = v_product.id;
        v_count := v_count + 1;
      exception when others then
        raise warning 'extend_all_day_use: product % failed: %', v_product.id, sqlerrm;
      end;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.day_use_horizon(uuid) from public;
revoke all on function private.day_use_open_on(public.day_use_products, date) from public;
revoke all on function private.day_use_period(public.day_use_products, date) from public;
revoke all on function private.generate_day_use(public.day_use_products, date, date) from public;
revoke all on function private.regenerate_day_use(public.day_use_products) from public;
revoke all on function private.extend_all_day_use() from public;
revoke execute on function public.save_day_use_product(uuid, text, integer, text[], integer[], time, time, integer,
  uuid[], integer, uuid) from public, anon;
revoke execute on function public.set_day_use_product_active(uuid, boolean) from public, anon;
revoke execute on function public.set_day_use_override(uuid, date, boolean) from public, anon;
grant execute on function public.save_day_use_product(uuid, text, integer, text[], integer[], time, time, integer,
  uuid[], integer, uuid) to authenticated;
grant execute on function public.set_day_use_product_active(uuid, boolean) to authenticated;
grant execute on function public.set_day_use_override(uuid, date, boolean) to authenticated;

-- Every day at 07:10 UTC (04:10 in Montevideo), after the recurring slots.
select cron.schedule('extend-day-use', '10 7 * * *', 'select private.extend_all_day_use()');
```

- [ ] **Step 4: Apply and run the test**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/day_use_products.test.sql
```
Expected: PASS (30 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261002000110_day_use_products.sql supabase/tests/database/day_use_products.test.sql
git commit -m "feat(db): day use passes block their courts, with exceptions and a daily job"
```

---

### Task 5: Comprar, vender, ingresar, cancelar y los sellos

**Files:**
- Create: `supabase/tests/database/day_use_passes.test.sql`
- Create: `supabase/tests/database/day_use_loyalty.test.sql`
- Create: `supabase/migrations/20261002000120_day_use_passes.sql`

- [ ] **Step 1: Write the failing test for passes** (con la herramienta Write)

`supabase/tests/database/day_use_passes.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
select plan(42);

-- P1: every day, all day, for 2 people. P2: only on the weekday of today + 3. P3: inactive.
-- P4: today's hours are over (00:00 to 00:01). P5: every day, all day, for 30.
call test_helpers.make_product('d0000000-0000-0000-0000-000000000001', 'Day use completo',
  p_from => '00:00', p_to => '24:00', p_capacity => 2);
call test_helpers.make_product('d0000000-0000-0000-0000-000000000002', 'Pileta',
  p_weekdays => array[extract(dow from test_helpers.today() + 3)::smallint], p_from => '00:00', p_to => '24:00');
call test_helpers.make_product('d0000000-0000-0000-0000-000000000003', 'Viejo', p_active => false);
call test_helpers.make_product('d0000000-0000-0000-0000-000000000004', 'Madrugada', p_from => '00:00', p_to => '00:01');
call test_helpers.make_product('d0000000-0000-0000-0000-000000000005', 'Pileta libre', p_from => '00:00', p_to => '24:00');
-- Juli bought P1 for day 5; Hugo bought P1 for yesterday and never came; Iván is in today (P5).
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 5,
  '00000000-0000-0000-0000-0000000000a5');
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', -1,
  '00000000-0000-0000-0000-0000000000a3');
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000005', 0,
  '00000000-0000-0000-0000-0000000000a4', 'inside');

set local role authenticated;

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 1) $$,
  'a member buys a pass');
select results_eq(
  $$ select status::text, source::text, price, discount_percent::int, total, code ~ '^DU-[0-9]{6}$', used_reward
     from public.day_use_passes where player_id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('bought', 'online', 450, 0, 450, true, false) $$,
  'bought online at the full price, with its code');
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 1) $$,
  'P0001', 'already_has_pass', 'the same pass once per day');
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000002', test_helpers.today() + 1) $$,
  'P0001', 'day_use_closed', 'not on a day the pass does not run');
select lives_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000002', test_helpers.today() + 3) $$,
  'on its day it sells');
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 15) $$,
  'P0001', 'outside_window', 'not beyond the booking window');
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() - 1) $$,
  'P0001', 'in_the_past', 'not for a day that passed');
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000004', test_helpers.today()) $$,
  'P0001', 'in_the_past', 'not once today''s hours are over');
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000003', test_helpers.today() + 1) $$,
  'P0001', 'day_use_closed', 'an inactive pass is not sold');

-- Bruno and Gabi want P1 for tomorrow too: there is room for two.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select lives_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 1) $$,
  'the second one gets in');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 1) $$,
  'P0001', 'day_use_full', 'no room for a third');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 2) $$,
  'P0001', 'forbidden', 'only members buy passes');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.sell_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 2,
       p_guest_name => ' Pepe ') $$,
  'reception sells to someone without an account');
select results_eq(
  $$ select guest_name, source::text, player_id, created_by from public.day_use_passes where guest_name = 'Pepe' $$,
  $$ values ('Pepe', 'reception', null::uuid, '00000000-0000-0000-0000-0000000000c1'::uuid) $$,
  'with the name trimmed, sold at reception');
select throws_ok(
  $$ select public.sell_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 2) $$,
  'P0001', 'invalid_input', 'a pass needs a member or a name');
select throws_ok(
  $$ select public.sell_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 2,
       p_player_id => '00000000-0000-0000-0000-0000000000f1') $$,
  'P0001', 'invalid_input', 'only to members of the club');
select lives_ok(
  $$ select public.sell_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today(),
       p_player_id => '00000000-0000-0000-0000-0000000000a2') $$,
  'reception sells to a member');
select lives_ok(
  $$ select public.check_in_day_use(test_helpers.pass_of('00000000-0000-0000-0000-0000000000a2', 0)) $$,
  'reception checks in today''s pass');
select results_eq(
  $$ select status::text, checked_in_by from public.day_use_passes
     where player_id = '00000000-0000-0000-0000-0000000000a2' and on_date = test_helpers.today() $$,
  $$ values ('inside', '00000000-0000-0000-0000-0000000000c1'::uuid) $$,
  'she is inside, and reception is recorded');
select throws_ok(
  $$ select public.check_in_day_use(test_helpers.pass_of('00000000-0000-0000-0000-0000000000a2', 0)) $$,
  'P0001', 'already_checked_in', 'a pass is checked in once');
select throws_ok(
  $$ select public.check_in_day_use(test_helpers.pass_of('00000000-0000-0000-0000-0000000000a1', 1)) $$,
  'P0001', 'not_today', 'only on the day of the pass');
select throws_ok(
  $$ select public.cancel_day_use(test_helpers.pass_of('00000000-0000-0000-0000-0000000000a2', 0)) $$,
  'P0001', 'already_checked_in', 'a pass is not cancelled after check-in');

-- Ana cancels hers: her spot is free again.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.cancel_day_use(test_helpers.pass_of('00000000-0000-0000-0000-0000000000a1', 1)) $$,
  'a player cancels her pass before check-in');
select results_eq(
  $$ select status::text, cancelled_by from public.day_use_passes
     where player_id = '00000000-0000-0000-0000-0000000000a1' and on_date = test_helpers.today() + 1 $$,
  $$ values ('cancelled', '00000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'it is cancelled, by her');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 1) $$,
  'her spot is free for someone else');
select throws_ok(
  $$ select public.cancel_day_use('dd000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'a player cancels only her own pass');
select throws_ok(
  $$ select public.check_in_day_use('dd000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'players do not check in');

-- Hugo's pass was for yesterday.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';
select throws_ok(
  $$ select public.cancel_day_use('dd000000-0000-0000-0000-000000000002') $$,
  'P0001', 'in_the_past', 'a player does not cancel a pass of a day that passed');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok($$ select public.cancel_day_use('dd000000-0000-0000-0000-000000000002') $$,
  'reception cancels any pass not checked in');

-- Iván hides; reception sells P5 to a guest and checks her in.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a4", "role": "authenticated"}';
select lives_ok($$ select public.set_show_in_club(false) $$, 'a player hides from "Ya están en el club"');
select is((select show_in_club from public.profiles where id = '00000000-0000-0000-0000-0000000000a4'), false,
  'and it is saved');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select public.sell_day_use('d0000000-0000-0000-0000-000000000005', test_helpers.today(), p_guest_name => 'Rodríguez');
select public.check_in_day_use((select id from public.day_use_passes where guest_name = 'Rodríguez'));

-- Ana, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select results_eq(
  $$ select name, product_name from public.day_use_inside('a0000000-0000-0000-0000-000000000001', test_helpers.today()) $$,
  $$ values ('Gabi', 'Day use completo') $$,
  'players see who is in, without hidden players or guests');
select results_eq(
  $$ select s.on_date - test_helpers.today(), s.sold, s.inside
     from public.day_use_sold('a0000000-0000-0000-0000-000000000001', test_helpers.today(), test_helpers.today() + 3) s
     where s.product_id = 'd0000000-0000-0000-0000-000000000001' order by s.on_date $$,
  $$ values (0, 1, 1), (1, 2, 0), (2, 1, 0) $$,
  'and how many passes are sold and in, per pass and day, cancelled ones left out');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select results_eq(
  $$ select name from public.day_use_inside('a0000000-0000-0000-0000-000000000001', test_helpers.today()) order by name $$,
  $$ values ('Gabi'), ('Iván'), ('Rodríguez') $$,
  'staff see everyone who is in');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select throws_ok(
  $$ select * from public.day_use_inside('a0000000-0000-0000-0000-000000000001', test_helpers.today()) $$,
  'P0001', 'forbidden', 'non-members do not see who is in');
select throws_ok(
  $$ select * from public.day_use_sold('a0000000-0000-0000-0000-000000000001', test_helpers.today(), test_helpers.today()) $$,
  'P0001', 'forbidden', 'nor how many passes are sold');

-- Eva, admin of club B, on club T's rows.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok($$ select public.check_in_day_use('dd000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'staff of another club cannot check in');
select throws_ok($$ select public.cancel_day_use('dd000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'nor cancel');
select throws_ok(
  $$ select public.sell_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 4, p_guest_name => 'X') $$,
  'P0001', 'forbidden', 'nor sell');
select throws_ok(
  $$ select * from public.day_use_inside('a0000000-0000-0000-0000-000000000001', test_helpers.today()) $$,
  'P0001', 'forbidden', 'nor see who is in');

-- Anonymous visitor
set local role anon;
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', current_date) $$,
  '42501', null, 'anon cannot call buy_day_use');
select throws_ok($$ select public.set_show_in_club(true) $$, '42501', null, 'anon cannot call set_show_in_club');

select * from finish();
rollback;
```

- [ ] **Step 2: Write the failing test for stamps** (con la herramienta Write)

`supabase/tests/database/day_use_loyalty.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
select plan(18);

-- Every 3 check-ins, 50 % off the next day use; stamps last 6 months. Ana came twice.
update public.clubs
   set loyalty_enabled = true, loyalty_every = 3, loyalty_discount_percent = 50, loyalty_expiry_months = 6
 where id = 'a0000000-0000-0000-0000-000000000001';
call test_helpers.make_product('d0000000-0000-0000-0000-000000000001', 'Day use completo',
  p_from => '00:00', p_to => '24:00');
call test_helpers.add_visits('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 2, 1);

select results_eq(
  $$ select * from private.loyalty_of('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1') $$,
  $$ values (2, 0, 0, 0, 2) $$,
  'two check-ins are two stamps and no reward yet');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, true) $$,
  'P0001', 'no_reward', 'no reward before the stamps are complete');

reset role;
call test_helpers.add_visits('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 1, 3);
select results_eq(
  $$ select * from private.loyalty_of('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1') $$,
  $$ values (3, 1, 0, 1, 0) $$,
  'the third stamp earns a reward');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, true) $$,
  'she buys with her reward');
select results_eq(
  $$ select discount_percent::int, total, used_reward from public.day_use_passes
     where player_id = '00000000-0000-0000-0000-0000000000a1' and on_date = test_helpers.today() + 1 $$,
  $$ values (50, 225, true) $$,
  'the reward takes the club''s discount off');

reset role;
select results_eq(
  $$ select * from private.loyalty_of('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1') $$,
  $$ values (3, 1, 1, 0, 0) $$,
  'and the reward is used');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 2, true) $$,
  'P0001', 'no_reward', 'a reward is used once');
select lives_ok(
  $$ select public.cancel_day_use(test_helpers.pass_of('00000000-0000-0000-0000-0000000000a1', 1)) $$,
  'she cancels the pass she bought with it');

reset role;
select is(
  (select available from private.loyalty_of('a0000000-0000-0000-0000-000000000001',
                                            '00000000-0000-0000-0000-0000000000a1')),
  1, 'cancelling gives the reward back');

-- A day use with a reward, ten days ago: it uses the reward and adds no stamp.
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000001', -10,
  '00000000-0000-0000-0000-0000000000a1', 'inside', true);
select results_eq(
  $$ select * from private.loyalty_of('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1') $$,
  $$ values (3, 1, 1, 0, 0) $$,
  'a day use with a reward does not add a stamp');

-- Three check-ins about 200 days ago, older than 6 months.
call test_helpers.add_visits('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 3, 200);
select is(
  (select stamps from private.loyalty_of('a0000000-0000-0000-0000-000000000001',
                                         '00000000-0000-0000-0000-0000000000a1')),
  3, 'check-ins older than the expiry do not count');

update public.clubs set loyalty_expiry_months = null where id = 'a0000000-0000-0000-0000-000000000001';
select results_eq(
  $$ select * from private.loyalty_of('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1') $$,
  $$ values (6, 2, 1, 1, 0) $$,
  'without expiry every check-in counts');

update public.clubs set loyalty_enabled = false where id = 'a0000000-0000-0000-0000-000000000001';
select results_eq(
  $$ select * from private.loyalty_of('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1') $$,
  $$ values (0, 0, 0, 0, 0) $$,
  'with stamps off there are no rewards');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 3, true) $$,
  'P0001', 'no_reward', 'nobody uses a reward while stamps are off');

reset role;
update public.clubs set loyalty_enabled = true where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  $$ select public.sell_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 3,
       p_guest_name => 'Pepe', p_use_reward => true) $$,
  'P0001', 'invalid_input', 'someone without an account has no rewards');
select lives_ok(
  $$ select public.sell_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 3,
       p_player_id => '00000000-0000-0000-0000-0000000000a1', p_use_reward => true) $$,
  'reception applies her reward when selling');
select results_eq(
  $$ select source::text, discount_percent::int from public.day_use_passes
     where player_id = '00000000-0000-0000-0000-0000000000a1' and on_date = test_helpers.today() + 3 $$,
  $$ values ('reception', 50) $$,
  'sold at reception with the discount');

-- Bruno never came.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$ select public.buy_day_use('d0000000-0000-0000-0000-000000000001', test_helpers.today() + 1, true) $$,
  'P0001', 'no_reward', 'a player without stamps has no reward');

select * from finish();
rollback;
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:
```bash
npx supabase test db supabase/tests/database/day_use_passes.test.sql
npx supabase test db supabase/tests/database/day_use_loyalty.test.sql
```
Expected: FAIL (`function public.buy_day_use(...) does not exist`; `function private.loyalty_of(...) does not exist`).

- [ ] **Step 4: Write the migration**

`supabase/migrations/20261002000120_day_use_passes.sql`:
```sql
-- Day use, part 2: buying, selling, checking in and cancelling passes, the stamps, who is in and how
-- many passes are sold. Sales of a product are serialized by locking it: in a race for the last spot
-- only one gets in; using a reward takes a per-player lock too.

-- Stamps and rewards of a member (lib/domain/loyalty.ts mirrors it). A stamp is a check-in without a
-- reward inside the expiry window; every loyalty_every stamps earn a reward, and every pass bought
-- with one (not cancelled) in the same window uses it. All zeros while the club has stamps off.
create function private.loyalty_of(p_club_id uuid, p_user_id uuid)
returns table (stamps integer, earned integer, used integer, available integer, progress integer)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_club public.clubs;
  v_since date := '-infinity';
  v_stamps integer;
  v_used integer;
begin
  select * into v_club from public.clubs where id = p_club_id;
  if not found or not v_club.loyalty_enabled then
    return query select 0, 0, 0, 0, 0;
    return;
  end if;
  if v_club.loyalty_expiry_months is not null then
    v_since := (private.club_today(v_club.id) - make_interval(months => v_club.loyalty_expiry_months))::date;
  end if;

  select count(*) filter (where p.status = 'inside' and not p.used_reward)::integer,
         count(*) filter (where p.status <> 'cancelled' and p.used_reward)::integer
    into v_stamps, v_used
  from public.day_use_passes p
  where p.club_id = v_club.id and p.player_id = p_user_id and p.on_date >= v_since;

  return query select v_stamps, v_stamps / v_club.loyalty_every, v_used,
                      greatest(v_stamps / v_club.loyalty_every - v_used, 0), v_stamps % v_club.loyalty_every;
end;
$$;

-- DU- and six random digits, unused in the club. The unique constraint has the last word if two
-- sales pick the same one at the same time.
create function private.new_day_use_code(p_club_id uuid)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_code text;
begin
  loop
    v_code := 'DU-' || lpad(floor(random() * 1000000)::integer::text, 6, '0');
    exit when not exists (select 1 from public.day_use_passes where club_id = p_club_id and code = v_code);
  end loop;
  return v_code;
end;
$$;

-- The rules of a sale, online or at reception (lib/domain/day-use.ts buyStatus mirrors the order).
-- Callers lock the product and check who may sell.
create function private.sell_pass(
  p_product public.day_use_products,
  p_date date,
  p_player_id uuid,
  p_guest_name text,
  p_use_reward boolean,
  p_source public.booking_source
)
returns public.day_use_passes
language plpgsql
set search_path = ''
as $$
declare
  v_club public.clubs;
  v_today date;
  v_discount integer := 0;
  v_pass public.day_use_passes;
begin
  select * into v_club from public.clubs where id = p_product.club_id;
  v_today := private.club_today(v_club.id);
  if p_date is null or p_use_reward is null then
    perform private.fail('invalid_input');
  end if;
  if p_date < v_today then
    perform private.fail('in_the_past');
  end if;
  if p_date > v_today + v_club.booking_window_days then
    perform private.fail('outside_window');
  end if;
  if not private.day_use_open_on(p_product, p_date) then
    perform private.fail('day_use_closed');
  end if;
  if upper(private.day_use_period(p_product, p_date)) <= now() then
    perform private.fail('in_the_past');
  end if;
  if p_player_id is not null and exists (
    select 1 from public.day_use_passes
    where product_id = p_product.id and on_date = p_date and player_id = p_player_id and status <> 'cancelled'
  ) then
    perform private.fail('already_has_pass');
  end if;
  if (select count(*) from public.day_use_passes
      where product_id = p_product.id and on_date = p_date and status <> 'cancelled') >= p_product.capacity then
    perform private.fail('day_use_full');
  end if;

  if p_use_reward then
    if p_player_id is null then
      perform private.fail('invalid_input');
    end if;
    -- Two sales with the same reward, even of different passes, cannot both slip in.
    perform pg_advisory_xact_lock(hashtextextended('day_use_reward:' || p_player_id::text, 0));
    if (select l.available from private.loyalty_of(v_club.id, p_player_id) l) < 1 then
      perform private.fail('no_reward');
    end if;
    v_discount := v_club.loyalty_discount_percent;
  end if;

  insert into public.day_use_passes (club_id, product_id, on_date, player_id, guest_name, price, discount_percent,
                                     used_reward, code, source, created_by)
  values (v_club.id, p_product.id, p_date, p_player_id, p_guest_name, p_product.price, v_discount, p_use_reward,
          private.new_day_use_code(v_club.id), p_source, (select auth.uid()))
  returning * into v_pass;
  return v_pass;
end;
$$;

create function public.buy_day_use(p_product_id uuid, p_date date, p_use_reward boolean default false)
returns public.day_use_passes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_product public.day_use_products;
begin
  select * into v_product from public.day_use_products where id = p_product_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null or not private.is_club_member(v_product.club_id) then
    perform private.fail('forbidden');
  end if;
  return private.sell_pass(v_product, p_date, v_uid, null, coalesce(p_use_reward, false), 'online');
end;
$$;

-- Reception sells to a member (who may use her reward) or to a name.
create function public.sell_day_use(
  p_product_id uuid,
  p_date date,
  p_player_id uuid default null,
  p_guest_name text default null,
  p_use_reward boolean default false
)
returns public.day_use_passes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.day_use_products;
  v_guest text := nullif(trim(p_guest_name), '');
begin
  select * into v_product from public.day_use_products where id = p_product_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_product.club_id) then
    perform private.fail('forbidden');
  end if;
  if num_nonnulls(p_player_id, v_guest) <> 1 or length(v_guest) > 60 then
    perform private.fail('invalid_input');
  end if;
  if p_player_id is not null and not exists (
    select 1 from public.club_members where club_id = v_product.club_id and user_id = p_player_id
  ) then
    perform private.fail('invalid_input');
  end if;
  return private.sell_pass(v_product, p_date, p_player_id, v_guest, coalesce(p_use_reward, false), 'reception');
end;
$$;

-- The player cancels her own pass of today or a coming day; reception, any pass not checked in.
-- The spot is free again, a reward comes back (a cancelled pass does not use it), a reported
-- transfer is rejected and confirmed payments stay so Cobros lists them to refund.
create function public.cancel_day_use(p_pass_id uuid)
returns public.day_use_passes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_pass public.day_use_passes;
  v_staff boolean;
begin
  select * into v_pass from public.day_use_passes where id = p_pass_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_staff := private.is_staff(v_pass.club_id);
  if not v_staff and (v_uid is null or v_pass.player_id is distinct from v_uid) then
    perform private.fail('forbidden');
  end if;

  -- Payments before the pass, the same order as confirm_payment, so the two cannot deadlock.
  perform 1 from public.payments where day_use_pass_id = v_pass.id and status = 'reported' for update;
  select * into v_pass from public.day_use_passes where id = p_pass_id for update;
  if v_pass.status = 'inside' then
    perform private.fail('already_checked_in');
  end if;
  if v_pass.status = 'cancelled' then
    perform private.fail('invalid_state');
  end if;
  if not v_staff and v_pass.on_date < private.club_today(v_pass.club_id) then
    perform private.fail('in_the_past');
  end if;

  update public.day_use_passes set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid
   where id = v_pass.id
  returning * into v_pass;
  update public.payments
     set status = 'rejected', rejection_reason = 'Pase cancelado', confirmed_by = v_uid, confirmed_at = now()
   where day_use_pass_id = v_pass.id and status = 'reported';
  return v_pass;
end;
$$;

-- Reception registers the entrance: on the day of the pass, once. Paying is not required (Cobros
-- lists what is owed). Every check-in without a reward is a stamp.
create function public.check_in_day_use(p_pass_id uuid)
returns public.day_use_passes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass public.day_use_passes;
begin
  select * into v_pass from public.day_use_passes where id = p_pass_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_pass.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_pass.status = 'cancelled' then
    perform private.fail('invalid_state');
  end if;
  if v_pass.status = 'inside' then
    perform private.fail('already_checked_in');
  end if;
  if v_pass.on_date <> private.club_today(v_pass.club_id) then
    perform private.fail('not_today');
  end if;

  update public.day_use_passes set status = 'inside', checked_in_at = now(), checked_in_by = (select auth.uid())
   where id = v_pass.id
  returning * into v_pass;
  return v_pass;
end;
$$;

-- "Ya están en el club": name and pass of who checked in that day. Players see members who did not
-- hide; staff see everyone, guests included.
create function public.day_use_inside(p_club_id uuid, p_date date)
returns table (name text, product_name text, checked_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff boolean;
begin
  if not private.is_club_member(p_club_id) then
    perform private.fail('forbidden');
  end if;
  v_staff := private.is_staff(p_club_id);
  return query
    select coalesce(pr.display_name, p.guest_name), d.name, p.checked_in_at
    from public.day_use_passes p
    join public.day_use_products d on d.id = p.product_id
    left join public.profiles pr on pr.id = p.player_id
    where p.club_id = p_club_id and p.on_date = p_date and p.status = 'inside'
      and (v_staff or (p.player_id is not null and pr.show_in_club))
    order by p.checked_in_at;
end;
$$;

-- How many passes are sold (not cancelled) and in, per pass and day: the capacity bars and "Hoy: N en
-- el club". Only totals, never who. At most a month at a time.
create function public.day_use_sold(p_club_id uuid, p_from date, p_to date)
returns table (product_id uuid, on_date date, sold integer, inside integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_club_member(p_club_id) then
    perform private.fail('forbidden');
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 31 then
    perform private.fail('invalid_input');
  end if;
  return query
    select p.product_id, p.on_date, count(*)::integer, (count(*) filter (where p.status = 'inside'))::integer
    from public.day_use_passes p
    where p.club_id = p_club_id and p.on_date between p_from and p_to and p.status <> 'cancelled'
    group by p.product_id, p.on_date;
end;
$$;

create function public.set_show_in_club(p_show boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    perform private.fail('forbidden');
  end if;
  if p_show is null then
    perform private.fail('invalid_input');
  end if;
  update public.profiles set show_in_club = p_show where id = (select auth.uid());
end;
$$;

revoke all on function private.loyalty_of(uuid, uuid) from public;
revoke all on function private.new_day_use_code(uuid) from public;
revoke all on function private.sell_pass(public.day_use_products, date, uuid, text, boolean, public.booking_source)
  from public;
revoke execute on function public.buy_day_use(uuid, date, boolean) from public, anon;
revoke execute on function public.sell_day_use(uuid, date, uuid, text, boolean) from public, anon;
revoke execute on function public.cancel_day_use(uuid) from public, anon;
revoke execute on function public.check_in_day_use(uuid) from public, anon;
revoke execute on function public.day_use_inside(uuid, date) from public, anon;
revoke execute on function public.day_use_sold(uuid, date, date) from public, anon;
revoke execute on function public.set_show_in_club(boolean) from public, anon;
grant execute on function public.buy_day_use(uuid, date, boolean) to authenticated;
grant execute on function public.sell_day_use(uuid, date, uuid, text, boolean) to authenticated;
grant execute on function public.cancel_day_use(uuid) to authenticated;
grant execute on function public.check_in_day_use(uuid) to authenticated;
grant execute on function public.day_use_inside(uuid, date) to authenticated;
grant execute on function public.day_use_sold(uuid, date, date) to authenticated;
grant execute on function public.set_show_in_club(boolean) to authenticated;
```

- [ ] **Step 5: Apply and run the tests**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/day_use_passes.test.sql
npx supabase test db supabase/tests/database/day_use_loyalty.test.sql
```
Expected: PASS (42 y 18 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261002000120_day_use_passes.sql supabase/tests/database/day_use_passes.test.sql supabase/tests/database/day_use_loyalty.test.sql
git commit -m "feat(db): buy, sell, check in and cancel day use passes, with stamps"
```

---

### Task 6: Pagos de pases

**Files:**
- Create: `supabase/tests/database/day_use_payments.test.sql`
- Create: `supabase/migrations/20261002000130_day_use_payments.sql`

- [ ] **Step 1: Write the failing test** (con la herramienta Write)

`supabase/tests/database/day_use_payments.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
select plan(24);

-- $450 passes: Ana and Bruno on day 2, Gabi on day 3, Hugo on day 4 with a 100 % reward, and Pepe
-- (no account) on day 2.
call test_helpers.make_product('d0000000-0000-0000-0000-000000000001', 'Day use completo',
  p_from => '00:00', p_to => '24:00');
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 2,
  '00000000-0000-0000-0000-0000000000a1');
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 2,
  '00000000-0000-0000-0000-0000000000b1');
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 3,
  '00000000-0000-0000-0000-0000000000a2');
call test_helpers.make_pass('dd000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', 4,
  '00000000-0000-0000-0000-0000000000a3', 'bought', true);
insert into public.day_use_passes (id, club_id, product_id, on_date, guest_name, price, code, source)
values ('dd000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001', test_helpers.today() + 2, 'Pepe', 450,
        'DU-' || nextval('test_helpers.pass_code'), 'reception');

insert into storage.objects (bucket_id, name) values
  ('receipts', '00000000-0000-0000-0000-0000000000a1/r.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000a2/r.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000a3/r.png');

set local role authenticated;

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.report_day_use_transfer('dd000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'a player reports the transfer of her pass');
select results_eq(
  $$ select amount, payer_id, booking_id, tournament_entry_id from public.payments
     where day_use_pass_id = 'dd000000-0000-0000-0000-000000000001' $$,
  $$ values (450, '00000000-0000-0000-0000-0000000000a1'::uuid, null::uuid, null::uuid) $$,
  'for what the pass costs, as hers, and for nothing else');
select throws_ok(
  $$ select public.report_day_use_transfer('dd000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'P0001', 'invalid_state', 'one reported transfer per pass');
select throws_ok(
  $$ select public.report_day_use_transfer('dd000000-0000-0000-0000-000000000002',
       '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'P0001', 'forbidden', 'only for her own pass');
select is((select count(*)::int from public.payments), 1, 'a player reads only her own payments');

-- Hugo's pass is free.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';
select throws_ok(
  $$ select public.report_day_use_transfer('dd000000-0000-0000-0000-000000000004',
       '00000000-0000-0000-0000-0000000000a3/r.png') $$,
  'P0001', 'invalid_state', 'a free pass has nothing to pay');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok($$ select public.record_day_use_cash('dd000000-0000-0000-0000-000000000002', 450) $$,
  'reception records cash for a pass');
select throws_ok($$ select public.record_day_use_cash('dd000000-0000-0000-0000-000000000002', 450) $$,
  'P0001', 'invalid_input', 'nobody pays more than the pass costs');
select throws_ok($$ select public.record_day_use_cash('dd000000-0000-0000-0000-000000000001', 450) $$,
  'P0001', 'invalid_input', 'cash does not cover what a reported transfer already covers');
select lives_ok($$ select public.record_day_use_cash('dd000000-0000-0000-0000-000000000005', 450) $$,
  'someone without an account pays cash too');
select results_eq(
  $$ select payer_id from public.payments where day_use_pass_id = 'dd000000-0000-0000-0000-000000000005' $$,
  $$ values (null::uuid) $$,
  'with no payer');
select lives_ok(
  $$ select public.confirm_payment((select id from public.payments
       where day_use_pass_id = 'dd000000-0000-0000-0000-000000000001')) $$,
  'reception confirms the transfer');

-- Gabi reports, then cancels: her transfer is rejected.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ select public.report_day_use_transfer('dd000000-0000-0000-0000-000000000003',
       '00000000-0000-0000-0000-0000000000a2/r.png') $$,
  'another player reports hers');
select lives_ok($$ select public.cancel_day_use('dd000000-0000-0000-0000-000000000003') $$, 'and cancels the pass');
select results_eq(
  $$ select status::text, rejection_reason from public.payments
     where day_use_pass_id = 'dd000000-0000-0000-0000-000000000003' $$,
  $$ values ('rejected', 'Pase cancelado') $$,
  'cancelling rejects the reported transfer');

-- Ana paid and cancels: the payment stays, to be refunded.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok($$ select public.cancel_day_use('dd000000-0000-0000-0000-000000000001') $$,
  'a player who paid can still cancel before check-in');
select is(
  (select status::text from public.payments where day_use_pass_id = 'dd000000-0000-0000-0000-000000000001'),
  'confirmed', 'her payment stays confirmed until the club gives it back');

-- A transfer reported on a cancelled pass (as postgres) cannot be confirmed.
reset role;
insert into public.payments (id, club_id, day_use_pass_id, method, amount, status, payer_id)
values ('ea000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
        'dd000000-0000-0000-0000-000000000001', 'transfer', 450, 'reported', '00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok($$ select public.confirm_payment('ea000000-0000-0000-0000-000000000001') $$,
  'P0001', 'invalid_state', 'nothing is confirmed for a cancelled pass');
select lives_ok(
  $$ select public.refund_payment((select id from public.payments
       where day_use_pass_id = 'dd000000-0000-0000-0000-000000000001' and status = 'confirmed')) $$,
  'reception marks the refund');
select is(
  (select count(*)::int from public.payments
   where day_use_pass_id = 'dd000000-0000-0000-0000-000000000001' and status = 'refunded'),
  1, 'the payment is refunded');

select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in ('day_use_horizon', 'day_use_open_on', 'day_use_period', 'generate_day_use',
                         'regenerate_day_use', 'extend_all_day_use', 'loyalty_of', 'new_day_use_code', 'sell_pass',
                         'pass_due')
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot execute the day use helpers');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok($$ select public.record_day_use_cash('dd000000-0000-0000-0000-000000000002', 1) $$,
  'P0001', 'forbidden', 'staff of another club cannot charge cash');
select throws_ok($$ select public.confirm_payment('ea000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'nor confirm a transfer');

-- Anonymous visitor
set local role anon;
select throws_ok(
  $$ select public.report_day_use_transfer('dd000000-0000-0000-0000-000000000001', null) $$,
  '42501', null, 'anon cannot call report_day_use_transfer');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/day_use_payments.test.sql`
Expected: FAIL (`function public.report_day_use_transfer(unknown, unknown) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261002000130_day_use_payments.sql`:
```sql
-- Payments of day use passes: like a booking of one player. What a pass owes is its total (the price
-- after the reward) minus its confirmed payments; a free pass owes nothing and never reaches Cobros.
-- The player reports a transfer with its receipt; reception confirms or rejects it, records cash, and
-- marks refunds (reject_payment and refund_payment work as they are).

-- The total minus confirmed payments; null for an unknown pass.
create function private.pass_due(p_pass_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select d.total - coalesce((
    select sum(p.amount) from public.payments p
    where p.day_use_pass_id = d.id and p.status = 'confirmed'
  ), 0)::integer
  from public.day_use_passes d
  where d.id = p_pass_id;
$$;

create function public.report_day_use_transfer(p_pass_id uuid, p_receipt_path text default null)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_pass public.day_use_passes;
  v_club public.clubs;
  v_path text := nullif(trim(p_receipt_path), '');
  v_due integer;
  v_payment public.payments;
begin
  select * into v_pass from public.day_use_passes where id = p_pass_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null or v_pass.player_id is distinct from v_uid then
    perform private.fail('forbidden');
  end if;
  if v_pass.status = 'cancelled' then
    perform private.fail('invalid_state');
  end if;

  select * into v_club from public.clubs where id = v_pass.club_id;
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
  if exists (select 1 from public.payments where day_use_pass_id = v_pass.id and status = 'reported') then
    perform private.fail('invalid_state');
  end if;

  v_due := private.pass_due(v_pass.id);
  if v_due <= 0 then
    perform private.fail('invalid_state');
  end if;

  insert into public.payments (club_id, day_use_pass_id, method, amount, status, receipt_path, reported_by, payer_id)
  values (v_pass.club_id, v_pass.id, 'transfer', v_due, 'reported', v_path, v_uid, v_uid)
  returning * into v_payment;
  return v_payment;
end;
$$;

-- What a reported transfer already covers counts as spoken for: cash only takes the rest.
create function public.record_day_use_cash(p_pass_id uuid, p_amount integer)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_pass public.day_use_passes;
  v_reported integer;
  v_payment public.payments;
begin
  select * into v_pass from public.day_use_passes where id = p_pass_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_pass.club_id) then
    perform private.fail('forbidden');
  end if;
  if v_pass.status = 'cancelled' then
    perform private.fail('invalid_state');
  end if;
  if not (select accepts_cash from public.clubs where id = v_pass.club_id) then
    perform private.fail('method_disabled');
  end if;

  select coalesce(sum(amount), 0)::integer into v_reported
  from public.payments where day_use_pass_id = v_pass.id and status = 'reported';
  if p_amount is null or p_amount <= 0 or p_amount > private.pass_due(v_pass.id) - v_reported then
    perform private.fail('invalid_input');
  end if;

  insert into public.payments (club_id, day_use_pass_id, method, amount, status, payer_id, reported_by,
                               confirmed_by, confirmed_at)
  values (v_pass.club_id, v_pass.id, 'cash', p_amount, 'confirmed', v_pass.player_id, v_uid, v_uid, now())
  returning * into v_payment;
  return v_payment;
end;
$$;

-- A reported transfer is confirmed only up to what is still owed: for a booking (its price, or the
-- player's share in a match), for an active entry of a tournament that was not cancelled, or for a
-- day use pass that was not cancelled. The payment is locked first (staff_payment), then its target.
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
  v_pass public.day_use_passes;
  v_left integer;
begin
  if v_payment.status <> 'reported' then
    perform private.fail('invalid_state');
  end if;

  if v_payment.day_use_pass_id is not null then
    select * into v_pass from public.day_use_passes where id = v_payment.day_use_pass_id for update;
    v_left := private.pass_due(v_pass.id);
    if v_pass.status = 'cancelled' or v_left is null or v_payment.amount > v_left then
      perform private.fail('invalid_state');
    end if;
  elsif v_payment.tournament_entry_id is not null then
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

revoke all on function private.pass_due(uuid) from public;
revoke execute on function public.report_day_use_transfer(uuid, text) from public, anon;
revoke execute on function public.record_day_use_cash(uuid, integer) from public, anon;
grant execute on function public.report_day_use_transfer(uuid, text) to authenticated;
grant execute on function public.record_day_use_cash(uuid, integer) to authenticated;
```

- [ ] **Step 4: Apply and run the tests**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/day_use_payments.test.sql
npx supabase test db supabase/tests/database/tournament_payments.test.sql
npx supabase test db supabase/tests/database/match_payments.test.sql
npx supabase test db supabase/tests/database/payments.test.sql
```
Expected: PASS (24 tests en el nuevo; los de pagos de reservas, partidos y torneos siguen en verde con el `confirm_payment` nuevo).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261002000130_day_use_payments.sql supabase/tests/database/day_use_payments.test.sql
git commit -m "feat(db): day use pass payments"
```

---

### Task 7: Pases en vivo (Realtime)

**Files:**
- Create: `supabase/tests/database/realtime_day_use.test.sql`
- Create: `supabase/migrations/20261002000140_realtime_day_use.sql`

- [ ] **Step 1: Write the failing test**

`supabase/tests/database/realtime_day_use.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'day_use_passes'),
  1, 'pass changes are published to Realtime');
select is(
  (select relreplident::text from pg_class where oid = 'public.day_use_passes'::regclass),
  'd', 'passes keep the default replica identity');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/realtime_day_use.test.sql`
Expected: FAIL (`have: 0, want: 1`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261002000140_realtime_day_use.sql`:
```sql
-- Reception's "Hoy" list reloads when someone buys or cancels, and the player's pass when reception
-- checks her in. Realtime applies the select policy (own passes, or staff) to the rows it streams.
-- The app never deletes passes (cancelling is a status).
alter publication supabase_realtime add table public.day_use_passes;
```

- [ ] **Step 4: Apply and run the test**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/realtime_day_use.test.sql
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261002000140_realtime_day_use.sql supabase/tests/database/realtime_day_use.test.sql
git commit -m "feat(db): day use passes in realtime"
```

---

### Task 8: Tipos y verificación del corte 2

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
Expected: aparecen en `Functions` `save_day_use_product` (devuelve `{ saved_id: string; skipped_count: number }[]`), `set_day_use_product_active`, `set_day_use_override`, `buy_day_use`, `sell_day_use`, `cancel_day_use`, `check_in_day_use`, `day_use_inside`, `day_use_sold`, `set_show_in_club`, `report_day_use_transfer`, `record_day_use_cash`. pgTAP completo (tres corridas seguidas en verde), typecheck y Vitest en verde.

- [ ] **Step 2: Commit and push**

```bash
git add lib/supabase/database.types.ts
git commit -m "chore(types): day use functions"
git push
```

---
## Corte 3: Dominio TS

Reglas puras, sin Supabase ni React. Cada módulo replica una regla de la base; la base tiene la última palabra.

### Task 9: Errores nuevos

**Files:**
- Modify: `lib/domain/errors.ts`
- Test: `tests/unit/lib/domain/errors.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/unit/lib/domain/errors.test.ts`, extend `DATABASE_CODES` (after `'invalid_score', 'courts_busy', 'outside_hours',`):
```ts
  'day_use_closed', 'day_use_full', 'already_has_pass', 'no_reward', 'already_checked_in', 'not_today',
```
and add:
```ts
  it('explains the day use rules in words', () => {
    expect(errorMessage('no_reward')).toBe('Todavía no tenés una recompensa para usar.')
    expect(errorMessage('not_today')).toBe('El ingreso se registra el día del pase.')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/errors.test.ts`
Expected: FAIL (`translates day_use_closed`).

- [ ] **Step 3: Write minimal implementation**

In `lib/domain/errors.ts`, add after `outside_hours`:
```ts
  day_use_closed: 'Ese día no hay day use.',
  day_use_full: 'Ya no quedan lugares para ese day use.',
  already_has_pass: 'Ya tenés ese pase para ese día.',
  no_reward: 'Todavía no tenés una recompensa para usar.',
  already_checked_in: 'Ese pase ya registró el ingreso.',
  not_today: 'El ingreso se registra el día del pase.',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/errors.ts tests/unit/lib/domain/errors.test.ts
git commit -m "feat(domain): Spanish text for the day use errors"
```

---

### Task 10: Day use: tipos, lectura y reglas (`lib/domain/day-use.ts`)

**Files:**
- Create: `lib/domain/day-use.ts`
- Create: `tests/unit/fixtures/day-use.ts`
- Test: `tests/unit/lib/domain/day-use.test.ts`

- [ ] **Step 1: Test fixture**

`tests/unit/fixtures/day-use.ts`:
```ts
import type { DayUsePass, DayUseProduct } from '@/lib/domain/day-use'
import { at, DATE } from './grid'

// Every day 08:00 to 12:30, for 30 people, $450, blocks no court.
export function makeProduct(overrides: Partial<DayUseProduct> = {}): DayUseProduct {
  return {
    id: 'p1',
    name: 'Day use completo',
    price: 450,
    includes: ['Vestuarios', 'Pileta', 'Cancha libre'],
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    fromTime: '08:00',
    toTime: '12:30',
    capacity: 30,
    courtIds: [],
    isActive: true,
    sortOrder: 1,
    ...overrides,
  }
}

// Ana's pass for the grid fixture's day (Thursday 2026-10-01), bought online, not paid yet.
export function makePass(overrides: Partial<DayUsePass> = {}): DayUsePass {
  return {
    id: 'pass-1',
    code: 'DU-482193',
    productId: 'p1',
    productName: 'Day use completo',
    date: DATE,
    startsAt: at('08:00'),
    endsAt: at('12:30'),
    playerId: 'ana',
    holder: 'Ana Pérez',
    isGuest: false,
    price: 450,
    discountPercent: 0,
    usedReward: false,
    total: 450,
    status: 'bought',
    source: 'online',
    checkedInAt: null,
    payments: [],
    ...overrides,
  }
}
```

- [ ] **Step 2: Write the failing test**

`tests/unit/lib/domain/day-use.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  buyStatus,
  canCancelPass,
  dayUseDays,
  includesText,
  isOpenOn,
  isPassCode,
  passCheckInPath,
  passTotal,
  scheduleText,
  searchPasses,
  skippedNotice,
  spotsText,
  todayText,
  toPass,
  toProduct,
  unblockedCourts,
  type BuyContext,
  type PassRow,
} from '@/lib/domain/day-use'
import { at, DATE, TIMEZONE } from '../../fixtures/grid'
import { makePass, makeProduct } from '../../fixtures/day-use'

const CONTEXT: BuyContext = { now: at('07:00'), today: DATE, timezone: TIMEZONE, windowDays: 14, sold: 0, hasPass: false }

describe('toProduct', () => {
  it('reads a row with the times as HH:MM', () => {
    expect(
      toProduct({
        id: 'p1',
        name: 'Day use completo',
        price: 450,
        includes: ['Vestuarios'],
        weekdays: [6, 0],
        from_time: '08:00:00',
        to_time: '24:00:00',
        capacity: 30,
        court_ids: ['court-1'],
        is_active: true,
        sort_order: 2,
      }),
    ).toEqual(makeProduct({ includes: ['Vestuarios'], weekdays: [6, 0], toTime: '24:00', courtIds: ['court-1'], sortOrder: 2 }))
  })
})

describe('isOpenOn and dayUseDays', () => {
  const weekend = makeProduct({ weekdays: [6, 0] })

  it('follows the weekdays, unless an exception says otherwise', () => {
    expect(isOpenOn(weekend, '2026-10-03', [])).toBe(true)
    expect(isOpenOn(weekend, DATE, [])).toBe(false)
    expect(isOpenOn(weekend, DATE, [{ productId: 'p1', date: DATE, enabled: true }])).toBe(true)
    expect(isOpenOn(weekend, '2026-10-03', [{ productId: 'p1', date: '2026-10-03', enabled: false }])).toBe(false)
    expect(isOpenOn(weekend, DATE, [{ productId: 'other', date: DATE, enabled: true }])).toBe(false)
    expect(isOpenOn(makeProduct({ isActive: false }), DATE, [])).toBe(false)
  })

  it('lists the coming days and marks the ones without day use', () => {
    expect(dayUseDays(DATE, [weekend], [], 3)).toEqual([
      { date: '2026-10-01', label: 'Hoy', closed: true },
      { date: '2026-10-02', label: 'Mañana', closed: true },
      { date: '2026-10-03', label: 'sáb 3', closed: false },
    ])
    expect(dayUseDays(DATE, [weekend], [{ productId: 'p1', date: '2026-10-02', enabled: true }], 2)[1].closed).toBe(false)
  })
})

describe('texts', () => {
  it('says the hours, what it includes and how many spots are left', () => {
    expect(scheduleText(makeProduct())).toBe('08:00 a 12:30')
    expect(includesText(['Vestuarios', 'Pileta', 'Cancha libre'])).toBe('Vestuarios, Pileta y Cancha libre')
    expect(spotsText(30, 12)).toBe('Quedan 18 de 30')
    expect(spotsText(30, 29)).toBe('Queda 1 de 30')
    expect(spotsText(30, 30)).toBe('Sin lugares')
  })

  it('sums today for Inicio, or says nothing when no pass runs today', () => {
    const sold = [{ productId: 'p1', date: DATE, sold: 12, inside: 5 }]
    expect(todayText([makeProduct()], [], sold, DATE)).toBe('Hoy: 5 en el club, quedan 18 lugares')
    expect(todayText([makeProduct({ capacity: 13 })], [], sold, DATE)).toBe('Hoy: 5 en el club, queda 1 lugar')
    expect(todayText([makeProduct({ weekdays: [6, 0] })], [], sold, DATE)).toBeNull()
  })

  it('warns about courts that were taken when saving', () => {
    expect(skippedNotice(0)).toBe('')
    expect(skippedNotice(1)).toBe(' Una cancha ya estaba ocupada un día y no se bloqueó: mirá los avisos.')
    expect(skippedNotice(3)).toBe(' 3 veces una cancha ya estaba ocupada y no se bloqueó: mirá los avisos.')
  })
})

describe('passTotal', () => {
  it('takes the reward off like the database, rounding down', () => {
    expect(passTotal(450, 0)).toBe(450)
    expect(passTotal(450, 50)).toBe(225)
    expect(passTotal(455, 50)).toBe(227)
    expect(passTotal(450, 100)).toBe(0)
  })
})

describe('buyStatus', () => {
  it('lets the player buy, with the price', () => {
    expect(buyStatus(makeProduct(), DATE, [], CONTEXT)).toEqual({ ok: true, text: 'Comprar pase, $450' })
    expect(buyStatus(makeProduct({ price: 0 }), DATE, [], CONTEXT)).toEqual({ ok: true, text: 'Comprar pase' })
  })

  it('says why not, in the same order as the database', () => {
    const text = (date: string, overrides: Partial<BuyContext> = {}, product = makeProduct()) =>
      buyStatus(product, date, [], { ...CONTEXT, ...overrides }).text
    expect(text(DATE, { hasPass: true })).toBe('Ya tenés este pase.')
    expect(text('2026-09-30')).toBe('Ese día ya pasó.')
    expect(text('2026-10-16')).toBe('Todavía no se vende para ese día.')
    expect(text(DATE, {}, makeProduct({ weekdays: [6, 0] }))).toBe('Ese día no hay day use.')
    expect(text(DATE, { now: at('12:30') })).toBe('El horario de hoy ya terminó.')
    expect(text(DATE, { sold: 30 })).toBe('No quedan lugares.')
  })
})

describe('toPass', () => {
  const ROW: PassRow = {
    id: 'pass-1',
    code: 'DU-482193',
    product_id: 'p1',
    on_date: '2026-10-01',
    player_id: 'ana',
    guest_name: null,
    price: 450,
    discount_percent: 50,
    used_reward: true,
    total: 225,
    status: 'inside',
    source: 'reception',
    checked_in_at: '2026-10-01T13:12:00+00:00',
    product: { name: 'Day use completo', from_time: '08:00:00', to_time: '12:30:00' },
    player: { display_name: 'Ana Pérez' },
    payments: [],
  }

  it('reads a pass with its hours on the club clock', () => {
    expect(toPass(ROW, TIMEZONE)).toEqual(
      makePass({
        discountPercent: 50,
        usedReward: true,
        total: 225,
        status: 'inside',
        source: 'reception',
        checkedInAt: new Date('2026-10-01T13:12:00Z'),
      }),
    )
  })

  it('names guests and private profiles, and computes a missing total', () => {
    expect(toPass({ ...ROW, player_id: null, player: null, guest_name: 'Pepe', discount_percent: 0, used_reward: false, total: null }, TIMEZONE))
      .toMatchObject({ holder: 'Pepe', isGuest: true, total: 450 })
    expect(toPass({ ...ROW, player: null }, TIMEZONE).holder).toBe('Jugador')
  })
})

describe('passes', () => {
  it('lets the player cancel a pass bought for today or later', () => {
    expect(canCancelPass(makePass(), DATE)).toBe(true)
    expect(canCancelPass(makePass(), '2026-10-02')).toBe(false)
    expect(canCancelPass(makePass({ status: 'inside' }), DATE)).toBe(false)
    expect(canCancelPass(makePass({ status: 'cancelled' }), DATE)).toBe(false)
  })

  it('finds passes by name, without accents, or by code', () => {
    const passes = [makePass(), makePass({ id: 'pass-2', code: 'DU-100200', holder: 'Bruno Díaz', playerId: 'bruno' })]
    expect(searchPasses(passes, 'bru').map((pass) => pass.id)).toEqual(['pass-2'])
    expect(searchPasses(passes, 'PEREZ').map((pass) => pass.id)).toEqual(['pass-1'])
    expect(searchPasses(passes, 'du-1002').map((pass) => pass.id)).toEqual(['pass-2'])
    expect(searchPasses(passes, '  ')).toHaveLength(2)
  })

  it('knows a pass code and where its QR leads', () => {
    expect(isPassCode('DU-482193')).toBe(true)
    expect(isPassCode('DU-48219')).toBe(false)
    expect(isPassCode('du-482193')).toBe(false)
    expect(passCheckInPath('DU-482193')).toBe('/club/day-use/pase/DU-482193')
  })
})

describe('unblockedCourts', () => {
  const product = makeProduct({ courtIds: ['court-1', 'court-2'] })
  const occupancies = [
    { courtId: 'court-1', dayUseProductId: 'p1', startsAt: at('08:00') },
    { courtId: 'court-1', dayUseProductId: 'p1', startsAt: at('08:00', '2026-10-02') },
    { courtId: 'court-2', dayUseProductId: 'p1', startsAt: at('08:00', '2026-10-02') },
    { courtId: 'court-2', dayUseProductId: 'other', startsAt: at('08:00') },
  ]

  it('lists the court-days the pass should block and does not', () => {
    expect(unblockedCourts(product, [DATE, '2026-10-02'], [], occupancies, at('07:00'), TIMEZONE)).toEqual([
      { productId: 'p1', date: DATE, courtId: 'court-2' },
    ])
  })

  it('leaves out what already started and the days it does not run', () => {
    expect(unblockedCourts(product, [DATE, '2026-10-02'], [], occupancies, at('09:00'), TIMEZONE)).toEqual([])
    expect(unblockedCourts(product, ['2026-10-03'], [{ productId: 'p1', date: '2026-10-03', enabled: false }], [], at('07:00'), TIMEZONE)).toEqual([])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/day-use.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/domain/day-use"`).

- [ ] **Step 4: Write minimal implementation**

`lib/domain/day-use.ts`:
```ts
import { dayLabel, formatPrice } from './format'
import type { Period } from './matches'
import { normalizeText } from './members'
import { courtsText, type EntryPayment } from './tournaments'
import { addDays, formatMinutes, parseTime, toDate, weekdayOf, zonedTime, type LocalDate } from './time'

export type PassStatus = 'bought' | 'inside' | 'cancelled'
export type PassSource = 'online' | 'reception'

export const PASS_STATUS_LABELS: Record<PassStatus, string> = {
  bought: 'Comprado',
  inside: 'Adentro',
  cancelled: 'Cancelado',
}

// What "Nuevo pase" proposes (design, open question: Rustic's real passes).
export const DAY_USE_DEFAULTS = {
  name: 'Day use completo',
  price: 450,
  capacity: 30,
  includes: ['Vestuarios', 'Pileta', 'Cancha libre'],
  weekdays: [6, 0],
  fromTime: '08:00',
  toTime: '12:30',
} as const

// How many days ahead the player's screen and reception's "Vender pase" offer.
export const WEEK_DAYS = 7

export type DayUseProduct = {
  id: string
  name: string
  price: number
  includes: string[]
  weekdays: number[]
  fromTime: string
  toTime: string
  capacity: number
  courtIds: string[]
  isActive: boolean
  sortOrder: number
}

// What lib/data/day-use.ts reads. If supabase-js infers a slightly different shape, adjust these
// types to match; never cast the query result.
export type ProductRow = {
  id: string
  name: string
  price: number
  includes: string[]
  weekdays: number[]
  from_time: string
  to_time: string
  capacity: number
  court_ids: string[]
  is_active: boolean
  sort_order: number
}

const hhmm = (value: string) => formatMinutes(parseTime(value))

export function toProduct(row: ProductRow): DayUseProduct {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    includes: row.includes,
    weekdays: row.weekdays,
    fromTime: hhmm(row.from_time),
    toTime: hhmm(row.to_time),
    capacity: row.capacity,
    courtIds: row.court_ids,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  }
}

export type DayUseOverride = { productId: string; date: LocalDate; enabled: boolean }

export function toOverride(row: { product_id: string; on_date: string; enabled: boolean }): DayUseOverride {
  return { productId: row.product_id, date: row.on_date, enabled: row.enabled }
}

// Same rule as private.day_use_open_on: an exception decides; otherwise the weekdays.
export function isOpenOn(
  product: Pick<DayUseProduct, 'id' | 'isActive' | 'weekdays'>,
  date: LocalDate,
  overrides: DayUseOverride[],
): boolean {
  if (!product.isActive) return false
  const override = overrides.find((item) => item.productId === product.id && item.date === date)
  return override ? override.enabled : product.weekdays.includes(weekdayOf(date))
}

export function openProducts<T extends Pick<DayUseProduct, 'id' | 'isActive' | 'weekdays'>>(
  products: T[],
  date: LocalDate,
  overrides: DayUseOverride[],
): T[] {
  return products.filter((product) => isOpenOn(product, date, overrides))
}

export type DayUseDay = { date: LocalDate; label: string; closed: boolean }

// The coming days for the day strip; closed when no pass runs that day.
export function dayUseDays(today: LocalDate, products: DayUseProduct[], overrides: DayUseOverride[], count = WEEK_DAYS): DayUseDay[] {
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(today, index)
    return { date, label: dayLabel(date, today), closed: openProducts(products, date, overrides).length === 0 }
  })
}

export function scheduleText(product: Pick<DayUseProduct, 'fromTime' | 'toTime'>): string {
  return `${product.fromTime} a ${product.toTime}`
}

export function includesText(includes: string[]): string {
  return courtsText(includes)
}

// The pass hours on that date, on the club's clock (private.day_use_period).
export function productPeriod(product: Pick<DayUseProduct, 'fromTime' | 'toTime'>, date: LocalDate, timezone: string): Period {
  return {
    startsAt: zonedTime(date, parseTime(product.fromTime), timezone),
    endsAt: zonedTime(date, parseTime(product.toTime), timezone),
  }
}

export type Sold = { productId: string; date: LocalDate; sold: number; inside: number }

export function toSold(row: { product_id: string; on_date: string; sold: number; inside: number }): Sold {
  return { productId: row.product_id, date: row.on_date, sold: row.sold, inside: row.inside }
}

export function soldOf(sold: Sold[], productId: string, date: LocalDate): { sold: number; inside: number } {
  const row = sold.find((item) => item.productId === productId && item.date === date)
  return { sold: row?.sold ?? 0, inside: row?.inside ?? 0 }
}

export function spotsText(capacity: number, sold: number): string {
  const left = capacity - sold
  if (left <= 0) return 'Sin lugares'
  return `${left === 1 ? 'Queda 1' : `Quedan ${left}`} de ${capacity}`
}

// "Hoy: N en el club, quedan M lugares" for Inicio; null when no pass runs today.
export function todayText(products: DayUseProduct[], overrides: DayUseOverride[], sold: Sold[], today: LocalDate): string | null {
  const open = openProducts(products, today, overrides)
  if (open.length === 0) return null
  const inside = open.reduce((sum, product) => sum + soldOf(sold, product.id, today).inside, 0)
  const left = open.reduce((sum, product) => sum + Math.max(0, product.capacity - soldOf(sold, product.id, today).sold), 0)
  return `Hoy: ${inside} en el club, ${left === 1 ? 'queda 1 lugar' : `quedan ${left} lugares`}`
}

// Appended to what the configuration actions say when a court was already taken.
export function skippedNotice(skipped: number): string {
  if (skipped <= 0) return ''
  if (skipped === 1) return ' Una cancha ya estaba ocupada un día y no se bloqueó: mirá los avisos.'
  return ` ${skipped} veces una cancha ya estaba ocupada y no se bloqueó: mirá los avisos.`
}

// Same as the database's generated total: the price minus the reward, rounded down.
export function passTotal(price: number, discountPercent: number): number {
  return Math.floor((price * (100 - discountPercent)) / 100)
}

export type BuyContext = { now: Date; today: LocalDate; timezone: string; windowDays: number; sold: number; hasPass: boolean }
export type BuyStatus = { ok: true; text: string } | { ok: false; text: string }

const no = (text: string): BuyStatus => ({ ok: false, text })

// Same rules and order as private.sell_pass (with "already has it" first, as the cards need it).
export function buyStatus(product: DayUseProduct, date: LocalDate, overrides: DayUseOverride[], context: BuyContext): BuyStatus {
  if (context.hasPass) return no('Ya tenés este pase.')
  if (date < context.today) return no('Ese día ya pasó.')
  if (date > addDays(context.today, context.windowDays)) return no('Todavía no se vende para ese día.')
  if (!isOpenOn(product, date, overrides)) return no('Ese día no hay day use.')
  if (productPeriod(product, date, context.timezone).endsAt <= context.now) return no('El horario de hoy ya terminó.')
  if (context.sold >= product.capacity) return no('No quedan lugares.')
  return { ok: true, text: product.price > 0 ? `Comprar pase, ${formatPrice(product.price)}` : 'Comprar pase' }
}

export type DayUsePass = {
  id: string
  code: string
  productId: string
  productName: string
  date: LocalDate
  startsAt: Date
  endsAt: Date
  playerId: string | null
  holder: string
  isGuest: boolean
  price: number
  discountPercent: number
  usedReward: boolean
  total: number
  status: PassStatus
  source: PassSource
  checkedInAt: Date | null
  // Payments come back only to their payer and to staff (RLS).
  payments: EntryPayment[]
}

export type PassRow = {
  id: string
  code: string
  product_id: string
  on_date: string
  player_id: string | null
  guest_name: string | null
  price: number
  discount_percent: number
  used_reward: boolean
  total: number | null
  status: PassStatus
  source: PassSource
  checked_in_at: string | null
  product: { name: string; from_time: string; to_time: string } | null
  player: { display_name: string } | null
  payments: EntryPayment[]
}

export function toPass(row: PassRow, timezone: string): DayUsePass {
  const fromTime = row.product?.from_time ?? '00:00'
  const toTime = row.product?.to_time ?? '24:00'
  return {
    id: row.id,
    code: row.code,
    productId: row.product_id,
    productName: row.product?.name ?? 'Day use',
    date: row.on_date,
    startsAt: zonedTime(row.on_date, parseTime(fromTime), timezone),
    endsAt: zonedTime(row.on_date, parseTime(toTime), timezone),
    playerId: row.player_id,
    // A private profile is not readable by other members (RLS); staff always read it.
    holder: row.guest_name ?? row.player?.display_name ?? 'Jugador',
    isGuest: row.player_id === null,
    price: row.price,
    discountPercent: row.discount_percent,
    usedReward: row.used_reward,
    total: row.total ?? passTotal(row.price, row.discount_percent),
    status: row.status,
    source: row.source,
    checkedInAt: row.checked_in_at ? toDate(row.checked_in_at) : null,
    payments: row.payments,
  }
}

// Same rule as cancel_day_use for a player: before check-in, and not for a day that passed.
export function canCancelPass(pass: Pick<DayUsePass, 'status' | 'date'>, today: LocalDate): boolean {
  return pass.status === 'bought' && pass.date >= today
}

// Reception's search: by name (without accents) or by code.
export function searchPasses(passes: DayUsePass[], query: string): DayUsePass[] {
  const needle = normalizeText(query)
  if (!needle) return passes
  return passes.filter((pass) => normalizeText(pass.holder).includes(needle) || normalizeText(pass.code).includes(needle))
}

const PASS_CODE = /^DU-\d{6}$/

export function isPassCode(value: unknown): value is string {
  return typeof value === 'string' && PASS_CODE.test(value)
}

// Where the pass QR leads: the club panel, for reception.
export function passCheckInPath(code: string): string {
  return `/club/day-use/pase/${code}`
}

export type InsidePerson = { name: string; productName: string; checkedInAt: Date }

export function toInsidePerson(row: { name: string; product_name: string; checked_in_at: string }): InsidePerson {
  return { name: row.name, productName: row.product_name, checkedInAt: toDate(row.checked_in_at) }
}

export type DayUseOccupancy = { courtId: string; dayUseProductId: string | null; startsAt: Date }
export type UnblockedCourt = { productId: string; date: LocalDate; courtId: string }

// Court-days a pass should block and does not: the court was taken (or inactive) when it was
// generated. What already started is left out, like private.generate_day_use does.
export function unblockedCourts(
  product: DayUseProduct,
  dates: LocalDate[],
  overrides: DayUseOverride[],
  occupancies: DayUseOccupancy[],
  now: Date,
  timezone: string,
): UnblockedCourt[] {
  return dates.flatMap((date) => {
    if (!isOpenOn(product, date, overrides)) return []
    const { startsAt } = productPeriod(product, date, timezone)
    if (startsAt <= now) return []
    return product.courtIds
      .filter(
        (courtId) =>
          !occupancies.some(
            (item) => item.dayUseProductId === product.id && item.courtId === courtId && item.startsAt.getTime() === startsAt.getTime(),
          ),
      )
      .map((courtId) => ({ productId: product.id, date, courtId }))
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
npx vitest run tests/unit/lib/domain/day-use.test.ts
npm run typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/day-use.ts tests/unit/fixtures/day-use.ts tests/unit/lib/domain/day-use.test.ts
git commit -m "feat(domain): day use passes, open days and buy rules"
```

---

### Task 11: Sellos (`lib/domain/loyalty.ts`)

**Files:**
- Create: `lib/domain/loyalty.ts`
- Test: `tests/unit/lib/domain/loyalty.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/loyalty.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  loyaltyOf,
  loyaltyRuleOf,
  loyaltyRuleText,
  monthsBefore,
  NO_LOYALTY,
  parseLoyaltyForm,
  rewardLabel,
  stampsText,
  type LoyaltyPass,
  type LoyaltyRule,
} from '@/lib/domain/loyalty'

const RULE: LoyaltyRule = { enabled: true, every: 5, discountPercent: 100, expiryMonths: 6 }
const TODAY = '2026-10-01'
const visit = (date: string): LoyaltyPass => ({ date, status: 'inside', usedReward: false })

describe('monthsBefore', () => {
  it('goes back whole months like Postgres, keeping the day or the last one of the month', () => {
    expect(monthsBefore('2026-10-01', 6)).toBe('2026-04-01')
    expect(monthsBefore('2026-08-31', 6)).toBe('2026-02-28')
    expect(monthsBefore('2026-01-15', 1)).toBe('2025-12-15')
  })
})

describe('loyaltyOf', () => {
  const passes: LoyaltyPass[] = [
    ...['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-04-01'].map(visit),
    visit('2026-03-31'),
    { date: '2026-10-02', status: 'bought', usedReward: true },
    { date: '2026-10-03', status: 'cancelled', usedReward: true },
    { date: '2026-09-30', status: 'inside', usedReward: true },
  ]

  it('counts stamps inside the expiry, rewards earned, used and left, like private.loyalty_of', () => {
    expect(loyaltyOf(passes, RULE, TODAY)).toEqual({ stamps: 6, earned: 1, used: 2, available: 0, progress: 1 })
  })

  it('counts every check-in when stamps never expire', () => {
    expect(loyaltyOf(passes, { ...RULE, expiryMonths: null }, TODAY)).toMatchObject({ stamps: 7, earned: 1 })
  })

  it('has a reward once a group of stamps is complete and unused', () => {
    expect(loyaltyOf(['2026-09-01', '2026-09-02', '2026-09-03'].map(visit), { ...RULE, every: 3 }, TODAY)).toEqual({
      stamps: 3,
      earned: 1,
      used: 0,
      available: 1,
      progress: 0,
    })
  })

  it('is empty while the club has stamps off', () => {
    expect(loyaltyOf(passes, { ...RULE, enabled: false }, TODAY)).toEqual(NO_LOYALTY)
  })
})

describe('texts', () => {
  it('explains the rule in words', () => {
    expect(loyaltyRuleText(RULE)).toBe('Cada 5 day use, el siguiente es gratis. Los sellos vencen a los 6 meses.')
    expect(loyaltyRuleText({ ...RULE, every: 3, discountPercent: 50, expiryMonths: null })).toBe(
      'Cada 3 day use, tenés 50 % de descuento en el siguiente. Los sellos no vencen.',
    )
    expect(loyaltyRuleText({ ...RULE, enabled: false })).toBe('')
  })

  it('labels the reward and the progress', () => {
    expect(rewardLabel(100)).toBe('-100%')
    expect(stampsText({ ...NO_LOYALTY, progress: 3 }, RULE)).toBe('3 de 5 sellos')
  })

  it('reads the rule from the club row', () => {
    expect(
      loyaltyRuleOf({ loyalty_enabled: true, loyalty_every: 5, loyalty_discount_percent: 100, loyalty_expiry_months: 6 }),
    ).toEqual(RULE)
  })
})

describe('parseLoyaltyForm', () => {
  function loyaltyForm(entries: Record<string, string>): FormData {
    const form = new FormData()
    for (const [key, value] of Object.entries(entries)) form.set(key, value)
    return form
  }
  const VALID = { loyalty_enabled: 'on', loyalty_every: '5', loyalty_discount_percent: '100', loyalty_expiry_months: '6' }

  it('reads the rule as the clubs columns', () => {
    expect(parseLoyaltyForm(loyaltyForm(VALID))).toEqual({
      ok: true,
      value: { loyalty_enabled: true, loyalty_every: 5, loyalty_discount_percent: 100, loyalty_expiry_months: 6 },
    })
    const off = { loyalty_every: '5', loyalty_discount_percent: '100', loyalty_expiry_months: 'never' }
    expect(parseLoyaltyForm(loyaltyForm(off))).toEqual({
      ok: true,
      value: { loyalty_enabled: false, loyalty_every: 5, loyalty_discount_percent: 100, loyalty_expiry_months: null },
    })
  })

  it('explains each mistake in Spanish', () => {
    const message = (overrides: Record<string, string>) => {
      const result = parseLoyaltyForm(loyaltyForm({ ...VALID, ...overrides }))
      return result.ok ? null : result.message
    }
    expect(message({ loyalty_every: '0' })).toBe('Los day use para la recompensa van de 1 a 50.')
    expect(message({ loyalty_discount_percent: '120' })).toBe('El descuento va de 1 a 100 %.')
    expect(message({ loyalty_expiry_months: '40' })).toBe('Elegí cuándo vencen los sellos.')
  })
})
```

Why those numbers: since = 2026-04-01; the six visits from 2026-04-01 on count (2026-03-31 does not); the reward pass that was checked in (2026-09-30) and the one bought (2026-10-02) use rewards and add no stamp; the cancelled one does not use it. Six stamps earn one reward, two were used: none left.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/loyalty.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/domain/loyalty"`).

- [ ] **Step 3: Write minimal implementation**

`lib/domain/loyalty.ts`:
```ts
import type { PassStatus } from './day-use'
import { readBoolean, readInt } from './input'
import type { ParseResult } from './settings'
import { parseLocalDate, type LocalDate } from './time'

export type LoyaltyRule = { enabled: boolean; every: number; discountPercent: number; expiryMonths: number | null }
export type LoyaltyPass = { date: LocalDate; status: PassStatus; usedReward: boolean }
export type Loyalty = { stamps: number; earned: number; used: number; available: number; progress: number }

export const NO_LOYALTY: Loyalty = { stamps: 0, earned: 0, used: 0, available: 0, progress: 0 }
export const LOYALTY_EXPIRY_OPTIONS = [3, 6, 12, 24] as const

type ClubLoyalty = {
  loyalty_enabled: boolean
  loyalty_every: number
  loyalty_discount_percent: number
  loyalty_expiry_months: number | null
}

export function loyaltyRuleOf(club: ClubLoyalty): LoyaltyRule {
  return {
    enabled: club.loyalty_enabled,
    every: club.loyalty_every,
    discountPercent: club.loyalty_discount_percent,
    expiryMonths: club.loyalty_expiry_months,
  }
}

const pad = (value: number) => String(value).padStart(2, '0')

// Like Postgres date - interval 'n months': the same day n months back, or that month's last day.
export function monthsBefore(date: LocalDate, months: number): LocalDate {
  const { year, month, day } = parseLocalDate(date)
  const index = year * 12 + (month - 1) - months
  const targetYear = Math.floor(index / 12)
  const targetMonth = index - targetYear * 12
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  return `${targetYear}-${pad(targetMonth + 1)}-${pad(Math.min(day, lastDay))}`
}

// The first date whose passes count; null when stamps never expire.
export function loyaltySince(rule: LoyaltyRule, today: LocalDate): LocalDate | null {
  return rule.expiryMonths === null ? null : monthsBefore(today, rule.expiryMonths)
}

// Same as private.loyalty_of: a stamp is a check-in without a reward inside the expiry window;
// every `every` stamps earn a reward; every pass bought with one (not cancelled) uses it.
export function loyaltyOf(passes: LoyaltyPass[], rule: LoyaltyRule, today: LocalDate): Loyalty {
  if (!rule.enabled) return NO_LOYALTY
  const since = loyaltySince(rule, today)
  const inWindow = passes.filter((pass) => since === null || pass.date >= since)
  const stamps = inWindow.filter((pass) => pass.status === 'inside' && !pass.usedReward).length
  const used = inWindow.filter((pass) => pass.status !== 'cancelled' && pass.usedReward).length
  const earned = Math.floor(stamps / rule.every)
  return { stamps, earned, used, available: Math.max(0, earned - used), progress: stamps % rule.every }
}

export function rewardLabel(percent: number): string {
  return `-${percent}%`
}

export function stampsText(loyalty: Loyalty, rule: LoyaltyRule): string {
  return `${loyalty.progress} de ${rule.every} sellos`
}

export function loyaltyRuleText(rule: LoyaltyRule): string {
  if (!rule.enabled) return ''
  const reward = rule.discountPercent === 100 ? 'el siguiente es gratis' : `tenés ${rule.discountPercent} % de descuento en el siguiente`
  const expiry = rule.expiryMonths === null ? 'Los sellos no vencen.' : `Los sellos vencen a los ${rule.expiryMonths} meses.`
  return `Cada ${rule.every} day use, ${reward}. ${expiry}`
}

export type LoyaltySettings = {
  loyalty_enabled: boolean
  loyalty_every: number
  loyalty_discount_percent: number
  loyalty_expiry_months: number | null
}

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message }
}

// Same limits as the clubs check constraints, with a Spanish message for each.
export function parseLoyaltyForm(form: FormData): ParseResult<LoyaltySettings> {
  const every = readInt(form, 'loyalty_every', { min: 1, max: 50 })
  if (every === null) return fail('Los day use para la recompensa van de 1 a 50.')
  const percent = readInt(form, 'loyalty_discount_percent', { min: 1, max: 100 })
  if (percent === null) return fail('El descuento va de 1 a 100 %.')
  const never = form.get('loyalty_expiry_months') === 'never'
  const expiry = never ? null : readInt(form, 'loyalty_expiry_months', { min: 1, max: 36 })
  if (!never && expiry === null) return fail('Elegí cuándo vencen los sellos.')
  return {
    ok: true,
    value: {
      loyalty_enabled: readBoolean(form, 'loyalty_enabled'),
      loyalty_every: every,
      loyalty_discount_percent: percent,
      loyalty_expiry_months: expiry,
    },
  }
}
```

- [ ] **Step 4: The Inicio card type**

In `lib/domain/day-use.ts`, add after the `import { dayLabel, formatPrice } from './format'` line:
```ts
import type { Loyalty, LoyaltyRule } from './loyalty'
```
and at the end of the file:
```ts
// The day use card in Inicio (lib/data/day-use.ts loadDayUseHome).
export type DayUseHome = {
  rule: LoyaltyRule
  loyalty: Loyalty
  todayPass: { id: string; text: string } | null
  todayText: string | null
}
```
(`loyalty.ts` and `day-use.ts` import each other's types only: TypeScript erases them, so there is no runtime cycle.)

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/lib/domain/loyalty.test.ts tests/unit/lib/domain/day-use.test.ts
npm run typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/loyalty.ts lib/domain/day-use.ts tests/unit/lib/domain/loyalty.test.ts
git commit -m "feat(domain): day use stamps, mirror of loyalty_of"
```

---

### Task 12: Formulario de un pase (`lib/domain/day-use-form.ts`)

**Files:**
- Create: `lib/domain/day-use-form.ts`
- Test: `tests/unit/lib/domain/day-use-form.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/day-use-form.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { parseProductForm } from '@/lib/domain/day-use-form'

const C1 = '22222222-2222-2222-2222-222222222201'
const VALID: Record<string, string | string[]> = {
  name: ' Day use completo ',
  price: '450',
  capacity: '30',
  includes: 'Vestuarios, Pileta , , Cancha libre',
  weekdays: ['6', '0'],
  fromTime: '08:00',
  toTime: '12:30',
  courtIds: [C1],
  sortOrder: '1',
}

function productForm(overrides: Record<string, string | string[]> = {}): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries({ ...VALID, ...overrides })) {
    for (const item of Array.isArray(value) ? value : [value]) form.append(key, item)
  }
  return form
}

const messageOf = (overrides: Record<string, string | string[]>) => {
  const result = parseProductForm(productForm(overrides))
  return result.ok ? null : result.message
}

describe('parseProductForm', () => {
  it('reads a valid pass', () => {
    expect(parseProductForm(productForm())).toEqual({
      ok: true,
      value: {
        name: 'Day use completo',
        price: 450,
        capacity: 30,
        includes: ['Vestuarios', 'Pileta', 'Cancha libre'],
        weekdays: [0, 6],
        fromTime: '08:00',
        toTime: '12:30',
        courtIds: [C1],
        sortOrder: 1,
      },
    })
  })

  it('accepts a pass with no courts, no weekdays (only exceptions) and until midnight', () => {
    expect(parseProductForm(productForm({ courtIds: [], weekdays: [], toTime: '24:00' }))).toMatchObject({
      ok: true,
      value: { courtIds: [], weekdays: [], toTime: '24:00' },
    })
  })

  it('explains each mistake in Spanish', () => {
    expect(messageOf({ name: '' })).toBe('Poné un nombre de hasta 60 letras.')
    expect(messageOf({ price: 'mil' })).toBe('Ingresá el precio en pesos, sin puntos.')
    expect(messageOf({ capacity: '0' })).toBe('El cupo va de 1 a 500 personas.')
    expect(messageOf({ includes: 'a,b,c,d,e,f,g,h,i' })).toBe('Poné hasta 8 cosas que incluye, de hasta 40 letras cada una.')
    expect(messageOf({ includes: 'x'.repeat(41) })).toBe('Poné hasta 8 cosas que incluye, de hasta 40 letras cada una.')
    expect(messageOf({ weekdays: ['7'] })).toBe('Elegí días de la semana válidos.')
    expect(messageOf({ toTime: '08:00' })).toBe('El horario tiene que terminar después de empezar.')
    expect(messageOf({ courtIds: ['cancha-1'] })).toBe('Elegí las canchas.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/day-use-form.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/domain/day-use-form"`).

- [ ] **Step 3: Write minimal implementation**

`lib/domain/day-use-form.ts`:
```ts
import { isUuid, readInt, readText, readTime } from './input'
import type { ParseResult } from './settings'
import { parseTime } from './time'

export type ProductInput = {
  name: string
  price: number
  capacity: number
  includes: string[]
  weekdays: number[]
  fromTime: string
  toTime: string
  courtIds: string[]
  sortOrder: number
}

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message }
}

// Same limits as save_day_use_product, with a Spanish message for each. "What it includes" comes as
// one text separated by commas.
export function parseProductForm(form: FormData): ParseResult<ProductInput> {
  const name = readText(form, 'name', { maxLength: 60 })
  if (!name) return fail('Poné un nombre de hasta 60 letras.')
  const price = readInt(form, 'price', { min: 0, max: 10_000_000 })
  if (price === null) return fail('Ingresá el precio en pesos, sin puntos.')
  const capacity = readInt(form, 'capacity', { min: 1, max: 500 })
  if (capacity === null) return fail('El cupo va de 1 a 500 personas.')

  const rawIncludes = form.get('includes')
  const includes = (typeof rawIncludes === 'string' ? rawIncludes : '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (includes.length > 8 || includes.some((item) => item.length > 40)) {
    return fail('Poné hasta 8 cosas que incluye, de hasta 40 letras cada una.')
  }

  const weekdays = [...new Set(form.getAll('weekdays').map(Number))].sort((a, b) => a - b)
  if (weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return fail('Elegí días de la semana válidos.')

  const fromTime = readTime(form, 'fromTime')
  const toTime = readTime(form, 'toTime')
  if (!fromTime || !toTime || parseTime(toTime) <= parseTime(fromTime)) {
    return fail('El horario tiene que terminar después de empezar.')
  }

  const rawCourts = form.getAll('courtIds')
  if (!rawCourts.every(isUuid)) return fail('Elegí las canchas.')
  const courtIds = [...new Set(rawCourts.map((id) => id.toLowerCase()))]

  return {
    ok: true,
    value: {
      name,
      price,
      capacity,
      includes,
      weekdays,
      fromTime,
      toTime,
      courtIds,
      sortOrder: readInt(form, 'sortOrder', { min: 0, max: 100 }) ?? 0,
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/day-use-form.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/day-use-form.ts tests/unit/lib/domain/day-use-form.test.ts
git commit -m "feat(domain): read and check the day use pass form"
```

---

### Task 13: Pases en Cobros (`lib/domain/day-use-payments.ts`)

**Files:**
- Create: `lib/domain/day-use-payments.ts`
- Test: `tests/unit/lib/domain/day-use-payments.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/day-use-payments.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { collectedToday, passRefunds, passStartsAt, unpaidPasses, type OverviewPass } from '@/lib/domain/day-use-payments'
import { at, DATE, TIMEZONE } from '../../fixtures/grid'
import { makePass } from '../../fixtures/day-use'

const pass = (overrides: Partial<OverviewPass>): OverviewPass => ({
  id: 'x',
  on_date: DATE,
  price: 450,
  discount_percent: 0,
  total: 450,
  status: 'bought',
  guest_name: null,
  player: { display_name: 'Ana' },
  product: { name: 'Day use completo', from_time: '08:00:00' },
  payments: [],
  ...overrides,
})

const PASSES: OverviewPass[] = [
  pass({ id: 'p1', on_date: '2026-09-30', status: 'inside' }),
  pass({ id: 'p2', guest_name: 'Pepe', player: null, payments: [{ id: 'pay2', status: 'confirmed', amount: 450 }] }),
  pass({ id: 'p3', on_date: '2026-10-02', player: { display_name: 'Bruno' } }),
  pass({ id: 'p4', discount_percent: 100, total: 0 }),
  pass({ id: 'p5', on_date: '2026-09-28', status: 'cancelled', player: { display_name: 'Carla' }, payments: [{ id: 'pay5', status: 'confirmed', amount: 450 }] }),
  pass({ id: 'p6', player: { display_name: 'Dani' }, payments: [{ id: 'pay6', status: 'reported', amount: 450 }] }),
]

describe('day use in Cobros', () => {
  it('starts each pass at its hours on the club clock', () => {
    expect(passStartsAt('2026-09-30', '08:00:00', TIMEZONE)).toEqual(at('08:00', '2026-09-30'))
  })

  it('lists passes of today or before that still owe, without a transfer waiting', () => {
    expect(unpaidPasses(PASSES, DATE, TIMEZONE)).toEqual([
      { passId: 'p1', holder: 'Ana', startsAt: at('08:00', '2026-09-30'), productName: 'Day use completo', due: 450 },
    ])
  })

  it('lists what was paid for a pass that was cancelled', () => {
    expect(passRefunds(PASSES, TIMEZONE)).toEqual([
      { paymentId: 'pay5', holder: 'Carla', startsAt: at('08:00', '2026-09-28'), courtName: 'Day use completo', amount: 450 },
    ])
  })

  it('adds what was collected for the passes of the day', () => {
    expect(
      collectedToday([
        makePass({ payments: [{ status: 'confirmed', amount: 450, rejection_reason: null, created_at: '2026-10-01T12:00:00Z' }] }),
        makePass({ payments: [{ status: 'reported', amount: 450, rejection_reason: null, created_at: '2026-10-01T12:00:00Z' }] }),
        makePass({ payments: [{ status: 'confirmed', amount: 225, rejection_reason: null, created_at: '2026-10-01T12:00:00Z' }] }),
      ]),
    ).toBe(675)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/day-use-payments.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/domain/day-use-payments"`).

- [ ] **Step 3: Write minimal implementation**

`lib/domain/day-use-payments.ts`:
```ts
import { passTotal, type DayUsePass, type PassStatus } from './day-use'
import { amountDue, paymentState } from './payments'
import type { OverviewPayment, RefundItem } from './payments-overview'
import { parseTime, zonedTime, type LocalDate } from './time'

// What lib/data/payments.ts reads for Cobros.
export type OverviewPass = {
  id: string
  on_date: string
  price: number
  discount_percent: number
  total: number | null
  status: PassStatus
  guest_name: string | null
  player: { display_name: string } | null
  product: { name: string; from_time: string } | null
  payments: OverviewPayment[]
}
export type UnpaidPassItem = { passId: string; holder: string; startsAt: Date; productName: string; due: number }

export function passStartsAt(onDate: LocalDate, fromTime: string | null | undefined, timezone: string): Date {
  return zonedTime(onDate, parseTime(fromTime ?? '00:00'), timezone)
}

const holderOf = (pass: OverviewPass) => pass.guest_name ?? pass.player?.display_name ?? 'Jugador'
const totalOf = (pass: OverviewPass) => pass.total ?? passTotal(pass.price, pass.discount_percent)

// Passes of today or before (not cancelled) that still owe and have no transfer waiting for
// review. A free pass (a 100 % reward) owes nothing and never shows.
export function unpaidPasses(passes: OverviewPass[], today: LocalDate, timezone: string): UnpaidPassItem[] {
  return passes.flatMap((pass) => {
    if (pass.status === 'cancelled' || pass.on_date > today) return []
    const total = totalOf(pass)
    if (paymentState({ price: total, status: 'confirmed' }, pass.payments) !== 'pending') return []
    return [
      {
        passId: pass.id,
        holder: holderOf(pass),
        startsAt: passStartsAt(pass.on_date, pass.product?.from_time, timezone),
        productName: pass.product?.name ?? 'Day use',
        due: amountDue(total, pass.payments),
      },
    ]
  })
}

// Money the club took for a pass that was cancelled: given back by hand.
export function passRefunds(passes: OverviewPass[], timezone: string): RefundItem[] {
  return passes.flatMap((pass) => {
    if (pass.status !== 'cancelled') return []
    return pass.payments
      .filter((payment) => payment.status === 'confirmed')
      .map((payment) => ({
        paymentId: payment.id,
        holder: holderOf(pass),
        startsAt: passStartsAt(pass.on_date, pass.product?.from_time, timezone),
        courtName: pass.product?.name ?? 'Day use',
        amount: payment.amount,
      }))
  })
}

// "Ingresos de hoy" in reception's summary: confirmed payments of the day's passes.
export function collectedToday(passes: Pick<DayUsePass, 'payments'>[]): number {
  return passes
    .flatMap((pass) => pass.payments)
    .filter((payment) => payment.status === 'confirmed')
    .reduce((sum, payment) => sum + payment.amount, 0)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/day-use-payments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/day-use-payments.ts tests/unit/lib/domain/day-use-payments.test.ts
git commit -m "feat(domain): day use passes in Cobros"
```

---

### Task 14: El QR del pase (`qrcode`)

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `lib/qr/pass-qr.ts`
- Test: `tests/unit/lib/qr/pass-qr.test.ts`

- [ ] **Step 1: Install the dependency**

Run:
```bash
npm install qrcode
npm install --save-dev @types/qrcode
```
Expected: `qrcode` en `dependencies` y `@types/qrcode` en `devDependencies`.

- [ ] **Step 2: Write the failing test**

`tests/unit/lib/qr/pass-qr.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { passQrSvg } = await import('@/lib/qr/pass-qr')
const URL = 'https://app.test/club/day-use/pase/DU-482193'

describe('passQrSvg', () => {
  it('draws the check-in link as an SVG QR code', async () => {
    const svg = await passQrSvg(URL)
    expect(svg).toMatch(/^<svg/)
    expect(svg).toContain('viewBox')
  })

  it('draws the same link the same way, and another link differently', async () => {
    expect(await passQrSvg(URL)).toBe(await passQrSvg(URL))
    expect(await passQrSvg('https://app.test/club/day-use/pase/DU-000001')).not.toBe(await passQrSvg(URL))
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/qr/pass-qr.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/qr/pass-qr"`).

- [ ] **Step 4: Write minimal implementation**

`lib/qr/pass-qr.ts`:
```ts
import 'server-only'
import QRCode from 'qrcode'

// The pass QR, drawn on the server: black on white so any phone camera reads it, in dark mode too.
// It holds the link to the club panel (/club/day-use/pase/<code>), which only staff can open.
export async function passQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
npx vitest run tests/unit/lib/qr/pass-qr.test.ts
npm run typecheck
```
Expected: PASS. Si la librería antepone un prólogo XML al SVG, cambiar la expectativa a `toContain('<svg')`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/qr/pass-qr.ts tests/unit/lib/qr/pass-qr.test.ts
git commit -m "feat(day-use): server-side SVG QR for passes"
```

---
## Corte 4: Datos y acciones

### Task 15: Carga del day use (`lib/data/day-use.ts`)

**Files:**
- Create: `lib/data/day-use.ts`

(no unit test — lectura con la sesión del usuario, como `lib/data/tournaments.ts`; la cubren typecheck, las pantallas y el e2e)

- [ ] **Step 1: Write the loader**

`lib/data/day-use.ts`:
```ts
import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import {
  todayText,
  toInsidePerson,
  toOverride,
  toPass,
  toProduct,
  toSold,
  type DayUseHome,
  type DayUseOccupancy,
  type DayUseOverride,
  type DayUsePass,
  type DayUseProduct,
  type InsidePerson,
  type PassRow,
  type Sold,
} from '@/lib/domain/day-use'
import { timeIn } from '@/lib/domain/format'
import { loyaltyOf, loyaltyRuleOf, loyaltySince, type LoyaltyPass } from '@/lib/domain/loyalty'
import { localDateOf, toDate, type LocalDate } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'

const PRODUCT_SELECT = 'id, name, price, includes, weekdays, from_time, to_time, capacity, court_ids, is_active, sort_order'
// FK hints: day_use_passes reaches profiles through four columns, and payments through its composite FK.
const PASS_SELECT =
  'id, code, product_id, on_date, player_id, guest_name, price, discount_percent, used_reward, total, status, source, checked_in_at, product:day_use_products!day_use_passes_product_in_club(name, from_time, to_time), player:profiles!day_use_passes_player_id_fkey(display_name), payments!payments_pass_in_club(status, amount, rejection_reason, created_at)'

type Viewer = { userId: string; club: Club }

// The passes the club offers, in its order. Inactive ones only for the configuration screen.
export async function loadProducts(club: Club, options: { includeInactive?: boolean } = {}): Promise<DayUseProduct[]> {
  const supabase = await createClient()
  let query = supabase.from('day_use_products').select(PRODUCT_SELECT).eq('club_id', club.id)
  if (!options.includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query.order('sort_order').order('name')
  if (error) throw error
  return data.map(toProduct)
}

export async function loadOverrides(club: Club, from: LocalDate, to: LocalDate): Promise<DayUseOverride[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('day_use_overrides')
    .select('product_id, on_date, enabled')
    .eq('club_id', club.id)
    .gte('on_date', from)
    .lte('on_date', to)
  if (error) throw error
  return data.map(toOverride)
}

// Totals per pass and day (day_use_sold): members read no other player's passes.
export async function loadSold(club: Club, from: LocalDate, to: LocalDate): Promise<Sold[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('day_use_sold', { p_club_id: club.id, p_from: from, p_to: to })
  if (error) throw error
  return data.map(toSold)
}

// "Ya están en el club": players get members who did not hide; staff get everyone.
export async function loadInside(club: Club, date: LocalDate): Promise<InsidePerson[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('day_use_inside', { p_club_id: club.id, p_date: date })
  if (error) throw error
  return data.map(toInsidePerson)
}

// The viewer's passes that were not cancelled, from `from` on (and up to `to`, if given).
export async function loadMyPasses(viewer: Viewer, from: LocalDate, to?: LocalDate): Promise<DayUsePass[]> {
  const supabase = await createClient()
  let query = supabase
    .from('day_use_passes')
    .select(PASS_SELECT)
    .eq('club_id', viewer.club.id)
    .eq('player_id', viewer.userId)
    .neq('status', 'cancelled')
    .gte('on_date', from)
  if (to) query = query.lte('on_date', to)
  const { data, error } = await query.order('on_date')
  if (error) throw error
  return data.map((row: PassRow) => toPass(row, viewer.club.timezone))
}

// One pass, read with the viewer's session: a player only finds her own, staff any of the club.
export async function loadPass(club: Club, id: string): Promise<DayUsePass | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('day_use_passes').select(PASS_SELECT).eq('club_id', club.id).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? toPass(data, club.timezone) : null
}

// What the pass QR opens (staff only).
export async function loadPassByCode(club: Club, code: string): Promise<DayUsePass | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('day_use_passes').select(PASS_SELECT).eq('club_id', club.id).eq('code', code).maybeSingle()
  if (error) throw error
  return data ? toPass(data, club.timezone) : null
}

// Reception's "Hoy": every pass of that day that was not cancelled, in the order they were sold.
export async function loadPassesOn(club: Club, date: LocalDate): Promise<DayUsePass[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('day_use_passes')
    .select(PASS_SELECT)
    .eq('club_id', club.id)
    .eq('on_date', date)
    .neq('status', 'cancelled')
    .order('created_at')
  if (error) throw error
  return data.map((row: PassRow) => toPass(row, club.timezone))
}

// A member's passes for the stamps (lib/domain/loyalty.ts). Players read their own; staff anyone's.
export async function loadLoyaltyPasses(club: Club, playerId: string, since: LocalDate | null): Promise<LoyaltyPass[]> {
  const supabase = await createClient()
  let query = supabase.from('day_use_passes').select('on_date, status, used_reward').eq('club_id', club.id).eq('player_id', playerId)
  if (since) query = query.gte('on_date', since)
  const { data, error } = await query
  if (error) throw error
  return data.map((row) => ({ date: row.on_date, status: row.status, usedReward: row.used_reward }))
}

// Passes sold with a reward (not cancelled) since that date: reception's summary.
export async function loadRewardsUsed(club: Club, since: LocalDate): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('day_use_passes')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', club.id)
    .eq('used_reward', true)
    .neq('status', 'cancelled')
    .gte('on_date', since)
  if (error) throw error
  return count ?? 0
}

// The courts the passes hold between two instants, for the configuration warnings.
export async function loadDayUseOccupancies(club: Club, from: Date, to: Date): Promise<DayUseOccupancy[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('court_occupancy')
    .select('court_id, day_use_product_id, starts_at')
    .eq('club_id', club.id)
    .eq('kind', 'day_use')
    .gt('ends_at', from.toISOString())
    .lt('starts_at', to.toISOString())
  if (error) throw error
  return data.map((row) => ({ courtId: row.court_id, dayUseProductId: row.day_use_product_id, startsAt: toDate(row.starts_at) }))
}

// The day use card in Inicio; null while the club offers no pass.
export async function loadDayUseHome(viewer: Viewer, now = new Date()): Promise<DayUseHome | null> {
  const { club } = viewer
  const today = localDateOf(now, club.timezone)
  const rule = loyaltyRuleOf(club)
  const products = await loadProducts(club)
  if (products.length === 0) return null
  const [overrides, sold, mine, visits] = await Promise.all([
    loadOverrides(club, today, today),
    loadSold(club, today, today),
    loadMyPasses(viewer, today, today),
    loadLoyaltyPasses(club, viewer.userId, loyaltySince(rule, today)),
  ])
  const pass = mine[0] ?? null
  return {
    rule,
    loyalty: loyaltyOf(visits, rule, today),
    todayPass: pass
      ? { id: pass.id, text: `${pass.productName}, ${timeIn(pass.startsAt, club.timezone)} a ${timeIn(pass.endsAt, club.timezone)}` }
      : null,
    todayText: todayText(products, overrides, sold, today),
  }
}
```

- [ ] **Step 2: Typecheck and tests**

Run:
```bash
npm run typecheck
npm test
```
Expected: PASS. Si supabase-js infiere para los embeds o para `status` una forma distinta de `PassRow`, ajustar el tipo en `lib/domain/day-use.ts` (nunca castear el resultado). `total` llega como `number | null` (columna generada): `toPass` ya lo cubre.

- [ ] **Step 3: Commit**

```bash
git add lib/data/day-use.ts
git commit -m "feat(data): load day use passes, totals, stamps and the Inicio card"
```

---

### Task 16: Acciones del jugador, del club, del perfil y de Sellos

**Files:**
- Create: `app/(jugador)/day-use/actions.ts`
- Create: `app/(club)/club/day-use/actions.ts`
- Modify: `lib/actions/profile.ts`
- Modify: `app/(club)/club/ajustes/actions.ts`
- Test: `tests/unit/lib/actions/day-use-actions.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/actions/day-use-actions.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INVALID_INPUT } from '@/lib/actions/result'
import { skippedNotice } from '@/lib/domain/day-use'

// Server Actions are reachable by any POST: bad input must stop before any RPC.
type RpcResult = { data: unknown; error: { message: string } | null }
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<RpcResult>>(async () => ({
  data: { id: 'pass-new' },
  error: null,
}))
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`)
})
const select = vi.fn<(columns: string) => Promise<{ data: { id: string }[]; error: null }>>(async () => ({
  data: [{ id: 'club-1' }],
  error: null,
}))
const eq = vi.fn<(column: string, value: string) => { select: typeof select }>(() => ({ select }))
const update = vi.fn<(values: Record<string, unknown>) => { eq: typeof eq }>(() => ({ eq }))
const from = vi.fn<(table: string) => { update: typeof update }>(() => ({ update }))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path) }))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc, from }) }))
vi.mock('@/lib/auth/viewer', () => ({
  getViewer: async () => ({ userId: 'u1', club: { id: 'club-1', timezone: 'America/Montevideo' }, membership: { role: 'admin' } }),
}))

const player = await import('@/app/(jugador)/day-use/actions')
const club = await import('@/app/(club)/club/day-use/actions')
const { setShowInClub } = await import('@/lib/actions/profile')
const { updateLoyalty } = await import('@/app/(club)/club/ajustes/actions')
const { errorMessage } = await import('@/lib/domain/errors')

const ID = '55555555-5555-5555-5555-555555555555'
const C1 = '22222222-2222-2222-2222-222222222201'
const IDLE = { status: 'idle' as const }
const PRODUCT = {
  name: 'Day use completo',
  price: '450',
  capacity: '30',
  includes: 'Vestuarios, Pileta',
  weekdays: ['6', '0'],
  fromTime: '08:00',
  toTime: '12:30',
  courtIds: [C1],
  sortOrder: '1',
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
  from.mockClear()
  update.mockClear()
})

describe('buyDayUse', () => {
  it('rejects bad input without calling the database', async () => {
    expect(await player.buyDayUse(IDLE, form({ productId: 'p1', date: '2026-10-03', useReward: 'false' }))).toEqual(INVALID_INPUT)
    expect(await player.buyDayUse(IDLE, form({ productId: ID, date: '2026-02-30', useReward: 'false' }))).toEqual(INVALID_INPUT)
    expect(await player.buyDayUse(IDLE, form({ productId: ID, date: '2026-10-03', useReward: 'yes' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('buys, with the reward if asked, and opens the pass', async () => {
    await expect(player.buyDayUse(IDLE, form({ productId: ID, date: '2026-10-03', useReward: 'true' }))).rejects.toThrow(
      'NEXT_REDIRECT /day-use/pase/pass-new',
    )
    expect(rpc).toHaveBeenCalledWith('buy_day_use', { p_product_id: ID, p_date: '2026-10-03', p_use_reward: true })
  })

  it('translates what the database says', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'day_use_full' } })
    expect(await player.buyDayUse(IDLE, form({ productId: ID, date: '2026-10-03', useReward: 'false' }))).toEqual({
      status: 'error',
      message: errorMessage('day_use_full'),
    })
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('pass actions', () => {
  it('reject ids, flags and amounts that do not have the right shape', async () => {
    const bad = form({ passId: 'p1', productId: 'p1', date: 'hoy' })
    for (const action of [
      player.cancelMyPass,
      club.checkInPass,
      club.cancelPass,
      club.recordPassCash,
      club.setProductActive,
      club.setDayUseOverride,
    ]) {
      expect(await action(IDLE, bad)).toEqual(INVALID_INPUT)
    }
    expect(await club.recordPassCash(IDLE, form({ passId: ID, amount: '0' }))).toEqual(INVALID_INPUT)
    expect(await club.setProductActive(IDLE, form({ productId: ID, active: 'maybe' }))).toEqual(INVALID_INPUT)
    expect(await club.setDayUseOverride(IDLE, form({ productId: ID, date: '2026-10-03', enabled: 'x' }))).toEqual(INVALID_INPUT)
    expect(await club.sellDayUse(IDLE, form({ productId: ID, date: '2026-10-03', holder: 'guest', guestName: '' }))).toEqual(
      INVALID_INPUT,
    )
    expect(await club.sellDayUse(IDLE, form({ productId: ID, date: '2026-10-03', holder: 'player', playerId: 'ana' }))).toEqual(
      INVALID_INPUT,
    )
    expect(await player.reportPassTransfer('p1', null)).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('call each function with its arguments', async () => {
    await player.cancelMyPass(IDLE, form({ passId: ID }))
    await player.reportPassTransfer(ID, 'u1/recibo.png')
    await club.checkInPass(IDLE, form({ passId: ID }))
    await club.cancelPass(IDLE, form({ passId: ID }))
    await club.recordPassCash(IDLE, form({ passId: ID, amount: '450' }))
    await club.sellDayUse(IDLE, form({ productId: ID, date: '2026-10-03', holder: 'guest', guestName: 'Pepe', useReward: 'on' }))
    await club.sellDayUse(IDLE, form({ productId: ID, date: '2026-10-03', holder: 'player', playerId: ID, useReward: 'on' }))
    await club.setProductActive(IDLE, form({ productId: ID, active: 'false' }))
    await club.setDayUseOverride(IDLE, form({ productId: ID, date: '2026-10-03', enabled: 'true' }))
    expect(rpc.mock.calls).toEqual([
      ['cancel_day_use', { p_pass_id: ID }],
      ['report_day_use_transfer', { p_pass_id: ID, p_receipt_path: 'u1/recibo.png' }],
      ['check_in_day_use', { p_pass_id: ID }],
      ['cancel_day_use', { p_pass_id: ID }],
      ['record_day_use_cash', { p_pass_id: ID, p_amount: 450 }],
      ['sell_day_use', { p_product_id: ID, p_date: '2026-10-03', p_player_id: undefined, p_guest_name: 'Pepe', p_use_reward: false }],
      ['sell_day_use', { p_product_id: ID, p_date: '2026-10-03', p_player_id: ID, p_guest_name: undefined, p_use_reward: true }],
      ['set_day_use_product_active', { p_product_id: ID, p_active: false }],
      ['set_day_use_override', { p_product_id: ID, p_date: '2026-10-03', p_enabled: true }],
    ])
  })

  it('say what happened', async () => {
    rpc.mockResolvedValueOnce({ data: 2, error: null })
    expect(await club.setDayUseOverride(IDLE, form({ productId: ID, date: '2026-10-03', enabled: 'true' }))).toEqual({
      status: 'ok',
      message: `Ese día hay day use.${skippedNotice(2)}`,
    })
    expect(await club.checkInPass(IDLE, form({ passId: ID }))).toEqual({ status: 'ok', message: 'Ingreso registrado.' })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'not_today' } })
    expect(await club.checkInPass(IDLE, form({ passId: ID }))).toEqual({ status: 'error', message: errorMessage('not_today') })
  })
})

describe('saveDayUseProduct', () => {
  it('explains bad input without calling the database', async () => {
    expect(await club.saveDayUseProduct(IDLE, form({ ...PRODUCT, capacity: '0' }))).toEqual({
      status: 'error',
      message: 'El cupo va de 1 a 500 personas.',
    })
    expect(await club.saveDayUseProduct(IDLE, form({ ...PRODUCT, productId: 'p1' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('creates a pass for the viewer club and warns about taken courts', async () => {
    rpc.mockResolvedValueOnce({ data: [{ saved_id: ID, skipped_count: 1 }], error: null })
    expect(await club.saveDayUseProduct(IDLE, form(PRODUCT))).toEqual({ status: 'ok', message: `Pase guardado.${skippedNotice(1)}` })
    expect(rpc).toHaveBeenCalledWith('save_day_use_product', {
      p_club_id: 'club-1',
      p_name: 'Day use completo',
      p_price: 450,
      p_includes: ['Vestuarios', 'Pileta'],
      p_weekdays: [0, 6],
      p_from_time: '08:00',
      p_to_time: '12:30',
      p_capacity: 30,
      p_court_ids: [C1],
      p_sort_order: 1,
      p_product_id: undefined,
    })
  })

  it('edits the pass it is given', async () => {
    await club.saveDayUseProduct(IDLE, form({ ...PRODUCT, productId: ID }))
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_product_id: ID })
  })
})

describe('profile and stamps settings', () => {
  it('saves whether the player shows in "Ya están en el club"', async () => {
    await setShowInClub(IDLE, form({}))
    expect(rpc).toHaveBeenLastCalledWith('set_show_in_club', { p_show: false })
    await setShowInClub(IDLE, form({ showInClub: 'on' }))
    expect(rpc).toHaveBeenLastCalledWith('set_show_in_club', { p_show: true })
  })

  it('saves the stamps rule on the club, and explains bad input', async () => {
    expect(
      await updateLoyalty(IDLE, form({ loyalty_every: '0', loyalty_discount_percent: '100', loyalty_expiry_months: '6' })),
    ).toEqual({ status: 'error', message: 'Los day use para la recompensa van de 1 a 50.' })
    expect(from).not.toHaveBeenCalled()
    expect(
      await updateLoyalty(
        IDLE,
        form({ loyalty_enabled: 'on', loyalty_every: '5', loyalty_discount_percent: '100', loyalty_expiry_months: 'never' }),
      ),
    ).toEqual({ status: 'ok', message: 'Sellos guardados.' })
    expect(from).toHaveBeenCalledWith('clubs')
    expect(update).toHaveBeenCalledWith({
      loyalty_enabled: true,
      loyalty_every: 5,
      loyalty_discount_percent: 100,
      loyalty_expiry_months: null,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/actions/day-use-actions.test.ts`
Expected: FAIL (`Failed to resolve import "@/app/(jugador)/day-use/actions"`).

- [ ] **Step 3: Write the player actions**

`app/(jugador)/day-use/actions.ts`:
```ts
'use server'

import { redirect } from 'next/navigation'
import { fromRpc, INVALID_INPUT, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { isUuid, readLocalDate, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

// useReward comes from a hidden input: "true" or "false", nothing else.
export async function buyDayUse(_previous: ActionState, form: FormData): Promise<ActionState> {
  const productId = readUuid(form, 'productId')
  const date = readLocalDate(form, 'date')
  const useReward = form.get('useReward')
  if (!productId || !date || (useReward !== 'true' && useReward !== 'false')) return INVALID_INPUT
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('buy_day_use', {
    p_product_id: productId,
    p_date: date,
    p_use_reward: useReward === 'true',
  })
  if (error) return fromRpc(error, '')
  revalidateBookings()
  redirect(`/day-use/pase/${data.id}`)
}

export async function cancelMyPass(_previous: ActionState, form: FormData): Promise<ActionState> {
  const passId = readUuid(form, 'passId')
  if (!passId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_day_use', { p_pass_id: passId })
  revalidateBookings()
  return fromRpc(error, 'Pase cancelado. Si usaste tu recompensa, la recuperaste; si pagaste, el club te devuelve la plata.')
}

// Called after the browser uploaded the receipt; report_day_use_transfer checks the path is hers.
export async function reportPassTransfer(passId: string, receiptPath: string | null): Promise<ActionState> {
  if (!isUuid(passId)) return INVALID_INPUT
  if (receiptPath !== null && (typeof receiptPath !== 'string' || receiptPath.length > 300)) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('report_day_use_transfer', {
    p_pass_id: passId,
    p_receipt_path: receiptPath ?? undefined,
  })
  revalidateBookings()
  return fromRpc(error, 'Listo, le avisamos al club. Te confirma el pago cuando lo vea.')
}
```

- [ ] **Step 4: Write the club actions**

`app/(club)/club/day-use/actions.ts`:
```ts
'use server'

import { failed, fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { getViewer } from '@/lib/auth/viewer'
import { skippedNotice } from '@/lib/domain/day-use'
import { parseProductForm } from '@/lib/domain/day-use-form'
import { readBoolean, readInt, readLocalDate, readText, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>
type RpcCall = PromiseLike<{ error: { message: string } | null }>

// The database checks the caller is staff (or admin, for the configuration); these only check the
// shape of what comes in.
async function run(call: (supabase: Supabase) => RpcCall, okMessage: string): Promise<ActionState> {
  const supabase = await createClient()
  const { error } = await call(supabase)
  revalidateBookings()
  return fromRpc(error, okMessage)
}

async function onPass(
  form: FormData,
  call: (supabase: Supabase, passId: string) => RpcCall,
  okMessage: string,
): Promise<ActionState> {
  const passId = readUuid(form, 'passId')
  if (!passId) return INVALID_INPUT
  return run((supabase) => call(supabase, passId), okMessage)
}

// "true" or "false" from a hidden input; anything else is null.
function readFlag(form: FormData, name: string): boolean | null {
  const value = form.get(name)
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

// To a member (who may use her reward) or to a name, like the holder fields of the grid.
export async function sellDayUse(_previous: ActionState, form: FormData): Promise<ActionState> {
  const productId = readUuid(form, 'productId')
  const date = readLocalDate(form, 'date')
  const holder = form.get('holder')
  const playerId = holder === 'player' ? readUuid(form, 'playerId') : null
  const guestName = holder === 'guest' ? readText(form, 'guestName', { maxLength: 60 }) : null
  if (!productId || !date || (playerId === null) === (guestName === null)) return INVALID_INPUT
  return run(
    (supabase) =>
      supabase.rpc('sell_day_use', {
        p_product_id: productId,
        p_date: date,
        p_player_id: playerId ?? undefined,
        p_guest_name: guestName ?? undefined,
        p_use_reward: playerId !== null && readBoolean(form, 'useReward'),
      }),
    'Pase vendido.',
  )
}

export async function checkInPass(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onPass(form, (supabase, id) => supabase.rpc('check_in_day_use', { p_pass_id: id }), 'Ingreso registrado.')
}

export async function cancelPass(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onPass(
    form,
    (supabase, id) => supabase.rpc('cancel_day_use', { p_pass_id: id }),
    'Pase cancelado. Si había pagado, aparece en Cobros para devolver.',
  )
}

export async function recordPassCash(_previous: ActionState, form: FormData): Promise<ActionState> {
  const amount = readInt(form, 'amount', { min: 1, max: 10_000_000 })
  if (amount === null) return INVALID_INPUT
  return onPass(
    form,
    (supabase, id) => supabase.rpc('record_day_use_cash', { p_pass_id: id, p_amount: amount }),
    'Pago en efectivo registrado.',
  )
}

export async function saveDayUseProduct(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return failed('Tu sesión venció. Volvé a ingresar.')
  const hasId = form.get('productId') !== null
  const productId = readUuid(form, 'productId')
  if (hasId && !productId) return INVALID_INPUT
  const parsed = parseProductForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const input = parsed.value

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('save_day_use_product', {
    p_club_id: viewer.club.id,
    p_name: input.name,
    p_price: input.price,
    p_includes: input.includes,
    p_weekdays: input.weekdays,
    p_from_time: input.fromTime,
    p_to_time: input.toTime,
    p_capacity: input.capacity,
    p_court_ids: input.courtIds,
    p_sort_order: input.sortOrder,
    p_product_id: productId ?? undefined,
  })
  revalidateBookings()
  if (error) return fromRpc(error, '')
  return ok(`Pase guardado.${skippedNotice(data?.[0]?.skipped_count ?? 0)}`)
}

export async function setProductActive(_previous: ActionState, form: FormData): Promise<ActionState> {
  const productId = readUuid(form, 'productId')
  const active = readFlag(form, 'active')
  if (!productId || active === null) return INVALID_INPUT
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_day_use_product_active', { p_product_id: productId, p_active: active })
  revalidateBookings()
  if (error) return fromRpc(error, '')
  if (!active) return ok('Pase desactivado: ya no se vende y sus canchas quedaron libres. Los pases vendidos siguen valiendo.')
  return ok(`Pase activado.${skippedNotice(typeof data === 'number' ? data : 0)}`)
}

export async function setDayUseOverride(_previous: ActionState, form: FormData): Promise<ActionState> {
  const productId = readUuid(form, 'productId')
  const date = readLocalDate(form, 'date')
  const enabled = readFlag(form, 'enabled')
  if (!productId || !date || enabled === null) return INVALID_INPUT
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_day_use_override', { p_product_id: productId, p_date: date, p_enabled: enabled })
  revalidateBookings()
  if (error) return fromRpc(error, '')
  if (!enabled) return ok('Ese día no hay day use. Los pases vendidos siguen valiendo.')
  return ok(`Ese día hay day use.${skippedNotice(typeof data === 'number' ? data : 0)}`)
}
```

- [ ] **Step 5: "Aparecer en «Ya están en el club»" and the stamps rule**

In `lib/actions/profile.ts`, add after `savePreferredCourts`:
```ts
// Whether other players see her name in "Ya están en el club" when she checks in.
export async function setShowInClub(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return failed('Tu sesión venció. Volvé a ingresar.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_show_in_club', { p_show: readBoolean(form, 'showInClub') })
  revalidateBookings()
  return fromRpc(error, 'Guardamos tu preferencia.')
}
```

In `app/(club)/club/ajustes/actions.ts`, add the import:
```ts
import { parseLoyaltyForm } from '@/lib/domain/loyalty'
```
and after `updateClubSettings`:
```ts
// Stamps rule (Ajustes → Sellos). The clubs check constraints have the last word.
export async function updateLoyalty(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  const parsed = parseLoyaltyForm(form)
  if (!parsed.ok) return failed(parsed.message)

  const supabase = await createClient()
  const { data, error } = await supabase.from('clubs').update(parsed.value).eq('id', clubId).select('id')
  if (error) return failed('No pudimos guardar los sellos. Revisá los datos.')
  if (data.length === 0) return FORBIDDEN
  revalidateBookings()
  return ok('Sellos guardados.')
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/lib/actions/day-use-actions.test.ts tests/unit/lib/actions/server-actions.test.ts
npm run typecheck
```
Expected: PASS. Si typecheck no acepta `supabase.rpc(...)` como `RpcCall`, ajustar `RpcCall` al tipo que infiere, sin cast (mismo aviso que la fase 3a).

- [ ] **Step 7: Commit**

```bash
git add "app/(jugador)/day-use/actions.ts" "app/(club)/club/day-use/actions.ts" lib/actions/profile.ts "app/(club)/club/ajustes/actions.ts" tests/unit/lib/actions/day-use-actions.test.ts
git commit -m "feat(actions): day use actions for players, reception and admin"
```

---
## Corte 5: Pantallas del jugador

### Task 17: Fila de sellos y "Ya están en el club"

**Files:**
- Create: `components/day-use/stamp-row.tsx`
- Create: `components/day-use/inside-list.tsx`
- Modify: `app/globals.css`
- Test: `tests/unit/components/day-use/stamp-row.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/day-use/stamp-row.test.tsx`:
```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InsideList } from '@/components/day-use/inside-list'
import { StampRow } from '@/components/day-use/stamp-row'
import { NO_LOYALTY, type LoyaltyRule } from '@/lib/domain/loyalty'
import { at, TIMEZONE } from '../../fixtures/grid'

const RULE: LoyaltyRule = { enabled: true, every: 5, discountPercent: 100, expiryMonths: 6 }

describe('StampRow', () => {
  it('shows a ball per stamp, the earned ones first, and the reward at the end', () => {
    render(<StampRow loyalty={{ ...NO_LOYALTY, stamps: 3, progress: 3 }} rule={RULE} />)
    const items = within(screen.getByRole('list', { name: 'Tus sellos' })).getAllByRole('listitem')
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Sello 1: ganado',
      'Sello 2: ganado',
      'Sello 3: ganado',
      'Sello 4: falta',
      'Sello 5: falta',
      'Recompensa -100%: por ganar',
    ])
    expect(screen.getByText('3 de 5 sellos')).toBeInTheDocument()
  })

  it('pops only the stamp just earned', () => {
    const { container } = render(<StampRow loyalty={{ ...NO_LOYALTY, stamps: 2, progress: 2 }} rule={RULE} />)
    expect(container.querySelectorAll('.stamp-pop')).toHaveLength(1)
  })

  it('lights the reward when there is one to use', () => {
    render(<StampRow loyalty={{ stamps: 5, earned: 1, used: 0, available: 1, progress: 0 }} rule={RULE} />)
    expect(screen.getByRole('listitem', { name: 'Recompensa -100%: disponible' })).toBeInTheDocument()
    expect(screen.getByText('0 de 5 sellos · Tenés 1 recompensa')).toBeInTheDocument()
  })
})

describe('InsideList', () => {
  it('lists who is in, with their pass and since when', () => {
    render(<InsideList people={[{ name: 'Gabi', productName: 'Day use completo', checkedInAt: at('10:12') }]} timezone={TIMEZONE} />)
    const item = within(screen.getByRole('region', { name: 'Ya están en el club' })).getByRole('listitem')
    expect(item).toHaveTextContent('Gabi')
    expect(item).toHaveTextContent('Day use completo, desde las 10:12')
  })

  it('says when nobody arrived yet', () => {
    render(<InsideList people={[]} timezone={TIMEZONE} />)
    expect(screen.getByText('Todavía no llegó nadie.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/day-use/stamp-row.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/day-use/inside-list"`).

- [ ] **Step 3: Write the components**

`components/day-use/stamp-row.tsx`:
```tsx
import { cn } from '@/lib/cn'
import { rewardLabel, stampsText, type Loyalty, type LoyaltyRule } from '@/lib/domain/loyalty'

// A padel ball: an earned stamp in amber with its seam; a missing one dotted, with its number.
function Ball({ number, earned, fresh }: { number: number; earned: boolean; fresh: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 40"
      className={cn('size-10', earned ? 'text-accent' : 'text-fg-muted', fresh && 'stamp-pop')}
    >
      {earned ? (
        <>
          <circle cx="20" cy="20" r="17" fill="currentColor" />
          <path d="M9 8c6 5 6 19 0 24M31 8c-6 5-6 19 0 24" fill="none" stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 4" />
          <text x="20" y="25" textAnchor="middle" fontSize="14" fontWeight="700" fill="currentColor">
            {number}
          </text>
        </>
      )}
    </svg>
  )
}

// The gift at the end of the row, with the discount the club gives.
function Gift({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-10 items-center gap-1 rounded-full border-2 px-2 text-sm font-bold',
        ready ? 'border-accent bg-accent text-on-accent' : 'border-dashed border-fg-muted text-fg-muted',
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="8" width="18" height="4" rx="1" />
        <path d="M12 8v13M5 12v9h14v-9M12 8C10 4 7 4 7 6s3 2 5 2c2 0 5 0 5-2s-3-2-5 2" />
      </svg>
      {label}
    </span>
  )
}

// Design: "Sellos". The progress towards the next reward; the stamp just earned pops once
// (.stamp-pop in globals.css, skipped with reduced motion).
export function StampRow({ loyalty, rule }: { loyalty: Loyalty; rule: LoyaltyRule }) {
  const ready = loyalty.available > 0
  return (
    <div className="flex flex-col gap-2">
      <ol aria-label="Tus sellos" className="flex flex-wrap items-center gap-2">
        {Array.from({ length: rule.every }, (_, index) => {
          const earned = index < loyalty.progress
          return (
            <li key={index} aria-label={`Sello ${index + 1}: ${earned ? 'ganado' : 'falta'}`}>
              <Ball number={index + 1} earned={earned} fresh={earned && index === loyalty.progress - 1} />
            </li>
          )
        })}
        <li aria-label={`Recompensa ${rewardLabel(rule.discountPercent)}: ${ready ? 'disponible' : 'por ganar'}`}>
          <Gift label={rewardLabel(rule.discountPercent)} ready={ready} />
        </li>
      </ol>
      <p className="text-sm">
        {stampsText(loyalty, rule)}
        {ready ? ` · Tenés ${loyalty.available === 1 ? '1 recompensa' : `${loyalty.available} recompensas`}` : ''}
      </p>
    </div>
  )
}
```

`components/day-use/inside-list.tsx`:
```tsx
import type { InsidePerson } from '@/lib/domain/day-use'
import { timeIn } from '@/lib/domain/format'

// Design: "Ya están en el club". day_use_inside already leaves out who chose to hide.
export function InsideList({ people, timezone }: { people: InsidePerson[]; timezone: string }) {
  return (
    <section aria-labelledby="en-el-club" className="flex flex-col gap-2">
      <h2 id="en-el-club" className="font-display text-2xl font-bold uppercase">
        Ya están en el club
      </h2>
      {people.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {people.map((person, index) => (
            <li key={`${person.name}-${index}`} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-xl border border-border p-3">
              <span className="font-semibold">{person.name}</span>
              <span className="text-sm text-fg-muted">
                {person.productName}, desde las {timeIn(person.checkedInAt, timezone)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-fg-muted">Todavía no llegó nadie.</p>
      )}
      <p className="text-xs text-fg-muted">Si no querés aparecer en esta lista, cambialo en tu perfil.</p>
    </section>
  )
}
```

In `app/globals.css`, add at the end:
```css
/* A stamp just earned pops once; skipped when the viewer asks for less motion. */
@media (prefers-reduced-motion: no-preference) {
  .stamp-pop {
    transform-box: fill-box;
    transform-origin: center;
    animation: stamp-pop 450ms ease-out;
  }
}

@keyframes stamp-pop {
  0% { transform: scale(0.4); opacity: 0; }
  70% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/components/day-use/stamp-row.test.tsx tests/unit/app/design-tokens.test.ts
```
Expected: PASS (el test de tokens sigue leyendo dos bloques `:root`).

- [ ] **Step 5: Commit**

```bash
git add components/day-use/stamp-row.tsx components/day-use/inside-list.tsx app/globals.css tests/unit/components/day-use/stamp-row.test.tsx
git commit -m "feat(ui): stamps as padel balls and who is in the club"
```

---

### Task 18: Días tachados y tarjeta del pase para comprar

**Files:**
- Modify: `components/booking/day-strip.tsx`
- Modify: `tests/unit/components/booking/day-strip.test.tsx`
- Create: `components/day-use/product-offer.tsx`
- Test: `tests/unit/components/day-use/product-offer.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/components/booking/day-strip.test.tsx`, add inside `describe('DayStrip', …)`:
```tsx
  it('crosses out the days without day use', () => {
    render(
      <DayStrip
        days={[...DAYS.slice(0, 2), { date: '2026-10-01', label: 'jue 1', closed: true }]}
        selected="2026-09-30"
        basePath="/day-use"
      />,
    )
    expect(screen.getByRole('link', { name: 'jue 1, sin day use' })).toHaveClass('line-through')
    expect(screen.getByRole('link', { name: 'Hoy' })).not.toHaveClass('line-through')
  })
```

`tests/unit/components/day-use/product-offer.test.tsx`:
```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProductOffer, type ProductOfferProps } from '@/components/day-use/product-offer'
import type { FormAction } from '@/components/ui/action-form'
import { makeProduct } from '../../fixtures/day-use'

function renderOffer(overrides: Partial<ProductOfferProps> = {}) {
  const props: ProductOfferProps = {
    product: makeProduct(),
    date: '2026-10-03',
    dateText: 'sábado 3 de octubre',
    sold: 12,
    status: { ok: true, text: 'Comprar pase, $450' },
    reward: null,
    paymentNote: 'Se paga en el club.',
    action: vi.fn<FormAction>(),
    ...overrides,
  }
  render(<ProductOffer {...props} />)
}

const hidden = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value

describe('ProductOffer', () => {
  it('shows the pass, its hours, what it includes, the price and how full it is', () => {
    renderOffer()
    const card = screen.getByRole('article', { name: 'Day use completo' })
    expect(card).toHaveTextContent('08:00 a 12:30 · Vestuarios, Pileta y Cancha libre')
    expect(card).toHaveTextContent('$450')
    expect(screen.getByRole('progressbar', { name: 'Cupo' })).toHaveAttribute('aria-valuenow', '12')
    expect(card).toHaveTextContent('Quedan 18 de 30')
  })

  it('asks before buying', async () => {
    renderOffer()
    await userEvent.click(screen.getByRole('button', { name: 'Comprar pase, $450' }))
    const sheet = screen.getByRole('dialog', { name: 'Comprar pase' })
    expect(sheet).toHaveTextContent('Day use completo, sábado 3 de octubre, 08:00 a 12:30. $450. Se paga en el club.')
    expect(within(sheet).getByRole('button', { name: 'Confirmar compra' })).toBeInTheDocument()
    expect(hidden('date')).toBe('2026-10-03')
    expect(hidden('useReward')).toBe('false')
  })

  it('offers the reward when there is one', async () => {
    renderOffer({ reward: { percent: 100 } })
    await userEvent.click(screen.getByRole('button', { name: 'Usar mi recompensa (-100%)' }))
    expect(screen.getByRole('dialog', { name: 'Comprar pase' })).toHaveTextContent(
      'Con tu recompensa (-100%): $0. El day use con recompensa no suma sello.',
    )
    expect(hidden('useReward')).toBe('true')
  })

  it('says why the player cannot buy', () => {
    renderOffer({ status: { ok: false, text: 'No quedan lugares.' }, reward: { percent: 100 } })
    expect(screen.getByText('No quedan lugares.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Comprar pase|Usar mi recompensa/ })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/booking/day-strip.test.tsx tests/unit/components/day-use/product-offer.test.tsx`
Expected: FAIL (no `sin day use`; `Failed to resolve import "@/components/day-use/product-offer"`).

- [ ] **Step 3: Cross out closed days**

In `components/booking/day-strip.tsx`, replace the props type with:
```tsx
export type DayStripProps = {
  // closed: no day use that day (the day use screen); the booking screen never sets it.
  days: { date: LocalDate; label: string; closed?: boolean }[]
  selected: LocalDate
  basePath: string
}
```
replace `{days.map(({ date, label }) => {` with `{days.map(({ date, label, closed }) => {`, replace the `className={cn(…)}` of the `Link` with:
```tsx
                className={cn(
                  'inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 font-semibold',
                  current ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface text-fg',
                  closed && 'line-through',
                )}
```
and replace `{label}` inside the `Link` with:
```tsx
                {label}
                {closed ? <span className="sr-only">, sin day use</span> : null}
```

- [ ] **Step 4: Write the offer card**

`components/day-use/product-offer.tsx`:
```tsx
'use client'

import { useCallback, useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { includesText, passTotal, scheduleText, spotsText, type BuyStatus, type DayUseProduct } from '@/lib/domain/day-use'
import { formatPrice } from '@/lib/domain/format'
import { rewardLabel } from '@/lib/domain/loyalty'
import type { LocalDate } from '@/lib/domain/time'

export type ProductOfferProps = {
  product: DayUseProduct
  date: LocalDate
  dateText: string
  sold: number
  status: BuyStatus
  // The player's reward, when she has one to use.
  reward: { percent: number } | null
  paymentNote: string
  action: FormAction
}

// Design: "/day-use", one pass of the chosen day. Buying asks first; the action opens the pass.
export function ProductOffer({ product, date, dateText, sold, status, reward, paymentNote, action }: ProductOfferProps) {
  const [useReward, setUseReward] = useState<boolean | null>(null)
  const close = useCallback(() => setUseReward(null), [])
  const titleId = `pase-${product.id}`
  const withReward = useReward === true && reward !== null
  const total = passTotal(product.price, withReward ? reward.percent : 0)
  const detail = withReward
    ? `Con tu recompensa (${rewardLabel(reward.percent)}): ${formatPrice(total)}. El day use con recompensa no suma sello.`
    : `${formatPrice(total)}. ${paymentNote}`

  return (
    <article aria-labelledby={titleId} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={titleId} className="font-display text-xl font-bold uppercase">
            {product.name}
          </h3>
          <p className="text-sm text-fg-muted">
            {scheduleText(product)}
            {product.includes.length > 0 ? ` · ${includesText(product.includes)}` : ''}
          </p>
        </div>
        <p className="font-display text-2xl font-bold tabular-nums">{formatPrice(product.price)}</p>
      </div>
      <div className="flex flex-col gap-1">
        <div
          role="progressbar"
          aria-label="Cupo"
          aria-valuemin={0}
          aria-valuemax={product.capacity}
          aria-valuenow={sold}
          className="h-2 overflow-hidden rounded-full bg-bg"
        >
          <div className="h-full bg-court" style={{ width: `${Math.min(100, (sold / product.capacity) * 100)}%` }} />
        </div>
        <p className="text-sm text-fg-muted">{spotsText(product.capacity, sold)}</p>
      </div>
      {status.ok ? (
        <div className="flex flex-col gap-2">
          <Button fullWidth onClick={() => setUseReward(false)}>
            {status.text}
          </Button>
          {reward ? (
            <Button variant="secondary" fullWidth onClick={() => setUseReward(true)}>
              Usar mi recompensa ({rewardLabel(reward.percent)})
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm">{status.text}</p>
      )}
      <BottomSheet open={useReward !== null} onClose={close} title="Comprar pase">
        <p className="mb-4">
          {product.name}, {dateText}, {scheduleText(product)}. {detail} Podés cancelarlo hasta que registres el ingreso.
        </p>
        <ActionForm action={action} submitLabel="Confirmar compra" pendingLabel="Comprando…">
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="useReward" value={withReward ? 'true' : 'false'} />
        </ActionForm>
      </BottomSheet>
    </article>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/components/booking/day-strip.test.tsx tests/unit/components/day-use/product-offer.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/booking/day-strip.tsx tests/unit/components/booking/day-strip.test.tsx components/day-use/product-offer.tsx tests/unit/components/day-use/product-offer.test.tsx
git commit -m "feat(ui): crossed-out days and the day use pass to buy"
```

---

### Task 19: Pantalla `/day-use`

**Files:**
- Create: `app/(jugador)/day-use/page.tsx`

(no unit test — Server Component que compone piezas ya probadas; lo recorre el e2e de la Task 37)

- [ ] **Step 1: Read the Next guide**

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` (`searchParams` as a Promise).

- [ ] **Step 2: Write the page**

`app/(jugador)/day-use/page.tsx`:
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { DayStrip } from '@/components/booking/day-strip'
import { InsideList } from '@/components/day-use/inside-list'
import { ProductOffer } from '@/components/day-use/product-offer'
import { StampRow } from '@/components/day-use/stamp-row'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { Card } from '@/components/ui/card'
import { requirePlayer } from '@/lib/auth/viewer'
import { loadInside, loadLoyaltyPasses, loadMyPasses, loadOverrides, loadProducts, loadSold } from '@/lib/data/day-use'
import { buyStatus, dayUseDays, openProducts, PASS_STATUS_LABELS, soldOf, WEEK_DAYS } from '@/lib/domain/day-use'
import { dayLabel, dayLongLabel } from '@/lib/domain/format'
import { isLocalDate } from '@/lib/domain/input'
import { loyaltyOf, loyaltyRuleOf, loyaltyRuleText, loyaltySince } from '@/lib/domain/loyalty'
import { paymentMethodsNote } from '@/lib/domain/payments'
import { addDays, localDateOf } from '@/lib/domain/time'
import { buyDayUse } from './actions'

export const metadata: Metadata = { title: 'Day use' }

type SearchParams = Promise<{ dia?: string }>

export default async function DayUsePage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requirePlayer('/day-use')
  const { club } = viewer
  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const last = addDays(today, WEEK_DAYS - 1)
  const { dia } = await searchParams
  const selected = isLocalDate(dia) && dia >= today && dia <= last ? dia : today
  const rule = loyaltyRuleOf(club)

  const [products, overrides, sold, mine, visits, inside] = await Promise.all([
    loadProducts(club),
    loadOverrides(club, today, last),
    loadSold(club, today, last),
    loadMyPasses(viewer, today),
    loadLoyaltyPasses(club, viewer.userId, loyaltySince(rule, today)),
    loadInside(club, today),
  ])
  const loyalty = loyaltyOf(visits, rule, today)
  const reward = rule.enabled && loyalty.available > 0 ? { percent: rule.discountPercent } : null
  const offers = openProducts(products, selected, overrides)

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">Day use</h1>
        <p className="text-fg-muted">Disfrutá el club por el día: comprá tu pase y mostralo en recepción al llegar.</p>
      </div>
      {rule.enabled ? (
        <Card className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold uppercase">Tus sellos</h2>
          <StampRow loyalty={loyalty} rule={rule} />
          <p className="text-sm text-fg-muted">{loyaltyRuleText(rule)}</p>
        </Card>
      ) : null}
      {mine.length > 0 ? (
        <section aria-labelledby="tus-pases" className="flex flex-col gap-2">
          <h2 id="tus-pases" className="font-display text-2xl font-bold uppercase">
            Tus pases
          </h2>
          <ul className="flex flex-col gap-2">
            {mine.map((pass) => (
              <li key={pass.id}>
                <Link
                  href={`/day-use/pase/${pass.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 font-semibold hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span>
                    {dayLabel(pass.date, today)}: {pass.productName}
                  </span>
                  <span className="text-sm text-fg-muted">{PASS_STATUS_LABELS[pass.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <DayStrip days={dayUseDays(today, products, overrides)} selected={selected} basePath="/day-use" />
      {offers.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {offers.map((product) => {
            const count = soldOf(sold, product.id, selected)
            return (
              <li key={product.id}>
                <ProductOffer
                  product={product}
                  date={selected}
                  dateText={dayLongLabel(selected)}
                  sold={count.sold}
                  status={buyStatus(product, selected, overrides, {
                    now,
                    today,
                    timezone: club.timezone,
                    windowDays: club.booking_window_days,
                    sold: count.sold,
                    hasPass: mine.some((pass) => pass.productId === product.id && pass.date === selected),
                  })}
                  reward={reward}
                  paymentNote={paymentMethodsNote(club)}
                  action={buyDayUse}
                />
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-border p-4 text-fg-muted">
          {products.length > 0 ? 'Ese día no hay day use. Elegí otro día.' : 'El club todavía no ofrece day use.'}
        </p>
      )}
      <InsideList people={inside} timezone={club.timezone} />
    </>
  )
}
```

- [ ] **Step 3: Typecheck and lint**

Run:
```bash
npm run typecheck
npm run lint
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(jugador)/day-use/page.tsx"
git commit -m "feat(day-use): the day use screen for players"
```

---

### Task 20: "Mi pase" con el QR (`PassBoard`)

**Files:**
- Create: `app/(jugador)/day-use/pase/[id]/pass-board.tsx`
- Test: `tests/unit/app/day-use/pass-board.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/app/day-use/pass-board.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PassBoard, type PassBoardProps } from '@/app/(jugador)/day-use/pase/[id]/pass-board'
import type { ReportTransfer } from '@/components/booking/transfer-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { at, TIMEZONE } from '../../fixtures/grid'
import { makePass } from '../../fixtures/day-use'

function renderBoard(overrides: Partial<PassBoardProps> = {}) {
  const props: PassBoardProps = {
    pass: makePass(),
    viewerId: 'ana',
    qrSvg: '<svg viewBox="0 0 10 10"></svg>',
    whenText: 'jueves 1 de octubre, 08:00 a 12:30',
    timezone: TIMEZONE,
    payment: { state: 'pending', due: 450, canReportTransfer: true, rejectionReason: null },
    paymentNote: 'Se paga en el club o por transferencia.',
    transfer: { details: 'Banco Ejemplo', receiptRequired: true },
    canCancel: true,
    cancelAction: vi.fn<FormAction>(),
    reportAction: vi.fn<ReportTransfer>(),
    ...overrides,
  }
  render(<PassBoard {...props} />)
}

describe('PassBoard', () => {
  it('shows the QR, the code, when, and what is owed', () => {
    renderBoard()
    expect(screen.getByRole('heading', { name: 'Day use completo' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Código QR del pase' }).querySelector('svg')).not.toBeNull()
    expect(screen.getByTestId('pass-code')).toHaveTextContent('DU-482193')
    expect(screen.getByText('jueves 1 de octubre, 08:00 a 12:30')).toBeInTheDocument()
    expect(screen.getByText('Comprado')).toBeInTheDocument()
    expect(screen.getByText('Pendiente de pago')).toBeInTheDocument()
  })

  it('lets the player report a transfer and cancel', async () => {
    renderBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Ya transferí' }))
    expect(screen.getByRole('dialog', { name: 'Ya transferí' })).toHaveTextContent('Banco Ejemplo')
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar pase' }))
    expect(screen.getByRole('dialog', { name: 'Cancelar pase' })).toHaveTextContent('Tu lugar queda libre.')
  })

  it('says the entrance is registered once she is in', () => {
    renderBoard({ pass: makePass({ status: 'inside', checkedInAt: at('10:12') }), canCancel: false })
    expect(screen.getByRole('note')).toHaveTextContent('Ya registraste el ingreso a las 10:12. ¡Que lo disfrutes!')
    expect(screen.queryByRole('button', { name: 'Cancelar pase' })).not.toBeInTheDocument()
  })

  it('has nothing to pay with a full reward', () => {
    renderBoard({
      pass: makePass({ usedReward: true, discountPercent: 100, total: 0 }),
      payment: { state: 'paid', due: 0, canReportTransfer: false, rejectionReason: null },
    })
    expect(screen.getByText('Sin costo: usaste tu recompensa.')).toBeInTheDocument()
    expect(screen.getByText('$0 (-100% con tu recompensa)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ya transferí' })).not.toBeInTheDocument()
  })

  it('hides the QR of a cancelled pass', () => {
    renderBoard({ pass: makePass({ status: 'cancelled' }), canCancel: false })
    expect(screen.queryByRole('img', { name: 'Código QR del pase' })).not.toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Este pase está cancelado.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/app/day-use/pass-board.test.tsx`
Expected: FAIL (`Failed to resolve import "@/app/(jugador)/day-use/pase/[id]/pass-board"`).

- [ ] **Step 3: Write the component**

`app/(jugador)/day-use/pase/[id]/pass-board.tsx`:
```tsx
'use client'

import { useCallback, useState } from 'react'
import { PaymentBadge } from '@/components/booking/payment-badge'
import { TransferSheet, type ReportTransfer } from '@/components/booking/transfer-sheet'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { PASS_STATUS_LABELS, type DayUsePass } from '@/lib/domain/day-use'
import { formatPrice, timeIn } from '@/lib/domain/format'
import { rewardLabel } from '@/lib/domain/loyalty'
import type { EntryPaymentView } from '@/lib/domain/tournament-payments'

export type PassBoardProps = {
  pass: DayUsePass
  viewerId: string
  qrSvg: string
  whenText: string
  timezone: string
  payment: EntryPaymentView
  paymentNote: string
  transfer: { details: string | null; receiptRequired: boolean }
  canCancel: boolean
  cancelAction: FormAction
  reportAction: ReportTransfer
}

type Sheet = 'cancel' | 'transfer'

// Design: "/day-use/pase/[id]". Reception scans the QR (it opens the pass in the club panel) or
// looks the player up by name.
export function PassBoard(props: PassBoardProps) {
  const { pass, payment } = props
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setSheet(null), [])
  const done = useCallback((message: string) => {
    setSheet(null)
    setNotice(message)
  }, [])
  const free = pass.total === 0
  const price = pass.usedReward
    ? `${formatPrice(pass.total)} (${rewardLabel(pass.discountPercent)} con tu recompensa)`
    : formatPrice(pass.total)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-3xl font-bold uppercase">{pass.productName}</h1>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
          {PASS_STATUS_LABELS[pass.status]}
        </span>
      </div>
      {notice ? (
        <p role="status" className="rounded-xl border border-accent bg-surface p-3">
          {notice}
        </p>
      ) : null}
      {pass.status !== 'cancelled' ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4">
          {/* Our own SVG, drawn on the server by lib/qr/pass-qr.ts from the pass code. */}
          <div
            role="img"
            aria-label="Código QR del pase"
            className="w-full max-w-64 [&>svg]:h-auto [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: props.qrSvg }}
          />
          <p data-testid="pass-code" className="font-display text-3xl font-bold tracking-widest text-black">
            {pass.code}
          </p>
          <p className="text-center text-sm text-black">Mostralo en recepción al llegar: lo escanean o te buscan por nombre.</p>
        </div>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-fg-muted">Cuándo</dt>
        <dd>{props.whenText}</dd>
        <dt className="text-fg-muted">Precio</dt>
        <dd>{price}</dd>
      </dl>
      {pass.status === 'cancelled' ? null : free ? (
        <p className="rounded-xl border border-border p-3">Sin costo: usaste tu recompensa.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
          <span className="font-semibold">Tu pago</span>
          <PaymentBadge state={payment.state} />
          {payment.canReportTransfer ? (
            <Button variant="secondary" onClick={() => setSheet('transfer')}>
              Ya transferí
            </Button>
          ) : null}
          {payment.state === 'pending' ? <p className="w-full text-sm text-fg-muted">{props.paymentNote}</p> : null}
          {payment.rejectionReason ? (
            <p className="w-full text-sm">El club rechazó la transferencia: {payment.rejectionReason}.</p>
          ) : null}
        </div>
      )}
      {pass.status === 'inside' ? (
        <p role="note" className="rounded-xl border border-court-ink p-3">
          Ya registraste el ingreso{pass.checkedInAt ? ` a las ${timeIn(pass.checkedInAt, props.timezone)}` : ''}. ¡Que lo disfrutes!
        </p>
      ) : null}
      {pass.status === 'cancelled' ? (
        <p role="note" className="rounded-xl border border-border p-3">
          Este pase está cancelado.
        </p>
      ) : null}
      {props.canCancel ? (
        <Button variant="ghost" onClick={() => setSheet('cancel')}>
          Cancelar pase
        </Button>
      ) : null}

      <BottomSheet open={sheet === 'cancel'} onClose={close} title="Cancelar pase">
        <p className="mb-4">
          Tu lugar queda libre.
          {pass.usedReward ? ' Recuperás tu recompensa.' : ''}
          {payment.state === 'paid' && !free ? ' Ya pagaste: el club te devuelve la plata.' : ''}
        </p>
        <ActionForm action={props.cancelAction} submitLabel="Sí, cancelar" pendingLabel="Cancelando…" onDone={done}>
          <input type="hidden" name="passId" value={pass.id} />
        </ActionForm>
      </BottomSheet>
      {sheet === 'transfer' ? (
        <TransferSheet
          bookingId={pass.id}
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

`TransferSheet` takes the pass id as `bookingId`: it only uses it to name the receipt file and to call `reportAction`, which here is `reportPassTransfer(passId, path)` (as with tournament entries).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/app/day-use/pass-board.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(jugador)/day-use/pase/[id]/pass-board.tsx" tests/unit/app/day-use/pass-board.test.tsx
git commit -m "feat(day-use): my pass with its QR, payment and cancel"
```

---

### Task 21: Pantalla `/day-use/pase/<id>`

**Files:**
- Create: `app/(jugador)/day-use/pase/[id]/page.tsx`

(no unit test — Server Component que compone piezas probadas; lo recorre el e2e)

- [ ] **Step 1: Read the Next guides**

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` (params as a Promise) and `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md`.

- [ ] **Step 2: Write the page**

`app/(jugador)/day-use/pase/[id]/page.tsx`:
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { getSiteUrl } from '@/lib/auth/redirect'
import { requirePlayer } from '@/lib/auth/viewer'
import { loadPass } from '@/lib/data/day-use'
import { canCancelPass, passCheckInPath } from '@/lib/domain/day-use'
import { dayLongLabel, timeIn } from '@/lib/domain/format'
import { isUuid } from '@/lib/domain/input'
import { paymentMethodsNote } from '@/lib/domain/payments'
import { localDateOf } from '@/lib/domain/time'
import { entryPaymentView } from '@/lib/domain/tournament-payments'
import { passQrSvg } from '@/lib/qr/pass-qr'
import { cancelMyPass, reportPassTransfer } from '../../actions'
import { PassBoard } from './pass-board'

export const metadata: Metadata = { title: 'Mi pase' }

type Params = Promise<{ id: string }>

export default async function MyPassPage({ params }: { params: Params }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const viewer = await requirePlayer(`/day-use/pase/${id}`)
  const { club } = viewer
  const pass = await loadPass(club, id)
  // Staff can read any pass of the club: this screen is only for its owner.
  if (!pass || pass.playerId !== viewer.userId) notFound()

  const today = localDateOf(new Date(), club.timezone)
  const qrSvg = await passQrSvg(`${getSiteUrl()}${passCheckInPath(pass.code)}`)

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <Link href="/day-use" className="text-sm font-semibold text-accent-ink underline">
        Volver a day use
      </Link>
      <PassBoard
        pass={pass}
        viewerId={viewer.userId}
        qrSvg={qrSvg}
        whenText={`${dayLongLabel(pass.date)}, ${timeIn(pass.startsAt, club.timezone)} a ${timeIn(pass.endsAt, club.timezone)}`}
        timezone={club.timezone}
        payment={entryPaymentView(pass.total, pass.payments, club.accepts_transfer)}
        paymentNote={paymentMethodsNote(club)}
        transfer={{ details: club.transfer_details, receiptRequired: club.transfer_receipt_required }}
        canCancel={canCancelPass(pass, today)}
        cancelAction={cancelMyPass}
        reportAction={reportPassTransfer}
      />
    </>
  )
}
```

- [ ] **Step 3: Typecheck and lint**

Run:
```bash
npm run typecheck
npm run lint
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(jugador)/day-use/pase/[id]/page.tsx"
git commit -m "feat(day-use): my pass page with the server-side QR"
```

---

### Task 22: Tarjeta "Day use" en Inicio

**Files:**
- Create: `components/day-use/day-use-home-card.tsx`
- Modify: `app/(jugador)/page.tsx`
- Test: `tests/unit/components/day-use/day-use-home-card.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/day-use/day-use-home-card.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DayUseHomeCard } from '@/components/day-use/day-use-home-card'
import type { DayUseHome } from '@/lib/domain/day-use'

const HOME: DayUseHome = {
  rule: { enabled: true, every: 5, discountPercent: 100, expiryMonths: 6 },
  loyalty: { stamps: 3, earned: 0, used: 0, available: 0, progress: 3 },
  todayPass: { id: 'pass-1', text: 'Day use completo, 08:00 a 12:30' },
  todayText: 'Hoy: 5 en el club, quedan 18 lugares',
}

describe('DayUseHomeCard', () => {
  it('shows the stamps, today\'s pass and how the day is going', () => {
    render(<DayUseHomeCard home={HOME} />)
    expect(screen.getByRole('heading', { name: 'Day use' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Tus sellos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tu pase de hoy: Day use completo, 08:00 a 12:30' })).toHaveAttribute(
      'href',
      '/day-use/pase/pass-1',
    )
    expect(screen.getByText('Hoy: 5 en el club, quedan 18 lugares')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver day use' })).toHaveAttribute('href', '/day-use')
  })

  it('leaves the stamps out when the club has them off, and invites to buy without a pass', () => {
    render(<DayUseHomeCard home={{ ...HOME, rule: { ...HOME.rule, enabled: false }, todayPass: null, todayText: null }} />)
    expect(screen.queryByRole('list', { name: 'Tus sellos' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Comprar un pase' })).toHaveAttribute('href', '/day-use')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/day-use/day-use-home-card.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/day-use/day-use-home-card"`).

- [ ] **Step 3: Write the card**

`components/day-use/day-use-home-card.tsx`:
```tsx
import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { DayUseHome } from '@/lib/domain/day-use'
import { StampRow } from './stamp-row'

// Design: "Inicio", the day use card: stamps, today's pass and "Hoy: N en el club".
export function DayUseHomeCard({ home }: { home: DayUseHome }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold uppercase">Day use</h2>
        <Link href="/day-use" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink underline">
          Ver day use
        </Link>
      </div>
      {home.rule.enabled ? <StampRow loyalty={home.loyalty} rule={home.rule} /> : null}
      {home.todayPass ? (
        <Link href={`/day-use/pase/${home.todayPass.id}`} className={buttonClasses({ fullWidth: true })}>
          Tu pase de hoy: {home.todayPass.text}
        </Link>
      ) : (
        <Link href="/day-use" className={buttonClasses({ variant: 'secondary', fullWidth: true })}>
          Comprar un pase
        </Link>
      )}
      {home.todayText ? <p className="text-sm text-fg-muted">{home.todayText}</p> : null}
    </Card>
  )
}
```

- [ ] **Step 4: Put it in Inicio**

In `app/(jugador)/page.tsx`, add the imports:
```tsx
import { DayUseHomeCard } from '@/components/day-use/day-use-home-card'
import { loadDayUseHome } from '@/lib/data/day-use'
```
replace:
```tsx
  const [grid, bookings, matches, context, tournaments] = await Promise.all([
```
with:
```tsx
  const [grid, bookings, matches, context, tournaments, dayUse] = await Promise.all([
```
add as the last element of that `Promise.all` array (after `loadTournaments(club, { endsAfter: now }),`):
```tsx
    loadDayUseHome(viewer, now),
```
and right after the closing `</Link>` of the `/torneos` link (the one with `openTournamentsText`), add:
```tsx
      {dayUse ? <DayUseHomeCard home={dayUse} /> : null}
```

- [ ] **Step 5: Run the test and check**

Run:
```bash
npx vitest run tests/unit/components/day-use/day-use-home-card.test.tsx
npm run typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/day-use/day-use-home-card.tsx "app/(jugador)/page.tsx" tests/unit/components/day-use/day-use-home-card.test.tsx
git commit -m "feat(inicio): day use card with stamps and today's pass"
```

---

### Task 23: Perfil: "Aparecer en «Ya están en el club»"

**Files:**
- Modify: `app/(jugador)/perfil/page.tsx`

(no unit test nuevo — la acción `setShowInClub` está probada en la Task 16; la página es un Server Component)

- [ ] **Step 1: Add the card**

In `app/(jugador)/perfil/page.tsx`, add the import:
```tsx
import { ActionForm } from '@/components/ui/action-form'
```
replace:
```tsx
import { saveAvailability, savePreferredCourts, saveProfile, signOut } from '@/lib/actions/profile'
```
with:
```tsx
import { saveAvailability, savePreferredCourts, saveProfile, setShowInClub, signOut } from '@/lib/actions/profile'
```
and right before `<form action={signOut}>` add:
```tsx
      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold uppercase">Ya están en el club</h2>
        <ActionForm action={setShowInClub} submitLabel="Guardar" variant="secondary">
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="showInClub" defaultChecked={profile.show_in_club} className="size-5 accent-accent" />
            Aparecer en «Ya están en el club»
          </label>
          <p className="text-sm text-fg-muted">
            Cuando registrás tu ingreso de day use, los otros jugadores ven tu nombre en la lista del día.
          </p>
        </ActionForm>
      </Card>
```

- [ ] **Step 2: Verify**

Run:
```bash
npm run typecheck
npm run lint
npm test
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(jugador)/perfil/page.tsx"
git commit -m "feat(perfil): choose whether to show in who is in the club"
```

---
## Corte 6: Pantallas del club

### Task 24: Pestaña Day use

**Files:**
- Modify: `lib/club/tabs.ts`
- Test: `tests/unit/lib/club/tabs.test.ts`

- [ ] **Step 1: Write the failing test**

Replace the three expectations in `tests/unit/lib/club/tabs.test.ts` with:
```ts
  it('shows the day-to-day screens to reception', () => {
    expect(clubTabs('reception').map((tab) => tab.label)).toEqual([
      'Grilla', 'Calendario', 'Torneos', 'Day use', 'Cobros', 'Jugadores',
    ])
  })

  it('adds the settings to admins', () => {
    expect(clubTabs('admin').map((tab) => tab.href)).toEqual([
      '/club/grilla', '/club/calendario', '/club/torneos', '/club/day-use', '/club/cobros', '/club/jugadores', '/club/ajustes',
    ])
  })

  it('gives every tab an icon', () => {
    expect(clubTabs('admin').map((tab) => tab.icon)).toEqual(['grid', 'calendar', 'trophy', 'ticket', 'cash', 'users', 'sliders'])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/club/tabs.test.ts`
Expected: FAIL (no `Day use`).

- [ ] **Step 3: Add the tab**

In `lib/club/tabs.ts`, add after the Torneos tab:
```ts
    { href: '/club/day-use', label: 'Day use', icon: 'ticket' },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/club/tabs.test.ts tests/unit/components/nav/tab-nav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/club/tabs.ts tests/unit/lib/club/tabs.test.ts
git commit -m "feat(club): day use tab"
```

---

### Task 25: Un pase para recepción (`PassStaffCard`)

**Files:**
- Create: `components/day-use/pass-staff-card.tsx`
- Test: `tests/unit/components/day-use/pass-staff-card.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/day-use/pass-staff-card.test.tsx`:
```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PassStaffCard } from '@/components/day-use/pass-staff-card'
import type { FormAction } from '@/components/ui/action-form'
import type { DayUsePass } from '@/lib/domain/day-use'
import { at, DATE, TIMEZONE } from '../../fixtures/grid'
import { makePass } from '../../fixtures/day-use'

const ACTIONS = { checkIn: vi.fn<FormAction>(), cash: vi.fn<FormAction>(), cancel: vi.fn<FormAction>() }

function renderCard(pass: DayUsePass = makePass(), acceptsCash = true) {
  render(<PassStaffCard pass={pass} today={DATE} timezone={TIMEZONE} acceptsCash={acceptsCash} actions={ACTIONS} />)
}

describe('PassStaffCard', () => {
  it('lets reception check in, charge and cancel today\'s pass', () => {
    renderCard()
    const card = screen.getByRole('article', { name: 'Ana Pérez' })
    expect(card).toHaveTextContent('Day use completo, 08:00 a 12:30')
    expect(card).toHaveTextContent('DU-482193')
    expect(card).toHaveTextContent('Pendiente de pago')
    expect(within(card).getByRole('button', { name: 'Registrar ingreso' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Cobrar $450' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Cancelar pase' })).toBeInTheDocument()
  })

  it('checks in only on the day of the pass', () => {
    renderCard(makePass({ date: '2026-10-02' }))
    expect(screen.getByText('El ingreso se registra el día del pase.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar ingreso' })).not.toBeInTheDocument()
  })

  it('shows since when someone is in, with nothing left to do but charge', () => {
    renderCard(makePass({ status: 'inside', checkedInAt: at('10:12') }))
    expect(screen.getByText('Adentro')).toBeInTheDocument()
    expect(screen.getByText('Adentro desde las 10:12.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar ingreso' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar pase' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cobrar $450' })).toBeInTheDocument()
  })

  it('charges nothing for a full reward, and says so', () => {
    renderCard(makePass({ usedReward: true, discountPercent: 100, total: 0 }))
    expect(screen.getByRole('article', { name: 'Ana Pérez' })).toHaveTextContent('Recompensa -100%')
    expect(screen.queryByRole('button', { name: /Cobrar/ })).not.toBeInTheDocument()
  })

  it('names someone without an account, and offers no cash when the club takes none', () => {
    renderCard(makePass({ holder: 'Pepe', isGuest: true, playerId: null }), false)
    expect(screen.getByRole('article', { name: 'Pepe (sin cuenta)' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cobrar/ })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/day-use/pass-staff-card.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/day-use/pass-staff-card"`).

- [ ] **Step 3: Write the component**

`components/day-use/pass-staff-card.tsx`:
```tsx
import { PaymentBadge } from '@/components/booking/payment-badge'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { PASS_STATUS_LABELS, type DayUsePass } from '@/lib/domain/day-use'
import { formatPrice, timeIn } from '@/lib/domain/format'
import { rewardLabel } from '@/lib/domain/loyalty'
import type { LocalDate } from '@/lib/domain/time'
import { entryPaymentView } from '@/lib/domain/tournament-payments'

export type PassActions = { checkIn: FormAction; cash: FormAction; cancel: FormAction }

// One pass for reception: in "Hoy" and on the page the QR opens. Check-in only on its day
// (check_in_day_use answers not_today); cash for what it owes while no transfer waits for review.
export function PassStaffCard({
  pass,
  today,
  timezone,
  acceptsCash,
  actions,
  onDone,
}: {
  pass: DayUsePass
  today: LocalDate
  timezone: string
  acceptsCash: boolean
  actions: PassActions
  onDone?: (message: string) => void
}) {
  const payment = entryPaymentView(pass.total, pass.payments, false)
  const titleId = `pase-${pass.id}`
  const bought = pass.status === 'bought'

  return (
    <article aria-labelledby={titleId} className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={titleId} className="font-semibold">
            {pass.holder}
            {pass.isGuest ? <span className="font-normal text-fg-muted"> (sin cuenta)</span> : null}
          </h3>
          <p className="text-sm text-fg-muted">
            {pass.productName}, {timeIn(pass.startsAt, timezone)} a {timeIn(pass.endsAt, timezone)}
          </p>
          <p className="text-sm text-fg-muted tabular-nums">
            {pass.code}
            {pass.usedReward ? ` · Recompensa ${rewardLabel(pass.discountPercent)}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold">{PASS_STATUS_LABELS[pass.status]}</span>
          {pass.total > 0 && pass.status !== 'cancelled' ? <PaymentBadge state={payment.state} /> : null}
        </div>
      </div>
      {pass.status === 'inside' && pass.checkedInAt ? (
        <p className="text-sm">Adentro desde las {timeIn(pass.checkedInAt, timezone)}.</p>
      ) : null}
      {bought && pass.date === today ? (
        <ActionForm action={actions.checkIn} submitLabel="Registrar ingreso" pendingLabel="Registrando…" onDone={onDone}>
          <input type="hidden" name="passId" value={pass.id} />
        </ActionForm>
      ) : null}
      {bought && pass.date !== today ? <p className="text-sm text-fg-muted">El ingreso se registra el día del pase.</p> : null}
      {acceptsCash && pass.status !== 'cancelled' && payment.state === 'pending' ? (
        <ActionForm
          action={actions.cash}
          submitLabel={`Cobrar ${formatPrice(payment.due)}`}
          pendingLabel="Registrando…"
          variant="secondary"
          onDone={onDone}
        >
          <input type="hidden" name="passId" value={pass.id} />
          <input type="hidden" name="amount" value={payment.due} />
        </ActionForm>
      ) : null}
      {bought ? (
        <ActionForm action={actions.cancel} submitLabel="Cancelar pase" pendingLabel="Cancelando…" variant="ghost" onDone={onDone}>
          <input type="hidden" name="passId" value={pass.id} />
        </ActionForm>
      ) : null}
    </article>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/day-use/pass-staff-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/day-use/pass-staff-card.tsx tests/unit/components/day-use/pass-staff-card.test.tsx
git commit -m "feat(ui): a day use pass for reception"
```

---

### Task 26: "Hoy" con buscador y "Vender pase" (`PassesToday`, `SellSheet`)

**Files:**
- Create: `components/day-use/sell-sheet.tsx`
- Create: `components/day-use/passes-today.tsx`
- Test: `tests/unit/components/day-use/passes-today.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/day-use/passes-today.test.tsx`:
```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PassesToday } from '@/components/day-use/passes-today'
import { SellSheet, type SellOffer } from '@/components/day-use/sell-sheet'
import type { FormAction } from '@/components/ui/action-form'
import type { DayUsePass } from '@/lib/domain/day-use'
import { DATE, TIMEZONE } from '../../fixtures/grid'
import { makePass } from '../../fixtures/day-use'

const OFFERS: SellOffer[] = [
  { id: 'p1', name: 'Day use completo', price: 450, days: [{ date: '2026-10-01', label: 'Hoy' }, { date: '2026-10-03', label: 'sáb 3' }] },
  { id: 'p2', name: 'Pileta', price: 200, days: [{ date: '2026-10-04', label: 'dom 4' }] },
]
const MEMBERS = [{ userId: 'ana', name: 'Ana Pérez' }]
const ACTIONS = { checkIn: vi.fn<FormAction>(), cash: vi.fn<FormAction>(), cancel: vi.fn<FormAction>() }
const options = (label: string) =>
  within(screen.getByLabelText(label)).getAllByRole('option').map((option) => option.textContent)

function renderSheet(overrides: Partial<Parameters<typeof SellSheet>[0]> = {}) {
  render(
    <SellSheet offers={OFFERS} members={MEMBERS} rewardPercent={100} action={vi.fn<FormAction>()} onClose={vi.fn()} onDone={vi.fn()} {...overrides} />,
  )
}

function renderToday(passes: DayUsePass[]) {
  render(
    <PassesToday
      passes={passes}
      today={DATE}
      timezone={TIMEZONE}
      acceptsCash
      actions={ACTIONS}
      sell={{ offers: OFFERS, members: MEMBERS, rewardPercent: 100, action: vi.fn<FormAction>() }}
    />,
  )
}

describe('SellSheet', () => {
  it('sells a pass of the coming days, to a name by default', () => {
    renderSheet()
    expect(screen.getByRole('dialog', { name: 'Vender pase' })).toBeInTheDocument()
    expect(screen.getByLabelText('Pase')).toHaveValue('p1')
    expect(options('Día')).toEqual(['Hoy', 'sáb 3'])
    expect(screen.getByLabelText('A nombre de')).toBeInTheDocument()
    expect(screen.queryByLabelText('Usar su recompensa (-100%)')).not.toBeInTheDocument()
  })

  it('changes the days with the pass', async () => {
    renderSheet()
    await userEvent.selectOptions(screen.getByLabelText('Pase'), 'p2')
    expect(options('Día')).toEqual(['dom 4'])
  })

  it('offers the member\'s reward when selling to a member', async () => {
    renderSheet()
    await userEvent.click(screen.getByLabelText('Jugador del club'))
    expect(screen.getByLabelText('Jugador')).toHaveValue('ana')
    expect(screen.getByLabelText('Usar su recompensa (-100%)')).not.toBeChecked()
  })

  it('has no reward while the club has stamps off', async () => {
    renderSheet({ rewardPercent: null })
    await userEvent.click(screen.getByLabelText('Jugador del club'))
    expect(screen.queryByLabelText(/Usar su recompensa/)).not.toBeInTheDocument()
  })

  it('says when there is nothing to sell', () => {
    renderSheet({ offers: [] })
    expect(screen.getByText('No hay pases a la venta en los próximos días.')).toBeInTheDocument()
  })
})

describe('PassesToday', () => {
  const PASSES = [makePass(), makePass({ id: 'pass-2', code: 'DU-100200', holder: 'Bruno Díaz', playerId: 'bruno' })]

  it('lists today\'s passes and finds them by name or code', async () => {
    renderToday(PASSES)
    expect(screen.getByRole('heading', { name: 'Pases de hoy (2)' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Buscar por nombre o código'), 'bru')
    expect(screen.getByRole('article', { name: 'Bruno Díaz' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Ana Pérez' })).not.toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Buscar por nombre o código'))
    await userEvent.type(screen.getByLabelText('Buscar por nombre o código'), 'DU-4821')
    expect(screen.getByRole('article', { name: 'Ana Pérez' })).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Buscar por nombre o código'))
    await userEvent.type(screen.getByLabelText('Buscar por nombre o código'), 'zzz')
    expect(screen.getByText('Nadie coincide con esa búsqueda.')).toBeInTheDocument()
  })

  it('opens the sale sheet', async () => {
    renderToday(PASSES)
    await userEvent.click(screen.getByRole('button', { name: 'Vender pase' }))
    expect(screen.getByRole('dialog', { name: 'Vender pase' })).toBeInTheDocument()
  })

  it('says when there are no passes yet', () => {
    renderToday([])
    expect(screen.getByText('Todavía no hay pases para hoy.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/day-use/passes-today.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/day-use/passes-today"`).

- [ ] **Step 3: Write the sale sheet**

`components/day-use/sell-sheet.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { HolderFields } from '@/components/club/load-sheet'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'
import { formatPrice } from '@/lib/domain/format'
import { rewardLabel } from '@/lib/domain/loyalty'
import type { MemberOption } from '@/lib/domain/members'
import type { LocalDate } from '@/lib/domain/time'

// A pass on sale and the coming days it runs.
export type SellOffer = { id: string; name: string; price: number; days: { date: LocalDate; label: string }[] }

// Design: "Venta en recepción": to a member (who may use her reward) or to someone without an account.
export function SellSheet({
  offers,
  members,
  rewardPercent,
  action,
  onClose,
  onDone,
}: {
  offers: SellOffer[]
  members: MemberOption[]
  // The club's reward while stamps are on; null hides the option.
  rewardPercent: number | null
  action: FormAction
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [productId, setProductId] = useState(offers[0]?.id ?? '')
  const [holder, setHolder] = useState<'guest' | 'player'>('guest')
  const offer = offers.find((item) => item.id === productId) ?? offers[0]

  return (
    <BottomSheet open onClose={onClose} title="Vender pase">
      {offer ? (
        <ActionForm action={action} submitLabel="Vender pase" pendingLabel="Vendiendo…" onDone={onDone}>
          <Field label="Pase" htmlFor="sell-product">
            <select
              id="sell-product"
              name="productId"
              value={offer.id}
              onChange={(event) => setProductId(event.target.value)}
              className={inputClasses}
            >
              {offers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}, {formatPrice(item.price)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Día" htmlFor="sell-date">
            {/* A new pass starts again from its first day. */}
            <select key={offer.id} id="sell-date" name="date" className={inputClasses}>
              {offer.days.map((day) => (
                <option key={day.date} value={day.date}>
                  {day.label}
                </option>
              ))}
            </select>
          </Field>
          <HolderFields holder={holder} onHolderChange={setHolder} members={members} />
          {holder === 'player' && rewardPercent !== null ? (
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" name="useReward" className="size-5 accent-accent" />
              Usar su recompensa ({rewardLabel(rewardPercent)})
            </label>
          ) : null}
        </ActionForm>
      ) : (
        <p className="text-fg-muted">No hay pases a la venta en los próximos días.</p>
      )}
    </BottomSheet>
  )
}
```

- [ ] **Step 4: Write the list**

`components/day-use/passes-today.tsx`:
```tsx
'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, inputClasses } from '@/components/ui/field'
import type { FormAction } from '@/components/ui/action-form'
import { searchPasses, type DayUsePass } from '@/lib/domain/day-use'
import type { MemberOption } from '@/lib/domain/members'
import type { LocalDate } from '@/lib/domain/time'
import { PassStaffCard, type PassActions } from './pass-staff-card'
import { SellSheet, type SellOffer } from './sell-sheet'

// Design: "Hoy". Today's passes with a search by name or code, and the sale at the desk.
export function PassesToday({
  passes,
  today,
  timezone,
  acceptsCash,
  actions,
  sell,
}: {
  passes: DayUsePass[]
  today: LocalDate
  timezone: string
  acceptsCash: boolean
  actions: PassActions
  sell: { offers: SellOffer[]; members: MemberOption[]; rewardPercent: number | null; action: FormAction }
}) {
  const [query, setQuery] = useState('')
  const [selling, setSelling] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const done = useCallback((message: string) => {
    setSelling(false)
    setNotice(message)
  }, [])
  const shown = searchPasses(passes, query)

  return (
    <section aria-labelledby="pases-hoy" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="pases-hoy" className="font-display text-2xl font-bold uppercase">
          Pases de hoy ({passes.length})
        </h2>
        <Button onClick={() => setSelling(true)}>Vender pase</Button>
      </div>
      {notice ? (
        <p role="status" className="rounded-xl border border-accent bg-surface p-3">
          {notice}
        </p>
      ) : null}
      <Field label="Buscar por nombre o código" htmlFor="pass-search">
        <input
          id="pass-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ej: Rodríguez o DU-482193"
          className={inputClasses}
        />
      </Field>
      {shown.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((pass) => (
            <li key={pass.id}>
              <PassStaffCard pass={pass} today={today} timezone={timezone} acceptsCash={acceptsCash} actions={actions} onDone={done} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-4 text-fg-muted">
          {passes.length > 0 ? 'Nadie coincide con esa búsqueda.' : 'Todavía no hay pases para hoy.'}
        </p>
      )}
      {selling ? (
        <SellSheet
          offers={sell.offers}
          members={sell.members}
          rewardPercent={sell.rewardPercent}
          action={sell.action}
          onClose={() => setSelling(false)}
          onDone={done}
        />
      ) : null}
    </section>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/day-use/passes-today.test.tsx tests/unit/components/club/load-sheet.test.tsx`
Expected: PASS (`HolderFields` se reutiliza sin cambios).

- [ ] **Step 6: Commit**

```bash
git add components/day-use/sell-sheet.tsx components/day-use/passes-today.tsx tests/unit/components/day-use/passes-today.test.tsx
git commit -m "feat(ui): today's day use passes with search and the sale at the desk"
```

---

### Task 27: Pantalla "Hoy" del club (`/club/day-use`)

**Files:**
- Create: `app/(club)/club/day-use/page.tsx`

(no unit test — Server Component que compone piezas probadas; lo recorre el e2e)

- [ ] **Step 1: Write the page**

`app/(club)/club/day-use/page.tsx`:
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { PassesToday } from '@/components/day-use/passes-today'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { requireStaff } from '@/lib/auth/viewer'
import { loadOverrides, loadPassesOn, loadProducts, loadRewardsUsed } from '@/lib/data/day-use'
import { loadMemberOptions } from '@/lib/data/members'
import { dayUseDays, isOpenOn, WEEK_DAYS } from '@/lib/domain/day-use'
import { collectedToday } from '@/lib/domain/day-use-payments'
import { dayLongLabel, formatPrice } from '@/lib/domain/format'
import { loyaltyRuleOf } from '@/lib/domain/loyalty'
import { addDays, localDateOf } from '@/lib/domain/time'
import { cancelPass, checkInPass, recordPassCash, sellDayUse } from './actions'

export const metadata: Metadata = { title: 'Day use' }

export default async function ClubDayUsePage() {
  const viewer = await requireStaff('/club/day-use')
  const { club, membership } = viewer
  const today = localDateOf(new Date(), club.timezone)
  const [passes, products, overrides, members, rewardsUsed] = await Promise.all([
    loadPassesOn(club, today),
    loadProducts(club),
    loadOverrides(club, today, addDays(today, WEEK_DAYS - 1)),
    loadMemberOptions(club.id),
    loadRewardsUsed(club, addDays(today, -30)),
  ])
  const days = dayUseDays(today, products, overrides)
  const offers = products
    .map((product) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      days: days.filter((day) => isOpenOn(product, day.date, overrides)).map(({ date, label }) => ({ date, label })),
    }))
    .filter((offer) => offer.days.length > 0)
  const rule = loyaltyRuleOf(club)
  const tiles = [
    { label: 'Ingresos de hoy', value: formatPrice(collectedToday(passes)) },
    { label: 'Adentro', value: String(passes.filter((pass) => pass.status === 'inside').length) },
    { label: 'Recompensas usadas (30 días)', value: String(rewardsUsed) },
  ]

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold uppercase">Day use</h2>
          <p className="text-fg-muted">{dayLongLabel(today)}</p>
        </div>
        {membership.role === 'admin' ? (
          <Link href="/club/day-use/configuracion" className={buttonClasses({ variant: 'secondary' })}>
            Configurar pases
          </Link>
        ) : null}
      </div>
      <dl aria-label="Resumen del día" className="grid grid-cols-3 gap-2 sm:gap-3">
        {tiles.map((tile) => (
          <Card key={tile.label} className="flex flex-col gap-1 p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{tile.label}</dt>
            <dd className="font-display text-2xl font-bold tabular-nums">{tile.value}</dd>
          </Card>
        ))}
      </dl>
      <PassesToday
        passes={passes}
        today={today}
        timezone={club.timezone}
        acceptsCash={club.accepts_cash}
        actions={{ checkIn: checkInPass, cash: recordPassCash, cancel: cancelPass }}
        sell={{ offers, members, rewardPercent: rule.enabled ? rule.discountPercent : null, action: sellDayUse }}
      />
    </>
  )
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add "app/(club)/club/day-use/page.tsx"
git commit -m "feat(club): today's day use at reception"
```

---

### Task 28: Lo que abre el QR (`/club/day-use/pase/<código>`)

**Files:**
- Create: `app/(club)/club/day-use/pase/[codigo]/page.tsx`

(no unit test — Server Component con piezas probadas; lo recorre el e2e)

- [ ] **Step 1: Write the page**

`app/(club)/club/day-use/pase/[codigo]/page.tsx`:
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PassStaffCard } from '@/components/day-use/pass-staff-card'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { requireStaff } from '@/lib/auth/viewer'
import { loadPassByCode } from '@/lib/data/day-use'
import { isPassCode } from '@/lib/domain/day-use'
import { dayLongLabel } from '@/lib/domain/format'
import { localDateOf } from '@/lib/domain/time'
import { cancelPass, checkInPass, recordPassCash } from '../../actions'

export const metadata: Metadata = { title: 'Pase de day use' }

type Params = Promise<{ codigo: string }>

// What the pass QR opens. A player who opens it lands in Inicio (requireStaff sends non-staff home).
export default async function PassByCodePage({ params }: { params: Params }) {
  const { codigo } = await params
  const code = decodeURIComponent(codigo).toUpperCase()
  const viewer = await requireStaff(`/club/day-use/pase/${encodeURIComponent(code)}`)
  if (!isPassCode(code)) notFound()
  const { club } = viewer
  const pass = await loadPassByCode(club, code)
  if (!pass) notFound()
  const today = localDateOf(new Date(), club.timezone)

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <Link href="/club/day-use" className="text-sm font-semibold text-accent-ink underline">
        Volver a day use
      </Link>
      <div>
        <h2 className="font-display text-2xl font-bold uppercase">Pase {pass.code}</h2>
        <p className="text-fg-muted">
          {dayLongLabel(pass.date)}
          {pass.date === today ? ' (hoy)' : ''}
        </p>
      </div>
      <PassStaffCard
        pass={pass}
        today={today}
        timezone={club.timezone}
        acceptsCash={club.accepts_cash}
        actions={{ checkIn: checkInPass, cash: recordPassCash, cancel: cancelPass }}
      />
    </>
  )
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add "app/(club)/club/day-use/pase/[codigo]/page.tsx"
git commit -m "feat(club): the page a day use QR opens"
```

---

### Task 29: Formulario de un pase y calendario de excepciones

**Files:**
- Create: `components/day-use/product-form.tsx`
- Create: `components/day-use/override-calendar.tsx`
- Test: `tests/unit/components/day-use/product-config.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/day-use/product-config.test.tsx`:
```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OverrideCalendar } from '@/components/day-use/override-calendar'
import { ProductForm } from '@/components/day-use/product-form'
import type { FormAction } from '@/components/ui/action-form'
import { makeProduct } from '../../fixtures/day-use'

const COURTS = [
  { id: 'c1', name: 'Cancha 1' },
  { id: 'c2', name: 'Cancha 2' },
]
const DAYS = [
  { date: '2026-10-01', label: 'Hoy' },
  { date: '2026-10-03', label: 'sáb 3' },
]

describe('ProductForm', () => {
  it('proposes the example pass when creating one', () => {
    render(<ProductForm product={null} courts={COURTS} action={vi.fn<FormAction>()} idPrefix="nuevo" />)
    expect(screen.getByLabelText('Nombre')).toHaveValue('Day use completo')
    expect(screen.getByLabelText('Precio')).toHaveValue(450)
    expect(screen.getByLabelText('Cupo por día')).toHaveValue(30)
    expect(screen.getByLabelText('Qué incluye (separado por comas)')).toHaveValue('Vestuarios, Pileta, Cancha libre')
    expect(screen.getByLabelText('sáb')).toBeChecked()
    expect(screen.getByLabelText('dom')).toBeChecked()
    expect(screen.getByLabelText('lun')).not.toBeChecked()
    expect(screen.getByLabelText('Desde')).toHaveValue('08:00')
    expect(screen.getByLabelText('Hasta')).toHaveValue('12:30')
    expect(screen.getByLabelText('Cancha 1')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Crear pase' })).toBeInTheDocument()
    expect(document.querySelector('input[name="productId"]')).toBeNull()
  })

  it('fills in the pass being edited', () => {
    render(
      <ProductForm
        product={makeProduct({ name: 'Pileta', weekdays: [1], courtIds: ['c2'] })}
        courts={COURTS}
        action={vi.fn<FormAction>()}
        idPrefix="p1"
      />,
    )
    expect(screen.getByLabelText('Nombre')).toHaveValue('Pileta')
    expect(screen.getByLabelText('lun')).toBeChecked()
    expect(screen.getByLabelText('sáb')).not.toBeChecked()
    expect(screen.getByLabelText('Cancha 2')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Guardar pase' })).toBeInTheDocument()
    expect(document.querySelector<HTMLInputElement>('input[name="productId"]')?.value).toBe('p1')
  })
})

describe('OverrideCalendar', () => {
  const cellsOf = (name: RegExp) => within(screen.getByRole('row', { name })).getAllByRole('cell')

  it('shows each pass on each day, open or closed, and marks the exceptions', () => {
    render(
      <OverrideCalendar
        products={[makeProduct({ weekdays: [6, 0] })]}
        days={DAYS}
        overrides={[{ productId: 'p1', date: '2026-10-01', enabled: true }]}
        action={vi.fn<FormAction>()}
      />,
    )
    const cells = cellsOf(/Day use completo/)
    expect(cells[0]).toHaveTextContent('Abierto')
    expect(cells[0]).toHaveTextContent('Excepción')
    expect(cells[1]).toHaveTextContent('Abierto')
    expect(cells[1]).not.toHaveTextContent('Excepción')
  })

  it('toggles a single date', () => {
    render(<OverrideCalendar products={[makeProduct({ weekdays: [6, 0] })]} days={DAYS} overrides={[]} action={vi.fn<FormAction>()} />)
    const cells = cellsOf(/Day use completo/)
    expect(within(cells[0]).getByRole('button', { name: 'Cerrado' })).toBeInTheDocument()
    expect(cells[0].querySelector('input[name="enabled"]')).toHaveValue('true')
    expect(cells[1].querySelector('input[name="enabled"]')).toHaveValue('false')
    expect(cells[1].querySelector('input[name="date"]')).toHaveValue('2026-10-03')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/day-use/product-config.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/day-use/override-calendar"`).

- [ ] **Step 3: Write the form**

`components/day-use/product-form.tsx`:
```tsx
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import { DAY_USE_DEFAULTS, type DayUseProduct } from '@/lib/domain/day-use'
import { WEEKDAYS_SHORT } from '@/lib/domain/format'
import { TIME_OPTIONS } from '@/lib/domain/settings'

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0]

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

// Design: "Configuración", create or edit a pass. With no weekday it only runs on the dates the
// calendar opens; with no court it blocks none.
export function ProductForm({
  product,
  courts,
  action,
  idPrefix,
}: {
  product: DayUseProduct | null
  courts: { id: string; name: string }[]
  action: FormAction
  idPrefix: string
}) {
  const includes: readonly string[] = product?.includes ?? DAY_USE_DEFAULTS.includes
  const weekdays: readonly number[] = product?.weekdays ?? DAY_USE_DEFAULTS.weekdays
  const courtIds: readonly string[] = product?.courtIds ?? []
  const id = (name: string) => `${idPrefix}-${name}`

  return (
    <ActionForm action={action} submitLabel={product ? 'Guardar pase' : 'Crear pase'} variant={product ? 'secondary' : 'primary'}>
      {product ? <input type="hidden" name="productId" value={product.id} /> : null}
      <input type="hidden" name="sortOrder" value={product?.sortOrder ?? 0} />
      <Field label="Nombre" htmlFor={id('name')}>
        <input id={id('name')} name="name" required maxLength={60} defaultValue={product?.name ?? DAY_USE_DEFAULTS.name} className={inputClasses} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Precio" htmlFor={id('price')}>
          <input id={id('price')} name="price" type="number" inputMode="numeric" min={0} required
            defaultValue={product?.price ?? DAY_USE_DEFAULTS.price} className={inputClasses} />
        </Field>
        <Field label="Cupo por día" htmlFor={id('capacity')}>
          <input id={id('capacity')} name="capacity" type="number" inputMode="numeric" min={1} max={500} required
            defaultValue={product?.capacity ?? DAY_USE_DEFAULTS.capacity} className={inputClasses} />
        </Field>
      </div>
      <Field label="Qué incluye (separado por comas)" htmlFor={id('includes')}>
        <input id={id('includes')} name="includes" maxLength={400} defaultValue={includes.join(', ')}
          placeholder="Vestuarios, pileta, cancha libre" className={inputClasses} />
      </Field>
      <fieldset className="flex flex-wrap gap-3">
        <legend className="mb-1 text-sm font-semibold">Días</legend>
        {MONDAY_FIRST.map((day) => (
          <label key={day} className="flex min-h-11 items-center gap-2">
            <input type="checkbox" name="weekdays" value={day} defaultChecked={weekdays.includes(day)} className="size-5 accent-accent" />
            {WEEKDAYS_SHORT[day]}
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde" htmlFor={id('from')}>
          <TimeSelect id={id('from')} name="fromTime" value={product?.fromTime ?? DAY_USE_DEFAULTS.fromTime} />
        </Field>
        <Field label="Hasta" htmlFor={id('to')}>
          <TimeSelect id={id('to')} name="toTime" value={product?.toTime ?? DAY_USE_DEFAULTS.toTime} />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-semibold">Canchas que bloquea</legend>
        {courts.map((court) => (
          <label key={court.id} className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="courtIds" value={court.id} defaultChecked={courtIds.includes(court.id)} className="size-5 accent-accent" />
            {court.name}
          </label>
        ))}
        <p className="text-sm text-fg-muted">
          Sin canchas marcadas no se bloquea ninguna. Si una ya está ocupada ese día, se saltea y aparece en los avisos.
        </p>
      </fieldset>
    </ActionForm>
  )
}
```

- [ ] **Step 4: Write the calendar**

`components/day-use/override-calendar.tsx`:
```tsx
'use client'

import { useCallback, useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { isOpenOn, type DayUseOverride, type DayUseProduct } from '@/lib/domain/day-use'
import type { LocalDate } from '@/lib/domain/time'

export type CalendarDay = { date: LocalDate; label: string }

// Design: "Configuración", the calendar of the coming days. Each cell opens or closes that date
// only (set_day_use_override); the weekly rule stays as it is.
export function OverrideCalendar({
  products,
  days,
  overrides,
  action,
}: {
  products: DayUseProduct[]
  days: CalendarDay[]
  overrides: DayUseOverride[]
  action: FormAction
}) {
  const [notice, setNotice] = useState<string | null>(null)
  const done = useCallback((message: string) => setNotice(message), [])

  return (
    <div className="flex flex-col gap-3">
      {notice ? (
        <p role="status" className="rounded-xl border border-accent bg-surface p-3 text-sm">
          {notice}
        </p>
      ) : null}
      <div className="-mx-4 overflow-x-auto px-4">
        <table aria-label="Calendario de day use" className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr>
              <th scope="col" className="py-2 pr-3 text-left">
                Pase
              </th>
              {days.map((day) => (
                <th key={day.date} scope="col" className="px-1 py-2 text-center font-semibold">
                  {day.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-t border-border">
                <th scope="row" className="py-2 pr-3 text-left font-semibold">
                  {product.name}
                </th>
                {days.map((day) => {
                  const open = isOpenOn(product, day.date, overrides)
                  const exception = overrides.some((item) => item.productId === product.id && item.date === day.date)
                  return (
                    <td key={day.date} className="px-1 py-2 align-top">
                      <ActionForm
                        action={action}
                        submitLabel={open ? 'Abierto' : 'Cerrado'}
                        pendingLabel="…"
                        variant={open ? 'primary' : 'secondary'}
                        onDone={done}
                      >
                        <input type="hidden" name="productId" value={product.id} />
                        <input type="hidden" name="date" value={day.date} />
                        <input type="hidden" name="enabled" value={open ? 'false' : 'true'} />
                      </ActionForm>
                      {exception ? <span className="mt-1 block text-center text-xs text-accent-ink">Excepción</span> : null}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-fg-muted">Tocá un día para abrirlo o cerrarlo solo esa fecha. Los pases ya vendidos siguen valiendo.</p>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/day-use/product-config.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/day-use/product-form.tsx components/day-use/override-calendar.tsx tests/unit/components/day-use/product-config.test.tsx
git commit -m "feat(ui): day use pass form and exceptions calendar"
```

---

### Task 30: Configuración (`/club/day-use/configuracion`)

**Files:**
- Create: `app/(club)/club/day-use/configuracion/page.tsx`

(no unit test — Server Component con piezas probadas; los avisos salen de `unblockedCourts`, probado en la Task 10; lo recorre el e2e)

- [ ] **Step 1: Write the page**

`app/(club)/club/day-use/configuracion/page.tsx`:
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { OverrideCalendar } from '@/components/day-use/override-calendar'
import { ProductForm } from '@/components/day-use/product-form'
import { ActionForm } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import { requireAdmin } from '@/lib/auth/viewer'
import { loadDayUseOccupancies, loadOverrides, loadProducts } from '@/lib/data/day-use'
import { loadActiveCourts } from '@/lib/data/tournaments'
import { scheduleText, unblockedCourts } from '@/lib/domain/day-use'
import { dayLabel } from '@/lib/domain/format'
import { addDays, localDateOf, zonedTime } from '@/lib/domain/time'
import { saveDayUseProduct, setDayUseOverride, setProductActive } from '../actions'

export const metadata: Metadata = { title: 'Configurar day use' }

const CALENDAR_DAYS = 14

export default async function DayUseSettingsPage() {
  const viewer = await requireAdmin('/club/day-use/configuracion')
  const { club } = viewer
  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const horizon = addDays(today, club.booking_window_days)
  const dates = Array.from({ length: club.booking_window_days + 1 }, (_, index) => addDays(today, index))
  const [products, overrides, courts, occupancies] = await Promise.all([
    loadProducts(club, { includeInactive: true }),
    loadOverrides(club, today, horizon),
    loadActiveCourts(club),
    loadDayUseOccupancies(club, now, zonedTime(addDays(horizon, 1), 0, club.timezone)),
  ])
  const active = products.filter((product) => product.isActive)
  const courtName = new Map(courts.map((court) => [court.id, court.name]))
  const productName = new Map(products.map((product) => [product.id, product.name]))
  const warnings = active.flatMap((product) => unblockedCourts(product, dates, overrides, occupancies, now, club.timezone))
  const calendarDays = dates.slice(0, CALENDAR_DAYS).map((date) => ({ date, label: dayLabel(date, today) }))

  return (
    <>
      <Link href="/club/day-use" className="text-sm font-semibold text-accent-ink underline">
        Volver a day use
      </Link>
      <h2 className="font-display text-2xl font-bold uppercase">Configurar day use</h2>

      {warnings.length > 0 ? (
        <section aria-labelledby="sin-bloquear" className="flex flex-col gap-2 rounded-2xl border border-danger p-4">
          <h3 id="sin-bloquear" className="font-display text-xl font-bold uppercase text-danger">
            Canchas sin bloquear
          </h3>
          <p className="text-sm">
            Ya estaban ocupadas cuando se guardó el pase. Liberalas en la grilla y volvé a guardar el pase para bloquearlas.
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {warnings.map((warning) => (
              <li key={`${warning.productId}-${warning.date}-${warning.courtId}`}>
                {productName.get(warning.productId)}: {courtName.get(warning.courtId) ?? 'una cancha inactiva'}, {dayLabel(warning.date, today)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {active.length > 0 ? (
        <section aria-labelledby="calendario" className="flex flex-col gap-3">
          <h3 id="calendario" className="font-display text-xl font-bold uppercase">
            Calendario
          </h3>
          <OverrideCalendar products={active} days={calendarDays} overrides={overrides} action={setDayUseOverride} />
        </section>
      ) : null}

      {products.length > 0 ? (
        <section aria-labelledby="pases" className="flex flex-col gap-3">
          <h3 id="pases" className="font-display text-xl font-bold uppercase">
            Pases
          </h3>
          <ul className="grid gap-3 md:grid-cols-2">
            {products.map((product) => (
              <li key={product.id}>
                <Card className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold">{product.name}</p>
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
                      {product.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <p className="text-sm text-fg-muted">{scheduleText(product)}</p>
                  <ProductForm product={product} courts={courts} action={saveDayUseProduct} idPrefix={`pase-${product.id}`} />
                  <ActionForm
                    action={setProductActive}
                    submitLabel={product.isActive ? 'Desactivar' : 'Activar'}
                    pendingLabel="Guardando…"
                    variant="ghost"
                  >
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="active" value={String(!product.isActive)} />
                  </ActionForm>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="nuevo-pase" className="flex flex-col gap-3">
        <h3 id="nuevo-pase" className="font-display text-xl font-bold uppercase">
          Nuevo pase
        </h3>
        <Card>
          <ProductForm product={null} courts={courts} action={saveDayUseProduct} idPrefix="nuevo" />
        </Card>
      </section>
    </>
  )
}
```

- [ ] **Step 2: Typecheck and commit**

Run:
```bash
npm run typecheck
npm run lint
```
Expected: PASS.

```bash
git add "app/(club)/club/day-use/configuracion/page.tsx"
git commit -m "feat(club): configure day use passes, exceptions and warnings"
```

---

### Task 31: Ajustes → Sellos

**Files:**
- Modify: `app/(club)/club/ajustes/page.tsx`

(no unit test nuevo — `parseLoyaltyForm` y `updateLoyalty` están probados en las Tasks 11 y 16; lo recorre el e2e)

- [ ] **Step 1: Add the section**

In `app/(club)/club/ajustes/page.tsx`, add the import:
```tsx
import { LOYALTY_EXPIRY_OPTIONS, loyaltyRuleOf, loyaltyRuleText } from '@/lib/domain/loyalty'
```
replace:
```tsx
import { addCourt, addPricingRule, deleteCourt, deletePricingRule, updateClubSettings, updateCourt } from './actions'
```
with:
```tsx
import { addCourt, addPricingRule, deleteCourt, deletePricingRule, updateClubSettings, updateCourt, updateLoyalty } from './actions'
```
and right before `<section aria-labelledby="canchas" …>` add:
```tsx
      <section aria-labelledby="sellos" className="flex flex-col gap-3">
        <h2 id="sellos" className="font-display text-2xl font-bold uppercase">
          Sellos
        </h2>
        <p className="text-sm text-fg-muted">
          Cada ingreso de day use suma un sello. Con los sellos completos, el jugador tiene un descuento en su próximo day use.
        </p>
        <Card>
          <ActionForm action={updateLoyalty} submitLabel="Guardar sellos">
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" name="loyalty_enabled" defaultChecked={club.loyalty_enabled} className="size-5 accent-accent" />
              Dar sellos por cada day use
            </label>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Day use para la recompensa" htmlFor="loyalty_every">
                <input id="loyalty_every" name="loyalty_every" type="number" min={1} max={50}
                  defaultValue={club.loyalty_every} className={inputClasses} />
              </Field>
              <Field label="Descuento de la recompensa (%)" htmlFor="loyalty_discount_percent">
                <input id="loyalty_discount_percent" name="loyalty_discount_percent" type="number" min={1} max={100}
                  defaultValue={club.loyalty_discount_percent} className={inputClasses} />
              </Field>
              <Field label="Los sellos vencen" htmlFor="loyalty_expiry_months">
                <select id="loyalty_expiry_months" name="loyalty_expiry_months"
                  defaultValue={club.loyalty_expiry_months ?? 'never'} className={inputClasses}>
                  <option value="never">No vencen</option>
                  {LOYALTY_EXPIRY_OPTIONS.map((months) => (
                    <option key={months} value={months}>
                      A los {months} meses
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {club.loyalty_enabled ? <p className="text-sm text-fg-muted">{loyaltyRuleText(loyaltyRuleOf(club))}</p> : null}
          </ActionForm>
        </Card>
      </section>
```

- [ ] **Step 2: Verify and commit**

Run:
```bash
npm run typecheck
npm run lint
```
Expected: PASS.

```bash
git add "app/(club)/club/ajustes/page.tsx"
git commit -m "feat(ajustes): stamps rule for day use"
```

---

### Task 32: El day use en la grilla

**Files:**
- Modify: `components/booking/cell-styles.ts`, `components/booking/slot-grid.tsx`, `components/booking/legend.tsx`
- Test: `tests/unit/components/booking/legend.test.tsx`

- [ ] **Step 1: Write the failing test**

In `tests/unit/components/booking/legend.test.tsx`, replace `'ReservaTurno fijoBloqueoTorneo'` with `'ReservaTurno fijoBloqueoTorneoDay use'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/booking/legend.test.tsx`
Expected: FAIL (no `Day use` in the legend).

- [ ] **Step 3: A look for day use in the grid and the legend**

In `components/booking/cell-styles.ts`, add to `CELL_STYLES` after `tournament`:
```ts
  day_use: 'border-2 border-dotted border-court-ink bg-surface text-fg',
```

In `components/booking/slot-grid.tsx` (`ClubCell`), replace the whole `const style = …` expression with:
```tsx
    const style =
      occupancy.kind === 'block'
        ? CELL_STYLES.block
        : occupancy.kind === 'tournament'
          ? CELL_STYLES.tournament
          : occupancy.kind === 'day_use'
            ? CELL_STYLES.day_use
            : occupancy.kind === 'recurring'
              ? CELL_STYLES.recurring
              : occupancy.kind === 'booking' || occupancy.kind === 'match'
                ? CELL_STYLES.booking
                : CELL_STYLES.other
```
The cell title already reads `occupancy.note`, which `generate_day_use` fills with the pass name, and `KIND_LABELS.day_use` is `'Day use'`.

In `components/booking/legend.tsx`, add `['day_use', 'Day use'],` as the last item of `club`.

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/components/booking tests/unit/components/club tests/unit/app/design-tokens.test.ts
npm run typecheck
```
Expected: PASS (`fg` on `surface` ya está en los pares que prueba el test de tokens).

- [ ] **Step 5: Commit**

```bash
git add components/booking/cell-styles.ts components/booking/slot-grid.tsx components/booking/legend.tsx tests/unit/components/booking/legend.test.tsx
git commit -m "feat(grilla): day use blocks with their own look"
```

---

### Task 33: Cobros con pases

**Files:**
- Modify: `lib/data/payments.ts`
- Modify: `app/(club)/club/cobros/page.tsx`

(no unit test nuevo — las listas salen de `unpaidPasses` y `passRefunds`, probadas en la Task 13; la carga y la página las cubren typecheck y el e2e de Cobros existente)

- [ ] **Step 1: Load passes with the overview**

Replace the whole of `lib/data/payments.ts` with:
```ts
import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import { passRefunds, passStartsAt, unpaidPasses, type UnpaidPassItem } from '@/lib/domain/day-use-payments'
import {
  holderLabel,
  leftPlayerRefunds,
  refundsDue,
  unpaidBookings,
  type RefundItem,
  type UnpaidItem,
} from '@/lib/domain/payments-overview'
import { localDateOf, toDate } from '@/lib/domain/time'
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
  unpaidPasses: UnpaidPassItem[]
  refunds: RefundItem[]
}

const RECEIPT_URL_SECONDS = 300

const BOOKING_SELECT =
  'id, starts_at, price, status, guest_name, match_id, court:courts(name), player:profiles!bookings_player_id_fkey(display_name), match:open_matches!bookings_match_id_fkey(slots:match_slots(position, player_id, player:profiles(display_name))), payments(id, status, amount, payer_id, payer:profiles!payments_payer_id_fkey(display_name))'

const PASS_SELECT =
  'id, on_date, price, discount_percent, total, status, guest_name, player:profiles!day_use_passes_player_id_fkey(display_name), product:day_use_products!day_use_passes_product_in_club(name, from_time), payments!payments_pass_in_club(id, status, amount)'

// Everything the Cobros screen needs, read with the staff session.
export async function loadPaymentsOverview(club: Club, now = new Date()): Promise<PaymentsOverview> {
  const supabase = await createClient()
  const since = new Date(now.getTime() - 30 * 86_400_000)
  const today = localDateOf(now, club.timezone)

  const [reported, played, cancelled, matchBookings, tournaments, passes] = await Promise.all([
    supabase
      .from('payments')
      .select(
        'id, amount, receipt_path, payer:profiles!payments_payer_id_fkey(display_name), booking:bookings(starts_at, guest_name, court:courts(name), player:profiles!bookings_player_id_fkey(display_name)), entry:tournament_entries!payments_entry_in_club(tournament:tournaments!tournament_entries_tournament_in_club(name, starts_at)), pass:day_use_passes!payments_pass_in_club(on_date, product:day_use_products!day_use_passes_product_in_club(name, from_time))',
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
      .gt('ends_at', since.toISOString())
      .order('starts_at', { ascending: false }),
    supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('club_id', club.id)
      .eq('status', 'cancelled')
      .gt('starts_at', since.toISOString())
      .order('starts_at', { ascending: false }),
    supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('club_id', club.id)
      .eq('status', 'confirmed')
      .not('match_id', 'is', null)
      .gt('starts_at', since.toISOString()),
    supabase.from('tournaments').select('id, name, starts_at, price, status').eq('club_id', club.id).gt('starts_at', since.toISOString()),
    supabase
      .from('day_use_passes')
      .select(PASS_SELECT)
      .eq('club_id', club.id)
      .gte('on_date', localDateOf(since, club.timezone))
      .order('on_date', { ascending: false }),
  ])
  if (reported.error) throw reported.error
  if (played.error) throw played.error
  if (cancelled.error) throw cancelled.error
  if (matchBookings.error) throw matchBookings.error
  if (tournaments.error) throw tournaments.error
  if (passes.error) throw passes.error

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
      const pass = payment.pass ?? null
      return {
        id: payment.id,
        amount: payment.amount,
        holder: payment.payer?.display_name ?? (payment.booking ? holderLabel(payment.booking) : 'Sin nombre'),
        startsAt: payment.booking
          ? toDate(payment.booking.starts_at)
          : tournament
            ? toDate(tournament.starts_at)
            : pass
              ? passStartsAt(pass.on_date, pass.product?.from_time, club.timezone)
              : null,
        courtName: payment.booking?.court?.name ?? (tournament ? `Torneo ${tournament.name}` : (pass?.product?.name ?? '')),
        receiptUrl: payment.receipt_path ? (signedUrls.get(payment.receipt_path) ?? null) : null,
      }
    }),
    unpaid: unpaidBookings(played.data),
    unpaidEntries: unpaidEntries(tournaments.data, entries.data, now),
    unpaidPasses: unpaidPasses(passes.data, today, club.timezone),
    refunds: [
      ...refundsDue(cancelled.data),
      ...leftPlayerRefunds(matchBookings.data),
      ...entryRefunds(tournaments.data, entries.data),
      ...passRefunds(passes.data, club.timezone),
    ],
  }
}
```

- [ ] **Step 2: Show them in Cobros**

In `app/(club)/club/cobros/page.tsx`:

Add the import:
```tsx
import { recordPassCash } from '../day-use/actions'
```
Replace:
```tsx
  const { transfers, unpaid, unpaidEntries, refunds } = await loadPaymentsOverview(club)
```
with:
```tsx
  const { transfers, unpaid, unpaidEntries, unpaidPasses, refunds } = await loadPaymentsOverview(club)
```
Replace:
```tsx
    unpaid: totalsOf([...unpaid, ...unpaidEntries], (item) => item.due),
```
with:
```tsx
    unpaid: totalsOf([...unpaid, ...unpaidEntries, ...unpaidPasses], (item) => item.due),
```
In the `sin-pagar` section, replace:
```tsx
        hint="Turnos y torneos de los últimos 30 días que todavía deben plata."
```
with:
```tsx
        hint="Turnos, torneos y day use de los últimos 30 días que todavía deben plata."
```
and right after the closing `))}` of `unpaidEntries.map(…)` (still inside that `PaymentsSection`), add:
```tsx
        {unpaidPasses.map((item) => (
          <li key={item.passId}>
            <Card className="flex h-full flex-col gap-3">
              <PaymentItemHead holder={item.holder} when={when(item.startsAt)} courtName={item.productName}
                amount={item.due} amountLabel="Debe" />
              {club.accepts_cash ? (
                <ActionForm action={recordPassCash} submitLabel="Cobrar en efectivo" pendingLabel="Registrando…" variant="secondary"
                  className="mt-auto">
                  <input type="hidden" name="passId" value={item.passId} />
                  <input type="hidden" name="amount" value={item.due} />
                </ActionForm>
              ) : null}
            </Card>
          </li>
        ))}
```
In the `devolver` section, replace:
```tsx
        hint="Reservas o torneos cancelados, o jugadores que se bajaron después de pagar."
```
with:
```tsx
        hint="Reservas, torneos o pases de day use cancelados, o jugadores que se bajaron después de pagar."
```

- [ ] **Step 3: Verify**

Run:
```bash
npm run typecheck
npm test
npm run lint
```
Expected: PASS. Si supabase-js tipa `payment.pass` distinto (las tres FK son opcionales), leerlo como nullable, sin cast.

- [ ] **Step 4: Commit**

```bash
git add lib/data/payments.ts "app/(club)/club/cobros/page.tsx"
git commit -m "feat(cobros): day use passes to charge and to refund"
```

---

### Task 34: Pases en vivo en las pantallas

**Files:**
- Modify: `components/live/live-occupancy.tsx`
- Test: `tests/unit/components/live/live-occupancy.test.tsx`

- [ ] **Step 1: Write the failing test**

In `tests/unit/components/live/live-occupancy.test.tsx`, rename the test `'listens to occupancies, matches, spots and tournaments of its club'` to `'listens to occupancies, matches, spots, tournaments and day use passes of its club'` and change the `for` loop's array to:
```tsx
    for (const table of ['tournaments', 'tournament_entries', 'tournament_games', 'day_use_passes']) {
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/live/live-occupancy.test.tsx`
Expected: FAIL (no subscription to `day_use_passes`).

- [ ] **Step 3: Listen to passes**

In `components/live/live-occupancy.tsx`, replace the header comment's first sentence with:
```tsx
// Reloads the current screen when a court is taken or freed anywhere in the club, or a match, one of
// its spots, a tournament, an entry, a game or a day use pass changes. It does not patch state by
// hand: the server renders the screen again.
```
(keeping the Realtime/deletes sentence that follows), and replace:
```tsx
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tournament_games', filter: `club_id=eq.${clubId}` },
          reload,
        )
        .subscribe()
```
with:
```tsx
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tournament_games', filter: `club_id=eq.${clubId}` },
          reload,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'day_use_passes', filter: `club_id=eq.${clubId}` },
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
git commit -m "feat(live): reload on day use pass changes"
```

---

### Task 35: Verificación del corte 6

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
Expected: todo PASS (los ocho flujos e2e de las fases anteriores siguen en verde con la pestaña nueva y Cobros con pases).

- [ ] **Step 2: Push**

```bash
git push
```

---
## Corte 7: e2e y cierre

### Task 36: Soporte e2e para day use y limpieza

**Files:**
- Create: `tests/e2e/support/day-use.ts`
- Modify: `tests/e2e/support/global-setup.ts`

(no unit test — soporte de Playwright; lo ejercita la Task 37)

- [ ] **Step 1: Helper**

`tests/e2e/support/day-use.ts`:
```ts
import { addDays, localDateOf } from '../../../lib/domain/time'
import { adminClient, clubRow, type TestUser } from './admin'

// An earlier check-in of the player on that pass, `daysAgo` days back, inserted with the service role
// (check-in only works on the day of the pass, so a past stamp cannot be made through the app).
export async function addPastVisit(player: TestUser, productName: string, daysAgo = 1): Promise<void> {
  const admin = adminClient()
  const club = await clubRow(admin)
  const product = await admin.from('day_use_products').select('id, price').eq('club_id', club.id).eq('name', productName).single()
  if (product.error) throw product.error
  const { error } = await admin.from('day_use_passes').insert({
    club_id: club.id,
    product_id: product.data.id,
    on_date: addDays(localDateOf(new Date(), club.timezone), -daysAgo),
    player_id: player.id,
    price: product.data.price,
    code: `DU-${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`,
    status: 'inside',
    source: 'online',
    checked_in_at: new Date().toISOString(),
  })
  if (error) throw error
}
```

- [ ] **Step 2: Clean up day use before deleting the users**

In `tests/e2e/support/global-setup.ts`, update the header comment to end with `…, the tournaments they created or signed up for, and the day use passes they created, bought or sold.` and, right after the two tournament lines (`… .from('tournament_entries').delete().in('player_id', ids))`), add:
```ts
  // Day use: passes of e2e players or sold by e2e staff (their payments go with them), then the
  // passes e2e admins created (their exceptions, occupancies and remaining passes go with them).
  await check(admin.from('day_use_passes').delete().or(`player_id.in.${idList},created_by.in.${idList}`))
  await check(admin.from('day_use_products').delete().in('created_by', ids))
```

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add tests/e2e/support/day-use.ts tests/e2e/support/global-setup.ts
git commit -m "test(e2e): day use helper and cleanup"
```

---

### Task 37: Flujo e2e: del pase al sello y la recompensa

**Files:**
- Create: `tests/e2e/day-use.spec.ts`

- [ ] **Step 1: Write the flow**

`tests/e2e/day-use.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { addPastVisit } from './support/day-use'

// Next's dev indicator covers the bottom-left tab on mobile (fase 3a notes): navigate with page.goto.
test('day use: the club offers a pass, a player buys it, reception checks her in and the stamps pay off', async ({ page }) => {
  test.setTimeout(150_000)
  const club = await clubRow()
  const tomorrow = addDays(localDateOf(new Date(), club.timezone), 1)
  const name = `Day use E2E ${Date.now()}`
  const admin = await createMember({ name: 'Admin Day Use', prefix: 'dayuse-admin', role: 'admin' })
  const reception = await createMember({ name: 'Recepción Day Use', prefix: 'dayuse-recepcion', role: 'reception' })
  const player = await createMember({ name: 'Ana Day Use', prefix: 'dayuse-ana', gender: 'female' })

  // Admin: a stamp per visit, every 2 visits a free one.
  await signInWithMagicLink(page, admin.email, '/club/ajustes')
  const stamps = page.getByRole('region', { name: 'Sellos' })
  await stamps.getByLabel('Dar sellos por cada day use').check()
  await stamps.getByLabel('Day use para la recompensa').fill('2')
  await stamps.getByLabel('Descuento de la recompensa (%)').fill('100')
  await stamps.getByRole('button', { name: 'Guardar sellos' }).click()
  await expect(stamps.getByRole('status')).toHaveText('Sellos guardados.')

  // A pass every day, all day, that blocks no court (other flows book courts in parallel).
  await page.goto('/club/day-use/configuracion')
  const form = page.getByRole('region', { name: 'Nuevo pase' })
  await form.getByLabel('Nombre').fill(name)
  for (const day of ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']) await form.getByLabel(day, { exact: true }).check()
  await form.getByLabel('Desde').selectOption('00:00')
  await form.getByLabel('Hasta').selectOption('24:00')
  await form.getByRole('button', { name: 'Crear pase' }).click()
  await expect(form.getByRole('status')).toContainText('Pase guardado.')

  // The player buys today's pass and sees its QR.
  await page.context().clearCookies()
  await signInWithMagicLink(page, player.email, '/day-use')
  await page.getByRole('article', { name }).getByRole('button', { name: 'Comprar pase, $450' }).click()
  await page.getByRole('dialog', { name: 'Comprar pase' }).getByRole('button', { name: 'Confirmar compra' }).click()
  await expect(page).toHaveURL(/\/day-use\/pase\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('img', { name: 'Código QR del pase' })).toBeVisible()
  const code = ((await page.getByTestId('pass-code').textContent()) ?? '').trim()
  expect(code).toMatch(/^DU-\d{6}$/)

  // Reception opens the link the QR holds and checks her in.
  await page.context().clearCookies()
  await signInWithMagicLink(page, reception.email, `/club/day-use/pase/${code}`)
  await page.getByRole('button', { name: 'Registrar ingreso' }).click()
  await expect(page.getByText(/^Adentro desde las \d{2}:\d{2}\.$/)).toBeVisible()

  // The check-in is a stamp.
  await page.context().clearCookies()
  await signInWithMagicLink(page, player.email, '/day-use')
  await expect(page.getByText('1 de 2 sellos')).toBeVisible()

  // With an earlier visit the stamps are complete: tomorrow's pass is free.
  await addPastVisit(player, name)
  await page.goto(`/day-use?dia=${tomorrow}`)
  await expect(page.getByText(/Tenés 1 recompensa/)).toBeVisible()
  await page.getByRole('article', { name }).getByRole('button', { name: 'Usar mi recompensa (-100%)' }).click()
  const sheet = page.getByRole('dialog', { name: 'Comprar pase' })
  await expect(sheet).toContainText('Con tu recompensa (-100%): $0.')
  await sheet.getByRole('button', { name: 'Confirmar compra' }).click()
  await expect(page).toHaveURL(/\/day-use\/pase\/[0-9a-f-]{36}$/)
  await expect(page.getByText('Sin costo: usaste tu recompensa.')).toBeVisible()
})
```

- [ ] **Step 2: Run it**

Run:
```bash
npx playwright test tests/e2e/day-use.spec.ts --workers=1
npx playwright test tests/e2e/day-use.spec.ts --workers=1
```
Expected: PASS dos veces seguidas (la segunda corrida prueba la limpieza del global setup: sin ella quedarían pases de day use de corridas anteriores).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/day-use.spec.ts
git commit -m "test(e2e): day use from the pass to the stamps and the reward"
```

---

### Task 38: Cierre de la fase

**Files:**
- Modify: `docs/features/fase-3b-day-use/notes.md`, `docs/features/fase-3b-day-use/plan.md` (revisiones)

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
Expected: todo PASS (pgTAP completo, Vitest, los nueve flujos e2e).

- [ ] **Step 2: Revisión de disciplina**

Run `/team-setup:discipline-check` sobre la rama y arreglar lo que encuentre en commits aparte (con su test). Si algún arreglo toca la base, va en una migración nueva `20261002000150_*.sql` con su pgTAP (como `tournament_review` en la fase 3a). Mirar en especial: el orden de bloqueo pagos → pase en toda función nueva, staff de otro club en cada RPC nueva, y que ninguna función nueva sea ejecutable por `anon`.

- [ ] **Step 3: Notas de ejecución**

Append to `docs/features/fase-3b-day-use/notes.md` one dated entry per slice with the deviations from this plan (as in `../fase-3a-torneos/notes.md`), and to the "Plan revisions" section of this file a `v3` line if the plan changed during execution.

```bash
git add docs/features/fase-3b-day-use/notes.md docs/features/fase-3b-day-use/plan.md
git commit -m "docs: fase 3b execution notes"
git push
```

- [ ] **Step 4: PR listo**

Marcar el PR como listo desde GitHub y esperar CI en verde.
Expected: `quality` y `db-and-e2e` en verde.

- [ ] **Step 5: MANUAL (producción, después del merge)**

- MANUAL (Miguel): confirmar que `migrate.yml` aplicó `20261002000100` a `20261002000140` en producción (`select version from supabase_migrations.schema_migrations order by version desc limit 5`) y que el cron existe (`select jobname from cron.job where jobname = 'extend-day-use'`).
- MANUAL: responder con Rustic la pregunta abierta del diseño (pases, precios, cupos y regla de sellos reales; los ejemplos son "Day use completo" $450, cupo 30, sáb/dom 08:00–12:30, cada 5, 100 %, vencen a los 6 meses). Cargar los pases desde "Configurar pases" y la regla en Ajustes → Sellos; si cambian los valores de ejemplo del formulario, ajustar `DAY_USE_DEFAULTS` en `lib/domain/day-use.ts`.

---

## Acceptance criteria

- [ ] El admin crea, edita, desactiva y activa pases (nombre, precio, qué incluye, días, horario, cupo por día, canchas) desde "Configurar pases"; recepción no configura (`forbidden`).
- [ ] Cada pase bloquea sus canchas en sus días y horarios hasta la ventana de reservas, y el cron diario lo extiende; si una cancha ya estaba ocupada ese tramo se saltea, el guardado lo cuenta y la configuración lo muestra en "Canchas sin bloquear". La grilla muestra el bloque "Day use" con el nombre del pase.
- [ ] El admin abre o cierra una fecha puntual en el calendario; las canchas siguen a la excepción y una excepción igual a la regla se borra.
- [ ] El jugador ve los próximos 7 días (tachados los que no hay day use), cada pase con horario, precio, qué incluye y cupo con barra; compra si hay día, lugar, está en la ventana, el horario no terminó y no tiene ya ese pase; si no, la pantalla dice por qué.
- [ ] Al comprar recibe su pase con un QR (link a `/club/day-use/pase/<código>`) y un código `DU-` de 6 dígitos; paga por transferencia con comprobante o en efectivo, y recepción confirma. Un pase a $0 no pasa por Cobros.
- [ ] Recepción vende a un jugador (con su recompensa si tiene) o a alguien sin cuenta; busca por nombre o código; registra el ingreso solo el día del pase y una vez; cancela antes del ingreso.
- [ ] El jugador cancela su pase antes del ingreso: se libera el lugar, recupera la recompensa, su transferencia informada se rechaza y lo pagado aparece en "Pagos a devolver".
- [ ] Cada ingreso sin recompensa suma un sello; con la regla del club (cada N, descuento, vencimiento) el jugador ve sus sellos como pelotas, gana la recompensa y la usa con "Usar mi recompensa"; el day use con recompensa no suma sello.
- [ ] "Ya están en el club" muestra quién ingresó hoy; cada jugador puede ocultarse desde su perfil; los invitados sin cuenta no aparecen para los jugadores; el staff ve a todos.
- [ ] Inicio muestra la tarjeta "Day use" con los sellos, el pase de hoy y "Hoy: N en el club, quedan M lugares"; el club tiene la pestaña Day use con el resumen del día.
- [ ] Cobros lista pases sin cobrar y a devolver con el nombre del pase, y las transferencias informadas de pases.
- [ ] `anon` no ejecuta ninguna función; las escrituras de day use son solo por RPC (y la regla de sellos por el update de `clubs` del admin); el staff de otro club recibe `forbidden` en todas las funciones.
- [ ] pgTAP, Vitest, lint, typecheck, build y los nueve flujos e2e en verde en CI.

## Plan revisions

(append-only)

- **v1 (2026-10-01)**: scaffold.
- **v2 (2026-10-01)**: plan completo en 7 cortes (Tasks 1–38) sobre el diseño aprobado. Decisiones propias en "Decisiones que este plan toma".
- **v3 (2026-10-02)**: ejecutado. Desvíos en `notes.md`; arreglos de la revisión en la migración `20261002000150`.
