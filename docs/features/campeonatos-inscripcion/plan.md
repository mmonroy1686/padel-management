---
feature: campeonatos-inscripcion
type: plan
status: in-progress
date: 2026-10-06
branch: feat/campeonatos-inscripcion
references: ./design.md, ../lista-de-espera/plan.md, ../fase-3a-torneos/design.md, ../fase-1-reservas/design.md
---

# Campeonatos: configuración e inscripción Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/team-setup:execute` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el organizador arme un campeonato por parejas (datos, días de juego y categorías), abra la inscripción bloqueando sus canchas, que los miembros se anoten con un compañero (miembro o de afuera), que recepción cargue parejas, cobre y maneje la lista de espera por categoría, y que las bajas, fusiones y cancelaciones dejen los pagos a devolver y avisen a los afectados.

**Architecture:** Igual que las fases anteriores: cada escritura es una función `security definer` de Postgres con `search_path = ''` y códigos de error estables (`private.fail`), traducidos en `lib/domain/errors.ts`. Tablas propias (`players`, `championships`, `championship_windows`, `championship_categories`, `championship_entries`, `entry_unavailability`); se reutilizan `court_occupancy` (tipo nuevo `championship`), `payments` (columna `championship_entry_id`, Cobros) y la *outbox* de avisos de la lista de espera (`notifications`, tipos nuevos). Toda escritura de inscripciones bloquea la fila del campeonato, así el último lugar, el tope de categorías y la lista de espera nunca compiten. Next lee con la sesión del usuario (RLS); los teléfonos solo salen por una función que filtra staff y compañero.

**Tech Stack:** Next.js 16.3 (App Router, Server Actions), React 19, TypeScript, Tailwind 4, Supabase (Postgres 17, Auth, Storage), `@supabase/ssr`, Vitest + Testing Library, pgTAP, Playwright con Mailpit.

---

## Antes de empezar

- Rama: `feat/campeonatos-inscripcion` (ya existe, con el diseño aprobado en `0a74a7c` y el merge de `feat/admin-tablas`, que trae `components/ui/data-table.tsx` y `lib/domain/table.ts`). Commits chicos; cada corte termina en verde. Se ejecuta de corrido, sin pedir confirmación entre cortes.
- Docker Desktop corriendo. El CLI de Supabase es devDependency: `npx supabase …` o los scripts de npm (`npm run test:db`, `npm run db:reset`, `npm run db:types`). No hay CLI global. `gh` no está instalado: el PR se abre y se marca listo desde GitHub.
- Windows: **los archivos con barras invertidas (`\ir` en los tests pgTAP) se escriben con la herramienta Write**, nunca con heredoc ni `sed`. Las rutas con paréntesis o corchetes (`app/(jugador)/…`, `[id]`) van entre comillas en bash. El código TypeScript de este plan no usa barras invertidas en expresiones regulares (usa `[0-9]` y `[.]`), así que se puede escribir con cualquier herramienta.
- Next 16: antes de usar una API de Next, leer su guía en `node_modules/next/dist/docs/01-app/` (ver `AGENTS.md`). Las usadas acá: Server Actions (`01-getting-started/07-mutating-data.md`), `params` y `searchParams` como Promise (`03-api-reference/03-file-conventions/page.md`), `redirect` (`03-api-reference/04-functions/redirect.md`).
- Producción: las migraciones llegan con el merge (`migrate.yml`). **Nunca** correr `supabase link`, `db push` ni nada contra producción desde la máquina local (Miguel corre los comandos de producción). Las migraciones ya aplicadas **no se editan**: todo cambio es una migración nueva.
- Migraciones nuevas: `supabase/migrations/20261006000100_*.sql` … `20261006000170_*.sql` (todas posteriores a `20261005000160_waitlist_review_fixes.sql`). Un arreglo de la revisión final va en `20261006000180_*.sql`. **Los valores nuevos de los enums van solos en su archivo**: `championship` de `occupancy_kind` en `…100` y los cuatro de `notification_kind` en `…110`. Postgres no deja usar un valor de enum en la misma transacción que lo agrega y el CLI aplica cada archivo en su propia transacción. Si `db reset` falla con `unsafe use of new value`, algo de `…120` en adelante quedó en `…100` o `…110`.
- Docs en español; identificadores, comentarios de SQL y de código en inglés.
- pgTAP: un test se corre con `npx supabase test db supabase/tests/database/<archivo>.test.sql`; todos con `npm run test:db`. Los tests de campeonatos incluyen, en este orden, `\ir helpers/slot.psql`, `\ir helpers/club.psql`, `\ir helpers/match.psql`, `\ir helpers/day_use.psql` (trae a Eva, staff de otro club) y `\ir helpers/championship.psql` (nuevo).
- Cada migración nueva se aplica con `npm run db:reset` y después `npm run db:types` regenera `lib/supabase/database.types.ts`, que CI compara byte a byte.
- Datos del fixture pgTAP (club T, `helpers/club.psql` + `helpers/match.psql` + `helpers/day_use.psql`): **grilla 08:00–23:00 cada 90 min (08:00, 09:30, 11:00, 12:30, 14:00, 15:30, 17:00, 18:30, 20:00, 21:30)**, ventana de 14 días, zona `America/Montevideo`, cobra en efectivo y por transferencia con comprobante obligatorio; canchas `c0000000-0000-0000-0000-000000000001` (Cancha 1) y `…0002` (Cancha 2). Personas: Ana `…a1`, Bruno `…b1`, Gabi `…a2`, Hugo `…a3`, Iván `…a4`, Juli `…a5` (jugadores), Carla `…c1` (recepción; su `display_name` es `carla`), Dani `…d1` (admin; `dani`), Omar `…f1` (no es miembro), Eva `…e1` (admin del club B). En este documento `…a1` abrevia `00000000-0000-0000-0000-0000000000a1`; **en los archivos va siempre el uuid completo**.
- **Horas en pgTAP: solo horas de la grilla** (08:00, 09:30, 11:00, 12:30, 14:00, 15:30, 17:00, 18:30, 20:00, 21:30, y 23:00 o 24:00 como fin). Nunca 19:00, 10:00 ni ninguna otra hora fuera de la grilla en un literal. Las franjas de 2 horas de los horarios imposibles empiezan a las 08:00, 10:00, 12:00…: los tests nunca las escriben, las piden con `test_helpers.blocks(…)` (Task 8).
- Ids del fixture de campeonatos (todos hexadecimales, sin chocar con los de otros fixtures; `cb…` ya es la Cancha B): campeonatos `c1a00000-0000-0000-0000-00000000000N`, categorías `c2a00000-…`, parejas `c3a00000-…`, jugadores `c4a00000-…` (`c4a00000-0000-0000-0000-0000000000a1` es la fila de jugador de Ana; `…000000000f01` la de Pedro, de afuera).
- `now()` es fijo dentro de la transacción de cada test: dos parejas creadas en el mismo test tienen el mismo `created_at`. Cuando el orden de la lista de espera importa, el test lo fija con `p_created_at`.
- Soporte e2e (`tests/e2e/support`): `createMember`, `signedInClient`, `clubRow`, `adminClient`, `signInWithMagicLink`. Lección de la fase 3a: **en e2e se navega con `page.goto`, nunca con clicks en las pestañas** (el indicador de Next tapa la de abajo a la izquierda).
- jsdom: los `select` se cambian con `userEvent.selectOptions`; los radios con `userEvent.click`.

## Decisiones que este plan toma (y que el diseño no fijaba)

| Tema | Decisión | Por qué |
| --- | --- | --- |
| Quién es "el organizador" | El staff del club (admin y recepción, `private.is_staff`), igual que en los americanos | Recepción ya arma americanos; el diseño no separa roles |
| Abrir la inscripción | A mano (`open_championship_registration`): pasa de `draft` a `registration`, fija `registration_opens_at = now()` y, si no hay cierre, `registration_closes_at` = primer partido − 24 h. Sin apertura programada | Un cron para abrir no aporta en un club; el cierre ya es una fecha |
| Cerrar la inscripción | Por fecha para los jugadores (no se anotan ni se bajan después de `registration_closes_at`) y a mano para el estado (`close_championship_registration` → `closed`). El staff sigue cargando y quitando parejas en `registration` y `closed` | Diseño: "después, solo el organizador" |
| Editar días y categorías | Solo en borrador, agregando o quitando filas (`add_…`/`delete_…`). Abierta la inscripción, los cambios son fusionar, cancelar o mover parejas | Evita cambiar canchas bloqueadas o cupos con gente anotada; YAGNI de la edición en el lugar |
| Días de juego | Dentro del horario del club (`outside_hours`), en el futuro (`in_the_past`), canchas activas del club, y dos días del mismo campeonato no se pisan en la misma cancha (`courts_busy`) | Las ocupaciones los harían chocar al abrir |
| Bloqueo de canchas | Al abrir, una ocupación `championship` por día y cancha (`court_occupancy.championship_id`, `note` = nombre); si una cancha está tomada, `courts_busy` y no se abre nada. Cancelar borra las ocupaciones | Igual que los americanos (fase 3a) |
| Un teléfono, un jugador | `private.normalize_phone`: solo dígitos; `+598 99 …` y `00598 99 …` pasan a `099…`; entre 8 y 15 dígitos. Índice único `(club_id, phone)`. Si el teléfono ya existe se usa ese jugador (no se pisa su nombre) | Rustic es de Uruguay; "099 123 456" y "+598 99 123 456" son la misma persona |
| Fila de jugador de un miembro | `private.player_for_profile`: se crea la primera vez que juega, con su `display_name`; única por `(club_id, profile_id)` | Diseño |
| Compañero miembro | Cualquier miembro del club (`partner_not_member` si no lo es). El buscador del jugador lista solo perfiles públicos (`public.member_directory`); recepción usa `loadMemberOptions` | Los miembros no leen `club_members` de otros (RLS) |
| Teléfonos | `players.phone` y `email` no se pueden leer por la API (privilegios de columna). `public.championship_contacts` los da al staff (todo el campeonato) y a cada jugador miembro (sus parejas) | Diseño: "solo el staff y su compañero" |
| Pareja en espera | Entra sola, en orden de `created_at` (y `id`), cuando una pareja con lugar se va (baja, quitada, movida); `private.fill_category` con aviso `championship_promoted` | Diseño |
| Mover de categoría | `move_championship_entry`: entra con lugar si hay cupo, si no queda en espera; aviso `championship_moved`; si tenía lugar, la categoría de origen llama a la siguiente en espera | La misma regla que fusionar |
| Fusionar | Pasan primero las parejas con lugar y después las en espera, cada una con lugar si hay cupo o en espera; una pareja con alguien que ya está en la categoría destino queda `removed` (sus pagos a devolver) con aviso de cancelación | El diseño no cubre el duplicado; no puede quedar en dos lugares |
| Cancelar categoría o campeonato | Categoría: sus parejas quedan `removed` y su categoría `cancelled`. Campeonato: las parejas quedan como estaban, el campeonato `cancelled`. En los dos casos: transferencias informadas rechazadas, pagos confirmados a devolver (Cobros) y aviso `championship_cancelled` | Mismo criterio que americanos y day use |
| Pagos | Un pago por pareja, solo con lugar (`active`); transferencia informada por cualquiera de los dos jugadores miembros, efectivo por recepción (`payer_id` nulo). Una transferencia informada a la vez | Diseño: "uno por pareja"; una pareja en espera no paga un lugar que no tiene |
| Quién ve los pagos de la pareja | La política de `payments` suma: los jugadores de esa pareja (`private.is_entry_player`) | El compañero que no pagó ve que está pago |
| Tope de 40 % | `count * 5 > total * 2` es "más del 40 %". El jugador que se pasa recibe `too_many_unavailable`; el staff puede guardar más y eso marca `unavailability_approved` | "Más necesita aprobación del organizador": que lo cargue el organizador es la aprobación |
| Franjas de 2 horas | Desde el inicio de cada día de juego cada 120 min; la última termina con el día. Se identifican como `YYYY-MM-DD@HH:MM` (`private.championship_blocks` y `championshipBlocks` en TS hacen lo mismo) | Una clave de texto se compara igual en SQL, TS y el formulario |
| Datos de cada aviso | `data` = `championship_id`, `championship_name`, `category_name` (nulo si se canceló todo), `partner_name`, `waiting`, `starts_at` (primer partido); link `/campeonatos/<id>`. El mail sale por la misma *outbox*; uno de un campeonato que ya empezó se marca `skipped` | Reutiliza la lista de espera |
| Avisos y TS | `lib/domain/notifications.ts` pasa a ser el punto único (`notificationContent`, `isNotificationStale`, `toNotificationView`); la lista de espera conserva sus textos | Con cuatro tipos más, el `if (kind === 'slot_held')` ya no alcanza |
| Rutas | Jugador: `/campeonatos/[id]` (la pestaña Torneos queda marcada: `TabItem.also`). Club: `/club/torneos/campeonatos/nuevo` y `/club/torneos/campeonatos/[id]` (borrador = editor; después, gestión) | Diseño |
| Cobros | `MoneyKind` suma `championship` ("Campeonato"). "Jugado sin pagar": parejas con lugar de campeonatos que ya empezaron. "A devolver": pagos confirmados de parejas que se fueron o de categorías o campeonatos cancelados. Se leen los campeonatos creados en los últimos 180 días | Igual que americanos; no hay `starts_at` en la tabla para filtrar |
| Afiche | Bucket público `championship-posters/<club_id>/poster-<ts>.<ext>` (PNG, JPG, WebP, hasta 5 MB); sube el staff del club; `set_championship_poster` verifica que el archivo exista | Diseño: "como el logo del club" |
| Tiempo real | No se suma: cada escritura revalida (`revalidateBookings`) | YAGNI; la grilla ya escucha `court_occupancy` |
| PR | Un PR borrador desde el corte 1 (Task 4), listo al final | Igual que las fases anteriores |

## Mapa de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `supabase/migrations/20261006000100_championship_kind.sql` | `occupancy_kind` suma `championship` (solo eso) |
| `supabase/migrations/20261006000110_championship_notification_kinds.sql` | `notification_kind` suma los cuatro avisos (solo eso) |
| `supabase/migrations/20261006000120_championships.sql` | Enums, tablas, columnas en `court_occupancy` y `payments`, `is_entry_player`, RLS, privilegios, bucket del afiche, `guard_court_delete` |
| `supabase/migrations/20261006000130_championship_setup.sql` | Borrador: crear, editar, días, categorías, afiche; `member_directory`, `championship_contacts` |
| `supabase/migrations/20261006000140_championship_entries.sql` | Jugadores, avisos, lista de espera; anotarse, cargar, bajas, quitar, mover |
| `supabase/migrations/20261006000150_championship_lifecycle.sql` | Abrir, cerrar y cancelar; fusionar y cancelar categorías |
| `supabase/migrations/20261006000160_championship_unavailability.sql` | Franjas de 2 horas y horarios imposibles |
| `supabase/migrations/20261006000170_championship_payments.sql` | Deuda, transferencia, efectivo y `confirm_payment` |
| `supabase/tests/database/helpers/championship.psql` | Jugadores del fixture, `make_championship`, `make_window`, `make_category`, `make_entry`, `entry_status`, `notices`, `last_notice`, `blocks` |
| `supabase/tests/database/championship_*.test.sql` | pgTAP |
| `lib/domain/errors.ts` | Códigos nuevos |
| `lib/domain/grid.ts`, `components/booking/{cell-styles.ts,legend.tsx,slot-grid.tsx}`, `components/club/occupancy-detail-sheet.tsx`, `lib/data/day.ts` | El campeonato en la grilla |
| `lib/domain/championship-notifications.ts`, `lib/domain/notifications.ts` | Textos de los avisos de campeonato y el punto único de avisos |
| `lib/domain/waitlist.ts`, `lib/notify/{messages,send-pending}.ts`, `lib/data/waitlist.ts`, `components/waitlist/notification-list.tsx` | Usan el punto único |
| `lib/domain/championships.ts` | Tipos, estados, cupos, lista de espera, franjas, textos |
| `lib/domain/championship-form.ts` | Lectura de cada formulario |
| `lib/domain/championship-payments.ts`, `lib/domain/payments-overview.ts` | Cobros de inscripciones |
| `lib/domain/championship-pairs.ts` | Filas de las tablas de parejas del organizador |
| `lib/domain/championship-poster.ts`, `lib/storage/championship-poster.ts` | Afiche: ruta, límites y subida |
| `lib/data/championships.ts`, `lib/data/payments.ts` | Lecturas |
| `lib/actions/championships.ts` | Acciones del jugador (y horarios, que usa también el staff) |
| `app/(club)/club/torneos/campeonatos/actions.ts` | Acciones del staff |
| `components/nav/tab-nav.tsx`, `app/(jugador)/layout.tsx` | Torneos marcada en `/campeonatos` |
| `components/championships/*` | `championship-card`, `pair-player-fields`, `register-sheet`, `unavailability-sheet`, `my-entry-card`, `championship-details-form`, `windows-editor`, `categories-editor`, `poster-form`, `championship-controls`, `pairs-table`, `add-pair-sheet`, `pairs-board`, `small-categories` |
| `app/(jugador)/torneos/page.tsx`, `app/(jugador)/campeonatos/[id]/{page,championship-board}.tsx` | Pantallas del jugador |
| `app/(club)/club/torneos/page.tsx`, `app/(club)/club/torneos/campeonatos/{nuevo/page,[id]/page}.tsx` | Pantallas del club (el `[id]` es editor en borrador y gestión después) |
| `app/(club)/club/cobros/{page,money-table}.tsx` | Cobros con inscripciones |
| `tests/unit/fixtures/championships.ts` | Fixture de Vitest |
| `tests/e2e/support/{championships,global-setup}.ts`, `tests/e2e/championship.spec.ts` | Limpieza y flujo e2e |

## Secuencia por cortes

| Corte | Tasks | Resultado | Cómo se prueba |
| --- | --- | --- | --- |
| 1. Modelo | 1–4 | Tablas, RLS, el tipo `championship` en la grilla, avisos de campeonato en TS | pgTAP + Vitest |
| 2. RPCs | 5–9 | Borrador, inscripción, lista de espera, apertura y cancelación, fusiones, horarios, pagos | pgTAP |
| 3. Dominio TS | 10–13 | Errores, reglas y textos, formularios, Cobros | Vitest |
| 4. Datos y acciones | 14–16 | Lecturas y Server Actions | Vitest + typecheck |
| 5. Pantallas del jugador | 17–22 | Torneos con campeonatos, anotarse, horarios, tus inscripciones, afiche (dominio), /campeonatos/[id] | Vitest |
| 6. Pantallas del club | 23–29 | Lista y nuevo, días y categorías del borrador, afiche, pasos, parejas, categorías chicas, Cobros | Vitest |
| 7. e2e y cierre | 30–31 | Flujo completo; PR listo | Playwright |

---

## Corte 1: Modelo

### Task 1: Punto de partida en verde

**Files:** ninguno.

- [ ] **Step 1: Rama y stack local**

Run:
```bash
git branch --show-current
git log --oneline -3
npx supabase start
npm run db:reset
```
Expected: `feat/campeonatos-inscripcion`; el último commit es `docs: approve championship registration design`; `db reset` aplica las migraciones hasta `20261005000160_waitlist_review_fixes.sql` y `seed.sql`.

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

### Task 2: Campeonatos, jugadores y parejas en la base

**Files:**
- Create: `supabase/tests/database/helpers/championship.psql`
- Create: `supabase/tests/database/championship_schema.test.sql`
- Create: `supabase/migrations/20261006000100_championship_kind.sql`
- Create: `supabase/migrations/20261006000110_championship_notification_kinds.sql`
- Create: `supabase/migrations/20261006000120_championships.sql`

- [ ] **Step 1: Test helper** (con la herramienta Write)

`supabase/tests/database/helpers/championship.psql`:
```sql
-- Campeonatos fixture. Include it after slot.psql, club.psql, match.psql and day_use.psql:
--   \ir helpers/championship.psql
-- Players: Ana, Bruno, Gabi, Hugo, Iván and Juli have their member row (linked to their profile);
-- Pedro, Lucía, Marta, Nico, Olga and Raúl play from outside, with a phone. c4a...a1 is Ana's row,
-- c4a...f01 Pedro's. Everything is inserted as postgres (skips the RPC rules on purpose).
insert into public.players (id, club_id, name, phone, profile_id) values
  ('c4a00000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-000000000001', 'Ana', null,
   '00000000-0000-0000-0000-0000000000a1'),
  ('c4a00000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-000000000001', 'Bruno', null,
   '00000000-0000-0000-0000-0000000000b1'),
  ('c4a00000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-000000000001', 'Gabi', null,
   '00000000-0000-0000-0000-0000000000a2'),
  ('c4a00000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-000000000001', 'Hugo', null,
   '00000000-0000-0000-0000-0000000000a3'),
  ('c4a00000-0000-0000-0000-0000000000a4', 'a0000000-0000-0000-0000-000000000001', 'Iván', null,
   '00000000-0000-0000-0000-0000000000a4'),
  ('c4a00000-0000-0000-0000-0000000000a5', 'a0000000-0000-0000-0000-000000000001', 'Juli', null,
   '00000000-0000-0000-0000-0000000000a5'),
  ('c4a00000-0000-0000-0000-000000000f01', 'a0000000-0000-0000-0000-000000000001', 'Pedro', '099111001', null),
  ('c4a00000-0000-0000-0000-000000000f02', 'a0000000-0000-0000-0000-000000000001', 'Lucía', '099111002', null),
  ('c4a00000-0000-0000-0000-000000000f03', 'a0000000-0000-0000-0000-000000000001', 'Marta', '099111003', null),
  ('c4a00000-0000-0000-0000-000000000f04', 'a0000000-0000-0000-0000-000000000001', 'Nico', '099111004', null),
  ('c4a00000-0000-0000-0000-000000000f05', 'a0000000-0000-0000-0000-000000000001', 'Olga', '099111005', null),
  ('c4a00000-0000-0000-0000-000000000f06', 'a0000000-0000-0000-0000-000000000001', 'Raúl', '099111006', null);

-- A championship of club T. Unless told otherwise it is open for registration until 5 days from now
-- and takes 2 categories per player.
create procedure test_helpers.make_championship(
  p_id uuid,
  p_status public.championship_status default 'registration',
  p_closes_at timestamptz default now() + interval '5 days',
  p_max_categories integer default 2
)
language sql
as $$
  insert into public.championships (id, club_id, name, status, registration_opens_at, registration_closes_at,
                                    max_categories_per_player, cancelled_at)
  values (p_id, 'a0000000-0000-0000-0000-000000000001', 'Campeonato T', p_status,
          case when p_status <> 'draft' then now() end, p_closes_at, p_max_categories,
          case when p_status = 'cancelled' then now() end);
$$;

-- A day of play: `p_days` days from today, from p_from to p_to, on both courts unless told otherwise.
create procedure test_helpers.make_window(
  p_championship_id uuid,
  p_days integer,
  p_from time,
  p_to time,
  p_courts uuid[] default array['c0000000-0000-0000-0000-000000000001',
                                'c0000000-0000-0000-0000-000000000002']::uuid[]
)
language sql
as $$
  insert into public.championship_windows (club_id, championship_id, on_date, from_time, to_time, court_ids)
  values ('a0000000-0000-0000-0000-000000000001', p_championship_id, test_helpers.today() + p_days, p_from, p_to,
          p_courts);
$$;

-- A category: 'Libre' for at most p_max pairs at $2.000 a pair, at least p_min pairs to be played.
create procedure test_helpers.make_category(
  p_id uuid,
  p_championship_id uuid,
  p_name text default 'Libre',
  p_max integer default 4,
  p_min integer default 2,
  p_price integer default 2000
)
language sql
as $$
  insert into public.championship_categories (id, club_id, championship_id, name, min_pairs, max_pairs, price)
  values (p_id, 'a0000000-0000-0000-0000-000000000001', p_championship_id, p_name, p_min, p_max, p_price);
$$;

-- A pair; both declare 5ª. p_created_at sets its place in the waiting line.
create procedure test_helpers.make_entry(
  p_id uuid,
  p_category_id uuid,
  p_player1 uuid,
  p_player2 uuid,
  p_status public.championship_entry_status default 'active',
  p_created_at timestamptz default now()
)
language sql
as $$
  insert into public.championship_entries (id, club_id, category_id, player1_id, player2_id, player1_level,
                                           player2_level, status, created_at, ended_at)
  values (p_id, 'a0000000-0000-0000-0000-000000000001', p_category_id, p_player1, p_player2, 5, 5, p_status,
          p_created_at, case when p_status in ('withdrawn', 'removed') then now() end);
$$;

-- The status of a pair, read past RLS (a test acting as a member can ask about anyone's).
create function test_helpers.entry_status(p_entry_id uuid)
returns text
language sql
stable
security definer
as $$
  select status::text from public.championship_entries where id = p_entry_id;
$$;

-- How many avisos of a kind a person got, read past RLS.
create function test_helpers.notices(p_user_id uuid, p_kind text)
returns integer
language sql
stable
security definer
as $$
  select count(*)::integer from public.notifications where user_id = p_user_id and kind::text = p_kind;
$$;

-- The data of the latest aviso of a kind a person got, read past RLS.
create function test_helpers.last_notice(p_user_id uuid, p_kind text)
returns jsonb
language sql
stable
security definer
as $$
  select data from public.notifications where user_id = p_user_id and kind::text = p_kind
  order by created_at desc, id desc limit 1;
$$;
```

- [ ] **Step 2: Write the failing test** (con la herramienta Write)

`supabase/tests/database/championship_schema.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(28);

select has_table('public', 'players', 'players exists');
select has_table('public', 'championships', 'championships exists');
select has_table('public', 'championship_windows', 'championship_windows exists');
select has_table('public', 'championship_categories', 'championship_categories exists');
select has_table('public', 'championship_entries', 'championship_entries exists');
select has_table('public', 'entry_unavailability', 'entry_unavailability exists');
select ok('championship' = any (enum_range(null::public.occupancy_kind)::text[]),
  'a championship is one more kind of occupancy');
select ok(
  array['championship_added', 'championship_promoted', 'championship_moved', 'championship_cancelled']
    <@ enum_range(null::public.notification_kind)::text[],
  'and its avisos are four more kinds of aviso');

-- C1 is open for registration, with a day of play, a category and two pairs; C2 is a draft.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000002', 'draft', null);
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000002',
  'Borrador');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03');
insert into public.entry_unavailability (club_id, entry_id, on_date, from_time, to_time) values
  ('a0000000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000001', test_helpers.today() + 10,
   '08:00', '09:30'),
  ('a0000000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002', test_helpers.today() + 10,
   '08:00', '09:30');

select throws_ok(
  $$ insert into public.players (club_id, name, phone)
     values ('a0000000-0000-0000-0000-000000000001', 'Otro Pedro', '099111001') $$,
  '23505', null, 'a phone is one player');
select throws_ok(
  $$ insert into public.players (club_id, name, phone)
     values ('a0000000-0000-0000-0000-000000000001', 'Sin formato', '099-111') $$,
  '23514', null, 'a phone is stored as digits only');
select throws_ok(
  $$ call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000009', 'c2a00000-0000-0000-0000-000000000001',
       'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-0000000000a3') $$,
  '23514', null, 'a pair is two different players');
select throws_ok(
  $$ call test_helpers.make_category('c2a00000-0000-0000-0000-000000000009', 'c1a00000-0000-0000-0000-000000000001',
       'Al revés', 4, 8) $$,
  '23514', null, 'the minimum of pairs is not over the maximum');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, championship_id)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'block',
             test_helpers.slot(12, '08:00', 90), 'c1a00000-0000-0000-0000-000000000001') $$,
  '23514', null, 'only a championship occupancy points at a championship');
select throws_ok(
  $$ insert into public.payments (club_id, championship_entry_id, day_use_pass_id, method, amount, status)
     values ('a0000000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000001', gen_random_uuid(),
             'cash', 2000, 'confirmed') $$,
  '23514', null, 'a payment is for one thing only');
select throws_ok(
  $$ call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000009', 'registration', null) $$,
  '23514', null, 'an open registration has a deadline');

-- Ana, player
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select results_eq('select id from public.championships',
  $$ values ('c1a00000-0000-0000-0000-000000000001'::uuid) $$, 'a member reads the championships out of draft');
select results_eq('select id from public.championship_categories',
  $$ values ('c2a00000-0000-0000-0000-000000000001'::uuid) $$, 'and their categories');
select is((select count(*)::int from public.championship_windows), 1, 'and their days of play');
select is((select count(*)::int from public.championship_entries), 2, 'and their pairs');
select is((select name from public.players where id = 'c4a00000-0000-0000-0000-000000000f01'), 'Pedro',
  'a member reads the names of the players');
select throws_ok($$ select phone from public.players $$, '42501', null, 'but not their phones');
select throws_ok(
  $$ insert into public.championships (club_id, name) values ('a0000000-0000-0000-0000-000000000001', 'Mío') $$,
  '42501', null, 'nobody writes championships directly');
select is((select count(*)::int from public.entry_unavailability), 1, 'a member reads the hours of her own pairs only');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is((select count(*)::int from public.championships), 2, 'staff read the drafts too');
select is((select count(*)::int from public.championship_entries), 3, 'and every pair');
select is((select count(*)::int from public.entry_unavailability), 2, 'and every pair''s hours');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';

select is((select count(*)::int from public.championships) + (select count(*)::int from public.players), 0,
  'staff of another club read no championships or players');

-- Anonymous visitor
set local role anon;

select throws_ok($$ select count(*) from public.championships $$, '42501', null, 'anon reads no championships');

select * from finish();
rollback;
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/championship_schema.test.sql`
Expected: FAIL (`relation "public.players" does not exist` al cargar el helper).

- [ ] **Step 4: Los valores nuevos de los enums, cada uno en su migración**

`supabase/migrations/20261006000100_championship_kind.sql`:
```sql
-- Campeonatos, part 0: the courts a championship blocks are one more kind of occupancy. Alone in its file:
-- Postgres does not let a transaction use an enum value it just added, and the CLI runs each migration in
-- one transaction.
alter type public.occupancy_kind add value 'championship';
```

`supabase/migrations/20261006000110_championship_notification_kinds.sql`:
```sql
-- Campeonatos, part 0 bis: the avisos of a championship go through the waitlist outbox. Alone in its file
-- for the same reason as 20261006000100.
alter type public.notification_kind add value 'championship_added';
alter type public.notification_kind add value 'championship_promoted';
alter type public.notification_kind add value 'championship_moved';
alter type public.notification_kind add value 'championship_cancelled';
```

- [ ] **Step 5: Tablas, RLS, privilegios y el bucket del afiche**

`supabase/migrations/20261006000120_championships.sql`:
```sql
-- Campeonatos, part 1: the data. A championship has days of play (windows: a date, hours and courts) and
-- categories; pairs of players sign up to a category, and a pair without room waits in line. A player is
-- a member or someone from outside (a phone is one player). Every write goes through the functions of the
-- next migrations: authenticated only reads.

create type public.championship_status as enum
  ('draft', 'registration', 'closed', 'drawn', 'published', 'in_progress', 'finished', 'cancelled');
create type public.championship_gender as enum ('men', 'women', 'mixed', 'open');
create type public.championship_format as enum ('groups_knockout', 'knockout', 'round_robin');
create type public.championship_seeding as enum ('ranking', 'manual');
create type public.championship_category_status as enum ('open', 'cancelled', 'merged');
create type public.championship_entry_status as enum ('active', 'waiting', 'withdrawn', 'removed');

-- The people of the championships. A member has one row linked to her profile (made the first time she
-- plays one); someone from outside is a name and a phone.
create table public.players (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  -- Digits only (private.normalize_phone): 099123456, never +598 99 123 456.
  phone text check (phone ~ '^[0-9]{8,15}$'),
  email text check (email is null or (length(email) <= 254 and email ~ '^[^@ ]+@[^@ ]+$')),
  profile_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Target for the composite FKs of entries.
  unique (id, club_id),
  unique (club_id, profile_id)
);
create unique index players_one_per_phone on public.players (club_id, phone) where phone is not null;
create index players_profile_id_idx on public.players (profile_id);
alter table public.players enable row level security;

create table public.championships (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  rules text not null default '' check (length(rules) <= 5000),
  -- championship-posters/<club_id>/<file>, public like the club logo.
  poster_path text,
  status public.championship_status not null default 'draft',
  registration_opens_at timestamptz,
  -- By default 24 hours before the first day of play (open_championship_registration fills it in).
  registration_closes_at timestamptz,
  max_categories_per_player smallint not null default 2 check (max_categories_per_player between 1 and 5),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  -- Target for the composite FKs of windows and categories.
  unique (id, club_id),
  constraint championships_poster_in_own_folder check (
    poster_path is null or (split_part(poster_path, '/', 1) = club_id::text and length(poster_path) <= 200)
  ),
  constraint championships_open_has_deadline check (status in ('draft', 'cancelled') or registration_closes_at is not null),
  constraint championships_cancelled check ((status = 'cancelled') = (cancelled_at is not null))
);
create index championships_club_id_idx on public.championships (club_id);
alter table public.championships enable row level security;

-- A day and hours of play and the courts it takes. From the opening of registration each window blocks its
-- courts (court_occupancy of kind 'championship'); cancelling frees them.
create table public.championship_windows (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  championship_id uuid not null,
  on_date date not null,
  from_time time not null,
  to_time time not null,
  -- Array elements take no FK: the occupancies and private.guard_court_delete keep them honest.
  court_ids uuid[] not null,
  constraint championship_windows_championship_in_club
    foreign key (championship_id, club_id) references public.championships (id, club_id) on delete cascade,
  constraint championship_windows_times check (from_time < to_time),
  constraint championship_windows_courts check (
    cardinality(court_ids) between 1 and 20 and array_position(court_ids, null) is null
  )
);
create index championship_windows_championship_id_idx on public.championship_windows (championship_id);
alter table public.championship_windows enable row level security;

create table public.championship_categories (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  championship_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 40),
  gender public.championship_gender not null default 'open',
  -- The categories it is meant for (1ª a 8ª), as a reference: nobody checks the declared ones.
  level_min smallint check (level_min between 1 and 8),
  level_max smallint check (level_max between 1 and 8),
  min_pairs smallint not null default 4 check (min_pairs between 2 and 64),
  max_pairs smallint not null default 16 check (max_pairs between 2 and 64),
  -- Per pair.
  price integer not null check (price between 0 and 10000000),
  format public.championship_format not null default 'groups_knockout',
  group_size smallint not null default 4 check (group_size in (3, 4)),
  qualifiers_per_group smallint not null default 2,
  -- Sets, games, tie-break, the third set (a super tie-break to 10 by default) and golden point.
  match_rules jsonb not null default
    '{"sets": 3, "games": 6, "tiebreak": true, "third_set": "super_tiebreak", "super_tiebreak_points": 10, "golden_point": false}',
  match_minutes smallint not null default 90 check (match_minutes between 30 and 240),
  seeding public.championship_seeding not null default 'ranking',
  status public.championship_category_status not null default 'open',
  merged_into uuid references public.championship_categories (id) on delete set null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  -- Target for the composite FK of entries.
  unique (id, club_id),
  unique (championship_id, name),
  constraint championship_categories_championship_in_club
    foreign key (championship_id, club_id) references public.championships (id, club_id) on delete cascade,
  constraint championship_categories_levels check (
    (level_min is null) = (level_max is null) and (level_min is null or level_min <= level_max)
  ),
  constraint championship_categories_pairs check (min_pairs <= max_pairs),
  constraint championship_categories_qualifiers check (qualifiers_per_group between 1 and group_size - 1),
  constraint championship_categories_rules check (jsonb_typeof(match_rules) = 'object'),
  constraint championship_categories_merged check ((status = 'merged') = (merged_into is not null))
);
create index championship_categories_championship_id_idx on public.championship_categories (championship_id);
alter table public.championship_categories enable row level security;

-- A pair in a category. Leaving or being taken out keeps the row: its payments may need a refund.
create table public.championship_entries (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  category_id uuid not null,
  player1_id uuid not null,
  player2_id uuid not null,
  -- The category each one declares (1ª a 8ª); nobody checks it.
  player1_level smallint not null check (player1_level between 1 and 8),
  player2_level smallint not null check (player2_level between 1 and 8),
  status public.championship_entry_status not null default 'active',
  seed smallint check (seed >= 1),
  note text check (length(note) <= 300),
  unavailability_note text check (length(unavailability_note) <= 300),
  -- The organizer saved more than 40 % of the blocks for this pair.
  unavailability_approved boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  -- Also the order of the waiting line.
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.profiles (id) on delete set null,
  -- Target for the composite FKs of unavailability and payments.
  unique (id, club_id),
  constraint championship_entries_category_in_club
    foreign key (category_id, club_id) references public.championship_categories (id, club_id) on delete cascade,
  constraint championship_entries_player1_in_club
    foreign key (player1_id, club_id) references public.players (id, club_id),
  constraint championship_entries_player2_in_club
    foreign key (player2_id, club_id) references public.players (id, club_id),
  constraint championship_entries_two_players check (player1_id <> player2_id),
  constraint championship_entries_ended check ((status in ('withdrawn', 'removed')) = (ended_at is not null))
);
create index championship_entries_category_status_idx
  on public.championship_entries (category_id, status, created_at);
create index championship_entries_player1_id_idx on public.championship_entries (player1_id);
create index championship_entries_player2_id_idx on public.championship_entries (player2_id);
alter table public.championship_entries enable row level security;

-- The 2-hour blocks of the days of play a pair cannot play (private.championship_blocks makes them).
create table public.entry_unavailability (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  entry_id uuid not null,
  on_date date not null,
  from_time time not null,
  to_time time not null,
  constraint entry_unavailability_entry_in_club
    foreign key (entry_id, club_id) references public.championship_entries (id, club_id) on delete cascade,
  constraint entry_unavailability_times check (from_time < to_time),
  unique (entry_id, on_date, from_time)
);
alter table public.entry_unavailability enable row level security;

-- Each court a championship blocks points at it; cancelling deletes them.
alter table public.court_occupancy
  add column championship_id uuid references public.championships (id) on delete cascade,
  add constraint court_occupancy_championship_kind check (championship_id is null or kind = 'championship');
create index court_occupancy_championship_id_idx on public.court_occupancy (championship_id);
-- Members read which championship holds a court (never note, which stays for staff).
grant select (championship_id) on public.court_occupancy to authenticated;

-- A payment is for a booking, a tournament entry, a day use pass or a championship pair: exactly one.
alter table public.payments
  add column championship_entry_id uuid,
  add constraint payments_championship_entry_in_club
    foreign key (championship_entry_id, club_id) references public.championship_entries (id, club_id) on delete cascade;
alter table public.payments drop constraint payments_one_target;
alter table public.payments
  add constraint payments_one_target
    check (num_nonnulls(booking_id, tournament_entry_id, day_use_pass_id, championship_entry_id) = 1);
create index payments_championship_entry_id_idx on public.payments (championship_entry_id);
create unique index payments_one_reported_per_championship_entry on public.payments (championship_entry_id)
  where status = 'reported' and championship_entry_id is not null;

-- True when the caller is one of the two players of a pair (through her member row).
create function private.is_entry_player(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.championship_entries e
    join public.players p on p.id in (e.player1_id, e.player2_id)
    where e.id = p_entry_id and p.profile_id = (select auth.uid())
  );
$$;

-- A court a championship uses has history too.
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
    or exists (select 1 from public.championship_windows where old.id = any (court_ids))
  ) then
    perform private.fail('court_has_history');
  end if;
  return old;
end;
$$;

-- The pair's two players read its payments too, whoever paid.
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
    or (championship_entry_id is not null and private.is_entry_player(championship_entry_id))
  );

-- The poster: a public bucket, one folder per club (championship-posters/<club_id>/<file>). Staff upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('championship-posters', 'championship-posters', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy championship_posters_insert_staff on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'championship-posters'
    and private.has_club_role(private.folder_owner(name), array['admin', 'reception']::public.club_role[])
  );
create policy championship_posters_delete_staff on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'championship-posters'
    and private.has_club_role(private.folder_owner(name), array['admin', 'reception']::public.club_role[])
  );

revoke all on function private.is_entry_player(uuid) from public;
grant execute on function private.is_entry_player(uuid) to authenticated;

revoke all on public.players, public.championships, public.championship_windows, public.championship_categories,
  public.championship_entries, public.entry_unavailability from anon, authenticated;
grant select on public.championships, public.championship_windows, public.championship_categories,
  public.championship_entries, public.entry_unavailability to authenticated;
-- A phone or an email is for staff and the partner only (public.championship_contacts).
grant select (id, club_id, name, profile_id, created_at) on public.players to authenticated;

create policy players_select_members on public.players
  for select to authenticated using (private.is_club_member(club_id));
-- Staff read their drafts; members, every championship out of draft.
create policy championships_select on public.championships
  for select to authenticated
  using (
    private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
    or (status <> 'draft' and private.is_club_member(club_id))
  );
-- Days, categories and pairs follow their championship (the subquery goes through its RLS).
create policy championship_windows_select on public.championship_windows
  for select to authenticated
  using (exists (select 1 from public.championships ch where ch.id = championship_id));
create policy championship_categories_select on public.championship_categories
  for select to authenticated
  using (exists (select 1 from public.championships ch where ch.id = championship_id));
create policy championship_entries_select on public.championship_entries
  for select to authenticated
  using (exists (select 1 from public.championship_categories c where c.id = category_id));
-- When a pair cannot play is for the pair and for staff.
create policy entry_unavailability_select on public.entry_unavailability
  for select to authenticated
  using (
    private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
    or private.is_entry_player(entry_id)
  );
```

- [ ] **Step 6: Run test to verify it passes**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/championship_schema.test.sql
npm run test:db
```
Expected: PASS (28 tests) y el resto de los pgTAP sigue en verde (la política de `payments` cambió: los tests de pagos anteriores la cubren).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261006000100_championship_kind.sql supabase/migrations/20261006000110_championship_notification_kinds.sql supabase/migrations/20261006000120_championships.sql supabase/tests/database/helpers/championship.psql supabase/tests/database/championship_schema.test.sql
git commit -m "feat(db): championships, players, pairs and their RLS"
```

---

### Task 3: Tipos generados y el campeonato en la grilla

**Files:**
- Modify: `lib/supabase/database.types.ts` (generado)
- Modify: `lib/domain/grid.ts:7-20`, `lib/domain/grid.ts:52-60`, `lib/domain/grid.ts:124-147`
- Modify: `components/booking/cell-styles.ts`, `components/booking/legend.tsx`, `components/booking/slot-grid.tsx:175-183`
- Modify: `components/club/occupancy-detail-sheet.tsx:59-63`
- Modify: `lib/data/day.ts:74`
- Test: `tests/unit/lib/domain/grid.test.ts`, `tests/unit/components/booking/legend.test.tsx`

- [ ] **Step 1: Regenerate types**

Run: `npm run db:types`
Expected: aparecen `players`, `championships`, `championship_windows`, `championship_categories`, `championship_entries`, `entry_unavailability`, sus enums, `championship_id` en `court_occupancy` y `championship_entry_id` en `payments`, `"championship"` en `occupancy_kind` y los cuatro `championship_*` en `notification_kind`. `npm run typecheck` ahora falla en dos frentes: `OccupancyKind` (se arregla en esta Task) y `NotificationKind` (Task 4). **No se hace push hasta terminar la Task 4.**

- [ ] **Step 2: Write the failing tests**

In `tests/unit/lib/domain/grid.test.ts`, append at the end of the file:
```ts
describe('championships', () => {
  it('names a court a championship blocks, and members read which one', () => {
    expect(KIND_LABELS.championship).toBe('Campeonato')
    const row = {
      id: 'o1',
      court_id: 'court-1',
      kind: 'championship' as const,
      starts_at: '2026-10-17T11:00:00Z',
      ends_at: '2026-10-17T17:00:00Z',
      note: 'Campeonato de Primavera',
      championship_id: 'ch1',
    }
    expect(toOccupancy(row, 'player')).toMatchObject({ kind: 'championship', note: null, championshipId: 'ch1' })
    expect(toOccupancy(row, 'staff').note).toBe('Campeonato de Primavera')
  })
})
```
(`KIND_LABELS` y `toOccupancy` ya se importan en ese archivo desde la lista de espera.)

In `tests/unit/components/booking/legend.test.tsx`, in `it('explains the club grid', …)`, replace the expected text with:
```tsx
    expect(screen.getByRole('list', { name: 'Referencias' })).toHaveTextContent('ReservaTurno fijoBloqueoTorneoDay useRetenidoCampeonato')
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/domain/grid.test.ts tests/unit/components/booking/legend.test.tsx`
Expected: FAIL (`expected undefined to be 'Campeonato'` y no encuentra el texto "Campeonato").

- [ ] **Step 4: Write minimal implementation**

In `lib/domain/grid.ts`, replace the `OccupancyKind` line and the `Occupancy` type:
```ts
export type OccupancyKind = 'booking' | 'recurring' | 'tournament' | 'block' | 'match' | 'day_use' | 'hold' | 'championship'
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
  // The championship that blocks the court (kind 'championship'); members may read it.
  championshipId?: string | null
  // Until when a court is held for the waitlist (kind 'hold').
  expiresAt?: Date | null
}
```
In the same file, add `championship: 'Campeonato',` as the last entry of `KIND_LABELS`, and replace `OccupancyRow` and `toOccupancy`:
```ts
export type OccupancyRow = {
  id: string
  court_id: string
  kind: OccupancyKind
  starts_at: string | null
  ends_at: string | null
  note: string | null
  tournament_id?: string | null
  championship_id?: string | null
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
    ...(row.championship_id ? { championshipId: row.championship_id } : {}),
    ...(row.expires_at ? { expiresAt: new Date(row.expires_at) } : {}),
  }
}
```

In `components/booking/cell-styles.ts`, add after the `hold` line (a token pair that already passes the contrast test):
```ts
  championship: 'border-2 border-dashed border-accent bg-surface text-fg',
```

In `components/booking/legend.tsx`, add as the last item of `ITEMS.club`:
```ts
    ['championship', 'Campeonato'],
```

In `components/booking/slot-grid.tsx`, add as the last entry of `CLUB_STYLES`:
```ts
  championship: 'championship',
```

In `components/club/occupancy-detail-sheet.tsx`, right after the `occupancy.tournamentId ? (…) : null` block, add:
```tsx
        {occupancy.championshipId ? (
          <Link href={`/club/torneos/campeonatos/${occupancy.championshipId}`} className="font-semibold text-accent-ink underline">
            Gestionar campeonato
          </Link>
        ) : null}
```

In `lib/data/day.ts`, in the `court_occupancy` query, replace:
```ts
      .select('id, court_id, kind, starts_at, ends_at, tournament_id, expires_at')
```
with:
```ts
      .select('id, court_id, kind, starts_at, ends_at, tournament_id, championship_id, expires_at')
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/lib/domain/grid.test.ts tests/unit/components/booking/legend.test.tsx tests/unit/app/design-tokens.test.ts
npm test
```
Expected: PASS. `npm run typecheck` todavía falla solo por `NotificationKind` en `lib/data/waitlist.ts` y `lib/notify/outbox.ts` (Task 4).

- [ ] **Step 6: Commit (sin push)**

```bash
git add lib/supabase/database.types.ts lib/domain/grid.ts components/booking/cell-styles.ts components/booking/legend.tsx components/booking/slot-grid.tsx components/club/occupancy-detail-sheet.tsx lib/data/day.ts tests/unit/lib/domain/grid.test.ts tests/unit/components/booking/legend.test.tsx
git commit -m "feat(grid): championships block courts with their own look"
```

---

### Task 4: Avisos de campeonato (un solo punto para todos los avisos) y PR borrador

**Files:**
- Create: `lib/domain/championship-notifications.ts`
- Create: `lib/domain/notifications.ts`
- Modify: `lib/domain/waitlist.ts:18-28`, `lib/domain/waitlist.ts:151-163` (quita `NotificationRow`, `NotificationView` y `toNotificationView`, que se mudan)
- Modify: `lib/notify/messages.ts`, `lib/notify/send-pending.ts`, `lib/data/waitlist.ts`, `components/waitlist/notification-list.tsx`
- Test: `tests/unit/lib/domain/notifications.test.ts` (nuevo), `tests/unit/lib/domain/waitlist.test.ts`, `tests/unit/lib/notify/messages.test.ts`, `tests/unit/lib/notify/send-pending.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/notifications.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isNotificationStale, notificationContent, toNotificationView } from '@/lib/domain/notifications'

const TIMEZONE = 'America/Montevideo'
// Saturday 2026-10-03: 22:00 UTC is 19:00 in Montevideo; 20:42 UTC is 17:42.
const HELD = { court_name: 'Cancha 2', starts_at: '2026-10-03T22:00:00Z', expires_at: '2026-10-03T20:42:00Z' }
const ADDED = {
  championship_id: 'ch1',
  championship_name: 'Campeonato de Primavera',
  category_name: '6ta Libre',
  partner_name: 'Ana',
  waiting: false,
  starts_at: '2026-10-17T11:00:00Z',
}

describe('notificationContent', () => {
  it('keeps the words of the waitlist', () => {
    expect(notificationContent('slot_held', HELD, TIMEZONE)).toEqual({
      title: 'Se liberó tu turno: sáb 3, 19:00, Cancha 2',
      body: 'Te lo guardamos hasta las 17:42. Reservalo desde Inicio antes de que pase al siguiente de la lista.',
      button: 'Reservar ahora',
      reason: 'te escribimos porque te anotaste en la lista de espera.',
    })
    expect(notificationContent('slot_free_now', HELD, TIMEZONE)?.button).toBe('Ver el turno')
  })

  it('words each aviso of a championship', () => {
    expect(notificationContent('championship_added', ADDED, TIMEZONE)).toEqual({
      title: 'Te anotaron con Ana en 6ta Libre',
      body: 'Campeonato de Primavera. Si no podés jugar, date de baja desde el campeonato.',
      button: 'Ver el campeonato',
      reason: 'te escribimos por tu inscripción en un campeonato.',
    })
    expect(notificationContent('championship_added', { ...ADDED, waiting: true }, TIMEZONE)?.body).toBe(
      'Campeonato de Primavera. Quedaron en la lista de espera: si se libera un lugar, entran solos. Si no podés jugar, date de baja desde el campeonato.',
    )
    expect(notificationContent('championship_promoted', ADDED, TIMEZONE)).toMatchObject({
      title: 'Entraste a 6ta Libre desde la lista de espera',
      body: 'Campeonato de Primavera, con Ana. Ya tienen lugar: paguen la inscripción desde el campeonato.',
    })
    expect(notificationContent('championship_moved', { ...ADDED, waiting: true }, TIMEZONE)).toMatchObject({
      title: 'Tu pareja pasó a 6ta Libre',
      body: 'Campeonato de Primavera, con Ana. El club cambió la categoría. Quedaron en la lista de espera.',
    })
    expect(notificationContent('championship_cancelled', ADDED, TIMEZONE)).toMatchObject({
      title: 'Se canceló 6ta Libre',
      body: 'Campeonato de Primavera. Si ya pagaste, el club te devuelve la plata.',
    })
    expect(notificationContent('championship_cancelled', { ...ADDED, category_name: null }, TIMEZONE)).toMatchObject({
      title: 'Se canceló Campeonato de Primavera',
      body: 'Si ya pagaste, el club te devuelve la plata.',
    })
  })

  it('reads nothing it does not understand', () => {
    expect(notificationContent('championship_added', { category_name: '6ta' }, TIMEZONE)).toBeNull()
    expect(notificationContent('slot_held', ADDED, TIMEZONE)).toBeNull()
    expect(notificationContent('championship_added', null, TIMEZONE)).toBeNull()
  })
})

describe('isNotificationStale', () => {
  it('drops a hold that ran out and a championship that already started', () => {
    expect(isNotificationStale('slot_held', HELD, new Date('2026-10-03T20:41:00Z'))).toBe(false)
    expect(isNotificationStale('slot_held', HELD, new Date('2026-10-03T20:42:00Z'))).toBe(true)
    expect(isNotificationStale('championship_added', ADDED, new Date('2026-10-10T12:00:00Z'))).toBe(false)
    expect(isNotificationStale('championship_added', ADDED, new Date('2026-10-17T11:00:00Z'))).toBe(true)
    expect(isNotificationStale('championship_cancelled', { ...ADDED, starts_at: null }, new Date())).toBe(false)
    expect(isNotificationStale('championship_added', {}, new Date())).toBe(true)
  })
})

describe('toNotificationView', () => {
  it('turns a row into what /avisos shows', () => {
    const row = { id: 'n1', kind: 'slot_held' as const, data: HELD, link: '/', created_at: '2026-10-03T20:27:00Z', read_at: null }
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
    const championship = { ...row, kind: 'championship_added' as const, data: ADDED, link: '/campeonatos/ch1' }
    expect(toNotificationView(championship, TIMEZONE)?.title).toBe('Te anotaron con Ana en 6ta Libre')
  })
})
```

In `tests/unit/lib/domain/waitlist.test.ts`, delete the whole `it('turns a row into what /avisos shows', …)` block (it moved to `notifications.test.ts`) and remove `toNotificationView` from the import list at the top of the file.

In `tests/unit/lib/notify/messages.test.ts`, append inside `describe('buildEmail', …)`:
```ts
  it('mails an aviso of a championship with its own button and reason', () => {
    const mail = buildEmail(
      {
        ...HELD,
        kind: 'championship_added',
        data: {
          championship_id: 'ch1',
          championship_name: 'Campeonato de Primavera',
          category_name: '6ta Libre',
          partner_name: 'Bruno',
          waiting: false,
          starts_at: '2026-10-17T11:00:00Z',
        },
        link: '/campeonatos/ch1',
      },
      URLS,
    )!
    expect(mail.subject).toBe('Te anotaron con Bruno en 6ta Libre')
    expect(mail.text).toContain('Ver el campeonato: https://rustic.test/campeonatos/ch1')
    expect(mail.text).toContain('Rustic Pádel: te escribimos por tu inscripción en un campeonato.')
  })
```

In `tests/unit/lib/notify/send-pending.test.ts`, append inside `describe('sendPending', …)` (it reuses the file's `pending`, `fakeStore` and `OPTIONS`; `OPTIONS.now` is 2026-10-03 20:30 UTC):
```ts
  it('mails an aviso of a championship to come, and skips one of a championship that already started', async () => {
    const data = { championship_name: 'Campeonato T', category_name: 'Libre', partner_name: 'Bruno', waiting: false }
    const { store, finish } = fakeStore([
      pending('n1', { kind: 'championship_promoted', link: '/campeonatos/ch1', data: { ...data, starts_at: '2026-10-17T11:00:00Z' } }),
      pending('n2', { kind: 'championship_promoted', link: '/campeonatos/ch1', data: { ...data, starts_at: '2026-10-01T11:00:00Z' } }),
    ])
    const sender = vi.fn<EmailSender>(async () => {})
    expect(await sendPending(store, sender, OPTIONS)).toEqual({ sent: 1, failed: 0, skipped: 1 })
    expect(sender.mock.calls[0][0]).toMatchObject({ to: 'n1@test.local', subject: 'Entraste a Libre desde la lista de espera' })
    expect(finish.mock.calls).toEqual([
      ['n1', 'sent'],
      ['n2', 'skipped'],
    ])
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/domain/notifications.test.ts tests/unit/lib/notify`
Expected: FAIL (`Failed to resolve import "@/lib/domain/notifications"`; el mail de campeonato no se construye).

- [ ] **Step 3: Los textos de los avisos de campeonato**

`lib/domain/championship-notifications.ts`:
```ts
// The avisos of a championship. The database writes them (private.notify_championship_entry); the app
// shows them in /avisos and mails them with the same words.

export const CHAMPIONSHIP_NOTIFICATION_KINDS = [
  'championship_added',
  'championship_promoted',
  'championship_moved',
  'championship_cancelled',
] as const
export type ChampionshipNotificationKind = (typeof CHAMPIONSHIP_NOTIFICATION_KINDS)[number]

export type ChampionshipNotificationData = {
  championshipName: string
  // null when the whole championship was cancelled.
  categoryName: string | null
  partnerName: string | null
  waiting: boolean
  // The first match; null for a championship with no days of play.
  startsAt: Date | null
}

export function isChampionshipNotificationKind(kind: string): kind is ChampionshipNotificationKind {
  return (CHAMPIONSHIP_NOTIFICATION_KINDS as readonly string[]).includes(kind)
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

// The jsonb private.championship_notice_data writes; anything else reads as null.
export function readChampionshipNotificationData(data: unknown): ChampionshipNotificationData | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const record = data as Record<string, unknown>
  const championshipName = readText(record.championship_name)
  if (!championshipName) return null
  const startsAt = typeof record.starts_at === 'string' ? new Date(record.starts_at) : null
  return {
    championshipName,
    categoryName: readText(record.category_name),
    partnerName: readText(record.partner_name),
    waiting: record.waiting === true,
    startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : null,
  }
}

export function championshipNotificationText(
  kind: ChampionshipNotificationKind,
  data: ChampionshipNotificationData,
): { title: string; body: string } {
  const where = data.categoryName ?? data.championshipName
  const withPartner = data.partnerName ? `, con ${data.partnerName}` : ''
  switch (kind) {
    case 'championship_added':
      return {
        title: `Te anotaron con ${data.partnerName ?? 'tu compañero'} en ${where}`,
        body: `${data.championshipName}. ${data.waiting ? 'Quedaron en la lista de espera: si se libera un lugar, entran solos. ' : ''}Si no podés jugar, date de baja desde el campeonato.`,
      }
    case 'championship_promoted':
      return {
        title: `Entraste a ${where} desde la lista de espera`,
        body: `${data.championshipName}${withPartner}. Ya tienen lugar: paguen la inscripción desde el campeonato.`,
      }
    case 'championship_moved':
      return {
        title: `Tu pareja pasó a ${where}`,
        body: `${data.championshipName}${withPartner}. El club cambió la categoría.${data.waiting ? ' Quedaron en la lista de espera.' : ''}`,
      }
    case 'championship_cancelled':
      return {
        title: `Se canceló ${where}`,
        body: `${data.categoryName ? `${data.championshipName}. ` : ''}Si ya pagaste, el club te devuelve la plata.`,
      }
  }
}
```

- [ ] **Step 4: El punto único de los avisos**

`lib/domain/notifications.ts`:
```ts
import {
  championshipNotificationText,
  isChampionshipNotificationKind,
  readChampionshipNotificationData,
  type ChampionshipNotificationKind,
} from './championship-notifications'
import { notificationText, readNotificationData, type NotificationKind as WaitlistNotificationKind } from './waitlist'

// Every aviso the app shows in /avisos and mails: the waitlist's and the championships'.
export type NotificationKind = WaitlistNotificationKind | ChampionshipNotificationKind
export type NotificationContent = { title: string; body: string; button: string; reason: string }
export type NotificationRow = {
  id: string
  kind: NotificationKind
  data: unknown
  link: string
  created_at: string
  read_at: string | null
}
export type NotificationView = { id: string; title: string; body: string; link: string; createdAt: Date; unread: boolean }

// The same words in /avisos and in the mail, plus the mail's button and why we wrote. null when the data
// cannot be read.
export function notificationContent(kind: NotificationKind, data: unknown, timezone: string): NotificationContent | null {
  if (isChampionshipNotificationKind(kind)) {
    const read = readChampionshipNotificationData(data)
    if (!read) return null
    return {
      ...championshipNotificationText(kind, read),
      button: 'Ver el campeonato',
      reason: 'te escribimos por tu inscripción en un campeonato.',
    }
  }
  const read = readNotificationData(data)
  if (!read) return null
  return {
    ...notificationText(kind, read, timezone),
    button: kind === 'slot_held' ? 'Reservar ahora' : 'Ver el turno',
    reason: 'te escribimos porque te anotaste en la lista de espera.',
  }
}

// Too late to mail: the hold ran out, the slot or the championship already started.
export function isNotificationStale(kind: NotificationKind, data: unknown, now: Date): boolean {
  if (isChampionshipNotificationKind(kind)) {
    const read = readChampionshipNotificationData(data)
    if (!read) return true
    return read.startsAt !== null && read.startsAt.getTime() <= now.getTime()
  }
  const read = readNotificationData(data)
  if (!read) return true
  const deadline = kind === 'slot_held' ? read.expiresAt : read.startsAt
  return !deadline || deadline.getTime() <= now.getTime()
}

export function toNotificationView(row: NotificationRow, timezone: string): NotificationView | null {
  const content = notificationContent(row.kind, row.data, timezone)
  if (!content) return null
  return {
    id: row.id,
    title: content.title,
    body: content.body,
    link: row.link,
    createdAt: new Date(row.created_at),
    unread: row.read_at === null,
  }
}
```

- [ ] **Step 5: La lista de espera usa el punto único**

In `lib/domain/waitlist.ts`, delete the `NotificationRow` and `NotificationView` types (lines 20-28) and the whole `toNotificationView` function (lines 151-163). `NotificationKind`, `NotificationData`, `readNotificationData`, `notificationText` and `unreadLabel` stay.

In `components/waitlist/notification-list.tsx`, replace:
```ts
import type { NotificationView } from '@/lib/domain/waitlist'
```
with:
```ts
import type { NotificationView } from '@/lib/domain/notifications'
```

In `lib/data/waitlist.ts`, remove `toNotificationView` and `type NotificationView` from the import of `@/lib/domain/waitlist` and add:
```ts
import { toNotificationView, type NotificationView } from '@/lib/domain/notifications'
```

Replace `lib/notify/messages.ts` from the first import down to the `const html = [` line with (the HTML lines and the end of the function stay as they are):
```ts
import { clubLogoUrl } from '@/lib/domain/club-logo'
import { notificationContent, type NotificationKind } from '@/lib/domain/notifications'
import { firstName } from '@/lib/domain/profile'
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
  const content = notificationContent(item.kind, item.data, item.clubTimezone)
  if (!item.email || !content) return null
  const { title, body, button } = content
  const link = `${urls.siteUrl}${item.link}`
  const logo = clubLogoUrl(urls.supabaseUrl, item.clubLogoPath)
  const greeting = `Hola, ${firstName(item.playerName)}:`
  const footer = `${item.clubName}: ${content.reason}`
  const brand = logo
    ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(item.clubName)}" width="56" height="56" style="display:block;border-radius:12px;margin:0 0 16px">`
    : `<p style="margin:0 0 16px;font-weight:bold;color:${COLORS.accent}">${escapeHtml(item.clubName)}</p>`

```

In `lib/notify/send-pending.ts`, replace the first import and the `isStale` function with:
```ts
import { isNotificationStale } from '@/lib/domain/notifications'
```
```ts
// Too late to be useful: the hold ran out, or the slot or the championship already started.
function isStale(item: PendingEmail, now: Date): boolean {
  return isNotificationStale(item.kind, item.data, now)
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/lib/domain/notifications.test.ts tests/unit/lib/domain/waitlist.test.ts tests/unit/lib/notify tests/unit/components/waitlist
npm run typecheck
npm test
npm run lint
```
Expected: PASS; `typecheck` ya no se queja (`kind` de la base entra en `NotificationKind`).

- [ ] **Step 7: Commit, push y PR borrador**

```bash
git add lib/domain/championship-notifications.ts lib/domain/notifications.ts lib/domain/waitlist.ts lib/notify/messages.ts lib/notify/send-pending.ts lib/data/waitlist.ts components/waitlist/notification-list.tsx tests/unit/lib/domain/notifications.test.ts tests/unit/lib/domain/waitlist.test.ts tests/unit/lib/notify/messages.test.ts tests/unit/lib/notify/send-pending.test.ts
git commit -m "feat(avisos): championship avisos through the same outbox"
git push -u origin feat/campeonatos-inscripcion
```
Abrir el PR borrador desde GitHub (`gh` no está instalado): base `main`, título "Campeonatos: configuración e inscripción", cuerpo:
```text
Plan: docs/features/campeonatos-inscripcion/plan.md. Se marca listo al final (Task 31).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
Expected: PR borrador creado; CI corre en cada push.

---
## Corte 2: RPCs

### Task 5: El borrador: crear, días de juego, categorías, afiche y buscador de compañeros

**Files:**
- Create: `supabase/tests/database/championship_setup.test.sql`
- Create: `supabase/migrations/20261006000130_championship_setup.sql`

- [ ] **Step 1: Write the failing test** (con la herramienta Write)

`supabase/tests/database/championship_setup.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(28);

-- Juli keeps her profile private; a poster was already uploaded; C1 is a draft for Ana to try.
update public.profiles set is_public = false where id = '00000000-0000-0000-0000-0000000000a5';
insert into storage.objects (bucket_id, name)
values ('championship-posters', 'a0000000-0000-0000-0000-000000000001/poster-1.png');
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001', 'draft', null);

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.create_championship('a0000000-0000-0000-0000-000000000001', 'Primavera',
       'Se juega al mejor de 3 sets.', 2) $$,
  'staff create a championship');
select results_eq(
  $$ select status::text, created_by, rules from public.championships where name = 'Primavera' $$,
  $$ values ('draft', '00000000-0000-0000-0000-0000000000c1'::uuid, 'Se juega al mejor de 3 sets.') $$,
  'as a draft, with its rules');
select throws_ok(
  $$ select public.create_championship('a0000000-0000-0000-0000-000000000001', '   ') $$,
  'P0001', 'invalid_input', 'a championship has a name');
select throws_ok(
  $$ select public.create_championship('a0000000-0000-0000-0000-000000000001', 'Pasado', '', 2,
       now() - interval '1 hour') $$,
  'P0001', 'in_the_past', 'its registration cannot close in the past');

select lives_ok(
  $$ select public.add_championship_window((select id from public.championships where name = 'Primavera'),
       test_helpers.today() + 10, '08:00', '14:00',
       array['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002']::uuid[]) $$,
  'staff add a day of play');
select throws_ok(
  $$ select public.add_championship_window((select id from public.championships where name = 'Primavera'),
       test_helpers.today() + 10, '11:00', '17:00', array['c0000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'P0001', 'courts_busy', 'two days of play do not overlap on a court');
select throws_ok(
  $$ select public.add_championship_window((select id from public.championships where name = 'Primavera'),
       test_helpers.today() + 10, '21:30', '24:00', array['c0000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'P0001', 'outside_hours', 'a day of play fits the club''s hours');
select throws_ok(
  $$ select public.add_championship_window((select id from public.championships where name = 'Primavera'),
       test_helpers.today() - 1, '08:00', '14:00', array['c0000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'P0001', 'in_the_past', 'and is in the future');
select throws_ok(
  $$ select public.add_championship_window((select id from public.championships where name = 'Primavera'),
       test_helpers.today() + 11, '08:00', '14:00', array['cb000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'P0001', 'invalid_input', 'on courts of the club');
select lives_ok(
  $$ select public.add_championship_window((select id from public.championships where name = 'Primavera'),
       test_helpers.today() + 11, '14:00', '20:00', array['c0000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'a second day of play');
select is((select count(*)::int from public.championship_windows), 2, 'two days of play');

select lives_ok(
  $$ select public.add_championship_category(
       p_championship_id => (select id from public.championships where name = 'Primavera'), p_name => 'Libre',
       p_gender => 'open', p_level_min => null, p_level_max => null, p_min_pairs => 4, p_max_pairs => 12,
       p_price => 2000, p_format => 'groups_knockout', p_group_size => 4, p_qualifiers => 2, p_match_minutes => 90,
       p_seeding => 'ranking', p_third_set => 'super_tiebreak', p_golden_point => false) $$,
  'staff add a category');
select results_eq(
  $$ select sort_order::int, match_rules ->> 'third_set', price from public.championship_categories
     where name = 'Libre' $$,
  $$ values (0, 'super_tiebreak', 2000) $$,
  'with its rules of play and its price per pair');
select throws_ok(
  $$ select public.add_championship_category(
       p_championship_id => (select id from public.championships where name = 'Primavera'), p_name => 'Libre',
       p_gender => 'open', p_level_min => null, p_level_max => null, p_min_pairs => 4, p_max_pairs => 12,
       p_price => 2000, p_format => 'groups_knockout', p_group_size => 4, p_qualifiers => 2, p_match_minutes => 90,
       p_seeding => 'ranking', p_third_set => 'super_tiebreak', p_golden_point => false) $$,
  'P0001', 'category_exists', 'two categories of a championship have different names');
select throws_ok(
  $$ select public.add_championship_category(
       p_championship_id => (select id from public.championships where name = 'Primavera'), p_name => 'Al revés',
       p_gender => 'open', p_level_min => null, p_level_max => null, p_min_pairs => 8, p_max_pairs => 4,
       p_price => 2000, p_format => 'groups_knockout', p_group_size => 4, p_qualifiers => 2, p_match_minutes => 90,
       p_seeding => 'ranking', p_third_set => 'super_tiebreak', p_golden_point => false) $$,
  'P0001', 'invalid_input', 'the minimum of pairs is not over the maximum');
select lives_ok(
  $$ select public.add_championship_category(
       p_championship_id => (select id from public.championships where name = 'Primavera'), p_name => 'Damas',
       p_gender => 'women', p_level_min => 5, p_level_max => 6, p_min_pairs => 4, p_max_pairs => 8,
       p_price => 1800, p_format => 'round_robin', p_group_size => 3, p_qualifiers => 1, p_match_minutes => 60,
       p_seeding => 'manual', p_third_set => 'full', p_golden_point => true) $$,
  'a second category');
select is((select sort_order::int from public.championship_categories where name = 'Damas'), 1,
  'listed after the first one');
select lives_ok(
  $$ select public.delete_championship_category((select id from public.championship_categories where name = 'Damas')) $$,
  'a draft category can be deleted');
select is((select count(*)::int from public.championship_categories), 1, 'one category left');
select lives_ok(
  $$ select public.delete_championship_window((select id from public.championship_windows
       where on_date = test_helpers.today() + 11)) $$,
  'a draft day of play can be deleted');
select lives_ok(
  $$ select public.update_championship((select id from public.championships where name = 'Primavera'),
       'Primavera 2026', 'Se juega al mejor de 3 sets.', 1) $$,
  'staff edit the championship');
select throws_ok(
  $$ select public.set_championship_poster((select id from public.championships where name = 'Primavera 2026'),
       'a0000000-0000-0000-0000-000000000001/poster-2.png') $$,
  'P0001', 'invalid_input', 'a poster that was not uploaded is refused');
select lives_ok(
  $$ select public.set_championship_poster((select id from public.championships where name = 'Primavera 2026'),
       'a0000000-0000-0000-0000-000000000001/poster-1.png') $$,
  'staff set the poster');
select is((select poster_path from public.championships where name = 'Primavera 2026'),
  'a0000000-0000-0000-0000-000000000001/poster-1.png', 'the championship points at it');

-- Ana, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.create_championship('a0000000-0000-0000-0000-000000000001', 'Mío') $$,
  'P0001', 'forbidden', 'a player creates no championships');
select throws_ok(
  $$ select public.add_championship_window('c1a00000-0000-0000-0000-000000000001', test_helpers.today() + 10,
       '08:00', '14:00', array['c0000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'P0001', 'forbidden', 'nor edits them');
select set_eq(
  $$ select name from public.member_directory('a0000000-0000-0000-0000-000000000001') $$,
  array['Bruno', 'carla', 'dani', 'Gabi', 'Hugo', 'Iván'],
  'a member finds the other members with a public profile, to pick a partner');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';

select is((select count(*)::int from public.member_directory('a0000000-0000-0000-0000-000000000001')), 0,
  'someone outside the club finds nobody');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/championship_setup.test.sql`
Expected: FAIL (`function public.create_championship(…) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261006000130_championship_setup.sql`:
```sql
-- Campeonatos, part 2: the draft. Staff create a championship and add its days of play, its categories and
-- its poster; members find a partner among the club's members; phones go only to staff and to the pair.

-- Locks a championship.
create function private.lock_championship(p_championship_id uuid)
returns public.championships
language plpgsql
set search_path = ''
as $$
declare
  v_championship public.championships;
begin
  select * into v_championship from public.championships where id = p_championship_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  return v_championship;
end;
$$;

-- Locks a championship and checks the caller is staff of its club.
create function private.staff_championship(p_championship_id uuid)
returns public.championships
language plpgsql
set search_path = ''
as $$
declare
  v_championship public.championships := private.lock_championship(p_championship_id);
begin
  if not private.is_staff(v_championship.club_id) then
    perform private.fail('forbidden');
  end if;
  return v_championship;
end;
$$;

-- A day of play as an instant range, on the club's clock.
create function private.window_period(p_window public.championship_windows, p_timezone text)
returns tstzrange
language sql
stable
set search_path = ''
as $$
  select tstzrange((p_window.on_date + p_window.from_time) at time zone p_timezone,
                   (p_window.on_date + p_window.to_time) at time zone p_timezone);
$$;

-- When the first match can start: the start of the first day of play (null without days).
create function private.championship_starts_at(p_championship_id uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select min(lower(private.window_period(w, c.timezone)))
  from public.championship_windows w
  join public.clubs c on c.id = w.club_id
  where w.championship_id = p_championship_id;
$$;

create function public.create_championship(
  p_club_id uuid,
  p_name text,
  p_rules text default '',
  p_max_categories integer default 2,
  p_registration_closes_at timestamptz default null
)
returns public.championships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(p_name);
  v_rules text := coalesce(trim(p_rules), '');
  v_championship public.championships;
begin
  if not private.is_staff(p_club_id) then
    perform private.fail('forbidden');
  end if;
  if v_name is null or length(v_name) not between 1 and 80 or length(v_rules) > 5000
     or p_max_categories is null or p_max_categories not between 1 and 5 then
    perform private.fail('invalid_input');
  end if;
  if p_registration_closes_at is not null and p_registration_closes_at <= now() then
    perform private.fail('in_the_past');
  end if;

  insert into public.championships (club_id, name, rules, max_categories_per_player, registration_closes_at, created_by)
  values (p_club_id, v_name, v_rules, p_max_categories, p_registration_closes_at, (select auth.uid()))
  returning * into v_championship;
  return v_championship;
end;
$$;

-- Name, rules, the categories limit and the deadline. Once registration opened there is always a deadline
-- (an empty one keeps the current one), and it is not after the first match.
create function public.update_championship(
  p_championship_id uuid,
  p_name text,
  p_rules text default '',
  p_max_categories integer default 2,
  p_registration_closes_at timestamptz default null
)
returns public.championships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
  v_name text := trim(p_name);
  v_rules text := coalesce(trim(p_rules), '');
  v_closes timestamptz;
begin
  if v_championship.status in ('finished', 'cancelled') then
    perform private.fail('invalid_state');
  end if;
  if v_name is null or length(v_name) not between 1 and 80 or length(v_rules) > 5000
     or p_max_categories is null or p_max_categories not between 1 and 5 then
    perform private.fail('invalid_input');
  end if;
  v_closes := case
    when v_championship.status = 'draft' then p_registration_closes_at
    else coalesce(p_registration_closes_at, v_championship.registration_closes_at)
  end;
  if v_closes is distinct from v_championship.registration_closes_at and v_closes <= now() then
    perform private.fail('in_the_past');
  end if;
  if v_championship.status <> 'draft' and v_closes > private.championship_starts_at(v_championship.id) then
    perform private.fail('invalid_input');
  end if;

  update public.championships
     set name = v_name, rules = v_rules, max_categories_per_player = p_max_categories,
         registration_closes_at = v_closes
   where id = v_championship.id
  returning * into v_championship;
  return v_championship;
end;
$$;

-- A day of play of a draft: a future date, inside the club's hours, on active courts of the club, and not
-- over another day of the same championship on a shared court.
create function public.add_championship_window(
  p_championship_id uuid,
  p_date date,
  p_from time,
  p_to time,
  p_court_ids uuid[]
)
returns public.championship_windows
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
  v_club public.clubs;
  v_window public.championship_windows;
begin
  if v_championship.status <> 'draft' then
    perform private.fail('invalid_state');
  end if;
  select * into v_club from public.clubs where id = v_championship.club_id;
  if p_date is null or p_from is null or p_to is null or p_from >= p_to
     or p_court_ids is null or cardinality(p_court_ids) not between 1 and 20
     or array_position(p_court_ids, null) is not null
     or (select count(distinct u.court_id) from unnest(p_court_ids) as u (court_id)) <> cardinality(p_court_ids)
     or exists (
       select 1 from unnest(p_court_ids) as u (court_id)
       where not exists (
         select 1 from public.courts c where c.id = u.court_id and c.club_id = v_club.id and c.is_active
       )
     ) then
    perform private.fail('invalid_input');
  end if;
  if p_from < v_club.opens_at or p_to > v_club.closes_at then
    perform private.fail('outside_hours');
  end if;
  if (p_date + p_from) at time zone v_club.timezone <= now() then
    perform private.fail('in_the_past');
  end if;
  if exists (
    select 1 from public.championship_windows w
    where w.championship_id = v_championship.id and w.on_date = p_date
      and w.from_time < p_to and w.to_time > p_from and w.court_ids && p_court_ids
  ) then
    perform private.fail('courts_busy');
  end if;

  insert into public.championship_windows (club_id, championship_id, on_date, from_time, to_time, court_ids)
  values (v_championship.club_id, v_championship.id, p_date, p_from, p_to, p_court_ids)
  returning * into v_window;
  return v_window;
end;
$$;

create function public.delete_championship_window(p_window_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window public.championship_windows;
  v_championship public.championships;
begin
  select * into v_window from public.championship_windows where id = p_window_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.staff_championship(v_window.championship_id);
  if v_championship.status <> 'draft' then
    perform private.fail('invalid_state');
  end if;
  delete from public.championship_windows where id = v_window.id;
end;
$$;

-- The levels go last, with defaults: a category without them leaves them out.
create function public.add_championship_category(
  p_championship_id uuid,
  p_name text,
  p_gender public.championship_gender,
  p_min_pairs integer,
  p_max_pairs integer,
  p_price integer,
  p_format public.championship_format,
  p_group_size integer,
  p_qualifiers integer,
  p_match_minutes integer,
  p_seeding public.championship_seeding,
  p_third_set text,
  p_golden_point boolean,
  p_level_min integer default null,
  p_level_max integer default null
)
returns public.championship_categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
  v_name text := trim(p_name);
  v_category public.championship_categories;
begin
  if v_championship.status <> 'draft' then
    perform private.fail('invalid_state');
  end if;
  if v_name is null or length(v_name) not between 1 and 40
     or p_gender is null or p_format is null or p_seeding is null
     or (p_level_min is null) <> (p_level_max is null)
     or (p_level_min is not null
         and (p_level_min not between 1 and 8 or p_level_max not between 1 and 8 or p_level_min > p_level_max))
     or p_min_pairs is null or p_max_pairs is null
     or p_min_pairs not between 2 and 64 or p_max_pairs not between 2 and 64 or p_min_pairs > p_max_pairs
     or p_price is null or p_price not between 0 and 10000000
     or p_group_size is null or p_group_size not in (3, 4)
     or p_qualifiers is null or p_qualifiers not between 1 and p_group_size - 1
     or p_match_minutes is null or p_match_minutes not between 30 and 240
     or p_third_set is null or p_third_set not in ('super_tiebreak', 'full')
     or p_golden_point is null then
    perform private.fail('invalid_input');
  end if;

  begin
    insert into public.championship_categories (club_id, championship_id, name, gender, level_min, level_max,
                                                min_pairs, max_pairs, price, format, group_size,
                                                qualifiers_per_group, match_rules, match_minutes, seeding,
                                                sort_order)
    values (v_championship.club_id, v_championship.id, v_name, p_gender, p_level_min, p_level_max, p_min_pairs,
            p_max_pairs, p_price, p_format, p_group_size, p_qualifiers,
            jsonb_build_object('sets', 3, 'games', 6, 'tiebreak', true, 'third_set', p_third_set,
                               'super_tiebreak_points', 10, 'golden_point', p_golden_point),
            p_match_minutes, p_seeding,
            coalesce((select max(c.sort_order) + 1 from public.championship_categories c
                      where c.championship_id = v_championship.id), 0))
    returning * into v_category;
  exception when unique_violation then
    perform private.fail('category_exists');
  end;
  return v_category;
end;
$$;

create function public.delete_championship_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category public.championship_categories;
  v_championship public.championships;
begin
  select * into v_category from public.championship_categories where id = p_category_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.staff_championship(v_category.championship_id);
  if v_championship.status <> 'draft' then
    perform private.fail('invalid_state');
  end if;
  delete from public.championship_categories where id = v_category.id;
end;
$$;

-- The poster is uploaded from the browser (championship-posters/<club_id>/...); this points at it, or
-- removes it with an empty path.
create function public.set_championship_poster(p_championship_id uuid, p_path text)
returns public.championships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
  v_path text := nullif(trim(p_path), '');
begin
  if v_championship.status = 'cancelled' then
    perform private.fail('invalid_state');
  end if;
  if v_path is not null and (
    split_part(v_path, '/', 1) <> v_championship.club_id::text
    or position('..' in v_path) > 0
    or length(v_path) > 200
    or not exists (select 1 from storage.objects o where o.bucket_id = 'championship-posters' and o.name = v_path)
  ) then
    perform private.fail('invalid_input');
  end if;
  update public.championships set poster_path = v_path where id = v_championship.id returning * into v_championship;
  return v_championship;
end;
$$;

-- To pick a partner: the other members of the club whose profile is public. Nobody else gets a row.
create function public.member_directory(p_club_id uuid)
returns table (user_id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, p.display_name
  from public.club_members m
  join public.profiles p on p.id = m.user_id
  where m.club_id = p_club_id
    and private.is_club_member(p_club_id)
    and m.user_id <> (select auth.uid())
    and p.is_public
  order by p.display_name;
$$;

-- The phones and emails of a championship's players: every one for staff; for a member, those of her pairs.
create function public.championship_contacts(p_championship_id uuid)
returns table (player_id uuid, phone text, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct pl.id, pl.phone, pl.email
  from public.championship_entries e
  join public.championship_categories c on c.id = e.category_id
  join public.championships ch on ch.id = c.championship_id
  join public.players pl on pl.id in (e.player1_id, e.player2_id)
  where ch.id = p_championship_id
    and (private.is_staff(ch.club_id) or private.is_entry_player(e.id));
$$;

revoke all on function private.lock_championship(uuid) from public;
revoke all on function private.staff_championship(uuid) from public;
revoke all on function private.window_period(public.championship_windows, text) from public;
revoke all on function private.championship_starts_at(uuid) from public;
revoke execute on function public.create_championship(uuid, text, text, integer, timestamptz) from public, anon;
revoke execute on function public.update_championship(uuid, text, text, integer, timestamptz) from public, anon;
revoke execute on function public.add_championship_window(uuid, date, time, time, uuid[]) from public, anon;
revoke execute on function public.delete_championship_window(uuid) from public, anon;
revoke execute on function public.add_championship_category(uuid, text, public.championship_gender, integer, integer,
  integer, public.championship_format, integer, integer, integer, public.championship_seeding, text, boolean,
  integer, integer) from public, anon;
revoke execute on function public.delete_championship_category(uuid) from public, anon;
revoke execute on function public.set_championship_poster(uuid, text) from public, anon;
revoke execute on function public.member_directory(uuid) from public, anon;
revoke execute on function public.championship_contacts(uuid) from public, anon;
grant execute on function public.create_championship(uuid, text, text, integer, timestamptz) to authenticated;
grant execute on function public.update_championship(uuid, text, text, integer, timestamptz) to authenticated;
grant execute on function public.add_championship_window(uuid, date, time, time, uuid[]) to authenticated;
grant execute on function public.delete_championship_window(uuid) to authenticated;
grant execute on function public.add_championship_category(uuid, text, public.championship_gender, integer, integer,
  integer, public.championship_format, integer, integer, integer, public.championship_seeding, text, boolean,
  integer, integer) to authenticated;
grant execute on function public.delete_championship_category(uuid) to authenticated;
grant execute on function public.set_championship_poster(uuid, text) to authenticated;
grant execute on function public.member_directory(uuid) to authenticated;
grant execute on function public.championship_contacts(uuid) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/championship_setup.test.sql
```
Expected: PASS (28 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261006000130_championship_setup.sql supabase/tests/database/championship_setup.test.sql
git commit -m "feat(db): draft championships, days of play, categories and poster"
```

---

### Task 6: Anotarse, cargar parejas, bajas, quitar, mover y la lista de espera

**Files:**
- Create: `supabase/tests/database/championship_entries.test.sql`
- Create: `supabase/migrations/20261006000140_championship_entries.sql`

- [ ] **Step 1: Write the failing test** (con la herramienta Write)

`supabase/tests/database/championship_entries.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(36);

-- C1: open until 5 days from now, 2 categories per player, a day of play on day 10. K1 'Libre' takes 2 pairs
-- (Bruno and Lucía are in); K2 '5ta' and K3 '6ta' take 4.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001',
  'Libre', 2);
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000001', '5ta');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000003', 'c1a00000-0000-0000-0000-000000000001', '6ta');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
-- C2: still 'registration', but its deadline passed; Juli and Raúl are in.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000002', 'registration', now() - interval '1 hour');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000004', 'c1a00000-0000-0000-0000-000000000002');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000004',
  'c4a00000-0000-0000-0000-0000000000a5', 'c4a00000-0000-0000-0000-000000000f06');
-- C3 was drawn: too late for any change; Iván and Olga are in.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000003', 'drawn');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000005', 'c1a00000-0000-0000-0000-000000000003');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000005',
  'c4a00000-0000-0000-0000-0000000000a4', 'c4a00000-0000-0000-0000-000000000f05');

set local role authenticated;

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000001', 5, 6,
       p_partner_name => 'Sofía', p_partner_phone => '+598 99 222 333') $$,
  'a member signs up with a partner from outside');
select results_eq(
  $$ select player1_id, status::text from public.championship_entries
     where category_id = 'c2a00000-0000-0000-0000-000000000001'
       and player1_id = 'c4a00000-0000-0000-0000-0000000000a1' $$,
  $$ values ('c4a00000-0000-0000-0000-0000000000a1'::uuid, 'active') $$,
  'as her own player row, with a place');
select ok(
  exists (select 1 from public.championship_contacts('c1a00000-0000-0000-0000-000000000001') where phone = '099222333'),
  'the partner''s phone, normalized, goes to the pair');
select ok(
  not exists (select 1 from public.championship_contacts('c1a00000-0000-0000-0000-000000000001') where phone = '099111002'),
  'but not the phones of other pairs');
select throws_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000001', 5, 5,
       p_partner_name => 'Pedro', p_partner_phone => '099111001') $$,
  'P0001', 'already_in_category', 'nobody is in two pairs of a category');
select lives_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000002', 5, 5,
       p_partner_profile_id => '00000000-0000-0000-0000-0000000000a5') $$,
  'a member signs up with a member');
select throws_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000003', 5, 5,
       p_partner_profile_id => '00000000-0000-0000-0000-0000000000a4') $$,
  'P0001', 'too_many_categories', 'nobody plays more categories than the championship allows');
select throws_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000003', 5, 5,
       p_partner_profile_id => '00000000-0000-0000-0000-0000000000a1') $$,
  'P0001', 'same_player', 'a pair is two different players');
select throws_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000003', 5, 5,
       p_partner_name => 'Corto', p_partner_phone => '123') $$,
  'P0001', 'invalid_phone', 'a phone has 8 to 15 digits');
select throws_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000003', 5, 5,
       p_partner_profile_id => '00000000-0000-0000-0000-0000000000f1') $$,
  'P0001', 'partner_not_member', 'a partner picked as a member is one');
select throws_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000004', 5, 5,
       p_partner_name => 'Pedro', p_partner_phone => '099111001') $$,
  'P0001', 'championship_closed', 'nobody signs up after the deadline');
select is(test_helpers.notices('00000000-0000-0000-0000-0000000000a5', 'championship_added'), 1,
  'the member partner gets an aviso');
select is(test_helpers.last_notice('00000000-0000-0000-0000-0000000000a5', 'championship_added') ->> 'partner_name',
  'Ana', 'that says with whom');
select is(test_helpers.notices('00000000-0000-0000-0000-0000000000a1', 'championship_added'), 0,
  'whoever signed up gets none');

-- Gabi
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';

select lives_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000001', 5, 4,
       p_partner_profile_id => '00000000-0000-0000-0000-0000000000a3') $$,
  'a pair signs up to a full category');
select is(
  test_helpers.entry_status((select id from public.championship_entries
    where category_id = 'c2a00000-0000-0000-0000-000000000001'
      and player1_id = 'c4a00000-0000-0000-0000-0000000000a2')),
  'waiting', 'and waits in line');
select is(test_helpers.last_notice('00000000-0000-0000-0000-0000000000a3', 'championship_added') ->> 'waiting',
  'true', 'the partner''s aviso says they are waiting');

-- Iván
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a4", "role": "authenticated"}';

select lives_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000002', 5, 5,
       p_partner_name => 'Otro nombre', p_partner_phone => '099 111 001') $$,
  'a member signs up with a phone that is already a player');
select results_eq(
  $$ select player2_id from public.championship_entries
     where category_id = 'c2a00000-0000-0000-0000-000000000002'
       and player1_id = 'c4a00000-0000-0000-0000-0000000000a4' $$,
  $$ values ('c4a00000-0000-0000-0000-000000000f01'::uuid) $$,
  'a phone is one player: Pedro');

-- Omar, not a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';

select throws_ok(
  $$ select public.register_championship_pair('c2a00000-0000-0000-0000-000000000002', 5, 5,
       p_partner_name => 'Alguien', p_partner_phone => '099777888') $$,
  'P0001', 'forbidden', 'only members sign up');

-- Bruno
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select throws_ok(
  $$ select public.withdraw_championship_entry((select id from public.championship_entries
       where category_id = 'c2a00000-0000-0000-0000-000000000002'
         and player1_id = 'c4a00000-0000-0000-0000-0000000000a1')) $$,
  'P0001', 'forbidden', 'a player withdraws only her own pairs');

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.withdraw_championship_entry((select id from public.championship_entries
       where category_id = 'c2a00000-0000-0000-0000-000000000001'
         and player1_id = 'c4a00000-0000-0000-0000-0000000000a1')) $$,
  'a player withdraws before the deadline');
select is(
  test_helpers.entry_status((select id from public.championship_entries
    where category_id = 'c2a00000-0000-0000-0000-000000000001'
      and player1_id = 'c4a00000-0000-0000-0000-0000000000a1')),
  'withdrawn', 'her pair is out');
select is(
  test_helpers.entry_status((select id from public.championship_entries
    where category_id = 'c2a00000-0000-0000-0000-000000000001'
      and player1_id = 'c4a00000-0000-0000-0000-0000000000a2')),
  'active', 'and the first in line gets in');
select is(
  test_helpers.notices('00000000-0000-0000-0000-0000000000a2', 'championship_promoted')
    + test_helpers.notices('00000000-0000-0000-0000-0000000000a3', 'championship_promoted'),
  2, 'both of them get an aviso');

-- Juli
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a5", "role": "authenticated"}';

select throws_ok(
  $$ select public.withdraw_championship_entry('c3a00000-0000-0000-0000-000000000004') $$,
  'P0001', 'championship_closed', 'after the deadline only the organizer takes a pair out');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.remove_championship_entry('c3a00000-0000-0000-0000-000000000004') $$,
  'staff take a pair out after the deadline');
select lives_ok(
  $$ select public.add_championship_pair('c2a00000-0000-0000-0000-000000000001', 5, 5,
       p_player1_name => 'Marta', p_player1_phone => '099111003',
       p_player2_name => 'Tomás', p_player2_phone => '099555666') $$,
  'staff load a whole pair from outside');
select is(
  test_helpers.entry_status((select id from public.championship_entries
    where category_id = 'c2a00000-0000-0000-0000-000000000001'
      and player1_id = 'c4a00000-0000-0000-0000-000000000f03')),
  'waiting', 'it waits: the category is full again');
select lives_ok(
  $$ select public.move_championship_entry((select id from public.championship_entries
       where player1_id = 'c4a00000-0000-0000-0000-000000000f03'), 'c2a00000-0000-0000-0000-000000000003') $$,
  'staff move a pair to another category');
select results_eq(
  $$ select category_id, status::text from public.championship_entries
     where player1_id = 'c4a00000-0000-0000-0000-000000000f03' $$,
  $$ values ('c2a00000-0000-0000-0000-000000000003'::uuid, 'active') $$,
  'with a place there');
select lives_ok(
  $$ select public.move_championship_entry((select id from public.championship_entries
       where player1_id = 'c4a00000-0000-0000-0000-0000000000a2'), 'c2a00000-0000-0000-0000-000000000002') $$,
  'a pair of members moves too');
select is(test_helpers.notices('00000000-0000-0000-0000-0000000000a2', 'championship_moved'), 1,
  'and its members get an aviso');
select throws_ok(
  $$ select public.move_championship_entry((select id from public.championship_entries
       where player1_id = 'c4a00000-0000-0000-0000-0000000000a2'), 'c2a00000-0000-0000-0000-000000000002') $$,
  'P0001', 'invalid_state', 'nobody moves to the category they are in');
select throws_ok(
  $$ select public.remove_championship_entry('c3a00000-0000-0000-0000-000000000005') $$,
  'P0001', 'invalid_state', 'nothing changes once the draw is done');

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.add_championship_pair('c2a00000-0000-0000-0000-000000000003', 5, 5,
       p_player1_name => 'Nico', p_player1_phone => '099111004',
       p_player2_name => 'Olga', p_player2_phone => '099111005') $$,
  'P0001', 'forbidden', 'a player loads no whole pairs');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/championship_entries.test.sql`
Expected: FAIL (`function public.register_championship_pair(…) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261006000140_championship_entries.sql`:
```sql
-- Campeonatos, part 3: who plays. A member signs up with a partner (a member or someone from outside); staff
-- load whole pairs, take them out and move them. Without room a pair waits; when a pair with a place leaves,
-- the first in line gets in by itself. Every write locks the championship first, so the last spot, the
-- categories limit and the line never race.

-- Digits only; a Uruguayan number with its country code (+598, 00598) becomes the local one (0...).
create function private.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when phone ~ '^[0-9]{8,15}$' then phone end
  from (
    select case
      when cleaned like '00598%' then '0' || substr(cleaned, 6)
      when cleaned like '598%' and length(cleaned) = 11 then '0' || substr(cleaned, 4)
      else cleaned
    end as phone
    from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as cleaned) as raw
  ) as normalized;
$$;

-- The player row of a member, made the first time she plays a championship.
create function private.player_for_profile(p_club_id uuid, p_profile_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.players where club_id = p_club_id and profile_id = p_profile_id;
  if found then
    return v_id;
  end if;
  insert into public.players (club_id, name, profile_id, created_by)
  select p_club_id, coalesce(nullif(trim(left(p.display_name, 60)), ''), 'Jugador'), p.id, (select auth.uid())
  from public.profiles p
  where p.id = p_profile_id
  on conflict (club_id, profile_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.players where club_id = p_club_id and profile_id = p_profile_id;
  end if;
  if v_id is null then
    perform private.fail('not_found');
  end if;
  return v_id;
end;
$$;

-- Someone from outside: the player with that phone if there is one (its name stays), a new one if not.
create function private.player_for_phone(p_club_id uuid, p_name text, p_phone text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_phone text := private.normalize_phone(p_phone);
  v_name text := trim(p_name);
  v_id uuid;
begin
  if v_phone is null then
    perform private.fail('invalid_phone');
  end if;
  select id into v_id from public.players where club_id = p_club_id and phone = v_phone;
  if found then
    return v_id;
  end if;
  if v_name is null or length(v_name) not between 1 and 60 then
    perform private.fail('invalid_input');
  end if;
  insert into public.players (club_id, name, phone, created_by)
  values (p_club_id, v_name, v_phone, (select auth.uid()))
  on conflict (club_id, phone) where phone is not null do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.players where club_id = p_club_id and phone = v_phone;
  end if;
  return v_id;
end;
$$;

-- One player of a pair: a member of the club (by profile) or someone from outside (name and phone).
create function private.pair_player(p_club_id uuid, p_profile_id uuid, p_name text, p_phone text)
returns uuid
language plpgsql
set search_path = ''
as $$
begin
  if p_profile_id is not null then
    if nullif(trim(p_name), '') is not null or nullif(trim(p_phone), '') is not null then
      perform private.fail('invalid_input');
    end if;
    if not exists (select 1 from public.club_members m where m.club_id = p_club_id and m.user_id = p_profile_id) then
      perform private.fail('partner_not_member');
    end if;
    return private.player_for_profile(p_club_id, p_profile_id);
  end if;
  return private.player_for_phone(p_club_id, p_name, p_phone);
end;
$$;

create function private.category_active_count(p_category_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.championship_entries where category_id = p_category_id and status = 'active';
$$;

-- True when one of the two players is already in another pair of the category, with a place or waiting.
create function private.in_category(p_category_id uuid, p_player1 uuid, p_player2 uuid, p_except uuid default null)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.championship_entries e
    where e.category_id = p_category_id and e.status in ('active', 'waiting') and e.id is distinct from p_except
      and (e.player1_id in (p_player1, p_player2) or e.player2_id in (p_player1, p_player2))
  );
$$;

-- What an aviso of a championship carries (lib/domain/championship-notifications.ts reads it).
create function private.championship_notice_data(
  p_championship public.championships,
  p_category_name text,
  p_partner_name text,
  p_waiting boolean
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'championship_id', p_championship.id,
    'championship_name', p_championship.name,
    'category_name', p_category_name,
    'partner_name', p_partner_name,
    'waiting', p_waiting,
    'starts_at', private.championship_starts_at(p_championship.id)
  );
$$;

-- An aviso to each member of the pair but p_except (who did it). p_whole: about the whole championship.
create function private.notify_championship_entry(
  p_entry public.championship_entries,
  p_kind public.notification_kind,
  p_except uuid,
  p_whole boolean default false
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_category public.championship_categories;
  v_championship public.championships;
  v_player1 public.players;
  v_player2 public.players;
  v_category_name text;
  v_count integer := 0;
begin
  select * into v_category from public.championship_categories where id = p_entry.category_id;
  select * into v_championship from public.championships where id = v_category.championship_id;
  select * into v_player1 from public.players where id = p_entry.player1_id;
  select * into v_player2 from public.players where id = p_entry.player2_id;
  v_category_name := case when p_whole then null else v_category.name end;
  if v_player1.profile_id is not null and v_player1.profile_id is distinct from p_except then
    insert into public.notifications (club_id, user_id, kind, data, link)
    values (v_championship.club_id, v_player1.profile_id, p_kind,
            private.championship_notice_data(v_championship, v_category_name, v_player2.name, p_entry.status = 'waiting'),
            '/campeonatos/' || v_championship.id);
    v_count := v_count + 1;
  end if;
  if v_player2.profile_id is not null and v_player2.profile_id is distinct from p_except then
    insert into public.notifications (club_id, user_id, kind, data, link)
    values (v_championship.club_id, v_player2.profile_id, p_kind,
            private.championship_notice_data(v_championship, v_category_name, v_player1.name, p_entry.status = 'waiting'),
            '/campeonatos/' || v_championship.id);
    v_count := v_count + 1;
  end if;
  return v_count;
end;
$$;

-- Lets the first pairs in line in while the category has room, each with an aviso. Callers lock the
-- championship first.
create function private.fill_category(p_category_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_category public.championship_categories;
  v_entry public.championship_entries;
  v_count integer := 0;
begin
  select * into v_category from public.championship_categories where id = p_category_id;
  if v_category.status <> 'open' then
    return 0;
  end if;
  while private.category_active_count(p_category_id) < v_category.max_pairs loop
    select * into v_entry from public.championship_entries
     where category_id = p_category_id and status = 'waiting'
     order by created_at, id
     limit 1
     for update;
    exit when not found;
    update public.championship_entries set status = 'active' where id = v_entry.id returning * into v_entry;
    perform private.notify_championship_entry(v_entry, 'championship_promoted', null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Ends a pair that had a place or was waiting, and rejects its reported transfer. Confirmed payments stay
-- for a refund (Cobros). Callers lock the championship first.
create function private.end_championship_entry(
  p_entry_id uuid,
  p_status public.championship_entry_status,
  p_reason text
)
returns public.championship_entries
language plpgsql
set search_path = ''
as $$
declare
  v_entry public.championship_entries;
begin
  -- Payments before the pair, the same order as confirm_payment, so the two cannot deadlock.
  perform 1 from public.payments where championship_entry_id = p_entry_id and status = 'reported' for update;
  select * into v_entry from public.championship_entries where id = p_entry_id for update;
  if v_entry.status not in ('active', 'waiting') then
    perform private.fail('invalid_state');
  end if;
  update public.championship_entries
     set status = p_status, ended_at = now(), ended_by = (select auth.uid())
   where id = p_entry_id
  returning * into v_entry;
  update public.payments
     set status = 'rejected', rejection_reason = p_reason, confirmed_by = (select auth.uid()), confirmed_at = now()
   where championship_entry_id = p_entry_id and status = 'reported';
  return v_entry;
end;
$$;

-- A new pair: two different players, not already in the category, under the categories limit. With a place
-- if there is room, waiting if not; its members (but whoever signed it up) get an aviso. Callers lock the
-- championship first.
create function private.insert_championship_entry(
  p_category_id uuid,
  p_championship public.championships,
  p_player1 uuid,
  p_player2 uuid,
  p_level1 integer,
  p_level2 integer,
  p_note text
)
returns public.championship_entries
language plpgsql
set search_path = ''
as $$
declare
  v_category public.championship_categories;
  v_entry public.championship_entries;
begin
  select * into v_category from public.championship_categories where id = p_category_id;
  if p_player1 = p_player2 then
    perform private.fail('same_player');
  end if;
  if p_level1 is null or p_level2 is null or p_level1 not between 1 and 8 or p_level2 not between 1 and 8
     or length(p_note) > 300 then
    perform private.fail('invalid_input');
  end if;
  if private.in_category(v_category.id, p_player1, p_player2) then
    perform private.fail('already_in_category');
  end if;
  if exists (
    select 1 from unnest(array[p_player1, p_player2]) as u (player_id)
    where (
      select count(*) from public.championship_entries e
      join public.championship_categories c on c.id = e.category_id
      where c.championship_id = p_championship.id and e.status in ('active', 'waiting')
        and u.player_id in (e.player1_id, e.player2_id)
    ) >= p_championship.max_categories_per_player
  ) then
    perform private.fail('too_many_categories');
  end if;

  insert into public.championship_entries (club_id, category_id, player1_id, player2_id, player1_level,
                                           player2_level, status, note, created_by)
  values (v_category.club_id, v_category.id, p_player1, p_player2, p_level1, p_level2,
          (case when private.category_active_count(v_category.id) < v_category.max_pairs then 'active'
                else 'waiting' end)::public.championship_entry_status,
          p_note, (select auth.uid()))
  returning * into v_entry;
  perform private.notify_championship_entry(v_entry, 'championship_added', (select auth.uid()));
  return v_entry;
end;
$$;

-- Puts a pair in another category of the same championship: with a place if there is room, waiting if not,
-- with an aviso. Callers lock the championship and check the rules.
create function private.move_entry(p_entry_id uuid, p_to public.championship_categories)
returns public.championship_entries
language plpgsql
set search_path = ''
as $$
declare
  v_entry public.championship_entries;
begin
  update public.championship_entries
     set category_id = p_to.id,
         status = (case when private.category_active_count(p_to.id) < p_to.max_pairs then 'active'
                        else 'waiting' end)::public.championship_entry_status
   where id = p_entry_id
  returning * into v_entry;
  perform private.notify_championship_entry(v_entry, 'championship_moved', null);
  return v_entry;
end;
$$;

-- A member signs up with a partner: a member (p_partner_profile_id) or someone from outside (name and phone).
create function public.register_championship_pair(
  p_category_id uuid,
  p_my_level integer,
  p_partner_level integer,
  p_partner_profile_id uuid default null,
  p_partner_name text default null,
  p_partner_phone text default null
)
returns public.championship_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_category public.championship_categories;
  v_championship public.championships;
begin
  select * into v_category from public.championship_categories where id = p_category_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.lock_championship(v_category.championship_id);
  if v_uid is null or not private.is_club_member(v_championship.club_id) then
    perform private.fail('forbidden');
  end if;
  select * into v_category from public.championship_categories where id = p_category_id;
  if v_championship.status <> 'registration' or v_championship.registration_closes_at <= now()
     or v_category.status <> 'open' then
    perform private.fail('championship_closed');
  end if;
  return private.insert_championship_entry(
    v_category.id, v_championship,
    private.player_for_profile(v_championship.club_id, v_uid),
    private.pair_player(v_championship.club_id, p_partner_profile_id, p_partner_name, p_partner_phone),
    p_my_level, p_partner_level, null
  );
end;
$$;

-- Reception loads a whole pair (members, people from outside or one of each) until the draw.
create function public.add_championship_pair(
  p_category_id uuid,
  p_player1_level integer,
  p_player2_level integer,
  p_player1_profile_id uuid default null,
  p_player1_name text default null,
  p_player1_phone text default null,
  p_player2_profile_id uuid default null,
  p_player2_name text default null,
  p_player2_phone text default null,
  p_note text default null
)
returns public.championship_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category public.championship_categories;
  v_championship public.championships;
begin
  select * into v_category from public.championship_categories where id = p_category_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.staff_championship(v_category.championship_id);
  select * into v_category from public.championship_categories where id = p_category_id;
  if v_championship.status not in ('registration', 'closed') or v_category.status <> 'open' then
    perform private.fail('invalid_state');
  end if;
  return private.insert_championship_entry(
    v_category.id, v_championship,
    private.pair_player(v_championship.club_id, p_player1_profile_id, p_player1_name, p_player1_phone),
    private.pair_player(v_championship.club_id, p_player2_profile_id, p_player2_name, p_player2_phone),
    p_player1_level, p_player2_level, nullif(trim(p_note), '')
  );
end;
$$;

-- A player of the pair withdraws it while registration is open. Someone who already paid gets it back from
-- the club (Cobros); the first pair in line gets the place.
create function public.withdraw_championship_entry(p_entry_id uuid)
returns public.championship_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_category_id uuid;
  v_championship_id uuid;
  v_championship public.championships;
  v_entry public.championship_entries;
begin
  select e.category_id, c.championship_id into v_category_id, v_championship_id
  from public.championship_entries e
  join public.championship_categories c on c.id = e.category_id
  where e.id = p_entry_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.lock_championship(v_championship_id);
  if v_uid is null or not private.is_entry_player(p_entry_id) then
    perform private.fail('forbidden');
  end if;
  if v_championship.status <> 'registration' or v_championship.registration_closes_at <= now() then
    perform private.fail('championship_closed');
  end if;
  v_entry := private.end_championship_entry(p_entry_id, 'withdrawn', 'Se dieron de baja');
  perform private.fill_category(v_category_id);
  return v_entry;
end;
$$;

-- The organizer takes a pair out until the draw.
create function public.remove_championship_entry(p_entry_id uuid)
returns public.championship_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category_id uuid;
  v_championship_id uuid;
  v_championship public.championships;
  v_entry public.championship_entries;
begin
  select e.category_id, c.championship_id into v_category_id, v_championship_id
  from public.championship_entries e
  join public.championship_categories c on c.id = e.category_id
  where e.id = p_entry_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.staff_championship(v_championship_id);
  if v_championship.status not in ('registration', 'closed') then
    perform private.fail('invalid_state');
  end if;
  v_entry := private.end_championship_entry(p_entry_id, 'removed', 'El club quitó la pareja');
  perform private.fill_category(v_category_id);
  return v_entry;
end;
$$;

-- The organizer moves a pair to another category of the championship until the draw.
create function public.move_championship_entry(p_entry_id uuid, p_category_id uuid)
returns public.championship_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.championship_entries;
  v_from public.championship_categories;
  v_to public.championship_categories;
  v_championship public.championships;
  v_had_place boolean;
begin
  select * into v_entry from public.championship_entries where id = p_entry_id;
  if not found then
    perform private.fail('not_found');
  end if;
  select * into v_from from public.championship_categories where id = v_entry.category_id;
  v_championship := private.staff_championship(v_from.championship_id);
  if v_championship.status not in ('registration', 'closed') then
    perform private.fail('invalid_state');
  end if;
  select * into v_entry from public.championship_entries where id = p_entry_id for update;
  select * into v_to from public.championship_categories
   where id = p_category_id and championship_id = v_championship.id;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_entry.status not in ('active', 'waiting') or v_to.status <> 'open' or v_to.id = v_entry.category_id then
    perform private.fail('invalid_state');
  end if;
  if private.in_category(v_to.id, v_entry.player1_id, v_entry.player2_id) then
    perform private.fail('already_in_category');
  end if;
  v_had_place := v_entry.status = 'active';
  v_entry := private.move_entry(v_entry.id, v_to);
  if v_had_place then
    perform private.fill_category(v_from.id);
  end if;
  return v_entry;
end;
$$;

revoke all on function private.normalize_phone(text) from public;
revoke all on function private.player_for_profile(uuid, uuid) from public;
revoke all on function private.player_for_phone(uuid, text, text) from public;
revoke all on function private.pair_player(uuid, uuid, text, text) from public;
revoke all on function private.category_active_count(uuid) from public;
revoke all on function private.in_category(uuid, uuid, uuid, uuid) from public;
revoke all on function private.championship_notice_data(public.championships, text, text, boolean) from public;
revoke all on function private.notify_championship_entry(public.championship_entries, public.notification_kind, uuid,
  boolean) from public;
revoke all on function private.fill_category(uuid) from public;
revoke all on function private.end_championship_entry(uuid, public.championship_entry_status, text) from public;
revoke all on function private.insert_championship_entry(uuid, public.championships, uuid, uuid, integer, integer,
  text) from public;
revoke all on function private.move_entry(uuid, public.championship_categories) from public;
revoke execute on function public.register_championship_pair(uuid, integer, integer, uuid, text, text) from public, anon;
revoke execute on function public.add_championship_pair(uuid, integer, integer, uuid, text, text, uuid, text, text, text)
  from public, anon;
revoke execute on function public.withdraw_championship_entry(uuid) from public, anon;
revoke execute on function public.remove_championship_entry(uuid) from public, anon;
revoke execute on function public.move_championship_entry(uuid, uuid) from public, anon;
grant execute on function public.register_championship_pair(uuid, integer, integer, uuid, text, text) to authenticated;
grant execute on function public.add_championship_pair(uuid, integer, integer, uuid, text, text, uuid, text, text, text)
  to authenticated;
grant execute on function public.withdraw_championship_entry(uuid) to authenticated;
grant execute on function public.remove_championship_entry(uuid) to authenticated;
grant execute on function public.move_championship_entry(uuid, uuid) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/championship_entries.test.sql
```
Expected: PASS (36 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261006000140_championship_entries.sql supabase/tests/database/championship_entries.test.sql
git commit -m "feat(db): sign up pairs, the waiting line, withdrawals and moves"
```

---

### Task 7: Abrir, cerrar y cancelar; fusionar y cancelar categorías

**Files:**
- Create: `supabase/tests/database/championship_lifecycle.test.sql`
- Create: `supabase/migrations/20261006000150_championship_lifecycle.sql`

- [ ] **Step 1: Write the failing test** (con la herramienta Write)

`supabase/tests/database/championship_lifecycle.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(33);

-- C1: a draft with a day of play on day 10 (08:00 to 14:00, both courts) and 'Libre', where Ana and Pedro
-- (with a reported transfer) and Bruno and Lucía are already in.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001', 'draft', null);
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
insert into public.payments (club_id, championship_entry_id, method, amount, status, payer_id) values
  ('a0000000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000001', 'transfer', 2000, 'reported',
   '00000000-0000-0000-0000-0000000000a1');
-- C2: a draft with nothing. C3: a draft whose day of play clashes with Bruno's booking on day 11.
-- C4: a draft whose deadline is after its first match.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000002', 'draft', null);
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000003', 'draft', null);
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000003', 11, '08:00', '14:00',
  array['c0000000-0000-0000-0000-000000000001']::uuid[]);
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000006', 'c1a00000-0000-0000-0000-000000000003');
call test_helpers.make_booking('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(11, '11:00', 90), '00000000-0000-0000-0000-0000000000b1');
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000004', 'draft', now() + interval '30 days');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000004', 12, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000007', 'c1a00000-0000-0000-0000-000000000004');
-- C5: registration closed. '5ta' (2 pairs) has only Gabi and Marta; '6ta' (2 pairs) is full with Hugo and
-- Nico (paid in cash) and Iván and Olga (transfer reported), and Juli and Raúl wait.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000005', 'closed');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000005', 13, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000005',
  '5ta', 2);
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000003', 'c1a00000-0000-0000-0000-000000000005',
  '6ta', 2);
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-000000000f04');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a4', 'c4a00000-0000-0000-0000-000000000f05');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000006', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a5', 'c4a00000-0000-0000-0000-000000000f06', 'waiting');
insert into public.payments (club_id, championship_entry_id, method, amount, status, payer_id, confirmed_at) values
  ('a0000000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000004', 'cash', 2000, 'confirmed', null,
   now());
insert into public.payments (club_id, championship_entry_id, method, amount, status, payer_id) values
  ('a0000000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000005', 'transfer', 2000, 'reported',
   '00000000-0000-0000-0000-0000000000a4');

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok($$ select public.open_championship_registration('c1a00000-0000-0000-0000-000000000002') $$,
  'P0001', 'championship_incomplete', 'registration opens with days of play and categories');
select throws_ok($$ select public.open_championship_registration('c1a00000-0000-0000-0000-000000000004') $$,
  'P0001', 'invalid_input', 'registration closes before the first match');
select throws_ok($$ select public.open_championship_registration('c1a00000-0000-0000-0000-000000000003') $$,
  'P0001', 'courts_busy', 'a day of play cannot take a court that is already taken');
select is((select status::text from public.championships where id = 'c1a00000-0000-0000-0000-000000000003'), 'draft',
  'and the championship stays a draft');
select is((select count(*)::int from public.court_occupancy where championship_id = 'c1a00000-0000-0000-0000-000000000003'),
  0, 'with no court blocked');
select lives_ok($$ select public.open_championship_registration('c1a00000-0000-0000-0000-000000000001') $$,
  'staff open registration');
select results_eq(
  $$ select status::text, registration_closes_at from public.championships
     where id = 'c1a00000-0000-0000-0000-000000000001' $$,
  $$ values ('registration', test_helpers.at(10, '08:00') - interval '24 hours') $$,
  'until 24 hours before the first match');
select is(
  (select count(*)::int from public.court_occupancy
   where championship_id = 'c1a00000-0000-0000-0000-000000000001' and kind = 'championship'),
  2, 'each day of play blocks its courts');
select throws_ok($$ select public.open_championship_registration('c1a00000-0000-0000-0000-000000000001') $$,
  'P0001', 'invalid_state', 'registration opens once');
select throws_ok(
  $$ select public.add_championship_window('c1a00000-0000-0000-0000-000000000001', test_helpers.today() + 12,
       '08:00', '11:00', array['c0000000-0000-0000-0000-000000000001']::uuid[]) $$,
  'P0001', 'invalid_state', 'its days of play stay as they are');
select lives_ok($$ select public.close_championship_registration('c1a00000-0000-0000-0000-000000000001') $$,
  'staff close registration');
select throws_ok($$ select public.close_championship_registration('c1a00000-0000-0000-0000-000000000001') $$,
  'P0001', 'invalid_state', 'once');

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.book_slot('c0000000-0000-0000-0000-000000000001', test_helpers.at(10, '11:00')) $$,
  'P0001', 'slot_taken', 'nobody books a court the championship holds');
select throws_ok($$ select public.cancel_championship('c1a00000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'a player cancels no championships');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.merge_championship_category('c2a00000-0000-0000-0000-000000000002',
       'c2a00000-0000-0000-0000-000000000003') $$,
  'staff merge a category with too few pairs into another');
select results_eq(
  $$ select status::text, merged_into from public.championship_categories
     where id = 'c2a00000-0000-0000-0000-000000000002' $$,
  $$ values ('merged', 'c2a00000-0000-0000-0000-000000000003'::uuid) $$,
  'the small category points at the one it went into');
select results_eq(
  $$ select category_id, status::text from public.championship_entries
     where id = 'c3a00000-0000-0000-0000-000000000003' $$,
  $$ values ('c2a00000-0000-0000-0000-000000000003'::uuid, 'waiting') $$,
  'its pair waits there: the other one was full');
select is(test_helpers.last_notice('00000000-0000-0000-0000-0000000000a2', 'championship_moved') ->> 'waiting',
  'true', 'with an aviso that says so');
select throws_ok(
  $$ select public.merge_championship_category('c2a00000-0000-0000-0000-000000000003',
       'c2a00000-0000-0000-0000-000000000003') $$,
  'P0001', 'invalid_state', 'a category does not merge into itself');
select throws_ok(
  $$ select public.merge_championship_category('c2a00000-0000-0000-0000-000000000002',
       'c2a00000-0000-0000-0000-000000000003') $$,
  'P0001', 'invalid_state', 'nor merges twice');
select lives_ok($$ select public.cancel_championship_category('c2a00000-0000-0000-0000-000000000003') $$,
  'staff cancel a category');
select is(
  (select count(*)::int from public.championship_entries
   where category_id = 'c2a00000-0000-0000-0000-000000000003' and status = 'removed'),
  4, 'its pairs are out, with a place or waiting');
select results_eq(
  $$ select status::text, rejection_reason from public.payments
     where championship_entry_id = 'c3a00000-0000-0000-0000-000000000005' $$,
  $$ values ('rejected', 'Categoría cancelada') $$,
  'a reported transfer is rejected');
select is(
  (select status::text from public.payments where championship_entry_id = 'c3a00000-0000-0000-0000-000000000004'),
  'confirmed', 'money already taken stays, to give back');
select is(test_helpers.last_notice('00000000-0000-0000-0000-0000000000a3', 'championship_cancelled') ->> 'category_name',
  '6ta', 'its members get an aviso naming the category');
select lives_ok($$ select public.cancel_championship('c1a00000-0000-0000-0000-000000000001') $$,
  'staff cancel a championship');
select results_eq(
  $$ select status::text, cancelled_at is not null from public.championships
     where id = 'c1a00000-0000-0000-0000-000000000001' $$,
  $$ values ('cancelled', true) $$,
  'it is cancelled');
select is((select count(*)::int from public.court_occupancy where championship_id = 'c1a00000-0000-0000-0000-000000000001'),
  0, 'and its courts are free');
select is(
  (select rejection_reason from public.payments where championship_entry_id = 'c3a00000-0000-0000-0000-000000000001'),
  'Campeonato cancelado', 'reported transfers are rejected');
select ok((test_helpers.last_notice('00000000-0000-0000-0000-0000000000a1', 'championship_cancelled')
  ->> 'category_name') is null, 'the aviso is about the whole championship');
select is(
  test_helpers.notices('00000000-0000-0000-0000-0000000000a1', 'championship_cancelled')
    + test_helpers.notices('00000000-0000-0000-0000-0000000000b1', 'championship_cancelled'),
  2, 'every member signed up gets it');
select throws_ok($$ select public.cancel_championship('c1a00000-0000-0000-0000-000000000001') $$,
  'P0001', 'invalid_state', 'a championship is cancelled once');
select lives_ok($$ select public.cancel_championship('c1a00000-0000-0000-0000-000000000002') $$,
  'a draft can be cancelled too');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/championship_lifecycle.test.sql`
Expected: FAIL (`function public.open_championship_registration(uuid) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261006000150_championship_lifecycle.sql`:
```sql
-- Campeonatos, part 4: the life of a championship until the draw. Opening registration blocks the courts of
-- its days of play; closing it stops sign-ups; cancelling frees the courts, rejects reported transfers and
-- leaves confirmed payments to give back. A category with too few pairs is merged into another or cancelled.

create function public.open_championship_registration(p_championship_id uuid)
returns public.championships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
  v_club public.clubs;
  v_starts timestamptz;
  v_closes timestamptz;
  v_window public.championship_windows;
  v_court_id uuid;
begin
  if v_championship.status <> 'draft' then
    perform private.fail('invalid_state');
  end if;
  if not exists (select 1 from public.championship_windows where championship_id = v_championship.id)
     or not exists (
       select 1 from public.championship_categories where championship_id = v_championship.id and status = 'open'
     ) then
    perform private.fail('championship_incomplete');
  end if;
  select * into v_club from public.clubs where id = v_championship.club_id;
  v_starts := private.championship_starts_at(v_championship.id);
  if v_starts <= now() then
    perform private.fail('in_the_past');
  end if;
  v_closes := coalesce(v_championship.registration_closes_at, v_starts - interval '24 hours');
  if v_closes > v_starts then
    perform private.fail('invalid_input');
  end if;
  if v_closes <= now() then
    perform private.fail('in_the_past');
  end if;

  -- The exclusion constraint has the last word on double booking.
  for v_window in
    select * from public.championship_windows where championship_id = v_championship.id order by on_date, from_time
  loop
    foreach v_court_id in array v_window.court_ids loop
      begin
        insert into public.court_occupancy (club_id, court_id, kind, period, note, championship_id, created_by)
        values (v_championship.club_id, v_court_id, 'championship', private.window_period(v_window, v_club.timezone),
                left(v_championship.name, 80), v_championship.id, (select auth.uid()));
      exception when exclusion_violation then
        perform private.fail('courts_busy');
      end;
    end loop;
  end loop;

  update public.championships
     set status = 'registration', registration_opens_at = now(), registration_closes_at = v_closes
   where id = v_championship.id
  returning * into v_championship;
  return v_championship;
end;
$$;

create function public.close_championship_registration(p_championship_id uuid)
returns public.championships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
begin
  if v_championship.status <> 'registration' then
    perform private.fail('invalid_state');
  end if;
  update public.championships set status = 'closed' where id = v_championship.id returning * into v_championship;
  return v_championship;
end;
$$;

-- Any time before it finished. Pairs keep their status; Cobros lists their confirmed payments to give back.
create function public.cancel_championship(p_championship_id uuid)
returns public.championships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
  v_entry public.championship_entries;
begin
  if v_championship.status in ('finished', 'cancelled') then
    perform private.fail('invalid_state');
  end if;

  delete from public.court_occupancy where championship_id = v_championship.id;
  update public.payments
     set status = 'rejected', rejection_reason = 'Campeonato cancelado',
         confirmed_by = (select auth.uid()), confirmed_at = now()
   where status = 'reported'
     and championship_entry_id in (
       select e.id from public.championship_entries e
       join public.championship_categories c on c.id = e.category_id
       where c.championship_id = v_championship.id
     );
  for v_entry in
    select e.* from public.championship_entries e
    join public.championship_categories c on c.id = e.category_id
    where c.championship_id = v_championship.id and e.status in ('active', 'waiting')
  loop
    perform private.notify_championship_entry(v_entry, 'championship_cancelled', null, true);
  end loop;

  update public.championships set status = 'cancelled', cancelled_at = now()
   where id = v_championship.id
  returning * into v_championship;
  return v_championship;
end;
$$;

-- Moves the pairs of a category into another one of the championship (with a place first, then the line,
-- each in its order): with a place while there is room, waiting after that. A pair with someone already in
-- the other category is taken out (its payments to give back).
create function public.merge_championship_category(p_category_id uuid, p_into_id uuid)
returns public.championship_categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.championship_categories;
  v_into public.championship_categories;
  v_championship public.championships;
  v_entry public.championship_entries;
begin
  select * into v_from from public.championship_categories where id = p_category_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.staff_championship(v_from.championship_id);
  if v_championship.status not in ('registration', 'closed') then
    perform private.fail('invalid_state');
  end if;
  select * into v_from from public.championship_categories where id = p_category_id;
  select * into v_into from public.championship_categories
   where id = p_into_id and championship_id = v_championship.id;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_from.status <> 'open' or v_into.status <> 'open' or v_into.id = v_from.id then
    perform private.fail('invalid_state');
  end if;

  for v_entry in
    select * from public.championship_entries
    where category_id = v_from.id and status in ('active', 'waiting')
    order by (status = 'waiting'), created_at, id
  loop
    if private.in_category(v_into.id, v_entry.player1_id, v_entry.player2_id) then
      v_entry := private.end_championship_entry(v_entry.id, 'removed', 'Categoría fusionada');
      perform private.notify_championship_entry(v_entry, 'championship_cancelled', null);
    else
      perform private.move_entry(v_entry.id, v_into);
    end if;
  end loop;

  update public.championship_categories set status = 'merged', merged_into = v_into.id
   where id = v_from.id
  returning * into v_from;
  return v_from;
end;
$$;

-- Its pairs are taken out (payments to give back) with an aviso.
create function public.cancel_championship_category(p_category_id uuid)
returns public.championship_categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category public.championship_categories;
  v_championship public.championships;
  v_entry public.championship_entries;
begin
  select * into v_category from public.championship_categories where id = p_category_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.staff_championship(v_category.championship_id);
  select * into v_category from public.championship_categories where id = p_category_id;
  if v_championship.status not in ('registration', 'closed') or v_category.status <> 'open' then
    perform private.fail('invalid_state');
  end if;

  for v_entry in
    select * from public.championship_entries
    where category_id = v_category.id and status in ('active', 'waiting')
    order by created_at, id
  loop
    v_entry := private.end_championship_entry(v_entry.id, 'removed', 'Categoría cancelada');
    perform private.notify_championship_entry(v_entry, 'championship_cancelled', null);
  end loop;

  update public.championship_categories set status = 'cancelled' where id = v_category.id returning * into v_category;
  return v_category;
end;
$$;

revoke execute on function public.open_championship_registration(uuid) from public, anon;
revoke execute on function public.close_championship_registration(uuid) from public, anon;
revoke execute on function public.cancel_championship(uuid) from public, anon;
revoke execute on function public.merge_championship_category(uuid, uuid) from public, anon;
revoke execute on function public.cancel_championship_category(uuid) from public, anon;
grant execute on function public.open_championship_registration(uuid) to authenticated;
grant execute on function public.close_championship_registration(uuid) to authenticated;
grant execute on function public.cancel_championship(uuid) to authenticated;
grant execute on function public.merge_championship_category(uuid, uuid) to authenticated;
grant execute on function public.cancel_championship_category(uuid) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/championship_lifecycle.test.sql
```
Expected: PASS (33 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261006000150_championship_lifecycle.sql supabase/tests/database/championship_lifecycle.test.sql
git commit -m "feat(db): open, close and cancel championships; merge and cancel categories"
```

---

### Task 8: Horarios imposibles

**Files:**
- Modify: `supabase/tests/database/helpers/championship.psql` (helper `blocks` al final)
- Create: `supabase/tests/database/championship_unavailability.test.sql`
- Create: `supabase/migrations/20261006000160_championship_unavailability.sql`

- [ ] **Step 1: El helper de franjas** (con la herramienta Write o Edit)

Append to `supabase/tests/database/helpers/championship.psql`:
```sql

-- The first p_count 2-hour blocks of a championship, as set_entry_unavailability takes them. Tests never write
-- a block by hand: blocks start every 2 hours (08:00, 10:00...), off the club's grid.
create function test_helpers.blocks(p_championship_id uuid, p_count integer)
returns text[]
language sql
stable
security definer
as $$
  select array(
    select block_key from private.championship_blocks(p_championship_id) order by block_key limit p_count
  );
$$;
```

- [ ] **Step 2: Write the failing test** (con la herramienta Write)

`supabase/tests/database/championship_unavailability.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(17);

-- C1: open, with days of play on day 10 (08:00 to 14:00) and day 11 (14:00 to 20:00): 6 blocks of 2 hours,
-- so a pair marks up to 2 by itself. Ana and Pedro, and Bruno and Lucía, are in.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '14:00');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 11, '14:00', '20:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
-- C2: its deadline passed; Ana and Gabi are in. C3 was drawn; Hugo and Nico are in.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000002', 'registration', now() - interval '1 hour');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000002', 12, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000002');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-0000000000a2');
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000003', 'drawn');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000003', 13, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000003', 'c1a00000-0000-0000-0000-000000000003');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-000000000f04');

select is((select count(*)::int from private.championship_blocks('c1a00000-0000-0000-0000-000000000001')), 6,
  'the days of play are cut in 2-hour blocks');
select results_eq(
  $$ select block_key, to_time - from_time from private.championship_blocks('c1a00000-0000-0000-0000-000000000001')
     order by block_key limit 1 $$,
  $$ values ((test_helpers.today() + 10)::text || '@08:00', interval '2 hours') $$,
  'from the start of each day');
select results_eq(
  $$ select to_time from private.championship_blocks('c1a00000-0000-0000-0000-000000000001')
     order by block_key desc limit 1 $$,
  $$ values ('20:00'::time) $$,
  'the last one ends with the day');

set local role authenticated;

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.set_entry_unavailability('c3a00000-0000-0000-0000-000000000001',
       test_helpers.blocks('c1a00000-0000-0000-0000-000000000001', 2), 'Trabajo de mañana') $$,
  'a player marks when her pair cannot play');
select is(
  (select count(*)::int from public.entry_unavailability where entry_id = 'c3a00000-0000-0000-0000-000000000001'),
  2, 'two blocks');
select is(
  (select unavailability_note from public.championship_entries where id = 'c3a00000-0000-0000-0000-000000000001'),
  'Trabajo de mañana', 'and a note');
select throws_ok(
  $$ select public.set_entry_unavailability('c3a00000-0000-0000-0000-000000000001',
       test_helpers.blocks('c1a00000-0000-0000-0000-000000000001', 3)) $$,
  'P0001', 'too_many_unavailable', 'a pair marks up to 40 % of the blocks');
select throws_ok(
  $$ select public.set_entry_unavailability('c3a00000-0000-0000-0000-000000000001', array['2020-01-01@08:00']) $$,
  'P0001', 'invalid_input', 'only blocks of the championship');
select throws_ok(
  $$ select public.set_entry_unavailability('c3a00000-0000-0000-0000-000000000002',
       test_helpers.blocks('c1a00000-0000-0000-0000-000000000001', 1)) $$,
  'P0001', 'forbidden', 'only for her own pairs');
select throws_ok(
  $$ select public.set_entry_unavailability('c3a00000-0000-0000-0000-000000000003',
       test_helpers.blocks('c1a00000-0000-0000-0000-000000000002', 1)) $$,
  'P0001', 'championship_closed', 'and until the deadline');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.set_entry_unavailability('c3a00000-0000-0000-0000-000000000001',
       test_helpers.blocks('c1a00000-0000-0000-0000-000000000001', 4)) $$,
  'the organizer saves more than 40 % for a pair');
select results_eq(
  $$ select unavailability_approved, unavailability_note from public.championship_entries
     where id = 'c3a00000-0000-0000-0000-000000000001' $$,
  $$ values (true, null::text) $$,
  'which approves it');
select is(
  (select count(*)::int from public.entry_unavailability where entry_id = 'c3a00000-0000-0000-0000-000000000001'),
  4, 'the blocks are replaced');
select lives_ok(
  $$ select public.set_entry_unavailability('c3a00000-0000-0000-0000-000000000003',
       test_helpers.blocks('c1a00000-0000-0000-0000-000000000002', 1)) $$,
  'the organizer saves them after the deadline too');
select throws_ok(
  $$ select public.set_entry_unavailability('c3a00000-0000-0000-0000-000000000004',
       test_helpers.blocks('c1a00000-0000-0000-0000-000000000003', 1)) $$,
  'P0001', 'invalid_state', 'but not once the draw is done');

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.set_entry_unavailability('c3a00000-0000-0000-0000-000000000001',
       test_helpers.blocks('c1a00000-0000-0000-0000-000000000001', 1)) $$,
  'the player marks fewer again');
select is(
  (select unavailability_approved from public.championship_entries where id = 'c3a00000-0000-0000-0000-000000000001'),
  false, 'and there is nothing to approve');

select * from finish();
rollback;
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/championship_unavailability.test.sql`
Expected: FAIL (`function private.championship_blocks(uuid) does not exist` al cargar el helper).

- [ ] **Step 4: Write the migration**

`supabase/migrations/20261006000160_championship_unavailability.sql`:
```sql
-- Campeonatos, part 5: when a pair cannot play. The days of play are cut in 2-hour blocks from their start
-- (the last one ends with the day); a player of the pair or staff mark the blocks it cannot play, plus a note.
-- A pair marks up to 40 % of the blocks; more needs the organizer, who saves it for them.

-- Every block of a championship, keyed 'YYYY-MM-DD@HH:MM' (lib/domain/championships.ts makes the same keys).
create function private.championship_blocks(p_championship_id uuid)
returns table (block_key text, on_date date, from_time time, to_time time)
language sql
stable
set search_path = ''
as $$
  select distinct on (w.on_date, s.minute)
    w.on_date::text || '@' || to_char(make_interval(mins => s.minute), 'HH24:MI'),
    w.on_date,
    time '00:00' + make_interval(mins => s.minute),
    case
      when s.minute + 120 >= extract(epoch from w.to_time)::integer / 60 then w.to_time
      else time '00:00' + make_interval(mins => s.minute + 120)
    end
  from public.championship_windows w
  cross join lateral generate_series(
    extract(epoch from w.from_time)::integer / 60,
    extract(epoch from w.to_time)::integer / 60 - 1,
    120
  ) as s (minute)
  where w.championship_id = p_championship_id
  order by w.on_date, s.minute, w.to_time desc;
$$;

-- Replaces the blocks a pair cannot play. A player of the pair, while registration is open and up to 40 %;
-- staff until the draw, any amount (more than 40 % marks it approved).
create function public.set_entry_unavailability(p_entry_id uuid, p_blocks text[], p_note text default null)
returns public.championship_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.championship_entries;
  v_championship public.championships;
  v_staff boolean;
  v_note text := nullif(trim(p_note), '');
  v_blocks text[] := coalesce(p_blocks, '{}');
  v_total integer;
  v_count integer;
  v_over boolean;
begin
  select * into v_entry from public.championship_entries where id = p_entry_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.lock_championship(
    (select c.championship_id from public.championship_categories c where c.id = v_entry.category_id)
  );
  v_staff := private.is_staff(v_championship.club_id);
  if not v_staff and not private.is_entry_player(v_entry.id) then
    perform private.fail('forbidden');
  end if;
  if v_entry.status not in ('active', 'waiting') or v_championship.status not in ('registration', 'closed') then
    perform private.fail('invalid_state');
  end if;
  if not v_staff and (v_championship.status <> 'registration' or v_championship.registration_closes_at <= now()) then
    perform private.fail('championship_closed');
  end if;
  if length(v_note) > 300 or cardinality(v_blocks) > 200 or array_position(v_blocks, null) is not null
     or exists (
       select 1 from unnest(v_blocks) as u (block_key)
       where u.block_key not in (select b.block_key from private.championship_blocks(v_championship.id) as b)
     ) then
    perform private.fail('invalid_input');
  end if;

  select count(*) into v_total from private.championship_blocks(v_championship.id);
  select count(distinct u.block_key) into v_count from unnest(v_blocks) as u (block_key);
  v_over := v_count * 5 > v_total * 2;
  if v_over and not v_staff then
    perform private.fail('too_many_unavailable');
  end if;

  delete from public.entry_unavailability where entry_id = v_entry.id;
  insert into public.entry_unavailability (club_id, entry_id, on_date, from_time, to_time)
  select v_entry.club_id, v_entry.id, b.on_date, b.from_time, b.to_time
  from private.championship_blocks(v_championship.id) as b
  where b.block_key = any (v_blocks);
  update public.championship_entries
     set unavailability_note = v_note, unavailability_approved = v_over
   where id = v_entry.id
  returning * into v_entry;
  return v_entry;
end;
$$;

revoke all on function private.championship_blocks(uuid) from public;
revoke execute on function public.set_entry_unavailability(uuid, text[], text) from public, anon;
grant execute on function public.set_entry_unavailability(uuid, text[], text) to authenticated;
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/championship_unavailability.test.sql
npm run test:db
```
Expected: PASS (17 tests), y los otros tests de campeonatos siguen en verde con el helper nuevo.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261006000160_championship_unavailability.sql supabase/tests/database/helpers/championship.psql supabase/tests/database/championship_unavailability.test.sql
git commit -m "feat(db): 2-hour blocks a pair cannot play, up to 40 %"
```

---

### Task 9: Pagos de inscripción y tipos del corte 2

**Files:**
- Create: `supabase/tests/database/championship_payments.test.sql`
- Create: `supabase/migrations/20261006000170_championship_payments.sql`
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: Write the failing test** (con la herramienta Write)

`supabase/tests/database/championship_payments.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(17);

-- C1: open. 'Libre' ($2.000 a pair, 2 pairs): Ana and Pedro, Gabi and Hugo, and Bruno and Lucía waiting.
-- '5ta': Juli and Raúl, with a transfer Juli reported. C2 was cancelled: Iván's reported transfer is left.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001',
  'Libre', 2);
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01', 'active', now() - interval '3 hours');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-0000000000a3', 'active', now() - interval '2 hours');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02', 'waiting', now() - interval '1 hour');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000001', '5ta');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a5', 'c4a00000-0000-0000-0000-000000000f06');
insert into public.payments (club_id, championship_entry_id, method, amount, status, payer_id) values
  ('a0000000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000004', 'transfer', 2000, 'reported',
   '00000000-0000-0000-0000-0000000000a5');
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000002', 'cancelled');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000003', 'c1a00000-0000-0000-0000-000000000002');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a4', 'c4a00000-0000-0000-0000-000000000f05');
insert into public.payments (club_id, championship_entry_id, method, amount, status, payer_id) values
  ('a0000000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000005', 'transfer', 2000, 'reported',
   '00000000-0000-0000-0000-0000000000a4');
insert into storage.objects (bucket_id, name) values
  ('receipts', '00000000-0000-0000-0000-0000000000a1/r.png'),
  ('receipts', '00000000-0000-0000-0000-0000000000b1/r.png');

set local role authenticated;

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.report_championship_transfer('c3a00000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'a player reports the transfer of her pair');
select results_eq(
  $$ select amount, payer_id, booking_id from public.payments
     where championship_entry_id = 'c3a00000-0000-0000-0000-000000000001' $$,
  $$ values (2000, '00000000-0000-0000-0000-0000000000a1'::uuid, null::uuid) $$,
  'for the price of the pair, as hers');
select throws_ok(
  $$ select public.report_championship_transfer('c3a00000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'P0001', 'invalid_state', 'one reported transfer at a time');
select throws_ok(
  $$ select public.report_championship_transfer('c3a00000-0000-0000-0000-000000000002',
       '00000000-0000-0000-0000-0000000000a1/r.png') $$,
  'P0001', 'forbidden', 'only for her own pair');

-- Bruno
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select throws_ok(
  $$ select public.report_championship_transfer('c3a00000-0000-0000-0000-000000000003',
       '00000000-0000-0000-0000-0000000000b1/r.png') $$,
  'P0001', 'invalid_state', 'a waiting pair pays when it gets a place');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select lives_ok(
  $$ select public.confirm_payment((select id from public.payments
       where championship_entry_id = 'c3a00000-0000-0000-0000-000000000001')) $$,
  'reception confirms it');
select throws_ok(
  $$ select public.record_championship_cash('c3a00000-0000-0000-0000-000000000001', 2000) $$,
  'P0001', 'invalid_input', 'nobody pays more than the price');
select lives_ok(
  $$ select public.record_championship_cash('c3a00000-0000-0000-0000-000000000002', 2000) $$,
  'reception records cash for a pair');
select results_eq(
  $$ select payer_id, status::text from public.payments
     where championship_entry_id = 'c3a00000-0000-0000-0000-000000000002' $$,
  $$ values (null::uuid, 'confirmed') $$,
  'paid by the pair, confirmed');
select throws_ok(
  $$ select public.record_championship_cash('c3a00000-0000-0000-0000-000000000003', 2000) $$,
  'P0001', 'invalid_state', 'not for a waiting pair');
select lives_ok($$ select public.remove_championship_entry('c3a00000-0000-0000-0000-000000000004') $$,
  'reception takes out a pair with a transfer to review');
select results_eq(
  $$ select status::text, rejection_reason from public.payments
     where championship_entry_id = 'c3a00000-0000-0000-0000-000000000004' $$,
  $$ values ('rejected', 'El club quitó la pareja') $$,
  'and the transfer is rejected');
select throws_ok(
  $$ select public.confirm_payment((select id from public.payments
       where championship_entry_id = 'c3a00000-0000-0000-0000-000000000005')) $$,
  'P0001', 'invalid_state', 'nothing is confirmed for a cancelled championship');

-- Hugo
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';

select is((select count(*)::int from public.payments), 1, 'a player reads the payment of his pair, whoever paid');

-- Ana
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select lives_ok($$ select public.withdraw_championship_entry('c3a00000-0000-0000-0000-000000000001') $$,
  'a paid pair withdraws');
select is(
  (select status::text from public.payments where championship_entry_id = 'c3a00000-0000-0000-0000-000000000001'),
  'confirmed', 'its payment stays, to give back');
select is(test_helpers.entry_status('c3a00000-0000-0000-0000-000000000003'), 'active', 'and the line moves');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/championship_payments.test.sql`
Expected: FAIL (`function public.report_championship_transfer(uuid, text) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261006000170_championship_payments.sql`:
```sql
-- Campeonatos, part 6: what a pair pays. One payment for the pair (its category's price): a player of the
-- pair reports a transfer with its receipt; reception confirms or rejects it, records cash and marks refunds
-- (reject_payment and refund_payment work as they are). Only a pair with a place pays.

-- The category's price minus confirmed payments; null for an unknown pair.
create function private.championship_entry_due(p_entry_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select c.price - coalesce((
    select sum(p.amount) from public.payments p
    where p.championship_entry_id = e.id and p.status = 'confirmed'
  ), 0)::integer
  from public.championship_entries e
  join public.championship_categories c on c.id = e.category_id
  where e.id = p_entry_id;
$$;

-- A pair pays while it has a place in a championship that was not cancelled.
create function private.entry_payable(p_entry public.championship_entries)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_entry.status = 'active' and ch.status <> 'cancelled'
  from public.championship_categories c
  join public.championships ch on ch.id = c.championship_id
  where c.id = p_entry.category_id;
$$;

create function public.report_championship_transfer(p_entry_id uuid, p_receipt_path text default null)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_entry public.championship_entries;
  v_club public.clubs;
  v_path text := nullif(trim(p_receipt_path), '');
  v_due integer;
  v_payment public.payments;
begin
  select * into v_entry from public.championship_entries where id = p_entry_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_uid is null or not private.is_entry_player(v_entry.id) then
    perform private.fail('forbidden');
  end if;
  if not private.entry_payable(v_entry) then
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
  if exists (select 1 from public.payments where championship_entry_id = v_entry.id and status = 'reported') then
    perform private.fail('invalid_state');
  end if;

  v_due := private.championship_entry_due(v_entry.id);
  if v_due <= 0 then
    perform private.fail('invalid_state');
  end if;

  insert into public.payments (club_id, championship_entry_id, method, amount, status, receipt_path, reported_by,
                               payer_id)
  values (v_entry.club_id, v_entry.id, 'transfer', v_due, 'reported', v_path, v_uid, v_uid)
  returning * into v_payment;
  return v_payment;
end;
$$;

-- What a reported transfer already covers counts as spoken for: cash only takes the rest. Paid by the pair
-- (payer_id null).
create function public.record_championship_cash(p_entry_id uuid, p_amount integer)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_entry public.championship_entries;
  v_reported integer;
  v_payment public.payments;
begin
  select * into v_entry from public.championship_entries where id = p_entry_id for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.is_staff(v_entry.club_id) then
    perform private.fail('forbidden');
  end if;
  if not private.entry_payable(v_entry) then
    perform private.fail('invalid_state');
  end if;
  if not (select accepts_cash from public.clubs where id = v_entry.club_id) then
    perform private.fail('method_disabled');
  end if;

  select coalesce(sum(amount), 0)::integer into v_reported
  from public.payments where championship_entry_id = v_entry.id and status = 'reported';
  if p_amount is null or p_amount <= 0 or p_amount > private.championship_entry_due(v_entry.id) - v_reported then
    perform private.fail('invalid_input');
  end if;

  insert into public.payments (club_id, championship_entry_id, method, amount, status, payer_id, reported_by,
                               confirmed_by, confirmed_at)
  values (v_entry.club_id, v_entry.id, 'cash', p_amount, 'confirmed', null, v_uid, v_uid, now())
  returning * into v_payment;
  return v_payment;
end;
$$;

-- A reported transfer is confirmed only up to what is still owed: for a championship pair with a place, for a
-- booking (its price, or the player's share in a match), for an active entry of a tournament that was not
-- cancelled, or for a day use pass that was not cancelled. The payment is locked first, then its target.
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
  v_pair public.championship_entries;
  v_left integer;
begin
  if v_payment.status <> 'reported' then
    perform private.fail('invalid_state');
  end if;

  if v_payment.championship_entry_id is not null then
    select * into v_pair from public.championship_entries where id = v_payment.championship_entry_id for update;
    v_left := private.championship_entry_due(v_pair.id);
    if not private.entry_payable(v_pair) or v_left is null or v_payment.amount > v_left then
      perform private.fail('invalid_state');
    end if;
  elsif v_payment.day_use_pass_id is not null then
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

revoke all on function private.championship_entry_due(uuid) from public;
revoke all on function private.entry_payable(public.championship_entries) from public;
revoke execute on function public.report_championship_transfer(uuid, text) from public, anon;
revoke execute on function public.record_championship_cash(uuid, integer) from public, anon;
grant execute on function public.report_championship_transfer(uuid, text) to authenticated;
grant execute on function public.record_championship_cash(uuid, integer) to authenticated;
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/championship_payments.test.sql
npm run test:db
```
Expected: PASS (17 tests); los tests de pagos de reservas, partidos, americanos y day use siguen en verde con el `confirm_payment` nuevo.

- [ ] **Step 5: Regenerate types**

Run:
```bash
npm run db:types
npm run typecheck
```
Expected: aparecen todas las funciones nuevas en `Functions` (`register_championship_pair`, `add_championship_pair`, `member_directory`, `championship_contacts`, …); typecheck PASS.

- [ ] **Step 6: Commit and push**

```bash
git add supabase/migrations/20261006000170_championship_payments.sql supabase/tests/database/championship_payments.test.sql lib/supabase/database.types.ts
git commit -m "feat(db): pair payments in Cobros, refunds when a paid pair leaves"
git push
```

---
## Corte 3: Dominio TS

Todo lo de este corte es TypeScript puro (sin Supabase ni React): reglas, textos y lectura de formularios, con tests de Vitest.

### Task 10: Errores nuevos

**Files:**
- Modify: `lib/domain/errors.ts:44` (antes del cierre de `MESSAGES`)
- Test: `tests/unit/lib/domain/errors.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/unit/lib/domain/errors.test.ts`, add to the end of `DATABASE_CODES` (after `'hold_expired',`):
```ts
  'championship_closed', 'championship_incomplete', 'category_exists', 'already_in_category', 'too_many_categories',
  'same_player', 'partner_not_member', 'invalid_phone', 'too_many_unavailable',
```
and add inside `describe('errorMessage', …)`:
```ts
  it('explains the championship rules in words', () => {
    expect(errorMessage('championship_closed')).toBe('La inscripción de este campeonato está cerrada.')
    expect(errorMessage('too_many_categories')).toBe('Alguno de los dos ya está en el máximo de categorías de este campeonato.')
    expect(errorMessage('too_many_unavailable')).toBe('Marcaste más del 40 % de los horarios. Para más, pedíselo al club.')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/errors.test.ts`
Expected: FAIL (`translates championship_closed`: `expected false to be true`).

- [ ] **Step 3: Write minimal implementation**

In `lib/domain/errors.ts`, add after the `hold_expired` line:
```ts
  championship_closed: 'La inscripción de este campeonato está cerrada.',
  championship_incomplete: 'Agregá al menos un día de juego y una categoría antes de abrir la inscripción.',
  category_exists: 'Ya hay una categoría con ese nombre en este campeonato.',
  already_in_category: 'Alguno de los dos ya está anotado en esa categoría.',
  too_many_categories: 'Alguno de los dos ya está en el máximo de categorías de este campeonato.',
  same_player: 'La pareja tiene que ser de dos jugadores distintos.',
  partner_not_member: 'Ese jugador no es socio del club. Cargalo como de afuera.',
  invalid_phone: 'Revisá el teléfono: tiene que tener entre 8 y 15 números.',
  too_many_unavailable: 'Marcaste más del 40 % de los horarios. Para más, pedíselo al club.',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/errors.ts tests/unit/lib/domain/errors.test.ts
git commit -m "feat(domain): championship error messages"
```

---

### Task 11: Campeonatos, cupos, lista de espera y franjas (`lib/domain/championships.ts`)

**Files:**
- Create: `lib/domain/championships.ts`
- Create: `tests/unit/fixtures/championships.ts`
- Test: `tests/unit/lib/domain/championships.test.ts`

- [ ] **Step 1: The fixture**

`tests/unit/fixtures/championships.ts`:
```ts
import type { Championship, ChampionshipCategory, ChampionshipEntry, ChampionshipPlayer } from '@/lib/domain/championships'

export const TIMEZONE = 'America/Montevideo'
// Saturday 10 of October 2026, 09:00 in Montevideo: registration is open.
export const NOW = new Date('2026-10-10T12:00:00Z')

export function player(id: string, name: string, profileId: string | null = null): ChampionshipPlayer {
  return { id, name, profileId }
}
export const ANA = player('pl-ana', 'Ana', 'u-ana')
export const BRUNO = player('pl-bruno', 'Bruno', 'u-bruno')
export const PEDRO = player('pl-pedro', 'Pedro')
export const LUCIA = player('pl-lucia', 'Lucía')

// Ana and Pedro (from outside), with a place, nothing paid.
export function makeEntry(overrides: Partial<ChampionshipEntry> = {}): ChampionshipEntry {
  return {
    id: 'e1',
    categoryId: 'k1',
    player1: ANA,
    player2: PEDRO,
    level1: 5,
    level2: 6,
    status: 'active',
    note: null,
    unavailabilityNote: null,
    unavailabilityApproved: false,
    createdAt: new Date('2026-10-06T12:00:00Z'),
    payments: [],
    unavailable: [],
    ...overrides,
  }
}

// '6ta Libre': 2 to 4 pairs, $2.000 a pair, nobody in yet.
export function makeCategory(overrides: Partial<ChampionshipCategory> = {}): ChampionshipCategory {
  return {
    id: 'k1',
    name: '6ta Libre',
    gender: 'open',
    levelMin: null,
    levelMax: null,
    minPairs: 2,
    maxPairs: 4,
    price: 2000,
    format: 'groups_knockout',
    groupSize: 4,
    qualifiers: 2,
    matchMinutes: 90,
    seeding: 'ranking',
    thirdSet: 'super_tiebreak',
    goldenPoint: false,
    status: 'open',
    mergedInto: null,
    entries: [],
    ...overrides,
  }
}

// Saturday 17 (08:00 to 14:00, two courts) and Sunday 18 of October (14:00 to 20:00, one court); registration
// open until Friday 16 at 08:00 (11:00 UTC), 2 categories per player.
export function makeChampionship(overrides: Partial<Championship> = {}): Championship {
  return {
    id: 'ch1',
    name: 'Campeonato de Primavera',
    rules: 'Al mejor de 3 sets.',
    posterPath: null,
    status: 'registration',
    registrationOpensAt: new Date('2026-10-06T12:00:00Z'),
    registrationClosesAt: new Date('2026-10-16T11:00:00Z'),
    maxCategoriesPerPlayer: 2,
    windows: [
      { id: 'w1', date: '2026-10-17', fromTime: '08:00', toTime: '14:00', courtIds: ['court-1', 'court-2'] },
      { id: 'w2', date: '2026-10-18', fromTime: '14:00', toTime: '20:00', courtIds: ['court-1'] },
    ],
    categories: [makeCategory()],
    startsAt: new Date('2026-10-17T11:00:00Z'),
    endsAt: new Date('2026-10-18T23:00:00Z'),
    ...overrides,
  }
}
```

- [ ] **Step 2: Write the failing test**

`tests/unit/lib/domain/championships.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  categoryDetail,
  championshipBlocks,
  championshipReadiness,
  closesText,
  datesText,
  entryStateText,
  maxUnavailable,
  myEntries,
  normalizePhone,
  pairName,
  partnerOf,
  registerStatus,
  smallCategories,
  spotsText,
  toChampionship,
  unavailabilityText,
  waitingPosition,
  windowText,
  type ChampionshipRow,
} from '@/lib/domain/championships'
import { ANA, BRUNO, LUCIA, makeCategory, makeChampionship, makeEntry, NOW, PEDRO, TIMEZONE } from '../../fixtures/championships'

const ROW: ChampionshipRow = {
  id: 'ch1',
  name: 'Campeonato de Primavera',
  rules: '',
  poster_path: null,
  status: 'registration',
  registration_opens_at: '2026-10-06T12:00:00+00:00',
  registration_closes_at: '2026-10-16T11:00:00+00:00',
  max_categories_per_player: 2,
  windows: [
    { id: 'w2', on_date: '2026-10-18', from_time: '14:00:00', to_time: '20:00:00', court_ids: ['court-1'] },
    { id: 'w1', on_date: '2026-10-17', from_time: '08:00:00', to_time: '14:00:00', court_ids: ['court-1', 'court-2'] },
  ],
  categories: [
    {
      id: 'k2', name: '5ta Damas', gender: 'women', level_min: 5, level_max: 5, min_pairs: 4, max_pairs: 8, price: 1800,
      format: 'round_robin', group_size: 3, qualifiers_per_group: 1, match_minutes: 60, seeding: 'manual',
      match_rules: { third_set: 'full', golden_point: true }, status: 'open', merged_into: null, sort_order: 1, entries: [],
    },
    {
      id: 'k1', name: '6ta Libre', gender: 'open', level_min: null, level_max: null, min_pairs: 2, max_pairs: 4, price: 2000,
      format: 'groups_knockout', group_size: 4, qualifiers_per_group: 2, match_minutes: 90, seeding: 'ranking',
      match_rules: {}, status: 'open', merged_into: null, sort_order: 0,
      entries: [
        {
          id: 'e2', player1_level: 5, player2_level: 5, status: 'waiting', note: null, unavailability_note: null,
          unavailability_approved: false, created_at: '2026-10-07T12:00:00+00:00',
          player1: { id: 'pl-bruno', name: 'Bruno', profile_id: 'u-bruno' }, player2: null, payments: [], unavailability: [],
        },
        {
          id: 'e1', player1_level: 5, player2_level: 6, status: 'active', note: 'Prefieren de tarde',
          unavailability_note: 'Trabajo', unavailability_approved: false, created_at: '2026-10-06T12:00:00+00:00',
          player1: { id: 'pl-ana', name: 'Ana', profile_id: 'u-ana' }, player2: { id: 'pl-pedro', name: 'Pedro', profile_id: null },
          payments: [{ status: 'confirmed', amount: 2000, rejection_reason: null, created_at: '2026-10-08T12:00:00+00:00' }],
          unavailability: [{ on_date: '2026-10-17', from_time: '08:00:00' }],
        },
      ],
    },
  ],
}

describe('toChampionship', () => {
  it('reads what the database returns, in order', () => {
    const championship = toChampionship(ROW, TIMEZONE)
    expect(championship.windows.map((window) => window.id)).toEqual(['w1', 'w2'])
    expect(championship.windows[0]).toEqual({ id: 'w1', date: '2026-10-17', fromTime: '08:00', toTime: '14:00', courtIds: ['court-1', 'court-2'] })
    expect(championship.startsAt).toEqual(new Date('2026-10-17T11:00:00Z'))
    expect(championship.endsAt).toEqual(new Date('2026-10-18T23:00:00Z'))
    expect(championship.registrationClosesAt).toEqual(new Date('2026-10-16T11:00:00Z'))
    expect(championship.categories.map((category) => category.name)).toEqual(['6ta Libre', '5ta Damas'])
    const [libre, damas] = championship.categories
    expect(libre.entries.map((entry) => entry.id)).toEqual(['e1', 'e2'])
    expect(libre.entries[0]).toMatchObject({ level1: 5, level2: 6, note: 'Prefieren de tarde', unavailable: ['2026-10-17@08:00'] })
    expect(libre.entries[1].player2).toEqual({ id: '', name: 'Jugador', profileId: null })
    expect(libre).toMatchObject({ thirdSet: 'super_tiebreak', goldenPoint: false, qualifiers: 2 })
    expect(damas).toMatchObject({ thirdSet: 'full', goldenPoint: true, levelMin: 5, levelMax: 5 })
  })
})

describe('places and the waiting line', () => {
  const category = makeCategory({
    maxPairs: 2,
    entries: [
      makeEntry({ id: 'e1' }),
      makeEntry({ id: 'e2', player1: BRUNO, player2: LUCIA }),
      makeEntry({ id: 'e3', status: 'waiting', player1: { id: 'pl-x', name: 'Xavi', profileId: null } }),
      makeEntry({ id: 'e4', status: 'withdrawn' }),
    ],
  })

  it('counts the places and who waits', () => {
    expect(spotsText(category)).toBe('2 de 2 parejas · 1 en espera')
    expect(spotsText(makeCategory())).toBe('0 de 4 parejas')
  })

  it('tells each pair where it stands', () => {
    expect(waitingPosition(category, 'e3')).toBe(1)
    expect(waitingPosition(category, 'e1')).toBeNull()
    expect(entryStateText(category, category.entries[0])).toBe('Con lugar')
    expect(entryStateText(category, category.entries[2])).toBe('En espera, puesto 1')
  })

  it('names a pair and the partner of whoever looks', () => {
    expect(pairName(makeEntry())).toBe('Ana y Pedro')
    expect(partnerOf(makeEntry(), 'u-ana')).toEqual(PEDRO)
    expect(partnerOf(makeEntry({ player1: PEDRO, player2: ANA }), 'u-ana')).toEqual(PEDRO)
  })
})

describe('myEntries and registerStatus', () => {
  const libre = makeCategory({ id: 'k1', entries: [makeEntry({ id: 'e1' })] })
  const damas = makeCategory({ id: 'k2', name: '5ta Damas', entries: [makeEntry({ id: 'e5', categoryId: 'k2', status: 'withdrawn' })] })
  const full = makeCategory({ id: 'k3', name: '4ta', maxPairs: 2, entries: [makeEntry({ id: 'e6', player1: BRUNO }), makeEntry({ id: 'e7', player1: BRUNO })] })
  const championship = makeChampionship({ categories: [libre, damas, full] })

  it('finds the pairs of whoever looks that are still in', () => {
    expect(myEntries(championship, 'u-ana').map(({ entry, category }) => [entry.id, category.id])).toEqual([['e1', 'k1']])
    expect(myEntries(championship, 'u-nadie')).toEqual([])
  })

  it('lets a player sign up while registration is open, and says why not', () => {
    expect(registerStatus(championship, damas, 'u-ana', NOW)).toEqual({ ok: true, full: false })
    expect(registerStatus(championship, full, 'u-ana', NOW)).toEqual({ ok: true, full: true })
    expect(registerStatus(championship, libre, 'u-ana', NOW)).toEqual({ ok: false, reason: 'Ya estás anotado en esta categoría.' })
    expect(registerStatus({ ...championship, maxCategoriesPerPlayer: 1 }, damas, 'u-ana', NOW)).toEqual({
      ok: false,
      reason: 'Ya estás en 1 categoría, el máximo de este campeonato.',
    })
    expect(registerStatus(championship, damas, 'u-ana', new Date('2026-10-16T11:00:00Z'))).toEqual({
      ok: false,
      reason: 'La inscripción está cerrada.',
    })
    expect(registerStatus(championship, makeCategory({ status: 'cancelled' }), 'u-ana', NOW)).toEqual({
      ok: false,
      reason: 'Esta categoría ya no recibe parejas.',
    })
  })

  it('marks the categories with fewer pairs than they need', () => {
    expect(smallCategories(championship).map((category) => category.id)).toEqual(['k1', 'k2'])
  })
})

describe('blocks of 2 hours', () => {
  it('cuts each day of play from its start; the last block ends with the day', () => {
    const blocks = championshipBlocks([
      { id: 'w1', date: '2026-10-17', fromTime: '08:00', toTime: '13:00', courtIds: ['court-1'] },
      { id: 'w2', date: '2026-10-18', fromTime: '14:00', toTime: '18:00', courtIds: ['court-1'] },
    ])
    expect(blocks).toEqual([
      { key: '2026-10-17@08:00', date: '2026-10-17', fromTime: '08:00', toTime: '10:00' },
      { key: '2026-10-17@10:00', date: '2026-10-17', fromTime: '10:00', toTime: '12:00' },
      { key: '2026-10-17@12:00', date: '2026-10-17', fromTime: '12:00', toTime: '13:00' },
      { key: '2026-10-18@14:00', date: '2026-10-18', fromTime: '14:00', toTime: '16:00' },
      { key: '2026-10-18@16:00', date: '2026-10-18', fromTime: '16:00', toTime: '18:00' },
    ])
  })

  it('lets a pair mark up to 40 % by itself', () => {
    expect(maxUnavailable(6)).toBe(2)
    expect(maxUnavailable(5)).toBe(2)
    expect(maxUnavailable(10)).toBe(4)
    expect(maxUnavailable(2)).toBe(0)
  })

  it('says how many blocks a pair cannot play', () => {
    expect(unavailabilityText(0)).toBe('Pueden jugar en cualquier horario.')
    expect(unavailabilityText(1)).toBe('No pueden en 1 franja.')
    expect(unavailabilityText(3)).toBe('No pueden en 3 franjas.')
  })
})

describe('normalizePhone', () => {
  it('keeps the digits, and the local number of a Uruguayan one', () => {
    expect(normalizePhone('099 123 456')).toBe('099123456')
    expect(normalizePhone('+598 99 123 456')).toBe('099123456')
    expect(normalizePhone('00598 99 123 456')).toBe('099123456')
    expect(normalizePhone('+54 9 11 5555 6666')).toBe('5491155556666')
    expect(normalizePhone('123')).toBeNull()
    expect(normalizePhone('')).toBeNull()
  })
})

describe('texts', () => {
  it('says when it is played and until when one signs up', () => {
    expect(datesText(makeChampionship())).toBe('Del sábado 17 de octubre al domingo 18 de octubre')
    expect(datesText(makeChampionship({ windows: [makeChampionship().windows[0]] }))).toBe('sábado 17 de octubre')
    expect(datesText(makeChampionship({ windows: [] }))).toBe('Sin días de juego todavía')
    expect(windowText(makeChampionship().windows[0])).toBe('sábado 17 de octubre, 08:00 a 14:00')
    expect(closesText(makeChampionship(), TIMEZONE)).toBe('viernes 16 de octubre, 08:00')
    expect(closesText(makeChampionship({ registrationClosesAt: null }), TIMEZONE)).toBeNull()
  })

  it('describes a category', () => {
    expect(categoryDetail(makeCategory())).toBe('Libre · $2.000 por pareja')
    expect(categoryDetail(makeCategory({ gender: 'women', levelMin: 5, levelMax: 6, price: 0 }))).toBe('Damas · 5ª a 6ª · Sin costo')
  })

  it('says what a draft still needs to open', () => {
    expect(championshipReadiness(makeChampionship())).toBeNull()
    expect(championshipReadiness(makeChampionship({ windows: [] }))).toBe('Agregá al menos un día de juego.')
    expect(championshipReadiness(makeChampionship({ categories: [] }))).toBe('Agregá al menos una categoría.')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/championships.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/domain/championships"`).

- [ ] **Step 4: Write the implementation**

`lib/domain/championships.ts`:
```ts
import { dayLongLabel, formatPrice, timeIn } from './format'
import { formatMinutes, localDateOf, parseTime, zonedTime, type LocalDate } from './time'
import type { EntryPayment } from './tournaments'
import { shortTime } from './waitlist'

// Championships by pairs: categories that share days and courts. This file is what the screens need to know
// about them; the rules live in the database (supabase/migrations/20261006*), mirrored here for the screens.

export const CHAMPIONSHIP_STATUSES = [
  'draft', 'registration', 'closed', 'drawn', 'published', 'in_progress', 'finished', 'cancelled',
] as const
export type ChampionshipStatus = (typeof CHAMPIONSHIP_STATUSES)[number]
export const CATEGORY_GENDERS = ['open', 'men', 'women', 'mixed'] as const
export type CategoryGender = (typeof CATEGORY_GENDERS)[number]
export const CATEGORY_FORMATS = ['groups_knockout', 'knockout', 'round_robin'] as const
export type CategoryFormat = (typeof CATEGORY_FORMATS)[number]
export const SEEDINGS = ['ranking', 'manual'] as const
export type Seeding = (typeof SEEDINGS)[number]
export const THIRD_SETS = ['super_tiebreak', 'full'] as const
export type ThirdSet = (typeof THIRD_SETS)[number]
export type CategoryStatus = 'open' | 'cancelled' | 'merged'
export type EntryStatus = 'active' | 'waiting' | 'withdrawn' | 'removed'

export const CHAMPIONSHIP_STATUS_LABELS: Record<ChampionshipStatus, string> = {
  draft: 'Borrador',
  registration: 'Inscripción abierta',
  closed: 'Inscripción cerrada',
  drawn: 'Sorteado',
  published: 'Programado',
  in_progress: 'En juego',
  finished: 'Finalizado',
  cancelled: 'Cancelado',
}
export const GENDER_LABELS: Record<CategoryGender, string> = { open: 'Libre', men: 'Caballeros', women: 'Damas', mixed: 'Mixto' }
export const FORMAT_LABELS: Record<CategoryFormat, string> = {
  groups_knockout: 'Zonas y llave',
  knockout: 'Llave directa',
  round_robin: 'Todos contra todos',
}
export const SEEDING_LABELS: Record<Seeding, string> = { ranking: 'Por ranking', manual: 'A mano' }
export const THIRD_SET_LABELS: Record<ThirdSet, string> = { super_tiebreak: 'Súper tie-break a 10', full: 'Set completo' }
export const ENTRY_STATUS_LABELS: Record<EntryStatus, string> = {
  active: 'Con lugar',
  waiting: 'En espera',
  withdrawn: 'Se dio de baja',
  removed: 'Quitada',
}

// What "Agregar categoría" proposes (design; Rustic's real prices are still to come).
export const CATEGORY_DEFAULTS = {
  gender: 'open',
  minPairs: 4,
  maxPairs: 16,
  price: 2000,
  format: 'groups_knockout',
  groupSize: 4,
  qualifiers: 2,
  matchMinutes: 90,
  seeding: 'ranking',
  thirdSet: 'super_tiebreak',
  goldenPoint: false,
} as const
export const MAX_CATEGORIES_DEFAULT = 2
// The blocks of the "horarios imposibles", like private.championship_blocks.
export const BLOCK_MINUTES = 120

export type ChampionshipWindow = { id: string; date: LocalDate; fromTime: string; toTime: string; courtIds: string[] }
export type ChampionshipPlayer = { id: string; name: string; profileId: string | null }
export type ChampionshipEntry = {
  id: string
  categoryId: string
  player1: ChampionshipPlayer
  player2: ChampionshipPlayer
  level1: number
  level2: number
  status: EntryStatus
  note: string | null
  unavailabilityNote: string | null
  unavailabilityApproved: boolean
  createdAt: Date
  // Payments come back only to the pair and to staff (RLS).
  payments: EntryPayment[]
  // Block keys ('YYYY-MM-DD@HH:MM') the pair cannot play; only for the pair and staff (RLS).
  unavailable: string[]
}
export type ChampionshipCategory = {
  id: string
  name: string
  gender: CategoryGender
  levelMin: number | null
  levelMax: number | null
  minPairs: number
  maxPairs: number
  price: number
  format: CategoryFormat
  groupSize: number
  qualifiers: number
  matchMinutes: number
  seeding: Seeding
  thirdSet: ThirdSet
  goldenPoint: boolean
  status: CategoryStatus
  mergedInto: string | null
  // Oldest first: the order of the waiting line.
  entries: ChampionshipEntry[]
}
export type Championship = {
  id: string
  name: string
  rules: string
  posterPath: string | null
  status: ChampionshipStatus
  registrationOpensAt: Date | null
  registrationClosesAt: Date | null
  maxCategoriesPerPlayer: number
  windows: ChampionshipWindow[]
  categories: ChampionshipCategory[]
  // From the first day of play to the end of the last one; null without days.
  startsAt: Date | null
  endsAt: Date | null
}
export type Block = { key: string; date: LocalDate; fromTime: string; toTime: string }
export type MyEntry = { entry: ChampionshipEntry; category: ChampionshipCategory }
export type RegisterStatus = { ok: true; full: boolean } | { ok: false; reason: string }

// What lib/data/championships.ts reads. If supabase-js infers a slightly different shape for the embeds,
// adjust these types to match; never cast the query result.
type PlayerRow = { id: string; name: string; profile_id: string | null }
export type EntryRow = {
  id: string
  player1_level: number
  player2_level: number
  status: EntryStatus
  note: string | null
  unavailability_note: string | null
  unavailability_approved: boolean
  created_at: string
  player1: PlayerRow | null
  player2: PlayerRow | null
  payments: EntryPayment[]
  unavailability: { on_date: string; from_time: string }[]
}
export type CategoryRow = {
  id: string
  name: string
  gender: CategoryGender
  level_min: number | null
  level_max: number | null
  min_pairs: number
  max_pairs: number
  price: number
  format: CategoryFormat
  group_size: number
  qualifiers_per_group: number
  match_minutes: number
  seeding: Seeding
  match_rules: unknown
  status: CategoryStatus
  merged_into: string | null
  sort_order: number
  entries: EntryRow[]
}
export type ChampionshipRow = {
  id: string
  name: string
  rules: string
  poster_path: string | null
  status: ChampionshipStatus
  registration_opens_at: string | null
  registration_closes_at: string | null
  max_categories_per_player: number
  windows: { id: string; on_date: string; from_time: string; to_time: string; court_ids: string[] }[]
  categories: CategoryRow[]
}

const NO_PLAYER: ChampionshipPlayer = { id: '', name: 'Jugador', profileId: null }

export function blockKey(date: LocalDate, fromTime: string): string {
  return `${date}@${fromTime}`
}

// The match rules jsonb; anything missing is the default (third set a super tie-break, no golden point).
export function readMatchRules(value: unknown): { thirdSet: ThirdSet; goldenPoint: boolean } {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  return { thirdSet: record.third_set === 'full' ? 'full' : 'super_tiebreak', goldenPoint: record.golden_point === true }
}

export function windowPeriod(window: ChampionshipWindow, timezone: string): { startsAt: Date; endsAt: Date } {
  return {
    startsAt: zonedTime(window.date, parseTime(window.fromTime), timezone),
    endsAt: zonedTime(window.date, parseTime(window.toTime), timezone),
  }
}

function toPlayer(row: PlayerRow | null): ChampionshipPlayer {
  return row ? { id: row.id, name: row.name, profileId: row.profile_id } : NO_PLAYER
}

function toEntry(row: EntryRow, categoryId: string): ChampionshipEntry {
  return {
    id: row.id,
    categoryId,
    player1: toPlayer(row.player1),
    player2: toPlayer(row.player2),
    level1: row.player1_level,
    level2: row.player2_level,
    status: row.status,
    note: row.note,
    unavailabilityNote: row.unavailability_note,
    unavailabilityApproved: row.unavailability_approved,
    createdAt: new Date(row.created_at),
    payments: row.payments,
    unavailable: row.unavailability.map((item) => blockKey(item.on_date, shortTime(item.from_time))).sort(),
  }
}

function toCategory(row: CategoryRow): ChampionshipCategory {
  const rules = readMatchRules(row.match_rules)
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    levelMin: row.level_min,
    levelMax: row.level_max,
    minPairs: row.min_pairs,
    maxPairs: row.max_pairs,
    price: row.price,
    format: row.format,
    groupSize: row.group_size,
    qualifiers: row.qualifiers_per_group,
    matchMinutes: row.match_minutes,
    seeding: row.seeding,
    thirdSet: rules.thirdSet,
    goldenPoint: rules.goldenPoint,
    status: row.status,
    mergedInto: row.merged_into,
    entries: row.entries
      .map((entry) => toEntry(entry, row.id))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)),
  }
}

export function toChampionship(row: ChampionshipRow, timezone: string): Championship {
  const windows = row.windows
    .map((window) => ({
      id: window.id,
      date: window.on_date,
      fromTime: shortTime(window.from_time),
      toTime: shortTime(window.to_time),
      courtIds: window.court_ids,
    }))
    .sort((a, b) => `${a.date} ${a.fromTime}`.localeCompare(`${b.date} ${b.fromTime}`))
  const periods = windows.map((window) => windowPeriod(window, timezone))
  return {
    id: row.id,
    name: row.name,
    rules: row.rules,
    posterPath: row.poster_path,
    status: row.status,
    registrationOpensAt: row.registration_opens_at ? new Date(row.registration_opens_at) : null,
    registrationClosesAt: row.registration_closes_at ? new Date(row.registration_closes_at) : null,
    maxCategoriesPerPlayer: row.max_categories_per_player,
    windows,
    categories: [...row.categories]
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es'))
      .map(toCategory),
    startsAt: periods.length > 0 ? new Date(Math.min(...periods.map((period) => period.startsAt.getTime()))) : null,
    endsAt: periods.length > 0 ? new Date(Math.max(...periods.map((period) => period.endsAt.getTime()))) : null,
  }
}

export function activeEntries(category: Pick<ChampionshipCategory, 'entries'>): ChampionshipEntry[] {
  return category.entries.filter((entry) => entry.status === 'active')
}

// Oldest first: the order in which they get in.
export function waitingEntries(category: Pick<ChampionshipCategory, 'entries'>): ChampionshipEntry[] {
  return category.entries.filter((entry) => entry.status === 'waiting')
}

// "9 de 12 parejas · 2 en espera".
export function spotsText(category: Pick<ChampionshipCategory, 'entries' | 'maxPairs'>): string {
  const waiting = waitingEntries(category).length
  const places = `${activeEntries(category).length} de ${category.maxPairs} parejas`
  return waiting > 0 ? `${places} · ${waiting} en espera` : places
}

export function waitingPosition(category: Pick<ChampionshipCategory, 'entries'>, entryId: string): number | null {
  const index = waitingEntries(category).findIndex((entry) => entry.id === entryId)
  return index === -1 ? null : index + 1
}

export function entryStateText(category: Pick<ChampionshipCategory, 'entries'>, entry: ChampionshipEntry): string {
  if (entry.status === 'waiting') return `En espera, puesto ${waitingPosition(category, entry.id)}`
  return ENTRY_STATUS_LABELS[entry.status]
}

export function pairName(entry: Pick<ChampionshipEntry, 'player1' | 'player2'>): string {
  return `${entry.player1.name} y ${entry.player2.name}`
}

export function isEntryPlayer(entry: Pick<ChampionshipEntry, 'player1' | 'player2'>, profileId: string): boolean {
  return entry.player1.profileId === profileId || entry.player2.profileId === profileId
}

export function partnerOf(entry: Pick<ChampionshipEntry, 'player1' | 'player2'>, profileId: string): ChampionshipPlayer {
  return entry.player1.profileId === profileId ? entry.player2 : entry.player1
}

// The viewer's pairs that are still in (with a place or waiting), with their category.
export function myEntries(championship: Pick<Championship, 'categories'>, profileId: string): MyEntry[] {
  return championship.categories.flatMap((category) =>
    category.entries
      .filter((entry) => (entry.status === 'active' || entry.status === 'waiting') && isEntryPlayer(entry, profileId))
      .map((entry) => ({ entry, category })),
  )
}

// Same rule as register_championship_pair: open, before the deadline.
export function registrationOpen(championship: Pick<Championship, 'status' | 'registrationClosesAt'>, now: Date): boolean {
  return (
    championship.status === 'registration' &&
    championship.registrationClosesAt !== null &&
    championship.registrationClosesAt.getTime() > now.getTime()
  )
}

// Whether the viewer can sign up to a category, the same rules as the database; full means the pair waits.
export function registerStatus(
  championship: Championship,
  category: ChampionshipCategory,
  profileId: string,
  now: Date,
): RegisterStatus {
  if (!registrationOpen(championship, now)) return { ok: false, reason: 'La inscripción está cerrada.' }
  if (category.status !== 'open') return { ok: false, reason: 'Esta categoría ya no recibe parejas.' }
  const mine = myEntries(championship, profileId)
  if (mine.some((item) => item.category.id === category.id)) return { ok: false, reason: 'Ya estás anotado en esta categoría.' }
  const max = championship.maxCategoriesPerPlayer
  if (mine.length >= max) {
    return { ok: false, reason: `Ya estás en ${max} ${max === 1 ? 'categoría' : 'categorías'}, el máximo de este campeonato.` }
  }
  return { ok: true, full: activeEntries(category).length >= category.maxPairs }
}

export function openCategories(championship: Pick<Championship, 'categories'>): ChampionshipCategory[] {
  return championship.categories.filter((category) => category.status === 'open')
}

// Categories with fewer pairs than they need: the organizer merges or cancels them.
export function smallCategories(championship: Pick<Championship, 'categories'>): ChampionshipCategory[] {
  return openCategories(championship).filter((category) => activeEntries(category).length < category.minPairs)
}

// The 2-hour blocks of the days of play, like private.championship_blocks.
export function championshipBlocks(windows: ChampionshipWindow[]): Block[] {
  const blocks = new Map<string, Block>()
  for (const window of windows) {
    const from = parseTime(window.fromTime)
    const to = parseTime(window.toTime)
    for (let minute = from; minute < to; minute += BLOCK_MINUTES) {
      const fromTime = formatMinutes(minute)
      const key = blockKey(window.date, fromTime)
      if (!blocks.has(key)) {
        blocks.set(key, {
          key,
          date: window.date,
          fromTime,
          toTime: minute + BLOCK_MINUTES >= to ? window.toTime : formatMinutes(minute + BLOCK_MINUTES),
        })
      }
    }
  }
  return [...blocks.values()].sort((a, b) => a.key.localeCompare(b.key))
}

// Up to 40 % of the blocks, like set_entry_unavailability (count * 5 <= total * 2).
export function maxUnavailable(total: number): number {
  return Math.floor((total * 2) / 5)
}

export function unavailabilityText(count: number): string {
  if (count === 0) return 'Pueden jugar en cualquier horario.'
  return count === 1 ? 'No pueden en 1 franja.' : `No pueden en ${count} franjas.`
}

// Like private.normalize_phone: digits only; +598 and 00598 become the local 0.
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[^0-9]/g, '')
  if (digits.startsWith('00598')) digits = `0${digits.slice(5)}`
  else if (digits.startsWith('598') && digits.length === 11) digits = `0${digits.slice(3)}`
  return /^[0-9]{8,15}$/.test(digits) ? digits : null
}

export function datesText(championship: Pick<Championship, 'windows'>): string {
  const dates = [...new Set(championship.windows.map((window) => window.date))].sort()
  if (dates.length === 0) return 'Sin días de juego todavía'
  if (dates.length === 1) return dayLongLabel(dates[0])
  return `Del ${dayLongLabel(dates[0])} al ${dayLongLabel(dates[dates.length - 1])}`
}

export function windowText(window: ChampionshipWindow): string {
  return `${dayLongLabel(window.date)}, ${window.fromTime} a ${window.toTime}`
}

export function closesText(championship: Pick<Championship, 'registrationClosesAt'>, timezone: string): string | null {
  const closes = championship.registrationClosesAt
  return closes ? `${dayLongLabel(localDateOf(closes, timezone))}, ${timeIn(closes, timezone)}` : null
}

export function priceText(price: number): string {
  return price > 0 ? `${formatPrice(price)} por pareja` : 'Sin costo'
}

export function levelText(category: Pick<ChampionshipCategory, 'levelMin' | 'levelMax'>): string | null {
  if (category.levelMin === null || category.levelMax === null) return null
  return category.levelMin === category.levelMax ? `${category.levelMin}ª` : `${category.levelMin}ª a ${category.levelMax}ª`
}

// "Damas · 5ª a 6ª · $1.800 por pareja".
export function categoryDetail(category: Pick<ChampionshipCategory, 'gender' | 'levelMin' | 'levelMax' | 'price'>): string {
  return [GENDER_LABELS[category.gender], levelText(category), priceText(category.price)].filter(Boolean).join(' · ')
}

// What a draft still needs before registration opens (open_championship_registration says the same).
export function championshipReadiness(championship: Pick<Championship, 'windows' | 'categories'>): string | null {
  if (championship.windows.length === 0) return 'Agregá al menos un día de juego.'
  if (openCategories(championship).length === 0) return 'Agregá al menos una categoría.'
  return null
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
npx vitest run tests/unit/lib/domain/championships.test.ts
npm run typecheck
npm run lint
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/championships.ts tests/unit/fixtures/championships.ts tests/unit/lib/domain/championships.test.ts
git commit -m "feat(domain): championships, places, the waiting line and 2-hour blocks"
```

---

### Task 12: Los formularios de campeonatos (`lib/domain/championship-form.ts`)

**Files:**
- Create: `lib/domain/championship-form.ts`
- Test: `tests/unit/lib/domain/championship-form.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/championship-form.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  parseCategoryForm,
  parseChampionshipForm,
  parsePairForm,
  parseRegisterForm,
  parseUnavailabilityForm,
  parseWindowForm,
} from '@/lib/domain/championship-form'

const TIMEZONE = 'America/Montevideo'
const ID = '55555555-5555-5555-5555-555555555555'
const C1 = '22222222-2222-2222-2222-222222222201'
const C2 = '22222222-2222-2222-2222-222222222202'
const PROFILE = '66666666-6666-6666-6666-666666666666'

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item)
  }
  return data
}

describe('parseChampionshipForm', () => {
  const VALID = { name: 'Primavera', rules: ' Al mejor de 3 sets. ', maxCategories: '2', closesDate: '', closesTime: '' }

  it('reads the data, with the deadline on the club clock or none', () => {
    expect(parseChampionshipForm(form(VALID), TIMEZONE)).toEqual({
      ok: true,
      value: { name: 'Primavera', rules: 'Al mejor de 3 sets.', maxCategories: 2, closesAt: null },
    })
    expect(parseChampionshipForm(form({ ...VALID, closesDate: '2026-10-16', closesTime: '20:00' }), TIMEZONE)).toMatchObject({
      ok: true,
      value: { closesAt: '2026-10-16T23:00:00.000Z' },
    })
  })

  it('explains what is wrong', () => {
    expect(parseChampionshipForm(form({ ...VALID, name: '' }), TIMEZONE)).toEqual({ ok: false, message: 'Poné un nombre de hasta 80 letras.' })
    expect(parseChampionshipForm(form({ ...VALID, maxCategories: '9' }), TIMEZONE)).toEqual({
      ok: false,
      message: 'Cada jugador puede anotarse en 1 a 5 categorías.',
    })
    expect(parseChampionshipForm(form({ ...VALID, closesDate: '2026-10-16' }), TIMEZONE)).toEqual({
      ok: false,
      message: 'Completá el día y la hora del cierre, o dejalos vacíos.',
    })
  })
})

describe('parseWindowForm', () => {
  const VALID = { championshipId: ID, date: '2026-10-17', fromTime: '08:00', toTime: '14:00', courtIds: [C1, C2] }

  it('reads a day of play', () => {
    expect(parseWindowForm(form(VALID))).toEqual({
      ok: true,
      value: { championshipId: ID, date: '2026-10-17', fromTime: '08:00', toTime: '14:00', courtIds: [C1, C2] },
    })
  })

  it('explains what is wrong', () => {
    expect(parseWindowForm(form({ ...VALID, toTime: '08:00' }))).toEqual({ ok: false, message: '"Hasta" tiene que ser después de "Desde".' })
    expect(parseWindowForm(form({ ...VALID, courtIds: [] }))).toEqual({ ok: false, message: 'Elegí las canchas.' })
    expect(parseWindowForm(form({ ...VALID, date: '2026-02-30' }))).toEqual({ ok: false, message: 'Elegí el día y las horas.' })
  })
})

describe('parseCategoryForm', () => {
  const VALID = {
    championshipId: ID, name: '6ta Libre', gender: 'open', levelMin: '', levelMax: '', minPairs: '4', maxPairs: '12',
    price: '2000', format: 'groups_knockout', groupSize: '4', qualifiers: '2', matchMinutes: '90', seeding: 'ranking',
    thirdSet: 'super_tiebreak',
  }

  it('reads a category with its defaults', () => {
    expect(parseCategoryForm(form(VALID))).toEqual({
      ok: true,
      value: {
        championshipId: ID, name: '6ta Libre', gender: 'open', levelMin: null, levelMax: null, minPairs: 4, maxPairs: 12,
        price: 2000, format: 'groups_knockout', groupSize: 4, qualifiers: 2, matchMinutes: 90, seeding: 'ranking',
        thirdSet: 'super_tiebreak', goldenPoint: false,
      },
    })
    expect(parseCategoryForm(form({ ...VALID, levelMin: '5', levelMax: '6', goldenPoint: 'on' }))).toMatchObject({
      ok: true,
      value: { levelMin: 5, levelMax: 6, goldenPoint: true },
    })
  })

  it('explains what is wrong', () => {
    expect(parseCategoryForm(form({ ...VALID, name: '' }))).toEqual({ ok: false, message: 'Poné un nombre de hasta 40 letras.' })
    expect(parseCategoryForm(form({ ...VALID, minPairs: '13' }))).toEqual({
      ok: false,
      message: 'El mínimo de parejas va de 2 a 64 y no pasa el máximo.',
    })
    expect(parseCategoryForm(form({ ...VALID, levelMin: '5' }))).toEqual({
      ok: false,
      message: 'La categoría "desde" tiene que ser menor o igual que "hasta", o dejá las dos vacías.',
    })
    expect(parseCategoryForm(form({ ...VALID, groupSize: '3', qualifiers: '3' }))).toEqual({
      ok: false,
      message: 'En zonas de 3 clasifican 1 o 2.',
    })
    expect(parseCategoryForm(form({ ...VALID, price: '-1' }))).toEqual({ ok: false, message: 'Ingresá el precio por pareja, sin puntos.' })
  })
})

describe('parseRegisterForm', () => {
  const MEMBER = { categoryId: ID, myLevel: '5', partnerKind: 'member', partnerProfileId: PROFILE, partnerLevel: '6' }
  const GUEST = { categoryId: ID, myLevel: '5', partnerKind: 'guest', partnerName: ' Pedro Pérez ', partnerPhone: '+598 99 123 456', partnerLevel: '6' }

  it('reads a partner who is a member or from outside', () => {
    expect(parseRegisterForm(form(MEMBER))).toEqual({
      ok: true,
      value: { categoryId: ID, myLevel: 5, partner: { kind: 'member', profileId: PROFILE, level: 6 } },
    })
    expect(parseRegisterForm(form(GUEST))).toEqual({
      ok: true,
      value: { categoryId: ID, myLevel: 5, partner: { kind: 'guest', name: 'Pedro Pérez', phone: '099123456', level: 6 } },
    })
  })

  it('explains what is wrong', () => {
    expect(parseRegisterForm(form({ ...MEMBER, partnerProfileId: '' }))).toEqual({ ok: false, message: 'Elegí a tu compañero de la lista de socios.' })
    expect(parseRegisterForm(form({ ...GUEST, partnerPhone: '123' }))).toEqual({
      ok: false,
      message: 'Revisá el teléfono: tiene que tener entre 8 y 15 números.',
    })
    expect(parseRegisterForm(form({ ...GUEST, partnerName: '' }))).toEqual({ ok: false, message: 'Poné el nombre de tu compañero.' })
    expect(parseRegisterForm(form({ ...MEMBER, myLevel: '9' }))).toEqual({ ok: false, message: 'Elegí tu categoría.' })
    expect(parseRegisterForm(form({ ...MEMBER, categoryId: 'k1' }))).toEqual({ ok: false, message: 'Elegí la categoría.' })
  })
})

describe('parsePairForm', () => {
  it('reads two players and a note', () => {
    const value = parsePairForm(
      form({
        categoryId: ID,
        player1Kind: 'member', player1ProfileId: PROFILE, player1Level: '5',
        player2Kind: 'guest', player2Name: 'Lucía', player2Phone: '099 111 002', player2Level: '5',
        note: 'Pagan el sábado',
      }),
    )
    expect(value).toEqual({
      ok: true,
      value: {
        categoryId: ID,
        player1: { kind: 'member', profileId: PROFILE, level: 5 },
        player2: { kind: 'guest', name: 'Lucía', phone: '099111002', level: 5 },
        note: 'Pagan el sábado',
      },
    })
  })

  it('says which player is wrong', () => {
    expect(
      parsePairForm(form({ categoryId: ID, player1Kind: 'member', player1ProfileId: PROFILE, player1Level: '5', player2Level: '5' })),
    ).toEqual({ ok: false, message: 'Elegí si el jugador 2 es socio o de afuera.' })
  })
})

describe('parseUnavailabilityForm', () => {
  it('reads the blocks marked and a note', () => {
    expect(parseUnavailabilityForm(form({ entryId: ID, blocks: ['2026-10-17@08:00', '2026-10-17@08:00', '2026-10-18@14:00'], note: '' }))).toEqual({
      ok: true,
      value: { entryId: ID, blocks: ['2026-10-17@08:00', '2026-10-18@14:00'], note: null },
    })
    expect(parseUnavailabilityForm(form({ entryId: ID }))).toEqual({ ok: true, value: { entryId: ID, blocks: [], note: null } })
  })

  it('refuses anything that is not a block', () => {
    expect(parseUnavailabilityForm(form({ entryId: ID, blocks: ['sábado'] }))).toEqual({ ok: false, message: 'Revisá los horarios marcados.' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/championship-form.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/domain/championship-form"`).

- [ ] **Step 3: Write the implementation**

`lib/domain/championship-form.ts`:
```ts
import {
  CATEGORY_FORMATS,
  CATEGORY_GENDERS,
  normalizePhone,
  SEEDINGS,
  THIRD_SETS,
  type CategoryFormat,
  type CategoryGender,
  type Seeding,
  type ThirdSet,
} from './championships'
import { isUuid, readBoolean, readEnum, readInt, readLocalDate, readText, readTime, readUuid } from './input'
import type { ParseResult } from './settings'
import { parseTime, zonedTime, type LocalDate } from './time'

// Server Actions read every championship form here, with the same limits as the database functions and a
// Spanish message for each.

export type ChampionshipInput = { name: string; rules: string; maxCategories: number; closesAt: string | null }
export type WindowInput = { championshipId: string; date: LocalDate; fromTime: string; toTime: string; courtIds: string[] }
export type CategoryInput = {
  championshipId: string
  name: string
  gender: CategoryGender
  levelMin: number | null
  levelMax: number | null
  minPairs: number
  maxPairs: number
  price: number
  format: CategoryFormat
  groupSize: number
  qualifiers: number
  matchMinutes: number
  seeding: Seeding
  thirdSet: ThirdSet
  goldenPoint: boolean
}
export type PairPlayerInput =
  | { kind: 'member'; profileId: string; level: number }
  | { kind: 'guest'; name: string; phone: string; level: number }
export type RegisterInput = { categoryId: string; myLevel: number; partner: PairPlayerInput }
export type PairInput = { categoryId: string; player1: PairPlayerInput; player2: PairPlayerInput; note: string | null }
export type UnavailabilityInput = { entryId: string; blocks: string[]; note: string | null }

const PLAYER_KINDS = ['member', 'guest'] as const
const BLOCK_KEY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}@[0-9]{2}:[0-9]{2}$/

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message }
}

// An optional text: empty is null; longer than allowed is undefined (an error for the caller).
function optionalText(form: FormData, name: string, maxLength: number): string | null | undefined {
  const value = form.get(name)
  if (typeof value !== 'string' || value.trim() === '') return null
  const text = value.trim()
  return text.length <= maxLength ? text : undefined
}

export function parseChampionshipForm(form: FormData, timezone: string): ParseResult<ChampionshipInput> {
  const name = readText(form, 'name', { maxLength: 80 })
  if (!name) return fail('Poné un nombre de hasta 80 letras.')
  const rules = optionalText(form, 'rules', 5000)
  if (rules === undefined) return fail('El reglamento tiene hasta 5000 letras.')
  const maxCategories = readInt(form, 'maxCategories', { min: 1, max: 5 })
  if (maxCategories === null) return fail('Cada jugador puede anotarse en 1 a 5 categorías.')

  let closesAt: string | null = null
  if (optionalText(form, 'closesDate', 10) !== null || optionalText(form, 'closesTime', 5) !== null) {
    const date = readLocalDate(form, 'closesDate')
    const time = readTime(form, 'closesTime')
    if (!date || !time) return fail('Completá el día y la hora del cierre, o dejalos vacíos.')
    closesAt = zonedTime(date, parseTime(time), timezone).toISOString()
  }
  return { ok: true, value: { name, rules: rules ?? '', maxCategories, closesAt } }
}

export function parseWindowForm(form: FormData): ParseResult<WindowInput> {
  const championshipId = readUuid(form, 'championshipId')
  if (!championshipId) return fail('Recargá la página y probá de nuevo.')
  const date = readLocalDate(form, 'date')
  const fromTime = readTime(form, 'fromTime')
  const toTime = readTime(form, 'toTime')
  if (!date || !fromTime || !toTime) return fail('Elegí el día y las horas.')
  if (parseTime(fromTime) >= parseTime(toTime)) return fail('"Hasta" tiene que ser después de "Desde".')
  const rawCourts = form.getAll('courtIds')
  const courtIds = [...new Set(rawCourts.filter(isUuid).map((id) => id.toLowerCase()))]
  if (courtIds.length === 0 || courtIds.length !== rawCourts.length || courtIds.length > 20) return fail('Elegí las canchas.')
  return { ok: true, value: { championshipId, date, fromTime, toTime, courtIds } }
}

export function parseCategoryForm(form: FormData): ParseResult<CategoryInput> {
  const championshipId = readUuid(form, 'championshipId')
  if (!championshipId) return fail('Recargá la página y probá de nuevo.')
  const name = readText(form, 'name', { maxLength: 40 })
  if (!name) return fail('Poné un nombre de hasta 40 letras.')
  const gender = readEnum(form, 'gender', CATEGORY_GENDERS)
  if (!gender) return fail('Elegí el género.')

  const levelsGiven = optionalText(form, 'levelMin', 2) !== null || optionalText(form, 'levelMax', 2) !== null
  const levelMin = levelsGiven ? readInt(form, 'levelMin', { min: 1, max: 8 }) : null
  const levelMax = levelsGiven ? readInt(form, 'levelMax', { min: 1, max: 8 }) : null
  if (levelsGiven && (levelMin === null || levelMax === null || levelMin > levelMax)) {
    return fail('La categoría "desde" tiene que ser menor o igual que "hasta", o dejá las dos vacías.')
  }

  const maxPairs = readInt(form, 'maxPairs', { min: 2, max: 64 })
  if (maxPairs === null) return fail('El máximo de parejas va de 2 a 64.')
  const minPairs = readInt(form, 'minPairs', { min: 2, max: maxPairs })
  if (minPairs === null) return fail('El mínimo de parejas va de 2 a 64 y no pasa el máximo.')
  const price = readInt(form, 'price', { min: 0, max: 10_000_000 })
  if (price === null) return fail('Ingresá el precio por pareja, sin puntos.')
  const format = readEnum(form, 'format', CATEGORY_FORMATS)
  if (!format) return fail('Elegí el formato.')
  const groupSize = readInt(form, 'groupSize', { min: 3, max: 4 })
  if (groupSize === null) return fail('Las zonas son de 3 o 4 parejas.')
  const qualifiers = readInt(form, 'qualifiers', { min: 1, max: groupSize - 1 })
  if (qualifiers === null) return fail(`En zonas de ${groupSize} clasifican ${groupSize === 3 ? '1 o 2' : 'de 1 a 3'}.`)
  const matchMinutes = readInt(form, 'matchMinutes', { min: 30, max: 240 })
  if (matchMinutes === null) return fail('La duración de un partido va de 30 a 240 minutos.')
  const seeding = readEnum(form, 'seeding', SEEDINGS)
  if (!seeding) return fail('Elegí cómo se ordenan los cabezas de serie.')
  const thirdSet = readEnum(form, 'thirdSet', THIRD_SETS)
  if (!thirdSet) return fail('Elegí cómo se juega el tercer set.')

  return {
    ok: true,
    value: {
      championshipId,
      name,
      gender,
      levelMin,
      levelMax,
      minPairs,
      maxPairs,
      price,
      format,
      groupSize,
      qualifiers,
      matchMinutes,
      seeding,
      thirdSet,
      goldenPoint: readBoolean(form, 'goldenPoint'),
    },
  }
}

// One player of a pair. The fields start with the prefix (partnerKind, player1Name...); `who` names him in the
// messages ("tu compañero", "el jugador 1").
export function parsePairPlayer(form: FormData, prefix: string, who: string): ParseResult<PairPlayerInput> {
  const kind = readEnum(form, `${prefix}Kind`, PLAYER_KINDS)
  if (!kind) return fail(`Elegí si ${who} es socio o de afuera.`)
  const level = readInt(form, `${prefix}Level`, { min: 1, max: 8 })
  if (level === null) return fail(`Elegí la categoría de ${who}.`)
  if (kind === 'member') {
    const profileId = readUuid(form, `${prefix}ProfileId`)
    if (!profileId) return fail(`Elegí a ${who} de la lista de socios.`)
    return { ok: true, value: { kind, profileId, level } }
  }
  const name = readText(form, `${prefix}Name`, { maxLength: 60 })
  if (!name) return fail(`Poné el nombre de ${who}.`)
  const phone = normalizePhone(readText(form, `${prefix}Phone`, { maxLength: 30 }) ?? '')
  if (!phone) return fail('Revisá el teléfono: tiene que tener entre 8 y 15 números.')
  return { ok: true, value: { kind, name, phone, level } }
}

export function parseRegisterForm(form: FormData): ParseResult<RegisterInput> {
  const categoryId = readUuid(form, 'categoryId')
  if (!categoryId) return fail('Elegí la categoría.')
  const myLevel = readInt(form, 'myLevel', { min: 1, max: 8 })
  if (myLevel === null) return fail('Elegí tu categoría.')
  const partner = parsePairPlayer(form, 'partner', 'tu compañero')
  if (!partner.ok) return partner
  return { ok: true, value: { categoryId, myLevel, partner: partner.value } }
}

export function parsePairForm(form: FormData): ParseResult<PairInput> {
  const categoryId = readUuid(form, 'categoryId')
  if (!categoryId) return fail('Elegí la categoría.')
  const player1 = parsePairPlayer(form, 'player1', 'el jugador 1')
  if (!player1.ok) return player1
  const player2 = parsePairPlayer(form, 'player2', 'el jugador 2')
  if (!player2.ok) return player2
  const note = optionalText(form, 'note', 300)
  if (note === undefined) return fail('La nota tiene hasta 300 letras.')
  return { ok: true, value: { categoryId, player1: player1.value, player2: player2.value, note } }
}

export function parseUnavailabilityForm(form: FormData): ParseResult<UnavailabilityInput> {
  const entryId = readUuid(form, 'entryId')
  if (!entryId) return fail('Recargá la página y probá de nuevo.')
  const raw = form.getAll('blocks')
  if (raw.length > 200 || raw.some((value) => typeof value !== 'string' || !BLOCK_KEY.test(value))) {
    return fail('Revisá los horarios marcados.')
  }
  const blocks = [...new Set(raw as string[])]
  const note = optionalText(form, 'note', 300)
  if (note === undefined) return fail('La nota tiene hasta 300 letras.')
  return { ok: true, value: { entryId, blocks, note } }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run tests/unit/lib/domain/championship-form.test.ts
npm run typecheck
npm run lint
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/championship-form.ts tests/unit/lib/domain/championship-form.test.ts
git commit -m "feat(domain): read the championship forms"
```

---

### Task 13: Inscripciones en Cobros (`lib/domain/championship-payments.ts`)

**Files:**
- Create: `lib/domain/championship-payments.ts`
- Test: `tests/unit/lib/domain/championship-payments.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/championship-payments.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  championshipRefunds,
  overviewStartsAt,
  unpaidChampionshipEntries,
  type OverviewChampionship,
  type OverviewChampionshipEntry,
} from '@/lib/domain/championship-payments'

const TIMEZONE = 'America/Montevideo'

function entry(overrides: Partial<OverviewChampionshipEntry> = {}): OverviewChampionshipEntry {
  return { id: 'e1', status: 'active', player1: { name: 'Ana' }, player2: { name: 'Pedro' }, payments: [], ...overrides }
}

// Started on Saturday 3 of October 2026 at 08:00 (11:00 UTC); '6ta Libre' at $2.000 a pair.
function championship(entries: OverviewChampionshipEntry[], overrides: Partial<OverviewChampionship> = {}): OverviewChampionship {
  return {
    id: 'ch1',
    name: 'Primavera',
    status: 'closed',
    windows: [
      { on_date: '2026-10-04', from_time: '14:00:00' },
      { on_date: '2026-10-03', from_time: '08:00:00' },
    ],
    categories: [{ id: 'k1', name: '6ta Libre', price: 2000, status: 'open', entries }],
    ...overrides,
  }
}

describe('overviewStartsAt', () => {
  it('is the start of the first day of play', () => {
    expect(overviewStartsAt(championship([]), TIMEZONE)).toEqual(new Date('2026-10-03T11:00:00Z'))
    expect(overviewStartsAt(championship([], { windows: [] }), TIMEZONE)).toBeNull()
  })
})

describe('unpaidChampionshipEntries', () => {
  const NOW = new Date('2026-10-05T12:00:00Z')

  it('lists pairs with a place that still owe, once the championship started', () => {
    const rows = [
      championship([
        entry({ id: 'owes', payments: [{ id: 'p1', status: 'confirmed', amount: 500 }] }),
        entry({ id: 'paid', payments: [{ id: 'p2', status: 'confirmed', amount: 2000 }] }),
        entry({ id: 'reported', payments: [{ id: 'p3', status: 'reported', amount: 2000 }] }),
        entry({ id: 'waiting', status: 'waiting' }),
      ]),
    ]
    expect(unpaidChampionshipEntries(rows, NOW, TIMEZONE)).toEqual([
      { entryId: 'owes', holder: 'Ana y Pedro', startsAt: new Date('2026-10-03T11:00:00Z'), what: 'Campeonato Primavera · 6ta Libre', due: 1500 },
    ])
  })

  it('leaves out championships to come or cancelled', () => {
    expect(unpaidChampionshipEntries([championship([entry()])], new Date('2026-10-01T12:00:00Z'), TIMEZONE)).toEqual([])
    expect(unpaidChampionshipEntries([championship([entry()], { status: 'cancelled' })], NOW, TIMEZONE)).toEqual([])
  })
})

describe('championshipRefunds', () => {
  it('lists confirmed payments of pairs that left, and of a cancelled championship', () => {
    const paid = [{ id: 'p1', status: 'confirmed' as const, amount: 2000 }]
    const rows = [
      championship([
        entry({ id: 'left', status: 'withdrawn', payments: paid }),
        entry({ id: 'out', status: 'removed', payments: [{ id: 'p2', status: 'refunded', amount: 2000 }] }),
        entry({ id: 'in', payments: [{ id: 'p3', status: 'confirmed', amount: 2000 }] }),
      ]),
      championship([entry({ id: 'cancelled', payments: [{ id: 'p4', status: 'confirmed', amount: 2000 }] })], { id: 'ch2', name: 'Invierno', status: 'cancelled' }),
    ]
    expect(championshipRefunds(rows, TIMEZONE)).toEqual([
      { paymentId: 'p1', holder: 'Ana y Pedro', startsAt: new Date('2026-10-03T11:00:00Z'), courtName: 'Campeonato Primavera · 6ta Libre', amount: 2000 },
      { paymentId: 'p4', holder: 'Ana y Pedro', startsAt: new Date('2026-10-03T11:00:00Z'), courtName: 'Campeonato Invierno · 6ta Libre', amount: 2000 },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/championship-payments.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/domain/championship-payments"`).

- [ ] **Step 3: Write the implementation**

`lib/domain/championship-payments.ts`:
```ts
import type { CategoryStatus, ChampionshipStatus, EntryStatus } from './championships'
import { amountDue, paymentState, type PaymentLike } from './payments'
import type { OverviewPayment, RefundItem } from './payments-overview'
import { parseTime, zonedTime } from './time'

// What lib/data/payments.ts reads for Cobros. If supabase-js infers a slightly different shape for the
// embeds, adjust these types to match; never cast the query result.
export type OverviewChampionshipEntry = {
  id: string
  status: EntryStatus
  player1: { name: string } | null
  player2: { name: string } | null
  payments: OverviewPayment[]
}
export type OverviewChampionship = {
  id: string
  name: string
  status: ChampionshipStatus
  windows: { on_date: string; from_time: string }[]
  categories: { id: string; name: string; price: number; status: CategoryStatus; entries: OverviewChampionshipEntry[] }[]
}
export type UnpaidChampionshipItem = { entryId: string; holder: string; startsAt: Date; what: string; due: number }

// The start of the first day of play, on the club's clock; null without days.
export function overviewStartsAt(championship: Pick<OverviewChampionship, 'windows'>, timezone: string): Date | null {
  const starts = championship.windows.map((window) => zonedTime(window.on_date, parseTime(window.from_time), timezone).getTime())
  return starts.length > 0 ? new Date(Math.min(...starts)) : null
}

const pairOf = (entry: OverviewChampionshipEntry) => `${entry.player1?.name ?? 'Jugador'} y ${entry.player2?.name ?? 'Jugador'}`
const whatOf = (championship: OverviewChampionship, category: { name: string }) => `Campeonato ${championship.name} · ${category.name}`

// Pairs with a place in championships that already started (not cancelled) that still owe and have no
// transfer waiting for review. Before it starts, reception charges from the championship page.
export function unpaidChampionshipEntries(rows: OverviewChampionship[], now: Date, timezone: string): UnpaidChampionshipItem[] {
  return rows.flatMap((championship) => {
    const startsAt = overviewStartsAt(championship, timezone)
    if (championship.status === 'cancelled' || !startsAt || startsAt > now) return []
    return championship.categories.flatMap((category) =>
      category.entries.flatMap((entry) => {
        const payments: PaymentLike[] = entry.payments
        if (entry.status !== 'active' || paymentState({ price: category.price, status: 'confirmed' }, payments) !== 'pending') return []
        return [{ entryId: entry.id, holder: pairOf(entry), startsAt, what: whatOf(championship, category), due: amountDue(category.price, payments) }]
      }),
    )
  })
}

// Money the club took for a pair that withdrew or was taken out (also by a cancelled category), or for a
// championship that was cancelled: given back by hand.
export function championshipRefunds(rows: OverviewChampionship[], timezone: string): RefundItem[] {
  return rows.flatMap((championship) => {
    const startsAt = overviewStartsAt(championship, timezone)
    if (!startsAt) return []
    return championship.categories.flatMap((category) =>
      category.entries.flatMap((entry) => {
        const gone = championship.status === 'cancelled' || entry.status === 'withdrawn' || entry.status === 'removed'
        if (!gone) return []
        return entry.payments
          .filter((payment) => payment.status === 'confirmed')
          .map((payment) => ({
            paymentId: payment.id,
            holder: pairOf(entry),
            startsAt,
            courtName: whatOf(championship, category),
            amount: payment.amount,
          }))
      }),
    )
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run tests/unit/lib/domain/championship-payments.test.ts
npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit and push**

```bash
git add lib/domain/championship-payments.ts tests/unit/lib/domain/championship-payments.test.ts
git commit -m "feat(domain): championship pairs owed and to give back"
git push
```

---
## Corte 4: Datos y acciones

### Task 14: Lecturas de campeonatos (`lib/data/championships.ts`)

**Files:**
- Create: `lib/data/championships.ts`

- [ ] **Step 1: Write the loaders** (no test — lecturas de Supabase con la sesión del usuario; las reglas están en `lib/domain/championships.ts`, con sus tests, y el flujo lo cubre el e2e)

`lib/data/championships.ts`:
```ts
import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import { toChampionship, type Championship } from '@/lib/domain/championships'
import type { MemberOption } from '@/lib/domain/members'
import { createClient } from '@/lib/supabase/server'

// FK hints: championship_entries points at players twice, and every embed goes through a composite FK.
// Players come without phone or email (column privileges): those come from championship_contacts.
const CHAMPIONSHIP_SELECT =
  'id, name, rules, poster_path, status, registration_opens_at, registration_closes_at, max_categories_per_player, windows:championship_windows!championship_windows_championship_in_club(id, on_date, from_time, to_time, court_ids), categories:championship_categories!championship_categories_championship_in_club(id, name, gender, level_min, level_max, min_pairs, max_pairs, price, format, group_size, qualifiers_per_group, match_minutes, seeding, match_rules, status, merged_into, sort_order, entries:championship_entries!championship_entries_category_in_club(id, player1_level, player2_level, status, note, unavailability_note, unavailability_approved, created_at, player1:players!championship_entries_player1_in_club(id, name, profile_id), player2:players!championship_entries_player2_in_club(id, name, profile_id), payments!payments_championship_entry_in_club(status, amount, rejection_reason, created_at), unavailability:entry_unavailability!entry_unavailability_entry_in_club(on_date, from_time)))'

// The club's championships, newest first, read with the viewer's session: members get the ones out of draft,
// staff every one (RLS). Payments and hours come back only to the pair and to staff.
export async function loadChampionships(club: Club): Promise<Championship[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('championships')
    .select(CHAMPIONSHIP_SELECT)
    .eq('club_id', club.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((row) => toChampionship(row, club.timezone))
}

export async function loadChampionship(club: Club, id: string): Promise<Championship | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('championships')
    .select(CHAMPIONSHIP_SELECT)
    .eq('club_id', club.id)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? toChampionship(data, club.timezone) : null
}

// To pick a partner: the other members with a public profile (public.member_directory).
export async function loadMemberDirectory(club: Club): Promise<MemberOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('member_directory', { p_club_id: club.id })
  if (error) throw error
  return data.map((row) => ({ userId: row.user_id, name: row.name }))
}

// Player id → phone, for what the viewer may see: every player for staff, her pairs' for a member.
export async function loadChampionshipPhones(championshipId: string): Promise<Map<string, string>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('championship_contacts', { p_championship_id: championshipId })
  if (error) throw error
  return new Map(data.flatMap((row) => (row.phone ? [[row.player_id, row.phone] as const] : [])))
}
```

- [ ] **Step 2: Typecheck and tests**

Run:
```bash
npm run typecheck
npm test
npm run lint
```
Expected: PASS. Si supabase-js infiere para algún embed una forma distinta de `ChampionshipRow` (por ejemplo `player1` como objeto no nulo), se ajusta el tipo en `lib/domain/championships.ts`; nunca se castea.

- [ ] **Step 3: Commit**

```bash
git add lib/data/championships.ts
git commit -m "feat(data): load championships, partners and phones"
```

---

### Task 15: Acciones del jugador (`lib/actions/championships.ts`)

**Files:**
- Create: `lib/actions/championships.ts`
- Test: `tests/unit/lib/actions/championship-actions.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/actions/championship-actions.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INVALID_INPUT } from '@/lib/actions/result'

// Server Actions are reachable by any POST: bad input must stop before any RPC.
type RpcResult = { data: unknown; error: { message: string } | null }
const rpc = vi.fn<(name: string, args?: Record<string, unknown>) => Promise<RpcResult>>(async () => ({
  data: { id: 'e-new', status: 'active' },
  error: null,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))

const { registerPair, reportChampionshipTransfer, saveUnavailability, withdrawEntry } = await import('@/lib/actions/championships')
const { errorMessage } = await import('@/lib/domain/errors')

const ID = '55555555-5555-5555-5555-555555555555'
const PROFILE = '66666666-6666-6666-6666-666666666666'
const IDLE = { status: 'idle' as const }

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item)
  }
  return data
}

beforeEach(() => {
  rpc.mockClear()
})

describe('registerPair', () => {
  const MEMBER = { categoryId: ID, myLevel: '5', partnerKind: 'member', partnerProfileId: PROFILE, partnerLevel: '6' }
  const GUEST = { categoryId: ID, myLevel: '5', partnerKind: 'guest', partnerName: 'Pedro', partnerPhone: '099 123 456', partnerLevel: '6' }

  it('explains bad input without calling the database', async () => {
    expect(await registerPair(IDLE, form({ ...GUEST, partnerPhone: '12' }))).toEqual({
      status: 'error',
      message: 'Revisá el teléfono: tiene que tener entre 8 y 15 números.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('signs up with a member or with someone from outside', async () => {
    expect(await registerPair(IDLE, form(MEMBER))).toEqual({
      status: 'ok',
      message: 'Listo, quedaron anotados. Pagá la inscripción cuando quieras desde acá.',
    })
    await registerPair(IDLE, form(GUEST))
    expect(rpc.mock.calls).toEqual([
      ['register_championship_pair', { p_category_id: ID, p_my_level: 5, p_partner_level: 6, p_partner_profile_id: PROFILE }],
      ['register_championship_pair', { p_category_id: ID, p_my_level: 5, p_partner_level: 6, p_partner_name: 'Pedro', p_partner_phone: '099123456' }],
    ])
  })

  it('says when the pair waits in line', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'e-new', status: 'waiting' }, error: null })
    expect(await registerPair(IDLE, form(MEMBER))).toEqual({
      status: 'ok',
      message: 'Quedaron en la lista de espera. Si se libera un lugar, entran solos y te avisamos.',
    })
  })

  it('says why it could not', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'too_many_categories' } })
    expect(await registerPair(IDLE, form(MEMBER))).toEqual({ status: 'error', message: errorMessage('too_many_categories') })
  })
})

describe('withdrawEntry and saveUnavailability', () => {
  it('reject a bad id without calling the database', async () => {
    expect(await withdrawEntry(IDLE, form({ entryId: 'e1' }))).toEqual(INVALID_INPUT)
    expect(await saveUnavailability(IDLE, form({ entryId: ID, blocks: ['sábado'] }))).toEqual({
      status: 'error',
      message: 'Revisá los horarios marcados.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('call each function', async () => {
    expect((await withdrawEntry(IDLE, form({ entryId: ID }))).message).toBe(
      'Se dieron de baja. Si ya habían pagado, el club les devuelve la plata.',
    )
    expect((await saveUnavailability(IDLE, form({ entryId: ID, blocks: ['2026-10-17@08:00'], note: 'Trabajo' }))).message).toBe(
      'Horarios guardados.',
    )
    await saveUnavailability(IDLE, form({ entryId: ID }))
    expect(rpc.mock.calls).toEqual([
      ['withdraw_championship_entry', { p_entry_id: ID }],
      ['set_entry_unavailability', { p_entry_id: ID, p_blocks: ['2026-10-17@08:00'], p_note: 'Trabajo' }],
      ['set_entry_unavailability', { p_entry_id: ID, p_blocks: [] }],
    ])
  })
})

describe('reportChampionshipTransfer', () => {
  it('reports the transfer of the pair with its receipt', async () => {
    expect(await reportChampionshipTransfer('e1', null)).toEqual(INVALID_INPUT)
    expect(await reportChampionshipTransfer(ID, `${PROFILE}/r.png`)).toEqual({
      status: 'ok',
      message: 'Listo, le avisamos al club. Te confirma el pago cuando lo vea.',
    })
    expect(rpc).toHaveBeenCalledWith('report_championship_transfer', { p_entry_id: ID, p_receipt_path: `${PROFILE}/r.png` })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/actions/championship-actions.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/actions/championships"`).

- [ ] **Step 3: Write the actions**

`lib/actions/championships.ts`:
```ts
'use server'

import { failed, fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { parseRegisterForm, parseUnavailabilityForm } from '@/lib/domain/championship-form'
import { errorMessage } from '@/lib/domain/errors'
import { isUuid, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

// "Anotarme": the category, the category she plays and her partner (a member or someone from outside).
export async function registerPair(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = parseRegisterForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const { categoryId, myLevel, partner } = parsed.value
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('register_championship_pair', {
    p_category_id: categoryId,
    p_my_level: myLevel,
    p_partner_level: partner.level,
    ...(partner.kind === 'member'
      ? { p_partner_profile_id: partner.profileId }
      : { p_partner_name: partner.name, p_partner_phone: partner.phone }),
  })
  revalidateBookings()
  if (error) return failed(errorMessage(error.message))
  return ok(
    data.status === 'waiting'
      ? 'Quedaron en la lista de espera. Si se libera un lugar, entran solos y te avisamos.'
      : 'Listo, quedaron anotados. Pagá la inscripción cuando quieras desde acá.',
  )
}

// "Darme de baja": the whole pair leaves; the first in line gets the place.
export async function withdrawEntry(_previous: ActionState, form: FormData): Promise<ActionState> {
  const entryId = readUuid(form, 'entryId')
  if (!entryId) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('withdraw_championship_entry', { p_entry_id: entryId })
  revalidateBookings()
  return fromRpc(error, 'Se dieron de baja. Si ya habían pagado, el club les devuelve la plata.')
}

// "Horarios imposibles", for a player of the pair or for staff (the database decides what each may save).
export async function saveUnavailability(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = parseUnavailabilityForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const { entryId, blocks, note } = parsed.value
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_entry_unavailability', {
    p_entry_id: entryId,
    p_blocks: blocks,
    ...(note ? { p_note: note } : {}),
  })
  revalidateBookings()
  return fromRpc(error, 'Horarios guardados.')
}

// Called after the browser uploaded the receipt; report_championship_transfer checks the path is hers.
export async function reportChampionshipTransfer(entryId: string, receiptPath: string | null): Promise<ActionState> {
  if (!isUuid(entryId)) return INVALID_INPUT
  if (receiptPath !== null && (typeof receiptPath !== 'string' || receiptPath.length > 300)) return INVALID_INPUT
  const supabase = await createClient()
  const { error } = await supabase.rpc('report_championship_transfer', {
    p_entry_id: entryId,
    p_receipt_path: receiptPath ?? undefined,
  })
  revalidateBookings()
  return fromRpc(error, 'Listo, le avisamos al club. Te confirma el pago cuando lo vea.')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run tests/unit/lib/actions/championship-actions.test.ts
npm run typecheck
npm run lint
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/championships.ts tests/unit/lib/actions/championship-actions.test.ts
git commit -m "feat(actions): sign up a pair, withdraw, hours and transfer"
```

---

### Task 16: Acciones del organizador (`app/(club)/club/torneos/campeonatos/actions.ts`)

**Files:**
- Create: `app/(club)/club/torneos/campeonatos/actions.ts`
- Test: `tests/unit/lib/actions/championship-club-actions.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/actions/championship-club-actions.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INVALID_INPUT } from '@/lib/actions/result'

// Server Actions are reachable by any POST: bad input must stop before any RPC.
type RpcResult = { data: unknown; error: { message: string } | null }
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<RpcResult>>(async () => ({
  data: { id: 'ch-new', status: 'active' },
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

const club = await import('@/app/(club)/club/torneos/campeonatos/actions')
const { errorMessage } = await import('@/lib/domain/errors')

const ID = '55555555-5555-5555-5555-555555555555'
const OTHER = '77777777-7777-7777-7777-777777777777'
const PROFILE = '66666666-6666-6666-6666-666666666666'
const C1 = '22222222-2222-2222-2222-222222222201'
const IDLE = { status: 'idle' as const }

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

describe('the draft', () => {
  const DETAILS = { name: 'Primavera', rules: 'Al mejor de 3 sets.', maxCategories: '2', closesDate: '', closesTime: '' }

  it('creates a championship and goes to it', async () => {
    expect(await club.createChampionship(IDLE, form({ ...DETAILS, name: '' }))).toEqual({
      status: 'error',
      message: 'Poné un nombre de hasta 80 letras.',
    })
    expect(rpc).not.toHaveBeenCalled()
    await expect(club.createChampionship(IDLE, form(DETAILS))).rejects.toThrow('NEXT_REDIRECT /club/torneos/campeonatos/ch-new')
    expect(rpc).toHaveBeenCalledWith('create_championship', {
      p_club_id: 'club-1',
      p_name: 'Primavera',
      p_rules: 'Al mejor de 3 sets.',
      p_max_categories: 2,
    })
  })

  it('edits it, with the deadline on the club clock', async () => {
    const result = await club.updateChampionship(
      IDLE,
      form({ ...DETAILS, championshipId: ID, closesDate: '2026-10-16', closesTime: '20:00' }),
    )
    expect(result).toEqual({ status: 'ok', message: 'Datos guardados.' })
    expect(rpc).toHaveBeenCalledWith('update_championship', {
      p_championship_id: ID,
      p_name: 'Primavera',
      p_rules: 'Al mejor de 3 sets.',
      p_max_categories: 2,
      p_registration_closes_at: '2026-10-16T23:00:00.000Z',
    })
  })

  it('adds and deletes days of play and categories', async () => {
    await club.addWindow(IDLE, form({ championshipId: ID, date: '2026-10-17', fromTime: '08:00', toTime: '14:00', courtIds: [C1] }))
    await club.deleteWindow(IDLE, form({ windowId: OTHER }))
    await club.addCategory(
      IDLE,
      form({
        championshipId: ID, name: '6ta Libre', gender: 'open', levelMin: '5', levelMax: '6', minPairs: '4', maxPairs: '12',
        price: '2000', format: 'groups_knockout', groupSize: '4', qualifiers: '2', matchMinutes: '90', seeding: 'ranking',
        thirdSet: 'super_tiebreak',
      }),
    )
    await club.deleteCategory(IDLE, form({ categoryId: OTHER }))
    expect(rpc.mock.calls).toEqual([
      ['add_championship_window', { p_championship_id: ID, p_date: '2026-10-17', p_from: '08:00', p_to: '14:00', p_court_ids: [C1] }],
      ['delete_championship_window', { p_window_id: OTHER }],
      [
        'add_championship_category',
        {
          p_championship_id: ID, p_name: '6ta Libre', p_gender: 'open', p_min_pairs: 4, p_max_pairs: 12, p_price: 2000,
          p_format: 'groups_knockout', p_group_size: 4, p_qualifiers: 2, p_match_minutes: 90, p_seeding: 'ranking',
          p_third_set: 'super_tiebreak', p_golden_point: false, p_level_min: 5, p_level_max: 6,
        },
      ],
      ['delete_championship_category', { p_category_id: OTHER }],
    ])
  })

  it('rejects a bad id without calling the database', async () => {
    for (const action of [club.deleteWindow, club.deleteCategory, club.openRegistration, club.closeRegistration, club.cancelChampionship]) {
      expect(await action(IDLE, form({ windowId: 'w1', categoryId: 'k1', championshipId: 'ch1' }))).toEqual(INVALID_INPUT)
    }
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('the steps', () => {
  it('opens, closes and cancels', async () => {
    expect((await club.openRegistration(IDLE, form({ championshipId: ID }))).message).toBe(
      'Inscripción abierta. Las canchas de los días de juego quedaron bloqueadas.',
    )
    expect((await club.closeRegistration(IDLE, form({ championshipId: ID }))).message).toBe(
      'Inscripción cerrada. Desde ahora solo el club carga o quita parejas.',
    )
    expect((await club.cancelChampionship(IDLE, form({ championshipId: ID }))).message).toBe(
      'Campeonato cancelado. Las canchas quedaron libres y lo cobrado está en Cobros para devolver.',
    )
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'open_championship_registration',
      'close_championship_registration',
      'cancel_championship',
    ])
  })

  it('says why it could not', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'courts_busy' } })
    expect(await club.openRegistration(IDLE, form({ championshipId: ID }))).toEqual({ status: 'error', message: errorMessage('courts_busy') })
  })
})

describe('the pairs', () => {
  it('loads a whole pair, a member and someone from outside', async () => {
    const result = await club.addPair(
      IDLE,
      form({
        categoryId: ID,
        player1Kind: 'member', player1ProfileId: PROFILE, player1Level: '5',
        player2Kind: 'guest', player2Name: 'Lucía', player2Phone: '099 111 002', player2Level: '6',
        note: '',
      }),
    )
    expect(result).toEqual({ status: 'ok', message: 'Pareja cargada.' })
    expect(rpc).toHaveBeenCalledWith('add_championship_pair', {
      p_category_id: ID,
      p_player1_level: 5,
      p_player2_level: 6,
      p_player1_profile_id: PROFILE,
      p_player2_name: 'Lucía',
      p_player2_phone: '099111002',
    })
  })

  it('says when the pair it loaded waits', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'e-new', status: 'waiting' }, error: null })
    const result = await club.addPair(
      IDLE,
      form({
        categoryId: ID,
        player1Kind: 'guest', player1Name: 'Marta', player1Phone: '099111003', player1Level: '5',
        player2Kind: 'guest', player2Name: 'Tomás', player2Phone: '099555666', player2Level: '5',
        note: 'Paga el sábado',
      }),
    )
    expect(result).toEqual({ status: 'ok', message: 'Pareja cargada en la lista de espera.' })
  })

  it('takes out, moves, charges, merges and cancels', async () => {
    await club.removePair(IDLE, form({ entryId: ID }))
    await club.movePair(IDLE, form({ entryId: ID, categoryId: OTHER }))
    await club.recordChampionshipCash(IDLE, form({ entryId: ID, amount: '2000' }))
    await club.mergeCategory(IDLE, form({ categoryId: ID, intoId: OTHER }))
    await club.cancelCategory(IDLE, form({ categoryId: ID }))
    expect(rpc.mock.calls).toEqual([
      ['remove_championship_entry', { p_entry_id: ID }],
      ['move_championship_entry', { p_entry_id: ID, p_category_id: OTHER }],
      ['record_championship_cash', { p_entry_id: ID, p_amount: 2000 }],
      ['merge_championship_category', { p_category_id: ID, p_into_id: OTHER }],
      ['cancel_championship_category', { p_category_id: ID }],
    ])
  })

  it('rejects bad input without calling the database', async () => {
    expect(await club.movePair(IDLE, form({ entryId: ID, categoryId: 'k2' }))).toEqual(INVALID_INPUT)
    expect(await club.recordChampionshipCash(IDLE, form({ entryId: ID, amount: '0' }))).toEqual(INVALID_INPUT)
    expect(await club.mergeCategory(IDLE, form({ categoryId: ID, intoId: '' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/actions/championship-club-actions.test.ts`
Expected: FAIL (`Failed to resolve import "@/app/(club)/club/torneos/campeonatos/actions"`).

- [ ] **Step 3: Write the actions**

`app/(club)/club/torneos/campeonatos/actions.ts`:
```ts
'use server'

import { redirect } from 'next/navigation'
import { failed, fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { getViewer } from '@/lib/auth/viewer'
import {
  parseCategoryForm,
  parseChampionshipForm,
  parsePairForm,
  parseWindowForm,
  type PairPlayerInput,
} from '@/lib/domain/championship-form'
import { errorMessage } from '@/lib/domain/errors'
import { readInt, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>
type RpcCall = PromiseLike<{ error: { message: string } | null }>

const SESSION_EXPIRED = failed('Tu sesión venció. Volvé a ingresar.')

// The database checks the caller is staff; these only check the shape of what comes in.
async function run(call: (supabase: Supabase) => RpcCall, okMessage: string): Promise<ActionState> {
  const supabase = await createClient()
  const { error } = await call(supabase)
  revalidateBookings()
  return fromRpc(error, okMessage)
}

async function onId(
  form: FormData,
  field: string,
  call: (supabase: Supabase, id: string) => RpcCall,
  okMessage: string,
): Promise<ActionState> {
  const id = readUuid(form, field)
  if (!id) return INVALID_INPUT
  return run((supabase) => call(supabase, id), okMessage)
}

export async function createChampionship(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return SESSION_EXPIRED
  const parsed = parseChampionshipForm(form, viewer.club.timezone)
  if (!parsed.ok) return failed(parsed.message)
  const { name, rules, maxCategories, closesAt } = parsed.value
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_championship', {
    p_club_id: viewer.club.id,
    p_name: name,
    p_rules: rules,
    p_max_categories: maxCategories,
    ...(closesAt ? { p_registration_closes_at: closesAt } : {}),
  })
  if (error) return fromRpc(error, '')
  revalidateBookings()
  redirect(`/club/torneos/campeonatos/${data.id}`)
}

export async function updateChampionship(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return SESSION_EXPIRED
  const championshipId = readUuid(form, 'championshipId')
  if (!championshipId) return INVALID_INPUT
  const parsed = parseChampionshipForm(form, viewer.club.timezone)
  if (!parsed.ok) return failed(parsed.message)
  const { name, rules, maxCategories, closesAt } = parsed.value
  return run(
    (supabase) =>
      supabase.rpc('update_championship', {
        p_championship_id: championshipId,
        p_name: name,
        p_rules: rules,
        p_max_categories: maxCategories,
        ...(closesAt ? { p_registration_closes_at: closesAt } : {}),
      }),
    'Datos guardados.',
  )
}

export async function addWindow(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = parseWindowForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const { championshipId, date, fromTime, toTime, courtIds } = parsed.value
  return run(
    (supabase) =>
      supabase.rpc('add_championship_window', {
        p_championship_id: championshipId,
        p_date: date,
        p_from: fromTime,
        p_to: toTime,
        p_court_ids: courtIds,
      }),
    'Día de juego agregado.',
  )
}

export async function deleteWindow(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onId(form, 'windowId', (supabase, id) => supabase.rpc('delete_championship_window', { p_window_id: id }), 'Día de juego quitado.')
}

export async function addCategory(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = parseCategoryForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const input = parsed.value
  return run(
    (supabase) =>
      supabase.rpc('add_championship_category', {
        p_championship_id: input.championshipId,
        p_name: input.name,
        p_gender: input.gender,
        p_min_pairs: input.minPairs,
        p_max_pairs: input.maxPairs,
        p_price: input.price,
        p_format: input.format,
        p_group_size: input.groupSize,
        p_qualifiers: input.qualifiers,
        p_match_minutes: input.matchMinutes,
        p_seeding: input.seeding,
        p_third_set: input.thirdSet,
        p_golden_point: input.goldenPoint,
        ...(input.levelMin !== null && input.levelMax !== null ? { p_level_min: input.levelMin, p_level_max: input.levelMax } : {}),
      }),
    'Categoría agregada.',
  )
}

export async function deleteCategory(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onId(form, 'categoryId', (supabase, id) => supabase.rpc('delete_championship_category', { p_category_id: id }), 'Categoría quitada.')
}

export async function openRegistration(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onId(
    form,
    'championshipId',
    (supabase, id) => supabase.rpc('open_championship_registration', { p_championship_id: id }),
    'Inscripción abierta. Las canchas de los días de juego quedaron bloqueadas.',
  )
}

export async function closeRegistration(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onId(
    form,
    'championshipId',
    (supabase, id) => supabase.rpc('close_championship_registration', { p_championship_id: id }),
    'Inscripción cerrada. Desde ahora solo el club carga o quita parejas.',
  )
}

export async function cancelChampionship(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onId(
    form,
    'championshipId',
    (supabase, id) => supabase.rpc('cancel_championship', { p_championship_id: id }),
    'Campeonato cancelado. Las canchas quedaron libres y lo cobrado está en Cobros para devolver.',
  )
}

function player1Args(player: PairPlayerInput) {
  return player.kind === 'member'
    ? { p_player1_profile_id: player.profileId }
    : { p_player1_name: player.name, p_player1_phone: player.phone }
}

function player2Args(player: PairPlayerInput) {
  return player.kind === 'member'
    ? { p_player2_profile_id: player.profileId }
    : { p_player2_name: player.name, p_player2_phone: player.phone }
}

// "Cargar pareja": members, people from outside or one of each.
export async function addPair(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = parsePairForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const { categoryId, player1, player2, note } = parsed.value
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('add_championship_pair', {
    p_category_id: categoryId,
    p_player1_level: player1.level,
    p_player2_level: player2.level,
    ...player1Args(player1),
    ...player2Args(player2),
    ...(note ? { p_note: note } : {}),
  })
  revalidateBookings()
  if (error) return failed(errorMessage(error.message))
  return ok(data.status === 'waiting' ? 'Pareja cargada en la lista de espera.' : 'Pareja cargada.')
}

export async function removePair(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onId(
    form,
    'entryId',
    (supabase, id) => supabase.rpc('remove_championship_entry', { p_entry_id: id }),
    'Pareja quitada. Si había pagado, aparece en Cobros para devolver.',
  )
}

export async function movePair(_previous: ActionState, form: FormData): Promise<ActionState> {
  const entryId = readUuid(form, 'entryId')
  const categoryId = readUuid(form, 'categoryId')
  if (!entryId || !categoryId) return INVALID_INPUT
  return run(
    (supabase) => supabase.rpc('move_championship_entry', { p_entry_id: entryId, p_category_id: categoryId }),
    'Pareja movida. Si no había lugar, quedó en la lista de espera.',
  )
}

export async function recordChampionshipCash(_previous: ActionState, form: FormData): Promise<ActionState> {
  const entryId = readUuid(form, 'entryId')
  const amount = readInt(form, 'amount', { min: 1, max: 10_000_000 })
  if (!entryId || amount === null) return INVALID_INPUT
  return run(
    (supabase) => supabase.rpc('record_championship_cash', { p_entry_id: entryId, p_amount: amount }),
    'Pago en efectivo registrado.',
  )
}

export async function mergeCategory(_previous: ActionState, form: FormData): Promise<ActionState> {
  const categoryId = readUuid(form, 'categoryId')
  const intoId = readUuid(form, 'intoId')
  if (!categoryId || !intoId) return INVALID_INPUT
  return run(
    (supabase) => supabase.rpc('merge_championship_category', { p_category_id: categoryId, p_into_id: intoId }),
    'Categorías fusionadas. Las parejas que no entraron quedaron en espera.',
  )
}

export async function cancelCategory(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onId(
    form,
    'categoryId',
    (supabase, id) => supabase.rpc('cancel_championship_category', { p_category_id: id }),
    'Categoría cancelada. Lo cobrado está en Cobros para devolver.',
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run tests/unit/lib/actions/championship-club-actions.test.ts
npm run typecheck
npm run lint
```
Expected: PASS.

- [ ] **Step 5: Commit and push**

```bash
git add "app/(club)/club/torneos/campeonatos/actions.ts" tests/unit/lib/actions/championship-club-actions.test.ts
git commit -m "feat(actions): the organizer's championship actions"
git push
```

---
## Corte 5: Pantallas del jugador

### Task 17: Campeonatos en la pestaña Torneos

**Files:**
- Modify: `components/nav/tab-nav.tsx:10`, `components/nav/tab-nav.tsx:52` (la pestaña marcada)
- Modify: `app/(jugador)/layout.tsx:12`
- Modify: `lib/domain/championships.ts` (agrega `upcomingChampionships`)
- Create: `components/championships/championship-card.tsx`
- Modify: `app/(jugador)/torneos/page.tsx`
- Test: `tests/unit/components/nav/tab-nav.test.tsx`, `tests/unit/lib/domain/championships.test.ts`, `tests/unit/components/championships/championship-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/components/nav/tab-nav.test.tsx`, add inside `describe('TabNav', …)` (the pathname is mocked as `/reservas`):
```tsx
  it('marks a tab for the other paths it covers', () => {
    render(<TabNav label="Secciones" items={[{ href: '/torneos', label: 'Torneos', icon: 'trophy', also: ['/reservas'] }]} variant="bottom" />)
    expect(screen.getByRole('link', { name: 'Torneos' })).toHaveAttribute('aria-current', 'page')
  })
```

In `tests/unit/lib/domain/championships.test.ts`, add `upcomingChampionships` to the import list and append:
```ts
describe('upcomingChampionships', () => {
  it('lists the ones members can sign up to or that are still to be played, first to start first', () => {
    const later = makeChampionship({ id: 'later', startsAt: new Date('2026-11-01T11:00:00Z'), endsAt: new Date('2026-11-01T23:00:00Z') })
    const sooner = makeChampionship({ id: 'sooner' })
    const over = makeChampionship({ id: 'over', status: 'closed', startsAt: new Date('2026-10-01T11:00:00Z'), endsAt: new Date('2026-10-02T23:00:00Z') })
    const cancelled = makeChampionship({ id: 'cancelled', status: 'cancelled' })
    const draft = makeChampionship({ id: 'draft', status: 'draft' })
    expect(upcomingChampionships([later, over, cancelled, sooner, draft], NOW).map((championship) => championship.id)).toEqual(['sooner', 'later'])
  })
})
```

`tests/unit/components/championships/championship-card.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChampionshipCard } from '@/components/championships/championship-card'
import { makeCategory, makeChampionship } from '../../fixtures/championships'

describe('ChampionshipCard', () => {
  it('says when it is played, its status and its categories, and leads to it', () => {
    const championship = makeChampionship({
      categories: [makeCategory(), makeCategory({ id: 'k2', name: '5ta Damas' }), makeCategory({ id: 'k3', name: '4ta', status: 'cancelled' })],
    })
    render(<ChampionshipCard championship={championship} href="/campeonatos/ch1" actionLabel="Ver categorías y anotarme" primary />)
    expect(screen.getByText('Campeonato de Primavera')).toBeInTheDocument()
    expect(screen.getByText('Del sábado 17 de octubre al domingo 18 de octubre')).toBeInTheDocument()
    expect(screen.getByText('Inscripción abierta')).toBeInTheDocument()
    expect(screen.getByText('6ta Libre · 5ta Damas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver categorías y anotarme' })).toHaveAttribute('href', '/campeonatos/ch1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/nav/tab-nav.test.tsx tests/unit/lib/domain/championships.test.ts tests/unit/components/championships/championship-card.test.tsx`
Expected: FAIL (`also` no existe en `TabItem`; `upcomingChampionships` no se exporta; no resuelve `championship-card`).

- [ ] **Step 3: Write the implementation**

In `components/nav/tab-nav.tsx`, replace the `TabItem` type:
```ts
// `also`: other paths that belong to this tab (e.g. /campeonatos under Torneos).
export type TabItem = { href: string; label: string; icon: IconName; also?: string[] }
```
and inside `items.map`, replace:
```ts
          const current = isCurrent(pathname, item.href)
```
with:
```ts
          const current = isCurrent(pathname, item.href) || (item.also ?? []).some((href) => isCurrent(pathname, href))
```

In `app/(jugador)/layout.tsx`, replace the Torneos tab with:
```ts
  { href: '/torneos', label: 'Torneos', icon: 'trophy', also: ['/campeonatos'] },
```

Append to `lib/domain/championships.ts`:
```ts
// What the Torneos tab shows: championships out of draft, not cancelled nor finished, that did not end yet
// (or have no days yet), the first to start first.
export function upcomingChampionships(championships: Championship[], now: Date): Championship[] {
  return championships
    .filter(
      (championship) =>
        !['draft', 'cancelled', 'finished'].includes(championship.status) &&
        (championship.endsAt === null || championship.endsAt.getTime() > now.getTime()),
    )
    .sort((a, b) => (a.startsAt?.getTime() ?? Infinity) - (b.startsAt?.getTime() ?? Infinity))
}
```

`components/championships/championship-card.tsx`:
```tsx
import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CHAMPIONSHIP_STATUS_LABELS, datesText, openCategories, type Championship } from '@/lib/domain/championships'

// Design: "Campeonatos" in the Torneos tab, and the club's list. Signing up goes through the detail page.
export function ChampionshipCard({
  championship,
  href,
  actionLabel,
  primary = false,
}: {
  championship: Championship
  href: string
  actionLabel: string
  primary?: boolean
}) {
  const categories = openCategories(championship)
  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-bold uppercase">{championship.name}</p>
          <p className="text-sm text-fg-muted">{datesText(championship)}</p>
        </div>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
          {CHAMPIONSHIP_STATUS_LABELS[championship.status]}
        </span>
      </div>
      <p className="text-sm">
        {categories.length > 0 ? categories.map((category) => category.name).join(' · ') : 'Sin categorías todavía'}
      </p>
      <Link href={href} className={buttonClasses({ variant: primary ? 'primary' : 'secondary', fullWidth: true, className: 'mt-auto' })}>
        {actionLabel}
      </Link>
    </Card>
  )
}
```

In `app/(jugador)/torneos/page.tsx`, add the imports:
```ts
import { ChampionshipCard } from '@/components/championships/championship-card'
import { loadChampionships } from '@/lib/data/championships'
import { registrationOpen, upcomingChampionships } from '@/lib/domain/championships'
```
replace the `Promise.all` with:
```ts
  const [tournaments, context, championships] = await Promise.all([
    loadTournaments(club, { endsAfter: new Date(now.getTime() - 7 * 86_400_000) }),
    loadPlayerContext(viewer, now),
    loadChampionships(club),
  ])
  const upcomingChampionshipsList = upcomingChampionships(championships, now)
```
and replace everything from the `<div>` with the `h1` down to the `ul`/empty message of `upcoming` (both included) with:
```tsx
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">Torneos</h1>
        <p className="text-fg-muted">Campeonatos por parejas y americanos del club.</p>
      </div>
      {upcomingChampionshipsList.length > 0 ? (
        <section aria-labelledby="campeonatos" className="flex flex-col gap-3">
          <h2 id="campeonatos" className="font-display text-2xl font-bold uppercase">
            Campeonatos
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {upcomingChampionshipsList.map((championship) => {
              const open = registrationOpen(championship, now)
              return (
                <li key={championship.id}>
                  <ChampionshipCard
                    championship={championship}
                    href={`/campeonatos/${championship.id}`}
                    actionLabel={open ? 'Ver categorías y anotarme' : 'Ver campeonato'}
                    primary={open}
                  />
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
      <section aria-labelledby="americanos" className="flex flex-col gap-3">
        <h2 id="americanos" className="font-display text-2xl font-bold uppercase">
          Americanos
        </h2>
        <p className="text-fg-muted">Te anotás solo y en cada ronda cambiás de pareja.</p>
        {upcoming.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">{upcoming.map(card)}</ul>
        ) : (
          <p className="rounded-xl border border-border p-4 text-fg-muted">
            Ahora no hay americanos. Cuando el club arme uno, aparece acá.
          </p>
        )}
      </section>
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/components/nav/tab-nav.test.tsx tests/unit/lib/domain/championships.test.ts tests/unit/components/championships/championship-card.test.tsx
npm run typecheck
npm test
npm run lint
```
Expected: PASS. Si algún e2e o test buscaba el texto viejo "Ahora no hay torneos. Cuando el club arme uno, aparece acá.", actualizarlo al nuevo (`grep -rn "Ahora no hay torneos" tests`).

- [ ] **Step 5: Commit**

```bash
git add components/nav/tab-nav.tsx "app/(jugador)/layout.tsx" lib/domain/championships.ts components/championships/championship-card.tsx "app/(jugador)/torneos/page.tsx" tests/unit/components/nav/tab-nav.test.tsx tests/unit/lib/domain/championships.test.ts tests/unit/components/championships/championship-card.test.tsx
git commit -m "feat(torneos): championships above the americanos"
```

---

### Task 18: El compañero y la ventana para anotarse

**Files:**
- Create: `components/championships/pair-player-fields.tsx`
- Create: `components/championships/register-sheet.tsx`
- Test: `tests/unit/components/championships/register-sheet.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/championships/register-sheet.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RegisterSheet, type RegisterOption } from '@/components/championships/register-sheet'
import type { FormAction } from '@/components/ui/action-form'

const OPTIONS: RegisterOption[] = [
  { id: 'k1', name: '6ta Libre', detail: 'Libre · $2.000 por pareja', full: false, available: true },
  { id: 'k2', name: '5ta Damas', detail: 'Damas · $1.800 por pareja', full: true, available: true },
  { id: 'k3', name: '4ta', detail: 'Libre · $2.000 por pareja', full: false, available: false },
]
const MEMBERS = [
  { userId: '66666666-6666-6666-6666-666666666666', name: 'Bruno Silva' },
  { userId: '77777777-7777-7777-7777-777777777777', name: 'Carla Ruiz' },
]

function renderSheet(initialCategoryId: string | null = 'k1') {
  const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Listo, quedaron anotados.' }))
  const onDone = vi.fn()
  render(
    <RegisterSheet options={OPTIONS} initialCategoryId={initialCategoryId} myLevel={6} members={MEMBERS} action={action} onClose={vi.fn()} onDone={onDone} />,
  )
  return { action, onDone, sheet: screen.getByRole('dialog', { name: 'Anotarme' }) }
}

describe('RegisterSheet', () => {
  it('signs up with a member picked from the list', async () => {
    const { action, onDone, sheet } = renderSheet()
    expect(within(sheet).getByRole('combobox', { name: 'Categoría' })).toHaveValue('k1')
    expect(within(sheet).getByRole('option', { name: '4ta' })).toBeDisabled()
    expect(within(sheet).getByRole('combobox', { name: 'Tu categoría' })).toHaveValue('6')
    await userEvent.type(within(sheet).getByRole('combobox', { name: 'Nombre' }), 'bru')
    await userEvent.click(within(sheet).getByRole('option', { name: 'Bruno Silva' }))
    await userEvent.selectOptions(within(sheet).getByRole('combobox', { name: 'Categoría que juega' }), '5')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Anotarnos' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Listo, quedaron anotados.'))
    expect(Object.fromEntries(action.mock.calls[0][1].entries())).toEqual({
      categoryId: 'k1',
      myLevel: '6',
      partnerKind: 'member',
      partnerProfileId: '66666666-6666-6666-6666-666666666666',
      partnerLevel: '5',
    })
  })

  it('signs up with a partner from outside, and warns when the category is full', async () => {
    const { action, sheet } = renderSheet('k2')
    expect(within(sheet).getByText(/No quedan lugares/)).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Es de afuera' }))
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Nombre y apellido' }), 'Pedro Pérez')
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Teléfono' }), '099 123 456')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Anotarnos en la lista de espera' }))
    await waitFor(() => expect(action).toHaveBeenCalled())
    expect(Object.fromEntries(action.mock.calls[0][1].entries())).toMatchObject({
      categoryId: 'k2',
      partnerKind: 'guest',
      partnerName: 'Pedro Pérez',
      partnerPhone: '099 123 456',
    })
  })

  it('starts on the first category that takes pairs when none was chosen', () => {
    const { sheet } = renderSheet(null)
    expect(within(sheet).getByRole('combobox', { name: 'Categoría' })).toHaveValue('k1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/championships/register-sheet.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/championships/register-sheet"`).

- [ ] **Step 3: One player of a pair**

`components/championships/pair-player-fields.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { Field, inputClasses } from '@/components/ui/field'
import { MemberPicker } from '@/components/ui/member-picker'
import type { MemberOption } from '@/lib/domain/members'
import { CATEGORIES } from '@/lib/domain/profile'

const KINDS = [
  { value: 'member', label: 'Es socio' },
  { value: 'guest', label: 'Es de afuera' },
] as const

// One player of a pair: a member (searched by name) or someone from outside (name and phone), and the
// category he plays. The field names start with the prefix (partnerKind, player1Name...), as
// lib/domain/championship-form.ts reads them.
export function PairPlayerFields({
  prefix,
  legend,
  members,
  defaultLevel = 5,
}: {
  prefix: string
  legend: string
  members: MemberOption[]
  defaultLevel?: number
}) {
  const [kind, setKind] = useState<'member' | 'guest'>('member')
  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-4">
        {KINDS.map((option) => (
          <label key={option.value} className="inline-flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name={`${prefix}Kind`}
              value={option.value}
              checked={kind === option.value}
              onChange={() => setKind(option.value)}
              className="size-5 accent-accent"
            />
            {option.label}
          </label>
        ))}
      </div>
      {kind === 'member' ? (
        <Field label="Nombre" htmlFor={`${prefix}-member`}>
          <MemberPicker id={`${prefix}-member`} name={`${prefix}ProfileId`} members={members} />
        </Field>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Nombre y apellido" htmlFor={`${prefix}-name`}>
            <input id={`${prefix}-name`} name={`${prefix}Name`} required maxLength={60} className={inputClasses} />
          </Field>
          <Field label="Teléfono" htmlFor={`${prefix}-phone`}>
            <input
              id={`${prefix}-phone`}
              name={`${prefix}Phone`}
              type="tel"
              inputMode="tel"
              required
              maxLength={30}
              placeholder="099 123 456"
              className={inputClasses}
            />
          </Field>
        </div>
      )}
      <Field label="Categoría que juega" htmlFor={`${prefix}-level`}>
        <select id={`${prefix}-level`} name={`${prefix}Level`} defaultValue={defaultLevel} className={inputClasses}>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}ª
            </option>
          ))}
        </select>
      </Field>
    </fieldset>
  )
}
```

- [ ] **Step 4: The sheet**

`components/championships/register-sheet.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { PairPlayerFields } from '@/components/championships/pair-player-fields'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'
import type { MemberOption } from '@/lib/domain/members'
import { CATEGORIES } from '@/lib/domain/profile'

// A category in the sheet: available when the viewer can sign up to it; full means the pair waits.
export type RegisterOption = { id: string; name: string; detail: string; full: boolean; available: boolean }

// Design: "Ventana para anotarse": the category, the category she plays and her partner (a member or someone
// from outside). register_championship_pair has the last word.
export function RegisterSheet({
  options,
  initialCategoryId,
  myLevel,
  members,
  action,
  onClose,
  onDone,
}: {
  options: RegisterOption[]
  initialCategoryId: string | null
  myLevel: number | null
  members: MemberOption[]
  action: FormAction
  onClose: () => void
  onDone: (message: string) => void
}) {
  const available = options.filter((option) => option.available)
  const [categoryId, setCategoryId] = useState<string>(
    available.some((option) => option.id === initialCategoryId) ? (initialCategoryId ?? '') : (available[0]?.id ?? ''),
  )
  const chosen = options.find((option) => option.id === categoryId)

  return (
    <BottomSheet open onClose={onClose} title="Anotarme">
      <ActionForm
        action={action}
        submitLabel={chosen?.full ? 'Anotarnos en la lista de espera' : 'Anotarnos'}
        pendingLabel="Anotando…"
        onDone={onDone}
      >
        <Field label="Categoría" htmlFor="register-category">
          <select
            id="register-category"
            name="categoryId"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className={inputClasses}
          >
            {options.map((option) => (
              <option key={option.id} value={option.id} disabled={!option.available}>
                {option.name}
              </option>
            ))}
          </select>
        </Field>
        {chosen ? (
          <p className="text-sm text-fg-muted">
            {chosen.detail}.
            {chosen.full ? ' No quedan lugares: quedan en la lista de espera y entran solos si se libera uno.' : ''}
          </p>
        ) : null}
        <Field label="Tu categoría" htmlFor="register-level">
          <select id="register-level" name="myLevel" defaultValue={myLevel ?? 5} className={inputClasses}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}ª
              </option>
            ))}
          </select>
        </Field>
        <PairPlayerFields prefix="partner" legend="Tu compañero" members={members} />
        <p className="text-sm text-fg-muted">
          Si es socio, le llega un aviso. Cualquiera de los dos puede darlos de baja mientras la inscripción esté abierta.
        </p>
      </ActionForm>
    </BottomSheet>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
npx vitest run tests/unit/components/championships/register-sheet.test.tsx
npm run typecheck
npm run lint
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/championships/pair-player-fields.tsx components/championships/register-sheet.tsx tests/unit/components/championships/register-sheet.test.tsx
git commit -m "feat(campeonatos): sign up with a partner, member or from outside"
```

---

### Task 19: Horarios imposibles (`UnavailabilitySheet`)

**Files:**
- Create: `components/championships/unavailability-sheet.tsx`
- Test: `tests/unit/components/championships/unavailability-sheet.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/championships/unavailability-sheet.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UnavailabilitySheet } from '@/components/championships/unavailability-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { championshipBlocks } from '@/lib/domain/championships'
import { makeChampionship } from '../../fixtures/championships'

// Saturday 17 (08:00 to 14:00) and Sunday 18 (14:00 to 20:00): six blocks.
const BLOCKS = championshipBlocks(makeChampionship().windows)

function renderSheet(max: number | null) {
  const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Horarios guardados.' }))
  const onDone = vi.fn()
  render(
    <UnavailabilitySheet entryId="e1" blocks={BLOCKS} selected={['2026-10-17@08:00']} note="Trabajo" max={max} action={action}
      onClose={vi.fn()} onDone={onDone} />,
  )
  return { action, onDone, sheet: screen.getByRole('dialog', { name: 'Horarios imposibles' }) }
}

describe('UnavailabilitySheet', () => {
  it('marks the blocks of each day and saves them with a note', async () => {
    const { action, onDone, sheet } = renderSheet(2)
    const saturday = within(sheet).getByRole('group', { name: 'sábado 17 de octubre' })
    expect(within(saturday).getByRole('checkbox', { name: '08:00 a 10:00' })).toBeChecked()
    expect(within(sheet).getByText(/Hasta 2 de 6/)).toBeInTheDocument()
    const sunday = within(sheet).getByRole('group', { name: 'domingo 18 de octubre' })
    await userEvent.click(within(sunday).getByRole('checkbox', { name: '18:00 a 20:00' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Guardar horarios' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Horarios guardados.'))
    const sent = action.mock.calls[0][1]
    expect(sent.get('entryId')).toBe('e1')
    expect(sent.getAll('blocks')).toEqual(['2026-10-17@08:00', '2026-10-18@18:00'])
    expect(sent.get('note')).toBe('Trabajo')
  })

  it('warns a player who marks more than she can', async () => {
    const { sheet } = renderSheet(1)
    await userEvent.click(within(sheet).getByRole('checkbox', { name: '10:00 a 12:00' }))
    expect(within(sheet).getByRole('note')).toHaveTextContent('Marcaste 2: más de las 1 que se pueden sin pedirle al club.')
  })

  it('lets staff mark more than 40 %', () => {
    const { sheet } = renderSheet(null)
    expect(within(sheet).getByText(/Son 6 franjas/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/championships/unavailability-sheet.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/championships/unavailability-sheet"`).

- [ ] **Step 3: Write the component**

`components/championships/unavailability-sheet.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import type { Block } from '@/lib/domain/championships'
import { dayLongLabel } from '@/lib/domain/format'

// Design: "Horarios imposibles": the 2-hour blocks of each day of play the pair cannot play, plus a note.
// max: how many a player may mark by herself (40 %); null for staff, who may mark more.
export function UnavailabilitySheet({
  entryId,
  blocks,
  selected,
  note,
  max,
  action,
  onClose,
  onDone,
}: {
  entryId: string
  blocks: Block[]
  selected: string[]
  note: string | null
  max: number | null
  action: FormAction
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [chosen, setChosen] = useState<string[]>(selected)
  const days = [...new Set(blocks.map((block) => block.date))].map((date) => ({
    date,
    blocks: blocks.filter((block) => block.date === date),
  }))
  const over = max !== null && chosen.length > max

  return (
    <BottomSheet open onClose={onClose} title="Horarios imposibles">
      <ActionForm action={action} submitLabel="Guardar horarios" pendingLabel="Guardando…" onDone={onDone}>
        <input type="hidden" name="entryId" value={entryId} />
        <p className="text-sm text-fg-muted">
          Marcá las franjas en las que la pareja no puede jugar.{' '}
          {max !== null
            ? `Hasta ${max} de ${blocks.length}; para más, pedíselo al club.`
            : `Son ${blocks.length} franjas; como organizador podés marcar más del 40 %.`}
        </p>
        {days.map((day) => (
          <fieldset key={day.date} className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">{dayLongLabel(day.date)}</legend>
            <div className="flex flex-wrap gap-2">
              {day.blocks.map((block) => (
                <label
                  key={block.key}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-xl border px-3',
                    chosen.includes(block.key) ? 'border-accent' : 'border-border',
                  )}
                >
                  <input
                    type="checkbox"
                    name="blocks"
                    value={block.key}
                    checked={chosen.includes(block.key)}
                    onChange={(event) =>
                      setChosen((current) =>
                        event.target.checked ? [...current, block.key] : current.filter((key) => key !== block.key),
                      )
                    }
                    className="size-5 accent-accent"
                  />
                  {block.fromTime} a {block.toTime}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {over ? (
          <p role="note" className="rounded-xl border border-accent p-3 text-sm">
            Marcaste {chosen.length}: más de las {max} que se pueden sin pedirle al club.
          </p>
        ) : null}
        <Field label="Nota (opcional)" htmlFor="unavailability-note">
          <textarea
            id="unavailability-note"
            name="note"
            rows={2}
            maxLength={300}
            defaultValue={note ?? ''}
            className={cn(inputClasses, 'py-2')}
          />
        </Field>
      </ActionForm>
    </BottomSheet>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run tests/unit/components/championships/unavailability-sheet.test.tsx
npm run typecheck
npm run lint
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/championships/unavailability-sheet.tsx tests/unit/components/championships/unavailability-sheet.test.tsx
git commit -m "feat(campeonatos): mark the hours a pair cannot play"
```

---

### Task 20: Tus inscripciones (`MyEntryCard`)

**Files:**
- Create: `components/championships/my-entry-card.tsx`
- Test: `tests/unit/components/championships/my-entry-card.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/championships/my-entry-card.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MyEntryCard, type MyEntryView } from '@/components/championships/my-entry-card'

const VIEW: MyEntryView = {
  entryId: 'e1',
  categoryName: '6ta Libre',
  partnerName: 'Pedro',
  stateText: 'Con lugar',
  waiting: false,
  payment: { state: 'pending', due: 2000, canReportTransfer: true, rejectionReason: null },
  hoursText: 'No pueden en 1 franja.',
  canWithdraw: true,
  canEditHours: true,
}

describe('MyEntryCard', () => {
  it('shows the pair, its place, its payment and what can be done', async () => {
    const onPay = vi.fn()
    const onHours = vi.fn()
    const onLeave = vi.fn()
    render(<MyEntryCard view={VIEW} onPay={onPay} onHours={onHours} onLeave={onLeave} />)
    expect(screen.getByText('6ta Libre')).toBeInTheDocument()
    expect(screen.getByText('Con Pedro')).toBeInTheDocument()
    expect(screen.getByText('Con lugar')).toBeInTheDocument()
    expect(screen.getByText('Pendiente de pago')).toBeInTheDocument()
    expect(screen.getByText('No pueden en 1 franja.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ya transferí' }))
    await userEvent.click(screen.getByRole('button', { name: 'Horarios imposibles' }))
    await userEvent.click(screen.getByRole('button', { name: 'Darme de baja' }))
    expect(onPay).toHaveBeenCalled()
    expect(onHours).toHaveBeenCalled()
    expect(onLeave).toHaveBeenCalled()
  })

  it('tells a waiting pair it pays once it gets in, and hides what is closed', () => {
    render(
      <MyEntryCard
        view={{ ...VIEW, stateText: 'En espera, puesto 2', waiting: true, payment: null, canWithdraw: false, canEditHours: false }}
        onPay={vi.fn()} onHours={vi.fn()} onLeave={vi.fn()}
      />,
    )
    expect(screen.getByText('En espera, puesto 2')).toBeInTheDocument()
    expect(screen.getByText('Pagan cuando entren: si se libera un lugar, entran solos y te avisamos.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('says why a transfer was rejected', () => {
    render(
      <MyEntryCard
        view={{ ...VIEW, payment: { state: 'pending', due: 2000, canReportTransfer: true, rejectionReason: 'no llegó' } }}
        onPay={vi.fn()} onHours={vi.fn()} onLeave={vi.fn()}
      />,
    )
    expect(screen.getByText('El club rechazó la transferencia: no llegó.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/championships/my-entry-card.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/championships/my-entry-card"`).

- [ ] **Step 3: Write the component**

`components/championships/my-entry-card.tsx`:
```tsx
import { PaymentBadge } from '@/components/booking/payment-badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { EntryPaymentView } from '@/lib/domain/tournament-payments'

// One of the viewer's pairs, as /campeonatos/[id] prepares it. payment: null for a waiting pair or a free
// category.
export type MyEntryView = {
  entryId: string
  categoryName: string
  partnerName: string
  stateText: string
  waiting: boolean
  payment: EntryPaymentView | null
  hoursText: string
  canWithdraw: boolean
  canEditHours: boolean
}

// Design: "Tus inscripciones": pair, place (or place in line), payment, hours and "Darme de baja".
export function MyEntryCard({
  view,
  onPay,
  onHours,
  onLeave,
}: {
  view: MyEntryView
  onPay: () => void
  onHours: () => void
  onLeave: () => void
}) {
  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{view.categoryName}</p>
          <p className="text-sm text-fg-muted">Con {view.partnerName}</p>
        </div>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold">{view.stateText}</span>
      </div>
      {view.payment ? (
        <div className="flex flex-wrap items-center gap-3">
          <PaymentBadge state={view.payment.state} />
          {view.payment.canReportTransfer ? (
            <Button variant="secondary" onClick={onPay}>
              Ya transferí
            </Button>
          ) : null}
          {view.payment.rejectionReason ? (
            <p className="w-full text-sm">El club rechazó la transferencia: {view.payment.rejectionReason}.</p>
          ) : null}
        </div>
      ) : view.waiting ? (
        <p className="text-sm text-fg-muted">Pagan cuando entren: si se libera un lugar, entran solos y te avisamos.</p>
      ) : null}
      <p className="text-sm">{view.hoursText}</p>
      {view.canEditHours || view.canWithdraw ? (
        <div className="mt-auto flex flex-wrap gap-2">
          {view.canEditHours ? (
            <Button variant="secondary" onClick={onHours}>
              Horarios imposibles
            </Button>
          ) : null}
          {view.canWithdraw ? (
            <Button variant="ghost" onClick={onLeave}>
              Darme de baja
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run tests/unit/components/championships/my-entry-card.test.tsx
npm run lint
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/championships/my-entry-card.tsx tests/unit/components/championships/my-entry-card.test.tsx
git commit -m "feat(campeonatos): your pairs, their place and their payment"
```

---

### Task 21: El afiche: rutas y límites (`lib/domain/championship-poster.ts`)

**Files:**
- Create: `lib/domain/championship-poster.ts`
- Test: `tests/unit/lib/domain/championship-poster.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/championship-poster.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { checkPosterFile, championshipPosterUrl, isPosterPath, posterPath } from '@/lib/domain/championship-poster'

const CLUB = '11111111-1111-1111-1111-111111111111'

describe('the poster', () => {
  it('goes in the club folder, named by the time it was uploaded', () => {
    expect(posterPath(CLUB, 'Afiche Final.JPEG', 1_760_000_000_000)).toBe(`${CLUB}/poster-1760000000000.jpeg`)
    expect(posterPath(CLUB, 'sin-extension', 1)).toBe(`${CLUB}/poster-1.png`)
  })

  it('accepts only a poster of that club, as posterPath names it', () => {
    expect(isPosterPath(CLUB, `${CLUB}/poster-1760000000000.webp`)).toBe(true)
    expect(isPosterPath(CLUB, `otro-club/poster-1.png`)).toBe(false)
    expect(isPosterPath(CLUB, `${CLUB}/logo-1.png`)).toBe(false)
    expect(isPosterPath(CLUB, `${CLUB}/a/poster-1.png`)).toBe(false)
  })

  it('takes images up to 5 MB', () => {
    expect(checkPosterFile({ type: 'image/png', size: 1_000_000 })).toBeNull()
    expect(checkPosterFile({ type: 'application/pdf', size: 1_000 })).toBe('Subí una imagen PNG, JPG o WebP.')
    expect(checkPosterFile({ type: 'image/jpeg', size: 6 * 1024 * 1024 })).toBe('El afiche pesa más de 5 MB. Probá con una versión más liviana.')
  })

  it('is public', () => {
    expect(championshipPosterUrl('https://db.test', `${CLUB}/poster-1.png`)).toBe(
      `https://db.test/storage/v1/object/public/championship-posters/${CLUB}/poster-1.png`,
    )
    expect(championshipPosterUrl('https://db.test', null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/championship-poster.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/domain/championship-poster"`).

- [ ] **Step 3: Write the implementation**

`lib/domain/championship-poster.ts`:
```ts
export const POSTER_BUCKET = 'championship-posters'
export const MAX_POSTER_BYTES = 5 * 1024 * 1024
export const POSTER_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

const EXTENSION = /[.]([a-z0-9]{1,5})$/i
const POSTER_FILE = /^poster-[0-9]{1,15}[.](png|jpe?g|webp)$/

// Object name inside the championship-posters bucket: <club_id>/poster-<timestamp>.<ext>. The first folder is
// what the Storage policy checks; the file name only contributes its extension.
export function posterPath(clubId: string, fileName: string, now = Date.now()): string {
  const extension = EXTENSION.exec(fileName)?.[1]?.toLowerCase() ?? 'png'
  return `${clubId}/poster-${now}.${extension}`
}

// What the action accepts: a poster of that club, named as posterPath names it.
export function isPosterPath(clubId: string, path: string): boolean {
  const [folder, file, ...rest] = path.split('/')
  return folder === clubId && rest.length === 0 && POSTER_FILE.test(file ?? '')
}

// The same limits as the bucket, with a message the organizer understands.
export function checkPosterFile(file: { type: string; size: number }): string | null {
  if (!(POSTER_TYPES as readonly string[]).includes(file.type)) return 'Subí una imagen PNG, JPG o WebP.'
  if (file.size > MAX_POSTER_BYTES) return 'El afiche pesa más de 5 MB. Probá con una versión más liviana.'
  return null
}

export function championshipPosterUrl(supabaseUrl: string, path: string | null): string | null {
  return path ? `${supabaseUrl}/storage/v1/object/public/${POSTER_BUCKET}/${path}` : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/championship-poster.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/championship-poster.ts tests/unit/lib/domain/championship-poster.test.ts
git commit -m "feat(domain): where a championship poster lives"
```

---

### Task 22: La pantalla /campeonatos/[id]

**Files:**
- Create: `app/(jugador)/campeonatos/[id]/championship-board.tsx`
- Create: `app/(jugador)/campeonatos/[id]/page.tsx`
- Test: `tests/unit/app/campeonatos/championship-board.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/app/campeonatos/championship-board.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChampionshipBoard, type ChampionshipBoardProps } from '@/app/(jugador)/campeonatos/[id]/championship-board'
import type { ReportTransfer } from '@/components/booking/transfer-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { championshipBlocks } from '@/lib/domain/championships'
import { makeChampionship } from '../../fixtures/championships'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })

function renderBoard(overrides: Partial<ChampionshipBoardProps> = {}) {
  const props: ChampionshipBoardProps = {
    name: 'Campeonato de Primavera',
    statusLabel: 'Inscripción abierta',
    cancelled: false,
    dates: ['sábado 17 de octubre, 08:00 a 14:00', 'domingo 18 de octubre, 14:00 a 20:00'],
    closes: 'viernes 16 de octubre, 08:00',
    rules: 'Al mejor de 3 sets.',
    posterUrl: null,
    paymentNote: 'Se paga en el club o por transferencia.',
    categories: [
      { id: 'k1', name: '6ta Libre', detail: 'Libre · $2.000 por pareja', spots: '1 de 4 parejas', full: false, available: false, reason: 'Ya estás anotado en esta categoría.' },
      { id: 'k2', name: '5ta Damas', detail: 'Damas · $1.800 por pareja', spots: '8 de 8 parejas · 1 en espera', full: true, available: true, reason: null },
    ],
    entries: [
      {
        entryId: 'e1', categoryName: '6ta Libre', partnerName: 'Pedro', stateText: 'Con lugar', waiting: false,
        payment: { state: 'pending', due: 2000, canReportTransfer: true, rejectionReason: null }, hoursText: 'Pueden jugar en cualquier horario.',
        canWithdraw: true, canEditHours: true, unavailable: [], note: null,
      },
    ],
    blocks: championshipBlocks(makeChampionship().windows),
    maxUnavailable: 2,
    members: [{ userId: '66666666-6666-6666-6666-666666666666', name: 'Bruno Silva' }],
    myLevel: 5,
    viewerId: 'u-ana',
    transfer: { details: 'Banco Ejemplo', receiptRequired: true },
    initialCategoryId: null,
    actions: {
      register: vi.fn<FormAction>(ok),
      withdraw: vi.fn<FormAction>(ok),
      hours: vi.fn<FormAction>(ok),
      report: vi.fn<ReportTransfer>(),
    },
    ...overrides,
  }
  render(<ChampionshipBoard {...props} />)
  return props
}

describe('ChampionshipBoard', () => {
  it('shows the championship, its rules, its categories and your pairs', () => {
    renderBoard()
    expect(screen.getByRole('heading', { name: 'Campeonato de Primavera' })).toBeInTheDocument()
    expect(screen.getByText('sábado 17 de octubre, 08:00 a 14:00')).toBeInTheDocument()
    expect(screen.getByText('Hasta el viernes 16 de octubre, 08:00')).toBeInTheDocument()
    expect(screen.getByText('Al mejor de 3 sets.')).toBeInTheDocument()
    const categories = screen.getByRole('region', { name: 'Categorías' })
    expect(categories).toHaveTextContent('8 de 8 parejas · 1 en espera')
    expect(categories).toHaveTextContent('Ya estás anotado en esta categoría.')
    expect(within(screen.getByRole('region', { name: 'Tus inscripciones' })).getByText('Con Pedro')).toBeInTheDocument()
  })

  it('opens the sheet on the category tapped', async () => {
    renderBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Anotarme en 5ta Damas' }))
    const sheet = screen.getByRole('dialog', { name: 'Anotarme' })
    expect(within(sheet).getByRole('combobox', { name: 'Categoría' })).toHaveValue('k2')
    expect(within(sheet).getByRole('button', { name: 'Anotarnos en la lista de espera' })).toBeInTheDocument()
  })

  it('opens the sheet from a shared link with the category', () => {
    renderBoard({ initialCategoryId: 'k2' })
    expect(screen.getByRole('dialog', { name: 'Anotarme' })).toBeInTheDocument()
  })

  it('asks before withdrawing and sends the pair', async () => {
    const props = renderBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Darme de baja' }))
    const sheet = screen.getByRole('dialog', { name: 'Darme de baja' })
    expect(sheet).toHaveTextContent('Se da de baja la pareja con Pedro en 6ta Libre.')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Sí, darnos de baja' }))
    await waitFor(() => expect(props.actions.withdraw).toHaveBeenCalled())
    expect(vi.mocked(props.actions.withdraw).mock.calls[0][1].get('entryId')).toBe('e1')
    expect(await screen.findByRole('status')).toHaveTextContent('Listo.')
  })

  it('opens the hours and the transfer', async () => {
    renderBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Horarios imposibles' }))
    expect(screen.getByRole('dialog', { name: 'Horarios imposibles' })).toHaveTextContent('Hasta 2 de 6')
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ya transferí' }))
    expect(screen.getByRole('dialog', { name: 'Ya transferí' })).toHaveTextContent('$2.000')
  })

  it('says when the club cancelled it', () => {
    renderBoard({ cancelled: true, statusLabel: 'Cancelado', entries: [] })
    expect(screen.getByRole('note')).toHaveTextContent('El club canceló este campeonato. Si pagaste, te devuelve la plata.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/app/campeonatos/championship-board.test.tsx`
Expected: FAIL (`Failed to resolve import "@/app/(jugador)/campeonatos/[id]/championship-board"`).

- [ ] **Step 3: The board**

`app/(jugador)/campeonatos/[id]/championship-board.tsx`:
```tsx
'use client'

import { useCallback, useState } from 'react'
import { TransferSheet, type ReportTransfer } from '@/components/booking/transfer-sheet'
import { MyEntryCard, type MyEntryView } from '@/components/championships/my-entry-card'
import { RegisterSheet, type RegisterOption } from '@/components/championships/register-sheet'
import { UnavailabilitySheet } from '@/components/championships/unavailability-sheet'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import type { Block } from '@/lib/domain/championships'
import type { MemberOption } from '@/lib/domain/members'

// A category as the page prepares it: reason says why the viewer cannot sign up to it.
export type BoardCategory = RegisterOption & { spots: string; reason: string | null }
export type BoardEntry = MyEntryView & { unavailable: string[]; note: string | null }
export type ChampionshipBoardProps = {
  name: string
  statusLabel: string
  cancelled: boolean
  dates: string[]
  closes: string | null
  rules: string
  posterUrl: string | null
  paymentNote: string
  categories: BoardCategory[]
  entries: BoardEntry[]
  blocks: Block[]
  maxUnavailable: number
  members: MemberOption[]
  myLevel: number | null
  viewerId: string
  transfer: { details: string | null; receiptRequired: boolean }
  initialCategoryId: string | null
  actions: { register: FormAction; withdraw: FormAction; hours: FormAction; report: ReportTransfer }
}

type Sheet = { kind: 'register'; categoryId: string | null } | { kind: 'pay' | 'hours' | 'leave'; entry: BoardEntry }

// Design: "/campeonatos/[id]": dates, rules and poster; categories with their places and "Anotarme"; your
// pairs with their payment, hours and "Darme de baja". It is also where a shared link lands.
export function ChampionshipBoard(props: ChampionshipBoardProps) {
  const { initialCategoryId } = props
  const [sheet, setSheet] = useState<Sheet | null>(
    initialCategoryId && props.categories.some((category) => category.id === initialCategoryId && category.available)
      ? { kind: 'register', categoryId: initialCategoryId }
      : null,
  )
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setSheet(null), [])
  const done = useCallback((message: string) => {
    setSheet(null)
    setNotice(message)
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-3xl font-bold uppercase">{props.name}</h1>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold">{props.statusLabel}</span>
      </div>
      {notice ? (
        <p role="status" className="rounded-xl border border-accent bg-surface p-3">
          {notice}
        </p>
      ) : null}
      {props.cancelled ? (
        <p role="note" className="rounded-xl border border-accent p-3">
          El club canceló este campeonato. Si pagaste, te devuelve la plata.
        </p>
      ) : null}
      {props.posterUrl ? (
        // A plain img: the poster comes from Supabase Storage and next/image would need its host configured.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={props.posterUrl} alt={`Afiche de ${props.name}`} className="max-h-96 w-full rounded-2xl object-contain" />
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-fg-muted">Cuándo</dt>
        <dd>
          <ul>
            {props.dates.map((date) => (
              <li key={date}>{date}</li>
            ))}
          </ul>
        </dd>
        {props.closes ? (
          <>
            <dt className="text-fg-muted">Inscripción</dt>
            <dd>Hasta el {props.closes}</dd>
          </>
        ) : null}
        <dt className="text-fg-muted">Pago</dt>
        <dd>Uno por pareja. {props.paymentNote}</dd>
      </dl>
      {props.rules ? (
        <section aria-labelledby="reglamento" className="flex flex-col gap-2">
          <h2 id="reglamento" className="font-display text-2xl font-bold uppercase">
            Reglamento
          </h2>
          <p className="whitespace-pre-line">{props.rules}</p>
        </section>
      ) : null}

      {props.entries.length > 0 ? (
        <section aria-labelledby="mis-inscripciones" className="flex flex-col gap-3">
          <h2 id="mis-inscripciones" className="font-display text-2xl font-bold uppercase">
            Tus inscripciones
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {props.entries.map((entry) => (
              <li key={entry.entryId}>
                <MyEntryCard
                  view={entry}
                  onPay={() => setSheet({ kind: 'pay', entry })}
                  onHours={() => setSheet({ kind: 'hours', entry })}
                  onLeave={() => setSheet({ kind: 'leave', entry })}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="categorias" className="flex flex-col gap-3">
        <h2 id="categorias" className="font-display text-2xl font-bold uppercase">
          Categorías
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {props.categories.map((category) => (
            <li key={category.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{category.name}</p>
                <span className="shrink-0 text-sm text-fg-muted tabular-nums">{category.spots}</span>
              </div>
              <p className="text-sm text-fg-muted">{category.detail}</p>
              {category.available ? (
                <Button
                  aria-label={`Anotarme en ${category.name}`}
                  variant={category.full ? 'secondary' : 'primary'}
                  onClick={() => setSheet({ kind: 'register', categoryId: category.id })}
                >
                  {category.full ? 'Anotarme en espera' : 'Anotarme'}
                </Button>
              ) : category.reason ? (
                <p className="text-sm text-fg-muted">{category.reason}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {sheet?.kind === 'register' ? (
        <RegisterSheet
          options={props.categories}
          initialCategoryId={sheet.categoryId}
          myLevel={props.myLevel}
          members={props.members}
          action={props.actions.register}
          onClose={close}
          onDone={done}
        />
      ) : null}
      {sheet?.kind === 'hours' ? (
        <UnavailabilitySheet
          entryId={sheet.entry.entryId}
          blocks={props.blocks}
          selected={sheet.entry.unavailable}
          note={sheet.entry.note}
          max={props.maxUnavailable}
          action={props.actions.hours}
          onClose={close}
          onDone={done}
        />
      ) : null}
      {sheet?.kind === 'pay' && sheet.entry.payment ? (
        <TransferSheet
          bookingId={sheet.entry.entryId}
          userId={props.viewerId}
          amount={sheet.entry.payment.due}
          details={props.transfer.details}
          receiptRequired={props.transfer.receiptRequired}
          reportAction={props.actions.report}
          onClose={close}
          onDone={done}
        />
      ) : null}
      <BottomSheet open={sheet?.kind === 'leave'} onClose={close} title="Darme de baja">
        {sheet?.kind === 'leave' ? (
          <>
            <p className="mb-4">
              Se da de baja la pareja con {sheet.entry.partnerName} en {sheet.entry.categoryName}. Si ya pagaron, el club les
              devuelve la plata.
            </p>
            <ActionForm action={props.actions.withdraw} submitLabel="Sí, darnos de baja" pendingLabel="Saliendo…" onDone={done}>
              <input type="hidden" name="entryId" value={sheet.entry.entryId} />
            </ActionForm>
          </>
        ) : null}
      </BottomSheet>
    </div>
  )
}
```

- [ ] **Step 4: The page**

`app/(jugador)/campeonatos/[id]/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePlayer } from '@/lib/auth/viewer'
import { reportChampionshipTransfer, registerPair, saveUnavailability, withdrawEntry } from '@/lib/actions/championships'
import { loadChampionship, loadMemberDirectory } from '@/lib/data/championships'
import { championshipPosterUrl } from '@/lib/domain/championship-poster'
import {
  categoryDetail,
  championshipBlocks,
  CHAMPIONSHIP_STATUS_LABELS,
  closesText,
  entryStateText,
  maxUnavailable,
  myEntries,
  openCategories,
  partnerOf,
  registerStatus,
  registrationOpen,
  spotsText,
  unavailabilityText,
  windowText,
} from '@/lib/domain/championships'
import { isUuid } from '@/lib/domain/input'
import { paymentMethodsNote } from '@/lib/domain/payments'
import { entryPaymentView } from '@/lib/domain/tournament-payments'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { ChampionshipBoard } from './championship-board'

export const metadata: Metadata = { title: 'Campeonato' }

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ categoria?: string }>

export default async function ChampionshipPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  // Without a session: sign in, the welcome form if needed, and back here (requirePlayer keeps the path).
  const viewer = await requirePlayer(`/campeonatos/${id}`)
  const { club } = viewer
  const [championship, members] = await Promise.all([loadChampionship(club, id), loadMemberDirectory(club)])
  if (!championship || championship.status === 'draft') notFound()

  const now = new Date()
  const { categoria } = await searchParams
  const open = registrationOpen(championship, now)
  const blocks = championshipBlocks(championship.windows)

  return (
    <ChampionshipBoard
      name={championship.name}
      statusLabel={CHAMPIONSHIP_STATUS_LABELS[championship.status]}
      cancelled={championship.status === 'cancelled'}
      dates={championship.windows.map(windowText)}
      closes={championship.status === 'registration' ? closesText(championship, club.timezone) : null}
      rules={championship.rules}
      posterUrl={championshipPosterUrl(getSupabaseEnv().url, championship.posterPath)}
      paymentNote={paymentMethodsNote(club)}
      categories={openCategories(championship).map((category) => {
        const status = registerStatus(championship, category, viewer.userId, now)
        return {
          id: category.id,
          name: category.name,
          detail: categoryDetail(category),
          spots: spotsText(category),
          full: status.ok && status.full,
          available: status.ok,
          reason: status.ok ? null : status.reason,
        }
      })}
      entries={myEntries(championship, viewer.userId).map(({ entry, category }) => ({
        entryId: entry.id,
        categoryName: category.name,
        partnerName: partnerOf(entry, viewer.userId).name,
        stateText: entryStateText(category, entry),
        waiting: entry.status === 'waiting',
        payment:
          entry.status === 'active' && category.price > 0
            ? entryPaymentView(category.price, entry.payments, club.accepts_transfer)
            : null,
        hoursText: unavailabilityText(entry.unavailable.length),
        canWithdraw: open,
        canEditHours: open,
        unavailable: entry.unavailable,
        note: entry.unavailabilityNote,
      }))}
      blocks={blocks}
      maxUnavailable={maxUnavailable(blocks.length)}
      members={members}
      myLevel={viewer.membership.category}
      viewerId={viewer.userId}
      transfer={{ details: club.transfer_details, receiptRequired: club.transfer_receipt_required }}
      initialCategoryId={categoria && isUuid(categoria) ? categoria : null}
      actions={{ register: registerPair, withdraw: withdrawEntry, hours: saveUnavailability, report: reportChampionshipTransfer }}
    />
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/app/campeonatos/championship-board.test.tsx
npm run typecheck
npm test
npm run lint
```
Expected: PASS.

- [ ] **Step 6: Commit and push**

```bash
git add "app/(jugador)/campeonatos/[id]/championship-board.tsx" "app/(jugador)/campeonatos/[id]/page.tsx" tests/unit/app/campeonatos/championship-board.test.tsx
git commit -m "feat(campeonatos): the championship page for players"
git push
```

---
## Corte 6: Pantallas del club

### Task 23: Lista de torneos y "Nuevo campeonato"

**Files:**
- Create: `components/championships/championship-details-form.tsx`
- Modify: `app/(club)/club/torneos/page.tsx` (reemplazo completo)
- Create: `app/(club)/club/torneos/campeonatos/nuevo/page.tsx`
- Test: `tests/unit/components/championships/championship-details-form.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/championships/championship-details-form.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChampionshipDetailsForm } from '@/components/championships/championship-details-form'
import type { FormAction } from '@/components/ui/action-form'

describe('ChampionshipDetailsForm', () => {
  it('creates a championship with what was typed', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Listo.' }))
    render(<ChampionshipDetailsForm action={action} submitLabel="Crear campeonato" pendingLabel="Creando…" today="2026-10-06" />)
    expect(screen.getByLabelText('Categorías por jugador')).toHaveValue('2')
    expect(screen.getByText('Sin cierre, la inscripción cierra 24 horas antes del primer partido.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Nombre'), 'Primavera')
    await userEvent.type(screen.getByLabelText('Reglamento'), 'Al mejor de 3 sets.')
    await userEvent.selectOptions(screen.getByLabelText('Categorías por jugador'), '3')
    await userEvent.click(screen.getByRole('button', { name: 'Crear campeonato' }))
    await waitFor(() => expect(action).toHaveBeenCalled())
    expect(Object.fromEntries(action.mock.calls[0][1].entries())).toEqual({
      name: 'Primavera',
      rules: 'Al mejor de 3 sets.',
      maxCategories: '3',
      closesDate: '',
      closesTime: '',
    })
  })

  it('edits a championship starting from what it has', async () => {
    const action = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Datos guardados.' }))
    render(
      <ChampionshipDetailsForm
        action={action}
        submitLabel="Guardar datos"
        pendingLabel="Guardando…"
        today="2026-10-06"
        details={{ id: 'ch1', name: 'Primavera', rules: '', maxCategories: 1, closesDate: '2026-10-16', closesTime: '08:00' }}
      />,
    )
    expect(screen.getByLabelText('Nombre')).toHaveValue('Primavera')
    expect(screen.getByLabelText('Hora del cierre')).toHaveValue('08:00')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar datos' }))
    await waitFor(() => expect(action).toHaveBeenCalled())
    expect(action.mock.calls[0][1].get('championshipId')).toBe('ch1')
    expect(await screen.findByRole('status')).toHaveTextContent('Datos guardados.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/championships/championship-details-form.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/championships/championship-details-form"`).

- [ ] **Step 3: The form**

`components/championships/championship-details-form.tsx`:
```tsx
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { MAX_CATEGORIES_DEFAULT } from '@/lib/domain/championships'
import { TIME_OPTIONS } from '@/lib/domain/settings'

export type ChampionshipDetails = {
  id: string
  name: string
  rules: string
  maxCategories: number
  // On the club's clock; empty when there is no deadline yet.
  closesDate: string
  closesTime: string
}

// Design: "Crear o editar": name, rules, how many categories a player may play, and until when people sign up
// (empty: 24 hours before the first match).
export function ChampionshipDetailsForm({
  action,
  submitLabel,
  pendingLabel,
  today,
  details,
}: {
  action: FormAction
  submitLabel: string
  pendingLabel: string
  today: string
  details?: ChampionshipDetails
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel} pendingLabel={pendingLabel}>
      {details ? <input type="hidden" name="championshipId" value={details.id} /> : null}
      <Field label="Nombre" htmlFor="championship-name">
        <input
          id="championship-name"
          name="name"
          required
          maxLength={80}
          defaultValue={details?.name}
          placeholder="Campeonato de Primavera"
          className={inputClasses}
        />
      </Field>
      <Field label="Reglamento" htmlFor="championship-rules">
        <textarea
          id="championship-rules"
          name="rules"
          rows={5}
          maxLength={5000}
          defaultValue={details?.rules}
          className={cn(inputClasses, 'py-2')}
        />
      </Field>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Categorías por jugador" htmlFor="championship-max">
          <select
            id="championship-max"
            name="maxCategories"
            defaultValue={details?.maxCategories ?? MAX_CATEGORIES_DEFAULT}
            className={inputClasses}
          >
            {[1, 2, 3, 4, 5].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cierre de inscripción" htmlFor="championship-closes-date">
          <input
            id="championship-closes-date"
            name="closesDate"
            type="date"
            min={today}
            defaultValue={details?.closesDate}
            className={inputClasses}
          />
        </Field>
        <Field label="Hora del cierre" htmlFor="championship-closes-time">
          <select id="championship-closes-time" name="closesTime" defaultValue={details?.closesTime ?? ''} className={inputClasses}>
            <option value="">—</option>
            {TIME_OPTIONS.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="text-sm text-fg-muted">Sin cierre, la inscripción cierra 24 horas antes del primer partido.</p>
    </ActionForm>
  )
}
```

- [ ] **Step 4: The club's list and the new championship page**

Replace `app/(club)/club/torneos/page.tsx` with:
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { ChampionshipCard } from '@/components/championships/championship-card'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { requireStaff } from '@/lib/auth/viewer'
import { loadChampionships } from '@/lib/data/championships'
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
  const [tournaments, championships] = await Promise.all([
    loadTournaments(club, { endsAfter: new Date(now.getTime() - 30 * 86_400_000) }),
    loadChampionships(club),
  ])
  // A cancelled championship stays listed until its date passes: reception still finds who to give money back.
  const shown = championships.filter(
    (championship) => championship.status !== 'cancelled' || (championship.startsAt !== null && championship.startsAt > now),
  )

  return (
    <>
      <section aria-labelledby="campeonatos" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="campeonatos" className="font-display text-2xl font-bold uppercase">
            Campeonatos
          </h2>
          <Link href="/club/torneos/campeonatos/nuevo" className={buttonClasses()}>
            Nuevo campeonato
          </Link>
        </div>
        {shown.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {shown.map((championship) => (
              <li key={championship.id}>
                <ChampionshipCard championship={championship} href={`/club/torneos/campeonatos/${championship.id}`} actionLabel="Gestionar" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-4 text-fg-muted">
            Todavía no hay campeonatos. Armá el primero con &quot;Nuevo campeonato&quot;.
          </p>
        )}
      </section>

      <section aria-labelledby="americanos" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="americanos" className="font-display text-2xl font-bold uppercase">
            Americanos
          </h2>
          <Link href="/club/torneos/nuevo" className={buttonClasses({ variant: 'secondary' })}>
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
            Todavía no hay americanos. Armá el primero con &quot;Nuevo americano&quot;.
          </p>
        )}
      </section>
    </>
  )
}
```

`app/(club)/club/torneos/campeonatos/nuevo/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { ChampionshipDetailsForm } from '@/components/championships/championship-details-form'
import { BackLink } from '@/components/ui/back-link'
import { Card } from '@/components/ui/card'
import { requireStaff } from '@/lib/auth/viewer'
import { localDateOf } from '@/lib/domain/time'
import { createChampionship } from '../actions'

export const metadata: Metadata = { title: 'Nuevo campeonato' }

export default async function NewChampionshipPage() {
  const viewer = await requireStaff('/club/torneos/campeonatos/nuevo')
  return (
    <>
      <BackLink href="/club/torneos">Volver a torneos</BackLink>
      <h2 className="font-display text-2xl font-bold uppercase">Nuevo campeonato</h2>
      <p className="text-fg-muted">
        Primero los datos. Después agregás los días de juego y las categorías, y abrís la inscripción.
      </p>
      <Card>
        <ChampionshipDetailsForm
          action={createChampionship}
          submitLabel="Crear campeonato"
          pendingLabel="Creando…"
          today={localDateOf(new Date(), viewer.club.timezone)}
        />
      </Card>
    </>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/components/championships/championship-details-form.test.tsx
npm run typecheck
npm run lint
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/championships/championship-details-form.tsx "app/(club)/club/torneos/page.tsx" "app/(club)/club/torneos/campeonatos/nuevo/page.tsx" tests/unit/components/championships/championship-details-form.test.tsx
git commit -m "feat(club): championships and americanos, and a new championship"
```

---

### Task 24: Días de juego y categorías del borrador

**Files:**
- Create: `components/championships/windows-editor.tsx`
- Create: `components/championships/categories-editor.tsx`
- Test: `tests/unit/components/championships/draft-editors.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/championships/draft-editors.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CategoriesEditor } from '@/components/championships/categories-editor'
import { WindowsEditor } from '@/components/championships/windows-editor'
import type { FormAction } from '@/components/ui/action-form'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })
const COURTS = [
  { id: 'court-1', name: 'Cancha 1' },
  { id: 'court-2', name: 'Cancha 2' },
]

describe('WindowsEditor', () => {
  it('lists the days of play, deletes one and adds another on the courts chosen', async () => {
    const add = vi.fn<FormAction>(ok)
    const remove = vi.fn<FormAction>(ok)
    render(
      <WindowsEditor
        championshipId="ch1"
        windows={[{ id: 'w1', text: 'sábado 17 de octubre, 08:00 a 14:00', courts: 'Cancha 1 y Cancha 2' }]}
        courts={COURTS}
        fromTimes={['08:00', '08:30', '09:00']}
        toTimes={['08:30', '09:00', '23:00']}
        today="2026-10-06"
        addAction={add}
        deleteAction={remove}
      />,
    )
    const region = screen.getByRole('region', { name: 'Días de juego' })
    const item = within(region).getByRole('listitem')
    expect(item).toHaveTextContent('sábado 17 de octubre, 08:00 a 14:00')
    expect(item).toHaveTextContent('Cancha 1 y Cancha 2')
    await userEvent.click(within(item).getByRole('button', { name: 'Quitar' }))
    await waitFor(() => expect(remove).toHaveBeenCalled())
    expect(remove.mock.calls[0][1].get('windowId')).toBe('w1')

    expect(within(region).getByLabelText('Hasta')).toHaveValue('23:00')
    fireEvent.change(within(region).getByLabelText('Día'), { target: { value: '2026-10-18' } })
    await userEvent.click(within(region).getByLabelText('Cancha 2'))
    await userEvent.click(within(region).getByRole('button', { name: 'Agregar día' }))
    await waitFor(() => expect(add).toHaveBeenCalled())
    const sent = add.mock.calls[0][1]
    expect(sent.get('championshipId')).toBe('ch1')
    expect(sent.get('date')).toBe('2026-10-18')
    expect(sent.get('fromTime')).toBe('08:00')
    expect(sent.getAll('courtIds')).toEqual(['court-1'])
  })
})

describe('CategoriesEditor', () => {
  it('lists the categories and adds one starting from the defaults', async () => {
    const add = vi.fn<FormAction>(ok)
    render(
      <CategoriesEditor
        championshipId="ch1"
        categories={[{ id: 'k1', name: '6ta Libre', detail: 'Libre · $2.000 por pareja' }]}
        addAction={add}
        deleteAction={vi.fn<FormAction>(ok)}
      />,
    )
    const region = screen.getByRole('region', { name: 'Categorías' })
    expect(within(region).getByRole('listitem')).toHaveTextContent('6ta Libre')
    expect(within(region).getByLabelText('Máximo de parejas')).toHaveValue(16)
    expect(within(region).getByLabelText('Tercer set')).toHaveValue('super_tiebreak')
    await userEvent.type(within(region).getByLabelText('Nombre'), '5ta Damas')
    await userEvent.selectOptions(within(region).getByLabelText('Género'), 'women')
    await userEvent.clear(within(region).getByLabelText('Máximo de parejas'))
    await userEvent.type(within(region).getByLabelText('Máximo de parejas'), '8')
    await userEvent.click(within(region).getByLabelText('Punto de oro'))
    await userEvent.click(within(region).getByRole('button', { name: 'Agregar categoría' }))
    await waitFor(() => expect(add).toHaveBeenCalled())
    expect(Object.fromEntries(add.mock.calls[0][1].entries())).toEqual({
      championshipId: 'ch1',
      name: '5ta Damas',
      gender: 'women',
      levelMin: '',
      levelMax: '',
      minPairs: '4',
      maxPairs: '8',
      price: '2000',
      format: 'groups_knockout',
      groupSize: '4',
      qualifiers: '2',
      matchMinutes: '90',
      seeding: 'ranking',
      thirdSet: 'super_tiebreak',
      goldenPoint: 'on',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/championships/draft-editors.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/championships/categories-editor"`).

- [ ] **Step 3: Days of play**

`components/championships/windows-editor.tsx`:
```tsx
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'

export type WindowItem = { id: string; text: string; courts: string }

// Design: "ventanas (filas día, desde, hasta, canchas)". Only in a draft: once registration opens, each day of
// play blocks its courts.
export function WindowsEditor({
  championshipId,
  windows,
  courts,
  fromTimes,
  toTimes,
  today,
  addAction,
  deleteAction,
}: {
  championshipId: string
  windows: WindowItem[]
  courts: { id: string; name: string }[]
  fromTimes: string[]
  toTimes: string[]
  today: string
  addAction: FormAction
  deleteAction: FormAction
}) {
  return (
    <section aria-labelledby="dias-de-juego" className="flex flex-col gap-3">
      <h2 id="dias-de-juego" className="font-display text-2xl font-bold uppercase">
        Días de juego
      </h2>
      {windows.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {windows.map((window) => (
            <li key={window.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
              <p>
                <span className="font-semibold">{window.text}</span>
                <span className="text-fg-muted"> · {window.courts}</span>
              </p>
              <ActionForm action={deleteAction} submitLabel="Quitar" pendingLabel="Quitando…" variant="ghost">
                <input type="hidden" name="windowId" value={window.id} />
              </ActionForm>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-fg-muted">Todavía no hay días de juego.</p>
      )}
      <ActionForm action={addAction} submitLabel="Agregar día" pendingLabel="Agregando…" variant="secondary">
        <input type="hidden" name="championshipId" value={championshipId} />
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Día" htmlFor="window-date">
            <input id="window-date" name="date" type="date" min={today} required className={inputClasses} />
          </Field>
          <Field label="Desde" htmlFor="window-from">
            <select id="window-from" name="fromTime" defaultValue={fromTimes[0]} className={inputClasses}>
              {fromTimes.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Hasta" htmlFor="window-to">
            <select id="window-to" name="toTime" defaultValue={toTimes[toTimes.length - 1]} className={inputClasses}>
              {toTimes.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">Canchas</legend>
          <div className="flex flex-wrap gap-4">
            {courts.map((court) => (
              <label key={court.id} className="inline-flex min-h-11 items-center gap-2">
                <input type="checkbox" name="courtIds" value={court.id} defaultChecked className="size-5 accent-accent" />
                {court.name}
              </label>
            ))}
          </div>
        </fieldset>
      </ActionForm>
    </section>
  )
}
```

- [ ] **Step 4: Categories**

`components/championships/categories-editor.tsx`:
```tsx
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import {
  CATEGORY_DEFAULTS,
  CATEGORY_FORMATS,
  CATEGORY_GENDERS,
  FORMAT_LABELS,
  GENDER_LABELS,
  SEEDING_LABELS,
  SEEDINGS,
  THIRD_SET_LABELS,
  THIRD_SETS,
} from '@/lib/domain/championships'
import { CATEGORIES } from '@/lib/domain/profile'

export type CategoryItem = { id: string; name: string; detail: string }

function NumberField({ id, name, label, min, max, value }: { id: string; name: string; label: string; min: number; max: number; value: number }) {
  return (
    <Field label={label} htmlFor={id}>
      <input id={id} name={name} type="number" inputMode="numeric" min={min} max={max} required defaultValue={value} className={inputClasses} />
    </Field>
  )
}

// Design: "categorías (filas con valores por defecto)". Only in a draft; after that, categories are merged or
// cancelled.
export function CategoriesEditor({
  championshipId,
  categories,
  addAction,
  deleteAction,
}: {
  championshipId: string
  categories: CategoryItem[]
  addAction: FormAction
  deleteAction: FormAction
}) {
  return (
    <section aria-labelledby="categorias-del-campeonato" className="flex flex-col gap-3">
      <h2 id="categorias-del-campeonato" className="font-display text-2xl font-bold uppercase">
        Categorías
      </h2>
      {categories.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {categories.map((category) => (
            <li key={category.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
              <p>
                <span className="font-semibold">{category.name}</span>
                <span className="text-fg-muted"> · {category.detail}</span>
              </p>
              <ActionForm action={deleteAction} submitLabel="Quitar" pendingLabel="Quitando…" variant="ghost">
                <input type="hidden" name="categoryId" value={category.id} />
              </ActionForm>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-fg-muted">Todavía no hay categorías.</p>
      )}
      <ActionForm action={addAction} submitLabel="Agregar categoría" pendingLabel="Agregando…" variant="secondary">
        <input type="hidden" name="championshipId" value={championshipId} />
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Nombre" htmlFor="category-name">
            <input id="category-name" name="name" required maxLength={40} placeholder="6ta Libre" className={inputClasses} />
          </Field>
          <Field label="Género" htmlFor="category-gender">
            <select id="category-gender" name="gender" defaultValue={CATEGORY_DEFAULTS.gender} className={inputClasses}>
              {CATEGORY_GENDERS.map((gender) => (
                <option key={gender} value={gender}>
                  {GENDER_LABELS[gender]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Precio por pareja" htmlFor="category-price">
            <input id="category-price" name="price" type="number" inputMode="numeric" min={0} required
              defaultValue={CATEGORY_DEFAULTS.price} className={inputClasses} />
          </Field>
          <Field label="Categoría desde" htmlFor="category-level-min">
            <select id="category-level-min" name="levelMin" defaultValue="" className={inputClasses}>
              <option value="">Cualquiera</option>
              {CATEGORIES.map((level) => (
                <option key={level} value={level}>
                  {level}ª
                </option>
              ))}
            </select>
          </Field>
          <Field label="Categoría hasta" htmlFor="category-level-max">
            <select id="category-level-max" name="levelMax" defaultValue="" className={inputClasses}>
              <option value="">Cualquiera</option>
              {CATEGORIES.map((level) => (
                <option key={level} value={level}>
                  {level}ª
                </option>
              ))}
            </select>
          </Field>
          <NumberField id="category-min" name="minPairs" label="Mínimo de parejas" min={2} max={64} value={CATEGORY_DEFAULTS.minPairs} />
          <NumberField id="category-max" name="maxPairs" label="Máximo de parejas" min={2} max={64} value={CATEGORY_DEFAULTS.maxPairs} />
          <Field label="Formato" htmlFor="category-format">
            <select id="category-format" name="format" defaultValue={CATEGORY_DEFAULTS.format} className={inputClasses}>
              {CATEGORY_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {FORMAT_LABELS[format]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Parejas por zona" htmlFor="category-group-size">
            <select id="category-group-size" name="groupSize" defaultValue={CATEGORY_DEFAULTS.groupSize} className={inputClasses}>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </Field>
          <NumberField id="category-qualifiers" name="qualifiers" label="Clasifican por zona" min={1} max={3} value={CATEGORY_DEFAULTS.qualifiers} />
          <NumberField id="category-minutes" name="matchMinutes" label="Minutos por partido" min={30} max={240} value={CATEGORY_DEFAULTS.matchMinutes} />
          <Field label="Cabezas de serie" htmlFor="category-seeding">
            <select id="category-seeding" name="seeding" defaultValue={CATEGORY_DEFAULTS.seeding} className={inputClasses}>
              {SEEDINGS.map((seeding) => (
                <option key={seeding} value={seeding}>
                  {SEEDING_LABELS[seeding]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tercer set" htmlFor="category-third-set">
            <select id="category-third-set" name="thirdSet" defaultValue={CATEGORY_DEFAULTS.thirdSet} className={inputClasses}>
              {THIRD_SETS.map((thirdSet) => (
                <option key={thirdSet} value={thirdSet}>
                  {THIRD_SET_LABELS[thirdSet]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" name="goldenPoint" className="size-5 accent-accent" />
          Punto de oro
        </label>
      </ActionForm>
    </section>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
npx vitest run tests/unit/components/championships/draft-editors.test.tsx
npm run typecheck
npm run lint
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/championships/windows-editor.tsx components/championships/categories-editor.tsx tests/unit/components/championships/draft-editors.test.tsx
git commit -m "feat(club): days of play and categories of a draft"
```

---

### Task 25: El afiche (subida, formulario y acciones)

**Files:**
- Create: `lib/storage/championship-poster.ts`
- Create: `components/championships/poster-form.tsx`
- Modify: `app/(club)/club/torneos/campeonatos/actions.ts` (agrega `saveChampionshipPoster` y `removeChampionshipPoster` al final)
- Test: `tests/unit/components/championships/poster-form.test.tsx`, `tests/unit/lib/actions/championship-club-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/championships/poster-form.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PosterForm, type PosterFormProps } from '@/components/championships/poster-form'

const PNG = new File(['png'], 'afiche.png', { type: 'image/png' })

function renderForm(overrides: Partial<PosterFormProps> = {}) {
  const props: PosterFormProps = {
    championshipId: 'ch1',
    clubId: 'club-1',
    posterUrl: null,
    saveAction: vi.fn(async () => ({ status: 'ok' as const, message: 'Afiche guardado.' })),
    removeAction: vi.fn(async () => ({ status: 'ok' as const, message: 'Afiche quitado.' })),
    upload: vi.fn(async () => ({ path: 'club-1/poster-1.png' })),
    ...overrides,
  }
  render(<PosterForm {...props} />)
  return props
}

describe('PosterForm', () => {
  it('uploads the file and points the championship at it', async () => {
    const props = renderForm()
    await userEvent.upload(screen.getByLabelText('Archivo del afiche'), PNG)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar afiche' }))
    await waitFor(() => expect(props.saveAction).toHaveBeenCalledWith('ch1', 'club-1/poster-1.png'))
    expect(props.upload).toHaveBeenCalledWith('club-1', PNG)
    expect(await screen.findByRole('status')).toHaveTextContent('Afiche guardado.')
  })

  it('asks for a file first', async () => {
    const props = renderForm()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar afiche' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Elegí el archivo del afiche.')
    expect(props.saveAction).not.toHaveBeenCalled()
  })

  it('shows the poster it has and takes it away', async () => {
    const props = renderForm({ posterUrl: 'https://db.test/poster.png' })
    expect(screen.getByRole('img', { name: 'Afiche actual' })).toHaveAttribute('src', 'https://db.test/poster.png')
    await userEvent.click(screen.getByRole('button', { name: 'Quitar afiche' }))
    await waitFor(() => expect(props.removeAction).toHaveBeenCalledWith('ch1'))
  })
})
```

Append to `tests/unit/lib/actions/championship-club-actions.test.ts`:
```ts
describe('the poster', () => {
  it('points the championship at a poster of the club, or at none', async () => {
    expect(await club.saveChampionshipPoster(ID, 'otro-club/poster-1.png')).toEqual(INVALID_INPUT)
    expect(await club.saveChampionshipPoster('ch1', 'club-1/poster-1.png')).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
    expect(await club.saveChampionshipPoster(ID, 'club-1/poster-1760000000000.png')).toEqual({ status: 'ok', message: 'Afiche guardado.' })
    expect(await club.removeChampionshipPoster(ID)).toEqual({ status: 'ok', message: 'Afiche quitado.' })
    expect(rpc.mock.calls).toEqual([
      ['set_championship_poster', { p_championship_id: ID, p_path: 'club-1/poster-1760000000000.png' }],
      ['set_championship_poster', { p_championship_id: ID, p_path: '' }],
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/championships/poster-form.test.tsx tests/unit/lib/actions/championship-club-actions.test.ts`
Expected: FAIL (`poster-form` no se resuelve; `club.saveChampionshipPoster is not a function`).

- [ ] **Step 3: The upload**

`lib/storage/championship-poster.ts`:
```ts
import { checkPosterFile, POSTER_BUCKET, posterPath } from '@/lib/domain/championship-poster'
import { createClient } from '@/lib/supabase/client'
import type { UploadResult } from './receipts'

// Uploads straight from the browser to Storage; the policy only lets the club's staff write. posterPath reads
// the clock, so it is called once.
export async function uploadChampionshipPoster(clubId: string, file: File): Promise<UploadResult> {
  const problem = checkPosterFile(file)
  if (problem) return { error: problem }
  const path = posterPath(clubId, file.name)
  const { error } = await createClient()
    .storage.from(POSTER_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type })
  return error ? { error: 'No pudimos subir el afiche. Probá de nuevo.' } : { path }
}
```

- [ ] **Step 4: The form**

`components/championships/poster-form.tsx`:
```tsx
'use client'

import { useActionState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { FileField } from '@/components/ui/file-field'
import { SubmitButton } from '@/components/ui/submit-button'
import { failed, IDLE, type ActionState } from '@/lib/actions/result'
import { POSTER_TYPES } from '@/lib/domain/championship-poster'
import { uploadChampionshipPoster } from '@/lib/storage/championship-poster'
import type { UploadResult } from '@/lib/storage/receipts'

export type PosterFormProps = {
  championshipId: string
  clubId: string
  posterUrl: string | null
  saveAction: (championshipId: string, path: string) => Promise<ActionState>
  removeAction: (championshipId: string) => Promise<ActionState>
  upload?: (clubId: string, file: File) => Promise<UploadResult>
}

// The championship's poster: the file goes from the browser to Storage, then the championship points at it.
export function PosterForm({ championshipId, clubId, posterUrl, saveAction, removeAction, upload = uploadChampionshipPoster }: PosterFormProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [state, formAction, pending] = useActionState(async (): Promise<ActionState> => {
    // input.files, not FormData: file inputs serialize differently between environments.
    const file = fileInput.current?.files?.[0]
    if (!file || file.size === 0) return failed('Elegí el archivo del afiche.')
    const uploaded = await upload(clubId, file)
    if ('error' in uploaded) return failed(uploaded.error)
    return (await saveAction(championshipId, uploaded.path)) ?? IDLE
  }, IDLE)
  const [removed, removeFormAction, removing] = useActionState(async () => (await removeAction(championshipId)) ?? IDLE, IDLE)
  const outcome = removed.status !== 'idle' ? removed : state

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-semibold">Afiche</h3>
      {posterUrl ? (
        // A plain img: the poster comes from Supabase Storage and next/image would need its host configured.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={posterUrl} alt="Afiche actual" className="max-h-64 w-full rounded-xl object-contain" />
      ) : (
        <p className="text-sm text-fg-muted">Opcional. PNG, JPG o WebP, hasta 5 MB. Se ve en la página del campeonato.</p>
      )}
      <form action={formAction} className="flex flex-col gap-3">
        <FileField id="championship-poster" name="poster" label="Archivo del afiche" accept={POSTER_TYPES.join(',')} inputRef={fileInput} />
        <SubmitButton label="Guardar afiche" pendingLabel="Subiendo…" pending={pending} />
      </form>
      {posterUrl ? (
        <form action={removeFormAction}>
          <Button type="submit" variant="ghost" fullWidth disabled={removing}>
            Quitar afiche
          </Button>
        </form>
      ) : null}
      {outcome.status === 'error' ? (
        <p role="alert" className="rounded-xl border border-accent bg-bg p-3 text-sm">
          {outcome.message}
        </p>
      ) : null}
      {outcome.status === 'ok' ? (
        <p role="status" className="text-sm">
          {outcome.message}
        </p>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 5: The actions**

In `app/(club)/club/torneos/campeonatos/actions.ts`, add to the imports:
```ts
import { isPosterPath } from '@/lib/domain/championship-poster'
```
change the import from `@/lib/domain/input` to:
```ts
import { isUuid, readInt, readUuid } from '@/lib/domain/input'
```
and append:
```ts
// The browser already uploaded the file (only staff can); this points the championship at it.
export async function saveChampionshipPoster(championshipId: string, path: string): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return SESSION_EXPIRED
  if (!isUuid(championshipId) || typeof path !== 'string' || !isPosterPath(viewer.club.id, path)) return INVALID_INPUT
  return run(
    (supabase) => supabase.rpc('set_championship_poster', { p_championship_id: championshipId, p_path: path }),
    'Afiche guardado.',
  )
}

export async function removeChampionshipPoster(championshipId: string): Promise<ActionState> {
  if (!isUuid(championshipId)) return INVALID_INPUT
  return run(
    (supabase) => supabase.rpc('set_championship_poster', { p_championship_id: championshipId, p_path: '' }),
    'Afiche quitado.',
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/components/championships/poster-form.test.tsx tests/unit/lib/actions/championship-club-actions.test.ts
npm run typecheck
npm run lint
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/storage/championship-poster.ts components/championships/poster-form.tsx "app/(club)/club/torneos/campeonatos/actions.ts" tests/unit/components/championships/poster-form.test.tsx tests/unit/lib/actions/championship-club-actions.test.ts
git commit -m "feat(club): a poster for the championship"
```

---

### Task 26: Gestionar un campeonato: pasos, borrador y datos

**Files:**
- Create: `components/championships/championship-controls.tsx`
- Create: `app/(club)/club/torneos/campeonatos/[id]/page.tsx`
- Test: `tests/unit/components/championships/championship-controls.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/championships/championship-controls.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChampionshipControls, type ControlActions } from '@/components/championships/championship-controls'
import type { FormAction } from '@/components/ui/action-form'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })

function actions(): ControlActions {
  return { open: vi.fn<FormAction>(ok), close: vi.fn<FormAction>(ok), cancel: vi.fn<FormAction>(ok) }
}

describe('ChampionshipControls', () => {
  it('says what a draft still needs before opening', () => {
    render(<ChampionshipControls championshipId="ch1" status="draft" readiness="Agregá al menos una categoría." actions={actions()} />)
    expect(screen.getByText('Agregá al menos una categoría.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir inscripción' })).not.toBeInTheDocument()
  })

  it('opens a draft that is ready', async () => {
    const steps = actions()
    render(<ChampionshipControls championshipId="ch1" status="draft" readiness={null} actions={steps} />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir inscripción' }))
    await waitFor(() => expect(steps.open).toHaveBeenCalled())
    expect(vi.mocked(steps.open).mock.calls[0][1].get('championshipId')).toBe('ch1')
  })

  it('closes registration, and asks before cancelling', async () => {
    const steps = actions()
    render(<ChampionshipControls championshipId="ch1" status="registration" readiness={null} actions={steps} />)
    expect(screen.getByRole('button', { name: 'Cerrar inscripción' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar campeonato' }))
    const sheet = screen.getByRole('dialog', { name: 'Cancelar campeonato' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Sí, cancelar el campeonato' }))
    await waitFor(() => expect(steps.cancel).toHaveBeenCalled())
  })

  it('offers nothing once it is cancelled', () => {
    render(<ChampionshipControls championshipId="ch1" status="cancelled" readiness={null} actions={actions()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/championships/championship-controls.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/championships/championship-controls"`).

- [ ] **Step 3: The controls**

`components/championships/championship-controls.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button, type ButtonVariant } from '@/components/ui/button'
import type { ChampionshipStatus } from '@/lib/domain/championships'

export type ControlActions = { open: FormAction; close: FormAction; cancel: FormAction }

function Step({
  action,
  championshipId,
  label,
  pendingLabel,
  variant,
}: {
  action: FormAction
  championshipId: string
  label: string
  pendingLabel: string
  variant?: ButtonVariant
}) {
  return (
    <ActionForm action={action} submitLabel={label} pendingLabel={pendingLabel} variant={variant}>
      <input type="hidden" name="championshipId" value={championshipId} />
    </ActionForm>
  )
}

// Design: "Gestión": "Abrir inscripción", "Cerrar inscripción", "Cancelar campeonato"; only the step that fits.
export function ChampionshipControls({
  championshipId,
  status,
  readiness,
  actions,
}: {
  championshipId: string
  status: ChampionshipStatus
  readiness: string | null
  actions: ControlActions
}) {
  const [confirmCancel, setConfirmCancel] = useState(false)

  return (
    <section aria-label="Acciones del campeonato" className="flex flex-col gap-3">
      {status === 'draft' && readiness ? <p className="text-sm text-fg-muted">{readiness}</p> : null}
      {status === 'draft' && !readiness ? (
        <>
          <p className="text-sm text-fg-muted">
            Al abrir la inscripción, las canchas de los días de juego quedan bloqueadas y los socios ya se pueden anotar.
          </p>
          <Step action={actions.open} championshipId={championshipId} label="Abrir inscripción" pendingLabel="Abriendo…" />
        </>
      ) : null}
      {status === 'registration' ? (
        <Step action={actions.close} championshipId={championshipId} label="Cerrar inscripción" pendingLabel="Cerrando…" />
      ) : null}
      {status !== 'finished' && status !== 'cancelled' ? (
        <Button variant="danger" fullWidth onClick={() => setConfirmCancel(true)}>
          Cancelar campeonato
        </Button>
      ) : null}
      <BottomSheet open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancelar campeonato">
        <p className="mb-4">
          Libera las canchas y les avisa a los anotados. Lo que ya se cobró queda en Cobros para devolver.
        </p>
        <Step
          action={actions.cancel}
          championshipId={championshipId}
          label="Sí, cancelar el campeonato"
          pendingLabel="Cancelando…"
          variant="danger"
        />
      </BottomSheet>
    </section>
  )
}
```

- [ ] **Step 4: The page**

`app/(club)/club/torneos/campeonatos/[id]/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CategoriesEditor } from '@/components/championships/categories-editor'
import { ChampionshipControls } from '@/components/championships/championship-controls'
import { ChampionshipDetailsForm } from '@/components/championships/championship-details-form'
import { PosterForm } from '@/components/championships/poster-form'
import { WindowsEditor } from '@/components/championships/windows-editor'
import { BackLink } from '@/components/ui/back-link'
import { Card } from '@/components/ui/card'
import { requireStaff } from '@/lib/auth/viewer'
import { loadChampionship } from '@/lib/data/championships'
import { loadActiveCourts } from '@/lib/data/tournaments'
import { championshipPosterUrl } from '@/lib/domain/championship-poster'
import {
  categoryDetail,
  CHAMPIONSHIP_STATUS_LABELS,
  championshipReadiness,
  closesText,
  datesText,
  openCategories,
  windowText,
} from '@/lib/domain/championships'
import { timeIn } from '@/lib/domain/format'
import { isUuid } from '@/lib/domain/input'
import { TIME_OPTIONS } from '@/lib/domain/settings'
import { localDateOf, parseTime } from '@/lib/domain/time'
import { courtsText } from '@/lib/domain/tournaments'
import { getSupabaseEnv } from '@/lib/supabase/env'
import {
  addCategory,
  addWindow,
  cancelChampionship,
  closeRegistration,
  deleteCategory,
  deleteWindow,
  openRegistration,
  removeChampionshipPoster,
  saveChampionshipPoster,
  updateChampionship,
} from '../actions'

export const metadata: Metadata = { title: 'Campeonato' }

type Params = Promise<{ id: string }>

// A draft is edited here (days of play and categories); from the opening of registration on, the same page
// manages the pairs.
export default async function ManageChampionshipPage({ params }: { params: Params }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const viewer = await requireStaff(`/club/torneos/campeonatos/${id}`)
  const { club } = viewer
  const [championship, courts] = await Promise.all([loadChampionship(club, id), loadActiveCourts(club)])
  if (!championship) notFound()

  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const courtName = new Map(courts.map((court) => [court.id, court.name]))
  const opens = parseTime(club.opens_at)
  const closes = parseTime(club.closes_at)
  const draft = championship.status === 'draft'
  const editable = championship.status !== 'finished' && championship.status !== 'cancelled'
  const closesAt = championship.registrationClosesAt
  const deadline = championship.status === 'registration' ? closesText(championship, club.timezone) : null

  return (
    <>
      <BackLink href="/club/torneos">Volver a torneos</BackLink>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-display text-3xl font-bold uppercase">{championship.name}</h2>
          <span className="shrink-0 whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
            {CHAMPIONSHIP_STATUS_LABELS[championship.status]}
          </span>
        </div>
        <p className="text-fg-muted">{datesText(championship)}</p>
        {deadline ? <p className="text-sm">Inscripción hasta el {deadline}.</p> : null}
      </header>

      <ChampionshipControls
        championshipId={championship.id}
        status={championship.status}
        readiness={championshipReadiness(championship)}
        actions={{ open: openRegistration, close: closeRegistration, cancel: cancelChampionship }}
      />

      {draft ? (
        <>
          <WindowsEditor
            championshipId={championship.id}
            windows={championship.windows.map((window) => ({
              id: window.id,
              text: windowText(window),
              courts: courtsText(window.courtIds.map((courtId) => courtName.get(courtId) ?? 'Cancha')),
            }))}
            courts={courts}
            fromTimes={TIME_OPTIONS.filter((time) => parseTime(time) >= opens && parseTime(time) < closes)}
            toTimes={TIME_OPTIONS.filter((time) => parseTime(time) > opens && parseTime(time) <= closes)}
            today={today}
            addAction={addWindow}
            deleteAction={deleteWindow}
          />
          <CategoriesEditor
            championshipId={championship.id}
            categories={openCategories(championship).map((category) => ({
              id: category.id,
              name: category.name,
              detail: categoryDetail(category),
            }))}
            addAction={addCategory}
            deleteAction={deleteCategory}
          />
        </>
      ) : null}

      {editable ? (
        <section aria-labelledby="datos" className="flex flex-col gap-3">
          <h2 id="datos" className="font-display text-2xl font-bold uppercase">
            Datos
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <ChampionshipDetailsForm
                action={updateChampionship}
                submitLabel="Guardar datos"
                pendingLabel="Guardando…"
                today={today}
                details={{
                  id: championship.id,
                  name: championship.name,
                  rules: championship.rules,
                  maxCategories: championship.maxCategoriesPerPlayer,
                  closesDate: closesAt ? localDateOf(closesAt, club.timezone) : '',
                  closesTime: closesAt ? timeIn(closesAt, club.timezone) : '',
                }}
              />
            </Card>
            <Card>
              <PosterForm
                championshipId={championship.id}
                clubId={club.id}
                posterUrl={championshipPosterUrl(getSupabaseEnv().url, championship.posterPath)}
                saveAction={saveChampionshipPoster}
                removeAction={removeChampionshipPoster}
              />
            </Card>
          </div>
        </section>
      ) : null}
    </>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/components/championships/championship-controls.test.tsx
npm run typecheck
npm test
npm run lint
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/championships/championship-controls.tsx "app/(club)/club/torneos/campeonatos/[id]/page.tsx" tests/unit/components/championships/championship-controls.test.tsx
git commit -m "feat(club): manage a championship: draft, steps and data"
```

---

### Task 27: Las parejas por categoría (tablas, cobrar, mover, quitar, horarios, cargar pareja)

**Files:**
- Create: `lib/domain/championship-pairs.ts`
- Create: `components/championships/pairs-table.tsx`
- Create: `components/championships/add-pair-sheet.tsx`
- Create: `components/championships/pairs-board.tsx`
- Modify: `app/(club)/club/torneos/campeonatos/[id]/page.tsx`
- Test: `tests/unit/lib/domain/championship-pairs.test.ts`, `tests/unit/components/championships/pairs-board.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/unit/lib/domain/championship-pairs.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { pairsCategories } from '@/lib/domain/championship-pairs'
import { BRUNO, LUCIA, makeCategory, makeChampionship, makeEntry, PEDRO } from '../../fixtures/championships'

describe('pairsCategories', () => {
  it('turns each category into the rows of its table, with phones, payment and hours', () => {
    const championship = makeChampionship({
      categories: [
        makeCategory({
          maxPairs: 1,
          entries: [
            makeEntry({
              id: 'e1',
              unavailable: ['2026-10-17@08:00'],
              unavailabilityApproved: true,
              note: 'Paga el sábado',
              payments: [{ status: 'confirmed', amount: 500, rejection_reason: null, created_at: '2026-10-08T12:00:00Z' }],
            }),
            makeEntry({ id: 'e2', player1: BRUNO, player2: LUCIA, status: 'waiting' }),
            makeEntry({ id: 'e3', status: 'withdrawn' }),
          ],
        }),
        makeCategory({ id: 'k2', name: '4ta', status: 'cancelled' }),
      ],
    })
    const phones = new Map([[PEDRO.id, '099111001'], [LUCIA.id, '099111002']])
    expect(pairsCategories(championship, phones)).toEqual([
      {
        id: 'k1',
        name: '6ta Libre',
        spots: '1 de 1 parejas · 1 en espera',
        rows: [
          {
            entryId: 'e1', pair: 'Ana y Pedro', phones: '099111001', levels: '5ª y 6ª', status: 'active', position: 0,
            stateText: 'Con lugar', paymentState: 'pending', due: 1500, hoursText: 'No pueden en 1 franja.', approved: true,
            unavailable: ['2026-10-17@08:00'], hoursNote: null, note: 'Paga el sábado',
          },
          {
            entryId: 'e2', pair: 'Bruno y Lucía', phones: '099111002', levels: '5ª y 6ª', status: 'waiting', position: 1,
            stateText: 'En espera, puesto 1', paymentState: 'none', due: 2000, hoursText: 'Pueden jugar en cualquier horario.',
            approved: false, unavailable: [], hoursNote: null, note: null,
          },
        ],
      },
    ])
  })
})
```

`tests/unit/components/championships/pairs-board.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PairsBoard, type PairsActions } from '@/components/championships/pairs-board'
import type { FormAction } from '@/components/ui/action-form'
import { pairsCategories, type PairsCategory } from '@/lib/domain/championship-pairs'
import { championshipBlocks } from '@/lib/domain/championships'
import { BRUNO, LUCIA, makeCategory, makeChampionship, makeEntry } from '../../fixtures/championships'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })
const CHAMPIONSHIP = makeChampionship({
  categories: [
    makeCategory({ maxPairs: 1, entries: [makeEntry({ id: 'e1' }), makeEntry({ id: 'e2', player1: BRUNO, player2: LUCIA, status: 'waiting' })] }),
    makeCategory({ id: 'k2', name: '5ta Damas' }),
  ],
})
const CATEGORIES: PairsCategory[] = pairsCategories(CHAMPIONSHIP, new Map())

function actions(): PairsActions {
  return {
    cash: vi.fn<FormAction>(ok),
    remove: vi.fn<FormAction>(ok),
    move: vi.fn<FormAction>(ok),
    add: vi.fn<FormAction>(ok),
    hours: vi.fn<FormAction>(ok),
  }
}

function renderBoard(editable = true) {
  const steps = actions()
  render(
    <PairsBoard
      categories={CATEGORIES}
      editable={editable}
      acceptsCash
      members={[{ userId: '66666666-6666-6666-6666-666666666666', name: 'Bruno Silva' }]}
      blocks={championshipBlocks(CHAMPIONSHIP.windows)}
      actions={steps}
    />,
  )
  return steps
}

describe('PairsBoard', () => {
  it('shows each category as a table, with places and the waiting line', () => {
    renderBoard()
    const libre = screen.getByRole('region', { name: '6ta Libre' })
    expect(libre).toHaveTextContent('1 de 1 parejas · 1 en espera')
    const ana = within(libre).getByRole('row', { name: /Ana y Pedro/ })
    expect(ana).toHaveTextContent('Con lugar')
    expect(ana).toHaveTextContent('Pendiente de pago')
    expect(within(libre).getByRole('row', { name: /Bruno y Lucía/ })).toHaveTextContent('En espera, puesto 1')
    expect(screen.getByRole('region', { name: '5ta Damas' })).toHaveTextContent('Todavía no hay parejas en esta categoría.')
  })

  it('filters the waiting line', async () => {
    renderBoard()
    const libre = screen.getByRole('region', { name: '6ta Libre' })
    await userEvent.selectOptions(within(libre).getByRole('combobox', { name: 'Estado' }), 'waiting')
    expect(within(libre).queryByRole('row', { name: /Ana y Pedro/ })).not.toBeInTheDocument()
    expect(within(libre).getByRole('row', { name: /Bruno y Lucía/ })).toBeInTheDocument()
  })

  it('charges cash to a pair with a place that owes', async () => {
    const steps = renderBoard()
    const ana = within(screen.getByRole('region', { name: '6ta Libre' })).getByRole('row', { name: /Ana y Pedro/ })
    await userEvent.click(within(ana).getByRole('button', { name: 'Cobrar $2.000' }))
    await waitFor(() => expect(steps.cash).toHaveBeenCalled())
    const sent = vi.mocked(steps.cash).mock.calls[0][1]
    expect(sent.get('entryId')).toBe('e1')
    expect(sent.get('amount')).toBe('2000')
    const bruno = within(screen.getByRole('region', { name: '6ta Libre' })).getByRole('row', { name: /Bruno y Lucía/ })
    expect(within(bruno).queryByRole('button', { name: /Cobrar/ })).not.toBeInTheDocument()
  })

  it('moves a pair to another category', async () => {
    const steps = renderBoard()
    const ana = within(screen.getByRole('region', { name: '6ta Libre' })).getByRole('row', { name: /Ana y Pedro/ })
    await userEvent.click(within(ana).getByRole('button', { name: 'Mover' }))
    const sheet = screen.getByRole('dialog', { name: 'Mover a otra categoría' })
    expect(within(sheet).getAllByRole('option').map((option) => option.textContent)).toEqual(['5ta Damas'])
    await userEvent.click(within(sheet).getByRole('button', { name: 'Mover' }))
    await waitFor(() => expect(steps.move).toHaveBeenCalled())
    expect(Object.fromEntries(vi.mocked(steps.move).mock.calls[0][1].entries())).toEqual({ entryId: 'e1', categoryId: 'k2' })
  })

  it('asks before taking a pair out', async () => {
    const steps = renderBoard()
    const bruno = within(screen.getByRole('region', { name: '6ta Libre' })).getByRole('row', { name: /Bruno y Lucía/ })
    await userEvent.click(within(bruno).getByRole('button', { name: 'Quitar' }))
    const sheet = screen.getByRole('dialog', { name: 'Quitar pareja' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Sí, quitar la pareja' }))
    await waitFor(() => expect(steps.remove).toHaveBeenCalled())
    expect(vi.mocked(steps.remove).mock.calls[0][1].get('entryId')).toBe('e2')
    expect(await screen.findByRole('status')).toHaveTextContent('Listo.')
  })

  it('opens the hours of a pair with no limit, and loads a whole pair', async () => {
    const steps = renderBoard()
    const ana = within(screen.getByRole('region', { name: '6ta Libre' })).getByRole('row', { name: /Ana y Pedro/ })
    await userEvent.click(within(ana).getByRole('button', { name: 'Horarios' }))
    expect(screen.getByRole('dialog', { name: 'Horarios imposibles' })).toHaveTextContent('Son 6 franjas')
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    await userEvent.click(screen.getByRole('button', { name: 'Cargar pareja' }))
    const sheet = screen.getByRole('dialog', { name: 'Cargar pareja' })
    await userEvent.selectOptions(within(sheet).getByRole('combobox', { name: 'Categoría' }), 'k2')
    const first = within(sheet).getByRole('group', { name: 'Jugador 1' })
    await userEvent.type(within(first).getByRole('combobox', { name: 'Nombre' }), 'bru')
    await userEvent.click(within(first).getByRole('option', { name: 'Bruno Silva' }))
    const second = within(sheet).getByRole('group', { name: 'Jugador 2' })
    await userEvent.click(within(second).getByRole('radio', { name: 'Es de afuera' }))
    await userEvent.type(within(second).getByRole('textbox', { name: 'Nombre y apellido' }), 'Lucía Pérez')
    await userEvent.type(within(second).getByRole('textbox', { name: 'Teléfono' }), '099111002')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cargar pareja' }))
    await waitFor(() => expect(steps.add).toHaveBeenCalled())
    expect(Object.fromEntries(vi.mocked(steps.add).mock.calls[0][1].entries())).toEqual({
      categoryId: 'k2',
      player1Kind: 'member',
      player1ProfileId: '66666666-6666-6666-6666-666666666666',
      player1Level: '5',
      player2Kind: 'guest',
      player2Name: 'Lucía Pérez',
      player2Phone: '099111002',
      player2Level: '5',
      note: '',
    })
  })

  it('only charges once the draw is done', () => {
    renderBoard(false)
    expect(screen.queryByRole('button', { name: 'Cargar pareja' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quitar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cobrar $2.000' })).toBeInTheDocument()
  })
})
```
- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/domain/championship-pairs.test.ts tests/unit/components/championships/pairs-board.test.tsx`
Expected: FAIL (`Failed to resolve import "@/lib/domain/championship-pairs"`).

- [ ] **Step 3: The rows of each table**

`lib/domain/championship-pairs.ts`:
```ts
import {
  entryStateText,
  openCategories,
  pairName,
  spotsText,
  unavailabilityText,
  waitingPosition,
  type Championship,
  type ChampionshipEntry,
} from './championships'
import type { PaymentState } from './payments'
import { entryPaymentView } from './tournament-payments'

// A pair in the organizer's table. position: 0 with a place, its place in line when waiting.
export type PairRow = {
  entryId: string
  pair: string
  phones: string
  levels: string
  status: 'active' | 'waiting'
  position: number
  stateText: string
  paymentState: PaymentState
  due: number
  hoursText: string
  approved: boolean
  unavailable: string[]
  hoursNote: string | null
  note: string | null
}
export type PairsCategory = { id: string; name: string; spots: string; rows: PairRow[] }

type InEntry = ChampionshipEntry & { status: 'active' | 'waiting' }
const isIn = (entry: ChampionshipEntry): entry is InEntry => entry.status === 'active' || entry.status === 'waiting'

// Design: "por categoría, una tabla de parejas con estado de pago". Open categories only; pairs with a place or
// waiting. A waiting pair that paid nothing shows "Sin pagos": it pays once it gets in.
export function pairsCategories(championship: Championship, phones: Map<string, string>): PairsCategory[] {
  return openCategories(championship).map((category) => ({
    id: category.id,
    name: category.name,
    spots: spotsText(category),
    rows: category.entries.filter(isIn).map((entry) => {
      const payment = entryPaymentView(category.price, entry.payments, false)
      const paidSomething = entry.payments.some((item) => item.status === 'confirmed' || item.status === 'reported')
      return {
        entryId: entry.id,
        pair: pairName(entry),
        phones: [entry.player1, entry.player2].flatMap((player) => {
          const phone = phones.get(player.id)
          return phone ? [phone] : []
        }).join(' · '),
        levels: `${entry.level1}ª y ${entry.level2}ª`,
        status: entry.status,
        position: entry.status === 'waiting' ? (waitingPosition(category, entry.id) ?? 0) : 0,
        stateText: entryStateText(category, entry),
        paymentState: entry.status === 'waiting' && !paidSomething ? 'none' : payment.state,
        due: payment.due,
        hoursText: unavailabilityText(entry.unavailable.length),
        approved: entry.unavailabilityApproved,
        unavailable: entry.unavailable,
        hoursNote: entry.unavailabilityNote,
        note: entry.note,
      }
    }),
  }))
}
```

- [ ] **Step 4: One category's table**

`components/championships/pairs-table.tsx`:
```tsx
'use client'

import { PaymentBadge } from '@/components/booking/payment-badge'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/data-table'
import type { PairRow, PairsCategory } from '@/lib/domain/championship-pairs'
import { formatPrice } from '@/lib/domain/format'
import { PAYMENT_LABELS } from '@/lib/domain/payments'

export type PairAction = 'hours' | 'move' | 'remove'

const COLUMNS: DataColumn[] = [
  { key: 'pair', label: 'Pareja', sortable: true },
  { key: 'state', label: 'Estado', sortable: true },
  { key: 'payment', label: 'Pago', sortable: true },
  { key: 'hours', label: 'Horarios' },
  { key: 'actions', label: 'Acciones', hideLabel: true },
]

// Design: "por categoría, una tabla de parejas con estado de pago, Cobrar, Quitar, Mover, filtros (estado,
// pago) y búsqueda por nombre". Cash while it has a place and owes; the rest until the draw.
export function PairsTable({
  category,
  editable,
  acceptsCash,
  cashAction,
  onAction,
}: {
  category: PairsCategory
  editable: boolean
  acceptsCash: boolean
  cashAction: FormAction
  onAction: (action: PairAction, row: PairRow) => void
}) {
  const rows: DataRow[] = category.rows.map((row) => ({
    id: row.entryId,
    search: `${row.pair} ${row.phones}`,
    sort: { pair: row.pair, state: row.position, payment: PAYMENT_LABELS[row.paymentState] },
    filters: { status: row.status, payment: row.paymentState },
    cells: {
      pair: (
        <span className="flex flex-col">
          <span className="font-semibold">{row.pair}</span>
          <span className="text-xs text-fg-muted">
            {row.levels}
            {row.phones ? ` · ${row.phones}` : ''}
          </span>
          {row.note ? <span className="text-xs">{row.note}</span> : null}
        </span>
      ),
      state: row.stateText,
      payment: <PaymentBadge state={row.paymentState} />,
      hours: (
        <span className="text-sm">
          {row.hoursText}
          {row.approved ? ' Aprobado por el club.' : ''}
        </span>
      ),
      actions: (
        <span className="flex flex-wrap justify-end gap-2">
          {acceptsCash && row.status === 'active' && row.paymentState === 'pending' && row.due > 0 ? (
            <ActionForm action={cashAction} submitLabel={`Cobrar ${formatPrice(row.due)}`} pendingLabel="Registrando…" variant="secondary">
              <input type="hidden" name="entryId" value={row.entryId} />
              <input type="hidden" name="amount" value={row.due} />
            </ActionForm>
          ) : null}
          {editable ? (
            <>
              <Button variant="ghost" onClick={() => onAction('hours', row)}>
                Horarios
              </Button>
              <Button variant="ghost" onClick={() => onAction('move', row)}>
                Mover
              </Button>
              <Button variant="ghost" onClick={() => onAction('remove', row)}>
                Quitar
              </Button>
            </>
          ) : null}
        </span>
      ),
    },
  }))

  return (
    <DataTable
      caption={`Parejas de ${category.name}`}
      columns={COLUMNS}
      rows={rows}
      searchLabel="Buscar por nombre o teléfono"
      initialSort={{ key: 'state', dir: 'asc' }}
      filters={[
        {
          key: 'status',
          label: 'Estado',
          options: [
            { value: 'active', label: 'Con lugar' },
            { value: 'waiting', label: 'En espera' },
          ],
        },
        {
          key: 'payment',
          label: 'Pago',
          options: (['pending', 'reported', 'paid', 'none'] as const).map((state) => ({ value: state, label: PAYMENT_LABELS[state] })),
        },
      ]}
      emptyText="Todavía no hay parejas en esta categoría."
    />
  )
}
```

- [ ] **Step 5: "Cargar pareja"**

`components/championships/add-pair-sheet.tsx`:
```tsx
'use client'

import { PairPlayerFields } from '@/components/championships/pair-player-fields'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import type { MemberOption } from '@/lib/domain/members'

// Design: "Cargar pareja": reception loads a whole pair (members, people from outside or one of each).
export function AddPairSheet({
  categories,
  members,
  action,
  onClose,
  onDone,
}: {
  categories: { id: string; name: string }[]
  members: MemberOption[]
  action: FormAction
  onClose: () => void
  onDone: (message: string) => void
}) {
  return (
    <BottomSheet open onClose={onClose} title="Cargar pareja">
      <ActionForm action={action} submitLabel="Cargar pareja" pendingLabel="Cargando…" onDone={onDone}>
        <Field label="Categoría" htmlFor="pair-category">
          <select id="pair-category" name="categoryId" className={inputClasses}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        <PairPlayerFields prefix="player1" legend="Jugador 1" members={members} />
        <PairPlayerFields prefix="player2" legend="Jugador 2" members={members} />
        <Field label="Nota (opcional)" htmlFor="pair-note">
          <textarea id="pair-note" name="note" rows={2} maxLength={300} className={cn(inputClasses, 'py-2')} />
        </Field>
      </ActionForm>
    </BottomSheet>
  )
}
```

- [ ] **Step 6: The board**

`components/championships/pairs-board.tsx`:
```tsx
'use client'

import { useCallback, useState } from 'react'
import { AddPairSheet } from '@/components/championships/add-pair-sheet'
import { PairsTable, type PairAction } from '@/components/championships/pairs-table'
import { UnavailabilitySheet } from '@/components/championships/unavailability-sheet'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Field, inputClasses } from '@/components/ui/field'
import type { PairRow, PairsCategory } from '@/lib/domain/championship-pairs'
import type { Block } from '@/lib/domain/championships'
import type { MemberOption } from '@/lib/domain/members'

export type PairsActions = { cash: FormAction; remove: FormAction; move: FormAction; add: FormAction; hours: FormAction }

type Sheet = { kind: 'add' } | { kind: PairAction; row: PairRow; categoryId: string }

// Design: "Gestión": a table of pairs per category, the waiting line in it, and "Cargar pareja". editable: until
// the draw (registration or closed).
export function PairsBoard({
  categories,
  editable,
  acceptsCash,
  members,
  blocks,
  actions,
}: {
  categories: PairsCategory[]
  editable: boolean
  acceptsCash: boolean
  members: MemberOption[]
  blocks: Block[]
  actions: PairsActions
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setSheet(null), [])
  const done = useCallback((message: string) => {
    setSheet(null)
    setNotice(message)
  }, [])
  const targets = sheet && sheet.kind === 'move' ? categories.filter((category) => category.id !== sheet.categoryId) : []

  return (
    <section aria-labelledby="parejas" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="parejas" className="font-display text-2xl font-bold uppercase">
          Parejas
        </h2>
        {editable && categories.length > 0 ? <Button onClick={() => setSheet({ kind: 'add' })}>Cargar pareja</Button> : null}
      </div>
      {notice ? (
        <p role="status" className="rounded-xl border border-accent bg-surface p-3">
          {notice}
        </p>
      ) : null}
      {categories.map((category) => (
        <section key={category.id} aria-labelledby={`categoria-${category.id}`} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h3 id={`categoria-${category.id}`} className="font-display text-xl font-bold uppercase">
              {category.name}
            </h3>
            <span className="text-sm text-fg-muted tabular-nums">{category.spots}</span>
          </div>
          <PairsTable
            category={category}
            editable={editable}
            acceptsCash={acceptsCash}
            cashAction={actions.cash}
            onAction={(kind, row) => setSheet({ kind, row, categoryId: category.id })}
          />
        </section>
      ))}

      {sheet?.kind === 'add' ? (
        <AddPairSheet categories={categories} members={members} action={actions.add} onClose={close} onDone={done} />
      ) : null}
      {sheet?.kind === 'hours' ? (
        <UnavailabilitySheet
          entryId={sheet.row.entryId}
          blocks={blocks}
          selected={sheet.row.unavailable}
          note={sheet.row.hoursNote}
          max={null}
          action={actions.hours}
          onClose={close}
          onDone={done}
        />
      ) : null}
      <BottomSheet open={sheet?.kind === 'move'} onClose={close} title="Mover a otra categoría">
        {sheet?.kind === 'move' ? (
          targets.length > 0 ? (
            <ActionForm action={actions.move} submitLabel="Mover" pendingLabel="Moviendo…" onDone={done}>
              <p>{sheet.row.pair}. Si en la otra categoría no hay lugar, queda en la lista de espera.</p>
              <input type="hidden" name="entryId" value={sheet.row.entryId} />
              <Field label="Categoría" htmlFor="move-category">
                <select id="move-category" name="categoryId" className={inputClasses}>
                  {targets.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
            </ActionForm>
          ) : (
            <p>No hay otra categoría abierta.</p>
          )
        ) : null}
      </BottomSheet>
      <BottomSheet open={sheet?.kind === 'remove'} onClose={close} title="Quitar pareja">
        {sheet?.kind === 'remove' ? (
          <ActionForm action={actions.remove} submitLabel="Sí, quitar la pareja" pendingLabel="Quitando…" variant="danger" onDone={done}>
            <p>
              {sheet.row.pair} deja de estar en el campeonato. Si había pagado, aparece en Cobros para devolver, y si tenía
              lugar, entra la primera pareja en espera.
            </p>
            <input type="hidden" name="entryId" value={sheet.row.entryId} />
          </ActionForm>
        ) : null}
      </BottomSheet>
    </section>
  )
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/unit/lib/domain/championship-pairs.test.ts tests/unit/components/championships/pairs-board.test.tsx`
Expected: PASS.

- [ ] **Step 8: Put the board on the page**

In `app/(club)/club/torneos/campeonatos/[id]/page.tsx`:

Add to the imports:
```tsx
import { PairsBoard } from '@/components/championships/pairs-board'
import { saveUnavailability } from '@/lib/actions/championships'
import { loadChampionshipPhones } from '@/lib/data/championships'
import { loadMemberOptions } from '@/lib/data/members'
import { pairsCategories } from '@/lib/domain/championship-pairs'
import { championshipBlocks } from '@/lib/domain/championships'
```
(merge `championshipBlocks` into the existing import from `@/lib/domain/championships`, and `loadChampionshipPhones` into the one from `@/lib/data/championships`), add `addPair`, `movePair`, `recordChampionshipCash` and `removePair` to the import from `'../actions'`, and replace the `Promise.all` line with:
```tsx
  const [championship, courts, phones, members] = await Promise.all([
    loadChampionship(club, id),
    loadActiveCourts(club),
    loadChampionshipPhones(id),
    loadMemberOptions(club.id),
  ])
```
Then, right after the `{draft ? (…) : null}` block, add:
```tsx
      {!draft ? (
        <PairsBoard
          categories={pairsCategories(championship, phones)}
          editable={championship.status === 'registration' || championship.status === 'closed'}
          acceptsCash={club.accepts_cash && championship.status !== 'cancelled'}
          members={members}
          blocks={championshipBlocks(championship.windows)}
          actions={{ cash: recordChampionshipCash, remove: removePair, move: movePair, add: addPair, hours: saveUnavailability }}
        />
      ) : null}
```

- [ ] **Step 8b: Run everything**

Run:
```bash
npm run typecheck
npm test
npm run lint
```
Expected: PASS.

- [ ] **Step 9: Commit and push**

```bash
git add lib/domain/championship-pairs.ts components/championships/pairs-table.tsx components/championships/add-pair-sheet.tsx components/championships/pairs-board.tsx "app/(club)/club/torneos/campeonatos/[id]/page.tsx" tests/unit/lib/domain/championship-pairs.test.ts tests/unit/components/championships/pairs-board.test.tsx
git commit -m "feat(club): pairs per category: charge, move, take out, hours and load"
git push
```

---

### Task 28: Categorías con pocas parejas (fusionar o cancelar)

**Files:**
- Modify: `lib/domain/championships.ts` (agrega `smallCategoryText`)
- Create: `components/championships/small-categories.tsx`
- Modify: `app/(club)/club/torneos/campeonatos/[id]/page.tsx`
- Test: `tests/unit/lib/domain/championships.test.ts`, `tests/unit/components/championships/small-categories.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/lib/domain/championships.test.ts`, add `smallCategoryText` to the import list and append:
```ts
describe('smallCategoryText', () => {
  it('says how many pairs a category has of the ones it needs', () => {
    expect(smallCategoryText(makeCategory({ minPairs: 4, entries: [makeEntry()] }))).toBe('1 pareja de 4 mínimas')
    expect(smallCategoryText(makeCategory({ minPairs: 4 }))).toBe('0 parejas de 4 mínimas')
  })
})
```

`tests/unit/components/championships/small-categories.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SmallCategories } from '@/components/championships/small-categories'
import type { FormAction } from '@/components/ui/action-form'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })

describe('SmallCategories', () => {
  it('merges a category with too few pairs into another, or cancels it', async () => {
    const merge = vi.fn<FormAction>(ok)
    const cancel = vi.fn<FormAction>(ok)
    render(
      <SmallCategories
        categories={[{ id: 'k2', name: '5ta Damas', text: '1 pareja de 4 mínimas' }]}
        targets={[
          { id: 'k1', name: '6ta Libre' },
          { id: 'k2', name: '5ta Damas' },
          { id: 'k3', name: '4ta' },
        ]}
        actions={{ merge, cancel }}
      />,
    )
    const item = within(screen.getByRole('region', { name: 'Categorías con pocas parejas' })).getByRole('listitem')
    expect(item).toHaveTextContent('5ta Damas: 1 pareja de 4 mínimas')
    const into = within(item).getByRole('combobox', { name: 'Fusionar 5ta Damas con' })
    expect([...(into as HTMLSelectElement).options].map((option) => option.textContent)).toEqual(['6ta Libre', '4ta'])
    await userEvent.selectOptions(into, 'k3')
    await userEvent.click(within(item).getByRole('button', { name: 'Fusionar' }))
    await waitFor(() => expect(merge).toHaveBeenCalled())
    expect(Object.fromEntries(merge.mock.calls[0][1].entries())).toEqual({ categoryId: 'k2', intoId: 'k3' })
    await userEvent.click(within(item).getByRole('button', { name: 'Cancelar categoría' }))
    await waitFor(() => expect(cancel).toHaveBeenCalled())
    expect(cancel.mock.calls[0][1].get('categoryId')).toBe('k2')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/domain/championships.test.ts tests/unit/components/championships/small-categories.test.tsx`
Expected: FAIL (`smallCategoryText` no se exporta; no resuelve `small-categories`).

- [ ] **Step 3: Write the implementation**

Append to `lib/domain/championships.ts`:
```ts
// "1 pareja de 4 mínimas".
export function smallCategoryText(category: Pick<ChampionshipCategory, 'entries' | 'minPairs'>): string {
  const count = activeEntries(category).length
  return `${count} ${count === 1 ? 'pareja' : 'parejas'} de ${category.minPairs} mínimas`
}
```

`components/championships/small-categories.tsx`:
```tsx
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'

// Design: "Al cerrar, categorías con pocas parejas marcadas con Fusionar con… y Cancelar categoría".
export function SmallCategories({
  categories,
  targets,
  actions,
}: {
  categories: { id: string; name: string; text: string }[]
  targets: { id: string; name: string }[]
  actions: { merge: FormAction; cancel: FormAction }
}) {
  return (
    <section aria-labelledby="pocas-parejas" className="flex flex-col gap-3 rounded-2xl border border-accent p-4">
      <h2 id="pocas-parejas" className="font-display text-2xl font-bold uppercase">
        Categorías con pocas parejas
      </h2>
      <p className="text-sm text-fg-muted">
        No llegan al mínimo. Fusionalas con otra (las parejas que no entran quedan en espera) o cancelalas (lo cobrado queda en
        Cobros para devolver). A las parejas les llega un aviso.
      </p>
      <ul className="flex flex-col gap-3">
        {categories.map((category) => {
          const others = targets.filter((target) => target.id !== category.id)
          return (
            <li key={category.id} className="flex flex-col gap-3 rounded-xl border border-border p-3">
              <p>
                <span className="font-semibold">{category.name}</span>: {category.text}
              </p>
              {others.length > 0 ? (
                <ActionForm action={actions.merge} submitLabel="Fusionar" pendingLabel="Fusionando…" variant="secondary">
                  <input type="hidden" name="categoryId" value={category.id} />
                  <Field label={`Fusionar ${category.name} con`} htmlFor={`merge-${category.id}`}>
                    <select id={`merge-${category.id}`} name="intoId" className={inputClasses}>
                      {others.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </ActionForm>
              ) : null}
              <ActionForm action={actions.cancel} submitLabel="Cancelar categoría" pendingLabel="Cancelando…" variant="danger">
                <input type="hidden" name="categoryId" value={category.id} />
              </ActionForm>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

In `app/(club)/club/torneos/campeonatos/[id]/page.tsx`, add `smallCategories` and `smallCategoryText` to the import from `@/lib/domain/championships`, add `cancelCategory` and `mergeCategory` to the import from `'../actions'`, add:
```tsx
import { SmallCategories } from '@/components/championships/small-categories'
```
and, right before `{!draft ? (<PairsBoard …`, add:
```tsx
      {championship.status === 'closed' && smallCategories(championship).length > 0 ? (
        <SmallCategories
          categories={smallCategories(championship).map((category) => ({
            id: category.id,
            name: category.name,
            text: smallCategoryText(category),
          }))}
          targets={openCategories(championship).map((category) => ({ id: category.id, name: category.name }))}
          actions={{ merge: mergeCategory, cancel: cancelCategory }}
        />
      ) : null}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/lib/domain/championships.test.ts tests/unit/components/championships/small-categories.test.tsx
npm run typecheck
npm test
npm run lint
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/championships.ts components/championships/small-categories.tsx "app/(club)/club/torneos/campeonatos/[id]/page.tsx" tests/unit/lib/domain/championships.test.ts tests/unit/components/championships/small-categories.test.tsx
git commit -m "feat(club): merge or cancel categories with too few pairs"
```

---

### Task 29: Inscripciones en Cobros

**Files:**
- Modify: `lib/domain/payments-overview.ts:31` (`MoneyKind`)
- Modify: `app/(club)/club/cobros/money-table.tsx:22` (`MONEY_KIND_LABELS`)
- Modify: `lib/data/payments.ts`
- Modify: `app/(club)/club/cobros/page.tsx`
- Test: `tests/unit/app/cobros/money-table.test.tsx`

- [ ] **Step 1: Write the failing test**

In `tests/unit/app/cobros/money-table.test.tsx`, add one more item at the end of `ITEMS`:
```ts
  { id: 'c1', kind: 'championship', holder: 'Diego y Eva', what: 'Campeonato Primavera · 6ta Libre', when: 'sábado 17 de octubre, 08:00', at: 4,
    amount: 2000, action: { label: 'Cobrar en efectivo', fields: { entryId: 'c1', amount: '2000' } } },
```
replace every `actions={{ booking: done, tournament: done, day_use: done }}` with:
```tsx
actions={{ booking: done, tournament: done, day_use: done, championship: done }}
```
and add inside `describe('MoneyTable', …)`:
```tsx
  it('lists the pairs of a championship as one more kind', async () => {
    render(<MoneyTable caption="Jugado sin pagar" items={ITEMS} amountLabel="Debe" actions={{ booking: done, tournament: done, day_use: done, championship: done }}
      emptyText="Nada" />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'championship')
    const pair = screen.getByRole('cell', { name: /Diego y Eva/ }).closest('tr') as HTMLElement
    expect(pair).toHaveTextContent('Campeonato')
    expect(pair).toHaveTextContent('6ta Libre')
  })
```
(The existing `'filters by kind and sorts by amount'` test still holds: sorting by amount ascending keeps Bruno Silva, $400, first.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/app/cobros/money-table.test.tsx`
Expected: FAIL (`'championship'` no es un `MoneyKind`; no hay opción "Campeonato" en el filtro).

- [ ] **Step 3: One more kind of money**

In `lib/domain/payments-overview.ts`, replace the `MoneyKind` line with:
```ts
export type MoneyKind = 'booking' | 'tournament' | 'day_use' | 'championship'
```

In `app/(club)/club/cobros/money-table.tsx`, replace `MONEY_KIND_LABELS` with:
```ts
export const MONEY_KIND_LABELS: Record<MoneyKind, string> = {
  booking: 'Reserva',
  tournament: 'Torneo',
  day_use: 'Day use',
  championship: 'Campeonato',
}
```

- [ ] **Step 4: Read the championships in Cobros**

In `lib/data/payments.ts`:

Add to the imports:
```ts
import {
  championshipRefunds,
  overviewStartsAt,
  unpaidChampionshipEntries,
  type UnpaidChampionshipItem,
} from '@/lib/domain/championship-payments'
```
Add `unpaidChampionships: UnpaidChampionshipItem[]` to `PaymentsOverview`:
```ts
export type PaymentsOverview = {
  transfers: ReportedTransfer[]
  unpaid: UnpaidItem[]
  unpaidEntries: UnpaidEntryItem[]
  unpaidPasses: UnpaidPassItem[]
  unpaidChampionships: UnpaidChampionshipItem[]
  refunds: (RefundItem & { kind: MoneyKind })[]
}
```
Add after `PASS_SELECT`:
```ts
const CHAMPIONSHIP_SELECT =
  'id, name, status, windows:championship_windows!championship_windows_championship_in_club(on_date, from_time), categories:championship_categories!championship_categories_championship_in_club(id, name, price, status, entries:championship_entries!championship_entries_category_in_club(id, status, player1:players!championship_entries_player1_in_club(name), player2:players!championship_entries_player2_in_club(name), payments!payments_championship_entry_in_club(id, status, amount)))'
```
In the `reported` query, append to its select string (inside the same quotes, after the `pass:…` embed):
```
, pair:championship_entries!payments_championship_entry_in_club(category:championship_categories!championship_entries_category_in_club(name, championship:championships!championship_categories_championship_in_club(name, windows:championship_windows!championship_windows_championship_in_club(on_date, from_time))))
```
Add one more query to the `Promise.all` (and `championships` to the destructured names after `passes`):
```ts
    // Championships created in the last 180 days: a pair pays or gets money back around its dates.
    supabase
      .from('championships')
      .select(CHAMPIONSHIP_SELECT)
      .eq('club_id', club.id)
      .neq('status', 'draft')
      .gt('created_at', new Date(now.getTime() - 180 * 86_400_000).toISOString()),
```
with its error check next to the others:
```ts
  if (championships.error) throw championships.error
```
In the `transfers` mapping, read the championship of a pair's transfer and use it for `startsAt` and `courtName`:
```ts
    transfers: reported.data.map((payment) => {
      const tournament = payment.entry?.tournament ?? null
      const pass = payment.pass ?? null
      const category = payment.pair?.category ?? null
      const championship = category?.championship ?? null
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
              : championship
                ? overviewStartsAt(championship, club.timezone)
                : null,
        courtName:
          payment.booking?.court?.name ??
          (tournament
            ? `Torneo ${tournament.name}`
            : pass
              ? (pass.product?.name ?? '')
              : championship && category
                ? `Campeonato ${championship.name} · ${category.name}`
                : ''),
        receiptUrl: payment.receipt_path ? (signedUrls.get(payment.receipt_path) ?? null) : null,
      }
    }),
```
and in the returned object add:
```ts
    unpaidChampionships: unpaidChampionshipEntries(championships.data, now, club.timezone),
```
and one more line at the end of `refunds`:
```ts
      ...championshipRefunds(championships.data, club.timezone).map((item) => ({ ...item, kind: 'championship' as const })),
```

- [ ] **Step 5: Show them in Cobros**

In `app/(club)/club/cobros/page.tsx`:

Add to the imports:
```ts
import { recordChampionshipCash } from '../torneos/campeonatos/actions'
```
Destructure `unpaidChampionships` too:
```ts
  const { transfers, unpaid, unpaidEntries, unpaidPasses, unpaidChampionships, refunds } = await loadPaymentsOverview(club)
```
Add at the end of `owed`:
```ts
    ...unpaidChampionships.map((item) => ({
      id: item.entryId,
      kind: 'championship' as const,
      holder: item.holder,
      what: item.what,
      when: when(item.startsAt),
      at: item.startsAt.getTime(),
      amount: item.due,
      ...cash('Cobrar en efectivo', { entryId: item.entryId, amount: String(item.due) }),
    })),
```
replace the `unpaid` totals line with:
```ts
    unpaid: totalsOf([...unpaid, ...unpaidEntries, ...unpaidPasses, ...unpaidChampionships], (item) => item.due),
```
replace the two `actions={{ … }}` props of the `MoneyTable`s with:
```tsx
          actions={{ booking: recordCash, tournament: recordTournamentCash, day_use: recordPassCash, championship: recordChampionshipCash }}
```
```tsx
          actions={{ booking: refundPayment, tournament: refundPayment, day_use: refundPayment, championship: refundPayment }}
```
and the two hints with:
```tsx
        hint="Turnos, torneos, campeonatos y day use de los últimos 30 días que todavía deben plata."
```
```tsx
        hint="Reservas, torneos, campeonatos o pases de day use cancelados, o jugadores que se bajaron después de pagar."
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/app/cobros
npm run typecheck
npm test
npm run lint
```
Expected: PASS. Si supabase-js infiere para `pair` una forma distinta (por ejemplo un arreglo), ajustar el acceso sin castear.

- [ ] **Step 7: Commit and push**

```bash
git add lib/domain/payments-overview.ts "app/(club)/club/cobros/money-table.tsx" lib/data/payments.ts "app/(club)/club/cobros/page.tsx" tests/unit/app/cobros/money-table.test.tsx
git commit -m "feat(cobros): championship pairs owed and to give back"
git push
```

---
## Corte 7: e2e y cierre

### Task 30: Flujo e2e: del borrador a la lista de espera

**Files:**
- Create: `tests/e2e/support/championships.ts`
- Modify: `tests/e2e/support/global-setup.ts` (limpieza de campeonatos y jugadores)
- Create: `tests/e2e/championship.spec.ts`

- [ ] **Step 1: Soporte**

`tests/e2e/support/championships.ts`:
```ts
import { adminClient, signedInClient, type TestUser } from './admin'

export type Partner = { profileId: string } | { name: string; phone: string }

// Signs a pair up through register_championship_pair, with the player's own session; both declare 5ª.
export async function registerPairAs(user: TestUser, categoryId: string, partner: Partner): Promise<{ id: string; status: string }> {
  const client = await signedInClient(user)
  const { data, error } = await client.rpc('register_championship_pair', {
    p_category_id: categoryId,
    p_my_level: 5,
    p_partner_level: 5,
    ...('profileId' in partner
      ? { p_partner_profile_id: partner.profileId }
      : { p_partner_name: partner.name, p_partner_phone: partner.phone }),
  })
  if (error) throw error
  return { id: data.id, status: data.status }
}

// Withdraws a pair, as one of its players.
export async function withdrawAs(user: TestUser, entryId: string): Promise<void> {
  const client = await signedInClient(user)
  const { error } = await client.rpc('withdraw_championship_entry', { p_entry_id: entryId })
  if (error) throw error
}

// A category of a championship, by its name (service role).
export async function categoryIdByName(championshipId: string, name: string): Promise<string> {
  const { data, error } = await adminClient()
    .from('championship_categories')
    .select('id')
    .eq('championship_id', championshipId)
    .eq('name', name)
    .single()
  if (error) throw error
  return data.id
}

// A phone no earlier run used: 09 and seven digits from the clock (a phone is one player).
export function uniquePhone(): string {
  return `09${String(Date.now() + Math.floor(Math.random() * 100_000)).slice(-7)}`
}
```

In `tests/e2e/support/global-setup.ts`, add right after the two day use lines (`day_use_passes` and `day_use_products`):
```ts
  // Championships: pairs e2e users signed up or loaded (their payments and hours go with them), the
  // championships e2e staff created (days, categories, pairs and blocked courts go with them), and the
  // players e2e users made or are.
  await check(admin.from('championship_entries').delete().in('created_by', ids))
  await check(admin.from('championships').delete().in('created_by', ids))
  await check(admin.from('players').delete().or(`created_by.in.${idList},profile_id.in.${idList}`))
```
and add to the comment at the top of `globalSetup`, after "the day use passes they created, bought or sold,": "the championships they created and the pairs and players they made,".

- [ ] **Step 2: The flow**

`tests/e2e/championship.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { clubRow, createMember } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { categoryIdByName, registerPairAs, uniquePhone, withdrawAs } from './support/championships'

// Next's dev indicator covers the bottom-left tab on mobile (fase 3a notes): navigate with page.goto.
test('campeonato: the organizer opens it, a member signs up with a partner from outside, the club charges and the line moves', async ({ page }) => {
  test.setTimeout(180_000)
  const club = await clubRow()
  // Day 20: past the booking window, so no other flow takes those courts.
  const day = addDays(localDateOf(new Date(), club.timezone), 20)
  const admin = await createMember({ name: 'Admin Campeonato', prefix: 'camp-admin', role: 'admin' })
  const ana = await createMember({ name: 'Ana Campeonato', prefix: 'camp-ana', gender: 'female' })
  const [bruno, carla, diego] = await Promise.all(
    ['Bruno', 'Carla', 'Diego'].map((name, index) => createMember({ name: `${name} Campeonato`, prefix: `camp-${index}` })),
  )

  // The organizer creates it: the data, a day of play and two categories of 2 pairs; then opens registration.
  await signInWithMagicLink(page, admin.email, '/club/torneos/campeonatos/nuevo')
  await page.getByLabel('Nombre').fill('Campeonato E2E')
  await page.getByRole('button', { name: 'Crear campeonato' }).click()
  await expect(page).toHaveURL(/\/club\/torneos\/campeonatos\/[0-9a-f-]{36}$/)
  const championshipId = new URL(page.url()).pathname.split('/').pop() ?? ''

  const days = page.getByRole('region', { name: 'Días de juego' })
  await days.getByLabel('Día').fill(day)
  await days.getByLabel('Desde').selectOption('08:00')
  await days.getByLabel('Hasta').selectOption('11:00')
  await days.getByRole('button', { name: 'Agregar día' }).click()
  await expect(days.getByRole('listitem')).toHaveCount(1)

  const categories = page.getByRole('region', { name: 'Categorías' })
  for (const name of ['6ta Libre', '5ta Damas']) {
    await categories.getByLabel('Nombre').fill(name)
    await categories.getByLabel('Mínimo de parejas').fill('2')
    await categories.getByLabel('Máximo de parejas').fill('2')
    await categories.getByRole('button', { name: 'Agregar categoría' }).click()
    await expect(categories.getByRole('listitem').filter({ hasText: name })).toBeVisible()
  }
  await page.getByRole('button', { name: 'Abrir inscripción' }).click()
  await expect(page.getByText('Inscripción abierta', { exact: true })).toBeVisible()

  // Ana signs up in 6ta Libre with a partner from outside.
  await page.context().clearCookies()
  await signInWithMagicLink(page, ana.email, `/campeonatos/${championshipId}`)
  await page.getByRole('button', { name: 'Anotarme en 6ta Libre' }).click()
  const sheet = page.getByRole('dialog', { name: 'Anotarme' })
  await sheet.getByLabel('Es de afuera').check()
  await sheet.getByLabel('Nombre y apellido').fill('Pedro Afuera')
  await sheet.getByLabel('Teléfono').fill(uniquePhone())
  await sheet.getByRole('button', { name: 'Anotarnos' }).click()
  const mine = page.getByRole('region', { name: 'Tus inscripciones' })
  await expect(mine).toContainText('Con Pedro Afuera')
  await expect(mine).toContainText('Pendiente de pago')

  // The club charges it in cash from the pairs table.
  await page.context().clearCookies()
  await signInWithMagicLink(page, admin.email, `/club/torneos/campeonatos/${championshipId}`)
  const libre = page.getByRole('region', { name: '6ta Libre' })
  const anaRow = libre.getByRole('row', { name: /Ana Campeonato y Pedro Afuera/ })
  await anaRow.getByRole('button', { name: 'Cobrar $2.000' }).click()
  await expect(anaRow).toContainText('Pagada')

  // Two more pairs through the API: the first fills the category, the second waits in line.
  const libreId = await categoryIdByName(championshipId, '6ta Libre')
  const second = await registerPairAs(bruno, libreId, { profileId: carla.id })
  expect(second.status).toBe('active')
  const third = await registerPairAs(diego, libreId, { name: 'Lucía Afuera', phone: uniquePhone() })
  expect(third.status).toBe('waiting')
  await page.reload()
  await expect(libre).toContainText('2 de 2 parejas · 1 en espera')
  await expect(libre.getByRole('row', { name: /Diego Campeonato y Lucía Afuera/ })).toContainText('En espera, puesto 1')

  // Bruno's pair withdraws: the pair in line gets the place by itself.
  await withdrawAs(bruno, second.id)
  await page.reload()
  await expect(libre).toContainText('2 de 2 parejas')
  await expect(libre).not.toContainText('en espera')
  await expect(libre.getByRole('row', { name: /Diego Campeonato y Lucía Afuera/ })).toContainText('Con lugar')
})
```

- [ ] **Step 3: Run it**

Run:
```bash
npm run db:reset
npx playwright test tests/e2e/championship.spec.ts --workers=1
```
Expected: PASS. Si falla por un selector, mirar el trace (`npx playwright show-trace test-results/…/trace.zip`) y ajustar el selector o la pantalla, no el flujo.

- [ ] **Step 4: Commit and push**

```bash
git add tests/e2e/support/championships.ts tests/e2e/support/global-setup.ts tests/e2e/championship.spec.ts
git commit -m "test(e2e): a championship from draft to the waiting line"
git push
```

---

### Task 31: Cierre

**Files:**
- Modify: `docs/features/campeonatos-inscripcion/notes.md`, `docs/features/campeonatos-inscripcion/plan.md` (revisiones)

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
Expected: todo PASS (pgTAP completo, Vitest, los once flujos e2e).

- [ ] **Step 2: Revisión de disciplina**

Run `/team-setup:discipline-check` sobre la rama y arreglar lo que encuentre en commits aparte (con su test). Si algún arreglo toca la base, va en una migración nueva `20261006000180_*.sql` con su pgTAP. Mirar en especial: que ninguna función nueva sea ejecutable por `anon` (lo cubre `integrity.test.sql`) y que los helpers `private.*` de campeonatos no los ejecute `authenticated` salvo `is_entry_player`; staff de otro club en cada RPC de campeonato (`forbidden`); el orden de bloqueo campeonato → pagos → pareja en bajas y cancelaciones contra `confirm_payment` (pago → pareja); que `players.phone` y `players.email` no salgan por ninguna lectura de la API (`grep -rn "phone" lib/data app components` solo debe mostrar `championship_contacts` y los formularios); y que la página del jugador no muestre borradores (`notFound`).

- [ ] **Step 3: Notas de ejecución**

Append to `docs/features/campeonatos-inscripcion/notes.md` one dated entry per corte with the deviations from this plan (as in `../lista-de-espera/notes.md`), and to the "Plan revisions" section of this file a `v3` line if the plan changed during execution.

```bash
git add docs/features/campeonatos-inscripcion/notes.md docs/features/campeonatos-inscripcion/plan.md
git commit -m "docs: campeonatos inscripción execution notes"
git push
```

- [ ] **Step 4: PR listo**

Marcar el PR como listo desde GitHub y esperar CI en verde.
Expected: `quality` y `db-and-e2e` en verde.

- [ ] **Step 5: MANUAL (producción, después del merge)**

- MANUAL (Miguel): confirmar que `migrate.yml` aplicó `20261006000100` a `20261006000170` (`select version from supabase_migrations.schema_migrations order by version desc limit 8`) y que existe el bucket `championship-posters` (`select id, public from storage.buckets where id = 'championship-posters'`).
- MANUAL: prueba en producción con dos cuentas: el admin arma un campeonato de prueba con un día de juego lejano y una categoría, abre la inscripción (la grilla muestra "Campeonato" en esas canchas), un socio se anota con el otro como compañero (le llega el aviso en la app y por mail), recepción cobra en efectivo y lo ve en la tabla; después cancelar el campeonato y verificar que las canchas se liberan y el pago aparece en Cobros → "A devolver".

---

## Acceptance criteria

- [ ] En /club/torneos se ven campeonatos y americanos; "Nuevo campeonato" crea un borrador con nombre, reglamento, categorías por jugador y cierre opcional.
- [ ] En el borrador se agregan y quitan días de juego (dentro del horario del club, en el futuro, canchas del club, sin pisarse entre ellos) y categorías (género, categorías de referencia, mínimo y máximo de parejas, precio por pareja, formato, zonas, clasificados, duración, cabezas de serie, tercer set y punto de oro, con valores por defecto); se sube un afiche opcional.
- [ ] "Abrir inscripción" exige al menos un día y una categoría, bloquea las canchas de cada día (`courts_busy` si alguna está tomada, sin bloquear ninguna) y fija el cierre en 24 h antes del primer partido si no había uno; la grilla del club muestra esas canchas con el estilo "Campeonato" y un link al campeonato.
- [ ] En la pestaña Torneos los campeonatos aparecen arriba de los americanos; /campeonatos/[id] muestra fechas, cierre, reglamento, afiche, categorías con cupo ("9 de 12 parejas · 2 en espera") y "Anotarme"; los borradores no se ven.
- [ ] Un socio se anota con un compañero socio (buscador de perfiles públicos) o de afuera (nombre, teléfono y categoría); un teléfono es un solo jugador; nadie está dos veces en una categoría ni por encima del máximo de categorías; sin cupo la pareja queda en espera. El compañero socio recibe "Te anotaron con … en …" en la app y por mail.
- [ ] "Tus inscripciones" muestra la pareja, con lugar o el puesto en la espera, el pago ("Ya transferí" con comprobante) y "Horarios imposibles" (franjas de 2 horas, hasta el 40 %); "Darme de baja" funciona hasta el cierre.
- [ ] Una baja o una pareja quitada deja su pago confirmado en Cobros → "A devolver" (y rechaza la transferencia informada) y hace entrar sola a la primera pareja en espera, con aviso "Entraste a … desde la lista de espera".
- [ ] En la gestión, cada categoría es una tabla con búsqueda por nombre o teléfono, filtros de estado y pago y páginas; "Cobrar", "Mover", "Quitar", "Horarios" (sin tope del 40 %) y "Cargar pareja"; "Cerrar inscripción" y "Cancelar campeonato" (libera canchas, avisa y deja los pagos a devolver).
- [ ] Con la inscripción cerrada, las categorías con menos parejas que el mínimo aparecen con "Fusionar con…" (las que no entran quedan en espera, con aviso) y "Cancelar categoría" (parejas quitadas, pagos a devolver, aviso).
- [ ] Cobros lista las inscripciones: transferencias para confirmar, "Jugado sin pagar" desde que empezó el campeonato y "A devolver", con el tipo "Campeonato".
- [ ] RLS: los miembros ven los campeonatos fuera de borrador, sus días, categorías y parejas (nombres); los teléfonos solo el staff y la pareja (`championship_contacts`); pagos y horarios de una pareja solo la pareja y el staff; el staff de otro club no ve nada y recibe `forbidden`; nadie escribe directo; `anon` no ejecuta ninguna función.
- [ ] pgTAP, Vitest, lint, typecheck, build y los once flujos e2e en verde en CI.

## Plan revisions

(append-only)

- **v1 (2026-10-06)**: scaffold.
- **v2 (2026-10-06)**: plan completo en 7 cortes (Tasks 1–31) sobre el diseño aprobado. Decisiones propias en "Decisiones que este plan toma". Tests pgTAP solo con horas de la grilla del fixture; las franjas de 2 horas se piden con `test_helpers.blocks`.
